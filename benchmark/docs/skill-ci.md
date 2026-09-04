# Skill CI and composition coverage

The repository has three different test layers. A passing control run is not a
claim that a model opened a Skill or followed its instructions.

| Layer | Trigger | What a pass establishes |
|---|---|---|
| `validate` / `skill-composition` | Every PR and main push | File/script checks plus workflow ownership, dependency and scope invariants |
| `dsh-integration` | Runtime-related paths, manual, weekly | The checked-in M1 reference plugin behaves as expected on the two pinned DSH versions |
| `skill-evaluation` controls | Skill, task or evaluation-code changes | Six reference answers score 1; doing nothing scores 0; every expected trial is present |
| `skill-evaluation` model jobs | Manual dispatch only | Actual model outcomes for three Skill catalogs, with complete per-task evidence |

## Local deterministic checks

```sh
npm run prepare:ci
npm test
npm run test:composition
```

`prepare:ci` explicitly fetches missing snapshot SHAs from the clone's existing
`origin`. A full-history checkout alone does not include commits left outside
branch history after a squash merge. Pins are never rewritten, and `npm test`
remains offline except for tests that already simulate external commands.

The composition suite exercises all installed Skill owners, nine workflows and
14 capabilities. It checks two-capability combinations in every workflow, explicit
exclusions, required gates, Web-only surfaces, unique phase ownership and the
absence of unselected publication. Adding a Skill without an exercised owner fails
the coverage check. These are planner tests; they do not interpret natural-language
requests or execute the phase ledger.

## Reference-answer and no-op controls

Install Docker and `harbor==0.22.0`, then run from the repository root:

```sh
node benchmark/scripts/skill-evaluation.mjs prepare --condition oracle --output .artifacts/oracle-run
harbor run --config .artifacts/oracle-run/config.json
node benchmark/scripts/skill-evaluation.mjs check --output .artifacts/oracle-run
```

Repeat with `--condition nop` and a fresh output directory to check untouched
fixtures. Neither control calls a model. The workflow rejects absent trials,
duplicate/extra trials, unscored results, exceptions (even with reward 1), imperfect
reference answers and no-op rewards above zero. A Harbor process exiting zero by
itself is insufficient.

The suite is maintained in [suite.json](../skill-evaluation/suite.json): S1
(read-only scan), M1 (real host migration), S5 (naming), S9 (runtime diagnosis),
S11 (heavy dependency diagnosis), and H8 (multi-plugin release rehearsal). It is a
regression subset of the living benchmark, not an additional benchmark task set.

## Actual model comparison

Configure either the repository secret `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`.
Dispatch **skill-evaluation** in GitHub Actions with an explicit matching
`anthropic/<model>` or `openai/<model>` and 1 or 3 attempts. Missing credentials
fail the run with a setup message; they never become a successful skipped test.
The workflow first requires both control jobs to pass.

The same six task prompts, model, Harbor version and attempt count run in fresh
Docker trials using Harbor's `terminus-2` agent:

| Condition | Injected directories |
|---|---|
| `no-injected-skill` | None |
| `upgrade-only` | `skills/plugin-upgrade` |
| `all-skills` | Every current Skill, including `plugin-workflow` |

No extra routing prompt is added to the all-Skill condition. Skills are supplied
through Harbor's native catalog; their entire bodies are not pasted into every
prompt. The baseline label describes injection, not verified absence of internet
access or all possible Skill content. These public task environments retain their
existing network policy. This is not a closed-book efficacy experiment.

There are at most 18 model trials for a one-attempt smoke run, or 54 for a
three-attempt comparison, with two concurrent trials per condition and no automatic
retries. Model use incurs provider charges. Local generation uses the same entry:

```sh
node benchmark/scripts/skill-evaluation.mjs prepare --condition all-skills --model anthropic/YOUR_MODEL --attempts 3 --output .artifacts/all-skills-run
harbor run --config .artifacts/all-skills-run/config.json
node benchmark/scripts/skill-evaluation.mjs check --output .artifacts/all-skills-run
```

Use a new output directory per run. `manifest.json` records source SHA, dirty state,
task inventory, supplied Skills, model and attempts; Harbor also records its resolved
job configuration and lock. Summaries retain every trial and report available token
counts, summed trial durations and missing usage counts. Three-condition comparisons
refuse incomplete runs, dirty trees, mismatched commits/models or differing task
inventories. Per-task medians and `all-skills − upgrade-only` differences identify
regressions for inspection; no stable performance threshold has yet been established.

## Evidence boundaries

- The current suite evaluates outcomes on existing tasks. It does not prove every
  natural-language trigger, all possible Skill combinations or phase handoff at runtime.
- Availability is not activation. Every manifest says `skillActivation: not-measured`.
  Trajectory-based activation auditing is separate work in
  [PR #132](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/pull/132); this change
  does not duplicate that implementation or claim its results.
- The all-Skill condition lets the agent discover `plugin-workflow`; it does not
  guarantee the agent invoked the planner or loaded every owner.
- CI uploads numeric outcome evidence, manifests and control verifier logs for
  seven days. Raw model trajectories are not uploaded; inspect local Harbor trial
  directories when doing activation or conflict diagnosis.
- A single attempt is smoke coverage. Repeated outcomes can still vary with the
  model/provider and task dependencies. Formal claims need a frozen evaluation
  snapshot and an audited protocol.
