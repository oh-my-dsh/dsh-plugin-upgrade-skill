# JUDGE BRIEF · noskill.S19-phantom-update-stale-host

## Criteria (sealed rubric)
- [baked-version-release-order] (20pt) Compare release-log.md and client-bundle-excerpt.js: build preceded the bump, baking 0.3.6 into the shipped v0.3.7 client, so a newer-tag comparison reports an update to itself despite correct mirrored tags. Explain that package.json is not reread at runtime. Bump before build, inspect the emitted version constant before commit/tag/distribution, and retain mirror verification; do not confuse v0.3.8’s later manifest with the earlier build.
- [client-host-update-asymmetry] (20pt) Use asset-route-probe.txt and lib-index-excerpt.js: the refreshed client shows the toggle, PNG 200 proves the route exists, SVG 404 unsupported-type shows its running whitelist is old while disk already permits SVG. This linked install needs the host restarted to reload its boot/apply-time handler; client refresh does not replace that closure. Keep the conclusion specific to this host lifecycle, not every possible plugin hot-reload mechanism.
- [payload-corruption-attribution] (20pt) Use session-log-excerpt.txt’s clean source/XML and typed read result versus spliced persisted model-visible text and clean reread to locate corruption in upstream result-text assembly. The plugin consumes the damaged copy; the traced disk file is innocent. Treat the payload as untrusted input and do not “repair” the good SVG. No identification of an unseen internal function is required.
- [validated-render-fallbacks] (20pt) Design and justify the ordered chain: authoritative disk bytes via the asset route; session payload only after XML well-formedness validation (DOMParser/parsererror or equivalent); a sandboxed iframe fallback with scripts blocked while permitting SMIL; an explicit error if content/validation/rendering fails. Validation failure must not pass the same malformed payload unchecked to the iframe. Equivalent implementation details are accepted; this is a plan, not an executed security test.
- [forensics-and-prevention] (20pt) Explain decoding all concatenated Zstandard frames, preserving order and reconstructing the JSONL event containing the exact stored splice, then comparing that text with the source and reporting the upstream bug. A decoder that handles concatenated frames directly is equivalent to a manual frame loop; do not require magic-byte constants. Checklist: bump before build, verify the shipped constant and per-mirror tag SHA, and use plane-specific runtime probes. No actual log decode or upstream posting is required.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [contradictory-release-render-advice] ceiling=0 The final advice says bump-after-build is acceptable, mirror repush alone repairs the baked constant, browser refresh updates this host route without restart, or the clean traced SVG should be edited. Rendering the session payload without XML validation or allowing scripts in the fallback also triggers this cap. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.

## Candidate report(s)
#### FILE: S19-phantom-update-stale-host/S19-report.md

# S19 — The Phantom Update, the Stale Host Half, and the Corrupted Payload
## Root-cause analysis & defensive-design report
(All facts cited from the read-only evidence pack in `fixture/`; fixture untouched.)

---

## 1. Phantom self-update: root cause

**Symptom.** The just-released v0.3.7 client shows its own update badge
"新版本 v0.3.7 可用" — it announces an update to itself — even though all three
mirrors (origin / public / omdsh) serve the new bundle and the v0.3.7 tag SHA
(`748b5e5…`) was verified identical on every mirror (`git-tags.txt`).

**Where the compared constant comes from — build time, not runtime.**
The shipped `lib/client.js` contains (`client-bundle-excerpt.js`):

```js
/** The running plugin version (from package.json at build time). */
export const PLUGIN_VERSION = "0.3.6";
```

tsdown **inlines** the version from `package.json` **when the bundle is built**.
It is a baked-in string literal; nothing re-reads `package.json` at runtime. The
self-update check fetches the mirror tags via `git ls-remote --tags`, picks the
highest `vX.Y.Z`, and calls `compareSemver(latestTag, PLUGIN_VERSION)`. With
`PLUGIN_VERSION === "0.3.6"` and the newest tag `v0.3.7`, `newerTag("v0.3.7")`
returns the tag — the badge fires on the v0.3.7 bundle itself.

**The actual operation-order mistake** (`release-log.md`):

1. 16:22 `pnpm run build` — bundle emitted **while package.json still said 0.3.6**
   → the constant `"0.3.6"` was baked in;
2. 16:23 `package.json` bumped 0.3.6 → 0.3.7 **after the build**;
3. 16:24 the commit **included the already-built, stale `lib/client.js`**, tagged
   `v0.3.7`;
4. 16:25 pushed `main` + tag to all three mirrors.

So the tag named v0.3.7 shipped a bundle that believed it was v0.3.6. Classic
**bump-after-build** inversion.

**Why mirror/tag integrity is irrelevant.** Every mirror serves byte-identical,
SHA-verified artifacts — the wrong constant is *inside the verified bytes*. The
integrity checks prove "everyone got the same file", not "the file's baked version
equals its tag". A perfectly verified, perfectly replicated stale constant is still
stale. The bug is upstream of distribution, at build content.

**Corrected release order** (as adopted for v0.3.8):

1. edit code, typecheck, test;
2. **bump `package.json` version FIRST** (0.3.6 → 0.3.7);
3. **then `pnpm run build`** so the bundler inlines the new version;
4. commit source **and** rebuilt `lib/`, tag, push mirrors;
5. verify tag SHAs per mirror.

**The check that would have caught it before pushing** — a post-build / pre-push
gate:

```bash
# assert the shipped bundle's baked constant equals the manifest version
node -e 'const v=require("./package.json").version;
  const s=require("fs").readFileSync("lib/client.js","utf8");
  if(!s.includes(`PLUGIN_VERSION = "${v}"`))
    { console.error("stale PLUGIN_VERSION in bundle"); process.exit(1); }'
```

i.e. grep the emitted bundle for the baked `PLUGIN_VERSION` constant and compare
it against `package.json` (and, at tag time, against the tag name). A one-line CI
step turns this from a phantom-badge incident into a failed build.

---

## 2. Client-plane vs host-plane update asymmetry

**Symptom.** v0.3.8's SVG render toggle **does** appear in the browser (client
refreshed), but Render fails: the host asset route answers **404 "unsupported
image type"** for `.svg` while a **PNG probe returns 200** — and the shipped,
on-disk `lib/index.js` **does** whitelist `svg: 'image/svg+xml'`
(`asset-route-probe.txt`, `lib-index-excerpt.js`).

**Where each half lives and when it loads.**

- **Client half** (`lib/client.js` — the UI bundle): fetched by the browser. On
  reload/refetch the browser pulls the *current file from disk*, so after the
  v0.3.8 push the new toggle renders immediately. The client plane is refresh-
  driven: every page load re-reads the shipped bundle.
- **Host half** (`lib/index.js` — the Node/host plugin): loaded and **evaluated
  once at host boot**; its HTTP routes (here `GET /dsh-file-trace/asset`) are
  **registered at that boot**, capturing the route table — including the
  `CONTENT_TYPES` extension whitelist — in the running process's memory. Editing
  or replacing `lib/index.js` on disk afterwards changes nothing in the live
  process.

**How the probes pin the staleness to the RUNNING host process, not the release.**

- PNG → `200 image/png`: the route handler is alive and serving; this is not a
  missing route, a dead host, or a bad install.
- SVG → `404 "unsupported image type"`: the *whitelist check inside the running
  handler* rejects `svg`. The running process's `CONTENT_TYPES` predates the svg
  entry.
- Disk `lib/index.js` contains `svg: 'image/svg+xml'`: the release is correct;
  the bytes on disk are right.

The only consistent explanation: the host process was **booted before the svg
whitelist change** and never restarted (`release-log.md` confirms: "a host
restart had NOT been performed in this session"). The route table in memory is
stale; the disk copy is fresh. Staleness is attributed to the **running host
process**, full stop.

**What makes a host-plane change effective.** A host restart (or an explicit host-
side plugin reload that tears down and re-registers routes) — anything that
re-evaluates `lib/index.js` in the host process. This is precisely the **one case
where the usual "plugins hot-update" rule does not hold**: hot-update applies to
the browser-delivered client bundle (refetch on reload); host-side route
registration is a boot-time side effect, and no amount of browser refreshing
re-registers a route inside an already-running Node process. Client refreshes;
host restarts.

---

## 3. Broken-image attribution: the corruption is upstream of the plugin

**Evidence** (`session-log-excerpt.txt`):

- The source SVG on disk is **well-formed XML** (XmlDocument load: no error), and
  a **re-read** of the same region comes back **clean** (non-deterministic
  failure).
- The session log's stored read-result text is **spliced**: payload line 232 =
  source line 232 up to the shared prefix `…stroke="#dde6ea" stro`, then jumps
  into source **line 247's tail** (`0 0,1 821,730" …`). Source lines 233–247 are
  absent from the payload. Verdict on the payload: NOT well-formed —
  `"error on line 233 at column 54: Specification mandates value for attribute stro0"`.

**Where the corruption happened.** Not on disk (file well-formed), not in the read
tool's typed result (that was clean per the excerpt), not in the SVG renderer.
The corruption lives in the **model-visible result-text block persisted into the
session log** — i.e. in the **result-text assembly/serialization layer upstream of
the plugin**, at a shared-prefix splice (`"stro"` of `stroke-width` vs `"0 0,1"`
arc flags of line 247). The plugin merely consumed a payload that was already
damaged when it arrived.

**Why the plugin must treat the session payload as untrusted rendering input.**
The payload crosses component boundaries (tool → transcript assembly → log →
plugin). Any layer can truncate, splice, re-encode, or ellipsize it — as this
incident proves, non-deterministically. Input that is *usually* clean but
*occasionally* corrupted is exactly the definition of untrusted input: it must be
validated before use, never assumed well-formed.

**Why editing or "repairing" the traced file would have been the wrong move.**
The file on disk was never broken. Editing it would (a) destroy the pristine
evidence that exonerates the file and localizes the fault upstream, (b) introduce
real, user-visible damage to a healthy artifact, (c) paper over an upstream bug
that will recur non-deterministically for other files and other users, and
(d) misdirect the fix: no change to the traced file can prevent the next payload-
assembly splice. The correct response is to harden the consumer (validate before
rendering — section 4) and **report the upstream text-corruption bug** with the
forensic evidence (section 5).

---

## 4. Defensive render chain for SVG preview

Render-source order, strongest source first, each level gated:

**Level 1 — Disk-bytes asset route (primary).**
Fetch the SVG through the host asset route (`GET /…/asset?path=…`) which streams
**bytes straight from disk** with `content-type: image/svg+xml`. Justification:
disk bytes are the authoritative artifact — the file the user actually has. They
bypass every transcript/payload layer that can splice or truncate text. (This
level is also why the stale host route of section 2 must be fixed by restart: the
defense-in-depth chain is only as strong as its primary source.) If the route
404s or returns a non-SVG type, fall through — do not silently substitute.

**Level 2 — Session payload, only after XML well-formedness validation.**
If the asset route is unavailable, the session payload may be used **only after**
parsing it with `DOMParser` (`new DOMParser().parseFromString(text, "image/svg+xml")`)
and rejecting it when the result contains a `parsererror` element. Justification:
the payload is proven untrusted (section 3). A `parsererror` check would have
caught this incident's splice (`attribute stro0` lacks a value) *before* render,
converting a silent broken image into an explicit, diagnosable state. Validation
also blocks malformed XML from ever reaching an XML parser in a rendering context.

**Level 3 — Sandboxed iframe as the last render fallback.**
Whatever SVG source survives validation is rendered inside a sandboxed iframe —
`sandbox` **without** `allow-scripts`: scripts are blocked (SVG can carry
`<script>` and event-handler attributes), while declarative content —
including **SMIL animations** — still runs, preserving legitimate animated SVGs.
Justification: even well-formed SVG is active content; the sandbox gives
script-blocking and origin isolation without breaking SMIL, unlike blunt
`<img>`-tag rendering (which blocks scripts too, but loses interactivity/
animation nuance and offers no error surface) or unsandboxed innerHTML injection
(full script execution of untrusted markup).

**Level 4 — Explicit error state, never a silent broken image.**
If all sources fail (asset 404, payload fails `parsererror`), render a visible
error panel: which source failed, the parser diagnostic (line/column), and the
suggested remedy (restart host / re-read file). Justification: a silent broken
image made this incident look like a renderer bug and wasted a debugging cycle;
an explicit error surfaces the *attribution* (payload invalid vs route missing)
directly in the UI, which is the difference between an anecdote and a diagnosis.

Each level exists because the level above can fail for an *independent* reason:
disk bytes (route staleness), payload (upstream corruption), parse (active/malformed
content), display (silent failure). Ordering strongest-first and validating at each
gate means no single layer's failure becomes invisible corruption.

---

## 5. Forensics method + prevention

**Session-log forensics (concatenated-Zstandard generation file).**
The session log is a sequence of independently compressed **zstd frames**
concatenated in one file. To recover exact stored text frame-by-frame:

1. Walk the file locating each frame by its magic number `28 B5 2F FD` (little-
   endian `0xFD2FB528`); a frame header also encodes its content size, so frames
   can be sliced without guessing.
2. Decompress each slice **independently** — `zstd -d` per frame, or in Python:

```python
import zstandard as zstd
dctx = zstd.ZstdDecompressor()
# loop over frame slices: dctx.decompressobj().decompress(chunk) per frame
```

   `zstd -dc file` also handles concatenated frames, but **frame-by-frame**
   decoding is what preserves record boundaries and localizes *which generation*
   (which tool result) holds the spliced text.
3. Diff each decoded read-result block against the on-disk file region (as done in
   `session-log-excerpt.txt`): the shared-prefix splice ("stro" → "0 0,1"),
   the missing lines 233–247, and the XML parser verdict together turn "the image
   looked broken" into **evidence**: the corruption exists in the *stored payload
   text*, not in the file, not in the renderer.
4. Confirm non-determinism (re-read is clean) to rule out a deterministic encoder
   bug and to prove the file was never at fault.

This method generalizes: any session artifact can be audited by decoding frames
and diffing payload text against source bytes.

**Release-checklist items this incident adds:**

1. **Version-bump-before-build** — bump `package.json` *first*, then build, so
   bundler-inlined constants (`PLUGIN_VERSION`) can never lag the tag. Enforce as
   a scripted release command, not a remembered order.
2. **Grep the shipped bundle for the baked constant** — pre-push gate asserting
   `PLUGIN_VERSION` in `lib/client.js` equals `package.json`'s version (and the
   tag being pushed); fail the push on mismatch. (Section 1's one-liner.)
3. **Per-mirror tag SHA verification** — keep the existing
   `git ls-remote --tags` check across origin/public/omdsh: it caught nothing here
   because the bug was inside the bytes, but it remains the guard against mirror
   skew and partial pushes; both checks are needed, neither substitutes for the
   other.
4. **Report upstream text-corruption bugs instead of papering over them** — when
   forensics localizes corruption to the result-text assembly layer (as here),
   file the upstream bug with the frame-decoded evidence; the plugin's job is to
   *validate and degrade gracefully* (section 4), never to silently "repair" user
   files or hide the failure.

---

## Summary of attributions

| Symptom | Layer at fault | Fix |
|---|---|---|
| v0.3.7 announces update to itself | Build-time `PLUGIN_VERSION` baked stale (bump-after-build) | bump→build order; bundle-grep pre-push gate |
| SVG asset 404 while PNG 200, disk lib whitelists svg | **Running host process** booted before whitelist change; routes registered at boot | host restart; host-plane changes are never hot |
| Broken image for one traced SVG | Upstream session-payload text assembly (splice at shared prefix); file well-formed | validate payload (DOMParser/parsererror); report upstream bug; never edit the traced file |


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.