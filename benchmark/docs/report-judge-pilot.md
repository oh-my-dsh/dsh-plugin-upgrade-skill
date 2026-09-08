# S1–S4 semantic report-judge pilot

This opt-in pilot grades the same S1, S2, S3 and S4 prompts and fixtures using a
text-only LLM judge with deterministic evidence checks. It generates separate
Harbor tasks. Historical keyword-score artifacts stay intact; the registered S1–S4
tasks now use local deterministic diagnostic rubrics independent of card IDs.
The first live Oracle/Luna validation is recorded in the
[2026-09-06 comparison report](../results/validation-report-2026-09-06-s1-s4-oracle-luna-llm-judge.md).
The subsequent [Oracle-only R2 calibration](../results/validation-report-2026-09-06-s1-s4-oracle-regrade-r2.md)
corrects S1/S3 reference reports and clarifies S2/S4 rubrics; Luna was neither rerun
nor regraded. The repository keeps result reports; raw evidence for both rounds
is retained locally and is not included or packaged in this PR.
Generated tasks have version `2.0.0` and protocol `report-judge-v1`. Do not combine
their scores with historical scores. Regrade both skill conditions with the same
packet, rubric, judge implementation and model configuration.

## Scoring

The judge receives the original instruction, exact fixture text, task-specific
criteria, frozen repository reference excerpts and candidate reports. No comparison
answer, out-of-band tested model identity or skill-condition label is sent. Labels
inside the original candidate text are preserved, so this alone does not guarantee
fully blinded grading. Each criterion is
`pass`, `partial`, `fail` or `missing`; code awards 100%, 50%, 0% or 0% of its weight.
Full credit requires a correct diagnosis with evidence, not a mentioned keyword.
The existing S4 invented-migration cap is evaluated in context, so explicitly
rejecting a bad recommendation does not trigger it.

| Task | Semantic criteria / points |
|---|---|
| S1 | Seven located touchpoints 10 each; justified card mapping 20; scope/verification limits 10 |
| S2 | Located Host break 40; six negative categories 20; inference boundary 20; future verification plan 20 |
| S3 | Chat projection 20; Session lifecycle 20; type/inject migration 20; slots 20; justified mapping/two-step plan 20 |
| S4 | Removed runtime types, registration identity, session content and deleted connection face: 25 each; unsupported migration assertions cap at 70 |

The verifier checks fixture file inventory and SHA-256 against its own sealed
packet, including new/hidden files. It does not trust candidate Git history.
Reports remain free-form; no new agent-visible output schema is required. Candidate
`path:line` citations are checked for path existence and line bounds, and findings
are included in the model input. For any credited criterion, reported quotations
must occur verbatim in a submitted report; source-dependent items also require
verbatim fixture evidence. This proves quotation existence, **not semantic
entailment**: relevance, correctness and approximate code locations remain model
judgments. Nearby historical line-number drift is distinguished from fabricated
files or fabricated code. No arbitrary report code or URL is executed.

Missing reports and fixture modifications are genuine zero-score submissions.
Configuration/network/API errors, refusals, truncation and invalid judge output
produce `details.json`, exit nonzero and leave **no reward file**. They must be
counted as evaluator failures, not candidate zeros. Successful grading writes the
numeric `reward.txt`; rich data belongs in `details.json`, never `reward.json`.
Reports are limited to 32 files / 256 KiB total, with symlinks and special files
rejected. Oversized submissions are rejected explicitly, never silently truncated.

## Offline validation

```sh
npm run test:report-judge
node benchmark/report-judge/calibrate.mjs --out /tmp/report-judge-offline
node benchmark/report-judge/prepare.mjs --out /tmp/report-judge-pilot
```

All three commands are local and require no model credentials. Output directories
must be new. The calibration command without `--live` runs the **current deterministic
diagnostic graders** and prepares evidence; it does **not** simulate LLM semantic scoring.
Its summary mode is `offline-deterministic-only`, and each run records
`deterministic_score` alongside nullable `llm_score`. The exported local interface is
`deterministicScore(task, report)`; it copies the current task tests into a fresh
real-path temporary root and fails explicitly on subprocess or score-packet errors.
No historical keyword grader is reconstructed. Older artifacts retain their original
`legacy_score` fields and must not be interpreted as current-grader output.
The unit tests inject protocol-only responses and cannot establish judge quality.

## Live calibration

Set these environment variables through your local secret-management mechanism;
do not put keys in committed files or command arguments:

- `REPORT_JUDGE_BASE_URL`: an explicitly chosen OpenAI-compatible API base, ending
  at the API prefix (the adapter appends `/chat/completions`).
- `REPORT_JUDGE_MODEL`: the exact chosen judge model or pinned model snapshot.
- `REPORT_JUDGE_API_KEY`: a credential for that endpoint, scoped to the verifier.

The adapter uses a single non-streamed Chat Completions request with
`response_format: {type: "json_object"}`. JSON mode does not enforce the result
schema, so the verifier validates it itself. The selected provider must support
this request format. No provider/model is silently selected, and no sampling
parameters are imposed across incompatible model APIs. API behavior reference:
[Chat Completions](https://developers.openai.com/api/reference/resources/chat).
HTTPS is required except for explicitly local development endpoints; redirects
are rejected and provider error bodies are never logged.

Before live execution, authorize the chosen provider/model to receive the four
fixtures, report texts and frozen reference excerpts. Then run:

```sh
node benchmark/report-judge/calibrate.mjs --live --repeats 1 --out /tmp/report-judge-live
```

This makes at most 28 judge calls (four tasks × seven samples). It stops on the
first infrastructure/protocol error and saves completed evidence incrementally.
`--repeats 3` makes at most 84 calls for repeatability checks. Results include current deterministic
and LLM scores, expected ranges, per-item evidence, request/response hashes,
fixture/reference packets, requested/returned model and provider token usage.
The API key is not saved. A completed live run exits nonzero when an expected
range fails. Retain outputs outside the tracked task corpus.

Samples cover a corrected complete answer, reordered equivalent text, keyword
stuffing, confidently wrong claims, a grader-directed prompt injection, fabricated
citations, and the checked-in reference report (the sample ID remains
`historical-oracle`). Expected ranges are **initial maintainer hypotheses**, not
independently human-validated labels. Oracle reports have no assumed score. The
first archived S3 Oracle incorrectly attributed ConversationSnapshot to cordis;
the checked-in S1/S3 Oracles were subsequently corrected, and S2/S4 criteria were
clarified for category context and closed-book uncertainty. Each preparation uses
the current reports and rubrics; earlier results retain their original packets.
Do not mix scores across these revisions or force an imperfect answer to 100.

Review all complete/alternative false negatives, bad-answer false positives and
repeated-run disagreement with a human before using scores in benchmark claims.
Do not tune the grader only to these visible calibration examples; retain some
independently written reports for a held-out agreement check.

## Reuse a Codex login

`codex-judge.mjs` is an opt-in transport for the same `report-judge-v1` packet,
system instructions, rubric and deterministic evidence/scoring checks. It requires
an explicit model, and can reuse the user's selected local Codex login without an
API key. It has been exercised with Codex CLI 0.153.3. For example:

```sh
node benchmark/report-judge/codex-judge.mjs \
  --packet /tmp/report-judge-pilot/S1-static-scan/tests/packet.json \
  --app /tmp/candidate-app --logs /tmp/candidate-grade \
  --model gpt-6-astra --bin /path/to/codex --effort high
```

The default credential location is `~/.codex/auth.json`; `--auth` selects another
file. Only that file is copied into a fresh temporary `CODEX_HOME`, and the copy is
deleted after the attempt. User configuration, history and installed plugins are
not copied. The judge runs in an empty directory with a read-only sandbox, disabled
shell, browser, apps, skills, memory and subagents, and a structured output schema.
The adapter stops on non-text actions and audits the native trace for tool calls.
Codex's startup warnings use `item.completed/error`; those are retained as
diagnostics, while fatal errors or a missing successful turn prevent scoring.

Each attempt retains the exact input, schema, CLI version/configuration, JSONL
events, native trace, final response, usage, hashes and computed `details.json`.
The `resolved` model is the CLI turn context; `returned` remains null because
Codex's event stream does not expose an independent server-returned model ID.
Record the transport and reasoning effort when comparing scores. API and Codex
transport results are not assumed interchangeable without a paired check.

For a two-stage validation, run Harbor with verification disabled to collect
Oracle/agent reports and fixtures, then use this command on the retained
`artifacts/app` with the same frozen packet for both groups. The scoring phase is
host-side, separate from the solver; it does not test the generated Docker API
verifier. Authenticate Harbor Codex runs using `CODEX_AUTH_JSON_PATH`, rather than
`CODEX_FORCE_AUTH_JSON=true`: Harbor 0.22.0 treats that boolean string as a secret
and replaces every literal `true` in exported JSON, fixture files and reports.
Such damaged exports are evaluator infrastructure failures, not candidate zeros.

## Harbor execution

After preparation, run individual generated task directories, for example:

```sh
harbor run -p /tmp/report-judge-pilot/S1-static-scan -a oracle
```

The checked-in Oracle is retained as a comparison input; this command
does not guarantee a perfect new score. Both with-skill and without-skill trials
must use the same generated task snapshot. The agent instruction and network
policy are copied exactly (including S4's no-network policy); the new verifier is
separate, receives only `/app/fixture` and `/app/agent-output`, and owns the model
credentials/public network phase. `tests/packet.json` freezes the evidence and
the manifest records hashes. No `.git` or agent-installed executable is transferred.
Only the verifier's image contains the reference packet. Container/provider-side
network restrictions for the evaluated agent remain the runner's responsibility.

For an already retained report, materialize the exact original fixture and its
`agent-output/<task-id>/` report under a disposable app directory, then run:

```sh
node /tmp/report-judge-pilot/S1-static-scan/tests/judge.mjs \
  --app /tmp/candidate-app --logs /tmp/candidate-grade
```

The prepared packet is reused without rereading changing skill files. Hashes pin
the actual packet/implementation even if the checkout had uncommitted changes.
Frozen references are repository-maintained contracts, not an independent proof
that every upstream API assertion is correct; adjudicate disagreements against
the exact upstream target before changing the rubric.
