# S10 · Paste Renaming & Version-Chip Follow-Ups — Design Report

**Plugin:** `@org/dsh-attach-input` (community Web plugin, lib-only bundle, no build step)
**Baseline shipped:** v0.2.10 · **Evidence read:** fixture/plugin-attachment-flow.js, fixture/plugin-version-chip.js, fixture/user-threads.md, fixture/tags-api-response.txt (read-only, unchanged)

Answered in full: items 1, 3, 4, 5 (scored). Item 2 (extension/MIME rule and what each surface shows) is included for completeness.

---

## 1. Follow-up A — unified renaming design

### 1.1 Exact naming scheme

| Acquisition path | Rule | Examples |
|---|---|---|
| Paste, image (clipboard File MIME `image/*`) | `paste_image` + counter + `.` + ext | `paste_image.png`, `paste_image(2).png`, `paste_image(3).png` |
| Paste, non-image | `paste_file` + counter + `.` + ext | `paste_file.pdf`, `paste_file(2).pdf` |
| Drag-and-drop | **unchanged** — real name kept verbatim | `Screenshot 2026-10-21.png` |
| File/folder picker | **unchanged** — real name kept verbatim | `report.pdf` |

- **Counter:** the first name carries **no** counter; each subsequent occupant of the same base gets `(n)` with **n starting at 2** — `paste_image.png`, `paste_image(2).png`, `paste_image(3).png`. There is never a `(1)`.
- **Classify "image" by the clipboard File's MIME type** (`image/*`), not by the original name: a pasted file named `image.png` whose MIME is `application/pdf` is a `paste_file.pdf`.
- **ext** — see §2 (original-name extension first, MIME fallback second).

### 1.2 Where the rename must be applied — and which paths stay untouched

All three acquisition paths (paste, drop, file/folder picker) funnel into `add()` (fixture/plugin-attachment-flow.js), which today keeps `item.path` verbatim. Renaming unconditionally inside `add()` would also rename real user files from drop/picker — wrong. The behavior change must be scoped to the **paste acquisition path only**:

- **Recommended placement:** the paste handler — the code that wraps the clipboard `File` into the `item` whose `path` feeds `add()` — computes the new name there (scheme + collision numbering) and sets `item.path` before calling `add()`. Then `add()`, `validateItems()`, the drop handler and the picker handler are untouched by construction.
- **Acceptable alternative:** tag the acquisition source explicitly (e.g. `add(sessionId, items, { source: 'paste' })`, or `item.source = 'paste'` set by the paste handler) and rename inside `add()` only for tagged items. The tag must come from the code path, never be inferred from the file name — a dropped file genuinely named `image.png` must keep `image.png`.
- **Ordering:** the rename must complete **before** `validateItems()` and **before** `insertReference()`. Then (a) the in-batch duplicate throw never fires for paste collisions (renaming already resolved them) while staying intact for drop/picker, where two identical real paths in one selection is still an error; (b) the occurrence created by `insertReference()` already carries the final name, so the dock chip fallback `occurrence.label` and `record.label` agree.
- **Stays untouched:** the drop path, the picker path, `validateItems()`' in-batch duplicate check for those paths, and the upload-body builder. Because the rename rewrites `item.path`, the existing `files: record.items.map(item => ({ path: item.path, ... }))` picks up the renamed value automatically (see §2 for keeping chip and uploaded path in lock-step).

### 1.3 How the number is chosen

For each pasted file, in batch order:

1. Build base = `paste_image` or `paste_file` + `.` + ext (§2).
2. Compute the taken set **T at that moment**: the authoritative set from §1.4 **plus** the names already assigned to earlier items in the same batch.
3. If `base.ext` ∉ T → use it. Otherwise use the **smallest integer n ≥ 2** such that `base(n).ext` ∉ T.

- **Batch-atomic:** one paste of three screenshots yields `paste_image.png`, `paste_image(2).png`, `paste_image(3).png` even though all three carried `image.png`.
- **Smallest-free policy:** if `paste_image(2).png` was removed from the composer, the next paste reuses `paste_image(2).png`. This matches the sequence the user asked for literally. (If number reuse is disliked, the documented alternative is monotonic `max(existing n) + 1`; whichever is chosen must be specified and pinned by tests — §4 T6.)

### 1.4 The authoritative "names already taken" source

**Authoritative source = the live composer state, re-read fresh at rename time:** `input.state.getSnapshot().occurrences` filtered to `o.source === SOURCE` (the plugin's own occurrences); their labels/paths form the taken set T. This is literally what the user sees in the dock and what will be uploaded, so it is the only place where "name already taken" is actually defined.

**Why a plugin-side records cache alone is the wrong source:** the module-level `records` Map is a **cache with a retiring subscription**, not a registry. As fixture/plugin-attachment-flow.js shows, the subscription callback runs on every snapshot and does `records.delete(ref)` whenever the ref is momentarily absent from `occurrences` (and not inflight) — including transient/empty snapshots that do **not** mean the attachment is gone (composer re-renders that briefly report zero occurrences, undo/redo churn, snapshot reordering). So `records` can silently lose entries whose attachments are still live in the composer; symmetrically it can briefly hold a record whose `insertReference` failed before the `!accepted` cleanup. Deriving taken-names from `records` therefore lets a second paste regenerate `paste_image.png` while the first `paste_image.png` is still in the composer → duplicate dock chips, ambiguous uploaded paths, and a scheme that "sometimes doesn't work" — precisely the class of bug that gets filed. The retirement behavior is fine as memory hygiene; the fix is not to depend on it: never consult the cache for conflicts — always re-read the composer snapshot at naming time.

---

## 2. Extension rule and what each surface displays (guidance, not scored)

- **Extension rule:** use the **original name's extension** when one exists and is sane (lowercased, restricted to a short alnum suffix such as `[A-Za-z0-9]{1,10}`): pasted `Screenshot 2026-10-21.PNG` → `paste_image.png`. Only when the original name has **no** usable extension, fall back to a **MIME map**: `image/png`→`.png`, `image/jpeg`→`.jpg`, `image/gif`→`.gif`, `image/webp`→`.webp`, `application/pdf`→`.pdf`, `text/plain`→`.txt`, …; unknown/empty MIME with no name extension → **no extension** (documented), never a guessed suffix. The image-vs-file *class* comes from MIME `image/*` (§1.1), independently of the extension choice.
- **Dock chip** (`h('span', { className: 'dshca-name' }, record?.label ?? occurrence.label)`) must display the renamed logical name, e.g. `paste_image(2).png`.
- **Uploaded path** (`files: record.items.map(item => ({ path: item.path, ... }))`) must carry exactly the same renamed name. Set `record.label` and `item.path` to the same value in one place so the chip and the uploaded path can never diverge: the chip text is a promise about the filename the server receives.

---

## 3. Follow-up B — root cause and the chip rule that should replace it

### 3.1 Root cause: a stale CDN page was trusted as "latest", and the wrong value was printed

Chain of events (fixture/tags-api-response.txt, fixture/plugin-version-chip.js, fixture/user-threads.md):

1. `latestFromTags()` fetches the GitHub tags list. The captured response ~90 s after the `v0.2.11` push was **served from cache**: `x-cache: HIT`, `age: 178`, `cache-control: private, max-age=60, s-maxage=300` — a page roughly 3 minutes old whose body (`v0.2.9, v0.2.8, v0.2.7`) predates both the `v0.2.10` and `v0.2.11` pushes. `git ls-remote --tags` at the same moment proves both tags existed on the remote. So `latestFromTags()` returned **`v0.2.9`**.
2. `startUpdateChip()` then evaluates `semverCmp('v0.2.9', '0.2.10') <= 0` → true → `renderCurrentChip('v0.2.9')`, which prints *"✓ attach-input already the latest version v0.2.9"*.
3. Two compounding mistakes:
   - **Trusting a cached remote value as ground truth.** A CDN-cached tags page can be minutes stale ("not in the fetched list" ≠ "does not exist"); the fetch result is a hint, not an oracle.
   - **Displaying the fetched tag instead of the locally-known running version.** The chip knew `PLUGIN_VERSION = '0.2.10'` and still rendered `v0.2.9` — an older tag — as "the latest version", which is false twice over: `v0.2.11` was the latest tag, and the user was running `0.2.10`, not `0.2.9`.
4. Why the old logic cannot be patched around this: `fetched ≤ running` has **two** readings — "you are up to date" **or** "the cache is stale". The chip cannot distinguish them, so it must never emit a claim that is false in either case. "Latest = v0.2.9" is false in both.

### 3.2 The display rule the chip should follow instead

**Which two values compare:** `fetchedLatest` (max stable tag in the response) vs. the running `PLUGIN_VERSION`, via `semverCmp`.
**Which one is shown:** the running version is always what the chip displays as "your version / current"; a fetched tag is displayed **only** when it is strictly newer, and then only as the *available* version:

| Comparison | Chip | What is shown |
|---|---|---|
| `fetchedLatest > running` | update chip | fetched tag as available **and** running version as current: "v0.2.11 available — you are running v0.2.10" |
| `fetchedLatest == running` | green current chip | **`PLUGIN_VERSION`**: "✓ attach-input is up to date (v0.2.10)" |
| `fetchedLatest < running` (stale-cache evidence) | green current chip | **`PLUGIN_VERSION` only** — the older fetched tag is never rendered: "✓ attach-input is up to date (v0.2.10)" (or "running v0.2.10 — couldn't verify latest") |
| fetch failed / timed out | offline chip | no version claim (unchanged from today) |

**Invariant:** any "current / already latest" chip shows the **running** `PLUGIN_VERSION`; a fetched tag may appear only in an update chip and only when `fetchedLatest > running`. Never print a fetched tag as "the latest" when it is not strictly newer than the running version.

Hardening (defense in depth, not a substitute for the rule): request cache-busted (`cache: 'no-store'`/`'no-cache'`, a timestamped query, or `If-None-Match`) so an 8 s lookup is not answered by a 178 s-old CDN page; keep the 8 s `AbortSignal.timeout` and the offline chip for failures.

---

## 4. Regression tests that would have caught both follow-ups before release

Run as unit tests with a stubbed `fetch` and a fake composer (`input.state.getSnapshot()` with controllable `occurrences`, callable `subscribe`) in the release gate.

**Follow-up A:**
- **T1 · naming sequence** — three separate paste calls, each with one `File{ name: 'image.png', type: 'image/png' }` → labels and upload paths exactly `paste_image.png`, `paste_image(2).png`, `paste_image(3).png`.
- **T2 · scope isolation** — drop and picker items keep their real names (`Screenshot 2026-10-21.png`, `report.pdf`), including a dropped file actually named `image.png`; assert `item.path` is untouched.
- **T3 · batch + mixed types** — one paste of `[image.png, image.png, notes.pdf]` → `paste_image.png`, `paste_image(2).png`, `paste_file.pdf`; `validateItems` must not throw.
- **T4 · extension rule** — `shot.PNG` → `paste_image.png`; no ext + `image/jpeg` → `paste_image.jpg`; no ext + `application/pdf` → `paste_file.pdf`; no ext + empty MIME → the documented no-extension fallback.
- **T5 · authoritative source over the retiring cache (the key regression)** — paste #1; drive the `records` subscription against a momentarily empty snapshot so `records` loses the ref while the occurrence remains in the composer snapshot; paste #2 → must be `paste_image(2).png`. This test fails whenever taken-names are computed from the `records` Map.
- **T6 · numbering policy** — after removing `paste_image(2)` from the composer, the next paste yields the documented name (smallest-free ⇒ `paste_image(2).png`; monotonic ⇒ `paste_image(4).png`).
- **T7 · chip/upload parity** — for every renamed item, the dock label equals `files[].path` in the upload body.

**Follow-up B:**
- **T8 · stale-tags regression (the exact incident)** — stub fetch returning `[v0.2.9, v0.2.8, v0.2.7]` with cached headers (`x-cache: HIT`, `age: 178`) while `PLUGIN_VERSION = '0.2.10'` → assert the rendered chip text contains `0.2.10`, does **not** contain `v0.2.9`, and never claims "latest v0.2.9". Must fail against the v0.2.10 code.
- **T9 · genuine update** — fetch `[v0.2.11, v0.2.10, …]`, running `0.2.10` → update chip naming `v0.2.11` and showing running `0.2.10`.
- **T10 · equality** — fetched max == running → current chip shows the running version string.
- **T11 · fetch failure / timeout** → offline chip, no version claim.
- **T12 · invariant/property test** — over a matrix of (fetched, running) pairs: every "current" chip contains `PLUGIN_VERSION` and no tag with `semverCmp(tag, running) < 0`; fetched tags appear only in update chips with `tag > running`.
- **T13 · cache hygiene (if adopted)** — the request carries the cache-busting marker (`cache: 'no-store'`) and a stale response (`age > 0`) hits the §3.2 stale branch.

---

## 5. Lib-only release hygiene items this touches

- **Hand-inlined version constants.** `PLUGIN_VERSION` in `lib/client.js` is hand-written and is what users actually run (no build step injects it). The release gate must fail unless `lib/client.js`'s `PLUGIN_VERSION` == `package.json` `version` == the git tag `v<version>`, all bumped in the same commit. A tiny release script greps the constant (and any other literal version strings, e.g. chip text/footers) and diffs against `package.json` before `npm publish` and before tag push. Follow-up B makes this gate non-optional: the chip's honesty depends entirely on the inlined constant being right.
- **Bundle syntax check.** With no build step, nothing compiles the shipped files — a typo ships straight to users and breaks the whole client bundle. The release gate runs `node --check` on every shipped `.js` entry plus a parse/import smoke test under stubbed globals (or an esbuild/acorn parse) and a quick DOM-stub smoke render of the chip strings. Catch it before publish, not in the issue tracker.
- **Ship-the-bundle check.** `npm pack` (or the release zip) and inspect the tarball to confirm it contains the bumped `lib/client.js` — lib-only publishes ship source verbatim, so a forgotten stage ships the old version constant.
- **How users actually receive the update (no host-side update endpoint).** DSH does not push code into this plugin and there is no update endpoint; the self-update chip is **advisory only** and cannot apply anything. Users upgrade **manually**: pull/re-download the new bundle (`git pull` / `npm i @org/dsh-attach-input@latest` / release download), replace the installed `lib/` file(s), then reload (hard-refresh) the tab so the client plugin re-executes. Therefore: (a) the update chip should link to the release/install instructions; (b) release notes must state these manual steps; (c) the chip's display rule must be honest — it is the plugin's **only** upgrade signal, which is exactly why "latest v0.2.9" was so damaging. Also cache-bust the tag fetch and degrade to "couldn't verify" (§3.2), since the same CDN cache will hide future tags.

---

## run-stats

- **toolcalls 总数:** 21（9 次 `run_code` 程序调用 + 12 次嵌套工具调用：1 glob、1 working_directory、6 read、3 write、1 send_message）
- **token 用量:** n/a（本会话不可见）
- **完成时间:** 2026-10-21T06:40:34.306Z（报告写入时间，Asia/Shanghai 时区同日）
