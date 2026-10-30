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
#### FILE: S15-slot-error-boundary-crash/S15-slot-error-boundary-crash-report.md

# S15 · Vanishing Dock Chips: the Silent Slot Crash — Analysis Report

**Component:** `AttachmentChips` / `AttachmentDock` (pending-attachment dock, `InputZone` slot) in
`@org/dsh-attach-input` · **Evidence:** `fixture/plugin-dock-chips.js` (v0.2.10 as shipped),
`fixture/feature.diff` (v0.2.11 hover-preview), `fixture/user-thread.md` · **Method:** static read of the
fixture + local reproduction of the exact expression semantics (scratch files under the OS temp dir, nothing
in the fixture was modified).

**Verdict in one line:** the crash is a free-identifier `ReferenceError` on the identifier `busy` inside the
chip's remove-button props (`plugin-dock-chips.js:34`), which is unbound in `AttachmentChips` (it is
`AttachButton`'s local `useState` at `plugin-dock-chips.js:7`); the expression is read only in the
"chip present **and** composer idle" state, so it survived the entire v0.2.10 release dormant, and the
hover-preview release is what first put users in that state at scale.

---

## 1. Root cause

### 1.1 The exact throwing expression

```js
// fixture/plugin-dock-chips.js:29-36  (inside AttachmentChips, inside occurrences.map(...))
h('button', {
  type: 'button',
  className: 'remove',
  'aria-label': 'Remove ' + (record?.label ?? occurrence.label),
  // v0.2.10 hardening pass added the phase guard — and this busy reference:
  disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,   // <-- ???
  onClick: () => props.remove(occurrence),
}, 'x'));
```

The throwing sub-expression is the **free identifier `busy`** — the right-hand operand of `||`.

`busy` is not a parameter, not a property of `props`, not a module-level binding, and not a local of
`AttachmentChips`. The only `busy` in the file is `const [busy, setBusy] = React.useState(false)` at
`plugin-dock-chips.js:7`, which lives inside `AttachButton`'s render closure. So the v0.2.10 "hardening pass"
copied the *guard expression* out of `AttachButton` (where `busy` exists) into `AttachmentChips` (where it does
not) without moving the binding it depends on. Classic cross-component expression transplant: the code reads
like a guard, and the missing half of the binding is invisible at a glance.

Evaluating an unresolvable identifier **always** throws `ReferenceError: busy is not defined` — reads throw in
both strict and sloppy mode (only *assignment* to an undeclared name would silently create a global, and this
is a read). The throw happens while React evaluates the props object for the chip, i.e. **during render**, not
on click. Confirmed by direct reproduction:

```
THROWS: ReferenceError: busy is not defined
```

### 1.2 Why it throws *only when a chip renders*

```js
// fixture/plugin-dock-chips.js:21-24
function AttachmentChips(props, className) {
  const occurrences = (props.input?.occurrences ?? []).filter(item => item.source === SOURCE);
  if (occurrences.length === 0) return null;                 // <-- the empty-state early return
  return h('div', { className }, ...occurrences.map(occurrence => { ... }));
}
```

The throwing expression lives inside the `.map()` callback that builds the dock's children. With no occurrence
this task's plugin owns, line 23 returns `null` and the callback never runs — the line is never even
*evaluated*. The dock is non-empty only after something has been attached (a paste, or a file picked through the
attach button). So:

* idle composer, no attachments — dock empty → `null` → fine;
* composer with a pending attachment (exactly what happens after a successful paste of a screenshot) → the map
  runs → `busy` is read → `ReferenceError` → the whole dock render aborts.

That is precisely the reported trigger ("paste a screenshot → chip never shows up"), and it is also why the
"attach button works fine, paste still works" half of the report is consistent: `AttachButton` is a different
component in a different slot, and `busy` really is in scope there (`plugin-dock-chips.js:7`), so that
component never throws.

### 1.3 Why the `||` short-circuit kept it latent through v0.2.10

`A || busy` evaluates left-to-right and reads the right operand **only when the left operand is falsy**. With
`A = (props.input?.phase ?? 'plain') !== 'plain'`, the reference is armed in exactly one state:

| occurrences present? | `props.input.phase` | left operand `A` | is `busy` read? | outcome |
|---|---|---|---|---|
| no | any | never evaluated (early `return null`, line 23) | no | empty dock, no crash |
| **yes** | `!== 'plain'` (locked / uploading) | `true` | **no** — `||` short-circuits | renders fine, `disabled: true` |
| **yes** | `'plain'` / `props.input` absent | `false` | **yes** | `ReferenceError: busy is not defined` |

All three rows reproduced locally against the shipped expression:

```
empty dock                                        -> null
chip present, phase=plain            -> THROWS ReferenceError: busy is not defined
chip present, phase!=plain           -> [{"disabled":true}]      (busy never read)
```

So the short-circuit produced **two masks**, both of which a v0.2.10 release passes through:

1. **The empty-state mask** (row 1) — anything that mounts the dock without data (a storybook story with no
   attachments, an empty-composer screenshot, a "does it render?" smoke) returns `null` before the line.
2. **The locked-phase mask** (row 2) — anything that renders the dock *while the composer is in a non-plain
   phase*, which is exactly the window a maintainer looks at chips during attach testing ("let me watch the chip
   while the upload is in flight"), short-circuits `||` and never reads `busy`.

The single state that reads `busy` is "a chip is showing **and** the composer is idle" — the steady state that
every real user hits seconds after any successful paste. Note also that the v0.2.10 maintainer note ("v0.2.10
users used the x button fine") is folklore rather than evidence: if a v0.2.10 user *did* hit this, §1.4 explains
why it would have looked like "the chip didn't show up" in a chat client full of other noise and never been
reported as a bug. The thing that settles attribution is a render mount on the v0.2.10 build (§2), not
anecdote.

### 1.4 Why the symptom is "the whole dock vanished", not "the remove button is broken"

The throw site is not "the remove button's handler" — it is the *evaluation of the props object for the chip's
root element*, which sits inside `occurrences.map(...)`, which is the argument list of the dock's own
`h('div', { className }, ...children)` (`plugin-dock-chips.js:24`). The exception therefore propagates out of
`AttachmentDock`'s render (`plugin-dock-chips.js:40-43`) as a whole.

The framework's slot error boundary catches it **at the boundary**. React error boundaries only have one
recovery gesture — swap the subtree they wrap for a fallback — and they cannot render a partially-successful
subtree, so the entire `InputZone` slot entry for this plugin is unmounted: no chips, no filenames, no `x`
button, no `data-status` attributes. The dock is not degraded, it is gone.

That is also why the user sees **no error banner**: the boundary swallows the exception and the only trace is
a `console.error` in the browser console, which users never open. A crash inside a slot is *silent* by
construction, and the user's description matches the mechanism exactly — "the chip never showed up… nothing
else looks broken… no error banner in the UI".

The attach button surviving is further corroboration: it is a *separate slot entry* (`input.left`, the comment at
`plugin-dock-chips.js:2-3` says the plugin renders into `input.left` and the `InputZone` occurrences), with its
own mount, its own boundary, and its own valid binding for `busy`. The paste/add flow lives in
`AttachButton.accept` (`plugin-dock-chips.js:10-15`), so "the paste still works" is expected — only the dock
slot is dead.

---

## 2. Why blaming the v0.2.11 diff is the wrong first conclusion

The instinct "we changed `AttachmentChips`, the user's chip disappeared, therefore the change broke it" is
natural and wrong here, for three reasons.

**(a) The throw site predates the release.** The shipped v0.2.10 file in the evidence pack already contains the
dangling reference at `plugin-dock-chips.js:34`, and the maintainer's own note in `fixture/user-thread.md:11-12`
states that v0.2.10 already had this line. Causation is decided by *where the identifier is bound*, and in both
v0.2.10 and v0.2.11 the identifier `busy` is unbound inside `AttachmentChips`. The v0.2.11 diff is where the
line got *touched*, not where it got *broken*.

**(b) The console stack names the component, not the feature.** A `ReferenceError` thrown while evaluating
`AttachmentChips`'s render points at `lib/client.js`'s `disabled` line. If the hover-preview feature itself
were the cause, the top frame would be in the diff's *added* lines — `openImageViewer(...)`,
`objectUrlOf(...)`, `event.target.closest(...)`, or the `hover-card` render — not in the remove-button props
that the diff merely re-stated while restructuring the chip's props object into a multi-line form.

*Evidence note on the diff itself:* `fixture/feature.diff:32-33` shows `disabled: ... !== 'plain'` → `disabled:
... !== 'plain' || busy` as a `-`/`+` pair, while `fixture/plugin-dock-chips.js:34` (v0.2.10 as shipped) and the
maintainer note both show `|| busy` as already present in v0.2.10. The two fixture files disagree on which
release *wrote* the operand; the attribution question is settled by the shipped file and the maintainer note
(and, in any case, the diagnosis, the fix, and the regression in §3–§4 are byte-identical under either reading —
the identifier is unbound in both versions). The diff's `+` line is best read as the props-object restructuring
re-emitting the same buggy expression.

**(c) "It worked in v0.2.10" is weak evidence against a silent crash.** The failure mode is slot-boundary
unmount with console-only visibility (§1.4), so absence of earlier bug reports is *not* evidence of absence of
the bug — it is the expected signature of a bug that only reports when someone notices a missing element.

### The correct bisection

Bisect the **line**, not the commit — a revert/re-add bisect on the hover-preview commit alone is
inconclusive, because the commit re-states the same expression and the empty-state/locked-phase masks mean the
crash is invisible to a casual click-through.

1. **Repair the bisect direction (build-based, not diff-based):** check out the `v0.2.10` tag (or
   `git stash` / revert `feature.diff` wholesale) and mount `AttachmentDock` with one occurrence present and
   `phase: 'plain'`.
   * Still throws `ReferenceError: busy is not defined` → **v0.2.11 is exonerated; the bug is pre-existing.**
   * (Reverting the diff does *not* clear it, because the dangling reference is in the v0.2.10 line the diff
     was built on top of.)
2. **Minimal render mount (fastest, no git archaeology):** render `AttachmentDock` directly with
   `input.occurrences = [{ occurrenceId, ref, source: SOURCE, label }]`, `phase: 'plain'`, and a seeded
   `records` entry. Throwing at `lib/client.js` on the `disabled` line identifies the culprit deterministically
   in under a minute — this is the same command that the §4 regression now runs automatically.
3. **Confirm by removal:** delete `|| busy` from the v0.2.10 line and re-run the mount → mounts clean. Then, and
   only then, re-apply the hover-preview feature on top → still mounts clean. Fix first, feature second.

### Evidence that distinguishes the two hypotheses

| Question | "New feature crashed the slot" | "Old latent bug first exercised now" (the actual case) |
|---|---|---|
| Where does the stack frame point? | inside the diff's added lines (`openImageViewer`, `objectUrlOf`, `hover-card`, `closest`) | `AttachmentChips`, `lib/client.js`, the `disabled` line — verbatim in v0.2.10 |
| Does the v0.2.10 build crash with a chip present? | no | **yes, identically** |
| Does reverting the v0.2.11 diff fix it? | yes | no (the line survives the revert) |
| Which trigger state is needed? | any render of the new UI (image paste) | "chip present **and** `phase === 'plain'`" (§1.3 truth table) |
| Would a data-present v0.2.10 render smoke have caught it pre-release? | no | **yes** |

---

## 3. The fix

### 3.1 Remove the dangling reference (primary fix)

`AttachmentChips` has no busy state; there is nothing for `busy` to mean there. Remove the operand:

```js
// lib/client.js — AttachmentChips, remove button
h('button', {
  type: 'button',
  className: 'remove',
  'aria-label': 'Remove ' + (record?.label ?? occurrence.label),
  disabled: (props.input?.phase ?? 'plain') !== 'plain',
  onClick: () => props.remove(occurrence),
}, 'x')
```

`AttachmentChips` should keep exactly the guard it can actually evaluate. (If a lock-while-saving state is
genuinely wanted, it must be **threaded in from whoever owns it** — `props.locked` set by the plugin root that
registers both slots, or a value read from the shared revision/`records` store the dock already subscribes to
via `useRevision()`. It cannot come from `AttachButton`'s `useState` at all: those are two separate slot mounts,
so that state is unreachable from the dock no matter what.)

**Do not apply `feature.diff` verbatim on top of this fix.** The diff's own added block carries two further
defects that would keep the dock crashing (see §3.3), and both are reproducible:

* `feature.diff:9-11` reads `status` and `record` in the function body while their `const` declarations only
  exist *inside* the `.map()` callback (`feature.diff:13-14`) → `ReferenceError: status is not defined` on the
  first render with a non-empty occurrence list. `imageItem` must be computed **inside** the callback, after
  `record`/`status` are read.
* `feature.diff:27-28` emits an unbalanced `h('div', { className: 'hover-card',` props object.

### 3.2 The two hardening patterns the diff must also get

**(i) Defensive collection reads — `record?.items ?? []`-style.**

```js
// instead of:  const imageItem = status !== 'missing' ? record?.items.find(item => isImagePath(item.path)) : undefined;
const imageItem = status !== 'missing'
  ? (record?.items ?? []).find(item => isImagePath(item.path))
  : undefined;
```

`records.get(occurrence.ref)` legitimately returns `undefined` (a record can be missing, evicted or not yet
delivered — that is what the `status: 'missing'` fallback at `plugin-dock-chips.js:26` and the
`record?.label ?? occurrence.label` fallback at line 28 exist to absorb), and a delivered record may have no
`items`. Reading `.find()` off `undefined` throws `TypeError` — which, in a slot component, is the same
silent whole-entry unmount as the `ReferenceError` in §1.

Why this is *cheap* insurance in slot components specifically: the component is mounted by the host and handed
data it does not own, so "the shape is exactly what my code assumed" is a bet you cannot police. Optional
chaining plus `?? []` costs a few characters, and — important for consistency — it is already the file's
established idiom (`props.input?.occurrences ?? []`, `record?.status ?? 'missing'`, `record?.label ?? ...`).
One missing guard turns a readable "missing" chip state into an invisible, unreproducible, console-only
failure.

**(ii) Optional-chained event handler reads — `event.target.closest?.(...)`.**

```js
// instead of:  if (event.target.closest('.remove') !== null) return;
if (event.target.closest?.('.remove')) return;
```

`event.target` is whatever element received the click. It can be a text node, an SVG child, or an element in
an environment where the method is absent — `t.closest is not a function` is a `TypeError` thrown from a click
handler, i.e. the same slot-unmount blast radius but *only on interaction*, which makes it even harder to
notice in testing than a render crash. The optional call degrades to `undefined` instead of throwing. (Using a
truthy check rather than `!== null` also handles the `undefined` case correctly: with `!== null`, a guard that
cannot resolve would compare `undefined !== null` → `true` and *return early*, silently disabling the
click-to-view path.) The chip's root `<div>` now owns an `onClick` (`feature.diff:21-24`) whose target set is
considerably wider than the old button-only target, which is exactly why the guard needs the `?.`.

---

## 4. The regression that would have caught this before release

A **render smoke that mounts the dock component WITH an occurrence present**, asserting the chip renders and no
error-boundary capture occurs. The empty state is useless for this: `plugin-dock-chips.js:23` returns `null`
*before* reaching the throwing line, so an empty-dock render passes happily and proves nothing — the whole
reason this shipped is that every check performed so far was a check of the unreachable path.

```js
// tests/dock-render-smoke.test.js
import { describe, it, expect, vi, beforeAll } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';                       // or react-dom/test-utils
import { AttachmentDock, records, SOURCE } from '../lib/client.js';

function mountDock(input, remove = vi.fn()) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => createRoot(host).render(React.createElement(AttachmentDock, { input, remove })));
  return { host, remove };
}

describe('AttachmentDock render smoke — data present (the state that reads the right operand)', () => {
  const occurrences = [{ occurrenceId: 'occ-1', ref: 'ref-1', source: SOURCE, label: 'screenshot.png' }];
  beforeAll(() => records.set('ref-1', {
    status: 'ok', label: 'screenshot.png',
    items: [{ path: 'screenshot.png', file: new Blob([], { type: 'image/png' }) }],
  }));

  it('mounts the dock with a pending occurrence and captures no error', () => {
    const errors = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a));

    const { host, remove } = mountDock({ phase: 'plain', occurrences });   // <-- phase 'plain': guard falsy

    // the chip itself renders (not "the dock is empty", not "the mount threw")
    const chip = host.querySelector('.dock .chip[data-status="ok"]');
    expect(chip).not.toBeNull();
    expect(chip.querySelector('.name').textContent).toBe('screenshot.png');
    const removeBtn = host.querySelector('button.remove');
    expect(removeBtn.getAttribute('aria-label')).toBe('Remove screenshot.png');
    expect(removeBtn.disabled).toBe(false);          // idle composer -> the operand that crashed

    act(() => removeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(remove).toHaveBeenCalledWith(occurrences[0]);
    expect(errors).toEqual([]);                      // no error-boundary capture, no console.error
    spy.mockRestore();
  });

  it('still locks the remove button while the composer is not in the plain phase', () => {
    const { host } = mountDock({ phase: 'uploading', occurrences });        // short-circuit branch
    expect(host.querySelector('button.remove').disabled).toBe(true);
  });

  it('renders the empty dock without touching the chip path', () => {
    const { host } = mountDock({ phase: 'plain', occurrences: [] });
    expect(host.querySelector('.dock')).toBeNull();                        // early return, not a crash
  });
});
```

Notes that make this test load-bearing rather than decorative:

* **Mount, don't snapshot.** The point is to *execute* the render function, including the boolean operands, so
  the guilty expression is evaluated. A snapshot/serializer check of the `h()` output would not help either,
  since the throw happens while building the props. `expect(...).not.toBeNull()` on real DOM plus
  `expect(console.error)` (or an installed error boundary that sets a flag on `componentDidCatch`) is what
  turns a silent slot unmount into a failing build. If the plugin has no React test setup, the same smoke can
  drive the plugin's own `h()` output into a jsdom container — a lib-only plugin has no app to mount, which is
  exactly why the smoke has to mount the component directly.
* **Seed the module state first.** `AttachmentChips` reads the module-level `records` map and
  `props.input.occurrences`; without both, the test degenerates into the useless empty state.
* **Cover all three rows of the §1.3 truth table** (data present + idle, data present + locked, empty) so the
  short-circuited branch and the reading branch are both executed on every run.
* For the v0.2.11 feature, the same harness extended with the hover-preview assertions (`data-image="1"`,
  hover-card `img`, click-to-view, and that a click on `.remove` does not open the viewer) covers the
  `closest` guard in §3.2(ii).

---

## 5. Release-process lesson

**Why `node --check` was insufficient.** `node --check` is a *parse* pass. An unresolved identifier inside a
function body is perfectly valid JavaScript syntax — it is a runtime binding-resolution failure, not a syntax
error. Verified on the reproduced expression: `node --check freeid.js` exits clean on a file containing the
identical `disabled: A || busy` line, while calling the function throws
`ReferenceError: busy is not defined`. For a lib-only plugin the gap is even wider, because *nothing in the
build ever executes the component*: there is no app entry point, no startup render, no server render, no
storybook step in CI. The first time that code runs in the entire world is inside a user's browser, inside a
host slot, with data present — with a boundary that then eats the error silently.

**The minimum viable pre-ship check for a slot-rendering lib-only plugin:**

1. **Static (seconds, catches this exact bug class):** ESLint with `no-undef` (plus `no-use-before-define` and
   `no-unused-vars`) in CI. `no-undef` flags `busy` in `AttachmentChips` without executing anything, and
   `no-use-before-define` would have flagged the diff's hoisted `status`/`record` read. This alone would have
   blocked v0.2.10.
2. **Dynamic (one headless smoke, ~50 lines):** jsdom mount of **every slot-registered component** with a
   **non-empty props fixture** for each documented props state — empty *and* data-present *and* locked —
   asserting: no throw, no error-boundary capture, no `console.error`, the expected elements exist, and the
   handlers fire. Data-present is the non-negotiable part (§4): with an empty fixture the dock returns `null`
   before the interesting line and the test is theatre.
3. **Gate the release on it:** run it in CI on the tag and make `npm test` a precondition of publish. A slot
   crash is invisible to users, so the release gate is the only place it can be caught.

The transferable rule: **a syntax/lint gate proves the code parses; only a data-present render smoke proves the
component can render.** For components whose render path depends on data the host supplies, the data fixture is
part of the test — and "the empty state renders" is never a substitute.

---

## Appendix — reproduction transcript (all commands run read-only; scratch under the OS temp dir)

```
$ node --version
v24.14.1

$ node --check freeid.js          # file contains: disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy
node --check: PASS (no syntax error reported)

$ node -e "... AttachmentChips({input:{occurrences:[]}})"                       # empty dock
empty dock -> null

$ node -e "... AttachmentChips({input:{phase:'plain',occurrences:occ}})"        # chip present, idle
chip present, phase=plain THROWS ReferenceError: busy is not defined

$ node -e "... AttachmentChips({input:{phase:'uploading',occurrences:occ}})"    # chip present, locked
chip present, phase!=plain -> [{"disabled":true}]                               # busy never read (|| short-circuit)

$ node -e "... diff's hoisted imageItem with a chip present"
diff hoist, chip present THROWS ReferenceError: status is not defined
diff hoist, empty -> null

$ node -e "... unguarded event.target.closest on a non-Element target"
unguarded closest THROWS TypeError: t.closest is not a function
guarded closest -> undefined                                                 # event.target.closest?.('.remove')
```

The fixture directory was not modified, executed, or published.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.