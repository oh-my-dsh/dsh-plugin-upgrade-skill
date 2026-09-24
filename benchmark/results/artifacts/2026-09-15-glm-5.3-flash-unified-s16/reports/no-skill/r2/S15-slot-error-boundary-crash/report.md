# S15 · Vanishing Dock Chips — Root-Cause Report

**Plugin:** `@org/dsh-attach-input` · **Releases:** v0.2.10 (working) → v0.2.11 (hover preview; chips vanish)
**Evidence:** `fixture/plugin-dock-chips.js` (v0.2.10 as shipped), `fixture/feature.diff` (v0.2.11), `fixture/user-thread.md`
**Method:** static analysis of the shipped component + runtime reproduction of the exact evaluation paths (all three confirmed by executing the fixture logic; see §1.3).

---

## 1. The exact root cause

### 1.1 Which expression throws

The throwing expression is the right operand of the `||` on the remove button's `disabled` prop in `AttachmentChips` (fixture `plugin-dock-chips.js`, line 34):

```js
disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,   // <-- ???
```

`busy` is a dangling free identifier. It is declared only inside a **different component** — `AttachButton`'s `const [busy, setBusy] = React.useState(false)` (line 7). `AttachmentChips` is a separate function scope in the same module; nothing named `busy` exists in its scope, in enclosing scopes, or at module scope. Function-local `const`/`let` bindings do not leak across sibling functions, so when this expression is *evaluated*, JavaScript raises:

```
ReferenceError: busy is not defined
```

This is a runtime binding failure, not a syntax error — the file parses cleanly (`node --check fixture/plugin-dock-chips.js` passes; verified), which is precisely why it shipped (see §5).

Note the likely origin: the v0.2.10 "hardening pass" copied the `disabled:` line's shape from `AttachButton` (which legitimately has `locked || busy` semantics) into `AttachmentChips` — dragging the `busy` reference along without its binding.

### 1.2 Why it throws only when a chip renders

The poisoned line sits inside the `occurrences.map(...)` callback that builds the chip elements, and that map is guarded by the early return:

```js
const occurrences = (props.input?.occurrences ?? []).filter(item => item.source === SOURCE);
if (occurrences.length === 0) return null;      // <-- empty dock exits BEFORE the throwing line
return h('div', { className }, ...occurrences.map(occurrence => {
  ...
  disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,   // only reached with >=1 occurrence
```

With no pending attachments, the component returns `null` and the line is never evaluated. The props object literal containing `disabled:` is built eagerly when `h(...)` is called for the first chip — so the very first chip render is the first time `busy` is ever touched. An empty dock, an empty-state story, an empty-state preview, an empty-state test: all of them pass clean.

### 1.3 Why the `||` short-circuit kept it latent through v0.2.10

`A || B` evaluates `B` only when `A` is falsy. Here `A` is the phase guard, true whenever the composer is **not** in the plain phase. So the ReferenceError is *conditional*: the dangling reference is only read in renders where **an occurrence is present AND the phase guard is false (plain phase)**. The full evaluation matrix (all three rows reproduced by executing the fixture logic):

| occurrences | phase | guard `!== 'plain'` | `busy` evaluated? | result |
|---|---|---|---|---|
| empty | any | (not reached) | no | `null`, renders fine |
| present | non-plain (locked) | `true` — short-circuits | **no** | button renders, `disabled: true` |
| present | plain | `false` | **yes** | `ReferenceError: busy is not defined` |

That is the latency mechanism: the `||` acted as an accidental circuit breaker. Through v0.2.10, the renders that users and the hardening pass exercised either had no occurrence (early return) or hit the line while the guard was true (chips interacting with an in-flight upload/composer lock), so the poisoned right operand was never read — the component rendered, the x button worked, and the maintainer's "v0.2.10 users used the x button fine" observation is exactly what a never-evaluated bug looks like. What v0.2.11 changed is not the line but the **traffic over it**: the hover-preview feature's entire purpose is the post-paste, idle chip — the user pastes, the upload completes, the composer settles back to the plain phase, and the `useRevision()`-driven dock re-render rebuilds the chip with the guard now false → `busy` is finally evaluated → the crash path is exercised for the first time at scale. (And because the failure is console-only — see §1.4 — it is also possible some v0.2.10 users hit it silently without reporting; "no bug reports" is weak evidence for a slot component.)

### 1.4 Why the symptom is "the whole dock vanished", not "the remove button is broken"

The throw happens **during render** — while building the props object for the first chip's `<button>` — not inside an event handler. In this framework, each slot entry (here `AttachmentDock`, registered into the InputZone slot) is wrapped in an error boundary; per the maintainer's own note in `user-thread.md`: "a slot entry that throws during render is caught by the framework's error boundary and unmounted (the error is only visible in the browser console, which users never open)". Consequences:

- The error boundary catches the render throw and **unmounts the entire entry** — the whole dock subtree, all chips, not just the failing button. Nothing was committed to the DOM yet, so nothing of the dock appears at all.
- The only trace is a `console.error` in the browser console (plus the boundary's fallback, which here renders nothing) — no UI banner, so users just see "the chip is gone".
- `AttachButton` is a **separate slot entry** (`input.left`) with its own error boundary, so the `+` button keeps working — matching the user report exactly ("the attach button is unaffected").
- Because the crash aborts the map, even chips with no hover-preview image vanish; the whole entry dies together.

---

## 2. Why blaming the v0.2.11 diff is the wrong first conclusion

### 2.1 The trap

The recency trap is unusually well baited here: the diff touches the *same component*, and `feature.diff` even *displays* the `|| busy` line as an added hunk (`-        disabled: (props.input?.phase ?? 'plain') !== 'plain',` / `+        ... || busy,`). The obvious first read is "v0.2.11 added a broken reference to `busy`".

But the shipped-artifact evidence contradicts that read:

- The v0.2.10 file **as shipped** (`fixture/plugin-dock-chips.js`, labeled "as shipped") already contains the `|| busy` line, annotated "v0.2.10 hardening pass added the phase guard — and this busy reference".
- The maintainer independently confirms v0.2.10 shipped that line ("added in a hardening pass") and that v0.2.10 users used the x button.

Both facts can only be reconciled if `feature.diff` was cut against a **stale base** (e.g., the last pre-hardening revision) or the release diff bundled the hardening commit with the feature commit — so the diff is a noisy map of "what actually changed in v0.2.11", not a reliable one. Diff-reading alone cannot settle which line regressed.

### 2.2 The correct bisection

Two equivalent experiments, both cheap because the component is mountable in isolation:

1. **Rollback / re-add bisect.** Start from v0.2.10 as shipped; re-apply the hunks one at a time (hover-preview block only → mount; then the `disabled` line → mount). Or start from v0.2.11 and revert one hunk at a time.
2. **Minimal render mount.** Mount `AttachmentDock` (or `AttachmentChips`) directly with a fabricated input — one occurrence present — at each revision, in both phase states.

Either path points at the **pre-existing line**: the v0.2.10 component already throws on a data-present, plain-phase mount.

### 2.3 Evidence that distinguishes "old latent bug first exercised now" from "new feature crashed the slot"

| Discriminator | Old latent bug (actual) | New-feature crash (hypothesis) |
|---|---|---|
| Reproduction scope | Crashes on a **v0.2.10 build** with a data-present, plain-phase mount | Reproduces only with the v0.2.11 hunk applied |
| Stack frame | Lands on the `disabled:` line in `AttachmentChips` | Lands in the added hover-preview code (`imageItem`, `onClick`) |
| Phase dependence | Crash **tracks the phase** on the same build: locked phase renders fine, plain phase throws — no hover-preview code influences the phase guard | Phase-independent |
| Revert experiment | Reverting only the hover-preview hunk (keeping the `disabled` line) **still crashes** on plain-phase chip render | Reverting the feature hunk fixes it |
| Published-artifact check | Unpacking the published v0.2.10 tarball and grepping `lib/client.js` for `busy` proves the line predates the diff — and explains the diff's stale-base display of that line as an addition | The line is absent from the v0.2.10 tarball |

The "diff touched the same component" fact is a reason for suspicion, not a verdict; the bisect + minimal mount is the verdict. (One honest caveat that the same bisect also settles: the diff's added `imageItem` block, *as the excerpt writes it*, reads `status`/`record` above their declarations — they are per-occurrence `const`s inside the map callback. If the shipped bundle really places that block at function scope it is a second throw-on-chip-render of the same free-identifier class that must be fixed in the same pass; the bisection above is what empirically separates the two contributions. See §3.)

---

## 3. The fix

### 3.1 Remove the dangling reference

```js
// AttachmentChips — remove button:
disabled: (props.input?.phase ?? 'plain') !== 'plain',
```

If the intent was "also disable remove while an add is in flight", that state must actually exist in this component — a `useState`/context/prop on `AttachmentChips`/`AttachmentDock` — not be borrowed from a sibling component's local scope. A sibling's local state is unreachable by design, and the failure surfaces at runtime (ReferenceError), not at parse/build time, so nothing in the pipeline flags it.

### 3.2 Scope the new hover-preview block properly (same fix pass)

`imageItem` must be **per occurrence** and must sit where `record`/`status` are in scope — inside the map callback, after their declarations (hoisting the pair above the map also works, but per-occurrence is required anyway for correctness: at function scope one record's image would be stamped onto every chip):

```js
return h('div', { className }, ...occurrences.map(occurrence => {
  const record = records.get(occurrence.ref);
  const status = record?.status ?? 'missing';
  const items = record?.items ?? [];                       // defensive read (hardening 1)
  const imageItem = status !== 'missing'
    ? items.find(item => isImagePath(item.path))
    : undefined;
  return h('div', {
    className: 'chip', 'data-status': status, key: occurrence.occurrenceId,
    'data-image': imageItem === undefined ? undefined : '1',
    onClick: imageItem === undefined ? undefined : event => {
      if (event.target.closest?.('.remove') !== null) return;   // optional-chained (hardening 2)
      openImageViewer({ src: objectUrlOf(imageItem.file), name: imageItem.path });
    },
  }, /* ...name span, hover-card, remove button... */);
}));
```

### 3.3 The two hardening patterns, and why they are cheap insurance

1. **`record?.items ?? []`-style defensive reads.** `records` is a store owned by another layer; slot props and store records change shape and lifecycle outside this component's control (a record can be evicted or half-populated mid-render). `record?.items.find(...)` still throws a `TypeError` if `record` exists but `items` is missing; `record?.items ?? []` makes the worst case an empty list instead of a crash.
2. **Optional-chained `event.target.closest?.()`.** `event.target` is not guaranteed to be an `Element` (text nodes, `document`/`window` in edge and composed-event cases lack `.closest`). `closest?.()` — or an `event.target instanceof Element` check — turns a would-be `TypeError` inside the handler into a no-op.

Why this is cheap insurance specifically in slot components: a slot entry renders inside a host error boundary with no error UI. Any throw — render-time *or* handler-time — is amplified into the silent whole-entry unmount of §1.4, diagnosable only from a console users never open. The failure mode is catastrophic (feature silently dead, release rollback, user trust) while each guard costs one token. Asymmetric bet; always take it.

---

## 4. The regression that would have caught this before release

A **render smoke that mounts the dock/chip component with an occurrence present**, in a DOM-emulating environment (jsdom/happy-dom), asserting the chip renders without an error-boundary capture:

```js
// dock-render.smoke.test.js
test('dock renders a chip with an occurrence present (plain phase)', () => {
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  const onBoundary = jest.fn();                       // test-only error boundary callback
  render(
    <Boundary onError={onBoundary}>
      <AttachmentDock input={{
        phase: 'plain',                               // <-- the phase that makes the guard false
        occurrences: [{ source: SOURCE, ref: 'r1', occurrenceId: 'o1', label: 'shot.png' }],
      }} />
    </Boundary>
  );
  expect(screen.getByText('shot.png')).toBeTruthy();   // chip name span exists
  expect(screen.getByRole('button', { name: /Remove shot\.png/ })).toBeTruthy();
  expect(onBoundary).not.toHaveBeenCalled();           // no error-boundary capture
  expect(consoleError).not.toHaveBeenCalled();
});
```

Critical design points:

- **Data present, not the empty state.** The empty dock returns `null` *before* reaching the throwing line — an empty-state smoke passes green against the broken component and provides false confidence. The occurrence must be in the fabricated props.
- **Plain phase.** `phase: 'plain'` makes the `||` guard false so the poisoned operand is actually evaluated; a locked-phase mount short-circuits past the bug and passes. Cover both phase states.
- **Assert no boundary capture.** Asserting "no error boundary fired / no `console.error`" catches the class of failure whose symptom is *absence of output* (a bare "renders nothing" assertion would also catch it, but the explicit assertion documents why).
- Adding the fixture record with an `items` entry containing an image path exercises the v0.2.11 hover-card branch (`imageItem`, `onClick`) in the same smoke after the fix.

Had this smoke existed, v0.2.10's hardening pass would have failed CI with `ReferenceError: busy is not defined` months before a user ever saw a vanishing dock.

---

## 5. The release-process lesson

**Why `node --check` was insufficient.** `node --check` is a parse-only check: it validates syntax, not identifier bindings, and never executes the program. `busy` as a free identifier is *syntactically legal* — the file parses clean (verified on the fixture) — and the `ReferenceError` fires only when the expression is *evaluated*, i.e., at render time, in a DOM environment, with attachment data present, in the plain phase. A **lib-only plugin** has no app shell, no pages, no natural execution path where its components run before shipping — so nothing between `node --check` and publish ever mounted the component, and the crash shipped.

**Minimum viable pre-ship check for slot-rendering lib-only plugins.** Three cheap layers, all automatable as a release gate (`prepublishOnly` / CI required check):

1. **Parse** — `node --check` (keep it; it just is not enough).
2. **Lint with `no-undef`** — `eslint`'s `no-undef` (or an equivalent static binding check / type checker) flags `busy` *statically*, with zero execution. This alone would have blocked the release at the hardening pass.
3. **Headless data-present render smoke per registered slot entry** — mount each slot component with representative, non-empty slot props (occurrence present, both phase states) under jsdom; assert the expected DOM nodes exist and no error boundary / `console.error` fired (§4). This is the only layer that catches "valid syntax, wrong bindings, dies at render with data" — the characteristic failure shape of slot components, whose code paths are owned and invoked by the host.

The general lesson: for a plugin whose code only ever runs inside someone else's render tree, "it parses" and "it lints" bound nothing; the smallest honest release gate is *one real render per slot entry with data in it*.
