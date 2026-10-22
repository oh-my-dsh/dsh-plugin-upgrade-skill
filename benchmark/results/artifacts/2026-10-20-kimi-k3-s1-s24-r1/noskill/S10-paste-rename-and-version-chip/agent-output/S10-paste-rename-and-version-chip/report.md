# S10 Report — Paste Renaming & Version-Chip Follow-Ups
Plugin: @org/dsh-attach-input v0.2.10 (lib-only bundle, no build step)

## 1. Renaming design (Follow-up A)

### Naming scheme
Applied **only to items that arrive via the paste acquisition path**:
- Pasted **images** (`file.type` starts with `image/`): `paste_image.<ext>`, then `paste_image(2).<ext>`, `paste_image(3).<ext>`, …
- Pasted **other files**: `paste_file.<ext>`, `paste_file(2).<ext>`, …
- First occurrence carries **no suffix**; the counter starts at 2. Next index = (highest index already taken for that stem + extension) + 1, treating the un-suffixed name as index 1.

### Where the rename is applied — and what stays untouched
All three acquisition paths (paste, drag-and-drop, file/folder picker) funnel into `add()`, so an unconditional rename inside `add()` would wrongly rename user files. The rename must be **scoped to the paste path only**: either rename in the paste event handler before calling `add()`, or pass an explicit origin flag (e.g. `source: 'paste'`) into `add()` and rename only those items. The **drop path and picker path must pass `item.path` through verbatim** — those are the user's real file names. The rename is written back so that both `record.label` and the upload payload's `item.path` carry the new name.

### How the number is chosen — and the authoritative "names already taken" source
The taken-names set must be computed from the **live composer state** — `input.state.getSnapshot().occurrences` labels (the ground truth of what is actually attached in the composer) — **unioned with the names already assigned earlier in the same batch** (a just-inserted item may not yet be visible in a snapshot taken inside the same loop).

The plugin-side **records Map is the wrong source**, structurally: the alive-subscription calls `records.delete(ref)` on **any momentary empty snapshot** (`alive || record.inflight !== undefined` guard passes the moment `occurrences` transiently shows nothing). So the Map is a lossy cache that can retire entries for attachments that are still present in the composer. Deriving "names already taken" from it would under-count and re-issue e.g. `paste_image(2).png` while a real `paste_image(2).png` still sits in the composer — a dock/upload name collision, which is exactly the class of bug the current in-batch-only duplicate check already fails to catch across batches. Use composer state (authoritative), never the fragile cache.

## 2. Extension rule & what each surface displays (guidance, unscored)

- **Extension:** prefer the extension of the original clipboard name (`image.png` → `.png`; a pasted `report.pdf` → `.pdf`). If the original name has no usable extension, fall back to the **MIME type** (`file.type`: `image/png` → `.png`, `application/pdf` → `.pdf`; last resort a generic/no extension). The base name (`paste_image` vs `paste_file`) is chosen from MIME (`image/*`), not from the extension.
- **Dock chip:** renders `record?.label ?? occurrence.label`, so `label` must be set to the **renamed** name (`paste_image(2).png`) — never the raw browser-given `image.png`.
- **Upload path:** the payload uses `record.items.map(item => item.path)`, so the renamed path must be written back into the item used for upload; the uploaded file must arrive as `paste_image(2).png`. Both surfaces show the renamed name; the original clipboard name is discarded entirely (paste path only).

## 3. Follow-up B — root cause & the correct display rule

**Root cause.** Minutes after the v0.2.11 push, the GitHub tags API answered from a shared/CDN cache: `x-cache: HIT`, `age: 178`, `cache-control: … s-maxage=300`. The cached page predated **both** v0.2.10 and v0.2.11, so `latestFromTags()` returned `v0.2.9`. The chip then evaluated `semverCmp('v0.2.9', PLUGIN_VERSION /* 0.2.10 */) <= 0` → true → `renderCurrentChip(tag)`, and the green chip interpolated **the fetched tag**: "already the latest version v0.2.9". Two failures compound: (a) a possibly-stale **cached remote value was trusted as ground truth** even though it was *older* than the locally-known running version — a self-contradictory state that should have been detected; (b) the "already latest" chip **displayed the fetched tag** instead of the running version, so a stale cache actively told a v0.2.10 user that v0.2.9 was "latest" and said nothing about v0.2.11.

**Display rule.** Compare exactly two values: the **fetched remote latest tag** and the **locally-known `PLUGIN_VERSION`**.
- fetched tag **strictly greater** than `PLUGIN_VERSION` → render the update chip showing the **fetched tag** (that is the only case the remote value may be displayed).
- fetched tag **≤** `PLUGIN_VERSION` (equal, or stale/older) → render the green chip showing **`PLUGIN_VERSION`** (the running version), e.g. "✓ attach-input is up to date (v0.2.10)". Never render a version lower than the running one as "latest"; an older fetched tag is evidence of a stale cache, not of being current.

## 4. Regression tests that would have caught both

**Follow-up A (renaming):**
1. Paste a batch of 2 clipboard `image.png` files → labels and upload paths are `paste_image.png`, `paste_image(2).png`; paste a second batch of 2 → `(3)`, `(4)` (numbering continues across batches — the current in-batch-only check misses this).
2. **Cache-fragility test:** simulate the alive-subscription retiring a record (momentary empty snapshot → `records.delete(ref)` fires) while the occurrence still exists in the composer, then paste again → the next number must still skip the taken name; no duplicate `paste_image(2).png` is issued. This pins the authoritative-source choice.
3. Pasted non-image (`blob` named `image.png`-style or `report.pdf`, MIME `application/pdf`) → `paste_file.pdf`; name with no extension → extension derived from MIME.
4. Drag-and-drop and picker batches keep original names **verbatim** (rename scoped to paste only); two pasted items in one batch get unique names.

**Follow-up B (version chip):**
5. Mock fetch returning a stale tag list (max `v0.2.9`) with `PLUGIN_VERSION = '0.2.10'` → chip must NOT claim "latest version v0.2.9"; the green chip displays `0.2.10`.
6. Mock fetch returning `v0.2.11` → update chip displays `v0.2.11`.
7. Fetch failure/timeout (`!res.ok`, abort) → offline chip; no false "latest" claim.
8. `semverCmp` unit tests incl. the regression window: `0.2.10 > 0.2.9`, `0.2.11 > 0.2.10`, equality, leading-`v` handling.
9. Release-consistency test: the hand-inlined `PLUGIN_VERSION` in `lib/client.js` === `package.json` version (see item 5).

## 5. Lib-only release hygiene items this touches

- **Hand-inlined version constants.** With no build step, `PLUGIN_VERSION` is a literal in `lib/client.js` that must be bumped in lockstep with `package.json` at every release; add a pre-tag/CI check asserting equality (test 9). Drift here directly poisons the chip's comparison — it is the locally-known half of the item-3 rule.
- **Bundle syntax check.** No bundler means nothing catches a syntax error before publish; run `node --check lib/*.js` (plus a smoke import) as a release gate before tagging.
- **How users actually receive the update.** There is **no host-side update endpoint**: users get the new code only by re-fetching/re-installing the bundle (a hard refresh pulls the new lib from the registry/CDN). The version chip is therefore the **only** update signal — it must stay correct under stale caches: compare remote-latest vs running-version as in item 3, never display a fetched version older than the running one, and optionally harden the fetch (`cache: 'no-store'`/revalidation) while accepting that shared caches (`s-maxage=300`) can still lag — the display rule must be robust to exactly that lag.
