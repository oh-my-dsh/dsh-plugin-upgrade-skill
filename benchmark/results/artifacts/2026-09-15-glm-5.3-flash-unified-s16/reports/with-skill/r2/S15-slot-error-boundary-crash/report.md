# S15 · Vanishing Dock Chips: the Silent Slot Crash — Diagnosis

Task: post-release regression report for `@org/dsh-attach-input` v0.2.11 (hover-preview release).
Evidence: `fixture/plugin-dock-chips.js` (v0.2.10 as shipped), `fixture/feature.diff` (v0.2.11),
`fixture/user-thread.md`. All findings below were verified empirically with the accompanying
read-only repro `repro-busy-latency.mjs` (same directory), which re-declares the shipped
component verbatim and mounts it in three states. The fixture itself was not modified.

Repro output:

```
--- node --check passes ---                      <-- the same dangling reference parses clean
[1] empty dock            -> null
[2] chip + locked phase   -> rendered; remove.disabled = true (short-circuit, no throw)
[3] chip + plain phase    -> threw: ReferenceError: busy is not defined
[4] non-image chip, plain -> threw: ReferenceError: busy is not defined (hover-preview code paths never ran)
```

---

## 1. Exact root cause

**The throwing expression** is the `disabled:` value of the chip's remove button in
`AttachmentChips` — `lib/client.js` line 34 as shipped in v0.2.10:

```js
disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,   // <-- ???
```

**Why it throws:** `busy` is a free identifier in `AttachmentChips`. The only `busy` binding
in the file is the `useState` pair inside `AttachButton` (`const [busy, setBusy] =
React.useState(false);`, line 7). JavaScript resolves identifiers only through the current
function's own scope chain; a *sibling* function's locals do not leak, and there is no
module-level `busy`. So the first evaluation of the right operand throws
`ReferenceError: busy is not defined`. This is a runtime scope failure, not a syntax error —
`node --check` accepts the file (repro header line). It is not even a TDZ error: there is no
`busy` binding anywhere on `AttachmentChips`'s scope chain to be "uninitialized"; the name
simply does not exist there. The reference was pasted from `AttachButton`'s idiom during the
v0.2.10 hardening pass without noticing that `busy` belongs to a different component.

**Why it throws only when a chip renders:** the expression sits inside the
`h('button', { … })` argument object, inside the `occurrences.map(…)` callback — and the map
only runs *after* the early exit on line 23:

```js
if (occurrences.length === 0) return null;
```

With no pending attachments the function returns before the throwing line is ever evaluated.
The first occurrence — exactly what a pasted screenshot creates — is what first reaches it.
Verified: empty dock renders `null` (repro [1]); one occurrence in the idle phase throws
(repro [3]).

**Why the `||` short-circuit kept it latent through v0.2.10:** in `A || busy`, the right
operand is evaluated only when `A` is *falsy*. Here `A` is the phase guard
`(props.input?.phase ?? 'plain') !== 'plain'`, which is false only in the idle/unlocked
`'plain'` state. Whenever the composer is locked (non-plain phase), the guard is `true`, the
`||` short-circuits, and the dangling `busy` is never touched — the whole expression
evaluates to `true` with no error (repro [2] renders fine, `disabled = true`). The crash
therefore needs the **conjunction** "a chip renders" ∧ "phase is `'plain'` (or absent, via
the `?? 'plain'` default)". Throughout v0.2.10's real flows that conjunction never occurred:
the dock re-renders on occurrence revisions (`useRevision()`), and in the v0.2.10 flows
every render that reached the `disabled` expression happened while the composer phase was
locked, so every evaluation took the short-circuit branch. The dangling identifier shipped
in a released version and simply never executed — that is the short-circuit latency. It is
invisible to syntax checks *and* to every empty-state test, because in both cases the token
is never evaluated.

> Evidence wrinkle, recorded rather than silently resolved (per skill discipline: when
> observations conflict with a primary source, record both and reproduce): `feature.diff`'s
> `-` line shows v0.2.10 *without* `|| busy`, while the shipped v0.2.10 file (fixture line
> 34) and the maintainer note both state the hardening pass added it in v0.2.10. Either way
> — the published v0.2.10 artifact carried the line masked by short-circuit latency, or the
> diff's before-state is inaccurate — the bisection in §2 resolves it against the published
> artifact, which is the primary source, not the diff.

**Why the symptom is "the whole dock vanished", not "the remove button is broken":** the
plugin registers the dock through the InputZone slot, and the framework mounts each slot
entry inside its own error boundary. A throw during render is caught at the *entry* level,
and the boundary's recovery is to **unmount the entire entry** — so one bad chip render
removes the whole dock (all chips, the container, everything `AttachmentDock` would have
rendered), not a partially rendered dock with one broken button. The attach button is a
separate slot entry (`input.left` → `AttachButton`) with its own boundary, so it survives —
matching the user report exactly. And the boundary swallows the error after logging it:
there is no error banner in the UI. The stack trace (`ReferenceError: busy is not defined`)
exists **only in the browser DevTools console**, which end users never open. That is why the
field report reads as a silent vanishing rather than a crash.

---

## 2. Why blaming the v0.2.11 diff is the wrong first conclusion

**The tempting story:** the crash surfaced immediately after shipping the hover-preview
release; `feature.diff` touches exactly the component that crashes (`AttachmentChips`); and
the diff's hunk even *shows* `disabled: … || busy` as a newly added line. So "the new
feature's code crashed the slot" looks obvious, and the natural (wrong) move is to start
auditing `isImagePath` / `objectUrlOf` / `openImageViewer` / the new chip `onClick`.

**Why it is wrong:**

1. **The reference predates the feature.** The shipped v0.2.10 source already contains
   `disabled: … || busy` (fixture line 34, marked `???`), and the maintainer note
   corroborates it came from v0.2.10's hardening pass — with v0.2.10 users clicking the x
   button without reports. v0.2.11 is merely the first release in which the crash *path*
   (chip render ∧ idle phase) was exercised.
2. **The crash is feature-independent.** It reproduces with a plain non-image attachment,
   where none of the hover-preview code (`imageItem`, `isImagePath`, `objectUrlOf`,
   `openImageViewer`, hover-card, chip `onClick`) executes at all. Verified: repro [4]
   throws the identical `ReferenceError: busy is not defined` for `notes.txt`.
3. **A diff is a narrative artifact, not ground truth.** Diffs get regenerated against a
   stale base or hand-edited for release notes; this one's before-side contradicts the
   shipped v0.2.10 file. The published artifact and tag source are the primary evidence.

**The correct bisection:**

- **Rollback / re-add bisect.** Install the exact published v0.2.10 artifact and mount the
  dock in a minimal render harness with one occurrence at phase `'plain'`: the same
  ReferenceError fires → the crash exists with zero v0.2.11 code. Re-apply the v0.2.11 diff
  on top: the crash is unchanged → the diff neither caused nor altered it. (Equivalent
  inverse: on v0.2.11, revert *only* the hover-preview additions and keep everything else —
  the crash persists.)
- **Minimal render mount** (cheaper, no install dance): call
  `AttachmentChips({ input: { phase: 'plain', occurrences: [one] } })` with a stub `h` (the
  repro needs no DOM at all) and read the stack frame. It names the *pre-existing* remove
  button `disabled` line (repro: the `busy` token on the `disabled:` line), not any symbol
  introduced by the diff.

**Evidence distinguishing "new feature crashed the slot" from "old latent bug first
exercised now":**

- *Stack frame location* — points at the pre-existing `disabled:` line, never at
  `imageItem`/`onClick`/`objectUrlOf`.
- *Data dependence* — crashes on non-image occurrences (feature paths untouched) and only in
  the idle phase; the trigger is a state-machine conjunction, not a feature.
- *Artifact proof* — `grep -n '|| busy'` on the published v0.2.10 tarball's `lib/client.js`
  finds the reference (check the packed artifact, not the repo, which also rules out
  source↔published-artifact drift as the alternative explanation of the diff conflict).
- *Bisection outcome* — rollback still crashes under the identical minimal mount.

---

## 3. The fix, and the two hardening patterns the diff should also get

**Fix:** remove the dangling reference — restore the guard alone:

```js
disabled: (props.input?.phase ?? 'plain') !== 'plain',
```

There is nothing to "define" locally that would carry the intended meaning:
`AttachmentChips` has no busy state of its own; `busy` was copy-pasted from `AttachButton`,
where it is unreachable. Do **not** "fix" it by declaring a module-level `let busy` — that
would silently couple every chip to whatever wrote it last. If disable-while-busy is a real
product requirement, scope it properly through the seam that exists: render it from
composer state the host already provides (`props.input?.busy`) or thread it as an explicit
prop from the slot registration.

**Hardening the v0.2.11 diff itself** (both patterns from the task brief):

1. **`record?.items ?? []`-style defensive reads.** As written, the diff computes
   `record?.items.find(item => isImagePath(item.path))`. `record` can be absent (purged or
   unresolved ref at render time) and `items` can be missing; `.find` on `undefined` is a
   `TypeError`. Make every read defaulted:
   `(record?.items ?? []).find(item => isImagePath(item?.path ?? ''))`. Also note the diff
   hoists `imageItem` above the `map`, where its `record`/`status` are not in scope at all —
   compute it per occurrence inside the map. (That scoping slip is more evidence the diff
   was never render-exercised — though per §2 the bisection shows it is not the user's
   crash.)
2. **Optional-chained event guard:** `if (event.target.closest?.('.remove') !== null)
   return;`. `event.target` is not guaranteed to be an `Element` (text nodes, exotic or
   synthetic targets, polyfilled environments); without `?.` a single odd click throws
   inside the slot entry. With `?.`, the "can't tell" case degrades to the safe default
   (`undefined !== null` → early return → viewer not opened).

**Why these are cheap insurance in slot components:** slot components render from
host-owned, asynchronously mutating data — occurrences, a `records` map, DOM events — whose
shape and lifecycle they do not control. And the failure mode of *any* throw is total: the
slot error boundary unmounts the entire entry, so a missing thumbnail becomes "the whole
dock is gone" (this incident, twice over). A one-token `?.` / `?? []` costs nothing on the
happy path and converts a potential feature outage into a cosmetic degradation. It is the
highest value-per-character hardening available in slot code.

---

## 4. The regression that would have caught it

**A render smoke that mounts the dock/chip component WITH an occurrence present, in the
idle phase — not the empty state.** The empty dock returns `null` before the throwing line
(line 23 early-return), so every empty-state mount passes while the bug ships. That is
exactly why "worked fine in testing" held: the only harness that existed exercised the one
state that cannot reach the bug.

Concrete shape (jsdom/happy-dom, or the real client harness, run against the *built*
`lib/client.js`):

```js
records.set('r1', { status: 'ready', label: 'shot.png' });
const input = { phase: 'plain',
                occurrences: [{ source: SOURCE, ref: 'r1', occurrenceId: 'o1', label: 'shot.png' }] };

let captured = null;
class BoundarySpy extends React.Component {
  componentDidCatch(e) { captured = e; }          // what the host's slot boundary would do
  render() { return this.props.children; }
}
render(h(BoundarySpy, null, h(AttachmentDock, { input })));

assert(document.querySelector('.dock .chip .name').textContent === 'shot.png'); // chip rendered
assert(document.querySelector('.dock button.remove[aria-label="Remove shot.png"]'));
assert(captured === null);                       // no error-boundary capture — the load-bearing assert
```

The "without an error-boundary capture" assertion is load-bearing: the boundary converts
the throw into a *silent unmount*, so a smoke that only checks "did my code throw" passes
while the feature is gone. Assert the chip element exists **and** no capture fired. Run the
same mount a second time with a locked phase (`phase: 'sending'`) to pin the short-circuit
branch's behavior (renders; remove disabled) — that documents the latency mechanism in the
test suite itself.

Had this existed, v0.2.11's CI fails in seconds with `ReferenceError: busy is not defined`
pointed at line 34 — before the release, not after a user report.

---

## 5. The release-process lesson

**Why "syntax check only" (`node --check`) was insufficient:** `node --check` proves the
file *parses*, nothing more. `busy` in `AttachmentChips` is a free identifier — perfectly
legal syntax; parse-level tools cannot see cross-function scope, and an unresolved binding
fails only at runtime, only at evaluation, only with data present. For a **lib-only**
plugin (hand-maintained/bundled `lib/client.js`, no TypeScript typecheck, no ESLint
`no-undef`, no build step that would ever look at the name `busy`), the whole pre-ship
pipeline was: parse → publish. The component then (a) registers and activates fine —
activation never renders; (b) renders fine empty — the early return; and (c) explodes on
the first paste with the composer idle — the single most common action for an attachment
plugin. Every check that ran was aimed at the wrong layer, and the slot error boundary
guaranteed the failure would be invisible (no banner, console-only) until a user noticed
the missing UI.

**Minimum viable pre-ship check for slot-rendering lib-only plugins** (in cost order):

1. Keep `node --check` — it catches syntax for free.
2. Add one *scope-aware static pass*: `eslint --no-eslintrc --env browser --rule
   '{"no-undef":"error"}' lib/` (or `tsc --noEmit --allowJs --checkJs` over `lib/`). Either
   flags `busy` in seconds, with no browser and no harness. This alone would have stopped
   this release.
3. The non-negotiable one: a **headless mount-with-data smoke** (§4) that renders every
   registered slot entry with at least one seeded occurrence/record in the idle phase, and
   fails on any uncaught render error or error-boundary capture. For slot components the
   unit of correctness is "renders with data inside the host's boundary" — `node --check`
   proves the file parses; only a mount proves the feature renders.

One-sentence gate: for lib-only slot plugins, "parsed clean" must be upgraded to "no-undef
lint clean **and** mounted once with data present in a headless harness" before publish.

---

## Summary

| Question | Answer |
|---|---|
| Root cause | Free identifier `busy` (belongs to `AttachButton`'s `useState`) referenced in `AttachmentChips`' remove-button `disabled:` expression → `ReferenceError: busy is not defined` at render |
| Why only with a chip | Expression lives inside `occurrences.map(...)`, after the `length === 0 → return null` early exit |
| Why latent in v0.2.10 | `\|\|` short-circuit: right operand evaluated only when the phase guard is false (idle phase); every v0.2.10 evaluation took the locked-phase branch |
| Why "dock vanished" | Slot-level error boundary unmounts the whole InputZone entry on a render throw; attach button is a separate entry; error is console-only |
| Wrong first conclusion | The v0.2.11 diff touched the same component (and appears to add the line); but the reference is pre-existing, feature-independent (non-image crashes too), and diffs are not primary evidence |
| Correct bisection | Rollback/re-add bisect with a minimal render mount; stack frame + non-image repro + grep of the published v0.2.10 tarball attribute the crash to the old line |
| Fix | Delete `\|\| busy` (or thread real busy state via props/`input` state — never a sibling's local, never a module global) |
| Diff hardening | `(record?.items ?? []).find(...)` defensive reads (and compute `imageItem` inside the map, where its names are in scope); `event.target.closest?.('.remove')` |
| Missing regression | Data-present render smoke: mount dock with one occurrence at idle phase; assert chip renders and no boundary capture |
| Process lesson | `node --check` is parse-only; minimum gate for lib-only slot plugins = `no-undef` lint + headless mount-with-data smoke against the built artifact |

*Verification artifacts: `repro-busy-latency.mjs` (this directory) — run with `node
repro-busy-latency.mjs`; contains no fixture modification and no installs.*
