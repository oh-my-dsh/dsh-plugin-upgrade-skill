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
#### FILE: S15-slot-error-boundary-crash/report.md

# S15 · Vanishing Dock Chips — root cause, bisection, fix, regression, release lesson

**Subject**: `@org/dsh-attach-input` v0.2.10 → v0.2.11 (hover preview), reported by user *mirren*  
**Evidence**: `fixture/plugin-dock-chips.js` (shipped v0.2.10 excerpt), `fixture/feature.diff` (v0.2.11 diff), `fixture/user-thread.md`  
**Mode**: read-only diagnosis (plugin-upgrade skill Mode A). Nothing was built, installed, migrated or executed; the fixture is byte-identical (hashes in §8).

---

## 0. Summary in one paragraph

`AttachmentChips` builds each chip's remove button with `disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy`, and `busy` **has no binding in that scope** — it is a `useState` cell inside the sibling component `AttachButton`. The moment a chip is actually constructed, the right operand of `||` is evaluated and the module throws `ReferenceError: busy is not defined` *inside the render body*, before React gets a return value. The InputZone slot-level error boundary catches it and unmounts the **whole slot entry**, so the entire dock disappears — the filename span, the `x` button and the dock's own `div` were never committed. Nothing else is affected because the attach button is a *different* slot entry with its own boundary. The v0.2.11 hover-preview lines are inert on this path and are not the cause; they are, however, the reason the chip subtree is now constructed and read in every plain-phase render, which is what finally exercised a reference that was already dangling.

---

## 1. Exact root cause

### 1.1 The throwing expression

In `lib/client.js` (shipped v0.2.10 excerpt, line 34):

```js
function AttachButton(props) {                                // <- wrong home
  const [busy, setBusy] = React.useState(false);              // <-- busy lives HERE
  ...
}

function AttachmentChips(props, className) {                  // <- busy is NOT in scope here
  const occurrences = (props.input?.occurrences ?? []).filter(item => item.source === SOURCE);
  if (occurrences.length === 0) return null;                  // (gate A: empty dock exits here)
  return h('div', { className }, ...occurrences.map(occurrence => {
    ...
    h('button', {
      type: 'button',
      className: 'remove',
      disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,   // *** throws
      onClick: () => props.remove(occurrence),
    }, 'x'));
  }));
}
```

`busy` resolves through the scope chain: `AttachmentChips` → module scope → global scope. `AttachButton`'s `useState` cell is a **closure-local** of a different function invocation; it is unreachable from `AttachmentChips`. There is no module-level `busy`, no import named `busy`, and every other identifier on that line (`props`, `h`) is bound. `?.` and `??` earlier in the line cannot save it: optional chaining guards `null`/`undefined` **values**, never an *unresolvable binding*. So the expression is a **free identifier**: syntactically legal, statically invisible, and fatal at evaluation time.

### 1.2 Why it throws only when a chip renders (two independent gates)

```
| occurrences | props.input.phase              | is busy evaluated?                              | outcome                                       |
|-------------|--------------------------------|-------------------------------------------------|-----------------------------------------------|
| 0           | any                            | never — return null at gate A                   | dock renders nothing (looks "normal")         |
| >=1         | 'streaming'/'submitting'/...   | no — left operand true, || short-circuits       | button renders disabled, no error             |
| >=1         | 'plain', or props.input absent | yes — left operand false                        | ReferenceError -> slot entry unmounted        |
```

* **Gate A — the `map` never runs.** The `h('button', ...)` call, and therefore the `disabled` expression, lives *inside* `occurrences.map(...)`. With zero pending attachments the function returns `null` on line 23 and the throwing argument is never built. This is why the empty dock is indistinguishable from a working dock, and why every "does the dock mount?" check passes.
* **Gate B — `||` short-circuit.** `(phase !== 'plain') || busy` evaluates its right operand only when the phase guard is **false**, i.e. only in the idle/plain composer (or when the slot passes no `input.phase` at all, in which case `?? 'plain'` manufactures `'plain'`). While the composer is locked the line reads as a perfectly working guard, and the dangling token is *dead code on that branch*.

Both gates are needed for the bug to be silent: A hides it from empty-state tests, B hides it from the locked-composer path and from code review ("`busy` looks like it belongs to the button next door").

### 1.3 Why the `||` kept it latent through v0.2.10

`||` is not a safeguard; it is a **conditional dead reference**: the token exists in the shipped file but is unreachable in every state the release was exercised in.

* The shipped v0.2.10 excerpt (`plugin-dock-chips.js:33-34`) states in-line that the *hardening pass* added both the phase guard and "this busy reference". The guard was introduced to keep the remove button inert while the composer is busy — i.e. the guard's whole purpose is the **truthy** branch. The author therefore validated exactly the branch that short-circuits, and the falsy branch (idle chip, the only branch that reads `busy`) was never constructed in a build where it mattered.
* The empty dock (`return null`) covered the remaining traffic: a user who never attached anything in an idle composer never reached the line.
* Because the reference is a *binding* error, it produced no build warning, no import error, no `node --check` failure, and no server-side symptom — its only signature is one console line in a browser at render time.

**Net**: v0.2.10 shipped a line that was one state transition away from throwing; v0.2.11 (a) added an extra read at the top of the same function and (b) added a new child element, so the chip subtree is built on every occurrences change. The first pristine plain-phase chip render then stepped onto the dead branch. Nothing in the *feature* had to be wrong for the regression to appear in the feature's release.

### 1.4 Why the symptom is "the whole dock vanished", not "the remove button is broken"

1. **The throw is in the component body, not in a callback.** `h('button', { disabled: ... })` evaluates its props object *while the component is computing its output*. React never receives a return value for that render, so there is no partial commit: filename span, hover card and button are discarded together. A throw inside `onClick` instead would have been caught per-event and would have looked like "the x does nothing" — a completely different bug report.
2. **The nearest boundary is the slot's, and it wraps the entry.** Per the host's slot contract (the same mechanism recorded in card **DSH-0.1.7-A1-01**: a render throw makes the slot-level error boundary unmount the *whole* slot entry, silently), the boundary substitutes its fallback for the whole InputZone / `conversation.input` contribution. The unit of failure is the entry, not the chip.
3. **`AttachmentChips` is called as a plain function from `AttachmentDock`** (`return AttachmentChips(props, 'dock')`), not mounted as `h(AttachmentChips, props)`. There is no child fiber to isolate, so the exception surfaces as "`AttachmentDock` threw" — no component in the chain can catch it locally, and any future attempt to put a boundary *around the chip* requires the component to be an actual element first.
4. **Boundary captures are console-only.** In production the boundary logs (minified) and renders nothing user-visible: no banner, no toast, no failed request. That matches the report exactly — "nothing else looks broken, no error banner".
5. **The neighbours are separate entries.** The `input.left` attach button has its own registration and boundary; the paste pipeline lives in the host composer, not in this component. Hence: paste works, `+` works, chip gone.

### 1.5 One more identifier hazard in the same hunk (must be fixed with it)

The pasted diff also introduces, at **function scope**:

```js
const imageItem = status !== 'missing' ? record?.items.find(item => isImagePath(item.path)) : undefined;
```

`status` and `record` are `const`-declared **inside** the `map` callback two lines below, so at this position they are unbound. In a browser `status` may accidentally resolve to the legacy `window.status`, which returns `''` and therefore *passes* the `!== 'missing'` test — the worst possible outcome, because it silently enters the branch that then touches the unbound `record`. This is the same defect class as `busy`, and it is why the fix below *moves* the read into the callback and uses `(record?.items ?? [])`. Practical consequence for triage: whichever identifier the user's console names, the class and the fix are identical, and the token-level bisect of §2 still isolates the cause.

Note the ambiguity is itself a finding: `fixture/plugin-dock-chips.js` (the shipped v0.2.10 excerpt) already contains `|| busy`, while `fixture/feature.diff:32-33` presents the same token as a `-`/`+` change. The two artefacts cannot both be literally right. Rule applied here: **the packed/shipped artefact outranks a reconstructed diff** (see §6).

---

## 2. Why "the v0.2.11 diff did it" is the wrong first conclusion — and the correct bisection

### 2.1 Why the intuition is so strong (and still wrong)

* Temporal adjacency: symptom first reported on the release that touched the failing component.
* Spatial adjacency: the throw lands in a file the diff rewrote, in a hunk the diff touched.
* The diff *does* add an unguarded read next to the crash (§1.5), so a superficial read "confirms" it.

All three are circumstantial. What is missing is the one thing a bisect must have: **the identity of the throwing token**.

### 2.2 What the evidence actually says

| Observation | Reading |
|---|---|
| The thrown error is a `ReferenceError` naming an identifier (`busy`), not a `TypeError` on data | binding resolution, not feature data shape |
| `busy` appears in the **shipped v0.2.10 file** (`plugin-dock-chips.js:34`, in-line note says the v0.2.10 hardening pass added it) | the token predates the feature |
| Every hover-preview addition is *inert* on the failing path: the throw is raised while building the `disabled` prop, so `data-image`, `onClick`, `hover-card`, `img`, `openImageViewer`, `objectUrlOf` are never reached | feature code did not execute |
| The crash needs no v0.2.11 line to reproduce (§2.3 step 4) | latent, first exercised |
| `node --check` and any bundler pass on both versions | class of defect is invisible to static checks |

### 2.3 The correct bisection (cheapest first; a 2x2, not a linear walk)

1. **Read the console, not the changelog** (30 s, no rebuild). One paste in a dev build gives `ReferenceError: busy is not defined` plus the frame (`AttachmentDock` -> `AttachmentChips` -> the `h('button')` call). The *identifier name* is the whole triage: it is not a name the feature introduced.
2. **Token-level revert on v0.2.11** — keep every hover line, delete only ` || busy`. Chip renders => the token, not the feature. Do not revert the feature first: that is the expensive, misleading move, and it would also "work", which is exactly how the wrong conclusion gets locked in.
3. **Feature-level revert, token kept** — delete the `imageItem` block, `data-image`, `onClick`, `hover-card`; keep `|| busy`. Still crashes => feature exonerated.
4. **Minimal render mount against the *pre-v0.2.11* file alone** — mount `AttachmentChips({ input: { phase: 'plain', occurrences: [oneOccurrence] } }, 'dock')` in jsdom, with `records` holding a record for the ref, and an error boundary that records captures. It throws the same `ReferenceError` with zero v0.2.11 code on disk. This is the decisive experiment: the defect is reproducible in the version that "worked".

The 2x2 that settles it:

| build | hover lines | busy ref | chip, plain phase | expected |
|---|---|---|---|---|
| v0.2.10 as shipped | absent | present | yes | **throws** (latent bug proven) |
| v0.2.11 | present | present | yes | throws |
| v0.2.11 - hover lines | absent | present | yes | **throws** (feature exonerated) |
| v0.2.11 - busy ref | present | absent | yes | **renders** (token is the cause) |

Caveat that keeps this honest: a *history* bisect between v0.2.10 and v0.2.11 has one commit and answers nothing; and a `git blame`/diff-shaped bisect answers "which commit wrote the line", a different question from "which line throws". The bisect that matters is over **tokens exercised by a data-present render**, not over commits.

### 2.4 Evidence that distinguishes "new feature crashed the slot" from "old latent bug first exercised now"

* **The unbound name is absent from the feature's vocabulary.** A feature bug names the feature's own symbols (`isImagePath`, `objectUrlOf`, `record.items`). A latent bug names an identifier the diff never introduced and the shipped baseline already contained.
* **Removing the feature does not remove the crash** (2x2 row 3); **removing the token does** (row 4).
* **The crash is reachable at baseline**: same exception, same frame, in a harness that never loads the new file.
* **The state that fires it is not a new state.** Plain-phase-with-one-pending-attachment existed in v0.2.10; only the *probability* of constructing the chip subtree in that state changed.
* **Severity is stable across releases**: a `ReferenceError` has no data-dependent variants. If the new feature were at fault you would see it vary with image vs non-image attachments, with `status` values, with `ref` hits and misses. Correlation with the phase (plain vs locked) and with the presence of *any* occurrence — independent of image-ness — is the fingerprint of the pre-existing line.

---

## 3. The fix

### 3.1 Minimal, correct patch (keeps the feature, removes the dangling reference)

```js
function AttachmentChips(props, className) {
  const occurrences = (props.input?.occurrences ?? []).filter(item => item.source === SOURCE);
  if (occurrences.length === 0) return null;
  const locked = (props.input?.phase ?? 'plain') !== 'plain';   // hoisted once, plain data
  return h('div', { className }, ...occurrences.map(occurrence => {
    const record = records.get(occurrence.ref);
    const status = record?.status ?? 'missing';
    // moved INSIDE the callback, where record/status are actually bound
    const imageItem = status !== 'missing'
      ? (record?.items ?? []).find(item => isImagePath(item.path))          // no bare .items
      : undefined;
    return h('div', {
      className: 'chip',
      'data-status': status,
      'data-image': imageItem === undefined ? undefined : '1',
      key: occurrence.occurrenceId,
      onClick: imageItem === undefined ? undefined : event => {
        if (event.target.closest?.('.remove')) return;                      // optional-chained
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
        disabled: locked,                                                   // <- the fix
        onClick: () => props.remove(occurrence),
      }, 'x'));
  }));
}
```

Two acceptable variants of "remove or scope it":

* **Remove** `|| busy` (above): correct if the lock is purely a composer-phase concern — the chip has no legitimate view of the *button's* upload state, and `props.input.phase` already covers "composer locked".
* **Scope it properly**: if the pending-upload lock really must reach the chip, lift it out of `AttachButton`'s local state into the shared store that `useRevision()` already subscribes to (read it at the top of `AttachmentChips`), or pass it down as an explicit prop (`props.busy` with `?? false`). Never rely on a same-file neighbour's `useState` — sibling components do not share closures.

Also promote it from "works" to "cannot silently regress": an `eslint no-undef` rule (§5) flags this line regardless of which branch is executed.

### 3.2 The two hardening patterns the diff should also get

| Pattern | Where | Why it is cheap insurance in slot components |
|---|---|---|
| `record?.items ?? []`-style defensive reads | the new `imageItem` lookup; any `records.get(...)` consumer | A `records` entry is *asynchronous*: it is populated after the upload/file-registration resolves, and the dock re-renders from `useRevision()` on every store tick. So "chip exists, record does not yet" is a normal transient state, not an error. `record?.items.find` still throws `TypeError` when the record exists but `items` is undefined/not loaded; `(record?.items ?? [])` degrades to "no preview", the correct user-visible behaviour for a chip whose bytes are not ready. In a slot component one bad field must degrade a chip, never unmount an entry. |
| `event.target.closest?.()` | the new chip `onClick` | `event.target` is not guaranteed to be an `Element`: a click on a text node (bubbled as the parent in most browsers, but not universally across synthetic/portal paths), on an SVG child in some engines, or from a programmatic `dispatchEvent`/test harness can hand you a `Node`/`window`/`document` without `closest`. Without `?.` that is a `TypeError` **inside an event handler that lives in the same slot entry** — one stray click can take the dock down in exactly the same invisible way. `?.` costs nothing at runtime and turns a crash into a no-op. |

General principle for slot code: **defensive reads at every data edge, optional chaining on every event target, and no expression that can throw while building the element tree.** The element tree is the least forgiving place in the system to throw, because the penalty is an entire entry, not a degraded chip.

---

## 4. The regression that would have caught this before release

Requirement: **mount the dock/chip WITH an occurrence present, inside a recording error boundary, and assert the chip renders without a capture.** The empty state is worthless here — `return null` on line 23 executes before the throwing line, so an empty-dock smoke passes on the broken build.

```js
// test/dock-chips.render.test.js  (vitest + jsdom; same h() hyperscript the plugin ships)
import { expect, test, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';   // or react-dom/client + act
import React from 'react';

const REF = 'occ-1';
const SOURCE = 'attach-input';            // the plugin's own occurrence source

function mountDock(AttachmentDock, input) {
  const captured = [];
  class SlotBoundary extends React.Component {                  // mimic the host's slot boundary
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    componentDidCatch(error) { captured.push(error); }
    render() { return this.state.failed ? null : this.props.children; }
  }
  const view = render(React.createElement(SlotBoundary, null,
    React.createElement(AttachmentDock, { input, remove() {} })));
  return { view, captured };
}

test('a pending attachment renders a chip in the plain phase (no boundary capture)', () => {
  records.set(REF, { status: 'ready', label: 'shot.png', items: [{ path: 'shot.png', file: new Blob() }] });
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  const { view, captured } = mountDock(AttachmentDock, {
    phase: 'plain',                                   // <- the branch the || short-circuits around
    occurrences: [{ occurrenceId: REF, ref: REF, source: SOURCE, label: 'shot.png' }],
  });

  expect(captured).toHaveLength(0);                   // <- the error-boundary assertion
  expect(errorSpy).not.toHaveBeenCalled();            // <- console-only crash signature
  const chip = view.container.querySelector('.dock .chip');
  expect(chip).not.toBeNull();                        // <- what the user lost
  expect(chip.querySelector('.name').textContent).toBe('shot.png');
  expect(chip.querySelector('button.remove')).not.toBeNull();
  errorSpy.mockRestore();
  cleanup();
});
```

Make it a small matrix, because the two gates in §1.2 are the reason a single case can pass on the buggy build:

| case | occurrences | phase | assertion |
|---|---|---|---|
| empty dock | `[]` | `plain` | renders `null`, **no** capture (documents the empty state; not the regression test) |
| **pending chip, idle** | 1 | `'plain'` | chip + filename + `x` present, zero captures <- **the case that was missing** |
| pending chip, locked | 1 | `'submitting'` | chip present, `x` **disabled**, zero captures (guards the hardening intent behind the guard) |
| record not yet loaded | 1 | `'plain'` | chip with `data-status="missing"` and no preview, zero captures (guards the `record?.items ?? []` hardening) |
| remove click | 1 | `'plain'` | `props.remove` called with the occurrence (guards the "button broken" class too) |

Two meta-assertions worth wiring in:

* **Boundary capture is the failure oracle**, not just "element found": `captured.length === 0` distinguishes "rendered" from "the slot silently swallowed an entry that happened to be empty".
* **A coverage guard**: enumerate every slot key / exported component in the plugin manifest (`input.left`, the InputZone occurrence, and anything added later) and fail CI if one has no data-present render test. That is the check that prevents the *next* slot from repeating this.

---

## 5. Release-process lesson

### 5.1 Why `node --check` was insufficient

`node --check` parses. A bare identifier is **valid syntax** — `x = y || undefinedThing` is a well-formed program. The rule broken here is *binding resolution*, checked at **evaluation time**, not parse time:

* not a syntax error -> `node --check` passes;
* not a module-load error -> `import`ing the file never evaluates `AttachmentChips`'s body;
* not a type error -> untyped `lib/client.js` (no `// @ts-check`, no `checkJs`) has no surface that sees `busy` as unbound rather than "some global";
* not a bundler error -> the build marks `react` external and ships `lib/client.js` largely as authored; a minifier will happily rename or pass through free identifiers without complaint;
* not a server-side error -> the plugin is **lib-only**: nothing on the host's Node path imports the component, so `require()`ing the package for a smoke check never touches render code.

And the failure needs a **conjunction** only a browser supplies: the right slot registered, at least one occurrence of the plugin's source present, `phase === 'plain'`, and a real render pass. No static check reaches that conjunction; only mounting with data does.

The deeper process fault: the gate was shaped for a *server* plugin (does it parse, does it import, does the host boot) and applied to a *render-time UI* artefact. The gate must match the surface that can fail.

### 5.2 Minimum viable pre-ship check for slot-rendering lib-only plugins

Ordered cheap -> expensive; anything short of 1-3 is not a gate, it is a hope:

1. **Static, on the shipped entry**: `node --check` **plus** `eslint` with `no-undef` (and a correct `globals`/env for the client bundle). `no-undef` is a one-rule catch for *this exact bug*, costing seconds. Add `no-unused-vars` so a `busy` that loses its only real consumer is also visible.
2. **Lint and test the packed artefact, not the source tree**: `npm pack` -> install the tarball into a scratch profile -> run the render smoke against `node_modules/@org/dsh-attach-input/lib/client.js`. The file that ships is the file that crashes; `src/` tests are a different program.
3. **Data-present render smoke, per slot** (the §4 matrix): jsdom + `react-dom/client`, every registered slot key mounted at least once with representative data, inside a recording boundary, asserting `captured.length === 0`. Empty-state-only coverage is explicitly **out of scope** as evidence.
4. **Coverage guard**: manifest slot keys <-> render tests at 1:1; a new slot without a data-present test fails CI.
5. **One real-host mount before tagging** (skill validation layers 4-5, and the verification triad in card **DSH-0.1.7-A1-01**): cold-start a profile, mount the dock with one pending attachment in a driven browser, and assert all three — the surface's DOM marker is present, **zero** "slot entry crashed" console records, and the expected requests fire. A bare HTTP 200, a CSS-load check, or a clean boot log are all false negatives for this class.

Release note for the process doc: **`node --check` proves a file is a program, not that a component can render.** For a lib-only plugin whose only real surface is a slot entry, the minimum viable gate is "one render, with data, inside a boundary, on the packed file, per slot".

---

## 6. Evidence conflicts and residual uncertainty (reported, not silently resolved)

| # | Conflict | Handling |
|---|---|---|
| E1 | `fixture/plugin-dock-chips.js:34` (shipped v0.2.10) already contains `|| busy`, with an inline comment attributing it to the v0.2.10 hardening pass; `fixture/feature.diff:32-33` presents the same token as added by v0.2.11 | The shipped artefact outranks a reconstructed diff, which is not a trustworthy change record for this line (it also re-emits otherwise-unchanged object-literal content). Both readings leave the **fix, the 2x2 bisect and the regression test unchanged**; only the blame sentence moves. Action: reconcile the public post-mortem against the packed v0.2.10 tarball |
| E2 | The diff's `imageItem` line sits at function scope where `status`/`record` are unbound; in a browser `status` may resolve to `window.status` (`''`) and pass the `!== 'missing'` test, after which `record` throws | Same defect class as §1.1. Whichever identifier the deployed console names, the fix (§3.1) removes both. Flagged so the patch is not "minimal" in the wrong way |
| E3 | v0.2.10 users reportedly "used the x button fine" while §1.3 argues the token was one branch away | Not resolvable statically: it depends on when the v0.2.10 dock feed constructed a chip in the plain phase. Resolved by experiment §2.3 step 4 (mount the v0.2.10 file alone with one occurrence). No claim is made beyond "reachable on the falsy branch" |
| E4 | No browser was available in this evaluation; nothing was reproduced (read-only, no installs) | The mechanism follows from evaluation order and scope, both deterministic in the excerpt. Reproduction steps are specified in §2.3 and §4 as the confirmation path |

---

## 7. Skill-shaped close-out (plugin-upgrade, Mode A)

**Pre-existing (baseline)**: not collected — Mode A, no baseline run, and the evaluation forbids builds/installs. What was collected instead: byte-level fixture identity (§8).

**Completed**
* Read the whole evidence pack (4 files) and the shipped v0.2.10 code path end to end.
* Root cause pinned to a single expression and a single unbound identifier; both silence gates (empty-dock early return, `||` short-circuit) identified with a state table.
* Slot-boundary semantics explained against the host contract; corroborated by card **DSH-0.1.7-A1-01** (same mechanism: slot-level boundary unmounts the whole entry; console-only signature; whole surface silently vanishes).
* Bisection redesigned as a token-level 2x2 plus a baseline render mount; the "diff did it" hypothesis falsified on five independent observations.
* Fix, two hardening patterns, and a data-present render regression specified as code.

**Skipped (with reason)**
* Reproduce / build / install / `git bisect`: out of scope for a read-only, no-install evaluation.
* Host version-corridor checks: this is a plugin-internal defect, not a compatibility break; no card beyond the mechanism reference applies (no host API, composition, or dependency angle).

**Pending / residual risk**
* Nothing verifies the patched v0.2.11 until the §4 test exists and the §5.2 gate is wired into the release.
* The chip's `onClick` still calls `objectUrlOf(imageItem.file)` at **render** time inside the `img` `src` — a per-render blob-URL allocation. Not a crash, but a leak/perf risk in a hot slot; recommend caching per occurrence and revoking on unmount.
* `AttachmentChips` being invoked as a plain function (`AttachmentChips(props, 'dock')`) blocks any local error boundary and would break if the component ever needs a hook. Recommend `h(AttachmentChips, props)` so React owns the fiber and a chip can be isolated from the entry.

**Rollback**: no writes outside this report; the fixture was opened read-only and is unchanged (§8). Nothing to roll back.

**Recommendations**
1. Ship the fix as v0.2.12 with the §4 render smoke in the same PR (test first; confirm it fails on v0.2.11 *and* on v0.2.10 — the second run is the proof that the bug predates the feature).
2. Add `eslint no-undef` to the release gate on the packed `lib/client.js`.
3. Add the slot <-> test coverage guard; make "empty dock only" coverage an explicit review reject.
4. Correct the public post-mortem: the hover preview did not cause the defect; it changed the render frequency that exposed a v0.2.10 hardening-pass line. Publishing "the feature crashed it" would teach the wrong lesson and leave the `no-undef` / render-smoke gap open.

---

## 8. Read-only evidence baseline (fixture identity, SHA-256 head)

```
feature.diff          1703 B  95C131250ECFA734...
plugin-dock-chips.js  1973 B  5A1E75C62265EAFB...
README.md              734 B  95BD395A400BAE5D...
user-thread.md        1142 B  CE124526A60A6566...
```

All four files were read only; no command in this session wrote to `fixture/`, and no build, install, migration, network call, or `git` command was executed.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.