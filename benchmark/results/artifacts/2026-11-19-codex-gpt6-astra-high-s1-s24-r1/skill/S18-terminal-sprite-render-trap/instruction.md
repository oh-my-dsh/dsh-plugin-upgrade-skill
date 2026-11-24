# S18 · The Terminal Sprite Render Trap (Read-Only)

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

A terminal app renders a pixel sprite (the whale: 25 rows x 40 columns of palette
characters) with the half-block technique - each terminal cell packs two vertical pixels
into one glyph, foreground = upper pixel, background = lower pixel. After an animation
feature was added around the sprite, the user reported phantom pixels hugging the
sprite's right edges (the dark outline, the sleep-Z symbols, the heart), ghost pixels
surviving frame switches, and one drifted frame; flipping the feature default-on then
hung a CI job that had always finished before. The evidence pack is under `/app/fixture/`
(read-only - do not modify it): the renderer code as it shipped, the symptom log, the
frame digest report, and the CI hang evidence.

**Your report** (write to `/app/agent-output/S18-terminal-sprite-render-trap/`, any filename):

1. Phantom pixels: from the renderer code, explain the exact mechanism that paints
   phantom pixels into the EMPTY half of a half-filled cell at the sprite's right edges -
   which SGR state persists across cells, which cells expose it, and the precise escape
   fix;
2. Ghost frames: why do ghost pixels of the PREVIOUS frame survive a switch to a narrower
   frame - what does the renderer drop from each row, what does the text pipeline do to
   trailing whitespace, and the two-part fix that guarantees a clean frame switch;
3. Frame data drift: what does the digest report say about the hand-ported frames, why
   did the existing per-excerpt regression miss the drift, and the gate that prevents it
   from recurring;
4. The hang: from the CI evidence, explain the mechanism that kept the finished job alive
   - what reschedules forever, which hosts mount the component without unmounting it, why
   the interactive terminal is unaffected, and the one-line fix;
5. Prevention: the renderer contract checklist a terminal sprite implementation should
   ship with, and the audit a team should run BEFORE flipping an animation feature
   default-on.

What is tested: reading an ANSI half-block renderer against its visual symptoms (SGR
state persistence, row trimming, erase semantics), recognizing frame-data drift and
pinning it with digests, the timer-pinned event loop behind "finished but hanging" jobs,
and rolling the fixes into a renderer contract and a rollout audit.
