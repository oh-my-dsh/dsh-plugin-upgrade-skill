# Review rubric — per-answer dimensions

Work only from the answer text and the task contract. Grade each answer
independently; the same standard applies to every answer file.

Record one number per dimension; 0--100 where a percentage is asked. Use the
same scale for every answer. Write the reason for every non-zero error
finding in `rationale`.

| Dimension | Question | Field | Scale |
|---|---|---|---|
| Diagnostic correctness | Are the identified causes, files, and failure modes factually right for the described problem? | `correctness_score` | 0--100 |
| Migration direction correctness | Is the proposed direction of change (old state to new state) correct, and does it move toward the stated target rather than away from it? | `correctness_score` | part of the same score |
| Critical omission | Is a required step or fact missing, such that acting on the answer would fail? | `critical_error` | `yes` / `no` |
| Unsupported or fabricated claim | Is a claim asserted without evidence in the answer, or asserted about material the answer cannot see? | `unsupported_claim` | `yes` / `no` |
| Contradiction | Does the answer contradict itself, or contradict a fact it states elsewhere? | `contradiction` | `yes` / `no` |
| Citation / card identity | Does the answer cite card or reference identities that exist and match the task material? | `citation_issue` | `yes` / `no` |
| Confidence | How confident are you in this judgement? | `confidence` | `low` / `medium` / `high` |

## Citation and card identity are a separate axis

**Citation / card-id compliance is not functional correctness.** An answer
can cite every card correctly and still be wrong about the migration, and an
answer can be functionally right while citing no card. Score
`correctness_score` on the functional diagnosis alone. If the citation
identities are wrong, also say so in `citation_issue`; do not lower
`correctness_score` merely because a citation is missing or misnamed.
Conversely, do not raise `correctness_score` because citations look complete.

## Authority for "correct"

The per-task rubric authority is the task instruction, fixture, and verifier
contract as they existed at the historical source dataset recorded in
`../sample-manifest.json`, at the original assessment time. If a case is
genuinely ambiguous under that
contract, mark the ambiguity in `rationale` instead of forcing a hard
call, and record your confidence accordingly.

## Recording

Fill only the template you were assigned. Leave a row blank if you have not
reviewed that answer yet; a blank row means "not reviewed", never "no
problem". Do not add columns, do not delete rows, and do not edit the
header. Do not average or summarise across answers here — the coordinator
does that after both reviewers submit.
