# S15 · Vanishing Dock Chips — the Silent Slot Crash (Read-Only Diagnosis)

Task: S15-slot-error-boundary-crash · Mode A (inspect, read-only) per the plugin-upgrade skill.
Evidence: fixture read in full (README.md, plugin-dock-chips.js, feature.diff, user-thread.md).
No file inside the fixture or the benchmark repository was modified; no install, build, or migration was executed.

## 0. Scope, mode, and safety

- plugin-upgrade skill, Mode A (read-only investigation and report; then stop). The task brief authorizes exactly this.
- Identity: community Web plugin `@org/dsh-attach-input`, source = shipped `lib/client.js` bundle excerpts; plugin version v0.2.10 → v0.2.11; no registry/git identity given in the fixture (recorded as unknown).
- Evidence conflict recorded up front (skill rule: record both sides, do not silently pick one):
  - `plugin-dock-chips.js` ("as shipped in v0.2.10") contains `disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy` with the anomalous `<-- ???` comment, i.e. the `busy` reference shipped in v0.2.10.
  - `feature.diff`'s `-` context line shows v0.2.10 WITHOUT `|| busy` (the `+` line adds it), i.e. the reference landed in v0.2.11.
  - The maintainer note sides with the fixture file ("v0.2.10 the same component already had the line … || busy").
  Resolution does not change the diagnosis below: whichever tag the line shipped under, the defect is a pre-existing line inside the component, not the hover-preview logic, and the bisection in §2 settles attribution mechanically. The diff's context lines were evidently taken from a base older than the hardening pass.

## 1. Exact root cause

**The throwing expression** (in `AttachmentChips`, the dock-chip component):

```js
disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,   // ReferenceError: busy is not defined
```

`busy` is a **free identifier** in `AttachmentChips`. It is `AttachButton`'s local React state (`const [busy, setBusy] = React.useState(false)`) and is never declared in `AttachmentChips`, `AttachmentDock`, or module scope. There is no bundler magic either: a free identifier in the same module passes through the bundle as a bare global reference, so at render time it throws `ReferenceError: busy is not defined`.

**Why it throws only when a chip renders.** The component begins with

```js
const occurrences = (props.input?.occurrences ?? []).filter(item => item.source === SOURCE);
if (occurrences.length === 0) return null;
```

The empty dock returns `null` before the `h('div', …)` call is ever constructed. The `disabled: …` property is an eagerly-evaluated property of the object literal passed to `h('button', …)`, so it is evaluated once per mapped occurrence — i.e. exactly when at least one pending-attachment chip exists. Paste works (the occurrence is created and the message sends); only the chip UI dies, because only the chip UI evaluates the line.

**Why the `||` short-circuit kept it latent.** `A || busy` evaluates `busy` only when `A` is falsy. `A` is falsy exactly when the composer phase is `'plain'` (the `?? 'plain'` default makes a missing `props.input.phase` falsy too). So the ReferenceError fires only on the conjunction:

- at least one occurrence of `SOURCE` present (otherwise early `return null`), **and**
- `phase === 'plain'` (otherwise the truthy phase guard short-circuits and `busy` is never read).

Every other render path either early-returns or short-circuits, so the bug is invisible to: empty-state renders, locked/non-plain composer phases, and any test that mounts the component without data. The v0.2.10 "hardening pass" added the phase guard and the `busy` reference together and was validated only on those non-firing paths. (Honest note: any v0.2.10 plain-phase render with a chip present would have thrown identically; see the evidence conflict in §0 — the diff indicates the line may only have reached users in v0.2.11. Either way the bisection in §2 attributes it to the pre-existing line, not the feature.)

**Why the symptom is "the whole dock vanished" rather than "the remove button is broken".** The plugin registers the dock through the InputZone slot. A Cordis/React slot entry that throws during render is caught by the framework's **slot-level error boundary, which unmounts the entire slot entry** — not the single element whose props object threw. The `ReferenceError` escapes the `occurrences.map` callback, propagates out of `AttachmentChips`/`AttachmentDock`'s render, and the boundary replaces the whole dock contribution with nothing. There is no partial render, no broken button, and no in-UI error surface: the exception is visible **only in the browser console** (which users never open — the user thread confirms "no error banner in the UI"). The attach button is unaffected because it lives in a different slot entry (`input.left`) with its own boundary scope, and `AttachButton` itself contains no free identifier — `busy` is defined there.

## 2. Why blaming the v0.2.11 diff is the wrong first conclusion

The diff touched the same component (`AttachmentChips`) in the same release as the first field report, so "the hover-preview feature crashed the slot" is the tempting hypothesis. It is wrong (or at least unproven) as a first conclusion:

- The crash line (`|| busy`) is **not part of the hover-preview additions** — it is the hardening line the component already carried (per the shipped file and the maintainer note). The feature only changed *when* the line gets exercised: paste-a-screenshot is the first common flow that produces a chip in plain phase at render time, i.e. the conjunction from §1 fires for the first time at scale. "Old latent bug first exercised now", not "new feature crashed the slot".
- **Correct bisection A — rollback/re-add:** revert only the hover-preview hunks (the `imageItem`, `data-image`, `onClick`, hover-card additions) while keeping the hardening line, mount the dock, paste an image → still crashes. Re-add the feature but delete `|| busy` → renders. The independent variable that flips the crash is the `busy` reference, not the feature.
- **Correct bisection B — minimal render mount:** mount `AttachmentChips` from the **v0.2.10** source with a single fake occurrence (`{ source: SOURCE, ref, occurrenceId, label }`) and `phase: 'plain'` → it throws `ReferenceError: busy is not defined` with zero v0.2.11 code present. That directly proves the defect predates the feature.
- **Distinguishing evidence:** "new feature crashed the slot" would implicate the feature's own expressions — and the shipped v0.2.11 does contain additional defects there (see §3: `imageItem` reads `status`/`record` outside the `map` callback where they are declared, so it also references free identifiers and would throw even earlier in the shipped bundle; plus the non-optional `event.target.closest`). But the console stack trace the user could have pasted names the failing expression; whichever of the two fires first in v0.2.11, mounting the v0.2.10 component reproduces the `busy` crash on its own, which no feature-blaming explanation survives. Blaming the diff also misdirects the fix: removing the hover preview would "fix" the symptom while leaving the latent crash armed for the next plain-phase chip render.

## 3. The fix

Primary fix — **remove the dangling reference** (or scope it properly):

- `AttachmentChips` has no busy concept of its own. Either delete `|| busy` from the `disabled` expression, or, if chips must actually reflect attachment-busy state, thread it explicitly as a prop from whatever owns that state (e.g. `props.busy === true`) — never reference a sibling component's local state variable by name.
- The v0.2.11 hunks need their own repair: `imageItem` is computed *above* the `return h('div', …)` but references `status` and `record`, which are declared with `const` **inside the `.map()` callback** — free identifiers at that position. Move the `imageItem` computation inside the callback, after `record`/`status` are computed (it is per-occurrence data anyway).

Hardening patterns the diff should also get (cheap insurance in slot components, where any throw costs the whole entry, not one element):

- `record?.items ?? []` before `.find(...)`: today `record?.items.find(…)` only survives because the ternary already checked `status !== 'missing'`; if the record shape drifts (`items` absent, or the status check removed in a refactor), this becomes the next unmount-the-dock crash. A `?? []` costs one expression and removes the coupling.
- `event.target.closest?.('.remove')`: the click handler assumes a real Element with `closest`. React event targets can be text nodes or (with portals/svg edge cases) objects without `closest`; one optional chain keeps a malformed target from throwing inside a chip click handler — and a throw inside a slot's event handler can likewise tear down the entry's subtree.

Both patterns matter disproportionately here because of the §1 boundary semantics: in ordinary page code a small guard failure breaks one control; in a slot component it unmounts everything the plugin contributed, silently.

## 4. The regression that would have caught this before release

A **render smoke that mounts the dock WITH an occurrence present** — not the empty state:

- Render `AttachmentChips` (via `AttachmentDock`) with `props.input = { phase: 'plain', occurrences: [{ source: SOURCE, ref: <a ref present in records>, occurrenceId: 'occ-1', label: 'shot.png' }] }`.
- Assert: the chip element (`.dock .chip`) is present in the container, `data-status` is the record's status, and **no error-boundary capture occurred** (with `react-error-boundary`-style harness: assert the fallback did NOT render / the spy error-boundary was not triggered; with plain `react-dom/client` + `act`, assert the render did not throw and the container is non-empty).
- Why the occurrence is the whole point: the empty dock returns `null` *before* the throwing line, so an empty-state smoke passes forever while the bug ships. The test must satisfy the conjunction from §1 — data present **and** plain phase — or it reproduces nothing. Add the locked-phase variant only as a second case to pin the short-circuit path.
- This single test also catches the `imageItem` scoping bug (it throws even earlier, before the map) and, with a record whose `items` is absent, would justify the `?? []` hardening.

## 5. Release-process lesson

- `node --check` (or any syntax-only gate) verifies parseability, not bindings or render behavior. A free identifier like `busy` is **perfectly valid syntax**; it only fails when the interpreter evaluates it, which for a component means render time with data present. A lib-only plugin with no executable entry surface (no CLI, no service start) offers no natural runtime path in CI, so "it parses" had silently become the entire pre-ship gate.
- Minimum viable pre-ship check for slot-rendering lib-only plugins: **a render smoke in CI that mounts every slot contribution with representative non-empty data** — each registered slot entry rendered at least once with (a) the empty/default props and (b) populated props that reach the deepest element tree (chips present, hover-preview path, click handlers constructed), asserting no error-boundary capture and expected DOM output. Concretely for this plugin: a tiny jsdom/react test file in the package's `test` script, run on the **packed/built `lib/client.js`** (so bundler scope errors surface, not just source-tree behavior). That is the smallest gate whose failure mode covers this class: it converts "console-only, whole-entry unmount in production" into a red CI line before release.

## Status per skill report structure

- **pre-existing (baseline)**: not collected — Mode A read-only static analysis; no build/test executed.
- **Completed**: full root-cause analysis, bisection design, fix design, regression design, release-process recommendation (this report).
- **Skipped**: no runtime reproduction (fixture is static and must not be executed; no browser/host available in scope); no dependency/version corridor work (not a host-upgrade regression — the defect is plugin-local and version-independent).
- **Pending/residual risk**: the §0 evidence conflict (which tag first shipped `|| busy`) is unresolved from static evidence; the real `phase` value distribution in production (how often plain-phase chips rendered under v0.2.10) is unknowable from the fixture. Both are recorded, not guessed.
- **Rollback**: N/A — no files outside the report directory were touched.
- **Recommendations**: adopt the data-present render smoke as a release gate for all slot-rendering lib-only plugins; prefer explicit props over cross-component identifier reuse in bundled client code.
