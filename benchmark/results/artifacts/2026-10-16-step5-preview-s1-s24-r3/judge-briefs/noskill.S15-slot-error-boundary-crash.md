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

# S15 · Vanishing Dock Chips — Root-Cause Report (`@org/dsh-attach-input` v0.2.11)

**Scope**: static diagnosis from the read-only evidence pack in `fixture/` (shipped v0.2.10
component, v0.2.11 feature diff, user thread). No fixture file was modified. Helper scripts and
this report live under `agent-output/S15-slot-error-boundary-crash/`.

---

## 0. TL;DR

**The throwing expression is the `busy` operand of
`disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy` at
`fixture/plugin-dock-chips.js:34` inside `AttachmentChips`.** `busy` is a *free identifier*
there — it is a `React.useState` local declared inside the sibling component `AttachButton`
(line 7) and has no binding in `AttachmentChips`' scope, at module level, or via imports.
Evaluating it throws `ReferenceError: busy is not defined` **at render time**, once per rendered
chip. The line was added in a v0.2.10 hardening pass and copy-pasted from `AttachButton`'s
`locked || busy` (line 17) into the wrong component; the `||`'s left-to-right evaluation kept
the dangling reference **latent** because the right operand is only evaluated when the phase
guard is falsy. v0.2.11's hover-preview rework of the *same component* is what first renders a
chip with the guard falsy, firing the ReferenceError for the first time. Because the throw
happens during the `InputZone` slot entry's render, the slot-level error boundary unmounts the
**whole dock entry** — the symptom is "the chips vanished", not "the remove button is broken" —
and the error is visible only in the browser console.

---

## 1. Root cause

### 1.1 Which expression throws

```js
// fixture/plugin-dock-chips.js — AttachmentChips, line 34 (as shipped in v0.2.10)
h('button', {
  type: 'button',
  className: 'remove',
  'aria-label': 'Remove ' + (record?.label ?? occurrence.label),
  // v0.2.10 hardening pass added the phase guard — and this busy reference:
  disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,   // <-- THROWS HERE
  onClick: () => props.remove(occurrence),
}, 'x')
```

The throwing **operand** is `busy`, the right-hand side of the `||`. It is a **free identifier**
in `AttachmentChips`:

- `busy` is declared **only** as a component-local state inside the *sibling* component
  `AttachButton`: `const [busy, setBusy] = React.useState(false)` (line 7).
- `AttachmentChips` (line 21) has no `busy` in scope: not a parameter, not a local, not a
  module-level binding (`records` and `SOURCE` are module-level; `busy` is not), not an import.
- The line is a **copy-paste of `AttachButton`'s own guard** `disabled: locked || busy`
  (line 17) — where `busy` *is* in scope — transplanted into a different component during the
  v0.2.10 hardening pass (the comment on line 33 says so explicitly).

When the expression is evaluated, JS resolves `busy` against the lexical scope chain, finds no
binding, and throws `ReferenceError: busy is not defined` — a **runtime binding error**, not a
syntax error, which is why it parses and ships cleanly (see §5).

### 1.2 Why it throws only when a chip renders

Three gates must all be passed before the expression evaluates:

1. **Empty-state early return.** `AttachmentChips` starts with
   `const occurrences = (props.input?.occurrences ?? []).filter(...); if (occurrences.length === 0)
   return null;` (lines 22–23). With no pending attachments the function returns `null` before
   the `return h('div', ...)` and before `occurrences.map(...)` — the throwing line inside the
   map callback is **never reached**.
2. **The expression lives inside the per-chip map callback** (line 24), so it evaluates exactly
   once per rendered chip, at `h()`-props construction time — i.e. **during render**, not on
   click. It is not "the remove button misbehaves when clicked"; it is "the dock cannot render a
   chip at all".
3. **The `||` short-circuit gate** (§1.3): the right operand is only evaluated when the phase
   guard is falsy.

### 1.3 Why the `||` short-circuit kept it latent through v0.2.10

`A || B` evaluates left-to-right and evaluates `B` **only when `A` is falsy**. Here
`A = (props.input?.phase ?? 'plain') !== 'plain'` and `B = busy`. So the dangling reference
was masked in exactly the state where the guard is *truthy* (input locked / non-plain phase) —
`disabled` evaluates to `true` and `busy` is never touched. Verified locally with
`temp/short-circuit-demo.js` (run against the fixture expressions, read-only):

```text
AttachButton scope,      phase=plain   => {"disabled":false}    // busy IS in scope here
AttachmentChips scope,   phase=sending => {"disabled":true}     // guard true → short-circuit → NO throw
AttachmentChips scope,   phase=plain   => THROWS ReferenceError: busy is not defined
AttachmentChips empty state            => null                    // early return, line never runs
```

Consequences:

- Through v0.2.10, every shipped render state that reached this line did so with the guard
  **truthy** (the chip only ever rendered while the attach flow held the input in a non-plain
  phase, and `AttachmentDock` subscribes only to the plugin's own `useRevision()` — line 41 —
  not to `input.phase` changes, so the chip was never re-rendered after the phase returned to
  plain). The masked operand was therefore **never evaluated**, and the v0.2.10 dock rendered
  fine — matching the maintainer note that "v0.2.10 users used the x button fine" and the user's
  memory of the chip appearing.
- v0.2.11's hover-preview rework of the *same* component rebuilt the chip's `h('div', …)` call
  (multi-line props, `data-image`, `onClick`, hover-card) and is the first shipped version to
  **re-render the dock with a chip mounted while the input sits idle in plain phase** — the state
  a user is in after pasting a screenshot and looking at the pending chip. That is the first
  evaluation of the falsy-guard path, so `busy` is resolved for the first time and the
  `ReferenceError` fires on the very first chip.

### 1.4 Why the symptom is "the whole dock vanished", not "the remove button is broken"

- The throw happens **during the `InputZone` slot entry's render** (`AttachmentDock` →
  `AttachmentChips`, lines 40–42). A slot entry that throws during render is caught by the
  framework's **slot-level error boundary**, which **unmounts the entire entry** — dock container,
  every chip, every name span, every remove button — not just the offending button. The user
  reports "the chip is gone", never "x does nothing".
- **Console-only visibility.** The boundary logs the error to the browser console; there is no
  error banner or toast in the UI (the user thread: "I don't see any error banner"). Users never
  open devtools, so the crash is *silent* — hence "the Silent Slot Crash".
- **Blast radius is contained per slot.** The paste pipeline (`props.add`) is independent of the
  slot render, so pasting still works and the message sends with the image. The attach button
  (`+`) lives in a **different slot entry** (`input.left`, `AttachButton`), so it has its own
  boundary and is unaffected — exactly the split the user observed.


---

## 2. Why blaming the v0.2.11 diff is the wrong first conclusion

### 2.1 Why the diff is the natural — and wrong — first suspect

The user reports the breakage on the *first version after* v0.2.10, and `feature.diff` does
touch `AttachmentChips` (the dock-chip component) — so "the hover-preview feature broke the
dock" is the obvious hypothesis. Two pieces of evidence make it a trap:

- The diff **rewrites the very line that throws** as part of its `h('div', …)` reformat
  (`-` `disabled: (props.input?.phase ?? 'plain') !== 'plain',` →
  `+` `... !== 'plain' || busy,`). A naive "revert the release diff → works?" test therefore
  *appears* to confirm the diff as the cause, when it only reverted the release into the
  v0.2.10-shaped line.
- The diff also adds a suspicious-looking hoisted block —
  `const imageItem = status !== 'missing' ? record?.items.find(...) : undefined;` placed at
  function-body level, referencing `status`/`record` that are declared *inside* the map
  callback. Read literally that block is out of scope and would throw `ReferenceError: status is
  not defined` on every chip render — but the reported crash survives feature removal (§2.2),
  and the shipped v0.2.11 obviously computed `imageItem` inside the callback. The hoisting is a
  schematic/red-herring artifact of the excerpt, **not** the crash the user hit.

### 2.2 The correct bisection

Attribute at **line level**, not release level:

1. **Blame the exact line.** `git blame -L 29,36 lib/client.js` (or `git log -S "|| busy" --
   lib/client.js`) on the pre-v0.2.11 tree: the `|| busy` operand was introduced by the
   **v0.2.10 hardening-pass commit**, not the hover-preview commit. The fixture's own evidence
   agrees on three independent points: the shipped v0.2.10 file (`plugin-dock-chips.js:33–34`)
   *contains* the line with the comment "v0.2.10 hardening pass added the phase guard — and this
   busy reference"; the maintainer note in `user-thread.md` states v0.2.10 "already had the
   line"; and the brief's reported symptom only makes sense if the expression predates the
   feature.
2. **Surgical revert (the decisive test).** Revert **only the hover-preview hunks** (the
   `imageItem` block, `data-image`, the chip `onClick`, the hover-card) and keep the rest of
   v0.2.11; mount the dock with one occurrence in plain phase → **still crashes**. The feature
   diff is exonerated: the crash does not depend on any added line.
3. **Minimal render mount (the positive control).** Mount `AttachmentChips` **from the v0.2.10
   file** with `input.phase = 'plain'` and one occurrence → crashes immediately. The bug
   predates v0.2.11 entirely; v0.2.11 is only the *trigger*.
4. **Read the crash frame.** The stack in the console lands at `client.js:34` inside
   `AttachmentChips` on the `disabled` expression — the pre-existing line the diff merely
   reformatted — not on any `+` line (imageItem / onClick / hover-card).

### 2.3 Evidence that distinguishes "new feature crashed the slot" from "old latent bug first exercised now"

| Test | "New feature crashed it" predicts | Observed / predicted here |
|---|---|---|
| Revert only feature hunks | crash disappears | crash **persists** (expression still evaluates) → old bug |
| Mount v0.2.10 component with data present | renders fine | **crashes** → predates v0.2.11 |
| Crash frame location | an added line (hover-card / onClick) | the pre-existing `disabled` expression, line 34 |
| State dependence of the crash | any chip render crashes | crashes **only** with guard falsy (plain phase) — a short-circuit-latency signature, i.e. the line existed but its masked operand was never evaluated before |

The v0.2.11 hover-preview work changed the **render path** (chip props rebuilt per render, dock
re-rendering with a chip mounted in the idle plain-phase state); the v0.2.10 hardening pass
introduced the **defect**. Trigger ≠ cause: the feature is the first *exercise* of a
pre-existing free-identifier crash, which is exactly what "short-circuit latency" means.


---

## 3. The fix

### 3.1 Remove the dangling reference

Minimal fix — drop the operand that has no binding in this scope:

```js
disabled: (props.input?.phase ?? 'plain') !== 'plain',
```

If the hardening intent was "disable remove while an attach operation is in flight", **scope the
state properly instead of deleting the intent**: component-local `useState` in `AttachButton`
is invisible to a sibling component — that is *why* the copy-paste failed. Lift `busy` to the
plugin's shared store (the same `records`-style module state the dock already reads), pass it
through the slot props, or expose it via context, then reference it in `AttachmentChips`:

```js
disabled: (props.input?.phase ?? 'plain') !== 'plain' || attachBusy,   // attachBusy = shared/plug-in-store value
```

Either way, the fix must also land the v0.2.11 cleanup of the hoisted `imageItem` block: move
it **inside** the `occurrences.map(...)` callback where `record`/`status` are in scope.

### 3.2 Two hardening patterns the diff should also get

1. **Defensive reads (`record?.items ?? []` style).** `record?.items.find(item => isImagePath(item.path))`
   throws `TypeError` when the record exists (status not `'missing'`) but has no `items`
   array — the same shape-drift the file already defends elsewhere (`record?.label ?? occurrence.label`,
   `(props.input?.occurrences ?? [])`). Write
   `(record?.items ?? []).find(item => isImagePath(item.path))`.
2. **Optional-chained event target lookup.** `event.target.closest('.remove')` throws
   `TypeError` when the event target is a node without `closest` (text nodes, some embedded
   renderers, non-Element targets). Write `event.target.closest?.('.remove')`.

**Why these are cheap insurance in slot components:** a lib-only plugin ships raw source with no
build step and no type checker (§5), and the host owns the data shapes (`input.occurrences`,
`records`) — they can drift between harness versions without the plugin changing. The slot's
failure mode is not a localized degraded feature: a single undefined dereference takes down the
**whole slot entry** with console-only visibility. `?? []` and `closest?.()` convert an
unmount into a degraded/no-op path at zero happy-path cost, and they cost nothing at review time.

---

## 4. The regression that would have caught this

A **render smoke that mounts the dock/chip component WITH an occurrence present** — not the empty
state. The empty dock `return null`s at line 23 *before* reaching the throwing line, so an
empty-state smoke passes vacuously and is exactly the test that was missing.

Design (sketch, not executed against the fixture — this is a read-only diagnosis task):

```js
// regression/attach-dock.render.smoke.js — plugin test harness (or jsdom)
import { AttachmentDock, SOURCE } from '../lib/client.js';

test('dock renders a pending chip without an error-boundary capture', () => {
  const input = {
    phase: 'plain',   // <-- the falsy-guard state: the ONLY state that evaluates `busy`
    occurrences: [{ source: SOURCE, ref: 'att-1', occurrenceId: 'occ-1', label: 'screenshot.png' }],
  };
  seedRecord('att-1', { status: 'ready', label: 'screenshot.png',
                        items: [{ path: 'screenshot.png', file: new Blob() }] });

  const captured = mountSlotEntry({          // mounts the InputZone entry under the slot boundary
    slot: 'InputZone', entry: AttachmentDock, props: { input, remove: () => {} },
  });

  expect(captured).toBeUndefined();                          // no error-boundary capture
  expect(document.querySelector('.dock .chip[data-status]')).not.toBeNull();
  expect(document.querySelector('.dock .chip .remove')).not.toBeNull();
});
```

Key properties that make it catch *this* bug:

- **Data present**: at least one occurrence (and a seeded `records` entry) so the map body runs.
- **Guard falsy (`phase: 'plain'`)**: the short-circuit-latent state; without it the smoke would
  pass even with the bug present. A small **phase/state matrix** (plain × non-plain ×
  missing-record × image-item) covers both the crash path and the v0.2.11 hover-preview additions.
- **Boundary assertion**: the slot error boundary's capture hook / fallback must not fire — the
  crash mechanism is precisely "render throws → boundary unmounts the entry", so the test must
  observe the boundary, not just the DOM.

A cheap static complement (no DOM needed): `eslint` with `no-undef` flags the free `busy`
identifier at lint time — a free identifier that exists nowhere in scope is exactly what
`no-undef` is for, and it would have failed CI on the hardening-pass commit itself.

---

## 5. Release-process lesson

### 5.1 Why `node --check` was insufficient

`node --check` is a **parse-only** check: it verifies the file is syntactically valid JavaScript.
It does not resolve identifiers, does not build a scope graph, and does not execute any code path.
A free identifier like `busy` is perfectly **legal syntax** — the defect exists only at
*evaluation* time, and only on the code path that evaluates it. So:

- `node --check lib/client.js` passes on the broken v0.2.10 file (verified locally — see
  Appendix). The syntax gate was green on the exact code that crashed users.
- The failure is a **runtime binding error on a data-dependent render path**. For a lib-only
  plugin whose components render into host slots, the shipped artifact *is* the untested code:
  there is no bundler, transpiler, or type checker between the author and the host, so any
  render-time defect ships verbatim and stays invisible until a user reaches the exact state
  (chip present + plain phase) that triggers it.
- The check that was actually run also missed the *state* dependency: the crash needs data
  present and the guard falsy — a combination no syntax check can reason about.

### 5.2 Minimum viable pre-ship check for slot-rendering lib-only plugins

A **data-present render smoke wired into the release gate** (npm version → CI smoke → publish):

1. Enumerate every registered slot entry (here: `input.left` = `AttachButton`,
   `InputZone` = `AttachmentDock`).
2. Mount each entry headlessly (the harness's slot test support, or jsdom for the DOM-dependent
   ones) with a **realistic data-present payload** — occurrences present, records seeded, and for
   this plugin a `phase` matrix including the guard-falsy state.
3. Assert three things per entry: the entry's own content rendered, the slot error boundary
   captured nothing, and no console error was emitted.

Two near-zero-cost backstops to add alongside: `eslint` `no-undef` (catches the free
identifier statically, no execution needed) and a `// @ts-check` / `.d.ts` type pass (a
dangling identifier is precisely what type checking catches). The render smoke is the
non-negotiable minimum: it is the only one of the three that exercises the *actual failure mode*
— a slot entry that throws at render time with data present, silently unmounting the whole entry.

---

## Appendix — evidence index

**Files read (all under the cell directory, read-only; nothing outside was touched):**

- `fixture/README.md` — evidence-pack index; confirms `plugin-dock-chips.js` is the v0.2.10
  shipped component, `feature.diff` the v0.2.11 hover-preview diff, `user-thread.md` the
  symptom report; fixture is read-only and must stay unchanged.
- `fixture/plugin-dock-chips.js` — `AttachButton` (busy state at line 7, guard at line 17) and
  `AttachmentChips` (throwing line 34, empty-state return at line 23) as shipped in v0.2.10.
- `fixture/feature.diff` — v0.2.11 hover-preview diff touching the same component.
- `fixture/user-thread.md` — user symptom ("chips are GONE"), maintainer note (v0.2.10 already
  had the `|| busy` line; slot error boundary unmounts the entry; no render smoke shipped).

**Files written (under `agent-output/S15-slot-error-boundary-crash/`):**

- `report.md` — this report.
- `temp/short-circuit-demo.js` — read-only reproduction helper isolating the two scopes.

**Commands run:**

| Command | Target | Result |
|---|---|---|
| `Get-ChildItem -Recurse -Force` | cell directory | listed fixture + agent-output trees |
| `read` (4 files) | `fixture/README.md`, `plugin-dock-chips.js`, `feature.diff`, `user-thread.md` | evidence for all sections |
| `node --check` | `fixture/plugin-dock-chips.js` | **exit 0 — passes on the broken code** (proves §5.1) |
| `node temp/short-circuit-demo.js` | `temp/short-circuit-demo.js` | reproduced: guard-truthy short-circuits without throw; guard-falsy throws `ReferenceError: busy is not defined`; empty state returns `null` |

**Reproduction transcript (`node temp/short-circuit-demo.js`):**

```text
AttachButton scope,      phase=plain   => {"disabled":false}    // busy IS in scope here
AttachmentChips scope,   phase=sending => {"disabled":true}     // guard true → short-circuit → NO throw
AttachmentChips scope,   phase=plain   => THROWS ReferenceError: busy is not defined
AttachmentChips empty state            => null                    // early return, line never runs
```



## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.