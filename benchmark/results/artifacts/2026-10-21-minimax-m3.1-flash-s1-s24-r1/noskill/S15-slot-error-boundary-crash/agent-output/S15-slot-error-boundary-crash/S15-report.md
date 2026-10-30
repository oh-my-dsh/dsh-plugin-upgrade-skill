# S15 — Vanishing Dock Chips: the Silent Slot Crash

**Plugin:** `@org/dsh-attach-input` (community Web plugin)
**Symptom:** after v0.2.11, pasting a screenshot produces **no pending-attachment chip** above the input
box. The paste itself still works (message sends with the image). The attach button (`input.left`
slot) is unaffected. No error banner in the UI; the error is only in the browser console.
**Verdict:** a **render-time `ReferenceError` on a free identifier** inside the dock-chip component,
swallowed by a slot-level error boundary that unmounts the whole slot entry.

Evidence read (read-only, unmodified): `fixture/plugin-dock-chips.js` (v0.2.10 excerpt),
`fixture/feature.diff` (v0.2.11 hover-preview diff), `fixture/user-thread.md`, `fixture/README.md`.

---

## 1. Exact root cause

### 1.1 The expression that throws

In `AttachmentChips()` the remove button's props are built like this (fixture,
`plugin-dock-chips.js`, the v0.2.10 excerpt):

```js
function AttachmentChips(props, className) {
  const occurrences = (props.input?.occurrences ?? []).filter(item => item.source === SOURCE);
  if (occurrences.length === 0) return null;
  return h('div', { className }, ...occurrences.map(occurrence => {
    const record = records.get(occurrence.ref);
    const status = record?.status ?? 'missing';
    return h('div', { className: 'chip', 'data-status': status, key: occurrence.occurrenceId },
      h('span', { className: 'name' }, record?.label ?? occurrence.label),
      h('button', {
        type: 'button',
        className: 'remove',
        'aria-label': 'Remove ' + (record?.label ?? occurrence.label),
        disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,   // <-- ???  (fixture annotation)
        onClick: () => props.remove(occurrence),
      }, 'x'));
  }));
}
```

**`busy` is a free (unbound) identifier in `AttachmentChips`.** The only `busy` in the file is a
`useState` local of a *different function*:

```js
function AttachButton(props) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);          // <-- busy lives HERE
```

`AttachButton` and `AttachmentChips` are sibling functions, not nested. A `const` inside
`AttachButton` is invisible to `AttachmentChips`, so inside the chip renderer `busy` resolves as a
global lookup, finds nothing, and throws:

> `ReferenceError: busy is not defined`

This is a **scope-resolution** failure, not a syntax error and not a `TypeError` — nothing about the
line is malformed. (The fixture excerpt does not show a module-level `busy`; see §6 "Unconfirmed".)

### 1.2 Why it throws only when a chip renders

Two independent gates must both open before the expression is even evaluated:

1. **Data gate.** `if (occurrences.length === 0) return null;` sits *above* the throw. With no pending
   attachment of this source, the component returns `null` before the button props are built — the
   dangling reference is never executed. The crash therefore needs **at least one occurrence** of
   `SOURCE` in `props.input.occurrences`.
2. **Evaluation gate (the `||` short-circuit).** `||` is short-circuiting: the right operand is
   evaluated **only if the left operand is falsy**.
   - Left operand `(props.input?.phase ?? 'plain') !== 'plain'` is `true` whenever the composer is in
     any non-plain phase (locked / streaming / not editable). → **`busy` is never evaluated → no
     crash.** The dock renders fine.
   - Left operand is `false` exactly when `props.input.phase === 'plain'` (the idle, editable state —
     and the default `'plain'` via `?? 'plain'` when the phase is absent). → **`busy` IS evaluated →
     `ReferenceError`.**

So the crash requires **chip present AND the composer idle ('plain')**. The user's paste lands exactly
in that state: an occurrence exists (chip must render) and the composer is idle waiting for them to hit
send (phase 'plain' → the guard is `false` → `busy` is evaluated → boom).

### 1.3 Why the `||` short-circuit kept it latent

The short-circuit is why the bug could sit in the tree without a visible incident: as long as the
phase guard was truthy, the dangling operand was **never executed**, so the defect was a
*conditional* landmine, not an always-on crash. The code "worked" in every state where the composer
was locked/busy, and failed in exactly one state — the ordinary idle state, which is the state the
pending-attachment chip exists for.

This is the classic shape of a latent render bug:

* the defect is *data-dependent* (needs an occurrence),
* it is *state-dependent* (needs phase === 'plain'),
* and it is *reached only on the happy path* the feature was built for.

A defect that only fires on the intended, most-used path is invisible to every test that exercises the
edge cases first and to every static check that does not resolve identifiers.

### 1.4 Why the symptom is "the whole dock vanished", not "the remove button is broken"

This is a **slot-entry-level** failure, and the granularity of the recovery unit is what the user sees:

* The plugin registers **two separate slot entries**: the attach button (`input.left`) and the
  pending-attachment dock (InputZone slot). The host renders each slot entry inside its own
  **error boundary** (per the maintainer note: *"a slot entry that throws during render is caught by
  the framework's error boundary and unmounted"*).
* The exception is thrown **during React's render phase** of that entry. The boundary catches it and
  **unmounts the failed entry's whole subtree**, then renders its fallback (nothing visible in this
  host). The boundary's blast radius is the *entry*, not the failing DOM node — so **the entire dock
  (`div.dock` and every chip inside it) disappears**, not just the `x` button.
* The attach button is a **different slot entry** with its own boundary → it keeps working. ✓ matches
  the report ("the attach button is unaffected").
* The paste path is **data-plane, not render-plane**: the paste handler → `props.add(...)` → the plugin
  records the occurrence and updates `props.input.occurrences` → the *message still sends with the
  image attached*. ✓ matches "the paste itself worked".
* The error is **console-only**: React logs the caught error to `console.error`; the host's boundary
  renders no user-visible error banner. Users never open devtools → the UI looks like a styling
  regression, not a crash. ✓ matches "I don't see any error banner in the UI".

Net effect: the attachment pipeline works, the *preview* of it dies, and the failure mode is
"the whole row silently disappeared" — the classic silent slot crash.

---

## 2. Why blaming the v0.2.11 diff is the wrong first conclusion

### 2.1 The tempting (and wrong) first story

The symptom appeared immediately after v0.2.11, v0.2.11 = "the hover-preview release", and the diff
touches **the very same component** (`AttachmentChips`). The user even says *"I pasted a screenshot
to try the new preview"* — the workflow, the release and the failing component are all correlated.
Blaming the new hover-preview code is therefore the highest-prior hypothesis, and it is **not
automatically the right one**.

Two further traps in the diff make it look even more guilty — while neither of them is the root cause
the brief is asking for:

* The diff adds a **new render-time code path** that *looks* like it could throw (a `.find()` on a
  possibly-missing record).
* The diff's `-/+` pair renders as if `|| busy` were *added* in v0.2.11.

But note the fixture's own annotations contradict that second reading: the v0.2.10 excerpt already
contains `disabled: … || busy` (annotated by the fixture author with `// <-- ???`), and the
maintainer note says *"In v0.2.10 the same component already had the line `disabled: … || busy` (added
in a hardening pass)"*. **The excerpt + maintainer note say pre-existing; the diff's `-` side says
new in v0.2.11.** That conflict is the *reason* a bisection is required instead of a conclusion.
(Resolved in §6 as an explicit unconfirmed item — but note it does **not** change the fix.)

### 2.2 The correct bisection

The right move is not "revert and hope" but a **bisect whose test is the actual symptom**, plus a
**minimal render mount** of the pre-diff code:

```
git log --oneline v0.2.10..v0.2.11 -- lib/client.js     # what actually changed
git log -S '|| busy' --oneline -- lib/client.js          # when the dangling operand appeared
git blame -L <line-of-disabled>,<line> lib/client.js     # attribution of the offending line
git show v0.2.10:lib/client.js | grep -n 'busy'         # did the line pre-exist the release?
```

The decisive experiment is a **minimal render mount** (see §4) that mounts the *pre-diff* component
with one occurrence present and phase `'plain'`:

* **If the pre-diff (v0.2.10) component throws** → the defect **pre-exists** the release; the
  hover-preview work merely *re-exposed* it (or was the first release whose new/changed code path
  finally rendered a chip in the 'plain' phase). Blame the hardening-pass line, not the feature.
* **If the pre-diff component renders** → the trigger is inside v0.2.11; `git blame` inside that
  commit then points at the `+ disabled: … || busy` line the diff shows, and the "pre-existing"
  reading of the excerpt is falsified.
* **Revert only the hover-preview hunk** (keep `|| busy`): if the dock *still* vanishes → the hover
  preview is not the trigger; the dangling reference is.

Decision table (each row = a distinguishable outcome, not a guess):

| Bisect result | Conclusion | Fix scope |
|---|---|---|
| v0.2.10 code + occurrence present + phase 'plain' → throws | old latent bug, first exercised now | fix the `busy` line; blame the hardening pass; add the render smoke |
| v0.2.10 code renders; v0.2.11 throws | new feature introduced it | same fix, but the release gate was the missed smoke; add the smoke + `no-undef` |
| Reverting only the hover hunk still crashes | hover preview exonerated | fix the pre-existing line |
| Console error says `busy is not defined` | confirms the dangling identifier | fix as above |
| Console error says `status is not defined` / `record is not defined` | the diff's hoisted `imageItem` block is the trigger (see §3.3) | fix both; still needs the smoke |

### 2.3 Evidence that distinguishes "new feature crashed the slot" from "old latent bug first exercised now"

1. **The console message itself.** Both hypotheses are `ReferenceError`, but the *name* differs
   (`busy` vs `status`/`record`). The single most valuable artifact is the browser console error
   message + stack frame — it points at a **line**, not at a feature.
2. **The stack frame's line/column** — a frame inside the hover-preview block vs. inside the
   `disabled:` expression.
3. **Minimal mount of the tagged pre-diff code** with the same fixture data (§4) — the strongest
   single piece of evidence, because it is a controlled reproduction of the *symptom*, not of the
   *release*.
4. **Revert-only-the-hover-hunk test** (§2.2).
5. **`git log -S` / `git blame` provenance** of the offending line.
6. **Phase sweep**: the crash occurs only at phase `'plain'`. Reproducing it *only* in the idle phase
   (and not while the composer is locked/streaming) is a fingerprint of the short-circuit latency —
   a brand-new feature bug would more likely fail in every state.

---

## 3. The fix

### 3.1 Primary fix — remove the dangling reference (or scope it properly)

The offending expression:

```js
disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,   // busy is unbound here
```

Options, in order of preference:

* **(a) Delete the operand (recommended).** The `busy` that exists in the file is
  `AttachButton`'s **per-button** state: it marks "the file-picker open/submit flow is in flight" for
  *that button*. It is semantically unrelated to "a pending attachment is uploading", and a button-local
  flag must never gate a *different* slot entry. So the intent of the hardening pass ("don't let the user
  remove a chip while the upload is in flight") is not served by this variable at all — the reference was
  a copy-paste from the wrong function. Deleting it restores the v0.2.10 behaviour with zero risk.
* **(b) Source the flag from something actually in scope.** If a real "upload in flight" gate is wanted,
  it must come from data the component can see: a plugin-level state exposed through the slot props
  (`props.input.busy` / `props.busy`), the record's own status
  (`record?.status === 'uploading'`), or a React context published by the plugin. E.g.

  ```js
  const isUploading = record?.status === 'uploading';
  disabled: (props.input?.phase ?? 'plain') !== 'plain' || isUploading,
  ```

  (Deriving it from `record.status` is the smallest change that preserves the original intent, and it
  also removes the need for any cross-component flag.)
* **(c) Module-scope flag** (`let uploadBusy = false`) exported from a shared module — works, but
  mutable module state shared across slot entries is a smell; prefer (a)/(b).

What must **not** be done: silencing it with `typeof busy !== 'undefined' && busy` or
`Boolean(globalThis.busy)` — that converts a loud crash into a silent no-op and leaves the intent
unimplemented.

### 3.2 The two hardening patterns the diff should also get

**(i) Defensive reads of optional data — `record?.items ?? []`.**

The diff computes the hover-preview source as:

```js
const imageItem = status !== 'missing'
  ? record?.items.find(item => isImagePath(item.path))
  : undefined;
```

Two distinct defects here:

* **Optional chaining stops too early.** `record?.items.find(...)` only guards `record`. If the
  record exists but has no `items` array, `record?.items` is `undefined` and `.find` on it throws
  `TypeError: Cannot read properties of undefined (reading 'find')`. Optional chaining must cover the
  whole dereference chain — `record?.items?.find(...)` — or, better, **normalise once at the read
  site**: `const items = record?.items ?? [];` then `items.find(...)`. The `?? []` form also gives
  you one place to change if the shape ever moves.
* **The expression is hoisted out of the scope where its operands live.** `status` and `record` are
  declared **inside** the `.map(occurrence => { … })` callback; the new block sits **above** the
  `return`, in the function body. As written, `status`/`record` are unbound at that point → another
  render-time `ReferenceError` on *every* render with ≥1 occurrence (and it would fire even in a
  non-plain phase, unlike the `busy` one). Unless the untruncated module declares module-level
  bindings with those names (unlikely; see §6), the new block must be **moved into the `.map`
  callback**, or turned into a helper that takes the record:
  `const imageItem = findPreviewItem(record);`.

**(ii) Optional-chained event-target lookups — `event.target.closest?.()`.**

The diff's chip click handler:

```js
onClick: event => {
  if (event.target.closest('.remove') !== null) return;
  openImageViewer({ src: objectUrlOf(imageItem.file), name: imageItem.path });
}
```

* `event.target` is not guaranteed to be an `Element`: it can be a **Text node** (clicking the text
  inside the chip's label span targets the text node, which has no `closest`) → `TypeError:
  event.target.closest is not a function` → **the same class of slot-killing render/handler crash**.
  Use `event.target?.closest?.('.remove')`.
* **Comparison trap:** `closest()` returns `null` when there is no match, but with optional chaining
  the expression can also be `undefined`. `undefined !== null` is **true** → the handler would
  early-return and the viewer would *never* open. Therefore compare by truthiness
  (`if (event.target?.closest?.('.remove')) return;`) or use `!= null` (loose) — never `!== null`
  on a chain that can yield `undefined`.
* Same class of hardening for the payload: `objectUrlOf(imageItem.file)` — `imageItem.file` should be
  read defensively (`imageItem?.file`) and `objectUrlOf` should tolerate a missing file rather than
  throwing inside an event handler.

Why these are *cheap insurance* in slot components specifically:

* A slot component is a **third-party extension point**: it renders inside someone else's layout, and a
  throw does not "just fail" — it is caught by an **error boundary that unmounts the entire entry**, so
  a single unguarded optional read can delete a whole UI region that the host author did not even know
  was plugin-provided.
* Slot components receive **externally-shaped data** (`props.input.occurrences`, `records` entries)
  whose shape is owned by another module/version — precisely where optional chaining belongs.
* The failure is **silent by design** (console only), so the blast radius of a missing `??`
  is a whole feature vanishing, not a stack trace the user can report.
* The cost is ~zero (`??`, `?.`) versus the cost of a slot-level unmount.

### 3.3 Bonus fix for the silent failure mode

Whatever the code fix, consider making the boundary's failure *visible*: have the slot entry render a
minimal fallback (`"attachments unavailable"`) instead of nothing, so the next occurrence of this bug
class is reported by users instead of being filed as "the feature is broken". Silence is what turned a
one-line `ReferenceError` into a misattributed release rollback.

---

## 4. The regression that would have caught this before release

**A render smoke that mounts the dock/chip component WITH an occurrence present.**

The decisive detail: the **empty** state is useless as a regression, because

```js
if (occurrences.length === 0) return null;   // returns BEFORE the throwing expression
```

An empty-occurrence mount returns `null` and never evaluates `busy` → it passes on broken code →
the suite stays green while the feature is 100% broken in its only real use case.

The regression must mount **through the same slot path the host uses** (so the slot error boundary is in
play), with:

* `props.input.occurrences` = **one occurrence** of `SOURCE` (`{ ref, occurrenceId, label }`), and
  `records` seeded with a matching entry (`{ status: 'pending', label: 'shot.png', items: [...] }`);
* `props.input.phase = 'plain'` — **mandatory**, because a non-plain phase short-circuits the
  `|| busy` operand away and the test would pass even with the bug present;
* a boundary that **captures** render errors (a test-local error boundary / a `console.error` spy that
  fails the test / an explicit "no error captured" assertion), so an error-boundary fallback is a
  **failure**, not a silent pass.

Assertions:

1. **no error-boundary capture** for the mount (the primary assertion);
2. the chip DOM is present: `.chip` / `[data-status]` exists, the `.name` span shows the label, the
   `.remove` button exists and is **enabled** in the 'plain' phase;
3. clicking `.remove` calls `props.remove(occurrence)` with the right occurrence;
4. (if the hover-preview diff lands) a `.hover-card`/`img` is rendered for an image item, and clicking
   the chip **outside** the remove button opens the viewer while clicking **on** the remove button does
   **not** (this is the case that the `event.target.closest?.()` hardening protects);
5. a companion case with **two** occurrences (one record missing from `records`) → still renders both
   chips, the missing one as `data-status="missing"` (no throw).

Test matrix (all of them mount with data unless stated):

| # | occurrences | phase | expected |
|---|---|---|---|
| 1 | 0 | plain | renders `null` (must still be covered — but it is *not* sufficient on its own) |
| 2 | 1 | **plain** | chip renders, remove enabled, **no boundary capture** ← the regression that catches this bug |
| 3 | 1 | non-plain ('streaming') | chip renders, remove disabled, no boundary capture |
| 4 | 2 (one record missing) | plain | both chips render, no boundary capture |
| 5 | 1 image item | plain | hover preview renders; viewer opens on chip click, not on remove click |

Case 2 is the one that fails on the shipped code (with `busy` unbound) and passes after the fix.

The same "mount with representative data" smoke should exist for **every** slot entry of the plugin
(the attach button in `input.left` is a separate component and deserves its own case — e.g. open the
menu, choose a file, assert `props.add` was called).

---

## 5. Release-process lesson: why `node --check` was not enough

**What `node --check` (or any parse-only check) can tell you:** that the file is *syntactically* valid
JavaScript — balanced braces, valid tokens, valid expression grammar.

**What this bug needed:** the identifier `busy` to be **resolvable at runtime, in that function's scope,
on the code path that renders a chip**. That is a *semantic* property, and it is invisible to a parser:

* `busy` is a perfectly well-formed `IdentifierReference`. The parser is happy; the file parses.
* Resolution is dynamic — it depends on the **scope chain** of the enclosing function at call time and on
  **which branch executes**. A parser never evaluates `(a) || busy`, so it never learns that the right
  operand is reachable and unbound.
* The failure is **data- and state-dependent**: it needs an occurrence in `props.input.occurrences` *and*
  `phase === 'plain'`. Every check that does not mount the component with a realistic fixture passes.
* For a **lib-only plugin** (no server, no CLI, no host app to click through), the shipped artifact is a
  *bundle of render functions*. The only thing that can execute them is a render — so "does it render?"
  is the only test that means anything, and "does it parse?" is nearly unrelated.

**Minimum viable pre-ship check for a slot-rendering, lib-only plugin** (cheapest first):

1. **Static identifier resolution — `no-undef`.**
   `eslint --no-eslintrc --parser-options=ecmaVersion:latest,sourceType:module --env browser,es2021
   --rule '{"no-undef":"error"}' lib/client.js`
   (`busy` is not a standard global → this **would have failed the build** and named the exact line.)
   Equally: `tsc --noEmit` with `checkJs` + `strict` over `lib/`, which surfaces both unbound
   identifiers and wrong optional-chain shapes (`record?.items.find` → *"possibly undefined"*).
   *This alone converts a silent runtime crash into a red CI job.*
2. **One render smoke with realistic data per slot entry** (§4): mount the component with a **non-empty
   fixture** and assert the expected DOM **and** that no error boundary captured anything. Run it against
   the **built/published bundle**, not only the source — the artifact users load is the bundle.
3. **Keep the empty-state case only as an extra**, never as the only case (§4).
4. **A "slot components" lint checklist**: no free identifiers (use `no-undef` + `no-implicit-globals`),
   no unguarded optional reads (`?? []`), no unguarded DOM lookups on event targets (`?.`),
   no state derived outside the scope where it is defined.
5. **Boundary awareness in review**: any throw inside a slot component is *contained* by the host's
   boundary and therefore **invisible to the user** — so a reviewer's instinct "this would obviously have
   crashed in testing" is false for slots. Slot components need *more* defensive care than ordinary app
   components, not less, because the failure mode is a silent unmount.

**The generalisable lesson:** for a plugin that ships render functions and nothing else, *parse checks are
not a substitute for one render with data*. The cheapest possible pre-ship gate is a static
identifier/optional-chain check plus a single data-present render smoke per slot entry — both runnable
in CI with no host app.

---

## 6. Provenance, conflicts and unconfirmed items

* **Conflict in the fixture (flagged, not silently resolved).** The v0.2.10 excerpt
  (`plugin-dock-chips.js`) *already contains* `disabled: … || busy`, and the maintainer note states the
  same ("In v0.2.10 the same component already had the line …"). The v0.2.11 diff's `-`/`+` pair
  renders as if `|| busy` were **added** in v0.2.11 (`- disabled: … !== 'plain'` /
  `+ disabled: … !== 'plain' || busy`). The two readings cannot both be true of the same line. The
  report's primary conclusion follows the excerpt + maintainer note (the defect pre-dates the
  hover-preview release) **and** the bisection in §2.2 is written so that its outcome decides between the
  two readings. **The fix is identical under either reading**, which is why the conflict does not block
  the remediation.
* **Unconfirmed:** whether a module-level `busy` existed in the *full* v0.2.10 `lib/client.js` (the
  fixture is an excerpt; the shown `busy` is a `useState` local of `AttachButton`, and the fixture
  author annotates it as "the place `busy` lives"). If such a module-level binding existed in v0.2.10
  and was removed/moved by the hover-preview refactor, that would also explain "v0.2.10 users used the x
  button fine" while the chip line looked identical — a variant of the bisect in §2.2.
* **Unconfirmed:** the exact host-side error-boundary implementation (entry-granularity vs. slot-granularity,
  and what the fallback renders). The report relies on the maintainer note's description ("a slot entry
  that throws during render is caught by the framework's error boundary and unmounted"). Per the task
  constraints, the live host was **not** probed (it runs a different version, so any fact learned from it
  would be out of scope).
* **Unconfirmed:** the definitions of `records`, `SOURCE`, `useRevision`, `objectUrlOf`,
  `isImagePath`, `openImageViewer` — not present in the excerpt. Consequently, whether the diff's
  hoisted `imageItem` block would throw `ReferenceError: status is not defined` depends on there being
  no module-level `status`/`record` bindings in the untruncated file; the excerpt shows their only
  declarations inside the `.map` callback. Either way the block must move into scope and the
  `record?.items` read must be normalised.
* **Not verified at runtime:** no host, no browser, no plugin execution was performed (read-only,
  offline scope). All behavioural statements above are derived from the fixture code, the diff and the
  maintainer note, plus standard JS/React semantics (`||` short-circuiting, optional chaining,
  scope resolution, error-boundary behaviour).

---

## 7. One-paragraph summary

`AttachmentChips` references `busy`, a `useState` local of the *sibling* function `AttachButton`;
inside the chip renderer `busy` is an unbound identifier, so evaluating
`disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy` throws `ReferenceError: busy is not
defined` — but only when a chip actually renders (the empty dock returns `null` first) and only when
the composer is idle (the `||` short-circuit skips the dangling operand while the phase guard is
`true`), which is exactly the state a paste produces. Because the plugin's dock is one slot entry
surrounded by the host's error boundary, the throw unmounts the **whole dock**, is reported only in the
browser console, and leaves the attach button (a different entry) and the paste pipeline working — the
"everything just silently disappeared" symptom. Blaming the v0.2.11 hover-preview diff is the
recency-bias default; the correct move is a bisection whose test is the symptom (roll back only the
hover hunk; mount the pre-diff component with an occurrence present at phase 'plain') plus
`git log -S`/`git blame` provenance — which points at the pre-existing line, not at the new feature.
The fix is to delete the dangling operand (or source the intended "upload in flight" flag from something
in scope, e.g. `record?.status === 'uploading'`), and the diff should additionally get
`record?.items ?? []`-style defensive reads, optional-chained `event.target?.closest?.('.remove')`
(with a truthiness, not `!== null`, comparison), and its hoisted `imageItem` block moved back into the
scope where `record`/`status` live. The regression that would have caught this is a render smoke that
mounts the dock **with an occurrence present and phase 'plain'** and asserts the chip renders with **no
error-boundary capture** (the empty-state smoke returns `null` before the throwing line and passes on
broken code). And `node --check` could never have caught it: it parses but does not resolve identifiers
or evaluate the short-circuited branch; the minimum viable pre-ship gate for a lib-only slot plugin is a
static `no-undef`/`tsc --noEmit` pass plus one data-present render smoke per slot entry, run against
the shipped bundle.
