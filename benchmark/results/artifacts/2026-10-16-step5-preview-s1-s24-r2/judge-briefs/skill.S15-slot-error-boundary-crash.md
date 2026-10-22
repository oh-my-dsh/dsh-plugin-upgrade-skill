# JUDGE BRIEF · skill.S15-slot-error-boundary-crash

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

# S15 · Vanishing Dock Chips — Root Cause, Bisection, Fix and Release-Gate Report

**Plugin:** `@@org/dsh-attach-input` (community Web plugin, lib-only: `lib/client.js` maintained directly)
**Symptom:** after upgrading v0.2.10 → v0.2.11, the pending-attachment chip above the input box never
appears. Paste still works, the attach button (`+`) is unaffected, no error banner in the UI.
**Evidence pack (read-only):** `fixture/plugin-dock-chips.js` (v0.2.10 as shipped),
`fixture/feature.diff` (the v0.2.11 hover-preview diff), `fixture/user-thread.md`.

## Verdict (one paragraph)

The crash is a **free identifier**, not a feature bug. `AttachmentChips` evaluates
`disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy`
([fixture/plugin-dock-chips.js:34](plugin-dock-chips.js)), and `busy` is the `useState` binding that
lives inside the *sibling* component `AttachButton`
([fixture/plugin-dock-chips.js:7](plugin-dock-chips.js)) — a function-local `const` that is not in
scope in `AttachmentChips`, so the identifier resolves to the global scope, finds nothing, and throws
`ReferenceError: busy is not defined` while the chip element is being built. The line shipped in
**v0.2.10**; the v0.2.11 hover-preview diff is the first thing that put a chip on screen in the state
that actually evaluates the dangling operand (chip present **and** phase guard falsy), which is why
the regression *looks* new. The dock "vanishes" rather than "losing its remove button" because the
throw happens during render (not in a handler), and DSH's slot-level error boundary unmounts the whole
slot entry, leaving one console line as the only trace. Fix = delete the dangling operand (or prop-drill
a real `busy`), add two defensive-read hardening patterns, and gate releases on a **data-present render
smoke** instead of `node --check` alone.

| Brief question | Answer section |
|---|---|
| 1 · exact root cause | §1 |
| 2 · why blaming the v0.2.11 diff is wrong + correct bisection | §2 |
| 3 · the fix + two hardening patterns | §3 |
| 4 · the regression that would have caught it | §4 |
| 5 · release-process lesson + minimum viable pre-ship check | §5 |

---

## 1. The exact root cause

### 1.1 Which expression throws

`js
// fixture/plugin-dock-chips.js:29-36  (v0.2.10, inside AttachmentChips)
h('button', {
  type: 'button',
  className: 'remove',
  'aria-label': 'Remove ' + (record?.label ?? occurrence.label),
  // v0.2.10 hardening pass added the phase guard — and this busy reference:
  disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,   // <-- throws here
  onClick: () => props.remove(occurrence),
}, 'x'));
`

The throwing sub-expression is the **`||` right operand, the bare identifier `busy`**.

Scope analysis of the module:

* The only `busy` in the file is `const [busy, setBusy] = React.useState(false)` — declared **inside
  `AttachButton`'s function body** ([fixture/plugin-dock-chips.js:7](plugin-dock-chips.js)). A
  function-local `const` is invisible to `AttachmentChips`; there is no module-scope `busy`, no
  parameter named `busy`, no closure over it.
* Therefore `busy` inside `AttachmentChips` is a **free identifier**: JS resolves it against the global
  scope, finds no binding, and throws. Because there is no declaration *at all* in that scope chain, it
  is a plain `ReferenceError: busy is not defined` (not a TDZ `Cannot access 'busy' before
  initialization` — there is nothing to be in the temporal dead zone of).
* The props object passed to `h(...)` is an object literal evaluated **eagerly at the call**, exactly
  like `React.createElement`. So the throw happens *while `AttachmentChips` renders* — before any
  element exists, before commit, before any click handler could ever run.

Reproduced against the fixture code (fresh Node process, minimal hyperscript `h`, framework slot
boundary simulated — full script in Appendix B):

`
[slot boundary] InputZone/dock -> entry UNMOUNTED: ReferenceError: busy is not defined
chip + phase=plain (idle, post-paste)    -> CRASH (dock vanished)
`

### 1.2 Why it throws only when a chip renders

[fixture/plugin-dock-chips.js:23](plugin-dock-chips.js):

`js
const occurrences = (props.input?.occurrences ?? []).filter(item => item.source === SOURCE);
if (occurrences.length === 0) return null;      // <-- empty dock exits BEFORE the throwing line
return h('div', { className }, ...occurrences.map(occurrence => { /* busy is in here */ }));
`

The throwing expression is built inside the `occurrences.map(...)` callback, i.e. **only on the path
where at least one occurrence of this plugin's `SOURCE` exists**. With no pending attachment the
component returns `null` and the line is never evaluated. The crash is therefore **data-gated**, and
the gate is exactly the state a user creates by pasting a screenshot.

Two consequences worth stating explicitly:

* The empty state is a *false green* for any test or manual check: mounting the dock with no
  occurrences passes on the broken code (measured: `empty dock -> rendered, chips=0`, no error).
* The throw happens while building the **first** chip's remove button, so **zero** chip elements are
  ever produced. There is no partial render and no "chip without an x" — which is the mechanical
  reason the symptom cannot be "the remove button is broken" (see §1.4).

### 1.3 Why the `||` short-circuit kept it latent through v0.2.10

`A || busy` evaluates `A` first and evaluates `busy` **only when `A` is falsy**. Here

`
A = (props.input?.phase ?? 'plain') !== 'plain'
`

`A` is **true** exactly when the composer is in a non-plain (locked / in-flight) phase, and **false**
when `phase === 'plain'` (or when `props.input` is absent, which the `??` maps to `'plain'`). So:

| render state | `A` | `busy` evaluated? | outcome |
|---|---|---|---|
| no occurrence | — | never reached (`return null` first) | renders fine |
| chip present, `phase` non-plain | `true` | **no** (short-circuit) | renders fine, `disabled === true` |
| chip present, `phase === 'plain'` | `false` | **yes** | `ReferenceError` → entry unmounts |

Measured on the fixture code:

`
empty dock (no occurrence)               -> rendered, chips=0
chip + phase=sending (non-plain)         -> rendered, chips=1, remove.disabled=true
chip + phase=plain (idle, post-paste)    -> CRASH (dock vanished)
chip + phase=undefined (default plain)   -> CRASH (dock vanished)
`

That is the whole latency mechanism, and it has two independent gates that must be **open at the same
render**: (i) the data gate — at least one occurrence, and (ii) the short-circuit gate — the phase
guard falsy. The v0.2.10 hardening pass added the phase guard and the stray `busy` **behind that same
guard**, so for as long as the dock's chips only existed inside the non-plain window (the in-flight
attach/paste flow, which is precisely the window the guard was written to lock), the dangling operand
was never touched. The thread's own evidence ("v0.2.10 users used the x button fine") says the crash
path was not being reached in the field — it is evidence about *reachability*, not about the code.

v0.2.11 is what opened both gates simultaneously: a hover thumbnail / click-to-view preview is only
meaningful on a chip that is **settled and visible while the input is idle** — you hover and click a
chip after the paste has landed, i.e. with `phase === 'plain'`. That is the first state in the
plugin's life in which a chip renders *and* the left operand is falsy, so the dormant operand executed
for the first time in front of a user.

> **Proven vs. inferred.** Proven from the pack: the `|| busy` line is in the v0.2.10 artifact; the
> two gates exist; the throw happens exactly when both are open; the empty state is safe. Inferred
> (flagged because the pack contains no phase-lifecycle code): that v0.2.10's chip-visible window was
> the non-plain window, and that v0.2.11's preview is the first feature to show an idle chip. The fix
> and the regression in §3–§4 do not depend on that inference.

### 1.4 Why the symptom is "the whole dock vanished", not "the remove button is broken"

Four reasons, in order of importance:

1. **The throw is in render, not in a handler.** `disabled` is computed while the element is being
   *built*; `onClick` is a closure that is never invoked on this path. There is no reachable state in
   which the chip renders and only the button misbehaves — the process dies before either exists.
2. **The slot entry is one unit.** `AttachmentDock` → `AttachmentChips` is a single contribution to
   the `InputZone` occurrences slot. DSH's slot-level error boundary catches a render error and
   **unmounts the entire entry**: no partial children, no per-element fallback, no user-visible
   banner. Removing the entry removes the whole dock — every chip, filename span and remove button at
   once.
3. **The only trace is a console record.** The boundary logs (a `slot entry crashed`-style line) and
   renders nothing. Users never open devtools, so the report arrives as "the feature is gone", which
   reads exactly like a fresh regression.
4. **The neighbouring surfaces are structurally immune, and the thread confirms it.** `AttachButton`
   is a *different* component in a *different* slot entry (`input.left`) and owns its own `busy`, so it
   keeps rendering ("the attach button is unaffected"). The paste itself goes through `props.add`,
   which is data-path code, untouched by the render throw ("the paste itself still works"). If
   v0.2.11 had broken the attach flow, the button would have broken too — it didn't, which is itself
   diagnostic evidence for a render-only fault.

**Precedent in the skill:** this is the same failure shape the plugin-upgrade skill cards as
`DSH-0.1.7-A1-01` for a completely different cause (a destructured `Icon...16` export becoming
`undefined` → React error #130): *"the framework's slot-level error boundary unmounts the WHOLE slot
entry, so the user-visible symptom is an entire surface (dock, header widget) silently vanishing with
one minified console error and no request failures"* — with first-hand fleet evidence of a resident
input-dock strip disappearing after a host upgrade. Its verification rule is the direct lesson for
§4/§5: *"assert all three: the surface's DOM marker is present, zero `slot entry crashed` console
records, and the expected network requests fire. A single 'CSS loaded, no errors' check has false
negatives."*

---

## 2. Why blaming the v0.2.11 diff is the wrong first conclusion

### 2.1 Why it is the tempting conclusion

Recency (report arrived one release later) + same component (`feature.diff` edits
`AttachmentChips`, the failing component) + a `+` line that literally contains the crashing
identifier:

`
-        disabled: (props.input?.phase ?? 'plain') !== 'plain',
+        disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,
`

Read naively, v0.2.11 *added* the dangling reference. That is about as strong a false positive as a
diff can produce, and it is why "revert the hover preview" feels like the obvious first move.

### 2.2 Why it is wrong — three pieces of evidence

1. **The shipped v0.2.10 artifact already contains the line.**
   [fixture/plugin-dock-chips.js:34](plugin-dock-chips.js) is v0.2.10's `lib/client.js` *as shipped*,
   and it carries `|| busy` with the comment *"v0.2.10 hardening pass added the phase guard — and this
   busy reference"*. The released artifact outranks a hand-written diff, always.
2. **The diff hunk is demonstrably not a faithful record of that file.** Its context/removal lines
   omit the `'aria-label': 'Remove ' + (record?.label ?? occurrence.label)` line that sits between
   `className: 'remove'` and `disabled:` in the shipped v0.2.10 file (verified textually against the
   fixture — see Appendix B.3). A hunk whose context does not match the file it claims to diff cannot
   be the oracle for "what changed". The likely real history: the hardening pass landed `|| busy` in
   v0.2.10; v0.2.11's feature diff was generated from a base that lacked it (or was rebased/squashed
   and re-generated), so the line re-appears on the `+` side.
3. **The thread's own history contradicts "new in v0.2.11".** *"In v0.2.10 the same component already
   had the line … and v0.2.10 users used the x button fine."* Combined with the short-circuit table in
   §1.3, that is the signature of a latent bug being *exercised*, not a bug being *introduced*.

### 2.3 The correct bisection

Cheapest and most decisive first; archaeology last.

**Step 1 — minimal render mount (minutes, no build).** Mount `AttachmentChips`/`AttachmentDock`
directly, against the **v0.2.10 file only**, with one occurrence and `phase: 'plain'`, no v0.2.11 code
anywhere in the process. Result (reproduced, Appendix B.1): `ReferenceError: busy is not defined`,
zero chips rendered. A crash that reproduces with **zero** v0.2.11 code in the process cannot have been
introduced by v0.2.11. This single experiment ends the debate.

**Step 2 — rollback / re-add bisect on the real host.**
* Reproduce on the **v0.2.10 tag** (paste a screenshot, leave it pending while the input is idle):
  the dock vanishes, same throw, same line.
* On v0.2.11, revert/stash the hover-preview commit and retest: the dock **still** vanishes, because
  `|| busy` is in the base.
* Re-apply the feature: still vanishes.
  → The feature is **neither necessary nor sufficient** for the crash; the pre-existing line is both.
  If instead the crash disappeared on revert and reappeared on re-apply, *then* the diff would be the
  cause. (Variant: `git stash` the feature branch and run the same data-present mount — the mount is
  the fast version of this experiment.)

**Step 3 — only then archaeology, for attribution (never for causation).**
`git log -S '|| busy' -- lib/client.js` and `git blame -L 29,36 lib/client.js` on the v0.2.10 tag to
date the line to the hardening pass; `git show v0.2.10:lib/client.js` to prove the released artifact
contains it. Blame tells you *who and when*; only steps 1–2 tell you *whether it breaks the user*.

**Step 4 — the discriminating table** (what separates the two hypotheses in general):

| Observation | "new feature crashed the slot" | "old latent bug first exercised now" |
|---|---|---|
| Crash on the parent revision with the same input state | no | **yes** |
| Throwing line present in the parent artifact | no | **yes** |
| Reverting the feature removes the crash | yes | no |
| Throwing line in the diff's `+` side **and absent from the parent revision** | yes | **appears in `+`, but IS in the parent** |
| What the feature changed | the code path | **only when a state is reachable** |

The tell here is the last row: v0.2.11 changed **when** the fatal state is reachable (an idle chip on
screen), not **what** executes.

### 2.4 Secondary finding about the diff (recorded; changes nothing about the fix)

Taken literally, the hunk inserts

`js
const imageItem = status !== 'missing' ? record?.items.find(item => isImagePath(item.path)) : undefined;
`

**above** the `occurrences.map(...)` callback, while `record` and `status` are declared **inside** that
callback. Executed exactly as pasted, that is a *second* free-identifier crash of the same family —
reproduced: `ReferenceError: status is not defined`, which would fire before `busy` is ever reached
(Appendix B.1, case D). Either the hunk is compressed formatting and the real v0.2.11 file computes
`imageItem` inside the callback, or v0.2.11 shipped a second instance of the identical bug class.
Both readings reinforce §2.2 — the diff is not a reliable oracle — and both point the fix and the lint
at the same class: *an identifier that only resolves in a sibling scope*.

---

## 3. The fix

### 3.1 Remove the dangling reference (preferred)

`diff
-        disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,
+        disabled: (props.input?.phase ?? 'plain') !== 'plain',
`

Why this is safe: `busy` was `AttachButton`'s upload-in-flight flag. The chip's own lock is the phase
guard, which is already the semantically correct lock for the dock, and per §1.3 the `|| busy`
operand only ever executed in states where the guard was already `true` — so removing it cannot change
any behavior a v0.2.10 user actually saw. Measured after the change: `phase='plain'` → renders,
`disabled=false`; `phase='sending'` → renders, `disabled=true` (unchanged). Also delete the stale
`// <-- ???` marker, and grep the file for any other sibling-scope identifier before shipping.

### 3.2 Or scope it properly (if "disable remove during upload" was the real intent)

Never reach into another component's locals. Either:

* **prop-drill** — `AttachmentDock`/`AttachmentChips` receive the flag from the plugin's shared state:
  `const busy = props.busy === true;` (defaulted, so an absent prop cannot reintroduce a
  falsy/undefined surprise); or
* **lift it into a tiny shared store** (module-level store or `useSyncExternalStore`) that both
  `AttachButton` and `AttachmentChips` read — the right choice if more than two surfaces need it.

### 3.3 The two hardening patterns the diff should also get

**(a) Defensive reads on possibly-absent record fields — `record?.items ?? []`.**
The hover-preview code reads `record.items` to find the image path. `records.get(occurrence.ref)` can
legitimately return a record whose `items` is missing or `undefined` (partial record, older schema, or
a `status: 'missing'` record with no payload), and `undefined.find(...)` is a `TypeError` — the same
silent slot-entry death, one release later, from a different expression.

`js
const items = record?.items ?? [];                                   // instead of record?.items.find(...)
const imageItem = status !== 'missing' ? items.find(i => isImagePath(i.path)) : undefined;
`

**(b) Optional-chained event delegation — `event.target.closest?.('.remove')`.**
`event.target` is not guaranteed to be an `Element`: with delegated events React can hand you a text
node or an SVG node whose prototype has no `closest`, and calling it throws.

`js
onClick: (event) => { if (event.target.closest?.('.remove')) return; /* … open viewer … */ }
`

**Why these are cheap insurance in slot components specifically:** in a slot component a throwing
expression is not a degraded feature, it is a **total, silent** failure — the boundary unmounts the
whole entry, there is no partial render, no user-visible error, and the only signal is a console line
nobody reads. So the cost/benefit is wildly asymmetric: two characters (`?.`) and one `?? []` buy back
the entire surface. Both patterns fail *toward the feature being absent*, which is always the safe
direction for a slot contribution. Measured (Appendix B.1, case E): with a record that has **no**
`.items`, the hardened shape renders one chip instead of crashing, and the click handler survives a
target without `closest`.

---

## 4. The regression that would have caught this before release

**A render smoke that mounts the dock/chip component WITH an occurrence present — not the empty
state — asserting the chip element renders without an error-boundary capture.**

### 4.1 Why the empty state is a false green

`AttachmentChips` returns `null` at
[fixture/plugin-dock-chips.js:23](plugin-dock-chips.js) when `occurrences` is empty, so the throwing
line at :34 is never evaluated. Any smoke that mounts the dock with no pending attachment passes on
the broken code. Measured: `PASS empty dock -> false green: returns null before the throwing line`
against the crashing v0.2.10 code. The empty state is what a fresh dev session, a fresh browser
profile and a "does it still load?" check all produce — which is exactly why the bug shipped.

### 4.2 The test (data-present)

`js
// dock-chips.render.smoke.cjs   (or .test.cjs run under node --test)
const SOURCE = 'attach';
const records = new Map([['occ-1', { status: 'ready', label: 'screenshot.png' }]]);
const occurrence = { occurrenceId: 'occ-1', ref: 'occ-1', source: SOURCE, label: 'screenshot.png' };

for (const phase of ['plain', 'sending']) {              // both short-circuit branches
  const props = { input: { phase, occurrences: [occurrence] }, remove: () => {} };
  const tree = mountSlotEntry('InputZone/dock', () => AttachmentDock(props));   // boundary-instrumented
  const chips = tree && tree.children.filter(c => c && c.props && c.props.className === 'chip');
  assert(chips.length === 1, 'chip must render with data present');            // <- fails on v0.2.10
  const remove = chips[0].children[1];
  assert(remove.props.className === 'remove', 'remove button must render');
  assert(remove.props.disabled === (phase !== 'plain'), 'phase guard must drive disabled');
  assert(remove.props.onClick, 'remove handler must be wired');
}
// plus a click-through: remove.props.onClick() must call props.remove(occurrence)
// plus an empty-state case asserting the dock returns null (kept, but never the only case)
`

Assertions that matter: **the `.chip` element exists, the `.remove` button exists, and the mount
produced no error-boundary capture** (no throw, and if the harness exposes the boundary, no
`slot entry crashed`-style record). Parametrizing `phase` over both branches is what makes this test
cover the short-circuit path *and* the crash path.

### 4.3 Result

`
FAIL  v0.2.10 as shipped            (boundary captured a render error -> dock would vanish in prod)
PASS  after fix #1 / #2 / hardened
PASS  empty dock -> false green (passes before AND after the fix)
`

The data-present smoke fails on v0.2.10 as shipped and on v0.2.11 as diffed, and passes after the
fix. The empty-state smoke passes both before and after — which is precisely why it was never going
to catch this. At the browser level this is the `DSH-0.1.7-A1-01` verification triple restated:
**DOM marker present + zero `slot entry crashed` console records + expected requests fire.**

---

## 5. The release-process lesson

### 5.1 Why "syntax check only" was insufficient

The gate that shipped this was the documented one for lib-only plugins —
`node --check lib/index.js && node --check lib/client.js` (the plugin-upgrade skill's own routine for
plugins that maintain `lib/` directly and have no build/test scripts; see
`skills/plugin-upgrade/examples/06-real-world-batch-migration.md` step 4, the `paste-input` plugin —
this plugin's exact shape).

`node --check` is a **parse-only** check. It proves the file is syntactically valid JavaScript. It does
not, and cannot:

* **resolve identifiers** — there is no scope analysis, so a free identifier like `busy` parses
  perfectly and is fatal only at evaluation time;
* **execute anything** — no render path, no props-object construction, no `h(...)` call;
* **observe data** — the crash is gated on `occurrences.length > 0`, a runtime value no syntax check
  can see;
* **see through a short-circuit** — even the `||` masking is invisible without evaluating both
  operands.

So the gate was green for a release whose dock was already dead on arrival for any user with a pending
attachment in the idle state. Worse, the gate's greenness was *correlated with the bug's latency*: the
same two gates that hid the bug from users (§1.3) also hid it from any "it renders fine for me" manual
check, because a manual check almost always starts from the **empty** state. A green `node --check`
plus a green eyeball on an empty dock is a completely consistent picture of a dead dock.

### 5.2 Minimum viable pre-ship check for slot-rendering lib-only plugins

Keep the syntax check (it is free and catches artifact truncation/encoding damage) and add three
things, all release-blocking, run in the same step that bumps the version:

1. **Static scope check — `no-undef` over `lib/`.** One devDependency and a two-line config
   (`{ "env": { "browser": true }, "rules": { "no-undef": "error" } }`). This catches the *entire
   class* — free identifiers, sibling-scope references — with no runtime, no bundler and no browser.
   It would have failed on v0.2.10 at the moment the hardening pass landed.
2. **Data-present render smoke per slot contribution** (§4). Mount every slot contribution with
   representative data present and assert the DOM marker plus zero boundary captures. For a lib-only
   plugin this can be a single `node` file (or `node --test` file) importing the lib's component
   factories with a stubbed `h`/React — no build system required. Rule: **every slot gets one
   data-present case and one empty-state case, and the data-present case is the one that gates.**
3. **Browser smoke when feasible** — the `DSH-0.1.7-A1-01` triple: DOM marker present, zero
   `slot entry crashed` console records, expected requests fire. "CSS loaded, no errors" has false
   negatives; a *marker + zero crash records* pair does not.
4. **Never let a feature release skip the gate.** The skill's "zero-diff edges still get full
   verification" rule applies with *more* force to feature edges, because a feature edge is precisely
   when a latent line gets exercised for the first time. Wire the gate into the version-bump step so
   "declare support" and feature releases run the same checks.

**One-line rule for the plugin's release doc:** a lib-only slot-rendering plugin's gate is
**"parses" + "every identifier resolves" + "every slot renders with data present"**. Syntax alone
proves none of the three things that actually break in production.

---

## Appendix A · Evidence index

| Claim | Source |
|---|---|
| `busy` is `AttachButton`'s local state | [fixture/plugin-dock-chips.js:7](plugin-dock-chips.js) |
| `busy` used as a free identifier in `AttachmentChips` | [fixture/plugin-dock-chips.js:34](plugin-dock-chips.js) |
| Empty dock returns before the throwing line | [fixture/plugin-dock-chips.js:23](plugin-dock-chips.js) |
| Dock = one slot entry (`InputZone` occurrences); button = another (`input.left`) | [fixture/plugin-dock-chips.js:2-3](plugin-dock-chips.js), [:40-43](plugin-dock-chips.js) |
| v0.2.11 diff touches the same component | [fixture/feature.diff](feature.diff) |
| Diff hunk omits the shipped `aria-label` context line (not a faithful record) | textual comparison, Appendix B.3 |
| User symptom: chip gone, paste works, attach button fine, no banner | [fixture/user-thread.md](user-thread.md) |
| Maintainer note: line already in v0.2.10; slot entry unmounts on render throw; no render smoke shipped | [fixture/user-thread.md](user-thread.md) |
| Slot-level boundary unmounts the whole entry; console-only visibility | skill `references/v0.1.7-alpha.1.md` (`DSH-0.1.7-A1-01`) |
| Verification triple: DOM marker + zero `slot entry crashed` records + requests | skill `references/v0.1.7-alpha.1.md` (`DSH-0.1.7-A1-01`) |
| `node --check` is the documented gate for lib-only plugins | skill `examples/06-real-world-batch-migration.md` step 4 |

## Appendix B · Reproduction (scratch scripts were run from `_scratch/` and deleted afterwards)

### B.1 Crash, short-circuit, fix and hardening (fresh Node process, minimal `h`)

`
A) v0.2.10 as shipped, chip present, phase=plain:
    [slot boundary] dock UNMOUNTED: ReferenceError: busy is not defined
    ok=false chips=0
B) fix #1 (drop "|| busy"), phase=plain:
    ok=true chips=1 disabled=false
    ... and phase=sending: ok=true disabled=true
C) fix #2 (prop-drilled busy), busy=true: ok=true disabled=true
D) v0.2.11 diff pasted literally (imageItem hoisted above the map):
    [slot boundary] dock UNMOUNTED: ReferenceError: status is not defined
E) hardened v0.2.11 shape (record has no .items): ok=true chips=1
    optional-chained closest with a target lacking closest(): onClick survived
F) render smoke (data present):
    FAIL  v0.2.10 as shipped            (boundary captured a render error)
    PASS  after fix #1 / #2 / hardened
    PASS  empty dock -> false green (returns null before the throwing line)
`

The harness reproduces the fixture faithfully in the only way that matters: `h(type, props, ...children)`
builds `{ type, props, children }` with the props object **evaluated eagerly at the call**, exactly like
`React.createElement`, and `mountSlotEntry` wraps the render in the boundary the framework uses
(`try { render() } catch { entry unmounted }`). Module-scope `SOURCE` / `records` / `React` / `h` are
stubbed; `busy` is deliberately absent from module scope, matching the shipped file.

### B.2 State matrix

`
empty dock (no occurrence)               -> rendered, chips=0
chip + phase=sending (non-plain)         -> rendered, chips=1, remove.disabled=true
chip + phase=plain (idle, post-paste)    -> CRASH (dock vanished)
chip + phase=undefined (default plain)   -> CRASH (dock vanished)
`

### B.3 Diff-vs-artifact check

`
feature.diff:33   +        disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,
v0.2.10 file:34   disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,   // <-- ???
v0.2.10 file:33   // v0.2.10 hardening pass added the phase guard — and this busy reference:
shipped has : 'aria-label': 'Remove ' + (record?.label ?? occurrence.label),
diff hunk   : (no corresponding context/removal line mentioning aria-label)
each removed line present verbatim in shipped v0.2.10? true
`

i.e. the diff's `-` side is a **prefix** of the shipped line (it drops `|| busy`), and the hunk's
context drops a line the shipped file definitely has — the diff is not a record of the v0.2.10 file.

## Appendix C · What is proven vs. inferred

* **Proven from the pack + reproduction:** the throwing expression and its scope; the two gates (data
  gate at :23, short-circuit gate at :34); the state matrix; that the line exists in the v0.2.10
  artifact; that the diff hunk is not a faithful record of that artifact; that the empty-state smoke
  is a false green; that the data-present smoke fails pre-fix and passes post-fix; that the diff, taken
  literally, contains a second free-identifier hazard.
* **Inferred (flagged, not load-bearing):** the exact v0.2.10 render lifecycle (which states had
  `phase === 'plain'` while a chip was present) and the precise mechanism by which v0.2.11 first
  reached that state. The pack contains no phase-lifecycle code. Neither the fix nor the regression
  depends on this: the fix deletes an operand that can only ever be `true`-masked or fatal, and the
  regression pins the state directly.
* **Residual risk if the inference is wrong:** if v0.2.10 *did* reach the idle-chip state for some
  users, then v0.2.10 had the same vanishing-dock bug and it was simply under-reported (consistent
  with console-only visibility and with no render smoke ever having existed). Either way the fix, the
  hardening and the gate are identical — which is the point of pinning the regression to the *state*
  rather than to the release.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.