# S4 · Legacy Client Runtime Touchpoints — Migration Touchpoint Report

**Migration under evaluation:** dsh 0.1.1-rc.2-era Web Client plugin → dsh 0.1.2-alpha.2
**Mode:** read-only static scan of a static (non-executable) source copy. No reproduction environment was built, no dependencies installed, nothing under `fixture/` was modified, created, or deleted; no network access.
**Fixture inventory (scanned in full):** `fixture/README.md` (6 lines), `fixture/package.json` (7), `fixture/src/client/index.ts` (14), `fixture/src/client/Pet.tsx` (1) — 4 files / 28 lines.

## Evidence policy

- The **only** change-card source available in this sandbox is the maintainer reference embedded in `fixture/README.md:6`, which names the four breaking changes and their card IDs. No upgrade-card catalog / reference pack is mounted in this container (noskill arm: no skill materials; the brief forbids fetching reference material elsewhere), so the **card texts themselves could not be read**. Card IDs are quoted from `fixture/README.md:6`; every statement that goes beyond that line is marked **unconfirmed**.
- Each touchpoint cites its exact fixture line(s) as evidence.

## Touchpoints — 4 found

`fixture/README.md:3` states the fixture contains exactly **four** touchpoints that break on 0.1.2-alpha.2; the scan found exactly four (all in `fixture/src/client/index.ts`).

| # | Touchpoint (file:line) | Plane | Upgrade card | Migration action |
|---|---|---|---|---|
| TP-1 | `fixture/src/client/index.ts:1` — `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'` (consumed at `:9`) | Web Client | `DSH-0.1.2-A1-25` | Delete/replace the type import of the removed `@deepseek-ai/dsh-client-runtime/client` package and re-point `ClientContext` at the 0.1.2-alpha.2 successor module (successor specifier **unconfirmed**). |
| TP-2 | `fixture/src/client/index.ts:10` — `__ModuleLoader__.load('pet-legacy-bundle', …)` (declare at `:5`; name at `fixture/package.json:2`) | Web Client | `DSH-0.1.2-A1-26` | Make the registration id equal the `package.json` name: pass `'dsh-pet-session-bench'` instead of the legacy bundle id `'pet-legacy-bundle'`. |
| TP-3 | `fixture/src/client/index.ts:11` — `ctx.connection.api.agentPresets.list()` (ctx typed at `:9`) | Web Client | `DSH-0.1.2-A1-30` | Remove the `ctx.connection.api` usage and re-express the `agentPresets.list()` call on the 0.1.2-alpha.2 successor face (successor call **unconfirmed**). |
| TP-4 | `fixture/src/client/index.ts:12-13` — `const { nodes } = useSession()`; `nodes[0]` (hook imported at `:2`) | Web Client | `DSH-0.1.2-A1-27` | Rewrite the session consumption for the 0.1.2-alpha.2 (non-flat) session snapshot; stop destructuring a flat `nodes` array / indexing `nodes[0]` (new shape **unconfirmed**). |

All four sit in the plugin's **Web Client** plane (client-runtime / client-ui-chat surfaces consumed by plugin code); none is a Host-plane touchpoint, and no Host-plane code exists in this fixture.

## Detail

### TP-1 · removed `@deepseek-ai/dsh-client-runtime/client` package — DSH-0.1.2-A1-25
- **Evidence:** `fixture/src/client/index.ts:1` imports `ClientContext` from `'@deepseek-ai/dsh-client-runtime/client'`; the type is used in the `apply(ctx: ClientContext)` signature at `index.ts:9`. `fixture/README.md:6` names "the `@deepseek-ai/dsh-client-runtime/client` package removal" and maps it to `DSH-0.1.2-A1-25`.
- **Why it breaks:** the package (and with it the module specifier at line 1) is gone in 0.1.2-alpha.2, so the import resolution/type lookup fails even though it is type-only.
- **Migration action:** drop the line-1 specifier and re-declare/re-import `ClientContext` from the 0.1.2-alpha.2 successor module.
- **Unconfirmed:** the exact successor module specifier and any renamed type — not stated by `fixture/README.md:6` and no card text is readable here.

### TP-2 · `__ModuleLoader__.load` registration id ≠ package.json name — DSH-0.1.2-A1-26
- **Evidence:** `fixture/src/client/index.ts:10` registers with id `'pet-legacy-bundle'` (comment on the same line: "legacy bundle id, not package name"); `fixture/package.json:2` declares `"name": "dsh-pet-session-bench"`. `fixture/README.md:6` maps "`__ModuleLoader__.load` registration id ≠ package.json name" to `DSH-0.1.2-A1-26`.
- **Why it breaks:** 0.1.2-alpha.2 requires the module registration id to match the package name; the legacy bundle id does not.
- **Migration action:** change the first argument of `__ModuleLoader__.load` at `index.ts:10` from `'pet-legacy-bundle'` to `'dsh-pet-session-bench'` (the value of `package.json` `name`); the local `declare const __ModuleLoader__` at `index.ts:5` can stay as a local typing shim.
- **Unconfirmed:** the exact card wording (e.g. whether the loader signature, callback shape, or the `declare` shim also changes) — only the id-mismatch rule is sourced from `fixture/README.md:6`.

### TP-3 · removed `ctx.connection.api` face — DSH-0.1.2-A1-30
- **Evidence:** `fixture/src/client/index.ts:11` calls `ctx.connection.api.agentPresets.list()` (same line comment: "legacy connection.api face"). `fixture/README.md:6` maps "the removed `ctx.connection.api` face" to `DSH-0.1.2-A1-30`.
- **Why it breaks:** the `connection.api` face is removed in 0.1.2-alpha.2, so the property access at line 11 fails.
- **Migration action:** delete the `ctx.connection.api…` call and re-implement the `agentPresets.list()` request against the 0.1.2-alpha.2 successor API face on the client context.
- **Unconfirmed:** the successor face name, call shape, and the return/promise contract of the presets listing — not stated in any readable source.

### TP-4 · flat `useSession()` `nodes` snapshot — DSH-0.1.2-A1-27
- **Evidence:** `fixture/src/client/index.ts:2` imports `useSession` from `'@deepseek-ai/dsh-client-ui-chat/client'`; `index.ts:12` destructures `const { nodes } = useSession()` and `index.ts:13` reads `nodes[0]`. `fixture/README.md:6` maps "the flat `useSession()` `nodes` snapshot" to `DSH-0.1.2-A1-27`.
- **Why it breaks:** in 0.1.2-alpha.2 the session snapshot is no longer flat, so the top-level `nodes` destructure and direct indexing produce the wrong/absent data.
- **Migration action:** rewrite lines 12–13 to read the node collection through the 0.1.2-alpha.2 session snapshot shape instead of destructuring a flat `nodes` array.
- **Unconfirmed:** the concrete new snapshot shape (nesting path, node-tree vs list semantics, and how to obtain the first node) — only the "flat nodes snapshot is gone" fact is sourced from `fixture/README.md:6`. The `useSession` hook import itself at `index.ts:2` is **not** flagged by any readable source as removed (unconfirmed either way).

## Scan completeness — items reviewed and NOT flagged

These were examined; none is named by `fixture/README.md:6` as a 0.1.2-alpha.2 break, so they are listed as **unconfirmed** rather than asserted as touchpoints:

1. `fixture/package.json:6` — `"dsh": { "client": { "platform": "web" } }` manifest shape: no card evidence readable here; whether the 0.1.2 plugin manifest schema keeps this shape is **unconfirmed**.
2. `fixture/src/client/index.ts:7` — `export const inject = ['slots', 'conversation']` slot ids: no card evidence; unchanged/renamed in 0.1.2-alpha.2 is **unconfirmed**.
3. `fixture/src/client/index.ts:3` — `import { Pet } from './Pet.tsx'` (explicit `.tsx` specifier): no card evidence; behaviour under the 0.1.2-alpha.2 module loader is **unconfirmed**.
4. `fixture/package.json` has no `dependencies`/`devDependencies` block at all, so there are no version-pin edits to make in this fixture.
5. `fixture/src/client/Pet.tsx:1` — trivial `export function Pet() {}`, no runtime API usage; no touchpoint.
6. `fixture/README.md` and `fixture/package.json` contain no `@deepseek-ai/*` imports (the only such specifiers are at `index.ts:1-2`), so the import scan is complete at 2 specifiers, both covered above (TP-1 and, as a *hook-shape* change, TP-4).

Overall: 4 breaking touchpoints found = 4 asserted by `fixture/README.md:3`; card IDs used are only the four printed at `fixture/README.md:6` (`DSH-0.1.2-A1-25/26/27/30`) — no other card IDs are referenced anywhere in this report.

## Fixture integrity & read-only discipline

- Every operation against `fixture/` was a read (`fixture/README.md`, `fixture/package.json`, `fixture/src/client/index.ts`, `fixture/src/client/Pet.tsx`) plus one recursive directory listing; no write/edit/create/delete touched `fixture/`.
- No build/repro environment was created, no dependencies installed, no network or external service used, nothing outside the cell directory was read or written.
- Outputs were written only under `agent-output/` inside this cell.

## run-stats

- **toolcalls 总数:** 23 (6 × `run_code` 外层调用 + 17 次嵌套工具调用: working_directory 1, glob 1, read 5, pwsh 1, write 5, edit 2, send_message 2)
- **token 用量:** n/a（本运行未暴露 token 计量）
- **完成时间:** 2026-10-21 13:53:16 +08:00[Asia/Shanghai] (ISO: 2026-10-21T05:53:16.899Z)
