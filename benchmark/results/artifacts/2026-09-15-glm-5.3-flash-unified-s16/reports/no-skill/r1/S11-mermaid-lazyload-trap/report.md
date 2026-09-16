# S11 Diagnosis Report · Mermaid Lazy-Load Trap (`@org/dsh-attach-input` v0.4.0)

Evidence base: `fixture/chunk-route.ts`, `fixture/console-split-chunks.txt`,
`fixture/console-403-windows.txt`, `fixture/ci-note.md`. All fixture paths below are
cited from that read-only evidence pack (unchanged). Platform semantics claimed in
sections 2–3 were verified by executing Node's `path` module against the exact
`LIB_DIR` / `realpath` strings printed in `ci-note.md` (see Appendix A and the
accompanying `verify-path-semantics.cjs`).

---

## 1. Incident 1 — why default code-splitting broke the lazy import

**Symptom (console-split-chunks.txt):** the browser fetched
`/dsh-attach-input/resources/mermaid-chunk.js` → **200**, then immediately requested
`src-BfvxrPJe.js` and `pie-WAS4IAKB-CQHCQWWM.js` → **404**, and the whole
`import()` rejected with `Failed to fetch dynamically imported module`. The shipped
`lib/` contained `mermaid-chunk.js` but **none of the sibling files**.

**Root cause — a dynamic entry's chunk graph must be fully reachable:**

- With the bundler's default code-splitting, the dynamically imported entry
  (`mermaid-chunk.js`) is not self-contained. It carries **static import statements
  for sibling chunks** — shared vendor code (`src-BfvxrPJe.js`) and mermaid's own
  per-diagram modules, which mermaid itself lazy-imports and which the bundler split
  into hash-named chunks (`pie-…-CQHCQWWM.js`).
- The browser resolves those relative specifiers (`./pie-WAS4IAKB-CQHCQWWM.js`)
  against the entry chunk's **own URL**, i.e. against the
  `/dsh-attach-input/resources/` prefix. ES module static imports fail hard: if any
  module in the entry's transitive import graph 404s, the top-level
  `import('./mermaid-chunk.js')` promise rejects with
  `Failed to fetch dynamically imported module` — even though the entry itself
  returned 200, which is exactly the capture we see.
- The packaging step shipped only the one file the author knew about
  (`mermaid-chunk.js`) and not the other 97 emitted chunks. The route was never the
  problem in attempt 1; the **artifact set on disk was incomplete relative to the
  chunk graph**.

**Build-side fix:** make the dynamic entry **self-contained** — inline all of the
entry's split output into the single file so it emits **zero relative sibling
imports**. Concretely, set Rollup's
`output.inlineDynamicImports: true` (Vite: `build.rollupOptions.output.inlineDynamicImports`)
for this entry, which also absorbs mermaid's internal per-diagram dynamic imports
into the one chunk. (The alternative — ship the entire emitted dist directory so
every sibling is packaged and served — also works, but the single self-contained
chunk is the correct fix for a lib-only bundle and is what attempt 2 adopted.)

---

## 2. Incident 2 — the exact guard flaw behind the Windows 403

**Symptom (console-403-windows.txt):** on Windows Server 2022 with DSH on `E:\`,
`GET /dsh-attach-input/resources/mermaid-chunk.js` → **403 "path escapes the plugin
lib"** for a file that is plainly inside the lib directory. Same code is green on
Linux CI and on the maintainer's Windows 11 laptop. The debug print in
`ci-note.md` is the smoking gun:

```
LIB_DIR   = "E:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib"
realpath  = "e:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\mermaid-chunk.js"
```

**The flaw:** the guard at `chunk-route.ts` line 20 compares two strings produced by
two different APIs with a **case-sensitive** primitive:

```ts
file = normalize(realpathSync(abs))
if (!file.startsWith(LIB_DIR + sep)) { res.writeHead(403) ... }
```

The precise mechanism, API by API:

| API | Windows behavior | Result on the production host |
|---|---|---|
| `fileURLToPath(new URL('.', import.meta.url))` | Returns the path exactly as encoded in the module URL — drive-letter case preserved from the install path. Case-preserving, no canonicalization. | `E:\dsh\...\lib` (uppercase `E:`, as installed) |
| `fs.realpathSync(abs)` | Resolves to the canonical path via libuv `uv_fs_realpath` (`GetFinalPathNameByHandleW` under the hood). NTFS/Win32 is **case-insensitive but case-preserving**, and the returned drive letter takes the casing recorded on the volume's mount point — frequently lowercase — which can differ from the input casing. Node documents that the Windows realpath result may differ in case from the input. | `e:\dsh\...\lib\mermaid-chunk.js` (lowercase `e:`) |
| `String.prototype.startsWith` | Case-sensitive UTF-16 code-unit comparison; no notion of path semantics. `"e:…"`.startsWith(`"E:…"` + `"\\"`) → **false**. | Guard concludes "escape" → **403** |

`path.normalize`/`join` never change case, so nothing repairs the mismatch. Note the
route's *pre*-realpath check (`abs.startsWith(LIB_DIR + sep)`, line 16) passes by
construction — `join(LIB_DIR, rel)` always starts with `LIB_DIR` — so the 403 comes
from the *post*-realpath check, exactly where `realpathSync` rewrote the casing.
Verified against the exact ci-note strings: `startsWith` → `false` (Appendix A).

**Why each environment passed or failed (this is environment-dependent, not
"Windows folklore"):**

- **Linux CI:** POSIX paths are case-sensitive and `realpathSync` returns
  byte-identical canonical names; the module URL came from the same on-disk path, so
  the prefix matches byte-for-byte → green.
- **Maintainer's Windows 11 laptop (C:\):** the drive-letter casing that
  `fileURLToPath` saw and the casing `realpathSync` returned happened to **agree**
  (the "lowercase c:\ in some tooling" note in the CI matrix), so the accidental
  byte-equality held → green.
- **Production (E:\):** install path uppercase, volume mount casing lowercase → the
  two APIs disagreed for the first time → the case-sensitive compare misfired → 403.

So the root cause is: **a byte-exact string comparison applied to paths whose casing
is produced independently by `fileURLToPath` and `realpathSync`, on a platform whose
filesystem treats those two strings as the same path.**

---

## 3. Fix direction for the guard + the other serving requirement

### 3.1 The comparison to use

Replace the `startsWith` check with a containment check built on `path.relative`:

```ts
import { relative, isAbsolute } from 'node:path'

const isInside = (root: string, p: string): boolean => {
  const rel = relative(root, p)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}
// ...
file = normalize(realpathSync(abs))
if (!isInside(LIB_DIR, file)) { res.writeHead(403).end('path escapes the plugin lib'); return }
```

**Why this is robust on both platforms (mechanism, verified in Appendix A):**

- Node's `path` module encodes each platform's path semantics. `path.win32.relative`
  lowercases both operands when computing the common prefix — i.e. it performs a
  **case-insensitive** comparison, matching Win32/NTFS case-insensitive resolution —
  and returns the remainder of the *original-cased* target:
  `win32.relative('C:\\Foo', 'c:\\foo\\bar')` → `'bar'`.
- `path.posix.relative` compares bytes — **case-sensitive**, matching POSIX
  filesystems: `posix.relative('/data/lib', '/data/LIB/x.js')` → `'../LIB/x.js'`
  (correctly not inside).
- With the exact production strings, `win32.relative(LIB_DIR, realpath)` →
  `'mermaid-chunk.js'` → accepted. The same guard still rejects `..\..\` traversal
  (`rel === '..\\..\\secret.js'` → rejected), so the security property is preserved.
- An equivalent alternative is to case-fold both sides **only when
  `process.platform === 'win32'`** before comparing. Do *not* lowercase
  unconditionally: on case-sensitive POSIX filesystems `/data/LIB` and `/data/lib`
  are different directories, and folding could accept a path under the wrong
  directory. Delegating to `path.relative` gets the right behavior per platform with
  no flag.
- Keep `realpathSync` in place (it is what collapses symlinks/junctions to the
  canonical path) and apply the same `isInside` helper to both the pre- and
  post-realpath checks.

### 3.2 The other serving requirement for dynamic import

The route must serve each chunk with a **JavaScript MIME type**
(`Content-Type: text/javascript` / `application/javascript`). Browser module loading
enforces a **strict MIME-type check**: a response for a module script served as
`text/plain`, `application/octet-stream`, etc. is refused without execution even
with HTTP 200 ("Failed to load module script: Expected a JavaScript module script…").
The route's current `application/javascript; charset=utf-8` header (line 23) is
load-bearing and must be kept for **every** file the prefix route serves, not just
the entry chunk. (If the UI and this route ever end up on different origins,
`Access-Control-Allow-Origin` would additionally be required because module fetches
are CORS-mode requests; in the current same-origin host setup it is not needed.)

---

## 4. Incident 3 — why Ctrl+scroll zooms both the diagram and the pane font

**Root cause — two listeners on the same event's propagation path:**

- The pane's Ctrl+scroll = font-size zoom handler is registered at a high level
  (the pane container, or `window`/`document`). `wheel` events **bubble**.
- The plugin's zoom modal handles Ctrl+wheel on the diagram, but the event's target
  is a node inside the modal; the event dispatch runs target → modal ancestors →
  pane container → `window`. The modal's handler fires first (diagram zoom), calls
  `preventDefault()` — which only suppresses the *browser default* (page zoom) and
  does nothing to other listeners — but never calls `stopPropagation()`. The same
  event continues bubbling to the pane's/window's Ctrl+wheel handler, which only
  checks `ctrlKey`/`deltaY` and cannot know the gesture originated inside a modal,
  so it also adjusts the pane font size. One gesture, two handlers on one
  propagation path → both side effects. (If both handlers were registered on
  `window`, firing order is mere registration order — both still run unless one
  stops propagation.)

**Ownership rule:** one gesture, one owner — the owner is the **innermost surface
that claims the interaction**, and the owner must **consume** the event:

- The modal attaches its Ctrl+wheel listener **on the modal element itself** (not
  `window`), and in the handler calls `event.preventDefault()` **and**
  `event.stopPropagation()`. Because the modal element is below the pane/window
  listeners in the propagation path, stopping propagation there means the host's
  font-size handler never sees events that start inside the modal — no host change
  required.
- Symmetrically, any host-level handler should ignore events whose target (or
  `composedPath()`) lies inside a surface that claims the gesture (e.g. skip when
  `event.target.closest('[data-claims-wheel]')` matches). That variant is needed
  only if the host listener runs in the capture phase or is registered above the
  modal's claiming element.

---

## 5. Regression tests that would have caught incidents 1–3

**Incident 1 — chunk-graph / packaging integrity:**

1. *Build-output test:* after the build, parse every emitted chunk's import
   specifiers and assert that the lazy entry `mermaid-chunk.js` contains **zero
   relative sibling imports** (self-contained, `inlineDynamicImports` active) — or,
   if splitting is intentional, that every referenced specifier corresponds to an
   emitted file.
2. *Pack test:* produce the actual shippable artifact (`npm pack` / ship script) into
   a temp dir; for each import specifier in each shipped chunk, assert the target
   file exists in the package.
3. *Route round-trip test:* `GET` the entry chunk via the running route, extract its
   `from "./x.js"` specifiers, resolve them against the chunk URL, `GET` each one,
   assert 200 (fails on 404 exactly as the browser would).

**Incident 2 — guard correctness across platforms:**

4. *Unit test on the containment helper* using the literal ci-note pair:
   root `E:\...\lib`, child `e:\...\lib\mermaid-chunk.js` → must be **inside**
   (this exact pair reproduces the production 403 under the old `startsWith` guard).
5. *Route integration test with a stubbed `fs.realpathSync`* returning a
   differently-cased absolute path → expect **200**, not 403.
6. *Negative tests kept green:* `../` traversal, URL-encoded `%2e%2e%2f`,
   backslash/slash mixing, absolute path in `rel`, and a non-`.js` resource → 403/404
   as designed.
7. *Platform matrix:* run tests 4–6 on both Linux and Windows CI runners — turning
   the maintainer's manual ci-note table into a CI job.

**Incident 3 — gesture ownership:**

8. *Interaction test (e.g. Playwright):* open the modal, dispatch Ctrl+wheel over
   the diagram → assert diagram scale changed **and** pane font-size is unchanged.
9. *Inverse:* Ctrl+wheel over pane text (modal closed / outside modal) → font-size
   changes, diagram scale unchanged.
10. *Consumption assertion:* spy on the host window/pane wheel handler and assert it
    is **not invoked** for events targeted inside the modal (i.e. the modal handler
    stops propagation), and that `defaultPrevented` is set (browser page-zoom
    suppressed).

**Cross-cutting smoke test:** on each platform in the matrix, load a page with one
```` ```mermaid ```` fence and assert an SVG diagram rendered and no
"fell back to code block" log line appears — the single end-to-end assertion that
would have caught both the 404 (incident 1) and the 403 (incident 2) releases.

---

## Appendix A — verification of platform semantics (executed)

Script: `verify-path-semantics.cjs` (temporary file in this workspace; no fixture
file was read, modified, or executed). Output using Node's `path` module with the
exact strings from `ci-note.md`:

```
LIB_DIR          = "E:\\dsh\\profiles\\web\\node_modules\\@org\\dsh-attach-input\\lib"
realpath         = "e:\\dsh\\profiles\\web\\node_modules\\@org\\dsh-attach-input\\lib\\mermaid-chunk.js"
startsWith guard (current code)  : false          ← reproduces the production 403
win32.relative(LIB_DIR, realpath)= "mermaid-chunk.js"
relative-based guard             : true           ← proposed fix accepts the real file
win32.relative("C:\\Foo","c:\\foo\\bar") = "bar"  ← win32 relative is case-insensitive
posix.relative("/data/lib","/data/LIB/x.js") = "../LIB/x.js"  ← posix stays byte-exact
relative guard on ../ traversal  : false (want false) "..\\..\\secret.js"
win32 case-folded startsWith     : true           ← alternative fix, folded on win32 only
```
