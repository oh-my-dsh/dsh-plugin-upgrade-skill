# S19 · Diagnosis Report — the Phantom Update, the Stale Host Half, and the Corrupted Payload

Task: read-only diagnosis of the 2026-09-05 release session of the client plugin
`@dsh-external/dsh-file-trace` (v0.3.7 markdown fix, v0.3.8 SVG render preview).
Evidence: `/app/fixture/` (untouched). No migrations or installations were executed.

---

## 1. Phantom self-update root cause — the stale build-time version constant

**Why the released v0.3.7 announces an update to itself.**
The shipped `lib/client.js` self-update check compares a baked-in constant against the
newest mirror tag:

```js
export const PLUGIN_VERSION = "0.3.6";   // lib/client-bundle-excerpt.js, verbatim
function newerTag(latestTag) {
  return latestTag !== undefined && compareSemver(latestTag, PLUGIN_VERSION) > 0 ? latestTag : undefined;
}
```

`PLUGIN_VERSION` is **inlined by the bundler (tsdown) from `package.json` at build time**
— it is not read dynamically at runtime. The release log shows the operation order mistake:

| Time | Step | Consequence |
|---|---|---|
| 16:22 | `pnpm run build` — client bundle emitted | bundle inlines the **then-current** `0.3.6` |
| 16:23 | bump `package.json` 0.3.6 → 0.3.7 | too late; the artifact is already frozen |
| 16:24 | commit (includes the already-built `lib/client.js`) + tag `v0.3.7` | the tag ships a bundle that believes it is 0.3.6 |
| 16:25 | pushed `main` + tag to origin / public / omdsh; `git ls-remote` verified tag SHA on all three | the stale constant is distributed intact |

The browser then loads the "v0.3.7" bundle whose internal constant still reads `0.3.6`,
fetches `git ls-remote --tags` (no auth), picks the highest tag `v0.3.7`, and
`compareSemver("v0.3.7", "0.3.6") > 0` → `newerTag` returns `v0.3.7` → badge
「新版本 v0.3.7 可用」 on the just-released v0.3.7 itself. The plugin announces an update
to itself because the **compared version constant is a build-time snapshot, and the bump
happened after the build**.

**Why mirror/tag integrity is irrelevant here.** `git-tags.txt` shows all three mirrors
serve identical SHAs for both tags (`748b5e5…` / `d887deb…`); the self-update check
resolves exactly those tags. Distribution was perfect — the defect is **inside the
artifact** (a stale constant baked before the bump), so no amount of mirror re-sync, tag
re-verification, or integrity checking can detect or fix it. That is why the fix was a
re-release (amend + rebuild + force-move the tag on all mirrors), not a mirror repair.

**Corrected release order (the one used for v0.3.8):**

1. bump `package.json` version **first**;
2. run a clean build (`pnpm run clean && pnpm run build`) so the bundler inlines the new constant;
3. verify the artifact, then commit + tag + push mirrors.

**The check that would have caught it before pushing.** A pre-tag gate on the *built
artifact*, not on `package.json`:

```sh
# the version the bundle will actually advertise must equal the tag being cut:
grep -o 'PLUGIN_VERSION = "[^"]*"' lib/client.js        # → "0.3.7", not "0.3.6"
# or run the shipped comparison itself — must print nothing (no self-update):
node -e '… newerTag("v" + require("./package.json").version) …'   # newerTag("v0.3.7") === undefined
```

Had this gate run at 16:24, it would have failed ("bundle says 0.3.6, tag says v0.3.7")
and blocked the phantom release.

---

## 2. Client vs host plane update asymmetry — why the toggle arrived but the route 404s

**Where each half's code is loaded and when.**

- **Client half (`lib/client.js`)** is not executed by a long-lived process; the browser
  **re-fetches it on every reload/hard refresh (no-cache)** and re-registers it through
  `window.__ModuleLoader__.load(...)`. Push a new client bundle + hard refresh → the new
  UI is live. That is why the v0.3.8 SVG render toggle **does** appear in the browser.
- **Host half (`lib/index.js`)** runs inside the dsh host process. Its asset route is
  **registered once at apply/boot time**; the handler closes over the `CONTENT_TYPES`
  whitelist object created at registration. Files changed on disk do not re-enter a
  running process — a **host restart** is what makes a host-plane change effective.

**How the probes pin the staleness to the RUNNING host process, not the release.**
`asset-route-probe.txt` (taken after the browser was confirmed refreshed, host NOT
restarted):

1. `GET …/asset?path=…daigo-final.png` → **200 `image/png`** — the route exists and the
   handler is alive; this is not a missing/disabled route;
2. `GET …/asset?path=…daigo-bicycle.svg` → **404 "unsupported image type"** — the
   extension whitelist rejected `svg`;
3. the link-installed repo's shipped `lib/index.js` **on disk contains
   `svg: 'image/svg+xml'`** (`lib-index-excerpt.js`).

Only one state explains all three at once: **the running process predates the whitelist
change**. The disk (release) is correct; the process is a "ghost" executing the previous
generation's code. This is exactly the skill's rule — *ask the process, not the disk*
(pre-flight step 1.5 / ghost-host check): a behavioral probe whose answer differs between
generations classifies the running process, because `package.json`, the directory, and
`git` all report the new version while memory still runs the old one. (A stale-process
diagnosis also matches the restart-only edge and the A1-20-style "in-place upgrade serves
old roster" precedents.)

**Why this is the one case where "plugins hot-update" does not hold.** The usual rule —
push new code and refresh — is true **only for the client plane**: client bundles are
re-pulled on each refresh. A change landing in the host half (`lib/index.js`) is
boot-time-registered state (routes, services, whitelists in closures) and needs a full
host stop + restart; a browser refresh is not a host stop. Migration-hygiene item 3
states it directly: client-half change → hard refresh; host-half change → restart dsh.

---

## 3. Broken-image attribution — the corruption is upstream, in the session-log result text

**The three facts:**

1. source file on disk, lines 232–247: **well-formed XML** (`System.Xml XmlDocument`
   loads without error);
2. the read-result text persisted in the session log is **NOT well-formed** — line 232 is
   spliced: source-232 up to `…stroke="#dde6ea" stro` + source-247's tail
   `0,1 821,730" fill="none" stroke="#ffffff" …`, so lines 233–247 are missing and the
   parser fails at `Specification mandates value for attribute stro0…`;
3. a **re-read of the same region comes back clean** (non-deterministic).

**Where the corruption happened.** The corrupted bytes exist only in the *model-visible
result block* stored into the session log; the read tool's TYPE result delivered to the
caller was clean, and the disk file was never wrong. So the corruption was produced in
**the result-text assembly layer that builds and persists the tool-result text into the
session log — upstream of the plugin and of the renderer** (a mid-file splice at a shared
prefix, consistent with a buffer/chunk-boundary stitching bug, not with anything an SVG
renderer or the plugin could do). Non-reproducibility (clean re-read) rules out any
deterministic defect in the file, in the plugin, or in the render path.

**Why the plugin must treat the session payload as untrusted rendering input.** The
payload the plugin receives has already passed through session-log assembly — a layer
demonstrably capable of silently splicing text. Just like any external content, it must
be validated (XML well-formedness) before it reaches a renderer; garbage in must produce
an explicit error, not a broken `<img>` and a wild goose chase.

**Why editing or "repairing" the traced file would have been the wrong move.** The file
on disk was well-formed the whole time — there was nothing to repair. Hand-patching it
would (a) corrupt a correct artifact, (b) paper over an upstream bug that will hit every
other session, and (c) be unfalsifiable, since the corruption is non-deterministic and
cannot be reproduced from the file. The correct disposition: keep the file untouched,
record both observations (per the skill's rule: when local observation conflicts with a
primary source, record both, reproduce, report), and file the upstream bug with the
decoded log frame as evidence.

---

## 4. Defensive render chain for the SVG preview

Design: four levels, tried in order; each level is cheap and only the last two ever
touch session-derived text.

| # | Source | Check | Justification |
|---|---|---|---|
| 1 | **Disk-bytes asset route** (`GET /dsh-file-trace/asset?path=…`) | HTTP 200 + `content-type: image/svg+xml` | Authoritative bytes read straight from disk by the host — the session/LLM text-assembly layer is not in the path at all, so the splice class of corruption cannot occur. Requires the running host to actually have the `svg` whitelist (see §2: restart first, then probe). This is why the v0.3.8 feature is correct once the host restarts. |
| 2 | **Session payload** (only if the asset route is unavailable, e.g. file outside the authorized scope) | XML well-formedness **before** render: `new DOMParser().parseFromString(text, 'image/svg+xml')` then look for a `parsererror` element (and `documentElement` sanity) | The session log's result text is demonstrably a lossy, non-deterministic channel (§3); validation converts a silent broken image into a detected, reportable fault. `parsererror` is the standard failure signal for the XML parse mode. |
| 3 | **Sandboxed iframe render** | `<iframe sandbox>` **without** `allow-scripts` (no `allow-same-origin` + `allow-scripts` combination), fed the validated bytes as a blob/srcdoc | Even well-formed SVG can carry `<script>` or event handlers; the sandbox blocks script execution while **SMIL animations (`<animate>`, `<animateTransform>`) still run**, preserving the preview's purpose (these are declarative, not script). This is the last render fallback, not the primary path. |
| 4 | **Explicit error state** | typed message, e.g. 「预览不可用：会话 payload 未通过 XML 校验（上游疑似文本损坏），源文件未改动」 | A silent broken `<img>` is indistinguishable from a plugin bug and invites "repairing" the wrong artifact (§3). The error state names the failing level, keeps the disk file untouched, and produces the evidence needed for the upstream bug report. |

Ordering rationale: trust decreases from raw disk bytes → validated session text →
sandboxed execution of validated text; the levels are fail-visible, never fail-silent.

---

## 5. Forensics method + prevention checklist

**Decoding the session log frame-by-frame.** The generation file on disk is a
**concatenated-Zstandard stream**: the appender compresses each flushed generation/append
chunk as its own independent zstd frame and concatenates them. Frames are
self-delimiting (each begins with the magic `28 B5 2F FD`), so the exact stored text is
recoverable without touching the live session:

1. copy the log aside (read-only discipline); enumerate frame boundaries by scanning for
   the magic (or use the streaming API's frame-header function to walk frames);
2. decompress frame-by-frame (`zstd -dc` decodes concatenated frames in order; a
   streaming decompressor gives per-frame boundaries and offsets) → the append-only
   entry stream in original write order;
3. locate the read-result event for the SVG (the excerpt cites payload line ~232),
   extract the **exact stored text**, and diff it against the disk file — this is what
   turns the anecdote into evidence: the log itself stores the spliced text
   (`stro0,1 821,730" …`), proving corruption happened at write/assembly time in the
   upstream layer, not in the browser or the plugin; per-frame offsets also tell you
   *which* appended generation carried it;
4. attach the decoded frame (redacted) to the upstream bug report.

**Release-checklist items this incident adds:**

- **Version-bump-before-build.** Bump `package.json` → clean build → only then
  commit/tag/push (the v0.3.7 order built first and bumped after, baking the old
  constant).
- **Grep the shipped bundle for the baked constant before pushing** — the gate runs on
  the artifact, not the manifest: `grep -o 'PLUGIN_VERSION = "[^"]*"' lib/client.js`
  must equal the tag being cut; ideally also assert `newerTag("v<version>")` is
  `undefined` (no self-update). Add: a host-half artifact gate in the same breath —
  e.g. confirm the new whitelist/behavior string is in `lib/index.js`.
- **Per-mirror tag SHA verification** — `git ls-remote --tags` on origin / public /
  omdsh, SHAs identical across mirrors (this release already did it; keep it, but note
  it alone cannot catch the phantom update — it verifies distribution, not content).
- **Report the upstream text-corruption bug instead of papering over it in the plugin**
  — file it with the decoded log frame; in the plugin, add the §4 validation (untrusted
  input, explicit error state) as defense, never "repair" the source file, and never
  edit a well-formed artifact to silence a symptom.
- (Bonus, from §2) **Plane-aware release validation**: after any host-half change, fully
  stop + restart the host and re-probe behaviorally (PNG 200 / SVG 200 after restart) —
  "client refreshed" is not "host updated".

---

### Skill anchors used

- `references/troubleshooting.md` — the three matching symptom rows (self-update badge ← build-time constant + bump-after-build; client-visible/host-404 asymmetry ← apply-time route registration, restart required; session-payload corruption ← untrusted rendering input, asset route preferred, report upstream).
- `references/migration-hygiene.md` item 3 — client half → hard refresh; host half → restart dsh.
- `references/pre-flight.md` §1.5 — ghost host: ask the process, not the disk; probe, don't read version numbers.
- `references/precision-checklist.md` — read-only scan discipline (report is the deliverable) and pre-publish checklist shape.
