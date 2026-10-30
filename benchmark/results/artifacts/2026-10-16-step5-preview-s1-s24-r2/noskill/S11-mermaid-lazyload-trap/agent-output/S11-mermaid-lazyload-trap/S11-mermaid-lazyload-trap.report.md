# S11 — Mermaid lazy-load rollout: root-cause report

**Subject:** `@org/dsh-attach-input` v0.4.0 (lib-only community plugin) — mermaid diagram rendering
in markdown reading mode, delivered as a lazily-imported chunk served by a new host prefix route.

**Scope:** read-only analysis of the evidence pack in `fixture/` plus local verification probes run
inside this cell (Node v24.14.1 on Windows). Nothing under `fixture/` was modified; no install,
migration, publish, or network access was performed. Temporary probe files were created under
`agent-output/` and deleted afterwards.

## Evidence used

| File | What it establishes |
|---|---|
| `fixture/chunk-route.ts` | the attempt-2 host route: extension filter, two containment guards, MIME header |
| `fixture/console-split-chunks.txt` | attempt 1: entry chunk 200, 97 sibling chunks 404, whole dynamic import rejected |
| `fixture/console-403-windows.txt` | attempt 2: 403 on Windows Server 2022 only; guard branch fired for a path inside lib |
| `fixture/ci-note.md` | the platform matrix and the decisive debug print (`LIB_DIR` vs `realpath`) |
| `fixture/README.md` | pack manifest |

## Direct answers (the five deliverables)

1. **Incident 1 — split chunks.** With code splitting the "entry" chunk is a *loader*: its body is
   mostly import statements pointing at sibling chunks, and ES module specifiers are resolved
   **relative to the importing module's own URL, at runtime, in the browser**. So the loadable unit is
   the **transitive closure** of the chunk graph, not the entry file. The 97 content-hashed siblings
   (`pie-WAS4IAKB-CQHCQWWM.js`) were never shipped with the package, so they 404; one missing sibling
   rejects the entire module graph, and the browser reports `Failed to fetch dynamically imported
   module` against the **entry** chunk — the file that returned 200. Fix (build side): emit one
   self-contained chunk (Rollup/Vite `output.inlineDynamicImports: true`; esbuild without
   `--splitting`; webpack without splitChunks for this entry), or — if splitting is kept — ship the
   entire emitted directory and enforce that with a closure test. The host route is *not* implicated:
   its `/.m?js$/` filter would have served the siblings had they existed.
2. **Incident 2 — the 403.** The route's *second* containment check
   (`fixture/chunk-route.ts` L19-20) compares `normalize(realpathSync(abs))` against `LIB_DIR` using
   **case-sensitive** `String.prototype.startsWith`. The two strings are produced by **different
   APIs** and, on the production host, differ in exactly one respect: the drive letter (`E:\` vs
   `e:\`, per the debug print in `fixture/ci-note.md` L11-12). `fileURLToPath` and `normalize` are
   purely lexical and case-preserving (they carry the case of the path the process used to load the
   module); `realpathSync` returns the OS-canonical form, whose case is not guaranteed to match.
   Windows treats `E:` and `e:` as the same volume; `startsWith` does not — so a file plainly inside
   `lib/` is classified as an escape and 403'd. Linux has no drive letter and performs no case
   folding (green CI); the laptop's install path was already lowercase (green there too).
3. **Fix direction + the other serving requirement.** Canonicalize the root through the *same*
   function the candidates use — `LIB_ROOT = realpathSync(<lib dir> without trailing separator)` —
   and test containment with `path.relative`, which is boundary-correct (it cannot be fooled by a
   `lib` / `lib-evil` sibling prefix) and already case-insensitive on win32 / case-sensitive on posix
   (verified in Appendix A); add explicit case-folding on Windows as belt-and-braces. Keep the
   realpath guard — its job is symlink-escape defence — but compare it against the *realpath'd*
   root. The other serving requirement: the response must carry a **JavaScript MIME type**
   (`application/javascript`). Module scripts are strictly MIME-checked, so a 200 served as
   `text/plain` or `application/octet-stream` fails the import with an error that looks nothing like
   a 403/404. The route already sets this correctly, so the requirement is "verify and never
   regress"; add `Access-Control-Allow-Origin` only if the client bundle is ever served cross-origin
   (module scripts are fetched in CORS mode).
4. **Incident 3 — both handlers fire.** `wheel` is bubbling and cancelable. The modal's handler
   called `preventDefault()`, which cancels the *browser's* page zoom but **does not stop
   propagation**; the same event therefore kept bubbling to the pane's listener on an ancestor (or on
   `window`/`document`, which every event reaches even when the modal is portaled to `body`), and the
   pane resized its font. Ownership rule: **one gesture, one owner** — the deepest active handler
   consumes it (`preventDefault()` registered `{ passive: false }`, plus `stopPropagation()`, or
   `stopImmediatePropagation()` when a competing listener shares the target), and every other handler
   yields by checking `event.defaultPrevented` at the top and returning.
5. **Regression tests.** See §5: T1 chunk-graph closure, T2 packlist completeness, T3 Playwright
   mermaid smoke, T4 injectable containment-guard matrix, T5 route contract, T6 gesture-ownership
   test, T7 bundler-config lock — with the browser and guard suites run on **both** ubuntu and
   windows, because a Linux-only pipeline is structurally blind to incident 2.

## Executive summary

| # | Incident | Root cause (one line) | Layer of the fix |
|---|---|---|---|
| 1 | Sibling chunks 404 | A split dynamic-import graph is loadable only if **every** file in its transitive closure is shipped and served; the content-hashed siblings were never in the package, and the failure is reported against the entry chunk | build / packaging |
| 2 | 403 on Windows only | A case-sensitive `startsWith` over two strings canonicalized by **different** APIs, disagreeing on drive-letter case, on a platform whose path semantics are case-insensitive | route guard |
| 3 | Ctrl+scroll double-fires | `preventDefault()` cancels the default action, not propagation; the modal never claimed ownership of the gesture, so it bubbled to the ancestor listener | event ownership |

The maintainer's takeaway ("Windows paths are unreliable") is wrong on all three counts. The paths
are fine; the *comparison* is wrong (2), the *package contents* are wrong (1), and the *event
contract* is wrong (3). Each is a specific, nameable API/contract mismatch — not platform folklore —
and each is reproducible and testable.

---

# 1. Incident 1 — why the split-chunk approach failed

## 1.1 What the capture shows

```
GET /dsh-attach-input/resources/mermaid-chunk.js        200  (8.1 kB)
GET /dsh-attach-input/resources/src-BfvxrPJe.js         404
GET /dsh-attach-input/resources/pie-WAS4IAKB-CQHCQWWM.js 404
TypeError: Failed to fetch dynamically imported module:
  http://127.0.0.1:3080/dsh-attach-input/resources/mermaid-chunk.js
[dsh-attach-input] mermaid chunk fell back to code block: TypeError: Failed to fetch ...
```

Three facts, in order of diagnostic importance:

1. **The entry chunk itself loaded (200, 8.1 kB).** Route, URL, MIME type and packaging of the *entry*
   were all correct. Nothing is wrong with the host route here.
2. **The 404s are for sibling chunk files**, and the maintainer's own `ls` confirms the cause: *"the
   sibling files listed in its import statements were NOT shipped with the package."* The route's
   extension filter `/.m?js$/` (`fixture/chunk-route.ts` L14) matches those names — they 404 because
   the **files are not on disk in `lib/`**, not because the route rejected them. (Distinguish
   "404 = route filter" from "404 = file absent"; here it is unambiguously the latter.)
3. **The error names the wrong file.** `Failed to fetch dynamically imported module` is reported
   against `mermaid-chunk.js` — the file that returned 200 — because the browser attributes the
   failure of the whole module graph to the top-level `import()` call site. Chasing the entry chunk
   is a dead end; the 404s on the siblings are the real signal.

## 1.2 The mechanism — what breaks when a dynamically imported chunk has sibling imports

With default code splitting, the "entry" chunk is not a self-contained program. It is a module whose
body is mostly import statements pointing at siblings:

```js
// mermaid-chunk.js, as emitted by the bundler
import './src-BfvxrPJe.js'
import(/* webpackChunkName: "pie" */ './pie-WAS4IAKB-CQHCQWWM.js')
```

The semantics that bite:

* **ES module specifiers resolve against the importing module's own URL.** Served from
  `/dsh-attach-input/resources/`, every relative specifier inside the entry resolves to
  `/dsh-attach-input/resources/<sibling>` *at runtime, in the browser*. The bundler performs no
  post-shipping rewriting, and there is no fallback: a module script that cannot be fetched (404,
  403, wrong MIME) is a hard error, not a retryable or degradable one.
* **The loadable unit is the transitive closure, not the entry.** `import()` resolves only when the
  entry *and every module it reaches* has been fetched and instantiated. One missing sibling anywhere
  in the graph rejects the whole promise — hence an 8.1 kB entry chunk 200s while the import fails.
* **Sibling names are content-hash-derived and change every build** (`pie-WAS4IAKB-CQHCQWWM.js`). Any
  hand-maintained allowlist — a `files` array, a `.npmignore` negation, a copy script's glob — is
  guaranteed to drift the moment a hash changes. That is exactly what happened: 97 siblings were
  emitted and none of them made it into the published package.
* **CI was blind to it.** Unit tests import the built module from *disk* through Node's resolver,
  which finds the siblings on the filesystem. Only a browser, or a test that asserts the *shipped
  file set*, can see the 404.

## 1.3 Build-side fix

For a lib-only plugin chunk there are two coherent strategies. Pick one and lock it with a test
(§5 T1/T2/T7).

**A. Eliminate the sibling graph — recommended here.** The chunk is loaded once, on demand, so
per-file caching buys nothing; emit exactly one file:

| Bundler | Setting |
|---|---|
| Rollup / Vite (`build.rollupOptions.output`) | `inlineDynamicImports: true` |
| esbuild | do **not** pass `--splitting` (splitting requires `--format=esm`; without it, a bundled `import()` is rewritten into a promise over the in-bundle namespace) |
| webpack | no `splitChunks` for this entry, or `import(/* webpackMode: 'eager' */ ...)` |

This is what attempt 2 already did (one 7.2 MB self-contained chunk) — that decision was correct; it
simply collided with incident 2. (7.2 MB in a single request is a *performance* smell worth a second
look — e.g. trim the mermaid diagram set actually used — not a correctness bug.)

**B. Keep splitting (only if per-diagram caching matters).** Then the closure invariant becomes
load-bearing and must be enforced mechanically:

* ship the **entire emitted directory**: copy `dist/**` into `lib/` wholesale, or declare
  `files: ["lib"]` (a directory — never an enumeration of file names), and never a hand-written list;
* pin `chunkFileNames` to something deterministic;
* keep the host route permissive enough to serve every emitted file (the current `/.m?js$/` filter is
  fine for `.js`/`.mjs`; widen it if the bundle also emits `.js.map`, workers or `.wasm`);
* add the closure test (§5 T1) so a future refactor cannot silently re-break it.

---

# 2. Incident 2 — the 403 on Windows, and the exact flaw in the guard

## 2.1 Which guard fires

The route has two containment checks that print the *same* message
(`fixture/chunk-route.ts` L16 and L20), so the log line alone does not say which one. The evidence
disambiguates:

* **Guard #1** (L15-16) compares `abs = normalize(join(LIB_DIR, rel))` against `LIB_DIR`. Both sides
  derive from the same `LIB_DIR` string, so they agree in case. It passes.
* **Guard #2** (L19-20) compares `normalize(realpathSync(abs))` against `LIB_DIR`. Here the two sides
  are produced by **different APIs** — and that is where it breaks.

The debug print in `fixture/ci-note.md` (L11-12) shows the two strings compared on the production
host:

```
LIB_DIR   = "E:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib"
realpath  = "e:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\mermaid-chunk.js"
```

Same file. Same directory. **One character class differs: the drive letter `E:\` versus `e:\`.**

## 2.2 The mechanism, API by API

```
LIB_DIR   --(new URL('.', import.meta.url) -> fileURLToPath)-->  "E:\...\lib"        case = as-launched
          --(path.normalize / path.join)-->                    lexical only, case-preserving
candidate --(fs.realpathSync(abs))-->                           "e:\...\lib\mermaid-chunk.js"  case = OS-canonical
compare   --(String.prototype.startsWith)-->                    byte-wise, CASE-SENSITIVE -> false -> 403
```

| API | What it returns | Case behavior |
|---|---|---|
| `new URL('.', import.meta.url)` + `fileURLToPath` | the module's own directory as a filesystem path | **preserves the case carried in the file URL**, i.e. the case of the path the process / package manager used to load the module (verified: `file:///e:/x/` -> `e:\x\`, `file:///E:/x/` -> `E:\x\`) |
| `path.normalize` / `path.join` | purely lexical: collapses `..`, `/` -> `\` on win32 | **never folds case** (verified) |
| `fs.realpathSync` | the OS-canonical path (symlinks resolved, trailing separator stripped — verified) | returns the canonical form as the OS reports it; its drive-letter case is **not guaranteed to equal the case of the path you passed in** — on the production host it came back lowercase |
| `String.prototype.startsWith` | — | **byte-wise, case-sensitive** |

So the bug is not "Windows is unreliable" and not even "realpath is unreliable". It is a **category
error**: the guard compares two strings canonicalized by *different* functions, with a
*case-sensitive* comparison, on a platform whose path semantics are *case-insensitive*. `E:\` and
`e:\` denote the same volume to Windows; `startsWith` does not know that, so a path plainly inside
`lib/` is classified as an escape and rejected.

## 2.3 Why Linux passes and the laptop passes — the controlled experiment

The ci-note matrix is a clean controlled experiment in which the only varying input is the
drive-letter case of the install path:

| Environment | `LIB_DIR` side (fileURLToPath) | candidate side (realpathSync) | `startsWith` | Result |
|---|---|---|---|---|
| Linux CI (node:24 container) | `/…/lib` — no drive letter | `/…/lib/mermaid-chunk.js` | true | **green** |
| Windows 11 laptop, DSH on `C:\` ("lowercase `c:\` in some tooling") | `c:\…\lib` — already lowercase | `c:\…\lib\mermaid-chunk.js` | true (both agree) | **green** |
| Windows Server 2022 production, DSH on `E:\` (uppercase) | `E:\…\lib` — uppercase | `e:\…\lib\mermaid-chunk.js` — lowercase | **false** | **403** |

On Linux there is no drive letter and `realpath` performs no case folding, so both sides agree. On
the laptop the install path itself was lowercase, so both sides agree by luck. On production the
install path is uppercase while the canonical form is lowercase, the two sides disagree, and the
guard 403s a file that exists. That is fully consistent with the console capture: the 403 body is the
guard's own `path escapes the plugin lib` message (`fixture/console-403-windows.txt` L12-13), and the
browser then reports the module as unfetchable and falls back to a code block.

### Verified locally (Node v24.14.1, Windows — probe output in Appendix A)

* `fileURLToPath` preserves URL case exactly and **appends a trailing separator**;
* `path.normalize` and `path.win32.resolve` never fold case;
* `fs.realpathSync` preserves the drive-letter case **of its input** and strips the trailing
  separator, whereas `fs.realpathSync.native` returns the OS-canonical form (uppercase drive). In
  other words, *which* case the canonical side takes is a property of the API, the Node/libuv
  version and the launch context — not of the filesystem — which is precisely why the guard must not
  depend on incidental case agreement between two differently-canonicalized strings. (The exact
  libuv code path that produced the lowercase form on the production host cannot be determined from
  this pack; it does not need to be.)
* `path.win32.relative('E:\a', 'e:\a\b')` -> `'b'`: **win32 `path.relative` is already
  case-insensitive**, and it correctly reports the sibling-prefix escape
  (`path.win32.relative('E:\a', 'E:\a-evil')` -> `'..\a-evil'`), while
  `path.posix.relative('/a', '/A/b/c')` -> `'../../A/b/c'` stays case-sensitive. `path.relative`
  already encodes exactly the platform-correct comparison semantics.
* **Latent second hazard in the excerpt:** because `new URL('.', import.meta.url)` yields a trailing
  separator, the literal guard #1 tests `abs.startsWith(LIB_DIR + sep)` against a *doubled*
  separator (`…\lib\\`) and rejects every request on every platform (verified: `false`). Since Linux
  CI is green and the ci-note print shows `LIB_DIR` without a trailing separator, the shipped code
  evidently strips it — but it is the same class of string-comparison hazard, and the fix in §2.4
  removes it as well.

## 2.4 Fix direction for the guard

Two changes, both required.

**(a) Canonicalize both sides through the *same* function, once, at module load.**

```ts
// before: two differently-canonicalized strings compared byte-wise
const LIB_DIR = normalize(fileURLToPath(new URL('.', import.meta.url)))

// after: the root goes through the identical canonicalization the candidates go through
const LIB_ROOT = realpathSync(
  fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]+$/, '')   // no trailing-separator skew
)
```

**(b) Compare with a boundary-aware, case-insensitive-on-Windows containment test.** Preferred:
`path.relative`, which is boundary-correct by construction (it cannot be fooled by a `lib` /
`lib-evil` sibling prefix) and is case-insensitive on win32 / case-sensitive on posix — exactly the
OS semantics:

```ts
function isInsideLib(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate)
  if (rel === '' || rel.startsWith('..') || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
    return false            // genuinely escapes: traversal, sibling prefix, absolute outside path
  }
  return true
}
```

Belt-and-braces (makes the intent explicit and immune to future Node/libuv case changes) — fold case
on Windows before comparing:

```ts
const fold = (p: string) => {
  const n = path.normalize(p).replace(/[\\/]+$/, '')     // kill trailing-separator skew
  return process.platform === 'win32' ? n.toLowerCase() : n
}
// then: fold(file) === fold(root) || fold(file).startsWith(fold(root) + path.sep)
```

**Keep guard #2** (the `realpathSync` one) — its job is to defeat **symlink escapes**, which a purely
lexical guard cannot see; it just has to compare against the *realpath'd* root. Harden the two
adjacent rough edges while in there: `decodeURIComponent` throws on malformed `%`-sequences (wrap it
and answer 400 instead of an unhandled rejection), and reject NUL bytes.

Why this is robust on both platforms: it never relies on two strings happening to agree in case. It
relies on one shared canonicalization of the root plus `path.relative`'s platform-correct comparison
(verified above). Linux keeps its correct case-sensitive behavior; Windows gets the
case-insensitive comparison the OS itself uses.

## 2.5 The other serving requirement: a JavaScript MIME type

A dynamic import is a **module script** fetch, and browsers enforce *strict MIME checking* on module
scripts: the response must be 200 **and** carry a JavaScript MIME type (`text/javascript` or
`application/javascript`). Anything else — `text/plain`, `application/octet-stream`, a missing header
— rejects the import with `Failed to load module script: Expected a JavaScript module script but the
server responded with a MIME type of …`, an error that looks nothing like a 403/404 and survives
every path fix.

The route already does this correctly — `res.writeHead(200, { 'content-type': 'application/javascript;
charset=utf-8' })` (`fixture/chunk-route.ts` L23) — so the requirement is *verify and never
regress*: if the handler is ever refactored into a generic static-file server, an
`express.static`/`sirv`-style middleware or a proxy, the MIME type must stay a JavaScript one, and
the regression test (§5 T5) must assert it. Secondary and conditional: module scripts are always
fetched in CORS mode, so if the client bundle is ever served from a different origin (a webview or
iframe origin rather than `http://127.0.0.1:3080`), the route also needs
`Access-Control-Allow-Origin`. Today the request is same-origin, so CORS is not implicated in this
incident.

---

# 3. Incident 3 — why BOTH handlers fire on one Ctrl+scroll

## 3.1 Mechanism

`wheel` is a **bubbling, cancelable** event. One physical Ctrl+scroll over the open zoom modal
produces exactly one `WheelEvent`, which then travels the whole propagation path:

1. **Capture** — `window -> document -> … -> target`;
2. **Target** — the modal's / diagram's handler runs (it is the deepest handler). To stop the
   browser's own page zoom it calls `preventDefault()`;
3. **Bubble** — `target -> … -> pane container -> document -> window`. The pane's font-size handler is
   registered on an ancestor (the pane root, or `window`/`document`); it receives the *same* event and
   resizes the pane font.

The critical detail: **`preventDefault()` cancels the default action (browser page zoom) — it does not
stop propagation.** The modal handler claimed the *default action* but never claimed the *gesture*, so
the event kept bubbling and the ancestor handler acted on it too. Both scales change on one wheel
tick. Two variants of the same trap:

* **Modal portaled to `document.body`** (common for fullscreen overlays): the modal is then not a DOM
  descendant of the pane, so the pane's *element-level* listener would not see it — but any
  `window`/`document`-level listener still does, because every event propagates to `window`. Both
  listeners firing is therefore guaranteed in either DOM arrangement.
* **Both listeners on the same target** (e.g. both on `window`): even `stopPropagation()` is not
  enough — it does not stop other listeners *on the same target*; only `stopImmediatePropagation()`
  (or a `defaultPrevented` check) does.

Also lurking: Chromium and Firefox treat `wheel` (and `touchstart`/`touchmove`) listeners on
`window`, `document` and `document.body` as **passive by default**, so `preventDefault()` there is a
silent no-op plus a console warning, and the browser page-zoom happens as well. Both handlers must be
registered `{ passive: false }` if they intend to cancel the gesture.

## 3.2 The ownership rule

> **One gesture, one owner.** For each gesture class (Ctrl+wheel, key combos, pinch), exactly one
> handler owns it: the **deepest / most specific handler whose scope is currently active** — here, the
> zoom modal while it is open. The owner *consumes* the gesture: `preventDefault()` (with
> `{ passive: false }`) to kill the browser default, and `stopPropagation()` to keep ancestors out
> (`stopImmediatePropagation()` if a competing listener shares the target). Every non-owner handler
> **yields first**: check `event.defaultPrevented` (and/or `event.cancelable === false`) at the top of
> the handler and return without acting. Ancestors never act on a gesture a descendant already
> claimed.

Concretely for this plugin — implement both halves:

* the modal's Ctrl+wheel handler ends with `e.preventDefault(); e.stopPropagation()` (registered
  `{ passive: false }`); and
* the pane's Ctrl+wheel handler starts with `if (e.defaultPrevented) return` — the standard
  cooperative-yield idiom, which also covers the portaled / `window`-listener arrangement and any
  third-party handler that correctly claims a gesture. A module-level "gesture owner" registry
  (an `activeZoomOwner` the pane consults) is an equally valid implementation of the same rule.

---

# 4. Root causes, restated without folklore

| Incident | Not the cause | The cause |
|---|---|---|
| 1 | "the route can't serve chunks", "the browser hates dynamic import" | the transitive closure of the chunk graph was not shipped — content-hashed sibling names are un-allowlistable; the entry 200ing while the import fails is normal module-graph error attribution |
| 2 | "Windows paths are unreliable" | a case-sensitive `startsWith` over two strings canonicalized by different functions, on a case-insensitive path platform |
| 3 | "the browser double-fires wheel events" | the modal handler cancelled the default action but never claimed the gesture, so it bubbled to the ancestor listener |

---

# 5. Regression tests that would have caught incidents 1–3

All of these belong in `pnpm test` / CI, and **CI must run the browser and guard suites on both
`ubuntu-latest` and `windows-latest`** — the ci-note matrix is the proof that a Linux-only pipeline
is structurally blind to incident 2.

| ID | Layer | Test | Catches |
|---|---|---|---|
| T1 | build | **Chunk-graph closure.** After `build`, scan every `lib/**/*.{js,mjs}` for relative `import` / `import()` specifiers, resolve each against its file's directory, and assert the target **exists on disk**; fail listing every missing specifier. A regex/`acorn` walk is enough. | Incident 1 — the exact failure: siblings absent from the build output |
| T2 | pack | **Packlist completeness.** `npm pack --dry-run --json` -> file set; assert it equals the contents of `lib/` (allowing only intended extras such as README / package.json). Catches `files`-allowlist / `.npmignore` / copy-script drift, which is what actually happened. | Incident 1 — packaging, the true root cause |
| T3 | browser (Playwright) | **Mermaid smoke.** Build, start the host, open a page containing a `mermaid` fence, then assert: (a) a rendered `svg` exists — *not* the code-block fallback; (b) zero responses with status >= 400 and zero `requestfailed` events for `/dsh-attach-input/resources/`; (c) no console error matching `/Failed to (fetch\|load) (dynamically imported )?module/`. | Incidents 1 **and** 2 end-to-end, plus any MIME regression — all three surface as "module never executes -> fallback" |
| T4 | unit | **Guard matrix.** Extract the containment check into a pure, injectable `isInsideLib(root, candidate, { pathImpl, realpath })` and test: identical paths; drive-letter case differs (`E:\` vs `e:\`); tail case differs; root with and without trailing separator; sibling-prefix escape (`…\lib-evil`); `..` traversal; absolute outside path; symlink resolving outside (realpath stub) -> must reject. Run the **entire matrix with `path.win32` semantics on Linux CI** by injecting `path.win32` plus a realpath stub, and again natively on windows. Assert both directions (contained -> true, escape -> false) so the fix cannot degenerate into deleting the guard. | Incident 2 — without the injection a Linux-only CI can never see it |
| T5 | integration | **Route contract.** Register the real route on a real `http.Server`; `GET /dsh-attach-input/resources/mermaid-chunk.js` -> assert 200, body equals the file bytes, and `content-type` matches `/^(application\|text)\/javascript/`. Assert a genuine escape (`..%2F..%2Fpackage.json`) and a non-js path -> 403/404. Run on both OSes. | Incident 2, plus the MIME requirement of §2.5 |
| T6 | browser + unit | **Gesture ownership.** Open the zoom modal; record the pane's computed `font-size` and the diagram's transform; dispatch Ctrl+`wheel` over the diagram; assert the diagram scale changed **and** the pane font-size did not, and `event.defaultPrevented === true`. Regression guard for the base behavior: with the modal closed, Ctrl+wheel on the pane still changes the font-size. Unit variant: both handlers on one element -> assert the pane handler's spy never ran. | Incident 3 — and its over-correction |
| T7 | config | **Design lock.** Assert the bundler config pins the single-file decision (`inlineDynamicImports === true` / splitting disabled), so a future "let's re-enable splitting" change fails the suite and forces T1/T2 to be updated with it. | Incident 1 — prevents the regression at its source |

T3 is the highest-value single test: it is the only one that observes the system the way the browser
does, and every one of the three incidents ends in the same observable — the diagram falls back to a
plain code block.

---

# Appendix A — local verification probe (Node v24.14.1, Windows)

Run inside this cell; temporary files were created under `agent-output/` and deleted afterwards.
Nothing outside the two allowed paths was touched.

```
process.cwd()                       : "E:\\"                     (drive-letter case of cwd)
fileURLToPath(file:///e:/x/)       : "e:\\x\\"                   (URL case preserved, trailing sep appended)
fileURLToPath(file:///E:/x/)       : "E:\\x\\"
realpathSync        (E: input)     : "E:"                        (non-native preserves input case,
realpathSync        (e: input)     : "e:"                         strips the trailing separator)
realpathSync.native (E: input)     : "E:"
realpathSync.native (e: input)     : "E:"                        (native = OS-canonical form)
guard#1 as written (literal read)  : false                       (trailing-separator doubling rejects everything)
path.win32.relative(E:\\a, e:\\a\\b): "b"                         (case-insensitive on win32)
path.win32.relative(E:\\a, E:\\a-evil): "..\\a-evil"              (sibling prefix correctly flagged)
path.posix.relative(/a, /A/b/c)    : "../../A/b/c"               (case-sensitive on posix)
normalize keeps case               : true
```

Reading: the canonical side's case is a property of the API / version / launch context, not of the
filesystem — so a containment guard must canonicalize both sides identically and compare with
platform-correct (case-insensitive on Windows) semantics. `path.relative` already does exactly that.

# Appendix B — fix checklist

1. **Build:** one self-contained chunk (`inlineDynamicImports: true` / splitting off) — or ship the
   whole emitted directory; lock the decision with T7.
2. **Pack:** T1 + T2 green before every publish.
3. **Route:** `LIB_ROOT = realpathSync(<lib dir>` without trailing separator); containment via
   `path.relative` (+ case-fold on win32); keep the realpath guard for symlink escapes; harden
   `decodeURIComponent`; keep `content-type: application/javascript`; T4 + T5 green on ubuntu **and**
   windows.
4. **Client:** the zoom modal owns Ctrl+wheel (`preventDefault` + `stopPropagation`,
   `{ passive: false }`); the pane yields on `defaultPrevented`; T6 green.
5. **CI:** browser smoke (T3) and the guard matrix (T4) run on the OS matrix, not Linux only.
