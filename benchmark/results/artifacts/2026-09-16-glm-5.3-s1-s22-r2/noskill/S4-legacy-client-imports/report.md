# S4 · Legacy Client Runtime Touchpoints — Migration Touchpoint Report

**Task:** read-only analysis of the S4 fixture (a Web Client plugin written for dsh 0.1.1-rc.2) against the upgrade to dsh 0.1.2-alpha.2.
**Fixture:** `environment/fixture` (4 files: `README.md`, `package.json`, `src/client/index.ts`, `src/client/Pet.tsx`).
**Method:** full static read of every fixture file. No file under the fixture was modified, created, or deleted; no reproduction environment was built. This is a closed-book brief — every card ID below is sourced from the fixture's own `README.md` (lines 7), which explicitly enumerates the four breaking touchpoints and their card IDs. Anything not stated in the fixture is marked **unconfirmed**.

## Scope summary

The plugin is a Web Client-only plugin (`package.json` line 6: `"dsh": { "client": { "platform": "web" } }`). All four breaking touchpoints live on the **Web Client plane** in `src/client/index.ts`. `src/client/Pet.tsx` (a single empty exported component) and `package.json` itself contain no breaking touchpoints beyond being the reference for the A1-26 name check.

## Touchpoints

### 1. Import from the removed `@deepseek-ai/dsh-client-runtime/client` package

- **File/line:** `src/client/index.ts:1` — `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'`
- **Plane:** Web Client
- **Card:** `DSH-0.1.2-A1-25` — `@deepseek-ai/dsh-client-runtime/client` package removal (fixture README, line 7, first hint)
- **Why it breaks:** the import target package no longer exists on 0.1.2-alpha.2, so the client entry fails to resolve/compile before anything else runs. The `ClientContext` type is used in the `apply(ctx: ClientContext)` signature at `src/client/index.ts:9`, so the removal is not confined to line 1.
- **Migration action:** replace the removed import with its 0.1.2-alpha.2 successor for obtaining `ClientContext`. The exact successor package/specifier is not stated inside the fixture — **unconfirmed**; consult the A1-25 upgrade card for the canonical replacement import and update line 1 (and any other reference to that package) accordingly.

### 2. `__ModuleLoader__.load` registration id ≠ package.json name

- **File/line:** `src/client/index.ts:10` — `__ModuleLoader__.load('pet-legacy-bundle', () => { ... })`
- **Plane:** Web Client (loader registration contract)
- **Card:** `DSH-0.1.2-A1-26` — registration id must match the package.json name (fixture README, line 7, second hint)
- **Why it breaks:** the registered id `'pet-legacy-bundle'` does not equal the package name `dsh-pet-session-bench` (`package.json:2`). On 0.1.2-alpha.2 the loader validates this identity, so the mismatched registration fails (the fixture's own comment on line 10 flags it as "legacy bundle id, not package name").
- **Migration action:** change the first argument of `__ModuleLoader__.load` from `'pet-legacy-bundle'` to the exact `name` field of `package.json`, i.e. `'dsh-pet-session-bench'`, keeping the loader callback as the second argument.

### 3. Flat `useSession()` `nodes` snapshot

- **File/line:** `src/client/index.ts:12–13` — `const { nodes } = useSession()` followed by `const first = nodes[0]`
- **Plane:** Web Client (client UI session hook)
- **Card:** `DSH-0.1.2-A1-27` — flat `useSession()` `nodes` snapshot change (fixture README, line 7, third hint)
- **Why it breaks:** the plugin destructures `nodes` directly off `useSession()` and indexes it flat (`nodes[0]`); the 0.1.2-alpha.2 session hook no longer exposes that flat `nodes` snapshot in this shape, so both the destructure (line 12) and the indexing (line 13) collide with the change. The exact new shape (e.g. restructured/nested or renamed accessor) is not stated inside the fixture — **unconfirmed**; the A1-27 card owns the new contract.
- **Migration action:** port lines 12–13 to the 0.1.2-alpha.2 `useSession()` contract per card DSH-0.1.2-A1-27 — obtain the node list through the card's replacement accessor and update the `nodes[0]` indexing to the new data shape.

### 4. Removed `ctx.connection.api` face

- **File/line:** `src/client/index.ts:11` — `ctx.connection.api.agentPresets.list().then(presets => { ... })`
- **Plane:** Web Client (client context → host RPC face)
- **Card:** `DSH-0.1.2-A1-30` — removed `ctx.connection.api` face (fixture README, line 7, fourth hint)
- **Why it breaks:** the call goes through the `ctx.connection.api` property, which no longer exists on the 0.1.2-alpha.2 ClientContext; the `agentPresets.list()` invocation therefore cannot resolve at runtime (and the property access fails to typecheck against the new context type once touchpoint 1's import is fixed).
- **Migration action:** replace the `ctx.connection.api.*` call with the 0.1.2-alpha.2 Client→Host call mechanism prescribed by card DSH-0.1.2-A1-30 for the same `agentPresets.list` operation. The exact replacement API (e.g. package-private JSON methods on the new connection face) is not stated inside the fixture — **unconfirmed**; follow the A1-30 card.

## Completeness check

All four files in the fixture were read in full. Inventory of everything that could collide and its disposition:

| Location | Construct | Verdict |
|---|---|---|
| `package.json:2` | name `dsh-pet-session-bench` | reference value for touchpoint 2; itself fine |
| `package.json:6` | `"dsh": { "client": { "platform": "web" } }` | Web Client declaration; no breaking change evidenced in fixture |
| `src/client/index.ts:1` | `@deepseek-ai/dsh-client-runtime/client` import | **breaks** — DSH-0.1.2-A1-25 |
| `src/client/index.ts:7` | `export const inject = ['slots', 'conversation']` | no change evidenced in fixture; not a listed touchpoint |
| `src/client/index.ts:9` | `apply(ctx: ClientContext)` | **breaks via** DSH-0.1.2-A1-25 (type comes from the removed package) |
| `src/client/index.ts:10` | `__ModuleLoader__.load('pet-legacy-bundle', ...)` | **breaks** — DSH-0.1.2-A1-26 |
| `src/client/index.ts:11` | `ctx.connection.api.agentPresets.list()` | **breaks** — DSH-0.1.2-A1-30 |
| `src/client/index.ts:12–13` | flat `useSession()` `nodes` + `nodes[0]` | **breaks** — DSH-0.1.2-A1-27 |
| `src/client/index.ts:2` | `@deepseek-ai/dsh-client-ui-chat/client` `useSession` import | import site itself survives; its usage is touchpoint 3 |
| `src/client/Pet.tsx:1` | `export function Pet() {}` | no touchpoint |

Total: 4 distinct breaking touchpoints (one spanning lines 9/12–13 via its type/usage), matching the fixture README's stated count of "four touchpoints that break on dsh 0.1.2-alpha.2".

## Read-only discipline statement

No file under `environment/fixture` (or anywhere in the benchmark repository) was modified, created, deleted, or renamed. No build, dependency installation, or reproduction environment was created. No external services were accessed. The only write was this report into the designated output directory.
