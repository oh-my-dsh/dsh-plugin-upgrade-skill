# S19 — The Phantom Update, the Stale Host Half, and the Corrupted Payload

Task: S19-phantom-update-stale-host (read-only analysis of the `@dsh-external/dsh-file-trace`
v0.3.7/v0.3.8 release evidence pack). All findings below are grounded in the fixture files;
nothing in the fixture was modified.

---

## 1. Phantom self-update root cause ("新版本 v0.3.7 可用" on v0.3.7 itself)

**Where the compared constant comes from.** The shipped client bundle
(`client-bundle-excerpt.js`) contains:

```js
export const PLUGIN_VERSION = "0.3.6";
```

The comment in the bundle is explicit: tsdown **inlined this constant from `package.json`
at build time**; it is not read dynamically at runtime. The self-update check runs
`newerTag(latestTag)`, which compares the highest `vX.Y.Z` tag from `git ls-remote --tags`
(no auth, per `git-tags.txt`) against the *baked* constant and shows a badge when
`latest > PLUGIN_VERSION`. With the constant stuck at `0.3.6` and the newest tag being
`v0.3.7`, `compareSemver("v0.3.7", "0.3.6") > 0` → the just-released v0.3.7 announces an
update to itself.

**The actual operation-order mistake.** `release-log.md` pins it precisely:

- 16:22 `pnpm run build` — client bundle emitted ← **build ran here**
- 16:23 bump `package.json` 0.3.6 → 0.3.7 ← **version bumped AFTER the build**

The bundle was built while `package.json` still said `0.3.6`, so the inlined constant
froze at 0.3.6. The bump afterwards changed only the manifest on disk; the already-emitted
`lib/client.js` was never rebuilt. The commit at 16:24 shipped the stale bundle, and every
mirror then served code that self-identifies as one version older than it is.

**Why mirror/tag integrity is irrelevant.** `git-tags.txt` shows all three mirrors
(origin / public / omdsh) list both `v0.3.7` and `v0.3.8` with byte-identical SHAs
(`748b5e5…` / `d887deb…`). The integrity check verified *that the same bytes reached every
mirror* — it says nothing about *what those bytes contain*. The corruption is inside the
artifact (a build-time constant baked from a not-yet-bumped manifest), so verifying the tag
SHA on every mirror faithfully confirms the distribution of the defective bundle. The
plugin then fetches exactly these tags and compares against its stale constant, so the more
perfectly the mirrors agree, the more reliably the phantom badge appears. Tag verification
checks the transport channel, not the build inputs.

**Corrected release order** (as the log notes was done for v0.3.8):

1. edit source + tests;
2. **bump `package.json` version FIRST**;
3. typecheck / test;
4. `pnpm run build` (bundle now inlines the new version);
5. update README install refs to the new tag;
6. commit, tag, push to mirrors;
7. verify tag SHA on each mirror.

**The check that would have caught it before pushing:** after the build and before the
commit/push, **grep the emitted bundle for the baked constant** and assert it equals the
manifest version, e.g.:

```sh
grep -o 'PLUGIN_VERSION = "[0-9.]*"' lib/client.js   # must show the just-bumped version
# or: node -e "import('./lib/client.js').then(m => console.assert(m.PLUGIN_VERSION === require('./package.json').version))"
```

A one-line "shipped constant == manifest version" assertion between build and tag turns
this whole class of incident into a failed pre-push step. (The actual recovery — amend,
rebuild, force-move the tag on all mirrors — is exactly what a pre-push check avoids
needing.)

---

## 2. Client-plane vs host-plane update asymmetry (SVG toggle visible, SVG asset 404s)

**Where each half loads.** The two plugin halves have fundamentally different lifecycles:

- **Client half** (`lib/client.js`) is fetched by the **browser** and is refreshed by a
  client re-fetch/reload — no host process involvement. That is why the new v0.3.8 SVG
  render toggle appeared and was clickable: the browser was running the new client code.
- **Host half** (`lib/index.js`) is loaded by the **DSH Node process at plugin
  activation/boot**; its `apply()` registered the asset route's extension whitelist
  (`CONTENT_TYPES`) **once, when the host process started** — before the SVG whitelist
  change existed. Replacing the file on disk does not re-run `apply()` in a live process.

**How the probes pin the staleness to the RUNNING host, not the release:**

1. **PNG 200 `image/png`** — the route handler itself is alive and answering; the route
   exists and works. So the 404 is not a missing/unloaded plugin or a dead route.
2. **SVG 404 "unsupported image type"** — that exact message comes from the *extension
   whitelist rejecting svg*. The whitelist the running process holds is the pre-v0.3.8 one
   (no `svg` entry).
3. **Disk `lib/index.js` DOES contain `svg: 'image/svg+xml'`** (verbatim in
   `lib-index-excerpt.js`) — the shipped release is correct.

Disk code says svg is allowed; the running process says it is not; the host was **never
restarted** in this session (`release-log.md`). The only component still holding the old
whitelist is the in-memory copy inside the long-lived host process. Conclusion: the
artifact is fine; the **running host is stale**.

**What makes a host-plane change effective:** a host restart (or a full plugin
deactivate/reactivate that re-runs the host half's `apply()`) so the route is re-registered
from the new on-disk code. **Why the usual "plugins hot-update" rule does not hold here:**
client-plugin changes propagate to the browser on re-fetch/reload (that rule is about the
*client* plane, and indeed the client half did hot-update — the toggle appeared). But a
change to the *host* half's registration-time code — a route table, a whitelist captured in
a closure at `apply()` time — only takes effect when that registration runs again. This
incident is precisely the case that breaks the hot-update assumption: a same-session
release where the client plane refreshes automatically while the host plane silently keeps
its boot-time snapshot. The asymmetry (new UI driving an old route) is the signature
symptom: UI presence proves nothing about host freshness.

---

## 3. Broken-image attribution (session-payload corruption, not the traced file)

**Where the corruption happened.** Three independent observations from
`session-log-excerpt.txt`:

- the **source file on disk is well-formed** XML (XmlDocument load: no error), and a
  separate read of the same region is clean;
- the **stored log payload is NOT well-formed** — "error on line 233 at column 54:
  Specification mandates value for attribute stro0";
- the **shape of the damage**: payload line 232 = source line 232 truncated mid-token at
  the shared prefix `stro` + the tail of source line 247 spliced on
  (`0 0,1 821,730…`), with source lines 233–247 entirely absent.

The corrupted text is the **model-visible read-result block persisted into the session
log** — i.e. it was produced **upstream of the plugin**, in the read tool's result-text
assembly/persistence layer, at the moment the result was recorded. The plugin merely
received (and rendered) that already-corrupted text. The disk file was never bad; the
re-read coming back clean marks the corruption as **non-deterministic in that upstream
assembly path**, not a property of the file.

**Why the plugin must treat the session payload as untrusted rendering input.** The payload
crosses a process/persistence boundary (tool result → session log → plugin renderer). Any
text that survives a durable boundary can be truncated, spliced, or stale relative to disk;
this incident is a worked example. The plugin cannot assume payload == file bytes. It must
validate before rendering (well-formedness check), degrade gracefully (explicit error, not
a silent broken image), and prefer a fresher authoritative source when one exists
(disk-bytes asset route).

**Why "repairing" the traced file would have been the wrong move.** The file is not
broken — it is the *only clean copy* in the whole chain. Editing it would (a) destroy
evidence of the upstream bug, (b) corrupt a file that never needed fixing, and (c)
paper over a non-deterministic defect that would keep striking other files. The correct
action is attribution (prove the payload is corrupt and the file is clean — exactly what
the forensics below did) and an **upstream bug report**, not file surgery.

---

## 4. Defensive render chain (design + justification)

Render-source order for the SVG preview, most-authoritative first, each level gated:

1. **Disk-bytes asset route first.** `GET /dsh-file-trace/asset?path=…` streaming the
   file's current bytes from disk. Justification: disk is the source of truth; the bytes
   are fetched at render time, so they are immune to session-log payload corruption and
   staleness, and they bypass text-assembly entirely (binary fidelity). This is also the
   level that made the host-staleness diagnosis possible (PNG 200 / SVG 404), so it
   doubles as a health probe.
2. **Session payload only after an XML well-formedness check.** If disk is unavailable
   (file deleted/moved since the trace), fall back to the persisted read-result text —
   but only after parsing it with `DOMParser` (`application/xml`) and rejecting any
   `parsererror`. Justification: the payload is untrusted (§3); the well-formedness gate
   converts "silent broken image" into a routable decision (use it or show an error), and
   this exact incident's splice fails precisely this check ("mandates value for attribute
   stro0").
3. **Sandboxed iframe as the last render fallback.** Render the (validated) SVG inside an
   iframe with `sandbox` set so **scripts are blocked** (no `allow-scripts`) while SMIL
   (`<animate>`) animations still run — SMIL is declarative and does not require script
   permission. Justification: SVG is executable-adjacent content (embedded `<script>`,
   event-handler attributes, external references); a sandboxed iframe confines any
   residual risk in the rendering context itself, defense-in-depth under the earlier
   text-level checks, without sacrificing the animated preview.
4. **Explicit error state instead of a silent broken image.** When all sources fail or
   validation rejects the input, render a visible error card naming the failing source
   and the reason (e.g. "session payload failed XML validation at line 233"). 
   Justification: a silent broken image is indistinguishable from a bad file and sent
   this investigation chasing the wrong suspect; an explicit state turns the failure into
   diagnosable evidence and stops the user from "fixing" a clean file.

Order rationale: freshness/trust decreases and isolation cost increases down the chain —
disk bytes (authoritative, binary) → validated payload (stale-prone, text) → sandboxed
render (most confined) → error (no render).

---

## 5. Forensics method + prevention

**Decoding the session log.** The session log is a **concatenated-Zstandard generation
file**: multiple independently compressed zstd frames appended in one file. Because
concatenated zstd has no end-of-stream marker semantics for a naive single-frame decoder,
you decode **frame by frame**: read each frame header, decompress that frame with the
zstd streaming API (or `zstd -d` which handles concatenations), feed the decompressed
bytes sequentially, and continue at the next frame offset until EOF. The decoded event
stream contains the persisted read-result blocks; locating the read event for the SVG
(pay-load around line 232) recovers the **exact stored text** — the ground truth needed to
prove the payload (not the file) is corrupt. Comparing stored text vs a fresh disk read vs
the well-formedness verdicts on both is what turned the anecdote "broken image" into
attributed evidence: splice point identified (shared `stro` prefix), missing range
identified (lines 233–247), producing layer identified (result-text assembly upstream of
the plugin).

**Release-checklist items this incident adds:**

1. **Version-bump-before-build** — bump `package.json` *before* running the bundler, so
   build-time-inlined constants carry the new version. Order in `release-log.md` step
   3/4 was the root cause.
2. **Grep the shipped bundle for the baked constant** — post-build, pre-push assertion
   that `PLUGIN_VERSION` in the emitted `lib/client.js` equals the manifest version (§1).
   Catches stale constants regardless of cause.
3. **Per-mirror tag SHA verification** — already practiced (`git ls-remote` on origin /
   public / omdsh, SHAs matched); keep it, but understand its scope: it certifies
   channel integrity, not artifact correctness. It is necessary, not sufficient.
4. **Host-plane restart/refresh step for host-half changes** — any release touching host
   registration-time code (routes, whitelists) must include restarting the host (or
   re-activating the plugin) and probing the new behavior before declaring the release
   shipped; client-plane refresh alone proves nothing.
5. **Report the upstream text-corruption bug** — the read-result splice (non-deterministic,
   re-read clean) belongs to the result-text assembly/persistence layer upstream of the
   plugin. File it upstream with the decoded evidence; do not add compensating
   "repair the payload" logic or edit traced files in the plugin — that hides the defect
   and lets it keep corrupting other results.
