# S22 — The Duplicate Insert That Crashed the Boot (Diagnosis Report)

Evidence sources (read-only, `/app/fixture/`): `boot-crash-log.txt`, `profile-patch-excerpt.txt`,
`web-app-patch-excerpt.txt`, `README.md`. Environment: dsh 0.1.5-alpha.2, Windows 11, npm global,
profile upgraded in place from 0.1.2/0.1.3.

## 1. Root cause

**Which two declarations collide**

Two `insert` rows declare the same loader entry id `workspace-files` with the same package:

1. The web-app bundle's own patch, `packages/bundle/web-app/cordis.patch.yml` in the installed
   0.1.5-alpha.2 tree (rows L110-111):
   `- insert: [{ id: workspace-files, name: '@deepseek-ai/dsh-api-workspace-files' }]`
2. The manually added block at the end of the profile patch
   `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`:
   `- insert: [{ id: workspace-files, name: '@deepseek-ai/dsh-api-workspace-files' }]`
   (added by hand after the 文件资源服务不可用 symptom, with the hedging comment "如果 web-app
   bundle 已包含此行则此条为冗余").

**At which layer the collision is detected**

It fails in the Cordis plugin-loader entry-group merge, during the boot plugin-tree load — before
any plugin package is resolved or started. The stack trace pins the exact chain:

- `TypeError: duplicate loader entry id: workspace-files` thrown by
  `EntryGroup.update` (`@deepseek-ai/cordis-plugin-loader/lib/index.js:91`)
- called from `Include._apply` (`@deepseek-ai/dsh-app-boot/lib/index.js:240`), i.e. while applying
  a loader entry include (`cordis:include`)
- inside `boot` (`dsh-app-boot/lib/index.js:1534`) → surfaced as
  `dsh: plugin tree failed to load: failed to apply loader entry include (cordis:include)`

So the detection point is the loader-entry include application layer: the profile patch is applied
as a `cordis:include` on top of the bundle-provided plugin tree, and the entry group rejects the
second `workspace-files` id at merge time.

**Why the loader refuses the whole boot instead of accepting the later row**

`insert` rows are additive declarations, not upserts, and the entry group requires ids to be
unique. There is no "later row wins" (or first-row-wins) precedence for inserts: silently accepting
or dropping the later row would make the effective plugin tree ambiguous (which instance owns the
id, and in what order) and dependent on patch-file ordering. The loader therefore treats a duplicate
id as a hard configuration error and fails fast, aborting the entire `dsh web` boot, so the
misconfiguration surfaces immediately at boot rather than producing silently shadowed or
non-deterministic wiring at runtime.

## 2. Layering rules (profile patch acting on a bundle-provided plugin)

| Operation | Verdict | Why |
|---|---|---|
| Change the plugin's config by id (config override targeting the existing entry) | Safe | Modifies the existing entry; introduces no new id, so no duplicate-id collision. |
| Insert a row for an id no bundle ships | Safe | Genuinely new entry; this is exactly how the profile's external plugins (`dsh-file-trace`, `dsh-profiles`, the six external client plugins) are wired. |
| Insert a row for an id a bundle already ships | **Fatal** | Second declaration of the same loader entry id → `duplicate loader entry id` → whole boot aborts. |

**The maintainer's action is the fatal case**: a hand-added insert row for `workspace-files`, an id
the bundle already ships.

**Evidence row that proves it**: the web-app bundle patch excerpt's
`- insert: [{ id: workspace-files, name: '@deepseek-ai/dsh-api-workspace-files' }]` (L110-111 of
`packages/bundle/web-app/cordis.patch.yml` in the installed tree) — identical id and package to the
profile's manual block — together with the crash text
`duplicate loader entry id: workspace-files`.

## 3. Fix

**What to change and in which file**: in the profile patch
`C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`, delete the manually added block at the end — the
two comment lines (`# workspace-files: 右侧 Sidebar 文件预览所需的宿主服务…` /
`# 如果 web-app bundle 已包含此行则此条为冗余…`) and the `- insert: [{ id: workspace-files, … }]`
rows. Nothing else changes: the pre-existing `dsh-file-trace` and `dsh-profiles` inserts are ids the
bundle does not ship and must stay. After deletion, the bundle's own L110-111 row provides
`workspace-files`, and the boot succeeds.

**Is the plugin's code at fault?** No. `@deepseek-ai/dsh-api-workspace-files` never even loads —
the `TypeError` is raised by `EntryGroup.update` while merging the patch layers, before any plugin
resolution or startup. The plugin package is identical in both declarations; it is the layering
(profile patch duplicating a bundle-provided id) that is wrong.

**Could any plugin-side change resolve the boot failure?** No. No change to the plugin package — a
different version, a renamed id, different config — can fix a duplicate-id collision introduced
purely by patch layering. The only correct resolution is to remove the duplicate profile-side
declaration; reconfiguring a bundle-provided plugin, if ever needed, is done with a config override
by id (the safe operation), never by re-inserting it.

**Side note on the original symptom**: since the bundle already ships `workspace-files`, the
original 文件资源服务不可用 read failure in the right-Sidebar document tab was not caused by a
missing host service — the maintainer's premise was wrong. After deleting the row, if the content
read still fails, the actual cause must be chased elsewhere (e.g. the bundle-provided plugin's
config or service state after the in-place 0.1.2/0.1.3 → 0.1.5-alpha.2 upgrade) at the config-override
layer, not by re-inserting the plugin.

## 4. Prevention

**Author-side check before hand-adding an insert row**: inspect the installed bundle first — the
web-app bundle's `cordis.patch.yml` in the installed npm tree
(`C:\Users\lhh\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\…\packages\bundle\web-app\cordis.patch.yml`),
e.g. grep the installed tree for the id. A single `grep -R "id: workspace-files"` over the installed
`@deepseek-ai/dsh` tree would have shown L110-111 already providing it, and the upgrade notes say
0.1.5-series bundles carry this row. The maintainer's own comment
("如果 web-app bundle 已包含此行则此条为冗余") shows the doubt existed; the verification was simply
skipped. Rule of thumb: for a plugin listed in the bundle patch, only ever touch it from the profile
patch via a config override by id.

**Host-side boot diagnostics to make this failure actionable**: when `EntryGroup.update` detects a
duplicate id, the error should name both declaration sites and the remedy, e.g.:

```
duplicate loader entry id: workspace-files
  already inserted by: bundle patch <installed-tree>/packages/bundle/web-app/cordis.patch.yml:110
  duplicate declared:  profile patch C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml:<line>
  fix: delete the profile-side insert row; to reconfigure the bundle-provided plugin,
       use a config override on id 'workspace-files' instead of inserting it again.
```

That blames the correct party — the author of the later/duplicate declaration (here, the profile
patch), not the bundle and not the plugin package — and states exactly which file and row to delete.
Optionally, a pre-boot patch lint (or an "effective plugin tree" dump) that warns when a profile
insert id is already shipped by the bundle would catch this before the loader throws and aborts the
boot.
