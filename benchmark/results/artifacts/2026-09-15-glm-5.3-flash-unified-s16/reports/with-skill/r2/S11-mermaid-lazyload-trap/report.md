# S11 · Mermaid Lazy-Load Trap — Diagnosis Report

Plugin: `@org/dsh-attach-input` v0.4.0 (lib-only bundle), mermaid rendering as a lazily-imported
chunk served by a new host prefix route. Evidence: `fixture/chunk-route.ts`,
`fixture/console-split-chunks.txt`, `fixture/console-403-windows.txt`, `fixture/ci-note.md`.
Read-only diagnosis; no fixture file was modified, no migration or install was executed.

---

## 1. Incident 1 — why default code-splitting broke the dynamic import

**Symptom (evidence):** `mermaid-chunk.js` itself loaded (`200`, 8.1 kB), then the browser 404'd
its siblings (`src-BfvxrPJe.js`, `pie-WAS4IAKB-CQHCQWWM.js`, …) and the whole
`import()` rejected with `TypeError: Failed to fetch dynamically imported module`. The `ls` note
in the capture is decisive: *the sibling files listed in the chunk's import statements were NOT
shipped with the package.*

**Mechanism.** A dynamic `import()` is not one file. Under the bundler's default code-splitting,
the dynamically-imported entry becomes its own chunk **and** every module it shares with the rest
of the graph is hoisted into sibling chunks (here ~97 of them: diagram modules like `pie-*`, the
shared `src-*` runtime, etc.). The entry chunk references them with *static* relative imports,
e.g. `import './pie-WAS4IAKB-CQHCQWWM.js'`, which the browser resolves as URLs relative to the
chunk's own URL — i.e. siblings must be fetchable under the same
`/dsh-attach-input/resources/` prefix.

Browser module loading is **graph-atomic**: the runtime fetches the entry chunk, then every static
import in it, recursively; a single 404 anywhere in the graph aborts the entire dynamic import and
surfaces as `Failed to fetch dynamically imported module` — even though the entry chunk itself
returned 200. So the failure was a **packaging gap**, not a serving failure: the bundler emitted
the siblings, but the release/packaging whitelist (`files` / the copy step into `lib/`) shipped
only `mermaid-chunk.js`.

**Build-side fix (two valid shapes; attempt 2 chose the first):**

1. **Single self-contained chunk** — build the lazy mermaid entry with dynamic imports inlined
   (Rollup/Vite `output.inlineDynamicImports: true`, or force all mermaid deps into one chunk via
   `manualChunks`), so the emitted file has zero relative sibling imports and the module graph is
   exactly one file. This is the robust shape for a DSH plugin because the host route serves *only*
   the plugin's own `lib/` dir — nothing else in the host can ever satisfy a sibling chunk URL.
   Cost: one ~7.2 MB file; acceptable for a lazy, cached chunk.
2. Alternatively keep splitting, but **ship every emitted artifact**: include the whole `dist/`
   output in the package (`files` field / pack step) and serve it as a directory. This is more
   fragile for plugins: any future packaging drift re-creates the same atomic-graph failure.

A guard test for either shape is in §5 (test 1).

---

## 2. Incident 2 — the exact guard flaw behind the Windows-only 403

**Symptom (evidence):** production Windows Server 2022, DSH on `E:\`: every
`GET /dsh-attach-input/resources/mermaid-chunk.js` → `403 "path escapes the plugin lib"`, for a
file that is *plainly inside* the lib dir. Same build green on Linux CI and on a Windows 11 laptop
(DSH on `C:`). The debug session printed:

```
LIB_DIR   = "E:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib"
realpath  = "e:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\mermaid-chunk.js"
```

The only difference is the **drive-letter case** (`E:` vs `e:`). Verified mechanically: with these
exact strings, `realpath.startsWith(LIB_DIR + '\\')` evaluates to `false`.

**The precise mechanism — each API's return value, per platform:**

- `LIB_DIR = normalize(fileURLToPath(new URL('.', import.meta.url)))` — `import.meta.url` is built
  by the ESM loader from the path **as module resolution found it**, i.e. the casing of the path as
  it entered the process (how the host was launched / how the module was resolved). Windows
  filesystems are **case-insensitive but case-preserving**, so this API faithfully returns
  `E:\…` when the process was started against a path written with an uppercase drive. No
  canonicalization of case happens here.
- `realpathSync(abs)` — resolves through the native filesystem (libuv `uv_fs_realpath`, backed by
  `GetFinalPathNameByHandle`). It returns the **canonical on-disk casing** of the final path as the
  filesystem/driver stack reports it — which is decided by how the volume is mounted, not by how
  your process spelled the path. On the production box that canonical spelling is `e:\…`.
  (On POSIX, paths have no canonical case, so `realpathSync` returns the identical byte string and
  this whole hazard class does not exist.)
- `String.prototype.startsWith` compares **code units, case-sensitively, on every platform**.
  So the second guard `file.startsWith(LIB_DIR + sep)` compares a `e:`-cased canonical path against
  an `E:`-cased module-URL-derived root, gets `false`, and classifies a legitimate in-lib file as
  an escape → `403` on **every** GET.

**Why the two other machines pass:** on Linux CI, `realpathSync` output is byte-identical to the
`LIB_DIR` prefix (no case folding exists), so the guard holds. On the Windows 11 laptop the
canonical casing of `C:` and the casing module resolution produced happened to *agree*, so the
case-sensitive comparison accidentally passed. "Works on my machine" here literally means "the two
APIs happen to report the same casing on my machine."

**Why guard 1 is not the culprit:** `abs = normalize(join(LIB_DIR, rel))` is *constructed from*
`LIB_DIR`, so its case and normalization always match guard 1's prefix; guard 1 (the
pre-`realpath` check) works on all platforms and correctly rejects `..`-style traversal before
touching the disk. The 403 the route log shows can only come from the second, post-`realpath`
guard — exactly where the two different casings meet.

(One adjacent latent bug worth fixing in the same change: the derivation
`fileURLToPath(new URL('.', import.meta.url))` yields a *trailing* separator, so `LIB_DIR + sep`
can become a doubled separator and false-reject everywhere. Compute the comparison root once as
`LIB_DIR.endsWith(sep) ? LIB_DIR : LIB_DIR + sep` — or better, avoid prefix strings entirely, see
§3.)

---

## 3. Fix direction for the guard + the other serving requirement

**Fix: stop comparing raw prefix strings; compare containment via `path.relative`, and derive the
root through the same native resolution as the leaf.**

```ts
import { normalize, realpathSync } from 'node:fs'
import { isAbsolute, relative, sep } from 'node:path'

// Canonicalize the ROOT through the same API as the leaf, once at startup:
const LIB_DIR = normalize(realpathSync(fileURLToPath(new URL('.', import.meta.url))))

function escapesLib(candidate: string): boolean {
  const relBack = relative(LIB_DIR, candidate)
  return relBack === '' || relBack.startsWith('..') || isAbsolute(relBack)
}

// guards become:
if (!abs.startsWith(LIB_DIR + sep) || escapesLib(abs)) { 403 }   // pre-realpath, traversal check
const file = normalize(realpathSync(abs))
if (escapesLib(file)) { 403 }                                     // post-realpath, escape check
```

Why this is robust on **both** platforms:

- `path.win32.relative` finds the common base **case-insensitively** (it lowercases both resolved
  inputs for the comparison and returns the remainder preserving the candidate's case). Verified
  against the fixture's exact values: `path.win32.relative("E:\\…\\lib",
  "e:\\…\\lib\\mermaid-chunk.js")` → `"mermaid-chunk.js"` — accepted on Windows, where the OS
  itself treats those as the same path. `path.posix.relative` stays byte-exact, which is correct
  for case-sensitive POSIX filesystems. So `relative()` encodes exactly each platform's own
  filesystem semantics, with no `platform === 'win32'` branching to get wrong. (A case-folded
  `a.toLowerCase().startsWith(b.toLowerCase() + sep)` on win32 also works, but `relative()` is the
  standard, traversal-aware form; do **not** case-fold on POSIX.)
- Canonicalizing `LIB_DIR` through `realpathSync` means root and leaf now come from the *same*
  native path resolution (`GetFinalPathNameByHandle`), so their casing can never diverge — and it
  also makes the guard correct when the plugin is installed via a junction/symlink (common with
  pnpm/link installs, cf. the skill's S14 junction card): both sides resolve to the physical tree.
- Belt-and-braces: normalize the comparison root to exactly one trailing `sep` (see the latent
  doubled-separator note in §2), or rely on `relative()` which is insensitive to it.

**The other serving requirement for a dynamic import to work at all: a correct JavaScript MIME
type.** Module scripts are fetched under the browser's *strict MIME checking*: the response must
carry a JavaScript MIME type (`application/javascript` / `text/javascript`) or the import fails
even with HTTP 200 ("Refused to execute script … strict MIME type check"). The route already sends
`content-type: application/javascript; charset=utf-8` — keep that invariant for every file this
route serves, and any future static-resource route must do the same (no `application/octet-stream`
fallback). Secondary, same class: the import must be same-origin (or the route must add
`Access-Control-Allow-Origin`); here the chunk URL and the page share `127.0.0.1:3080`, so
same-origin holds, but any dev-proxy port mismatch would reintroduce a CORS failure. Module fetches
are always `GET`, so the route's 405-for-non-GET is fine.

---

## 4. Incident 3 — why BOTH Ctrl+scroll handlers fire, and the ownership rule

**Mechanism.** One Ctrl+wheel gesture is **one event** dispatched along the composed path:
capture phase (window → document → … → target) then bubble phase (target → … → window). Two
independent listeners on that path both run unless one of them stops propagation *at the right
phase*:

- The pane's font-size zoom listener is registered on an **ancestor** of the modal content (pane
  container, document or window), and the modal's diagram-zoom listener on the modal element
  (target). If the modal's handler only calls `preventDefault()`, that cancels the browser's
  default wheel action — it does **not** stop other listeners; the event keeps bubbling and the
  pane's handler also runs → both resize.
- Phase mismatch makes naive "stopPropagation" useless the other way too: if the host registered
  its handler in the **capture** phase on document/window, it fires *before* any
  bubble/target-phase `stopPropagation()` inside the modal can act. `stopPropagation()` only
  prevents listeners *downstream in the dispatch order* (later phases, further nodes); and when two
  listeners sit on the *same node*, only `stopImmediatePropagation()` prevents the second one.
- Common amplifier: `wheel` listeners added to `window`/`document`/`body` without
  `{ passive: false }` are **passive by default** in Chrome, so a `preventDefault()` inside them is
  silently ignored — another way "I handled it" fails to actually claim the gesture.

So both handlers fire because **neither side owns the gesture**: the event legitimately reaches
both the inner modal listener and the outer pane listener, and nothing in the dispatch order or in
either handler says "stop after the first one."

**Ownership rule: the topmost interactive surface under the pointer owns the gesture; while it is
open/engaged, exactly one handler acts and outer surfaces must defer.** Concretely:

- Modal side (owner while open): register a **capture-phase, non-passive** listener on
  `window`/`document` for the modal's lifetime; if `event.composedPath()` intersects the modal
  root, handle it and claim it: `preventDefault(); stopPropagation(); stopImmediatePropagation();`
  zoom only the diagram. Remove the listener on close (and re-enable pane zoom).
- Or/and host side (deferral contract): the pane's Ctrl+wheel handler ignores events whose
  `event.composedPath()` includes an element that declares zoom ownership (e.g. an open dialog
  marked `data-zoom-owner`) — "innermost owner wins". Then both sides agree by contract instead of
  by registration-order luck.
- Never rely on bubbling order or on `preventDefault()` alone; and register wheel handlers with
  `{ passive: false, capture: true }` so claiming is actually possible.

---

## 5. Regression tests that would have caught incidents 1–3

1. **Artifact integrity (catches 1 at build time).** After `pnpm build` / before publish, scan the
   emitted lazy entry chunk for relative import specifiers (`import './x.js'` / `from "./…"`) and
   assert (a) every referenced file exists in the `pnpm pack` tarball listing, or — with the
   single-chunk strategy — (b) the chunk contains **zero** relative chunk imports. Pure Node test
   over build output; runs in seconds on every CI push and would have flagged the 97 missing
   siblings pre-release.
2. **Mount smoke with real dynamic import (catches 1 + 2 end-to-end).** Per the skill's layered
   validation checklist (`references/rollup-0.1.2.md`): `pnpm build && pnpm pack` → install the
   tarball into a fresh scratch profile (`dsh plugin add file:<tarball>`) → `dsh web --port 0` →
   Playwright headless loads a page containing a ```mermaid fence; assert the diagram marker
   renders (`svg`), and assert **no** `Failed to fetch dynamically imported module` / 403/404 in
   the console and network log ("lazy chunks delivered correctly"). Run this matrix on **Linux CI
   and a Windows runner** — the CI note's own table is the template; a Windows runner would have
   reproduced the `E:`-drive 403 (any drive letter whose canonical casing differs from the
   launch path does it).
3. **Guard unit tests with adversarial casings (catches 2 deterministically).** Table-driven tests
   for the containment function using `path.win32`/`path.posix` fixtures: root `E:\…\lib` vs
   realpath `e:\…\lib\mermaid-chunk.js` → **accepted**; `..\` traversal, sibling dir
   (`E:\…\lib-evil\…`), absolute-outside, empty string → **rejected**; POSIX exact-case semantics →
   mismatched case **rejected**. Plus a route-level integration test: start the host route against
   a lib dir, `GET` the chunk, expect `200` + `content-type: application/javascript` (pins the MIME
   requirement from §3), and expect 403/404 for traversal and non-JS targets. On Windows, exercise
   the *real* `realpathSync` (not mocked), since its casing behavior is the thing under test.
4. **Gesture ownership tests (catches 3).** (a) Component/jsdom test: with the modal open, dispatch
   a `WheelEvent('wheel', { ctrlKey: true, cancelable: true })` from inside the modal; spy on the
   pane's font-zoom handler and assert it did **not** run, while the diagram scale changed; repeat
   with the modal closed and assert the pane zoom applies and the diagram is untouched. Assert the
   modal's listener is registered non-passive and calls `stopImmediatePropagation` (or that the
   host defers on `composedPath`). (b) One Playwright interaction test in the mount smoke: press
   Ctrl+scroll over the open modal, compare computed pane `font-size` before/after (must be equal)
   and the diagram transform (must change), then close the modal and assert pane Ctrl+scroll works
   again.

---

## Summary

| Incident | Root cause | Fix |
|---|---|---|
| 1 · sibling 404s | Dynamic import loads an atomic module graph; default splitting emitted ~97 sibling chunks the package whitelist never shipped; one 404 fails the whole `import()` | Ship a single self-contained chunk (`inlineDynamicImports`), or ship *all* emitted chunks; keep an artifact-import-integrity test |
| 2 · Windows 403 | Case-sensitive `realpath.startsWith(LIB_DIR + sep)`: `import.meta.url` preserves launch-time casing (`E:\…`), `realpathSync` returns canonical FS casing (`e:\…`); Windows is case-insensitive but case-preserving, `startsWith` is not | Containment via `path.relative` (case-insensitive on win32, exact on POSIX) + canonicalize `LIB_DIR` through `realpathSync`; single-trailing-`sep` root |
| 3 · double zoom | One wheel event dispatches through both the modal (target) and the pane's ancestor listener; `preventDefault` ≠ `stopPropagation`, capture-phase ordering and passive-listener defaults defeat naive claims | Innermost-owner-wins: modal claims the gesture (capture, non-passive, `stopImmediatePropagation`) and/or pane defers on `composedPath()` |
