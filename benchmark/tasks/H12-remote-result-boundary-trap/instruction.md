# H12 · RemoteResult Boundary Trap (Read-Only)

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be no follow-up user messages. This task brief is itself the user's explicit authorization and confirmation for the approach and execution needed to complete the task: complete the necessary analysis and planning on your own, and keep executing as soon as the plan is formed — do not pause to wait for "confirmation", and do not ask the user follow-up questions. That confirmation continues to apply to the concrete plans you produce under the applicable skill, but only within the following scope:

- You may inspect `/app/fixture/`, in-container local documentation, and local tools read-only; `/app/fixture/` must remain completely unchanged; you may write your report into the designated `/app/agent-output/` directory as the brief specifies;
- You may create temporary files needed for the report and run read-only local scan commands, but you must not execute migrations or installations;
- You must not modify the skill, the evaluator, or the reference answers, and you must not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

I maintain a DSH client-plane plugin. After our migration to dsh 0.1.2-alpha.2, a
colleague left this review note on our session-rename helper:

> "The codes are already migrated to alpha.2 and RemoteError is typed, so the
> safest pattern is to handle all failures in catch."

`/app/fixture/` in the container holds that helper's source (static copy, not
executable — dsh is not installed here). Please review it **read-only** (do not
modify any file under `/app/fixture/`) and diagnose whether this migration shape
is correct for dsh 0.1.2-alpha.2's Remote control flow. Do not run or install
anything; reasoning from the source, your knowledge of the alpha.2 Remote
contract, and any in-container documentation is enough.

Task boundary: the fixture's error-code vocabulary is **already migrated** — this
task is not about renaming error codes. What you should judge is the control
flow: how an ordinary unary Remote failure actually reaches the consumer, what
`result.ok` / `result.value` / `result.error` mean on the resolved result, what
the `catch` block can and cannot see, and where true rejection boundaries are.

Write your diagnosis to `/app/agent-output/H12-remote-result-boundary-trap/report.md`,
containing exactly these six level-2 headings, verbatim:

```text
## Root Cause
## Problems in the Current Code
## Corrected Implementation
## RemoteResult Control Flow
## Reject Boundary
## Error Boundary
```

Formatting rules (they matter for grading):

1. `Corrected Implementation` must contain your fixed code as a fenced `ts` or
   `js` code block — prose descriptions do not count for that section;
2. When you quote the current (old) code, use inline code like
   `` `return result.value` `` — do NOT put the old code in a fenced block: any
   fenced code block in `Corrected Implementation` is graded as the fix you
   propose;
3. Only content under the six headings above participates in the main grading.
