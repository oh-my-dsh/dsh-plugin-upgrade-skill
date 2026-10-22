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
#### FILE: S10-paste-rename-and-version-chip/S10-paste-rename-and-version-chip.md

# S10 · Paste Renaming & Version-Chip Follow-Ups — design + test + release plan

**Mode**: read-only inspection (skill Mode A; no fixture write, no install, no execution, no network).
**Subject**: `@org/dsh-attach-input` v0.2.10 — lib-only Web Client plugin, no build step.
**Evidence read** (read-only pack): `fixture/README.md`, `fixture/plugin-attachment-flow.js`, `fixture/plugin-version-chip.js`, `fixture/tags-api-response.txt`, `fixture/user-threads.md`.

---

## 0. Summary

Two defects, one habit: **trusting a cheap, stale copy instead of the authoritative owner of the fact.**

- **A** — the paste path has no naming step at all: `const label = item.path` (flow excerpt line 24), so every clipboard screenshot keeps the browser name `image.png`. Fix: rename **only** on the paste acquisition path, numbered against the **composer's live occurrence set** — not against the plugin-side `records` Map, whose alive-subscription deletes an entry on *any* momentary empty snapshot (line 36) and so forgets names that are still on screen.
- **B** — the chip compares a **CDN-cached** tag list against the locally known running version and then *renders the fetched tag* as the "latest" value. The captured response proves the window: `x-cache: HIT`, `age: 178`, `s-maxage=300`, payload `v0.2.9/v0.2.8/v0.2.7` — both `v0.2.10` and `v0.2.11` absent although `git ls-remote` shows both. Fix: the remote value is a *candidate*, the local `PLUGIN_VERSION` is the only ground truth, and a remote value **older than running** is an "unconfirmed" state, never an "already latest" claim.

Scored items are §1, §3, §4, §5; §2 is the completeness item.

---

## 1. Follow-up A — unified paste renaming

### 1.1 Naming scheme (exact)

| Pasted item | 1st | 2nd | 3rd |
|---|---|---|---|
| image (`file.type` starts with `image/`) | `paste_image.<ext>` | `paste_image(2).<ext>` | `paste_image(3).<ext>` |
| any other file | `paste_file.<ext>` | `paste_file(2).<ext>` | `paste_file(3).<ext>` |

- Family is chosen by **MIME** (`image/*` → `paste_image`, everything else → `paste_file`), because the browser clipboard name carries no trustworthy classification.
- The counter sits **before the extension**, in parentheses, no space, no zero padding, and index 1 has no suffix — exactly the scheme the user asked for: `paste_image.png`, `paste_image(2).png`, …
- The two families keep **independent counters**: one pasted image plus one pasted PDF are `paste_image.png` and `paste_file.pdf`, not `paste_file(2).pdf`. Users read them as two families; interleaving makes the numbers look arbitrary.
- Taken-name comparison is **normalized** (NFC, lower-cased, trimmed) because the final names may land on case-insensitive filesystems; the *displayed* name keeps the scheme's lower-case form.

### 1.2 Where in the flow the rename must be applied

**At the paste acquisition boundary only — inside `add()`, gated by an explicit origin argument, before the record exists and before `insertReference`.**

1. `add(sessionId, items, { origin })` gains an explicit `origin: 'paste' | 'drop' | 'picker'`. **The default is the non-renaming path**, so every caller that has not opted in (today's drop/picker handlers, plus any future surface such as "insert from workspace") keeps real names by construction rather than by remembering to opt out.
2. The three current call sites pass their real origin; only the paste handler passes `'paste'`.
3. Names are planned **before** `records.set` and **before** `insertReference`, and the same string feeds three things: `record.label`, `record.uploadPath`, and the `label` handed to `insertReference`. That triple-write is what stops the dock chip and the composer occurrence from disagreeing — the chip's own fallback is `record?.label ?? occurrence.label` (line 44), so both sides must already carry the final name.
4. The name is **reserved synchronously**, in the same tick, before any `await` (the insert is async). Two paste events arriving back-to-back must not both plan `paste_image.png`.
5. Rename **must not** live in `validateItems` (it validates, it does not own naming), and **must not** happen at upload time: renaming late leaves the chip showing one name while the stored file gets another, and the occurrence — the thing the composer owns and renders — would still say `image.png`.

**Ordering trap to fix in the same change.** `validateItems` throws on duplicate `item.path` *within one batch* (line 11). A single clipboard paste carrying two images (both named `image.png`) is therefore rejected today with "Duplicate attachment path". After renaming, batch names are unique by construction, so the duplicate check must run on the **planned (post-rename) names for the paste origin**, and on the incoming real paths for every other origin. Otherwise the feature's most obvious case dies in validation before it ever reaches the renamer.

### 1.3 Which paths must stay untouched

| Acquisition path | Label / upload name | Rename? |
|---|---|---|
| Clipboard paste | planned `paste_image…` / `paste_file…` | **yes** |
| Drag-and-drop (`DataTransfer.files`) | `item.path` verbatim | no |
| File picker (`<input type=file>`) | `item.path` verbatim | no |
| Directory / folder picker | `item.path` verbatim, including its relative subpath | no |
| Any other or unknown origin | `item.path` verbatim (default branch) | no |

Rule to put in the code comment: *the browser's clipboard name is the only name the user never chose, so it is the only one we may replace.* A drop or picker item keeps the path its filesystem gave it, even when that name happens to be `image.png` or `paste_image.png`.

### 1.4 How the number is chosen

`n` is the **smallest integer ≥ 1** whose candidate (`paste_image` for n = 1, then `paste_image(n)`) is not in the taken set. The loop skips taken slots; there is no monotonic memory and no gap after a skip.

Taken set, unioned at plan time:

1. **Live occurrences in this session's composer** — `input.state.getSnapshot().occurrences` filtered `o.source === SOURCE`, mapped to their current labels. This is the authoritative set (§1.5).
2. **Names already planned in this batch**, so `(2)` follows `(1)` inside one multi-file paste.
3. **Names reserved by inserts still in flight** — the reservation taken in §1.2.4, released if `insertReference` returns false, i.e. the existing `records.delete(ref)` rollback on `!accepted` (line 28) gains a matching reservation release.

Policy decision to state out loud: because the oracle is the **live** occurrence set, removing an attachment frees its number and the next paste reuses the lowest free slot. That is deliberate (short, deterministic, chat-app-like). Never-reuse numbering would need a **per-session monotonic counter persisted next to the session** — not the module-level `records` Map, which is wiped by reload and shared across sessions.

### 1.5 The authoritative "already taken" source — and why `records` is the wrong one

**Authoritative source: the composer state itself.** The plugin only calls `input.insertReference(...)`; the composer owns the resulting occurrence list and republishes it through `input.state.getSnapshot()`. That snapshot is the only structure that (a) is the thing actually rendered, (b) survives independently of this module's lifecycle, and (c) reflects every attachment in that composer no matter who inserted it.

`records` is a **display cache with a deletion heuristic**, so using it as the numbering oracle imports that heuristic into correctness:

1. **Retirement fires on absence, and absence is ambiguous.** The subscription (lines 31–38) treats the *first* snapshot where no occurrence matches `o.ref === ref` as proof of deletion and calls `records.delete(ref)`. But a momentary empty or partial snapshot is normal: re-render churn, session switch, composer remount, a snapshot read mid-insert before the occurrence is attached, or any unrelated state bump. The record is then forgotten forever while the attachment is still visible. The next paste reuses `paste_image.png`, the composer holds two identically named attachments, and the bug this change exists to remove is silently reintroduced.
2. **It is module-level, not composer-level.** `records` lives for one page/module instance; reload, remount, or a second composer/tab starts empty. Occurrences restored from persisted composer state, or inserted by another surface, are invisible — so the first paste after any of those events collides.
3. **It is keyed for rendering (`ref` → record), not for name accounting.** No per-session index, no name index; answering "is this name free" needs a full scan that still inherits (1) and (2).
4. **It records what this code inserted, not what exists.** The composer is the single writer of truth; duplicating that truth in an evictable cache is exactly how the two drift apart.
5. **Correctness would then depend on a timing assumption** — "no snapshot between insert and render is ever empty" — which the code does not guarantee and no test asserts.

`records` stays for what it is good at: rendering the chip and label (`record?.label`), with `occurrence.label` as an equal fallback. It must never answer "is this name taken".

### 1.6 Reference implementation sketch

```js
const SAFE_EXT = /^[a-z0-9]{1,8}$/;

/** Extension from the original clipboard name, only when it is a usable token. */
function extFromName(name) {
  const base = String(name).split(/[\\/]/).pop() || '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return undefined;
  const ext = base.slice(dot + 1).toLowerCase();
  return SAFE_EXT.test(ext) ? ext : undefined;   // rejects "image", "blob", junk tails
}

/** MIME fallback: concrete table first, else the subtype when it is a safe token. */
function extFromMime(mime) {
  const m = String(mime || '').toLowerCase();
  if (MIME_EXT.has(m)) return MIME_EXT.get(m);  // png,jpg,gif,webp,heic,avif,pdf,zip,txt,csv,json…
  const sub = m.split('/')[1];
  return sub && SAFE_EXT.test(sub) ? sub : 'bin';
}

function resolveExt(item) {
  const byName = extFromName(item.path);
  const mime = String(item.file.type || '').toLowerCase();
  const nameIsImage = !!byName && IMAGE_EXT.has(byName);
  const mimeIsImage = mime.startsWith('image/');
  // family mismatch (clipboard name says .txt, bytes say image/png): MIME wins for the ext too
  if (byName && nameIsImage === mimeIsImage) return byName;
  if (mime) return extFromMime(mime);
  return byName || 'bin';
}

/** Lowest free index; MUTATES `reserved` so one tick cannot hand out a name twice. */
function planPasteName(reserved, item) {
  const base = String(item.file.type || '').toLowerCase().startsWith('image/') ? 'paste_image' : 'paste_file';
  const ext = resolveExt(item);
  for (let n = 1; ; n += 1) {
    const candidate = base + (n === 1 ? '' : '(' + n + ')') + '.' + ext;
    if (!reserved.has(normalize(candidate))) { reserved.add(normalize(candidate)); return candidate; }
  }
}
```

And in `add()` — the funnel stays a single funnel; only the paste branch renames:

```js
const add = async (sessionId, items, { origin = 'drop' } = {}) => {
  const input = inputFor(sessionId);
  const taken = new Set(occurrencesOf(input, SOURCE).map(o => normalize(o.label)));
  const planned = items.map(item =>
    origin === 'paste' ? planPasteName(taken, item) : item.path);   // drop/picker: verbatim
  // paste: compare planned names; every other origin: compare real item.path
  validateItems(items, planned, origin);

  for (let i = 0; i < items.length; i += 1) {
    const name = planned[i];
    const record = { ref: id(), sessionId, items: [items[i]], total: items[i].file.size,
                     label: name, uploadPath: name, originalPath: items[i].path, status: 'ready' };
    records.set(record.ref, record);
    const accepted = input.insertReference({ path: name, /* … */ }, { /* … */ });
    if (!accepted) { records.delete(record.ref); taken.delete(normalize(name)); throw new Error('The DSH composer changed'); }
    // the existing subscribe() stays as it is: it may retire the record, it must NOT reclaim the name
  }
  changed();
};
```

### 1.7 Edge cases to pin

- Two images in **one** clipboard gesture: `(1)`, `(2)`, and no duplicate-path throw (§1.2).
- A real file the user already named `paste_image.png` (dropped or picked) participates in the taken set, so the next paste becomes `paste_image(2).png`.
- Legacy attachments from before this change (label `image.png`) simply occupy no `paste_image*` slot: no collision, no migration, no retro-renaming of records already in a composer.
- Clipboard file with no extension and type `text/plain` → `paste_file.txt`.
- Empty `file.type` with a `.pdf` name → `paste_file.pdf`; empty type and no name extension → `paste_file.bin`. Fail closed; never invent the image family without MIME evidence.

---

## 2. Extension rule, and what each surface displays (completeness item, not scored)

**Extension resolution order — original name first, MIME as fallback:**

1. Take the clipboard basename's extension when it is a safe token (`^[a-z0-9]{1,8}$`, lower-cased). It describes the bytes the user actually pasted and is what downstream tools key on.
2. Otherwise (no extension, no dot, or junk such as `blob` / `download` / `image`) derive it from `file.type`: `image/png`→png, `image/jpeg`→jpg, `image/gif`→gif, `image/webp`→webp, `image/heic`→heic, `image/avif`→avif, `application/pdf`→pdf, `text/plain`→txt, `application/zip`→zip, `application/json`→json, else the subtype when safe, else `bin`.
3. **Family-mismatch override**: when the name extension and the MIME disagree about image-ness (clipboard says `.txt`, type says `image/png`), MIME wins for the extension as well as the base, so no one ever sees `paste_image.txt`.
4. MIME never overrides a *consistent, sane* original extension: clipboard `scan.jpeg` with `image/png` keeps `.jpeg` (same family, the user's name wins).

| Surface | Must show / carry | Must not show |
|---|---|---|
| Dock chip (`dshca-name`) | the final planned name, e.g. `paste_image(2).png` — from `record.label`, with `occurrence.label` as an *identical* fallback | the browser's `image.png`, or a name that changes when `records` is retired |
| Upload body (`files[i].path`) | the **same** final name (`record.uploadPath`), so the stored file matches what the user saw and two pastes never overwrite each other | `item.path` for pastes |
| Provenance of the bytes | `record.originalPath` (kept, never displayed) | — |
| Drop / picker chip and upload body | the real path verbatim | any `paste_*` rewriting |

One string, three consumers (chip, composer occurrence, upload body) — the invariant that keeps the chip honest after the record cache is gone.

---

## 3. Follow-up B — why the chip showed an *older* tag as "latest"

### 3.1 What the captured evidence proves

| Signal | Value | Meaning |
|---|---|---|
| `cache-control` | `private, max-age=60, s-maxage=300` | browser may reuse for 60 s; the shared edge for up to 300 s |
| `x-cache` | `HIT` | the body came from a stored copy, not the origin |
| `age` | `178` | that copy was ~3 minutes old when served |
| payload | `v0.2.9`, `v0.2.8`, `v0.2.7` | **both** `v0.2.10` (the running version) and `v0.2.11` are missing |
| `git ls-remote --tags` | `refs/tags/v0.2.10`, `refs/tags/v0.2.11` | both tags exist on the remote |

The check ran ~90 s after the push, inside the 60 s browser / 300 s edge freshness window, and got a page that predated **two** releases. This is not bad luck: *any* check inside `max-age` / `s-maxage` after a push returns the previous tag set, and the code has no staleness guard at all.

### 3.2 Root-cause chain (three defects, one visible symptom)

1. **A cached remote snapshot is used as ground truth.** `latestFromTags()` accepts any `res.ok` body: no `cache: 'no-store'`, no `Cache-Control: no-cache` request header, no `ETag` / `If-None-Match` revalidation, no cache-busting query parameter, no inspection of `age` / `x-cache`, no second source. It also fetches `/tags` — **git tags**, while what users can actually install is the **npm registry**, and the npm publish lags the GitHub release (DSH-0.1.6-A2-04). A tag list is the wrong channel twice over.
2. **The comparison direction is collapsed and the wrong operand is displayed.** `semverCmp(tag, PLUGIN_VERSION) <= 0 → renderCurrentChip(tag)` maps *remote older than running* and *remote equals running* onto the same state, and then `renderCurrentChip` prints **the fetched tag**: "already the latest version " + tag. A stale, strictly-older reading is thereby promoted into a positive claim about the world ("v0.2.9 is latest"), contradicting the one fact the client knows for certain — it is executing 0.2.10. That inversion, not the cache alone, is what produced the misleading sentence: even a correctly-cached-but-old list must never be rendered as "latest".
3. **Latent comparator brittleness (close it, do not assume it).** The max is computed over `v`-prefixed strings with `semverCmp` (not shown in the excerpt). If that helper ever degrades to a string comparison, `v0.2.9` outranks `v0.2.10` (the digit 9 sorts above 1 at that position), so even a perfectly fresh payload containing `v0.2.10` would resolve to `v0.2.9`. In this incident the payload did not contain `v0.2.10` at all, so the cache is the primary cause — but the compare must be numeric per segment on `v`-stripped versions, and that must be a test, not an assumption.

A free staleness tell in the payload: **the running version was absent from the fetched list**. A list that does not contain the version you know you are running cannot be a current view of the world. Use it to *downgrade* trust, never as proof — a local or unreleased build legitimately has no tag.

### 3.3 The display rule the chip should follow instead

Compare exactly two values:

- **`running`** = `PLUGIN_VERSION` — the locally known, bundle-owned running version: the only locally authoritative operand, and what the user actually has.
- **`remote`** = max stable tag from the fetch — a *candidate*, cached by someone else, of unknown staleness.

| Condition | State | Chip text (which version is displayed) |
|---|---|---|
| `remote` unavailable (network / 403 / timeout / non-JSON / no stable tag) | offline | neutral "couldn't check" — no version claim |
| `remote > running` **and** freshness corroborated | update available | "v" + remote + " available — install " + `@org/dsh-attach-input@<remote>` (pinned, never a bare name) |
| `remote === running` | current | "already the latest version " + **`running`** (the local value) |
| `remote < running` | **unconfirmed / stale** | "you're on v" + running + " — couldn't confirm the latest release"; **never** the older tag and never the words "already the latest"; re-check with a cache-bypassing request; show the neutral chip, not the green success chip |
| `remote` unparsable, or only prereleases | unknown | neutral chip, no claim |

Invariants to encode — the score-bearing restatement:

1. The **"already latest" branch may only display `running`**, never a value fetched from a cache. (In the equal case the strings match, but the value is taken from the local constant.)
2. A remote version that sorts **below** `running` is **not** "latest"; it means the check is stale. This single rule would have prevented the ticket: `0.2.9 < 0.2.10` → unconfirmed, not green.
3. A remote version is displayed as *a version to obtain* only when it is **strictly greater** than `running` **and** corroborated as fresh.
4. Freshness is established, not assumed: `fetch(url, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache', ...(etag ? { 'If-None-Match': etag } : {}) } })`, a unique query parameter per check (defeats the shared edge key), and treat `x-cache: HIT` or `age` ≳ 60 as "unconfirmed" — either re-check or refuse to claim. A 304 reuses the cached tag *set* but keeps the same state rules.
5. Prefer the **install channel** as the primary source: the npm registry `dist-tags.latest` for `@org/dsh-attach-input` (that is what users can actually receive), with the git tag list as corroboration; disagreeing sources → unconfirmed. Never advertise a version the registry does not serve (the E404 window, DSH-0.1.6-A2-04).
6. Keep the 8 s `AbortSignal.timeout` and keep the chip strictly advisory: it must never imply the running bundle has been updated — an update only takes effect after install **and** a host restart (DSH-0.1.7-A2-04: client bundles are cached at host boot).

---

## 4. Regression tests that would have caught both before release

Seams first: extract `planPasteName(reserved, item)`, `resolveExt(item)` and `decideChip({ running, remote, fresh, payload })` as pure functions so they test without a DOM; keep one thin render assertion per chip state.

### 4.1 Follow-up A — renaming

| # | Test | Assertion | Catches |
|---|---|---|---|
| A1 | Two images pasted in **two separate** `add()` calls, both from the clipboard name `image.png` | labels `paste_image.png`, `paste_image(2).png`; upload `path` equals each label | the whole ticket (fails today: both stay `image.png`) |
| A2 | **Retirement test**: paste once, then drive the alive-subscription callback with a snapshot whose `occurrences` is momentarily empty, then paste again | second name is `paste_image(2).png`; the chip still shows `paste_image.png` | pins the **authoritative source** — fails if the taken set comes from `records`; reproduces line 36 |
| A3 | Drop `image.png`; pick `IMG_0001.JPG` and `paste_image.png` | all three unchanged (chip and upload); a following **paste** becomes `paste_image(2).png` | scoping: rename confined to one path, real names still occupy slots |
| A4 | Paste `image.png` (image/png) plus `scan.pdf` (application/pdf) | `paste_image.png` + `paste_file.pdf`; a second PDF → `paste_file(2).pdf`; counters independent | family split and numbering |
| A5 | Extension matrix: `image.png`/image-png; no ext/`image/jpeg`; no ext/`application/pdf`; `blob`/image-png; `.txt`/image-png | `.png`, `.jpg`, `.pdf`, `.png`, `.png` | the original-name-vs-MIME rule, including the family mismatch |
| A6 | One batch containing **two** `image.png` items | no `Duplicate attachment path` throw; names `(1)`/ `(2)` in order | the validate-before-rename trap (§1.2) |
| A7 | Fire two paste events without awaiting the first | distinct numbers, both resolve | synchronous reservation |
| A8 | Remove `paste_image(2).png` from the composer, paste again | reuses `(2)` (pins the lowest-free policy) | policy drift |
| A9 | Property test over random paste/drop/remove sequences | `record.label === uploadPath === occurrence.label` always; never two live identical names | chip / upload / occurrence drift |

### 4.2 Follow-up B — version chip

| # | Test | Assertion | Catches |
|---|---|---|---|
| B1 | **Replay the captured response**: `age: 178`, `x-cache: HIT`, payload `[v0.2.9, v0.2.8, v0.2.7]`, `running = 0.2.10` | state is not "current"; the rendered text contains `0.2.10` and does **not** contain `v0.2.9`; no "already the latest" wording | the exact incident |
| B2 | Matrix: `running ∈ {0.2.9, 0.2.10, 0.2.11, 0.2.12}` × payloads `{[], [v0.2.9], [.. v0.2.10], [.. v0.2.11]}` | state `current` ⇒ displayed === running; never display a version below running as latest; `update` only when remote > running | the whole defect class, not one row |
| B3 | Comparator: `v0.2.10 > v0.2.9`, `v0.2.11 > v0.2.10`, `v0.10.0 > v0.9.9`; `v0.2.11-rc.1` filtered out | numeric per segment after stripping `v` | lexicographic regression (defect 3) |
| B4 | Freshness: assert the request carries `cache: 'no-store'` / `no-cache` / a unique query / `If-None-Match`; a HIT-with-old-age response yields "unconfirmed", not "current" | cache-bypass wiring | the root cause |
| B5 | Failures: 403 rate limit, 500, aborted timeout, non-JSON body, `[]` | offline / neutral chip, no claim, no throw, no unhandled rejection | fail-closed |
| B6 | Hygiene: `PLUGIN_VERSION` in `lib/client.js` === `package.json.version` === packed manifest version === tag `v<version>` | equality gate | hand-inlined constant drift |

The two tests that must exist are **A2** and **B1**; **A1/A3** and **B2** cover the surrounding class so the fix cannot be a one-line special case. Note B1 alone reproduces the reported string; B2 catches the general rule violation (any running/remote inversion).

---

## 5. Lib-only release hygiene this touches

### 5.1 Hand-inlined version constants

`PLUGIN_VERSION = '0.2.10'` (chip excerpt line 5) duplicates the manifest version because there is no build step to inject it. That constant is now load-bearing for the display rule (§3.3), so drift is no longer cosmetic: behind reality → the chip advertises the version already running, or never claims current; ahead of reality → real updates are hidden.

Mitigation: bump `PLUGIN_VERSION`, `package.json.version` and the changelog in **one** commit; add a checked script/test asserting the constant, the manifest, the **packed tarball's** manifest and the release tag `v<version>` all agree; derive every displayed version from the constant only, since the browser bundle cannot read `package.json`.

### 5.2 Bundle syntax check

No build step means no transpiler or bundler gate: a syntax error, a TypeScript-only construct, a Node built-in (`require`, `process`, `Buffer`) or a file left out of the package reaches users on refresh. Add to `npm test`:

- a parse check of **every** `lib/**/*.js` in the mode the browser loader uses (ESM; `node --check` for script-shaped files, `node --input-type=module --check` for ESM), so bad syntax fails CI instead of a user console;
- a browser-globals / residue lint (`require(`, `process.`, `Buffer`, stray `console.log`) and a `npm pack --dry-run` file-list assertion that `lib/client.js` is the file shipped and that no stale `dist/` shadows it;
- the unit suites must load the plugin **from the packed tarball**, not the working tree, so the released bytes are what was tested;
- and because client bundles are cached at host boot (DSH-0.1.7-A2-04), the post-install check must include a host restart and a page reload before anyone judges the new bundle by the chip.

### 5.3 How users actually receive the update (no host-side update endpoint)

This plugin is client-only and lib-only: it has no host process of its own to serve an update-check or update-apply endpoint, and the browser bundle cannot write the install tree, run a package manager, or restart the host. So the chip is **advisory only** — it may inform, it must never imply "you are now updated", and it must never attempt the update. The real chain:

1. **Publish**: `npm publish` the exact version and keep the `latest` dist-tag on it (verify with `npm view @org/dsh-attach-input@<v> version` and the dist-tags). The npm publish **lags** the GitHub release (DSH-0.1.6-A2-04), which is exactly why a chip keyed on git tags can advertise a version users cannot install yet.
2. **Tag**: push `v<version>` only after the registry actually serves it; a git tag is not an installable release.
3. **User-side install**: the profile composition resolves the new package on the next plugin install/update, pinned to the exact version (`@org/dsh-attach-input@0.2.11`) — never a bare package name, which resolves the `latest` dist-tag and can silently move backwards. Git-checkout or junction installs need `git fetch` plus a checkout of the tag (never `git pull` on a dirty tree), per the skill's Mode B boundaries.
4. **Activation**: the host caches client bundles at boot (DSH-0.1.7-A2-04), so the new bundle only runs after a **host restart** and a page reload/reconnect; editing the install tree alone changes nothing until then. The chip's release-notes copy should carry that step, otherwise the user "updates", still sees the old chip, and files the next issue.
5. **Honesty and least privilege**: state the pinned install command and the restart requirement in the chip itself; keep the check dependency-free, timeout-bounded (8 s), fail-closed to the neutral chip, and free of telemetry — the version check is this plugin's only external call.

---

## 6. Rollout / verification checklist

1. Add the assignment seam and the `origin` flag; prove drop and picker are byte-for-byte unchanged (A3).
2. Land the reservation + retired-record test (A2) **before** touching `add()`; it must fail on the current code.
3. Replace `renderCurrentChip(tag)` with `decideChip()` (§3.3); B1 red → green.
4. Add the staleness/freshness fetch options and the registry-as-primary source; B4 green.
5. Extend `npm test` with the parse/browser-globals/pack-list gates and the version-constant equality gate (B6).
6. Release: bump constant + manifest + changelog in one commit → `npm publish` → verify dist-tags → tag `v<version>` → restart the host, hard-refresh, confirm the chip reports the local version and that a second paste lands as `paste_image(2).png`.

---

## 7. Scope and assumptions

- Read-only throughout: the fixture was not modified, nothing was executed or installed, and no network request was made. The HTTP capture in `tags-api-response.txt` is treated as evidence, not re-fetched.
- Card citations are by ID only — DSH-0.1.6-A2-04 (npm publish lags the GitHub release) and DSH-0.1.7-A2-04 (client bundles cached at host boot) — with no reference text reproduced.
- The flow excerpt is labelled an excerpt: `inputFor`, `id()`, `semverCmp`, `MIME_EXT` and the drop/picker handlers are not shown. The design above therefore relies only on the shown contracts (`input.insertReference`, `input.state.getSnapshot().occurrences`, `o.source === SOURCE`, `o.ref`) and on the stated assumption that the paste handler is the one acquisition path that builds items from `clipboardData.files`.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.