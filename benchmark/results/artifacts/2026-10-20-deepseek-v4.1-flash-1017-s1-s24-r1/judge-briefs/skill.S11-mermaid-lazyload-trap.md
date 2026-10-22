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
#### FILE: S11-mermaid-lazyload-trap/S11-mermaid-lazyload-trap.md

# S11 · Mermaid Lazy-Load Trap — Root-Cause Report

| | |
|---|---|
| Target | @org/dsh-attach-input v0.4.0 (Web Client plugin, lib-only bundle) — mermaid lazy chunk + new host resource route |
| Skill mode | plugin-upgrade, **Mode A · inspect** — read-only investigation; no source, config, dependency, or host changes |
| Evidence | `fixture/` only: `README.md`, `chunk-route.ts`, `console-split-chunks.txt`, `console-403-windows.txt`, `ci-note.md` (read only, never executed; directory left byte-identical) |
| Writes | this report only, under `agent-output/S11-mermaid-lazyload-trap/` |
| Verdict | three independent defects: (1) an emitted chunk graph is a manifest of URLs, not a self-contained module, and the pack list shipped only its entry; (2) containment is tested by a case-sensitive string prefix between a **lexical** path and an **OS-canonicalized** path; (3) a global wheel handler and a modal wheel handler both own the same gesture because `preventDefault()` is not a propagation barrier and nothing arbitrates ownership |

---

## 0. Evidence map

| Claim | Evidence |
|---|---|
| Attempt 1 shipped a dynamic entry chunk + 97 sibling chunk files | console-split-chunks.txt:3-4 |
| Entry chunk returned 200 while siblings returned 404 | console-split-chunks.txt:4-6 |
| Browser attributed the failure to the **entry** URL | console-split-chunks.txt:7-8 |
| Sibling URLs are *static relative imports* inside the entry chunk | console-split-chunks.txt:10-11 ("listed in its import statements") |
| Siblings were **absent from the published package**, present in the build tree | console-split-chunks.txt:10-11 |
| Attempt 2 serves one self-contained 7.2 MB chunk | console-403-windows.txt:2-3 |
| 403, not 404/500 — a guard branch fired | console-403-windows.txt:5, :11-12 |
| The file exists on disk at the expected location | console-403-windows.txt:12, ci-note.md:10 |
| Linux CI and a C:-installed Windows laptop are green; only the E: production host is red | ci-note.md:4-6 |
| `LIB_DIR` = uppercase `E:\dsh\...\lib`, `realpathSync` = lowercase `e:\dsh\...\lib\mermaid-chunk.js` | ci-note.md:10-11 |
| Guard implementation: two `startsWith` tests, one lexical, one after `realpathSync` | chunk-route.ts:16, :20 |
| Response already carries a JS MIME type | chunk-route.ts:23 |

**What the evidence rules out** (each alternative symptom would have looked different):

- *ACL / permission / antivirus lock*: an `EPERM`/`EACCES` from `realpathSync` or `readFile` lands in the `try/catch` and yields **404 "not found"** (chunk-route.ts:19-21), never 403. The 403 can only come from the two explicit guard branches.
- *Route not registered / prefix mismatch*: would be the host router's 404, or the route's own "not a js resource" 404 (chunk-route.ts:14).
- *Wrong MIME type blocking the module*: the 403 is written before `readFile` and before any header, so the MIME check never runs.
- *"NTFS case-insensitivity not working"*: the file is readable; only the string comparison fails. Windows resolved the same file through both spellings.

---

## 1. Incident 1 — why the split-chunk approach failed

### 1.1 Mechanism (bundler semantics, not a flaky CDN)

A dynamic `import()` makes the bundler split the target sub-graph into its **own chunk group**. Rollup then emits:

- the dynamic entry file (`mermaid-chunk.js`), and
- one file per module in that group that it did not inline — including mermaid's per-diagram renderers, which mermaid itself pulls in through lazy edges of its own. After bundling, those become **static relative `import "./pie-WAS4IAKB-CQHCQWWM.js"` statements inside the parent chunk** (exactly what console-split-chunks.txt:10-11 reports).

So the emitted chunk is not a module; it is a **manifest of URLs**. At runtime the browser resolves every relative specifier against the chunk's own URL (`/dsh-attach-input/resources/`) and issues one HTTP request per edge. Nothing in the build links the emitted file set to the **published** file set — the two diverge silently (`files` / `.npmignore` / CI copy step), and the divergence is observable only in a browser, at first render.

Consequences that shape the diagnosis:

1. **The graph is atomic for the caller.** One missing edge fails the whole top-level `import()`; there is no partial module and no retry. The plugin's `catch` path degrades to a code block — a silent feature loss while the "main" file returned **200**. That is why the console shows a 200 beside the 404s (console-split-chunks.txt:4-6).
2. **The error is attributed to the wrong URL.** Chrome reports `TypeError: Failed to fetch dynamically imported module: <entry URL>` even when the failed request is a sibling (console-split-chunks.txt:7-8). You must read the network log, not the exception, to find the missing file; the exception alone sends you looking at the route.
3. **The 8.1 kB entry is the tell.** A chunk that small cannot contain mermaid; it is the loader plus edges. Its 200 proves nothing about whether the graph is complete.
4. Chunk hashes are content-addressed, so a sibling rename between build and publish becomes a 404 that no stale-cache theory explains.

### 1.2 Build-side fix

The lazy artifact must be **closed under static resolution** — either it has no relative edges, or every edge is guaranteed to ship and be served at the same relative URL.

Recommended (what attempt 2 did, but deliberately):

1. **Build the lazy entry as its own build, inlined.**
   ```ts
   // vite.mermaid.config.ts — second, independent lib build for the lazy entry
   export default defineConfig({
     build: {
       lib: { entry: 'src/client/mermaid-entry.ts', formats: ['es'], fileName: () => 'mermaid-chunk.js' },
       rollupOptions: { output: { inlineDynamicImports: true, manualChunks: undefined } },
       minify: 'esbuild',
       emptyOutDir: false,          // do not wipe the main lib build
     },
   })
   ```
   `output.inlineDynamicImports: true` is legal only with a **single** input, which is exactly why this belongs in a separate build config rather than as a flag on the multi-entry main build.

2. **Or** keep one build and pin the whole lazy sub-graph to one chunk: `manualChunks(id) { if (id.includes('node_modules/mermaid') || id.includes('node_modules/@mermaid-js')) return 'mermaid-chunk' }`. Caveat: a module shared between the eager main bundle and the lazy graph is hoisted into a *third* chunk that both import — that chunk must then also ship and be served. "manualChunks returns a name" does not close this by itself.

3. **Ship the directory, not a filename.** `files: ["lib"]`; no `.npmignore` pattern that drops hashed files; if you keep splitting, the published layout must mirror the emitted layout 1:1, because the route (and the browser) derive sibling URLs from the entry's URL.

4. **Trade-off, stated honestly:** inlining duplicates shared helpers and yields one large file (7.2 MB here) — one round trip but no incremental caching and a heavy first parse. Mitigate with host-side brotli plus `cache-control: public, max-age=31536000, immutable` on a content-versioned filename. If size later forces splitting again, that is only safe together with (3) **and** the graph-closure test in §5-T1 — the current failure was a *packaging* failure, not a bundler bug.

---

## 2. Incident 2 — the exact containment flaw

### 2.1 Mechanism

`chunk-route.ts:20` compares **two differently-derived spellings of the same directory** with `String.prototype.startsWith`, a UTF-16 code-unit comparison ("E" = 0x45 ≠ "e" = 0x65).

Two independent canonizations meet:

- **`LIB_DIR` is lexical.** `new URL('.', import.meta.url)` → `fileURLToPath` → `normalize` never touches the filesystem. It preserves the casing that appears in the module URL (here `E:`), the spelling used at launch, whatever symlink/junction path the host loaded the plugin through, and any 8.3 short name.
- **`realpathSync(abs)` is canonical.** It resolves symlinks, junctions, and short names and returns the path as the OS reports it. On Windows the drive letter comes from the mount manager/volume, not from your string — here it comes back lowercase `e:` (ci-note.md:11).

NTFS is **case-insensitive but case-preserving**: `E:\...` and `e:\...` open the same file, so no call throws and the existence check passes. Only the case-sensitive string comparison fails. The route therefore 403s a path it has just successfully resolved — the strongest possible proof that the flaw is in the comparison, not in the filesystem (console-403-windows.txt:11-12).

### 2.2 What each API returns on each platform

| Step | Linux (node:24-bookworm, `/app/.../lib`) | Windows Server 2022 (`E:\dsh\...\lib`) |
|---|---|---|
| `new URL('.', import.meta.url)` | `file:///app/.../lib/` (trailing `/`) | `file:///E:/dsh/.../lib/` (trailing `/`) |
| `fileURLToPath(...)` | `/app/.../lib/` — trailing separator kept | `E:\dsh\...\lib\` — trailing separator kept |
| `normalize` | no case change; keeps trailing separator | no case change; keeps trailing separator (folds `/` to `\`) |
| `join(LIB_DIR, rel)` | `/app/.../lib/mermaid-chunk.js` | `E:\dsh\...\lib\mermaid-chunk.js` |
| `realpathSync(abs)` | byte-identical (case-sensitive FS ⇒ canonical form *is* the on-disk bytes) | `e:\dsh\...\lib\mermaid-chunk.js` — OS casing (lowercase drive) |
| `rel.startsWith(LIB_DIR + sep)` | true (unless a symlink sits in the path) | **false** |
| HTTP | 200 | 403 "path escapes the plugin lib" |
| Does `realpathSync` throw? | no | no — the file resolves fine |

**Why Linux passes is not "Linux is better."** ext4/overlayfs is case-sensitive, so the only existing spelling of the path *is* the bytes in `LIB_DIR`; a prefix test on the realpath succeeds. Linux carries the identical bug the moment the install is not a plain directory: with a pnpm store symlink, a workspace link, or a bind-mounted lib dir, `LIB_DIR` is the *lexical* symlink path and `realpathSync` returns the *store* path — the same `startsWith` fires and Linux 403s too. The root cause is the class, not the platform:

> **A lexical path (built from a URL string) is compared against a resolved path (returned by `realpathSync`) with a case-sensitive byte-prefix comparison.**

Windows merely guarantees the mismatch on non-system volumes; the C:-install laptop is green by coincidence (the mount casing there is `C:`, matching the tooling's spelling), which is exactly why one green laptop run is worthless evidence.

### 2.3 Which guard branch fired, precisely

Both branches emit the same message, so decide from the data: `abs` is built *from* `LIB_DIR` (chunk-route.ts:15), so for a plain filename it is lexically inside — line 16 cannot fire on Windows. Line 20 fires because `file` came back from the OS with different casing. That matches the printed `realpath` value (ci-note.md:11) exactly.

The maintainer's takeaway "Windows paths are unreliable" (ci-note.md:13) is the folklore failure mode: it explains nothing, predicts nothing, and was refuted by the one machine that was green.

---

## 3. Incident 2 — fix direction for the guard

### 3.1 Comparison to use, and why it is robust on both platforms

Canonicalize **both** operands, then compare **path segments** with `path.relative` — never with `startsWith`:

```ts
import { join, relative, isAbsolute, normalize, sep } from 'node:path'
import { realpathSync } from 'node:fs'

// Canonicalize once at load: folds symlinks, junctions, 8.3 names, drive casing.
const LIB_DIR = realpathSync(normalize(fileURLToPath(new URL('.', import.meta.url))))

function isInsideLib(resolvedTarget: string): boolean {
  const rel = relative(LIB_DIR, resolvedTarget)
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel)
}
```

Why this is the right comparison:

1. **`path.win32.relative` already compares case-insensitively.** Node lowercases both operands internally on win32 before diffing, so `E:` vs `e:` collapses to `mermaid-chunk.js` — no manual `.toLowerCase()` needed, and the returned path keeps on-disk casing.
2. **`path.posix.relative` stays case-sensitive**, which is *correct* on Linux, where `Lib` and `lib` may be two different directories. A blanket `.toLowerCase()` would be robust on Windows and wrong on Linux; it must not be the fix.
3. **It compares segments, so prefix confusion is impossible.** `E:\...\lib` vs `E:\...\lib-evil\x.js` yields `../lib-evil/x.js` — rejected. Prefix tests survive only by appending `sep`, which is exactly the fragile concatenation that breaks on doubled separators, a trailing-separator invariant, or mixed `/` and `\`.
4. **It has no invariant on `LIB_DIR`'s form.** `relative` tolerates a trailing separator and `.` / `..` segments on either side, whereas `LIB_DIR + sep` silently requires "no trailing separator" (see §6, item 1).
5. **Both sides must be resolved.** Comparing a realpath against a lexical dir reintroduces the same class of bug for symlinked installs; comparing lexical against lexical lets a symlink inside lib escape (a link to `C:\Windows` would be "inside" textually).

### 3.2 Hardened handler (the lexical check is no longer the gate)

```ts
const RESOURCE_PREFIX = '/dsh-attach-input/resources'
const JS_RE = /\.m?js$/

handler: async (req, res) => {
  if (req.method !== 'GET') { res.writeHead(405).end(); return }
  const url = new URL(req.url ?? '/', 'http://dsh.internal')

  let relPath: string
  try { relPath = decodeURIComponent(url.pathname) } catch { res.writeHead(400).end(); return }
  relPath = relPath.slice(RESOURCE_PREFIX.length).replace(/^[/\\]+/, '')

  // Reject on shape, before touching the filesystem.
  const segs = relPath.split(/[\\/]+/)
  if (!relPath || !JS_RE.test(relPath) || /^[A-Za-z]:/.test(relPath) ||
      relPath.includes('\0') || segs.some(s => s === '' || s === '.' || s === '..')) {
    res.writeHead(404).end('not a js resource'); return
  }

  let file: string
  try { file = realpathSync(join(LIB_DIR, relPath)) } catch { res.writeHead(404).end('not found'); return }
  if (!isInsideLib(file)) { res.writeHead(403).end('path escapes the plugin lib'); return }

  const data = await readFile(file)
  res.writeHead(200, {
    'content-type': 'text/javascript; charset=utf-8',
    'cache-control': 'public, max-age=31536000, immutable',
  })
  res.end(data)
}
```

Notes: existence is now proven by `realpathSync` itself, so the lexical pre-check is redundant as a gate (keeping it as defence-in-depth is fine, but it must then be applied to the **resolved** path too). Rejecting on shape first means traversal attempts get a 404 that discloses nothing, and only genuine escapes get 403. `decodeURIComponent` can throw on a malformed `%` — currently unhandled (chunk-route.ts:13) and would surface as a 500.

### 3.3 The other serving requirement a dynamic import imposes

**A dynamic `import()` only executes if the response is a JavaScript module response — i.e. it carries a JavaScript MIME essence.**

The browser fetches modules with destination *script* and enforces the JS MIME set (`text/javascript`, `application/javascript`, `application/ecmascript`, `text/ecmascript` and legacy variants). A response typed `text/html`, `text/plain`, `application/octet-stream`, or carrying no type is **blocked before evaluation** ("Expected a JavaScript module script but the server responded with a MIME type of …"), which surfaces to the plugin as the same `TypeError: Failed to fetch dynamically imported module`. This route already satisfies it (chunk-route.ts:23) — but it is a requirement to keep under test, because host routers that (a) default unknown paths to the SPA `index.html`, or (b) serve everything as `application/octet-stream`, break lazy loading with no 4xx anywhere in the console. Concretely: **`/resources/*` must never fall through to the HTML fallback**; non-JS paths must 404 with an empty body.

Conditional sibling requirement: module scripts are fetched in **CORS mode**. Same-origin serving (the current `http://127.0.0.1:3080` case) needs nothing, but if the chunk is ever served from a second origin/port or a static CDN, the response needs `Access-Control-Allow-Origin` (plus `Vary: Origin`) or the import fails as a CORS error — again reported as "Failed to fetch dynamically imported module".

---

## 4. Incident 3 — why both handlers fire on one Ctrl+scroll

### 4.1 The event model

A wheel event is dispatched to the element under the pointer and then travels the **entire ancestor chain** (`… → pane → document → window`: capture downward, then bubble upward). Every listener on every node in that chain runs. Neither of these stops it:

- **`preventDefault()`** cancels the *default action* (the browser's own zoom, or scrolling). It does **not** stop dispatch and does not notify sibling or ancestor listeners — it only sets `defaultPrevented`, which most handlers never read.
- **`defaultPrevented` is never consulted by the pane handler**, so the modal's `preventDefault()` buys nothing and the font zoom runs anyway.

With the modal open, one Ctrl+wheel therefore drives three effects at once: the modal's diagram scale, the pane's font size, and — if no listener that actually runs is non-passive — the browser's page zoom.

Four details make it worse in this stack:

1. **React synthetic events are delegated at the React root container**, not at the modal node. `onWheel` on the modal fires when the *native* event reaches the root container; any native listener on `document` / `window` (or any capture-phase listener above) is on the same path and fires regardless of the order you assumed.
2. **Phase beats intent.** If the pane registers `{ capture: true }` on `document` — the common way to build "global shortcut" handlers — it runs **before** the modal's handler, so a `stopPropagation()` inside the modal's bubble handler is already too late.
3. **Wheel listeners on `window` / `document` are passive by default** in Chromium (since 73), so an unqualified `addEventListener('wheel', …)` there cannot cancel anything; the browser zooms as well. Only `{ passive: false }` can cancel.
4. Precision touchpads deliver **pinch as `wheel` with `ctrlKey: true`**, so the conflict reproduces on a trackpad as well as on ctrl+wheel — the fix must key on the gesture, not the device.

### 4.2 The ownership rule

> **One gesture, one owner.** For any given event, exactly one handler owns it: the *innermost surface that claims that gesture* (the surface under the pointer, per `composedPath()`). The owner must both `preventDefault()` and stop the event reaching ambient handlers; every ambient/ancestor handler must yield — by checking ownership and `defaultPrevented` — so the outcome does not depend on listener phase or registration order.

Implementation:

```tsx
// --- owner: the modal, registered natively and non-passively ---
useEffect(() => {
  const el = modalRef.current!
  const onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey) return                 // plain wheel keeps scrolling the dialog body
    e.preventDefault()                     // kill browser zoom
    e.stopPropagation()                    // claim: ancestors never see it
    setScale(s => clamp(s * (e.deltaY < 0 ? 1.1 : 1 / 1.1), 0.25, 8))
  }
  el.addEventListener('wheel', onWheel, { passive: false })
  return () => el.removeEventListener('wheel', onWheel)
}, [])

// --- ambient handler: yields to any owner, and to anyone who already prevented ---
const onPaneWheel = (e: WheelEvent) => {
  if (!e.ctrlKey || e.defaultPrevented) return
  if (e.composedPath().some(n => (n as Element)?.hasAttribute?.('data-gesture-owner'))) return
  e.preventDefault()
  setFontScale(f => step(f, e.deltaY < 0 ? +1 : -1))
}
window.addEventListener('wheel', onPaneWheel, { passive: false })   // bubble phase, on purpose
```
and mark the overlay root with `data-gesture-owner="diagram-zoom"`.

Why each piece matters:

- `stopPropagation()` is the actual barrier; `preventDefault()` only cancels the browser's own zoom.
- `{ passive: false }` on **both** registrations is mandatory — a passive listener cannot cancel, and Chrome's default for wheel on window/document is passive.
- The `data-gesture-owner` test via `composedPath()` makes the ambient handler correct **regardless of phase and registration order**, and works through React portals (a modal rendered into `document.body` is no longer a DOM descendant of the pane, so "is it inside my subtree" checks fail while `composedPath()` still contains the owner marker).
- Register ambient handlers in **bubble** phase as a second line of defence; if a capture-phase registration is unavoidable, the ownership marker — not the phase — decides.
- The same arbiter should cover keyboard zoom (`Ctrl+=` / `Ctrl+0`), pinch (`gesturestart`), and drag-to-pan inside the modal, or those will conflict next: a global `keydown` text-zoom handler and a modal `keydown` handler have exactly the same shape of bug.

---

## 5. Regression tests that would have caught incidents 1–3

Layered so each incident is caught at the cheapest layer that can see it, with at least one test at the layer where it actually escaped (the **published artifact**, the **real OS**, the **real browser**).

| # | Test | Layer | Catches |
|---|---|---|---|
| T1 | **Chunk-graph closure.** Parse every emitted `lib/**/*.js` with `es-module-lexer` (it reports static specifiers and dynamic `import()` specifiers with the `d@ flag), resolve each relative specifier, and assert the target exists **and** appears in `npm pack --dry-run --json`'s file list. | build + packaging, no browser | Incident 1 primary |
| T2 | **Self-containment invariant.** Assert `lib/mermaid-chunk.js` contains **zero** relative specifiers (and no `/* @vite-ignore */` escape). Cheap; catches a bundler-config regression that silently reintroduces splitting. | build | Incident 1 regression |
| T3 | **Packed-artifact smoke.** `npm pack` → unpack into a temp dir → serve that dir with a static server → Playwright: open a markdown reading view containing one fenced `mermaid` block → assert every response under `/resources/` is 2xx, no `requestfailed`, no "Failed to fetch dynamically imported module" console error, and an SVG element exists. | e2e against the **published** bytes | Incident 1 + 2 end-to-end; the dev tree is never the artifact |
| T4 | **Guard unit test with injected fs.** Extract `isInsideLib()` as a pure predicate and inject `realpath` / `path` implementations. Table-driven over `path.posix` and `path.win32` cases, including the literal incident pair: lib `E:\dsh\...\lib` vs realpath `e:\dsh\...\lib\mermaid-chunk.js` → **200**. Negative: `../x.js`, `%2e%2e%2fx.js`, `..\x.js`, `C:\Windows\x.js`, `lib-evil/x.js`, symlink-out → 403/404; absent → 404; `x.css` → 404; `POST` → 405. | unit, runs on Linux | Incident 2 deterministically, without needing Windows |
| T5 | **Real-path integration + OS matrix.** Boot the host in a temp profile, point a symlink (Linux) / junction (Windows) at the lib dir, `GET` the chunk, assert 200 + body equals disk + `content-type` matches `/^(text\|application)\/javascript/`. Run on `ubuntu-latest` **and** `windows-latest` — a Linux-only matrix cannot observe case behaviour at all. | integration | Incident 2 platform reality + the MIME requirement |
| T6 | **No HTML fallback.** `GET /dsh-attach-input/resources/nope.js` must be 404 with an empty/non-HTML body — never the SPA index. | integration | the MIME-block class hidden behind a 200 |
| T7 | **Gesture ownership, fast.** jsdom: mount pane, open modal, dispatch **one** cancelable `wheel` with `ctrlKey: true` at a node inside the modal; assert diagram zoom called once, pane font zoom called **zero** times, and a probe listener at the end of the path records `defaultPrevented === true`. Repeat with the pane listener registered in **capture** phase (ordering must not matter). | unit | Incident 3 logic |
| T8 | **Gesture, real browser.** Playwright + CDP `Input.dispatchMouseEvent` `type: 'mouseWheel'` with `modifiers: 2` (Ctrl): assert font size unchanged, diagram scale changed once, page zoom unchanged. **jsdom cannot model passive-by-default or the browser's native zoom** — this is the only test that catches a passive-registration mistake. | e2e | Incident 3 as users hit it |
| T9 | **Negative control.** With the modal closed, Ctrl+wheel over the pane still zooms the font (and Ctrl+wheel elsewhere still page-zooms if that is intended) — prevents "fixing" the conflict by deleting the feature. | unit | over-fixing |

Two process notes that matter as much as the tests:

- T1/T3 must run against the **packed tarball**, because the dev server resolves everything from disk — precisely why both attempts looked fine locally.
- The CI matrix must contain a Windows runner. The current matrix (ci-note.md:3-6) is three green runs that provably cannot observe the failing behaviour: a Linux container with a flat install, and a C: install whose casing happens to agree.

---

## 6. Residual risk / open items

1. **Trailing-separator contradiction in the excerpt (record both, do not silently pick one).** `fileURLToPath(new URL('.', import.meta.url))` yields a trailing separator and `normalize` preserves it, so `LIB_DIR + sep` would be a **doubled** separator and line 16 would 403 on *every* platform — contradicting the green Linux CI. The printed `LIB_DIR` (ci-note.md:10) has no trailing separator, so the real file must strip it in code the excerpt elides. Either way the invariant is undocumented and load-bearing; the `path.relative` form removes it entirely. Verify against the actual file when applying the fix.
2. **TOCTOU** between `realpathSync` and `readFile` (the path could be swapped for a symlink in between). Low risk on a single-user local host; if it matters, `open` → `fstat` and verify handle identity on POSIX (`O_NOFOLLOW`).
3. **7.2 MB first-render cost.** One round trip, but a heavy parse on the first diagram. Measure; pair with brotli + `immutable` on a content-versioned filename. If splitting returns, it is only safe with a published-and-served sibling set plus T1.
4. **`decodeURIComponent` can throw** (chunk-route.ts:13) → currently a 500. Return 400.
5. **Untested platforms:** macOS (case-insensitive APFS — same class of bug, it would fail the same way), Windows installs on non-system volumes, pnpm/link-installed plugin trees on Linux (the same 403 by symlink).
6. **No rollback needed:** read-only investigation; the fixture was not modified, nothing was installed, migrated, or published. Every finding is attributable to the evidence listed in §0.

---

### Appendix — one-line answers

1. **Incident 1:** a split chunk is a manifest of sibling URLs fetched at runtime; the pack list shipped only the entry, so every edge 404'd and the whole graph (atomic per `import()`) failed while the entry returned 200. Fix: emit the lazy graph as one self-contained file (separate build with `inlineDynamicImports`, or a `manualChunks` pin covering the full sub-graph), ship the whole lib dir, and assert graph closure against the packed artifact.
2. **Incident 2:** `LIB_DIR` is lexical (from `import.meta.url`, keeps `E:`), `realpathSync` is OS-canonical (returns `e:`); NTFS is case-insensitive so both open the same file, but `startsWith` is code-unit case-sensitive → the guard fires → 403. Linux passes because its case-sensitive FS makes the canonical bytes equal to `LIB_DIR` (and would fail identically for a symlinked install).
3. **Fix:** resolve both sides (`realpathSync(LIB_DIR)` once + `realpathSync(target)`) and compare with `path.relative` — segment-wise, case-insensitive on win32 by Node's own implementation, case-sensitive on posix as Linux requires, immune to trailing separators and to `lib` vs `lib-evil` prefixes. Serving requirement: a JavaScript MIME type, and never the SPA HTML fallback — module scripts are MIME-checked before evaluation; CORS headers if ever cross-origin.
4. **Incident 3:** one wheel event traverses the whole ancestor chain, `preventDefault()` is not a propagation barrier, and the pane's document/window handler (possibly capture-phase, passive by default) never sees `defaultPrevented` — so both run. Rule: one gesture, one owner — the innermost claiming surface calls `preventDefault()` **and** `stopPropagation()` from a non-passive listener, and every ambient handler yields on an ownership marker (`composedPath()`) or `defaultPrevented`.
5. **Tests:** T1/T2/T3 (graph closure, self-containment, packed-artifact e2e), T4/T5/T6 (injected-realpath guard table, real-path + symlink integration on a Windows **and** Linux matrix, no-HTML-fallback), T7/T8/T9 (jsdom ownership, real Ctrl+wheel via CDP, negative control) — with the packaging and Windows jobs being the two the current matrix structurally cannot replace.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.