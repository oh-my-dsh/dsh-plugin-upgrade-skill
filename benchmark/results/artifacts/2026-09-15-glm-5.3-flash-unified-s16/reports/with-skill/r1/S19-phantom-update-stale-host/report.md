# S19 · The Phantom Update, the Stale Host Half, and the Corrupted Payload — Diagnosis Report

Plugin: `@dsh-external/dsh-file-trace` v0.3.7 (markdown fix) / v0.3.8 (SVG render preview), released 2026-09-05.
Evidence: read-only pack `fixture/` (`release-log.md`, `client-bundle-excerpt.js`, `lib-index-excerpt.js`, `asset-route-probe.txt`, `git-tags.txt`, `session-log-excerpt.txt`, `package.json`). Nothing in the pack was modified; no migration or installation was executed.
Skill references applied: `skills/plugin-upgrade/references/troubleshooting.md` (the three S19 symptom rows), `references/migration-hygiene.md` §3 (client hard refresh vs host restart), `references/pre-flight.md` §1.5 (ghost host: ask the process, not the disk), `SKILL.md` (host-upgrade discipline; a browser refresh is not a host stop), `references/v0.1.3-alpha.1.md` DSH-0.1.3-A1-06 (session-log reader discipline).

---

## 1. Phantom self-update root cause (the v0.3.7 badge announcing itself)

**What the evidence shows.** The shipped `lib/client.js` at tag v0.3.7 contains, verbatim:

```js
export const PLUGIN_VERSION = "0.3.6";
// tsdown inlined this constant from package.json WHEN THE BUNDLE WAS BUILT —
// it is not read dynamically at runtime.
```

and the release log shows the operation order: **16:22 build → 16:23 bump 0.3.6 → 0.3.7 → 16:24 commit (including the already-built `lib/client.js`) + tag v0.3.7 → 16:25 push to all three mirrors.**

**Root cause.** The compared version constant is a **build-time inlined constant, not a runtime read**. The bundler (tsdown) copied `package.json`'s `version` into the bundle when the bundle was produced. Because the build ran one step *before* the version bump, the released v0.3.7 bundle permanently carries `PLUGIN_VERSION = "0.3.6"`. The self-update check then does `compareSemver(latestTag, PLUGIN_VERSION)` against the highest mirror tag (`v0.3.7`, from `git ls-remote --tags`), gets `0.3.7 > 0.3.6`, and the freshly released v0.3.7 announces "新版本 v0.3.7 可用" — an update to itself. The badge is self-referential because the *tag* moved while the *constant baked into the artifact under that tag* did not.

**Why mirror/tag integrity is irrelevant.** `git-tags.txt` shows all three mirrors (origin / public / omdsh) serving the identical v0.3.7 SHA `748b5e5…` and identical v0.3.8 SHAs. Every mirror serves exactly the bytes that were committed — distribution integrity is perfect. But the defect is not in distribution; it is in the *content* that was built and then tagged: the stale constant was committed, tagged, and replicated faithfully. No amount of SHA verification can detect that the inlined constant inside a validly-tagged bundle is one release behind the tag name. (The same mirror-consistency evidence also rules out a partial/failed push as the cause of the badge.)

**Corrected release order.**

1. Edit source; typecheck + tests green.
2. **Bump `package.json` version FIRST** (0.3.6 → 0.3.7).
3. **Then build** — the bundler inlines the *new* version into the artifact.
4. Commit (source + freshly built `lib/`) and tag.
5. Push `main` + tag to all mirrors; verify tag SHAs per mirror.

**The check that would have caught it before pushing.** After build, before commit/tag, assert the shipped bundle carries the new constant:

```sh
grep -n "PLUGIN_VERSION = \"0\.3\.7\"" lib/client.js   # must hit; a 0.3.6 hit = stale build
# or as a hard gate:
node -e "const fs=require('fs'),p=require('./package.json'); \
  if(!fs.readFileSync('lib/client.js','utf8').includes('PLUGIN_VERSION = \"'+p.version+'\"')) \
  process.exit(1)"
```

Run against the 16:22 artifact, this fails (it still says `0.3.6`), stopping the release before tag/push. This is exactly what the v0.3.8 re-release did (amend + rebuild + force-move the tag on all mirrors), and why the release log records "bump FIRST, then build" as the corrected order.

---

## 2. Client vs host plane update asymmetry (toggle visible, route still 404)

**Where each half's code lives and when it loads.**

- **Client half (`lib/client.js`)** is served to the **browser** and re-fetched on every page load/refresh (no-cache). A browser refresh is sufficient for client-plane changes to take effect — the client module table is re-imported and the plugin's client half re-registers on each load (migration-hygiene §3: a change in `lib/client.js` takes effect on a browser hard refresh).
- **Host half (`lib/index.js`)** runs **inside the long-lived host process**. Its asset route and the `CONTENT_TYPES` whitelist are registered **once, at plugin apply / host boot time**; the route handler closure captures whichever whitelist object existed in memory at that moment. Replacing `lib/index.js` on disk changes nothing about a route already registered inside a running process.

**Why the asymmetry produced this exact symptom pair.** After the v0.3.8 push the browser refreshed and pulled the new client bundle — so the new SVG render toggle rendered and was clickable. The host, however, was **not restarted** (probe file header: "host NOT restarted since before the SVG whitelist change"), so its registered route still runs the old closure whose whitelist lacks `svg`.

**How the probes pin the staleness to the RUNNING host process, not the release.** Three facts together are decisive (`asset-route-probe.txt`, `lib-index-excerpt.js`):

| Probe / fact | Result | What it rules out |
|---|---|---|
| PNG probe | `200 image/png` | route missing/crashed — the handler is alive and serving |
| SVG probe | `404 "unsupported image type"` | a transport/auth failure — this is the extension whitelist rejecting `svg` |
| Disk `lib/index.js` at the same moment | contains `svg: 'image/svg+xml'` | a bad release / incomplete publish — the shipped artifact whitelists svg |

If the release were broken, the disk copy would lack the svg entry; if the route were gone, PNG would not answer. Old-type-200 + new-type-404 + disk-has-new-entry is the unique signature of a **process running code older than the file on disk**. This is the ghost-host principle (pre-flight §1.5): ask the process, not the disk — a process started before the artifact's last change keeps executing old code while the disk reports the new version. `ps -o lstart= -p <hostPid>` vs. the file's mtime would confirm it directly; the probe triple already confirms it behaviorally.

**What makes a host-plane change effective — and why "plugins hot-update" does not apply.** A full **host stop + restart** (`dsh web` restarted; a browser refresh is explicitly *not* a host stop, per SKILL.md) re-runs plugin apply/boot, re-registers the asset route, and the new closure picks up the svg whitelist. The usual "plugins hot-update" rule covers **only the client plane**: the client bundle is re-fetched and re-registered on every page load, so shipping a new `lib/client.js` self-applies on refresh. Host-half registrations (routes, services) are boot-time state of a running process and are never re-evaluated until that process restarts — this incident is precisely the case where the rule does not hold. (Verification after restart: repeat the SVG probe and expect `200 image/svg+xml`.)

---

## 3. Broken-image attribution (corrupt session payload, healthy source file)

**What the evidence shows** (`session-log-excerpt.txt`):

- **Source file on disk**: well-formed XML (`System.Xml XmlDocument` load: no error).
- **Read-result text stored in the session log**: NOT well-formed — `error on line 233 at column 54: Specification mandates value for attribute stro0`.
- **Re-read of the same region afterwards**: clean (the corruption is non-deterministic).

**The splice shape.** Stored line 232 = source line 232 up to `...stroke="#dde6ea" stro` **+ source line 247's tail** from `0 0,1 821,730" fill=...`; source lines 233–247 are absent. The junction lands on the shared prefix `stro` — the tail of `stroke-width…` (line 232's expected continuation) coincides textually with the start of line 247's arc-flag run (`0 0,1`), producing `stro0,1 821,730` — which the XML parser then reads as an attribute name `stro0,1` with no value. Two different lines spliced mid-file at a coincidental character prefix is the signature of a **result-text assembly bug** (prefix-matching/incremental-stream chunk joining), not of a damaged file.

**Where the corruption happened.** In the **session-log result-text assembly/persistence layer, upstream of the plugin**. The read tool's actual TYPE result delivered to the caller was clean; the corrupted text is the *model-visible result block as persisted into the session log*. The plugin did not mis-render the file — it faithfully rendered a corrupted copy of the file that the session machinery stored. The clean re-read confirms the disk file was never bad and the corruption is not stable content.

**Why the plugin must treat the session payload as untrusted rendering input.** The session payload is a re-assembled, persisted *text* intermediary, demonstrated here to be corruptible non-deterministically and undetectably (no error accompanied it). Any renderer that consumes it directly will intermittently produce broken images that look like plugin bugs. Treat it like any untrusted input: validate (XML well-formedness) before rendering, and prefer the authoritative bytes from disk (the host asset route — §4).

**Why editing/"repairing" the traced file would have been the wrong move.** The file on disk is well-formed; "repairing" it would (a) corrupt a good artifact based on evidence that the re-read disproves, (b) paper over a real upstream bug so it keeps corrupting other reads invisibly, and (c) not even fix the symptom, since the next session payload is assembled independently (the re-read was already clean). The correct action is to keep the file untouched and report the upstream text-corruption bug with the session-log evidence (§5).

---

## 4. Defensive render chain for the SVG preview

Design: a validated, ordered source chain. Each level is used only if it passes its check; failure falls through to the next level; exhaustion produces an explicit error state.

**Level 1 — disk-bytes asset route (preferred source).**
`GET /dsh-file-trace/asset?path=…` serves the file's **raw bytes from disk** with `Content-Type: image/svg+xml` (after the host restart from §2 makes the whitelist live). *Justification*: disk bytes bypass the session log entirely — no result-text assembly, no model-visible truncation/splice, no reliance on the corruptible layer proven in §3. It is also the cheapest authoritative source: one HTTP request, no parsing needed for trust. Constraint: the route must serve bytes, never re-encoded text.

**Level 2 — session payload only after XML well-formedness validation.**
When the asset route is unavailable (e.g. host not yet restarted, file outside the route's authorization), fall back to the session-log text **only after** `new DOMParser().parseFromString(text, 'image/svg+xml')` and an explicit check for a `parsererror` element (namespaced lookup, since the error element is XML-namespaced). *Justification*: §3 established the payload as untrusted and intermittently spliced; the well-formedness check converts silent corruption into a detectable state. A payload that fails the check is discarded as a render source — never "fixed up" heuristically (§3: repairing is the wrong move).

**Level 3 — sandboxed iframe as the last render fallback.**
Render the validated SVG inside `<iframe sandbox="allow-same-origin">` (or `sandbox=""` if same-origin access is not needed) — **crucially without `allow-scripts`** — via a blob URL. *Justification*: SVG can carry `<script>`; the sandbox without `allow-scripts` blocks script execution while **SMIL animations still run**, because SMIL (`<animate>`, `<animateTransform>`) is declarative and does not require the script flag. This preserves preview fidelity (animated traced SVGs still animate) with scripts dead. This is the fallback renderer for whichever validated source was accepted, and the containment boundary for Level 2 content in particular.

**Level 4 — explicit error state (never a silent broken image).**
If every source fails validation (asset route 404s AND payload fails `parsererror`), render an explicit state: "Preview unavailable — payload failed XML validation; source file on disk is intact" with the failing line/column (e.g. line 233 col 54, `stro0`). *Justification*: a silent broken `<img>` is indistinguishable from a plugin defect and misattributes the failure (which is exactly how this incident presented); an explicit message routes the diagnosis to the right layer (upstream payload corruption / stale host) instead of the traced file.

Chain summary: **disk bytes → validated payload → sandboxed render → explicit error** — most-trusted/cheapest source first, every untrusted source gated by a check, execution sandboxed at the rendering boundary, and no failure path that renders nothing silently.

---

## 5. Forensics method + prevention checklist

**Decoding the session log frame-by-frame.** The session log is a **concatenated-Zstandard generation file**: each writer generation/epoch appends an independent zstd frame, so the file is a sequence of back-to-back zstd frames, not one stream. Recovery method:

1. Decode frame-by-frame with a concatenation-aware decoder: `zstd -dc session.log` handles concatenated frames natively (it stops at each frame end and continues into the next); in JS use a streaming decoder (`zstddec` / `fzstd`), looping `decode(chunk)` until each frame is exhausted, to keep frame boundaries.
2. Each frame decompresses to that generation's JSONL events. Walk the events to the target read-result event (the excerpt's corrupted block sits in the payload around line 232 of the stored text) and extract the exact stored text.
3. Diff the stored text against the on-disk file: the diff *is* the evidence — lines 233–247 missing, line 247's tail `0 0,1 821,730…` spliced into line 232 at the shared prefix `stro`, and the XML verdict (`Specification mandates value for attribute stro0`) as the parser's independent confirmation.
4. Reader discipline (per DSH-0.1.3-A1-06): validate decoded events against the session-format catalog's current shapes, treat unknown/mixed writer generations as migration cases rather than parse errors, and never hand-write session logs. Frame boundaries also identify *which writer generation* stored the corrupted block — turning "the image looked broken" (anecdote) into stored-text + format-version + frame-offset evidence suitable for the upstream bug report. Note the skill's privacy rule applies: forensics reports the corruption shape and offsets, not raw log/credential content.

**Release-checklist items this incident adds.**

1. **Version-bump-before-build**: bump `package.json` *before* `pnpm run build` on every release, because the bundler inlines the version at build time (§1). Build-then-bump ships a stale constant under a new tag.
2. **Grep the shipped bundle for the baked constant**: gate the release on `grep "PLUGIN_VERSION = \"<new-version>\"" lib/client.js` (or the scripted assertion in §1) after build, before commit/tag/push. A hit on the old version = stale artifact; rebuild before tagging.
3. **Per-mirror tag SHA verification** (keep, with correct expectations): `git ls-remote --tags` on origin/public/omdsh, all SHAs identical — this proves distribution integrity but, as §1 shows, it cannot detect a bad build; it is a necessary, not sufficient, check and must never be cited as proof the release is correct.
4. **Report the upstream text-corruption bug instead of papering over it in the plugin**: file the upstream issue with the decoded frame, the splice diff, and the XML verdict (§5 method); in the plugin, implement the §4 validated render chain as defense-in-depth — never "repair" the traced file and never silently tolerate malformed payloads.

---

## Attribution summary

| Symptom | Root cause | Layer | Fix |
|---|---|---|---|
| v0.3.7 badge announces v0.3.7 | `PLUGIN_VERSION` inlined at build time; build ran before the bump | release operation order (build inputs), not mirrors/tags | bump → build → grep artifact → tag → push |
| Toggle visible but SVG 404 (PNG 200) while disk whitelists svg | client plane refreshes per page load; host route registered once at boot in the running process | stale RUNNING host process (ghost), not the release | full host stop + restart, then re-probe |
| Broken image, clean source file, clean re-read | read-result text spliced mid-file at a shared prefix during session-log result-text assembly | upstream session machinery, not the plugin, not the file | treat payload as untrusted; validated multi-source render chain; report upstream |
