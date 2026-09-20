# S24 · The Dock That Vanished Together (Read-Only)

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be
no follow-up user messages. This task brief is itself the user's explicit authorization and
confirmation for the approach and execution needed to complete the necessary analysis and
planning on your own, and keep executing as soon as the plan is formed — do not pause to
wait for "confirmation", and do not ask the user follow-up questions. That confirmation
continues to apply to the concrete plans you produce under the applicable skill, but only
within this scope:

- You may inspect `/app/fixture/`, in-container local documentation, and local tools read-only; `/app/fixture/` must remain completely unchanged; you may write your report into the designated `/app/agent-output/` directory as the brief specifies;
- You may create temporary files needed for the report and run read-only local scan commands, but you must not execute migrations or installations;
- You must not modify the skill, the evaluator, or the reference answers, and you must not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

## Scenario

A maintainer upgrades dsh in place (npm global, 0.1.6-alpha.1 → 0.1.6-alpha.2) on a
Windows web profile with six external client plugins. After the upgrade + restart, TWO
things appear broken at once: the session-progress strip is entirely gone from the
composer dock, AND the paste/attachment plugin's chip rail no longer renders when files
are pasted (its attach button, mounted in a different slot, still shows). F12 shows
exactly one render error. The maintainer reinstalled the attachment plugin to no effect,
then ran one experiment whose result is the decisive evidence.

The evidence pack is under `/app/fixture/` (read-only — do not modify it):
`symptom-report.md`, `console-excerpt.txt`, `tried-notes.txt`,
`plugin-a/SessionProgressBar-excerpt.tsx`, `plugin-b/dock-entry-excerpt.md`,
`host-types/slots-contract-alpha1.d.ts`, `host-types/slots-contract-alpha2.d.ts`,
`host-types/dock-render-tree.md`, `README.md`.

**Your report** (write to `/app/agent-output/S24-dock-cotenant-crash-trap/`, any
filename):

1. **Culprit attribution**: which plugin actually fails, at which exact call, and why
   now (what changed in the standard kit between the two contracts)? Use the console
   error and the two type excerpts. Then explain why the innocent co-tenant's dock
   entry disappears with it — name the mechanism, and use the render-tree note to
   explain why the attach button in a different slot survives while the chips do not.
2. **The experiment**: the maintainer's disable-experiment is the decisive evidence.
   Explain exactly what it proves and what it does not (does it prove plugin B is
   bug-free on alpha.2? does it prove the strip crash is the ONLY dock problem?).
   Also explain why reinstalling plugin B could never have helped, and what is wrong
   with the colleague's "both plugins were hit" theory.
3. **The fix**: write the corrected component code (fenced) using graceful
   degradation for the removed seats — state exactly which feature of the strip
   degrades and which parts keep working, and why the degradation must be silent
   rather than throwing. Where does subagent pending/running detection move to if
   the plugin later wants full function back?
4. **Multi-tenant hygiene**: what should a dock tenant do so its own crash cannot
   take down co-tenants, and what could the HOST change so one entry's failure
   isolates to that entry? Name the trade-off the host faces.
5. **Verification**: how to verify the fix restores BOTH plugins' dock entries
   without a host restart, and what regression the verification must cover for
   plugin B specifically.

What is tested: attributing a co-tenant crash from a single error and a control
experiment, reading a standard-kit reduction from sealed contracts, writing
graceful-degradation code, and reasoning about slot isolation boundaries.
