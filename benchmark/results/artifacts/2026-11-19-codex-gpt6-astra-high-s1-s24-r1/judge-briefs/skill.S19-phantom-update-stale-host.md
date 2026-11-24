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
#### FILE: S19-phantom-update-stale-host/incident-report.md

# S19 incident report

Scope: Mode A, read-only diagnosis under BENCHMARK-AUTH-v1. Read plugin-upgrade/SKILL.md and its references/troubleshooting.md; inspected all eight supplied fixture files. No installation, migration, source repair, restart, network access or tag operation was performed. Only this report is written.

## Completed: findings and evidence

### 1. Phantom update: the artifact is internally inconsistent

`client-bundle-excerpt.js` explicitly contains `PLUGIN_VERSION = "0.3.6"` in the shipped v0.3.7 client. tsdown inlines the package version at build time. It does not consult the installed package.json at runtime. The check compares the latest mirror tag with that constant using semver; v0.3.7 is greater than 0.3.6, so the freshly released client advertises its own release.

`release-log.md` establishes the operation-order error: build at 16:22 while the package still said 0.3.6, bump to 0.3.7 at 16:23, then commit the already-built client and tag at 16:24. Passing typecheck and 104 tests did not establish artifact version consistency. Changing package.json after build cannot change a baked string.

All three mirrors (origin/public/omdsh) show v0.3.7 SHA `748b5e56e41ca4dc22da1631569fb29d8ae0b99d`; their agreement proves faithful distribution of the same release, not correctness of its contents. Purging browser cache or repeating mirror pushes would still deliver the stale constant. The later tag inventory also contains v0.3.8 (`d887deb0f526ba6a76818e531c740893bd8e9b33`), so that later snapshot would select 0.3.8; it does not contradict the earlier self-badge observation when 0.3.7 was newest.

Correct release order: finish changes; bump package/associated version metadata and install references FIRST; build; inspect the emitted and packaged client constant; validate manifest, bundle and intended tag agree; run the appropriate checks; commit those exact artifacts; tag and push; verify the tag SHA independently on each mirror. Before committing/tagging, `rg -n 'PLUGIN_VERSION|0\.3\.7|0\.3\.6' lib/client.js` would have exposed this stale constant for the 0.3.7 release. For minified output inspect the actual compiled comparison/version binding, rather than treating any incidental occurrence of the new version as proof. Check equal latest/current produces no badge, a newer version does, and an older version does not.

The log records a historical rebuild/amend/force-move repair and says v0.3.8 used bump-before-build. This is evidence, not authorization to rewrite published tags now. Prefer a new corrective release for an immutable release policy.

### 2. Client refresh and host activation are separate

The browser receives the client bundle on refresh/re-fetch (no-cache in this incident), executes the refreshed client module and renders the new SVG toggle. The host half loads into the DSH server process; its apply/boot path registers the asset handler once, retaining the then-loaded CONTENT_TYPES map in that process. Replacing link-installed files on disk or refreshing a browser does not replace a running handler's module state.

`asset-route-probe.txt` supplies a particularly discriminating comparison: PNG returns 200/image/png; SVG returns 404 with "unsupported image type"; the browser already shows the new toggle; the host has not restarted since before the change. `lib-index-excerpt.js` includes `svg: 'image/svg+xml'` in the shipped host artifact. Thus the route exists and responds, the new client reached the browser, and the release on disk contains SVG support. The stale object is the RUNNING host's extension whitelist, not the mirrored release or the browser UI. This is a type rejection, not a missing endpoint.

Make this host-plane change effective by fully stopping the relevant DSH host and starting it again against the intended linked package, then refreshing/reconnecting the browser. Verify loaded package identity and both PNG and SVG responses, including SVG content-type and actual rendering. This is a proposed validation, not an action performed here. The usual client/plugin hot-update observation does not cover this retained host route registration: a browser reload only exercises the client plane. Do not reinstall DSH or copy files through the link to solve a stale running closure.

### 3. Broken image: upstream result-text assembly corruption

`session-log-excerpt.txt` separates three observations: the source is well-formed XML (XmlDocument load passed); the tool's typed result was clean; the model-visible result block persisted in the session log is malformed. Around line 232 the circle's `stroke-width="6.5"` continuation is replaced by an arc/path tail from source line 247 at the shared `stro` prefix, producing `stro0,1 ...`, with intervening source lines 233–247 absent as complete lines. XML parsing reports an attribute-value error for `stro0`. A later read is clean.

The fault therefore lies in the upstream assembly of the model-visible read-result text, before the plugin consumes it, rather than in the traced file or SVG renderer. The evidence localizes the layer; it does not identify a particular faulty function or prove the precise race mechanism. Non-deterministic clean re-read supports transient assembly corruption. The plugin must treat session payload text as untrusted rendering input even when it originated in a read tool. Editing or guessing a repair to the traced file would damage a good source, destroy useful evidence and leave the upstream bug intact. Preserve the original file and both result representations; report the upstream assembly bug with a minimal, appropriately redacted reproduction.

### 4. Defensive SVG render chain

1. Prefer the authenticated host asset route, serving original disk bytes for the selected authorized path with `image/svg+xml`, initially through an image element. This bypasses lossy/model-visible session text entirely. Observe HTTP errors and image onload/onerror; a 404 is not success. Preserve existing path authorization and size limits. Disk content may have changed since the historical trace, so label its provenance as current disk content.
2. If that route is unavailable or fails, obtain the stored session payload, parse it with `new DOMParser().parseFromString(text, 'image/svg+xml')`, reject any `parsererror` element, and require an SVG root in the SVG namespace. Only well-formed input may become an SVG Blob/object URL for image rendering. Revoke object URLs when replaced/unmounted. XML validation detects this splice; it is not a general security sanitizer. Never silently concatenate guessed missing lines or accept partial XML. A clean re-read can supply a separately identified replacement candidate without altering the source or original evidence.
3. If image rendering still fails for validated SVG, offer a last render attempt in an isolated iframe using only the validated candidate. Use `sandbox=""` (in particular no allow-scripts or allow-same-origin), with a restrictive content policy blocking scripts and unwanted external loads/navigation. Do not insert SVG into the application's live DOM. Declarative SVG SMIL animations can run without JavaScript, so this fallback can preserve animation while scripts remain blocked. A malformed payload cannot skip validation by taking the iframe branch.
4. If no valid candidate exists or rendering fails, show an explicit error state with source and reason, such as asset route unsupported type, malformed session SVG, or preview failed. Offer source viewing or a deliberate fresh read, and identify that a host restart is needed where the probes establish stale registration. Do not leave a silent broken-image icon. Bound attempts and handle stale asynchronous responses so a previous file cannot replace the currently selected preview.

### 5. Forensics method and prevention

The fixture supplies a decoded excerpt, not the original compressed generation file or full SVG. No raw log decompression or independent whole-file XML validation was performed here. For a full investigation, preserve a read-only copy/hash of the generation file and record offsets before decoding. A generation file contains concatenated Zstandard frames: a decoder that stops after one frame can omit the incriminating result.

Decode sequentially at known frame boundaries using a Zstandard frame-aware decoder. For example, a Python zstandard decompress object can consume the remaining bytes, require `eof`, emit that frame's decoded bytes and expose trailing compressed data as `unused_data`; advance by the number of input bytes consumed, create a fresh decoder, and repeat until all frames are consumed. Fail explicitly on a truncated frame, decoder error or zero progress; handle any format-defined framing/skippable frames rather than searching blindly for magic bytes. Alternatively use a streaming decoder explicitly configured to read across frames. Apply output-size limits for defensive decoding.

Record frame numbers and compressed byte ranges; concatenate decoded bytes in order before decoding UTF-8/parsing records if text/records cross frames. Follow the actual log record schema rather than assuming each frame is a complete JSON document. Locate the read event by file path and tool-call/event identity, extract the exact stored result-text field without normalization, retain its original bytes/escaped representation, and compare it to the typed result and disk source. Diff the line-232/247 splice, missing interval and XML parser error. This proves corruption was already persisted, rather than merely introduced by UI presentation. A clean later event should remain a distinct piece of evidence.

Release checklist additions:

- Bump before build; assert package version, packed manifest, emitted version binding and intended release tag agree before pushing.
- Grep/inspect the shipped bundle itself; validate update-check equality and newer/older behavior.
- Continue independent per-mirror tag SHA verification; it covers distribution integrity, a different property from artifact correctness.
- Classify changes by client/host plane; cold-start for host route changes and probe old/new supported media types after restart.
- Validate session XML before preview; exercise corrupted payload and route-failure paths, script blocking, SMIL rendering and explicit errors.
- Preserve the corrupted result and clean source/read as evidence and report upstream result-text assembly corruption. Do not paper over it with plugin-side source-file repairs.

## Validation scope, skipped work and residual risk

Pre-existing baseline: not collected (Mode A). Completed: consistency analysis of all supplied evidence, matched to the three relevant troubleshooting entries, and an actionable prevention/render design. Package identity is `@dsh-external/dsh-file-trace`, manifest 0.3.8, link-installed per the probe record; release SHAs are above. Host/Node versions, compatibility ranges, full source repository identity/HEAD, lockfile and resolved dependency cohort are not supplied and cannot be inferred from plugin SemVer.

Skipped: migrations, builds, tests, live HTTP probes, host restart, installations and tag mutation; this is an evidence-only pack, not a runnable full plugin checkout. No host-version corridor migration is implied. Runtime recovery and fallback behavior remain proposed, not verified. No blocker prevents the requested report; raw generation file absence limits new forensic reproduction only.

Rollback: no fixture/runtime/configuration changes were made, so no operational rollback is needed. The only created artifact is this report; original evidence remains unchanged.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.