# JUDGE BRIEF · skill.S19-phantom-update-stale-host

## Criteria (sealed rubric)
- [baked-version-release-order] (20pt) Compare release-log.md and client-bundle-excerpt.js: build preceded the bump, baking 0.3.6 into the shipped v0.3.7 client, so a newer-tag comparison reports an update to itself despite correct mirrored tags. Explain that package.json is not reread at runtime. Bump before build, inspect the emitted version constant before commit/tag/distribution, and retain mirror verification; do not confuse v0.3.8’s later manifest with the earlier build.
- [client-host-update-asymmetry] (20pt) Use asset-route-probe.txt and lib-index-excerpt.js: the refreshed client shows the toggle, PNG 200 proves the route exists, SVG 404 unsupported-type shows its running whitelist is old while disk already permits SVG. This linked install needs the host restarted to reload its boot/apply-time handler; client refresh does not replace that closure. Keep the conclusion specific to this host lifecycle, not every possible plugin hot-reload mechanism.
- [payload-corruption-attribution] (20pt) Use session-log-excerpt.txt’s clean source/XML and typed read result versus spliced persisted model-visible text and clean reread to locate corruption in upstream result-text assembly. The plugin consumes the damaged copy; the traced disk file is innocent. Treat the payload as untrusted input and do not “repair” the good SVG. No identification of an unseen internal function is required.
- [validated-render-fallbacks] (20pt) Design and justify the ordered chain: authoritative disk bytes via the asset route; session payload only after XML well-formedness validation (DOMParser/parsererror or equivalent); a sandboxed iframe fallback with scripts blocked while permitting SMIL; an explicit error if content/validation/rendering fails. Validation failure must not pass the same malformed payload unchecked to the iframe. Equivalent implementation details are accepted; this is a plan, not an executed security test.
- [forensics-and-prevention] (20pt) Explain decoding all concatenated Zstandard frames, preserving order and reconstructing the JSONL event containing the exact stored splice, then comparing that text with the source and reporting the upstream bug. A decoder that handles concatenated frames directly is equivalent to a manual frame loop; do not require magic-byte constants. Checklist: bump before build, verify the shipped constant and per-mirror tag SHA, and use plane-specific runtime probes. No actual log decode or upstream posting is required.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [contradictory-release-render-advice] ceiling=0 The final advice says bump-after-build is acceptable, mirror repush alone repairs the baked constant, browser refresh updates this host route without restart, or the clean traced SVG should be edited. Rendering the session payload without XML validation or allowing scripts in the fallback also triggers this cap. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.

## Candidate report(s)
#### FILE: S19-phantom-update-stale-host/report.md

# S19 - The Phantom Update, the Stale Host Half, and the Corrupted Payload - Attribution Report

Plugin: '@dsh-external/dsh-file-trace' (v0.3.7 -> v0.3.8). Evidence pack: 2026-09-05 release session.
Mode A (read-only inspect/diagnosis per plugin-upgrade SKILL.md). Fixture left unchanged; report written to agent-output/ only.

---

## 1. Phantom self-update - why the released client announces an update to itself

**Root cause: a build-time version constant baked from a package.json that had not yet been bumped.**

The self-update check in the shipped client bundle compares two different-time values:

- PLUGIN_VERSION = "0.3.6" - a BUILD-TIME constant. tsdown inlines it from package.json WHEN THE BUNDLE IS BUILT; it is not read dynamically at runtime (client-bundle-excerpt.js lines 6-9).
- latestTag - a RUNTIME value, fetched from 'git ls-remote --tags' and reduced to the highest vX.Y.Z (git-tags.txt lines 11-12).

newerTag() returns the tag when compareSemver(latestTag, PLUGIN_VERSION) > 0. With latestTag = v0.3.7 and PLUGIN_VERSION = "0.3.6", that comparison is true - so the just-released v0.3.7 shows 'new version v0.3.7 available' (新版本 v0.3.7 可用) on ITSELF.

**The operation-order mistake (release-log.md): the build ran BEFORE the version bump.**

| Step | Action | Consequence |
|---|---|---|
| 3 (16:22) | 'pnpm run build' | bundle inlines PLUGIN_VERSION = "0.3.6" |
| 4 (16:23) | bump package.json 0.3.6 -> 0.3.7 | too late - the already-emitted lib/client.js keeps "0.3.6" |
| 6 (16:24) | commit (incl. the stale built bundle) + tag v0.3.7 | stale constant is shipped under the new tag |

So the artifact published as v0.3.7 carries a bundle that believes it is still v0.3.6.

**Why mirror/tag integrity is irrelevant here:** all three mirrors list both tags with byte-identical SHAs (git-tags.txt). The self-update path never compares SHAs - it compares version strings and picks the highest tag. The tag itself is correct; the SELF side of the comparison is the stale in-bundle constant. Verifying the tag SHA matches across mirrors proves the tag points to the right commit, but says nothing about what version string was inlined into the bytes INSIDE that commit. Integrity checks cannot see a stale baked constant, so they were green while the bug shipped.

**Corrected release order** (adopted for v0.3.8, release-log.md line 15):

1. bump package.json version FIRST (0.3.6 -> 0.3.7);
2. THEN build, so tsdown inlines the new version;
3. then commit + tag + push + per-mirror 'git ls-remote' verification.

**The catch that would have caught it before pushing:** grep the freshly built bundle for the baked constant - assert the emitted lib/client.js contains the literal new version (PLUGIN_VERSION = "0.3.7" / "0.3.7"), or equivalently assert the inlined constant equals package.json#version. A one-line gate (grep -q '"0.3.7"' lib/client.js || exit 1, or import the bundle and assert PLUGIN_VERSION === pkg.version) fails fast the moment build-order and bump-order diverge.

---

## 2. Client vs host plane - why the new UI reached the browser while the new route still 404s

The plugin has two halves that load on DIFFERENT schedules (the plane split in migration-hygiene.md section 3 'client hard refresh vs host restart', backed by the plane view in host-plane-probes.md):

- **Client half - lib/client.js.** Served to the browser and re-fetched on reload. The v0.3.8 SVG render toggle appeared because the browser reloaded the new client bundle (confirmed: the toggle was rendered and clickable).
- **Host half - lib/index.js.** The asset route and its CONTENT_TYPES extension whitelist are registered AT HOST BOOT. The host process was NOT restarted after the SVG whitelist change, so the running process still holds the pre-v0.3.8 whitelist (no 'svg' entry).

**How the probes pin the staleness to the RUNNING host process, not to the release:**

| Probe | Result | Meaning |
|---|---|---|
| GET /asset?path=...png | 200 image/png | route handler is alive; 'png' was whitelisted in the OLD running process too |
| GET /asset?path=...svg | 404 'unsupported image type' | the RUNNING whitelist rejects 'svg' - the route exists, the extension is just not in its in-memory table |
| lib/index.js on disk | contains svg: 'image/svg+xml' | the RELEASE is correct; the new whitelist is on disk, just not loaded |

Because PNG answers 200 while SVG answers 404 on the SAME route, the route itself is fine - only its in-memory extension table is stale. Because the disk copy DOES whitelist 'svg', the defect is not in the shipped code. The only remaining explanation is that the running process predates the change: the staleness is in the running host, not in the release.

**What makes a host-plane change effective:** a HOST RESTART - boot-time route registration re-reads lib/index.js and loads the new whitelist. This is exactly the one case where the usual 'plugins hot-update' rule does NOT hold: that rule (change a plugin, refresh the browser) covers the CLIENT half, whose bytes are re-fetched per reload; the HOST half (route handlers, services, boot-time registrations) only re-registers when the host process restarts. Card DSH-0.1.7-A2-04 makes the same point in the other direction - client bundles are cached at host boot, so an install-tree edit needs a host restart, and a refresh-only verification can report stale content and mislead a diagnosis.

Net: the client-half change was verified correctly (refresh); the host-half change was verified by reading the file on disk instead of by restarting and re-probing - the exact refresh-vs-restart confusion migration-hygiene.md section 3 warns about.

---

## 3. Broken-image attribution - the corruption is in the session payload, not the traced file

**Which layer produced the corrupted text:** the SESSION-LOG RESULT-TEXT ASSEMBLY, upstream of the plugin.

The three observations, reconciled:

1. The source file on disk is WELL-FORMED XML (System.Xml load: no error) - the SVG itself is fine.
2. The session-log payload (the model-visible result block, persisted around payload line 232) is NOT well-formed - line 232 is source line 232 up to '...stroke="#dde6ea" stro' spliced with line 247's tail from '0 0,1 821,730' onward, landing on the shared prefix 'stro' (line 232's 'stroke-width' vs line 247's arc flags '0 0,1'), and the real lines 233-247 are absent.
3. A re-read comes back clean (non-deterministic).

The decisive discriminator is stated in the evidence: the read tool's structured (TYPE) result was clean, while the corrupted text is the MODEL-VISIBLE RESULT BLOCK persisted into the session log. The file is well-formed, the structured result is clean, and a re-read is clean - so the corruption happened in the text-assembly step that turns the structured read result into the persisted model-visible text (a line-splice at a shared prefix, a text-merge bug), which is UPSTREAM OF THE PLUGIN. The plugin only ever receives the already-corrupted session payload as input.

**Why the plugin must treat the session payload as untrusted rendering input:** the session payload is a projection/transcript of the file, not the file bytes, and this incident proves that projection can be spliced, malformed, and non-deterministic even when the underlying file is perfect. A renderer that trusts it verbatim will produce exactly the observed broken image. Treating the payload as untrusted means validating it (well-formedness) before rendering and preferring the disk bytes when available (section 4).

**Why editing/'repairing' the traced file is the wrong move:** the file on disk is already well-formed and correct; the corruption lives in the stored session text, which editing the file cannot reach. Fixing the file would (a) mutate a valid artifact for no reason, (b) leave the already-persisted corrupted payload untouched (the log is append-only - cf. DSH-0.1.3-A1-01: the source artifact stays unchanged and the log preserves the bad bytes verbatim), (c) risk introducing fresh errors into a good file, and (d) paper over the real defect. The correct move is to report the upstream text-corruption bug (section 5) and make the plugin's render path not depend on the corrupted projection.

---

## 4. Defensive render chain for an SVG preview

Render-source order, with justification:

1. **Disk-bytes asset route first.** Render by pointing at the host asset route (raw file bytes streamed with the correct content-type), not by injecting session text. This is the only source that is byte-for-byte the file - it bypasses the session-log text-assembly layer that this incident proved can corrupt text. The asset route was already probed as the authoritative path (PNG 200 image/png). Highest trust: no projection, no re-assembly, no splice surface.

2. **Session payload, only after an XML well-formedness check.** When only the in-context session payload is available, parse it with DOMParser and reject on 'parsererror' (or on documentElement being <parsererror>). The observed splice produces malformed XML ('Specification mandates value for attribute stro0'), so the well-formedness gate deterministically catches this exact corruption and falls through. Cheap, standard, and it converts 'silently render garbage' into 'validated or rejected'.

3. **Sandboxed iframe as the last render fallback.** When the payload passes well-formedness but we still cannot trust its active content, render it inside <iframe sandbox> WITHOUT allow-scripts. The sandbox blocks <script> execution and isolates the SVG from the parent DOM/cookies (blast-radius containment), while SMIL declarative animations (<animate>/<animateTransform>) still run - acceptable for a preview and explicitly within the stated constraint. Use this only after the byte route and the validated-payload route are unavailable.

4. **Explicit error state instead of a silent broken image.** Every level that fails surfaces a NAMED error - 'asset route returned 404 (host whitelist stale?)', 'SVG payload failed XML well-formedness', 'SVG could not be rendered' - rather than a broken-image icon. This preserves attribution: the operator can tell whether the failure is a stale host route, an upstream text-corruption, or a genuinely bad file, which is exactly the information a silent broken image destroys.

Ordering rationale: trust decreases left-to-right (raw bytes -> validated projection -> isolated active render), and each level only consumes the fallback when the more-trusted source failed its gate, so a corrupt payload never reaches an unvalidated render.

---

## 5. Forensics method + prevention

**Decoding the concatenated-Zstandard generation file frame-by-frame.** The session log is a concatenation of independently compressed zstd frames (one per appended generation). zstd concatenation is self-delimiting: every frame begins with the 4-byte little-endian magic 28 B5 2F FD (0xFD2FB528), and each frame carries its own header/descriptor. To recover the exact stored text:

1. Locate frame boundaries by scanning for the frame magic 28 B5 2F FD, or use ZSTD_findFrameCompressedSize to compute each frame's compressed size from its header.
2. Decompress each frame independently with ZSTD_decompress (streaming ZSTD_decompressStream also works), concatenating the decoded outputs - this yields the byte-exact stored payload, including the corrupted read-result block verbatim.
3. Compare the decoded block against a fresh read of the source file: the decoded text contains the splice ('...stro0,1 821,730...'), while the file is well-formed - proving the corruption is STORED, not introduced later by rendering, and that a re-read is clean (non-deterministic upstream assembly).

This turns 'the image looked broken' into evidence: the decoded frame is the exact persisted text, so the corruption is attributable to the result-text assembly layer upstream of the plugin (consistent with the append-only log semantics in DSH-0.1.3-A1-01).

**Release-checklist items this incident adds:**

1. **Version-bump-before-build** - bump package.json THEN build, so build-time inlined constants (e.g. PLUGIN_VERSION) carry the new version.
2. **Grep the shipped bundle for the baked constant** - after build, assert the emitted lib/client.js contains the new version literal (or that the inlined constant equals package.json#version); this is the gate that would have caught section 1 before pushing.
3. **Per-mirror tag SHA verification** - keep verifying 'git ls-remote' tag SHAs across every mirror (already done here, but it must stay on the list ALONGSIDE the bundle-content check, since integrity does not cover baked constants).
4. **Report the upstream text-corruption bug instead of papering over it** - the splice is a session-log result-text assembly defect, not a plugin defect; file it against the layer that produced the text, and let the plugin render chain validate/fallback (section 4) rather than silently masking it.

---

### Evidence / references (key point + card ID only)

- Build-time vs runtime version constant + bump-after-build order: client-bundle-excerpt.js, release-log.md.
- Client re-fetch vs host boot-time registration: migration-hygiene.md section 3 (client hard refresh vs host restart); host-plane-probes.md (plane view); DSH-0.1.7-A2-04 (client bundles cached at host boot - install-tree edit needs a host restart).
- Append-only session log, source artifact left unchanged: DSH-0.1.3-A1-01.
- Session-log text corruption upstream of plugin: session-log-excerpt.txt sections 3-4.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.