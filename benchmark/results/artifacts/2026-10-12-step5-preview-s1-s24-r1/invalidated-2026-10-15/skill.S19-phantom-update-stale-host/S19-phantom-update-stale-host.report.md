# S19 · The Phantom Update, the Stale Host Half, and the Corrupted Payload

**Mode A — read-only post-release diagnosis** (skill: `plugin-upgrade`).
**Target:** `@dsh-external/dsh-file-trace` v0.3.7 / v0.3.8 (markdown-renderer fix +
SVG render preview), release session 2026-09-05.
**Evidence:** read-only fixture under `…/S19-phantom-update-stale-host/fixture/` (unchanged).
**Status of this doc:** diagnosis + prevention only. No migration, no install, no file
write outside the designated `agent-output/` directory. Everything below is read-only
attribution; the three subshells of the incident are independent and are separated
accordingly.

Three symptoms, three different layers, three different fixes. They must not be
conflated: the first is a *build-time* mistake (client artifact), the second is a
*runtime-plane* mismatch (host process), the third is an *upstream assembly* defect
(session log). Conflating any two sends the fix to the wrong layer.

---

## 1. Phantom self-update — the badge that announces an update to itself

**Symptom:** the freshly released v0.3.7 shows `新版：v0.3.7 可用` — it reports an
update to itself, even though all three mirrors serve the new bundle and the tag SHA
verified on every mirror.

**Root cause: a build-time constant baked against the *old* version, produced by
bumping the version *after* the build.**

- The self-update check in the shipped client bundle reads
  `export const PLUGIN_VERSION = "0.3.6";` (`client-bundle-excerpt.js:7`). Its comment
  is explicit: *"tsdown inlined this constant from package.json **when the bundle was
  built** — it is not read dynamically at runtime."* The comparison is
  `compareSemver(latestTag, PLUGIN_VERSION) > 0` (`client-bundle-excerpt.js:11-16`).
- The release log pins the order mistake exactly:
  - `16:22 pnpm run build` — **client bundle emitted here** (`release-log.md:5`)
  - `16:23 bump package.json 0.3.6 → 0.3.7` — **version bumped AFTER the build**
    (`release-log.md:6`)
- So `build` ran against the still-`0.3.6` manifest and inlined `PLUGIN_VERSION =
  "0.3.6"` into `lib/client.js`. The manifest was then bumped to `0.3.7` and the
  *already-built* `lib/client.js` was committed and tagged (`release-log.md:6-8`). The
  shipped bytes and the shipped version disagree.
- At runtime, `newerTag("v0.3.7")` compares the mirror's newest tag against the baked
  `"0.3.6"`: `0.3.7 > 0.3.6` → badge shows `新版本 v0.3.7 可用`. The released plugin
  is *literally comparing itself to itself across two different version numbers* — the
  packaged version (0.3.7) and the constant its own bundle was built with (0.3.6).

**Why mirror/tag integrity is irrelevant here.** The mirrors and tag SHAs are
orthogonal to this bug. `git-tags.txt` shows identical SHAs on all three mirrors
(`origin`/`public`/`omdsh` both list `748b5e56…v0.3.7` and `d887deb0…v0.3.8`). That
proves the *same bytes* were published everywhere — but the bug lives *inside* those
bytes. Verifying that all mirrors serve identical, correctly-tagged artifacts can
never catch a stale constant inlined at build time: tag-SHA verification is about
distribution integrity, this is about build-input correctness. A perfect
three-mirror push of a mis-built bundle is still a mis-built bundle. (This is exactly
the `troubleshooting.md` S19 row: 镜像/tag 完整性无关.)

**Corrected release order + the check that would have caught it:**

1. **Bump `package.json` version FIRST, THEN build** — so the build inlines the
   intended version. v0.3.8 explicitly corrected this order (`release-log.md:15`:
   "bump FIRST, then build").
2. **Before committing/tagging, grep the shipped bundle for the baked constant** and
   assert it matches the intended release version. Concretely: after `build`,
   `grep -n 'PLUGIN_VERSION' lib/client.js` (or search the emitted bundle for the
   version literal `"0.3.7"`) and fail the release if the inlined constant ≠ the
   `package.json` version. This is the deterministic gate that catches a
   build-then-bump order: the mismatch is visible in the artifact itself before it is
   ever pushed.

> The v0.3.7 recovery required an amend + rebuild + force-move the tag on all three
> mirrors (`release-log.md:14-15`). A CI check on the packaged artifact (bumped version
> === baked constant === packed manifest version) turns that whole recovery cycle into
> a pre-push failure.

---

## 2. Client vs host plane update asymmetry — new UI, stale route

**Symptom:** after the v0.3.8 push, the SVG render toggle appears in the browser
(client half refreshed) but Render 404s on the `.svg` while a `.png` on the *same
route* returns 200 — and no host restart was performed (`release-log.md:19-27`).

A plugin has two halves loaded by two different mechanisms at two different times:

| Half | Code | Loaded where / when |
|---|---|---|
| **Client plane** | `lib/client.js` | Served to the browser as an HTTP artifact; the page **re-fetches it on reload** (no-cache). A browser refresh surfaces new client bytes. |
| **Host plane** | `lib/index.js` | `apply()`-ed into the **long-lived host (Node) process at boot**; the asset route + its extension whitelist are registered **once** and the whitelist is captured **in the route handler's closure**. |

- **Why the new UI reached the browser:** the SVG render toggle is client-plane code.
  A page reload re-fetched the served client bundle, so the new button rendered. The
  client plane is the "front end" and refreshes on reload.
- **Why the new route still 404s:** the asset route is host-plane. It was registered
  into the running process's HTTP router at boot, and the extension whitelist it
  consults is the closure value from that registration time — i.e. the *pre-SVG*
  whitelist. A browser reload does **not** re-run `apply()` and does **not**
  re-register the route; the route handler keeps serving from the stale closure until
  the host **process** is restarted.

**The probe results pin the staleness to the RUNNING process, not the release**
(`asset-route-probe.txt`):

- **PNG → 200 `image/png`:** the route is alive and correctly registered. If the route
  or plugin were missing/unwired, PNG would fail too. A 200 on this route
  specifically proves the handler is mounted and functioning.
- **SVG → 404 `unsupported image type`:** the *live* whitelist rejects `svg`. This is
  the whitelist check firing, not a routing miss.
- **Disk `lib/index.js` WHITELISTS svg:** `lib-index-excerpt.js:12` shows
  `svg: 'image/svg+xml'` is present in the shipped on-disk artifact.

The only way to reconcile "disk artifact is correct" with "serving process rejects
svg" is that the **running host process predates the whitelist change**: it loaded the
old `lib/index.js` at boot, before the SVG entry existed, and has not re-run `apply()`
since. The release is fine; the in-memory process is stale. (`release-log.md:26-27`
confirms: "a host restart had NOT been performed in this session.")

**What makes a host-plane change effective — and why "plugins hot-update" does not
cover it.** A host-plane change takes effect only on a **host restart**, which re-runs
`apply()`, re-reads `lib/index.js` from disk (for a link install the repo edit is
already on disk — the restart is what loads it), and re-registers the route with the
new whitelist. This is the one case where the usual "plugins hot-update" reflex fails:

- The rule everyone leans on — *"a browser reload / plugin hot refresh picks up my
  plugin change"* — is only true for the **client plane**, which is a
  re-fetched artifact. The `troubleshooting.md` S19 row states it directly:
  「插件热更新」只覆盖 client 面. Host-plane registrations are boot-time and
  closure-captured; hot refresh never reaches them.
- This is the same principle the skill enforces for global host upgrades: **"a browser
  refresh is not a host stop"** (`SKILL.md` global-host-upgrade discipline). Stopping
  or refreshing the browser does nothing to the host process's loaded modules.

> **Nuance from the reference corridor (DSH-0.1.7-A2-04):** from 0.1.7-alpha.2, host
> halves caches client bundles **at host boot** too, so even an install-tree client
> edit no longer takes effect on refresh alone — only a restart serves new client
> bytes, and the auto-reconnect can leave an open page running *pre-restart* client
> bytes while it looks healthy. The verification consequence: to prove which half is
> stale, **inspect the served content** (fetch the client bundle URL and check its
> bytes), not merely whether the page responds or a toggle appears. That is precisely
> the attribution contrast this section rests on — old type 200 + new type 404 + disk
> artifact correct ⇒ the running host process predates the change.

---

## 3. Broken-image attribution — the source is fine; the *stored copy* is spliced

**Symptom:** one traced SVG renders as a broken image, yet the source file on disk is
well-formed XML and a re-read comes back clean. This is *not* a corrupt source file.

**Where the corruption happened: in the upstream result-text assembly, not the file,
not the read tool, not the plugin.** The `session-log-excerpt.txt` evidence is
decisive on three fronts:

1. **The read tool's own result was clean.** `session-log-excerpt.txt` §4: "The read
   tool's TYPE result delivered to the caller was clean; the corrupted text is the
   model-visible result block persisted into the session log." So bytes left the read
   tool correctly.
2. **The source file is well-formed; the persisted payload is not.**
   - Source (`session-log-excerpt.txt` §2/§3): `well-formed (System.Xml XmlDocument
     load: no error)`.
   - Log payload (`session-log-excerpt.txt` §1/§3): `NOT well-formed — "error on line
     233 at column 54: Specification mandates value for attribute stro0"`.
3. **The corruption has a precise shape — a mid-file splice on a shared prefix**
   (`session-log-excerpt.txt` §4):
   - payload line 232 = **source line 232's prefix** (up to `…stroke="#dde6ea" stro`)
     **+ source line 247's tail** (from the arc's `0,1 821,730" …` onward).
   - **source lines 233–247 are dropped** (~15 lines vanish).
   - the join lands on the shared prefix `"stro"` (`stroke-width…` vs. line 247's arc
     flag `0 0,1`), fusing into a bogus attribute `stro0` — which is exactly the XML
     error the parser reports.
   - a later re-read of the same region returned clean => the corruption is
     **non-deterministic**, a hallmark of an assembly race, not file damage.

A file on disk cannot produce "lines 233–247 missing, line 247's tail grafted onto
line 232 at a shared prefix" and then read back well-formed. Only the *layer that
assembles the model-visible result text from the read result* could. **Attribution:
upstream session-payload assembly defect** (the `troubleshooting.md` S19 row +
`discussion #5120`), upstream of the plugin. The plugin only *consumes* the persisted
text as render input.

**Why the plugin must treat the session payload as untrusted rendering input.** The
persisted payload is a *copy* produced by an upstream, non-deterministic, lossy-ish
assembly step — it is demonstrably not a faithful reproduction of the source. Two
corroborating facts from the reference corridor reinforce this: the `SessionHandle`
`write` path is the session's *single mutator* while a `read` path is a live view
(DSH-0.1.3-A1-05), and the spill-policy deliberately retains only a head+tail token
budget of tool-result text (DSH-0.1.7-A2-01 `maxInlineTokens`), so the payload the
plugin later sees may be *truncated by design*. Rendering straight from it means any
upstream defect (a splice here, a spill truncation there) surfaces only as a silent
broken image. The payload is therefore a *hint* to be validated, never an authority.

**Why editing / "repairing" the traced file would have been the wrong move.**

- **There is nothing to repair in the file** — it is already well-formed; the defect
  is not in the bytes on disk. Rewriting the SVG changes nothing and destroys a good
  artifact.
- **It cannot fix the symptom** — the corruption is upstream of the file, so a clean
  file does not stop the assembly layer from persisting a spliced payload next time
  (it is non-deterministic).
- **It masks the real bug** — the correct action is to *report* the upstream
  text-corruption bug with the frame-decoded evidence, not to paper over it in the
  plugin or mutate the traced artifact. The append-only session log and the trace file
  must stay untouched (cf. DSH-0.1.3-A1-01: the migrator is fail-closed and leaves the
  source artifact unchanged; A1-06: never hand-write session logs).

---

## 4. Defensive render chain — validated, multi-source, explicit-failure

Design the SVG preview's render source so the authoritative bytes win, untrusted text
is validated before it is trusted, and a bad input never becomes a silent broken
image. Order and justification:

**Level 1 — disk-bytes asset route first (authoritative).**
Render from the file's real bytes fetched through the host asset route
(`GET /dsh-file-trace/asset?path=…`), decoded as bytes/ArrayBuffer, not from any
persisted text. *Justification:* the on-disk file is the ground truth and is verifiably
well-formed; the asset route returns the canonical bytes (once the host is restarted so
`svg` is whitelisted — see §2). This sidesteps every copy-layer defect by never using a
copy. Optionally validate the served bytes server-side before returning them, so the
client only ever receives bytes that parses.

**Level 2 — session payload only after an XML well-formedness gate.**
Only if Level 1 is unavailable, consider the session-payload text, and **only** after a
strict well-formedness check passes: browser `DOMParser().parseFromString(text,
'image/svg+xml')` and reject if the result contains a `parsererror` node (Node/host
side equivalent: a strict XML load à la `System.Xml XmlDocument`, or a validating
parser). *Justification:* the payload is untrusted (§3) and subject to splice and
spill truncation. A `parsererror`/load failure is a hard stop — malformed text never
reaches the renderer. This gate is what converts "silent broken image" into a detected
bad input.

**Level 3 — sandboxed iframe as the last render fallback.**
When neither the authoritative bytes nor a validated payload can render inline, fall
back to an `<iframe sandbox>` carrying the content with **no `allow-scripts`** (and no
`allow-same-origin`, so it gets an opaque origin and cannot reach the parent DOM).
*Justification:* the SVG is untrusted third-party content, so it is isolated in its own
opaque browsing context — script/XSS vectors in the markup are blocked. Crucially,
**SMIL animations still run**: `<animate>`/`<animateTransform>` are *declarative*
rendering behaviour executed by the SVG engine, not JavaScript, and are **not** gated by
the sandbox's script permission. So the sandbox blocks scripts while preserving the
declarative motion a render preview is supposed to show. (Use `srcdoc`/Blob URL, set an
explicit size, keep the iframe `pointer-events` constrained as needed.)

**Level 4 — explicit error state instead of a silent broken image.**
If all levels fail (asset route errors *and* the payload fails its well-formedness
gate), render an explicit error state: a clear "cannot preview this file — the stored
copy failed validation" notice plus a link/action to **re-read from disk**. *Justification:*
a broken `<img src="…svg">` conveys nothing to the user and hides the real fault. An
explicit state (a) stops rendering garbage, (b) prompts the disk re-read that recovers
a good render, and (c) surfaces readable evidence that feeds the upstream bug report —
exactly what §3/§5 need. Never `try { render } catch { <broken img> }` silently.

Net order: **asset-route disk bytes → (gated) session payload → sandboxed iframe →
explicit error**, validating at every hop and failing *loudly*, never silently.

---

## 5. Forensics method + prevention

### 5a. Decoding the session log frame-by-frame to recover the exact stored text

The session log is an **append-only JSONL archive compressed as concatenated Zstandard
frames** — the artifact the host writes is `session.vN.jsonl.zstd` (per the
DSH-0.2.0-rc-1 card: the running session's `session.v4.jsonl.zstd` is being appended
live). Each appended generation is its own zstd frame, laid end-to-end; every frame
starts with the Zstandard magic **`0xFD2FB528`** (on disk: bytes `28 B5 2F FD`).

To recover the **exact** stored text for the read-result event (payload ~line 232),
rather than re-rendering through the live read path (which, per §3, returns *clean*
text and hides the defect):

1. **Prefer the official read surface** — a `SessionHandle` `read` or the read-event
   API (DSH-0.1.3-A1-05/A1-06) — as the authoritative parsed view. It is not
   byte-level, so for *proof of corruption* decode the raw artifact.
2. **Decode the concatenated zstd frame-by-frame.** `zstd -d` follows concatenated
   frames seamlessly; for per-generation recovery use the streaming API
   (`ZSTD_decompressStream`, which reports each frame's consumed bytes) or split on the
   `0xFD2FB528` magic to seed each frame independently. Because zstd is **lossless**
   with a per-frame checksum, the decoded bytes are **exactly** the stored bytes — the
   frame boundaries give you the precise append/generation that holds the tool-result
   text, and let you isolate the exact record instead of diffing a whole stream.
3. **Extract the stored `text` field verbatim** from that frame/event (payload line 232
   region) with **no** re-encoding, then **diff byte-for-byte** against a clean re-read
   of the source disk file.
4. **Run the XML verdict on both.** The diff + verdict reproduce the exact shape:
   source = well-formed; payload = `error on line 233 at column 54: Specification
   mandates value for attribute stro0`, the splice fusing `source-232-prefix +
   source-247-tail` at the shared prefix `"stro"` with lines 233–247 dropped.

That frame-decoded stored text, plus the byte-diff and the XML verdicts, is what turns
"a broken image in one render" from an anecdote into reproducible evidence of an
upstream assembly defect. **Read-only throughout:** decoding is safe, but per
DSH-0.1.3-A1-06 never hand-write/rewrite the log, and per A1-01 treat mixed
writer-generations as migration cases the migrator refuses fail-closed — do not "fix"
the artifact. (Node `zlib` zstd decompression is version-dependent on Node ≥ 22.15+ /
23.x; otherwise use the `zstd` CLI or `libzstd`/`@mongodb-js/zstd`.)

### 5b. Release-checklist items this incident adds

1. **Version-bump-BEFORE-build.** Always bump `package.json` first, then `build`, so
   the bundle inlines the intended version. (§1; v0.3.8 already fixed the order.)
2. **Grep the shipped bundle for the baked constant before commit/tag.** After `build`,
   assert the inlined `PLUGIN_VERSION` in `lib/client.js` equals the `package.json`
   version equals the packed manifest version. This pre-push gate catches a stale
   build-then-bump constant deterministically (§1) and is the single check that would
   have stopped the phantom badge.
3. **Per-mirror tag SHA verification — necessary but not sufficient.** After pushing the
   tag, `git ls-remote --tags` each mirror and assert the tag SHA matches across them
   (here `748b5e56…v0.3.7` identical on origin/public/omdsh). This confirms identical,
   correctly-tagged bytes everywhere — but it cannot see a stale constant *inside*
   those bytes, so it must be paired with item 2, never substituted for it.
4. **Report the upstream text-corruption bug; do not paper over it.** File the
   frame-decoded evidence (stored text, byte-diff, XML verdicts, clean re-read) against
   the upstream assembly defect (`discussion #5120`) instead of mutating the traced
   file or sanitizing the payload in the plugin (§3).
5. **(Added, from §2 / DSH-0.1.7-A2-04): host-restart + verify-served-content for any
   host-plane feature.** A new host route/whitelist is not effective until a **host
   restart**; and because newer hosts cache client bundles at boot, verify by
   *inspecting served bytes*, not by whether the page or a toggle responds. Checklist:
   for host-plane changes add "restart host → re-probe the new behavior → inspect the
   served artifact content", and never treat a browser refresh as a host stop.

---

## Skill-convention report wrap-up

- **Completed (read-only):** root-caused all three symptoms from primary fixture
  evidence — (1) phantom badge = build-time `PLUGIN_VERSION="0.3.6"` baked by a
  build-then-bump order; (2) stale host route = boot-time registration + closure
  whitelist in the *running* process, needing a host restart, orthogonal to the
  refreshed client plane; (3) broken image = upstream non-deterministic session-payload
  splice (source clean, re-read clean), not a file defect. Designed the validated
  disk→payload→sandbox→error render chain and the frame-by-frame zstd decode method.
- **Skipped (with evidence):** mirror/tag integrity as a cause of the phantom badge
  (`git-tags.txt` shows identical SHAs on all three mirrors — distribution is fine);
  "corrupt/broken source SVG" as a cause of the broken image (§3 disk file is
  well-formed and re-read is clean).
- **Pending / residual risk:** the upstream text-corruption bug and the session-log
  result-assembly defect are *not fixable in this plugin* — they require an upstream
  fix (report via `discussion #5120`); until then the §4 validation gate is the only
  plugin-side mitigation. Per-plane exact Node/zstd tooling versions are
  environment-dependent (Node `zlib` zstd only on recent Node).
- **Rollback:** none required — this is Mode A, no files/systems were changed. The
  v0.3.7 incident's own recovery (amend + rebuild + force-move tag on all mirrors) is
  recorded in `release-log.md:14-15`.
- **Recommendations:** add CI items 5b-1/5b-2 (bump-before-build + grep-baked-constant
  === version === packed manifest); add 5b-5 host-restart/served-content step for
  host-plane features; adopt the §4 render-source order in the SVG preview and gate all
  session-payload rendering behind a well-formedness check; file the upstream
  text-corruption report with the frame-decoded evidence.

**Grounding (all read-only, within allowed paths):** fixture primary evidence;
`skills/plugin-upgrade/references/troubleshooting.md` (the three S19 symptom→root-cause
rows); `v0.1.7-alpha.2.md` DSH-0.1.7-A2-04 (client bundles cached at host boot; refresh
vs restart; verify served content) and A2-01 (spill-policy head/tail truncation);
`v0.1.3-alpha.1.md` A1-05 (SessionHandle single-mutator/read), A1-06 (Session log format
v2, prefer official read surface, never hand-write), A1-01 (fail-closed, source artifact
untouched); `v0.2.0-rc.1.md` (`session.v4.jsonl.zstd`); `SKILL.md` global host-upgrade
discipline ("a browser refresh is not a host stop"). Sibling skills
(`plugin-release`/`plugin-runtime-debug`) are cited by the troubleshooting rows but lie
outside the workspace read boundary and were not opened.
