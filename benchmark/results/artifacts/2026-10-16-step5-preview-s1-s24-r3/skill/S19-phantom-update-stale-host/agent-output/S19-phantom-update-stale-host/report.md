# S19 · The Phantom Update, the Stale Host Half, and the Corrupted Payload

**Mode**: A · inspect (read-only diagnosis). Evidence pack `fixture/` inspected read-only and left
byte-identical; no install, no migration, no host action, no writes outside
`agent-output/S19-phantom-update-stale-host/`.

**Subject**: client plugin `@dsh-external/dsh-file-trace`, release session 2026-09-05,
v0.3.7 (markdown renderer fix) and v0.3.8 (SVG render preview).

## One-line conclusions

| # | Symptom | Attribution |
|---|---|---|
| 1 | Fresh v0.3.7 announces "新版本 v0.3.7 可用" against itself | The self-update check's left operand `PLUGIN_VERSION` is a **build-time** constant inlined by tsdown; the build ran at 16:22 and the manifest bump 0.3.6→0.3.7 only at 16:23, so the shipped `lib/client.js` still says `0.3.6`. Mirror/tag integrity is irrelevant: the mirrors are correct, the stale operand is the bug. |
| 2 | New client UI reached the browser, host asset route still 404s for `.svg` | **Plane asymmetry**: `lib/client.js` is re-fetched per browser load; `lib/index.js` is read by the host process once at apply/boot and the asset route closed over the old `CONTENT_TYPES`. PNG 200 / SVG 404 / disk whitelist contains `svg` pins the staleness to the **running host process**, not the release. |
| 3 | Traced SVG renders broken, source file is well-formed, re-read is clean | The corrupted text was produced by the harness **result-text assembly** into the session log — upstream of the plugin, the read tool's typed result, and the file. The session payload is therefore **untrusted rendering input**. |
| 4 | Fix | A validated, ordered render chain: disk-bytes asset route → payload after XML well-formedness check → sandboxed iframe → explicit error state. |
| 5 | Evidence | The session generation file is a **concatenated-zstd** stream; decoding it frame-by-frame recovers the exact stored text, turning the anecdote into reproducible evidence. |

---

## 1. Phantom self-update root cause

**Where the compared version constant comes from (build time, not runtime).**
`fixture/client-bundle-excerpt.js` is the verbatim shipped `lib/client.js` at tag v0.3.7 and
contains:

- `export const PLUGIN_VERSION = "0.3.6";` — the file's own doc-comment says "from package.json
  at build time";
- "tsdown inlined this constant from package.json WHEN THE BUNDLE WAS BUILT — it is not read
  dynamically at runtime";
- the check itself: `newerTag(latestTag)` returns the tag when
  `compareSemver(latestTag, PLUGIN_VERSION) > 0`.

So the comparison is **baked constant (left operand) vs live network query (right operand)**. The
left operand is frozen into the artifact at build time; only the right operand moves with reality.

**The actual operation-order mistake.**
From `fixture/release-log.md` (v0.3.7, timestamps local):

| Time | Action | Effect on `lib/client.js` |
|---|---|---|
| 16:20 | edit `src/client/markdown.tsx`, add regression tests | — |
| 16:22 | `pnpm run build` — client bundle emitted | **← `PLUGIN_VERSION = "0.3.6"` inlined here** |
| 16:23 | bump `package.json` 0.3.6 → 0.3.7 | manifest new, artifact stale |
| 16:23 | README install refs → `#v0.3.7` | — |
| 16:24 | `git commit` (includes the already-built `lib/client.js`) + `git tag v0.3.7` | stale artifact committed and tagged |
| 16:25 | push `main` + tag to origin / public / omdsh; `git ls-remote` verified the tag SHA on all three | correct distribution of a stale artifact |

The build ran **before** the version bump, so the committed artifact carries the previous
version's constant. The self-update check then does
`newerTag("v0.3.7")` with `PLUGIN_VERSION = "0.3.6"` → `0.3.7 > 0.3.6` → the badge
"新版本 v0.3.7 可用" renders **on the just-released v0.3.7 itself**. The plugin is not lying about
the tag; it is comparing its tag against the wrong self-version.

**Why mirror/tag integrity is irrelevant here.**
`fixture/git-tags.txt` shows all three mirrors listing `v0.3.7` at the identical SHA
`748b5e56…` (and `v0.3.8` at `d887deb0…`). That evidence proves the distribution is complete and
consistent and that the "highest `vX.Y.Z`" lookup returns the right answer. The defect is not in
the right operand — it is in the left one, which no amount of mirror consistency can repair.
Re-pushing, re-verifying, or force-moving identical SHAs changes nothing observable: the recovery
in the log required **amend + rebuild + force-move the tag**, i.e. a new artifact, not a new
distribution. Concretely: mirror verification protects against "the client sees an older/incomplete
tag list"; this incident is "the client's own version number was wrong", a different fault class
that mirror SHA checks are structurally blind to.

**Corrected release order.**

1. Edit source + regression tests (no build yet).
2. **Bump `package.json` version first** — before any build command.
3. Typecheck / tests.
4. Build (the bundler now inlines the new constant).
5. **Artifact gate**: assert the emitted constant equals the manifest version (see below).
6. `git commit` including the freshly built artifacts, then `git tag`.
7. Push to all mirrors, then `git ls-remote --tags` on each and compare SHAs (all equal).

v0.3.8 was released with exactly this corrected order (release-log: "the rebuild order was
corrected for v0.3.8 (bump FIRST, then build)"), which is why v0.3.8 does not reproduce symptom 1.

**The check that would have caught the stale constant before pushing.**

- Grep the shipped bundle for the baked constant before commit/tag, e.g.
  `grep -n 'PLUGIN_VERSION = ' lib/client.js` and compare the value against
  `node -p "require('./package.json').version"`.
- Better, a machine gate that fails the release: a unit test
  `expect(PLUGIN_VERSION).toBe(pkg.version)` (a self-referential version test), plus a pre-commit /
  pre-tag hook running the same assertion against the **emitted artifact**, not the source.
- A one-line smoke of the comparison itself: run `newerTag` with the version being released and
  assert it returns `undefined` (a release must never report itself as newer).
- Structural fix so the two operands cannot diverge: read the running version at runtime (manifest
  served by the host, or a build step that injects from the bump commit) instead of baking it, and
  fail closed when the two disagree.


## 2. Client vs host plane update asymmetry

**Where each half's code is loaded, and when.**

| Half | File | Loaded by | When it takes effect |
|---|---|---|---|
| Client | `lib/client.js` | the browser, via the plugin combo route | on **every page load / hard refresh** — the browser re-fetches the bundle |
| Host | `lib/index.js` | the running dsh **process** | once, at plugin `apply()` / host **boot**; the module is cached and its registrations (routes) are fixed for the process lifetime |

The plugin's asset route is registered during host-plane apply. The handler body closes over the
module-level `CONTENT_TYPES` object that existed **in memory at that moment**. A newer
`lib/index.js` on disk is not re-read by a live Node process (module cache + registration already
done), so the route keeps rejecting `svg` until the process restarts.

**How the probe results pin the staleness to the running host process, not the release.**
`fixture/asset-route-probe.txt` (executed after the browser was confirmed refreshed — the new SVG
render toggle was visible and clickable — and with the host **not** restarted since before the SVG
whitelist change):

| Probe | Result | What it rules in / out |
|---|---|---|
| `GET …/asset?path=…daigo-final.png` | **200 OK**, `content-type: image/png` | The route exists, resolves paths, is registered and healthy — the failure is not "route missing" or "host half not loaded" |
| `GET …/asset?path=…daigo-bicycle.svg` | **404 "unsupported image type"** | The extension whitelist **in the running process** rejects `svg` — a whitelist lookup miss, i.e. an old in-memory table |
| `lib/index.js` on disk (tag v0.3.8) | contains `svg: 'image/svg+xml'` (`fixture/lib-index-excerpt.js`) | The **release is correct**; the shipped artifact is correct |

The three together are a complete proof: route alive (so the host plane is loaded), the same route
answering 200 for an old type and 404 for the new one (so the difference is the in-memory table),
and the disk artifact already containing the new entry (so the release cannot be the cause). The
only remaining candidate is the **running process, whose code predates the change** — the classic
"ghost host" signature: disk says v0.3.8, memory says the pre-`svg` generation. The same
attribution rule the skill encodes in `scripts/ghost-host-check.mjs` (a process started before the
checkout's last change keeps executing the old code from memory; the disk cannot tell the two
apart, only replies can) and in the release-plane symptom row: *old type 200 + new type 404 + disk
artifact contains the new whitelist ⇒ the running process predates the change*.

**What makes a host-plane change effective — and why the "plugins hot-update" rule does not hold here.**
A host-plane change becomes effective only on **host process restart** (fully stop the host, then
restart `dsh web`; a browser refresh is not a host stop, and a Web-page auto-reconnect can even
leave an open page running pre-restart client bytes). The usual "plugins hot-update" expectation
covers the **client plane** only: client modules re-register on reconnect/reload, which is exactly
why the SVG render toggle appeared in the browser in the same session in which the host route was
still stale. Host-plane code is loaded once per process and its registrations are created at apply
time, so no client-side refresh, no HMR, and no hot-update mechanism can reach it. The incident is
the one case where the two halves must be validated with **different actions**: refresh for the
client half, restart for the host half.

*Version-dependent nuance worth recording*: this host served the new client bytes on refresh
(0.1.6-era behaviour). On generations where client bundles are read and cached **at host boot**
(card `DSH-0.1.7-A2-04`: an install-tree client edit needs a host restart before the page sees it,
first-hand 2026-09-23), the same refresh-only verification would have reported **stale** client
content and could have misled the diagnosis the other way. Either way the direction of the
asymmetry is fixed: client plane = reload, host plane = restart.

**Practical release consequence.** Any host-plane feature (new asset type, new route, new
content-type whitelist) must ship with a checklist item "restart the host, then probe the route with
the new extension" — the v0.3.8 push verified the client half by looking at the browser and the host
half by reading the disk artifact, and verified neither where it mattered.


## 3. Broken-image attribution

**The evidence, side by side** (`fixture/session-log-excerpt.txt`):

- Source file on disk, same region: line 232 is a complete, well-formed
  `<circle r="98" … stroke="#dde6ea" stroke-width="6.5"/>`, lines 233–246 present, line 247 is the
  `<path d="M 587,730 A 122,122 0 0,1 821,730" …/>` arc.
- Session-log payload for the same file: line 232 is
  `…stroke="#dde6ea" stro` **spliced** with line 247's tail `0,1 821,730" fill="none" …`; lines
  233–247 are absent.
- XML verdicts: source file **well-formed**; log payload **not well-formed** —
  "error on line 233 at column 54: Specification mandates value for attribute stro0".
- The splice lands on the shared prefix **`stro`** (`stroke-width="…"` vs the `0 0,1` arc flags
  of line 247) — i.e. a mid-file line and another line's tail joined at a common prefix, with the
  15 lines between them dropped.
- A re-read of the same region came back **clean**; the corruption is non-deterministic.

**Where the corruption happened (which layer produced the text).**
The read tool's own typed result delivered to the caller was clean, and the source file on disk is
clean. The corrupted string is the **model-visible result block persisted into the session log** —
i.e. the harness's result-text assembly / session-persistence path. That layer sits **upstream of
the plugin**: the plugin's renderer received the text from the session payload and rendered exactly
what it was handed. Attribution, in order of what is ruled out:

| Candidate | Verdict | Evidence |
|---|---|---|
| The traced file on disk | **ruled out** | well-formed XML, all lines present, a direct read is clean |
| The read implementation / decode | **ruled out** | the read tool's typed result was clean |
| The plugin's renderer | **ruled out** | it rendered the payload it was given; the payload itself is malformed |
| Result-text assembly into the session log (upstream of the plugin) | **the producing layer** | the persisted model-visible block is the only place the corrupted string exists; a clean re-read shows the corruption is produced at assembly time, not durably written |
| The host asset route | **not involved** in this symptom | it serves disk bytes; its 404 is a separate staleness fault (section 2) |

A splice of two lines of the *same* file at a shared prefix, with the intervening lines lost, is a
text-assembly/segment-boundary defect (an overlapping-chunk or pagination-boundary join), not a
storage or encoding fault — and it is silent, which is why it surfaced as a "broken image" instead
of an error.

**Why the plugin must treat the session payload as untrusted rendering input.**
The payload crosses a serialization boundary the plugin does not own (tool result → result-text
assembly → concatenated-zstd session log → decode). Nothing in that chain guarantees the markup the
plugin eventually receives is the markup on disk, and the corruption is non-deterministic, so
"it worked last time" is not a safety argument. The plugin's contract is "render this traced file",
not "trust this string": it must validate before it renders, otherwise a harness bug becomes a
user-visible broken image with no diagnostic. Validation converts a silent corruption into a
detectable, attributable error.

**Why editing or "repairing" the traced file would have been the wrong move.**

1. **There is nothing to repair.** The file on disk is well-formed XML; "fixing" it would either be
   a no-op or would corrupt a clean artifact.
2. **It cannot fix the render path.** The corruption is produced downstream of the file, so the next
   read splices again — the broken image returns.
3. **It destroys the evidence.** The on-disk file is the reference against which the corrupted
   payload is diffed. Rewriting it (or "tidying" the SVG) erases the reproducer and the exact
   attribution, and makes the upstream bug unfixable and unreportable.
4. **It misattributes the fault.** Editing the file converts an upstream harness defect into a
   phantom "the traced file was malformed" story, which will keep recurring on other files.
5. **It violates ownership boundaries.** The traced artifact is the user's data; the fixture is
   read-only evidence. Working around a tool bug by mutating user data is not an acceptable remedy
   — the remedy is a loud error plus an upstream report.


## 4. Defensive render chain

**Render-source order for an SVG preview** (each level falls through only on a *proven*
failure of the previous one, never on a guess):

| Level | Source | Gate before rendering | Why this level exists |
|---|---|---|---|
| **0 (preferred)** | **Disk bytes via the host asset route** — `GET /dsh-file-trace/asset?path=<encoded>`, rendered as `<img src>` (an `<img>` never executes SVG scripts) or `fetch` → `Blob` → object URL | route answers 200 with `content-type: image/svg+xml` | Disk is ground truth and is independently well-formed; it bypasses the session payload entirely, so a payload corruption cannot affect it. It is also the cheapest source and the only one needing no validation of untrusted text. |
| **1 (fallback)** | **Session payload**, only if level 0 is genuinely unavailable (host unreachable, path outside the served root, client-only/remote session with no route) | **XML well-formedness check first**: `DOMParser` with `'image/svg+xml'`, then look for a `<parsererror>` element (treat a parse exception as failure); reject *before* any rendering | The payload is untrusted (section 3). `DOMParser`/`parsererror` is exactly the check the incident's own verdict used, and it catches this corruption class deterministically: the `stro0` splice makes the document non-well-formed, so validation fails instead of producing a broken image. |
| **2 (last resort)** | **Sandboxed iframe** — `<iframe sandbox="">` (no `allow-scripts`, no `allow-same-origin`, no `allow-popups`) with the SVG inlined via `srcdoc` or a blob URL | only reached from level 1's failed validation, and only for presentation | An untrusted SVG can carry `<script>`, event handlers and external references; rendering it in the parent document executes in the plugin's own origin and can escape layout. The sandboxed iframe confines it. **SMIL animations still run**: SMIL is declarative markup (`<animate>`, `<animateTransform>`), not script, so `allow-scripts` is not needed to play them — and omitting `allow-scripts` blocks script execution and script-based animation entirely. |
| **3 (terminal)** | **Explicit error state** — a visible "preview unavailable" panel carrying the reason (asset route 404 / XML validation failed, with the `parsererror` text) and the actionable next step (host restart needed / re-read / report upstream) | reached when every level fails, or when level 0's failure is itself informative | A broken `<img>` icon is indistinguishable from a missing asset and teaches the user to distrust every preview. An explicit error preserves attribution, and a level-0 404 is a *signal* (stale host — section 2) that must be surfaced, not silently swallowed by a fall-through. |

**Ordering rules that make the chain safe.**

- Prefer ground truth: never render a payload merely because one is available when the asset route
  could have served disk bytes.
- Never render unvalidated payload text. Validation is a precondition, not a best-effort step.
- A level-0 **404 is not a rendering failure to paper over**: it is either a genuinely unsupported
  path (report "unsupported") or a stale host (report "host restart required"). Escalate it as an
  error with that attribution instead of falling through to a payload render that may look fine but
  is one corruption away from the same broken image.
- Do not cache a validated payload across renders while a disk read is possible, and do not retry by
  mutating the payload ("repair the attribute name and render anyway") — a silent repair hides the
  upstream bug and the incident recurs.
- Keep the raw bytes of every attempt (route bytes and payload text) so a failed render can be
  reported with evidence rather than a description.

**Why this chain is the right shape for the incident.** Level 0 would have produced a correct
preview for the traced SVG regardless of the corrupted payload. Level 1's validation would have
rejected the spliced payload at `parsererror` instead of rendering a broken image. Level 2 gives a
usable, isolated animated preview when the payload is the only available source. Level 3 makes the
failure legible and attributable, which is what turns the anecdote into a reportable upstream bug.


## 5. Forensics method + prevention

### 5.1 Decoding the session log frame-by-frame

The session's generation file is a **concatenated-Zstandard** stream: several independently
compressed zstd frames appended back-to-back in one file (each frame starts with the zstd frame
magic `28 B5 2F FD`, i.e. `0xFD2FB528` little-endian; skippable frames use
`0x184D2A50–0x184D2A5F`). Concatenated frames are legal per the format, so an "unreadable" or
apparently truncated session log is usually a **tooling** symptom: a single-frame / one-shot
decompress call returns only the first frame and stops, so everything after frame 1 looks missing
and any mid-file anomaly looks like "the file just ends here".

Reproducible frame-by-frame recovery:

1. **Work on a copy.** Copy the generation file into the scratch directory, record the original's
   size and SHA-256 first, and never decode or edit in place.
2. **Enumerate the frame boundaries.** Walk the file: at each offset, decode **one** frame with a
   streaming decoder, record `(frameIndex, byteOffset, compressedLength, decompressedLength)`, then
   advance by `compressedLength` to the next boundary. Frame headers may declare content size and a
   content checksum — if a frame declares one, a mismatch localizes damage to that frame.
3. **Close the manifest.** Assert `sum(compressedLength)` plus framing equals the file size (no
   gaps, no overlaps, no trailing bytes) — this proves the walk covered the whole file and that the
   recovered text is complete rather than "the first frame only".
4. **Decompress each frame separately**, writing one text file per frame plus a manifest JSON of
   offsets/lengths/hashes. This is what makes the recovery reproducible by a third party, and it is
   what turns "the render was broken" into evidence.
5. **Locate the artifact.** Grep the decoded text for the traced path and its read-result block;
   extract the exact stored lines with their session-log line numbers, and record the byte offset of
   the corruption *inside the frame*.
6. **Diff against the on-disk source** and run an XML well-formedness check on both sides. In the
   fixture the check was System.Xml `XmlDocument` load; portable equivalents are
   `xmllint --noout <file>` or a `python` `xml.etree`/`minidom` parse. Keep both verdicts: the source
   well-formed, the payload not well-formed, with the parser's exact message and position
   ("error on line 233 at column 54: Specification mandates value for attribute stro0").
7. **Confirm non-determinism.** Re-read the same region afterwards (ideally in a fresh session) and
   compare hashes. A clean re-read after a corrupted payload proves the corruption is produced at
   assembly time rather than durably written — that is the decisive observation for attributing it
   upstream.
8. **Tooling note.** Prefer a decoder that continues across frame boundaries (the zstd CLI's
   `zstd -dc` over the whole file, a streaming decoder configured to read across frames, or the
   explicit magic-scan walk above). Never conclude "the log is corrupt" from a one-shot call that
   stopped at frame 1 — that is a decoder limitation, not evidence.

### 5.2 Release-checklist items this incident adds

1. **Version bump BEFORE build.** The bump is the first mutation after the source edit; no build
   command may run before it. v0.3.8 already follows this order — that is why symptom 1 did not
   recur on v0.3.8.
2. **Grep the shipped bundle for the baked constant** as a pre-commit / pre-tag gate: read
   `PLUGIN_VERSION` out of the **emitted** `lib/client.js` (not from source) and assert it equals
   `package.json`'s `version`. Back it with a unit test `expect(PLUGIN_VERSION).toBe(pkg.version)`
   so CI fails on bump-after-build, and a smoke assertion that a freshly released version never
   reports itself as newer. Structurally: read the running version at runtime, or inject it from the
   bump commit, so the two operands of the self-update comparison cannot diverge.
3. **Per-mirror tag SHA verification** — keep `git ls-remote --tags` on every mirror and require
   identical SHAs. Its scope must be stated honestly: it proves the newest-tag lookup sees a
   complete, consistent picture and would catch a mirror that lags or a divergent tag. It is
   **structurally blind** to a stale baked constant, so it may never be presented as covering
   symptom 1. In this incident the mirrors were correct and the fault was entirely in the left
   operand.
4. **Report the upstream text-corruption bug instead of papering over it in the plugin.** File the
   upstream issue with the frame-by-frame decoded evidence: frame index, byte offsets, per-frame
   hashes, both XML verdicts with the parser's exact message and position, and the clean re-read.
   In the plugin ship the validated render chain (section 4) plus the explicit error state — the
   plugin degrades **loudly and attributably**, never silently — and do not "repair" the traced
   file, the payload, or the session log.
5. **Host-plane changes require a host restart in the verification checklist.** For any new asset
   type / route / content-type whitelist: restart the host, then probe the route with the new
   extension (and an old one as a control). A refresh-only or disk-artifact-only verification is
   exactly what let v0.3.8 ship with a correct artifact and a broken feature.
6. **Declare the plane of every feature in the release notes** (client half vs host half) and
   verify the two halves with their own actions: browser reload for `lib/client.js`, host restart
   for `lib/index.js`. Also verify the *served* bundle content (fetch the combo URL) rather than
   only "the page responds", since a reconnecting page can keep running pre-restart bytes.
7. **Evidence hygiene.** Keep the evidence pack read-only and hash-verified before and after
   analysis; run every read-only scan against a copy; record the commands and paths used so the
   diagnosis is auditable.


## Appendix A · evidence → conclusion map

| Evidence file | Observation | Supports conclusion |
|---|---|---|
| `release-log.md` (16:22–16:25) | build at 16:22, bump at 16:23, commit of the already-built bundle at 16:24, tag + 3-mirror push at 16:25 | §1 — bump-after-build is the operation-order mistake; v0.3.8's order was corrected |
| `client-bundle-excerpt.js` | shipped `lib/client.js` at tag v0.3.7 contains `PLUGIN_VERSION = "0.3.6"`, inlined at build time, compared by `newerTag()` | §1 — the left operand of the self-update check is a build-time constant |
| `git-tags.txt` | all three mirrors list `v0.3.7` at SHA `748b5e56…` and `v0.3.8` at `d887deb0…` | §1 — mirror/tag integrity is correct and therefore irrelevant to the phantom badge |
| `package.json` | version `0.3.8` as committed | §1/§2 — the manifest is ahead of the v0.3.7 artifact; the release order was fixed for v0.3.8 |
| `asset-route-probe.txt` | PNG 200 `image/png`, SVG 404 "unsupported image type", host not restarted, client half confirmed refreshed | §2 — route alive + new type rejected + host not restarted ⇒ staleness is in the running process |
| `lib-index-excerpt.js` | shipped `lib/index.js` at tag v0.3.8 contains `svg: 'image/svg+xml'` | §2 — the release is correct; the running process is stale (ghost host) |
| `session-log-excerpt.txt` | payload line 232 = source line 232 + line 247's tail at the shared prefix `stro`; lines 233–247 absent; source well-formed, payload not; clean re-read | §3 — corruption is produced by the upstream result-text assembly, not by the file, the read tool, or the plugin |

## Appendix B · card / reference citations (key points + IDs only)

- **`DSH-0.1.7-A2-04`** (references/v0.1.7-alpha.2.md) — client bundles are read and cached **at host
  boot**; an install-tree client edit needs a host restart before the page sees it, and an
  auto-reconnecting page can keep running pre-restart bytes, so verify the *served* bundle content
  rather than that the page responds. First-hand 2026-09-23.
- **migration-hygiene.md §3** ("Which plane a change takes effect in") — `lib/client.js` takes effect
  on a browser hard refresh; `lib/index.js` requires restarting dsh. This is the plane rule §2 is
  built on.
- **`scripts/ghost-host-check.mjs`** — executable form of the ghost-host classifier: a process
  started before the checkout's last change keeps running the old code from memory; the disk cannot
  tell the two apart, only replies can (classify by reply, never by a version number). §2's probe
  triple is the same rule applied to one route.
- **`references/troubleshooting.md`** — release-plane symptom rows for this incident family
  (self-referential update badge; client UI present while a new host route 404s with the disk
  artifact already containing the new whitelist; session-payload corruption producing a broken
  render from a well-formed source). Cited for the symptom → root-cause mapping only.
- **`SKILL.md`** — Mode A (inspect) discipline: read-only investigation and report, no edits, no
  installs, no lifecycle scripts; layered validation including a real host boot and route
  registration proof rather than a bare HTTP 200.

