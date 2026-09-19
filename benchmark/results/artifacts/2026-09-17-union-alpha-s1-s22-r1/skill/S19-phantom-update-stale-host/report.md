# S19 · The Phantom Update, the Stale Host Half, and the Corrupted Payload — Diagnosis Report

Skill: plugin-upgrade · Mode A (inspect, read-only) — post-release diagnosis, no writes to the plugin, the fixture, or the benchmark repository.

Evidence: fixture README.md, release-log.md, package.json, git-tags.txt, client-bundle-excerpt.js, lib-index-excerpt.js, asset-route-probe.txt, session-log-excerpt.txt (all read-only).

## Summary

| # | Symptom | Root cause (layer) |
|---|---|---|
| 1 | "新版本 v0.3.7 可用" badge on freshly released v0.3.7 | Build-time PLUGIN_VERSION constant stale: build ran before the version bump |
| 2 | New client toggle visible, but host asset route 404s for .svg (PNG 200) | Update-plane asymmetry: client bundle re-fetched per page load; host route registered once at boot by a process never restarted |
| 3 | Broken image for one traced SVG | Session-log stored read-result text corrupted upstream; source file well-formed; plugin must treat payload as untrusted |

## 1. Phantom self-update root cause

**Where the compared version constant comes from — build time, not runtime.**
The shipped `lib/client.js` for the v0.3.7 tag (client-bundle-excerpt.js) declares:

```js
/** The running plugin version (from package.json at build time). */
export const PLUGIN_VERSION = "0.3.6";
```

with the annotation that tsdown inlined the constant from package.json **when the bundle was
built** — it is not read dynamically at runtime. The self-update check (`newerTag`) compares
the newest mirror tag against this baked constant: `compareSemver(latestTag, PLUGIN_VERSION) > 0`
→ badge. There is no runtime read of package.json involved.

**The actual operation-order mistake.** release-log.md, v0.3.7:

1. 16:20 edit source, 16:21 typecheck + 104 tests green,
2. 16:22 `pnpm run build` — **build ran here**,
3. 16:23 bump `package.json` 0.3.6 → 0.3.7 — **version bumped AFTER the build**,
4. 16:24 commit (including the already-built `lib/client.js`) and tag `v0.3.7`,
5. 16:25 push main + tag to all three mirrors.

The bundle committed at the v0.3.7 tag was compiled while package.json still said 0.3.6, so
the published artifact carries `PLUGIN_VERSION = "0.3.6"` forever. When the update check
fetches the mirror tags (`git ls-remote --tags`, picks the highest vX.Y.Z) and compares
"v0.3.7" against the inlined "0.3.6", `newerTag` returns "v0.3.7" and the freshly released
v0.3.7 announces an update to itself: "新版本 v0.3.7 可用".

**Why mirror/tag integrity is irrelevant.** git-tags.txt shows all three mirrors (origin /
public / omdsh) list both tags with identical SHAs, and the release log states the tag SHA was
verified on every mirror. Mirror consistency and tag integrity answer "did every mirror receive
the same commit?" — yes. But the badge is produced by a purely local comparison between a
constant baked into the served bundle and the newest tag string. Both inputs are locally
consistent; the defect is the *content* of the built constant, not the distribution. No amount
of mirror/tag verification can detect it, because every mirror faithfully serves the same
wrongly-versioned bundle. This is exactly the skill's troubleshooting row: the client bundle's
version constant is build-time-inlined from package.json; build first / bump later ships the old
constant and the self-update check must then report "update available"; mirror/tag integrity is
irrelevant.

**Corrected release order.** Bump the version BEFORE the build, then commit + tag the freshly
built artifact:

1. edit source (+ tests), typecheck/test green;
2. bump `package.json` to the release version;
3. `pnpm run build` — the bundler inlines the NEW version;
4. grep the emitted bundle for the new constant (see below) and update README install refs;
5. commit (with the freshly built `lib/`), tag, push to mirrors, verify tag SHAs.

The v0.3.8 release already followed this corrected order (bump FIRST, then build) — which is why
v0.3.8 itself does not phantom-badge.

**The check that would have caught it before pushing.** A release gate between build and
commit: grep the shipped bundle for the baked constant and assert it equals package.json's
version, e.g. after build:

```sh
node -e "console.log(require('./package.json').version)"   # 0.3.7
grep -o 'PLUGIN_VERSION = "[^"]*"' lib/client.js           # must print 0.3.7
```

(or a single test: `expect(builtClient).toContain('PLUGIN_VERSION = "0.3.7"')`). Had this run at
16:22–16:23, it would have failed with 0.3.6 ≠ 0.3.7 and stopped the tag. The
version-bump-before-build + grep-the-artifact pair is release-checklist item #1 added by this
incident (Section 5).

## 2. Client vs host plane update asymmetry

**Where each half's code is loaded, and when.**

- *Client half* (`lib/client.js`) is fetched by the **browser** and evaluated on every page
  load / hard refresh. A refreshed page re-requests the bundle (no long-lived cache for the
  plugin's client artifact), so any newly pushed client code is picked up by the next reload.
  That is why the v0.3.8 SVG render toggle "DOES appear in the browser": the client half was
  confirmed refreshed — the new toggle button was rendered by the browser (release-log.md).
- *Host half* (`lib/index.js`) runs inside the **DSH host Node process**. Its asset route is
  registered exactly once, at plugin apply/boot time: the route handler closes over module-level
  state — here the `CONTENT_TYPES` extension whitelist — captured when the module was loaded.
  No page refresh re-runs that registration; the running process keeps executing the old code
  from memory until the process itself is replaced.

**How the probe results pin the staleness to the RUNNING host process, not the release.**
asset-route-probe.txt, executed AFTER the browser was confirmed refreshed:

| Probe | Result | Meaning |
|---|---|---|
| `GET /dsh-file-trace/asset?path=…\daigo-final.png` | 200 OK, `image/png` | The route handler itself is alive and dispatching — the route is NOT missing |
| `GET /dsh-file-trace/asset?path=…\daigo-bicycle.svg` | 404 "unsupported image type" | The extension whitelist in the RUNNING handler rejects `svg` |
| shipped `lib/index.js` at this moment (lib-index-excerpt.js) | `svg: 'image/svg+xml'` present in `CONTENT_TYPES` | The on-disk artifact of the linked install DOES whitelist svg |

A 404 with "unsupported image type" while the same route answers 200 for a whitelisted old
extension proves the request reached the live handler and was rejected by its in-memory
whitelist. The disk copy already contains the new whitelist. Three facts together — old-type
200 + new-type 404 + disk artifact containing the new whitelist — can only mean the running
process predates the change: the process is a **ghost** executing the pre-SVG code from memory
while the disk reports the new state. This is precisely pre-flight step 1.5 ("Ghost host: pin
`from` to the running process"): after an in-place update, an already-running host keeps
executing old code while package.json / the directory / git describe report the new version —
ask the process, not the disk. (The skill's ghost-host-check.mjs compares host process start
time against the checkout's last change and probes the wire generation by reply, never by
version number; the same "process older than checkout" shape applies here at plugin scale.)
Release-log.md confirms the timeline: "a host restart had NOT been performed in this session".

**What makes a host-plane change effective — and why the usual "plugins hot-update" rule does
not hold here.** A host restart (full stop of the host process, then `dsh web` again, then
browser hard-refresh). Only a new process re-imports `lib/index.js`, re-evaluates the module
table, and re-registers the asset route with the new `CONTENT_TYPES` closure — and the file
lock/EBUSY lesson from the troubleshooting map says the running host holds file handles on its
loaded host half, so the replacement only becomes safe to load once the process is gone. The
"plugins hot-update" rule covers the **client plane only**: the browser re-fetches the client
bundle on every reload, so a client-side feature (the toggle) activates immediately, while
host-plane changes — route registration, service providers, event subscriptions — are bound at
boot/apply time. This release touched BOTH planes in one version, and the client-plane half
hot-updated while the host-plane half silently stayed old: same plugin, same tag, two different
effective generations. The verification step the release skipped is the skill's runtime layer:
after pushing, cold-restart the host (or at minimum verify that the running process's behavior
matches the disk artifact — e.g. re-probe the new extension after restart) instead of accepting
client visibility as evidence of the whole release being live.

## 3. Broken-image attribution

**Where the corruption happened — which layer produced the text.**
session-log-excerpt.txt gives three independent observations of the same region of the traced
file:

- the **stored read-result text** in the session log (payload around line 232) is corrupted:
  line 232 = source line 232 up to `…stroke="#dde6ea" stro` **spliced with source line 247's
  tail** (`0 0,1 821,730` onward), with source lines 233–247 entirely absent. The splice lands
  on the shared prefix "stro" ("stroke-width…" vs the "0 0,1" arc flags of line 247) — a
  mid-file line joined to another line's tail at a shared prefix;
- the **source file on disk** in the same region is well-formed XML (System.Xml XmlDocument
  loads with no error);
- the XML verdict on the **log payload** is NOT well-formed: "error on line 233 at column 54:
  Specification mandates value for attribute stro0" — the parser sees a truncated attribute
  named `stro0`, which exists only in the spliced text.

Decisively: "The read tool's TYPE result delivered to the caller was clean; the corrupted text
is the model-visible result block persisted into the session log, i.e. the corruption happened
in the result-text assembly, upstream of the plugin. A re-read of the same region afterwards
came back clean (non-deterministic)." So the corruption was produced **upstream of the plugin**,
in the layer that assembles/persists the tool result text into the session log — not in the
SVG file, not in the tracer that generated it, and not in the plugin's renderer. The plugin
merely consumed what the session gave it.

**Why the plugin must treat the session payload as untrusted rendering input.** The session log
is a persisted, assembled artifact, not a guaranteed faithful copy of disk state. The evidence
shows it can carry text that the source never contained (an attribute `stro0` that never
existed in the file) and can silently lose 15 lines. A renderer that feeds the payload straight
into an image pipeline will attribute the failure to the file — the natural but wrong
conclusion ("the traced SVG is broken"). Treating the payload as untrusted input — validate XML
well-formedness (DOMParser / `parsererror`) before rendering, prefer raw disk bytes via the
host asset route as the primary source, and show an explicit error state on invalid input —
converts a mystery broken image into a diagnosed, reportable upstream defect (Section 4).

**Why editing or "repairing" the traced file would have been the wrong move.** The file was
never broken: it is well-formed on disk, and a re-read came back clean. Any edit would (a) modify
a correct, probably generated/derived artifact (a *traced* SVG — the output of a tracing step),
changing its rendered geometry on the basis of corruption that does not exist in it; (b) paper
over the real defect — the upstream session-payload corruption — leaving it undetected to recur
on other files, since it is non-deterministic; and (c) contradict the skill's rule that local
observation conflicting with a primary source gets recorded, reproduced, and reported — not
silently "fixed" on one side. The correct action is to render from a trusted source and report
the upstream text-corruption bug with the session-log evidence (Section 5).

## 4. Defensive render chain

Render-source order for the SVG preview, each level justified:

**Level 0 — host asset route (disk bytes) first.** `GET /dsh-file-trace/asset?path=…` serves
the file's raw bytes from disk — the only source proven faithful here (the source file is
well-formed). It bypasses the session payload entirely, so upstream log corruption cannot reach
the renderer. It requires the host half to actually run the new code (Section 2: restart), and
it serves bytes with the file's true content type (`image/svg+xml` per the new whitelist). This
is the primary path; the session payload is a fallback, never the default.

**Level 1 — XML well-formedness gate on any payload-sourced SVG.** If the asset route is
unavailable (older running host, non-file input) and the renderer must fall back to the session
payload, it must first parse it as XML (browser `DOMParser`; the fixture used
System.Xml.XmlDocument) and check for `parsererror`. The fixture's verdicts are the proof this
gate works: source → "well-formed"; payload → "NOT well-formed … Specification mandates value
for attribute stro0". A `parsererror` result rejects the payload *before* any broken image can
appear. This check also cheaply detects the exact failure shape seen here (truncated attribute,
missing lines) because well-formedness is broken by both splice artifacts.

**Level 2 — sandboxed iframe as the last render fallback.** SVG is an active document format:
embedded `<script>`, foreignObject/HTML, and event handlers execute when an SVG is rendered
inline or by top-level navigation; external references can also leak viewing context. Rendering
the (validated) SVG inside a sandboxed iframe with scripts blocked keeps display safe, while
SMIL animations (declarative `<animate>`/`<animateTransform>`, no script) still run, so the
preview remains a faithful preview of animated traces. Concretely:
`<iframe sandbox="allow-same-origin" csp="script-src 'none'">` (no `allow-scripts`; a CSP of
`script-src 'none'` where supported) — scripts are blocked, SMIL still runs.

**Level 3 — explicit error state instead of a silent broken image.** When the route 404s
("unsupported image type" / stale host) or the payload fails the parse gate, render a visible,
specific error state ("SVG preview unavailable: host asset route rejected .svg — restart the
host"; "payload failed XML validation — rendering from disk instead"), never a silent broken
image. Justification: the three symptoms in this incident were each silent-ish failures that
looked like different bugs (self-badge, 404 vs disk mismatch, broken image). An explicit state
preserves the diagnosis chain: it tells the maintainer which level refused, instead of inviting
the "the file is broken, let me repair it" mis-attribution.

Justification summary: each level removes one observed failure mode — disk-first removes
upstream payload corruption; well-formedness removes unvalidated active content and catches the
splice; the sandbox contains whatever the validator cannot; the error state stops silent
mis-attribution.

## 5. Forensics method + prevention

**Decoding the session log frame-by-frame.** The session log on disk is a concatenated-Zstandard
generation file: a sequence of independently compressed zstd frames concatenated back-to-back
(one frame per appended record/batch), not one single-stream archive. The recovery method:

1. Work on a COPY of the generation file; never open the live log for writing.
2. Split the byte stream into zstd frames. Either stream-decode with a streaming zstd decoder
   (it consumes frame after frame, emitting each frame's decompressed bytes at its frame
   boundary), or scan for each frame's magic number (0x28B52FFD) and decompress frame-by-frame.
   Per-frame boundaries matter because a splice/corruption is localized to the record that owns
   the frame — single-shot decompression of the whole file hides which frame carried the bad
   bytes.
3. Within each decompressed frame, the record payload is the harness's session event envelope
   (JSON). Locate the tool result record for the read (fixture: "payload around line 232") and
   extract the result text exactly as stored — byte-faithful, not re-rendered.
4. Compare the stored text with the on-disk source around the same region; run an XML
   well-formedness check on the stored text (fixture step 3 does exactly this and produces the
   parser error locating the splice). The result is evidence, not anecdote: you can state
   "the log stores X; the disk contains Y; the stored text is not well-formed" with line/column
   precision (fixture: "error on line 233 at column 54"), which is what makes the upstream bug
   report actionable and reproducible for the harness maintainers.

**Release-checklist items added by this incident:**

1. **Version-bump-before-build.** Bump package.json before `pnpm run build` so the bundler
   inlines the release version (Section 1); never build on a stale manifest.
2. **Grep the shipped bundle for the baked constant** between build and commit/tag:
   `grep -o 'PLUGIN_VERSION = "[^"]*"' lib/client.js` must equal package.json's version; fail
   the release otherwise. (Generalize: assert every build-time-inlined constant in the artifact
   matches the manifest it claims.)
3. **Per-mirror tag SHA verification** — already practiced in this release (`git ls-remote`
   on origin/public/omdsh, identical SHAs, git-tags.txt); keep it, but note it validates
   distribution only, never artifact content (Section 1).
4. **Host-plane liveness probe after pushing a release that touches the host half**: probe the
   new behavior against the RUNNING host (here: one GET for the new extension) before declaring
   the release done; a 404 from a stale process means restart the host and re-probe (Section 2,
   pre-flight step 1.5 "ask the process, not the disk").
5. **Report the upstream text-corruption bug instead of papering over it in the plugin.** File
   the harness-side session-payload corruption with the decoded frame evidence (well-formedness
   verdict, splice shape, non-determinism on re-read); in the plugin, implement the defensive
   render chain (Section 4) and treat the payload as untrusted — do not edit the traced file
   (Section 3).

## Skipped

- No migration cards applied: this is a plugin-release incident diagnosis (Mode A inspect /
  post-release), not a DSH-host corridor migration; no from→to corridor applies.
- No scripts run: plan-migration (corridor scanner), verify-runtime (installs and runs plugin
  code — not read-only), inject-lint, ghost-host-check (needs a live host PID; the fixture
  documents the process state instead) — none are executable against a read-only fixture.
- No builds/installs and no writes to the fixture, per the task brief and skill safety
  boundaries.

## Pending / residual risk

- The upstream session-payload corruption is non-deterministic ("a re-read came back clean");
  the exact assembly step inside the harness that produced the splice is not identified here —
  the evidence localizes it to "result-text assembly, upstream of the plugin", which is where
  the bug report should point, but the harness-side fix is outside this task's scope.
- The exact client-bundle cache/fetch policy (whether any cache headers could delay the client
  refresh) is not in the evidence; the fixture only states the client half was confirmed
  refreshed via the rendered toggle.
- The report's restart guidance assumes the standard DSH web profile lifecycle; a
  deployment that hot-reloads host halves differently would change Section 2's conclusion —
  no such mechanism exists in the evidence.

## Rollback

Nothing was modified: this report was produced entirely by read-only inspection of the fixture
and skill references, plus this one output file. Baseline = the untouched fixture and benchmark
repository; there are no changes to roll back in them. The only written artifact is this
report at benchmark-runs/union-alpha-r1/skill/S19-phantom-update-stale-host/report.md, which can
be deleted to restore the pre-task state.

## Recommendations

- Adopt the corrected release order (bump → build → grep-artifact → commit → tag → push) as an
  executable release gate, not a convention (Sections 1, 5).
- For dual-plane releases (client + host halves in one version), add a host-plane liveness probe
  to the release checklist and document "client hot-updates, host waits for restart" in the
  plugin's README so users do not misread a stale host as a broken release (Section 2).
- Implement the four-level defensive render chain in the SVG preview and add a regression test
  that feeds a deliberately non-well-formed payload and asserts the explicit error state
  (Sections 3, 4).
- File the upstream session-payload corruption with harness maintainers, attaching the decoded
  frame evidence and the well-formedness verdicts, and track the plugin's untrusted-payload
  fallback as the interim mitigation (Sections 3, 5).

