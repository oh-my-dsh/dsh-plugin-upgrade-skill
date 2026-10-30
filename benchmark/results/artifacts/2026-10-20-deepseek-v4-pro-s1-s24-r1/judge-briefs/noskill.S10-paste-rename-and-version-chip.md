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
#### FILE: S10-paste-rename-and-version-chip/report.md

# S10 · Paste Renaming & Version-Chip Follow-Ups — Report

Plugin: @org/dsh-attach-input v0.2.10 (lib-only bundle, no build step).

---

## 1. Renaming design (Follow-up A)

### Naming scheme
- Pasted images → paste_image.<ext> (e.g. paste_image.png), with collisions numbered as paste_image(2).png, paste_image(3).png, …
- Other pasted files → paste_file.<ext> (e.g. paste_file.pdf), numbered the same way (paste_file(2).pdf, …).
- The bare name is the first occurrence (paste_image.png); the (N) suffix starts at (2) and increments.
  The number chosen is the smallest N ≥ 2 such that paste_<kind>(N).<ext> is not already taken (N = 1 is the bare name).

### Where the rename must be applied (and what stays untouched)
All three acquisition paths — paste, drag-and-drop, and the file/folder picker — currently funnel into the
single add(sessionId, items). The rename must therefore be scoped to one acquisition path only:

- Paste path: the clipboard handler computes the target name and applies it to the item BEFORE it reaches add()
  (i.e. it replaces item.path / item.file.name so the rename is real, not cosmetic). The cleanest mechanism is a
  source discriminator on add(), e.g. add(sessionId, items, { source: 'paste' }) → apply renamePasted(items);
  source 'drop' | 'picker' → skip renaming entirely.
- Drag-and-drop path: must stay untouched — item.path is kept verbatim.
- File/folder picker path: must stay untouched — real names preserved.

The rename cannot live inside a shared add() step unconditionally, because that would also rename drag-drop
and picker files.

### How the number is chosen / the authoritative "names already taken" source
The authoritative source for "names already taken" is the composer's own live state — the set of attachment
names currently present, read from input.state.getSnapshot() (the occurrence labels/names), PLUS the names
already assigned within the current paste batch. Each newly assigned name is added to that working set as it is
assigned, so a multi-file paste or back-to-back pastes each get a distinct number.

Why a plugin-side records Map alone is the wrong source: records is a derived cache, not ground truth. Its
subscription retires an entry the moment a snapshot shows no occurrence for that ref:

    const alive = current.occurrences.some(o => o.source === SOURCE && o.ref === ref);
    if (alive || record.inflight !== undefined) return;
    unsubscribe();
    records.delete(ref);   // ← fires on ANY momentary empty snapshot

During normal operation the composer's state can transiently report zero occurrences for a ref (mid-transaction,
while a coordinate/insert update is being applied and the ref has not been re-observed yet). On such a momentary
empty snapshot the entry is deleted, so the Map under-reports the names actually still in the composer. Using it
to pick the next number would therefore produce collisions (e.g. a second paste_image.png) even though the first
is still present. Only the live composer state (getSnapshot() occurrences) reflects what is actually there.

validateItems' in-batch duplicate check (paths.has(item.path)) operates on raw item.path and only within one
selection batch; it does not and cannot cover cross-batch collisions or post-rename uniqueness, so the number
must be chosen against the composer state above, and the duplicate check should run on post-rename names.

---

## 2. Extension rule and what the chip / upload path show (guidance, not scored)

- Extension rule: prefer the MIME type of the pasted file (item.file.type → image/png → .png, image/jpeg → .jpg,
  application/pdf → .pdf, …). Fallback: when MIME is absent or generic ("" or application/octet-stream), derive the
  extension from the original clipboard filename (image.png → .png). Rationale: clipboard names are unreliable
  (the browser hands every screenshot "image.png", and blobs may carry no real extension), so MIME is the stronger
  signal; the original name's extension is only a fallback when MIME is unusable. Image classification
  (paste_image vs paste_file) keys off MIME being image/*.
- Dock chip label: shows the renamed name (e.g. paste_image(2).png), not the raw image.png.
- Uploaded path: the upload body must send the renamed name as the path/filename
  (files: record.items.map(item => ({ path: <renamedName>, ... }))), so the attachment actually lands with the
  unified name — the rename is applied to the item, not only to the display label.

---

## 3. Follow-up B root cause and display rule

### Root cause
1. The chip fetches https://api.github.com/repos/org/dsh-attach-input/tags?per_page=10 and treats the cached
   response as ground truth. The captured response is a CDN cache HIT (x-cache: HIT, age: 178,
   cache-control: private, max-age=60, s-maxage=300), so the JSON predates both the v0.2.10 and v0.2.11 pushes —
   it returned only v0.2.9 / v0.2.8 / v0.2.7.
2. latestFromTags() returns the highest stable tag from that stale list: v0.2.9.
3. semverCmp('v0.2.9', '0.2.10') <= 0 → true, so the chip takes the "current" branch.
4. The bug: renderCurrentChip(tag) renders the fetched tag, so the green chip said
   "already the latest version v0.2.9" even though the locally-known running PLUGIN_VERSION was 0.2.10.

Two compounding issues: the remote value was stale (cache), and even absent staleness the display rule was wrong —
showing a remote value older than the locally-known running version as "latest".

### Display rule the chip should follow
- Compare: the fetched remote stable tag vs the local running PLUGIN_VERSION.
  - remote > local → update chip: "update available, latest <remote>".
  - remote <= local → up-to-date chip.
- Which one is shown: in the up-to-date branch, show the local running version (PLUGIN_VERSION), never the
  fetched tag. Because local >= remote, the local version is the higher/authoritative "latest you know of";
  rendering a stale remote value that is older than what the user is actually running is the lie. Only trust the
  remote as the displayed ground truth when it is strictly newer than local.

    function renderCurrentChip() {
      lbl.textContent = '✓ attach-input already the latest version ' + PLUGIN_VERSION; // local, not `tag`
    }

---

## 4. Regression tests that would have caught both follow-ups

### Follow-up A (renaming)
1. Paste image → base name: pasting an image with clipboard name image.png produces a record/upload named
   paste_image.png.
2. Cross-batch numbering: a second paste of image.png (after the first) yields paste_image(2).png; a third yields
   paste_image(3).png.
3. Authoritative source over fragile cache: simulate the records Map having retired the first entry (momentary
   empty snapshot) while the composer still holds paste_image.png; the next paste must still produce
   paste_image(2).png (proving the number is chosen from composer state, not records).
4. Non-image pastes: a pasted application/pdf yields paste_file.pdf.
5. Drop/picker untouched: dragging report.pdf and selecting it via the picker both keep report.pdf verbatim
   (no paste_* rename, no numbering).
6. In-batch collision: two images in one paste batch (both named image.png) yield paste_image.png and
   paste_image(2).png.

### Follow-up B (version chip)
1. Remote older than running: mock the tags endpoint returning v0.2.9 while PLUGIN_VERSION is 0.2.10 → the chip
   shows "…latest version 0.2.10" (running), not "v0.2.9".
2. Remote newer than running: remote v0.2.11, running 0.2.10 → update chip shows v0.2.11.
3. Stale-cache simulation: return an older tag list than the running version and assert the chip never displays
   an older version as "latest".

---

## 5. Lib-only release hygiene touched

1. Hand-inlined version constants: PLUGIN_VERSION = '0.2.10' in lib/client.js is a second source of truth that must
   stay in sync with package.json. With no build step there is no bundler to inject it, so add a release-time guard:
   a preversion/release script that asserts the inlined constant equals the package.json version (and that the git
   tag is "v" + version) and fails the release on mismatch. Better: generate/inject the constant from the single
   source of truth at release so it cannot drift.
2. Bundle syntax check: because it ships lib-only with no build step, nothing fails on a syntax error at ship time.
   Add "node --check lib/client.js" (plus a smoke import/load against the DSH client API) to CI/release so a broken
   bundle is caught before tagging v0.2.x.
3. How users actually receive the update (no host-side update endpoint): there is no host-side push channel.
   Users get new code only when the client re-fetches the lib bundle (hard refresh / bundle cache expiry). The
   in-bundle version chip is therefore the only update notification surface — its correctness (item 3) is
   load-bearing for delivery: it must accurately tell a user on an old bundle that a newer tag exists so they
   hard-refresh.



## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.