# S22 · Diagnostic Report — The Duplicate Insert That Crashed the Boot

Mode: plugin-upgrade skill, Mode A (read-only inspection / post-upgrade diagnosis). No fixture file was modified; no installs or migrations were run. Evidence: `boot-crash-log.txt`, `profile-patch-excerpt.txt`, `web-app-patch-excerpt.txt`, `README.md`.

## 1. Root cause

**The two colliding declarations.** The same loader entry id `workspace-files` is inserted twice with the same package name `@deepseek-ai/dsh-api-workspace-files`:

1. **Bundle layer** — `web-app-patch-excerpt.txt` shows the web-app bundle's own `cordis.patch.yml` (`packages/bundle/web-app/cordis.patch.yml` in the installed 0.1.5-alpha.2 npm tree) already contains:
   ```
   - insert:
       - id: workspace-files
         name: '@deepseek-ai/dsh-api-workspace-files'
   ```
2. **Profile layer** — `profile-patch-excerpt.txt` shows the maintainer manually appended to `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`:
   ```
   - insert:
       - id: workspace-files
         name: '@deepseek-ai/dsh-api-workspace-files'
   ```
   with the comment "如果 web-app bundle 已包含此行则此条为冗余；保留以确保升级 profile 不遗漏" — the maintainer even suspected the redundancy but kept the row anyway.

**Where the collision is detected.** The crash stack pinpoints the exact layer: the profile patch is applied as a `cordis:include` loader entry against the already-assembled bundle entry group. `boot-crash-log.txt` shows:

- `Error: dsh: plugin tree failed to load: failed to apply loader entry include (cordis:include): duplicate loader entry id: workspace-files` — thrown at the `dsh-app-boot` boot stage;
- `TypeError: duplicate loader entry id: workspace-files at EntryGroup.update (...\@deepseek-ai/cordis-plugin-loader/lib/index.js:91:28)` — the rejection originates inside Cordis's `cordis-plugin-loader` `EntryGroup.update`, i.e. the loader entry-group layer, during `boot` → `runProfile` → `runCli`.

**Why the loader refuses the whole boot instead of accepting the later row.** Cordis treats a duplicate insert of the same loader entry id as a fatal composition error, not a silent override. Per the plugin-upgrade skill's troubleshooting card (cross-version Cordis composition rule, discussion #5999): "在 profile 的 cordis.patch.yml 里手动 insert 了一个 bundle 层已提供的插件 id——Cordis 把重复 insert 视为致命错误（非静默覆盖）". This is the "misconfiguration fails loud at load" rule: accepting the later row silently would either mask a real configuration mistake or nondeterministically shadow the bundle's row (config, ordering), so the loader fails the entire plugin tree at boot rather than guessing. Note this happens before any plugin code loads — no plugin ever runs.

## 2. Layering rules

For a profile patch acting on a bundle-provided plugin, three cases:

| Operation | Verdict |
|---|---|
| **Change the plugin's config by id** (an override/config row keyed on the existing id) | **Safe.** It amends the existing entry's configuration without introducing a second entry id. |
| **Add an insert row for an id no bundle ships** (a genuinely new plugin, e.g. the profile's own `dsh-file-trace` and `dsh-profiles` rows) | **Safe.** It is a new entry id; nothing collides. This is the legitimate use of profile inserts for external plugins. |
| **Add an insert row for an id a bundle already ships** | **Fatal.** Duplicate loader entry id → `EntryGroup.update` throws and the boot dies. |

**The maintainer's action** is the third, fatal case: a manual `insert` of `workspace-files` in the profile patch while the web-app bundle already ships that exact id. The proving evidence is the `- insert: - id: workspace-files / name: '@deepseek-ai/dsh-api-workspace-files'` block at the end of `profile-patch-excerpt.txt` (`C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`), which duplicates the bundle row shown at L110–111 in `web-app-patch-excerpt.txt`. The adjacent `session-controller` and `settings-controller` bundle rows in the same excerpt show that bundle-provided ids are normally never hand-inserted — `workspace-files` is the sole exception the maintainer added.

## 3. Fix

**Exactly one change, in one file:** delete the entire manual `workspace-files` insert block (the `- insert: - id: workspace-files / name: '@deepseek-ai/dsh-api-workspace-files'` entry plus its two comment lines) from the profile's `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`. The bundle already provides the row with the same package name, so composition is complete once the duplicate is removed; nothing needs to be re-added anywhere. Then restart `dsh web` and verify the right-Sidebar document tab reads file content.

**Is the plugin's own code at fault?** No. `@deepseek-ai/dsh-api-workspace-files` never even gets a chance to load — the failure is a pure composition-layer error in the loader, thrown before any plugin activation. The plugin's code, manifest, and package are irrelevant to this boot failure.

**Could any plugin-side change resolve it?** No. No change inside the plugin (config, source, version, manifest) can fix a duplicate loader entry id; the collision is between two composition declarations, both naming the same package. The only correct resolution is editing the profile composition file. If the original symptom (文件资源服务不可用 in the document tab) persists after the fix, the root cause lies in composition/artifact gaps to be diagnosed separately — per the troubleshooting card, "如插件确实不可用，根因是 compose/artifact 缺口而非缺少 insert" — not in re-adding the insert row.

## 4. Prevention

**Before hand-adding an insert row, check the installed bundle first:**

- Inspect the installed bundle's `cordis.patch.yml` in the npm global tree — in this incident `packages/bundle/web-app/cordis.patch.yml` under `C:/Users/lhh/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/...` — and grep it for the intended id (here, `workspace-files`). The excerpt proves this check costs one read: the bundle row is plainly present at L110–111.
- Check the release/corridor cards for the target version: the plugin-upgrade skill's 0.1.5-alpha.1/alpha.2 references document that the 0.1.5 series newly adds `workspace-files` (and `ui-sidebar-*`) as host-provided rows, "已由 web-app bundle 自动提供，升级 profile 无需手动补插". A newly appearing service after an upgrade should first be assumed bundle-provided.
- Treat the maintainer's own hedge as the trigger: the profile comment ("如果 web-app bundle 已包含此行则此条为冗余") shows doubt — a doubted row must be verified against the bundle before saving, not kept "to be safe"; keeping it is exactly what crashed the boot.

**What the host could print at boot to make this actionable.** The current message (`failed to apply loader entry include (cordis:include): duplicate loader entry id: workspace-files`) names the id but not the sources. An actionable diagnostic would print:

- **Whom to blame:** both declaring layers and their file paths, e.g. `duplicate loader entry id: workspace-files — first declared by bundle "web-app" (...\packages/bundle/web-app/cordis.patch.yml:110), re-declared by profile "web" (C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml:N)`;
- **What to delete:** an explicit remediation hint, e.g. `remove the duplicate insert block from the profile's cordis.patch.yml; the bundle row already provides @deepseek-ai/dsh-api-workspace-files`;
- Optionally, at patch-apply time, a pre-boot warning listing profile insert ids that shadow bundle-shipped ids (before the fatal include), turning a crash into an early, pointed message.

Even with today's terser message, the existing stack (`cordis-plugin-loader` `EntryGroup.update` under `dsh-app-boot` include) plus a grep of the id across `~/.dsh/profiles/*/cordis.patch.yml` and the installed bundle patches resolves blame in minutes — which is what this report did.

## Completed / Skipped / Pending

- **Completed**: read-only inspection of all four fixture files; collision, layer, layering rules, minimal fix, and prevention derived with direct quotes; cross-checked against the plugin-upgrade skill's troubleshooting card (duplicate loader entry, discussion #5999) and 0.1.5-alpha.1/alpha.2 corridor cards.
- **Skipped**: no writes, installs, migrations, or boot executions (read-only task).
- **Pending/residual risk**: whether the original 文件资源服务不可用 symptom disappears after removing the duplicate row is unverified (booting was out of scope); if it persists, diagnose composition/artifact gaps per the skill's runtime-validation layer, not by re-inserting the row.
- **Rollback**: not applicable (no changes made).
