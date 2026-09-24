# S19 · The Phantom Update, the Stale Host Half, and the Corrupted Payload — Analysis Report

Task: S19-phantom-update-stale-host (read-only forensic analysis)
Evidence pack: E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\tasks\S19-phantom-update-stale-host\environment\fixture (release-log.md, package.json, git-tags.txt, client-bundle-excerpt.js, asset-route-probe.txt, lib-index-excerpt.js, session-log-excerpt.txt)

Incident under analysis: a maintainer released v0.3.7 of the client-side plugin @dsh-external/dsh-file-trace (markdown renderer fix) and, in the same session, v0.3.8 (SVG render preview). Three symptoms followed: (1) the freshly released v0.3.7 shows its own update badge; (2) the v0.3.8 SVG toggle appears in the browser but Render fails — host asset route 404 for .svg while a PNG probe returns 200 and the shipped lib/index.js whitelists image/svg+xml; (3) rendering one traced SVG from the session payload yields a broken image because the session log's stored read-result text is line-spliced while the disk file is well-formed XML.

---

## 1. Phantom self-update root cause

**Where the compared constant comes from.** The shipped client bundle (fixture client-bundle-excerpt.js, verbatim from the served lib/client.js at tag v0.3.7) contains:

```js
/** The running plugin version (from package.json at build time). */
export const PLUGIN_VERSION = "0.3.6";
```

tsdown inlined this constant from package.json **at build time**; it is not read dynamically at runtime. The self-update check fetches the newest mirror tag via unauthenticated `git ls-remote --tags` and shows the badge when `latest > PLUGIN_VERSION`. So the badge compares *runtime mirror state* against a *build-time baked constant*.

**The operation-order mistake.** release-log.md records the actual v0.3.7 order:

1. 16:22 `pnpm run build` — client bundle emitted ← **build ran here**
2. 16:23 bump package.json 0.3.6 → 0.3.7 ← **version bumped AFTER the build**
3. 16:24 commit (including the already-built lib/client.js) + tag v0.3.7
4. 16:25 push main + tag to the three mirrors

The bundle was built while package.json still said 0.3.6, so the emitted lib/client.js baked `PLUGIN_VERSION = "0.3.6"`. The commit then included this stale build artifact alongside the already-bumped package.json. Result: the running v0.3.7 compares its baked "0.3.6" against the mirror's `v0.3.7`, `compareSemver("v0.3.7", "0.3.6") > 0`, `newerTag` returns "v0.3.7", and the drawer shows "新版本 v0.3.7 可用" — the plugin announcing an update to itself.

**Why mirror/tag integrity is irrelevant.** git-tags.txt shows all three mirrors (origin / public / omdsh) list both tags with identical SHAs (v0.3.7 = 748b5e5…, v0.3.8 = d887deb…). The tag SHA verification at 16:25 proved the *pushed git objects* were consistent — but the badge never compares against the git tree; it compares the *ls-remote tag list* against the *inlined bundle constant*. Perfectly replicated mirrors serving the exact tagged commit still serve a bundle whose baked constant is one version behind. Tag verification cannot detect a defect that lives inside the tagged artifact itself.

**Corrected release order** (as was actually applied for v0.3.8, per release-log.md):

1. edit source
2. bump package.json version FIRST
3. build (bundle bakes the new version)
4. commit + tag
5. push, verify tag SHAs

**The check that would have caught it before pushing:** grep the shipped bundle for the baked constant and assert it equals the release version, e.g. after build:

```sh
grep -o 'PLUGIN_VERSION = "[0-9.]*"' lib/client.js   # must contain 0.3.7
# or: node -e "import('./lib/client.js').then(m => console.assert(m.PLUGIN_VERSION === require('./package.json').version))"
```

A CI/release gate that fails when the bundle's baked version ≠ package.json version (or ≠ the tag being cut) turns this class of mistake into a pre-push failure. The remediation that was actually required — amend, rebuild, force-move the tag on all mirrors — is exactly the expensive, history-rewriting cleanup this cheap check avoids.

---

## 2. Client-plane vs host-plane update asymmetry

**Why the new client UI reached the browser while the new host route 404s.** The plugin has two halves loaded by different mechanisms at different times:

- **Client half (lib/client.js)** runs in the browser. The browser re-fetches/re-evaluates the client bundle (page reload / HMR re-fetch of the client plugin), so after the v0.3.8 push the new SVG render toggle was visible and clickable in the page. The client plane refreshes with the *next fetch of the bundle* — no host lifecycle event needed.
- **Host half (lib/index.js)** runs inside the DSH Node process. Its asset-route extension whitelist (`CONTENT_TYPES`) is evaluated when the route handler is registered/constructed — at **host boot-time route registration**. The host process had not been restarted since before the SVG whitelist change (asset-route-probe.txt, header comment). The running process still holds the *old* in-memory route whose whitelist lacks `svg`.

**How the probes pin the staleness to the RUNNING host, not the release.** Three independent observations triangulate:

1. PNG probe → 200 `image/png`: the route itself is alive and registered; this is not a missing/dead route, a networking problem, or a plugin that failed to load.
2. SVG probe → 404 "unsupported image type": the specific failure text is the whitelist's rejection path — the handler executed and declined the extension.
3. Disk `lib/index.js` (tag v0.3.8, lib-index-excerpt.js) **does** contain `svg: 'image/svg+xml'`: the shipped release is correct.

If the release were wrong, the disk file would lack `svg`. If the route were broken/absent, PNG would also fail. The only remaining explanation: the code executing in the host process is not the code on disk — the process booted before the whitelist change and still runs the pre-v0.3.8 whitelist. Staleness is in the running process, not in the artifact.

**What makes a host-plane change effective:** a host restart (or a full plugin reload that re-imports the host half and re-registers the route in that process) so the boot-time route registration runs against the new lib/index.js. **Why this is the one case where "plugins hot-update" does not hold:** dynamic-plugin hot update semantics apply to *client* bundle re-fetch and to *newly activated* package versions; a change that lives in code a long-running host process already imported and wired up at boot (the route registration closure holding the old whitelist object) is not re-evaluated until that process re-imports it. The client half re-fetches per page load; the host half's module evaluation and route registration happen once per host lifetime. Client-visible novelty therefore does not certify host-plane currency — a client toggle appearing is evidence only about the client plane.

---

## 3. Broken-image attribution

**Where the corruption happened.** The evidence (session-log-excerpt.txt) isolates it precisely:

- The source file on disk, same region, read separately: clean — line 232 is `<circle r="98" … stroke="#dde6ea" stroke-width="6.5"/>`, lines 233–247 present and well-formed; XmlDocument load reports no error.
- The session log's stored read-result text, around its line 232: line 232 truncated at the shared prefix `…stroke="#dde6ea" stro` and spliced with line 247's tail (`0,1 821,730" fill="none" …`), with real lines 233–247 absent. The spliced text is NOT well-formed XML ("error on line 233 at column 54: Specification mandates value for attribute stro0").
- The read tool's typed result delivered to its caller was clean, and a re-read of the same region afterwards came back clean (non-deterministic).

The corrupted text is therefore the **model-visible result block as persisted into the session log** — produced by the result-text assembly layer upstream of the plugin, in the harness's read-result → session-log path. It is not a disk-level defect (disk is well-formed), not a rendering defect (the renderer faithfully rendered corrupt input), and not reproducible on demand (non-deterministic re-read). The corruption happened between the tool's clean typed result and the session log's stored text.

**Why the plugin must treat the session payload as untrusted rendering input.** The session payload crosses a durable boundary (tool result → serialized log → later consumer), and this incident is direct proof that the stored text can diverge from the file it describes. A renderer that trusts it will render a broken image with no diagnosis, or worse, execute/interpret malformed content. Input crossing that boundary must be validated before use; the plugin cannot assume log text == disk bytes.

**Why editing or "repairing" the traced file would have been the wrong move:** the disk file was never broken — it is well-formed XML and the authoritative artifact. "Fixing" it would (a) corrupt a good file based on a bad copy, (b) destroy the forensic evidence of the upstream bug, and (c) paper over a harness-side text-assembly defect that would keep recurring nondeterministically for other files. The correct response is attribution (re-read, compare, decode the log) and an upstream bug report, plus a render chain (section 4) that degrades gracefully.

---

## 4. Defensive render chain (design)

Render-source order for an SVG preview, most-trusted to least-trusted, each level justified:

1. **Disk-bytes asset route first.** Fetch the SVG from the host asset route (`/dsh-file-trace/asset?path=…`), which serves the file's actual current bytes from disk. Justification: disk is the authoritative source; it bypasses the session-log text entirely, sidesteps the corruption class from symptom 3, and gives the browser a correct `image/svg+xml` content type. It also naturally re-covers after a host restart fixes symptom 2. This source is only usable once the host whitelist admits `svg` — which the shipped v0.3.8 host does.

2. **Session payload only after an XML well-formedness check.** If the asset route is unavailable (host stale, path inaccessible), fall back to the text stored in the session payload, but first parse it with `DOMParser` (`new DOMParser().parseFromString(text, "image/svg+xml")`) and check for a `<parsererror>` element. Only render if well-formed. Justification: this incident's spliced payload (`attribute stro0` error) would be rejected exactly here; a structured well-formedness verdict is deterministic and cheap, and it converts "silent broken image" into an attributable, handled state. The payload is untrusted rendering input (section 3), so validation is mandatory, not optional.

3. **Sandboxed iframe as the last render fallback.** Render the SVG inside an iframe with a hardened `sandbox` attribute (no `allow-scripts`; SMIL declarative animations still run because they are not script execution). Justification: even well-formed SVG can carry `<script>`, event-handler attributes, or external references; a sandboxed iframe without script permission neutralizes those while preserving the visual/animated preview. This level protects against *malicious* well-formed content, complementing level 2's check against *corrupt* content.

4. **Explicit error state instead of a silent broken image.** If all sources fail — payload fails the well-formedness check, asset route 404s, iframe rendering errors — show a named error state ("SVG source unavailable or corrupted; stored copy failed XML validation at line N") rather than an empty `<img>`. Justification: a silent broken image is undiagnosable (symptom 3 initially looked like a rendering bug); an explicit state names the failing source and reason, tells the user the disk file may still be fine, and makes recurrence reportable.

The ordering principle: trust decays with distance from the authoritative bytes (disk → serialized copy → interpreted render), and every fallback validates before it renders.

---

## 5. Forensics method + prevention

**Decoding the session log frame-by-frame.** The session log is a concatenated-Zstandard generation file: multiple zstd frames concatenated, each independently decodable. To recover the exact stored text:

1. Read the generation file as bytes; do not assume a single zstd stream.
2. Walk it frame by frame: parse each zstd frame header (magic 0x28B52FFD), decode that frame with a streaming zstd decoder (e.g. Node `zlib.createDecompressZstd`-style streaming / `node:zstd`, or the `fzstd`-style concat-aware decoder), record the consumed byte range, and continue at the next frame until EOF.
3. Decode each frame's payload as the session's framed event format and locate the read-result event for the SVG (the excerpt's "payload around line 232").
4. Extract the stored result text verbatim and compare it line-by-line against a fresh read of the disk file; the diff (shared-prefix splice at `stro`, missing lines 233–247) is the evidence that the corruption is in the persisted text, not the file.

Because frames are independent, a corrupted or truncated frame can be skipped without losing the rest of the generation — the forensic walk stays possible even when the log itself is damaged.

**Release-checklist items this incident adds:**

1. **Version-bump-before-build** — bump package.json before `pnpm run build`, always; the build must never see a stale version. (Fixes symptom 1 at the source.)
2. **Grep the shipped bundle for the baked constant** — post-build gate asserting the bundle's inlined `PLUGIN_VERSION` equals package.json's version (and equals the tag about to be cut); fail the release before pushing. (Catches symptom 1 before it ships.)
3. **Per-mirror tag SHA verification** — keep verifying `git ls-remote` SHAs on every mirror after push (this was done correctly and remains necessary), while understanding it verifies transport/replication, not artifact-internal constants.
4. **Restart the host after host-plane changes** — after releasing a change to a host half (route whitelists, registration-time configuration), restart or fully reload the host process and re-probe the route before declaring the release done; a refreshed client toggle is not evidence of host currency. (Prevents symptom 2's misdiagnosis.)
5. **Report the upstream text-corruption bug instead of papering over it in the plugin** — file the result-text-assembly splice (shared-prefix line splice, non-deterministic, disk clean / log corrupt) against the harness's read-result persistence path, attaching the decoded log excerpt and the clean disk read; do not "repair" traced files or add silent workarounds in the renderer. The plugin's correct mitigation is the validated multi-source render chain (section 4), which degrades safely until the upstream fix lands.

---

## Summary of attributions

| Symptom | Layer at fault | Root cause |
|---|---|---|
| Self-update badge on v0.3.7 | Release process | Build ran before the version bump; bundle baked `PLUGIN_VERSION = "0.3.6"`; mirror/tag integrity is orthogonal because the badge compares runtime tags against a build-time constant |
| SVG 404 with shipped whitelist present | Running host process (stale) | Client half re-fetches per page load; host half's route whitelist was captured at boot-time registration; no host restart since before the change — disk artifact is correct |
| Broken image from session payload | Upstream session-log result-text assembly | Persisted read-result text line-spliced at a shared prefix while disk file and typed tool result were clean; non-deterministic; plugin must validate payload (DOMParser/parsererror) and fall back disk-first; do not edit the traced file |
