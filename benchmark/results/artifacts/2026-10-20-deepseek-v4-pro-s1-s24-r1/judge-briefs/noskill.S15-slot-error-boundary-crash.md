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

# S15 · Vanishing Dock Chips — Root-Cause Report

Scope: read-only analysis of the fixture (`plugin-dock-chips.js`, `feature.diff`,
`user-thread.md`, `README.md`). No code was executed or modified. Findings below are
derived from the shipped v0.2.10 source and the v0.2.11 diff only.

---

## 1. Exact root cause

**The throwing expression is the `disabled` prop of the chip's remove button:**

```js
disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy
```

Specifically, **the free identifier `busy` on the right-hand side of the `||`** throws
`ReferenceError: busy is not defined` at render time.

`busy` is not declared anywhere in `AttachmentChips` (or in its module scope). It only
exists as `const [busy, setBusy] = React.useState(false)` inside **`AttachButton`** — the
sibling component — as the shipped source itself flags with the comments
`// <-- busy lives HERE` (in `AttachButton`) and `// <-- ???` (on the chip's
`disabled` line). It was copy-pasted from `AttachButton`'s
`disabled: locked || busy` into the chip's `disabled` during the "hardening pass" without
being brought into scope, so it is a dangling reference.

**Why it throws only when a chip renders.** `AttachmentChips` early-returns before the
throwing line when the dock is empty:

```js
const occurrences = (props.input?.occurrences ?? []).filter(item => item.source === SOURCE);
if (occurrences.length === 0) return null;
```

The `disabled: … || busy` expression lives inside the `.map(occurrence => …)` callback,
which only runs when there is at least one `SOURCE` occurrence. An empty dock returns
`null` and never evaluates the identifier; a dock with a pending chip runs the callback
and evaluates `busy`, throwing.

**Why the `||` short-circuit kept it latent through v0.2.10.** `||` evaluates its right
operand only when the left operand is falsy. The left operand
`(props.input?.phase ?? 'plain') !== 'plain'` is the phase-lock guard: it is **truthy**
whenever the composer is in any non-`'plain'` phase (locked/busy/streaming/etc.). On those
paths the guard short-circuits and `busy` is never touched, so the buggy line returns
`true` (button disabled) without erroring. The identifier is only *evaluated* when the
guard is **falsy**, i.e. when phase is exactly `'plain'`. During v0.2.10 the chip was only
ever rendered on non-plain paths, so the reference stayed unexercised. The v0.2.11 repro —
"paste a screenshot" with the composer idle in the plain, editable state — finally rendered
a chip while phase was `'plain'`, the guard short-circuited *through to* `busy`, and the
`ReferenceError` fired.

**Why the symptom is "the whole dock vanished", not "the remove button is broken".** The
throw happens while React is *building* the VDOM for the chip — before any DOM for that
entry is committed. A slot contribution is wrapped in the framework's slot-level error
boundary; a render-phase throw is caught there, and the boundary's handling is to
**unmount the entire slot entry** (the whole pending-attachment dock), not just the button
subtree. The boundary's fallback is empty, so there is no visible error banner; the
`ReferenceError` is only visible in the browser console (via the boundary's error
logging), which end users never open. Hence: paste works, the attach button (a *different*
slot, `input.left`) is untouched, and the dock disappears silently.

---

## 2. Why blaming the v0.2.11 diff is the wrong first conclusion

The v0.2.11 diff *touched the same component* (`AttachmentChips`) to add hover preview,
so the naive bisect is "the new feature crashed the slot." That conclusion is wrong because
the crashing line is **pre-existing**:

- The shipped **v0.2.10** source (`plugin-dock-chips.js`) already contains
  `disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy`. The maintainer's own
  note confirms it was "added in a hardening pass" before v0.2.11.
- The hover-preview additions (`imageItem`, `onClick`, the `hover-card` element,
  `data-image`) are orthogonal to the `disabled` expression. None of them references
  `busy`, and none of them can produce a `busy` `ReferenceError`.

**Correct bisection.** The decisive experiment is a *rollback/re-add* bisect, not a
read-the-diff blame:

1. **Rollback:** check out v0.2.10 and render the dock with a chip present and
   `input.phase === 'plain'` → it **still throws** the same `busy` `ReferenceError`.
   This proves the bug predates v0.2.11.
2. **Re-add:** apply only the hover-preview hunk while deleting the `|| busy` fragment →
   the chip renders fine; re-introduce `|| busy` alone → it crashes. A minimal render
   mount points unambiguously at the `|| busy` line, not at the hover-preview code.

**Evidence that distinguishes "new feature crashed the slot" from "old latent bug first
exercised now":**

- The free identifier (`busy`) is present in the *released v0.2.10 artifact*, so it cannot
  have been introduced by the v0.2.11 diff.
- The crash is a *data- and phase-dependent* render error on a line the diff merely
  reformatted/kept, not a line the feature added (the feature added `imageItem`/`onClick`/
  `hover-card`, none of which is on the throwing path).
- Repro shape: v0.2.10 + "chip present in plain phase" reproduces it; v0.2.11 + "no chip"
  (empty dock) does not. The trigger is "chip present in plain phase", which the new
  paste-a-screenshot usage first exercised, not the hover-preview code itself.

*(Secondary observation, distinct from the `busy` crash: the diff's `const imageItem = status !== 'missing' ? record?.items.find(…) : undefined` is computed at function scope, but `status` and `record` are declared only inside the `.map` callback, so taken literally it introduces its own free-identifier `ReferenceError`. That is a separate defect in the hover-preview code and reinforces "scope it properly" below, but it is not the `busy` short-circuit crash this task asks about — the `busy` line is the pre-existing latent bug.)*

---

## 3. The fix and cheap hardening

**Fix (primary).** Remove the dangling reference, or bring a real `busy` signal into scope
properly:

```js
// simplest correct fix: the phase guard already covers disable-while-locked
disabled: (props.input?.phase ?? 'plain') !== 'plain',
```

`busy` cannot be "scoped" by adding a declaration inside `AttachmentChips` — it is
`AttachButton`'s local state. If the dock genuinely needs a busy-disable, lift that state
to a shared ancestor and pass it in as a prop (e.g. `props.busy`) rather than referencing
a sibling component's hook variable.

**Two hardening patterns the hover-preview code should also get (cheap insurance in slot
components):**

1. **Defensive read:** `record?.items.find(…)` → `(record?.items ?? []).find(…)`. The
   current form still throws `TypeError: Cannot read properties of undefined` when
   `record` is present but `record.items` is undefined. A slot component receives
   arbitrary host-shaped input and cannot trust nested shapes.
2. **Optional-chained `closest`:** `event.target.closest('.remove')` →
   `event.target.closest?.('.remove')` (or guard for an Element target first). `closest`
   exists only on Elements; a text-node/SVG/composed-event target makes the current call
   throw inside the click handler.

Both are "cheap insurance" for the same reason the `busy` bug bit: a slot component runs
in the host's render/event context with host-supplied data, so any assumption about shape or
target that is violated throws — and a *render*-time throw unmounts the entire slot entry
(console-only), while a *handler*-time throw degrades just that interaction. Defensive reads
turn "whole dock vanishes" into "dock renders safely", at the cost of a `?? []` and a
`?.`.

---

## 4. The regression that would have caught this pre-release

A **data-present render smoke** that mounts the dock/chip component **with an occurrence
present**, asserting the chip renders with no error-boundary capture:

- **NOT the empty state.** An empty dock returns `null` before the throwing line, so an
  empty-state mount (no occurrences, or occurrences with a non-`SOURCE` `source`) passes
  trivially and never reaches `busy`. That is exactly why a green "dock renders" smoke can
  coexist with this bug.
- **The state that matters:** pass `input = { phase: 'plain', occurrences: [ { source: SOURCE, occurrenceId: 'o1', ref: 'r1', label: 'shot.png' } ] }` and a
  `records` map with `records.get('r1') = { status: 'ready', label: 'shot.png' }`. This
  satisfies the early-return guard *and* makes the phase guard falsy, forcing evaluation of
  the `disabled` expression (the previously-latent path).
- **Assertion:** render (headless, e.g. `react-dom/server` `renderToString` or jsdom +
  `react-test-renderer`) and assert (a) no throw escapes, and (b) the chip element (a
  `div.chip` / the `button.remove`) is present in the output. Because the framework wraps
  slot entries in an error boundary, a naive "it didn't throw my test" is insufficient — the
  boundary can swallow the error into an empty fallback, so the assertion must be that the
  chip DOM **is present**, not merely that no exception propagated. Optionally wrap in a
  probe error boundary and assert it captured nothing.

Running this smoke against v0.2.10 (or any `|| busy` build) fails: the chip is absent and
the boundary captured a `ReferenceError: busy is not defined`.

---

## 5. Release-process lesson

**`node --check` was insufficient** because it only parses the file for *syntax* errors.
A free identifier used at runtime is perfectly valid syntax; `node --check` reports
success. The defect is a **runtime** (`ReferenceError`) that only manifests when the
component renders *with data present* — a lib-only plugin ships no app entry point, so there
is no code path that executes the component during a syntax-only gate. The result: the
bug shipped and surfaced only when a real user rendered a chip in the plain phase.

**Minimum viable pre-ship check for slot-rendering lib-only plugins:** a **render smoke over
the slot components with representative, non-empty data**, covering the states that reach the
"interesting" lines:

1. Mount each registered slot component (dock, attach button, etc.) headlessly.
2. Use **data-present** inputs, not defaults: at least one occurrence with
   `source === SOURCE`, `phase === 'plain'`, and a populated `records` entry — the exact
   state the empty-state smoke misses.
3. Assert the expected DOM is produced **and** that a probe error boundary captured nothing
   (a real error boundary swallows the throw into an unmount, so "no exception" is not the
   same as "rendered correctly").

This turns "syntax-checked but never-rendered" into "rendered with the data a user will
actually have", which would have executed the `busy` line and caught the `ReferenceError`
before release.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.