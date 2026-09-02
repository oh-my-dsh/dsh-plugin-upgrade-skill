# H12 reference solution

## Checkpoint in one sentence

The RemoteResult control-flow boundary of
[DSH-0.1.2-A2-02](../../../../skills/plugin-upgrade/references/v0.1.2-alpha.2.md)
and [API-02](../../../../skills/plugin-upgrade/references/api-migration-0.1.2-alpha.2.md):
in alpha.2 an ordinary unary Remote call **resolves** to a `RemoteResult<T>` —
business/carrier/cancellation failures surface as `{ ok: false, error }` and do
not reject; only assembly/programming faults (arity, unmounted method, missing
Context adapter) reject and must propagate. Precision note: `RemoteResult<T>`
already resolved to this shape since the earlier rc.2 boundary — the alpha.2
change this task depends on is the unified failure vocabulary and the runtime
boundary, not the concept of `RemoteResult` itself. The reference report is
[solution/report.md](report.md); the expected judge score is 100.

## Relation to H6

`H6-remote-error-trap` grades the Remote error vocabulary and failure policy
(namespaced codes, cancellation propagation, internal/unknown handling,
silent-swallow avoidance). This task starts **after** that vocabulary migration:
the fixture already uses alpha.2 codes, and the trap is purely control-flow —
the colleague note "the codes are already migrated, so handle all failures in
catch" is wrong because ordinary failures resolve into `ok: false`, not because
the codes are misspelled.

## Grading structure

Six canonical sections, graded independently on their own text: Root Cause 20
(paired ok:false + no-reject), Problems 10, Corrected Implementation 25 (fenced
code only: await + failure branch + `result.error` + value-after-branch),
RemoteResult Control Flow 20, Reject Boundary 15, Error Boundary 10. Hard caps:
throw-centric claim 30; report never mentions result.ok 50; fenced fix reads
`result.value` without the ok branch 60; fenced fix uses instanceof 60; fenced
catch swallows/retries rejects 60. Legacy code may only be quoted inline — a
fenced block is graded as the agent's own proposed fix.

## Boundaries

- Read-only task: the fixture must stay unchanged (modifying it scores 0
  directly); dsh is not installed and no runtime verification is performed;
- The report does not need to cite card IDs; card references appear only in the
  task prompt and README for the with-skill round to consult.
