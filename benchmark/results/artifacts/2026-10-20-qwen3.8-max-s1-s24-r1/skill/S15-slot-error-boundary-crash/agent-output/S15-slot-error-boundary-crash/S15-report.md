# S15 · Vanishing Dock Chips — the Silent Slot Crash

Plugin: `@org/dsh-attach-input` (community Web plugin, lib-only: it ships slot components, no app of its own)
Symptom: after v0.2.11 (hover-preview release), pasting a screenshot no longer shows the pending-attachment chip dock above the input. Paste itself still works; the attach (`+`) button is unaffected; no error banner anywhere.
Evidence pack: `fixture/plugin-dock-chips.js` (shipped v0.2.10 component), `fixture/feature.diff` (v0.2.11 diff), `fixture/user-thread.md` (user report + maintainer note). Read-only analysis; nothing in `fixture/` was modified or executed.

**Verdict in one line:** the dock dies on a pre-existing dangling `busy` free identifier in the remove button's `disabled:` expression (shipped since the v0.2.10 hardening pass); it throws `ReferenceError: busy is not defined` the first time a chip is rendered with an idle (`'plain'`) composer, the slot-level error boundary unmounts the whole dock entry, and the only trace is a console record — the v0.2.11 hover-preview diff is where the code was *first exercised*, not where the bug was *introduced*.

---

## 1. Exact root cause

### 1.1 The expression that throws

`fixture/plugin-dock-chips.js`, `AttachmentChips`, inside the per-occurrence `.map()` callback (line 34 of the shipped v0.2.10 file):

`disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy`

`busy` is a **free identifier** in `AttachmentChips`: it is not a parameter of the function, not declared anywhere in its body, and not a module-level binding. The only `busy` in the module is `const [busy, setBusy] = React.useState(false)` — a **local binding inside `AttachButton`** (line 7, annotated "busy lives HERE"), a *sibling* function. Function scopes are not nested here, so `AttachButton`'s `busy` is unreachable from `AttachmentChips`; the fixture marks the reference itself with `// <-- ???`. The hardening-pass author evidently copied the disable-on-busy idea from `AttachButton` (where `busy` is real hook state) into `AttachmentChips` without noticing that the identifier does not resolve there.

JavaScript resolves free identifiers **at evaluation time, not at parse/definition time**. When the engine evaluates that property value, walks the scope chain (function scope → module scope → global), and finds nothing, it throws `ReferenceError: busy is not defined`. (There is no `busy` on `window`; and even in sloppy-mode classic scripts only *assignment* to an undeclared name would silently create a global — *reading* one always throws.)

### 1.2 Why it throws only when a chip renders

Three guards sit between "module loaded" and "the dangling name executes":

1. **Registration/import** never touches it — the reference lives inside a function body; loading `lib/client.js` and registering the slot entries only *define* `AttachmentChips`.
2. **The empty-state early return**: `const occurrences = (props.input?.occurrences ?? []).filter(...); if (occurrences.length === 0) return null;` — with no pending attachments the component returns `null` **before** the `.map()` callback ever runs. The throwing line sits inside that callback, inside the `h('button', { ... })` props object literal, which is built eagerly during render.
3. **The `||` short-circuit** (see 1.3): even when a chip renders, `busy` is evaluated only on the falsy branch of the phase check.

So the crash requires exactly: *at least one occurrence with `source === SOURCE` present* **and** *the left operand evaluating to false*. That is why "paste a screenshot" is the trigger and "open the composer with nothing attached" is not — and why every idle mount of the dock in every test and every boot looked perfectly healthy.

### 1.3 Why the `||` short-circuit kept it latent through v0.2.10

`A || B` evaluates `B` **only when `A` is falsy**. Here

- `A` = `(props.input?.phase ?? 'plain') !== 'plain'` — the "composer is locked" phase guard the hardening pass added (truthy while streaming/submitting/locked, falsy when idle),
- `B` = `busy` — the dangling name.

Whenever the dock rendered while the composer was in a non-`'plain'` phase — precisely the locked-phase renders the hardening pass was worried about, and the renders that dominated the dock's real re-render traffic in the field (`AttachmentDock` re-renders on `useRevision()` ticks, which fire conspicuously while the conversation is busy) — `A` was truthy, `||` short-circuited, `busy` was **never evaluated**, and `disabled` simply came out `true`. A free identifier is only fatal *at the moment of evaluation*; the short-circuit made that moment branch-dependent, and through the v0.2.10 lifetime the fall-through branch (idle `'plain'` composer **with** a chip present) was not exercised by the renders that actually happened, was not covered by any test (the suite only ever mounted the empty dock, which returns `null` first — §4), and, thanks to the slot error boundary, any stray hit would have been silent anyway (§1.4). The bug was fully present in shipped v0.2.10 code — *latent* means present-but-unevaluated, not absent.

v0.2.11 removed that protection in practice: the release advertises paste → hover-preview, so the very first thing every updating user does is paste an image **into an idle composer** — a guaranteed `phase === 'plain'` chip render. `A` is false, the engine falls through to `B`, and the dormant `ReferenceError` fires on the release's flagship user path, on the first paste.

> Strictly: an idle-phase chip render in v0.2.10 would have thrown identically — the maintainer's field record ("v0.2.10 users used the x button fine") says such renders did not occur or did not get noticed in the wild. Either way the version-independent fact stands: **the throwing line is in the shipped v0.2.10 artifact** (`plugin-dock-chips.js:34`, with its own comment dating it to the v0.2.10 hardening pass), so v0.2.11 cannot be the introducer; it is the first release whose user flow reliably evaluates it.

### 1.4 Why the symptom is "the whole dock vanished", not "the remove button is broken"

- **It is a render-time throw, not an interaction-time bug.** The `disabled:` expression is evaluated while *constructing* the button's props object, i.e., during `AttachmentChips`'s render pass. The remove button never exists to be "broken" — the component throws mid-render, before returning any element tree.
- **The framework wraps each slot entry in an error boundary, and the boundary's granularity is the whole entry.** When a slot contribution throws during render, the slot-level error boundary catches it and **unmounts the entire slot entry** — React error boundaries replace the whole captured subtree with `null`; there is no "partial chip". So the entire pending-attachment dock (container div and all chips) disappears, not just one button. This is the documented DSH slot failure mode: the same "entire surface silently vanishing" symptom class as skill card **DSH-0.1.7-A1-01** (a missing icon export crashing a slot render → boundary unmounts the WHOLE entry → dock/header widget gone with only a minified console error and no failed requests).
- **Console-only visibility.** The boundary logs (a `ReferenceError` plus the framework's `slot entry crashed`-style console record) but renders no user-facing banner. Users never open DevTools → a *silent* crash. Hence the user thread: "Nothing else looks broken, and I don't see any error banner in the UI."
- **Why paste still works:** pasting is handled upstream of the dock — the occurrence is recorded in the input model, and sending reads the model, not the dock's DOM. Only the *presentation* of the pending attachment died. Data path fine, render path dead: the classic slot-boundary signature.
- **Why the attach button is unaffected:** `AttachButton` renders into a *different* slot entry (`input.left`) with its own error boundary; and inside `AttachButton` the name `busy` genuinely resolves (its own `useState` local). Its render never throws, so its entry stays mounted. Two entries, two boundaries: one crash unmounts exactly one entry.

---

## 2. Why blaming the v0.2.11 diff is the wrong first conclusion — and the correct bisection

### 2.1 The diff is misleading in two ways

1. **Salience:** the v0.2.11 diff touches `AttachmentChips` — the exact component that died — and adds visible new machinery (`imageItem`, `onClick`, hover-card, `data-image`). "The feature release broke the feature's component" is the tempting first conclusion.
2. **Its base predates the hardening pass.** `feature.diff` shows the disabled line as a change pair — minus `disabled: (...) !== 'plain',` / plus `disabled: (...) !== 'plain' || busy,` — making the busy clause look like a v0.2.11 addition. But the **shipped v0.2.10 artifact already contains it** (`plugin-dock-chips.js:34`, commented "v0.2.10 hardening pass added the phase guard — and this busy reference"), and the maintainer note in `user-thread.md` confirms it ("In v0.2.10 the same component already had the line … and v0.2.10 users used the x button fine"). The diff was therefore generated against a base older than the hardening pass (a stale fork point / merge-base), so it *overstates* what v0.2.11 introduced. Lesson: a diff shows what changed **relative to its base**, not relative to what users actually ran last; never bisect from diff review alone — bisect by executing versions.

Note also what the diff is *not*: none of the hover-preview statements is the guaranteed crash. The feature code's own defects (`record?.items.find` on a possibly-missing `items`; `event.target.closest` on a possibly-`closest`-less target; the `imageItem` computation printed *outside* the `.map()` callback where `record`/`status` are bound — see §3.3) are data-shape-conditional or placement defects. The one line that throws **unconditionally on every idle chip render, in both versions**, is the pre-existing `disabled:` line.

### 2.2 The correct bisection (rollback / re-add / minimal mount)

1. **Minimal render mount (minutes, no host needed):** mount the shipped v0.2.11 `AttachmentChips`/`AttachmentDock` in a React test harness with one occurrence present and `phase: 'plain'`. Result: `ReferenceError: busy is not defined`, stack pointing at the `disabled:` expression inside the `.map()` callback — *not* at any hover-preview statement. (Read exactly as printed, the function-level `imageItem` line would throw on `status` first — which itself proves the diff's placement is broken; with `imageItem` correctly scoped per-occurrence, the first and only guaranteed throw is `busy`.)
2. **Rollback:** run the *same* minimal mount against the shipped **v0.2.10** artifact. It throws identically — the line is right there at `plugin-dock-chips.js:34`. The crash therefore predates v0.2.11; the diff cannot be the introducer.
3. **Re-add (hunk bisect) forward from v0.2.10:**
   - v0.2.10 + *only the hover-preview hunks* (`imageItem` moved inside the callback, `data-image`, `onClick`, hover-card child), disabled line untouched → **still crashes** at `busy`.
   - v0.2.10 + *only* removal of the busy clause from the disabled line, no hover code at all → **no crash**; chips render.
   The crash tracks the pre-existing disabled line, independently of the feature hunks.
4. **Field cross-check in v0.2.11:** paste a **non-image** attachment (e.g., a text file). No `imageItem` matches, no hover-card renders, no chip `onClick` is attached — the entire hover-preview feature is inert — yet the dock vanishes all the same. A genuine hover-preview crash would require an image item; this one requires only *an occurrence*.

### 2.3 Evidence table: "new feature crashed the slot" vs "old latent bug first exercised now"

| Evidence | New-feature crash | Old latent bug (this case) |
|---|---|---|
| Shipped v0.2.10 source contains the throwing line | no | **yes** — `plugin-dock-chips.js:34` + dating comment |
| v0.2.10 minimal data-present mount | would pass | **throws the same ReferenceError** |
| Crash depends on feature data (image items) | yes | **no** — any occurrence, including `imageItem === undefined` paths |
| Console stack frame | in new hover statements | **in the `disabled:` expression** (pre-existing line) |
| Reverting only the feature hunks fixes it | yes | **no** — removing only the busy clause fixes it |
| Diff presents the line as new | taken at face value | **contradicted by the shipped v0.2.10 artifact** → stale diff base |

The distinguishing question is always: *does the crash reproduce on the previous version when you exercise the same code path with data present?* "It worked in v0.2.10" from the field is weak evidence — the old version may simply never have *evaluated* the line (short-circuit + empty-state early return + no data-present test). Execution, not user anecdote and not diff review, decides.

---

## 3. The fix

### 3.1 Minimal fix — remove the dangling reference

The chip dock has no busy concept of its own (attach-busy belongs to `AttachButton`'s flow); the remove button's lock state is fully expressed by the phase guard. Delete the dangling operand:

`disabled: (props.input?.phase ?? 'plain') !== 'plain'`

If a real busy state is wanted for the dock (e.g., disable `x` while a removal is in flight), **scope it properly** instead: give `AttachmentChips` its own binding — `const [busy] = React.useState(false)` locally, or lift the flag into shared state / pass it via `props.busy` from the slot owner — never reference a name that lives in a sibling function's scope. Either way, add ESLint `no-undef` (§5): it flags this class statically, at zero runtime cost.

### 3.2 Two hardening patterns the v0.2.11 diff should also get

1. **`record?.items ?? []`-style defensive reads.** The diff's `record?.items.find(item => isImagePath(item.path))` optional-chains only `record`: if `record` exists but `record.items` is `undefined` (older/partial record shape, record still populating while the file loads, host-side contract drift), `.find` on `undefined` is a render-time `TypeError` — the *same* whole-entry-vanishing symptom through the *same* boundary. Write it as `(record?.items ?? []).find(...)` (or `record?.items?.find(...)` plus an `undefined` guard). Same discipline for every host-supplied shape the component reads (`props.input?.occurrences ?? []` already models it — the diff should not regress that standard one line later).
2. **Optional-chained `event.target.closest?.()`.** In the chip's `onClick`, `event.target.closest('.remove')` assumes the target is an `Element`. Synthetic/retargeted events can surface a node without `closest` (e.g., a text node), yielding a handler-time `TypeError`. Write `if (event.target?.closest?.('.remove') != null) return;`. Event-handler throws are *not* caught by error boundaries (boundaries cover render/lifecycle), so this one would not unmount the dock — it would log an uncaught error and kill the interaction (viewer never opens, click silently dead). Cheap insurance either way.

**Why these are cheap insurance specifically in slot components:** a slot component renders against host-supplied data shapes it does not control, inside a boundary whose failure mode is *total and silent* — one unguarded property read converts "feature degraded" into "entire surface disappears with a console-only trace". The defensive-read habit trades a one-token `?.`/`??` for the difference between a graceful no-op and a vanished entry. (Skill-card corroboration: DSH-0.1.7-A1-01's whole-entry-unmount symptom class; corridor cards repeatedly show host prop contracts drifting — e.g., the `GlobalStandardProps` reshapes in the 0.1.6 line.)

### 3.3 One more defect to correct while in there (diff placement) + a small regression

- As printed, the diff inserts `const imageItem = status !== 'missing' ? ... : undefined;` at the **function-body level**, *above* the `.map()` callback where `const record`/`const status` are bound. At that position `status` and `record` are themselves free identifiers — a second `ReferenceError` that would fire on every chip render *before* the busy line — and even if those names existed there, one shared `imageItem` for all occurrences is semantically wrong: the hover preview is per-chip. The fix must move the `imageItem` computation **inside** the `.map()` callback, per occurrence, then apply the `?? []` hardening.
- The v0.2.11 button props also **dropped** v0.2.10's `'aria-label': 'Remove ' + (record?.label ?? occurrence.label)` — an accessibility regression riding along in the same hunk. Restore it.

Fixed component (core, per-occurrence):

```js
...occurrences.map(occurrence => {
  const record = records.get(occurrence.ref);
  const status = record?.status ?? 'missing';
  const imageItem = status !== 'missing'
    ? (record?.items ?? []).find(item => isImagePath(item.path))
    : undefined;
  return h('div', {
    className: 'chip',
    'data-status': status,
    'data-image': imageItem === undefined ? undefined : '1',
    key: occurrence.occurrenceId,
    onClick: imageItem === undefined ? undefined : event => {
      if (event.target?.closest?.('.remove') != null) return;
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
      disabled: (props.input?.phase ?? 'plain') !== 'plain',
      onClick: () => props.remove(occurrence),
    }, 'x'));
})
```

---

## 4. The regression that would have caught this before release

A **data-present render smoke** for every registered slot component — mounting the dock/chip component **WITH an occurrence present**, in a harness that replicates the slot error boundary, asserting the chip element actually renders and that no error-boundary capture occurred:

```js
// test/dock-render-smoke.test.js (sketch — vitest/jest + @testing-library or a bare react-dom mount)
test('dock renders a chip with data present, idle phase, no boundary capture', () => {
  records.set('r1', { status: 'ready', label: 'shot.png',
                      items: [{ path: 'shot.png', file: new Blob(['x'], { type: 'image/png' }) }] });
  const captures = [];
  const props = {
    input: { phase: 'plain',                       // idle: forces the || fall-through branch
             occurrences: [{ occurrenceId: 'o1', ref: 'r1', source: SOURCE, label: 'shot.png' }] },
    remove: () => {},
  };
  const { container } = render(
    h(ErrorBoundarySimulatingTheSlot, { onCapture: e => captures.push(e) },
      h(AttachmentDock, props)));
  expect(container.querySelector('.dock .chip')).toBeTruthy();          // positive DOM marker
  expect(container.querySelector('.chip .remove')).toBeTruthy();        // the button exists → no render throw
  expect(captures).toHaveLength(0);                                     // no error-boundary capture
  expect(consoleErrorSpy).not.toHaveBeenCalledWith(/ReferenceError|slot entry crashed/);
});
```

Design points — each maps to one way this bug hid:

1. **Data present, never the empty state.** With zero occurrences the dock returns `null` *before* the throwing line; an empty-state smoke passes on both v0.2.10 and v0.2.11 and proves nothing. This is precisely the hole in the released suite ("We shipped without a render smoke that mounts the dock with a chip present").
2. **Idle `'plain'` phase** — the fall-through branch of the `||`. A smoke that renders only the locked phase passes via short-circuit; that branch-coverage gap is exactly how the line survived the whole v0.2.10 lifetime. Render both phases (and assert `disabled` true/false accordingly).
3. **Assert positively (chip DOM marker present), not just "did not throw".** Under an error boundary a render crash is *observable as silence* — the mount "succeeds", the subtree is just gone. So assert the marker **and** zero boundary captures **and** a clean console — the same triple the skill card prescribes for driven-browser slot verification (DOM marker present, zero `slot entry crashed` records, expected requests fire).
4. **Parameterize the occurrence:** one image item and one non-image item; one `record` with `items` and one record missing `items` (catches §3.2 pattern 1); mount *both* slot entries (`AttachButton` and `AttachmentDock`) so a future cross-scope reference fails loudly.
5. This test **fails identically on shipped v0.2.10 and v0.2.11** — it would have caught the bug at the hardening-pass commit, two releases earlier, and it settles the "who introduced it" question automatically.

---

## 5. Release-process lesson: why `node --check` shipped a render-time landmine — twice

**What the gate actually validates.** `node --check` parses the file for *syntax* only. A free identifier like `busy` is perfectly legal syntax; JavaScript has no compile-time unresolved-name error — name resolution happens at evaluation. So the module parses, loads, registers, and even renders (empty state) without incident. The v0.2.10 gate passed the release that *introduced* the line, and the v0.2.11 gate passed the release that *detonated* it: two consecutive ships, zero signal.

**Why lib-only slot plugins make this worse.** The plugin's entire product surface is components that execute *only inside the host's slot mount, only with host-supplied data*. There is no standalone app to click through; nothing in the package's own runtime exercises the code. The failure is deferred (render time), remote (inside the host), branch-gated (idle phase + occurrence present), and then **swallowed** by the slot error boundary into a console record no user reads. Every layer between "syntax OK" and "user-visible" hides the bug rather than exposing it. Absence of crash reports ≠ absence of crashes; with silent-unmount boundaries, absence of *UI* is the only user-visible trace, and users report it as "the feature isn't there", not "the feature crashed".

**Minimum viable pre-ship check for a slot-rendering lib-only plugin** (mirrors the skill's layered validation ladder — static → runtime → behavior):

1. **Scope-aware lint, not just parse:** ESLint with `no-undef` (plus the typescript-eslint equivalent if TS). That single rule catches this exact bug class statically, in CI, at zero runtime cost. `node --check` stays — as a floor, never as the gate.
2. **Data-present render smokes (the §4 suite) for every registered slot entry**, run against the *built* `lib/client.js` (the packed artifact, not just source): empty state **and** occurrence-present state; both branches of every guard expression that gates rendering; assert positive DOM markers + zero boundary captures + clean console. For a lib-only plugin this is the *only* place the product code ever runs before users reach it — it is the functional test layer, not optional polish.
3. **One real host mount of the packed artifact** before publish: cold-start a dev profile with the plugin enabled, verify each slot entry's marker in a driven browser (or one manual pass), and execute **one core user path end-to-end** — here: paste an image → chip dock visible → hover preview shows → `x` removes the chip. Per the skill's validation layers 4–5 (runtime enablement + one behavior path) and DSH-0.1.7-A1-01's verification recipe (marker present, zero `slot entry crashed` console records, expected requests fire). A bare "HTTP 200 / bundle served" check has false negatives and does not count.
4. **Diff-base hygiene in the release PR/notes:** generate release diffs against the *previous published tag*, so reviewers see what actually changed for users. This release's stale-base diff is what sent the first investigation straight at the hover-preview code (§2.1).

Cost of the whole gate: one lint rule + one smoke file + one dev-host pass — minutes per release, against a bug class whose field signature is a silently vanished surface and whose investigation costs a full support thread, a misdirected rollback, and a bisect.

---

## Appendix · sources consulted

- `fixture/plugin-dock-chips.js` — shipped v0.2.10 excerpt: `AttachButton` (owns `busy` as `useState`, line 7), `AttachmentChips` (dangling `busy`, line 34; empty-state early return, line 23), `AttachmentDock` (`useRevision()` + `'dock'` class).
- `fixture/feature.diff` — v0.2.11 hover-preview hunks; disabled-line change pair vs stale base; function-level `imageItem` placement; dropped `aria-label`.
- `fixture/user-thread.md` — user report (dock gone, paste works, `+` fine, no banner) and maintainer note (line pre-existed in v0.2.10; slot boundary unmounts throwing entries, console-only; no data-present render smoke).
- Skill `plugin-upgrade` reference **DSH-0.1.7-A1-01** (`references/v0.1.7-alpha.1.md`) — slot-level error boundary unmounts the WHOLE slot entry; "entire surface silently vanishing, one minified console error, no request failures"; driven-browser triple-assertion verification. Also `references/v0.1.5-alpha.1.md` A1-20 (one broken client module fails every client plugin's registration — same silent-whole-surface family) and the layered Validation-and-reporting ladder in `SKILL.md`.
- No fixture file was modified or executed; no git, network, install, or migration actions were performed. Analysis is read-only per BENCHMARK-AUTH-v1.
