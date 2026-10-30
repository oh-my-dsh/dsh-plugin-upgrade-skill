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

# S10 · Paste Renaming & Version-Chip Follow-Ups — Read-Only Analysis Report

**Plugin:** `@org/dsh-attach-input` (community Web plugin, **lib-only bundle, no build step**)
**Baseline shipped version:** v0.2.10 · **Target release:** v0.2.11 (follow-up A + B + hygiene)
**Mode:** Mode A · inspect (read-only) — per `skills/plugin-upgrade/SKILL.md`, no file was edited, no install/migration was executed.
**Evidence base:** `/app/fixture/` (read-only; re-hashed at the end of this run and verified byte-identical to `fixture-seal.pre.json`) + the local skill reference material under `skills/plugin-upgrade/`.

---

## 0. Executive summary (what changes, and what must not)

| # | Item | Decision |
|---|---|---|
| A | Pasted-file renaming | Rename **only** in the paste acquisition path, **before** the item enters the composer's reference set. Drag-and-drop and file/folder-picker items keep their real names. |
| A | "Names already taken" source | The **live composer attachment/occurrence set** (`input.state.getSnapshot().occurrences`) — *not* the plugin's own `records` Map, and *not* a plugin-side name cache. |
| A | Numbering | Monotonic per-session counter derived from the live occurrence set, not from a plugin counter, so it survives re-mounts and momentary empty snapshots. |
| B | Root cause | The chip rendered the **fetched remote tag** in the "already latest" branch. The GitHub tags list is **CDN-cached** (`x-cache: HIT`, `age: 178`, `max-age=60, s-maxage=300`), so minutes after the v0.2.11 push the response still lacked v0.2.10 **and** v0.2.11 and topped out at v0.2.9. |
| B | Display rule | Compare the **fetched latest tag** against the **locally-known running `PLUGIN_VERSION`**; in the "up to date" branch show the **running version** (never the fetched tag). Never assert "latest" from a stale cached read. |
| 5 | Release hygiene | Bump-before-tag ordering for the hand-inlined constant, `node --check` on `lib/*.js`, and a **client-side-only** delivery story — this plugin has no host-side update endpoint, so the chip can only *inform*; the actual update is an install-tree operation. |

> **Anti-patterns called out explicitly (the scored decisions):** treating a plugin-side records cache as the authority for "which names are taken", and treating a **cached remote value** as ground truth next to a **locally-known running version**.

---

## 1. Follow-up A — the renaming design

### 1.1 The exact naming scheme

| Acquisition path | Base name | Numbering | Resulting names |
|---|---|---|---|
| **Paste, image-like** | `paste_image` | 1st = none, 2nd = `(2)`, 3rd = `(3)`, … | `paste_image.png`, `paste_image(2).png`, `paste_image(3).png` |
| **Paste, non-image** | `paste_file` | same counter, same shape | `paste_file.pdf`, `paste_file(2).pdf` |
| **Drag-and-drop** | *(unchanged)* | — | `screenshot 2026-10-21 at 14.08.01.png` (real name) |
| **File/folder picker** | *(unchanged)* | — | `report.pdf` (real name) |

Numbering is **per target session/composer** and **per base name**. The extension is preserved (see `2) and the `(n)` suffix is inserted **before** the extension: `paste_image(2).png`, never `paste_image.png(2)`.

Why these exact literal shapes: the request in `user-threads.md` is literally `paste_image.png` / `paste_image(2).png` / `paste_image(3).png` and `paste_file.pdf`. The base word differs **by kind** (image vs. other) so a screenshot and a PDF pasted in the same breath do not share a base and the chip is self-describing. The parenthesis form `paste_image(2).png` (not `paste_image_2.png`) matches what the user asked for and is the desktop-chat convention; keep it byte-exact.

### 1.2 Where in the flow the rename must be applied

The current `add()` in `fixture/plugin-attachment-flow.js` is the single funnel for **all three** acquisition paths ("The paste path, the drop path, and the file/folder picker all funnel into add()", line 3). The rename must therefore be applied:

- **At the acquisition boundary, before the item enters `add()`** — i.e. in the paste handler that builds the clipboard `FileList`, **not** inside the `for (const item of items)` loop of `add()` and **not** inside `validateItems()`.
- **Reason:** the paste path is the *only* path that may be renamed. If the rename lives inside `add()` it also hits drag-and-drop and picker items, violating the explicit requirement that those keep their real names. Scoping at the boundary makes the behaviour change **opt-in per acquisition path** and leaves the other two paths structurally untouched.
- **Practical consequence:** the paste handler must *tag* the item as pasted (e.g. an explicit `source: 'paste'` marker on the item, or a third argument to `add()`) and pass that tag down. A marker on the item is the least invasive shape and survives the `item.file` / `item.path` access pattern already used in the code.
- **Ordering inside the paste handler:** rename **before** `add()` is called, so the renamed name is what gets inserted into the composer reference set, what is stored in `record.label`, and what is uploaded. Renaming *after* insertion would leave the composer occurrence and the dock chip disagreeing about the name.

**Paths that must stay untouched:**

1. **Drag-and-drop handler** — real names, no rename, no counter participation.
2. **File/folder picker handler** — real names, no rename, no counter participation.
3. **`validateItems()`** — its duplicate check is a *path* uniqueness check inside one selection batch. It keeps operating on the real/inserted paths and must not be repurposed into the global name registry (`1.4).
4. **The host/composer insertion API (`input.insertReference({...})`)** — the plugin does not own the composer's naming; it supplies the name.
5. **The `records` Map and its alive-subscription** — untouched by the rename (`1.4 explains why it must not become the naming authority).
6. **Upload body construction** — `files: record.items.map(item => ({ path: item.path, ... }))` keeps its shape; the *value* of `path` simply becomes the renamed path for pasted items (`2).

### 1.3 How the number is chosen

**Rule: the number is derived from the live composer state at the moment of the paste, not from a plugin-side counter.**

For one pasted item of kind *K* (image → `paste_image`, other → `paste_file`) with extension *E*:

1. Read the **current live occurrence set**: `const snap = input.state.getSnapshot()`.
2. Collect the names already present in that snapshot — both occurrences owned by this plugin (`o.source === SOURCE`) **and any other occurrence/file name the composer already shows** (so the plugin never collides with a name the user or another plugin put there). The composer occurrence entries carry a name/label field; the fixture shows it as `occurrence.label` (`plugin-attachment-flow.js:44`).
3. If `paste_image` (the bare base, no suffix) is **not** in that set → use `paste_image`. This yields `paste_image.png` for the first paste.
4. Otherwise → find the **smallest integer n ≥ 2** such that `paste_image(n)` is not in the set → use it. Smallest-free-number (rather than "count + 1") is deliberate: it fills gaps left by removed attachments and can never collide.
5. If the pasted batch contains **multiple** items in one event, apply the rule **sequentially within the batch**, adding each chosen name to a working set before choosing the next — so one paste of three screenshots yields `paste_image.png`, `paste_image(2).png`, `paste_image(3).png` in one shot. This is done in the paste handler, in order, *before* `add()`, so it does not depend on the composer having committed the earlier items yet.
6. Extension *E* is appended last (`2).

**Why "smallest free number" and not "how many pastes so far":** the plugin's own memory of how many pastes it has seen is exactly the state the alive-subscription can lose (`1.4). A count derived from the *composer* is the only number that cannot disagree with what the user sees, and it makes the numbering **stable and reproducible** — the same composer state always yields the same name.

**Cross-session scope:** the counter is per composer/session. Two different sessions may each start at `paste_image.png`; that is correct (the names are scoped to a conversation, not to the machine).

### 1.4 The authoritative "names already taken" source

**Authoritative source: the live composer state** — `input.state.getSnapshot()` → the occurrence/attachment set the composer is actually rendering — read at the moment the paste is handled, plus a locally-maintained working set for the items of the batch currently being processed.

**Why the plugin-side `records` cache is the wrong source.** `records` is a module-level `Map<ref, record>` in `fixture/plugin-attachment-flow.js`, and each record installs a subscription that **retires the entry whenever a snapshot momentarily shows no occurrences**:

~~~js
const alive = current.occurrences.some(o => o.source === SOURCE && o.ref === ref);
if (alive || record.inflight !== undefined) return;
unsubscribe();
records.delete(ref);        // ← fires on ANY momentary empty snapshot
~~~

`records` is **lossy by construction**:

- It only contains occurrences **owned by this plugin** (`o.source === SOURCE`). A file added by another plugin, or a name the composer itself puts in the set, is invisible to it.
- It **shrinks on any transient empty snapshot** — a re-render, a session switch, a composer reset, an async snapshot update that lands mid-flight — so a name that *is* still visible in the composer can be **missing from `records`** at exactly the moment the plugin picks a new name. Using `records` as the registry then produces a **collision**: the plugin picks `paste_image.png` for a second screenshot while the first `paste_image.png` is still on screen.
- The subscription is the very mechanism that keeps `records` in sync with the composer, so `records` is always a *lagging mirror* of the composer, never a source of truth about it.

**Consequence:** `records` may still be used for **rendering** (the dock chip reads `record?.label ?? occurrence.label`, `plugin-attachment-flow.js:44`), but **not** for deciding whether a name is free. The authoritative set is the composer's own occurrence list; the plugin-side Map is a *view*, not the *ledger*.

**A second, independent reason not to keep a plugin-side name cache:** the authoritative set is the one the user sees and the one that will be uploaded. A plugin-side name cache would be a *third* state that can drift from both, and would need its own invalidation logic — i.e. the same class of bug as `records`.

---

## 2. The extension rule, and what the dock chip and the upload path each show

*(Guidance for completeness; not part of the scored set.)*

**Extension rule — original name first, MIME fallback second:**

1. **Primary:** take the extension from the **original** clipboard file name, e.g. `image.png` → `.png`, `document.pdf` → `.pdf`. Normalise to lowercase; strip any path component (take `basename` first — a clipboard name should be bare, but never trust it).
2. **Fallback (only when the original name yields no extension):** derive it from the file's **MIME type** via a small static map — `image/png → .png`, `image/jpeg → .jpg`, `image/gif → .gif`, `image/webp → .webp`, `application/pdf → .pdf`, `text/plain → .txt`, `text/csv → .csv`, `application/zip → .zip`, `text/markdown → .md`, `application/json → .json`.
3. **Last resort (neither available):** `.bin`. Never emit a trailing dot and never emit an extension-less name for a pasted file — a nameless chip is indistinguishable from a bug.
4. The extension is **appended to the renamed base**, so the final name is always `<base><(n)><ext>`: `paste_image.png`, `paste_image(2).png`, `paste_file.pdf`.
5. **"Is it an image?"** is decided by the **MIME type first** (`file.type` starts with `image/`), falling back to the **original name's extension** (`.png/.jpg/.jpeg/.gif/.webp/.bmp/.svg`). Rationale: the browser's clipboard file name `image.png` is not a reliable classifier (a paste may be misnamed by the OS/app), whereas `file.type` is what the browser actually parsed. A `application/pdf`-typed paste arriving as `image.png` is therefore `paste_file.pdf`.

**What the dock chip shows:** the chip must show the **renamed** name for pasted items — the *same* string that is uploaded. `record.label` is set to the renamed path at insert time (it is currently `const label = item.path;` at `plugin-attachment-flow.js:24`), so the existing render `record?.label ?? occurrence.label` (`plugin-attachment-flow.js:44`) displays the renamed name with **no change to the render code**, provided the rename happens before the record is created. The chip must **not** show the original clipboard name (`image.png`), nor a synthetic id.

**What the uploaded path shows / carries:** the upload body stays `files: record.items.map(item => ({ path: item.path, ... }))` — the **renamed** `item.path` is what the host receives and what the model sees. The dock chip and the uploaded path must therefore agree **by construction**: the chip shows `record.label`, the upload sends `item.path`, so the rename must write the new name into **one** place that feeds both. The cleanest shape is to rewrite `item.path` (and the `File` object's `name` where the API allows) **once**, at the paste boundary, so `label` and `item.path` are the same string by default. Any divergence between chip text and uploaded name is a bug that regression test A‑15 (`4.1) must catch.

---

## 3. Follow-up B — the version chip lied: root cause and the correct display rule

### 3.1 Root cause (two independent defects, both required to produce the observed text)

**Defect 1 — the chip prints the *fetched remote tag* in the "you are up to date" branch.**

~~~js
const tag = await latestFromTags();
if (!tag) { renderOfflineChip(); return; }
if (semverCmp(tag, PLUGIN_VERSION) <= 0) { renderCurrentChip(tag); return; }
renderUpdateChip(tag);
~~~

~~~js
function renderCurrentChip(tag) {
  lbl.textContent = '✓ attach-input already the latest version ' + tag;   // ← shows the FETCHED tag
}
~~~

The comparison is *correct* (fetched tag vs. running `PLUGIN_VERSION = '0.2.10'`), but the **displayed value is the remote tag**, not the running version. Whenever the fetched tag is *older* than the running version — which happens whenever the remote read is stale, partial, or lagging — the chip asserts **"already the latest version v0.2.9"** while the user is running v0.2.10. The chip is literally printing a value it has just proved to be older than what is running. The user (rho_9) was on v0.2.10 and the chip said v0.2.9: the chip told the truth about the fetch and lied about the conclusion.

**Defect 2 — the remote read is served from a CDN cache, so "latest" is not a fact, it is a possibly-stale opinion.**

`fixture/tags-api-response.txt` (captured ~90 s after pushing `v0.2.11`) shows the mechanism:

~~~text
cache-control: private, max-age=60, s-maxage=300
x-cache: HIT
age: 178
…
"v0.2.9"
"v0.2.8"
"v0.2.7"
# (v0.2.10 and v0.2.11 absent — the cached page predates both pushes)

$ git ls-remote --tags origin | tail -3
…  refs/tags/v0.2.10
…  refs/tags/v0.2.11
~~~

The tag list is served by a shared cache with a 60 s browser / 300 s shared TTL, and the captured page was a **HIT** with `age: 178`. Two consequences:

- The response **lagged both** v0.2.10 and v0.2.11 — the missing v0.2.10 alone proves the page is not merely "one release behind", it is behind *more than one* release.
- The cached page is **inconsistent with the remote**: `git ls-remote` proves both tags exist. So the chip's input was stale, not the repository.

Together: **the chip trusted a cached remote read as ground truth about "what is the latest release", and then printed that cached value in a sentence asserting the user is up to date.** The user's actual state (v0.2.10) was known locally and was never printed, so the chip had no way to contradict itself.

**The follow-on user-visible failure:** the chip also **failed to inform**. The real question was "is there something newer than what I am running?" — and because the cached page topped out at v0.2.9 (≤ the running v0.2.10), the comparison `semverCmp(tag, PLUGIN_VERSION) <= 0` took the "already latest" branch and **never mentioned v0.2.11 at all**. Nobody was told a new release existed. That is why "a while later it changed its mind" (the cache expired, the fetch returned v0.2.11, the chip switched to the update branch).

### 3.2 The display rule the chip should follow instead

**Rule: the "up to date" chip states the *running* version; the "update available" chip states the *remote* version; the two are always compared to each other, and "latest" is never asserted from a read that may be stale.**

1. **Two values, one comparison.** Compare `latestTag` (remote) against `PLUGIN_VERSION` (the running, hand-inlined version) with `semverCmp`. Never compare the remote against a cached copy of itself, and never treat a cached remote value as ground truth next to the locally-known running version.
2. **Which one is shown:**
   - `semverCmp(latestTag, PLUGIN_VERSION) > 0` → **update available**: show the **remote** tag (`v0.2.11`) as the version on offer, and make the action explicit. Never show the running version here — the user needs to know what they would get.
   - `semverCmp(latestTag, PLUGIN_VERSION) <= 0` → **up to date**: show the **running** version (`v0.2.10`), *not* the fetched tag. The sentence becomes "✓ attach-input v0.2.10 is up to date" — a statement about the machine, which the plugin knows for certain, instead of a claim about the registry, which it does not.
   - The old text "already the latest version v0.2.9" is the bug's fingerprint: it concatenated a remote value into a "you are current" claim. The fixed text must not be able to display a version *other than the running one* in the up-to-date branch.
3. **Never render a version the running code does not have.** A chip printing a version the user is not running is misleading by construction — the same class of defect as the "version constant burned in at build time" row in the skill's troubleshooting table (a released bundle comparing a *stale local constant* against the newest remote tag and always claiming an update is available). Here it is inverted but identical in kind.
4. **Treat a stale / partial read as "unknown", not as "up to date".** The fetch must be able to distinguish "the registry's newest stable tag is X" from "the cached registry page I was handed currently lists up to X". Minimum bar — require **corroboration** before making a positive "you are current" claim, e.g.:
   - if the fetched list does **not** contain the running version `v0.2.10` (as in the captured response, which lacked both v0.2.10 and v0.2.11), the read is **demonstrably stale** → fall back to the offline/unknown state instead of claiming "up to date";
   - or refresh past the shared cache (cache-busting query parameter, or a request whose response is not CDN-cached) before making the "latest" claim.
   Either way, the failure mode must be **"I could not determine whether a newer version exists"**, never **"you are on the latest version X"** where X is a version the user is not running.
5. **Degrade quietly but honestly.** If the fetch fails, times out, or returns an empty/unrecognised list, render the offline/unknown chip. The existing `if (!tag) renderOfflineChip()` branch is correct and stays; the bug is that a *stale but well-formed* list was treated as authoritative.
6. **Auto-dismiss timing is a separate, lesser problem** (the green chip auto-dismisses after 4 s — `plugin-version-chip.js:26`). A user who hard-refreshes may never read a 4-second toast; consider keeping an update-available chip visible, or re-checking on a longer interval, so "v0.2.11 exists" is not lost. Not required to fix Follow-up B, but it is the reason "nothing told them v0.2.11 existed" was so easy to miss.

---

## 4. Regression tests that would have caught both follow-ups before release

The plugin is lib-only with no build step, so "tests" here means a small, dependency-free unit layer over the pure functions (`node --test` or an equivalent zero-dep runner) plus a manual smoke script. Both suites run **without a host** by injecting a fake `input.state` / fake `fetch`.

### 4.1 Follow-up A — renaming tests

| ID | Test | Asserts |
|---|---|---|
| A‑1 | paste one image (`image.png`, `image/png`) | name === `paste_image.png`; base is **not** `image.png` |
| A‑2 | paste three images in a row (three separate paste events) | `paste_image.png`, `paste_image(2).png`, `paste_image(3).png` — exact strings, in order |
| A‑3 | paste three images in **one** batch/event | same three names, allocated **sequentially inside the batch** (no duplicate) |
| A‑4 | paste an image then a PDF | `paste_image.png` and `paste_file.pdf` — different bases, independent counters |
| A‑5 | paste a PDF twice | `paste_file.pdf`, `paste_file(2).pdf` |
| A‑6 | **drag-and-drop** a file named `photo.png` | name === `photo.png` — **unchanged**, no `paste_` prefix, counter untouched |
| A‑7 | **file/folder picker** a file named `quarterly report.pdf` | name unchanged, spaces preserved |
| A‑8 | paste image → **delete the first attachment** → paste image again | the new name reuses the freed slot (smallest-free-number): `paste_image.png` again, **not** `paste_image(2).png` |
| A‑9 | paste image, then a **different plugin's** occurrence already named `paste_image.png` is present | the plugin picks `paste_image(2).png` — proof the authority is the **composer set**, not the plugin's `records` |
| A‑10 | **the alive-subscription fires** (a snapshot momentarily shows no occurrences) → then paste an image | the new paste does **not** reuse the still-visible `paste_image.png`; the number comes from the composer set |
| A‑11 | two different sessions | each session numbers independently (`paste_image.png` in both) |
| A‑12 | extension fallback: paste a file with **no** extension but `type: 'application/pdf'` | name === `paste_file.pdf` |
| A‑13 | extension fallback: paste a file with **no** extension and **no** type | name === `paste_file.bin` |
| A‑14 | misnamed paste: `file.type === 'application/pdf'`, name `image.png` | classified as **file** → `paste_file.pdf` (MIME wins over the misleading clipboard name) |
| A‑15 | chip/upload agreement | the string rendered in the dock chip === the `path` sent in the upload body, for a pasted and a dropped file |
| A‑16 | **scoping regression guard** | a **dropped** file that happens to be named `image.png` is **not** renamed; failure here means the rename leaked into the shared `add()` funnel |

A‑9 and A‑10 are the pair that encode the *scored* decision (authoritative conflict source): they must fail against the current `records`-based implementation.

### 4.2 Follow-up B — version-chip tests

| ID | Test | Asserts |
|---|---|---|
| B‑1 | **the captured stale response** (the exact body in `tags-api-response.txt`: `v0.2.9/v0.2.8/v0.2.7`, `x-cache: HIT`, `age: 178`) with running version `0.2.10` | the chip does **not** render "already the latest version v0.2.9". It renders the **running** `v0.2.10` at most — or the unknown/offline state. **Never** any version string other than the running one in the up-to-date branch |
| B‑2 | fresh response listing `v0.2.11` with running `0.2.10` | update chip shows `v0.2.11` (the remote version), never `v0.2.10` |
| B‑3 | response listing exactly `v0.2.10` with running `0.2.10` | up-to-date chip shows `v0.2.10` |
| B‑4 | response listing a version **older** than the running one (`v0.2.9` vs running `0.2.10`) | the chip must not claim a remote version it has just proved is older; it shows the running version or the unknown state, and must **not** print `v0.2.9` |
| B‑5 | fetch throws / times out / returns `[]` | offline/unknown chip; no version claim at all |
| B‑6 | **stale-detection test**: a response that does **not** contain the running version (the captured one lacks v0.2.10) | treated as a **stale read**, not as "up to date" |
| B‑7 | prerelease tags in the list (`v0.2.11-rc.1`) | filtered out by the existing stable-tag regex `/^v\d+\.\d+\.\d+$/`; only stable tags count |
| B‑8 | **release-hygiene test**: the committed `lib/client.js` `PLUGIN_VERSION` === `package.json` `version` | asserted by the same check that greps the artifact before tagging (`5.1) — catches the "bumped package.json but shipped a bundle with the old constant" inversion of this bug |

B‑1 is the direct regression test for the reported symptom and should use the **captured response body** from the fixture so the test cannot drift from the real-world evidence.

### 4.3 One manual smoke script (host-dependent, not unit)

Paste three screenshots → three chips read `paste_image.png`, `paste_image(2).png`, `paste_image(3).png`; drop a file → its real name; then hard-refresh while the stale cached tag list is still in play → the chip shows the **running** version (or "unknown"), never an older tag. Per the skill's plane rule, a change in `lib/client.js` takes effect on a **browser hard refresh** (client half) while `lib/index.js` needs a **host restart**; and since DSH 0.1.7-alpha.2 (`DSH-0.1.7-A2-04`) client bundles are **cached at host boot**, a client-bundle edit in the install tree needs a **host restart** before the page sees it — verify the served bytes rather than trusting a refresh.

---

## 5. Lib-only release hygiene this touches

This plugin has **no build step** (`lib/client.js` and `lib/index.js` are hand-maintained artifacts) and **no host-side update endpoint** — the chip is the only "update" surface, and it can only *inform*, never *perform* the update. That shapes the whole release story.

### 5.1 Hand-inlined version constants

- `PLUGIN_VERSION = '0.2.10'` is a **hand-inlined literal** in `lib/client.js` (`fixture/plugin-version-chip.js:5`), with the comment "the running version is hand-inlined here and must be kept in sync with package.json at every release".
- **Ordering rule (bump → commit → tag):** because the constant is burned in by hand, it *is* the published artifact's version. The release order must be: **bump `package.json` version → update the inlined `PLUGIN_VERSION` in `lib/client.js` (and the host half `lib/index.js` if it carries one) → verify the artifact → commit → tag → push.** The skill's troubleshooting table records the inverse failure mode (constant burned in at build time, `package.json` bumped afterwards → the released bundle compares a stale local constant against the newest remote tag and always claims an update is available). Here it is inverted but identical in kind.
- **Add a mechanical guard**, because with no build step nothing else catches the drift: assert `PLUGIN_VERSION` in `lib/client.js` === `package.json`.version, run in CI **and** as a pre-tag step. Same assertion as test B‑8.
- **Consider removing the duplication** for the future: since the plugin is lib-only, the version could be read from a small generated `lib/version.js` written by a release script (still no bundler needed), or exposed by the **host half** (`lib/index.js`) to the client through the boot manifest so there is exactly one source of truth. Not required to fix Follow-up B, but it removes the class of bug entirely.
- Keep the **install/update prompt's tag routing** in sync with the release — the same hand-maintained-artifact discipline applies to any prompt text naming a tag or version.

### 5.2 Bundle syntax check (there is no build to catch a typo)

With no build step there is no compile-time safety net, so the release gate is a **syntax + content check on the artifacts themselves**:

- `node --check lib/index.js && node --check lib/client.js` — the skill's own precedent for a lib-only plugin of this family (paste-input in the batch-migration example) is exactly this command pair, because such plugins have no build/typecheck/test scripts.
- Then a **content check** on the artifact: grep `lib/client.js` for the expected `PLUGIN_VERSION` literal and confirm it equals the intended release version; grep for the expected update-prompt text.
- Also assert the **module format** contract: client halves register through `window.__DSH_BOOT__ / window.__ModuleLoader__.load({ id, factory })` with `require("react")` **inside** the factory — never bare ESM at top level. A single raw-ESM token breaks the **whole** classic-script bundle combo at compile time and every plugin stops registering (skill troubleshooting table, "Failed to load plugins" row). `node --check` does not catch this, so the check must additionally assert the absence of top-level `import`/`export` in the client artifact.
- `node --check lib/index.js` covers the host half; per the plane rule the host half additionally needs a **host restart** to take effect, the client half a **hard refresh** (plus, from 0.1.7-alpha.2 onward, a **host restart** for an install-tree client edit to be re-served — `DSH-0.1.7-A2-04`).

### 5.3 How users actually receive the update (no host-side update endpoint)

- The plugin is a **client-side Web plugin with no host-side update service**. The chip is a **notification surface only**: it can say "v0.2.11 exists" and point at the release, but it cannot perform the upgrade. The chip copy and the chip's action must not imply a one-click update.
- **The real update channel is the install tree.** A user updates by **re-installing/updating the package in their profile** (Plugins page / `dsh plugin` / a pnpm install of `@org/dsh-attach-input@<version>` in the profile), then **restarting the host** (client bundles are cached at host boot from 0.1.7-alpha.2) and hard-refreshing the page. The chip should say what to do and where to get it, not just announce a version.
- **The chip must not become a promise the channel cannot keep.** It must not say "already the latest version X" on the strength of a cached read (`3.2); if it cannot establish the remote state, it should say so.
- **Channel-lag caveat for the release notes:** the tag list and any published package can lag the GitHub push — the captured response is the direct evidence for the *tag-list* leg, and the skill records the analogous npm-publish lag as its own card (`DSH-0.1.6-A2-04`: npm publish lags the GitHub release; pinned upgrades hit an E404 window). So even with the chip fixed, a user can be told "v0.2.11 available" minutes before the package is installable. Say so in the chip / release notes ("available shortly") rather than letting users discover an E404.
- **Mirror/tag integrity:** verify that **every** remote the release notes reference (GitHub tag, npm dist-tag) actually exists on that remote before publishing — "the tag exists on one mirror but not another" is what makes a chip point at a dead version.
- **Version routing** in the install prompt must point at the exact version, never at a moving `latest` dist-tag.

### 5.4 Release checklist for v0.2.11 (derived)

1. Bump `package.json` → `0.2.11`; update the inlined `PLUGIN_VERSION` in `lib/client.js` (and any host-half constant) to `0.2.11`.
2. Assert `PLUGIN_VERSION === package.json.version` (mechanical check, CI + pre-tag).
3. `node --check lib/index.js && node --check lib/client.js`; assert no top-level ESM in the client artifact; grep the artifact for the new version constant and the new chip strings.
4. Run the `4 unit suites (renaming + chip) — they need no host.
5. Commit the **artifacts** (not just source) together with the version bump, then tag, then push — and verify the remote tag points at the pushed SHA on **every** mirror, and that the published package version resolves (`npm view @org/dsh-attach-input@0.2.11 version`) **before** telling users to install it.
6. Publish the package; note in the release notes the propagation delay of the tag list / registry.
7. Validate on a real host: restart the host (client bundles are cached at host boot), hard-refresh, paste three screenshots (expect `paste_image.png`, `paste_image(2).png`, `paste_image(3).png`), drop a file (expect the real name), and confirm the chip shows `v0.2.11` as available and, once updated, shows the **running** version `v0.2.11` in the up-to-date state.

---

## 6. Read-only compliance & open points

- **Nothing was modified.** The fixture was re-hashed at the end of this run and matches `fixture-seal.pre.json` byte-for-byte (`plugin-attachment-flow.js`, `plugin-version-chip.js`, `tags-api-response.txt`, `user-threads.md`, `README.md`). No migration, install, publish, or network call was performed. The only skill command executed was the read-only `plan-migration.mjs`, run with the fixture as the scan root; it reported one `#2 events` hit (`plugin-attachment-flow.js:31` — the `subscribe()` call) and no card-set corridor for the queried tags, i.e. it is a heuristic, and it neither wrote to nor executed the fixture.
- **Unconfirmed / to verify at implementation time (not derivable from the fixture):**
  - the exact **field name** the composer exposes for an occurrence's name/label (the fixture shows `occurrence.label` at `plugin-attachment-flow.js:44`, but the authoritative set must be read from the live snapshot's occurrence list, whose full shape is not in the fixture);
  - the exact **MIME→extension** table and whether the composer accepts a renamed `File`; the plugin-side rename must be confirmed against the host's file-handling contract before shipping;
  - whether the **host half** (`lib/index.js`) also participates in the upload path, i.e. whether the renamed path must also be applied host-side;
  - the **public/private** nature of the tags endpoint and whether a cache-busting request is acceptable — the fixture proves the *observed* cached response, not the API's contract.
- **Skill references consulted** (key points only): `SKILL.md` (Mode A inspect discipline; reporting structure), `references/README.md` (corridor index; card schema), `references/pre-flight.md` (touchpoint classes; summary template), `references/migration-hygiene.md` `3 (client-half hard refresh vs host-half restart), `references/troubleshooting.md` (version-constant-burned-in row; raw-ESM bundle row; link/junction install row), `references/v0.1.7-alpha.2.md` `DSH-0.1.7-A2-04` (client bundles cached at host boot; a client-bundle edit needs a host restart), `references/v0.1.6-alpha.2.md` `DSH-0.1.6-A2-04` (npm publish lags the GitHub release; E404 window), `references/api-migration-0.1.2-alpha.2.md` `API-10` (command attachment parameters), `examples/06-real-world-batch-migration.md` (lib-only release discipline: `node --check lib/index.js && node --check lib/client.js`, verify the version constant in the artifact, bump → build → commit → tag → push).


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.