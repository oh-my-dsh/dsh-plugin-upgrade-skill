# S4 · Legacy Client Runtime Touchpoints — Migration Touchpoint Report (Read-Only)

## Scope & identity

- **Plugin under review**: `dsh-pet-session-bench` (`fixture/package.json:2`), version `0.1.0`, `"private": true`, `"type": "module"`.
- **Plugin plane**: **Web Client** plugin — `package.json:6` declares `"dsh": { "client": { "platform": "web" } }`; all source lives under `src/client/` and the entry uses the browser-plane `__ModuleLoader__`, `ctx.connection`, and `useSession`.
- **Migration corridor (static copy, from → to)**: `dsh-v0.1.1-rc.2` → `dsh-v0.1.2-alpha.2`, connected by the directed edges `rc.2 → alpha.1` (card file `references/v0.1.2-alpha.1.md`, prefix `DSH-0.1.2-A1`, 28 cards) then `alpha.1 → alpha.2` (`references/v0.1.2-alpha.2.md`, prefix `DSH-0.1.2-A2`, 8 cards). Corridor confirmed against `references/README.md` version-corridor index (orders 2 and 3) and the exact-tag SHAs in `references/api-migration-0.1.2-alpha.2.md` (rc.2 `b150a551…` → alpha.1 `cd5ef814…` → alpha.2 `0a53fb55…`).
- **Method**: read-only static scan of the fixture against the mounted `plugin-upgrade` skill reference cards. No build, no install, no reproduction environment, no fixture modification (see "Read-only discipline" at the end).
- **Card-sourcing rule**: every card ID below is quoted from a mounted skill reference file. Nothing is invented. Where the mounted cards do not settle a point, it is explicitly marked **unconfirmed** (see "Unconfirmed / caveats").

---

## 1. Touchpoint summary (requirement 1)

| # | File : line | Affected plane | Card ID (full) | Migration action (short) |
|---|---|---|---|---|
| T1 | `src/client/index.ts:1` (import) and `:9` (`apply(ctx: ClientContext)` type) | Web Client | `DSH-0.1.2-A1-25` | Replace the removed `@deepseek-ai/dsh-client-runtime/client` import with `import type { Context as ClientContext } from '@deepseek-ai/cordis'`; add type-only augmentations from owning packages as actually used. |
| T2 | `src/client/index.ts:10` (baseline `package.json:2`) | Web Client | `DSH-0.1.2-A1-26` | Make the `__ModuleLoader__.load` registration id equal the package.json `name` (`dsh-pet-session-bench`), and align the assembly-row name to the bare package name. |
| T3 | `src/client/index.ts:11` | Web Client | `DSH-0.1.2-A1-30` | The `ctx.connection.api` face is gone; move the call to the generated Remote projection `ctx.remote.agentPresets.list()` (method map `agentPreset.list → agentPresets/list`, card `DSH-0.1.2-A1-01`), declare `remote` in `inject`, and branch on `RemoteResult` (`DSH-0.1.2-A2-02`). |
| T4 | `src/client/index.ts:12` and `:13` | Web Client | `DSH-0.1.2-A1-27` | The flat `useSession()` `nodes[]` read is gone; switch to `useChat` and read the keyed store via `order` + `nodes.get(id)` (ledger API-10). |

All four touchpoints are on the **Web Client** (browser) plane. **No Host-plane and no ordinary-Cordis-plugin-plane touchpoint** is present in this fixture.

---

## 2. Touchpoint detail

### T1 · Removed `@deepseek-ai/dsh-client-runtime/client` type import — `DSH-0.1.2-A1-25`

- **File / line**: `fixture/src/client/index.ts:1`
  `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'`
  The same removed type is consumed as the entry signature at `fixture/src/client/index.ts:9`
  `export function apply(ctx: ClientContext): void {`.
- **Plane**: Web Client.
- **Card**: `DSH-0.1.2-A1-25` — "`@deepseek-ai/dsh-client-runtime` package removed, client symbols migrated by domain" (`references/v0.1.2-alpha.1.md:415-439`). Applies to "Web Client plugins that import symbols from `@deepseek-ai/dsh-client-runtime` (including the `/client` entry)". Corroborated by the interface ledger `API-10 · Web Client runtime unbundling` (`references/api-migration-0.1.2-alpha.2.md:590-645`) and its one-page table row "Web Client runtime" (`…:85`).
- **Old pattern**: import `ClientContext` from the `/client` entry of `dsh-client-runtime`.
- **How it breaks**: the package was deleted from `packages/client` in alpha.1; build/typecheck report a missing module / missing exports (TS2307/TS2724), and at runtime the client half can stay out of the boot graph (`A1-25` symptom text).
- **Migration action** (per `A1-25` mapping table + API-10): `ClientContext` maps to `import type { Context as ClientContext } from '@deepseek-ai/cordis'`. Because this plugin consumes client facets, add the relevant type-only augmentations from the owning packages actually used. `package.json` here declares **no** `dsh.client.inject` and **no** `@deepseek-ai/*` dependency, so the "remove `dsh-client-runtime` from `dsh.client.inject`" half of `A1-25` is **not applicable** to this fixture (no inject row to clean).

### T2 · `__ModuleLoader__.load` registration id ≠ package.json name — `DSH-0.1.2-A1-26`

- **File / line**: `fixture/src/client/index.ts:10`
  `__ModuleLoader__.load('pet-legacy-bundle', () => { /* legacy bundle id, not package name */ })`
  Baseline identity: `fixture/package.json:2` `"name": "dsh-pet-session-bench"`.
- **Plane**: Web Client (client-bundle boot registration / assembly row). Card `A1-26` "Applies to: Plugins with a Web Client half (those that build a client bundle and mount it through an assembly row)".
- **Card**: `DSH-0.1.2-A1-26` — "client-modules scan contract: registration id must equal the package.json name" (`references/v0.1.2-alpha.1.md:443-457`). Detection pattern lives in pre-flight class #5 (`rg "__ModuleLoader__|PLUGIN_ID"`, `references/pre-flight.md:150`).
- **Old pattern**: registration id `'pet-legacy-bundle'` ≠ package.json `name` `'dsh-pet-session-bench'`.
- **How it breaks**: 0.1.2's boot manifest keys entries/modules/registrations by package name; a mismatch either trips the startup assertion `loaded without registering "pet-legacy-bundle"` or, more subtly, silently keeps the panel out of the boot graph with no plugin error (`A1-26` symptoms).
- **Migration action**: set the `__ModuleLoader__.load` registration id to the bare package name `dsh-pet-session-bench`, and make the assembly-row `name` use that same bare package name. Verification per `A1-26`: `window.__DSH_BOOT__.entries` contains `"id":"dsh-pet-session-bench"` and the combo bundle contains `__ModuleLoader__.load({ id: "dsh-pet-session-bench"`.

### T3 · Removed `ctx.connection.api` face — `DSH-0.1.2-A1-30`

- **File / line**: `fixture/src/client/index.ts:11`
  `ctx.connection.api.agentPresets.list().then(presets => { /* legacy connection.api face */ })`
- **Plane**: Web Client. Card `A1-30` "Applies to: Web Client plugins consuming `ctx.connection.api.*` (e.g. `sessions.history`, `agentPresets`)" — `agentPresets` is named explicitly.
- **Card**: `DSH-0.1.2-A1-30` — "Client `ctx.connection.api` face removed entirely; history/transcript reads rerouted" (`references/v0.1.2-alpha.1.md:521-531`). Detection pattern: pre-flight class #3 (`ctx.remote` / `@deepseek-ai/dsh-api-.+/client`, `references/pre-flight.md:122-130`).
- **Old pattern**: `ctx.connection.api.agentPresets.list()` (the rc.2 client-side apiProxy mirror face).
- **How it breaks**: alpha.1 removed the apiProxy mirror on `ctx.connection`; the call throws. `A1-30` warns that if the call site swallows the error in a `catch`, the UI renders "forever blank" and a no-crash smoke will not catch it.
- **Migration action**: move to the generated Remote projection `ctx.remote.agentPresets.list()`. The method spelling comes from the APIProxy→Remote table in `DSH-0.1.2-A1-01` (`references/v0.1.2-alpha.1.md:78`: `agentPreset.list/select → agentPresets/list / agentPresets/select`); declare `remote` (plus the namespace) in the client `inject` and handle the `RemoteResult<T>` result branch.
  - **Static observation on this fixture**: `ctx.connection` is **not** in the current `inject` list (`index.ts:7` = `['slots', 'conversation']`), so as written the face is also un-injected; after migrating to `ctx.remote`, add `'remote'` to `inject` and drop any dead `connection` reference (the "leave no dead face" step in `A1-30`).
  - **alpha.2 net-state hygiene (secondary, not a break of the current source)**: `DSH-0.1.2-A2-02` (`references/v0.1.2-alpha.2.md:47-81`) — on alpha.2 the Remote failure `error` is a `RemoteError` instance and codes are namespaced (e.g. `agent-preset-not-found → agent-preset/not-found`). The rewritten call must branch on `result.ok` then `result.error.code`, not on the old flat `{ code, message }` object. The current line 11 does not branch on error codes, so `A2-02` is not a separate touchpoint here, but it is required hygiene for the rewrite.

### T4 · Flat `useSession()` `nodes` snapshot removed — `DSH-0.1.2-A1-27`

- **File / line**: `fixture/src/client/index.ts:12-13`
  `const { nodes } = useSession()` / `const first = nodes[0]`
- **Plane**: Web Client. Card `A1-27` "Applies to: Web Client plugins that read session timelines / user message content".
- **Card**: `DSH-0.1.2-A1-27` — "Session content reads now go through the SessionBinding durable event window" (`references/v0.1.2-alpha.1.md:461-484`). Detection pattern: pre-flight class #5 (`useSession|useChat`, `references/pre-flight.md:149`); the card is cross-listed under class #3 as well (`…:130`). Corroborated by interface ledger `API-10` exact mapping (`references/api-migration-0.1.2-alpha.2.md:603-604, 609-627`) and the `A1-03` field notes that record the flat `ConversationSnapshot` (`nodes/partial/runningCalls/turnEnds`) no longer being a primary surface and the `useSession`→`useChat` switch (`references/v0.1.2-alpha.1.md:136, 140-141`).
- **Old pattern**: `useSession()` returns a flat `nodes` array (`ConversationNode[]`); `nodes[0]` indexes it.
- **How it breaks**: 0.1.2 no longer exposes the flat per-session conversation-node snapshot (the timeline becomes an internal projection of each view package, see `A1-03`); `session.getSnapshot().nodes` is undefined/empty or the selector silently degrades to `any` (`A1-27` symptoms; `API-10` "selectors become `any`").
- **Migration action**: for the chat surface, switch to `useChat` and read the **keyed** store — iterate `snapshot.order` and call `snapshot.nodes.get(id)` per id (API-10 minimal shape; type `ChatSnapshot` from `@deepseek-ai/dsh-client-ui-chat/client`). For a lower-level service read of raw session content (e.g. user-message text), `A1-27`'s own recipe is `sessions.binding(id)` → `binding.eventSource.getSnapshot().entries` (import `SessionBinding`/`SessionEventLikeEntry` from `@deepseek-ai/dsh-api-session-controller/client`). `snapshot.legacy.nodes` exists only as a staged dual-host compatibility projection and must not become the new primary surface (`API-10 …:609`).

---

## 3. Scan completeness (pre-flight classes #1–#7)

Per `references/pre-flight.md`, the seven touchpoint classes were scanned against every fixture file. Only classes **#3 (internal service probes / Remote)** and **#5 (internal UI / commands / tools)** have hits; the rest are clean.

| Class | Hit? | Evidence / note |
|---|---|---|
| #1 source patch / monkey patch | No | No `patch.yml` / `patchedDependencies` / `DSH_HARNESS_SOURCE_ROOT`. |
| #2 internal event names / persistent events | No | No `SessionEvent` / `ctx.on(` / persisted-event writes. |
| #3 internal service probes / Remote | **Yes** | `index.ts:11` `ctx.connection.api…` → T3 (`A1-30`). `A1-27` is also catalogued here. |
| #4 direct host directory reads/writes | No | No `DSH_HOME` / `readFile` / `profiles/` / `openPath`. |
| #5 internal UI / commands / tools | **Yes** | `index.ts:1` `dsh-client-runtime` (T1, `A1-25`); `index.ts:10` `__ModuleLoader__` (T2, `A1-26`); `index.ts:12` `useSession` (T4, `A1-27`). |
| #6 custom HTTP / WS / RPC / DOM / CSS | No | No `createServer(` / `WebSocket` / `contenteditable` / `/api/`. |
| #7 subprocess / stdout / stderr | No | No `child_process` / `spawn` / `headless`. |

**Line-by-line disposition of `src/client/index.ts`** (completeness):

- `:1` `import … from '@deepseek-ai/dsh-client-runtime/client'` → **T1 / A1-25**.
- `:2` `import { useSession } from '@deepseek-ai/dsh-client-ui-chat/client'` → **not a break by itself**: `@deepseek-ai/dsh-client-ui-chat/client` still exists on alpha.2 and is cited by API-10 as the owner of `ChatSnapshot`/`CommandRowProps`. Only the `.nodes` consumption breaks (T4).
- `:3` `import { Pet } from './Pet.tsx'` → internal import, no break.
- `:5` `declare const __ModuleLoader__ …` → ambient declaration only, no break (the break is its *use* on `:10`, T2).
- `:7` `export const inject = ['slots', 'conversation']` → no removed package/service in the list; `slots` and `conversation` services persist. The `A1-25` / `A1-30` inject cleanups (drop `dsh-client-runtime` / `connection`) are **not applicable** — neither appears here.
- `:9` `apply(ctx: ClientContext)` → the `ClientContext` type is the T1 break (same removed import).
- `:10` `__ModuleLoader__.load('pet-legacy-bundle', …)` → **T2 / A1-26**.
- `:11` `ctx.connection.api.agentPresets.list()` → **T3 / A1-30**.
- `:12-13` `const { nodes } = useSession(); const first = nodes[0]` → **T4 / A1-27**.
- `src/client/Pet.tsx:1` `export function Pet() {}` → no-op, no break.
- `package.json` → no `@deepseek-ai/*` dependencies and no `dsh.client.inject`; `name` is the T2 baseline; `dsh.client.platform: web` fixes the plane. No break in the manifest itself.

**Result: exactly four touchpoints** (T1–T4), matching cards `DSH-0.1.2-A1-25`, `-A1-26`, `-A1-27`, `-A1-30`.

---

## 4. Unconfirmed / caveats (no fabrication)

- **`useSession` export removal vs. shape change (T4)**: the mounted cards establish that the *flat `nodes[]` read via `useSession`* is the broken pattern and prescribe `useChat` + keyed `order/nodes.get`, but they do not explicitly state whether the `useSession` symbol itself is fully removed from `@deepseek-ai/dsh-client-ui-chat/client` on alpha.2 or merely changed shape. Marked **unconfirmed**; the migration is safe either way (adopt `useChat` + keyed read).
- **Exact Remote namespace/method spelling (T3)**: `agentPresets/list` is quoted from the `A1-01` mapping table, which the card itself names as authoritative over the design notes. The alpha.2 generated declaration artifact (`lib/typert.remote-client.d.ts`) is **not mounted** in this environment, so the spelling is card-confirmed, not artifact-verified. Marked **card-sourced; artifact read unconfirmed**.
- **Runtime symptoms not reproduced**: assertion text (`loaded without registering …`), boot-graph/pending behavior, and the "forever blank" failure mode are documented upstream behaviors in the cards. This is a read-only static scan (no build / mount / model calls, per the brief), so no runtime reproduction is claimed. Card IDs and code mappings are verified against the mounted references; live runtime confirmation is out of scope.
- **`A2-02` scoping (T3)**: treated as migration hygiene for the rewrite, not a touchpoint of the current source, because the current call site does not branch on Remote error codes.

---

## 5. Sources (mounted skill references only)

- `skills/plugin-upgrade/references/v0.1.2-alpha.1.md` — `DSH-0.1.2-A1-01` (`…:78` method table), `A1-03` (`…:125-144`, field notes `:136,:140-141`), `A1-25` (`…:415-439`), `A1-26` (`…:443-457`), `A1-27` (`…:461-484`), `A1-30` (`…:521-531`).
- `skills/plugin-upgrade/references/v0.1.2-alpha.2.md` — frontmatter (`from/to`, 8 `A2` cards, `…:1-30`), `A2-02` (`…:47-81`).
- `skills/plugin-upgrade/references/api-migration-0.1.2-alpha.2.md` — exact corridor SHAs (`…:8-11`), one-page "Web Client runtime" row (`…:85`), `API-10` (`…:590-645`, keyed-store minimal shape `…:611-627`).
- `skills/plugin-upgrade/references/pre-flight.md` — seven-class scan (`…:92-183`), class #3 patterns (`…:122-130`), class #5 patterns (`…:149-150`).
- `skills/plugin-upgrade/references/README.md` — version-corridor index, orders 2 (`rc.2→alpha.1`) and 3 (`alpha.1→alpha.2`) (`…:12-18`).
- `skills/plugin-upgrade/SKILL.md` — Mode A read-only inspect discipline (`…:58-60`).

---

## Read-only discipline

- The fixture under `…/S4-legacy-client-imports/fixture/` was **only read**, never modified, added to, or deleted.
- No build, install, dependency resolution, reproduction environment, or migration was performed; no lifecycle script was run.
- The only write performed by this task is this report, under `…/S4-legacy-client-imports/agent-output/S4-legacy-client-imports/`.
- Card IDs and code mappings are quoted from the mounted `plugin-upgrade` skill references; nothing outside the allowed paths was read, and no network access was used. Points the mounted sources do not settle are marked **unconfirmed** above rather than guessed.
