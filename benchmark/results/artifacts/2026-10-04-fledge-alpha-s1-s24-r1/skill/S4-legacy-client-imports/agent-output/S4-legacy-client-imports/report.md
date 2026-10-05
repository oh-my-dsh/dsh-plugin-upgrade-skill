# S4 · Legacy Client Runtime Touchpoints — Migration Touchpoint Report

- Scope: `fixture/` analyzed read-only; no file under `fixture/` modified.
- Source identity: `dsh-pet-session-bench`, `private: true`, `"type": "module"`, `dsh.client.platform: "web"` — a Web Client plugin from the dsh 0.1.1-rc.2 era.
- Target corridor: `dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.2` (via alpha.1; see `skills/plugin-upgrade/references/api-migration-0.1.2-alpha.2.md`).
- Mode: C (author-migrate) inventory step only; no edits, installs, builds, or reproduction created.

## Touchpoint inventory (4 hits)

### 1. `fixture/src/client/index.ts:1` — removed client runtime package import

- Plane: Web Client (plugin)
- Code: `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'`
- Card: `DSH-0.1.2-A1-25` — `@deepseek-ai/dsh-client-runtime` package removed (0.1.2-alpha.1).
- Symptom: typecheck/build misses the module; runtime plugin never enters the boot graph / row stays `pending`.
- Migration action: drop the `@deepseek-ai/dsh-client-runtime` dependency; import `Context` (alias `ClientContext`) from `@deepseek-ai/cordis`, and every other consumed symbol from its owning package; remove the package from `dsh.client.inject`/dependency list (same card's recipe + API-10 mapping).
- Source: `references/v0.1.2-alpha.1.md` DSH-0.1.2-A1-25; `references/api-migration-0.1.2-alpha.2.md` API-10.

### 2. `fixture/src/client/index.ts:10` — registration id ≠ package.json name

- Plane: Web Client (plugin)
- Code: `__ModuleLoader__.load('pet-legacy-bundle', () => { /* legacy bundle id, not package name */ })`; package.json `name` is `dsh-pet-session-bench`.
- Card: `DSH-0.1.2-A1-26` — client-modules scan contract: registration id must equal the package.json name.
- Symptom: startup assertion `loaded without registering "<id>"`, or the panel silently vanishes from the boot graph.
- Migration action: set the `__ModuleLoader__.load` id (usually the tsdown banner `PLUGIN_ID`) equal to the bare package name `dsh-pet-session-bench`, and align the assembly-row `name` to the same bare name.
- Source: `references/v0.1.2-alpha.1.md` DSH-0.1.2-A1-26.

### 3. `fixture/src/client/index.ts:12-13` — flat `useSession()` `nodes` snapshot

- Plane: Web Client (plugin)
- Code: `const { nodes } = useSession()` / `const first = nodes[0]` (also `:2` imports `useSession` from `@deepseek-ai/dsh-client-ui-chat/client`).
- Card: `DSH-0.1.2-A1-27` — Session content reads now go through the SessionBinding durable event window (per-session conversation-node snapshots removed).
- Symptom: plugin loads but half its functionality breaks: `session.getSnapshot().nodes` is undefined/empty; factory errors.
- Migration action: stop consuming the flat `nodes[]` via `useSession`; read transcript content via `sessions.binding(id)` → `binding.eventSource.getSnapshot().entries` (or via `useChat(chat => ...)` with `snapshot.order` + `snapshot.nodes.get(id)` for the chat face), per API-10's exact mapping.
- Source: `references/v0.1.2-alpha.1.md` DSH-0.1.2-A1-27; `references/api-migration-0.1.2-alpha.2.md` API-10.

### 4. `fixture/src/client/index.ts:11` — removed `ctx.connection.api` face

- Plane: Web Client (plugin)
- Code: `ctx.connection.api.agentPresets.list().then(...)`
- Card: `DSH-0.1.2-A1-30` — Client `ctx.connection.api` face removed entirely.
- Symptom: client calls throw; under a swallowing `catch` the UI renders "forever blank".
- Migration action: replace with the generated Remote projection — `ctx.remote.agentPresets.list()` via `ctx.remote` injection (`@deepseek-ai/dsh-api-remotes/client`); for history/transcript reads route to `session/page` / `session/follow` (subagent-origin sessions need plugin-owned routes); then drop `connection` from the inject list and type mirror — no dead face (API-01 table confirms `agentPresets/list` is the successor of the legacy `agentPreset.list` operation).
- Source: `references/v0.1.2-alpha.1.md` DSH-0.1.2-A1-30; `references/api-migration-0.1.2-alpha.2.md` API-01.

## Other observed references (not breaking touchpoints on their own)

- `fixture/src/client/Pet.tsx:1` — plain React component, no DSH-era API hit.
- `fixture/package.json` — no `dependencies`/`devDependencies` block and no explicit `@deepseek-ai/*` packages declared; the implicit dependency on `@deepseek-ai/dsh-client-runtime` is therefore undeclared/phantom and must be replaced by direct declarations of `@deepseek-ai/cordis`, `@deepseek-ai/dsh-api-remotes`, and the owning `ui-*` type packages (API-10 type-ownership rule).
- `fixture/src/client/index.ts:7` — `inject = ['slots', 'conversation']` uses bare service keys; not itself one of the four documented breaks, but any service actually consumed after migration (`remote`, `remote.agentPresets`, `sessionController`, `uiWorkspace`, `conversation`…) must be explicitly declared there.

## Explicitly checked and not hit

- `ctx.workspaces.connectWorkspace` / `pickDirectory` / `startSession` / `baselinesReady` — DSH-0.1.2-A1-32 not referenced in the fixture.
- `settingsNamespace` / `installSettingsSection` (DSH-0.1.2-A1-33-adjacent API-03), `userQuestions.registerProvider` (DSH-0.1.2-A1-20), `resolveSessionPreset` (DSH-0.1.2-A1-21), `compressor edit surface` (DSH-0.1.2-A1-28), `MarkdownText` labels (DSH-0.1.2-A1-29), Code Mode strings (DSH-0.1.2-A1-06), headless argv (API-06) — none present.
- No Host-plane source files, events, filesystem, subprocess, or custom-channel code in the fixture.

## Limitations

- Report is static and read-only: no typecheck, build, or runtime mount was run (per brief: do not build/create a reproduction environment). "Will break" claims are derived from the curated cards and API ledger, not executed diagnostics.
- The four referenced cards are curated, not an exhaustive API diff; a corridor edge without a card is marked pending rather than guessed. No external documentation was needed or consulted.
- `@deepseek-ai/dsh-client-ui-chat/client` import of `useSession` at `index.ts:2`: the break is exercised through the flat `nodes` reads (card A1-27); if the chat package itself drops `useSession` before alpha.2, verify against the target tag — marked unconfirmed.
