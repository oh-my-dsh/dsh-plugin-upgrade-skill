# S4 · Migration Touchpoint Report — dsh-pet-session-bench (0.1.1-rc.2 era → 0.1.2-alpha.2)

**Mode**: read-only inspection (Mode A / Mode C step 3 touchpoint inventory). No file under `fixture/` was read for writing, built, installed, or modified; no reproduction environment created; writes confined to `agent-output/`.
**Source identity**: `dsh-pet-session-bench@0.1.0`, private, ESM, Web Client-only plugin (`package.json` `dsh.client.platform: "web"`). No Host-plane code present; no DSH dependencies declared in `package.json` at all (imports are bare specifiers).
**Corridor**: 0.1.1-rc.2 → 0.1.2-alpha.2 = edges rc.2→alpha.1 ([v0.1.2-alpha.1.md](file)) + alpha.1→alpha.2 ([v0.1.2-alpha.2.md](file)) + the exact ledger [api-migration-0.1.2-alpha.2.md](file) (per skill README corridor metadata, not filename order).
**Pre-existing failures**: not collected (read-only; baseline build/test run not permitted by the brief).

## Breaking touchpoints found (4)

| # | File:line | Plane | Card ID | Surface hit |
|---|---|---|---|---|
| 1 | `fixture/src/client/index.ts:1` | Web Client | `DSH-0.1.2-A1-25` | `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'` — package removed |
| 2 | `fixture/src/client/index.ts:10` (decl at :5) | Web Client (plugin bundle ↔ host scan) | `DSH-0.1.2-A1-26` | `__ModuleLoader__.load('pet-legacy-bundle', …)` — registration id ≠ `package.json` `name` (`dsh-pet-session-bench`) |
| 3 | `fixture/src/client/index.ts:12–13` | Web Client | `DSH-0.1.2-A1-27` (+ ledger API-10) | `const { nodes } = useSession(); nodes[0]` — flat per-session `nodes[]` snapshot removed |
| 4 | `fixture/src/client/index.ts:11` | Web Client | `DSH-0.1.2-A1-30` | `ctx.connection.api.agentPresets.list()` — `ctx.connection.api` face removed entirely |

### 1 · `fixture/src/client/index.ts:1` — `@deepseek-ai/dsh-client-runtime/client` import — `DSH-0.1.2-A1-25`

- **Plane**: Web Client. **Card**: `DSH-0.1.2-A1-25` ("@deepseek-ai/dsh-client-runtime package removed, client symbols migrated by domain", type: breaking, required-if-hit). Sources: references/v0.1.2-alpha.1.md §A1-25; references/api-migration-0.1.2-alpha.2.md §API-10.
- **Breaks because**: the package was deleted from `packages/client` in 0.1.2-alpha.1 — typecheck reports a nonexistent module; at runtime a leftover `inject` reference would keep the assembly row pending/out of the boot graph.
- **Migration action** (per card recipe + API-10 ledger):
  - `ClientContext` → `import type { Context as ClientContext } from '@deepseek-ai/cordis'`;
  - add the plugin's own direct type/dev/peer dependencies for every owning package whose declarations/facets are consumed (ui-chat, session-controller, etc. — this fixture declares none today); activate Context augmentation with type-only imports from those owners;
  - remove `@deepseek-ai/dsh-client-runtime` from `dsh.client.inject` if declared (here it is not — see Skipped);
  - run one diagnostic typecheck with `skipLibCheck: false` to expose silent `any` propagation; any new implicit `any` is a migration failure.

### 2 · `fixture/src/client/index.ts:10` — registration id `'pet-legacy-bundle'` ≠ package name — `DSH-0.1.2-A1-26`

- **Plane**: Web Client (client bundle registration vs host client-modules scan). **Card**: `DSH-0.1.2-A1-26` ("client-modules scan contract: registration id must equal the package.json name", breaking, required-if-hit). Source: references/v0.1.2-alpha.1.md §A1-26.
- **Breaks because**: 0.1.2 keys boot-manifest entries/modules/registrations by package name ("Entry name == package name"). The call `__ModuleLoader__.load('pet-legacy-bundle', …)` (declared shape at line 5) does not match `package.json` `name: "dsh-pet-session-bench"` → startup assertion `loaded without registering "<id>"`, or silently the panel/boot-graph entry disappears with no plugin error in logs.
- **Migration action**: align all three ids to the bare package name `dsh-pet-session-bench`: (1) the bundle registration id (usually injected via the tsdown banner `PLUGIN_ID`) == `package.json` name; (2) the assembly row `name` in the plugin's `cordis.patch.yml`/home patch uses the bare package name — the 0.1.1 `file:///` literal-path + short-name id form must be replaced; (3) verify with `dsh --profile <name> --dump-config`, then check `window.__DSH_BOOT__.entries` contains `"id":"dsh-pet-session-bench"` and the combo-route script contains `__ModuleLoader__.load({ id: "dsh-pet-session-bench"`.

### 3 · `fixture/src/client/index.ts:12–13` — flat `useSession()` `nodes` snapshot — `DSH-0.1.2-A1-27` (+ API-10)

- **Plane**: Web Client. **Card**: `DSH-0.1.2-A1-27` ("Session content reads now go through the SessionBinding durable event window", breaking, required-if-hit), with the exact alpha.2 shape pinned by ledger API-10 ("keyed chat snapshots"). Sources: references/v0.1.2-alpha.1.md §A1-27; references/api-migration-0.1.2-alpha.2.md §API-10 (alpha.2 `ChatSnapshot`/`ChatNodeStore`).
- **Breaks because**: 0.1.2 removed per-session conversation-node snapshots; on alpha.2 `ChatSnapshot.nodes` is a **keyed store, not the old `ConversationNode[]`** — `const { nodes } = useSession(); nodes[0]` yields undefined/empty and factory errors while the plugin still loads (half-broken, not a crash).
- **Migration action**:
  - `useSession(session => session?.nodes)` → `useChat(chat => …)`; ordered reading = iterate `snapshot.order` and `snapshot.nodes.get(id)` per id (the ledger's `orderedNodes` helper shape);
  - for raw transcript/user-message reads, use the SessionBinding durable event window: `sessions.binding(id)` → `binding.eventSource.getSnapshot().entries`, user text in `entry.event.data.content` `{type:'text', text}` blocks (`SessionBinding`/`SessionEventLikeEntry` from `@deepseek-ai/dsh-api-session-controller/client`);
  - do **not** adopt `snapshot.legacy.nodes` as the primary surface (staged dual-host compatibility only); do not mask old array fixtures in tests with casts.

### 4 · `fixture/src/client/index.ts:11` — `ctx.connection.api.agentPresets.list()` — `DSH-0.1.2-A1-30`

- **Plane**: Web Client. **Card**: `DSH-0.1.2-A1-30` ("Client `ctx.connection.api` face removed entirely; history/transcript reads rerouted", breaking, required-if-hit). Source: references/v0.1.2-alpha.1.md §A1-30.
- **Breaks because**: alpha.1 removed the apiProxy mirror face on `ctx.connection`; the call throws. The card warns that a silently-swallowing catch turns this into a "forever blank" UI that no-crash smokes cannot catch — this call site's `.then(...)` with no rejection handling is exactly that failure mode.
- **Migration action**: branch by session origin — ordinary sessions: move history/preset reads to the successor Remotes (`session/page` / `session/follow`; note the subagent-address enforcement and `throughSeq` cursor rule); subagent-origin sessions have no usable host RPC — serve transcripts through the plugin's own host routes (live: `agent.session.events`; cold: `sessionPersistence.inspect` with seed cutting + `afterSeq` deltas). After the client stops consuming the face, also remove `connection` from the `inject` list and the type mirror — leave no dead face (this fixture's exported `inject` at line 7 is `['slots','conversation']`, no `connection` entry to remove).

## Skipped / non-hits (with evidence)

- **`package.json:6` `"dsh": { "client": { "platform": "web" } }`** — already the merged `dsh.client` manifest form (the rc.1-era `dshClient`→`dsh.client` merge, v0.1.1-rc.1 cards, predates this corridor); no `inject` key, so nothing references the removed runtime package. No card hit.
- **`src/client/index.ts:7` `export const inject = ['slots','conversation']`** — neither entry is a removed package per the consulted cards; whether these two service names remain the exact 0.1.2-alpha.2 service keys is **unconfirmed** (no card consulted enumerates them; defer to the target tag's actual service exports).
- **`src/client/Pet.tsx:1`** — empty component, no DSH surface. No hit.
- **Host plane** — no host code in the fixture; no Host-plane card applies.
- Other A1 cards (composer contenteditable A1-28, MarkdownText labels A1-29, workspaces navigation A1-32, subagent descriptor A1-31, …) were scanned against the four fixture files: no DOM manipulation, no `MarkdownText`, no `ctx.workspaces` navigation calls, no descriptor construction → not hit.

## Pending / unconfirmed / residual risk

- Exact 0.1.2-alpha.2 export names (`useChat`, `ChatSnapshot`, service keys for `slots`/`conversation`) must be re-verified against the target tag's declarations at implementation time — the cards themselves say "defer to each package's actual exports at the target tag". Marked **unconfirmed** here because the brief forbids building/installing to check.
- Dependency ownership for the new imports (touchpoint 1) is unresolved by design: `package.json` currently declares zero DSH dependencies, so every migrated import needs an explicit direct dependency added during the actual migration (Mode C, not performed here).

## Read-only discipline record

Fixture files were only read (4/4 enumerated: README.md, package.json, src/client/index.ts, src/client/Pet.tsx). No installs, builds, scripts, or writes outside `agent-output/`. Card texts consulted: references/v0.1.2-alpha.1.md (§A1-25/26/27/30), references/api-migration-0.1.2-alpha.2.md (§API-10); README.md touchpoint hints used as a cross-check only — every card mapping above was independently verified in the cited reference files.
