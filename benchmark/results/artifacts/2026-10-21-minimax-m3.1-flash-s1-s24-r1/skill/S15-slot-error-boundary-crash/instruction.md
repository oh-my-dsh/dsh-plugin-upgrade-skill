# S15 · Vanishing Dock Chips: the Silent Slot Crash (Read-Only)

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be
no follow-up user messages. This task brief is itself the user's explicit authorization and
confirmation for the approach and execution needed to complete the task: complete the
necessary analysis and planning on your own, and keep executing as soon as the plan is
formed — do not pause to wait for "confirmation", and do not ask the user follow-up
questions. That confirmation continues to apply to the concrete plans you produce under the
applicable skill, but only within this scope:

- You may inspect `/app/fixture/`, in-container local documentation, and local tools read-only; `/app/fixture/` must remain completely unchanged; you may write your report into the designated `/app/agent-output/` directory as the brief specifies;
- You may create temporary files needed for the report and run read-only local scan commands, but you must not execute migrations or installations;
- You must not modify the skill, the evaluator, or the reference answers, and you must not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

I maintain the community Web plugin `@org/dsh-attach-input`. Right after shipping v0.2.11
(a hover-preview feature) a user reports: paste a screenshot → the pending-attachment chip
that used to appear above the input box is gone; the paste itself still works; the attach
button is unaffected. The evidence pack in `/app/fixture/` (read-only) has the shipped
component code (v0.2.10), the v0.2.11 diff, and the user thread.

**Your report** (write to `/app/agent-output/S15-slot-error-boundary-crash/`, any filename):

1. The exact root cause: which expression throws, why it throws only when a chip renders,
   why the `||` short-circuit kept it latent through v0.2.10, and why the symptom is "the
   whole dock vanished" rather than "the remove button is broken" (slot-level error
   boundary unmounts the entry; the error is only in the browser console);
2. Why blaming the v0.2.11 diff (the hover-preview additions) is the wrong first
   conclusion — what the correct bisection is (the diff touched the same component; a
   rollback/re-add bisect or a minimal render mount points at the pre-existing line), and
   what evidence distinguishes "new feature crashed the slot" from "old latent bug first
   exercised now";
3. The fix: remove the dangling reference (or scope it properly), and note the two
   hardening patterns the diff should also get (`record?.items ?? []`-style defensive
   reads, optional-chained `event.target.closest?.()`) and why they are cheap insurance in
   slot components;
4. The regression that would have caught this before release: a render smoke that mounts
   the dock/chip component WITH an occurrence present (not the empty state — the empty
   dock returns null before reaching the throwing line), asserting the chip element
   renders without an error-boundary capture;
5. The release-process lesson: why "syntax check only" (`node --check`) was insufficient
   for a lib-only plugin whose component only fails at render time with data present, and
   what the minimum viable pre-ship check for slot-rendering lib-only plugins is.

What is tested: reading a free-identifier render crash and its short-circuit latency,
understanding slot error boundaries (whole-entry unmount, console-only visibility), correct
bisection against a misleading recent diff, and designing a data-present render regression.
