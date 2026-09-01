# Calibration run · knowledge quiz + five static tasks (2026-09-01)

First with/without-skill measurement for the tasks added in #81 and #84, run by
the contributing team on their internal runner. **n=1 per arm** — the repository
protocol recommends 3 runs with the median; treat these numbers as an early
signal, not a benchmark result.

## Setup

- Agent: the team's internal harness agent (DeepSeek-v4-pro), headless, 40-turn
  cap, write tools enabled, isolated throwaway workspace per suite.
- Tasks: the knowledge quiz (T1, 5 sampled items) + the five static tasks
  (S4/S5/H6/S6/S7), same prompts as the Harbor versions, judged by the same
  keyword gates as the task judges (coarse sieve; content graded manually on
  the scoring rubrics in docs/scoring.md).
- **Without-skill arm**: empty workspace; prompts carry the closed-book clause
  ("no reference materials outside the fixture").
- **With-skill arm**: the repository's `skills/` tree mounted as directory
  skills inside the agent workspace (`skills/<name>/SKILL.md`), prompts
  unchanged.

## Results

| Task | Without-skill (sieve) | With-skill (sieve) | Without (content, manual) | With (content, manual) |
|---|---|---|---|---|
| T1 quiz (5 items) | fail (4/5 — T1-16 wrong) | **pass (5/5)** | 80% | 100% |
| S4-legacy-client-imports | fail (0/4 card IDs cited) | **pass** | ~75 (all 4 issues found, but fabricated "cards" cost points) | 100 |
| S5-negative-naming | fail (harness crash; report itself was conservative and correct) | **pass** | ~80 | ~90 |
| H6-remote-error-trap | fail (0/2 namespaced codes) | **pass** | ~87 (4/4 concepts, exact spellings marked unconfirmed) | 100 |
| S6-corridor-net-state | fail (0/2 card IDs) | fail (card IDs still not cited) | ~40 (deletes the defense, but producer semantics wrong, capability gap missed) | ~50–60 |
| S7-unpublished-cohort | fail (sieve only credits the overrides path) | **pass** | ~70 (correct semver analysis, chose the exact-pin path the sieve missed) | 100 |

Sieve pass rate: **0/6 → 5/6** (83%). Content level: the closed-book arm already
reasoned well (60–90%) but scored zero on repository vocabulary — card IDs,
namespaced error codes, the R-01 recipe. The mounted skill closes exactly that
gap.

## Findings

1. **The skill's net effect is the vocabulary, not the reasoning.** Without
   materials the agent identified every S4 touchpoint and every H6 concept but
   could not cite a single card ID or the namespaced codes; with the skill
   mounted all five static tasks pass the citation gates.
2. **T1-16 (`!!js` truthy-object trap) is the hardest quiz item.** Wrong in all
   three closed-book runs; right on the first run with the skill mounted — the
   answer lives in plugin-write's config-plugin reference.
3. **S6 resists skill usage.** Even with the skill mounted the agent answered
   from first principles (delete = no-op) without reading the corridor cards —
   no card IDs, producer semantics unanswered, the `Session.append` capability
   gap missed. S6 is the strongest discriminator for "did the agent actually
   consult the cards", and is the recommended first probe when comparing
   agents.
4. **Skill discoverability matters.** An intermediate run placed the skill
   files at the workspace root but did not mount them as skills: only S4's
   agent explored and found them (pass), the other four never looked and
   scored like the closed-book arm. Mounting (making the descriptions visible
   to the agent's skill system) is what the protocol means by "with-skill".
5. **Harness fix**: one closed-book run crashed in the team's obligation
   tracker on a verification event with no command field
   (`undefined.replaceAll`); fixed and regression-tested upstream of this
   measurement. The S7 without-skill row above was re-run after the rebuild.

## Limitations

- n=1 per arm; environment noise (agent nondeterminism, coarse keyword sieve
  vs the Harbor judges' finer bands) not yet averaged out.
- The Harbor judges give partial credit the sieve does not (e.g. H6 half
  credit, S7 exact-pin path); content columns above use the scoring rubrics
  directly.
- Container tasks (M2/M3/M4/H7) were validated for judge behavior (oracle 1.0,
  trap caps) but have no agent-run calibration yet.
