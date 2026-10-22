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

# S10 — Paste Renaming & Version-Chip Follow-Ups: Design & Remediation Report

Plugin: `@org/dsh-attach-input` (lib-only, no build step) · Reported against: v0.2.10 · Target fix: v0.2.11
Evidence: fixture pack only (`plugin-attachment-flow.js`, `plugin-version-chip.js`, `user-threads.md`, `tags-api-response.txt`, `README.md`). Read-only; nothing in the fixture was modified. No repository files, skills, solutions, or tests were consulted.

---

## 1. Renaming design (Follow-up A)

### 1.1 Naming scheme (paste acquisitions only)

- **Class selection** (per item): `file.type` starting with `image/` → stem `paste_image`; anything else → stem `paste_file`. If `file.type` is empty, infer from the original name's extension against the known image extensions, else default to `paste_file`.
- **Final names**: `paste_image.png`, `paste_image(2).png`, `paste_image(3).png`, … for images; `paste_file.<ext>`, `paste_file(2).<ext>`, … for everything else pasted (extension rule in §2).
- **Number rendering**: `n = 1` carries **no** suffix; `n ≥ 2` uses the Windows-style copy-conflict form `(n)`. This is exactly the pattern the issue requests.
- **Numbering scope**: one shared sequence per stem + extension (i.e., among names that could actually collide). All pasted PNG screenshots share `paste_image.png`, `paste_image(2).png`, …; a pasted JPEG starts its own `paste_image.jpg` line only if it doesn't collide. Do **not** run a single class-wide counter across different extensions — it would produce skipped, confusing numbers (`paste_image(2).jpg`).

### 1.2 Where in the flow the rename must be applied

Today `add()` is a single funnel: paste, drag-and-drop, and the file/folder picker all call it, and it stamps `label = item.path` verbatim (plugin-attachment-flow.js:24). The rename must be applied **inside `add()`, gated on acquisition source, before `validateItems()`**:

1. Thread the acquisition source into `add(sessionId, items, { source })` (or provide `addFromPaste` / `addFromDrop` / `addFromPicker` wrappers that call it). Keep the logic in the funnel — not at the three call sites — so drop/picker cannot accidentally opt in.
2. At the top of `add()`, if `source === 'paste'`, map each item to a **derived copy** with a renamed final path: `{ ...item, path: renamedPath(item, takenSet) }` (never mutate the caller's items). Grow the batch-local taken set as each name is assigned, because the loop inserts records one at a time within a single `add()` call.
3. **Then** run `validateItems()` on the renamed batch, and proceed as today.

Why *before* validation: uniqueness must be established first. Today, two clipboard `image.png`s in one paste batch throw `Duplicate attachment path` at validateItems.js:11 — the rename makes the in-batch duplicate check operate on final, already-unique names, so that false failure disappears for pastes (and stays exactly as-is for drop/picker, whose real names can legitimately collide).

Apply the rename to the **item's `path` value itself**, not to a display-only label. Everything downstream reads that one value: `label` (→ dock chip, plugin-attachment-flow.js:24,44), `input.insertReference(...)`, and the upload body `files: record.items.map(item => ({ path: item.path, ... }))` (plugin-attachment-flow.js:45). One field, one truth — the chip and the uploaded path cannot desync.

**Paths that must stay untouched**: the drag-and-drop path and the file/folder picker path pass items through verbatim — real names preserved, existing in-batch duplicate check unchanged. Only `source === 'paste'` renames.

### 1.3 How the number is chosen

Derived, deterministic, nothing stored:

```
candidates(n): n === 1 → `${stem}.${ext}`      (paste_image.png)
               n >= 2 → `${stem}(${n}).${ext}`  (paste_image(2).png)
number = smallest n >= 1 whose candidate is not in the taken set
```

- **Self-healing**: if the user removes all pasted attachments, the next paste is `paste_image.png` again — no climb.
- **No stored counter**: a persisted counter is exactly the "plugin-side cache" anti-pattern of §1.4 — it either never retires (numbers climb forever) or retires wrongly (numbers repeat).

### 1.4 The authoritative "names already taken" source

**Source of truth = the live `records` Map, read synchronously at rename time** — specifically the final path of every live record for the session — **plus the names already assigned within the current batch**. Nothing else. (Host-composer occurrences are not a naming authority: the plugin owns the names of the attachments it creates; `occurrence.label` is only the dock's fallback when no record exists.)

**Why a plugin-side records/name cache is the wrong source:**

1. **It double-books truth against the dock.** The dock renders `record?.label` and the uploader sends `record.items[].path` (plugin-attachment-flow.js:44-45). The taken-name question is "what names are currently on screen and in flight" — the records Map *is* that set. Any second copy of it is a bug waiting to disagree.
2. **A mirror cache inherits the retirement fragility — and under-reports.** The records Map has an alive-subscription that retires an entry on **any single snapshot that momentarily shows no occurrences** (plugin-attachment-flow.js:30-38: `if (alive || record.inflight !== undefined) return; unsubscribe(); records.delete(ref)`). A transient empty-occurrences snapshot (composer re-render, coordinate transition) evicts a record that is still displayed. A cache that mirrors `records` then "forgets" a taken name, the next paste re-issues `paste_image.png`, and Follow-up A is back — the reported bug surviving the fix.
3. **A cache that doesn't retire over-reports forever.** Names leak: after removing all attachments the counter keeps climbing (`paste_image(9).png` on a clean sheet), and taken names bleed across sessions.
4. **The authoritative set itself must be hardened.** Because the taken-name derivation reads `records`, the retirement condition must be fixed as a corollary: don't retire on one momentary non-alive snapshot — require confirmation (two consecutive non-alive snapshots, or a short debounce, or retire only on explicit removal / session teardown). Otherwise even reading `records` live can under-count during transitions, and the same fragility bites any unrelated future consumer of the Map.

---

## 2. Extension rule, dock chip, and uploaded path (completeness guidance)

- **Extension, primary**: the pasted File's original name extension, when present (`report.pdf` → `pdf`; the browser's clipboard `image.png` → `png`).
- **Extension, fallback**: map `file.type` (MIME) when the name carries no usable extension — `image/jpeg→jpg`, `image/png→png`, `image/gif→gif`, `image/webp→webp`, `image/bmp→bmp`, `image/svg+xml→svg`, `application/pdf→pdf`, `text/plain→txt`, `text/html→html`, `application/zip→zip`, `video/mp4→mp4`, `application/octet-stream→bin`; unknown/empty MIME → no extension (bare stem), or class default `png` for a known-`image/*`-by-name item.
- **Paste-specific caveat**: browsers synthesize the name `image.png` for *every* clipboard image regardless of the real format. For `image/*` items where the MIME subtype maps to a known extension, prefer the MIME-derived extension (a copied JPEG must not upload as `paste_image.png`); the name's extension is the fallback when MIME is missing or unknown. This keeps §1's stem/extension sequence stable while not lying about content type.
- **Dock chip**: displays the final renamed path (`paste_image(2).png`). Achieved for free since the rename lands on `item.path` and the chip renders `record?.label ?? occurrence.label` with `label === item.path`.
- **Uploaded path**: the upload body must send the **same renamed path** (`files: [{ path: "paste_image(2).png" }]`). If the upload protocol carries both a storage `path` and a display `name`, both take the renamed value. A label-only rename (chip says `paste_image(2).png`, payload says `image.png`) is the desync the current two-field design invites and must not be the implementation.

---

## 3. Follow-up B root cause and the display rule

### 3.1 Root cause — two compounding defects

**Defect 1 — a cached remote value was treated as ground truth.** The chip's `latestFromTags()` (plugin-version-chip.js:7-16) derives "the latest release" as the max tag in whatever the HTTP response happens to contain. The captured response (`tags-api-response.txt`) shows GitHub served it from the CDN cache: `x-cache: HIT`, `age: 178`, `cache-control: private, max-age=60, s-maxage=300`. The cached page predates *both* pushes, so its body listed `v0.2.9, v0.2.8, v0.2.7` — v0.2.10 and v0.2.11 simply were not in it yet (the entry stays "fresh" for ~5 minutes). `git ls-remote --tags origin` in the same capture proves v0.2.11 existed ~90 seconds after the push: **the endpoint response was stale, not the repository**. The chip therefore "learned" that the newest existing tag was `v0.2.9`.

**Defect 2 — the render step substituted the fetched tag for the running version.** Given `semverCmp('v0.2.9', '0.2.10') <= 0` the code correctly concluded "this response contains nothing newer than what I'm running" — but then `renderCurrentChip(tag)` printed the **fetched tag** as the installed version: "✓ already the latest version **v0.2.9**" (plugin-version-chip.js:27). The only authority for "what version am I running" is the locally-known `PLUGIN_VERSION = '0.2.10'`; a remote tag list can never state what the user has installed. The chip thus asserted a false fact about the install and concealed the existence of v0.2.11.

The user's "a while later it changed its mind" is the CDN entry aging past `s-maxage=300` (or a fetch hitting a fresh edge): the next response contained v0.2.11, and the chip flipped to update mode. That detail confirms the first fetch was purely stale — the tag was never missing.

### 3.2 The display rule the chip should follow

- **The two values compared**: the **remote latest tag** (stable tags only, `v` prefix stripped, semver-compared — numerically, not lexically) versus the **locally-known running version** `PLUGIN_VERSION` (hand-inlined, kept in sync with `package.json` — §5).
- **Remote > local** → update chip naming the **remote tag** ("v0.2.11 available") plus an honest CTA (reload / repoint the plugin URL; this plugin has no host-side update endpoint to invoke).
- **Everything else** — remote ≤ local, no stable tags in the response, fetch failure, non-OK response, or the 8s abort timeout → the "up to date" chip renders **`PLUGIN_VERSION`, the locally-known running version**. The fetched tag must **never** be printed as the current version.
- Net rule: *a stale or failed remote can only withhold the update badge; it can never rewrite, downgrade, or contradict the version the user is provably running.* Cache-busting (`cache: 'no-store'`, a `Cache-Control: no-cache` request header, a timestamp query param) reduces the window but cannot be relied upon — the CDN honors `s-maxage` — so the display rule must be correct under staleness regardless.

---

## 4. Regression tests that would have caught both follow-ups

### Paste / renaming (would have caught A)

1. **Multi-paste session**: paste three screenshots (one batch or three) → chips *and* upload payload paths are exactly `paste_image.png`, `paste_image(2).png`, `paste_image(3).png`.
2. **Cross-call numbering** (the reported repro): paste one screenshot per `add()` call → the second is `(2)` — proves uniqueness is derived from live records, not the in-batch `validateItems` set that shipped with the bug.
3. **In-batch paste no longer throws**: two `image.png` files in one paste batch do not raise `Duplicate attachment path` and land as `paste_image.png`, `paste_image(2).png` (rename precedes validation).
4. **Non-image paste + MIME fallback**: pasted `report.pdf` → `paste_file.pdf`; clipboard file with extensionless name and MIME `application/pdf` → `paste_file.pdf`; unknown MIME → `paste_file`.
5. **Scope guard — drop untouched**: drag-and-drop `Screenshot 2026-10-12.png` → chip and upload path keep the real name verbatim; file/folder picker selections likewise, with only the in-batch duplicate check applying.
6. **Self-healing numbering**: paste three, remove all three from records, paste again → `paste_image.png` (no monotonic counter).
7. **Label/path parity**: for every attachment, dock chip label === upload payload path (guards the `label` vs `item.path` desync).
8. **Collision with a real name**: a dropped file literally named `paste_image.png` is live, then paste an image → pasted one becomes `paste_image(2).png`; the dropped file is never renamed.
9. **Taken-source stability**: while a record is alive, feed a transient `occurrences: []` snapshot followed by a real one — the record must survive retirement; then the next paste must still number against the full live set.

### Version chip (would have caught B)

10. **Stale-cache incident repro**: mock the tags endpoint returning HTTP 200, `x-cache: HIT`, max tag `v0.2.9`, while running 0.2.10 → the "up to date" chip displays **0.2.10** and its text must **not** contain `0.2.9`.
11. **Fresh push**: tags max `v0.2.11` > running 0.2.10 → update chip shows `v0.2.11` and offers the reload/repin CTA.
12. **Failure modes**: non-OK (500 / 403 rate limit), network error, and the 8s abort timeout → neutral/offline chip, no "latest" claim, no exception.
13. **Comparison units**: `semverCmp` on (a) `v`-prefixed vs bare (`v0.2.9` vs `0.2.10`), (b) numeric ordering `0.2.9 < 0.2.10` (lexical string compare would invert this and would have rendered an "update to v0.2.9" badge instead), (c) prerelease tags (`v0.3.0-beta`) excluded by the stable filter, (d) equal versions → up-to-date chip with the local version.
14. **Constant sync**: the `PLUGIN_VERSION` literal in the bundle equals `package.json` `version` at test time (§5).

---

## 5. Lib-only release hygiene items this touches

1. **Hand-inlined version constant.** With no build step there is no substitution of `PLUGIN_VERSION`; the literal in `lib/client.js` is the ship's only statement of its own version (and per §3.2 it is now load-bearing for correctness, because the bump must never inflate a version claim by fetching). Add an automated guard — a pre-release test/script that reads `package.json` and asserts the bundle's literal matches — and wire it into CI plus the release checklist, since "remember to edit the constant" is precisely the step humans skip. This release cycle ships 0.2.11 with the chip fix and the constant bumped together.
2. **Bundle syntax check.** No bundler means nothing fails loudly on a hand edit. Run `node --check lib/client.js` (and `--check` every file the plugin manifest loads) in CI/pre-release; parse with a parser pinned to the supported browser floor to catch newer-than-target syntax; smoke-load the plugin in a stubbed-DOM harness before tagging. Also verify the manifest entry points at the file that was edited.
3. **How users actually receive the update (no host-side update endpoint).** The plugin is fetched from a URL the host loads; the chip can only *announce*, never deliver. If the URL is version-pinned (`…/0.2.10/client.js`), a hard refresh changes nothing — the user must repoint the host config, and the chip's message must say so. If it is a mutable/`latest` URL, the next full load picks up v0.2.11 — but browsers and any intermediate CDN can pin the old file exactly the way GitHub's tags API pinned the tag list (§3.1): serve the mutable path with `Cache-Control: no-cache` (always revalidate) and give immutable long max-age only to version-pinned paths. Consequently the update chip's CTA in v0.2.11 must be honest — "v0.2.11 available — reload the plugin / update your plugin URL", linking to the release — and must never imply the plugin updated itself. Optionally the chip may offer to inject the new version's pinned script tag itself (self-update) with an integrity check, but the §3.2 display rule still governs what version text is shown. Finally, expect the announcement to outrun the tags API by minutes (as here); that lag is now harmless because the chip is conservative — it renders the locally-known running version whenever the remote shows nothing newer.

---

## Boundary compliance

Read only the five fixture files under `.../S10-paste-rename-and-version-chip/fixture/`; the fixture is unchanged. Wrote only this report into `.../agent-output/S10-paste-rename-and-version-chip/`. No migrations or installations were executed; no repository, skill, solution, or test files were read or cited.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.