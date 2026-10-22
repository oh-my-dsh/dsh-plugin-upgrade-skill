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

# S22 — The Duplicate Insert That Crashed the Boot

**Task:** S22-duplicate-insert-boot-crash-trap · **Mode:** read-only analysis, no changes to the fixture
**Evidence pack (read-only, unmodified):** \`fixture/boot-crash-log.txt\`, \`fixture/profile-patch-excerpt.txt\`, \`fixture/web-app-patch-excerpt.txt\`, \`fixture/README.md\`
**Incident:** in-place upgrade of dsh 0.1.2/0.1.3 → 0.1.5-alpha.2 on Windows 11 (npm global, Node v24.14.1, 2026-09-09)

---

## TL;DR

The maintainer hand-added a \`workspace-files\` **insert row** to the profile patch
(\`C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml\`) because the right-Sidebar document tab failed with
\`文件资源服务不可用\`. But the 0.1.5-alpha.2 **web-app bundle already ships that exact row**. The two identical
declarations collide in the **loader-entry include layer** (\`cordis:include\`) during host-side plugin-tree
composition, and \`EntryGroup.update\` in \`cordis-plugin-loader\` throws a hard \`TypeError: duplicate loader entry
id: workspace-files\`, aborting the whole boot. The fix is a **pure deletion** in the profile patch — the plugin's
own code is not at fault and no plugin-side change can fix it. The original symptom was never a missing
composition entry in the first place, so the real diagnosis still has to be made after the row is removed.

---

## 1. Root cause

### 1.1 The two declarations that collide

| # | Declaration | Source | Content |
|---|---|---|---|
| A | Manual profile insert | \`C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml\` (trailing block; \`profile-patch-excerpt.txt\` lines 16–20) | \`- insert:\` → \`- id: workspace-files\` / \`name: '@deepseek-ai/dsh-api-workspace-files'\` |
| B | Bundle-provided insert | \`packages/bundle/web-app/cordis.patch.yml\` in the installed 0.1.5-alpha.2 tree, **L110–111** (\`web-app-patch-excerpt.txt\` lines 6–8) | \`- insert:\` → \`- id: workspace-files\` / \`name: '@deepseek-ai/dsh-api-workspace-files'\` |

Two things matter about this pair:

1. **They are byte-identical in both \`id\` and \`name\`.** This is not a version conflict, not a fork, not a
   "which package should win" question — it is the *same row declared twice at two different layers*. There is
   nothing to arbitrate, so any "later row wins" rule would be choosing arbitrarily between two identical rows.
2. **Declaration A post-dates declaration B.** The bundle row is part of the installed 0.1.5-alpha.2 tree
   (proven by the \`node_modules\` path in the crash log and by the excerpt's own L110–111 annotation); the profile
   row was written by the maintainer *after* the upgrade, as a reaction to the sidebar failure
   (\`boot-crash-log.txt\` lines 19–22).

### 1.2 At which Cordis layer the collision is detected

**Layer: the loader-entry *include* layer of the host-side plugin-tree composition — i.e. \`cordis:include\`
application inside \`dsh-app-boot\`'s \`boot()\`, concretely \`EntryGroup.update\` in \`cordis-plugin-loader\`.**

Walking the stack in \`boot-crash-log.txt\` lines 11–15, bottom-up:

| Frame | File | Role in the failure |
|---|---|---|
| \`runCli\` | \`@deepseek-ai/dsh/lib/bin.js:146:4\` | CLI entry, \`dsh web\` |
| \`runProfile\` | \`@deepseek-ai/dsh/lib/profile-boot-*.js:311:14\` | profile-scoped boot |
| \`boot\` | \`.../dsh-app-boot/lib/index.js:1534:3\` | host boot; the plugin tree is assembled here |
| \`Include._apply\` | \`.../dsh-app-boot/lib/index.js:240:19\` | **applies a \`cordis:include\` operation (a \`- insert:\` row) onto the composed entry group** |
| \`EntryGroup.update\` | \`.../cordis-plugin-loader/lib/index.js:91:28\` | **registers a loader entry by id — detects the id is already taken and throws** |

So the failure is **not** in a plugin, **not** in config/schema validation, and **not** at service runtime. It is
in the loader's entry registry, while the merged plugin tree (host defaults + bundle patch + profile patch) is
being built. The wrapped message even names the stage twice —
\`dsh: plugin tree failed to load: failed to apply loader entry include (cordis:include): duplicate loader entry
id: workspace-files\` (\`boot-crash-log.txt\` lines 8–9) — which is the host telling us this is a *composition*
failure, not a *runtime* failure.

A useful consequence: because the throw happens during composition, **no plugin code ever ran**. The
\`@deepseek-ai/dsh-api-workspace-files\` package was never instantiated, never \`apply\`-ed, and never registered a
service. The crash is 100% a declaration problem.

### 1.3 Why the loader refuses the whole boot instead of accepting the later row

- **\`insert\` has no override semantics.** A loader entry is a record in an id-keyed registry (\`EntryGroup\`).
  \`insert\` means "declare a *new* entry", not "replace the entry with this id". There is no defined precedence
  between two \`insert\` rows for the same id, so the loader cannot honour "later wins" without inventing one.
- **A duplicate id is an invariant violation, not a warning.** The throw is a raw \`TypeError\` from
  \`EntryGroup.update\` — the loader's own data structure detected an impossible state. A registry that silently
  tolerates two entries per id has no single answer to "which package backs \`workspace-files\`?", and every later
  resolution becomes ambiguous.
- **Composition is all-or-nothing (fail-closed).** The plugin tree is built as one graph and then run. Aborting
  the whole boot keeps the result independent of patch application order and guarantees no half-loaded tree —
  no host process running with a partially registered service namespace, which would be far harder to debug than
  a clean boot failure.
- **It protects the diagnosis.** If the later row had been accepted, the boot would have "succeeded" and the
  maintainer would have hit \`文件资源服务不可用\` again — the very symptom they were trying to fix — with no
  signal that their composition edit was both unnecessary and harmful. The loud early crash is the correct
  signal: the composition is wrong, stop editing the tree and re-read it. Accepting the row would have converted
  a 30-second fix into a second wild-goose chase.

### 1.4 The misdiagnosis that caused it

The maintainer's premise was "the workspace-files host service is missing from the profile composition"
(\`boot-crash-log.txt\` lines 19–21). \`web-app-patch-excerpt.txt\` disproves that premise directly: the row is
already present in the bundle. The profile's own comment even hedges it —
\`如果 web-app bundle 已包含此行则此条为冗余；保留以确保升级 profile 不遗漏\`
("if the web-app bundle already contains this row, this one is redundant; kept so the upgraded profile doesn't
miss it", \`profile-patch-excerpt.txt\` line 17) — the row was added *knowing it might be redundant*, as
belt-and-braces. Belt-and-braces on a layered include system is exactly the operation the system forbids.

Also note the error string the user saw: \`文件资源服务不可用\` ("file resource service unavailable") is a
**runtime consumer-side message**, produced when the document tab tried to read content — not a composition
error. Composition had already succeeded before the upgrade crash; the entry existed. So the original symptom
lives at the service/consumer level, not the tree level (see §3.3).

---

## 2. Layering rules

For a **profile patch acting on a plugin that a bundle already provides**, the operations sort like this:

| Operation | Verdict | Why |
|---|---|---|
| **Change the plugin's *config* by id** (target the existing \`workspace-files\` entry in the profile patch's config/override form) | ✅ **Safe** | The entry already exists; a config override expresses "same plugin, different settings" and is the intended extension point for a profile over a bundle-provided plugin. |
| **Add a row for an id no bundle ships** (e.g. \`dsh-file-trace\`, \`dsh-profiles\` in the same file) | ✅ **Safe** | The profile is exactly the right layer for plugins the bundle does not ship. No id collision is possible. |
| **Add a row (\`- insert:\`) for an id a bundle already ships** | ❌ **Fatal** | Duplicate loader entry id → \`EntryGroup.update\` throws → whole boot aborts. This is the one forbidden operation. |

**The maintainer's action is the fatal third case.** They ran \`- insert:\` for \`workspace-files\`, an id the
bundle already ships.

**The evidence row that proves it** is \`web-app-patch-excerpt.txt\` lines 6–8:

\`\`\`yaml
- insert:
    - id: workspace-files
      name: '@deepseek-ai/dsh-api-workspace-files'
\`\`\`

annotated in the excerpt itself as \`L110-111 in the installed tree\` of
\`packages/bundle/web-app/cordis.patch.yml\` — i.e. the row is part of the shipped 0.1.5-alpha.2 bundle, not a
profile-level concern.

Two supporting rows in the same excerpt make the rule concrete by contrast:
\`session-controller\` (lines 13–15) and \`settings-controller\` (lines 16–18) are *also* bundle-provided, and the
excerpt notes they "were never manually inserted into the profile patch" — that is the correct pattern, and
\`workspace-files\` is simply the row where the maintainer broke it.

> **Caveat on wording (evidence boundary):** the fixture proves the *insert* layer and proves the bundle
> ownership, but it does not contain the profile patch's config-section syntax. The safe "config by id" form
> should therefore be confirmed against the installed profile/docs before use — do not assume a key name from
> this pack alone.

---

## 3. Fix

### 3.1 The exact change

**Delete the entire trailing \`workspace-files\` block from the profile patch** —
\`C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml\` — i.e. \`profile-patch-excerpt.txt\` **lines 16–20**:

\`\`\`yaml
# workspace-files: 右侧 Sidebar 文件预览所需的宿主服务（0.1.5 系列新增）      <- delete
# 如果 web-app bundle 已包含此行则此条为冗余；保留以确保升级 profile 不遗漏      <- delete
- insert:                                                                    <- delete
    - id: workspace-files                                                    <- delete
      name: '@deepseek-ai/dsh-api-workspace-files'                            <- delete
\`\`\`

Notes on doing it right:

- **Delete, do not comment out.** A commented row still reads as "the maintainer intended this" and invites
  re-introduction; and some patch loaders are comment-insensitive in ways that are hard to predict. Remove the
  block cleanly, including its two comment lines.
- **Do not "fix" it by renaming the id** (e.g. \`workspace-files-2\`, or a private package name). That would
  dodge the loader's uniqueness check while creating a *second* service implementation — the opposite of the
  goal, and a source of subtle divergence from the bundle's copy.
- **Do not add a config row instead "just to be safe" either.** After deletion the entry comes from the bundle;
  if the profile genuinely needs to configure it, use the config-by-id form (§2, first row) with the id spelled
  exactly \`workspace-files\`.
- **Leave every other row alone.** \`dsh-file-trace\` and \`dsh-profiles\` (lines 4–7, 11–14) are legitimately
  profile-level inserts for ids no bundle ships; they are not implicated.

### 3.2 Is the plugin's own code at fault?

**No.** \`@deepseek-ai/dsh-api-workspace-files\` never executed. The throw happens in
\`EntryGroup.update\`/\`Include._apply\` while the tree is being composed, strictly before any plugin is
instantiated. The package's code, config schema, and service implementation are irrelevant to this crash — the
crash is about a *declaration duplicated across two patch layers*.

**Could any plugin-side change resolve the boot failure? No.** The duplicate is produced by the merge of the
profile patch and the bundle patch; the offending row lives in a file the plugin neither owns nor reads
(\`C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml\`). The only levers that remove the duplicate are on the
composition side: delete the profile row (correct), or stop shipping the bundle row (wrong — that would break
every other consumer of the bundle and re-create the original symptom). Even a plugin "renaming itself to avoid
the clash" would not resolve the boot failure: it would change the id the bundle declares, silently orphan the
bundle's own consumers, and still leave a bogus row in the profile.

### 3.3 What remains after the fix

Removing the row makes \`dsh web\` boot again, but **the original \`文件资源服务不可用\` symptom is still
unexplained**, and the fixture does not contain the evidence to close it. What the fixture *does* establish is
that its cause is **not** a missing composition entry: the bundle shipped \`workspace-files\` before the
maintainer's edit, and the failure message is a runtime consumer-side message, not a loader/composition error.
So the next diagnostic step is to capture the *runtime* error behind the document tab (the service-side error and
the consumer's resolution path), plus check for leftovers from the 0.1.2/0.1.3 profile state after the in-place
upgrade. That is a separate investigation; it must not be "fixed" with another insert row.

---

## 4. Prevention

### 4.1 Maintainer-side: what to look at before adding a row by hand

Before writing any \`- insert:\` row into a profile patch, check the **installed bundle's patch file** for that
id — that is the single check that would have prevented this incident:

1. **Resolve the installed tree** from the paths already visible in the environment:
   \`C:\Users\lhh\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\node_modules\...\` (the crash log at
   \`boot-crash-log.txt\` lines 4 and 11–12 shows exactly this shape, including the nested
   \`@deepseek-ai/dsh-app-boot\` and \`@deepseek-ai/cordis-plugin-loader\` packages).
2. **Open \`packages/bundle/web-app/cordis.patch.yml\`** in that tree and read the \`- insert:\` rows. If the id is
   there, the profile must not add it — the row in question sits at **L110–111** in the installed 0.1.5-alpha.2
   tree.
3. **Grep the installed tree for the id and the package name** (\`workspace-files\`,
   \`@deepseek-ai/dsh-api-workspace-files\`) before concluding anything is "missing". A missing *service* and a
   missing *entry* are different claims, and only the second is fixable with an insert row.
4. **Read the version's release/migration notes** for what the new bundle adds. This incident is precisely the
   case where "0.1.5 adds host service X to the web-app bundle" is the note that matters.
5. **Treat a runtime error message as evidence about the runtime**, not about the tree. \`文件资源服务不可用\`
   says a *read* failed; it does not say an *entry* is absent.

### 4.2 Host-side: what the boot could print to make this actionable

The current output (\`boot-crash-log.txt\` lines 8–15) already names the stage and the id, which is a good start,
but it stops there: the user gets a raw Node stack trace with no file paths, no line numbers, no owner, and no
remedy. A failure this cheap to diagnose should say all of the following at boot:

1. **Name the duplicate id** — \`duplicate loader entry id: workspace-files\` (already done).
2. **Name both declarations with source layer, file path, and line numbers**, e.g.
   \`profile patch C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml:18\` vs
   \`bundle patch .../packages/bundle/web-app/cordis.patch.yml:110\` — quoting both rows verbatim so the user
   does not have to hunt for them.
3. **Say who owns the entry** — \`workspace-files\` is provided by the **web-app bundle**; the bundle row is the
   authoritative one.
4. **Say whom to blame and what to delete** — this is a *profile patch* layering error (local configuration),
   not a plugin-author bug and not a bundle bug: **delete the \`workspace-files\` \`- insert:\` block from the
   profile patch**. To change its settings, edit the \`workspace-files\` config by id instead of inserting a row.
5. **Name the general rule** — "a profile patch may add rows only for ids no bundle ships; for bundle-provided
   ids, configure by id" — so the same mistake does not recur with a different plugin.
6. **Point at a verification command** — e.g. \`dsh plugin tree\` (or \`dsh doctor\`) that prints the *merged*
   loader entries with the layer each came from, so the check in §4.1 becomes one command instead of a manual
   grep.
7. **Offer a recovery path** — a flag such as \`--ignore-duplicate-profile-inserts\` (or an interactive repair)
   that boots with the redundant profile rows ignored, so a hard-locked-out user is not forced to hand-edit YAML
   before they can open the GUI again. Fail-closed stays the default; the flag is the escape hatch.
8. **Fail with a structured, non-stack-trace diagnostic** and a stable exit code, so the message is greppable
   and scriptable rather than a \`TypeError\` dump.

### 4.3 Author/docs-side

- Document the layering rule from §2 explicitly in the profile-patch guide, with this exact incident as the
  worked example: *config by id = safe; insert a new id = safe; insert an id the bundle ships = fatal*.
- On **in-place upgrades**, have the host detect the reverse of this trap: if a profile patch contains a manual
  \`- insert:\` for an id that the *new* bundle version now ships, print a migration notice
  ("\`workspace-files\` is now provided by the web-app bundle; your manual insert in \`…\cordis.patch.yml\` is now
  redundant and must be removed") and offer to remove it. That is precisely the situation an upgrader lands in,
  and it is machine-detectable from the two patch files alone.
- Add a **pre-flight lint** that validates the profile patch against the bundle's entries *before* the tree is
  applied, so the friendly diagnostic in §4.2 fires without ever reaching the loader's throw.

---

## 5. Evidence index

| Claim | Source |
|---|---|
| Crash message and stage names | \`boot-crash-log.txt\` lines 8–9 |
| Throw site = loader entry registry (\`EntryGroup.update\`, \`cordis-plugin-loader\`) | \`boot-crash-log.txt\` line 11 |
| Applied via \`cordis:include\` in \`dsh-app-boot\` \`boot()\` | \`boot-crash-log.txt\` lines 12–13 |
| No plugin code ran (composition-time failure) | \`boot-crash-log.txt\` lines 11–15 |
| Environment: Windows 11, npm global 0.1.5-alpha.2, Node v24.14.1 | \`boot-crash-log.txt\` lines 1, 17 |
| Installed-tree path shape (\`AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\node_modules\…\`) | \`boot-crash-log.txt\` lines 4, 11–12 |
| Maintainer's premise + manual insert after upgrade | \`boot-crash-log.txt\` lines 19–22 |
| The offending profile row (+ its "redundant" comment) | \`profile-patch-excerpt.txt\` lines 16–20 |
| Profile-level inserts that are legitimate | \`profile-patch-excerpt.txt\` lines 4–7 (\`dsh-file-trace\`), 11–14 (\`dsh-profiles\`) |
| Bundle already ships the identical row (L110–111) | \`web-app-patch-excerpt.txt\` lines 4, 6–8 |
| Other bundle-provided ids never inserted into the profile (control comparison) | \`web-app-patch-excerpt.txt\` lines 10–11, 13–18 |

## 6. Evidence boundary / honesty notes

- The fixture is four text files; it was read read-only and left unmodified. No dsh command was run, no
  migration or installation was executed, and nothing outside the permitted cell was read, listed, or written.
- The exact YAML syntax for "config by id" is **not** in this pack (see the caveat in §2); the report states the
  rule and flags the syntax as needing confirmation rather than inventing a key name.
- The root cause of the original \`文件资源服务不可用\` symptom is **not determinable from this pack** and is
  explicitly reported as an open item (§3.3) rather than guessed at. What *is* determinable — and is the point of
  the task — is that it was not a missing composition entry, and that the maintainer's response to it was fatal.
- Line numbers cited for the profile patch are line numbers *within the excerpt* (the real file's absolute line
  numbers are not given in the pack); the bundle row's L110–111 is the pack's own annotation of the installed
  file.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.