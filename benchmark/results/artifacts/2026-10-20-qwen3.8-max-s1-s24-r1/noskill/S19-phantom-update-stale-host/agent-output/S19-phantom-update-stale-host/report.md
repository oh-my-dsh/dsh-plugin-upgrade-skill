# S19 · The Phantom Update, the Stale Host Half, and the Corrupted Payload — Forensic Report

Date: 2026-10-20 · Scope: read-only analysis of `/app/fixture/` (evidence pack from the 2026-09-05
release session of client plugin `@dsh-external/dsh-file-trace` v0.3.7/v0.3.8).
Fixture integrity: all 8 fixture files sha256-verified against `fixture-hash-before.json` before and
after this analysis — unchanged. All writes confined to `/app/agent-output/S19-phantom-update-stale-host/`.

## Executive summary

| # | Symptom | Verdict |
|---|---------|---------|
| 1 | Freshly released v0.3.7 shows badge "新版本 v0.3.7 可用" | The shipped bundle carries a **build-time baked** `PLUGIN_VERSION = "0.3.6"` because the build ran **before** the version bump; the runtime check compares that stale constant against the (correct) mirror tags and announces an update to itself. Mirrors/tags are perfect and irrelevant. |
| 2 | v0.3.8 SVG toggle visible, but asset route 404s the .svg while PNG is 200 | **Plane asymmetry**: the client half re-fetches on browser reload (toggle appeared), the host half registers routes/whitelist only at **host boot** — the host process was never restarted, so the *running* handler still executes the pre-v0.3.8 whitelist without `svg`, even though the disk `lib/index.js` has it. |
| 3 | One traced SVG renders as a broken image | The **session log's persisted read-result text** was corrupted upstream (mid-file splice at shared prefix `stro`, lines 233–247 absent) during result-text assembly; the disk file is well-formed and a re-read is clean. The plugin rendered the untrusted corrupted payload. The traced file must **not** be edited. |

---

## 1. Phantom self-update root cause

### 1.1 Evidence chain

- `release-log.md` steps 3–6: **16:22 `pnpm run build`** (client bundle emitted) → **16:23 bump
  `package.json` 0.3.6 → 0.3.7** → 16:24 `git commit` *includes the already-built `lib/client.js`* →
  `git tag v0.3.7` → 16:25 push to origin/public/omdsh, `ls-remote` tag SHA verified on all three.
- `client-bundle-excerpt.js` (verbatim shipped `lib/client.js` at tag v0.3.7):
  `export const PLUGIN_VERSION = "0.3.6";` — annotated "tsdown inlined this constant from package.json
  WHEN THE BUNDLE WAS BUILT — it is not read dynamically at runtime."
- `git-tags.txt`: all three mirrors list v0.3.7 = `748b5e56…` with identical SHAs.

### 1.2 Where the compared version constant comes from: build time, not runtime

The bundler (tsdown) performs constant folding: at the moment `pnpm run build` executes, it reads
`package.json.version` and **inlines the literal string into the emitted bundle**. There is no runtime
read of `package.json` — the shipped `PLUGIN_VERSION` is frozen at whatever the manifest said *when the
build command ran*. The build ran at 16:22, one minute **before** the 16:23 bump, so the manifest still
said `0.3.6` — and `0.3.6` is what got baked into the v0.3.7 artifact, committed, tagged, and pushed.

### 1.3 Mechanism of the phantom badge

The self-update check runs `git ls-remote --tags` (no auth) against the mirrors, picks the highest
`vX.Y.Z`, and compares: `newerTag(latest) = compareSemver(latest, PLUGIN_VERSION) > 0 ? latest : undefined`.
On the just-released v0.3.7: latest mirror tag = `v0.3.7` (correct), baked constant = `"0.3.6"` (stale)
→ `compareSemver("0.3.7","0.3.6") > 0` → badge **"新版本 v0.3.7 可用"** — the plugin announces an update
to *itself*, because it misidentifies its own version. (After v0.3.8 shipped in the same session the
badge would point at v0.3.8 — the defect compounds with every later release until re-built.)

### 1.4 Why mirror/tag integrity is irrelevant here

The comparison has two inputs: the **remote latest tag** (distribution side) and the **local baked
constant** (artifact side). Every integrity check performed — three mirrors serving the new bundle,
identical tag SHAs on all three — validates only the distribution side, and the distribution side was
flawless. The defect lives entirely inside the artifact: the tagged commit itself contains a bundle
baked with `0.3.6`. Tag-SHA equality answers "did every mirror receive the same bytes?", never "do those
bytes self-identify correctly?" — a perfectly replicated *wrong* artifact passes every mirror check.
Chasing mirrors here is a category error; the evidence that settles it is grepping the shipped bundle.

### 1.5 Corrected release order

1. Edit + typecheck + tests green (unchanged).
2. **Bump `package.json` version FIRST** (0.3.6 → 0.3.7).
3. **THEN build** — the bundle now inlines `0.3.7`.
4. **Verify the baked constant** in the shipped bundle (§1.6) before committing.
5. Commit the *freshly built* `lib/`, tag, push main + tag to all mirrors.
6. Per-mirror `ls-remote` SHA check **plus** per-mirror content probe (§5.2 item 3).

Structurally better: build in CI from a clean checkout of the tagged commit (artifact ≡ tag by
construction), and never commit a bundle built from a pre-bump working tree. The fixture confirms the
maintainer corrected exactly this for v0.3.8 ("bump FIRST, then build") after an amend + rebuild +
force-move of the v0.3.7 tag on all mirrors.

### 1.6 The check that would have caught the stale constant before pushing

A five-second gate between build and push:

- **Grep the shipped bundle**: `grep -oE 'PLUGIN_VERSION\s*=\s*"[^"]+"' lib/client.js` must print the
  new version; assert equality with `node -p "require('./package.json').version"`.
- **Import assertion**: `node -e "import('./lib/client.js').then(m => process.exit(m.PLUGIN_VERSION === require('./package.json').version ? 0 : 1))"`.
- **Self-announcement smoke test**: with the tag about to be published, `newerTag("v" + ownVersion)`
  must return `undefined` — a released version must never announce itself.

Any one of these fails loudly on a `0.3.6`-baked bundle sitting next to a `0.3.7` manifest.

---

## 2. Client vs host plane update asymmetry

### 2.1 Where each half's code is loaded, and when

- **Client half (`lib/client.js`)** — a browser-side bundle. The GUI **re-fetches and re-evaluates it
  on page reload** (or client-plugin HMR). Refresh the browser and the newest client code runs
  immediately; client-plane staleness dies at reload. That is why the v0.3.8 SVG render toggle was
  visible and clickable: the client half *was* refreshed.
- **Host half (`lib/index.js`)** — imported **once by the DSH host process at boot**. Its asset route
  (`/dsh-file-trace/asset`) and the `CONTENT_TYPES` extension whitelist are registered into the running
  host's module registry and router at that instant. A running host process never spontaneously re-reads
  `lib/index.js`; the link-installed repo's push updated the *file on disk*, not the *loaded module
  graph*. The release log states a host restart had NOT been performed in this session.

### 2.2 How the probes pin the staleness to the RUNNING host process

Three facts form an elimination triangle (`asset-route-probe.txt` + `lib-index-excerpt.js`):

1. **PNG probe → 200 `image/png`**: the route itself is registered and alive in the running host —
   this is not a missing route, not a server-level 404, not a dead plugin.
2. **SVG probe → 404 "unsupported image type"**: that error string is produced *inside* the handler's
   extension-whitelist branch — the executing handler's `CONTENT_TYPES` has no `svg` key.
3. **Shipped disk `lib/index.js` at v0.3.8 DOES contain `svg: 'image/svg+xml'`**: the release artifact
   is correct; the mirrors are correct.

Route alive + disk correct + svg still rejected ⇒ the code *executing in memory* predates the whitelist
change ⇒ the staleness is in the **running host process**, not in the release. Note the contrast with
§1: there the *artifact itself* was wrong and distribution perfect; here the *artifact is right* and the
*process* is wrong. Same-looking "the fix didn't arrive" symptom, opposite side of the ship boundary —
which is why the probe evidence, not the release log, decides it.

### 2.3 What makes a host-plane change effective — the exception to "plugins hot-update"

**A host process restart.** At boot the host re-imports `lib/index.js` and re-registers its routes,
middleware, and services against the new code. The usual "plugins hot-update" rule of thumb silently
covers only the **client plane**: the browser can re-fetch JS on every reload, but host-side
registration is **boot-time** — the live router keeps the old handler closures (which captured the old
whitelist), and the module registry caches the first import. There is no unregister/re-register of a
live route and no hot module swap for the host half; even an HMR-style patch would not dislodge
already-registered route closures. So after push + browser refresh, a release that touches
`lib/index.js` is only *half* live: client new, host at whatever booted. Post-release verification must
therefore probe the **running host** (PNG *and* SVG both 200), not the disk — and the release checklist
gains an explicit "restart host when the host half changed" step (§5.2 item 4).

---

## 3. Broken-image attribution

### 3.1 Where the corruption happened: the layer that produced the text

Three carriers of the same file's text disagree (`session-log-excerpt.txt`):

| Carrier | State |
|---|---|
| Source file on disk | **well-formed** (System.Xml XmlDocument load: no error) |
| Typed read result delivered to the caller | **clean** |
| Model-visible result block **persisted into the session log** | **corrupted** |

The persisted payload's line 232 = source line 232 up to `…stroke="#dde6ea" stro` **+** source line
247's tail (from the `0,1 821,730"…` arc-flag region; §4 of the excerpt writes "from `0 0,1 821,730`
onward" — the literal stored line is authoritative), and **source lines 233–247 are entirely absent**.
The XML verdict on the payload: NOT well-formed — "Specification mandates value for attribute
`stro0`", line 233 col 54: the parser tokenizes the attribute name as `stro0` (it stops at `,`, which
is not a valid XML NameChar) and then demands the mandatory `=`. A re-read of the same region
afterwards came back **clean** — the corruption is non-deterministic.

⇒ The corruption was introduced in the **result-text assembly / session-log persistence layer** — the
layer that produces the model-visible result block — **upstream of the plugin** and parallel to (not
inside) the typed result path. The splice landing exactly on the shared prefix `stro` is the signature
of a line-diff/incremental-append routine mis-merging a chunk boundary on prefix equality. The plugin's
broken image is a *faithful rendering of unfaithful input*: it rendered from this corrupted persisted
payload; rendering the (well-formed) disk bytes succeeded. Neither the traced file nor the plugin's
render code produced the defect.

### 3.2 Why the plugin must treat the session payload as untrusted rendering input

The session payload is a **copy** that traversed serialization, result-text assembly, and
zstd-compressed persistence with no end-to-end integrity guarantee — this incident proves it can be
silently corrupted mid-file, and that the corruption is non-deterministic (a re-read is clean, so the
consumer can never tell *which* copy is safe by luck). "It came from our own session log" is
**provenance, not validation**: the plugin must (a) prefer authoritative disk bytes, (b) run an XML
well-formedness gate (DOMParser + `parsererror`) before rendering any payload text (§4), and (c) treat
it as untrusted in the *security* sense too — SVG is XML that can carry `<script>` and event handlers,
so even a well-formed payload needs containment (sandboxed iframe / `<img>` context), never naive
injection into the app DOM.

### 3.3 Why editing or "repairing" the traced file would have been the wrong move

- **The file is innocent** — the disk copy is well-formed; "repairing" it would corrupt correct
  authoritative data and break every *other* consumer of that file.
- **It rewrites the evidence to fit the wrong hypothesis** ("the file was broken"), destroying the
  disk-vs-payload-vs-reread differential that pins the bug to result-text assembly.
- **The upstream bug survives**: the splicing defect is file-agnostic and non-deterministic — it will
  corrupt the next payload too, and not only SVGs (code, configs, logs), polluting model context,
  replays, and audits. Papering over one file hides a systemic defect.
- **Correct move**: re-read from disk (authoritative), preserve the corrupted persisted block intact as
  forensic evidence, render only validated sources (§4), and **report the upstream text-corruption bug**
  to the harness maintainer with decoded-frame evidence (§5).

---

## 4. Defensive render chain (design + justification per level)

Render-source order for the SVG preview:

**Level 1 — disk bytes via the host asset route.**
`GET /dsh-file-trace/asset?path=…` → render the `image/svg+xml` response (blob/`<img>`/iframe src).
*Justification*: the disk is the authoritative source; the route serves fresh bytes end-to-end, immune
by construction to session-log corruption, with the correct MIME for native rendering. (In this very
incident level 1 returned 404 — the stale host of §2 — which is precisely why the chain must degrade
gracefully through levels 2–4 and why the error state must *name* the cause instead of dying silently.)

**Level 2 — session payload, only after an XML well-formedness check.**
If the asset route is unavailable, take the persisted read-result text and run
`new DOMParser().parseFromString(text, "image/svg+xml")` (or `application/xml`), then **inspect for a
`parsererror` node** — DOMParser never throws, so an unchecked parse silently yields a garbage document
— and verify `documentElement.tagName === "svg"`. Render only on pass, still contained (blob/data URL in
`<img>` or the level-3 iframe). When both sources are reachable, cross-check
`sha256(payload) === sha256(disk bytes)` and prefer disk on mismatch.
*Justification*: the payload is a possibly-corrupted copy (§3); the parsererror gate converts exactly
this incident's splice into a **caught, reportable state** (the .NET/libxml verdicts in §5.1 show the
gate fires at line 232–233 col 54) instead of a broken image; the check costs one parse.

**Level 3 — sandboxed iframe as the last render fallback.**
`<iframe sandbox srcdoc={svgText}>` (or a blob: URL) with a token list that **omits `allow-scripts`**
(and never combines `allow-same-origin` with `allow-scripts`): scripts blocked, no parent-DOM/origin
access, while **declarative SMIL animations still run** (SMIL is part of XML rendering, not scripting),
preserving preview fidelity under hard containment.
*Justification*: even well-formed SVG is active content (`<script>`, `onload=`, `foreignObject`);
the sandbox is the last containment boundary when level 1 is down and level 2's text passed validation —
show something safe, or fall through to level 4.

**Level 4 — explicit error state, never a silent broken image.**
If every source fails: render a visible error card carrying the reason and diagnostics —
"asset route 404 'unsupported image type' → host process likely stale, restart host" /
"session payload failed XML validation: line 232 col 54, ',' where '=' expected" /
"payload ≠ disk hash → rendered disk bytes" — plus remediation actions (re-read, restart-host hint,
report-upstream link).
*Justification*: a broken `<img>` icon is silent and informationless — the user cannot distinguish a
whitelist 404 (stale host), malformed XML (corruption), or a network failure. This incident's entire
diagnosis *was* that distinction (PNG 200 / SVG 404 / disk greps / parse verdicts); the error state is
the UI equivalent of those probes — it surfaces the failing layer, carries the parsererror excerpt, and
points at the fix. Silent fallbacks convert engineering bugs into user confusion.

---

## 5. Forensics method + prevention

### 5.1 Decoding the concatenated-zstd session-log generation file frame by frame

The session log is a **generation file**: each append/generation epoch is compressed as its own zstd
frame — magic `0xFD2FB52F`, bytes `28 B5 2F FD` — and frames are concatenated. Procedure (validated
in this cell on a synthetic replica built to the fixture's exact corruption shape, since the fixture
ships the decoded excerpt only: see `forensics-demo/`, all fixture access read-only):

1. **Locate frame boundaries**: scan the raw bytes for every magic offset (replica: offsets 0, 144,
   1133). For adversarial robustness, parse each frame header/content-size or verify each candidate
   slice actually decompresses, since compressed data could theoretically mimic the magic.
2. **Slice and decompress each frame independently** (`zstd -d frame_i` / per-slice library call).
   Each frame = one generation epoch ⇒ the frame index gives the **timeline attribution** of when a
   block was persisted (replica: the corrupted read-result sits in frame 1/gen 2; the clean re-read in
   frame 2/gen 3).
3. **Do not trust a single decode call**: CLI `zstdcat`/`zstd -d` transparently continues across
   concatenated frames, but library decoders may stop at the first frame boundary — in the replica,
   Node 24 `zlib.zstdDecompressSync(wholeBuffer)` returned **only frame 0** (206 of 2195 bytes).
   Frame-by-frame slicing is mandatory for complete recovery and per-generation attribution.
4. **Recover the exact stored text**: parse the decoded JSONL events, extract the read-result `text`
   byte-for-byte, write it out unmodified — that is the evidentiary payload.
5. **Adjudicate with hashes and XML verdicts**: sha256(stored payload) vs sha256(disk bytes) vs
   sha256(later re-read frame); run an XML validator over each (System.Xml XmlDocument /
   `xmllint --noout` / DOMParser) and record verdict + error line/col. Replica results: disk
   well-formed; gen-2 payload NOT well-formed at line 232 col 54 ("',' is an unexpected token. The
   expected token is '='" — the .NET dialect of the fixture's libxml verdict "Specification mandates
   value for attribute `stro0`" at line 233 col 54: same column, same defect, +1 line offset
   consistent with a header line atop the persisted block); gen-3 re-read well-formed and
   hash-identical to disk (`4ac6188a…62ad`; corrupted payload `f2ce0920…e70e`).
6. **Splice analysis**: longest common prefix of payload line vs source line 232 = 52 chars ending
   exactly at `…stroke="#dde6ea" stro`; the remainder is a verbatim tail of source line 247 (from col
   35); lines 233–247 absent — the shared-prefix splice signature of an upstream result-text assembly
   bug, not of any writer of the file.

This is what turns an anecdote ("the image looked broken") into evidence: exact stored bytes, exact
generation, exact splice point, exact parse error, exact hash differentials — an upstream bug report
the maintainer can act on.

### 5.2 Release-checklist items this incident adds

1. **Version-bump-before-build** — enforce the order in the release script (bump → build → verify →
   commit → tag → push); refuse release builds from a pre-bump tree; prefer a CI clean-room build from
   the tagged commit so artifact ≡ tag by construction.
2. **Grep the shipped bundle for the baked constant** — `PLUGIN_VERSION` in `lib/client.js` must equal
   `package.json.version` (§1.6), plus the `newerTag(ownVersion) === undefined` smoke test. Runs
   between build and push; would have caught v0.3.7 before it ever left the machine.
3. **Per-mirror tag SHA verification — keep, but never alone** — `git ls-remote --tags` on
   origin/public/omdsh all equal (they were equal here, and proved nothing about artifact freshness);
   pair it with a **per-mirror content check**: fetch each mirror's served bundle and grep the baked
   constant there too.
4. **Host-plane activation step** — any release touching `lib/index.js` (routes, whitelists, services)
   requires a **host restart**, then a post-release probe of the *running* host (PNG **and** SVG → 200);
   disk state and browser refresh are not evidence of host-plane liveness (§2).
5. **Report the upstream text-corruption bug; do not paper over it in the plugin** — file the
   result-text-assembly splice bug with the harness maintainer, attaching the decoded-frame evidence
   (§5.1). The plugin-side validation of §4 is *containment*, not a fix: the same assembler bug
   silently poisons every other consumer — model context, session replay, audits — until fixed at the
   source, and "repairing" individual files destroys evidence while corrupting good data (§3.3).

---

## Appendix A — Evidence index

Fixture (read-only, hashes verified unchanged): `README.md` (evidence map) · `release-log.md` (operation
order, symptoms) · `git-tags.txt` (three-mirror ls-remote, identical SHAs) · `package.json` (v0.3.8
manifest) · `client-bundle-excerpt.js` (shipped `PLUGIN_VERSION="0.3.6"` + `newerTag`) ·
`asset-route-probe.txt` (PNG 200 / SVG 404 after confirmed client refresh, host not restarted) ·
`lib-index-excerpt.js` (disk whitelist including `svg: 'image/svg+xml'`) · `session-log-excerpt.txt`
(decoded payload splice, disk region, XML verdicts, corruption shape).

Demo artifacts (synthetic, under `forensics-demo/`): `session-gen-demo.zst` (3-frame concatenated-zstd
replica) · `source-daigo-bicycle.svg` · `expected-corrupted-payload.txt` ·
`decoded-frame1-gen2-read-result.txt` / `decoded-frame2-gen3-read-result.txt` · `decode-summary.json` ·
`forensics-findings.md`.

## Appendix B — Boundary compliance

Fixture untouched (sha256 manifest match before and after) · all writes under
`/app/agent-output/S19-phantom-update-stale-host/` · no git operations · no external network access ·
no migrations or installations executed.
