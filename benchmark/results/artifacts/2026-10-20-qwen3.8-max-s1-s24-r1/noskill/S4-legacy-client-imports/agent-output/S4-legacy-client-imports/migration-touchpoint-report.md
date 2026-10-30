# S4 · Migration Touchpoint Report — dsh 0.1.1-rc.2 → 0.1.2-alpha.2

- Task: S4-legacy-client-imports (read-only static analysis of `/app/fixture/`)
- Target plugin: `dsh-pet-session-bench` v0.1.0 — a **Web Client plugin** (`package.json:6`: `"dsh": { "client": { "platform": "web" } }`)
- Method: line-by-line static read of every fixture file. No build, no dependency install, no reproduction environment, no migration executed. Fixture untouched (integrity proof in §6).
- Arm: noskill. The DSH 0.1.2-alpha.2 upgrade-card catalog text is **not mounted in this cell**; card IDs and their one-line scope are sourced from the maintainer hints embedded in the fixture itself (`fixture/README.md:6`), and the expected touchpoint count (four) from `fixture/README.md:3`. Every detail that could not be verified from in-cell material is explicitly marked **unconfirmed** (§7). No card IDs are fabricated; no card outside the four evidenced ones is asserted.

## 1. Fixture inventory

| File | Role | Touchpoints |
|---|---|---|
| `package.json` | Plugin manifest; `name: "dsh-pet-session-bench"` (line 2); web client plugin (line 6); private, no dependencies | 0 (but its `name` is the reference value for touchpoint #2) |
| `README.md` | Fixture notes; maintainer hints with card IDs (line 6) | 0 |
| `src/client/index.ts` | Web Client entry: imports, `inject` declaration, `apply(ctx)`, module-loader registration | **4 (all touchpoints)** |
| `src/client/Pet.tsx` | Trivial component (`export function Pet() {}`) | 0 |

All four touchpoints live in the plugin's Web Client entry `src/client/index.ts`.

## 2. Touchpoint summary table

| # | File / Line | Affected plane | Card ID | Breaks because | Migration action |
|---|---|---|---|---|---|
| 1 | `src/client/index.ts:1` (dependent use at `:9`) | Web Client (plugin client entry — client-runtime SDK surface) | **DSH-0.1.2-A1-25** | `@deepseek-ai/dsh-client-runtime/client` package removed in 0.1.2-alpha.2 → the `ClientContext` type import (line 1) no longer resolves, breaking the `apply(ctx: ClientContext)` signature (line 9) | Re-point the `ClientContext` type import to the 0.1.2-alpha.2 replacement client-runtime export and update the `apply()` signature to the replacement context type. Exact replacement package/specifier: **unconfirmed** (card text not in cell) |
| 2 | `src/client/index.ts:10` | Web Client (browser module-loader registration contract) | **DSH-0.1.2-A1-26** | `__ModuleLoader__.load('pet-legacy-bundle', …)` registers under an id that ≠ the package.json `name` (`"dsh-pet-session-bench"`, `package.json:2`); 0.1.2-alpha.2 requires the registration id to equal the package name | Change the registration id from `'pet-legacy-bundle'` to `'dsh-pet-session-bench'` (equivalently, make id and manifest name match — the id side is the natural fix; the inline comment on line 10 itself flags "legacy bundle id, not package name") |
| 3 | `src/client/index.ts:12–13` | Web Client (chat UI session hook data shape) | **DSH-0.1.2-A1-27** | The flat `nodes` snapshot returned by `useSession()` is gone/changed in 0.1.2-alpha.2 → `const { nodes } = useSession()` (line 12) and `nodes[0]` (line 13) break | Migrate the session-snapshot consumption to the 0.1.2-alpha.2 `useSession()` shape (new property/selector for accessing session nodes) instead of destructuring flat `nodes`. Exact replacement shape/selector: **unconfirmed** (card text not in cell) |
| 4 | `src/client/index.ts:11` | plugin ↔ Host bridge face exposed on the Web Client context (plugin's Host-service call site) | **DSH-0.1.2-A1-30** | The `ctx.connection.api` face was removed in 0.1.2-alpha.2 → `ctx.connection.api.agentPresets.list()` (direct Host service call) breaks | Remove the `connection.api` usage and reach the Host-side `agentPresets.list` capability through the 0.1.2-alpha.2 sanctioned plugin→Host service-access mechanism. Exact replacement mechanism: **unconfirmed** (card text not in cell) |

Count check: 4 touchpoints found = 4 touchpoints declared by `fixture/README.md:3`, and the four card IDs match the hints at `fixture/README.md:6` one-for-one. No additional collisions found (see §4).

## 3. Per-touchpoint evidence

### #1 — DSH-0.1.2-A1-25 · removed client-runtime package
- `src/client/index.ts:1`: `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'`
- `src/client/index.ts:9`: `export function apply(ctx: ClientContext): void` — the only consumer of the imported type; it inherits the breakage.
- Source for card mapping: `fixture/README.md:6` ("the `@deepseek-ai/dsh-client-runtime/client` package removal (DSH-0.1.2-A1-25)").
- Action: replace the removed specifier with the 0.1.2-alpha.2 client-runtime type export (replacement specifier **unconfirmed** in-cell) and keep `apply()` typed against the replacement context type.

### #2 — DSH-0.1.2-A1-26 · module-loader registration id ≠ package name
- `src/client/index.ts:5`: `declare const __ModuleLoader__: { load: (id: string, fn: () => void) => void }` (ambient declaration — not itself a break).
- `src/client/index.ts:10`: `__ModuleLoader__.load('pet-legacy-bundle', () => { /* legacy bundle id, not package name */ })`
- `package.json:2`: `"name": "dsh-pet-session-bench"` → registered id `pet-legacy-bundle` ≠ manifest name.
- Source for card mapping: `fixture/README.md:6` ("`__ModuleLoader__.load` registration id ≠ package.json name (DSH-0.1.2-A1-26)").
- Action: register as `__ModuleLoader__.load('dsh-pet-session-bench', …)` so id === package.json name. (Renaming the package to match the legacy id would also satisfy equality but contradicts the fixture's own comment treating the id as the legacy side.)

### #3 — DSH-0.1.2-A1-27 · flat `useSession()` `nodes` snapshot
- `src/client/index.ts:2`: `import { useSession } from '@deepseek-ai/dsh-client-ui-chat/client'` — the import specifier itself is **not** evidenced as removed by any in-cell source; the collision is the hook's return shape (so line 2 is listed under §4, not as its own touchpoint).
- `src/client/index.ts:12`: `const { nodes } = useSession()`
- `src/client/index.ts:13`: `const first = nodes[0]`
- Source for card mapping: `fixture/README.md:6` ("the flat `useSession()` `nodes` snapshot (DSH-0.1.2-A1-27)").
- Action: stop consuming the flat `nodes` snapshot; adopt the 0.1.2-alpha.2 session snapshot shape for first-node access (exact shape **unconfirmed** in-cell).

### #4 — DSH-0.1.2-A1-30 · removed `ctx.connection.api` face
- `src/client/index.ts:11`: `ctx.connection.api.agentPresets.list().then(presets => { /* legacy connection.api face */ })`
- Source for card mapping: `fixture/README.md:6` ("the removed `ctx.connection.api` face (DSH-0.1.2-A1-30)").
- Action: drop the `connection.api` face; call the Host-side agent-presets listing through the 0.1.2-alpha.2 replacement plugin→Host service path (exact mechanism **unconfirmed** in-cell). Plane note: the removed face sits on the `ClientContext` handed to the plugin, i.e. the plugin↔Host bridge as consumed from Web Client code.

## 4. Scan completeness — disposition of every other line

Every file in the fixture was read in full; lines not listed as touchpoints:

| Location | Content | Disposition |
|---|---|---|
| `src/client/index.ts:2` | `useSession` import from `@deepseek-ai/dsh-client-ui-chat/client` | No removal evidenced by any in-cell source; not counted as a separate touchpoint (its usage breaks via #3) |
| `src/client/index.ts:3` | `import { Pet } from './Pet.tsx'` | Local relative import — no known 0.1.2 collision. Note: `Pet` is imported but unused in this file (dead import; code-quality observation, no card) |
| `src/client/index.ts:5` | ambient `__ModuleLoader__` declaration | Declaration only — no collision (the collision is the id at line 10, #2) |
| `src/client/index.ts:7` | `export const inject = ['slots', 'conversation']` | No collision evidenced in-cell; whether the inject contract itself changed in 0.1.2-alpha.2 is **unconfirmed** (no source asserts a change) |
| `src/client/index.ts:9` | `apply(ctx: ClientContext)` signature | Covered by #1 (type source removed) |
| `src/client/index.ts:14` | closing brace | — |
| `src/client/Pet.tsx:1` | `export function Pet() {}` | Empty component — no collision |
| `package.json` (all lines) | manifest, `private: true`, no dependencies, `dsh.client.platform: "web"` | No dependency pins to bump; its `name` is the reference for #2. No collision of its own |
| `README.md` | fixture documentation | Not shipped code — no collision |

## 5. Additional observations (NOT 0.1.2 card collisions — no card asserted)

- `useSession()` is invoked inside `apply()` (`index.ts:12`), not inside a React component/hook body. That violates React rules-of-hooks independently of the dsh version (source: direct code reading). It does not change the #3 mapping, but a correct migration should move the hook call into a component.
- The fixture has no lockfile, no `node_modules`, no other source files — the scan surface is exhaustively the 4 files listed in §1.

## 6. Read-only discipline verification

- All analysis was static reads; no file under `/app/fixture/` was created, modified, or deleted; nothing outside `/app/agent-output/` was written; no build/install/network access for reference material.
- sha256 of every fixture file recomputed after analysis vs `fixture-hash-before.json` (generated 2026-10-20T15:40:33+08:00): **4/4 match**, no extra or missing files.

| File | sha256 (before = after) | Match |
|---|---|---|
| `package.json` | `ffd9e5cc…76142` | ✔ |
| `README.md` | `4dc7a7c5…65ecb` | ✔ |
| `src/client/index.ts` | `98183cf3…063`→ full: `98183cf3d7455ccd3b23b128e7911307795c7f3f3bfdcec5625ea1849807a063` | ✔ |
| `src/client/Pet.tsx` | `037f6c3b…9bd27` | ✔ |

## 7. Unconfirmed items (explicit)

Marked unconfirmed because the DSH 0.1.2-alpha.2 upgrade-card catalog is not mounted in this cell and the brief forbids external lookup:

1. The **replacement package/specifier** for the removed `@deepseek-ai/dsh-client-runtime/client` (A1-25) — only the removal itself is evidenced (`README.md:6`).
2. The **exact 0.1.2-alpha.2 `useSession()` snapshot shape/selector** replacing flat `nodes` (A1-27) — only the removal of the flat snapshot is evidenced.
3. The **exact 0.1.2-alpha.2 mechanism** replacing `ctx.connection.api` for plugin→Host service calls (A1-30) — only the face removal is evidenced.
4. Whether the **`inject = ['slots', 'conversation']` contract** (`index.ts:7`) changed in 0.1.2-alpha.2 — no in-cell source asserts either way; treated as non-colliding.
5. Full official card texts/scopes for A1-25/26/27/30 — the IDs and one-line scopes come solely from `fixture/README.md:6` (maintainer hints shipped inside the fixture).

Everything else in this report is directly evidenced by the cited fixture file/line.
