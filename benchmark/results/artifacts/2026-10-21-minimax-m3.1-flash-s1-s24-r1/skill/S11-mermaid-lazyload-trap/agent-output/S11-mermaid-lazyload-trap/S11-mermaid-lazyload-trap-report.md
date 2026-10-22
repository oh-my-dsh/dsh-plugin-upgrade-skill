# S11 | Mermaid Lazy-Load Trap | Root-Cause Report

**Plugin:** `@org/dsh-attach-input` (lib-only bundle) | **Host plane:** DSH web host, new `ctx.webServer.register` prefix route
**Mode:** plugin-upgrade **Mode A | inspect** (read-only diagnosis; no plugin, route, build, or profile file was written)
**Evidence:** `fixture/chunk-route.ts`, `fixture/console-split-chunks.txt`, `fixture/console-403-windows.txt`, `fixture/ci-note.md`
**Method note:** every platform claim below was re-derived locally (Node 24, win32) with throwaway probes under `agent-output/S11-mermaid-lazyload-trap/scratch/`; probe output is quoted inline as evidence rather than asserted from platform folklore.

---

## 0. Executive summary

| # | Incident | Root cause (one line) | Fix owner |
|---|---|---|---|
| 1 | Split chunks -> 404 siblings | A dynamically imported chunk is only the **entry** of a module graph; its static sibling imports are resolved by the browser **relative to the entry's URL** and were never shipped | build / packaging |
| 2 | 403 on Windows Server only | The containment guard compares two path strings with **case-sensitive `String.prototype.startsWith`** on a **case-insensitive** filesystem; the two spellings it compares differ only in the drive letter's case (`E:\\ vs `e:\\) -> a false "path escapes" | host route |
| 3 | Ctrl+scroll double-applies | The modal's wheel handler and the pane's font-size handler are **two owners of one gesture**; a `wheel` event delivered inside the modal bubbles to the pane handler, and `preventDefault()` does not stop propagation | client UI |

The three incidents are independent. The single most important framing correction: **none of them is "Windows is unreliable"**. Each is a *string / ordering* bug that only becomes visible under a specific set of conditions (a code-splitting entry, a differently-cased path spelling, a nested overlay).

---

## 1. Incident 1 | split chunks: 404 on every sibling import

### 1.1 What the console actually shows

```
GET /dsh-attach-input/resources/mermaid-chunk.js        200  (8.1 kB)
GET /dsh-attach-input/resources/src-BfvxrPJe.js         404
GET /dsh-attach-input/resources/pie-WAS4IAKB-CQHCQWWM.js 404
TypeError: Failed to fetch dynamically imported module:
  http://127.0.0.1:3080/dsh-attach-input/resources/mermaid-chunk.js
```

Read carefully, the capture contains **two different facts** that are usually conflated:

1. the entry chunk was fetched **successfully (200)**;
2. the rejection message names the **entry** URL, not any of the 404 URLs.

That is not a contradiction - it is the module system working as designed.

### 1.2 Mechanism - what actually breaks

A bundler that emits a dynamically imported entry with default code-splitting does **not** emit "one lazy file". It emits a **module graph**:

* `mermaid-chunk.js` = the entry chunk, whose body contains **static** `import` statements pointing at the shared graph, e.g. `import { render } from './pie-WAS4IAKB-CQHCQWWM.js'` (mermaid splits per diagram type, hence the per-diagram siblings);
* those siblings are emitted as **separate files** in the same output directory.

The browser's ES module loader resolves a specifier **relative to the URL of the module that contains it**. Because the entry chunk is served from `/dsh-attach-input/resources/mermaid-chunk.js`, the sibling specifier `./pie-WAS4IAKB-CQHCQWWM.js` resolves to `/dsh-attach-input/resources/pie-WAS4IAKB-CQHCQWWM.js` - i.e. **the route's own prefix**. The route is therefore correct; the *files* are absent. The fixture confirms it: the `ls` of the shipped `lib/` showed `mermaid-chunk.js` present and "the sibling files listed in its import statements were NOT shipped with the package".

The failure is atomic by design: a module graph is **fetched and then instantiated as a unit**. If **one** dependency 404s, instantiation of the whole graph throws, the `import()` promise rejects, and the rejection is reported **against the entry specifier** the caller wrote. Hence "Failed to fetch dynamically imported module: .../mermaid-chunk.js" while the 200 line for that same URL sits three lines above. The error text points at the *caller's* specifier; the 404 lines point at the *cause*. Diagnosing from the error message alone sends you to the wrong file - which is exactly what happened here.

There is a second, packaging-shaped consequence: the 8.1 kB entry versus the 7.2 MB single file of attempt 2 shows the split was doing the right thing for payload size. The failure was not "splitting"; it was **shipping an incomplete graph**.

### 1.3 Build-side fix

| Option | How | Trade-off |
|---|---|---|
| **A. Inline the dynamic import** (what attempt 2 did) | Build the mermaid entry with the bundler's *inline dynamic imports* / no-code-splitting output option, so `import('mermaid')` resolves to a single self-contained ES module. The exact option name is bundler-specific (rollup/rolldown family: `output.inlineDynamicImports`) - **unconfirmed for the toolchain in use**; confirm it against the real build config | one 7.2 MB file; the "other serving requirement" of section 3 applies |
| **B. Ship the whole graph** | Keep code-splitting, but make the **packed artifact** contain every emitted chunk and let the route serve the whole directory | many files; the route's file filter must stay in sync with the emitted set |
| **C. Drop the dynamic import** | Statically import mermaid in the main client bundle | 7.2 MB on the first-paint critical path; usually worse than A |

Whichever option is chosen, the invariant to enforce is:

> **The set of files reachable through the chunk's static import graph, resolved relative to the chunk's own URL, must be exactly the set of files present in the shipped artifact and servable at that URL prefix.**

This is the same class of defect as **API-07** (`references/api-migration-0.1.2-alpha.2.md`): *package export != artifact presence* - verify the **packed artifact**, never the source tree. **DSH-0.1.5-A2-20** (`references/v0.1.5-alpha.2.md`) is the DSH-side precedent for the intended shape: browser-only libraries belong in `devDependencies` and are **inlined into `lib/client.js` or merged by the host's Vite build**, so the browser artifact stays self-contained.

---

## 2. Incident 2 | the 403 on Windows Server 2022 (root cause, precisely)

### 2.1 The two lines that decide the outcome

```ts
const abs  = normalize(join(LIB_DIR, rel))               // line 15
if (!abs.startsWith(LIB_DIR + sep)) { 403 }              // line 16  (lexical check)
...
file = normalize(realpathSync(abs))                      // line 19
if (!file.startsWith(LIB_DIR + sep)) { 403 }             // line 20  (realpath check)
```

The production host's own debug print (from `fixture/ci-note.md`):

```
LIB_DIR   = "E:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib"
realpath  = "e:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\mermaid-chunk.js"
```

The two strings name **the same directory**. They differ in exactly one character position: the **case of the drive letter** (`E:\\ vs `e:\\). The route log confirms which branch fired: *"the guard branch fired ('path escapes the plugin lib') - for a path that is plainly inside the lib directory"*.

### 2.2 The mechanism, named API by API

`String.prototype.startsWith` is a **byte-exact, case-sensitive** comparison. It has no idea that the two strings name the same directory:

```
"e:\dsh\...\lib\mermaid-chunk.js".startsWith("E:\dsh\...\lib" + path.sep)  ->  false   // -> 403
```

The filesystem underneath is the opposite: **NTFS path resolution is case-insensitive**, so `E:\x` and `e:\x` are one and the same object. The route therefore asks a case-sensitive question of a case-insensitive world.

**Why the two spellings disagree on that host.** The two strings are produced by two *independent* APIs, each free to pick its own letter case, and Windows has no on-disk truth to arbitrate the drive root's case (a drive root has no directory entry name):

* `LIB_DIR` comes from `normalize(fileURLToPath(new URL('.', import.meta.url)))` - it preserves the **drive-letter spelling carried by the module URL** the ESM loader produced (here uppercase `E:\\).
* `realpathSync(abs)` returns the **canonical on-disk spelling** of the resolved path (here lowercase `e:\\, matching the volume spelling the OS reports for that install root).

Local probe on a Windows host (Node 24) - the two APIs are not required to agree, and the native realpath canonicalises while the JS realpath preserves the input spelling for the components it need not change:

```
fs.realpathSync('E:\DEEPSEEK-HARNESS')        -> "E:\DEEPSEEK-HARNESS"   // JS impl: preserves input case
fs.realpathSync.native('e:\DEEPSEEK-HARNESS') -> "E:\deepseek-harness"   // native: canonical on-disk case
fileURLToPath('file:///E:/a/lib/')               -> "E:\a\lib\"             // keeps the URL's case + trailing separator
```

**Why Linux passes.** On POSIX the filesystem is **case-sensitive**, so `realpath` *must* return exactly the canonical path, and the module URL and the on-disk spelling necessarily agree. The byte-exact prefix comparison is then *correct by construction* on Linux - the same code in a different world. The guard is not "wrong on Windows"; it is **right only where case is significant**.

**Why the maintainer's own matrix missed it.** The CI note is the decisive clue:

| Environment | LIB_DIR spelling | realpath spelling | Guard | Result |
|---|---|---|---|---|
| Linux CI | `/.../lib` | `/.../lib` | equal | green |
| Laptop, Windows 11, DSH on **C:** (lowercase `c:` in some tooling) | `c:\...\lib` | `c:\...\lib` | equal | green |
| Production, Windows Server 2022, DSH on **E:** (uppercase) | `E:\...\lib` | `e:\...\lib` | **differ** | **403** |

The two Windows lanes had the **same defect**; they differed only in whether the *incidental* case of the two spellings happened to coincide. A test matrix that samples "a Windows machine" cannot distinguish "the guard is case-robust" from "the guard was lucky". That is why the fix must **construct** the mismatch rather than rely on a host's incidental spelling (section 5).

**A second, latent defect in the same guard (not the one that fired).** `LIB_DIR` is derived from `fileURLToPath(new URL('.', import.meta.url))`, which - as the probe shows - **keeps the trailing separator** (`E:\a\lib\`). If the deployed code does not trim it, `LIB_DIR + sep` becomes a **double separator** and the prefix test fails for *every* legitimate file on *every* platform. The production print shows `LIB_DIR` without a trailing separator, so the deployed code evidently trims it (or the print trimmed it) - but the `LIB_DIR + sep` pattern is fragile in exactly this way. The fix below removes the fragility.

**Not the cause (checked and excluded).** The path is *not* escaping: `rel` is `mermaid-chunk.js`, `join`+normalize cannot climb out of `LIB_DIR` without a `..` segment, and none is present. The 403 is a **false positive of a lexical guard**, not a traversal.

---

## 3. Fix direction for the guard, and the other serving requirement

### 3.1 Replace the string-prefix test with a *relative-path* containment test

The rule to use is **`path.relative(root, candidate)`**, never `candidate.startsWith(root + sep)`.

```ts
import { realpathSync } from 'node:fs'
import path from 'node:path'

const LIB_ROOT = realpathSync(LIB_DIR)          // canonicalise the ROOT with the same API
const real     = realpathSync(abs)              // canonicalise the CANDIDATE
const rel      = path.relative(LIB_ROOT, real)  // platform-aware containment primitive
const inside   = rel !== ''
  && rel !== '..'
  && !rel.startsWith('..' + path.sep)
  && !path.isAbsolute(rel)
if (!inside) { res.writeHead(403).end('path escapes the plugin lib'); return }
```

**Why this is robust on both platforms - the property that matters.** `path.relative` performs its comparison with the **platform's own case rules**, so the case mismatch that broke `startsWith` simply does not exist for it. Local probe output (win32 + posix semantics):

```
// win32 - case-INSENSITIVE comparison (the whole point)
path.win32.relative('E:\dsh\lib', 'e:\dsh\lib\mermaid-chunk.js')  -> "mermaid-chunk.js"      inside
path.win32.relative('E:\dsh\LIB', 'E:\dsh\lib\x.js')              -> "x.js"                   inside
// posix - case-SENSITIVE comparison (correct by construction)
path.posix.relative('/srv/lib', '/srv/lib/x.js')                      -> "x.js"                   inside
path.posix.relative('/srv/Lib', '/srv/lib/x.js')                      -> "../lib/x.js"            outside (correct on Linux)
// escape / sibling-prefix / cross-root shapes
path.win32.relative('E:\dsh\lib', 'E:\dsh\library\x.js')         -> "..\library\x.js"      outside (sibling-prefix trap)
path.win32.relative('E:\dsh\lib', 'E:\dsh\lib\..\x.js')        -> "..\x.js"               outside
path.win32.relative('E:\dsh\lib', 'F:\x.js')                       -> "F:\x.js"               outside (absolute, other drive)
path.win32.relative('E:\dsh\lib', '\\server\share\x.js')        -> "\\server\...\x.js"  outside (absolute, UNC)
```

Note the two shapes the raw-prefix test handled only by luck, which the new predicate handles by construction: the **sibling-prefix trap** (`lib` vs `library`) and the **cross-root** case (different drive / UNC), where `path.win32.relative` returns an *absolute* path, so `path.isAbsolute(rel)` is the correct reject condition. Also note the exact reject form matters: use `rel === '..' || rel.startsWith('..' + path.sep)`, **not** a bare `rel.startsWith('..')`, so a legitimate file named `..foo.js` is not rejected.

**Canonicalise the root with the same API you use for the candidate.** This matters for a second, real-world variant of the same failure: when the plugin is installed as a **junction / symlink** (pnpm store layouts, link installs), `realpathSync(abs)` may resolve to a target **outside** `LIB_DIR`, so a naive "realpath the candidate, prefix-compare against the unresolved root" rejects legitimate files. Canonicalising **both** sides with the **same** function makes the comparison self-consistent. (The plugin-upgrade troubleshooting table carries this junction / symlink-install family of findings for Windows profiles.)

**Acceptable minimal patch (if you must keep the prefix shape).** Lower-case both sides before comparing - `file.toLowerCase().startsWith(LIB_ROOT.toLowerCase() + path.sep)` - with the root canonicalised first. It works, but `path.relative` is the principled primitive: it is the only comparison that knows the platform's case rules, and the only one that also handles the sibling-prefix and cross-root shapes without a second special case.

**Defence in depth (optional, cheap).** Keep the lexical check as a *pre-filter* (it rejects `..` cheaply) but make the **realpath check authoritative** and root-canonicalised. Order: decode -> reject non-JS extensions -> `resolve` (not `join`) the candidate -> lexical pre-check -> realpath -> `path.relative` containment -> serve.

### 3.2 The other serving requirement a dynamic import needs

`import()` succeeds only if **every** member of the module graph can be fetched **and** the response is acceptable as a *module script*. Beyond the containment fix, the route must satisfy:

> **The chunk must be served as a JavaScript module whose complete static import graph is reachable at URLs that resolve relative to the chunk's own URL - i.e. every file the chunk statically imports must be served by this same route, under this same prefix, with a JavaScript MIME type, and the chunk itself must be emitted as an ES module.**

Against the fixture's route:

| Requirement | Fixture status | Action |
|---|---|---|
| JavaScript MIME type on the chunk | **already satisfied** - `'content-type': 'application/javascript; charset=utf-8'` is a JavaScript MIME type, and the `charset` parameter is fine | keep it; a `text/plain` response would be rejected by the browser's strict module MIME check with a *different* error ("Expected a JavaScript module script...") - do not "simplify" this line |
| The chunk is an ES module | **unconfirmed** (not in the fixture) | if the bundler emitted IIFE/CJS for the entry, `import()` cannot instantiate it; assert the output format in the build test |
| **The whole static import graph is servable** | **gap** - the route's file filter is `/.m?js$/` (line 14), so anything in the graph that is not `.js`/`.mjs` (e.g. `.json`, `.wasm`, `.css`) 404s, and one missing member kills the whole graph | either keep the graph purely `.js` (option A/B in 1.3), or widen the filter **and** ship those files |
| Credentials | module scripts use credentials mode `same-origin`, so the browser **does** send the session cookie for a same-origin chunk | if the route is moved behind the host's Connection gate, it must still answer a module fetch |

**DSH-specific notes on the route's shape.** A raw `ctx.webServer.register` route does **not** inherit Connection authentication - the plugin-upgrade precision checklist is explicit ("Channel auth joins the host gate", **DSH-0.1.2-A1-08**): a raw route must call `ctx.connection.requestRejection(req)` and honour its 401/403 result, or be re-expressed through `ctx.connection.fetch.register`. Two consequences for this route:

* **Security:** today the route is effectively an *unauthenticated* read of the plugin's `lib/` directory. `lib/` is the plugin's own client bundle and can contain build-time constants; and per **DSH-0.1.5-A1-11** a hand-rolled file route that reads by path can serve *any* absolute path the host process can read if the guard is wrong. The route should be explicitly gated, and should carry the hardening that card prescribes for self-served files (`X-Content-Type-Options: nosniff`, a private / no-store cache policy, a byte cap - relevant here, the chunk is 7.2 MB).
* **Availability:** if the web surface is token/cookie gated (**DSH-0.1.2-A1-08** - process-scoped bootstrap tokens and signed cookies), the module fetch must carry that credential. Same-origin module fetches do; a cross-origin page (e.g. `localhost` vs `127.0.0.1`) additionally needs CORS headers on this route.

**Also fix in the same pass:** the route's extension allow-list is captured in the **host half's closure at apply time**; changing it does not take effect in a running host - the client bundle is re-fetched on refresh, but the host route is not re-registered (plugin-upgrade troubleshooting row on host-route / client-bundle update-plane asymmetry). A change to the filter or to the file set needs a **host restart**, and the release note should say so.

---

## 4. Incident 3 | why BOTH handlers fire on one Ctrl+scroll

### 4.1 The two handlers

* **Modal handler** - inside the new fullscreen zoom modal, a `wheel` listener with `ctrlKey` that scales the diagram and calls `preventDefault()` to suppress the browser's own page zoom.
* **Pane handler** - in the markdown reading pane, a `wheel` listener with `ctrlKey` that changes the pane's `font-size` (browser-style zoom emulation).

The symptom: one physical gesture produces **two** effects - the diagram scales **and** the pane's text resizes.

### 4.2 Mechanism - event delivery, not "two handlers on the same element"

1. **Delivery is a *path*, not a single target.** A `wheel` event is dispatched at the deepest element under the cursor, then travels **capture** (window -> document -> ... -> target) and then **bubble** (target -> ... -> document -> window). Every listener on every node on that path is invoked. If the modal element is a descendant of the pane container (a `position: fixed` overlay rendered inside the pane's subtree is the common case), the pane's container is on the bubble path of the very same event the modal handled. If instead the pane's handler is registered on `document` / `window` - the usual shape for a "ctrl+wheel anywhere in this pane" font-size feature - then `document` / `window` is on the path of *every* wheel event in the document, including those inside a modal. **Either arrangement produces the same double-fire.**
2. **`preventDefault()` != "handled".** `preventDefault()` only suppresses the browser's *default action* for the event (here: the browser's own page zoom). It does **not** stop the event from reaching other listeners. Propagation control is `stopPropagation()` (and `stopImmediatePropagation()` for same-node listeners) - and that is the *wrong* tool here, see 4.3.
3. **Order is deterministic, and it is not the problem.** On different nodes the target-phase listener (the modal) runs before the ancestor bubble-phase listener (the pane), so the diagram zooms first and the font resizes second. The order explains the *sequence* of the two effects, not their co-occurrence.

**A second, independent contributor: the browser's own page zoom.** Even with a perfect ownership rule, the pane's text would still *appear* to resize if the **browser** zoomed the page: the browser applies that zoom as the default action of a `ctrl`+`wheel` event. Suppressing it requires `preventDefault()` to actually take effect, which requires a **non-passive** listener. In Chrome, `wheel` / `mousewheel` / `touchstart` / `touchmove` listeners registered on **`window`, `document` or `body` are passive by default**, so a pane-level handler attached there cannot prevent the default; the browser zoom proceeds and scales the whole page (pane text included). A "ctrl+wheel font-size" feature must therefore attach to a **specific element** with `{ passive: false }` (or an explicit override) to be able to suppress the browser zoom. If the pane's handler lives on `document`, its `preventDefault()` is a no-op with a console warning.

**Net effect:** two plugin-level effects (diagram zoom + pane font-size) plus, potentially, a browser-level page zoom - all from one gesture, all at once.

### 4.3 The ownership rule that fixes it

> **Ownership rule: exactly one component owns a given gesture at a given moment, and ownership is claimed explicitly by the *innermost* scope that handles it. An ancestor handler must decline any gesture that originates inside a nested modal / overlay, and a handler must never act on a gesture that a nested scope has already claimed.**

Concretely, for this plugin:

1. **Scope the pane's font-size handler to the pane's own content.** Attach it to the pane's own scroll container (not `document` / `window`), and inside it **decline** events whose target is inside the modal (or inside any overlay the plugin owns): `if (modalRoot.contains(e.target)) return`. This is the ownership check - the modal claims the gesture because the gesture happened inside it.
2. **Make the modal the sole owner while it is open.** The modal's handler is the only one that may scale anything while the modal is mounted; it should also `preventDefault()` and keep the gesture from reaching pane-level handlers (`stopPropagation()` in the target phase - reliable only against *bubble-phase* ancestors, which is exactly why step 1 is the primary fix and `stopPropagation()` is the belt-and-braces one).
3. **Keep the browser zoom suppressed** by using a non-passive listener on the element that owns the gesture (`{ passive: false }`), so the page does not zoom behind the modal.
4. **Mirror the DSH precedent for "one owner of a scroll surface".** **DSH-0.1.5-RC1-03** (`references/v0.1.5-rc.1.md`) is the same rule applied to scrolling: a document renderer receives a required `scrollportRef`; a renderer that ignores it keeps the shared body as the scroll owner; attach the callback to the element that actually scrolls and pass `null` when you stop owning the scrollport. The scroll-ownership rule and the gesture-ownership rule are the same rule: **ownership is explicit and transferable, never incidental.** A plugin modal is a new scroll/zoom surface and must take ownership explicitly, and the pane must release it while the modal is open.

---

## 5. Regression tests that would have caught Incidents 1-3

### 5.1 Incident 1 - artifact-graph closure (build / pack time)

| # | Test | Assertion | Would have caught |
|---|---|---|---|
| T1 | **Chunk graph closure over the built output** | For every emitted chunk under `lib/`, parse its static import specifiers; resolve each **relative** specifier against the chunk's own path; assert the resolved file **exists in `lib/`** | the 404 siblings (fails on `pie-WAS4IAKB-CQHCQWWM.js`) |
| T2 | **Packed-artifact closure (npm pack)** | Repeat T1 against the **tarball's** file list, not the working tree | the real defect: the siblings existed in the build output but were excluded from the package's `files` allow-list |
| T3 | **Self-containment assertion** (if option A is chosen) | The shipped mermaid chunk contains **zero** relative static imports; assert by scanning the emitted file for `from './...'` / `import('./...')` | a regression that re-enables code-splitting for that entry |
| T4 | **Served-graph parity** | The set of files in the chunk's import graph == the set of files the route would serve under the same prefix (every graph member passes the route's extension filter and is present) | the route's `/.m?js$/` filter silently dropping a graph member |
| T5 | **Config snapshot** | The bundler config for the mermaid entry asserts the inlining option is on (the option's name is **unconfirmed** for this toolchain - pin it once, then assert it) | someone turning code-splitting back on |

T1/T2 are the direct expression of **API-07** (*package export != artifact presence*): verify the packed artifact, not the source tree.

### 5.2 Incident 2 - route containment (host plane)

| # | Test | Assertion | Would have caught |
|---|---|---|---|
| T6 | **Case-mismatch containment matrix** | Table-driven over the containment predicate: **{same spelling, drive-letter case flipped, directory case flipped, both flipped}** => all must be **inside** | the production 403 - *by construction*, not by luck (the original matrix only ever sampled coincidentally-matching spellings) |
| T7 | **Escape matrix (negative)** | `..` traversal, percent-decoded traversal, absolute path, different drive (`F:\...\`), UNC share, **sibling prefix** (`lib` vs `library`) => all must be **outside**, and the response must not leak file bytes | proves the fix did not simply widen the hole |
| T8 | **realpath-vs-literal divergence** | Build a case where `abs` and `realpathSync(abs)` differ in spelling; assert 200 + byte-exact body | the specific check that fired (line 20) |
| T9 | **Route handler integration** | Drive the handler with a mock req/res: GET a file inside `lib/` => **200**, `content-type: application/javascript; charset=utf-8`, byte-exact body; GET a traversal => 403/404 with no body leak; non-GET => 405 | end-to-end, and keeps the content-type line from being "simplified" away |
| T10 | **Cross-platform CI matrix (mandatory Windows lane)** | Run T6-T9 on **Windows** *and* Linux; the Windows lane must include the case-flipped inputs | the original gap: three environments, one defect, two green by coincidence |
| T11 | **Static lint** | Forbid raw string-prefix containment on filesystem paths (`startsWith(LIB_DIR...)`) in the plugin's host half; require the `path.relative` form | recurrence of the pattern, not just of this bug |
| T12 | **Host-restart / stale-closure check** | After changing the route's file filter, assert the **running** host answers the new extension (i.e. the release process restarts the host) | the host/client update-plane asymmetry: the client bundle refreshes on reload, host routes are registered once at apply time |

### 5.3 Incident 3 - zoom ownership (client plane)

| # | Test | Assertion | Would have caught |
|---|---|---|---|
| T13 | **Synthetic wheel dispatch (jsdom)** | Dispatch a `wheel` event with `ctrlKey: true` whose target is the modal element => diagram scale changed by exactly one step, **pane `font-size` unchanged**, and `event.defaultPrevented === true` | the double-apply (the central symptom) |
| T14 | **Negative dispatch** | Same event, target = pane content => pane `font-size` changes, **diagram scale unchanged** | symmetry: the two handlers must be mutually exclusive |
| T15 | **Listener-registration audit** | Assert the pane's ctrl+wheel handler is **not** registered on `document` / `window`, or that it explicitly declines events whose target is inside the modal | the actual source of the double-fire |
| T16 | **Passiveness assertion** | Assert the owning handler is registered with `{ passive: false }` (on an element, not on `document`) | the browser's own page zoom sneaking in behind the modal |
| T17 | **Real-browser check (Playwright)** | Open the modal, send ctrl+wheel, assert: diagram scale changed, pane computed `font-size` unchanged, **page zoom unchanged** (`visualViewport.scale` unchanged) | end-to-end proof that the *browser* is not the thing resizing the text |
| T18 | **Overlay-ownership regression** | Any overlay added later must implement the same decline-if-inside check | keeps the rule alive as the plugin grows more overlays |

### 5.4 Release gate

A release should be blocked unless: **T1 + T2** pass on the **packed** artifact (no dangling chunk); **T6-T10** pass on **Windows and Linux** with the case-flipped inputs; **T13-T17** pass in a real browser. A CI matrix that samples "some Windows machine" is not sufficient - the platform-specific cases must be **constructed**.

---

## 6. Report (plugin-upgrade Mode A structure)

**Pre-existing (baseline failures):** not collected - this is a read-only diagnosis of a runtime symptom set; the fixture contains no source tree to build, and no build/test baseline was run.

**Completed**
* Root causes derived from the evidence pack for all three incidents: bundler / module-graph semantics (Inc. 1), the exact guard defect and its platform mechanism (Inc. 2), and the event-delivery / ownership mechanism (Inc. 3).
* Fix directions: a platform-aware `path.relative` containment predicate over a canonically-resolved root; the build-side invariant "the chunk's static import graph == the shipped, servable file set"; the modal-owns-the-gesture ownership rule; and the one other serving requirement (module validity + full graph reachability + JS MIME type).
* 18 concrete regression tests mapped onto the three incidents.
* Platform claims re-derived locally with Node probes on win32 (case-sensitive `startsWith` vs case-insensitive `path.win32.relative`; `realpathSync` vs `realpathSync.native` case canonicalisation; `fileURLToPath` trailing-separator retention; cross-root `relative` results).

**Skipped (with evidence)**
* Any write to the plugin, the route, the build config, or the profile - Mode A is read-only and the brief authorises a report only.
* No migration, install, or version change was attempted.
* The live host was **not** probed (out of scope per the brief; the installed host is a different version).

**Pending / residual risk**
* **The upstream source of the case divergence is not recorded in the fixture.** The fixture *shows* the two spellings (`E:\...\` vs `e:\...\`); which component (the ESM loader's module URL, the profile path configuration, or the volume spelling) produced the uppercase form is not in evidence. The **comparison** defect is confirmed and platform-independent; the provenance of the uppercase spelling is **unconfirmed**.
* **The client-side sources for Incident 3 are not in the fixture.** The analysis (bubbling, two owners, `preventDefault` semantics, default-passive `document` listeners) is derived from the reported symptom and standard DOM semantics; the actual registration site of the pane's font-size handler, and whether the modal is portaled, are **unconfirmed**.
* **The bundler and its inlining option are not in the fixture** - the *direction* (inline the dynamic import, or ship the whole graph) is confirmed; the specific flag is **unconfirmed** for this toolchain.
* The exact aliases of `normalize` / `join` / `sep` in the route excerpt are elided. That is irrelevant to the check that fired (the realpath one), but it means the double-separator hazard in 2.2 could not be confirmed or excluded from the excerpt alone.
* Untested platforms/hosts: no verification was performed against a real Windows Server 2022 install; the platform behaviour was reproduced on a Windows host with Node 24 and the guard's logic re-derived from the evidence.

**Rollback**
* Nothing was changed, so there is nothing to roll back. The recommended changes are, in order: (1) the `path.relative` containment predicate in the chunk route; (2) the build/pack closure invariant; (3) the zoom ownership rule. Each is a local, single-file change with a one-line revert.

**Recommendations**
1. **Replace the containment guard** with `path.relative` over a canonically-resolved root (3.1) - this is the fix that unbreaks the production host, and it is platform-neutral by construction.
2. **Make the route's service contract explicit**: JS MIME type (already correct), the full static import graph servable under the same prefix, credentials/CORS considered, and the route either deliberately unauthenticated-and-safe or deliberately gated through the Connection service (**DSH-0.1.2-A1-08**).
3. **Harden the self-served file route** along the lines of **DSH-0.1.5-A1-11**: `nosniff`, private / no-store caching, a byte cap, and an explicit statement that this route reads a directory of the plugin's own lib and must never grow into a read-any-path endpoint.
4. **Fix the zoom gesture ownership** in the client (4.3): scope the pane handler to its own content, let the modal claim the gesture, use a non-passive listener, and follow the **DSH-0.1.5-RC1-03** scroll-ownership pattern for the modal's own scroll surface.
5. **Adopt the inlined / merged client artifact pattern** of **DSH-0.1.5-A2-20** (browser-only libraries in `devDependencies`, inlined into `lib/client.js` or merged by the host build), so the shipped mermaid chunk is a single self-contained ES module by construction rather than by configuration discipline.
6. **Prefer the official file surface over hand-rolled routes** where the payload allows (**DSH-0.1.5-A1-11**). Note the current resource-extension surface (**DSH-0.1.5-A1-16**) is for *content*, not executable modules, so the chunk route stays a route - but it should then be written to the same hardening standard.
7. **Adopt the plugin-upgrade validation discipline** for the next release: verify the **packed** artifact, verify on **both** Windows and Linux with constructed platform-specific cases, and verify a real browser mount (accept the host-advertised URL rather than a hard-coded path - **DSH-0.1.2-A1-19**).
8. **A note on the maintainer's takeaway:** "Windows paths are unreliable" is the wrong lesson. The correct lesson is that *a lexical, case-sensitive containment check is not a containment check on a case-insensitive filesystem* - and that a test matrix sampling real machines cannot tell a correct guard from a lucky one.
