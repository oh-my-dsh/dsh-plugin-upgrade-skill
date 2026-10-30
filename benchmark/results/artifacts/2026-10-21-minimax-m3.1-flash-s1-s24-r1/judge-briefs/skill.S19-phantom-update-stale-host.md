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
#### FILE: S19-phantom-update-stale-host/S19-phantom-update-stale-host-report.md

# S19 - The Phantom Update, the Stale Host Half, and the Corrupted Payload

**Mode:** read-only diagnosis (plugin-upgrade Mode A - inspect). **Incident evidence date:** 2026-09-05 release session.
**Plugin:** `@dsh-external/dsh-file-trace` (dual half: client `lib/client.js` + host `lib/index.js`).
**Fixture:** `fixture/` - 8 files, sealed read-only, verified unchanged (see section 7).
**Nothing was modified, installed, migrated, published, or probed outside the fixture and the bundled skill scripts.**

---

## 0 - Evidence pack, method, and how to read this report

| Evidence file | What it pins down | Used in |
|---|---|---|
| `release-log.md` | the maintainer's actual operation order for v0.3.7 and v0.3.8 | 1, 2 |
| `package.json` | committed manifest at v0.3.8 (`version: 0.3.8`) | 1 |
| `git-tags.txt` | `git ls-remote --tags` on origin / public / omdsh | 1 |
| `client-bundle-excerpt.js` | verbatim shipped `lib/client.js` self-update check + baked constant | 1 |
| `asset-route-probe.txt` | PNG 200 / SVG 404 probes of the host asset route | 2 |
| `lib-index-excerpt.js` | verbatim shipped `lib/index.js` `CONTENT_TYPES` whitelist | 2 |
| `session-log-excerpt.txt` | decoded session-log read-result text, source file lines, XML verdicts | 3, 5 |

Skill material consulted (key points + card IDs only, no full card text): `plugin-upgrade/SKILL.md`; `references/troubleshooting.md` (three rows covering exactly these symptoms, benchmark-tagged to this task); `references/migration-hygiene.md` item 3 (client refresh vs host restart); `references/pre-flight.md` item 1.5 (ghost host: pin `from` to the RUNNING process); card **DSH-0.1.7-A2-04** (client bundles cached at host boot since 0.1.7-alpha.2); card **DSH-0.1.5-A1-01** and card **DSH-0.1.7-A1-05** (Session log format generations); card **DSH-0.1.5-A2-21** (sandboxed-iframe document-preview precedent); card **DSH-0.1.5-A1-01**'s media-route security headers (`nosniff`, `CSP sandbox; default-src 'none'`, byte cap); example 06 (version constants baked at build time; verify the artifact constant and prompt tag before tagging).

I ran the skill's bundled `scripts/ghost-host-check.check.mjs` offline self-check (exit 0: lstart parsing, ghost verdict, probe tri-state, argv-to-checkout resolution). It is used here as the *reasoning pattern* for section 2, not against a live host: per the boundary rules I did not run `dsh --version`, `dsh --dump-config`, or any `cordis_inspect_*` call, because the installed host runs a different version and is out of scope.

---

## 1 - Phantom self-update root cause: a build-time constant frozen one release behind

### 1.1 Where the compared constant comes from

`client-bundle-excerpt.js` (verbatim, shipped at tag v0.3.7 - the bytes actually served to the browser):

```js
/** The running plugin version (from package.json at build time). */
export const PLUGIN_VERSION = "0.3.6";
// tsdown inlined this constant from package.json WHEN THE BUNDLE WAS BUILT -
// it is not read dynamically at runtime.

function newerTag(latestTag) {
  return latestTag !== undefined && compareSemver(latestTag, PLUGIN_VERSION) > 0
    ? latestTag
    : undefined;
}
```

Two facts follow, and together they are the entire bug.

1. **The constant is a build-time artifact.** `PLUGIN_VERSION` is *inlined by the bundler* from `package.json` at the moment `pnpm run build` runs. In `lib/client.js` it is a string literal. At runtime the client bundle has no access to the manifest, so the only version it can compare against is the one frozen during its own build.
2. **The comparison is against the newest published tag.** The self-update check fetches `git ls-remote --tags` (unauthenticated) and picks the highest `vX.Y.Z`. With the baked constant at `"0.3.6"`, `newerTag("v0.3.7")` returns `"v0.3.7"`, so the drawer renders the badge **"新版本 v0.3.7 可用"** on the freshly released v0.3.7 itself.

The badge is therefore not a mirror problem, a cache problem, or a comparison bug: it is the arithmetic consequence of one release of drift between the manifest and the artifact. The failure generalises - every user of the shipped v0.3.7 artifact is told to update to v0.3.7, and since the tag was later force-moved, a client still carrying the stale constant keeps seeing "update available" against whatever the newest tag is (v0.3.8). The badge is structurally self-referential whenever the artifact is one release behind its own tag.

### 1.2 The actual operation-order mistake

From `release-log.md` (v0.3.7, timestamps local):

| # | time | operation | state of the artifact |
|---|---|---|---|
| 1 | 16:20 | edit `src/client/markdown.tsx`, add regression tests | - |
| 2 | 16:21 | `pnpm run typecheck` (green), `npx vitest run` (104 passed) | - |
| 3 | **16:22** | **`pnpm run build` - client bundle emitted** | **bundle freezes `version: 0.3.6`** |
| 4 | **16:23** | **bump `package.json` 0.3.6 -> 0.3.7** | manifest now 0.3.7; **bundle still 0.3.6** |
| 5 | 16:23 | README install refs -> `#v0.3.7` | docs and manifest agree; bundle does not |
| 6 | 16:24 | `git commit` (includes the **already-built** `lib/client.js`) + `git tag v0.3.7` | the stale constant is published |
| 7 | 16:25 | push `main` + tag to origin / public / omdsh; `git ls-remote` verified the tag SHA on all three | all three mirrors faithfully serve a self-contradictory tag |

**The mistake is ordering, not content.** The build ran one minute *before* the version bump, so the bundler inlined the pre-bump value. Every later step (test pass, commit, tag, mirror push, SHA verification) faithfully propagated an artifact whose embedded identity was already stale. The defect was **present on disk at step 3** and was **published at step 6**.

This is the pitfall the skill's example 06 records from the other direction: a plugin's `import pkg from '../../package.json'` version gets baked into `lib/client.js` at bundling, so tagging after bumping `package.json` alone ships a self-inconsistent tag. (The precise source expression is not in the fixture - the fixture only states tsdown inlined the constant from `package.json` at build time. The pattern is confirmed; the exact expression is **unconfirmed**.)

### 1.3 Why mirror and tag integrity are irrelevant here

`git-tags.txt`:

```
origin  748b5e56...  refs/tags/v0.3.7     public  748b5e56...  refs/tags/v0.3.7     omdsh  748b5e56...  refs/tags/v0.3.7
origin  d887deb0...  refs/tags/v0.3.8     public  d887deb0...  refs/tags/v0.3.8     omdsh  d887deb0...  refs/tags/v0.3.8
```

Both tags exist on **all three** mirrors with **identical** SHAs. Integrity is a *transport* property; the fault is in the *payload bytes* the transport faithfully carried.

- **Perfect mirrors cannot fix it.** The check compares `PLUGIN_VERSION` (a literal inside the artifact) with the newest tag. Nothing about the mirrors changes the literal.
- **Perfect mirrors do not cause it either.** That would require a mirror to serve a *different* bundle; the evidence shows the served bundle is the committed one, with constant `"0.3.6"`.
- **The check is version-only, so it cannot detect identity drift.** `git ls-remote --tags` returns tags, not artifact contents. A tag can be perfectly consistent across every mirror and still ship a bundle that disagrees with it. The verification therefore has to live *inside the artifact*, not on the mirror.

### 1.4 Corrected release order, and the check that would have caught it before pushing

**Correct order (bump -> build -> verify -> commit -> tag -> push -> verify mirrors):**

1. `package.json` version bumped to the release version **first**;
2. `pnpm run build` - the bundler now inlines the *new* version;
3. **artifact verification gate** (below) - fails the release if the artifact disagrees with the manifest;
4. tests / typecheck;
5. `git commit` the version bump **together with** the regenerated artifacts (never a stale `lib/`);
6. `git tag` on that commit; push `main` + tag;
7. per-mirror `git ls-remote --tags` SHA verification on **every** mirror;
8. host-plane reminder: if the host half changed, restart the host and re-probe (section 2).

The v0.3.8 release in the same session used the corrected order (bump first, then build), which is why v0.3.8 carries no phantom badge.

**The check that would have caught it (run on the built artifact, before the commit/tag):**

```bash
# 1) the baked constant must equal the manifest version
node -e "const p=require('./package.json');const s=require('fs').readFileSync('lib/client.js','utf8');
         const m=/PLUGIN_VERSION\\s*=\\s*['\"]\\.([^'\"]+)/.exec(s);
         console.log('manifest',p.version,'artifact',m&&m[1]);
         process.exit(m&&m[1]===p.version?0:1)"      # exit 1 => DO NOT TAG

# 2) the same assertion as a plain grep, for CI
grep -n 'PLUGIN_VERSION' lib/client.js              # must show the intended release version

# 3) the update prompt's tag routing must name the same tag
grep -n 'v0\.3\.8' lib/client.js README.md
```

(In the snippet above the regex is written unescaped for readability; in a real shell script escape the backslashes for `node -e`.) For this plugin family, `node --check lib/index.js && node --check lib/client.js` plus a direct read of the artifact's version constant is the minimum (example 06's rule for plugins that maintain `lib/` directly); for source-built plugins the same assertions belong in CI as a **pre-tag gate**. The skill's own prescription matches: verify that the final `lib/client.js` version constant and prompt tag match the intended release, before tagging.

**Why the remediation was expensive, and the lesson:** the fix required *amend + rebuild + force-move the tag on all three mirrors*. Force-moving a published tag means the SHA verification performed at step 7 described a SHA that no longer exists on any mirror - the very evidence that "proved" the release was fine became unreproducible. When a tag must be force-moved, treat it as a release incident: re-verify all mirrors afterwards and announce the re-point in the release notes so downstream installers that cached the old SHA can detect the change.

---

## 2 - Client vs host plane asymmetry: the new UI arrived, the new route did not

### 2.1 The two halves and where each one lives

| Half | Artifact | Loaded by | When new code becomes effective |
|---|---|---|---|
| Client (Web UI) | `lib/client.js` | the browser, through the host's client-artifact route and the page's module loader | on page load / refresh of the served client bytes (subject to the host's client-cache regime - see the caveat in 2.5) |
| Host (routes, services) | `lib/index.js` | the **host OS process**, by the Cordis loader, when the plugin is applied to the composition | **once, at host boot / plugin apply** - the route handler is a closure over the module's `CONTENT_TYPES` map as loaded into memory |

The host half registers the asset route during apply, and the handler's extension-to-content-type whitelist is a module-scope constant captured by that closure when the module was first required. Replacing `lib/index.js` on disk does not mutate the closure inside a live process.

### 2.2 What the probes prove

From `asset-route-probe.txt`, executed **after** the browser was confirmed refreshed (new SVG toggle visible and clickable), host **not** restarted since the SVG whitelist change:

```
GET /dsh-file-trace/asset?path=...\daigo-final.png    -> 200 OK, content-type: image/png
GET /dsh-file-trace/asset?path=...\daigo-bicycle.svg  -> 404 Not Found, "unsupported image type"
```

And from `lib-index-excerpt.js` (the **disk** copy at tag v0.3.8):

```js
const CONTENT_TYPES = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif',
  webp:'image/webp', bmp:'image/bmp', avif:'image/avif', ico:'image/x-icon',
  svg:'image/svg+xml', pdf:'application/pdf' };
```

The probe triple is the whole attribution:

1. **The route handler is alive.** PNG returns 200 `image/png`. The route is registered and serving; this is not "no route".
2. **The rejection is extension-specific.** The 404 body says *"unsupported image type"* - the handler looked the extension up in a whitelist and did not find it. A missing route would have produced a different error (404 for the path itself), and a MIME or parse error would have produced a 5xx or a broken image with a 200.
3. **The disk artifact already contains `svg: 'image/svg+xml'`.** The release is correct; the file on disk is correct.

=> The **running host process** is executing the pre-SVG `lib/index.js`: the closure captured the old whitelist when the host booted. This is exactly the skill's ghost-host discipline (pre-flight item 1.5): *pin the corridor's `from` to the RUNNING process, not to the disk.* The disk says v0.3.8; the process says "before the SVG whitelist change". The evidence that separates them is not a version number - it is a **reply** (PNG 200 vs SVG 404).

### 2.3 What makes a host-plane change effective

- **Restart the host process** (`dsh web` restart). The new `lib/index.js` is required afresh, the route is re-registered with the new whitelist, and SVG then answers 200 `image/svg+xml`. Re-probe **both** extensions after the restart - PNG 200 *and* SVG 200 - before declaring the route fixed.
- **Order of operations on Windows:** a running host holds file handles on the loaded host half, so replacing files in the install tree while the host runs can fail with EBUSY-class locking. Stop the host first, then replace, then start.
- **Never conclude "the release is broken" from a live 404.** The disk-versus-process split must be established first. This incident's failure mode was exactly that: the shipped code was fine and only the process was stale.

### 2.4 Why this is the one case where "plugins hot-update" does not hold

The common rule - *a change landing in `lib/client.js` takes effect on a browser hard refresh; a change landing in `lib/index.js` requires restarting dsh* (migration-hygiene item 3) - is the rule for the **client** half only. Here the client half refreshed (the new SVG toggle rendered and was clickable) **and** the host half did not (SVG 404). The "hot update" slogan covers the client plane only; the host plane is **boot-time registration**, and no refresh, re-fetch, cache-bust or client rebuild can change what a long-running process already closed over.

The consequence is that the two halves of one plugin can sit at **different generations simultaneously** - client at v0.3.8, host at pre-v0.3.8 - with no error anywhere. That split state looks like "the feature is half-shipped", but the feature shipped fine and the host is stale. It is the classic mis-diagnosis trap this evidence pack is built to catch.

### 2.5 One honest caveat about the client cache regime

The skill carries two statements that must be reconciled before generalising:

- the troubleshooting row for this benchmark says the client bundle is **re-fetched per refresh (no-cache)**, while the host half registers once at apply time;
- card **DSH-0.1.7-A2-04** says that from 0.1.7-alpha.2 client bundles are **read and cached at host boot**, so an install-tree client edit needs a **host restart** to be served.

This incident's own observation is that the new client UI *did* reach the browser without a host restart, which is consistent with the first statement for this deployment. **Which regime governs the host version in this session is unconfirmed** from the fixture. The operative conclusion is unaffected and is confirmed by the probes: **host-plane changes require a host restart**, regardless of how the client half is cached. If a future release touches the client half *in the install tree* on a 0.1.7-alpha.2+ host, verify the served bundle bytes after a restart rather than trusting a refresh - the card's verification recipe says exactly this.

---

## 3 - Broken-image attribution: the corruption is upstream, in the session payload

### 3.1 The three facts, and what each one eliminates

| Fact | Source | Eliminates |
|---|---|---|
| The file on disk is well-formed XML ("System.Xml XmlDocument load: no error") | `session-log-excerpt.txt` sections 2-3 | the traced file as the culprit - the source was never malformed |
| The **read-result text persisted in the session log** is NOT well-formed: *"error on line 233 at column 54: Specification mandates value for attribute `stro0`"* | `session-log-excerpt.txt` sections 1 and 3 | the plugin's renderer, and the file - the *rendered input* is the broken thing |
| A re-read of the same region comes back **clean**, and the read tool's **TYPE** result was clean | `session-log-excerpt.txt` section 4 | the read tool's typed return path; the fault is non-deterministic and lives in the **model-visible text assembly** that is persisted |

### 3.2 Where the corruption happened, precisely

The corruption happened **upstream of the plugin**, in the assembly of the *model-visible* read-result text that is persisted into the session log - not in the read tool's typed return (which was clean), and not on disk (the file is well-formed). The plugin rendered exactly what it was given; what it was given was already broken.

**I verified the splice mechanics directly against the fixture bytes**, not just the prose summary:

- payload line 232 = **source line 232, characters 0-51** + **source line 247, characters 35-end**;
- the head cut lands on the shared prefix `... stroke="#dde6ea" stro`;
- the tail cut lands inside line 247's arc-flag run, producing `0,1 821,730" fill="none" stroke="#ffffff" ... stroke-linecap="round"/>`;
- the merged token becomes `stro0,1`, so the XML parser reads a bogus attribute name `stro0` with no `=`, which is exactly the recorded error *"Specification mandates value for attribute `stro0`"*;
- source lines **233-247 (15 lines) are absent**, and the payload's own "233:" line is a *later* source path line relabelled - so the payload's line numbering is no longer the file's line numbering.

This is a classic **head/tail splice at a shared prefix**: the head of one line glued to the tail of another where the two strings share a short prefix. The fixture's prose (section 4) describes the same shape; note one internal discrepancy in the fixture - its prose quotes the tail start as `"0 0,1 821,730"` while its **verbatim** payload line 232 shows `... stro0,1 821,730"`. I measured against the verbatim line (`stro0,1`); the splice shape, the cut points and the 15 lost lines are identical either way.

*Unconfirmed:* the fixture names only "the result-text assembly" upstream of the plugin; it does not name the exact upstream component. A head/tail retention-or-budget assembler is *consistent* with the observed shape (the skill's spill-policy cards describe exactly such head/tail token budgets), but the fixture does not establish it, so it stays a hypothesis, not a finding.

### 3.3 Why the plugin must treat the session payload as untrusted rendering input

1. **The payload is a derived, lossy, model-visible copy - not the file.** It is aggregated text that may be truncated, spliced, budgeted, or re-serialised. Nothing in the contract guarantees byte fidelity to the source. The plugin happened to be the first component to *depend* on that fidelity.
2. **The failure is non-deterministic.** The clean re-read proves the same path can produce a good payload later. A renderer that trusts the payload therefore produces intermittent, unreproducible breakage - exactly the kind of symptom that gets mis-filed as "the plugin's SVG support is flaky".
3. **"Untrusted" also means "possibly influenced".** A payload that reached a UI surface is text some upstream component assembled; anything that can influence that assembly can influence what the renderer draws. Validation before rendering is the difference between a broken picture and an injection vector.
4. **Validation is cheap and local.** A well-formedness check on a string costs nothing and converts an invisible upstream defect into a *typed* error the plugin can report and the user can act on.

### 3.4 Why editing or "repairing" the traced file would have been the wrong move

- **It would not have fixed anything.** The renderer read the *session payload*, not the file. Hand-editing the file leaves the corrupted payload in place, so the next render of that cached payload is still broken.
- **It would destroy the evidence.** The on-disk file is the *control* that proves the corruption is upstream. Patching it destroys the only clean reference and makes the incident unreportable.
- **It would mask the real defect.** The corruption is upstream, non-deterministic, and will recur for other users and other files. "Fixing" the file converts a reportable upstream bug into a silent recurring one - precisely the "papering over it in the plugin" failure mode.
- **It writes to the user's data.** The traced file belongs to the user; a plugin that silently rewrites a user's file because its own input was corrupt is a data-safety defect of its own.
- **It is not reproducible.** Because the re-read is clean, any "fix" applied to the file could not be validated against the failing input anyway.

The correct posture: **render from the authoritative bytes (the disk path), validate anything derived, and report the upstream defect with evidence.** Never mutate the user's file to compensate for a corrupted copy of it.

---

## 4 - Defensive render chain for the SVG preview

Design goal: *a preview is either a correct rendering of the file, or an explicit, diagnosable error - never a silent broken image.*

### Level 1 - Disk bytes via the host asset route (preferred)

```
GET /dsh-file-trace/asset?path=<absolute path>   -> 200 + image/svg+xml, exact on-disk bytes
```

**Why first:** the host route is the only source that yields the file's *actual bytes*; it is the byte-level ground truth, immune to any text-assembly defect upstream (section 3). It also inherits the host's transport hygiene - for the comparable host media surface the skill records `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox; default-src 'none'` and an image byte cap. A plugin that serves media itself should mirror those headers and cap.

**Prerequisite, and a live trap:** the route must be able to serve `svg`. On the running host in this incident it answers 404 *"unsupported image type"* for `.svg`, because the host process predates the SVG whitelist (section 2). So Level 1 must **treat a 404 / unsupported-type answer as "this source is unavailable" and fall through** - it must never be read as "the file is broken". The operational fix for SVG support is a **host restart**; the plugin can detect and surface it.

### Level 2 - Session payload, but only after an XML well-formedness check

```js
function svgIsWellFormed(text) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) return { ok: false, reason: 'doctype/entity not allowed' }
  if (text.length > MAX_SVG_BYTES) return { ok: false, reason: 'payload exceeds cap' }
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  const err = doc.getElementsByTagName('parsererror')[0]   // XML parser surfaces a parsererror element
  if (err) return { ok: false, reason: (err.textContent || '').trim() || 'XML not well-formed' }
  if (!doc.documentElement || doc.documentElement.nodeName.toLowerCase() !== 'svg')
    return { ok: false, reason: 'root element is not <svg>' }
  return { ok: true, doc }
}
```

**Why second:** the payload is the only source available when the host route cannot serve the file (host not restarted, type not whitelisted, file outside any served scope). It is *usable only after validation*, because it is precisely the layer that produced the corrupted text. The validation must be a **real parse** (`DOMParser` with the `image/svg+xml` mime, a `parsererror` check, and a root-element check), not a regex - a regex would accept `stro0,1` as "looks like SVG" and reproduce the broken image. The DOCTYPE/ENTITY rejection is deliberate: browsers do not fetch external entities, but internal entity expansion is still a denial-of-service vector, and untrusted markup should not carry a DTD.

**Why the check must precede the render:** the failure this incident is about is invisible by construction - a malformed payload renders as a broken image with no error. Validation converts an invisible failure into a typed one.

### Level 3 - Sandboxed iframe fallback (last render)

If Levels 1-2 both fail but the payload still has usable content, render it inside a sandboxed frame:

```html
<iframe sandbox="" srcdoc="...escaped svg..."></iframe>   <!-- no allow-scripts -->
```

**Why an iframe at all:** a broken or hostile SVG must not escape into the host page's DOM (script execution, `onload` handlers, `<foreignObject>` with HTML, external references). A separate document with an opaque origin is the containment boundary.

**Why scripts blocked but SMIL still runs:** SVG's declarative animation (`<animate>`, `<animateTransform>`, `begin`/`repeatCount`) is *markup*, not script - it is driven by the SVG engine and keeps running when script execution is disabled. So `sandbox` **without** `allow-scripts` gives: no JavaScript execution, no `<script>`, no event handlers, while SMIL (and CSS animation) continue - the animation preview stays useful. Add an in-frame CSP (`default-src 'none'`) so the SVG cannot pull external resources; note this also blocks remote `@font-face` and remote images, which is the intended trade-off.

**Why it is the *last* fallback:** an iframe render of a payload that has already failed validation is rendering content known to be suspect. It is a degraded-but-contained view, not a success path - and it must be labelled as such.

### Level 4 - Explicit error state (never a silent broken image)

On failure, render a **visible, actionable error card**, not a broken `<img>` and not an empty box:

- which source was tried and in which order (asset route -> payload -> iframe);
- the concrete reason (HTTP 404 *"unsupported image type"* / XML parser message / byte cap exceeded / file unreadable);
- the remedy: **restart the host** so the SVG whitelist is live; re-read the file; open it externally; report the upstream payload corruption.

**Why this level is mandatory:** Levels 1-3 are best-effort, and something *will* fail in the field. Without an explicit state the user sees a broken image and infers "the plugin cannot render SVG", which sends the bug report to the wrong component. With it, the same event becomes a diagnosable report (*host not restarted* versus *upstream payload corruption*), and the log line turns an anecdote into evidence (section 5).

### The chain, in order and with its reasons

| # | Source | Gate to pass | Why this position |
|---|---|---|---|
| 1 | **Disk bytes** (host asset route) | route answers 200 + expected content-type | authoritative bytes; immune to payload defects; inherits host byte cap and security headers |
| 2 | **Session payload** | **XML well-formedness** (`DOMParser` + `parsererror` + root check + no DTD) + size cap | only source when the host cannot serve the type; must be validated because it is the layer that corrupts |
| 3 | **Sandboxed iframe** (`sandbox` without `allow-scripts`) | only after 1-2 fail; frame isolated, SMIL preserved | renders degraded content without giving it DOM or script access to the host page |
| 4 | **Explicit error state** | always available; carries reason and remedy | turns silent breakage into an attributable event |

Two cross-cutting rules: (a) **log which level served the render** - that single field is what makes the next report answerable; (b) **never mutate the traced file** to make a render succeed (section 3.4).

---

## 5 - Forensics method and the prevention checklist

### 5.1 Decoding the session log frame-by-frame

The session log is a **concatenated-Zstandard generation file** (`session.v4.jsonl.zstd` in the V4 generation per card DSH-0.1.7-A1-05; earlier generations are the v2 of card DSH-0.1.3-A1-06 and the V3 of card DSH-0.1.5-A1-01). Each generation is one zstd frame appended to the file; inside a frame the content is JSONL records (headers, tool calls, tool results, surface events).

**The trap, measured.** A whole-file decompress does *not* yield the whole log. I built a 3-generation concatenated file and ran `zlib.zstdDecompressSync(entireFile)`: it returned **only the first frame** (129 characters) and **silently dropped the later generations** - no error raised. A forensic pass that trusts the whole-file decompress would conclude "the later read result was clean" and miss the corruption entirely. Only the first frame is guaranteed to come back; frame-by-frame walking is the method.

**The method - walk the frames, then decompress each slice:**

1. Locate each frame by the zstd magic `0xFD2FB528` (bytes `28 B5 2F FD`).
2. Parse the **frame header**: the Frame_Header_Descriptor byte gives the Frame_Content_Size field size (bits 6-7: 0 -> 0 or 1 byte depending on single-segment, 1 -> 2 bytes, 2 -> 4, 3 -> 8), the single-segment bit (5), the checksum flag (bit 2), and the Dictionary_ID flag (bits 1-0 -> 0/1/2/4 bytes). Skip the Window_Descriptor when single-segment is 0.
3. Iterate the **block headers** (3 bytes little-endian: bit 0 = last block, bits 1-2 = block type, bits 3+ = block size) to find where the frame ends: raw -> `size` bytes, RLE -> 1 byte, compressed -> `size` bytes.
4. `zlib.zstdDecompressSync(frameSlice)` -> the frame's exact bytes; add the trailing 4 bytes if the checksum flag is set.
5. Split the decoded frame by newlines and parse each JSONL record; keep the byte offsets and the per-record text verbatim.

I implemented and ran this against a synthetic 3-generation file: it recovered **3 frames at offsets 0 / 115 / 384**, each with its exact stored text - including the corrupted read-result block and the clean re-read. Node's `zlib.zstdDecompressSync` (Node 22/24) does the decompression; only the *framing* must be done by hand for a concatenated file. A working copy of the walker is kept at `scratch/zstd-frames.mjs` beside the synthetic log `scratch/session.v4.jsonl.zstd` in the output directory.

**What that buys:** the **exact stored text**, byte-for-byte, with offsets - so you can (a) prove the persisted block differs from a fresh read, (b) diff it against the on-disk file to localise the damage to the exact line and column, (c) show that the *same* region re-read cleanly afterwards (non-determinism), and (d) attribute the fault to the persistence/assembly layer instead of to the plugin. That is the difference between "the picture was broken" and evidence.

**Two report rules that follow from it:** never print raw session logs wholesale (they carry session content) - quote the minimal region, cite the frame offset, and attach the XML verdict. And prefer the host's official read surface when the goal is merely to *read* history (card DSH-0.1.3-A1-06); raw artifact parsing is a forensics activity, not an integration path.

### 5.2 Prevention checklist - what this incident adds to the release checklist

| # | Check | Why (this incident) | Enforcement point |
|---|---|---|---|
| 1 | **Version bump BEFORE build** | the build froze `0.3.6`; the bump came a minute later | release script order: bump -> build -> test -> commit |
| 2 | **Grep the shipped bundle for the baked constant** (`PLUGIN_VERSION` in `lib/client.js` must equal `package.json`'s version and the tag) | this alone would have caught the phantom badge at 16:22, before any push | pre-commit / pre-tag CI gate, non-zero exit on mismatch |
| 3 | **Verify the update prompt's tag routing** names the same release tag | the badge and the prompt are the same release surface | same gate as #2 |
| 4 | **Per-mirror tag SHA verification** (`git ls-remote --tags` on *every* mirror; identical SHAs) | confirms transport, and would have surfaced the force-move | after push, and again after any force-move (itself a release incident) |
| 5 | **Commit the regenerated artifacts together with the version bump** | the stale artifact is exactly what got published | review checklist |
| 6 | **Restart the host and re-probe when the host half changed** (PNG 200 *and* SVG 200) | the SVG 404 was a stale host process, not a broken release | post-release verification; the client half's refresh proves nothing about the host half |
| 7 | **Report the upstream text-corruption bug - do not paper over it in the plugin** | the corruption is upstream, non-deterministic, and affects other users | file it with the decoded frame, the offsets, the XML verdict, the clean re-read, and the splice analysis (section 3.2). Keep *defensive validation* (Levels 1-4) - that is legitimate hardening - but never add a "repair" heuristic that silently rewrites user data |
| 8 | **Render from authoritative bytes; validate derived text** | the payload is a derived, lossy copy | the render-chain design in section 4 |
| 9 | **Log which render level served the preview** | turns the next "it was broken" report into an answerable event | client-side log line |

### 5.3 One-line summary per finding

1. **Phantom badge** = build-time constant frozen before the bump (build-then-bump ordering), not a mirror problem.
2. **Stale host route** = host-plane code is registered at boot; the running process predates the change; restart the host. "Hot update" covers the client plane only.
3. **Broken image** = upstream corruption of the model-visible read-result text; the disk file was well-formed; repair the pipeline, never the user's file.
4. **Render chain** = disk bytes -> validated payload -> sandboxed iframe -> explicit error state.
5. **Forensics** = concatenated-zstd frames decoded individually (a whole-file decompress silently returns only the first frame), plus the release checklist above.

---

## 6 - Explicitly unconfirmed (not guessed)

- **Which client-cache regime governs this session** - the skill's troubleshooting row says the client bundle is re-fetched per refresh; card DSH-0.1.7-A2-04 says bundles are cached at host boot from 0.1.7-alpha.2. The fixture shows the client half refreshed without a host restart; the host-version regime is not stated. The operative rule (host-plane changes need a host restart) is confirmed by the probes.
- **The exact upstream component that assembled the corrupted text.** The fixture identifies only "the result-text assembly, upstream of the plugin". A head/tail budget assembler is consistent with the observed splice shape but is **not** established by the fixture.
- **The precise source expression that produced the baked constant** (for example `import pkg from '../../package.json'`). The fixture states only that tsdown inlined it from `package.json` at build time.
- **The original (pre-force-move) SHA of tag v0.3.7.** `git-tags.txt` shows only the post-move SHA; the earlier one is not recoverable from the fixture.
- **The concrete host version** in the 2026-09-05 session; it is not in the fixture, and the installed host here is a different version and out of scope.
- **Which SVG file(s) were affected in the wild.** Only the one traced SVG appears in the evidence; the corruption is non-deterministic, so the blast radius is unknown.

---

## 7 - Read-only compliance

- `fixture/` was **not** modified: all 8 files were re-hashed with SHA-256 and compared against `fixture-seal.pre.json` -> **all 8 match**. `fixture-seal.source.json` is identical to the pre-run seal, so the fixture as delivered equals the fixture as sealed.
- No migration, install, publish, push, or network access was performed; no `dsh --version`, `dsh --dump-config`, or `cordis_inspect_*` probing was used.
- The only bundled script executed was the skill's own offline self-check `scripts/ghost-host-check.check.mjs` (exit 0).
- All scratch artefacts (a synthetic concatenated-zstd log and the frame walker used for section 5) live under `agent-output/S19-phantom-update-stale-host/scratch/`, inside the designated output directory. The skill, the evaluator, and the reference material were not modified.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.