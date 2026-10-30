# S11 · Mermaid Lazy-Load Trap — Root-Cause Report

**Mode:** A · inspect (read-only). All conclusions are derived from the fixture evidence pack
(`fixture/`, left unchanged) plus local read-only verification of the platform primitives in
play. No source was modified, no migration/install executed. No DSH-version-corridor reference
cards are on-point here — these are three self-contained bundler / filesystem / DOM-event bugs,
so no card IDs are cited.

---

## 1. Incident 1 — split chunks: why the sibling imports 404

**Symptom** (evidence `fixture/console-split-chunks.txt`): the entry chunk `mermaid-chunk.js`
loads (200, 8.1 kB), then every diagram-specific import `./pie-WAS4IAKB….js`,
`./src-BfvxrPJe.js` … returns 404, and the whole import falls back to a code block. The `ls`
note states plainly: the sibling files listed in the entry chunk's import statements were
**not shipped** — only `mermaid-chunk.js` was present in `lib/`.

**Root cause:** the bundler's default code-splitting turned the single logical mermaid bundle
into a **chunk graph**, not one file. Mermaid lazily imports its diagram renderers (pie,
flowchart, sequence, …) with dynamic `import()`, so the bundler emitted one small facade entry
chunk (`mermaid-chunk.js`, 8.1 kB) whose body is mostly `import("./pie-….js")` statements
pointing at ~97 sibling chunks. The maintainer published **only the facade**. The browser
resolves each sibling specifier **relative to the facade's own URL**
(`/dsh-attach-input/resources/mermaid-chunk.js` → `…/resources/pie-….js`), and 404s because
nothing is there. A dynamically-imported chunk is therefore not self-contained: its sibling
imports must be colocated and shipped under the same served prefix, or the chunk graph is
broken at runtime (browser: "Failed to fetch dynamically imported module").

**Build-side fix:** make the lazily-imported bundle a **single self-contained file** — inline
every dynamic import into the one output chunk so no sibling files exist to 404:

    // Rollup / Vite
    output: { inlineDynamicImports: true }   // Vite: build.rollupOptions.output.inlineDynamicImports

    // webpack
    optimization: { splitChunks: false, runtimeChunk: false }

    // no manualChunks, single entry; the emitted artifact is one self-contained chunk

Alternative (if splitting must be kept): ship the **entire emitted chunk graph** into `lib/`
preserving the exact hashed filenames — but that is exactly what broke; inlining is the robust
choice and is precisely what attempt 2 adopted.

---

## 2. Incident 2 — the exact flaw in the containment guard (Windows 403)

**Symptom** (evidence `fixture/ci-note.md`, `fixture/console-403-windows.txt`): Linux CI and
Windows 11 (C:) pass; Windows Server 2022 with DSH on E: 403s every chunk GET, and the guard's
own log says "path escapes the plugin lib" for a file that is plainly inside it. The
maintainer printed:

    LIB_DIR  = "E:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib"
    realpath = "e:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\mermaid-chunk.js"

**The flaw** is the second containment check in `fixture/chunk-route.ts`:

    file = normalize(realpathSync(abs))
    if (!file.startsWith(LIB_DIR + sep)) { res.writeHead(403).end('path escapes the plugin lib'); return }

It compares a filesystem-canonicalized path against a lexically-derived root using
`String.prototype.startsWith` — a **byte-for-byte, case-sensitive** comparison — on a
case-insensitive filesystem.

**Mechanism, API by API (not "Windows is different"):**

| API | What it does | Linux | Windows (production host) |
|---|---|---|---|
| `fileURLToPath(new URL('.', import.meta.url))` → `normalize` → `join` | pure lexical string ops; no I/O; case-preserving | `/…/lib/` (no drive letter) | `E:\…\lib` — keeps the `E:` casing exactly as encoded in `import.meta.url` |
| `fs.realpathSync(abs)` | the only FS-backed call: resolves to the OS-canonical path | `realpath(3)` resolves symlinks and returns on-disk casing byte-for-byte; no drive letter; case-sensitive FS, so lexical and canonical strings coincide | resolves through the NT object manager (`GetFinalPathNameByHandleW`, via libuv) and returns the drive-letter casing from the volume device mapping, not the caller's string → **lowercase `e:`** |
| `String.prototype.startsWith` | case-sensitive substring check | passes (strings match) | `"e:\…".startsWith("E:\…\lib\")` → **false** → 403 |

So the root cause is **asymmetric canonicalization**: one operand is lexical (uppercase `E:`),
the other is OS-canonical (lowercase `e:`), and the case-sensitive prefix test collapses that
casing-only difference into a false "escape" verdict. (The first, lexical guard
`abs.startsWith(LIB_DIR + sep)` is fine for `..` traversal because `join`/`normalize` collapse
`..` before it runs; only the post-`realpath` guard misbehaves.)

Local verification on this Windows host confirmed the primitives: `startsWith` returns false
for an `e:` vs `E:` prefix, while `path.win32.relative` resolves that same pair to the in-tree
relative path `mermaid-chunk.js`.

---

## 3. Fix direction for the guard + the other serving requirement

**Fix — replace the string-prefix test with a relative-path test on a canonical root:**

    const root = realpathSync(LIB_DIR)     // canonicalize the root ONCE, same API as the file
    const rel  = relative(root, file)      // win32 relative lowercases both operands
    const escaped = rel === '' || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)
    if (escaped) { res.writeHead(403).end('path escapes the plugin lib'); return }

Why it is robust on both platforms:

    * path.relative on win32 lowercases both paths before comparing the common prefix, so
      drive-letter (E: vs e:) and path-component casing differences are normalized away —
      matching Windows' case-insensitive FS. On POSIX it is case-sensitive, matching a
      case-sensitive FS. One idiom, correct on both.
    * Canonicalizing the root with the same realpathSync as the file removes the
      lexical-vs-canonical asymmetry that produced the mismatch.
    * Rejecting rel === '..', rel.startsWith('..' + sep), and isAbsolute(rel) (cross-drive
      results) is the correct traversal/symlink-escape check.

Minimal alternative: canonicalize both sides via `realpathSync` before `startsWith`, or
lowercase the comparison on win32 only — but `path.relative` is the platform-correct idiom.

**Other serving requirement for a dynamic `import()` to work at all:** the response must carry
a **JavaScript MIME type** — `Content-Type: application/javascript` (or `text/javascript`). A
dynamic import rejects any non-JS MIME ("Failed to fetch dynamically imported module … MIME
type …") and also fails on a 200 HTML error page. The route already sets
`application/javascript; charset=utf-8`; any fix must keep it. (Served same-origin at
`127.0.0.1:3080`, so no CORS header is needed here; a CDN/other-origin host would additionally
require `Access-Control-Allow-Origin`.)

---

## 4. Incident 3 — Ctrl+scroll zoom modal fires both handlers

**Why both handlers fire on one gesture:** one physical Ctrl+scroll produces **one** `wheel`
event, not two. The fullscreen zoom modal is still a **DOM descendant of the reading pane**
(an overlay nested inside the pane's subtree), and there are two `wheel`+`ctrlKey` listeners:
the modal's diagram-zoom handler (deeper) and the pane's font-resize handler (an ancestor, or
on `window`/`document`). The event is dispatched to the element under the cursor inside the
modal and then **bubbles** target → modal → pane. Because **neither handler calls
`stopPropagation()`**, the same event object reaches *both* bubble-phase listeners and each
mutates the DOM (diagram scale **and** pane font size). `preventDefault()` — which the modal
correctly uses to suppress the browser's native Ctrl+wheel page zoom — does **not** stop
propagation, so it cannot prevent the double-fire.

**Ownership rule that fixes it:** *one gesture, one owner; the innermost surface that owns the
gesture must consume it and stop propagation.* The modal's zoom handler must call
`event.stopPropagation()` (and keep `preventDefault()`, with the listener registered
`{ passive: false }` so `preventDefault()` is honoured) so the event never reaches the ancestor
pane handler. Defensively, the pane handler should also bail when the event originates inside
the modal (`if (e.target.closest('[data-zoom-modal]')) return`), but the canonical rule is that
the more-specific surface owns the event and stops it.

---

## 5. Regression tests that would have caught incidents 1–3

**Incident 1 (chunk graph):**

    1. Build-output completeness test — after build, scan the emitted `mermaid-chunk.js` (and
       any entry) for relative `import("./…")` / `import("…")` specifiers and assert every
       referenced sibling file exists under the shipped `lib/` dir; fail on any dangling
       reference. Equivalently, with `inlineDynamicImports: true`, assert the output is exactly
       one JS chunk containing zero remaining relative dynamic-import statements.
    2. Headless-browser smoke test — render one fence per diagram type (flowchart, sequence,
       class, state, pie, gantt, er) and assert the network log has zero 404s, the "Failed to
       fetch dynamically imported module" fallback never fires, and each diagram's SVG is
       inserted.

**Incident 2 (containment guard / case-insensitive paths):**

    3. Guard unit test with case mismatch — call the route handler (or the extracted guard)
       with `realpathSync` stubbed to return a differently-cased drive letter (e: vs E:) and
       assert it allows the file (no 403). This fails against the current `startsWith` guard on
       any platform and passes after the `path.relative` fix.
    4. Windows leg in CI — the maintainer's matrix had Windows 11 on C: but not the
       Windows-Server/E: shape that failed; add a Windows case-mismatch case (or simulate it
       via the stub in #3, which is platform-independent).
    5. Route integration test — serve a real file and assert 200 + Content-Type:
       application/javascript + exact bytes; assert /../ traversal and a symlink/junction
       escape both return 403/404.

**Incident 3 (event ownership):**

    6. DOM behavior test — mount the pane with the zoom modal open; dispatch a synthetic
       `WheelEvent` with `ctrlKey: true` on an element inside the modal; assert the diagram
       scale/transform changed but the pane font size did not (and the pane handler did not
       run). Then dispatch the same event on the pane outside the modal and assert only the
       pane handler runs. This fails against the current code (both mutate) and passes once the
       modal handler stops propagation.

---

**Residual risk / not covered:** the exact casing `GetFinalPathNameByHandleW` returns can
differ per volume mapping, so the guard must not depend on casing at all (the `path.relative`
fix removes that dependency rather than hard-coding E/e). The modal fix assumes the modal is
nested in the pane subtree; if it were instead portaled to `document.body`, a defensive target
check in the pane handler would still be required.

