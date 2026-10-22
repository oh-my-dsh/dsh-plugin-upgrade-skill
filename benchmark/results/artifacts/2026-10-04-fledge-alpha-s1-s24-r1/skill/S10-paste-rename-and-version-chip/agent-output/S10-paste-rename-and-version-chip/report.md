# S10 Report — Paste Renaming & Version-Chip Follow-Ups

## 1. Renaming design

**Naming scheme (paste path only):**
- Pasted images (MIME `image/*`): `paste_image.<ext>`, `paste_image(2).<ext>`, `paste_image(3).<ext>`, …
- All other pasted files: `paste_file.<ext>` with the same numbering, …
- First occurrence has no suffix; subsequent occurrences take `(n)` with n starting at 2.

**Where the rename is applied:** inside the paste acquisition path only — the paste-event
handler (or a `source === 'paste'` branch in `add()`), before the item is stored in the
record and before `input.insertReference(...)`. Files added by **drag-and-drop** and by the
**file/folder picker** must pass through untouched, keeping their real `item.path`/name. The
rename must not be applied in `validateItems`, `records` management, dock rendering, or the
upload path — those consume the already-renamed label/path. Collision checks inside
`validateItems` cover only duplicates within one selection batch and are insufficient.

**How the number is chosen:** for the base name, take the smallest n ≥ 1 such that the
candidate (`base.<ext>` for n=1, `base(n).<ext>` for n>1) does not appear in the authoritative
taken-names set; n=1 yields the unsuffixed name. Names assigned earlier within the same paste
batch also go into the set before the next item is numbered.

**Authoritative "names already taken" source:** the live composer snapshot —
`input.state.getSnapshot().occurrences` (their `label`/`path` of occurrences with
`source === SOURCE`) — plus names assigned earlier in the current paste batch. The plugin's
own `records` Map must NOT be the source of truth: its entries are retired whenever a
snapshot momentarily shows no occurrences for that ref (the alive-subscription in
`add()` calls `records.delete(ref)` on any transient empty snapshot, which can fire while
the composer reference still exists). After such a premature eviction the cache forgets a
name that is still live, so renaming against the cache can re-issue a taken name and
collide with an existing composer occurrence. Only the composer's live snapshot is
guaranteed to reflect what names are actually in use.

## 2. Extension rule and chip/path display (guidance)

- Extension: prefer the extension of the original (clipboard) file name when it exists and
  is non-empty; otherwise fall back to a MIME-type mapping (`image/png` → `.png`, etc.).
- The dock chip (`dshca-name`) displays the renamed label (e.g. `paste_image(2).png`).
- The uploaded path must be the same renamed name (`path: paste_image(2).png`), so the
  server-visible path matches what the user sees in the dock.

## 3. Follow-up B root cause and display rule

Root cause: the chip's "already latest" decision fetched the tag list from the GitHub API,
but that response is CDN-cached (`cache-control: private, max-age=60, s-maxage=300`,
`x-cache: HIT`, `age: 178`). Minutes after `v0.2.11` was pushed, the cached page still
predates both `v0.2.10` and `v0.2.11`, so the max stable tag the chip could compute was
`v0.2.9`. Because `semverCmp('v0.2.9', PLUGIN_VERSION='0.2.10') <= 0`, the code took the
green branch — and `renderCurrentChip(tag)` rendered **the fetched (stale) tag**, telling a
v0.2.10 user they were on "v0.2.9", with no mention that v0.2.11 existed.

Display rule: the chip must compare two values — the fetched remote tag vs the locally known
running `PLUGIN_VERSION` — to pick the chip kind, but the green "already latest" chip must
**show the locally known running version** (`PLUGIN_VERSION`, e.g. `v0.2.10`), never the
cached fetched tag. Show: running version when in sync; the remote tag only when it is
actually newer (update chip). A cached remote value is not ground truth next to a
locally-known running version.

## 4. Regression tests that would have caught both

Follow-up A:
- Two consecutive paste batches, each with two identical clipboard names `image.png`,
  assert the four dock labels are `paste_image.png`, `paste_image(2).png`,
  `paste_image(3).png`, `paste_image(4).png`.
- A paste collides with a name that is present in the live composer snapshot
  (`occurrences`) but was evicted from the plugin's `records` Map by the transient
  subscription — assert the rename still avoids that name (i.e. conflicts are computed from
  the live snapshot, not the cache).
- Drop and file/folder-picker additions keep their real names even when a same-named file
  was previously pasted (path stays the real one; only pasted items are renamed).

Follow-up B:
- Mock `fetch` to return the stale cached tag page (max stable `v0.2.9`) while
  `PLUGIN_VERSION = '0.2.10'`: assert the chip does not print `already the latest version
  v0.2.9` and instead shows the running version `v0.2.10`.
- Mock `fetch` to return a page where the max stable tag is newer than `PLUGIN_VERSION`:
  assert the update chip names that newer tag.
- Mock fetch failure/timeout: assert the offline chip, and no stale "latest" claim.

## 5. Lib-only release hygiene

- `PLUGIN_VERSION` is hand-inlined in the bundle; add a release check that fails if it
  differs from `package.json`'s `version` (grep/parse assert, or a tiny sync script run in
  CI). Every release must bump both together before tagging.
- With no build step, the hand-edited bundle is the shipped artifact: run a syntax check on
  it (`node --check lib/client.js` or equivalent) as part of the release checklist so a
  broken hand edit never gets tagged.
- There is no host-side update endpoint for this plugin: users receive updates by pulling a
  newer `@org/dsh-attach-input` package version — via the package manager / DSH profile
  plugin bundle (pinned reinstall) — followed by a host restart or hard refresh of the web
  client. The version chip can only inform (link to the release/tags page); it cannot
  deliver the update. Because the tag fetch is CDN-cached, treat it as advisory and never
  display a fetched tag as fact, especially not in the "already latest" chip.
