# S19 — The Phantom Update, the Stale Host Half, and the Corrupted Payload

Diagnosis of the 2026-09-05 release session of `@dsh-external/dsh-file-trace` (v0.3.7 markdown fix, v0.3.8 SVG render preview). All evidence cited from the read-only pack under `fixture/` (`release-log.md`, `client-bundle-excerpt.js`, `git-tags.txt`, `asset-route-probe.txt`, `lib-index-excerpt.js`, `session-log-excerpt.txt`, `package.json`).

---

## 1. Phantom self-update — root cause

**Symptom.** The freshly released v0.3.7 shows its own update badge: "新版本 v0.3.7 可用" — the plugin announces an update to itself, on every mirror, with verified tag SHAs.

**Where the compared version comes from — build time, not runtime.** The shipped bundle excerpt (`client-bundle-excerpt.js`) is explicit:

```js
export const PLUGIN_VERSION = "0.3.6";
// tsdown inlined this constant from package.json WHEN THE BUNDLE WAS BUILT —
// it is not read dynamically at runtime.
```

The self-update check compares this **baked** constant against the newest mirror tag (fetched via `git ls-remote --tags`, highest `vX.Y.Z` wins, per `git-tags.txt`) and badges when `latest > PLUGIN_VERSION`.

**The actual operation-order mistake.** The release log (`release-log.md`) shows the fatal ordering for v0.3.7:

1. 16:22 `pnpm run build` — client bundle emitted **here**, while `package.json` still said **0.3.6**;
2. 16:23 bump `package.json` 0.3.6 → 0.3.7 — **after** the build;
3. 16:24 commit (including the already-built `lib/client.js`) + tag `v0.3.7`;
4. 16:25 push to all three mirrors.

So the world ended up self-inconsistent: the tag, the manifest, and the mirrors all say 0.3.7, but the artifact the browser actually runs self-reports **0.3.6**. The check then does exactly what it is told: `newerTag("v0.3.7")` with `PLUGIN_VERSION = "0.3.6"` → `compareSemver("0.3.7", "0.3.6") > 0` → badge. The plugin is not buggy in its comparison logic; the build input was stale when the bundle was produced. The release log confirms the mechanism: the fix was an amend + rebuild + force-move of the tag on all mirrors, and v0.3.8 was released with the corrected order (bump FIRST, then build).

**Why mirror/tag integrity is irrelevant here.** `git-tags.txt` shows all three mirrors (origin / public / omdsh) listing identical SHAs for both tags. The evidence is designed to exclude the integrity hypothesis: the tags were pushed completely and consistently. The stale version lives **inside the shipped bundle bytes**, not in what the mirrors serve or how they were verified. A perfect mirror of a wrong bundle is still a wrong bundle; no amount of SHA verification on the tag catches a constant that was inlined at 16:22 from a manifest that was bumped at 16:23.

**Corrected release order.**

```
bump package.json  →  build (tsdown inlines the NEW version)  →  commit + tag
                   →  push main + tag to mirrors              →  verify
```

**The check that would have caught it before pushing.** After build, before commit/tag/push, assert the shipped bundle self-reports the manifest version:

```bash
v=$(node -p "require('./package.json').version")
grep -q "PLUGIN_VERSION = \"${v}\"" lib/client.js || {
  echo "release blocked: baked PLUGIN_VERSION != package.json ${v} (bump before build)"; exit 1; }
```

(A release-CI step, or a vitest that builds once and asserts `newerTag("v" + manifestVersion) === undefined`, encodes the same invariant: *the running build must not see itself as outdated*.)

---

## 2. Client vs host plane — why the UI refreshed but the route still 404s

**Symptom.** After the v0.3.8 push, the new SVG render toggle appears in the browser, but `GET /dsh-file-trace/asset?path=...daigo-bicycle.svg` → 404 "unsupported image type", while the same route for a PNG → 200 `image/png` — and the on-disk `lib/index.js` demonstrably whitelists `svg: 'image/svg+xml'`.

**Where each half's code is loaded, and when it takes effect.**

- **Client plane** (`lib/client.js`): loaded **by the browser** on page load / bundle re-fetch. Shipping a new client file plus a browser reload (re-fetch of the JS) is sufficient; the new code — including the new render toggle — is executing as soon as the browser has the new bytes. That is why the toggle is visible: `release-log.md` and the probe header confirm "the client half was confirmed refreshed: the new toggle button was rendered by the browser".
- **Host plane** (`lib/index.js`): runs **inside the long-lived host process**. The asset route and its `CONTENT_TYPES` whitelist are registered **once, at host boot time**. Editing the file on disk changes nothing for an already-running process; its in-memory route table still holds the **pre-v0.3.8 whitelist without the svg entry**. `release-log.md` states it outright: "a host restart had NOT been performed in this session".

**How the probe results pin the staleness to the RUNNING host process, not the release.** The three facts triangulate cleanly:

1. **PNG → 200** through the same route: the route handler is alive and serving — so the 404 is *not* a missing/unregistered route (a missing route would fail both probes).
2. **SVG → 404 "unsupported image type"**: that exact error text is produced by the extension whitelist rejection — i.e., by the **old** map in the running process's memory, which lacks the `svg` entry.
3. **Disk `lib/index.js` whitelists svg** (`lib-index-excerpt.js`): the released file is correct.

Release correct + route alive + svg-specific rejection ⇒ the only stale component left is the **running host process**, which registered its routes from an older `lib/index.js` at boot, before the file changed on disk.

**What makes a host-plane change effective — and why this breaks the "plugins hot-update" rule.** A **host restart**: the process re-reads `lib/index.js` from disk and re-registers its routes/whitelists at boot. This is the one case where the usual "plugins hot-update" rule does not hold, because that rule is true only of the **client plane** (browser re-fetches assets and gets new UI on reload). The host plane's code is loaded exactly once per process lifetime — at registration/boot — so "the file is updated on disk" and "the running code is updated" are different events, separated by a restart. Until the host is restarted, v0.3.8's SVG support exists only on disk.

---

## 3. Broken-image attribution — the traced file is innocent

**The evidence triangle** (`session-log-excerpt.txt`):

1. **Source file on disk: well-formed.** The same region reads cleanly (`232: <circle r="98" ... stroke-width="6.5"/>`, 233, …, 247 with the full arc `A 122,122 0 0,1 821,730`), and an `System.Xml.XmlDocument` load reports no error.
2. **Session-log read-result text: corrupted.** Payload line 232 = source line 232 truncated at the shared prefix `"stro"` **spliced with line 247's tail** (`0 0,1 821,730"...`), and source lines 233–247 are absent entirely. XML verdict on the payload: NOT well-formed — *"error on line 233 at column 54: Specification mandates value for attribute stro0"*.
3. **Re-read: clean.** A later re-read of the same region came back correct — the corruption is **non-deterministic**, not a property of the file.

**Where the corruption happened.** The corrupted text is the model-visible result block **persisted into the session log** — i.e., it was produced in the **read-result text assembly layer** (the machinery that turns a file's bytes into the result text delivered to/persisted for the model), which sits **upstream of the plugin**. The splice lands exactly on a shared prefix (`"stro"` of `stroke-width…` vs the `0 0,1` arc-flags tail of line 247), the classic signature of a mid-stream text assembly/offset bug — not of bad file content. The plugin merely rendered what the session payload handed it.

**Why the plugin must treat the session payload as untrusted rendering input.** The payload is not the file; it is a **lossy, unverified copy** produced by another layer, and this incident proves it can differ from the on-disk bytes non-deterministically. Any consumer that renders the payload as if it were the file inherits the upstream bug. Treat it like any other untrusted network input: validate (XML well-formedness) before rendering, and fall back to the authoritative source — the disk bytes — when validation fails.

**Why editing/"repairing" the traced file would have been the wrong move.** The file is well-formed; there is nothing to repair. "Fixing" it would (a) introduce real damage into a healthy artifact based on corrupted evidence, (b) silently mask an upstream bug that will bite every other consumer of the session payload, and (c) misattribute the fault — the classic wrong move when the symptom (broken image) and the cause (payload splice) live in different layers. The correct disposition is: prove the file clean (§5 forensics), leave it untouched, and report the upstream corruption bug.

---

## 4. Defensive render chain for the SVG preview

Render-source order, most-trusted first, each level gated:

**Level 1 — Disk-bytes asset route (primary).**
`GET /dsh-file-trace/asset?path=...` returns the file's exact bytes with the right `Content-Type: image/svg+xml` (after the host restart from §2). *Justification:* the disk is the source of truth — the bytes the user actually has; no intermediate text assembly can splice them (§3); it is the only source that matches what "preview this file" promises. Content-type correctness also matters: an SVG served as text gets blocked or mangled by the browser.

**Level 2 — Session payload, only after an XML well-formedness check (fallback).**
If the asset route is unavailable, parse the payload text with `DOMParser` (`text/xml`) and refuse it if the document contains a `<parsererror>` (or the equivalent `parsererror` node in the parsed doc). *Justification:* this incident shows the payload is untrusted and can be spliced at a shared prefix; the well-formedness gate rejects exactly that corruption shape deterministically (the observed payload fails at "Specification mandates value for attribute stro0"), so a corrupted copy can never reach the renderer and be mistaken for a bad file.

**Level 3 — Sandboxed iframe as the last render surface.**
Render whichever source passed validation inside `<iframe sandbox="...">` **without** `allow-scripts` (no `allow-same-origin` either, if isolation allows). *Justification:* SVG can carry embedded `<script>` — the sandbox blocks script execution while leaving **SMIL animations** (declarative `<animate>`/`<animateTransform>`, no script involved) running, so the preview stays faithful for animated traces without giving the artwork code execution in the plugin's origin.

**Level 4 — Explicit error state (never a silent broken image).**
If the route fails, the payload fails validation, and no other trusted source exists, render a distinct error state ("preview unavailable: source failed validation" / route error + hint to restart host) instead of an `<img>` that quietly shows a broken-image glyph. *Justification:* a silent broken image hides *which* level failed — in this very incident it was nearly blamed on the traced file. An explicit state distinguishes "route 404 → host needs restart" (§2) from "payload not well-formed → upstream corruption" (§3), which is the difference between the right fix and the wrong one.

---

## 5. Forensics method + prevention

**Decoding the session log frame-by-frame.** The session log is a **concatenated-Zstandard generation file**: several independent zstd frames laid end-to-end, each frame the compressed record stream of one generation/segment. Naive "decompress one stream" handling can stop after the first frame and silently lose every later generation, so the recovery is deliberately per-frame:

1. **Frame split.** Scan the raw file for the zstd frame magic `28 B5 2F FD` (little-endian `0xFD2FB528`). Each occurrence starts a frame; decompress the span between consecutive magics separately. (`zstd -d` on the whole file also traverses concatenated frames in order, but the frame-split view is what proves nothing was skipped and survives a decoder that stops at frame one.)
2. **Per-frame decode.** Decompress each frame independently — e.g. Python `zstandard`: `ZstdDecompressor().stream_reader(raw, read_across_frames=False)` per span, or `zstd -d` per extracted span; frames carry their own headers (and optional checksums), so each decodes standalone and can be validated on its own.
3. **Reassemble in file order.** Concatenate the decoded frames' outputs in original offset order to rebuild the record stream of the session.
4. **Extract the evidence.** Locate the tool-result block for the read (here: payload around line 232), and diff it against a fresh read of the source region. That yields the exact stored text — the spliced line 232 with line 247's tail and the missing 233–247 — turning "the image looked broken" into byte-level evidence: source well-formed, payload not well-formed, splice at a shared prefix, corruption non-deterministic (clean re-read). The XML verdicts (§3) then come from parsing the **recovered stored text**, not from memory.

**Release-checklist items this incident adds.**

1. **Version-bump-before-build.** Order is fixed: bump `package.json` → build → commit + tag → push (the v0.3.8 order). Never build before the bump (the v0.3.7 mistake).
2. **Grep the shipped bundle for the baked constant.** Post-build gate: the emitted `lib/client.js` must contain `PLUGIN_VERSION = "<package.json version>"` and must not contain the previous version string (§1 snippet). Fails the release before anything is tagged.
3. **Per-mirror tag SHA verification.** After pushing, `git ls-remote --tags` on **each** mirror (origin / public / omdsh) and assert all SHAs are identical to the local tag — this is already practiced (and per `git-tags.txt`, it worked); keep it as an explicit checklist gate rather than an ad-hoc command. (It also guards the amend + force-move re-release path used to fix v0.3.7.)
4. **Report the upstream text-corruption bug instead of papering over it in the plugin.** File the splice-at-shared-prefix read-result assembly bug against the upstream layer with the §5 evidence (frame-decoded payload, XML verdicts, clean re-read), and ship the §2/§4 defenses (host restart awareness + validated render chain) in the plugin. Do not edit the traced file, and do not add payload-specific "repairs" that would mask the upstream defect.

---

### One-paragraph summary

The badge lied because the bundle was built before the bump: `PLUGIN_VERSION` is a tsdown-inlined build-time constant (0.3.6) while the tag said 0.3.7, and mirror SHA integrity was never the variable. The SVG toggle reached the browser because the client plane is re-fetched on reload, but the host plane registers routes at boot — PNG 200 / SVG 404 against an svg-whitelisting disk file pins the staleness to the running host process; only a restart makes host-plane changes effective. The broken image was rendered from a corrupted session-log payload — a shared-prefix splice in the read-result assembly, upstream of the plugin, with a well-formed source and a clean re-read — so the payload is untrusted input, and "repairing" the healthy traced file would have been the wrong move. The defensive chain (disk-bytes route → payload behind a `DOMParser`/`parsererror` gate → sandboxed script-free iframe that still runs SMIL → explicit error state) plus frame-by-frame zstd log forensics turns the anecdote into evidence, and the checklist (bump-before-build, grep the baked constant, per-mirror SHA verification, report the upstream bug) keeps it from recurring.
