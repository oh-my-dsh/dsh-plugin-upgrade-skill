# S10 — Pasted-file renaming + version-chip follow-ups (read-only design report)

**Plugin:** `@org/dsh-attach-input` (lib-only client plugin, no build step)
**Baseline:** v0.2.10 as shipped in the evidence pack · **Remote tag under discussion:** v0.2.11
**Mode:** read-only analysis. Nothing under `fixture/` was executed, imported, or modified; no install, no network, no git.

## 0. Evidence used

| File | What it gave |
|---|---|
| [fixture/plugin-attachment-flow.js](fixture/plugin-attachment-flow.js) | `validateItems()` in-batch `Set` dedupe (l.5–15), `add()` with `label = item.path` (l.24), the `records` map + eviction subscription (l.30–39), dock chip `record?.label ?? occurrence.label` and upload body `item.path` (l.44–45) |
| [fixture/plugin-version-chip.js](fixture/plugin-version-chip.js) | `PLUGIN_VERSION = '0.2.10'` (l.5), single cached `GET /tags?per_page=10` (l.8), semver max (l.13), `<= 0 → renderCurrentChip(tag)` (l.21), green text interpolating the **fetched** tag (l.27) |
| [fixture/tags-api-response.txt](fixture/tags-api-response.txt) | `cache-control: private, max-age=60, s-maxage=300`, `x-cache: HIT`, `age: 178`; body max = `v0.2.9`; `v0.2.10`/`v0.2.11` absent; both tags do exist per `ls-remote` |
| [fixture/user-threads.md](fixture/user-threads.md) | Follow-up A (unified paste names, real names for drop/picker), follow-up B (green chip said "already the latest version v0.2.9" while running 0.2.10 and 0.2.11 was out) |
| [fixture/README.md](fixture/README.md) | Pack inventory + "read-only, do not execute" constraint |

Two things are *not* in the pack and are stated as assumptions, not facts: the drop handler and the file/folder picker handler (both only described as funnelling into `add()`), and the exact `input.insertReference` argument shapes (elided in the excerpt at l.27). Everything below is written against the excerpt's API: `input.state.getSnapshot()` → `{ occurrences: [{ source, ref, label, sessionId? }] }`, `input.state.subscribe(fn)`, `input.insertReference(…)`, module-level `records: Map<ref, record>`, `records.set/delete`, `changed()`.

## 0.1 Answer at a glance

| # | Question | Answer in one line |
|---|---|---|
| 1 | Renaming design | Rename **only at paste ingest, before `validateItems()`**, into `paste_image.png` / `paste_image(2).png` … (or `paste_file.<ext>`), persist the final name as the occurrence label, and allocate the lowest free index against **`getSnapshot().occurrences` labels**, never against the `records` Map (whose eviction subscription deliberately retires records on any momentarily occurrence-less snapshot, so it under-reports and would hand out duplicates). Drop and picker paths are never renamed. |
| 2 | Extension + surfaces | Extension from the original name, else from MIME (`image/jpeg→jpg`…), never hardcoded `.png`; chip and upload path must both show the **same** final basename. |
| 3 | Chip root cause + rule | The `/tags` body was a CDN cache HIT (`age: 178`, `s-maxage=300`) that predated both pushes, so its max was `v0.2.9`; and `renderCurrentChip` printed the **fetched** tag as if it were the running version. Rule: compare remote `latest` with local `running = PLUGIN_VERSION`; show `latest` only when strictly newer, otherwise show `running`; `latest < running` means "stale response → refetch", never "you are current". |
| 4 | Tests | Replay the captured tag body (assert the chip says 0.2.10 and never 0.2.9), property-test "never show a remote version older than running", and for A: multi-image paste in one gesture, gap-filling, cache-eviction replay (A4), drop/picker identity (A5–A7), MIME fallback, chip≡upload name. |
| 5 | Lib-only hygiene | One hand-inlined `PLUGIN_VERSION` must be CI-checked against `package.json` and the tag; no build step means `node --check` + smoke-load is the only gate; the chip cannot update anything — the host serves the bundle, so users get the fix only when the host's plugin files change and the bundle reloads. |

---

# 1. Follow-up A — unified renaming for pasted files

## 1.1 The scheme

| Situation | Name |
|---|---|
| 1st pasted image in this composer | `paste_image.png` |
| 2nd, 3rd … pasted image | `paste_image(2).png`, `paste_image(3).png`, … |
| 1st / Nth pasted non-image | `paste_file.pdf`, `paste_file(2).pdf`, … |
| anything arriving by drag-and-drop or file/folder picker | unchanged real name, always |

Formal grammar for a generated name:

```
name      := stem ( "(" n ")" )? "." ext        n >= 2, decimal, no zero padding
stem      := "paste_image"  if file.type starts with "image/"
           | "paste_file"   otherwise
ext       := extension rule of §2 (original extension, else MIME fallback)
n         := 1 is rendered as *no suffix*; 2,3,4,… as "(n)"
```

So the visible sequence is `paste_image.png`, `paste_image(2).png`, `paste_image(3).png` — exactly the sequence kaylint asked for. The two families (`paste_image`, `paste_file`) count independently: a `paste_file.pdf` does not consume an image number.

## 1.2 Where the rename is applied — and where it must not be

**Apply it at the paste acquisition boundary, as the first thing that happens to the items, before `validateItems()` runs.**

Concretely, one of these two equivalent shapes (both keep a single choke point):

```js
// (a) the paste handler maps before calling add() — provenance made explicit
input.onPaste = (sessionId, clipboardItems) =>
  add(sessionId, clipboardItems.map(it => renamePastedItem(sessionId, it)), { origin: 'paste' });

// (b) add() does it, gated on an explicit origin flag the three call sites pass
const add = async (sessionId, items, { origin } = {}) => {
  if (origin === 'paste') items = items.map(it => renamePastedItem(sessionId, it));
  validateItems(items);            // ← now sees final names
  … record.label = displayName(item) … input.insertReference({ label: displayName(item) } …)
};
```

Provenance must be *explicit* — an `origin: 'paste' | 'drop' | 'picker'` argument (or a `source` field on each item). It must **not** be inferred from the file name, from `file.type`, from a `File` object having no path, or from "does the name look like a clipboard name (`image.png`)". Every one of those heuristics misfires on a real file the user actually owns and dragged in (`image.png` in a screenshots folder is a perfectly ordinary real file), and a heuristic that guesses wrong silently renames the user's own data.

Why ingest, and not later:

1. **The name must be the occurrence label, not a render-time decoration.** The dock reads `record?.label ?? occurrence.label` (l.44). If `insertReference` receives `image.png` and only the chip is reformatted, then (i) the *uploaded* body still carries `item.path === "image.png"` (l.45) so two attachments land with the same name, and (ii) the name is not durable: a re-render, a session reload, or a lost `records` entry falls back to `occurrence.label` and the `image.png` reappears. Putting the final name in the occurrence label is what makes the allocation *stable and re-derivable* after a reload.
2. **In-batch dedupe must see final names.** `validateItems()` throws `Duplicate attachment path` on a repeated `item.path` (l.8–12). Pasting three screenshots in one gesture hands `add()` three items all named `image.png`, so today a multi-image paste fails outright with that error. Renaming before `validateItems` fixes that bug for free — but only if the rename happens upstream of the check. Renaming after it keeps the crash.
3. **Chip and upload agree by construction.** One value (`displayName`) feeds `record.label`, the occurrence label, and the upload `path` basename; they cannot drift.
4. **Renaming at render or upload time is non-idempotent.** Rendering happens many times per second (any `changed()`), so a number picked at render time would flicker or change; a number picked at upload time is picked after the user has already seen and referred to the old name.

**Paths that must stay byte-for-byte untouched:**

- **drag-and-drop** — `file.name` and any real path component are the user's own files. No `paste_` prefix, no renumbering, even if a dropped file happens to be called `image.png`, and even if it collides with a `paste_image.png` already in the composer (a genuine collision for a real file is handled by the existing duplicate check / the user, never by renaming their file).
- **file picker and folder picker (`webkitdirectory`)** — same rule, and the directory part of a picked relative path must be preserved verbatim; only the basename is ever eligible, and here it is not eligible at all.
- **every non-paste insertion** — programmatic `insertReference` calls, restored session history, drag from another part of the app.
- **already-inserted attachments** — never retro-rename or renumber live occurrences when a new paste arrives. Names are assigned once, at ingest, and are then immutable (the allocator only ever looks at free slots, §1.3, never reflows existing ones).
- **the payload itself** — `item.file` (bytes, `type`, `size`, object identity) and `record.total` are untouched; only the *name* changes. Also untouched: `record.ref`, `sessionId`, and the `SOURCE` value.
- **no fabricated filesystem paths** — a paste has no directory. The generated name is a basename only: never `C:\…\paste_image.png`, never a path containing `..` or a separator (sanitise the ext and the stem; the stem is a constant, so only the ext can carry junk, §2).

## 1.3 How the number is chosen

For each pasted item, in order, synchronously, against the authoritative taken-set (§1.4):

1. compute `stem` and `ext`;
2. probe `stem.ext` — free? take it (that is index 1);
3. otherwise probe `stem(2).ext`, `stem(3).ext`, … and take the **first free index**. Gap-filling, not "max + 1".

```js
function nextPasteName(stem, ext, taken) {          // taken: Set of lowercased names
  const has = n => taken.has(n.toLowerCase());
  if (!has(stem + '.' + ext)) return stem + '.' + ext;
  for (let n = 2; ; n++) {
    const cand = stem + '(' + n + ').' + ext;
    if (!has(cand)) return cand;
  }
}
```

Why probing for the lowest free index rather than parsing "max existing n" and adding one:

- it needs **no counter**, therefore no new cache and no new staleness class. A "last used number" counter is exactly the same mistake as `records`: it is a plugin-side memory that can be lost (reload) or lie (evicted), and if it is lost the allocator starts over and collides;
- it is **correct after reload** — with no counter at all, the first paste after a page reload re-derives the next free name purely from the composer contents;
- it does not depend on labels being in a canonical format: `paste_image(007).png` from an older build is simply *taken*, and `(7)` would be too, and the probe just moves on;
- it keeps the visible sequence compact after deletions (delete `paste_image(2).png`, paste again → you get `(2)` back). That is the behaviour chat apps have and nobody minds.

Comparison is case-insensitive (Windows/macOS are), both for the family match and for the membership test. Numbers are compared as decimal integers where parsed at all — but the implementation above never parses them, which is a feature.

**Concurrency:** `add()` is `async` and awaits `insertReference` (l.27), so two paste gestures in flight at once can both compute `paste_image.png`. Fix: reserve the name synchronously in a short-lived `Set` of in-flight names for that session *before* the first `await`, delete the reservation in a `finally` once the occurrence is committed (or on throw, l.28), and include that `Set` in the taken-set. Or serialise `add()` per session behind a promise chain. The reservation is transient and additive only — it can never *remove* a name from the taken-set, so it cannot reproduce the `records` failure mode.

## 1.4 The authoritative "names already taken" source

**The composer/session state snapshot — `input.state.getSnapshot().occurrences`, filtered to this session, reading each occurrence's current `label` — is the authority, not the plugin's `records` Map.**

```js
function takenNames(sessionId, input, inflight) {
  const taken = new Set(inflight);                       // synchronous reservations, §1.3
  for (const o of input.state.getSnapshot().occurrences ?? []) {
    if (o.sessionId !== undefined && o.sessionId !== sessionId) continue;
    const label = o.label ?? records.get(o.ref)?.label;   // ← records may only *fill a gap*
    if (typeof label === 'string' && label) taken.add(label.toLowerCase());
  }
  return taken;
}
```

Why the snapshot and not the Map:

- **The Map is a view cache with an optimistic evictor.** Lines 30–39 subscribe to every state change and do `records.delete(ref)` the moment a snapshot contains no occurrence with that `ref`. "No occurrence right now" is not "no attachment": the composer emits snapshots before an insert commits, during re-renders, while a session switches, while the composer unmounts and remounts, and while a dock is hidden — any of those produce a momentarily occurrence-less snapshot and the record is silently retired. The code even comments it (`fires on ANY momentary empty snapshot`). So the Map is *designed to under-report*.
- **Under-reporting is the exact bug being fixed.** If the allocator reads a Map that forgot `paste_image.png`, it concludes the name is free and hands out `paste_image.png` a second time — the user's original complaint, reintroduced through the fix. A collision source must fail *closed* (over-report taken names). By construction the snapshot contains every occurrence that is actually rendered and will actually be uploaded; and because §1.2 stores the final name *in the occurrence label*, the snapshot is also the replayable record after a reload.
- **The occurrences are host-visible state; the Map is not.** The occurrence list is what the composer session owns and what survives re-render; `records` is plugin bookkeeping that can be rebuilt from it (`ref → record`). Bookkeeping derived from the truth can never outrank the truth.
- **It is the union that is safe, only in one direction.** `records` may be consulted as an *extra* source of names (a record whose occurrence has not yet appeared in a snapshot — e.g. mid-insert) because adding a name can only make the allocator skip a number. It must never be the *only* source, and it must never be used to *subtract*: never "the Map has no record, so this name is free".
- **Scope:** the taken-set is per composer/session, since a name only has to be unique where it is displayed and uploaded. Cross-session global uniqueness would be surprising (two unrelated chats would each start at `paste_image(4)`).
- **Family matching is by the generated-name grammar**, not by "anything starting with paste_": match `/^paste_(image|file)(\(\d+\))?\.[a-z0-9]+$/` (case-insensitive). A real file the user named `paste_image-final.png` must not be counted as index n, and must certainly not be renamed.

Two smaller consequences worth stating in review: (a) the eviction subscription stays as-is for UI purposes — it can keep retiring records, because the allocator no longer depends on them; (b) if you want the allocator to be *fully* independent of plugin memory, the snapshot-only path is complete on its own, and the `records` term in the union can be dropped.

## 1.5 Reference sketch (paste path only)

```js
const STEM_IMAGE = 'paste_image', STEM_FILE = 'paste_file';

function renamePastedItem(sessionId, item, input, inflight) {
  const stem = (item.file.type || '').toLowerCase().startsWith('image/') ? STEM_IMAGE : STEM_FILE;
  const ext  = extensionFor(item.file, item.path);           // §2
  const name = nextPasteName(stem, ext, takenNames(sessionId, input, inflight));
  inflight.add(name.toLowerCase());
  return { ...item, path: name, displayName: name };         // basename only, no directory
}
```

`displayName` becomes `record.label`, the `insertReference` occurrence label, and the upload `path`. After the occurrence is committed, the reservation moves from `inflight` into the real world (it is now in the snapshot) and is dropped.

## 1.6 Edge cases to settle in review

- Paste of a **non-image** with no extension and a generic type (`application/octet-stream`) → `paste_file.bin` is acceptable and better than a nameless file; §2.
- Paste of **text** (`text/plain`) → `paste_file.txt`; the composer may handle pasted text as a text reference, in which case no rename applies (it is not a file item).
- Two paste events racing → §1.3 concurrency rule.
- A user *renames* a chip by hand later (if that feature exists) → the snapshot label changes and the allocator simply follows; no bookkeeping to update.
- A paste into a session that already holds fifty `paste_image(n)` names → the probe is O(n) per item, trivial at this scale; if it ever mattered, cache the max per session *as a hint only, re-validated against the snapshot*.

---

# 2. Extension rule and what each surface shows

**Extension, in priority order:**

1. **The original name's extension**, when it has one: `/\.([A-Za-z0-9]{1,8})$/` on the clipboard/real name, lowercased. This is what the user expects for a paste of `invoice.pdf` → `paste_file.pdf`, and for the reported case the browser's `image.png` → `.png` directly.
2. **A MIME fallback** when the name has no usable extension (or a nonsense one): map `file.type` (lowercased, parameters stripped) through a small table — `image/png→png`, `image/jpeg→jpg`, `image/gif→gif`, `image/webp→webp`, `image/svg+xml→svg`, `application/pdf→pdf`, `text/plain→txt`, `text/markdown→md`, `application/json→json`, `application/zip→zip`. This matters because a clipboard screenshot on some platforms arrives as `image` or `blob` with `type: image/png`, and a "unified" name with the wrong or missing extension is worse than the raw one.
3. **Last resort** `bin` (never a silent no-extension name), because a chip with no extension reads as a broken file.

Sanitisation: the extension is `[a-z0-9]{1,8}` only, so it can never introduce a separator, a dot, a drive letter, or a trailing dot; the stem is a constant. Note the deliberate non-rule: **do not** hardcode `png` for images. The user's example `paste_image.png` is just their screenshots being PNGs; a pasted JPEG must be `paste_image.jpg`, or the name lies about the content.

**What each surface shows:**

| Surface | Shows | Never shows |
|---|---|---|
| Dock chip (`dshca-name`) | the final **display name**: `paste_image(2).png` — i.e. exactly the basename in `record.label`/`occurrence.label` | the raw clipboard `image.png`; a filesystem directory; a number that can later change |
| Upload body (`record.items[].path`) | the **same string**, as the uploaded file's name (basename), so the attachment in the session carries the unified name | the old `image.png` (that is the duplicate-name bug at the receiving end), or a synthetic absolute path |
| Drop / picker chips and upload paths | the real name / real path, verbatim | any `paste_` prefix |

One string, three consumers, derived once. If chip and wire format ever diverge, the user sees `paste_image(2).png` in the dock and `image.png` in the message — the worst of both.

---

# 3. Follow-up B — why the chip said "already the latest v0.2.9"

## 3.1 What happened, reconstructed from the pack

1. v0.2.11 is pushed; `git ls-remote` confirms both `v0.2.10` and `v0.2.11` exist ([fixture/tags-api-response.txt](fixture/tags-api-response.txt), last lines).
2. The user runs the v0.2.10 bundle, so `PLUGIN_VERSION === '0.2.10'` ([fixture/plugin-version-chip.js:5](fixture/plugin-version-chip.js#L5)).
3. The chip fetches `/tags?per_page=10` and the response is a **cache HIT** with `age: 178` against `s-maxage=300` — an edge-cached body roughly three minutes old, i.e. a body that predates *both* pushes. Its newest entry is `v0.2.9`.
4. `latestFromTags()` returns `v0.2.9`; `semverCmp('v0.2.9','0.2.10') <= 0`, so `renderCurrentChip('v0.2.9')` runs and the text interpolates the **fetched** tag: "already the latest version v0.2.9" ([fixture/plugin-version-chip.js:21,27](fixture/plugin-version-chip.js#L21-L27)).
5. "A while later it changed its mind": once the 60 s client / 300 s edge entry expired, the next fetch contained `v0.2.11` and the chip switched to the update branch. The bug is a timing window, not a permanent malfunction — which is exactly why it is dangerous and why it survived release.

## 3.2 Root cause 1 (the data): a cached remote list was treated as ground truth

The chip has exactly one remote observation, and that observation is served from a shared CDN cache keyed by URL. `cache-control: private, max-age=60, s-maxage=300` + `x-cache: HIT` + `age: 178` mean the tag list can be up to ~5 minutes stale at the edge, *and* up to 60 s stale in the browser — so a hard refresh does not even guarantee a fresh body, because the refresh revalidates the page, not the XHR/fetch URL. During that window the body is not "the latest tags"; it is "the tags as of a few minutes ago", and the newest tag can be entirely **absent** rather than merely out of order. A list that omits the newest releases cannot be used to prove anything about them: `max(list) <= PLUGIN_VERSION` is *not* evidence that `PLUGIN_VERSION` is the newest — it is equally consistent with "the list is older than the running version", which is precisely the observed state. The code never checks that signal even though it is sitting right there (`v0.2.9` < running `0.2.10` proves the list is stale, not that the user is current).

Secondary contributors, same family: unauthenticated requests to that endpoint are rate-limited and can fail/empty; `per_page=10` is fine today but is a silent truncation if ten tags are ever pushed without a client update; the `/tags` endpoint is not `/releases/latest` (and that one is cached too); and the 8 s `AbortSignal.timeout` means a slow network yields "unknown", which the current code collapses into the same green chip shape.

## 3.3 Root cause 2 (the rendering): the fetched string was displayed as the running version

Line 27 prints `tag` — the remote value — inside a sentence about the **user's own installed version**. When the two disagree, the chip states a fact about the user's installation that is false, and the user (rho_9) reads it as "the system thinks I'm on 0.2.9 and 0.2.9 is the newest", i.e. "nothing to do here, and my 0.2.10 doesn't exist". Even with a *perfect* fetch this line is wrong: if the comparison says "no update", the correct subject of the sentence is `PLUGIN_VERSION`, never the remote tag. This defect is independent of the caching one — fix only the cache and the text can still name a tag the user is not running; fix only the text and the chip says "latest 0.2.10" while 0.2.11 exists (a lie of omission). Both have to go.

## 3.4 The display rule the chip should follow

**Two values, one comparison:**

- `running = PLUGIN_VERSION` — locally known, hand-inlined, literally the code the user is executing. This is the only trustworthy, zero-latency value, and it is the subject of every statement about the user's installation.
- `latest = max(semver(tags))` — a *remote hint*, possibly stale, possibly absent, never authoritative.

**Comparison:** `semverCmp(latest, running)` only, on normalized triplets (integer components, `v` prefix and leading zeros stripped — never a string/lexicographic compare, which would rank `0.2.9 > 0.2.10`).

| `latest` vs `running` | Chip | Version string shown |
|---|---|---|
| `latest > running` | **update** chip, prominent | `latest` (with the upgrade instruction, §5.3) |
| `latest === running` | green "current" chip | `running` |
| `latest < running` (incl. the `v0.2.9` case) | green "current" chip **and** the response is classified stale → refetch, never render `latest` | `running` |
| absent, empty, non-2xx, timeout, all invalid | neutral "version check unavailable / you are running v`running`" | `running` only, and **no** "already the latest" claim |

**Invariants to pin in code and in tests:**

1. A "latest/current" sentence may only ever contain `PLUGIN_VERSION`.
2. A remote version string may only appear when it is strictly greater than `PLUGIN_VERSION`.
3. `latest < running` is a **staleness signal**, not a "you are current" signal → trigger a cache-bypassing refetch (and, if that also comes back older, fall back to the neutral chip).

**Making the fetch less likely to lie** (needed so the rule above can actually see a new tag): send `cache: 'no-store'` and a cache-buster query (`?per_page=10&t=<Date.now()>`) or `Cache-Control: no-cache` + `If-None-Match`, so the 60 s browser entry cannot pin the answer; retry once on a stale `latest`; re-check on `visibilitychange`/`focus` rather than only once at startup; and keep the "unknown" state visually distinct from the green one. Re-checking is what turned the user's chip around after a while — make that a designed behaviour instead of an accident of cache expiry.

---

# 4. Regression tests that would have caught both follow-ups

Both fixes are only testable if the logic is pulled out of the render path: a pure `nextPasteName(...)/renamePastedItem(...)` over an injected `input` and a pure `chipModel(running, tagsResponse)` → `{ kind: 'update' | 'current' | 'unknown', shown }`. The tests below need no DOM (stub `h`/`lbl.textContent` where the string is asserted) and no network (`fetch` injected).

## 4.1 Follow-up A — renaming

| # | Test | Assertion |
|---|---|---|
| A1 | Paste three images in one gesture; each clipboard name `image.png` | labels are `paste_image.png`, `paste_image(2).png`, `paste_image(3).png` — and `validateItems` does **not** throw `Duplicate attachment path` (this is the multi-screenshot crash) |
| A2 | Second paste into a composer already holding `paste_image.png`, `paste_image(2).png` | new label `paste_image(3).png`; existing two labels unchanged |
| A3 | Gap: composer holds `paste_image.png` + `paste_image(3).png`; paste once | `paste_image(2).png` (lowest free index) |
| A4 | **Fragile-cache regression:** paste, then fire the eviction subscription with a snapshot whose `occurrences` is `[]` (record deleted), then restore the snapshot containing the occurrence, then paste again | second label is `paste_image(2).png` — never a second `paste_image.png`. Variant: clear `records` entirely and keep the snapshot → allocation still correct, proving the snapshot is the authority |
| A5 | **Scope isolation:** `add(..., { origin: 'drop' })` with two real files (`Screenshot 2026-10-20 at 10.00.00.png`, `report.pdf`) | labels/paths byte-identical, no `paste_` prefix, no renumbering |
| A6 | Drop a real file literally named `image.png` | stays `image.png` (no origin sniffing) |
| A7 | Folder picker with a relative path `holiday/2026/img.png` | path unchanged including the directory; chip shows the untouched basename |
| A8 | Extensions: paste an unnamed clipboard blob with `type: image/jpeg` | `paste_image.jpg` (MIME fallback, not hardcoded `.png`); paste `notes` with `type: application/pdf` → `paste_file.pdf`; paste `archive.tar.gz` → `paste_file.gz` (last segment) |
| A9 | Single-source display: for a pasted item | `record.label === occurrence.label === upload.path` basename, and `item.file` (bytes/`type`/`size`) unchanged |
| A10 | Hostile clipboard name `../../evil.png` | generated name contains no `/`, `\`, `..`, or leading dot |
| A11 | Concurrency: two `add()` paste calls started in the same tick with `insertReference` deferred | the two allocated names differ (reservation/serialisation works) |

## 4.2 Follow-up B — version chip

| # | Test | Assertion |
|---|---|---|
| B1 | **The captured incident, replayed:** `chipModel('0.2.10', ["v0.2.9","v0.2.8","v0.2.7"])` (body copied from the fixture) | `kind === 'current'`; the rendered text **contains "0.2.10"** and **does not contain "0.2.9"** |
| B2 | `chipModel('0.2.10', ["v0.2.11","v0.2.10","v0.2.9"])` | `kind === 'update'`, `shown === 'v0.2.11'` |
| B3 | `chipModel('0.2.10', ["v0.2.10"])` | current chip, shows `0.2.10` |
| B4 | Unknown states: fetch rejects / `!res.ok` / `[]` / only prereleases | `kind === 'unknown'`; text contains no `v`+semver other than the running version; never the words "already the latest" |
| B5 | semver ordering near the boundary | `semverCmp('v0.2.9','0.2.10') < 0` and `semverCmp('v0.2.10','v0.2.9') > 0` and `semverCmp('0.2.10','0.2.10') === 0` (kills a lexicographic regression) |
| B6 | Request shape | `fetch` called with `cache: 'no-store'` **and** a cache-buster in the URL, still on the tags endpoint, timeout still set |
| B7 | Property test over random tag lists + running versions | the `"latest"` string is never strictly older than `PLUGIN_VERSION` (the invariant of §3.4, not a single example) |
| B8 | Rendered-string pin: drive the chip into a fake `lbl` for the B1 input | `lbl.textContent === '✓ attach-input already the latest version 0.2.10'` (exact user-visible text, so the regression cannot come back silently) |
| B9 | Stale-then-fresh: first response max `v0.2.9`, second `v0.2.11` | without a page reload, the chip moves from `current`/`unknown` to `update` (the "it changed its mind" behaviour, now deterministic) |

## 4.3 Release-hygiene tests (catch the whole class, §5)

| # | Test | Assertion |
|---|---|---|
| H1 | Parse `PLUGIN_VERSION` out of the bundle source and compare with `package.json.version` | equal — this is the test that makes the chip's local ground truth trustworthy and would have caught a half-done bump |
| H2 | `node --check` every file under `lib/` | exit 0 (no build step, so nothing else validates the shipped bytes) |
| H3 | Smoke-load the bundle against a stub host (`{ state, insertReference, … }`) | module evaluates, plugin factory returns, chip state machine reachable, no network at load |
| H4 | Release gate: extracted version vs the tag being pushed | `v<version>` — run before `git push`/tagging |

---

# 5. Lib-only release hygiene for these changes

## 5.1 The hand-inlined version constant

`PLUGIN_VERSION = '0.2.10'` ([fixture/plugin-version-chip.js:5](fixture/plugin-version-chip.js#L5)) is a hand-copied duplicate of `package.json.version`; there is no build step to substitute it. That duplication is now *load-bearing*: after §3.4 the chip's entire correctness rests on the assumption that this literal equals the version the bundle actually is. If a release bumps `package.json` and the tag but forgets the literal, the shipped bundle claims to be the previous version, and every user is told "update available" forever (or, worse, the release's own chip declares itself out of date). Mitigations, in order of preference: (a) a CI/test check (H1) that parses the literal and compares it to `package.json.version`, failing the release; (b) put the literal on its own line with a marker comment (`// @version-sync`) so the check is a regex, not a heuristic; (c) release checklist item — bump `package.json`, bump the literal, run the checks, tag, push, in that order, in one commit; (d) if there is a second hand-inlined version anywhere (about box, `userAgent` string, dock header), fold every one of them into a single `const VERSION` so there is exactly one place to forget. Also assert the tag name (`v0.2.11`) matches the package version when tagging (H4), otherwise the chip compares against the wrong sequence.

## 5.2 Bundle syntax check

No build step means no transpiler catches a stray brace: whatever is committed to `lib/client.js` is what every user executes, and a syntax error is a blank dock with a console trace (and, for the chip, no chip at all — the failure mode of "my plugin silently stopped working"). Minimum gate before tagging: `node --check lib/*.js` for every shipped file (and `node --check --input-type=module` if any file is ESM), plus the H3 smoke-load, plus a load-time check that the module does not touch `fetch`/`document` at import time (so a host-side require cannot throw). Add a lint rule for the syntax level the host accepts (no TS, no JSX, no top-level await in a CJS file) and a CI diff check that the file the host will serve is the file in the repo (no stale copy under a `dist/`-like path — with a lib-only bundle it is worth stating explicitly that `lib/` *is* the artifact).

## 5.3 How users actually receive the update

There is **no host-side update endpoint**: this is a client plugin, and the bundle the browser runs is served by the host from the installed plugin tree. The chip cannot download, install, or swap code — it is a status indicator. Consequences:

- `PLUGIN_VERSION` is the version *of the code currently executing*, and that is exactly why it beats any fetched number (§3.4). A hard refresh reloads the same bundle from the host; it does **not** upgrade the plugin, which is why rho_9 stayed on 0.2.10 while the tag list moved on.
- The only path to a new version is: the host's plugin files are replaced (package upgrade/reinstall, host update) and the browser loads the new bundle (page refresh or the client plugin HMR reload while the host is serving the new file). So the update chip's job is to say **"v0.2.11 is available — update the plugin"** and, ideally, name the concrete command/path (reinstall the package, then reload), not to imply anything will happen by itself.
- Because the old bundle keeps running until the host changes, a chip bug like B cannot be fixed retroactively — users on 0.2.10 will keep seeing the 0.2.9 message. The fix's benefit starts at the first bundle that contains it, which is a reason to phrase the chip defensively now (§3.4 invariants) rather than assume a later release can correct the impression.
- The browser can serve a stale bundle too (HTTP cache / service worker). If the host serves the client bundle under a stable URL, add a version-stamped URL or `no-store` for the bundle so "old code with new tag metadata" cannot persist after a host upgrade.
- Keep the network check fully optional and non-blocking: offline/rate-limited users get the neutral chip showing their running version, never an error state that looks like a plugin failure, and no retry storm (single refetch on stale/visibility, then stop).

## 5.4 Release notes for v0.2.11+ (what to write down)

1. Renaming applies **only** to pasted files; drop/picker behaviour is unchanged (state it, because users will check).
2. The chip now reports the running version in the "current" chip and only names a remote tag when it is strictly newer; the false "latest v0.2.9" message is fixed.
3. Version bump touched both `package.json` and the inlined `PLUGIN_VERSION` (H1 green), the bundle passed `node --check` (H2), and the tag is `v<version>` (H4).
4. Updating is a host-side action; the chip only informs.

---

# 6. Residual risks / open questions for review

- **Origin plumbing is an API change.** `add(sessionId, items)` currently has no provenance. Either the three call sites pass `origin` (preferred — explicit, greppable, and the compiler-ish test A5/A6 pins them) or the paste handler pre-maps the items. Inferring origin from the file is rejected in §1.2 and has a regression test (A6) precisely because it is the tempting shortcut.
- **Occurrence labels must be writable through `insertReference`.** The design stores the final name in the occurrence so it survives reload and feeds the allocator. If the host normalises or ignores the supplied label, the allocator degrades to "snapshot labels as the host renders them" — still the right authority, but confirm the occurrence carries the name before relying on §1.4's reload argument.
- **Allocation vs. the host's own path handling.** If the host expects a *real* path for the upload body, a pasted item has none; the rename must supply a basename only and must not fabricate a directory (§1.2). Worth one integration check with a real paste before release.
- **Chip refresh frequency.** Re-checking on focus/visibility is cheap but the endpoint is rate-limited unauthenticated; cap it (once per focus, once per N minutes) and keep the last good answer rather than flickering to "unknown".
- **Evidence limits.** The drop/picker handlers, `insertReference` argument shapes and the dock's re-render schedule are not in the pack; the design is stated against the excerpt and should be re-checked against the full `lib/client.js` before implementation.
