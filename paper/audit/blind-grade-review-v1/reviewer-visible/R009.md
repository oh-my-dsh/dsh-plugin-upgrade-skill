# S11 · Mermaid Lazy-Load Trap — Diagnostic Report

Plugin: `@org/dsh-attach-input` v0.4.0 (lib-only bundle, lazily imported mermaid chunk served by a host prefix route). Evidence: `fixture/chunk-route.ts`, `fixture/console-split-chunks.txt`, `fixture/console-403-windows.txt`, `fixture/ci-note.md`. Mode A (read-only inspection) of the plugin-upgrade skill; nothing in the fixture was modified.

---

## 1. Incident 1 — why default code-splitting broke the lazy chunk

**Evidence.** `console-split-chunks.txt`: `mermaid-chunk.js` → 200 (8.1 kB), but its two sibling imports `./src-BfvxrPJe.js` and `./pie-WAS4IAKB-CQHCQWWM.js` → 404, then `TypeError: Failed to fetch dynamically imported module` and the plugin's own fallback log `[dsh-attach-input] mermaid chunk fell back to code block`. The capture's `ls` note says it directly: "`mermaid-chunk.js` WAS present; the sibling files listed in its import statements were NOT shipped with the package."

**Mechanism.** The bundler's default code-splitting does not emit one file per dynamic entry. A dynamic entry that shares modules with other entries (or contains multiple internal dynamic parts, e.g. mermaid's per-diagram modules like `pie`) is split into a chunk *graph*: the entry chunk plus shared/sibling chunks, referenced from inside `mermaid-chunk.js` with relative static/dynamic imports resolved against the chunk's own URL at runtime. The packager shipped only the single entry chunk (`mermaid-chunk.js`) into `lib/`; the browser fetched it fine (200), evaluated it, tried the relative imports `./src-BfvxrPJe.js` / `./pie-WAS4IAKB-CQHCQWWM.js` at the same URL base, and got 404 because those files were never packaged. A dynamic import fails as a unit: any 404 anywhere in its module graph rejects the outer `import()` promise, so the whole diagram falls back.

**Build-side fix.** Make the emitted artifact genuinely self-contained: bundle the mermaid entry with code-splitting disabled for that build — Rollup `output.inlineDynamicImports: true` (or an equivalent single-file/`manualChunks`-disabled configuration in the bundler in use) — so one 7.2 MB self-contained chunk is emitted and nothing is referenced outside it. Alternatively, ship *every* emitted chunk of that entry graph in `lib/` and keep splitting — but for a lib-only plugin package the single-file build is the correct fix because the packaging step must not need to track a bundler-emitted chunk manifest. (Attempt 2 in the fixture did exactly this: one self-contained 7.2 MB chunk.)

## 2. Incident 2 — the exact flaw in the containment guard (Windows 403, Linux passes)

**Evidence.** `console-403-windows.txt`: `GET .../resources/mermaid-chunk.js 403`, and "the route log shows the guard branch fired ('path escapes the plugin lib') — for a path that is plainly inside the lib directory." `ci-note.md` prints the smoking gun from the production host:

- `LIB_DIR   = "E:\\dsh\\profiles\\web\\node_modules\\@org\\dsh-attach-input\\lib"` (uppercase `E:`)
- `realpath  = "e:\\dsh\\profiles\\web\\node_modules\\@org\\dsh-attach-input\\lib\\mermaid-chunk.js"` (lowercase `e:`)

**Mechanism.** The guard is `realpathSync(abs).startsWith(LIB_DIR + sep)`. On Windows:

- `path.win32.normalize()` (applied to `LIB_DIR` from `import.meta.url`) is a *lexical* operation: it preserves the drive-letter case exactly as written in the input URL — here uppercase `E:`.
- `fs.realpathSync()` resolves through the OS (`GetFinalPathNameByHandle` semantics) and returns the drive-letter case **as recorded for the volume/mount**, which is a property of how the volume was mounted, not of the string you asked with. On this Windows Server 2022 host the `E:` volume's canonical case is lowercase `e:`.
- `String.prototype.startsWith` is a case-sensitive byte-wise comparison. `"e:\\..." .startsWith("E:\\...")` → `false`, so a perfectly contained path is classified as an escape → 403.

On Linux this cannot happen: POSIX paths are case-sensitive and `realpathSync` returns the same casing that was passed in, so the two sides always agree — which is why the Linux CI is green. On the maintainer's Windows 11 laptop it passed only by luck: that machine's tooling reported `c:` lowercase on *both* sides (the `ci-note.md` row literally notes "lowercase c:\ in some tooling"), so the case-sensitive comparison happened to match. The maintainer's takeaway "Windows paths are unreliable" is wrong — the comparison, not the platform, is unreliable: Windows path *semantics* are case-insensitive, and the code compares them case-sensitively.

## 3. Fix direction for the guard + the other serving requirement

**Comparison fix.** Replace the raw `startsWith(LIB_DIR + sep)` on both the lexical and the realpath check with a containment test that is case-insensitive on Windows and normalization-agnostic:

- Preferred: `const rel = relative(LIB_DIR, resolved)`; escape iff `rel === ''` is not the goal (that's the dir itself) — escape iff `rel` is `''`... precisely: reject when `rel.startsWith('..' + sep) || isAbsolute(rel) || normalize(resolved).toLowerCase() === normalize(LIB_DIR).toLowerCase()`-style checks — i.e. compute `path.relative(LIB_DIR, file)` and require the result to be a non-empty, non-`..`-prefixed, non-absolute relative path.
- If `startsWith` is kept, lower-case both sides first (compare `.toLowerCase()` on both operands, still with the `+ sep` suffix to block the `lib-evil` sibling-prefix false positive). On POSIX, lowering case is harmless for correctness of the guard here and keeps one code path.

This is robust on both platforms because `path.relative`/`win32` semantics already handle drive, separator, and `..` normalization, and case-folding both operands matches Windows's case-insensitive filesystem identity while remaining correct on case-sensitive POSIX. Apply the same fix to *both* guard sites in the handler (the lexical `abs` check and the `realpathSync` check — the realpath one is the one that fired).

**The other serving requirement.** For a dynamic `import()` to work at all, the response must come back with a JavaScript MIME type — module scripts are strictly MIME-checked, and `application/javascript; charset=utf-8` (as the route sets) is required; a text/plain or HTML error page body would make the browser reject the module even on HTTP 200. Equally, the route must serve **every** module of the chunk graph under the exact relative URLs the chunk references: the failed attempt 1 shows the imports are relative (`./pie-WAS4IAKB-….js`), so the `RESOURCE_PREFIX` route must resolve those sibling paths to real files in the same directory — which is only possible once the build is single-file (§1) or all siblings are shipped.

## 4. Incident 3 — Ctrl+scroll zooms the diagram AND resizes the pane font

**Mechanism.** A single Ctrl+wheel gesture produces one `wheel` event (per tick) that is dispatched to the innermost element under the pointer — inside the fullscreen zoom modal, the diagram element — and then **bubbles** up through the modal to the pane and document roots. The web client's font-size handler is a pane/document-level Ctrl+wheel listener; the modal's zoom handler is a listener on (or under) the modal element. Both listeners are on the propagation path of the *same* event object, and nothing claims the gesture: the modal handler neither stops propagation nor prevents default, so after it scales the diagram, the event continues bubbling and the client handler also adjusts the pane font size. Listener ordering does not save you here — even if the modal handler runs first, both run unless propagation is stopped.

**Ownership rule.** One gesture, one owner. While the fullscreen modal is open, it owns Ctrl+wheel exclusively: the modal's listener must call `event.preventDefault()` (to suppress the browser's own Ctrl+scroll zoom) and `event.stopPropagation()` (so the bubbled event never reaches the pane/document font-size handler). Symmetrically, the host-side font-size handler should ignore events whose target is inside a modal that declared ownership (target-containment check). The rule to record: the innermost open modal surface claims the wheel gesture; a root-level convenience handler defers to any modal that handles it, never stacking two responses to one gesture.

## 5. Regression tests that would have caught incidents 1–3

1. **Chunk self-containment (incident 1).** A build-output test: after building the mermaid entry, parse the emitted chunk for `import(...)` and `from './…'` specifiers and assert every referenced relative module exists inside the packaged `lib/` directory (or, stronger, assert the bundler config yields exactly one emitted chunk with `inlineDynamicImports`). A packaging test that ships `lib/` and statically imports the chunk in Node would also have surfaced the missing siblings as module-not-found before any browser ran.
2. **Route containment across path casing (incident 2).** Route-level unit tests for the guard: (a) request a real file under `lib/` and assert 200 even when the computed `realpath` casing differs from `LIB_DIR` — inject a mocked `realpathSync` returning `e:\\...\\mermaid-chunk.js` against `LIB_DIR = "E:\\...\\lib"` so the test is deterministic on every platform, including Linux CI; (b) keep the security assertions: `../` traversal (`%2e%2e%2f`) and an absolute path outside the lib still return 403, and a sibling-prefix directory (`lib-evil\\x.js`) does not pass; (c) non-GET → 405, non-JS → 404, and assert the 200 response's `content-type` is `application/javascript` (§3 MIME requirement). A cold real-host check on a Windows runner (or the CI matrix row "Windows Server, uppercase drive") would have caught it end-to-end.
3. **Wheel-ownership test (incident 3).** A DOM/interaction test: mount the modal and the pane font-size handler; dispatch a `Ctrl+wheel` event with target inside the modal; assert the diagram scale changed **and** the pane font-size variable is unchanged, and that exactly one handler consumed the gesture (spy counts: 1 zoom call, 0 font-size calls). A companion assertion that `preventDefault` was called covers the browser page-zoom side.

---

### Summary table

| Incident | Root cause | Fix | Regression test |
|---|---|---|---|
| 1 · sibling 404s | Bundler default code-splitting emitted sibling chunks not shipped in `lib/`; any 404 in the import graph rejects the whole `import()` | Single self-contained chunk (`inlineDynamicImports`) or ship the full chunk graph | Build-output test asserting no unshipped relative imports |
| 2 · Windows 403 | `realpathSync()` returns the volume's canonical drive case (`e:`) while `normalize` preserved `E:`; case-sensitive `startsWith` misclassifies a contained path | Case-insensitive containment via `path.relative` (or lower-cased `startsWith` + `sep`), at both guard sites | Guard unit test with casing-mismatched mocked realpath + traversal still 403 + MIME assertion |
| 3 · double zoom | One `wheel` event bubbles from modal to pane; both handlers are on its propagation path; no ownership claimed | Modal owns the gesture: `preventDefault()` + `stopPropagation()`; root handler defers to open modals | Interaction test: one gesture, diagram zooms, font size unchanged |
