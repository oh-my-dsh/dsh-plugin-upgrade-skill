# JUDGE BRIEF · skill.S11-mermaid-lazyload-trap

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

# S11 · Mermaid Lazy-Load Trap — Root-Cause & Fix Report

Plugin: `@org/dsh-attach-input` v0.4.0 (lib-only bundle), mermaid diagram rendering in the
markdown reading mode, shipped as a lazily-imported chunk served by a host prefix route.

Sources (read-only, unchanged): `fixture/chunk-route.ts`, `fixture/console-split-chunks.txt`,
`fixture/console-403-windows.txt`, `fixture/ci-note.md`. Platform claims were additionally
verified against Node's `node:path` / `node:fs` / `node:url` semantics on this Windows host
(see Appendix A). This is a diagnosis + fix + regression-coverage report; no code was executed
against the fixture and nothing outside the cell was touched.

---

## 0. TL;DR — three independent root causes

1. **Split chunks (incident 1).** A code-split lazy chunk is *not self-contained*: its relative
   sibling `import()` specifiers are resolved by the browser against the chunk's own URL, and the
   sibling files were never shipped in the package, so every per-diagram import 404'd. Fix on the
   build side: emit ONE self-contained chunk (`inlineDynamicImports`), or ship + serve every sibling.
2. **Windows 403 (incident 2).** The post-realpath containment guard compares with **case-sensitive**
   `String.prototype.startsWith`. On the production host `realpathSync` returned a **lowercased drive
   letter** (`e:`) while `LIB_DIR` (from `fileURLToPath(import.meta.url)`) kept the install-path case
   (`E:`). NTFS is case-insensitive so both strings name the same file, but the byte compare fails →
   false "path escapes the plugin lib" → 403. Fix: compare canonical-to-canonical via
   `path.relative` with case-folding on win32, and serve with a JavaScript MIME type (mandatory for
   `import()`).
3. **Zoom double-handling (incident 3).** The pane and the modal both subscribe to Ctrl+wheel on
   **overlapping propagation scopes** with **no single owner**, so one gesture reaches both handlers
   and both the diagram scale and the pane font-size change. Fix: the modal owns Ctrl+wheel
   exclusively while open (`preventDefault` + `stopPropagation`) and the pane gates on overlay state.

---

## 1. Incident 1 — why the split-chunk approach failed

### What the build emits, and what breaks at runtime

With default code-splitting the mermaid entry fans out into an entry chunk plus ~97 siblings
(`mermaid-chunk.js`, `src-BfvxrPJe.js`, `pie-WAS4IAKB-CQHCQWWM.js`, …). The entry chunk is **not** a
closed unit: it contains `import('./pie-WAS4IAKB-CQHCQWWM.js')`-style statements whose specifiers are
**relative module specifiers**. Per the ES-module spec a relative specifier is resolved against the
**referrer's URL** — i.e. against the URL the entry chunk itself was fetched from.

So once the browser loads `http://127.0.0.1:3080/dsh-attach-input/resources/mermaid-chunk.js`
(the 200 in the capture), every inner `import('./…')` is resolved to
`…/dsh-attach-input/resources/pie-WAS4IAKB-CQHCQWWM.js` and `…/src-BfvxrPJe.js` and fetched.

### Why those fetches 404

The evidence is explicit: *"the sibling files listed in its import statements were NOT shipped with
the package."* Only `mermaid-chunk.js` made it into `lib/`. The route's own logic is then correct —
for a missing file `realpathSync(abs)` throws and the handler returns 404 (`not found`). The 404 is a
symptom, not the bug. The bug is a **publish/emit gap** layered on top of the bundler's multi-file
output: the chunk's correctness now depends on sibling files that (a) must be emitted, (b) must be
included in the published tarball, and (c) must be reachable at the URL the browser derives from the
entry's own location. Ship only the entry and every internal dynamic import rejects with
`TypeError: Failed to fetch dynamically imported module`, which rejects the outer `import()` too and
triggers the code-block fallback.

### Build-side fix

**Make the lazy chunk a single self-contained module with zero sibling dynamic imports.** For a
Rollup/Vite lib build that is:

```js
// rollup.config.* / vite build.rollupOptions.output
output: { inlineDynamicImports: true }   // inline all dynamic imports into the one chunk
// and do NOT declare manualChunks for the mermaid entry
```

This inlines every dynamically-imported module into the single `mermaid-chunk.js`, so there are no
relative sibling specifiers left for the browser to resolve. (Attempt 2's "ONE self-contained chunk"
is exactly the right realization of this; the reason it is *preferable* over "ship all siblings" is
that a hand-rolled static route is easy to get wrong — incident 2 is the proof — and every extra
hashed file is one more URL the route must resolve, cache, and contain correctly.)

If code-splitting must be kept for size reasons, then BOTH of these become mandatory: emit and
publish every sibling, and serve the whole output directory under a stable prefix so the browser's
relative resolution lands on real files. That path re-opens the incident-2 class of bugs, so it is
the weaker option for a plugin resource route.

---

## 2. Incident 2 — the exact flaw in the containment guard

The route (attempt 2) guards twice with the same idiom:

```ts
const LIB_DIR = normalize(fileURLToPath(new URL('.', import.meta.url)))   // .../lib
const abs = normalize(join(LIB_DIR, rel))
if (!abs.startsWith(LIB_DIR + sep)) { res.writeHead(403).end('path escapes the plugin lib'); return }
let file
try {
  file = normalize(realpathSync(abs))
  if (!file.startsWith(LIB_DIR + sep)) { res.writeHead(403).end('path escapes the plugin lib'); return }
} catch { res.writeHead(404).end('not found'); return }
```

### The mechanism (what each API returns on each platform)

`String.prototype.startsWith` is a **case-sensitive, code-unit** comparison — `'e:\\a'.startsWith('E:\\a')`
is `false` (verified). Windows filesystems, however, are **case-insensitive**: `E:` and `e:` denote the
same volume, and two paths differing only in case name the same file. The two path sources in the
guard do not agree on drive-letter case:

| Path source | Production Windows (DSH on `E:\`) | Windows laptop (DSH on `c:\`) | Linux CI |
|---|---|---|---|
| `fileURLToPath(new URL('.', import.meta.url))` → `LIB_DIR` | `E:\…\lib` (install-path case, **upper**) | `c:\…\lib` (lower) | `/…/lib` (single root, no drive letter) |
| `realpathSync(abs)` → `file` | `e:\…\lib\mermaid-chunk.js` (**lower** drive letter) | `c:\…\lib\mermaid-chunk.js` (matches) | `/…/lib\mermaid-chunk.js`→`/…/lib/mermaid-chunk.js` (case preserved) |
| `file.startsWith(LIB_DIR + sep)` | **false → 403** | true → 200 | true → 200 |

The fixture's own debug output is the smoking gun:

```
LIB_DIR   = "E:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib"
realpath  = "e:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\mermaid-chunk.js"
```

`LIB_DIR` is derived from the module URL (`fileURLToPath` preserves whatever case the URL carried —
here the install-path case `E:`), whereas `realpathSync` returns the kernel-canonicalized path whose
drive letter Node renders lowercased (`e:`). The **first** guard passes because `abs = join(LIB_DIR, rel)`
inherits `LIB_DIR`'s case, so `abs.startsWith(LIB_DIR + sep)` is a same-case compare. The **second**
(post-realpath) guard fails because it compares the lowercased-realpath `file` against the
uppercase `LIB_DIR` — a pure case divergence on an in-lib path. That is why the log reports
"path escapes the plugin lib" for a file that is plainly inside `lib/`, and why the fallback fires.

Reproduced exactly by simulating the two guards (Appendix A, Variant B): with an uppercase-`E` base
and a lowercase-`e` realpath, guard 1 = pass, guard 2 = **403**; with consistent case (Variant A =
Linux, Variant C = laptop) both guards pass.

**Why "Windows is unreliable" is the wrong takeaway.** Nothing is unreliable; the code is doing a
case-sensitive string compare on a case-insensitive filesystem. Linux never diverges because there is
no drive letter and a case-sensitive FS forces both APIs to emit identical case. The laptop passed
only because both sources happened to agree on lowercase `c:` there. The production host is simply the
first machine where the two APIs disagreed — so any environment that produces a drive-letter (or any
component) case mismatch between the URL-derived base and the realpath-derived candidate will 403.

### Secondary latent bug in the same idiom (`LIB_DIR + sep`)

`fileURLToPath(new URL('.', import.meta.url))` yields a **trailing separator** (`…\lib\`, verified),
and `normalize` preserves it. So `LIB_DIR + sep` becomes `…\lib\\` (double separator). If `LIB_DIR`
ever carries that trailing separator, BOTH guards reject even same-case in-lib paths because
`abs`/`file` contain `…\lib\<name>` (single separator) which does not start with `…\lib\\`
(Appendix A, Variants D/E — both guards false on every platform). This is not the failure the
production host hit (there `LIB_DIR` evidently had no trailing separator), but it is a real
fragility of hand-rolled `base + sep` prefix math and is removed by the fix below.

---

## 3. Fix direction for the guard + the one other serving requirement

### The comparison to use

Replace the manual `startsWith(base + sep)` prefix math with a **canonical, case-correct containment
check**:

```ts
import { normalize, join, relative, isAbsolute, sep } from 'node:path'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Canonicalize the lib root through the SAME realpath used for candidates, so symlinks and
// drive-letter case are resolved identically on both sides. Strip the trailing separator.
const LIB_DIR = normalize(realpathSync(fileURLToPath(new URL('.', import.meta.url))))

// Windows paths are case-insensitive; POSIX paths are case-sensitive.
const fold = (p: string) => (process.platform === 'win32' ? p.toLowerCase() : p)

function isInside(parent: string, child: string): boolean {
  const rel = relative(fold(parent), fold(child))
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel))
}

// in the handler:
const abs = normalize(join(LIB_DIR, rel))
if (!isInside(LIB_DIR, abs)) { res.writeHead(403).end('path escapes the plugin lib'); return }
let file
try { file = normalize(realpathSync(abs)) }          // resolve symlinks
catch { res.writeHead(404).end('not found'); return }
if (!isInside(LIB_DIR, file)) { res.writeHead(403).end('path escapes the plugin lib'); return }
const data = await readFile(file)
res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8' })
res.end(data)
```

**Why this is robust on both platforms:**

- **`path.relative(parent, child)` computes a relationship, not a byte prefix.** If `child` is inside
  `parent`, the result is a clean relative name with no leading `..`; if it escapes, the result starts
  with `..` (or is absolute on a different root). This is inherently immune to the sibling-prefix
  collision a bare `startsWith(parent)` would mis-classify (e.g. `…/lib` vs `…/lib-evil`), and it
  removes the fragile `parent + sep` concatenation that double-separates on a trailing-slash base.
- **Case-folding on win32 makes the compare agree with the filesystem.** Folding both operands with
  `toLowerCase()` before `relative` means a drive-letter or component case difference between the
  URL-derived base and the realpath-derived candidate can no longer produce a false escape. On POSIX
  we do *not* fold, because the FS is case-sensitive and `LIB` genuinely differs from `lib` — folding
  there would wrongly merge distinct paths. (Verified in Appendix A: prod-mismatch → inside = true,
  `lib-evil` sibling → escape = false, real escape → false.)
- **Realpath on both sides preserves the symlink defense.** The point of the second guard is to stop a
  symlink inside `lib` pointing outside; comparing `realpath(candidate)` against
  `realpath(LIB_DIR)` keeps that protection while eliminating the false positive (both sides now share
  the same canonical drive-letter case and resolved symlink prefix).

### The one other serving requirement for a dynamic import to work at all

**The chunk must be served with a JavaScript MIME type.** A dynamic `import()` is an ES-module fetch
and the browser enforces strict module MIME checking: a 200 whose `Content-Type` is not a JavaScript
type (`text/javascript`, `application/javascript`, …) is rejected ("Expected a JavaScript module
script but the server responded with a MIME type of …"), so the import fails even after the 403 is
fixed. The route already sends `application/javascript; charset=utf-8` — that is correct and must be
preserved; a common regression is a later refactor routing the resource through a generic static
handler that serves it as `text/plain`/`application/octet-stream` or forgets the header. (Same-origin
here, so no CORS header is needed; only a cross-origin chunk would additionally require
`Access-Control-Allow-Origin`.)

---

## 4. Incident 3 — why BOTH handlers fire on one Ctrl+scroll under the modal

### Setup

The reading pane has a Ctrl+wheel handler that changes the **pane font-size** (a zoom-text affordance).
The plugin's fullscreen zoom modal has its own Ctrl+wheel handler that **scales the mermaid diagram**
(a CSS transform). With the modal open, one Ctrl+scroll changes both.

### Why both fire (listener ordering / propagation)

A Ctrl+wheel over the modal dispatches a **single** `wheel` event (`ctrlKey: true`) whose target is
inside the modal. That event then propagates. The two handlers sit on **overlapping propagation
scopes** — e.g. the pane listens on its container (or on `window`), and the modal listens on itself
(or also on `window`). Neither handler yields the gesture:

- the modal's handler does not `stopPropagation()`, so after it runs the event keeps bubbling to the
  pane's ancestor/`window` listener, which runs too; and
- even if it did `stopPropagation()`, a pane listener registered in the **capture phase** on an
  ancestor (or on `window` with `{ capture: true }`) executes *before* the modal's target-level bubble
  listener — capture always runs ancestor→target, ahead of any descendant bubble handler — so the pane
  would still act.

The deterministic dispatch order (capture: document→target; then bubble: target→document; within one
node, registration order) delivers the one event to both listeners because both are subscribed to the
same gesture on the same path. There is no single owner, so both react. (This is precisely the
event-listener-ordering failure mode: two independent features each claim a global-ish gesture with no
coordination.)

### The ownership rule that fixes it

**Exactly one surface owns a given input gesture at a time; the innermost active surface wins and
stops propagation.** Concretely, while the zoom modal is open it is the topmost active surface and is
therefore the exclusive owner of Ctrl+wheel:

```ts
// modal handler (owns the gesture while open):
function onModalWheel(e: WheelEvent) {
  if (!e.ctrlKey) return
  e.preventDefault()      // suppress browser page zoom
  e.stopPropagation()     // do not let the pane's bubble listener see it
  setDiagramScale(s => s * (e.deltaY < 0 ? 1.1 : 1 / 1.1))
}

// pane handler (defers to the owner — order-independent, also covers capture-phase panes):
function onPaneWheel(e: WheelEvent) {
  if (!e.ctrlKey) return
  if (zoomModalOpen) return                       // ownership gate: modal owns it
  if ((e.target as Element)?.closest('[data-zoom-modal]')) return
  e.preventDefault()
  setPaneFontSize(px => clamp(px * (e.deltaY < 0 ? 1.1 : 1 / 1.1)))
}
```

The `stopPropagation()` alone is not sufficient (capture-phase ancestors, arbitrary registration
order), so the pane additionally **gates on shared ownership state** (`zoomModalOpen`, or a target
`closest()` probe). This makes the behavior independent of capture-vs-bubble and of which listener
registered first: whichever runs, only the owner acts. When the modal closes, ownership reverts to the
pane and Ctrl+wheel on the pane resumes changing font-size. The general principle: **a descendant that
claims a gesture must stop its propagation, and ancestors must not act on an event a descendant has
claimed.**

---

## 5. Regression tests that would have caught incidents 1–3 before release

### Incident 1 — sibling dynamic-import 404

1. **Build-graph closure test** (runs after the production build): load/parse `mermaid-chunk.js`, extract
   every `import(...)` / `import … from '…'` specifier, and assert each is either a bare specifier
   (resolved/inlined by the bundler) or, if relative (`./…`), that the referenced file exists in `lib/`
   **and** is in the package's published file set. Fail on any missing relative sibling. This directly
   encodes "the sibling files were NOT shipped."
2. **Published-tarball integrity test**: `npm pack --dry-run` (or read `files` + `.npmignore`) and assert
   every runtime-referenced chunk is present in the tarball.
3. **Enforce single-file lazy chunk** (preferred, makes 1 & 2 structural): a unit test on the
   Rollup/Vite config asserting `output.inlineDynamicImports === true` (or that the mermaid entry emits
   exactly one asset), so no sibling references can exist at all.
4. **Serve-and-import E2E** (Playwright/Puppeteer): serve `lib/` through the real host route, then in a
   real browser `await import('/dsh-attach-input/resources/mermaid-chunk.js')`; assert it resolves and
   that the network log contains **no 404** for any `…/resources/*.js`. This is the one test that would
   have failed attempt 1 (and would also have caught attempt 2's MIME/403 problems) end to end.

### Incident 2 — Windows 403 case mismatch

1. **Cross-platform containment unit test** (the key one): test the `isInside(parent, child)` helper
   parametrized over simulated `win32`/`posix` inputs. Assert:
   `isInside('E:\\…\\lib', 'e:\\…\\lib\\mermaid-chunk.js') === true` on win32 (case-only drive
   difference is inside — this reproduces the exact production failure that Linux CI could never
   surface); `isInside('E:\\…\\lib', 'E:\\…\\lib-evil\\x.js') === false` (sibling prefix
   collision escapes); `isInside('E:\\…\\lib', 'E:\\…\\other\\x.js') === false` (real escape).
   On posix, assert case-sensitivity is preserved: `isInside('/a/lib', '/a/LIB/x') === false`.
2. **Realpath-mismatch pin**: feed the guard a base from `fileURLToPath` (uppercase) and a candidate
   from a mocked `realpathSync` (lowercase drive) and assert **200, not 403** — locks the specific
   regression so a future refactor to `startsWith` fails CI.
3. **Symlink-escape still blocked**: a symlink inside `lib` pointing outside must still yield 403
   (guards against a fix that over-corrects and weakens containment).
4. **Run the route suite on a Windows runner** and add a case where the install drive's letter case
   differs from what `realpathSync` returns. The root process gap was that the guard was only ever
   exercised on Linux CI, where the two path sources never diverge.

### Incident 3 — both zoom handlers fire

1. **Exclusive-ownership interaction test** (Playwright): render a mermaid diagram in the pane, open the
   zoom modal, dispatch `wheel` with `ctrlKey: true` over the modal; assert **only** the diagram's
   scale transform changed and the pane's computed `font-size` is unchanged, and that
   `event.defaultPrevented === true` (page zoom suppressed). Direct reproduction of the complaint.
2. **Single-owner invariant**: with both handlers instrumented (spies), dispatch one Ctrl+wheel under
   the modal and assert **exactly one** handler ran (invocation count === 1). Catches "both fire."
3. **Ownership is order-independent**: run the same assertion with the pane listener registered in both
   capture and bubble phase, and with both registration orders, asserting the pane handler still no-ops.
4. **Two-state test**: modal closed → Ctrl+wheel on the pane still changes font-size (fix didn't break
   the base feature); modal open → it changes only the diagram.

---

## Appendix A — verification notes (this Windows host, Node)

All claims above were checked with `node:path` / `node:fs` / `node:url` in a read-only script; no fixture
file was modified.

- `String.startsWith` is case-sensitive: `'e:\\a\\b.js'.startsWith('E:\\a\\')` → `false`;
  `'E:\\a\\b.js'.startsWith('E:\\a\\')` → `true`.
- `path.win32.normalize('E:\\a\\b\\')` → `E:\a\b\` (trailing separator preserved), and
  `fileURLToPath(new URL('.', 'file:///E:/…/lib/index.js'))` → `E:\…\lib\` (trailing separator), so
  `LIB_DIR + sep` double-separates when the base keeps its trailing slash (Variants D/E below).
- Guard simulation (`fileURLToPath` base vs `realpathSync` candidate, `rel = 'mermaid-chunk.js'`):
  - **A** Linux / consistent case (upper/upper): guard1 = pass, guard2 = **pass** → 200.
  - **B** production (base `E:` upper, realpath `e:` lower): guard1 = pass, guard2 = **fail → 403**.  ← matches the incident.
  - **C** laptop (both `c:` lower, agree): guard1 = pass, guard2 = pass → 200.
  - **D/E** base carries a trailing separator (`…\\lib\\`): guard1 = **fail**, guard2 = **fail** → 403 on every platform (latent `+ sep` bug).
- Robust `isInside` via `path.relative` with win32 case-fold: prod-mismatch inside → `true`;
  `lib` vs `lib-evil` sibling → `false`; real escape (`…/other/…`) → `false`. On POSIX the same helper
  stays case-sensitive (`/a/lib` vs `/a/LIB` → escape).
- Note: on *this* particular host `realpathSync` happened to return the drive letter in the same case as
  the input, so the case divergence is not universal — but the fixture's production host proves the two
  APIs *can* disagree, and `startsWith` cannot tolerate that. The `relative` + case-fold fix is correct
  regardless of which API lowercases.



## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.