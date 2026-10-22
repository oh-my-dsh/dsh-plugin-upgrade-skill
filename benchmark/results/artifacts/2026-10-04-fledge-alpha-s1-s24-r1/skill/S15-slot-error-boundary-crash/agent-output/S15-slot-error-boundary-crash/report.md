# S15 — Vanishing Dock Chips: Silent Slot Crash — Analysis Report

Evidence reviewed (read-only): `fixture/plugin-dock-chips.js` (shipped v0.2.10 code),
`fixture/feature.diff` (v0.2.11 hover-preview diff), `fixture/user-thread.md`, `fixture/README.md`.
No external docs were needed; all conclusions are derivable from the evidence pack.

## 1. Exact root cause

**The throwing expression** is the remove button's `disabled` expression inside
`AttachmentChips` (fixture `plugin-dock-chips.js:34`):

```js
disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,   // <-- ???
```

`busy` is a **free identifier** here. The `busy` state is declared inside `AttachButton`
(`plugin-dock-chips.js:7`: `const [busy, setBusy] = React.useState(false);`), which is a
sibling component — that binding is *not* in scope for `AttachmentChips`, and `AttachButton`
never passes `busy` in as a prop. When the JavaScript engine actually evaluates the right
operand of that `||`, it throws `ReferenceError: busy is not defined`. It is a
*scope/render-time* error, not a syntax error — the file parses cleanly and bundles fine.

**Why it only throws when a chip renders.** `AttachmentChips` early-returns `null` for the
empty dock (`plugin-dock-chips.js:23`: `if (occurrences.length === 0) return null;`). The
throwing line lives inside the `occurrences.map(...)` callback for the remove button, so it
is only evaluated when at least one occurrence survives the `SOURCE` filter. With zero
attachments the component is inert — the bug is data-present.

**Why the `||` short-circuit kept it latent through v0.2.10.** `busy` sits on the *right*
operand of `||`. The left operand, `(props.input?.phase ?? 'plain') !== 'plain'`, is
evaluated first; whenever it is `true` (any non-plain phase — every state in which v0.2.10
had effectively been exercised at dock-render time), `||` short-circuits and `busy` is never
individuated, so the `ReferenceError` never fires. The latent reference only throws on the
first render where the left operand is falsy — i.e. `phase === 'plain'` **and** at least one
chip present. That combination is exactly what the v0.2.11 paste → screenshot → pending-chip
flow produces immediately, so v0.2.11 merely *first exercised* a path v0.2.10 had carried
since its "hardening pass" (the maintainer's own note in `user-thread.md` confirms the line
pre-dates the diff). v0.2.10's users never hit plain-phase + chip-present during testing, and
`node --check` says nothing about either scope or runtime evaluation — hence "latent".

**Why the symptom is "the whole dock vanished," not "the remove button is broken."** The
`ReferenceError` propagates out of the `AttachmentChips` render (through `AttachmentDock`,
which calls it directly) into the slot framework's render path. The plugin registers the dock
through the `InputZone` slot, and the framework wraps each slot entry in an **error
boundary**. A boundary catching a render error unmounts its entire entry — the whole dock,
all chips, including ones that were rendering fine — and reports the error only to the
browser console. Users never open devtools, so there is no visible signal: no banner, no
broken-x-button — just a dock that never appears. The attach button (`input.left`) and the
send path are separate entries with their own boundaries and their own state (`busy` is
correctly scoped inside `AttachButton` itself), which is why "the paste worked" and "+ is
unaffected." Console-only visibility + whole-entry unmount is precisely the trap that made
this look like "the feature ate my chips."

Note also that the diff itself repeats the same species of bug — its added hover-preview
block (`feature.diff:9-11`) reads `status` and `record` at `AttachmentChips` body level where
only `occurrences` is defined (they exist only inside the `occurrences.map` callback), and its
`disabled` line again references `busy` (`feature.diff:33`). Those lines would independently
throw for any chip present. That is a review finding in its own right, but it is why the diff
is the *prime suspect* — and it does not change the root-cause verdict below.

## 2. Why blaming the v0.2.11 diff is the wrong first conclusion — correct bisection

The diff is the newest thing that touched the file, so it is the obvious suspect. But the
failure is a *free identifier* crash, and the identifiers involved (`busy` in v0.2.10's
shipped code) pre-date the diff. Wrong-first-conclusion: "the hover-preview feature crashes
the slot." Correct procedure:

1. **Rollback/re-add bisect.** Revert `feature.diff` (back to the shipped v0.2.10 tree) and
   re-introduce the pre-existing `disabled: ... || busy` line (or simply mount the v0.2.10
   component itself): the crash still reproduces → the diff is exonerated as the *cause*.
   Conversely, keep v0.2.11's code but fix the free identifiers: the crash goes away → the
   hover-preview rendering itself is innocent.
2. **Minimal render mount.** Mount `AttachmentChips`/`AttachmentDock` directly with one
   occurrence present and `phase: 'plain'`, no diff applied: same
   `ReferenceError: busy is not defined`. The crash needs no v0.2.11 code at all.

Evidence that distinguishes "new feature crashed the slot" from "old latent bug first
exercised now":

- The thrown error names **no** v0.2.11 symbol (`isImagePath`, `objectUrlOf`,
  `openImageViewer`, the hover-card path are all absent from the throwing expression). The
  stack points at the `disabled` expression, which the diff only *re-touched*.
- Reverting the diff does not remove the crash; applying the diff on a tree with the
  dangling reference removed does not produce it. (The diff's own out-of-scope `status` /
  `record` / `busy` reads must of course be fixed too — they are the same bug pattern, and
  they make the diff *look* guilty on casual reading, which is exactly why a clean bisect
  rather than code-stare is required.)
- The trigger is data (≥1 occurrence, plain phase), not the new feature's interaction
  (hover, click-to-view, blob URLs). Any chip — non-image included — crashes at its first
  plain-phase render.
- The user's report matches: a previously-working component vanished overnight on a feature
  release that didn't obviously change chip rendering logic; "old latent bug, newly
  exercised" fits, "hover preview unmounts the slot" does not (hover code never runs — the
  render dies earlier, in the remove-button props).

## 3. The fix

Primary fix — **remove the dangling reference** (minimal, correct):

```js
// fixture plugin-dock-chips.js:34 — delete the busy reference:
disabled: (props.input?.phase ?? 'plain') !== 'plain',
```

The chip's remove button has no business reading the attach button's "busy" state; removal is
driven by `props.remove(occurrence)`. If a pending-attachment global busy state is genuinely
needed, it must be **scoped properly**: lifted into the shared composer/input store (read
from `props.input`, the way `phase` already is), or passed down explicitly — never referenced
barely in `AttachmentChips`. While in there, the same dangling-reference audit applies to the
v0.2.11 diff: the `imageItem` computation (`feature.diff:9-11`) references `status` and
`record` before/without their defining scope — it must move **inside** the `occurrences.map`
callback, right where `const record = ...` / `const status = ...` actually exist.

Two hardening patterns the diff should also get, both cheap insurance in slot components:

- **Defensive reads: `(record?.items ?? []).find(...)`** — the diff's
  `record?.items.find(item => isImagePath(item.path))` (`feature.diff:10`) throws a
  `TypeError` the moment `record` exists but `items` is missing (records map populated
  incrementally, partial hydration, a record without items). Slot props/context are often
  partially populated while the framework streams updates; `?? []` makes the read total.
- **Optional-chained handler: `event.target.closest?.('.remove')`** —
  `feature.diff:22` assumes `event.target` is always an `Element` with `closest`. In slot
  renders the target can be a text node, a synthetic/replayed event, or a wrapper node from
  the host; `closest?.()` turns a hard `TypeError` into a benign `undefined`, which the
  `!== null` check then handles. Same insurance class: never assume host-provided objects
  carry the full DOM API.

## 4. The regression that would have caught this before release

A **render smoke that mounts the dock/chip component with data present**:

- Mount `AttachmentDock` (or `AttachmentChips` directly) in a jsdom/happy-dom render with
  `props.input.occurrences` containing **at least one** item where `source === SOURCE`, and
  the records lookup seeded for that occurrence's `ref` (`status`, `label`, `items`), with
  `phase: 'plain'` (the non-plain phases short-circuit past the bug — see §1).
- Assert the chip element actually renders (`.chip` present, `data-status` set, name label
  shown) **and** that no error-boundary capture occurred (spy on the boundary's captured
  error / on `console.error`, and assert the boundary's fallback did not render).
- Crucially, **do not test the empty state**: mounting with `occurrences: []` returns `null`
  at `plugin-dock-chips.js:23` and never reaches the throwing line — it would pass
  vacuously while the bug ships. The same applies to asserting "component renders without
  throwing" while only exercising the plain-phase-never path. A data-present render of each
  registered slot component must be the default smoke, with the empty state as a separate,
  explicitly-labeled case.

Such a test fails on v0.2.10 code (ReferenceError out of the render), passes after the fix,
and guards every future free-identifier / scope slip in slot render paths.

## 5. Release-process lesson

**`node --check` is a parse check, not an execution check.** A free identifier like `busy`,
`status`, or an out-of-scope `record` is *syntactically* valid JavaScript — `node --check`
will pass it every time. The error only materializes when the containing expression is
evaluated: render time, data present (`occurrences.length > 0` — the empty dock returns early
and never reaches it), and the right `||`/`??` branch taken (plain phase). For a **lib-only**
plugin there is no host application in CI that would mount the component with real data, so
the component's first real execution with an attachment present can be inside a user's
session — exactly where it now "crashes silently," surfaced only as a vanished dock and a
console error.

Minimum viable pre-ship check for slot-rendering lib-only plugins:

1. A **render smoke per registered slot component** (the dock, the `input.left` button, …)
   mounted with representative, **data-present** props — non-empty occurrences, seeded
   records, plain phase — asserting the expected DOM appears and no error boundary captured
   anything. jsdom/happy-dom is enough; a real browser is nicer but not required.
2. Keep it as a **CI gate on every release**, alongside the existing syntax/type checks —
   which remain necessary but are never sufficient for render-path crashes.
3. Preferably, also render each slot component's fallback/empty state, but never *instead
   of* the data-present path.

That single smoke — present-data render, boundary-clean — would have failed on both the
v0.2.10 latent line and the v0.2.11 diff's scoping slip, and would have caught this before
v0.2.11 shipped.

---

*Scope note: analysis used only the in-cell evidence pack; fixture left untouched.*
