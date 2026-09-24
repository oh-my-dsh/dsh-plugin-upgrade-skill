# S15 · Vanishing Dock Chips — the Silent Slot Crash (Read-Only Analysis)

Plugin under investigation: `@org/dsh-attach-input` (community Web plugin, lib-only distribution).
Symptom: after v0.2.11 (hover-preview release), pasting a screenshot no longer shows the
pending-attachment chip above the input. Paste itself works; the attach button is unaffected;
no error banner appears in the UI.

Evidence used (read-only fixture):
- plugin-dock-chips.js — AttachmentChips / AttachmentDock / AttachButton as shipped in v0.2.10
- feature.diff — the v0.2.11 hover-preview diff touching the same component
- user-thread.md — the user report and the maintainer's note

---

## 1. Exact root cause

### The throwing expression

The crash is a **free-identifier ReferenceError inside `AttachmentChips`**:

```js
disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,   // <-- ???
```

`busy` is a `React.useState` variable that lives **inside `AttachButton`** (see the
fixture: `const [busy, setBusy] = React.useState(false); // <-- busy lives HERE`). It is a
local binding of a different function in the same module. `AttachmentChips` has no
`busy` in any enclosing scope and there is no global `busy`, so the moment the right
operand of `||` is evaluated, the expression throws
`ReferenceError: busy is not defined` during render. This is not a syntax error and not a
type error — it is a *runtime* identifier-resolution failure, which is exactly why
`node --check` and any static parse pass green (see §5).

A second, related free-identifier defect ships in the same v0.2.11 file: the diff hoists

```js
const imageItem = status !== 'missing' ? record?.items.find(...) : undefined;
```

**above** the `.map()` callback that declares `const record = records.get(...)` and
`const status = record?.status ?? 'missing'`. From the outer function body those names are
out of scope, so this line is also a `ReferenceError` when reached. Whatever the exact
first-throwing line on a given build (see the bisection in §2 for how to tell), the root
cause **class** is identical and the fix discipline is the same: identifiers read at render
time must be in scope and defensively accessed.

### Why it throws only when a chip renders

`AttachmentChips` starts with:

```js
const occurrences = (props.input?.occurrences ?? []).filter(item => item.source === SOURCE);
if (occurrences.length === 0) return null;
```

The empty state returns `null` **before** any of the throwing code is reached. The
`imageItem` line sits after the early return, and the `disabled: ... || busy` expression
is inside the `.map()` that only runs when `occurrences.length > 0`. Consequences:

- Dock with no pending attachments of this plugin's source → renders `null` → never throws.
- Dock with ≥1 occurrence (a pasted screenshot creates one) → identifier resolution runs →
  throw. This is why "the paste itself still works" (the attachment pipeline is fine) while
  "the chip is gone": the crash is purely in the chip-rendering path.

### Why the `||` short-circuit kept it latent through v0.2.10

`||` evaluates its right operand only when the left operand is falsy. The left operand,
`(props.input?.phase ?? 'plain') !== 'plain'`, is:

- **truthy whenever the input is in any non-plain phase** (locked, busy, submitting…). In
  that whole family of states the expression short-circuits to `true`, `busy` is never
  so much as mentioned, and the line is harmless.
- **falsy only in the narrow case phase === 'plain'` — and, because of the early return,
  only when at least one chip is present at that moment.

So the crash requires the *conjunction* "chip present AND plain phase". That is a narrow,
data- and state-dependent path:

- Renders without a pending attachment never reach it (early `return null`).
- Renders while the composer is locked/busy never evaluate `busy`.
- No combination of empty-state testing, locked-state testing, or `node --check` ever
  executes it.

A dangling reference placed to the right of an almost-always-true guard is the classic
latent render bomb: it survives any amount of testing that does not hit the exact
chip-present/plain-phase combination. v0.2.11 first mass-exercised that combination,
because its headline feature is precisely "paste a screenshot and look at the chip" — the
hover preview draws users into rendering the dock with an image occurrence while the input
sits idle in plain phase.

(Note for the record: the diff's minus-side shows the v0.2.10 line without `|| busy`,
while the shipped v0.2.10 file and the maintainer's own note both state the hardening pass
put `|| busy` in v0.2.10. A diff computed against a stale base misattributes lines; the
shipped artifact and the runtime stack trace, not the diff context, are authoritative. See
§2 — this discrepancy is exactly why "blame the diff" is the wrong first move in both
directions.)

### Why the symptom is "the whole dock vanished", not "the remove button is broken"

The plugin renders the dock through the **InputZone slot** as a slot entry. The framework
wraps slot entries in a per-entry **error boundary**. A throw anywhere inside
`AttachmentChips` — whether it nominally "belongs to" the remove button's `disabled`
prop or to the hover-preview lookup — happens during the render of the *whole entry*, so
the boundary catches it and **unmounts the entire dock entry**, not the failing sub-element.
There is no partial degradation: you never see "a chip with a broken x"; you see nothing.

And the failure is **console-only**: the boundary logs the error to the browser console and
the UI stays quiet (no banner, no placeholder). Users like the reporter never open the
console, so from the outside the feature silently disappeared. The attach button survives
because it is a *separate* slot entry (`input.left`) rendered by `AttachButton` — the
component that actually owns `busy` — and its boundary never fires.

---

## 2. Why blaming the v0.2.11 diff is the wrong first conclusion — the correct bisection

The tempting story is "the hover-preview feature crashed the slot". It is the wrong first
conclusion for three reasons:

1. **The diff touched the same component, so proximity is not causation.** The file the
   feature landed in already contained a state-identifier leak from another component
   (`busy`) added by an earlier hardening pass. Any crash in that file will *look* new if
   you only read the diff.
2. **The diff itself is not a reliable base.** As noted above, its context lines contradict
   the shipped v0.2.10 artifact about who added `|| busy`. Diff hunks carry stale or
   rebased context; they are a hint, not evidence.
3. **The mechanism was data-gated before, and the feature merely supplies the data.** The
   crash path needed "occurrence present + plain phase"; the hover-preview release is the
   first version whose advertised flow *is* that path. First-exercised ≠ first-introduced.

### The correct bisection

- **Rollback/re-add bisect:** ship a build with only the hover-preview additions reverted
  (busy line untouched). If the dock still vanishes on paste, the feature additions are
  exonerated and the pre-existing line is implicated. Then re-add the feature on top of a
  fixed busy line; if the dock survives, the old latent bug is confirmed as the trigger.
- **Minimal render mount (the decisive, cheap test):** in a jsdom/happy-dom harness, mount
  `AttachmentDock` directly with props describing exactly one occurrence
  (`input: { phase: 'plain', occurrences: [{ source: SOURCE, ref, occurrenceId, label }] }`)
  and a stubbed `records` map. Open the console / wrap the mount in a capturing error
  boundary. **The stack trace names the file and the exact line** — that single observation
  resolves the attribution question the diff cannot: if the trace points at the
  `disabled: ... || busy` line, it is the old latent bug; if it points at the hoisted
  `imageItem`/`status` line, the feature code is the throw site. Either way the same
  minimal mount is the reproduction, the diagnosis, and (§4) the regression test.

### Evidence that distinguishes the two hypotheses

| Observation | "New feature crashed the slot" | "Old latent bug first exercised now" |
|---|---|---|
| Stack trace from minimal mount with chip present, plain phase | points at `imageItem`/`status`/`record` lines | points at the `disabled: ... || busy` line |
| Rollback of hover-preview additions only | dock reappears | dock still vanishes |
| v0.2.10 artifact + maintainer note on the busy line | irrelevant | consistent with it |
| Diff context lines | sufficient proof | unreliable (stale base) |
| Timing correlation with the feature's user flow | necessary but not sufficient | explains exposure, not introduction |

The key epistemic point: a *recent diff in the same file* raises prior probability but
proves nothing; only an executed reproduction with the actual data state present attributes
the throw.

---

## 3. The fix

**Primary:** remove the dangling reference. `AttachmentChips` has no legitimate access to
`AttachButton`'s `busy`; a disabled state of one component must not be read from
another. Either:

- drop it entirely — `disabled: (props.input?.phase ?? 'plain') !== 'plain'` — if the
  chip's remove button only needs the phase lock (the pre-hardening behavior, which users
  used fine); or
- **scope it properly**: if chips must also disable during an in-flight add/remove, lift the
  in-flight flag to the shared parent (or the plugin's config/state) and pass it down as an
  explicit prop, e.g. `props.busy`, owned where both `AttachButton` and
  `AttachmentChips` can see it. Never reach into another component's locals.

**Secondary (must-fix in the same pass):** the v0.2.11 hoisted lookup must move *inside* the
`.map()` callback after `record`/`status` are declared, or receive them as values
computed there.

**Hardening the diff should also get:**

1. `record?.items ?? []`-style defensive reads — the diff writes
   `record?.items.find(...)`. `record` is optional-chained, but `items` is not: a
   record object without an `items` array turns the same silent-slot-crash into
   `TypeError: Cannot read properties of undefined (reading 'find')`. Writing
   `(record?.items ?? []).find(...)` (and generally defaulting every collection read at
   the slot boundary) costs one token and removes a whole error class.
2. Optional-chained DOM access — `event.target.closest?.('.remove')`. React event targets
   are not guaranteed to be Elements in every replay/synthetic path; if `target` is, say,
   a text node or a synthetic object without `closest`, the handler throws inside the
   click path. `(event.target.closest?.('.remove')) != null` is free insurance.

Why cheap insurance matters specifically in slot components: as §1 shows, the failure mode
of a slot component is not "this button is broken" — it is "the whole entry silently
unmounts and the error is buried in a console users never open". The blast radius of any
single unguarded expression is the entire dock, and the feedback loop for noticing it is
essentially nonexistent. Defensive reads convert would-be unmounts into harmless
`undefined`s that fall through to the no-preview branch.

---

## 4. The regression that would have caught this before release

A **render smoke that mounts the dock WITH an occurrence present** — not the empty state:

```js
// contract: the dock renders a chip for a present occurrence without throwing
const onError = vi.fn();                       // or: mount inside a capturing error boundary
const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
render(h(AttachmentDock, {
  input: {
    phase: 'plain',                            // MUST be plain: the || left operand must be falsy
    occurrences: [{
      source: SOURCE,                          // must pass the filter, or the early return hides everything
      ref: someRef,
      occurrenceId: 'occ-1',
      label: 'screenshot.png',
    }],
  },
  remove: () => {},
}), { wrapper: CatchingBoundary(onError) });

expect(screen.getByRole('button', { name: /remove/i })).toBeTruthy();  // chip rendered
expect(onError).not.toHaveBeenCalled();        // no error-boundary capture
```

Why each ingredient is load-bearing:

- **Occurrence present**: with zero occurrences the component returns `null` before the
  throwing line; an empty-state smoke passes forever while the bug ships. This is precisely
  the coverage gap the maintainer acknowledged ("we shipped without a render smoke that
  mounts the dock with a chip present").
- **`phase: 'plain'`**: any non-plain phase makes the left operand truthy and
  short-circuits past `busy`; a smoke that mounts with a locked/submitting input also
  passes forever.
- **Assert on both sides**: assert the chip element renders *and* that no error-boundary
  capture / console error occurred. A test that only asserts "no crash" via a swallowed
  boundary would mistake the unmount for a pass; a test that only queries the element fails
  for the right reason but reports poorly.

The same test, run against v0.2.10's busy line, would have flagged the latent bug a release
earlier — the regression is not feature-specific, it pins the render contract of the slot.

---

## 5. The release-process lesson

**Why "syntax check only" (`node --check`) was insufficient:** `node --check` parses the
file and validates syntax — nothing else. A free identifier like `busy` (or `status`
read outside its scope) is *syntactically perfect JavaScript*; identifier resolution happens
at runtime, per evaluation, and only on the exact path that reaches it. For a **lib-only
plugin** there is no bundler type-check, no test suite, and no import of the component by
any host build — the shipped `lib/client.js` is first *executed* inside users' browsers,
in the slot, with real data. So the first time anyone evaluated the expression was after
release, behind a console-only error boundary. Syntax checks cannot catch: undefined
references, wrong-scope references, wrong prop names, throws under real data shapes.

**Minimum viable pre-ship check for slot-rendering lib-only plugins:** a data-present
render smoke — mount the component (jsdom/happy-dom) through the same props shape the slot
contract delivers, with (a) at least one real occurrence/item so the non-null path runs,
(b) the default/idle state values (e.g. plain phase) so short-circuit guards don't hide the
right-hand operands, and (c) an error-boundary/console capture assertion so a silent unmount
fails the check loudly. It requires no browser, no API, no key — it is a few dozen lines of
vitest/jsdom and would have caught both this bug and its latency in seconds. Pair it with
`node --check` (still useful for parse errors) but never treat it as render correctness.

---

## Summary

- **Root cause:** `ReferenceError` on the free identifier `busy` (state of
  `AttachButton`) read in `AttachmentChips`' `disabled: ... || busy` expression — a
  pre-existing line, latent because the `||` short-circuit skipped it except on the
  chip-present + plain-phase path, which v0.2.11's paste-a-screenshot feature first
  mass-exercised. The v0.2.11 diff additionally hoists `status`/`record` out of scope
  for the hover-preview lookup — same defect class, same fix discipline, and attribution
  between the two must come from a stack trace, not from reading the diff.
- **Symptom shape:** slot-level error boundary unmounts the whole InputZone entry;
  console-only error; separate slot entries (attach button) unaffected.
- **Fix:** remove/scoped-lift the dangling `busy`; re-scope the image lookup; add
  `(record?.items ?? [])` and `closest?.()` defensive reads.
- **Regression:** data-present render smoke (occurrence present, plain phase, assert chip
  renders + no boundary capture).
- **Process:** `node --check` proves parse-ability only; the minimum bar for slot-rendering
  lib-only plugins is a data-present render mount in jsdom before every ship.
