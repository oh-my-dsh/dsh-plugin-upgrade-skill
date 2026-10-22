# S19 — The Phantom Update, the Stale Host Half, and the Corrupted Payload

Analysis of the 2026-09-05 release session for `@dsh-external/dsh-file-trace`
(v0.3.7 / v0.3.8). Three symptoms, three distinct root causes, one underlying
theme: **each failure is a stale-or-untrusted copy of a value that someone
mistook for the authoritative one.**

| Symptom | Root cause | One-line verdict |
|---|---|---|
| Node badge "新版：v0.3.7 可用" on the freshly released v0.3.7 | **stale build-time constant** — build ran before the version bump | local constant 0.3.6 vs live tag v0.3.7 → phantom "newer" |
| Client SVG toggle visible, but host SVG route 404s | **stale running-process registration** — host never restarted | release is correct on disk; the *running* host holds the pre-svg whitelist |
| Broken image for one traced SVG | **upstream session-payload corruption** — not the file | corrupted model-visible result text rendered verbatim; disk file is well-formed |

## 0. Evidence map

Every claim below is anchored to a read-only fixture file:

| Fixture file | What it pins |
|---|---|
| `release-log.md` | maintainer's actual v0.3.7 operation order (commit → build → bump → tag → push); the v0.3.8 correction; the "host NOT restarted" note |
| `client-bundle-excerpt.js` | the shipped bundle bakes `PLUGIN_VERSION = "0.3.6"` (from package.json *at build time*) and compares it to the newest mirror tag |
| `git-tags.txt` | all three mirrors carry identical, SHA-verified tag SHAs; the self-update check does `git ls-remote --tags` and picks the highest `vX.Y.Z` |
| `lib-index-excerpt.js` | the on-disk host half at v0.3.8 **does** whitelist `svg: 'image/svg+xml'` |
| `asset-route-probe.txt` | PNG 200 `image/png`, SVG 404 `"unsupported image type"`, browser confirmed refreshed, host not restarted |
| `session-log-excerpt.txt` | the stored read-result payload is spliced (head of source line 232 + tail of source line 247); disk file well-formed; re-read clean |
| `package.json` | manifest committed at 0.3.8 |

---

## 1. Phantom self-update root cause

### Where the compared constant comes from (build time vs runtime)

The self-update badge logic (`client-bundle-excerpt.js`) is:

```js
export const PLUGIN_VERSION = "0.3.6";      // baked at BUILD time from package.json
function newerTag(latestTag) {
  return latestTag !== undefined && compareSemver(latestTag, PLUGIN_VERSION) > 0
    ? latestTag : undefined;
}
```

The comment states it explicitly: *"tsdown inlined this constant from package.json
WHEN THE BUNDLE WAS BUILT — it is not read dynamically at runtime."* `PLUGIN_VERSION`
is a **compile-time/inlined literal**, not a runtime read of the manifest. The
running version lives in a source-level snapshot captured by the bundler. The
*other* operand — `latestTag` — is genuinely runtime: `git ls-remote --tags` on the
three mirrors, picking the highest `vX.Y.Z` (`git-tags.txt:11`).

So the badge is `compareSemver(newestLiveTag, bakedLiteral)` and the badge fires
whenever the newest live tag is strictly greater than the baked literal.

### The actual operation-order mistake

`release-log.md` (v0.3.7) records, with timestamps:

```
16:20 edit src/client/markdown.tsx + regression tests
16:21 typecheck green; vitest 104 passed
16:22 pnpm run build   ← client bundle emitted    (BUNDLE BUILT HERE)
16:23 bump package.json 0.3.6 → 0.3.7            (VERSION BUMPED AFTER)
16:23 README install refs → #v0.3.7
16:24 git commit (includes the already-built lib/client.js) and git tag v0.3.7
16:25 push main + tag to three mirrors; ls-remote tag SHA verified on all three
```

The build ran at **16:22** against a manifest that still read **0.3.6**; tsdown
froze `PLUGIN_VERSION = "0.3.6"` into `lib/client.js`. The version was only bumped
to 0.3.7 at **16:23**, i.e. *after* the bundle had already captured the old
value. The commit at 16:24 then shipped that stale-built bundle and tagged it
v0.3.7. Net effect, exactly as `client-bundle-excerpt.js:16` annotates:

```
newerTag("v0.3.7")  with PLUGIN_VERSION "0.3.6"  →  "v0.3.7"  →
badge shows "新版 v0.3.7 可用" on the just-released v0.3.7.
```

The plugin is not "announcing the future" — it is comparing a *stale self-image*
(0.3.6) to the correct live tag (0.3.7), concluding it is out of date, and
recommending itself. The comparison is self-referential because the "latest"
version and the "current" version are the same release (both 0.3.7); only the
baked copy of "current" is wrong.

With a correctly built bundle the bug vanishes: `PLUGIN_VERSION = "0.3.7"` versus
newest tag `"v0.3.7"` yields `compareSemver == 0`, not `> 0`, so `newerTag`
returns `undefined` and no badge renders.

### Why mirror/tag integrity is irrelevant here

`git-tags.txt` shows identical, SHA-verified tag SHAs across origin / public /
omdsh, and the excerpt confirms the check reads exactly those tags. That is the
*intended* input: the self-update is **supposed** to see `v0.3.7` as the newest
tag, and all three mirrors agree it is. The failure is not in the remote value —
the remote is correct and consistent — it is in the **local comparison operand**
(the baked 0.3.6). Verifying tag SHA per mirror proves the mirrors are not
diverged or poisoned; it says nothing about whether the bundle's baked literal is
stale, because the baked literal never touches the remote. In fact correct mirrors
are a *prerequisite* for the badge to fire with the right number — mirror
integrity cannot, by construction, detect a build-time constant that was frozen
one step too early.

The integrity that was actually missing is **build-artifact/manifest
consistency**, a purely local and pre-push property. The release log contains no
step that asserts the built bundle agrees with the manifest being tagged.

### Corrected release order + the pre-push check that catches it

Correct order (the fix the session itself applied for v0.3.8, per `release-log.md`
— *"the rebuild order was corrected for v0.3.8 (bump FIRST, then build)"*):

```
1. bump package.json FIRST            (0.3.6 → 0.3.7)
2. build                              (bundler inlines the NEW 0.3.7)
3. commit (the freshly built bundle)
4. tag v0.3.7
5. push and verify tag SHA per mirror
```

i.e. **version-bump-before-build**. An early warning is the mtime relationship:
after a correct release the emitted bundle must be newer than the manifest; in the
v0.3.7 log the manifest (16:23) is newer than the bundle (16:22) — a stale build.

**The check that would have caught it before pushing:** a pre-tag assertion that
the shipped bundle's baked constant equals the manifest version equals the tag
being pushed. Concretely:

```sh
BUILT=$(grep -oE 'PLUGIN_VERSION = "[^"]+"' lib/client.js)   # -> PLUGIN_VERSION = "0.3.6"
MANIF=$(jq -r .version package.json)                          # -> 0.3.7
[ "PLUGIN_VERSION = \"$MANIF\"" = "$BUILT" ] || { echo "stale baked version"; exit 1; }
```

Grepping the emitted bundle for the inlined constant and diffing it against the
manifest/tag fails fast on the v0.3.7 bundle (`0.3.6` ≠ `0.3.7`) and would have
blocked the tag before any push. This single line was absent from the v0.3.7
sequence.

---

## 2. Client vs host plane update asymmetry

The v0.3.8 push carried two kinds of code that refresh by two different
mechanisms:

- **Client plane** — the browser half (`lib/client.js`). The browser **re-fetches**
  this bundle from the running host's static serving on the next page load/reload.
  Nothing is "restarted"; a reload simply downloads the fresh file. That is why the
  new SVG render **toggle appeared** as soon as the browser refreshed.
- **Host plane** — the server half (`lib/index.js`). Its route handlers and the
  `CONTENT_TYPES` whitelist they close over are **registered into the host router
  at boot**, when the plugin is loaded/activated by the process. Disk contents are
  read once, at that moment, into the running router table.

A `git pull` / link-install update mutates the *files on disk*. The client half
picks that up on the next browser fetch; the host half does **not**, because the
running process keeps the handler it bound at boot.

### Why the client UI reached the browser but the new host route still 404s

`release-log.md` is explicit: *"a host restart had NOT been performed in this
session (the client half was confirmed refreshed: the new toggle button was
rendered by the browser)."* The freshly served client bundle brought the toggle;
the host process was still executing the pre-svg route table it loaded at its last
boot.

### How the probe results pin the staleness to the RUNNING host process

`asset-route-probe.txt` yields a three-cornered proof:

| Observation | What it proves |
|---|---|
| PNG → **200** `image/png` | the asset-route handler is **alive and mounted** — the route exists and can stream disk bytes |
| SVG → **404** `"unsupported image type"` | the running **whitelist rejects svg** — this exact string is the whitelist branch, not a missing route |
| disk `lib/index.js` **has** `svg: 'image/svg+xml'` (`lib-index-excerpt.js`) | the **release is correct**; the shipped code whitelists svg |

Each competing explanation is eliminated:

- If the **release** were at fault, disk `lib/index.js` would not contain the svg
  entry — but it does.
- If the **route were missing**, the PNG probe would 404 too — but it returns 200.
- Therefore the discrepancy (route alive + rejects svg + disk has svg) can only be
  a **stale in-memory copy** inside the *running* process: it booted before the
  whitelist change and still consults the old `CONTENT_TYPES` closure.

The staleness is provably in the process, not the artifact.

### What makes a host-plane change effective — and why "plugins hot-update" fails here

A host-plane change (route registration, whitelist, handler) becomes effective only
on **host restart**, because re-delivering `lib/index.js` on disk does not re-run
its registration against the live router — the running router still points at the
old closure over the old `CONTENT_TYPES`. Only a restart re-executes `lib/index.js`
and re-mounts the route with the new whitelist.

This is the **one case where the usual "plugins hot-update" rule does not hold.**
"Hot-update" (self-update / re-delivering the plugin taking effect without
restarting the world) is true only for the **client half**, which the browser
re-fetches on reload. It does **not** extend to the **host half**, whose handlers
are bound **once at boot**. Same single push, two planes, two refresh triggers:
client = next browser reload; host = next process restart. The maintainer observed
the (valid) client refresh and incorrectly generalized "it updated" to the host
side — so they documented a feature as shipped while the server half was still
running the old code.

---

## 3. Broken-image attribution

The recorded facts (`session-log-excerpt.txt`):

- **Source file on disk:** well-formed (`System.Xml XmlDocument load: no error`).
- **Stored session-log payload:** malformed — `error on line 233 at column 54:
  Specification mandates value for attribute stro0`.
- **Re-read afterward:** clean, and **non-deterministic**.

### Where the corruption happened (which layer produced it)

The payload's line 232 is a **splice**:

```
payload line 232 = source line 232 head ("...stroke=\"#dde6ea\" stro")
                  + source line 247 tail ("0,1 821,730\" fill=\"none\" ...round\"/>")
```

joined at the coincidental shared fragment `stro`, and source lines **233–247 are
missing** entirely. The spliced attribute `stroke="#dde6ea" stro0,1 821,730"` reads
as an attribute `stro0` with no value, which is precisely the XML error the verdict
reports.

Per the fixture: *"the read tool's TYPE result delivered to the caller was clean;
the corrupted text is the model-visible result block persisted into the session
log, i.e. the corruption happened in the **result-text assembly**, **upstream of the
plugin**."* The file on disk, and the read path itself, are both fine. The
corruption was introduced while assembling/persisting the tool's model-visible
result text into the session record — a task boundary that drops/re-overlaps text
chunks. The clean, non-deterministic re-read confirms the defect lives in that
transient assembly, not in a property of the file or the reader.

So the broken image attributes squarely to the **upstream harness/session
result-text-assembly bug**, rendered verbatim by the preview feature. It is *not*
the traced file's fault and *not* a defect in the plugin's SVG drawing code.

### Why the plugin must treat the session payload as untrusted rendering input

The preview pulled the SVG text out of the session payload. But this episode
demonstrates the payload can be **mutated in transit** — whole lines dropped
(233–247), another line's tail spliced at a shared prefix, producing malformed
XML. A model-visible result block is therefore *untrusted, lossy rendering input
by construction*, not ground truth. Rendering it without validation renders
whatever the assembly happened to emit. The plugin must (a) prefer the
authoritative disk bytes and (b) never hand the payload to the renderer until it
has passed an XML well-formedness gate.

### Why editing or "repairing" the traced file would have been the wrong move

- The disk file was **already well-formed** — editing it would *corrupt a good user
  artifact* to compensate for damage done elsewhere.
- It **masks the real bug**: patching the file (or the output) paper-overs the
  upstream result-text-assembly corruption instead of surfacing it.
- It **would not even fix the render**: the breakage travels via the *session
  payload*, which would keep mutating regardless of how clean the disk file is.
- It **destroys the evidence**: the clean re-read and the well-formedness verdict
  are what prove the corruption is upstream and non-deterministic; "repairing"
  the file erases the forensic baseline.

The correct response is unchanged deliverables — render from disk bytes or a
validated payload — and an upstream bug report carrying the decoded evidence
(§5).

---

## 4. Defensive render chain (SVG preview)

The render source is chosen in strict order; each level is justified by the
failure it defends against.

**Level 1 — disk-bytes asset route (authoritative).**
Fetch the SVG's actual bytes through the host asset route (the same fixed route
that already serves the PNG at 200). This is the ground truth, read directly from
disk, immune to the session-layer splice and to any model-visible transformation.
*Justification:* the entire §3 incident is proof that every in-session copy is
lossy/corruptible; the on-disk file is the only thing proven well-formed. Attempt
the source that cannot lie first.

**Level 2 — session payload, but only after an XML well-formedness gate.**
If the asset route is unavailable, fall back to the payload, but parse it first:

```js
const doc = new DOMParser().parseFromString(payloadText, "image/svg+xml");
const isWellFormed =
  !doc.getElementsByTagName("parsererror").length &&
  !doc.querySelector("parsererror");
if (!isWellFormed) { /* do NOT render; drop to Level 3 */ }
```

Render the payload only if it contains no `parsererror` element. *Justification:*
the payload is convenient and already in memory, but it is untrusted — the gate
catches exactly the §3 malformation (an attribute `stro0` with no value yields a
`parsererror`), so a corrupted text can never reach the renderer and produce a
silent broken image. This is the correct place to spend validation effort: on the
one input that has demonstrably produced bad output.

**Level 3 — sandboxed iframe as the last render fallback.**
As a final containment boundary, render the bytes inside an `<iframe>` whose
`sandbox` omits `allow-scripts`:

```html
<iframe sandbox="" src="blob:..."></iframe>
```

With no `allow-scripts`, JavaScript embedded in the SVG cannot execute, but **SMIL
animations still run** — `<animate>`, `<animateTransform>`, `<animateMotion>` are
declarative presentation-time animations driven by the SVG timeline, not script,
so the sandbox does not stop them. *Justification:* a traced SVG is
arbitrary/possibly-hostile input; the iframe isolates its scripts from the host
page (defense in depth for a *well-formed but malicious* SVG, which Levels 1–2
will happily pass), while preserving the animated preview the feature is meant to
show. It is last because it is the heaviest containment and only useful once valid
bytes exist. (Do not pair `allow-scripts` with `allow-same-origin` — that
combination is escapable; here we need neither, so `sandbox=""` alone is enough.)

**Level 4 — explicit error state, never a silent broken image.**
If every level fails (no disk bytes, payload fails the gate, iframe cannot be
constructed), show a concrete error: *"Preview unavailable — source not available
or not well-formed SVG."* *Justification:* a silent broken image hides the true
cause and invites exactly the §3 misattribution — blaming the traced file. An
explicit error surfaces the real problem (source mismatch / non-well-formed
payload) to the user and keeps the upstream bug observable.

Order rationale: correctness (disk ground truth) → gated convenience (validated
payload) → security containment (sandbox for valid-but-hostile) → honest failure.

---

## 5. Forensics method + prevention

### Decoding the concatenated-zstandard generation file frame-by-frame

The session log is a concatenated-Zstandard generation file: many independent zstd
frames back-to-back in one stream, each frame typically compressing one
newline-delimited JSON record (one generation/turn, incl. its recorded result
text). To recover the *exact* stored text of one result:

1. **Iterate frames.** Use `zstd -d` / `zstdcat`, which decompress all concatenated
   frames in a single pass by default; or, programmatically, loop a
   `ZstdDecompressor`, taking each frame's compressed size
   (`ZSTD_findFrameCompressedSize` / the decompressor's `unused_data`) to locate
   the next frame boundary and building a fresh decompressor per iteration so the
   frame↔record mapping is preserved.
2. **Parse each frame** as one JSONL record. Select the record whose role/message
   is the read-tool **RESULT** for the SVG path.
3. **Read that record's stored `content`/result text** — this is the exact
   persisted (corrupted) payload, byte for byte, including the spliced line 232
   and the dropped lines 233–247.
4. **Diff** the stored text against (a) the on-disk SVG lines and (b) a fresh
   re-read. Documented result: disk well-formed, stored payload malformed at
   `line 233 col 54: attribute stro0`, re-read clean. That triangle proves the
   corruption is in the persisted result-text assembly and is non-deterministic —
   converting the "broken image" anecdote into reproducible, court-grade evidence.
   The verdict is independently reproducible with any conformant XML parser
   (`System.Xml XmlDocument`, `xmllint`, `DOMParser`).

### Release-checklist items this incident adds

1. **Version-bump-before-build.** Bump `package.json` *first*, then build, so the
   bundler inlines the new constant; then commit the fresh bundle, tag, push.
   Guard with the mtime invariant (bundle must be newer than the manifest) or an
   explicit "bumped before build" CI order check. (Fixes the v0.3.7 order; matches
   the v0.3.8 correction.)
2. **Grep the shipped bundle for the baked constant.** Before tagging/pushing,
   assert the bundle's inlined version equals the manifest equals the tag:
   `grep -oE 'PLUGIN_VERSION = "[^"]+"' lib/client.js` must match `jq -r .version
   package.json`. This is the exact check that would have caught the phantom
   badge before any push.
3. **Per-mirror tag SHA verification.** `git ls-remote --tags` on *each* mirror and
   assert identical SHA for every tag. Keep it — but note it guards a **different
   failure class** (mirror divergence/poisoning). It cannot detect the phantom
   self-update, because in that failure the remote is correct and the bug is a
   local baked constant.
4. **Host-plane change ⇒ restart host and re-probe.** *(Added from §2.)* After any
   `lib/index.js` route/whitelist change, restart the host and re-run the asset
   route probes before declaring the feature broken; a client reload does
   **not** refresh boot-time host-side registration. Do not mark a host-plane
   feature "shipped" on the strength of the client half alone.
5. **Report the upstream text-corruption bug; do not paper over it in the plugin.**
   File the result-text-assembly splice upstream, attaching the decoded frame, the
   corrupted payload, the XML verdict, and the clean re-read. The plugin's job is
   to **defend** (treat the payload as untrusted; render disk-first; error
   explicitly), never to **hide** the upstream bug by editing the traced file,
   swallowing the error, or shipping a "fix" that repairs good files.

---

## 6. What this bundle of incidents teaches

The three failures are one lesson in three costumes: a check is only as good as the
freshness and trustworthiness of the value you feed it.

- The self-update compared against a **stale baked constant** frozen one build too
  early, so correct mirrors produced a false "newer version available."
- The host asset route ran a **stale in-memory whitelist** because boot-time
  registration was not refreshed by the same reload that refreshed the client.
- The preview rendered a **corrupted session payload** because an untrusted
  model-visible text block was treated as ground truth.

Fix the freshness (bump→build), fix the refresh model (host restart for the
server half), and fix the trust model (disk-first + XML gate + explicit error) —
and report the upstream corruption rather than hiding it. That is the whole
postmortem.
