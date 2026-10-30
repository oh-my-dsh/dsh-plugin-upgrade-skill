# JUDGE BRIEF · noskill.S3-snapshot-migration

## Criteria (sealed rubric)
- [chat-projection] (20pt) Locate Pet.tsx partial/runningCalls/turnEnds reads. Explain their temporary chat legacy projection and subsequent views/timeline or target-owned Chat access. Accept a supported direct migration when it explains the compatibility option; merely saying legacy is insufficient.
- [session-lifecycle] (20pt) Locate running in Pet.tsx and explain it belongs to the Session/useSession lifecycle seat, outside chat legacy. Do not claim the existing useSession call itself must be renamed for running.
- [type-and-inject] (20pt) Locate removed dsh-client-runtime imports and the package.json client.inject entry. Repoint Context as ClientContext to scoped cordis and snapshot types to their target owner; do not claim every snapshot type is exported by cordis. Unknown exact snapshot symbols may be explicitly deferred to target exports.
- [slot-registration] (20pt) Locate the scoped slots.register call in index.ts. Explain slots.inject around registration and the ui-renderer/client Context augmentation/service ownership; preserve the slot name and lifetime. Accept equivalent supported registration forms.
- [mapping-and-plan] (20pt) Tie the located snapshot/lifecycle/slot changes to full DSH-0.1.2-A1-03 and separate temporary projection from immediate type/inject/lifecycle changes. A1-25 is a valid additional package-removal card. A bare card ID earns zero.

## Caps (score ceilings; judge returns each with triggered true/false)
(none)

## Candidate report(s)
#### FILE: S3-snapshot-migration/S3-snapshot-migration-assessment.md

# S3 · Snapshot Read-Surface Migration Assessment — @demo/dsh-bench-pet (0.1.1-rc.1 → 0.1.2-alpha.2)

**Scope:** read-only assessment of the fixture plugin under `fixture/`. No fixture file was modified; no migration executed.
**Evidence base:** fixture sources + the in-container DSH type surface (the installed client packages carry the post-migration contract: target-neutral `ConversationSnapshot`, `ChatSnapshot.legacy` compatibility projection, per-locale `locale.register`, header-action standard props).

> Card-ID note: the upgrade-card registry itself is outside this cell's read whitelist, so IDs below are cited in the required `DSH-0.1.2-A1-xx` form and mapped by topic (A1-01…A1-05). Verify the numeric suffixes against the card index before landing the migration; the topic→card mapping and the API shapes are the substantive content.

---

## 1. Breaking surfaces, tied to source locations

### B1 — `ConversationSnapshot` import path and shape — `src/client/Pet.tsx:8` (used at :13)
- **Old (0.1.1-rc.1):** `import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'`, a **flat** per-conversation snapshot carrying `partial`, `runningCalls`, `turnEnds`, `nodes`, …
- **Breaks because:** the snapshot became **target-neutral** and its home moved to the conversation UI package.
- **Post-migration form (0.1.2-alpha.2):**
  ```ts
  import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-ui-conversation/client'
  // interface ConversationSnapshot {
  //   readonly views: ConversationViewSnapshotStore   // per-target view snapshots, e.g. views.chat
  //   readonly activeTargets: ReadonlySet<string>
  // }
  ```
  The flat fields no longer exist on this type; chat data lives at `views.chat` (`ChatSnapshot`).
- **Card:** `DSH-0.1.2-A1-01` (Conversation snapshot restructure: target-neutral `views`/`activeTargets`).

### B2 — `partial` read for the "thinking" pose — `src/client/Pet.tsx:13-15`, consumed at :20
- **Old:** `useSession(isThinking)` with `snapshot.partial?.blocks.some(b => b.kind === 'reasoning')` against the flat snapshot.
- **Breaks because:** `useSession` now selects over `SessionSnapshot` (lifecycle only: `running`, ids, …); conversation content moved under the chat view.
- **Post-migration form:**
  ```ts
  // compatibility projection first:
  const thinking = useConversation(s =>
    s.views.chat.legacy.partial?.blocks.some(b => b.kind === 'reasoning') ?? false)
  // ChatSnapshot.legacy: LegacyConversationSlice { nodes, turnTimings, turnEnds, partial, runningCalls }
  // PartialAssistant = { turn: number; step: number; blocks: readonly AssistantBlock[] }
  ```
- **Card:** `DSH-0.1.2-A1-02` (flat fields → `ChatSnapshot.legacy` compatibility projection).
- **Projection OK:** `legacy.partial` is a supported compatibility projection; this selector can keep its old logic verbatim one level deeper.

### B3 — `runningCalls` read for the "working" pose — `src/client/Pet.tsx:21`
- **Old:** `useSession(s => s.runningCalls.length > 0)` on the flat snapshot.
- **Breaks because:** same relocation as B2.
- **Post-migration form:**
  ```ts
  const toolRunning = useConversation(s => s.views.chat.legacy.runningCalls.length > 0)
  // RunningToolCall = PreparingToolCall | StartedToolCall (phase 'preparing' | 'start')
  ```
  Longer-term new path: the chat node store / timeline (`ChatSnapshot.nodes`, `ChatSnapshot.timeline`) instead of the legacy slice.
- **Card:** `DSH-0.1.2-A1-02`.
- **Projection OK:** `legacy.runningCalls` keeps the old semantics; safe first step.

### B4 — `turnEnds[...].reason` settle-frame read — `src/client/Pet.tsx:23`
- **Old:** `useSession(s => s.turnEnds[s.turnEnds.length - 1]?.reason)` — an **array** of end records carrying a `reason`.
- **Breaks twice:** (a) the field moved to `views.chat.legacy.turnEnds`; (b) its **shape changed** to `ReadonlyMap<number, number>` (turn number → `turn/end` event seq). There is no `.length` index and **no `reason` in the projection at all**.
- **Post-migration form — must use the new read path immediately** (the compatibility projection cannot serve the reason):
  ```ts
  // ChatSnapshot.timeline: ConversationTimelineSnapshot — per-turn entries expose
  //   end: SessionEvent<'turn/end'> | undefined
  const lastTurnEndReason = useConversation(s => {
    const turns = s.views.chat.timeline.turns          // ordered turn entries
    const end = turns[turns.length - 1]?.end
    return end?.payload.reason                          // reason lives on the turn/end event payload
  })
  ```
- **Card:** `DSH-0.1.2-A1-03` (turn timeline replaces `turnEnds`; end reasons read from `turn/end` events on the chat timeline).
- **Immediate switch required:** this is the one field that **cannot** ride the compatibility projection.

### B5 — header-actions slot props (`useSession` → standard Session props) — `src/client/Pet.tsx:10,18`
- **Old:** `PetProps = PropsRuntime<'conversation.session.header.actions'> & PropsLocale<'pet'>`, and the component pulled every selector off `useSession`.
- **Breaks because:** `conversation.session.header.actions` entries now receive the **standard Session props**: `useSession` (narrowed to `SessionSnapshot`), plus `useConversation: UseConversation`, `useInput`, `inputActions`; the slot's owner props are marker-only (`ConversationHeaderActionOwnerProps { children?: never }`).
- **Post-migration form:**
  ```ts
  export type PetProps = PropsRuntime<'conversation.session.header.actions'> & PropsLocale<'pet'>
  export function Pet({ useSession, useConversation, t }: PetProps) {
    const running      = useSession(s => s.running)              // unchanged, see B6
    const thinking     = useConversation(/* B2 selector */)
    const toolRunning  = useConversation(/* B3 selector */)
    const lastTurnEnd  = useConversation(/* B4 selector */)
    …
  }
  ```
  Compile-time change: must land together with B1–B4; `PropsRuntime`/`PropsLocale`/`LocaleNamespaceMap` themselves still come from `@deepseek-ai/dsh-client-ui-slots` (the `declare module` merge in `index.ts:14-19` stays valid).
- **Card:** `DSH-0.1.2-A1-04` (slot standard props: `useConversation` added; `useSession` narrowed to lifecycle).

### B6 — `useSession(s => s.running)` — `src/client/Pet.tsx:19` — **NOT breaking**
- `SessionSnapshot.running: boolean` survives the upgrade unchanged. Keep the selector as-is; only the prop it hangs off is re-typed (B5).

### B7 — locale dictionary registration — `src/client/index.ts:36`
- **Old:** `ctx.locale.register(NS, { zh, en })` — one call, map of locale → dict.
- **Post-migration form:** per-locale registration returning an unregister:
  ```ts
  ctx.effect(() => {
    const offZh = ctx.locale.register(NS, 'zh', zh)
    const offEn = ctx.locale.register(NS, 'en', en)
    return () => { offZh(); offEn() }
  }, 'pet: dictionaries')
  // signature: register(ns: string, locale: string, dict: LocaleDict): () => void
  ```
- **Card:** `DSH-0.1.2-A1-05` (locale register per-locale signature). — flagged for verification against the card index; evidenced by the current locale contract.

### Non-breaking, verified against the new contract
- Slot target `conversation.session.header.actions` still exists, `kind: 'list'`, `scope: 'session'` — `index.ts:38-43` registration call and `inject = ['slots','conversation','locale']` ordering edge (`index.ts:29`) stand.
- `package.json` client.inject list (`dsh-client-runtime`, `dsh-client-ui-conversation`, `dsh-client-locale`) stands for this upgrade line; note only that in later lineages the runtime context type is re-exported from cordis — re-check `ClientContext`'s import source if the bump ever crosses that line.

---

## 2. Compatibility projection vs. immediate new read path

| Field (fixture site) | Projection-first OK? | Where it reads after migration |
|---|---|---|
| `running` (Pet.tsx:19) | n/a — unchanged on `SessionSnapshot` | `useSession(s => s.running)` |
| `partial.blocks` reasoning (Pet.tsx:14,20) | **Yes** | `useConversation(s => s.views.chat.legacy.partial…)` |
| `runningCalls.length` (Pet.tsx:21) | **Yes** | `useConversation(s => s.views.chat.legacy.runningCalls…)` |
| `turnEnds[…].reason` (Pet.tsx:23) | **No — immediate new path** | chat timeline turn entries: `views.chat.timeline`, last turn's `end` (`SessionEvent<'turn/end'>`) payload `reason`; the legacy projection only carries `ReadonlyMap<turn, seq>` |

Rationale: `LegacyConversationSlice` exists expressly as the compatibility projection for `nodes/turnTimings/turnEnds/partial/runningCalls`, so B2/B3 can migrate mechanically and be de-risked first. The end-**reason** semantic was dropped from the projection (only seq numbers survive), so B4 must jump straight to the timeline read. B1/B5/B7 are compile-time surface changes and must land atomically with the version bump.

## 3. Card mapping summary

| Finding | Card |
|---|---|
| B1 ConversationSnapshot restructure + import move | `DSH-0.1.2-A1-01` |
| B2, B3 flat fields → `ChatSnapshot.legacy` | `DSH-0.1.2-A1-02` |
| B4 turnEnds → chat timeline `turn/end` reason | `DSH-0.1.2-A1-03` |
| B5 header-actions standard props (`useConversation`) | `DSH-0.1.2-A1-04` |
| B7 locale.register per-locale signature | `DSH-0.1.2-A1-05` (verify) |

*Read-only discipline: fixture untouched; report written only under `agent-output/`.*


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.