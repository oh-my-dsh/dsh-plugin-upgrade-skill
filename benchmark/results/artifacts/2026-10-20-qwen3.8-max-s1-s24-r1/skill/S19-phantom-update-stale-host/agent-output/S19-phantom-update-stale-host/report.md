# S19 · The Phantom Update, the Stale Host Half, and the Corrupted Payload — Diagnostic Report

**Mode**: plugin-upgrade Mode A (inspect, read-only). Subject: `@dsh-external/dsh-file-trace` v0.3.7 / v0.3.8, release session 2026-09-05.
**Evidence base**: `/app/fixture/` (read-only, unmodified): `release-log.md`, `package.json`, `git-tags.txt`, `client-bundle-excerpt.js`, `lib-index-excerpt.js`, `asset-route-probe.txt`, `session-log-excerpt.txt`, `README.md`.
**Skill references used** (key points and IDs only): plugin-upgrade `troubleshooting.md` (the three S19 symptom rows), `migration-hygiene.md` §3 (client hard-refresh vs host restart), `pre-flight.md` §1.5 (ghost host: ask the process, not the disk) + `scripts/ghost-host-check.mjs`, card DSH-0.1.7-A2-04 (client bundles cached at host boot), card DSH-0.1.5-A1-20 (post-upgrade combo/roster mismatch, host restart self-heals), SKILL.md Mode C step 6 (packed artifact must carry the plugin version) and the host-restart discipline in "Global DSH host upgrades" (a browser refresh is not a host stop).

---

## 1. Phantom self-update: the released v0.3.7 announces "新版本 v0.3.7 可用" to itself

### Where the compared version constant comes from: build time, not runtime

The self-update check in the shipped client bundle (`client-bundle-excerpt.js`, verbatim from `lib/client.js` at tag v0.3.7) is:

- `export const PLUGIN_VERSION = "0.3.6"` — **inlined by tsdown from `package.json` at build time**. The comment in the bundle is explicit: "it is not read dynamically at runtime."
- `newerTag(latestTag)` returns `latestTag` iff `compareSemver(latestTag, PLUGIN_VERSION) > 0`; `latestTag` comes from a **runtime** `git ls-remote --tags` against the three mirrors (no auth), picking the highest `vX.Y.Z`.

So the comparator has one runtime side (mirror latest tag) and one frozen build-time side (the baked constant). After the release, the runtime side correctly returned `v0.3.7` (`git-tags.txt`: all three mirrors list v0.3.7 at SHA `748b5e56…`), while the frozen side still said `0.3.6`. `0.3.7 > 0.3.6` → badge. The plugin is not "seeing a newer release somewhere" — it is misidentifying **itself** as the older release.

### The actual operation-order mistake

From `release-log.md` (v0.3.7):

| Time | Step | Problem |
|---|---|---|
| 16:22 | `pnpm run build` — client bundle emitted | **build ran while package.json still said 0.3.6** → `PLUGIN_VERSION = "0.3.6"` baked into `lib/client.js` |
| 16:23 | bump `package.json` 0.3.6 → 0.3.7 | bump landed **after** the build; nothing rebuilt |
| 16:24 | `git commit` (includes the already-built `lib/client.js`) + `git tag v0.3.7` | the tag now points at a bundle that self-identifies as 0.3.6 |
| 16:25 | push main + tag to origin/public/omdsh; tag SHA verified on all three | distribution was perfect — of a defective artifact |

The mistake is **build-before-bump**. The v0.3.8 log confirms the corrected order was adopted afterwards ("bump FIRST, then build"). This matches the troubleshooting.md S19 row: the badge appears because the bundle carries the previous version's constant, not because any mirror is wrong.

### Why mirror/tag integrity is irrelevant here

The per-mirror `git ls-remote` verification and identical tag SHAs prove the **distribution side** is consistent: every mirror serves exactly the tagged commit, and the update check's "latest available" input (v0.3.7) is correct. The defect is entirely inside the shipped artifact's **content** — the stale "current version" operand of the comparison, which never touches the mirrors at all. Even a single, perfectly synchronized mirror would produce the identical phantom badge. Integrity checks answer "did everyone get the same bytes?"; this bug is "the bytes themselves lie about their version." Diagnosis order lesson: when a self-referential update badge appears, diff the baked constant against the tag **before** auditing mirrors.

### Corrected release order

1. Edit source, run typecheck + tests (as done at 16:21).
2. **Bump** `package.json` version (0.3.6 → 0.3.7) **first**.
3. `pnpm run clean` (stale incremental build caches are a known false-positive source — migration-hygiene §1), then `pnpm run build`.
4. **Artifact gate**: grep the freshly built `lib/client.js` for the baked constant and assert it equals the new version (see below); also assert the packed manifest carries the same plugin version (SKILL.md Mode C step 6).
5. Commit (source + rebuilt bundle), tag `v0.3.7`, push to all mirrors.
6. Verify tag SHA per mirror (`git ls-remote --tags` on origin/public/omdsh — keep this; it cheaply eliminated the mirrors as suspects).
7. Post-release smoke: load the released build and assert the plugin offers **no** update to itself (`newerTag("v0.3.7")` with `PLUGIN_VERSION === "0.3.7"` → `undefined` → no badge).

### The check that would have caught it before pushing

A one-line artifact grep in the release script / CI, run **after build, before commit/tag/push**:

```sh
node -e '
  const fs = require("fs");
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const bundle = fs.readFileSync("lib/client.js", "utf8");
  const want = `PLUGIN_VERSION = "${pkg.version}"`;
  if (!bundle.includes(want)) { console.error("stale baked constant:", want, "missing"); process.exit(1); }
'
```

On the actual v0.3.7 artifact this fails loudly (`PLUGIN_VERSION = "0.3.6"` ≠ 0.3.7). Equivalent manual form: `grep -n 'PLUGIN_VERSION =' lib/client.js` and eyeball it against the tag about to be created. Because the failure was only caught post-push, remediation needed an amend + rebuild + **force-moving a published tag on all three mirrors** — a last-resort move (any consumer that already fetched the old tag keeps a divergent SHA); with the pre-push grep gate that risk never arises, and if a phantom badge is ever discovered post-push, shipping a corrected new version is safer than rewriting a published tag.

---

## 2. Client vs host plane asymmetry: new toggle in the browser, 404 from the host route

### Where each half's code is loaded, and when

`@dsh-external/dsh-file-trace` is a dual-plane plugin (link-installed repo; the disk copy at the install location is the repo tree itself):

- **Client half (`lib/client.js`)** — loaded **in the browser**. The Web client re-fetches client plugin bundles on page load (no-cache re-fetch in the incident's DSH generation), registers them via the module loader, and mounts the UI. A browser refresh therefore picked up the new v0.3.8 bundle immediately: the SVG render toggle appeared and was clickable. This is the observable "client half is refreshed."
- **Host half (`lib/index.js`)** — loaded **once, inside the long-running host Node process**, at plugin apply / host boot. At that moment the asset route is registered and its handler closure captures the `CONTENT_TYPES` whitelist from the imported module. Nothing re-reads or re-imports `lib/index.js` per request; Node's module cache and the already-registered route hold the boot-time copy until the process exits. The release log confirms: **no host restart had been performed in this session** — the running process was booted before the SVG whitelist change landed on disk.

### How the probe triple pins the staleness to the RUNNING process, not the release

From `asset-route-probe.txt` (probes executed after the browser refresh was confirmed, host not restarted):

1. **PNG → 200 `image/png`**: the route `/dsh-file-trace/asset` exists, is registered, and serves — so the 404 is not a missing route, not an auth/path failure, not a dead host half.
2. **SVG → 404 "unsupported image type"**: the error text is the whitelist rejection branch — the running handler's extension lookup did not find `svg`.
3. **Disk `lib/index.js` DOES contain `svg: 'image/svg+xml'`** (`lib-index-excerpt.js`, verbatim at tag v0.3.8): the released and installed artifact is correct.

A correct release + a live route + a rejection that only the **in-memory** whitelist can produce ⇒ the discrepancy lives between disk and process memory. The running host process predates the change: a textbook **ghost host** (pre-flight §1.5 — "ask the process, not the disk"; a process started before the checkout's last change is still executing old code while every on-disk marker reports the new version). The PNG/SVG probe pair is exactly the recommended classification technique: one request whose behavior diverges between generations, answered by the process itself — never by reading version strings. `scripts/ghost-host-check.mjs` packages the check (process start time vs checkout last change, argv → checkout resolution, optional wire probe; exit 1 = ghost).

### What makes a host-plane change effective — and why "plugins hot-update" fails here

**A full host restart**: completely stop the dsh host process(es), start `dsh web` again, then re-probe (SVG must answer 200 `image/svg+xml`). A browser refresh is *not* a host stop (SKILL.md, "Global DSH host upgrades"); only process exit + re-boot re-imports `lib/index.js` and re-registers the route with the new whitelist. Migration-hygiene §3 states the rule plainly: a change landing in `lib/client.js` takes effect on a browser hard refresh; a change landing in `lib/index.js` requires restarting dsh.

Why this is the one case where the usual "plugins hot-update" rule does not hold: that rule of thumb is generalized from the **client plane**, where the artifact is a document the browser re-fetches on every load — "updating" is just serving new bytes to a fresh fetch. The host half is not re-fetched by anything; it is code loaded once into a live process whose route registrations and closures are boot-time state. Link/junction installs sharpen the trap: editing the repo tree updates the disk copy instantly (and the client half on next refresh), creating the illusion that the host half "should" be live too.

Two version-window caveats worth recording:

- Since **DSH-0.1.7-A2-04**, client bundles are read and cached **at host boot** — editing a served `lib/client.js` no longer takes effect on refresh alone, and auto-reconnect lets an open page keep running pre-restart client bytes. The asymmetry of the 2026-09-05 session (client hot, host cold) narrows in newer hosts toward "everything needs a host restart"; the verification discipline is the same either way: check the **served** bytes/behavior, not the disk.
- **DSH-0.1.5-A1-20** documents the adjacent failure: an in-place upgrade can serve a client combo that omits newly added bundle modules, breaking every client plugin's registration; a host restart self-heals. Same lesson: after any in-place artifact change, restart the host before believing a probe.

---

## 3. Broken-image attribution: the session payload was corrupted upstream, not the file

### The three-way evidence (`session-log-excerpt.txt`, decoded from the session's concatenated-zstd generation file)

| Artifact | Verdict |
|---|---|
| Source SVG on disk (read separately) | **Well-formed** — `System.Xml XmlDocument` load: no error; lines 232–247 all present and structurally intact |
| Read-result TEXT as persisted in the session log (payload around line 232) | **NOT well-formed** — "Specification mandates value for attribute stro0"; payload line 232 = source line 232 truncated at `…stroke="#dde6ea" stro` **spliced with** source line 247's tail from `0 0,1 821,730` onward; source lines 233–247 (15 lines) absent |
| Re-read of the same region afterwards | **Clean** → the corruption is non-deterministic, not a persistent property of the file or the store |

### Where the corruption happened

The splice lands exactly on a shared prefix (`stro` — the head of `stroke-width…` on line 232 vs the `…0 0,1 821,730` arc-flag text of line 247): a chunk-assembly/buffer-splice signature (two text fragments joined at a common prefix, middle dropped), not truncation, not storage bit-rot, not an XML authoring error. Critically, the excerpt records that the read tool's **delivered TYPE result to the caller was clean**, while the **model-visible result block persisted into the session log** was corrupted. Disk clean + delivered result clean + persisted payload corrupt + re-read clean ⇒ the corruption was produced in the **result-text assembly/persistence layer of the session pipeline — upstream of the plugin**, at the moment that one read-result block was composed for the log. The plugin then did what it was designed to do: rendered the SVG text it was given. Malformed XML in an `<img>`/`<image>` context renders as a broken image — the broken picture is a faithful display of unfaithful input.

### Why the plugin must treat the session payload as untrusted rendering input

The payload is third-party-produced text: it passed through a result-assembly and persistence pipeline that this incident **proved** can corrupt text non-deterministically, and the plugin cannot observe or bound that pipeline's failure modes. Rendering it directly as SVG means injecting unvalidated external text into the DOM — SVG is an active format (scripts, event handlers, external references), so the trust boundary matters for security as well as correctness. Discipline: any session-payload text used as render source must pass an XML well-formedness check (`DOMParser` + `parsererror`, §4 Level 1) before it reaches the DOM, and disk bytes are preferred whenever available because their provenance is stronger.

### Why editing/"repairing" the traced file would have been the wrong move

1. **The file is not broken.** It parses clean, re-reads clean, and is the user's authoritative source. "Repairing" it would corrupt good data to match a phantom — destroying user content on the basis of a transport-layer artifact.
2. **It fixes nothing.** The plugin rendered from the session payload; the persisted payload stays corrupt whether or not the disk file is edited, so the broken image (for that render path) persists — while a new, real corruption of the source is introduced.
3. **It destroys the evidence and misattributes the defect.** The spliced payload vs clean disk diff is precisely what localizes the bug to upstream result-text assembly. Overwriting the file erases the comparison baseline and re-labels an upstream pipeline bug as "bad user SVG," guaranteeing the real bug (non-deterministic, therefore recurring — and a data-integrity risk for every consumer of session logs, not just this plugin) never gets reported.
4. **Correct move**: render from disk bytes (§4), and file the upstream bug with the decoded frame evidence (§5). Plugin-side validation is mitigation; the fix belongs in the layer that produced the corrupt text. This is the troubleshooting.md S19 payload-corruption row verbatim in substance: 上报上游，而不是在插件里「修文件」.

---

## 4. Defensive render chain for the SVG preview (render-source order + justification)

```
Level 0  disk bytes via host asset route  ──(unavailable / 404)──▶
Level 1  session payload, ONLY after DOMParser well-formedness check  ──(parsererror)──▶
Level 2  sandboxed iframe render fallback (scripts blocked, SMIL still runs)
Level 3  explicit error state — never a silent broken image
```

**Level 0 — disk bytes through the host asset route (primary source).**
`GET /dsh-file-trace/asset?path=…` streams the file **as read from disk at request time** with the mapped content-type (`svg → image/svg+xml`). Justification: the disk file is the authoritative artifact; these bytes never transit the session result-assembly pipeline, so the §3 corruption class cannot reach the renderer, and no text re-serialization (encoding, newline, chunk-splice) can occur en route. Preconditions this incident exposed: the running host must be a generation whose whitelist includes svg (restart discipline, §2 — the route should be smoke-probed after any host-half deploy), and the route must keep its path authorization (serve only traced-workspace paths) plus `X-Content-Type-Options: nosniff`. If the route answers 404 for a type the disk whitelist supports, that is the ghost-host signature — surface it as such instead of silently falling back.

**Level 1 — session payload only after an XML well-formedness check.**
When the asset route is unavailable (file moved, host half stale, remote session), the payload text may serve as render source **only after** `new DOMParser().parseFromString(text, "image/svg+xml")` returns a document without a `parsererror` node (and the root is `<svg>`). Justification: the payload is demonstrated-corruptible untrusted input (§3); parsing before rendering converts a silent broken image into a detectable validation failure, and DOMParser does not execute scripts during the parse, so the check itself is safe. On `parsererror`: do not render the payload; capture the failing text and the parse error as forensic evidence, and proceed to Level 3. When both sources are available and differ, render disk and flag the divergence — that warning *is* the upstream-corruption detector.

**Level 2 — sandboxed iframe as the last render fallback.**
Validated SVG markup is rendered inside `<iframe sandbox>` **without** `allow-scripts` (and without `allow-same-origin`, so the frame is an opaque origin): script execution is blocked, while declarative SMIL animations still run, preserving the preview's purpose for animated SVG. Justification: defense-in-depth against SVG-borne active content that well-formedness alone does not neutralize (`<script>`, `onload=` handlers, external entity/reference tricks) — well-formed ≠ safe; the frame also isolates the SVG's CSS/layout from the host page. It sits last because it renders already-validated markup with the strongest containment, and because same-document inline rendering (Levels 0/1 via `<img>`/`<image>`) is cheaper when the source is trusted or validated.

**Level 3 — explicit error state, never a silent broken image.**
If Level 0 is unavailable and Level 1 fails validation, the UI renders a visible error card naming the failure ("asset route 404: unsupported image type — host may need restart" / "session payload failed XML validation at line N: …"), with the offending source snippet behind a toggle. Justification: a broken-image glyph conflates network failure, whitelist rejection, host staleness, and payload corruption into one indistinguishable pixel — precisely the ambiguity that made this incident a three-symptom puzzle. An explicit, reason-carrying state turns user reports into actionable diagnostics, keeps the forensic signal intact, and fails loudly instead of shipping a wrong picture.

---

## 5. Forensics method + prevention

### Decoding the session log frame-by-frame (read-only, on a COPY)

The session log is a **concatenated-Zstandard generation file** (JSONL records inside zstd; modern hosts name it e.g. `session.v4.jsonl.zstd` — v0.2.0-rc.1 field note; record shapes per Session-log V4, card set v0.1.7-alpha.1: plugins parsing raw logs must re-check V4 shapes, and hosting-side reads via host services keep the format version an implementation detail). Appended generations seal successive zstd frames, so the file is a **sequence of frames whose decompressed outputs concatenate into one JSONL stream**:

1. **Copy the log file out first** (evidence discipline: never modify or lock the original; extract only the minimal region under investigation — session logs can carry sensitive content and must not be published whole).
2. **Decode all frames.** The zstd CLI handles concatenation natively: `zstd -dcf session.vN.jsonl.zstd > decoded.jsonl`. A naive single-frame decoder stops at the first frame boundary and silently drops later generations — that is why frame-by-frame matters. To be explicit (or when a frame is damaged and the rest must still be recovered): scan the byte stream for the zstd magic `28 B5 2F FD`, split at frame boundaries, decode each frame independently (`zstd -d --single-frame` per part, or Python `zstandard`'s stream reader / `decompressobj` looped over frames), then concatenate the payloads in order. A corrupt frame costs only its own records, not the file.
3. **Locate the record.** Filter the JSONL for the tool-result record of the read of the traced SVG (by seq/timestamp/path): `jq -c 'select(…)' decoded.jsonl`.
4. **Extract the stored text verbatim** (JSON-unescape the result-text field) into `payload.svg`. This is the exact persisted text — the ground truth of what the session log claims the read returned.
5. **Adjudicate the three artifacts**: XML well-formedness on `payload.svg` vs the disk source (`xmllint --noout` / DOMParser / XmlDocument), then a line diff (payload vs disk) to characterize the damage — here: line 232 truncated at the shared prefix `stro`, line 247's tail spliced on, lines 233–247 absent.
6. **Localize the layer**: disk clean ∧ delivered result clean ∧ persisted payload corrupt ∧ re-read clean ⇒ result-text assembly/persistence, upstream of the plugin (§3). Repeat the read a few times to establish (non-)determinism.
7. **File the upstream bug** with: decoder + commands used, the frame/record coordinates, the verbatim corrupt text, the clean disk baseline, the splice characterization, and the non-determinism observation. This is what "turns an anecdote into evidence."

### Release-checklist items this incident adds

1. **Version-bump-before-build.** Release order is: bump `package.json` → clean → build → verify → commit → tag → push. Build output frozen before the bump ships a lying `PLUGIN_VERSION` (§1).
2. **Grep the shipped bundle for the baked constant.** Pre-push artifact gate: assert `lib/client.js` contains `PLUGIN_VERSION = "<pkg.version>"` (and that the packed manifest/packed filename carry the same plugin version — SKILL.md Mode C step 6). Source-level checks cannot catch this; only the artifact can.
3. **Per-mirror tag SHA verification.** Post-push `git ls-remote --tags` on every mirror (origin/public/omdsh); all SHAs identical. Keep it: it is cheap, and in this incident it conclusively eliminated distribution as a suspect, focusing the diagnosis on the artifact.
4. **Post-release self-badge smoke.** The just-released version must not offer an update to itself (`newerTag` of its own tag → `undefined`). One assertion kills the whole §1 failure class.
5. **Plane-aware activation before verification.** Host-half changes: fully restart the host, then probe the route behavior (PNG 200 / SVG 200) — never trust disk contents or a browser refresh; on DSH ≥ 0.1.7-alpha.2 (DSH-0.1.7-A2-04) the served client combo must likewise be verified after a restart, and ghost-host-check (pre-flight §1.5) can gate the verdict (process start time vs checkout change; behavior probe, not version strings).
6. **Report upstream text-corruption bugs; never paper over them in the plugin.** The payload-splice defect belongs to the session result-assembly layer: file it with decoded-frame evidence (§5). Plugin-side validation (§4 Levels 1/3) is defense-in-depth, not a substitute — and "repairing" a well-formed traced file to match a corrupt payload is prohibited (§3).

---

## Boundary compliance

- `/app/fixture/` inspected read-only; **zero bytes modified**; no migrations, installations, or lifecycle scripts executed.
- No writes outside `/app/agent-output/S19-phantom-update-stale-host/`; no git operations; no external network/services accessed; skill and evaluator untouched.
- Skill/reference citations are key points and card IDs only, per the task's context budget.
