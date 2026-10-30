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

# S22 — The Duplicate Insert That Crashed the Boot

Scope: read-only analysis of the evidence pack at
`benchmark/results/artifacts/2026-10-12-step5-preview-s1-s24-r1/noskill/S22-duplicate-insert-boot-crash-trap/fixture/`
(`README.md`, `boot-crash-log.txt`, `profile-patch-excerpt.txt`, `web-app-patch-excerpt.txt`).
No other path was read. No changes were made to the fixture.

---

## TL;DR

The profile patch declares `workspace-files` via a hand-written `- insert:` block
(`profile-patch-excerpt.txt:18-20`), but the 0.1.5-alpha.2 web-app bundle already ships the same
loader entry id (`web-app-patch-excerpt.txt:6-8`, bundle file lines 110-111 in the installed tree).
Cordis merges bundle + profile patches into one id-keyed plugin tree, detects the duplicate key in
`@deepseek-ai/cordis-plugin-loader/lib/index.js:91` (`EntryGroup.update`), reached through the
`cordis:include` op applied by `dsh-app-boot/lib/index.js:240` (`Include._apply`) inside `boot()`.
The loader treats an id-key collision as a hard error and aborts the whole boot rather than let a
later row silently shadow a bundle-provided host service. **Fix: delete the manual
`workspace-files` insert block (lines 16-20) from `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`.
Nothing to change in the plugin or in the bundle — the plugin's code is not at fault.**

---

## 1. Root cause

### 1.1 The two colliding declarations

| Declaration | Where | Content | Owner |
|---|---|---|---|
| Profile-side insert | `profile-patch-excerpt.txt:16-20` (`C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`) | `- insert:` → `id: workspace-files`, `name: '@deepseek-ai/dsh-api-workspace-files'` | **user / maintainer (hand-added)** |
| Bundle-side insert | `web-app-patch-excerpt.txt:6-8` (`packages/bundle/web-app/cordis.patch.yml`, lines 110-111 of the installed 0.1.5-alpha.2 tree) | `- insert:` → `id: workspace-files`, `name: '@deepseek-ai/dsh-api-workspace-files'` | product / bundle |

Both rows are byte-identical in id and package name. The crash is therefore **not** two different
packages fighting over one id — it is one and the same bundle-provided entry declared twice, once
by the bundle and once by the profile patch. This is precisely what `web-app-patch-excerpt.txt:4`
states: *"The workspace-files row is already here (L110-111 in the installed tree)"*, and what
`web-app-patch-excerpt.txt:10-12` confirms by contrast: sibling bundle rows such as
`session-controller` and `settings-controller` are likewise bundle-provided and *"were never
manually inserted into the profile patch"* — i.e. the hand-insertion of `workspace-files` is the
odd one out.

The profile patch's own comment (`profile-patch-excerpt.txt:16-17`) is the falsifiable hypothesis
that produced the crash: *"如果 web-app bundle 已包含此行则此条为冗余；保留以确保升级 profile 不遗漏"*
— "if the web-app bundle already contains this row, this row is redundant; keep it anyway so an
upgraded profile doesn't miss it." `web-app-patch-excerpt.txt:6-8` is the evidence that falsifies the
guess: the bundle **does** already contain it, so the row **is** redundant, and the redundancy is
fatal rather than harmless. Note the author's error in reasoning: redundancy is *not* tolerated here
— a "just in case" copy of a vendor row is exactly the operation the layer forbids.

### 1.2 The layer at which the collision is detected

Resolution order, read from the stack (`boot-crash-log.txt:11-14`):

```
runCli (dsh/lib/bin.js:146)
  └─ runProfile (dsh/lib/profile-boot-*.js:311)
       └─ boot() (dsh-app-boot/lib/index.js:1534)
            └─ Include._apply — applies the `cordis:include` patch op (dsh-app-boot/lib/index.js:240)
                 └─ EntryGroup.update (@deepseek-ai/cordis-plugin-loader/lib/index.js:91)  ← THROWS
```

The collision is detected at the **Cordis loader / plugin-tree composition layer — the
id-keyed entry registry of `cordis-plugin-loader` (`EntryGroup.update`)**, while the `cordis:include`
op is merging all patch sources (bundle patch + profile patch) into a single canonical plugin tree.

It is worth being precise about what that layer is *not*:

- Not in plugin code. `@deepseek-ai/dsh-api-workspace-files` is never loaded or executed.
- Not in the app runtime. No server, no service container, no Sidebar, no IPC.
- Not a Windows/filesystem/npm problem, despite the Windows environment.

This happens in the *patch-merge* phase, which is a pure declaration-table operation: Cordis takes
the bundle's `cordis.patch.yml`, then applies the profile's `cordis.patch.yml` on top of it, and
maintains one table of loader entries keyed by `id`. The moment the profile's second `workspace-files`
key is written into a table that already holds that key, `EntryGroup.update` throws.

### 1.3 Why the loader refuses the whole boot instead of accepting the later row

There are four mutually reinforcing reasons, and the stack shape corroborates all of them.

1. **The entry id is a primary key, not a queue.** `EntryGroup` is an id-keyed table. There is no
   meaningful "second place" to put the second `workspace-files` row; either it overwrites the first
   or it is rejected. The code at `cordis-plugin-loader/lib/index.js:91` rejects.

2. **Merge-order determinism.** The resolved plugin tree must be *canonical* — identical on every
   boot, on every machine, for every user of a given bundle + profile pair. A "last write wins" rule
   would make the tree depend on which patch source is applied last, so the same declared
   configuration could resolve to different trees under different (e.g. reordered or version-split)
   loaders. Determinism is safer than tolerance.

3. **Insert ≠ override.** In layered patch semantics an `insert` op means "declare a new entry that
   nobody has declared yet." Re-declaring a vendor-owned entry with `insert` is a *semantic* error
   about the operation, not a data conflict. The legitimate way for a profile to act on a
   bundle-provided plugin is a **config/id-scoped op** (see §2). Accepting the later `insert` row
   would silently upgrade a bookkeeping mistake into a *shadowing* mechanism: a profile could
   replace `@deepseek-ai/dsh-api-workspace-files` behind the same id with any other package while
   the bundle still believes its own service is active — breaking config inheritance, upgrade
   guarantees and the trust boundary between vendor tree and user profile.

4. **Fail-fast with nothing to salvage.** The throw happens *before* any plugin's `apply()` runs and
   before any file is written. `boot()`'s only honest move is to propagate the error, so it surfaces
   out of `runProfile`/`runCli` as an unhandled top-level exception and Node exits
   (`boot-crash-log.txt:4-17`). There is no partial tree worth continuing with, no half-initialized
   service to roll back, and no diagnostic loss: the error text names the id
   (`duplicate loader entry id: workspace-files`) and the op (`cordis:include`). Booting on with a
   guessed tree would trade a one-line actionable error for an ambiguous, order-dependent runtime.

---

## 2. Layering rules for a profile patch acting on a bundle-provided plugin

| Operation on a bundle-provided plugin | Verdict |
|---|---|
| Change the plugin's **config by id** (a config/set-style op that references the existing entry `id`) | **Safe** — targets the vendor's entry in place; creates no new key; survives upgrades as long as the id exists. |
| **Add a row for an id no bundle ships** (a genuinely absent, e.g. external, plugin — cf. `dsh-file-trace` `profile-patch-excerpt.txt:5-7`, `dsh-profiles` `:12-14`) | **Safe** — `insert` is the correct op here; no collision is possible. |
| **Add a row for an id a bundle already ships** (`- insert:` with an id present in the bundle's own patch) | **Fatal** — duplicate loader entry id; the whole boot is refused. |

**The maintainer's action is the third (fatal) case.** An `insert` of `workspace-files`, an id the
bundle already ships.

**Evidence row proving it:** `web-app-patch-excerpt.txt:6-8` — `- insert:` / `- id:
workspace-files` / `- name: '@deepseek-ai/dsh-api-workspace-files'`, which the file's own header
locates at *"L110-111 in the installed tree"*, i.e. inside
`packages/bundle/web-app/cordis.patch.yml` of the npm-installed 0.1.5-alpha.2 bundle. The
consequence row is `boot-crash-log.txt:8-10`. The decisive detail is that the two rows are
identical in **id** — so even a "safe-looking" duplicate of a correct string is still a duplicate.

The rule generalises to a mechanical test the maintainer can run before writing any row:
**before `insert: id: X`, prove that X does not already exist in the bundle's patch.**
All bundle-provided host/service rows (e.g. `workspace-files`, `session-controller`,
`settings-controller`) fail that test; all external client rows (`dsh-file-trace`,
`dsh-profiles`, and the other six external plugins noted at `profile-patch-excerpt.txt:9`) pass it.

---

## 3. Fix

### 3.1 The minimal correct change

**Delete the manual block — one file, one file-only action:**

- **File:** `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml` (the profile's patch, per
  `profile-patch-excerpt.txt:1`).
- **What to delete:** the trailing block that the excerpt shows at lines **16-20**, i.e. the "# workspace-files …" comment (lines 16-17) **and** the declaration below it:

  ```yaml
  # workspace-files: 右侧 Sidebar 文件预览所需的宿主服务（0.1.5 系列新增）
  # 如果 web-app bundle 已包含此行则此条为冗余；保留以确保升级 profile 不遗漏
  - insert:
      - id: workspace-files
        name: '@deepseek-ai/dsh-api-workspace-files'
  ```

- **What to add instead:** nothing. The bundle already contributes the entry
  (`web-app-patch-excerpt.txt:6-8`), so after the deletion the plugin tree still contains exactly one
  `workspace-files` entry, provided by the product.
- **Then:** re-run `dsh web`. The duplicate key disappears, `EntryGroup.update` no longer throws,
  `boot()` proceeds normally.
- **Leave untouched:** every pre-existing profile row (`dsh-file-trace` `:5-7`, `dsh-profiles`
  `:12-14`, the six external plugins `:9`) — those are inserts of ids no bundle ships and are the
  correct layering.

If the maintainer later wants to tune that host service's behaviour, the correct vehicle is a
**config change by id** on the already-present bundle entry, never a second `insert`.

### 3.2 Is the plugin's own code at fault?

**No.** `@deepseek-ai/dsh-api-workspace-files` is a bundle-provided plugin whose declaration is
correct in both places (`profile-patch-excerpt.txt:19-20` and `web-app-patch-excerpt.txt:7-8` are
identical). It is never loaded in this crash: the failure occurs in the entry *table* before any
plugin code runs. The defect is entirely in **patch composition — a layering/configuration fault in
the user-authored profile patch**, produced by a hand-edit made to compensate for an unrelated
runtime symptom.

### 3.3 Could any plugin-side change resolve the boot failure?

**No.** Three reasons, in order of strength:

1. The plugin is not executing yet. Nothing in the plugin can run, so nothing in the plugin can
   influence the outcome.
2. The resolving authority is data, not code: the collision is removed by editing one declaration out
   of the profile patch file. No amount of plugin-side code — not a version bump, not a rename, not
   an id change, not a defensive re-declaration, not a de-duplication attempt inside
   `@deepseek-ai/dsh-api-workspace-files` — touches the table-level duplicate, because the
   duplicate is created by the *profile's* second row.
3. The only code that could swallow the failure is host/loader code
   (`EntryGroup.update`, `Include._apply`), and suppressing it would be the wrong fix: it would
   reintroduce the ambiguity and shadowing problem described in §1.3. The correct host-side
   direction is a better message (see §4.2), not tolerance.

### 3.4 Honest scope note

Deleting the insert is **necessary and sufficient to fix this crash**, and that is the whole of what
is being prescribed here. It is *not* claimed to fix the original pre-crash symptom (the
right-Sidebar document tab opening while its content read fails with 文件资源服务不可用,
`boot-crash-log.txt:19-21`). The maintainer's premise — that a missing composition row caused it —
is disproven by the collision itself: the bundle already supplies the entry, so the symptom was
never a composition problem. The next diagnostic after boot is restored should look at whether the
bundle-provided `workspace-files` service is *serving* correctly at runtime in 0.1.5-alpha.2 and
whether profile-side config (by id) needs adjusting — evidence for that is not in this pack.

---

## 4. Prevention

### 4.1 What the maintainer should look at **before** hand-adding a row

In the installed bundle — concretely, in the npm-installed 0.1.5-alpha.2 tree, e.g.
`.../node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-app-boot/packages/bundle/web-app/cordis.patch.yml`
(the path family that `web-app-patch-excerpt.txt:1-4` documents, and the same
`node_modules` path family named in the crash frames at `boot-crash-log.txt:4,11-12`):

1. **Search the bundle patch for the `id` you are about to insert.** If the id is already there, the
   correct action is *not* to add a row. That single grep is what would have prevented this whole
   incident, and this evidence pack makes the result predicatable in advance: `workspace-files`
   is present at bundle lines 110-111.
2. **Diff the bundle patch across the upgrade you just performed** (the 0.1.2/0.1.3 bundle patch vs.
   the 0.1.5-alpha.2 bundle patch). Bundle-provided host services added by the new version — which is
   exactly what `workspace-files` is, per `profile-patch-excerpt.txt:16` "（0.1.5 系列新增）" — show up
   here first. Do **not** back-fill them into the profile by hand.
3. **Read the profile patch as already-existing rows, not as a to-do list.** If a row is already
   there and boot still fails with 文件资源服务不可用, the fault is service availability/config,
   not composition — and a second copy of the row makes the situation strictly worse.
4. Distinguish the two row classes before writing: **bundle-provided** rows (host services; id is
   already inside the bundle patch → never `insert` them; adjust config by id if needed) versus
   **external/profile-owned** rows (the six external client plugins, `dsh-file-trace`,
   `dsh-profiles` — insert is right). When in doubt, the mechanical test in §2 — "does the id
   already exist in the bundle patch?" — decides it.
5. **Never keep a speculative "冗余 / just in case" duplicate.** The comment at
   `profile-patch-excerpt.txt:17` is the mistake in written form: an entry whose own justification is
   *"if the bundle already has it, this row is redundant"* must be verified against the bundle *first*
   and dropped if present, not written "to be safe."

### 4.2 What the host could print at boot to make the failure actionable

The current message (`boot-crash-log.txt:8-10`) gets one thing right — the colliding id — but stops
short of being actionable, as this incident shows: it names nothing about *who* declares the
duplicate or what to do about it, and the maintainer had to manually correlate the log against two
YAML excerpts. The host should emit, on the same hard fail:

1. **Whom to blame / where each declaration comes from** — both sources with file paths and line
   numbers, and an explicit ownership label, e.g.
   ```
   duplicate loader entry id: workspace-files (op: cordis:include)
     declared by bundle  : .../dsh-app-boot/packages/bundle/web-app/cordis.patch.yml:110   (provided by the product, keep)
     declared by profile : C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml:18              (added by you, remove)
   ```
   The blame assignment is the valuable part: a bundle row is vendor-owned and must never be edited;
   a profile row is user-owned and is the one to act on. In this incident the profile row is the
   one at lines 18-20 of `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`.
2. **What to delete** — the file, the line range, and the exact block to remove, plus the reassurance
   that removes the motive for the hand-insert: *"the bundle already provides this entry, so nothing
   is lost by deleting this row; no reinstall or downgrade is needed."*
3. **What to do instead** — *"do not `insert` an id the bundle already ships; to change its
   behaviour, edit its config by id (`id: workspace-files`) in the same profile patch."* This turns
   the error into the layering lesson and prevents a repeat with the next host service.
4. **That it is safe to retry** — the failure happens during plugin-tree load, before any plugin
   runs and before any state is written, so the fix is simply "delete the row and re-run
   `dsh web`"; no rollback, no cache invalidation, no `--force` flags. Optionally a
   `--print-plugin-tree` (or `dsh plugins list`) mode that dumps the *resolved* entry table with
   each entry's origin (bundle vs. profile, file:line) would let a maintainer answer "does the
   bundle already ship this id?" without reading the installed tree — the single grep in §4.1,
   available as one command.

---

## Appendix — evidence index

All citations refer to `fixture/` in this task's evidence pack.

| Claim | Evidence |
|---|---|
| Error text: op + colliding id | `boot-crash-log.txt:8-10` |
| Layer that throws: `EntryGroup.update` | `boot-crash-log.txt:11` |
| Op applier: `Include._apply` / `cordis:include` | `boot-crash-log.txt:12` |
| Boot call chain: `boot` → `runProfile` → `runCli` | `boot-crash-log.txt:13-15` |
| Profile-side duplicate block (the bug) | `profile-patch-excerpt.txt:16-20` |
| Author's flawed "keep the redundant row" rationale | `profile-patch-excerpt.txt:16-17` |
| Safe profile insert precedent (ids no bundle ships) | `profile-patch-excerpt.txt:5-9,12-14` |
| Bundle already ships `workspace-files` | `web-app-patch-excerpt.txt:4,6-8` |
| Sibling bundle rows were never hand-inserted | `web-app-patch-excerpt.txt:10-12` |
| Original symptom the fix does not claim to cure | `boot-crash-log.txt:19-21` |
| Environment: Windows, npm global 0.1.5-alpha.2, in-place upgrade | `boot-crash-log.txt:1,19`; `README.md:3-9` |

No files in the fixture were modified; nothing outside the two allowed paths was read.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.