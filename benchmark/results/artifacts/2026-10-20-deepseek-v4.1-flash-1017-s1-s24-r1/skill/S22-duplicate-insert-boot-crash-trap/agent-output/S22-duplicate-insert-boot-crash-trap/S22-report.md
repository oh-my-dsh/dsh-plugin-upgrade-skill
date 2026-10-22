# S22 · The Duplicate Insert That Crashed the Boot — diagnosis report

**Mode**: read-only post-upgrade diagnosis (plugin-upgrade skill, Mode A/inspect discipline).
**Subject**: `dsh web` boot crash on a Windows profile created under 0.1.2/0.1.3 and upgraded in place to 0.1.5-alpha.2.
**Evidence used**: `fixture/boot-crash-log.txt`, `fixture/profile-patch-excerpt.txt`, `fixture/web-app-patch-excerpt.txt`, `fixture/README.md` (all read-only, unmodified). Skill references consulted: `references/troubleshooting.md` (duplicate-loader-entry row), `references/api-migration-0.1.2-alpha.2.md` (API-08 composition overlay), `references/v0.1.5-alpha.1.md` (DSH-0.1.5-A1-11, DSH-0.1.5-A1-20), `references/v0.1.6-alpha.1.md` (DSH-0.1.6-A1-02), `references/v0.1.6-alpha.2.md` (plugin-manager card), `references/v0.1.7-alpha.1.md` (DSH-0.1.7-A1-07/A1-08), `references/jump-0.1.5-rc.2-to-0.1.7-rc.1.md` (DSH-0.1.7-J1-15).

---

## 1. Root cause

### The two colliding declarations

| Layer | Declaration site | Row |
|---|---|---|
| Bundle layer (web-app bundle, ships with 0.1.5-alpha.2) | `packages/bundle/web-app/cordis.patch.yml`, installed tree **L110-111** (`fixture/web-app-patch-excerpt.txt` L4-8) | `- insert: - id: workspace-files` / `name: '@deepseek-ai/dsh-api-workspace-files'` |
| Profile layer (user overlay) | `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`, last block **L16-20** (`fixture/profile-patch-excerpt.txt`) | `- insert: - id: workspace-files` / `name: '@deepseek-ai/dsh-api-workspace-files'` |

Same **id** (`workspace-files`), same package name, **two separate `insert` entries**. The rows being byte-identical is exactly why this is a trap: the maintainer's own comment says the row is "冗余" and keeps it anyway to be safe ("保留以确保升级 profile 不遗漏"). Cordis does not treat an identical duplicate insert as a no-op.

### At which Cordis layer the collision is detected

Not at YAML parsing, not at schema/row validation, not at plugin activation — but at the **Cordis loader's entry-group bookkeeping**, while the loader is applying the `cordis:include` overlay file that is the profile patch:

1. `dsh-app-boot` `Include._apply` (`lib/index.js:240` in the crash log, `fixture/boot-crash-log.txt` L12) hands the patch rows to the loader.
2. `@deepseek-ai/cordis-plugin-loader` `EntryGroup.update` (`lib/index.js:91`, crash log L11) tries to key a new entry by an id already present in the same entry group and throws `TypeError: duplicate loader entry id: workspace-files`.
3. `dsh-app-boot` wraps it as `dsh: plugin tree failed to load: failed to apply loader entry include (cordis:include): duplicate loader entry id: workspace-files` (crash log L8-9) and aborts the process (`boot()` at L13 → `runProfile` L14 → `runCli` L15).

So the layer is the **composition/loader layer (Cordis `EntryGroup` inside a `cordis:include` apply)**, strictly *before* any plugin's `apply()` runs. No plugin package was imported, resolved, or executed in the failing boot — the log shows no plugin load line at all, only the loader throw.

### Why the loader refuses the whole boot instead of accepting the later row

- **`insert` means "create an entry", not "patch an existing entry".** Layer precedence (bundle patches in `dsh.profile.bundles` order → profile `cordis.patch.yml` → `$DSH_HOME/cordis.patch.yml` → CLI `--patch`, API-08) is implemented by a patch row *matching an existing id* and replacing that entry's config; later layers win **for an already-defined id**. A second `insert` for the same id is not an override path at all — it is a second claim on the same primary key inside one `EntryGroup`. There is no defined answer to "which of the two becomes the entry", so accepting the later row would be silent last-writer-wins over an author-intent conflict.
- **The id is the composition's identity, not a label.** An entry id keys the entry in the group, and (in the same composition model, later lines) settings/config persist *under the entry id* in `cordis.patch.yml` (DSH-0.1.7-J1-04). Two declarations for one id make config identity and persisted-value ownership ambiguous, so the loader rejects rather than picks.
- **The include apply is one fail-closed unit at boot.** `Include._apply` is not per-row tolerant: a throw inside it propagates to `boot()` as "plugin tree failed to load" and the profile never comes up — every plugin lost, not just this one. 0.1.5-alpha.2 has no tolerance for a malformed composition; the tolerant-profile behavior that lets an unreadable optional bundle be skipped is a later-line change (DSH-0.1.7-A1-08) and explicitly covers unreadable bundles, not duplicate ids.
- **Consequence that matters for triage**: the crash is deterministic and content-determined, and deleting the profile row restores boot with no other change — it is a composition defect, not a runtime/plugin defect.

### The pre-crash symptom is a separate fact, not the insert's justification

The 文件资源服务不可用 error on the right-Sidebar document tab happened **before** the manual insert. It is the post-in-place-upgrade attribution problem: a freshly added bundle module (here `@deepseek-ai/dsh-api-workspace-files`, plus the sibling `ui-sidebar-*` rows) may be missing from the *served* client roster/combo on the first boot after an npm-global in-place upgrade, while the artifact exists in the tree; one host restart commonly self-heals the roster/combo, and one dropped module can take down every client plugin's registration (DSH-0.1.5-A1-20, same 2026-09-09 Windows host, discussion #5999; DSH-0.1.5-A1-11 for the service itself). Inserting the row by hand does not address that failure mode — the row was already composed; the gap was in the served artifact set/roster.

---

## 2. Layering rules for a profile patch acting on a bundle-provided plugin

| Operation from the profile patch | Verdict | Why |
|---|---|---|
| Change the plugin's **config by id** (`- id: <existing-id>` + `config: {...}`, no `insert`) | **Safe** | Matches the existing entry, later layer wins. Caveat: `config` is a **whole replacement**, not a deep merge — restate every field that must survive (API-08 §5). |
| **Insert a row for an id no bundle ships** | **Safe** | This is the normal extension path; the profile's `dsh-file-trace` (L5-7) and `dsh-profiles` (L12-14) rows are exactly this and are correct. |
| **Insert a row for an id a bundle already ships** | **Fatal** | Second `insert` on the same id ⇒ `EntryGroup.update` throws `duplicate loader entry id` ⇒ the whole `cordis:include` apply fails ⇒ boot abort. No override semantics exist for `insert`. |

**Which case is the maintainer's action**: the third one — fatal duplicate insert. The row is `fixture/profile-patch-excerpt.txt` **L16-20**: the comment pair (`# workspace-files: …`, `# 如果 web-app bundle 已包含此行则此条为冗余；保留以确保升级 profile 不遗漏`) plus `- insert:` / `- id: workspace-files` / `name: '@deepseek-ai/dsh-api-workspace-files'`.

**Which evidence row proves it**: `fixture/web-app-patch-excerpt.txt` **L6-8** (`- insert: - id: workspace-files` / `name: '@deepseek-ai/dsh-api-workspace-files'`, annotated "already here (L110-111 in the installed tree)"), corroborated by the crash line itself naming that exact id (`boot-crash-log.txt` L9-10). The adjacent bundle rows `session-controller` (L13-15) and `settings-controller` (L16-18) are the control group: bundle-provided, correctly absent from the profile patch.

Note the asymmetry the trap exploits: the *comment* is true ("if the bundle already has it, this is redundant") but the *action* is not neutral — redundancy in an `insert` is fatal, not harmless.

---

## 3. Fix

**File**: `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml` — the profile patch only. Not the bundle's `cordis.patch.yml`, not anything under `node_modules`, not the plugin package.

**Exact change**: delete the entire final block, **L16-20**:

- the two comment lines (`# workspace-files: 右侧 Sidebar 文件预览所需的宿主服务（0.1.5 系列新增）` and the "冗余 / 保留以确保…" rationale — delete it too, it encodes the wrong rule and will be re-copied), and
- `- insert:` / `- id: workspace-files` / `name: '@deepseek-ai/dsh-api-workspace-files'`.

Leave every pre-existing row (`dsh-file-trace`, the six external client plugins, `dsh-profiles`) untouched. Result: the profile patch contains **zero** rows for `workspace-files`; the bundle row becomes the single declaration and boot proceeds.

**Do not "fix" it by turning the insert into an override.** There is nothing to override for this symptom — no profile-level config is required for the file service to work. If a config override is ever genuinely needed, the safe shape is a row keyed by the existing id with a full `config:` block (no `insert`), per the safe case in §2.

**Is the plugin's own code at fault? No.** `@deepseek-ai/dsh-api-workspace-files` is a bundle-provided, unmodified package; the failing boot never imported it. The defect is a duplicate row in a profile overlay — a composition-ownership problem in the profile maintainer's file.

**Could any plugin-side change resolve the boot failure? No.** The throw happens in the loader's entry-group bookkeeping before any plugin code is reached, so a plugin cannot observe, catch, or prevent it. Concretely: a plugin cannot delete a row from the profile's `cordis.patch.yml`; it cannot make `EntryGroup.update` tolerate a duplicate id (that is Cordis loader semantics, not a plugin capability); and "renaming its way out" is not a fix either — changing the package/registration id to dodge the collision would desynchronise the bundle row, the client roster and the registration id (the `loaded without registering` failure class, DSH-0.1.2-A1-26) while leaving the duplicate insert in place for the next `workspace-files` consumer. Publishing a new plugin version, reinstalling the package, or editing plugin source changes nothing about this crash. **Only the profile composition edit fixes the boot.**

**After the boot is restored, treat the original symptom separately** (do not re-add the row): fully stop the host, start `dsh web` once to let the roster/combo re-form; if the document tab still reports 文件资源服务不可用, attribute before touching composition — fetch one *new* bundle module and one *old* module at the same rev; old 200 + new 404 pins it to the host artifact/rev set (not to the plugin, not to a missing row), and if a restart does not heal it, roll the global install back to a pinned previous version and report upstream (DSH-0.1.5-A1-20).

---

## 4. Prevention

### What to look at in the installed bundle *before* adding a row by hand

1. **Which bundles the profile composes, and in what order**: the profile manifest's `dsh.profile.bundles` list (that order is the precedence order). In this incident the web-app bundle is in the stack, which is the whole reason the row must not be inserted.
2. **The bundle's own patch file inside the installed tree**: read the `cordis.patch.yml` of each bundle package under the npm tree (source location `packages/bundle/web-app/cordis.patch.yml`, installed under the profile/global `node_modules` — the fixture proves it via the installed path, L110-111). Grep it for the candidate id (`id: workspace-files`) before writing anything. A one-line grep would have ended this incident.
3. **The composed result, not the snippet**: `dsh --profile web --dump-config` starts no GUI and no model and prints every row's id / name / config plus unmatched-target diagnostics (API-08 verification). A row already present ⇒ any `insert` of that id is a duplicate by construction; a row present but disabled ⇒ the correct operation is a config/enable override by id, never a second insert.
4. **Then classify the intended operation**: extend (insert — id must be absent from every composed layer) vs override (match by id, whole-config replacement). Also check the *other* bundles in the list, since a duplicate between two bundles is the same fatal class.

Process-side: keep profile-patch inserts reserved for out-of-tree plugin ids (as `dsh-file-trace` / `dsh-profiles` do here), and prefer the bundle/row management surface over hand edits — the plugin-manager line writes row toggles into the profile patch and refuses a duplicate id (DSH-0.1.6-A2), so the same mistake becomes a refused operation instead of a dead boot.

### What the host could print at boot to make this failure actionable

Today's output names one thing only — the id — and then a bare `TypeError` with a loader-internal stack (`EntryGroup.update`), which reads as "the workspace-files plugin is broken" and invites the exact wrong remedies (reinstall the package, patch the plugin, add another row). A useful diagnostic block would state, in this order:

1. **The conflict**: `duplicate loader entry id: workspace-files` (keep the machine-readable form), and that this is a **composition** error, not a plugin error, with the explicit line "boot aborted before any plugin was imported; debugging or reinstalling the plugin will not help".
2. **Both declaration sites, attributed**: bundle layer `@deepseek-ai/dsh-bundle-web-app@0.1.5-alpha.2` → absolute installed path `…/cordis.patch.yml:110-111` (authoritative, shipped); profile layer → `%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml:18-20` (the overlay). Each with layer name, package version, and line range — the crash log currently carries none of these.
3. **The verdict and the responsible party**: "the profile patch duplicates an id the web-app bundle already ships; the bundle row is authoritative — the profile patch is at fault."
4. **The exact remediation**: the file to edit and the line range to delete (the block from the comment through `name:`), plus the safe alternative when an override is really wanted (`- id: workspace-files` + full `config:`, no `insert`), plus "do not edit the bundle, do not touch `node_modules`, do not change the plugin".
5. **A pre-flight pointer**: `dsh --profile web --dump-config` reports duplicate ids and row provenance without starting the app, so the same audit is available before the next hand edit; a non-zero exit plus a stable error code (e.g. `E_DUPLICATE_LOADER_ENTRY`) lets wrappers and CI distinguish this from a genuine plugin failure.
6. **Author/bundle-review side**: bundle authors should be told the same rule at pack time — a bundle must not insert an id another bundle in the same profile list ships; a cross-bundle duplicate fails identically at `EntryGroup.update` and deserves the same two-site attribution.

---

## Evidence and attribution summary

- **Root cause**: duplicate `insert` of entry id `workspace-files` — bundle (`web-app-patch-excerpt.txt` L6-8, installed L110-111) + profile (`profile-patch-excerpt.txt` L16-20) — rejected by the Cordis loader (`EntryGroup.update`, crash log L11-12) while applying a `cordis:include` overlay (crash log L8-9, L13-15).
- **Fix**: delete `profile-patch-excerpt.txt` L16-20 from `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`; no plugin change is possible or relevant.
- **Not at fault**: `@deepseek-ai/dsh-api-workspace-files` (never imported in the failing boot), the web-app bundle row (authoritative), and the loader's strictness (deliberate, fail-closed).
- **Skill anchors**: troubleshooting duplicate-loader-entry row · API-08 (composition overlay, precedence, whole-config replacement) · DSH-0.1.5-A1-11 (workspace-files surface) · DSH-0.1.5-A1-20 (post-in-place-upgrade roster/combo gap) · DSH-0.1.6-A1-02 (startup audit strictness) · DSH-0.1.6-A2 (plugin-manager writes row toggles, refuses duplicates) · DSH-0.1.7-A1-07 / DSH-0.1.7-J1-15 (ordered patch lists) · DSH-0.1.7-A1-08 (tolerant profile loading, does not cover duplicate ids).
- **Verification limit (honest)**: the evidence pack is excerpts plus a crash log; no live profile tree, installed bundle tree, or `--dump-config` output was available in this read-only container, so the exact line ranges are those cited by the excerpts and the remediation is prescribed against them. Confirmation on the real machine is one command — `dsh --profile web --dump-config` after deleting the block — expecting a single `workspace-files` row sourced from the bundle and no pending entries.
- **Fixture integrity**: `fixture/` was only read; nothing in it was written, renamed, or reformatted.
