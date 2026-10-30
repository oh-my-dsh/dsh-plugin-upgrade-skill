# JUDGE BRIEF · noskill.S6-corridor-net-state

## Criteria (sealed rubric)
- [corridor-net-state] (25pt) Explain alpha.1 removal followed by alpha.2 restoration of SessionEvent.ignorable retention, applying the final alpha.2 state to produceExternalEvent in src/events.ts. Correct version history is required; bare A1-02/A2-01 card names earn no credit, and equivalent history without card IDs is acceptable.
- [remove-marker-stripping] (25pt) Locate delete (event as any).ignorable and reject the comment prescribing continued stripping on alpha.2. Recommend removing that defense and correcting its obsolete rationale. Distinguish removing the stripping code from removing the marker itself. It is valid to note that the shown literal currently has no marker, so the delete is a no-op, while still rejecting the intended stripping policy.
- [informational-producer] (25pt) Explain that only informational events whose semantics old readers may omit without breaking reconstruction can carry ignorable:true; required events must not be made ignorable. Retention across persistence/reload is not a reader-side filtering instruction: marked events remain in the loaded log. Apply this to the third-party/informational producer while respecting the live append limitation.
- [public-append-gap] (25pt) Identify the public live Session.append capability gap: it has no supported ignorable parameter. Ordinary plugins must not fake an entry with a cast, invented argument or unsupported API. Explicitly defer the exact producer/persistence integration pending target API verification; naming an undocumented successor is not required. Proposed retention/required-event checks are valid but actual execution is not required.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [keep-stripping-marker] ceiling=10 Trigger only when the final recommendation affirmatively keeps the alpha.1 defense or continues deleting the marker on alpha.2. Negating that recommendation, quoting the old code for diagnosis, or removing the delete statement does not trigger it. Read the entire sentence and conclusion, including double negation and later contradictions.

## Candidate report(s)
#### FILE: S6-corridor-net-state/S6-corridor-net-state-migration-report.md

# S6 · Corridor Net-State Judgment — Migration Report

**Subject plugin:** `dsh-events-bench` (fixture copy), `src/events.ts`
**Target host:** alpha.2
**Corridor:** alpha.1 → alpha.2 (remove-then-restore of the retention semantics)
**Analysis mode:** read-only. No file under `fixture/` was modified, created, or deleted. No code was executed. No network, no build, no reproduction environment.

---

## 0. Evidence base (what I actually read)

| Path | Status |
|---|---|
| `fixture/README.md` | read (3 lines) |
| `fixture/package.json` | read (6 lines, `private: true`, no deps, `type: module`) |
| `fixture/src/events.ts` | read (8 lines) |

Nothing else exists under the two allowed paths. The `agent-output/S6-corridor-net-state/` directory was empty before this report. Everything below is derived from those three files plus the type-system semantics of the host contract they describe; where a claim cannot be sourced from those files it is marked **unconfirmed**.

---

## 1. Verdict

**Delete the defense code.** Both the `delete (event as any).ignorable` statement (fixture/src/events.ts:6) and the stale rationale comment above it (fixture/src/events.ts:3-5) go away. The migration is a pure deletion — a net reduction of work, not a rewrite.

**Reasoning in one line:** alpha.2 restored the retention semantics, so the invariant the defense was protecting ("the host must never see `ignorable` on a third-party event") no longer holds; the code has gone from "harmless hack on the corridor alpha.1" to "silently strips a host-owned marker on alpha.2", which changes the persisted net state instead of preserving it.

---

## 2. Full history of the `ignorable` semantics across the corridor

| Stage | `SessionEvent.ignorable` | Producer obligation | Effect of `delete event.ignorable` |
|---|---|---|---|
| Baseline (pre-alpha.1) | Present on the event contract; retention semantics | the marker means what the host says it means and must be carried, not stripped | **destructive** — would have been wrong even here |
| alpha.1 (`DSH-0.1.2-A1-02`) | **Temporarily removed** from the contract. Readers reject third-party persistent events that carry the marker | keep `ignorable` off the object you hand to `append` | **necessary hack** — the "without deleting the marker readers will reject it" claim is correct *for this stage only* |
| alpha.2 (`DSH-0.1.2-A2-01`) | **Restored** — remove-then-restore pattern closed the loop | the marker is a legitimate, host-owned part of the event shape again; it is retained through write/persist | **obsolete and harmful** — it now fights the restored semantics |

The corridor is a **round trip**, not a straight line. The comment's premise — "alpha.1 removed it, so keep deleting it forever" — treats a temporary corridor state as permanent contract. The fixture README states the target alpha.2 restored the retention semantics and that the correct action is to delete this defense; that matches the target host named in the task brief.

Two structural notes that explain why this trap survives review:

1. `session` and `payload` are typed `any` (fixture/src/events.ts:1). Nothing in the compile ties `event`'s shape to `SessionEvent`, so the host's public types cannot contradict the hack.
2. The `delete` is applied to a property the local object literal never declares, then silenced with `(event as any)` (fixture/src/events.ts:6) — a cast exists precisely to bypass the TS rule that `delete` operands must be optional. If alpha.2 re-declares `ignorable?: boolean` on `SessionEvent`, this line is simultaneously (a) type-legal only because of the cast, and (b) semantically contradictory to the contract it is casting away from.

---

## 3. Deciding by evidence, not by the comment

The comment makes three assertions. Checked against the fixture:

| Comment assertion | Evidence | Verdict |
|---|---|---|
| "alpha.1 removed `SessionEvent.ignorable`" | consistent with the brief and the README's description of the corridor | **true, and only for alpha.1** |
| "without deleting the marker readers will reject it" | a reader-side rejection rule is not observable anywhere in the fixture; no reader, validator, or typings are present | **unconfirmed** in general; plausible for alpha.1 specifically |
| "this must be kept when migrating to alpha.2" | contradicted by the README line stating alpha.2 restored the retention semantics and that the defense should be deleted | **false for alpha.2** |

The comment is a **stale justification scoped to a single corridor stage**, presented as a permanent invariant. Comments do not migrate; contracts do. Migration decisions must follow the target host's contract, and here the target is alpha.2.

---

## 4. Net-state analysis

"Net state" = the event object as it ends up persisted/validated by the host, per corridor stage.

| | alpha.1 + defense | alpha.2 + defense (keep) | alpha.2 without defense (delete) |
|---|---|---|---|
| Does the object carry `ignorable`? | no | no (stripped) | whatever the host contract says |
| Matches the host's contract for that stage? | **yes** (marker absent, as required) | **no** (marker must be preserved under restored retention semantics) | **yes** |
| Is the persisted net state the intended one? | yes | **no** — silent divergence | yes |
| Failure mode on drift | none | silent: the plugin strips a host-owned marker with no error, no throw, no log; divergence is only visible when a reader downstream disagrees about whether the event is ignorable | none |

Two consequences matter for the migration:

- **Keeping it is not a no-op.** Today the literal at fixture/src/events.ts:2 never sets `ignorable`, so the `delete` currently does nothing observable — it is purely prophylactic. That is exactly why it is dangerous: it is a sleeping guard whose trigger conditions moved. Under alpha.2, any path that legitimately gives the object an `ignorable` (a host-provided event template widened in, a spread from a host helper, a future internal that builds on `SessionEvent`, a plugin refactor that stops using a bare literal) gets silently stripped by this line. The bug is latent in the fixture and one edit away from being live.
- **The round-trip trap work is in the defect.** The plugin spent the corridor doing work whose net effect under alpha.2 is *opposite* to what alpha.1 required. This is the classic "corridor net state" case: the correct delta from "what I did on alpha.1" to "what alpha.2 needs" is **remove the work**, not repeat it.

Minor but worth noting: `delete` also forces V8 to move the object into dictionary mode and is a de-optimization at the call site; another reason not to keep a prophylactic `delete` on an object the host immediately serializes.

---

## 5. Correct producer semantics

For a third-party/informational persistent event on alpha.2:

1. **`ignorable` is host-owned, not plugin-owned.** Under the restored retention semantics the marker belongs to the `SessionEvent` contract, is retained by the host, and is interpreted by readers. A plugin must not create, assign, clear, or delete it.
2. **The plugin supplies the documented public shape only** — the event `type` and the `payload` (plus any other field the public typings document on the event it submits). Nothing else.
3. **"Informational, ignorable" is host policy, not producer plumbing.** If the event should be ignorable, that is decided by the host from `type`/payload or by host-side configuration; it is not something the plugin encodes by manipulating a marker. Per the task brief's hint, the public API surface may not even expose that parameter — so the plugin has no legitimate lever here anyway.
4. **No property-level tampering with objects handed to the host.** Object literals you pass into `append` should be the literal, unmutated. Any `delete`/`Object.assign`/cast-around-the-types (fixture/src/events.ts:6) is a smell that the plugin is fighting the contract.

---

## 6. What an ordinary plugin going through `Session.append(...)` should do

Nothing marker-related. Construct the public event and pass it:

```ts
export function produceExternalEvent(session: any, payload: any): void {
  session.append({ type: 'third-party/informational', payload })
}
```

That is the whole migration: delete fixture/src/events.ts:3-6 (comment + `delete`) and inline the literal into the `append` call. No replacement logic, no feature detection, no version branching.

Explicitly **not** recommended, with reasons:

- **Do not set `ignorable: true` (or anything) by hand** — even if alpha.2's typings happen to allow it, that is producer-side override of a host-owned field and is at best unconfirmed in scope here.
- **Do not add a version guard** (`if (hostIsAlpha1) delete event.ignorable`) — the corridor target is alpha.2 only, and the fixture README says the alpha.1 workaround is to be dropped. A guard would carry the sleep-walking defect forward into a branch nobody tests.
- **Do not work around the typings with `as any`** — typing `session`/`payload` as the host's public types is what would have let the compiler catch the corridor change in the first place. Worth doing while you are in this function if the host typings are available to the plugin (see §7).

---

## 7. Unconfirmed / could not verify from the fixture

- **alpha.2 host typings** (`SessionEvent.ignorable`'s exact re-declaration, optionality, and type) — not present in the allowed paths; no `.d.ts`, no `node_modules`, no type tests. The claim that alpha.2 restored the semantics rests on the fixture README and the task brief's corridor description, not on alpha.2 source.
- **The `Session.append` signature** — in particular whether it takes an options/params object and whether any parameter carries ignorable semantics in any version. Unconfirmed; the brief hints the public surface may not expose it, and my recommendation (§6) does not depend on the answer either way.
- **The alpha.1 reader-side rejection rule** — what "reject" meant (throw vs. drop event vs. strip marker) is not observable in the fixture.
- **alpha.2 strictness on extra/unknown keys** — whether the host validates or rejects an event object carrying undeclared properties. Unconfirmed; another reason not to hand the host a mutated, non-literal object.
- **Immutability/freezing of event objects** in alpha.2 — if host-provided objects are frozen, a `delete` in strict-mode module code would throw. Unconfirmed; a further reason the kept line is unsafe.
- **Whether the plugin's build actually type-checks against alpha.2 typings** (the `session: any` / `payload: any` typing means nothing was verified structurally). Unconfirmed — I did not run a typecheck and could not, from the allowed paths.

---

## 8. Migration checklist (proposed, not applied — fixture untouched)

1. `src/events.ts` — delete lines 3-6 (the rationale comment and `delete (event as any).ignorable`), inline the event literal into `session.append(event)` as in §6.
2. Grep the plugin for any other `ignorable`, `delete `, or `as any` that touches objects passed to the host; the same trap pattern may exist in more than one place. *(Only `events.ts` exists in this fixture, so there is at most this one site.)*
3. Where the host typings are available, replace `session: any` / `payload: any` with the real public types so the next corridor shift is caught by the compiler rather than by a reader at runtime. *(Requirements of the typings: unconfirmed.)*
4. Verify against the alpha.2 host, not against this fixture: typecheck the plugin against alpha.2 typings and run the host's own event validation/schema check on a produced event. Neither is runnable from my allowed paths — recorded here so it is not silently skipped.
5. Because the fixture must stay byte-identical to git HEAD, apply this change in the real plugin repository, not in the fixture copy.

**Net result of the migration:** the plugin's events.ts shrinks by four lines and stops tampering with host-owned state; the persisted net state under alpha.2 matches the host's restored retention semantics instead of contradicting them.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.