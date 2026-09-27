# S22 — Duplicate insert boot failure

## Conclusion

The boot crash is a profile composition error: the manual profile patch inserts a second loader entry with id `workspace-files`, which the installed web-app bundle already supplies. Remove the manual insert from C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml. Keep the bundle declaration. The workspace-files plugin implementation is not responsible for this duplicate-id failure.

## Evidence and root cause

The read-only evidence directory is E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S22-duplicate-insert-boot-crash-trap/environment/fixture.

- profile-patch-excerpt.txt identifies the affected profile file and ends with an `insert` declaring `id: workspace-files` and `name: '@deepseek-ai/dsh-api-workspace-files'`.
- web-app-patch-excerpt.txt shows the same id and package name in the npm-installed 0.1.5-alpha.2 web-app bundle patch, packages/bundle/web-app/cordis.patch.yml; it explicitly identifies installed-tree lines 110–111. This is the decisive evidence that the profile is not filling a missing bundle declaration.
- boot-crash-log.txt reports `duplicate loader entry id: workspace-files`. Its stack locates detection in `EntryGroup.update` in @deepseek-ai/cordis-plugin-loader/lib/index.js:91:28, called by `Include._apply` in @deepseek-ai/dsh-app-boot/lib/index.js:240:19. Boot wraps that error as `plugin tree failed to load: failed to apply loader entry include (cordis:include)`.

The collision is therefore at the Cordis loader entry-group/tree assembly layer, while the include applies the composed entry list—not at workspace-files service registration, the Sidebar UI, or a plugin handler. An insert appends a declaration; it is neither an upsert nor a last-writer-wins override. Loader entry ids must be unique in this group. Accepting the later declaration would silently change the meaning of entry identity and id-targeted configuration. Rejecting the invalid group makes the startup failure explicit rather than starting an ambiguous or partial application.

Supplemental read-only inspection of the locally installed loader's src/config/group.ts confirms a duplicate-id scan in EntryGroup.update before entry creation. Its app-boot/lib/index.js shows inserts appending rows and non-insert patches targeting existing rows by id. These local files are supporting implementation observations, not a claim that their current line numbers or build version match the historical crash; the incident attribution above comes from the supplied fixture.

## Safe layering operations

| Profile operation | Result |
|---|---|
| Target the bundle-provided id and change its config using a non-insert patch | Correct layering operation, provided the id exists and the resulting config is valid. This modifies the existing entry rather than adding another. |
| Insert a genuinely new id not shipped by any active bundle and not otherwise present in the composed entries | Valid way to add a plugin, subject to normal package/config requirements. Check all active layers, not only one bundle. |
| Insert an id already supplied by an active bundle | Fatal duplicate loader entry in this composition; matching package names do not make it harmless. |

The maintainer performed the third operation. The bundle's `workspace-files` row proves it. The profile comment claiming the row is merely redundant if already included, and should be retained to ensure upgrade coverage, is incorrect: redundancy here invalidates boot.

## Minimal fix

Delete the entire manually added block below, including its misleading explanatory comments, from C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml:

```yaml
- insert:
    - id: workspace-files
      name: '@deepseek-ai/dsh-api-workspace-files'
```

Leave unrelated external-plugin inserts and the installed bundle patch unchanged. If customization is actually needed, use a non-insert patch targeting `workspace-files` with the desired supported config; no customization is established as necessary by this evidence.

Do not rename the duplicate, patch the loader to filter duplicates, change workspace-files to tolerate repeated initialization, or delete the bundle's declaration. Plugin-side code cannot repair a duplicate rejected before this group's plugin initialization. The fix belongs to the profile patch.

After applying that change outside this read-only task, restart the same profile and verify that the duplicate-id startup error is gone. Then test the Sidebar document read separately. The earlier 文件资源服务不可用 symptom motivated the mistaken insert, but this evidence does not establish its root cause or prove that removing the insert fixes it. A bundle declaration demonstrates intended composition, not successful service availability in the earlier run.

## Prevention

Before manually inserting a host plugin, inspect the actual installed version's web-app cordis.patch.yml and the other active bundle/profile layers for its loader id and package name. Do not infer absence from an older profile's age or a client-side service-unavailable message. Bundle authors should document owned ids and tell profile authors to customize existing entries by id rather than copying bundle inserts.

The host could preserve patch provenance and validate duplicates during composition, printing an actionable diagnostic such as:

```text
Duplicate loader entry id: workspace-files
Existing declaration: installed web-app bundle cordis.patch.yml:110–111
Conflicting declaration: C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml
Both declare: @deepseek-ai/dsh-api-workspace-files
The profile inserts an id already supplied by the bundle.
Delete the profile's workspace-files insert block. To customize it, patch config by id without insert.
```

The diagnostic should include resolved paths and exact source locations for both declarations when available. It should attribute this incident to the redundant profile insert, not the workspace-files plugin, and preserve fail-loud behavior rather than silently choosing a winner.

## Execution and limits

Read the task instruction and all four fixture files in full; inspected supporting local loader code read-only. No migrations, installations, boot runs, source changes, external services, or fixture changes were performed. Only this report was written. Diagnosis is complete from the evidence; runtime recovery and the original Sidebar problem remain unverified.
