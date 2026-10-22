# S15 · Vanishing Dock Chips — Root-Cause & Process Report

**Plugin:** `@org/dsh-attach-input` (Web client plugin, lib-only) · **Release under report:** v0.2.11 (hover-preview)
**Symptom:** after pasting a screenshot, the pending-attachment chip dock above the input never appears; paste/attach still work; no UI error shown.
**Evidence pack (read-only):** `fixture/plugin-dock-chips.js` (v0.2.10 shipped excerpt), `fixture/feature.diff` (v0.2.11 diff), `fixture/user-thread.md` (user report + maintainer note), `fixture/README.md`.

## Verdict (TL;DR)

The dock dies because **`AttachmentChips` evaluates a free identifier `busy`** in the remove button's
`disabled` prop (`plugin-dock-chips.js:34`): `disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy`.
`busy` is `AttachButton`'s local React state (`plugin-dock-chips.js:7`) — a different component's closure — so in
`AttachmentChips` it is an unbound name and evaluating it throws **`ReferenceError: busy is not defined`** *during
render*. The throw only happens when (a) at least one occurrence exists (the empty dock returns `null` earlier,
line 23) and (b) the phase guard on the left of `||` is falsy — `||` short-circuiting is exactly what kept the
dangling name runtime-dead (latent) through v0.2.10. Because the throw happens in render, the framework's
**slot-level error boundary** catches it and **unmounts the whole slot entry** (the entire dock), logging only to the
browser console — hence "everything vanished silently" instead of "the x button misbehaves". The v0.2.11
hover-preview diff is where the *regression became visible*, not where the defect lives; a rollback/re-add bisect or
a minimal data-present render mount points at the pre-existing line. Fix: delete the dangling `|| busy` (or thread a
real in-scope busy signal), plus two cheap hardening patterns (`(record?.items ?? [])`-style defensive reads,
optional-chained `event.target?.closest?.()`). The pre-ship gap: `node --check` validates *syntax*, and a free
identifier is an *evaluation-time* error — only a **render smoke that mounts the dock WITH an occurrence present and
phase `'plain'`** catches this class.

---

## 1. Exact root cause

### 1.1 The throwing expression

```js
// plugin-dock-chips.js — AttachmentChips (v0.2.10 shipped excerpt)
function AttachButton(props) {
  const [busy, setBusy] = React.useState(false);   // line 7 — busy lives HERE, in AttachButton's closure
  ...
  h('button', { disabled: locked || busy, ... })   // line 17 — legal here: busy is in scope
}

function AttachmentChips(props, className) {
  ...
  h('button', {
    ...
    // line 33 comment: "v0.2.10 hardening pass added the phase guard — and this busy reference:"
    disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,   // line 34 — <-- FREE IDENTIFIER
    ...
  }, 'x')
}
```

- The identifier that throws is **`busy`**, in the `disabled` prop of the chip's remove button
  (`plugin-dock-chips.js:34`).
- **Why it is dangling:** the only `busy` binding in the module is `AttachButton`'s per-render
  `React.useState` local (line 7). React function components do not share lexical scope — each component's locals
  are per-instance closure values. `AttachmentChips` has no `busy` local, no parameter, no import, and the module
  declares no top-level `busy`; there is no `window.busy` either. So identifier resolution walks the scope chain
  to the global and fails: **`ReferenceError: busy is not defined`** the moment the expression is *evaluated*.
- **Provenance (how the dangler was born):** the hardening pass evidently copied `AttachButton`'s
  `disabled: locked || busy` pattern (line 17, where `locked` is the same phase expression inlined) onto the
  chip's remove button. The token `busy` survived the copy-paste, but its binding did not. This is the classic
  free-identifier transplant: *syntactically* fine in both places, *semantically* bound only in the first.
- **Why no tool complained:** a free identifier is not a syntax error. The file parses, `node --check` passes, the
  bundle builds, the module loads, the slot registers — the name is only resolved when the expression is evaluated
  at render time.

### 1.2 Why it throws *only when a chip renders*

Three gates stand before the throwing evaluation; all three must open:

1. **Empty-state early return** — `const occurrences = (props.input?.occurrences ?? []).filter(item => item.source === SOURCE);`
   followed by `if (occurrences.length === 0) return null;` (line 22–23). With no pending attachment of this
   plugin's source, the component returns before the `.map()` callback is ever created. **The empty dock is
   completely silent** — mounting it in a test proves nothing.
2. **The map callback must run** — the `disabled` expression lives inside the per-occurrence callback that builds
   the remove button. It is evaluated once per chip, *during render* (element construction), not on click.
3. **Short-circuit gate** — see 1.3: even with a chip present, `busy` is evaluated only when the left operand is falsy.

So the trigger is exactly the user's action: **paste a screenshot → first occurrence with `source === SOURCE`
exists → the chip renders → the right operand of `||` is reached → ReferenceError.** One paste is enough; no
interaction with the (never-painted) x button is involved.

### 1.3 Why the `||` short-circuit kept it latent through v0.2.10

`A || B` evaluates `B` **only when `A` is falsy**. Here
`A = (props.input?.phase ?? 'plain') !== 'plain'`:

- Whenever the composer is in a non-`'plain'` phase (locked/sending/attaching — the same condition `AttachButton`
  uses for `locked`, line 9), `A` is `true`, `||` returns immediately, and **the dangling `busy` is never
  evaluated**. A short-circuited free identifier is runtime-dead code: a landmine whose trigger is a *usage pattern*,
  not a code path anyone reads.
- Only a render with **`phase === 'plain'`** (idle composer, e.g. `props.input` absent or `phase` absent also
  normalize to `'plain'` via `?? 'plain'`) makes `A` falsy and forces evaluation of `busy`.

Through v0.2.10 the poison combination "chip present **and** composer idle" was never exercised in the field (and no
test ever mounted the dock with data — see §4/§5; the maintainer confirms: *"We shipped without a render smoke that
mounts the dock with a chip present"*). v0.2.11 did not edit the line's semantics — it **changed reachability**: the
hover-preview feature makes "paste an attachment and let it sit in the dock while the composer stays idle so you can
hover/preview it" the headline usage. The first render of a chip against an idle composer evaluated the right
operand for the first time and detonated a mine that was already in the ground.

> **Provenance discrepancy — flag it, then resolve it by bisection, not by argument.** `feature.diff:32–33` shows
> `|| busy` as a v0.2.11 addition (`-` line without it, `+` line with it), while the shipped v0.2.10 excerpt
> (`plugin-dock-chips.js:33–34`) and the maintainer note in `user-thread.md` both state the line was already in
> v0.2.10 from the hardening pass. The two sources cannot both be literally true. This does not change the mechanism
> or the fix (identical either way); it changes only *which release smuggled the dangler in*. The way to settle it is
> evidence, not memory: fetch the **published v0.2.10 artifact** (`npm pack @org/dsh-attach-input@0.2.10` / the
> git tag) and grep the line, and/or run the data-present mount of §4 against v0.2.10 source. If the v0.2.10
> artifact crashes → pre-existing latent bug (the task's canonical reading, matching the shipped excerpt and
> maintainer note). If it does not → the diff itself introduced the line, and the lesson shifts from "latency hid
> it" to "review missed a scope error" — but §2–§5 all still apply verbatim.

### 1.4 Why the symptom is "the whole dock vanished", not "the remove button is broken"

- **Render-phase throw.** The ReferenceError fires while `AttachmentChips` is *constructing the element tree*
  (evaluating the props object of `h('button', {...})`). React never finishes producing the chip subtree — there is
  no "chip with a broken x button" to see. (Contrast: a bug in the button's `onClick` would render the chip fine
  and only misbehave on interaction.)
- **Slot-level error boundary unmounts the whole entry.** Per the maintainer note: the plugin registers the dock
  through the **InputZone slot**, and *"a slot entry that throws during render is caught by the framework's error
  boundary and unmounted"*. The nearest boundary is the framework's per-slot-entry wrapper around
  `AttachmentDock`; boundaries handle render errors by discarding the subtree (and slot entries render no visible
  fallback), so the **entire dock entry** disappears — not just the chip, not just the button. `useRevision()`
  (line 41) means the dock re-renders on every relevant revision, and every re-attempt re-throws while an occurrence
  exists, so the entry stays dead.
- **Why everything else still works.** The error boundary's blast radius is one slot entry:
  - `AttachButton` renders in a **different slot** (`input.left`) with its own boundary → the + button is
    unaffected (matches the user: "the attach button is still there").
  - Paste capture, `props.add`, and the occurrence/records store live in the plugin's **service layer**, outside
    the failing render tree → the attachment is still recorded and the message sends with the image (matches: "the
    paste itself worked").
- **Why it is silent.** The boundary reports via `console.error` in the browser console only — no banner, no toast
  (matches: "I don't see any error banner in the UI"). Users never open devtools, so a hard crash presents as a
  mysterious vanishing feature. This console-only visibility is precisely why slot components need render-phase
  regression tests (§4): the field gives you no error surface to triage from.

---

## 2. Why blaming the v0.2.11 diff is the wrong first conclusion — and the correct bisection

### 2.1 The trap

The tempting syllogism: *v0.2.11 added the hover preview **to AttachmentChips**; AttachmentChips' output vanished;
therefore the hover-preview code broke AttachmentChips.* Every arrow looks sound — temporal correlation (first
release with the symptom), same component (the diff literally touches the failing function), plausible mechanism (new
code = new bugs). It is still **post hoc ergo propter hoc**: the diff is where the *change* happened, which is not the
same as where the *defect* lives. A release can regress a component by **changing which of its lines get evaluated**
without any new line being defective. Reading the diff alone cannot distinguish "new feature crashed the slot" from
"old latent bug first exercised now" — both stories predict the exact same user report.

### 2.2 The correct bisection (two independent routes)

**Route A — minimal render mount (minutes, no release artifacts needed).** Mount the component in isolation
(test renderer or a scratch page with the slot runtime) and vary the *data*, not the version:

| mount | v0.2.10 source | v0.2.11 source |
|---|---|---|
| no occurrences (empty dock) | returns `null`, no throw | returns `null`, no throw |
| 1 occurrence, `phase: 'plain'` | **ReferenceError: busy is not defined** (at the `disabled` prop) | ReferenceError (see §2.4 for which name throws first) |
| 1 occurrence, `phase: 'sending'` (non-plain) | renders; x disabled; **no throw** (short-circuit) | throws earlier at `imageItem` if the diff is taken literally (§2.4), otherwise renders |

If v0.2.10 source reproduces the crash under data-present + idle-phase, the defect **predates the feature** — done.
The `phase: 'non-plain'` row simultaneously *proves the short-circuit latency mechanism* with zero framework
involvement.

**Route B — rollback/re-add bisect on the real artifact.**
1. Install the published **v0.2.10** build, paste an attachment, wait for the composer to be idle → if the dock
   vanishes with the same console ReferenceError, the bug is not the new feature.
2. Otherwise (or additionally), on v0.2.11 **revert the hover-preview hunks only** (`imageItem`, `data-image`,
   `onClick`, hover-card — `feature.diff:8–11, 19–25, 27–28`) while keeping the `disabled` line → crash
   persists ⇒ no new-feature line is *necessary*.
3. **Re-add** the hover-preview pieces one at a time on top of the v0.2.10 line state → crash reproduces identically
   after each addition ⇒ no new-feature line is the *cause*.
4. **Single-line neutralization:** on stock v0.2.11, delete only `|| busy` → dock renders *and* the hover preview
   works ⇒ the feature is exonerated and the fix confirmed in one move.

Both routes converge on the same **pre-existing line** (`plugin-dock-chips.js:34`) rather than any `+` line of the
feature diff.

### 2.3 Evidence that distinguishes "new feature crashed the slot" from "old latent bug first exercised now"

1. **Console error identity + stack trace.** The message is `ReferenceError: busy is not defined` with the top
   frame in the map callback building the remove-button props. No hover-preview code references `busy`; the new
   feature's own failure modes would look different (`objectUrlOf is not a function`, a TypeError inside
   `openImageViewer`, a stack frame in the hover-card construction). The error *names the old line*.
2. **Feature-inert reproduction.** Attach a **non-image** file (or any occurrence for which `imageItem` is
   `undefined`): the hover-card is not built, `onClick`/`data-image` are inert — the entire feature is
   functionally off — yet the dock still vanishes. A crash that reproduces with the new feature disabled cannot be
   caused by the new feature.
3. **Version rollback with data present** (Route B step 1 / Route A row 2): v0.2.10 source/artifact + occurrence +
   idle phase reproduces ⇒ sufficient cause predates v0.2.11.
4. **Single-line neutralization** (Route B step 4): removing one old line fixes the new release without touching any
   new line.
5. **Source archaeology.** `git blame`/`git log -S '|| busy'` on lib/client.js, plus the published v0.2.10
   tarball, date the line to the hardening-pass commit — and settle the diff-vs-shipped-file discrepancy of §1.3
   with artifacts instead of memory.
6. **Mechanism demo in isolation.** A five-line snippet — `const f = phase => phase !== 'plain' || busy;` — shows
   `f('locked')` returns `true` while `f('plain')` throws. Latency-by-short-circuit is demonstrable with no
   framework, no version, no feature code; the feature release only changed *which inputs reach the function*.

### 2.4 Caveat the bisect must not miss: the diff adds a *second* dangling-reference cluster

Taken **literally**, `feature.diff:9–11` inserts

```js
const imageItem = status !== 'missing'
  ? record?.items.find(item => isImagePath(item.path))
  : undefined;
```

into the function body **above** `occurrences.map(...)` — but `record` and `status` are `const`-declared
*inside the callback* (diff lines 13–14), so at that position they are out of scope too. In a browser bundle,
`status` silently resolves to the legacy global `window.status` (`""`), so `status !== 'missing'` is `true`
and the throw lands on **`ReferenceError: record is not defined`** (in a context without that global, `status`
itself throws). Either way this line — if shipped as positioned — throws *before* the `busy` line whenever a chip
renders, and it is also semantically wrong (one shared `imageItem` for all chips instead of per-occurrence). The
console message tells you which dangler fired first (`record/status` ⇒ the misplacement; `busy` ⇒ the
pre-existing line with the imageItem correctly scoped inside the callback, which is where it must live). A rollback
bisect separates them cleanly: reverting the hover hunks removes the `record` throw but *not* the `busy` throw.
The fix scopes `imageItem` per-occurrence inside the map callback (§3) — same disease (transplanted identifiers
whose bindings didn't come along), same cure.

---

## 3. The fix

### 3.1 Corrected component (both danglers removed, both hardening patterns applied)

```js
function AttachmentChips(props, className) {
  const occurrences = (props.input?.occurrences ?? []).filter(item => item.source === SOURCE);
  if (occurrences.length === 0) return null;
  return h('div', { className }, ...occurrences.map(occurrence => {
    const record = records.get(occurrence.ref);
    const status = record?.status ?? 'missing';
    // v0.2.11 hover preview — now PER-OCCURRENCE, inside the callback where record/status are bound:
    const imageItem = status !== 'missing'
      ? (record?.items ?? []).find(item => isImagePath(item.path))   // hardening ①: defensive read
      : undefined;
    return h('div', {
      className: 'chip',
      'data-status': status,
      'data-image': imageItem === undefined ? undefined : '1',
      key: occurrence.occurrenceId,
      onClick: imageItem === undefined ? undefined : event => {
        // hardening ②: optional-chained closest; undefined (no closest) treated as "not on remove"
        if ((event.target?.closest?.('.remove') ?? null) !== null) return;
        openImageViewer({ src: objectUrlOf(imageItem.file), name: imageItem.path });
      },
    },
      h('span', { className: 'name' }, record?.label ?? occurrence.label),
      imageItem !== undefined && h('div', { className: 'hover-card' },
        h('img', { src: objectUrlOf(imageItem.file), alt: imageItem.path })),
      h('button', {
        type: 'button',
        className: 'remove',
        'aria-label': 'Remove ' + (record?.label ?? occurrence.label),
        // FIX: dangling `|| busy` deleted — the phase guard alone is the v0.2.10-diff behavior:
        disabled: (props.input?.phase ?? 'plain') !== 'plain',
        onClick: () => props.remove(occurrence),
      }, 'x'));
  }));
}
```

### 3.2 If "disable x while an attach is in flight" was the real intent — scope it properly

The copied expression *wanted* `AttachButton`'s in-flight flag. You cannot reach into a sibling component's
closure; the signal must cross the boundary through something both components can see:

- **Preferred: let the framework's phase carry it** — if an in-flight `props.add` already puts
  `props.input.phase` into a non-`'plain'` value, the surviving phase guard covers the intent with zero new code.
- **Or a plugin-level store/context:** move the flag out of `AttachButton`'s `useState` into a small module-scope
  observable (or context) that `AttachmentChips` subscribes to (`const busy = useAttachBusy()` at the top of the
  component). Note the flag must be read **at component top level, not inside the `.map()` callback** — calling a
  hook inside a callback violates the rules of hooks (and would read a per-item snapshot of nothing).
- **Or prop-drill** it from whatever composes the two components, if the slot props allow.

Whatever the route: the fix is *delete the unbound name*, and only then, if the behavior is genuinely wanted,
reintroduce the signal through an in-scope channel — with the §4 smoke covering the disabled state both ways.

### 3.3 The two hardening patterns — and why they are cheap insurance *specifically in slot components*

**① `record?.items ?? []`-style defensive reads.** `record?.items.find(...)` guards only the link it is written
on: if `record` is nullish the whole chain short-circuits safely, but if `record` **exists and `items` is
undefined/null** (partial record, older record shape, a non-file attachment), it evaluates `undefined.find` →
**TypeError — in the render path — which is exactly a slot-entry-unmounting throw** (§1.4). `(record?.items ?? []).find(...)`
(or `record?.items?.find(...)` plus an undefined-safe consumer) degrades to "no hover preview for this chip"
instead of "the whole dock disappears". Records come from a `Map` fed by async service code and persisted state —
heterogeneous shapes are the norm, not the exception.

**② Optional-chained `event.target?.closest?.('.remove')`.** `event.target` is an `EventTarget`, not
guaranteed to be an `Element`: retargeted/shadow-DOM events, synthetic events from test harnesses, or exotic hosts
can hand you a target without `closest`, turning the guard itself into a TypeError inside the click handler.
Handler throws are *not* caught by error boundaries (boundaries cover render/lifecycle, not event handlers), so this
one does not unmount the dock — but it produces uncaught console errors and kills the interaction mid-flight in
someone else's application. `?.()` plus `?? null` keeps the "click landed on the remove button?" test total.

**Why cheap insurance here specifically:** the failure economics of a slot component are brutally asymmetric. The
cost side is a couple of characters (`?.`, `?? []`) at each read of data the plugin does not own. The failure side
is: **any** unguarded expression that throws during render removes the **entire slot entry**, silently (console-only),
for every user whose data hits the path — and because empty-state renders hide most code (§1.2), such a throw can
ship latent for releases. In a component whose output the user cannot distinguish from "plugin not installed",
total-reads discipline is not paranoia; it is the only error surface you control. (Related hygiene while in the
file: `objectUrlOf(...)` is called during render — memoize per item and revoke on cleanup so re-renders don't leak
blob URLs.)

---

## 4. The regression that would have caught this before release

**A data-present render smoke for every slot component.** The decisive detail: mount the dock **WITH an occurrence
present and `phase: 'plain'`** — not the empty state. The empty dock returns `null` at line 23 *before reaching
the throwing line*, so an empty-state-only smoke passes forever while the bug lives: the test must defeat **both**
gates of §1.2 (data present) and §1.3 (falsy left operand ⇒ idle phase).

```js
// render-smoke.test.jsx (sketch — jest/vitest + @testing-library/react, or the framework's slot test harness)
describe('AttachmentDock render smoke', () => {
  it('renders the chip without an error-boundary capture when an occurrence is present', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});   // boundary/report channel
    records.set('ref-1', { status: 'ready', label: 'shot.png',
                           items: [{ path: 'shot.png', file: new Blob([]) }] });
    const input = { phase: 'plain', occurrences: [          // <-- 'plain': defeats the || short-circuit
      { source: SOURCE,     ref: 'ref-1', label: 'shot.png', occurrenceId: 'o1' },
      { source: 'other-plugin', ref: 'x', label: 'decoy',    occurrenceId: 'o2' }, // filtered out
    ]};
    const remove = vi.fn();
    const { container } = render(h(AttachmentDock, { input, remove }));  // ideally mount through the real
                                                                        // InputZone registration so the
                                                                        // framework boundary is in the tree
    expect(errSpy).not.toHaveBeenCalled();                  // NO error-boundary capture / console error
    const chips = container.querySelectorAll('.chip');
    expect(chips).toHaveLength(1);                          // the chip element actually rendered
    expect(chips[0].querySelector('.name').textContent).toBe('shot.png');
    const x = chips[0].querySelector('button.remove');
    expect(x).not.toBeDisabled();                           // proves the disabled expression EVALUATED fully
    fireEvent.click(x);
    expect(remove).toHaveBeenCalledWith(expect.objectContaining({ occurrenceId: 'o1' }));
  });

  it.each(['plain', 'sending'])('renders with phase=%s (covers both sides of the short-circuit)', phase => { ... });

  it('renders the missing-record path', () => { /* occurrence whose ref is not in records → chip with
     data-status="missing", name falls back to occurrence.label, no throw */ });

  it('returns null for the empty dock (documents the early-return gate)', () => { /* occurrences: [] →
     container empty, no throw — kept explicitly to show why this case alone is false comfort */ });

  // v0.2.11 additions:
  it('image occurrence → hover-card + data-image; non-image → neither; click on x does not open viewer', ...);
  it('record without .items still renders (hardening ①)', ...);
  it('handler tolerates a target without closest (hardening ②)', ...);
});
```

Key properties of the regression, tied to the bug's anatomy:

- **Assertion target = "no error-boundary capture",** not just "component didn't throw": spy on the boundary's
  report channel (`console.error` / the framework's capture hook), or mount through the real slot registration and
  assert the entry is still mounted. That is the exact thing that regressed in the field.
- **`expect(x).not.toBeDisabled()` in the plain-phase case is the pin:** it can only pass if the *entire*
  `disabled` expression — including the right operand of `||` — was evaluated without throwing. The bug cannot
  hide behind the short-circuit.
- **Parameterize `phase`** across `'plain'` and one non-plain value so both sides of the short-circuit are
  exercised every run (the non-plain side is precisely where a future dangler could go latent again).
- **Shape-coverage:** record present / record missing from the Map / record without `items`; image / non-image
  occurrence — cheap matrix, covers the `?.`/`??` boundaries of §3.3.
- **Run it in CI on every PR touching `lib/` and as a pre-publish gate** (§5). The whole suite is milliseconds of
  render time; it would have caught the dangling `busy` at the v0.2.10 hardening pass — one release before any
  user met it — and the misplaced `imageItem` at v0.2.11 review time.

---

## 5. Release-process lesson: why `node --check` shipped this, and the minimum viable pre-ship check

### 5.1 What "syntax check only" actually guarantees

`node --check` runs the **parser** and nothing else. Its guarantee is: "this text is a syntactically valid
program." An entire class of defects is definitionally invisible to it, including every one that mattered here:

- **Free identifiers** (`busy`, and the diff's `record`/`status`): identifier *binding* is resolved at
  evaluation time; `busy is not defined` is a perfectly parseable program.
- **Scope transplants** (code copied between components whose bindings didn't come along) — the exact provenance
  of this bug.
- **Short-circuit latency**: even a *runtime* check that executes the module top-level (import, slot registration)
  passes — the bad expression only evaluates when a specific data × state combination reaches it.
- **Data-dependent TypeErrors** (`record.items.find` on a partial record): the data does not exist until a user
  creates it.

For a **lib-only** plugin the gap is total: there is no server surface, no CLI, no independent app to boot. The
library's *only* execution surface is slot-component renders **inside the host GUI**, and — as this component shows —
most of that code sits behind data gates (empty dock ⇒ `return null` before line 34). "It parsed, it bundled, it
published" therefore says approximately nothing about "it renders". The v0.2.11 pre-ship check was a syntax check on
a diff whose riskiest lines are only reachable with a pending attachment and an idle composer — the one path nobody
executed.

### 5.2 Minimum viable pre-ship check for slot-rendering lib-only plugins

Three layers, in ascending cost — layer 1 alone would have prevented this incident twice over (at v0.2.10 and at
v0.2.11):

1. **Headless data-present render smoke (mandatory, CI + pre-publish).** For *every registered slot component*:
   mount it **empty AND with representative data present** (occurrences seeded; phase `'plain'` and non-plain;
   partial/missing record shapes), asserting **no error-boundary capture / no `console.error`** and that the
   expected elements exist and are interactive (§4). Minutes to write with jest/vitest + a DOM renderer; runs in
   milliseconds; catches free identifiers, scope transplants, data-dependent TypeErrors, and hook misuse — the whole
   invisible-to-parser class — *in the only environment where the lib ever runs*.
2. **Scope-aware static analysis in CI (free).** ESLint with **`no-undef`** (and ideally `tsc --checkJs`) flags
   `busy` and `record` at PR time without executing anything. Note the fixture's own blind spot: with
   `env: browser`, `no-undef` knows the legacy `window.status` global and would *not* flag the misplaced
   `status` — one more reason layer 1 is the floor, not the linter. (TypeScript with `noImplicitAny`/`strict`
   would flag all three.)
3. **Artifact canary before publish (cheap, catches build-introduced breakage).** `npm pack` the built lib →
   install into a scratch harness → mount each slot with fixture data (or a 30-second manual dogfood in the real
   host: paste a screenshot → chip appears → hover shows preview → x removes → non-image attach still renders).
   Publish only on green. Bundling/minification can rename or reorder identifiers; verifying the *shipped artifact*,
   not the source tree, is what "shipped" means.

Process corollaries:

- **Hold "hardening"/small diffs to the same bar as features.** This dangler arrived in a low-attention
  `disabled`-logic tweak, not in the headline feature; risk tracks *reachability of changed expressions*, not diff
  size or label. A useful PR question: "does this change an expression that only evaluates when data is present?
  Then the smoke must mount with data."
- **Dogfood the release path once, with devtools open.** The error boundary is console-only by design; a single
  manual paste-before-publish surfaces the ReferenceError instantly. "Users never open the console" must be true
  for users — never for the maintainer shipping a render-path change.
- **Treat latency mechanisms as ticking clocks.** A short-circuited (or data-gated) crash is not a non-bug; it is a
  bug whose trigger is a *future usage pattern*. Any feature that changes how long chips sit in the dock (like
  hover-preview) re-rolls the dice on every dormant expression in that render path — which is why the bisect of §2,
  not the changelog, is the correct first move when "the new release broke the old feature".

---

## 6. Evidence map (claim → fixture source)

| # | Claim | Source |
|---|---|---|
| 1 | `busy` is declared only in `AttachButton` (line 7), referenced freely in `AttachmentChips` (line 34) | `plugin-dock-chips.js:7,17,33–34` |
| 2 | Empty dock returns `null` before the map/throwing line | `plugin-dock-chips.js:22–23` |
| 3 | Phase guard = left operand of `||`; `?? 'plain'` normalization | `plugin-dock-chips.js:9,34` |
| 4 | Dock registered via InputZone slot; throwing entry caught by error boundary and unmounted; console-only visibility; no data-present render smoke shipped | `user-thread.md` (maintainer note) |
| 5 | Symptom set: chip gone, paste works, attach button fine, no UI error | `user-thread.md` (user report) |
| 6 | v0.2.10 line already contained `|| busy` (hardening pass) per shipped excerpt & maintainer — vs diff showing it as a v0.2.11 `+` line (discrepancy flagged in §1.3) | `plugin-dock-chips.js:33–34`; `user-thread.md`; `feature.diff:32–33` |
| 7 | v0.2.11 additions: misplaced `imageItem` initializer (free `status`/`record`), `data-image`, `onClick` with unguarded `closest`, hover-card, `record?.items.find` | `feature.diff:8–11,16–25,27–28` |
| 8 | Dock re-renders on revisions (re-throw keeps entry unmounted) | `plugin-dock-chips.js:41` |

*Report generated from the read-only evidence pack; `fixture/` was not modified. All line numbers refer to the
fixture files as provided.*
