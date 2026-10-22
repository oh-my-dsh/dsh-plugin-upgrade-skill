# S11 · Mermaid Lazy-Load Trap — Diagnostic Report

**Plugin**: `@org/dsh-attach-input` v0.4.0 (community Web plugin, lib-only bundle)
**Mode**: read-only diagnosis (skill `plugin-upgrade`, Mode-A discipline: investigate → report → stop; no writes to the fixture, no installs, no migrations executed)
**Evidence pack** (read-only, `/app/fixture/`): `chunk-route.ts` (attempt-2 host route), `console-split-chunks.txt` (attempt 1), `console-403-windows.txt` (attempt 2 on Windows Server 2022), `ci-note.md` (test matrix + production debug print), `README.md`.
**Integrity check**: sha256 of all 5 fixture files recomputed read-only; 5/5 match `fixture-hash-before.json` — fixture unchanged.

---

## 1. Incident 1 — split chunks: why sibling imports 404, and the build-side fix

### What the evidence shows

- `console-split-chunks.txt` L4: the entry `mermaid-chunk.js` itself returned **200** and was only **8.1 kB** — a thin facade, because the bundler's default code-splitting hoisted mermaid's per-diagram lazy `import()` calls and shared modules into ~97 content-hashed sibling chunks (`src-BfvxrPJe.js`, `pie-WAS4IAKB-CQHCQWWM.js`, …), leaving only relative import specifiers in the entry.
- L5–L6: every sibling request under the same route prefix returned **404**.
- L10–L12 (the smoking gun): `ls` of the **shipped** `lib/` — the entry was present, **the sibling files named in its import statements were not shipped with the package**.

### Mechanism (bundler + browser semantics, not folklore)

1. **Bundler side**: with default splitting, the lazy entry is not a unit — it is the root of a *module graph* whose other members are separate, **content-hashed** output files whose names change on every build.
2. **Browser side**: relative specifiers inside an ES module resolve against *that module's own URL* (`import.meta.url` base). Since the entry was served from `/dsh-attach-input/resources/mermaid-chunk.js`, the browser dutifully requested every sibling from `/dsh-attach-input/resources/…` — exactly the URLs in the capture. The prefix route maps that URL space onto the plugin's `lib/` dir, so **the route + the published package together must contain the whole graph**; the route did its job and correctly 404'd files that were not on disk.
3. **`import()` contract**: the dynamic-import promise settles only after the **entire transitive graph** is fetched, instantiated and linked. One 404 anywhere in the graph rejects the whole import with `TypeError: Failed to fetch dynamically imported module` — and the TypeError is reported **against the entry URL**. That is why the capture is self-consistent even though it shows `mermaid-chunk.js 200` *and* a failed-import TypeError naming `mermaid-chunk.js`: the network failures were the siblings; the rejection surfaces at the graph root.
4. **Why the package was incomplete**: a lib-only package typically whitelists its outputs (`files` field / copy step) by *known file names*. A whitelist that names `mermaid-chunk.js` can never track hash-named outputs like `pie-WAS4IAKB-CQHCQWWM.js`. The build produced a multi-file graph while the packaging+serving contract assumed one named file — the two halves were never reconciled.

### Build-side fix

Make the lazy chunk **self-contained at build time** (this is what attempt 2 correctly adopted — its remaining defect was the route guard, §2):

- Dedicated Rollup/Vite lib pass for the mermaid entry with **`output.inlineDynamicImports: true`** (Vite: `build.rollupOptions.output.inlineDynamicImports`), so all of mermaid's internal `import()` calls are inlined and the build emits **exactly one file with zero relative sibling specifiers**. Nothing can be missing from the graph because the graph has one node. Trade-off: a 7.2 MB monolith with coarse cache granularity — acceptable because it is lazy (fetched only when a `mermaid` fence is first rendered), and mitigable with cache headers (§6).
- **Alternative** (if splitting is kept for cache granularity): publish the *entire* chunk-output directory — glob-based `files` coverage of the build out-dir (never a hand-listed name set), stable `chunkFileNames` inside one directory — and keep the prefix route serving all of `lib/`. This is strictly more fragile (every build mutates hash names), so it must be pinned by the tarball-graph-integrity test T1 below.

Either way the invariant to encode: **the set of relative import specifiers inside the shipped chunk(s) must resolve to files inside the shipped package.** Attempt 1 violated exactly this invariant.

---

## 2. Incident 2 — the containment guard's exact flaw (403 on Windows, green on Linux)

### The guard as written (`chunk-route.ts`)

```
L5   const LIB_DIR = normalize(fileURLToPath(new URL('.', import.meta.url)))   // "E:\dsh\…\lib" on prod
L15  const abs  = normalize(join(LIB_DIR, rel))
L16  if (!abs.startsWith(LIB_DIR + sep))                       → 403   // guard 1: lexical
L19  file = normalize(realpathSync(abs))
L20  if (!file.startsWith(LIB_DIR + sep))                      → 403   // guard 2: post-realpath
```

### The flaw, named precisely

**Guard 2 compares a physically canonicalized child (`realpathSync` output) against a non-canonicalized, lexical prefix (`LIB_DIR`, taken verbatim from the module URL string) using byte-wise, case-sensitive `String.prototype.startsWith` — on a platform where the filesystem treats case as display metadata, not identity, and where two different OS/Node APIs legitimately return different casings of the same path.**

Per-API behavior on each platform:

| Step | Windows (production, `E:\`) | Linux (CI container) |
|---|---|---|
| `fileURLToPath(import.meta.url)` → `LIB_DIR` | Preserves the casing recorded at module-resolution time — how the host process was launched / how the install path was spelled: **`E:\dsh\…\lib`** (uppercase drive; `ci-note.md` L9–L12 debug print) | Whatever bytes the loader used; consistent everywhere downstream |
| `fs.realpathSync(abs)` | Returns the **filesystem's canonical form**, not the input's spelling: it follows symlinks/**junctions** (a pnpm-style Windows tree contains junctions; each link's *stored target* casing replaces the input casing) and Windows handle-based volume canonicalization (`GetFinalPathNameByHandle`-class APIs behind libuv's `uv_fs_realpath`) does not preserve the caller's drive-letter casing — Node has a long-documented history of realpath returning a **lowercase drive letter** (nodejs/node#3857 lineage). Observed on prod: **`e:\dsh\…\lib\mermaid-chunk.js`** (lowercase drive) | POSIX `realpath(3)` resolves symlinks and dot-segments but **never recases literal components**; on a case-sensitive FS the output keeps the exact input bytes |
| `path.normalize` | Purely lexical (separators, `.`, `..`); **does not fold case on any platform** — a no-op for this bug | same |
| `file.startsWith(LIB_DIR + sep)` | `"e:\…".startsWith("E:\…")` → **false** → 403 `path escapes the plugin lib` for a path that is plainly inside lib (`console-403-windows.txt` L10–L12 confirms this exact branch fired) | Both sides derive from the **same** `import.meta.url` bytes → identical strings → **always true** → green, structurally incapable of catching the flaw |

NTFS semantics make this deterministic, not "unreliable": case is *preserved* but is **not part of path identity** (case-insensitive by default), so `E:\…\lib` and `e:\…\lib` denote the *same directory*; only the JS string comparison disagrees. The per-machine split in `ci-note.md` follows: drive-letter casing is **provenance-dependent** (cwd spelling, launch args, tooling normalization — the note itself says "lowercase c:\ in some tooling"). On the maintainer's laptop both sides happened to agree (`c:`=`c:`) → green by coincidence; on the production server the launch path spelled `E:` while realpath canonicalized to `e:` → red. Same code, same OS family — the comparison is a per-machine coin flip, which is exactly why "Windows paths are unreliable" is the wrong takeaway.

Which guard fired: **guard 2 only.** Guard 1 builds `abs` from the same `LIB_DIR` string (identical casing), so its lexical prefix check passes; the divergence is introduced solely by `realpathSync`. This matches the route log ("the guard branch fired … for a path that is plainly inside the lib directory").

### Second, latent flaw in the same comparison (platform-independent)

Guard 2's asymmetry — realpath'd child vs **non**-realpath'd parent — also breaks whenever `LIB_DIR` itself sits behind a link: pnpm `node_modules` symlinks (POSIX) or **junctions** (Windows), symlinked global installs. Then `realpathSync(abs)` returns the *link target* (e.g. `.pnpm` store path), which does not lexically begin with the symlinked `LIB_DIR` → 403 on a legitimate file **on any OS, Linux included**. The production evidence exhibits the casing mode; a correct fix must close both modes, because both stem from comparing differently-canonicalized strings.

---

## 3. Guard fix direction + the other serving requirement

### The comparison to use

Canonicalize **both** sides identically, then compare with platform-appropriate equality:

```ts
// once at module load — fail fast if the lib dir cannot be canonicalized
const LIB_REAL = realpathSync(LIB_DIR)                       // same API as the child side

// case-insensitive filesystems: identity is case-insensitive, so the comparison must be too
const CASE_INSENSITIVE_FS = process.platform === 'win32' || process.platform === 'darwin' // NTFS default; APFS default
const fold = (p: string) => (CASE_INSENSITIVE_FS ? p.toLowerCase() : p)  // toLowerCase is locale-independent in JS

// per request, keeping the cheap lexical guard 1 BEFORE any filesystem touch:
const abs = normalize(join(LIB_DIR, rel))
if (!abs.startsWith(LIB_DIR + sep)) return deny(403)         // rejects ".." traversal without an fs probe
let file: string
try { file = realpathSync(abs) } catch { return deny(404) }
if (!fold(file).startsWith(fold(LIB_REAL) + sep)) return deny(403)   // symmetric canonical form + platform-correct case
```

Why this is robust **on Windows**: (a) realpathing `LIB_DIR` too makes both sides come from the *same* canonicalization function — drive-letter casing, junction/symlink targets, and any `\\?\`-style spelling noise are applied to both sides equally, so they cannot diverge; (b) case-folding matches the filesystem's own equality semantics (case-insensitive identity), so no legitimate in-lib file can ever 403 because two APIs spelled it differently. The `+ sep` boundary is kept so `…\lib` cannot prefix-match a sibling `…\lib-evil`.

Why it is robust **on Linux**: folding is the identity function (no behavior change); byte-exact comparison remains, which is *correct* on a case-sensitive FS — a differently-cased path really is a different (non-existent or foreign) path, and traversal is still denied. Symmetric realpath also fixes the symlinked-install mode there (both sides resolve to the same store path). An equivalent primitive is `const r = path.relative(LIB_REAL, file)` after folding, requiring `r !== '' && !r.startsWith('..') && !path.isAbsolute(r)` — note `path.win32.relative` is itself case-sensitive, so folding is still required either way. Keep decoding **before** normalization (the current L13 order is right) so `%2e%2e` cannot smuggle traversal past the lexical guard.

### The other serving requirement for a dynamic import to work at all

**JavaScript MIME type under strict module MIME checking.** A dynamic `import()` evaluates a response only if it is **200 with a JavaScript MIME type** (`text/javascript` / `application/javascript`). Browsers enforce *strict MIME checking* on ES module scripts: a 200 carrying `text/plain`, `application/octet-stream`, or an HTML error/fallback page rejects the import with **the same generic** `Failed to fetch dynamically imported module` TypeError — console-indistinguishable from a 403/404. The route currently sets `content-type: application/javascript; charset=utf-8` on the success path (`chunk-route.ts` L23); the requirement is that **every** body-returning path keeps this contract — error branches must keep their non-200 statuses (they do: 403/404/405), and no fallback may ever be served as 200-with-wrong-MIME, or debugging collapses into the same ambiguous TypeError the maintainer already fought twice.

Corollary (ties back to Incident 1): the route + package must serve the chunk's **entire transitive import graph** — every relative specifier the shipped chunk(s) can request under the same prefix. A single-file `inlineDynamicImports` build satisfies this trivially; any return to splitting re-activates T1 below.

---

## 4. Incident 3 — why BOTH handlers fire on one Ctrl+scroll, and the ownership rule

### Mechanism (event-listener semantics)

One Ctrl+scroll gesture produces **one** `wheel` event (`ctrlKey: true`) targeted at the element under the cursor — the diagram, inside the fullscreen zoom modal. `wheel` is a **bubbling, composed** event: it propagates target → ancestors → document → window unless a listener on that path stops it.

Both interested handlers sit on that single propagation path:

- the **modal's zoom handler** (on the modal root / diagram container) — the deeper listener;
- the **pane's Ctrl+wheel font-size handler** (registered higher: pane root, or a document/window-level global). The modal is rendered inside the pane's DOM subtree — and even if it were portaled to `document.body`, a document/window-level pane listener would still receive the event, because native propagation follows the *actual* DOM tree and portals only re-parent within it.

Neither handler **consumes** the event:

- the modal handler applies diagram zoom but never calls `stopPropagation()` → the same event object continues bubbling outward;
- the pane handler applies font resize **unconditionally** — it checks neither `event.defaultPrevented`, nor overlay containment (`e.target` inside a modal layer), nor a modal-open state.

Result: one gesture, two self-declared owners, both act — diagram and font resize simultaneously, exactly as reported.

Two ordering/passivity nuances that determine which fix variant works:

1. **Capture vs bubble**: bubble-phase listeners fire inside-out (modal first, pane second), so a `stopPropagation()` in the modal suffices. But if the pane/host listener is registered in the **capture phase** on document/window, it fires *before* any modal bubble listener, and a modal-side bubble stop is structurally too late — then ownership must be enforced at the modal root in capture phase and/or by the pane-side checks.
2. **Passive-by-default**: Chromium registers `wheel` listeners on window/document/body as `passive: true` by default; a passive listener **cannot** `preventDefault()`. Consuming the gesture requires registering with `{ passive: false }`. And `preventDefault()` (kills the *default action*) and `stopPropagation()` (kills *delivery to other listeners*) are orthogonal — suppressing the pane handler needs the latter; suppressing browser page-zoom needs the former.

### The ownership rule that fixes it

**One gesture, one owner: the innermost / topmost active interactive surface that handles a gesture owns it exclusively, and every outer layer is inert while that surface is open.** Concretely for this plugin:

- While the zoom modal is open it owns wheel on its surface: register the modal-root handler with `{ capture: true, passive: false }` and, after applying zoom, call `e.preventDefault(); e.stopPropagation();` — consuming the gesture at the modal boundary so no outer listener ever receives it (consume unhandled modifier combinations too, so they cannot leak to the pane).
- The pane's Ctrl+wheel font handler defers to any active overlay: early-return when `e.defaultPrevented`, or `e.target` lies inside an overlay layer (`modalRoot.contains(e.target)` / `e.target.closest('[data-overlay-layer]')`), or the modal-open flag/layer stack says a modal is topmost. (If the pane handler is host-owned and cannot be edited, the plugin-side containment — portal to body + capture-phase consumption at the modal root — keeps the event off the host's path, except for host capture-phase window listeners; the overlay-state check is the variant that always works.)
- On modal close, ownership **reverts**: Ctrl+scroll in the pane resizes the font again, and must not touch the (closed) diagram. Tests below assert both directions.

---

## 5. Regression tests that would have caught incidents 1–3 before release

Two matrix facts frame everything: the original CI ran the **serving** lane only on Linux (`ci-note.md`), and the Windows "green" was a casing coincidence on one laptop; and artifact checks ran against the **working tree**, not the published package. Fixes to the matrix are part of the test plan.

### Incident 1 (build/packaging graph integrity)

- **T1 · Tarball graph-integrity test** (CI, on `npm pack` output): extract the packed tarball; for every `*.js` under `lib/`, parse static and dynamic **relative** import specifiers; assert each target exists inside the tarball. Hash-agnostic — catches "entry shipped, siblings missing" for any future split, and would have failed attempt 1 immediately.
- **T2 · Single-chunk contract assertion**: assert the mermaid entry build emits exactly one output file and that the shipped chunk contains **zero relative import specifiers** (locks the `inlineDynamicImports` decision against a future bundler-config regression).
- **T3 · Published-artifact serving smoke**: install the packed tarball into a throwaway DSH profile; register the route; HTTP-GET the chunk URL; assert **200 + JS content-type + expected byte length**. Optionally: headless-browser `import()` of the served URL resolves and renders a mermaid fence (upgrades T3 into an end-to-end proof of §3's MIME requirement).

### Incident 2 (path-guard cross-platform correctness)

- **T4 · Guard unit tests, platform-parameterized** (run on **Linux and Windows runners**): (a) *drive-case*: `LIB_DIR = "E:\app\lib"` with realpath yielding `"e:\app\lib\mermaid-chunk.js"` → **allow** (this single case is the production incident); (b) *symlink/junction*: lib dir behind a POSIX symlink / NTFS junction → allow (symmetric-realpath fix); (c) *traversal*: `..`, `%2e%2e`, mixed `/\` separators, NUL byte → 403/404; (d) *sibling prefix*: `…\lib-evil\x.js` → 403 (the `+ sep` boundary).
- **T5 · Route integration on a Windows CI lane**: install to an **uppercase-drive** path (and a second run with lowercase-spelled cwd/tooling), boot the host, GET `/dsh-attach-input/resources/mermaid-chunk.js` → 200 `application/javascript`. The escape route was "Windows tested only on a machine where casing coincidentally matched" — the Windows runner must be a standing serving lane, not a manual laptop check.
- **T6 · (optional) property test**: for randomized in-lib paths under case permutations, the guard always allows; for paths whose realpath escapes `LIB_REAL`, it always denies — on both OSes.

### Incident 3 (event ownership)

- **T7 · DOM propagation test** (jsdom/happy-dom or Playwright component test): mount pane + open modal; dispatch `new WheelEvent('wheel', { ctrlKey: true, bubbles: true, cancelable: true })` on the diagram; assert (a) diagram scale changed, (b) pane font-size handler did **not** run, (c) `event.defaultPrevented === true` (proves non-passive consumption), (d) a document-level sentinel listener received nothing (proves propagation stopped at the modal boundary). Reverse direction: modal **closed** → pane font changes, diagram untouched.
- **T8 · E2E on the real DSH web host** (Playwright): render an actual mermaid fence, open the zoom modal, Ctrl+`mouse.wheel`; assert diagram transform changed **and** pane computed font-size unchanged; then close and assert Ctrl+wheel resizes the font again.
- **T9 · Ownership-contract test**: assert the modal registers its wheel listener with `capture: true, passive: false` on the modal root, and the pane handler contains the overlay/`defaultPrevented` guard — pins the rule itself, so a later re-registration (e.g. someone moves the pane listener to window capture without the guard) fails in CI rather than in production.

Mapping: T1–T3 catch Incident 1 at package time; T4–T6 catch Incident 2 on the first Windows CI run (T4a is the literal production repro); T7–T9 catch Incident 3 at PR time.

---

## 6. Additional observations (not part of the three incidents; advisory only)

- **Connection auth gate**: a raw `ctx.webServer.register` route does not automatically inherit Connection authentication (skill precision-checklist §"Channel auth joins the host gate"; card **DSH-0.1.2-A1-08**). The chunk route serves static hashed JS (low sensitivity), but calling `ctx.connection.requestRejection(req)` before serving — honoring its 401/403 — would align the route with host policy. Advisory; not auto-adopted (capability-class guidance is suggestion-only per the skill).
- **Filter regex**: `/.m?js$/` (L14) has an unescaped `.` — it matches *any char* + optional `m` + `js` (e.g. `notesXjs` passes). Should be `/\.m?js$/`. Also the fixture's leading-slash strip reads `replace(/^/+/, '')` — almost certainly a transcription of `replace(/^\/+/, '')`; verify the real source compiles (as printed it is not valid JS).
- **`webServer` availability**: some compositions ship without `webServer` (card **DSH-0.1.5-A1-16**: `webServer` optional; use `ctx.inject(['webServer'], …)`). Guard the route registration and define a fallback for non-HTTP carriers (a lazy `import()` over HTTP is impossible there).
- **Caching**: a fixed URL (`mermaid-chunk.js`) for a 7.2 MB file across plugin upgrades risks stale bytes; add ETag/Last-Modified or version the URL per release.

---

## 7. Report ledger (skill format, adapted to read-only diagnosis)

- **Completed**: full evidence review (5 fixture files); root causes derived from bundler module-graph semantics (§1), Windows/Linux path-canonicalization and NTFS case semantics (§2), and DOM event-propagation/passive-listener semantics (§4); concrete guard fix + MIME serving requirement (§3); 9 regression tests mapped to the three incidents (§5); fixture integrity verified (sha256 5/5 match `fixture-hash-before.json`).
- **Skipped**: no code execution of fixture content, no installs/migrations/publications (prohibited by the brief); DSH version-corridor card scan — not applicable (the incidents are plugin-side defects, not host-version breaks); only two cards cited, as context/advisory.
- **Pending / residual risk**: live re-verification of Node/libuv realpath casing on the actual production server was impossible in this read-only container — §2 relies on the maintainer's own debug print (`ci-note.md` L9–L12) plus documented Windows realpath behavior; the route source is an excerpt, so §6's regex notes are best-effort against the transcription.
- **Rollback**: nothing to roll back — the only writes are this report under `/app/agent-output/S11-mermaid-lazyload-trap/`; fixture untouched.
- **Recommendations**: land the §3 guard fix and T4a/T5 first (production is red); keep the single-file build (T2) until a real caching need justifies re-splitting with T1; adopt the §4 ownership rule with capture+non-passive consumption; add the Windows serving lane to CI permanently.
