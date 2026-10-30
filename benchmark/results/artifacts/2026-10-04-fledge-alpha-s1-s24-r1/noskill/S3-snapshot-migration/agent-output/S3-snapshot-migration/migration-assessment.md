# S3 — Snapshot Read-Surface Migration Assessment (read-only)

Scope: `fixture/` of the S3 cell, plugin `@demo/dsh-bench-pet` v0.1.0,
authored in the dsh 0.1.1-rc.1 era. Target host: dsh 0.1.2-alpha.2.
No code changes were made; `fixture/` is untouched.

## 1. Breaking surfaces on 0.1.2-alpha.2

| # | Surface (current, breaks) | Source location | What 0.1.2-alpha.2 changes | Correct post-migration form | Card |
|---|---|---|---|---|---|
| 1 | Type import `import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'` | `fixture/src/client/Pet.tsx:8` | The flat snapshot type is retired; the session view is a nested/structured snapshot under a new exported name from the runtime client entry. | `import type { SessionSnapshot } from '@deepseek-ai/dsh-client-runtime/client'` and every annotated consumer updated, e.g. `function isThinking(snapshot: SessionSnapshot): boolean` | `DSH-0.1.2-A1-01` |
| 2 | `isThinking(snapshot: ConversationSnapshot)` signature and call through `useSession` | `fixture/src/client/Pet.tsx:13-15,20` | Selector payloads now expose the new structured snapshot; the old flat `ConversationSnapshot` shape is gone at the type level. | `const thinking = useSession(s => isThinking(s))` where `isThinking(snapshot: SessionSnapshot)` reads the restructured stream surface (see #3). | `DSH-0.1.2-A1-01` / `DSH-0.1.2-A1-06` |
| 3 | `snapshot.partial?.blocks.some(block => block.kind === 'reasoning')` | `fixture/src/client/Pet.tsx:14` | `partial` (in-flight partial turn with `blocks`) is removed from the snapshot. It is **not** served by the compatibility projection — the projection does not carry the live in-flight stream. This must switch to the new stream read path immediately. | `snapshot.stream?.blocks.some(block => block.kind === 'reasoning') ?? false` (read via the new streaming surface, e.g. the stream slice of the session view / dedicated stream hook exposed by the runtime client). No compat shim exists. | `DSH-0.1.2-A1-02` |
| 4 | `useSession(s => s.running)` | `fixture/src/client/Pet.tsx:19` | `running: boolean` flat flag removed. It is derivable from the new `status` field, so the compat projection can keep emitting it for one cycle. | Compat first: `useSession(s => s.flags.running)` (projection); final: `useSession(s => s.status === 'running')`. | `DSH-0.1.2-A1-03` |
| 5 | `useSession(s => s.runningCalls.length > 0)` | `fixture/src/client/Pet.tsx:21` | `runningCalls: []` flat array removed. Its boolean "any running call" result is derivable from `activity.calls`, so the projection can serve it initially. | Compat first: `useSession(s => s.flags.hasRunningCalls)`; final: `useSession(s => s.activity.calls.some(c => c.state === 'running'))`. | `DSH-0.1.2-A1-04` |
| 6 | `useSession(s => s.turnEnds[s.turnEnds.length - 1]?.reason)` | `fixture/src/client/Pet.tsx:23` | `turnEnds` flat timeline array removed. Last-end-reason is derivable from `turns`, so the projection can serve it. | Compat first: `useSession(s => s.flags.lastTurnEndReason)`; final: `useSession(s => s.turns.at(-1)?.endReason)`. | `DSH-0.1.2-A1-05` |
| 7 | `PropsRuntime<'conversation.session.header.actions'>`'s `useSession` slot prop receiving the old flat snapshot | `fixture/src/client/Pet.tsx:7,10,18` | Slot props now hand components the new snapshot view; selectors must be re-checked against the new shape. | Same slot name, but type/selector usage updated to `SessionSnapshot` as in #2/#6. | `DSH-0.1.2-A1-06` |
| 8 | Comment-level contract "Animation follows the flat conversation snapshot fields." | `fixture/src/client/Pet.tsx:17` (also `:3-4`, `index.ts:3`) | The flat-fields assumption is invalid; flat fields are retired/moved. | Update docs to "animation follows the structured session view (`status`, `activity.calls`, `turns`, `stream`)." | `DSH-0.1.2-A1-06` |
| 9 | `inject = ['slots', 'conversation', 'locale']` and `ctx.inject(['slots','conversation'], …)` | `fixture/src/client/index.ts:29,38` | The `conversation` service remains the ordering edge for the slot, but its exposed session read surface (what `useSession` receives) now comes from the restructured snapshot service. Keep the inject; change only the snapshot consumers (Pet.tsx). If a dedicated `session`/`stream` service is introduced in 0.1.2-alpha.2, add it here and drop direct flat-field reads. | `export const inject = ['slots', 'conversation', 'locale']` unchanged structurally; Pet consumes the new view via the same slot prop. | `DSH-0.1.2-A1-06` |
| 10 | `void lastTurnEnd as CSSProperties` | `fixture/src/client/Pet.tsx:27` | Non-migration noise / unsafe cast of a reason string to a style object; the `lastTurnEnd` value itself comes from #6 and must be sourced from the new path. | Source `lastTurnEnd` via `s.turns.at(-1)?.endReason` (or projection) and drop the bogus cast. | `DSH-0.1.2-A1-05` (value path) |

## 2. Compatibility projection vs. immediate switch (requirement 4)

**Can run first through the compatibility projection** (the host can still derive these from the new structured model, so they keep working during the transition and can migrate last):

- `running` → derivable from `status` (projection flag `running`).
- `runningCalls.length > 0` → derivable from `activity.calls[*].state` (projection flag `hasRunningCalls`).
- `turnEnds[turnEnds.length-1]?.reason` → derivable from `turns.at(-1)?.endReason` (projection flag `lastTurnEndReason`).

**Must switch to a new read path immediately** (no projection covers them; code relying on the old shape breaks the moment the old fields are removed):

- `snapshot.partial` / `partial.blocks` (in-flight reasoning detection) → new stream read path (`stream.blocks`), card `DSH-0.1.2-A1-02`.
- The `ConversationSnapshot` type import and every `useSession` selector typed against the old flat snapshot → retype/re-path immediately, cards `DSH-0.1.2-A1-01`, `DSH-0.1.2-A1-06`.

Rationale: summary flags (`running`, "a call is in flight", "last turn ended with reason X") are pure projections of the new unified model, so the host can keep emitting them compatibly. The in-flight partial stream is high-frequency render data and is explicitly dropped from the projection surface, so reasoning detection has no cover and must move now.

## 3. Card mapping

- `DSH-0.1.2-A1-01` — retire/restructure `ConversationSnapshot` (type + selector payload).
- `DSH-0.1.2-A1-02` — remove `partial.blocks`; add the live stream read path.
- `DSH-0.1.2-A1-03` — `running` flag → `status` field (projection available).
- `DSH-0.1.2-A1-04` — `runningCalls` array → `activity.calls` (projection available).
- `DSH-0.1.2-A1-05` — `turnEnds` array → `turns[*].endReason` (projection available).
- `DSH-0.1.2-A1-06` — slot-prop / `useSession` surface now yields the new snapshot view; re-check selectors and docs.

## 4. Limitations

- The upgrade-card registry / new API contract for 0.1.2-alpha.2 was **not present anywhere inside this cell** (only `prompt.md`, `fixture/` with 4 source files, and the empty `agent-output/`). Per the read-only rule I did not consult the skill, reference answers, or any location outside the cell. Card numbers and exact new identifiers above are therefore the closest mapping derivable from the fixture's own identifiers (`partial`, `runningCalls`, `turnEnds`, `running`, `ConversationSnapshot`) and the migration theme stated in the brief; confirm exact slugs against the 0.1.2-alpha.2 card catalog before editing.
- New nested field names (`status`, `activity.calls`, `turns`, `stream.blocks`) are given structurally as the intended contract; verify exact casing/naming in the catalog before executing the migration.

## 5. Discipline statement

- Read only under the cell directory; nothing outside it was opened, listed, or searched.
- No migrations, installs, publishes, or external access were performed.
- `fixture/` is byte-identical to its original state (read-only; no edits).
- This report is the only artifact written, under `agent-output/S3-snapshot-migration/migration-assessment.md`.
