# S11 · Mermaid Lazy-Load Trap — Root-Cause Report

Evidence reviewed: `fixture/chunk-route.ts` (attempt-2 route), `fixture/console-split-chunks.txt`,
`fixture/console-403-windows.txt`, `fixture/ci-note.md`. Claims about API semantics below were
cross-checked against Node's documented behavior and probed with read-only `node -e` runs on this
host (`path.win32.normalize`, `path.win32.join`, `path.win32.relative`, `fs.realpathSync`).

---

## 1. Incident 1 — why the split-chunk build failed

**Mechanism.** A dynamically imported ES module is fetched as a *module graph*, not as one file.
When the browser executes `import('./mermaid-chunk.js')`, the relative specifier is resolved
against the URL of the module that contains the `import()` call, the entry chunk is fetched
(200, only 8.1 kB — already a hint that it is just a re-export shell), and then every *static*
sibling import inside that chunk (`import './pie-WAS4IAKB-CQHCQWWM.js'`, `./src-BfvxrPJe.js`, …)
is resolved **against the entry chunk's own URL**, i.e. under
`/dsh-attach-input/resources/`. Those sibling files were never shipped in the package
(`ls` of the shipped `lib/` shows the entry chunk present, siblings absent — they were hashed
build artifacts that the publish step didn't include), so every sibling GET 404s. One failed
fetch anywhere in the static graph rejects the *whole* dynamic `import()` promise — and the
rejection error names the **entry** chunk (`Failed to fetch dynamically imported module:
…/mermaid-chunk.js`), not the missing sibling. That is why it looked like the chunk itself
failed even though the chunk's own GET returned 200.

So two things broke, one semantic and one operational:
- a lazily imported chunk with sibling imports only works if **all** emitted sibling files are
  served at URLs co-located with the importing chunk (import-meta-url-relative resolution);
- the package only shipped the entry chunk, so sibling resolution had nothing to hit.

**Build-side fix.** Make the lazy chunk *self-contained*: bundle the dynamic import into a single
file with no relative imports — Rollup/`vite build`: `output.inlineDynamicImports: true`
(or a `manualChunks` grouping that pulls every mermaid-internal module into the one chunk),
or mark mermaid's deps so the bundler cannot split them out. (The alternative — shipping all 97
hashed siblings and serving them at chunk-relative URLs — is fragile: hashed filenames change per
build and every file must survive `npm pack`. Single-file inlining is the deterministic fix, and
it is what attempt 2 did.)

---

## 2. Incident 2 — the exact containment-guard flaw (Windows 403, Linux green)

The failing check is the **second** guard in `chunk-route.ts`:

```ts
file = normalize(realpathSync(abs))
if (!file.startsWith(LIB_DIR + sep)) { 403 }
```

The two compared strings are produced by **different APIs with different case provenance**:

- `LIB_DIR = normalize(fileURLToPath(new URL('.', import.meta.url)))` — `fileURLToPath` just
  decodes the URL string the loader holds; the drive letter keeps whatever case the
  URL/install path was written with. On the production host that is **uppercase**:
  `LIB_DIR = "E:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib"` (per the
  debug print in `ci-note.md`; note it has **no trailing separator** at runtime, so the first
  `startsWith(LIB_DIR + sep)` guard does pass for a normal in-tree request).
- `realpathSync(abs)` — on Windows this resolves through the OS (libuv /
  `GetFinalPathNameByHandle` machinery) and returns the *canonical* path. Node does **not**
  guarantee that the returned drive letter has the same case as the input; on the production
  host it came back **lowercase**:
  `realpath = "e:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\mermaid-chunk.js"`.
  (Drive-letter case from realpath is unspecified/implementation- and host-dependent — I probed
  it on this machine and it echoed the query case here, which only proves you cannot rely on it
  in either direction. Well-known Node issue class: "fs.realpath returns lowercase drive letter
  on Windows".)

`String.prototype.startsWith` is a **byte-exact, case-sensitive** comparison.
`"e:\dsh\…".startsWith("E:\dsh\…\\")` is `false`, so the guard concludes
"path escapes the plugin lib" and returns 403 for a file that is plainly inside the lib dir —
exactly what the route log shows.

Linux CI passes because none of this exists there: one separator, case-sensitive filesystem, and
`realpath` returns a byte-identical prefix of the input for an ordinary in-tree path, so the
case-sensitive prefix check is accidentally correct. The maintainer's Windows 11 laptop passed
because on that machine the two case sources happened to agree (the note even says "lowercase
c:\ in some tooling" — i.e. the case already matched on both sides). The takeaway "Windows paths
are unreliable" is wrong; the guard's comparison is wrong.

(Latent fragility worth fixing while in there: the guard is also sensitive to trailing
separators — `normalize` does **not** strip a trailing `sep` (verified:
`normalize('E:\\a\\lib\\') === 'E:\\a\\lib\\'`), so `startsWith(LIB_DIR + sep)`
only works because the deployed `LIB_DIR` has no trailing separator; and a raw string prefix
would also accept `E:\dsh\…\lib-evil\x.js` if `LIB_DIR` ever lost its boundary handling.
Canonical-vs-canonical comparison removes all of these at once.)

---

## 3. Fix direction for the guard, plus one more serving requirement

**Guard fix — compare canonical paths with `path.relative`, not string prefixes:**

```ts
// canonicalize the root ONCE, with the same API used for candidates
const LIB_DIR_REAL = realpathSync(fileURLToPath(new URL('.', import.meta.url)))
…
const abs = resolve(LIB_DIR_REAL, rel)               // lexical check first
const relLex = relative(LIB_DIR_REAL, abs)
if (relLex === '' || relLex.startsWith('..' + sep) || relLex === '..' || isAbsolute(relLex)) 403
const file = realpathSync(abs)                       // then the symlink/junction check
const relReal = relative(LIB_DIR_REAL, file)
if (relReal.startsWith('..' + sep) || relReal === '..' || isAbsolute(relReal)) 403
```

Why this is robust on both platforms:
- **Both sides are canonicalized by the same `realpathSync`**, so drive-letter case, 8.3 short
  names, and junction/symlink resolution come out identical on both sides — there is nothing left
  to mismatch.
- `path.win32.relative` is **case-insensitive** and separator-aware (verified:
  `win32.relative('E:\\a\\lib', 'e:\\a\\lib\\m.js') === 'm.js'`), and it returns a
  path starting with `..` (or an absolute path on a different drive) exactly when the candidate
  escapes the root (verified: escape → `'..\\evil.js'`). On POSIX the same code is
  byte-exact, matching the case-sensitive filesystem. One code path, correct semantics per
  platform — no `startsWith`, no manual `sep` concatenation, no case folding by hand.

**Other serving requirement:** the response must carry a **JavaScript MIME type**
(`Content-Type: application/javascript` / `text/javascript`). Module fetches — including
`import()` — are subject to strict MIME checking: a chunk served as `text/html`,
`text/plain`, or `application/octet-stream` is refused ("Failed to load module script …
MIME type") and the dynamic import rejects even with HTTP 200. The route sets
`application/javascript; charset=utf-8` — correct, and it must be covered by a test so it
never regresses.

---

## 4. Incident 3 — why Ctrl+scroll fires BOTH handlers under the modal

Wheel events **bubble**. The fullscreen zoom modal is an overlay, but in the DOM it is still a
descendant of the app root (typically appended to `document.body`), so a Ctrl+wheel dispatched
to an element inside the modal propagates `modal → … → body → document → window`. The pane's
"Ctrl+scroll = adjust font size" handler is registered at an ancestor level (document/window, or
on a container that contains the modal) and does not check where the event originated. The
modal's own "Ctrl+scroll = zoom diagram" handler fires at the target phase; the pane's handler
then fires again on the bubbled event. One physical gesture, two consumers — hence diagram zoom
**and** pane font resize simultaneously. (Browser default zoom/scroll is a third potential
consumer if nothing calls `preventDefault`.)

**Ownership rule: the topmost/innermost interactive layer owns the gesture.** The modal, being
the topmost layer, must consume the event completely: `event.preventDefault()` (kills browser
zoom/scroll chaining) **and** `event.stopPropagation()` (kills delivery to pane-level
listeners). Symmetrically, ambient/global handlers must never act on events that originate
inside a surface they don't own — i.e. the pane handler should ignore events whose
`event.target`/`composedPath()` is inside an open modal (or be suspended while a modal owns
the session). Either side alone fixes the double-fire; doing both makes the ownership invariant
explicit: *one gesture, exactly one owner*.

---

## 5. Regression tests that would have caught 1–3 before release

**Incident 1 — build-output and network invariants**
- *Build assertion:* after the library build, scan the emitted lazy chunk and fail if it contains
  any relative `import`/`import()`/`from './…'` specifier (or simply assert the lazy entry
  is a single self-contained file). This fails on the 98-file split build immediately.
- *Pack assertion:* run `npm pack --dry-run` (or packlist) and assert every file referenced by
  the bundle's import specifiers is present in the tarball — catches "entry shipped, siblings not".
- *E2E smoke:* serve the packed `lib/` through the real host route in a headless browser,
  render one ```mermaid fence, and assert (a) zero 404s in the network log and (b) no
  "fell back to code block" console line.

**Incident 2 — guard unit tests + a Windows matrix leg**
- Parameterized unit tests of the handler over both `path.win32` and `path.posix` semantics
  (inject `realpathSync`/`fileURLToPath` fakes):
  - **the exact production scenario**: `LIB_DIR` uppercase `E:\…\lib`, fake realpath
    returning lowercase `e:\…\lib\mermaid-chunk.js` → must be **200**, not 403
    (this single test reproduces the incident);
  - traversal cases that must stay **403/404**: `..%2f..%2f`, encoded separators, absolute
    paths, sibling-prefix paths (`lib-evil\`), and a symlink whose realpath escapes the root
    (the realpath guard must still catch it — canonical-vs-canonical keeps this working);
  - `LIB_DIR` with/without trailing separator → identical verdicts.
- CI leg on Windows with the app installed on an uppercase drive letter, hitting the route for a
  real chunk GET and asserting 200 + correct body.

**Incident 3 — event-ownership tests**
- DOM test: mount the reading pane with its Ctrl+wheel font handler, open the zoom modal,
  dispatch `new WheelEvent('wheel', { ctrlKey: true, bubbles: true })` inside the modal;
  assert the diagram-zoom spy ran, the pane font spy did **not**, `preventDefault` and
  `stopPropagation` were called, and the pane's font size is unchanged.
- Symmetric test: same event on the pane with **no** modal open → pane handler fires (guards
  against over-blocking).
- E2E (Playwright): real Ctrl+scroll over the open modal; assert computed `font-size` of the
  pane unchanged and the diagram transform changed.

---

## Bottom line

1. A lazy chunk is a module **graph**: unshipped sibling files → graph fetch fails → the
   `import()` rejection misleadingly names the entry chunk. Fix at build time:
   `inlineDynamicImports` / single self-contained chunk.
2. The 403 is a **case-sensitive `startsWith` comparing two case sources**:
   `fileURLToPath` preserves the URL's drive-letter case (`E:`), `realpathSync` returns the
   OS-canonicalized case (observed `e:` on production). Linux never exercises the flaw.
3. Compare **canonical vs canonical** (`realpath` the root once) using `path.relative`
   (case-insensitive on win32, exact on POSIX; escape ⇔ result starts with `..` or is
   absolute), and keep serving `application/javascript` — module import enforces MIME.
4. Wheel events bubble: the modal must own the gesture (`preventDefault` + `stopPropagation`);
   ambient handlers must ignore events from surfaces they don't own.
5. Cover all three with: bundle/pack assertions + no-404 render smoke test; case-mismatched
   guard unit tests on both path flavors + a Windows CI leg; and event-ownership tests proving
   one gesture has exactly one consumer.
