# S22 — The Duplicate Insert That Crashed the Boot

Read-only analysis of the 0.1.5-alpha.2 upgrade incident. Evidence pack: `fixture/`
(README.md, boot-crash-log.txt, profile-patch-excerpt.txt, web-app-patch-excerpt.txt).
Nothing in `fixture/` was modified; no boot, migration, or install was executed.

---

## 0. Verdict in one paragraph

The maintainer's diagnosis was false and his remedy was the crash. The workspace-files
host service was **never missing** — the 0.1.5-alpha.2 web-app bundle already ships the row
(`- id: workspace-files / name: '@deepseek-ai/dsh-api-workspace-files'`). By copying that
same row into the profile's `cordis.patch.yml` as a second `insert`, he created two
declarations of one loader entry id in a single composed entry group, and the Cordis loader
rejects the composition itself — before a single plugin is instantiated. The fix is to delete
the hand-added insert block from the profile patch, nothing else. No plugin code is involved
and no plugin-side change can fix it.

---

## 1. Root cause

### 1.1 The two colliding declarations

| # | Declaration | File | Location | Owner |
|---|---|---|---|---|
| A | `- id: workspace-files`, `name: '@deepseek-ai/dsh-api-workspace-files'` | web-app bundle `cordis.patch.yml` (packages/bundle/web-app) | the excerpt's own annotation says **L110–111** in the installed tree | npm-installed bundle, read-only, replaced on every upgrade |
| B | `- id: workspace-files`, `name: '@deepseek-ai/dsh-api-workspace-files'` — an identical second `insert` | profile `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml` | **L18–20** of the excerpt (comment L16–17, `- insert:` L18, `- id: workspace-files` L19, `name:` L20) | user-editable profile state, survives upgrades |

Same id, same package name, two different source files. That is the entire collision.

### 1.2 At which layer it is detected

Not YAML parsing, not a service registry, not plugin runtime. It is detected in the
**Cordis loader's entry-composition layer**, specifically while an `include` node is being
applied into the loader's `EntryGroup`:

- `boot(...)` — `dsh-app-boot/lib/index.js:1534` — starts building the plugin tree.
- `Include._apply` — `dsh-app-boot/lib/index.js:240` — applies the included patch layer
  (the `cordis:include`) into the entry group that the earlier layer already populated.
- `EntryGroup.update` — `cordis-plugin-loader/lib/index.js:91` — this is where the
  `TypeError: duplicate loader entry id: workspace-files` is actually thrown.
- `dsh-app-boot/lib/index.js:1545` — the throw site that re-wraps it as
  `Error: dsh: plugin tree failed to load: failed to apply loader entry include (cordis:include)`.

So the failure is a **composition-time, tree-build-time** fault. It happens after the profile
patch file has been read and before any plugin module is imported, any service is provided, or
any listener binds. The error text even names the mechanism: "failed to apply loader entry
include (cordis:include)" — the *apply* of an include, not a plugin's start-up.

### 1.3 Why the loader refuses the whole boot instead of letting the later row win

Three reasons, all structural:

1. **The id is the primary key of the entry group, not a label.** Entries are looked up,
   updated, disabled and removed *by id* (`EntryGroup.update(id, …)` is literally the
   function that threw). Two entries with one id make every later id-addressed operation —
   config override, disable, remove, service resolution — refer to an ambiguous target. The
   loader cannot satisfy its own contract, so it stops rather than pick a winner.
2. **There is no "later wins" semantics to appeal to.** Layer precedence in dsh is expressed
   by *where* a row lives and by id-targeted patching of an existing entry. It is not
   expressed by "the file parsed last silently re-declares the entry". Declaring a second
   entry is not an override; it is a second object with the same name.
3. **Fail-fast, all-or-nothing composition.** The tree is built completely before boot
   proceeds; a half-built tree has no defined service graph, so a partially applied
   composition cannot be booted. Silently accepting the duplicate would also be actively
   harmful: it would make a wrong profile patch *look* successful and hide the real
   document-read defect (§3.4), which is the exact trap this incident fell into.

Corollary: "duplicate is just redundant" is the wrong mental model. In this loader a duplicate
**entry** is a hard composition error; only a duplicate *config key* on one entry is benign.

---

## 2. Layering rules — safe vs. fatal

For a profile patch acting on a plugin that a bundle already provides:

| Operation | Example | Verdict | Why |
|---|---|---|---|
| Change the plugin's **config by id** (address an existing entry, no new `insert`) | an entry naming `workspace-files` with only `config:` keys | **Safe** | Patches an entry that already exists; the id stays unique, the owner stays the bundle. This is the intended extension point. (Exact keyword — inline override row vs. explicit patch verb — varies by loader version; the invariant is *address by id, do not declare a new entry*.) |
| Add a row for an id **no bundle ships** | `- id: dsh-profiles / name: '@lhh010/dsh-profiles'`; `- id: dsh-file-trace / …` | **Safe** | Genuinely new plugin; the profile is the only declarer, so the id is unique. This is what the earlier rows in the same profile file are doing correctly. |
| Add a row for an id a bundle **already ships** | `- insert: [- id: workspace-files / name: '@deepseek-ai/dsh-api-workspace-files']` | **Fatal — boot-blocking** | Two entries, one id ⇒ `duplicate loader entry id` ⇒ whole tree load aborts. |

**Which case is the maintainer's action:** the third, fatal one. **Which row proves it:**
the profile excerpt's own last block, `- insert:` at **L18** containing
`- id: workspace-files` at **L19** with `name: '@deepseek-ai/dsh-api-workspace-files'` at
**L20** — byte-for-byte the same id/name pair that the web-app bundle excerpt shows already
present at **L110–111** of the installed `packages/bundle/web-app/cordis.patch.yml`.
The counter-evidence is the bundle excerpt itself: it lists `session-controller` and
`settings-controller` as adjacent bundle-provided rows that were *never* manually inserted —
showing that bundle-owned ids normally stay untouched in the profile.

The comment the maintainer wrote above the block —
"如果 web-app bundle 已包含此行则此条为冗余；保留以确保升级 profile 不遗漏"
("if the bundle already contains this row it is redundant; keep it to be sure the upgraded
profile doesn't miss it") — is the precise inversion of the loader's semantics: the row is not
redundant, it is an error, and the "keep it to be safe" instinct is what converted a cosmetic
doubt into a total boot failure.

---

## 3. Fix

### 3.1 The minimal correct change

Edit **`C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`** (the only file that may change):

- delete the trailing `- insert:` block for `workspace-files` — the excerpt's **L16–20**
  (the two comment lines and the three-row insert), i.e. the block whose id is
  `workspace-files`;
- keep every other row untouched, including the six external client plugins,
  `dsh-file-trace` and `dsh-profiles`;
- leave no empty trailing `insert:` key behind (a bare `- insert:` with an empty list is
  itself a malformed patch layer);
- then restart. The web-app bundle row becomes the single declarer again and the tree loads.

Do **not** edit the bundle `cordis.patch.yml` under
`…\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-bundle-web-app\…`:
it is package-owned, will be restored by the next `npm i -g`, and removing the bundle row
instead of the profile row would break the documented upgrade path (and the recovery would
be undone by npm).

If the maintainer genuinely needs different behaviour from the service (a different workspace
root, a size cap, a feature toggle), the correct follow-up is a **config override addressed to
the existing id** (or a config key requested upstream) — never a second `insert`.

### 3.2 Is the plugin's own code at fault?

**No.** The `@deepseek-ai/dsh-api-workspace-files` implementation is never reached: the
loader aborts while composing the tree, before importing plugin modules or constructing the
plugin instance. There is no bug in that plugin that could produce this message, and the
stack trace contains no plugin frame at all.

### 3.3 Could any plugin-side change resolve the boot failure?

**No.** Mechanically the plugin cannot help: it is not yet loaded when the throw happens.
Nor is there a legitimate plugin-side remedy if it were loaded:

- renaming the plugin id would not remove the duplicate — the bundle row and the profile row
  both carry the literal string `workspace-files`, so the collision is in the *patch data*,
  not in the package;
- making the plugin tolerate double registration is impossible by construction (the loader
  never gets that far, and duplicate **entry ids** are rejected in the loader, not in the
  plugin API);
- the bundle is what owns the id; a plugin cannot withdraw the maintainer's hand-written row.

The only actor who can change the outcome is the owner of `cordis.patch.yml`.

### 3.4 Important honesty note on the original symptom

The evidence pack **falsifies** the premise that started this: the host service was not
missing from the composition — the bundle ships it. Therefore 文件资源服务不可用 (document
content read failed while the tab itself opened) has some *other* cause that this pack does
**not** contain the evidence to identify. Plausible directions, to be investigated
separately and read-only: workspace root / path not resolvable under the new layout, profile
data or state written under 0.1.2/0.1.3 not matching 0.1.5 expectations, file permissions or
ACLs on the documents directory, or the plugin being present but erroring at start-up (which
would appear in *its* log lines, not in this crash). Do not re-diagnose it as "missing from
composition" — that hypothesis is already dead.

---

## 4. Prevention

### 4.1 What the maintainer should inspect before hand-adding a row

1. **Who ships the id.** Search the installed bundle patches for the literal id before writing
   anything, e.g. the `@deepseek-ai/dsh-bundle-web-app` (and sibling `dsh-bundle-*`)
   `cordis.patch.yml` files under the npm `node_modules` tree named in the crash log, plus
   any app-boot built-in/default entries. One grep for `workspace-files` would have ended the
   incident before it started.
2. **The composed tree, not the profile file.** Resolve/dry-run the entry list and read the
   ids that actually result, rather than reasoning about the profile patch in isolation. The
   profile is one layer of several; only the composed ids are authoritative.
3. **The upgrade note / changelog.** The profile comment itself says the service is "0.1.5
   系列新增" — new in the 0.1.5 series, i.e. *the series that also moved it into the bundle*.
   A row that becomes bundle-provided during an upgrade is a row to **delete**, not to keep.
4. **A naming heuristic that actually holds.** Every row the profile legitimately adds is a
   third-party / external package (`@lhh010/…`, `@dsh-external/…`). Any carelessly added
   `@deepseek-ai/dsh-…` row in a profile patch should be presumed bundle-owned until proven
   otherwise.
5. **Comment discipline.** Never write "redundant, keep for safety". In this loader the
   fallback direction is inverted: an unnecessary row is a fatal row. The right comment is the
   negative one — "bundle-provided, do not insert here".
6. **Post-upgrade diff.** After each upgrade, diff the profile patch against the new bundle
   patch and retire hand-added rows whose ids have become bundle-owned.

### 4.2 What the host should print at boot to make this actionable

The current message names the id and the mechanism but answers neither "whose row?" nor "what
do I delete?". A good boot diagnostic for this class would carry four fields:

1. **Both declarers, with absolute paths and line numbers**, e.g.
   `duplicate loader entry id 'workspace-files'` / `  first : bundle @deepseek-ai/dsh-bundle-web-app@0.1.5-alpha.2 — …/bundle/web-app/cordis.patch.yml:110` /
   `  again : profile patch C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml:19`.
2. **The include chain that joined them** — which `cordis:include` applied which file into
   which group, so the layer (bundle vs. profile vs. built-in) is obvious instead of inferred
   from a two-line stack.
3. **A verdict and a remedy, in words** — "id is bundle-provided; the profile patch must not
   re-declare it. Delete the `insert` block at profile-patch lines 18–20." Naming the file and
   the line range is the difference between a 30-second fix and a debugging session.
4. **A discriminator between the two variants**, because they mean different things:
   *same id, same package* = almost certainly a copy-paste duplicate (the case here);
   *same id, different package* = shadowing / a real conflict, which deserves a stronger
   message and an explicit "one of these must be removed" instruction.

Cheap adjacent improvements: keep the original `codeframe`-style node with the duplicate
line highlighted rather than a bare `TypeError` chain; suggest the doctor/lint entry point
(and offer a composition lint that reports duplicate ids *before* the boot mutates or binds
anything); and never let the wrapper sentence ("failed to apply loader entry include") be the
most specific thing the user sees — the actionable line must survive the wrap.

---

## 5. Evidence index (what proves what)

| ID | Source | Point |
|---|---|---|
| EV-1 | `boot-crash-log.txt` L8–9 | `dsh: plugin tree failed to load: failed to apply loader entry include (cordis:include): duplicate loader entry id: workspace-files` |
| EV-2 | `boot-crash-log.txt` stack | thrown in `EntryGroup.update` (cordis-plugin-loader:91), called from `Include._apply` (dsh-app-boot:240), inside `boot` (:1534) — composition layer, no plugin frame |
| EV-3 | `profile-patch-excerpt.txt` L16–20 | the hand-added `- insert:` with `id: workspace-files` + `name: '@deepseek-ai/dsh-api-workspace-files'`, plus the "redundant; keep" comment |
| EV-4 | `web-app-patch-excerpt.txt` L6–8 (annotation: installed L110–111) | the bundle already ships the identical `workspace-files` row ⇒ the service was never missing |
| EV-5 | `web-app-patch-excerpt.txt` L12–17 | `session-controller` / `settings-controller` are likewise bundle-provided and were never manually inserted — the profile's own precedent for leaving bundle ids alone |
| EV-6 | `boot-crash-log.txt` trailing note | context: in-place upgrade from 0.1.2/0.1.3; the doc-read failure predates the edit and is a separate defect |

## 6. Scope / limitations of this report

- `fixture/` was treated as read-only and was not modified; no boot, migration, or
  installation was run, per the brief.
- The claim that the bundle row sits at installed-tree `L110–111` comes from the excerpt's
  own annotation (`web-app-patch-excerpt.txt` L4). The installed npm tree is outside this
  task's readable scope, so that line number is reported, not independently verified; the
  *existence* of the bundle row is independently attested by the excerpt's quoted YAML
  (EV-4), which is all the collision argument needs.
- The crash log is a trimmed excerpt (paths elided to `…dsh/lib/…`); the argument depends on
  the function/line identities and message text, which are present verbatim.
- The cause of the original 文件资源服务不可用 is **not** established here and is explicitly
  left open (§3.4) rather than guessed.
