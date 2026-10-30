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
#### FILE: S22-duplicate-insert-boot-crash-trap/S22-report.md

# S22 · The Duplicate Insert That Crashed the Boot — Analysis Report

Scenario: dsh upgraded in place to 0.1.5-alpha.2 on a Windows profile created under
0.1.2/0.1.3. After the upgrade the right-Sidebar document tab opened but its content read
failed (文件资源服务不可用). The maintainer assumed the profile composition was missing the
workspace-files host service and hand-added a row to the profile's `cordis.patch.yml`.
The next `dsh web` boot crashed with:

```
Error: dsh: plugin tree failed to load: failed to apply loader entry include (cordis:include):
duplicate loader entry id: workspace-files
```

Evidence used (all read-only, under the fixture):
- `fixture/boot-crash-log.txt` — full boot crash output and stack
- `fixture/profile-patch-excerpt.txt` — profile patch with the manual insert block
- `fixture/web-app-patch-excerpt.txt` — web-app bundle patch showing the same row already present
- `fixture/README.md` — evidence-pack index

---

## 1. Root cause

### The two colliding declarations

They are the **same loader entry id, `workspace-files`, declared twice** in the flattened
loader-entry space that the host builds before booting the plugin tree:

| # | Where | Declaration | Provenance |
|---|---|---|---|
| A | **web-app bundle** `packages/bundle/web-app/cordis.patch.yml`, L110-111 of the installed 0.1.5-alpha.2 tree | `- insert:` → `- id: workspace-files` / `name: '@deepseek-ai/dsh-api-workspace-files'` | shipped by the bundle, already present after the upgrade |
| B | **profile** `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml` (the last block) | `- insert:` → `- id: workspace-files` / `name: '@deepseek-ai/dsh-api-workspace-files'` | hand-added by the maintainer after the upgrade |

Both rows carry the *same* id **and** the *same* module name, so this is not a name/id
mismatch — it is a literal re-insertion of an entry the bundle already ships. The maintainer's
own comment on row B states the intent: "如果 web-app bundle 已包含此行则此条为冗余" ("if the
web-app bundle already contains this row, this row is redundant") — and the bundle excerpt proves
the premise is true, so the row is not merely redundant, it is a hard duplicate.

### At which Cordis layer the collision is detected

The crash is detected **inside the Cordis plugin-loader entry group, at entry-registration
time — i.e. while the loader is assembling the flat list of loader entries, before any
plugin code is instantiated or configured.**

The stack in `boot-crash-log.txt` pins the layer precisely:

```
Error: dsh: plugin tree failed to load: failed to apply loader entry include (cordis:include):
duplicate loader entry id: workspace-files
TypeError: duplicate loader entry id: workspace-files
    at EntryGroup.update (file:///.../@deepseek-ai/cordis-plugin-loader/lib/index.js:91:28)
    at Include._apply (file:///.../@deepseek-ai/dsh-app-boot/lib/index.js:240:19)
    at boot (file:///.../@deepseek-ai/dsh-app-boot/lib/index.js:1534:3)
    at async runProfile (file:///.../@deepseek-ai/dsh/lib/profile-boot-...js:311:14)
    at async runCli (file:///.../@deepseek-ai/dsh/lib/bin.js:146:4)
```

- **`@deepseek-ai/cordis-plugin-loader` → `EntryGroup.update` (index.js:91)** raises the
  `TypeError: duplicate loader entry id: workspace-files`. The loader's **entry group** owns
  the uniqueness invariant over loader-entry ids: one id ⇒ one entry. The failure is raised
  by the loader's *entry registry*, i.e. at the **loader-entry / plugin-tree-construction layer**.
- `dsh-app-boot` `Include._apply` (index.js:240) is the host-side glue that merges the
  bundle's and the profile's patch layers; it wraps the loader error into the
  `failed to apply loader entry include (cordis:include)` message and then into
  `dsh: plugin tree failed to load`.
- `boot` (index.js:1534) and `runProfile`/`runCli` are the boot pipeline frames that
  propagate the abort. The stack is entirely inside *tree construction* — no plugin
  `apply`/`start` frame ever appears, because nothing got far enough to start.

So the collision is detected at the **Cordis loader-entry (plugin-tree) layer, during
`cordis:include` of the loader entry groups — at loader-registration time, not at
plugin-config or plugin-lifecycle time.**

### Why the loader refuses the whole boot instead of accepting the later row

Because the loader's entry group maintains a **hard one-id-one-entry invariant**, and an
`insert:` operation is defined as *add this entry under this id* — not *merge with, or
override, an existing entry with this id*. The two possible readings of the same id are:

1. "an entry with this id already exists" → **reject**, because a silent merge/override would
   make the effective plugin set depend on patch *ordering* and on which layer happened to be
   applied first, and would make the profile able to silently shadow (or silently lose) a
   bundle-shipped plugin. Ordering-sensitive, layer-dependent semantics is exactly what a
   deterministic loader must avoid.
2. "the same id and the same module name" → still **reject**. The loader keys entries by id
   alone; it does not diff the payload to decide whether a duplicate is benign. Idempotence
   is not implemented at the loader level, so re-inserting an id that is already present is
   an error regardless of whether the second row is identical.

The loader therefore fails **fast and whole-tree**: it aborts the entire plugin-tree load
instead of skipping one conflicting row. That is deliberate — a loader that silently drops or
merges conflicting entries would boot into a *different* plugin composition than either patch
file describes, and the resulting runtime would be very hard to diagnose (exactly the
class of problem this incident is about). The cost is that the failure is a hard boot abort
rather than a warning.

The blast radius is what makes this a boot crash rather than a degraded feature: the duplicate
is detected while the *whole* plugin tree is being assembled, before any plugin is started,
so the entire `dsh web` process dies. There is no partial/working mode, and the failure
happens at every boot, regardless of whether the sidebar document tab is opened.

### Relationship to the original symptom

The original symptom (文件资源服务不可用, "workspace file service unavailable") is **not** caused
by this crash and is **not** fixed by removing the duplicate row. The crash was introduced by
the maintainer's remediation attempt, not by the upgrade defect itself. The genuine cause of
the original symptom is outside this evidence pack: the bundle *does* ship `workspace-files`
(see §2), so the entry is present at the loader level, but the profile-level composition
(run-time service wiring / plugin ordering / config for the provider that serves the
Sidebar document read) evidently did not deliver the service to the read path. That
root-cause hunt is *unconfirmed* by this evidence pack — the fix below restores boot, and
only restores boot.

---

## 2. Layering rules for a profile patch acting on a bundle-provided plugin

The rule set follows from the §1 finding: the loader keys entries by **id** and treats
`insert:` as *"add an entry under this id"*; there is no id-scoped merge, no
override, and no duplicate tolerance. Consequently, for a plugin that a bundle already
provides, exactly one of the three operations is legal.

| Operation | Result | Why |
|---|---|---|
| **(a) Change the plugin's config *by id*** | ✅ **Safe** | Config changes are applied to an already-registered entry, keyed by the entry's id. They do not create a new loader entry, so the loader's id-uniqueness invariant is untouched. This is the sanctioned way for a profile to tune a bundle-shipped plugin. |
| **(b) Add a row for an id *no* bundle ships** | ✅ **Safe** | The id is new to the flattened entry space, so the insert is a genuine addition. It is exactly what the profile already does for genuinely profile-only plugins: `dsh-file-trace` (`@dsh-external/dsh-file-trace`) and `dsh-profiles` (`@lhh010/dsh-profiles`) in the profile excerpt — ids no bundle ships. |
| **(c) Add a row for an id a bundle *already* ships** | ❌ **Fatal** | Two entries with the same id enter the same loader entry group. `EntryGroup.update` raises `duplicate loader entry id: <id>` at tree-construction time, and the whole boot aborts before any plugin starts. Fatal regardless of whether the second row's module name is identical to the first. |

### Which case the maintainer's action is

**Case (c) — the fatal one.**

### Which evidence row proves it

Two rows together prove it:

1. **The bundle row** (proves the bundle already ships the id) —
   `fixture/web-app-patch-excerpt.txt`, the `workspace-files` insert block, documented as
   **"already here (L110-111 in the installed tree)"** of
   `packages/bundle/web-app/cordis.patch.yml`, with
   `name: '@deepseek-ai/dsh-api-workspace-files'`.
2. **The profile row** (proves the maintainer re-inserted the same id) —
   `fixture/profile-patch-excerpt.txt`, the final block headed
   `# workspace-files: 右侧 Sidebar 文件预览所需的宿主服务（0.1.5 系列新增）`, whose
   `- insert:` list contains `- id: workspace-files` /
   `name: '@deepseek-ai/dsh-api-workspace-files'` — the same id and the same name.

The maintainer's own comment on the profile row ("如果 web-app bundle 已包含此行则此条为冗余")
anticipated case (c) but mis-classified it as harmless redundancy; the bundle excerpt proves
the premise ("bundle already contains this row") is satisfied, and case (c) is not redundancy
but a fatal duplicate.

The excerpt's **adjacent rows** (`session-controller`, `settings-controller`) are the
corroborating control: they are likewise bundle-provided and were **never** manually inserted
into the profile patch. So the established practice in this very profile is exactly the safe
layering rule — bundle-provided plugins are *configured*, not *re-inserted*.

---

## 3. Fix

### The exact change

**Delete the manual `workspace-files` insert block from the profile's patch file:**

File: `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`

Remove this block (the last block in the file, together with its two comment lines):

```yaml
# workspace-files: 右侧 Sidebar 文件预览所需的宿主服务（0.1.5 系列新增）
# 如果 web-app bundle 已包含此行则此条为冗余；保留以确保升级 profile 不遗漏
- insert:
    - id: workspace-files
      name: '@deepseek-ai/dsh-api-workspace-files'
```

**Do not touch** the web-app bundle's `cordis.patch.yml` (`packages/bundle/web-app/cordis.patch.yml`,
L110-111) — that row is correct and is the one that should supply the plugin. **Do not touch**
`@deepseek-ai/dsh-api-workspace-files` itself. No other file changes are needed to restore
boot: after removing the duplicate, the bundle row alone provides the loader entry, the entry
group accepts the tree, and `dsh web` boots.

If the maintainer in fact wants to *tune* the plugin (the safe operation (a) from §2), the
correct place is a **config change keyed by the id** `workspace-files` in the profile patch,
not a new `insert:` row. (The exact config schema of `workspace-files` is not contained in
this evidence pack — see §5 — so the specific keys cannot be prescribed from the fixture.)

### Is the plugin's own code at fault?

**No.** Two independent reasons:

1. The plugin `@deepseek-ai/dsh-api-workspace-files` never ran. The crash occurs in the
   loader's `EntryGroup.update` while *registering* entries, inside
   `cordis-plugin-loader/lib/index.js`; the stack shows only loader/boot frames
   (`EntryGroup.update` → `Include._apply` → `boot` → `runProfile` → `runCli`) and no
   plugin `apply`/`start` frame. The plugin's code was never loaded, so it cannot have
   caused the crash.
2. The plugin was not the wrong thing to have in the tree in the first place — the bundle
   ships it on purpose, and the id/module name in the profile row is *correct*. The only
   defect is the redundant *second registration* of an id the loader had already claimed.

### Could any plugin-side change resolve the boot failure?

**No.** The failure is in the host's loader-entry composition step, which runs *before* any
plugin is instantiated. There is no plugin-side edit — not in `@deepseek-ai/dsh-api-workspace-files`,
not in any other plugin, and not in a third-party plugin — that can influence whether the
loader accepts a duplicate entry id. The only way to make the tree loadable is to make the
id unique in the flattened entry space, i.e. to remove the redundant row from the profile
patch (the host-side fix). A plugin could not "absorb" or "merge" the duplicate, because it
never gets the chance to run.

---

## 4. Prevention

### 4.1 What the maintainer should look at in the installed bundle, before hand-adding a row

Before adding an `insert:` row for a plugin id to a profile patch, check the **installed
bundle's own `cordis.patch.yml`** — i.e. the patch file of the bundle that ships the plugin,
in the installed tree under `node_modules/@deepseek-ai/dsh/.../packages/bundle/<bundle>/cordis.patch.yml`
(the fixture points at `packages/bundle/web-app/cordis.patch.yml`, located via the installed
`node_modules` path). Concretely, the maintainer should:

1. **Search the bundle patch for the exact id** before inserting it. If the bundle already
   contains `- id: workspace-files`, the plugin is **already provided** and must not be
   inserted into the profile. (Fixture: the bundle row is documented at L110-111.)
2. **Read the profile's existing rows for the same id** — the profile patch is the last word
   on what the profile already supplies, and re-inserting an id the profile already has is
   the same fatal duplicate.
3. **Prefer "it is already there" over "it is missing"**: a profile patch is a *composition
   layer* over the bundle, not a replacement for it. The profile legitimately adds only ids
   the bundle does not ship (e.g. `dsh-file-trace`, `dsh-profiles` in this very profile) and
   *configures* ids the bundle does ship (e.g. `session-controller`, `settings-controller`,
   which are bundle-provided and were never re-inserted).
4. **Prefer a config change keyed by id** over a new `insert:` row whenever the intent is to
   *tune* a bundle-shipped plugin.

### 4.2 What the host could print at boot to make this failure actionable

The crash message today names the id but not the *culprit*: the maintainer must still diff
two files by hand to learn which layer added the duplicate and which row to delete. A better
host-side diagnostic would report, for a duplicate loader-entry id:

- **Whom to blame — the layer and file that introduced the duplicate.** Name the offending
  patch source explicitly: the *profile* patch
  (`C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`) versus the *bundle* patch
  (`packages/bundle/web-app/cordis.patch.yml`) — i.e. "id 'workspace-files' is already
  provided by bundle 'web-app' (packages/bundle/web-app/cordis.patch.yml); the duplicate
  comes from the profile patch <path>".
- **What to delete — the exact offending row.** Echo the conflicting row with a locator
  (file + line + the `- id: workspace-files` / `name: '@deepseek-ai/dsh-api-workspace-files'`
  block), e.g. "remove the insert row for 'workspace-files' from <profile patch> line N; the
  bundle already provides it".
- **The remediation hint.** "To tune this plugin, add a config entry keyed by
  'workspace-files' instead of an insert row."
- **Optional but valuable:** report *all* conflicting ids in one pass (rather than aborting on
  the first), and/or downgrade the specific 'id already provided by a lower layer' case to a
  warning when the module name matches exactly, while still failing hard on genuine conflicts
  (same id, different module) — that would have turned this incident into a one-line warning
  at boot and left the tree buildable. Independently, the host should ideally also name the
  *originating* layer when it composes the tree, so the "already provided by bundle X" fact is
  available to the diagnostic rather than having to be re-derived by hand.

### 4.3 Author-side prevention (in the plugin / bundle)

- The bundle is the owner of `workspace-files`, and its patch already provides it. Nothing
  in the bundle or in the plugin needs to change for this incident; the defect was entirely
  in the profile's hand edit.
- Bundle/plugin authors should nevertheless document, per shipped plugin id, that the id is
  bundle-provided and therefore **must not be inserted into a profile patch** — and should
  keep a single canonical id↔module mapping so that a user re-adding the identical
  `name` still hits the id-uniqueness check (it does) instead of a confusing name mismatch.
- If the host's loader ever wanted to be forgiving, the decision of "duplicate id ⇒ error"
  belongs to the loader (host) layer, not to plugins — a plugin cannot pre-empt it.

---

## 5. Unconfirmed / out of scope

- **The original `文件资源服务不可用` symptom is not root-caused here.** The evidence pack
  shows only that the bundle *provides* the `workspace-files` loader entry; it does not
  show the run-time service wiring that failed the Sidebar document read. Removing the
  duplicate row restores boot, not necessarily the Sidebar feature.
- **The exact config schema of `workspace-files` is not in the fixture**, so the concrete
  keys for a safe "config change keyed by id" (§3) cannot be prescribed from this evidence.
- **Not verified from the fixture:** the precise ordering of bundle-vs-profile layer
  application (the excerpt asserts the bundle row "is already here"), and the loader
  entry-group's behaviour for same-id-different-name pairs (only the identical-row case is
  evidenced here).
- No host runtime was interrogated for this report (per the read-only boundary); all
  statements above derive from the four fixture files.

---

## Summary

| Question | Answer |
|---|---|
| Colliding declarations | the `workspace-files` `insert:` row in the **profile** patch `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml` vs. the same `workspace-files` `insert:` row in the **web-app bundle** patch `packages/bundle/web-app/cordis.patch.yml` (L110-111, installed 0.1.5-alpha.2 tree) |
| Detection layer | Cordis **loader entry group** — `EntryGroup.update` in `@deepseek-ai/cordis-plugin-loader` (raises `TypeError: duplicate loader entry id: workspace-files`), surfaced by `dsh-app-boot` `Include._apply` → `boot` → `runProfile`, i.e. at **plugin-tree construction / loader-registration time**, before any plugin starts |
| Why whole-boot failure | the entry group enforces **one id ⇒ one entry**; `insert:` means "add under this id" with no merge/override/idempotence, and the loader fails fast so the effective plugin set can never depend on patch order — the whole tree aborts |
| Safe layering op | **(a) change the plugin's config by id** — and **(b) adding a row for an id no bundle ships** is also safe; **(c) adding a row for an id a bundle already ships is fatal** |
| Maintainer's case | **(c)** — proven by the bundle excerpt's `workspace-files` row (L110-111) against the profile excerpt's hand-added `- id: workspace-files` row |
| Fix | **delete the hand-added `workspace-files` insert block from `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`**; leave the bundle row and the plugin untouched |
| Plugin at fault? | **No** — the plugin never ran (no plugin frame in the stack); and the crash is in the host's tree-composition step, so **no plugin-side change can fix the boot** |
| Prevention | grep the installed bundle's `cordis.patch.yml` for the id before inserting; only insert ids the bundle does not ship, otherwise configure by id; host should name the blamed layer/file, echo the offending row with a locator, and state what to delete |


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.