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

# S10 · Paste Renaming & Version-Chip Follow-Ups — Read-Only Analysis Report

Plugin: `@org/dsh-attach-input v0.2.10 (lib-only bundle, no build step)`
Evidence: `fixture/plugin-attachment-flow.js, `fixture/plugin-version-chip.js,
`fixture/user-threads.md, `fixture/tags-api-response.txt. Fixture untouched.
Mode: plugin-upgrade skill, Mode A (read-only inspect) — report only, no writes to the plugin.

---

## 1. Renaming design (Follow-up A)

### Naming scheme
- **Pasted images** (`file.type starts with `image/): `paste_image.png,`
  `paste_image(2).png, `paste_image(3).png… — suffix `(n) appended before the`
  extension, first occurrence unsuffixed.
- **Other pasted files**: `paste_file.<ext> with the same `(n) numbering.
- **Drag-and-drop and file/folder picker**: keep the real `item.path verbatim — no`
  renaming, no renumbering. Those are the user's actual files; the only check that still
  applies to them is the existing in-batch duplicate-path check in `validateItems().`

### Where the rename is applied — and what stays untouched
All three acquisition paths funnel into the shared `add(sessionId, items)`
(fixture lines 17–42), and `add() today keeps `item.path verbatim
(line 24: `const label = item.path). Therefore:`

- Apply the rename **only on the paste path**, at the boundary where clipboard
  `File objects become `{ file, path } items — either inside the paste handler
  before it calls `add(), or via an explicit `origin: 'paste' (equivalently
  `rename: true) option that only the paste handler passes. The rename produces the`
  final `item.path **before** the record is created, so the record label`
  (`label = item.path) and the upload body`
  (`files: record.items.map(item => ({ path: item.path, ... })))`
  both inherit the renamed name from the same single source.
- The drop handler and the picker handler call `add() exactly as today; their item`
  construction is untouched. Do **not** put unconditional renaming inside `add() —`
  that would rename picker/drop files too. Do **not** weaken `validateItems(); the`
  in-batch duplicate check still guards all paths.

### How the number is chosen
For base name `B (`paste_image / `paste_file) and extension `.ext:

1. At rename time, take a **fresh composer snapshot** (`input.state.getSnapshot())`
   and collect every label/path of occurrences belonging to this plugin
   (`o.source === SOURCE) — that is the set of names actually present in the`
   composer's attachment dock right now.
2. Union that set with the names already assigned **earlier in the same batch**
   (the existing in-batch `Set discipline from `validateItems).
3. Pick the smallest `n >= 1 such that the candidate is free: `n = 1 -> `B.ext,`
   else `B(n).ext. Assign, add to the batch set, continue.`

No persisted counter: numbering always derives from the live taken-names set, so names
freed by deleting an attachment are naturally reused and the scheme never drifts.

### Authoritative "names already taken" source — and why the records Map is wrong
The authoritative source is the **composer occurrence snapshot**
(`input.state.getSnapshot().occurrences), read at rename time. The plugin-side`
`records Map must **not** be used as the taken-names source, because:`

- **It retires entries spuriously.** The alive-subscription (fixture lines 31–38) deletes
  the record whenever *any* snapshot momentarily shows no occurrence for that ref:
  `if (alive || record.inflight !== undefined) return; ... records.delete(ref) —`
  "fires on ANY momentary empty snapshot". Snapshot re-aggregation/roundtrips can
  transiently omit an occurrence that is still attached. A cache that under-reports
  taken names will re-issue `paste_image.png while a same-named chip is still in the`
  dock — the exact collision the scheme exists to prevent.
- **It only sees its own runtime's additions.** Names present in the composer through
  any other route (restored composer state, other insertion paths) never enter the Map,
  so it is incomplete even when it isn't actively retiring entries.

The composer snapshot is the ground truth of "what names are in the dock"; the records
Map is a fragile, self-invalidating cache of "what this plugin added". Conflict
detection must read ground truth, not the cache.

## 2. Extension rule and what each surface shows (guidance, unscored)

- **Base name**: `paste_image when the pasted `File's MIME type is `image/*;`
  `paste_file otherwise.`
- **Extension**: prefer the extension of the clipboard file's original name
  (`image.png -> `.png); if the name has no usable extension, fall back to a
  MIME->extension map (`image/png -> `.png, `image/jpeg -> `.jpg,
  `application/pdf -> `.pdf, ...); unknown on both -> no extension (`paste_file).`
  The original basename itself is **never** kept for pasted items — only its extension
  survives.
- **Dock chip**: renders `record?.label ?? occurrence.label (fixture line 44) and the`
  record label is `item.path — so after renaming at item construction the chip shows`
  the unified name, e.g. `paste_image(2).png.`
- **Uploaded path**: the upload body maps `item.path (fixture line 45) — the same`
  renamed path is what is uploaded/stored. Rename once, before the record exists, and
  chip and upload can never disagree. Drop/picker uploads keep their real paths on both
  surfaces.

## 3. Follow-up B root cause — the chip that showed an older tag as "latest"

### What happened
Minutes after tag `v0.2.11 was pushed, the user's v0.2.10 bundle fetched`
`/repos/org/dsh-attach-input/tags?per_page=10 and received a **stale CDN/edge-cached`
page**: `tags-api-response.txt shows `x-cache: HIT, `age: 178,`
`cache-control: private, max-age=60, s-maxage=300, and a payload whose newest tag is`
`v0.2.9 — the cached page predates both the v0.2.10 and v0.2.11 pushes, while`
`git ls-remote proves both tags exist on the remote.`

The chip code then made two compounding mistakes (`plugin-version-chip.js):`

1. **It treated the cached remote value as ground truth.** `latestFromTags() reduces`
   the fetched page to its max stable tag (v0.2.9) with no staleness suspicion;
   `startUpdateChip() compares it against the hand-inlined `PLUGIN_VERSION (0.2.10):
   `semverCmp('v0.2.9', '0.2.10') <= 0 -> the "current" branch.`
2. **The "current" chip displays the fetched tag, not the running version** (line 27:
   `'...already the latest version ' + tag). So the UI rendered a version **older than`
   the running one** — "already the latest version **v0.2.9**" — on a v0.2.10 install,
   and said nothing about v0.2.11. "A while later it changed its mind" = the edge cache
   expired (`s-maxage: 300).`

### The display rule the chip should follow
- **Compare exactly two values**: the fetched latest stable tag (best-effort remote
  hint) vs the locally-known running `PLUGIN_VERSION.`
- The fetched value is only allowed to act as an **upgrade signal when it is strictly
  newer** (semver) than `PLUGIN_VERSION: then show the update chip displaying the`
  **fetched tag** (`v0.2.11 available).`
- Whenever `fetched <= PLUGIN_VERSION — including a stale/older fetch — the chip shows`
  the **running `PLUGIN_VERSION** as the current version`
  ("attach-input v0.2.10 is up to date"), never the fetched value. In effect the
  displayed "latest" is `max(fetched, PLUGIN_VERSION); a remote value below the`
  running version can never be rendered, and can never suppress a newer remote once the
  cache catches up (a strictly-newer fetch still wins on the next check).
- Fetch failure/offline keeps the neutral offline chip; no "latest" claim is made
  without a strictly-newer comparison.

## 4. Regression tests that would have caught both

### Follow-up A
1. **Single batch**: paste two screenshots in one clipboard event -> items/paths are
   `paste_image.png, `paste_image(2).png. (Catches missing in-batch numbering.)
2. **Sequential batches**: paste one screenshot, then paste another while the first is
   still attached -> second is `paste_image(2).png. Proves numbering is computed from`
   the live composer state, not a reset-per-batch counter. (Catches "no renaming at
   all" and per-batch-only logic.)
3. **Fragile-cache regression**: stub the state subscription to fire a momentary empty
   snapshot (retiring the `records entry per fixture line 36) while the occurrence`
   still exists in the composer, then paste again -> must still get
   `paste_image(2).png. This test **fails** if the taken-names source is the records`
   Map and passes only when it reads the composer snapshot. (Directly catches the
   wrong-authority design.)
4. **Non-image paste**: paste `application/pdf -> `paste_file.pdf,
   `paste_file(2).pdf; paste a file with unknown MIME and no extension ->`
   `paste_file.`
5. **MIME fallback**: clipboard `File named `image (no extension) with type
   `image/png -> `paste_image.png.
6. **Path scoping**: drag-and-drop and picker selections keep real names verbatim
   (`report-final.pdf stays), including when `paste_file.pdf already exists in the
   dock; the in-batch duplicate check still throws on true duplicates.
7. **Surface agreement**: for a renamed paste, assert dock chip label === uploaded
   `path === `paste_image(2).png.

### Follow-up B
1. **Stale remote (the bug)**: mock fetch returning a tag page whose max stable tag
   (v0.2.9) is **lower** than `PLUGIN_VERSION (0.2.10) -> golden-text assertion: chip`
   shows the running version v0.2.10 as current; it must **never** contain the fetched
   older tag nor claim it is "latest". (Would have failed on the shipped code, which
   interpolates `tag into the green chip.)`
2. **Newer remote**: mock max tag v0.2.11 -> update chip shows v0.2.11.
3. **Equal remote**: mock max tag v0.2.10 -> current chip shows v0.2.10.
4. **Offline**: fetch rejects / non-OK -> offline chip, no "latest" text.
5. **Unit**: `semverCmp ordering across the 0.2.x line; prerelease filtering by the`
   `^v\\d+\\.\\d+\\.\\d+$ gate.`

## 5. Lib-only release hygiene items this touches

- **Hand-inlined version constants**: `PLUGIN_VERSION is hand-inlined in`
  `lib/client.js (fixture line 5) and must move in the same release as`
  `package.json. Add a release script that rewrites both, and a CI assertion`
  `PLUGIN_VERSION === package.json#version — the chip's whole comparison is only as`
  honest as this constant. (Skill Mode C step 6 makes the same point: verify the packed
  filename and packed manifest carry the plugin's own version.)
- **Bundle syntax check**: with no build step, a syntax slip ships straight to users.
  Gate releases on a parse check of every shipped lib file
  (e.g. `node --check lib/client.js), and keep the source within the syntax the`
  target browsers parse natively — there is no transpile step to rescue modern syntax.
  Cf. skill reference `migration-hygiene.md sections 1–2 (key points: caches and a`
  passing typecheck are not proof; run the real check), and its validation-discipline
  rule (full clean -> build -> typecheck -> test chain before shipping).
- **How users actually receive the update**: this plugin has no host-side update
  endpoint — distribution is the git tag/package artifact, and the version chip itself
  is the only update-discovery channel (which is why Follow-up B mattered: the
  discovery channel must never under-report). Users apply the new bundle themselves;
  per `migration-hygiene.md section 3 (plane rule), a client-half change`
  (`lib/client.js) takes effect on a **browser hard refresh**, a host-half change`
  (`lib/index.js) needs a **dsh restart**; note additionally card **DSH-0.1.7-A2-04**`
  (key point: client bundles are cached at host boot on newer hosts, so an
  install-tree client edit can require a host restart even though pages reconnect).
  Release notes must state which plane changed and the exact user action.
- **Announcement/cache reality**: the GitHub tags API serves edge-cached pages
  (`s-maxage=300; captured `age: 178 — evidence in `tags-api-response.txt). Do not`
  treat "the push just happened" as "the API shows it"; the client-side rule in
  section 3 (never display below the running version, only a strictly-newer fetch
  upgrades) makes the chip correct regardless of cache lag.

---

### Pre-existing / scope notes
- Fixture left byte-identical (read-only authorization honored; report written only
  under `agent-output/).`
- Baseline test run: not collected (Mode A; no installs or executions performed).
- Skill references cited by ID/key point only: `migration-hygiene.md sections 1–3,`
  DSH-0.1.7-A2-04, SKILL.md Mode C step 6.


#### FILE: S10-paste-rename-and-version-chip-report.md

# S10 · Paste Renaming & Version-Chip Follow-Ups — Read-Only Analysis Report

Plugin: `@org/dsh-attach-input v0.2.10 (lib-only bundle, no build step)`
Evidence: `fixture/plugin-attachment-flow.js, `fixture/plugin-version-chip.js,
`fixture/user-threads.md, `fixture/tags-api-response.txt. Fixture untouched.
Mode: plugin-upgrade skill, Mode A (read-only inspect) — report only, no writes to the plugin.

---

## 1. Renaming design (Follow-up A)

### Naming scheme
- **Pasted images** (`file.type starts with `image/): `paste_image.png,`
  `paste_image(2).png, `paste_image(3).png… — suffix `(n) appended before the`
  extension, first occurrence unsuffixed.
- **Other pasted files**: `paste_file.<ext> with the same `(n) numbering.
- **Drag-and-drop and file/folder picker**: keep the real `item.path verbatim — no`
  renaming, no renumbering. Those are the user's actual files; the only check that still
  applies to them is the existing in-batch duplicate-path check in `validateItems().`

### Where the rename is applied — and what stays untouched
All three acquisition paths funnel into the shared `add(sessionId, items)`
(fixture lines 17–42), and `add() today keeps `item.path verbatim
(line 24: `const label = item.path). Therefore:`

- Apply the rename **only on the paste path**, at the boundary where clipboard
  `File objects become `{ file, path } items — either inside the paste handler
  before it calls `add(), or via an explicit `origin: 'paste' (equivalently
  `rename: true) option that only the paste handler passes. The rename produces the`
  final `item.path **before** the record is created, so the record label`
  (`label = item.path) and the upload body`
  (`files: record.items.map(item => ({ path: item.path, ... })))`
  both inherit the renamed name from the same single source.
- The drop handler and the picker handler call `add() exactly as today; their item`
  construction is untouched. Do **not** put unconditional renaming inside `add() —`
  that would rename picker/drop files too. Do **not** weaken `validateItems(); the`
  in-batch duplicate check still guards all paths.

### How the number is chosen
For base name `B (`paste_image / `paste_file) and extension `.ext:

1. At rename time, take a **fresh composer snapshot** (`input.state.getSnapshot())`
   and collect every label/path of occurrences belonging to this plugin
   (`o.source === SOURCE) — that is the set of names actually present in the`
   composer's attachment dock right now.
2. Union that set with the names already assigned **earlier in the same batch**
   (the existing in-batch `Set discipline from `validateItems).
3. Pick the smallest `n >= 1 such that the candidate is free: `n = 1 -> `B.ext,`
   else `B(n).ext. Assign, add to the batch set, continue.`

No persisted counter: numbering always derives from the live taken-names set, so names
freed by deleting an attachment are naturally reused and the scheme never drifts.

### Authoritative "names already taken" source — and why the records Map is wrong
The authoritative source is the **composer occurrence snapshot**
(`input.state.getSnapshot().occurrences), read at rename time. The plugin-side`
`records Map must **not** be used as the taken-names source, because:`

- **It retires entries spuriously.** The alive-subscription (fixture lines 31–38) deletes
  the record whenever *any* snapshot momentarily shows no occurrence for that ref:
  `if (alive || record.inflight !== undefined) return; ... records.delete(ref) —`
  "fires on ANY momentary empty snapshot". Snapshot re-aggregation/roundtrips can
  transiently omit an occurrence that is still attached. A cache that under-reports
  taken names will re-issue `paste_image.png while a same-named chip is still in the`
  dock — the exact collision the scheme exists to prevent.
- **It only sees its own runtime's additions.** Names present in the composer through
  any other route (restored composer state, other insertion paths) never enter the Map,
  so it is incomplete even when it isn't actively retiring entries.

The composer snapshot is the ground truth of "what names are in the dock"; the records
Map is a fragile, self-invalidating cache of "what this plugin added". Conflict
detection must read ground truth, not the cache.

## 2. Extension rule and what each surface shows (guidance, unscored)

- **Base name**: `paste_image when the pasted `File's MIME type is `image/*;`
  `paste_file otherwise.`
- **Extension**: prefer the extension of the clipboard file's original name
  (`image.png -> `.png); if the name has no usable extension, fall back to a
  MIME->extension map (`image/png -> `.png, `image/jpeg -> `.jpg,
  `application/pdf -> `.pdf, ...); unknown on both -> no extension (`paste_file).`
  The original basename itself is **never** kept for pasted items — only its extension
  survives.
- **Dock chip**: renders `record?.label ?? occurrence.label (fixture line 44) and the`
  record label is `item.path — so after renaming at item construction the chip shows`
  the unified name, e.g. `paste_image(2).png.`
- **Uploaded path**: the upload body maps `item.path (fixture line 45) — the same`
  renamed path is what is uploaded/stored. Rename once, before the record exists, and
  chip and upload can never disagree. Drop/picker uploads keep their real paths on both
  surfaces.

## 3. Follow-up B root cause — the chip that showed an older tag as "latest"

### What happened
Minutes after tag `v0.2.11 was pushed, the user's v0.2.10 bundle fetched`
`/repos/org/dsh-attach-input/tags?per_page=10 and received a **stale CDN/edge-cached`
page**: `tags-api-response.txt shows `x-cache: HIT, `age: 178,`
`cache-control: private, max-age=60, s-maxage=300, and a payload whose newest tag is`
`v0.2.9 — the cached page predates both the v0.2.10 and v0.2.11 pushes, while`
`git ls-remote proves both tags exist on the remote.`

The chip code then made two compounding mistakes (`plugin-version-chip.js):`

1. **It treated the cached remote value as ground truth.** `latestFromTags() reduces`
   the fetched page to its max stable tag (v0.2.9) with no staleness suspicion;
   `startUpdateChip() compares it against the hand-inlined `PLUGIN_VERSION (0.2.10):
   `semverCmp('v0.2.9', '0.2.10') <= 0 -> the "current" branch.`
2. **The "current" chip displays the fetched tag, not the running version** (line 27:
   `'...already the latest version ' + tag). So the UI rendered a version **older than`
   the running one** — "already the latest version **v0.2.9**" — on a v0.2.10 install,
   and said nothing about v0.2.11. "A while later it changed its mind" = the edge cache
   expired (`s-maxage: 300).`

### The display rule the chip should follow
- **Compare exactly two values**: the fetched latest stable tag (best-effort remote
  hint) vs the locally-known running `PLUGIN_VERSION.`
- The fetched value is only allowed to act as an **upgrade signal when it is strictly
  newer** (semver) than `PLUGIN_VERSION: then show the update chip displaying the`
  **fetched tag** (`v0.2.11 available).`
- Whenever `fetched <= PLUGIN_VERSION — including a stale/older fetch — the chip shows`
  the **running `PLUGIN_VERSION** as the current version`
  ("attach-input v0.2.10 is up to date"), never the fetched value. In effect the
  displayed "latest" is `max(fetched, PLUGIN_VERSION); a remote value below the`
  running version can never be rendered, and can never suppress a newer remote once the
  cache catches up (a strictly-newer fetch still wins on the next check).
- Fetch failure/offline keeps the neutral offline chip; no "latest" claim is made
  without a strictly-newer comparison.

## 4. Regression tests that would have caught both

### Follow-up A
1. **Single batch**: paste two screenshots in one clipboard event -> items/paths are
   `paste_image.png, `paste_image(2).png. (Catches missing in-batch numbering.)
2. **Sequential batches**: paste one screenshot, then paste another while the first is
   still attached -> second is `paste_image(2).png. Proves numbering is computed from`
   the live composer state, not a reset-per-batch counter. (Catches "no renaming at
   all" and per-batch-only logic.)
3. **Fragile-cache regression**: stub the state subscription to fire a momentary empty
   snapshot (retiring the `records entry per fixture line 36) while the occurrence`
   still exists in the composer, then paste again -> must still get
   `paste_image(2).png. This test **fails** if the taken-names source is the records`
   Map and passes only when it reads the composer snapshot. (Directly catches the
   wrong-authority design.)
4. **Non-image paste**: paste `application/pdf -> `paste_file.pdf,
   `paste_file(2).pdf; paste a file with unknown MIME and no extension ->`
   `paste_file.`
5. **MIME fallback**: clipboard `File named `image (no extension) with type
   `image/png -> `paste_image.png.
6. **Path scoping**: drag-and-drop and picker selections keep real names verbatim
   (`report-final.pdf stays), including when `paste_file.pdf already exists in the
   dock; the in-batch duplicate check still throws on true duplicates.
7. **Surface agreement**: for a renamed paste, assert dock chip label === uploaded
   `path === `paste_image(2).png.

### Follow-up B
1. **Stale remote (the bug)**: mock fetch returning a tag page whose max stable tag
   (v0.2.9) is **lower** than `PLUGIN_VERSION (0.2.10) -> golden-text assertion: chip`
   shows the running version v0.2.10 as current; it must **never** contain the fetched
   older tag nor claim it is "latest". (Would have failed on the shipped code, which
   interpolates `tag into the green chip.)`
2. **Newer remote**: mock max tag v0.2.11 -> update chip shows v0.2.11.
3. **Equal remote**: mock max tag v0.2.10 -> current chip shows v0.2.10.
4. **Offline**: fetch rejects / non-OK -> offline chip, no "latest" text.
5. **Unit**: `semverCmp ordering across the 0.2.x line; prerelease filtering by the`
   `^v\\d+\\.\\d+\\.\\d+$ gate.`

## 5. Lib-only release hygiene items this touches

- **Hand-inlined version constants**: `PLUGIN_VERSION is hand-inlined in`
  `lib/client.js (fixture line 5) and must move in the same release as`
  `package.json. Add a release script that rewrites both, and a CI assertion`
  `PLUGIN_VERSION === package.json#version — the chip's whole comparison is only as`
  honest as this constant. (Skill Mode C step 6 makes the same point: verify the packed
  filename and packed manifest carry the plugin's own version.)
- **Bundle syntax check**: with no build step, a syntax slip ships straight to users.
  Gate releases on a parse check of every shipped lib file
  (e.g. `node --check lib/client.js), and keep the source within the syntax the`
  target browsers parse natively — there is no transpile step to rescue modern syntax.
  Cf. skill reference `migration-hygiene.md sections 1–2 (key points: caches and a`
  passing typecheck are not proof; run the real check), and its validation-discipline
  rule (full clean -> build -> typecheck -> test chain before shipping).
- **How users actually receive the update**: this plugin has no host-side update
  endpoint — distribution is the git tag/package artifact, and the version chip itself
  is the only update-discovery channel (which is why Follow-up B mattered: the
  discovery channel must never under-report). Users apply the new bundle themselves;
  per `migration-hygiene.md section 3 (plane rule), a client-half change`
  (`lib/client.js) takes effect on a **browser hard refresh**, a host-half change`
  (`lib/index.js) needs a **dsh restart**; note additionally card **DSH-0.1.7-A2-04**`
  (key point: client bundles are cached at host boot on newer hosts, so an
  install-tree client edit can require a host restart even though pages reconnect).
  Release notes must state which plane changed and the exact user action.
- **Announcement/cache reality**: the GitHub tags API serves edge-cached pages
  (`s-maxage=300; captured `age: 178 — evidence in `tags-api-response.txt). Do not`
  treat "the push just happened" as "the API shows it"; the client-side rule in
  section 3 (never display below the running version, only a strictly-newer fetch
  upgrades) makes the chip correct regardless of cache lag.

---

### Pre-existing / scope notes
- Fixture left byte-identical (read-only authorization honored; report written only
  under `agent-output/).`
- Baseline test run: not collected (Mode A; no installs or executions performed).
- Skill references cited by ID/key point only: `migration-hygiene.md sections 1–3,`
  DSH-0.1.7-A2-04, SKILL.md Mode C step 6.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.