# S11 · Mermaid Lazy-Load Trap — Diagnosis Report

Task: read-only analysis of three rollout incidents in `@org/dsh-attach-input` v0.4.0's
lazily-imported mermaid chunk. Evidence: fixture at
E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\tasks\S11-mermaid-lazyload-trap\environment\fixture
(chunk-route.ts, console-split-chunks.txt, console-403-windows.txt, ci-note.md).

---

## 1. Incident 1 — why default code-splitting broke the dynamic import

**What the bundler actually does.** "Dynamic import of mermaid" does not produce one file. The
bundler builds the whole module graph reachable from the dynamic entry and emits a *chunk
graph*: a small entry chunk (`mermaid-chunk.js`, 8.1 kB — the console shows it returned 200)
plus dozens of sibling chunks for the shared/internal modules mermaid pulls in
(`src-BfvxrPJe.js`, `pie-WAS4IAKB-CQHCQWWM.js`, …, the note says 97 siblings). The entry
chunk contains plain `import "./src-BfvxrPJe.js"` statements.

**What breaks with sibling imports.** In the browser, a module's bare relative imports are
resolved by the *module's own URL* — here `/dsh-attach-input/resources/mermaid-chunk.js` — so
each sibling is fetched from the same prefix. Per the fixture's `ls` note, the shipped package
contained `mermaid-chunk.js` but **not the sibling files**: the packaging step shipped only the
named entry artifact, not the bundler's full output directory. Every sibling request therefore
404s, the entry module fails to instantiate, and the browser surfaces it as `TypeError: Failed
to fetch dynamically imported module` on the *entry* URL (the error names the import that
failed to load, which is why the 200-on-entry in the console is misleading). The plugin's
fallback then renders a plain code block.

Root cause in one sentence: the package shipped a chunk graph's entry but not its siblings, and
a split chunk is not self-contained — its relative sibling imports are load-time dependencies.

**Build-side fix.** For a lazily-imported chunk served from a fixed host route, make the chunk
self-contained: disable code splitting for that dynamic entry so everything is inlined into one
file —

- Rollup/Vite: `output.inlineDynamicImports: true` (or `manualChunks` returning a single
  group for the mermaid entry; with Vite, `build.rollupOptions.output.inlineDynamicImports`
  when the mermaid import is the only dynamic entry, or a separate build for it);
- esbuild: `splitting: false` for the chunk build.

That is exactly what attempt 2 did (one 7.2 MB file) and it is the right call for a
route-served, lib-only bundle. The alternative — keep splitting and ship the *entire* emitted
asset directory with hashed names mapped 1:1 onto the route prefix — also works but couples the
package to the bundler's hash-named output; inlining is the robust choice here. Either way, the
packaging step must ship everything the emitted chunk references.

## 2. Incident 2 — the exact guard flaw behind the Windows 403

The route has two prefix checks:

```
abs  = normalize(join(LIB_DIR, rel));            if (!abs.startsWith(LIB_DIR + sep)) → 403
file = normalize(realpathSync(abs));             if (!file.startsWith(LIB_DIR + sep)) → 403
```

The second check is the one that fires (the route log in the console capture confirms the
"path escapes the plugin lib" branch). The mechanism, per the debugging printout in ci-note.md:

- `LIB_DIR` is derived from `fileURLToPath(new URL('.', import.meta.url))` — i.e. from the
  literal URL/case the loader recorded. On the production host that is **`E:\...`** (uppercase
  drive letter), because DSH is installed at `E:\dsh` and the URL preserved that case.
- `fs.realpathSync()` on Windows does not echo the input string: it returns the
  **operating-system-canonical form** of the path, and Windows canonicalizes the drive letter to
  the case the object-manager/registry name has — here **lowercase `e:`**, giving
  `e:\dsh\...\mermaid-chunk.js`.
- `String.prototype.startsWith` is a **case-sensitive, ordinal** comparison. `"e:\..."` does
  not start with `"E:\...\ "`, so a path that is plainly inside the lib directory fails the
  guard → 403 on every chunk GET.

Why the matrix split the way it did:

- **Linux CI:** `realpathSync` on Linux returns the same strings (Linux has no drive letters
  and the container's paths were created with matching case), so the ordinal prefix check
  happens to succeed. It passes *by coincidence of string equality*, not because the guard is
  correct.
- **Laptop, Windows 11, DSH on C:\ with "lowercase c:\ in some tooling":** there the literal
  in `LIB_DIR` and realpath's canonical form agreed on case (both effectively lowercase, or the
  URL-derived case matched the canonical one), so the comparison succeeded — again by
  coincidence.
- **Production, E:\ uppercase:** the two spellings diverge on exactly one character — the drive
  letter — and the guard rejects.

So the precise statement is: *the guard compares Windows filesystem paths with an ordinal,
case-sensitive string operation, while `realpathSync` on Windows canonicalizes the drive-letter
(and potentially component) case, so `realpath(p)` can differ in case from a string that
denotes the same file.* It is not "Windows paths are unreliable"; it is a case-sensitivity
mismatch between two path spellings of the same file, on a case-insensitive filesystem.

## 3. Fix direction for the guard + the other serving requirement

**Robust containment check.** Do not compare absolute path strings with `startsWith`. Compare
*relationally* with `path.relative`, which handles separators, trailing slashes, and — because
it answers "is B under A" structurally — pairs naturally with a one-time case fold on Windows:

```
const relInside = relative(LIB_DIR, file)            // file = normalize(realpathSync(abs))
const contained =
  relInside !== '' && !relInside.startsWith('..') && !isAbsolute(relInside) &&
  (process.platform !== 'win32' || relative(lower(LIB_DIR), lower(file)) same test)
```

Concretely: on win32, case-fold *both* sides once (`toLocaleLowerCase`/'lowercase the drive
letter and components') before the `relative` test; on POSIX, compare without folding (the
filesystem there is case-sensitive, so folding would *weaken* security). `path.relative`-based
containment (result must be non-empty, must not start with `..`, must not be absolute) is the
standard escape test and is immune to separator/trailing-slash mismatches as well. Apply the
same treatment to the *first* check (the `abs` one) for consistency, since `join` of a decoded
`rel` containing `..\` segments is what that check exists to catch; note `normalize` collapses
`a/../b` lexically, which is exactly why the realpath re-check exists (symlink escapes), and why
the realpath result must be re-tested with the case-aware comparison, not the raw
`startsWith`.

**The other serving requirement for dynamic import.** The route must reply with a correct
JavaScript MIME type — `application/javascript` (with charset) — and HTTP 200. A module script
(`import()` loads it as a module) is *refused* by the browser if served as e.g.
`text/plain` or `application/octet-stream`; the fetch succeeds and the import still throws.
The current code does set this header; it must keep doing so, and the 404/405/403 early-outs
must not degrade it. (Secondarily, if the chunk ever does have relative imports again, the
served URL must be the base the chunk's own imports resolve against — i.e. every file the chunk
references must be reachable under the same `RESOURCE_PREFIX`, which is incident 1's lesson.)

## 4. Incident 3 — both Ctrl+scroll handlers firing under the zoom modal

**Why both fire.** The pane registers a Ctrl+wheel listener (font-size zoom) on an *ancestor*
of the diagram/modal DOM; the modal registers its own wheel listener on the modal/diagram
element, a *descendant*. DOM events bubble: one Ctrl+wheel over the open modal is dispatched at
the diagram target and propagates up through the ancestors, so *both* listeners receive the
same event object — they are on different nodes of one propagation path, so neither
`stopPropagation()` nor a `preventDefault()` coordination exists between them. Registration
order is irrelevant here (they are not on the same node); it is pure bubbling plus two
uncoordinated owners on one path.

**The ownership rule.** One gesture has exactly one owner: the innermost interested handler
consumes the event and stops it from reaching less-specific handlers — the modal's wheel
handler must call `e.stopPropagation()` (and `preventDefault()` to block the browser's own
page-zoom) when it acts, so the pane's font-size handler never sees wheel events originating
inside the modal. Symmetrically/defensively, the pane's listener can also ignore events whose
`target` is inside the fullscreen modal (containment check) — the ancestor must defer to the
descendant that owns the surface. Never rely on both handlers "sharing" a ctrl+wheel; the rule
is innermost-owner-wins with explicit propagation stop.

## 5. Regression tests that would have caught each incident

**Incident 1 — chunk self-containment / packaging:**
- A packaging assertion run on the shipped artifact: parse the emitted chunk file(s) for
  `import "./..."` / `import(...)` specifiers and assert every referenced file exists in the
  shipped lib directory (this fails immediately when 97 siblings are missing). With the
  inlining fix, assert the build output for the dynamic entry is exactly one `.js` file (or
  that the emitted file contains no unresolved relative import specifiers).
- An e2e/page test: load a reading-mode view containing one ```mermaid fence and assert the
  rendered SVG appears and zero 4xx requests hit the resource prefix (a `page.on('requestfailed'/'response')`
  collector in Playwright catches the 404 on `pie-WAS4IAKB-CQHCQWVM.js`).

**Incident 2 — route containment guard:**
- Unit-test the route handler with a stubbed/mocked `realpathSync` that returns a path whose
  drive-letter case differs from `LIB_DIR`'s (e.g. LIB_DIR `E:\...lib`, realpath
  `e:\...lib\mermaid-chunk.js` — exactly the production printout). Assert the response is
  **200 with `application/javascript`**, not 403. On Windows CI, run it against a real
  temp lib dir created under a differently-cased drive spelling.
- Escape-suite (must stay 403/404): `/../escape.js`, `..%5C..` encoded traversals, absolute
  `rel` like `E:\other\x.js` (absolute join target), a symlink inside lib pointing outside
  (the realpath re-check), and non-`.js` → 404. Assert a genuine in-lib file on a
  case-mismatched drive still passes *while* these still fail — that pins the fix to
  case-folding rather than deleting the guard.
- Cross-platform note: run the same suite on Linux CI with a case-mismatched `realpathSync`
  stub so the coincidence ("passes because strings match") can't mask the bug there either.

**Incident 3 — wheel ownership:**
- jsdom/RTL test: mount the pane (with its ctrl+wheel font-size spy) containing the open zoom
  modal (with its zoom spy); dispatch one WheelEvent(`ctrlKey: true`) at the diagram element
  with `bubbles: true`. Assert zoom-spy called once AND font-size-spy **not called** (after
  the fix via `stopPropagation`; before it, both fire — the failing baseline).
- Complement: dispatch ctrl+wheel on pane chrome *outside* the modal and assert the font-size
  handler still fires (the stop must not over-reach), plus a test that `preventDefault` was
  called inside the modal so the browser page-zoom is also suppressed.

---

## Summary of root causes

| Incident | Root cause | Fix |
|---|---|---|
| 1 | Split chunk's relative sibling imports resolved against the chunk URL, but siblings were never shipped — entry loads (200), instantiation 404s | Inline the dynamic entry into one self-contained chunk (`inlineDynamicImports` / `splitting: false`) or ship the full emitted asset dir |
| 2 | Case-sensitive `startsWith` containment check vs Windows `realpathSync` canonicalizing the drive letter to `e:` while `LIB_DIR` (from `import.meta.url`) says `E:` | `path.relative`-based containment with one-time case fold of both sides on win32 only |
| 3 | Two uncoordinated wheel listeners on one propagation path (modal descendant + pane ancestor); bubbling delivers the event to both | Innermost-owner rule: modal handler `stopPropagation()` (+ `preventDefault()`); ancestor ignores events targeted inside the modal |

No files outside the designated output directory were modified; the fixture was read only.
