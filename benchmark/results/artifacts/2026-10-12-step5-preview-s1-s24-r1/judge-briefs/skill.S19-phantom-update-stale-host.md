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
#### FILE: S19-phantom-update-stale-host/S19-phantom-update-stale-host.md

# S19 · Phantom Update, Stale Host Half, and Corrupted Payload

**Subject plugin**: `@dsh-external/dsh-file-trace` v0.3.7 / v0.3.8 (client-side file-trace plugin, host half + web-client half)
**Evidence pack** (read-only, unmodified): `…/S19-phantom-update-stale-host/fixture/`
**Report path**: `…/S19-phantom-update-stale-host/agent-output/S19-phantom-update-stale-host/S19-phantom-update-stale-host.md`
**Mode**: read-only diagnosis. No migration, no install, no host restart, no fixture writes. Skill reference consulted: `skills/plugin-upgrade/` (`migration-hygiene.md` §3, `pre-flight.md` §1.5, `ghost-host-check.mjs`, `examples/06-real-world-batch-migration.md` error 6 + the "baked version constant" note, `troubleshooting.md` rows for this task).

---

## 0. One-paragraph verdict

All three symptoms share a single root discipline: **a value was read from one plane and used to judge another plane.** The plugin compared a version constant that was baked into an artifact at *build time* against a tag list read live from the mirrors (phantom self-update); the browser judged a UI feature that had been re-fetched while the host route was still served from a module that had been registered *once, at boot* (404 SVG); and the renderer judged a file by a transcription of the file that had crossed a model-visible payload-assembly boundary (broken image). In each case the honest witness (mirror tag list, on-disk `lib/index.js`, the source XML file) was correct, and the stale/corrupted value was the one that had been *copied* into another plane. None of the three needed the fixture, the release, or the mirrors to be fixed — and the temptation in each case was to "repair" the wrong layer (force-move the tag, re-ship the whitelist, edit the traced SVG).

---

## 1. Phantom self-update: why the freshly released v0.3.7 advertises an update to itself

### 1.1 Where the compared constant comes from

The badge is produced by the self-update check inside the **shipped** client bundle, `lib/client.js`, quoted verbatim in `fixture/client-bundle-excerpt.js`:

```js
/** The running plugin version (from package.json at build time). */
export const PLUGIN_VERSION = "0.3.6";
// tsdown inlined this constant from package.json WHEN THE BUNDLE WAS BUILT —
// it is not read dynamically at runtime.

function newerTag(latestTag) {
  return latestTag !== undefined && compareSemver(latestTag, PLUGIN_VERSION) > 0
    ? latestTag
    : undefined;
}
// newerTag("v0.3.7") with PLUGIN_VERSION "0.3.6" -> "v0.3.7"  → badge shows
```

Two independent inputs feed the badge, and they are read from **different planes at different times**:

| Input | Source | When it is read |
|---|---|---|
| `PLUGIN_VERSION` (the "installed" version) | `package.json#version`, **inlined by tsdown into the bundle text** | **Build time** (16:22, step 3 of `release-log.md`) |
| `latestTag` | `git ls-remote --tags` on the three mirrors (`fixture/git-tags.txt:11` — "the self-update check fetches exactly these tags … and picks the highest vX.Y.Z") | **Runtime**, on every check |

`PLUGIN_VERSION` is *not* a dynamic read of `package.json` at runtime; it is a string literal frozen into the served JavaScript. Update the comment's point precisely: the comparison logic itself is correct. `compareSemver("v0.3.7", "0.3.6") > 0` is a true statement. The bug is that the left-hand operand is a stale copy.

### 1.2 The actual operation-order mistake

`fixture/release-log.md:1-10`, chronological:

1. 16:20 edit `src/client/markdown.tsx` (frontmatter fix) + regression tests
2. 16:21 `pnpm run typecheck` green; `npx vitest run` 104 passed
3. **16:22 `pnpm run build` — client bundle emitted ← the bundle was built here**
4. **16:23 bump `package.json` 0.3.6 → 0.3.7 ← the version moved *after* the build**
5. 16:23 README install refs → `#v0.3.7`
6. 16:24 `git commit` (includes the already-built `lib/client.js`) and `git tag v0.3.7`
7. 16:25 pushed `main` + tag to all three mirrors; `git ls-remote` verified the tag SHA on all three

The bundle that shipped in tag `v0.3.7` was produced from a working tree whose `package.json` still said `0.3.6`, so tsdown inlined `"0.3.6"`. The subsequent bump edited only the manifest — it did not re-run the build. The commit at 16:24 therefore contained a **self-inconsistent pair**: `package.json` says `0.3.8` eventually / `0.3.7` at tag time, while `lib/client.js` inside the same tag says `0.3.6`. This is precisely the "version constants are baked at build time" trap recorded in the skill's own field notes (`skills/plugin-upgrade/examples/06-real-world-batch-migration.md:212`).

Concretely, on a machine running the freshly released v0.3.7:
`PLUGIN_VERSION = "0.3.6"` ∧ `latestTag = "v0.3.7"` ⇒ badge "新版：v0.3.7 可用". The plugin is offering the user the version they are already running. It is *self-referential*, not off-by-one against a neighbour release.

### 1.3 Why mirror / tag integrity is irrelevant here

`fixture/git-tags.txt` shows the mirror state is not merely intact, it is **perfectly consistent**:

```
origin  748b5e56e41ca4dc22da1631569fb29d8ae0b99d  refs/tags/v0.3.7
public  748b5e56e41ca4dc22da1631569fb29d8ae0b99d  refs/tags/v0.3.7
omdsh   748b5e56e41ca4dc22da1631569fb29d8ae0b99d  refs/tags/v0.3.7
```

All three mirrors carry both tags at identical SHAs, and the badge logic is fed by exactly this listing. So the "latest version" input is the honest one: it correctly says `v0.3.7`. The error lives entirely on the other side of the `compareSemver` call, inside the artifact's own body. Nothing on the transport, CDN, mirror-lag or tag-SHA axis can produce or fix this symptom: verifying SHAs proves the mirrors agree with each other and with the repo, which they do. The badge is a *provenance* error (which build produced this artifact), not an *integrity* error (what bytes the mirrors hold). Conflating the two is what makes this bug feel like a mirror problem — it never was.

Note also the negative evidence: the badge does not point at `v0.3.8` (`d887deb0…`), which was shipped later in the same session. That pins the stale constant to the 0.3.7 build specifically, and rules out "leaked future tag" and "mirror ahead of repo" explanations outright.

### 1.4 Corrected release order

```
1. land source changes + tests
2. typecheck / tests                                 <- green
3. BUMP package.json 0.3.6 -> 0.3.7                  <- FIRST
4. update every version-bearing string that ships:
   README install refs (#v0.3.7), update-prompt tag routing
5. pnpm run build                                    <- bakes PLUGIN_VERSION = "0.3.7"
6. grep the SHIPPED artifact for the constant (see 1.5) and fail if stale
7. commit source AND final lib/ artifacts together
8. git tag v0.3.7
9. push main + tag to every mirror
10. per-mirror ls-remote SHA check
11. isolated-profile smoke: install the released tag, assert NO self-update badge
```

For v0.3.8 the maintainer already applied steps 3→5 in the corrected order (`release-log.md:15`: "the rebuild order was corrected for v0.3.8 (bump FIRST, then build)"), which is why v0.3.8 did not reproduce the phantom badge. The 0.3.7 tag itself was repairable only by amend + rebuild + force-move the tag on all three mirrors — the tag *content* was wrong, so no amount of re-pushing helped.

### 1.5 The check that would have caught the stale constant before pushing

**Grep the shipped bundle, not the manifest.** Between build and commit:

```sh
# what version did the build actually bake?
rg -n --no-heading 'PLUGIN_VERSION\s*=\s*"' lib/client.js
rg -n --no-heading '0\.3\.6' lib/client.js lib/index.js   # must be ZERO hits
```

Assert, as a hard gate, that the extracted constant equals `package.json#version` equals the tag about to be created:

```sh
baked=$(rg -oN 'PLUGIN_VERSION\s*=\s*"([^"]+)"' -r '$1' lib/client.js)
manifest=$(node -p "require('./package.json').version")
[ "$baked" = "$manifest" ] || { echo "STALE BUILD: artifact $baked != manifest $manifest"; exit 1; }
```

Three properties make this the right check:

1. It reads the **artifact**, which is the only thing the browser ever executes. Reading `package.json` at this point in a build-then-bump order green-lights the mistake by construction.
2. It is cheap and deterministic — one regex, no boot, no network.
3. It catches the whole *class*, including the sibling strings the skill's field note pairs with it: the update-prompt tag routing and the README install refs. The same grep pattern finds all of them.

Complement it with a **post-release smoke on a fresh isolated profile**: install the released tag, load it, and assert the drawer shows no update badge. A badge that names the running version is the runtime fingerprint of a stale build, and it is what a user sees first.

---

## 2. Client vs host plane: why the new UI reached the browser while the new host route still 404s

### 2.1 Where each half is loaded, and when

The plugin is dual-half. The two halves have completely different loading lives:

| | Client half `lib/client.js` | Host half `lib/index.js` |
|---|---|---|
| Executed by | the browser tab | the host Node process |
| Loaded | re-fetched over HTTP on each page load / hard refresh; re-evaluated in the page | **read from disk and `require`d once, at plugin apply / host boot** |
| A source/artifact edit takes effect after | browser hard refresh (page re-downloads the bundle) | **host process restart** |
| The asset route registration | — | runs once at apply time; the handler closure captures the `CONTENT_TYPES` object that existed **in memory at that instant** |

`fixture/release-log.md:21-27` states the decisive facts: the client half was confirmed refreshed (the new SVG render toggle was rendered by the browser), and **no host restart had been performed in this session**.

That is the whole asymmetry, stated plainly: the browser was **re-fetching** the client half while the host process was still **serving from the module body it had already executed**. Editing the file on disk, or pushing a new tag, does not re-execute a module inside a running Node process. Route registration is not a request-time lookup of a file — it is a one-time `ctx.webServer.register(...)` call whose handler closes over the whitelist.

### 2.2 What the probe results prove

`fixture/asset-route-probe.txt`, executed after the browser was confirmed refreshed, host not restarted:

```
$ GET /dsh-file-trace/asset?path=…daigo-final.png
< 200 OK
< content-type: image/png

$ GET /dsh-file-trace/asset?path=…daigo-bicycle.svg
< 404 Not Found
< "unsupported image type"
```

Read as a three-way discriminator (`host-plane-probes.md` discipline — classify by the *reply*, never by a version number):

- **PNG → 200, `image/png`** ⇒ the route exists, is mounted, is reachable, and is correctly reading files from disk. This kills "missing route", "plugin not installed", "path/URL-encoding problem", "route shadowed by another plugin".
- **SVG → 404 `"unsupported image type"`** ⇒ the request reached a live handler that took the whitelist-rejection branch. The string is the *rejection path's* message, not a router's "no such route". This kills "the SVG feature was never shipped" and "the release is broken".
- **The installed tree's `lib/index.js` at that moment contains `svg: 'image/svg+xml'`** (`fixture/lib-index-excerpt.js:12`, verbatim) ⇒ the *disk* copy of the host half has the new whitelist entry.

Disk says new, wire says old, and the route is alive. The only place left for the old whitelist to be living is **the running host process's memory**. Attribution: staleness in the **RUNNING HOST PROCESS**, not in the release, not in the install, not in the probe. This is the same identification the skill's ghost-host check performs (`scripts/ghost-host-check.mjs`, "an already-running host keeps executing the old code from memory while … on disk report the new version"), here applied to a plugin's host half rather than the host's own corridor generation.

Corroboration from the log itself: `release-log.md:26` — "a host restart had NOT been performed in this session (the client half was confirmed refreshed)". The absence of the restart is the causal hole, and the probe triple is its fingerprint.

### 2.3 What makes a host-plane change effective

A **full host process restart** — completely stop the dsh host, then start it again, so that:

1. `lib/index.js` is read from disk fresh;
2. the asset route is registered anew;
3. the new handler closes over a `CONTENT_TYPES` map that now contains `svg: 'image/svg+xml'`.

Then re-probe **both** extensions and expect `PNG → 200 image/png` and `SVG → 200 image/svg+xml`. Only the second probe proves the restart landed; the first would still have passed before it.

### 2.4 Why this is the one case where the usual "plugins hot-update" rule does not hold

The informal rule — "plugins hot-update, so a refresh is enough" — holds for the **client plane** (the browser re-downloads and re-evaluates the bundle) and for config/`cordis.patch.yml`-level edits (which the loader reloads). It does **not** hold here, for three compounding reasons:

1. **A running process cannot re-execute an already-executed module body.** HMR re-runs *client* entry code in a fresh page/eval context. The host half's route registration happened once, inside a closure, in a process that has no mechanism to re-run it. There is no host-plane "reload this route" path — the registration is the entry point.
2. **The two halves of the same plugin therefore lag by different amounts.** The client half's freshness is observable in the UI (a new toggle proves it) — which is exactly what makes this bug so easy to misdiagnose in the *other* direction ("the feature shipped, so the 404 must be a code bug / an upstream bug / a routing bug"). The new toggle is evidence about the client plane only, and says nothing about the host plane.
3. **The client plane's "refresh picks it up" property is itself generation-dependent.** From 0.1.7-alpha.2 on, client plugin bundles are read and cached **at host boot** (`skills/plugin-upgrade/references/v0.1.7-alpha.2.md` DSH-0.1.7-A2-04): editing a served `lib/client.js` no longer takes effect on page refresh alone, and an open page can keep working across a restart on pre-restart bytes while auto-reconnecting. So "hot update" is not even universally true of the client half. The only plane-independent, generation-independent rule is: **restart the host, then verify the served bytes / the route reply — not that the page responds.**

Practical consequence for this incident: the correct fix was one host restart plus a two-probe re-check. **Not** a rebuild, **not** a tag force-move, **not** a client-side workaround that fetches the SVG through some other path, and **not** blaming the upstream whitelist edit.

---

## 3. Broken-image attribution: the payload, not the file

### 3.1 The three observations, and what each one rules out

From `fixture/session-log-excerpt.txt`:

| Observation | Rules out |
|---|---|
| **Source file is well-formed XML** ("System.Xml XmlDocument load: no error") | the file is not the problem; nothing needs editing |
| **Log payload is NOT well-formed** — "error on line 233 at column 54: `Specification mandates value for attribute stro0`" | the renderer is not receiving valid XML |
| **A re-read of the same region came back clean (non-deterministic)** | the corruption is not a property of the file; a corrupted file cannot re-read itself clean |

Plus the decisive fourth: "the read tool's **TYPE result** delivered to the caller was clean; the corrupted text is the **model-visible result block persisted into the session log**."

The tool (the read tool's actual return value) was correct. What got corrupted is the **result text as assembled and persisted into the session log** — the copy that later travels to the plugin as rendering input. That is a layer *above* the file and *above* the plugin: the session-payload / result-text assembly inside the harness, upstream of the plugin.

### 3.2 The shape of the corruption confirms the layer

```
payload line 232 = source line 232 (prefix, up to `stroke="#dde6ea" stro`)
                  + source line 247's tail (from `0 0,1 821,730` onward)
```
Source lines 233–247 are **absent**; the splice lands on the shared prefix `"stro"` (`stroke-width="6.5"` vs the arc flags `0 0,1` of line 247's `d="M 587,730 A 122,122 0 0,1 821,730"`).

A mid-file line fused to a distant line's tail across a **shared prefix**, with a contiguous block of lines dropped, is a *block/chunk reassembly* signature — two offsets into the same content got merged at the point where their byte content coincided. It is not a truncation (the payload is not short), not an encoding fault (the bytes are ASCII-clean), not a partial write (the source file is complete and the payload is not a prefix of it). It is a copy/assembly error inside the payload pipeline, i.e. the same family as the chunk/prefix-assembly surfaces the persistence layers own. It is **non-deterministic** — which is the strongest single clue: it means the corruption is produced by the pipeline, not stored in the data.

Attribution chain, three legs:

1. **Plugin negative scan**: the plugin only *reads* session content and renders it; it writes nothing into the payload, and its own code path (host asset route → bytes → render) never goes through the session text at all. Zero plugin hits.
2. **The producer that *was* clean**: the read tool's TYPE result. The authoritative channel delivered correct bytes.
3. **The corrupted artifact**: the model-visible result block stored in the session log — a *transcription* of that result, produced by result-text assembly, one layer up.

Therefore: **the broken image was caused by upstream session-payload corruption, rendered as if it were file content.** Not by the SVG file, not by the host whitelist (that produced the separate 404 symptom of §2), not by the browser's SVG rasterizer.

### 3.3 Why the plugin must treat the session payload as untrusted rendering input

The session payload is a **transcription**, not a byte channel. It has crossed a model-visible assembly boundary where it can be (and demonstrably was) truncated, spliced, or merged — non-deterministically. Consequences the plugin must design for:

- Any property the file has (well-formedness, completeness, byte identity) is **not** a property the payload inherits.
- A corrupted payload fed straight into a renderer fails *inside the renderer* and surfaces to the user as a broken image with **no attributable cause** — which is exactly how this incident acquired two wrong suspects (the traced file, the whitelist edit) before landing on the real one.
- "Untrusted" means, concretely: **validate before use**, **prefer the authoritative channel when one exists**, and **fail loudly with a stated reason** rather than rendering opportunistically. The disk-bytes asset route *is* the authoritative channel for this plugin's own data (§4, L1). The payload is a fallback that must earn its way in through a well-formedness gate.

### 3.4 Why editing or "repairing" the traced file would have been the wrong move

1. **It would have destroyed the only clean evidence.** The source file's well-formedness *is* the control that localizes the fault upstream. The moment it is edited, the three-legged attribution collapses and the incident becomes permanently unexplainable — the exact opposite of the forensics the session log was decoded to provide.
2. **There was nothing to repair.** The file parsed cleanly; it was already correct. "Repairing" it could only have meant bending the ground truth to match a corrupted copy.
3. **It does not fix the render path.** The corruption is not reproducible in the file and is non-deterministic; the next payload can splice at a different prefix. Editing the file changes nothing about the next failure.
4. **It is the wrong plane.** Patching user/traced data to paper over a harness assembly bug hides an upstream defect that affects every consumer of session payloads — and silently mutates an artifact other tooling may depend on.
5. **The correct action set** was: leave the file untouched; re-read from the authoritative source; render with validation; and **file the upstream bug** with the decoded session-log evidence (§5). Downstream *defense* is legitimate — §4 — but defense must not be disguised as a data fix.

---

## 4. Defensive render chain for an SVG preview

Four levels, in this order, with the failure of each level explicit and visible.

### L0 · Resolve identity first

Before any fetch, resolve the file to a stable identity: canonical absolute path + size + mtime (or a content hash). This makes the levels comparable and lets the error state name the exact source it failed on. Never derive identity from the payload.

### L1 · Disk bytes via the host asset route — primary

`GET /dsh-file-trace/asset?path=<encoded path>` → serve the original bytes with the declared content type.

- **Why first**: it is the **authoritative, byte-exact** channel. The file is read from disk by the host and returned as bytes; there is no text assembly, no model-visible transcription, no truncation boundary in between. It cannot carry the §3 splice.
- **Why it is also the level that was broken**: this route currently 404s for `.svg` because of the stale in-memory whitelist (§2) — so L1 requires the **host restart** to become available for SVG at all. This is the level the incident actually gated on: with L1 dead for SVG, the renderer fell through to the payload, which is where the corruption was waiting. A healthy render chain and a healthy host plane are the same fix.
- **Failure** → go to L2, and record in the error state that the disk route failed (with status + reason), because that is actionable (restart the host) rather than cosmetic.

### L2 · Session payload, but only after an XML well-formedness check

```
const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
const bad  = doc.getElementsByTagName('parsererror').length > 0
            || doc.documentElement.nodeName === 'parsererror'
            || doc.documentElement.namespaceURI !== 'http://www.w3.org/2000/svg'
            || doc.documentElement.nodeName !== 'svg'
```
- **Why**: the payload is the one input known (in this incident, empirically) to be corrupt. The check is a microsecond regex-class validation that converts a *silent* broken image into a *caught* boundary violation. It rejects exactly the §3 payload (`Specification mandates value for attribute stro0` ⇒ `parsererror`).
- **Why no "repair"**: never re-assemble a payload against the file to make it parse — that is §3.4 with extra steps. Reject and fall through.
- **Secondary checks worth adding**: reject `<!DOCTYPE` / external entity declarations, reject `<foreignObject>`, and cap payload size. If the payload fails, say so in the error state — "会话记录中的副本已损坏（XML 校验未通过）" is a *diagnosis*, and it is the report the upstream bug needs.

### L3 · Sandboxed iframe as the last render fallback

Only if L1 and L2 both fail, and only for already-validated SVG:

```html
<iframe sandbox="" srcdoc="…validated svg…" referrerpolicy="no-referrer"></iframe>
```

- **Why last**: it costs a nested browsing context, complicates sizing/theming, and must never be the first path — but it is the right *last* path because a document that merely *parses* can still carry `externalResourceReferences` (`<image href>`, `<use xlink:href>`), CSS, `<foreignObject>`, and `<script>`.
- **Why it still works for this feature**: SMIL animation is **declarative markup** (`<animate>`, `<animateTransform>`), not script. A sandbox without `allow-scripts` blocks `<script>` and script-bearing `on*` handlers while SMIL keeps running. So the animated preview survives the security boundary.
- **Sandbox rules**: omit `allow-scripts`, omit `allow-same-origin` (an opaque origin; combining it with `allow-scripts` would let the frame reach the parent origin), omit `allow-top-navigation`, `allow-forms`, `allow-popups`. Use `srcdoc` or a `blob:` URL, `referrerpolicy="no-referrer"`.

### L4 · Explicit error state instead of a silent broken image

Always present, always specific. Render a visible panel — never a bare `<img>` with a failed src — carrying:

- which level failed and why (route status and body; `parsererror` message and the offending column);
- what the plugin already tried (L1 disk route, L2 payload);
- the next action (`重新读取`; and when L1 404'd, the hint that the host plane needs a restart — which is the single most useful sentence this incident could have shown a user);
- the file identity from L0.

**Why this matters most of all**: a silent broken image is *unattributable* — it is precisely what produced the two misdiagnoses in this incident (blame the traced file; blame the whitelist edit). An explicit error state converts each failure into a named, reportable layer, keeps the upstream bug visible instead of masked, and makes the "which plane is stale?" question answerable from the UI.

### What the chain never does

- never render a payload that has not passed L2's parse;
- never splice/repair payload content from disk to force a render;
- never cache a rejected payload for display;
- never let L3 run before L1 has actually been attempted and reported as unavailable.

---

## 5. Forensics method + prevention

### 5.1 Decoding the concatenated-zstandard session log, frame by frame

The session log is a **concatenated zstd generation file**: a sequence of independent zstd frames appended one after another (one per append/generation), decompressing to the JSONL session records. Consequences and method:

1. **Copy first, never decode in place.** Keep the source artifact unchanged — the same fail-closed discipline the session migrator follows ("the source v0 artifact remains unchanged"). Every forensic step works on the copy.
2. **Do not feed the whole file to a one-shot decoder.** A single-stream decode silently stops at the first frame and reports "success" on a fraction of the log. Scan frame boundaries explicitly:
   - locate every zstd frame magic `28 B5 2F FD` (little-endian) in the file, recording each offset;
   - slice `[offset_i, offset_{i+1})` and decompress each frame independently;
   - tooling: Python `zstandard` (`ZstdDecompressor().stream_reader(..., read_across_frames=True)` — and cross-check by per-frame slicing so a boundary landing mid-record is *visible* rather than merged), or the `zstd` CLI per slice.
3. **Reassemble records, keep ordering.** Each frame yields JSONL lines of the envelope shape `{"type":…,"seq":…,"data":{…}}`. Rebuild the sequence by `seq`, and record the exact record (type + seq + byte offset) that carries the tool-result text block.
4. **Extract the stored text verbatim** — no trimming, no re-wrapping. Record: line count, byte count, and a hash.
5. **Compare three sources and record all three verdicts**: (a) the stored payload text, (b) the on-disk source file bytes, (c) a fresh live re-read. Then run the well-formedness check on each with two independent parsers (System.Xml on Windows, DOMParser in the browser). This is what produced the §3 evidence: the 15-line loss, the splice at the shared prefix `"stro"`, the `stro0` parse error at line 233 col 54, and the clean re-read.

That is the difference between an anecdote and evidence: a **reproducible diff** with byte offsets, hashes, seq numbers, and two independent parser verdicts. The same "attribute before touching, classify by the reply" discipline the skill applies to host-plane probes.

### 5.2 Release-checklist items this incident adds

1. **Version-bump-before-build (hard ordering).** Bump `package.json` and every version-bearing shipping string (README install refs, update-prompt tag routing) **before** `pnpm run build`. Then commit source **and** the final `lib/` artifacts together, then tag, then push. Building first and bumping after ships a tag whose manifest and artifact disagree — which is unrecoverable without amending the tag on every mirror.
2. **Grep the shipped bundle for the baked constant before pushing.** `rg -n 'PLUGIN_VERSION\s*=\s*"|0\.3\.6' lib/` must show the new version and zero stale hits; assert artifact constant == `package.json#version` == the tag being created. Make it a CI gate, not a habit. (This is the check §1.5 would have run at 16:24, before the tag.)
3. **Per-mirror tag SHA verification after every push** (already performed correctly here — keep it): `git ls-remote --tags` on each of origin / public / omdsh, assert the tag SHA matches local and that every tag referenced by docs exists on every mirror. **And record its scope honestly**: this is an integrity gate over the mirrors. It cannot detect a stale baked constant, and passing it must never be read as "the release is verified".
4. **Report the upstream text-corruption bug, do not paper over it in the plugin.** File it with the decoded forensics from §5.1: frame offsets, record seq, the stored text, the source text, the splice shape, both parser verdicts, and the non-determinism evidence. Downstream *defense* (the §4 chain) is the legitimate plugin response; misrepresenting a corrupted payload as file content, or "repairing" the traced file, is not.
5. **Post-release host-plane re-probe (new).** Any release touching `lib/index.js` — a new route, a new content type, an auth change — is not verified until the host has been restarted and **both** an old and a new request have been probed against the running process. Declare the plane on the release record ("client half only / host half too") so the verification action (hard refresh vs host restart) is decided up front rather than discovered from a 404.
6. **Self-update smoke on a fresh isolated profile install of the released tag.** Assert the drawer shows no update badge naming the running version. A badge that names the version you just installed is the runtime fingerprint of a stale build.

---

## 6. Summary table

| # | Symptom | Layer actually at fault | What it was NOT | Correct action |
|---|---|---|---|---|
| 1 | v0.3.7 badge advertises v0.3.7 | **build-time**-inlined `PLUGIN_VERSION = "0.3.6"` + build-then-bump order | mirror integrity, tag SHA, semver logic, leaked tag | bump → build → grep artifact → commit artifact → tag → push → smoke |
| 2 | SVG toggle visible, SVG route 404, PNG 200, disk whitelist has `svg` | **running host process** still executing the old `lib/index.js`; route closure holds old `CONTENT_TYPES` | the release, the install, the whitelist edit, the route, the browser | full host restart, then re-probe PNG **and** SVG |
| 3 | Broken image for a well-formed SVG | **upstream session-payload text assembly** (15 lines lost, splice at shared prefix `"stro"`), non-deterministic | the traced file, the host whitelist, the renderer | treat payload as untrusted: disk bytes → parse-gate payload → sandboxed iframe → explicit error; file the upstream bug with the decoded log |

**Cross-cutting rule**: in all three cases the correct plane's evidence was present and correct on disk (manifest/tag, `lib/index.js`, source XML). The defect was always introduced by *copying* a value across a plane boundary without re-validating it there — a version constant baked into an artifact, a whitelist frozen into a closure, a file text transcribed into a session payload. Diagnose by probing the plane that actually executes, never by reading the plane that only stores.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.