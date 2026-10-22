# S22 · Duplicate Insert That Crashed the Boot — Diagnosis Report

**Incident**: in-place upgrade dsh 0.1.2/0.1.3 -> 0.1.5-alpha.2 (Windows); after the upgrade the
right-Sidebar document tab read failed (文件资源服务不可用); the maintainer assumed the
`workspace-files` host service was missing from the profile composition and manually added an
`insert` row to the profile's `cordis.patch.yml`; the next `dsh web` boot crashed with
`duplicate loader entry id: workspace-files`.

**Evidence (read-only)**: `fixture/boot-crash-log.txt`, `fixture/profile-patch-excerpt.txt`,
`fixture/web-app-patch-excerpt.txt`, `fixture/README.md`.

---

## 1. Root cause

**The colliding pair**: the profile patch `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`
(the manually appended `- insert: - id: workspace-files` block) collides with the web-app
bundle's own `cordis.patch.yml` (installed tree, `packages/bundle/web-app/cordis.patch.yml`
L110-111) — both declare the identical row `id: workspace-files` /
`name: '@deepseek-ai/dsh-api-workspace-files'`.

**Detection layer**: the Cordis plugin-tree loader layer, not the plugin layer —
`@deepseek-ai/cordis-plugin-loader`'s `EntryGroup.update` (lib/index.js:91:28), reached while
`dsh-app-boot`'s `boot()` (lib/index.js:1534) applies the `cordis:include` loader-entry
include via `Include._apply` (lib/index.js:240:19), inside `runProfile`.

### 1.1 The two colliding declarations

| # | Declaration | Source | Text |
|---|---|---|---|
| A | profile patch (user layer) | `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml` (see `fixture/profile-patch-excerpt.txt`, last block) | `- insert:` / `- id: workspace-files` / `name: '@deepseek-ai/dsh-api-workspace-files'` |
| B | web-app bundle (bundle layer) | installed 0.1.5-alpha.2 tree, `packages/bundle/web-app/cordis.patch.yml` L110-111 (see `fixture/web-app-patch-excerpt.txt`) | `- insert:` / `- id: workspace-files` / `name: '@deepseek-ai/dsh-api-workspace-files'` |

The two rows are byte-identical in id and name: A re-declares exactly what B already provides.
Note the profile patch's own comment concedes the risk — "如果 web-app bundle 已包含此行则此条为冗余" —
and the bundle excerpt proves it is already included.

### 1.2 Layer at which the collision is detected

The collision is detected in the **plugin-tree composition (loader) layer**, before any plugin
code runs. Crash-log stack (`fixture/boot-crash-log.txt`):

1. `EntryGroup.update` — `@deepseek-ai/cordis-plugin-loader` `lib/index.js:91:28` — throws
   `TypeError: duplicate loader entry id: workspace-files`. The entry id is the **key** of the
   loader entry group; `update` rejects a second entry whose id already exists in the group.
2. Reached from `Include._apply` — `@deepseek-ai/dsh-app-boot` `lib/index.js:240:19` — applying
   the `cordis:include` loader-entry include, i.e. merging each patch layer's rows into one tree.
3. Inside `boot()` — `dsh-app-boot` `lib/index.js:1534`, called from `runProfile`
   (`@deepseek-ai/dsh/lib/profile-boot-*.js:311`) via `runCli` (`bin.js:146`).

So: bundle patch (B) is merged first, then the profile patch (A) is applied on top; the
duplicate is caught while applying A's include, at the loader entry-group level.

### 1.3 Why the loader refuses the whole boot instead of accepting the later row

- **Id = tree key, not a "row".** A loader entry id is the unique slot in the composed plugin
  tree: service registration, config attachment, and dependency ordering all resolve by id.
  Two entries for one id leave the tree's shape ambiguous (which one wins? whose config?
  which one do dependents see?), so "accept the later row" would silently pick a winner and
  hide the ambiguity.
- **Fail-fast, fail-loud.** The loader treats a duplicate id as a composition integrity error
  and throws `TypeError: duplicate loader entry id: workspace-files`, aborting the entire
  `dsh web` boot. A half-applied or last-wins merge would let a profile drift out of sync with
  its bundle and surface later as confusing runtime misbehavior instead of one clear error.
- **Composition is atomic.** `boot()` applies all includes before the app starts; there is no
  "skip the bad row and continue" path by design — the whole `plugin tree failed to load`.

Also worth recording: the maintainer's *premise* was wrong. The 文件资源服务不可用 symptom was
**not** caused by `workspace-files` being absent from the composition — the bundle already
ships it (row B). So the insert was unnecessary from the start; if the sidebar symptom persists
after removing the duplicate, it is a separate investigation (service resolution on the client
side), not a missing composition row.

## 2. Layering rules (profile patch acting on a bundle-provided plugin)

For a profile patch layered on top of a bundle-provided plugin, there are exactly three
operations and only one of them kills the boot:

| Operation | Verdict | Why |
|---|---|---|
| **Change the plugin's config by id** (patch the existing row's config keys, e.g. `- id: workspace-files` + `config:` overrides) | **Safe** | This is the intended layering operation: the bundle stays the single source of the plugin *entry* (id/name), and the profile only refines *config*. One entry, one owner. |
| **Add a row (`insert`) for an id no bundle ships** (a genuinely new plugin, e.g. `dsh-file-trace`, `dsh-profiles` in the profile patch) | **Safe** | `insert` exists to extend the tree with entries the bundle does not provide; no id collision, no ambiguity. |
| **Add a row (`insert`) for an id a bundle already ships** | **Fatal** — boot crash | Re-declares a bundle-owned entry; the loader's entry group rejects the duplicate id and aborts the whole boot (`duplicate loader entry id: workspace-files`). |

**The maintainer's action is the fatal third case.** Proof, in two parts:

- **Evidence row A** (`fixture/profile-patch-excerpt.txt`, last block):
  `- insert:` → `- id: workspace-files` → `name: '@deepseek-ai/dsh-api-workspace-files'` —
  a hand-added insert for an id the bundle already provides (its own comment even flags it as
  possibly redundant).
- **Evidence row B** (`fixture/web-app-patch-excerpt.txt`): the bundle's
  `packages/bundle/web-app/cordis.patch.yml` L110-111 already contains the identical
  `- insert: - id: workspace-files` row (with `session-controller` / `settings-controller`
  likewise bundle-provided and never hand-inserted into the profile patch — the contrast case
  showing the profile patch is meant to hold only external plugins like `dsh-file-trace` /
  `dsh-profiles` plus config-by-id overrides).
- **Crash log** ties them together: `duplicate loader entry id: workspace-files` thrown at
  `cordis-plugin-loader/lib/index.js:91:28` while applying the `cordis:include`.

Rule of thumb: **the bundle owns entries; the profile owns config.** If a plugin appears in the
installed bundle's patch, never `insert` it again from the profile — patch its config by id, or
nothing at all.

## 3. Fix

### 3.1 The exact change

In `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`, **delete the manually appended
`workspace-files` insert block entirely** — the two comment lines
(`# workspace-files: 右侧 Sidebar 文件预览所需的宿主服务（0.1.5 系列新增）`,
`# 如果 web-app bundle 已包含此行则此条为冗余；保留以确保升级 profile 不遗漏`) **and** the row:

```yaml
# delete this whole block:
- insert:
    - id: workspace-files
      name: '@deepseek-ai/dsh-api-workspace-files'
```

Nothing else in the profile patch changes, and no file inside the installed dsh tree is
touched. After the deletion, `dsh web` boots: the bundle's own row (B,
`packages/bundle/web-app/cordis.patch.yml` L110-111) provides the plugin exactly once, as it
did for every other bundle-provided row.

**If a config change for `workspace-files` is genuinely wanted** (e.g. a path or limit), the
safe form is a **config-by-id override on the existing entry**, not a second insert — patch the
entry's config keys by `id: workspace-files` instead of re-declaring `name`. (The evidence
pack shows no such need; the minimal fix is deletion only.)

### 3.2 Is the plugin's code at fault?

**No.** `@deepseek-ai/dsh-api-workspace-files` did not crash anything and its code never ran:
the failure happens in the loader while *composing* the tree (`EntryGroup.update` throwing on
the duplicate id), strictly before any plugin is loaded. The crash is a **patch-composition
error introduced by the hand edit**, not a plugin defect. Nothing in the plugin, the bundle, or
the upgrade itself is broken — the boot simply refuses an ambiguous tree.

### 3.3 Could any plugin-side change resolve it?

**No.** The duplicate-id check lives in `@deepseek-ai/cordis-plugin-loader`'s entry group and
runs before plugin code is loaded; a plugin cannot opt out of, or catch, that check. The only
lever is the **composition input** — i.e. the profile patch (delete row A). The only other
theoretical fixes would be loader/host-side dedup semantics (last-wins or merge), which is
precisely the ambiguity the loader refuses to invent; the correct, minimal, deterministic fix is
the profile-side deletion above.

## 4. Prevention

### 4.1 Maintainer-side prevention (before hand-adding a row)

Before adding any `insert` row to the profile patch, **check the installed bundle's patch
file** — the web-app bundle's `cordis.patch.yml` inside the installed npm tree
(`.../node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-app-boot/` →
`packages/bundle/web-app/cordis.patch.yml`; the 0.1.5-alpha.2 tree keeps it at L110-111 for
`workspace-files`). Concretely, search the installed dsh tree for the id first, e.g. grep for
`id: workspace-files` under `node_modules/@deepseek-ai`, and only `insert` ids that no
bundle ships. Bundle-provided rows visible in the evidence (`workspace-files`,
`session-controller`, `settings-controller`) are exactly the ones that must never be
hand-inserted into the profile patch.

Secondary discipline: treat "sidebar content read fails after an upgrade" as a symptom to
diagnose, not as proof that a composition row is missing — verify the bundle's entry list before
editing the profile patch (here the entry was present all along).

### 4.2 Host-side prevention (making the boot failure actionable)

The current error (`dsh: plugin tree failed to load: failed to apply loader entry include
(cordis:include): duplicate loader entry id: workspace-files`) already names the *id*, but not
*who declared it twice* or *what to do*. At boot the host could print, alongside the throw:

1. **Whom to blame — both sources with locations**: the authoritative (first) declaration and
   the conflicting (later) one, e.g.
   `duplicate loader entry id: workspace-files — first declared by
   packages/bundle/web-app/cordis.patch.yml:110 (bundle layer); re-declared by
   C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml (profile layer)`.
   Naming the layers tells the maintainer the bundle is authoritative and the profile is the
   offender.
2. **What to delete / what to do instead**: an explicit remediation line, e.g.
   `delete the duplicate insert block from the profile patch; if you only need to change this
   plugin's behaviour, patch its config by id instead of inserting a new row`.
3. **Optional hardening**: a pre-flight check that diffs the profile patch's `insert` ids
   against the bundle's entry ids and reports *every* collision up front (instead of aborting
   on the first), plus a hint that the bundle's patch file is the place to look up provided ids.

---

## Summary

- **Root cause**: profile patch row A (`- insert: - id: workspace-files`) duplicates bundle
  row B (`packages/bundle/web-app/cordis.patch.yml` L110-111); detected in the Cordis
  **plugin-tree loader layer** (`cordis-plugin-loader` `EntryGroup.update`, via
  `dsh-app-boot` `Include._apply`/`boot()`); fatal because the loader entry id is the unique
  tree key and the loader fails fast rather than silently picking a winner.
- **Layering**: config-by-id = safe; insert of an unshipped id = safe; insert of a
  bundle-shipped id = fatal (the maintainer's case, proven by profile excerpt row A vs bundle
  excerpt row B).
- **Fix**: delete the hand-added `workspace-files` insert block (with its comments) from
  `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`; plugin code is not at fault and no
  plugin-side change can fix a pre-load composition error.
- **Prevention**: check the installed bundle's `cordis.patch.yml` for an id before inserting;
  host should print both declaring sources with file/layer plus the exact delete-or-override
  remediation.
