# S10 · Paste Renaming & Version-Chip Follow-Ups — Diagnostic & Design Report

Plugin: `@org/dsh-attach-input` v0.2.10 (community Web client plugin, lib-only bundle, no build step).
Mode: **read-only inspection/diagnosis** (plugin-upgrade skill Mode A discipline): fixture examined unchanged, no installs, no migrations, no publishes executed. Evidence: `fixture/plugin-attachment-flow.js`, `fixture/plugin-version-chip.js`, `fixture/user-threads.md`, `fixture/tags-api-response.txt`. Skill card citations are by ID + key point only.

---

## 1. Follow-up A — unified paste renaming design

### 1.1 Naming scheme (exact)

- Pasted **images** (MIME `image/*`): `paste_image.<ext>`, `paste_image(2).<ext>`, `paste_image(3).<ext>`, …
- Pasted **non-images**: `paste_file.<ext>`, `paste_file(2).<ext>`, `paste_file(3).<ext>`, …
- The first assignment carries **no suffix**; the counter suffix starts at `(2)` (chat-app convention, exactly as the user thread requests).
- Counters are **per base name** (`paste_image` and `paste_file` number independently) and per composer/session scope (the same scope the dock renders: `inputFor(sessionId)`).
- Image-vs-file classification uses the **MIME type**, not the file name (clipboard names are unreliable/absent; `file.type.startsWith('image/')` is the stable signal).

### 1.2 Where the rename is applied — and which paths must stay untouched

All three acquisition paths (paste, drag-and-drop, file/folder picker) funnel into the shared `add()` (fixture `plugin-attachment-flow.js` header comment). Therefore:

- **Apply the rename at the paste acquisition boundary only** — in the paste event handler that converts `clipboardData` items into the `items` array, *before* `add(sessionId, items)` is called. Equivalent acceptable shape: thread an explicit origin (`{ origin: 'paste' }`) into `add()` and rename in a gated first step that only the paste caller can trigger. Either way the rename is **scoped to the one acquisition path that can still tell paste from drop/picker**.
- **Must stay untouched:**
  - the **drop path** and the **file/folder picker path** — they keep calling `add()` with real names/paths verbatim (the user's explicit requirement: "those are my actual files");
  - `validateItems()` — it stays a pure validator; its in-batch duplicate-path check keeps its current semantics (renamed paste items are unique by construction, so the check never fires spuriously on pastes but still catches genuine duplicate drops);
  - the dock render fallback `record?.label ?? occurrence.label` — unchanged as *logic*, but see 1.4: the inserted reference payload must carry the assigned name as `occurrence.label` so the fallback stays correct after a record is retired;
  - the coordinate handling and `insertReference` acceptance/rollback flow inside `add()`.
- Mechanically: produce a **new item** whose `path` is the assigned name (do not mutate shared state); if the uploader also reads `File.name`, re-wrap as `new File([f], assignedName, { type: f.type })` (reference-cheap, no byte copy). Everything downstream in `add()` — `label = item.path` (line 24), the record, the upload body `files: … path: item.path` — then picks up the assigned name with **zero further changes**, which is precisely why the acquisition boundary is the right seam.

### 1.3 How the number is chosen

Linear probe against a "names already taken" set, computed **once per paste batch** and then extended in-batch:

```
taken = takenNames(sessionId)            // from the composer snapshot — see 1.4
for each pasted item (in clipboard order):
  base = isImage(item) ? 'paste_image' : 'paste_file'
  ext  = extensionOf(item)               // see item 2
  n = 1
  loop:
    candidate = n === 1 ? base+ext : base+'('+n+')'+ext
    if candidate not in taken: break
    n++
  taken.add(candidate)                   // in-batch reservation: 3 screenshots in ONE paste
  assign(candidate)                      //   -> base, (2), (3), never a collision
```

No persisted counter: probing the live taken-set self-heals when chips are removed (a freed name is reusable) and never drifts after reloads or evictions. Comparison is on the exact display name (optionally case-folded, since target filesystems are usually case-insensitive).

### 1.4 The authoritative "names already taken" source

**Authoritative source = the composer's own live state: `input.state.getSnapshot().occurrences`** (filtered to this plugin's occurrences, `o.source === SOURCE`, name read as `record?.label ?? occurrence.label` — the same expression the dock already renders), **unioned with the names assigned so far in the current batch**. This is the state the dock is drawn from and the state that decides what will actually be attached; it is ground truth by construction.

**Why the plugin-side `records` Map alone is the wrong source** (three independent reasons, the first is the fixture-proven killer):

1. **The alive-subscription retires entries on transient emptiness.** `plugin-attachment-flow.js` lines 30–38: the per-ref subscription deletes the record whenever a snapshot *momentarily* shows no occurrence for that ref (`records.delete(ref)` at line 36, annotated "fires on ANY momentary empty snapshot" — e.g. during composer state swaps/re-renders) while the attachment is still visibly attached. A rename pass that scanned only `records` would then consider `paste_image.png` free and hand the same name to the next paste → two chips with identical names and, worse, **colliding upload paths** in `files: … path: item.path`.
2. **`records` is in-memory module state.** It is lost on page reload/hot bundle swap, while composer occurrences (and the user's expectation of unique names) persist for the session; a cache that can silently empty must not be the conflict oracle.
3. **`records` lags in both directions.** Insert-not-accepted rollback (line 28) and subscription timing mean records can under- or over-report what the composer holds at the instant a paste arrives. The snapshot has no lag: it *is* the composer.

Consequence for the payload: because the snapshot is the oracle, the assigned name must be **written into the inserted reference** (`occurrence.label`) at `insertReference` time, so the oracle stays correct even when the record is retired by the line-36 bug or a reload. (Separately, the retirement bug itself deserves a fix — e.g. require the occurrence to be absent across two consecutive snapshots, or honor a real removal signal — but the rename design must **not depend** on records being correct, which is the point of choosing the snapshot.)

Scope note: "taken" covers the current composer input state for the session, not names inside already-sent messages; reusing a name after the attachment was sent is acceptable and standard.

---

## 2. Extension rule, dock chip, and upload path (guidance item)

**Extension rule (original name first, MIME fallback):**
1. If the clipboard file's original name has a usable extension (last dot segment, sanitized to `[A-Za-z0-9]`, sane length), use it: `image.png → .png`, `scan.JPG → .JPG` (or lowercased, pinned by test).
2. Else derive from MIME via a small map: `image/png→png`, `image/jpeg→jpg`, `image/gif→gif`, `image/webp→webp`, `application/pdf→pdf`, `text/plain→txt`; generic fallback: strip `x-`/`vnd.` noise from the subtype and keep alphanumerics (`application/x-foo→foo`).
3. If neither name extension nor MIME is available: ship the bare name with **no extension** (`paste_file`, `paste_file(2)`) rather than inventing `.bin` — pinned by a test either way.

**Dock chip:** displays the assigned name (`paste_image(2).png`) — it already renders `record?.label ?? occurrence.label`, and with 1.2/1.4 both sides carry the assigned name. Drop/picker chips keep showing their real names exactly as today.

**Uploaded path:** the upload body must carry **the same assigned name** in `path` (`files: record.items.map(item => ({ path: item.path, … }))`). For pastes the browser-given `image.png` is noise, not identity; unifying chip and upload path (a) makes the delivered attachment match what the user saw when approving it, (b) keeps `validateItems`' path-uniqueness check meaningful, and (c) prevents same-name collisions on the receiving side when several screenshots are pasted. For drop/picker uploads, the real path stays verbatim.

---

## 3. Follow-up B — root cause and the correct chip display rule

### 3.1 Root cause: a stale intermediary-cached tag page, rendered as ground truth

Chain of events, each step evidenced in the fixture:

1. `latestFromTags()` fetches `https://api.github.com/repos/org/dsh-attach-input/tags?per_page=10` with a plain `fetch` (no `cache: 'no-store'`, no cache-buster).
2. Minutes after `v0.2.11` was pushed, the request was answered **from an intermediary cache**: `tags-api-response.txt` shows `cache-control: private, max-age=60, s-maxage=300`, `x-cache: HIT`, `age: 178`, and a body listing only `v0.2.9, v0.2.8, v0.2.7` — the cached page **predates both the v0.2.10 and v0.2.11 pushes** (the same capture proves via `git ls-remote --tags` that v0.2.10 and v0.2.11 do exist on the remote).
3. So `latestFromTags()` correctly computed the max of what it was given: **v0.2.9**.
4. `startUpdateChip()` (line 21): `semverCmp('0.2.9', '0.2.10') <= 0` → `renderCurrentChip(tag)`.
5. `renderCurrentChip` (line 27) prints **the fetched tag**: "✓ attach-input already the latest version **v0.2.9**" — a version *older than the one the user is running*. When the cache entry expired (`s-maxage=300` window passed), a fresh response contained v0.2.11 and the chip "changed its mind" to the update state — exactly the user's report.

The two design faults:
- **Trust fault:** the plugin treated a cached remote value as ground truth next to a locally-known running version, even though the combination was *provably contradictory*: the running version 0.2.10 was itself released and tagged, so any tag list whose maximum is **below** the running version is demonstrably stale. `latest < running` is a staleness proof the code ignored (it fell into the same branch as `latest == running`).
- **Display fault:** the green "already latest" chip displayed the **fetched** tag instead of the **running** version. The only value the plugin knows with certainty is `PLUGIN_VERSION` (hand-inlined, 0.2.10); the fetched value is merely evidence about the outside world.

### 3.2 The display rule the chip should follow

**Compare exactly two values:** the fetched latest stable tag `T` (remote evidence) vs the hand-inlined running `PLUGIN_VERSION` `R` (local ground truth). **What is shown depends on the state:**

| Relation | Chip | Version string displayed |
|---|---|---|
| `T > R` | amber "update available" | **`T`** (the only state where displaying the fetched tag is meaningful) |
| `T == R` | green "already the latest" | **`R`** (= `PLUGIN_VERSION`) |
| `T < R` | **not green** — remote evidence is provably stale; neutral/offline chip: "running v`R` — update check inconclusive", optionally re-check with cache-busting | `R` at most; **never present `T` as "latest"** |
| fetch failed / timeout / no stable tags / non-ok | offline chip (existing behavior) | `R` or nothing; never a "latest" claim |

In one sentence: **the green chip's version string always comes from `PLUGIN_VERSION`, never from the response; the fetched tag is displayed only in the "update available" state; and `T < R` must be classified as stale-remote, not as "up to date".** Under this rule, even the exact captured stale response would have shown at worst "running v0.2.10, can't verify latest" — truthful — instead of "latest v0.2.9".

Supporting fetch hygiene (defense in depth, not a substitute for the rule): send `cache: 'no-store'` and/or a unique query param so intermediary `s-maxage` caches cannot serve a minutes-old page; keep the existing stable-tag regex filter and `semverCmp` max-reduction. Structural recommendation: since users install from **npm** while the chip reads **GitHub tags**, prefer the npm registry (`registry.npmjs.org/@org%2Fdsh-attach-input` → `dist-tags.latest`) as the chip's remote source, so "what the chip announces" and "what the package manager can actually install" are the same channel (the tag-vs-npm lag window is a carded pitfall: **DSH-0.1.6-A2-04** — GitHub release published while npm still 404s for minutes-to-hours).

---

## 4. Regression tests that would have caught both follow-ups before release

### 4.1 Follow-up A (rename) — unit/integration against a mocked composer input

| # | Test | Asserts |
|---|---|---|
| A1 | Paste one screenshot (`image.png`, `image/png`) | chip label and upload `path` are `paste_image.png` |
| A2 | Three sequential pastes | `paste_image.png`, `paste_image(2).png`, `paste_image(3).png` in order |
| A3 | One paste event carrying 3 images | same three names — in-batch reservation prevents self-collision |
| A4 | Mixed batch: image + PDF; then another image, another PDF | `paste_image.png` + `paste_file.pdf`; then `(2)` of each — independent per-base counters |
| A5 | Extension fallback matrix | named `.png` wins; nameless `image/png` → `.png`; `application/pdf` → `paste_file.pdf`; no name + no/unknown MIME → pinned bare-name behavior |
| A6 | **Scope guard:** drop `report final.pdf`, drop a file literally named `image.png`, pick a file and a folder | all keep their real names/paths verbatim; no `paste_` prefix ever appears on drop/picker paths |
| A7 | Cross-path collision: drag in a real `paste_image.png`, then paste a screenshot | paste skips the taken name → `paste_image(2).png` (taken-set includes non-paste occurrences) |
| A8 | **Records-eviction regression (the source-choice test):** attach `paste_image.png`; force the line-36 bug (emit a momentary empty snapshot so the subscription deletes the record, or `records.delete(ref)` directly) while the occurrence stays in the snapshot; paste again | second paste is `paste_image(2).png`, **not** `paste_image.png` — proves the oracle is the snapshot, not `records`. This test fails by construction against any records-cache-based implementation |
| A9 | Reload continuity: wipe `records` entirely (simulated page reload), occurrences still in snapshot; paste | assigned name avoids every existing chip name |
| A10 | `validateItems` semantics preserved | duplicate real paths in one drop batch still throw; multi-image paste never throws; `insertReference` rejection still rolls the record back |
| A11 | Chip/upload consistency | for every paste, dock label === basename of upload `path` === assigned name |
| A12 | Removal frees names (pin chosen semantics) | attach two pastes, remove `paste_image.png` chip (occurrence really gone), paste again → name reuse policy asserted explicitly |

### 4.2 Follow-up B (version chip) — unit tests with mocked fetch

| # | Test | Asserts |
|---|---|---|
| B1 | **Stale-capture replay:** mocked response = exactly the captured body (`v0.2.9` newest; v0.2.10/v0.2.11 absent), `PLUGIN_VERSION='0.2.10'` | chip text does **not** contain "latest version v0.2.9"; no green "already latest" chip is rendered; neutral/offline state shown. This is the literal user-report reproduction and it fails against the shipped code |
| B2 | Equal case: newest `v0.2.10` | green chip reads "already the latest version v0.2.10" **and** the displayed string is sourced from `PLUGIN_VERSION` (property-style: for any `T <= R`, the green chip never prints `T` when `T !== R`) |
| B3 | Newer case: newest `v0.2.11` | amber update chip showing v0.2.11 |
| B4 | `semverCmp` ordering | `0.2.9 < 0.2.10 < 0.2.11` — guards against lexicographic comparison (`'0.2.10' < '0.2.9'` as strings) |
| B5 | Fetch hygiene | request init carries `cache: 'no-store'` (or a cache-buster param); 8s timeout preserved |
| B6 | Degraded remote: non-ok, network error, timeout, empty list, only-prerelease tags (`v0.3.0-beta.1` filtered) | offline chip; never a green "latest" claim |
| B7 | **Version-constant sync (release gate, see 5.1):** read `PLUGIN_VERSION` from `lib/client.js` and `version` from `package.json` | equal — catches the sibling lie where a forgotten inline bump makes the chip claim a wrong *running* version |
| B8 | End-to-end release drill (integration, per skill validation layers): push a tag, watch the chip from a page running the previous version | transition green(==R) → amber(T) with no window in which the green chip names a version older than the running one |

---

## 5. Lib-only release hygiene items this touches

### 5.1 Hand-inlined version constants

`PLUGIN_VERSION = '0.2.10'` is hand-copied into `lib/client.js` because there is no build step to inject it (fixture header: "must be kept in sync with package.json at every release"). Hygiene:
- Make `package.json` the single source of truth and add a **CI/prepack guard** (test B7: a one-line `node -e` comparison) that fails the release when the inline constant drifts;
- put the constant in exactly one place (e.g. a tiny `lib/version.js` that is the only file the release step rewrites, or an `npm version` hook that patches it), and add it to the release checklist **before** publish/tag;
- version identity discipline (skill Mode C step 6): the release carries the **plugin's own** SemVer (0.2.x) in package.json, the packed artifact, and the inline constant — never a DSH host version by accident. Note the rename feature is user-visible new behavior → a **minor** bump (0.3.0) is the honest SemVer, not a patch.

### 5.2 Bundle syntax check

No build step means **no compiler ever parses the bundle before users do** — a syntax slip in `lib/client.js` ships dead. Gates before publish:
- `node --check` on every shipped `.js` file (CI + release checklist);
- a headless import/mount smoke test: boot a real DSH web profile and **prove registration/mount, not a bare HTTP 200** (skill validation layer 4);
- run the unit suites of §4 (they execute the code paths `node --check` can't);
- remember the parser-strictness pitfall (migration-hygiene §2): a passing typecheck/parse elsewhere does not excuse skipping the check on the actual shipped bytes.

### 5.3 How users actually receive the update (no host-side update endpoint)

The chip is **informational only** — this plugin exposes no host-side update endpoint (contrast the paste-input-family plugin in the v0.2.0-rc.1 field notes, which mounts its own `/v1/latest` host route), so nothing in the plugin can or may self-update; it must never attempt to run installs from client code. The real delivery chain is the user's install channel:

1. **Install/update mechanics** — via the profile's package manager track:
   - managed: the **Plugins page / `plugin_manager` tool / `dsh plugin`** install-update flow, which runs pnpm inside the profile directory and keeps the profile `package.json` + lockfile coherent (**DSH-0.1.6-A2-03**: link-installed plugins stay outside this management — such users update their link source instead); on 0.2.1-line hosts, lifecycle updates hot-apply where possible and a restart prompt is otherwise authoritative (**DSH-0.2.1-R1-01**);
   - manual: pinned `npm install @org/dsh-attach-input@0.2.11` (or pnpm) **in the profile directory, using only the package manager that owns the existing lockfile** — no npm/pnpm/bun mixing (skill Mode B step 1); a bare package name resolves the `latest` dist-tag and can silently pin the wrong line.
2. **Activation sequence** — client bundles are read and cached at host boot (**DSH-0.1.7-A2-04**): after the package update, **restart the dsh host, then hard-refresh the browser**; a refresh-only verification serves stale bytes and misleads (migration-hygiene §3: `lib/client.js` changes take effect on hard refresh, host-half changes need a restart — this plugin is client-only, but the *served copy* is the boot-cached one).
3. **Publish-channel ordering** — npm publish and the GitHub tag are separate channels with a real lag window (**DSH-0.1.6-A2-04**: E404 for minutes-to-hours after the GitHub release). Release order: bump inline constant → `node --check` + tests → **npm publish → verify `npm view @org/dsh-attach-input@<v> version` resolves → then push the tag/announce**. Since the chip reads tags while users install from npm, an announced-but-unpublished version makes the chip advertise an uninstallable update — another reason (§3.2) to source the chip from the npm registry's `dist-tags.latest`.
4. **Chip UX** — the "update available" state should carry the actionable step (the pinned install command for the user's track + "restart host, hard-refresh"), not just a number; and the release notes should state the tag-visibility/cache window so a chip that briefly can't confirm "latest" is understood, not filed as a lie.

---

## Summary of the two scored lessons

- **A:** the authoritative conflict source for paste names is the **composer's live snapshot state** (what is actually attached), not the plugin's `records` cache — which a transient-empty-snapshot subscription can silently empty (fixture line 36) — and the rename belongs **only at the paste acquisition boundary**, leaving drop/picker paths verbatim.
- **B:** the chip lied because it displayed a **cached remote tag** (stale page, newest v0.2.9) as "latest" next to a locally-known running version (0.2.10); the fix is the compare-`T`-vs-`R` / **display-`R`-in-green** rule with `T < R` classified as provably stale, plus cache-busting and npm-channel sourcing as defense in depth.
