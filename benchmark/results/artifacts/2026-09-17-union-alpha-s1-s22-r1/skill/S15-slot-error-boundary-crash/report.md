# S15 — Silent dock-slot render crash

## Conclusion

Mode A: read-only diagnosis. The v0.2.10 excerpt contains a definite latent render bug: AttachmentChips reads an undeclared busy identifier. A data-present render in the plain phase reaches it and throws ReferenceError: busy is not defined. The slot error boundary contains the failure by unmounting the dock entry; it does not preserve individual children. The attach button and successful paste can therefore remain unaffected. The fixture does not establish the precise historical trigger or exonerate every addition in v0.2.11.

## Root cause and short-circuit latency

Evidence directory: E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S15-slot-error-boundary-crash/environment/fixture.

plugin-dock-chips.js:7 declares busy inside AttachButton. It is not visible to the sibling AttachmentChips function. At line 34, constructing the remove-button props evaluates:

    disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy

JavaScript OR evaluates its right operand only when its left operand is falsy:

- No matching occurrence: lines 22–23 return null before the map, so busy is never read.
- Matching occurrence and non-plain phase: the left operand is true, so busy is skipped; the remove button is disabled.
- Matching occurrence and plain phase (also the default for missing phase): the left operand is false, so busy is read and throws.

This happens during render, before clicking the remove button. One failing map iteration prevents the whole dock render from completing. user-thread.md:12–15 explicitly describes InputZone's slot-entry error boundary: it unmounts the throwing entry and reports only to the browser console. This is successful containment of the error to one slot, not evidence of a page-wide error-boundary failure. React error boundaries do not generally catch event-handler exceptions.

Short-circuiting and the empty state explain how the bug could remain latent, but do not prove which states v0.2.10 users actually exercised. The claim that users could use the x button normally conflicts with this exact excerpt if they rendered plain-phase matching occurrences with no outer busy binding. No minifier behavior, phase transition history, or console trace is supplied; none is assumed.

## Evidence caveats

feature.diff:32–33 depicts adding || busy, whereas the v0.2.10 excerpt and user-thread.md:10–12 say it already existed. These are inconsistent baselines; compare actual release artifacts before assigning introduction to a release.

The literal diff also places imageItem computation at lines 9–11 outside the map, before the map-local record/status declarations at lines 13–14. Those locals are not visible there. Unless omitted outer bindings exist, status or record can independently throw before the old busy line. Optional chaining does not make an undeclared identifier safe. Thus timing alone cannot prove that hover-preview is innocent.

## Correct bisection and attribution

The recent diff touched the failing component, but proximity is not causality. In an authorized disposable test checkout, mount the v0.2.10 component with a matching occurrence and phase plain; the excerpt predicts the busy ReferenceError without any hover-preview additions. Compare actual v0.2.10/v0.2.11 artifacts under identical inputs. Roll back preview additions while preserving the baseline line, then re-add the additions individually. Capture the first exception's identifier, source location, and component stack; distinguish busy from the added status/record scope errors and items/closest TypeErrors. Remove only the dangling busy read and repeat the same render. These are proposed checks, not executed results. A rollback that merely tests the empty state cannot isolate this bug.

## Fix

Minimal correction in AttachmentChips:

    disabled: (props.input?.phase ?? 'plain') !== 'plain'

If dock removal genuinely depends on asynchronous work, explicitly supply the appropriate shared busy state as a prop or derive it from an owned service; AttachButton's lexical state cannot be accessed by a sibling component. Do not hide the mistake with a typeof guard or a global variable.

Move imageItem computation inside the occurrence callback after record/status are defined. Then use:

    const imageItem = status !== 'missing'
      ? (record?.items ?? []).find(item => isImagePath(item.path))
      : undefined;

record?.items.find(...) already handles a nullish record, but not a present record whose items is nullish. The default empty array handles that missing-data case; it does not validate arbitrary malformed items.

Guard the click target method without accidentally treating undefined as a remove match:

    if (event.target?.closest?.('.remove')) return;

This tolerates nullish targets and targets without closest. Using closest?.(...) !== null alone is wrong: undefined !== null is true. These narrow guards protect transient data and non-Element event targets cheaply; they do not replace fixing scope errors. Test click handling separately because render error boundaries do not generally catch handler exceptions.

## Prevention and rollout

The essential regression mounts the actual shipped dock component beneath an error-boundary spy with at least one occurrence whose source matches SOURCE, a records entry, and phase plain. Assert a .chip and remove button exist, the button is enabled, and the boundary captured nothing. Before the fix, the busy read should fail this test; after it, the same inputs should pass. Also test missing/default phase, non-plain phase (disabled), empty occurrences (null), multiple chips, missing record/items, image and non-image items, remove clicks, and targets without closest. Exercise hover/viewer behavior and verify image resources are released appropriately.

node --check only parses JavaScript; an undeclared identifier inside a function is syntactically legal. Merely importing a lib-only plugin also does not necessarily invoke its data-dependent render paths. Minimum pre-ship validation is syntax checking plus a data-present render smoke for each slot contribution against the delivered lib artifact, with explicit DOM and boundary-capture assertions. Add no-undef linting with only real globals declared. In a real target host, verify registration/mount and paste → visible chip → remove, plus preview behavior and the unaffected attach button; inspect browser console output. A successful package load or HTTP response is not proof that a slot renders. Release only after these gates pass; compare against the previous artifact using identical inputs.

## Completed / skipped / pending

Completed: read the supplied skill and the full task brief, then all four fixture files (README.md, plugin-dock-chips.js, feature.diff, user-thread.md). Identified the free-identifier render failure, correct OR truth table, entry-level containment, contradictory diff baseline, additional preview scoping issue, minimal fix and regression plan. Only this report was written.

Pre-existing baseline: not collected (Mode A; no package scripts run). The source shows a pre-existing v0.2.10 bug; no live runtime baseline was executed.

Skipped: migrations, installation, lifecycle scripts, feature execution, git changes, publishing and external services. Fixture README.md forbids execution there. No host-version corridor was supplied, so no host migration cards or unrelated references were needed; plugin versions 0.2.10/0.2.11 are not DSH host versions.

Pending/residual risk: actual release artifacts, package/lockfile, Git identity, DSH/Node versions, runtime phase history, and console traces are absent from this four-file evidence pack. No build, lint, test, browser mount, bisection, or runtime verification was performed. Exact first-failure ordering in the shipped v0.2.11 artifact needs confirmation. The recommendations above are not claims of passing checks.

Rollback: no fixture, dependency or configuration was changed, so no product rollback is required. For a future authorized repair, preserve the exact prior plugin artifact and profile configuration; restore only owned changes if validation fails. Rolling back to v0.2.10 alone does not remove the latent busy reference shown here.
