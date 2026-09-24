# S19 · The Phantom Update, the Stale Host Half, and the Corrupted Payload — Read-Only Analysis

Task: S19-phantom-update-stale-host (skill: plugin-upgrade, Mode A read-only inspection).
Evidence pack: fixture directory (read-only, unmodified). Plugin under analysis:
`@dsh-external/dsh-file-trace` v0.3.7 / v0.3.8, released 2026-09-05.

- pre-existing (baseline): not collected — this is a read-only diagnosis task; no build, install, or migration was executed.
- Method: all conclusions are grounded in the fixture files: release-log.md, package.json, git-tags.txt, client-bundle-excerpt.js, asset-route-probe.txt, lib-index-excerpt.js, session-log-excerpt.txt.

---

## 1. Phantom self-update root cause ("新版本 v0.3.7 可用" on v0.3.7 itself)

**Where the compared constant comes from.** The shipped `lib/client.js` contains
`export const PLUGIN_VERSION = "0.3.6";`. The comment in the excerpt states the
mechanism exactly: tsdown inlined the value from package.json **at build time**; it is
not read dynamically at runtime. The update check runs `git ls-remote --tags` (no
auth) against the mirrors, picks the highest `vX.Y.Z`, and `newerTag()` shows the
badge when `compareSemver(latest, PLUGIN_VERSION) > 0`.

**The operation-order mistake.** Per release-log.md for v0.3.7:

1. 16:22 `pnpm run build` — bundle emitted
2. 16:23 bump package.json 0.3.6 → 0.3.7
3. 16:24 commit (including the already-built `lib/client.js`) and tag `v0.3.7`

The version bump happened **after** the build. So the committed, tagged, and served
bundle bakes `PLUGIN_VERSION = "0.3.6"`. When that very bundle runs and queries the
mirrors, the newest tag is `v0.3.7` and `0.3.7 > 0.3.6` → the freshly released
plugin announces an update to itself. The corrected order (already applied for
v0.3.8): bump version **first**, then build, then commit + tag + push.

**Why mirror/tag integrity is irrelevant.** git-tags.txt shows all three mirrors
(origin / public / omdsh) list both tags with identical SHAs, and the release log
confirms `git ls-remote` verified the tag SHA on all three. Integrity verification
proves *which bytes* were pushed — not *what those bytes contain*. The defect is
inside the artifact: a stale baked constant in a byte-perfect, correctly-tagged
release. No mirror lag, tampering, or propagation delay is involved; the update
check is comparing a correct runtime fact (latest tag v0.3.7) against an incorrect
build-time fact (baked 0.3.6). The remedy was amend + rebuild + force-move the tag
on all mirrors.

**The check that would have caught it before pushing.** After building and before
committing/tagging, grep the shipped bundle for the baked constant and compare it to
the version being released, e.g.:

- `grep -o 'PLUGIN_VERSION = "[^"]*"' lib/client.js` must equal the `version` field of
  package.json and the intended tag (v0.3.8's flow passes; v0.3.7's would have printed
  `0.3.6` against tag `v0.3.7` and failed);
- equivalently assert `package.json .version === baked constant` in a release script
  or CI job that runs on the built artifacts, not on source.

With that gate in place, "bump after build" becomes mechanically impossible to ship.

## 2. Client vs host plane update asymmetry

**Why the new client UI arrived but the new host route 404s.** The two halves of the
plugin are loaded by different processes on different schedules:

- **Client half** (`lib/client.js`) is served over HTTP to the browser and re-fetched
  on page refresh / client-bundle reload. The new v0.3.8 client code (with the SVG
  render toggle) reached the browser as soon as the browser reloaded — confirmed in
  the evidence ("the new toggle button was rendered by the browser").
- **Host half** (`lib/index.js`) is Node code loaded into the DSH host process at
  plugin activation/boot time. Its asset route and the `CONTENT_TYPES` whitelist were
  registered when the host booted — before the v0.3.8 whitelist change. The host was
  **not restarted** in this session, so the running process still holds the old
  whitelist (no `svg` entry) in memory.

**How the probes pin the staleness to the running host, not the release.** Three
independent observations triangulate it:

1. PNG probe → `200 OK, content-type: image/png`: the route handler itself is alive
   and answering — this is not a missing/dead route, a wiring failure, or a client
   bug.
2. SVG probe → `404 "unsupported image type"`: that exact error string is the
   extension-whitelist rejection path, i.e. the *old* whitelist (the one without
   `svg`) is making the decision.
3. Disk `lib/index.js` at v0.3.8 (lib-index-excerpt.js) **does** contain
   `svg: 'image/svg+xml'`: the shipped/released artifact is correct.

Correct artifact + whitelist-shaped rejection ⇒ the code answering the request is not
the code on disk ⇒ the **running host process** is stale. Only a host restart (plugin
re-activation under the new lib) makes a host-plane change effective. This is the one
case where the usual "plugins hot-update" rule does not hold: client bundles refresh
with the page, but host-half route registrations live in the boot-time process image —
replacing files under a running Node process changes nothing it already loaded.

(Consistent with the known DSH pattern that host-plane bundle/composition changes
require a host restart; here it manifests at the single-plugin granularity of an
asset route.)

## 3. Broken-image attribution (session payload corruption)

From session-log-excerpt.txt:

- The **source file on disk** is well-formed XML (XmlDocument load: no error), and a
  separate read of the same region is clean.
- The **session log's stored read-result text** is NOT well-formed: payload line 232 =
  source line 232 truncated at the shared prefix `stro` with source line 247's tail
  (`0 0,1 821,730 ...`) spliced on; source lines 233–247 are absent. The splice is
  mid-file, at a coincidental shared prefix — a classic non-deterministic
  text-assembly corruption, and indeed a re-read came back clean.

**Where the corruption happened.** The excerpt records that the read tool's TYPE result
delivered to the caller was clean and that the corrupted text is the model-visible
result block *persisted into the session log*. So the corruption was produced in the
result-text assembly layer upstream of the plugin — between the tool's clean result
and the session-log persistence — not by the file, not by the read, and not by the
renderer.

**Consequences for the plugin:**

- The plugin **must treat the session payload as untrusted rendering input**. The
  payload is a persisted copy that can diverge from disk (proven here); rendering it
  as-is produced the broken image. Any text crossing that boundary needs validation
  before use.
- **Editing/repairing the traced file would have been the wrong move**: the file on
  disk is well-formed and was never at fault. "Fixing" it would corrupt a good source
  file to match a bad copy, destroy the forensic evidence, and leave the real upstream
  bug (session-payload text corruption) unreported and live.

## 4. Defensive render chain (SVG preview source order)

Design, strongest-to-weakest trust in content fidelity:

1. **Disk-bytes asset route first.** Fetch the SVG through the host asset route
   (serves the file's actual bytes from disk, with the correct `image/svg+xml`
   content type). Rationale: disk is the ground truth (Section 3 proved disk clean
   while the log copy was spliced); it bypasses the session-payload copy entirely.
   Note the operational prerequisite this incident exposed: the host half must be
   restarted after a whitelist change, and the renderer should surface a whitelist
   404 ("unsupported image type") distinctly rather than swallowing it.
2. **Session payload only after an XML well-formedness check.** When the payload must
   be used (e.g. the file is gone, or previewing exactly what the model saw), parse
   it first — `new DOMParser().parseFromString(text, "image/svg+xml")` and check for a
   `<parsererror>` element (in this incident the spliced payload fails with
   "Specification mandates value for attribute stro0", line 233 col 54). Only
   well-formed payloads proceed to render; a parse failure demotes to the next level
   or the error state, never a silent broken image. Rationale: the payload is
   untrusted upstream text (Section 3).
3. **Sandboxed iframe as the last render fallback.** Render the SVG inside an iframe
   with `sandbox` set so scripts are blocked, and only the SVG document loaded
   (object/embed src, or srcdoc of the validated markup). Scripts in an SVG are
   blocked by the sandbox; SMIL animation elements still run because they are
   declarative, not script — which is desired for preview fidelity. Rationale: even
   well-formed SVG is active content; the sandbox contains any script the
   well-formedness check cannot express an opinion about.
4. **Explicit error state instead of a silent broken image.** When every level fails,
   show a labeled error (e.g. "render source unavailable / payload failed XML
   validation") with the reason. Rationale: a silent broken image is precisely what
   delayed attribution in this incident; an explicit state turns a rendering failure
   into a diagnosable signal.

Each level is justified by a failure actually observed in the evidence: disk-truth
over log-copy (Section 3), well-formedness gating (the parsererror verdict is in the
fixture), sandboxing (SVG is untrusted active content), and explicit failure states
(the 404 was initially indistinguishable from "broken image").

## 5. Forensics method + prevention

**Decoding the session log.** The session log is a concatenated-Zstandard generation
file; to recover the exact stored text, decode it frame-by-frame:

1. Open the generation file and split it into its concatenated zstd frames (a zstd
   stream in this format is a sequence of independent frames; do not attempt a single
   streaming decompress over the whole file if frames are independent — iterate:
   use the zstd framing format's magic number `0x28 B5 2F FD` to locate frame
   boundaries, or a decoder API that reports bytes consumed per frame);
2. Decompress each frame and walk the decoded session entries (`seq` /
   `eventAt`-style access or direct frame reading) to locate the read-result event
   for the SVG path (the excerpt cites "payload around line 232");
3. Extract the stored result text and compare it line-by-line against a fresh disk
   read of the same file — the diff (missing lines 233–247, spliced tail at the
   shared prefix `stro`) is the evidentiary artifact;
4. Cross-check well-formedness of both texts (source: clean; log copy: parsererror)
   and note non-determinism (clean re-read) to characterize the bug as an
   intermittent upstream assembly defect.

This turns "the preview looked broken" into a reproducible, citable record of which
layer corrupted what.

**Release-checklist items this incident adds:**

1. **Version-bump-before-build** — bump package.json before running the build, always
   (the v0.3.8 correction); make it mechanical, not remembered.
2. **Grep the shipped bundle for the baked constant** — verify the built
   `lib/client.js` carries `PLUGIN_VERSION = "<release version>"` before commit/tag/
   push; wire it into CI so the stale-constant artifact cannot ship.
3. **Per-mirror tag SHA verification** — keep the existing `git ls-remote` check on
   every mirror (it worked; it is necessary for propagation/tamper detection even
   though it cannot catch content-level defects like the baked constant).
4. **Host-plane restart verification after host-half changes** — after pushing any
   host-half change (route/whitelist), restart the host and probe the new behavior
   (SVG 200) before declaring the release done; do not infer host freshness from the
   refreshed client UI.
5. **Report the upstream session-payload text-corruption bug** — file the splice bug
   against the session/result-text assembly layer with the decoded frame evidence;
   do not paper over it inside the plugin (no payload "repair", no silent fallback
   that hides the corruption). The plugin's job is the validated render chain of
   Section 4, not fixing upstream data.

---

## Report status

- **Completed**: all five required analyses above, grounded in the fixture evidence.
- **Skipped**: no code/build/install/migration actions (task is read-only by
  authorization); no Mode B/C work applicable.
- **Pending/residual risk**: the upstream session-payload corruption is
  non-deterministic and remains live upstream (it should be reported, not worked
  around); the host-restart requirement is operational and outside the plugin's
  control.
- **Rollback**: not applicable — nothing was modified; the fixture directory is
  untouched.
- **Recommendations**: adopt the render chain of Section 4 in the plugin; add the CI
  baked-constant gate; add the host-restart probe to the release checklist.
