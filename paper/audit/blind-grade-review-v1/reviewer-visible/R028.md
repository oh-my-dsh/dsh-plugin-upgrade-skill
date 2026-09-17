# S4 Migration Touchpoint Report — dsh-pet-session-bench (0.1.1-rc.2 → 0.1.2-alpha.2)

Static, read-only scan of `environment/fixture` (README.md, package.json, src/client/index.ts, src/client/Pet.tsx). No file under the fixture was modified, created, or deleted; no build/reproduction environment was created; closed-book (no network / external references).

## Card-ID sourcing note

The fixture is a closed-book pack: the only in-fixture source that names upgrade cards is `README.md` (lines 3–5), which lists the four known breaking changes: the `@deepseek-ai/dsh-client-runtime/client` package removal (DSH-0.1.2-A1-25), `__ModuleLoader__.load` registration id ≠ package.json name (DSH-0.1.2-A1-26), the flat `useSession()` `nodes` snapshot (DSH-0.1.2-A1-27), and the removed `ctx.connection.api` face (DSH-0.1.2-A1-30). No change-log/changelog file ships in the pack, so card IDs below are grounded in that README hint list; exact migration steps beyond what the hints state are marked where inference is involved.

## Touchpoints (all on the Web Client plane — the plugin declares `"dsh": { "client": { "platform": "web" } }` in package.json line 6)

### 1. Removed package import `@deepseek-ai/dsh-client-runtime/client`
- **File/line:** `src/client/index.ts`, line 1 — `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'`
- **Plane:** Web Client (plugin client source; type-only import, so it is a compile-time break)
- **Card:** `DSH-0.1.2-A1-25` (source: fixture README.md line 5 — "the `@deepseek-ai/dsh-client-runtime/client` package removal")
- **Migration action:** stop importing from the removed `dsh-client-runtime/client` entry point; obtain the client context type from the replacement location defined by the 0.1.2-alpha.2 client runtime (exact replacement module path: unconfirmed — not stated in the pack). Because the import is `import type`, only the type reference needs re-pointing; no runtime import exists.

### 2. `__ModuleLoader__.load` registration id ≠ package.json name
- **File/line:** `src/client/index.ts`, line 10 — `__ModuleLoader__.load('pet-legacy-bundle', () => { /* legacy bundle id, not package name */ })` (declaration at line 5). The id `pet-legacy-bundle` does not match the package name `dsh-pet-session-bench` (package.json line 2).
- **Plane:** Web Client (plugin registration)
- **Card:** `DSH-0.1.2-A1-26` (source: fixture README.md line 5 — "`__ModuleLoader__.load` registration id ≠ package.json name")
- **Migration action:** change the registration id passed to `__ModuleLoader__.load` to the package.json name `dsh-pet-session-bench` (per the card's stated rule that the id must equal the package name).

### 3. Flat `useSession()` `nodes` snapshot
- **File/line:** `src/client/index.ts`, lines 12–13 — `const { nodes } = useSession()` and `const first = nodes[0]`
- **Plane:** Web Client (UI-chat hook consumer)
- **Card:** `DSH-0.1.2-A1-27` (source: fixture README.md line 5 — "the flat `useSession()` `nodes` snapshot")
- **Migration action:** adapt to the post-change `useSession()` return shape — the flat `nodes` array snapshot is no longer the contract in 0.1.2-alpha.2 (exact new shape: unconfirmed — not stated in the pack); the `nodes[0]` access must be rewritten against whatever the new hook returns.
- **Related note (not a card):** `useSession()` is called inside the synchronous `apply(ctx)` function (line 12) rather than in a React component render; if hooks rules are enforced by the new runtime this is additionally invalid usage, but no upgrade card covers it — unconfirmed as a breaking change.

### 4. Removed `ctx.connection.api` face
- **File/line:** `src/client/index.ts`, line 11 — `ctx.connection.api.agentPresets.list().then(presets => { /* legacy connection.api face */ })`
- **Plane:** Web Client (client context API face)
- **Card:** `DSH-0.1.2-A1-30` (source: fixture README.md line 5 — "the removed `ctx.connection.api` face")
- **Migration action:** replace the `ctx.connection.api.agentPresets.list()` call with the 0.1.2-alpha.2 replacement surface for agent-preset listing (exact replacement accessor: unconfirmed — not stated in the pack).

## Scanned and clean

- `package.json` (7 lines): only the `dsh.client.platform: "web"` declaration (line 6); no other legacy fields. Note: it declares no dependencies at all, consistent with the imports resolving against host-provided runtime packages.
- `src/client/Pet.tsx`: single empty component `export function Pet() {}` (line 1); no touchpoints. (JSX is not actually used in this file, so no JSX-transform card applies — no such card is named in the pack.)
- `README.md`: metadata/hints only, not plugin code.

## Completeness statement

Exactly four breaking touchpoints were found, matching the four changes the fixture README announces. Every card ID above traces to fixture README.md line 5; every file/line citation is quoted verbatim from the pack. Items whose replacement APIs the pack does not name are explicitly marked "unconfirmed". Read-only discipline: fixture untouched; the only file written is this report.
