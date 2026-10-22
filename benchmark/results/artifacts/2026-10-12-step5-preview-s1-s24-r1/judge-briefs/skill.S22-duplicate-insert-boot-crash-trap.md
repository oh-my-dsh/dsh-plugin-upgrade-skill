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
#### FILE: S22-duplicate-insert-boot-crash-trap/S22-duplicate-insert-boot-crash-trap.md

# S22 · The Duplicate Insert That Crashed the Boot — read-only incident report

Evidence (read-only, unmodified): `fixture/boot-crash-log.txt`, `fixture/profile-patch-excerpt.txt`,
`fixture/web-app-patch-excerpt.txt`, `fixture/README.md`.
Skill reference consulted read-only: `skills/plugin-upgrade/` (`SKILL.md`,
`references/troubleshooting.md:18`, `references/v0.1.5-alpha.1.md` (A1-16, A1-20),
`references/v0.1.5-alpha.2.md`, `references/api-migration-0.1.2-alpha.2.md` (API-08),
`references/host-plane-probes.md`, `references/v0.2.0-rc.1.md` (RC1-04),
`references/v0.1.6-alpha.1.md`, `references/v0.1.6-alpha.2.md`).

---

## 1 · Root cause

**The two declarations that collide**

| Declaration | Location | Content |
|---|---|---|
| The maintainer's manual insert | `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml` — profile-patch-excerpt.txt:18-20 | `- insert:` / `- id: workspace-files` / `name: '@deepseek-ai/dsh-api-workspace-files'` |
| The bundle-provided row | web-app bundle's `cordis.patch.yml` (`packages/bundle/web-app/cordis.patch.yml` in the installed npm 0.1.5-alpha.2 tree) — web-app-patch-excerpt.txt:6-8, "L110-111 in the installed tree" | `- insert:` / `- id: workspace-files` / `name: '@deepseek-ai/dsh-api-workspace-files'` |

Both carry the **same loader-entry id `workspace-files` and the same package
`@deepseek-ai/dsh-api-workspace-files`** — byte-for-byte the same row, added twice at two
different composition layers.

**Where the collision is detected: the Cordis loader-composition layer, during profile boot,
before any plugin module is imported.** Read the crash log bottom-up
(`boot-crash-log.txt:8-16`):

```
boot-crash-log.txt:8   Error: dsh: plugin tree failed to load: failed to apply loader entry include (cordis:include):
boot-crash-log.txt:9     duplicate loader entry id: workspace-files
boot-crash-log.txt:10  TypeError: duplicate loader entry id: workspace-files
boot-crash-log.txt:11      at EntryGroup.update (@deepseek-ai/cordis-plugin-loader/lib/index.js:91:28)
boot-crash-log.txt:12      at Include._apply (@deepseek-ai/dsh-app-boot/lib/index.js:240:19)
boot-crash-log.txt:13      at boot (…dsh-app-boot/lib/index.js:1534:3)
boot-crash-log.txt:14      at async runProfile (@deepseek-ai/dsh/lib/profile-boot-*.js:311:14)
```

The throwing frame is `EntryGroup.update` in **`@deepseek-ai/cordis-plugin-loader`**, reached
from `Include._apply` in `dsh-app-boot` while boot applies the `cordis:include` entries of the
composed tree, on the path `runProfile → boot → Include._apply → EntryGroup.update`. This is
the *entry/row composition* stage of the plugin tree — not plugin activation, not the plugin's
own code. Nothing in `@deepseek-ai/dsh-api-workspace-files` has executed; the process dies
before any factory runs. The maintainer's hand-written row in the profile's patch is the
**last (outermost) layer**, so it is applied after the bundle layers have already contributed
the `workspace-files` entry, and it is the row that triggers the duplicate.

**Why the loader refuses the whole boot instead of accepting "the later row"**

A loader-entry `id` is the *identity* of an entry in the tree: it is the key services are
injected by, the key by which later layers address the row to override it, the key the client
half registers under (`window.__ModuleLoader__.load({ id, factory })`), and the key a
profile patch uses later to enable/disable/configure it. Two live entries with one id would
mean two fibers for one name, double registration on both planes, and ambiguous resolution of
every later `ctx.inject([...])` / slot ownership / tool row. Cordis resolves that ambiguity by
**fail-fast, not by last-write-wins**: a duplicate *insert* is treated as a fatal composition
error (see `references/troubleshooting.md:18` — "Cordis turns a duplicate insert into a fatal
error, not a silent overwrite"), because a silent winner would hide an authoring mistake in a
configuration file and make the composed tree depend on undeclared layer ordering.
Note the asymmetry that follows from the same rule set:

- a **patch row that matches an existing id** (an *override*) is legal and later layers win —
  `config` is replaced whole, not deep-merged (`references/api-migration-0.1.2-alpha.2.md:546`);
- a **patch row whose id is not found** merely warns and no-ops
  (`patch: entry %C not found`, `references/v0.1.6-alpha.1.md:168`);
- an **insert whose id already exists** is fatal (this case).

So the composition layer is deliberately strict in exactly one direction — the one that would
otherwise produce two owners for one name.

---

## 2 · Layering rules for a profile patch acting on a bundle-provided plugin

| Operation on a bundle-provided plugin | Verdict | Why |
|---|---|---|
| **Change the plugin's config by id** — a row `- id: workspace-files` + `config: {…}` in the profile's `cordis.patch.yml` as an *override* | **Safe** | Matching an existing id *is* the override operation. Later layers override earlier ones; `config` is a whole replacement, so every field to keep must be restated (`references/api-migration-0.1.2-alpha.2.md:546`). This is also how the host itself expresses a row toggle — it edits only `disabled` in the last matching override, or appends one (`references/v0.1.6-alpha.2.md`). |
| **Add a row for an id no bundle ships** (e.g. the profile's own external plugins) | **Safe** | That is what `insert` is for: `dsh-file-trace`, `dsh-profiles` and the six external client plugins in profile-patch-excerpt.txt:5-14 are exactly this case, and legitimately live in the profile patch. |
| **Add a row for an id a bundle already ships** — a second `insert` of a provided id | **Fatal** — `duplicate loader entry id: <id>`, whole boot aborted | The entry already exists in the composed tree; `insert` claims to create a new entry and cannot repurpose the existing one. |

**Which case is the maintainer's action:** the third — the fatal one. The maintainer did not
override `workspace-files` by id, they *inserted* a second row for an id the web-app bundle
already ships.

**The evidence row that proves it:** profile-patch-excerpt.txt:16-20

```yaml
# workspace-files: 右侧 Sidebar 文件预览所需的宿主服务（0.1.5 系列新增）
# 如果 web-app bundle 已包含此行则此条为冗余；保留以确保升级 profile 不遗漏
- insert:
    - id: workspace-files
      name: '@deepseek-ai/dsh-api-workspace-files'
```

against web-app-patch-excerpt.txt:6-8 (the same `id: workspace-files` row, present at
"L110-111 in the installed tree"). The comment even records the author's own suspicion that
the row may be redundant — the correct response to that suspicion was to *check the bundle*,
not to insert "为确保升级 profile 不遗漏". The bundle excerpt's neighbouring rows
(`session-controller`, `settings-controller`, web-app-patch-excerpt.txt:13-18) show the
general case: sibling bundle-provided rows were never manually inserted into the profile patch
and boot fine.

Corroborating version context: the `workspace-files` row (and the four sibling
`resources` / `ui-sidebar-right` / `ui-sidebar-textpreview` / `ui-sidebar-files` rows) entered
`dsh-web-app`'s `cordis.patch.yml` on the 0.1.5-alpha.1 edge
(`references/v0.1.5-alpha.1.md`, card A1-16), i.e. **before** this profile's 0.1.2/0.1.3
composition was written. A profile that upgrades from 0.1.2/0.1.3 inherits these rows from the
bundle automatically and must add nothing.

---

## 3 · Fix

**What to change, and in which file**

1. Open `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml` — **only this file**. Take a copy
   first (rollback baseline).
2. **Delete the whole trailing block**, i.e. the `insert:` row with `id: workspace-files`
   plus its two comment lines (profile-patch-excerpt.txt:16-20). Delete — do not comment out,
   do not rename the id, do not change `disabled`.
3. Change nothing else. The pre-existing rows (`dsh-file-trace`, `dsh-profiles`, the six
   external client plugins) are independent inserts of non-bundle ids and stay as they are.
4. Boot again: `dsh web` should start. Verify the composition resolves correctly with
   `dsh --profile web --dump-config`, confirm exactly **one** `workspace-files` row exists and
   that it is enabled and pointing at `@deepseek-ai/dsh-api-workspace-files`, then hard-refresh
   the browser and confirm the right-sidebar document tab renders content.

**Is the plugin's own code at fault?** No. `@deepseek-ai/dsh-api-workspace-files` is not
executed at the point of failure; the crash happens in the loader's entry-composition stage.
The fault is entirely in the maintainer's hand-edited profile composition (a configuration
authoring error, not a plugin defect and not a host defect).

**Could any plugin-side change resolve the boot failure?** No — and this is the important
negative result. The duplicate row is a statement in the *profile's* `cordis.patch.yml`; no
change inside the plugin package, no version bump and no patch to
`packages/api/workspace-files/**` can remove or rename it, and nothing in the plugin runs early
enough to intervene. Plugin-side code changes cannot fix a composition-layer refusal.

**On the original symptom (文件资源服务不可用) — do not "fix" it by insert either.** The
right-sidebar document tab opened but its content read failed, and that symptom predates the
manual insert. The documented cause of exactly this signature on an in-place npm-global
upgrade of an older profile is a **compose/artifact gap**, not a missing row: an upgraded
profile can be served a client combo that omits the newly-added bundle modules, one dropped
module then fails every client plugin's registration, and a **host restart self-heals** the
roster/combo mismatch (`references/v0.1.5-alpha.1.md`, card DSH-0.1.5-A1-20, real-host
verified, with the upstream thread [discussion #5999](https://github.com/deepseek-ai/deepseek-harness/discussions/5999);
also `references/troubleshooting.md:18`: "if the plugin really is unavailable, the root cause
is a compose/artifact gap, not a missing insert"). Correct order of operations: fully stop
every dsh process → restart the host once → hard-refresh the browser; if it still fails,
attribute it (fetch one *new* bundle module and one *old* module at the same rev — old 200 +
new 404 pins the gap to the host artifact set), and only then consider a rollback to the
previous pinned version. Never hand-add an insert for a bundle-provided id.

---

## 4 · Prevention

**Before adding such a row by hand — what to look at in the installed bundle**

1. **Read the installed bundle's patch file, at the real install path**, not a remembered or
   copy-pasted composition. The row here is at "L110-111" of the installed web-app bundle's
   `cordis.patch.yml` in the npm tree
   (`…/node_modules/@deepseek-ai/dsh/node_modules/…/packages/bundle/web-app/cordis.patch.yml`,
   proven via the path in `boot-crash-log.txt:4-16`). Grep it for the id first:
   e.g. search the installed tree's `cordis.patch.yml` files for `workspace-files` /
   `ui-sidebar-` / `session-controller` before writing anything.
2. **Take the row-id inventory from the target tag's bundle** — 0.1.5's web-app bundle already
   ships `workspace-files`, `resources`, `ui-sidebar-right`, `ui-sidebar-textpreview`,
   `ui-sidebar-files` (card A1-16), and 0.1.6-alpha.1 adds `terminal-controller` and
   `ui-sidebar-terminal` beside them. A profile upgrading across an edge inherits all of them;
   "re-run your row-id inventory against the new patch files before inserting"
   (`references/v0.2.0-rc.1.md`).
3. **Dump the composed config instead of guessing**: `dsh --profile <name> --dump-config`
   shows the resolved rows, so "is the row present / is it disabled / is it pointing at the
   expected package" is an observation, not an assumption.
4. **Use the override form when the goal is to configure, not to provide**: `- id: <id>` +
   `config: {...}` (whole replacement, restate everything to keep); `disabled: true/false` to
   toggle. Only use `insert` for an id no layer ships.
5. **For authors who must ship a row that might collide across cohorts**, make the row yield
   instead of crashing: probe at composition time and disable when the official row with the
   same id is already enabled — the dual-cohort `!!js` pattern, e.g.
   `[...ctx.loader.entries()].some(entry => entry.options.id === '…' && !entry.disabled)`
   (`references/host-plane-probes.md:6-14`).

**What the host could print at boot to make this failure actionable (whom to blame, what to
delete)**

The current message (boot-crash-log.txt:8-10) names only the id and the crash; it gives no
file, no line, no layer and no remedy, which is why the maintainer could not self-correct.
Actionable alternatives, in decreasing value:

1. **Attribution line naming the offender and the incumbent**, e.g.
   `dsh: duplicate loader entry id "workspace-files" — profile patch
   C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml:18 inserts an id already provided by bundle
   "@deepseek-ai/dsh-web-app" (cordis.patch.yml L110, package
   @deepseek-ai/dsh-api-workspace-files). The plugin code is not at fault; delete the
   duplicate insert block from the profile patch (an id that already exists may be overridden
   by id, never inserted again).` — i.e. **blame: the profile patch author; delete: that
   insert block**.
2. **Suggest the safe alternative in the same breath**: "to change its config or toggle it,
   override the existing row by id (`disabled:` / `config:`) instead of inserting."
3. **Follow the host's existing attributed-warning precedent** so the format is consistent:
   the host already prints `dsh: disabling profile plugin row "<id>": …` for denied rows
   (`references/v0.1.7-rc.1.md:87`) and warns `patch: entry %C not found` for an unmatched
   override id (`references/v0.1.6-alpha.1.md:168`); `auditStartupEntries` already reports
   per-id inactive-entry warnings (`references/v0.1.6-alpha.1.md:103`). A duplicate insert is
   the same class of composition-layer diagnostic and deserves the same treatment.
4. **Keep the fail-fast and separate it from soft diagnostics**: composition must still refuse
   to boot on a duplicate id (section 1), but the message should not read as a plugin failure —
   it is a profile-authoring failure, and the printed text is what turns this incident into a
   self-correcting one.

---

## Evidence index

| Claim | Evidence |
|---|---|
| Duplicate id and the two colliding rows | boot-crash-log.txt:8-10; profile-patch-excerpt.txt:16-20; web-app-patch-excerpt.txt:1-8 |
| Collision detected at the Cordis loader composition layer, before plugin modules load | boot-crash-log.txt:11-16 (`EntryGroup.update` ← `Include._apply` ← `boot` ← `runProfile`) |
| Bundle-provided `workspace-files` since 0.1.5-alpha.1 | web-app-patch-excerpt.txt:4; `references/v0.1.5-alpha.1.md` card A1-16 |
| Duplicate insert is fatal by design; delete the profile block | `references/troubleshooting.md:18`; `references/api-migration-0.1.2-alpha.2.md:546` |
| Sibling bundle rows never hand-inserted | web-app-patch-excerpt.txt:10-18 |
| Original symptom = compose/artifact gap, healed by a host restart | `references/v0.1.5-alpha.1.md` card DSH-0.1.5-A1-20; `references/troubleshooting.md:18` |
| Id-not-found only warns; duplicate id is fatal | `references/v0.1.6-alpha.1.md:168`; boot-crash-log.txt:10 |
| Author-side yield pattern against an existing official row | `references/host-plane-probes.md:6-14` |

## Rollback / residual risk

- Baseline before the fix: `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml` as-is (with the
  duplicate block) — copy it to a scratch path before editing; recovery is a single block
  deletion, so rollback is re-inserting the block (which just reproduces the crash).
- Not executed here: the profile patch was never modified, `dsh web` was never started, no
  migrations or installs were run — this report is read-only analysis against the evidence pack.
- Residual: if the 文件资源服务不可用 symptom persists after the duplicate block is deleted
  and the host is restarted once, it is a compose/artifact gap (A1-20) — attribute with the
  new-module-vs-old-module rev probe before further changes, and roll back the global package
  to the previous pinned version as the documented escape hatch.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.