# S19 — The Phantom Update, the Stale Host Half, and the Corrupted Payload

**Plugin:** `@dsh-external/dsh-file-trace` · **Versions:** v0.3.7 / v0.3.8
**Evidence pack:** `fixture/` (read-only) · **Report dir:** `agent-output/S19-phantom-update-stale-host/`

This report attributes three independent failures — a self-referential update badge,
a host-route 404 that coexists with a correct disk artifact, and a broken SVG render —
to three distinct root causes, then specifies a defensive render chain and the release
checklist that closes each gap.

---

## 1. Phantom self-update root cause

**Where the compared version constant comes from — build time, not runtime.**
The self-update check compares its own version against the newest mirror tag. That
"own version" is `PLUGIN_VERSION`, an `export const` that tsdown **inlined from
`package.json` when the bundle was built** (`lib/client.js`). It is *not* read from
`package.json` at runtime; the shipped bundle literally contains the frozen string
`export const PLUGIN_VERSION = "0.3.6";`.

**The actual operation-order mistake.**
The release log shows the order was wrong:

1. 16:22 — `pnpm run build` (bundle emitted **here**)
2. 16:23 — bump `package.json` version 0.3.6 → 0.3.7 (**after** the build)
3. 16:24 — `git commit` (committing the *already-built* `lib/client.js`) + `git tag v0.3.7`

Because the version was bumped *after* the build, the emitted client bundle still had
`0.3.6` baked in. That stale bundle was then committed and tagged `v0.3.7`. At runtime
the plugin is `0.3.6`, queries the mirror tags, sees `v0.3.7` as "latest", and since
`compareSemver("v0.3.7", "0.3.6") > 0` it shows **"新版本 v0.3.7 可用"** — announcing an
update to itself.

**Why mirror/tag integrity is irrelevant here.**
`git ls-remote` showed all three mirrors list both tags with *identical SHAs*. That only
proves the *pointer* (tag → commit) is consistent across mirrors. It says nothing about
whether the *content* at that commit is correct. All three mirrors are faithfully serving
the **same wrong bundle** — the one built before the bump. Reference integrity cannot
catch a build-order bug that baked a stale constant into the tagged artifact; the tag and
the mirrors did exactly what they were supposed to.

**Corrected release order.**
Bump the version **first**, then build, then commit/tag/push:

1. Bump `package.json` 0.3.6 → 0.3.7
2. `pnpm run build` (bundle now inlines `0.3.7`)
3. Commit + tag `v0.3.7` + push to all mirrors
4. `git ls-remote` tag-SHA verification on every mirror

(v0.3.8 already adopted "bump FIRST, then build".)

**The check that would have caught it before pushing.**
Grep the freshly built bundle for the baked constant: `grep -R '0\.3\.7' lib/` (or assert
`PLUGIN_VERSION === "0.3.7"` inside the emitted `lib/client.js`). A post-build assertion
"the shipped bundle contains the new version and not the old" would have failed
immediately on `0.3.6` still being present, stopping the bad tag before any mirror push.

---

## 2. Client vs host plane update asymmetry

**Where and when each half's code is loaded.**
- **Client half (`lib/client.js`)** is served to and *executed by the browser*. It is
  re-fetched and re-run on every page reload (and under HMR). That is why the new SVG
  render toggle appeared: the browser picked up the refreshed client bundle.
- **Host half (`lib/index.js`)** is *executed once by the host process at boot*. The asset
  route handler and its `CONTENT_TYPES` extension whitelist are registered at that moment,
  and the registered closure keeps the boot-time whitelist in memory for the life of the
  process.

**How the probe results pin staleness to the RUNNING host process.**
The probes, run *after* the browser was confirmed refreshed, give three facts that
triangulate the staleness:

| Probe / fact | Meaning |
|---|---|
| `GET …daigo-final.png` → `200 OK`, `content-type: image/png` | The route handler is alive; `png` was already in the *old in-memory* whitelist, so it still answers. |
| `GET …daigo-bicycle.svg` → `404 "unsupported image type"` | The *running* process's whitelist rejects `svg`. The 404 is the whitelist rejecting the extension, not a missing route. |
| Disk `lib/index.js` at this moment contains `svg: 'image/svg+xml'` | The release artifact is correct — `svg` IS whitelisted in the shipped file. |

The running process rejects `svg` while the disk artifact accepts it, and PNG still
works. Therefore the stale code lives in the **running host process** (its boot-time
whitelist predates the svg change), not in the release. The 404 is "unsupported image
type" because the *old in-memory* whitelist lacks the `svg` entry.

**What makes a host-plane change effective.**
The host process must be **restarted** so `lib/index.js` is re-executed and the asset
route + whitelist are re-registered with the new `CONTENT_TYPES`. (The evidence notes a
host restart had **not** been performed in this session.)

**Why this is the one case where "plugins hot-update" does not hold.**
"Plugins hot-update" applies to the *client plane*: the browser re-fetches/reloads the
client bundle, so client UI changes surface after a refresh. The *host plane* has no
hot-reload path for boot-time route registration in this case — the registered handler is
frozen in memory until the process restarts. A client-visible refresh (toggle present)
is therefore **not** evidence that the host half is updated. The two planes update on
different schedules and different triggers (re-fetch vs. restart).

---

## 3. Broken-image attribution

**Where the corruption happened.**
The corruption is in the **session payload's model-visible result text** — the text block
persisted into the session log by the result-text assembly layer, **upstream of the
plugin**. The evidence is unambiguous:

- The **source file on disk** is well-formed XML (`System.Xml` loads it with no error).
- The **log payload** is *not* well-formed: "error on line 233 … Specification mandates
  value for attribute `stro0`".
- The splice lands on a **shared prefix `stro`**: payload line 232 = source line 232 up
  to `…stroke="#dde6ea" stro` **+** source line 247's tail from `0 0,1 821,730` onward,
  with source lines 233–247 entirely missing.
- The read tool's **TYPE result** delivered to the caller was *clean*; only the
  model-visible result block was corrupted.
- A **re-read came back clean** — the corruption is non-deterministic, not a property of
  the file.

So the file is good, the plugin's own read was good, and only the assembled/persisted
session text was spliced. That is an upstream result-text-assembly defect, not a plugin
defect and not a file defect.

**Why the plugin must treat the session payload as untrusted rendering input.**
The plugin's render path consumes the SVG *as text from the session payload*, and that
text can be corrupted by an upstream splice even when the on-disk file is byte-perfect.
The plugin cannot assume the payload is identical to the file, so it must validate the
payload (well-formedness) before rendering it — exactly as it would treat any untrusted
input.

**Why editing/"repairing" the traced file was the wrong move.**
The source file is well-formed and a re-read is clean; the corruption is transient and
lives in the upstream session-payload layer. Editing the traced file would "fix" the
wrong object: it would mutate *good* user source data to work around an upstream bug,
risking real damage to the traced file, while leaving the actual corruption bug
unreported. The correct move is to **report the upstream text-corruption bug**, not
paper over it inside the plugin or in the file.

---

## 4. Defensive render chain

The render-source order for an SVG preview, most-trusted first:

1. **Disk-bytes asset route first.** Fetch raw bytes through the host asset route
   (`/asset?path=…`), which returns the exact file bytes plus the validated
   `image/svg+xml` content-type. This is the authoritative source: it bypasses the
   session-payload result-text assembly (the layer that spliced the text), delivers
   bytes rather than re-assembled text, and lets the host whitelist gate the MIME type.
   No text re-assembly ⇒ no splice surface.

2. **Session payload only after an XML well-formedness check.** If the asset route is
   unavailable, fall back to the in-band session payload — but *only* after parsing it
   with `DOMParser` and rejecting on `parsererror` (or any well-formedness failure).
   The payload is the untrusted source (proven to splice on a shared prefix), so it must
   be validated before any DOM/rendering use. A malformed payload falls through; it is
   never rendered.

3. **Sandboxed iframe as the last render fallback.** Render the *validated* fallback SVG
   inside a sandboxed `<iframe sandbox>` (without `allow-scripts`). This isolates the
   SVG's document so any active content (scripts, event handlers, external fetches) is
   blocked, while **SMIL** declarative animations (`<animate>`, `<animateTransform>`,
   `<animateMotion>`) still run because they are declarative renderer features that need
   no JavaScript. This gives safe full-SVG semantics for the untrusted/fallback path
   instead of dropping animations or executing scripts.

4. **Explicit error state instead of a silent broken image.** If the asset route fails
   *and* the session payload fails validation (or the iframe cannot render), surface an
   explicit, actionable error (e.g. "SVG preview unavailable — asset route 404 / payload
   failed XML well-formedness") rather than an empty or broken `<img>`. A silent broken
   image is exactly what happened here and hid the upstream corruption; a loud error
   makes the failure diagnosable and points at the correct layer.

*Justification summary:* raw disk bytes are the only source that skips the proven-fragile
text-assembly path (hence primary); the session payload is convenient but untrusted, so
it is gated by well-formedness; any SVG that reaches the DOM from the untrusted path is
isolated in a sandboxed iframe (scripts off, declarative animation on); and failure must
be loud so an upstream defect is surfaced rather than masked.

---

## 5. Forensics method + prevention

### Decoding the concatenated-Zstandard session log frame-by-frame

A "generation file" is a stream of **concatenated zstd frames** — each generation/append
is written as its own frame (magic `28 B5 2F FD`). To recover the exact stored text:

1. **Locate frames.** Scan for the zstd frame magic or drive a streaming decoder that
   stops at each frame boundary (`ZSTD_decompressStream` loop / a zstd binding that
   exposes frame iteration). Concatenated frames are decoded back-to-back; each frame end
   is a generation boundary.
2. **Decompress frame-by-frame.** Emit each frame's decoded chunk separately; the
   concatenation of all frame outputs reconstructs the full stored log. (The `zstd` CLI
   also decompresses concatenated frames, but frame-by-frame iteration is what lets you
   attribute content to a specific generation.)
3. **Recover the exact stored text and attribute the splice.** Compare each decoded
   generation chunk against the expected read-result. The frame whose chunk contains the
   spliced line (payload 232 = source 232 prefix + source 247 tail) is the generation in
   which the result-text assembly corrupted the text. This produces the *exact stored
   bytes* as evidence that the corruption exists in the persisted payload — proving the
   file and the plugin are clean and the upstream assembly is at fault.

This turns "the image looked broken" into dated, byte-exact proof of *where* the text
diverged.

### Release-checklist items this incident adds

1. **Version-bump-before-build.** Bump `package.json` first, then build, so the bundle
   inlines the new version. Never build-then-bump (the v0.3.7 mistake).
2. **Grep the shipped bundle for the baked constant.** Post-build, assert the emitted
   `lib/client.js` contains the new version string (and not the old). This is the check
   that would have caught the stale `0.3.6` before the tag/push.
3. **Per-mirror tag SHA verification.** After pushing, `git ls-remote --tags` on every
   mirror and confirm identical SHAs (already performed; retain as a checklist gate for
   pointer integrity).
4. **Report the upstream text-corruption bug.** When the session payload is spliced but
   the source file is well-formed and a re-read is clean, file the defect against the
   upstream result-text-assembly layer — do **not** "repair" the traced file or silently
   mask it in the plugin.

---

*No reference cards were consulted (NOSKILL); this analysis is derived solely from the
fixture evidence pack.*
