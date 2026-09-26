# S22 · The Duplicate Insert That Crashed the Boot (Read-Only Diagnosis)

Mode: A · inspect (read-only diagnosis, per plugin-upgrade skill). No files modified outside the report directory.

## Root cause

**Which two declarations collide.** Both declare loader entry id `workspace-files`:

1. The web-app bundle's own patch, already shipped inside the installed 0.1.5-alpha.2 tree (packages/bundle/web-app/cordis.patch.yml, L110–111 in the installed node_modules tree): `- insert: - id: workspace-files, name: '@deepseek-ai/dsh-api-workspace-files'`.
2. The maintainer's hand-added block at the end of the profile patch C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml: `- insert: - id: workspace-files, name: '@deepseek-ai/dsh-api-workspace-files'` — same id, same package name. Its comment ("如果 web-app bundle 已包含此行则此条为冗余") assumed a duplicate row would be ignored as redundant; that assumption is wrong.

The profile patch overlays the web-app bundle's patch, and composition merges both insert lists into one loader entry group keyed by entry id. Two rows with the same id violate the group's uniqueness invariant.

**Layer where the collision is detected.** The Host loader-config composition layer — Cordis plugin-loader entry-group assembly while applying the include, not an exception from workspace-files plugin logic. The supplied stack does not establish whether unrelated entries had already evaluated. The stack proves it:

- `TypeError: duplicate loader entry id: workspace-files` raised at `EntryGroup.update` (@deepseek-ai/cordis-plugin-loader/lib/index.js:91:28);
- propagating through `Include._apply` (@deepseek-ai/dsh-app-boot/lib/index.js:240:19) — the message names the stage: "failed to apply loader entry include (cordis:include)";
- wrapped by boot ("dsh: plugin tree failed to load", dsh-app-boot:1534) → runProfile → runCli.

It is not a missing-service, pending-injection, or runtime failure; the plugin tree never loads at all.

**Why the loader refuses the whole boot instead of accepting the later row.** EntryGroup.update enforces unique entry ids and treats a duplicate as a composition error, fail-closed at load ("misconfiguration fails loud"). An insert declares a distinct loader entry; it is not a config update or a last-write-wins override. Requiring unique ids keeps later id-targeted patches unambiguous. The trace directly establishes rejection, not a fallback or deduplication policy. So the loader aborts the entire tree at boot instead of degrading — `dsh web` crashes immediately rather than starting with one plugin dropped or overridden.

## Layering rules

| Profile operation | Result and constraint |
|---|---|
| Change an existing bundle-provided plugin's config by id | Safe layering operation: use the supported id-targeted config patch, preserving the bundle-owned entry and unrelated fields. The config must still be valid. Do not insert another row to change config. |
| Insert a new id that no bundle or other composed layer already ships | Legitimate addition, subject to ordinary package resolution, valid configuration, and activation checks; absence from one bundle alone is not proof of uniqueness across the full tree. |
| Insert an id already shipped by a bundle | Fatal duplicate declaration, not a redundant safety net and not an override. |

The maintainer performed the third operation. profile-patch-excerpt.txt ends with an insert for workspace-files; web-app-patch-excerpt.txt explicitly identifies the existing installed bundle row at L110–111 with that same id and package. This proves the collision without inferring service availability from the Sidebar error. The adjacent session-controller and settings-controller entries illustrate other bundle-owned entries that do not need profile reinsertion.

## Fix

In C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml, delete only the final manually added workspace-files insert block and its misleading “redundant; keep to ensure” comment:

```yaml
- insert:
    - id: workspace-files
      name: '@deepseek-ai/dsh-api-workspace-files'
```

(The snippet above is the block to remove, not a replacement to apply.) Leave the bundle-provided workspace-files entry intact and preserve the pre-existing external plugin entries, including dsh-file-trace and dsh-profiles. Do not rename the duplicate id, delete the official bundle row, disable a second duplicate, reinstall packages, or change plugin source as a workaround. Config customization, if needed, belongs in an id-targeted config operation instead.

The plugin's own code is not at fault for this boot failure. No change inside workspace-files or an external Sidebar plugin's implementation can make two identical loader entry ids valid: composition must be corrected before normal plugin activation can complete. The repair is profile configuration, not an API migration.

After the maintainer applies that minimal edit, cold-start dsh web and verify the duplicate-id failure is gone. This is the expected repair for the evidenced boot blocker, not a claim that a restart has been tested or that the original preview error is fixed. If 文件资源服务不可用 persists, separately inspect actual composition, provider activation, installed Host/Client artifacts and service wiring; a declaration's presence proves neither successful activation nor successful content reads.

## Prevention

**Maintainer and plugin-author guidance.** Before hand-inserting a Host service after an upgrade, inspect the actually installed target version's web-app bundle cordis.patch.yml, following its package/bundle declaration to the patch used by that profile. Search narrowly for both the exact loader id workspace-files and package @deepseek-ai/dsh-api-workspace-files, then check the remaining applied layers and read-only resolved composition for an existing row. Do not rely on an old profile's text or a UI error to conclude a row is missing. The installed excerpt already answers the question here. Document bundle ownership and distinguish “update config by id” from “insert a new entry”; do not ship unconditional manual insert instructions for services the target bundle owns.

**Host diagnostic recommendation (not an implemented change).** Retain strict duplicate rejection but preserve declaration provenance and print both source paths/line numbers, layer ownership, id, package, and the concrete remediation. For example:

> Profile composition error: duplicate loader entry id workspace-files. Existing declaration: installed web-app bundle cordis.patch.yml:110–111, package @deepseek-ai/dsh-api-workspace-files. Conflicting declaration: C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml, final manual insert (print the actual line number). Remove that profile insert block; the bundle already supplies this entry. Use an id-targeted config patch to customize it. This is not a workspace-files plugin-code failure.

A preflight composition check could emit this before plugin loading. Avoid blaming the generic include entry, arbitrary external client plugins, or the original Sidebar error; do not silently deduplicate or auto-delete user configuration. Suggested host regression cases: existing-id config customization succeeds, a genuinely unique insert succeeds, and a duplicate insert fails with both origins and the removal hint.

## Validation and skill closeout

- **Pre-existing:** formal build/typecheck/test baseline not collected (Mode A). The fixture reports the earlier Sidebar content-read error; its root cause is not established by these excerpts and must not be conflated with the later duplicate-insert crash.
- **Completed:** read the full task, plugin-upgrade SKILL.md, all four fixture files, and references/troubleshooting.md on demand. The troubleshooting duplicate-loader-id row corroborates this as a cross-version Cordis composition rule with no dedicated version card. Inspected workspace-file-related entries in references/v0.1.5-alpha.2.md only for context; no API migration recommendation follows from them. All four requested analysis areas are covered, and only this report was written.
- **Identity evidence:** incident Host is npm-global @deepseek-ai/dsh 0.1.5-alpha.2 on Windows 11, Node v24.14.1, as recorded in boot-crash-log.txt. The profile originated under 0.1.2/0.1.3; exact predecessor version is unspecified. The row's actual package is @deepseek-ai/dsh-api-workspace-files. No plugin-owned release version, Git SHA, lockfile cohort, complete repository rules/status, or separate source-install identity is supplied; none is invented. This evidence pack is not the affected source checkout.
- **Skipped:** installation, migration, dependency resolution changes, package scripts, version fetches, Git operations and actual boot/behavior tests. The task authorizes read-only evidence analysis, not execution against the profile; no complete runnable profile is supplied. No need to construct a migration corridor, modify a plugin, create a dynamic Cordis extension, or scan unrelated repositories for this deterministic configuration collision.
- **Pending/residual risk:** deletion and restart verification remain for the maintainer. The original document-read symptom may have a separate composition/artifact/activation cause. Once boot works, verify exactly one workspace-files entry, successful provider activation (not pending), and one real document content read through the Sidebar; capture failure stage rather than adding another insert. No successful runtime result is claimed.
- **Rollback:** no fixture or installed-profile changes were made, so this analysis needs no runtime rollback. Before applying the proposed repair, preserve the profile patch as the sole edited file. The evidence records its current final insert and surrounding ownership but is not a full backup or hash of the live patch. Recovery scope is that profile file only; restoring the duplicate would restore the known crash, so do not reintroduce it as an operational fallback. No install scripts ran and no third-party side effects need rollback.
- **Recommendations:** adopt provenance-rich host errors and bundle-ownership guidance described above. Diagnose the original file-read failure only after removing the independently proven boot blocker.

### Evidence paths

Fixture root: E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S22-duplicate-insert-boot-crash-trap/environment/fixture

- boot-crash-log.txt: terminal failure chain, versions and prior symptom.
- profile-patch-excerpt.txt: offending final insert and misleading redundancy comment; real profile path.
- web-app-patch-excerpt.txt: existing installed bundle declaration and source line attribution.
- README.md: evidence provenance and read-only scope.

Methodology: E:/deepseek-harness/dsh-plugin-upgrade-skill/skills/plugin-upgrade/SKILL.md; on-demand corroboration: E:/deepseek-harness/dsh-plugin-upgrade-skill/skills/plugin-upgrade/references/troubleshooting.md. No external sources were contacted.

