# H21 provenance, distillation, and contamination control

## Real incident

- Upstream project: [`ccch1mneyyy/dsh-TUI`](https://github.com/ccch1mneyyy/dsh-TUI)
  (the fork mirror that hosts the dsh-tui migration history referenced by the
  plugin-upgrade skill's field notes; `oh-my-dsh/dsh-plugin-upgrade-skill`
  Issue #139 claims this task as `A1-20 question-answerer waterfall`).
- Migration pull requests: [`#622`](https://github.com/ccch1mneyyy/dsh-TUI/pull/622)
  and [`#647`](https://github.com/ccch1mneyyy/dsh-TUI/pull/647).
- Verified commits: [`17b81dee6112b97957500cd17214a8a13b73e3fe`](https://github.com/ccch1mneyyy/dsh-TUI/commit/17b81dee6112b97957500cd17214a8a13b73e3fe)
  (`#622`, alpha.1 support; the legacy registration is its parent state) and
  [`ee3a0a1adf52dbc6904b171134d61fb0f7760d8f`](https://github.com/ccch1mneyyy/dsh-TUI/commit/ee3a0a1adf52dbc6904b171134d61fb0f7760d8f)
  (`#647`, alpha.2 validation). The GitHub commit metadata confirms both PR
  associations; the fixture remains a purpose-written distillation rather than a
  byte-for-byte source copy.
- Upgrade-card seam: `DSH-0.1.2-A1-20` ("`userQuestions.registerProvider`
  removed, answerers moved to the `'user-questions/request'` waterfall"),
  `skills/plugin-upgrade/references/v0.1.2-alpha.1.md`, including the 2026-08-28
  dsh-TUI #622 field note (capability probing, agent filtering, proactive
  takeover of agentless requests, bind-after-channel-setup because `/new`,
  `/resume`, and rewind change the agent id) and the 2026-08-30
  dsh-tui@0.1.2-rc.28 → alpha.2 loader-composition field note.

What the corridor actually changed, cross-checked against the two **published npm
packages** (fixed versions, see below):

- rc.2 `@deepseek-ai/dsh-user-questions@0.1.1-rc.2`: `UserQuestionService`
  carries one exclusive active provider seat; `registerProvider(provider)`
  returns a disposer, a second registration rejects with `DUPLICATE_PROVIDER`,
  and `ask()` without a provider rejects with `NO_PROVIDER`.
- alpha.2 `@deepseek-ai/dsh-user-questions@0.1.2-alpha.2`: `registerProvider` no
  longer exists; `ask()` dispatches a request over the context's
  `'user-questions/request'` waterfall (`ctx.waterfall`, falling back to
  `NO_PROVIDER`), scoped via `@deepseek-ai/dsh-scope` when the request carries a
  live agent, and on the service's own Context when it does not. The
  cancellation code is `ASK_ABORTED` in both published versions; the request
  vocabulary (questions, options, intents, agent, signal) is otherwise
  unchanged at this seam.

The fixture is a purpose-written, private distillation, **not copied dsh-tui
source**: it keeps the observed failure shape (mock green, newer real host
broken), the retained rc.2-era single-seat semantics, and the answerer
entry contract with current-owner claim, foreign delegation, owner swap, and
disposal. It contains no React/Ink/TTY/UI code, no auth or credentials, no
provider-guard logic, and no other dsh-tui subsystem. The oracle maps to the
fixed commit's call contract. The event string of the new registration surface is
deliberately absent from `instruction.md` and the fixture README; it remains
discoverable from the read-only published cohort package that the task explicitly
permits the agent to inspect.

## DSH versions and executable cohort choice

| Role | Version / commit | Evidence |
|---|---|---|
| Installable legacy cohort | `dsh-v0.1.1-rc.2` / `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e` | [deepseek-harness tag](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.1-rc.2); published `@deepseek-ai/dsh-user-questions@0.1.1-rc.2` and `@deepseek-ai/dsh-scope@0.1.1-rc.2`; frozen closure `environment/cohorts/rc2/pnpm-lock.yaml` |
| Incident preview source | `dsh-v0.1.2-alpha.1` / `cd5ef8148158c3a752a658978873241fdf8e2bbc` | [alpha.1 user-questions source](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.1/packages/interaction/user-questions/src/index.ts) already lacks `registerProvider` (per the A1-20 card source links); no alpha.1 build of this package was published to npm |
| Executable newer cohort | `dsh-v0.1.2-alpha.2` / `0a53fb55bea101816fa226bb964ae2bed71c343b` | [alpha.2 user-questions source](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.2/packages/interaction/user-questions/src/index.ts); published `@deepseek-ai/dsh-user-questions@0.1.2-alpha.2` and `@deepseek-ai/dsh-scope@0.1.2-alpha.2`; frozen closure `environment/cohorts/alpha2/pnpm-lock.yaml` |

alpha.1 cannot be installed from npm. The task therefore executes the exact
published alpha.2 package closure to keep repeated multi-model trials cheap and
registry-reproducible, mirroring H11's cohort strategy. At the measured seam the
alpha.1 source and the published alpha.2 package agree (no provider seat; request
waterfall dispatch), establishing behavioral substitution only for this
registration seam. The task does not claim alpha.1 and alpha.2 are equivalent
elsewhere.

Each `environment/cohorts/*/pnpm-lock.yaml` freezes the full package closure
(`@deepseek-ai/cordis@4.0.2` plus the matching `dsh-user-questions` /
`dsh-scope` line and their auto-installed peer closure), so the Dockerfile's
`--frozen-lockfile --ignore-scripts` install is registry-reproducible.

## Agentless topology boundary (recorded fact, not a bug)

In the published alpha.2 package, an `ask()` without an agent dispatches on the
user-questions service's own Context (`this.ctx.waterfall(...)`), while an
`ask()` with a live agent dispatches scope-targeted through
`@deepseek-ai/dsh-scope`. An answerer listener on that same Context can receive
agentless requests; a listener registered by a sibling entry in the same fiber
tree is not automatically reached. H21 therefore instructs agents to prove
agentless delivery only where the listener and the service share one Context, and
records sibling-entry non-delivery as a topology boundary rather than a universal
behavior claim.

## Licensing

The fixture, prompts, and provenance are purpose-written for this benchmark and
contain no upstream source lines, so no upstream license text is reproduced or
required. The cohort closures reference published npm artifacts; their respective
package licenses are governed by those packages, which the benchmark only
installs into the disposable image from the registry.

## Verified and unverified boundaries

Verified during fixture construction:

- both cohort closures install cleanly from npm with a frozen lockfile
  (rc.2 and alpha.2) and import correctly;
- the fixture's mock `npm test` is green;
- the initial rc.2-era source registers on a real `UserQuestionService` built
  from the published rc.2 closure and forwards an `ask` to the answerer;
- the same source throws on the published alpha.2 service (no
  `registerProvider`), which is the intended starting failure.

Not verified (kept out of this task's score claims):

- the sealed judge has been exercised with the local Linux-installed cohort
  copies, but the Docker image and Harbor oracle still need a container run;
- no full dsh host/agent spine run, TUI panel render, keyboard interaction, or
  provider credentials — and no real-agent `CALLER_NOT_LIVE` /
  `DELEGATED_CALLER` exercise, which needs a live dsh-agent registry;
- the commit↔PR correspondence for `17b81dee`/`ee3a0a1a` has not been
  re-verified upstream byte-for-byte;
- the registry artifacts may be unavailable if a prerelease is later withdrawn;
  the frozen lockfiles and integrity fields are the reproducibility boundary.

## Contamination control

The current main skill tree already contains the full `DSH-0.1.2-A1-20` recipe
(the `'user-questions/request'` event string, the claim/delegate semantics, and
the dsh-tui field notes), so a with-skill trial against the current tree would
measure answer retrieval, not transfer — the same situation H11 handles with its
frozen skill snapshot. H21 therefore evaluates the following pre-answer snapshot, which predates
all answer-bearing material for this migration seam:

- commit: `5f7234ba4e00aeaa46c699ea32384389ad38a2a6`
- tree: `817a48e6795b40a51a08befff62dd03d55e124df`
- `git archive` SHA-256 (Linux Git 2.43, the CI/Harbor canonical value): `0906ca558c02b20fe095f50ddd3120fab8001e12caccba91613d7ede3bfd7f97`
- path: `skills/plugin-upgrade`

The snapshot contains neither A1-20 nor an answer-bearing example. The metadata
records these hashes so the evaluation runner can materialize exactly this tree;
H21 must not be run in any with-skill condition against the current skill tree.
No-skill and generic-skill conditions are unaffected. No H21 score is included in
this contribution until the task and snapshot are accepted.
