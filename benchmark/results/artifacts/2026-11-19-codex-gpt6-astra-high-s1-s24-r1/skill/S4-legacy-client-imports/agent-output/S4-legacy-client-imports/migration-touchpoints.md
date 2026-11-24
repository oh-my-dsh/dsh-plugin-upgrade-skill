# Migration touchpoint report: dsh-pet-session-bench

## Completed: read-only assessment

Target corridor: **dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.1 → dsh-v0.1.2-alpha.2**, following the `from`/`to` metadata in the supplied `skills/plugin-upgrade/references/README.md`. Four distinct breaking touchpoints were found, all in the **Web Client plane**. No migration was applied.

All fixture locations below are relative to `fixture/`. All reference locations are relative to `skills/plugin-upgrade/references/` in this cell. The supplied references are the evidence base; their upstream links were not fetched, and no target installation was available for independent verification.

Source identity: static copied plugin, `dsh-pet-session-bench`, plugin version `0.1.0`, private ESM package, `dsh.client.platform: web` (`package.json:2–6`). The source-era and intended target are supplied by the task, not inferred from plugin SemVer. No dependencies, peers, lockfile, package-manager declaration, build scripts, profile composition, standard plugin manifest, Git metadata, or repository rule files are present within this fixture. Resolved DSH version, runtime installation identity, Node version, Git SHA/branch/dirty state and target module composition are **unconfirmed**; no enclosing repository was inspected.

The complete supplied fixture was inspected: `package.json`, `README.md`, `src/client/index.ts`, and `src/client/Pet.tsx`.

## Required migration touchpoints

| File and line | Plane | Full upgrade card | Evidence and failure | Migration action |
|---|---|---|---|---|
| `src/client/index.ts:1`, used by `apply` at line 9 | Web Client; plugin type/dependency surface | **DSH-0.1.2-A1-25** | Type-only `ClientContext` import from `@deepseek-ai/dsh-client-runtime/client`. The aggregation package was removed in alpha.1 and remains absent at alpha.2; type-only imports still need resolvable declarations. | Use `import type { Context as ClientContext } from '@deepseek-ai/cordis'`. Bring in the actual consumed client facets through their owning packages' type augmentations and direct dependencies. Do not merely rename the type while retaining the removed module path. Audit manifest/lockfile occurrences when migrating the full repository; this fixture has no runtime-package dependency or inject entry to remove. Sources: `v0.1.2-alpha.1.md`, DSH-0.1.2-A1-25; `api-migration-0.1.2-alpha.2.md`, API-10. |
| `src/client/index.ts:10`; declaration at line 5; authoritative name `package.json:2` | Web Client registration, coupled to Host boot-manifest identity | **DSH-0.1.2-A1-26** | `__ModuleLoader__.load('pet-legacy-bundle', ...)` registers a different ID from `dsh-pet-session-bench`. Target entry/module/registration identity is the package name; mismatch can produce `loaded without registering` or missing activation. | Align the emitted registration ID to **`dsh-pet-session-bench`**, and align any actual build banner/PLUGIN_ID, assembly row package name, and boot entry to that same name. Do not rename the package to the obsolete bundle ID. No build configuration or assembly row is supplied, so those locations remain unconfirmed. The hand-written loader declaration at line 5 is not proof of the target loader signature; use the target bundler/module registration contract when implementing. Source: `v0.1.2-alpha.1.md`, DSH-0.1.2-A1-26. |
| `src/client/index.ts:2,12–13` | Web Client session/chat projection | **DSH-0.1.2-A1-27**; related **DSH-0.1.2-A1-03** | Imported `useSession`, `const { nodes } = useSession()`, then `nodes[0]`. Session lifecycle snapshots no longer provide the old flat transcript array. Changing only the import does not fix indexed access: alpha.2 chat nodes are keyed. | For this chat-node consumer, migrate to the owning chat selector (`ctx.useChat`) and read ordered IDs through `chat.order`, then `chat.nodes.get(id)`, handling missing chat and IDs. Keep lifecycle reads on their proper Session surface if needed. For durable historical event content instead, use `sessions.binding(id)` and `binding.eventSource.getSnapshot().entries`; return safely for a missing binding. Sources: `v0.1.2-alpha.1.md`, DSH-0.1.2-A1-27 and DSH-0.1.2-A1-03; exact alpha.2 keyed-store recipe in `api-migration-0.1.2-alpha.2.md`, API-10. |
| `src/client/index.ts:11`; service injection review at line 7 | Web Client Remote consumer, calling Host-owned functionality | **DSH-0.1.2-A1-30**; supporting **DSH-0.1.2-A1-01** | `ctx.connection.api.agentPresets.list()` uses the removed `connection.api` mirror; accessing it can throw before the promise callback. | Move the preset consumer to the generated target Client Remote projection, with explicit `remote` and the consumed namespace injection (the documented namespace is `remote.agentPresets`) and owning type composition from `@deepseek-ai/dsh-api-remotes/client`. Verify the precise preset-list method and arguments against the target generated declarations before implementing. The supplied consumer ledger documents `agentPresets.read/copy/deletePreset`, but does not establish the exact replacement signature for this zero-argument `list()` call: **that signature is unconfirmed**, so no guessed call is offered. Sources: `v0.1.2-alpha.1.md`, DSH-0.1.2-A1-30/DSH-0.1.2-A1-01; `api-migration-0.1.2-alpha.2.md`, API-01. |

For the last row, handle any successor unary call as `RemoteResult<T>`: branch on `result.ok` and consume `result.value` only on success. Alpha.2 changes errors to `RemoteError` and namespaces error codes; it does **not** introduce the result wrapper for the first time. Preserve code/details, handle cancellation separately, and do not automatically retry unknown/internal failures. This is migration guidance under **DSH-0.1.2-A2-02** and API-02, not a fifth observed old error-handler hit: the fixture callback body is empty. Do not add custom transcript routes from DSH-0.1.2-A1-30: this source lists presets and has no subagent transcript consumer.

A supported alpha.2 chat read shape, for use in the appropriate client hook/render context when implementing, is:

```ts
ctx.useChat(chat => {
  if (!chat) return undefined
  for (const id of chat.order) {
    const node = chat.nodes.get(id)
    if (node) return node
  }
  return undefined
})
```

This preserves the intent of reading the first available ordered node without assuming `nodes` is an array. API-10 supplies the keyed-store contract; the complete hook lifecycle integration is not executable or verified in this fixture. Do not move React-style hook execution into arbitrary plugin initialization merely to match this sketch.

## Packaging and composition follow-through

`package.json:6` already declares a Web Client face. `src/client/index.ts:7` declares service-level `['slots', 'conversation']`; it is distinct from package-level `dsh.client.inject`. The supplied package has neither dependency declarations nor package-level inject edges, so no resolved graph can be certified.

When implementing, declare the type owners actually consumed, recompute runtime module edges from real use, and keep the resolved DSH cohort at the target version. Do not inject every package with a type-only import: erased imports cannot activate services. The renderer owns the slots declarations/service, while chat and Remote have their own owning packages. Actual runtime provider activation must be checked independently. These are follow-through checks, not proof that every absent manifest field is a new regression. Sources: **DSH-0.1.2-A1-25**, **DSH-0.1.2-A2-03**, API-10, `precision-checklist.md`, and `rollup-0.1.2.md` **R-01**. Registry availability is unconfirmed; no unpublished-package fallback is justified or attempted here.

## Scan coverage and skipped items

| Touchpoint class | Result in the complete fixture |
|---|---|
| #1 Source/monkey patches | No patches or host-internal source replacements. |
| #2 Events/persistence | No event producers, subscriptions, persistence, or event-envelope fields. |
| #3 Services/Remote | Hits: removed Context aggregation, session-content read, removed connection API. |
| #4 Host filesystem | No filesystem APIs, host-home paths, or workspace directory access. |
| #5 UI/commands/tools | Hits: runtime import, module registration, session/chat selector. No command execution, tool registration, MarkdownText, or workspace navigation. |
| #6 Custom channels/DOM/CSS | No custom HTTP/WS/RPC routes, fetch calls, composer DOM manipulation, CSS injection, or auth bypass. |
| #7 Subprocess/output | No subprocesses, launcher wrappers, or output parsing. |

`Pet.tsx:1` is only `export function Pet() {}`; it introduces no additional known corridor hit. Its empty body and the unused imports/locals are fixture limitations, not attributed migration regressions. No locale strings or settings namespace helper exist. No inventory consumer, `$host` facts, pi-ai import, or individually composed tool packages exist.

The corridor's temporary `ignorable` removal is restored in alpha.2 (**DSH-0.1.2-A1-02 → DSH-0.1.2-A2-01**), and is a non-hit here in either case. Optional capability cards do not require adoption. Later-version cards are outside this corridor. Sources for scan classification: `pre-flight.md`; negative evidence: all four supplied fixture files.

## Validation, residual risk, and rollback

**Pre-existing failures: not collected.** No build, typecheck, test, package script, install, reproduction environment, real host, or network operation was run. The task expressly calls for a static, non-executable review. Per `rollup-0.1.2.md` **R-06**, no baseline exemption list or claim of migration-induced compiler diagnostics can be established without a baseline; quoted symptoms above come from supplied cards, not observed execution.

The requested report is complete. Remaining implementation uncertainties are the exact preset-list generated signature, real target exports and module registration call shape, dependency resolution, and runtime activation/mount. The cards are curated rather than a full API diff, so this is coverage of known changes visible in the provided copy, not a claim of total runtime compatibility.

Future validation, outside this task: establish the old-cohort baseline; verify target-owned declarations (including one diagnostic typecheck with `skipLibCheck: false`); check empty/missing/keyed chat entries and preset-list success/failure/cancellation; verify identity consistency in the actual built bundle. Then use a real authorized Web profile to redeem the token URL, inspect `__DSH_BOOT__.entries`, fetch the advertised artifact, and prove registration plus UI/core behavior. HTTP 200 alone is insufficient. Sources: API-10, **DSH-0.1.2-A1-26**, **DSH-0.1.2-A1-19**, **DSH-0.1.2-A1-08**, and **DSH-0.1.2-A2-02**. These steps were not executed or provisioned.

Rollback: no fixture changes were made, so no source rollback is needed. Only this report was written under the explicitly designated output directory. No Git operations or restoration of unrelated paths were attempted.
