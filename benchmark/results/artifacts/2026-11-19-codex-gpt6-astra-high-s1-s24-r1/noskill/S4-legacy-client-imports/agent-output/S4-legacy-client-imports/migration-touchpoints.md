# S4 migration touchpoint report

Target: dsh 0.1.1-rc.2-era Web Client plugin → dsh 0.1.2-alpha.2.

## Scope and evidence

Read-only static inspection covered all four fixture files: `package.json`, `README.md`, `src/client/index.ts`, and `src/client/Pet.tsx`. Paths and line numbers below are relative to the fixture root. The source was not executed, built, migrated, or edited. No reproduction environment or dependencies were created; only this report directory was written. No skills, external sources, other repository content, tests, verifiers, or prior answers were consulted.

`README.md:3` states that this fixture has four breaking touchpoints for the target version. `README.md:6` explicitly supplies their descriptions and full card IDs. That maintainer reference is the source for the change mappings below; the underlying upgrade cards and target SDK are not included. Consequently, the four collisions are supported by the fixture, but exact replacement API signatures and additional requirements from the full cards are **unconfirmed**.

## Touchpoints

| File / line | Affected plane | Full upgrade card ID | Evidence and migration action |
| --- | --- | --- | --- |
| `src/client/index.ts:1`; dependent annotation at `:9` | Web Client / plugin type integration | `DSH-0.1.2-A1-25` | The plugin imports `ClientContext` from `@deepseek-ai/dsh-client-runtime/client`. `README.md:6` identifies removal of that package. Remove reliance on this import and obtain the context type from the supported target-version public API, then update `apply(ctx: ClientContext)` as necessary. **Unconfirmed:** replacement module path and exported type name. Because this is a type-only import, the directly visible exposure is type resolution/type checking, not an emitted runtime import. |
| `src/client/index.ts:10`; loader declaration at `:5`; package identity at `package.json:2` | Web Client module loader / plugin registration | `DSH-0.1.2-A1-26` | The loader registration ID is `'pet-legacy-bundle'`, while the package name is `'dsh-pet-session-bench'`. `README.md:6` identifies registration ID versus package-name mismatch as the collision. Align the `__ModuleLoader__.load` ID with the package identity: `__ModuleLoader__.load('dsh-pet-session-bench', ...)`. **Unconfirmed:** any additional loader signature, registration lifecycle, or callback requirements in the full card; the local ambient declaration alone cannot establish target compatibility. |
| `src/client/index.ts:12–13`; hook import at `:2` | Web Client session state / plugin consumer | `DSH-0.1.2-A1-27` | The code destructures a flat `nodes` snapshot from `useSession()` and directly reads `nodes[0]`. `README.md:6` identifies this flat snapshot as the breaking contract. Migrate both the session-state read and the first-node selection to the target version's supported session representation; preserve the intended first-node semantics and handle an empty session. **Unconfirmed:** replacement hook return shape, selectors/accessors, ordering semantics, and reactivity requirements. The fixture does not identify the import at line 2 itself as removed. |
| `src/client/index.ts:11` | Web Client context / plugin API access | `DSH-0.1.2-A1-30` | The call is `ctx.connection.api.agentPresets.list().then(...)`. `README.md:6` explicitly identifies removal of the `ctx.connection.api` face. Replace access through that removed face with the supported target-version API access mechanism, then adapt preset listing and result consumption to its documented signature. **Unconfirmed:** replacement service/property, whether `agentPresets.list()` remains available, its arguments/return type, and whether dependency injection must change. No Host implementation is present, so a Host-side change cannot be established from this fixture. |

## Coverage and remaining verification

These are all four collisions identified by the supplied maintainer reference, and each has a matching source occurrence. The `Pet` import (`src/client/index.ts:3`) and empty component (`src/client/Pet.tsx:1`) reveal no additional documented collision. `inject = ['slots', 'conversation']` (`src/client/index.ts:7`) is present, but the supplied reference does not establish an independent migration requirement for it. `package.json:6` declares the Web Client plane; no Host source or dependency versions are supplied.

This is a complete scan of the supplied static files, not proof of runtime compatibility or completeness against the unavailable full release documentation. Before implementing, obtain the authoritative text for the four cards and target SDK declarations to resolve the explicitly unconfirmed replacement details. No execution or validation against dsh 0.1.2-alpha.2 was performed.

Blocker: none for producing this evidence-bounded report. The missing full cards/target API definitions prevent a verified, exact replacement patch; no such patch was attempted.
