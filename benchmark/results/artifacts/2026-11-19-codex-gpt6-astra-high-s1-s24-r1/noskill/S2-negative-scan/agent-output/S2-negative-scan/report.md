# S2 read-only migration scan

Target: dsh 0.1.2-alpha.2. Result: one confirmed legacy coupling category, internal service/Remote (#3). Compatibility is NOT established. Six negative category results do not constitute a compatibility verdict.

## Scope and method

Read solver-instruction.md and all five fixture files: index.js, package.json, cordis.patch.yml, README.md, and src/session-notes.js. Enumerated files with rg --files --hidden, read every file with line numbers, and used a cross-file keyword scan as corroboration. Semantic inspection, not keyword counts, determines whether code actually touches a host API. All fixture files were only read. No installation, migration, execution, network access, skills, or external documentation was used. Report files are the only writes.

The fixture explicitly identifies category #3 and asserts that the other six categories have no hits (README.md:3 and index.js:1). It does not supply the names/definitions of those six categories or the change-card catalog. The following table preserves that numbering without fabricating category names. Negative entries are supported by the supplied classification and whole-source inspection; their correspondence to the absent official definitions cannot be independently certified.

## Seven-category result

| Category | Result | Evidence and qualification |
| --- | --- | --- |
| #1 (definition not supplied) | No hit under fixture's classification | README.md:3 identifies #3 as the only category. Full index.js:3-15 contains injection, an effect, a provider request and console logging; no additional host interaction is hidden in its control flow. Exact #1 criteria unavailable. |
| #2 (definition not supplied) | No hit under fixture's classification | README.md:3; package.json:1-19 and cordis.patch.yml:1-3 contain metadata, a patch registration and one dependency. Their presence must not be mistaken for proof that loading or packaging rules are unchanged. Exact #2 criteria unavailable. |
| #3 internal service/Remote | HIT, independently confirmed | index.js:3 injects apiProxy; index.js:9 calls ctx.apiProxy.llm.providers() through a nested dot-domain API; package.json:17 pins @deepseek-ai/dsh-host-apiproxy to 0.0.1-rc.1. index.js:2 describes the code as 0.1.1-rc.2 style. No explicit Remote symbol occurs; this is a hit through the internal-service side of the category. |
| #4 (definition not supplied) | No hit under fixture's classification | README.md:3; index.js:3-15 has no other service call, import, registration or event subscription. Exact #4 criteria unavailable. |
| #5 (definition not supplied) | No hit under fixture's classification | README.md:3; src/session-notes.js:2-9 consists solely of String conversion, trim, replace, slice and array chunking. It has no ctx/session object, host import, state access or persistence. Exact #5 criteria unavailable. |
| #6 (definition not supplied) | No hit under fixture's classification | README.md:3; the entire file inventory contains no separate UI, renderer, command or tool implementation. index.js uses console.error, not a host rendering API. Exact #6 criteria unavailable. |
| #7 (definition not supplied) | No hit under fixture's classification | README.md:3 and full five-file inspection reveal only the coupling described in #3. The utility module has no imports and index.js does not import it. Exact #7 criteria unavailable. |

The word session in a filename or formatSessionNote is not evidence of a session API dependency. The utility's operations manipulate caller-provided strings and arrays only. Conversely, lack of an import in index.js does not erase its coupling: dependency injection and ctx.apiProxy are real runtime host dependencies.

## Change-card mapping and missing evidence

The source provides concrete candidates for mapping, but no specific card IDs, titles, target API signatures or migration corridor documents. Claiming exact IDs or a replacement method would be invented. The required mapping is therefore incomplete for a documented evidence reason, not a finding that no cards apply:

| Confirmed touchpoint | Change-card subject that must be checked | Exact card mapping |
| --- | --- | --- |
| index.js:3, injection of apiProxy | Internal-service injection/export changes and any apiProxy-to-Remote migration | Blocked: catalog absent |
| index.js:9, apiProxy.llm.providers() | Internal service/Remote invocation addressing, provider-list method availability, arguments, asynchronous behavior and result shape | Blocked: catalog absent |
| package.json:17, legacy host-apiproxy dependency | Host service package removal/rename/version alignment associated with that migration | Blocked: catalog absent |

Treat these as three manifestations of the one confirmed category, not three independent categories. Inspect the actual change cards across the complete supported migration corridor from the plugin's stated 0.1.1-rc.2 style to the exact 0.1.2-alpha.2 target. The dependency's own 0.0.1-rc.1 version is not proof of the installed host version. Do not assume a direct upgrade is supported, guess intermediate releases, or assume that all 0.1.2 prereleases have identical contracts.

For every card in that corridor, record applicable/not applicable/unknown with source evidence and its verification requirement. Check cross-cutting loader, bundle patch, dependency, module-format and lifecycle requirements as well as API syntax changes: package.json:5-14, cordis.patch.yml:1-3 and index.js:5-14 are relevant evidence. None can be dismissed merely because a category scan is negative.

## Compatibility judgment

No-hit means no relevant use was identified in the supplied static source under the scanned criteria. It does not prove compatibility. A scan cannot establish the host's target contract, dependency resolution, patch acceptance, service availability, effect lifecycle or runtime results. Indirect dependencies and host configuration are outside this static copy. The confirmed apiProxy dependency itself requires explicit target-release review before any positive compatibility conclusion. The evidence supports neither "roughly compatible" nor a definitive claim that the target rejects this plugin; the target implementation and cards are absent.

The implementation catches provider-request failures and only logs them (index.js:11-12). Therefore a process that starts and remains alive can still represent a failed plugin. Also, a missing injected service may prevent apply from running at all. An absence of a crash or of a failure log is not sufficient success evidence.

## Mandatory post-migration acceptance steps (not executed here)

1. Obtain the authoritative seven-category definitions and full change-card corridor for the exact starting and target releases. Finish exact card mappings, including reasoned negative findings and cross-cutting requirements. Perform any resulting edits in an authorized working copy, not this fixture.
2. Build and typecheck the migrated plugin in its real project against dsh 0.1.2-alpha.2 and the intended dependency versions. This fixture has no scripts or typecheck setup, so no successful build/typecheck can be claimed here. For plain JavaScript, configure the project's supported JavaScript checking or equivalent API validation, and record any limits rather than declaring an absent check passed. Validate module exports, bundle patch and dependency resolution.
3. Cold-boot the exact target with a fresh isolated profile and the migrated plugin. Confirm patch discovery, plugin registration, service injection, apply execution and effect execution; inspect host logs for load/injection/lifecycle errors. Repeat a cold start to exclude inherited profile state.
4. Run a functional smoke test of provider enumeration using a controlled known provider setup. Assert that the request completes, the returned data matches the expected target schema and known providers, and the success path ran. Check error handling separately. Do not count a swallowed exception, an empty unexplained result, a startup-only log or process survival as a pass.
5. Record exact versions, applicable-card disposition and observed build/typecheck, isolated-profile boot and functional results. Only successful completion of these mandatory checks plus resolution of all applicable/unknown cards supports a scoped compatibility verdict.

## Completion limits

Read-only source analysis and report complete. Exact official six-category definitions and change-card mappings remain unavailable within the permitted evidence. Runtime verification is deliberately unperformed because this is a static, non-executable copy with dsh absent; it is a mandatory later step, not a claimed result. No skills were loaded. No fixture files were modified.
