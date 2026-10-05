# S11 — Mermaid Lazy-Load Trap: Root-Cause Report

Evidence-only analysis from the fixture pack. No external docs consulted.

## 1. Incident 1 — Split chunks: sibling 404s

`mermaid-chunk.js` (attempt 1) said **8.1 kB** and was barrel-loaded, but it statically
imports shared per-diagram chunks (`./pie-WAS4IAKB-CQHCQWWM.js`, `./src-BfvxrPJe.js`,
97 siblings) emitted next to it by the bundler's default code-splitting. Those siblings
were **not shipped in `lib/`**, so the browser fetched the entry fine, then every sibling
import 404'd; a single failed `import()` of a static child rejects the whole dynamic
import of the entry module, which is why the whole mermaid chunk "fell back to a code
block" even though the entry file itself loaded.

Build-side fix (pick one, not both):

- **Ship the complete chunk set**: after bundling, every file the entry imports (walk the
  static import graph of the emitted chunks) must be in the published `lib/`
  (`files` allowlist / copy step / `package.json` `files` field). This repairs attempt 1
  but keeps 98 network round-trips.
- **Better: emit one self-contained chunk** — force the mermaid entry to inline its own
  dynamic+static subtree: Rollup/Vite `output.inlineDynamicImports: true` (single entry),
  esbuild `splitting: false`, or `manualChunks` collapsing mermaid into a single chunk.
  That is what attempt 2 did; it then exposed incident 2.

## 2. Incident 2 — Guard yields 403 on Windows production

The guard is a case-sensitive string prefix test:

```ts
if (!file.startsWith(LIB_DIR + sep)) → 403
file = normalize(realpathSync(abs))
LIB_DIR = normalize(fileURLToPath(new URL('.', import.meta.url)))
```

From the CI note, on the production host:

```
LIB_DIR = "E:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib"
realpath = "e:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\mermaid-chunk.js"
```

- `LIB_DIR` comes from `import.meta.url` / `fileURLToPath`, which **preserves the drive
  letter case as it appears in the URL** (`E:`).
- `fs.realpathSync` on Windows resolves through libuv/`GetFinalPathNameByHandleW` and
  returns the resolved absolute path with a **lowercased drive letter** (`e:`), which is
  the well-known Node behavior on win32 (and it can additionally resolve junctions /
  8.3 names / different casing of directory components).
- Windows paths are case-**insensitive** by the OS, so `e:\...\lib\mermaid-chunk.js` and
  `E:\...\lib` denote the same file — but `String.prototype.startsWith` is an ordinal
  comparison, so `"e:\dsh...".startsWith("E:\dsh...")` is `false` → the second guard
  fires → **403 for a path plainly inside lib**.
- Linux passes because `realpath` and `LIB_DIR` are built from the same canonical POSIX
  path (case-sensitive filesystem, no drive-letter case ambiguity), so prefix matches.
- Maintainer's Windows 11 laptop passed because the URL case and realpath case happened
  to agree (both `c:\`), i.e. luck, not correctness.

`normalize()` fixes separators, **not case**, so adding another `normalize` would not help.

## 3. Fix direction + second serving requirement

Guard fix — compare containment, not raw strings:

```ts
const relTo = path.relative(LIB_REAL_DIR, fileReal)  // LIB_REAL_DIR = realpathSync(LIB_DIR) once
const inside = relTo !== '' && !relTo.startsWith('..') && !path.isAbsolute(relTo)
// and on win32, also case-fold both sides first:
const key = (p: string) => process.platform === 'win32' ? p.toLowerCase() : p
```

Equivalently: `realpath` both `LIB_DIR` and the file, then `file.localeCompare`-free
check via `path.relative` on case-folded (win32) operands, rejecting `..`/absolute
results. This is robust on both platforms because it delegates containment to the path
algebra (one canonical root, one candidate) and strips the Windows case ambiguity
(`toLowerCase`) / junction resolution (`realpath` on both sides) before comparing.
`path.relative` also correctly rejects sibling-prefix false positives like
`...\lib-evil\x.js`, which `startsWith(LIB_DIR + sep)` would... actually accept/reject
unevenly (`sep` guard helps, but `relative` is exact).

One other requirement for a dynamic import to work at all: the route must respond with
the bytes of the real JS file and a **JavaScript MIME type**
(`Content-Type: text/javascript` / `application/javascript`) — module scripts are
subject to strict MIME checking, so a 200 wrapped in an HTML error page or a generic
`text/plain`/`octet-stream` will fail the `import()`; it must also be served from the
same origin and stable URL the importer uses (no redirect to an HTML SPA fallback, no
auth redirect), because a cross-origin or HTML response fails module loading too.

## 4. Incident 3 — One Ctrl+scroll moves BOTH zooms

Both a pane-level zoom handler (pane font-size) and the modal's diagram zoom handler are
listening for the same `wheel`/`ctrl+wheel` gesture — the pane handler is registered
(typically with `capture`, or on `document`/the pane which is an **ancestor of the
modal**) so it never sees "the modal is open", and the modal's handler on the modal
content never tells it "this gesture is mine". `Ctrl+wheel` bubbles: the event targets
the diagram inside the modal, the modal handler runs, then the event continues up to the
pane/document/window listener, which runs too. Neither handler calls
`event.stopPropagation()` (or `stopImmediatePropagation()` when sharing a node), and
neither scopes itself, so one gesture mutates both state machines. Listener registration
order explains *ordering* of the two effects, not *why both* fire.

Ownership rule: **the innermost open overlay owns the gesture.** The modal, while open,
must call `preventDefault()` + `stopPropagation()` on Ctrl+wheel it handles, and the
pane's font-zoom handler must ignore any event whose target lies inside the modal
(typically: attach it to the pane element — not `window` — and/or early-return when
`modalOpen` / `event.target.closest('.zoom-modal')`), plus drop capture-phase/window
shortcuts while a modal is open. Symmetric test on the modal's teardown so closing the
modal returns ownership to the pane.

## 5. Regression tests that would have caught 1–3

1. **Chunk closure test (build-time, catches #1):** after `build`, parse `lib/mermaid-chunk.js`
   for static+dynamic import specifiers and assert every referenced sibling exists in the
   shipped `lib/`; equivalently, assert the mermaid chunk is self-contained
   (`inlineDynamicImports`/`splitting:false`) and has **zero** runtime sibling imports.
   Plus a smoke test that `import()`s the built chunk (jsdom/node with the same route) and
   asserts it resolves rather than falling back to the code block.
2. **Route containment unit test, case-matrix (catches #2):** directly unit-test the guard
   with `LIB_DIR = "E:\\dsh\\...\\lib"` and `realpathSync` stubbed to
   `"e:\\dsh\\...\\lib\\mermaid-chunk.js"` (win32) — must be 200, not 403;
   plus `../`, sibling-prefix (`lib-evil`), non-js, and symlink cases → 403/404 as
   appropriate. CI must include a Windows runner (or mocked realpath) since Linux masks it.
   Contract test: valid file inside lib → 200 with a `javascript` content-type.
3. **Modal ownership DOM test (catches #3):** render pane + open zoom modal, dispatch a
   cancelable `wheel` event with `ctrlKey: true` on the diagram inside the modal; assert
   diagram zoom changed **and** pane font-size unchanged, and the event's
   `defaultPrevented === true`. Second case: modal closed, wheel over pane → font-size
   changes, diagram untouched.

Limitations: off-fixture docs (Node/esbuild/MDN specifics) were referenced from
knowledge only; no external material was read.
