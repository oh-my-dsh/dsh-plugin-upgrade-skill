# dsh plugin upgrade tasks (benchmark v2.2 · Harbor format)

The 15 plugin-upgrade tasks measure one thing: **once an AI has our upgrade skill
installed, will it actually upgrade the plugin**. The first 9 are written exams (read
the code, produce the answer); the last 6 are hands-on (actually install dsh and run
the plugin — whether it is alive is obvious at a glance). Every task ships with
auto-grading, so no human marking is involved.

**Format: this benchmark uses the [Harbor](https://github.com/harbor-framework/harbor)
task format** — each question is a standard Harbor task (directory layout below) that
can be run directly with `harbor run` on any agent / provider Harbor supports.

Every task tests a real trap: some fixtures hide a misleading comment like "try
changing it this way" (following it is fatal), and some plugins ship with a
pre-existing failing test unrelated to the upgrade (testing whether the AI reports it
honestly instead of quietly fixing it and pretending nothing happened).

## Task overview (plain language)

| Task | Type | What it tests |
|---|---|---|
| S1-static-scan | Static | Given legacy plugin code: can it find every spot that will break, check the reference cards, and leave the fixture untouched |
| S2-negative-scan | Static | Given code that looks clean: does it blindly report "all good" (no findings ≠ no problems) |
| S3-snapshot-migration | Static | 0.1.1 flat-snapshot reads plus the old registration style: can it cover the full migration surface (legacy projection in two steps, useSession, cordis imports, slots.inject) |
| H4-tsbuildinfo-trap | Static | After migration the build complains about a deleted API that is nowhere in the source: does it recognize the stale build artifact as a false positive instead of rewriting source per the card recipe |
| M1-host-migration | Hands-on | The old plugin fails to start on the new dsh (a real-world failure): fix it |
| H1-plane-trap | Hands-on | The hardest trap: comments in the code steer you toward a fatal change — does it get misled |
| H2-baseline-trap | Hands-on | The plugin ships with a test that was already red: does it honestly say "this failure is not caused by the upgrade" |
| H3-client-plane | Hands-on | The web plugin is missing one required declaration: does it know to add it |
| H5-runtime-export-drift | Hands-on | settings runtime export drift: install/typecheck/build/test are all green locally, but the packed plugin crashes on cold boot under the alpha.2 host — does the agent fall for the "pin the old runtime / write a shim" bait (both bypasses boot green, so only static caps can catch them) |
| M5-token-auth-smoke | Hands-on | The plugin's self-built /ping channel answers with no host authentication: does it move the registration behind the host's unified token/cookie auth and prove it with a browserless 401/200 smoke |
| S4-legacy-client-imports | Static | A 0.1.1-era Web Client plugin: can it find all four breaking client-runtime touchpoints, cite the four cards, and not fabricate extra "cards" |
| S5-negative-naming | Static | A naming manifest that looks fine: does it keep the four-state judgment restrained (official short names are valid, warnings are not errors, unqueried registry is unknown) instead of claiming "all good, can publish" |
| H6-remote-error-trap | Static | An alpha.2 plugin still on 0.1.1 error handling with a comment saying "do not change the error codes": does it migrate the error flow (namespaced codes, cancel propagation, no blind retry, no silent swallow) by evidence instead of the comment |
| S6-corridor-net-state | Static | Defense code written for the alpha.1 intermediate state (deleting `SessionEvent.ignorable`): does it fold the corridor to the net state and delete the defense instead of keeping it per the comment |
| S7-unpublished-cohort | Static | A plugin pinning a cohort version never published to npm (`^0.1.2-alpha.1`): does it check the registry first, see the silent caret resolution, and give a workable install plan |

## Task format (Harbor task layout)

Each task directory `tasks/<task-id>/` is a self-contained Harbor task:

```
tasks/<task-id>/
├── instruction.md        # the prompt given to the agent (was task.md)
├── task.toml             # Harbor config: name, timeout, resources, network
├── environment/
│   ├── Dockerfile        # task environment: node:24-bookworm + git baseline commit;
│   │                     # hands-on tasks (M/H prefix) also install dsh 0.1.2-alpha.2 globally
│   └── fixture/          # the plugin code under test (private:true — cannot run, must not be published)
├── tests/
│   ├── test.sh           # harbor verifier entry point: runs the judge and normalizes
│   │                     # the 0-100 score to 0~1 in /logs/verifier/reward.txt
│   ├── judge.mjs         # grading logic (checkpoints, score bands, signal detection — all here)
│   └── judge-utils.mjs   # shared grading library (profile lifecycle, cold-boot signals)
├── solution/
│   ├── solve.sh          # oracle solution (static tasks write a report; hands-on tasks copy the answer into the fixture)
│   └── ...               # reference answer + what this task tests (SOLUTION.md)
└── README.md             # task description
```

The repo also has [`docs/execution-contract.md`](docs/execution-contract.md), which
defines the unattended-authorization contract, and
`scripts/validate-execution-contract.mjs`, which checks that every task prompt and
piece of metadata uses the same version.

**Self-contained**: no external containers needed. The agent works directly inside the
task environment (a container) — the fixture lives at `/app/fixture/`, and static-task
reports are written to `/app/agent-output/<task-id>/`; the verifier shares the same
container as the agent, and for hands-on tasks the judge really creates an isolated
profile inside the container, installs the plugin, and cold-boots it to tell whether
it is alive.

## Prerequisites

- Docker (Harbor runs environments on your local Docker by default; you can also
  switch to a cloud sandbox such as Daytona with `--env`).
- Harbor CLI: `uv tool install harbor` or `pip install harbor`.
- A model API key for the agent (e.g. `ANTHROPIC_API_KEY`, depending on the agent you use).

## How to run

```sh
# oracle self-check (no API cost): the reference answer must score a perfect 1.0
harbor run -p benchmark/tasks/S1-static-scan -a oracle

# evaluate a single task with an agent
harbor run -p benchmark/tasks/M1-host-migration -a claude-code -m anthropic/claude-opus-4-1

# all 15 tasks: pointing -p at the tasks/ directory runs them as a dataset batch
harbor run -p benchmark/tasks -a claude-code -m anthropic/claude-opus-4-1
```

Each task's results land in Harbor's trial output directory:
`/logs/verifier/reward.txt` holds the 0–1 score (mapped from the judge's 0–100), and
the judge's per-item reasons are in the verifier log.

## How to use with an agent (evaluation protocol)

### Unattended authorization

All 15 `instruction.md` files carry the `BENCHMARK-AUTH-v1` marker: the task prompt
itself is the user's confirmation of the plan and the execution within the stated
scope. The agent should complete the necessary analysis/planning and then proceed — it
must not stop just because Harbor will not send a second round of "confirmation". The
authorization does not change the task boundaries: the fixtures for S1/S2/S3 still
require zero changes, H4 keeps `src/` unchanged and only permits cleaning the `lib/`
build artifacts, and M1/H1/H2/H3/H5/M5 may only modify the fixture, write the specified
reports, and create one-off local verification assets; publishing, pushing, external
services, and modifying the skill/judge/reference answers are all outside the
authorized scope. See [`docs/execution-contract.md`](docs/execution-contract.md) for
the full semantics and maintenance rules.

First check that the contract is intact:

```sh
node benchmark/scripts/validate-execution-contract.mjs
```

1. **Input for the agent**: `instruction.md` is exactly what the user says to the
   agent — feed it as-is; the working directory (`/app` inside the container) is
   already stated in the prompt.
2. **Where the agent writes** (also stated in the prompts):
   - Static scan tasks (S1/S2/S3): the agent only reads the fixture and writes its
     report under `/app/agent-output/<task-id>/` (any filename; .md/.txt/.json all fine);
   - Build-cache diagnosis task (H4): the agent keeps `src/` unchanged, may only clean
     the `lib/` build artifacts, and writes its report to
     `/app/agent-output/H4-tsbuildinfo-trap/`;
   - Hands-on tasks (M1/H1/H2/H3/H5/M5): the agent edits files under `/app/fixture/`
     directly; H2 additionally requires writing the migration report to
     `/app/agent-output/H2-baseline-trap/`.
3. **Grading**: after the agent finishes, Harbor automatically runs `tests/test.sh`;
   each task's judge prints a single JSON line
   `{"score": 0-100, "max": 100, "reasons": [...]}`, and test.sh aggregates it into a
   0–1 reward. See [docs/scoring.md](docs/scoring.md) for the scoring details and
   checkpoint mapping.

### with-skill vs without-skill comparison (isolating the skill's effect)

Run two rounds with the same agents and the same tasks:

- **with-skill round**: attach this repo's `skills/plugin-upgrade/` to the agent as a
  skill (prompts unchanged);
- **without-skill round**: a bare agent, given only the prompts.

The score difference between the two rounds is the skill's net effect. We recommend
running each round 3 times and taking the median (hands-on tasks have environmental
noise). Every Harbor trial is a fresh container, so no manual fixture restoration is
needed between rounds. `BENCHMARK-AUTH-v1` is identical in both rounds: it only
removes the false zeros caused by the missing confirmation round in an unattended
environment, and it does not leak migration answers to either round.

## Grading design notes

- **Real activation counts**: for hands-on tasks the judge installs the agent's
  modified fixture into an isolated profile inside the container (`bench-<task-id>`),
  cold-boots it, and treats `pending (waiting for service: …)` /
  `plugin tree failed` / startup reaching the application layer as the liveness
  signals; the judge cleans up its own assets when done.
- **No dependence on fixed output text**: the agent's plugin log wording is free; the
  criteria are host-side signals (e.g. headless must print `MISSING_CREDENTIAL` when
  there is no key, proving that the plugin tree activated as a whole).
- **Error tolerance**: missing reports, dsh errors, etc. all count as 0 and are
  explained in the reasons; the judge itself always exits 0, and if test.sh cannot
  parse the JSON it falls back to a 0 score.

## Historical documents

- `validation-report-2026-08-30.md`: the skill-effectiveness validation report (v1
  era). The manual `dsh-verify` container reproduction in its section 6 has been
  replaced by the self-contained environment — each task image is now built with the
  same steps as that section (node:24-bookworm + globally installed pnpm/dsh
  0.1.2-alpha.2).
- The v1 in-house harness of this directory (`run.mjs` + external container) has been
  removed; see git history.

## Notes for maintainers (skip if you are not changing tasks)

- Every fake plugin in a task's `environment/fixture/` has `"private": true` in its
  package.json, and its README states it is "exam material only, do not publish".
  **Keep both when adding tasks** — the point is to stop anyone from accidentally
  publishing these fake plugins to npm: they cannot run, and publishing them would
  only pollute the ecosystem.
- When adding a task, scaffold it with `harbor task init`, then fill in
  judge / solve.sh following the layout of the existing 15 tasks, and verify the
  reference answer scores 1.0 with `harbor run -p <task> -a oracle`.
- After adding or modifying prompts, run
  `node benchmark/scripts/validate-execution-contract.mjs` to make sure the
  authorization marker, the read-only/hands-on boundaries, and the `task.toml`
  metadata are consistent.
- When referencing upgrade cards in benchmark Markdown, use the full ID (e.g.
  `DSH-0.1.2-A1-01`, never the shorthand "A1-01"). The repo self-check verifies two
  things: that the ID really exists and that its link resolves; if you get it wrong,
  `node scripts/validate.mjs` fails outright.
