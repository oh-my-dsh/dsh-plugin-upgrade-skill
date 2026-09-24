# S15 · Vanishing Dock Chips — the Silent Slot Crash

Task: S15-slot-error-boundary-crash (read-only analysis). Evidence: `fixture/plugin-dock-chips.js` (shipped v0.2.10 component code), `fixture/feature.diff` (v0.2.11 hover-preview diff), `fixture/user-thread.md` (symptom report + maintainer note).

## 1. Exact root cause

**The throwing expression is the free identifier `busy` in the remove button's `disabled` prop inside `AttachmentChips`:**

```js
disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,   // ReferenceError: busy is not defined
```

`busy` is a `React.useState` variable declared **inside `AttachButton`** (a sibling component rendered into the `input.left` slot). It is not in scope in `AttachmentChips` — not a parameter, not a local, not a module-level binding. When JavaScript evaluates the identifier it walks the scope chain to the global object, finds no `busy`, and throws `ReferenceError: busy is not defined`. Since this happens while constructing the props object for `h('button', …)`, the throw occurs **during render**, before React can produce any chip DOM.

**Why it throws only when a chip renders:** `AttachmentChips` early-returns `null` when there are no occurrences of this plugin's source:

```js
const occurrences = (props.input?.occurrences ?? []).filter(item => item.source === SOURCE);
if (occurrences.length === 0) return null;
```

With an empty dock, the function never reaches the `occurrences.map(...)` callback that builds the button props, so `busy` is never read. That is exactly why "the paste itself still works" and "the attach button is unaffected": the paste path (`AttachButton`, which legitimately owns `busy`) and the message-send path never execute the broken line. Only the *visual chip above the input* — i.e. `AttachmentDock` → `AttachmentChips` with at least one occurrence — evaluates it.

**Why the `||` short-circuit kept it latent through v0.2.10:** `A || busy` evaluates `busy` only when `A` is falsy. `A = (props.input?.phase ?? 'plain') !== 'plain'` is **true whenever the composer is not in the plain phase** (locked/busy phases). So:

- phase ≠ plain (locked) → left operand `true` → `busy` never read → no throw;
- phase = plain (the normal state) → left operand `false` → `busy` is read → `ReferenceError`.

The bug is therefore *conditional on the intersection of two states*: (a) at least one attachment occurrence exists, and (b) `phase === 'plain'`. Through v0.2.10 the flows that exercised chip rendering did so while the composer was in a non-plain phase (the hardening pass itself was about locking the UI), so the short-circuit always shielded the dangling read. A `node --check`-style syntax pass can never catch it: it is not a syntax error, it is a runtime scope-resolution failure that fires only on that specific render path. v0.2.11's usage pattern — paste a screenshot while the composer sits in `plain` phase, producing an occurrence — is the first thing that made the left operand false *with a chip on screen*, so the latent read finally executed.

**Why the symptom is "the whole dock vanished" and not "the remove button is broken":** the plugin registers the dock through the InputZone slot, and a slot entry that throws during render is caught by the **slot-level error boundary, which unmounts the entire entry**. React does not degrade to "render everything except the failing button" — the failing component subtree (`AttachmentDock`/`AttachmentChips`, i.e. the whole chip dock) is torn down and rendered as nothing. The error is surfaced only as a console error ("ResizeObserver loop"... no — `ReferenceError: busy is not defined`) in the browser devtools, which users never open, hence "no error banner in the UI" and a *silent* disappearance. The attach button survives because it is a separate component in a separate slot entry (`input.left`) with its own error boundary and its own (correct) `busy` state.

### Secondary hazard in the v0.2.11 code (flag while fixing)

The diff hoists the hover-preview lookup **above** the `.map()` callback where `record` and `status` are declared:

```js
const imageItem = status !== 'missing' ? record?.items.find(item => isImagePath(item.path)) : undefined;
return h('div', { className }, ...occurrences.map(occurrence => {
  const record = records.get(occurrence.ref);
  const status = record?.status ?? 'missing';
```

At that outer position `record` and `status` are also free identifiers (`status` may even silently resolve to the deprecated `window.status` global in a browser, making the condition accidentally truthy and then throwing on `record`). The fix must move this computation inside the map callback after `record`/`status` are defined — see §3.

## 2. Why blaming the v0.2.11 diff is the wrong first conclusion — correct bisection

The diff *looks* maximally guilty: it touches the exact component that disappeared, adds new render-time logic (`imageItem`, `objectUrlOf`, a new onClick), and even contains a `-`/`+` pair around the `disabled:` line. But "the diff touched the file the symptom is in" is correlation, not causation. The shipped v0.2.10 source (`plugin-dock-chips.js`, and the maintainer's own note) already contains `… !== 'plain' || busy` — the dangling reference predates the hover-preview work. (Note the evidence conflict: `feature.diff` shows `|| busy` as an *added* line, implying its base was older than the shipped v0.2.10 — diffs generated against a stale base are a classic way to mis-attribute a regression. The published tarball, not the diff, is authoritative.)

**Correct bisection — isolate the variable, not the release:**

1. **Minimal render mount (fastest):** take the shipped v0.2.10 tarball's `lib/client.js`, mount `AttachmentChips`/`AttachmentDock` headlessly with one occurrence present and `phase: 'plain'`. It throws `ReferenceError: busy is not defined` — *without any v0.2.11 code present*. That single experiment clears the hover-preview feature of being the root cause.
2. **Rollback/re-add bisect (if you prefer the shipped artifacts):** build A = v0.2.11 with only the diff reverted; build B = v0.2.10 + only the diff re-applied. If A still crashes (it will, since the `busy` line is in the v0.2.10 base) the crash cannot be caused by the diff's additions. Conversely B crashes identically.
3. **Confirm the trigger change:** the new thing in v0.2.11 is the *usage pattern* — paste creates an occurrence while the composer stays in `plain` phase — which first satisfies both conditions of the conditional throw.

**Evidence that distinguishes "new feature crashed the slot" from "old latent bug first exercised now":**

| Signal | New feature at fault | Old latent bug (actual) |
|---|---|---|
| v0.2.10 shipped code mounted with data present | renders fine | **throws `ReferenceError: busy`** ← decisive |
| Error location in console stack | inside hover-preview code (`objectUrlOf`, `imageItem`) | the `disabled:` prop line, untouched semantics since the hardening pass |
| Removing the feature | fixes it | **still crashes** |
| Removing only `|| busy` | n/a | **fixes it, feature intact** |

## 3. The fix

**Primary: remove the dangling reference.** `AttachmentChips` has no `busy`. Either delete the clause:

```js
disabled: (props.input?.phase ?? 'plain') !== 'plain',
```

or, if a busy state genuinely belongs on the chip row, thread it explicitly as a prop from a state the dock actually owns (`props.busy === true`), never a free identifier copied from a sibling component. The line looks like a copy-paste from `AttachButton`'s own `disabled: locked || busy`.

**Secondary: repair the diff's hoisted lookup** — compute `imageItem` inside the map callback, after `record`/`status` exist.

**Two hardening patterns the diff should also get:**

```js
const imageItem = (record?.items ?? []).find(item => isImagePath(item.path));
// …
onClick: imageItem === undefined ? undefined : event => {
  if (event.target.closest?.('.remove') !== null) return;
  openImageViewer({ src: objectUrlOf(imageItem.file), name: imageItem.path });
},
```

- `record?.items ?? []` — optional chaining guards the *property access* (`record?.`), but not the subsequent `.find` call: if `record` exists with `items: undefined` (a not-yet-hydrated attachment record, exactly the state a freshly pasted screenshot is in), `record?.items.find` still throws `TypeError: Cannot read properties of undefined (reading 'find')`. The `?? []` makes the whole expression total. It's cheap insurance because a chip renders precisely when record data is *arriving asynchronously* — the worst moment for partial data.
- `event.target.closest?.('.remove')` — the guard clause runs on the chip's click delegate; `closest` exists on Elements but the event target can be e.g. an SVG or text-node-adjacent target in some browsers/embeds where the method is missing. Optional-calling it turns a crash into a benign `undefined !== null`… and more importantly keeps the *guard* from becoming the thing that kills the slot.

Both are cheap in slot components specifically because a slot entry has no partial-failure mode: any single throw unmounts the whole entry (see §1), so defensive totality on the few data-access expressions is the highest-leverage hardening available.

## 4. The regression that would have caught this before release

A **render smoke that mounts the dock component WITH an occurrence present** — not the empty state:

```js
// render-dock-smoke.test.js (jsdom / react testing pattern)
const errorCaptures = [];
function Capture(props) {   // stand-in for the slot error boundary
  return null;
}
// mount via the real registration path so the framework boundary is exercised:
renderSlot('InputZone', { input: {
  phase: 'plain',                       // ← critical: the plain phase evaluates the right side of ||
  occurrences: [{ source: SOURCE, occurrenceId: 'occ-1', ref: 'rec-1', label: 'shot.png' }],
}});
// with records.set('rec-1', { status: 'ok', label: 'shot.png', items: [] })

expect(screen.getByLabelText(/Remove shot.png/)).toBeTruthy();          // chip actually rendered
expect(errorCaptures).toHaveLength(0);                                  // no error-boundary capture
expect(container.querySelector('.chip[data-status="ok"]')).toBeTruthy();
```

Why the empty-state test that presumably existed passes trivially: with zero occurrences `AttachmentChips` returns `null` **before** the throwing line, so an empty-dock smoke proves nothing about the chip path. The regression must combine: (a) ≥1 occurrence, (b) `phase: 'plain'` (otherwise the `||` short-circuit hides the bug), and (c) an assertion on the error boundary having captured nothing — a mere "does not throw on mount with no data" test would still ship the bug.

## 5. Release-process lesson

`node --check` (or any parse-only pass) validates **syntax only**. A free identifier like `busy` is perfectly legal syntax — it is only at *evaluation* time that scope resolution fails. For a **lib-only plugin** shipped as prebuilt `lib/client.js`:

- there is no source-level typecheck/lint gate at publish time (the bundler that would have flagged the undefined binding never re-runs on the shipped artifact);
- the component fails **only at render time** (not import time), and **only with data present** (the empty dock early-returns), and **only in the plain phase** (short-circuit).

So the minimum viable pre-ship check for slot-rendering lib-only plugins is a **headless render smoke on the exact shipped artifact**: mount each registered slot component (or better, the plugin's real registration) in jsdom/React-test-renderer with representative **non-empty** props — one occurrence, plain phase, a record in each status — and assert the expected element renders with zero error-boundary captures. That is a minutes-cheap gate that would have caught S15, and unlike `node --check` it exercises the three conditions (render-time evaluation, data present, plain phase) under which this class of bug actually fires.
