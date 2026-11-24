# JUDGE BRIEF · noskill.S22-duplicate-insert-boot-crash-trap

## Criteria (sealed rubric)
- [duplicate-loader-attribution] (20pt) Compare profile-patch-excerpt.txt and web-app-patch-excerpt.txt: both insert id workspace-files, and boot-crash-log.txt locates rejection at Cordis EntryGroup.update during include/compose. Duplicate insertion is fatal to this boot rather than silent merge/last-write-wins. Reject the profile comment’s assertion that keeping the duplicate is harmless redundancy.
- [three-layering-cases] (20pt) Distinguish all three requested operations: config override by existing id is allowed; inserting a genuinely new, otherwise unprovided id is allowed; inserting an already bundle-provided id is fatal. Classify the maintainer’s row as the third case and ground it in the two excerpts. Partial credit for a substantively correct but incomplete comparison.
- [minimal-profile-fix] (20pt) Remove only the redundant workspace-files insert block from the profile cordis.patch.yml, preserving the bundle’s original service and unrelated external plugins/config. If configuration needs adjustment, use an override rather than a second insertion. Renaming the extra instance, deleting the bundle’s service, or adding another insert is not the minimal correct fix.
- [plugin-and-failure-boundary] (20pt) Explain that this boot crash is a profile composition error before plugin execution, so changing the external plugin code cannot resolve the duplicate id. Removing the duplicate restores the possibility of boot; it does not establish that the earlier resource-metadata read failure has been cured. Keep that separate problem subject to verification.
- [author-and-host-prevention] (20pt) Before inserting, inspect/grep the installed web-app bundle’s cordis.patch.yml (and other composing bundles) for the id and distinguish override from insert. Propose a host diagnostic naming workspace-files and both declaration origins, pointing to removal of the redundant profile block. “Check for duplicates” alone without where/how or an actionable host message is incomplete.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [retain-or-add-duplicate] ceiling=20 The final advice keeps/adds the duplicate as harmless redundancy, asserts duplicate inserts silently merge, or tries to cure this boot failure by editing the external plugin instead of correcting the profile composition. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.

## Candidate report(s)
#### FILE: S22-duplicate-insert-boot-crash-trap/report.md

# S22: Duplicate workspace-files declaration prevents boot

## Root cause and evidence

The profile's `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml` manually inserts loader entry `workspace-files` with plugin name `@deepseek-ai/dsh-api-workspace-files` (the final block in `profile-patch-excerpt.txt`). The installed 0.1.5-alpha.2 web-app bundle already inserts the same id and plugin name in its `cordis.patch.yml` (`web-app-patch-excerpt.txt`, identified there as installed-tree lines 110–111). These are two declarations of one loader entry id in the composed tree, not two independent service instances.

`boot-crash-log.txt` identifies the detection point as `EntryGroup.update` in `@deepseek-ai/cordis-plugin-loader/lib/index.js:91:28`, called by `Include._apply` in `dsh-app-boot/lib/index.js:240:19`. The failure occurs while applying the `include (cordis:include)` loader entry and constructing/updating the plugin tree; boot then propagates it as `plugin tree failed to load` through `boot`, `runProfile`, and `runCli`.

An insert declares a new entry whose id must be unique in that composed loader group. It is not a configuration override, an upsert, or a last-row-wins operation. The duplicate violates that invariant, so the loader rejects the tree update and boot fails instead of silently replacing or accepting the later declaration. The profile comment suggesting that retaining a redundant row is safe is contradicted directly by this exception.

## Safe profile layering

| Profile operation | Result |
| --- | --- |
| Change the configuration of an existing bundle-provided entry by its id, using the supported patch/update operation | Safe layering operation: retains the one declaration and adjusts its configuration; configuration must still be valid. |
| Insert an entry whose id is not shipped by any included bundle and is otherwise unused in the composed group | Appropriate for adding a genuinely new plugin, subject to normal plugin/configuration validity. |
| Insert an entry whose id is already provided by an included bundle | Fatal duplicate declaration in this composition; it cannot serve as a fallback or override. |

The maintainer performed the third operation. The decisive evidence is the web-app bundle's `- insert:` row with `id: workspace-files`, matching the manually appended profile insert exactly. The excerpts do not establish the concrete syntax for a configuration-update operation, so this report does not invent one.

## Minimal correction

Remove the entire manually appended workspace-files insert block from `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`, including its misleading redundancy/fallback comment:

```yaml
- insert:
    - id: workspace-files
      name: '@deepseek-ai/dsh-api-workspace-files'
```

Keep the installed web-app bundle's existing declaration. Preserve unrelated profile inserts such as dsh-file-trace and dsh-profiles. If a configuration change is actually required later, target the existing workspace-files entry by id with the supported configuration patch operation instead of declaring it again.

The demonstrated boot failure is a profile composition error, not a defect in the workspace-files plugin's implementation. No change inside that plugin can resolve the duplicate loader id: the conflicting declaration must be removed or the composition otherwise corrected at the loader/patch layer. Renaming the extra entry merely to bypass uniqueness would also fail to address the unnecessary second service declaration.

After the maintainer applies this correction, rerun `dsh web` to check that tree loading succeeds and then separately retest the Sidebar content read. Removing the duplicate resolves the evidenced duplicate-id blocker; the evidence does not prove it fixes the earlier `文件资源服务不可用` error. The original read failure predates the manual insert and remains undiagnosed here. Its presence alone does not prove that the bundle lacks a service declaration, nor does a declaration alone prove runtime service availability.

## Prevention

Before inserting a host-service row into an upgraded profile, inspect the actual installed version's web-app bundle `cordis.patch.yml` and any included bundle declarations for the proposed id. For this incident, the relevant installed bundle evidence is `packages/bundle/web-app/cordis.patch.yml`, lines 110–111. Compare its workspace-files declaration against the profile patch. Verify ids in the composition rather than assuming that an old profile needs to copy a newly bundled entry. Profile authors should document that bundle-provided services are configured by id and must not be reinserted as an upgrade fallback.

The host could retain source provenance for each loader entry and report both conflicting declarations, with actual file paths and line numbers, for example:

> Duplicate loader entry id `workspace-files` while applying `cordis:include`. Already declared by the installed web-app bundle (`cordis.patch.yml`, lines 110–111; `@deepseek-ai/dsh-api-workspace-files`). Declared again by the profile (`C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`, actual source line). Remove the profile's workspace-files insert block. To customize this service, patch the existing entry's configuration by id. This is a composition conflict, not a workspace-files plugin runtime error.

This would attribute the extra declaration to the profile edit, identify which block to delete, and spare maintainers from debugging plugin code for a loader error. A composition preflight could detect the same duplicate before boot attempts to apply the tree.

## Scope and evidence limits

Read-only analysis used only the supplied solver instruction and four fixture files. No skill was read or used. No fixture files were modified; no installations, migrations, network calls, application boots, or runtime tests were performed. Installed source code and the full effective profile were not supplied or inspected, so conclusions are limited to the excerpts and stack trace. The report provides a correction for the demonstrated boot crash, not a verified repair of the preceding Sidebar read failure. No blocker prevented completion of this report.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.