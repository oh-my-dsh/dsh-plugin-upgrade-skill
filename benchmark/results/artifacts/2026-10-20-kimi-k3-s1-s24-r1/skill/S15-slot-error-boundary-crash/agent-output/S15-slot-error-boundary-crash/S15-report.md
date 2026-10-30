# S15 · Vanishing Dock Chips — Diagnosis Report (read-only)

Plugin: `@org/dsh-attach-input` · regression window v0.2.10 → v0.2.11
Mode: skill `plugin-upgrade` Mode A (read-only inspection); no files changed, nothing installed or executed.
Fixture: shipped v0.2.10 component (`fixture/plugin-dock-chips.js`), v0.2.11 hover-preview diff (`fixture/feature.diff`), user thread (`fixture/user-thread.md`).

---

## 1. Exact root cause

**The throwing expression** — in `AttachmentChips`, the remove-button props (v0.2.10 shipped file, line 34):

```js
disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,
```

`busy` is a **free (dangling) identifier** in this scope. The only `busy` in the file is
`const [busy, setBusy] = React.useState(false)` declared inside the **sibling** component
`AttachButton` (line 7, marked "busy lives HERE"). The v0.2.10 hardening pass copied the
`AttachButton` idiom (`disabled: locked || busy`) into `AttachmentChips` without copying the
state declaration. Since no `busy` exists anywhere in `AttachmentChips`'s scope chain,
evaluating it throws **`ReferenceError: busy is not defined`** at render time. A free
identifier is *syntactically* valid JavaScript, so parse-level checks never see it; it only
detonates when the expression is actually evaluated.

**Why it throws only when a chip renders.** The expression lives inside the
`occurrences.map(occurrence => …)` callback, and the component bails out one line earlier:

```js
const occurrences = (props.input?.occurrences ?? []).filter(item => item.source === SOURCE);
if (occurrences.length === 0) return null;   // empty dock never reaches the throwing line
```

The everyday state of the composer is "no pending attachments" → `return null` → the
`disabled` expression is never evaluated. The ReferenceError requires the data-present state:
at least one occurrence with `item.source === SOURCE` — exactly what a successful paste creates.

**Why the `||` short-circuit kept it latent through v0.2.10.** `busy` is the *right* operand of
`||`. JavaScript evaluates it only when the left operand is falsy:

- Composer locked (`input.phase !== 'plain'`): left side is `true` → `true || busy`
  short-circuits → `busy` is **never evaluated** → no throw, button correctly disabled. This is
  the case the hardening pass was written for and the case its testing exercised — the mask was
  self-applied by the very guard being tested.
- Composer in its normal state (`phase === 'plain'`): left side is `false` → evaluation
  proceeds to `busy` → **ReferenceError**.

So the crash needs the conjunction **[chip present] AND [phase 'plain']**. The hardening pass
shipped with no render test that mounts the dock with an occurrence present, so that conjunction
was never executed in CI, and field renders in v0.2.10 apparently stayed on the masked side of
the guard. v0.2.11's hover-preview feature is precisely about chips that sit in the dock while
the composer is idle (you hover/click a pending image before sending — an unlocked, 'plain'-phase
composer with a rendered chip). The feature didn't create the bug; it created the render state
that first evaluates the right operand in the wild.

**Why the symptom is "the whole dock vanished", not "the remove button is broken".** The throw
happens *during render* of the slot entry — `AttachmentDock` is registered through the
`InputZone` slot, and the framework wraps each slot entry in a **slot-level error boundary**. A
render-time throw is caught by that boundary and the **entire entry is unmounted**: the dock,
all its chips, names and remove buttons disappear at once. There is no partial failure mode
("chip renders but x is dead") because the crash occurs before any chip DOM is committed. The
sibling entry `AttachButton` lives in a *different* slot (`input.left`) with its own boundary,
so it is unaffected — matching the report exactly. The boundary swallows the error to the
console only: no UI banner, and users never open the browser console — hence "silent". Paste
itself still works because attachment ingestion runs in plugin/host logic outside the dock's
render path (the message sends with the image attached; only the *visualization* of the pending
attachment is gone).

## 2. Why "the v0.2.11 diff did it" is the wrong first conclusion — and the correct bisection

The suspicion is structurally understandable and factually wrong:

- The diff **touched the same component** and the crash appeared **immediately after** the
  v0.2.11 release — classic recency bias.
- Worse, the diff hunk literally displays
  `- disabled: (props.input?.phase ?? 'plain') !== 'plain',` /
  `+ disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,`
  so a diff-first review "sees" `|| busy` being added by v0.2.11. Diffs are computed against
  the feature branch's base, not against the shipped artifact; read against the **shipped
  v0.2.10 file** (line 34, with the hardening-pass comment) and the maintainer note, the
  identical expression predates v0.2.11.

**Correct bisection** (two equivalent forms):

1. **Rollback / re-add bisect:** from v0.2.11, revert *only* the hover-preview hunks
   (`imageItem`, `data-image`, `onClick`/viewer, hover-card) while keeping the `disabled`
   line, then mount with a chip present → the crash persists. Conversely, re-apply the preview
   hunks onto pre-hardening code → crash absent. The crashing line is invariant under the
   feature's presence.
2. **Minimal render mount:** mount v0.2.10's `AttachmentChips` standalone (no v0.2.11 code at
   all) with one `{ source: SOURCE }` occurrence and `input.phase: 'plain'` → the same
   `ReferenceError: busy is not defined` reproduces. Nothing from the feature
   (`imageItem`, `objectUrlOf`, `openImageViewer`, `isImagePath`) is needed to trigger it.

**Evidence that distinguishes "new feature crashed the slot" from "old latent bug first
exercised now":**

- The console error names the identifier **`busy`**, which appears in none of the added hunks;
  none of the new symbols (`imageItem`, `isImagePath`, `objectUrlOf`, `openImageViewer`)
  are implicated by the stack.
- The byte-identical expression exists in the **v0.2.10 shipped artifact** (with its own
  hardening-pass comment) — the bug's birthday is the hardening pass, not the feature release.
- Reproduction succeeds on v0.2.10 code with the right *data* (chip + 'plain' phase) and fails
  on v0.2.11 code without chips or with a locked composer → the discriminating variable is the
  render state, not the release.
- `busy` has **no declaration anywhere** in `AttachmentChips`'s scope chain — a pre-existing
  scope defect; the feature code's references are all locally declared.

(Review footnote: the diff hunk shows `const imageItem = status !== 'missing' ? …` positioned
before the `return`, i.e., outside the `.map()` callback where `status`/`record` are
declared. Read literally that would be a second scope bug throwing unconditionally — which is
why hunks must be read against shipped source, not as literal placement; v0.2.11 did render the
feature in its own demos, so in the shipped file this computation must live inside the map
callback. Worth verifying when applying the fix.)

## 3. Fix

**Remove the dangling reference (or scope it properly).** `props.remove(occurrence)` is a
synchronous store update — no async busy state is needed in the dock at all, so the minimal,
correct fix is:

```js
disabled: (props.input?.phase ?? 'plain') !== 'plain',
```

If a future async remove genuinely needs a busy flag, the state must live in the component that
reads it: extract a per-chip `Chip` component (hooks cannot be called inside `.map()`) and
declare `const [busy, setBusy] = React.useState(false)` there — copying `AttachButton`'s
*pattern* correctly instead of its *identifier*.

**Two hardening patterns the diff should also get** (cheap insurance in slot components, because
slot props, host-provided records and DOM event targets are all outside the plugin's control —
records get evicted or partially hydrated, schemas drift across host versions, and any render-
or event-time throw in a slot entry costs the *whole entry* via the error boundary):

1. **Defensive reads — `record?.items ?? []`:** the diff's
   `record?.items.find(item => isImagePath(item.path))` throws `TypeError` whenever
   `record?.items` is `undefined` (missing record *or* missing `items` field) — optional
   chaining protects only `record`, not `items`. Write
   `(record?.items ?? []).find(item => isImagePath(item.path))`. One `?? []` converts a
   whole-dock-unmount crash into a benign "no preview".
2. **Optional-chained event reads — `event.target.closest?.()`:** the click handler's
   `event.target.closest('.remove')` assumes `target` is an `Element`; delegated/retargeted
   events can deliver text nodes, SVG nodes (no `closest` in older engines), or null. Write
   `if (event.target.closest?.('.remove') !== null && event.target.closest?.('.remove') !== undefined) return;`
   — or idiomatically `if (event.target instanceof Element && event.target.closest('.remove')) return;`.
   One `?.` keeps an exotic click target from becoming another silent slot crash.

## 4. The regression that would have caught it before release

A **data-present render smoke** for every slot entry the plugin registers — crucially mounting
the dock/chip component **with an occurrence present**, not in the empty state:

```js
// jsdom + the plugin's own h/React; one fake error boundary around the mount
records.set('r1', { status: 'ready', label: 'shot.png', items: [] });
const props = {
  input: { phase: 'plain',                                  // guard falsy → '||' right operand IS evaluated
           occurrences: [{ source: SOURCE, ref: 'r1', occurrenceId: 'o1', label: 'shot.png' }] },
  add() {}, remove() {},
};
mount(h(AttachmentDock, props));                 // wraps AttachmentChips(props, 'dock')
assert(document.querySelector('.chip') !== null);   // chip element actually rendered
assert(boundary.didCatch === false);                // no error-boundary capture
assert(consoleErrorSpy.notCalled);
```

Design points that make it a regression net rather than theater:

- **Occurrence with `source === SOURCE` present** — otherwise `occurrences.length === 0`
  returns `null` *before* the throwing line; the empty-state smoke passes forever and proves
  nothing (this is exactly the coverage hole that shipped v0.2.10).
- **`phase: 'plain'`** — the short-circuit means a locked-phase render also masks the bug; the
  test must force the guard falsy so `busy` is evaluated.
- **Assert on both** the chip element *and* boundary non-capture — a slot crash is invisible in
  the DOM (entry unmounted) and visible only via the boundary/console.
- Run it for each registered slot (`InputZone` dock and `input.left` button).

This test fails the same day the hardening pass adds `|| busy` — two releases before the user
report.

## 5. Release-process lesson

**`node --check lib/client.js` is a syntax check, not a correctness check.** A free identifier
is perfectly valid syntax; scope resolution happens at runtime, and for this component only at
*render time with data present*. Parse-level CI therefore has zero signal for the entire class
of dangling-reference render crashes.

A **lib-only** plugin compounds this: nothing in its package executes the component — no host
entrypoint, no CLI, no self-test harness. The code path that fails exists only inside the DSH
client's slot renderer, fed by live slot props. "It builds / it parses / the attach flow unit
tests pass" all leave the render path untouched.

**Minimum viable pre-ship check for slot-rendering lib-only plugins:**

1. **Data-present render smoke per registered slot entry** (section 4): mount each slot
   component with representative *non-empty* props covering each visual state (here: chip
   present + composer unlocked), assert render output and no error-boundary capture. This is
   the single check that catches this bug class.
2. **A static scope check** — ESLint `no-undef` (or `tsc --noEmit` over the lib): flags
   `busy` at the exact line at lint time. One CI line; catches the whole free-identifier
   family that `node --check` is blind to.
3. **One manual console-clean pass** in a dev client: perform the core flow (paste one
   attachment), confirm the slot renders and the console is empty — because slot-boundary
   errors surface *only* in the console, "no banner in the UI" can never be accepted as
   evidence of health.

---

*Fixture left byte-identical (read-only); report only. Skill posture: Mode A — diagnosis
and recommendations, no writes to plugin source, no installs, no version changes.*
