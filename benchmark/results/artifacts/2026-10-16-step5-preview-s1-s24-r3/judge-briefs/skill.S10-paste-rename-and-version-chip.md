# JUDGE BRIEF · skill.S10-paste-rename-and-version-chip

## Criteria (sealed rubric)
- [paste-names-and-scope] (20pt) Design paste_image and paste_file names, adding (2), (3), etc. before the extension until an unused name is found. Reserve names within the batch as well as across live attachments. Scope renaming to clipboard acquisition before duplicate validation/record creation; drop and picker keep their real names. An explicit paste-only option in a shared function is equivalent if other sources remain unchanged. Do not require the words increment or collision. The prompt explicitly makes item 2 (original extension/MIME fallback and chip/upload display details) unscored: do not require or deduct for those details.
- [live-conflict-state] (20pt) Identify the live composer snapshot occurrences as the authoritative occupied-name source and explain why the records subscription can delete cache entries on a transient empty snapshot while an attachment remains live. Account for the current paste batch/in-flight reservations; records may supplement but cannot replace live state. Do not demand a particular variable name or literal source-of-truth phrase.
- [stale-tag-display] (20pt) Use the captured cached tags response (x-cache HIT, age, older 0.2.9) and renderCurrentChip(tag) to explain the stale latest label. Compare fetched and running PLUGIN_VERSION semantically: show an update only when remote is newer, otherwise show the running version, never an older fetched tag. Equivalent pseudocode such as remote > local and remote <= local is sufficient.
- [regressions] (20pt) Propose tests showing repeated/same-batch image pastes retain distinct live attachments, a live occurrence still blocks a name with an empty records cache, and drop/picker names stay unchanged. Test an older/equal remote tag against the running build and a genuinely newer remote tag. Concrete expected names or assertions in code suffice; no mandatory coexist/assert wording. Do not grade the unscored extension/display guidance.
- [release-hygiene] (20pt) Synchronize the package version and hand-inlined PLUGIN_VERSION in the distributed lib artifact, run its syntax check (node --check or equivalent) plus behavioral regressions, and explain deployment/update of the served plugin artifact followed by browser reload/hard refresh. A Git tag or update chip alone does not install the artifact; there is no host-side update endpoint. Package metadata wording is equivalent to package.json. Do not require executing or publishing this static fixture.

## Caps (score ceilings; judge returns each with triggered true/false)
(none)

## Candidate report(s)
#### FILE: S10-paste-rename-and-version-chip/S10-report.md


# S10 · Paste renaming & version-chip follow-ups — read-only analysis

**Plugin**: @org/dsh-attach-input v0.2.10 · Web Client plugin, lib-only bundle (no build step)
**Evidence**: @fixture/ (5 files, read-only) · **Skill**: skills/plugin-upgrade/ (read-only)
**Mode**: read-only inspection + design + regression plan. No plugin code was changed, nothing was
installed, migrated, or published. All writes went to this directory only.

## Contents

1. [Follow-up A — unified renaming for pasted files](#1-follow-up-a--unified-renaming-for-pasted-files)
2. [Extension rule, dock chip and upload path (guidance, not scored)](#2-extension-rule-dock-chip-and-upload-path-guidance-not-scored)
3. [Follow-up B — why the chip showed v0.2.9](#3-follow-up-b--why-the-chip-showed-v029)
4. [Regression tests](#4-regression-tests)
5. [Lib-only release hygiene](#5-lib-only-release-hygiene)
6. [Limits](#6-limits)

---

## 0. Answers at a glance

**A — renaming.** Rename on the paste path only: pasted images become `paste_image.png`, `paste_image(2).png`, `paste_image(3).png`…; every other pasted file becomes `paste_file.<ext>` with the same numbering. Drag-and-drop and the file/folder picker keep their real names verbatim. The rename is applied inside `add()`, gated on an explicit `origin` argument whose default is "no rename", and it runs *before* `validateItems()` so that validation, the dock chip and the upload body all consume one final name. The number is the smallest free index (never `count + 1`), chosen against the set of names the composer itself currently reports — `input.state.getSnapshot().occurrences`, re-read per item. The plugin-side `records` Map must not be that source: its own subscription deletes a record on *any* momentarily empty snapshot, so the cache is simultaneously too empty (hands out a duplicate name — the user's exact complaint) and too full (burns numbers forever).

**B — version chip.** The tag list came back from GitHub's edge cache (`x-cache: HIT`, `age: 178`, `s-maxage=300`) on a page generated before both pushes, so `latestFromTags()` returned `v0.2.9`. The comparison `0.2.9 <= 0.2.10` was correct; what was wrong is that `renderCurrentChip(tag)` printed the *fetched* tag as if it were the running version. Fix: compare the fetched tag against the running `PLUGIN_VERSION`, and let the fetched tag only ever name an update that is strictly newer — the green "already the latest version" text must always name the running version. And the plugin had proof the list was stale: the running version's own tag `v0.2.10` was absent from it.

---

## 1. Follow-up A — unified renaming for pasted files

### 1.1 The naming scheme

| Acquisition path | Base name | Extension | Numbering |
|---|---|---|---|
| **paste**, image (`file.type` starts with `image/`) | `paste_image` | from the original name, MIME fallback | none, then `(2)`, `(3)`, … |
| **paste**, anything else | `paste_file` | same | same |
| **drag-and-drop** | original name, verbatim | untouched | none |
| **file/folder picker** | original path, verbatim (may contain directories) | untouched | none |

Consequences of the table:

- Pasting three screenshots that all arrive as `image.png` yields `paste_image.png`, `paste_image(2).png`, `paste_image(3).png`.
- Pasting `report.pdf` then `report.pdf` again yields `paste_file.pdf` and `paste_file(2).pdf`.
- The numbering is scoped per base+extension. Three images then two PDFs give `paste_image.png/(2)/(3)` and `paste_file.pdf/(2)` — the counter does not continue across kinds.
- **One name, computed once.** The value produced at rename time is the value used by the dock chip (`record.label`), by the composer occurrence label, and by the upload body (`item.path`). Nothing downstream may re-derive it.

### 1.2 Where the rename must be applied — and which paths stay untouched

**Where.** Inside `add()`, as the first thing it does, before `validateItems()`:

````js
const add = async (sessionId, items, opts = {}) => {
  const rename = opts.origin === 'paste';          // 'drop' | 'picker' | unknown => untouched
  const input = inputFor(sessionId);
  const finalItems = assignNames(input, items, rename);   // reads the live composer snapshot
  validateItems(finalItems);                        // now sees the FINAL names
  for (const item of finalItems) {
    const ref = id();
    const label = item.path;                        // already the final name
    const record = { ref, sessionId, items: [item], total: item.file.size, label, status: 'ready' };
    records.set(ref, record);
    const accepted = input.insertReference({ /* … */ }, { /* … */ });
    // …
  }
};
````

Why there, and not in the paste handler:

- `add()` is the single funnel all three acquisition paths already share, so it is the only place that can see both the origin and the composer input. It already owns `inputFor(sessionId)` and already refreshes `input.state.getSnapshot()` after each `insertReference` — exactly the read the taken-set needs.
- Renaming in the handler would force the handler to re-resolve the input and re-read the snapshot, duplicating the one piece of state access that `add()` already gets right, and would leave a window in which the composer has been handed the raw clipboard name.
- It must happen **before** `validateItems()`, because that function is the in-batch duplicate check. As shipped it compares `item.path`, so two pasted screenshots both named `image.png` throw `Duplicate attachment path: image.png` — the user's literal scenario fails *today*, it does not merely mislabel. After renaming, pasted items can never collide within a batch by construction, and the check keeps its original meaning for the drop/picker paths, where a genuinely duplicated path is a real error.
- It must happen **before** `records.set()` and before `insertReference()`, so the composer never renders the raw clipboard name for even one frame and the upload body never has to be renamed a second time.

**Which paths stay untouched.** Drag-and-drop and the file/folder picker. Two reasons beyond the feature request:

- The picker can produce paths containing directory separators (`sub/dir/file.txt`). The paste path produces a bare name, which is the only reason it is safe to rewrite at all.
- A real file name is information the user chose. Renaming it would be data loss with no upside.

**Fail-safe default.** The gate is `opts.origin === 'paste'`, not `opts.origin !== 'drop'`. A new acquisition path that forgets to pass an origin therefore keeps real names instead of silently starting to rename. Pass the origin explicitly from all three call sites: the paste handler passes `'paste'`, the drop handler `'drop'`, the picker `'picker'`.

**Build a normalized item, do not mutate.** `File.name` is read-only, and the upload body reads `item.path` while some code may still read `item.file.name`. Produce one normalized item so the two cannot diverge:

````js
{ ...item, path: finalName, file: new File([item.file], finalName, { type: item.file.type }) }
````

### 1.3 How the number is chosen

- Start at 1 with no suffix, then take the **smallest free `n >= 2`** such that `paste_image(n).png` is not taken.
- Do **not** use `count + 1`. If the user deletes the `(2)` chip, the next paste must reuse `(2)`, not jump to `(4)`. `count + 1` also silently produces duplicates the moment any name is taken by something the counter does not know about.
- Compare candidates **case-insensitively** (Windows paths are case-insensitive): `paste_image.PNG` and `paste_image.png` are the same name.
- Grow the taken set as each item in the batch is assigned, so one paste of five images is `(1)…(5)` with no intra-batch collision — this is what replaces the old "throw on duplicate" behaviour for the paste path.
- Re-read the taken set from the composer on every `add()` call, so a later paste session continues where an earlier one left off, and a fresh page that starts with an empty composer starts again at `(1)`.
- Choose the number **at insert time, never at render time**. The chip label is the assigned name; re-rendering must not be able to renumber, because a re-render-time rename would desynchronise the chip from the upload body.

````js
function nextName(base, ext, taken) {
  let candidate = base + ext;                        // paste_image.png
  for (let n = 2; taken.has(candidate.toLowerCase()); n += 1) {
    candidate = base + '(' + n + ')' + ext;          // paste_image(2).png
  }
  return candidate;
}
````

### 1.4 The authoritative "names already taken" source

The authoritative source is **the composer's own live state for the session being added to**:

````js
const taken = new Set(
  input.state.getSnapshot().occurrences
    .map(o => String(o.label ?? o.path ?? '').toLowerCase())
    .filter(Boolean),
);
````

re-read per item inside the loop (the fixture already refreshes `snapshot` after each `insertReference`), and unioned with the names already assigned earlier in the same `add()` call.

Why the composer snapshot is the right authority:

- **It owns the name space.** `insertReference` is what makes a name exist, and the dock renders from the same snapshot. "Taken" has to mean "the composer will display this name", and only the composer can answer that.
- **It is self-healing.** A removed occurrence leaves the snapshot immediately, so a number is released the instant the user deletes a chip. No manual bookkeeping, no reconciliation job.
- **It is the source the plugin already trusts.** The fixture's alive-subscription already reads `current.occurrences` to decide liveness. Using the same read for naming gives one notion of truth instead of two that can disagree.
- **Scope.** Filter to the session being added to. Whether to also filter by `o.source === SOURCE` is a policy choice: comparing across all sources in the session is the safer default, because the user-visible collision is the dock's label column, not the plugin's private key space. What must not happen is narrowing the set to the plugin's own `records`.
- **Optional secondary source.** If the plugin already exposes a host endpoint that lists the files written for a session, it can break ties for names that exist on disk but are not yet in the composer. It must never be the only source: it is scoped to one running host process and lags the client.

### 1.5 Why a plugin-side records cache alone is the wrong source

The fixture states the failure mode in its own comment — `records.delete(ref)` "fires on ANY momentary empty snapshot". Concretely:

1. **False negatives — the dangerous direction.** The subscription retires a record whenever one snapshot reports no matching occurrence: a transient during a re-render, a snapshot transition, or any window in which the composer momentarily reports an empty occurrence list. The attachment is still alive and still on screen; the record is gone. A records-based taken-set therefore believes `paste_image.png` is free and hands it out a second time — two chips named `paste_image.png`, i.e. the filed bug reintroduced by the fix.
2. **False positives — the annoying direction.** Any path that fails to delete (a rejected `insertReference` handled elsewhere, an early `throw` between `records.set` and the cleanup, a record deliberately kept after send) burns a name permanently. Numbering drifts upward forever: the user sees `paste_image(7).png` with two chips on screen.
3. **It is a cache of the very state it would be consulted about.** `records` is *derived* from composer occurrences. Consulting a derivative to answer a question the original can answer directly inverts the authority relationship. A cache may be a hint; it may not be the decision.
4. **It is narrower than the name space.** Per-page, per-tab, in-memory only: it does not survive a reload, does not see occurrences inserted by another tab or another plugin instance, and does not see names the host already has on disk.
5. **It has no invalidation story.** The subscription is the only reconciler, and it is the component that is broken. Fixing it is worthwhile on its own merits (a chip that vanishes mid-paste is a separate bug — require the empty snapshot to persist across two consecutive reads, or only retire on an occurrence that explicitly reports removal), but even a perfect subscription leaves the plugin maintaining a second copy of the composer's state. **Ask the composer.**

---

## 2. Extension rule, dock chip and upload path (guidance, not scored)

- **Extension from the original name**: the last suffix of the basename (`/\.([^.]+)$/`) — `image.png` → `.png`, `report.pdf` → `.pdf`. Multi-dot names take the last segment (`archive.tar.gz` → `.gz`); preserving the compound suffix is acceptable as long as the rule is consistent and never hardcoded per type.
- **MIME fallback**: when the clipboard file has no usable extension (empty name, or a name with no dot), derive the extension from `file.type` through a small explicit map — `image/png`→`.png`, `image/jpeg`→`.jpg`, `image/gif`→`.gif`, `image/webp`→`.webp`, `application/pdf`→`.pdf`, `text/plain`→`.txt`, `application/zip`→`.zip`. If neither the name nor the MIME type yields an extension, emit the bare base name (`paste_image`, `paste_file`) — never invent one.
- **The MIME type also picks the base**: `file.type` starting with `image/` → `paste_image`, everything else → `paste_file`. A clipboard file with neither name nor type defaults to `paste_file`.
- **Dock chip**: displays the final renamed label — `paste_image.png`, `paste_image(2).png` — and it is the same string as the upload path, by construction (`record.label === record.items[0].path`). Recommended extra: keep the original clipboard name as the chip's `title` tooltip so the user can still tell two screenshots apart; that is presentation only and must never feed back into naming.
- **Upload path**: the same renamed string in `files: record.items.map(item => ({ path: item.path, ... }))`. If the host writes the attachment file under that path, the renamed name is what lands on disk — which is the point of the feature.
- **Never** show the raw clipboard name as "the" name, and never send the raw name in the upload body. Two names for one attachment is how "the chip says X but the file is called Y" reports start.

---

## 3. Follow-up B — why the chip showed v0.2.9

### 3.1 Root cause chain

Two independent defects composed.

**(a) The remote view was stale — and the code had proof.** The captured response is `HTTP/2 200` with `cache-control: private, max-age=60, s-maxage=300`, `x-cache: HIT`, `age: 178`. The chip's `fetch` of `/repos/org/dsh-attach-input/tags?per_page=10` was served from GitHub's edge cache on a page generated **before both the v0.2.10 and v0.2.11 pushes**: the body lists only `v0.2.9`, `v0.2.8`, `v0.2.7`, while `git ls-remote --tags origin` confirms `refs/tags/v0.2.10` and `refs/tags/v0.2.11` exist. So `latestFromTags()` returned `v0.2.9`. `s-maxage=300` means up to ~5 minutes of staleness is *by design*, and `age: 178` shows the page was already ~3 minutes old at capture time. "A while later it changed its mind" is simply that cache expiring and a later fetch seeing v0.2.11 — the data was eventually correct; the interpretation never was.

And the plugin held direct evidence that the list was incomplete: **the running version's own tag `v0.2.10` was absent from it.** A list that does not contain the version you are running cannot be an enumeration of releases.

**(b) The chip rendered the fetched tag as if it were the running version.** `renderCurrentChip(tag)` writes `'✓ attach-input already the latest version ' + tag` — the argument is the *fetched* value. The green "already the latest version" claim was therefore made about an unverified, cache-served remote string, sitting directly next to a locally-known running version (`PLUGIN_VERSION = '0.2.10'`) that was never displayed at all. The comparison `semverCmp(tag, PLUGIN_VERSION) <= 0` was correct (`0.2.9 <= 0.2.10`); the conclusion drawn from it was not. "The remote list has nothing newer than me" was silently upgraded into "the newest thing in the world is v0.2.9, and that is what you are running" — a claim about two different subjects.

### 3.2 The display rule the chip should follow instead

Two values participate, and they are not interchangeable:

| Value | What it is | Status |
|---|---|---|
| `PLUGIN_VERSION` | the version this bundle is actually running | locally known, certain — the only value the chip may state as fact about the user's installation |
| `tag` | the highest stable tag in the fetched list | a *hint* about what may exist upstream — never a statement about the user's installation |

They are compared once — `semverCmp(tag, PLUGIN_VERSION)` — and then:

| Condition | Chip state | Which value is shown |
|---|---|---|
| `tag > PLUGIN_VERSION` | update available (actionable) | **`tag`** — it is genuinely newer; a stale cache can only *hide* a newer tag, never invent one |
| `tag <= PLUGIN_VERSION` | green "already the latest version" | **`PLUGIN_VERSION`** — always the running version, never `tag` |
| fetch failed, empty, or no stable tags | offline / unknown | neither; no "latest" claim at all |
| the fetched list does not contain the running version's own tag | inconclusive (stale list) | `PLUGIN_VERSION`, with no "latest" claim |

**The rule in one line: the "already the latest version" text always names the running version; the fetched tag is only ever allowed to name an update that is strictly newer.** Absence of a newer tag in a cached list is not evidence that nothing newer exists, so it can never justify an affirmative "latest" claim — and when the claim is made at all, the version printed must be the one the user is actually running.

In code terms the minimal fix is small: `renderCurrentChip()` stops taking an argument and prints `PLUGIN_VERSION`, and the "already latest" branch is not entered at all when the list is provably stale.

````js
async function startUpdateChip() {
  const tags = await fetchTags();                       // may be a stale edge-cache page
  if (!tags || tags.length === 0) { renderOfflineChip(); return; }
  if (!tags.some(t => semverCmp(t.name, PLUGIN_VERSION) === 0)) {
    renderInconclusiveChip(PLUGIN_VERSION); return;     // our own tag is missing => stale list
  }
  const tag = latestFromTags(tags);
  if (tag && semverCmp(tag, PLUGIN_VERSION) > 0) { renderUpdateChip(tag); return; }
  renderCurrentChip();                                  // prints PLUGIN_VERSION, never tag
}
````

### 3.3 Hardening, so this class of bug cannot recur

1. **Self-consistency gate.** If the running version's tag is not in the fetched list, the list is stale — use it for nothing. This one check would have turned rho_9's green "v0.2.9" into a neutral "v0.2.10 · update check inconclusive".
2. **One-directional trust.** A remote tag list may only ever *add* an update; it may never *remove* one or certify the current one. Corollary: never persist a "you are up to date" conclusion across reloads or timers — persist only "an update to vX was seen at T", and re-derive everything else from the running version.
3. **Ask a question the cached page can answer.** "Is anything newer than me out there?" is not what a cached, paginated `tags?per_page=10` page answers well. Where precision matters, probe a specific ref (`GET /repos/:owner/:repo/git/refs/tags/v<next>`), which is not served from the list cache, or use a git-protocol ref listing. At minimum send `cache: 'no-store'` plus a cache-busting query parameter so the request does not silently ride a shared edge page.
4. **Poll politely; treat failure as unknown.** Low-frequency re-check with backoff. The unauthenticated GitHub API is rate-limited (60/h) and a 403 must render "unknown", never "latest".
5. **Make the prerelease policy explicit.** The `/^v\d+\.\d+\.\d+$/` filter makes `v0.2.11-rc.1` invisible. That is a defensible choice, but it must be a documented one, and the chip must not imply "nothing newer exists" when the only newer tag was filtered out.
6. **Do not auto-dismiss a claim you cannot substantiate.** The green chip auto-dismisses after 4s. If it is the only update signal (see §5), keep the affirmative update chip persistent and let the "you are current" state be the dismissible one.

---

## 4. Regression tests that would have caught both follow-ups

Everything below is plain-Node runnable: this plugin has no toolchain, so the tests must not depend on one. A runnable sketch with all twelve cases is committed next to this report as
[appendix-regression-tests.node-test.mjs](appendix-regression-tests.node-test.mjs) — run it with `node --test appendix-regression-tests.node-test.mjs`. It reproduces the v0.2.10 logic as pure functions plus a stub composer, and case **B1** asserts that the v0.2.10 logic still produces "already the latest version v0.2.9" while the fixed logic does not, so the suite fails against the old code and passes against the new.

### 4.1 Follow-up A

| # | Test | Asserts | Catches |
|---|---|---|---|
| A1 | paste naming + numbering | three clipboard `image.png` → `paste_image.png`, `paste_image(2).png`, `paste_image(3).png`; and `record.label === record.items[0].path` for each | the filed bug; chip/upload divergence |
| A2 | extension + MIME fallback | `report.pdf`→`paste_file.pdf`, `a.zip`→`paste_file.zip`, empty name + `type: 'application/pdf'`→`paste_file.pdf` | hardcoded or dropped extensions |
| A3 | cross-batch collision against live state | paste once, then paste again → `paste_image(2).png`, `paste_image(3).png` | "numbering only knows the current batch" |
| A4 | **the records-cache trap, both directions** | (a) let the alive-subscription fire on one momentarily empty snapshot, then paste → still `paste_image(2).png`; (b) leak a stale record for a removed attachment, then paste → `paste_image.png`, not `(3)` | a records-based taken-set fails (a) or (b) — this is the test that pins the authority decision |
| A5 | smallest-free-index reuse | paste three, delete the `(2)` chip, paste again → `paste_image(2).png`, not `(4)` | `count + 1` numbering |
| A6 | scoping | drop `C:\shots\photo.png` + `C:\docs\notes.txt` and pick `notes.txt`: names verbatim, no `paste_` prefix, no numbering; a genuine in-batch duplicate on the drop path still throws; a dropped `photo.png` and a pasted image coexist without renumbering the dropped one | an over-broad rename |
| A7 | end-to-end through the real composer | paste two images, send, assert two distinct chips and two distinct paths in the upload payload; repeat after a page reload and assert no phantom `(2)` on an empty composer (and correct continuation on a non-empty one) | integration drift between chip, composer and upload |
| A8 | the original report, as a guard | a paste batch of identically named clipboard files no longer throws `Duplicate attachment path` | today it does throw — the user's scenario fails before it even mislabels |

### 4.2 Follow-up B

| # | Test | Asserts | Catches |
|---|---|---|---|
| B1 | **the filed bug, as a unit test** | stub the fetch to return the captured list (`v0.2.9 / v0.2.8 / v0.2.7`) with `PLUGIN_VERSION = '0.2.10'`; assert the chip text contains `v0.2.10` and does **not** contain `v0.2.9` | the filed bug |
| B2 | staleness self-consistency | the fetched list omits the running tag ⇒ the chip refuses to derive any "latest" claim from it | treating a cached page as an enumeration |
| B3 | no false negative | a fresh list containing `v0.2.11` still renders the update chip naming `v0.2.11` | over-correcting into "never say update" |
| B4 | failure modes | empty list, `res.ok === false` (403 rate limit) and a thrown network error each render "unknown" and never the word "latest" | offline/rate-limit being read as "current" |
| B5 | comparator | `semverCmp('v0.2.10','v0.2.9') > 0`, plus an explicit assertion that a lexicographic comparison would have inverted the verdict; pin the prerelease filter policy | a string-compare "latest" picker |
| B6 | cache-header awareness | a response carrying `x-cache: HIT` with `age` near `s-maxage` produces no affirmative "latest" claim | cache-blindness |
| B7 | release guard | read the shipped `lib/client.js` and assert the inlined `PLUGIN_VERSION` equals `package.json`'s `version` and the tag about to be pushed | a tag whose bundle contradicts itself (see §5) |

---

## 5. Lib-only release hygiene items this touches

1. **Hand-inlined version constants.** `PLUGIN_VERSION = '0.2.10'` is hand-maintained in `lib/client.js`; there is no build step to regenerate it from `package.json`. Every release must update both together, and something mechanical must verify it — for a lib-only plugin the equivalent of a build-time check is a script or test that greps the artifact and asserts the inlined constant equals `package.json`'s `version` and the tag being pushed, run before tagging. The skill's troubleshooting table records the mirror-image failure (a bundle constant older than the tag ⇒ the update badge claims an update forever); both are the same root cause — two copies of one version — and it is exactly what lets the chip lie in either direction. **One version, one place, verified mechanically.**
2. **Bundle syntax check.** With no `build`/`typecheck`/`test` scripts, the pre-tag check is `node --check lib/index.js && node --check lib/client.js` on the final artifact, plus a content check that the inlined version constant and any update-prompt text match the intended release. Because these are classic-script client bundles, also assert there is no bare top-level `import`/ESM token — one ESM token fails the whole combo at compile time and *every* client plugin stops registering — and that the bundle's registration id still matches `package.json`'s `name`.
3. **How users actually receive the update, given there is no host-side update endpoint.** This plugin exposes no host-half update route (contrast the real `dsh-paste-input`, whose host half serves `GET /dsh-paste-input/v1/latest`). The GitHub tag fetch behind the chip is therefore the plugin's *only* update signal, and it is advisory — it cannot install anything. Delivery is manual, and the instructions must be self-contained in the README and in the chip's update prompt: the exact source of record (git tag / registry) and the exact command. And because client bundles are read and cached **at host boot**, an install-tree edit is not picked up by a browser refresh — the user must **restart dsh and then hard-refresh**. A refresh-only instruction leaves the old bundle running while the chip talks about the new one, which is precisely the "the page says one thing, the process does another" confusion this task is about. For a link/junction install the repo edit is live but the host still serves cached bytes until restart, so the restart step is required either way.
4. **Version bump choice.** The renaming change is user-visible behaviour and changes what files are called on disk, so it is a minor bump — `0.3.0`, not a patch. Per the skill's Mode C step 6 the plugin's own SemVer is chosen separately from the DSH compatibility range; declare the DSH cohort in its own field and never derive the plugin version from the host version.
5. **Ship the regression tests.** A lib-only plugin has no pipeline that would run them, so they must be plain-Node (`node --test`) and be invoked from a `scripts/` entry or the release checklist rather than from a framework. A test that cannot run in the repo it ships in does not regress anything.
6. **Release order** (the skill's lib-only flow): update the version constant + prompt/README → run the artifact checks (`node --check` plus the constant/prompt verification) → run the regression tests → commit the final artifacts → tag → push all mirrors → verify each mirror's SHA points at the tag. Then verify on a real host: restart `dsh`, hard-refresh, and confirm both the renamed chips and the corrected chip text in the *served* bundle.

---

## 6. Limits

- Read-only throughout. The fixture is byte-identical to how I found it (SHA-256 prefixes: `plugin-attachment-flow.js 5ca0f59df19a0312`, `plugin-version-chip.js b560ae3ab5e268f3`, `README.md cc50e09bf81daa08`, `tags-api-response.txt 2afe48ffdb7fcbcc`, `user-threads.md f27063af372ca524`). Nothing was migrated, installed, or published; no path outside this cell directory was written.
- I did not read the task's `solution/` or `tests/` directories, nor the repository root, `benchmark/`, `.dsh/`, or `node_modules/`.
- The plugin's `package.json` / `dsh-plugin.json` are not in the evidence pack, so §5's constant-vs-manifest check is stated as a rule rather than verified against real files.
- The composer occurrence type's exact name field (`label` vs `path`) is taken from the fixture excerpt's dock line and should be confirmed against the composer contract before implementing.
- The appendix is a self-contained sketch with a stub composer (the fixture is an excerpt referencing `inputFor`, `h`, `records` and cannot be imported). Port the assertions onto the real module boundaries.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.