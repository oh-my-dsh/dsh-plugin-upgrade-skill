# S18 · Terminal Sprite Render Trap

Static, read-only. A terminal pixel sprite (the dsh-TUI whale, 25x40 cells rendered with
half-block glyphs) shows phantom pixels along its right edges (outline, Z symbols,
hearts), ghost pixels surviving frame switches, and a drifted hand-ported frame; flipping
the animation feature default-on then hangs a channel-ui CI job until its timeout.

Derived from the real 2026-09-05 dsh-TUI whale follow-up session (tail-tip pixel drift,
half-block SGR background leak, trailing-trim ghosting, planner timer pinning a probe
host).

- Type: static / read-only report

- See `instruction.md` for the brief, `solution/report.md` for the reference answer.

## Semantic verifier

- **Scoring**: half-cell background, frame clearing, frame-data integrity, timer liveness, and renderer/rollout prevention: 20 each; affirmative contradictory renderer/timer advice caps at 0.
- **Boundary**: the separate verifier checks the complete fixture against sealed
  hashes; any edit, addition or deletion scores zero. Judge configuration, API or
  response failures exit nonzero with no reward, never a keyword fallback.
- **Oracle**: `harbor run -p benchmark/tasks/S18-terminal-sprite-render-trap -a oracle`
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
