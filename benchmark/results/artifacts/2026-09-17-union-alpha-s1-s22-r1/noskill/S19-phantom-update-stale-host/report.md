# S19 · The Phantom Update, the Stale Host Half, and the Corrupted Payload — Analysis Report

Plugin: `@dsh-external/dsh-file-trace` · v0.3.7 (markdown frontmatter fix) + v0.3.8 (SVG render preview) · incident date 2026-09-05.
All evidence quoted below comes from the read-only fixture evidence pack (release-log.md, package.json, client-bundle-excerpt.js, lib-index-excerpt.js, asset-route-probe.txt, git-tags.txt, session-log-excerpt.txt). No file inside the fixture or the benchmark repository was modified; the only write is this report.

---

## 1. Phantom self-update root cause: the badge announces v0.3.7 to v0.3.7

**Symptom.** Immediately after releasing v0.3.7, the plugin's own drawer shows the update badge "新版本 v0.3.7 可用" — the freshly released client announces an update to itself, even though every mirror serves the new bundle and the tag SHA matches on all three mirrors.

**Where the compared version constant comes from — build time, not runtime.**
The shipped `lib/client.js` contains:

```js
export const PLUGIN_VERSION = "0.3.6";
```

with the comment: "tsdown inlined this constant from package.json WHEN THE BUNDLE WAS BUILT — it is not read dynamically at runtime." The bundler copies `package.json`'s `version` into the client bundle at build time. The running browser code never consults the on-disk manifest or the tag; the only runtime input it sees is the newest mirror tag, which the self-update check obtains via `git ls-remote --tags` and feeds to `newerTag(latestTag)`:

```js
return latestTag !== undefined && compareSemver(latestTag, PLUGIN_VERSION) > 0 ? latestTag : undefined;
```

So the comparison that decides whether to show a badge is `compareSemver("v0.3.7", "0.3.6") > 0` → true → `newerTag` returns "v0.3.7" → badge. The client is correctly reporting that the newest published tag (0.3.7) is newer than the version *its own bundle claims to be* (0.3.6). Both facts are true simultaneously because the bundle and the tag describe different versions of the same release.

**The actual operation-order mistake.** From the reconstructed release log for v0.3.7:

1. 16:22 `pnpm run build` — client bundle emitted (bundler inlines version **0.3.6**, the value in package.json at that moment)
2. 16:23 bump `package.json` version 0.3.6 → 0.3.7 — **after** the build
3. 16:24 `git commit` (including the already-built `lib/client.js`) and `git tag v0.3.7`
4. 16:25 pushed `main` + tag to origin / public / omdsh; tag SHAs verified identical on all three

The version bump happened **after** the build, so the artifact that was tagged, published, and served to browsers permanently claims 0.3.6 while the release and the tag say 0.3.7. The defect is baked into the artifact, not introduced by distribution.

**Why mirror/tag integrity is irrelevant here.** `git ls-remote` confirms that all three mirrors list identical SHAs for v0.3.7 and v0.3.8. That verifies only that the *same* bytes propagate to every mirror — it is distribution-level integrity. The stale 0.3.6 constant was already inside the committed bundle before the first push; every mirror therefore serves an identical, equally stale bundle. A perfect mirror check proves nothing about whether the content of the bundle was built from a correctly bumped manifest. This incident is a content defect that exists identically at every replica, so no mirror-side verification can detect or prevent it.

**Corrected release order.** Bump first, build second, tag the built artifact:

1. `package.json` 0.3.6 → 0.3.7 (the only source of the baked constant)
2. `pnpm run build` — the emitted bundle now inlines 0.3.7
3. grep the shipped `lib/client.js` for `PLUGIN_VERSION = "0.3.7"`
4. commit the freshly built bundle, tag, push to all mirrors
5. verify with a post-deploy smoke: freshly served client shows no self-update badge

This is exactly the fix the maintainer applied for v0.3.8 ("the rebuild order was corrected for v0.3.8 (bump FIRST, then build)").

**The check that would have caught it.** After the build and before commit/tag/push, assert that the shipped bundle contains the new version string:

```bash
grep -q "PLUGIN_VERSION = \"0.3.7\"" lib/client.js || exit 1
```

as a step between build and tag (or as a release gate that fails when the baked constant equals the previous version). Any of these would have stopped the stale-bundle release: bump-before-build, the post-build grep of the bundle, or a smoke test asserting that the served client does not render its own badge.

---

## 2. Client vs host plane update asymmetry: refreshed browser, stale host

**Symptom.** After the v0.3.8 push the new SVG render toggle appears in the browser, yet clicking Render gets a 404 from the host asset route for the .svg while a PNG probe returns 200 — and the shipped `lib/index.js` on disk whitelists `svg: 'image/svg+xml'`.

**Where each half's code is loaded, and when.**

- *Client half* (`lib/client.js`): loaded by the **browser**, which fetches the bundle from the mirrors at page load (plus the plugin's own update check and hot-update path). Once the mirrors serve the new tag, the next page load / refresh re-fetches and evaluates the new client bundle — the update path delivers the new UI without touching the host process. That is why the new toggle button was confirmed rendered by the browser.
- *Host half* (`lib/index.js`): loaded by the **running host (Node) process**, which registers the plugin's asset route **once, at boot time** when it resolves and loads the plugin module and executes its registrations. An already-running host does not re-read the plugin's lib files; the in-memory route table and module graph keep serving the code that was loaded when the process started.

So the same release delivers each half by a different mechanism: the client half is refreshed by the browser re-fetching the bundle, while the host half only changes when the host process restarts (or explicitly reloads the plugin module) and re-registers routes from the new code on disk.

**How the probes pin the staleness to the running host process, not the release.** The three facts triangulate cleanly:

1. PNG probe → 200 `image/png`: the route handler is alive and is executing the current in-memory whitelist logic (not a missing/broken route).
2. SVG probe → 404 "unsupported image type": the in-memory `CONTENT_TYPES` table in the *running* process still lacks the `svg` entry, so the extension whitelist rejects .svg before any file access.
3. Shipped `lib/index.js` on disk → contains `svg: 'image/svg+xml'`: the artifact is correct.

Correct release + correct disk artifact + selective failure on exactly the newly whitelisted extension + a host that was **not restarted** since before the SVG whitelist change ⇒ the only component still running old code is the **running host process** (its in-memory copy of the route's whitelist predates the release). The release is fine; the host half just never got a chance to take effect.

**What makes a host-plane change effective.** The host must load the new `lib/index.js` — i.e. restart the host process (or explicitly reload the plugin) so boot-time route registration re-runs against the updated module and the new whitelist enters the in-memory `CONTENT_TYPES` map. Until then the old in-memory whitelist rejects SVG regardless of what the disk or the mirrors contain.

**Why this is the one case where the usual "plugins hot-update" rule does not hold.** The hot-update story covers the *client plane*: the browser re-fetches the bundle and re-renders, so client-visible changes (the toggle) appear without any host involvement. A *host-plane* change — a new/modified route and its content-type whitelist — lives in the host process's boot-time registrations. There is no mechanism in the running host that re-reads plugin lib files and re-runs route registration; therefore a host-plane change becomes effective only when the host process restarts (or the plugin is explicitly reloaded/re-mounted). This incident is precisely that exception: the usual "plugins hot-update" rule holds for the client half but not for the host half.

---

## 3. Broken-image attribution: upstream session-payload corruption, not the traced file

**Symptom.** Rendering one traced SVG through the session payload produces a broken image, while the source file on disk is well-formed XML and a re-read comes back clean.

**Where the corruption happened.** The evidence in session-log-excerpt.txt isolates it precisely:

- **Source file on disk, same region — clean.** Line 232 reads `<circle r="98" fill="none" stroke="#dde6ea" stroke-width="6.5"/>` and line 247 is a separate, intact `<path .../>`.
- **Session log's stored read-result TEXT — corrupted.** Line 232 of the payload is a splice: source line 232 up to `...stroke="#dde6ea" stro` + source line 247's tail from `0 0,1 821,730` onward. Source lines 233–247 are absent; the splice lands exactly on the shared prefix "stro" ("stroke-width…" of line 232 vs the "0 0,1" of line 247's arc flags).
- **Well-formedness verdicts.** source file: well-formed (System.Xml XmlDocument load, no error). Log payload: NOT well-formed — "error on line 233 at column 54: Specification mandates value for attribute stro0".
- **Direction of delivery.** "The read tool's TYPE result delivered to the caller was clean; the corrupted text is the model-visible result block persisted into the session log, i.e. the corruption happened in the result-text assembly, upstream of the plugin. A re-read of the same region afterwards came back clean (non-deterministic)."

So the plugin received and rendered text that was already corrupted when assembled into the model-visible result block and persisted into the session log. The plugin is purely a downstream consumer of that stored payload. The defect is in the upstream read/result-text assembly layer (a splicing bug around a shared prefix between the read window's start and the file's tail, non-deterministic — a clean re-read of the same region confirms the file itself was never bad).

**Why the plugin must treat the session payload as untrusted rendering input.** The payload is a copy of the file's text produced by an upstream layer, delivered through the session log, and can be corrupted (as here) without the file on disk changing at all. A plugin that renders whatever bytes arrive through the session payload inherits every upstream defect: a spliced line turns well-formed XML into invalid markup ("Specification mandates value for attribute stro0"), and the DOM fails, surfacing as a broken image that looks exactly like a bug in the plugin or in the traced file. Rendering input must therefore be validated at the point of rendering — never assumed correct because the file on disk is known-good. A payload can also carry attacker-controlled content in the general case, which adds a security reason on top of the correctness reason.

**Why editing or "repairing" the traced file would have been the wrong move.** The file is provably not the problem: it loads as well-formed XML, the corruption exists only in the session log's stored payload, the splice pattern (mid-file line + another line's tail at a shared prefix) is not something a human author or SVG generator would produce, and a re-read came back clean — the file is correct and stable. Repairing the file would have (a) modified a correct asset, (b) destroyed the evidence needed to attribute the bug to the upstream read/result-text assembly, and (c) papered over a real upstream bug that will keep corrupting other reads. The correct move is to attribute via forensics (Section 5) and report the upstream text-corruption bug; the plugin's job is to render defensively and show an explicit error state, not to paper over upstream corruption by mutating correct source files.

---

## 4. Defensive render chain for the SVG preview

Ordered from most to least trusted render source; each level either produces a correct render or an explicit error — never a silent broken image.

**Level 1 — disk-bytes asset route (primary).** When the session payload references a file path that is still accessible, fetch the render bytes via the host asset route: `GET /dsh-file-trace/asset?path=<file>`. *Justification:* the file on disk is the authoritative source and is provably correct in this incident (well-formed per XmlDocument). It bypasses the session-payload text assembly entirely, so the corrupted-payload class of bug cannot reach the renderer. This route requires the host plane to be current (Section 2): if the running host's whitelist still lacks `svg`, the route answers 404 "unsupported image type" — which is exactly the failure this incident saw, and the reason a host restart (not a plugin re-release) is part of the remedy.

**Level 2 — session payload only after XML well-formedness validation.** When the disk route is unavailable (404, missing file, sandbox-restricted path), fall back to the payload text carried by the session log — but only after validating it with `DOMParser` and checking for a `parsererror` element (the standard DOMParser failure signal):

```js
const doc = new DOMParser().parseFromString(payloadText, "image/svg+xml");
if (doc.getElementsByTagName("parsererror").length > 0) {
  // reject the payload; do not render it
}
```

*Justification:* the payload is untrusted rendering input (Section 3). In this incident the payload fails exactly this check ("error on line 233 at column 54: Specification mandates value for attribute stro0"), so validation converts a silent broken image into a detected, explainable failure. Validating at the point of rendering also protects against future corruption even if the upstream bug is fixed, and protects against attacker-controlled payloads.

**Level 3 — sandboxed iframe as the last render fallback.** Render the (validated) SVG inside a sandboxed iframe: `<iframe sandbox="allow-same-origin">` — i.e. without `allow-scripts`, so script execution is blocked while SMIL animation elements still run. *Justification:* SVG can carry `<script>`, event handlers (`onload` etc.), and external references. A sandboxed iframe without `allow-scripts` neutralizes script-based payloads while preserving the legitimate SVG feature set (shapes, gradients, SMIL animations), so the preview stays faithful. It is last because it is the heaviest level and is only needed when levels 1–2 cannot render inline safely.

**Level 4 — explicit error state.** If every level above fails (disk route 404, payload not well-formed, iframe refused), render an explicit error message ("source unavailable / markup invalid / host asset route unsupported — host may need a restart"), not a silently broken `<img>`. *Justification:* a broken image is indistinguishable from a plugin bug and from the upstream corruption; an explicit state tells the maintainer exactly which level failed, which is how this incident would have surfaced the 404 and the parsererror immediately instead of as a mystery broken image.

---

## 5. Forensics method + prevention

### Decoding the session log frame by frame

The session log is a **concatenated-Zstandard generation file**: a sequence of independently compressed zstd frames back to back. Decode it frame by frame to recover the exact stored text:

1. Read the generation file as bytes and scan for frame magic numbers: each zstd frame starts with magic `0xFD2FB528` (little-endian bytes `28 B5 2F FD`). Find every occurrence — each marks the start of one independently decompressible frame (one or more session events).
2. For each frame offset, feed the byte range from that magic up to the next magic into a zstd decoder. With the Node SDK this is one zstd-decompress call per frame range (or a zstd library's `decompress()` on each slice) rather than one call over the whole file — concatenation is the whole point: every frame decodes on its own, which also lets you map every recovered record to its exact byte offset in the log.
3. Each decompressed frame yields JSON session events. Locate the read-result event (fixture cites the payload around line 232 of the log excerpt) and extract the result **text** field — that is the exact string that was stored, before any later re-read overwrote the working state. Comparing that text with the file on disk yields the splice pattern (source line 232 head + line 247 tail at the shared prefix "stro") and the parsererror verdict, turning "the image is broken" into a reproducible, byte-level evidence trail.
4. A clean re-read of the same region afterwards being intact confirms the corruption is in the stored payload only (non-deterministic upstream assembly bug), not in the file — this is what licenses the conclusion that the plugin's renderer was fed bad input.

### Release-checklist items this incident adds

1. **Version bump before build.** The version constant is baked into the client bundle from `package.json` at build time; the manifest must carry the new version *before* the bundler runs (the v0.3.7 release did the reverse, Section 1).
2. **Grep the shipped bundle for the baked constant.** After the build, before commit/tag/push, assert that the shipped `lib/client.js` actually contains `PLUGIN_VERSION = "<new version>"` — a build against a not-yet-bumped manifest is caught here instead of in production. The same gate can assert the served client would not render its own badge.
3. **Per-mirror tag SHA verification.** `git ls-remote --tags` on origin / public / omdsh; all SHAs must match across mirrors — as they do in git-tags.txt (748b5e56… for v0.3.7, d887deb0… for v0.3.8). Necessary for distribution integrity, but explicitly not sufficient (Section 1): a stale-constant bundle propagates to every mirror with an identical SHA.
4. **Report the upstream text-corruption bug instead of papering over it in the plugin.** When the render source is corrupted only in the session payload and the disk file is clean, the defect lives in the upstream read/result-text assembly layer. The plugin must (a) render defensively with the multi-source chain in Section 4 and surface an explicit error, and (b) file/report the upstream bug with the byte-level session-log evidence — not "repair" the correct source file, not silently retry indefinitely, not mask the failure as a broken image.
5. *(implied by Sections 1–2, worth stating as a checklist line)* **Host-plane changes require a host restart.** Any release that touches host-half code (routes, whitelists, host services) must call out that the running host needs a restart before the change takes effect; client-side refresh alone does not deliver it. Post-deploy smoke on both planes: client UI renders the new control, and the host asset route answers 200 for the new type.

---

## Summary table

| # | Symptom | Root cause | Layer to fix | Evidence |
|---|---|---|---|---|
| 1 | Fresh v0.3.7 shows "新版本 v0.3.7 可用" | Build-time inlined `PLUGIN_VERSION = "0.3.6"` (version bumped after the build) | Release order: bump → build → verify → tag | release-log.md steps 3–4; client-bundle-excerpt.js |
| 2 | New toggle visible; SVG asset 404, PNG 200, disk lib whitelists svg | Client bundle refreshed by the browser; host process never restarted, so boot-time route registration still runs the old whitelist | Restart the host process (release itself is fine) | asset-route-probe.txt; lib-index-excerpt.js; release-log.md ("host restart had NOT been performed") |
| 3 | One traced SVG renders broken from the session payload | Upstream read/result-text assembly spliced line 232 with line 247's tail at the shared prefix "stro"; disk file is well-formed; re-read is clean | Upstream session/result-text assembly; plugin renders payload only as untrusted input after validation | session-log-excerpt.txt sections 1–4 |

Awaiting upstream fix on the read-result assembly; the plugin-side defensive render chain (Section 4) and the release checklist (Section 5) are the durable takeaways.
