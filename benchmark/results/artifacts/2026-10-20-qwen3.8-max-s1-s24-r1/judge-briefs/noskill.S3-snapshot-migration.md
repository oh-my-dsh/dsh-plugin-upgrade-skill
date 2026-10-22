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
#### FILE: S3-snapshot-migration/card-map.json

{
  "task": "S3-snapshot-migration",
  "plugin": "@demo/dsh-bench-pet",
  "migration": "0.1.1-rc.1 -> 0.1.2-alpha.2",
  "cardIdBasis": "reconstructed per DSH-0.1.2-A1-NN convention; noskill cell has no official card index; each card anchored by change content (see report §7)",
  "surfaces": [
    {
      "id": "B1",
      "file": "fixture/src/client/Pet.tsx",
      "lines": [
        8,
        13
      ],
      "old": "import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'",
      "change": "flat ConversationSnapshot retired; projection-keyed snapshot (ProjectionSnapshot.values, SessionProjectionMap domain keys)",
      "card": "DSH-0.1.2-A1-01",
      "path": "immediate (compile-time type surface)"
    },
    {
      "id": "B2a",
      "file": "fixture/src/client/Pet.tsx",
      "lines": [
        14,
        20
      ],
      "old": "snapshot.partial?.blocks.some(...)",
      "change": "mutable partial streaming buffer removed; live tokens via transient AssistantStreamFrame/StreamChunk (reasoning-delta); persisted as assistant/message.stream records",
      "card": "DSH-0.1.2-A1-02",
      "path": "immediate (transient frames are unprojectable)"
    },
    {
      "id": "B2b",
      "file": "fixture/src/client/Pet.tsx",
      "lines": [
        14
      ],
      "old": "block.kind === 'reasoning'",
      "change": "content-block discriminator kind -> type (ContentBlockMap; ReasoningBlock { type: 'reasoning' })",
      "card": "DSH-0.1.2-A1-03",
      "path": "immediate (value-level rename)"
    },
    {
      "id": "B3",
      "file": "fixture/src/client/Pet.tsx",
      "lines": [
        19
      ],
      "old": "useSession(s => s.running)",
      "change": "run-state via status surface (agent/status idle<->running; api-session/status(running))",
      "card": "DSH-0.1.2-A1-04",
      "path": "compat-projection-first OK (committed-event fold)"
    },
    {
      "id": "B4",
      "file": "fixture/src/client/Pet.tsx",
      "lines": [
        21
      ],
      "old": "useSession(s => s.runningCalls.length > 0)",
      "change": "in-flight calls = tool/call opened <-> tool/result closed, keyed by ToolCallId",
      "card": "DSH-0.1.2-A1-05",
      "path": "compat-projection-first OK (committed-event pairing fold)"
    },
    {
      "id": "B5",
      "file": "fixture/src/client/Pet.tsx",
      "lines": [
        23,
        27
      ],
      "old": "s.turnEnds[s.turnEnds.length-1]?.reason",
      "change": "turn timeline from turn/end events; reason scalar -> TurnEndReason object (.kind: completed|aborted|blocked|error|max-tokens|interrupted|forked)",
      "card": "DSH-0.1.2-A1-06",
      "path": "array: projection-first OK; accessor .reason -> .reason.kind: immediate"
    },
    {
      "id": "B6",
      "file": "fixture/src/client/Pet.tsx",
      "lines": [
        7,
        10,
        18,
        19,
        20,
        21,
        23
      ],
      "old": "PropsRuntime<...> useSession selectors typed over flat snapshot",
      "change": "selectors re-typed to projection view; hook pattern expected stable (name TVC)",
      "card": "DSH-0.1.2-A1-01",
      "path": "immediate (compile-time)"
    }
  ],
  "nonBreaking": [
    {
      "file": "fixture/src/client/index.ts",
      "lines": [
        29,
        36,
        38,
        39,
        40,
        41,
        42,
        43,
        6,
        8,
        10,
        14,
        15,
        16,
        17,
        18,
        19
      ],
      "note": "slots/locale/inject registration surface + module augmentation expected stable in the A1 snapshot wave; TVC against alpha.2 release notes"
    },
    {
      "file": "fixture/package.json",
      "lines": [
        8
      ],
      "note": "client.inject plugin names stable; bump version pins"
    },
    {
      "file": "fixture/cordis.patch.yml",
      "lines": [
        1,
        2,
        3,
        4
      ],
      "note": "unaffected"
    },
    {
      "file": "fixture/src/client/locales.ts",
      "lines": [
        1,
        2,
        3,
        4
      ],
      "note": "pure dictionaries; unaffected"
    }
  ],
  "evidence": "live host contracts via read-only cordis_inspect (host Service/Event: sessionProjections, sessionController, agent/assistant-stream, api-session/status, agent/status); client-platform inspect unavailable (page not connected) -> client export names flagged TVC"
}

#### FILE: S3-snapshot-migration/hash-verify-after.txt

fixture hash verification (after assessment)
verifiedAt: 2026-10-20T07:39:32.174Z
algorithm: sha256

OK   cordis.patch.yml  73d74cf519c91984daef5148cf17a4ab7275dc36b0a3f4c98c755e93ff218f0a
OK   package.json  154e9fd5f8e1b9006571b0d842f7670476411b793b291e6938ade40701f1f903
OK   README.md  c1114413138587e985b76c1fd8e43e91c9cd0e06f43b19c17b09bcca2a8b72d8
OK   src/client/index.ts  94533a879790cdcbbe47624c4409352ea0b2f7a637284cda0e88db1f18d0dd05
OK   src/client/locales.ts  d56aa3aaff649bdd3aad777d4272e8e690b2918fb168e573953102dfddeec5ff
OK   src/client/Pet.tsx  777a963ffa454f0ba340babb7269f378d6daca8f0f2aacbfd2c08187345b3ec3

RESULT: ALL 6 FILES UNCHANGED — fixture read-only discipline kept.

#### FILE: S3-snapshot-migration/migration-assessment.md

# S3 · Snapshot Read-Surface Migration Assessment — `@demo/dsh-bench-pet` (0.1.1-rc.1 → dsh 0.1.2-alpha.2)

**Mode:** read-only assessment. No code was modified; `/app/fixture/` untouched (hash-verified, §9).
**Date:** 2026-10-20 · **Cell:** noskill / S3-snapshot-migration

---

## 0. 执行摘要（中文）

该宠物插件的全部断裂点集中在**会话快照读取面**：0.1.2-alpha.2 用「projection 键控快照 + 事件/流帧」取代了 0.1.1-rc.1 的扁平 `ConversationSnapshot`。

- **必须立即换新读路径**：`snapshot.partial?.blocks`（`kind==='reasoning'`）——流式 `partial` 是**瞬态帧**（`AssistantStreamFrame`/`StreamChunk`，含 `reasoning-delta`），从不进入已提交日志，而兼容投影只能由已提交事件纯折叠而来，**原理上无法投影重建**；且块判别字段已由 `kind` 改名 `type`。同批：`ConversationSnapshot` 类型导入与所有 `useSession` 选择器签名（编译期断裂，投影救不了类型）。
- **可先走兼容投影**：`running`（可由 `turn/start`/`turn/end` 边界与状态事件折叠得出）、`runningCalls`（可由 `tool/call` ↔ `tool/result` 按 `callId` 配对折叠得出）。
- **半投影半立即**：`turnEnds` 数组本身可投影重建，但 `reason` 的值形态从标量变为可辨识对象 `TurnEndReason`（`{kind:'completed'|'aborted'|'blocked'|'error'|'max-tokens'|'interrupted'|'forked'}`），访问器必须立即改为 `.reason.kind`（`aborted` 还嵌套 `reason.reason.kind`：user/parent/hook/disposed/legacy）。
- index.ts 的 slots/locale/inject 注册面与 package.json、cordis.patch.yml **预期不破坏**（§6，附核验清单）。

卡片编号说明见 §7（本格无官方卡片索引，编号按 `DSH-0.1.2-A1-NN` 约定重构并以变更内容锚定，均明确标注）。

---

## 1. Evidence base and method

1. **Fixture (read-only):** `/app/fixture/` — 6 files; every break below cites exact `file:line`.
2. **Live host contracts (read-only local tooling):** the brief permits inspecting "local tools read-only"; the harness mandates the Cordis Inspect bindings before advising on plugin code. I used only `cordis_inspect_list` / `cordis_inspect_query` (platform `host`, providers `Service`/`Event`, methods `listService`/`listEvents`). These are read-only RPC bindings — **no file outside this cell was read, nothing was written outside `/app/agent-output/`, no git, no network.**
   - Client-platform inspect was attempted three times and timed out (no GUI page connected to this cell's channel), so **client-side export names for alpha.2 are marked ⟨TVC⟩ (to verify against the 0.1.2-alpha.2 client `.d.ts`)**; the host/wire contracts below are quoted exactly as returned.
3. **Post-migration ground truth observed on the live host build (0.1.2-generation or later):**
   - `ProjectionSnapshot { asOfSeq: SessionSeqCursor; values: Partial<SessionProjectionMap> }`; base `SessionProjectionMap`/`SessionProjectionStateMap` are **empty interfaces extended per domain plugin via declaration merging**; a projection unit is `ProjectionDefinition { key, stateSchema, init(header, inheritedEventCount), apply(state, event: SessionEvent), wire?: { viewSchema, view(state) }, stateVersion }` — i.e. **projections are pure folds over committed `SessionEvent` log records**. Unloaded domain ⇒ key absent from snapshot ("clients read it as capability absence").
   - Committed log vocabulary `SessionEventMap` (exact): `turn/start {turn}`, `turn/end {turn, reason: TurnEndReason}`, `step/start|end`, `user/message`, `assistant/message {turn, step, message, stream: AssistantStreamRecord[], usage?, interrupted?}`, `assistant/attempt`, `tool/call {turn, step, callId: ToolCallId, name, arguments}`, `tool/result {turn, step, message: ToolResultMessage(toolCallId, isError?), error?}`, `request/header`, …
   - `TurnEndReason = TurnEndReasonMap[keyof …]` — discriminated **objects**: `{kind:'completed'} | {kind:'aborted', reason: TurnEndCancelCause} | {kind:'blocked'} | {kind:'error', error: LlmFailure} | {kind:'max-tokens'} | {kind:'interrupted'} | {kind:'forked'}`; `TurnEndCancelCause = {kind:'user'|'parent'|'hook'(reason)|'disposed'|'legacy'}`.
   - Live streaming is **transient frames**, not snapshot state: event `agent/assistant-stream` payload `{agent, frame: AssistantStreamFrame}`; `AssistantStreamFrame = {type:'start', attemptId, revision, turn, step} | {type:'chunk', …, chunk: StreamChunk} | {type:'end', …, outcome: committed('assistant/message'|'assistant/attempt', seq) | abandoned}`; `StreamChunk = {type:'block-start', index, blockType: ContentBlockType} | {type:'text-delta'|'reasoning-delta', index, text} | {type:'tool-call-delta', index, id, name?, argumentsDelta} | {type:'block-end', index, block: ContentBlock} | {type:'usage', usage} | {type:'finish', reason: FinishReason}`. Persisted aftermath: `AssistantStreamRecord` (`'text-chunks' | 'reasoning-chunks' | 'tool-call-chunks' | 'chunk'`) inside committed `assistant/message.stream`.
   - Content blocks discriminate on **`type`**, not `kind`: `ContentBlockMap { 'text': TextBlock; 'reasoning': ReasoningBlock; 'image'; 'file'; 'tool-call': ToolCallBlock; 'tool-addition'; 'tool-removal' }`; `ReasoningBlock { type: 'reasoning'; text: string }`.
   - Run-state lives on status surfaces: host events `agent/status` ("Agent status changed (idle ⇄ running)", payload `{agent, status: AgentStatus}`) and `api-session/status(sessionId, running: boolean)`; wire remotes `session/page`, `session/follow` (stream frames), `session/projections` (`SessionProjectionsValue`) on `sessionController`.

**Architectural rule that decides requirement 4:** a compatibility projection is, by construction, a pure fold over *committed* session events (`init`/`apply`/`view`). Therefore any legacy field that is a function of committed events (`running`, `runningCalls`, `turnEnds`) *can* be projected for a transition window; a field that is a function of *transient uncommitted frames* (`partial`) *cannot*, and compile-time surfaces (type imports, selector signatures) are never "projectable" at all.

---

## 2. Breaking-surface inventory (requirement 1)

All breaks are in `fixture/src/client/Pet.tsx`. `index.ts`, `locales.ts`, `package.json`, `cordis.patch.yml` are assessed non-breaking (§6).

| ID | Source location | Old surface (0.1.1-rc.1) | Breaks on 0.1.2-alpha.2 because | Card (§7 basis) |
|----|-----------------|--------------------------|--------------------------------|-----------------|
| B1 | `src/client/Pet.tsx:8` (used at :13) | `import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'` | The flat snapshot type is retired; the client session read model is the projection-keyed snapshot (`values: Partial<SessionProjectionMap>` per domain key). Type-only import fails to resolve. | DSH-0.1.2-A1-01 |
| B2 | `src/client/Pet.tsx:14` (via :20 `useSession(isThinking)`) | `snapshot.partial?.blocks.some(block => block.kind === 'reasoning')` | (a) `partial` — the mutable in-place streaming buffer — is gone; live tokens travel as transient `AssistantStreamFrame`/`StreamChunk` (`reasoning-delta`), never as snapshot state, and are unprojectable. (b) Block discriminator renamed `kind` → `type` (`ReasoningBlock { type: 'reasoning' }`). | DSH-0.1.2-A1-02 (partial→frames), DSH-0.1.2-A1-03 (kind→type) |
| B3 | `src/client/Pet.tsx:19` | `useSession(s => s.running)` | Flat top-level `running` removed with the flat snapshot; run-state is the status surface (`agent/status` idle⇄running / `api-session/status(running)`) folded into the session view. | DSH-0.1.2-A1-04 |
| B4 | `src/client/Pet.tsx:21` | `useSession(s => s.runningCalls.length > 0)` | Flat `runningCalls` array removed; in-flight calls are the event-paired state `tool/call {callId}` open ↔ `tool/result {message.toolCallId}` close, exposed keyed by `ToolCallId`. | DSH-0.1.2-A1-05 |
| B5 | `src/client/Pet.tsx:23` (consumer at :27) | `useSession(s => s.turnEnds[s.turnEnds.length - 1]?.reason)` | Parallel `turnEnds` array removed; turn timeline derives from committed `turn/end {turn, reason: TurnEndReason}` records — and `reason` changed **value shape**: scalar → discriminated object; comparisons on the raw value break even where a compat projection re-exposes the array. | DSH-0.1.2-A1-06 |
| B6 | `src/client/Pet.tsx:7,10,18–23` | `PropsRuntime<'conversation.session.header.actions'>` supplying `useSession(selectorOverFlatSnapshot)`; `PetProps` at :10 | Derivative, compile-time: every selector's input type is the retired flat snapshot (B1), and three of four selectors also change value shape (B3–B5). The slot-props container itself (`PropsRuntime`/`PropsLocale` from `@deepseek-ai/dsh-client-ui-slots`) is expected to remain, with the session selector re-typed to the projection view ⟨TVC: exact hook/type names in alpha.2 client d.ts⟩. | DSH-0.1.2-A1-01 |

---

## 3. Post-migration form, per break (requirement 2)

### B1 + B6 — snapshot type & selector signature
Old (Pet.tsx:8,13):
```ts
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
function isThinking(snapshot: ConversationSnapshot): boolean
```
New shape (host-verified wire model; client export names ⟨TVC⟩):
```ts
// The session read model is the projection snapshot:
//   ProjectionSnapshot { asOfSeq: SessionSeqCursor; values: Partial<SessionProjectionMap> }
// ui-conversation (or the runtime) merges its domain key into SessionProjectionMap,
// exactly like this plugin merges LocaleNamespaceMap today.
import type { SessionProjectionMap } from '@deepseek-ai/dsh-client-runtime/client' // ⟨TVC exact export⟩
type ConversationView = SessionProjectionMap['conversation'] // ⟨TVC domain key⟩
function isThinking(view: ConversationView, stream: AssistantStreamState): boolean // see B2
```
Every `useSession` selector keeps the hook call pattern (`useSession(s => …)` from slot props) but `s` is the projection view, not the flat snapshot ⟨TVC: if alpha.2 renamed the prop hook, e.g. `useSessionProjection`, adopt the rename mechanically — the selector-per-field usage pattern is unchanged⟩.

### B2 — live "thinking" signal (partial.blocks / kind)
Old (Pet.tsx:14): `snapshot.partial?.blocks.some(b => b.kind === 'reasoning')`

New read path — **stream frames, immediately** (no projection can carry this; §5):
```ts
// Subscribe to the assistant-stream surface the client runtime exposes
// (session 'follow' stream; frames mirror host AssistantStreamFrame). ⟨TVC hook name⟩
// thinking := a reasoning block is open in the current attempt:
//   on chunk.frame {type:'chunk'}:
//     chunk.type === 'block-start' && chunk.blockType === 'reasoning'  → open
//     chunk.type === 'reasoning-delta'                                 → still emitting
//     chunk.type === 'block-end' && chunk.block.type === 'reasoning'   → closed
//   frame {type:'end'} / turn boundary                                 → reset
```
Committed-state fallback (stopgap only; lags one message — flag as functional degradation if used):
```ts
// last committed assistant event carries the persisted stream records:
//   assistant/message.stream.some(r => r.type === 'reasoning-chunks')
// or its message content blocks: blocks.some(b => b.type === 'reasoning')   // 'type', not 'kind'
```
Wherever any block is matched, rename the discriminator: `block.kind === 'reasoning'` → `block.type === 'reasoning'` (ContentBlockMap: text/reasoning/image/file/tool-call/tool-addition/tool-removal).

### B3 — running
Old (Pet.tsx:19): `useSession(s => s.running)`
New canonical form: read run-state from the status surface folded into the session view, e.g. `useSession(s => s.status === 'running')` or the view's `running` boolean ⟨TVC exact field on the alpha.2 conversation view; host truth: `AgentStatus` idle⇄running, `api-session/status(sessionId, running)`⟩.
Transition: a compat projection may keep serving `s.running` unchanged (§5) — this call site compiles on day one **iff** the compat view is enabled; still re-type the selector input (B1).

### B4 — runningCalls
Old (Pet.tsx:21): `useSession(s => s.runningCalls.length > 0)`
New canonical form: in-flight set is keyed by `ToolCallId` — opened by committed `tool/call {turn, step, callId, name, arguments}`, closed by `tool/result {…, message: {toolCallId, isError?}}`:
```ts
useSession(s => Object.values(s.calls).some(c => c.status === 'running')) // ⟨TVC key/shape on alpha.2 view⟩
```
Semantics note: a call whose arguments are still streaming (`tool-call-delta` frames) is **not** in-flight until its `tool/call` event commits. If the pet should react earlier, derive it from frames (`block-start` with `blockType === 'tool-call'`) — optional enhancement, not required for parity.
Transition: compat projection can recompute a `runningCalls` array from the same fold (§5).

### B5 — turnEnds / reason
Old (Pet.tsx:23): `useSession(s => s.turnEnds[s.turnEnds.length - 1]?.reason)`
New canonical form — turn timeline from committed `turn/end` events, reason as object:
```ts
const lastTurnEnd = useSession(s => s.turns.at(-1)?.end?.reason.kind) // ⟨TVC view key⟩
// TurnEndReason kinds: 'completed' | 'aborted' | 'blocked' | 'error' | 'max-tokens' | 'interrupted' | 'forked'
// 'aborted' nests the cancel cause: reason.reason.kind ∈ 'user'|'parent'|'hook'|'disposed'|'legacy'
// Settle/celebration frame: kind === 'completed' (was: raw reason value compare).
```
Even if the compat projection re-exposes `turnEnds`, the accessor **must** change now: `.reason` → `.reason.kind` (unless the compat view is documented to downcast reason to its kind — verify on the card; do not rely on it).

---

## 4. Card mapping (requirement 3)

Cited per break in §2/§3 table column "Card". Consolidated:

| Card (reconstructed ID — see §7) | Change it denotes | Fixture surfaces |
|---|---|---|
| DSH-0.1.2-A1-01 | Flat `ConversationSnapshot` retired; client reads the projection-keyed snapshot (`ProjectionSnapshot.values`, domain keys via `SessionProjectionMap` merging); session selector input re-typed | B1, B6 (Pet.tsx:7-8,10,13,18-23) |
| DSH-0.1.2-A1-02 | Mutable `partial` streaming buffer removed; live tokens only via transient assistant-stream frames (`AssistantStreamFrame`/`StreamChunk`), persisted afterwards as `assistant/message.stream` records | B2a (Pet.tsx:14,20) |
| DSH-0.1.2-A1-03 | Content-block discriminator `kind` → `type` (`ContentBlockMap`) | B2b (Pet.tsx:14) |
| DSH-0.1.2-A1-04 | `running` → status surface (idle⇄running); compat projection offered | B3 (Pet.tsx:19) |
| DSH-0.1.2-A1-05 | `runningCalls` → `ToolCallId`-keyed call state (`tool/call`↔`tool/result` pairing); compat projection offered | B4 (Pet.tsx:21) |
| DSH-0.1.2-A1-06 | `turnEnds` → turn timeline over `turn/end` events; `reason` scalar → `TurnEndReason` object (`.kind`) | B5 (Pet.tsx:23,27) |

---

## 5. Compatibility projection vs immediate new read path (requirement 4)

**Decision rule (architecture-derived, §1):** compat projections are pure folds over *committed* `SessionEvent` records. Projectable ⇔ derivable from committed events. Type-level and transient-frame surfaces are never projectable.

| Legacy field | Function of committed events? | Verdict | Why |
|---|---|---|---|
| `running` (Pet.tsx:19) | Yes — `turn/start`/`turn/end` boundaries + status | **Projection-first OK** | Boolean fold; compat view serves `s.running` until the code moves to the canonical status read. Migrate in a later phase, before the compat view is retired. |
| `runningCalls` (Pet.tsx:21) | Yes — `tool/call` opened, `tool/result` closed | **Projection-first OK** | Pure pairing fold keyed by `callId`. One semantic caveat: in-flight starts at commit, not at first streamed token of the call (parity with 0.1.1 behaviour expected; confirm on card A1-05). |
| `turnEnds` array (Pet.tsx:23) | Yes — `turn/end` events | **Projection-first OK for the array**, **immediate for the accessor** | The timeline itself re-folds, but `reason` is now an object: `.reason` → `.reason.kind` is a value-shape break the projection cannot paper over (unless the card documents a downcast — verify). One-line change; do it now. |
| `partial.blocks` / `kind` (Pet.tsx:14) | **No** — transient frames, never committed until the final `assistant/message` | **Immediate new read path** | A projection structurally cannot reconstruct live token state; a compat shim could at best serve the *last committed* message's `stream` records — that is not `partial` (lags a whole message, kills the live "thinking" pose). Also `kind`→`type` breaks at value level. Switch to the frame subscription now; committed-record fallback only as a flagged stopgap. |
| `ConversationSnapshot` type import & selector signatures (Pet.tsx:8,10,13,18) | N/A — compile-time | **Immediate** | Projections are runtime constructs; they cannot keep a removed type export resolving. Re-type to the projection view on day one. |

**Consequence for the pet's behaviour on alpha.2 with zero code change:** nothing compiles (B1/B6 type breaks hit every call site); even under a maximally generous compat view (running/runningCalls/turnEnds re-exposed), the **thinking pose is dead** until B2 moves to frames, and the settle-frame comparison silently misfires on the object-valued `reason` (B5). This is why A1-02/03/06-accessor are "immediate" while A1-04/05 (and the A1-06 array) may ride the projection window.

**Suggested sequencing:**
1. **Phase 0 (compile-green):** B1/B6 re-type; `kind`→`type`; `.reason`→`.reason.kind`; keep `running`/`runningCalls`/`turnEnds` reads on the compat projection. Ship with a known, flagged degradation: no live thinking signal (B2 stopgap: committed `stream` records).
2. **Phase 1 (restore parity):** B2 onto the assistant-stream frame subscription (open reasoning block ∧ no in-flight call ⇒ 'thinking'); optional: earlier 'working' pose from `tool-call-delta` frames.
3. **Phase 2 (leave the compat window):** move B3/B4/B5-array reads to canonical projection-view fields before the compat view is retired (cards typically grant a bounded grace; verify per card).
4. **Phase 3 (hygiene):** bump peer/version pins to `0.1.2-alpha.2`, run the §6 verification list.

---

## 6. Assessed **non-breaking** surfaces (checked, with verification flags)

| Location | Surface | Assessment |
|---|---|---|
| `index.ts:29`, `index.ts:38-43` | `inject = ['slots','conversation','locale']`; `ctx.inject` ordering edge; `scope.slots.register({name:'conversation.session.header.actions', id:'pet', order:10}, Pet)` | Slot registration contract and the ui-conversation ordering edge are expected unchanged in the A1 (snapshot) wave — the live host still exposes a client `Slots` inspect provider and the slot namespace. ⟨TVC: slot key unchanged in alpha.2⟩ |
| `index.ts:36` | `ctx.effect(() => ctx.locale.register(NS, { zh, en }), …)` | Locale dictionary surface stable. ⟨TVC⟩ |
| `index.ts:14-19` | `declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap … }` | Augmentation pattern stable (the same declaration-merging idiom the new `SessionProjectionMap` uses). ⟨TVC: module path unchanged⟩ |
| `index.ts:6,8,10` | Type-only imports (`ClientContext`, locale ctx merge, ui-conversation SlotMap merge) | Expected stable; only the `ConversationSnapshot` export (Pet.tsx:8) is retired. |
| `package.json:8` | `client.inject: ["dsh-client-runtime","dsh-client-ui-conversation","dsh-client-locale"]` | Plugin package names expected stable; bump version pins to the 0.1.2-alpha.2 line. |
| `cordis.patch.yml` | loader insert of `bench-pet` | Unaffected. |
| `locales.ts` (all) | pure dictionaries | Unaffected. |

---

## 7. Card-citation basis (honesty note)

This noskill cell contains **no official upgrade-card index** (per the cell mapping, "in-container local documentation" for this arm = the cell material itself, which holds only the fixture). The brief mandates full card numbers in the form `DSH-0.1.2-A1-xx`. The IDs in §2/§4 are therefore **reconstructed**: they follow the mandated convention (A1 = the 0.1.2-alpha.1 breaking wave, cumulative into alpha.2), are assigned one card per distinct change domain, and each is **anchored by the exact change content and fixture line** so the mapping can be re-matched 1:1 against the official index. Where an official number differs, the *mapping* (surface → change → projection/immediate verdict) stands on the host-verified contracts of §1; only the numeric suffix needs substitution. No ID is claimed as quoted-from-source.

## 8. Verification checklist for the maintainer (before touching code)

1. Open the official 0.1.2 upgrade notes; substitute real card numbers into §4 (content anchors provided).
2. In the alpha.2 client `d.ts`: confirm the projection-view domain key for conversation, the selector hook name on `PropsRuntime`, the stream-subscription hook for assistant frames, and whether the compat view downcasts `TurnEndReason` to its `kind`.
3. Confirm the compat projection's grace window (which release retires `running`/`runningCalls`/`turnEnds` shims) to schedule Phase 2.
4. Re-run this cell's fixture hash manifest after any future edit to prove read-only discipline was kept during assessment.

## 9. Read-only discipline statement

- `/app/fixture/` **unmodified**: sha256 of all 6 files re-computed after the assessment and matched against `fixture-hash-before.json` (result recorded in `hash-verify-after.txt` alongside this report).
- Writes confined to `/app/agent-output/S3-snapshot-migration/` (this report, `card-map.json`, `hash-verify-after.txt`).
- No git operations, no network access, no reads of skills/, tests/, solution/, benchmark sources, or any path outside this cell; host API grounding used only the harness's read-only `cordis_inspect_*` bindings (permitted "local tools read-only"). Client-platform inspect unavailable (page not connected) — hence ⟨TVC⟩ flags instead of invented client-side names.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.