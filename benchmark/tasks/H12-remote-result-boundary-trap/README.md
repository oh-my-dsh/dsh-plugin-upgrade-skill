# H12-remote-result-boundary-trap · RemoteResult control-flow boundary (Read-Only Markdown Diagnosis)

The agent diagnoses a client-plane helper whose alpha.2 error vocabulary is
**already migrated** (namespaced codes), but whose control-flow boundary is
wrong: it assumes ordinary unary failures reject into catch, reads
`result.value` without checking `result.ok`, discriminates with `instanceof
RemoteError`, and converts genuine assembly/programming rejects into a retry
loop. The trap: the colleague note at the top of the fixture — "the codes are
already migrated to alpha.2 and RemoteError is typed, so the safest pattern is
to handle all failures in catch".

**Relation to H6**: `H6-remote-error-trap` owns the error vocabulary / failure
policy axis (legacy → namespaced codes, cancellation propagation, internal /
unknown handling, silent-swallow avoidance). H12 deliberately starts after that
migration and grades a different axis: the resolved `RemoteResult` vs rejected
Promise boundary — `ok:false` vs catch, `.error` vs `.value`, and genuine
assembly/programming rejects as a separate exception boundary. Error-code
migration is **not** graded here.

Checkpoint references: card
[DSH-0.1.2-A2-02](../../../skills/plugin-upgrade/references/v0.1.2-alpha.2.md),
ledger [API-02](../../../skills/plugin-upgrade/references/api-migration-0.1.2-alpha.2.md),
and the [rollup "Remote call error flow"](../../../skills/plugin-upgrade/references/rollup-0.1.2.md)
section. Task statement in [instruction.md](instruction.md), grading logic in
[tests/judge.mjs](tests/judge.mjs).

- **Environment**: `node:24-bookworm` + git (the fixture is committed as a git baseline for the read-only gate); dsh is not installed (this task is pure diagnosis).
- **Verifier**: the judge parses the six canonical Markdown sections and grades each section's own text (Root Cause 20 / Problems 10 / Corrected Implementation 25 / RemoteResult Control Flow 20 / Reject Boundary 15 / Error Boundary 10); the Corrected Implementation is graded from its fenced code block only; direction-aware checks plus five hard caps; 0-100 normalized to `/logs/verifier/reward.txt`.
- **Oracle**: `harbor run -p benchmark/tasks/H12-remote-result-boundary-trap -a oracle`, expected reward 1.0.

## Negative controls (no model API)

| Control | Procedure | Expected reward |
|---|---|---|
| A · no report | run the verifier without writing a report | 0 |
| B · keyword stuffing | report contains RemoteResult/result.ok/isRemoteFailure etc. but none of the six canonical sections | 0 |
| C · H6-perfect but H12-wrong (differential) | a thorough H6-style answer (code vocabulary, retry policy, no instanceof) that still claims failures throw / are handled in catch and never mentions the ok:false / no-reject boundary | ≤ 0.30 |
| D · wrong throw/catch model | Root Cause claims "ordinary remote failures throw, use try/catch" | ≤ 0.30 |
| E · value without ok | correct diagnosis but the repair code reads result.value without a prior result.ok branch | ≤ 0.60 |
| F · instanceof fix | repair code discriminates with instanceof RemoteError | ≤ 0.60 |
| G · swallowed rejects | repair code catches rejects and retries/returns null instead of propagating | ≤ 0.60 |
| H · oracle | solution/report.md | 1.00 |
| I · honest quoting | inline/prose quotes of the bad current code + a fully correct fix (anti-false-positive guard) | ≥ 0.90 |

```
environment/fixture/   # read-only fixture: wrongly-bounded session-rename helper (codes already namespaced)
tests/                 # judge.mjs + judge-utils.mjs + test.sh
solution/              # six-section reference report + solve.sh
```
