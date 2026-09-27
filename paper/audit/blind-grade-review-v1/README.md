# Blind grading review v1 — prepared packet (human review NOT started)

This directory is a **prepared, frozen packet** for the human grading review
described in work-plan §3 (*已有答案评分复核*). It exists so that the
sampling and blinding decisions are fixed in advance of any review. It is
not a review, and it reports no findings.

| Field | Value |
|---|---|
| `humanReviewStatus` | `not-started` |
| `humanReviewsSubmitted` | `0` |
| Tasks sampled | 16 |
| Answers in packet | 32 (1 per task per arm) |
| Seed | `20260916` |
| Round rule | prefer round 2, else deterministic round 1 → round 3 |
| Blinding | **metadata-blinded + word-level masking — content blinding is imperfect** |

## Layout: what reviewers get vs. what stays with the coordinator

- `reviewer-packet/` — **the only thing a reviewer receives** (hand it over
  as a zip; do not give repository access). Self-contained: `README.md`,
  `rubric.md`, `answers/R001.md` ... `answers/R032.md` (masked), `tasks/T01/`
  ... `tasks/T16/` (brief + read-only fixture, pinned to the dataset commit),
  and blank `reviewer-a.csv` / `reviewer-b.csv`. It contains no arm, score,
  round, source path, or source hash, and never points outside itself.
- `coordinator/` — **coordinator-only; unblinds the packet**:
  `sample-manifest.json` (design, strata, deltas, masking rules, task-material
  pin), `coordinator-map.json` (review id → arm, round, source path + sha256,
  packet sha256, original score), `masking-log.json` (every masked span), and
  `README.md` (masking summary, no-skill cue follow-ups, design disclosures).

Reviewers must not run `npm run generate:blind-grade-review` or the script
behind it: the seed and sampler are committed, so running it rebuilds the
unblinding map. Likewise a reviewer with repository access could locate an
answer's source by text search; blinding assumes they only have
`reviewer-packet/`.

## What "blinded" means here, exactly

Reviewer-facing files show anonymous ids (`R001`--`R032`) and neutral task
labels (`T01`--`T16`) with no arm or condition label, no model name, no
original score, no judge verdict, no delta, and no historical interpretation.
The anonymous order is fixed by a seeded shuffle and is independent of answer
content and of every assessment.

Answer text is **masked, not verbatim**: a deterministic set of lexical rules
(`coordinator/sample-manifest.json` → `masking.rules`) replaces explicit
references to the injected skill — its name, `SKILL.md` / `references/` card
file paths and names, its mode vocabulary ("Mode A · inspect"), local
checkout paths containing the skill repository name, and the word "skill"
used as a tool reference — with `[redacted]`. The same rules run on both
arms; the plugin-manifest sense of "skill name" / "skill provider" is task
content and is kept. Every replacement is logged per answer in
`coordinator/masking-log.json`, and packet hashes are recorded next to the
source hashes in `coordinator/coordinator-map.json`.

**This is not a double-blind review and must never be described as one.**
Masking is word-level: style, structure, paraphrased references to reference
material, and the density of `[redacted]` tokens can still reveal the arm.
The same underlying problem appears twice in the packet (once per arm), and
the sample is drawn from tasks already used in the historical analysis, so a
reviewer familiar with the benchmark may recognise a task.

## Design disclosures

- **No regression stratum in practice.** 0 of 22 pool tasks have a
  negative median delta, so the 3 pre-declared "negative" slots were filled
  by the fixed nearest-stratum rule with zero-delta tasks (achieved strata:
  positive 7 / zero 9 / negative 0).
- **No sampled pair comes from a round the skill arm lost.** In the round
  each pair was taken from, with-skill scored higher in 6, tied in 10,
  and scored lower in 0 pairs. The review can therefore not check how
  skill-arm regressions were graded, and must say so when reported.
- **Possible no-skill contamination.** Some no-skill answers trip the
  masking rules (e.g. one cites "the skill's version index", another a
  "plugin-upgrade pre-flight procedure"; two quote a local checkout path
  containing the skill repository name). They are masked like every other
  answer and listed in `coordinator/README.md` for coordinator follow-up
  before any result is reported.

## Scientific boundary

- The packet was frozen before any human review. It contains no ratings, no
  agreement statistics, and no consensus, and none may be fabricated.
- A completed review is a small-sample check of grading, not an overall
  validity certificate for the benchmark, and a subsample mean must not be
  reported as the population gain.
- Stratified selection by historical gain is a deliberate design choice and
  must be disclosed wherever the resulting review is reported.
- The targeted, non-blind AI review proposed in PR #240 is a separate
  activity. It is **not** human validation and must not be reported as such;
  a second model acting as judge is at best a sensitivity analysis.
- Preparation used no model calls: this packet was generated by a local
  deterministic script from already-committed artifacts.

## Regenerating / verifying (coordinator / maintainers only)

```bash
npm run generate:blind-grade-review   # rebuild the packet
npm run validate:blind-grade-review   # leakage + integrity checks
npm run test:blind-grade-review       # focused unit tests
```
