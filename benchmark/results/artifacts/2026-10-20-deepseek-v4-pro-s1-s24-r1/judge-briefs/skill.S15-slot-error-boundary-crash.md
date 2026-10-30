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

# S15 · Vanishing Dock Chips — Root-Cause & Fix Report

**Mode:** A · inspect (read-only). The fixture directory was left unchanged; this report is the only output.
**Evidence reviewed:** `fixture/plugin-dock-chips.js` (v0.2.10 shipped), `fixture/feature.diff` (v0.2.11), `fixture/user-thread.md`, `fixture/README.md`.
**Relevant card:** DSH-0.1.7-A1-01 — a slot contribution that throws during render is caught by the framework's **slot-level error boundary**, which unmounts the **whole slot entry**; the only trace is a minified console error with no failed request. (That card's trigger is a missing icon export → React #130; the unmount-the-whole-entry *consequence* is the same generic behavior, and applies identically to a free-identifier ReferenceError.)

---

## 1. Exact root cause

The throwing expression is the `disabled` prop value inside `AttachmentChips`:

```js
disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy
```

`busy` is a **free (undeclared) identifier** in `AttachmentChips`. It is only ever declared inside the *sibling* component `AttachButton` (`const [busy, setBusy] = React.useState(false)`); that lexical scope does not extend to `AttachmentChips`. When evaluation reaches `busy`, JavaScript throws `ReferenceError: busy is not defined`.

**Why it throws only when a chip renders.** The `busy` reference sits inside the `occurrences.map(occurrence => …)` callback. With no pending attachment, `AttachmentChips` returns early at `if (occurrences.length === 0) return null` and the callback (and therefore `busy`) is never reached. The empty dock renders fine; the throw requires **at least one occurrence** — i.e. an actual chip.

**Why the `||` short-circuit kept it latent through v0.2.10.** `busy` is the **right** operand of `||`, so it is evaluated only when the left operand `(props.input?.phase ?? 'plain') !== 'plain'` is **falsy**:
- left operand is **truthy** when `phase` is a defined, non-`'plain'` value (input locked / busy / submitting) → `||` short-circuits, `busy` never evaluated;
- left operand is **falsy** when `phase === 'plain'` (or `props.input`/`phase` is nullish, which the `?? 'plain'` normalizes to `'plain'`) → `||` proceeds to `busy` → ReferenceError.

In v0.2.10 the pending-attachment chip only rendered while the composer input was in a **non-`'plain'` phase** — the same phase guard exists precisely to disable the remove button during attachment processing — so the left operand was `true` and the dangling `busy` sat dormant behind the short-circuit. v0.2.11's hover-preview path is the first one that mounts the chip while `phase === 'plain'` (the thumbnail keeps the chip visible in the idle/plain state), so the short-circuit finally falls through and `busy` is evaluated for the first time.

**Why "the whole dock vanished" rather than "the remove button is broken".** The throw happens **during render** — the `disabled` expression is evaluated as an argument to `h()` before React can commit the button. The framework's slot-level error boundary catches the render throw and unmounts the **entire slot entry** (the whole `AttachmentDock`), not just the offending chip. The error appears only as a minified `ReferenceError` in the browser console, which the user never opens; there is no UI banner and no failed request. The attach button (`AttachButton`, the `input.left` slot) is a **separate** slot entry and is therefore unaffected — exactly matching the user's report.

## 2. Why blaming the v0.2.11 diff is the wrong first conclusion

A natural triage is "the crash arrived in v0.2.11 and the v0.2.11 diff touched `AttachmentChips`, therefore the hover preview broke the slot." That is wrong because the diff touched the **same component that already carried the fault**.

**Correct bisection** isolates the throwing line from the feature:
- **Rollback / re-add bisect:** revert only the hover-preview additions (or check out v0.2.10) and mount `AttachmentChips` with a chip present and `phase: 'plain'`. It **still** throws `ReferenceError: busy is not defined` — the feature code is irrelevant to the throw.
- **Minimal render mount:** mount `AttachmentChips` directly (not `AttachButton`, not the empty dock) with `input = { occurrences: [{ source: SOURCE, ref, label, occurrenceId }], phase: 'plain' }`. It throws on the `disabled` line with **zero** hover-preview code present.

**Evidence that distinguishes "new feature crashed the slot" from "old latent bug first exercised now":**
1. **Identifier attribution.** The thrown symbol is `busy`. None of the diff's added identifiers is `busy` — the diff introduces `imageItem`, `isImagePath`, `objectUrlOf`, `openImageViewer`, `closest`, `record?.items`. A genuine feature crash would throw on one of *those* symbols; a `busy is not defined` throw points at the pre-existing `disabled` line.
2. **The shipped base already contains the fault.** v0.2.10 source carries `disabled: … !== 'plain' || busy` with the comment "v0.2.10 hardening pass added the phase guard — and this busy reference". The `feature.diff` misleadingly renders that line as `- … !== 'plain'` / `+ … || busy`, making it *look* like v0.2.11 introduced `busy`; the v0.2.10 artifact disproves that. This is the classic "the diff in front of you isn't the change that caused it" trap.
3. **Repro against the base.** The minimal v0.2.10 mount reproduces the crash, proving the fault pre-dates the feature; v0.2.11 merely *first exercised* it by adding a render path that reaches `busy`.
4. **Console/stack evidence.** The stack points at the `disabled` line, not at any hover-preview line.

*(Secondary finding, not the reported crash:)* the diff also computes `imageItem` **outside** the `.map` callback where `record` and `status` are not in scope, so that addition must itself be moved inside the callback. That is a different latent fault from the `busy` crash the user is reporting, which pre-dates v0.2.11.

## 3. Fix and hardening

**Fix — remove the dangling reference.** The remove button has no `busy` state in this component. Restore the phase-only guard:

```js
disabled: (props.input?.phase ?? 'plain') !== 'plain',
```

If "also disable while busy" was genuinely intended, scope `busy` properly instead of referencing a sibling's local state: lift it into a prop (passed down from `AttachButton`/the add flow) or track it with this component's own `useState`. Never reference a free identifier.

**Two hardening patterns the diff should also get** (cheap insurance in slot components):
1. `(record?.items ?? []).find(...)` instead of `record?.items.find(...)`. `record?.items` only guards a nullish `record`; if `record` exists but `items` is `undefined`, `.find` still throws a TypeError. The `?? []` turns "undefined field" into an empty list.
2. `event.target.closest?.('.remove')` instead of `event.target.closest('.remove')`. If the event target is not an Element (text node / SVG / non-DOM), `.closest` may be `undefined` and calling it throws.

**Why they are cheap insurance specifically in slot components:** any render throw — including a TypeError from a single missing field — is caught by the slot-level error boundary and unmounts the **entire slot entry** (the whole dock), with only a console line to show for it (DSH-0.1.7-A1-01). Defensive reads confine "data was missing" to "that one chip didn't preview" instead of "the whole surface vanished".

## 4. The regression that would have caught this pre-release

A **render smoke that mounts the dock/chip with an occurrence present**, asserting the chip element renders **without an error-boundary capture**:

- **Not the empty state.** The empty dock returns `null` before reaching `busy`, so an empty-state mount passes while the bug ships. The test MUST pass a non-empty `input.occurrences` containing an item with `source === SOURCE`.
- **Use `phase: 'plain'`** — the falsy-left-operand case that actually reaches `busy`.
- Wrap the mount in an error boundary whose capture callback **fails** the test, then assert `.chip` (and `.chip .remove`) is present.

```js
it('renders the dock chip with an occurrence present and never hits an error boundary', () => {
  const onCapture = jest.fn();
  const { container } = render(
    <TestErrorBoundary onCapture={onCapture}>
      <AttachmentChips
        input={{ occurrences: [{ source: SOURCE, ref: 'r1', label: 'shot.png', occurrenceId: 'o1' }], phase: 'plain' }}
        className="dock"
        remove={() => {}}
      />
    </TestErrorBoundary>
  );
  expect(onCapture).not.toHaveBeenCalled();                 // no ReferenceError reached the boundary
  expect(container.querySelector('.chip')).not.toBeNull();
  expect(container.querySelector('.chip .remove')).not.toBeNull();
});
```

Stub/provide the module's free references (`SOURCE`, the `records` map) and — for the fixed v0.2.11 component — `isImagePath`/`objectUrlOf`/`openImageViewer`. Because `AttachmentDock` wraps with `useRevision()`, mount `AttachmentChips` directly or provide the slot/hook context. The property under test is "the chip element renders without an error-boundary capture."

## 5. Release-process lesson

`node --check` only verifies that the file **parses** (syntax). `busy` is syntactically valid — a perfectly legal identifier reference — so `node --check lib/client.js` exits 0 and cannot see the `ReferenceError`, which only manifests at **runtime** when the code path executes with data present (chip rendered + `phase === 'plain'`). For a lib-only plugin whose failure mode is render-time-with-data-present, "it parses" is not "it works".

**Minimum viable pre-ship check for slot-rendering lib-only plugins** is a **data-present render smoke** (point 4), plus — where available — the static gates that actually catch a free identifier at CI time for free:
- a typecheck (`tsc --noEmit`) or a linter with `no-undef` (ESLint) — either catches `busy is not defined` before any render;
- a render mount of every slot component in its **populated** state (and ideally the empty state too) under an error boundary that fails on capture.

The render smoke is the mandatory floor; the static gates are the cheap add-on. Together they turn "ships silently, dies at the user's first paste" into a red CI line.

---

### Residual risk / notes
- The composer phase state machine was not observable from the fixture; the "why v0.2.11 first reached `busy`" step is reasoned from the `||` semantics and the maintainer's note that v0.2.10 users used the remove button without issue. Confirming the exact `phase` value at the crash in the browser console would close that last link.
- This is a read-only Mode A diagnosis; no source, config, or dependency write was performed, so no rollback baseline applies.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.