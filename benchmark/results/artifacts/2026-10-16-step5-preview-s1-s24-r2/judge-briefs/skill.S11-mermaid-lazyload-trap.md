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

**Subject:** @org/dsh-attach-input v0.4.0 — lazily imported mermaid chunk served by a host prefix
route. Three incidents diagnosed from the read-only evidence pack in fixture/:

| Evidence | Used for |
|---|---|
| `fixture/chunk-route.ts` | Incident 2 — the containment guard |
| `fixture/console-split-chunks.txt` | Incident 1 — sibling import 404s |
| `fixture/console-403-windows.txt` | Incident 2 — the 403 on Windows only |
| `fixture/ci-note.md` | Incident 2 — the pass/fail platform matrix and the LIB_DIR/realpath dump |

**Method:** each root cause is derived from the semantics of the API involved (bundler module-graph
emission, Windows path/realpath normalization, DOM event propagation), corroborated by the CI matrix,
and — where possible — reproduced with read-only Node probes (Node **v24.18.1**, win32, this
session). Probe results are quoted verbatim in the appendix. No fixture file was modified; nothing
was installed, migrated, or executed from the fixture.

---

## 0. TL;DR

| # | Incident | Root cause (one line) | Fix class |
|---|---|---|---|
| 1 | Sibling imports 404 | A code-split chunk is a **graph**, not a file; the siblings it names were never shipped, and the whole import() rejects on the *entry* URL even though the entry itself returned 200 | Build-side: emit one self-contained file (and/or ship every emitted asset) |
| 2 | 403 on Windows only | The guard compares two strings produced by APIs with **different case-normalization behaviour** using a **case-sensitive** startsWith; Windows path identity is case-insensitive | Compare path-aware (path.relative), canonicalize the root through the same realpath boundary |
| 3 | Diagram **and** pane font-size both zoom | One wheel event, two handlers on the same propagation path, neither claiming the gesture; capture-phase ordering and passive defaults make it worse | One gesture, one owner: innermost claims (preventDefault + stopPropagation, non-passive), outer handlers respect defaultPrevented |

---

## 1. Incident 1 — why the split-chunk approach failed

### 1.1 What breaks when a dynamically imported chunk has sibling imports

A bundler's default code splitting does not emit "a chunk"; it emits a **module graph of files that
must all be present and all be served**. The browser's module loader enforces that graph:

1. `import('./mermaid-chunk.js')` is a *module-script* fetch. The browser fetches the entry file, then
   must fetch **the entry's dependencies** (its static import statements, and transitively its own
   dynamic imports) and **instantiate the whole graph before any of it is evaluated**.
2. Those dependency URLs are resolved **relative to the chunk's own URL** — the module's base URL —
   not relative to the document. So `import './src-BfvxrPJe.js'` inside
   `/dsh-attach-input/resources/mermaid-chunk.js` becomes
   `/dsh-attach-input/resources/src-BfvxrPJe.js`.
3. If any dependency 404s, the graph fails to instantiate and the **entire** import() promise
   rejects.

That last point is the diagnostic trap visible in `console-split-chunks.txt`:

```
GET .../resources/mermaid-chunk.js         200  (8.1 kB)     <- the entry is fine
GET .../resources/src-BfvxrPJe.js          404               <- the real failure
GET .../resources/pie-WAS4IAKB-CQHCQWWM.js 404               <- the real failure
TypeError: Failed to fetch dynamically imported module:
  http://127.0.0.1:3080/dsh-attach-input/resources/mermaid-chunk.js
```

The error names **mermaid-chunk.js, which returned 200**. The browser blames the outermost
import() URL, never the sibling that actually failed. Reading this console, the natural (wrong)
conclusion is "the entry chunk is broken". It is not: the entry was fetched successfully and the
failure is entirely in the graph *below* it. Any future debugging must start from the 404 lines, not
from the TypeError line.

The second tell in the same capture is the entry's size: **8.1 kB**. Mermaid is megabytes; an 8 kB
"mermaid chunk" means the diagram code was split out into the siblings (mermaid's own per-diagram
lazy imports became sibling chunks). The entry being small and 200 is therefore evidence *for* the
siblings being missing, not evidence against it.

The maintainer's own note in `console-split-chunks.txt` states the shipped-state fact: the sibling
files named in the entry's import statements **were not shipped with the package**. So the failure is
not a routing bug at all — the route in attempt 2 did not even exist yet. The route was never asked
for the siblings, and had it been asked it would have 404'd on disk.

### 1.2 Build-side fix

**Primary fix — make the lazily imported entry a single self-contained file.** A dynamic-import entry
that must survive being served as one URL must have zero sibling edges:

| Bundler | Setting |
|---|---|
| Rollup | `output.inlineDynamicImports: true` (requires a single-entry input for that build; incompatible with `output.manualChunks` for the same chunk graph) |
| esbuild | `bundle: true` with `splitting: false` (the default for a single-entry bundle; do **not** pass `--splitting`) |
| webpack | `optimization.splitChunks: false`, `optimization.runtimeChunk: false`, single `entry`, fixed `output.filename` |

This is exactly what attempt 2 did (one 7.2 MB self-contained chunk) and it is the right call for a
lib-only plugin whose chunk is fetched over HTTP from a host route.

**Secondary fixes that must accompany it (otherwise attempt 2's success is luck, not a guarantee):**

- **Ship the whole emitted set.** If splitting is ever re-enabled (or the mermaid dep pulls in
  worker/wasm assets), every emitted file must be in the package (`files` / `.npmignore`) **and**
  reachable through the route. Assert it in CI (see T1/T2 in section 5).
- **Keep the route's allowlist compatible with the emitted set.** The current `/.m?js$/` filter is
  fine for JS siblings, but a route that whitelists one known filename instead of a pattern
  reintroduces this exact bug for the second file.
- **Import the chunk by a URL the host actually serves**, e.g.
  `import(/* @vite-ignore */ new URL('./mermaid-chunk.js', import.meta.url).href)` (or the host
  route's own base URL), so the specifier does not depend on a dev-server layout.
- **Do not treat a 200 on the entry as success.** The observable success criterion is "no failed
  request under the resource prefix **and** an `<svg>` was rendered", never "the entry chunk loaded".

---

## 2. Incident 2 — the exact flaw in the containment guard

### 2.1 The code under suspicion

```ts
const LIB_DIR = normalize(fileURLToPath(new URL('.', import.meta.url)))  // .../lib/
...
const abs = normalize(join(LIB_DIR, rel))
if (!abs.startsWith(LIB_DIR + sep)) { res.writeHead(403).end('path escapes the plugin lib'); return }   // guard #1
let file
try {
  file = normalize(realpathSync(abs))
  if (!file.startsWith(LIB_DIR + sep)) { res.writeHead(403).end('path escapes the plugin lib'); return } // guard #2  <-- fires
} catch { res.writeHead(404).end('not found'); return }
```

Guard #1 is lexical and **cannot** be the culprit: `join`/`normalize` are case-preserving and
syntactic, so `abs` starts with `LIB_DIR` verbatim (reproduced — see appendix A.3).

Guard #2 is the one that fired. Its two inputs are produced by **different APIs with different
case-normalization behaviour**:

| API | What it does to case | Evidence |
|---|---|---|
| `fileURLToPath(new URL('.', import.meta.url))` | **Purely syntactic, case-preserving.** Echoes the drive-letter and component case of the module URL, i.e. the case the host process used when it resolved the plugin's own module | Probe: `pathToFileURL('E:\dsh\...\index.js')` -> `fileURLToPath(...)` -> `E:\dsh\...\index.js`; a `file:///c:/...` URL -> `c:\...` |
| `path.join` / `path.normalize` / `path.resolve` | Lexical only. Never case-fold, never touch the filesystem | Probe A.3 |
| `fs.realpathSync(abs)` (Windows) | **A normalization boundary.** The call crosses into the OS realpath layer (libuv `uv_fs_realpath` -> `GetFinalPathNameByHandleW` -> `\\?\` prefix stripping). The string it returns is the *OS-canonical* form and is **not guaranteed to preserve the case of the string you handed it**. On the production host the drive letter came back **lowercased** | `fixture/ci-note.md` dump: `LIB_DIR = "E:\dsh\...\lib"` vs `realpath = "e:\dsh\...\lib\mermaid-chunk.js"` |
| `String.prototype.startsWith` | **Ordinal, case-sensitive** comparison on every platform. No locale awareness, no case folding | Trivially `'e:\a'.startsWith('E:\a\') === false` (reproduced, A.3) |
| Windows path identity | **Case-insensitive** (NTFS is case-preserving but case-insensitive for lookup; `E:` and `e:` are the same volume) | — |
| Linux path identity | **Case-sensitive**, and there is no drive letter at all | — |

So the comparison `file.startsWith(LIB_DIR + sep)` asks a **case-sensitive string question about a
case-insensitive path namespace**, and the two operands arrive from APIs that disagree about
normalization. The 403 is therefore not "Windows is unreliable" — it is a *type error in the
comparison*: two strings that denote the same Windows path are compared with `===`-style semantics.

### 2.2 Why Linux passes and Windows does not (the CI matrix, explained)

| Environment (from ci-note.md) | import.meta.url case | realpathSync case | startsWith | Result |
|---|---|---|---|---|
| Linux CI (node:24-bookworm) | `.../lib` (no drive letter) | identical string, resolved | match | **200** |
| Windows 11 laptop, DSH on `c:\` (lowercase in some tooling) | `c:\...\lib` | `c:\...\lib\...` | match | **200** |
| Production, Windows Server 2022, DSH on `E:\` (uppercase) | `E:\...\lib` | `e:\...\lib\...` | **mismatch** | **403** |

The Linux row passes for a structural reason, not by luck of a good comparison: with no drive letter
and both strings derived from the same already-canonical absolute path, there is nothing left for the
two APIs to disagree about. The laptop row passes by **coincidence**: its launcher produced a
lowercase `c:` module URL, which happens to agree with what the realpath boundary emitted. The
production row fails because its launcher produced an uppercase `E:`.

That is the whole story, and it explains the maintainer's confusion exactly: the same code passes on
two machines and fails on the third, so "Windows is unreliable" feels like the only explanation. The
real invariant is: **the guard passes iff the drive-letter case in `import.meta.url` happens to match
what the realpath boundary emits** — which is not something a plugin can control or predict.

### 2.3 Naming it precisely

> **Root cause:** a case-sensitive prefix comparison (`String.prototype.startsWith`) is used as a
> containment test across the `fs.realpathSync` normalization boundary on a case-insensitive path
> namespace. `fileURLToPath(import.meta.url)` preserves the launcher's case; `realpathSync` returns
> the OS-canonical form (lowercased drive letter on the production host); `startsWith` compares
> codepoints. On Linux no drive letter exists and both operands agree, so the defect is invisible
> there.

Two notes on the realpath side, for honesty and precision:

- I could not reproduce the lowercase drive letter on *this* host: on Node v24.18.1/win32,
  `realpathSync` echoed the input's case, including for a deliberately mis-cased tail component
  (appendix A.2). The exact lowercasing is therefore build/volume dependent. **That strengthens the
  conclusion rather than weakening it**: the case of `realpathSync`'s output is not a contract you
  may depend on, so the guard must not depend on it either.
- Guard #2's *intent* is symlink/junction defence (a symlink inside `lib/` pointing outside). It is
  load-bearing and must be kept — but it must be expressed as a path comparison, not a string
  comparison.

---

## 3. Fix direction

### 3.1 The containment guard — compare path-aware, and canonicalize both sides

Use the platform's own path semantics instead of raw string prefixes, and push the root through the
same realpath boundary so both operands are normalized identically:

```ts
import { join, normalize, relative, sep, isAbsolute } from 'node:path'
import { realpathSync } from 'node:fs'

// The root goes through the SAME normalization boundary as the file:
const ROOT = realpathSync(normalize(fileURLToPath(new URL('.', import.meta.url))))  // .../lib/, canonical

function insideLib(resolved) {
  const rel = relative(ROOT, resolved)          // platform-aware comparison
  return rel !== ''                             // the root itself is not a servable file
    && rel !== '..'
    && !rel.startsWith('..' + sep)              // any escape, however spelled
    && !isAbsolute(rel)                         // different drive / different root
}

// ... in the handler, after guard #1 (keep guard #1 as the cheap lexical pre-filter):
const file = realpathSync(abs)                  // throws -> 404
if (!insideLib(file)) {
  // log BOTH sides: this is what made the original 403 undiagnosable
  res.writeHead(403).end('path escapes the plugin lib'); return
}
```

**Why this is robust on both platforms** (all rows verified by probe, appendix A.4):

- `path.relative` on Windows performs a **case-insensitive component comparison**
  (`path.win32.relative('E:\A\B', 'e:\a\b\c') === 'c'`), so a case difference anywhere in the
  path — drive letter or component — is treated as the same path, matching Windows semantics.
- On Linux `path.relative` is case-sensitive, which is *correct* there: `/a/lib` and `/A/lib` really
  are different directories, and a genuine case-based escape is still rejected.
- It is separator- and root-aware, so it also rejects the cases a hand-rolled prefix check gets
  wrong: the sibling-prefix trap (`libsibling.js` next to `lib`), a `..`-spelled escape
  (`lib\..\..\x`), and a cross-drive target (`relative('E:\lib', 'C:\evil')` returns the absolute
  `C:\evil`, caught by `isAbsolute`).
- Canonicalizing `ROOT` with `realpathSync` as well means the comparison happens entirely inside
  one normalization domain — no cross-boundary string comparison remains.

If you prefer to keep string comparison, the minimum correct form is to case-fold **both** sides on
Windows only (`process.platform === 'win32' ? p.toLowerCase() : p`) — but `path.relative` is
preferable because it also handles separators, roots and the sibling-prefix trap structurally.

### 3.2 One other serving requirement: a JavaScript MIME type

**A dynamic `import()` is a module-script fetch with strict MIME type checking. The response must
carry a JavaScript MIME type (`text/javascript`, `application/javascript`, ...).** If it does not, the
browser refuses to execute the module and rejects the `import()` with the same opaque
`TypeError: Failed to fetch dynamically imported module` — indistinguishable, from the console, from
a network failure. A `200 OK` with `text/plain`, or an SPA fallback's `200 OK + text/html`, fails
exactly like a 404.

The current route does satisfy this (`'content-type': 'application/javascript; charset=utf-8'`), but
only *by construction*, and that construction is fragile:

- The MIME is hardcoded and gated on the `/.m?js$/` allowlist. The moment the allowlist is widened to
  serve `.map` / `.css` / `.json` / `.wasm` / `.txt` siblings (which section 1.2 says you may need), that
  hardcoded header starts lying. Derive the content type from the extension, and make "JS extension
  => JavaScript MIME" an invariant, never a coincidence.
- The route must **win against any catch-all/SPA fallback**: it has to be matched before the host's
  HTML fallback, otherwise an unknown-but-existing chunk path can be answered with `index.html` and
  the strict MIME check kills the import.

Two further serving invariants worth pinning in the same place:

- **Same-origin, or CORS.** Module fetches run in CORS mode. Same-origin (as here,
  `127.0.0.1:3080`) is fine; the day the lib dir is served from another origin/port/CDN, the response
  needs `Access-Control-Allow-Origin` (and credentials only with
  `Access-Control-Allow-Credentials`).
- **Host auth gate.** A raw `ctx.webServer.register` route does not inherit DSH's Connection
  authentication (see the skill's channel-auth item, DSH-0.1.2-A1-08 in
  `skills/plugin-upgrade/references/v0.1.2-alpha.1.md`). Static JS is low-sensitivity, but if the
  profile's gate protects other routes, this one should call
  `ctx.connection.requestRejection(req)` and honor its 401/403 before reading the file — otherwise
  the route is an unauthenticated hole in an otherwise gated host.

---

## 4. Incident 3 — why BOTH handlers fire on one Ctrl+scroll

### 4.1 The propagation arithmetic

A trackpad pinch or Ctrl+wheel produces **one** `wheel` event (`WheelEvent`, `bubbles: true`,
`cancelable: true`) dispatched on the deepest element under the pointer — the diagram — and then
propagates along the DOM path:

```
capture:  window -> document -> ... -> pane -> modal -> diagram        (outermost first)
bubble:   diagram -> modal -> pane -> ... -> document -> window        (innermost first)
```

Both the zoom modal's wheel handler and the pane's font-size handler sit on that same path, so a
single gesture invokes **both**. Neither one claims the gesture:

- the modal's handler does not call `stopPropagation()`, so the event keeps bubbling to the pane's
  handler; and
- the pane's handler does not check whether the gesture was already consumed.

Result: two independent handlers each apply their own transform to the same event object — the
diagram scales *and* the pane's font size scales. There is no race and no double event; it is plain
event delivery to two subscribers.

### 4.2 Why the obvious escapes do not work

- **`preventDefault()` alone never stops propagation.** It only cancels the default action (the
  browser's own page zoom). Both handlers still run.
- **Passive defaults.** Chromium treats `wheel`/`touchstart`/`touchmove` listeners on `window`,
  `document` and `document.body` as **passive by default**, so a `preventDefault()` inside a
  window- or document-level handler is a no-op (with an "Unable to preventDefault inside passive
  event listener" warning). If the modal's handler is window-level and passive, you get a *third*
  zoom: the browser's native page zoom.
- **Portalling the modal does not help.** Rendering the modal into `document.body` removes it from
  the pane's DOM subtree, but if the pane's handler listens on `document` or `window`, the portaled
  modal's events still bubble straight into it. The event path, not the React tree, decides who gets
  called.
- **Registration order does not decide it either** — unless the phases differ, which is the trap:

### 4.3 The ordering trap (this is the subtle half)

Bubble-phase listeners run **innermost-first**, so "innermost claims" works. But **capture-phase**
listeners run **outermost-first**. If the pane's font-size shortcut is registered as a
capture-phase `window`/`document` listener while the modal's handler is a bubble-phase element
listener, the pane handler runs **before** the modal ever sees the event — the modal's claim arrives
too late to stop it, and swapping which one was registered first changes nothing. The fix must be
phase-aware, not just "stop propagation somewhere".

### 4.4 The ownership rule: one gesture, one owner

> **Exactly one handler may act on a gesture: the one whose scope contains the gesture target and
> that has claimed it. Every other handler on the path must defer to that claim, regardless of
> registration order, phase, or portalling.**

Concretely, for the modal:

1. **Register non-passively** on the modal element (or on `window` in the **capture** phase if you
   want a single top-level arbiter): `addEventListener('wheel', onWheel, { passive: false })`.
   Non-passive is a hard requirement for `preventDefault()` to suppress the browser's native zoom.
2. **Claim the gesture when it is yours** (`ctrlKey` && the event originated inside the modal):
   `event.preventDefault()` **and** `event.stopPropagation()`. For two handlers on the *same* node,
   use `stopImmediatePropagation()`.
3. **Outer/global handlers respect a claim, first line:**
   `if (event.defaultPrevented) return` — and, defensively, bail if
   `event.composedPath().includes(modalEl)`. Using `defaultPrevented` (rather than a private flag)
   makes the contract work across modules and phases.
4. **Tear the listener down on close** (`AbortController` signal passed to `addEventListener`), so a
   closed modal cannot keep claiming gestures and reopening cannot double-register.
5. Keep the pane shortcut itself intact when no modal is open — the fix must not trade one bug for
   "Ctrl+scroll no longer zooms the pane".

---

## 5. Regression tests that would have caught incidents 1-3

All three incidents were invisible to the current suite because the suite is **Linux-only** and
asserts on the wrong observables. The tests below are grouped by incident; the last group is the
structural gap.

### 5.1 Incident 1 — missing sibling chunks

| ID | Test | Layer | Why it catches it |
|---|---|---|---|
| T1 | **Chunk-graph closure test.** After the production build, parse the emitted entry chunk's `import` / `import()` specifiers (AST or a strict regex over relative specifiers) and assert **every** one resolves to a file that exists in the output directory | build | Fails the moment a sibling is dropped or emitted elsewhere. This is the direct assertion of "the graph is closed" |
| T2 | **Package-contents test.** `npm pack --dry-run` and diff the tarball listing against the emitted `lib/` tree; assert they are equal | packaging | Catches "emitted but not shipped" — exactly the failure mode in `console-split-chunks.txt` |
| T3 | **Build-config guard.** Snapshot the resolved bundler config for the mermaid entry and assert `inlineDynamicImports: true` (Rollup) / `splitting: false` (esbuild) / `splitChunks: false` (webpack) | build | A future config change that re-enables splitting fails CI instead of the browser |
| T4 | **Rendered-output e2e (Playwright/Chromium).** Load a note containing a mermaid-fenced code block (three-backtick fence); capture the network log; assert **zero** failed requests under `/dsh-attach-input/resources/*` **and** that a diagram `<svg>` was rendered (not a `<pre>` code block) | e2e | The only test that observes the actual user-visible outcome plus the network. Entry-200/sibling-404 fails it on the network assertion *and* on the SVG assertion |
| T5 | **Fallback-is-failure.** Treat the `[dsh-attach-input] mermaid chunk fell back to code block` branch as a CI failure (assert it is not taken) | unit | Prevents the silent degradation that let attempt 1 ship |

### 5.2 Incident 2 — the Windows-only 403

| ID | Test | Layer | Why it catches it |
|---|---|---|---|
| T6 | **Containment-predicate unit test (table-driven).** Call the real predicate with: same-case path; path differing only by drive-letter case; path differing by component case; sibling-prefix (`libsibling.js`); `..` traversal; symlink/junction pointing outside `lib/`; cross-drive target. Assert 200 for the first three, 403 for the rest | unit | The case-differing rows fail on the current `startsWith` guard and pass on `path.relative`. This test alone would have caught the bug before release |
| T7 | **Add a Windows job to the CI matrix.** Today the matrix is `node:24-bookworm` only (per `ci-note.md`); add `windows-latest` and run the route smoke test there | CI | The defect is a Windows-only path-semantics defect; a Linux-only matrix structurally cannot see it |
| T8 | **Host-integration smoke through the real route.** Boot a real DSH profile and `GET /dsh-attach-input/resources/mermaid-chunk.js`; assert `200` **and** `content-type` is a JavaScript MIME type. Run it on a Windows runner whose checkout drive letter differs in case from what `realpathSync` returns | e2e | Exercises the real `LIB_DIR`/`realpathSync` boundary instead of a mocked guard |
| T9 | **Diagnosability assertion.** Assert that every 403 from the guard logs both `LIB_DIR` and the resolved realpath | unit | The original 403 said "path escapes the plugin lib" for a path plainly inside it, which cost the maintainer a wrong conclusion ("Windows paths are unreliable"). Logging both sides turns the next occurrence into a one-line attribution |

### 5.3 Incident 3 — double zoom under the modal

| ID | Test | Layer | Why it catches it |
|---|---|---|---|
| T10 | **DOM unit test (jsdom/happy-dom).** Mount pane + modal, attach both handlers exactly as in the code, dispatch a cancelable, bubbling `wheel` with `ctrlKey: true` on the diagram. Assert: the pane's font-size spy was **not** called; `event.defaultPrevented === true`; and the result is **identical when the pane handler is registered first** | unit | Directly asserts "one gesture, one owner" and order-independence |
| T11 | **Listener-options test.** Wrap `addEventListener` and assert the modal's wheel listener is registered with `{ passive: false }` | unit | jsdom does not implement Chromium's passive-by-default rule for `wheel` on `window`/`document`/`body`, so a passive regression is otherwise untestable and silently re-breaks `preventDefault` |
| T12 | **Zoom-modal e2e (Playwright).** Open the modal, Ctrl+wheel over the diagram; assert the diagram's transform/scale changed, the pane's computed `font-size` is unchanged, and `visualViewport.scale === 1` (native page zoom suppressed). Then close the modal and Ctrl+scroll in the pane; assert the pane shortcut **still** works | e2e | Catches both the double-zoom and the over-correction of disabling the pane shortcut |
| T13 | **Lifecycle test.** Open and close the modal, then Ctrl+scroll in the pane; assert only the pane handler fires (no stale modal claim, no double registration) | unit/e2e | Catches listener leaks that reappear as "zoom works once, then breaks" |

### 5.4 The structural gap

- **CI must include Windows.** Two of the three incidents (2, and any future path-semantics defect)
  are invisible to a Linux-only matrix. `ci-note.md` is the evidence: the route passed on Linux CI
  and failed on production Windows with identical code.
- **Assert on rendered outcomes and network logs, not on HTTP 200s of the entry file.** Incident 1's
  entry returned 200; incident 2's route "worked" on three of four hosts. Both would have passed a
  naive "chunk URL returns 200" smoke test.
- **Prefer the real code path in tests.** T6 must call the actual predicate (not a reimplementation),
  T8 must go through the real route and the real `import.meta.url`/`realpathSync` boundary — the
  whole bug class lives in that boundary.

---

## Appendix A — reproduced probes (Node v24.18.1, win32, read-only)

### A.1 `fileURLToPath` is case-preserving and syntactic

```
import.meta.url     = file:///E:/dsh/profiles/web/node_modules/@org/dsh-attach-input/lib/index.js
fileURLToPath(...)  = E:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\index.js
fileURLToPath(lc)   = c:\dsh\lib\index.js          # file:///c:/... -> c:\...
```

### A.2 `realpathSync` case behaviour on this host

```
plain, uppercase drive   -> E:\...\fixture\chunk-route.ts    (drive case preserved)
plain, lowercase drive   -> e:\...\fixture\chunk-route.ts    (drive case preserved)
forward slashes          -> E:\...\fixture\chunk-route.ts
with .. segments         -> E:\...\fixture\chunk-route.ts
trailing sep (dir)       -> E:\...\fixture
mis-cased tail component -> E:\...\fixture\CHUNK-ROUTE.TS     # NOT canonicalized from disk
mis-cased dir component  -> E:\...\fixture\FIXTURE\chunk-route.ts
junction realpath        -> E:\...\fixture\chunk-route.ts     # junction resolved, case preserved
```

On this build `realpathSync` echoes the input case; the lowercase drive letter in
`fixture/ci-note.md` is therefore not universal. The conclusion stands regardless: the output case
of the realpath boundary is **not a contract**, so it must not be relied upon.

### A.3 Which guard catches what (route's exact expressions, `LIB = E:\...\lib`)

```
rel                          abs (normalized)                                        guard#1 startsWith(LIB+sep)
mermaid-chunk.js             E:\...\lib\mermaid-chunk.js                            true
..\..\..\windows\evil.js     E:\...\windows\evil.js                                 false   <- traversal stopped HERE
..\other\evil.js             E:\...\@org\dsh-attach-input\other\evil.js             false
libsibling.js                E:\...\lib\libsibling.js                               true    (contained; sibling-prefix trap avoided by +sep)
.\sub\x.js                   E:\...\lib\sub\x.js                                    true

startsWith(LIB+sep) with realpath "e:\...\lib\mermaid-chunk.js"  -> false   # <-- the 403
startsWith(LIB+sep) with normalize(join(LIB,'mermaid-chunk.js')) -> true    # guard #1 never misfires
'e:\dsh\lib' === 'E:\dsh\lib'                                    -> false
```

### A.4 `path.relative` semantics (the proposed fix)

```
path.win32.relative('E:\A\B', 'e:\a\b\c')       = "c"                 # case-insensitive components
path.win32.relative('E:\lib', 'E:\lib')         = ""                  # root itself -> not a file
path.win32.relative('E:\lib', 'E:\lib\x.js')    = "x.js"
path.win32.relative('E:\lib', 'C:\evil\x.js')   = "C:\evil\x.js"     # cross-drive -> absolute => reject
path.win32.relative('E:\lib', 'E:\libsibling.js')= "..\libsibling.js" # sibling-prefix trap => reject
path.win32.relative('E:\lib', 'E:\lib\..\..\x') = "..\x"              # traversal => reject
path.posix.relative('/a/lib', '/A/lib/x.js')    = "../../A/lib/x.js"  # POSIX: case-SENSITIVE (correct there)
path.resolve(LIB, p).startsWith(LIB + sep)      = false for the case-differing pair  # resolve is lexical
```

Fixed predicate vs. current guard on the full case table:

| Input | `insideLib` (`path.relative`) | current `startsWith` guard |
|---|---|---|
| same case | accept | accept |
| realpath lowercased drive | **accept** | **reject <- the bug** |
| realpath lowercased tail | accept | accept |
| sibling prefix `libsibling.js` | reject | reject |
| parent dir | reject | reject |
| `..` traversal (post-`normalize`) | reject | reject |
| cross drive | reject | reject |
| exactly the root | reject | reject |

---

## Appendix B — limitations and honest gaps

- **Incident 3 has no source in the evidence pack.** Only the two console captures, the route source
  and the CI note are provided; there is no zoom-modal or pane-handler source. Section 4 is therefore
  derived from DOM event semantics (`wheel` bubbling/cancelability, Chromium's passive-by-default
  rule, capture-vs-bubble ordering) rather than from the plugin's code, and it assumes the standard
  shapes: a wheel handler in the modal plus a pane/global wheel handler for font-size zoom. The
  ownership rule and the regression tests hold for any of those shapes; the *specific* phase of the
  pane's listener (bubble vs. capture on `window`/`document`) is the one detail that must be checked
  against the real source before implementing section 4.4.
- **The lowercase drive letter from `realpathSync` was not reproducible on this host** (A.2); it is
  taken from the `fixture/ci-note.md` dump as ground truth for the production host.
- No fixture file was read beyond the four listed, and nothing was written, installed, or executed
  from the fixture. All probes above are pure computations plus `realpathSync` reads of the fixture
  directory.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.