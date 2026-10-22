# JUDGE BRIEF · noskill.S10-paste-rename-and-version-chip

## Criteria (sealed rubric)
- [paste-names-and-scope] (20pt) Design paste_image and paste_file names, adding (2), (3), etc. before the extension until an unused name is found. Reserve names within the batch as well as across live attachments. Scope renaming to clipboard acquisition before duplicate validation/record creation; drop and picker keep their real names. An explicit paste-only option in a shared function is equivalent if other sources remain unchanged. Do not require the words increment or collision. The prompt explicitly makes item 2 (original extension/MIME fallback and chip/upload display details) unscored: do not require or deduct for those details.
- [live-conflict-state] (20pt) Identify the live composer snapshot occurrences as the authoritative occupied-name source and explain why the records subscription can delete cache entries on a transient empty snapshot while an attachment remains live. Account for the current paste batch/in-flight reservations; records may supplement but cannot replace live state. Do not demand a particular variable name or literal source-of-truth phrase.
- [stale-tag-display] (20pt) Use the captured cached tags response (x-cache HIT, age, older 0.2.9) and renderCurrentChip(tag) to explain the stale latest label. Compare fetched and running PLUGIN_VERSION semantically: show an update only when remote is newer, otherwise show the running version, never an older fetched tag. Equivalent pseudocode such as remote > local and remote <= local is sufficient.
- [regressions] (20pt) Propose tests showing repeated/same-batch image pastes retain distinct live attachments, a live occurrence still blocks a name with an empty records cache, and drop/picker names stay unchanged. Test an older/equal remote tag against the running build and a genuinely newer remote tag. Concrete expected names or assertions in code suffice; no mandatory coexist/assert wording. Do not grade the unscored extension/display guidance.
- [release-hygiene] (20pt) Synchronize the package version and hand-inlined PLUGIN_VERSION in the distributed lib artifact, run its syntax check (node --check or equivalent) plus behavioral regressions, and explain deployment/update of the served plugin artifact followed by browser reload/hard refresh. A Git tag or update chip alone does not install the artifact; there is no host-side update endpoint. Package metadata wording is equivalent to package.json. Do not require executing or publishing this static fixture.

## Caps (score ceilings; judge returns each with triggered true/false)
(none)

## Candidate report(s)
#### FILE: S10-paste-rename-and-version-chip/S10-paste-rename-and-version-chip.md

# S10 · Paste Renaming (Follow-up A) & Version-Chip Lie (Follow-up B)

Plugin: `@org/dsh-attach-input` v0.2.10 (community Web plugin, lib-only bundle, no build step,
no host-side update endpoint). Evidence: the read-only fixture in `fixture/`
(README: [fixture/README.md](fixture/README.md), attachment flow:
[fixture/plugin-attachment-flow.js](fixture/plugin-attachment-flow.js), version chip:
[fixture/plugin-version-chip.js](fixture/plugin-version-chip.js), threads:
[fixture/user-threads.md](fixture/user-threads.md), captured HTTP response:
[fixture/tags-api-response.txt](fixture/tags-api-response.txt)).

**Scored items: 1 (renaming design), 3 (chip root cause + display rule), 4 (regression tests),
5 (lib-only release hygiene). Item 2 (extension rule / what each surface displays) is included
as guidance and is not scored.**

---

## 0. TL;DR

- **A:** Rename at the **paste acquisition boundary only** — the clipboard→items adapter rewrites
  `item.path` (and the File's `name`) before the shared `add()` is called. Scheme:
  `paste_image.png`, `paste_image(2).png`, `paste_image(3).png`… for images;
  `paste_file.<ext>`, `paste_file(2).<ext>`… for everything else pasted. Drop and picker paths
  stay untouched. The `(n)` number is chosen against the **live host composer snapshot**
  (`input.state.getSnapshot().occurrences` for our `SOURCE`), never against the plugin's
  `records` Map — `records` is a derived cache whose alive-subscription **permanently deletes
  entries on any momentary empty snapshot**, so it under-reports taken names and numbering
  restarts into a real collision.
- **B:** The GitHub tags API response was **CDN-cached** (`cache-control: private, max-age=60,
  s-maxage=300`, `x-cache: HIT`, `age: 178`) and still listed only up to `v0.2.9`, so
  `latestFromTags()` returned `v0.2.9`; `semverCmp('v0.2.9','0.2.10') <= 0` took the
  "already latest" branch and `renderCurrentChip(tag)` printed **the fetched tag**. Two
  compounding defects: (1) a cacheable remote *absence* was treated as proof that no newer
  version exists; (2) the green chip displayed the network value instead of the locally-known
  running version. Correct rule: compare fetched-max-tag vs the inlined `PLUGIN_VERSION`, and
  **show `PLUGIN_VERSION`** in the green chip.

---

## 1. Follow-up A — the renaming design

### 1.1 Exact naming scheme

| Acquisition path | First item | Second | Third | … |
|---|---|---|---|---|
| paste, image (MIME `image/*`, else image extension) | `paste_image.png` | `paste_image(2).png` | `paste_image(3).png` | `paste_image(n).png`, n ≥ 2 |
| paste, anything else | `paste_file.pdf` | `paste_file(2).pdf` | `paste_file(3).pdf` | `paste_file(n).<ext>`, n ≥ 2 |
| drag-and-drop / file-folder picker | **real name, unchanged** | real name | real name | — |

Rules:

- Base is `paste_image` when the item is an image, else `paste_file`. The image/file decision
  is made from `file.type` (MIME) first, extension only as a fallback signal — **never** from the
  browser-given file name (a clipboard item can be named `image.png` while being a PDF, or named
  `clipboard.bin` while being a PNG).
- The duplicate suffix is the Windows/chat-app style `(n)` inserted **before** the extension;
  the first item in a fresh namespace carries **no** suffix (`paste_image.png`), numbering
  starts at 2 — exactly what the user asked for in
  [fixture/user-threads.md](fixture/user-threads.md) L5–L9.
- The extension is lowercased; the base is fixed and never derived from the original name.

### 1.2 Where the rename is applied — and which paths stay untouched

All three acquisition paths funnel into the shared `add()`
([fixture/plugin-attachment-flow.js](fixture/plugin-attachment-flow.js) L3, L17). Therefore:

- **Do not** put the rename inside `add()` unconditionally — that would rename drag-and-dropped
  and picked files too, which the user explicitly does not want
  ([fixture/user-threads.md](fixture/user-threads.md) L9–L10).
- **Apply it at the paste acquisition boundary**: the clipboard→items adapter that builds the
  `items` array from `ClipboardEvent.clipboardData.files` rewrites each item's `path` to the
  unified name **before** calling the shared `add()`. Because `add()` derives both surfaces from
  `item.path` — the chip label (`label = item.path`, L24) and the upload body
  (`path: item.path`, L45) — one change at the boundary covers both, and `add()`, the drop
  handler and the picker handler stay **byte-for-byte unchanged**. The behavior change is scoped
  to paste *by construction*, which is the safest possible scoping.
- Acceptable alternative (equivalent, slightly larger blast radius): thread an
  `origin: 'paste' | 'drop' | 'picker'` argument into `add()` and normalize inside the insert
  loop only for `'paste'`. Either way the discriminator must be **the acquisition path**, never
  the file name.
- Side effect that is desirable: the batch handed to `add()` is already duplicate-free, so
  `validateItems()`'s in-batch duplicate check (L11) stops firing for pastes (it still protects
  drop/picker batches, unchanged).

### 1.3 How the number is chosen

For each pasted item, in batch order:

```text
candidate = base + ext                     // e.g. paste_image.png
n = 2
while candidate ∈ taken:                   // taken = live snapshot labels ∪ names assigned in this batch
  candidate = base + '(' + n + ')' + ext   // paste_image(2).png, paste_image(3).png, …
  n += 1
assign candidate; add it to the batch set
```

- Deterministic and terminating (`taken` is finite); reproduces the requested `(2)`, `(3)`…
  sequence; the first item in an empty namespace keeps the bare `paste_image.png`.
- "Smallest free integer ≥ 2" (rather than max+1) is deliberate: it matches the scheme the user
  asked for and what chat apps do, and removing an attachment frees its slot for the next paste,
  which is the least surprising behavior.
- The `taken` set is refreshed from the host snapshot at the start of the batch and augmented
  with the names already assigned in the current batch, so intra-batch and cross-batch conflicts
  are handled identically.

### 1.4 The authoritative "names already taken" source

**Authoritative source: the host composer's live state —**
`input.state.getSnapshot().occurrences`, filtered to `o.source === SOURCE` (and the current
session) — **read fresh immediately before each rename decision** (and, if the rename is done
inside `add()`, refreshed after each successful `insertReference()`; the loop already re-reads
the snapshot there, L29). The snapshot exposes the label the dock renders
(`record?.label ?? occurrence.label`, L44), so the taken set is
`occurrences.filter(o => o.source === SOURCE).map(o => o.label)`.

**Why a plugin-side `records` cache alone is the wrong source:**

1. `records` is a *derived cache*, not the truth — it is whatever the plugin last believed. The
   fixture shows its alive-subscription retiring an entry on **any** momentary empty snapshot:
   `records.delete(ref)` fires whenever one intermediate `getSnapshot()` shows no matching
   occurrence ([fixture/plugin-attachment-flow.js](fixture/plugin-attachment-flow.js) L31–L38,
   deletion at L36). The composer legitimately produces such snapshots (re-render, streaming
   start/stop, state transitions, remount). When that happens the record is deleted
   **permanently** even though the host still holds the reference and the dock chip still shows
   the attachment (the chip falls back to `occurrence.label`, L44).
2. Consequence for naming: after such a retirement `records` *under-reports* the names in use,
   so numbering restarts and the next paste produces `paste_image.png` again — two chips and two
   upload paths with the same name. That is precisely the collision class follow-up A complains
   about, now across batches instead of within one.
3. `records` is module-level and shared across sessions, so it would additionally need session
   filtering to be even approximately right; the composer snapshot is already per-session.
4. The snapshot is the value that actually determines what the user sees and what the upload path
   can collide with. Reading it fresh at decision time means a transient state cannot permanently
   poison the decision; a wrong cache entry, by contrast, persists until the next `changed()`.

**Defense in depth (do both):**

- Fix the retirement logic itself: require the occurrence to be absent from **N consecutive
  snapshots** (or debounce / re-read on the next tick) before retiring, and reconcile from the
  snapshot instead of trusting the cache. This keeps `records` usable as a *render accelerator*.
- Keep `records` out of the conflict decision entirely — the snapshot is the source of truth.
- The client can only guard the composer. If the upload endpoint keys attachments by `path`, it
  must also de-duplicate server-side as a last resort (a client-side rename cannot be the only
  guard, and two browser tabs could race).

---

## 2. Extension rule and what each surface displays (guidance — not scored)

**Extension precedence** (first hit wins, result lowercased):

1. The original clipboard file name's extension, if sane: a final `.<1–8 alphanumeric>` segment
   that is not the entire name (`image.png` → `png`; `Screenshot 2026-10-16 at 12.00.00.png`
   → `png`; `image` → none).
2. Otherwise derive from `file.type`: `image/png` → `png`, `image/jpeg` → `jpg`,
   `image/svg+xml` → `svg`, `text/plain` → `txt`, `application/pdf` → `pdf` (subtype,
   with `+xml`/`x-` suffixes stripped and a small normalization table for the common cases).
3. Otherwise default: images → `png` (clipboard screenshots are overwhelmingly PNG), others →
   `bin`. Both defaults are rare and should be documented.

**What each surface displays** — both derive from the single renamed `item.path`, so they always
agree:

- **Dock chip:** the unified name (`record.label`, L24/L44) — `paste_image(2).png`.
- **Uploaded path:** the same unified name in the request body (`files: [{ path: item.path }]`,
  L45) — `paste_image(2).png`. The chip must be an accurate preview of what is uploaded.
- **Underlying File:** wrap it so `file.name` matches
  (`new File([f], 'paste_image(2).png', { type: f.type })`) so no downstream consumer (server
  logging, content-disposition, a future UI) can resurrect the browser's `image.png`.

---

## 3. Follow-up B — root cause and the display rule the chip should follow

### 3.1 What happened

The chip fetches `https://api.github.com/repos/org/dsh-attach-input/tags?per_page=10`
([fixture/plugin-version-chip.js](fixture/plugin-version-chip.js) L8) and takes the max stable
tag (L12–L13). The captured response
([fixture/tags-api-response.txt](fixture/tags-api-response.txt)) shows
`cache-control: private, max-age=60, s-maxage=300`, `x-cache: HIT`, `age: 178` — GitHub's CDN
served a page cached from *before both pushes*; the body listed only `v0.2.9`, `v0.2.8`,
`v0.2.7`, while `git ls-remote --tags origin` confirms `v0.2.10` and `v0.2.11` exist. So:

1. `latestFromTags()` returned `v0.2.9`.
2. With the hand-inlined `PLUGIN_VERSION = '0.2.10'` (L5),
   `semverCmp('v0.2.9', '0.2.10') <= 0` was **true** (L21).
3. `renderCurrentChip('v0.2.9')` ran and printed **the fetched tag**:
   `'✓ attach-input already the latest version ' + tag` (L27) → *"already the latest version
   v0.2.9"* — while the user ran 0.2.10 and v0.2.11 existed, invisible to them.

### 3.2 Root cause — two compounding defects

1. **A cached remote value was treated as ground truth for a negative.** The tags endpoint is
   CDN-cacheable (`s-maxage=300`, so the edge serves the pre-push page for up to 5 minutes —
   `age: 178` is still inside that window) and eventually consistent. A tag list can *prove* a
   newer version exists (if it lists one); it can **never** prove that none exists. The code did
   exactly that: `tag <= running → "already latest"`, i.e. it inferred "nothing newer exists"
   from "the newest thing my cached page happened to show". Absence of evidence was read as
   evidence of absence. (Secondary robustness issue in the same code: `per_page=10` truncation
   can hide the newest tag in a repo with many tags — the `reduce` fixes ordering, not
   truncation.)
2. **The green chip displayed the fetched tag instead of the running version.** The only version
   the plugin knows *for certain* is the hand-inlined `PLUGIN_VERSION` (L5). `renderCurrentChip`
   prints the network value (L27), which turned a stale-cache artifact into an outright false
   statement about the user's own installation — "you are on v0.2.9" when they were on 0.2.10.
   That is why the user "almost closed the tab"
   ([fixture/user-threads.md](fixture/user-threads.md) L17–L18). The reported "a while later it
   changed its mind" is just the CDN entry expiring past `s-maxage=300` so a later fetch finally
   saw `v0.2.11` — the correction was accidental, not designed.

### 3.3 The display rule the chip should follow

Compare exactly **two** values: **the newest stable tag from the (possibly stale) remote list**
vs **the locally inlined `PLUGIN_VERSION`**.

| Condition | Chip | Shows |
|---|---|---|
| fetch fails / non-ok / no stable tags | neutral | "update status unavailable — will retry" (**never** "already the latest") |
| `semverCmp(tag, PLUGIN_VERSION) > 0` | update | the fetched tag — "v0.2.11 available — reload/reinstall to update" |
| otherwise (`tag <= PLUGIN_VERSION`, incl. the stale-list case and the user-on-a-newer-build case) | green | **`PLUGIN_VERSION`** — "already the latest version 0.2.10" |

Key points:

- The **update** direction is safe: a listed tag does prove something newer exists, so naming the
  fetched tag there is correct and useful.
- The **"already latest"** direction is a *negative* claim built from a cacheable source, so it
  must (a) only ever assert the locally-known running version, and (b) display
  `PLUGIN_VERSION`, never the fetched tag. The fetched tag in this branch carries no information
  the user needs and can only mislead (it made a 0.2.10 user believe they were on 0.2.9).
- Hardening on top: issue the request with `cache: 'no-store'` (or a cache-busting query param)
  to shrink the stale window; re-check on an interval and/or on tab focus so the chip
  self-corrects within roughly the CDN freshness window instead of only after a reload; keep the
  strict `^v\d+\.\d+\.\d+$` filter (L12) so prerelease tags never masquerade as latest; and
  consider paginating past page 1 (or using the releases endpoint) so a many-tag repo cannot hide
  the newest tag.

---

## 4. Regression tests that would have caught both follow-ups

### 4.1 Follow-up A (paste renaming)

1. **Paste dedupe — the reported bug:** two clipboard items both named `image.png` in one batch →
   labels and upload paths `paste_image.png`, `paste_image(2).png`. (v0.2.10 fails this twice
   over: it keeps `image.png` twice *and* `validateItems` throws
   "Duplicate attachment path: image.png", L11.)
2. **Non-image pastes:** clipboard `report.pdf` twice → `paste_file.pdf`, `paste_file(2).pdf`.
3. **Extension fallback:** clipboard item named `image`/`blob` with `type: 'image/png'` →
   `paste_image.png`; item with neither name extension nor MIME → documented default.
4. **Mixed batch:** `[image.png, image.png, notes.txt]` → `paste_image.png`,
   `paste_image(2).png`, `paste_file.txt`; `validateItems` must not throw.
5. **Scoping / must-not-change:** drop two files and pick files via the picker → labels and upload
   paths remain the real names, and no `paste_` prefix appears on any drop/picker path. (Guards
   against moving the rename into the shared `add()`.)
6. **Authoritative-source test — the scored design point:** seed the host composer snapshot with
   an occurrence labeled `paste_image.png` while `records` has **no** entry for it (reproducing
   the post-retirement state the alive-subscription creates on a momentary empty snapshot), then
   paste an image → the new name must be `paste_image(2).png`. This test **fails** against a
   `records`-based implementation and **passes** against the snapshot-based one.
7. **Retirement regression:** after a successful paste, emit one momentary empty snapshot followed
   by the restored snapshot → the existing record must survive (no deletion, no dock change), and
   a subsequent paste must still skip the taken name.
8. **Cross-batch collision:** paste an image, then in a fresh batch paste another →
   `paste_image.png` then `paste_image(2).png`, never two `paste_image.png`.

### 4.2 Follow-up B (version chip)

1. **Stale-list "already latest" — the reported bug:** mock `fetch` to return the captured body
   (`v0.2.9`, `v0.2.8`, `v0.2.7`) with `PLUGIN_VERSION = '0.2.10'` → the green chip text must
   contain `0.2.10` and must **not** contain `0.2.9`. (v0.2.10 fails: it renders the fetched
   tag, L27.)
2. **Update path unchanged:** list containing `v0.2.11`, running `0.2.10` → update chip shown,
   naming `v0.2.11`.
3. **Equal versions:** list max `v0.2.10`, running `0.2.10` → green chip shows `0.2.10`.
4. **Remote older than running** (dev / pre-release build): list max `v0.2.9`, running
   `0.2.11-dev` → green chip shows the running version; no downgrade claim.
5. **Failure modes:** fetch rejects / non-ok / empty stable list / all-prerelease list → neutral
   "status unavailable" chip; assert the string "already the latest" never appears in any of them.
6. **Self-correction:** fake timers plus a fetch mock returning the stale list first and the fresh
   list (with `v0.2.11`) on the second call → with **no reload**, once the re-check runs the chip
   must switch to the update chip. (The reported user was only corrected by accident, on a later
   refresh.)
7. **Cache-buster assertion:** assert the tags request is issued with `cache: 'no-store'` (or a
   unique query param) so a CDN edge cannot serve the pre-push page for the full `s-maxage`
   window.
8. **Version-constant sync:** assert the hand-inlined `PLUGIN_VERSION` in `lib/client.js` equals
   `package.json#version` (see §5).

---

## 5. Lib-only release hygiene this touches

- **Hand-inlined version constant.** With no build step, `PLUGIN_VERSION` is a literal in
  `lib/client.js` that must equal `package.json#version` at every release — and it is the exact
  value the chip compares against, so drift silently corrupts the update decision in *both*
  directions (false "update available" or false "already latest"). Hygiene: (a) a
  `prepublishOnly` script (plain Node, no new dependencies) that rewrites the constant from
  `package.json` and fails loudly if it cannot; (b) the same equality assertion as a test/CI
  gate (§4.2.8) so a mismatched tag can never ship; (c) preferably derive the version at runtime
  from host-provided plugin metadata if the host exposes one, keeping the inlined constant only as
  a fallback; (d) list the constant in the release checklist so "bump version" is one atomic step
  covering both files, not two manual edits.
- **Bundle syntax check.** No build step means nothing has ever parsed the bundle before users
  load it. Add `node --check` over every `lib/*.js` file to CI and to `prepublishOnly` — it
  costs nothing and catches the syntax error that would break every user on their next reload.
  Complement it with a smoke test that imports the lib under Node with a stubbed host API (fake
  `input.state`, fake `fetch`) and exercises the paste-naming and chip-render paths — that
  harness is also where the §4 tests live. Additionally assert the bundle is self-contained: no
  imports of dev-only packages, and the declared runtime dependencies (ideally none) match what
  the code actually imports.
- **How users actually receive the update.** This plugin has **no host-side update endpoint**, so
  the chip is purely informational: it must never imply it can install anything, and the
  GitHub-tags check cannot be part of the delivery mechanism. Delivery is manual — the installed
  copy of the bundle is refreshed by whatever put it there (git pull / re-copy of the plugin
  directory followed by a host or client reload, or a reinstall through the host's community-plugin
  flow). Consequences for this fix: (a) the update chip should say **what to do** ("v0.2.11
  available — reload/reinstall to update") and the README should document the update procedure,
  since nothing else will ever tell users; (b) because delivery is a manual pull, the CDN-cached
  tag list is the *only* signal users get, which makes defect §3.2.1 worse, not better — hence the
  display rule in §3.3 plus the periodic re-check; (c) keep pushing the git tag on every release
  as a mandatory step (it is the chip's only source of truth about new releases); (d) consider
  always surfacing the running version in the chip (not only in the green state) so users can
  report "I am on X" accurately in issues like the one that produced this follow-up.

---

## Evidence map

| Claim | Source |
|---|---|
| paste/drop/picker all funnel into `add()` | [fixture/plugin-attachment-flow.js](fixture/plugin-attachment-flow.js) L3 |
| only duplicate check is in-batch `validateItems` | [fixture/plugin-attachment-flow.js](fixture/plugin-attachment-flow.js) L11–L12 |
| `label` and upload `path` both come from `item.path` | [fixture/plugin-attachment-flow.js](fixture/plugin-attachment-flow.js) L24, L45 |
| alive-subscription retires records on ANY momentary empty snapshot | [fixture/plugin-attachment-flow.js](fixture/plugin-attachment-flow.js) L31–L38 (delete at L36) |
| dock chip falls back to `occurrence.label` (snapshot exposes labels) | [fixture/plugin-attachment-flow.js](fixture/plugin-attachment-flow.js) L44 |
| `PLUGIN_VERSION` hand-inlined, must sync with package.json | [fixture/plugin-version-chip.js](fixture/plugin-version-chip.js) L1–L5 |
| "already latest" branch taken when fetched tag ≤ running version | [fixture/plugin-version-chip.js](fixture/plugin-version-chip.js) L21 |
| green chip renders the FETCHED tag, not the running version | [fixture/plugin-version-chip.js](fixture/plugin-version-chip.js) L27 |
| CDN served a pre-push cached page (`x-cache: HIT`, `age: 178`, `s-maxage=300`); `git ls-remote` proves v0.2.10/v0.2.11 exist | [fixture/tags-api-response.txt](fixture/tags-api-response.txt) L4–L18 |
| user ran 0.2.10, was told "latest v0.2.9", chip self-corrected later | [fixture/user-threads.md](fixture/user-threads.md) L15–L23 |
| requested scheme and the "keep real names for drop/picker" constraint | [fixture/user-threads.md](fixture/user-threads.md) L5–L10 |


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.