# JUDGE BRIEF · noskill.S15-slot-error-boundary-crash

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

# S15: missing attachment dock — read-only diagnosis

## Finding and evidence limits

The v0.2.10 excerpt contains a definite latent render defect: `disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy` inside `AttachmentChips`. `busy` is not declared in that function or a surrounding scope in the supplied source. The `busy` state in `AttachButton` belongs to a different function's lexical scope; sibling components cannot access it. Assuming no unrelated ambient binding, evaluating the right operand throws `ReferenceError: busy is not defined`.

This is a static diagnosis of the provided excerpt, diff, and user thread, not a runtime reproduction. I did not execute fixture code, change the fixture, access network services, or run tests, verifiers, or grading. The pack does not include an actual browser console trace, complete shipped bundles, framework implementation, or a React mounting environment. The slot-boundary behavior below is established by the maintainer's account, not independently observed.

There are two material inconsistencies in `feature.diff`:

- Its removed line lacks `|| busy`, and its added line introduces it, while both the shipped v0.2.10 excerpt and maintainer explicitly say that expression already existed. It is not a trustworthy exact diff against the supplied baseline.
- It places `const imageItem = status !== 'missing' ? record?.items.find(...) : undefined` before `occurrences.map`, outside the callback where `record` and `status` are declared. Taken literally, a populated render reaches this new scope error first: `status` is unbound in the shown lexical environment; if a browser ambient `status` resolves it, `record` is still unbound on the selected branch. Optional chaining does not protect an undeclared identifier. Therefore the supplied diff can itself crash, and cannot prove that the observed v0.2.11 failure was exclusively the old `busy` defect.

## Why the old bug can hide, and why the dock disappears

`AttachmentChips` filters occurrences by `SOURCE` and returns null when none match. That empty state never evaluates the remove-button properties. With at least one matching occurrence, it runs the map callback and evaluates the `disabled` expression immediately during render; no remove click is needed.

For a non-plain phase, the left operand is true and JavaScript `||` skips `busy`, leaving the defect latent. For phase `plain`, or a missing phase defaulting to `plain`, the left operand is false and evaluating `busy` throws. Thus the trigger is a matching occurrence plus a plain/default phase, not simply the existence of any chip. Non-plain renders can hide the failure, although they disable removal. The claim that v0.2.10 users successfully used removal is not fully explained by short-circuiting: this exact excerpt cannot render an enabled plain-phase remove button without resolving `busy`. That historical claim requires the actual deployed artifact, environment, and phase history to reconcile; it is not proof this expression was safe.

The error occurs while constructing the render tree, before a usable remove button is committed. According to `user-thread.md`, the InputZone slot boundary catches the exception and unmounts the whole dock entry, with diagnostic output only in the browser console. Hence the visible symptom is the entire dock disappearing, with no UI banner, rather than merely a broken x button. `AttachButton` is a separate input.left entry with correctly scoped state. Attachment ingestion and sending are separate from rendering the pending-attachment dock, consistent with a successful paste/send and intact + button.

## Correct isolation and bisection

A recent edit to the affected component is a reason to investigate, not sufficient attribution to hover previews. Inspect the console's first exception and stack, and compare real shipped bundles. Use a controlled populated-occurrence render with identical phase and records for both versions. Revert/re-add the preview changes in small units while retaining the same inputs, or mount the old component minimally with one SOURCE occurrence and phase `plain`. The latter reaches the pre-existing `busy` failure without any preview code. An empty-state mount cannot discriminate anything here.

If the actual new bundle's stack first points to preview lookup or an out-of-scope `status`/`record`, that is evidence of a new feature defect. If the old bundle fails at `busy` under the same populated/plain conditions, and removing that reference fixes that mount without previews, that establishes the latent old defect. A rollback appearing healthy only because it renders no occurrences or a non-plain phase is not a valid bisect. Fix or isolate each first exception and rerender to uncover any masked failure. In particular, the literal supplied preview diff must be corrected before concluding that removing `busy` alone repairs v0.2.11. No such bisect or runtime stack was available here.

## Recommended repair

Remove the unrelated state reference from the chip's remove button:

```js
disabled: (props.input?.phase ?? 'plain') !== 'plain',
```

If removal genuinely needs a busy condition, define it in the dock's own state or pass a documented explicit prop from shared state with a safe default. Do not borrow a sibling component's local variable or add a global to suppress the exception.

Move preview selection inside the per-occurrence map, after `record` and `status` are declared, and guard missing item collections:

```js
const record = records.get(occurrence.ref);
const status = record?.status ?? 'missing';
const imageItem = status !== 'missing'
  ? (record?.items ?? []).find(item => isImagePath(item.path))
  : undefined;
```

`record?.items.find(...)` only guards a nullish record; a present record with absent/null items still causes a failure. The fallback guards transient incomplete records cheaply. It assumes items, when present, follow the expected array schema; arbitrary malformed values would require additional validation.

Guard event targets that lack an Element-style closest method:

```js
if (event.target?.closest?.('.remove')) return;
```

Use a truthy result (or `!= null`) rather than retaining `!== null`: an absent method yields undefined, which is also not strictly equal to null and would incorrectly suppress opening the viewer. This protects non-Element targets and keeps clicks on the remove button or its descendants from also opening the preview. These defensive reads are inexpensive in a slot whose entire entry may disappear after a render exception. Handler failures should be tested separately; the supplied evidence only specifies boundary behavior for render failures.

## Regression and minimum pre-ship gate

The decisive regression is a real render smoke of `AttachmentDock` (or `AttachmentChips` through the relevant slot wrapper) under a recording error boundary, with dependencies supplied and at least one occurrence whose source matches SOURCE. Use a corresponding record and phase `plain`. Assert that the chip and filename are present, the remove button is enabled, and the boundary recorded zero errors. Also exercise omitted phase, which defaults to plain. A test that only asserts mounting did not throw is insufficient because the boundary may swallow the exception. A mount with zero matching occurrences returns null before the defect and would pass falsely.

A small matrix should retain an empty case, a non-plain populated case, missing record/items cases, and a populated image case after the preview scope fix. Verify removal calls the correct occurrence, preview opening works, and remove clicks do not also open it. Include the no-closest event-target case for the guarded handler. The plain populated render is the essential regression; other cases cover the cheap hardening and new preview behavior.

`node --check` checks syntax, not lexical identifier resolution on an executed path, component rendering, runtime record shapes, or slot error capture. An undeclared identifier in a syntactically valid function passes that check. A lib-only plugin still contains executable UI logic and must not treat absence of a build step as absence of a validation need.

The minimum viable pre-ship check is syntax validation plus a real render smoke against the distributable lib entry and its registered slot components using representative populated data and normal/default phase, with assertions on expected visible elements and zero boundary captures. Keep the empty-state smoke too, and check the browser console in a host-level paste-to-chip sanity run when available. Static undefined-variable checking would cheaply flag both `busy` and the diff's misplaced preview identifiers, but does not replace the populated render. These are proposed checks; none were run in this read-only task.

## Delivery status

Analysis complete within the available static evidence. No skills used. No fixture modifications or external access. No authorization blocker. Exact first failure in the real v0.2.11 deployment remains unverified because the supplied diff is inconsistent and there is no runtime trace or full deployed bundle.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.