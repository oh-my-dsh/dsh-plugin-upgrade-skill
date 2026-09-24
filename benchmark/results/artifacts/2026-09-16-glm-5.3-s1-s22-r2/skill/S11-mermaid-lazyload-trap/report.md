# S11 · Mermaid Lazy-Load Trap — Diagnosis Report

Task: derive root causes for three rollout incidents of the lazily-imported mermaid chunk in
`@org/dsh-attach-input` v0.4.0 from the read-only evidence pack, and convert them into fixes
and regression coverage.

Evidence used: `fixture/chunk-route.ts` (attempt-2 host route), `fixture/console-split-chunks.txt`
(attempt 1), `fixture/console-403-windows.txt` + `fixture/ci-note.md` (attempt 2), `fixture/README.md`.

---

## 1. Incident 1 — why the split-chunk approach failed

**Observed:** `mermaid-chunk.js` itself loaded fine (200, 8.1 kB), but 97 sibling imports such as
`./src-BfvxrPJe.js` and `./pie-WAS4IAKB-CQHCQWWM.js` returned 404, and the capture states the
sibling files "were NOT shipped with the package".

**Root cause — bundler semantics:** a *dynamic* `import('./mermaid-chunk')` does not produce one
file. With default code-splitting, the bundler (Rollup/Vite/webpack alike) treats the dynamic
entry as a graph root and emits the reachable module graph as **many chunks**; the entry chunk
(the small 8.1 kB file) contains only the loader façade plus **relative-import statements
resolving to its sibling chunk files by their content-hashed filenames**. Fetching the entry via
`import()` makes the browser fetch *the whole chunk closure*: each static import in the chunk is
fetched as a module request before evaluation. If any sibling 404s, the entire dynamic import
rejects with `TypeError: Failed to fetch dynamically imported module` — even though the file the
URL names was served 200. So the failure is not the route; it is that the *deployment unit* (the
published package) did not match the *build unit* (entry + 97 hashed siblings). Any of: a package
`files`/whitelist that only copied the named entry, an npm pack ignore, or shipping only what the
author listed, produces exactly this.

**Build-side fix:** make the build unit equal the deployment unit. Either

- **disable chunk splitting for the dynamic entry** — build the mermaid feature as a single
  self-contained chunk (`output.inlineDynamicImports: true` for a one-entry build, or the
  equivalent `manualChunks`/single-chunk configuration) — which is what attempt 2 did; or
- if splitting is kept, **ship every emitted chunk**: include the whole emitted directory in the
  package `files` list and make the serving route serve any emitted `.js`/`.mjs` sibling (not
  only a hardcoded chunk name). A glob-verified "all emitted assets are packed" check (below)
  is what actually prevents recurrence.

## 2. Incident 2 — the exact guard flaw producing 403 on Windows

**Observed:** same code, green on Linux CI and on the laptop (DSH on `C:\`), 403 on production
(DSH on `E:\`). The debug print is decisive:

```
LIB_DIR  = "E:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib"
realpath = "e:\dsh\...\lib\mermaid-chunk.js"     ← lowercase drive letter
```

**Mechanism:** the second containment check compares a **realpath-resolved absolute path against
a never-realpath'd prefix**:

```ts
file = normalize(realpathSync(abs))            // canonicalized by the OS/Node
if (!file.startsWith(LIB_DIR + sep)) 403       // LIB_DIR is a plain string prefix
```

On Windows, paths are **case-insensitive but case-preserving**, and `fs.realpathSync` returns the
canonical casing the OS reports for each component — for the drive letter it commonly lowercases
(`E:\` → `e:\`) depending on how the process obtained the path. On Linux, realpath changes
nothing here (no symlinks inside `lib`), so both strings match and the test passes. On the laptop
it happened to pass because the `C:\` form it compared against already matched the casing
realpath returned; on the production host `LIB_DIR` was built from an uppercase `E:\` (from
`import.meta.url`) while realpath reported `e:\`, so `startsWith` — a **case-sensitive string
comparison** — failed for a path that is plainly inside the directory. The first guard
(`normalize(join(LIB_DIR, rel))`) passes on all platforms because both operands derive from the
same `LIB_DIR` string; only the realpath guard trips. The 404 branch for `realpathSync` throwing
is fine — the file existed, so it took the 403 branch, exactly as the route log shows ("path
escapes the plugin lib").

So precisely: **realpath canonicalizes component casing (including the drive letter) on Windows
but is an identity (modulo real symlinks) on Linux; comparing its output with `startsWith`
against a non-canonicalized prefix makes the guard casing-dependent, and only the production
host's drive-letter casing diverged.** "Windows paths are unreliable" is folklore; the actual
defect is comparing a canonicalized string against a non-canonicalized one.

## 3. Fix direction for the guard + the other serving requirement

**Guard fix:** put **both sides of the comparison through the same canonicalization**, once:

```ts
const REAL_LIB = realpathSync(LIB_DIR)          // compute once at route setup
// per request:
const file = realpathSync(abs)                  // already canonical
if (file !== REAL_LIB && !file.startsWith(REAL_LIB + sep)) 403
// equivalently and even more robustly:
const rel2 = relative(REAL_LIB, file)
if (rel2 === '' || rel2.startsWith('..') || isAbsolute(rel2)) 403
```

Comparing two realpath outputs (or using `path.relative`, which yields `../…` for escapes) makes
the check robust on both platforms: on Linux realpath is stable; on Windows both strings carry
the OS-canonical casing of the same tree, so the prefix match no longer depends on how the
process spelled the drive letter. The realpath check itself is still worth keeping — it defeats
symlink-based traversal into arbitrary host files — it just must not be mixed with a raw-string
prefix. (If the plugin is installed under a symlinked `node_modules` path, realpath-ing
`LIB_DIR` once also fixes the mirror-image false 403 on Linux/macOS.)

**Other serving requirement for a dynamic import to work at all:** the chunk must be served with
a **JavaScript MIME type** — `application/javascript` (or `text/javascript`, `…/ecmascript`).
Module scripts, including dynamic imports, are subject to strict MIME checking in browsers: a
`200` with `text/plain`, `application/octet-stream`, or no `Content-Type` is refused with the
*same* `TypeError: Failed to fetch dynamically imported module`. The route already sets this
header, which is worth pinning with a test, because a regression to a generic/absent content
type reproduces an incident-1-shaped failure with a completely different root cause.
(Same-origin serving means no CORS headers are needed; keeping the route GET-only as coded is
fine.)

## 4. Incident 3 — both handlers firing on one Ctrl+scroll

**Why both fire:** there are two independent `wheel` listeners alive at once — the pane's
font-size handler (attached at a broad scope such as `window`/`document`, as text-zoom handlers
usually are, so they survive focus movement inside the pane) and the fullscreen modal's
diagram-zoom handler attached at/below the modal DOM node. A `wheel` event with `ctrlKey`
dispatched on content inside the modal **bubbles** from the modal node up to `document`/`window`,
so both listeners receive the *same* event object. The modal handler calling `preventDefault()`
only cancels the browser's default pinch/ctrl-zoom action — `preventDefault` does **not** stop
propagation, and listeners on `window` in either phase still run. Attach order doesn't rescue it
either: whichever handler runs first, both run.

**Ownership rule:** while the modal is open, the **topmost open overlay owns Ctrl+wheel
exclusively**; underlying panes must not react. Concretely, one (or both) of:

- the modal's handler listens in the **capture phase on `document`** and calls
  `stopPropagation()` (not just `preventDefault()`) when `ctrlKey && modal.isOpen`, so the event
  never reaches any bubble-phase pane listener; or
- the pane stops listening at `window`/`document` scope and attaches its Ctrl+wheel handler to
  its own scrollable element — an element that is not an ancestor of the modal — so an event
  originating inside the modal never reaches it (optionally additionally gated on a `modal-open`
  state).

The structural lesson: `preventDefault` cancels the *default action*; `stopPropagation` (or
disjoint listener scopes) is what cancels *other listeners*.

## 5. Regression tests that would have caught each incident

1. **Incident 1 — pack/build integrity test (fails when siblings are unshipped):** after build,
   parse the emitted entry chunk's static import specifiers (or read the bundler's manifest) and
   assert every referenced file exists in the shipped `lib/` (and, stronger, that the npm pack
   file list ⊇ emitted chunk list). With default splitting this fails immediately on the 97
   missing siblings; with `inlineDynamicImports` it passes because there are no sibling
   specifiers. A companion route test requesting each emitted filename (not a hardcoded
   `mermaid-chunk.js`) covers the serving half.
2. **Incident 2 — route containment test on the real filesystem, per platform (must run on a
   Windows runner, not just Linux CI):**
   - happy path: `GET /dsh-attach-input/resources/mermaid-chunk.js` for a file that genuinely
     exists inside `lib` must return **200 with `content-type: application/javascript`** — on
     the maintainer's matrix this failed only on the `E:\` Windows host, so also add a unit test
     that drives the handler with a request path whose *drive-letter casing diverges* (construct
     the fixture by realpath-ing a temp lib dir and comparing against a differently-cased
     prefix), asserting 200;
   - traversal path: `/resources/..%2f..%2fsecret.js` and a symlink placed inside `lib` pointing
     outside must still 403/404 — so the fix doesn't over-correct into removing the realpath
     check.

   The current matrix's gap is that "Linux CI green + one Windows laptop" never exercised
divergent canonical drive casing; a case-divergence unit test does, deterministically.
3. **Incident 3 — wheel-ownership component test:** render the pane with a Ctrl+wheel zoom
   handler plus the fullscreen modal; dispatch one `wheel` event with `ctrlKey: true` on an
   element inside the modal; assert (a) the diagram scale changed exactly once, and (b) the
   pane's font-size (spy on its handler or observe its state) is **unchanged**, and the default
   zoom was prevented. Without capture-phase ownership/`stopPropagation`, assertion (b) fails,
   reproducing the double zoom. A mirror test with the modal closed asserts the pane still zooms
   — guarding against the fix breaking normal behavior.

---

## Summary table

| Incident | Root cause | Fix |
|---|---|---|
| 1. sibling 404s | dynamic import fetches the whole chunk closure; entry's hashed siblings were never shipped (deployment unit ≠ build unit) | single self-contained chunk (`inlineDynamicImports`) or ship+serve all emitted chunks; pack-integrity test |
| 2. Windows 403 | `realpathSync` canonicalizes component/drive-letter casing on Windows but is identity on Linux; case-sensitive `startsWith` against non-realpath'd `LIB_DIR` (`E:\` vs `e:\`) | compare against `realpathSync(LIB_DIR)` computed once, or a `relative()`-based escape check; keep the symlink defense |
| 3. double Ctrl+scroll | wheel bubbles to the window-scoped pane listener; `preventDefault` ≠ `stopPropagation` | topmost open overlay owns Ctrl+wheel: capture-phase `stopPropagation`, and/or pane handler scoped to its own element |

No files outside the designated output directory were written; the fixture and skill were only read.
