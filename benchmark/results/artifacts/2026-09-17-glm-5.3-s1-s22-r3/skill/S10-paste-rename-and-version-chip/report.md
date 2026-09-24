# S10 · Paste Renaming & Version-Chip Follow-Ups — Analysis Report

Task: read-only analysis (skill Mode A · inspect) of two post-release follow-ups for
`@org/dsh-attach-input` v0.2.10 (lib-only Web plugin, clipboard/drop/picker → composer
attachments). No files inside the fixture were modified; no migration, installation, or
write was performed anywhere except this report.

Evidence reviewed (all read-only):

- fixture/plugin-attachment-flow.js — add()/validateItems, records Map + alive-subscription, dock chip label
- fixture/plugin-version-chip.js — latestFromTags() + startUpdateChip() + renderCurrentChip()
- fixture/tags-api-response.txt — captured GitHub tags API response ~90s after pushing v0.2.11
- fixture/user-threads.md — follow-up A (kaylint) and follow-up B (rho_9)

Baseline (Mode C suite): not collected — this task is read-only analysis; no build/test
run was applicable or permitted against the fixture.

---

## 1. Follow-up A — renaming design

### 1.1 Exact naming scheme

- Pasted **images**: `paste_image.png`, then `paste_image(2).png`, `paste_image(3).png`, …
- Other pasted **files**: `paste_file.<ext>` with the same numbering — `paste_file.pdf`,
  `paste_file(2).pdf`, … (the first occurrence carries no parenthesized number).
- Images and non-images number **independently** (each pool has its own counter derived
  from the taken-name set; pasting an image never advances the `paste_file` sequence and
  vice versa).

### 1.2 Where the rename is applied — and which paths stay untouched

The rename must be applied **only on the paste acquisition path**, at the point where the
clipboard `File` object is converted into an `item` **before it reaches `add()`** — or as
the first step inside `add()` gated by an `acquisition: 'paste'` flag on the item. The
renamed value must replace `item.path` (or at minimum `label` **and** the `path` sent in
the upload body — see item 2) so the chip, the record, and the uploaded file all agree.

Paths that must **keep the real name verbatim**:

- drag-and-drop of files or folders,
- the file picker and the folder picker.

These paths must not pass through the renaming code at all. Concretely: today all three
paths funnel into `add()`, which applies `item.path` verbatim (`const label = item.path`).
Introduce the rename as a scoped pre-step keyed on the acquisition source, not as a change
to `add()`'s core — `add()` keeps accepting whatever path it is given, and only the paste
caller (or a `if (item.acquisition === 'paste')` branch at the top of the loop) rewrites
it. `validateItems`' in-batch duplicate-path check stays as-is; renamed paste names are
unique by construction, and real dropped/picked names keep their existing semantics.

### 1.3 How the number is chosen

At each rename decision, compute the set `taken` of names already in use (see 1.4), then:

1. candidate = `paste_image.png` (or `paste_file.<ext>`);
2. if `candidate` is in `taken`, try `paste_image(2).png`, `paste_image(3).png`, … in
   ascending order and take the **first free name**;
3. within one multi-item paste batch, each accepted name is immediately added to `taken`
   so the next item in the same batch continues the sequence.

First-free (rather than max+1) matches the chat-app behavior the user asked for and
recycles holes left by removed attachments.

### 1.4 The authoritative "names already taken" source

**The live composer input state — `input.state.getSnapshot()`'s `occurrences` (their
labels/paths), read at rename time — plus the in-batch assignments made so far.** That is,
derive `taken` from what the composer actually contains at the moment of the paste, not
from any plugin-side bookkeeping.

Why the plugin-side `records` Map alone is the **wrong** source — two independent defects
visible in the excerpt:

1. **It self-corrupts on momentary empty snapshots.** The alive-subscription installed per
   record fires `records.delete(ref)` whenever a snapshot arrives in which
   `current.occurrences` has no occurrence with `(source, ref)` and the record is not
   inflight. Snapshots are momentary views: during state transitions, re-renders, or
   compaction the occurrence list can transiently lack the ref, so the subscription
   retires a record whose attachment is in fact still present (or about to reappear). The
   maintainer's own note says it: "a subscription that retires entries whenever a snapshot
   momentarily shows no occurrences." Once `records` drops the entry, a name derived only
   from `records` would be handed out again → two live attachments named
   `paste_image.png`.
2. **It only knows this plugin's own additions.** `records` has no visibility into names
   that entered the composer through any other path (an earlier turn, a dropped file named
   `paste_image.png` by coincidence, host-side insertions), so it under-counts the real
   conflict set.

The snapshot is the ground truth the composer itself renders and uploads from; reading it
at assignment time makes the check self-healing — even if `records` was corrupted, the
next rename still sees every name actually present. (Keep `records` for what it is good
at — chip re-render state — just never as the naming authority.)

---

## 2. Extension rule and what each surface displays (guidance, not scored)

- **Extension source of truth: the original clipboard file name.** `image.png` → base
  `paste_image`, extension `.png`; `report.pdf` → base `paste_file`, extension `.pdf`.
- **MIME fallback**: when the original name carries no usable extension, derive it from
  `file.type` (`image/png` → `.png`, `application/pdf` → `.pdf`, …); if the MIME type is
  empty or unmapped, fall back to the raw name's extension (possibly none) — never invent
  an extension.
- **Dock chip**: displays the **renamed** label — i.e. `record.label` must be the new name
  (`paste_image(2).png`), because the chip currently renders `record?.label ?? occurrence.label`
  and the user identifies attachments by it.
- **Uploaded path**: the upload body's `files: record.items.map(item => ({ path: item.path, ... }))`
  must carry the **same renamed path**. The chip and the uploaded path must never diverge:
  rename once, at acquisition, and let both surfaces read the single stored value.

---

## 3. Follow-up B — root cause and the correct display rule

### 3.1 Root cause

The chip's `latestFromTags()` calls
`GET https://api.github.com/repos/org/dsh-attach-input/tags?per_page=10`. The captured
response shows the GitHub API answered **200 from a shared CDN cache** with
`cache-control: private, max-age=60, s-maxage=300`, `x-cache: HIT`, `age: 178` — i.e. a
page up to ~5 minutes stale is legitimately served. Minutes after pushing `v0.2.11`
(which does exist: `git ls-remote` lists both `v0.2.10` and `v0.2.11`), the cached page
still **predates both pushes** and lists `v0.2.9` as the newest stable tag.

The code then computed `latest = v0.2.9`, evaluated `semverCmp('v0.2.9', '0.2.10') <= 0`
(true — the user was on 0.2.10), and rendered the green "already the latest version" chip
— but `renderCurrentChip` prints **the fetched tag**, not the running version:
`'✓ attach-input already the latest version v0.2.9'`. So a stale cached remote value was
presented as ground truth next to a locally-known running version, producing a message
that was wrong twice over (the user was on 0.2.10, and 0.2.11 existed). "A while later it
changed its mind" is exactly the cache window expiring.

Secondary contributors worth noting: `per_page=10` truncates the tag list (with enough
intermediate tags the newest can fall off the page), and the fetch sends no
cache-busting, so the default cacheable GET is used.

### 3.2 The display rule the chip should follow

- **Compare**: fetched latest tag **vs. the locally-known running `PLUGIN_VERSION`** (the
  hand-inlined constant). These are the only two values in the decision.
- **Display**: the green "already latest" chip must show **the running local version**,
  never the fetched value: "✓ attach-input v0.2.10 (up to date)".
- **Staleness guard**: when `fetched < running`, the remote answer is *by definition*
  stale (a tag older than the running bundle cannot be the true latest). Treat that case
  as "update status unknown / check again", not as "latest" — render a neutral state (or
  re-fetch with cache busting) instead of a green check. Only `fetched == running` (or a
  corroborated equality) justifies the green chip.
- Recommended hardening (optional): append a cache-buster (`?per_page=100&t=…` or
  `cache: 'no-store'`) and keep the timeout; and link the update chip to the tag's
  release URL rather than implying self-update.

---

## 4. Regression tests that would have caught both follow-ups

All are client-side unit tests with the fetch / input-state seams mocked; no host needed.

### Follow-up A

1. **Sequential paste rename**: paste two clipboard items both named `image.png` (one
   batch or two successive pastes) → labels/upload paths are `paste_image.png` and
   `paste_image(2).png`; a third paste yields `paste_image(3).png`.
2. **Records-cache poisoning (the scored trap)**: install a record, then drive the
   alive-subscription with a **momentary empty snapshot** (occurrences without the ref) so
   `records.delete(ref)` fires while the composer still holds the attachment (a later
   snapshot shows it again). The next paste must still get `paste_image(2).png` — proving
   the taken-name source is the live snapshot, not `records`. Without the fix this test
   fails with a duplicate `paste_image.png`.
3. **Scope — other paths untouched**: drag-and-drop and file/folder-picker items keep
   their real `item.path` and `label` verbatim through `add()`.
4. **Non-image files and MIME fallback**: paste `report.pdf` twice → `paste_file.pdf`,
   `paste_file(2).pdf`; paste an extension-less `File` with `type: 'image/png'` →
   `.png` derived from MIME.
5. **Cross-path collision**: drop a real `image.png` via the picker, then paste a
   clipboard `image.png` → the pasted one gets `paste_image.png` (or the next free
   number if that name is taken), never colliding with the dropped name;
   `validateItems`' in-batch duplicate check must not reject the pair.

### Follow-up B

1. **Stale-tag test**: mock the tags fetch to return `["v0.2.9", "v0.2.8", "v0.2.7"]`
   with `PLUGIN_VERSION = '0.2.10'` → the chip must **not** render "already the latest
   version v0.2.9"; it must render the running version (or the neutral unknown state).
   This is the exact rho_9 transcript as a test.
2. **Newer-tag test**: fetch returns `v0.2.11` → update chip rendered naming `v0.2.11`.
3. **Equal-tag test**: fetch returns `v0.2.10` → green chip displaying **0.2.10** (the
   local constant), not the fetched string formatting.
4. **Offline test**: fetch rejects / times out → offline chip, no exception escapes.
5. *(Optional hardening assertions)*: the request carries cache-busting / `no-store`, and
   `per_page` is large enough not to truncate the newest tag.

---

## 5. Lib-only release hygiene touched by this task

1. **Hand-inlined version constant.** `PLUGIN_VERSION = '0.2.10'` lives in
   `lib/client.js` because there is no build step to inject it. Every release must bump
   `package.json` **and** this constant together. Add a mechanical gate to the release
   checklist / CI: assert `PLUGIN_VERSION` in the shipped bundle equals
   `package.json`'s `version` (a two-line smoke test reading both). A missed bump makes
   the chip lie in the opposite direction (perpetual "update available" to the version
   you already run).
2. **Bundle syntax check.** With no compiler in the loop, a syntax slip ships straight to
   users. Gate every release on `node --check` over each `lib/*.js` file (plus a
   require/import smoke in a bare Node process) so a broken bundle cannot be tagged.
3. **How users actually receive the update.** This plugin has **no host-side update
   endpoint** — nothing auto-updates. Users get a new version only by reinstalling from
   the registry / checking out the new tag (or replacing their copied bundle) and
   hard-refreshing. Consequences for the chip: it is an **informing** surface only — it
   should link to the release/tag with install instructions, never imply it applied an
   update; and post-release verification should confirm that after reinstall the rendered
   version actually changes (proving the constant bump reached users).
4. **Tag-propagation awareness** (follow-up B fallout): the GitHub tags API is
   CDN-cached up to ~5 minutes (`s-maxage=300`); release communication should not rely
   on it being fresh, and the chip code must tolerate `fetched < running` as above.

---

## Skill report structure addenda

- **Completed**: read-only analysis of both follow-ups from the four fixture artifacts;
  this report. No code, configuration, or dependency was changed.
- **Skipped**: baseline build/test (no build step, fixture is static and read-only);
  runtime mount verification (would require executing the fixture, which is forbidden);
  corridor/card lookup (not a host-migration task — no DSH version boundary is involved;
  both follow-ups are plugin-local logic bugs).
- **Pending/residual risk**: the exact composer snapshot field holding an occurrence's
  display name (`occurrence.label` vs a path field) should be confirmed against the real
  host `input.state` types before implementing 1.4; the `per_page=100` / cache-buster
  details are recommendations, not verified against GitHub's current API limits.
- **Rollback**: nothing to roll back — zero writes outside this report file.
- **Recommendations**: implement the scoped paste-rename pre-step with snapshot-derived
  taken-names; fix `renderCurrentChip` to display the running version plus the
   stale-tag guard; add the release gates in item 5; consider replacing the
  alive-subscription's "any momentary empty snapshot retires the record" logic with an
  occurrence-identity-aware check (the same race can misfire the chip today).
