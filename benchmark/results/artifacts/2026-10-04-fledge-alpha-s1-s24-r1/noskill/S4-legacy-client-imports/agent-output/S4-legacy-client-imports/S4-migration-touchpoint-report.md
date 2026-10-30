# S4-legacy-client-imports — Migration Touchpoint Report (dsh 0.1.1-rc.2 → 0.1.2-alpha.2)

Scope: read-only analysis of `fixture/` (Web Client plugin `dsh-pet-session-bench`, dsh 0.1.1-rc.2 era). Fixture unchanged. No reproduction environment built.

Card source note: the upgrade card IDs below are taken from `fixture/README.md:6`. Per-card migration text beyond what the source lines in the fixture show is marked **unconfirmed** (external docs not consulted, per brief).

## Touchpoints

### 1. Removed package `@deepseek-ai/dsh-client-runtime/client` — DSH-0.1.2-A1-25
- File/line: `fixture/src/client/index.ts:1`
  `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'`
- Affected plane: **plugin** (client entry imports a removed runtime package)
- Migration action: remove the `/client` subpath import and source `ClientContext` from the 0.1.2-alpha.2 replacement entry point. Exact replacement specifier: **unconfirmed** (not present in fixture).

### 2. `__ModuleLoader__.load` registration id ≠ package.json name — DSH-0.1.2-A1-26
- File/line: `fixture/src/client/index.ts:10`
  `__ModuleLoader__.load('pet-legacy-bundle', () => { ... })`
- Affected plane: **plugin**
- Migration action: register with the package name from `fixture/package.json:2` (`dsh-pet-session-bench`) instead of the legacy bundle id `pet-legacy-bundle`.

### 3. Flat `useSession()` `nodes` snapshot — DSH-0.1.2-A1-27
- File/line: `fixture/src/client/index.ts:2` (import) and `fixture/src/client/index.ts:12-13`
  `const { nodes } = useSession(); const first = nodes[0]`
- Affected plane: **Web Client** (`useSession` comes from `@deepseek-ai/dsh-client-ui-chat/client`)
- Migration action: stop consuming the flat `nodes` array snapshot and use the 0.1.2-alpha.2 session shape. Exact replacement shape/selector: **unconfirmed** (not present in fixture).

### 4. Removed `ctx.connection.api` face — DSH-0.1.2-A1-30
- File/line: `fixture/src/client/index.ts:11`
  `ctx.connection.api.agentPresets.list()...`
- Affected plane: **Host** (connection/API face removed in the host runtime)
- Migration action: drop `ctx.connection.api.agentPresets` usage and use the 0.1.2-alpha.2 connection face. Exact replacement: **unconfirmed**.

## Other observations (not counted as cards)
- `fixture/package.json:6` `"dsh": { "client": { "platform": "web" } }` — consistent with a Web Client plugin; no hint of a break in the fixture, so no card asserted.
- `fixture/src/client/index.ts:3` `import { Pet } from './Pet.tsx'` — no card hinted; any extension/loader change is **unconfirmed**, not asserted.
- `fixture/src/client/Pet.tsx:1` — trivial, no touchpoint.

## Limitations
- Only the four card IDs hinted in `fixture/README.md:6` are asserted. The prose details of each card (full titles, replacement APIs) are not available inside the cell directory; those details are marked "unconfirmed" rather than fabricated. No external docs were searched.
