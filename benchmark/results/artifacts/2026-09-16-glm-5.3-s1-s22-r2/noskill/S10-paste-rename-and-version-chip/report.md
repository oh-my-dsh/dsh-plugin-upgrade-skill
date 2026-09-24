# S10 · Paste Renaming & Version-Chip Follow-Ups — Analysis Report

Task: read-only analysis of two post-v0.2.10 follow-ups for `@org/dsh-attach-input`
(clipboard files → composer attachments; lib-only client bundle, no build step).
Evidence: `plugin-attachment-flow.js`, `plugin-version-chip.js`, `user-threads.md`,
`tags-api-response.txt` under the fixture directory (unchanged).

---

## 1. Follow-up A — unified renaming for pasted files

### Naming scheme (exactly)

- **Pasted images** → `paste_image.png`, then `paste_image(2).png`, `paste_image(3).png`, …
  (first occurrence carries no suffix; the *second* taken name gets `(2)`).
- **Other pasted files** → `paste_file.<ext>` with the same numbering:
  `paste_file.pdf`, `paste_file(2).pdf`, …
- Image classification: the item is an image when `file.type` starts with `image/`
  (or, if `file.type` is empty, the original name has a known image extension).
  Base name is fixed (`paste_image` / `paste_file`); the extension is preserved per the
  rule in §2.

### Where the rename is applied — and which paths stay untouched

The rename must be applied **at the paste acquisition path, before the three paths funnel
into `add()`** — i.e. in the clipboard/paste handler that constructs the `items` array
(or at the very top of `add()` gated on an explicit `source: 'paste'` argument passed
only by that handler). Concretely it must rewrite the name that becomes:

- `record.label` (what the dock chip renders), and
- the `path` sent in the upload body (`files: record.items.map(item => ({ path: item.path, … }))`)
  — otherwise the chip says `paste_image.png` while the recipient still gets `image.png`.

Rename **once, at acquisition time**, and store the renamed path on the record; do not
recompute it at render or upload time (the "names taken" set changes between those points,
so late recomputation would produce inconsistent numbers between chip and upload).

**Untouched paths:** drag-and-drop and the file/folder picker must keep `item.path`
verbatim. Because all three acquisition paths funnel into the same `add()`, the renaming
cannot live unconditionally inside `add()` — it must be scoped to the paste call site
(or an explicit source flag), so a dragged `image.png` keeps its real name even when it
collides with pasted names. `validateItems()`'s in-batch duplicate check then operates on
the *renamed* paths for pasted items, which also fixes the current behavior where two
pasted screenshots both pass through as `image.png` (and where, once renamed, two
distinct pastes no longer falsely collide).

### How the number is chosen

For each pasted item, in order:

1. Compute the base candidate (`paste_image.<ext>` / `paste_file.<ext>`).
2. If that name is not taken, use it.
3. Otherwise increment a counter: `paste_image(2).png`, `paste_image(3).png`, … until an
   untaken name is found (the suffix lives on the stem, before the extension).

"Taken" must be evaluated against the authoritative name set **at the moment of `add()`**,
and the check must include both the live composer state and the earlier items of the same
batch (so a single multi-file paste numbers its own files correctly).

### Authoritative "names already taken" source — and why the records cache is wrong

**Authoritative source: the DSH composer input state** —
`input.state.getSnapshot().occurrences` (each occurrence's label/name), unioned with the
renamed names already assigned to earlier items in the same `add()` batch. That is the
ground truth the user sees, and it is owned by the host, not the plugin.

The plugin-side `records` Map alone is the wrong source because:

- **It self-destructs on momentary empty snapshots.** The alive-subscription in `add()`
  fires `records.delete(ref)` whenever a snapshot momentarily shows *no* occurrences for
  that ref (`alive || record.inflight !== undefined` guard aside, any transiently empty
  snapshot retires the entry). After such a retirement the cache under-counts: a later
  paste would wrongly reuse `paste_image.png` even though the composer still holds (or
  held) an occurrence by that name.
- **It only knows what this plugin added in this session.** Names introduced through other
  acquisition paths, other sources, or restored from a prior session never enter the Map,
  so a pasted `paste_file.pdf` could silently collide with a picker-added `paste_file.pdf`.

Using the host snapshot as the conflict source fixes both: it reflects every name actually
occupying the composer right now, regardless of acquisition path or cache lifecycle.

---

## 2. Extension rule and what each surface displays *(guidance, not scored)*

- If the original clipboard file name has an extension, keep it (`image.png` → `.png`,
  `report.pdf` → `.pdf`).
- If it has none (or is empty, as some clipboard writes are), fall back to a extension
  derived from `file.type` via a small MIME→extension map (`image/png` → `.png`,
  `application/pdf` → `.pdf`, …). If neither yields an extension, emit the base name
  with no extension rather than guessing.
- **Dock chip** displays `record.label` — the renamed name (`paste_image(2).png`).
- **Upload path** (the `path` field in the request body) carries the *same* renamed value,
  so the uploaded attachment's name matches the chip exactly. One rename, one stored value,
  rendered in both places.

---

## 3. Follow-up B — root cause and the correct display rule

### Root cause

The chip fetches `/repos/org/dsh-attach-input/tags?per_page=10` from the GitHub API and
treats whatever comes back as ground truth. The captured response
(`tags-api-response.txt`, taken ~90 s after pushing `v0.2.11`) shows why that failed:

- `cache-control: private, max-age=60, s-maxage=300`, `x-cache: HIT`, `age: 178` —
  the API (or a shared CDN cache) served a **cached page up to 5 minutes old**;
- that cached page predates the `v0.2.10` and `v0.2.11` pushes and lists `v0.2.9` as
  the newest tag, while `git ls-remote` confirms both newer tags exist on the remote.

So during the stale window the chip computed `latest = v0.2.9`, found
`v0.2.9 <= 0.2.10` (the running hand-inlined `PLUGIN_VERSION`), took the
"already latest" branch — and then **rendered the fetched (older) tag** in the green chip:
"already the latest version v0.2.9". Two independent mistakes compounded:

1. a **cached remote value was trusted as ground truth** for "latest" (no freshness check,
   no consistency check against the locally-known running version);
2. the green chip **displayed the fetched tag instead of the running version**, so the lie
   was user-visible even though the client locally knew it was running 0.2.10.

### The display rule the chip should follow

Compare exactly two values: **fetched latest tag vs the locally-known running
`PLUGIN_VERSION`**, and drive both the branch and the displayed string from that
comparison:

| Comparison | Chip |
|---|---|
| fetched **>** running | update chip: "update available: <fetched tag>" |
| fetched **==** running | green chip: "already the latest version **<running version>**" |
| fetched **<** running | **stale/invalid data** — do *not* claim "latest". Render the neutral/offline chip (e.g. "running <running version>; update check unavailable") |
| fetch failed / no stable tag | offline chip, as today |

The invariant: a fetched tag **older than the running version is proof the fetch is stale**,
never proof of being up to date; and the green chip always shows the **running version**,
never the fetched value. (`semverCmp(tag, PLUGIN_VERSION) <= 0` must be split into
`== 0` and `< 0` branches; only `== 0` may render the "already latest" chip.)

---

## 4. Regression tests that would have caught both before release

### Follow-up A tests

1. **Sequential paste numbering:** paste two clipboard files both named `image.png`
   (two `add()` calls, paste source). Assert dock labels are exactly
   `paste_image.png` and `paste_image(2).png`, and that both upload bodies carry the
   matching renamed `path`.
2. **Non-image paste:** paste `report.pdf` twice → `paste_file.pdf`,
   `paste_file(2).pdf`; extension preserved from the original name; MIME fallback used
   when the name has no extension.
3. **Scope guard — other paths untouched:** drag-and-drop a file literally named
   `image.png` and pick `image.png` via the picker; assert labels/paths stay
   `image.png` even when `paste_image.png`/colliding names exist, and that a picker-added
   `paste_file.pdf` is *counted as taken* when numbering a subsequent paste.
4. **Authoritative conflict source (the records-cache trap):** add a pasted image,
   simulate a momentary empty composer snapshot (firing the alive-subscription so the
   records entry is retired), then paste another `image.png` while the composer snapshot
   again shows the first occurrence (or after re-adding it). Assert the second paste gets
   `paste_image(2).png` — i.e. numbering consults `input.state.getSnapshot()`, not the
   plugin's `records` Map.
5. **In-batch numbering:** one paste event delivering three `image.png` files yields
   `paste_image.png`, `(2)`, `(3)` in order, and `validateItems` no longer rejects
   the batch (renamed paths are distinct).

### Follow-up B tests

1. **Stale-cache case (the reported bug):** stub `fetch` to return a tag list whose
   newest is `v0.2.9` with `PLUGIN_VERSION = '0.2.10'`. Assert the chip does **not**
   render "already the latest version v0.2.9" and does not render the fetched tag
   anywhere; assert the neutral/running-version chip renders.
2. **Equal case:** fetched newest `v0.2.10`, running `0.2.10` → green chip reads
   "already the latest version **0.2.10**" (assert the *running* constant, not the fetched
   string, is displayed).
3. **Newer case:** fetched `v0.2.11`, running `0.2.10` → update chip showing `v0.2.11`.
4. **Failure case:** `fetch` rejects / non-2xx / no stable tag → offline chip (existing
   behavior preserved).
5. **Filtering:** non-semver tag names (`nightly`, `v1.0.0-rc.1`) are excluded from the
   max computation.

---

## 5. Lib-only release hygiene items this touches

1. **Hand-inlined version constant.** `PLUGIN_VERSION = '0.2.10'` lives in `lib/client.js`
   with no build step to inject it. Every release must bump `package.json` **and** this
   constant in the same commit; add a release-checklist item and ideally a cheap unit test
   that parses `lib/client.js` and `package.json` and fails when the two versions diverge
   (this is exactly the class of drift that makes the §3 comparison meaningless).
2. **Bundle syntax check.** With no bundler/TypeScript pass, nothing validates the shipped
   file. Before tagging, run a syntax check over `lib/` (e.g. `node --check lib/*.js`,
   plus loading the client plugin in a throwaway page/runtime) so a typo can't ship in a
   lib-only release.
3. **How users actually receive the update.** This plugin has **no host-side update
   endpoint**: the chip can only *announce* a new version, never deliver it. Users get the
   new code only by reinstalling/updating the package on the host (e.g. `npm install` /
   copying the new `lib/` bundle) and then hard-refreshing the Web page so the client
   plugin reloads. Consequently: (a) the update chip's copy must point users at that
   manual step, and (b) until they do, their locally-known `PLUGIN_VERSION` is the most
   trustworthy version signal in the page — which is precisely why §3's rule (stale
   fetched < running ⇒ never claim "latest"; always display the running version) is the
   correct one.
