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
#### FILE: S11-mermaid-lazyload-trap/report.md

# S11 · Mermaid Lazy-Load Trap — Root-Cause Diagnosis (read-only)

**Subject:** `@org/dsh-attach-input` v0.4.0 (lib-only bundle) — three rollout incidents
**Mode:** read-only diagnosis (fixture unchanged; report is the deliverable)
**Evidence (read-only fixture):** `chunk-route.ts`, `console-split-chunks.txt`,
`console-403-windows.txt`, `ci-note.md`
**Author's conclusion quoted & corrected:** "Windows paths are unreliable" — this is folklore.
Each incident has a *specific, derivable* mechanism: bundler module-graph semantics (1),
path/realpath canonicalization + a case-sensitive prefix test (2), and event-listener
propagation (3). None is "Windows" or "the browser" being flaky.

**Citation note (honest):** no DSH version card applies. These are bundler / Node-fs /
DOM-listener mechanics plus a host `webServer.register` route — not a host API or
dependency-cohort change. Primary sources are the fixture lines below plus Node/URL/DOM
semantics and the plugin-upgrade skill's layered validation checklist (`rollup-0.1.2.md`
layer 4: "lazy chunks delivered correctly"; web acceptance `DSH-0.1.2-A1-19`; route-auth
note in `precision-checklist.md`).

---

## Incident 1 — split chunks: every sibling import 404s

### What the evidence shows
- `console-split-chunks.txt`: the mermaid entry fetches `200 (8.1 kB)`, but each `import()`
  it performs to a **sibling** — `src-BfvxrPJe.js`, `pie-WAS4IAKB-CQHCQWWM.js` — returns
  **404**, and the top-level dynamic import then throws *"Failed to fetch dynamically
  imported module"* → fallback to a code block.
- Same file, last lines: `mermaid-chunk.js` WAS shipped, but "the sibling files listed in
  its import statements were NOT shipped with the package."

### Root cause (bundler semantics, not a server bug)
A dynamic `import()` loads a **module graph**, never a single file. With default
code-splitting the bundler emits the entry as a thin loader that contains further
`import()`/static `import` statements pointing at **content-hashed sibling chunks**
(`-BfvxrPJe-`, `-WAS4IAKB-` are Rollup/esbuild-style hashed names). The browser resolves
each specifier **relative to the chunk's own URL** (`/dsh-attach-input/resources/…`) and
fetches it as part of evaluating the graph. This is **transitive**: one missing sibling
rejects the whole top-level `import(mermaid-chunk.js)`, even though the entry itself
returned 200.

The server is exonerated: `chunk-route.ts:14` allows `/.m?js$/` and the path guard
(chunk-route.ts:16,20) would happily serve any `.js` under `lib/`. The siblings 404 because
they **do not exist on disk** — the package's `files`/`exports` and the emitted-asset set
were never reconciled. So the failure is a **build/packaging closure gap**, surfaced at
runtime by module-graph resolution.

### Build-side fix
1. **Emit the diagram entry as one self-contained chunk** — the maintainer's attempt 2
   (single 7.2 MB chunk) is the correct *direction*: no sibling imports means no graph to
   break. Concretely force mermaid + its deps into a single emitted file
   (Rollup `output.inlineDynamicImports: true` on the diagram entry, or group the whole
   graph into one chunk via `manualChunks`/`chunkFileNames`; esbuild `splitting: false`).
   **The zero-sibling guarantee matters more than bundle size.**
2. **Make packaging ship exactly what the route serves.** Whatever the bundler emits must
   appear in the published tarball (`files`, `exports`) and under the served `lib/` dir —
   no content-hashed asset may be renamed/omitted between build and pack.
3. If code-splitting is ever reintroduced for size, it is only valid with a **self-closing
   served set**: every emitted sibling reachable through the route with a JS MIME type
   (this is where incident 2's serving requirement and incident 1's closure test meet).

---

## Incident 2 — single chunk: 403 on Windows E:\, pass on Linux / C:\

### The exact flaw (mechanism, not folklore)
Two containment guards exist, and they take their two operands from **different APIs with
different case behavior**:

```
chunk-route.ts:15  abs  = normalize(join(LIB_DIR, rel))          // lexical
chunk-route.ts:16  if (!abs.startsWith(LIB_DIR + sep)) → 403     // both sides = fileURLToPath casing
chunk-route.ts:19  file = normalize(realpathSync(abs))            // hits the filesystem
chunk-route.ts:20  if (!file.startsWith(LIB_DIR + sep)) → 403    // realpath casing vs fileURLToPath casing
```

What each API returns, per platform:

| API | Source of casing | Linux (`node:24-bookworm`) | Windows |
|---|---|---|---|
| `fileURLToPath(new URL('.', import.meta.url))` (`chunk-route.ts:5`) | verbatim from the file URL; **no stat** | no drive letter; matches | drive letter taken **verbatim from the URI** → `E:` |
| `join` / `normalize` (`:15,:19`) | pure lexical; collapse `..`/`.`; **never touch case, never stat** | unchanged | unchanged → keeps `E:` |
| `realpathSync` (`:19`) | hits the FS via Win32 `GetFinalPathNameByHandleW`; resolves junctions/symlinks | returns true on-disk path = lexical path | returns OS-canonical path; **drive letter casing is a property of the volume** → `e:` (and resolves the pnpm/npm `node_modules` junction to its target's path) |
| `String.prototype.startsWith` (`:16,:20`) | raw, case-sensitive UTF-16 compare; no folding | — | `'e:\…' .startsWith('E:\…\')` ⇒ **false** |

Decoding the maintainer's own debug print (`ci-note.md:11-12`) against the code:

```
LIB_DIR  = "E:\dsh\...\lib"                    ← fileURLToPath, drive case preserved: E:
realpath = "e:\dsh\...\lib\mermaid-chunk.js"   ← realpathSync, drive case from the volume: e:
```

- Guard `:16` **passes**: `join(LIB_DIR,…)` and `LIB_DIR` share the same `E:` source.
- Guard `:20` **fails**: `file` (from `realpathSync`) starts with drive `e:`, but
  `LIB_DIR + sep` starts with `E:`. `startsWith` is case-sensitive, so
  `"e:\…".startsWith("E:\…\")` is false → the code emits the *"path escapes the plugin lib"*
  403 — exactly what `console-403-windows.txt:11-12` reports "for a path that is plainly
  inside the lib directory."

Why it passed elsewhere (`ci-note.md`):
- **Linux CI** — no drive letter; `realpathSync`'s casing equals the lexical path → match.
- **Windows 11 on C:\** — on that volume `fileURLToPath` and `realpathSync` *happened to
  agree* (`c:` = `c:`) → match. The bug is **volume/casing-divergence dependent**, not
  "Windows yes/no." Only the **uppercase `E:` on Windows Server 2022** exposed the
  `E:`≠`e:` split.

So the precise mechanism is: **mixing a `realpathSync`-derived path with a
`fileURLToPath`-derived literal in a case-sensitive `startsWith`.** `path.normalize`
removes `..` and duplicates but **does not re-case the drive letter or resolve symlinks**;
only `realpathSync` does, and on Windows it yields the volume's drive casing.

---

## Item 3 — Guard fix direction + the other serving requirement

### Fix comparison (robust on both platforms)
Canonicalize **both** sides through the **same** API so symlink/junction resolution and
drive-letter casing are produced by one source, then test containment with a comparison
that is case-insensitive on Windows:

```ts
import { realpathSync } from 'node:fs'
import { sep } from 'node:path'

// root canonicalized ONCE by the same realpath used for every target (chunk-route.ts:19)
const ROOT = realpathSync(fileURLToPath(new URL('.', import.meta.url)))
const onWin = process.platform === 'win32'
const canon = (p: string) => (onWin ? p.toLowerCase() : p)   // Windows FS is case-insensitive

function insideLib(realTarget: string): boolean {
  const root = canon(ROOT.endsWith(sep) ? ROOT : ROOT + sep)  // whole-segment boundary kept
  return canon(realTarget).startsWith(root)
}
// call site: insideLib(realpathSync(abs))
```

Why robust on both platforms:
- **Same API both sides ⇒ same casing.** Because root and target both come from
  `realpathSync`, the `E:`/`e:` divergence disappears — you never again compare a
  `fileURLToPath` literal against an `realpathSync` result. Junction/symlink targets inside
  `node_modules` (common with pnpm/npm) resolve consistently on both sides too.
- **Explicit `canon()` fold on win32 only.** Any residual NTFS/drive-letter case difference
  becomes irrelevant on Windows, matching the OS's own case-insensitive path comparison; on
  POSIX `canon` is the identity, so genuinely different-case paths stay distinct (Linux truly
  separates `Foo.js` from `foo.js`).
- **Trailing `sep`** preserves the whole-segment boundary the original already had, so a
  sibling directory like `…\lib-evil` is still rejected.
- Equivalent idiom: `path.relative(canon(root), canon(target))` and reject a result that is
  `''`, `'.'`, or `..`-prefixed / absolute. (`path.normalize`, `join`, `fileURLToPath`,
  and a raw `startsWith` are all insufficient on their own — they never reconcile the two
  casing sources.)

### The other serving requirement for a dynamic `import()` to work at all
**A JavaScript MIME type on the response.** A dynamic `import()` is a *module-script*
fetch: the browser fetches it in **CORS mode** and **refuses to execute** the module unless
the `Content-Type` is a JavaScript MIME type (`text/javascript` / `application/javascript`)
— otherwise it fails with *"Expected a JavaScript module script but the server responded
with a MIME type of …"* (a `Failed to fetch dynamically imported module` at the call site,
indistinguishable from the 404/403 in the console captures). The current handler already
sets `content-type: application/javascript; charset=utf-8` (`chunk-route.ts:23`) — so this
is the one requirement that is **already satisfied and must be preserved by the refactor**;
any reintroduced sibling chunks must carry it too. (Cross-origin would additionally require
CORS headers; here the chunk is same-origin with the page on `127.0.0.1:3080`, so CORS is
not implicated — the gap is purely the path guard.)

> Adjacent, *not* the 403 cause: a raw `ctx.webServer.register` route does not inherit
> Connection auth (`precision-checklist.md`), so route auth is a separate security review.
> The observed 403 is emitted by the guard itself ("path escapes the plugin lib",
> `console-403-windows.txt:11`), not the connection gate — do not conflate them.

---

## Incident 3 — Ctrl+scroll in the zoom modal resizes BOTH diagram and pane

### Why both handlers fire on one gesture
The `wheel` event **bubbles** (`bubbles: true`) and is `cancelable`. Two distinct listeners
sit on the same propagation path:

1. the **diagram's** Ctrl+wheel → diagram-zoom handler (target/descendant), and
2. the **pane's** global Ctrl+wheel → font-size handler (an ancestor container or
   `window`; a standard DSH web-client pane/zoom feature).

The fullscreen zoom modal is rendered **inside the pane's DOM subtree** (or the pane listens
on a shared ancestor/`window`), so a Ctrl+wheel on the diagram travels
target → … → modal → pane → window. The diagram handler runs and calls
`event.preventDefault()` (suppressing the *native* Ctrl+scroll page zoom) **but does not call
`stopPropagation()`**. `preventDefault()` cancels only the browser's *default action* — it does
**not** stop other listeners. The event therefore keeps bubbling into the pane's listener,
which also applies its font zoom. Result: one gesture, two handlers, diagram **and** font
both resize — exactly the reported symptom. (Corollary: a `stopPropagation`-only or passive
listener is a related trap — a `wheel` handler that calls `preventDefault` must be registered
`{ passive: false }`, or the suppression is silently ignored.)

### The ownership rule that fixes it
**One gesture, one owner — and the owner must actively make the gesture exclusive.**

- While the zoom modal is open, the **modal owns Ctrl+wheel**. Its handler (or a
  capture-phase interceptor registered on the modal container, `addEventListener('wheel', h,
  { capture: true, passive: false })`) performs the diagram zoom **and calls
  `event.stopPropagation()` + `event.preventDefault()`**, so the event never reaches the
  pane's listener. When the modal closes, ownership reverts to the pane.
- Equivalently, the pane's global font-zoom handler stands down when a gesture-owning modal
  is open (guard on an ownership flag / "does `event.target` live inside an open zoom
  modal?").
- The invariant to encode: **`preventDefault` ≠ exclusivity**; exclusivity requires
  `stopPropagation` (or a phase/ownership gate) precisely because `wheel` bubbles and both
  listeners live on the same chain.

---

## Regression tests that would have caught incidents 1–3 pre-release

### Incident 1 — sibling-chunk closure
- **Module-graph closure test (build-time):** after `build`, statically extract every local
  `import()`/`import … from '…'` specifier from the emitted mermaid entry, resolve each under
  the served `lib/`, and assert (a) the file exists on disk **and** (b) it appears in
  `npm pack --dry-run`. Fail if any referenced sibling is absent from the tarball or the
  served dir. Strongest form: walk the graph from the entry and assert the reachable set is
  **self-closing (every node present)** — directly 404-proofs `src-BfvxrPJe.js` /
  `pie-WAS4IAKB-…` before publish.
- **Route reachability integration:** for each emitted chunk, GET `<prefix>/<file>` through
  the real route and assert `200` + a JS `content-type`. Attempt 1's siblings 404 here.
- **Optional loader-level:** a headless check that `import()`s the entry and asserts no
  sub-request returns 404.

### Incident 2 — Windows path-guard 403
- **Unit test on the exact debug-print mismatch:** feed `LIB_DIR = 'E:\\dsh\\…\\lib'`
  (what `fileURLToPath` yields) and `realpathSync` returning `'e:\\dsh\\…\\lib\\mermaid-chunk.js'`
  (what the OS yields on the E: volume) into the new `insideLib()`; assert `true` (no 403).
  This pins **case-insensitive-on-Windows** semantics cheaply, without a Windows box.
- **Cross-platform CI lane:** run the route smoke on a **Windows** runner and exercise a
  drive whose canonical casing diverges (install/secondary volume, or force-uppercase the
  profile path); GET the chunk and assert `200`, not `403`. The maintainer's matrix
  (`ci-note.md`) had **no** uppercase-drive + Windows-Server combination — Linux CI + C:\
  laptop are exactly the two rows that pass, so the lane must add the failing shape.
- **Layer-4 mount smoke on `windows-latest`** (`rollup-0.1.2.md` layer 4 / `A1-19`): boot a
  profile with the plugin, GET the advertised chunk, assert `200` and that the diagram
  renders (not the fallback), with no `pageerror`.

### Incident 3 — double Ctrl+wheel zoom
- **Handler-firing unit test (jsdom/DOM harness):** mount the pane (font-zoom) + modal +
  diagram (diagram-zoom) with their real handlers; dispatch a synthetic
  `WheelEvent({ ctrlKey: true, deltaY, bubbles: true, cancelable: true })` on the diagram
  **with the modal open**; assert **exactly one** zoom effect — diagram scale changed,
  pane font-size unchanged, and/or the pane handler spy was not called / `stopPropagation`
  was invoked. Property to encode: *per Ctrl+wheel gesture, the number of components whose
  zoom state changes is exactly 1.*
- **Default-path guard:** modal **closed**, Ctrl+wheel on the pane → pane font-zoom **does**
  change (no regression of the legitimate path), diagram unaffected.
- **Real-browser mount smoke:** Playwright — open a mermaid diagram, open the zoom modal,
  Ctrl+scroll over the diagram, capture the diagram transform and computed pane font-size
  before/after; assert exactly one changed and no console error.

Cross-cutting: fold all three into the layer-4 headless mount smoke that already asserts
"**lazy chunks delivered correctly**, no pageerror/console errors" (`rollup-0.1.2.md` layer 4,
`DSH-0.1.2-A1-19`), and add a Windows lane so the E: casing path is exercised, not assumed.

---

## Completed / Skipped / Residual
- **Completed:** derivation of all three root causes from the fixture (bundler module-graph
  resolution; `realpathSync` vs `fileURLToPath` drive-casing divergence × case-sensitive
  `startsWith`; bubbling `wheel` with no `stopPropagation`), the concrete guard fix
  (canonicalize both sides via one `realpathSync` + case-fold-on-win32), the JS-MIME serving
  requirement (already satisfied), the modal gesture-ownership rule, and pre-release
  regression coverage for each.
- **Skipped / not applicable:** no DSH version card applies (platform/bundler/DOM mechanics,
  not a host API or cohort change). The connection-auth note is flagged but is *not* the 403
  cause.
- **Residual risk:** the drive-letter casing divergence is volume-dependent — it reproduced on
  the `E:\` production volume but not `C:\`; the Windows CI lane must force the divergent
  casing rather than assume any Windows host reproduces it. Bundle size (7.2 MB single chunk)
  is accepted as the cost of the zero-sibling guarantee.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.