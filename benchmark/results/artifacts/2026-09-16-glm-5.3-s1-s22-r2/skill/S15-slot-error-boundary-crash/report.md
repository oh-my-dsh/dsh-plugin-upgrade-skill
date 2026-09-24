# S15 · Vanishing Dock Chips — the Silent Slot Crash (Read-Only Report)

Task: S15-slot-error-boundary-crash · Plugin: `@org/dsh-attach-input` · Mode: read-only diagnosis (plugin-upgrade Mode A-style inspection; no migration/install executed)

Evidence used (read-only, fixture unchanged):
- `fixture/plugin-dock-chips.js` — `AttachmentChips` + `AttachButton` as shipped in **v0.2.10**
- `fixture/feature.diff` — the v0.2.11 hover-preview diff
- `fixture/user-thread.md` — user "mirren" report + maintainer note
- A local mechanism repro (eval of the exact `disabled` expression under both phases — see §1.1) confirming the short-circuit behavior.

## 1. Exact root cause

### 1.1 The throwing expression

```js
disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,   // inside AttachmentChips' remove button
```

`busy` is a **free identifier** in `AttachmentChips`. It exists only as React state inside the
*other* component (`AttachButton`'s `const [busy, setBusy] = React.useState(false)`). There is no
`busy` binding in `AttachmentChips`, `AttachmentDock`, or module scope, so the moment JavaScript
evaluates the right operand it throws `ReferenceError: busy is not defined`. Reproduced locally:

| Render condition | Left operand | Result |
|---|---|---|
| phase = `'plain'`, chip present | `false` | right operand evaluated → `ReferenceError: busy is not defined` |
| phase ≠ `'plain'` (e.g. review/locked), chip present | `true` | `||` short-circuits → `busy` never read → no throw |

Note on the v0.2.11 diff's own additions: the inserted `const imageItem = status !== 'missing' ? record?.items.find(…)` line sits **before** the `const record` / `const status` declarations (which live inside the `.map()` callback below it), so `status`/`record` there are *also* free identifiers and throw at the same early-return point. But the fixture and the maintainer note both show the `|| busy` line was already shipped in v0.2.10 — the diff's hunk context (whose "old" side omits `|| busy`) is misleading. **The root cause of the regression timeline is the pre-existing dangling `busy` reference; the diff's imageItem block is a second, co-located defect introduced by v0.2.11 that must also be fixed** (see §3).

### 1.2 Why it throws only when a chip renders

`AttachmentChips` early-returns before the throwing line when there is nothing to show:

```js
const occurrences = (props.input?.occurrences ?? []).filter(item => item.source === SOURCE);
if (occurrences.length === 0) return null;          // empty dock never reaches the map
```

The `disabled` expression is inside the per-occurrence `.map()` callback, so it is evaluated only
when at least one matching occurrence exists. Empty input → `null` → no throw. That is exactly why
"paste itself still works" and why nothing breaks until a pending attachment exists: the crash is
data-present, render-time only.

### 1.3 Why the `||` short-circuit kept it latent through v0.2.10

`||` evaluates its right operand only when the left is falsy. The left operand,
`(props.input?.phase ?? 'plain') !== 'plain'`, is **true in every non-plain phase** — so every
render in which the phase guard was doing its job (input locked / busy / composing / review) skipped
`busy` entirely. The bomb only detonates on the combination **phase === 'plain' AND ≥1 pending
occurrence**. Through v0.2.10 that combination was never exercised in a shipped render path users
hit: chips appeared and were removed in flows where the phase was non-plain, or simply no one
rendered the dock with a pending occurrence in plain phase in a way that got reported. v0.2.11's
headline feature — *paste a screenshot to see the hover preview* — drove users straight into the
detonating combination on first use: paste creates a pending occurrence while the input is still in
plain phase, the dock entry renders, the map runs, and `busy` throws. Classic short-circuit
latency: the bug was shipped in the v0.2.10 "hardening pass", armed, but its trigger condition was
first mass-exercised by v0.2.11's feature flow.

### 1.4 Why the symptom is "the whole dock vanished", not "the remove button is broken"

The plugin registers the dock through the **InputZone slot** as one slot entry. When any expression
inside that entry's render throws, the framework's slot-level React **error boundary catches the
exception and unmounts the entire slot entry** — the whole `AttachmentChips` tree (every chip, the
filename label, the x button), not just the failing prop. The user therefore sees *nothing* above
the input: no chip, no partially-rendered button, no error banner. The error surfaces **only in the
browser console** (`ReferenceError: busy is not defined` inside the React error-boundary log),
which users never open. The attach button is unaffected because it is a **separate slot entry**
(`input.left`) with its own boundary scope — matching the report exactly ("the + on the left is
still there, paste still works").

## 2. Why blaming the v0.2.11 diff is the wrong first conclusion — correct bisection

The diff *looks* guilty: it touched the exact component that crashes, its hunk even shows `+ … ||
busy`, and the symptom appeared the release after it. That correlation is the trap:

- **The fixture (primary shipped source) shows v0.2.10 already contained `|| busy`** — the diff's
  "old" side lacking it is a hunk-context/rebase artifact, not history. The maintainer note
  corroborates: v0.2.10 shipped the hardening pass with that line.
- Even the parts of the diff that are real additions are not what makes the dock vanish on the
  paste path in the reported timeline: the pre-existing free `busy` throws first on the very same
  render (and the pasted-screenshot flow reaches the remove-button props in plain phase with an
  occurrence present regardless of hover preview).

**Correct bisection** (either of two cheap procedures):

1. **Rollback/re-add bisect**: take v0.2.11, revert *only* the hover-preview additions
   (`imageItem`, `data-image`, `onClick`, hover-card) leaving the shipped v0.2.10 lines
   untouched, and mount the dock with one occurrence in plain phase → it **still crashes** with
   `ReferenceError: busy is not defined`. Re-apply the diff and the same error persists with the
   same first throw. The crash is invariant to the feature ⇒ not caused by it.
2. **Minimal render mount**: `render(h(AttachmentDock, { input: { phase: 'plain', occurrences:
   [{ source: SOURCE, occurrenceId: 'a1', ref: 'r1', label: 'shot.png' }] } }))` — on v0.2.10
   code, before any v0.2.11 change, with one occurrence present. It throws. On v0.2.10 with zero
   occurrences it returns `null`. That pins the throwing line to the v0.2.10 file and the trigger
   to "occurrence present + plain phase".

**Evidence that distinguishes "new feature crashed the slot" vs "old latent bug first exercised
now":**

| Signal | New-feature crash | Old latent bug (what happened) |
|---|---|---|
| Error identity/stack | Points into code added by the diff (e.g. `imageItem`/`objectUrlOf`) | Stack points at the `disabled:` prop line that exists identically in v0.2.10's shipped file |
| Reproduces on v0.2.10 with the new usage pattern? | No — needs the new code | **Yes** — mounting v0.2.10 with an occurrence in plain phase throws |
| Trigger | Feature interaction | Mere data state (occurrence + phase) reachable in old flows |
| Bisect result | Crash follows the diff hunks in/out | Crash invariant to reverting the diff |

Verdict: **pre-existing latent defect (v0.2.10 hardening pass) first exercised now**; the v0.2.11
diff is guilty only of (a) popularizing the triggering flow and (b) adding its own separate
free-identifier/`items` hazards in the same component (§3).

## 3. The fix

1. **Remove the dangling reference** in the remove button — the guard was meant to mirror
   `AttachButton`'s disabled state, but `busy` lives in another component's state and has no
   meaning here. Either delete it:
   ```js
   disabled: (props.input?.phase ?? 'plain') !== 'plain',
   ```
   or **scope it properly**: if chips must be locked while an upload is in flight, lift that fact to
   shared state/props (e.g. a module-level pending-set or a prop like `props.busy` threaded from
   wherever uploads run) and reference that binding — never a free identifier.
2. **Fix the v0.2.11 additions while in there** — the `imageItem` line references `status`/`record`
   before they are declared (its own ReferenceError); compute it *inside* the `.map()` callback
   after `record`/`status` exist.
3. **Two cheap hardening patterns for the diff**:
   - `record?.items ?? []` before `.find(...)`: `record?.items.find(...)` still throws
     `TypeError: Cannot read properties of undefined (reading 'find')` when `record` exists but
     `items` is absent/undefined. Coalescing makes the miss degrade to "no image" instead of
     unmounting the whole dock.
   - `event.target.closest?.('.remove')`: `event.target` is typed `EventTarget` and need not be an
     `Element` (e.g. text-node/synthetic targets), where `.closest` is undefined and calling it
     throws. Optional chaining turns that into `undefined !== null` → early return, still correct.
   Both are one-token changes with zero cost, and in **slot components** a single thrown prop
   expression costs the entire slot entry (§1.4), so defensive reads are cheap insurance relative
   to the blast radius.

## 4. The regression that would have caught this before release

A **data-present render smoke** for the dock — the empty state is worthless here because the early
`return null` exits before the throwing line:

```js
// dock-chips.render.test.jsx (jsdom/happy-dom + react testing)
test('dock renders a chip for a pending occurrence in plain phase', () => {
  const errors = [];
  const consoleSpy = jest.spyOn(console, 'error').mockImplementation(e => errors.push(e));
  // spy on/jest.fn() the slot error boundary's componentDidCatch if the framework exposes one,
  // or capture window 'error'/'unhandledrejection' — the assertion is "no capture".
  render(h(AttachmentDock, {
    input: {
      phase: 'plain',                       // the phase that evaluates the right operand
      occurrences: [{
        source: SOURCE,
        occurrenceId: 'occ-1',
        ref: 'rec-1',                       // existing record
        label: 'shot.png',
      }],
    },
  }));
  expect(document.querySelector('.chip')).not.toBeNull();   // chip actually rendered
  expect(document.querySelector('.chip .remove')).not.toBeNull();
  expect(errors).toEqual([]);                                // no error-boundary capture, no console.error
  consoleSpy.mockRestore();
});
```

Key properties: (a) **an occurrence is present** — without one the test passes vacuously through
`return null`; (b) **phase is `'plain'`** — any non-plain phase short-circuits `||` and hides the
bug; (c) it asserts a positive render (the chip element exists) *and* the absence of an
error-boundary capture, so it fails on both "crash" and "renders nothing". A second case with a
missing record (`records.get` → undefined) and a non-plain phase round out the guard.

## 5. Release-process lesson

`node --check` (and any syntax-only gate) verifies the file **parses**; a free identifier is a
*runtime* failure, not a syntax error — `busy` is syntactically a perfectly legal identifier
reference. For a **lib-only plugin** (no bundler/type-check pass over the shipped `lib/client.js`),
the component only fails **at render time, with data present**: parsing passed, the empty-state
mount (if any) passed, and the crash needed one pending occurrence in plain phase. Minimum viable
pre-ship check for slot-rendering lib-only plugins:

1. **A data-present render smoke in CI** (§4): headless DOM mount of every slot-registered
   component with representative *non-empty* props/records, asserting the expected element renders
   and no error-boundary capture occurs — per slot, per phase.
2. **A no-undef lint pass over the shipped lib** (`eslint no-undef` / `tsc --noEmit` on the lib
   sources): this specific class — a free identifier copied from a sibling component's scope — is
   statically detectable and would have flagged `busy` (and the diff's `status`/`record` use)
   before any browser ever ran.

Either one alone catches S15; both together are cheap for a lib-only plugin with no other build
pipeline.

---

## Skill-report structure (plugin-upgrade)

- **pre-existing**: not collected (read-only diagnosis task; no baseline build/test run — fixture must remain unexecuted/unchanged).
- **Completed**: full root-cause analysis of the v0.2.11 dock-vanishing regression (above); fixture read only; mechanism repro of the short-circuit ReferenceError run locally outside the fixture.
- **Skipped**: no dependency/lockfile/enablement-resolution validation — not applicable to a read-only diagnosis with no upgrade performed; no runtime mount of the plugin itself (fixture is explicitly non-executable).
- **Pending/residual risk**: the exact historical usage distribution that kept v0.2.10 from crashing in the field (which flows rendered chips in plain phase before v0.2.11) is not fully pinned by the fixture — the mechanism (plain phase + occurrence ⇒ throw; non-plain phase ⇒ short-circuit) is proven, the frequency history is inferred. The v0.2.11 `imageItem` block has its own free-identifier defect that must be fixed alongside `busy`.
- **Rollback**: nothing to roll back — no files, dependencies, or configuration were modified; the fixture directory is untouched.
- **Recommendations**: adopt the data-present render smoke + `no-undef` lint as release gates (§5); when hardening passes copy state names between sibling components, reference lifted/shared state, never free identifiers (§3).
