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
#### FILE: S11-mermaid-lazyload-trap/report.md

# S11 · Mermaid Lazy-Load Trap — Root-Cause Analysis & Fix Plan

**Plugin:** `@org/dsh-attach-input` v0.4.0 (lib-only bundle)
**Incidents:** (1) split-chunk sibling 404s, (2) host route 403 on Windows production only, (3) Ctrl+scroll double-handled by zoom modal + pane font-zoom.
**Scope:** diagnosis from the sealed evidence pack in `fixture/` (read-only) only. No host introspection was performed; nothing outside the whitelist was read.

---

## 0. Executive summary

| # | Root cause (one line) | Fix direction |
|---|---|---|
| 1 | A lazy `import()` boundary creates a **runtime module graph**; the package shipped only the *entry* chunk, so the graph was incomplete on disk. The 404s were on the graph's transitive siblings, not on the entry. | Build the mermaid entry as **one self-contained chunk** (`inlineDynamicImports` / `splitting:false` / `splitChunks:false`) — or ship the whole closure **and** serve it. |
| 2 | The guard compares a **case-preserving** string (`import.meta.url` → `E:\…`) with a **case-canonicalized** string (`realpathSync` → `e:\…`) using **case-sensitive** `String.startsWith`. On Windows the two strings denote the same file but differ in the drive-letter case, so the prefix test fails → 403. | Containment must be decided by **path arithmetic** (`path.relative`), which on Windows compares case-insensitively, and both sides must be canonicalized (`realpathSync`) before comparing. |
| 3 | `wheel` **bubbles**, and a "fullscreen" modal is still a DOM descendant of the pane, so one gesture reaches both listeners. | **Ownership rule:** the *nearest enclosing* zoom surface owns the gesture, resolved from `event.target` (containment check), not from listener order or a shared `defaultPrevented` flag. |

---

## 1. Evidence map (fixture → claim)

| Fixture fact | Where | Used for |
|---|---|---|
| `GET …/mermaid-chunk.js` **200**, then `src-BfvxrPJe.js` **404**, `pie-WAS4IAKB-CQHCQWWM.js` **404**, then `TypeError: Failed to fetch dynamically imported module: …/mermaid-chunk.js` | `fixture/console-split-chunks.txt:4-9` | §2 |
| "mermaid-chunk.js WAS present; the sibling files listed in its import statements were **NOT shipped** with the package" | `fixture/console-split-chunks.txt:11-12` | §2 |
| `GET …/mermaid-chunk.js` **403** on Windows Server 2022, DSH at `E:\` | `fixture/console-403-windows.txt:2-6` | §3 |
| Route log shows the guard branch fired ("path escapes the plugin lib") **for a path plainly inside the lib dir** | `fixture/console-403-windows.txt:11-12` | §3 |
| Debug print: `LIB_DIR = "E:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib"` vs `realpath = "e:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\mermaid-chunk.js"` | `fixture/ci-note.md:11-12` | §3 (the decisive pair) |
| Linux CI green; Windows 11 on `C:\` green; Windows Server 2022 on `E:\` broken | `fixture/ci-note.md:5-7` | §3 |
| "DSH on C:\\ (lowercase c:\\ in some tooling)" | `fixture/ci-note.md:6` | §3 (same phenomenon, benign there) |
| Guard = `abs.startsWith(LIB_DIR + sep)` on both the lexical path and the `realpathSync` result | `fixture/chunk-route.ts:16,20` | §3 |
| Route serves `application/javascript; charset=utf-8`, 405 for non-GET, 404 for non-`.js` | `fixture/chunk-route.ts:11-24` | §4 |

**No console capture for incident 3 is included in the pack**; §5 derives that incident from the DOM/event semantics the plugin uses (Ctrl+scroll → zoom modal + pane font-zoom) and marks the plugin-specific details as *unconfirmed*.

---

## 2. Incident 1 — why the split-chunk (code-split) approach failed

### 2.1 What actually happened

The bundler emitted the mermaid entry as a **chunk graph**, not a chunk: `mermaid-chunk.js` plus ~97 sibling chunks (one per mermaid sub-module / shared vendor slice, e.g. `pie-*`, `src-*`). The plugin's **package** contained only the entry file.

Sequence at runtime:

1. The reading pane calls `import('/dsh-attach-input/resources/mermaid-chunk.js')` → **200** (the entry *is* shipped).
2. The module loader parses the entry; it contains static import statements for its siblings. Each specifier is **relative** (`./pie-WAS4IAKB-CQHCQWWM.js`), so the browser resolves it **against the importing module's own URL**, i.e. `/dsh-attach-input/resources/<sibling>.js`. Those files are absent from the package → **404** for every sibling.
3. ES module semantics: a module whose dependency graph cannot be fully fetched **never instantiates and never evaluates**. The failure therefore surfaces as the *outer* dynamic import rejecting, and the rejection reason names the **entry** URL, not the missing sibling:

   > `TypeError: Failed to fetch dynamically imported module: http://…/resources/mermaid-chunk.js`

   The network panel (not the exception) is where the real culprits appear. That mismatch between the named URL and the actual missing files is precisely what made this incident look mysterious.

### 2.2 Why the build was "green"

Code-splitting is resolved **inside the build graph**; the bundler is perfectly happy as long as every module in the graph exists at build time. The break happens **after packaging**: the artifact set is a *subset* of the build graph's output. Neither the bundler nor the TypeScript compiler can catch a packaging/artifact-set mismatch, and nothing in the pipeline compared *emitted files* against *imports inside emitted files*.

### 2.3 Build-side fix (the correct knob)

Make the mermaid entry a **single self-contained file** — one entry, one chunk, zero relative import specifiers inside it:

* **Rollup / Vite:** `build.rollupOptions.output.inlineDynamicImports: true` for the mermaid sub-build (or build mermaid as its own Rollup entry with `inlineDynamicImports` and `format:'es'`).
* **esbuild:** `splitting: false`.
* **webpack:** `optimization.splitChunks: false` (or a `cacheGroups` entry that merges *all* mermaid modules **and** their shared vendors into one chunk).

> ⚠️ `output.manualChunks` **alone is not sufficient**: grouping mermaid's modules into one chunk still leaves that chunk importing the *shared* chunks it has in common with the host bundle. Only "inline everything into the entry" guarantees a zero-sibling chunk. If the plugin must remain lazy-loaded but the host bundle already contains some of mermaid's dependencies, the mermaid chunk will legitimately reference them — so the sibling set must be treated as part of the published artifact set (see §2.4) and served by the route (§4).

**Secondary packaging fix (belt and braces, required regardless):**

* The published artifact set must contain **every** file reachable from the client entry's static/dynamic import graph. Make the package manifest (`files: ["lib"]`) include the whole build output, and add a build-time assertion that the closure ⊆ published files.
* Prefer a **stable, non-hashed** filename (`mermaid-chunk.js`) so the plugin can reference the chunk without reading a manifest; if hashed names are kept, the plugin must resolve the name from the emitted manifest rather than hard-coding it.

### 2.4 Why the route is not the fix for incident 1

The route's own mapping is capable of serving siblings: `rel = "pie-WAS4IAKB-CQHCQWWM.js"` → `join(LIB_DIR, rel)` → inside the lib dir → 200 **if the file existed**. The 404s in the console are therefore a **missing-artifact** problem, not a routing problem. Attempt 2 removed the variable by making the chunk self-contained; §4 keeps the route correct for the general case (a sibling-serving route is still required if you ever split again).

---

## 3. Incident 2 — the exact flaw in the route's containment guard (Windows 403)

### 3.1 The two lines that fail

`fixture/chunk-route.ts`:

```ts
const LIB_DIR = normalize(fileURLToPath(new URL('.', import.meta.url)))   // line 5
…
if (!abs.startsWith(LIB_DIR + sep)) { 403 'path escapes the plugin lib' }   // line 16  (lexical)
…
file = normalize(realpathSync(abs))                                        // line 19
if (!file.startsWith(LIB_DIR + sep)) { 403 'path escapes the plugin lib' }   // line 20  (realpath)
```

The lexical guard (line 16) **passes** on production: `abs = join(LIB_DIR, rel)` is built *from* `LIB_DIR`, so its prefix matches by construction. The guard that fires is **line 20**, the one comparing the **canonicalized** path against the **non-canonicalized** base.

### 3.2 The mechanism, API by API

The maintainer's debug print on the production host is the decisive evidence (`fixture/ci-note.md:11-12`):

```
LIB_DIR   = "E:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib"
realpath  = "e:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\mermaid-chunk.js"
```

The two strings are the **same file**. They differ **only in the case of the drive letter** (`E:\` vs `e:\`).

| API | What it returns on **Windows** | What it returns on **Linux** |
|---|---|---|
| `import.meta.url` → `fileURLToPath(new URL('.', …))` | The path **as the loader resolved it** — the spelling Node was handed when the module was located/loaded. It **preserves the case of that spelling** (`E:\…`), and it ends with a trailing separator because the URL `.` denotes a directory. | Same idea: the spelling as given, e.g. `/srv/app/lib/`. |
| `fs.realpathSync(abs)` | The **canonical on-disk path**: symlinks resolved and the **case as the OS reports the volume**, which is the volume's canonical drive-letter spelling (`e:\`) — *not* the spelling used to open the file. The filesystem itself is **case-insensitive** (NTFS default), so `E:\x` and `e:\x` are the same object. | The **canonical on-disk path**; POSIX filesystems store case **exactly**, and `realpath` returns the stored bytes. For a path assembled from those same components the returned bytes are **identical** to the input — there is no case-folding step anywhere. |
| `String.prototype.startsWith` | **Byte-exact, case-sensitive** — on every platform. It knows nothing about filesystems, drives, or case-insensitivity. | Same. |

So the guard compares **a case-preserving string against a case-canonicalized string with a case-sensitive operator, on a platform whose filesystem says the two denote the same file.**

* **On Linux** the two sides are byte-identical (`/srv/app/lib` vs `/srv/app/lib/mermaid-chunk.js`) → prefix test passes → **green**.
* **On the production Windows host** `LIB_DIR` kept the uppercase `E:\` from the launch/install path while `realpathSync` returned the canonical lowercase `e:\` → `'e:\dsh\…\lib\mermaid-chunk.js'.startsWith('E:\dsh\…\lib\')` → **`false`** → **403**. The file was opened successfully by `realpathSync` and then rejected by a *string* comparison.
* **On the maintainer's Windows 11 laptop** the same "lowercase `c:\` in some tooling" phenomenon is recorded (`ci-note.md:6`), but there the two sides evidently **agreed** (both resolved to the same spelling), so the byte comparison matched → **green**. The bug is not "Windows"; it is "the two spellings disagree", which happened to hold on exactly one machine.

> The maintainer's takeaway "Windows paths are unreliable" is the wrong generalization. The precise statement is: **`startsWith` is a byte comparison being used as a path-containment test.** It fails whenever the OS's canonical spelling differs from the spelling the process was configured with — and on a case-insensitive filesystem that is a *correctness* bug, not a cosmetic one.

**Secondary flaws in the same guard (worth fixing while in there):**

1. **The base is never canonicalized.** `abs` is `realpathSync`'d but `LIB_DIR` is not. If the plugin's lib directory is reached through a symlink / junction / `npm link` / pnpm store link, `realpathSync(abs)` resolves *through* it to a canonical prefix that does not textually start with the non-canonical `LIB_DIR` → **403 on every request on every platform** (a different-looking bug with the same symptom).
2. **Both 403 branches emit the identical message** ("path escapes the plugin lib"). The log therefore cannot tell you which guard fired — this is why the maintainer could not see the case problem from the logs alone. Split the messages (lexical vs. symlink-resolved).
3. `normalize(fileURLToPath(new URL('.', import.meta.url)))` keeps the **trailing separator**, while the debug print shows `LIB_DIR` without one. Whichever spelling is used, `LIB_DIR + sep` must not be assumed; use `path.resolve()` (which drops the trailing separator) and compare by relative path, so the trailing-separator question becomes irrelevant. (Verified locally on this host: `path.win32.normalize('E:\…\lib\')` → `E:\…\lib\`, and `path.win32.resolve` → `E:\…\lib`.)
4. The extension filter uses an **unescaped dot**: `!/.m?js$/.` matches any char before `js` — sloppy, and it also rejects any future asset type (`.wasm`, `.json`) a dynamic import might pull in.

### 3.3 The fix direction for the guard

**Decide containment by path arithmetic, not by string prefixing.** Use `path.relative()`:

```ts
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { realpathSync } from 'node:fs'

const LIB_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)))   // no trailing separator

function isInside(base: string, target: string): boolean {
  const rel = relative(base, target)
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel)
}
```

**Why this is robust on both platforms:**

* `path.win32.relative()` compares **case-insensitively** and understands drive letters and UNC shares; `path.posix.relative()` is case-sensitive, matching POSIX semantics. Verified locally on this host: `path.win32.relative('E:\a\lib', 'e:\a\lib\x.js')` → `'x.js'` (**inside**), while `path.posix.relative('/a/lib', '/a/Lib/x.js')` → `'../Lib/x.js'` (**outside**, correctly). The comparison therefore **inherits the platform's own case rules from the path implementation** instead of hard-coding byte-exactness — exactly the property the buggy version was missing.
* It fixes the classic **sibling-prefix trap** that a naive `startsWith(base)` (without the separator) would get wrong. Verified: `path.win32.relative('E:\a\lib', 'E:\a\lib-evil\x.js')` → `'..\lib-evil\x.js'` → correctly **outside**.
* A path on a **different drive** yields an absolute `rel` (`path.win32.relative('E:\lib','D:\x')` → `'D:\x'`), which `isAbsolute(rel)` catches → correctly **outside**.
* The empty result (`rel === ''`, target *is* the base) is rejected — a file request can never legitimately be the directory itself.

**Apply it to both sides, canonicalized:**

```ts
const abs = resolve(LIB_DIR, rel)                    // lexical resolution
if (!isInside(LIB_DIR, abs)) → 403 'path escapes the plugin lib (lexical)'

let file
try { file = realpathSync(abs) } catch { → 404 'not found' }

const realBase = realpathSync(LIB_DIR)               // canonicalize the BASE as well
if (!isInside(realBase, file)) → 403 'path escapes the plugin lib (symlink)'
```

Canonicalizing **both** sides keeps the guard's real purpose (rejecting symlink escapes) while removing the false positives.

**Acceptable alternative (weaker):** lowercase both sides on Windows before `startsWith`, e.g. `file.toLowerCase().startsWith(realBase.toLowerCase() + sep)`. It fixes the reported 403 but hard-codes a POSIX-is-case-sensitive assumption into a Windows-only branch, breaks on case-sensitive-but-Windows-mounted volumes (Windows can mount case-sensitive directories), and does not fix the symlinked-base problem. `path.relative()` is the recommended form.

**Do not "fix" it by stripping the drive letter, uppercasing both, or by re-running the check against `LIB_DIR` only.** Those trade a false 403 for a real traversal hole.

---

## 4. The other serving requirement a dynamic import needs

The guard fix restores the **authorization** half of the route. A dynamic `import()` also needs the route to satisfy a **module-graph** requirement:

> **The route must serve the *entire* import closure of the dynamically imported entry, at URLs that mirror the on-disk layout 1:1 under the same prefix, and each response must be a `200` with a JavaScript MIME type.**

Two independent sub-requirements:

1. **Closure completeness + URL mirroring.** The browser resolves a relative specifier inside a module **against that module's URL**. For `./pie-WAS4IAKB-CQHCQWWM.js` imported from `/dsh-attach-input/resources/mermaid-chunk.js`, the fetch URL is `/dsh-attach-input/resources/pie-WAS4IAKB-CQHCQWWM.js`. Therefore the route's `<prefix> → LIB_DIR` mapping must expose the chunk's directory *as-is*: same file names, same sub-directory structure, nothing flattened, renamed, or filtered out. Attempt 1's console is the proof of this requirement being unmet — the entry was 200 and its siblings were 404 (in that attempt because the files were not shipped; in general because the route must exist for them too).
2. **A JavaScript MIME type on a 200.** The module loader rejects a module response whose MIME type is not JavaScript, *even when the bytes are perfect* ("Expected a JavaScript module script but the server responded with a MIME type of …"). The route already returns `content-type: application/javascript; charset=utf-8` (`chunk-route.ts:23`) — that is correct and must be kept, including if a `X-Content-Type-Options: nosniff` policy is ever added (a wrong type plus `nosniff` is fatal). Also: the response must be a real 200 with a body — a `204 No Content` or a truncated body yields an empty/invalid module.
3. **Same-origin (or CORS).** The chunk is fetched from the host origin that served the page, so no CORS handshake is required today. If the plugin's client bundle is ever served from a different origin/port than the chunk route, the chunk response additionally needs `Access-Control-Allow-Origin` for that origin, otherwise the module load fails with a CORS error rather than a fetch error. *(Not exercised by the current evidence — flagged as conditional.)*

Concretely, the route must **not** rewrite the path (no directory listing, no bundling-on-the-fly, no filename rewriting) and must **not** restrict the served extension set to only the entry's own extension if the closure contains others (`.mjs` is already allowed by the filter; `.wasm`/`.json` are not — widen the allow-list deliberately rather than by accident).


---

## 5. Incident 3 — why BOTH handlers fire on one Ctrl+scroll under the modal

### 5.1 Mechanism

The plugin has two `wheel` handlers:

* **H1 — modal zoom:** attached to the modal (or its zoom surface); Ctrl+wheel scales the diagram; calls `preventDefault()` to suppress the browser's own zoom.
* **H2 — pane font zoom:** attached to the markdown pane; Ctrl+wheel changes the pane's font size.

A Ctrl+scroll over the modal produces **one** `WheelEvent`, and:

1. `wheel` is a **bubbling, cancelable** event. The event's path is `target → … → modal → … → pane → … → document`.
2. The modal is a **DOM descendant** of the pane. "Fullscreen" here is CSS (`position:fixed` / `inset:0` / a full-viewport layer) — **CSS fullscreen does not change the DOM tree**, so the event path still runs through the pane. (Even the Fullscreen API does not re-parent the element, so the bubble path is unchanged there as well.)
3. Therefore the event reaches **H1 and then H2**. H1 does not stop the event from continuing (it only `preventDefault()`s it), so **H2 also runs** and applies its own font-size transform to the pane. Result: the diagram zooms *and* the pane's font size changes — exactly the reported symptom.

**`preventDefault()` cannot fix this.** It cancels the *default browser action* (the browser's own Ctrl+wheel page zoom) but **does not stop other listeners** from running. `stopPropagation()` stops the event from reaching *ancestors* — but only if the two listeners are not on the same node; if H1 and H2 are both attached to the same element (a common delegated design), you need `stopImmediatePropagation()`.

### 5.2 The ordering trap (why a "flag" fix is unreliable)

Listener invocation order is determined by **registration order within a phase**, and **capture runs before bubble**:

| H2 attached to | Phase | Order vs. H1 (bubble on the modal) | A shared `handled`/`defaultPrevented` flag works? |
|---|---|---|---|
| the pane element | bubble | H1 **first**, H2 second | ✅ yes (H1 runs first) |
| `document` / `window` | bubble | H1 first (bubble reaches document last) | ✅ yes |
| `document` / `window` | **capture** | **H2 first** (capture is ancestor → descendant) | ❌ **no** — the flag is not set yet, so both act |
| same element as H1 | same node | registration order | ❌ `stopPropagation()` does not help either — needs `stopImmediatePropagation()` |

So a fix that relies on *"the modal sets `event.defaultPrevented = true` (or a module-level flag) and the pane checks it"* is **ordering-dependent** and will silently regress if anyone later registers the pane handler in the capture phase on `document`, or if the modal is re-parented. The plugin's own capture of "the modal is on top" does not make this safe.

### 5.3 The ownership rule (the fix)

> **The nearest enclosing zoom surface owns the gesture. Ownership is resolved from `event.target` — the element under the pointer — by walking up to the first ancestor that declares itself a zoom surface. Exactly one handler may apply a transform, and it must be the owner.**

Implementation of that rule, order-independent:

```ts
// Modal (H1) — deepest owner
const modal = document.querySelector('[data-zoom-modal]')   // the zoom surface
modal.addEventListener('wheel', (ev) => {
  if (!ev.ctrlKey) return
  const owner = nearestZoomSurface(ev.target)              // 'modal' if target is inside the modal
  if (owner !== 'modal') return                            // someone else owns it
  ev.preventDefault()                                      // suppress the browser's own zoom
  ev.stopPropagation()                                     // do not let ancestors handle it
  zoomDiagram(ev.deltaY)
}, { passive: false })                                     // must be non-passive to preventDefault
```

```ts
// Pane (H2) — only owns gestures that did NOT start inside a zoom surface
pane.addEventListener('wheel', (ev) => {
  if (!ev.ctrlKey) return
  if (nearestZoomSurface(ev.target) !== 'pane') return      // ownership test, not a flag
  ev.preventDefault()
  setPaneFontSize(computeNextFontSize(ev.deltaY))
}, { passive: false })
```

with a single shared resolver:

```ts
function nearestZoomSurface(target: EventTarget | null): 'modal' | 'pane' | null {
  let el = target instanceof Element ? target : null
  while (el) {
    if (el.hasAttribute('data-zoom-modal')) return 'modal'
    if (el.hasAttribute('data-zoom-pane'))  return 'pane'
    el = el.parentElement
  }
  return null
}
```

**Why this is the right rule:**

* It depends only on **where the gesture started** (`event.target`), not on listener order, phase, capture/bubble registration, or whether some other handler happened to run first — so it holds in every arrangement of the table in §5.2.
* It composes: a modal inside a modal, or a modal rendered in a **portal** outside the pane's subtree (a common pattern for a fullscreen overlay), still works — the owner is found by walking up from the target, not by assuming DOM containment in the pane.
* **`stopPropagation()` in the owner** is kept as an *optimization* (it prevents the pane from even doing work), but correctness no longer depends on it; the pane's own containment check is the guarantee. If both handlers end up on the same element, use `stopImmediatePropagation()` **and** keep the containment check.
* `{ passive: false }` is required on the owning listener, otherwise the browser marks the listener passive and `preventDefault()` is ignored (console warning: "Unable to preventDefault inside passive event listener"). For a `wheel` listener that wants `preventDefault`, always pass `{ passive: false }`.
* The browser's own Ctrl+wheel page zoom is a separate default action; `preventDefault()` in the **owner** suppresses it, and the non-owner must **not** call `preventDefault()` (a non-owner that preventDefaults cancels the owner's zoom). That is another reason ownership must be resolved *before* any default action is taken.

*Plugin-specific detail (unconfirmed — no console capture for incident 3 in the pack):* whether H2 is bound to the pane element, to `document`, or in the capture phase, and whether the modal is portaled, cannot be determined from `fixture/`. The rule above is correct for all of those arrangements, but the exact call-site to change should be confirmed against the plugin source.

---

## 6. Regression tests that would have caught incidents 1–3

### T1 — Artifact-closure test (catches incident 1) ✅ highest value

**T1.1 "Chunk is self-contained" (build-time, pure):**
After the build, read the emitted mermaid chunk and assert it contains **no relative import specifiers**: scan for `import … from './…'`, `import './…'`, `export … from './…'`, `import('./…')` and assert zero matches with a relative (or bare-"/"-prefixed) specifier. Optionally assert zero `import(` of a sibling at all.
*Fails today for the split build → exactly incident 1.*

**T1.2 "Published closure ⊇ imported closure" (packaging test):**
`npm pack` / `pnpm pack` the plugin, extract the tarball into a temp dir, statically walk the import graph of every published entry (recursive: resolve `./x.js` → `x.js`), and assert **every** reachable file is present in the tarball. Also assert the file the plugin imports by name (e.g. `mermaid-chunk.js`) exists in the tarball.
*Fails today: the tarball contains `mermaid-chunk.js` but not its siblings → exactly incident 1.*

**T1.3 "Served graph loads" (integration, headless browser):**
Boot the host web server with the plugin's route registered, open a page containing one ```mermaid``` fence, and assert: the chunk request is **200**, **no** request under the prefix returns 404, the console contains **no** "Failed to fetch dynamically imported module", and a `<svg>` (mermaid's output) appears in the pane.
*Fails today on the split build (404 siblings) and on Windows (403) → catches incidents 1 and 2 end-to-end.*

**T1.4 "Chunk import resolves at runtime" (module semantics):**
Assert that the *loaded* chunk evaluates: e.g. the plugin exposes a marker (`globalThis.__mermaidChunkLoaded`) and the test waits for it. This catches the "entry is 200 but its graph is broken" failure mode that a status-code-only assertion misses.

### T2 — Route guard tests (catches incident 2) ✅

**T2.1 Guard truth table — pure function, platform-parameterized.**
Extract the containment decision into a pure function `isInside(base, target)` and drive it with an **explicit path flavor** so the matrix runs on every CI machine:

| base | candidate | expected |
|---|---|---|
| `E:\a\lib` | `e:\a\lib\x.js` | **inside** (the production case, `ci-note.md:11-12`) |
| `E:\a\Lib` | `e:\a\lib\x.js` | **inside** |
| `C:\a\lib` | `c:\a\lib\x.js` | **inside** (the laptop case, `ci-note.md:6`) |
| `E:\a\lib` | `E:\a\lib` | outside (target is the dir itself) |
| `E:\a\lib` | `E:\a\lib-evil\x.js` | **outside** (sibling-prefix trap) |
| `E:\a\lib` | `E:\a\other\x.js` | **outside** |
| `E:\a\lib` | `D:\a\lib\x.js` | **outside** (different drive) |
| `E:\a\lib` | `\\server\share\x.js` | **outside** (UNC) |
| `/srv/lib` | `/srv/lib/x.js` | inside |
| `/srv/lib` | `/srv/Lib/x.js` | **outside** (POSIX is case-sensitive) |
| `/srv/lib` | `/srv/lib-evil/x.js` | **outside** |
| `/srv/lib` | `/srv/other/x.js` | **outside** |
| `/srv/lib` | `/srv/lib/../../etc/passwd` | **outside** |

Run each case twice: once with `path.win32` semantics (on any OS, via `path.win32.relative`) and once with the **host's native** `path` semantics. The win32 rows are the ones that fail with the current `startsWith` guard.

**T2.2 The guard must never 403 a file that exists inside LIB_DIR (property test):**
For a matrix of generated bases `E:\x\lib`, `e:\x\lib`, `/x/lib`, and for each file in a temp LIB_DIR, assert the route returns **200** for every one of them. Add a case with **mixed case** (`E:\X\lib` containing `Foo.js`) — on Windows the file `foo.js` and the request `Foo.js` must both succeed.

**T2.3 Symlink cases (must still be blocked / must not false-positive):**
* A symlink **inside** LIB_DIR pointing **outside** it → **403** (the guard's real purpose).
* LIB_DIR itself reached **through** a symlink/junction → requests must **succeed** (this is the "canonicalize the base too" bug in §3.2).
* A junction on Windows (use `fs.symlink(..., 'junction')`, which needs no elevation).

**T2.4 Traversal & encoding cases:**
`..%2f..%2fetc/passwd`, `%2e%2e%2f`, absolute URLs (`http://evil/x` in the path), a NUL byte, a very long path, and a path with spaces → none may escape LIB_DIR; all must be 403/404 and never 200.

**T2.5 Route protocol cases:**
* `GET` on a valid `.js` → 200 + `content-type: application/javascript` + correct bytes.
* `GET` on a valid `.mjs` → 200 + JS MIME.
* `POST` → 405 (preserve the existing contract).
* `GET` on a non-JS file → 404.
* `GET` on a missing file → 404 (not 403) — and **the two 403 branches must emit distinct messages** (see §3.2), asserted by capturing the route log.

**T2.6 Cross-platform CI matrix (mandatory):**
The incident-2 bug **passed** on Linux CI *and* on the maintainer's Windows laptop — the platform label is not the discriminator; the **case combination** is. So the matrix must be
`{linux, windows} × {uppercase-drive base, lowercase-drive base, mixed-case base}`,
and T2.1 must additionally be run with **explicit `path.win32` semantics on Linux** so the failing combination is exercised everywhere, not only on the machine that happened to break.

### T3 — Wheel/zoom ownership tests (catches incident 3) ✅

**T3.1 Gesture ownership (jsdom or Playwright):**
Dispatch a synthetic `WheelEvent('wheel', { ctrlKey: true, deltaY: -100, bubbles: true, cancelable: true })` with the target inside the modal → assert: the modal's zoom transform changed; the **pane's font-size did not change**; the non-owner did **not** apply a transform (and did not suppress the owner's default action). Then dispatch the same event with the target inside the pane (outside the modal) → assert the **pane's** font-size changed and the modal's transform did not.

**T3.2 Ordering-independence (the important one):**
Run T3.1 against **four listener arrangements** and assert identical behaviour in all of them:
1. pane handler on the pane element (bubble);
2. pane handler on `window` (bubble);
3. pane handler on `document` with `{ capture: true }` — **this is the arrangement that breaks the `defaultPrevented`/flag fix**;
4. both handlers attached to the **same element** (the delegated design) — **this is the arrangement that breaks `stopPropagation()` alone**.
A fix that only passes T3.2 cases 1–2 is not sufficient.

**T3.3 Portaled modal:**
Render the modal into `document.body` **outside** the pane's subtree (overlay pattern) and repeat T3.1 → the pane must still ignore the gesture.

**T3.4 Plain scroll / non-Ctrl:**
`wheel` **without** `ctrlKey` must not zoom anything (neither surface), and `ctrlKey` + `deltaY` signs must map to zoom-in/zoom-out consistently. Also assert the listener is **not passive** (`{ passive: false }`), i.e. that `preventDefault()` actually suppresses the browser zoom (assert `defaultPrevented === true` after the owning handler runs).

**T3.5 Real-browser check (Playwright):**
In a real Chromium, `Ctrl+wheel` over the modal must change **only** the diagram's scale, and the pane's computed `font-size` must be identical before and after; then vice versa. Real-browser coverage is required because jsdom does not implement the browser's own Ctrl+wheel zoom default action.

### T4 — Non-regression / contract tests

* The route's public contract (prefix, status codes, MIME, 405 on non-GET) is snapshot-tested so the guard refactor cannot silently change it.
* The mermaid rendering path has a **fallback** test: when the chunk fails to load, the pane renders the fenced block as a code block (the behaviour seen in both console captures) — assert the fallback still works *and* that the plugin **logs a distinguishable diagnostic** per failure cause (import-closure 404 vs. route 403), so a future incident does not again present as an ambiguous "Failed to fetch dynamically imported module".
* A **release-gate** check: the packaged tarball is installed into a clean directory and the mermaid fence is rendered in a headless browser on **both** Windows and Linux before publish.

---

## 7. Unconfirmed / out of scope (per the brief's honesty rule)

1. **The internal reason Windows' `realpathSync` returns a lowercase drive letter** (volume mount-point record vs. `GetFinalPathNameByHandle` canonicalization vs. Node's JS `realpath` implementation) is **not verifiable from the fixture**. What *is* confirmed and sufficient is the observed pair (`LIB_DIR = "E:\…"` vs `realpath = "e:\…"`, `ci-note.md:11-12`) and the API contract: `realpathSync` returns the OS's canonical spelling, `import.meta.url` preserves the loader's spelling, `startsWith` compares bytes.
2. **Whether the maintainer's Windows 11 laptop also produced a lowercase `c:\` from `realpathSync`** is inferred (the note records "lowercase c:\\ in some tooling" for that machine) but not confirmed; the inference is that both sides agreed there, hence green.
3. **Incident 3 has no console capture** in the evidence pack. The event-propagation and ordering analysis (§5) is derived from DOM/Event semantics and the reported symptom; the plugin's exact binding sites (pane vs. `document`, capture vs. bubble, portaled or not) are **unconfirmed** and must be checked against the plugin source before choosing the edit site. The ownership rule in §5.3 is valid for all arrangements.
4. **How the plugin's own client bundle is served** (whether it is served by this same route) is not in the pack; it only matters for the conditional CORS item in §4.
5. **The host's web-server prefix-route contract** (whether `req.url` inside a `kind: 'prefix'` handler is the full path or the prefix-stripped remainder) is not documented in the fixture. It is **not** prefix-stripped here — the handler's `url.pathname.slice(RESOURCE_PREFIX.length)` produced a usable relative path (the observed error is 403, not the 404 that a stripped path would produce). The route should nonetheless assert this explicitly (`url.pathname.startsWith(RESOURCE_PREFIX)`) so a host contract change cannot silently turn every request into a 404.

---

## 8. Recommended order of work

1. **Ship the single-file chunk** (build: `inlineDynamicImports` / `splitting:false` / `splitChunks:false`) → fixes incident 1 immediately and removes the need to serve siblings (T1.1, T1.2 in CI).
2. **Rewrite the guard** to canonicalize both sides and compare with `path.relative()` → fixes incident 2 on every platform (T2.1–T2.6; add the Windows × case-variant matrix to CI before release).
3. **Implement the ownership rule** for Ctrl+wheel, with the containment check as the guarantee and `stopPropagation()` as an optimization → fixes incident 3 (T3.1–T3.4).
4. Add the **route protocol + MIME** assertions (§4) so the "serving requirement" stays satisfied as the bundle changes.
5. Add **distinct log messages** for the two 403 branches and for the two import-failure causes so the next incident is diagnosable from logs alone.

---

### Appendix A — corrected route (sketch)

```ts
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const RESOURCE_PREFIX = '/dsh-attach-input/resources'
const LIB_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)))   // no trailing separator

const isInside = (base: string, target: string): boolean => {
  const rel = relative(base, target)
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel)
}

handler: async (req, res) => {
  if (req.method !== 'GET') { res.writeHead(405).end(); return }
  const url = new URL(req.url ?? '/', 'http://dsh.internal')
  if (!url.pathname.startsWith(RESOURCE_PREFIX)) { res.writeHead(404).end(); return }
  const rel = decodeURIComponent(url.pathname.slice(RESOURCE_PREFIX.length)).replace(/^\/+/, '')
  if (rel === '' || !/\.(m?js)$/i.test(rel)) { res.writeHead(404).end('not a js resource'); return }

  const abs = resolve(LIB_DIR, rel)
  if (!isInside(LIB_DIR, abs)) { res.writeHead(403).end('path escapes the plugin lib (lexical)'); return }

  let file: string
  try { file = realpathSync(abs) } catch { res.writeHead(404).end('not found'); return }
  const realBase = realpathSync(LIB_DIR)                 // canonicalize the BASE too
  if (!isInside(realBase, file)) { res.writeHead(403).end('path escapes the plugin lib (symlink)'); return }

  const data = await readFile(file)
  res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8' })
  res.end(data)
}
```

### Appendix B — one-line root causes (for the incident log)

* **I1:** `import()` moves a *graph* to runtime; only the entry chunk was packaged, so the graph was incomplete at runtime → 404 on siblings, with the error naming the entry.
* **I2:** containment was decided by case-sensitive `startsWith` between a case-preserving base and a case-canonicalized `realpath` result → 403 on a file that exists, only where the OS canonical spelling differed in case.
* **I3:** `wheel` bubbles and the modal is a DOM descendant of the pane; `preventDefault()` does not stop the ancestor listener → both surfaces applied a transform.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.