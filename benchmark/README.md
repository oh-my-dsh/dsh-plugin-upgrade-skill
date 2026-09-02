# dsh plugin upgrade tasks (benchmark v2.4 · Harbor format)

The 47 plugin-upgrade tasks measure one thing: **once an AI has our upgrade skill
installed, will it actually upgrade the plugin**. The first 14 are written exams (read
the code, produce the answer); the last 33 are hands-on (actually install dsh and run
the plugin — whether it is alive is obvious at a glance). Every task ships with
auto-grading, so no human marking is involved.

**Format: this benchmark uses the [Harbor](https://github.com/harbor-framework/harbor)
task format** — each question is a standard Harbor task (directory layout below) that
can be run directly with `harbor run` on any agent / provider Harbor supports.

Every task tests a real trap: some fixtures hide a misleading comment like "try
changing it this way" (following it is fatal), and some plugins ship with a
pre-existing failing test unrelated to the upgrade (testing whether the AI reports it
honestly instead of quietly fixing it and pretending nothing happened).

## Task overview

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
| H8-fire-drill | Hands-on | One release, three plugins with three different trap states (legacy host plane with a "switch to remote" bait, a naked /ping channel, an unpublished dependency cohort) plus a fake "publish --force" procedure: can it run the full diagnose → fix → deploy → release drill in order, with a browserless token smoke and correct release gates |
| H9-dsh-web-alpha2 | Hands-on | Can it migrate the real dsh-web v0.3.8 source slice to v0.3.9 on alpha.2, covering all 13 settings consumers, the dependency cohort, aggregate entrypoints, workflow, and retry protocol |
| H10-browser-activation-trap | Hands-on | A renamed Web plugin appears in the browser boot manifest and its bundle returns 200, but the client entry never activates: does it repair the registration identity and prove execution in Chromium |
| H13-ghost-host-trap | Hands-on | The disk says dsh 0.1.2-alpha.2 but the web host has been running since before the in-place upgrade and still answers the pre-0.1.2 wire: does the pre-flight pin the migration FROM to the running process's real generation (probe + start-time, host left untouched) instead of trusting the version on disk |
| H11-dual-cohort-rpc | Hands-on | An alpha-style two-argument RPC registration passes its mocks and the newer real Host but crashes on rc.2: can it find one branch-free call shape that preserves the legacy per-channel authority policy in both real cohorts |
| S4-legacy-client-imports | Static | A 0.1.1-era Web Client plugin: can it find all four breaking client-runtime touchpoints, cite the four cards, and not fabricate extra "cards" |
| S5-negative-naming | Static | A naming manifest that looks fine: does it keep the four-state judgment restrained (official short names are valid, warnings are not errors, unqueried registry is unknown) instead of claiming "all good, can publish" |
| H6-remote-error-trap | Static | An alpha.2 plugin still on 0.1.1 error handling with a comment saying "do not change the error codes": does it migrate the error flow (namespaced codes, cancel propagation, no blind retry, no silent swallow) by evidence instead of the comment |
| H12-remote-result-boundary-trap | Static | A Remote consumer whose error vocabulary is already alpha.2-namespaced but whose control flow is still wrong: does the agent see that ordinary unary failures resolve as `RemoteResult.ok === false` (they do not reject into catch), branch on `result.ok` before reading `.value`, and keep genuine assembly/programming rejects on their own exception boundary — instead of the colleague's "handle all failures in catch" advice |
| S6-corridor-net-state | Static | Defense code written for the alpha.1 intermediate state (deleting `SessionEvent.ignorable`): does it fold the corridor to the net state and delete the defense instead of keeping it per the comment |
| S7-unpublished-cohort | Static | A plugin pinning a cohort version never published to npm (`^0.1.2-alpha.1`): does it check the registry first, see the silent caret resolution, and give a workable install plan |
| S8-release-routing-trap | Static | A consumer install fails twice: the README-pinned tag is missing from the mirror, then the newest tag crashes on their older runtime — can it diagnose both root causes (tag sync + version routing) and give a working install command |
| S9-composer-coordinate-trap | Static | A community attachment plugin works on the first paste then fails every later one, and the dock × leaves an `unavailable` chip — can it tie both symptoms to one coordinate-projection misread and derive the conversion from host source |
| S10-paste-rename-and-version-chip | Static | Post-release follow-ups: pasted files need unified `paste_image(N)` renaming driven by the authoritative live-chip set (drops/picker untouched), and the version chip reported a CDN-stale fetched tag as latest — can it design both correctly |
| S11-mermaid-lazyload-trap | Static | A lazy-loaded mermaid chunk rollout fails three ways: split-chunk sibling imports 404, a Windows-only 403 from a case-sensitive containment guard, and a Ctrl+scroll double-fire under the zoom modal — can it derive each mechanism from the evidence |
| M2-optional-dep-trap | Hands-on | The plugin declares an optional dependency but imports it unconditionally at top level (the comment says optional is harmless): does it fix the dependency contract instead of wrapping the import, and prove it with a cold boot |
| M3-session-projection | Hands-on | A self-assembled profile mounts dsh-tool-todo without the sessionProjections service: does it fix the composition (never edit shipped packages) so the tree activates while the todo tool survives in the final composition |
| M4-peer-prerelease-range | Hands-on | A peer lower bound written as ^0.1.0-rc.8 does not match 0.1.2-alpha.2 under npm semver's prerelease rule: does it rewrite the bound to the target cohort instead of widening it into a meaningless range |
| H7-locale-trap | Hands-on | A web plugin anchors host UI by display text, which breaks silently once the host copy is localized: does it switch to a stable data-slot anchor and assert the injection actually rendered |
| M6-sleep-tool | Hands-on | The smallest real adaptation: bare cordis is no longer the host contract, ContentBlock moved to dsh-llm, peer floors are on a dead cohort (a contract-level break the boot does not reveal) - does it rewrite the cohort contract from the cards instead of trusting the in-source memo |
| M7-d399-overlay | Hands-on | A browser overlay whose inject list names the deleted dsh-client-runtime: does it recompose the client plane and retype ctx.sessions.list through the api-session-controller ISessions contract |
| M8-brand-text | Hands-on | The snapshot-store engine moved to dsh-client-store, the cordis peer still carries a -rc prerelease suffix, and the fixture ships stale registration assertions: does it fix both and attribute the pre-existing red test honestly |
| M9-mcpanel | Hands-on | The client inject list names the removed dsh-client-runtime (boot-fatal) and the peers still carry bare cordis: does it recompose the client plane and declare the locale namespace the alpha way |
| M10-tools-tree | Hands-on | The ctx.slots service moved to ui-renderer in the client-runtime split: does it add the type-only renderer/settings merges and rehome the inject list instead of trusting the cosmetic-import memo |
| M11-sidebar-spur | Hands-on | ClientContext lived in the deleted client-runtime: does it move to the cordis Context + ui-renderer slots merge, rework the inject list, and keep the dock registration |
| M12-interpreters-card | Hands-on | The store engine moved to dsh-client-store and dsh-settings renamed Settings to SettingsProvider: does it re-home both type surfaces, the client inject list, and the peer cohort |
| M13-repository-plugins-removal | Hands-on | A 0.1.1-era repository-plugin ships in the removed shape (`.dsh-plugin/` + `dsh.entry` + a self-executing client): does it convert it to the one official npm-package path — bundle `dsh.bundle`/`dsh.client`/`exports` + cordis.patch.yml insert — drop the legacy manifest, and prove the browser half is recognized in the boot manifest |
| M14-service-renames-0812 | Hands-on | A bundle plugin still names the pre-0812 host services — `inject: ['tasks', 'httpServer']`, `ctx.tasks` reads, `ctx.httpServer.register`, an `onTaskDone` listener — while the alpha.2 host renamed them (`httpServer`→`webServer`, `tasks`→`jobs`, `onTaskDone`→`onJobDone`) and the boot fails at `pending (waiting for services: tasks, httpServer)`: does it recognize the high-frequency low-diff breaking change, rename every identifier (comments included), and prove activation plus a live route with a cold boot |
| H14-mineru-api | Hands-on | A tool plugin serves its settings page through a dedicated /mineru-api RPC channel: apiproxy is deleted, rpc.handle lost its third authority argument, and the client inject list names the removed runtime - migrate both planes and prove the boot-roster entry |
| H15-locale-pack | Hands-on | A 19-language override layer built on a LocaleRuntime lookup monkey-patch: does it migrate to the native third-language API (addLanguage + register(ns, locale, dict)) and delete the patch, the settings row, and localStorage - instead of the belt-and-braces bait |
| H16-history-dock | Hands-on | The composer became a Lexical contenteditable: does it switch to a capture-phase document keydown inside the session-scoped dock, collect history through useChat legacy nodes, and yield to data-trigger-menu - instead of the textarea bait |
| H17-merge-calls | Hands-on | ui-tool deleted its resultView/callView derivations and ui-chat owns the chat nodes: does it derive cards from block.meta + call args + result text, read through useChat, and relax override dicts to Partial - instead of the renamed-fields bait |
| H18-blame-bubbles | Hands-on | The suggestion-bubbles plugin rides the deleted apiproxy facade with a three-argument rpc.handle and an undeclared projection cell: does it migrate to ConnectionRpcResult, the two-argument handle, and the SessionProjectionStateMap dual-table declaration |
| H19-workspace-ya | Hands-on | The workspace browser must take over the disabled official ui-workspace through slots.provideRoot plus a stand-in service (the boot-deadlock fix): does it compose the takeover instead of patching the shipped package in node_modules |
| H20-session-events-ledger | Hands-on | alpha.4 removes the `Session.events` getter (implicit whole-event-array access): does the agent migrate a plugin-internal event ledger module to the explicit sequence/window surface — visible window keeps fork-inherited history, exact-seq lookup, half-open window bounds, own/inherited cut — instead of a symbol rename, an invented getEvents, or a runtime patch |
| H21-question-answerer-waterfall | Hands-on | A structured-question answerer still uses the rc.2 single-seat registration: can it migrate to the alpha.2 waterfall while preserving current-owner claim, foreign-owner delegation, rebinding, disposal, and the legacy cohort |
| H22-dsh-data-agent-alpha2 | Hands-on | Can it migrate the complete real dsh-data-agent v0.1.3 repository to the exact v0.1.4 alpha.2 client behavior, including provider ownership, New Session Hero preservation, revisioned workbench hand-off, Lexical fallback, release artifacts, and browser execution |

## Benchmark results

On 2026-09-01, Codex ran the benchmark at `xhigh` reasoning effort with
`openai/gpt-5.6-terra` on a 22-task snapshot and with
`openai/gpt-5.6-luna` on the earlier 19-task snapshot. Terra was tested both
with `skills/plugin-upgrade` and with Harbor-injected and Codex-native skills
fully disabled. Luna was tested with `skills/plugin-upgrade` and with no skill
supplied by Harbor, although native Codex skills remained available in the
latter condition. These rows belong to the same benchmark family but are not a
direct model comparison: `S8-release-routing-trap`, `M5-token-auth-smoke`, and
`H8-fire-drill` were added after the Luna snapshot, while
`H10-browser-activation-trap`, `H11-dual-cohort-rpc`, and
`H22-dsh-data-agent-alpha2` were added after the Terra runs.

On 2026-09-02, Luna also ran the new `H22-dsh-data-agent-alpha2` task once with
`skills/plugin-upgrade` and once with both Harbor-injected and Codex-native
skills disabled. Both rows below are scored single trials; the literal-zero-skill
report separately accounts for an excluded preliminary attempt that read a native
skill and timed out.

| Model | Skill condition | Scope | reward | mean | perfect tasks | Summed job duration | Tokens (input / cache / output) | Cost | Detailed report |
|---|---|---|---:|---:|---:|---:|---:|---:|---|
| `openai/gpt-5.6-terra` | With `skills/plugin-upgrade` | 22-task 2026-09-01 snapshot; 21 rewarded + 1 verifier error | 16.75/21 scored; 16.75/22 conservative | 0.7976 scored; 0.7614 conservative | 13 | 2h33m58.860s | 54,094,444 / 51,131,904 / 355,256 | $20.4145 | [22-task report](results/validation-report-2026-09-01-codex-gpt-5.6-terra-all-22.md) |
| `openai/gpt-5.6-terra` | Literal zero skill | 22-task 2026-09-01 snapshot; 21 rewarded + 1 verifier error | 14.93/21 scored; 14.93/22 conservative | 0.7110 scored; 0.6786 conservative | 10 | 2h51m31.853s | 46,824,114 / 44,432,640 / 283,652 | $17.0733 | [22-task literal-no-skill report](results/validation-report-2026-09-01-codex-gpt-5.6-terra-all-22-literal-no-skill.md) |
| `openai/gpt-5.6-luna` | With `skills/plugin-upgrade` | 19-task 2026-09-01 snapshot | 15.95/19 | 0.8395 | 13 | 1h38m30.556s | 57,118,102 / 54,630,656 / 332,161 | $1.9887 | [18-task batch](results/validation-report-2026-09-01-codex-gpt-5.6-luna-other-18.md) · [real-repository task](results/validation-report-2026-09-01.md) |
| `openai/gpt-5.6-luna` | No Harbor-injected skill† | 19-task 2026-09-01 snapshot | 13.09/19 | 0.6889 | 10 | 1h49m25.650s | 36,761,760 / 34,515,712 / 244,223 | $1.4326 | [18-task batch](results/validation-report-2026-09-01-codex-gpt-5.6-luna-other-18-no-injected-skill.md) · [real-repository task](results/validation-report-2026-09-01-h8-dsh-web-alpha2-no-skill.md) |
| `openai/gpt-5.6-luna` | With `skills/plugin-upgrade` | H22 dsh-data-agent; 1 scored trial | 0.08/1 | 0.0800 | 0 | 3h58m55.457s | 143,377,248 / 138,872,576 / 445,689 | $4.2132 | [H22 with-skill report](results/validation-report-2026-09-02-h22-dsh-data-agent-alpha2-plugin-upgrade.md) |
| `openai/gpt-5.6-luna` | Literal zero skill‡ | H22 dsh-data-agent; 1 accepted scored trial | 0.11/1 | 0.1100 | 0 | 1h34m53.399s | 70,605,981 / 68,899,072 / 227,439 | $1.9923 | [H22 literal-zero-skill report](results/validation-report-2026-09-02-h22-dsh-data-agent-alpha2-no-skill.md) |
| `deepseek/deepseek-v4-flash` + terminus-2 | With `skills/plugin-upgrade` | 23-task full set (3-run median) | 18.55/23 | 0.8063 | 14 | 2h34m | 58.7M / n/a / 2.5M | $5.28 | [terminus-2 + deepseek-v4-flash report](results/validation-report-2026-09-01-terminus2-deepseek-v4-flash.md) |
| `deepseek/deepseek-v4-flash` + terminus-2 | No skill | 23-task full set (3-run median) | 16.09/23 | 0.6996 | 11 | 2h24m | 53.9M / n/a / 2.3M | $4.85 | [terminus-2 + deepseek-v4-flash report](results/validation-report-2026-09-01-terminus2-deepseek-v4-flash.md) |

Duration is the sum of the Harbor job durations represented in each report;
concurrent jobs therefore remain additive rather than being collapsed into an
elapsed wall-clock window. Token cells are ordered as input / cache / output.
Cache tokens are a subset of input tokens and must not be added to input when
calculating total consumption. Costs are the Harbor-recorded USD totals. The
Luna resource totals were recovered from the persisted historical
`result.json` artifacts underlying the linked reports. The Terra literal
zero-skill row uses the exact retained result-file totals; its report notes
that the provider's absolute billing total is higher because Harbor erased the
first H8 agent attempt when retrying it.

Per-task skill comparison (`delta = with-skill - corresponding no-skill
condition`; `—` means the task was absent or no verifier reward existed):

| Task | Luna with skill | Luna no Harbor skill | Luna delta | Terra with skill | Terra literal zero skill | Terra delta |
|---|---:|---:|---:|---:|---:|---:|
| S1-static-scan | 1.00 | 0.67 | +0.33 | 1.00 | 0.83 | +0.17 |
| S2-negative-scan | 1.00 | 0.60 | +0.40 | 1.00 | 0.60 | +0.40 |
| S3-snapshot-migration | 1.00 | 0.00 | +1.00 | 1.00 | 0.20 | +0.80 |
| H4-tsbuildinfo-trap | 1.00 | 0.30 | +0.70 | 1.00 | 0.30 | +0.70 |
| M1-host-migration | 1.00 | 1.00 | 0.00 | 1.00 | 1.00 | 0.00 |
| H1-plane-trap | 1.00 | 1.00 | 0.00 | 1.00 | 1.00 | 0.00 |
| H2-baseline-trap | 1.00 | 1.00† | 0.00 | 1.00 | 1.00 | 0.00 |
| H3-client-plane | 1.00 | 1.00† | 0.00 | 1.00 | 1.00 | 0.00 |
| H5-runtime-export-drift | 1.00 | 1.00 | 0.00 | 0.20 | 1.00 | -0.80 |
| M5-token-auth-smoke | — | — | — | 0.60 | 0.60 | 0.00 |
| H8-fire-drill | — | — | — | error | error | — |
| H9-dsh-web-alpha2 | 0.80 | 0.67 | +0.13 | 0.80 | 0.50 | +0.30 |
| H10-browser-activation-trap | — | — | — | — | — | — |
| H22-dsh-data-agent-alpha2 | 0.08 | 0.11‡ | -0.03 | — | — | — |
| S4-legacy-client-imports | 1.00 | 1.00 | 0.00 | 1.00 | 1.00 | 0.00 |
| S5-negative-naming | 0.75 | 0.50 | +0.25 | 0.75 | 0.50 | +0.25 |
| H6-remote-error-trap | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| S6-corridor-net-state | 0.25 | 0.25 | 0.00 | 0.25 | 0.25 | 0.00 |
| S7-unpublished-cohort | 0.25 | 0.10 | +0.15 | 0.25 | 0.25 | 0.00 |
| S8-release-routing-trap | — | — | — | 1.00 | 1.00 | 0.00 |
| M2-optional-dep-trap | 1.00 | 1.00 | 0.00 | 1.00 | 1.00 | 0.00 |
| M3-session-projection | 1.00 | 1.00 | 0.00 | 1.00 | 1.00 | 0.00 |
| M4-peer-prerelease-range | 1.00 | 1.00 | 0.00 | 1.00 | 1.00 | 0.00 |
| H7-locale-trap | 0.90 | 1.00 | -0.10 | 0.90 | 0.90 | 0.00 |

For Luna, the observed with-skill uplift is **+2.86 reward points across 19
tasks**, or **+0.1505 mean reward**. Seven tasks improved, eleven tied, and one
(H7) was 0.10 lower. The largest gains were S3 (+1.00), H4 (+0.70), S2 (+0.40),
and S1 (+0.33). H6 remained at 0 in both configurations, while the
real-repository task (run as H8 and now numbered H9) improved from 0.67 to 0.80
but did not complete the full runtime validation in either run.

For Terra, the observed with-skill uplift is **+1.82 reward points across the
21 tasks with verifier rewards**, or **+0.0867 mean reward**. Six tasks
improved, fourteen tied, and one (H5) was 0.80 lower. The largest gains were S3
(+0.80), H4 (+0.70), S2 (+0.40), and H9 (+0.30). H8 produced no verifier
reward in either Terra condition and is excluded from this delta.

These numbers are evidence from one selected attempt per task and condition,
not the three-run median recommended below. They also have these protocol
limits:

- † **Native-skill boundary:** Harbor supplied no skill and every
  corresponding job lock recorded empty skill arrays, but the Codex-native
  system-skill catalog was still present. H2 and H3 explicitly read the native
  `plugin-creator` skill, so the 13.09/19 aggregate is a
  no-Harbor-injected-skill result rather than a literal zero-skill baseline.
  Excluding those two contaminated trials, the audit-clean subset including
  the real-repository task scored 11.09/17 (mean 0.6524).
- ‡ **H22 control boundary:** H22 disabled both Harbor-injected and Codex-native
  skills, so its 0.11 control is a literal-zero-skill result rather than the
  earlier Luna column's no-Harbor-skill condition. See the linked H22 reports.
- The standalone with-skill report calls the real-repository task
  `H5-dsh-web-alpha2`, and the no-skill report calls it `H8-dsh-web-alpha2`.
  After upstream assigned H8 to the fire-drill task, it is listed here as
  `H9-dsh-web-alpha2`; only the task number changed.
- H7's checked-in `task.toml` contained an unescaped `\s`, so both Luna
  18-task batches and both Terra 22-task runs used a temporary copy with only
  that TOML description escape fixed.
- Several runs recorded setup or timeout anomalies. The linked reports retain
  the exact selected-result, retry, installer, scope-cap, and timeout evidence.

## Task format

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

For formal/reproducible runs, pin an evaluation snapshot under
[`benchmark/snapshots/`](snapshots/README.md) instead of describing the object
as "the current benchmark".

```sh
# oracle self-check (no API cost): the reference answer must score a perfect 1.0
harbor run -p benchmark/tasks/S1-static-scan -a oracle

# evaluate a single task with an agent
harbor run -p benchmark/tasks/M1-host-migration -a claude-code -m anthropic/claude-opus-4-1

# all 47 tasks: pointing -p at the tasks/ directory runs them as a dataset batch
harbor run -p benchmark/tasks -a claude-code -m anthropic/claude-opus-4-1
```

Each task's results land in Harbor's trial output directory:
`/logs/verifier/reward.txt` holds the 0–1 score (mapped from the judge's 0–100), and
the judge's per-item reasons are in the verifier log.

## How to use with an agent (evaluation protocol)

### Unattended authorization

All 47 `instruction.md` files carry the `BENCHMARK-AUTH-v1` marker: the task prompt
itself is the user's confirmation of the plan and the execution within the stated
scope. The agent should complete the necessary analysis/planning and then proceed — it
must not stop just because Harbor will not send a second round of "confirmation". The
authorization does not change the task boundaries: the fixtures for S1/S2/S3 still
require zero changes, H4 keeps `src/` unchanged and only permits cleaning the `lib/`
build artifacts, and hands-on tasks may only modify the fixture, write the specified
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
   - Hands-on tasks (M1/H1/H2/H3/H5/M2/M3/M4/H7/M5/H8/H9/H10/H21/H22): the agent edits files under `/app/fixture/`
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

Tasks carrying `metadata.skill_snapshot_commit` are an exception to attaching the
current skill tree. Their provenance document identifies the exact pre-answer skill
snapshot that must be materialized for the with-skill condition. In particular, H11
uses `7d33bf4c492da250c94f48aebd29bb16877d7a36` because the current Example 04
contains its answer, while H21 uses `5f7234ba4e00aeaa46c699ea32384389ad38a2a6`
because it predates the A1-20 migration material and is reachable from upstream
main. No-skill and generic-skill runs keep the same task image and prompt.

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
- **Browser execution where required**: H10 includes Chromium and requires a DOM
  activation marker; a boot-manifest entry or HTTP 200 alone earns only partial credit.
- **Real dual-cohort contracts where required**: H11 invokes two independently locked
  published `HostConnectionService` implementations and records the supplied legacy
  authority object; a mock-only green result cannot earn the cohort points.

## Summarizing Harbor runs

After running trials, aggregate the real Harbor `result.json` files with the bundled
deterministic summarizer instead of relying on Harbor's built-in mean:

```sh
# single group, repeated trials across files
node benchmark/scripts/summarize-runs.mjs \
  --group run:jobs/<job>/<trial>/result.json \
  --group run:jobs/<job>/<other-trial>/result.json

# paired 3-run comparison (per-task medians, group A − group B)
# note: the same file cannot feed both groups — duplicate inputs are hard errors
node benchmark/scripts/summarize-runs.mjs \
  --group with-skill:jobs/with-skill/r1/S1-static-scan__x/result.json \
  --group with-skill:jobs/with-skill/r2/S1-static-scan__y/result.json \
  --group with-skill:jobs/with-skill/r3/S1-static-scan__z/result.json \
  --group no-skill:jobs/no-skill/r1/S1-static-scan__x/result.json \
  --group no-skill:jobs/no-skill/r2/S1-static-scan__y/result.json \
  --group no-skill:jobs/no-skill/r3/S1-static-scan__z/result.json
```

Behavior:

- accepts trial-level and job-level `result.json` (job-level files are expanded from
  `reward_stats` / `exception_stats`);
- repeated trials of the same task aggregate per task (mean / median / min / max /
  perfect) — later runs never overwrite earlier ones;
- exactly two groups produce a paired per-task-median comparison with
  improved / tied / regressed counts; a task present in only one group is listed as
  missing and excluded from the delta aggregates, never treated as 0;
- rewards are extracted from the trial records only — Harbor's precomputed aggregate
  mean is not used, so stopped/unscored trials cannot distort the score;
- trials without a reward are anomalies (never scored as 0); a scored trial that also
  records an execution exception keeps its reward and is flagged;
- default output is Markdown (`--format json` for machine-readable raw numbers);
  duplicate inputs and malformed rewards are hard errors.

## Auditing skill activation

Reward alone does not say whether the agent actually used the skill. The bundled
deterministic auditor measures **skill availability vs observed skill use** along
the activation chain (supplied → discovered → `SKILL.md` opened → references
accessed), with an observed content-bearing access to the target `SKILL.md` as
the primary activation metric:

```sh
# one trial (or a job directory, which expands all trial subdirectories)
node benchmark/scripts/audit-skill-activation.mjs \
  jobs/<job>/<trial> \
  --target-name plugin-upgrade \
  --target-path skills/plugin-upgrade \
  --condition with-skill --json
```

Behavior (full operational definitions and schema in
[docs/skill-activation-audit.md](docs/skill-activation-audit.md)):

- verified input format: Harbor v0.22.0 trial directories with the Codex CLI
  0.152.0 session log (`agent/sessions/**/rollout-*.jsonl`); ATIF-v1.7
  `agent/trajectory.json` is a metadata-only fallback; anything else is a hard
  error, never a guess;
- `ls`/`find`/`stat`/`test`/`echo`, prose mentions, comments, and error-output
  mentions never count as an open; complex shell mentioning the target warns
  (`ambiguous-shell-access`) instead of guessing;
- `opened: false` is a valid result and exits 0 — only unsupported/malformed
  input is an error;
- output is byte-deterministic and redacts absolute paths, command text, and
  command output text.

## Historical documents

All validation and result reports live in [`results/`](results/). When opening a PR
that adds a benchmark result or validation report, put the file there.

Every submitted report must state the **consumed tokens** and the **total run
duration** of each round, next to the scores — e.g. the input/output (cache)
token sums and the summed job duration as recorded in Harbor's trial outputs
(`result.json`, fields `n_input_tokens` / `n_cache_tokens` / `n_output_tokens`). Cost figures are recommended but optional. Scores without these
numbers cannot be compared across models or against later runs.

- `results/validation-report-2026-08-30.md`: the skill-effectiveness validation report (v1
  era). The manual `dsh-verify` container reproduction in its section 6 has been
  replaced by the self-contained environment — each task image is now built with the
  same steps as that section (node:24-bookworm + globally installed pnpm/dsh
  0.1.2-alpha.2).
- The v1 in-house harness of this directory (`run.mjs` + external container) has been
  removed; see git history.

## Notes for maintainers (skip if you are not changing tasks)

- Every fake plugin in a task's `environment/fixture/` has `"private": true` in its
  package.json, and its README states it is "exam material only, do not publish".
  H9-dsh-web-alpha2 and H22-dsh-data-agent-alpha2 are the exceptions: they are
  Apache-2.0/MIT upstream source snapshots and must retain their original package
  metadata. **Keep both safeguards when
  adding ordinary fixture tasks** — the point is to stop anyone from accidentally
  publishing fake plugins to npm.
- When adding a task, scaffold it with `harbor task init`, then fill in
  judge / solve.sh following the layout of the existing 47 tasks, and verify the
  reference answer scores 1.0 with `harbor run -p <task> -a oracle`.
- After adding or modifying prompts, run
  `node benchmark/scripts/validate-execution-contract.mjs` to make sure the
  authorization marker, the read-only/hands-on boundaries, and the `task.toml`
  metadata are consistent.
- When referencing upgrade cards in benchmark Markdown, use the full ID (e.g.
  `DSH-0.1.2-A1-01`, never the shorthand "A1-01"). The repo self-check verifies two
  things: that the ID really exists and that its link resolves; if you get it wrong,
  `node scripts/validate.mjs` fails outright.
