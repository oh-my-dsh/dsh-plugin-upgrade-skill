# JUDGE BRIEF · skill.S22-duplicate-insert-boot-crash-trap

## Criteria (sealed rubric)
- [duplicate-loader-attribution] (20pt) Compare profile-patch-excerpt.txt and web-app-patch-excerpt.txt: both insert id workspace-files, and boot-crash-log.txt locates rejection at Cordis EntryGroup.update during include/compose. Duplicate insertion is fatal to this boot rather than silent merge/last-write-wins. Reject the profile comment’s assertion that keeping the duplicate is harmless redundancy.
- [three-layering-cases] (20pt) Distinguish all three requested operations: config override by existing id is allowed; inserting a genuinely new, otherwise unprovided id is allowed; inserting an already bundle-provided id is fatal. Classify the maintainer’s row as the third case and ground it in the two excerpts. Partial credit for a substantively correct but incomplete comparison.
- [minimal-profile-fix] (20pt) Remove only the redundant workspace-files insert block from the profile cordis.patch.yml, preserving the bundle’s original service and unrelated external plugins/config. If configuration needs adjustment, use an override rather than a second insertion. Renaming the extra instance, deleting the bundle’s service, or adding another insert is not the minimal correct fix.
- [plugin-and-failure-boundary] (20pt) Explain that this boot crash is a profile composition error before plugin execution, so changing the external plugin code cannot resolve the duplicate id. Removing the duplicate restores the possibility of boot; it does not establish that the earlier resource-metadata read failure has been cured. Keep that separate problem subject to verification.
- [author-and-host-prevention] (20pt) Before inserting, inspect/grep the installed web-app bundle’s cordis.patch.yml (and other composing bundles) for the id and distinguish override from insert. Propose a host diagnostic naming workspace-files and both declaration origins, pointing to removal of the redundant profile block. “Check for duplicates” alone without where/how or an actionable host message is incomplete.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [retain-or-add-duplicate] ceiling=20 The final advice keeps/adds the duplicate as harmless redundancy, asserts duplicate inserts silently merge, or tries to cure this boot failure by editing the external plugin instead of correcting the profile composition. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.

## Candidate report(s)
#### FILE: S22-duplicate-insert-boot-crash-trap/S22-report.md

# S22 · The Duplicate Insert That Crashed the Boot — Analysis Report

**Task:** S22-duplicate-insert-boot-crash-trap (read-only diagnosis)
**Mode:** plugin-upgrade skill · Mode A (inspect / read-only diagnosis) — no file was modified, no install or migration was run.
**Evidence:** `fixture/boot-crash-log.txt`, `fixture/profile-patch-excerpt.txt`, `fixture/web-app-patch-excerpt.txt`, `fixture/README.md`
**Host in question:** dsh `0.1.5-alpha.2` (npm global, Windows 11), profile `web` created under 0.1.2/0.1.3 and upgraded in place.

---

## 0 · Summary in one paragraph

The maintainer manually added a `- insert: - id: workspace-files` row to the **profile's**
`cordis.patch.yml`. The **web-app bundle** already ships exactly that row (same id, same package).
Two rows with the same loader-entry id therefore entered the composed entry tree, and the Cordis
loader refused to apply the profile layer's insert operation: `duplicate loader entry id:
workspace-files`, thrown inside `EntryGroup.update` (`@deepseek-ai/cordis-plugin-loader`) while
`@deepseek-ai/dsh-app-boot` was still **applying loader entry includes** — i.e. at
*composition* time, before any plugin module was imported. The fix is one deletion in one file:
remove the hand-written `workspace-files` insert block from
`C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`. The plugin's own code is **not** at fault
and **no** plugin-side change can rescue this boot. Prevention is a read of the installed
bundle's own `cordis.patch.yml` before any hand insert, plus a host-side diagnostic that names
the colliding id, the file that already owns it, the file that tried to insert it, and the
remedy.

---

## 1 · Root cause

### 1.1 The two colliding declarations

| # | Owner | Layer | Declaration |
|---|---|---|---|
| A | **web-app bundle** — `packages/bundle/web-app/cordis.patch.yml` (installed 0.1.5-alpha.2 tree, **L110-111**) | bundle patch layer (composition layer 1) | `- insert:` → `- id: workspace-files` / `name: '@deepseek-ai/dsh-api-workspace-files'` |
| B | **profile** — `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml` (last block of the file) | profile patch layer (composition layer 2) | `- insert:` → `- id: workspace-files` / `name: '@deepseek-ai/dsh-api-workspace-files'` |

Evidence: `fixture/web-app-patch-excerpt.txt` (*"The workspace-files row is already here (L110-111
in the installed tree)"*) vs. `fixture/profile-patch-excerpt.txt` (the manually appended block
annotated *"workspace-files: 右侧 Sidebar 文件预览所需的宿主服务（0.1.5 系列新增）"* and *"如果 web-app bundle
已包含此行则此条为冗余；保留以确保升级 profile 不遗漏"* — the comment literally names the
hazard it then walks into).

**The collision key is the loader-entry `id`, not the package name.** Both rows name the same
package as well, but the loader's uniqueness invariant is on `id`. (A same package under two
*different* ids would be a different, non-fatal hazard — the duplicate-instance trap — and is not
what happened here.)

### 1.2 At which Cordis layer the collision is detected

Not at plugin activation, and not in the plugin — at the **Cordis Loader composition layer**,
specifically while the host applies a **loader entry include** operation:

`@
dsh-app-boot/lib/index.js:1534  boot()
  → dsh-app-boot/lib/index.js:240   Include._apply()          // applies a cordis:include entry op
    → cordis-plugin-loader/lib/index.js:91  EntryGroup.update()  // ← TypeError thrown here
  → dsh-app-boot/lib/index.js:1545  rethrow: "dsh: plugin tree failed to load:
        failed to apply loader entry include (cordis:include): duplicate loader entry id: workspace-files"
`@

* The failing operation is the profile patch's `insert` block, which the host models as a
  loader entry *include* (`cordis:include`).
* The throw site is `EntryGroup.update` — the loader's entry-group bookkeeping, whose invariant
  is "one entry per id" in the composed tree.
* The failure therefore happens in the **tree-load / patch-apply stage**, strictly *before* any
  entry's module is imported and applied. Nothing of the host was started; the process exits
  (stack: `runProfile` → `runCli` → uncaught → `Node.js v24.14.1` exit).

### 1.3 Why the loader refuses the whole boot instead of accepting the later row

Three reasons, all inherent to how Cordis composition works:

1. **`insert` is an additive operation; precedence governs *config replacement*, not id
   collisions.** The composition precedence (bundle patches in `dsh.profile.bundles` order →
   `$DSH_HOME/profiles/<name>/cordis.patch.yml` → `$DSH_HOME/cordis.patch.yml` → `--patch`
   overlays) means later layers win — but only when a later layer *restates* an existing row
   (config is then the **whole replacement**, not a deep merge). A later layer that *inserts* a
   second row with an id that already exists does not "win"; it creates a second entry that
   would make every id-keyed lookup ambiguous.
2. **The entry id is the identity key of the composed tree.** Config resolution, the boot
   roster, `--dump-config`, Plugin Manager row toggles and the client plugin roster all key on
   the entry id. Two entries with one id would make "which row is mine?" undecidable, and the
   loader would have to silently pick one — which is precisely the ambiguity the loader refuses to
   invent. Uniqueness is therefore a hard invariant, enforced at update time
   (`EntryGroup.update`) rather than tolerated.
3. **Fail-closed, not partial.** The error surfaces in the *tree load* stage, where there is no
   meaningful half-built state to fall back to: the host cannot start "the rest of the plugins
   except the ambiguous one" without hiding the misconfiguration behind partial behavior — and
   the maintainer's original symptom ("the workspace-files host service is missing") is exactly
   the kind of symptom a partial boot would mask. Hence the whole boot aborts with the stage and
   detail attached.

For contrast, the loader is *not* broken: it is doing exactly what the composition model
demands. The defect is in the **overlay content** (a hand-added row), not in the loader and not in
the plugin.

---

## 2 · Layering rules for a profile patch acting on a bundle-provided plugin

| Operation (profile layer) | Result | Why | Skill/card evidence |
|---|---|---|---|
| **(a) Change the config of a bundle-provided plugin *by its id*** — restate the row with the same id and a full `config:` object | ✅ **safe** | A matching id is an *override*, not an insert. Note: `config` is the **whole replacement, not a deep merge** — every field that must be kept has to be restated | API-08 (`references/api-migration-0.1.2-alpha.2.md`); DSH-0.1.2-A1-23 (`session-telemetry-otel` must restate the whole config); DSH-0.1.6-A1-29 (re-enable by setting `disabled: false` on the existing `tool-ralph` row); DSH-0.1.7-J1-12 |
| **(b) Add a row for an id *no* bundle ships** (e.g. `dsh-file-trace`, `dsh-profiles`) | ✅ **safe** | A genuinely new id; the loader has no conflict, the entry is composed and activated normally | `fixture/profile-patch-excerpt.txt` (the six external client-plugin rows + `dsh-profiles`); rollup R-10 (add `subagent-model-selection-settings` **only** because `dsh-base` does not ship that line, unlike `dsh-web-app`) |
| **(c) Add a row for an id a bundle *already* ships** | ❌ **fatal** | Duplicate loader entry id → the whole boot aborts at the loader entry-group layer | `references/troubleshooting.md` row *"重启后宿主启动即崩：duplicate loader entry id: <id> (dsh-app-boot → cordis-plugin-loader → EntryGroup.update)"*; DSH-0.2.0-RC1-04 (same collision class: "the loader to reject the duplicate id at boot") |

### Which case is the maintainer's action

**Case (c) — fatal.** Proof row, the last block of the profile patch
(`fixture/profile-patch-excerpt.txt`):

`@
# workspace-files: 右侧 Sidebar 文件预览所需的宿主服务（0.1.5 系列新增）
# 如果 web-app bundle 已包含此行则此条为冗余；保留以确保升级 profile 不遗漏
- insert:
    - id: workspace-files
      name: '@deepseek-ai/dsh-api-workspace-files'
`@

collides with the web-app bundle's row of the same id and package
(`fixture/web-app-patch-excerpt.txt`, installed tree L110-111):

`@
- insert:
    - id: workspace-files
      name: '@deepseek-ai/dsh-api-workspace-files'
`@

Two further points from the evidence that confirm the diagnosis and show the maintainer's premise
was wrong:

* The bundle excerpt's adjacent rows (`session-controller`, `settings-controller`) carry the
  note *"likewise bundle-provided and **were never manually inserted into the profile patch**"*
  — i.e. the correct practice was already being followed for those two ids. The
  `workspace-files` insert is the one deviation.
* The premise "the workspace-files host service is missing from the profile composition" is
  **false**: `workspace-files` is bundle-provided and therefore *always* in the web profile's
  composition, with or without the profile row. The manual insert could not have repaired a
  missing service; it could only ever add a duplicate id.

---

## 3 · Fix

### 3.1 The minimal correct change — one file, one deletion

**File (the only file to change):**
`C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml` — the profile's own composition
overlay, *not* the bundle, *not* the plugin.

**Change:** delete the final hand-added block in full, i.e. the comment lines
(`# workspace-files: …` / `# 如果 web-app bundle 已包含此行则此条为冗余；…`) **and** the
`- insert: - id: workspace-files / name: '@deepseek-ai/dsh-api-workspace-files'` entry.

Do **not**:
* edit the installed bundle's `packages/bundle/web-app/cordis.patch.yml` (it is correct; it is
  the bundle that legitimately owns the row);
* edit, re-package or re-version `@deepseek-ai/dsh-api-workspace-files` or any other plugin;
* add a *second* row with a different id to "work around" the duplicate — a second entry id for
  the same package is the duplicate-instance hazard, not a fix;
* change the profile's `package.json` / bundle list for this symptom.

If the maintainer genuinely wants different `workspace-files` behaviour, the correct expression
is case **(a)**: restate the row **by id** with the desired `config:` (whole-object
replacement, restating every field to keep), never a second `insert`.

### 3.2 Is the plugin's own code at fault?

**No.** `@deepseek-ai/dsh-api-workspace-files` and the `workspace-files` entry are correct and
were never even loaded: the boot died in the patch-apply stage, before module import
(`EntryGroup.update` → `Include._apply` → `boot`). There is no plugin-side defect, no
version mismatch of the plugin, and no plugin API change implicated in this crash.

### 3.3 Could any plugin-side change resolve the boot failure?

**No.** The failure is a property of the *composed entry tree*, evaluated before any plugin
entry's module is imported or applied. A plugin cannot veto, tolerate or dedupe another layer's
insert, because the loader's uniqueness check runs on the composition, upstream of plugin code.
The only layer that can resolve it is the layer that introduced the offending row — the profile
patch. (Corollary for the skill's Mode B/C discipline: a plugin-level "fix" here would be
misattribution; the failure attribution is **profile-config / composition**, not plugin-code.)

### 3.4 After the deletion — the *original* symptom is a separate question

Removing the row restores boot, but the symptom that triggered the insert (**right-Sidebar
document tab opens, content read fails — 文件资源服务不可用**) is not proven to be fixed by it.
Per the skill's cards, two host-plane candidates must be checked next, in this order:

1. **Artifact/combo gap after an in-place npm-global upgrade** — DSH-0.1.5-A1-20: an upgraded
   npm-global profile can serve a client combo that omits newly-added bundle modules; the first
   unregistered entry is named and *all* client plugins fail to load; a **host restart
   self-heals** the roster/combo mismatch, and rollback to the previous published version is the
   escape hatch. (The 0.1.5 series is exactly the series that added `workspace-files` /
   `ui-sidebar-*` rows to `dsh-web-app`, per DSH-0.1.5-A1-16.)
2. **Stale API callers of `workspaceFiles`** — DSH-0.1.5-A2-01 (at alpha.2 the first parameter
   is a `workspaceFileScope`, not an `Agent`; `reload`/`restat` are gone, `readAll`/
   `readRelated` are new), DSH-0.1.5-A2-02 (`maxFileBytes`, reads no longer workspace-confined),
   DSH-0.1.5-A2-09 / A2-21 (document previews; `ui-sidebar-textpreview` renamed to
   `ui-sidebar-documentpreview`; `ctx.documentPreviews` registry). A caller still using the
   0.1.5-alpha.1 signature would see exactly a "file read failed" symptom in the sidebar.

Recommended order after deleting the row: fully stop the host process, start `dsh web` again,
hard-refresh the browser, and check the boot roster for the `workspace-files` / `ui-sidebar-*`
modules (DSH-0.1.5-A1-20's healing restart). Only if the document read still fails, attribute it
to the two candidates above. *(This report performs no live-host probing; §5 lists this as
unconfirmed.)*

---

## 4 · Prevention

### 4.1 Before adding a row by hand — what to look at in the installed bundle

1. **The installed bundle's own composition file.** For a web profile, the authoritative source
   is the installed `dsh-web-app` bundle's `cordis.patch.yml` (in the npm-global tree, under
   the host package's `node_modules/@deepseek-ai/…`; the fixture proves the row at
   `packages/bundle/web-app/cordis.patch.yml` L110-111). Grep it for the id you intend to
   insert:
   `rg -n "id:\s*workspace-files" <dsh-install-root>/node_modules/@deepseek-ai`
   If the id is already there → **do not insert**; override its config by id (case (a)).
2. **All bundle layers in play**, not just one: the profile manifest's `dsh.profile.bundles`
   list (composition layer 1) determines which bundle patch files participate; a row can be
   shipped by `dsh-base`, `dsh-web-app`, or a third-party bundle.
3. **The composed result, before restarting.** `dsh --profile <p> --dump-config` (read-only)
   shows layers, row ids/names and the resolved config — the skill's prescribed enablement
   check ("no old source or duplicate rows"). It also shows *which* layer owns each row.
4. **The sibling rows as a template.** The profile's own `session-controller` /
   `settings-controller` rows are bundle-provided and were never hand-inserted — the profile
   should only ever contain ids that no composed bundle ships.
5. **A lint rule, not a comment.** The block's own comment already said *"if the bundle already
   contains this row, this is redundant; keep it anyway to be safe"* — a comment cannot be
   enforced. A preflight check "profile patch inserts an id already shipped by a composed
   bundle" (the skill's enablement-resolution layer) turns that comment into a hard error.

### 4.2 What the host could print at boot to make this actionable

The current message is `duplicate loader entry id: workspace-files` plus a stack inside
`cordis-plugin-loader` — it identifies the *mechanism* but not the *owner*, the *culprit file*,
or the *remedy*, which is exactly why the maintainer guessed wrong twice (first that the row
was missing, then that the bundle and the profile could coexist).

A boot-time diagnostic worth printing, at the point where the loader detects the collision:

`@
dsh: duplicate loader entry id: workspace-files
  already provided by : web-app bundle  packages/bundle/web-app/cordis.patch.yml:110
  re-inserted by      : profile patch  C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml:NN
  this is a composition error, not a plugin error — no plugin code was loaded.
  fix: delete the "insert: - id: workspace-files" block from the profile patch above
        (or override the row's config by id instead of inserting a second row).
`@

Concretely, the host should print: (1) the **colliding id**; (2) the **owning layer and file
+ line** of the existing row (the bundle); (3) the **attempting layer and file + line** (the
profile patch); (4) the **attribution** ("composition / profile-config — not a plugin fault, no
plugin was loaded"); (5) the **exact remedy** ("delete this insert block" vs. "override the
config by id"); and ideally (6) **all collisions at once** rather than failing on the first, so
a profile with several duplicates is fixed in one pass. The 0.1.7+ line already moves in this
direction for *other* failure classes — "plugin-manager duplicate-id diagnostics" is named as a
touchpoint in DSH-0.2.0-RC1-04, and DSH-0.1.7-A1-08 made profile loading *tolerant* of a
broken bundle (the profile loads, the Plugin Manager keeps the error plus disable/remove
controls) — but a *duplicate id* is a hard composition error and cannot be tolerated silently;
it must at least be reported with owner + culprit + remedy.

### 4.3 Author-side (plugin / bundle authors)

* A bundle that ships a row owns that id for every profile that composes it: publishing a row
  id is an **API commitment** to downstream overlays, which may only *override* it, never
  re-insert it. Bundle authors should keep the shipped-id list in the bundle README so overlays
  can check against it (the same reasoning as DSH-0.1.5-A1-16's "when copying a web profile
  composition, add the five new rows" — that advice is only valid for compositions that do
  **not** already include `dsh-web-app`, and is a frequent source of this exact duplication).
* Plugin authors must not self-insert rows the host bundle already provides; a plugin that needs
  a *different* package under the same id must either use its own id (distinct package) or be
  shipped as the provider of that id.
* Every published version edge that adds a bundle row should be announced as a
  "**id becomes bundle-owned**" note — that is the moment an existing profile patch row turns
  from "the only declaration" into "a fatal duplicate" (here: `workspace-files` and the
  `ui-sidebar-*` family, added in the 0.1.5 series).
* For the 0.1.5-series specific case, the *right* upgrade recipe for a profile created under
  0.1.2/0.1.3 is "**nothing to add**" — the web-app bundle already ships the new rows; an
  upgraded profile needs no compensating insert.

---

## 5 · Method, scope and unconfirmed items

* **Method:** read the four fixture files once; read the `plugin-upgrade` skill
  (`SKILL.md`) and the relevant reference cards once each; no host introspection, no
  `dsh --version` / `--dump-config` / `cordis_inspect_*` calls, no installs, no migrations;
  nothing outside this cell directory was read and nothing outside the report directory was
  written. The fixture was not modified.
* **Attribution (skill's failure-attribution taxonomy):** **profile-config / composition** —
  *not* plugin-code, *not* dependency-resolution, *not* dsh-runtime.
* **Unconfirmed (not verifiable from the brief + fixture; deliberately not guessed):**
  * the exact line number of the offending block inside the real
    `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml` (the fixture is an excerpt);
  * the precise absolute path of the installed `dsh-web-app` bundle's `cordis.patch.yml` in
    the npm-global tree (the fixture states "packages/bundle/web-app/cordis.patch.yml; proven via
    the installed node_modules path", row at L110-111);
  * the root cause of the *original* 文件资源服务不可用 symptom — §3.4 lists DSH-0.1.5-A1-20
    (client-combo / artifact gap, self-healed by a host restart) and the DSH-0.1.5-A2-01/02/09/21
    API changes as the two candidates; distinguishing them requires a live boot, which this
    read-only task does not perform;
  * the host-side diagnostic text in §4.2 is a **proposal**, not a quotation from the host.
* **Skill/card basis used:** API-08 (`cordis.patch.yml` is composition; whole-config
  replacement; composition precedence) · DSH-0.1.2-A1-23 (config override by id restates the
  whole config) · DSH-0.1.6-A1-29 / DSH-0.1.7-J1-12 (override an existing row by id) · rollup
  R-10 (add a row only when the composed bundle does not ship it) · DSH-0.1.5-A1-16 (the
  0.1.5 series adds `workspace-files` / `ui-sidebar-*` rows to `dsh-web-app`) ·
  DSH-0.1.5-A1-20 (in-place npm-global upgrade ⇒ client combo may omit newly added bundle
  modules; restart self-heals) · DSH-0.1.5-A2-01 / A2-02 / A2-09 / A2-21 (0.1.5-alpha.2
  `workspaceFiles` / document-preview API changes) · DSH-0.2.0-RC1-04 (same duplicate-id
  collision class; plugin-manager duplicate-id diagnostics) · DSH-0.1.7-A1-08 (tolerant profile
  loading for *other* failure classes) · `troubleshooting.md` row on `duplicate loader entry
  id` (Cordis composition rule, cross-version, upstream discussion #5999).


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.