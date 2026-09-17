# S22 · The Duplicate Insert That Crashed the Boot — Diagnostic Report

## 1. Root cause

**The two colliding declarations** both insert a plugin row with the same loader entry id `workspace-files`:

1. The **web-app bundle's** `cordis.patch.yml` (installed tree `packages/bundle/web-app/cordis.patch.yml`, rows L110–111 per `web-app-patch-excerpt.txt`):
   ```
   - insert:
       - id: workspace-files
         name: '@deepseek-ai/dsh-api-workspace-files'
   ```
2. The **profile's** manual insert in `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml` (last block of `profile-patch-excerpt.txt`), which declares the identical row — same `id: workspace-files`, same `name: '@deepseek-ai/dsh-api-workspace-files'`.

**Layer where the collision is detected:** the Cordis plugin-loader **entry-include merge**, not the plugin itself. The stack trace in `boot-crash-log.txt` shows:

```
TypeError: duplicate loader entry id: workspace-files
    at EntryGroup.update (...@deepseek-ai/cordis-plugin-loader/lib/index.js:91:28)
    at Include._apply (...@deepseek-ai/dsh-app-boot/lib/index.js:240:19)
    at boot (...@deepseek-ai/dsh-app-boot/lib/index.js:1534:3)
```

`EntryGroup.update` inside `cordis-plugin-loader` throws when `Include._apply` (the `cordis:include` step of the boot loader) tries to merge the profile patch's include entries into the tree that already contains the bundle-shipped row. The error surfaces as `dsh: plugin tree failed to load: failed to apply loader entry include (cordis:include): duplicate loader entry id: workspace-files` — i.e. failure at loader-tree application time, before any plugin code runs.

**Why the whole boot is refused instead of accepting the later row:** entry ids are the identity key of a loader entry group. Once two entries carry the same id, the loader can no longer tell which declaration owns the plugin — silently dropping the later row would hide a real composition error (the user's intent vs. the bundle's provision could diverge in `name`, config, or ordering), and silently accepting it would make profile semantics depend on merge-order luck. The loader therefore fails loud: a duplicate id is a composition-authoring error, so `EntryGroup.update` aborts the include and `boot` propagates the throw, killing the process at startup (Node exits before any service is available).

## 2. Layering rules (profile patch acting on a bundle-provided plugin)

- **Safe — changing the plugin's config by id:** a profile patch may reference an id the bundle ships in order to override/extend that plugin's configuration; this is the documented layering mechanism (profile customizes what a bundle provides).
- **Safe — adding a row for an id no bundle ships:** a genuinely new plugin that the bundle does not provide is a normal profile-side insertion (like the existing `dsh-file-trace` and `dsh-profiles` rows in the profile excerpt, which are external plugins the bundle does not ship).
- **Fatal — adding a row (insert) for an id a bundle already ships:** an `insert` creates a *second* loader entry with that id; the include merge sees two entries with the same id and throws `duplicate loader entry id`. If the bundle already inserts the plugin, the profile must not insert it again.

**The maintainer's case is the fatal one.** The proof is the bundle row in `web-app-patch-excerpt.txt`:

```
- insert:
    - id: workspace-files
      name: '@deepseek-ai/dsh-api-workspace-files'
```

with the excerpt noting it is "already here (L110-111 in the installed tree)" and that adjacent `session-controller` / `settings-controller` rows "are likewise bundle-provided and were never manually inserted into the profile patch". The profile's own comment even anticipated this — "如果 web-app bundle 已包含此行则此条为冗余" — but the row was kept anyway ("保留以确保升级 profile 不遗漏"), which turned the redundant row into the crash.

## 3. Fix

**What to change and where:** delete the entire manual block from the **profile's** `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`:

```
# workspace-files: 右侧 Sidebar 文件预览所需的宿主服务（0.1.5 系列新增）
# 如果 web-app bundle 已包含此行则此条为冗余；保留以确保升级 profile 不遗漏
- insert:
    - id: workspace-files
      name: '@deepseek-ai/dsh-api-workspace-files'
```

The bundle already inserts the plugin, so the profile-side insert is pure duplication; no other edit is needed. Then `dsh web` boots normally with the plugin provided by the web-app bundle.

**Is the plugin's own code at fault?** No. `@deepseek-ai/dsh-api-workspace-files` never loads — the process dies inside `cordis-plugin-loader`'s `EntryGroup.update` during `cordis:include` application, before any plugin module is instantiated. The failure is entirely in composition metadata (two patch files both declaring an insert for one id).

**Could any plugin-side change resolve the boot failure?** No. The crash happens during loader-tree assembly; plugin code, config, or service implementation is irrelevant here. The only resolution is authoring-side: remove one of the two duplicate declarations — concretely, remove the profile-side insert row, since the bundle-side row is the correct, upgrade-managed one.

(Separately, the original symptom that motivated the manual row — "文件资源服务不可用" on the Sidebar document tab — should be diagnosed on its own; 0.1.5-alpha.2 already ships the workspace-files host service via the bundle, so the service was likely present and the failure had another cause. Adding the insert was never the right remedy.)

## 4. Prevention

**Before hand-adding a row, inspect the installed bundle:**

- Search the bundle's `cordis.patch.yml` in the installed npm tree — for this install: `C:/Users/lhh/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-app-boot` … i.e. the `packages/bundle/web-app/cordis.patch.yml` of the installed version — for the target `id` (e.g. grep `workspace-files`). If the id already appears in a bundle-provided `insert` row, never re-insert it in the profile.
- Use sibling bundle rows as the convention check: `session-controller` and `settings-controller` are bundle-provided and were never manually inserted into the profile — a bundle-provided id that suddenly needs a manual row is a red flag, not an omission.
- Prefer upgrading/verifying the bundle version first: after an in-place 0.1.2/0.1.3 → 0.1.5-alpha.2 upgrade, bundle-provided plugin sets grow; the profile patch should only carry ids the bundle genuinely does not ship (like `dsh-file-trace`, `dsh-profiles`).

**What the host could print at boot to make this actionable:** on `duplicate loader entry id: X`, name both sources and the remedy, e.g.:

```
dsh: plugin tree failed to load: duplicate loader entry id: workspace-files
  already inserted by bundle patch: <installed path>/packages/bundle/web-app/cordis.patch.yml:110
  re-inserted by profile patch:     C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml:<line>
  fix: delete the "workspace-files" insert block from the profile patch;
       the web-app bundle already provides it (config overrides may reference the id, inserts may not)
```

That message blames the profile author (whose file to edit), points at the exact file and line to delete, and states the layering rule (override by id is fine, re-insert is not) — turning a fatal stack trace into a one-line fix. The host knows both patch paths at include time (it is applying exactly those two files), so emitting both locations costs nothing extra.
