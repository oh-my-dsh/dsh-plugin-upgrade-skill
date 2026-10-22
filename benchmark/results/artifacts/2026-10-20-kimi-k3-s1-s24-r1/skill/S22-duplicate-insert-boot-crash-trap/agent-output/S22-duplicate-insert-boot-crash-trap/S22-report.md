# S22 · The Duplicate Insert That Crashed the Boot — Incident Report

Date of evidence: 2026-09-09 · dsh 0.1.5-alpha.2 (npm global) · Windows 11
Evidence: fixture/boot-crash-log.txt, fixture/profile-patch-excerpt.txt, fixture/web-app-patch-excerpt.txt

## 1. Root cause

**Which two declarations collide:** two `insert` loader entries with the same id `workspace-files`, both resolving to `@deepseek-ai/dsh-api-workspace-files`:

- the **web-app bundle**'s `cordis.patch.yml` (installed npm tree, `packages/bundle/web-app/cordis.patch.yml`, L110–111 — see fixture/web-app-patch-excerpt.txt);
- the **profile**'s `cordis.patch.yml` (`C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`), the trailing manual block the maintainer added (see fixture/profile-patch-excerpt.txt), whose own comment even says "如果 web-app bundle 已包含此行则此条为冗余" — it *was* already included, so the row is not just redundant, it is fatal.

**Where the collision is detected:** at the Cordis **plugin-loader include-application layer**, not in any plugin code. The boot pipeline in `dsh-app-boot` applies each patch layer's include; `Include._apply` hands the row to `EntryGroup.update` in `@deepseek-ai/cordis-plugin-loader`, which throws `TypeError: duplicate loader entry id: workspace-files`. `dsh-app-boot` wraps it as `dsh: plugin tree failed to load: failed to apply loader entry include (cordis:include)` and aborts boot (boot-crash-log.txt stack: `EntryGroup.update` ← `Include._apply` ← `boot` ← `runProfile`).

**Why the loader refuses the whole boot instead of accepting the later row:** loader entry ids are the identity key of the composition tree. Two inserts with the same id are ambiguous — the loader cannot know which config/enabled state should win, and silently overriding would let a profile accidentally (or maliciously) shadow a bundle row with a different package. So `EntryGroup.update` treats a duplicate id as a hard composition error (fail-closed) rather than last-write-wins. Because the tree is invalid, there is nothing safe to boot: the whole `dsh web` boot aborts before any plugin loads. This is deliberate — patching by id is the supported merge operation; *inserting* a duplicate id is not.

## 2. Layering rules

For a **profile patch acting on a bundle-provided plugin**, the three candidate operations rank:

| Operation | Verdict |
|---|---|
| Change the plugin's **config/enabled state by id** (patch/update the existing row) | **Safe** — this is exactly what profile layering is for: the profile adjusts what the bundle declared. |
| Add an `insert` row for an id **no bundle ships** | **Safe** — the profile genuinely extends the composition (like the `dsh-file-trace` / `dsh-profiles` external rows in the same file). |
| Add an `insert` row for an id a **bundle already ships** | **Fatal** — duplicate loader entry id; boot refuses the entire tree. |

**The maintainer's action is the third (fatal) case.** The proving evidence row is the bundle's own excerpt (fixture/web-app-patch-excerpt.txt): `- insert:
    - id: workspace-files
      name: '@deepseek-ai/dsh-api-workspace-files'` already exists in the installed web-app bundle (L110–111), so the identical insert in the profile patch collides with it. Adjacent bundle rows (`session-controller`, `settings-controller`) show the convention: bundle-provided services are never manually re-inserted into the profile patch.

## 3. Fix

**Exact change:** delete the manual `workspace-files` insert block (the trailing "workspace-files: 右侧 Sidebar 文件预览所需的宿主服务" block and its comments) from the **profile** file `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml` — and nothing else. The bundle already provides the row; once the duplicate is removed, boot proceeds with the bundle's declaration.

**File to edit:** only the profile `cordis.patch.yml`. Do not touch the bundle's `cordis.patch.yml` in node_modules (it is correct and would be overwritten on reinstall anyway).

**Is the plugin's own code at fault?** No. `@deepseek-ai/dsh-api-workspace-files` never ran — the crash happens in the loader before any plugin module is imported. **No plugin-side change can resolve this boot failure**: the collision is purely a composition-layer duplicate id; only fixing the profile composition (removing the duplicate row) restores boot. (The original symptom that triggered all this — the right-sidebar document tab's "文件资源服务不可用" — was a runtime service-resolution issue to diagnose separately after boot is restored, not a missing composition row.)

## 4. Prevention

**Before hand-adding a row, the maintainer should:**

- Grep the installed bundle patches for the id first: search the npm-installed tree (`<npm-global>/node_modules/@deepseek-ai/dsh/**/cordis.patch.yml`, notably `packages/bundle/web-app/cordis.patch.yml` and the host bundle) for `id: workspace-files` — or inspect the resolved runtime composition (`--dump-config`-style listing) to see whether the row is already present.
- Distinguish symptoms: "service unavailable at runtime" ≠ "row missing from composition". A bundle-shipped plugin that fails to activate needs runtime diagnosis (dependency resolution, service pending), not a duplicate insert.
- Prefer the patch-by-id/config operation for bundle-provided plugins; reserve `insert` for ids verified absent from every bundle layer. Update or remove stale comments that guess "保留以确保不遗漏" — verify instead of assuming.

**What the host could print at boot to make this actionable:**

- Name **both origins** of the duplicate: `duplicate loader entry id "workspace-files": declared by bundle packages/bundle/web-app/cordis.patch.yml (L110) and again by profile C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`.
- Assign blame and prescribe the fix: `the profile layer duplicates a bundle-provided row; delete the insert for "workspace-files" from <profile>/cordis.patch.yml (the bundle already provides @deepseek-ai/dsh-api-workspace-files)`.
- Distinguish duplicate-id (profile error, fatal) from missing-id (plugin/service absent), and suggest the patch-by-id alternative when the user likely meant to configure rather than insert.

## Summary

One-line root cause: the maintainer hand-inserted a `workspace-files` row into the profile `cordis.patch.yml` that the web-app bundle already ships; the Cordis loader fail-closes on the duplicate entry id and aborts the whole boot. Fix: delete that block from the profile patch — no plugin code change is needed or possible.
