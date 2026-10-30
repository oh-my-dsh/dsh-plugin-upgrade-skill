# S10 · Paste Renaming & Version-Chip Follow-Ups — Analysis Report

Plugin: `@org/dsh-attach-input` (lib-only, no build step). Two post-v0.2.10 follow-ups.
Mode: read-only inspection/diagnosis (plugin-upgrade Mode A). No fixture files were modified.

---

## 1. Renaming design (Follow-up A)

### Exact naming scheme

- Pasted **images** → stem `paste_image`, pasted **non-images** → stem `paste_file`.
- The extension is appended per item 2.
- Numbering: the first instance has **no suffix** (`paste_image.png`); the second and later
  get an `(N)` suffix starting at 2: `paste_image(2).png`, `paste_image(3).png`, … and
  `paste_file.pdf`, `paste_file(2).pdf`, …. `(1)` is never written.

### How the number is chosen

For each pasted item, build candidate names `paste_<stem>(N).<ext>` for N = 1, 2, 3, … and
take the first candidate whose **full filename** is not already taken; N = 1 renders with no
suffix. The taken-set is recomputed after each item in a batch so multiple pasted files in one
paste get consecutive numbers (the collision domain is *across the whole composer*, not
within a single selection batch).

### Where the rename must be applied — and which paths stay untouched

The rename must be applied **only at the paste acquisition point** (the clipboard/paste
handler), *not* in the shared `add()`. Paste, drag-and-drop, and the file/folder picker all
funnel into `add()`, so a rename inside `add()` would also rewrite drop/picker files.
Correct scoping: the paste handler stamps a paste-source flag (or pre-computes the unified
name) on its items, and `add()` renames only items marked paste-sourced.

- **Renamed:** clipboard/paste items only.
- **Untouched (keep real names):** the drag-and-drop path and the file/folder-picker path —
  their `item.path` / real `file.name` flows through `add()` verbatim.

### Authoritative "names already taken" source

The authoritative source is the **composer input's live state** — `input.state.getSnapshot()`
and its `occurrences` (what is actually attached right now) — **not** the plugin's own
module-level `records` Map.

Why a plugin-side records cache alone is the wrong source: the `records` Map is a render
cache whose subscription calls `records.delete(ref)` whenever a snapshot *momentarily* shows
no occurrence for that ref (the `alive || inflight` guard). A transient/empty snapshot — or
the window between `insertReference` returning and state settling — retires the entry even
though the attachment is still present. A counter keyed off that lossy cache would under-count
the names actually taken and let a later paste reuse `paste_image(2).png` that is already
attached, producing a real collision the cache can no longer see. The composer's
`occurrences` is the system of record; the counter must derive the taken-set from it and
treat `records` as cosmetic only.

---

## 2. Extension rule + chip vs upload path (guidance)

### Extension rule (original name vs MIME fallback)

- **Primary:** derive the extension from the pasted file's **MIME type** (`file.type`) via a
  small MIME→extension map (`image/png`→`.png`, `image/jpeg`→`.jpg`,
  `application/pdf`→`.pdf`, `image/gif`→`.gif`, `image/webp`→`.webp`, …).
- **Fallback:** only when MIME is empty or unmapped, use the extension of the original
  clipboard name (`image.png`→`.png`).

Rationale: the clipboard hands every pasted file the same generic name (`image.png`), but
the MIME reflects the actual bytes — this prevents a JPEG screenshot from being mislabeled
`.png`.

### Dock chip vs uploaded path

Both must display the **same unified renamed name**:

- the **dock chip** (`record?.label`) renders `paste_image(2).png`;
- the **upload body** (`item.path`) carries that same `paste_image(2).png`.

Neither should leak the raw clipboard name `image.png`. The paste handler rewrites
`item.path`/`label` (or a shared `displayName`/`uploadName` field) for paste-sourced
items only; the real name is dropped on that path and preserved on drop/picker.

---

## 3. Follow-up B — root cause and display rule

### Root cause: two defects that compound

1. **A stale cached remote was trusted as ground truth.** `latestFromTags()` reads the GitHub
   tags API, which returned a CDN-cached page (`x-cache: HIT`, `age: 178`,
   `cache-control: private, max-age=60, s-maxage=300`). That cached page predated both the
   v0.2.10 and v0.2.11 pushes, so its newest stable tag was `v0.2.9`. Minutes after the push
   the chip still saw that stale list (the CDN may keep serving it up to ~5 min,
   `s-maxage=300`).
2. **The chip displayed the fetched value instead of the running value.** The guard
   `if (semverCmp(tag, PLUGIN_VERSION) <= 0) renderCurrentChip(tag)` prints the *fetched*
   tag in the green "already the latest version" chip. With fetched `v0.2.9` ≤ running
   `v0.2.10`, it printed "already the latest version **v0.2.9**" — an OLDER tag than what the
   user is actually running — because the remote's stale answer was rendered verbatim as the
   "current" version.

### Display rule the chip should follow

Compare two values:

- **a** = latest **remote** stable tag (fetched, advisory only);
- **b** = the **locally-known running version** (`PLUGIN_VERSION`, ground truth for "what I have").

- If `a > b` → show "update available → v{a}" (the fetched value is shown, **only here**, as
  the upgrade target).
- If `a ≤ b` → show "already the latest version **v{b}**" — display the **running** version,
  never the fetched tag.

For the bug: fetched `v0.2.9`, running `v0.2.10` → "already the latest version v0.2.10",
which is truthful (the user is at least as new as the remote knows; the remote just hasn't
seen v0.2.11 yet). The remote value may only claim "there is something newer"; when it
doesn't, the running version is the authoritative current version. An empty/failed fetch keeps
the existing offline branch.

---

## 4. Regression tests that would have caught both

**Follow-up A (renaming / conflict source / scoping):**

1. Two *separate* paste events of two PNG clipboard files both named `image.png` →
   `paste_image.png` then `paste_image(2).png` (proves cross-batch numbering, which the
   in-batch `validateItems` duplicate check never exercised).
2. Paste a non-image clipboard file (e.g. a PDF) → `paste_file.pdf`.
3. MIME fallback: clipboard file named `image.png` with `file.type === 'image/jpeg'` →
   `paste_image.jpg` (extension from MIME, not the lying name).
4. Drag-and-drop a `real-screenshot.png` → stays `real-screenshot.png`; same for the
   picker (no rename on those paths).
5. One paste batch of several items → consecutive, collision-free numbers.
6. **Authoritative-source test:** with `paste_image.png` already present in the composer
   `occurrences` but its `records` entry artificially retired (simulating the momentary
   empty-snapshot race), a new paste must still yield `paste_image(2).png` — proving the
   counter reads the composer state, not the `records` cache.

**Follow-up B (version chip), with the captured stale response mocked:**

1. Fetched latest `v0.2.9`, running `v0.2.10` → chip shows "already the latest version
   v0.2.10" (the exact reported regression; must NOT show v0.2.9).
2. Fetched `v0.2.11`, running `v0.2.10` → "update available v0.2.11".
3. Fetched == running → shows the running version.
4. Fetch fails / empty list → offline chip, never "latest v{stale}".
5. Prerelease tags (`v0.2.11-rc.1`) filtered out by the `^v\d+\.\d+\.\d+$` regex.

---

## 5. Lib-only release hygiene this touches

1. **Hand-inlined version constants.** `PLUGIN_VERSION` is hand-inlined in `lib/client.js`
   and must be manually kept in sync with `package.json` at every release. Hygiene: a single
   source of truth — stamp/generate the constant from `package.json` at release time, or add
   a `prepublishOnly`/CI parity assertion that fails the release when the inlined string ≠
   `package.json` version.
2. **Bundle syntax check.** A lib-only bundle with no build step is never parsed/transpiled at
   release, so a syntax error can ship to users. Hygiene: run a syntax check on the shipped
   bundle in CI before publish (`node --check lib/client.js`, or import/parse it) — the floor
   that a build step would otherwise provide.
3. **How users actually receive the update (no host-side update endpoint).** There is no push;
   the version chip is informational only and cannot install. Users receive the new version by
   **re-installing/upgrading the package through the package manager against the npm registry**
   (`npm/pnpm update @org/dsh-attach-input` or the DSH Plugin Manager update flow) — not via
   any host auto-update. Two delivery wrinkles to document in release notes:
   - the served client bundle is cached at host boot, so after the package is upgraded in the
     install tree a **host restart** is required before a page refresh serves the new
     `lib/client.js` (DSH-0.1.7-A2-04: client bundles cached at host boot);
   - the npm package publication lags the GitHub tag (DSH-0.1.6-A2-04: pinned upgrades hit an
     E404 window for minutes-to-hours), and this chip reads GitHub tags — the same
     announce-before-installable gap that also fed Follow-up B. Release order: publish to npm
     (or poll until it resolves) *before* announcing, and have the chip point at the registry
     re-install; verify the served bundle bytes after restart, not just that the page responds.

---

## Notes on scope / method

- Fixture directory left unchanged (read-only).
- Reference cards cited by key point + ID only; no full card text reproduced.
- No migrations or installs executed (read-only inspection).
