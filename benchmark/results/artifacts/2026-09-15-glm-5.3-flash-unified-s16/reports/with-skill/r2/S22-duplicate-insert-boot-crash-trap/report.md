# S22 · The Duplicate Insert That Crashed the Boot — Diagnosis Report

Task: read-only diagnosis of a `dsh web` boot crash (`duplicate loader entry id: workspace-files`)
after an in-place 0.1.2/0.1.3 → 0.1.5-alpha.2 upgrade on a Windows profile, followed by a
manual insert row added to the profile's `cordis.patch.yml`.

Evidence consulted (all read-only, under `/app/fixture/`):

- `boot-crash-log.txt` — full `dsh web` crash output
- `profile-patch-excerpt.txt` — `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml` with the manual insert
- `web-app-patch-excerpt.txt` — the installed web-app bundle's `cordis.patch.yml`
- Workspace skill references: `troubleshooting.md` (row: `duplicate loader entry id`),
  `api-migration-0.1.2-alpha.2.md` (API-08 composition layering), `v0.1.5-alpha.1.md`
  (DSH-0.1.5-A1-16, the card that introduced the bundle's `workspace-files` row),
  `v0.1.5-alpha.2.md` (DSH-0.1.5-A2-01/A2-02 workspaceFiles contract changes)

---

## 1. Root cause

**Which two declarations collide.** Both declare a Cordis loader entry with the id
`workspace-files` (package `@deepseek-ai/dsh-api-workspace-files`):

1. The **web-app bundle's** own `cordis.patch.yml`, already installed in the npm tree —
   `packages/bundle/web-app/cordis.patch.yml`, rows L110–111 in the installed tree
   (`web-app-patch-excerpt.txt`):

   ```yaml
   - insert:
       - id: workspace-files
         name: '@deepseek-ai/dsh-api-workspace-files'
   ```

2. The **profile's** manually added insert block at the end of
   `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml` (`profile-patch-excerpt.txt`,
   the block under the comment `# workspace-files: 右侧 Sidebar 文件预览所需的宿主服务（0.1.5 系列新增）…`).

**At which layer the collision is detected.** Not inside either YAML file and not at plugin
activation — it is detected at the **loader entry-group apply step during boot**, i.e. when
the composition layers are merged and applied to the plugin tree. The stack in
`boot-crash-log.txt` pins it exactly:

- `TypeError: duplicate loader entry id: workspace-files` thrown at
  **`EntryGroup.update` in `@deepseek-ai/cordis-plugin-loader`** (`lib/index.js:91:28`) — the
  Cordis plugin-loader layer;
- invoked from `Include._apply` in `@deepseek-ai/dsh-app-boot` (`lib/index.js:240:19`)
  during `boot` (`lib/index.js:1534`) — the host boot layer applying the `cordis:include`
  loader entries;
- surfaced as `dsh: plugin tree failed to load: failed to apply loader entry include
  (cordis:include): duplicate loader entry id: workspace-files`.

In composition terms (API-08 in the skill's API ledger), the layers are read in precedence
order — bundle patches (lowest) → profile `cordis.patch.yml` → `$DSH_HOME/cordis.patch.yml` →
CLI `--patch` — and the failure fires while the loader merges the resulting entry set into
one group, before any plugin code runs.

**Why the loader refuses the whole boot instead of accepting the later row.** `insert`
declares a *new* loader entry whose `id` is its identity. Two entries with the same id would
mean two registrations claiming the same identity (same services, slots, plugin id), which
Cordis refuses to resolve silently. By design a duplicate insert is a **fatal error, not a
silent last-wins override** — the troubleshooting reference states this explicitly:
「Cordis 把重复 insert 视为致命错误（非静默覆盖）」. Fail-fast at apply time is the correct
behavior: silently accepting the later row (last-wins) or the earlier row (first-wins) would
each mask a composition authoring mistake — the maintainer would either silently drop
whatever they thought they were adding, or the bundle's own row, with no signal. Note the
deliberate contrast with config: *overriding the config of an existing id from a later layer
is the supported path* (API-08: config on a matching id is a whole replacement and later
layers win), whereas *re-declaring the entry itself* is the fatal case.

---

## 2. Layering rules — safe vs fatal operations

For a profile patch acting on a plugin that a bundle already provides:

| Operation | Verdict | Why |
|---|---|---|
| Change the plugin's **config** by id from the profile layer | **Safe** (supported override) | Later composition layers win over earlier ones; config on a matching id is a whole-object replacement (API-08, point 5) — rewrite every field that must be kept, but the boot is healthy |
| **Add an insert row for an id no bundle ships** | **Safe** (normal third-party insertion) | This is exactly how the profile's other rows work — `dsh-file-trace` (`@dsh-external/dsh-file-trace`) and `dsh-profiles` (`@lhh010/dsh-profiles`) in the excerpt are external plugins no bundle provides, so their inserts are fine |
| **Add an insert row for an id a bundle already ships** | **FATAL** | Duplicate loader entry id — Cordis refuses the whole boot (`EntryGroup.update`), as analyzed in §1 |

**Which case is the maintainer's action:** the third one — the manual `- insert: - id:
workspace-files` block in the profile patch re-declares an entry the web-app bundle already
ships.

**Which evidence row proves it:** the row in `web-app-patch-excerpt.txt` — the installed
bundle's `cordis.patch.yml` already contains `- insert: - id: workspace-files / name:
'@deepseek-ai/dsh-api-workspace-files'` (L110–111 of the installed tree). Corroborating
evidence: the same excerpt shows adjacent bundle rows (`session-controller`,
`settings-controller`) that were likewise bundle-provided and were *never* manually inserted
into the profile — which is why those do not crash. The alpha.1 card DSH-0.1.5-A1-16 also
documents that the web-app bundle has shipped the `workspace-files` loader row since
0.1.5-alpha.1 (one of five new rows: `workspace-files`, `resources`, `ui-sidebar-right`,
`ui-sidebar-textpreview`, `ui-sidebar-files`), so any profile upgraded into the 0.1.5 line
gets it automatically.

The maintainer's own comment in the profile patch even flags the risk and reasons past it:
「如果 web-app bundle 已包含此行则此条为冗余；保留以确保升级 profile 不遗漏」 — the
"insurance" reasoning is precisely the trap: a redundant insert is not tolerated as
redundant; it is a boot-fatal duplicate.

---

## 3. Fix

**What to change and in which file.** Delete the manual `workspace-files` insert block from
the **profile's** `cordis.patch.yml` (`C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`) —
the last block of the excerpt, including its two comment lines. Nothing else in that file
needs to change; the six external-plugin inserts stay. Also correct or remove the wrong
「…保留以确保升级 profile 不遗漏」 comment so the row is not re-added later. Then restart
`dsh web` and confirm the boot completes. The bundle's row alone is sufficient — the
workspace-files host service is composed from the bundle layer.

Minimal diff (conceptual):

```yaml
# DELETE from C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml:
- insert:
    - id: workspace-files
      name: '@deepseek-ai/dsh-api-workspace-files'
```

**Is the plugin's own code at fault?** No. `@deepseek-ai/dsh-api-workspace-files` is a
first-party package shipped and wired by the web-app bundle; it is never even loaded in this
crash — the failure happens while applying the loader entries, before any plugin activates.

**Could any plugin-side change resolve the boot failure?** No. The fault lives entirely in
profile-layer composition (one insert row too many in the profile patch), above the plugin.
Reinstalling, reconfiguring, downgrading, or patching the plugin's code cannot remove the
duplicate declaration; only deleting the profile-patch row restores the boot.

**Important follow-up on the *original* symptom.** The insert was added because the
right-Sidebar document tab's content read failed (文件资源服务不可用) after the upgrade.
Removing the duplicate row fixes the crash, but the maintainer should not expect it to
magically fix that original read failure, and must **not** re-add the row when it persists:
if the service is genuinely unavailable despite the bundle row being composed, the root cause
is a compose/artifact gap or an API-contract mismatch, not a missing insert (troubleshooting
row: 「如插件确实不可用，根因是 compose/artifact 缺口而非缺少 insert」). Concretely for this
corridor: the `workspaceFiles` surface changed at 0.1.5 (DSH-0.1.5-A1-11 introduced it;
DSH-0.1.5-A2-01/A2-02 reworked the scope lookup, client resource type, and read boundary),
and DSH-0.1.5-A1-20 records that an in-place npm-global upgrade can serve a stale client
combo until a full host stop → restart → browser hard refresh. Diagnosis path after the
boot is restored: `dsh --profile web --dump-config` to confirm the composed host tree
contains the bundle's `workspace-files` row, hard-refresh the browser, then triage the read
path against the 0.1.5 workspaceFiles cards — never by re-inserting the id.

---

## 4. Prevention

**Before adding such a row by hand, look at the installed bundle first:**

1. **Grep the installed bundle patches for the id before writing any insert.** In this
   install the bundle lives under
   `C:\Users\lhh\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\…`
   (visible in the crash log); check `packages/bundle/*/cordis.patch.yml` (web-app and
   others) for the id:
   `Select-String -Path ...\node_modules\@deepseek-ai\dsh-web-app\cordis.patch.yml -Pattern workspace-files`.
   If the id appears, the only legitimate profile-layer operations are config overrides by
   id — never another insert.
2. **Treat "new in this host series" as a red flag.** Ids that first appear in the 0.1.5
   series (`workspace-files`, `resources`, `ui-sidebar-right`, `ui-sidebar-textpreview` /
   `ui-sidebar-documentpreview`, `ui-sidebar-files` — DSH-0.1.5-A1-16/A2-09) are
   bundle-provided by default; an upgraded profile does not need them re-inserted. The
   maintainer's own screenshot of the failure (tab opens, read fails) already proved the
   host-side service existed — a missing insert would more likely remove the whole entry
   from the graph, not half-break a read.
3. **Check the composed result, not the snippet**: `dsh --profile web --dump-config`
   (read-only, no GUI/model) shows whether the id is already present in the merged tree
   before anything is edited (API-08 verification step).
4. **Apply the skill's enablement-resolution rule** during any profile upgrade: the target
   profile's composition must point to the expected package identity "with no old source or
   duplicate rows" — a duplicate check across profile vs bundle layers, every time the host
   series changes which rows a bundle ships.

**What the host could print at boot to make this failure actionable.** The current message
names only the id and the loader internals; it does not say *who* to blame or *what* to
delete. A better failure would name both colliding sources and the remedy, e.g.:

```
Error: dsh: plugin tree failed to load: duplicate loader entry id: workspace-files
  already inserted by bundle '@deepseek-ai/dsh-web-app'
    at ...\node_modules\@deepseek-ai\dsh-web-app\cordis.patch.yml:110
  duplicate insert in profile layer
    at C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml:18
  → delete the duplicate insert block from the profile patch; to customize a
    bundle-provided plugin, override its config by id instead of re-inserting it.
```

That points the blame at the profile patch (not the bundle, not the plugin) and names the
exact file and line range to delete. Useful companions: a per-layer listing of insert ids
when a duplicate is detected (bundle vs profile vs `--patch`), a non-fatal pre-boot check
(`--dump-config`-style) that warns on profile inserts shadowing bundle rows, and — for
cross-cohort patch authors who legitimately need a self-guarding row — the `!!js`
conditional-disable probe pattern from `host-plane-probes.md` (form 1: a row that yields
itself when the official row with the same id is enabled), which prevents this class of
duplicate before the loader ever sees two entries.

---

## Summary

- **Root cause**: the profile patch's manual `insert` for id `workspace-files` collides with
  the web-app bundle's own `workspace-files` row (`cordis.patch.yml` L110–111); detected in
  `cordis-plugin-loader`'s `EntryGroup.update` via `dsh-app-boot`'s `Include._apply` during
  boot — Cordis treats duplicate insert ids as fatal rather than silently overriding.
- **Layering**: config-by-id override from the profile layer = safe; insert of an id no
  bundle ships = safe; insert of an id a bundle ships = fatal (the maintainer's case, proven
  by the bundle excerpt row).
- **Fix**: delete the manual block from `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`;
  plugin code is not at fault and no plugin-side change can fix this boot failure. The
  original 文件资源服务不可用 symptom needs separate triage afterwards (dump-config, hard
  refresh, 0.1.5 workspaceFiles contract cards) — without re-adding the row.
- **Prevention**: grep the installed bundle's patch files and check `--dump-config` before
  hand-inserting any id, distrust "new in this series" ids as bundle-provided, and have the
  host print both colliding file paths with the delete/remedy hint at boot.
