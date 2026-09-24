# S3 · Snapshot Read-Surface Migration Assessment — `bench-pet` (0.1.1-rc.1 → dsh 0.1.2-alpha.2)

Read-only assessment. The fixture under `environment/fixture` was inspected but not modified; no migration was executed.

## Scope and method

The plugin is a Web Client half (`package.json` declares `dsh.client.platform: "web"`) that registers a pixel pet into the `conversation.session.header.actions` slot and drives its animation from the flat conversation snapshot fields via `useSession` selectors. Every snapshot read in the plugin was mapped against the 0.1.2-alpha.1 / 0.1.2-alpha.2 change cards and the alpha.2 interface ledger (API-10).

Corridor: 0.1.1-rc.1-era code → dsh-v0.1.2-alpha.2. The snapshot read-surface breaks land in the alpha.1 edge (cards `DSH-0.1.2-A1-xx`); the alpha.2 edge adds the keyed `ChatSnapshot` final form.

## Hit list

### 1. `ConversationSnapshot` imported from the removed `@deepseek-ai/dsh-client-runtime/client`

- 当前证据: `src/client/Pet.tsx:8` — `import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'`
- 旧写法: type-only import of the aggregated runtime package's snapshot type; selector signature `isThinking(snapshot: ConversationSnapshot)`.
- 会怎么炸: the package was deleted in alpha.1 — build/typecheck report a nonexistent module (TS2305 / bundler resolution failure); at runtime the plugin does not enter the boot graph or its assembly row stays pending forever, often without an explicit error.
- 目标写法: compose types from the owning packages per actual use:
  ```ts
  import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
  import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
  ```
  For an alpha.2-only plugin the final read shape is the keyed chat snapshot (see hit 4).
- Card: **DSH-0.1.2-A1-25** (`@deepseek-ai/dsh-client-runtime` package removed, client symbols migrated by domain). Supplementary: alpha.2 interface ledger API-10.
- Required change: **required**.

### 2. `ClientContext` imported from the removed runtime package (`src/client/index.ts`)

- 当前证据: `src/client/index.ts:6` — `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'`
- 旧写法: aggregated client context type re-exported by the runtime package.
- 会怎么炸: same module-resolution failure as hit 1; without the runtime package the Context facet merges (`ctx.locale`, the SlotMap entry for `conversation.session.header.actions`) are no longer visible to the compiler face.
- 目标写法:
  ```ts
  import type { Context as ClientContext } from '@deepseek-ai/cordis'
  // keep the type-only owning-package pulls already present at index.ts:8-10;
  // each whose declarations the source consumes must become a direct dev/peer dependency
  import type {} from '@deepseek-ai/dsh-client-locale/client'
  import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
  ```
- Card: **DSH-0.1.2-A1-25**.
- Required change: **required**. Note: `@deepseek-ai/dsh-client-ui-conversation` and `@deepseek-ai/dsh-client-locale` must be the plugin's own direct type/dev/peer dependencies — a published package's devDependencies are not transitively installed for consumers. After the first migration pass run `tsc --skipLibCheck false` once to locate any missing declaration chain; any newly implicit `any` is a migration failure.

### 3. `dsh.client.inject` still lists the phantom runtime package

- 当前证据: `package.json:8` — `"inject": ["dsh-client-runtime", "dsh-client-ui-conversation", "dsh-client-locale"]`
- 旧写法: declaring the aggregated runtime package as an injected client service.
- 会怎么炸: after the dismantling `dsh-client-runtime` is a runtime phantom dependency; keeping it leaves the assembly row pending / keeps the client half out of the boot graph, typically silently (panel disappears, no plugin-related log errors).
- 目标写法: remove `dsh-client-runtime`; keep only packages that actually provide services the bundle consumes:
  ```json
  "client": {
    "platform": "web",
    "inject": ["dsh-client-ui-conversation", "dsh-client-locale"]
  }
  ```
  (Add `dsh-client-ui-chat` only once the plugin actually imports it per hit 4.)
- Card: **DSH-0.1.2-A1-25** (package.json cleanup is an explicit part of the card's recipe).
- Required change: **required**.

### 4. Flat snapshot reads via `useSession` selectors (`partial.blocks`, `runningCalls`, `turnEnds`)

- 当前证据:
  - `src/client/Pet.tsx:13-15` — `isThinking` reads `snapshot.partial?.blocks.some(block => block.kind === 'reasoning')`
  - `src/client/Pet.tsx:21` — `useSession(s => s.runningCalls.length > 0)`
  - `src/client/Pet.tsx:23` — `useSession(s => s.turnEnds[s.turnEnds.length - 1]?.reason)`
  - `src/client/Pet.tsx:20` — `useSession(isThinking)` over the flat `ConversationSnapshot`
- 旧写法: the 0.1.1 flat `ConversationSnapshot` — `nodes[]`, `partial`, `runningCalls`, `turnEnds` — read through the `useSession` transcript seat.
- 会怎么炸: 0.1.2 no longer exposes per-session flat conversation-node snapshots; the timeline becomes an internal projection of each view package. `session.getSnapshot().nodes`-style reads return `undefined` / empty and selectors degrade to `any` once the old types are gone — the pet silently freezes on `idle` instead of throwing.
- 目标写法 (alpha.2 final form): switch the transcript seat to `useChat` and read the keyed store:
  ```ts
  import type { Context } from '@deepseek-ai/cordis'
  import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'

  function orderedNodes(snapshot: ChatSnapshot) {
    return snapshot.order.flatMap((id) => {
      const node = snapshot.nodes.get(id)
      return node ? [node] : []
    })
  }
  ```
  - `thinking`: narrow nodes by discriminant to `type === 'assistant-step'` and read `data.finalNode` for the step's final content; do not mask old array fixtures with `as unknown as ChatSnapshot`.
  - `toolRunning`: derive from in-flight assistant-step tool-call state in the keyed store (no `runningCalls` array exists).
  - `lastTurnEnd`: read the turn timeline from the owning view projection (views/timeline), not a flat `turnEnds[]`.
- Card: **DSH-0.1.2-A1-03** (Session view internals split up extensively — its field note covers exactly the flat `ConversationSnapshot` fields of this plugin) and **DSH-0.1.2-A1-27** (session content reads go through the SessionBinding durable event window — applies if the pet is extended to read message content). Final keyed-store shape: alpha.2 ledger API-10.
- Required change: **required**, but staged — see the projection plan below.

### 5. Lifecycle read `s.running` via `useSession`

- 当前证据: `src/client/Pet.tsx:19` — `useSession(s => s.running)`
- 旧写法: lifecycle field on the flat session snapshot.
- 会怎么炸 / 约束: lifecycle fields such as `running` are **not** part of the compatibility projection; there is no `legacy` fallback for them. Conversely this is the one read that must keep going through the `useSession` seat — it cannot be moved to the chat view.
- 目标写法: keep `useSession(s => s.running)` on the session seat; only the transcript-derived fields migrate to `useChat`.
- Card: **DSH-0.1.2-A1-03** (field note: "lifecycle fields (e.g. running) are not in the projection and must go through the useSession seat instead").
- Required change: conditional — keep as-is, do not migrate to the chat seat.

### 6. Slot registration and locale dictionary (`src/client/index.ts:36-43`)

- 当前证据: `ctx.effect(() => ctx.locale.register(NS, { zh, en }))`; `scope.slots.register({ name: 'conversation.session.header.actions', id: 'pet', order: 10 }, Pet)` inside `ctx.inject(['slots', 'conversation'], ...)`.
- 评估: no card records a break on `locale.register`, `slots.register`, or the `conversation.session.header.actions` slot itself; the ordering edge (`conversation` injected because the slot is declared by ui-conversation's apply) matches the post-split ownership since the plugin already type-pulls `@deepseek-ai/dsh-client-ui-conversation/client`. Per the corridor discipline ("host UI changes without cards do not mean definitely no API impact"), verify the slot entry and props shape (`PropsRuntime`/`PropsLocale` from `@deepseek-ai/dsh-client-ui-slots`, `Pet.tsx:10`) against the alpha.2 tag's `packages/client/ui-slots` declarations before shipping — mark "pending confirmation" rather than assuming.
- Card: **DSH-0.1.2-A1-03** (verification requirement; no confirmed hit).
- Required change: verification only.

### 7. Boot-graph identity check (`cordis.patch.yml`, `package.json`) — not hit

- 当前证据: assembly row `id: bench-pet`, `name: '@demo/dsh-bench-pet'` (`cordis.patch.yml:2-3`); `package.json` `name` is `@demo/dsh-bench-pet`.
- 评估: the row name already equals the bare package name, satisfying the new scan contract; the client bundle's `__ModuleLoader__.load` registration id must equal the package name as well — confirm at build time (`dsh --profile <p> --dump-config`, no pending rows).
- Card: **DSH-0.1.2-A1-26**.
- Required change: none (verify only).

## Compatibility projection vs. immediate new read path

Per the DSH-0.1.2-A1-03 field note (dsh-ui-whale / dsh-ui-progress / dsh-input-history migration), the old flat `ConversationSnapshot` fields remain readable through the `views.get('chat')?.legacy` projection during a staged migration:

| Read in `Pet.tsx` | Old field | Compatibility projection (`views.get('chat')?.legacy`) | Final alpha.2 read path |
|---|---|---|---|
| `Pet.tsx:14` thinking | `partial.blocks` | ✅ available via `legacy` — can run first through the projection | `useChat` + keyed store: `assistant-step` node → `data.finalNode` |
| `Pet.tsx:21` toolRunning | `runningCalls` | ✅ available via `legacy` | `useChat` + keyed store, in-flight tool-call state |
| `Pet.tsx:23` settle frame | `turnEnds[].reason` | ✅ available via `legacy` | owning view's turn timeline projection |
| `Pet.tsx:19` busy flag | `running` | ❌ **not in the projection** — must stay on the `useSession` seat immediately; it is also the only read that must *not* move to `useChat` | `useSession(s => s.running)` (unchanged seat) |
| type import (`Pet.tsx:8`, `index.ts:6`) | `ConversationSnapshot` / `ClientContext` from `dsh-client-runtime/client` | ❌ no projection — the package is gone; imports and `dsh.client.inject` must switch to the new owning-package paths immediately | `@deepseek-ai/cordis` `Context` + owning-package `type {}` pulls |

Recommended staging (the verified two-step approach from the A1-03 field note): first migrate everything to the `legacy` projection plus the new imports (hits 1–3 and the projection row above) so the pet renders again on alpha.2; once stable, migrate field-by-field to `useChat` + the keyed store. `snapshot.legacy` exists only for staged compatibility under an explicit dual-host requirement — for an alpha.2-only plugin it must not remain the primary data surface.

## Summary table

| Hit location | Old interface | Typical symptom on 0.1.2-alpha.2 | Target interface | Card | Required / conditional |
|---|---|---|---|---|---|
| `Pet.tsx:8` | `ConversationSnapshot` from `dsh-client-runtime/client` | module-resolution failure; silent `any` selectors | `ChatSnapshot` from `@deepseek-ai/dsh-client-ui-chat/client` + owning-package pulls | DSH-0.1.2-A1-25 | required |
| `index.ts:6` | `ClientContext` from `dsh-client-runtime/client` | same module failure; lost Context facet merges | `Context` from `@deepseek-ai/cordis` + `type {}` augmentations | DSH-0.1.2-A1-25 | required |
| `package.json:8` | `dsh-client-runtime` in `dsh.client.inject` | assembly row pending / client half out of boot graph | remove; keep only real service packages | DSH-0.1.2-A1-25 | required |
| `Pet.tsx:14,21,23` | flat `partial`/`runningCalls`/`turnEnds` via `useSession` | pet freezes on idle; selectors degrade | staged: `views.get('chat')?.legacy`; final: `useChat` + `order`/`nodes.get()`, `assistant-step` → `data.finalNode` | DSH-0.1.2-A1-03 (A1-27 for content reads; ledger API-10) | required, staged |
| `Pet.tsx:19` | `s.running` via `useSession` | — (must not migrate to chat seat; not in projection) | keep on `useSession` seat | DSH-0.1.2-A1-03 | conditional (keep) |
| `index.ts:36-43`, `Pet.tsx:10` | slot + locale registration, `PropsRuntime`/`PropsLocale` | none recorded | verify slot/props declarations at target tag | DSH-0.1.2-A1-03 | verification |
| `cordis.patch.yml` | row `name` = package name | none — already conforms | confirm bundle registration id == package name | DSH-0.1.2-A1-26 | verification |

## Verification ladder (post-migration, not executed here)

1. Static: no `dsh-client-runtime` imports or inject entries remain; lockfile lands on the exact alpha.2 cohort.
2. `tsc --skipLibCheck false` once — no missing declaration chain, no new implicit `any`.
3. Client tests use the real `ChatNodeStore` shape (`order` + keyed `get`), covering missing ids and the assistant final node.
4. `dsh --profile <p> --dump-config`: plugin row present, no pending; cold web boot shows the pet DOM marker; animation follows thinking/working/settle states in a real session.
