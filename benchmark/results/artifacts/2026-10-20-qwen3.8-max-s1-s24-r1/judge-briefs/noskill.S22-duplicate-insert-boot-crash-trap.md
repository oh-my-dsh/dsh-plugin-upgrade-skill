# JUDGE BRIEF · noskill.S22-duplicate-insert-boot-crash-trap

## Criteria (sealed rubric)
- [duplicate-loader-attribution] (20pt) Compare profile-patch-excerpt.txt and web-app-patch-excerpt.txt: both insert id workspace-files, and boot-crash-log.txt locates rejection at Cordis EntryGroup.update during include/compose. Duplicate insertion is fatal to this boot rather than silent merge/last-write-wins. Reject the profile comment’s assertion that keeping the duplicate is harmless redundancy.
- [three-layering-cases] (20pt) Distinguish all three requested operations: config override by existing id is allowed; inserting a genuinely new, otherwise unprovided id is allowed; inserting an already bundle-provided id is fatal. Classify the maintainer’s row as the third case and ground it in the two excerpts. Partial credit for a substantively correct but incomplete comparison.
- [minimal-profile-fix] (20pt) Remove only the redundant workspace-files insert block from the profile cordis.patch.yml, preserving the bundle’s original service and unrelated external plugins/config. If configuration needs adjustment, use an override rather than a second insertion. Renaming the extra instance, deleting the bundle’s service, or adding another insert is not the minimal correct fix.
- [plugin-and-failure-boundary] (20pt) Explain that this boot crash is a profile composition error before plugin execution, so changing the external plugin code cannot resolve the duplicate id. Removing the duplicate restores the possibility of boot; it does not establish that the earlier resource-metadata read failure has been cured. Keep that separate problem subject to verification.
- [author-and-host-prevention] (20pt) Before inserting, inspect/grep the installed web-app bundle’s cordis.patch.yml (and other composing bundles) for the id and distinguish override from insert. Propose a host diagnostic naming workspace-files and both declaration origins, pointing to removal of the redundant profile block. “Check for duplicates” alone without where/how or an actionable host message is incomplete.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [retain-or-add-duplicate] ceiling=20 The final advice keeps/adds the duplicate as harmless redundancy, asserts duplicate inserts silently merge, or tries to cure this boot failure by editing the external plugin instead of correcting the profile composition. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.

## Candidate report(s)
#### FILE: S22-duplicate-insert-boot-crash-trap/report.md

# S22 · The Duplicate Insert That Crashed the Boot — Diagnostic Report

Environment: Windows 11, npm-global dsh 0.1.5-alpha.2, profile `web` upgraded in place from 0.1.2/0.1.3.
Evidence pack: `boot-crash-log.txt`, `profile-patch-excerpt.txt`, `web-app-patch-excerpt.txt` (fixture, read-only).

---

## 1. Root cause

**The two colliding declarations** — the same loader entry id declared twice, once per layer, with the *same package name*:

| Layer | File | Declaration |
|---|---|---|
| Bundle (web-app, npm-installed 0.1.5-alpha.2) | `packages/bundle/web-app/cordis.patch.yml` (L110–111 of the installed tree, per `web-app-patch-excerpt.txt`) | `- insert: [ id: workspace-files, name: '@deepseek-ai/dsh-api-workspace-files' ]` |
| Profile (manually added by the maintainer after the upgrade) | `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml` (last block of `profile-patch-excerpt.txt`) | `- insert: [ id: workspace-files, name: '@deepseek-ai/dsh-api-workspace-files' ]` |

**Where the collision is detected.** At `dsh web` boot, `dsh-app-boot` composes the plugin tree: the bundle's patch rows arrive through the `cordis:include` loader entry, and the profile's patch rows are merged into the *same* entry group, which is keyed by loader-entry id. The duplicate is caught at the **Cordis plugin-loader entry layer**, during tree composition — before any plugin code runs. The crash log pins the exact frames:

- throw site: `EntryGroup.update` — `@deepseek-ai/cordis-plugin-loader/lib/index.js:91:28` (`TypeError: duplicate loader entry id: workspace-files`)
- reached via `Include._apply` — `dsh-app-boot/lib/index.js:240:19`, i.e. while applying the loader entry `include (cordis:include)`
- inside `boot` (`dsh-app-boot/lib/index.js:1534`) → `runProfile` → `runCli`, surfaced as stage `dsh: plugin tree failed to load`.

**Why the loader refuses the whole boot instead of accepting the later row.** Loader entries form a keyed identity space: each id must resolve to exactly one entry that owns the service's package, props, and lifecycle. A second `insert` under an existing id is not an update — it is an ambiguous composition (which declaration wins? which props apply?). Silently applying last-wins would turn every duplicated row into an accidental override channel: a stale or copy-pasted profile row could quietly hijack or shadow a bundle-provided host service after an upgrade — precisely the failure class an in-place 0.1.2 → 0.1.5 upgrade must not permit silently. So uniqueness is enforced as a fail-fast integrity invariant at load time: the loader rejects the entire tree deterministically rather than booting an ambiguous composition.

Consequence: the profile comment "如果 web-app bundle 已包含此行则此条为冗余；保留以确保升级 profile 不遗漏" is factually wrong at this layer (the evidence README rightly calls it the wrong "冗余" comment). **Inserts are not idempotent; a "just in case" duplicate insert is fatal, not a harmless no-op.**

Note also that the maintainer's original hypothesis was disproved by the same evidence: the bundle excerpt proves `workspace-files` *was* part of the 0.1.5-alpha.2 composition, so the right-Sidebar read failure (文件资源服务不可用) could not have been caused by a missing loader row. The manual insert never addressed the original symptom — it only added a boot crash on top of it (see §3 for the follow-up diagnosis).

---

## 2. Layering rules (profile patch acting on a bundle-provided plugin)

| Operation from the profile patch | Verdict | Why |
|---|---|---|
| Change the plugin's **config by id** (an update/override keyed to the id the bundle already ships) | **Safe** | It refines the existing entry in place; entry identity stays unique. This is the intended profile→bundle customization channel. |
| **Add a row for an id no bundle ships** (e.g. external plugins `dsh-file-trace`, `dsh-profiles` in this very profile patch) | **Safe** | It introduces a new unique identity into the entry group; there is nothing to collide with. |
| **Add a row for an id a bundle already ships** (`workspace-files`) | **Fatal** | Second loader entry with the same id → `EntryGroup.update` throws `duplicate loader entry id` → whole boot aborted. |

**The maintainer's action is the third, fatal case.** The proving evidence row is in `web-app-patch-excerpt.txt`: the installed bundle patch already contains

```yaml
- insert:
    - id: workspace-files
      name: '@deepseek-ai/dsh-api-workspace-files'
```

— the identical id *and* package as the profile's manual block. The adjacent bundle rows reinforce the convention: `session-controller` and `settings-controller` are likewise bundle-provided host services and were **never** manually inserted into the profile patch; the profile patch legitimately carries only external plugins with ids no bundle ships.

---

## 3. Fix

**Exactly one change, in exactly one file.** In `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`, **delete the entire manual workspace-files block** — both comment lines and the insert row:

```yaml
# workspace-files: 右侧 Sidebar 文件预览所需的宿主服务（0.1.5 系列新增）
# 如果 web-app bundle 已包含此行则此条为冗余；保留以确保升级 profile 不遗漏
- insert:
    - id: workspace-files
      name: '@deepseek-ai/dsh-api-workspace-files'
```

Everything else in the profile patch stays untouched (the `dsh-file-trace`, six external client plugins, and `dsh-profiles` inserts are unique-id rows and legitimate). After the deletion the bundle's row is the sole `workspace-files` declaration, the id is unique again, and `dsh web` boots. No other layer, no bundle file, and no plugin needs to change.

**Is the plugin's own code at fault? No.** `@deepseek-ai/dsh-api-workspace-files` and the web-app bundle did the right thing: the bundle ships the service, and the loader's duplicate refusal is intended integrity behavior, not a bug.

**Could any plugin-side change resolve the boot failure? No.** The collision exists between two *loader declarations in two patch files*; it is detected before plugin code runs and is independent of what the plugin contains. Changing the plugin's implementation, exports, or props leaves both rows registering the same duplicate id, so the boot still fails. The only conceivable plugin-side "escape" — renaming the plugin's id in the bundle row — is not a fix: it is a breaking rename that orphans the stale profile row (which would then insert a second, outdated copy of the service under the old id) and every consumer referencing the id. The fault lives in the profile layer, so the fix belongs in the profile layer.

**Aftermath — re-diagnose the original symptom.** Deleting the row restores boot but returns the profile to the state where the document tab showed 文件资源服务不可用. Since the evidence proves the service *was* composed, the real cause lies elsewhere; check in order:
1. Hard-refresh / reconnect the Web GUI page after the upgrade — a stale client page bound to the pre-upgrade host session commonly reports host services as unavailable.
2. The service's own start-up: host logs for a `workspace-files` start error, and its profile-side config (workspace root / allowed paths) which a 0.1.2/0.1.3-era profile may lack or set incompatibly for 0.1.5.
3. Other residual 0.1.2/0.1.3 rows in the profile patch that conflict with 0.1.5 bundle expectations.
Verify with read-only inspection (e.g. `cordis_inspect_list` / provider queries: is the service registered, at which layer, with which props?) **before** touching composition again.

---

## 4. Prevention

**Before adding such a row by hand, look at the installed bundle:**
- Open the npm-installed bundle patch — `<npm-global>\node_modules\@deepseek-ai\dsh\packages\bundle\web-app\cordis.patch.yml` (here `C:\Users\lhh\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\...`) — and grep it for the id *and* the package name (`workspace-files`, `@deepseek-ai/dsh-api-workspace-files`). If the row is present, the bundle provides the service: the profile must not insert it; customize it, if needed, via a config change keyed to the existing id.
- Equivalent runtime check: a read-only inspection (`cordis_inspect_list` / `cordis_inspect_query`) shows whether the service/provider already exists and which layer registered it — no boot risk.
- Apply the convention this profile itself demonstrates: core host services (`workspace-files`, `session-controller`, `settings-controller`) live in the bundle layer; profile patches carry only external/third-party plugins with ids no bundle ships.
- Treat a GUI "服务不可用" message as a *runtime/config* symptom first (logs, service config, page refresh), not as proof of a missing composition row.

**What the host could print at boot to make this failure actionable:**
- **Provenance for both sides of the collision.** The loader knows every entry's origin file, line, and layer; the error should name them, e.g.:
  `duplicate loader entry id 'workspace-files': already provided by bundle patch packages/bundle/web-app/cordis.patch.yml:L110 (via cordis:include); second insert from profile patch C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml:L<n>`
- **Whom to blame and what to delete, in the message.** State the resolution rule: "the bundle layer already provides this id — delete the profile-layer insert row; profile patches must not re-insert bundle-provided ids." That converts a raw TypeError into a one-line repair instruction.
- **A composition dry-run / lint mode** (`dsh web --check` or `dsh profile lint`) that merges all patch layers and reports duplicate ids, missing packages, and layer conflicts *without* booting — so hand-edited profiles can be validated before the next start.
- **Sharper client-side errors**: the GUI's 文件资源服务不可用 should distinguish "service not registered" vs "registered but failed to start" vs "client not connected / page stale", which would have stopped the maintainer from ever forming the missing-row hypothesis.

---

## Appendix — crash-log frame mapping

| Frame | Meaning |
|---|---|
| `Error: dsh: plugin tree failed to load: failed to apply loader entry include (cordis:include)` | Boot stage: tree composition, while applying the include entry that merges patch-declared rows |
| `TypeError: duplicate loader entry id: workspace-files` at `EntryGroup.update` (cordis-plugin-loader index.js:91) | Uniqueness invariant of the id-keyed entry group rejects the second `workspace-files` declaration |
| `Include._apply` (dsh-app-boot index.js:240) → `boot` (:1534) → `runProfile` → `runCli` | Failure propagates up and aborts the whole `dsh web` start before any plugin setup runs |


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.