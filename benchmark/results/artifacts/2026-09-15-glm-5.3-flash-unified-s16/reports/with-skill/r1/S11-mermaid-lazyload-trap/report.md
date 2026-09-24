# S11 · Mermaid Lazy-Load Trap — Diagnosis Report

Task: three sequential rollout incidents in `@org/dsh-attach-input` v0.4.0 (lib-only, Web plugin)
after adding mermaid rendering as a lazily-imported chunk served by a new host prefix route.

Evidence base (read-only, unchanged): `fixture/chunk-route.ts`, `fixture/console-split-chunks.txt`,
`fixture/console-403-windows.txt`, `fixture/ci-note.md`. Method: root causes derived from the
evidence plus executable verification of the underlying semantics (Node 26.7.0; scripts and
transcripts in the Appendix). No fixture file was modified; nothing was executed from the fixture.

## Executive summary

| # | Symptom | Root cause (one line) | Fix |
|---|---|---|---|
| 1 | Entry chunk 200, siblings 404, `import()` rejects | Bundler code-splitting emitted sibling chunks that were never shipped; one failed fetch rejects the whole dynamically-imported module graph | Build the lazy entry as a single self-contained bundle (`output.inlineDynamicImports`), or ship the entire emitted chunk set |
| 2 | 403 on Windows Server (E:\), green on Linux and on a C:\ laptop | `fs.realpathSync` on win32 returns the on-volume canonical casing (`e:\…`) while `fileURLToPath(import.meta.url)` carries the loader's spelling (`E:\…`); the `startsWith` containment compare is byte-wise case-sensitive → guard misfires | Replace the prefix compare with a `path.relative`-based containment check (case-folds on win32, exact on posix); keep the realpath step |
| 3 | Ctrl+scroll zooms diagram AND pane font size | One `wheel` event bubbles through both listeners; neither claims the gesture (`stopPropagation`) nor filters by target ownership | Ownership rule: the innermost interactive surface under the pointer owns the gesture — modal claims ctrl+wheel while open (`preventDefault` + `stopPropagation`, `{passive:false}`); pane ignores events targeting plugin overlays |

---

## 1. Incident 1 — why the split-chunk attempt failed

**What the console shows.** `mermaid-chunk.js` itself returned **200** (8.1 kB), then
`src-BfvxrPJe.js` and `pie-WAS4IAKB-CQHCQWWM.js` returned **404**, and the whole feature fell back
to a code block. The `ls` note says the siblings were **not shipped** with the package.

**Mechanism.** A dynamic `import('./mermaid-chunk.js')` is not "fetch one file". ESM requires the
browser to fetch, link, and evaluate the **entire module subgraph** reachable from that chunk
before the `import()` promise settles. The bundler's default code-splitting did not put all of
mermaid into one file: it carved the graph into an entry chunk plus shared sibling chunks
(per-library code like `src-…` and per-diagram components like `pie-…`), which the entry references
with **static relative imports** (resolved against the entry chunk's own URL, i.e. under
`/dsh-attach-input/resources/`). The publish/pack step shipped only the named entry
(`mermaid-chunk.js`) — the hash-named siblings were never copied into `lib/`. Result: entry 200,
each static import 404, and per ESM semantics **a single failed fetch in the graph rejects the
entire `import()`** with `TypeError: Failed to fetch dynamically imported module` — even though the
top-level chunk was served perfectly.

Verified (Appendix A): an entry that statically imports a missing sibling rejects with
`ERR_MODULE_NOT_FOUND` while the entry file itself exists; the identical entry resolves once the
sibling is shipped; a self-contained entry with no relative imports resolves alone.

Two aggravating details worth naming:
- The entry filename is stable (`mermaid-chunk.js`) but sibling filenames are **content-hashed** —
  so even a partial copy would 404 after every rebuild that shifts a hash.
- "My chunk loaded fine (200)" in the log is exactly the trap: the fetch of the entry succeeded; the
  failure is in the rest of the graph, which the console attributes to the same `import()` call.

**Build-side fix.** Make the lazy entry emit as **one self-contained file** so a dynamic import
fetches exactly one byte stream and has no siblings to lose:

- Rollup/Rolldown/tsdown output option `inlineDynamicImports: true` (Vite:
  `build.rollupOptions.output.inlineDynamicImports`) for a **dedicated single-entry build** of the
  mermaid renderer — that is precisely the "attempt 2: ONE self-contained chunk" shape, and it is
  the correct end state for a lib-only plugin bundle served out of its own `lib/` dir. (The option
  requires a separate/isolated build config for that entry; it cannot coexist with multi-entry
  splitting in the same output.)
- The alternative — keep code-splitting but ship **every** emitted chunk (pack/`files` covering the
  whole dist dir, not just the entry) — also restores graph completeness, but pins the plugin's
  served surface to hashed files and is why the self-contained route was the better call here.

## 2. Incident 2 — the exact flaw in the guard (403 on Windows, green on Linux)

**What the evidence pins down.** Same plugin version, same route code: Linux CI green; Windows 11
laptop (C:\) green; Windows Server 2022 on **E:\** — every chunk GET 403 with the log line
`path escapes the plugin lib`, for a file "plainly inside the lib directory". The debug session
printed, verbatim:

```
LIB_DIR   = "E:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib"
realpath  = "e:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\mermaid-chunk.js"
```

The only difference is the **case of the drive letter** (`E:` vs `e:`).

**Mechanism, per API and platform.** The route builds its containment root and its target with two
APIs whose casing comes from different authorities:

| API | Windows (NTFS/ReFS) | Linux (ext4 etc.) |
|---|---|---|
| `path.normalize` / `path.join` | Pure string ops — return the input spelling verbatim (`E:\…`) | Verbatim |
| `fileURLToPath(new URL('.', import.meta.url))` (line 5) | Pure URL→string mapping — drive-letter case is whatever the module URL carries, as the ESM loader resolved it (`E:\…`) | Verbatim percent-decode |
| `fs.realpathSync` (line 19) | Resolves through the filesystem (libuv `uv_fs_realpath` → `GetFinalPathNameByHandleW`); returns the **on-volume canonical casing** — the drive letter/volume components come back as the volume reports them (`e:\…`), independent of the input spelling. It succeeds, because win32 filesystems are case-insensitive: both spellings denote the same file | Resolves symlinks; with none present the result is byte-identical to the input |
| `String.prototype.startsWith` (line 20) | **Code-unit comparison — case-sensitive, filesystem-unaware** | Same |

So on Windows the two sides of `file.startsWith(LIB_DIR + sep)` take their casing from two
different sources; here they diverge on the drive letter, the comparison returns `false`, and the
guard 403s a file that is inside the directory. On Linux there is a single authority (the on-disk
byte spelling), the realpath output is case-identical to the input prefix in the absence of
symlinks, and the check passes — hence "Linux green". The maintainer's Windows 11 laptop passed
only by coincidence: both sources happened to spell `C:` the same way there. The first guard
(line 16, `abs.startsWith(LIB_DIR)`) can never misfire this way, because `abs = join(LIB_DIR, rel)`
inherits LIB_DIR's casing verbatim — which is exactly why the log shows the **second** branch
fired. The maintainer's conclusion "Windows paths are unreliable" mis-locates the defect: the
platform is consistently case-insensitive; the bug is a **byte-wise case-sensitive prefix check
applied to a case-insensitive filesystem**, comparing strings produced by two differently-sourced
APIs.

Verified (Appendix B): replaying the guard with the fixture's verbatim production values —
`abs.startsWith(LIB_DIR)` → `true` (passes), `realpath.startsWith(LIB_DIR)` → `false` (the 403),
on the exact file `mermaid-chunk.js`.

## 3. Fix direction for the guard, plus the other serving requirement

**Fix: compare containment with `path.relative`, not `startsWith`.** Factor the check into a
helper and use it at **both** guard sites (lexical and post-realpath):

```ts
import { relative, isAbsolute, sep } from 'node:path'

const contained = (root: string, target: string): boolean => {
  const rel = relative(root, target)
  return rel === '' || (!rel.startsWith('..' + sep) && !isAbsolute(rel))
}
// guard: if (!contained(LIB_DIR, abs) || !contained(LIB_DIR, file)) → 403
```

Why this is robust on both platforms (verified, Appendix B):

- On **win32**, `path.relative` **folds case** when computing the common base:
  `relative('E:\\…\\lib', 'e:\\…\\lib\\mermaid-chunk.js')` → `'mermaid-chunk.js'` — the exact
  production divergence now classifies as inside, 200. It also treats both `/` and `\` as
  separators, so mixed-separator spellings can't split the prefix either.
- Escape classes stay rejected: `…/lib/../../package.json` → `'..\..\package.json'` (starts with
  `..` + sep → 403); a different drive (`C:\evil.js`) → `relative` returns an **absolute** path,
  caught by `isAbsolute` → 403.
- On **posix**, `path.relative` is exact and case-sensitive (`relative('/srv/lib','/srv/LIB/x')`
  → `'../LIB/x'` → rejected), preserving strict Linux semantics with no platform branch in the
  plugin code.
- Keep the `realpathSync` step and the post-realpath check as-is apart from the comparison: the
  realpath canonicalization is what catches **symlinks/junctions pointing outside `lib/`** (common
  on Windows installs), and the lexical check ahead of it still handles URL-encoded traversal
  (`..%2F`, `%5C`) because `decodeURIComponent` + `join` + `normalize` collapse those before the
  test. Only the string comparison was case-brittle. An acceptable equivalent is to
  `toLowerCase()` both sides before `startsWith` when `process.platform === 'win32'`; the
  `relative()` form is preferred because it needs no platform switch and also normalizes separators.

**The other serving requirement: a JavaScript MIME type.** Module loads (dynamic `import()`
included) are strictly MIME-checked by browsers: if the response's `Content-Type` is not a
JavaScript type, the browser refuses to execute the module and the `import()` promise rejects with
the same `Failed to fetch dynamically imported module` signature — even though the bytes arrived
with HTTP 200. The route already does this correctly
(`content-type: application/javascript; charset=utf-8`, and error paths return 4xx without bodies
that could masquerade as scripts); the requirement is to **preserve** it — e.g. if the handler is
later replaced by a generic static-file middleware, a wrong/absent MIME type (or a 200+HTML error
page for unknown paths) reintroduces the same failure class. Related hard requirement of the same
family: the chunk and everything it imports must be reachable **same-origin under the served
prefix**, because relative specifiers inside the chunk resolve against the chunk's own URL — this
is the bridge between the route and incident 1's graph completeness.

## 4. Incident 3 — why BOTH handlers fire on one Ctrl+scroll, and the ownership rule

**Mechanism.** One physical Ctrl+scroll produces **one** `wheel` event with `ctrlKey: true`,
dispatched to the deepest element under the pointer — inside the modal — and then **bubbled**
through the ancestor chain (capture → target → bubble). The modal's diagram-zoom handler and the
pane's font-size handler are both on that propagation path (the modal's own element vs. a pane
container/window-level listener; `wheel` bubbles, and even a fullscreen overlay does not leave the
DOM — the modal is a descendant of the app root, so the event still transits the pane's listening
ancestor, and if both handlers sit on `window`, both match trivially). Neither handler claims the
gesture — no `stopPropagation()` on the modal side, no target-ownership filter on the pane side —
so a single event mutates both: diagram scale **and** pane font size. The pane's font zoom isn't
"leaking through" the overlay visually; it is a second registered observer of the same event
object.

**Ownership rule.** A wheel gesture is owned by the **innermost interactive surface under the
pointer**, exclusively; outer surfaces handle only what falls through unclaimed:

- **Modal side (primary):** while the zoom modal is open, its ctrl+wheel listener claims the
  gesture — handle it, then `event.preventDefault()` (suppresses the browser-native Ctrl+wheel page
  zoom; the listener must be registered `{ passive: false }` for that to work) and
  `event.stopPropagation()` (`stopImmediatePropagation()` if other listeners share the same node)
  so no ancestor — including the pane's font-size handler — ever observes the event.
- **Host/pane side (defense in depth):** the font-size handler ignores events originating inside a
  plugin-owned overlay: `if (zoomModalEl.contains(event.target)) return` (or check
  `event.composedPath()`). This keeps the pane correct even against third-party overlays it does
  not control.
- With the modal closed, nothing claims the gesture and the pane behaves as before. Result: exactly
  one handler acts per event, on both platforms and in both states.

## 5. Regression tests that would have caught incidents 1–3

Mapped to the layered-validation discipline from the local skill references
(`references/rollup-0.1.2.md`: static gates ≠ runtime green; layer-4 "mount smoke … asserting lazy
chunks delivered correctly").

**Incident 1 — graph completeness of the shipped lazy chunk**
1. *Pack test (build gate):* after `pnpm build && pnpm pack`, scan the emitted lazy entry for
   static relative import specifiers (`from"./…"` / `import"./…"`) and assert every resolved target
   exists in the tarball's file list. This fails exactly the attempt-1 shape (entry shipped,
   hash-named siblings missing) and fails again on any future hash drift.
2. *Config test:* assert the mermaid entry's build output sets `inlineDynamicImports: true` and
   produces exactly one file containing zero relative import specifiers.
3. *Runtime mount smoke (closes the "static green ≠ runtime green" gap):* install the packed
   tarball into a scratch profile (`dsh plugin --profile web add file:<tarball>`), start
   `dsh web --port 0`, drive a headless (Playwright) page containing a ```mermaid fence: assert the
   dynamic import resolves, the SVG renders, and **zero** failed requests exist under
   `/dsh-attach-input/resources/*`. Per `references/migration-hygiene.md` item 3, note the fix
   lands in both halves: chunk artifacts are served by the **host half** → route changes need a
   host restart, and the client half is validated on a browser hard refresh.

**Incident 2 — route containment guard (OS-matrix unit tests)**
Factor the guard into a pure `contained(root, target)` and test it plus the full handler:
1. *The production regression, verbatim:* on win32 semantics,
   `contained('E:\\…\\lib', 'e:\\…\\lib\\mermaid-chunk.js') === true` (this test fails on the old
   `startsWith` guard on any OS, since `path.win32.*` is platform-independent); on posix semantics
   `contained('/srv/lib', '/srv/LIB/x') === false` stays strict.
2. *Traversal:* 403 for `..%2F..%2Fpackage.json`, `%5C`-encoded backslashes, and an absolute path
   after decode; cross-drive (`C:\evil.js` against `E:` root) → 403.
3. *Realpath step:* a symlink/junction inside `lib/` pointing outside → 403; missing file → 404;
   non-`.js/.mjs` → 404; non-GET → 405.
4. *Real-FS matrix run:* execute the handler tests on both `ubuntu` and `windows` CI runners, so
   the win32 `realpathSync` canonical-casing behavior is exercised end-to-end, not just simulated.
5. *Serving contract:* assert `content-type` of a chunk GET is a JavaScript MIME type (locks in the
   point-3 requirement), and 200 responses never carry an HTML body.

**Incident 3 — gesture ownership (DOM test, Playwright preferred)**
1. Open the reading-mode pane (font-zoom handler installed), open the plugin's zoom modal, dispatch
   `new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, bubbles: true, cancelable: true })` on
   the diagram element: assert the diagram scale changed, the pane font-size is **unchanged**, the
   host handler received **0** events (spy), and `preventDefault` was called (native page zoom
   suppressed).
2. Symmetric case, modal closed: the same event changes the pane font-size only.
3. Single-owner assertion: for one dispatched event, exactly one of the two state owners mutates.

---

## Residual risk / pending

- The pane's font-zoom listener source and the bundler brand are not in the evidence pack; incident
  3's fix is stated for both sides (modal claim + pane target filter) so it holds regardless of
  which side is edited first. The `inlineDynamicImports` fix is given in Rollup-output terms,
  exposed identically by Vite/Rolldown/tsdown.
- Incident 2 was verified by replaying the fixture's verbatim production strings through the win32
  path algorithms and by the case-insensitive-volume `realpathSync` demonstration on macOS
  (Appendix); the Windows-native `realpathSync` drive-letter behavior is additionally confirmed by
  the pack's own debug print (`E:` vs `e:`).
- Recommended follow-up for the maintainer: adopt the OS-matrix route-guard tests (5.2.4) before
  the next release — this defect class is invisible on a Linux-only CI by construction.

## Appendix — local verification transcripts

Scripts kept at `.diag-tmp/guard-demo.mjs` and `.diag-tmp/incident-repro.mjs` (workspace root,
outside `fixture/`). Node v26.7.0, macOS (case-insensitive APFS boot volume).

**A. Dynamic-import graph semantics (incident 1)**

```
sibling missing: import() REJECTED -> ERR_MODULE_NOT_FOUND | entry file itself exists: true
self-contained: import() RESOLVED -> "mermaid inlined"
split + sibling shipped: import() RESOLVED -> "pie"
```

**B. Casing semantics and the guard replay (incident 2)**

```
"e:\...\mermaid-chunk.js".startsWith("E:\...\lib\") => false
path.win32.relative("E:\dsh\lib", "e:\dsh\lib\mermaid-chunk.js") => "mermaid-chunk.js"
path.win32.relative("E:\dsh\lib", "E:\dsh\lib\..\..\package.json") => "..\..\package.json"
path.win32.relative("E:\dsh\lib", "C:\elsewhere\x.js")            => "C:\elsewhere\x.js"  (absolute → reject)
path.posix.relative("/srv/lib", "/srv/LIB/m.js")                  => "../LIB/m.js"        (strict on posix)
realpathSync returns on-volume canonical case: spelled "…/T/s11-case-demo-…/lib/mermaid-chunk.js"
  → realpath "…/T/s11-case-demo-…/LiB/…" casing differs from input (canonical, not input spelling)

guard replay with fixture values:
rel              = "mermaid-chunk.js"
guard#1 abs.startsWith(LIB_DIR)      = true  -> passes
guard#2 realpath.startsWith(LIB_DIR) = false -> 403 "path escapes the plugin lib"   [the bug]
fix: win32.relative(root, realpath)  = "mermaid-chunk.js" -> inside, serve 200
fix guard on traversal "../..\x"     = false (correctly 403)
fix guard on other drive "C:\evil.js"= false (correctly 403)
```
