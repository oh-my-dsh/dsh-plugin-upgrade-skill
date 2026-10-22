# S8 · Release Routing Trap (Read-Only)

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be no follow-up user messages. This task brief is itself the user's explicit authorization and confirmation for the approach and execution needed to complete the task: complete the necessary analysis and planning on your own, and keep executing as soon as the plan is formed — do not pause to wait for "confirmation", and do not ask the user follow-up questions. That confirmation continues to apply to the concrete plans you produce under the applicable skill, but only within the following scope:

- You may inspect `/app/fixture/`, in-container local documentation, and local tools read-only; `/app/fixture/` must remain completely unchanged; you may write your report into the designated `/app/agent-output/` directory as the brief specifies;
- You may create temporary files needed for the report and run read-only local scan commands, but you must not execute migrations or installations;
- You must not modify the skill, the evaluator, or the reference answers, and you must not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

I maintain a community plugin published to two public GitHub mirrors. A consumer reported a
two-stage failure and I need a release-engineering diagnosis (static evidence pack in
`/app/fixture/`; read-only — do not modify it). The consumer cannot upgrade their dsh runtime
right now (production freeze), so remedies must work on their current runtime.

**What the consumer did and saw:**

1. They followed the plugin README's default install command, which pins
   `#v0.9.5`:
   ```
   dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.5'
   ```
   → pnpm failed immediately.
2. I bumped the README to the newest tag `#v0.9.7`. The consumer retried, the install
   succeeded this time, and then the plugin's slot entry crashed in the browser:
   `TypeError: useConversation is not a function`. Restarting dsh did not help.

**Your report** (write to `/app/agent-output/S8-release-routing-trap/`, any filename):

1. Attempt-1 root cause: why `#v0.9.5` could not resolve — identify the release-engineering
   defect from the evidence, not a guess about the consumer's network or command;
2. Attempt-2 root cause: why the newest tag installed but the plugin crashes — identify the
   compatibility direction (which artifact targets which DSH version) and tie it to the
   consumer's actual runtime;
3. The exact remedy for the consumer right now (a concrete install command, if applicable);
4. The maintainer-side fix so both defects cannot recur (release tooling + docs).

What is tested: connecting the two failures to their distinct root causes (tag distribution
vs version routing), and giving a remedy that works under the consumer's constraint.
