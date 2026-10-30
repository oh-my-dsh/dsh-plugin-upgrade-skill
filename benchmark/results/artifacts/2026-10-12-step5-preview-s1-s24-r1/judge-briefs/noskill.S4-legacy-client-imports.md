# JUDGE BRIEF · noskill.S4-legacy-client-imports

## Criteria (sealed rubric)
- [runtime-removal] (25pt) Locate the old ClientContext import, identify Web Client/plugin impact and A1-25, and require removing the deleted-package import in favor of a supported target owning package. A direction such as importing Context from its actual target owning package with the needed type augmentation is sufficient; the fixture does not establish the exact package name. Type erasure does not make a removed type package harmless. Respect the closed-book task: exact successor package names, symbols or signatures absent from the fixture are not mandatory for full credit. Accept a correct located diagnosis, card and defensible migration direction with unavailable details marked unconfirmed or deferred to the actual target owners/exports. Use the sealed references to check asserted details, not to require unseen names. Uncertainty alone without the diagnosis and migration direction earns no credit; positively invented replacements still lose credit.
- [registration-id] (25pt) Compare the actual pet-legacy-bundle loader ID with package.json name dsh-pet-session-bench, map A1-26 and require exact name alignment and client activation verification.
- [session-content] (25pt) Locate useSession/nodes, map A1-27 and require replacing the removed flat content access with a supported target content-reading surface, preserving ordering. Chat/durable windows or public selectors are supported directions; exact hook/store names such as useChat plus order/nodes.get are not mandatory when unavailable in the fixture. Do not positively claim that the old flat useSession nodes API remains supported. Pet.tsx is empty and has no breaking surface. Respect the closed-book task: exact successor package names, symbols or signatures absent from the fixture are not mandatory for full credit. Accept a correct located diagnosis, card and defensible migration direction with unavailable details marked unconfirmed or deferred to the actual target owners/exports. Use the sealed references to check asserted details, not to require unseen names. Uncertainty alone without the diagnosis and migration direction earns no credit; positively invented replacements still lose credit.
- [connection-face] (25pt) Locate connection.api.agentPresets.list, map A1-30 and require removing that deleted face in favor of a verified public target interface for the operation. Remote/public domain APIs are supported directions, but the exact successor name is not mandatory when unavailable in the fixture. Respect the closed-book task: exact successor package names, symbols or signatures absent from the fixture are not mandatory for full credit. Accept a correct located diagnosis, card and defensible migration direction with unavailable details marked unconfirmed or deferred to the actual target owners/exports. Use the sealed references to check asserted details, not to require unseen names. Uncertainty alone without the diagnosis and migration direction earns no credit; positively invented replacements still lose credit.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [invented-migration] ceiling=70 Apply ONLY if the report positively asserts an unsupported lifecycle replacement (apply to setup/activate) or that service inject generally must move into a manifest. Explicitly rejecting these claims, or legitimate cleanup of the deleted package from client.inject, does NOT trigger this cap.

## Candidate report(s)
#### FILE: S4-legacy-client-imports/S4-legacy-client-imports-touchpoints.md

# S4 · Legacy Client Runtime Touchpoints — Migration Report (read-only)

Target upgrade: dsh 0.1.1-rc.2 → dsh 0.1.2-alpha.2
Plugin under review: `dsh-pet-session-bench` (Web Client plugin, "type": "module", `"dsh": { "client": { "platform": "web" } }`)

Scope and discipline notes:

- Static analysis only. No file under the fixture was modified, added, or deleted; no build, reproduction environment, dependency install, or migration was performed.
- Only paths inspected: the fixture directory (`fixture/package.json`, `fixture/README.md`, `fixture/src/client/index.ts`, `fixture/src/client/Pet.tsx`) and the designated agent-output directory (this report). Nothing else was read, listed, globbed, or executed.
- Card IDs are not invented: all four come from the maintainer reference note inside the fixture at `fixture/README.md:6`. Anything the fixture does not state is marked **unconfirmed**.

## Summary

Four touchpoints break on dsh 0.1.2-alpha.2. All four live in the plugin's Web Client entry, `src/client/index.ts`; none is on the Host plane. No fifth touchpoint exists elsewhere in the fixture (see "Scan coverage" below).

| # | Location | Plane | Card | Break |
|---|----------|-------|------|-------|
| 1 | `src/client/index.ts:1` | Web Client | DSH-0.1.2-A1-25 | Import of removed package `@deepseek-ai/dsh-client-runtime/client` |
| 2 | `src/client/index.ts:10` | Web Client (module-loader registration contract; plugin-manifest-coupled) | DSH-0.1.2-A1-26 | `__ModuleLoader__.load('pet-legacy-bundle', …)` — registration id differs from package.json name |
| 3 | `src/client/index.ts:11` | Web Client | DSH-0.1.2-A1-30 | Use of removed `ctx.connection.api` face |
| 4 | `src/client/index.ts:12-13` | Web Client | DSH-0.1.2-A1-27 | Flat `useSession()` `nodes` snapshot no longer returned |

Plane taxonomy used (my interpretation; the fixture does not define planes — **unconfirmed**): Host = dsh host application side; Web Client = browser client runtime, the packages/globals/context it ships and the client APIs it exposes; Plugin = plugin code and plugin manifest. All four touchpoints are Web Client runtime surfaces consumed by the plugin's client entry; there is no host-side code in the fixture.

## Touchpoint details and migration actions

### 1. `src/client/index.ts:1` — removed client-runtime package
Breaking code: `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'`

- Plane: Web Client — the breaking change is the removal of a package that is part of the / consumed from the web client runtime surface.
- Card: DSH-0.1.2-A1-25 ("the `@deepseek-ai/dsh-client-runtime/client` package removal").
- Source: card ID and break from `fixture/README.md:6`; code site at `fixture/src/client/index.ts:1`.
- Migration action: delete this import and re-source the `ClientContext` type from whatever the 0.1.2-alpha.2 client runtime ships in its place; the annotation `apply(ctx: ClientContext)` at line 9 depends on that type, so re-point the import before touching the function body.
- Unconfirmed: the replacement export path is not stated in the fixture materials. It must be verified against the actual dsh 0.1.2-alpha.2 client runtime package before editing — do not guess a new specifier.

### 2. `src/client/index.ts:10` — `__ModuleLoader__.load` registration id
Breaking code: `__ModuleLoader__.load('pet-legacy-bundle', () => { /* legacy bundle id, not package name */ })`

- Plane: Web Client — `__ModuleLoader__` is the web-client module loader; the enforced contract (registration id = plugin manifest name) couples it to the plugin manifest.
- Card: DSH-0.1.2-A1-26 ("`__ModuleLoader__.load` registration id ≠ package.json name").
- Source: card ID and break from `fixture/README.md:6`; code site at `fixture/src/client/index.ts:10`; inline comment confirms the id is deliberately "not package name".
- Migration action: change the registration id from `'pet-legacy-bundle'` to `'dsh-pet-session-bench'` — i.e., the exact string of `"name"` in `fixture/package.json:2` (`"dsh-pet-session-bench"`). Keep the second argument (the loader callback) as is.
- This is the one fully deterministic fix: both the constraint and the required value are visible in the fixture.

### 3. `src/client/index.ts:11` — removed `ctx.connection.api` face
Breaking code: `ctx.connection.api.agentPresets.list().then(presets => { /* legacy connection.api face */ })`

- Plane: Web Client — `ctx.connection` is the client-context runtime face; the `.api` member is removed.
- Card: DSH-0.1.2-A1-30 ("the removed `ctx.connection.api` face").
- Source: card ID and break from `fixture/README.md:6`; code site at `fixture/src/client/index.ts:11`; inline comment confirms the legacy face.
- Migration action: drop the `ctx.connection.api.agentPresets.list()` call and route agent-preset listing through the replacement surface exposed on the (re-sourced) client context in 0.1.2-alpha.2, preserving the promise handling (`presets => …`).
- Unconfirmed: the replacement API surface is not described in the fixture materials. Identify the new preset-listing call on `ClientContext` before rewriting line 11.

### 4. `src/client/index.ts:12-13` — flat `useSession()` `nodes` snapshot
Breaking code:
```ts
const { nodes } = useSession()
const first = nodes[0]
```

- Plane: Web Client — client-side session hook return shape changed.
- Card: DSH-0.1.2-A1-27 ("the flat `useSession()` `nodes` snapshot").
- Source: card ID and break from `fixture/README.md:6`; code sites at `fixture/src/client/index.ts:12-13`.
- Migration action: stop destructuring a flat `nodes` array from `useSession()`; read the node/message list from the new session-scoped structure the hook returns (nodes nested under the active conversation/session or obtained via the replacement accessor).
- Unconfirmed: the exact new return shape/access path is not described in the fixture materials. Verify the 0.1.2-alpha.2 `useSession()` signature before rewriting lines 12-13.

## Scan coverage — inspected, no known collision

- `src/client/index.ts:2` — `import { useSession } from '@deepseek-ai/dsh-client-ui-chat/client'`: the import itself is not flagged for removal by any card in the fixture materials (only the hook's return shape changed, touchpoint 4, DSH-0.1.2-A1-27). Keeping the import is consistent with the available evidence. (No card asserts this package's removal — accordingly the import's survival is unconfirmed rather than proven.)
- `src/client/index.ts:5` — `declare const __ModuleLoader__: …`: type-only declaration of the global; the break is on the argument at line 10 (touchpoint 2), not on the declaration.
- `src/client/index.ts:7` — `export const inject = ['slots', 'conversation']`: no card in the fixture materials changes plugin injection slots; treat as unchanged (unconfirmed, no contradicting card).
- `src/client/index.ts:3,9` — local import of `./Pet.tsx` and the `apply` signature: structural code; affected only transitively by touchpoints 1 and 4.
- `src/client/Pet.tsx:1` — empty component stub; no touchpoints.
- `package.json:2` — `"name": "dsh-pet-session-bench"`: not changed by any card, but it *supplies* the required registration id for DSH-0.1.2-A1-26.
- `package.json:6` — `"dsh": { "client": { "platform": "web" } }` manifest: no card in the fixture materials changes the client platform manifest.
- Host plane: the fixture contains no host-side entry (e.g., no host-side plugin file); zero Host-plane touchpoints.

## Sources and unconfirmed items

Sourced (verifiable inside the fixture):

- Card IDs DSH-0.1.2-A1-25, -26, -27, -30 and the surfaces they break: `fixture/README.md:6`.
- Code sites and break expressions: `fixture/src/client/index.ts:1,10,11,12-13`.
- Required registration id value `dsh-pet-session-bench`: `fixture/package.json:2`.
- README statement that exactly four touchpoints exist: `fixture/README.md:3,6`.

Unconfirmed (not determinable from the fixture — must be verified against the real 0.1.2-alpha.2 release before editing):

- The replacement export path for `ClientContext` after `@deepseek-ai/dsh-client-runtime/client` removal (DSH-0.1.2-A1-25).
- The new return shape/access path of `useSession()` (DSH-0.1.2-A1-27).
- The replacement surface for `ctx.connection.api.agentPresets.list()` (DSH-0.1.2-A1-30).
- Continued availability of `@deepseek-ai/dsh-client-ui-chat/client` and of the `inject` slots array (no fixture card addresses them).

## Read-only compliance

Fixture untouched (read-only inspection of four files); no build environment, repro, or dependency install created; no network access; no files written outside `agent-output/S4-legacy-client-imports/`. No repository files, `skills/`, `solution/`, `tests/`, `node_modules/`, or `.dsh/` paths were accessed.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.