# S4 · Legacy Client Runtime Touchpoints — Migration Touchpoint Report

**Target migration:** dsh 0.1.1-rc.2 → dsh 0.1.2-alpha.2
**Scope:** static read-only analysis of the fixture (no builds, no reproduction, no file changes).
**Fixture analyzed:**
- `package.json`
- `README.md`
- `src/client/index.ts`
- `src/client/Pet.tsx`

**Source note:** the fixture `README.md` (lines 5–6) lists the four breakages and their card IDs
("Touchpoint hints"). Card IDs and their one-line key points are cited from that file; this cell is
NOSKILL, so no reference-card body text is available and every migration action that names a specific
successor API/type is marked **unconfirmed**.

## Summary of touchpoints (4 found)

| # | file:line | plane | card ID | one-line key point |
|---|-----------|-------|---------|--------------------|
| 1 | src/client/index.ts:1 (also :9) | Web Client | DSH-0.1.2-A1-25 | `@deepseek-ai/dsh-client-runtime/client` package removal |
| 2 | src/client/index.ts:10 | Web Client | DSH-0.1.2-A1-26 | `__ModuleLoader__.load` registration id ≠ package.json name |
| 3 | src/client/index.ts:12–13 | Web Client | DSH-0.1.2-A1-27 | flat `useSession()` `nodes` snapshot |
| 4 | src/client/index.ts:11 | Web Client | DSH-0.1.2-A1-30 | removed `ctx.connection.api` face |

---

## Touchpoint 1 — removed `@deepseek-ai/dsh-client-runtime/client` package

- **file/line:** `src/client/index.ts:1` (`import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'`); also `src/client/index.ts:9` (`export function apply(ctx: ClientContext)` consumes the type).
- **plane:** Web Client.
- **card ID:** `DSH-0.1.2-A1-25`.
- **key point (source: fixture README.md):** the `@deepseek-ai/dsh-client-runtime/client` package is removed.
- **migration action:** remove the import from the removed package and obtain `ClientContext` from its successor type/package. **The specific successor path/type is unconfirmed** (no card body available in this NOSKILL cell).

## Touchpoint 2 — `__ModuleLoader__.load` registration id ≠ package.json name

- **file/line:** `src/client/index.ts:10` — `__ModuleLoader__.load('pet-legacy-bundle', …)`.
- **plane:** Web Client (client module registration).
- **card ID:** `DSH-0.1.2-A1-26`.
- **key point (source: fixture README.md):** the registration id passed to `__ModuleLoader__.load` must match the `package.json` name.
- **migration action:** change the first argument from `'pet-legacy-bundle'` to the package name `dsh-pet-session-bench` (see `package.json:2` `"name"`). The id `'pet-legacy-bundle'` is the legacy bundle id, not the package name (comment at `index.ts:10` confirms this).

## Touchpoint 3 — flat `useSession()` `nodes` snapshot

- **file/line:** `src/client/index.ts:12–13` — `const { nodes } = useSession()` then `const first = nodes[0]`.
- **plane:** Web Client.
- **card ID:** `DSH-0.1.2-A1-27`.
- **key point (source: fixture README.md):** the flat `useSession()` `nodes` snapshot shape changed.
- **migration action:** update the destructuring/access to the new snapshot shape (the flat top-level `nodes` no longer applies). **The exact new shape is unconfirmed** (no card body available in this NOSKILL cell). The `useSession` import itself (`index.ts:2`) is not listed as a breakage.

## Touchpoint 4 — removed `ctx.connection.api` face

- **file/line:** `src/client/index.ts:11` — `ctx.connection.api.agentPresets.list().then(…)`.
- **plane:** Web Client.
- **card ID:** `DSH-0.1.2-A1-30`.
- **key point (source: fixture README.md):** the `ctx.connection.api` face is removed.
- **migration action:** stop using `ctx.connection.api.agentPresets.list()` and call the successor client API for agent presets. **The specific replacement API is unconfirmed** (no card body available in this NOSKILL cell).

---

## Not reported as breakages

- `src/client/index.ts:2` `import { useSession } from '@deepseek-ai/dsh-client-ui-chat/client'` — import itself is not flagged; only its snapshot usage (Touchpoint 3).
- `src/client/index.ts:3` `import { Pet } from './Pet.tsx'` and `src/client/Pet.tsx` — not listed as breakages.
- `src/client/index.ts:7` `export const inject = ['slots', 'conversation']` — not listed as a breakage.
- `package.json:6` `"dsh": { "client": { "platform": "web" } }` — not listed as a breakage.

## Read-only discipline

No file under the fixture was modified. No reproduction environment was built and no dependencies were
installed. Analysis was performed only by reading the four files listed above.
