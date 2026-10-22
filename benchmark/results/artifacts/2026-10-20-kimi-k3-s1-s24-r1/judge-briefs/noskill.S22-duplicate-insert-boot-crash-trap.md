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

# S22 · The Duplicate Insert That Crashed the Boot — Report

Evidence reviewed (read-only, fixture unchanged):
- `fixture/boot-crash-log.txt` — full `dsh web` crash on 0.1.5-alpha.2
- `fixture/profile-patch-excerpt.txt` — profile `cordis.patch.yml` with the manual insert
- `fixture/web-app-patch-excerpt.txt` — web-app bundle `cordis.patch.yml` (0.1.5-alpha.2 installed tree)

## 1. Root cause

**The two colliding declarations** are two `insert` rows with the same loader entry id `workspace-files`:

- **Bundle layer** (`web-app-patch-excerpt.txt`, `packages/bundle/web-app/cordis.patch.yml`, L110–111 in the installed 0.1.5-alpha.2 tree):
  `- insert: [{ id: workspace-files, name: '@deepseek-ai/dsh-api-workspace-files' }]`
- **Profile layer** (`profile-patch-excerpt.txt`, `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`): the maintainer's hand-added block inserting the same `id: workspace-files` with the same package name — added even though its own comment admits it may be redundant ("如果 web-app bundle 已包含此行则此条为冗余").

**Where the collision is detected**: at the **Cordis loader layer**, not in the plugin and not in dsh's profile machinery. Per the crash log stack, `EntryGroup.update` in `@deepseek-ai/cordis-plugin-loader` (lib/index.js:91) throws `TypeError: duplicate loader entry id: workspace-files` while `Include._apply` in `dsh-app-boot` (lib/index.js:240) is applying a `cordis:include` loader entry during `boot()`. dsh-app-boot wraps it as `dsh: plugin tree failed to load` and the process exits before any plugin module is loaded.

**Why the loader refuses the whole boot instead of accepting the later row**: in the Cordis patch DSL, a loader entry id is the unique identity/merge key of an `EntryGroup`. `insert` means "introduce a new entry"; it is not an override operation. If the loader silently let the later row win, precedence between bundle and profile rows would be ambiguous (which `name`/config actually runs? was it an edit or an accident?), producing a silently half-applied plugin tree. The DSL already has a separate, explicit operation for modifying an existing entry by id, so a duplicate `insert` is unambiguously an authoring error. Fail-fast at load time surfaces the mistake deterministically — a crash with a clear id is safer than booting with an arbitrary winner.

## 2. Layering rules (profile patch acting on a bundle-provided plugin)

| Operation | Verdict |
|---|---|
| **Change the plugin's config by id** (update/set operation targeting the existing bundle row) | **Safe** — this is the intended layering mechanism: the bundle ships the row, the profile tunes it by id. |
| **Insert a row for an id no bundle ships** | **Safe** — it genuinely adds a new plugin to the composition (e.g. the profile's `dsh-file-trace`, `dsh-profiles` external rows). |
| **Insert a row for an id a bundle already ships** | **Fatal** — duplicate loader entry id; `EntryGroup.update` throws and the entire boot aborts. |

**The maintainer's action is the fatal third case.** The proving evidence row is in `web-app-patch-excerpt.txt`: the bundle's own `- insert: - id: workspace-files / name: '@deepseek-ai/dsh-api-workspace-files'` row (L110–111 of the installed tree). Colliding with it, `profile-patch-excerpt.txt` contains the same `- insert: - id: workspace-files` block. Adjacent bundle rows (`session-controller`, `settings-controller`) confirm that such host services are bundle-provided and were correctly never re-inserted in the profile.

## 3. Fix

- **What to change**: delete the entire hand-added `workspace-files` insert block — the comment lines plus the `- insert: [{ id: workspace-files, ... }]` entry — **from the profile patch file `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`**. Nothing else: the web-app bundle already composes the plugin, so once the duplicate is removed the profile layers cleanly on top of the bundle and `dsh web` boots.
- **No other file needs to change** — not the bundle patch, not the plugin, not dsh.
- **Is the plugin's own code at fault? No.** `@deepseek-ai/dsh-api-workspace-files` is never even loaded — the failure occurs in the loader's patch-application stage, before module evaluation. **No plugin-side change could resolve this boot failure**; only fixing the composition (the patch files) can.
- Note: the original symptom (right-Sidebar document tab reading failing with 文件资源服务不可用) was a runtime service-availability problem to be diagnosed on its own (service registration, profile runtime wiring, logs at runtime). The composition was never missing the row, and duplicating the row could never have fixed that symptom.

## 4. Prevention

**Author side — before hand-adding a row**: look into the installed bundle first. Open the bundle's patch in the npm-installed tree — `packages/bundle/web-app/cordis.patch.yml` (reachable/provable via the installed `node_modules` path of `@deepseek-ai/dsh`) — and grep it for the id you intend to add (`workspace-files`). If the id already appears there (as it does at L110–111), the profile must not `insert` it; at most it may adjust that plugin's config by id. Comparing with sibling rows (`session-controller`, `settings-controller`) shows the convention: bundle-shipped host services stay out of the profile patch. A booted tree listing (or the GUI's plugin view) can equally confirm the plugin is already present before editing.

**Host side — what dsh should print at boot**: when `EntryGroup.update` throws `duplicate loader entry id: X`, dsh should enrich the error with provenance for both declarations, e.g.:

> duplicate loader entry id: `workspace-files` — declared by bundle patch `packages/bundle/web-app/cordis.patch.yml` (L110) and again by profile patch `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`. The bundle already provides this plugin; **delete the insert row from the profile patch** (blame: profile edit, not the plugin).

That message makes the failure actionable: it names **whom to blame** (the hand-edited profile patch — the later, redundant declaration — not the bundle and not the plugin author) and **what to delete** (the duplicate insert row in the profile's `cordis.patch.yml`). Optionally, a `dsh` lint/doctor command could pre-validate profile patches against installed bundle patches and flag duplicate ids before boot.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.