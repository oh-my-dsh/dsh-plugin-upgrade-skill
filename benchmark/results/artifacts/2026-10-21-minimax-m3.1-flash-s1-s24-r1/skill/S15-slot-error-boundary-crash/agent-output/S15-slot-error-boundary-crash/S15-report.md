# S15 · Vanishing Dock Chips: the Silent Slot Crash — Root-Cause Report

**Plugin:** `@org/dsh-attach-input` · **Symptom:** pending-attachment chips disappeared from the
input dock after shipping v0.2.11 (hover-preview release); paste still works; attach button unaffected;
no in-UI error banner.
**Mode:** read-only diagnosis (skill `plugin-upgrade`, Mode A · inspect). No migration, no install, no writes
outside the report directory. `/app/fixture/` was left byte-identical (SHA-256 re-verified against
`fixture-seal.pre.json` → all four files UNCHANGED).

---

## 0. Verdict (one paragraph)

The dock did not "lose" its chips — the chip component **threw while rendering** and the host's
**slot-level error boundary unmounted the whole slot entry**, so the entire dock disappeared and the only
trace was a single console record the user never opened. The throwing expression is the **dangling free
identifier `busy`** in `AttachmentChips`'s remove-button props:
`disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy`
(`fixture/plugin-dock-chips.js`:34). `busy` is a `useState` binding that lives in a *different* component
(`AttachButton`, line 7) and is therefore **not in scope** inside `AttachmentChips` → `ReferenceError: busy is not defined`.
Two guards kept it dormant: the **empty-dock early return** at line 23 (`if (occurrences.length === 0) return null;`)
means the expression is only reached when a chip actually renders, and the **`||` short-circuit** means `busy`
is only *evaluated* when the left operand is falsy — i.e. when the composer phase is exactly `'plain'` (or absent).
This is a **pre-existing latent bug that v0.2.11 first exercised**, not a bug the hover-preview diff created:
the diff merely touched the same function, so "revert the release and it goes away" is a correlation, not a proof.
The fix is to delete the dangling term (or route the busy flag through props/shared state) **and** to harden
the diff's own new landmines. The missing gate was a **data-present render smoke**: an empty-state render
returns `null` *before* the throwing line, so every "it renders fine" check that shipped v0.2.10 was a false negative.

---

## 1. Root cause, precisely

### 1.1 The exact throwing expression

`fixture/plugin-dock-chips.js`:

```js
 7:   const [busy, setBusy] = React.useState(false);          // <-- busy lives HERE (inside AttachButton)
...
17:   h('button', { type: 'button', disabled: locked || busy, ... }, '+'),   // OK here: same scope
...
22: function AttachmentChips(props, className) {
23:   const occurrences = (props.input?.occurrences ?? []).filter(item => item.source === SOURCE);
24:   if (occurrences.length === 0) return null;
25:   return h('div', { className }, ...occurrences.map(occurrence => {
26:     const record = records.get(occurrence.ref);
27:     const status = record?.status ?? 'missing';
28:     return h('div', { className: 'chip', ... },
29:       h('span', { className: 'name' }, record?.label ?? occurrence.label),
30:       h('button', {
31:         type: 'button',
32:         className: 'remove',
33:         'aria-label': 'Remove ' + (record?.label ?? occurrence.label),
34:         disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,   // <-- THROWS
35:         onClick: () => props.remove(occurrence),
36:       }, 'x'));
37:   }));
38: }
```

Line 34 reads an identifier that **does not exist in `AttachmentChips`'s scope chain** (module → function →
callback). `busy` is declared at line 7 *inside `AttachButton`* — a different function, and (per the fixture
header and the user thread) a **different slot entry**: the attach button is the `input.left` seat, the dock is
the `InputZone` seat. Two different slot entries are two different component instances; nothing about one is
lexically visible to the other, and the two cannot share a `useState` cell without explicit prop plumbing or a
shared store. Evaluating line 34 therefore raises:

> `ReferenceError: busy is not defined`

This is a **scope-resolution error, not a type error**. It is a *free identifier* — the classic
"the refactor moved the state and the read site stayed behind" defect.

### 1.2 Why it throws **only when a chip renders**

Two independent gates, both required:

1. **The empty-dock early return (line 24).** With no occurrence of `SOURCE`, the component returns `null`
   *before* the `.map()` callback is ever created, so line 34 is never evaluated. The component is "healthy"
   in its empty state. (This is the exact reason the empty-state smoke is a false negative — see §4.)
2. **The map callback is the evaluation site.** `disabled:` is a *property value* of the element
   `h('button', {...})`, computed **synchronously while `AttachmentChips` is rendering**, inside the
   `occurrences.map(occurrence => {...})` callback. The throw propagates out of the map, out of
   `AttachmentChips`, out of `AttachmentDock` (lines 41-44) and out of the slot entry's render — i.e. it
   happens in the **parent's** render, before the remove button element even exists. That is why the failure
   mode is "nothing rendered", not "a button rendered wrong".

### 1.3 Why the `||` short-circuit kept it latent through v0.2.10

`disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy`

JavaScript's `||` **short-circuits**: the right operand is evaluated **only if the left operand is falsy**.
Left-operand truthiness is a function of the composer phase:

| `props.input.phase` | `(phase ?? 'plain') !== 'plain'` | is `busy` evaluated? | result |
|---|---|---|---|
| `'attaching'` / any non-`'plain'` phase | `true` | **no** (short-circuit) | `disabled: true` — no throw |
| `undefined` / absent | `false` (`?? 'plain'` → `'plain'`) | **yes** | `ReferenceError` |
| `'plain'` (idle composer) | `false` | **yes** | `ReferenceError` |

So the defect is **phase-conditional**: it is invisible in every busy/locked phase and fires the moment a chip
renders in the **idle** phase. `busy` is never *declared* wrong — it is never *read* until the short-circuit
lets it through. That is the whole latency mechanism, and it is why the bug could sit in a shipped release.

> **First-hand confirmation** (read-only harness over a *copy* of the shipped file, in the report directory's
> `scratch/`): the phase sweep on the **v0.2.10 code with no v0.2.11 hunk applied** gives
> `phase='plain' → ReferenceError: busy is not defined`,
> `phase=undefined → ReferenceError`,
> `phase='attaching'/'streaming' → OK (chips=1)`,
> `occurrences=[] → OK (returns null)`.
> Removing only the `|| busy` term makes every one of those four cases render cleanly.
> Full transcript: §A.1 of the appendix.

### 1.4 Why the symptom is "the whole dock vanished", not "the remove button is broken"

The dock is a **host slot entry** (the plugin "registers the dock through the InputZone slot" —
`fixture/user-thread.md`; the host slot is `conversation.input.dock`, `kind: 'list'`, `scope: 'session'`,
owner `InputZone`). The host wraps each slot entry in its own **slot-level error boundary**:

* A throw during a slot entry's render is caught by that boundary;
* the boundary **unmounts the entire slot entry** (not the offending child) — the whole dock subtree disappears;
* the error is reported **only in the browser console** (one minified record); there is no in-UI error banner,
  no failed request, no toast.

This is the documented host behaviour in the reference pack, and it is a well-known failure shape for
community plugins:

* **DSH-0.1.7-A1-01** (`references/v0.1.7-alpha.1.md`) — key points: a slot contribution that renders an
  invalid element type crashes with React error #130; *the framework's slot-level error boundary unmounts the
  WHOLE slot entry*, so the user-visible symptom is **an entire surface (dock, header widget) silently
  vanishing with one minified console error and no request failures**; first-hand fleet evidence was a
  resident input-dock strip in `conversation.input.dock` disappearing; its verification demands **DOM marker
  present + zero "slot entry crashed" console records + expected network requests**, because *"a single
  'CSS loaded, no errors' check has false negatives"*.
* **DSH-0.1.6-A2-02** (`references/v0.1.6-alpha.2.md`) — key points: a component in `conversation.input.dock`
  that calls a missing prop **throws at render and takes the whole dock subtree down**; first-hand evidence:
  a progress strip vanished entirely and **a co-tenant dock entry's chips stopped rendering with it**;
  the dock slot contract (`{ kind: 'list'; scope: 'session'; owner: InputZone }`) is unchanged across tags.
* **DSH-0.2.0-RC2-A1-01** (`references/v0.2.0-rc.2.md`) — the useful *contrast* case for a paste/attachment
  plugin: there, chips **render but resolve "unavailable"**. Here the chips do not render at all. A support
  triage that assumes "chips missing = attachment pipeline broken" will look in the wrong place.

Why each part of the user's report lines up:

| User observation | Explanation |
|---|---|
| "the paste itself worked (message sent with the image)" | The paste/attach pipeline (write file → register occurrence) is a *different* code path from the dock's *view* render. The occurrence was created successfully; only its renderer died. |
| "the attach button (the +) is still there" | `AttachButton` is a **separate slot entry** (`input.left`) with its own instance. Its `busy` (line 7) **is** in scope there (line 17 uses it legally), so it renders normally. The bug is scoped to the dock component only. |
| "nothing else looks broken" | The error boundary is designed to degrade silently: one surface disappears, everything else keeps working, no banner. |
| "no error in the UI" | Slot error boundaries log to the console only. Users do not open devtools. |

---

## 2. Why blaming the v0.2.11 diff is the wrong first conclusion

### 2.1 The correlation trap

The v0.2.11 diff **touched the same function** (`AttachmentChips`) as the defect. That makes the obvious
experiment — "revert v0.2.11, the chips came back" — a **correlation test that cannot discriminate** between:

* **(A) new feature crashed the slot**: the hover-preview code introduced a *new* fault; and
* **(B) old latent bug first exercised now**: the hover-preview code merely changed *when / under which props*
  the pre-existing faulty line is reached.

Both hypotheses predict "v0.2.11 broken, v0.2.10 fine". A rollback test therefore has **no discriminating power**
on its own; only a *hunk-level* or *code-version-level* bisection does.

### 2.2 The correct bisection

**Bisect 1 — hunk-level rollback / re-add (not release-level).** Apply the v0.2.11 hunks to the v0.2.10 tree
**one at a time** and render-mount each combination:

* v0.2.10 + hover-preview hunks only (without the `disabled:` hunk);
* v0.2.10 + `disabled:` hunk only;
* v0.2.10 unmodified.

The defect follows the **`disabled:` hunk**, not the hover-preview hunks — and the `disabled:` hunk is the
one that carries the dangling `busy` (see §2.3: the diff's own `-/` sides are *not* trustworthy here).

**Bisect 2 — minimal render mount at the OLD version (the decisive one).** Skip the diff entirely: mount the
**shipped v0.2.10** `AttachmentDock`/`AttachmentChips` in isolation with a synthetic occurrence and
`phase: 'plain'`. **This reproduces the `ReferenceError` with zero v0.2.11 code in the process.** A crash
that reproduces without the new feature is, by construction, not caused by the new feature.

**Bisect 3 — phase sweep, not release sweep.** Render the same component across the phase matrix
(§1.3). The crash keys on `phase === 'plain'`, not on "is there an image record", not on "is the hover
feature present". A feature regression keys on the *feature's* inputs; this one keys on the *phase*.

### 2.3 The evidence that distinguishes (A) from (B)

1. **Error class — the strongest single discriminator.**
   *A broken new feature* typically produces a **contract/type-class** error: `undefined` element type
   (React #130, the DSH-0.1.7-A1-01 shape), a wrong prop shape, a missing export, a bad API call.
   *A dangling identifier* produces a **scope-resolution** error at evaluation time:
   `ReferenceError: busy is not defined`. A `ReferenceError` naming a bare identifier points at the
   **binding site**, not at the feature. (Caveat: the v0.2.11 diff *also* introduces its own `ReferenceError`
   — see §3.3 — so the class alone is not enough; combine with items 2-4.)
2. **Provenance of the offending line.** The shipped source annotates it itself:
   *"v0.2.10 hardening pass added the phase guard — and this busy reference"* (`plugin-dock-chips.js`:33-34),
   and the maintainer note in `fixture/user-thread.md` states the same: *"In v0.2.10 the same component
   already had the line `disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy` (added in a hardening
   pass)"*. The line is **pre-existing**, and it came from a *hardening* change — which is exactly the class
   of change that is under-tested (it only adds a guard, so reviewers assume it can only make things safer).
   `git blame` / `git log -S'|| busy'` on that line is the one-command confirmation in the real repo.
3. **The diff artifact is not machine-generated and disagrees with the shipped tree.** `feature.diff`'s hunk
   header is `@@ function AttachmentChips(props, className) {` — **a real `git diff` hunk header always
   carries line ranges** (`@@ -a,b +c,d @@`). Its `-/` sides are therefore hand-written and can be stale.
   Concretely, the diff's `-` side shows the v0.2.10 line as
   `disabled: (props.input?.phase ?? 'plain') !== 'plain',` (no `|| busy`) — but the **shipped v0.2.10 file
   in the same evidence pack already contains `|| busy`** (line 34). The diff's `-` side cannot be used as
   evidence about what v0.2.10 shipped; the shipped tree and the maintainer note are authoritative.
   *Practical rule: when a hand-written/illustrative diff and the shipped source disagree, trust the source
   and blame the source.*
4. **The crash's inputs.** It requires **an occurrence** and **the idle phase**; it does **not** require an
   image record, a hover card, a click handler, or the viewer. Reproduce it with the hover-preview code
   entirely absent.
5. **Blast radius.** The diff's hover-preview code sits *after* the chip's identity and the remove button; a
   crash there would still be a per-chip render failure. The observed failure is the **whole entry** vanishing
   with a `ReferenceError` on a **free identifier** — the classic "identifier left behind by a refactor"
   signature, which correlates with the *hardening pass* (the change that moved the `busy` state) rather than
   with the *feature*.

### 2.4 What v0.2.11 actually did (and an honest gap)

The evidence pack does **not** contain a v0.2.10→v0.2.11 change that would newly *reach* the
`phase === 'plain'` path. Two readings are consistent with the pack, and **the actionable conclusion is
identical under both**:

* **(i)** The chip previously only ever rendered while the composer was in a non-plain phase (the attach was
  in flight); the occurrence was consumed and removed before the phase returned to idle, so the
  `|| busy` term was never evaluated. The v0.2.11 hover-preview work reworked the chip's render
  (extra props, an `onClick`, a hover card) and thereby re-rendered the chip in the idle phase — **"old
  latent bug first exercised now"**, exactly the shape the brief describes.
* **(ii)** The pack's diff is stale/hand-written (§2.3 item 3) and under-documents the real v0.2.11 change.

**Unconfirmed (deliberately not guessed):** the exact v0.2.10 hardening-pass commit and the exact v0.2.11
behavioural change are **not** in the fixture (no git history is shipped), and the non-`'plain'` **phase
enum values** are not enumerable from the pack (only `'plain'` and the notion of "not plain" appear).
The diagnosis does not depend on either: the throwing line is pre-existing and the fix is in that line.

---

## 3. The fix

### 3.1 Primary fix — remove the dangling reference (or scope it properly)

The minimal, behaviour-preserving correction is to **delete the dangling term** and restore the line to the
phase guard alone:

```js
// lib/client.js — AttachmentChips
disabled: (props.input?.phase ?? 'plain') !== 'plain',
```

Why deletion is the right fix rather than "wire `busy` through":

* The **intent** of the term was "disable the remove button while an attach is in flight". The phase guard
  **already encodes that intent** — the composer is non-plain exactly while an attachment is pending
  (the sibling `AttachButton` derives its own `locked` from the same expression, line 9). The `busy` term
  is redundant, and redundancy is what allowed it to rot.
* `busy` in `AttachButton` is `setBusy(true)` only for the duration of `await props.add(...)` **inside
  the attach button's own handler**. The dock chips and the attach button are **two different slot entries**
  (`input.left` vs the `InputZone` dock) and therefore **two different component instances**. They cannot
  share a `useState` cell; "scoping it properly" would require a real channel — e.g. a shared store/service
  or a host-provided `input.phase`/busy flag on the standard slot props. If the plugin genuinely needs a
  per-attachment "this record is still uploading" state, the correct home is **the record**
  (`record.status === 'uploading'`), which the component already has at line 27.

If a busy flag *is* wanted, scope it to data the component owns:

```js
const record = records.get(occurrence.ref);
const status = record?.status ?? 'missing';
const pending = status === 'uploading';        // data-owned, not a cross-component ref
...
disabled: (props.input?.phase ?? 'plain') !== 'plain' || pending,
```

If it is wanted across entries, it must be an explicit prop or store read — **never a bare identifier from
another component's scope**.

### 3.2 Two cheap hardening patterns the diff should also get

**(a) Defensive reads of optional collections — `record?.items ?? []`.**
The diff's new code is `record?.items.find(item => isImagePath(item.path))`. The `?.` guards the
**record**, but not the **`.items` array**: when the record exists but carries no `items` array, the
expression raises `TypeError: Cannot read properties of undefined (reading 'find')`. The record map is
populated from the host's attachment pipeline, so `items` is *shape-variable* by nature (a still-uploading
or already-consumed record may legitimately have no `items` yet). Fix:

```js
const imageItem = status !== 'missing'
  ? (record?.items ?? []).find(item => isImagePath(item.path))
  : undefined;
```

**(b) Optional-chained DOM lookups — `event.target?.closest?.()`.**
The diff's click guard is `if (event.target.closest('.remove') !== null) return;`. `event.target` is
`EventTarget`, not `Element`: a text node, a comment node, an SVG element in some engines, or a
synthesised test event all lack `closest`, and the handler then throws `TypeError: t.closest is not a function`
— **inside an event handler**, which is a second, independent way for the slot to die (and one that fires
*after* a successful paint, which is harder to attribute). Fix:

```js
onClick: imageItem === undefined ? undefined : event => {
  if (event.target?.closest?.('.remove') != null) return;   // null AND undefined both mean "not the remove button"
  openImageViewer({ src: objectUrlOf(imageItem.file), name: imageItem.path });
},
```

(`!= null` rather than `!== null` also covers `undefined`, which is what an optional-chained `closest`
returns when the method is absent.)

**Why both are cheap insurance in slot components specifically:**

* A slot component is **isolated by an error boundary that unmounts the whole entry** — a single bad read
  costs the *entire surface*, not one widget. The blast radius of a local mistake is maximal.
* Slot components read **host-supplied, shape-variable data** (`records`, `occurrences`, `props.input.*`).
  The host is a different version from the plugin; defensive reads (`?? []`, `?.`) are the cheapest way to
  stay compatible with a host that adds, removes, or re-shapes a field — exactly the DSH-0.1.7-A1-01 /
  DSH-0.1.6-A2-02 "the contract moved under a shipped plugin" family.
* The cost is one token of source; the benefit is converting a *whole-surface silent disappearance* into a
  *degraded-but-visible* render.
* The same "read it defensively" habit applies to the diff's other new reads: `imageItem.file` and
  `imageItem.path` are used unguarded inside the handler and the `<img src>`.

### 3.3 Two more defects the v0.2.11 diff introduces, found while reading it

These are separate from the `busy` defect and would be caught by the same smoke (§4). Both were reproduced
first-hand against the diff text:

1. **Hoisted out-of-scope identifiers.** The diff inserts, at *component* scope and **after** the empty-dock
   guard but **before** the `.map()`:
   ```js
   const imageItem = status !== 'missing'
     ? record?.items.find(item => isImagePath(item.path))
     : undefined;
   ```
   but `status` and `record` are declared **inside** the map callback (diff context lines 13-14), i.e. in a
   *different* scope. This throws `ReferenceError: status is not defined` for **every** occurrence — including
   non-image ones — and it fires **before** the `busy` line, so it would *mask* the `busy` defect.
   **Fix: move the `imageItem` computation inside the `occurrences.map()` callback**, after `record` and
   `status` are bound.
2. **Wrong-chip preview (correctness, not crash).** Because `imageItem` is computed once outside the map, it
   describes the *first* occurrence only; `data-image`, the `onClick` handler and the hover card would be
   attached to **every** chip with the first image's payload. Scoping it into the callback fixes this too.

**Consequence for triage:** with the diff applied verbatim, the *first* error a user would see in the console
is `status is not defined`, not `busy is not defined`. Anyone bisecting from the console message alone would
land on the diff and conclude "the hover preview is broken" — which is exactly the wrong first conclusion the
brief warns about. Fix **all** of them, then re-derive the story from a clean console.

---

## 4. The regression that would have caught this before release

### 4.1 The regression: a **data-present** render smoke with an error-boundary capture

Mount the dock component (or the whole `AttachmentDock`) in a test harness that installs a **React error
boundary that captures and reports**, and assert **both**:

* **(P) no boundary capture / no thrown error** during the render, and
* **(D) the expected DOM is actually present** — a `.chip` element with the occurrence's label and a
  `.remove` button — i.e. the render *produced* something, not merely "did not crash".

Minimal shape (framework-agnostic; the harness may be jsdom + `react-dom/client`, `@testing-library/react`,
or `react-test-renderer`):

```js
it('renders a pending-attachment chip without crashing the slot', () => {
  const captured = [];
  // class Boundary with componentDidCatch -> captured.push(error); render null
  const props = {
    input: {
      phase: 'plain',                                  // <-- the state that reaches || busy
      occurrences: [{ source: SOURCE, ref: 'r1', occurrenceId: 'o1', label: 'shot.png' }],
    },
    remove: () => {},
  };
  render(<Boundary><AttachmentDock {...props} /></Boundary>);
  expect(captured).toEqual([]);                       // (P) no error-boundary capture
  expect(container.querySelector('.chip')).toBeTruthy();          // (D) the chip rendered
  expect(container.querySelector('.remove')).toBeTruthy();        // (D) the remove affordance rendered
});
```

### 4.2 The parameterisation that matters (and the trap to avoid)

> **The empty-state render returns `null` at line 24 *before* the throwing line is reached.** A smoke that
> mounts the dock with **no occurrences** passes with the bug present, every single time. The
> "the dock renders fine" evidence that let v0.2.10 ship is exactly this false negative.

The smoke must therefore be a **matrix**, and it must include the idle phase:

| # | occurrences | `input.phase` | record shape | expected |
|---|---|---|---|---|
| 1 | `[]` | any | — | renders `null`; **must not** be used as the only case |
| 2 | 1 | **`'plain'`** | present, with `items` | chip + remove button render; no capture |
| 3 | 1 | **`undefined`** | present, with `items` | chip renders; no capture (the `?? 'plain'` default path) |
| 4 | 1 | `'attaching'` | present | chip renders, remove disabled; no capture |
| 5 | 1 | `'plain'` | **record missing** (`records.get` → `undefined`) | chip renders with the fallback label; no capture |
| 6 | 1 | `'plain'` | record present **without `items`** | chip renders; **no `TypeError`** (defensive-read case) |
| 7 | 1 | `'plain'` | record with a non-image item | no hover preview; no capture |
| 8 | 1 | `'plain'` | image record | hover card + click-to-view present; no capture |
| 9 | 1 | `'plain'` | image record | dispatch a **click whose `target` is not an Element** (text node) → handler must not throw |

Row 2 and row 3 are the ones that would have caught the shipped defect. Row 6 and row 9 are the ones that
would have caught the diff's two new landmines. Rows 5/7/8 guard the *display* half of the feature.

### 4.3 The "silently vanished" assertion — do not assert only "no error"

Asserting "no error occurred" is **not sufficient**, because the boundary converts a render throw into a
*silent empty surface* — the surface simply does not exist, so a naive smoke that only counts "did the page
error?" sees nothing. The reference pack makes the same point three times:

* **DSH-0.1.7-A1-01** — verification must assert **the surface's DOM marker is present** *and* **zero
  "slot entry crashed" console records** *and* the expected requests fire; *"a single 'CSS loaded, no errors'
  check has false negatives"*.
* **R-13** (`references/rollup-0.1.2.md`) — *"explicitly assert the injected item actually renders (present,
  non-empty, same row), turning 'lookup returns null → element silently missing' into an observable failure"*;
  and the layered-validation checklist adds *"an empty UI counts as a failure in validation"*.
* **DSH-0.2.0-RC2-A1-01** — the contrast case that makes a "no error" smoke misleading: there, chips
  *rendered* but resolved *"unavailable"*, and a no-crash smoke stayed green.

So the regression must be a **paired** assertion — *the chip is in the DOM* **and** *no boundary capture /
no "slot entry crashed" record*. Both halves are needed; each alone has a known false-negative mode.

### 4.4 Where the smoke belongs

* **Unit layer (cheap, runs on every PR):** the matrix of §4.2 with a boundary-capturing harness. This alone
  catches the shipped defect before release.
* **Driven-browser / real-host layer (release gate):** per the skill's layered checklist, the mount-smoke form
  (`pnpm build && pnpm pack` → install the tarball into a scratch profile → headless browser scan) asserting
  **the dock's DOM marker present, zero page/console errors, and the expected requests fired**. This catches
  defects that only appear with real host data shapes (the records map, the phase values, the slot props).
* **Per the skill's discipline**, a smoke must run with an explicit timeout, and the diagnosis must be written
  **before** the final verification pass (`references/precision-checklist.md`: *"Write the report and
  diagnosis before the final verification pass"*).

---

## 5. The release-process lesson

### 5.1 Why `node --check` was structurally insufficient here

`node --check` validates **syntax only** (that the file parses). The shipped defect is **not** a syntax
error — `busy` is a perfectly well-formed identifier expression. Confirmed first-hand: `node --check` on the
shipped v0.2.10 file exits **0** (§A.1 of the appendix). So the pre-ship gate that was run could not, even in
principle, observe this defect.

The defect belongs to a different class of errors entirely:

| Error class | Detected by | This defect |
|---|---|---|
| syntax / parse | `node --check`, parser | no |
| **scope resolution (free identifier)** | **static scope analysis** (ESLint `no-undef`) or a typechecker | **yes — this one** |
| runtime contract (missing export, wrong prop shape, undefined element type) | render/mount smoke with data | no (this defect) |
| data-shape (missing `.items`) | render/mount smoke with the shape | no (this defect) |
| DOM API misuse (`closest` on a non-Element) | render/mount smoke + event dispatch | no (this defect) |

For a **lib-only** plugin the gap is structural. A lib-only plugin has no host half, no CLI entry, no service
activation, no background task — **nothing in the release pipeline ever calls the component with props**.
The only moment at which this defect can exist is a render with real data. A pipeline that ends at
`node --check` therefore has **no observable point at which this class of bug can appear**, which is precisely
why it shipped.

### 5.2 The minimum viable pre-ship check for a slot-rendering lib-only plugin

Ordered by cost, cheapest first — **do 1 and 2 unconditionally**:

1. **Parse check** — `node --check` (or the bundler's parse step). *Necessary, nowhere near sufficient.*
2. **Static scope check — the gate that would have caught this bug.** ESLint with `no-undef` (and
   `no-unused-vars`, and for a TS plugin `tsc --noEmit` — an unresolved identifier is a hard TS error,
   *"Cannot find name 'busy'"*). Cost: seconds. Effect: converts a **render-time `ReferenceError` in one
   phase** into a **build-time error on every build**. This is the single highest-leverage change to the
   release pipeline for this class of bug, and it is exactly the gate the plain-JS `lib/client.js` layout
   was missing. *(If the plugin is TypeScript, the "syntax check only" story is doubly wrong: a plain
   `tsc --noEmit` would have failed on `busy`.)*
3. **Data-present render smoke** (§4) — a unit-level mount with an error-boundary capture, over the
   phase/data matrix, asserting **the DOM marker is present** and **no boundary capture**. This is the
   minimum *runtime* gate, and it is the one the plugin never had.
4. **Driven-browser mount smoke on a real host** (release gate) — asserts the dock's DOM marker, **zero
   "slot entry crashed" console records**, and the expected network requests. Required before tagging, per the
   skill's layered validation checklist (layer 3: card-level unit tests; layer 4: real mount / cold boot) and
   DSH-0.1.7-A1-01's verification triple.

**The transferable rule, in one line:** *for a component that only ever runs inside someone else's render tree,
the "it works" test must be a render **with the data that makes it do work** — an empty state that returns
`null` is not a smoke test, it is a proof that the function was never executed.*

### 5.3 The two habit-level lessons

* **A hardening change is a change.** The defect entered through a *hardening* pass (adding a guard), the
  class of change reviewers trust most and test least. "This only adds a condition" is precisely how a
  dangling identifier survives review — and a guard that reads a variable from another scope is not a guard,
  it is a latent throw.
* **A slot component's failure is a surface failure.** The cost of one bad read is the disappearance of a
  whole surface with a console-only trace. That asymmetry is the argument for defensive reads (§3.2) and for
  asserting the *presence* of the rendered thing (§4.3), not just its absence of errors.

---

## Appendix A · First-hand evidence (read-only; fixture untouched)

All commands ran against **copies** inside the report directory's `scratch/`; `/app/fixture/` was re-hashed
against `fixture-seal.pre.json` afterwards and all four files are **UNCHANGED**.

### A.1 Static check + phase sweep on the shipped v0.2.10 code (no v0.2.11 code involved)

```
node --check plugin-dock-chips.copy.js  =>  PASS (exit 0)

=== PHASE SWEEP on the shipped v0.2.10 file (no v0.2.11 code involved) ===
0 occurrences  (empty dock -> return null)                      => OK (chips=0)
1 occurrence  phase="plain"     (LHS false -> busy read)        => THROWS ReferenceError: busy is not defined
1 occurrence  phase=undefined   (?? plain -> busy read)         => THROWS ReferenceError: busy is not defined
1 occurrence  phase="attaching" (LHS true  -> short-circuit)    => OK (chips=1)
1 occurrence  phase="streaming" (LHS true  -> short-circuit)    => OK (chips=1)

=== Same sweep, v0.2.10 code with the dangling reference removed ===
1 occurrence  phase="plain"      => OK (chips=1)
1 occurrence  phase=undefined    => OK (chips=1)
1 occurrence  phase="attaching"  => OK (chips=1)
```

### A.2 The v0.2.11 diff applied literally, and with its own defects fixed

```
=== v0.2.11 diff applied literally (imageItem hoisted, per feature.diff) ===
1 occurrence  phase="plain"      => THROWS ReferenceError: status is not defined
1 occurrence  phase="attaching"  => THROWS ReferenceError: status is not defined
0 occurrences  (empty dock)      => OK (chips=0)          <-- empty state still "passes"

=== v0.2.11 diff with imageItem scoped into the callback + hardening ===
occurrence -> record WITH items      => OK (chips=1)
occurrence -> record WITHOUT .items  => OK (chips=1)
occurrence -> record MISSING         => OK (chips=1)

=== isolated expression behaviour ===
record?.items.find  (record without .items) => THROWS TypeError: Cannot read properties of undefined (reading 'find')
event.target.closest (non-Element target)  => THROWS TypeError: t.closest is not a function
event.target.closest?.()  (same target)    => OK (undefined)
typeof busy (undeclared)                    => 'undefined'   (typeof does not throw; the *read* does)
```

### A.3 Fixture integrity

```
UNCHANGED README.md / feature.diff / plugin-dock-chips.js / user-thread.md
fixture seal intact: true
```

---

## Appendix B · Proposed patch (sketch — not applied; the fixture is read-only)

```diff
 function AttachmentChips(props, className) {
   const occurrences = (props.input?.occurrences ?? []).filter(item => item.source === SOURCE);
   if (occurrences.length === 0) return null;
   return h('div', { className }, ...occurrences.map(occurrence => {
     const record = records.get(occurrence.ref);
     const status = record?.status ?? 'missing';
+    // v0.2.11 hover preview — scoped INTO the callback (status/record are not
+    // in scope at component level) and read defensively.
+    const imageItem = status !== 'missing'
+      ? (record?.items ?? []).find(item => isImagePath(item.path))
+      : undefined;
     return h('div', { className: 'chip', 'data-status': status,
+      'data-image': imageItem === undefined ? undefined : '1',
       key: occurrence.occurrenceId,
+      onClick: imageItem === undefined ? undefined : event => {
+        if (event.target?.closest?.('.remove') != null) return;
+        openImageViewer({ src: objectUrlOf(imageItem.file), name: imageItem.path });
+      },
     },
       h('span', { className: 'name' }, record?.label ?? occurrence.label),
+      imageItem !== undefined && h('div', { className: 'hover-card' },
+        h('img', { src: objectUrlOf(imageItem.file), alt: imageItem.path })),
       h('button', {
         type: 'button',
         className: 'remove',
-        // v0.2.10 hardening pass added the phase guard — and this busy reference:
-        disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,
+        // 'busy' was never in scope here (it lives in AttachButton, a different
+        // slot entry) -> ReferenceError whenever this line was evaluated.
+        disabled: (props.input?.phase ?? 'plain') !== 'plain',
         onClick: () => props.remove(occurrence),
       }, 'x'));
   }));
 }
```

Plus (pipeline, not source): ESLint `no-undef`; the §4.2 render-smoke matrix; the §5.2 layer-4 browser gate.

---

## Appendix C · Unconfirmed / out-of-scope items (explicitly not guessed)

1. **The exact v0.2.10 hardening-pass commit** and **the exact v0.2.11 behavioural change** are not in the
   fixture (no git history is shipped). The diagnosis does not depend on them (§2.4).
2. **The non-`'plain'` phase enum values** are not enumerable from the pack — only `'plain'` and "not plain"
   appear. The phase sweep used representative non-plain values.
3. **The host's exact slot names and the error-boundary's console text** are taken from the reference pack
   (DSH-0.1.7-A1-01: the "slot entry crashed" console-record class; `conversation.input.dock` =
   `{ kind: 'list'; scope: 'session'; owner: InputZone }` from DSH-0.1.6-A2-02), not from the live host —
   per the task boundary, no host introspection was performed and the installed host is a different version.
4. **Whether the browser console message for this specific crash is the same "slot entry crashed" string** is
   therefore unconfirmed; the *mechanism* (whole-entry unmount, console-only visibility) is confirmed by the
   fixture's user thread and maintainer note and by the reference cards.
5. **The v0.2.11 release's other changes** are not in the pack; the analysis covers the one diff supplied.

---

### Reference index (key points + IDs only)

* **DSH-0.1.7-A1-01** (`references/v0.1.7-alpha.1.md`) — slot-level error boundary unmounts the WHOLE slot
  entry → an entire surface silently vanishes with one minified console error and no request failures;
  new-feature breakage class = invalid element type / React #130; verification = DOM marker present + zero
  "slot entry crashed" console records + expected requests (a "no errors" check alone has false negatives).
* **DSH-0.1.6-A2-02** (`references/v0.1.6-alpha.2.md`) — a dock component that calls a missing prop throws at
  render and takes the whole dock subtree down; a co-tenant dock entry's chips stopped rendering with it;
  `conversation.input.dock` = `{ kind: 'list'; scope: 'session'; owner: InputZone }`.
* **DSH-0.2.0-RC2-A1-01** (`references/v0.2.0-rc.2.md`) — contrast case for a paste/attachment plugin:
  chips *render but resolve "unavailable"*; helps triage "chips missing" toward a render crash rather than a
  broken attachment pipeline.
* **R-13** (`references/rollup-0.1.2.md`) — assert the injected item actually renders, turning "silently
  missing" into an observable failure; layered validation: layer 2 static (all-green static checks cannot prove
  the contract), layer 3 card-level unit tests (an empty UI counts as a failure), layer 4 real mount / cold boot.
* **pre-flight.md** — a heuristic scan is not proof: zero hits still requires a build plus a real mount.
* **precision-checklist.md** — timeouts on every command; write the diagnosis before the final verification pass.
