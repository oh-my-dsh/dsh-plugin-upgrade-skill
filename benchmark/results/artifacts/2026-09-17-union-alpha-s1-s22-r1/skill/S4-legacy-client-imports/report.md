# S4 Migration Touchpoint Report · dsh-pet-session-bench (0.1.1-rc.2 → 0.1.2-alpha.2)

Task: S4-legacy-client-imports (read-only static analysis; no file under the fixture was modified, no build or reproduction environment was created).

- Plugin: dsh-pet-session-bench 0.1.0 (package.json name `dsh-pet-session-bench`, private, `dsh.client.platform: "web"`)
- Corridor: dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.1 (cards DSH-0.1.2-A1-01…A1-32, 28 cards) → dsh-v0.1.2-alpha.2 (cards DSH-0.1.2-A2, 8 cards). Net state computed across the full corridor; corridor edges taken from references/README.md `from → to` metadata, not filename order.
- Method: skill plugin-upgrade, Mode A/C read-only pre-flight; seven touchpoint classes checked against the four fixture files; only cards intersecting the hit touchpoints and the Web Client face are applied.

## Touchpoint checkup (dsh-pet-session-bench, dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.2)

| Touchpoint | Hit | File/line | Applicable card |
|---|---|---|---|
| #1 source patch | no | — | — |
| #2 events | no | — | — |
| #3 services/Remote | yes | src/client/index.ts:11 | DSH-0.1.2-A1-30, DSH-0.1.2-A1-01 |
| #4 filesystem | no | — | — |
| #5 UI/commands/tools | yes | src/client/index.ts:1,2,5,10,12,13 | DSH-0.1.2-A1-25, DSH-0.1.2-A1-26, DSH-0.1.2-A1-27, API-10 |
| #6 custom channel | no | — | — |
| #7 subprocess/output | no | — | — |

## Confirmed breaking touchpoints (4)

### 1. Import from the removed `@deepseek-ai/dsh-client-runtime/client`

- Evidence: src/client/index.ts line 1 — `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'`
- Plane: Web Client (plugin client bundle; package.json already declares `dsh.client.platform: "web"`)
- Card: DSH-0.1.2-A1-25 (`@deepseek-ai/dsh-client-runtime` package removed, client symbols migrated by domain)
- Failure: module not found / TS2305 at typecheck; at runtime the plugin does not enter the boot graph or its assembly row stays pending without an explicit error.
- Migration: replace the runtime aggregation import. Per the verified A1-25 mapping, `ClientContext` (client ctx alias) → `import type { Context as ClientContext } from '@deepseek-ai/cordis'`, plus type-only augmentation imports from owning packages for each client facet actually used (here: session/chat and conversation from `@deepseek-ai/dsh-api-session-controller/client`, `@deepseek-ai/dsh-client-ui-chat/client`, `@deepseek-ai/dsh-client-ui-conversation/client` per API-10). This is the rc.2→alpha.2 corridor's net state: the package is absent from alpha.1 onward and never restored. Also remove any residual `dsh-client-runtime` from dependency declarations (none declared in this fixture's package.json beyond the manifest itself — its dependencies are empty, so nothing to strip there; the import is the only hit).

### 2. Client bundle registration id ≠ package.json name

- Evidence: src/client/index.ts line 5 (loader type declaration) and line 10 — `__ModuleLoader__.load('pet-legacy-bundle', ...)`; package.json line 2 — name `dsh-pet-session-bench`. The ids disagree.
- Plane: Web Client (boot graph / client-modules scan)
- Card: DSH-0.1.2-A1-26 (client-modules scan contract: registration id must equal the package.json name)
- Failure: startup assertion `loaded without registering "<id>"`, or the silent variant — the panel disappears, the boot graph lacks the plugin, and no plugin-related error is logged.
- Migration: make the bundle's `__ModuleLoader__.load` id equal the package.json name `dsh-pet-session-bench` (normally via the tsdown `PLUGIN_ID` banner). The three ids (bundle registration id, assembly row name, package.json name) must all be the bare package name; a `dsh --profile <name> --dump-config` check plus `window.__DSH_BOOT__.entries` verification applies when this is later implemented.

### 3. Flat `useSession()` `nodes` snapshot read

- Evidence: src/client/index.ts line 2 — `import { useSession } from '@deepseek-ai/dsh-client-ui-chat/client'`; lines 12–13 — `const { nodes } = useSession()` then `nodes[0]` (array indexing of the flat `ConversationNode[]` snapshot).
- Plane: Web Client
- Cards: DSH-0.1.2-A1-27 (session content reads go through the SessionBinding durable event window; per-session conversation-node snapshots are no longer exposed) with the exact interface ledger API-10 (Web Client runtime unbundling, keyed chat snapshots).
- Failure: on alpha.1+ the flat per-session snapshot is gone; `session.getSnapshot().nodes` is undefined/empty and the factory errors, or with stale declarations selectors degrade to implicit `any`.
- Migration (corridor net state, per API-10): `useSession(session => session?.nodes)` → `useChat(chat => ...)`; `ConversationSnapshot.nodes[]` → iterate `ChatSnapshot.order` and call `snapshot.nodes.get(id)` per id (`ChatNodeStore` keyed shape), e.g.

```ts
function orderedNodes(snapshot: ChatSnapshot) {
  return snapshot.order.flatMap((id) => {
    const node = snapshot.nodes.get(id)
    return node ? [node] : []
  })
}
```

`snapshot.legacy.nodes` exists only for staged dual-host compatibility and must not become the primary data surface for an alpha.2-only target. Types `ChatSnapshot`/`useChat` come from `@deepseek-ai/dsh-client-ui-chat/client`; run one typecheck with `skipLibCheck: false` to pin all declaration owners as direct dev/peer dependencies (A2-03 field note / API-10 step 4). For alternative session-content reads, the SessionBinding durable event window (`sessions.binding(id)`, `binding.eventSource.getSnapshot().entries`, `SessionBinding`/`SessionEventLikeEntry` from `@deepseek-ai/dsh-api-session-controller/client`) is the A1-27 gap-filler.

### 4. Removed `ctx.connection.api` face — `ctx.connection.api.agentPresets.list()`

- Evidence: src/client/index.ts line 11 — `ctx.connection.api.agentPresets.list().then(presets => ...)`
- Plane: Web Client (client-side Remote consumption)
- Cards: DSH-0.1.2-A1-30 (client `ctx.connection.api` face removed entirely; history/transcript reads rerouted) as the removal card; DSH-0.1.2-A1-01 (APIProxy removed, Host/Web Client calls moved to `@Remote`) as the mapping table source for the replacement method.
- Failure: client calls throw on alpha.1+; if swallowed by a catch, the UI renders forever blank while a no-crash smoke stays green (A1-30 explicitly warns this for agentPresets consumers).
- Migration: move to the generated Remote face — `ctx.remote.agentPresets.list()` (A1-01 mapping row `agentPreset.list` → `agentPresets/list`). Declare the needed Remote contributions in `inject`, obtain type mounts via `@deepseek-ai/dsh-api-remotes/client`, and call `ctx.remote.<namespace>.<method>(...)`. Remote unary calls return `RemoteResult<T>`; per corridor net state (DSH-0.1.2-A2-02) failures are `RemoteError` instances with namespaced codes (do not branch on `{ ok, value }`-era plain-object shapes or `instanceof` across realms). Once no `connection.api` consumption remains, remove `connection` from the inject list if it was only there for that face (the fixture's inject is `['slots','conversation']` and does not list `connection`, so no injection change is strictly required — noted as unconfirmed whether the host mounts those services to this plugin without further composition).

## Corridor net-state notes (no separate action, folded above)

- A1-02 removed `SessionEvent.ignorable` and A2-01 restored it — fixture produces no persisted session events, so the folded net state is "no change"; recorded for corridor completeness.
- A2-02 (RemoteError/namespaced codes) becomes relevant the moment touchpoint 4 is migrated to `ctx.remote`; conditional on that migration, not independently breaking this fixture's current source.
- No fixture hit for: A1-03 (internal session-view paths), A1-20/21/22 (host-plane service exports), A1-24 (pi-ai peer), A1-28 (composer textarea DOM), A1-29 (MarkdownText labels), A1-31 (subagent descriptor), A1-32 (IWorkspaces navigation — no `ctx.workspaces` calls present), A2-03/04/05/06/08/10.

## Skipped / not applicable (with evidence)

- Touchpoint classes #1, #2, #4, #6, #7: zero hits across all four fixture files (README.md, package.json, src/client/index.ts, src/client/Pet.tsx — 28 total source lines scanned); Pet.tsx exports an empty component with no DSH surface.
- package.json declares no dependencies; no `dsh.client.inject` field, no lockfile, no cordis composition files exist in the fixture. The `dsh.client` roster key is already present, so the plugin does not additionally need A1-25's inject-strip action against this manifest.

## Verification plan (for a later implementation round; not executed here)

Per the skill's validation ladder and the closed-book constraint of this task, none of these were run: typecheck with `skipLibCheck: false` once during migration; cold-boot web profile with the token→Cookie chain, `window.__DSH_BOOT__.entries` containing `dsh-pet-session-bench`, combo URL registration under the package name, and one real preset-list call exercising the RemoteResult success and failure branches.

## Confidence

- Items 1–4 are confirmed against the cited cards (references/v0.1.1-rc.2-corridor successor files v0.1.2-alpha.1.md, v0.1.2-alpha.2.md, and api-migration-0.1.2-alpha.2.md API-10), each carrying primary tag-pinned sources in the card text. The README.md in the fixture itself independently names the same four cards (A1-25, A1-26, A1-27, A1-30) as maintainer hints, consistent with this scan.
- Unconfirmed: whether the plugin's composition (cordis.patch.yml / home patch) exists elsewhere — the fixture contains none, so the assembly-row half of A1-26 could not be verified from the fixture alone.
