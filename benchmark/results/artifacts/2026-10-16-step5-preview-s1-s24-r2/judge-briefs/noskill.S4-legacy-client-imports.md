# JUDGE BRIEF · noskill.S4-legacy-client-imports

## Criteria (sealed rubric)
- [runtime-removal] (25pt) Locate the old ClientContext import, identify Web Client/plugin impact and A1-25, and require removing the deleted-package import in favor of a supported target owning package. A direction such as importing Context from its actual target owning package with the needed type augmentation is sufficient; the fixture does not establish the exact package name. Type erasure does not make a removed type package harmless. Respect the closed-book task: exact successor package names, symbols or signatures absent from the fixture are not mandatory for full credit. Accept a correct located diagnosis, card and defensible migration direction with unavailable details marked unconfirmed or deferred to the actual target owners/exports. Use the sealed references to check asserted details, not to require unseen names. Uncertainty alone without the diagnosis and migration direction earns no credit; positively invented replacements still lose credit.
- [registration-id] (25pt) Compare the actual pet-legacy-bundle loader ID with package.json name dsh-pet-session-bench, map A1-26 and require exact name alignment and client activation verification.
- [session-content] (25pt) Locate useSession/nodes, map A1-27 and require replacing the removed flat content access with a supported target content-reading surface, preserving ordering. Chat/durable windows or public selectors are supported directions; exact hook/store names such as useChat plus order/nodes.get are not mandatory when unavailable in the fixture. Do not positively claim that the old flat useSession nodes API remains supported. Pet.tsx is empty and has no breaking surface. Respect the closed-book task: exact successor package names, symbols or signatures absent from the fixture are not mandatory for full credit. Accept a correct located diagnosis, card and defensible migration direction with unavailable details marked unconfirmed or deferred to the actual target owners/exports. Use the sealed references to check asserted details, not to require unseen names. Uncertainty alone without the diagnosis and migration direction earns no credit; positively invented replacements still lose credit.
- [connection-face] (25pt) Locate connection.api.agentPresets.list, map A1-30 and require removing that deleted face in favor of a verified public target interface for the operation. Remote/public domain APIs are supported directions, but the exact successor name is not mandatory when unavailable in the fixture. Respect the closed-book task: exact successor package names, symbols or signatures absent from the fixture are not mandatory for full credit. Accept a correct located diagnosis, card and defensible migration direction with unavailable details marked unconfirmed or deferred to the actual target owners/exports. Use the sealed references to check asserted details, not to require unseen names. Uncertainty alone without the diagnosis and migration direction earns no credit; positively invented replacements still lose credit.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [invented-migration] ceiling=70 Apply ONLY if the report positively asserts an unsupported lifecycle replacement (apply to setup/activate) or that service inject generally must move into a manifest. Explicitly rejecting these claims, or legitimate cleanup of the deleted package from client.inject, does NOT trigger this cap.

## Candidate report(s)
#### FILE: S4-legacy-client-imports/S4-migration-touchpoints.md

# S4 · Legacy Client Runtime Touchpoints — Migration Report

Target: migrate a dsh **0.1.1-rc.2**-era Web Client plugin to **dsh 0.1.2-alpha.2**.
Method: static, read-only analysis of the fixture. **No file under the fixture was read-modified / added / deleted; no reproduction environment was built; no dependencies installed; nothing migrated.**

## How card IDs and planes are sourced (read this first)

- **Card IDs are quoted verbatim from the fixture itself**, not invented: `fixture/README.md` line 6 lists the four breaking touchpoints together with their card IDs as a "maintainer reference". This run has **no DSH skill available** (the skill card database and per-card plane metadata were not provided to me), so I did **not** read or cite anything under the repository `skills/` directory. Every card ID below is cited to `fixture/README.md:6`.
- **Plane labels (Host / Web Client / plugin) are my classification**, inferred from each touchpoint's code location and the README description. They are reasoned analysis, not quoted card metadata — treat them as such (the card metadata that would authoritatively set the plane was not available to me).
- Where the exact 0.1.2 replacement API/module path cannot be derived from the fixture, it is marked **unconfirmed** rather than guessed.

## Summary

| # | Site (file:line) | Plane (inferred) | Upgrade card | Change (source) |
|---|---|---|---|---|
| T1 | `src/client/index.ts:1` | Web Client | `DSH-0.1.2-A1-25` | `@deepseek-ai/dsh-client-runtime/client` package removed (README:6) |
| T2 | `src/client/index.ts:10` (decl :5) | plugin | `DSH-0.1.2-A1-26` | `__ModuleLoader__.load` registration id must equal package.json `name` (README:6) |
| T3 | `src/client/index.ts:12-13` (import :2) | Web Client | `DSH-0.1.2-A1-27` | `useSession()` `nodes` is no longer a flat snapshot (README:6) |
| T4 | `src/client/index.ts:11` | Web Client | `DSH-0.1.2-A1-30` | `ctx.connection.api` face removed (README:6) |

The fixture README states there are **exactly four** touchpoints (README:3, README:6). A full-tree grep for `dsh-client-runtime`, `dsh-client-ui-chat`, `__ModuleLoader__`, `useSession`, `connection`, `nodes`, `@deepseek-ai/dsh`, and `nodes[` returned **only** the four sites below — no additional occurrences. Scan is complete.

---

## T1 — Removed `@deepseek-ai/dsh-client-runtime/client` import — `DSH-0.1.2-A1-25`

- **File / line:** `src/client/index.ts:1`

```ts
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
```

- **Affected plane:** Web Client. The removed package is the Web Client runtime module the plugin depends on. (The touchpoint site itself is plugin source.)
- **Card / change (source: `fixture/README.md:6`):** "the `@deepseek-ai/dsh-client-runtime/client` package removal (DSH-0.1.2-A1-25)".
- **Knock-on:** `apply(ctx: ClientContext)` on line 9 depends on this exact type; when the import goes, that annotation must be re-sourced too.
- **Migration action:** Delete the `@deepseek-ai/dsh-client-runtime/client` import and source the `ClientContext` type from its 0.1.2 replacement export, then update the `apply` annotation. **Exact replacement module path: unconfirmed** — no replacement reference exists in the fixture, so I will not invent one.

## T2 — `__ModuleLoader__.load` registration id ≠ package.json `name` — `DSH-0.1.2-A1-26`

- **File / line:** `src/client/index.ts:10` (global declared on line 5)

```ts
__ModuleLoader__.load('pet-legacy-bundle', () => { /* legacy bundle id, not package name */ })
```

  package.json `name` = `dsh-pet-session-bench` (`package.json:2`).
- **Affected plane:** plugin (bundle registration identity). Note: `__ModuleLoader__` is a Web Client-runtime global, so the check executes client-side, but the fix concerns the plugin's own declared identity.
- **Card / change (source: `fixture/README.md:6`):** "__ModuleLoader__.load registration id ≠ package.json name (DSH-0.1.2-A1-26)".
- **Migration action:** Make the load id match the package.json `name`. Change `'pet-legacy-bundle'` → `'dsh-pet-session-bench'`. Both the current id and the target value are present in the fixture, so this action is fully determined (not unconfirmed).

## T3 — `useSession()` `nodes` is no longer a flat snapshot — `DSH-0.1.2-A1-27`

- **File / line:** `src/client/index.ts:12-13`

```ts
const { nodes } = useSession()
const first = nodes[0]
```

- **Affected plane:** Web Client (`useSession` is a `@deepseek-ai/dsh-client-ui-chat/client` hook).
- **Important:** the import on `src/client/index.ts:2` (`import { useSession } from '@deepseek-ai/dsh-client-ui-chat/client'`) is **not** removed — that package is retained. Only the **returned `nodes` shape** changed, so the import is not itself a break; the break is the usage.
- **Card / change (source: `fixture/README.md:6`):** "the flat `useSession()` `nodes` snapshot (DSH-0.1.2-A1-27)".
- **Migration action:** Stop treating `nodes` as a flat, directly-indexable array; `nodes[0]` no longer yields the first node as before. Re-derive `first` from the new (non-flat) session snapshot shape. **Exact new shape: unconfirmed** — not present in the fixture.

## T4 — Removed `ctx.connection.api` face — `DSH-0.1.2-A1-30`

- **File / line:** `src/client/index.ts:11`

```ts
ctx.connection.api.agentPresets.list().then(presets => { /* legacy connection.api face */ })
```

- **Affected plane:** Web Client (`ctx.connection` on a `ClientContext` — the client's connection surface to the host).
- **Card / change (source: `fixture/README.md:6`):** "the removed `ctx.connection.api` face (DSH-0.1.2-A1-30)".
- **Migration action:** Replace `ctx.connection.api.<method>` (here `ctx.connection.api.agentPresets.list`) with the 0.1.2 client-connection API surface. **Exact replacement surface / method location: unconfirmed** — not present in the fixture.

---

## Considered, but NOT a 0.1.2 break (to prove scan completeness)

Per README there are exactly four breaking touchpoints; these were inspected and ruled out:

- `src/client/index.ts:2` — `useSession` import: package retained; only its `nodes` return shape changed (that is T3, not an import removal).
- `src/client/index.ts:5` — `declare const __ModuleLoader__`: type declaration supporting T2; the break is the id value on line 10.
- `src/client/index.ts:7` — `export const inject = ['slots', 'conversation']`: not flagged by README; no mapped card.
- `src/client/index.ts:9` — `export function apply(ctx: ClientContext)`: the signature itself is not a separate break; it inherits T1 via the `ClientContext` type.
- `src/client/Pet.tsx:1` — `export function Pet() {}`: empty stub; no touchpoint.
- `package.json` — `name` is the *reference* value for T2, not itself a break.

## Sources (all within the fixture)

- `fixture/README.md` — line 3 ("four touchpoints that break"), line 6 (the four card-ID hints, quoted verbatim).
- `fixture/package.json` — line 2 (`name: dsh-pet-session-bench`, T2 target value).
- `fixture/src/client/index.ts` — lines 1, 2, 5, 9, 10, 11, 12, 13.
- `fixture/src/client/Pet.tsx` — line 1.

## Read-only discipline statement

- Reads were confined to the fixture directory (via read / glob / grep). The fixture is unchanged.
- This report is the only file written, and only under the designated `agent-output/S4-legacy-client-imports/` directory.
- No build, no dependency install, no reproduction environment, no migration edits, no scratch files left behind, and nothing outside the two allowed paths was accessed.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.