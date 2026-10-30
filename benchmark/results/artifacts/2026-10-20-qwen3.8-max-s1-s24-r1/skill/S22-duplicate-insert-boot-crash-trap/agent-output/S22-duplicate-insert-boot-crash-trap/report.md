# S22 · The Duplicate Insert That Crashed the Boot — Diagnostic Report

Task: S22-duplicate-insert-boot-crash-trap (read-only). Evidence: `/app/fixture/` (boot-crash-log.txt,
profile-patch-excerpt.txt, web-app-patch-excerpt.txt, README.md). Skill arm: `plugin-upgrade`
(Mode A · inspect — read-only investigation and report). References cited by card ID only.

---

## 0. Verdict in one paragraph

The boot crash is a **profile-layer composition error, not a plugin bug and not a missing-service
problem**. The 0.1.5-alpha.2 web-app bundle already ships an `insert` row for loader entry id
`workspace-files`; the maintainer's manually added row with the same id in the profile's
`cordis.patch.yml` collides with it, and the Cordis loader treats a duplicate `insert` as fatal
(fail-closed, never silent-override), aborting the whole boot. The fix is to **delete the manual
block from the profile patch** and restart. The original symptom that provoked the edit
(右侧 Sidebar 文件预览 "文件资源服务不可用") was itself **not** a missing row — per card
DSH-0.1.5-A1-20 (real-host verified on the same 2026-09-09 npm-global upgrade window, upstream
discussion #5999) it is a post-upgrade roster/combo artifact gap whose remedy is a clean **host
restart**, which self-heals. The maintainer edited the wrong layer, in the wrong direction, and the
misleading "冗余但保留" comment in the patch documents the trap.

---

## 1. Root cause

### 1.1 The two colliding declarations

| # | Layer | Source file | Declaration |
|---|---|---|---|
| 1 | **Bundle layer** (web-app bundle, shipped in the npm-installed 0.1.5-alpha.2 tree) | `packages/bundle/web-app/cordis.patch.yml`, L110–111 of the installed tree (fixture: web-app-patch-excerpt.txt L4, L6–8) | `- insert: [{ id: workspace-files, name: '@deepseek-ai/dsh-api-workspace-files' }]` |
| 2 | **Profile layer** (manual edit after the upgrade) | `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`, final block (fixture: profile-patch-excerpt.txt L16–20) | the identical `- insert:` row for id `workspace-files`, package `@deepseek-ai/dsh-api-workspace-files` |

Both patch layers are merged into a single plugin/entry tree at boot. Loader entry ids are unique
addresses in that tree, so the second `insert` of `workspace-files` has nothing left to add and
collides with the first.

Bundle-provided status is corroborated by the skill references: card **DSH-0.1.5-A1-16** records that
`dsh-web-app`'s `cordis.patch.yml` gained five loader rows on the 0.1.3-alpha.2→0.1.5-alpha.1 edge —
`workspace-files`, `resources`, `ui-sidebar-right`, `ui-sidebar-textpreview`, `ui-sidebar-files` —
i.e. an upgraded profile **never** needs to hand-insert them; they arrive with the bundle. Card
**DSH-0.1.5-A1-11** documents the package itself (`@deepseek-ai/dsh-api-workspace-files` providing the
`workspaceFiles` Remote file surface the sidebar preview reads through). The fixture's adjacent rows
(web-app-patch-excerpt.txt L13–18: `session-controller`, `settings-controller`) show other
bundle-provided ids that were **never** manually inserted into the profile patch — the correct pattern.

### 1.2 At which Cordis layer the collision is detected

At the **loader / plugin-tree composition layer — before any plugin code executes**. The crash-log
stack (boot-crash-log.txt) reads bottom-up:

```
runCli (dsh/lib/bin.js)
 → runProfile (dsh/lib/profile-boot-*.js)
  → boot (dsh-app-boot/lib/index.js:1534)
   → Include._apply (dsh-app-boot/lib/index.js:240)        # applying loader entry include (cordis:include)
    → EntryGroup.update (@deepseek-ai/cordis-plugin-loader/lib/index.js:91)  ← throws here
```

`EntryGroup.update` in **`@deepseek-ai/cordis-plugin-loader`** is the entry-tree assembler; it enforces
entry-id uniqueness while `@deepseek-ai/dsh-app-boot`'s `boot()` applies the `cordis:include` loader
entry that folds the bundle and profile patch layers into one tree. The wrapper message
`dsh: plugin tree failed to load: failed to apply loader entry include (cordis:include): duplicate
loader entry id: workspace-files` confirms the phase: **tree loading**, not plugin instantiation, not
service activation, not the Web client.

### 1.3 Why the loader refuses the whole boot instead of accepting the later row

Because `insert` means "add a **new** entry", not "ensure this entry exists". Two inserts of the same
id are a composition **contradiction**, and there is no deterministic, safe merge semantics for it:

- **Order-dependence**: accepting "later row wins" would make boot outcome depend on patch
  application order (bundle rows before profile rows, and bundle order itself being a list) — an
  invisible, unstable contract.
- **Hijack vector**: a profile row could silently replace the *package* behind a bundle-shipped id
  (here both rows name the same package by luck; the loader cannot rely on that), i.e. last-writer
  substitution of host code without any operator-visible signal.
- **Error masking**: silent dedupe would hide genuine composition mistakes until they surface as
  far-away runtime weirdness. Cordis therefore fails closed, at boot, naming the offending id.

The skill's troubleshooting table states this as a cross-version Cordis composition rule (no version
card needed): "Cordis 把重复 insert 视为致命错误（非静默覆盖）… 删除 profile patch 中重复的 insert
块即可恢复启动；如插件确实不可用，根因是 compose/artifact 缺口而非缺少 insert"（troubleshooting.md,
row `duplicate loader entry id`, sourced from discussion #5999 — the same upstream thread as card
DSH-0.1.5-A1-20).

### 1.4 Why the maintainer's premise was wrong (the pre-crash symptom)

The right-Sidebar document tab opening but failing content read (文件资源服务不可用) after an
in-place npm-global upgrade is the signature of **DSH-0.1.5-A1-20**: the running/first-booted host
serves a client combo that omits newly-added bundle modules even though the boot roster lists them
and the artifacts exist on disk; one dropped module can fail every client plugin's registration.
The carded remedy is: attribute first (fetch one NEW and one OLD bundle module at the same rev —
old 200 + new 404 pins the gap to the host artifact set, not the plugin), then **restart the host
once** — the observed case self-healed; if not, roll back to the previous pinned published version
and report upstream (#5999; the alpha.2 round is covered in the same thread). At no point is the
remedy "insert a bundle-shipped row into the profile patch" — the composition was never missing
`workspace-files`.

---

## 2. Layering rules — profile patch acting on a bundle-provided plugin

| Operation on the profile `cordis.patch.yml` | Verdict | Why / evidence |
|---|---|---|
| **Change a bundle-provided plugin's config by id** (id-addressed overrides: config values, `disabled` toggles on an existing row) | **Safe** | This is the sanctioned profile-layer operation: it *targets* an existing entry instead of re-adding it. The host itself writes such overrides — card DSH-0.1.6-A2-03: the plugin-manager's row toggle "writes a `disabled` override into the profile `cordis.patch.yml`". Skill discipline: patch configuration **by path/id and preserve unknown fields**. |
| **Add an insert row for an id no bundle ships** | **Safe** | The intended purpose of profile patches: composing third-party/external plugins into the tree. Proof inside the very same file: the `dsh-file-trace` (`@dsh-external/dsh-file-trace`) and `dsh-profiles` (`@lhh010/dsh-profiles`) rows (profile-patch-excerpt.txt L5–7, L12–14) plus six external client plugins — none collides, boot was fine before the manual edit. |
| **Add an insert row for an id a bundle already ships** | **Fatal** | `duplicate loader entry id` at `EntryGroup.update`; the entire boot is refused (this incident). Cross-version Cordis composition rule per troubleshooting.md; bundle rows for 0.1.5 (workspace-files, resources, ui-sidebar-*) arrive automatically with the bundle (DSH-0.1.5-A1-16). |

**Which case is the maintainer's action?** The third — the fatal one.

**Which evidence rows prove it?**
- Profile side: profile-patch-excerpt.txt **L16–20** — the manual block
  `- insert: / - id: workspace-files / name: '@deepseek-ai/dsh-api-workspace-files'`, introduced by
  the comment L16–17: "workspace-files: 右侧 Sidebar 文件预览所需的宿主服务（0.1.5 系列新增）/
  如果 web-app bundle 已包含此行则此条为冗余；保留以确保升级 profile 不遗漏".
- Bundle side: web-app-patch-excerpt.txt **L4 + L6–8** — "The workspace-files row is already here
  (L110–111 in the installed tree)" followed by the identical `insert` row, from the npm-installed
  0.1.5-alpha.2 tree (provenance stated in L1–2).
- The comment is doubly wrong and is the actual **trap**: (a) its hedged condition ("如果 bundle 已
  包含") was *true* — the excerpt proves the bundle ships the row — so the correct conclusion was
  "do not add", not "keep anyway"; (b) its consequence ("此条为冗余") is *false* — a duplicate insert
  is not a harmless redundancy, it is a fatal composition contradiction. There is no
  belt-and-braces insert in Cordis.

---

## 3. Fix

### 3.1 What to change, and where

**File**: `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml` (the profile patch — the only file to
touch).

**Change**: delete the entire manual block at the end — the two comment lines plus the insert row
(profile-patch-excerpt.txt L16–20):

```yaml
# workspace-files: 右侧 Sidebar 文件预览所需的宿主服务（0.1.5 系列新增）
# 如果 web-app bundle 已包含此行则此条为冗余；保留以确保升级 profile 不遗漏
- insert:
    - id: workspace-files
      name: '@deepseek-ai/dsh-api-workspace-files'
```

Keep everything else (the external-plugin rows are legitimate case-2 inserts). Do **not** touch the
bundle tree under npm (not user-owned, and already correct). Do **not** replace the insert with a
`disabled` override — the plugin is wanted.

**Then**: fully stop the dsh host process, restart `dsh web`, hard-refresh the browser. This one
restart does double duty: it clears the crash *and* it is exactly the DSH-0.1.5-A1-20 self-heal step
for the original 文件资源服务不可用 symptom (fresh boot re-serves roster + combo including the new
modules).

**Verify**: (1) boot completes without `duplicate loader entry id`; (2) `dsh --profile web
--dump-config` shows exactly **one** `workspace-files` row, sourced from the bundle; (3) open the
right-Sidebar document tab and confirm content reads (behavior layer); (4) if — and only if — the
read still fails after the clean restart, follow the A1-20 escape hatch: attribute with the
old-200/new-404 same-rev probe, roll the global package back to the previous pinned published
version (`npm i -g @deepseek-ai/dsh@<exact-version>`, external terminal, host fully stopped) and
report upstream (#5999).

### 3.2 Is the plugin's own code at fault? Could a plugin-side change fix the boot?

**No, and no.** The failure occurs in loader-entry assembly (`EntryGroup.update`) while applying
`cordis:include` — strictly **before** any plugin factory, service, or client code runs.
`@deepseek-ai/dsh-api-workspace-files` is a host package shipped and inserted by the bundle; in the
crashing boot it is never even instantiated. A plugin cannot observe, dedupe, or veto loader rows —
the duplicate lives in the composition inputs (profile patch YAML), which is precisely what the
loader refuses to accept. No change inside any plugin package can resolve this boot failure; the
only resolution is removing the profile-layer duplicate. (Symmetrically, the host must not be
"fixed" by making the loader silently accept duplicates — fail-closed is the design, and skill
discipline forbids modifying DSH core to conceal a composition error.) Failure attribution, in the
skill's verify-runtime taxonomy, is **profile-config** — not plugin-code, not dependency-resolution,
not dsh-runtime.

---

## 4. Prevention

### 4.1 Maintainer-side: what to inspect before hand-adding an insert row

1. **The installed bundle's composition** — grep the candidate id in the bundle patch files inside
   the installed npm tree, e.g.
   `…\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-bundle-web-app\cordis.patch.yml`
   (here: L110–111 already carried `workspace-files`), and check the profile `package.json`'s
   `dsh.profile.bundles` list for every bundle whose patch merges into this profile's tree.
2. **The composed tree** — `dsh --profile web --dump-config` prints the resolved composition without
   a full boot; if the id already appears, it is bundle-provided and must never be re-inserted.
3. **Apply the layering rule** — profile-patch `insert` rows are for plugins **no bundle ships**
   (external/third-party, like the `@dsh-external/*` and `@lhh010/*` rows in the same file). For
   bundle-provided ids, the only legal profile operations are id-addressed overrides (config change,
   `disabled` toggle). New host services in an upgrade (0.1.5's `workspace-files`, `resources`,
   `ui-sidebar-*`…) arrive **with the bundle** — an upgraded profile needs no补插 (DSH-0.1.5-A1-16).
4. **Treat a "if the bundle already has it, this row is redundant" comment as a hard stop** — go
   verify the condition instead of hedging; in Cordis the hedged outcome is a dead boot, not a
   redundancy.
5. **For post-upgrade "service unavailable" symptoms, restart before editing** — fully stop the
   host, restart, hard-refresh the browser (A1-20 self-heal); attribute with the same-rev
   old-module-200 / new-module-404 probe before touching any composition file, and never convert a
   host artifact gap into a profile-patch edit.

### 4.2 Host-side: what the boot error should print to be actionable

The current message names the id but not the culprits. An actionable error would add:

1. **Both declarations with layer + file attribution**: which layer already provides the id and
   which layer added the duplicate, with paths (and line numbers where known), e.g.
   `duplicate loader entry id: workspace-files — already inserted by bundle 'web-app'
   (packages/bundle/web-app/cordis.patch.yml:110); duplicate insert comes from profile patch
   C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`.
2. **Whom to blame and what to delete**: "the later (profile-layer) insert is the offending
   declaration; remove it from the profile patch. Bundle-provided plugins are customized by
   id-addressed config/disabled overrides, never by re-inserting their row."
3. **Whole-tree duplicate report / precheck**: list *all* duplicate ids in one pass instead of dying
   on the first, and/or expose the check in `--dump-config`-style validation before boot; the
   plugin-manager surface (DSH-0.1.6-A2-03), which already writes profile patch rows, should refuse
   to write an `insert` for an id any composed bundle ships.

With (1)–(2) the maintainer would have been pointed at their own last edit and at the bundle row
that made it redundant-*and-fatal*, turning a boot-loop into a one-line deletion.

---

## Evidence index

- **Fixture** (read-only, unmodified): boot-crash-log.txt (crash text, stack, prior context);
  profile-patch-excerpt.txt L16–20 (manual insert + wrong comment), L5–7/L12–14 (legitimate external
  inserts); web-app-patch-excerpt.txt L4–8 (bundle row, installed tree L110–111), L13–18
  (bundle-provided neighbours never hand-inserted); README.md (pack inventory, 2026-09-09 provenance).
- **Skill references** (cited by card ID / row, key points only): troubleshooting.md row "重启后宿主
  启动即崩：duplicate loader entry id"（cross-version Cordis rule; discussion #5999）;
  **DSH-0.1.5-A1-20** (upgraded npm-global profiles serve a combo omitting new bundle modules;
  restart self-heals; real-host verified 2026-09-09, #5999 incl. alpha.2 round); **DSH-0.1.5-A1-16**
  (web-app bundle adds the five 0.1.5 loader rows incl. workspace-files); **DSH-0.1.5-A1-11**
  (workspace-files file surface / `workspaceFiles` Remote); **DSH-0.1.5-A2-09** (document previews in
  the right sidebar; textpreview→documentpreview rename — the feature the maintainer was trying to
  heal); **DSH-0.1.6-A2-03** (plugin-manager writes `disabled` row toggles into the profile
  cordis.patch.yml — the sanctioned id-addressed override).

*Report generated under BENCHMARK-AUTH-v1 (unattended, read-only). No fixture bytes were modified;
no migrations or installations were executed.*
