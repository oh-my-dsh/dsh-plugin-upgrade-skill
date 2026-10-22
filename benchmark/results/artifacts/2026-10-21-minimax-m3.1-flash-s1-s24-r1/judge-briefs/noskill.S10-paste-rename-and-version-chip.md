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
#### FILE: S10-paste-rename-and-version-chip/S10-report.md

# S10 · Paste Renaming & Version-Chip Follow-Ups — Design & Fix Report

Plugin: `@org/dsh-attach-input` (community Web plugin, **lib-only bundle, no build step**), post-v0.2.10.
Evidence read (read-only, unmodified): `fixture/README.md`, `fixture/plugin-attachment-flow.js`,
`fixture/plugin-version-chip.js`, `fixture/user-threads.md`, `fixture/tags-api-response.txt`.
Scope: design + regression plan for Follow-up A (unified paste renaming) and
Follow-up B (the green chip that claimed "already the latest version v0.2.9").

---

## 0. Executive summary

| # | Question | Answer in one line |
|---|----------|--------------------|
| A | Where does renaming happen? | At the **paste acquisition boundary only** — the acquisition source must be carried into `add()`, and only `source === 'paste'` items are renamed; drop/picker items pass through byte-identical. |
| A | What names? | `paste_image.<ext>` for pasted images, `paste_file.<ext>` for other pasted files, with the *same* index sequence per base: `paste_image.png`, `paste_image(2).png`, `paste_image(3).png`… and `paste_file.pdf`, `paste_file(2).pdf`… |
| A | Which index? | A per-session, per-base, **monotonic** counter as the proposal, then **verified against the authoritative taken-set**; the first free index wins and the counter never moves backwards. |
| A | Authoritative "names already taken"? | The **DSH composer input-state snapshot** (`input.state.getSnapshot().occurrences`) — the host's own state — **plus** the names reserved earlier inside the current `add()` call. **Not** the plugin's `records` Map: that map is a *display* cache that self-invalidates. |
| B | Why did the chip say v0.2.9? | The tag read was served from a **stale CDN-cached** GitHub API response (`x-cache: HIT`, `age: 178`; the page predates even v0.2.10), and the chip **rendered the fetched tag** in the slot that means "the version you are running". Two independent defects: stale read + wrong value displayed. |
| B | Which two values compare, which is shown? | Compare the newest stable tag **observed remotely** against the **locally-known running version** (`PLUGIN_VERSION`). The green "already latest" chip shows the **running version**; the "update available" chip shows the **remote tag**. A remote read *older* than the running version is treated as **stale → "could not verify"**, never as "you are the latest". |
| — | Tests | 9 + 4 + 1 named regression cases (§4). The two that matter most: *renaming must not depend on a records-cache entry surviving*, and *the green chip must never contain a remote tag*. |
| — | Release hygiene | Version constant ↔ `package.json` machine-checked, shipped file parse-checked (no build step = no compiler to catch you), and the chip can only **inform** — the update arrives via the host/plugin install path plus a client reload. |

---

## 1. Follow-up A — the renaming design

### 1.1 Exact naming scheme

| Acquisition path | Item kind | Resulting name | Examples |
|---|---|---|---|
| **Paste** | image (MIME `image/*`, or an image extension) | `paste_image<ext>` + index | `paste_image.png`, `paste_image(2).png`, `paste_image(3).png` |
| **Paste** | anything else | `paste_file<ext>` + index | `paste_file.pdf`, `paste_file(2).pdf`, `paste_file.zip` |
| **Drag-and-drop** | any | **unchanged — the real name** | `image.png`, `quarterly-report.pdf` |
| **File picker** | any | **unchanged — the real name** | `image.png`, `notes.md` |
| **Folder picker** | any | **unchanged — the real name** | every file keeps its own name |

Rules that make the scheme unambiguous:

* **Two independent index sequences.** `paste_image` and `paste_file` are separate counters. A pasted image and a pasted PDF in the same session yield `paste_image.png` and `paste_file.pdf` — index 1 of each base, no shared counter.
* **Index 1 is un-suffixed.** `paste_image.png`, not `paste_image(1).png`. The suffix `(n)` appears only from the second occurrence of that base, exactly as the user asked.
* **The suffix goes before the extension.** `paste_image(2).png`, never `paste_image.png(2)`.
* **The extension is carried over from the original name** (§2), so the pasted `image.png` becomes `paste_image.png` and a pasted `screenshot.jpg` becomes `paste_image.jpg`.
* **Indices are per composer/session.** Two sessions each get their own `paste_image.png`; names only need to be unique inside the composer that holds them.

### 1.2 Where the rename must be applied — and what must stay untouched

**Problem with the current shape.** In the shipped `add()` all three acquisition paths (paste, drop, picker) funnel into the same function, and the file name is copied verbatim:

~~~js
const label = item.path;   // ← pasted "image.png" stays "image.png"
~~~

So `add()` **cannot tell** where an item came from: a pasted clipboard image and a dropped `image.png` are byte-identical at that point. The fix therefore has two halves, and **both** are required:

1. **Tag the acquisition source at the call site.** The paste handler calls `add(sessionId, items, { source: 'paste' })`; the drop handler calls it with `{ source: 'drop' }`; the picker (file *and* folder) with `{ source: 'picker' }`. This is the *only* way the rename can be scoped to one acquisition path.
2. **Apply the rename inside `add()`, gated on that tag** — `if (source !== 'paste') prepared.push(item)` — so the drop and picker branches are **unchanged code paths**, not "renamed then restored". Never rename-then-undo: that would still mutate `item.path` for dropped files for a moment, and could leak the mutation into the upload body.

**What must stay untouched (hard requirements):**

* **Drop / picker / folder-picker items** — their `path`, their `name`, and the record `label` derived from them. The user asked for their real names; more importantly, a dropped/picked file's path is a *real* filesystem path that the host/backend may resolve. A rename there would be a functional bug, not a cosmetic one.
* **The upload body's `path` field for non-pasted items** — `files: record.items.map(item => ({ path: item.path, ... }))` must keep sending the real path for dropped/picked files.
* **The `validateItems` size total and the "No files were selected" guard.**
* **Everything outside the plugin** — no change to the DSH input API, no new service, no host change.

**Where exactly in `add()` (order of operations).** The rename must happen **before** `validateItems()`, and the duplicate check must then run on the **final** names:

~~~js
const add = async (sessionId, items, opts = {}) => {
  const source = opts.source ?? 'picker';          // 'paste' | 'drop' | 'picker'
  const reserved = new Set();                       // names claimed during THIS call
  const prepared = [];
  for (const item of items) {
    if (source !== 'paste') { prepared.push(item); continue; }   // real names pass through
    const snapshot = input.state.getSnapshot();                  // fresh read per item
    const taken = takenNames(snapshot, sessionId);
    const name = allocatePasteName(item, sessionId, taken, reserved);
    reserved.add(name);
    prepared.push({ ...item, path: name });                       // chip AND upload agree
  }
  validateItems(prepared);          // duplicate check now sees the FINAL names
  ...
  for (const item of prepared) {
    const label = item.path;       // ← now the unified name for pastes
    ...
  }
};
~~~

Two reasons for that ordering, both concrete:

* **The existing in-batch duplicate check would otherwise still throw for the exact case the user reported.** The browser hands every pasted screenshot the same `image.png`, so a *single* paste event carrying two screenshots makes `validateItems` hit `Duplicate attachment path: image.png` and reject the whole batch. Today the user's report ("every chip is called image.png") is the *lucky* path where each paste is a separate event; pasting two at once fails outright. Renaming first and checking the final names fixes both.
* **The number must be allocated against live composer state**, so the snapshot has to be read at allocation time — i.e. before the records are created and before the reference is inserted.

**Where the name ends up.** Because the chip renders `record?.label ?? occurrence.label` and the upload body maps `item.path`, writing the unified name into the *item* (as a copy — `{ ...item, path: name }`, so the caller's object is not mutated) makes **one** value flow to both the dock chip and the uploaded path. There is no second place to keep in sync, and no way for the chip and the upload to disagree. *(A pasted item has no real filesystem path anyway — `"image.png"` is already synthetic — so relabelling it costs nothing semantically; a dropped item's path is real and is never touched.)*

### 1.3 How the number is chosen

Two mechanisms, deliberately separated:

**(a) A proposal counter — monotonic, per session, per base.**

~~~js
const counter = new Map();   // sessionId -> { paste_image: n, paste_file: n }
~~~

The counter only ever increments. It is a *hint*, never the source of truth about what is in use. A monotonic counter can never hand out a name that is currently occupied; it only guarantees that indices never move backwards and that the sequence reads naturally (`paste_image.png`, `paste_image(2).png`, `paste_image(3).png`).

**(b) The authoritative taken-set — the final arbiter.**

The candidate index is incremented until the produced name is **not** in the taken-set and **not** already reserved inside the current call:

~~~js
function allocatePasteName(item, sessionId, taken, reserved) {
  const base = baseNameFor(item);          // 'paste_image' | 'paste_file'
  const ext  = extensionFor(item);
  const c = counter.get(sessionId) ?? {};
  let n = (c[base] ?? 0) + 1;
  for (;;) {
    const name = n === 1 ? base + ext : base + '(' + n + ')' + ext;
    if (!taken.has(name) && !reserved.has(name)) { c[base] = n; counter.set(sessionId, c); return name; }
    n += 1;                                  // authoritative skip
  }
}
~~~

Consequences worth stating explicitly:

* The **number is chosen by the first index that is actually free**, not by "count of pastes". If `paste_image.png` is still in the composer, the next paste is `paste_image(2).png` even if the plugin's own counter was reset.
* The **index stream is per base, not per base+extension** (so the sequence reads as one stream), while **taken-ness is judged on the full final name** (base + index + extension). Hence `paste_image.png` and `paste_image.jpg` are distinct names, and a JPEG pasted after a PNG is still `paste_image(2).jpg` — never a stray `paste_image.jpg` that reads like a "first".
* **The taken-set is re-read per item**, because the composer state changes as items are inserted and the current loop already re-reads the snapshot inside the loop.
* **The per-call `reserved` set** covers the window where an item is allocated but its occurrence is not yet visible in the snapshot (the reference has not been inserted, or the snapshot has not been flushed). Without it, two screenshots pasted in one event could both be named `paste_image.png`.

### 1.4 The authoritative "names already taken" source — and why the plugin's `records` Map is the wrong one

**The authoritative source is the DSH composer's own input state:**

~~~js
input.state.getSnapshot().occurrences
~~~

i.e. the live occurrences the host reports for the target composer/session — filtered to this plugin's `source` and to the target session. This is the host's ground truth about what is currently in the composer, and it is the same data the alive-subscription already consults. The plugin's taken-set is derived from it:

~~~js
function takenNames(snapshot, sessionId) {
  const names = new Set();
  for (const o of snapshot?.occurrences ?? []) {
    if (o.source !== SOURCE) continue;                                   // only our own attachments
    if (o.sessionId && o.sessionId !== sessionId) continue;               // per-composer scope (field unconfirmed, see §6)
    const n = o.label ?? o.name ?? o.path;                               // occurrence carries the display name
    if (typeof n === 'string' && n) names.add(n);
  }
  return names;
}
~~~

**Why the `records` Map alone is the wrong source.** The `records` Map is not a registry of the composer's contents; it is a *rendering* cache keyed by `ref`, and it has a self-invalidating eviction path:

~~~js
const unsubscribe = input.state.subscribe(() => {
  const current = input.state.getSnapshot();
  const alive = current.occurrences.some(o => o.source === SOURCE && o.ref === ref);
  if (alive || record.inflight !== undefined) return;
  unsubscribe();
  records.delete(ref);        // ← fires on ANY momentary empty snapshot
  changed();
});
~~~

Concretely, it is wrong for four independent reasons:

1. **It is retired by a momentary-empty check.** The subscription fires on *every* state change, and the liveness test is "does the current snapshot contain my occurrence?". Any transient snapshot that does not contain it — a re-keyed/renumbered occurrence, a batched or partial state flush, a snapshot taken between a remove and an insert, a session switch, a composer re-render that re-issues occurrences under new refs, or a plugin-side occurrence briefly dropped during a re-order — retires the entry while the attachment is still visibly in the composer. The chip even proves the entry can be gone: it renders `record?.label ?? occurrence.label`, i.e. there is a supported state in which the record is **missing** and the occurrence still has to be labelled. In that state the name is freed and the next paste reuses `paste_image.png` while the old attachment is still on screen → two chips with the same name, which is exactly the bug we are trying to remove.
2. **The Map is per plugin instance, per page load.** It knows nothing about occurrences the composer holds that this plugin did not create in this session: a restored/reloaded session, an attachment inserted by another source, or a second client instance attached to the same composer. The composer knows; the Map does not.
3. **The Map is also emptied on ordinary lifecycle events** — the `insertReference` rejection path deletes the ref, and a composer change or session teardown drops entries. Those are *not* evidence that the name is free.
4. **Its eviction timing is a race with the allocator.** The allocator would have to assume "the Map is authoritative", and the Map's own subscription can delete an entry between the allocator's read and the next paste. Any correctness argument that depends on the Map's contents is therefore unsound.

**Conclusion:** use the Map **only** for rendering (`record?.label ?? occurrence.label`) and for per-item bookkeeping. The *allocator* must consult the composer snapshot plus the in-flight reservation set. That is the whole point of the change: the plugin's own cache is a lossy mirror of state the host already owns authoritatively.

*Design note (belt and braces):* if the occurrence objects turn out not to carry a name field in some host version, the allocator should fall back to a **union** of (a) the composer snapshot names and (b) the names of the items currently referenced by the composer as exposed by the input API — never to the `records` Map as the primary source. See §6 for what the fixture does and does not confirm about the occurrence shape.

---

## 2. Extension rule, and what the chip and the upload path each display *(guidance — not scored)*

### 2.1 Extension rule — original name first, MIME fallback second

1. **Original name wins.** Take the extension of the *original* file name (a clipboard image named `image.png` → `.png`; `screenshot.jpg` → `.jpg`). This is the extension the user's own file had, so it must not be second-guessed.
2. **MIME fallback** when the original name carries no usable extension (clipboard blobs are often named `blob`, or with no extension at all): map the MIME type to an extension via a small table — `image/png→.png`, `image/jpeg→.jpg`, `image/gif→.gif`, `image/webp→.webp`, `image/svg+xml→.svg`, `application/pdf→.pdf`, `text/plain→.txt`, `application/zip→.zip`, `text/csv→.csv`, `application/json→.json`, `video/mp4→.mp4`, etc.
3. **No extension at all** if neither is available: emit the bare base (`paste_image`, `paste_file`) rather than inventing one. Never emit a trailing dot.
4. **Image classification** uses the MIME type first (`/^image\//i`), with an image-extension set as the fallback when the type is empty/unknown. A pasted `image.png` with a missing MIME is still an image.

### 2.2 What each surface displays

| Surface | Pasted item | Dropped / picked item |
|---|---|---|
| **Dock chip** (`record?.label ?? occurrence.label`) | the unified name — `paste_image(2).png` | the real name (unchanged) |
| **Uploaded path** (`files: record.items.map(item => ({ path: item.path, ... }))`) | the unified name — `paste_image(2).png` | the real path (unchanged) |

Because the rename is written into the item itself, the chip and the uploaded path are **the same string** — a user can match a chip to the file that arrived on the server without a translation step. The uploaded path for pasted files was already synthetic (`image.png`), so nothing real is lost by making it the unified name; for dropped/picked files the real path is preserved end-to-end.

---

## 3. Follow-up B — why the chip claimed "already the latest version v0.2.9"

### 3.1 Root cause

**Fact 1 — the read was stale.** The captured response (taken ~90 s after the `v0.2.11` push) is a **CDN cache hit**: `x-cache: HIT`, `age: 178`, `cache-control: private, max-age=60, s-maxage=300`. The tag list it returned contains only `v0.2.9`, `v0.2.8`, `v0.2.7` — the cached page **predates even v0.2.10**. `git ls-remote` in the same capture proves `v0.2.10` and `v0.2.11` both exist on the remote. The read was not wrong about the remote; it was an **old copy of it**.

**Fact 2 — a stale read is silently accepted as ground truth.** `latestFromTags()` only checks `res.ok` and the presence of at least one stable tag. A 200 from a cache that is 178 s old is indistinguishable from a fresh 200, so the function returns `v0.2.9` as "the latest version" and the caller has no way to know it is looking at a pre-push snapshot. There is no cache-busting on the request (no `Cache-Control: no-cache`, no unique query parameter), no conditional-request validation, and no sanity check of the result against the version the client already knows.

**Fact 3 — the wrong value was displayed.** The comparison itself (`semverCmp(tag, PLUGIN_VERSION) <= 0` → "already latest") is structurally correct: `v0.2.9 ≤ 0.2.10` → "you are up to date". The defect is in **which number the chip prints**: `renderCurrentChip(tag)` prints the **fetched** tag, so a user running 0.2.10 was told they were on 0.2.9 — a version *older* than the one they are running, presented as authoritative. Two separate lies in one string: "this is your version" (false) and "this is the latest version" (false — 0.2.11 existed, and the fetched set provably did not even contain the user's own version).

**Fact 4 — the one-shot nature made it stick.** The check runs once when the chip starts and the green chip auto-dismisses after ~4 s, so the user's only chance to see the (wrong) state was that 4-second window. The user reports it "changed its mind" later — that is the CDN entry expiring (`s-maxage=300`) and a later load finally reading a fresh page. The correct information (`v0.2.11` exists) was never surfaced, because the stale read was treated as the truth.

**Root cause in one sentence:** the chip treated a **cached remote read** as ground truth for "the latest version" and then **rendered that remote value in the slot that means "the version you are running"**, instead of comparing the remote observation against the locally-known running version and displaying the latter.

### 3.2 The display rule the chip should follow

**Compare these two values:**

* **remoteNewest** = the newest stable tag the check *observed* (already filtered by `/^v\d+\.\d+\.\d+$/` — pre-releases are correctly excluded; the max is computed with `semverCmp`, which is order-independent and therefore correct).
* **running** = `PLUGIN_VERSION`, the version **this bundle is actually running** — the locally-known, hand-inlined constant.

**Then:**

| Condition | Chip | Number shown |
|---|---|---|
| `remoteNewest > running` | "update available" | **remoteNewest** (the version they can get) — plus how to get it (§5.4) |
| `remoteNewest === running` | green "already the latest" | **running** (`PLUGIN_VERSION`) |
| `remoteNewest < running` | **not** "already the latest" — the read is provably stale (it does not contain the running version, so it cannot be a current view of the registry) → render the "could not verify / offline" state | **none** (or `running` in a chip that only claims *your* version) |
| fetch failed / no stable tags | offline / unknown state | none |

**The invariants:**

1. **The green "already the latest version X" chip shows `running` — never a fetched remote value.** With `PLUGIN_VERSION = '0.2.10'` the chip must read *"✓ attach-input already the latest version **0.2.10**"*. The string `v0.2.9` must not be reachable in that chip for a 0.2.10 client.
2. **The "update available" chip shows the remote tag** — that is the only place a fetched value belongs, and only when the fetched value is genuinely *newer* than the running one.
3. **A remote observation older than the running version is treated as stale, not as "you are up to date".** This is the version-independent safeguard: it is exactly the shape of the captured response (`v0.2.9 < 0.2.10`), and it converts the incident from "the chip lied about your version" into "the chip said it could not check". It also fires for the deeper failure mode — a tag endpoint advertising a version the client already has is proof the response is not current.
4. **Never let a fetched value stand in for a local one.** The running version is known locally and exactly; the remote value is a guess about someone else's state, subject to caching, propagation and races. A chip is a statement about *your* client: it may say "you are running X" with certainty, and "Y is available" only with the caveats above.

**Paired with the staleness fix (the read itself):**

* Add cache-busting to the request: `Cache-Control: no-cache, no-store, max-age=0` (and `Pragma: no-cache`) request headers **plus** a unique query parameter (e.g. `&_=${Date.now()}`) to defeat the CDN cache key. (Unconfirmed whether the CDN in front of the API honours the request header alone — the query parameter is the belt-and-braces option; the invariant in rule 3 is the safeguard that does not depend on CDN behaviour at all.)
* Keep the `?per_page=10` fetch but never trust the *ordering* — the `reduce`/max over the filtered set is already order-independent.
* Re-check periodically (or on visibility/focus) rather than once at chip start, so a transient stale read does not become the user's only information source; and never let a green "up to date" chip dismiss before a re-check has had a chance to run.

**What the user should have seen in the incident window:** the running version 0.2.10 in a chip that either says "up to date" *without* a bogus number, or — with the fresh-read fix in place — "update available: v0.2.11". Never "already the latest version v0.2.9".

---

## 4. Regression tests that would have caught both follow-ups

(Framework-agnostic; the repository's actual test runner and CI configuration are not in the fixture — see §6.)

### 4.1 Follow-up A — renaming

| ID | Test | Setup | Assertion |
|---|---|---|---|
| **A1** | Single pasted image | paste event with one item, name `image.png`, type `image/png` | record label **and** uploaded `path` are `paste_image.png` |
| **A2** | Several pasted images in **one** event | one paste event with 3 clipboard images, all named `image.png` | labels/paths are `paste_image.png`, `paste_image(2).png`, `paste_image(3).png`; **and the batch is not rejected** (this is the case that today throws `Duplicate attachment path: image.png` from `validateItems`) |
| **A3** | Pasted non-image | one paste event with a PDF named `image.png`, type `application/pdf` | `paste_file.pdf`; a second pasted PDF → `paste_file(2).pdf`; the image and file sequences are **independent** |
| **A4** | **Scoping: drop and picker keep real names** | the same file `image.png` delivered through the **drop** path and through the **file picker** path, and a file via the **folder picker** | label and uploaded `path` are the **original** name/path, byte-identical to the input; no `paste_` prefix appears; the drop/picker path never reaches the renamer |
| **A5** | **Authoritative source beats the records cache** (the key test) | the composer snapshot still contains an occurrence named `paste_image.png`, but the `records` Map has been emptied (simulate the alive-subscription retiring the entry on a momentary-empty snapshot) | the next pasted image is named `paste_image(2).png`, **not** `paste_image.png` — i.e. the allocator does not consult the `records` Map for taken-ness |
| **A6** | Collision with a name the plugin does not own | the snapshot contains an occurrence from another source/session carrying `paste_image.png` | the next paste does not reuse `paste_image.png` (or, per the chosen scope rule, is proven to be out of scope — the test pins the intended scope) |
| **A7** | Extension rule | paste with name `image.png`/`image/png`; paste with name `blob`/`image/jpeg`; paste with name `blob` and no MIME | `paste_image.png`; `paste_image.jpg`; `paste_image` (no trailing dot, no invented extension) — and a non-image `blob`/`application/pdf` → `paste_file.pdf` |
| **A8** | Session scoping | paste in session A and in session B | indices are per session: both may legitimately start at `paste_image.png`; a paste in A must not be blocked by a name that only exists in B |
| **A9** | Chip and upload agree | one pasted image | the rendered chip text and the upload body's `path` are the same string, and both equal the unified name; for a dropped file both equal the real name |

### 4.2 Follow-up B — version chip

| ID | Test | Setup | Assertion |
|---|---|---|---|
| **B1** | **Stale read (the reported incident)** | `PLUGIN_VERSION = '0.2.10'`; the tag check returns `['v0.2.9','v0.2.8','v0.2.7']` (the captured response) | the chip does **not** render "already the latest version v0.2.9"; the green chip, if shown, contains **0.2.10**; the remote tag `v0.2.9` appears nowhere in the chip text; because `v0.2.9 < 0.2.10`, the preferred behaviour is the "could not verify" state, and the chip must not claim "already the latest" |
| **B2** | Fresh read → update available | `PLUGIN_VERSION = '0.2.10'`; the check returns `['v0.2.11','v0.2.10']` | the update chip shows **v0.2.11** and the comparison is remote-vs-running (not running-vs-remote) |
| **B3** | Green chip shows the **running** version | `PLUGIN_VERSION = '0.2.10'`; the check returns `['v0.2.10']` | the chip reads "already the latest version **0.2.10**" — sourced from the local constant; a regression that renders the fetched string is caught by asserting the *value source*, e.g. by making the fetch return an equal-looking but different value, or by asserting the rendered text equals the local constant |
| **B4** | Request hygiene | spy on `fetch` | the tag request carries cache-busting (`Cache-Control: no-cache` **and/or** a unique query parameter), so a CDN-cached page cannot be served as the "current" tag list |

### 4.3 Supporting test (release hygiene, ties A/B to the build)

| ID | Test | Assertion |
|---|---|---|
| **H1** | The hand-inlined `PLUGIN_VERSION` in `lib/client.js` equals the `package.json` version | a mismatch fails CI — this is the check that keeps the locally-known running version (the value §3.2 compares against) trustworthy |

---

## 5. Lib-only release hygiene touched by this work

### 5.1 The hand-inlined version constant

* `lib/client.js` carries `const PLUGIN_VERSION = '0.2.10';` — with **no build step there is no compiler to inject it**, so it is hand-maintained and hand-synchronised with `package.json`. Every release touches two files that must agree.
* **Make the agreement machine-checked, not a reviewer's job.** A CI step (or a pre-release script) must assert `PLUGIN_VERSION === package.json.version`. This is test **H1**, and it is the foundation of the §3.2 fix: the chip's correctness rests entirely on the local constant being the true running version. A forgotten bump makes the chip lie in the *opposite* direction ("you are up to date 0.2.10" while 0.2.11 is actually running).
* **Keep exactly one copy.** Either the constant is the single source and `package.json` mirrors it, or vice versa — but there must not be a third copy (a README badge, a changelog header, a manifest) that drifts. Any *other* place that prints a version (release notes, chip help text) should read the same value.
* **Do not derive the running version from the network.** The point of the local constant is that it is exact and offline-verifiable. Never replace it with "the version I just fetched" — that is precisely the defect in §3.

### 5.2 Bundle syntax check (there is no build to catch you)

* With a lib-only bundle, **the shipped file *is* the source file**: there is no transpile, no bundler, no type-check pass between the source and the browser. A stray syntax error ships as a broken plugin that fails at runtime in the client, with no CI signal from a compiler.
* The release pipeline must therefore include an explicit **parse check of the exact bytes that ship**:
  * a syntax/parse check of every shipped `.js`/`.mjs` file (ESM-aware — `node --check` under a `"type": "module"` package, or an equivalent parser) — and the check must run against the *file that is published*, not a copy;
  * a bundler-less smoke load of the module in the test environment (import it and exercise the exported functions) to catch missing exports, top-level `await`, and browser-only globals that break module evaluation;
  * the full test suite (including §4) green **before** the tag is pushed.
* Because the Web client may serve a cached bundle, a syntax error is not "fails loudly" — it is "the client keeps running the old bundle" or "the plugin silently disappears from the composer". The parse check is the only guard.

### 5.3 Tag / publish ordering

* The **tags endpoint is the release advertisement** the chip polls. Push the tag only **after** the new package version is actually installable, otherwise the chip can advertise a version users cannot get (the mirror image of the incident).
* Keep the stable-version filter `/^v\d+\.\d+\.\d+$/` (it correctly hides `-rc`/`-beta` tags) and keep computing the max with a semver comparison rather than by list position — the current `reduce` with `semverCmp` is already order-independent and correct; that part should not be "simplified" into `tags[0]`.
* Tag naming must stay `vX.Y.Z`; the chip's parser, the release process and the package version must use the same scheme.

### 5.4 How users actually receive the update (no host-side update endpoint)

* This plugin has **no host-side update endpoint**: the chip cannot install anything, and must not pretend otherwise. It is a **notifier**, not an updater.
* The real update path is: **publish the new plugin package version → the user updates the plugin through the host's plugin install/update flow (the community plugin package is pulled from its registry) → the Web client is reloaded (hard refresh) so the new bundle is served.** If a given host build ships the plugin inside the host bundle instead, the update arrives with the host upgrade — same principle: the chip only reports, the delivery is the host/plugin-manager path plus a client reload.
* Consequences for the chip copy and the release notes:
  * the "update available" chip should say **what to do** ("update the attach-input plugin, then reload the web client") rather than imply a one-click install;
  * the release notes must state the same, because the browser may serve a cached bundle — a **hard refresh** is part of the update instruction;
  * the green "already the latest" chip is a statement about the **running bundle**, so after updating the plugin the user must reload before the chip can change — worth one line of copy.
* Because the chip's "latest" comes from the *tag list* and the running version from the *bundle*, a user who updates the plugin but has not reloaded still sees the old version — again a copy problem, not a logic problem, provided the chip's version source stays the local constant.

---

## 6. Unconfirmed / out of scope

Marked rather than guessed, per the brief:

* **Occurrence object shape.** The fixture shows `occurrences` entries with `source` and `ref`, and the chip's `record?.label ?? occurrence.label` implies an occurrence may carry a `label`. Whether every occurrence also carries `name`/`path`, and whether it carries a per-session field, is **not** shown. §1.4 therefore reads the name defensively (`o.label ?? o.name ?? o.path`) and treats a session field as optional.
* **The exact host/plugin update UI.** The brief states there is no host-side update endpoint; the fixture does not show the host's plugin-manager screens, so §5.4 states the general channel (registry → plugin install/update → client reload) rather than specific UI steps.
* **CDN header semantics.** Whether the CDN in front of the API honours a request-side `Cache-Control: no-cache` is not determinable from the capture; the query-parameter cache-buster and the "older than running ⇒ stale" rule are specified so the fix does not depend on that.
* **Test runner / CI configuration.** Not present in the fixture; the §4 cases are written framework-agnostically.
* **Out of scope by instruction:** no live-host introspection was performed, and no fixture file was modified. All statements above derive from the five fixture files listed at the top of this report.

---

*End of report.*


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.