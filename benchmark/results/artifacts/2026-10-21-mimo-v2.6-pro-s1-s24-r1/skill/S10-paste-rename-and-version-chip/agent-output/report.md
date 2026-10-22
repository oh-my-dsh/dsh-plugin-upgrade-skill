# S10 · Paste renaming & version-chip follow-ups — design report (read-only)

**Plugin**: `@org/dsh-attach-input` v0.2.10 — community Web plugin, lib-only bundle (`lib/client.js`), no build step.
**Evidence**: `fixture/plugin-attachment-flow.js` (add()/validateItems, records alive-subscription, dock chip), `fixture/plugin-version-chip.js` (tag fetch + "already latest" chip), `fixture/user-threads.md` (kaylint / rho_9), `fixture/tags-api-response.txt` (captured tags API response).
**Skill frame**: `plugin-upgrade` Mode A (inspect, read-only) — nothing in `fixture/` or any source was modified; all items below are design-level recommendations. No network calls were made; the captured HTTP response is the only network evidence.

---

## 1. Follow-up A — unified renaming for pasted files

### 1.1 The exact naming scheme

| Acquired by | Kind (MIME `type`) | Resulting name |
|---|---|---|
| paste | starts with `image/` | `paste_image.png`, `paste_image(2).png`, `paste_image(3).png`… |
| paste | anything else | `paste_file.<ext>`, `paste_file(2).<ext>`… (same numbering) |
| drag-and-drop | any | **unchanged** — real file name verbatim |
| file/folder picker | any | **unchanged** — real file name verbatim |

- Base stem: `paste_image` for pasted images, `paste_file` for every other pasted file. The two kinds never share a counter.
- Suffix: occurrence 1 gets the bare name (`paste_image.png`); occurrence k ≥ 2 gets `paste_image(k).<ext>` — ASCII parentheses, no space, suffix inserted **before** the extension.

### 1.2 Where the rename is applied (and which paths stay untouched)

- **One funnel, one scoped branch.** Paste, drop, and picker all funnel into `add(sessionId, items)`; the rename is applied **inside `add()`, at entry, before any validation** — but only for items that arrived through the paste path. Concretely: the callers declare their source, e.g. `add(sessionId, items, { via: 'paste' })` (or a thin `addPasted()` wrapper that renames and delegates). Drop and picker pass `via: 'drop' | 'picker'` and skip renaming entirely.
- **Order matters.** Inside `add()`: (1) classify + rename pasted items → (2) `validateItems()` on the resulting names → (3) record creation / `insertReference` / upload mapping. Today `validateItems` throws `Duplicate attachment path` on two items sharing a path **in one batch** — and a single paste event routinely delivers several files all literally named `image.png`. Renaming must therefore run *before* the in-batch check, and the check must run on the final names. Its original strictness is preserved for drop/picker batches, where two identical real paths are a genuine user error worth reporting.
- **Untouched paths.** Drop and picker items keep `item.path` verbatim end-to-end (dock label and upload body included); the `File`/bytes are never modified; the `No files were selected` guard and multi-select behavior are unchanged. The rename is a *name-level* transformation only — it changes what the attachment is called, never what it contains or where it came from.

### 1.3 How the number is chosen — and the authoritative "names already taken" source

**Number choice = first-fit over a candidate sequence.** For a pasted item with stem `S` and extension `E`, evaluate `S.E`, `S(2).E`, `S(3).E`… in order and take the **first candidate not in the taken-names set**, then add that name to the set before naming the next item of the batch. Numbering is per (stem, ext): a pasted PDF takes `paste_file.pdf` even when `paste_file.zip` exists. In the normal flow (nothing deleted) this yields exactly the sequence kaylint asked for; after a deletion the freed name can be reused, which is deterministic and self-healing. A monotonic per-session counter was rejected: it is itself a cache (reset by page reload, drifting after deletions) and leaves avoidable holes.

**Authoritative taken-names source = the composer's own state**: `input.state.getSnapshot().occurrences` for the target session at the moment of naming — the names the user actually sees in the composer (at minimum every `o.source === SOURCE` occurrence label; taking all occurrence labels in the session's composer namespace is even safer) — **plus** the names already assigned to earlier items in the same `add()` call, accumulated locally as the batch is processed.

**Why a plugin-side `records` cache alone is the wrong source.** The `records` Map is a *self-pruning shadow state*, not a namespace:

1. The alive-subscription retires an entry with `records.delete(ref)` on **any** snapshot that momentarily shows no occurrence (and no inflight) — including transient empty snapshots during composer state transitions (re-render, snapshot rebuild, session switch). The record vanishes while the attachment is still in the composer; the dock even falls back to `occurrence.label` afterwards. A naming pass consulting `records` would conclude `paste_image.png` is free and assign it **again** — reproducing the exact collision the scheme exists to remove.
2. Even without that bug, `records` only contains what *this page load* inserted; attachments already present in the composer before a reload never enter it, so it under-counts independently of the subscription.

The composer snapshot is complete, current, and is the very thing the user compares names against; the Map is eventually-consistent mirror state with a known early-retire bug. Compute names from a fresh snapshot per `add()` call. (The retire-on-empty subscription deserves its own fix — retire only on a confirmed removal or after absence survives a settled snapshot — but the renaming must not wait for it.)

## 2. Extension rule and display (guidance — not scored)

**Extension resolution for a pasted item, in order:**
1. **Original name wins for real names**: if the incoming file name has a genuine extension (e.g. a file copied from disk pasted as `report.pdf`), use it (`paste_file.pdf`).
2. **MIME fallback** when the name has no extension or is one of the browser's clipboard placeholders (`image.png`, `image.jpg`, empty name): derive from `item.file.type` via a small map (`image/jpeg→jpg`, `image/png→png`, `image/gif→gif`, `image/webp→webp`, `application/pdf→pdf`, `text/plain→txt`, `text/html→html`, `application/zip→zip`, …).
3. Otherwise `.bin`.

**The placeholder pitfall**: browsers label *every* clipboard image `image.png` even when the bytes are JPEG — so for known placeholders the MIME type must override the lying suffix (a pasted JPEG becomes `paste_image.jpg`, not `paste_image.png`), while a real name's extension is trusted.

**What each surface shows — one name per attachment:**
- **Dock chip** (`dshca-name`): the new unified name — `record.label` is set to the renamed name at `add()` time (e.g. `paste_image(2).png`). That is what the user asked to see.
- **Uploaded path**: the **same** renamed name in the upload body (`files: [{ path: renamedName, … }]`), so the conversation-side attachment and the dock chip agree. The real incoming `item.path` is kept only inside the record as transport detail, never displayed. Drop/picker show their real name in both places.
Rule: the rename is computed once in `add()` and both surfaces consume that single value.

## 3. Follow-up B — root cause and the chip's display rule

**Root cause — two compounding layers:**

1. **Data layer (stale remote).** The tags endpoint is served through GitHub's cache. The capture shows `cache-control: private, max-age=60, s-maxage=300`, `x-cache: HIT`, `age: 178`: roughly 90 seconds after pushing `v0.2.11`, the served JSON still ended at `v0.2.9` and did not even contain `v0.2.10` — the cached page predates both pushes — while `git ls-remote` proves both tags existed. `latestFromTags()` faithfully reduced that stale list to `v0.2.9`.
2. **Display layer (the lie).** `startUpdateChip()` computed `semverCmp('v0.2.9', '0.2.10') <= 0` and entered `renderCurrentChip(tag)`, which prints **the fetched tag**: `✓ attach-input already the latest version v0.2.9` — to a user running 0.2.10, minutes after 0.2.11 shipped. A **cached remote value was rendered as ground-truth "latest"**, contradicting the one value the client knows without doubt: its own running version. And `fetched < running` is not merely stale — it is self-refuting evidence that the fetch is out of date (a running version cannot exceed the true latest); the code had no branch for that case at all.

**Display rule the chip should follow instead.** Compare exactly two values:

- `running` = `PLUGIN_VERSION` — **locally known, ground truth**;
- `fetched` = `latestFromTags()` — **a remote hint, possibly stale or absent**.

Then:
| Case | Chip | Which version is shown |
|---|---|---|
| `fetched > running` | update chip | **both**: the offered target *and* the fact — "v0.2.11 available — you're running v0.2.10" |
| `fetched == running` | green chip | the **running** version — "✓ attach-input is up to date · v0.2.10" |
| `fetched < running` | no "latest" claim | the **running** version only ("running v0.2.10 · update check inconclusive"), optionally retry once cache-busted |
| fetch failed / nothing stable | offline chip | the running version only |

Invariant: the green "current" chip **never** prints a fetched tag; the only remote version ever displayed is as an *offer strictly newer* than running. Asymmetry justifies this: stale data can only delay the update offer (harmless — it self-heals when the TTL expires, exactly what rho_9 saw "a while later") or produce `fetched ≤ running` (inconclusive); it can never legitimately make the fetched tag the thing to show. Supporting hardening (not the fix): cache-busted / revalidated requests (`cache: 'no-cache'`, unique query param) and one bounded retry after the observed TTL window (~60–300 s).

## 4. Regression tests that would have caught both follow-ups

Fake `input` (getSnapshot / insertReference / subscribe) + mocked `fetch`; all unit-level.

**Group A — paste renaming**
- **A1 multi-file same name in one paste**: one paste event with 3 files all named `image.png` → `paste_image.png`, `paste_image(2).png`, `paste_image(3).png`; no `Duplicate attachment path` throw. (Catches the validateItems-ordering regression.)
- **A2 cross-call numbering from the composer**: paste → snapshot now shows `paste_image.png`; paste again → `paste_image(2).png`. (Catches any counter derived from a local cache.)
- **A3 fragile-cache trap** *(the scored one)*: after the first paste, push a momentary **empty** snapshot through the plugin's alive-subscription (retiring `records`), then paste again → must still yield `paste_image(2).png`. Fails against a records-Map taken set; passes only against the composer-snapshot source.
- **A4 scope**: the same items via drop and via picker keep real names verbatim; a drop batch with two identical real paths still throws `Duplicate attachment path`. (Catches over-broad application of the rename.)
- **A5 numbering edges**: with `paste_image.png` + `paste_image(2).png` attached, delete `(2)`, paste → `paste_image(2).png` again (first-fit); pasted PDF + ZIP → `paste_file.pdf`, `paste_file.zip`; image and file kinds never share a base.
- **A6 display parity**: `record.label` (dock chip) === uploaded `files[0].path`; drop/picker keep the real name in both.
- **A7 extension** *(unscored)*: `report.pdf` → `paste_file.pdf`; placeholder `image.png` with `image/jpeg` → `paste_image.jpg`; no name + `text/plain` → `paste_file.txt`; unknown → `.bin`.

**Group B — version chip**
- **B1 the captured incident** *(the scored one)*: canned payload `[v0.2.9, v0.2.8, v0.2.7]` with `PLUGIN_VERSION = '0.2.10'` → chip text contains `0.2.10`, does **not** contain `latest version v0.2.9`, and shows no update offer. This is rho_9's exact scenario; it fails on v0.2.10 as shipped.
- **B2 equal versions display the running constant**: fetched == running → assert on the **rendered string** that it carries `PLUGIN_VERSION`, not the fetched tag (catches `renderCurrentChip(tag)`).
- **B3 real update**: fetched `v0.2.11` vs running 0.2.10 → update chip offering v0.2.11 **and** stating running 0.2.10.
- **B4 failure modes**: fetch timeout / non-OK / no stable tags → offline chip, zero "latest" claims.
- **B5 tag semantics**: prerelease tags (`v0.2.12-rc.1`) excluded by the stable filter; max selection is by semver order, not array order (`[v0.2.9, v0.2.10]` must pick 0.2.10).
- **B6 release hygiene**: `PLUGIN_VERSION === package.json.version` (hand-inlined constant sync) as a CI gate.

## 5. Lib-only release hygiene these follow-ups touch

1. **Hand-inlined version constants.** `lib/client.js` duplicates `PLUGIN_VERSION` from `package.json` and nothing verifies them. Under §3's display rule the chip's honesty literally depends on that constant being right. Hygiene: keep the inline constant (no build step) but gate releases on the **B6** check (or a one-line release script that verifies/rewrites it); the release checklist item is "bump both, then run B6".
2. **Bundle syntax check.** With no build step, nothing parses `lib/client.js` before users download it — one syntax error ships dead, and per the skill's troubleshooting table a broken client bundle entry can fail plugin registration outright. Hygiene: `node --check lib/client.js` (respecting the package module type) plus a bundle load smoke test in CI **before** tagging.
3. **How users actually receive the update (no host-side update endpoint).** The chip is advisory only — it must not imply it downloaded or installed anything. Delivery goes through the existing install track (registry reinstall / plugin manager / profile `pnpm update`), then plane-specific activation (`references/migration-hygiene.md` §3): the client half `lib/client.js` takes effect on a **browser hard refresh**; the host half `lib/index.js` needs a **dsh restart**. Two card-level facts the update-chip copy should respect: **DSH-0.1.7-A2-04** — client bundles are cached at host boot, so an install-tree client edit may need a host restart before the served combo reflects it (Web pages reconnect after a server restart) — and **DSH-0.1.5-A1-20** — an in-place upgrade can serve a combo missing newly added bundle modules; a host restart self-heals. Recommended copy: *"v0.2.11 available — update the package via your install channel, restart dsh, hard-refresh this page."*
4. **Channel hygiene around the release.** Registry mirrors lag fresh publications (**R-08**, `references/rollup-0.1.2.md`: E404/ETARGET windows; install from the official registry), so never announce assuming instant global availability; keep prereleases off the `latest` dist-tag (R-06 dist-tag rule) so `latest`-following installs never pick one up; and the same tag-cache TTL that caused Follow-up B also delays the update *offer* by up to ~5 minutes — acceptable in that direction only because §3's rule makes staleness late-but-never-wrong.

## Residual risk / notes

- **Pre-existing**: not collected — the brief is read-only; no builds, tests, or scripts were run.
- The retire-on-empty `records` subscription is a real bug beyond naming (dock label falls back to `occurrence.label` after an early retire, and uploads can lose their record); fix it independently, but keep naming on the snapshot either way.
- The stable-tag regex ignores prereleases; if the plugin ever ships prereleases, the chip should keep tracking the stable `latest` line only.
- Cross-source name collisions (other plugins' attachment labels) are avoided by taking all occurrence labels in the composer namespace, not just `SOURCE`'s.

## run-stats

- toolcalls total: 25 (9 run_code wrapper executions containing 16 nested tool calls: 10 read/glob/grep, 3 write, 2 edit, 1 send_message) — see `tool-transcript.txt`
- token usage: n/a (not visible in this session)
- completion time: 2026-10-21T06:50:44.630Z (UTC)
