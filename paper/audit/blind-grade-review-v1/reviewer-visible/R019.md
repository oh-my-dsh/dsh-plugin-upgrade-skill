# S4 · Legacy Client Runtime Touchpoints — Migration Touchpoint Report

Plugin: `dsh-pet-session-bench` 0.1.0 (Web Client plugin, `private: true`, `"dsh": { "client": { "platform": "web" } }`)
Corridor: `dsh-v0.1.1-rc.2` → `dsh-v0.1.2-alpha.1` → `dsh-v0.1.2-alpha.2` (two edges per the skill's version corridor index; card prefixes `DSH-0.1.2-A1` and `DSH-0.1.2-A2`).
Mode: A/C pre-migration read-only inspection (no file under the fixture was modified, created, or deleted).

## Fixture inventory

Files scanned: `README.md`, `package.json`, `src/client/index.ts` (14 lines), `src/client/Pet.tsx` (1 line).

`package.json` declares no `dependencies`/`peerDependencies` and no `dsh.client.inject` list; the only manifest metadata is the client platform. `src/client/Pet.tsx` is an empty component with no DSH imports (no hit).

## Breaking touchpoints (4)

### T1 · `ClientContext` imported from the removed `dsh-client-runtime` package

- **Evidence**: `src/client/index.ts:1` — `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'`; used as the `apply(ctx: ClientContext)` parameter at `src/client/index.ts:9`.
- **Plane**: Web Client (plugin client half).
- **Card**: `DSH-0.1.2-A1-25` — `@deepseek-ai/dsh-client-runtime` package removed, client symbols migrated by domain (touchpoints #3, #5; required-if-hit).
- **Break mode**: module does not exist on 0.1.2 → typecheck/build failure; at runtime the plugin fails to assemble or stays out of the boot graph.
- **Migration action**: import the client context from Cordis: `import type { Context as ClientContext } from '@deepseek-ai/cordis'`, and activate Context augmentation with type-only imports from the owning packages actually used (per API-10 in `api-migration-0.1.2-alpha.2.md`), declaring those owners as direct dev/peer dependencies (see also `DSH-0.1.2-A2-03` field note on non-transitive devDependencies and `skipLibCheck: false` diagnostics). `dsh.client.inject` is not present in this fixture's `package.json`, so no phantom runtime-package row has to be removed there — but it must not be added.

### T2 · Client bundle registration id ≠ package.json name

- **Evidence**: `src/client/index.ts:5` — `declare const __ModuleLoader__: { load: (id: string, fn: () => void) => void }`; `src/client/index.ts:10` — `__ModuleLoader__.load('pet-legacy-bundle', ...)` with the comment "legacy bundle id, not package name". The package.json `name` is `dsh-pet-session-bench` — the three ids disagree.
- **Plane**: plugin (client-modules scan / boot registration).
- **Card**: `DSH-0.1.2-A1-26` — client-modules scan contract: registration id must equal the package.json name (touchpoint #5; required-if-hit).
- **Break mode**: startup assertion `loaded without registering "<id>"`, or the panel silently disappears / the boot graph lacks the plugin.
- **Migration action**: make the `__ModuleLoader__.load` id (normally injected as the tsdown banner `PLUGIN_ID`) equal the bare package name `dsh-pet-session-bench`; the plugin's assembly row `name` (in its cordis.patch.yml insert row) must also be the bare scoped package name, not a `file:///` literal-path + short-id form; verify with `dsh --profile <name> --dump-config` (no pending) and `window.__DSH_BOOT__.entries` containing `"id":"dsh-pet-session-bench"`.

### T3 · Flat `useSession()` `nodes` snapshot read

- **Evidence**: `src/client/index.ts:2` — `import { useSession } from '@deepseek-ai/dsh-client-ui-chat/client'`; `src/client/index.ts:12-13` — `const { nodes } = useSession()` then `const first = nodes[0]` (array-index access to a flat `ConversationNode[]`).
- **Plane**: Web Client.
- **Cards**: `DSH-0.1.2-A1-27` — session content reads go through the SessionBinding durable event window (touchpoint #3; required-if-hit); with the exact selector migration ledger in **API-10** of `api-migration-0.1.2-alpha.2.md` (`useSession(session => session?.nodes)` → `useChat(chat => ...)`; `ConversationSnapshot.nodes[]` → keyed `ChatSnapshot`: iterate `snapshot.order` and call `snapshot.nodes.get(id)` per id).
- **Break mode**: per-session conversation-node snapshots are no longer exposed; the destructured `nodes` is `undefined`/empty and index access throws or silently yields nothing ("plugin loads but half its functionality is broken").
- **Migration action**: replace the flat read with `useChat` over the keyed store, e.g. `const first = chat ? chat.snapshot.nodes.get(chat.snapshot.order[0]) : undefined` (iterate `order` for all nodes; narrow assistant finals by `type === 'assistant-step'` then `data.finalNode`). For direct session-timeline reads outside the chat slot, use `sessions.binding(id)` + `binding.eventSource.getSnapshot().entries` per A1-27. Add the owning declaration packages as direct dependencies.

### T4 · `ctx.connection.api.agentPresets.list()` — removed `connection.api` face (APIProxy removal)

- **Evidence**: `src/client/index.ts:11` — `ctx.connection.api.agentPresets.list().then(presets => { ... })` (comment: "legacy connection.api face").
- **Plane**: Web Client.
- **Cards**: `DSH-0.1.2-A1-30` — client `ctx.connection.api` face removed entirely; history/transcript reads rerouted (touchpoint #3; required-if-hit). Root cause card: `DSH-0.1.2-A1-01` — APIProxy removed, Host/Web Client calls moved to `@Remote` (touchpoint #3). Follow-on: `DSH-0.1.2-A2-02` — Remote failures become `RemoteError` instances with namespaced codes (`agent-preset-not-found` → `agent-preset/not-found`, `agent-preset-locked` → `agent-preset/locked`), relevant once the call is migrated to `ctx.remote` and its `RemoteResult` error branch is written.
- **Break mode**: the face is gone on alpha.1+; client calls throw. If swallowed by a catch, the UI renders "forever blank" while smokes stay green.
- **Migration action**: move the call to the `@Remote` face (`ctx.remote.``<domain>`.`<method>` resolving to `RemoteResult<T>`); handle the result branch with namespaced `error.code` values (`agent-preset/not-found`, `agent-preset/locked`, `gateway/*`), using `isRemoteFailure` structurally and never `instanceof`. If `connection` were in the `inject` list solely for this face it would also have to be removed — here `inject = ['slots', 'conversation']` (`src/client/index.ts:7`) does not include it, so only the call site changes.

## Checked, no hit (with evidence)

- `DSH-0.1.2-A1-26` assembly-row form: no `cordis.patch.yml` / home patch exists in the fixture (glob of the whole fixture returns only README.md, package.json, src/client/index.ts, src/client/Pet.tsx) — row alignment applies at packaging time, flagged under T2.
- `DSH-0.1.2-A1-28` (composer `<textarea>` → contenteditable): no DOM access anywhere in the fixture; `Pet.tsx` is empty.
- `DSH-0.1.2-A1-29` (`MarkdownText` nested labels): no ui-primitives import.
- `DSH-0.1.2-A1-32` (workspace navigation): no `workspaces`/`uiWorkspace` usage.
- `DSH-0.1.2-A1-20` (`userQuestions.registerProvider`), `DSH-0.1.2-A1-21`, `DSH-0.1.2-A1-22`, `DSH-0.1.2-A1-24`, `DSH-0.1.2-A1-31` (host/subagent/LLM surfaces): no corresponding imports or calls in the 14-line client entry.
- `DSH-0.1.2-A1-02` / `DSH-0.1.2-A2-01` (`SessionEvent.ignorable`): no session events produced or persisted.
- `DSH-0.1.2-A2-05` (plugin-inventory `agentPresets` field): the fixture *calls* agent presets as a Remote, it does not consume `pluginInventory/list`; only T4 applies.
- `DSH-0.1.2-A2-06` (`$host`), `DSH-0.1.2-A2-08` (`sessionProjections` peer), `DSH-0.1.2-A2-10` (`settingsNamespace`): no matching surfaces in a Web-Client-only plugin with no settings/host-side code.
- `DSH-0.1.2-A1-05`/`API-06` (headless stdout/stderr), `#7` subprocess parsing: no child-process usage.

## Validation plan (not executed — closed-book, read-only brief)

1. Static: run one diagnostic typecheck with `skipLibCheck: false` after rewiring imports to locate missing declaration owners; then the normal typecheck/build.
2. Composition: `dsh --profile <p> --dump-config` — no pending rows, assembly row name = `dsh-pet-session-bench`.
3. Runtime (Web): token → cookie, host boot manifest, advertised client artifact; assert `window.__DSH_BOOT__.entries` contains the package name and the combo route serves `__ModuleLoader__.load({ id: "dsh-pet-session-bench"`; prove mount/registration, not HTTP 200.
4. Behavior: render the Pet slot; one agent-presets remote call with a forced `agent-preset/not-found` error showing an error state (not blank); chat node read matches UI.

## Summary

| Hit | File/line | Plane | Card(s) | Action |
|---|---|---|---|---|
| T1 | src/client/index.ts:1,9 | Web Client | DSH-0.1.2-A1-25 (+API-10, A2-03 note) | ClientContext → `Context` from `@deepseek-ai/cordis` + owning-package type imports |
| T2 | src/client/index.ts:5,10 | plugin (client registration) | DSH-0.1.2-A1-26 | `__ModuleLoader__.load` id → `dsh-pet-session-bench`; align assembly row |
| T3 | src/client/index.ts:2,12,13 | Web Client | DSH-0.1.2-A1-27 (+API-10) | `useSession()` flat `nodes` → `useChat` keyed `ChatSnapshot` (`order` + `nodes.get(id)`) |
| T4 | src/client/index.ts:11 | Web Client | DSH-0.1.2-A1-30, DSH-0.1.2-A1-01, DSH-0.1.2-A2-02 | `ctx.connection.api.agentPresets.list()` → `ctx.remote` face + `RemoteResult`/`RemoteError` namespaced codes |

No assertions in this report are unconfirmed: every card ID, break mode, and mapping is grounded in the skill's reviewed card files `v0.1.2-alpha.1.md` (28 cards) and `v0.1.2-alpha.2.md` (8 cards), the ledger `api-migration-0.1.2-alpha.2.md`, and exact fixture file/line evidence. Read-only discipline: no file under the fixture was modified; no build, install, or reproduction environment was created.
