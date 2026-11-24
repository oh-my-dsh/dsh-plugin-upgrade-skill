# S22 — Duplicate insert boot crash diagnosis

Mode A: read-only inspection using plugin-upgrade/SKILL.md and its references/troubleshooting.md duplicate-loader row. The scope is the supplied evidence pack; BENCHMARK-AUTH-v1 authorizes this report. Plan completed: compare declarations, identify the failing layer, prescribe the minimal profile correction, and provide prevention guidance. No fixture, installation, or configuration was modified.

## Root cause

Two `insert` declarations create the same loader-entry id `workspace-files`, both with package name `@deepseek-ai/dsh-api-workspace-files`:

- The installed 0.1.5-alpha.2 web-app bundle already declares the row in `packages/bundle/web-app/cordis.patch.yml`, installed-tree lines 110–111, as recorded in `fixture/web-app-patch-excerpt.txt`.
- The maintainer adds the same row at the end of `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`, recorded in `fixture/profile-patch-excerpt.txt`. The comment claiming it is harmless redundancy to retain for upgraded profiles is wrong.

The crash is a Cordis loader composition failure, not a document-rendering or file-read exception. `fixture/boot-crash-log.txt` identifies `EntryGroup.update` in `@deepseek-ai/cordis-plugin-loader/lib/index.js:91:28` throwing `TypeError: duplicate loader entry id: workspace-files`, called by `Include._apply` in `dsh-app-boot/lib/index.js:240:19`. Applying the loader's `include (cordis:include)` entry fails, and app boot wraps it as `plugin tree failed to load` at index.js:1545. Thus the uniqueness check occurs while constructing/updating the loader entry group from the composed includes, before successful boot and normal plugin operation.

`insert` creates a new entry; it is not an override or an idempotent “ensure present” operation. Entry ids must be unique in the composed group. Equal package names or identical rows do not relax that invariant. The loader throws rather than selecting the later row, so the failed include prevents the entire plugin tree from loading. A later configuration override is a different operation with different semantics.

## Layering rules

| Profile action | Result |
| --- | --- |
| Target a bundle-provided entry by its existing id and change its configuration through the supported config patch operation | Safe composition pattern, subject to valid plugin configuration; preserves one entry |
| Insert a genuinely new id that no bundle or other composed layer already supplies | Valid additive pattern, subject to package resolution and activation requirements |
| Insert an id already supplied by a bundle | Fatal duplicate-entry collision, not a silent override |

The maintainer chose the third case. The decisive evidence is the installed bundle's `id: workspace-files` / `name: '@deepseek-ai/dsh-api-workspace-files'` row at lines 110–111, paired with the identical id in the manual profile insert. The adjacent session-controller and settings-controller rows further illustrate that the web-app bundle supplies host-service entries itself.

## Exact minimal fix

In `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`, delete the manually added final block below and its misleading explanatory comments:

```yaml
- insert:
    - id: workspace-files
      name: '@deepseek-ai/dsh-api-workspace-files'
```

Preserve the other profile entries, including dsh-file-trace and dsh-profiles. Preserve the bundle's original workspace-files declaration. If configuration changes are actually required, target the existing id using the supported configuration patch operation; do not recreate the entry. Renaming the extra entry to evade the check is not the fix: it would attempt to mount another provider.

The plugin's own code is not at fault for this boot failure. The offending ownership boundary is the profile composition override. Changing the plugin's service implementation, Remote interface, document renderer, or client code cannot repair an invalid loader entry group; the duplicate profile declaration must be removed. No host code change is necessary for recovery.

After applying that correction outside this read-only task, cold-start `dsh web` and verify the duplicate error is absent and the composed tree has one workspace-files entry. Then verify service activation and exercise a document content read. Removing the duplicate fixes this diagnosed boot obstruction; it does not prove the earlier “文件资源服务不可用” symptom is resolved. The excerpts show the service is declared, not that its runtime activation, Remote exposure, or client artifact composition was healthy before the manual edit. Investigate those separately if the original symptom returns. The alpha.2 file-surface card DSH-0.1.5-A2-01 supplies relevant scope/Remote context, but these excerpts do not establish a particular API bug.

## Prevention

Before inserting a missing-looking service, inspect the actual installed version's web-app bundle `cordis.patch.yml` and every active bundle/profile layer for the id and package name. Inspect the resolved composition when available, without writing that resolved object back as configuration. Distinguish “declared” from “active”: a visible tab with failed reads is not evidence that another insert is needed. Check activation/dependency failures and the installed host/client artifact roster before prescribing new composition entries. Plugin authors and profile maintainers should document bundle-owned ids and use targeted config overrides for them.

The host could retain patch provenance and print an actionable diagnostic such as:

```text
Profile composition error: duplicate loader entry id "workspace-files".
Existing declaration: installed web-app bundle cordis.patch.yml:110–111
  package: @deepseek-ai/dsh-api-workspace-files
Conflicting declaration: C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml
  operation: insert (manual final block)
Remove the profile's workspace-files insert block; keep the bundle declaration.
To change settings, patch the existing entry's config by id.
This is a profile composition conflict, not a plugin implementation failure.
```

Actual diagnostics should include both resolved absolute source filenames and exact line numbers, bundle/package versions, and layer order. The profile excerpt does not establish its original absolute line number, so none is invented here. A preflight duplicate-id check could surface this before applying the include while preserving the loader's strict uniqueness rule.

## Validation and status

- **Pre-existing:** Mode C baseline not collected. The supplied history records the earlier document-read failure before the manual insert; its underlying cause is not established by this evidence.
- **Completed:** Read all four fixture files, correlated identical ids/packages with the loader stack, and checked the skill's cross-version Cordis composition troubleshooting rule. Evidence identifies npm-global DSH 0.1.5-alpha.2 on Windows 11 / Node.js v24.14.1, upgraded from the 0.1.2/0.1.3 era.
- **Skipped:** Installs, migration, source edits, builds, runtime boot and tests are outside this read-only evidence task. No evaluator, reference answer, or network source was used. No migration script is necessary to compare these two declarations.
- **Pending/residual risk:** Runtime recovery and the original file-read failure require subsequent validation on the real installation. Exact source SHA and live dependency/activation state are not provided. These do not block the composition diagnosis.
- **Rollback:** No changes to the fixture or installation need rollback. For a later real correction, retain a copy of the profile patch and remove only the identified manual block; restoring that block would restore the known collision.
- **Recommendations:** Add provenance-rich host diagnostics and document config-by-id versus insert semantics. No plugin-side migration is indicated by this boot error.

Blockers: none for this read-only report.
