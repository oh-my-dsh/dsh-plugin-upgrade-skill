# S22 · The Duplicate Insert That Crashed the Boot — Diagnosis Report

Evidence: `fixture/boot-crash-log.txt`, `fixture/profile-patch-excerpt.txt`, `fixture/web-app-patch-excerpt.txt` (read-only pack, 2026-09-09, dsh 0.1.5-alpha.2, Windows 11, npm global).
Skill references consulted: `troubleshooting.md` row "重启后宿主启动即崩：duplicate loader entry id", `api-migration-0.1.2-alpha.2.md` card API-08 (composition precedence), `v0.1.5-alpha.1.md` card DSH-0.1.5-A1-20, `pre-flight.md`.

## 1. Root cause

**Which two declarations collide.** Two `insert` rows declare the same loader entry id `workspace-files` (package `@deepseek-ai/dsh-api-workspace-files`):

1. The web-app **bundle's own** `cordis.patch.yml` in the installed 0.1.5-alpha.2 npm tree (`packages/bundle/web-app/cordis.patch.yml`, L110-111) — `- insert: - id: workspace-files, name: '@deepseek-ai/dsh-api-workspace-files'`. The bundle has shipped this row since the 0.1.5 series added the workspace-files surface.
2. The **manually added** block at the end of the profile's `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml` (comment "workspace-files: 右侧 Sidebar 文件预览所需的宿主服务…" plus `- insert: - id: workspace-files, name: '@deepseek-ai/dsh-api-workspace-files'`), inserted by the maintainer after the 文件资源服务不可用 symptom.

**At which layer the collision is detected.** At the Cordis **loader/composition-apply layer**, during boot's plugin-tree load, before any plugin code or service activation runs. The crash stack proves it:

- `TypeError: duplicate loader entry id: workspace-files` thrown at `EntryGroup.update` (`@deepseek-ai/cordis-plugin-loader/lib/index.js:91`) — the loader's entry-group bookkeeping, where ids must be unique;
- called from `Include._apply` (`@deepseek-ai/dsh-app-boot/lib/index.js:240`) while applying the loader entry include (`cordis:include`);
- wrapped by dsh's boot error boundary as `Error: dsh: plugin tree failed to load: failed to apply loader entry include (cordis:include): duplicate loader entry id: workspace-files`.

So it is neither a config-merge conflict nor a runtime/service-pending failure: the composition tree itself refuses to assemble.

**Why the loader refuses the whole boot instead of accepting the later row.** Cordis treats a duplicate `insert` of the same entry id as **fatal, not a silent override** (troubleshooting.md, discussion #5999). An `insert` row *creates* a loader entry; the entry group cannot hold two entries with one id, and unlike a `config:` row on an existing id (where later composition layers override earlier ones per API-08), there is no defined merge semantics for two inserts of the same id — the group cannot decide which declaration owns the entry, so it fails closed at boot with the id named, rather than double-registering or nondeterministically picking a winner. Note the precedence order (API-08): bundle patches → profile `cordis.patch.yml` → home-level patch → CLI `--patch`; the profile layer is the *later* layer, which is exactly why override-by-`config` is legal but duplicate-`insert` is a trap.

## 2. Layering rules (profile patch acting on a bundle-provided plugin)

| Operation on a profile patch | Verdict |
|---|---|
| **Changing the plugin's config by id** (a `config:` row targeting an existing id) | **Safe.** Later layers override earlier ones; per API-08 `config` is the whole replacement for that row (rewrite every field you want kept). This is the supported way to adjust a bundle-provided plugin from the profile. |
| **Adding a row for an id no bundle ships** | **Safe.** This is the intended use of profile-patch inserts — third-party/external plugins. The profile excerpt's other rows (`dsh-file-trace`, `dsh-profiles`, the six external client plugins) are exactly this case and booted fine. |
| **Adding a row for an id a bundle already ships** | **Fatal.** `EntryGroup.update` throws `duplicate loader entry id`, and the entire boot refuses to start. |

**The maintainer's action is the third (fatal) case**: they hand-inserted `workspace-files`, an id the web-app bundle already provides.

**Proving evidence row:** the web-app bundle patch excerpt (`fixture/web-app-patch-excerpt.txt`) shows `- insert: - id: workspace-files / name: '@deepseek-ai/dsh-api-workspace-files'` already present at L110-111 of the installed 0.1.5-alpha.2 tree (`packages/bundle/web-app/cordis.patch.yml`), alongside the sibling bundle-provided rows `session-controller` / `settings-controller` that were never hand-inserted. The crash log's id (`workspace-files`) matches it exactly. Corroborating skill evidence: troubleshooting.md row 18 states the 0.1.5-series `workspace-files` / `ui-sidebar-*` rows are provided automatically by the web-app bundle and upgrading profiles must not hand-insert them.

## 3. Fix

**What to change, and in which file.** Delete the manually added block — the comment lines plus the insert row — from the **profile's** `cordis.patch.yml`:

```
File: C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml
Delete:
  # workspace-files: 右侧 Sidebar 文件预览所需的宿主服务（0.1.5 系列新增）
  # 如果 web-app bundle 已包含此行则此条为冗余；保留以确保升级 profile 不遗漏
  - insert:
      - id: workspace-files
        name: '@deepseek-ai/dsh-api-workspace-files'
```

The bundle's own row (in the npm-installed `packages/bundle/web-app/cordis.patch.yml`) must **not** be touched — it is read-only package content owned by the npm install and would be restored/overwritten by the next install anyway. Then fully stop the dsh host process (a running host holds Windows file locks — never edit/upgrade around a live host) and restart `dsh web`, then hard-refresh the browser.

**Is the plugin's own code at fault?** No. The crash happens at composition-apply time, before `@deepseek-ai/dsh-api-workspace-files` (or any plugin) is ever loaded or activated — the plugin code never executes in this crash path.

**Could any plugin-side change resolve the boot failure?** No. The failure is purely an ownership conflict over a loader entry id between two composition files (profile patch vs bundle patch); no change to the plugin's code, manifest, exports, or package can remove a second declaration of its id in the profile patch. The only correct resolution is deleting the duplicate profile-patch row.

**Residual follow-up:** deleting the duplicate restores the boot, but the *original* 文件资源服务不可用 symptom still deserves attribution, and the answer is still not a profile insert (troubleshooting row 18: "如插件确实不可用，根因是 compose/artifact 缺口而非缺少 insert"). Per DSH-0.1.5-A1-20, an in-place npm-global upgrade can serve a client combo that omits newly-added bundle modules — one dropped module fails client registration, and a host restart self-heals the roster/combo mismatch. So: remove the duplicate row, restart once; if reads still fail, apply the A1-20 recipe (fetch one new and one old bundle module at the same rev — old 200 + new 404 pins the gap to the host's artifact/rev set; restart; if unhealed, roll the global package back to the previous published version and report upstream).

## 4. Prevention

**Before adding such a row by hand, inspect the installed bundle first:**

1. **Grep the installed tree for the id** before composing any insert, e.g. in the npm-global install:
   `rg -n "workspace-files" "C:\Users\lhh\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh"` — the bundle patch `packages/bundle/web-app/cordis.patch.yml` declaring `- id: workspace-files` (as L110-111 does here) means the row is already provided and the profile must only use `config`-by-id if adjustment is needed, never another `insert`.
2. **Check the composed result, not just one YAML snippet**: run `dsh --profile web --dump-config` (isolated profile, no GUI/model needed — API-08 verification) and look for the id in the composed tree; composition precedence means the bundle layer already contributes its rows before the profile layer.
3. **Check the version corridor for the id's origin**: the 0.1.5-series release notes/cards (alpha.1/alpha.2: workspace-files file surface, `ui-sidebar-*` rework) are rows the bundle now ships by default; a "newly missing in 0.1.5" module is a bundle-provided addition, and a client-side gap after an in-place upgrade is the A1-20 roster/combo mismatch that a restart heals — neither is ever fixed by a profile insert.

**What the host could print at boot to make this actionable.** Today the crash names only the id (`duplicate loader entry id: workspace-files`); the maintainer must cross-reference both patch files manually. The loader already knows both declaration sites at `EntryGroup.update`, so the failure could:

- **Blame precisely**: print, per colliding id, the layer and file:line of *both* declarations — e.g. `id "workspace-files" already inserted by bundle patch <install>\packages\bundle\web-app\cordis.patch.yml:110; duplicate insert in profile patch C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml:19`.
- **Say what to delete and whom to blame**: append the remedy — `delete the later profile insert (the bundle already provides this entry); do not modify the installed bundle`. This points the finger at the profile-patch author (the manual edit), not the plugin author and not the bundle.
- Even better, **fail in preflight rather than at boot**: a composition lint during patch loading (before plugin-tree apply) could list every profile insert whose id is already provided by a bundle patch, turning a hard crash into a one-line actionable warning.
