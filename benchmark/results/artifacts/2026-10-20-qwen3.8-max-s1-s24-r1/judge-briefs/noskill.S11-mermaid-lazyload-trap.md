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

# S11 · Mermaid Lazy-Load Trap — Diagnosis Report

Plugin: `@org/dsh-attach-input` v0.4.0 (lib-only bundle), mermaid rendering added to markdown
reading mode as a lazily-imported chunk served by a new host prefix route.

Evidence examined (read-only): `fixture/chunk-route.ts` (attempt-2 route source),
`fixture/console-split-chunks.txt` (attempt-1 console), `fixture/console-403-windows.txt`
(attempt-2 production console), `fixture/ci-note.md` (test matrix + production debug print),
`fixture/README.md`.

---

## 1. Incident 1 — Split chunks: why sibling imports kill the whole dynamic import

### What the evidence shows

- Attempt 1 let the bundler use its default code-splitting: the mermaid entry emitted
  `mermaid-chunk.js` **plus 97 sibling chunks** (`src-BfvxrPJe.js`, `pie-WAS4IAKB-CQHCQWWM.js`, …).
- The route served the entry fine: `GET …/mermaid-chunk.js → 200` — but the file is only **8.1 kB**,
  the size fingerprint of a *facade*: almost no library code, only `import` statements pointing at
  siblings. (Contrast attempt 2's self-contained 7.2 MB chunk.)
- Every sibling fetch returned **404**, and the resulting `TypeError: Failed to fetch dynamically
  imported module` names the **entry** URL, not the siblings — even though the entry itself was 200.
- The maintainer's own `ls`: `mermaid-chunk.js` **was shipped**; the sibling files named in its
  import statements **were not shipped with the package**. The route's 404s were therefore correct
  behavior (its `catch → 404 'not found'` branch) — the files genuinely did not exist under `lib/`.

### The mechanism (bundler + ESM semantics, not route behavior)

1. **ESM dynamic import is all-or-nothing over the static graph.** `import(url)` does not finish at
   "fetch the entry". The browser fetches the entry, parses it, then **instantiates** the module
   record: every static `import` in the entry is recursively fetched and linked **before any code is
   evaluated**. If any dependency fetch fails (404, wrong MIME, network error), instantiation fails
   and the whole `import()` promise **rejects** — surfaced as `TypeError: Failed to fetch dynamically
   imported module: <entry URL>`. That is exactly why the console indicts `mermaid-chunk.js`
   (200!) while the actually-missing bytes are the siblings: the entry can never evaluate because
   its dependency links dangle.
2. **Two layers of siblings.** The 404 list contains both shared-vendor chunks (`src-…`, statically
   imported by the facade — these break instantiation immediately) and per-diagram chunks
   (`pie-…` — mermaid internally lazy-loads each diagram type through its own `import()`, which
   the bundler preserved as additional split chunks). Even if instantiation had somehow succeeded,
   every per-diagram lazy import would 404 at render time. One mermaid fence therefore produced a
   cascade, and the plugin's catch fell back to a plain code block.
3. **Why the siblings were missing: hashed filenames vs. packaging.** Default code-splitting names
   chunks with content hashes (`pie-WAS4IAKB-CQHCQWWM.js`) that **change on every build**. Any
   packaging step that whitelists files by name (npm `files` entries, a copy script that grabs
   `mermaid-chunk.js`) can only ever capture the predictable entry name; the 97 hashed siblings are
   silently dropped from the published tarball. This is structural, not a one-off mistake: the split
   output set is unbounded and unstable, so name-based shipping of a chunk graph always rots.

### Build-side fix

Make the lazy chunk **truly self-contained — one file, zero sibling specifiers** — which is what
attempt 2 correctly did (its later 403 was a separate route bug, not a bundling regression):

- Rollup / Vite lib mode: build the mermaid chunk in a dedicated sub-build with a single entry and
  `output.inlineDynamicImports: true` (Vite: `build.rollupOptions.output.inlineDynamicImports`).
  This also collapses mermaid's *internal* per-diagram `import()` calls into the one file.
- esbuild: `bundle: true`, `splitting: false`, single `outfile`, `format: 'esm'`.
- If multi-chunk splitting is ever kept deliberately, packaging must ship the **entire emitted
  output directory** (e.g. `files: ["lib"]`, never enumerated hashed names), and the route prefix
  must serve all of it, because siblings' relative specifiers (`./pie-….js`) resolve against the
  entry's URL `/dsh-attach-input/resources/…`. For a lib-only plugin served through a host route,
  the single inlined chunk is the robust default.

---

## 2. Incident 2 — 403 on Windows: the exact flaw in the containment guard

### The guard, traced with production values

`chunk-route.ts` computes the base once, at module load:

```ts
const LIB_DIR = normalize(fileURLToPath(new URL('.', import.meta.url)))   // spelling A
```

Per request it runs two checks. The first compares a path **derived from LIB_DIR itself**
(`abs = normalize(join(LIB_DIR, rel))`), so it can only fire on genuine `..\` traversal and always
passes casing-wise. The second is the flawed one:

```ts
file = normalize(realpathSync(abs))                       // spelling B
if (!file.startsWith(LIB_DIR + sep)) → 403 'path escapes the plugin lib'
```

The CI note's production debug print shows the two spellings side by side:

```
LIB_DIR  = "E:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib"                    (uppercase E:)
realpath = "e:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\mermaid-chunk.js"  (lowercase e:)
```

`String.prototype.startsWith` is **case-sensitive**, so
`"e:\dsh\…".startsWith("E:\dsh\…\")` is `false` → the guard returns **403 for a file
that is plainly inside the lib directory** — exactly what `console-403-windows.txt` reports ("the
guard branch fired … for a path that is plainly inside the lib directory"). The browser turns the
403 into `Failed to fetch dynamically imported module`, and the plugin falls back to a code block.
The failure is deterministic — it is a string comparison, not a flake.

### Naming the mechanism precisely — what each API returns on each platform

The flaw is a **case-sensitive lexical prefix comparison between strings produced by two
independent path sources whose spellings are not guaranteed to agree on a case-insensitive
filesystem**. Nothing canonicalizes case before the comparison: `path.normalize` is purely lexical
(collapses `..\`/`.`/duplicate separators; never touches case, never touches the filesystem).

| API | Linux (ext4, case-sensitive) | Windows (NTFS, case-insensitive, case-preserving) |
|---|---|---|
| `fileURLToPath(new URL('.', import.meta.url))` | The exact byte spelling the loader used; a case-sensitive FS has exactly one valid spelling and it matches disk. | Whatever spelling the host process used when it imported the module — here uppercase `E:\`, inherited from how the DSH launcher/profile tooling spelled the path. WHATWG URL processing lowercases a file URL's *host*, not the drive letter in its path, and `fileURLToPath` merely decodes — so the load-time casing flows through uncanonicalized. |
| `fs.realpathSync(abs)` | Resolves symlinks against real directory entries; case is preserved exactly, so for a plain in-tree file the output is **byte-identical** to the input → comparison trivially passes. | Returns the OS-canonical final path (symlinks, junctions, 8.3 short names resolved; the `.native` variant asks the OS via `GetFinalPathNameByHandleW`). The **drive-letter case in the result reflects the OS/DOS-device spelling of that volume, not the input string** — on the production Windows Server 2022 host (DSH on `E:\`, plausibly a mapped/subst-style volume whose device name was defined lowercase by provisioning tooling) it returned lowercase `e:\`. Node does not normalize drive-letter case, and neither does `normalize()`. |
| `startsWith(LIB_DIR + sep)` | Case-sensitive — matches Linux FS semantics, so the guard is *accidentally correct* there. | Case-sensitive — **contradicts** NTFS semantics, under which `E:\x` and `e:\x` denote the same directory. Two legitimate spellings of the same path compare unequal → false "escape" → 403. |

So the platform difference is not "Windows paths are unreliable" (the maintainer's folklore
takeaway). It is: **on Linux a directory has one spelling, so same-content comparisons always
agree; on Windows the same directory has multiple equally valid spellings, and different APIs
(module-URL derivation vs. OS realpath canonicalization) may return different ones** — drive-letter
case being the cheapest to diverge; the same class covers 8.3 short names and symlink/junction
targets.

### Why the matrix looked the way it did

- **Linux CI green**: single canonical spelling; `realpathSync` output byte-identical to the
  `LIB_DIR`-derived input.
- **Maintainer laptop (Windows 11, C:) green**: *coincidence* — both sources happened to spell the
  drive letter the same way on that machine (the note's "lowercase c:\ in some tooling" shows the
  divergence risk existed there too; the two sources just agreed). Green-by-luck, not
  green-by-design.
- **Production (Windows Server 2022, E:) broken**: the loader-side spelling (`E:\`) and the
  OS-canonical spelling (`e:\`) diverged, and the case-sensitive prefix test turned a
  same-directory pair into an "escape" → 403 on every chunk GET.

---

## 3. Fix direction for the guard (+ the other serving requirement)

### The comparison to use

Canonicalize **both sides through the same pipeline** and compare with **platform-appropriate case
semantics**:

1. Resolve the base once at startup with the same API used per request:
   `const LIB_REAL = realpathSync(LIB_DIR)` (same variant — native or JS — as for the request
   path). Base and candidate then come from one canonicalization source: drive-letter case,
   symlinks, junctions, and 8.3 names are equalized on both sides before any comparison.
2. Replace the hand-rolled `startsWith(base + sep)` with a **relative-path containment test**:
   `const rel = path.relative(LIB_REAL, fileReal)`; allow iff
   `rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)`.
3. Fold case where the filesystem does: when `process.platform === 'win32'`, compare
   case-insensitively (lowercase both operands before `relative`/`startsWith`). On POSIX keep the
   comparison case-sensitive — there case is meaning, so folding would be wrong.

Why this is robust on both platforms: it no longer depends on two independent APIs *agreeing by
luck*. Both operands pass through identical canonicalization (realpath on both sides), the
containment decision follows the platform's own case rules (insensitive on win32, where `E:\x`
and `e:\x` are the same directory; sensitive on Linux, where they are genuinely different
directories), and `path.relative` containment also removes the `lib` vs `lib-evil`
sibling-prefix hazard that `+ sep` was hand-patching. Security is not weakened: the realpath step
still catches symlink/junction escapes, and `..\` traversal still yields a `rel` starting with
`..\` → 403. Factoring the guard into a pure function
`(libReal, candidate, platform) → allow | deny` is what makes it unit-testable on any OS (§5).

### The other serving requirement for a dynamic import to work at all

**The response must carry a JavaScript MIME type.** Module scripts are subject to *strict MIME
checking*: even a `200` response is refused by the browser — and `import()` rejects with the same
"Failed to fetch dynamically imported module" class of error — unless `Content-Type` is a JS type
(`text/javascript` or `application/javascript`). A route serving bytes as
`application/octet-stream` or `text/plain` makes every dynamic import fail despite 200s. The
attempt-2 route already sets `content-type: application/javascript; charset=utf-8` (line 23 of the
excerpt) — that is correct and must survive the guard rewrite; fixing the 403 alone is not enough
if a future edit drops the header. (Secondary, from Incident 1: if the chunk graph is ever split
again, all siblings must be served under the **same URL prefix** so relative specifiers resolve, and
the module must be same-origin or CORS-enabled — here page and route share
`http://127.0.0.1:3080`, so same-origin holds.)

---

## 4. Incident 3 — Why BOTH handlers fire on one Ctrl+scroll, and the ownership rule

### Mechanism (DOM event propagation)

A `wheel` event does not go "to the modal" — it travels the **full propagation path**: capture
phase (window → document → … → ancestors, top-down), target phase, bubble phase (bottom-up). Every
listener registered on any node of that path is invoked, in that order.

- The pane's markdown reading mode binds **Ctrl+wheel → font-size zoom** at host level (the pane
  container, and/or window/document — the usual home of "global-ish" zoom bindings).
- The new zoom modal binds **Ctrl+wheel → diagram scale** on the modal element.
- The modal is rendered **inside the pane's DOM subtree** (a web-plugin slot lives in the pane).
  "Fullscreen" is a visual property: CSS stacking/overlay does **not** remove a node from the event
  propagation path. And even a modal portaled to `document.body` would not help against a pane
  binding on window/document — that node is still on the path.

So one Ctrl+scroll over the modal fires the modal's handler (target/bubble phase → diagram scales)
**and the event keeps propagating** to the pane's ancestor/window handler (→ font size scales).
Neither suppresses the other, because:

- The modal handler doesn't call `stopPropagation()`, and any `preventDefault()` it does call is a
  no-op if its listener is **passive** — Chrome treats `wheel` listeners on window/document/body as
  passive by default, so suppressing anything there requires `{ passive: false }`.
- **Ordering caveat that decides the fix shape:** if the pane's binding is registered in the
  **capture phase on window**, it runs *before* any handler the modal can attach to its own subtree
  — modal-side `stopPropagation()` can never retroactively suppress it. Hence the fix cannot be
  "the modal stops propagation" alone; the **pane side must yield**.

### The ownership rule that fixes it

**One gesture, one owner: while an active top-most layer (the modal) is open, it owns all input over
its surface, and ancestor/host layers must suspend or scope-filter their conflicting bindings.**
Concretely, both halves:

1. **Host/pane yields (the necessary half):** the pane's Ctrl+wheel handler ignores events belonging
   to an active overlay — early-return when the modal layer is open (`if (zoomModalOpen) return`)
   or when the event targets one (`if (overlayRoot.contains(e.target)) return`) — or simply
   unregister/disable the binding for the modal's lifetime. This works regardless of the
   registration phase (capture or bubble).
2. **Owner consumes (the complementary half):** the modal handles the gesture with a **non-passive**
   listener (`addEventListener('wheel', h, { passive: false })`), calling `e.preventDefault()`
   (which also kills the browser's native Ctrl+scroll page zoom) and `e.stopPropagation()` (covers
   bubble-phase ancestor listeners such as pane-container bindings). Portaling the modal to a
   top-level container outside the pane subtree further shrinks the shared propagation path — but
   alone it does not excuse step 1 for window-level bindings.

Result: Ctrl+scroll inside the modal changes exactly one thing (diagram scale); Ctrl+scroll outside
it keeps exactly one behavior (pane font zoom).

---

## 5. Regression tests that would have caught incidents 1–3 before release

### For Incident 1 (build/packaging integrity)

- **T1.1 Self-containment assertion (build CI):** after building, scan the emitted
  `mermaid-chunk.js` (AST, or regex over relative `import … from` and dynamic `import()`
  specifiers) and assert **zero relative sibling specifiers**, and that the mermaid entry emitted
  exactly one chunk file. Fails attempt 1 at build time (98 files, 97 siblings).
- **T1.2 "Ship what you import" closure test (package CI):** `npm pack` → extract tarball → for
  every `.js` file inside, resolve each relative import specifier against the tarball tree and
  assert the target exists. Catches *any* future drop between build output and published `files`,
  independent of hash-name churn — the exact attempt-1 failure.
- **T1.3 End-to-end render smoke (integration):** install the packed tarball into a throwaway DSH
  host, drive headless Chromium to a markdown doc with a mermaid fence, assert an `<svg>` is
  produced (not the fallback code block) and the network log shows **no 404s** under
  `/dsh-attach-input/resources/`.

### For Incident 2 (path guard, platform semantics)

- **T2.1 Guard unit tests as a pure function** (`assertInside(libReal, candidate, platform)`, with
  injectable `path.win32`/`path.posix` so they run on any OS):
  - `E:\app\lib` vs `e:\app\lib\mermaid-chunk.js` (drive-letter case divergence — the
    exact production print from `ci-note.md`) → **allow**. This single case is the regression pin.
  - `E:\app\lib` vs `E:\app\lib-evil\x.js` → **deny** (sibling-prefix hazard).
  - `E:\app\lib` vs `E:\app\lib\..\..\secret.js`, and URL-encoded `..%2F`
    traversal at the HTTP layer → **deny**.
  - POSIX: `/srv/lib` vs `/srv/LIB/x.js` → **deny** (case must stay meaningful on Linux — proves
    the fix didn't just "lowercase everything").
- **T2.2 HTTP integration on a Windows CI runner:** the maintainer's matrix had **no automated
  Windows job** — laptop-green was coincidence. Add Windows to the CI matrix: serve the route with
  the plugin installed under a path whose loader-side spelling and OS-canonical spelling differ in
  drive-letter case, `GET /dsh-attach-input/resources/mermaid-chunk.js`, assert **200** and
  `content-type: application/javascript` (the header half of §3).
- **T2.3 Escape-detection negatives (so the case fix can't weaken security):** a junction/symlink
  inside `lib` pointing outside → **403**; non-`.js` extension → **404**; `POST` → **405**.
  Positive/negative pairing pins the guard's semantics from both sides.

### For Incident 3 (gesture ownership)

- **T3.1 Playwright, modal open:** dispatch a real `wheel` with `ctrlKey` over the diagram;
  assert (a) diagram scale changed, (b) the pane's computed `font-size` is **unchanged**, (c)
  `defaultPrevented === true` and `visualViewport.scale` unchanged (no native page zoom). Catches
  the double-fire directly.
- **T3.2 Playwright, modal closed:** Ctrl+wheel over the pane → font-size **does** change (guards
  the opposite regression: over-suppression leaving pane zoom dead).
- **T3.3 Listener-contract unit tests:** with the modal open, dispatch wheel on a node inside the
  modal root and spy the pane handler → assert it early-returns (ownership check); include a
  variant with the pane binding registered on `window` in the **capture** phase (the ordering case
  modal-side `stopPropagation` cannot fix); assert the modal's wheel listener is registered
  `{ passive: false }`.

### Matrix lesson (covers all three)

Every incident passed *somewhere*: attempt 1's chunk loaded (200!) before its graph failed; attempt
2 was green on Linux CI and the laptop; the modal looked fine until a user Ctrl+scrolled. The
regression suite must pin the **divergent-case fixtures** (T2.1), the **published-artifact closure**
(T1.2), and the **composed-UI gesture** (T3.1) — properties that no single "works on my machine"
environment exercises.

---

## Summary

Incident 1 is bundler/packaging semantics: default code-splitting turned the lazy chunk into a
98-file graph of hash-named siblings that the package never shipped; ESM instantiation is
all-or-nothing, so one 404 sibling rejected the entire `import()` while the entry itself was 200 —
fix by inlining everything into one self-contained chunk (`inlineDynamicImports`), or ship the
whole emitted set. Incident 2 is a case-sensitive `startsWith` containment guard comparing two
independently sourced spellings of the same Windows directory — module-URL-derived `LIB_DIR`
(`E:\`) vs. OS-canonical `realpathSync` output (`e:\`) — which can only diverge on a
case-insensitive filesystem, hence Linux-green / laptop-luck / production-403; fix by
realpath-canonicalizing both sides and comparing with platform case semantics (`path.relative`
containment, case-folded on win32), while preserving the JS `Content-Type` that module loading
strictly requires. Incident 3 is event propagation: a visually-fullscreen modal stays in the DOM
propagation path, so one Ctrl+wheel invokes both the modal's and the pane's handlers; fix with the
ownership rule — the active top-most layer owns the gesture, the pane suspends or scope-filters its
binding while the modal is open, and the modal consumes the event with a non-passive
`preventDefault()` + `stopPropagation()` listener.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.