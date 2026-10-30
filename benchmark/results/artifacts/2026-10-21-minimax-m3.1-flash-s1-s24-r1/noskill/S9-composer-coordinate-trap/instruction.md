# S9 · Composer Coordinate Trap (Read-Only)

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be no follow-up user messages. This task brief is itself the user's explicit authorization and confirmation for the approach and execution needed to complete the task: complete the necessary analysis and planning on your own, and keep executing as soon as the plan is formed — do not pause to wait for "confirmation", and do not ask the user follow-up questions. That confirmation continues to apply to the concrete plans you produce under the applicable skill, but only within the following scope:

- You may inspect `/app/fixture/`, in-container local documentation, and local tools read-only; `/app/fixture/` must remain completely unchanged; you may write your report into the designated `/app/agent-output/` directory as the brief specifies;
- You may create temporary files needed for the report and run read-only local scan commands, but you must not execute migrations or installations;
- You must not modify the skill, the evaluator, or the reference answers, and you must not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

I maintain a community Web plugin (`@org/dsh-attach-input`) that turns pasted clipboard
files into composer attachments. Two users reported bugs on DSH `0.1.2-alpha.3` and I
cannot reproduce the failure logic by reading my own code alone — the evidence pack in
`/app/fixture/` (read-only — do not modify it) contains my plugin's relevant client-code
excerpt, a captured browser session log, and the two host source files my code calls into.

**What the users did and saw:**

1. Paste a screenshot → an attachment chip appears above the input box and one inside the
   composer. Works fine.
2. Paste a second screenshot → a toast: `The DSH composer changed before the attachment
   could be inserted`. The second chip never appears.
3. Click the × on the chip above the input box → the chip does not go away; its size label
   changes to `unavailable`, and the chip inside the composer stays too.

**Your report** (write to `/app/agent-output/S9-composer-coordinate-trap/`, any filename):

1. Why the FIRST paste succeeds and every later paste fails with that toast — name the exact
   mismatch between what my code computes and what the host verb's guard compares against,
   and explain why "first works, later fails" is the signature of that mismatch;
2. Why the × click turns the chip into `unavailable` instead of removing it — trace the
   removal path and the plugin-side bookkeeping around it;
3. The fix direction: which values must be converted, by what rule (derive it from the host
   source excerpts, not guesswork), and at which call sites — both the insert path and the
   removal path;
4. A regression test plan: the exact interaction sequences that must be asserted so both
   bugs cannot silently return;
5. What I should routinely check in the host source before calling input-machine verbs, so
   this class of defect is caught before release.

What is tested: tying both symptoms to one underlying contract misread (not two unrelated
bugs), deriving the correction rule from the host source rather than trial and error, and a
regression plan that covers the repeat-interaction and removal sequences. Report items 1–4 are
scored; item 5 (the maintainer's routine source-reading discipline) is guidance for
completeness and is not scored.
