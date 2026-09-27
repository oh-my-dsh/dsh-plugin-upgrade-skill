# S15 — Silent slot render crash

## Scope and evidence

Read the complete task instruction and all four fixture files. This is static analysis only: no fixture code was executed, no install, migration, publishing, or repository modification was performed. The only output is this report. References below are relative to E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S15-slot-error-boundary-crash/environment/fixture/.

## 1. Exact defect and visible symptom

In plugin-dock-chips.js:34, AttachmentChips constructs the remove button with:

```js
disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy
```

The right-hand operand `busy` is an unbound identifier in this function. The state binding at plugin-dock-chips.js:7 belongs to AttachButton, a sibling function; it is not visible to AttachmentChips. Reading it raises `ReferenceError: busy is not defined` in the supplied excerpt. This is consistent with a copied guard, although the actual editing history is not supplied.

The expression is evaluated while constructing elements, not when the remove button is clicked. Occurrences are filtered by SOURCE at line 22. With no matching occurrence, line 23 returns null and never enters the map body. With a matching occurrence, the phase decides whether the erroneous operand is reached:

| State | Outcome in the supplied v0.2.10 excerpt |
| --- | --- |
| No matching occurrence | Returns null before the bad expression |
| Matching occurrence, non-plain phase | Left operand is true; `||` skips `busy`; remove is disabled |
| Matching occurrence, plain phase | Left operand is false; `busy` is read and throws |
| Matching occurrence, missing/null phase | `??` defaults to plain; same throw |

This short-circuit is the precise mechanism that can keep the pre-existing defect latent through v0.2.10: empty or locked-state renders do not exercise it. The feature release prompted a user to try a screenshot and exposed a data-present path; chronology alone does not establish how phase timing changed. The fixture provides no phase trace proving that all v0.2.10 renders were locked or that hover code changed phase timing. Indeed, a locked native button is disabled, so the anecdote that users clicked x successfully cannot be explained solely by saying those same renders were locked. It calls for exact artifact/state verification, not invented history.

According to user-thread.md:12–15, the InputZone slot entry has a render error boundary that catches the failure, unmounts the whole entry, and exposes the error only in the browser console. Thus evaluation of one button prop prevents the entire AttachmentDock from rendering; the symptom is a vanished dock, not a locally broken remove button. The attach button is contributed separately to input.left (plugin-dock-chips.js:2–3), and its own busy state is valid. Paste/attachment data handling can continue despite failure of the presentation entry. This matches a successful image send, surviving + button, and absent UI error banner.

## 2. Bisection, misleading chronology, and evidence limitations

The v0.2.10 shipped excerpt and the maintainer note both explicitly contain the dangling busy reference. Therefore blaming the hover feature simply because its release touched AttachmentChips is the wrong first conclusion. An old bug may first be evaluated by a newly exercised render state. However, this does not establish that the new diff is free of independent defects.

The correct local investigation would be:

1. Mount the supplied v0.2.10 component with a SOURCE occurrence and plain phase, holding props/records constant across versions. Static evaluation predicts the busy ReferenceError. Also mount the empty and locked states to demonstrate the short-circuit distinction.
2. Compare the actual shipped artifacts rather than blindly reversing the supplied diff. Locally remove hover additions while retaining the old guard, then re-add additions in small steps under the identical mount. Do not publish a rollback just to diagnose this.
3. Capture the browser exception and stack, or a test boundary capture. A busy ReferenceError at the disabled expression in the old mount establishes a pre-existing defect. A first exception in a new imageItem expression establishes an additional new defect. Fixing one can reveal the other.

Two inconsistencies in the evidence must not be hidden:

- feature.diff:32–33 depicts `|| busy` as an addition, contrary to the explicitly shipped v0.2.10 file and user-thread.md:10–12. A literal inverse patch would remove that operand and would not reconstruct the supplied old artifact. The shipped excerpt is the direct evidence that this defect already exists; the diff is not reliable version provenance for that line.
- feature.diff:9–11 computes imageItem before the occurrences.map callback, while record and status are declared inside that callback at lines 13–14. As printed, they are out of scope. Without other global bindings, status throws first on a nonempty render, before busy. In a browser where a global status exists, record can instead be the unresolved identifier. Optional chaining on `record` cannot make an undeclared identifier safe. Move the computation into the callback after the declarations.

No actual console stack or runtime reproduction is supplied or collected here. Consequently the report establishes the pre-existing busy defect and its exact trigger, but does not claim that a captured v0.2.11 stack uniquely identifies it as the first exception. The malformed hoisted preview expression can mask it. Both defects can produce the same boundary-level symptom.

## 3. Fix and inexpensive hardening

Remove the dangling reference, retaining the valid phase guard:

```js
disabled: (props.input?.phase ?? 'plain') !== 'plain'
```

If removal genuinely must be blocked during an add operation, pass correctly owned busy state through props or a shared store/context. Calling the same useState hook in two components does not itself share state. Do not rely on a sibling local binding or conceal the defect through a global variable.

Place preview derivation inside each occurrence callback, after record/status are declared, and use an empty-array default:

```js
const record = records.get(occurrence.ref);
const status = record?.status ?? 'missing';
const imageItem = status !== 'missing'
  ? (record?.items ?? []).find(item => isImagePath(item.path))
  : undefined;
```

`record?.items.find(...)` only skips access when record is nullish; an existing record with absent items still throws on `.find`. `record?.items ?? []` makes missing record/items produce no preview rather than a render exception. This is inexpensive protection for transient/incomplete slot data; it does not validate arbitrary non-array values.

Harden click-target inspection too:

```js
if (event.target?.closest?.('.remove')) return;
```

This safely handles a nullish target or one without closest. Do not retain `!== null` with the optional call: absent closest returns undefined, and `undefined !== null` would incorrectly skip all such chip clicks. A genuine matching remove ancestor should skip the viewer; an unmatched/unsupported target should follow the intended fallback. For stronger non-Element handling, normalize the target to an Element before ancestor lookup.

These small guards avoid preventable failures in slot UI. Render-time failures have the broad entry-unmount consequence described above. Ordinary React error boundaries do not generally catch event-handler exceptions, so the closest guard prevents a click-handler failure; the fixture does not establish that such handler errors also unmount the entry. Do not conflate those two failure paths.

## 4. Data-present regression

The required release regression is a real render smoke around AttachmentDock (or a wrapper rendering AttachmentChips), under an error boundary whose capture is recorded. Supply one occurrence with matching SOURCE, ref, occurrenceId, and label; seed records with its record; provide remove and revision dependencies. Use plain phase explicitly.

Assert that a `.chip` element, its label, and its `.remove` button render, that the button is enabled in plain phase, and that the boundary recorded zero errors and did not show its fallback. Merely asserting that mounting does not throw is insufficient when the boundary swallows the exception. A console error spy may supplement, not replace, capture and DOM assertions.

Keep empty and non-plain cases as controls, not substitutes: empty returns null before the bad line; non-plain short-circuits it. Include missing/null phase to exercise the plain default, missing record/items for safe degradation, and an image record for preview rendering. An interaction check should verify that remove does not open the viewer and that a supported chip click does.

On the old component the plain/data-present test should fail at busy; after correction it should show the chip without capture. On the literal preview diff it may fail earlier at status/record until the scope issue is corrected. These are expected results from source analysis, not tests reported as executed.

## 5. Minimum viable pre-ship check

`node --check` only checks parsing. An identifier used outside its intended scope is legal JavaScript syntax, and the expression is not evaluated until a data-present render reaches it. Loading a lib-only plugin, registering its slot, or rendering an empty composer does not prove a chip can render.

Minimum viable gate: check syntax of the exact shipped lib artifact, then mount each registered slot component from that artifact in a browser/DOM-capable React test harness with representative nonempty data and relevant states, especially plain phase here. Assert expected DOM and zero boundary captures; fail on unexpected render errors. If the project has no build, test the checked-in lib artifact directly rather than inventing a build step. A no-undef lint check adds cheap coverage for free identifiers but is not a replacement for the data-present mount. Server rendering alone does not verify the client slot error-boundary behavior.

No runtime test harness or complete plugin/host registration is supplied in this excerpt-only fixture, and fixture execution was prohibited. The report therefore supplies the proposed test and predicted outcomes without claiming execution. Static analysis is complete; runtime confirmation of exact shipped version behavior remains an explicit limitation.
