# S22 · The Duplicate Insert That Crashed the Boot — Report

Task: read-only diagnosis of a `dsh web` boot crash after a manual `workspace-files` insert was added to a profile patch on dsh 0.1.5-alpha.2 (upgraded in place from 0.1.2/0.1.3, Windows, npm global install).

Evidence used (all read-only, fixture unchanged):

- fixture\boot-crash-log.txt — full crash output
- fixture\profile-patch-excerpt.txt — profile cordis.patch.yml with the manual insert
- fixture\web-app-patch-excerpt.txt — web-app bundle cordis.patch.yml already shipping the row
- fixture\README.md — evidence-pack index

## 1. Root cause

**The two colliding declarations** are two `- insert:` rows carrying the same loader entry id `workspace-files`, both resolving to `name: '@deepseek-ai/dsh-api-workspace-files'`:

1. the **web-app bundle's** `cordis.patch.yml` (in the npm-installed 0.1.5-alpha.2 tree, `packages/bundle/web-app/cordis.patch.yml`, shown at L110–111 of web-app-patch-excerpt.txt);
2. the **profile's** `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`, where the maintainer manually appended an identical insert block (profile-patch-excerpt.txt, last block, under the comment claiming it is "冗余" but kept "to be safe").

**Where the collision is detected**: at the Cordis **plugin-loader entry-tree layer**, not in plugin code. The stack trace shows the failure path: `EntryGroup.update` in `@deepseek-ai/cordis-plugin-loader/lib/index.js:91` raises `TypeError: duplicate loader entry id: workspace-files` while `Include._apply` (`dsh-app-boot`) applies the profile patch's `cordis:include` operation onto the entry group already populated from the bundle patch. `boot` → `runProfile` → `runCli` then surfaces it as `dsh: plugin tree failed to load`.

**Why the loader refuses the whole boot instead of taking the later row**: entry ids are the unique addressing keys of the loader entry tree — config overlays, later patch operations, and runtime composition all address entries by id, so an id must be single-valued. Two inserts with one id would make "which entry does a config-by-id patch apply to" ambiguous. The loader therefore enforces id uniqueness as a fail-closed invariant: it throws before any plugin is instantiated, aborting boot entirely. This is deliberate misconfiguration-fails-loud behavior (the "misconfiguration fails loud at load" rule), not a crash bug: the error occurs during composition, prior to any plugin code executing. Accepting the "later row" would silently mask which declaration owns the entry and invite config drifting onto the wrong instance.

Note also that the maintainer's premise was wrong: the original symptom (right-sidebar document tab opens, content read fails with 文件资源服务不可用) was **not** evidence that `workspace-files` was missing from the composition — the 0.1.5-alpha.2 bundle already ships the row. That symptom has a different cause (for an in-place npm upgrade, the known client-combo/roster mismatch class of failure, which a clean host restart self-heals; otherwise a service-level issue to diagnose separately). The manual insert neither fixed the original symptom nor was needed.

## 2. Layering rules for a profile patch acting on a bundle-provided plugin

| Operation | Verdict |
|---|---|
| Changing the plugin's **config by id** (e.g. an overlay/patch entry keyed `id: workspace-files` with config fields) | **Safe** — the profile layer addresses an existing bundle entry by its id; no new entry is created, no id collision. |
| Adding an insert row for an id **no bundle ships** (a genuinely new plugin, like the profile's own `dsh-file-trace` / `dsh-profiles` rows) | **Safe** — the id is new in the entry tree. |
| Adding an insert row for an id **a bundle already ships** | **Fatal** — `duplicate loader entry id` at `cordis:include` apply time; the whole boot aborts. |

**The maintainer's action is the third case.** The proving evidence row is in web-app-patch-excerpt.txt (installed bundle, L110–111):

```yaml
- insert:
    - id: workspace-files
      name: '@deepseek-ai/dsh-api-workspace-files'
```

— identical id and package to the profile's appended block. The adjacent `session-controller` / `settings-controller` rows illustrate the correct pattern: bundle-provided ids that were never duplicated into the profile patch.

## 3. Fix

**Exact change**: delete the manually-added `workspace-files` insert block — the two comment lines and the three-line `- insert:` block — from `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml` (the last block shown in profile-patch-excerpt.txt). Change nothing else: the bundle's own row stays, and the plugin keeps working from the bundle declaration. Then restart `dsh web`; the boot proceeds.

**Is the plugin's own code at fault?** No. `@deepseek-ai/dsh-api-workspace-files` is a first-party bundle plugin whose code never executed — the crash happens in the loader while assembling the entry tree, before plugin instantiation. **Could any plugin-side change resolve the boot failure?** No. The duplicate is between two YAML declarations in two different patch files (bundle patch vs profile patch); no change inside the plugin package can affect loader id uniqueness. The only resolution is removing one of the two declarations, and the profile-side row is the one that must go (deleting the bundle row would be overwritten on the next npm install/upgrade and is not profile-owned).

After the boot is restored, the original 文件资源服务不可用 symptom should be re-diagnosed on its own merits (clean host restart first; then service activation/inspection) — it was never a missing-composition problem.

## 4. Prevention

**Before hand-adding such a row**, the maintainer should check the installed bundle's composition for the id:

- inspect the installed bundle patch: `packages/bundle/web-app/cordis.patch.yml` under the installed `@deepseek-ai/dsh` npm tree (on this machine `C:\Users\lhh\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\...`), e.g. search it for the entry id (`workspace-files`);
- equivalently, inspect the **resolved config** / live composition (loader inspect or a read-only runtime inspection) to see whether the service is already provided, rather than inferring "missing from composition" from a client-side error message;
- rule of thumb: an in-place upgrade of a first-party bundle rarely removes a service the new client needs — suspect activation/runtime mismatch (host restart) before suspecting composition.

**What the host could print at boot to make this failure actionable**: replace the bare `duplicate loader entry id: workspace-files` with a message that names both colliding declarations and prescribes the deletion, e.g.:

```
Error: dsh: plugin tree failed to load: duplicate loader entry id 'workspace-files'
  declared at:
    1. <bundle path>\packages\bundle\web-app\cordis.patch.yml:110  (bundle-provided)
    2. C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml:<line>    (profile patch)
  Fix: remove the '- insert' row for id 'workspace-files' from the profile patch —
  the bundle already provides this plugin. To customize it, patch its config by id
  instead of inserting a new row.
```

The loader already knows both sources when `EntryGroup.update` throws, so reporting file path + line for each side and blaming the profile-layer duplicate (the one the user owns) turns a cryptic abort into a one-line self-service fix. Author-side prevention is the same rule stated positively: bundle-shipped ids are addressed by id for config/overlay changes; profile patches only insert ids the bundle does not ship.
