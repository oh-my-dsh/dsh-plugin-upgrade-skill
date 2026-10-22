# S6 · Corridor Net-State Judgment — Migration Report (Read-Only)

- **Task**: Judge the fate of the alpha.1-era "defense code" in `fixture/src/events.ts` when the target host is **DSH 0.1.2-alpha.2**.
- **Mode**: read-only analysis (skill Mode A · inspect). **No file under `fixture/` was modified, and nothing was executed or installed.** Fixture integrity is unchanged (still the original three files: `package.json`, `README.md`, `src/events.ts`).
- **Evidence base (read-only)**: the fixture itself, plus the read-only `plugin-upgrade` skill reference at `skills/plugin-upgrade/` — specifically `references/v0.1.2-alpha.1.md` (DSH-0.1.2-A1-02), `references/v0.1.2-alpha.2.md` (DSH-0.1.2-A2-01), `references/api-migration-0.1.2-alpha.2.md` (API-05 + the SessionEvent row of the summary table), `references/rollup-0.1.2.md` (corridor-folding rule), `references/v0.1.5-alpha.2.md` (DSH-0.1.5-A2-05, later corroboration), `SKILL.md`. No network, no host source tree, no `node_modules`.

---

## 1. Verdict: **DELETE the defense code**

```ts
// fixture/src/events.ts:7-8  (delete these two lines together with the comment)
delete (event as any).ignorable
```

The alpha.1-era defensive deletion must be **removed**, not kept and not "delete then re-add". The corridor net state at alpha.2 is that the `ignorable` marker semantics **is present and must be preserved**; the alpha.1 removal was a temporary detour that alpha.2 explicitly reverted. Keeping code that actively strips the marker points the producer in exactly the wrong direction for the target version.

### 1.1 Full history of this semantics across the corridor (folded to net state)

| Corridor point | State of `SessionEvent.ignorable` | Card / evidence |
|---|---|---|
| 0.1.1-rc.2 and earlier (baseline) | Exists on the event envelope; third-party informational persisted events carry `ignorable: true` | `SKILL.md` Mode C item 2 + `evals/evals.json` eval #2 ("On rc.2 the plugin emits third-party informational persistent events (with `ignorable: true`)"); `examples/legacy-plugin/src/index.ts:15-19` shows the intended producer shape |
| **0.1.2-alpha.1** | **Temporarily removed.** alpha.1 "cannot preserve the `ignorable: true` marker on third-party informational events; when first-party readers encounter unknown persisted events, they reject the reload treating them as required events." Action level is literally `required-if-target-is-alpha.1` | `references/v0.1.2-alpha.1.md` · DSH-0.1.2-A1-02 |
| **0.1.2-alpha.2 (target)** | **Restored** (type: fix). "What alpha.2 restores is the retention semantics of envelope/persistence/reload/transport … old adapters that keep dropping the marker will make first-party readers reject Sessions containing unknown events." | `references/v0.1.2-alpha.2.md` · DSH-0.1.2-A2-01 |
| 0.1.2-alpha.3 → alpha.5 → rc.1 | No card re-touches `ignorable` (the rollup notes alpha.2→alpha.3 and alpha.5→rc.1 have zero cards; the `ignorable` grep over the whole skill tree hits nothing in alpha.3/4/5/rc.1) → semantics stable at the restored state | `references/rollup-0.1.2.md:34` |
| Later corridor (0.1.5-alpha.2, corroboration) | Reader-side rule unchanged: storage refuses "unknown to this harness and not marked ignorable"; and it reconfirms "`Session.append()` has no `ignorable` channel" | `references/v0.1.5-alpha.2.md` · DSH-0.1.5-A2-05 |

**Folded net state for the alpha.1 → alpha.2 jump: remove-then-restore ⇒ net = the marker exists and must survive end-to-end.** The rollup states this rule verbatim: "a field or its semantics may be removed in an intermediate version and restored in a later one (the canonical example is `ignorable`, removed by DSH-0.1.2-A1-02 and restored by DSH-0.1.2-A2-01) … do not delete once for alpha.1 and then add it back for alpha.2; **if the final target restores that semantics, defensive code in old-version adaptations should be removed rather than kept**" (`references/rollup-0.1.2.md:52-55`). A1-02 itself says the same: "If the final target is alpha.2 or later, first read DSH-0.1.2-A2-01 to compute the corridor net state; **do not delete the producer marker and then restore it**."

### 1.2 Why the comment is wrong — evidence, not folklore

The in-code comment (`fixture/src/events.ts:5-6`) claims: "alpha.1 removed `SessionEvent.ignorable` (DSH-0.1.2-A1-02). If you don't delete the marker, readers will reject it, so delete the marker before writing. Keep this when migrating to alpha.2." Both halves fail against the primary cards:

1. **The causal direction is inverted.** Readers do not reject events *that carry* the marker. A1-02's symptom is the opposite: because alpha.1 could not *preserve* the marker, unknown persisted events became **required**, and readers then reject the reload. A2-01/API-05 state the reader rule positively: "when a reader meets an unknown type, it may continue only if that event already carries `ignorable: true`; **a missing field means required**", and unknown events without the marker "remain required-on-read" / fail closed. Stripping a marker can only *cause* the rejection the comment claims to prevent.
2. **It never implemented the alpha.1 defense in the first place.** The sanctioned alpha.1 mitigation was not "delete a marker": A1-02's recipe is "**temporarily stop writing that unknown persisted event, or switch to public event vocabulary that the target version already knows**" (and explicitly *not* a consumer whitelist). `delete (event as any).ignorable` still writes the event; it only mutates a property of the object literal. On the object literal in this fixture the property is never set, so the statement is a **no-op dead line** — it changes nothing about the persisted outcome on either version.
3. **On the target it is actively harmful in the one direction alpha.2 cares about.** A2-01's symptom line is written for exactly this residue: "now that alpha.2 restores it, **old adapters that keep dropping the marker will make first-party readers reject Sessions containing unknown events**." If the event object ever reaches this seam already carrying a marker (reload/transport/envelope path, or a caller-built event), the `delete` converts an omission-safe informational event into a **required** event → whole-session cold-load refusal (`SessionFormatUnsupportedError`-class failure per API-05: "writes succeed live, but the whole session is refused on cold load"). That is a silent write / loud read.

### 1.3 Exact read-only change to propose (not applied)

```diff
 export function produceExternalEvent(session: any, payload: any): void {
   const event = { type: 'third-party/informational', payload }
-  // alpha.1 移除了 SessionEvent.ignorable（DSH-0.1.2-A1-02）。不删 marker 会被
-  // reader 拒绝，所以这里先把 marker 删掉再写。迁移到 alpha.2 时这段要继续
-  // 保留。——社区注释（陷阱：alpha.2 已恢复保留语义，这段防御应当删除）
-  delete (event as any).ignorable
   session.append(event)
 }
```

**Do not** "fix" this by writing `session.append({ type, payload, ignorable: true } as any)`. That would fake a public entry point that does not exist on alpha.2 — see §3. The correct follow-up is the capability gap / sidecar decision in §3, not a cast.

---

## 2. Correct producer semantics on alpha.2 (DSH-0.1.2-A2-01 + API-05)

- **What the marker means**: `ignorable: true` is a *producer-side omission-safety marker* on the event envelope. Write it **only for informational events whose semantics an old reader can omit without affecting reconstruction** — i.e. auxiliary information whose absence must not change core/durable Session semantics. Consumers may read it when the plugin is present.
- **What it is not**: "the marker is **not a consumer-side filtering directive**, and events remain in loaded events after reload" (A2-01). Marking an event ignorable does not hide it from readers, and it does not make an unknown type acceptable to a reader that *does* know the type family.
- **Retention duty**: what alpha.2 restores is the retention semantics of **envelope / persistence / reload / transport**. "JSONL, SQLite, API transports, and the generated catalog must preserve the field as-is" (A2-01). API-05 item 4: "Persistence/transport owners must preserve existing markers end-to-end."
- **Fail-closed rule**: unknown events **without** the marker remain **required-on-read**; a first-party reader refuses the log ("unknown to this harness and not marked ignorable; refusing to interpret the log"). Unknown required events must fail closed — never loosen this into a consumer whitelist (explicitly forbidden by A1-02 and by A2-01's verification).
- **Persistence provider constraint**: the SQLite provider accepts only schema 20, does not auto-migrate schema 19, and rejects other schemas — back up/export or rebuild per provider documentation before upgrading (A2-01). Applies only if this plugin touches that provider.
- **Not a quirk of one alpha**: DSH-0.1.5-A2-05 shows the same reader rule later, and that first-party events added *without* the marker make sessions unreadable by older harnesses. Marker semantics is a durable reader contract, not an alpha.1 artifact.

---

## 3. What an ordinary plugin going through `Session.append(...)` should do

**The public API surface does not have that parameter.** On alpha.2 the envelope carries `ignorable?: true`, but "the public live `Session.append(...)` still has no `ignorable` parameter" (A2-01); API-05 is precise: "the public `Session.append()` still only accepts `type`, `data`, and `SurfaceIntent`, which is available to surface events only; **it will not write `ignorable` into the event**." (Parameter list per the skill's API-05 card — see §5, unconfirmed by direct source inspection.)

Consequences for this fixture's `session.append(event)` call:

1. **Do not cast to fake the entry point.** A2-01: "ordinary plugins with only this API should **mark the producer seam as a capability gap rather than faking a public entry via cast**." API-05: "it cannot be bypassed with casts, thawing objects, or hand-editing JSONL." So neither `delete (event as any).ignorable` nor `ignorable: true` via cast is a legitimate alpha.2 producer.
2. **The current call produces a required, unknown persisted event.** `type: 'third-party/informational'` is an out-of-repo type with no marker, so a live append may succeed while the next cold load refuses the whole session. A live-only smoke test cannot catch this ("silent write / loud read").
3. **Sanctioned alpha.2 route for an ordinary plugin**: do **not** persist plugin state via custom `SessionEventMap` augmentation + `Session.append()`; "use a plugin-owned **sidecar/store keyed by Session id**" (API-05 best practice 1). If an existing known event is reused, reuse only its real identical semantics — never disguise plugin state as a model-visible or core event.
4. **Track the capability gap upstream, not in code**: "Re-evaluate third-party persistent events only after upstream ships a supported `append(..., { ignorable: true })` or another formal mechanism that persists the omission-safety marker … Registering an event name alone is not enough; do not write up the field restoration as if that capability had shipped" (API-05 item 5). A2-01's verification likewise demands that "a plain `Session.append` should not be documented as supporting the field."
5. **If this plugin were a persistence/reload/transport owner** instead (JSONL / SQLite / API / catalog), its duty is the mirror image: preserve the marker as-is end-to-end, never strip it, and keep unknown marker-less events failing closed. The fixture gives no evidence of which role it plays — see §5.

Net recommendation for `fixture/src/events.ts`: delete the defensive `delete` line **and** the alpha.1-era comment; then treat the remaining `session.append(event)` of an unknown third-party type as a **migration blocker / capability gap** — either drop the persistence of that custom event in favour of a plugin-owned sidecar keyed by Session id, or keep the append only if the event's absence on reload is provably irrelevant and the session is never cold-loaded with it. Do not paper over the gap with a cast.

---

## 4. Verification plan (for whoever applies the change)

1. **Static**: typecheck the plugin against the alpha.2 cohort with `skipLibCheck: false` at least once; confirm no `ignorable` reference remains on any `Session.append` call site, and no implicit `any` was introduced (skill Mode C item 5 / precision checklist).
2. **Persistence/reload (the decisive layer)**: run a real **persist → process restart / cold load** test on a session containing the third-party informational event. Live-append-only smoke is explicitly insufficient (API-05 verification).
3. **Fail-closed check**: a persistence/reload test double must still (a) keep unknown events **with** `ignorable: true` present in loaded events after reload and omittable by old readers, and (b) explicitly refuse unknown events **without** the marker (A2-01 verification). Never relax this into a whitelist.
4. **Documentation/claim check**: docs and comments must not claim `Session.append` supports `ignorable` (A2-01 verification item).
5. **Provider check (only if touched)**: a schema-19 store is rejected; a rebuilt schema-20 store boots.
6. **Regression for the corridor trap**: assert in review that no other alpha.1-era adaptation in this plugin still strips the marker (grep for `ignorable` after the fix).

---

## 5. Unconfirmed / limits of this report

- **No host source verification.** Everything above comes from the skill's curated version cards and API ledger; the linked upstream tags/notes (`dsh-v0.1.2-alpha.2/.../retain-ignorable-external-session-events.md`, `core/session/src/index.ts`, `session-persistence/src/coordinator.ts`, `storage-contract.ts`) were **not** opened — network access is out of scope for this task and the host checkout is outside the allowed read paths. The exact parameter list of `Session.append()` in alpha.2 (`type`, `data`, `SurfaceIntent`) is therefore **per skill reference (API-05), unconfirmed by direct source inspection**.
- **Role of this plugin is unconfirmed.** `produceExternalEvent(session: any, …)` receives a `session` of unknown provenance; the fixture has no `package.json` DSH dependency, no tests, no persistence seam, and no `SessionEventMap` augmentation. Whether the plugin is an ordinary live producer, or an envelope/persistence/transport owner, cannot be determined from the fixture — the two roles have opposite duties (§2 vs §3). The verdict in §1 (delete the defense) holds in **both** cases; only the follow-up differs.
- **Whether any caller ever passes an event that already carries `ignorable`** is unconfirmed. As written the literal never sets it, so the `delete` is a no-op; if a caller-built or reloaded event reaches this seam, the same line becomes destructive (§1.2 item 3). Either way it is deleted.
- **alpha.3 → rc.1 stability** is inferred from the absence of `ignorable` in those card sets (the rollup itself warns that "no card" ≠ "no impact"); it is consistent with, but not proof of, unchanged semantics. Corroborated indirectly by DSH-0.1.5-A2-05 and DSH-0.1.7-J1-05, which still describe the same marker/reader rule.
- **The fixture's own `README.md` states the same conclusion** ("alpha.2 restored the retention semantics (DSH-0.1.2-A1-02 → DSH-0.1.2-A2-01 remove-then-restore) — the correct action is to delete this defense"). Treated as secondary corroboration only; the verdict in §1 is derived from the version cards, not from that sentence.

---

## 6. Report ledger (skill report structure)

- **Completed**: read-only analysis of `fixture/src/events.ts`; corridor fold of DSH-0.1.2-A1-02 → DSH-0.1.2-A2-01 (plus API-05 and later corroboration); verdict = delete the defensive `delete`; producer semantics and the `Session.append` capability gap spelled out; verification plan. **No fixture file was modified, no command executed, no dependency installed, nothing written outside `agent-output/S6-corridor-net-state/`.**
- **Skipped (with evidence)**: applying any source change (task is read-only); touching the SQLite schema-20 path (no evidence this plugin owns a persistence provider); consumer-side whitelisting (explicitly forbidden by A1-02/A2-01).
- **Pending / residual risk**: the unknown third-party event type is still written unmarked through the public append — a cold-load refusal blocker on alpha.2 (API-05); the capability gap has no upstream-supported entry point yet; the plugin's runtime role is unconfirmed (§5).
- **Rollback**: not applicable — no changes were made; the fixture remains byte-identical to its delivered state.
- **Recommendations**: (1) delete the `delete` line and the alpha.1 comment; (2) move third-party persisted state to a plugin-owned sidecar keyed by Session id; (3) record the producer seam as a tracked capability gap until upstream ships `append(..., { ignorable: true })`; (4) add the persist → cold-load and fail-closed tests from §4 to the plugin's suite; (5) grep the whole plugin for other alpha.1-era marker-stripping residue.
