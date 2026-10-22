# S6 · Corridor Net-State Judgment — Migration Report (Read-Only)

- **Fixture**: `fixture/src/events.ts` (function `produceExternalEvent`)
- **Target host**: DSH `0.1.2-alpha.2`
- **Mode**: A · inspect (read-only). No file under `fixture/` was modified; fixture code was not executed.
- **Method**: decision by card evidence (plugin-upgrade skill `references/`), not by the in-code comment.

---

## 1. Verdict — the defense code must be DELETED

**Fate: delete.** Remove the `delete (event as any).ignorable` line together with its comment. Do
not "restore" the marker by writing `ignorable: true` into the object handed to `session.append(...)`
— that path cannot carry the marker on alpha.2 (see §3) and only reproduces the same cold-load
refusal while looking fixed.

### Why (corridor net state, not the comment)

The comment claims "without deleting the marker readers will reject it" and "this must be kept when
migrating to alpha.2". Both halves are wrong for the target:

1. **The corridor is a remove-then-restore pair.** `SessionEvent.ignorable` was removed in alpha.1
   ([DSH-0.1.2-A1-02](https://github.com/deepseek-ai/deepseek-harness), "temporarily removed") and
   **restored in alpha.2** ([DSH-0.1.2-A2-01](https://github.com/deepseek-ai/deepseek-harness),
   type `fix`, explicitly the "revert of DSH-0.1.2-A1-02"). The skill's corridor rule
   (`references/rollup-0.1.2.md:52-55`) names `ignorable` as the **canonical example**: "if a field is
   removed in an intermediate version and restored in a later one … if the final target restores that
   semantics, **defensive code in old-version adaptations should be removed rather than kept**." The
   alpha.1 card itself instructs: "If the final target is alpha.2 or later, first read DSH-0.1.2-A2-01
   to compute the corridor net state; **do not delete the producer marker and then restore it**."
2. **The rejection mechanism is inverted on the target.** On alpha.2 a first-party reader rejects an
   unknown persisted event **because the marker is missing** — missing means required-on-read
   (fail-closed). DSH-0.1.2-A2-01's symptom field states the opposite of the comment: "**old adapters
   that keep dropping the marker** will make first-party readers reject Sessions containing unknown
   events." Keeping the `delete` converts a tolerated informational event into a required event and
   can refuse the **whole session** on cold load.
3. **Even for alpha.1 the comment's mechanism was wrong.** DSH-0.1.2-A1-02 says alpha.1 *cannot
   preserve* the marker at all; the carded alpha.1 action was to stop writing the unknown persisted
   event or switch to known vocabulary — not to strip a marker. And as literally written the
   `delete` is a **no-op**: the event literal is `{ type, payload }` and never carries `ignorable`, so
   nothing is deleted. It is dead code on every version.
4. **Provenance**: the comment self-identifies as community folklore ("社区注释") and the fixture
   README flags it as a trap. The decision above rests on the version cards, per the brief.

## 2. Full corridor history of `SessionEvent.ignorable` semantics (touchpoint #2)

| Corridor position | State of `ignorable` | Evidence |
|---|---|---|
| `0.1.1-rc.2` and earlier | Present on the event envelope; third-party informational persisted events carry it; unknown events **with** the marker are skippable by readers lacking the plugin | DSH-0.1.2-A1-02 / A2-01 (apply-to + restore scope) |
| `0.1.2-alpha.1` | **Temporarily removed**; marker cannot be preserved; unknown persisted events are treated as required and the reload is rejected | DSH-0.1.2-A1-02 (breaking, required-if-target-is-alpha.1) |
| `0.1.2-alpha.2` (**target**) | **Restored** — but only the *retention* semantics of envelope / persistence / reload / transport. JSONL, SQLite, API transports and the generated catalog must preserve the field as-is; unknown events **without** the marker remain required-on-read | DSH-0.1.2-A2-01 (fix) |
| `0.1.2-alpha.3` → `0.1.2-rc.1` | No card changes the marker (alpha.3 removes the opt-in SQLite persistence provider — orthogonal; alpha.5 adds storage salvage tolerance — orthogonal) | card set per `references/README.md` corridor table |
| `0.1.3-alpha.1` | Session-log corridor cards concern the v0→v1 migrator / log formats; no card alters `ignorable` | `v0.1.3-alpha.1.md` (A1-01/A1-02) |
| `0.1.5-alpha.1` | Payload validation tightens (`surfaceOp` `startSeq`/`endSeq`, `SurfaceIntent<K>` typing, log-only `surfaceOp?: never`); marker semantics unchanged | DSH-0.1.5-A1-04 |
| `0.1.5-alpha.2` | Two **new first-party** events join `KNOWN_SESSION_EVENT_TYPES` *without* the marker; the card re-confirms "**`Session.append()` has no `ignorable` channel**" and that unknown non-ignorable events are refused on read | DSH-0.1.5-A2-05 |
| `0.1.7-rc.1` (jump view) | Custom "(unknown-ignorable)" events remain part of the format, but as attachment carriers they become opaque to built-in readers | DSH-0.1.7-J1-05 |

**Net state at the alpha.2 target: the marker is restored at the envelope/persistence layer, and is
still absent from the public `Session.append(...)` surface.** Any migration decision must fold the
corridor to this net state — never churn source once per intermediate version.

## 3. Correct producer semantics on alpha.2, and what an ordinary plugin should do

**Envelope semantics (producers/persistence owners):**

- Write `ignorable: true` **only** for informational events whose semantics an old reader can omit
  without affecting reconstruction.
- The marker is **not** a consumer-side filtering directive; events remain in loaded events after
  reload.
- Persistence/reload/transport must preserve the field **as-is**, end-to-end; unknown events without
  the marker keep failing closed (required-on-read).

**The public surface gap (decisive for this fixture):**

- On alpha.2 the public live `Session.append(...)` **still has no `ignorable` parameter** — it accepts
  only `type`, `data`, and `SurfaceIntent` (surface events only), and will not write the marker into
  the event (DSH-0.1.2-A2-01 + API-05 in `references/api-migration-0.1.2-alpha.2.md`). So an ordinary
  plugin going through `Session.append(...)` **cannot set the marker at all**.

**Therefore, an ordinary plugin (only the public API) should:**

1. **Not persist plugin state via a custom `SessionEventMap` + `Session.append()`** — the alpha.2 best
   practice is a **plugin-owned sidecar/store keyed by Session id**. For this fixture that means
   `produceExternalEvent` should either be retired in favour of a sidecar write, or …
2. … if a third-party informational event must genuinely be persisted, it needs a **producer seam the
   plugin itself owns** (envelope/seed/transport), which writes `ignorable: true` and preserves it
   end-to-end. It must **not** be faked through the public append with casts, object thawing, or
   hand-edited JSONL — API-05 states this explicitly ("it cannot be bypassed with casts").
3. **Mark the seam as a capability gap**, not as a solved problem: re-evaluate third-party persistent
   events only after upstream ships a supported `append(..., { ignorable: true })` or another formal
   omission-safety mechanism. Registering an event name alone is not enough.

**The trap to avoid (API-05 failure mode): silent write, loud read.** A live append can succeed and
persist fine, then the **next cold load** throws `SessionFormatUnsupportedError` and refuses to
restore the whole session. A live-only smoke test cannot catch this — verification must include a
real persist → restart → cold-load cycle.

**Advisory replacement shape (NOT applied — fixture is read-only):**

- Option A (recommended for an ordinary plugin): drop the delete + comment and stop persisting this
  event through the session log; write the informational record to a sidecar store keyed by session id.
- Option B (only if the plugin owns a persistence seam): drop the delete + comment; have the seam set
  `ignorable: true` on the envelope before persist and preserve it through transport; never via
  `Session.append`.

In both options the `delete (event as any).ignorable` line and the comment are removed, and nothing is
added to the object passed to `session.append` to "compensate".

## 4. Verification plan (from DSH-0.1.2-A2-01 / API-05)

1. Persist → cold-load: an unknown event carrying `ignorable: true` still exists in loaded events
   after reload, and an old reader may omit its semantics; unknown events **without** the marker are
   explicitly refused (fail-closed).
2. For this exact path: run a real persist → process restart/cold load after removing the delete — do
   not test only a live append.
3. If a cold-load refusal still occurs after the delete is removed, treat it as a migration blocker for
   the persistence scheme itself (API-05) and move to the sidecar store; do not swallow the error.
4. Do not document a plain `Session.append` as supporting the field.

## 5. Unconfirmed items

- **Exact `Session.append` signature at the alpha.2 tag** beyond the ledger statement ("`type`,
  `data`, `SurfaceIntent`"): the fixture calls `session.append(event)` with a single object
  `{ type: 'third-party/informational', payload }`. That single-object shape (and the `payload` key
  rather than `data`) could not be verified from the mounted materials and should be checked against
  the alpha.2 generated declarations (`packages/core/session/src/index.ts`) before any rewrite.
- **Whether this plugin owns any persistence/transport seam**: the fixture is one function with
  `session: any`. If it only ever reaches `Session.append`, the marker is unreachable for it **by
  design** on alpha.2, and the persistence scheme itself is the blocker (API-05) — independent of the
  `delete`.
- **Post-alpha.2 corridor detail**: statements beyond alpha.2 (0.1.3–0.1.7) are taken from the carded
  edges only; the task target is alpha.2 and no later card reverses the A2-01 restoration.

## 6. Evidence index (all read-only, from the mounted skill)

- `skills/plugin-upgrade/references/v0.1.2-alpha.1.md` — DSH-0.1.2-A1-02 (removal; "do not delete the producer marker and then restore it")
- `skills/plugin-upgrade/references/v0.1.2-alpha.2.md` — DSH-0.1.2-A2-01 (restore; "old adapters that keep dropping the marker will make first-party readers reject Sessions")
- `skills/plugin-upgrade/references/api-migration-0.1.2-alpha.2.md` — API-05 (append has no `ignorable` parameter; sidecar-store best practice; silent write / loud read)
- `skills/plugin-upgrade/references/rollup-0.1.2.md:52-55` — corridor net-state rule; `ignorable` as the canonical remove-then-restore example
- `skills/plugin-upgrade/references/v0.1.5-alpha.2.md` — DSH-0.1.5-A2-05 ("`Session.append()` has no `ignorable` channel"; unknown non-ignorable events refused)
- `skills/plugin-upgrade/references/v0.1.5-alpha.1.md` — DSH-0.1.5-A1-04 (payload validation tightening)
- `skills/plugin-upgrade/references/jump-0.1.5-rc.2-to-0.1.7-rc.1.md` — DSH-0.1.7-J1-05 (custom unknown-ignorable events opaque to built-in readers)
- `skills/plugin-upgrade/references/README.md` — corridor ordering (`from → to` edges)
- `skills/plugin-upgrade/references/pre-flight.md` — touchpoint #2 definition and related cards
- `skills/plugin-upgrade/evals/evals.json` (id 2) — the skill's own expected answer for this exact scenario: keep/restore the producer marker, **remove the alpha.1-era defensive deletion**, flag the append capability gap, do not cast
- Fixture: `fixture/src/events.ts`, `fixture/README.md`, `fixture/package.json`
