# S4 · Migration Touchpoint Report: Legacy Web Client Plugin (0.1.1-rc.2 → 0.1.2-alpha.2)

## Scope and method

Read-only static scan of the fixture at
E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\tasks\S4-legacy-client-imports\environment\fixture
(two source files: src\client\index.ts, src\client\Pet.tsx; plus package.json and README.md).
No file under the fixture was modified, created, or deleted; no build or reproduction environment was created.
The fixture README documents the four breaking touchpoints and their card IDs (maintainer reference included in the
fixture itself); each finding below cites its file/line and that source. Nothing outside the fixture was consulted.

## Summary

Four breaking touchpoints, all on the Web Client plane; none on the Host plane (the plugin ships no Host code).

| # | Location | Plane | Card | Breakage |
|---|----------|-------|------|----------|
| 1 | src\client\index.ts:1 | Web Client | DSH-0.1.2-A1-25 | `@deepseek-ai/dsh-client-runtime/client` package removed |
| 2 | src\client\index.ts:10 | Web Client | DSH-0.1.2-A1-26 | `__ModuleLoader__.load` id ≠ package.json name |
| 3 | src\client\index.ts:12-13 | Web Client | DSH-0.1.2-A1-27 | flat `useSession()` `nodes` snapshot removed |
| 4 | src\client\index.ts:11 | Web Client | DSH-0.1.2-A1-30 | `ctx.connection.api` face removed |

## Findings

### 1. Removed `@deepseek-ai/dsh-client-runtime/client` import — DSH-0.1.2-A1-25

- File/line: src\client\index.ts:1 — `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'`
- Plane: Web Client (type import used by the plugin's client entry)
- Breakage: the `@deepseek-ai/dsh-client-runtime/client` package no longer exists in 0.1.2-alpha.2, so the module
  resolution of the client entry fails outright.
- Migration action: replace the `ClientContext` import with the 0.1.2-alpha.2 client context type from the
  successor runtime/client package that the harness now exposes for web client plugins. (Exact successor module
  path: unconfirmed — not derivable from the closed-book fixture; the fixture README names only the removal, not
  the replacement, under DSH-0.1.2-A1-25.)

### 2. `__ModuleLoader__.load` registration id mismatch — DSH-0.1.2-A1-26

- File/line: src\client\index.ts:10 — `__ModuleLoader__.load('pet-legacy-bundle', () => { ... })`
- Plane: Web Client (module loader registration at client activation)
- Breakage: 0.1.2-alpha.2 requires the registration id passed to `__ModuleLoader__.load` to equal the plugin's
  `name` field in package.json. The fixture registers `'pet-legacy-bundle'` while package.json:2 declares
  `"name": "dsh-pet-session-bench"`, so the loader rejects the registration.
- Migration action: change the call to `__ModuleLoader__.load('dsh-pet-session-bench', ...)` so the id matches
  the package.json name exactly.

### 3. Flat `useSession()` `nodes` snapshot — DSH-0.1.2-A1-27

- File/line: src\client\index.ts:12-13 — `const { nodes } = useSession()` / `const first = nodes[0]`
- Plane: Web Client (chat UI session hook consumption)
- Breakage: the flat `nodes` array destructured directly from `useSession()` is no longer provided by
  `@deepseek-ai/dsh-client-ui-chat/client` in 0.1.2-alpha.2; the session snapshot was restructured.
- Migration action: migrate to the 0.1.2-alpha.2 session snapshot API from
  `@deepseek-ai/dsh-client-ui-chat/client` and update the `nodes[0]` access accordingly. (Exact replacement
  field/hook name: unconfirmed — not specified in the closed-book fixture beyond the card ID.)

### 4. Removed `ctx.connection.api` face — DSH-0.1.2-A1-30

- File/line: src\client\index.ts:11 — `ctx.connection.api.agentPresets.list().then(...)`
- Plane: Web Client (client→host RPC face access on the client context)
- Breakage: the `ctx.connection.api` face was removed in 0.1.2-alpha.2, so this property access fails (either at
  compile time against the new ClientContext type or at runtime when `apply` executes).
- Migration action: call the agentPresets listing through the 0.1.2-alpha.2 replacement RPC surface (package-private
  host methods / successor connection face). (Exact successor API name: unconfirmed — not specified in the
  closed-book fixture.)

## Non-touchpoints checked

- src\client\Pet.tsx:1 — trivial empty exported component; no 0.1.2-alpha.2-sensitive API usage.
- src\client\index.ts:2 — `useSession` import from `@deepseek-ai/dsh-client-ui-chat/client` itself remains valid;
  only the destructured `nodes` snapshot shape breaks (finding 3).
- src\client\index.ts:3 — local `./Pet.tsx` relative import; unaffected.
- src\client\index.ts:7 — `export const inject = ['slots', 'conversation']`: no evidence in the fixture that service
  names in `inject` changed in 0.1.2-alpha.2; unconfirmed but no breakage indicated by the fixture's documented
  touchpoint list.
- package.json — name/version/private/type/dsh.client.platform fields are all still-conventional; no card in the
  fixture's list targets package.json itself (it is only implicated by finding 2's id-match rule).

## Sources

- Fixture README.md:7-8 — documents the four breaking touchpoints and card IDs DSH-0.1.2-A1-25, A1-26, A1-27, A1-30
  as the maintainer reference.
- Fixture source lines cited per finding above.
- No materials outside the fixture were used; items the fixture does not specify (successor API names for findings
  1, 3, 4) are marked unconfirmed rather than guessed.
