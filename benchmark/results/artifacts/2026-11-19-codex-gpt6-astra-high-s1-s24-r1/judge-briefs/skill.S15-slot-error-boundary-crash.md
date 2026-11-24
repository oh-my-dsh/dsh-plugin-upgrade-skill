# JUDGE BRIEF · skill.S15-slot-error-boundary-crash

## Criteria (sealed rubric)
- [busy-scope-and-trigger] (20pt) Locate the disabled expression in AttachmentChips: (props.input?.phase ?? plain) !== plain || busy. busy is local to sibling AttachButton and unbound in AttachmentChips. Explain empty occurrences return null before the map, while a present occurrence in plain phase makes the left guard false and evaluates busy, causing ReferenceError. Accept not declared/not in scope and equivalent language.
- [slot-boundary] (20pt) Explain that a render exception is caught by the slot error boundary and removes the whole dock entry, rather than only the remove button; the separate attach-button slot survives. The diagnostic is in the browser console, not a user-facing banner.
- [attribution-and-isolation] (20pt) Use the shipped v0.2.10 expression to establish that busy already occurs in the baseline. Propose a data-present plain-phase baseline mount or rollback/re-add isolation to locate it. Do not force a claim that the hover diff is harmless: feature.diff is inconsistent with the baseline about the old disabled line and places imageItem before the callback-scoped status/record. Credit grounded discussion of these extra defects/inconsistencies. The evidence does not prove exactly when every historical user first exercised the failure.
- [fix-and-hardening] (20pt) Remove the dangling busy reference or explicitly provide properly owned state/props, preserving the phase guard. Harden missing arrays with record?.items ?? [] (or equivalent) and DOM targets with event.target?.closest?.(...) or a safe element/type check. Scope hover lookups to where record/status are defined. Equivalent safe fixes count; do not require an exact patch or executing changes in this read-only task.
- [data-present-regression] (20pt) Propose a render/mount test with a matching occurrence in plain phase, asserting the chip/remove control exists and the error boundary captures no exception. Explain why an empty-state-only test misses the expression and why node --check/parsing cannot resolve free identifiers or execute the component. Assertions using expect/DOM queries and ordinary prose both count. Include a data-present slot smoke in pre-ship checks, without requiring an actual test run here.

## Caps (score ceilings; judge returns each with triggered true/false)
(none)

## Candidate report(s)
#### FILE: S15-slot-error-boundary-crash/report.md

# S15: pending attachment dock render failure

## Completed: read-only diagnosis

Mode A (inspect). Read `skills/plugin-upgrade/SKILL.md` and its `references/troubleshooting.md`, then all four fixture files. Plan: inspect the shipped component, compare the feature excerpt and user report, identify the failing render path, and report the minimal repair and regression. BENCHMARK-AUTH-v1 authorizes this report without another confirmation. No fixture source was modified or executed, no installation or migration was run, and no network was accessed.

Identity: community Web plugin `@org/dsh-attach-input`, shipped component excerpt v0.2.10, reported failure after plugin release v0.2.11. These are plugin versions, not host version boundaries. Host/Node versions, repository SHA, dependency cohort and actual installation identity are not supplied by this static pack. No host migration card or dependency update is warranted by this evidence.

## Root cause and exact evaluation path

In `plugin-dock-chips.js`, `AttachmentChips` constructs the remove button with:

```js
disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy
```

The throwing subexpression is the read of the free identifier `busy`: `ReferenceError: busy is not defined` in the supplied lexical context. `busy` is declared by `React.useState(false)` inside **AttachButton**, a separate sibling function. That lexical binding is unavailable to AttachmentChips; sharing a file or composer does not share function-local state.

The crash happens during rendering, before any click. JavaScript must evaluate the button props object before calling `h`, so the remove button cannot even be constructed. AttachmentDock calls AttachmentChips directly and the exception escapes that dock render.

Two gates explain the latent behavior:

1. The occurrence list is filtered by `item.source === SOURCE`. With no matching occurrences, the function returns null before mapping or evaluating `disabled`. An empty dock mount proves nothing about this branch.
2. With at least one matching occurrence, `||` evaluates its right side only when the phase comparison is false. A non-plain phase makes the left side true and bypasses `busy`; a plain phase makes it false and reads `busy`. An absent/null phase defaults to `plain` and also triggers the read. Thus the regression needs **both a matching occurrence and a plain/default phase**.

The old line was already defective in v0.2.10. Earlier empty-state or non-plain-phase observations could leave it latent; trying a pasted screenshot in the ordinary editable phase exposes it. This is a conditional explanation, not proof of the exact state used by every v0.2.10 user. The claim that users successfully used the x button cannot establish that this precise source rendered in plain phase: with the supplied scopes that path necessarily throws. The historical phase/build details are not in the pack.

The maintainer explicitly describes the InputZone slot boundary in `user-thread.md`: an entry that throws during render is caught and unmounted, with the error only in the browser console. Consequently the **whole dock entry** disappears, rather than just a disabled/broken remove button. There is no UI error banner. The attach button belongs to the separate input.left slot and owns its valid local busy state, so it survives. Attachment data ingestion and sending can still work even though its dock presentation failed. Those separate outcomes match the report.

## Attribution and bisection, including contradictory evidence

Release timing and a diff touching AttachmentChips are not sufficient to blame hover-preview behavior. The strongest evidence for a pre-existing defect is the v0.2.10 source itself plus the maintainer's explicit statement that the same `|| busy` line already shipped. A minimal populated plain-phase render of that source would reach the free identifier without any hover code, image decoding, object URL, or click.

The correct controlled bisection holds host, occurrence, record and phase constant: compare v0.2.10 and v0.2.11; roll back only preview additions while retaining the actual old remove-button expression; then re-add preview changes individually. Inspect the browser exception and stack at each step. If the no-preview version still fails at `busy`, and removing that dangling reference restores the dock under the same input, the preview is not necessary for this crash. A genuinely new preview crash instead disappears when its particular addition is removed, and its stack identifies that addition. Rolling back everything at once, changing input data or testing only the empty state cannot distinguish these explanations.

**The evidence pack is internally inconsistent and must not be silently normalized.** `feature.diff` shows the old disabled expression without `|| busy` and the new one with it, contradicting both the shipped v0.2.10 excerpt and the maintainer note. It is therefore not a reliable exact historical patch for dating that line; use the stated shipped-source baseline and verify actual release artifacts in a follow-up.

There is also a second, independent bug if the preview diff is taken literally: its `const imageItem = status !== 'missing' ? record?.items.find(...) : undefined` is inserted **before** the occurrence map, whereas `record` and `status` are declared **inside** the map callback. Those bindings do not exist in the outer scope. In the supplied context, a populated literal post-diff render first throws at `status`, before it reaches `busy`; `record` is also wrongly scoped. That is not a temporal-dead-zone explanation for the inner constants: they belong to a different scope. Move imageItem computation into the per-occurrence callback after the record/status declarations. In an actual browser an unrelated global named status could mask the first lookup, but it would still be wrong and would not supply the per-occurrence record.

Accordingly: the old `busy` render bug is certain from the shipped excerpt; claiming it is the sole or first exception in a literal v0.2.11 reconstructed from this diff is not justified. The browser stack or actual shipped v0.2.11 artifact would distinguish the first failure. Fixing only the preview scope could simply reveal the older `busy` failure next. No live bisection or mount was run because this fixture explicitly forbids execution.

## Minimal fix and preview hardening

For the supplied dock, remove the dangling reference:

```js
disabled: (props.input?.phase ?? 'plain') !== 'plain'
```

If an independent dock busy condition is actually required, introduce an explicit correctly scoped state/prop with a defined owner and lifecycle; do not attempt to use AttachButton's private binding or hide the error with an arbitrary global. Retain AttachButton's legitimate local busy guard.

Within `occurrences.map`, after reading record/status, the preview calculation should tolerate absent records and absent item lists:

```js
const imageItem = status !== 'missing'
  ? (record?.items ?? []).find(item => isImagePath(item.path))
  : undefined;
```

`record?.items.find(...)` protects an absent record but does not protect a present record whose items is undefined. The fallback array makes missing/transient data produce no preview instead of a render exception. This assumes present items have the expected array/item shape; arbitrary malformed data requires explicit validation.

For the click handler, guard the optional DOM method:

```js
if (event.target?.closest?.('.remove')) return;
```

This permits event targets without a closest method and still prevents remove-button clicks from opening the viewer. Do not mechanically retain `!== null` after optional-chaining: an absent method returns undefined, and `undefined !== null` would incorrectly suppress other clicks. Defensive data reads and DOM-method guards are cheap insurance in slot components, where one small exception can erase the entire entry. The click guard protects an event-time path; it does not fix the render-time free identifier.

## Regression and minimum pre-ship gate

The essential render smoke mounts the real AttachmentDock/AttachmentChips under an error boundary with a capture spy, providing the expected React/h/context dependencies and a functioning revision hook. Use a matching SOURCE occurrence with occurrenceId, ref and label, a corresponding valid record, and `input.phase: 'plain'`. Assert that `.dock .chip` and its name/remove button render, that the remove button is enabled, and that no boundary capture occurred. This reaches the old failing expression immediately, with no hover interaction required. The unpatched source would fail this assertion; that is a predicted result from static analysis, not a claimed executed test.

Also cover omitted phase (defaults to plain), populated non-plain phase (renders with remove disabled), and empty occurrences (returns null with no capture). The non-plain and empty cases are useful controls, not replacements for the populated plain case. For the preview repair add a missing record, a record with absent items, and a real image item; exercise hover/view and remove clicks, including a target without closest. Assert remove calls the callback and does not open the viewer. Reset/remount the boundary between cases so one captured failure does not mask subsequent outcomes.

`node --check` parses JavaScript; it neither resolves all runtime identifiers nor calls components with attachment data. Both a dangling `busy` and the misplaced preview variables are syntactically valid JavaScript. A lib-only package can have no compiler stage that would otherwise catch undefined names, and an import/registration-only check or empty mount still never enters the failing branch.

Minimum viable pre-ship validation is syntax checking **plus an executed data-present render smoke of the shipped lib component under a boundary**, with plain phase and capture assertions. An undefined-name lint check is an inexpensive addition. Verify registration/mount in the supported host/browser and perform one actual paste-to-chip path with the console visible; confirm chip presence, remove behavior and the new image-preview interaction before shipping. Dependency installation success or an HTTP 200 is not evidence of a healthy slot render.

## Validation status, skipped work and rollback

- Pre-existing: no executable baseline collected. The dangling reference is established statically in the supplied v0.2.10 source.
- Completed: evidence review, precise short-circuit/scope analysis, minimal repair proposal, preview hardening and regression design.
- Skipped: executing fixture code, tests, installs, migrations, publication and host upgrades, as outside the read-only authorization. No evaluator or unrelated repository content was consulted.
- Pending/residual risk: exact shipped v0.2.11 artifact, actual browser stack, historical v0.2.10 render state and live boundary verification are absent. The diff inconsistencies prevent an honest claim that the first production exception has been directly observed.
- Rollback: no fixture or installation changes occurred, so none are needed. Rolling back to v0.2.10 alone is not a reliable fix for the old dangling reference. The only new artifact is this report under the designated agent-output directory.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.