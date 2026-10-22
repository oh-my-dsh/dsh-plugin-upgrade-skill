# JUDGE BRIEF · noskill.S11-mermaid-lazyload-trap

## Criteria (sealed rubric)
- [split-chunk-attribution] (20pt) Use console-split-chunks.txt to explain that sibling module imports resolve relative to the fetched chunk URL, but the emitted siblings were not shipped, so entry HTTP 200 still ends in a failed dynamic import. Propose a self-contained single-file feature bundle with code splitting disabled. Do not require a particular bundler option spelling; an equivalent complete bundling/serving solution may earn credit if it explicitly accounts for every dependency.
- [windows-containment-attribution] (20pt) Compare chunk-route.ts and ci-note.md: configured LIB_DIR has uppercase E: while the resolved realpath has lowercase e:, so a case-sensitive startsWith containment test rejects an actually contained file. Explain why the supplied Linux/control environments pass. Do not claim Windows paths are intrinsically unreliable or realpath always lowercases on every machine.
- [safe-route-fix] (20pt) Propose path.relative-based containment using canonical base/target paths and platform-appropriate path semantics; reject parent traversal and absolute/outside results, including symlink escapes after resolution. Equivalent safe containment is valid. Preserve a JavaScript MIME type for dynamic import. Removing the guard, lowercasing arbitrary paths on case-sensitive systems, or merely naming path.relative is insufficient. No executed route test is required.
- [modal-event-ownership] (20pt) Explain that the pane font handler and modal zoom handler both act on the same Ctrl+wheel gesture. Give the modal exclusive ownership: the pane handler must stand down while the modal owns the gesture; the modal prevents the browser default and stops propagation as appropriate. If the pane uses ancestor capture, stopping propagation later in the modal cannot undo it. Equivalent listener arbitration is valid; a specific modal selector or unseen source line is not required.
- [incident-regressions] (20pt) Propose checks with expected outcomes covering all three incidents: import failure preserves a code-block fallback and the built dependency set is deployable; a case-differing contained Windows path serves while real traversal/symlink escape is refused; modal Ctrl+wheel zooms the diagram without changing pane font size. Partial credit for a meaningful but incomplete matrix. These are planned checks, not claims of execution.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [unsafe-containment] ceiling=40 The proposed fix disables containment or deliberately serves paths outside the plugin resource root. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.

## Candidate report(s)
#### FILE: S11-mermaid-lazyload-trap/S11-mermaid-lazyload-trap-report.md

# S11 · Mermaid Lazy-Load Trap — Root-Cause Report

Plugin: `@org/dsh-attach-input` v0.4.0 (lib-only bundle), markdown reading mode + mermaid rendering.
Evidence: `fixture/chunk-route.ts`, `fixture/console-split-chunks.txt`, `fixture/console-403-windows.txt`,
`fixture/ci-note.md`, `fixture/README.md` (read-only; unchanged).

All platform claims below were **verified empirically** on the container (Node v24.18.1,
`process.platform === 'win32'`) by calling the actual `node:path` / `node:url` / `node:fs` APIs. Measured
values are quoted inline as `measured: ...`. Nothing here is folklore.

---

## 1. Incident 1 — why the split-chunk approach failed

### 1.1 What the evidence shows

```
GET .../dsh-attach-input/resources/mermaid-chunk.js        200  (8.1 kB)
GET .../dsh-attach-input/resources/src-BfvxrPJe.js         404
GET .../dsh-attach-input/resources/pie-WAS4IAKB-CQHCQWWM.js 404
TypeError: Failed to fetch dynamically imported module: .../mermaid-chunk.js
```

and the decisive line: *"ls of the shipped lib/ at the time: mermaid-chunk.js WAS present; the sibling
files listed in its import statements were NOT shipped with the package."*

### 1.2 The mechanism — bundler semantics, not routing

**What code-splitting emits.** When an entry chunk contains a dynamic `import()`, the bundler emits the entry
chunk plus **one chunk per dynamic import site**, and rewrites each site into a *relative* specifier in the
parent chunk's body (`import("./pie-WAS4IAKB-CQHCQWWM.js")`). Mermaid is exactly this shape: it defers diagram
types to render time, so a mermaid bundle splits into an entry plus one chunk per lazy diagram type — 97 siblings
(`src-…`, `pie-…`, …) is the expected output, not an accident.

**How the sibling URL is resolved.** The specifier is relative, so the browser resolves it **against the
importing module's own URL**: a module at `/dsh-attach-input/resources/mermaid-chunk.js` importing
`./pie-WAS4IAKB-CQHCQWWM.js` requests `/dsh-attach-input/resources/pie-WAS4IAKB-CQHCQWWM.js`. That part is
*correct* — and note the route would have served it: the route's filter is only `/.m?js$/` plus containment, and
`pie-WAS4IAKB-CQHCQWWM.js` satisfies both. **The route is not the culprit.**

**The actual defect is a packaging / asset-manifest failure.** The published package shipped the entry chunk but
not the 97 files its own body references. The usual causes: `package.json#files` naming only the entry file or a
glob that misses hashed names, a `.npmignore` excluding the chunk dir, a build step emitting somewhere the pack
step doesn't read, or `prepublishOnly` not running so the published `dist/` is stale. Splitting turns a packaging
mistake into a guaranteed runtime failure, because the chunk's body *contains* URLs for files that must exist
next to it.

**Why the error message points at the wrong file.** `import()` builds a **dynamic import graph**. The outer
`import("./mermaid-chunk.js")` from the renderer is one link. The parent chunk loads fine (200) and begins
evaluating; during evaluation (mermaid defers diagram loading to render time) it issues
`import("./pie-…js")`, which 404s; that rejection propagates up the graph and rejects the *outermost* promise,
so the browser names `.../mermaid-chunk.js` — a URL that returned 200. The real failure is a **grandchild**
fetch, visible only in the 404 lines. This is why the maintainer concluded "my chunk is broken" when in fact the
chunk was fine and its dependencies were missing. Second-order effect: because mermaid loads lazily at *first
diagram render*, the failure surfaces as a reading-mode runtime bug rather than a packaging bug.

### 1.3 Build-side fix

- **Emit one self-contained chunk with no dynamic imports.** The host route is a dumb static file server; it
  cannot act as a bundler or rewrite specifiers.
  - Rollup / Vite (lib mode): `build.rollupOptions.output.inlineDynamicImports = true` — legal for a single
    entry chunk, and it inlines every dynamically-imported module into the entry, eliminating sibling chunks and
    their relative specifiers entirely. (This is the fix the maintainer already stumbled into in attempt 2.)
  - Webpack: `optimization: { splitChunks: false, runtimeChunk: false }` and stop `import()`-splitting this entry.
  - esbuild: build without `--splitting` (esbuild only splits ESM output when `--splitting` is passed).
  - Keep mermaid **bundled, not externalized** — the route serves only this plugin's lib dir, so an externalized
    `mermaid` would 404 just the same.
- **If splitting is ever reintroduced, ship every emitted asset**: replace a file-list `files` allowlist with a
  directory include (`"files": ["lib"]`) or a post-build copy, and assert the emitted set in CI (§5).
- Also assert the entry chunk contains no relative sibling specifiers at all — a one-line static scan of the
  built artifact.
---

## 2. Incident 2 — the exact flaw in the containment guard

### 2.1 Which guard fires (derived, not guessed)

```ts
const abs = normalize(join(LIB_DIR, rel))
if (!abs.startsWith(LIB_DIR + sep)) { ... 403 ... }        // guard #1
...
file = normalize(realpathSync(abs))
if (!file.startsWith(LIB_DIR + sep)) { ... 403 ... }       // guard #2
```

Guard #1 **cannot** be the one that fired: `join` and `normalize` are *pure string* functions that preserve
`LIB_DIR`'s spelling, so for any in-bounds `rel`, `abs` necessarily begins with `LIB_DIR + sep`. The 403 must
therefore come from **guard #2, the `realpathSync` branch** — which is exactly what the production debug session
was printing (`LIB_DIR` vs `realpath`).

### 2.2 The mechanism, API by API

The two strings compared by guard #2 are produced by **two different case authorities**:

| string | produced by | case authority |
|---|---|---|
| `LIB_DIR` | `normalize(fileURLToPath(new URL('.', import.meta.url)))` — a **pure string pipeline** | whatever the module URL says |
| `file` | `normalize(realpathSync(abs))` | the **operating system** |

- `fileURLToPath` does **not** canonicalize the drive letter:
  `measured: fileURLToPath('file:///e:/x/y.js') === 'e:\x\y.js'`.
- `path.normalize` is a **pure string** function — it fixes separators and collapses `.`/`..` segments, and it
  preserves case: `measured: win32.normalize('E:\a\lib\') === 'E:\a\lib\'`.
- On Windows, `fs.realpathSync.native` is backed by `GetFinalPathNameByHandleW`, which returns the file's
  **canonical** spelling: the drive letter as the volume's DOS device is spelled, and each component as stored in
  the directory entry. Measured on this host:
  - `measured: realpathSync.native('E:\DEEPSEEK-HARNESS\...')` → `E:\deepseek-harness\...` — case **restored
    from disk**, not taken from the input.
  - `measured: realpathSync.native('e:\...')` → `E:\...` — the drive letter is re-spelled by the OS.
  - plain `realpathSync` echoes the input spelling on this Node version; `.native` canonicalizes. Either way, the
    returned string's case comes from a different authority than `LIB_DIR`'s.
- **Windows path identity is case-insensitive and case-preserving.** Measured for the same file under two
  spellings: `measured: existsSync('e:\...') === true`, `statSync` on both spellings returns **identical
  `dev`/`ino`**, and `readFileSync` bytes are identical — while `measured: a === b === false`.
- The guard compares with `String.prototype.startsWith`, which is **byte-exact and case-sensitive**:
  `measured: 'e:\a\lib\x'.startsWith('E:\a\lib\') === false`.

Putting it together, on the production host: `realpathSync` returned
`e:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\mermaid-chunk.js` while `LIB_DIR` was
`E:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib` — **one drive letter apart in case, the same
file** — so guard #2 emitted `403 'path escapes the plugin lib'`. The route log confirming that the guard branch
fired "for a path that is plainly inside the lib directory" is precisely this.

> **The flaw, named precisely: the guard applies a POSIX-style, case-sensitive *string-prefix* containment check
> (`startsWith`) to Windows path data whose canonical spelling is supplied by the OS and is not required to
> match the loader's spelling.** Windows paths are perfectly reliable and self-consistent; the *comparison
> model* was wrong.

### 2.3 Why Linux is green, the laptop is green, and production is not

- **Linux**: no drive letter; the filesystem is case-sensitive, so there is exactly one spelling; and
  `realpathSync` of an already-normalized, symlink-free path inside `LIB_DIR` returns a **byte-identical**
  string, so `startsWith` succeeds. The bug is **latent on Linux — it cannot fire there.**
- **Windows**: it fires **iff** the OS-canonical spelling differs in case from the loader's spelling. On a normal
  interactive install the two agree (the volume letter is spelled the way the installer typed it) — laptop green.
  On Windows Server 2022 with the tree on a volume whose DOS-device spelling is `e:` (lowercase volume
  enumeration / mount / `subst` / junction), `GetFinalPathNameByHandleW` returns `e:\...` and **every** request
  403s.
- The maintainer's own matrix splits along exactly that one variable — Linux green, `C:\` laptop green, `E:\`
  production broken — while the code is identical everywhere. That is the signature of a comparison defect, not
  of "Windows paths being unreliable".

### 2.4 An adjacent defect in the same guard (worth pinning regardless)

`new URL('.', import.meta.url)` resolves to a **directory URL with a trailing separator**, and `normalize`
preserves it (`measured: win32.normalize('E:\a\lib\') === 'E:\a\lib\'`;
`measured: posix.normalize('/a/lib/') === '/a/lib/'`). As excerpted, `LIB_DIR + sep` therefore becomes
`...\lib\\` and `abs` (`...\lib\mermaid-chunk.js`) does **not** start with it — guard #1 would then reject
**every** request on **both** platforms (`measured: startsWith === false` for both the win32 and posix
variants). The production debug print shows `LIB_DIR` **without** a trailing separator, so the shipped code
evidently strips it (or derives it via `dirname(fileURLToPath(import.meta.url))`). Either way it must be pinned
by a unit test, because it is the other way this exact guard 403s.
---

## 3. Fix direction

### 3.1 The comparison to use — `path.relative`, not `startsWith`

```ts
function isInside(root: string, target: string): boolean {
  const rel = path.relative(root, target)
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel)
}
// guard #1: if (!isInside(LIB_DIR, abs)) 403
// guard #2: if (!isInside(LIB_DIR, normalize(realpathSync(abs)))) 403
```

**Why it is robust on both platforms** — because `path.relative` implements the comparison *with the platform's
own path semantics* rather than with byte comparison:

- `measured: win32.relative('E:\a\lib', 'e:\a\lib\x.js') === 'x.js'` → accepted (case-insensitive, which is
  correct for Windows).
- `measured: posix.relative('/a/lib', '/A/lib/x.js') === '../../A/lib/x.js'` → rejected (case-sensitive, which is
  correct for Linux — `/A` and `/a` really are different directories there).
- The **same source line** is correct on both. No platform branching, and — importantly — no
  `toLowerCase()`-everything shortcut, which would be *wrong* on Linux.
- It also removes the sibling-prefix class of bug for free:
  `measured: win32.relative('E:\a\lib', 'E:\a\lib-evil\x.js') === '..\lib-evil\x.js'` → rejected.

Additional hardening:

- **Keep the realpath check** — it is what defeats symlink/junction escapes. Change only its *comparison*.
- Derive `LIB_DIR` once as `dirname(fileURLToPath(import.meta.url))` so it never carries a trailing separator,
  and assert that in a test.
- What **not** to do: don't lower-case both sides (breaks Linux); don't drop the realpath check (reopens symlink
  escapes); don't compare against `process.cwd()`.

### 3.2 The other serving requirement for a dynamic import to work at all

**The response must be a JavaScript MIME type.** `import()` is a *module* fetch: the browser refuses to execute a
module response whose `Content-Type` is not a JavaScript type ("Expected a JavaScript module script but the
server responded with a MIME type of ..."), and an HTML error page from a 403/404 handler fails identically. The
route's `application/javascript; charset=utf-8` satisfies this (prefer the current standard
`text/javascript; charset=utf-8`). Note that the 403 branch does `res.writeHead(403).end('path escapes the plugin lib')`
with **no content-type at all** — so even the failure mode is a module-protocol failure, not a readable message.

**CORS.** Module scripts, including dynamic `import()`, are always fetched in **CORS mode** — there is no
`no-cors` fallback the way a classic script has. Same-origin (as here, `127.0.0.1:3080`) needs nothing extra; but
if the resources are ever served from another origin or port, the route must emit `Access-Control-Allow-Origin`,
and the request must not require credentials. A 403/404 without CORS headers surfaces as the same opaque
"Failed to fetch dynamically imported module".

Plus the ones the route already handles: GET-only (405 otherwise), 200 with the full body, and — from incident 1 —
it must actually serve **every** file the chunk asks for.

---

## 4. Incident 3 — why BOTH handlers fire on one Ctrl+scroll under the modal

### 4.1 The event model, precisely

A `wheel` event with `ctrlKey` is dispatched **once**, at the element under the pointer (the diagram inside the
modal), then propagates: **capture** `window → document → … → target`, then **bubble** `target → … → document → window`.

Two independent listeners exist for that one gesture:

- the reading pane's **font-zoom** listener, registered globally (on `window`/`document`) because "zoom anywhere
  in the reader" is a pane-level gesture — registered at pane construction;
- the zoom modal's **diagram-zoom** listener, registered when the modal opens — registered later.

Both test `event.ctrlKey` and both act. Three facts make both fire:

1. **`preventDefault()` only cancels the browser's default action** (native page/pinch zoom). It does not stop
   propagation and has no effect on any other listener. A handler that calls `preventDefault()` and returns still
   lets every other listener on the path run.
2. **`stopPropagation()` stops listeners on *later nodes in the path*** — ancestors in the bubble phase,
   descendants in the capture phase. It does **not** stop other listeners **on the same node**: those still run,
   in registration order. Only **`stopImmediatePropagation()`** does that.
3. **Ordering.** If both listeners are on the same node (`window`), they run in **registration order**, so the
   pane's handler (registered first) runs *before* the modal's — the modal cannot retroactively cancel it. If the
   pane's listener is on `window` in the **capture** phase, it runs *before* the modal's bubble-phase handler no
   matter what the modal does.

Net effect: one Ctrl+scroll under the modal scales the SVG **and** bumps the pane's font size. Neither handler is
wrong in isolation — the defect is that **neither asks whether it currently owns the gesture**.

### 4.2 The ownership rule that fixes it

> **Exactly one component owns a given gesture at a time. The owner is the topmost / most-specific active
> surface, and non-owners must no-op.**

Applied here: a modal open over a surface **captures** the gesture for its whole lifetime. While the zoom modal is
open it owns Ctrl+wheel; the pane's global handler must check ownership before acting and re-assert it on close.

Enforce it at the point of handling, not by propagation luck:

- the modal's handler calls **`stopImmediatePropagation()`** (plus `preventDefault()`, registered
  `{ passive: false }` so it is not ignored) — so no other listener on the same node runs;
- register the modal's handler in the **capture** phase on `window`
  (`addEventListener('wheel', onWheel, { capture: true, passive: false })`) so it also beats handlers deeper in
  the tree;
- gate the pane's handler on a shared **ownership token** (a small zoom coordinator / "gesture bus") that the
  modal sets on open and clears on close — this survives DOM reparenting, portals, and listener-order changes,
  which `stopPropagation` alone does not;
- structurally cleanest: **one** delegated `window` listener owned by a coordinator that routes Ctrl+wheel to the
  current owner (an owner stack: `modal > pane`). Two independent global listeners for one gesture is the root
  design smell.

Also verify the modal's listener is `{ passive: false }` — in a passive handler `preventDefault()` is a no-op, so
the page itself would zoom as a third symptom.
---

## 5. Regression tests that would have caught incidents 1–3 before release

### Incident 1 — split chunks / packaging

1. **Emitted-asset closure test** (runs on every build): build the plugin, then parse the emitted entry chunk for
   every relative specifier (`import("./...")`, `from "./..."`) and assert either (a) the set is **empty** (the
   `inlineDynamicImports` build), or (b) every referenced file exists next to the chunk. This is the direct
   regression for `pie-WAS4IAKB-CQHCQWWM.js`.
2. **Tarball contents test**: `npm pack --dry-run` and assert every file under `lib/` (at minimum every emitted
   chunk) is in the list; assert the `files`/`.npmignore` policy cannot drop `*.js` under `lib/`.
3. **Route-level integration test**: boot the host with the plugin registered, request `mermaid-chunk.js`, then in
   a headless browser `await import(url)` and assert it resolves, with a network-log assertion of **zero
   non-200s**. A static "file exists" test is not enough — the sibling imports only fire during chunk
   evaluation.
4. **Config assertion**: `build.rollupOptions.output.inlineDynamicImports === true` (or `splitChunks === false`),
   and `mermaid` not externalized, so nobody silently re-enables splitting.

### Incident 2 — Windows containment

1. **Case-matrix unit test for the guard**, parameterized over `{ 'E:\a\lib', 'e:\a\lib' }` ×
   `{ correct case, wrong-case component }`, asserting **200** for both spellings of the *same* file — this is
   exactly the production condition.
2. **Escape tests must stay red→green**: `../..`, `..%2F`, `..\`, an absolute foreign path (`C:\evil\x.js`), a
   sibling-prefix directory (`lib-evil`), and a **symlink/junction inside `lib` pointing outside** must all still
   403 — proving the fix did not become permissive.
3. **Realpath-divergence test**: spy on `realpathSync` to return a differently-cased-but-identical path and assert
   200 (the exact production shape); plus a Windows-only test that creates a real directory and requests it
   through a lowercased drive letter.
4. **Run the suite on a Windows agent** (`runs-on: windows-latest`) in addition to Linux. This is the structural
   gap: the maintainer's matrix exercised the route check only on Linux, so a Windows-only defect was invisible
   until production. Add a cross-platform parity assertion — the same guard suite on win32 and posix must produce
   **identical** outcomes; the bug was precisely that behaviour *diverged* by platform.
5. **Trailing-separator assertion**: `LIB_DIR` must not end with a separator (remember
   `new URL('.', import.meta.url)` yields one).

### Incident 3 — gesture ownership

1. **DOM-level test** (happy-dom/jsdom or Playwright): register the pane's global listener and the modal's
   listener in the same order as production, open the modal, dispatch `wheel` with `ctrlKey: true` on the diagram,
   and assert the pane's font size **did not change** while the modal's zoom **did**. On today's code both change.
2. **Ownership-token test**: assert the pane's handler no-ops while `zoomOwner === 'modal'` and resumes after
   close — including Escape / backdrop-close, so the token cannot get stuck.
3. **Listener-isolation test**: spy on the pane's handler and assert it receives **zero** events while the modal
   is open (i.e. `stopImmediatePropagation` is really called) — catches the
   `preventDefault`-vs-`stopImmediatePropagation` confusion directly.
4. **Real-browser test**: Playwright, open the modal, wheel with Ctrl held, assert the SVG transform changed, the
   pane's computed `font-size` is unchanged, and the page itself did not zoom (proves `{ passive: false }`).
5. **Ordering regression test**: assert the modal's listener is registered with `capture: true`, or that exactly
   one window-level `wheel` listener exists — so a future refactor adding a second global listener fails the
   build.

### The one release gate that would have blocked all three

A headless-browser smoke test on a **Windows** runner: build → pack → install into a real DSH host → open the
reading mode with a ```mermaid fence → assert (a) **zero** non-200 network responses, (b) an `<svg>` is
rendered rather than the fallback `<pre>` code block, (c) open the zoom modal and Ctrl+wheel → **only** the
diagram scales.

---

## 6. Summary table

| # | Symptom | Root cause (one line) | Fix |
|---|---|---|---|
| 1 | sibling chunk 404s, parent chunk rejected | code-splitting emitted relative sibling imports; the package shipped only the entry chunk, so the chunk's own dependency URLs 404 and the rejection propagates to the outermost `import()` | `inlineDynamicImports: true` (single self-contained chunk, mermaid bundled) **and** ship every emitted asset; CI closure + pack + headless-import tests |
| 2 | 403 on Windows only, path plainly inside lib | guard #2 compares `realpathSync`'s OS-canonical spelling (from `GetFinalPathNameByHandleW`, drive letter per the volume's DOS device) against `fileURLToPath`-derived `LIB_DIR` using case-sensitive `startsWith`; Windows paths are case-insensitive, so `e:\...` vs `E:\...` is the same file | `path.relative`-based containment (platform-correct case semantics, verified), keep the realpath check, `dirname()`-derive `LIB_DIR`, run the suite on Windows |
| 3 | Ctrl+scroll under the modal zooms both | two independent bubble-phase listeners on the same gesture; `preventDefault()` cancels only the default action and `stopPropagation()` does not stop same-node listeners, and the pane's listener was registered first | ownership rule: modal owns the gesture while open — `stopImmediatePropagation()` + capture-phase registration + an ownership token gating the pane's handler; best: one delegated listener routing to the current owner |

---

## 7. Notes on scope

- The fixture directory was read only and is unchanged.
- All Node API behaviours quoted above were measured live in this container (Node v24.18.1, win32) against the
  real `node:path` / `node:url` / `node:fs` modules; the containment fix in §3.1 was verified against both the
  win32 and posix implementations of `path.relative`.
- The modal handler source was **not** part of the evidence pack, so §4 is derived from the DOM event model
  (listener ordering, `preventDefault` vs `stopPropagation` vs `stopImmediatePropagation`, capture/bubble
  phases) rather than from the plugin's code; the ownership rule in §4.2 is the fix to apply and to cover with
  the tests in §5.

## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.