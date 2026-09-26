# S11 · Mermaid Lazy-Load Trap — Diagnosis Report

Task: S11-mermaid-lazyload-trap (read-only diagnosis; fixture untouched).
Methodology: plugin-upgrade skill, Mode A (read-only inspect/diagnose). Evidence: fixture/chunk-route.ts, fixture/console-split-chunks.txt, fixture/console-403-windows.txt, fixture/ci-note.md. No writes or migrations were performed anywhere in the benchmark repository; this report is the only output.

---

## Incident 1 — split chunks: sibling import 404s

**Evidence:** console capture shows `mermaid-chunk.js` served 200 (8.1 kB), then 404s on `src-BfvxrPJe.js` and `pie-WAS4IAKB-CQHCQWWM.js`; the maintainer's `ls` confirms only the entry chunk was shipped — the siblings never existed in the package.

**Root cause (bundler semantics, not serving):** with bundler-default code splitting, a dynamically imported entry is not a self-contained file — it is the root of a chunk graph. The bundler hoists shared/async modules (mermaid's diagram-type modules such as `pie`, plus shared vendor code) into sibling chunks and emits **static ESM `import` statements** in the entry chunk referencing them by hashed relative filenames. Those `import`s are resolved as URLs relative to the importing module at runtime, so the browser requests them from the same `/dsh-attach-input/resources/` prefix. The host route can only serve files that physically exist in the plugin's `lib/` — the maintainer shipped (or the packager only included) the single entry artifact, so every sibling import 404s. A dynamic `import()` fails as a whole when *any* module in its static dependency graph fails to load, which is why the TypeError aborts the whole feature even though the entry chunk itself loaded fine. This is also why it "worked" locally where the full build output directory was present, and failed in the shipped package.

**Build-side fix:** make the lazy chunk a single self-contained file so its graph has no external siblings — set `output.inlineDynamicImports: true` (Rollup/Vite `build.rollupOptions.output.inlineDynamicImports`) for this entry, or otherwise ensure every transitive module is inlined into the one chunk and assert at build time that the emitted entry contains no bare `import ...` specifiers pointing at files outside the bundle. (The maintainer's attempt 2 — "bundle everything into ONE self-contained chunk" — is exactly this fix, and incident 1 disappears once the package ships that one file.)

## Incident 2 — Windows-only 403: drive-letter case in the containment guard

**Evidence:** chunk-route.ts guard: `if (!file.startsWith(LIB_DIR + sep)) ... 403`; ci-note.md debug output on the failing production host:

    LIB_DIR   = "E:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib"
    realpath  = "e:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\mermaid-chunk.js"

**Exact mechanism:** the two strings differ only in the **drive-letter case** — `E:` vs `e:` — and `String.prototype.startsWith` is a byte-wise case-sensitive comparison, so a file that is plainly inside the lib directory fails the containment check and the route returns 403.

- `LIB_DIR = normalize(fileURLToPath(new URL('.', import.meta.url)))`: `fileURLToPath` converts the `file:` URL literally and **preserves the drive-letter case exactly as it appears in the module URL**. On this host the plugin was loaded via an `import.meta.url` spelled with uppercase `E:`, so `LIB_DIR` is `E:\...`.
- `realpathSync(abs)`: resolves through libuv's `uv_fs_realpath`, which canonicalizes the path against the filesystem (via `GetFinalPathNameByHandle`-style resolution). The **drive-letter case it returns is the one the filesystem/volume reports, which is not guaranteed to match the spelling used elsewhere** — on this production host it canonicalized to lowercase `e:\...`. (This is precisely why the guard applies `realpathSync` at all: to defeat symlinks/junctions — but its canonical form is only canonical per-platform, not string-equal to other Node APIs' outputs.)
- On Linux this never bites: mount paths have a single spelling, no drive letters, and every API returns the same string, so `startsWith` holds. On the maintainer's Windows laptop both spellings happened to agree (same case through the whole load path), which is why that machine passed — the bug is data-dependent on how the host was launched, not on "Windows being weird".

**Secondary hazard in the same guard (Linux would pass, Windows too):** `startsWith` without a separator boundary also accepts sibling-directory prefixes (`lib-evil\\`), though the `+ sep` suffix does cover the exact-prefix case; the real defect here is solely case sensitivity.

## Fix direction for the guard

Replace the raw string prefix comparison with a **path-relative containment test on the canonicalized path**, comparing against the canonicalized base:

```ts
const base = normalize(realpathSync(LIB_DIR))            // canonicalize BOTH sides
const file = normalize(realpathSync(abs))
const rel = relative(base, file)
if (rel === '' || isAbsolute(rel) || rel.startsWith('..' + sep) || rel === '..') {
  res.writeHead(403).end('path escapes the plugin lib'); return
}
```

Why this is robust on both platforms:

- `path.relative`/`path.isAbsolute` on Windows (`path.win32`) compare path segments **case-insensitively** when computing the common prefix, so `E:` vs `e:` no longer matters; on POSIX the same code is exact case-sensitive, matching that platform's filesystem semantics. One code path, correct per-platform behavior — no `process.platform` branching, no string lowercasing hacks.
- Canonicalizing the base through `realpathSync` as well means both operands come from the same canonicalization (same drive-letter casing, resolved links), eliminating the mixed-source comparison that caused the bug.
- `rel === ''` is rejected so the lib directory itself is not served; `..`/absolute `rel` rejects traversal and cross-drive paths (`relative('E:\\a', 'D:\\b')` returns an absolute path on win32 — correctly treated as an escape).

**One other serving requirement for dynamic import to work at all:** the route must serve the response with a **JavaScript module MIME type** (`Content-Type: text/javascript` / `application/javascript`). Module scripts loaded via dynamic `import()` are subject to the browser's strict MIME checking — a 200 response served as `text/plain` or without a JS MIME type is refused with a module MIME error and the import still fails. The route's `application/javascript; charset=utf-8` header satisfies this and must be preserved. The route must also serve every file under the prefix (it does, being a prefix route) so any residual relative imports inside served chunks resolve; the containment fix above is what makes that safe.

## Incident 3 — Ctrl+scroll resizes both diagram and pane font

**Mechanism (event-listener ordering/propagation):** the wheel event is dispatched once at the event target (inside the zoom modal, which is mounted inside the pane's DOM subtree) and then **bubbles** up the ancestor chain. Two independent listeners are registered on that propagation path — the modal's own ctrl+wheel handler (diagram zoom) and the pane's font-size handler on an ancestor (or both on a shared target such as window or the scroll container). Nothing in either handler stops propagation, so one physical Ctrl+scroll gesture runs handler 1 (diagram scale changes) and then, via bubbling, handler 2 (font size changes). It is not double delivery of the event — it is one event consumed by two uncoordinated listeners. On the maintainer's Linux CI nobody scrolled inside the modal, so the overlap was never observed.

**Ownership rule:** a composite gesture must have exactly one owner — the innermost/most specific surface under the cursor. Concretely: the modal's handler, once it decides the gesture belongs to the modal, must **claim the event with `event.stopPropagation()`** (plus `preventDefault()` to stop browser zoom) so bubbling ancestors never see it; equivalently for shared-target listeners, use a single delegated handler that resolves ownership from `event.composedPath()` and runs only the handler owning the topmost surface. Rule: the deepest registered surface under the pointer owns the gesture; every other surface must opt out, never opt in twice.

## Regression tests that would have caught incidents 1–3

1. **Bundle-graph test (incident 1):** after building the lazy entry, scan the emitted chunk(s) and assert (a) the output for the dynamic entry is exactly one file, and (b) it contains no import/export-from specifiers resolving to files outside that file (fail on hashed sibling names like `pie-*.js`). Complement with an integration test: serve the built lib/ through the real route in a test server, perform `await import(url)` from a module-loading harness (Node ESM or headless browser), and assert the module evaluates and exports its render entry — this fails the moment any sibling 404s.
2. **Route containment test (incident 2), parameterized by casing:** unit-test the guard with synthetic inputs covering — inside file with drive-letter case differing from the base (upper/lower), exact base directory, `../` traversal, encoded `%2e%2e`, sibling directory (`lib-evil/x.js`), non-JS extension, and a symlink/junction pointing outside; assert 200 only for the first. Run the suite on both Linux CI and a Windows runner (or force `path.win32` for the synthetic cases on Linux) so the case-mismatch row exists on every platform. Add one end-to-end test: request the real chunk through the route on Windows with an uppercase `import.meta.url` load path and assert 200 — this is the exact production shape that shipped.
3. **Gesture-ownership test (incident 3):** mount the modal inside the pane with both listeners active (font-size handler as a spy); dispatch a `WheelEvent` with `ctrlKey: true` at an element inside the modal; assert the diagram scale changed exactly once, the font-size spy was not called, and default browser zoom was prevented. Inverse case: the same event dispatched over plain pane content must hit only the font-size handler. This pins the stopPropagation / `composedPath` ownership contract.

## Pre-existing / skipped / pending

- Pre-existing failures: not collected (read-only Mode A; no build or test baseline run).
- Skipped: no migration, install, or code changes — out of scope for this read-only diagnosis; the fixture was not modified and remains unchanged.
- Pending/residual risk: the exact casing behavior of `realpathSync` drive letters is host- and volume-dependent (as the evidence shows), so the fix must not rely on re-casing one side; the `path.relative` form above is the recommended robust comparison. Verification of the fix on a real Windows Server host was not possible from this environment.
- Rollback: not applicable (no changes made).