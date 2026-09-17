# S10 Diagnostic Report — Paste Renaming & Version-Chip Follow-Ups (@org/dsh-attach-input v0.2.10)

Evidence: fixture README.md, plugin-attachment-flow.js, plugin-version-chip.js, tags-api-response.txt, user-threads.md.

## 1. Renaming design (Follow-up A)

**Scheme** (as requested by user kaylint in user-threads.md): pasted images become `paste_image.png`, `paste_image(2).png`, `paste_image(3).png`…; other pasted files become `paste_file.<ext>`, `paste_file(2).<ext>`… — the same parenthesized counter, independent per extension/branch so an image paste and a file paste don't collide on numbering.

**Where the rename applies — only the paste acquisition path.** The excerpt's header says "The paste path, the drop path, and the file/folder picker all funnel into add()", and the label is assigned unconditionally: `const label = item.path; // ← pasted "image.png" stays "image.png"`. The behavior change must be scoped by acquisition origin, not applied inside `add()` itself: only the paste handler should mark items as pasted and run the renamer; drag-and-drop and picker items must keep `item.path` verbatim ("keep the real names when I drag files in or use the picker — those are my actual files"). Concretely: tag the origin before add() (or pass origin into add()) and rename only when origin === 'paste'.

**How the number is chosen:** for each new pasted item, start at 1; if the base name is free use `paste_image.png`; otherwise try `paste_image(2).png`, `paste_image(3).png`… until an untaken name is found. Within one multi-item paste batch, increment per item so three pasted screenshots get (1), (2), (3) rather than all the same name.

**Authoritative "names taken" source: the composer/live state, not the plugin's `records` Map.** The rename check must ask the live input state (e.g. the snapshot of already-inserted occurrence labels/paths plus what earlier items in the current batch have already claimed) because that is where duplicates would actually conflict at upload/insertion time.

**Why the records Map alone is wrong:** the fixture's subscription retires entries whenever a snapshot momentarily shows no occurrences:

```js
const alive = current.occurrences.some(o => o.source === SOURCE && o.ref === ref);
if (alive || record.inflight !== undefined) return;
unsubscribe();
records.delete(ref);   // ← fires on ANY momentary empty snapshot
```

Any transient snapshot (re-render race, an intermediate composer state during insert, coordinate handling) that briefly lacks the occurrence deletes the record and its label from the cache even though the user still sees/holds the attachment. A rename decision based on that Map would then reuse a name that is still displayed/in the upload queue — producing two chips and two upload entries both called `paste_image.png`, exactly the bug being fixed. The live snapshot at rename time is the ground truth; the Map is a lossy, prematurely-pruned cache. (Fixing the too-eager retirement itself — e.g. requiring N consecutive empty snapshots or an explicit removal event — is a related hardening, but the rename source should be the composer state either way.)

Also note: `validateItems` only checks duplicates inside one batch (`const paths = new Set(); if (paths.has(item.path)) throw`), so it can never catch a cross-paste collision today; after renaming, the in-batch set must be seeded/updated with the renamed names.

## 2. Extension rule and displays (unscored guidance)

**Extension rule:** keep the original file extension from the pasted blob's name when present (`image.png` → `paste_image.png`; a pasted `report.pdf` → `paste_file.pdf`). Only when the clipboard name has no usable extension, fall back to the MIME type (`image/jpeg` → `jpg`, `application/pdf` → `pdf`, via a MIME→ext map; unknown MIME → no extension). Never re-derive the extension for dropped/picked files — their real names stay untouched.

**Dock chip** shows the renamed `label` — per the excerpt, `h('span', { className: 'dshca-name' }, record?.label ?? occurrence.label)` — so the user sees `paste_image(2).png`, not the browser's `image.png`. The **uploaded path** (upload body: `files: record.items.map(item => ({ path: item.path, ... }))`) must carry the same renamed path; displaying one name and uploading another would break the composer's occurrence identity. I.e., rename once at acquisition, write it into the record/label and item path, and both surfaces show the identical value.

## 3. Follow-up B root cause (version chip)

**Root cause: the GitHub API response was a stale CDN cache.** tags-api-response.txt, captured ~90s after pushing v0.2.11 (which exists per `git ls-remote`), shows `x-cache: HIT`, `age: 178`, and `cache-control: ... s-maxage=300` — the API served a cached tags page that predates both v0.2.10 and v0.2.11 (`jq` lists only v0.2.9, v0.2.8, v0.2.7). So `latestFromTags()` legitimately returned `v0.2.9` as the newest stable tag.

The chip then mislabeled that stale value: `renderCurrentChip(tag)` sets `lbl.textContent = '✓ attach-input already the latest version ' + tag` — it prints the **fetched** tag as if it were the newest release. The comparison `semverCmp(tag, PLUGIN_VERSION) <= 0 → renderCurrentChip(tag)` is correct as a gate (v0.2.9 <= 0.2.10 means "you are current"), but the text wrongly asserts that v0.2.9 is the latest version, which the code does not actually know during a cache window ("A while later it changed its mind").

**Display rule instead:** compare the two values — the fetched latest stable tag vs. the locally known running `PLUGIN_VERSION` (hand-inlined 0.2.10). Then **show the running version, not the fetched tag, in the green "current" chip**: e.g. "✓ attach-input v0.2.10 is up to date". The locally-known running version is the only ground truth available client-side; a cached remote value must never be presented as ground truth next to it. If the fetched tag is greater, render the update chip with that fetched tag ("update available: v0.2.11") — there the fetched value is the informative one and staleness only ever under-reports, never misleads. Optionally suppress the "latest" claim when the response shows cache evidence, or treat "fetch returned <= running" as "no update known" rather than asserting "latest".

## 4. Regression tests that would have caught both

**Follow-up A:**
- Paste three screenshots (all named `image.png`, one batch and three separate pastes) → labels `paste_image.png`, `paste_image(2).png`, `paste_image(3).png`; upload body paths match the labels.
- Paste a non-image (`paste_file.pdf` scheme) and a nameless/MIME-only blob (extension fallback, e.g. `image/jpeg` → `paste_image.jpg` / file branch `paste_file.jpg`).
- Drag-and-drop and picker files keep real names, including names that literally collide with the paste scheme (a dropped `paste_image.png` is not renamed, and if a pasted `paste_image.png` already exists, the *paste* gets (2), not the drop).
- Cross-paste collision: after records for a first paste have been retired by the subscription's premature `records.delete(ref)` (simulate a momentary empty snapshot while the occurrence is still live), a second paste must still not reuse `paste_image.png` — this directly encodes item 1's "authoritative source" requirement.
- Cross-batch duplicate detection (today's `validateItems` only covers one batch).

**Follow-up B:**
- Unit-test `startUpdateChip` with a stubbed fetch returning the stale tag list `['v0.2.9','v0.2.8','v0.2.7']` while `PLUGIN_VERSION = '0.2.10'` → the chip must render "up to date v0.2.10" (running version) and must NOT contain the string "v0.2.9". This exact test fails on the current code, which prints the fetched tag.
- Fetch returning a newer tag (v0.2.11 > 0.2.10) → update chip shows v0.2.11.
- Fetch timeout/failure/non-ok (`AbortSignal.timeout(8000)`, `res.ok` false) → offline chip, no false "latest" claim.
- Version-regex filter: pre-release/odd tags (`v1.0.0-rc.1`, `foo`) excluded by `/^v\d+\.\d+\.\d+$/`.

## 5. Lib-only release hygiene

- **Hand-inlined version constants:** `const PLUGIN_VERSION = '0.2.10'` lives in the lib-only bundle and "must be kept in sync with package.json at every release" (plugin-version-chip.js comment). With no build step there is no compile-time injection, so each release needs a check that the inlined constant equals package.json `version` (a release script or a lint/CI assertion over the shipped lib), or the chip compares against the wrong running version — the comparison gate itself becomes a lie.
- **Bundle syntax check:** since the lib ships as-is to browsers with no bundler/transpiler to catch mistakes, every edit (the rename logic, chip text change) must be followed by a syntax check of the shipped file (e.g. `node --check lib/client.js` or parse-in-browser smoke) so a stray non-plain-JS construct doesn't ship a dead bundle.
- **How users actually get the update:** the plugin is client-only with "no host-side update endpoint" — the chip's fetch is informational only; nothing installs anything. Users receive updates only by re-copying/re-installing the new lib bundle into their DSH setup themselves (pull the new release and replace the file), then hard-refreshing. So the chip must be honest (item 3) precisely because it is the only update signal, and the rename fix ships as a new tag/bundle that existing v0.2.10 users will not get until they manually update — no server-side force-update path exists.
