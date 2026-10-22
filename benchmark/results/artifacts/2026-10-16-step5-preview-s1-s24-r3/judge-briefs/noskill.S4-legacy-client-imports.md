# JUDGE BRIEF · noskill.S4-legacy-client-imports

## Criteria (sealed rubric)
- [runtime-removal] (25pt) Locate the old ClientContext import, identify Web Client/plugin impact and A1-25, and require removing the deleted-package import in favor of a supported target owning package. A direction such as importing Context from its actual target owning package with the needed type augmentation is sufficient; the fixture does not establish the exact package name. Type erasure does not make a removed type package harmless. Respect the closed-book task: exact successor package names, symbols or signatures absent from the fixture are not mandatory for full credit. Accept a correct located diagnosis, card and defensible migration direction with unavailable details marked unconfirmed or deferred to the actual target owners/exports. Use the sealed references to check asserted details, not to require unseen names. Uncertainty alone without the diagnosis and migration direction earns no credit; positively invented replacements still lose credit.
- [registration-id] (25pt) Compare the actual pet-legacy-bundle loader ID with package.json name dsh-pet-session-bench, map A1-26 and require exact name alignment and client activation verification.
- [session-content] (25pt) Locate useSession/nodes, map A1-27 and require replacing the removed flat content access with a supported target content-reading surface, preserving ordering. Chat/durable windows or public selectors are supported directions; exact hook/store names such as useChat plus order/nodes.get are not mandatory when unavailable in the fixture. Do not positively claim that the old flat useSession nodes API remains supported. Pet.tsx is empty and has no breaking surface. Respect the closed-book task: exact successor package names, symbols or signatures absent from the fixture are not mandatory for full credit. Accept a correct located diagnosis, card and defensible migration direction with unavailable details marked unconfirmed or deferred to the actual target owners/exports. Use the sealed references to check asserted details, not to require unseen names. Uncertainty alone without the diagnosis and migration direction earns no credit; positively invented replacements still lose credit.
- [connection-face] (25pt) Locate connection.api.agentPresets.list, map A1-30 and require removing that deleted face in favor of a verified public target interface for the operation. Remote/public domain APIs are supported directions, but the exact successor name is not mandatory when unavailable in the fixture. Respect the closed-book task: exact successor package names, symbols or signatures absent from the fixture are not mandatory for full credit. Accept a correct located diagnosis, card and defensible migration direction with unavailable details marked unconfirmed or deferred to the actual target owners/exports. Use the sealed references to check asserted details, not to require unseen names. Uncertainty alone without the diagnosis and migration direction earns no credit; positively invented replacements still lose credit.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [invented-migration] ceiling=70 Apply ONLY if the report positively asserts an unsupported lifecycle replacement (apply to setup/activate) or that service inject generally must move into a manifest. Explicitly rejecting these claims, or legitimate cleanup of the deleted package from client.inject, does NOT trigger this cap.

## Candidate report(s)
#### FILE: S4-legacy-client-imports/S4-legacy-client-imports.md

# S4 · Legacy Client Runtime Touchpoints — Migration Touchpoint Report

- **Migration under analysis:** dsh `0.1.1-rc.2` → dsh `0.1.2-alpha.2`
- **Subject:** Web Client plugin `dsh-pet-session-bench` (static copy under `fixture/`, examined **read-only**)
- **Evidence used (only paths opened):** `fixture/README.md`, `fixture/package.json`, `fixture/src/client/index.ts`, `fixture/src/client/Pet.tsx`. Nothing outside the permitted paths was read. Anything not derivable from these four files is explicitly marked **unconfirmed** — no change-card text, card index, or skill material exists inside the permitted paths, so card IDs below are quoted from the fixture's own maintainer hint block (`fixture/README.md:6`).

## 1. Scan result — breaking touchpoints (4)

The fixture states it contains exactly four breaking touchpoints (`fixture/README.md:3`: "four touchpoints that break on dsh 0.1.2-alpha.2") and enumerates them with card IDs in the maintainer hints (`fixture/README.md:6`). An independent line-by-line scan of `src/client/index.ts` found version-sensitive API usage on exactly lines **1, 10, 11, 12–13** — no further candidates.

| # | File:Line | Plane | Card ID | What breaks | Migration action |
|---|-----------|-------|---------|-------------|------------------|
| 1 | `src/client/index.ts:1` | Web Client | `DSH-0.1.2-A1-25` | `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'` — that package was removed | Delete the import; re-source `ClientContext` (still needed by `apply(ctx: ClientContext)` at line 9) from its 0.1.2-alpha.2 location — **unconfirmed** |
| 2 | `src/client/index.ts:10` | Web Client | `DSH-0.1.2-A1-26` | `__ModuleLoader__.load('pet-legacy-bundle', …)` — registration id ≠ package.json `name` | Change the id to `'dsh-pet-session-bench'` (the `name` in `fixture/package.json:2`) |
| 3 | `src/client/index.ts:11` | Host | `DSH-0.1.2-A1-30` | `ctx.connection.api.agentPresets.list()` — the `ctx.connection.api` face was removed | Stop calling through `ctx.connection.api`; re-issue `agentPresets.list()` via the 0.1.2-alpha.2 replacement face — **unconfirmed** |
| 4 | `src/client/index.ts:12` (consumed at `:13`) | Web Client | `DSH-0.1.2-A1-27` | `const { nodes } = useSession()` — the flat top-level `nodes` snapshot no longer exists | Stop destructuring `nodes` from the hook result's top level; read the nodes from the new snapshot shape — **unconfirmed** |

## 2. Detail per touchpoint

### 2.1 `DSH-0.1.2-A1-25` — removal of the `@deepseek-ai/dsh-client-runtime/client` package

- **File/line:** `fixture/src/client/index.ts:1`
- **Plane:** Web Client — the removed artifact is a Web Client runtime package; the plugin's import resolves against the client runtime surface (the break is in plugin code, but the changed artifact is the client runtime).
- **Code:** `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'`
- **Evidence:** `fixture/README.md:6` — "the `@deepseek-ai/dsh-client-runtime/client` package removal (DSH-0.1.2-A1-25)"; the import itself at `fixture/src/client/index.ts:1`.
- **Break:** on 0.1.2-alpha.2 the module `@deepseek-ai/dsh-client-runtime/client` no longer exists, so this import (and therefore the whole client entry module) fails to resolve/build.
- **Migration action:** remove this import and obtain `ClientContext` from wherever 0.1.2-alpha.2 now exports it; the type is still required at `fixture/src/client/index.ts:9` (`export function apply(ctx: ClientContext): void`), so it cannot simply be deleted without a replacement.
- **Unconfirmed:** the replacement location for `ClientContext`. The fixture contains no second example of the type's import path, and guessing one (e.g. assuming it moved into `@deepseek-ai/dsh-client-ui-chat/client`) would be fabrication. Check the 0.1.2-alpha.2 card text / release artifacts before editing.

### 2.2 `DSH-0.1.2-A1-26` — `__ModuleLoader__.load` registration id must equal the package name

- **File/line:** `fixture/src/client/index.ts:10`
- **Plane:** Web Client — `__ModuleLoader__` is a client-runtime global (locally declared at line 5: `declare const __ModuleLoader__: { load: (id: string, fn: () => void) => void }`) and the id contract is enforced by the client runtime loader; the fix itself is applied in plugin code.
- **Code:** `__ModuleLoader__.load('pet-legacy-bundle', () => { /* legacy bundle id, not package name */ })`
- **Evidence:** `fixture/README.md:6` — "`__ModuleLoader__.load` registration id ≠ package.json name (DSH-0.1.2-A1-26)"; `fixture/src/client/index.ts:10` (the in-code comment states "legacy bundle id, not package name"); `fixture/package.json:2` — `"name": "dsh-pet-session-bench"`.
- **Break:** the bundle is registered under `'pet-legacy-bundle'` while the package name is `'dsh-pet-session-bench'`; the two must match on 0.1.2-alpha.2.
- **Migration action (fully derivable from the fixture):**
  `__ModuleLoader__.load('pet-legacy-bundle', …)` → `__ModuleLoader__.load('dsh-pet-session-bench', …)`

### 2.3 `DSH-0.1.2-A1-30` — removed `ctx.connection.api` face

- **File/line:** `fixture/src/client/index.ts:11`
- **Plane:** Host — `ctx.connection` is the client↔host bridge and `.api` was the face through which host-side services (`agentPresets`) were exposed to client plugins; the removal is a host-surface change that client code consumes. (If a rubric classifies by call site rather than by contract owner, note that the call site itself is client-plugin code; the card ID and action are unaffected.)
- **Code:** `ctx.connection.api.agentPresets.list().then(presets => { /* legacy connection.api face */ })`
- **Evidence:** `fixture/README.md:6` — "the removed `ctx.connection.api` face (DSH-0.1.2-A1-30)"; `fixture/src/client/index.ts:11` (comment: "legacy connection.api face").
- **Break:** on 0.1.2-alpha.2 the connection object no longer exposes `.api`, so `ctx.connection.api.agentPresets` is `undefined` and the call throws at plugin apply time.
- **Migration action:** delete the `ctx.connection.api.agentPresets.list()` call and re-issue the same host-service call through whatever face replaces it in 0.1.2-alpha.2.
- **Unconfirmed:** the replacement face. The fixture contains no 0.1.2-era example of invoking host services from a client plugin, so no replacement path can be stated without fabricating one.

### 2.4 `DSH-0.1.2-A1-27` — flat `useSession()` `nodes` snapshot

- **File/line:** `fixture/src/client/index.ts:12` (consumed at `:13`)
- **Plane:** Web Client — `useSession` is a hook of the Web Client UI package `@deepseek-ai/dsh-client-ui-chat/client` (import at `fixture/src/client/index.ts:2`).
- **Code:** `const { nodes } = useSession()` / `const first = nodes[0]`
- **Evidence:** `fixture/README.md:6` — "the flat `useSession()` `nodes` snapshot (DSH-0.1.2-A1-27)"; `fixture/src/client/index.ts:12-13`.
- **Break:** the hook result no longer carries a flat, top-level `nodes` array; the destructuring at line 12 yields `undefined`, and line 13 (`nodes[0]`) then throws / silently misbehaves.
- **Migration action:** stop reading `nodes` from the top level of the `useSession()` result; obtain the node list from the new (nested) snapshot shape and update line 13's indexing accordingly.
- **Unconfirmed:** the exact new accessor/shape. The fixture shows only the legacy usage; the new shape is not derivable from it.

## 3. Scanned and cleared (no touchpoint)

- `fixture/src/client/index.ts:2` — `import { useSession } from '@deepseek-ai/dsh-client-ui-chat/client'`: this import path is **not** among the removals listed in `fixture/README.md:6`, and `DSH-0.1.2-A1-27` is framed as a change to the hook's *return shape* (line 12), not to the import. Cleared per the fixture's own enumeration; note that the subpath's continued existence in 0.1.2-alpha.2 is inferred from that framing rather than directly asserted anywhere in the fixture.
- `fixture/src/client/index.ts:3` and `fixture/src/client/Pet.tsx:1` — local component import/definition; no version-sensitive runtime API surface.
- `fixture/src/client/index.ts:5` — local `declare const __ModuleLoader__`; only its *use* at line 10 breaks (`DSH-0.1.2-A1-26`), not the declaration.
- `fixture/src/client/index.ts:7` — `export const inject = ['slots', 'conversation']`; not listed as a breaking touchpoint.
- `fixture/src/client/index.ts:9` — `export function apply(ctx: ClientContext): void`; the signature is fine, but it consumes the type imported at line 1 (`DSH-0.1.2-A1-25`).
- `fixture/package.json` — `name` (line 2, used as the correct registration id for `DSH-0.1.2-A1-26`), `version`, `private`, `type`, and `"dsh": { "client": { "platform": "web" } }` (line 6); none is listed as a breaking touchpoint.

## 4. Unconfirmed items (explicitly not verifiable from the fixture)

1. The replacement import location for `ClientContext` after `DSH-0.1.2-A1-25`.
2. The replacement face for host-service calls after `DSH-0.1.2-A1-30` (how `agentPresets.list()` should be invoked on 0.1.2-alpha.2).
3. The new shape/accessor of the `useSession()` snapshot after `DSH-0.1.2-A1-27`.
4. The full text of the four upgrade cards — the fixture carries only the one-line hint titles in `fixture/README.md:6`; the card IDs and break descriptions above are quoted from there and were **not** cross-checked against any card source, because none exists inside the permitted paths.
5. Whether `@deepseek-ai/dsh-client-ui-chat/client` itself is unchanged in 0.1.2-alpha.2 (inferred; see §3).

## 5. Read-only discipline

- All fixture access was read-only listing/reading. No file under `fixture/` was created, modified, moved, or deleted; the only writes performed for this task were into `agent-output/S4-legacy-client-imports/`.
- SHA-256 of the fixture files, computed before and after writing this report (identical both times, confirming no modification):

| File | SHA-256 | Bytes |
|------|---------|-------|
| `fixture/README.md` | `4dc7a7c599d9fa440f4a98f7a31f907cf72bfbc5210e9491cbeb6e4714365ecb` | 729 |
| `fixture/package.json` | `ffd9e5ccaab6dd032995df4dff93403c5c58bf7cc60d2e98dd0b637e23c76142` | 145 |
| `fixture/src/client/index.ts` | `98183cf3d7455ccd3b23b128e7911307795c7f3f3bfdcec5625ea1849807a063` | 608 |
| `fixture/src/client/Pet.tsx` | `037f6c3b5dd30b8db5674de69b803f8877f2c07450282f7d2c402a01b099bd27` | 25 |

- No build, dependency install, reproduction environment, or migration was performed, per the task constraints.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.