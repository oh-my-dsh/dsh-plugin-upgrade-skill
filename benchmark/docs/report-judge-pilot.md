# Semantic report judging: default for H4, H6, H12 and S1–S22

The registered `benchmark/tasks/` entries for these twenty-five tasks now use
**LLM-as-judge by default**, using protocol `report-judge-v2`. The ten incident tasks described in
[diagnosis-rubrics.md](diagnosis-rubrics.md) are at task version `4.1.0`; the other
fifteen remain at `4.0.0`.
No generated pilot directory or extra enable flag is needed. This document keeps
its original filename so existing links remain valid.

The original [S1–S4 pilot comparison](../results/validation-report-2026-09-06-s1-s4-oracle-luna-llm-judge.md),
[R2 calibration](../results/validation-report-2026-09-06-s1-s4-oracle-regrade-r2.md)
and [2026-09-10 regex-scored Luna run](../results/validation-report-2026-09-10-codex-gpt-5.6-luna-s1-s10-s12-s15-no-skill.md)
are historical results under their own frozen graders. Do not combine those scores
with version-3 results, or compare skill conditions using different packets or
judge models.

The [seven-task Luna zero-skill run](../results/validation-report-2026-09-10-codex-gpt-5.6-luna-seven-semantic-no-skill.md)
uses the version-3 rubric through the Codex judge transport. The
[default-entry protocol checks](../results/validation-report-2026-09-10-default-semantic-verifiers.md)
separately cover Docker artifact transfer and API response handling with a local mock.

The [S5–S9 Luna zero-skill run](../results/validation-report-2026-09-11-codex-gpt-5.6-luna-s5-s9-semantic-no-skill.md)
uses the same Codex judge transport, scoring 450/500 in one trial per task.

## Run the default task

Configure these variables through your local secret manager/environment before
running Harbor; never commit real credentials:

- `REPORT_JUDGE_BASE_URL`: the chosen OpenAI-compatible API prefix, e.g. ending
  at `/v1`; the adapter appends `/chat/completions`.
- `REPORT_JUDGE_MODEL`: the explicitly selected judge model or pinned snapshot.
- `REPORT_JUDGE_API_KEY`: the credential for that endpoint.

```sh
harbor run -p benchmark/tasks/S1-static-scan -a oracle
harbor run -p benchmark/tasks/S10-paste-rename-and-version-chip -a codex -m openai/gpt-5.6-luna
```

Choose a provider/model permitted to receive the fixture, reference excerpts and
candidate reports. Solver model and judge model are separate settings. No judge
provider/model is selected implicitly. The API must support non-streamed Chat
Completions with `response_format: {type: "json_object"}`; the verifier validates
the returned structure itself. HTTPS is required except for local development
endpoints. Redirects are rejected and server error bodies are never logged.
See the [Chat Completions reference](https://developers.openai.com/api/reference/resources/chat).

The task TOML declares `environment_mode="separate"` and supplies credentials
only under `[verifier.env]`. Agent prompts, fixtures and time limits are unchanged.
Harbor collects `/app/fixture` and `/app/agent-output` into the separate verifier;
the frozen packet and judge source are deployed with `tests/` only. The LLM gets
original task text, rubric, exact fixture text, frozen reference excerpts and
candidate reports. It gets no reference answer or out-of-band solver identity or
skill-condition label. Candidate text can identify its author, so this alone does
not guarantee complete blinding.

The model-free `skill-evaluation` CI controls run the three deterministic tasks in
that suite. S1, S5, S9 and S11 remain in the seven-task model suite; the control manifest
lists them separately under `semanticProtocolTasks`. The same CI job runs
`test:report-judge` for all twenty-five semantic verifiers, with mocked responses and no
model credentials. This validates their protocol, not reference-answer quality.
The manual Actions model job has not been wired to a report-judge credential;
without explicit verifier configuration Harbor rejects it before any trial.
Use a separately authorized local API or Codex run for actual report grading.

## Criteria and scoring

| Task | Criteria / points |
|---|---|
| H4 | Located cache attribution 30; clean/rebuild plan 30; evidence-backed no-source-migration conclusion 40 |
| H6 | Namespaced codes, cancellation, internal/unknown failures, genuine exception boundary: 25 each |
| H12 | Root cause 20; current defects 10; fenced fix 25; resolved flow 20; reject boundary 15; structural discrimination 10 |
| S1 | Seven located touchpoints 10 each; justified card mapping 20; scope/verification limits 10 |
| S2 | Located Host break 40; six negative categories 20; inference limits 20; proposed verification 20 |
| S3 | Chat projection, Session lifecycle, type/inject ownership, slot registration, justified mapping/plan: 20 each |
| S4 | Runtime removal, registration identity, session content, deleted connection face: 25 each |
| S5 | Official short name, service collision advice, shared-event context, surface coverage/registry limits: 25 each |
| S6 | Corridor net state, remove marker stripping, informational producer, public append gap: 25 each |
| S7 | Published-version evidence, caret resolution, workable baseline plan, reproducibility/exit: 25 each |
| S8 | Missing mirror tag, compatibility direction, frozen-runtime remedy, tag distribution, version-routing docs: 20 each |
| S9 | Projection contract, repeat-paste failure, removal bookkeeping, conversion/success gate, regressions: 20 each |
| S10 | Paste naming/scope, live conflict state, stale-tag display, regressions, release hygiene: 20 each |
| S12 | Native-module owner, browser/host sequence, dist-tag resolution, exact alpha.5/TUI commands, README prevention: 20 each |
| S15 | Busy scope/trigger, slot boundary, attribution/isolation, fix/hardening, data-present regression: 20 each |
| S11 | Split-chunk attribution, Windows containment attribution, safe route fix, modal event ownership, and incident regressions: 20 each; unsafe containment caps at 40 |
| S13 | Removed API/crash, peer-check boundary, two distinct breakage categories, author prevention, and pre-install checks: 20 each; claiming peers prove runtime compatibility caps at 20 |
| S14 | Junction deployment, host locks/client cache, rename recovery, ordered activation, and install-mode preflight: 20 each; copying onto the junction or browser-only host activation caps at 40 |
| S16 | Self-host failure, interrupted-install signature, external pinned repair, handoff protocol, and guard/post-upgrade checks: 20 each; self-host execution caps at 20 and manual shim repair at 40 |
| S17 | Whole-combo attribution, diagnosis/packaging, cross-entry slot registration, boot/restart discipline, and host/author prevention: 20 each; affirmative contradictory core operational advice caps at 0 |
| S18 | Half-cell background, frame clearing, frame-data integrity, timer liveness, and renderer/rollout prevention: 20 each; affirmative contradictory renderer/timer advice caps at 0 |
| S19 | Baked version/release order, client-host asymmetry, payload corruption, validated render fallbacks, and forensics/prevention: 20 each; affirmative unsafe release/render advice caps at 0 |
| S20 | Native install failure 20; static-import trap 20; platform lock contract 20; reproducible local patch 25; machine/upstream boundaries 10; justified corridor mapping 5. Caps: VS requirement 50, ignore-scripts-only or upstream editing 40, real lock bypass 20 |
| S21 | Metadata-chain attribution, valid probes/partitioning, distractors/tab scope, ordered mitigation, and upstream forensics/fail-loud diagnostics: 20 each; invalid probe attribution or plugin workaround/duplicate insertion caps at 40 |
| S22 | Duplicate-loader attribution, three layering cases, minimal profile fix, plugin/failure boundary, and author/host prevention: 20 each; retaining/adding the duplicate or fixing this crash in plugin code caps at 20 |

See the [incident-rubric guide](diagnosis-rubrics.md) for the ten incident
S tasks, their cap semantics and evidence boundaries.

The LLM returns `pass`, `partial`, `fail` or `missing` for every criterion.
Deterministic code awards 100%, 50%, 0% or 0% of its weight and applies declared
caps; it ignores any total invented by the model. S4's 70-point cap requires a
positive unsupported lifecycle/inject assertion. Rejecting a bad example is not
an endorsement.

S5 retains a 30-point cap for unsupported blanket all-clear claims; S6 and S7
retain 10-point caps for affirmatively keeping marker stripping or prescribing
an exact unpublished npm alpha.1 install. Rejected examples do not trigger caps.
S7 accepts one complete install plan. S8 requires the missing v0.9.3 tag to be
distributed before its consumer install and includes version-routing docs. S9
keeps task item 5 unscored. S5–S9 also have Chinese paraphrase, correct-negation
and contradictory-final-advice calibration samples.

Judgment considers meaning across paragraphs, lists, tables and code. Synonyms,
negation, pseudocode and `expect` assertions may establish the same conclusion.
Bare keywords/card numbers and copied questions are not a diagnosis. S10's
extension/MIME and chip/upload-display guidance stays unscored, as its prompt
states. S15's rubric acknowledges contradictions in the supplied diff and accepts
grounded discussion of additional scope errors; it does not force a claim that
every hover addition is harmless.

The model reads the complete reports, sealed fixture and references directly. It
returns only criterion ID, verdict and short reason, plus cap ID, boolean and
short reason. It does not transcribe quotations or return evidence/source/reference
arrays. Code validates IDs, completeness, verdicts and bounded reasons, then
computes points and caps. Whether the report actually supports each criterion is
a semantic judgment, not an exact-string quotation check. Source-required criteria
still require the candidate to locate the relevant source. Full inputs, model
responses and hashes remain available for human review.

## Submissions and evaluator failures

- Missing/empty reports, exact token-equivalent copies of the prompt, and fixture
  changes score zero without a model call. Shared prompt phrases are not removed
  from independent answers. More elaborate copying/injection is evaluated as
  untrusted text by the LLM.
- Complete fixture inventory and SHA-256, including hidden/new files, are checked
  against the verifier-owned packet. Candidate Git history is not trusted.
- Configuration/API/network errors, refusals, truncation and malformed decisions
  produce `details.json`, exit nonzero and leave **no reward file**. They are
  evaluator failures, not candidate zeros. Previous rewards are cleared before
  evaluation, including before a possible outer timeout.
- Successful grading writes scalar `reward.txt` and rich `details.json`. Reports
  are limited to 32 files / 256 KiB. Symlinks, special files and oversized
  submissions are rejected, never silently truncated.

## Maintain and freeze the verifiers

Edit `benchmark/report-judge/rubrics.mjs` (the ten incident rubrics live in
`diagnosis-rubrics.mjs`) and shared `judge.mjs`, then run:

```sh
npm run sync:report-judge
npm run test:report-judge
```

Synchronization materializes twenty-five standalone judges, sealed packets, shell
entries, verifier Dockerfiles and task configurations. It removes superseded
keyword helpers. CI runs `--check` and rejects drift in the implementation,
fixture, instruction or referenced source bytes. Checked-in packets omit HEAD,
so unrelated commits need no regeneration; hashes seal the actual content.

Optionally freeze a separate run/regrade snapshot:

```sh
node benchmark/report-judge/prepare.mjs --out /tmp/report-judge-run
```

It creates the same default tasks plus a manifest. Output must be a fresh directory
outside `benchmark/tasks`; normal runs do not need this preparation step.

## Calibration

```sh
node benchmark/report-judge/calibrate.mjs --out /tmp/report-judge-offline
node benchmark/report-judge/calibrate.mjs --live --repeats 1 --out /tmp/report-judge-live
```

The first command only prepares samples and inputs; it does not call a model or
simulate semantic scores. The live command uses explicit API configuration and
prepares/evaluates every registered task and its base/focused samples. The ten
incident tasks each add bilingual, correct-negation, contradictory-final-advice
and partial-answer cases. The generated `summary.json` records the exact task/sample
count; `--repeats` controls repeated live calls. It stops at the first
infrastructure/protocol failure, saving
completed evidence incrementally.

Samples cover complete/reordered answers, bare keywords, wrong claims, injection,
fabricated citations, copied prompts and the checked-in Oracle. Expected ranges
are calibration hypotheses, not independent human labels; Oracles have no assumed
score. Unit-test replies are protocol fixtures and do not establish semantic
quality. Inspect real false positives/negatives and disagreement before making
benchmark claims; do not tune only to visible examples. Preserve model identities,
packet/judge hashes and usage alongside scores.

The [S5–S9 default-verifier validation](../results/validation-report-2026-09-11-s5-s9-default-semantic-verifiers.md) records a 20-sample, one-repeat Codex-transport check with complete answers, Chinese paraphrases, keyword-only reports and contradictory final advice. It is a scoped calibration result, not a paired skill-condition comparison or a live Docker/API run.

## Regrade using a Codex login

The alternative host-side `codex-judge.mjs` transport uses the same packets,
rubrics and decision validation, for an existing Codex login without an API key:

```sh
node benchmark/report-judge/codex-judge.mjs \
  --packet benchmark/tasks/S1-static-scan/tests/packet.json \
  --app /tmp/candidate-app --logs /tmp/candidate-grade \
  --model YOUR_AUTHORIZED_JUDGE_MODEL --bin /path/to/codex --effort high
```

`candidate-app` contains retained `fixture/` and `agent-output/` directories. For
a two-stage run, collect solver artifacts in Harbor with verification disabled,
then grade here using the same packet for every comparison group. This route does
not test the Docker API transport. `--model` is mandatory; authentication defaults
to `~/.codex/auth.json`, or the file selected by `--auth`.

Only that credential is copied into a temporary Codex home and deleted after the
attempt. User configuration, history and plugins are not copied. The judge has an
empty working directory, read-only sandbox, disabled tools/skills/memory and a
structured output schema. Non-text actions or an unsuccessful turn prevent
scoring. Input, schema, configuration, events, trace, final response, hashes and
usage are retained. The resolved model comes from CLI turn context, not an
independent server-returned ID. API and Codex transports are not presumed
interchangeable without a paired check.

For solver authentication use `CODEX_AUTH_JSON_PATH`, not
`CODEX_FORCE_AUTH_JSON=true`: Harbor 0.22.0 can redact literal `true` values in
exported artifacts. Damaged exports are infrastructure failures, not valid zeros.

## H4 / H6 / H12 migration

These remain static diagnosis tasks. Their version-3 semantic scores must not be
pooled with historical regex scores. H4 allows deletion of the original sealed
`lib/` artifacts only; source, manifests and all other files stay unchanged.
Original artifacts remain in the verifier packet for evidence and citation checks
after cleanup. H6/H12 require the entire fixture to remain unchanged.

H6 remains closed-book: a located namespace-migration diagnosis with unavailable
exact spelling marked unconfirmed earns partial credit (12.5 of 25), rather than
the old integer 12. H12 retains the requested report sections and fenced proposed
fix; the model judges its control flow rather than spelling or variable names.
The code is not executed. Missing substantive evidence earns no credit; rejected
bad examples must not trigger recommendation caps.

The three rubrics and their caps are defined in `report-judge/rubrics.mjs`.
Calibration includes the previously full-scoring wrong H4 answer, wrong H6/H12
policies, keyword dumps, prompt copies, injection, and correct/contradictory
negations. Prepared expected bands are hypotheses, not measured model results.

## Decision-only output (protocol v2)

Task version 4.0.0 removes required evaluator quotation/source/reference arrays
and exact quotation matching. It retains the same rubric weights, fixture gates
and point/cap aggregation. It supersedes protocol-v1 version-3 output; archived
results remain unchanged. Regrade retained answers under a single version when
comparing results, and record the new judge/prompt/packet hashes.

```json
{"decisions":[{"id":"criterion-id","verdict":"partial","reason":"The diagnosis is correct but the verification plan is incomplete."}],"caps":[{"id":"cap-id","triggered":false,"reason":"The report rejects the incorrect recommendation."}]}
```

This example illustrates the response shape; a real response must include every
criterion and every cap declared by its packet exactly once.
