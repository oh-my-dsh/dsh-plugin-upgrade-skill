# S3 · Snapshot Read-Surface Migration Assessment (0.1.1-rc.1 → 0.1.2-alpha.2)

Scope: read-only assessment of `fixture/` (bench-pet pixel-pet Web Client plugin).
No code, fixture file, or skill document was modified.

## 1. Broken surfaces, tied to source locations

| # | Location | Old surface | Why it breaks on 0.1.2-alpha.2 | Card |
|---|---|---|---|---|
| 1 | `fixture/package.json:8` | `"inject": ["dsh-client-runtime", "dsh-client-ui-conversation", "dsh-client-locale"]` | `@deepseek-ai/dsh-client-runtime` package is deleted since alpha.1; keeping it leaves the assembly row pending forever / plugin out of the boot graph | DSH-0.1.2-A1-25 |
| 2 | `fixture/src/client/index.ts:6` | `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'` | Removed module: build/typecheck TS2305, no export | DSH-0.1.2-A1-25 (API-10) |
| 3 | `fixture/src/client/index.ts:7-10` | Type-only pulls of the locale and ui-conversation Context merges from the aggregate package pattern | Context facets must come from each owning package via `import type {} from '<owner>/client'`; the aggregate package no longer provides them | DSH-0.1.2-A1-25 (API-10) |
| 4 | `fixture/src/client/Pet.tsx:8` | `import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'` | Removed module; the flat `ConversationSnapshot` type (nodes/partial/runningCalls/turnEnds/running) is no longer the read surface | DSH-0.1.2-A1-25; DSH-0.1.2-A1-03 |
| 5 | `fixture/src/client/Pet.tsx:13-15` | `isThinking(snapshot)` reads `snapshot.partial?.blocks.some(b => b.kind === 'reasoning')` | Flat `partial` is gone from the live snapshot; typecheck fails, or silently `undefined` once typed loosely | DSH-0.1.2-A1-03 (legacy projection bridge); API-10 |
| 6 | `fixture/src/client/Pet.tsx:19` | `useSession(s => s.running)` | Lifecycle fields are NOT in the legacy compatibility projection — this cannot be bridged; must move to the new read path immediately | DSH-0.1.2-A1-03 (example evidence: 06-real-world-batch-migration) |
| 7 | `fixture/src/client/Pet.tsx:20` | `useSession(isThinking)` | The rc.1-era `useSession` transcript hook is replaced; selector runs against the old flat snapshot | API-10; DSH-0.1.2-A1-03 |
| 8 | `fixture/src/client/Pet.tsx:21` | `useSession(s => s.runningCalls.length > 0)` | Flat `runningCalls` not on the live surface; bridgeable via legacy first | DSH-0.1.2-A1-03; API-10 |
| 9 | `fixture/src/client/Pet.tsx:23` | `useSession(s => s.turnEnds[s.turnEnds.length - 1]?.reason)` | Turn timeline moved off the flat field; final home is the chat view's timeline | DSH-0.1.2-A1-03; API-10 |
| 10 | `fixture/src/client/Pet.tsx:18-31` | Whole Pet component: `PropsRuntime<...>` props destructured with `useSession`; frame ref logic driven by flat fields | The slot-props hook shape migrates to `useChat` (+ `useConversation` for the timeline/view); keyed `ChatSnapshot` store replaces the array | API-10; DSH-0.1.2-A1-03 |
| 11 | `fixture/src/client/index.ts:38-43` | `ctx.inject(['slots','conversation'], scope => scope.slots.register(...))` | On 0.1.2, slot registration goes through `ctx.slots.inject(name, () => ctx.slots.register(...))`; `ctx.slots` types come from the ui-renderer package, which must be declared | DSH-0.1.2-A1-03 (companion; no dedicated card — gap, see §5) |
| 12 | `fixture/src/client/index.ts:29` | `export const inject = ['slots', 'conversation', 'locale']` | Must list only runtime service packages that exist on alpha.2 and actually provide services: drop the deleted runtime (in package.json), add the packages that now own the consumed surfaces (`dsh-client-ui-chat`, ui-renderer slot types) | DSH-0.1.2-A1-25; example 06 |

Not hit (checked, no action): `IWorkspaces`/`connectWorkspace`/`pickDirectory` (fixture never calls them — DSH-0.1.2-A1-32 N/A); `dsh-llm` token helpers (A1-22 N/A); Code Mode/PTC config (CFG-01 N/A); `userQuestions.registerProvider` (A1-20 N/A); Remote failure vocabulary (A2-02 N/A — no `ctx.remote` use); `PluginInventorySnapshot` consumer (A2-05 N/A).

Note on `PropsRuntime`/`PropsLocale` (`Pet.tsx:7,10`): flagged by the pre-flight radar, but `PropsRuntime<'...'>` still appears in 0.1.5-era cards (e.g. rightbar), so the type itself is not removed in this corridor — treat as a verify-by-typecheck item, not a certain break. `PropsLocale` usage is unaffected.

## 2. Correct post-migration form per hit

### 1 · package.json inject (DSH-0.1.2-A1-25)
```json
"inject": ["dsh-client-ui-conversation", "dsh-client-ui-chat", "dsh-client-locale"]
```
Remove `dsh-client-runtime`; add only service packages the target host actually provides (ui-chat for `useChat`, ui-renderer for slot types, per example 06).

### 2 · index.ts Context import (DSH-0.1.2-A1-25 / API-10)
```ts
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'       // ChatSnapshot / useChat types
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'     // ctx.slots types
```
Delete the `@deepseek-ai/dsh-client-runtime/client` import and its devDependency entry entirely.

### 3 · Session transcript / snapshot reads — `useSession` → `useChat` (API-10)
Old:
```ts
const nodes = useSession(s => s?.nodes)          // or (s) => s.running etc.
```
New (alpha.2-native read shape):
```ts
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'

function orderedNodes(snapshot: ChatSnapshot) {
  return snapshot.order.flatMap((id) => {
    const node = snapshot.nodes.get(id)
    return node ? [node] : []
  })
}
const nodes = useChat((chat) => (chat ? orderedNodes(chat) : []))
```
`ConversationSnapshot.nodes[]` becomes `ChatSnapshot.order` (ids in order) + `ChatSnapshot.nodes.get(id)`; assistant final node narrows via `type === 'assistant-step'` → `data.finalNode`. For standalone reads outside a component, `ctx.useChat((chat) => ...)`.

### 4 · Field-by-field mapping for Pet.tsx

- `s.partial?.blocks…reasoning` (Pet.tsx:14):
  - Bridge (first pass): `conversationSnapshot.views.get('chat')?.legacy?.partial` — same old field, served by the compat projection.
  - Final: read reasoning from the keyed chat nodes via `useChat` (reasoning blocks are nodes in `ChatSnapshot.order`/`nodes.get`); do not leave `legacy.partial` as the primary surface.
- `s.running` (Pet.tsx:19): NOT in `legacy`. Move immediately to the `useSession` seat — i.e. the slot-props now combine `useSession` + `useConversation`, and `running` is read there, not from the snapshot's flat lifecycle fields (example 06, "lifecycle split").
- `s.runningCalls.length > 0` (Pet.tsx:21):
  - Bridge: `chat?.legacy?.runningCalls`.
  - Final: tool-call in-flight state derived from keyed nodes/timeline.
- `s.turnEnds[len-1]?.reason` (Pet.tsx:23):
  - Bridge: `chat?.legacy?.turnEnds`.
  - Final: turn-end detection moves to the chat view's timeline (`chat?.timeline`).
- `useSession(s => …)` hook prop in PetProps (Pet.tsx:18-20): switch the component to the new hook pair (`useSession` for lifecycle + `useConversation`/`useChat` for transcript/view); the old flat-snapshot selector form is gone.

### 5 · Slot registration (index.ts:38-43)
```ts
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'pet: dictionaries')
  ctx.slots.inject('conversation.session.header.actions', () =>
    ctx.slots.register(
      { name: 'conversation.session.header.actions', id: 'pet', order: 10 },
      Pet,
    ),
  )
}
```
Also declare the owning packages (`dsh-client-ui-chat`, `dsh-client-ui-renderer`) in `dsh.client.inject`/devDependencies and keep registration id equal to the package name (DSH-0.1.2-A1-26: id must equal package.json `name`).

### 6 · Session content reads, if extended (DSH-0.1.2-A1-27)
If the plugin later reads message content directly, per-session `session.getSnapshot().nodes` no longer exists; use:
```ts
import { sessions } from ... // SessionBinding from '@deepseek-ai/dsh-api-session-controller/client'
const binding = sessions.binding(id)                 // SessionBinding | undefined
if (!binding) return null
const entries = binding.eventSource.getSnapshot().entries  // SessionEventLikeEntry[]
const conversation = binding.ctx.get('conversation')
```

## 3. Compatibility projection vs immediate switch (requirement 4)

- Can run first through the compatibility projection (staged migration):
  - `nodes`, `partial` (reasoning blocks), `runningCalls`, `turnEnds` — all remain readable via `conversationSnapshot.views.get('chat')?.legacy` (bridge form, example 06 step 3; API-10 notes `ChatSnapshot.legacy.nodes` exists for dual-hosting but must not be the alpha.2-primary surface).
  - Purpose: get the plugin compiling/running, then migrate field-by-field to `views`/`timeline`/keyed nodes.
- Must switch immediately (no legacy bridge):
  - Lifecycle fields — above all `running` (Pet.tsx:19): absent from `legacy`, so it cannot be shimmed; read through the `useSession` seat (component props combine `useSession` + `useConversation`).
  - The `useSession(snapshot => …)` transcript hook itself: on alpha.2-only code the selector form against the flat snapshot is replaced by `useChat` + `ChatSnapshot.order`/`nodes.get(id)`; `legacy.nodes` is explicitly not the primary data surface.
  - Type imports from `@deepseek-ai/dsh-client-runtime/client` and the `dsh.client.inject` row for the deleted package: no compat path — removal is mandatory on boot (pending assembly row) and typecheck.

## 4. Card mapping (full numbers)

| Hit | Card |
|---|---|
| `dsh-client-runtime` imports, `ClientContext`, `ConversationSnapshot` import, inject cleanup, slot/package services reassignment | DSH-0.1.2-A1-25 |
| Flat session view fields split; `useSession` transcript → `useChat`; `views.get('chat')?.legacy` staged bridge; lifecycle → `useSession` seat; turn timeline → `chat?.timeline` | DSH-0.1.2-A1-03 |
| Session content reads (if used): `session.getSnapshot().nodes` → `SessionBinding` durable event window (`binding.eventSource.getSnapshot().entries`) | DSH-0.1.2-A1-27 |
| Keyed `ChatSnapshot` (`order` + `nodes.get`), `useChat` selector shape, command images arg, Context augmentation pattern | API-10 (ledger of `references/api-migration-0.1.2-alpha.2.md`) |
| Slot registration id must equal package.json name; id/name alignment | DSH-0.1.2-A1-26 |
| Peer/direct dependency hygiene for newly consumed type packages (run one `skipLibCheck: false` pass; add direct dev/peer deps) | DSH-0.1.2-A2-03 (conditional) |
| Not hit: IWorkspaces navigation | DSH-0.1.2-A1-32 |

## 5. Gaps / limitations

- No dedicated card exists for the `ctx.slots.inject(name, () => …)` registration reshape; it is demonstrated only in example `06-real-world-batch-migration` (and the same pattern in 08). Treat card attribution as A1-03-companion, not a card guarantee.
- Lifecycle-field split (`running` → `useSession` seat) is documented in example 06 / A1-03 field notes, not in a standalone card body.
- External/upstream references (GitHub tags, release notes) were not consulted per the brief; every claim above is sourced from the local skill references/examples. Where the local material is a field note/example rather than a card, that is marked.

## 6. Validation plan (no execution performed)

1. `grep -rn "dsh-client-runtime\|ConversationSnapshot\|useSession(s\|turnEnds\|runningCalls" src/ package.json` — expect zero hits after migration.
2. One `tsc` pass with `skipLibCheck: false`; fix missing declaration owners, then restore the repo's skipLibCheck policy (precision checklist).
3. Client tests rebuilt on real `ChatNodeStore` shape: `order` ids + `nodes.get(id)`, missing ids, `assistant-step` → `data.finalNode`, and timeline-based turn-end detection.
4. `dsh --profile <web> --dump-config`: no pending rows; Web cold boot token→Cookie; boot manifest contains plugin id equal to package name; hard-refresh mount check.
5. Behavior check: thinking/tool-in-flight pet frames driven by the new read paths (`useSession` seat lifecycle, `chat.timeline`, keyed nodes), not legacy.
