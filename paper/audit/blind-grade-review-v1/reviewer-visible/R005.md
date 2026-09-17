# S10 Diagnostic Report · Paste Renaming & Version-Chip Follow-Ups

Plugin under review: `@org/dsh-attach-input` v0.2.10 (lib-only client bundle, no build step). Evidence: `fixture/plugin-attachment-flow.js`, `fixture/plugin-version-chip.js`, `fixture/user-threads.md`, `fixture/tags-api-response.txt`. Read-only diagnosis; no fixture files were modified.

## 1. Renaming design for the paste path

**Exact scheme.** For files acquired via the paste path only:

- Images → `paste_image.png`, `paste_image(2).png`, `paste_image(3).png`… (first file gets no suffix).
- Non-images → `paste_file.<ext>`, `paste_file(2).<ext>`… with the same numbering.

**Where the rename applies — and what stays untouched.** The paste, drop, and picker paths all funnel into `add()` (comment at the top of `plugin-attachment-flow.js`: "The paste path, the drop path, and the file/folder picker all funnel into add()"), so the rename must NOT live inside `add()` unconditionally. It must be applied on the paste acquisition path only, before records are created — e.g. each pasted `item` gets a renamed display label/path when it is produced by the clipboard handler, and the renamed result then flows through `add()` unchanged. The drop path and the file/folder picker must keep their real names: kaylint's issue says explicitly "keep the real names when I drag files in or use the picker — those are my actual files." Today `add()` keeps `item.path` verbatim (`const label = item.path; // ← pasted "image.png" stays "image.png"`), which is the behavior being fixed only for paste.

**How the number is chosen and the authoritative "taken" source.** The counter must be computed against the authoritative set of names already in use in the live composer state — the input's snapshot of current occurrences/labels (e.g. `input.state.getSnapshot()` / `occurrences`) plus the names already assigned earlier in the same batch — taking the smallest free `n` for `paste_image(<n>).png`. What it must NOT be is the plugin-side `records` Map:

- `records` is a module-level `Map<ref, record>` that only contains items this plugin instance added in this page lifetime.
- Its per-ref subscription retires entries whenever a snapshot momentarily shows no occurrences: the code checks `const alive = current.occurrences.some(o => o.source === SOURCE && o.ref === ref); if (alive || record.inflight !== undefined) return; ... records.delete(ref);` and the comment marks the hazard directly: `// ← fires on ANY momentary empty snapshot`. During composer re-renders, swaps, or an in-flight state transition the snapshot can transiently list zero occurrences, so a still-live record is deleted and its label is forgotten.
- Consequences of using `records` as the conflict source: (a) names retired by a transient snapshot can be re-issued, producing real duplicates; (b) names never in `records` at all (attachments added by other plugins, another tab, or restored session state) are invisible, so `paste_image.png` could collide with an existing occurrence; (c) a page refresh empties `records` entirely while the composer still shows prior attachments. The composer/input snapshot is the state the upload actually consumes, so it — not a lossy local cache — is the authoritative "names already taken" source.

The existing in-batch duplicate check in `validateItems` (`if (paths.has(item.path)) throw new Error(`Duplicate attachment path: ${item.path}`)`) only guards one selection batch — the maintainer note confirms "Two pastes of two screenshots both carry 'image.png'" — so it stays as a final assertion but never as the numbering source.

## 2. Extension rule and display surfaces (unscored guidance)

- Extension: derive it from the pasted file's original name when it has a usable extension (`image.png` → `.png`; `.pdf` → `paste_file.pdf`). When the clipboard name has no extension, fall back to the MIME type (`image/jpeg` → `.jpg`, `application/pdf` → `.pdf`); unknown MIME → no extension. The image-vs-file branch keys off the MIME type (`image/*`), not the name.
- Dock chip: shows the renamed label (`paste_image(2).png`) — the chip renders `record?.label ?? occurrence.label`, so `record.label` must carry the renamed value.
- Upload path: the upload body sends `files: record.items.map(item => ({ path: item.path, ... }))`, so `item.path` must be the renamed path too — otherwise the chip and the uploaded filename diverge.

## 3. Follow-up B root cause: the chip trusted a stale cached tag list

**What happened.** `latestFromTags()` fetches `https://api.github.com/repos/org/dsh-attach-input/tags?per_page=10` and treats the highest stable tag it sees as ground truth. The captured response in `tags-api-response.txt` (taken ~90 seconds after pushing v0.2.11) shows the failure mode:

- `cache-control: private, max-age=60, s-maxage=300`, `x-cache: HIT`, `age: 178` — the response was served from a cache whose copy was 178 seconds old, and the shared copy can stay stale up to 300 s (plus 60 s browser-side).
- The tag list returned only `v0.2.9`, `v0.2.8`, `v0.2.7` — both v0.2.10 and v0.2.11 are absent because the cached page predates both pushes.
- `git ls-remote --tags origin` in the same capture shows the truth: `refs/tags/v0.2.10` and `refs/tags/v0.2.11` both exist.

So the user on v0.2.10 got `tag = v0.2.9`, the comparison `semverCmp('v0.2.9', '0.2.10') <= 0` was true, and `renderCurrentChip(tag)` rendered the green "already the latest version v0.2.9" — displaying a fetched-but-stale tag as if it were the latest release. `age: 178` / `x-cache: HIT` is the direct evidence that the API response was a cache hit predating both pushes; rho_9's "a while later it changed its mind" matches the cache expiring.

**Display rule the chip should follow.** The two values to compare are: (1) the locally known running version — the hand-inlined `PLUGIN_VERSION` ('0.2.10') — and (2) the fetched latest tag. The chip must always display the **running version** when it concludes "already latest," never the fetched tag: `'✓ attach-input already the latest version ' + PLUGIN_VERSION`. The fetched tag is only a hint for comparison; when the comparison says current, the only version the user can verify is the one actually running. (Additionally: a fetched list that looks stale — its newest entry ≤ the running version while the running version itself is missing from the list — is weak evidence and could be treated as "can't confirm," but the minimal correct fix is displaying the running version in the current-state chip.)

## 4. Regression tests that would have caught both

**Follow-up A (renaming):**
1. Paste three screenshots in one batch → labels `paste_image.png`, `paste_image(2).png`, `paste_image(3).png`; paste three non-images → `paste_file.pdf`, `paste_file(2).pdf`, … (asserts the scheme and per-batch counter).
2. Paste one screenshot, then a second paste after the first is settled → second gets `paste_image(2).png` (cross-batch numbering works).
3. Drop a file named `report.pdf` and pick `photo.png` via the file/folder picker → both keep their real names (paste-only scoping; this test would have failed if the rename were implemented inside unscoped `add()`).
4. Pre-seed the composer snapshot with an occurrence already named `paste_image.png`, then paste → new file becomes `paste_image(2).png` (proves numbering reads the authoritative snapshot, not the plugin records cache).
5. Transient empty snapshot: insert a paste, then emit a snapshot with zero occurrences while the record is still live → the record's label survives for numbering purposes / the retirement does not free its name for reuse (directly regresses the `// ← fires on ANY momentary empty snapshot` deletion).
6. Paste a file whose clipboard name has no extension with MIME `image/jpeg` → `paste_image.jpg` (MIME fallback), and assert the dock chip label equals the upload body's `path` (chip/upload consistency).

**Follow-up B (version chip):**
1. Stub the tags API to return a list whose newest tag is **older** than the running version and that does not contain the running version (replay the exact `tags-api-response.txt` payload: v0.2.9/v0.2.8/v0.2.7 while running 0.2.10) → the chip must render green with the **running** version "0.2.10", never the fetched "v0.2.9". This single test reproduces rho_9's report verbatim.
2. Same stale payload but with a hypothetical newer remote tag absent → still no false "update available" flip-flop when the cache later catches up ("a while later it changed its mind").
3. Fetch fails / times out / non-200 → offline chip renders and no version claim is made (the `if (!tag)` path).
4. Remote newest tag strictly greater than running → update chip shows that tag; remote equals running → green chip shows the running version (comparison matrix, asserting both branches display the right value).
5. Response-header hygiene test: a payload served with `age > 0`/`x-cache: HIT` is treated the same as a normal one — i.e. the code's correctness must not depend on cache freshness (documents the accepted staleness rather than encoding it).

## 5. Lib-only release hygiene touched by both follow-ups

- **Hand-inlined version constants.** `lib/client.js` keeps `const PLUGIN_VERSION = '0.2.10';` with the explicit comment that it "must be kept in sync with package.json at every release." Both fixes ship in the same bundle as the next release, so the new bundle must inline the new version (e.g. '0.2.12'), and — because there is no build step to derive it — the release procedure needs a mechanical check that `PLUGIN_VERSION` equals `package.json`'s version (a grep/diff step in the release checklist, or a tiny check script run before tagging). Chip tests that assert "the green chip shows the running version" should read the constant from the bundle, keeping the sync requirement enforced.
- **Bundle syntax check.** With no transpiler, whatever is hand-edited into `lib/client.js` ships as-is; the release gate must run a syntax/parse check on the bundle (e.g. `node --check lib/client.js`) so a hand-edit typo cannot ship a dead client. Any browser-API-only code paths (clipboard `DataTransfer`, `AbortSignal.timeout`) should additionally be smoke-checked in a real page, since `node --check` only proves parsing.
- **How users actually receive the update.** The plugin has no host-side update endpoint: the only update signal is this same client chip comparing against the GitHub tags API, and the user updates manually. That closes the loop on Follow-up B: the chip is not cosmetic — for the v0.2.10 population it is the *only* mechanism that can tell them v0.2.11+ exists, so the stale-cache false "latest" directly suppressed the entire update funnel. Mitigations to consider alongside the display fix: cache-bust the tags request (`?per_page=10&_=${Date.now()}` is only partially effective behind `s-maxage`; a cache-safe endpoint or comparing against the running-version-missing heuristic is stronger), and lengthen/keep the chip visible rather than auto-dismissing after 4 s when an update is genuinely available.
- **Tag-push-to-visibility window.** Even after the fixes, users cannot see a new release until (a) the GitHub/CDN cache expires (`s-maxage=300`) and (b) they hard-refresh the page so the client bundle and its chip re-run. Release notes should not promise instant chip updates; the maintainer's "minutes after I pushed" expectation must account for that window.
