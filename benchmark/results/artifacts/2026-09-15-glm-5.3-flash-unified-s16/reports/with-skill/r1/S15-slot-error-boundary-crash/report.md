# S15 · Vanishing Dock Chips — Root-Cause Diagnosis (read-only, Mode A · inspect)

- **Task**: S15-slot-error-boundary-crash · `@org/dsh-attach-input` v0.2.11 regression
- **Date**: 2026-09-15 · **Mode**: A (read-only inspection and report; no migration, no install, no writes outside `agent-output/`)
- **Evidence used** (all read-only, under `fixture/`):
  - `fixture/plugin-dock-chips.js` — v0.2.10 shipped excerpt (`AttachmentChips`, `AttachButton`, `AttachmentDock`)
  - `fixture/feature.diff` — v0.2.11 hover-preview diff
  - `fixture/user-thread.md` — user report (mirren) + maintainer note
- **Report discipline**: per the plugin-upgrade skill's conflict rule ("when local observation conflicts with a primary source, record both, reproduce, and report"), one discrepancy between two evidence sources is flagged in §1.3 and resolved by the bisection in §2 — it does not change the fix, the regression, or the process lesson.

---

## Executive summary

The dock chips vanish because of a **dangling free identifier `busy`** on the pre-existing
remove-button line of `AttachmentChips` (`disabled: … !== 'plain' || busy`). `busy` exists
only as `AttachButton`'s `React.useState` local; evaluating it in `AttachmentChips` throws
`ReferenceError: busy is not defined` **during render**. The slot-level error boundary
catches the throw and **unmounts the entire InputZone slot entry** (the whole dock), logging
only to the browser console — so the user-visible symptom is "the dock vanished", never
"the remove button is broken". The v0.2.11 hover-preview diff did not create the bug; it
(1) merged the hardening-era line into the shipped artifact and (2) was the first release
whose normal usage (paste → chip present, composer in the plain phase) actually evaluated
the expression. The diff additionally introduces a second free-identifier/scope defect of
the same family (`record`/`status` used outside the `.map` callback), which is what a
console-only observer would blame first — the bisection below separates the two.

---

## 1. Exact root cause

### 1.1 The throwing expression

`fixture/plugin-dock-chips.js`, lines 29–35 (as shipped in v0.2.10, annotated by the
maintainer note as "added in a hardening pass"):

```js
h('button', {
  type: 'button',
  className: 'remove',
  'aria-label': 'Remove ' + (record?.label ?? occurrence.label),
  disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,   // <-- ???
  onClick: () => props.remove(occurrence),
}, 'x')
```

`busy` is **not in scope** in `AttachmentChips`. It is declared nine lines earlier as a
`useState` local of a *different component* (`AttachButton`, line 7, flagged in the fixture
with "busy lives HERE"). The hardening pass copied `AttachButton`'s `locked || busy`
disabled-shape into `AttachmentChips` without bringing the binding. Reading an unresolvable
identifier — strict or sloppy mode, with or without optional chaining elsewhere in the
expression — throws **`ReferenceError: busy is not defined`**. Note that the many `?.` /
`??` operators in the same function (`record?.status ?? 'missing'`, `props.input?.phase ?? 'plain'`)
give no protection whatsoever: optional chaining null-guards *values*, never *identifier
resolution*.

### 1.2 Why it throws only when a chip renders

The throwing expression lives inside `occurrences.map(…)`, which executes only **after** the
early return:

```js
const occurrences = (props.input?.occurrences ?? []).filter(item => item.source === SOURCE);
if (occurrences.length === 0) return null;          // empty dock: never reaches the line
return h('div', { className }, ...occurrences.map(occurrence => {
  …
  disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,   // evaluated HERE, per chip
```

- **No occurrence with `source === SOURCE`** → `return null` → the `disabled` expression is
  never evaluated → no crash. This is why the attach button, the paste pipeline, and every
  empty-composer render are unaffected.
- **First occurrence present** → the `.map` callback builds the button's props *object
  literal* synchronously during render → `busy` is evaluated → `ReferenceError` propagates
  out of `AttachmentChips` → out of `AttachmentDock` → to the slot boundary.

"Throws only when a chip renders" is therefore literal: the crash path is gated on
**data present at render time**, not on any code path of the new feature.

### 1.3 Why the `||` short-circuit kept it latent through v0.2.10

`A || B` evaluates `B` **only when `A` is falsy**. Here `A` is the phase guard
`(props.input?.phase ?? 'plain') !== 'plain'` and `B` is the dangling `busy`. So:

- Composer **locked / non-plain phase** → guard `true` → **short-circuit** → `busy` is never
  evaluated → the render succeeds. Every render in a locked phase, and every empty-dock
  render, sails past the dangling reference.
- Composer **plain (unlocked)** → guard `false` → `busy` **is** evaluated → `ReferenceError`.

The fatal combination is the conjunction: **≥1 chip present at render ∧ composer in the
`'plain'` phase at that render**. The short-circuit is why the line survived the hardening
pass's review (it reads as a guarded, sensible expression) and why locked-phase renders
never exposed it.

**Evidence discrepancy (recorded, not silently resolved).** The shipped excerpt and the
maintainer note both say v0.2.10 already shipped this line — yet v0.2.10 users demonstrably
rendered chips in the plain phase and clicked the enabled x button, which under §1.2/§1.3
must throw. Both facts cannot hold at runtime. `feature.diff` resolves it: its old side
shows `disabled: (props.input?.phase ?? 'plain') !== 'plain',` **without** `|| busy` —
i.e. the diff was cut against the actual published v0.2.10 artifact, and the dangling
reference reached users only with the v0.2.11 build (the hardening branch riding along with
the hover-preview merge). In that reading the maintainer's "v0.2.10 already had it" reflects
their current tree, not the published v0.2.10 tarball. Whichever historical reading is
correct, everything downstream is identical: the reference predates the *hover-preview
feature* (it is hardening-pass code, not feature code), and the `||` short-circuit is the
mechanism that let a `ReferenceError` sit inside a shipped component without firing on
every render. The bisection in §2 is the experiment that settles attribution
definitively — that is precisely why "run the bisect" must precede "believe the diff".

### 1.4 Why the symptom is "the whole dock vanished", not "the remove button is broken"

The plugin registers the dock through the InputZone slot. Per the maintainer note (and the
host's contract): **a slot entry that throws during render is caught by the framework's
slot-level error boundary, which unmounts the whole entry; the error is visible only in the
browser console.** Consequences:

- The throw happens *during the entry's render*, before any chip or button DOM exists —
  there is no "remove button partially rendered but broken". The boundary tears down
  `AttachmentDock` (the whole slot entry), leaving the slot empty. The user perceives
  "the chip feature is gone".
- **Console-only visibility**: no toast, no banner, no red box. The user (mirren) explicitly
  reports "I don't see any error banner in the UI". Nobody opens devtools for a missing chip,
  so the only forensic trace is invisible in the field.
- Blast radius is per-slot-entry: the attach button (`input.left` slot entry, its own
  boundary) and the paste pipeline (host-side, not part of this entry) keep working —
  exactly mirren's report ("the paste itself still works … the attach button is still
  there").

---

## 2. Why blaming the v0.2.11 diff is the wrong first conclusion

### 2.1 Why the trap is so effective

The diff **touches the same component**, so temporal coincidence is maximal: "it worked in
v0.2.10, we changed `AttachmentChips` in v0.2.11, the chip dock is dead" — the naive
bisect-by-suspicion stops at the diff. Worse, the diff *contains a real new defect with the
same signature* (§2.3), so the console appears to confirm the blame. It is still the wrong
first conclusion, because the line that the bisection convicts is **pre-existing
hardening-pass code**, not hover-preview code.

### 2.2 The correct bisection

Two cheap, read-only experiments (both runnable against the evidence pack without a host):

1. **Rollback/re-add bisect at hunk granularity** on the shipped v0.2.11:
   - Revert **only the hover-preview hunks** (the `imageItem` line, chip `onClick`,
     `hover-card` child), keeping the `disabled … || busy` line → a minimal mount with one
     occurrence **still throws `ReferenceError: busy is not defined`**. The feature additions
     were never the (only) thrower.
   - Re-add the preview hunks (properly scoped, §3) while reverting only the `|| busy` tail →
     the `busy` throw disappears. Attribution is now exact.
2. **Minimal render mount** (no host needed — `AttachmentChips` is a plain function that
     builds vnodes, so *calling it* executes the render path):

   ```js
   const { AttachmentChips } = await import('./plugin-dock-chips.js'); // stub React/h/records/SOURCE first
   AttachmentChips({ input: { phase: 'plain', occurrences: [
     { source: SOURCE, ref: 'rec-1', occurrenceId: 'occ-1', label: 'shot.png' },
   ] } }, 'dock');
   // → ReferenceError: busy is not defined   (thrown by v0.2.10-era code, zero v0.2.11 hunks involved)
   ```

   This proves the latent bug exists **independent of the diff**.

### 2.3 Evidence that distinguishes "new feature crashed the slot" from "old latent bug first exercised now"

- **Console signature layering (derived from the code).** As diffed, the v0.2.11
  `imageItem` line sits at `AttachmentChips` top level, *before* the `.map` where
  `record`/`status` are declared — it references free identifiers itself (`status`
  "resolves" accidentally to the browser's `window.status === ''`, so the true branch runs,
  then `record` is unresolvable). Therefore the **first** console error in v0.2.11 is
  `ReferenceError: record is not defined` — a name that *appears verbatim in the diff's
  added lines*, making the blame-the-diff trap nearly irresistible. Only the hunk-granularity
  bisect (§2.2) reveals the **second, pre-existing** thrower (`busy`) underneath. Two
  different `ReferenceError` names from two different lines = two defects of one class
  (free identifier in a slot render path), one old, one new — not "the feature crashed".
- **Failure gating vs feature gating.** "New feature crashed the slot" predicts failures
  tied to the feature's own inputs: image records only, and only once the hover/click paths
  execute. What the user actually loses is the **entire dock for any attachment**, and they
  reach **zero** hover or click interactions (the component throws before commit). The new
  feature's runtime behavior never ran; the crash fired on the old line during the first
  ordinary data-present render.
- **Usage-timing evidence.** v0.2.10 field history (chips visible, x button used fine) is
  itself data: the dangling reference produced zero reports across v0.2.10's lifetime,
  then fired on the first v0.2.11 paste. "Old latent bug first exercised now" predicts
  exactly this on/off pattern keyed to when the fatal conjunction (§1.3) first occurs in
  the shipped artifact — which the diff's own old side corroborates (published v0.2.10 did
  not yet contain the `|| busy` tail; see §1.3).

---

## 3. The fix

### 3.1 Remove the dangling reference

`AttachmentChips` has no add-in-flight state of its own; `busy` is `AttachButton`'s
transient upload flag and is meaningless for chip removal. The minimal fix:

```diff
-        disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,
+        disabled: (props.input?.phase ?? 'plain') !== 'plain',
```

If product intent really is "block chip removal while an add is in flight", scope it
properly instead: lift that state out of `AttachButton` (context/store, or pass it down as
`props.busy` from the slot host) so the reference resolves by design, not by accident.
For a lib-only plugin the "or scope it properly" branch is preferable only if the state
genuinely belongs to the dock; otherwise removal keeps the component honest and
self-contained.

### 3.2 Scope the hover-preview additions properly (same pass, or the dock stays dead)

Removing `|| busy` alone does **not** restore the dock in v0.2.11, because the diff's
`imageItem` line is a second free-identifier crash (§2.3). Move it inside the `.map`
callback where `record`/`status` are declared — which also fixes its logic (per-occurrence
image, not one record's image stamped on every chip):

```js
return h('div', { className }, ...occurrences.map(occurrence => {
  const record = records.get(occurrence.ref);
  const status = record?.status ?? 'missing';
  const imageItem = status !== 'missing'
    ? (record?.items ?? []).find(item => isImagePath(item.path))   // hardened read, see 3.3
    : undefined;
  return h('div', { /* chip props … */ });
}));
```

### 3.3 The two hardening patterns the diff should also get

1. **`record?.items ?? []`-style defensive reads.** `(record?.items ?? []).find(…)` (and the
   existing `record?.status ?? 'missing'`) tolerates a missing/evicted record or an
   `items`-less record shape: the chip degrades to `data-status: "missing"` instead of a
   `TypeError: … .find is not a function` (or a nullish-deref) killing the render.
2. **Optional-chained `event.target.closest?.()`** in the click-to-view handler. In slotted
   DOM the event target can be a text node, an SVG node, or another plugin's element
   crossing the host's composition boundary — `.closest` is not guaranteed:

   ```js
   onClick: imageItem === undefined ? undefined : event => {
     const removeHit = event.target instanceof Element ? event.target.closest('.remove') : null;
     if (removeHit !== null) return;                 // clicked the x: let the button handle it
     openImageViewer({ src: objectUrlOf(imageItem.file), name: imageItem.path });
   }
   ```

   (Minimal variant per the task's phrasing: `if (event.target?.closest?.('.remove') ?? true) return;`
   — note the `?? true` bail-out: an unresolvable target must *skip* the viewer, not open it.)

**Why these are cheap insurance in slot components.** The failure asymmetry is extreme:
a slot component's error boundary is **total and silent** — any throw anywhere in the render
path (or in a handler that runs before the next render) unmounts the *entire entry*, with the
error visible only in a console users never open (§1.4). The defensive reads cost a handful
of characters, no state, no branching complexity, and they are *semantically* correct here,
not paranoia: occurrence records are host/session-supplied data the component does not own
(old sessions, evicted records, schema drift), and slotted DOM mixes in elements the
component does not own. Paying two characters to convert "whole feature vanishes
invisibly" into "one chip shows missing / one click is ignored" is the best trade available
in this layer.

---

## 4. The regression that would have caught this before release

A **render smoke that mounts the dock with an occurrence present** — deliberately *not* the
empty state, because the empty dock returns `null` at line 23 before reaching the throwing
line: an empty-state smoke passes forever while the data path rots.

Two composition details that matter for this specific bug:

- The smoke must mount with **`phase: 'plain'`**. A locked-phase-only variant would *not*
  catch the bug: the `||` short-circuit makes the locked render succeed (§1.3).
- It must assert **no error-boundary capture**, not merely "no exception at the test level" —
  otherwise a silently unmounted entry can still "pass" a shallow smoke.

```js
// dock-render-smoke.test.js — runs in Node; no host, no browser needed
import { h, render } from /* any vnode renderer, e.g. preact + preact-render-to-string */ '…';
import { AttachmentDock, SOURCE } from '../lib/client.js';

test('dock renders a chip with an occurrence present (plain phase), no boundary capture', () => {
  records.set('rec-1', { status: 'ready', label: 'screenshot.png', items: [] });
  const input = {
    phase: 'plain',
    occurrences: [{ source: SOURCE, ref: 'rec-1', occurrenceId: 'occ-1', label: 'screenshot.png' }],
  };
  let boundaryCaptured = null;
  const html = renderToString(
    h(ErrorBoundary, { onError: e => { boundaryCaptured = e; } },
      h(AttachmentDock, { input, add: () => {}, remove: () => {} })),
  );
  expect(boundaryCaptured).toBeNull();                                   // nothing unmounted us
  expect(html).toContain('data-status="ready"');                          // the chip element rendered
  expect(html).toContain('screenshot.png');                               // with its label
  const btn = /<button[^>]*class="remove"[^>]*>/.exec(html)[0];
  expect(btn).not.toContain('disabled');                                  // enabled at plain phase
});

test('dock renders nothing (null) when no occurrences', () => {
  expect(AttachmentDock({ input: { phase: 'plain', occurrences: [] } })).toBe(null);
});
```

Pre-fix, the first test fails with `ReferenceError: busy is not defined` (and, unscoped
preview hunks present, `ReferenceError: record is not defined`) — the exact class of
failure that shipped. Mirror case worth one more block: `phase: 'sending'` → remove button
rendered but `disabled` (covers the guard's true branch, which the short-circuit otherwise
keeps untested).

---

## 5. Release-process lesson

### 5.1 Why "syntax check only" (`node --check`) was insufficient

`node --check` **parses only** — it validates grammar, never identifier resolution. A free
identifier is perfectly valid *syntax*; the `ReferenceError` is a *runtime resolution
failure* that fires only when evaluation reaches the expression — which, per §1.2/§1.3,
requires a data-present render in a specific composer phase. Demonstrated on this very
evidence pack:

```
$ node --check fixture/plugin-dock-chips.js     # contains the dangling `busy`
$ echo $?
0
```

A **lib-only** plugin (ships plain `lib/*.js`; no bundler, no TypeScript, no ESLint
`no-undef`) has *no* static gate in its pipeline that resolves identifiers — so the entire
pre-ship verification reduced to the parse gate, and a render-time-only crash sailed
through. The gap is not "we should have run the app": it is that for slot-rendering
components, *rendering is the unit of correctness*, and no gate in the pipeline ever
rendered anything.

### 5.2 Minimum viable pre-ship check for slot-rendering lib-only plugins

A four-rung ladder, in increasing value; rung 3 is the new mandatory minimum:

1. **Parse gate** (existing): `node --check lib/*.js`. Free, keep it.
2. **Load gate**: `node -e "import('./lib/client.js')"` (with the few host globals stubbed).
   Catches top-level throws; still misses render-time failures.
3. **Data-present render smoke per slot component** (the §4 test, one file, no host, no
   browser): call each slot-registered component with (a) empty props → expect `null`, and
   (b) one realistic occurrence + record → expect the chip element in the output and **no
   error-boundary capture**. For function components that build vnodes, *calling the
   function* executes the full render path — this smoke needs no DOM emulator at all and is
   ~20 lines. It catches every free-identifier and scope defect in this report at the first
   render.
4. **Handler smoke** (cheap bonus): invoke each `onClick` with a synthetic event — catches
   the `closest`-class handler defects before a user's click becomes the next unmount.

The principle is the same one the plugin-upgrade skill applies to host-side runtime
verification — for a Web Client plugin you must *prove registration/mount, not accept a
bare HTTP 200*. Scaled down to a plugin's own release gate: **prove a data-present render,
never accept a bare syntax check.** The complementary process lesson: gate on per-component
render coverage, not on diff risk-review. This bug was invisible to review twice — the
hardening pass that wrote the guarded-looking line, and the v0.2.11 review that read the
diff as "feature-only" — because in both cases the human question was "does the *change*
look right?" when the operative question was "does the *component* render with data?"

---

## Residual uncertainties

- **Which v0.2.10 artifact users actually ran** (with or without the `|| busy` tail) is not
  settle-able from the pack alone — the shipped excerpt/maintainer note and the diff's old
  side conflict (§1.3). The §2 bisection settles it in one command against the real v0.2.10
  tag if ever needed. It does not affect the fix (§3), the regression (§4), or the process
  lesson (§5), all of which are identical under either reading.
- No execution of any fixture file was performed beyond `node --check` (read-only parse);
  the console-signature claims in §2.3 are derived from the code as diffed and are
  falsifiable by the §2.2 minimal mount.
