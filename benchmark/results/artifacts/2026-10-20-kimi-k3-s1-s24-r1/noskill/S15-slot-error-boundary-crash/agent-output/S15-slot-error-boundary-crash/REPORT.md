# S15 · Vanishing Dock Chips — Root-Cause Report

**Plugin:** `@org/dsh-attach-input` · **Symptom:** after v0.2.11, pasting a screenshot no longer shows the
pending-attachment chip above the input; paste and the attach button still work; no UI error.
**Verdict up front:** the v0.2.11 hover-preview diff is *not* the cause. The crash is a pre-existing
dangling `busy` reference in `AttachmentChips`, shipped in the v0.2.10 "hardening pass", kept latent by
an `||` short-circuit and an empty-state early return, and first exercised at scale by the
paste-a-screenshot workflow that v0.2.11's preview feature drove.

All mechanism claims below were verified empirically with `repro.js` (this directory), which copies the
shipped v0.2.10 `AttachmentChips` verbatim behind minimal stubs and runs it through a simulated slot
error boundary. Output is in `repro-output.txt` and quoted inline.

---

## 1. The exact root cause

### Which expression throws

`fixture/plugin-dock-chips.js:34`, inside the per-occurrence `map` callback of `AttachmentChips`:

```js
disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,   // <-- ???
```

The free identifier **`busy`** throws `ReferenceError: busy is not defined` the moment it is *evaluated*.
`busy` is a `React.useState` binding declared **inside `AttachButton`** (`plugin-dock-chips.js:7`) —
a sibling component's closure. `AttachmentChips` is a separate top-level function, so `busy` is not in
its scope chain, and nothing named `busy` exists at module scope either. The v0.2.10 hardening pass added
the phase guard and pasted this `busy` reference in by mistake (almost certainly copied from
`AttachButton`'s `locked || busy` button on line 17). Reading an undeclared identifier throws a
ReferenceError — it does not yield `undefined` — and because module code is strict-mode there is no
implicit global creation to save it.

### Why it throws only when a chip renders

Two gates sit in front of the throwing read:

1. **Empty-state early return** — `plugin-dock-chips.js:23`: `if (occurrences.length === 0) return null;`.
   The empty dock (the composer state >99% of the time, and the state every smoke test used) exits *before*
   the `map` callback that contains the line. No chip, no evaluation, no crash. This is why "mount the
   component" tests that use the empty state give false confidence.
2. **Per-chip evaluation** — the expression is evaluated exactly once per rendered chip while building the
   remove-button props object, *before* `h()` returns a vnode. So the crash needs at least one pending
   attachment with `source === SOURCE`.

Repro case 1 (no occurrences): entry mounts, tree is `null` — the line is never reached.

### Why the `||` short-circuit kept it latent through v0.2.10

`A || busy` evaluates `busy` **iff `A` is falsy**. Here
`A = (props.input?.phase ?? 'plain') !== 'plain'`, so:

- **Guard truthy** (phase is `'compose'`, `'sending'`, any non-`'plain'` value): the `||`
  short-circuits, `busy` is never read, the chip renders fine (remove button disabled). Repro case 2:
  `mounted=true, remove.disabled=true`.
- **Guard falsy** (phase is `'plain'` *or absent* — note the `?? 'plain'` default makes a missing phase
  falsy too): the engine must evaluate `busy` to finish the `||`, and the ReferenceError fires.
  Repro cases 3 and 4: `mounted=false, consoleOnly="ReferenceError: busy is not defined"`.

So the crash requires the conjunction **chip present ∧ guard falsy** — i.e. a pending attachment rendered
while the composer is in its ordinary editable state. Every v0.2.10 render that reached the line with a
truthy guard was silently protected by the short-circuit; that is the entire latency mechanism. The
hardening pass shipped without ever executing the falsy branch with data present (see §4), and the
maintainer-thread observation that "v0.2.10 users used the chips fine" tells us the exercised v0.2.10
flows stayed on the safe side of the gate. v0.2.11 changed *traffic*, not this line: the hover-preview
release prompted exactly the flow that combines both conditions — paste a screenshot, chip appears in the
plain composer — and the latent line fired for the first time in the field. (Any v0.2.10 user who had hit
chip-present + plain-phase would have seen the identical crash; it simply never came up and was never
tested.)

### Why the symptom is "the whole dock vanished", not "the remove button is broken"

- The throw happens **during render, before any DOM for the chip exists** — while constructing the props
  object for the `h('button', ...)` call. There is no partial output: you cannot get "chip renders but
  its x button is broken", because the chip's vnode is never produced.
- The dock is registered as **one slot entry** (`AttachmentDock` → InputZone occurrences slot). The
  framework wraps each slot entry in an **error boundary at entry granularity**: a render throw unmounts
  the *entire entry* — every chip, the dock wrapper, everything the plugin put in that slot. Repro's
  `renderSlotEntry` models exactly this: `mounted=false`, nothing left behind.
- The boundary **logs to the browser console only** — no banner, no toast ("I don't see any error banner
  in the UI", user thread). To anyone not running devtools, the dock simply isn't there.
- The **attach button survives** because it is a *different slot entry* (`input.left`) behind its own
  boundary — and, ironically, the one place where `busy` is legitimately in scope. The **paste itself
  works** because the data path (`props.add`) never touches the dock's render. Chip visibility is pure
  render; attachment state is unaffected. Hence the precise user report: paste works, + button fine, chip
  gone, no visible error.

## 2. Why blaming the v0.2.11 diff is the wrong first conclusion

### Why it is seductive

- Timing: crashes start right after v0.2.11 ships; the diff touches the very component that vanished.
- `feature.diff:32-33` even shows the `disabled` line as a `-`/`+` pair that *appears to add*
  ` || busy`:

  ```
  -        disabled: (props.input?.phase ?? 'plain') !== 'plain',
  +        disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,
  ```

  That hunk is misleading: it was generated against a pre-hardening-pass base (squashed feature-branch
  diff), so it visually attributes the dangling reference to v0.2.11. The ground truth — the v0.2.10
  *as-shipped* source in `plugin-dock-chips.js:34`, with its own "v0.2.10 hardening pass added … this
  busy reference" comment — proves the line predates the release.

### The correct bisection

Bisect on **two axes**, because "which release" and "which code" are different questions here:

1. **Rollback bisect (version axis):** reinstall v0.2.10 and replay the exact failing flow — one
   occurrence present, composer in the plain phase. If it still crashes (it does), the bug pre-exists the
   release and no amount of reverting the hover preview will fix it.
2. **Re-add bisect (code axis):** apply the v0.2.11 hover hunks onto the v0.2.10 tree (and/or revert them
   from v0.2.11) and re-run the same flow. The crash tracks the pre-existing line, not the hover hunks.
3. **Cheapest decisive experiment — minimal render mount:** mount the v0.2.10 `AttachmentChips` copied
   verbatim from the shipped source, with one occurrence, no v0.2.11 code anywhere. Result:
   `ReferenceError: busy is not defined` (repro case 3). One file, one assertion, question settled.

### Evidence that distinguishes "new feature crashed the slot" from "old latent bug first exercised now"

| Evidence | What it shows |
|---|---|
| Shipped v0.2.10 source contains the identical throwing expression (`plugin-dock-chips.js:34`) | Bug pre-exists the diff |
| Console error is `ReferenceError: busy is not defined`; `busy` appears in **no** v0.2.11-added line (the additions reference `imageItem`, `record`, `event`, `isImagePath`, `objectUrlOf`, `openImageViewer`) | The throwing identifier is not from the feature |
| v0.2.10 + data-present mount reproduces the crash; v0.2.11 with only the `busy` line fixed does not crash | Crash tracks the old line across versions |
| The gates that arm the crash (`occurrences.length === 0 → null`, `phase !== 'plain'` guard) are both v0.2.10 code | v0.2.11 changed which *inputs* reached the line, not the line |

"New feature crashed the slot" would instead show: a throwing identifier introduced by the diff
(e.g. `isImagePath` undefined), a v0.2.10 rollback that stops crashing under the *same* flow, and a
minimal mount of old code that stays green.

(Secondary review note, not the root cause: as printed, the diff's `imageItem` initializer sits ahead of
the `map` where its inputs `status`/`record` are per-occurrence bindings; in the real shipment that
computation must live inside the `map` callback. Worth one review comment — but the bisection above
proves the production crash is the pre-existing `busy` line regardless.)

## 3. The fix

**Primary fix — remove the dangling reference.** The chip-level remove button has no per-chip busy state;
the phase guard alone is the intended semantics:

```js
disabled: (props.input?.phase ?? 'plain') !== 'plain',
```

If a busy state is genuinely wanted for removals, **scope it properly**: declare it inside
`AttachmentChips`/`AttachmentDock` (`const [busy, setBusy] = React.useState(false);`, set around
`props.remove(occurrence)`), never reach into a sibling component's closure. Prefer deletion: the
reference was an accident of the hardening pass, not a feature.

**Two hardening patterns the diff should also get** — cheap insurance because in slot components the blast
radius of *any* uncaught render/click throw is the whole slot entry, and visibility is console-only:

1. **`record?.items ?? []`-style defensive reads.** `feature.diff:10` does
   `record?.items.find(item => isImagePath(item.path))`. `record?.` only guards a nullish `record`;
   a record whose `items` is `undefined` (cache miss shape, older record schema) throws
   `TypeError: undefined is not an object`. Write `(record?.items ?? []).find(...)` — one token, kills
   a whole class of data-shape crashes.
2. **Optional-chained `event.target.closest?.()`.** `feature.diff:22` does
   `event.target.closest('.remove')`. `event.target` is not guaranteed to be an `Element` (text node,
   `document`/`window` in edge paths, retargeted events); non-Elements have no `closest`, and the
   click handler then throws inside the slot's tree. `event.target.closest?.('.remove') ?? false`
   degrades to "not a remove click" instead of a boundary capture.

In slot components these patterns are not paranoia: the framework owns the DOM and the boundary around
you, you do not control host data shapes, and a single uncaught throw silently unmounts your entire entry
with zero user-visible diagnostics. Defensive reads cost one or two tokens and convert "entry vanished"
into "feature degrades".

## 4. The regression that would have caught it

A **data-present render smoke**, not an empty-state mount:

```js
it('dock renders a chip without an error-boundary capture', () => {
  const onError = vi.fn();
  const input = {
    phase: 'plain',                       // <-- the falsy-guard case; also test a non-plain phase
    occurrences: [
      { source: SOURCE, ref: 'ref-1', occurrenceId: 'o1', label: 'shot.png' },
    ],
  };
  records.set('ref-1', { status: 'ok', label: 'shot.png', items: [] });
  const tree = renderIntoBoundary(<AttachmentDock input={input} remove={() => {}} />, { onError });
  expect(onError).not.toHaveBeenCalled();          // boundary stayed silent
  expect(tree.querySelector('.chip')).not.toBeNull();
  expect(tree.querySelector('.chip .remove')).not.toBeNull();
});
```

The critical design points:

- **Mount WITH an occurrence present.** The empty dock hits `return null` at line 23 *before* the
  throwing line — an empty-state smoke passes on the broken code and is exactly the test that let this
  ship ("we shipped without a render smoke that mounts the dock with a chip present", maintainer note).
- **Exercise both sides of the `||` gate** (phase `'plain'` and a non-plain phase, and phase absent),
  because the short-circuit means one side never reads `busy` at all.
- **Assert the boundary did not capture** (spy on `console.error` / the boundary's error callback), not
  just that something rendered — the failure mode is a silent unmount, so the absence of a capture *is*
  the assertion.

This test fails identically on v0.2.10 and v0.2.11 pre-fix, and passes after the `busy` removal — which
also makes it the executable proof for the §2 bisection.

## 5. Release-process lesson

**Why "syntax check only" (`node --check`) was insufficient.** `node --check` parses; it does not
execute, resolve identifiers, or evaluate anything. `disabled: … || busy` is perfectly valid *syntax* —
a free identifier is a runtime ReferenceError, and only when evaluation actually reaches the read. Our
repro demonstrates it directly: `node --check` prints `SYNTAX OK` on the file that crashes on the
first data-present render. Bundlers/transpilers don't save you either: they happily pass free identifiers
through (they may legitimately resolve as globals at runtime). And this is a **lib-only plugin** — it has
no standalone page, it renders only into host slots — so its components fail *only at render time, with
data present, inside a host-provided error boundary*. There is no build step, type check, or manual
click-through of "the plugin's own UI" that ever executes those render paths.

**Minimum viable pre-ship check for slot-rendering lib-only plugins:**

1. For **every slot entry the plugin registers** (here: `input.left` attach button **and** the InputZone
   dock), a headless render smoke that mounts the entry component **with representative non-empty props**
   — at least one occurrence/record, plus prop variants that walk both sides of every guard expression in
   the render path (`phase` present/absent, each guarded branch).
2. Mount it **inside the same error-boundary semantics the host uses**, and assert: (a) zero boundary
   captures / zero `console.error`, (b) the expected slot elements exist.
3. Run it in CI on every release candidate. It needs only jsdom + the plugin's `h` runtime — minutes to
   write, no host, no browser — and it is the *cheapest* check that executes the exact code path
   (data-present render inside a boundary) where lib-only slot plugins actually fail.

Parse-level checks tell you the file loads; slot plugins fail at render, with data, under a boundary that
hides the failure. The pre-ship bar must therefore include a data-present render smoke per slot entry —
anything less ships latent ReferenceErrors exactly like this one.

---

## Appendix — empirical verification

`repro.js` (this directory) copies the v0.2.10 `AttachmentChips` verbatim behind minimal stubs and a
simulated slot error boundary. Verified output (`repro-output.txt`):

```
SYNTAX OK                                                    <- node --check passes on the crashing code
case 1 (empty dock):        {"entry":"InputZone:AttachmentDock","mounted":true,"tree":null}
case 2 (chip, phase 'compose', guard truthy):  mounted=true remove.disabled=true   <- || short-circuits
case 3 (chip, phase 'plain', guard falsy):     mounted=false "ReferenceError: busy is not defined"
case 4 (chip, phase absent -> ?? 'plain'):     mounted=false "ReferenceError: busy is not defined"
```

Fixture files referenced (unchanged, read-only):
- `fixture/plugin-dock-chips.js` — v0.2.10 as-shipped component; throwing line :34, `busy` owner :7,
  empty-state gate :23.
- `fixture/feature.diff` — v0.2.11 hover-preview diff; misleading `|| busy` hunk :32-33,
  `record?.items.find` :10, `event.target.closest` :22.
- `fixture/user-thread.md` — user report + maintainer note confirming the slot error-boundary behavior
  and the missing data-present render smoke.
