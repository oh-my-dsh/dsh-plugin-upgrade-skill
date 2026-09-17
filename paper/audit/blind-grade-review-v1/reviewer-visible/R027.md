# S11 · Mermaid Lazy-Load Trap — Diagnostic Report

Evidence pack: `environment/fixture/` — `chunk-route.ts`, `console-split-chunks.txt`, `console-403-windows.txt`, `ci-note.md`, `README.md`. All findings below are grounded in those files.

## 1. Incident 1 — why default code-splitting broke the lazy mermaid chunk

**Evidence.** `console-split-chunks.txt` (attempt 1): the bundler emitted the mermaid entry as
`mermaid-chunk.js` plus **97 siblings**. The browser fetched:

- `GET .../resources/mermaid-chunk.js  200  (8.1 kB)` — the entry chunk served fine;
- `GET .../resources/src-BfvxrPJe.js  404`
- `GET .../resources/pie-WAS4IAKB-CQHCQWWM.js  404`
- `TypeError: Failed to fetch dynamically imported module` → fallback to a plain code block.

The capture also records: "`ls` of the shipped lib/ at the time: `mermaid-chunk.js` WAS present; the sibling files listed in its import statements were NOT shipped with the package."

**Root cause.** A dynamically imported chunk is not self-contained. The bundler's default
code-splitting hoists shared modules (the `src-*` chunk) and lazily-referenced feature modules
(`pie-*`, whose name carries the content hash `-CQHCQWWM`) into **sibling chunks**, and the
emitted entry chunk references them with relative `import`/`import()` statements. When the
browser evaluates `mermaid-chunk.js`, it resolves those relative specifiers against the chunk's
own URL (`/dsh-attach-input/resources/`), so every sibling becomes another HTTP GET. Because
the plugin ships as a **lib-only bundle** and only the entry chunk was copied into `lib/`,
every sibling request 404s. A dynamic `import()` fails as a whole if any statically reachable
module in its graph fails to load — hence the single `TypeError` despite the entry chunk
itself returning 200.

**Build-side fix.** Make the lazy chunk self-contained: build the mermaid entry with code
splitting disabled for that build — Rollup/Vite `output.inlineDynamicImports: true` (or
`rollupOptions.output.manualChunks`-free single-entry build) — so mermaid and all its shared
modules are inlined into one file. That is exactly what attempt 2 did
(`console-403-windows.txt`: "single self-contained chunk (7.2 MB)").

## 2. Incident 2 — the precise guard flaw behind the Windows 403

**Evidence.** `chunk-route.ts`:

```ts
const LIB_DIR = normalize(fileURLToPath(new URL('.', import.meta.url)))  // .../lib/
...
let file
try {
  file = normalize(realpathSync(abs))
  if (!file.startsWith(LIB_DIR + sep)) { res.writeHead(403)... }   // <-- guard
} catch { res.writeHead(404)... }
```

`ci-note.md` prints the production host's debug session:

```
LIB_DIR   = "E:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib"
realpath  = "e:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\mermaid-chunk.js"
```

and `console-403-windows.txt` confirms "the route log shows the guard branch fired ('path
escapes the plugin lib') — for a path that is plainly inside the lib directory."

**Mechanism (not folklore).** The guard compares two strings that are semantically the same
Windows path but differ in drive-letter case:

- `fileURLToPath()` on Windows returns the drive letter **as written in the file URL** — for a
  module at `file:///E:/...` it yields `E:\...` (uppercase, preserved verbatim). `normalize()`
  and `join()` never change letter case.
- `fs.realpathSync()` on Windows canonicalizes the path against the actual volume and returns
  the drive letter in **the casing stored by the filesystem/volume mount** — here lowercase
  `e:\...`. (It also resolves 8.3 short names and symlinks; case is the divergence here.)

The containment check `file.startsWith(LIB_DIR + sep)` is a **case-sensitive JavaScript string
comparison** (`String.prototype.startsWith` has no case folding, and JS does not apply
Windows filesystem case-insensitivity). `"e:\\dsh\\...".startsWith("E:\\dsh\\...")` is
`false` — a file inside the lib directory is rejected with 403.

**Why Linux passes and why the laptop passed.** On Linux, `realpathSync` returns the same
byte-for-byte path the URL produced (POSIX paths have no case-equivalence mechanism to
canonicalize against), so the strings agree. The laptop row in `ci-note.md` notes DSH on
`C:\` with "lowercase c:\ in some tooling" — there, URL and realpath happened to produce the
**same** case, so the sensitive comparison still matched. Only production (uppercase `E:\` in
the URL/mount vs lowercase `e:` from realpath) exposed the divergence. The maintainer's
"Windows paths are unreliable" conclusion is wrong: the paths are fine; the **comparison** is
case-sensitive where the platform is case-insensitive.

## 3. Fix direction for the guard, plus the other serving requirement

**Fix.** Stop comparing raw string prefixes. Compute the containment relation with
`path.relative()` and judge the result — on Windows `path.win32.relative` performs its
comparison case-insensitively (it is drive-letter and component-case aware), so it is robust on
both platforms:

```ts
const rel = relative(LIB_DIR, file)
if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) { 403 }
```

(`rel === ''` rejected because serving the directory itself is not wanted; `isAbsolute(rel)`
covers cross-drive cases on Windows, where `relative` returns an absolute path.) Alternatively,
case-fold both sides on win32 before `startsWith` (`process.platform === 'win32' ? x.toLowerCase() : x`), but the `relative()` form is single-expression and platform-agnostic. Keep the
`realpathSync` step: it is what stops symlink/traversal escapes out of `lib/`.

**Other serving requirement for dynamic `import()`.** The response must carry a valid
JavaScript MIME type. ES module scripts are fetched in "script" mode with strict MIME checking —
a 200 with `text/plain` (or any non-JS type) is refused outright. The route already does this
and must keep it: `'content-type': 'application/javascript; charset=utf-8'`. (Secondarily, the
chunk must be served at the exact URL the bundler baked into `import()` — the prefix route does
that — and the response must not be HTML, e.g. an SPA fallback.)

## 4. Incident 3 — why one Ctrl+scroll fires both handlers

The zoom modal's scale handler and the markdown pane's Ctrl+scroll font-size handler are both
registered wheel listeners. A `wheel` event dispatched on the diagram **bubbles** up the DOM
from the modal's content through the pane's ancestors, so the pane's (document- or
container-level) listener also receives the same event; neither listener claims the gesture —
no `stopPropagation()` on the modal's handler — and neither is cancelled — no
`preventDefault()` — so both apply their effect (diagram scale **and** pane font size) to one
Ctrl+scroll. Two aggravating details:

- Listeners registered with `{ passive: true }` (the default-avoiding-scroll-jank choice) cannot
  call `preventDefault()` at all, so the browser's default Ctrl+wheel zoom may fire too.
- Listener **registration order across different targets does not help**: capture vs bubble at
  the shared ancestor still lets both run, since the modal listener runs first only for
  target/bubble-phase at the modal element and the pane listener sits higher in the tree.

**Ownership rule that fixes it.** A wheel gesture is owned by exactly one handler — the handler
of the **topmost interactive surface under the pointer**. Concretely: the modal registers its
Ctrl+wheel listener **non-passively** on its own root, and when it handles the gesture it calls
`event.preventDefault()` and `event.stopPropagation()` (or `stopImmediatePropagation()` when
both listeners are on the same node) so the event never reaches the pane's font-size handler;
equivalently, a single dispatch router picks the active layer (modal when open) and calls only
its handler. The modal is the gesture owner while open; the pane handler must not act on events
the modal consumed.

## 5. Regression tests that would have caught incidents 1–3

1. **Self-contained-chunk test (incident 1).** After the lib build, scan the emitted chunk's
   `import`/`import()` specifiers (static parse or `new URL(specifier, chunkUrl)` resolution)
   and assert every relative specifier resolves to a file that exists in the shipped package.
   Equivalently: bundle the lazy entry with `inlineDynamicImports: true` in CI and assert the
   lib contains exactly one JS artifact for the mermaid feature, then load it in a test DOM and
   assert `import()` resolves. This fails the attempt-1 build (siblings `src-*.js`,
   `pie-*.js` missing).
2. **Containment-guard case test (incident 2).** Extract the guard into a pure
   `isInsideLib(libDir, candidate)` function and unit-test it with same-path-different-case
   inputs — `("E:\\dsh\\...\\lib", "e:\\dsh\\...\\lib\\mermaid-chunk.js")` must be
   contained, and `("E:\\a\\lib", "E:\\a\\lib-evil\\x.js")` and a `..\\..` traversal must
   be rejected — plus a route-level test that fakes the realpath/URL divergence (inject a
   resolver or run against a symlinked/case-differing path) and asserts 200 for in-lib files.
   This fails the attempt-2 code and passes on Linux CI, where the pure-function cases still
   exercise the Windows behavior.
3. **Gesture-ownership test (incident 3).** Interaction test with the modal open: dispatch a
   `Ctrl+wheel` event on the diagram inside the modal and assert (a) the diagram scale changed
   and (b) the pane font-size value is unchanged; then dispatch with the modal closed and assert
   the pane handler still fires. This fails when the modal handler lacks
   `preventDefault()`/`stopPropagation()`.
