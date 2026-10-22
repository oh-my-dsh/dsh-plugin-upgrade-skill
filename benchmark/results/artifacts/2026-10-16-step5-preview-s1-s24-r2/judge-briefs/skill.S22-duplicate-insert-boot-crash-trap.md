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

# S22 · The Duplicate Insert That Crashed the Boot — Diagnosis

**Subject:** in-place dsh upgrade `0.1.2/0.1.3 → 0.1.5-alpha.2` (Windows, npm-global). Right-Sidebar
document tab opens but its content read fails (`文件资源服务不可用`); maintainer hand-adds a
`workspace-files` row to the profile `cordis.patch.yml`; the next `dsh web` dies with
`duplicate loader entry id: workspace-files`.

**Verdict (TL;DR).** The boot crash is a **profile-composition error, not a plugin fault**. The
maintainer `insert`-ed a loader-entry id (`workspace-files`) that the **web-app bundle already
ships**, so the Cordis loader saw two entries with the same key and refused the whole tree
(fail-fast, not silent-override). The fix is to **delete the duplicate `insert` block from the
profile patch** — nothing in the plugin's code, package, or manifest is wrong, and no plugin-side
change can clear a collision that lives in the overlay. The original `文件资源服务不可用` symptom
was *not* a missing composition row either; it is the in-place-upgrade stale-combo gap
(DSH-0.1.5-A1-20), healed by a **host restart + hard refresh**, not by hand-inserting a row.

Evidence pack (read-only): `fixture/boot-crash-log.txt`, `fixture/profile-patch-excerpt.txt`,
`fixture/web-app-patch-excerpt.txt`. Skill references cited by ID per the diagnosis citation
contract (`references/precision-checklist.md`).

---

## 1. Root cause

**The two colliding declarations.** Both declare the *same* loader-entry id `workspace-files`
for the *same* package `@deepseek-ai/dsh-api-workspace-files`:

| # | Declaration | File / location | Shape |
|---|---|---|---|
| A | `- insert:` → `- id: workspace-files` / `name: '@deepseek-ai/dsh-api-workspace-files'` | profile overlay `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml` — `fixture/profile-patch-excerpt.txt:18-20` | **manual insert (the new one)** |
| B | `- insert:` → `- id: workspace-files` / `name: '@deepseek-ai/dsh-api-workspace-files'` | web-app bundle `packages/bundle/web-app/cordis.patch.yml` (L110-111 in the installed tree) — `fixture/web-app-patch-excerpt.txt:6-8` | **bundle-provided (already present)** |

**Where the collision is detected.** At the **Cordis plugin-loader / composition layer**, during
host boot — before any plugin code runs. The crash log pins the exact path:

- `fixture/boot-crash-log.txt:8-9` — `Error: dsh: plugin tree failed to load: failed to apply
  loader entry include (cordis:include): duplicate loader entry id: workspace-files`
- `fixture/boot-crash-log.txt:10-15` — the throw originates in
  `EntryGroup.update (@deepseek-ai/cordis-plugin-loader/lib/index.js:91)`, called from
  `Include._apply (dsh-app-boot/lib/index.js:240)`, inside `boot (…:1534)`, under
  `runProfile` → `runCli`.

So it is the loader's **`cordis:include` loader-entry operation**, applied while composing the
plugin tree (`EntryGroup`), that raises the duplicate-key `TypeError`. This is composition-time,
not runtime/activation-time.

**Why the loader refuses the whole boot instead of accepting the later row.** The loader-entry id
is a **keyed registry** (`EntryGroup`); `insert` is an *add-new* operation with a uniqueness
constraint. A second entry claiming `workspace-files` is ambiguous — two loader entries would
compete to be "the" workspace-files plugin/service — so Cordis **fails fast and hard**: it throws
at `EntryGroup.update`, the exception propagates up through `boot`, and the entire plugin tree is
abandoned, so `dsh web` never starts. The skill states this rule verbatim
(`references/troubleshooting.md:18`, sourced from discussion
[#5999](https://github.com/deepseek-ai/deepseek-harness/discussions/5999)): *"Cordis 把重复
insert 视为致命错误（非静默覆盖）"* — a duplicate insert is a **fatal error, not a silent
overwrite**. Refusing is the safe choice for a keyed registry: silently deduping, dropping one,
or last-write-wins could mask a real composition bug and boot a subtly wrong tree; a clean,
named refusal is strictly better.

Note on precedence: the profile overlay *is* the higher-precedence layer than the bundle
(`references/api-migration-0.1.2-alpha.2.md` **API-08**, precedence lowest→highest: bundle
patches → `$DSH_HOME/profiles/<name>/cordis.patch.yml` → `$DSH_HOME/cordis.patch.yml` → `--patch`
CLI). But "later layer wins" governs **config override of a matching-id row**, not the
**add-new `insert`** path. `insert` of an id that a lower layer already provides is a duplicate
regardless of precedence — which is exactly what happened.

---

## 2. Layering rules (profile patch acting on a bundle-provided plugin)

For a profile `cordis.patch.yml` layered over a bundle, the three candidate operations sort as:

| Operation | Safe? | Why |
|---|---|---|
| **Change the plugin's config by id** (a row that *matches* the existing `id`, restating the whole `config`, e.g. `disabled`, `mode`) | ✅ **Safe** | The profile overlay is higher-precedence than the bundle; a matching-id row **overrides** config. Whole-object replacement, not a deep merge — you must restate every field you want to keep (API-08, `api-migration-0.1.2-alpha.2.md:546`; real example: the `session-telemetry-otel` override in `v0.1.2-alpha.1.md:394`). |
| **Add a row for an id no bundle ships** (a genuinely new/external plugin) | ✅ **Safe** | A fresh id collides with nothing. This is the legitimate use of `- insert:` — e.g. the maintainer's own `dsh-file-trace` and `dsh-profiles` rows (`fixture/profile-patch-excerpt.txt:5-7,12-14`) are external plugins the bundle never ships, so they are fine. |
| **Add a row for an id a bundle already ships** (a *second* `insert` of a bundle-provided id) | ❌ **FATAL** | Duplicate loader-entry id → `EntryGroup.update` throws → whole boot aborted (`troubleshooting.md:18`). |

**Which case is the maintainer's action, and the proof row.** The maintainer performed the
**fatal third case**: a manual `- insert:` of `workspace-files`
(`fixture/profile-patch-excerpt.txt:18-20`). The row that proves it is
**`fixture/web-app-patch-excerpt.txt:6-8`** — the bundle's own `- insert:` of the identical
`id: workspace-files` — reinforced by its header `fixture/web-app-patch-excerpt.txt:4`: *"The
workspace-files row is already here (L110-111 in the installed tree)."* The same excerpt's
adjacent rows make the contrast explicit (`:10-11`): `session-controller` /
`settings-controller` are *likewise* bundle-provided and were *never* manually inserted into the
profile — i.e. the bundle's own ids are not the profile's to add.

The maintainer's own comment even states the risk and then ignores it
(`fixture/profile-patch-excerpt.txt:17`): *"如果 web-app bundle 已包含此行则此条为冗余；保留以
确保升级 profile 不遗漏"* — "if the web-app bundle already contains this row, this entry is
redundant; keep it to be safe." The "keep to be safe" instinct is precisely the anti-pattern: for
a bundle-provided id there is nothing to add, and adding it is fatal.

---

## 3. Fix

**What to change, and where.** In the profile overlay
`C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`, **delete the entire manual `workspace-files`
block** — the `- insert:` / `- id: workspace-files` / `name: '@deepseek-ai/dsh-api-workspace-files'`
rows together with their two comment lines (`fixture/profile-patch-excerpt.txt:16-20`). Do **not**
replace it with an override row either: `workspace-files` is bundle-provided and already enabled,
so there is nothing to configure. Then restart `dsh web`. This is the minimal, sufficient change;
`troubleshooting.md:18` prescribes exactly this ("删除 profile patch 中重复的 insert 块即可恢复
启动").

**Is the plugin's own code at fault? No.** `@deepseek-ai/dsh-api-workspace-files` is correctly
authored and correctly shipped by the web-app bundle. The fault is entirely in the **profile
composition overlay** (the maintainer's hand edit). Under the skill's failure-attribution model
(`SKILL.md` validation step 4, `scripts/verify-runtime.mjs`) this classifies as **`profile-config`**,
not `plugin-code` and not `dsh-runtime`.

**Could any plugin-side change resolve the boot failure? No.** The crash is a duplicate-key
collision between *two composition rows* (bundle + overlay). No edit to the plugin's source,
`package.json`, manifest, or client bundle can remove the overlay's duplicate row — only editing
the profile patch can. The plugin author has no lever here; the fix is owned by whoever owns the
profile overlay.

**Do not "fix" the original symptom with an insert.** The pre-crash `文件资源服务不可用` was *not*
caused by a missing composition row — the bundle already provides `workspace-files`
(`fixture/web-app-patch-excerpt.txt:6-8`). If the service is genuinely unavailable after removing
the duplicate block, the root cause is a **compose/artifact gap, not a missing insert**
(`troubleshooting.md:18`). For an in-place npm-global upgrade the concrete gap is
**DSH-0.1.5-A1-20** (`references/v0.1.5-alpha.1.md:717-726`, real-host verified on the same
2026-09-09 Windows npm-global profile, discussion #5999): the first post-upgrade boot serves a
client combo that **omits the newly-added bundle modules** (e.g. the `ui-sidebar-*` rows), so
new-surface reads fail; a **host restart self-heals** the roster/combo mismatch. The correct first
response is restart `dsh web` + hard-refresh the browser; if it persists, attribute per A1-20
(fetch one NEW and one OLD bundle module at the same rev — old `200` + new `404` pins the gap to
the host artifact/rev set, not the plugin).

---

## 4. Prevention

**What to check in the installed bundle before adding a row by hand.**

1. **Open the bundle's composition and grep the id first.** The web-app bundle ships its loader
   rows in `packages/bundle/web-app/cordis.patch.yml` inside the installed tree — the
   `workspace-files` row is at **L110-111** (`fixture/web-app-patch-excerpt.txt:1-4`). Before any
   manual `insert`, confirm the id is *not* already there. If it is, the profile must **not** add
   it; at most it **overrides** config by a matching-id row (whole-object replacement, API-08:546).
2. **Inspect the fully composed tree, not a snippet.** Run
   `dsh --profile web --dump-config` and read which layer already owns the id (API-08 verification
   step, `api-migration-0.1.2-alpha.2.md:562`). Composition precedence is bundle → profile patch →
   home patch → `--patch`, so a row you add can be silently shadowed or, if it is an `insert` of an
   existing id, fatal.
3. **Only `insert` ids that no lower layer ships.** Prefer the managed path where possible (the
   plugin manager writes toggles into the profile patch and refuses a duplicate id —
   `references/v0.1.6-alpha.2.md` plugin-manager card), and treat "0.1.5 系列新增的
   `workspace-files` / `ui-sidebar-*` 等已由 web-app bundle 自动提供，升级 profile 无需手动补插"
   (`troubleshooting.md:18`) as the standing rule for upgrade profiles.

**What the host could print at boot to make this actionable (whom to blame, what to delete).**
Today the crash names the id but not the owner or the remedy (`fixture/boot-crash-log.txt:8-9`).
An actionable diagnostic on `duplicate loader entry id: <id>` should print, in one message:

- **the colliding key and operation** — `duplicate loader entry id: workspace-files` while applying
  `cordis:include` (already present);
- **whom to blame** — the **profile overlay**, not the plugin and not the host: name both layers,
  e.g. *"id `workspace-files` is already provided by the web-app bundle
  (`packages/bundle/web-app/cordis.patch.yml`, L110-111); the profile overlay
  `$DSH_HOME/profiles/web/cordis.patch.yml` inserts it a second time."*;
- **what to delete** — the exact file + block: *"delete the `- insert: - id: workspace-files` block
  from `$DSH_HOME/profiles/web/cordis.patch.yml` and restart; to change its config instead, use an
  override row that restates the whole config."*;
- **the next probe** — *"run `dsh --profile web --dump-config` to confirm the composed owner; if the
  service is still unavailable after removing the row, the cause is a compose/artifact gap
  (DSH-0.1.5-A1-20) healed by a host restart + hard refresh, not a missing insert."*

That converts a bare `TypeError` stack into blame (profile overlay), the precise deletion, and the
correct follow-up — and steers the maintainer away from the "keep it to be safe" insert that
caused the crash in the first place.

---

## Evidence & citation index

- **Crash layer / duplicate-id rule:** `fixture/boot-crash-log.txt:8-15`;
  `references/troubleshooting.md:18` (discussion
  [#5999](https://github.com/deepseek-ai/deepseek-harness/discussions/5999)) — *Cordis composition
  rule, no version card, cross-version universal*.
- **Override-by-id vs precedence:** `references/api-migration-0.1.2-alpha.2.md` **API-08** (`:535-555`,
  esp. `:546` whole-config replacement, `:548-553` layer precedence); override shape example
  `references/v0.1.2-alpha.1.md:394`.
- **`workspace-files` is a new, bundle-provided file surface:**
  `references/v0.1.5-alpha.1.md` **DSH-0.1.5-A1-11** (`:387-399`, package
  `@deepseek-ai/dsh-api-workspace-files`).
- **Bundle already ships the id (the proving row):** `fixture/web-app-patch-excerpt.txt:4,6-8`
  (+ adjacent `session-controller`/`settings-controller` `:10-18`).
- **Maintainer's fatal insert + the "redundant, keep to be safe" comment:**
  `fixture/profile-patch-excerpt.txt:16-20`.
- **Original symptom is a stale-combo gap, not a missing row:**
  `references/v0.1.5-alpha.1.md` **DSH-0.1.5-A1-20** (`:717-726`, + the six-plugin real-host
  crossing record `:730-737`).
- **Managed path refuses duplicate ids:** `references/v0.1.6-alpha.2.md` plugin-manager card
  (`a duplicate id is refused`).

*Scope: read-only diagnosis. The fixture was inspected and left unchanged; this report is the only
artifact written (under the designated `agent-output/S22-duplicate-insert-boot-crash-trap/`).*


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.