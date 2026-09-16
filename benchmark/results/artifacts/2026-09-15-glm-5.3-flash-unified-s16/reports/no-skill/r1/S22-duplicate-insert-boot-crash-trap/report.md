# S22 · The Duplicate Insert That Crashed the Boot — Diagnosis Report

Incident: `dsh web` boot crash after an in-place upgrade to dsh 0.1.5-alpha.2 on a Windows
profile created under 0.1.2/0.1.3, immediately following a manual `workspace-files` insert
into the profile's `cordis.patch.yml`.

Evidence used (read-only, under `/app/fixture/`):

- `boot-crash-log.txt` — full `dsh web` crash output
- `profile-patch-excerpt.txt` — `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml` with the manual insert
- `web-app-patch-excerpt.txt` — the installed web-app bundle's `cordis.patch.yml`
- `README.md` — evidence-pack index

---

## 1. Root cause

**Which two declarations collide.** Two `insert` rows declare the *same loader entry id*
`workspace-files` (both pointing at `@deepseek-ai/dsh-api-workspace-files`):

1. The **web-app bundle's** `cordis.patch.yml`
   (`packages/bundle/web-app/cordis.patch.yml` in the installed 0.1.5-alpha.2 tree,
   lines 110–111 per the excerpt):

   ```yaml
   - insert:
       - id: workspace-files
         name: '@deepseek-ai/dsh-api-workspace-files'
   ```

2. The **profile's** `cordis.patch.yml`
   (`C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`, the manually appended block the
   maintainer added after the 文件资源服务不可用 symptom):

   ```yaml
   - insert:
       - id: workspace-files
         name: '@deepseek-ai/dsh-api-workspace-files'
   ```

Loader entry ids are unique keys across the assembled plugin tree. When the boot applies
the include that merges the profile patch on top of the bundle patch, the entry group
already contains `workspace-files`, so inserting it a second time is a duplicate-id
violation. (The maintainer's own comment in the profile patch even anticipated this:
"如果 web-app bundle 已包含此行则此条为冗余" — it was indeed redundant, and worse,
fatal.)

**At which Cordis layer the collision is detected.** In the **plugin-loader entry-group
assembly layer** — i.e., during the `cordis:include` loader-entry apply step of boot, not
inside any plugin. The stack trace pins it precisely:

- `TypeError: duplicate loader entry id: workspace-files` thrown at
  **`EntryGroup.update`** (`@deepseek-ai/cordis-plugin-loader/lib/index.js:91`),
- called from **`Include._apply`** (`@deepseek-ai/dsh-app-boot/lib/index.js:240`),
- during **`boot`** (`dsh-app-boot/lib/index.js:1534`), surfaced as
  `Error: dsh: plugin tree failed to load: failed to apply loader entry include (cordis:include)`.

So the failure happens while building the declarative plugin tree (merging patch layers
into the loader's entry registry) — before any plugin module is loaded, instantiated, or
any service registered. It is a declaration-merge error, not a runtime/service error.

**Why the loader refuses the whole boot instead of accepting the later row.** The entry
group is a set keyed by id; `update()` treats a repeated id as a hard invariant violation
and throws. Last-wins/dedup silent acceptance is deliberately not an option here because:

- **Ambiguity**: with two declarations for the same id, the loader would have to guess
  which one wins (profile over bundle? later over earlier?), which config applies, and in
  what scope/order — any guess silently changes the tree's composition.
- **It would mask real errors**: a silent override would hide both genuine user mistakes
  (this incident) and version-skew problems (a stale profile row shadowing or being
  shadowed by a bundle row after an upgrade), letting a mis-composed tree boot.
- **Atomicity of the include**: the include is applied as one step at boot; the failure
  occurs before anything is loaded, so the loader aborts the whole boot rather than boot
  a partially/incorrectly assembled tree. The error is non-recoverable by design —
  the fix belongs in the patch files, not in tolerating the collision.

## 2. Layering rules for a profile patch acting on bundle-provided plugins

| Operation | Verdict | Why |
|---|---|---|
| **Change a bundle-provided plugin's config by id** | **Safe** | The profile layer refines the bundle layer; a config-by-id override attaches settings to the existing entry without creating a new one. Ids stay unique. |
| **Add an insert row for an id no bundle ships** | **Safe** | Pure extension of the tree with a new external plugin (exactly what the profile's `dsh-file-trace` and `dsh-profiles` rows do — no collision because the bundle never declares those ids). |
| **Add an insert row for an id the bundle already ships** | **Fatal** | Creates a second loader entry with the same id → `duplicate loader entry id` → the whole boot refuses to load. |

**Which case is the maintainer's action:** the fatal third one — a hand-written `insert`
row for `workspace-files`, an id the web-app bundle *already provides* in 0.1.5-alpha.2.
The insert operation is "declare a new entry", not "reference or configure an existing
one", so re-declaring a bundle-shipped id can only collide.

**Which evidence row proves it:** the web-app bundle excerpt —
`packages/bundle/web-app/cordis.patch.yml` lines 110–111 in the installed tree:

```yaml
- insert:
    - id: workspace-files
      name: '@deepseek-ai/dsh-api-workspace-files'
```

— which declares the identical id/package that the profile excerpt's manual block
re-declares. The adjacent bundle rows (`session-controller`, `settings-controller`) are
the corroborating context: those bundle-provided plugins were *never* manually inserted
into the profile patch, and they cause no trouble — confirming the rule.

## 3. Fix

**What to change, and in which file:** delete the manually appended block from the
**profile's** `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml` (the trailing lines shown
in `profile-patch-excerpt.txt`):

```yaml
# workspace-files: 右侧 Sidebar 文件预览所需的宿主服务（0.1.5 系列新增）
# 如果 web-app bundle 已包含此行则此条为冗余；保留以确保升级 profile 不遗漏
- insert:
    - id: workspace-files
      name: '@deepseek-ai/dsh-api-workspace-files'
```

That is the entire fix, and it is minimal: the bundle already ships and inserts the
plugin, so after deletion the loader entry exists exactly once (from the bundle side) and
the boot proceeds. Nothing should be added to the profile to "keep it explicit" — the
comment's "保留以确保升级 profile 不遗漏" reasoning is exactly the trap: keeping the row
is what breaks the boot. (If per-install customization of this plugin is ever needed, the
correct profile-side operation is a config-by-id override, not an insert.)

**Is the plugin's own code at fault?** No. `@deepseek-ai/dsh-api-workspace-files` is
declared identically on both sides and never gets the chance to run; the crash is purely
in patch-layer declaration merging. Nothing in the plugin's package, exports, or config
participates in the failure.

**Could any plugin-side change resolve the boot failure?** No. A duplicate-id collision
across two `cordis.patch.yml` files can only be resolved by editing one of those patch
declarations — and the bundle's copy is correct and must stay, so the only correct edit
is removing the profile-side row. No code change, rename, re-install, or config tweak
inside the plugin can make two same-id loader entries mergeable.

**Follow-up note on the original symptom:** removing the row fixes the *boot crash*, not
necessarily the original 文件资源服务不可用 read failure. Since 0.1.5-alpha.2's bundle
already loads `workspace-files`, if the Sidebar content read still fails after the fix,
the problem lies elsewhere (service availability/config at the bundle or host layer, or
an upgrade-skew issue) and should be diagnosed separately — but never by re-adding the
insert row.

## 4. Prevention

**Author/maintainer-side — before hand-adding a row, inspect the installed bundle:**

- Locate the bundle patch in the *installed* tree (the crash log gives the exact root):
  `C:\Users\lhh\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\node_modules\...`,
  i.e. `packages/bundle/web-app/cordis.patch.yml` under the installed 0.1.5-alpha.2
  package.
- Grep it for the intended id before writing anything, e.g.
  `Select-String -Path ...\packages\bundle\*\cordis.patch.yml -Pattern "workspace-files"`.
  If the id appears, the bundle ships it: configure by id if needed, and never insert.
- Mentally classify the row against the layering rules in section 2: new-id insert (safe),
  config-by-id (safe), duplicate-id insert (fatal). The profile's own other rows
  (`dsh-file-trace`, `dsh-profiles`) pass because they are genuinely new ids.
- After an upgrade, re-check profile inserts against the *new* bundle: an id that was
  legitimately absent in 0.1.2/0.1.3 (when this profile's habits were formed) may be
  bundle-provided in 0.1.5 — the exact skew that produced this incident.

**Host-side — what boot could print to make this failure actionable:**

- On `duplicate loader entry id: <id>`, report **both declaration sites**, e.g.:
  `duplicate loader entry id: workspace-files — first declared by bundle patch
  <install-root>\packages\bundle\web-app\cordis.patch.yml:110; duplicate declared by
  profile patch C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml:<line>. Delete the
  profile-side insert row (the bundle already provides this plugin; use config-by-id to
  customize).` — this names whom to blame (the profile patch, i.e., the hand edit) and
  exactly what to delete.
- At boot start, optionally log a one-line provenance summary per patch layer
  (bundle file + profile file, entry counts, and any ids both contribute) so a pending
  collision is visible before the hard failure.
- At upgrade time, diff the profile patch against the new bundle patch and warn *before*
  the next boot: "profile insert `workspace-files` is now provided by bundle
  0.1.5-alpha.2 (web-app/cordis.patch.yml:110) — remove the row to avoid a duplicate-id
  boot failure." That directly addresses the maintainer's stated fear ("确保升级 profile
  不遗漏") by automating the check instead of gambling on a redundant row.
- Keep the message blame-directed and prescriptive (which file, which lines, which
  operation is illegal), matching the loader's existing refusal to guess a winner.

---

### Summary

A hand-written profile-side `insert` for `workspace-files` collided with the identical
row the 0.1.5-alpha.2 web-app bundle already ships; the Cordis plugin loader's
`EntryGroup.update` rejected the duplicate id while applying the `cordis:include` at
boot, aborting the whole load by design. Inserts for bundle-shipped ids are the one fatal
profile-patch operation (config-by-id and new-id inserts are safe). The complete fix is to
delete the manual block from `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`; the plugin
code is not at fault and no plugin-side change can help. Prevent recurrence by grepping
the installed bundle's `cordis.patch.yml` for an id before hand-inserting, and by having
the host report both colliding files/lines — plus an upgrade-time diff warning — so the
blame and the deletion target are explicit.
