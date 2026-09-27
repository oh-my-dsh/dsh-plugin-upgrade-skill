# Cross-family LLM judge panel v1

Re-judges all 64 focal reports (16 tasks × 2 arms × 2 repeats, 328 criterion
decisions) of `benchmark/results/artifacts/2026-09-15-glm-5.3-flash-unified-s16`
with judges from model families other than the GLM solver/judge. Purpose:
measure how much the paper's paired endpoint depends on the same-family
judge. **This is LLM judging, not human annotation, and must never be
reported as human or independent-annotator agreement.**

This protocol and the analysis plan below were written before any panel
verdict existed.

## Status (2026-09-24)

| Judge | Items | State |
|---|---:|---|
| `glm-5.3-flash` (original) | 64 | archived |
| `claude-opus-5-5` | 64 | complete, all valid on first attempt |
| `openai-gpt-5.5` | 64 | complete; all verdicts shape-valid |

Run `node paper/scripts/analyze-llm-judge-panel.mjs --check` to verify the
generated three-judge analysis and table against the stored verdicts.

## Design

- **Items.** `items/<id>.json` holds, per report, the unchanged
  `report-judge-v2` SYSTEM prompt and `judgeInput()` (task, instruction,
  rubric, frozen fixture/reference excerpts, citation audit, candidate
  report) — the same content the original judge received. Built
  deterministically by `node paper/scripts/prepare-llm-judge-panel.mjs`
  (`--check` detects drift).
- **Blinding.** Item ids are opaque hashes. Items contain no arm, repeat,
  original verdict, score, or review outcome. The mapping is only in
  `unblinding/key.json`, which judges must not open; its sha256 is pinned in
  `manifest.json`. Arm is not fully concealed: 18/32 with-skill reports
  mention the skill in their own text (the original judge faced the same
  content).
- **Independence.** Each judge works alone, without seeing the other panel
  judges' verdicts, `paper/`, `benchmark/results/`, or any review file. One
  item is judged at a time; the original protocol also judged one report per
  call.
- **Judges.**
  - `claude-opus-5-5` — fresh Claude Opus 5.5 subagents (Claude Code), 16
    subagents × 4 items (`manifest.json` `batches`; no subagent sees two
    answers to the same task). The orchestrating session prepared the items
    but did not judge them, and passed no outcome information to subagents.
  - `openai-gpt-5.5` — GPT-5.5 through one isolated Codex CLI session,
    following [`JUDGE-INSTRUCTIONS.md`](JUDGE-INSTRUCTIONS.md) in sorted item
    order. The operator had seen manuscript context before reading the
    blinding rule but passed no outcomes to the judge; `judge.json` records
    that exposure and the judge's directory-name-only listing. One session
    across 64 items may carry context between items, unlike the original
    per-report API calls.
  - Original `glm-5.3-flash` verdicts are the third family, read from the
    archived `scores/`.
- **Output.** `verdicts/<judge>/<id>.json`, shape
  `{"decisions":[...],"caps":[...]}` exactly as in the SYSTEM prompt, plus
  `verdicts/<judge>/judge.json` (model id, dates, independence declaration).
  Every file must pass `scoreDecisions()`; invalid output is re-requested for
  that item only, and every retry is logged in `judge.json`.

## Analysis plan (fixed before judging)

Run `node paper/scripts/analyze-llm-judge-panel.mjs`; it unblinds and writes
`paper/generated/llm-judge-panel.json` and `llm-judge-panel-table.tex`.

1. **Criterion agreement**, every judge pair, 328 decisions: exact agreement
   on credit level (pass=1, partial=0.5, fail/missing=0) and linearly
   weighted Cohen's κ on that ordinal scale.
2. **Cell scores**: mean absolute difference per report after caps.
3. **Endpoint sensitivity**: the paper's paired estimand (per-task mean
   with-skill − no-skill, repeats averaged first), 10,000-sample task-paired
   bootstrap with the paper's seed, recomputed under each judge and under
   the per-cell mean of all available judges. All rows are reported; none is
   chosen as the "true" score, and the original result stays the primary
   endpoint.
4. **Author-review reference**: agreement of each judge with the 56 decisions
   in the non-blind plugin-author review (10 answers). This is a reference
   point, not a gold standard.

No threshold turns these numbers into a pass/fail claim. A panel judge that
cannot finish all 64 items is reported as incomplete with its coverage.

## Scope limits

- Not human validation; not a substitute for the task-annotation-v1 protocol
  (`../task-annotation-v1/`), which remains not started and is future work.
- Shared-prompt, shared-rubric judging: agreement shows robustness to judge
  family, not rubric validity.
- Static diagnostic scoring only; no execution of repairs.
