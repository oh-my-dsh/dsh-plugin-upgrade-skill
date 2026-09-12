# S19 · The Phantom Update, the Stale Host Half, and the Corrupted Payload

Static, read-only. One release session, three interacting pitfalls:

1. **Phantom self-update** — the freshly released v0.3.7 shows the plugin's own update
   badge "新版本 v0.3.7 可用". The client bundle bakes the version constant at BUILD time;
   the maintainer bumped `package.json` AFTER running the build, so the shipped bundle
   compares "0.3.6" against the newest mirror tag (v0.3.7) and announces an update to
   itself. Mirror/tag integrity was verified and is irrelevant.
2. **Stale host half** — the v0.3.8 SVG render toggle appears in the browser (client half
   refreshed; the drawer even renders the new button), but Render 404s: the host half
   registers its web routes ONCE at boot, so the running process still serves the old
   asset whitelist. The probe pattern (PNG 200 / SVG 404 + the shipped `lib/index.js`
   whitelisting svg) pins the staleness to the running process, not the release. This is
   the one case where "plugins hot-update" does not hold: host-plane changes need a host
   restart.
3. **Corrupted session payload** — rendering through the session payload shows a broken
   image: the session log's read-result text spliced source line 247's tail into line 232
   at the shared prefix "stro" (source lines 233-247 gone), while the source file is
   well-formed XML and a re-read is clean. The corruption is upstream of the plugin
   (result-text assembly), so the plugin must treat the session payload as untrusted
   rendering input — validate, fall back to disk bytes, never "repair" the traced file.

Derived from a real 2026-09-05 release session of `@dsh-external/dsh-file-trace`
v0.3.7/v0.3.8 on Windows (bump-after-build phantom badge → amended re-release; SVG preview
404 until host restart; `stro0,1 821,730` payload splice diagnosed by decoding the
session's concatenated-zstd generation file).

- Type: static / read-only report

- See `instruction.md` for the brief, `solution/report.md` for the reference answer.

Run `npm run test:s19-judge` for the task-specific model-free verifier protocol checks. The
verifier only reads agent artifacts; it never installs counter-example or oracle reports
into the answer directory and does not require `/solution/`.

## Semantic verifier

- **Scoring**: baked version/release order, client-host asymmetry, payload corruption, validated render fallbacks, and forensics/prevention: 20 each; affirmative unsafe release/render advice caps at 0.
- **Boundary**: the separate verifier checks the complete fixture against sealed
  hashes; any edit, addition or deletion scores zero. Judge configuration, API or
  response failures exit nonzero with no reward, never a keyword fallback.
- **Oracle**: `harbor run -p benchmark/tasks/S19-phantom-update-stale-host -a oracle`
  requires judge configuration and grades the original reference report through
  the same LLM. Its score is not hardcoded.

Task version **4.1.0**, protocol `report-judge-v2`. Each criterion receives
100%/50%/0%/0% for pass/partial/fail/missing; code sums points and applies caps.
Set `REPORT_JUDGE_BASE_URL`, `REPORT_JUDGE_MODEL` and `REPORT_JUDGE_API_KEY`
for the verifier. The agent receives neither these credentials nor the sealed packet.

See the [rubric explanation](../../docs/diagnosis-rubrics.md) and
[setup/maintenance guide](../../docs/report-judge-pilot.md). Edit
`benchmark/report-judge/diagnosis-rubrics.mjs`, run `npm run sync:report-judge`,
then `npm run test:report-judge`. Historical keyword scores remain historical.
