# S10 · Paste Renaming & Version-Chip Follow-Ups — Analysis Report

**Mode:** A-equivalent read-only inspection (per `plugin-upgrade` skill). No files in the
fixture were modified; no installs, migrations, or executions were performed. The only
write is this report.

**Baseline:** not collected (static evidence pack; no runnable repo, per skill "other
modes note not collected").

**Sources:** `fixture/plugin-attachment-flow.js` (v0.2.10 `add()`/`validateItems`, records
alive-subscription, dock chip, upload body), `fixture/plugin-version-chip.js`
(`PLUGIN_VERSION = '0.2.10'`, `latestFromTags()`, `renderCurrentChip`),
`fixture/user-threads.md` (follow-ups A and B as filed), `fixture/tags-api-response.txt`
(captured HTTP response ~90 s after pushing v0.2.11).

---

## 1. Follow-up A — renaming design (scored)

### Exact naming scheme

- Pasted **images**: `paste_image.png`, `paste_image(2).png`, `paste_image(3).png`, …
  (first occurrence carries no suffix; the *n*-th collision gets `(`n`)`, n = 2, 3, …).
- Other pasted **files**: `paste_file.<ext>` with the same numbering:
  `paste_file.pdf`, `paste_file(2).pdf`, …
- Numbering sequences are independent per final base key (`paste_image.png` vs
  `paste_file.pdf` count separately).
- Files acquired by **drag-and-drop** or the **file/folder picker** are never renamed;
  `item.path` passes through verbatim, exactly as today.

### Where in the flow the rename is applied — and what stays untouched

Today the paste path, the drop path, and the picker all funnel into the same `add()`,
and `add()` itself is source-blind (`const label = item.path`). The rename must therefore
be scoped **by acquisition path, at the single funnel point**:

1. Thread the origin into `add()` — e.g. `add(sessionId, items, origin)` with
   `origin: 'paste' | 'drop' | 'picker'` (or split a thin `addPasted()` wrapper that
   renames and then delegates). The paste event handler passes `'paste'`; the drop and
   picker handlers pass their own origin and take the unchanged path.
2. Inside `add()`, **only when `origin === 'paste'`**, replace `const label = item.path`
   with the rename step: classify image vs non-image, compute the extension (item 2),
   then resolve the number against the taken-names source below. The renamed value is
   used for **both** the record `label` (→ dock chip) **and** the upload body
   (`files: record.items.map(item => ({ path: renamedPath, ... }))`) so the uploaded
   file carries the same name the user saw. Drop/picker items skip the rename branch
   entirely.
3. `validateItems()` keeps its in-batch duplicate check on the **original** paths (it
   guards "two identical selections in one batch"); the rename layer must additionally
   track names it assigned **within the current batch**, because two clipboard files in
   one paste both start as `image.png` and the composer snapshot will not yet contain
   the first one when the second is numbered.

What must stay untouched: everything else in `add()` — coordinate handling, `id()` refs,
`insertReference` acceptance/rollback, the records Map, the alive-subscription, and
`changed()`. The rename is a pure pre-labeling step; it introduces no new state machine.

### How the number is chosen

For each pasted item, in order:

1. Compute the base (`paste_image` or `paste_file`) and extension → candidate `base.ext`.
2. Maintain a **taken set** = all occurrence labels currently in the composer snapshot
   (see authoritative source below) **∪** names already assigned earlier in this same
   `add()` batch. Take a fresh `input.state.getSnapshot()` before processing the batch
   (and refresh after each successful `insertReference`, as `add()` already does).
3. If `base.ext` is not taken, use it. Otherwise find the smallest *n* ≥ 2 such that
   `base(n).ext` is not taken, and use it. Add the winner to the taken set.

Smallest-free-number (not a monotonic counter) is the right choice: it survives deletion
of earlier paste attachments without producing gaps or re-collisions.

### Authoritative "names already taken" source — and why the records Map alone is wrong

**Authoritative source: the DSH composer's own occurrence state** —
`input.state.getSnapshot().occurrences` (each occurrence's label/path for this session),
supplemented only by the current batch's just-assigned names. That is what the user
actually sees in the composer, it is refreshed by the same subscription `add()` already
uses, and it reflects insertions and deletions made through any path (including the user
clearing the composer or DSH itself mutating the draft) — not just what this plugin
happens to remember.

The plugin-side `records` Map is the **wrong** sole source, and the fixture shows exactly
why: its alive-subscription retires an entry on **any momentary snapshot that shows no
occurrences** for that `ref` —

```js
const alive = current.occurrences.some(o => o.source === SOURCE && o.ref === ref);
if (alive || record.inflight !== undefined) return;
unsubscribe();
records.delete(ref);   // ← fires on ANY momentary empty snapshot
```

A transiently empty or partial snapshot (draft cleared and re-populated, snapshot race
during multi-item insertion, composer re-render) evicts the record even though the
attachment may still exist or the name may still be "occupied" in the user's mental
model. Consequences if the Map were the dedupe source:

- **Under-renaming**: an evicted `paste_image.png` record lets the next paste reuse the
  bare name, producing two chips named identically — the very bug being fixed.
- **Over-renaming / gaps**: the Map is module-level and per-page-load; a refresh wipes it,
  so counters would restart from 1 and collide with names still present in the composer —
  or, conversely, stale records that outlive their occurrences would skip numbers.

The records Map may be used at most as a supplementary hint (e.g. to prefer a name the
record proves was shown); the **snapshot occurrences are ground truth** for conflict
detection, because the rename's contract is "no two chips in the composer share a name",
and only the composer state can answer that.

---

## 2. Extension rule, dock chip, and upload path (guidance — not scored)

- **Extension from original name first**: if the clipboard file name has an extension
  (`image.png` → `.png`, `report.pdf` → `.pdf`), keep it — the browser-supplied name's
  extension is the most faithful signal even when the MIME is generic.
- **MIME fallback**: if the name has no usable extension, derive one from
  `item.file.type` (`image/png` → `.png`, `application/pdf` → `.pdf`,
  `image/jpeg` → `.jpg`). If the MIME is empty or unmappable, fall back to no extension
  (or a conservative `.bin`) rather than guessing.
- The classification **image vs non-image** for the base name (`paste_image` vs
  `paste_file`) should use the same ladder: name extension in a known image set, else
  MIME `image/*`.
- **Dock chip**: displays the **renamed label** (`record.label`), i.e. `paste_image(2).png`
  — never the raw `image.png`. Existing drop/picker chips keep showing real names.
- **Upload path**: the request body must send the **renamed path** for pasted items
  (`{ path: renamedPath, ... }`), so the file stored/served server-side matches the chip.
  Sending the original `image.png` here would resurface the ambiguity the chip just hid.

---

## 3. Follow-up B — root cause and the correct display rule (scored)

### Root cause

The chip's "latest" value comes from the GitHub **tags list API**
(`/repos/org/dsh-attach-input/tags?per_page=10`), and the captured response shows that
endpoint served a **stale CDN-cached page**:

- `cache-control: private, max-age=60, s-smage=300` (sic — `s-maxage=300` in the capture),
  `x-cache: HIT`, `age: 178` — the response was ~3 minutes old at capture time, i.e. it
  **predated the v0.2.10 and v0.2.11 pushes** (the body lists only `v0.2.9`, `v0.2.8`,
  `v0.2.7`, while `git ls-remote` proves both newer tags existed on the remote).

So `latestFromTags()` correctly computed "the newest stable-looking tag **in the payload**"
= `v0.2.9`. Then `startUpdateChip()` compared `semverCmp('v0.2.9', '0.2.10') <= 0` → true →
rendered the green "already latest" chip — and `renderCurrentChip(tag)` printed **the
fetched tag**, producing "already the latest version **v0.2.9**" for a user running
0.2.10 ninety seconds after 0.2.11 shipped. Two compounding mistakes:

1. treating a **cached remote listing** as ground truth for "latest" (the tags list is
   ordered but cache-stale; `per_page` pagination adds another silent-truncation hazard);
2. echoing the **fetched** value in the affirmative chip, so the stale data became a
   user-visible claim that contradicted the locally-known running version.

### The display rule the chip should follow

Compare exactly two values: **fetched latest tag** vs **locally-known running
`PLUGIN_VERSION`** — and let the *local* value own the affirmative display:

- `fetched > running` → render the **update-available** chip showing the *fetched* tag
  ("update available: vX.Y.Z"). A strictly-greater remote value is meaningful even
  through a cache; the worst case is a delayed notification.
- `fetched <= running` (including equal) → render the green chip showing **`PLUGIN_VERSION`,
  the local running version** — "✓ attach-input vX.Y.Z (up to date)". **Never render the
  fetched tag here.** When the fetch can only be at-best-as-new-as what you already run,
  the only version you can vouch for is the one in the bundle.
- `fetched === undefined` (non-OK, timeout, no stable tags) → offline chip, as today.

Optionally, reduce staleness at the source: request with `cache: 'no-store'` (or add a
cache-busting param), and/or use `/releases/latest` (which redirects to the actual
latest release) instead of the paginated, cache-prone tags list. But the display rule is
the load-bearing fix: the stale cache made the chip wrong; printing the fetched tag made
the wrongness visible and self-contradictory.

---

## 4. Regression tests that would have caught both (scored)

All of these are client-side unit tests around `add()` / the chip with the DSH composer
input state and `fetch` mocked — feasible for a lib-only bundle.

**Follow-up A (renaming):**

1. **Sequential pastes, identical clipboard names**: paste `image.png`, then paste
   `image.png` again → labels must be `paste_image.png` and `paste_image(2).png`; upload
   bodies carry the renamed paths. (This is the exact kaylint scenario; fails on v0.2.10.)
2. **Mixed types**: paste `image.png` + `report.pdf` + extensionless `Screenshot`
   (`file.type = 'image/png'`) → `paste_image.png`, `paste_file.pdf`,
   `paste_image(2).png` (MIME fallback exercised).
3. **Scope guard — drop and picker untouched**: add the same real-named file via the drop
   path and via the picker, even when a `paste_image.png` occurrence already exists →
   labels/paths stay verbatim; no rename branch is entered.
4. **In-batch collision**: one paste event carrying two clipboard files both named
   `image.png` → `paste_image.png` and `paste_image(2).png` (proves the batch-local taken
   set, not just `validateItems`).
5. **Authoritative-source test**: seed the composer snapshot with an occurrence labeled
   `paste_image.png` while the plugin's records Map is **empty** (simulating the
   momentary-empty-snapshot eviction or a page refresh) → the next paste must produce
   `paste_image(2).png`, not reuse the bare name. This is the test that pins the snapshot
   (not the records Map) as the conflict source.
6. **Eviction robustness**: fire the alive-subscription with a momentarily empty snapshot
   (record retires), then paste again → numbering still matches composer state (no
   duplicate bare names, no gap-jumping).

**Follow-up B (chip):**

7. **Stale-cache chip**: mock `fetch` resolving the captured payload (latest stable
   `v0.2.9`) with `PLUGIN_VERSION = '0.2.10'` → the green chip must render the **local**
   `0.2.10`; asserting the literal string `latest version v0.2.9` appears nowhere. (This
   is the rho_9 scenario; fails on v0.2.10.)
8. **Newer tag**: fetch returns `v0.2.11` → update-available chip shows `v0.2.11`.
9. **Equal tag**: fetch returns `v0.2.10` = running → green chip with local version
   (boundary of `semverCmp`).
10. **Fetch failure / timeout / no stable tags** → offline chip, no version claim.

Tests 1, 5, and 7 are the minimal trio that would have blocked both follow-ups before
release; the rest close the adjacent edges.

---

## 5. Lib-only release hygiene items this touches (scored)

1. **Hand-inlined version constant.** `PLUGIN_VERSION` is maintained by hand in
   `lib/client.js` and must equal `package.json`'s `version` at every tag. Make that
   mechanical: a release-time check (script or unit test) that reads
   `package.json#version` and asserts it equals the inlined constant — run before
   tagging. (The alternative — generating the constant — would introduce a build step
   the plugin deliberately doesn't have, so a checked-in sync assertion is the right
   lib-only mechanism.) Note the chip bug itself cannot be fixed retroactively for
   users already on 0.2.10: the chip logic ships inside their cached bundle; the fix
   only takes effect once they receive a newer bundle.
2. **Bundle syntax check.** With no build step, nothing compiles the shipped file — a
   syntax error ships silently. Add `node --check lib/<every>.js` (each lib entry) as a
   pre-tag step / CI job; it is fast, dependency-free, and catches the classic
   lib-only release failure of pushing a tag whose bundle cannot even parse.
3. **How users actually receive the update.** This plugin has **no host-side update
   endpoint**: it is a lib-only client bundle composed via the user's profile, so
   updates arrive only when the user **updates their composition** — re-pulling /
   reinstalling the package at the new version (or repointing their profile to the new
   tag) — and then **hard-refreshes** so the browser loads the new bundle. The version
   chip can *inform* ("v0.2.11 available — update your profile and refresh") but can
   never perform or guarantee delivery. Release notes / the update chip should state
   the manual step explicitly instead of implying an in-place update, and the green
   "already latest" chip should claim only "running vX.Y.Z", which the bundle can
   actually vouch for.

---

## Skipped

- No dependency/lockfile, enablement-resolution, runtime mount, or wrapper validation:
  the fixture is a static evidence pack (two code excerpts, one issue file, one captured
  HTTP response), not an installable repository — those layers have nothing to inspect.
- Skill references (version-corridor cards, migration planner, `verify-runtime.mjs`) are
  not applicable: no DSH host version corridor is involved; both follow-ups are
  plugin-internal client-logic defects.

## Pending / residual risk

- The exact composer-snapshot field carrying a human label (vs raw path) per occurrence
  is excerpted away in the fixture (`/* ... */`); the design assumes occurrence labels
  are readable from `input.state.getSnapshot()` as the dock chip's fallback
  (`occurrence.label`) already implies. Confirm against the real `@org/dsh-attach-input`
  source before implementing.
- CDN staleness can also delay the *update-available* signal (up to `s-maxage`); the
  `no-store`/`releases/latest` mitigation in §3 reduces but does not eliminate it.

## Rollback

Read-only task; no files outside the report directory were touched, so there is nothing
to roll back. Had this been implemented (Mode B/C), rollback would be the pre-change
`lib/client.js` + `package.json` at the recorded HEAD.

## Recommendations

- Implement the rename as a pure, origin-gated pre-labeling step (§1) with the composer
  snapshot as the sole conflict authority; keep the records Map out of naming decisions.
- Consider exposing the plugin's acquisition origin on its public `add()` signature so
  future callers cannot accidentally opt into renaming by default.
- Chip: local-version-owns-the-green-chip rule (§3) + `releases/latest`/`no-store` fetch;
  add release checks for version-constant sync and `node --check` (§5).
