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

# S15 — Vanishing Dock Chips: root cause, bisection, fix and the missing release gate

**Component:** `@org/dsh-attach-input` v0.2.11 (lib-only Web plugin, `lib/client.js`)
**Verdict in one line:** the chip's remove-button props expression reads the free identifier
`busy`, which only exists as state inside a *different* component (`AttachButton`); the
`||` guard made that read conditional, so it stayed dead until a chip had to render in a
`plain` composer phase — and the v0.2.11 diff added a second, *unconditional* free
identifier (`status`) in the same function, which is what makes the crash look like "the
new feature broke it".

> Evidence pack is read-only and was not modified. The only executed code is a local
> re-mount of the two `AttachmentChips` variants in `../_verify/probe-render.mjs`, whose
> output is reproduced in §10.

---

## 1. What the user sees, mapped to mechanism

| Observation (user thread) | Mechanism |
| --- | --- |
| Chip above the input never appears | The dock slot entry (`AttachmentDock` → `AttachmentChips`) throws while **building** the chip tree; the host's slot-level error boundary catches it and unmounts that entry. Rendering nothing = "gone". |
| Paste still works, message sends with the image | The attachment store (`records`) and `props.add` are outside the render path. Only the *reader* of the data crashed. |
| `+` attach button fine | It is a **separate slot entry** (`input.left`, `AttachButton`) with its own boundary. Nothing is shared with the dock's render. |
| No error banner in the UI | The boundary's fallback is empty and the error is surfaced only as a console `ReferenceError`. Users don't open the console; nothing in the composer shows a failure. |
| "the remove button is broken" is *not* the report | The exception is raised while constructing the `button`'s props object, before any commit or click. The x is never painted, so it can never be "broken" — the whole chip element tree is discarded. The failure is one level up from the button. |

Two consequences worth stating explicitly, because they shape the fix:

1. A slot entry is all-or-nothing. One throwing child expression discards **all** occurrences,
   not just the offending chip — so with N chips the user sees nothing, not N−1 chips.
2. Because the entry unmounts, React retries nothing and logs once per mount attempt; a
   paste→re-render cycle produces repeated identical `ReferenceError` lines, which is the
   only forensic trace available in the field.

---

## 2. Root cause #1 (pre-existing, latently shipped in v0.2.10): `busy`

```js
// lib/client.js  (v0.2.10, unchanged by the hover-preview diff)
function AttachmentChips(props, className) {
  const occurrences = (props.input?.occurrences ?? []).filter(item => item.source === SOURCE);
  if (occurrences.length === 0) return null;                 // <-- (A) empty dock exits here
  return h('div', { className }, ...occurrences.map(occurrence => {
    const record = records.get(occurrence.ref);
    const status = record?.status ?? 'missing';
    return h('div', { ... },
      h('span', ...),
      h('button', {
        ...
        disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,   // <-- (B) the throw
        onClick: () => props.remove(occurrence),
      }, 'x'));
  }));
}
```

**Exact expression:** `(props.input?.phase ?? 'plain') !== 'plain' || busy`, evaluated as the
`disabled` property of the remove `button` element.

**Why it throws:** `busy` is not declared anywhere in `AttachmentChips`'s scope chain. Its
only declaration in the plugin is `const [busy, setBusy] = React.useState(false)` inside
`AttachButton` (line 7 of the excerpt) — a *sibling* component in a *different* slot entry.
Component-local state is not visible across components; there is no shared props object, no
context and no module-level `busy`. The identifier is therefore unresolvable, and JS
raises `ReferenceError: busy is not defined` at evaluation time. This is not a TDZ error
and not a `TypeError`: there is no binding at all, in any scope. (In a browser bundle a
stray global of that name would mask it with `undefined` — worth checking in the built
artifact — but nothing in the shipped plugin defines one.)

**Why only when a chip renders:** line (A) returns `null` before the `map` is ever
entered. The `h('button', {...})` call — and therefore the property initialiser holding
`busy` — is inside the `map` callback, so it only exists when
`occurrences.length > 0`. Empty dock: no throw, `null`, nothing to see. One pending
attachment: throw. This is exactly why an empty-state smoke test is worthless here; it
exercises the early return and never reaches the throwing line.

**Why the whole dock vanishes rather than one button breaking:** the throw happens during
render, inside the slot entry, while React is building the element tree. React has no partial
result to commit; the nearest error boundary is the host's per-slot-entry boundary, whose
`componentDidCatch` logs to the console and renders nothing. So the entry is unmounted as a
unit. The composer, the send button and the attach button live in other entries and keep
working — which is precisely the lopsided symptom in the thread.

---

## 3. Why the `||` short-circuit kept it latent through v0.2.10

`||` evaluates its right operand **only if the left one is falsy**. Truth table for (B):

| `props.input.phase` | left operand | right operand `busy` evaluated? | result |
| --- | --- | --- | --- |
| `'locked'` / `'sending'` / any non-plain value | `true` | **no** (short-circuited) | `disabled: true` — chip paints, x is disabled, no throw |
| `'plain'` (or absent → `?? 'plain'`) | `false` | **yes** → ReferenceError | nothing paints |

So the line is a landmine with a phase-shaped safety catch. On the v0.2.10 dock path the
composer was in a non-plain phase whenever an occurrence was pending, so the right operand was
dead code in practice: the x button "worked fine" because the expression never reached `busy`.
The bug was not fixed, only *not evaluated* — and the guard protects exactly one value of a
field the component does not own. Any new call site, phase transition, or re-render in
`plain` arms it. The local mount confirms the split precisely:

```
v0.2.10  0 occurrences, phase=plain   -> OK null
v0.2.10  0 occurrences, phase=locked  -> OK null
v0.2.10  1 occurrence,  phase=locked  -> OK chip tree
v0.2.10  1 occurrence,  phase=plain   -> THROW ReferenceError: busy is not defined
v0.2.10  1 occurrence,  phase absent  -> THROW ReferenceError: busy is not defined
```

That "locked OK / plain throws / empty OK" triple is the fingerprint of a short-circuit-latent
free identifier, and it is the experiment the release process never ran.

---

## 4. Root cause #2 (introduced by the v0.2.11 diff): `status` read at function scope

The diff moves the image lookup **above** the `map`, but `status` and `record` are still
declared *inside* the callback:

```js
  if (occurrences.length === 0) return null;
  const imageItem = status !== 'missing'                       // <-- no "status" binding in this scope
    ? record?.items.find(item => isImagePath(item.path))       // <-- no "record" binding either
    : undefined;
  return h('div', { className }, ...occurrences.map(occurrence => {
    const record = records.get(occurrence.ref);                // binding starts here
    const status = record?.status ?? 'missing';
```

`status` is unresolvable at the hoisted position, so v0.2.11 throws **unconditionally**
whenever a chip exists — the phase no longer matters, which is why the user's very first
paste after upgrading killed the dock. Measured:

```
v0.2.11  0 occurrences, phase=plain   -> OK null
v0.2.11  1 occurrence,  phase=locked  -> THROW ReferenceError: status is not defined
v0.2.11  1 occurrence,  phase=plain   -> THROW ReferenceError: status is not defined
```

Two further defects sit in the same three lines, and the fix must take them too:

* **`record?.items.find(...)`** is only half-guarded: `record` may exist while `items` is
  `undefined` (a record created before the upload listed its files), giving
  `TypeError: Cannot read properties of undefined (reading 'find')` — same boundary, same
  silent vanishing. Needs `(record?.items ?? [])`.
* **`imageItem` is computed once for the whole list**, from variables that were meant to be
  per-occurrence. Even with the scoping repaired mechanically, every chip would preview the
  *first* occurrence's image and every chip would get the first chip's click handler and
  `data-image`. The lookup belongs *inside* the `map` callback, next to `record` and `status`.
* **`event.target.closest('.remove')`** assumes `target` is an `Element` with `closest`.
  Synthetic targets are usually elements, but text nodes, `document`, and non-DOM test
  doubles are not; `event.target?.closest?.('.remove')` costs one `?.` and removes a second
  render-time `TypeError` class from the same entry.

**Important for the fix:** deleting only `|| busy` leaves v0.2.11 crashing at `status`. The
probe demonstrates it — "remove `|| busy`" alone still throws `ReferenceError: status is not defined`;
removing `|| busy` **and** scoping the hoisted reads is the first configuration that renders a
chip. So there are two instances of one bug class, and any patch that touches only the line
named in the maintainer note will be reported as "still broken".

---

## 5. Why "the diff did it" is the wrong first conclusion, and the bisection that gets it right

The diff *is* suspicious — same file, same function, shipped immediately before the report.
But suspicion is not a bisect. The diff demonstrably adds a crash (root cause #2), yet the
question "did the v0.2.10 line already throw?" has an answer that does not depend on the diff,
and it is **yes**, whenever `phase` is `'plain'`. Two independent facts separate the
hypotheses:

1. **The throw site is a line the diff never wrote.** In v0.2.10 the failure stack points at
   the `disabled:` property of the remove button, inside `AttachmentChips`; the hover-preview
   hunk adds `imageItem`, `data-image`, `onClick` and `hover-card` and does not touch that
   property. (The diff snippet shows it only as context.)
2. **The failure is phase- and data-gated, not feature-gated.** Empty dock → `null`, no
   throw, both versions. Chip present + `locked` → v0.2.10 fine, v0.2.11 throws. Chip present
   + `plain` → both throw, different identifiers. A feature regression would not care about
   `phase`; a short-circuited free identifier cannot behave any other way.

**Correct bisection (executed as a render mount, never as a syntax check):**

1. **Reproduce in a mount, with data present.** Mount `AttachmentDock` (or call
   `AttachmentChips(props,'dock')`) with one occurrence, `source: SOURCE`, a resolvable
   `ref`, and `input.phase: 'plain'`. Expect `ReferenceError: busy is not defined` at
   the `disabled:` line. The empty-state mount returns `null` and proves nothing — do not
   start there.
2. **Roll back / stub out the v0.2.11 hunk, keep everything else.** The same mount still
   throws at the same line, same message. ⇒ the crash predates the diff.
3. **Re-add the hunk line by line (or hunk by hunk).** With the hover block restored, the
   first throw becomes `status is not defined`, one frame earlier. ⇒ the diff contributes a
   *second* crash site, not the original one. Keep both results; they are different bugs that
   happen to share a boundary.
4. **Only then** widen to phase `'locked'`: v0.2.10 renders, v0.2.11 still throws at `status`.
   That asymmetry is the discriminator between "the guard was holding" and "the new code
   removed the guard's relevance".
5. **Static cross-check:** `eslint --no-undef` / `tsc --checkJs --allowJs --noEmit` over `lib/`
   names both identifiers without running anything. `node --check` names neither (§8).

What would have *supported* the "new feature crashed the slot" story, and does not hold here:
a stack frame inside `openImageViewer`/`objectUrlOf`, a crash that needs an image path to
reproduce, or a v0.2.10 build that renders the same chip fine in `plain` phase. None of those
are true; the v0.2.10 build fails on the same input.

Root-cause attribution, stated carefully: **the pre-existing `busy` reference is the latent
defect the release process carried for a version; the v0.2.11 hunk is a second, cruder
instance of the same class that turned a phase-gated crash into a data-gated one.** The
maintainer note's own evidence ("v0.2.10 users used the x button fine") is consistent only
because the old path never evaluated the right operand — not because the line was correct.
Blaming the diff first would have produced a rollback that "works" only until the next
`plain`-phase render, and a re-ship that breaks again.

---

## 6. The fix

Minimal, and both sites at once (this is the version the probe renders successfully):

```diff
 function AttachmentChips(props, className) {
   const occurrences = (props.input?.occurrences ?? []).filter(item => item.source === SOURCE);
   if (occurrences.length === 0) return null;
-  const imageItem = status !== 'missing'
-    ? record?.items.find(item => isImagePath(item.path))
-    : undefined;
+  const locked = (props.input?.phase ?? 'plain') !== 'plain';
   return h('div', { className }, ...occurrences.map(occurrence => {
     const record = records.get(occurrence.ref);
     const status = record?.status ?? 'missing';
+    const imageItem = status !== 'missing'
+      ? (record?.items ?? []).find(item => isImagePath(item?.path))
+      : undefined;
     return h('div', {
       className: 'chip',
       'data-status': status,
       'data-image': imageItem === undefined ? undefined : '1',
       key: occurrence.occurrenceId,
-      onClick: imageItem === undefined ? undefined : event => {
-        if (event.target.closest('.remove') !== null) return;
+      onClick: imageItem === undefined ? undefined : event => {
+        if (event.target?.closest?.('.remove')) return;
         openImageViewer({ src: objectUrlOf(imageItem.file), name: imageItem.path });
       },
     },
       h('span', { className: 'name' }, record?.label ?? occurrence.label),
       imageItem !== undefined && h('div', { className: 'hover-card' },
         h('img', { src: objectUrlOf(imageItem.file), alt: imageItem.path })),
       h('button', {
         type: 'button',
         className: 'remove',
-        disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,
+        disabled: locked,
         onClick: () => props.remove(occurrence),
       }, 'x'));
   }));
 }
```

Notes on the choices:

* **Delete `busy`, don't "scope it properly".** It is `AttachButton`'s own `open`-menu
  busy flag; the chip's remove control has no reason to care. Passing it into the dock's props
  or a shared store would just rebuild the coupling across two slot entries that are
  otherwise independent — and each would then need its own subscription. If a pending upload
  must disable removal, derive it from the data the chip already reads:
  `disabled: locked || status === 'uploading'`.
* **`locked` is hoisted once** instead of re-reading `props.input?.phase` per chip; same
  semantics, one place to audit.
* **`imageItem` moved inside the callback**, so the preview, `data-image` and the click handler
  belong to the occurrence being rendered. This also removes the "first chip's image on every
  chip" correctness bug the hoist introduced.
* **`(record?.items ?? [])`** and **`item?.path`**: a record can exist before its file list does,
  and a malformed item should not take down the entry. Cheap because there is no fallback UI
  to design — one `?.` vs. an invisible dock.
* **`event.target?.closest?.('.remove')`**: the handler runs on a user click, i.e. *after*
  the chip finally renders; a `TypeError` here would unmount the entry on click with the same
  console-only symptom, and would look like "the x deletes the whole dock".
* **`onClick` on the wrapper + a nested remove button** also wants
  `event.stopPropagation()` in the remove handler (or the early return above, which is what
  the diff does); keep it, and keep the early return before `openImageViewer` so the x does
  not also open a viewer.

---

## 7. The regression that would have caught it

The test that matters mounts the component **with an occurrence present** and asserts that
the slot entry did not trip its boundary. Two properties make it a real gate: it goes
through the same renderer/slot harness the host uses (so the boundary is exercised), and it
runs the shipped artifact, not a syntax parse.

```js
// test/dock.render.test.js  (illustrative harness names; use the DSH slot test kit)
import { mountSlotEntry, captureSlotErrors } from '@dsh/test-kit';
import { AttachmentDock, records } from '../lib/client.js';

const SOURCE = 'attach';
const occ = (id) => ({ source: SOURCE, ref: 'ref-' + id, occurrenceId: 'o' + id, label: 'shot.png' });

function mountDock({ phase, occurrences, record }) {
  records.clear();
  if (record !== undefined) records.set('ref-1', record);
  const boundary = captureSlotErrors();          // spy on the host error boundary
  const view = mountSlotEntry(AttachmentDock, {
    input: { phase, occurrences },
    remove: () => {},
  });
  return { ...view, boundary };
}

test('dock renders a chip when an occurrence is present (v0.2.10/v0.2.11 crash)', () => {
  const { container, boundary } = mountDock({
    phase: 'plain',
    occurrences: [occ(1)],
    record: { status: 'ready', label: 'shot.png', items: [{ path: '/tmp/shot.png', file: {} }] },
  });
  expect(boundary.errors).toEqual([]);           // no ReferenceError captured
  expect(boundary.unmounted).toBe(false);        // entry still mounted
  expect(container.querySelectorAll('.chip')).toHaveLength(1);
  expect(container.querySelector('.chip .name').textContent).toBe('shot.png');
  expect(container.querySelector('.chip button.remove').disabled).toBe(false);
});

test.each([
  // occurrences, phase,    record,                       expectation
  [0,           'plain',  undefined,                    'null, no error'],
  [1,           'plain',  { status: 'ready', label: 'a.png', items: [] }, 'chip renders, remove enabled'],
  [1,           'locked', { status: 'ready', label: 'a.png', items: [] }, 'chip renders, remove disabled'],
  [1,           'plain',  undefined,                    'chip renders as missing, no throw'],
  [1,           'plain',  { status: 'ready', label: 'a.png' /* items undefined */ }, 'no throw'],
  [2,           'plain',  { status: 'ready', label: 'a.png', items: [{ path: 'a.png', file: {} }] }, 'two chips render'],
])('dock matrix: %i occurrence(s), phase=%s', (n, phase, record) => {
  const occurrences = Array.from({ length: n }, (_, i) => occ(i + 1));
  const { container, boundary } = mountDock({ phase, occurrences, record });
  expect(boundary.errors).toEqual([]);
  expect(container.querySelectorAll('.chip')).toHaveLength(n);
});
```

Why each row exists:

* **`[0, 'plain']`** — the empty state. It returns `null` before the throwing line, so it
  passes on the broken build. It is included to document the early return, **not** as the
  gate; a suite with only this row is exactly how the bug shipped.
* **`[1, 'plain']`** — the row that fails on v0.2.10 (evaluates `busy`) and on v0.2.11
  (evaluates `status`). This is the one-line test that was missing.
* **`[1, 'locked']`** — covers the *other* side of the `||`; without it, a fix that
  deletes the guard entirely and drops the disabled state would look fine.
* **missing record / missing `items`** — the defensive-read rows; these fail with
  `TypeError` if `record?.items` is left half-guarded.
* **two chips** — catches the single-`imageItem` hoist (per-occurrence preview) and proves
  the whole list survives, not just the first element.
* **`boundary.errors` / `boundary.unmounted`** — asserting only "no throw from the
  direct call" is weaker than asserting the *boundary was never engaged*, because a future
  wrapper can swallow the throw. Assert both. Optionally also fail on any `console.error`.

Add a second, even cheaper layer: `eslint --no-undef` (or `tsc --checkJs`) over `lib/`.
It flags `busy` and `status` without any fixture data, and it is the only check that
would have caught the *next* dangling identifier before a user did.

---

## 8. Release-process lesson: `node --check` cannot see scope, and lib-only plugins have no other net

`node --check` only parses. `busy` is a syntactically perfect identifier reference; the
parser does not resolve scopes, so the file is "valid" and the release gate is green while
the component is guaranteed to throw the first time a chip renders. The same is true for
`status` in the new hunk. `node --check` answers "is this file parseable?", not "can this
module render?" — and for a lib-only plugin there is no App, no route, no dev server and no
type-checker in the ship path to answer the second question.

Why this class of bug is invisible to every check that was actually run:

* **No bundler/typecheck.** `lib/client.js` ships as authored, so there is no build step
  where a bundler or `tsc` could resolve free identifiers.
* **Failure needs data.** The dock renders `null` in the empty state; every smoke test and
  every manual "open the app and look" pass is green until someone pastes an image.
* **Failure needs a specific state.** `|| busy` only evaluates when `phase === 'plain'`, so
  even a data-present mount can pass if it happens to run in a locked phase.
* **Failure is swallowed.** The slot boundary converts an exception into "nothing rendered",
  so nothing in CI, the page, or the console-driven manual pass fails loudly — the only
  observer is a user who notices an absence.

**Minimum viable pre-ship gate for slot-rendering lib-only plugins** (cheap, no infra beyond
what the plugin already has):

1. **Static, zero-fixture:** `eslint` with `no-undef` (or `tsc --allowJs --checkJs --noEmit`)
   over `lib/`. Catches every dangling identifier, including ones no test happened to
   reach. This alone would have blocked both releases.
2. **Render every exported slot component against the shipped artifact**, with a data
   fixture per component — for this plugin: at least one occurrence, a resolvable record, and
   both `phase: 'plain'` and a locked phase. Never only the empty state.
3. **Assert the slot boundary was not engaged** (error spy + `unmounted === false`), plus the
   expected DOM (chip count, label, `disabled`), and fail on unexpected `console.error`.
4. **Exercise the interaction once** (click x → `props.remove` called with the occurrence,
   viewer not opened) because event handlers run outside the render smoke and throw into the
   same boundary.
5. **Run it on the packed tarball's `lib/`**, not the repo source, so the check covers what the
   registry actually serves.

That is a five-minute CI job. Its absence is the release-process defect behind this issue:
a green syntax check was treated as a render check.

---

## 9. Scope, constraints, reproducibility

* Fixture read only; nothing under `fixture/` was modified, and no installs, migrations,
  network calls or `git` commands were run.
* The reproduction is a dependency-free re-mount of the two `AttachmentChips` variants
  (`../_verify/probe-render.mjs`, `node probe-render.mjs`) with a stub `h()`, `records`,
  `SOURCE`, `isImagePath`, `objectUrlOf`, `openImageViewer`. It substitutes for the host slot
  harness and therefore proves the throw sites and the short-circuit behaviour; it does not
  prove the boundary's UI fallback (that part is per the plugin/host contract described in
  the thread).
* Residual risk to flag in the PR: a stray global named `busy` in the bundled page would
  have masked #1 as `undefined`; after the fix, grep the built bundle for accidental
  globals and add `'use strict'` / ESM (already implicit) so accidental writes fail loudly.

## 10. Probe output (verbatim)

```
v0.2.10 AttachmentChips:
  0 occurrences, phase=plain  -> OK null (renders nothing)
  0 occurrences, phase=locked -> OK null (renders nothing)
  1 occurrence,  phase=locked -> OK chip tree
  1 occurrence,  phase=plain  -> THROW ReferenceError: busy is not defined
  1 occurrence,  phase absent -> THROW ReferenceError: busy is not defined
v0.2.11 AttachmentChips (hover preview):
  0 occurrences, phase=plain  -> OK null (renders nothing)
  1 occurrence,  phase=locked -> THROW ReferenceError: status is not defined
  1 occurrence,  phase=plain  -> THROW ReferenceError: status is not defined
After removing only "|| busy" (naive one-line fix), v0.2.11 with chip present:
  -> THROW ReferenceError: status is not defined
After also scoping the hoisted record/status reads (correct fix), v0.2.11 chip present:
  -> OK
```


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.