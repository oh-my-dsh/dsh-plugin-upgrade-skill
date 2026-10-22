# S11 · Mermaid Lazy-Load Trap — Diagnosis Report

Scope: read-only diagnosis of the evidence pack in `fixture/` (unchanged), plus empirical
verification of the Windows path APIs on this container's `node v24.14.1`. No fixture file was
modified; nothing was executed from the fixture.

---

## 1. Incident 1 — Why the split-chunk approach failed

### What the evidence shows

`console-split-chunks.txt` is the decisive artefact, and its shape is diagnostic:

```
GET .../dsh-attach-input/resources/mermaid-chunk.js        200  (8.1 kB)
GET .../dsh-attach-input/resources/src-BfvxrPJe.js         404
GET .../dsh-attach-input/resources/pie-WAS4IAKB-CQHCQWWM.js 404
TypeError: Failed to fetch dynamically imported module: .../mermaid-chunk.js
```

Three things to read off it:

1. **The entry chunk loaded fine (200).** The plugin's own `import('./mermaid-chunk.js')`
   resolved and the module was parsed.
2. **The failure is one level *inside* that chunk.** Chromium reports a rejected *nested*
   dynamic import by naming the **parent** module URL in the error text (`Failed to fetch
   dynamically imported module: .../mermaid-chunk.js`) — not the child that actually 404'd.
   The child URLs are visible only as the separate 404 lines. So the error text pointing at
   `mermaid-chunk.js` is a red herring: `mermaid-chunk.js` is the *victim*, `src-BfvxrPJe.js`
   and `pie-WAS4IAKB-CQHCQWWM.js` are the *cause*.
3. **The 404s are not the route's fault in shape** — the URLs are correct sibling URLs
   (same directory, same prefix). They are 404 because *those files were never published*:
   the fixture's `ls` note is explicit — "`mermaid-chunk.js` WAS present; the sibling files
   listed in its import statements were NOT shipped with the package."

### The bundler semantics that break

A dynamically imported ES module is **not a self-contained unit**. Two independent layers emit
runtime fetches when you let the bundler code-split a lazy entry:

- **Your own bundler's entry graph.** With default code-splitting, "the mermaid chunk" is not
  one output — it is a *set*: an entry chunk plus shared/common chunks it pulls in
  (`src-BfvxrPJe.js` is a shared chunk emitted because the markdown-mode entry and another
  entry point share modules). The entry's emitted code contains
  `import("./src-BfvxrPJe.js")`-style calls whose targets only exist after the build.
- **Mermaid's own lazy diagram registry.** Mermaid (v10+) does not ship one file; its diagram
  registry dynamically `import()`s each diagram type on demand
  (chart/pie/gitGraph/journey/architecture/…). Those arrive as content-hashed siblings
  (`pie-WAS4IAKB-CQHCQWWM.js`, 97 of them). Nothing in the build control knows their names in
  advance — they are generated.

Two consequences follow, and both bite here:

- **Relative-sibling resolution is baked into the emitted code.** The bundler emits *relative*
  specifiers (`./pie-WAS4IAKB-CQHCQWWM.js`) inside the parent chunk, so the browser resolves
  them **against the parent chunk's own URL**. That is why the requests arrived at
  `/dsh-attach-input/resources/…` at all — the chunk's fetch URL, not the document's base URI,
  is the resolution root. A `publicPath`/`base` computed for the document instead of for the
  chunk's URL is a second, subtler failure of the same family.
- **A lazy graph is data-dependent.** Mermaid only fetches a diagram-type chunk when a fence of
  that type actually renders. A smoke test with one diagram type exercises one branch of the
  graph; the other 96 siblings remain unverified until a user renders that diagram. This is why
  "it loaded the mermaid chunk" is not evidence the feature works.

So the failure is: **an entry that is a single *file* but a *graph*, shipped as a file.** The
package contents step treated a hashed, build-generated, unknown-name set as if it were one
artifact. The route and the CDN-like prefix are fine; they are just an accurate 404 server for
files that do not exist.

### Build-side fix

Pick exactly one of these two, and make it an enforced invariant rather than a hope:

1. **Eliminate the graph** (what attempt 2 did, 7.2 MB single file): force one output per entry
   so there are zero runtime fetches —
   Rollup `output.inlineDynamicImports: true` (Vite `build.rollupOptions.output.inlineDynamicImports`),
   webpack `optimization.splitChunks: false` + `optimization.runtimeChunk: false`,
   esbuild/Vite `build.rollupOptions…`/`splitting: false`. With this, the *shipped* chunk is
   genuinely the whole graph and the class of bug disappears. Cost: one big file, no
   per-diagram-type caching.
2. **Or ship the whole graph and prove it**: package by glob (`"files": ["lib"]`, or a copy step
   of `lib/**/*.js`), never by enumerating names. Then enforce closure with a post-build check
   that every static and dynamic specifier in every emitted JS file resolves to a file that
   exists inside the package tarball (see §5).

Whatever you choose, **the chunk must be fetched from the same directory it was emitted into**,
because the sibling specifiers are relative to the parent chunk's URL. Serving the entry under a
prefix route while the siblings would land elsewhere is a guaranteed 404 of exactly this kind.

---

## 2. Incident 2 — The exact flaw in the containment guard

### The mechanism, API by API

The guard (`chunk-route.ts:15-21`) compares **two strings that were produced by two different
kinds of function**:

| Expression | Produced by | Kind | Filesystem consulted? |
|---|---|---|---|
| `abs` = `normalize(join(LIB_DIR, rel))` | `path.join` → `path.normalize` | **pure lexical string transform** | **No** |
| `file` = `normalize(realpathSync(abs))` | `fs.realpathSync` | **OS-canonicalizing syscall wrapper** | **Yes** |
| the test `file.startsWith(LIB_DIR + sep)` | `String.prototype.startsWith` | **byte-exact, case-sensitive** | **No** |

Verified in-container (Node v24, Windows) —

- `url.fileURLToPath('file:///e:/dsh/x.js')` → `"e:\\dsh\\x.js"`;
  `url.fileURLToPath('file:///E:/dsh/x.js')` → `"E:\\dsh\\x.js"`.
  It is a **lexical** transform: it changes `/` to `\` and nothing else. Whatever drive-letter
  case `import.meta.url` carries is preserved verbatim.
- `path.normalize('E:/dsh/x/lib')` → `"E:\\dsh\\x\\lib"`;
  `path.normalize('e:/dsh/x/lib')` → `"e:\\dsh\\x\\lib"`. Also purely lexical; case is never
  touched.
- `fs.realpathSync(path)` on Windows goes through libuv to `GetFinalPathNameByHandleW`, which
  returns the path **as the OS spells it** — the volume name as that volume is registered on
  that machine, and each component's on-disk spelling. It does **not** echo the spelling you
  asked with. (Corollary verified below: `realpathSync` is also the only one of the three that
  resolves junctions/symlinks, so it can return a genuinely different root prefix.)
- `'e:\\dsh\\lib\\a.js'.startsWith('E:\\dsh\\lib')` → **`false`**. `startsWith` is
  byte-exact/case-sensitive.

Putting those four facts together reproduces the incident precisely, with **no** "Windows is
different" folklore:

```
LIB_DIR  = fileURLToPath(new URL('.', import.meta.url))  → lexical  → "E:\dsh\…\lib"   (uppercase: Node's ESM resolver spelled the URL that way)
abs      = normalize(join(LIB_DIR, 'mermaid-chunk.js'))  → lexical  → "E:\dsh\…\lib\mermaid-chunk.js"
file     = normalize(realpathSync(abs))                  → OS says   → "e:\dsh\…\lib\mermaid-chunk.js"   (lowercase: the E: volume on this box is registered with a lowercase name)
file.startsWith(LIB_DIR + sep)  →  "e:\dsh\…".startsWith("E:\dsh\…\")  →  false  →  403 "path escapes the plugin lib"
```

**The guard's flaw is that it compares an OS-canonical spelling against a lexical spelling with
a case-sensitive prefix test.** The drive letter is the visible trigger; the general form is
"lexical vs. canonical orthography mismatch".

### Why Linux passes, why the maintainer's other Windows box passes

- **Linux CI is green because the comparison is *sound* there, not because it is lucky.** Linux
  paths are byte strings and the filesystem is case- and byte-sensitive; for an existing,
  symlink-free path `realpathSync` returns the **identical** bytes as the lexical spelling. So
  `file.startsWith(LIB_DIR + sep)` is a *correct* containment test on Linux. This is precisely
  why the bug is invisible in a Linux-only CI: the check's assumption (lexical spelling ==
  canonical spelling) happens to hold.
- **The Windows 11 laptop on `C:\` is green because of per-volume metadata.** Windows
  drive-letter case is not derived from your code — it is the name the volume carries in the
  mount manager for that machine. A `C:` volume registered as `C:` and a drive whose tooling
  spells it `c:` will both canonicalize to the registered spelling. The laptop's `C:` is
  registered uppercase, so OS-canonical == lexical and the guard passes. The production box's
  `E:` volume is registered as `e:` (exactly the debug print in `ci-note.md`), so
  OS-canonical != lexical and the guard rejects **every** chunk request. Two machines, two
  drive letters, two outcomes, one bug — this is why "Windows paths are unreliable" is the
  wrong takeaway. Nothing is unreliable; the code compares two string encodings of the same path
  and demands they match byte-for-byte.
- The same mismatch reproduces for **component case** (a directory whose on-disk name differs
  from the installed spelling, an 8.3 short name, or a junction/subst/symlinked plugin root where
  `realpathSync(abs)` returns a completely different root prefix than the lexical `LIB_DIR`) —
  all of which Linux CI cannot express, because on Linux a differently-spelled path is a
  *different file* and is correctly rejected.

### Not the flaw (for completeness)

The first, pre-`realpath` check on line 16 does block traversal: `path.normalize` resolves
`..` (including `%2e%2e%2f` decoded to `../`, and Windows `..\` sequences) before the prefix
test, and the WHATWG `URL` parser already collapses literal `../` segments out of
`url.pathname`. So symlink-free `..` escapes are caught. Only the **casing/orthography**
comparison is broken. (The 404 on line 14 also means a `.m?js` extension is required — a route
serving a `.css` or `.map` sidecar would 404, which is fine, but note that it means the chunk
name must keep its extension.)

---

## 3. Fix direction

### 3a. Containment: canonicalize both sides, compare with path semantics

```ts
import { realpathSync } from 'node:fs'
import path from 'node:path'

// 1. Canonicalize the ROOT through the same normalization you apply to the target.
const ROOT = realpathSync(path.normalize(fileURLToPath(new URL('.', import.meta.url))))

const promised = async (rel: string) => { /* … */ }

const isInsideRoot = (p: string) => {
  // 2. path.relative() — not startsWith()
  const rel = path.relative(ROOT, p)
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel)
}
```

Why this is robust on both platforms:

- **Same function on both sides.** The root and the target are both passed through
  `realpathSync`, so both are in OS-canonical orthography — same volume spelling, same component
  spelling, same junction/symlink resolution. The production 403 disappears because
  `"e:\dsh\…\lib\mermaid-chunk.js".startsWith("e:\dsh\…\lib\")` is now comparing two
  canonical strings that *do* agree. (If you canonicalize the root, symlinked/junctioned plugin
  roots also stop 403-ing, which the current code cannot survive even with correct casing.)
- **`path.relative` instead of `startsWith`.** Verified in-container: `path.win32.relative('E:\\dsh\\lib', 'e:\\dsh\\lib\\a.js')`
  → `'a.js'`, and it also returns `'a.js'` when inner component case differs — Windows path
  comparison is **case-insensitive by definition**, and `path.win32` (which is what `path` is on
  Windows) encodes that rule. This is not a local hack: it is the platform's own comparison
  semantics, applied uniformly, instead of a hand-rolled byte prefix test that silently assumes
  Linux's case sensitivity.
- The escape checks remain correct in both directions: `path.relative` returns a `..`-rooted
  path (verified: `E:\dsh\lib` vs `E:\dsh\lib2\a.js` → `'..\\lib2\\a.js'`) or an absolute path
  when the target is on a different drive, both explicitly rejected. On Linux `path.relative`
  is case-*sensitive* — which is the correct, secure rule there — so this fix does not weaken
  Linux containment the way a blanket `toLowerCase()` would.

Do **not** "fix" it with `file.toLowerCase().startsWith(LIB_DIR.toLowerCase())`: that
additionally compares a canonical string against a *lexically normalized, still non-canonical*
string, and it weakens containment on Linux. Do **not** `realpathSync` only the target while
leaving `LIB_DIR` lexical — that is the current bug. If you prefer not to depend on
`path.win32.relative`'s case-insensitivity, gate it explicitly:
`process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b`, applied to
**two canonical strings**.

### 3b. Other serving requirement: a dynamic `import()` is a module fetch, not a script fetch

The 400-class bugs above are about *whether the file is reachable*. There is a second,
orthogonal requirement: **what the response looks like**. ES module `import()` is fetched by the
browser with `mode: 'cors'` and an extra **strict MIME check**, unlike `<script src>`. So the
route must additionally:

- **Answer with a JavaScript MIME type** — `application/javascript` or `text/javascript`
  (`chunk-route.ts:23` already does this correctly; keep it, and keep `charset=utf-8`, since a
  plain `text/plain` or a missing type makes the module load fail *even with a 200*).
- **Be reachable in CORS terms** — same-origin, or send `Access-Control-Allow-Origin` (with
  `Vary: Origin`). Same-origin is what makes the current setup work today (browser and route are
  both `127.0.0.1:3080`), but the moment the UI and the plugin resource route are served from
  different origins/hosts — a normal production split — every `import()` fails with a CORS
  error while the network tab still shows 200. The route sets no CORS headers at all.
- **Not be behind a redirect** — a redirect on a module fetch is a network error, not a followed
  fetch, in the same way a CORS failure is.

Also non-negotiable and unrelated to 403s but fatal the same way: the route must return the
**unmodified JS bytes** (no HTML wrapper, no transform), which line 22 does correctly.

---

## 4. Incident 3 — Why both handlers fire on one Ctrl+scroll

### The mechanism

The zoom modal's handler and the preview pane's font-size handler are **two independent,
uncoordinated listeners on the same wheel event**, and nothing on the propagation path
coordinates them. Three concrete ways that happens, all consistent with the symptom:

1. **The modal is in the pane's subtree (or the pane listens above the modal).** Fullscreen zoom
   modals are routinely appended into the pane container so they inherit the pane's stacking
   context and clip/scrolling behaviour. A `wheel` over the modal bubbles: modal root → pane
   container → document. If the modal's handler only calls `event.preventDefault()`, that is
   **not** the same as `stopPropagation()` — `preventDefault()` cancels the *browser's* default
   action, it does nothing at all to *listener* dispatch. The event keeps bubbling, the pane's
   `ctrlKey`-gated handler runs, and the font size changes. This is the most common cause and
   matches the symptom exactly (both effects applied, browser's native pinch-zoom suppressed —
   which is why nobody noticed the page itself zooming).
2. **The pane listens on `document`/`window` in the capture phase.** A capture-phase listener on
   an ancestor runs *before* any bubble-phase listener on the modal's own element, so the pane
   acts first and the modal's `stopPropagation()` arrives too late — there is nothing left to
   stop. Even in the bubble phase, a document-level listener is an ancestor of every target, so
   it fires regardless of where the modal lives in the DOM.
3. **Registration order decides when both listeners share a target.** For listeners on the *same*
   node, only `stopImmediatePropagation()` pre-empts the rest; `preventDefault()` and
   `stopPropagation()` do not. With Hooks-style re-renders and effect re-registration, that
   order is an implementation detail, not a guarantee.

Underlying it: `ctrl+wheel` (and the trackpad pinch, which surfaces as `wheel` with
`ctrlKey: true`) is a **global gesture**, and two features — pane font zoom and modal diagram
zoom — each claimed it without any notion of ownership.

### The ownership rule that fixes it

> **Gesture ownership is exclusive and centralized: the topmost active overlay owns the gesture,
> and the base pane never acts while an overlay is present.**

Concretely, all three of these together (they are complementary, not alternatives):

1. **A single gesture-owner registry.** One host-level stack/singleton
   (`gestureOwner.push(modal)` on open, `pop()` on close — it must be a *stack*, not a boolean,
   so nested overlays behave). The pane's handler opens with
   `if (gestureOwner.isActive()) return` — the base view declines the gesture whenever an
   overlay owns it. This is what makes the behaviour independent of DOM position, propagation
   phase, and listener registration order.
2. **Pre-empt from the top.** The overlay registers its wheel handling on `window` with
   `capture: true`, and on `ctrlKey` calls both `preventDefault()` (to suppress the browser's own
   pinch-zoom; requires `{ passive: false }`) and `stopPropagation()` (to keep the event from
   reaching any later ancestor/bubble listener).
3. **Every gesture handler defers to a prior claimant.** Any `wheel`/key handler in the pane must
   bail on `event.defaultPrevented` before acting. That makes correctness order-independent: even
   if some path still lets the event reach both, only the first claimant wins.

The resulting invariant is easy to state and to test: **for a given gesture and a given moment,
exactly one consumer acts, and it is always the topmost one.**

---

## 5. Regression tests that would have caught incidents 1–3

### Incident 1 — chunk-graph completeness

1. **Post-build specifier-closure test (the highest-value one).** After the build, walk every
   `.js`/`.mjs` under `lib/`, extract every static `from "…"` and dynamic `import("…")`/`import("…")`
   specifier, resolve relative ones against the file's own directory, and assert each target
   exists on disk. This fails the current attempt-1 build immediately.
2. **Packaged-contents parity test.** `npm pack --dry-run --json` and assert the tarball's JS
   file count equals the count in `lib/` (or that `lib/**/*.js` is matched). Catches the
   "one artifact named explicitly, ninety-six omitted" packaging bug, which no amount of CI
   routing tests can see.
3. **Single-chunk invariant test** (if you take fix option 1): assert statically that the shipped
   entry contains **zero** relative `import(`/`from "./` specifiers — i.e. the entry is closed
   under itself. A future config change that silently re-enables code splitting fails the build.
4. **Per-diagram-type browser smoke test.** Playwright/Puppeteer page that renders **one fence of
   every diagram type mermaid supports** and asserts: no `response`/`requestfailed` under
   `/dsh-attach-input/resources/` has status ≥ 400, and each rendered diagram produces an
   `svg` element rather than remaining a `pre` fallback. This is the test that closes the
   "data-dependent lazy graph" hole — one-diagram smoke tests pass while 96 of 97 branches are
   broken.
5. **Fallback-path test.** Mock the dynamic import to reject and assert the renderer logs a
   *distinguishable* error and renders the code-block fallback (positive: the feature is
   detectable when broken, rather than silently degrading).

### Incident 2 — guard correctness, on the right platforms

6. **Unit test of the containment helper, parameterized over spellings.** Cases that must be
   allowed: root `E:\dsh\lib` vs target `e:\dsh\lib\mermaid-chunk.js` (mixed drive case);
   mixed inner component case; the target expressed via a symlink/junction inside lib. Cases that
   must be rejected: `..\..\etc\passwd`, `..%2f..%2fetc%2fpasswd`, `..\..\x`, a symlink inside lib
   pointing outside it, a path on a different drive. Assert case-**insensitive** containment on
   `win32` and case-**sensitive** on `posix`.
7. **Real-HTTP integration test through the actual route handler.** Boot the route over
   `node:http` and `GET`: (a) the real chunk → 200 + `content-type: application/javascript`;
   (b) a request whose on-disk spelling differs in case from the lexical one → 200 (this is the
   test that **fails on the shipped code**); (c) nonexistent file → 404; (d) non-`.mjs`/`.js`
   suffix → 404; (e) traversal attempts → 403/404; (f) `POST` → 405.
8. **Windows CI with a non-`C:` install and a mixed-case directory.** The decisive structural
   test: create the plugin tree under a temp root, take the root's `realpathSync` to learn the
   OS canonical spelling, then request the chunk using a *differently-cased* lexical spelling.
   Run it on `windows-latest` **with the install on a drive other than `C:`** (Linux CI cannot
   express per-volume drive-letter case at all, which is exactly why the current matrix is green
   and production is not). Also assert the invariant directly:
   `containment(realpathSync(ROOT), realpathSync(target))` holds for every target inside lib.
9. **A "platform matrix" gate.** Because the bug class is *invisible* to the current CI, add a
   check that the containment test suite actually ran on a Windows agent — a green Linux-only run
   must not be reportable as "route checks green".

### Incident 3 — single-owner gesture

10. **DOM unit test (jsdom/happy-dom) that counts actions.** Mount pane + zoom modal, dispatch a
    synthetic `WheelEvent` with `ctrlKey: true, deltaY: -100, bubbles: true, cancelable: true` on
    the modal, and assert with spies: the diagram-zoom handler ran **exactly once**, the pane
    font-size handler's *effect* did not apply, and `preventDefault()` was called once.
11. **Ordering- and phase-independence test.** Register the pane listener both before and after
    the modal's, and in both capture and bubble phase, and assert the outcome is identical in all
    four combinations. This is the test that defeats failure mode 2/3 above, and it is what makes
    the ownership rule verifiable rather than aspirational.
12. **Overlay-state test.** Modal open → Ctrl+scroll affects only the diagram. Modal closed →
    Ctrl+scroll still resizes the pane font (guards against the fix over-suppressing the base
    feature). Also: plain (non-Ctrl) wheel inside the open modal scrolls/does not zoom.
13. **Real-gesture E2E (Playwright).** Open the zoom modal, `page.keyboard.down('Control')` then
    `page.mouse.wheel(0, -120)` over the modal, and assert the pane's computed `font-size` is
    unchanged, the modal's transform/scale changed once, and `document.documentElement`'s zoom is
    unchanged (browser pinch-zoom suppressed). Synthetic events skip the real gesture pipeline,
    so this catches what the unit tests cannot.

---

## Summary

| Incident | Root cause | Fix |
|---|---|---|
| 1 | "The mermaid chunk" is a **graph**, not a file: the entry plus ~97 sibling chunks the bundler emits with relative, content-hashed names (yours and mermaid's lazy diagram registry). Only the entry was packaged → nested `import()` 404s, reported under the parent's URL. | Ship the whole graph by glob **and** enforce specifier-closure post-build; or force `inlineDynamicImports`/`splitChunks: false` for this entry. Keep chunks co-located, since sibling resolution is relative to the chunk's own URL. |
| 2 | The guard compares **two different string encodings of one path**: `realpathSync` returns the **OS-canonical spelling** (per-volume drive-letter case, on-disk component case), while `join`/`normalize`/`fileURLToPath` are **pure lexical** transforms that preserve the input spelling. `String.startsWith` is byte-exact → `"e:\dsh\…\lib\x.js".startsWith("E:\dsh\…\lib\")` is `false` → 403. Linux passes because realpath == lexical bytes there (and is correctly case-sensitive); the laptop passes because its `C:` volume is registered uppercase while production's `E:` is `e:`. | Canonicalize **both** sides with `realpathSync` and compare with `path.relative`/`path.win32` (case-insensitive on Windows, case-sensitive on POSIX) — never `toLowerCase()` over a lexical string. Also serve the module fetch correctly: JavaScript MIME (already OK), CORS headers or same origin, no redirects. |
| 3 | Two uncoordinated listeners on one `ctrl+wheel` gesture: the modal's zoom handler calls `preventDefault()` (which does **not** stop propagation) and the pane's handler — in the modal's subtree, on `document`, or in the capture phase — still fires and resizes the font. | Exclusive, centralized gesture ownership: an owner stack the base pane defers to, overlay handling pre-empting from `window` capture with `preventDefault()` + `stopPropagation()`, and every handler bailing on `event.defaultPrevented`. Exactly one consumer acts, always the topmost. |
