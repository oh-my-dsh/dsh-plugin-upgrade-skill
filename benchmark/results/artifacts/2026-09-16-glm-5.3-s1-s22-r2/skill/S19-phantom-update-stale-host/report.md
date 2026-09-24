# S19 · The Phantom Update, the Stale Host Half, and the Corrupted Payload — Read-Only Diagnosis

**Skill mode:** A · inspect (read-only). No migrations, installs, or writes to the fixture were performed; this report is the sole output.

**Evidence base:** `fixture/` — `release-log.md`, `package.json`, `git-tags.txt`, `client-bundle-excerpt.js`, `asset-route-probe.txt`, `lib-index-excerpt.js`, `session-log-excerpt.txt`. All citations below reference these files.

---

## 1. Phantom self-update root cause ("新版本 v0.3.7 可用" on v0.3.7 itself)

**Where the compared constant comes from.** The client bundle's self-update check compares the newest mirror tag against `PLUGIN_VERSION`, which tsdown **inlined from `package.json` at build time** (`client-bundle-excerpt.js`):

```js
export const PLUGIN_VERSION = "0.3.6";  // baked in at build, not read at runtime
```

It is a build-time constant, not a runtime read of the installed manifest. The running v0.3.7 therefore *believes* it is v0.3.6.

**The operation-order mistake.** Per `release-log.md`, the v0.3.7 sequence was:

1. 16:22 `pnpm run build` — client bundle emitted  ← bundle baked `version: 0.3.6`
2. 16:23 bump `package.json` 0.3.6 → 0.3.7          ← **bump happened AFTER the build**
3. 16:24 commit (including the already-built `lib/client.js`) + tag `v0.3.7`

The tag says v0.3.7, the mirrors serve the new bundle, but the artifact inside the tag carries the stale constant `0.3.6`. At runtime: `newerTag("v0.3.7")` with `PLUGIN_VERSION "0.3.6"` → semver compare `0.3.7 > 0.3.6` → the just-released plugin announces an update to itself.

**Why mirror/tag integrity is irrelevant.** `git-tags.txt` shows all three mirrors (origin/public/omdsh) listing both tags at **identical SHAs** — distribution is perfectly consistent. The self-update check fetches exactly these tags and picks the highest. The integrity of the tag and the mirrors guarantees only that *everyone receives the same defective bundle*; it cannot detect that the bundle's baked constant disagrees with the tag it was shipped under. The bug is a build-input/ordering defect inside the artifact, upstream of any distribution concern.

**Corrected release order** (as actually adopted for v0.3.8 per `release-log.md`):

1. edit source + tests → typecheck + tests green
2. **bump `package.json` version FIRST**
3. build (bundle now inlines the new version)
4. update README install refs
5. commit, tag, push mirrors, verify tag SHAs

**The check that would have caught it before pushing:** after building, grep the emitted bundle for the baked constant and assert it equals the release version, e.g.

```sh
grep -o 'PLUGIN_VERSION = "[0-9][^"]*"' lib/client.js   # must print 0.3.7
# or fail the release: the string "0.3.6" must NOT appear as the version constant
```

A one-line CI/release gate "shipped bundle's baked version == `package.json` version == git tag" turns this class of defect into a pre-push failure instead of a forced amend + tag-move across three mirrors.

---

## 2. Client vs host plane update asymmetry (SVG toggle visible, SVG asset route 404)

**Where each half's code loads.** The plugin has two halves with different lifecycles:

- **Client half** (`lib/client.js`): fetched by the browser. A browser refresh / client re-fetch re-downloads and re-evaluates the bundle immediately — so the new v0.3.8 client code (with the SVG render toggle) reached the browser without any host involvement. The visible, clickable toggle proves the client plane was refreshed.
- **Host half** (`lib/index.js`): loaded by the DSH host Node.js process **at plugin activation / host boot time**. Its asset-route handler — including the `CONTENT_TYPES` extension whitelist — was registered into the running host when the host last started, with the *old* whitelist (no `svg` entry). Replacing the file on disk does not re-register the route in the already-running process.

**How the probes pin staleness to the RUNNING host, not the release:**

| Evidence | Implication |
|---|---|
| PNG probe → `200 OK image/png` (`asset-route-probe.txt`) | The route itself is alive and reachable; the handler is executing. Rules out a missing/unregistered route entirely. |
| SVG probe → `404 "unsupported image type"` | The failure is the handler's own extension-whitelist rejection branch — the *code path that lacks `svg`*. |
| Shipped `lib/index.js` at tag v0.3.8 **does** whitelist `svg: 'image/svg+xml'` (`lib-index-excerpt.js`) | The released artifact is correct. The old behavior therefore cannot be coming from the release. |
| Host not restarted since before the whitelist change (`release-log.md`) | The process still runs the code image loaded at boot. |

Conclusion: the only component that both (a) has the old whitelist and (b) is serving requests is the **running host process's in-memory copy** of the host half. Disk is current; memory is stale.

**What makes a host-plane change effective:** the host must load the new host-half code — restart the host process (or otherwise re-activate the plugin so the route is re-registered from the current `lib/index.js`). This is the one case where the usual "plugins hot-update" rule does not hold: client-plane artifacts refresh on browser re-fetch, but host-plane code (route registration, service provisioning, anything wired during `apply()`) is bound at activation/boot time in the host process and does not track the file on disk afterward. (Consistent with the skill's alpha.1 card A1-20 family of host-restart-required roster/combo mismatches: an in-place update serving stale host state self-heals only on host restart.)

---

## 3. Broken-image attribution (well-formed disk file, spliced session payload, clean re-read)

**Where the corruption happened.** `session-log-excerpt.txt` §4 states the decisive facts:

- The **session-log payload** — the model-visible read-result text persisted by the read tool — contains a splice: payload line 232 = source line 232 truncated at `stroke="#dde6ea" stro` + source line 247's tail (`0 0,1 821,730"…`), with source lines 233–247 absent. The splice landed on a shared prefix (`stro` from `stroke-width` meeting the `0` of line 247's arc-flag `0 0,1`) — a classic mid-stream text-assembly/concatenation tear, not an editing artifact.
- The **source file on disk** is well-formed XML in that region (§2, §3: XmlDocument loads with no error).
- A **re-read of the same region came back clean**, non-deterministically.

So the corruption was produced **in the result-text assembly layer upstream of the plugin** — between reading the file from disk and persisting/delivering the read-result block into the session log. The plugin merely *rendered* what the session payload gave it. The renderer, the traced file, and the mirrors are all innocent.

**Why the plugin must treat the session payload as untrusted rendering input.** The plugin never sees the disk file through this path — it sees the persisted payload, which (as proven) can diverge from disk. Rendering input that crosses a durable boundary (session log) must be validated before use, per the same principle that queued/durable/wire-boundary data gets validation while same-process typed data does not. Concretely: the payload failed XML parsing at line 233 column 54 (`Specification mandates value for attribute stro0`); any SVG renderer fed this text will produce a broken image or worse.

**Why "repairing" the traced file would have been the wrong move.** The file is not broken — it is well-formed and a clean re-read returns intact text. Editing it would (a) corrupt a file that was never at fault, destroying the evidence; (b) paper over an upstream, non-deterministic bug in the read-result/session-log layer, which would keep corrupting other files; and (c) violate attribution discipline — fix the layer that produced the bad text (report the upstream bug), never mutate the innocent source to accommodate a defective consumer.

---

## 4. Defensive render chain for the SVG preview

Ordered sources, most-trusted first, with an explicit terminal error state:

**Level 1 — disk-bytes asset route first.** Request the SVG through the host asset route (`/dsh-file-trace/asset?path=…`), which streams the file's actual bytes from disk — bypassing the session-log text entirely. Justification: disk is the source of truth (§3 proved disk well-formed while payload was not), and bytes avoid any text-assembly layer that could splice content. Serve with `content-type: image/svg+xml` (the shipped whitelist already admits it once the host half is reloaded, see §2).

**Level 2 — session payload, only after a well-formedness gate.** If the asset route is unavailable (404/host stale — exactly this incident), fall back to the session-payload text, but **first** parse it with `DOMParser` (`text/xml`) and reject on any `parsererror` (the fixture's verdict "error on line 233 … attribute stro0" is precisely what this gate catches). Justification: the payload is durable-boundary data proven corruptible (§3); an unparseable document can never render correctly, so gating converts a silent broken image into a diagnosable state. Only well-formed documents proceed to rendering.

**Level 3 — sandboxed iframe as the last render fallback.** Render the validated SVG inside `<iframe sandbox>` (no `allow-scripts`), sized to the element. Justification: SVG is active content — inline `<script>`, `<foreignObject>`, and event handlers are executable vectors. The sandboxed iframe blocks scripts while still allowing declarative SMIL animations (`<animate>` etc.) to run, matching the requirement "scripts blocked, SMIL animations still run." This level is the *render* fallback for content that passed Level 2's gate; it never bypasses Level 2.

**Level 4 — explicit error state instead of a silent broken image.** When every applicable source fails (route 404, payload `parsererror`, iframe load error), show a visible error card naming the failing stage and reason (e.g. "render blocked: session payload failed XML validation at line 233 col 54 — source file on disk is intact; re-read or restart host to refresh the asset route"), with a retry/re-read action. Justification: a silent broken image is what let this three-defect incident masquerade as "the SVG is broken"; explicit failure states separate stale-host (§2), corrupt-payload (§3), and genuine file problems, and tell the user the actionable fix for each.

Each level degrades trust deliberately: bytes > validated text > sandboxed execution > named failure — never a silent fallback chain that ends in a broken-image icon.

---

## 5. Forensics method + prevention checklist

**Decoding the session log frame-by-frame.** The session log is a concatenated-Zstandard generation file: a sequence of independently compressed zstd frames (per-event/batch records) written append-only, one generation per format era. The forensics procedure used to recover the exact stored text:

1. Locate the generation file for the session/turn in the session store (by session id + generation sequence).
2. Treat the file as a zstd **concatenated stream** and decode it **frame by frame** — decompress each frame's record independently (a zstd stream decoder with `ZSTD_decompressStream`, advancing frame boundaries as each frame completes) rather than assuming one whole-file frame. This is essential: per-frame decode recovers records *before* a torn/corrupt frame and makes the corruption boundary observable, whereas whole-file decode fails or hides it.
3. For each decoded record, project the session events in order and find the read-result event around the reported location (the fixture's "payload around line 232").
4. Extract the stored result **text verbatim** — no normalization, no reflow — and diff it against a fresh read of the source file on disk. The fixture's §1/§2/§4 diff (splice at the shared `stro`/ `0 0,1` prefix, lines 233–247 absent) is exactly this product.
5. Run an XML well-formedness check on both texts (source: clean; payload: parsererror) to convert "looks broken in the browser" into reproducible, attributed evidence — the corruption is in the stored payload, produced by the read-result assembly layer, and is non-deterministic (clean re-read).

**Release-checklist items this incident adds:**

1. **Version-bump-before-build** — always bump `package.json` *before* running the build, so every baked/inlined constant (client version, any build-time metadata) carries the release version. (Adopted for v0.3.8.)
2. **Grep the shipped bundle for the baked constant** — post-build gate asserting the emitted artifact's baked version equals `package.json` version equals the intended git tag; fail the release before commit/tag/push. Catches the phantom self-update at zero distribution cost.
3. **Per-mirror tag SHA verification** — keep `git ls-remote --tags` on every push mirror and require identical SHAs (this session's practice, `git-tags.txt`, stayed green through both defects — keep it; it is necessary for distribution integrity even though it cannot catch build-input defects).
4. **Host-plane reload step for host-half changes** — any release touching the host half must include "restart the host (or re-activate the plugin) and re-probe the changed host route" in its validation; a client-refresh check alone proves nothing about host-plane code. (Generalization of the §2 asymmetry.)
5. **Report the upstream text-corruption bug instead of papering over it in the plugin** — file the read-result/session-payload splice (mid-file line spliced with another line's tail at a shared prefix, non-deterministic, clean re-read) against the read/session-log layer with the frame-decoded evidence attached; the plugin's correct response is the validated render chain (§4), never editing traced files, never "repairing" payloads in place.

---

## Completed / Skipped / Pending

- **Completed:** full read-only attribution of all three symptoms (phantom badge → build-time constant + bump-after-build; SVG 404 → running-host in-memory whitelist vs refreshed disk/client; broken image → upstream read-result/session-payload corruption), defensive render-chain design, forensics method, and prevention checklist — all grounded in the fixture evidence.
- **Skipped:** no Mode B/C actions (no installs, migrations, builds, or runs) — outside this task's read-only scope by design.
- **Pending/residual risk:** the upstream splice bug's root cause in the read-result assembly layer is *attributed* but not *located* — that requires the host-side source investigation beyond this evidence pack; frame-decoded log evidence for the exact generation file was excerpted by the fixture, not re-derived here (the raw generation file is not in the pack).
- **Rollback:** none needed — no files outside the designated output directory were touched; the fixture is unchanged.
