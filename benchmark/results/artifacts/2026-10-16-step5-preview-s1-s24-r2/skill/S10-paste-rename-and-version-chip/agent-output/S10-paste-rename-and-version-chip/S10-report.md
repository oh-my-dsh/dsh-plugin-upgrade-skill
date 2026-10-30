# S10 · Paste Renaming & Version-Chip Follow-Ups — Design & Root-Cause Report

**Plugin**: \`@org/dsh-attach-input\` v0.2.10 → v0.2.11 (community Web plugin, lib-only bundle, no build step)
**Evidence** (read-only fixture): \`plugin-attachment-flow.js\`, \`plugin-version-chip.js\`, \`tags-api-response.txt\`, \`user-threads.md\`
**Skill references consulted**: \`plugin-upgrade\` SKILL.md, \`references/migration-hygiene.md\`, \`examples/06-real-world-batch-migration.en.md\` (the paste-input "vanilla lib, no src/" shape)

---

## 1. Follow-up A — unified renaming of pasted files

### 1.1 Naming scheme (exact)

| Acquisition | Rule | Example |
|---|---|---|
| **Paste — images** | \`paste_image.<ext>\`, then \`paste_image(2).<ext>\`, \`paste_image(3).<ext>\`, … | \`image.png\` → \`paste_image.png\`; next paste → \`paste_image(2).png\` |
| **Paste — everything else** | \`paste_file.<ext>\`, then \`paste_file(2).<ext>\`, … | \`x.pdf\` → \`paste_file.pdf\`; next → \`paste_file(2).pdf\` |
| **Drag-and-drop** | **real name kept verbatim** — no prefix, no numbering, ever | \`report.pdf\` stays \`report.pdf\` |
| **File/folder picker** | **real name kept verbatim** — no prefix, no numbering, ever | \`notes.txt\` stays \`notes.txt\` |

Details:

- \`<ext>\` is the **original file's own extension** (case preserved), MIME only as fallback — see §2.
- \`image\` vs \`file\` is decided **per file**, so one mixed paste yields \`paste_image.png\` + \`paste_file.pdf\`.
- Numbering is **per stem+ext** (\`paste_image.png\` and \`paste_file.pdf\` count independently), and the first file takes the **unnumbered** name (\`paste_image.png\`), matching the requested scheme exactly.
- A file whose original name has no extension and whose MIME is unknown gets **no extension** (\`paste_file\`, \`paste_file(2)\`).

### 1.2 Where the rename must be applied — and what stays untouched

Today \`add()\` is the single choke point: the paste path, the drop path, and the file/folder picker all funnel into it, and \`const label = item.path\` keeps the clipboard name \`image.png\` verbatim. The rename must therefore be **scoped to the paste acquisition path only**, and applied **at ingestion, before \`add()\` does anything else**:

- **Recommended placement: the paste ingestion site** — the clipboard event handler that builds the \`items\` array from \`clipboardData\`, i.e. *before* it calls \`add(sessionId, items)\`. \`add()\` itself stays a name-preserving composer API. This structurally guarantees the drop and picker callers can never be renamed, because they never pass through the renamer.
- **Acceptable alternative: an explicit origin flag on the choke point** — \`add(sessionId, items, { origin: 'paste' })\` with the default (no flag) meaning *no rename*. If this is chosen, the rename must run **before \`validateItems()\`** and before \`records.set()\`/\`input.insertReference()\` (see below), and the default must be fail-safe (unflagged = untouched).

Ordering inside the flow (either placement):

1. **Rename first** — before \`validateItems()\`. Otherwise a single paste event carrying two clipboard files both named \`image.png\` still throws \`Duplicate attachment path: image.png\` from the in-batch check. After renaming, the same batch yields \`paste_image.png\` + \`paste_image(2).png\` and the in-batch check stays meaningful (and its existing behavior for dropped/picked duplicates is unchanged).
2. **Rename the item's \`path\` field** (\`File.name\` is read-only; \`path\` is the plugin's own handle). Then a single source of truth fans out to all three consumers that currently read \`item.path\`:
   - dock chip: \`const label = item.path\` → chip shows \`paste_image.png\`;
   - in-batch duplicate check in \`validateItems\`;
   - upload body: \`files: record.items.map(item => ({ path: item.path, … }))\` → server receives \`paste_image.png\`.
   Chip, duplicate check, and upload therefore **cannot disagree**.
3. Optionally keep the original clipboard name on the record (\`record.originalName\`) for a tooltip/undo affordance — display only, never the upload path.

**Paths that must stay untouched** (regression surface, see §4): the drop handler and the picker handler keep real names verbatim — including a dropped file that collides with an already-attached name (renumbering a user's real filename would be wrong; the user chose that name). \`validateItems\`' semantics for non-paste paths, the upload-body mapping shape, the dock-chip label source (\`record?.label ?? occurrence.label\`), and the alive-subscription are all unchanged by this feature.

### 1.3 How the number is chosen

**Smallest free integer**, in the Explorer/chat-app convention:

1. Candidate 1 is the bare stem: \`paste_image.<ext>\`.
2. If taken, try \`paste_image(2).<ext>\`, \`paste_image(3).<ext>\`, … and take the **first** one not in the taken-set.

Smallest-free (rather than a monotonic counter) means deleting an attachment frees its number for the next paste, and a gap never wedges the allocator. In the common no-deletion case this is exactly the requested \`(2), (3), …\` sequence.

### 1.4 Authoritative "names already taken" source — and why the records Map is the wrong one

**Authoritative source: the composer's own live state** — \`inputFor(sessionId).state.getSnapshot().occurrences\`, read synchronously at rename time, taking each occurrence's displayed name/path (label or path, whichever the occurrence carries), **unioned with the names already allocated in the current paste event/batch**. This is the same state the dock renders and that \`insertReference()\` validates against, so it is the ground truth of "what is attached right now".

**The plugin-side \`records\` Map must not be the conflict source.** Reasons, in order of severity:

1. **Its lifecycle is decoupled from attachment lifecycle by the alive-subscription in the fixture.** The subscription retires a record on **any** momentary snapshot that shows no occurrences for that ref (\`if (alive || record.inflight !== undefined) return;\` … \`records.delete(ref)\`). A transient empty snapshot — mid-insert re-render, a composer state flap — deletes the record **while the attachment still exists**. A name-conflict check built on this cache would then **reuse a live attachment's name**: two chips reading \`paste_image.png\`, two upload entries with the same \`path\`, and no in-batch check left to catch it (that check is per-batch only).
2. **It is a per-plugin-instance, per-page-load mirror, not the composer's state.** It only knows what *this* bundle instance added. Anything attached by another plugin, another acquisition path, or before a hard refresh (this plugin's users hard-refresh often — see Follow-up B) is invisible to it. Composer occurrences, by contrast, rehydrate from session state.
3. **Asymmetric staleness.** It can be *missing* live entries (case 1, the dangerous direction — name reuse) and can also hold entries for attachments the user already removed (the harmless direction — skipped numbers). A conflict oracle must not be lossy in either direction, and this one provably is.

The snapshot itself is read once, synchronously, at rename time — the rename does not depend on the subscription and is not affected by the retirement bug. (The retirement subscription is separately worth hardening — e.g. only retire after the occurrence is absent from *N* consecutive snapshots or absent from the rendered dock — but that is a distinct fix; naming simply must not consume that cache.)

### 1.5 Allocation algorithm (reference pseudocode)

\`\`\`js
const IMAGE_EXT = new Set(['png','jpg','jpeg','gif','webp','bmp','avif','svg']);

function extOf(file) {                       // §2: original name first, MIME fallback
  const m = /\.([A-Za-z0-9]+)$/.exec(file.name ?? '');
  if (m) return m[1];                        // preserve original extension + case
  const t = (file.type || '').toLowerCase();
  const guess = { 'image/png':'png','image/jpeg':'jpg','image/gif':'gif',
                  'image/webp':'webp','application/pdf':'pdf' }[t];
  return guess ?? '';                        // unknown → no extension
}

function isImage(file) {
  return (file.type || '').startsWith('image/') ||
         IMAGE_EXT.has(extOf(file).toLowerCase());
}

// taken = Set of names currently attached in the composer (live snapshot
// occurrences), seeded once per paste event, then grown with each allocation.
function allocatePasteName(file, taken) {
  const ext = extOf(file);
  const stem = isImage(file) ? 'paste_image' : 'paste_file';
  const suffix = ext ? '.' + ext : '';
  if (!taken.has(stem + suffix)) return stem + suffix;
  let n = 2;
  while (taken.has(stem + '(' + n + ')' + suffix)) n++;
  return stem + '(' + n + ')' + suffix;
}
\`\`\`

---

## 2. Extension rule, dock chip, upload path (guidance — not scored)

- **Extension: original name first, MIME fallback.** Use the original file name's extension when it has one (\`image.png\` → \`.png\`, \`photo.JPEG\` → \`.JPEG\` — case preserved). Fall back to a small MIME→extension map only when the original name carries no usable extension (a clipboard blob with an empty or extension-less name); if the MIME is unknown too, emit no extension.
- **Image vs file classification** uses the same inputs: MIME \`image/*\` first, the extension set as the fallback signal.
- **Dock chip** must display the **renamed** path: the chip label is \`record?.label ?? occurrence.label\`, and since \`label = item.path\` is set after renaming, the chip shows \`paste_image.png\` — never the raw \`image.png\`.
- **Upload path** must send the **same renamed path**: \`files: [{ path: 'paste_image.png', … }]\`. Chip text and uploaded path are two views of one renamed \`item.path\`; if they ever disagree, the server-side attachment name and the UI disagree — that is the bug class to avoid.

---

## 3. Follow-up B — the version chip showed an OLDER tag as "latest"

### 3.1 What actually happened (evidence chain)

From \`tags-api-response.txt\`, captured ~90 s after pushing tag \`v0.2.11\`:

- \`HTTP/2 200\`, \`x-cache: HIT\`, \`age: 178\`, \`cache-control: private, max-age=60, s-maxage=300\` — GitHub's API served a **cached page roughly 3 minutes old**, from **before both pushes**.
- The body listed only \`v0.2.9\`, \`v0.2.8\`, \`v0.2.7\` — **both v0.2.10 and v0.2.11 were absent**, even though \`git ls-remote\` proves both tags exist on the remote.
- The chip code: \`latestFromTags()\` filters to \`^v\d+\.\d+\.\d+$\`, takes the max by \`semverCmp\` → \`v0.2.9\`; then \`if (semverCmp(tag, PLUGIN_VERSION) <= 0) { renderCurrentChip(tag); return; }\` → \`0.2.9 <= 0.2.10\` → green chip: **"✓ attach-input already the latest version v0.2.9"**.
- The user was running v0.2.10. Minutes later the cache expired, the listing contained v0.2.11, and the chip "changed its mind" — matching the user's report.

### 3.2 Root cause

Two compounding faults, both in the chip, not in the release:

1. **A cached remote listing was treated as ground truth.** The fetch carried no cache-busting/revalidation, and GitHub's shared cache legitimately serves a page up to \`s-maxage=300\` (5 min) old — the "minutes after push" window is *expected* CDN behavior, not an anomaly. The code had no staleness detection, even though the response itself contained the proof: \`x-cache: HIT\` + \`age: 178\`, and — decisive — **the listing did not contain the running version \`0.2.10\`, which provably exists on the remote**. A tag list that omits the version you are running cannot be current.
2. **The green "already latest" chip rendered the fetched tag instead of the running version.** \`renderCurrentChip(tag)\` prints the *remote* value. The only trustworthy statement about the user's installation is the locally inlined \`PLUGIN_VERSION\`; the remote fetch was allowed to *downgrade* the displayed claim to \`v0.2.9\`. The comparison used the local value, but the *display* used the remote one — the authority was inverted.

### 3.3 The display rule the chip should follow

**The two values that compare:**

- \`PLUGIN_VERSION\` — the **locally known running version**, hand-inlined in the shipped bundle (always trustworthy about what the user runs);
- \`remoteMax\` — the maximum \`^v\d+\.\d+\.\d+$\` tag from the fetched listing (advisory, possibly stale).

**The one that is shown:** the **running version** in the green chip. \`remoteMax\` may only *upgrade* the claim, never *downgrade* it:

| Condition | Chip | Text built from |
|---|---|---|
| \`remoteMax\` **>** running | update chip (not auto-dismissed; links to install instructions) | \`remoteMax\` — e.g. "v0.2.11 available" |
| \`remoteMax\` **==** running | green "already latest" | the **running** version (\`0.2.10\`) |
| \`remoteMax\` **<** running | **listing is provably stale** — do not name \`remoteMax\`; show green "already latest" built from the **running** version, and re-check once with cache-busting (\`cache: 'no-store'\` / \`Cache-Control: no-cache\`) | the **running** version (\`0.2.10\`) |
| fetch fails / times out / empty | offline chip (existing path) | — (never "latest") |

So the corrected green chip for the captured incident reads: **"✓ attach-input already the latest version 0.2.10"** — never "v0.2.9". Invariant to enforce in code: *the green chip's subject is the user's installation, so its text comes from \`PLUGIN_VERSION\`; a remote tag older than the running version is evidence of a stale cache, not a version claim.* A 200 response with a stale body must not reach the "no update" conclusion — treat \`remoteMax < running\` as "remote unverified", retry once uncached, then fall back to the running version.

---

## 4. Regression tests that would have caught both follow-ups

### 4.1 Follow-up A — renaming (run against the allocator + \`add()\` with a fake composer \`input\`)

1. **A1 · multi-file single paste**: one paste event, 3 files all named \`image.png\` → paths \`paste_image.png\`, \`paste_image(2).png\`, \`paste_image(3).png\`; **and no \`Duplicate attachment path\` throw** (proves the rename runs before \`validateItems\`).
2. **A2 · sequential pastes**: paste \`image.png\` (lands \`paste_image.png\`), then paste \`image.png\` again in a *separate* event → second lands \`paste_image(2).png\` (proves the taken-set spans batches, seeded from the composer state).
3. **A3 · non-image pastes**: paste \`x.pdf\` → \`paste_file.pdf\`; paste again → \`paste_file(2).pdf\`; numbering is independent of \`paste_image\` counts.
4. **A4 · extension rules**: pasted \`photo.JPEG\` → \`paste_image.JPEG\` (case preserved); extension-less clipboard blob with MIME \`image/png\` → \`paste_image.png\` (MIME fallback); unknown MIME and no extension → \`paste_file\`.
5. **A5 · scope lock (the other two acquisition paths)**: drag-and-drop \`report.pdf\` and picker-select \`notes.txt\` → labels **and** upload paths remain \`report.pdf\` / \`notes.txt\` — no \`paste_\` prefix, no numbering — even when \`paste_image.png\` is already attached. Two dropped files with identical real names keep the pre-existing \`Duplicate attachment path\` behavior.
6. **A6 · authoritative conflict source (the trap test)**: attach \`paste_image.png\`; then **fire the alive-subscription with a momentary empty snapshot so the record is retired from the \`records\` Map**; then paste another \`image.png\`. Assert the new item still allocates \`paste_image(2).png\` — i.e. the allocator resolved the conflict against the composer state, not the cache. (Mirror variant: seed the Map with a poisoned \`paste_image(9).png\` and assert numbering does **not** jump to (10).)
7. **A7 · chip/upload consistency**: after every paste in A1–A4, assert dock-chip label == uploaded \`path\` == renamed name for each record.

### 4.2 Follow-up B — version chip

1. **B1 · captured-response replay**: \`PLUGIN_VERSION = '0.2.10'\`, fetch mocked to return the captured body (\`v0.2.9\`, \`v0.2.8\`, \`v0.2.7\` — with \`x-cache: HIT\`, \`age: 178\`). Assert the rendered chip text contains \`0.2.10\` and **never** \`0.2.9\`. This is the exact incident as a unit test.
2. **B2 · update path**: tags \`[v0.2.11, v0.2.10, v0.2.9]\` → update chip naming \`v0.2.11\` with the install/update link.
3. **B3 · equal path**: max tag \`v0.2.10\` == running → green chip shows the running version \`0.2.10\`.
4. **B4 · stale-listing detection**: \`remoteMax < running\` → chip must treat the listing as unverified: retry once with no-store semantics, and whatever the retry returns, **never render a version older than the running one as "latest"**.
5. **B5 · decision-function contract**: the chip decision takes \`(runningVersion, remoteTags, responseMeta)\`; assert that an HTTP 200 alone never authorizes "already latest \`<remoteTag>\`" — specifically that a listing omitting \`runningVersion\` cannot conclude "latest" from \`remoteMax\`.
6. **B6 · version-constant sync (release regression, lib-only)**: extract \`PLUGIN_VERSION\` from \`lib/client.js\` and compare with \`package.json\`'s \`version\` → must be equal. Catches the hand-inlined-constant drift before a tag (see §5.1).
7. **B7 · offline path**: fetch rejects/times out → offline chip, never "already latest".

---

## 5. Lib-only release hygiene items this touches

This plugin ships \`lib/\` directly — the "vanilla lib, no src/" paste-input shape from the skill's batch-migration example: no build, typecheck, or test scripts. Every gate below is manual/artifact-level, and all of them are touched by these two follow-ups.

### 5.1 Hand-inlined version constants

- \`PLUGIN_VERSION = '0.2.10'\` is hand-inlined in \`lib/client.js\` and, per the bundle header comment, **must be kept in sync with \`package.json\` at every release**. There is no bundler to bake it in, so the sync is a manual step that can silently fail — and the in-plugin chip compares the *artifact's* constant against the remote tag, so a stale constant lies in the opposite direction from Follow-up B: it offers an update forever (constant older than the newest tag) or hides a real one (constant newer).
- Release rule (v0.2.11): bump \`PLUGIN_VERSION\` **and** \`package.json\` **and** the README install/version routing in the same commit as the tag; before tagging, verify with test **B6** (grep the constant out of the final \`lib/client.js\`, diff against \`package.json\`). The skill's batch-migration example records this exact failure mode ("tagging after bumping \`package.json\` alone ships a self-inconsistent tag").

### 5.2 Bundle syntax check

- With no build pipeline, the only static gate on the shipped artifact is a **syntax check of the final files**: \`node --check lib/index.js && node --check lib/client.js\`, plus a content inspection of the artifact's version constant and update prompt (the paste-input routine from the skill's example). A syntax error in the committed \`lib/\` bricks every install at once — this check is the release's last line of defense, especially since both follow-ups edit \`lib/client.js\`.
- After the syntax check: commit the final artifacts together with the change, and verify on a real host (boot \`dsh\` + browser hard refresh — see §5.3).

### 5.3 How users actually receive the update (no host-side update endpoint)

- This plugin has **no host-side update endpoint**: DSH does not serve or auto-apply updates to it, and a source/link install sits outside the Plugin Manager's bundle management. The version chip is a **prompt, not a delivery mechanism** — it cannot update anyone.
- Actual delivery is user-driven re-install at the new tag: the README **install prompt with version routing** (pin the instructions to \`v0.2.11\`), and the user re-pulls/replaces the plugin themselves (\`git fetch && git checkout v0.2.11\` for a clone/link install, or replacing the \`lib/\` files).
- **Effective plane**: every change in both follow-ups lands in \`lib/client.js\` — the **client half** — so a **browser hard refresh** is sufficient for users to pick it up; a \`dsh\` restart is only needed if \`lib/index.js\` (host half) ever changes.
- Tag/mirror discipline: push the tag, then **verify the remote SHA and tag target on every mirror** — every tag the README and the chip reference must exist on every mirror. If any documentation points at npm, remember npm publish can lag the GitHub release (E404 window); for this GitHub-delivered plugin the **GitHub tag is the delivery coordinate**, and the chip's tag listing is fetched from that same GitHub API — whose edge cache (\`s-maxage=300\`) is exactly why the display rule in §3.3, not the release process, is the fix for the "minutes after push" window.

---

## Appendix — evidence pointers

- Rename target / current behavior: \`plugin-attachment-flow.js\` — \`const label = item.path\` (line "← pasted \`image.png\` stays \`image.png\`"), \`validateItems\` in-batch duplicate check, the alive-subscription that \`records.delete(ref)\` on any momentary empty snapshot, dock chip \`record?.label ?? occurrence.label\`, upload body \`files: record.items.map(item => ({ path: item.path, ... }))\`.
- Chip behavior: \`plugin-version-chip.js\` — \`latestFromTags()\` (no cache-busting), \`startUpdateChip()\` decision, \`renderCurrentChip(tag)\` printing the fetched tag.
- Stale-cache proof: \`tags-api-response.txt\` — \`x-cache: HIT\`, \`age: 178\`, \`s-maxage=300\`, tags \`v0.2.9/v0.2.8/v0.2.7\` only; \`git ls-remote\` shows \`v0.2.10\` and \`v0.2.11\` both exist.
- User reports: \`user-threads.md\` — kaylint (renaming, keep real names for drop/picker), rho_9 (green chip said "latest v0.2.9" while running v0.2.10, minutes after v0.2.11).
- Skill hygiene sources: \`examples/06-real-world-batch-migration.en.md\` (paste-input lib-only routine: \`node --check\` on artifacts, artifact version-constant verification, tag/mirror verification, baked-constant pitfall), \`references/migration-hygiene.md\` item 3 (client half = hard refresh, host half = \`dsh\` restart).
