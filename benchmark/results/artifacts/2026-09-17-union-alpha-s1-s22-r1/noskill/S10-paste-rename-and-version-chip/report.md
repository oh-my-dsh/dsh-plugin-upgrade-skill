# S10 Report · Paste Renaming & Version-Chip Follow-Ups (@org/dsh-attach-input)

Evidence reviewed (fixture, read-only): README.md, plugin-attachment-flow.js, plugin-version-chip.js, tags-api-response.txt, user-threads.md. All conclusions below cite those files. The fixture was not modified.

## 1. Follow-up A — renaming design for pasted files

### 1.1 Exact naming scheme

Only the paste acquisition path renames; the scheme the user asked for (user-threads.md, kaylint thread):

- Pasted images (clipboard file whose MIME type is image/*, or whose name has an image extension): base name paste_image + extension. First occurrence lands as paste_image.png, then paste_image(2).png, paste_image(3).png, …
- All other pasted files: base name paste_file + extension: paste_file.pdf, then paste_file(2).pdf, … The original base name is discarded for pastes; only the extension survives (from the original name, or a MIME fallback — see section 2).
- The numbered suffix starts at (2), never (1): the first file in a collision class is unnumbered, and numbering only appears once the unnumbered name is taken.
- Files added by drag-and-drop, the file picker, and the folder picker keep their real names verbatim.

### 1.2 Where in the flow the rename is applied — and what stays untouched

plugin-attachment-flow.js says: "The paste path, the drop path, and the file/folder picker all funnel into add()", and add() keeps item.path verbatim.

- Apply the rename in the paste event handler, at the moment items are constructed from clipboardData (i.e., where the clipboard File objects are turned into the item objects that will be passed to add()). The paste handler is the only place that can cheaply know "this came from a paste" without changing add()'s signature for all three callers.
- Critically, the rename must happen BEFORE validateItems() runs, not inside add() after validation. validateItems throws "Duplicate attachment path" on any repeated path within a batch, and the browser gives every pasted screenshot the identical name image.png — so two screenshots pasted in one clipboard event would throw before any rename inside add() could help. Renaming at acquisition makes the in-batch duplicate check keep working as designed (it then guards real, user-caught duplicates) instead of fighting it.
- Paths that must stay untouched:
  - The drop handler, file picker, and folder picker: they pass item.path through verbatim; no rename call is added on those routes.
  - add()'s shared body, validateItems() semantics for non-paste batches, and the coordinate handling fixed in v0.2.10.
  - The dock chip and the upload body need no code change for renaming: the chip renders record.label which is item.path, and the upload body sends files: [{ path: item.path }]. Because the rename mutates item.path itself at acquisition, chip label and uploaded path stay consistent for free (one source of truth).

This is the "scope the behavior change to one acquisition path" point: one route (paste) gets a transform before the shared funnel; the funnel itself and the other two routes are untouched.

### 1.3 How the number is chosen

Numbering is collision resolution against a taken-name set, not a global counter (a counter would keep growing across removals and produce gaps):

1. Build the candidate sequence for a paste of kind K (paste_image or paste_file) with extension E: paste_image.E, paste_image(2).E, paste_image(3).E, …
2. Take the first candidate not in the taken set. Never renumber already-issued names; never reuse a number while its file is still present.
3. Within one clipboard event containing several files, allocate sequentially (item 1 takes the first free candidate, item 2 takes the next free, …), so a single multi-image paste gets (2), (3) in order and never collides with itself.
4. Names freed by the user (chip removed, occurrence gone) become available again automatically — this falls out of consulting live state at allocation time (below), not from persisting a counter.

### 1.4 The authoritative "names already taken" source — and why the records Map alone is wrong

The taken set must be read from the composer's live state: input.state.getSnapshot() occurrences (the same state the existing aliveness check consults: current.occurrences.some(o => o.source === SOURCE && o.ref === ref)), optionally intersected with the host/session's accepted upload paths if the API exposes them. Concretely: at allocation time, taken = labels of occurrences currently present in the live snapshot for this session (all sources, not just pastes) plus the names already allocated in the current batch.

Why the plugin-side records Map is the wrong source, by the fixture's own comment:

- plugin-attachment-flow.js marks the subscription with "← fires on ANY momentary empty snapshot": every record subscribes to composer state, and the handler unsubscribes and does records.delete(ref) whenever one snapshot momentarily shows no matching occurrence — during re-renders, transient clears, or the window between records.set() and the occurrence actually appearing in state. So the Map systematically under-reports: it forgets names that are still on screen and still pending upload.
- If the taken set came from the Map, a retired record would let the allocator reissue a name that is still visible/being uploaded — resurrecting exactly the duplicate-chip bug the rename scheme exists to fix, now with two different files wearing the same paste_image(2).png.
- Even with a healthy cache, the Map only knows this plugin's own records: names taken by drag-and-drop files, picker files, or other composers/sources in the same session are invisible to it, yet they must also block candidates (a user can legitimately drag in a file literally named paste_image.png).
- A derived, best-effort cache is fine as a fast-path hint; it must never be the source of truth. Ground truth is where the name has to be unique: the composer/session state that renders the chips (and, ultimately, the host's record of accepted upload paths).

## 2. Extension rule and display surfaces (item 2 — guidance, not scored)

- Extension: for each pasted file, use the extension of the original clipboard name when present and plausible (image.png → .png; report.pdf → .pdf). When the clipboard name has no extension (common for imagepaste in some browsers), fall back to the File's MIME type: image/png → .png, image/jpeg → .jpg, image/webp → .webp, image/gif → .gif, application/pdf → .pdf; unknown MIME → .bin (or omit, but pick one and document it). The fallback only affects the extension; the base is always paste_image / paste_file for pastes. Non-image pastes with a real name still get renamed (paste_file.<ext>), per the user's request.
- Dock chip: displays the renamed label — record.label === item.path === e.g. paste_image(2).png. No separate display name is introduced, so what the user sees is byte-identical to what is uploaded.
- Uploaded path: files: [{ path: item.path }] sends exactly the renamed name; the server stores paste_image(2).png. Chip label and upload path must never diverge — they are the same string because the rename mutates item.path before the record is built.

## 3. Follow-up B — root cause and the display rule the chip should follow

### 3.1 Root cause: the chip trusted a cached remote tag page as "the latest version"

Evidence chain from tags-api-response.txt and plugin-version-chip.js:

1. The user hard-refreshed ~90 seconds after v0.2.11 was pushed. A hard refresh bypasses the browser cache, but not GitHub's shared/CDN cache. The captured response shows x-cache: HIT, age: 178, and cache-control: private, max-age=60, s-maxage=300 — the shared cache is allowed to serve entries up to 300 seconds stale, and it served one that was 178 seconds old, i.e., a page that predates both the v0.2.10 and v0.2.11 pushes (the body lists only v0.2.7, v0.2.8, v0.2.9; git ls-remote confirms v0.2.10 and v0.2.11 exist on the remote).
2. latestFromTags() reduced that stale list to its maximum stable tag and returned v0.2.9 as "the latest".
3. startUpdateChip() compared semverCmp("v0.2.9", "0.2.10") <= 0 → true → took the "already current" branch and called renderCurrentChip(tag).
4. renderCurrentChip() renders the FETCHED tag: '✓ attach-input already the latest version ' + tag — so it asserted "already the latest version v0.2.9" to a user who is provably running v0.2.10. The chip names an older version as "latest", which is self-contradicting: nothing about the fetched value is ground truth for anything, yet it is displayed as the authoritative "latest".
5. "A while later it changed its mind" (user-threads.md, rho_9) matches the cache explanation: once the CDN entry expired (s-maxage = 300s), the fresh list contained v0.2.11 and the chip flipped to the update branch.

So the root cause is two compounded mistakes:
- Treating the remote tag list — which is cache-served and can be minutes stale right after a push — as ground truth for "the latest version".
- Displaying that fetched value in the green chip even when it is older than the locally known running version. The code has the local truth (PLUGIN_VERSION = '0.2.10', hand-inlined) in the very same function and throws the information away.

### 3.2 The display rule the chip should follow

Exactly two values are compared: the fetched remote latest stable tag vs. the locally known running version (the hand-inlined PLUGIN_VERSION, which is the only reliable statement of what the user is actually running). The rule:

- fetched tag > running version → renderUpdateChip(fetched): show the fetched newer version and offer the update. Here the remote value is displayable, because it is the only source for "something newer exists".
- fetched tag == running version → green chip, showing the running version (both are equal, so either name is safe).
- fetched tag < running version → the fetched value is provably stale; never display it as "the latest version". The green chip must display the running version instead: "✓ attach-input already the latest version v0.2.10". (The remote can only ever prove "nothing newer existed at some past moment"; it can never downgrade the locally known fact of what is running.)
- fetch failed / timed out → offline chip, which makes no "latest" claim at all (unchanged from current code).

Equivalently: the version named next to "latest" is max(remote, local) — which in the green branch always equals the local running version. Under this rule the worst case during a cache-staleness window is a benign, self-healing missed announcement (a user on v0.2.10 briefly sees "latest v0.2.10" while v0.2.11 exists unannounced), never today's lie ("latest v0.2.9" to a v0.2.10 user). Optionally, fetched < running is also a useful staleness signal and can trigger a cache-busted retry, but the display rule above is what removes the lie regardless of retry policy.

## 4. Regression tests that would have caught both follow-ups

Follow-up A (paste renaming — would have failed before v0.2.10 shipped the no-rename add()):

1. Cross-batch uniqueness: paste one clipboard image (browser name image.png); paste a second one later. Assert the two records' paths are paste_image.png then paste_image(2).png. (This test fails on v0.2.10, where both stay image.png.)
2. Single multi-file paste: one clipboard event carrying 2+ images. Assert sequential numbering and no in-batch collision — and that validateItems' "Duplicate attachment path" is not reached with the raw clipboard names (on v0.2.10 this scenario throws instead of renaming).
3. Non-image paste: a clipboard file with MIME application/pdf → paste_file.pdf; a second one → paste_file(2).pdf. Also a file named image.png whose MIME is application/pdf lands as paste_file.pdf (MIME/classification decides the base, not the stale browser name).
4. Acquisition-path scoping: drag-and-drop of real.png and a picker selection keep their real names verbatim; a mixed batch (one dropped file + one paste) shows the drop name unchanged and only the pasted file renamed.
5. Taken-source test (the scored design point): with a pasted paste_image.png still present in composer state, drive a momentary empty snapshot so the records subscription retires the record (records.delete fires); paste again. Assert the new file does NOT reuse paste_image.png — allocation must have consulted the live composer snapshot, not the retired cache. This is precisely the fragility the fixture comment flags ("fires on ANY momentary empty snapshot").
6. Label/upload consistency: after a rename, assert record.label === files[].path in the upload body and the chip text equals the renamed path.
7. Reuse after removal: user deletes the paste_image.png chip; the next paste may take paste_image.png again (live-state allocation, no forever-growing counter).

Follow-up B (version chip — would have failed before the v0.2.11 announcement):

1. Stale-cache replay: mock the tags fetch to return exactly the captured body (only v0.2.7–v0.2.9) with PLUGIN_VERSION = 0.2.10. Assert the chip does not render "latest version v0.2.9"; assert the green chip text contains v0.2.10 (the running version). This single test catches the reported incident exactly.
2. Update branch: fetched list contains v0.2.11, running 0.2.10 → update chip renders v0.2.11.
3. Failure branch: fetch rejects / AbortSignal.timeout fires → offline chip, and its text makes no "latest" claim.
4. Display invariant (table-driven or property test): for arbitrary (running, fetched) pairs, whenever the green "already the latest" branch is taken, the displayed version must be ≥ the running version. v0.2.9 vs 0.2.10 violates this on current code.
5. Version-constant sync (shared with item 5): assert the PLUGIN_VERSION literal in lib/client.js equals package.json version, so the "locally known running version" half of every comparison cannot drift.

## 5. Lib-only release hygiene items this touches

- Hand-inlined version constant: the bundle is lib-only with no build step, so nothing rewrites PLUGIN_VERSION at release time — the comment in plugin-version-chip.js itself says it "must be kept in sync with package.json at every release". Make it a release gate: a tiny check that greps lib/client.js for the constant and compares it with package.json (fail the release on mismatch), or a release script that stamps the literal before tagging. This matters doubly now: the section-3 fix makes PLUGIN_VERSION one of the two values the whole chip decision rests on, and the green chip displays it directly.
- Bundle syntax check: with no bundler, whatever bytes sit in lib/ are what every browser parses on hard refresh; a syntax error ships broken to all users with no safety net. Add a CI/release step that parses every shipped file (node --check per file is sufficient for a pure syntax gate — it needs no browser globals) so the rename + chip edits in this change cannot ship unparseable JS.
- How users actually receive the update (no host-side update endpoint): the chip is an indicator only — nothing downloads or applies anything. The update reaches users only by the release artifact: cut the git tag, publish the new lib files with it, and users replace their local copy of the lib (or bump the pinned script/CDN reference) and hard-refresh; until they do, the browser keeps executing the cached old bundle. Release hygiene that follows: (a) ship the updated lib file with the tag so the file a user copies is exactly the tagged one; (b) document the manual update step in the release notes, since no endpoint will ever push it to them; (c) note the GitHub tags cache window (s-maxage=300): an "update available" chip can lag up to ~5 minutes after the push, and per section 3 the chip must stay truthful during that window rather than trusting the cached page; (d) while touching latestFromTags, note that per_page=10 silently drops the newest tag once more than 10 stable v-tags exist — the reduce would then report an older "latest"; page through or raise the limit when the tag count grows.
- Both follow-ups are pure lib/client.js edits in a no-build bundle: after editing, the minimum verification is the syntax parse of the shipped file plus a manual paste of multiple screenshots and a chip check against a mocked stale tag response — the same two scenarios section 4 turns into automated regressions.

## Scored-item mapping (per instruction.md)

- Item 1 (renaming design, number choice, authoritative taken-source and why the records cache is wrong): section 1.
- Item 3 (root cause of the wrong "latest" and the two-value display rule): section 3.
- Item 4 (regression tests): section 4.
- Item 5 (lib-only release hygiene): section 5.
- Item 2 (extension/MIME fallback, chip display, upload path): section 2 — guidance only, not scored.
