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
#### FILE: report.md

# S11 · Mermaid Lazy-Load Trap — Root-Cause Report (Read-Only)

**Target plugin**: @org/dsh-attach-input v0.4.0 (lib-only bundle) · markdown reading mode · lazily-imported mermaid chunk served by a host prefix route.
**Method**: read-only inspection of the evidence pack in `/app/fixture/` (unchanged, byte-for-byte) plus the `plugin-upgrade` skill references (touchpoint classes #4 host filesystem and #6 custom HTTP/DOM channels, `references/pre-flight.md`); no installs, no migrations, no fixture writes. Card citations below are ID + key point only.

---

## 1. Incident 1 — split chunks: why every sibling import 404'd

### What broke

The bundler's default code-splitting emitted the mermaid entry as `mermaid-chunk.js` (8.1 kB) **plus 97 sibling chunks** (`src-BfvxrPJe.js`, `pie-WAS4IAKB-CQHCQWWM.js`, …). The console capture shows the entry chunk itself served **200**, then the siblings **404**, then the whole feature failed.

The mechanism has three parts:

1. **A dynamic import loads a module *graph*, not one file.** `import('./mermaid-chunk.js')` fetches the entry, then transitively fetches and evaluates every static `import` / `export … from` the entry contains. Loading is all-or-nothing: **one missing sibling rejects the entire dynamic import**, even though the entry's bytes were fine.
2. **Relative specifiers are resolved against the chunk's URL, not the page's.** Inside `.../resources/mermaid-chunk.js`, `import './pie-WAS4IAKB-CQHCQWWM.js'` resolves to `.../resources/pie-WAS4IAKB-CQHCQWWM.js`. The route could therefore only ever serve what existed on disk under `lib/` — and the shipped package contained only the entry chunk ("ls of the shipped lib/: mermaid-chunk.js WAS present; the sibling files … were NOT shipped"). Sibling names are content-hashed, so they cannot be hand-supplied or deduced at runtime.
3. **The error message is misleading by design.** The browser reports *"Failed to fetch dynamically imported module: …/mermaid-chunk.js"* — the **specifier of the failing `import()` expression**, not the URL that actually 404'd. That is why the capture names the entry while the 404s are the siblings.

So this is not a routing bug and not a caching bug: the published artifact was incomplete relative to the emitted chunk graph. Route code was never reached for the siblings because they were not in `lib/` at all.

### Build-side fix

Make the shipped artifact equal the chunk graph, in one of two ways:

- **Preferred (what attempt 2 did): bundle a single self-contained chunk** — one entry, full bundle, code-splitting off. E.g. esbuild: `--bundle --format=esm` with a single entry and `splitting: false` (splitting is only enabled by `--splitting` + outdir); Rollup: `output.inlineDynamicImports: true` / no `manualChunks`; Vite: `build.rollupOptions.output.inlineDynamicImports`. Mermaid's per-diagram dynamic imports become statically inlined code, so the chunk has **zero relative import specifiers**.
- **Alternative: keep splitting and ship + serve the whole output dir** — include *all* emitted chunks in the package `files` list (and in the route's served dir; the route already permits any `*.m?js` under `lib/`), and keep every chunk co-located so URL-relative resolution works.

**Guard assertion for either choice**: after build, scan every shipped chunk for relative `import`/`export … from`/dynamic `import()` specifiers and assert each resolves to a shipped file; with the single-file fix, assert the entry has none.

---

## 2. Incident 2 — the 403 on Windows: the exact flaw in the containment guard

The guard (from `fixture/chunk-route.ts`) runs **twice** — once lexically on `abs`, once on the realpath:

~~~ts
const LIB_DIR = normalize(fileURLToPath(new URL('.', import.meta.url)))   // …/lib/
const abs = normalize(join(LIB_DIR, rel))
if (!abs.startsWith(LIB_DIR + sep)) { …403 'path escapes the plugin lib' }
file = normalize(realpathSync(abs))
if (!file.startsWith(LIB_DIR + sep)) { …403 'path escapes the plugin lib' }   // ← this one fired
~~~

### What each API returns, per platform

| Value | API | Windows Server 2022 (E:\, production) | Linux CI |
|---|---|---|---|
| `LIB_DIR` | `fileURLToPath(new URL('.', import.meta.url))` + `path.normalize` | **`E:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib`** — uppercase drive, spelling preserved exactly as the ESM loader recorded the module URL (case-preserving conversion; `path.normalize` never changes case) | `/…/lib` as spelled on disk |
| `abs` | `join(LIB_DIR, rel)` + `normalize` | same spelling as `LIB_DIR` (`E:…`) | same spelling |
| `file` | `fs.realpathSync(abs)` | **`e:\dsh\…\lib\mermaid-chunk.js`** — **lowercase drive letter** (evidence: the debugging session printed exactly this pair) | identical string to the lexical path |

The mechanism, precisely:

1. `fs.realpathSync` on Windows canonicalizes the path through the file handle — Win32 `GetFinalPathNameByHandleW` via libuv's `uv_fs_realpath` — and re-emits the DOS device name with **its own casing convention**: the drive letter comes back lowercased (`e:`), and because NTFS is **case-preserving**, other segments can come back in the on-disk spelling too. It is a *different normalization pipeline* than `fileURLToPath` + `normalize`.
2. `String.prototype.startsWith` is an **ordinal, case-sensitive** comparison. `"e:\dsh\…\mermaid-chunk.js".startsWith("E:\dsh\…\lib" + "\")` is **false**, even though on Windows **path identity is case-insensitive** (drive letters are case-insensitive; `E:\x` and `e:\x` are the same file).
3. Result: the **second guard branch** — the realpath containment check — returns 403 *"path escapes the plugin lib"* for a file plainly inside the lib dir. The route log confirms exactly this branch fired.

### Why each environment behaved differently (and why "Windows is unreliable" is the wrong lesson)

- **Linux CI passes**: POSIX `realpath` preserves case (identity here), no drive letter exists → both strings are byte-identical → `startsWith` succeeds.
- **The maintainer's Windows laptop passes**: tooling there spells the drive lowercase (`c:\`) "in some tooling", so both strings happened to share one spelling. The trap fires **only when the two spellings differ** — which is exactly why it looks machine-specific and slipped through.
- **Production fails**: the module URL carried `E:` while libuv's realpath returned `e:`.

So the root cause is **not platform folklore**: it is a case-sensitive string-prefix comparison applied to two strings produced by two different path APIs with different casing conventions, inside a case-insensitive path namespace. The lexical (first) check passed because both of *its* sides came from the same spelling; only the realpath-anchored check compared across pipelines. Two secondary weaknesses of prefix matching worth noting: it treats `lib-evil\x.js` as contained only thanks to the `+ sep`, and it is blind to 8.3 short names / junction-resolved spelling changes that `realpathSync` may also introduce.

---

## 3. Fix direction for the guard + the other serving requirement

### The comparison to use

**Decide containment on canonicalized paths from *one* pipeline, compared per segment with the platform's case semantics — never as an ordinal string prefix:**

1. Canonicalize both sides with the same API: `const LIB_REAL = realpathSync(LIB_DIR)` **once at startup**, and `const file = realpathSync(abs)` per request (keep the existing try/catch → 404 on missing).
2. Containment = "the candidate is a strict descendant": `const r = relative(LIB_REAL, file)`; accept only if `r` is non-empty, not absolute (rejects a different drive/volume, where `path.relative` yields an absolute path), and its first segment is not `..` (rejects `..` escapes and same-prefix siblings like `lib-evil`).
3. Apply **case folding for the segment comparison only where path identity is case-insensitive** (win32: fold both sides to one case before `relative`/segment compare, e.g. `relative(LIB_REAL.toLowerCase(), file.toLowerCase())`, or an explicit case-insensitive segment walk). Do **not** blanket-fold on POSIX — on a case-sensitive volume that would wrongly admit `/lib` → `/LIB` escapes.

Why this is robust on both platforms: it compares **resolved path identity** (realpath resolves symlinks, junctions, 8.3 short names and case-preservation quirks) **segment-wise with the platform's own equality rules**, instead of ordinal byte prefixes across two casing conventions. Both drive-letter case (the observed bug) and on-disk segment case collapse to the same verdict, while genuine escapes still fail on both OSes. Keep the cheap lexical pre-check on `abs` (reject empty `rel`, non-`.js/.mjs`, and `..`/absolute before touching disk) as a first gate only — the realpath comparison remains the authority.

### The other serving requirement for a dynamic import to work at all

**The response must carry a JavaScript MIME type** — `content-type: application/javascript; charset=utf-8` (or `text/javascript`). Module loading is **MIME-strict**: a chunk served as `text/plain`, `application/octet-stream`, or — the common trap — an HTML body from an SPA fallback or an auth-redirect **302 → login page** is refused at the module-fetch step and surfaces identically as *"Failed to fetch dynamically imported module"*, even when the bytes are correct. The route already sets the right type; it must survive every layer (no default-extension MIME guesser overriding it, no redirect/HTML fallback for this prefix), and the public prefix must equal the base URL against which the chunk's own relative specifiers resolve (see incident 1).

---

## 4. Incident 3 — why BOTH handlers fire on one Ctrl+scroll

### Mechanism (event-listener semantics, not folklore)

One gesture dispatches **one `wheel` event**, which travels the full event path: capture phase (window → … → target) then bubble phase (target → … → window). The zoom modal's handler and the pane's font-size handler are **both on that path** — the pane's Ctrl+wheel listener lives on the pane root / document / window (and a fullscreen modal rendered in a portal or overlay does not detach it from that path).

The decisive points:

1. **`preventDefault()` is not a claim.** It suppresses only the browser's *default* action (page zoom/scroll); it does **not** remove other listeners. Only `stopPropagation()` (stops the event for the rest of the path) or `stopImmediatePropagation()` (also later listeners on the same node) silences other handlers. A modal handler that zooms the diagram and calls `preventDefault()` — or nothing at all — lets the pane's handler run on the same event: one Ctrl+scroll → **diagram zoom AND pane font resize** (exactly the complaint).
2. **Ordering makes stopping unreliable too.** If the pane's listener is registered with `capture: true` on window/document, it runs **before** the modal's bubble-phase handler — so even a correct `stopPropagation()` in the modal arrives too late for that gesture. Propagation control only works if the claim happens at or above the outer listener's registration point.
3. Passive listeners (common on `wheel` for scroll performance) cannot even `preventDefault()`, so a passive "zoom" handler silently owns nothing.

### The ownership rule that fixes it

**A gesture has exactly one owner: the topmost open layer, for as long as it is open. Every underlying handler yields unless it currently owns the gesture.** Enforce on both sides:

- **Claim**: while the zoom modal is open, its handler runs at capture time at/above the pane's listener and calls both `preventDefault()` and `stopPropagation()` (or route the gesture through a single shared dispatcher).
- **Yield**: the pane's Ctrl+wheel handler checks ownership before acting — a shared overlay/ownership flag or `event.composedPath()` containing the modal element — or is simply **not registered** while any fullscreen modal is open (re-register on modal close). Handler removal is the strongest form: a listener that does not exist cannot fire.

Do not encode ownership as "who called `preventDefault()`" — the event model does not work that way.

---

## 5. Regression tests that would have caught incidents 1–3 before release

**T1 · Chunk-graph completeness (incident 1)** — build-level:
- After build, for every emitted/shipped chunk, extract relative `import`, `export … from`, and dynamic `import()` specifiers; assert each resolves to a **shipped** file (compare against the packed file list, e.g. `npm pack --dry-run`'s file set — not just the build outdir). With the single-file fix: assert `mermaid-chunk.js` contains **zero** relative import specifiers.
- Package-content test: the tarball's `lib/` file set equals the bundler's emitted chunk set (catches "shipped only the entry").
- Browser-level (Playwright/Chromium): load a page with one fenced mermaid block through the **real route**; assert the diagram renders (SVG present, no fallback code block) and the network log contains **no non-200** fetch. The failing build reproduces deterministically as 404 on `./pie-WAS4IAKB-*.js` plus the misleading "Failed to fetch dynamically imported module".

**T2 · Containment guard (incident 2)** — extract `isInside(libDir, candidate)` as a pure function and table-test it:
- drive-letter case mismatch (`E:\…` vs `e:\…` — the exact production bug), segment-case mismatch (`lib` vs `Lib`), `..` escape, sibling-prefix `lib-evil\x.js`, symlink/junction inside lib and one pointing outside (create a real junction on Windows), UNC vs drive-letter, trailing separator, empty `rel`.
- **CI must run this on a Windows runner** (`os: [ubuntu-latest, windows-latest]` matrix): the CI note proves Linux-only CI structurally cannot see this class of failure. The case-mismatch cases can be simulated on any OS by inputs differing only in case.
- Integration: on a Windows host, `GET /dsh-attach-input/resources/mermaid-chunk.js` → **200** (currently 403), and a `../`-escape → 403/404. Assert the response `content-type` is a JavaScript MIME type (the `3 serving contract).

**T3 · Gesture ownership (incident 3)** — UI test:
- Open the zoom modal over the pane; dispatch **one** Ctrl+wheel at the diagram; assert exactly one effect: diagram transform changed **and** the pane's computed `font-size` unchanged; a spy asserts the pane handler was **not** invoked. Reverse case: with no modal, Ctrl+wheel resizes pane font only.
- Listener-contract test: with the modal open, a synthetic wheel event dispatched at a pane descendant must not reach a bubble-phase spy on the pane root (modal's capture-phase `stopPropagation`), and the pane handler must early-return on the ownership flag even when invoked directly. Cover the capture-vs-bubble ordering explicitly (pane listener in capture phase on window) so a bubble-only fix cannot pass.

T2's Windows CI matrix is the load-bearing one: the maintainer's matrix ran the same route check on three machines and only the case-spelling combination of the production host hit the bug — an untested platform is an untested *path-normalization convention*, which is exactly what `2 names.

---

## Skill mapping (points + IDs only)

- Touchpoint classes hit: **#4 host filesystem reads** (the route's containment guard over `lib/`) and **#6 custom HTTP/DOM channels** (the resource route; the modal wheel handler) — `references/pre-flight.md`.
- Adjacent cards: **DSH-0.2.0-RC2** (route fences returning 403 when a platform layer alters request markers — same 403-on-a-plugin-route symptom family) and **v0.1.5-alpha.2 `workspaceFiles` `absolute` scope authorization** (containment must be decided on canonical paths; a precedent for the `3 comparison).

## Completed
Root causes derived from the evidence for incidents 1–3 (bundler chunk-graph semantics; two-pipeline path casing + ordinal `startsWith`; `preventDefault` vs propagation and listener ordering), fixes specified (single-file bundle or full-chunk shipping + graph assertion; realpath-both-sides + segment-wise relative containment with platform case folding; single-owner gesture rule), and regression coverage T1–T3. `/app/fixture/` verified unchanged (read-only).

## Skipped
Mode-C migration mechanics (corridor, baselines, install/verification runs) — out of scope for this read-only diagnosis brief; no builds or installs executed per the authorization.

## Pending / residual risk
- The precise libuv/Node version behavior behind the lowercase drive letter is derived from the printed evidence pair plus Win32 canonicalization semantics; the `3 fix is invariant across Node versions because it never compares strings across pipelines.
- Case folding assumes win32 = case-insensitive; case-sensitive NTFS volumes / WSL-mounted paths would need the volume's actual semantics probed before folding.
- T3 depends on the plugin's actual listener registration surfaces (capture vs bubble), which the evidence pack does not show; the test must pin both orders.

## Rollback
Read-only task; nothing to roll back. No fixture, skill, evaluator, or reference file was modified.

## Recommendations
- Ship the single-file chunk (attempt 2 direction) plus a build-time "no relative imports in the shipped chunk" assertion.
- Treat `npm pack` content as the release artifact under test, not the build outdir.
- Add Windows to the plugin's CI matrix for any path-touching host surface.

## run-stats
- toolcalls: 14 logical calls (via 6 run_code invocations) — read ×9, glob ×1, write ×3, send_message ×1
- tokens: n/a (not visible in this harness)
- completion time: 2026-10-21T07:05:35.397Z


#### FILE: tool-transcript.txt

# tool-transcript.txt — S11 solver. All read/glob/write calls issued through run_code wrappers (6 run_code invocations in total, incl. the send_message call); 14 logical tool calls total.
1. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\SKILL.md
2. glob pattern=**/* path=<cell-dir> (list evidence pack + agent-output)
3. read <cell-dir>\fixture\README.md
4. read <cell-dir>\fixture\chunk-route.ts
5. read <cell-dir>\fixture\ci-note.md
6. read <cell-dir>\fixture\console-403-windows.txt
7. read <cell-dir>\fixture\console-split-chunks.txt
8. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\pre-flight.md
9. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\troubleshooting.md
10. write <cell-dir>\agent-output\report.md (root-cause report: incidents 1-3, fixes, regression tests, run-stats)
11. write <cell-dir>\agent-output\tool-transcript.txt (this file)
12. write <cell-dir>\agent-output\transcript-manifest.txt (R/W filesystem manifest)
13. read <cell-dir>\agent-output\report.md (verify non-empty)
14. send_message agent_id=session-5d3ebe0e-127d-4dc4-a3b9-cb2199b04f8e (deliver self-contained result summary)


#### FILE: transcript-manifest.txt

R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\SKILL.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S11-mermaid-lazyload-trap
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S11-mermaid-lazyload-trap\fixture\README.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S11-mermaid-lazyload-trap\fixture\chunk-route.ts
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S11-mermaid-lazyload-trap\fixture\ci-note.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S11-mermaid-lazyload-trap\fixture\console-403-windows.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S11-mermaid-lazyload-trap\fixture\console-split-chunks.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\pre-flight.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\troubleshooting.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S11-mermaid-lazyload-trap\agent-output\report.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S11-mermaid-lazyload-trap\agent-output\tool-transcript.txt
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S11-mermaid-lazyload-trap\agent-output\transcript-manifest.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S11-mermaid-lazyload-trap\agent-output\report.md


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.