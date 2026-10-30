# S22 — The Duplicate Insert That Crashed the Boot

## 1. Root cause

Two `insert` loader-entry declarations for the same entry id `workspace-files` collide:

1. **Profile patch** (`profile-patch-excerpt.txt`): the maintainer's manual block at the end of
   `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`:
   ```yaml
   - insert:
       - id: workspace-files
         name: '@deepseek-ai/dsh-api-workspace-files'
   ```
2. **Web-app bundle patch** (`web-app-patch-excerpt.txt`): the 0.1.5-alpha.2 bundle already ships
   the same row in `packages/bundle/web-app/cordis.patch.yml` (L110-111 in the installed tree):
   ```yaml
   - insert:
       - id: workspace-files
         name: '@deepseek-ai/dsh-api-workspace-files'
   ```

Both declare the identical entry id, so the composed plugin tree contains two entries with id
`workspace-files`.

**Layer of detection:** the collision is detected in the **Cordis plugin-loader layer**, when the
boot's `cordis:include` loader entry is applied. The stack proves this:

- `EntryGroup.update` — `cordis-plugin-loader/lib/index.js:91` (throws the `TypeError: duplicate loader entry id: workspace-files`)
- `Include._apply` — `dsh-app-boot/lib/index.js:240`
- `boot` — `dsh-app-boot/lib/index.js:1534`

The failure is "failed to apply loader entry include (cordis:include)", i.e. it happens while the
loader is materialising the include list from the merged patch sources, before any plugin code runs.

**Why the loader refuses the whole boot instead of accepting the later row:** the `cordis:include`
entry merges every `insert` row from all patch layers (bundle patches + profile patch) into a
single entry group keyed by **entry id**, where the id is the unique identity of a plugin
declaration. There is no "later wins" ordering between a bundle-provided and a profile-provided
insert of the *same* id — both are `insert` operations converging into one set — so a duplicate
id is ambiguous: the loader cannot tell whether the intent is to add a new plugin or to reconfigure
an existing one, and silently picking one would mask a real misconfiguration and risk loading the
wrong declaration. `EntryGroup.update` therefore treats a duplicate id as a hard invariant
violation (a thrown `TypeError`), which aborts the entire plugin-tree load and crashes the boot
rather than proceeding with a possibly inconsistent composition.

## 2. Layering rules (profile patch vs. bundle-provided plugin)

- **Safe — change the plugin's config by id.** A config operation (config-by-id, e.g. the loader's
  `config`/patch op) references the *existing* entry id and mutates its configuration. No new
  entry is created, so no id collision.
- **Safe — add a row for an id no bundle ships.** This introduces a genuinely new entry id; there
  is nothing to collide with.
- **Fatal — add a row for an id a bundle already ships.** This creates a second `insert` entry
  with an id already present in the bundle's patch, and the loader rejects the duplicate id at boot.

**The maintainer's action is the fatal case** (the third bullet): they added an `insert` row for
`id: workspace-files` that the web-app bundle already provides. The evidence row that proves it is
the web-app bundle's own entry in `web-app-patch-excerpt.txt`:
```yaml
- insert:
    - id: workspace-files
      name: '@deepseek-ai/dsh-api-workspace-files'
```
(The adjacent `session-controller` / `settings-controller` rows in the same excerpt are likewise
bundle-provided and were never manually re-inserted — they boot fine, confirming the rule.)

## 3. Fix

- **What to change:** delete the manual `workspace-files` `insert` block the maintainer appended
  to the profile patch — the trailing block (including its "冗余" comment) that starts with
  `- insert:` and declares `id: workspace-files` / `name: '@deepseek-ai/dsh-api-workspace-files'`.
- **Which file:** `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`.

The comment the maintainer wrote already anticipated this ("如果 web-app bundle 已包含此行则此条为冗余"),
and it is in fact redundant: the 0.1.5 bundle already provides `workspace-files`, so the insert
should simply be removed. (Do not edit the installed bundle tree.)

- **Is the plugin's own code at fault?** No. `@deepseek-ai/dsh-api-workspace-files` never loads;
  the crash is purely a composition/configuration conflict between the two declarations and occurs
  in the loader before any plugin executes.
- **Can any plugin-side change resolve the boot failure?** No. The failure is in the loader's
  include-apply stage, upstream of the plugin runtime; a plugin code change cannot prevent the
  duplicate-id rejection. The only correct fix is to remove the duplicate declaration from the
  profile patch (the layer the maintainer controls).

Note: the *original* symptom (right-Sidebar document tab content read failed, 文件资源服务不可用) was
misdiagnosed — the service is bundle-provided in 0.1.5, so re-inserting it was unnecessary. That
read failure needs separate diagnosis and is not fixed by this change.

## 4. Prevention

- **Before hand-adding a row:** inspect the installed bundle's own patch for the id, not just the
  profile. Grep the npm-installed 0.1.5 tree (e.g. `packages/bundle/web-app/cordis.patch.yml` via
  the node_modules path) for `id: workspace-files` or the plugin name
  `@deepseek-ai/dsh-api-workspace-files` to confirm whether the id already exists; also check the
  composed loader-entry list. If it exists, the correct move is a config-by-id operation, never a
  second insert.
- **What the host could print at boot to make this actionable:** instead of only the bare
  `duplicate loader entry id: workspace-files` plus a stack trace, the host should report, for the
  duplicated id:
  1. **Both declaring sources** with file paths and line numbers — e.g.
     "declared by profile patch `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml` and by bundle
     `web-app/cordis.patch.yml` (installed 0.1.5-alpha.2)".
  2. **Whom to blame** — the redundant/offending duplicate is the profile-patch insert, because the
     bundle already owns the id ("the bundle already provides `workspace-files`; the profile insert
     is redundant").
  3. **What to delete** — a concrete remediation hint: "delete the `workspace-files` `insert` row in
     `<profile patch path>`", and a rule reminder: "to change this plugin's config, use a config-by-id
     operation, not a second insert."
