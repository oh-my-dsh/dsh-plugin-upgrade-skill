# S19 — The Phantom Update, the Stale Host Half, and the Corrupted Payload

Diagnosis of the 2026-09-05 release session of `@dsh-external/dsh-file-trace` (v0.3.7 / v0.3.8),
based exclusively on the read-only evidence pack in `/app/fixture/`.

---

## 1. Phantom self-update: root cause of "新版本 v0.3.7 可用" on v0.3.7 itself

### What the shipped bundle actually contains

`client-bundle-excerpt.js` (the verbatim `lib/client.js` served to the browser for the
v0.3.7 tag) contains:

```js
/** The running plugin version (from package.json at build time). */
export const PLUGIN_VERSION = "0.3.6";
```

The comment in the bundle is explicit: tsdown **inlined this constant from package.json
when the bundle was built** — it is not read dynamically at runtime. The self-update
check compares this baked constant against the newest mirror tag:

```js
return latestTag !== undefined && compareSemver(latestTag, PLUGIN_VERSION) > 0
  ? latestTag : undefined;
```

With `PLUGIN_VERSION = "0.3.6"` baked in and the mirror now listing `v0.3.7`,
`compareSemver("v0.3.7", "0.3.6") > 0` is true, so `newerTag` returns `"v0.3.7"` and the
drawer renders "新版本 v0.3.7 可用" — the plugin announcing an update to itself.

### Where the compared version comes from: build time, not runtime

`PLUGIN_VERSION` is a **build-time snapshot of `package.json`**, frozen into
`lib/client.js` by the bundler. Whatever `package.json` says at *runtime* (or at *tag
time*) is irrelevant to the running client; only what it said at the moment
`pnpm run build` ran matters.

### The actual operation-order mistake

`release-log.md` for v0.3.7:

1. 16:22 `pnpm run build` — client bundle emitted **← build ran here**
2. 16:23 bump `package.json` 0.3.6 → 0.3.7 **← version bumped AFTER the build**

The bundle was built while the manifest still said `0.3.6`, so the shipped
`lib/client.js` carries `PLUGIN_VERSION = "0.3.6"`. The subsequent commit, tag `v0.3.7`,
and the three mirror pushes then published a bundle whose self-identifier is one version
behind its own tag. The release log confirms the fix that was needed: an amend + rebuild
+ force-move of the tag on all mirrors, and for v0.3.8 the order was corrected
(**bump FIRST, then build** — and indeed `package.json` in the pack reads `0.3.8`).

Corrected release order:

```
bump package.json  →  build  →  verify baked constant  →  commit (incl. lib/)  →  tag  →  push mirrors
```

### Why mirror/tag integrity is irrelevant

`git-tags.txt` shows the identical tag SHA `748b5e5…` for v0.3.7 on all three mirrors
(origin / public / omdsh), and v0.3.8 (`d887deb…`) likewise identical everywhere. The
update check "fetches exactly these tags … and picks the highest vX.Y.Z" — so the
`latest` side of the comparison is provably correct and consistent. The defect is entirely
on the other operand: the client's own baked constant is stale. No amount of mirror
verification, tag re-signing, or re-push would change what the browser compares — the
evidence pinpoints a build-operand bug, not a distribution-integrity bug.

### The check that would have caught it before pushing

A post-build, pre-push assertion that the **shipped bundle's baked constant equals the
manifest version**, e.g.:

```sh
VERSION=$(node -p "require('./package.json').version")
grep -F "PLUGIN_VERSION = \"$VERSION\"" lib/client.js   # must match
# or, bundler-agnostic:
grep -E "0\.3\.6" lib/client.js && echo "STALE VERSION CONSTANT" && exit 1
```

As a CI/release-script gate (fail the release if the grep misses or a stale constant is
found), this converts "the badge told us" into a blocked push. The instruction's
checklist phrasing is: **version-bump-before-build + grep the shipped bundle for the
baked constant**.

---

## 2. Client vs host plane update asymmetry: UI refreshed, route still 404

### Where each half's code is loaded, and when

| Half | Code | Loaded by | When a change takes effect |
|---|---|---|---|
| Client | `lib/client.js` (static bundle) | the **browser**, via HTTP fetch of the asset | on browser re-fetch / page reload (cache-busted by version) |
| Host | `lib/index.js` (Node process) | the **host process**, at boot | only on host **restart** — routes/whitelists are registered at module-load time |

The client half is stateless and re-read from disk on every page load, so after the
v0.3.8 push a browser refresh was enough for the new SVG render toggle to appear —
`asset-route-probe.txt` records that the toggle "was visible and clickable". That proves
only the **client plane** was refreshed.

The host half is different: the asset route and its `CONTENT_TYPES` whitelist are
**captured when the host process boots and registers its routes**. A running Node process
never re-reads its own JS; the old whitelist (no `svg` entry) stays in memory regardless
of what the disk now says.

### How the probes pin the staleness to the RUNNING host process

Three facts triangulate it:

1. **PNG probe → 200 `image/png`**: the route handler itself is alive and serving from
   the *running* process — the 404 is not a missing/broken route.
2. **SVG probe → 404 "unsupported image type"**: that message is the whitelist-rejection
   branch, i.e. the in-memory whitelist of the running process does not contain `svg`.
3. **Disk `lib/index.js` at the same moment DOES contain `svg: 'image/svg+xml'`**
   (`lib-index-excerpt.js`), and the probes were taken with "host NOT restarted since
   before the SVG whitelist change".

Running process says "svg unsupported" + disk says "svg whitelisted" ⇒ the stale artifact
is the **running host process**, not the release. The release content is correct; it just
has never been loaded.

### What makes a host-plane change effective — and why hot-update does not apply

**Restart the host process.** Only a restart re-executes `lib/index.js`, re-registers the
asset route, and picks up the new whitelist.

This is precisely the one case where the usual "plugins hot-update" rule does not hold.
That rule is true of the *client plane* because the browser re-fetches static assets
every load. It is false for the *host plane* because host code is not re-fetched by
anyone — it was already imported into the process's module table at boot, and route
registration is a boot-time side effect. A file replaced on disk under a running process
changes nothing about that process's behavior. Client changes propagate by re-fetch;
host changes require a re-boot.

---

## 3. Broken-image attribution: the traced file is innocent

### The three observations

- **Source file on disk**: well-formed. `System.Xml XmlDocument load: no error`; line 232
  reads `<circle r="98" fill="none" stroke="#dde6ea" stroke-width="6.5"/>`, with lines
  233–247 intact.
- **Session-log payload** (the read-result text persisted around line 232 of the log):
  **NOT well-formed** — `error on line 233 at column 54: Specification mandates value for
  attribute stro0`. Line 232 of the payload is a splice: source line 232 truncated at the
  shared prefix `"stro"` + the tail of source line 247 (`0 0,1 821,730" fill="none" …`),
  with source lines 233–247 missing entirely. That yields the malformed attribute `stro0`.
- **Re-read afterwards**: clean (non-deterministic corruption).

### Which layer produced the corrupted text

The read tool's TYPE result **delivered to the caller was clean**; only the result block
**persisted into the session log** — the model-visible text — is spliced. Therefore the
corruption happened in the **result-text assembly of the upstream tool/session pipeline**
(the layer that serializes read results into the session log), *upstream of the plugin*.
The plugin merely rendered the text it was handed; it never touched the file. The splice
pattern (a mid-file line cut at a shared prefix and continued with another line's tail,
a whole run of intermediate lines dropped, and a clean re-read afterwards) is consistent
with a non-deterministic buffer/offset or delta-assembly bug in that layer — not with
anything the plugin or the traced file could cause.

### Why the plugin must treat the session payload as untrusted rendering input

The session payload is **second-hand text relayed through an upstream pipeline**, not a
view of the disk. As this incident shows, it can differ from the file it claims to
represent, and it can even be non-XML while the file is valid. Any renderer that consumes
it must validate it before use (see §4), exactly as it would treat user-supplied or
network-supplied markup. "It came from my own read tool" is not a trust anchor.

### Why editing/"repairing" the traced file would have been the wrong move

- The file on disk is **well-formed** — there is nothing to repair; any edit would
  *introduce* corruption into a good artifact.
- The defect lives in the session log, so editing the file cannot fix the symptom the
  next read would still risk reproducing; it papers over the real bug.
- It destroys the forensic evidence (the well-formed on-disk file is the control that
  proves the log is the corrupted side) and hides an **upstream bug that will corrupt
  other sessions' payloads**. The correct disposition is: attribute, then **report the
  upstream text-corruption bug** (§5), and make the plugin defensive instead of editing
  the asset.

---

## 4. Defensive render chain for the SVG preview

Design: a validated, multi-source render pipeline with an explicit failure state.
Order and justification of each level:

**Level 1 — Disk-bytes asset route (primary).**
`GET /dsh-file-trace/asset?path=…` after the host restart, and render the returned bytes
as `image/svg+xml`. Justification: disk bytes are the source of truth and bypass the
text pipeline entirely — they never pass through result-text assembly, so they are
immune to the §3 splice class. The route also enforces the content-type whitelist
(`image/svg+xml` present in the shipped `lib/index.js`), and bytes require no parsing on
the client side. This is why fixing the host restart (§2) is a prerequisite for this
level.

**Level 2 — Session payload only after XML well-formedness validation (fallback).**
If the asset route is unavailable, use the session payload's text, but only after
parsing it with `DOMParser` and rejecting on `parsererror`:

```js
const doc = new DOMParser().parseFromString(text, "image/svg+xml");
if (doc.querySelector("parsererror")) {
  // payload failed validation — do NOT render, fall through to error state
}
```

Justification: the payload is untrusted input (§3); the parsererror check is the exact
test that would have rejected this incident's payload (`"Specification mandates value
for attribute stro0"`) instead of handing a broken image to the user. Validation is
cheap, synchronous, and deterministic.

**Level 3 — Sandboxed iframe as the last render fallback.**
Render the validated SVG inside an `<iframe sandbox="allow-same-origin">` (deliberately
**without** `allow-scripts`), with the SVG served as `image/svg+xml` via `srcdoc` or a
blob URL. Justification: even a well-formed SVG can embed `<script>` or event handlers;
the sandbox without `allow-scripts` blocks script execution while leaving **SMIL
declarative animations** (`<animate>`, `<animateTransform>`, …) running, since SMIL is
not script — so traced animations still preview faithfully in isolation, without the
markup reaching the plugin's own origin/DOM.

**Level 4 — Explicit error state, never a silent broken image.**
If every source fails validation, render a visible, specific placeholder, e.g.
"预览不可用：SVG 内容未通过校验（会话负载损坏，文件本身正常）", plus the validation error.
Justification: a silent `<img>` broken-image icon is indistinguishable from "the feature
is broken" and sent the maintainer chasing the wrong artifact (the traced file). An
explicit error that names the rejected source (payload vs disk) converts a confusing
symptom into a diagnosable report, and matches the §3 conclusion that the failure
belongs to the pipeline, not the file.

The chain is ordered by trust: disk bytes (validated by the host whitelist) > validated
session text > sandboxed rendering, with failure surfaced explicitly at each step.

---

## 5. Forensics method + prevention

### Decoding the concatenated-Zstandard session log frame-by-frame

The session's generation file is **concatenated Zstandard frames** (each frame carries
the zstd magic number `0x28 B5 2F FD`), not one continuous stream. To recover the exact
stored text for the disputed region:

1. **Do not rely on a re-read or on the live session** — the artifact under investigation
   is the persisted bytes; decode them directly.
2. **Split/decode frame-by-frame**: each frame is independently compressed, so walk the
   file by magic number and decompress each frame in isolation:
   - CLI: `zstd -dc --decompress-stream-from-stdin` style streaming decode, or split on
     the magic bytes first; plain `zstd -d` also decodes concatenated frames in order.
   - Python: `zstandard.ZstdDecompressor()` in a loop (or `stream_reader` with
     `read_across_frames=True`), emitting one decoded chunk per frame with its file
     offset.
3. **Record frame index + offset → decoded text**, then locate the read-result block
   (here: around payload line 232) and extract the verbatim stored string.
4. This yields the exact text the model was shown at the time, proving (a) the stored
   payload is already spliced — i.e. the corruption existed at persistence time, not as
   a decoding artifact — and (b) the on-disk file, decoded independently, is clean.
   That turns "rendering was broken once" from an anecdote into reproducible evidence
   with byte offsets, and is what localizes the fault to the result-text assembly layer
   (§3).

### Release-checklist items this incident adds

1. **Version-bump-before-build.** Bump `package.json` *before* running the bundler so
   the baked `PLUGIN_VERSION` matches the release tag (the v0.3.7 phantom badge was
   caused solely by build-before-bump; v0.3.8 already used the corrected order).
2. **Grep the shipped bundle for the baked constant.** Post-build gate:
   `grep -F "PLUGIN_VERSION = \"$VERSION\"" lib/client.js` must match (and no earlier
   version string may remain) — fail the release otherwise. This would have caught the
   stale `0.3.6` in the v0.3.7 bundle before any push.
3. **Per-mirror tag SHA verification.** `git ls-remote --tags` on every mirror
   (origin / public / omdsh) must list identical SHAs for the release tag, as in
   `git-tags.txt` — this validates distribution integrity (and, as this case shows, must
   not be mistaken for a fix when the defect is build-time staleness).
4. **Restart the host after any host-half change.** Route/whitelist/lib changes are
   boot-time registrations; add "restart host process and re-probe the changed route
   (PNG 200 / SVG 200 content-type `image/svg+xml`)" as an explicit release step, since
   the client-plane refresh check alone gives a false green.
5. **Report the upstream text-corruption bug instead of patching around it in the
   plugin.** File the splice-with-shared-prefix, non-deterministic, clean-on-reread
   result-assembly bug upstream with the frame-level forensic evidence; in the plugin,
   add the §4 validation chain as defense, and never "repair" the on-disk asset, which
   is well-formed and is the control evidence.

---

## Summary of attributions

| Symptom | Root cause | Correct fix |
|---|---|---|
| v0.3.7 badge "新版本 v0.3.7 可用" on itself | `PLUGIN_VERSION` inlined at build time = `0.3.6`; version bumped *after* `pnpm run build` | Bump before build; grep shipped bundle for the baked constant pre-push |
| New UI visible, but SVG asset route 404s (PNG 200, disk lib whitelists svg) | Running host process predates the whitelist change; routes register at boot | Restart the host process (host plane does not hot-update) |
| Broken image for one traced SVG | Upstream session-pipeline result-text corruption (spliced at shared prefix "stro"); file on disk well-formed; re-read clean | Validate payload (DOMParser/parsererror), sandboxed render chain, explicit error state; report upstream bug; do not edit the file |
