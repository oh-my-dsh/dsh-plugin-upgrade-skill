# S10 · Paste Renaming & Version-Chip Follow-Ups — Report

Plugin under maintenance: `@org/dsh-attach-input` v0.2.10 (client-side, lib-only bundle, no
build step). Evidence: the four files in the read-only fixture directory
(`plugin-attachment-flow.js`, `plugin-version-chip.js`, `user-threads.md`,
`tags-api-response.txt`). No fixture file was modified.

---

## 1. Follow-up A — unified renaming for pasted files (design)

### Naming scheme

- Pasted **images** (MIME type `image/*`, regardless of the clipboard file name):
  - first: `paste_image.png`
  - subsequent: `paste_image(2).png`, `paste_image(3).png`, …
- Other pasted **files**:
  - first: `paste_file.<ext>` (e.g. `paste_file.pdf`)
  - subsequent: `paste_file(2).pdf`, `paste_file(3).pdf`, …
- The parenthesized counter starts at 2 for the first duplicate; the base name (no
  suffix) is used when no conflict exists.

### Where the rename is applied — and which paths stay untouched

The rename must be scoped to exactly **one acquisition path: the clipboard/paste
handler**, before items reach `add()`. Practically:

- Tag each item with its origin (`paste` vs `drop` vs `picker`) at the point where the
  browser hands the plugin the `File`/clipboard payload — that is the only place the
  plugin still knows how the file arrived.
- In the paste handler, replace `item.path` with the computed `paste_image…` /
  `paste_file…` name (and keep using the renamed name everywhere downstream: the record
  `label`, the occurrence label in the composer, and the `path` field of the upload
  body).
- `add()` itself should stay name-agnostic, or at most take the already-renamed items;
  it must **not** rename on its own, because it is the shared funnel for paste, drag-drop,
  and the file/folder picker. Renaming inside `add()` would silently rename dropped and
  picked files too — exactly what the user forbade.
- **Untouched paths:** drag-and-drop and the file/folder picker keep the real
  `item.path` verbatim, even if it collides with an existing `paste_image.png`-style
  name. The rename scheme is purely an acquisition-time presentation for clipboard files,
  not a general uniqueness mechanism.

### How the number is chosen

For each pasted item, compute the base name (`paste_image` or `paste_file` plus
extension), then find the first name not already taken:

1. Candidate 1: `paste_image.png` (no suffix).
2. If taken, try `paste_image(2).png`, `paste_image(3).png`, … incrementing until a free
   name is found.
3. Continue across separate paste batches within the same session: a second paste of one
   screenshot after an earlier paste of two must land on `paste_image(3).png`, not restart
   at `(2)` — so numbering must be derived from the live name set, not from a per-batch
   counter. Within one multi-file paste batch, names committed earlier in the same loop
   must count as taken for later items in that batch (the in-batch check in
   `validateItems` is on the original paths and does not cover this).

### Authoritative "names already taken" source — and why the records Map alone is wrong

The authoritative conflict source must be **the DSH composer input state snapshot** —
`input.state.getSnapshot().occurrences` (the names the host actually shows and owns),
optionally unioned with the plugin-side `records` Map for in-flight entries not yet
reflected in a snapshot. The plugin's own `records` Map alone is the wrong source for
three concrete reasons visible in the excerpt:

1. **The subscription retires entries on any momentary empty snapshot.** The alive-check
   in `input.state.subscribe` fires `records.delete(ref)) whenever
   `current.occurrences` momentarily shows no occurrence with the plugin's `ref` — even
   if that is a transient state during a re-render or batch update. Once an entry is
   deleted this way, its name (`paste_image.png`) looks free again while the attachment
   may still exist, so the next paste would hand out the same name — the exact bug class
   the user is complaining about, reintroduced through the cache.
2. **The cache is lost on reload / re-navigation** while the composer content (the host
   state) persists; a fresh module-level `records` Map knows nothing about names that are
   still present in the composer.
3. **The cache only knows this plugin's own inserts.** Names contributed by any other
   path or plugin are invisible to it, so it under-counts conflicts.

The host snapshot is the ground truth the user actually sees; the rename probe should read
names from it (each occurrence's label/path), with the plugin Map used only as a
supplementary check for entries inserted microseconds ago in the same batch.

## 2. Extension rule and what each surface displays (guidance; not scored)

- **Extension:** prefer the extension of the original clipboard file name when it has one
  (`image.png` → `.png`, `report.pdf` → `.pdf`). If the clipboard file name has no
  extension, derive it from the file's MIME type (`image/png` → `png`,
  `application/pdf` → `pdf`); if the MIME type is unknown or maps to nothing, fall
  back to `bin`. Pasted images whose MIME is not PNG but whose clipboard name says
  `image.png` should keep extension fidelity: prefer the MIME-derived extension when the
  name's extension is the browser's generic placeholder.
- **Dock chip:** display the **renamed** name — `record.label` must be set to the new
  name (today `label = item.path` keeps `image.png`). The chip shows
  `paste_image(2).png`.
- **Upload path:** the `files: record.items.map(item => ({ path: item.path, ... }))`
  body must send the **same renamed** value, so the name on the chip and the name the
  server receives are identical. Keep one renamed name per item in one place and derive
  both surfaces from it, so they can never diverge.

## 3. Follow-up B — root cause and the display rule

### Root cause

The chip's tag check trusts a **cached remote value as ground truth**. The captured
response (`tags-api-response.txt`) shows the GitHub tags endpoint served from CDN cache:
`x-cache: HIT`, `age: 178`, `cache-control: max-age=60, s-maxage=300`. The cached page
predates both recent pushes, so the API returned `v0.2.9` as the newest tag minutes after
`v0.2.11` was pushed (`git ls-remote` confirms both `v0.2.10` and `v0.2.11` exist on
the remote). The chip logic then evaluated `semverCmp('v0.2.9', '0.2.10') <= 0` → true →
`renderCurrentChip('v0.2.9')` — and `renderCurrentChip` prints the **fetched tag**, not
the running version. So a user on 0.2.10 was told "already the latest version v0.2.9" by a
stale CDN page. It self-corrected "a while later" when the cache expired (s-maxage=300 ⇒
up to ~5 minutes), matching the user's report.

Secondary hygiene factor: the running version comes from the hand-inlined
`PLUGIN_VERSION = '0.2.10'`, so any drift between the inlined constant and the released
package would compound the lie — but in this incident the inlined value was correct; the
fetched tag was stale.

### The display rule the chip should follow

Compare exactly two values: the **fetched latest tag** vs the **local running
`PLUGIN_VERSION`**. The value rendered must be chosen by the comparison outcome:

- If `latestTag > PLUGIN_VERSION` → render the **update** chip and show the fetched tag
  ("update available v0.2.11"). Showing the remote tag is safe here: a stale-low cache can
  only delay this message, never fabricate one.
- If `latestTag <= PLUGIN_VERSION` → render the green "already latest" chip but display
  the **local `PLUGIN_VERSION`**, never the fetched tag. The chip's claim "you are on the
  latest" is a statement about the running bundle, and the only authoritative source for
  the running bundle's version is the bundle itself. A stale-low tag then renders
  "already the latest version 0.2.10" — truthful, harmless, and it degrades to a no-op
  rather than a lie.
- If the fetch fails/times out → offline chip (no version claim), as today.

Additionally (defense in depth, optional): request fresh data (`cache: 'no-store'` or an
`If-None-Match` revalidation) so the comparison input is less often stale, and filter out
any tag that is not strictly greater before trusting it for an update prompt. But the
display rule above is the fix: the fetched tag is only ever shown when it strictly exceeds
the locally-known running version.

## 4. Regression tests that would have caught both

### Follow-up A (renaming)

1. **Two images pasted in one batch, both named `image.png` by the browser** → labels are
   `paste_image.png` and `paste_image(2).png`; upload bodies carry the same two paths.
   (v0.2.10 fails: both stay `image.png`.)
2. **Two sequential pastes** (separate `add()` calls) of one screenshot each →
   `paste_image.png` then `paste_image(2).png`. Verifies numbering survives batch
   boundaries by reading the live snapshot, not a per-batch counter.
3. **Rename applies only to paste:** simulate a drag-drop and a picker selection of files
   named `image.png` → real names preserved verbatim, even when a `paste_image.png`
   already exists. (Guards against implementing the rename inside the shared `add()`
   funnel.)
4. **Non-image pasted file:** `report.pdf` pasted twice → `paste_file.pdf`,
   `paste_file(2).pdf`; extensionless clipboard file with MIME `image/png` →
   `paste_image.png` (MIME fallback).
5. **Authoritative-source test:** after the alive-subscription retires a record (simulate
   the momentary empty snapshot the fixture comment warns about), paste another screenshot
   → the new name must not reuse the retired record's name. (v0.2.10's cache-based logic
   fails this; a snapshot-probing implementation passes.)

### Follow-up B (version chip)

1. **Stale-cache scenario:** stub `fetch` to return a tag list whose max is `v0.2.9`
   while `PLUGIN_VERSION = '0.2.10'` → the green chip text must contain `0.2.10` and
   must NOT contain `v0.2.9`. (v0.2.10 fails: prints the fetched tag.)
2. **Newer-tag scenario:** stubbed max tag `v0.2.11` > `0.2.10` → update chip renders
   and displays `v0.2.11`.
3. **Equal-tag scenario:** stubbed max tag exactly `v0.2.10` → green chip showing
   `0.2.10`.
4. **Offline scenario:** `fetch` rejects / times out → offline chip, no version string.
5. **Version-constant sync check:** a release-time assertion that the hand-inlined
   `PLUGIN_VERSION` equals `package.json` `version` (see §5).

## 5. Lib-only release hygiene items this touches

1. **Hand-inlined version constant.** With no build step, nothing injects the version into
   `lib/client.js`; `PLUGIN_VERSION = '0.2.10'` is maintained by hand and must be bumped
   in lockstep with `package.json` `version` in the same commit. Add a release-checklist
   step (or a tiny test) that greps `PLUGIN_VERSION` out of `lib/client.js` and compares
   it to `package.json` — the chip's display rule (§3) makes the local constant the
   authority, so drift here becomes a user-facing lie in the opposite direction.
2. **Bundle syntax check.** Because the bundle ships as-is (no compile/transpile gate),
   run `node --check lib/client.js` (or a parse/import smoke of every `lib/` file) before
   tagging, so a hand-edit syntax error cannot ship as a release.
3. **How users actually receive the update.** The plugin has **no host-side update
   endpoint**; the chip is only a notification surface. Delivery happens through the
   normal package distribution: bump `package.json` + `PLUGIN_VERSION`, publish the
   package to the registry users installed from, and only then push the git tag. Order
   matters: the chip triggers on tags, so tagging before the package is installable
   invites users into a failed update; tag after publish. Users then hard-refresh /
   reinstall (or update their profile/plugin install) to pull the new lib bundle — the
   chip's "update available" state should disappear on next load once the running
   `PLUGIN_VERSION` catches up to the fetched tag.
4. **Cache-aware tag fetch (from §3):** send `cache: 'no-store'` (or revalidate with
   `ETag`/`If-None-Match`) on the tags request so the comparison input is fresh; keep the
   8s abort timeout. Combined with the display rule, a stale CDN page can then only
   produce a truthful "already latest <running version>" or a delayed update prompt —
   never the v0.2.9-style regression.
