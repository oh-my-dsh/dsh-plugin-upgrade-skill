# S4 · Legacy Client Runtime Touchpoints — Migration Touchpoint Report (Read-Only)

- **Task**: analyze a 0.1.1-rc.2-era Web Client plugin source for collisions with dsh **0.1.2-alpha.2**; read-only, no environment built, nothing modified.
- **Corridor**: 0.1.1-rc.2 → 0.1.2-alpha.2 (edges rc.2→alpha.1 and alpha.1→alpha.2; interface ledger `references/api-migration-0.1.2-alpha.2.md` API-10).
- **Fixture identity**: `dsh-pet-session-bench@0.1.0`, private, `"type": "module"`, `dsh.client.platform: "web"`; client source only (`src/client/index.ts`, `src/client/Pet.tsx`); no Host half, no lockfile, no `dsh.client.inject` dependency list, no bundler config present.
- **Method**: full-file read of all 4 fixture files + seven-class pre-flight pattern scan (`dsh-client-runtime`, `__ModuleLoader__`, `useSession`, `ctx.connection.api`); every card mapping cited to the skill's version cards / API ledger. No network, no builds, no installs.

## Touchpoints that break on 0.1.2-alpha.2

### 1. Import of the removed `@deepseek-ai/dsh-client-runtime/client` — DSH-0.1.2-A1-25

- **File/line**: `src/client/index.ts:1` — `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'`.
- **Plane**: Web Client (plugin type/dependency surface).
- **Card**: `DSH-0.1.2-A1-25` (`dsh-client-runtime` package removed in alpha.1; symbols migrated by domain). Exact rc.2→alpha.2 symbol ledger: API-10 in `references/api-migration-0.1.2-alpha.2.md`.
- **How it breaks**: the package no longer exists on the target cohort — typecheck/build report a nonexistent module; if it were kept in any `dsh.client.inject` list the assembly row would stay pending / out of the boot graph.
- **Migration action**: replace the `ClientContext` import with `import type { Context as ClientContext } from '@deepseek-ai/cordis'`, and make each owning package whose declarations the source actually consumes (here: `@deepseek-ai/dsh-client-ui-chat` for `useChat`) a **direct** dev/peer dependency of the plugin; add type-only `import type {}` augmentations per owning package. Run one diagnostic `tsc --skipLibCheck false` pass to surface missing declaration chains (any new implicit `any` is a migration failure). The fixture has no `dsh.client.inject` list and no lockfile, so the "remove `dsh-client-runtime` from inject/lockfile" sub-item is N/A here.

### 2. `__ModuleLoader__.load` registration id ≠ package.json name — DSH-0.1.2-A1-26

- **File/line**: `src/client/index.ts:10` — `__ModuleLoader__.load('pet-legacy-bench', ...)` vs `package.json:2` `"name": "dsh-pet-session-bench"`.
- **Plane**: Web Client (client bundle registration / boot manifest scan).
- **Card**: `DSH-0.1.2-A1-26` (client-modules scan contract: registration id must equal the package.json name).
- **How it breaks**: 0.1.2 keys boot entries/modules/registrations by package name (`Entry name == package name`); a mismatch triggers the startup assertion `loaded without registering "<id>"` or, more subtly, the client half silently never enters the boot graph.
- **Migration action**: change the registration id to the exact package.json name `'dsh-pet-session-bench'` (or, in a real build, let the tsdown banner `PLUGIN_ID` inject it); ensure any assembly row (`cordis.patch.yml`) also uses the bare package name. Verify via `window.__DSH_BOOT__.entries` containing `"id":"dsh-pet-session-bench"` and no `loaded without registering` in logs.

### 3. Flat `useSession()` `nodes` snapshot read — DSH-0.1.2-A1-27 (+ API-10)

- **File/line**: `src/client/index.ts:2` (`import { useSession } from '@deepseek-ai/dsh-client-ui-chat/client'`), `src/client/index.ts:12-13` — `const { nodes } = useSession(); const first = nodes[0]`.
- **Plane**: Web Client (session content read path).
- **Card**: `DSH-0.1.2-A1-27` (per-session flat conversation-node snapshot removed; reads go through the SessionBinding durable event window), with the exact alpha.2 surface mapping in API-10: `useSession(session => session?.nodes)` → `useChat(chat => ...)`, and `ChatSnapshot.nodes` is a **keyed store**, not `ConversationNode[]`.
- **How it breaks**: the flat `ConversationSnapshot.nodes[]` no longer exists; `nodes[0]` is undefined/empty and downstream selectors break with factory errors while the plugin still loads.
- **Migration action**: switch to `useChat`; iterate `ChatSnapshot.order` and call `snapshot.nodes.get(id)` per id (API-10's `orderedNodes` recipe). For reading user-message content outside the chat view, use the SessionBinding durable event window (`sessions.binding(id).eventSource.getSnapshot().entries`, types from `@deepseek-ai/dsh-api-session-controller/client`). Alpha.2-only code must not treat `snapshot.legacy.nodes` as the primary surface.

### 4. `ctx.connection.api` face — DSH-0.1.2-A1-30

- **File/line**: `src/client/index.ts:11` — `ctx.connection.api.agentPresets.list().then(...)`.
- **Plane**: Web Client (Host Remote call path).
- **Card**: `DSH-0.1.2-A1-30` (`ctx.connection.api` face removed entirely in alpha.1; history/transcript reads rerouted), plus the agentPresets ledger entry in API-01 of `references/api-migration-0.1.2-alpha.2.md` (line ~135–148 region: preset/session/llm calls move to `ctx.remote.*` with `RemoteResult` envelopes).
- **How it breaks**: alpha.1 removed the old apiProxy mirror face; the call throws at runtime. If the `.then` rejection is silently swallowed, the UI renders forever-blank instead of erroring.
- **Migration action**: replace with the typed Remote face, e.g. `ctx.remote.agentPresets.*` (per the API-01 ledger; `agentPresets.remove`→`ctx.remote.agentPresets.deletePreset(id)` shows the naming/argument drift to check against the target tag's exports); handle the `RemoteResult` `ok: false` envelope explicitly rather than swallowing. Since `'connection'` is **not** in this fixture's `inject` (`index.ts:7` lists only `['slots', 'conversation']`), there is no dead inject row to remove — but confirm `ctx.connection` is no longer referenced anywhere after the rewrite.

## Non-hits / cleared classes (evidence)

- **Host half**: none exists (`src/client/` only); Host-plane cards (commands `execute` signature, subprocess, filesystem, events) cannot hit. `Pet.tsx` is an empty exported component — no `MarkdownText` (A1-29), no composer DOM manipulation (A1-28), no workspace navigation (A1-32), no `dsh-client-store` usage.
- **package.json**: no dependency list, no `dsh.client.inject`, no lockfile → lockfile cohort scan (A1-25 sub-item) is N/A at this stage; it becomes relevant as soon as real dependencies are added for the migration.
- Cards A1-01…A1-24, A1-28/29/31/32 and the alpha.2 card set were checked against the fixture's imports/calls; no other identifiers in the source intersect them.

## Pending / residual risk (unconfirmed items)

- The exact successor method name for `agentPresets.list` on alpha.2 (`ctx.remote.agentPresets.listPreset(s)?` vs projection read) is **unconfirmed**: the closed-book fixture provides no target-tag source, and the API ledger row I could cite verbatim covers `remove`→`deletePreset`, not `list`. Verify against the alpha.2 tag's `dsh-api-*` Remote exports before writing code.
- Runtime verification (boot graph, registration, chat read) was intentionally **not performed** — the brief forbids building a reproduction environment. All findings are static-copy analysis only.
- The fixture declares no bundler config (no tsdown/`PLUGIN_ID` banner); how the registration id is produced in the real build is unconfirmed from the fixture alone.

## Rollback / discipline

Read-only task: no file under the fixture (or anywhere in the benchmark repository) was modified, created, or deleted; no installs, builds, or lifecycle scripts were run. Only this report file was written, to the designated output directory.
