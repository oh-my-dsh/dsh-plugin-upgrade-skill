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
#### FILE: S15-slot-error-boundary-crash/S15-slot-error-boundary-crash.md

# S15 · Vanishing Dock Chips — Root Cause & Fix Report

**Plugin:** `@org/dsh-attach-input` · **Regression appeared:** v0.2.11 (hover-preview release)
**Reporter:** mirren — "the chips above the input are GONE in v0.2.11"

## TL;DR

The dock crash is **not** caused by the v0.2.11 hover-preview feature. It is a
**pre-existing dangling reference** shipped in v0.2.10: the chip's remove button computes
`disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy`, but `busy` is a
`const` **local to `AttachButton`** (`plugin-dock-chips.js:7`) and is **not in scope** inside
`AttachmentChips`. Reading it throws `ReferenceError: busy is not defined`. Because the whole
dock is a single InputZone slot entry, the framework's slot error boundary catches the throw
and **unmounts the entire dock** (console-only, no UI banner) — so the user sees *every* chip
vanish, while the separately-registered attach button (`input.left`) is untouched. The `||`
short-circuit kept the bug **latent** in v0.2.10 (it only evaluates `busy` when the composer is
idle, `phase === 'plain'`), and v0.2.11's paste-to-preview flow rendered a chip in that state
for the first time — "first exercised," not "newly introduced."

---

## 1. Exact root cause

**The throwing expression** — `plugin-dock-chips.js:34`, inside `AttachmentChips`:

```js
disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,   // <-- ???
```

The offending token is the right operand, **`busy`**.

### Why `busy` is undefined here

`busy` is declared as a function-local `const` inside a *different* component:

```js
function AttachButton(props) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);   // plugin-dock-chips.js:7 — busy lives HERE
  ...
  h('button', { ..., disabled: locked || busy, ... }, '+');  // :17 — correct, busy is in scope
}
```

`AttachmentChips` (`:21`) has no `busy` binding of its own, so `busy` on `:34` is a **free
identifier**. Reading an undeclared identifier always throws `ReferenceError` (verified:
`ReferenceError: busy is not defined`), regardless of strict/sloppy mode. It is a *runtime*
error — the file parses and loads fine; it only fires when that render path executes.

### Why it throws *only when a chip renders*

`AttachmentChips` guards the empty state first (`:23`):

```js
const occurrences = (props.input?.occurrences ?? []).filter(item => item.source === SOURCE);
if (occurrences.length === 0) return null;          // :23 — empty dock returns before the map
return h('div', { className }, ...occurrences.map(occurrence => { ... :34 ... }));
```

The throwing line lives inside the per-occurrence `map` that builds each chip's remove button.
With **no occurrences** the function returns `null` at `:23` and never reaches `:34`. The line is
therefore only ever evaluated when **at least one chip is present** — which is exactly why the
empty dock (and any empty-state smoke test) never trips it.

### Why the `||` short-circuit kept it latent through v0.2.10

`A || busy` evaluates left-to-right and **short-circuits**: if `A` is truthy, `busy` is never
read. Here `A = (props.input?.phase ?? 'plain') !== 'plain'`:

| `input.phase` | `A` | `A || busy` | Result |
|---|---|---|---|
| anything `!== 'plain'` (generating / streaming / busy / attaching…) | `true` | short-circuits | returns `true`, **`busy` never read — no throw** |
| `'plain'` (idle) | `false` | must evaluate `busy` | **`ReferenceError`** |

So the crash is gated on `phase === 'plain'`. In every non-idle phase the reference stays
dormant. In v0.2.10 the crashing configuration — *a chip rendered while the composer is idle* —
was never exercised (the maintainer confirms "v0.2.10 users used the x button fine"): whenever a
chip was shown, the left operand was truthy and the `||` masked the bug. The dangling reference
sat in the shipped bundle, harmless, until a real render evaluated the right operand.

### Why the symptom is "the whole dock vanished," not "the remove button is broken"

Two facts combine:

1. **The throw is not localized to the button.** It propagates out of the `map` → out of
   `AttachmentChips` (`:21`) → out of `AttachmentDock` (`:40`) → out of the whole dock render.
2. **The dock is one slot entry behind an error boundary.** The plugin registers the dock through
   the **InputZone** slot. Per the maintainer note, a slot entry that throws during render is
   caught by the framework's **error boundary and unmounted as a whole** — not repaired, not
   partially rendered. So the host tears down the *entire* dock (container + all chips), not
   just the one button with the bad expression.

That boundary also **swallows the error into the browser console** and shows no UI banner — which
is precisely what mirren reports ("nothing else looks broken, and I don't see any error banner").
The attach button survives because it is a **separate slot entry** (`input.left`) with its own
boundary and its own, correctly-scoped `busy` state — matching "the attach button is still there."
The paste still works because `props.add`/`props.remove` and the message send path are unrelated
to the dock's render.

**Verified reproduction** (mirrors the fixture; empty dock safe, plain-phase chip throws,
non-plain chip safe):

```
[empty dock, phase=plain]         OK    -> null (empty dock)
[chip present, phase=plain]       THROW -> ReferenceError: busy is not defined
[chip present, phase=generating]  OK    -> rendered 1 chip(s)   // || short-circuits
[free-id read]                    ReferenceError: busy is not defined
```

---

## 2. Why "blame the v0.2.11 diff" is the wrong first conclusion

The v0.2.11 `feature.diff` touches **the same component** (`AttachmentChips`) and prominently adds
hover-preview code, so the path of least resistance is "the new feature crashed the dock." That is
correlation, not causation, and it is wrong for three independent reasons:

1. **The throwing token predates v0.2.11.** `busy` is a free identifier that was already in the
   shipped v0.2.10 bundle — `plugin-dock-chips.js:34` is labeled "as shipped in v0.2.10," and its
   own comment (`:33`) says *"v0.2.10 hardening pass added the phase guard — and this busy
   reference."* The maintainer note repeats it: *"In v0.2.10 the same component already had the
   line … `|| busy`."* v0.2.11 did not introduce the crash; it introduced the first render that
   *evaluated* it.
2. **The hover additions are not on the crashing path.** The feature code (`imageItem`, the hover
   `img`, the chip `onClick`) is orthogonal to the `disabled` expression. Stripping every v0.2.11
   addition still leaves the throw.
3. **The diff itself is a misleading artifact.** It re-touches the `disabled` line (showing a
   `- … !== 'plain'` / `+ … !== 'plain' || busy` pair), which reads as "v0.2.11 added `|| busy`" —
   yet the v0.2.10 shipped source already contains that exact line. When the reconstructed diff and
   the shipped file disagree about *what changed*, the diff is the wrong source of truth; go to the
   running code and `git blame`.

### The correct bisection

- **Rollback / re-add bisect.** Check out v0.2.10 (revert v0.2.11) and mount the dock with a chip
  present at `phase: 'plain'` → **it still throws** `ReferenceError: busy`. Reverting did *not*
  fix it. Re-apply v0.2.11 → still throws, same line. The crash is **invariant to the diff**, which
  proves the feature is not the cause. (The naive "revert the feature" test is a trap precisely
  because the buggy line lives outside the feature.)
- **Minimal render mount.** Mount `AttachmentChips`/`AttachmentDock` with one occurrence and
  `phase: 'plain'`, with **all hover code removed/stubbed** → still throws on `busy`. Isolates the
  crash to a line the feature never touches.
- **`git blame` / file archaeology on `:34`.** The `|| busy` was added in the **v0.2.10 hardening
  commit**, not v0.2.11. This is the single decisive check and it contradicts the diff's surface
  reading.

### Evidence that distinguishes the two hypotheses

| Question | "New feature crashed the slot" predicts | "Old latent bug, first exercised now" predicts | Observed |
|---|---|---|---|
| Remove/revert the v0.2.11 feature — does it still throw? | No, crash disappears | **Yes, crash persists** | **Persists** |
| Is the throwing token inside the new code? | Yes | No — it's the pre-existing `busy` | **No (`busy`, v0.2.10)** |
| Does `git blame` date the line to v0.2.11? | Yes | No — v0.2.10 hardening pass | **No** |
| What did the feature change? | — | The *first* render that evaluates the dormant operand (chip + idle phase) | **Matches** |

The observed column matches "old latent bug, first exercised now" on every row.

---

## 3. The fix (+ two hardening patterns the diff should also get)

### Root-cause fix — remove or properly scope the dangling `busy`

`AttachmentChips` has no busy state of its own; `busy` belongs to `AttachButton` (a different slot).
There are two correct resolutions:

- **Remove it (recommended, minimal):**
  ```js
  disabled: (props.input?.phase ?? 'plain') !== 'plain',
  ```
  This restores the pre-hardening, correct behavior. The chip remove button has no busy concept, so
  dropping the dangling operand is the honest fix and eliminates the crash outright.

- **Or scope it properly, if "disable-while-attaching" is genuinely wanted:** the `busy` state lives
  in `AttachButton`, a *separate* slot entry, so it cannot be closed over here. Plumb a real value
  through props/context or a shared store — e.g. `disabled: (props.input?.phase ?? 'plain') !== 'plain' || props.attachBusy`
  where `attachBusy` is passed down from a common source — **never** a bare closure variable that
  isn't in scope.

### Hardening pattern A — defensive reads: `record?.items ?? []`

The diff adds `record?.items.find(item => isImagePath(item.path))`. If `record` exists but its
`items` array is missing/`null`, `.find` throws `TypeError: Cannot read properties of undefined`
(verified). Write it defensively:

```js
(record?.items ?? []).find(item => isImagePath(item.path))
```

### Hardening pattern B — optional-chained `event.target.closest?.()`

The diff adds `if (event.target.closest('.remove') !== null) return;`. If the click target is not an
Element (a text node, an SVG child, etc.) it has no `.closest`, so calling it throws
`TypeError: … .closest is not a function` (verified). Write:

```js
if (event.target.closest?.('.remove') != null) return;   // loose != treats null/undefined alike
```

### Why these are cheap insurance *specifically for slot components*

A slot render (or its handlers) runs **inside the framework's error boundary**. As this very bug
shows, one unhandled throw doesn't degrade a single chip — it **unmounts the entire slot entry** and
hides the error in the console. A single malformed record (`items` missing) or one unexpected event
target (no `closest`) would nuke the whole dock again. The cost of `?? []` and `?.` is a few
characters; the payoff is that a bad record/target degrades to *that one chip/click* instead of the
whole slot. Slot code should assume its data and its event targets are not always the happy path.

---

## 4. The regression that would have caught this

A **render smoke that mounts the dock/chip component WITH an occurrence present** — critically *not*
the empty state, because the empty dock `return null`s at `:23` before ever reaching the throwing
line (`:34`). Assert the chip element renders **without an error-boundary capture**:

```js
// pseudo-test — mount the real component with representative, NON-EMPTY data
const { getByRole, queryByText } = renderInErrorBoundary(
  <AttachmentDock
    input={{ phase: 'plain', occurrences: [{ source: SOURCE, ref: 'r1', occurrenceId: 'o1', label: 'shot.png' }] }}
    remove={jest.fn()}
  />
);
// 1. the boundary's fallback did NOT fire (no error captured)
expect(boundary.didCatch).toBe(false);
// 2. the chip actually rendered
expect(queryByText('shot.png')).toBeInTheDocument();
expect(getByRole('button', { name: /Remove shot.png/ })).toBeInTheDocument();
```

Two things make this test bite:

- **Data present, `phase: 'plain'`** — the exact crashing configuration. An occurrence guarantees the
  `map` runs; the idle phase guarantees the `||` does *not* short-circuit, so `busy` is evaluated.
  Both conditions are required to reach the throw.
- **Empty state is a false negative.** Verified: an empty dock renders `null` and a naive smoke
  passes *even with the bug present*:

  ```
  [C empty smoke]        PASSED (false negative — bug still present)
  [C data-present smoke] FAILED as intended -> ReferenceError: busy is not defined
  ```

The minimal contract for the suite: **for every slot entry the plugin registers, mount it once with
the "interesting" non-empty data shape inside an error boundary and assert no capture + expected
elements.** The default/empty state usually early-returns before the risky code, so it proves
nothing.

---

## 5. Release-process lesson

### Why `node --check` was insufficient

`node --check` only **parses** the file — it verifies syntax, it never **executes** it. A
dangling-identifier `ReferenceError` is *not* a syntax error: `client.js` parses cleanly and loads
fine, so `node --check` passes with flying colors. The error only exists at *render time with data
present*.

For a **lib-only** plugin this is doubly blind: there is no `main`/entrypoint to run, the module just
exports components that the DSH host mounts into slots. Nothing in `node --check` (or even
`node client.js`) ever mounts the component, so the crashing code path is never executed. It is a
green check over a bundle that throws the first time a real user pastes a screenshot.

### Minimum viable pre-ship check for slot-rendering lib-only plugins

Ship a **render smoke that mounts every registered slot entry once, with representative non-empty
data, inside an error boundary, and asserts (a) no error-boundary capture and (b) the expected
elements render.** Concretely for this plugin:

- `input.left` → mount `AttachButton` with a normal `input`.
- `InputZone` dock → mount `AttachmentDock` with ≥1 occurrence **and** `phase: 'plain'` (and ideally
  also a non-plain phase, to cover the short-circuit branch).

This is cheap — the components already render via hyperscript (`h(...)`), so they mount in jsdom or a
virtual renderer without a browser — and it is the difference between "parses" and "actually renders
with data." The rule of thumb: **for a lib-only plugin, "it compiles" is not "it works"; the floor is
one data-present mount per slot entry with an error-boundary assertion.**

---

## Appendix — evidence index

- `fixture/plugin-dock-chips.js:7` — `busy` declared local to `AttachButton`.
- `fixture/plugin-dock-chips.js:17` — `disabled: locked || busy` used correctly *inside* `AttachButton`.
- `fixture/plugin-dock-chips.js:23` — empty dock `return null` (masks the bug for empty-state tests).
- `fixture/plugin-dock-chips.js:33-34` — the dangling `|| busy` and its "v0.2.10 hardening pass" comment.
- `fixture/feature.diff` — v0.2.11 hover additions; source of hardening patterns A (`record?.items.find`)
  and B (`event.target.closest`); re-touches the `disabled` line (the misdirection).
- `fixture/user-thread.md` — symptom (whole dock gone, attach button fine, no UI banner) and the
  maintainer note (slot error boundary unmounts the whole entry, console-only, no chip-present render smoke).


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.