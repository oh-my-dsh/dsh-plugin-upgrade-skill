# S4 — Legacy Web Client migration touchpoints

## Scope and result

Read-only static analysis of the dsh 0.1.1-rc.2-era fixture for migration to dsh 0.1.2-alpha.2. Four legacy touchpoints were found. All four full upgrade-card IDs are explicitly supplied by the fixture's maintainer hints; no additional cards are inferred. This is a migration plan, not an applied or tested migration.

Fixture root: E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S4-legacy-client-imports/environment/fixture

All file/line references below are relative to that root. Every fixture file was read in full: README.md (6 lines), package.json (7 lines), src/client/index.ts (14 lines), and src/client/Pet.tsx (1 line). The task instruction was also read in full before the scan.

## Evidence and certainty

README.md:3 identifies the legacy and target versions and says this fixture contains four breaking touchpoints. README.md:6 names those touchpoints and their full card IDs. This is the available local source for the mappings, not the full upgrade-card documentation or an independently verified target API. The closed-book fixture contains no target declarations, replacement examples, dependency lockfile, tests, or build configuration. Exact replacement APIs not established by these inputs are marked **unconfirmed** below.

## Touchpoint inventory

| Location and evidence | Affected plane | Full upgrade card ID | Collision and migration action |
| --- | --- | --- | --- |
| src/client/index.ts:1 imports `ClientContext` from `@deepseek-ai/dsh-client-runtime/client`; the type is consumed by `apply` at line 9. | Web Client — plugin context typing and package import | DSH-0.1.2-A1-25 | README.md:6 identifies removal of this package/import surface. Remove reliance on that legacy entry point and migrate the `apply` context annotation to the target's supported context type and owning module. Because this is a type-only import, its directly evidenced impact is type/module resolution rather than an emitted runtime import. The exact replacement module and type are **unconfirmed** from the fixture; a guessed package rename is not a verified fix. |
| src/client/index.ts:10 calls `__ModuleLoader__.load('pet-legacy-bundle', ...)`; package.json:2 declares the name `dsh-pet-session-bench`. The loader declaration is at index.ts:5. | Web Client — plugin bundle registration/identity | DSH-0.1.2-A1-26 | README.md:6 flags the registration ID/package-name mismatch. Align the registration ID with the manifest name: use `dsh-pet-session-bench` rather than `pet-legacy-bundle`. Also ensure any eventual generated registration uses that same identity. No generator or bundler configuration is supplied, so those additional consumers cannot be inspected. The actual mismatch and replacement string are directly evidenced. |
| src/client/index.ts:12 destructures flat `nodes` from `useSession()`; line 13 indexes `nodes[0]`. The hook import is at line 2. | Web Client — plugin consumption of the Session UI data model | DSH-0.1.2-A1-27 | README.md:6 identifies the legacy flat `useSession()` `nodes` snapshot as a breaking touchpoint. Migrate the hook result consumption to the target's supported Session/node access API, including rewriting the first-node lookup at line 13. Changing only the import or destructuring would leave a dependent assumption behind. The replacement hook/result fields, node access semantics, and required null/empty handling are **unconfirmed** without target declarations. The fixture does not independently establish that the line-2 import package itself was removed. |
| src/client/index.ts:11 calls `ctx.connection.api.agentPresets.list()` and consumes its promise with `.then(...)`. | Web Client — plugin access to a Host-facing API; no Host implementation is present | DSH-0.1.2-A1-30 | README.md:6 identifies removal of the `ctx.connection.api` face. Replace this access path with the target's supported Web Client mechanism for listing agent presets; update the call and result handling against its actual declaration. The replacement service/access path, method signature, dependency injection requirements, and return type are **unconfirmed**. Do not assume that `ctx.connection`, `agentPresets.list`, or its promise semantics can simply be transplanted to another property. |

## Coverage and non-findings

- package.json:4 marks the fixture private; package.json:6 declares the Web platform. No Host source exists in the four-file fixture. The connection call reaches a Host-facing surface from Client code; that does not establish any needed Host implementation change.
- src/client/index.ts:5 is the declaration associated with the loader use at line 10, not a separately sourced fifth change card.
- src/client/index.ts:7 declares `inject = ['slots', 'conversation']`. Its validity against the target is **unconfirmed**; none of the supplied evidence identifies it as a separate breaking change. New dependencies must be checked when replacement APIs become available.
- src/client/index.ts:3 imports `Pet` from the existing src/client/Pet.tsx:1, which contains only `export function Pet() {}`. No target-version break is evidenced for this relative import or empty component.
- The unused `Pet` import and `first` local are visible source facts, but no compiler configuration establishes an unused-symbol failure, and neither is evidence of a version-specific breaking change.
- The manifest has no dependency declarations to update or dependency versions to validate. The fixture supplies no further consumers, configuration files, or target API evidence.

## Recommended migration sequence and verification limits

1. Obtain authoritative 0.1.2-alpha.2 declarations and full documentation for DSH-0.1.2-A1-25, DSH-0.1.2-A1-26, DSH-0.1.2-A1-27, and DSH-0.1.2-A1-30 when work outside this closed-book analysis is authorized. Resolve the explicitly unconfirmed replacement details before changing source.
2. In a separately authorized implementation task, migrate the context import/type, align the loader registration ID with the manifest, replace the flat Session node read and dependent indexing, and replace the legacy connection API call. Adjust declared plugin dependencies only as required by the verified replacement APIs.
3. In that later task, type-check against the target and verify module registration, supported Session access including an empty Session, and agent-preset retrieval. These are proposed checks, not checks run for this report.

The static scan and four card mappings are complete within the supplied evidence. An exact compile-ready migration remains blocked by missing target API documentation/declarations, not by missing confirmation. No dependencies were installed, no reproduction environment was created, and no source, build, type-check, or runtime execution was attempted. Only read-only file inspection and directory enumeration were used on the fixture. No fixture or benchmark-repository file was modified; the sole output is this report in the designated output directory.
