# S11 · Mermaid Lazy-Load Trap — Diagnosis Report

Task: read-only diagnosis (skill Mode A · inspect) of three rollout incidents in the
community Web plugin `@org/dsh-attach-input` v0.4.0 after adding lazily-imported mermaid
rendering. Evidence: fixture at
E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\tasks\S11-mermaid-lazyload-trap\environment\fixture
(chunk-route.ts, console-split-chunks.txt, console-403-windows.txt, ci-note.md).
No migrations, installs, or writes were performed; the fixture is untouched.

---

## 1 · Incident 1 — split chunks: sibling 404s after a successful entry fetch

**Observed.** `mermaid-chunk.js` itself returns 200 (8.1 kB — suspiciously small for
mermaid), then `src-BfvxrPJe.js` and `pie-WAS4IAKB-CQHCQWWM.js` return 404, and the whole
dynamic import rejects with "Failed to fetch dynamically imported module". The shipped
`ls` in the fixture states it directly: the sibling files named in the chunk's import
statements were **not shipped with the package**.

**Mechanism.** A bundler's default code-splitting turns one logical module into a *graph*:
the entry chunk (`mermaid-chunk.js`) plus 97 sibling chunks it statically imports. The
browser's dynamic `import()` is atomic over that graph: fetching the entry succeeds, but
the HTML-spec module script loading then resolves the entry's static import specifiers
(relative URLs like `./pie-WAS4IAKB-CQHCQWWM.js`), requests each, and any single failure
(404) fails the *entire* dynamic import — hence the final `TypeError` pointing at the
entry URL even though the entry loaded fine. Mermaid is large precisely because it splits
into per-diagram-type chunks (`pie-*.js`), so the 8.1 kB entry is mostly a list of
imports to siblings.

**Root cause (packaging, not runtime).** This is a lib-only bundle: whatever the build
emitted, only `mermaid-chunk.js` was declared/shipped in the package's `files`/lib dir.
Code-split output is only viable if *every* emitted chunk is shipped and served.

**Build-side fix.** For a lib-only plugin served from a single prefix route, disable
splitting so the lazy chunk is one self-contained file:

- Rollup/Vite: `output.inlineDynamicImports: true` (Vite build `build.rollupOptions.output.inlineDynamicImports = true`; with multiple inputs use
`output.manualChunks` returning a single chunk name, or `build.modulePreload polyfill`
considerations aside);
- esbuild: `--bundle --splitting=false` (splitting off by default for ESM without
`--splitting`);
- then assert the output is exactly one `.js` file for the mermaid entry.

(Alternative: keep splitting and ship + route-serve the full emitted asset list — but for
a 7 MB mermaid graph the single-chunk approach the maintainer already chose in attempt 2
is the pragmatic fix; the mistake was only in attempt 1's packaging.)

---

## 2 · Incident 2 — 403 on Windows production: drive-letter case divergence between
`fileURLToPath` and `realpathSync`

**Observed.** Same route code: Linux CI green, Windows laptop green, Windows Server 2022
production 403 on every chunk GET, with the guard branch message "path escapes the plugin
lib" firing for a path plainly inside lib. The debug print in ci-note.md is the smoking gun:

    LIB_DIR   = "E:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib"
    realpath  = "e:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\mermaid-chunk.js"

**Mechanism, per API per platform.**

- `LIB_DIR` comes from `fileURLToPath(new URL('.', import.meta.url))`. `fileURLToPath`
  does not canonicalize; it percent-decodes the file URL *verbatim*, so the drive-letter
  case is whatever case the module URL carries — here uppercase `E:` (Node preserves the
  case the process/module path was loaded with; on the production host the app runs from
  `E:\dsh`).
- `realpathSync(abs)` resolves to the canonical filesystem path. On Windows, Node's
  `realpath` goes through `fs.realpath`/`GetFinalPathNameByHandle`-style resolution and
  canonicalizes the drive letter to **lowercase** (`e:\...`). This case-folding of the
  drive letter is a documented Node-on-Windows behavior; the rest of the path's case is
  preserved because NTFS is case-preserving.
- The guard then does a **case-sensitive string prefix test**:
  `file.startsWith(LIB_DIR + sep)` → `"e:\..."` vs `"E:\..." ` → false → 403.

**Why the matrix split the way it did.**

- Linux: no drive letters; `realpathSync` only resolves symlinks and preserves segment
  case → prefix matches → green.
- Windows laptop with DSH on `c:\` "lowercase c: in some tooling": the module URL already
  carried lowercase `c:`, which happens to equal realpath's canonical lowercase → green
  *by coincidence*.
- Windows production on uppercase `E:`: URL case (E) ≠ realpath canonical case (e) →
  every request 403s.

So it is not "Windows paths are unreliable" — it is that the two APIs apply *different*
canonicalization rules to the drive letter, and the guard compares their outputs with a
byte-exact string operation. (Note the *first* guard, on the pre-realpath `abs`, passes on
all platforms; only the realpath re-check fails — which also means the containment check
that was added for symlink safety is the one rejecting.)

---

## 3 · Fix direction for the guard + the other serving requirement

**Robust containment comparison.** Canonicalize *both* sides with the same function before
comparing, or use a path-arithmetic comparison instead of raw string prefixes:

1. Canonical-root comparison (preferred): resolve the root once at module load —
   `const REAL_LIB = realpathSync(LIB_DIR)` — and test
   `file.startsWith(REAL_LIB + sep)`. Both strings have now passed through the same
   realpath canonicalization, so the drive letter case is identical on any platform
   (lowercase on Windows, unchanged on Linux). Symlink-escape containment is preserved
   because the *file* is still realpathed before comparison.
2. Or path-relative test, which avoids string-prefix pitfalls entirely:
   `const rel = relative(REAL_LIB, file); if (rel === '' || rel.startsWith('..') ||
   isAbsolute(rel)) → 403`. `path.win32.relative` compares case-insensitively, and
   `path.posix.relative` case-sensitively — exactly matching each filesystem's semantics —
   so it is correct on both platforms by construction.

Either way, keep the realpath of the requested file (it is what defeats symlink traversal);
only the *comparison operand* for the root changes.

**Other serving requirement for `import()` to work at all.** Module scripts are subject to
strict MIME-type checking: the route must serve the chunk with a JavaScript MIME type
(`application/javascript`, `text/javascript`, …) — a missing or wrong `Content-Type`
(e.g. `application/octet-stream` or `text/plain`) makes the browser refuse to execute the
fetched module and the dynamic import fails with the very same
"Failed to fetch dynamically imported module" symptom. The current route sets this
correctly; any refactor must keep it. (Same origin, so CORS is not in play; percent-decoding
of the pathname is already handled.)

---

## 4 · Incident 3 — both wheel handlers firing on one Ctrl+scroll

**Mechanism.** A wheel event is a single bubbling DOM event dispatched at the element under
the cursor. Under the fullscreen modal the event target is inside the modal; the modal's
zoom listener and the pane's font-size listener are both registered on nodes that the event
reaches — typically the pane handler on the pane container/document/window (an *ancestor*
or an outer scope of the modal) and the modal handler on the modal/window. DOM dispatch
visits listeners in capture-then-bubble order along the ancestor chain, so both registered
listeners receive the *same* event object; neither calls `stopPropagation()` (and typically
both are non-passive so both can `preventDefault()`). Result: one Ctrl+scroll mutates two
independent states — diagram scale and pane font size.

**Ownership rule.** A gesture belongs to exactly one layer: the **innermost/most-specific
active UI layer owns the event and stops its propagation**. Concretely:

- The pane font-size handler must be scoped to the pane's own subtree (attached to the pane
  container, not `window`/`document`), so events originating inside a modal overlay never
  reach it;
- the fullscreen modal, while open, is the topmost layer: its Ctrl+wheel handler applies
  the diagram zoom and calls `e.stopPropagation()` plus `e.preventDefault()` (also
  suppressing the browser's native Ctrl+wheel page zoom);
- equivalently: overlay layers rendered above the pane take the gesture; the pane yields.

What must *not* happen is two independent listeners on shared outer scopes (window/document)
both acting on one event — that is the structural bug, not "browser quirk".

---

## 5 · Regression tests that would have caught each incident

**Incident 1 — shipped-chunk completeness (build/packaging test).**
- After `build`, scan every emitted `.js` under lib for static import/export-from
  specifiers (regex on `import ... from "./x.js"` / `import("./x.js")`) and assert each
  referenced sibling file exists in the directory that will be packed (`npm pack` file
  list or `files` glob). Fails on attempt 1's tree immediately (`pie-*.js` missing).
- Simpler invariant if the single-chunk policy is adopted: assert the mermaid entry build
  output is exactly one `.js` file (snapshot of the emitted file list).
- Route-level e2e: fetch every specifier listed in the entry chunk through
  `/dsh-attach-input/resources/...` and expect 200.

**Incident 2 — containment guard across drive-letter cases.**
- Unit-test the handler with a faked filesystem seam (or run on `windows-latest` CI, which
  the maintainer's Linux-only matrix lacked): construct `LIB_DIR = "E:\\...\\lib"` while
  the realpath layer returns `"e:\\...\\lib\\mermaid-chunk.js"` — exactly the production
  print — and assert 200 for the in-lib file.
- Counter-case: traversal `..\\..\\host-secret.js` and a symlink pointing outside lib
  must still 403/404 (guard must stay containment-correct after the case fix).
- Cross-platform matrix: the same route test in CI on both `ubuntu-latest` and
  `windows-latest`, with at least one Windows job whose checkout path has an uppercase
  drive (default `C:` + a `realpath`-case assertion), so the case divergence cannot pass
  silently again. (An explicit assertion `realpathSync(x).startsWith(fileURLToPath(x))`
  documents the divergence.)

**Incident 3 — exclusive gesture ownership.**
- Component/DOM test: open the modal, dispatch one `WheelEvent` with `ctrlKey: true` and
  `bubbles: true` at a node inside the modal; assert the diagram-scale state changed and
  the pane font-size state did *not* (and `defaultPrevented` is true).
- Symmetric test: wheel inside the pane with the modal closed still changes font size.
- Optionally a listener-count assertion: exactly one non-passive Ctrl+wheel listener is
  active per open layer.

---

## Summary table

| Incident | Root cause | Fix |
|---|---|---|
| 1 · sibling 404s | code-split entry's static imports not shipped; `import()` is atomic over the module graph | `inlineDynamicImports`/single self-contained chunk (or ship all emitted chunks); packaging test on emitted import graph |
| 2 · Windows 403 | `fileURLToPath` preserves URL drive-letter case (`E:`) while `realpathSync` canonicalizes to lowercase (`e:`); case-sensitive `startsWith` prefix guard fails | compare against `realpathSync(LIB_DIR)` root, or `relative()` + `isAbsolute`/`..` check; keep JS MIME type |
| 3 · double zoom | one bubbling wheel event reaches two listeners on overlapping scopes; neither stops propagation | innermost active layer owns the gesture, scopes its listener, and calls `stopPropagation`+`preventDefault` |

**Pending/residual risk.** The 7.2 MB single chunk blocks first render until fully
downloaded; consider prefetch after idle. The route is excerpt-only — the full handler
(unhandled `readFile` errors, range requests, caching headers) was not reviewed.
