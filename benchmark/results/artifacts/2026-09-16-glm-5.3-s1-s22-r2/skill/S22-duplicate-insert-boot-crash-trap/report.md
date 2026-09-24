# S22 · The Duplicate Insert That Crashed the Boot — Read-Only Analysis

Task: S22-duplicate-insert-boot-crash-trap · Evidence pack: fixture/ (read-only) · Skill: plugin-upgrade (Mode A · inspect)
Environment: dsh 0.1.5-alpha.2, npm global, Windows 11, profile upgraded in place from 0.1.2/0.1.3.

## 1. Root cause

**The two colliding declarations** are two `insert` rows carrying the same loader entry id `workspace-files`:

1. The bundle-provided row in the web-app bundle's `cordis.patch.yml` (npm-installed 0.1.5-alpha.2 tree, shown at L110–111 in `web-app-patch-excerpt.txt`):
   ```yaml
   - insert:
       - id: workspace-files
         name: '@deepseek-ai/dsh-api-workspace-files'
   ```
2. The manually added row at the end of the profile's `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml` (`profile-patch-excerpt.txt`, under the comment claiming "如果 web-app bundle 已包含此行则此条为冗余；保留以确保升级 profile 不遗漏") — byte-for-byte the same id and package name.

**Where the collision is detected:** in the Cordis **plugin-loader layer**, not in the plugin itself and not in profile resolution. The stack in `boot-crash-log.txt` shows the failure path:

`EntryGroup.update` in `@deepseek-ai/cordis-plugin-loader/lib/index.js:91` → `Include._apply` (`dsh-app-boot`, the `cordis:include` loader entry application) → `boot` → `runProfile` → `runCli`.

The error text is `failed to apply loader entry include (cordis:include): duplicate loader entry id: workspace-files`.

**Why the loader refuses the whole boot instead of honoring the later row:** loader entry ids are unique keys of the plugin tree. When the profile patch's include list is merged with the bundle-provided patch, both rows try to register an entry group under the same id, and `EntryGroup.update` throws on the duplicate. The loader has no "last write wins" semantics for inserts — an id names exactly one entry, so a duplicate is a structural contradiction in the tree, not a precedence question. Cordis treats plugin-tree composition as fail-closed: an ambiguous tree cannot be safely activated, so the boot aborts before any plugin (including the unrelated ones) loads. This is the intended behavior — silently dropping one of two rows would hide composition mistakes.

Note the misdiagnosis chain: the original "文件资源服务不可用" symptom on the right-sidebar document tab was attributed to a missing composition row, but the bundle excerpt proves the row was already shipped by the bundle. The insert was both unnecessary (the service was provided) and fatal (duplicate id).

## 2. Layering rules for a profile patch acting on a bundle-provided plugin

For a plugin id the installed bundle already ships:

| Operation | Verdict |
|---|---|
| Change the plugin's **config by id** (e.g. a `config` override keyed to the existing entry id) | **Safe** — it patches an existing entry rather than declaring a new one; no second entry is created. |
| Insert a row for an id **no bundle ships** (a genuinely new plugin, like `dsh-file-trace` or `dsh-profiles` above it) | **Safe** — a fresh unique id; this is exactly what profile `insert` rows are for. |
| Insert a row for an id **a bundle already ships** | **Fatal** — duplicate loader entry id; the whole `dsh web` boot crashes at loader time (`EntryGroup.update`). |

**The maintainer's action is the third case.** The proving evidence pair:

- `web-app-patch-excerpt.txt` (bundle side): the `- id: workspace-files / name: '@deepseek-ai/dsh-api-workspace-files'` insert row is already present in the installed 0.1.5-alpha.2 web-app bundle patch, adjacent to `session-controller` and `settings-controller` — bundle-provided rows that were never manually copied into the profile patch and never crashed.
- `profile-patch-excerpt.txt` (profile side): the manually appended block inserting the identical id `workspace-files` — the second declaration of the same entry id.

The crash log's `duplicate loader entry id: workspace-files` names the colliding id and matches both rows exactly.

## 3. Fix

**Minimal correct change:** delete the manually added workspace-files `insert` block (the three-line `- insert: / - id: workspace-files / name: …` rows, and ideally the misleading comment above it) from **`C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`** — the profile patch file, not any bundle file and not any plugin package. Nothing else changes: the bundle already provides the plugin, so after removal the profile boots and `workspace-files` is active exactly as before the edit.

**Is the plugin's own code at fault?** No. `@deepseek-ai/dsh-api-workspace-files` was never loaded — the crash happens in the loader (`cordis-plugin-loader` / `dsh-app-boot`) while assembling the plugin tree, before any plugin entry activates. The package itself is innocent; the fault is purely a profile-composition error.

**Could any plugin-side change resolve the boot failure?** No. The duplicate-id check runs over composition metadata (id strings in patch files), independent of plugin source, package versions, or plugin behavior. No change to the plugin's code, manifest, or version can make two entries with the same id legal. The only resolution is on the composition side: remove one of the two rows. (If the "文件资源服务不可用" symptom persists after the row is removed, that is a separate runtime issue to diagnose on its own evidence — it was never caused by a missing composition row.)

## 4. Prevention

**Before hand-adding such a row**, the maintainer should inspect the installed bundle's composition to see whether the id is already shipped:

- Read the bundle patch in the installed tree, e.g. `C:\Users\lhh\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\…\packages/bundle/web-app/cordis.patch.yml` (the file `web-app-patch-excerpt.txt` was excerpted from), grepping for the entry id (`workspace-files`) before inserting it.
- Cross-check adjacent bundle-provided rows as a calibration point: `session-controller` and `settings-controller` appear only in the bundle patch, never in the profile patch — a manually duplicated bundle row is the anomaly.
- Equivalently, inspect the resolved runtime composition (the effective plugin list after bundle + profile merge) rather than guessing from a runtime symptom; "service unavailable" in a tab is not evidence that a composition row is missing.
- Treat the profile's own comment as a red flag in hindsight: it literally says "如果 web-app bundle 已包含此行则此条为冗余" ("redundant if the bundle already has it") — the condition was never checked, and "redundant" understated it: the row is not merely redundant, it is boot-fatal.

**What the host could print at boot to make this failure actionable:** the current message — `duplicate loader entry id: workspace-files` deep inside a stack trace — names the id but not the sources or the remedy. An actionable diagnostic would include:

- **Whom to blame**: list both declaring sources with file paths and line numbers, e.g. `duplicate loader entry id 'workspace-files': declared in bundle patch (…/bundle/web-app/cordis.patch.yml:110, applied first) and in profile patch (C:/Users/lhh/.dsh/profiles/web/cordis.patch.yml, applied later)`. The loader knows both origins at merge time; printing them removes the investigation step entirely.
- **What to delete**: a one-line remediation hint, e.g. `the bundle already provides this entry; delete the duplicate insert row from the profile patch to boot`, plus the general rule (bundle-provided ids may have their config patched by id in a profile patch, but must not be re-inserted).
- Optionally, a preflight warning earlier in boot: when applying a profile patch insert whose id already exists in the bundle patch, warn (or fail with the same sourced message) before the plugin tree fails to load, so the maintainer edits one file instead of debugging a stack trace.

## Report structure per the skill

- **pre-existing**: not collected (Mode A read-only inspection of fixture evidence; no baseline suite applies).
- **Completed**: root-cause attribution (duplicate `insert` id `workspace-files` colliding at the Cordis plugin-loader `EntryGroup.update` / `cordis:include` layer), layering-rule classification, minimal fix (delete the profile-patch block), and author/host prevention recommendations; all grounded in the three fixture files.
- **Skipped**: no runtime verification, migration, or installation — the task is read-only analysis of supplied evidence; the fixture was not executed per the brief.
- **Pending/residual risk**: the underlying "文件资源服务不可用" symptom is not diagnosable from this evidence pack (no runtime log for it); if it recurs after the fix, it needs separate evidence.
- **Rollback**: no changes were made anywhere; nothing to roll back. The fixture was never modified.
- **Recommendations**: host-side sourced duplicate-id diagnostics as above; profile-authoring guidance that bundle-provided entries are patched by id (config), never re-inserted.
