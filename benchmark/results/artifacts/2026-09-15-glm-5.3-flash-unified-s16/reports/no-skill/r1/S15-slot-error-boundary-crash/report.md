# S15 · Vanishing Dock Chips — Root-Cause Diagnosis

Plugin: `@org/dsh-attach-input` · Incident version: v0.2.11 (hover-preview release) · Evidence: `/app/fixture/` (read-only)

## 0. TL;DR

The dock unmounts because a line that shipped in **v0.2.10**'s "hardening pass" references `busy` inside `AttachmentChips` — but `busy` is a `useState` local of the sibling component `AttachButton`. It is a **free identifier** in `AttachmentChips`, and evaluating it throws `ReferenceError: busy is not defined`. Two independent guards kept the reference from ever being *evaluated* before v0.2.11: the empty-dock early `return null` (the line never runs without occurrences) and the `||` short-circuit (the right operand is evaluated only when `phase === 'plain'`). v0.2.11 is merely the release in which the firing conjunction — *chip present while the composer is idle* — first occurred in the wild, because the hover-preview feature invites users to paste a screenshot and then sit looking at the chip in an idle composer. The slot error boundary catches the render-phase throw and unmounts the whole dock entry, logging only to the browser console — hence "the whole dock vanished" with no visible error. The hover-preview diff is the release that armed the scenario, not the bug that fired.

---

## 1. Exact root cause

### 1.1 Which expression throws

The remove button's `disabled` initializer in `AttachmentChips` (fixture `plugin-dock-chips.js`, line 34, as shipped in v0.2.10):

```js
disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,   // <-- ???
```

`busy` is declared exactly once in the whole file — `const [busy, setBusy] = React.useState(false)` inside `AttachButton` (line 7). `AttachmentChips` is a separate top-level function; there is no `busy` binding anywhere on its scope chain (the module scope exposes `h`, `SOURCE`, `records`, `useRevision`, … — no `busy` — and there is no global `busy`). Object-literal property values are evaluated **eagerly**, so the moment the `.map()` callback builds the argument object for `h('button', { … })`, the engine resolves `busy`, fails, and throws synchronously during render:

```
ReferenceError: busy is not defined
```

This is a **render-phase throw inside the dock's slot entry** — the key fact for the symptom (§1.4). The button is never even created; the crash is not deferred to click time.

### 1.2 Why it throws only when a chip renders

The throwing expression lives inside `...occurrences.map(...)`, and `AttachmentChips` begins with:

```js
if (occurrences.length === 0) return null;
```

With an empty dock the function returns **before the map callback ever runs** — the line, and the dangling reference with it, is never touched. Every smoke test, every QA pass, and every user session without a pending attachment took the `return null` path. The bug is armed only while at least one occurrence for this plugin's `SOURCE` exists.

### 1.3 Why the `||` short-circuit kept it latent through v0.2.10

`a || b` evaluates `b` **only when `a` is falsy**. Here `a` is the phase guard, true exactly when the composer is in a locked (non-plain) phase — precisely the states the hardening pass wanted the x button disabled in. So even when the line *ran* (chips rendered around submit/processing flows), the left operand was truthy and `busy` was never read:

```
$ node -e "true || busy; console.log('no throw')"
no throw                      # left operand true → short-circuit, busy never evaluated
$ node -e "false || busy"
ReferenceError: busy is not defined
```

The reference is therefore evaluated only on the **conjunction**: an occurrence present **and** `phase === 'plain'`. Through v0.2.10's development and field usage, every render that reached the line short-circuited (or the dock was empty and the line was never reached at all), so the ReferenceError never fired — matching the pack's fact that "v0.2.10 users used the x button fine." v0.2.11's headline flow — paste a screenshot, then stay idle to try the hover preview — is the first scenario that puts "chip present while `phase` is plain" on the hot path, and the first real evaluation of `busy` killed the dock. The pack does not preserve which v0.2.10 code paths kept chips confined to locked phases; for the diagnosis it does not matter, because the bisection in §2 proves the line is pre-existing and that v0.2.10 code alone crashes once the conjunction is reproduced in a harness. A latent bug is one whose firing conditions simply had not occurred yet — v0.2.11 did not create the bug; it created the conditions.

### 1.4 Why the symptom is "the whole dock vanished", not "the remove button is broken"

The plugin mounts the dock through the **InputZone slot**, and the framework wraps each slot entry in an error boundary. The ReferenceError is thrown during the `AttachmentDock → AttachmentChips` render, i.e. before React commits anything, so the boundary unmounts the **entire entry**: every chip, not one button. There is no partially rendered chip whose x could be "broken" — a render-phase throw means the subtree never mounts at all.

Three details complete the picture:

- **Console-only visibility.** The boundary's failure path is a `console.error` with no UI banner (per the maintainer note), and users never open DevTools. The only user-visible symptom is *absence*: the chip that used to appear, doesn't.
- **The paste still works.** Occurrence recording lives in the composer core, outside the crashed component — the message sends with the image attached. The data exists; only its renderer is dead.
- **The attach button is unaffected.** It is a separate slot entry (`input.left`) with its own error boundary; the dock entry's crash cannot touch it.

---

## 2. Why blaming the v0.2.11 diff is the wrong first conclusion — and the correct bisection

### 2.1 Why the diff misleads

- **Same-file correlation.** The diff modifies `AttachmentChips` — the exact component that vanished. "The release touched the component that broke" is the natural first read, and it is a coincidence of placement, not causation: the crashing expression sits on a line the feature work never authored (it shipped in v0.2.10's hardening pass).
- **The diff itself is stale.** `feature.diff` was generated against a *pre-hardening* base, not against v0.2.10 as shipped. Its `-` context shows `disabled: (props.input?.phase ?? 'plain') !== 'plain',` (no `|| busy`) and its button block has no `aria-label` line — while the v0.2.10 file contains both. Read naïvely, the diff even appears to *introduce* `|| busy` in v0.2.11, inverting the truth: it re-adds a change that had already shipped. A diff whose base does not match the previous release is not a reliable map of what changed.
- **Nothing in the hover-preview code is on the crash path.** The crash fires on mount of a plain chip, before any hover or click; the feature's new identifiers (`imageItem`, `openImageViewer`, `objectUrlOf`, `isImagePath`) never execute in the failing render.

### 2.2 The correct bisection (rollback / re-add)

1. **Reproduce minimal and headless** (no browser needed): mount `AttachmentDock` in jsdom with one occurrence present and `input: { phase: 'plain', … }`, with a stubbed `records` entry and a stub `remove` prop.
2. **Rollback arm:** run the repro against v0.2.10 exactly as shipped (diff fully reverted). It crashes → the bug is in v0.2.10 code; the diff did not create it.
3. **Re-add arm:** re-apply the v0.2.11 hunks one at a time (the `imageItem` initializer; chip `data-image`/`onClick`; the `hover-card` child; the remove-button change). The crash stays on the pre-existing `disabled:` line regardless of which hunks are applied — no added line ever appears in the stack.
4. **Matrix the two guards** to explain why this shipped silent: empty occurrences → no crash (early return); occurrence + locked phase → no crash (short-circuit); occurrence + plain phase → crash. v0.2.10's testing and usage never hit the third cell; v0.2.11's paste-preview flow made it the first cell users live in.

### 2.3 Evidence distinguishing "new feature crashed the slot" from "old latent bug first exercised now"

| Observation | "New feature crashed it" predicts | "Old latent bug first exercised now" predicts | Actual |
|---|---|---|---|
| Top stack frame in console | inside the added lines (`imageItem` / `onClick` / hover-card) | the pre-existing `disabled: … \|\| busy` line | the old line |
| v0.2.10 + minimal mount, chip present, plain phase | no crash | crash | crash |
| v0.2.10, empty dock or locked phase | — | no crash (explains silent shipping) | no crash |
| Error class | `TypeError` on feature data (`items`, blob URL, …) | `ReferenceError` on an undeclared identifier (a scoping bug) | `ReferenceError: busy is not defined` |
| Data / interaction needed | requires an image attachment, hover, or click | any occurrence, on mount, zero interaction | on mount, any chip |
| Diff base vs shipped v0.2.10 | diff applies to previous release | diff base is stale | stale (no `aria-label`; re-adds `\|\| busy`) |

**One nuance worth recording.** As literally positioned in `feature.diff`, the new `const imageItem = status !== 'missing' ? record?.items.find(...) : undefined` initializer sits at *function* scope, before the `return h('div', …)` — while `status` and `record` are declared only **inside the `.map()` callback**. If the shipped v0.2.11 really placed it there, the console would instead show `ReferenceError: status is not defined` at that line, and it would fire on every chip render in *any* phase (no short-circuit protection). Reading the **top frame of the actual console error** is precisely how you tell which dangling reference fired; the bisection protocol above is the same either way, and §3 fixes both. Either way the error class is "free identifier / render-phase ReferenceError", which is the old-bug signature, not a new-feature `TypeError` signature.

---

## 3. The fix

### 3.1 Primary fix — remove the dangling reference

Restore the remove button to what the component can actually evaluate:

```js
disabled: (props.input?.phase ?? 'plain') !== 'plain',
```

`busy` is `AttachButton`'s local upload state; the dock has no such state and cannot reach a sibling's `useState` local. If the intended UX was "x disabled while that attachment uploads", **scope it properly**: derive the signal from data the dock actually has (e.g. `record?.status === 'uploading'` / the occurrence's own status field — the same records map already carries `status`), or lift a genuinely shared `busy` into props/context. Never reference another component's hook state by name.

### 3.2 Same-class fix when re-landing the feature — "or scope it properly"

Compute `imageItem` **per occurrence inside the `.map()` callback**, where `record` and `status` are actually in scope — which is also semantically required, because the preview image is a per-chip property, not a dock-wide one:

```js
...occurrences.map(occurrence => {
  const record = records.get(occurrence.ref);
  const status = record?.status ?? 'missing';
  const imageItem = status !== 'missing'
    ? (record?.items ?? []).find(item => isImagePath(item.path))
    : undefined;
  return h('div', { className: 'chip', … },
```

### 3.3 The two hardening patterns the diff should also get

1. **Defensive reads of record data — `(record?.items ?? []).find(...)` style.** `record?.items.find(...)` guards only a *nullish* `record`; a record that exists but lacks `items` still throws `TypeError: Cannot read properties of undefined (reading 'find')` at render. `records` is a Map populated asynchronously (that is exactly what `useRevision()` subscribes to), so between the occurrence appearing and its record arriving, every field read must have a `?? default` — the component already does this for `status` (`?? 'missing'`) and `label` (`?? occurrence.label`); the new fields must follow the same rule.
2. **Optional-chained DOM access on event targets — `event.target.closest?.('.remove')`.** `event.target` is an `EventTarget`, not guaranteed to be an `Element` (text nodes, `document`/`window` in edge or synthetic events), so `closest` can be absent and the click-to-view handler would throw. `closest?.()` (or an `event.target instanceof Element` guard) keeps the fallback behavior.

**Why they are cheap insurance in slot components.** A slot entry is all-or-nothing: any throw during render and the framework's error boundary unmounts the *entire* entry — this incident is the proof, where one bad read turned "one chip could show status 'missing'" into "the whole dock disappears", with the only trace in the console. Slot components also render data they do not own, on a schedule the host controls: occurrences, phases, and records mutate between renders, so "that field is always there" is never a safe assumption. `?? default` and `?.()` cost a handful of characters and convert a hard crash (feature silently vanished) into a degraded-but-visible chip. For slot-rendering plugins, defensive defaults are not style — they are the difference between a degraded feature and a disappeared one.

---

## 4. The regression that would have caught this before release

A **render smoke that mounts the dock WITH an occurrence present**. The empty state is worthless here: `AttachmentChips` returns `null` *before reaching the throwing line*, so an empty-dock smoke passes forever while the grenade sits armed. Equally, a data-present smoke that only renders a **locked** phase also passes forever, because the `||` short-circuits past `busy` — the smoke must exercise the exact firing conjunction: **chip present + `phase: 'plain'`**.

Sketch (jsdom + React Testing Library; runs in CI in seconds, no browser):

```js
test('dock renders a removable chip for a pending attachment (plain phase)', () => {
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const remove = jest.fn();
  render(
    <ErrorBoundary onError={() => { throw new Error('slot entry unmounted by error boundary'); }}>
      <AttachmentDock
        input={{ phase: 'plain', occurrences: [
          { source: SOURCE, ref: 'r1', occurrenceId: 'o1', label: 'shot.png' },
        ] }}
        remove={remove}
      />
    </ErrorBoundary>
  );
  // the chip element really rendered — not silently swallowed by a boundary:
  expect(screen.getByText('shot.png')).toBeInTheDocument();
  const x = screen.getByRole('button', { name: 'Remove shot.png' });
  expect(x).not.toBeDisabled();            // plain phase → x enabled
  fireEvent.click(x);
  expect(remove).toHaveBeenCalled();
  expect(errSpy).not.toHaveBeenCalled();   // no error-boundary capture
});
```

The assertions are deliberately three-layered, matching the failure mode: (a) the chip element exists (catches "whole entry unmounted"), (b) the x button exists, is enabled, and works (catches a degraded-but-mounted state), and (c) no error was captured/logged (catches a boundary swallow that might still leave *something* in the DOM). Cheap extensions of the same smoke: loop `phase` over `'plain'` and one locked value (covers both short-circuit arms); add an occurrence whose `ref` has no `records` entry (covers the `?? 'missing'` degraded path the hover-preview hardening targets); after re-landing the diff, use an image-path record so the `imageItem`/hover-card branch renders too. Any one of these would have failed the v0.2.10 build before the hardening line ever shipped.

---

## 5. Release-process lesson: why "syntax check only" was insufficient, and the minimum viable pre-ship gate

### 5.1 Why `node --check` was insufficient

`node --check` is a **parse** check. A free identifier is perfectly valid syntax — the shipped v0.2.10 file passes cleanly:

```
$ node --check fixture/plugin-dock-chips.js && echo "syntax OK"
syntax OK
```

An undeclared identifier is a *runtime resolution* failure: the `ReferenceError` fires only when the expression is actually evaluated, which — per §1 — requires data (an occurrence) and a phase state (plain) that coexist only inside a live composer in the user's browser. A **lib-only plugin has no server render, no prerender, no app shell** to execute the component earlier in the pipeline: the very first real execution of `AttachmentChips` with data present happens on the user's machine, after release. "It compiles" proves nothing about "it renders", and manual QA that only ever looked at an empty composer (or exercised chips only around submit flows) never reached the line either.

### 5.2 Minimum viable pre-ship check for slot-rendering lib-only plugins

Three gates, all headless, all CI-able in seconds — the third is the one that would actually have caught this:

1. **Parse** (keep `node --check`, but treat it as the trivial first gate).
2. **Static undefined-name check:** ESLint `no-undef` (or TypeScript). This is the gate that flags this exact bug class *at author time, with zero execution*: `busy` in `AttachmentChips` — and the diff's function-scope `status`/`record` — are both reported instantly. The v0.2.10 hardening pass and the v0.2.11 diff both shipped because no `no-undef` rule (and no type checker) ever looked at the file.
3. **Data-present render smoke (§4):** headless-mount every registered slot component with **non-empty, representative slot data** — occurrence present; record present *and* missing; each phase state — inside a fail-on-error boundary, asserting key DOM output exists (chip rendered, x enabled in the plain phase). For a lib-only plugin this must be built into CI deliberately, because nothing else in the release pipeline will ever run the component; it is the only gate that exercises the render path at all.

**The lesson in one line:** "syntax check only" validates the *text* of the program, while slot components crash on the *interaction of code with host data at render time* — so the minimum bar for a lib-only, slot-rendering plugin is **parse + `no-undef` + mount-with-data render assertion**. Gate 2 alone would have kept both v0.2.10's latent reference and the v0.2.11 diff's mis-scoped initializer from ever shipping.
