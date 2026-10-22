# S10 · Paste Renaming & Version-Chip Follow-Ups — Analysis Report

Plugin: `@org/dsh-attach-input` v0.2.10 (lib-only bundle, no build step).
Evidence: `fixture/plugin-attachment-flow.js`, `fixture/plugin-version-chip.js`, `fixture/user-threads.md`, `fixture/tags-api-response.txt` (read-only, unmodified).

---

## 1. Follow-up A — Renaming design (scored)

### 1.1 Exact naming scheme
- Pasted **images** (MIME `image/*`): `paste_image.png`, `paste_image(2).png`, `paste_image(3).png`, …
- Pasted **other files**: `paste_file.<ext>`, `paste_file(2).<ext>`, … with the same numbering.
- First occurrence carries **no suffix**; the counter starts at **2**; each new paste takes the **lowest free** candidate in the chain (not a monotonic counter — see 1.4).
- Chains are keyed by the exact candidate full name (base + extension), so `paste_image.png` and `paste_image.jpg` are independent chains; collision checking is on the exact full name.
- Image-vs-other is decided by **MIME type**, never by the clipboard file name (every clipboard image arrives named `image.png`).

### 1.2 Where the rename is applied — one acquisition path only
- The rename belongs at the **paste acquisition boundary**: where the paste event's DataTransfer files are converted into `{ file, path }` items, **before** `add()` / `validateItems()` run. Concretely: tag the batch with its acquisition source (`source: 'paste'`) and rewrite `item.path` (and the future `record.label`) there — either per item inside the add-loop just before each `insertReference` (so each decision sees the freshest re-read snapshot), or up-front in the paste handler with an in-batch assigned-name set. Either way it is a paste-path-only transform.
- Renaming **before** `validateItems` also fixes a latent bug: pasting several clipboard files in one batch currently trips the in-batch duplicate check (`Duplicate attachment path: image.png`) because all items share the clipboard name; after renaming, the batch is collision-free by construction.
- **Paths that must stay untouched:** the **drag-and-drop** path and the **file/folder picker** path keep their real `item.path` byte-identical — including the edge case where a real file is literally named `paste_image.png`. `add()` itself stays source-agnostic: no renaming inside it unless the item/batch is tagged as paste.
- Everything downstream consumes the renamed value consistently: `record.label` = new name (the dock chip renders `record?.label ?? occurrence.label`), and the **upload body** sends the same renamed `path` (`files: record.items.map(item => ({ path: item.path, ... }))`). Chip label and uploaded path never diverge; the server stores the file under the renamed name.

### 1.3 Authoritative "names already taken" source
The authoritative source is the **live composer snapshot at decision time**, i.e. `input.state.getSnapshot().occurrences` (the labels/paths the host currently considers attached for this composer), **unioned with the names already assigned in the current in-flight batch** (to cover the window between assigning a name and the snapshot reflecting its `insertReference`). The composer snapshot is the same state the retirement subscription itself keys on, is read synchronously at rename time, and always matches what the user can see in the dock.

**Why the plugin-side `records` Map alone is the wrong source:** `records` is a derived in-memory cache whose lifetime is governed by a racy alive-subscription. Per the fixture, the subscription fires on *any* snapshot change and retires the entry (`unsubscribe(); records.delete(ref)`) whenever a snapshot **momentarily** shows no occurrence for that ref and `record.inflight === undefined`:

- Momentary empty snapshots happen transiently (composer re-render/swap before the occurrence list repopulates). The attachment is still alive and visible, but the cache entry is gone. Numbering from `records` alone would then hand out a name that is still on screen → two identical chips and duplicate upload paths — exactly the collision class Follow-up A exists to remove.
- `records` is only populated by this session's `add()` calls and is silently shrunk by every spurious retirement (and is empty after a reload), so it systematically *undercounts* taken names. A uniqueness source must never undercount.
- Defense in depth: also fix the retirement race itself (e.g. require the not-alive condition across ≥2 consecutive snapshots, or debounce before deleting) — but the numbering design must not depend on `records` even after that fix, because the snapshot remains the only source equal to ground truth.

### 1.4 How the number is chosen
For a paste item: build the candidate chain (`paste_image<ext>` → `paste_image(2)<ext>` → `paste_image(3)<ext>` …, or the `paste_file` chain), and pick the **first candidate absent from the taken set** defined in 1.3. Because the taken set is the live snapshot, **deleting** a pasted attachment frees its number and the next paste reuses the lowest free slot — the scheme is stateless beyond the composer itself; no plugin-side counter or cache needs to survive.

---

## 2. Extension rule & display (guidance, not scored)

- **Extension:** use the original clipboard file name's extension when it has one (`image.png` → `png`). When the name is empty or extensionless, fall back to a **MIME → extension map** (`image/png`→`png`, `image/jpeg`→`jpg`, `image/gif`→`gif`, `image/webp`→`webp`, `application/pdf`→`pdf`, `text/plain`→`txt`, …), with a final fallback of `bin`. Never derive the extension from a *renamed* value, and never classify image-vs-file by name.
- **Dock chip:** displays the renamed name (`record.label`, falling back to `occurrence.label`) — the user sees `paste_image(2).png`, never the raw clipboard `image.png`.
- **Uploaded path:** the upload body carries the same renamed `path`, so the stored/sent file name equals what the chip shows. Chip and upload path are one value by construction.

---

## 3. Follow-up B — Root cause & correct display rule (scored)

### 3.1 Root cause: a stale cached remote list rendered as ground truth
Chain of events (evidence: `tags-api-response.txt` + `plugin-version-chip.js`):

1. The GitHub tags API response the user's chip received was an **intermediate-cache HIT**: `cache-control: private, max-age=60, s-maxage=300`, `x-cache: HIT`, `age: 178`. The cached page **predated both the v0.2.10 and v0.2.11 pushes** and listed only `v0.2.9`, `v0.2.8`, `v0.2.7` — while `git ls-remote` proves v0.2.10 and v0.2.11 existed on the remote at that moment.
2. `latestFromTags()` reduced that stale list to its max: `v0.2.9`.
3. `startUpdateChip()` compared `semverCmp('v0.2.9', PLUGIN_VERSION='0.2.10') <= 0` → true → `renderCurrentChip(tag)`.
4. `renderCurrentChip` prints **the fetched tag**: "✓ attach-input already the latest version v0.2.9". So a user on 0.2.10, minutes after v0.2.11 shipped, was shown a version *older than their own* as "the latest", and was never told v0.2.11 existed.
5. "A while later it changed its mind" = the shared cache expired (`s-maxage=300`) and a fresh page arrived.

The design error is twofold: (a) the chip **trusts a cached remote value as ground truth** next to a locally-known running version, and (b) it **displays the fetched value** instead of the running one. The code never treats "fetched max < running version" as the contradiction it is: a released running build cannot be newer than the true remote max, so fetched < running is *proof the list is stale*, not proof of currency.

### 3.2 The display rule the chip should follow
- **Which two values compare:** the fetched latest stable tag vs the hand-inlined `PLUGIN_VERSION` (the locally-known running version). The comparison result decides *which chip state* renders — nothing else.
- **Which one is shown:** the chip always shows the **greater** of the two values:
  - fetched **>** running → amber "update available" chip naming the **fetched tag** (the only case where a fetched value is displayed);
  - fetched **≤** running → green chip naming **`PLUGIN_VERSION`** — "already the latest version v0.2.10". Never render the fetched tag in the green chip: a cached list can never prove a *newer* remote exists, but the running bundle is infallible about its own version, so the only honest green claim is the local one.
- Hardening (recommended): when fetched **<** running strictly, treat the list as stale and do **one cache-busting revalidation** before concluding "no update" — e.g. refetch with `cache: 'no-store'` / a `cb=<timestamp>` query parameter, or query the releases-latest endpoint. If it still returns an older max, render green with the running version (optionally hinted "couldn't verify newer releases right now"). This keeps the chip from silently missing a real v0.2.11 for up to five minutes per CDN cache cycle.

---

## 4. Regression tests that would have caught both follow-ups (scored)

### Follow-up A (rename)
1. **Sequential pastes:** two separate pastes of a clipboard image (`image.png`, `image/png`) → labels/paths `paste_image.png` then `paste_image(2).png`; assert record label, occurrence label, and upload `path` all match. (v0.2.10 fails: both stay `image.png`.)
2. **Multi-file single batch:** paste 3 clipboard images in one add() → `paste_image.png`, `paste_image(2).png`, `paste_image(3).png`; assert `validateItems` no longer throws `Duplicate attachment path`.
3. **Non-image paste:** clipboard file with MIME `application/pdf` → `paste_file.pdf`; second → `paste_file(2).pdf`.
4. **Scoping — drop/picker untouched:** drag-and-drop and picker items (`report final.pdf`, and adversarially a real file literally named `paste_image.png`) keep their exact names; assert the rename code never runs off the paste path.
5. **Fragile-cache regression (the key one):** attach `paste_image.png`; fire the alive-subscription with a momentary empty snapshot so `records.delete(ref)` runs while the occurrence remains in the composer snapshot; paste again → result must still be `paste_image(2).png`. Any records-Map-based numbering fails this test; snapshot-based numbering passes.
6. **Delete frees the number:** remove the attachment holding `paste_image(2).png`; next paste reuses `paste_image(2).png` (taken set tracks the snapshot, not a monotonic counter or cache).
7. **Extension fallback:** extensionless clipboard file with `image/jpeg` → `paste_image.jpg`; unknown MIME → `paste_file.bin`.
8. **Chip/upload parity:** for every paste, dock-chip text === `record.label` === path sent in the upload body.

### Follow-up B (version chip)
9. **Stale-list replay (the incident itself):** feed the captured `tags-api-response.txt` payload (v0.2.9/v0.2.8/v0.2.7 only) with `PLUGIN_VERSION = '0.2.10'` → the chip must **not** contain "v0.2.9"; green text must read "v0.2.10" (and may trigger one cache-busting refetch). v0.2.10 code fails this test verbatim.
10. **Update available:** fetched max `v0.2.11` vs running `0.2.10` → update chip names `v0.2.11`.
11. **Equal versions:** fetched max === running → green chip shows the running version.
12. **Fetch failure/timeout/non-OK:** offline chip only; never claims any version is "latest".
13. **Display-rule unit test:** `renderCurrentChip` output always contains `PLUGIN_VERSION`; a fetched tag string may appear only in the update chip.
14. **Version-constant sync:** CI test asserting the hand-inlined `PLUGIN_VERSION` in the shipped lib equals `package.json` version — the constant the whole comparison depends on.

---

## 5. Lib-only release hygiene this touches (scored)

- **Hand-inlined version constant.** With no build step, `PLUGIN_VERSION` in `lib/client.js` is the bundle's only knowledge of itself, and it must be kept in sync with `package.json` at **every** release. Make it mechanical, not manual: the release script writes the package.json version into the constant (single source of truth), CI asserts equality before publish (test 14), and the tag is pushed only **after** the shipped artifact is final — the chip reads the tag list, so tag/publish ordering is user-visible. Follow-up B shows what rides on this constant: it is one side of the only comparison the chip makes.
- **Bundle syntax check.** Nothing transpiles or validates the shipped file, so release CI must run `node --check lib/client.js` on the **exact shipped artifact**, plus a headless smoke load (import in a DOM-ish environment, render the dock chip and the version chip) to catch syntax slips and accidental Node-only APIs. Keep the source free of syntax that assumes a transpiler.
- **How users actually receive the update.** This plugin has **no host-side update endpoint**, so the host never delivers new code by itself — the version chip is the *entire* update channel. "Updating" means the user re-installs / re-fetches the plugin lib (from the repo release or registry) and hard-refreshes, after which the fresh bundle carries its own newly inlined `PLUGIN_VERSION`. Consequences:
  1. Chip correctness is safety-critical: a stale-cache false "already latest" (Follow-up B) means users **never learn** a new version exists — there is no second notification path. The tag fetch must therefore bypass intermediary caches (`cache: 'no-store'` / cache-busting param / releases-latest endpoint) whenever it is about to conclude "no update".
  2. The "update available" action must route the user to the actual re-install path (link/instructions), because there is no in-place patching mechanism.
  3. The green chip's claim depends jointly on fresh remote data **and** the correct inlined constant; tests 9–14 pin both ends.
