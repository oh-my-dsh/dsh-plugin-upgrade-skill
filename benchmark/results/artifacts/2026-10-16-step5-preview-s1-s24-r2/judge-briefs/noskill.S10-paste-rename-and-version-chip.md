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

# S10 · Paste Renaming & Version-Chip Follow-Ups — Design & Post-Mortem Report

Plugin: `@org/dsh-attach-input` (community Web plugin, **lib-only bundle, no build step**)
Baseline under analysis: **v0.2.10** (evidence: `fixture/plugin-attachment-flow.js`, `fixture/plugin-version-chip.js`, `fixture/user-threads.md`, `fixture/tags-api-response.txt`)

Two independent defects, one shared theme: **each follow-up was caused by trusting a value that the
code itself could prove was not authoritative.** Follow-up A trusted a plugin-side cache
(`records`) as the conflict oracle; Follow-up B trusted an edge-cached remote list as ground truth
next to a locally-known running version. Both are "which source is authoritative" bugs, not
"missing feature" bugs.

---

## 1. Follow-up A — Unified renaming of pasted files

### 1.1 The exact naming scheme

| Acquisition path | Pasted item is an image | Pasted item is anything else |
|---|---|---|
| **Paste (clipboard)** | `paste_image.png`, `paste_image(2).png`, `paste_image(3).png`, … | `paste_file.pdf`, `paste_file(2).pdf`, … |
| **Drag-and-drop** | *unchanged* — `Screenshot 2026-10-16.png` | *unchanged* — `report.pdf` |
| **File / folder picker** | *unchanged* | *unchanged* |

Rules:

1. The **base name is fixed and unified**: `paste_image` for images, `paste_file` for everything
   else. The original base name is *discarded* from the visible name (that is the whole point of the
   request — the clipboard name carries zero information). The original name is retained as
   non-visible metadata (`item.originalName`) for tooltips/debugging and a possible
   "restore real name" affordance.
2. The **extension is preserved** (rule in §2).
3. The **number is the lowest unused positive integer**, rendered as `(n)` with no separator, and
   **the first file carries no suffix at all** (n = 1 → `paste_image.png`, n = 2 → `paste_image(2).png`).
   Not `batchIndex + 1`, not `records.size + 1`, not a timestamp or random suffix — the user
   explicitly asked for the chat-app `(n)` scheme, and a monotonic counter that never reuses an
   index is what makes two pastes of two identically-named clipboard files distinguishable.
4. Numbering **continues across pastes within the same composer session**, not just within one
   paste batch. Pasting `image.png` now and `image.png` again ten minutes later must yield
   `paste_image.png` and `paste_image(2).png`. The counter is therefore *derived from the
   taken-name set*, not from a per-batch index. (Scope it per `sessionId` so a new session starts
   clean at n = 1.)
5. Images and non-images **number independently** (`paste_image.png`, `paste_file.pdf`,
   `paste_image(2).png`, `paste_file(2).pdf`) because the base name differs.

### 1.2 Where in the flow the rename must be applied

`add()` is the shared funnel — the fixture states it outright: *"The paste path, the drop path, and
the file/folder picker all funnel into `add()`"* (plugin-attachment-flow.js:3). Therefore:

- **Apply the rename on the paste acquisition path only** — in the clipboard `paste` handler, at the
  moment the `File` objects are read off the `DataTransferItemList` and before the items are handed
  to `add()`. Equivalently, `add()` may take an explicit `acquisition` argument
  (`'paste' | 'drop' | 'picker'`) and rename **only** when it is `'paste'`.
- **`add()` must never rename unconditionally.** A rename inside `add()` with no acquisition gate
  would rename dragged and picked files too, which is the one thing the user said must not happen.
- **Paths that must stay completely untouched:** the drag-and-drop handler and the file/folder
  picker handler. Their `item.path` values are passed through verbatim, byte for byte, into
  `record.label` and the upload body. No trimming, no case normalization, no extension fixups.
- **The rename must mutate `item.path` (the item's name), not just `record.label`.** In the current
  code `label === item.path` (plugin-attachment-flow.js:24) and the upload body sends
  `files: record.items.map(item => ({ path: item.path, ... }))` (line 45). Renaming only the label
  would make the dock chip say `paste_image(2).png` while the server receives `image.png` — two
  different names for one attachment. Renaming `item.path` makes chip and upload agree by
  construction.
- **Pass the renamed name into `insertReference()` as well**, not just into the local record. The
  dock chip falls back to `occurrence.label` when the record is missing
  (`record?.label ?? occurrence.label`, line 44) — and per §1.4 records *do* go missing. If the
  host's occurrence still carries `image.png`, the chip flips back to the un-renamed name the
  moment the record is retired. The host-side occurrence label must be the renamed one.
- `validateItems()` keeps running, but its role changes: it becomes an **invariant assertion**
  ("no two items in this batch share a name") rather than the duplicate-detection *mechanism*. It
  must never again be the only duplicate check.

### 1.3 How the number is chosen

```js
// pure, unit-testable
function allocatePastedName(item, taken /* Set<string>, authoritative */) {
  const base = isImage(item) ? 'paste_image' : 'paste_file';
  const ext  = extensionOf(item);                       // §2
  let n = 1;
  let candidate = base + '.' + ext;
  while (taken.has(candidate)) {
    n += 1;
    candidate = base + '(' + n + ').' + ext;
  }
  taken.add(candidate);          // visible to later items in this same batch
  return candidate;
}
```

- Allocation is **sequential, in paste order**, and each allocation is added to the in-memory
  taken-set so the next item in the same paste sees it.
- The set is **re-read from the authoritative source before every allocation** (see §1.4), which is
  what makes numbering continue across separate pastes.
- A collision discovered *after* insertion (host rejects) is handled by a **bounded retry with the
  next free index** (e.g. 3 attempts), then a clear error. Today a rejection is fatal:
  `if (!accepted) { records.delete(ref); throw new Error('The DSH composer changed'); }`
  (plugin-attachment-flow.js:28) — a user-visible, misleading error for what is really a naming
  conflict. Retry first, and only report failure if the host genuinely refuses.

### 1.4 The authoritative "names already taken" source

**Authoritative source: the host composer's own live attachment list — `input.state.getSnapshot().occurrences`
(the same state `insertReference()` validates against), read fresh immediately before each
allocation, unioned with the names already allocated in the current batch.**

```js
const takenNames = () => new Set(
  input.state.getSnapshot().occurrences.map(o => o.label ?? o.name).filter(Boolean)
);

// paste path only:
const taken = takenNames();                 // host truth, read fresh
for (const item of pastedItems) {
  item.path = allocatePastedName(item, taken);
  await insertWithRetry(item, taken);       // host accept/reject is the final arbiter
}
```

Why this and not something else:

- **It is the same data the host checks.** `insertReference()` either accepts or rejects based on the
  host's composer state. Deriving the name from that exact state means the plugin asks the host the
  same question the host is about to ask itself, so the answer is right by construction.
- **It is source-agnostic.** It contains dragged files, picked files, and attachments created by
  other plugins — every name that actually occupies the composer. A per-plugin view cannot see those.
- **It is not derivable, lossy, or GC'd.** See below.

**Why a plugin-side `records` cache alone is the wrong source.** The `records` Map is *derived* state
with a documented liveness bug: the subscription at plugin-attachment-flow.js:30-38 unsubscribes and
**deletes the record whenever the current snapshot's `occurrences` array does not contain the
plugin's own `(SOURCE, ref)` pair** — and the fixture's own comment says it *"fires on ANY
momentary empty snapshot"* (line 36). Concretely:

1. **It under-reports, so names get handed out twice.** A record retired by a transient empty
   snapshot frees its name in the plugin's view while the attachment is still in the composer. The
   next paste then allocates the same name — two chips reading `paste_image.png` in one session,
   which is exactly the bug the user reported, reintroduced through the back door.
2. **It is a strict subset of reality.** `records` only holds *this plugin's* insertions. A file
   dragged in as `paste_image.png`, or an attachment another plugin registered under that name, is
   invisible to it — so the paste path collides with a name it never knew existed.
3. **It is pruned on the failure path too.** `records.delete(ref)` also runs when `insertReference`
   is rejected (line 28), so a name the host still holds can be recycled immediately after a
   rejection.
4. **It is eventually-consistent by construction.** The record is written *before* the insert and
   deleted *after* the snapshot check; any allocation that reads it mid-flight races the host.

**The correct role for `records`: at most a monotonic, add-only *supplementary* hint layered
*underneath* the composer snapshot — never the sole source, and never pruned by a transient empty
snapshot.** Two follow-up fixes are implied and should ship together:

- Fix the subscription so a record is retired only after a **stable, non-empty confirmation** (re-read
  the snapshot on a microtask or animation frame, or debounce), not on the first empty
  observation. As written it also causes dock chips to vanish and reappear, which is the same root
  defect as the naming bug.
- Keep a plugin-side "names this bundle has ever successfully inserted" set that only ever grows
  within a session, and union it with the snapshot. That covers the residual case where the
  *snapshot itself* is momentarily empty (the same transiency that breaks the subscription) without
  ever letting a cache override the host.

---

## 2. Extension rule, dock chip, and upload path *(guidance — not scored)*

**Extension resolution, in order:**

1. If the original file name has a dot and the segment after the **last** dot is non-empty, use that
   segment, lowercased, without the dot.
2. Otherwise fall back to the **MIME type**: `image/png` → `png`, `image/jpeg` → `jpg` (a small
   explicit map is needed because the JPEG subtype is `jpeg`, not the conventional `jpg`),
   `application/pdf` → `pdf`, `text/plain` → `txt`, etc.
3. Otherwise `bin`.

Notes: preserve known compound suffixes for non-images so a pasted `archive.tar.gz` becomes
`paste_file.tar.gz` rather than `paste_file.gz`; and decide **image-vs-other by MIME first**
(`type.startsWith('image/')`), then by extension — a clipboard image named `foo` with no extension
must still land as `paste_image.png`, not `paste_file.png`.

**What each surface displays:**

- **Dock chip:** `record.label`, i.e. the renamed path — `paste_image.png`, `paste_image(2).png`.
  Because the record can be retired (§1.4), the renamed name must also be carried in the
  `insertReference()` payload so the `occurrence.label` fallback shows the same string. A
  `title`/tooltip may show `original: image.png`.
- **Upload path:** the upload body sends the renamed path too
  (`files: record.items.map(item => ({ path: item.path }))`), so the server stores
  `paste_image(2).png` — the same string the user saw on the chip. The two surfaces must never
  diverge; that is guaranteed by renaming `item.path` rather than only the label.

---

## 3. Follow-up B — Why the green chip said "latest v0.2.9"

### 3.1 Root cause

Two defects compounded, and the evidence pack pins both.

**(a) The fetched tag list was stale, and the code had no way to know.** The captured response
(`fixture/tags-api-response.txt`) was taken ~90 s after the `v0.2.11` push and shows
`HTTP/2 200`, `cache-control: private, max-age=60, s-maxage=300`, **`x-cache: HIT`**,
`age: 178` — an edge/CDN hit serving a page whose newest tag was **`v0.2.9`**, while
`git ls-remote` confirmed both `v0.2.10` and `v0.2.11` existed on the remote. The chip's
`latestFromTags()` (plugin-version-chip.js:7-16) treats any `res.ok` JSON array as truth, sends no
revalidation directive, uses no cache-busting parameter, and never inspects `age`/`x-cache`. It
also takes only `per_page=10` with no pagination, so on a repo with more tags the newest can be
missing from page 1 regardless of caching.

**(b) The comparison and the display both used the fetched value.** `startUpdateChip()`
(plugin-version-chip.js:18-23) computes `tag` = max stable tag **from that stale list** and then:

```js
if (semverCmp(tag, PLUGIN_VERSION) <= 0) { renderCurrentChip(tag); return; }
```

With `tag = 'v0.2.9'` and the running bundle's `PLUGIN_VERSION = '0.2.10'`,
`semverCmp('v0.2.9', '0.2.10') <= 0` is true, so the green "already the latest" chip renders —
and `renderCurrentChip` (lines 25-28) interpolates **the fetched tag**:

> "✓ attach-input already the latest version **v0.2.9**"

That is the lie. The chip asserted a version **older than the one the user was running** as "the
latest", which is self-contradictory: a value lower than a locally-known running version *cannot*
be the latest, and is therefore proof that the fetched data is stale. The code had that proof in
hand (the comparison itself computed `tag < PLUGIN_VERSION`) and discarded it instead of using it
to reject the remote value. "A while later it changed its mind" is simply the edge cache expiring and
the next fetch returning a page that included `v0.2.11`.

### 3.2 The display rule the chip should follow

- **The two values that compare:** (1) the newest stable tag from the remote tag list, and (2) the
  **running bundle's own inlined `PLUGIN_VERSION`** — a value that is known locally, cannot be
  stale, and is the version the user is actually executing.
- **The value that is shown in the "already the latest" chip: the running version
  (`PLUGIN_VERSION`), never the fetched tag.** "Already latest" means "you are on the newest" — the
  only value that claim can be made about truthfully is the one the user is running.

```js
const running = normalize(PLUGIN_VERSION);                 // strip leading 'v'
const tag = await latestFromTags();                        // must be cache-busted, see §5
if (!tag) { renderOfflineChip(); return; }
const remote = normalize(tag);
if (semverCmp(remote, running) > 0) {
  renderUpdateChip(remote);                                // a real update exists
} else {
  if (semverCmp(remote, running) < 0) warnStaleRemote(remote, running);   // remote is behind
  renderCurrentChip(running);                              // show the RUNNING version
}
```

Additional invariants:

- **Never render a tag lower than the running version as "latest".** If `remote < running`, the
  remote value is discarded (optionally re-fetched once with a cache-buster); it is never displayed.
- **Never persist the fetched tag** (no `localStorage`/`IndexedDB` cache of "latest seen") — a
  persisted stale value outlives the request and becomes the lie on the next launch.
- **Never let a lower fetched value overwrite an already-displayed version** within a session; the
  "changed its mind" flip-flop is a symptom of exactly this.
- Normalize the leading `v` on both sides of every comparison. The current code compares
  `'v0.2.9'` against `'0.2.10'`; if `semverCmp` does not strip the prefix, the comparison is
  lexicographic garbage — a latent second bug sitting on the same line.
- Exclude prereleases from the "latest stable" offer (the existing strict three-number tag filter
  already does this; keep it), and make the fetch cache-safe and paginated (or switch to a
  single-object endpoint).

---

## 4. Regression tests that would have caught both follow-ups

### Follow-up A

1. **Two pastes, same batch** → `paste_image.png`, `paste_image(2).png`.
2. **Two pastes, separate batches** (paste, wait, paste again) → `paste_image.png` then
   `paste_image(2).png`. *This is the case the current in-batch-only check in `validateItems()`
   cannot catch, and the one the user actually hit.*
3. **Non-image pastes** → `paste_file.pdf`, then `paste_file(2).pdf`; numbering of images and
   files is independent.
4. **Drag-and-drop a file literally named `image.png`** → the name stays `image.png`. Same for the
   picker. Guards the "must stay untouched" scoping.
5. **Drop a file named `paste_image.png`, then paste an image** → the paste must become
   `paste_image(2).png`, because the dropped file occupies the name. *This is the test that fails
   against the `records` cache: the dropped file is invisible to `records`, so the plugin hands out
   `paste_image.png` and collides.*
6. **Simulate the transient-empty-snapshot subscription firing between two pastes** (stub
   `getSnapshot()` to return an empty `occurrences` array once) → the second paste must still see
   the first name as taken. Directly proves the conflict source is the composer snapshot (plus a
   monotonic hint) and not the prunable `records` Map.
7. **`insertReference()` rejects once, then accepts** → the paste retries with the next free index
   and succeeds; only after the bounded retry limit does it surface an error. Prevents the
   misleading "The DSH composer changed" for a naming conflict.
8. **Extension resolution:** pasted image with no extension but MIME `image/png` → `paste_image.png`;
   MIME `application/pdf` with no extension → `paste_file.pdf`; unknown/empty MIME → `paste_file.bin`.
9. **Chip/upload agreement:** assert the dock chip label and the uploaded `path` are the same
   string, including when the record has been retired (the `occurrence.label` fallback path).
10. **Unit tests for the pure `allocatePastedName()`** with an explicitly seeded taken-set, including
    a set deliberately *smaller* than reality, to prove the caller's source choice matters.

### Follow-up B

1. **Stale page, running newer:** tags endpoint returns max `v0.2.9` while `PLUGIN_VERSION` is
   `0.2.10` → the rendered chip must **not** contain `v0.2.9`; it must contain the running
   version. *This is the direct reproduction of the user's report.*
2. **Stale page, running equal/older:** max tag `v0.2.9`, running `0.2.9` → chip shows `0.2.9`
   (the running version), not the fetched tag.
3. **Positive path preserved:** fresh list including `v0.2.11`, running `0.2.10` → update chip
   naming `v0.2.11`.
4. **Staleness headers:** response with `x-cache: HIT` / `age: 178` → assert the request carries a
   revalidation directive or cache-busting parameter, and that the rendered chip still never asserts
   a version below the running one.
5. **Remote entirely behind:** list max `v0.2.8`, running `0.2.10` → current chip with the running
   version plus a staleness warning (never "latest v0.2.8").
6. **No persistence:** assert no `localStorage`/`IndexedDB` write of the fetched tag, and that a
   subsequent start with the endpoint unreachable renders the offline chip rather than resurrecting
   a previously fetched tag.
7. **`v`-prefix normalization:** `semverCmp('v0.2.11', '0.2.10') > 0` and
   `semverCmp('v0.2.9', '0.2.10') < 0`.
8. **Prerelease and pagination:** a list containing `v0.2.11-rc.1` must not be offered as the
   latest stable; a repo with more than 10 tags must still surface the newest (paginate, or use a
   single-object endpoint).
9. **Version-constant sync:** assert the inlined `PLUGIN_VERSION` in `lib/client.js` equals
   `package.json`'s `version` (see §5).

---

## 5. Lib-only release hygiene items this touches

**(a) Hand-inlined version constants.** With no build step, `PLUGIN_VERSION = '0.2.10'` is a literal
that must be edited by hand at every release (plugin-version-chip.js:5, and the file says so).
Both directions of drift are correctness bugs, not cosmetics:

- **Too low** → the chip offers an "update" to a version the user already runs (a noisy false
  positive).
- **Too high** → the chip suppresses the update entirely, so the user is *never* told a new version
  exists. That is follow-up B's failure mode in mirror image, and it is silent.

Hygiene: generate the constant from a single source of truth at release time (`npm version` hook,
`prepublishOnly` script, or a `version:sync` script that rewrites the literal from
`package.json`), **or** read the version from the plugin manifest the host already loads instead of
inlining a second copy. Add a CI assertion that the inlined constant equals `package.json`'s
`version`, and fail the release if they diverge.

**(b) Bundle syntax check.** There is no transpile, bundle, or minify pass, so nothing between the
author's editor and the user validates the shipped file. A single syntax error ships raw and the
entire client bundle fails to load — paste, drop, picker, dock, and chip all die at once, with no
build step to have caught it. Hygiene: run `node --check lib/client.js` (and every other `lib/*.js`
file) in CI and as a `pretest`/`prepublishOnly` script; additionally **execute** the bundle in Node
and call its pure helpers (`allocatePastedName`, `extensionOf`, `semverCmp`, the tag filter) so it
is not merely parsed but run. Also assert the file contains no dev-only `import`/`require` of
modules that will not exist in the browser context.

**(c) How users actually receive the update — there is no host-side update endpoint.** The host does
not poll a registry for this plugin, so the plugin cannot push or self-apply an update. The new code
reaches users only through the **web app's client-bundle delivery**: a hard refresh / cache-busted
reload, or a manual re-install of the plugin from its community source. Consequences that this task
touches directly:

- **The chip is the only in-product notification channel.** A false "already latest" does not merely
  misinform — it *permanently hides a real release* for a user who does not happen to hard-refresh
  again in the right window. That raises the cost of the §3 bug from cosmetic to blocking, and is
  why the display rule must be conservative.
- **The same staleness class applies to the bundle itself.** If `lib/client.js` is served with a
  long `max-age` (or cached by a service worker), a hard refresh does not even pick up v0.2.11's
  code, and the chip keeps running the old logic no matter how correct it is. Serve the lib-only
  bundle with a short `max-age` + revalidation, or a content-hashed/immutable URL; make sure no
  service worker serves a stale copy.
- **Release ordering must be atomic.** The tag push and the bundle publish must land together, and
  the tag must be *verified visible through the API* (cache-busted request, or `git ls-remote`)
  **before** the release is announced — the fixture shows the announcement preceded API visibility by
  minutes, which is exactly the window in which the user refreshed.
- **Make the chip actionable.** Since the plugin cannot update itself, the update chip should tell
  the user what to do (hard-refresh / reload) rather than only naming a version; and the fetch should
  force revalidation (`cache: 'no-store'`, a `Cache-Control: no-cache` request header, or a
  cache-busting query parameter) so a `HIT` with `age: 178` cannot silently win.

---

## Summary

| # | Defect | Root cause | Fix |
|---|---|---|---|
| A | All pasted screenshots named `image.png` | No renaming on the paste path; the only duplicate check was in-batch | Rename on the **paste path only** (drop/picker untouched): `paste_image(n).ext` / `paste_file(n).ext`, lowest-unused `n` continuing across pastes |
| A′ | (latent) re-collision after the fix | `records` is pruned by the transient-empty-snapshot subscription, so it under-reports taken names | Authoritative source = **live composer `occurrences` snapshot**, re-read per allocation, plus a monotonic add-only hint; host accept/reject as final arbiter with bounded retry |
| B | Green chip: "already the latest version v0.2.9" | Edge-cached (`x-cache: HIT`, `age: 178`, `s-maxage=300`) tag list treated as truth, and the chip **displayed the fetched tag** | Compare **fetched newest tag vs the running `PLUGIN_VERSION`**; **display the running version**; discard any fetched tag below it; never persist it; cache-bust the fetch |
| B′ | (latent) hand-inlined version drift | `PLUGIN_VERSION` maintained by hand in a build-free bundle | Generate/sync from `package.json`, assert equality in CI; `node --check` + execute the pure helpers; verify tag visibility before announcing |

Both follow-ups reduce to one rule: **when a locally-known value and a cached remote/derived value
disagree, the locally-known value wins and the cached one is never shown.**


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.