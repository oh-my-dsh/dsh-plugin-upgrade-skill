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

# S15 · Vanishing Dock Chips — Root-Cause, Bisection, and Fix Report

**Subject**: `@org/dsh-attach-input` v0.2.11 — pending-attachment chip (dock) disappears after a paste; paste and attach button unaffected; no UI error.
**Evidence base (read-only fixture)**: `plugin-dock-chips.js` (v0.2.10 as shipped), `feature.diff` (v0.2.11 hover-preview diff), `user-thread.md` (issue #, user `mirren`). Skill grounding: `plugin-upgrade` references DSH-0.1.7-A1-01 (slot-entry render crash → whole entry unmounts, console-only) and the DSH-0.1.6-A2 dock entry ("a co-tenant dock entry's chips stopped rendering with it").
**Scope**: diagnosis and planning only. Nothing in the fixture was modified; no migrations or installs were executed.

---

## 1. Root cause

### The throwing expression

```js
// AttachmentChips, remove button (v0.2.10 lib/client.js:34)
disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy   // <-- busy is undefined here
```

`busy` is a **free identifier inside `AttachmentChips`**. It belongs to a *different* component: `AttachButton` declares `const [busy, setBusy] = React.useState(false)` as a **function-scoped** local (line 7). Lexical resolution from inside `AttachmentChips` walks component scope → module scope and finds no binding for `busy` (the module's legitimate free identifiers — `SOURCE`, `records`, `h`, `useRevision`, `openImageViewer`, … — do exist at module scope; `busy` is not one of them). In the strict-mode ESM module the plugin ships, evaluating the reference throws **`ReferenceError: busy is not defined`**.

This is a dangling reference left behind by the v0.2.10 "hardening pass": the pass wanted the remove button disabled while the input was not in its `plain` phase and mechanically wrote `phase-guard || busy` by copying the `AttachButton` disabled expression — while `AttachmentChips` has no way to see `AttachButton`'s state.

### Why it throws only when a chip renders

`AttachmentChips` guards its whole body with an early return:

```js
const occurrences = (props.input?.occurrences ?? []).filter(item => item.source === SOURCE);
if (occurrences.length === 0) return null;                        // line 23 — bailout
return h('div', { className }, ...occurrences.map(occurrence => { // line 24
  ...
  h('button', { ..., disabled: (...) !== 'plain' || busy, ... })   // expression built HERE
```

The `disabled` prop expression is only *constructed* inside the `.map()` callback — i.e. only when `occurrences.length > 0` for this plugin's `SOURCE`. With an **empty dock** the function returns `null` at line 23; the button object literal is never built, `busy` is never read, nothing throws. The user's paste creates exactly the occurrence (`source === SOURCE`, phase still `plain` on the idle input), the map runs, the reference is read, and the render pass dies.

### Why the `||` short-circuit kept it latent

`A || B` evaluates **B only when A is falsy**. Here `A = (props.input?.phase ?? 'plain') !== 'plain'`:

| input phase | `A` | `busy` evaluated? | result |
|---|---|---|---|
| non-`plain` (attach flow active: menu open, upload in flight, drag/locked states) | `true` | **no** — short-circuit | no crash, dock renders, button disabled by the phase guard alone |
| `plain` (idle input, chip parked at rest) | `false` | **yes** | `ReferenceError: busy is not defined` |

So the reference was *reach* only on the plain-phase branch, and the crash required a narrow **data+state cell: an occurrence present × input phase `plain`**. Every state in which an attachment is actively being added hides the term behind the short-circuit; the load-bearing cell — the chip sitting at rest on an idle input — is the state v0.2.11 made routine (a hoverable, clickable, idle thumbnail chip). No v0.2.10 gate ever executed the component *with data present*, so the line shipped, linters-without-`no-undef` passed it, `node --check` passed it, and it sat dormant. Any v0.2.10 user who did hit the same cell would have seen the *same* silent dock-unmount (console-only, no banner) — there was simply nothing to report, or nothing to connect it to. This is an old latent bug **first exercised now**, not a new feature breaking the slot.

### Why the symptom is "the whole dock vanished", not "the remove button is broken"

The throw happens while *constructing the dock's render tree* — inside the `occurrences.map(...)` argument list of the dock `h('div', …)`. The error propagates out of `AttachmentChips` → `AttachmentDock`'s render, into the **slot-level error boundary the framework wraps every slot entry with**. React semantics apply: a render throw means **nothing** from that render pass is committed; the boundary then unmounts the **entire entry subtree** and logs one console error. Consequences, all matching the report:

- The dock's *entire* self goes — chips, filenames, remove buttons (and in v0.2.11 the hover cards). There is no partial-render state where "everything renders but the button", so the user can never perceive a broken remove button; the surface is simply gone.
- The failure is **console-only**: the boundary catches, `console.error`s, and unmounts — no app crash and no error UI, exactly as documented in DSH-0.1.7-A1-01 ("the user-visible symptom is an entire surface (dock, header widget) silently vanishing with one minified console error and no request failures"), including the verbatim signal: `slot entry crashed`.
- The **paste flow keeps working**: attachment acceptance lives in `AttachButton` (`props.add`), mounted as a *separate* slot entry (`input.left`). The boundary is per slot entry — one entry's crash cannot take down the other entry, and cannot take down its own partially. Hence "+ still there, message still sent, dock gone."
- The maintainer thread confirms the intended read: "a slot entry that throws during render is caught by the framework's error boundary and unmounted (the error is only visible in the browser console, which users never open)."

---

## 2. Why blaming the v0.2.11 diff is the wrong first conclusion

The instinct "it broke right after the hover-preview release, and that release touched `AttachmentChips`" is **recency bias with a same-component confound**. Two specific traps make the diff *look* guilty:

1. **The diff genuinely edits the buggy neighborhood** (it re-writes the remove-button object to add the hover card), so the eye lands on it.
2. **The `disabled` hunk naively reads as an addition**: `- disabled: (phase guard)` → `+ disabled: (phase guard) || busy`, which suggests v0.2.11 *introduced* the `busy` term. But the shipped artifact — the v0.2.10 bundle users actually ran — **already contains that exact line**, comment included ("v0.2.10 hardening pass added the phase guard — and this busy reference"), and the maintainer thread says the same. The diff text therefore **contradicts the released artifact on this line**; whichever side wrote that hunk, the built artifact is the ground truth, not the diff. This is exactly why a diff is evidence, but not verdict.

### The correct bisection

1. **Reproduce without the feature**: minimal render mount of `AttachmentChips`/`AttachmentDock` with ONE occurrence, `phase: 'plain'` — no hover-preview code anywhere in the path. It throws `ReferenceError: busy is not defined` at the remove-button line. Mount with `occurrences: []` → returns `null`, no throw. This alone proves the fault line predates and is independent of the feature.
2. **Rollback / re-add bisect**: install the **v0.2.10** build in a scratch profile, mount with a chip present → **still crashes** ⇒ the feature did not introduce the crash. Then take the v0.2.10 baseline **with the `busy` term removed**, apply `feature.diff` on top → dock + hover preview render fine ⇒ the feature is innocent and the single guilty term is the pre-existing `busy` reference. (Equivalent faster pair: v0.2.11 plus a one-token deletion of `|| busy` → green; any combination *containing* the term in the chip path → red.)
3. **Confirm against the user's console**: the captured error names `busy`; the stack frame is the remove-button `disabled:` line in the map callback (a v0.2.10-era line), and **no frame or symbol mentions any hover-preview code** (`imageItem`, `isImagePath`, `openImageViewer`, `objectUrlOf` all appear nowhere in the failure).

### Evidence that distinguishes "new feature crashed the slot" from "old latent bug first exercised now"

| test | if the feature caused it | if the latent bug was first exercised |
|---|---|---|
| mount **v0.2.10** with chip + plain phase | no crash | **throws `busy is not defined`** |
| ReferenceError **symbol** in the console | names a new symbol (`imageItem`/`openImageViewer`/…) | names **`busy`** — untouched by the feature logic |
| paste a **non-image** file under v0.2.11 | hover path never runs → no crash | **still crashes** — hover `imageItem` is `undefined`, irrelevant; only the chip render matters |
| delete `|| busy` on the v0.2.11 tree | feature still broken (other cause) | dock **and** hover preview both work |
| data condition of the throw | depends on image items | depends on **occurrence × plain phase** — orthogonal to images |

The observed evidence (v0.2.10 mount crashes; error names `busy`; non-image pastes crash too; deleting the term fixes it) selects the right-hand column: **an old latent bug, first exercised by the v0.2.11 workflow.**

---

## 3. The fix

**Primary fix — remove the dangling reference** (or, if "disable remove while an attach op is in flight" was truly intended, *scope it properly*: lift the busy flag into shared state — the occurrence/session store or a plugin context hook — and read `props.busy`/context in `AttachmentChips`; a sibling component's `useState` local is structurally unreachable). The phase guard alone is the correct, sufficient gate for this button:

```js
disabled: (props.input?.phase ?? 'plain') !== 'plain',
```

Two hardening patterns the diff should also get (cheap insurance specific to slot components):

1. **Defensive record reads — `record?.items ?? []` before `.find`:**
   ```js
   const imageItem = (record && status !== 'missing')
     ? (record.items ?? []).find(item => isImagePath(item.path))
     : undefined;
   ```
   Occurrence records cross the plugin boundary at every lifecycle stage (`missing`, uploading, ready, failed); a record that exists but carries no `items` (or an unexpected shape) makes `record?.items.find(...)` a `TypeError` — one more way to lose the whole entry to the boundary. `?? []` degrades that to "no thumbnail".
2. **Optional-chained DOM calls — `event.target.closest?.('.remove')`:**
   ```js
   onClick: event => {
     if (event.target.closest?.('.remove')) return;
     openImageViewer({ src: objectUrlOf(imageItem.file), name: imageItem.path });
   }
   ```
   `closest` exists on `Element` only; `event.target` may be a non-Element node (SVG internals of the thumbnail, a text-ish target), turning the guard itself into a crash inside a handler whose only job is "did you click the x".
3. Also fix the diff's scoping defect as written: it computes `imageItem` from `status`/`record` *outside* the `.map()` callback where those per-occurrence bindings do not exist (they are `const`s inside the callback) — the computation must live inside the callback, per occurrence, as sketched above.

**Why this insurance is cheap and worth it in slot components**: slot entries are host-mounted islands rendering data the plugin does not control, and the failure mode is asymmetric — one unguarded property read doesn't break a button, it **unmounts the entire entry** (whole dock), while the user sees *nothing* in the UI and only a minified console error exists. `?? []` and `?.()` are single-token edits that convert "entire surface silently gone + support ticket" into "one chip lacks its thumbnail". DSH-0.1.7-A1-01's `*16`-rename and the 0.1.6 dock-entry cards are the same lesson at host-boundary scale.

---

## 4. The regression that would have caught this

A **render smoke that mounts the dock/chip component WITH an occurrence present** — not the empty state:

```js
// dock-chips.render.smoke.test.jsx  (jsdom + the same renderer; no browser needed)
test('AttachmentDock renders a chip with an occurrence present (plain phase)', () => {
  const input = { phase: 'plain', occurrences: [
    { source: SOURCE, ref: 'r1', occurrenceId: 'o1', label: 'screenshot.png' },
  ]};
  records.set('r1', { status: 'ready', label: 'screenshot.png', items: [] });
  const screen = render(h(AttachmentDock, { input }));

  expect(screen.container.querySelector('.dock .chip')).toBeTruthy();      // DOM marker present
  expect(screen.container.querySelector('.chip .name').textContent)
    .toBe('screenshot.png');                                              // label renders
  expect(screen.container.querySelector('.remove').disabled).toBe(false); // gate OK at plain phase
  expect(boundaryFallbackMounted).toBe(false);                            // no error-boundary capture
  expect(consoleErrors).toEqual([]);                                       // zero 'slot entry crashed' records
});
```

Required variants (each a separate mount, each asserting no boundary capture and zero crashed-console records):

- **record present / record missing** (`records.get → undefined`, status `missing`) — both render paths;
- **record present without `items`** — locks in the `?? []` hardening;
- **v0.2.11 additions**: record **with an image item** (hover-card/`data-image` present), and a click whose `event.target` is a non-Element node — locks in `closest?.()`;
- Interaction: remove-button click calls `props.remove`; chip-body click opens the viewer only when an image item exists.

Two design points make this regression *earn its keep*:

- **It must mount with data.** The empty-dock case returns `null` at the early-return line, so an empty-state smoke passes **vacuously on the broken build** — that is precisely why the bug survived v0.2.10's checks. Assertion direction: the data-present mount must **fail** on the shipped code (proving the test reaches the throwing line).
- **It must assert the boundary contract**, per DSH-0.1.7-A1-01's verification triad: the surface's **DOM marker** is present, **zero `slot entry crashed` console records**, and the expected behavior fires. A "page rendered, no visible error" check has false negatives, because the visible symptom of a slot crash is *absence*. More generally: every registered slot entry gets a data-present render smoke, because empty-state components like this one (`return null` guards) are blind spots by construction.

---

## 5. Release-process lesson

**Why `node --check` was insufficient**: it only *parses*. The shipped module is 100% syntactically valid — `busy` is a perfectly legal identifier at parse time. The failure is a **runtime `ReferenceError` on a free identifier, behind an `||` right operand, reachable only with a non-empty occurrence list and a plain-phase input** — i.e., a property of *executed behavior with data*, not of syntax. For a **lib-only plugin** there is no server entry and no app boot to exercise: nothing in the mechanical gate (`build`, `node --check`, typecheck) ever evaluates the component with occurrence-shaped data, so the only environment where the defect exists is the host browser — which users run, and which never surface the failure in the UI (console-only). Note also that this defect is *not* a typecheck miss either: `busy` typechecks as a valid identifier bind; the one cheap static gate that does catch it is **ESLint `no-undef`** with the module's true globals declared.

**Minimum viable pre-ship check for slot-rendering, lib-only plugins** (all offline, all cheap; run on `prepublishOnly`):

1. **Static scope gate** — ESLint with `no-undef` (proper `env`/globals for the module). Catches free identifiers like `busy` *before anything runs*; zero data required.
2. **Data-present render smoke per slot entry** — mount every slot contribution (here: the dock entry *and* the `input.left` attach button) with representative non-empty data in jsdom/headless, asserting the DSH-0.1.7-A1-01 triad: surface DOM marker present, **zero `slot entry crashed` console records**, expected behavior fires. Components with `return null` empty-state guards must be mounted *through* the guard with data.
3. **For anything behavior-level (clicks/hover/preview)**, the driven-browser assertion of the same triad where feasible — but (1)+(2) are the true floor, and either one alone would have caught S15: `no-undef` flags `busy` at lint time, and the data-present smoke reproduces the exact user symptom in CI instead of in the wild.

**Process posture**: treat "it crashed after version X's release, and X touched this file" as a *hypothesis to bisect against built artifacts*, never a conclusion — v0.2.10's own shipped component, mounted with data, is what refutes it here. And treat any `|| busy`-class copied-guard expression as review poison: when a guard expression is copied between components, its state variables must be re-scoped or deleted in the same commit.

---

### Postscript — fixture integrity

This report was produced strictly read-only: the fixture directory was inspected with read/glob/grep tools only, and the report was written into the designated `agent-output\S15-slot-error-boundary-crash\` path. No migrations, installs, executions, or external service access occurred.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.