# S22 · The Duplicate Insert That Crashed the Boot — Report

## 1. Root cause

Two `insert` declarations of the **same loader entry id, `workspace-files` (package `@deepseek-ai/dsh-api-workspace-files`)`, collide:

1. **Bundle-provided row** — the installed web-app bundle's `packages/bundle/web-app/cordis.patch.yml` already ships an `insert` row `id: workspace-files` / `name: '@deepseek-ai/dsh-api-workspace-files'` (evidence: web-app-patch-excerpt.txt, L110-111 of the installed 0.1.5-alpha.2 tree).
2. **Manually added profile row** — the maintainer appended an identical `insert` row for `id: workspace-files` to `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml` (evidence: profile-patch-excerpt.txt, the last block, annotated with the incorrect "冗余" — "redundant, kept just in case" — comment).

**Detection layer**: the collision is detected in the **Cordis plugin loader's entry registry**, not in the plugin itself. The stack in boot-crash-log.txt shows `EntryGroup.update` in `@deepseek-ai/cordis-plugin-loader` throwing `TypeError: duplicate loader entry id: workspace-files`, raised through `Include._apply` ("failed to apply loader entry include (cordis:include)") while `dsh-app-boot`'s `boot()` assembles the plugin tree; `bin.js` then wraps it as `dsh: plugin tree failed to load`. Entry ids in a loader entry group must be unique; an `insert` creates a new entry, so applying the profile patch on top of the bundle patch attempts to register the id twice.

**Why the whole boot fails instead of "later row wins"**: Cordis loader `insert` semantics are additive-by-identity — the entry table is keyed by id, and `EntryGroup.update` enforces uniqueness as a hard invariant. There is no "last write wins" merge for `insert`: two inserts with one id are a tree-composition error, so the loader refuses to load the plugin tree at all (fail-loud at load time, per the repo's "misconfiguration fails loud" rule) rather than silently picking one row. The earlier "文件资源服务不可用" (workspace-files service unavailable) symptom was a different problem; the manual insert converted a runtime service issue into a fatal load-time composition error.

## 2. Layering rules for a profile patch acting on a bundle-provided plugin

| Operation | Safety |
|---|---|
| Change the plugin's **config by id** (e.g. a `config:` / update block targeting the existing `workspace-files` id) | **Safe** — it modifies the already-registered entry; no new id is created. |
| Add an `insert` row for an id **no bundle ships** (e.g. the profile's `dsh-file-trace`, `dsh-profiles` rows) | **Safe** — new unique id; this is exactly what profile patches are for. |
| Add an `insert` row for an id a **bundle already ships** | **Fatal** — duplicate loader entry id; the boot crashes in `EntryGroup.update` before any plugin code runs. |

The maintainer's action is the **third case**: inserting `workspace-files`, an id the web-app bundle already provides. The proving evidence row is the `- insert: - id: workspace-files / name: '@deepseek-ai/dsh-api-workspace-files'` block in web-app-patch-excerpt.txt (the bundle's cordis.patch.yml), matched exactly by the same-shaped block at the end of profile-patch-excerpt.txt. The adjacent `session-controller` / `settings-controller` rows show the pattern: bundle-provided ids never appear in the profile patch.

## 3. Fix

**Delete the manual `workspace-files` insert block** (the three-line `- insert:` entry plus its two comment lines) from `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`. Nothing else in that file needs to change; no row needs to be added anywhere, because the installed 0.1.5-alpha.2 web-app bundle already registers `workspace-files`.

If per-deployment configuration of the plugin were ever needed, it would go through an id-targeted config change in the profile patch — never a second `insert`.

**Is the plugin's own code at fault?** No. `@deepseek-ai/dsh-api-workspace-files` never loaded — the failure happens in the loader's entry-registry step, before plugin resolution or `apply()`. **Could any plugin-side change resolve the boot failure?** No. The duplicate is a property of the composed cordis.patch.yml inputs (bundle patch + profile patch), not of the plugin's code; the only resolution is removing the duplicate declaration at the composition layer. (The plugin code is also not implicated in the original "文件资源服务不可用" read failure in any way shown by this evidence; that symptom motivated but is separate from the crash.)

## 4. Prevention

**Author/maintainer side — before hand-adding an `insert` row:**
- Inspect the **installed bundle's `cordis.patch.yml`** (in the npm-installed tree, e.g. `...\node_modules\@deepseek-ai\dsh\...\packages\bundle\web-app\cordis.patch.yml`) and **grep it for the intended entry id** (here `workspace-files`). If the id already appears, do not insert it again; config changes only.
- Equally, check the bundle's resolver-manifest dependencies and the profile's existing rows for the id — uniqueness is global to the composed tree, not per-file.
- Do not keep "just in case" duplicate rows (the "冗余；保留以确保…" comment): in this loader, a redundant insert is not redundant, it is fatal.
- Diagnose the actual symptom first: a service-unavailable message in a UI tab is a runtime/service issue, not proof that a composition row is missing.

**Host side — making the failure actionable:** at boot, when `EntryGroup.update` rejects a duplicate id, `dsh-app-boot`/`bin` could catch the loader error and print, alongside the stack:
- **Whom to blame**: which two sources contributed the colliding id — here "id `workspace-files` inserted by bundle patch (web-app cordis.patch.yml) **and** by profile patch (`C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`)" — i.e. resolve each contributing patch layer and file path.
- **What to delete**: "remove the `insert` row for `workspace-files` from your profile's cordis.patch.yml; the bundle already provides it" — a concrete file + block pointer.
- Optionally, a pre-flight composition check (dedupe scan over merged insert ids across bundle + profile patches before `Include._apply`) that reports all duplicates in one pass, and a hint that id-targeted `config` changes — not duplicate inserts — are the supported way to customize a bundle-provided plugin.
