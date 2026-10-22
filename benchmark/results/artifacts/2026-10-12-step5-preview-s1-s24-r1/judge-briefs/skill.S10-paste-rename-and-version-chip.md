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
#### FILE: S10-paste-rename-and-version-chip/report.md

# S10 · Paste Renaming & Version-Chip Follow-Ups — Report (read-only task)

Subject: `@org/dsh-attach-input` v0.2.10 (community Web plugin, lib-only `lib/client.js`, no build step).
Evidence: `fixture/plugin-attachment-flow.js`, `fixture/plugin-version-chip.js`, `fixture/user-threads.md`, `fixture/tags-api-response.txt`.
Scope: fixture untouched; diagnosis + design + regression plan only.

---

## 0. Summary of the two defects

| Follow-up | Defect | One-line root cause |
|---|---|---|
| A | All pasted files keep the clipboard's synthetic name (`image.png`) | `add()` copies `item.path` verbatim into the label (flow:24) and applies no unified renaming on the paste path; the only conflict check is the in-batch duplicate guard (flow:5–15) |
| B | Green chip showed "already the latest version **v0.2.9**" on a v0.2.10 client minutes after pushing v0.2.11 | (i) the chip trusted a **CDN-cached** GitHub tags page (`x-cache: HIT`, `age: 178`, `s-maxage: 300`) whose body predates both pushes as ground truth for "latest", and (ii) the green chip renders the **fetched** tag (chip:27), not the locally-known running version, so a value *older* than what the user runs gets displayed as "latest" |

---

## 1. Follow-up A — unified renaming design (scored)

### 1.1 Naming scheme

Class is decided by the pasted file's MIME type (`file.type` starts with `image/`; if `type` is empty, by a known image extension).

| Class | Pattern | Examples |
|---|---|---|
| pasted image | `paste_image.<ext>`, then `paste_image(2).<ext>`, `paste_image(3).<ext>`, … | `paste_image.png`, `paste_image(2).png`, `paste_image(3).png` |
| other pasted file | `paste_file.<ext>`, then `paste_file(2).<ext>`, `paste_file(3).<ext>`, … | `paste_file.pdf`, `paste_file(2).pdf` |

Numbering rule: the first item with a free name carries **no** suffix; every further collision appends `(<n>)` with `n` starting at **2** and increasing. The extension is shared per base (`paste_image(2).jpg` keeps the first item's class extension rule) — see §2.

The scheme applies to **every** paste-acquired file (screenshot or real file copied from the filesystem) — that is what "unified" means in the issue; the acquisition path, not the name quality, decides.

### 1.2 Where the rename is applied (and what stays untouched)

`add()` is the funnel for three acquisition paths: paste, drag-and-drop, file/folder picker (flow:3). The rename must be scoped to **the paste path only**, and must run **before** `validateItems()` sees the paths:

- Tag each item with its acquisition origin at the event handler that creates it (`origin: 'paste' | 'drop' | 'picker'`), and call one helper on the paste entry: `renamePasted(items, takenNames)`, which returns new `File` objects carrying the new names (`new File([item.file], newName, { type: item.file.type })`). Renaming the `File` itself — not just the display label — keeps the dock chip, the `record.label`, and the upload payload (`record.items.map(item => ({ path: item.path, ... }))`, flow:44) in agreement by construction.
- **Must run before `validateItems()`** (flow:18): two pastes of clipboard `image.png` in one paste event both carry `image.png`; if validation saw the raw names it would throw `Duplicate attachment path` (flow:11). Post-rename the two items are `paste_image.png` / `paste_image(2).png`, so the in-batch guard still does its real job on the drop/picker paths.
- Alternatively an explicit signature `add(sessionId, items, { origin })` with the rename branch gated inside — but it must still happen before validation. Both are fine; gating by **origin**, never by filename content, is the invariant.

Untouched paths (hard requirement from the issue):

- **Drag-and-drop** items: `item.path` stays verbatim (`report.pdf` stays `report.pdf`); no numbering is injected.
- **File/folder picker** items: verbatim as well.
- `validateItems()` itself: unchanged, still the in-batch duplicate guard for the real-name paths.
- The `ref`/`source` identity of occurrences, `insertReference`, and the record shape: only the **name** changes on the paste path.

### 1.3 How the number is chosen

For each pasted item in arrival order, take its base (`paste_image` / `paste_file`) + extension, then pick the smallest `n ≥ 2` for which `base + (n === 1 ? '' : '(' + n + ')') + ext` is **free** — i.e. not in the taken set (§1.4) and not already allocated earlier in the same paste batch. The first item with a free name gets the bare `base.ext`; collisions get `(2)`, `(3)`, …

### 1.4 The authoritative "names already taken" source

**The live composer occurrence snapshot for the session** — i.e. `input.state.getSnapshot().occurrences` filtered to `o.source === SOURCE` (this plugin's own attachments), using their display labels — unioned with the names already allocated earlier in the current paste batch. The dock chip's label source is exactly that (flow:44), so the numbering source and the displayed-name source agree; cross-session names are irrelevant because occurrence state is per session.

**Why the plugin-side `records` Map alone is the wrong source** (flow:26, 36): `records` is an optimistic mirror maintained by the alive-subscription at flow:30–38. That subscription retires an entry on **any** snapshot that momentarily shows no occurrence for the ref — `const alive = current.occurrences.some(o => o.source === SOURCE && o.ref === ref); if (alive || record.inflight !== undefined) return; unsubscribe(); records.delete(ref)` — with no confirmation pass, debounce, or re-check on the next snapshot. Composer state transitions (batched updates, re-keyed snapshot objects, a snapshot published before occurrences land) can therefore show an empty `occurrences` array while the attachment is still attached. Consequences for a records-only conflict source:

1. **Under-reports** (the dangerous direction): an attachment that is still alive has just been deleted from `records`, so its name looks free → the next paste allocates the same name again → two dock chips named `paste_image.png` and, later, two uploads with identical paths.
2. **Over-reports** (noise direction): `records` also holds entries whose occurrence is already gone but whose subscription callback has not fired since (deletion is event-driven, not state-driven) → the counter skips numbers it need not skip.

So `records` must be treated as a **non-authoritative hint only**: the taken set is computed from the live occurrence snapshot (ground truth for what the session actually holds right now), with `records` — including just-inserted refs whose occurrence has not surfaced in a snapshot yet — consulted only to catch names that are in-flight inside the current `add()` loop.

Side note that must be fixed alongside (it changes what users see): the dock chip falls back to `occurrence.label` when the record is gone (flow:44). If the rename lives only on `record.label`, a premature records retirement (flow:36) makes the chip revert to the raw clipboard name. Mirroring the renamed name into the inserted occurrence (and/or making the subscription re-check before deleting) keeps `paste_image(2).png` on screen.

---

## 2. Extension rule and what the dock / upload show (guidance, not scored)

Extension resolution per pasted item, in order:

1. If the original clipboard name carries a usable trailing extension (`image.png` → `png`; sanitized to a short `[a-z0-9]{1,8}` run), use it — lowercased.
2. Else fall back to a MIME→extension map on `file.type` (`image/png`→`png`, `image/jpeg`→`jpg`, `application/pdf`→`pdf`, …).
3. Else default by class: images → `png`, other files → `bin`.

Tie-break when both exist and disagree (name says `.png`, bytes are `image/jpeg`): prefer the MIME-derived extension, since `file.type` reflects the real bytes and is what a server will sniff anyway.

What each surface must display: **both the dock chip and the uploaded path must display the renamed unified name** (`paste_image(2).png`) — because the `File` was renamed at acquisition, `record.label`, `occurrence.label`, and `record.items[].path` all carry the new name by construction. The original clipboard name (`image.png`) must never be displayed once renamed; drop/picker items display their real names in both places. The extension rule above only decides the suffix after `paste_image` / `paste_file`.

---

## 3. Follow-up B — version-chip root cause and display rule (scored)

### 3.1 Why the chip showed an older tag as "latest" minutes after the push

Chain of two independent faults, both visible in the fixture:

1. **The "latest" source was a stale HTTP cache, treated as ground truth.** `latestFromTags()` (chip:7–16) fetches `api.github.com/…/tags?per_page=10` and takes the page's max stable tag (`^v\d+\.\d+\.\d+$` filter, `semverCmp` reduce) as *the* latest. The captured response (`tags-api-response.txt:5–14`) is a **cache hit in front of the API**: `cache-control: private, max-age=60, s-maxage=300`, `x-cache: HIT`, `age: 178` — the body was composed 178 s earlier and, per line 14, **predates both the v0.2.10 and v0.2.11 pushes**; its max stable tag is `v0.2.9`. Meanwhile `git ls-remote --tags origin` (lines 16–18) — the non-cached, authoritative view — proves `v0.2.10` and `v0.2.11` exist. So the chip's "latest" was `v0.2.9` while newer tags were already on the remote. ("A while later it changed its mind" is exactly the `s-maxage=300` CDN entry expiring: the next poll got the fresh listing and the chip flipped to update-available — a timing fingerprint, not a code path that recovered.)
2. **The green "already latest" chip renders the fetched value, not the locally-known running version.** The comparison is fine — `semverCmp(tag, PLUGIN_VERSION) <= 0 → renderCurrentChip(tag)` (chip:21) correctly concluded "running ≥ advertised". But `renderCurrentChip` (chip:25–28) prints the **fetched** tag: `'… already the latest version ' + tag`. With a stale page the displayed value is `v0.2.9` — a version *older than the code the user is actually running* — presented as "the latest". A remote, cache-contaminated, possibly-older-than-local value was used as the displayed ground truth next to a locally-known running version (`PLUGIN_VERSION`, hand-inlined at chip:5), which is the one value that can never be stale about what the user runs.

### 3.2 Display rule the chip must follow

Two values exist; they answer different questions and must not be conflated:

- **`PLUGIN_VERSION`** — the locally-known running version. Authoritative for *what the user is running* and therefore for the green chip's text. Cannot lie by staleness.
- **fetched max stable tag** — a cached, advisory remote claim about *what may exist*. Never authoritative when it disagrees with the local value.

Rule:

- Compare `fetched` vs `PLUGIN_VERSION` (`semverCmp(fetched, PLUGIN_VERSION)`), as today.
- **`fetched <= running` → green "already latest" chip showing `PLUGIN_VERSION`** (`v<running>`, i.e. the running version is what gets displayed). Never render the fetched tag in this state — an advertised value older than the running code must not be shown as "latest".
- **`fetched > running` → update chip showing `fetched`.** The fetched tag is displayed only in the strictly-newer direction, where it is a forward claim about something the user could install.
- Effective-latest clamp for any downstream logic: `max(running, fetched)`.
- Hardening the input, not just the display: (a) the tags request must bypass intermediary caching — append a unique nonce to the query string (the cache key is the URL) and/or `cache: 'no-store'`, since the fixture proves a shared cache (`x-cache: HIT`, `s-maxage=300`, `age: 178`) sits in the path; (b) treat a listing that cannot possibly be fresh — empty result, or a max stable tag *older* than `PLUGIN_VERSION` (a new release cannot push the repo's newest tag backwards) — as **unknown**, not as truth: render the offline/neutral chip and re-check on the next tick instead of claiming "already latest".

---

## 4. Regression tests that would have caught both before release (scored)

### Follow-up A (paste renaming)

1. **`paste_unified_labels`** — paste event with 3 `File`s all named `image.png` (`image/png`) → labels/paths must be `paste_image.png`, `paste_image(2).png`, `paste_image(3).png`; assert the upload payload paths (`record.items[].path`) and the dock chip text equal the renamed names. *(Would have failed: all three were `image.png`.)*
2. **`paste_mixed_classes`** — paste `image.png` + `doc.pdf` + `note(no ext, text/plain)` + second `doc.pdf` in one event → `paste_image.png`, `paste_file.pdf`, `paste_file.txt` (MIME fallback), `paste_file(2).pdf`; also asserts one paste event containing two clipboard `image.png` does **not** throw `Duplicate attachment path` (rename precedes `validateItems`).
3. **`numbering_follows_live_occurrences`** — attach `paste_image.png`, then paste another `image.png` in a later event → second is `paste_image(2).png`; remove/clear the first occurrence (snapshot without it) and paste again → `paste_image.png` (the name is genuinely free again). Pins the live-occurrence source as the conflict source.
4. **`momentary_empty_snapshot_does_not_free_names`** — after attaching `paste_image.png`, drive the subscription through a snapshot where `occurrences` is momentarily `[]` (state transition, no actual removal) and then paste again → must still be `paste_image(2).png`; and the first item's dock chip must still render `paste_image.png` (occurrence-label fallback carries the renamed name). *(A records-cache-only implementation returns `paste_image.png` here — the fragile-retirement trap at flow:36.)*
5. **`drop_and_picker_keep_real_names`** — drop `report.pdf` + `screenshot.png`, pick `invoice.pdf` → labels/paths verbatim, no `paste_*` prefix, no numbering; two picker items with the same real name still throw the in-batch duplicate error (guard unchanged off the paste path).

### Follow-up B (version chip)

6. **`current_chip_shows_running_version`** — `PLUGIN_VERSION = '0.2.10'`, stub `fetch` to return the captured stale page (max stable `v0.2.9`) → assert the green chip text contains `v0.2.10` and **not** `v0.2.9`, and no update state is rendered. *(Would have failed on the shipped code: "v0.2.9".)*
7. **`update_chip_shows_fetched_when_newer`** — `PLUGIN_VERSION = '0.2.10'`, stub returns `v0.2.11` (+ `git ls-remote`-matching fixture) → assert the chip goes to the update state and names `v0.2.11`; the fetched value is shown only in the strictly-newer direction.
8. **`implausible_listing_is_unknown_not_latest`** — stub returns an empty stable list, and a variant returning a max stable tag older than `PLUGIN_VERSION` → assert the neutral/offline chip + re-check, never a green "already latest" naming a stale value.
9. **`tags_fetch_is_cache_busted`** — assert the tags request carries a per-poll unique query parameter (and/or `cache: 'no-store'`), so an intermediary CDN entry (the `age: 178 / s-maxage: 300` path proven in the fixture) cannot serve a pre-release page.
10. **`shipped_bundle_version_matches_manifest`** — read the shipped `lib/client.js` artifact and assert the inlined `PLUGIN_VERSION` equals `package.json`'s `version`; plus `node --check lib/client.js` and "no top-level `import` token" as the bundle gate. *(Catches the build-before-bump trap: a bundle built before the version bump ships the old constant and the chip immediately reports "update available" pointing at the tag just pushed — see §5.)*

---

## 5. Lib-only release hygiene items this touches (scored)

- **Hand-inlined version constants (no build step to keep them honest).** `PLUGIN_VERSION` lives at chip:5 and "must be kept in sync with package.json at every release". Release order must be: **bump `package.json` → update the inlined constant in the shipped `lib/client.js` → `grep` the artifact to prove `PLUGIN_VERSION = '<new>'` → only then commit/tag/publish.** The inverse order (build/edit, then bump) ships a bundle carrying the *old* constant; the chip then compares the stale local constant against the freshly published tag and immediately tells every user "new version vX.Y.Z available" pointing at the release they just installed. Ideally the constant is derived from `package.json` (sed/one-line inject at pack time) and equality is asserted by test 10 in CI, so it cannot drift by hand.
- **Bundle syntax / shape check as a release gate.** This is a classic-script client bundle registered through `window.__ModuleLoader__.load({ id, factory })`: run `node --check lib/client.js` before tagging, and keep the bundle free of top-level `import`/`export` tokens — a single raw ESM token in one plugin's bundle fails the *whole* classic-script bundle combo at compile time (zero plugins register). Confirm the registration id equals the package.json `name`. Since there is no build step, "the bundle" is the checked-in file itself, so this check substitutes for the build-stale-cache trap that build-producing plugins suffer.
- **How users actually receive the update — there is no host-side update endpoint.** The chip is **advisory only**; it cannot and must not update anyone. The delivery path is: chip names the target tag → user runs the pinned install into their profile (`dsh plugin add @org/dsh-attach-input@0.2.11` — an exact version/tag, never a bare `latest` which can drift) → the client half lands on a browser **hard refresh** (a `lib/client.js` change takes effect on refresh; only host-half changes would need a dsh restart, and this plugin has none). Corollaries: (a) npm publish can lag the GitHub release (a transient E404 window on the tag), so the chip/tag coordinate to advertise should be verified against the registry when it drives an install command, and the GitHub tags listing is not the install authority — the package manager is; (b) tell users plainly that the green chip's displayed version is their *running* version and that an update chip means "run the pinned install for this tag", then hard-refresh — which is also the fix for both halves of follow-up B's confusion.

---

## 6. Blockers / notes

- Fixture was used read-only as instructed; no migrations or installs were executed. No files outside `fixture/`, `agent-output/`, and `skills/plugin-upgrade/` were opened.
- The plan-level change to `lib/client.js` (origin-tagged items, `renamePasted`, occurrence-sourced taken-set, subscription re-check before retirement, chip display rule + cache-busted tags fetch) is described here only; per the skill's read-only discipline for this task, no source edits were made.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.