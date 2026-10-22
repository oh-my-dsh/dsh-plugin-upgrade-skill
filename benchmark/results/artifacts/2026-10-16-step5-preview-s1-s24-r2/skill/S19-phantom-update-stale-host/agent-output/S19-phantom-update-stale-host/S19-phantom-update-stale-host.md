# S19 · The Phantom Update, the Stale Host Half, and the Corrupted Payload

**Subject:** client plugin `@dsh-external/dsh-file-trace` — v0.3.7 / v0.3.8 release session of 2026-09-05
**Mode:** read-only diagnosis (plugin-upgrade Mode A). Nothing in `fixture/` was modified; no migration, install, build, or host operation was executed. Every arithmetic claim below was verified by script against the evidence files (Appendix A/B).
**Evidence used:** `fixture/{README.md, release-log.md, package.json, git-tags.txt, client-bundle-excerpt.js, lib-index-excerpt.js, asset-route-probe.txt, session-log-excerpt.txt}` + read-only skill references (`references/troubleshooting.md`, `references/pre-flight.md` §1.5, `references/rollup-0.1.2.md` R-12, `references/v0.1.7-alpha.2.md` DSH-0.1.7-A2-04, `scripts/ghost-host-check.mjs`).

---

## 0. Verdict summary

| # | Symptom | Plane | Root cause | Correct fix |
|---|---|---|---|---|
| 1 | Freshly released v0.3.7 shows "新版本 v0.3.7 可用" (an update to itself) | client bundle content | `PLUGIN_VERSION` is **inlined at build time**; `pnpm run build` (16:22) ran **before** the version bump (16:23), so the shipped bundle carries `0.3.6` and compares `0.3.7 > 0.3.6` | bump → build → **verify the artifact** → commit → tag → push; a pre-tag gate that greps the built bundle for the constant |
| 2 | New client SVG toggle renders, host asset route 404s the `.svg` while a `.png` returns 200, disk `lib/index.js` whitelists `svg` | host process memory | client half is **re-fetched per page load**; host half registers its route **once at apply/boot**, and the handler closure captured the **old** `CONTENT_TYPES`. The running process is a *ghost host* (disk 0.3.8, memory pre-0.3.8) | fully stop the host, restart it, verify by probe (new extension 200 + right content-type, old extension as control) |
| 3 | One traced SVG renders broken although the source file is well-formed XML | session-log result-text assembly (upstream of the plugin) | the model-visible result text persisted into the session log was **spliced**: source line 232 cut at byte 52 glued to source line 247 from byte 35; lines 233–247 dropped; non-deterministic (re-read clean) | treat the session payload as **untrusted rendering input**; render disk bytes first, validate payload XML before any use, sandbox the fallback, fail explicitly; **report upstream** — never "repair" the traced file |

The three symptoms are three *different* layers: an artifact-content bug, a process-lifetime bug, and an upstream data-integrity bug. They are easy to conflate because all three present as "the new version doesn't work".

---

## 1. Phantom self-update: the plugin announcing an update to itself

### 1.1 Where the compared constant comes from — build time, not runtime

`fixture/client-bundle-excerpt.js` is the verbatim shipped `lib/client.js` for tag `v0.3.7`, i.e. the file actually served to the browser after the release:

```js
/** The running plugin version (from package.json at build time). */
export const PLUGIN_VERSION = "0.3.6";
// tsdown inlined this constant from package.json WHEN THE BUNDLE WAS BUILT —
// it is not read dynamically at runtime.

function newerTag(latestTag) {
  return latestTag !== undefined && compareSemver(latestTag, PLUGIN_VERSION) > 0
    ? latestTag
    : undefined;
}
```

The self-update check (per `git-tags.txt`) fetches `git ls-remote --tags` from the mirrors with no auth, picks the highest `vX.Y.Z`, and shows the badge when `latest > PLUGIN_VERSION`.

The critical fact: **`PLUGIN_VERSION` is a build-time artifact, not a runtime lookup.** The bundler read `package.json` and froze the value into the bundle at the moment `pnpm run build` executed. Nothing in the browser ever re-reads the manifest. So the version the plugin *compares against* is the version the source tree had **when the build ran** — a fact about the past, frozen into a shipped file.

### 1.2 The actual operation-order mistake

From `fixture/release-log.md`:

| Time | Step | Effect on the artifact |
|---|---|---|
| 16:20 | edit `src/client/markdown.tsx`, add tests | — |
| 16:21 | typecheck green, 104 tests pass | — |
| **16:22** | **`pnpm run build`** | **freezes `PLUGIN_VERSION = "0.3.6"` into `lib/client.js`** |
| **16:23** | **bump `package.json` 0.3.6 → 0.3.7** | changes the manifest only; the already-emitted bundle is untouched |
| 16:24 | `git commit` (includes the already-built `lib/client.js`), `git tag v0.3.7` | the *tag* points at a commit whose manifest says 0.3.7 but whose executed artifact says 0.3.6 |
| 16:25 | push main + tag to origin / public / omdsh; `git ls-remote` verifies the tag SHA on all three | faithfully replicates the stale-constant artifact |

Steps 3 and 4 are swapped relative to the only correct order. The build is the step that **captures** the version; the bump must precede it. Every later step (commit, tag, push, mirror verification) did its job perfectly and delivered a bundle that reports itself as one version behind.

This is why the mistake is so easy to miss: **the version looks right everywhere except in the one file the browser executes.** `package.json` says 0.3.7, the tag says 0.3.7, the README install ref says `#v0.3.7`, `git ls-remote` agrees on all three mirrors — only `lib/client.js` says 0.3.6. The self-update check then compares its own baked `0.3.6` against the newest mirror tag `v0.3.7`, gets `0.3.7 > 0.3.6`, and correctly concludes "there is an update" — from its point of view there *is* one. It is announcing an update to itself, and it is telling the truth about its own (stale) constant.

### 1.3 Why mirror/tag integrity is irrelevant here

`git-tags.txt` shows all three mirrors listing both tags with byte-identical SHAs:

```
origin  748b5e56e41ca4dc22da1631569fb29d8ae0b99d  refs/tags/v0.3.7
origin  d887deb0f526ba6a76818e531c740893bd8e9b33  refs/tags/v0.3.8
public  748b5e56e41ca4dc22da1631569fb29d8ae0b99d  refs/tags/v0.3.7
public  d887deb0f526ba6a76818e531c740893bd8e9b33  refs/tags/v0.3.8
omdsh   748b5e56e41ca4dc22da1631569fb29d8ae0b99d  refs/tags/v0.3.7
omdsh   d887deb0f526ba6a76818e531c740893bd8e9b33  refs/tags/v0.3.8
```

Mirror and tag integrity checks answer a **delivery** question: *are the bytes I pushed the bytes being served?* They say nothing about the **content** question: *are those bytes correct?* Here the delivery was perfect and the content was wrong by exactly one version. A perfectly replicated stale constant produces the phantom badge deterministically — on every mirror, on every load, until the tag is moved.

Note also that the data the check compares against is *correct*: the newest mirror tag genuinely is `v0.3.7`. No amount of mirror verification can distinguish "running 0.3.6 with a 0.3.6 constant" from "running 0.3.7 with a 0.3.6 constant" — the discriminating information lives inside the artifact, not on the wire. This is the same disk-vs-executed divergence as the ghost-host problem of §2, one plane earlier: here the manifest on disk says 0.3.7 while the code that runs says 0.3.6.

### 1.4 Corrected release order

1. **Bump first.** `package.json` 0.3.6 → 0.3.7 (and every other version-bearing file), *before* any build.
2. Typecheck + tests (green).
3. **Build** — the artifact now captures 0.3.7.
4. **Verify the artifact** (the new gate, §1.5) — fail the release here on mismatch.
5. Commit (including `lib/`), tag `v0.3.7`.
6. Push main + tag to all mirrors; `git ls-remote --tags` per mirror, compare each SHA to the local tag object.
7. Post-release smoke: load the released plugin once and assert the self-update check reports *up to date*.

Make the order structural rather than remembered: a single release script that performs bump → build → assert → tag, so a human cannot swap two steps by hand.

### 1.5 The check that would have caught the stale constant before pushing

A pre-tag **artifact gate** — extract the constant from the built file and compare it against the manifest and the tag about to be created:

```sh
TAG="v0.3.7"
BUILT=$(grep -oE "PLUGIN_VERSION[[:space:]]*=[[:space:]]*\"[^\"]+\"" lib/client.js \
        | grep -oE "[0-9]+\.[0-9]+\.[0-9]+" | head -1)
MANIFEST=$(node -p 'require("./package.json").version')
if [ "$BUILT" != "$MANIFEST" ] || [ "v$MANIFEST" != "$TAG" ]; then
  echo "STALE BAKED VERSION: bundle=$BUILT manifest=$MANIFEST tag=$TAG" >&2; exit 1
fi
```

That gate fails at 16:23, before the commit, before the tag, before any mirror sees anything. Its cost is three lines; the cost of not having it was an amend + rebuild + force-moving the tag on all three mirrors — a history-rewriting operation that invalidates every clone that already fetched `v0.3.7`.

Reinforce it with two cheap, permanent tests:

- **Static:** build in CI and assert the constant extracted from `lib/` equals `package.json``s version; also assert no occurrence of the *previous* version survives anywhere in `lib/`.
- **Behavioral:** `newerTag(`v` + PLUGIN_VERSION) === undefined` — a plugin must never be able to announce an update to itself, whatever the mirror state.

Structural hardening: derive the compared version from an input the build cannot desync — carry the built commit SHA alongside the version and compare the newest tag against *that*, or read the running version from the host-served manifest at runtime instead of a frozen literal. Then "bump after build" stops being a mistake that can ship.

---

## 2. Client vs host plane update asymmetry

### 2.1 Two halves, two loading mechanisms, two lifetimes

| | Client half (`lib/client.js`) | Host half (`lib/index.js`) |
|---|---|---|
| Loaded by | the browser, over HTTP | the host process, as a plugin entry at **apply** time |
| When | **every page load** — the artifact is fetched and re-evaluated | **once per host boot** — the module is imported into the process's module registry |
| Registration | `window.__ModuleLoader__.load({ id, factory })` in the page | routes/services registered during apply; the handler closure captures its dependencies (here `CONTENT_TYPES`) |
| Lifetime of a change | until the next page load | until the next **host restart** |
| Delivery character | stateless data plane (a fetch) | stateful code plane (a long-lived process) |

The client bundle is advertised by the host through the boot manifest / combo URL (revision-bearing single-resource or combo URLs in this generation) and re-fetched on refresh; the host half is ordinary code imported by a Node process whose route table was built once. Node does not re-read `lib/index.js` because a file on disk changed — the process keeps executing the module instance it already loaded.

That single difference explains the whole symptom: **the client half's new code reached the browser on the next refresh, while the host half's new code was still only on disk.** Both halves were updated in the release; only one of them was reloaded.

### 2.2 Why the probe results pin the staleness to the RUNNING process, not the release

From `fixture/asset-route-probe.txt` (taken after the browser was confirmed refreshed — the new SVG render toggle was visible and clickable — with the host **not** restarted since before the whitelist change):

| Probe | Result | What it proves |
|---|---|---|
| `GET …/asset?path=…daigo-final.png` | `200 OK`, `content-type: image/png` | the asset route handler **exists and is executing** in the running process — not a missing route, not a wrong path, not a dead plugin |
| `GET …/asset?path=…daigo-bicycle.svg` | `404 Not Found`, `"unsupported image type"` | the extension lookup ran against a `CONTENT_TYPES` table **with no `svg` key** — the whitelist's rejection branch fired, which only the *old* table can produce |
| `lib/index.js` on disk (link-installed repo, tag v0.3.8) | contains `svg: `image/svg+xml`` (see `lib-index-excerpt.js`) | the **release itself is correct** — if the release had omitted `svg`, the disk copy would lack it too |

Read together: the disk copy has the new whitelist, the running process does not, and the route is alive. The divergence is therefore **between disk and memory** — the process is running code that predates the change. That is precisely the *ghost host* state the skill's pre-flight step 1.5 names for the migration case (`references/pre-flight.md` §1.5, `references/rollup-0.1.2.md` R-12, `scripts/ghost-host-check.mjs`): an already-running host keeps executing the old code from memory while `package.json`, `git describe`, and the directory on disk all report the new version. The disk cannot tell the two apart; only the replies can — and here the replies are unambiguous: `PNG 200` (route alive, old table) + `SVG 404 "unsupported image type"` (old table) + disk `svg` present (new code on disk).

The client toggle appearing at the same moment is the clincher: the browser was running **new** client code while the host process was running **old** host code, simultaneously. Two planes, two generations, one session. Only a client-plane observation could ever produce that; only a host-plane probe can detect the other half.

### 2.3 What makes a host-plane change effective — and why "plugins hot-update" does not hold here

The usual "plugins hot-update" intuition — *update the plugin and the change shows up* — is a statement about the **client plane** (and about plugin-manager-driven re-composition). It does not extend to the host plane:

1. **Fully stop the host process.** Closing the browser tab is not a host stop; on Windows a running host holds file locks on the loaded host half and native modules (the EBUSY trap, cf. benchmark task S12). The lock lives in the host process, not the browser.
2. **Start the host again** (`dsh web` / the profile entry). The composition is re-applied, the host half is re-imported from the current disk bytes, and the asset route is re-registered with a closure over the **new** `CONTENT_TYPES`.
3. **Verify by probe, never by version number.** Request the newly supported extension and expect `200` + `image/svg+xml`; keep the previously working extension as a control (it must stay `200`). Optionally record the running process's generation — process start time vs the checkout's last change (`ghost-host-check.mjs`, POSIX `ps -o lstart=`; on Windows compare the process start time from the OS against the file mtime) — so "disk says 0.3.8 / memory says pre-0.3.8" becomes a named, detectable state instead of a mystery.
4. **For link/junction installs, no copy step is needed** — the repo tree and the install directory are the same physical location, so repo edits are already live on disk — but the restart is still required. "Copy it into `node_modules`" is both unnecessary and harmful here (S14); "restart the host" is the missing step.

**Host-generation caveat (worth recording on the ticket):** `DSH-0.1.7-A2-04` notes that from 0.1.7-alpha.2 on, client bundles are read and cached **at host boot**, so even a client-bundle edit needs a host restart, and an auto-reconnected page may keep running pre-restart bytes while appearing healthy. The refresh-only client refresh observed in this session therefore dates this host to a generation that serves client bundles per request. Either way the operative rule is unchanged and gets stronger, not weaker: **a host-plane change requires a host restart; never infer "the release is live" from the client plane alone, and never conclude "the release is broken" from a host-plane probe taken against an un-restarted host.**

---

## 3. Broken-image attribution: the payload, not the file

### 3.1 The three observations

| Observation | Source | Verdict |
|---|---|---|
| Source SVG on disk | `session-log-excerpt.txt` §2 | **well-formed** (System.Xml `XmlDocument` load, no error) |
| Session-log payload for the read result | `session-log-excerpt.txt` §1 | **not well-formed** — "error on line 233 at column 54: Specification mandates value for attribute `stro0`" |
| Re-read of the same region afterwards | `session-log-excerpt.txt` §4 | **clean** — the corruption is non-deterministic |
| The read tool's TYPE result delivered to the caller | `session-log-excerpt.txt` §4 | **clean** |

### 3.2 Where the corruption happened — which layer produced the text

The disk file was read correctly: the TYPE result was clean and a re-read is clean. What is corrupted is the **model-visible result text that was assembled and persisted into the session log** — i.e. the harness's result-text assembly/persistence layer, **upstream of the plugin**. The plugin never touched the file's bytes; it only ever consumed that transcribed text and handed it to the renderer, where the browser's XML parser choked on the malformed attribute and produced the broken image.

Verified arithmetically (Appendix A): the stored payload line 232 is

```
source line 232, bytes [0,52)   "    <circle r=\"98\" fill="none" stroke="#dde6ea" stro"
+ source line 247, bytes [35,)   "0,1 821,730\" fill="none" stroke="#ffffff" stroke-width="3" opacity=".7" stroke-linecap="round"/>"
```

Both cuts land **inside tokens**: the first mid-word in `stroke-width` (right after `stro`), the second mid-token in the arc flags `0 0,1` of line 247's `A 122,122 0 0,1 821,730` path command. Source lines **233–247 are absent** (15 lines). The join manufactures the attribute name `stro0` with no value — exactly what the XML parser reports, with its error column landing on the first byte of the spliced-in tail (the verdict's 233:54 vs the excerpt's 232:53 is a one-line/one-column numbering offset: the excerpt labels lines with the *source file's* numbering while the persisted payload carries its own).

This shape — a head segment glued to a tail segment with the middle dropped, both cut mid-token at a shared prefix — is a **head/tail retention splice**, the same failure family as the head+tail retention budget in the result/spill layer (`DSH-0.1.7-A2-01`). It is an assembly bug in a layer the plugin does not own, not a filesystem, transport, or plugin bug. Its non-determinism (clean re-read) confirms it is a transient assembly-state bug, not a persistent on-disk defect.

### 3.3 Why the plugin must treat the session payload as untrusted rendering input

- **The payload is a transcription, not the file.** It is produced by a pipeline the plugin neither owns nor can audit, and this incident proves that pipeline can drop 15 lines and splice two fragments at a shared prefix. Anything derived from it is derived from an unverified copy.
- **Rendering it means parsing unverified text as markup.** A splice can invent attributes, break namespaces, or — in the general case — inject elements and handlers. Validation must precede any parse-for-display, always.
- **The disk copy is independently verifiable.** It validated clean in this very incident. When a primary source and a derived copy disagree, the primary source wins and the copy is a hint.
- **Untrusted-by-default is the only posture that survives the next one.** The next corruption will have a different file, a different line, and a different splice point. A per-incident workaround fails; a validation gate does not.

### 3.4 Why editing or "repairing" the traced file would have been the wrong move

1. **The file was never broken.** "Repairing" it would mutate a correct artifact to match a corrupted transcription — inverting cause and effect, and leaving a permanently altered user file as the residue of a rendering bug.
2. **It destroys the evidence.** The corrupted text exists only in the session log. Once the file is edited to agree with it, the divergence is gone and the upstream defect becomes unreproducible and deniable.
3. **It papers over the real bug.** The next corrupted payload — different file, different splice — would still render broken, and the upstream assembly bug would never be fixed. Plugin-side splice heuristics are a losing arms race against an unknown upstream failure mode.
4. **It violates the feature's contract.** A render preview must be read-only with respect to user files. Writing to a file the user merely asked to *view* is out of scope and dangerous.

The correct move: do not render the bad payload, fail explicitly with the reason, keep the evidence, and report upstream (§5).

---

## 4. Defensive render chain for an SVG preview

Source order, with each level's justification tied to a measured fact from this incident:

### Level 1 — disk bytes via the host asset route (primary)

```http
GET /dsh-file-trace/asset?path=E%3A%5C...%5Cdaigo-bicycle.svg
```

Accept only when: HTTP `200`; `content-type` is in the allowlist (`image/svg+xml`, `image/png`, …); body length `> 0` and under a cap; the body is **not** a JSON error envelope (detect a 200-with-error-body instead of rendering it). Render via a blob/object URL.

*Why first:* the disk copy is the ground truth — in this incident it was well-formed while the payload was not. Bytes fetched by the host at request time never pass through the result-text assembly path, so this entire corruption class is **structurally excluded**, not merely checked for. It also avoids re-reading a long transcript into the model context at all.
*Dependency:* this level only works if the host half is actually live (§2) — the whitelist must contain `svg` **in the running process**. A `404 "unsupported image type"` here is a **host-plane staleness signal**, not a file problem, and the chain must classify it as such rather than silently falling through to a worse source.

### Level 2 — session payload, only after an XML well-formedness check

```ts
function parseSvgStrict(text: string): SVGSVGElement | null {
  const doc = new DOMParser().parseFromString(text, `image/svg+xml`);
  if (doc.getElementsByTagName(`parsererror`).length > 0) return null;   // ← rejects this incident's payload
  const root = doc.documentElement as Element;
  if (root.nodeName !== `svg` || root.namespaceURI !== `http://www.w3.org/2000/svg`) return null;
  if (doc.doctype !== null) return null;                                 // no DOCTYPE / entity expansion (XXE, billion laughs)
  if (root.querySelector(`script, foreignObject`)) return null;          // no active content
  if (root.querySelector(`[onload], [onclick], [onerror]`)) return null; // no inline handlers
  for (const el of root.querySelectorAll(`*`))             // no off-document references
    for (const a of [`href`, `xlink:href`, `src`])
      if (el.getAttribute(a)?.match(/^(?:https?:|file:|data:)/i)) return null;
  return root as SVGSVGElement;
}
```

*Why gated:* the payload is a derived, unverifiable transcription; a well-formedness check is the cheapest test that rejects **this exact corruption** (`stro0` without a value → `parsererror`) and every other splice or truncation of the same family. It converts "broken image" into "invalid input", which is the correct attribution and the correct user-visible message.
*Why still second:* a payload that passes validation is trustworthy *as XML*, but it remains a copy. It is a fallback for when the asset route is unavailable (host down, path outside the served root, host-plane staleness that cannot be fixed right now) — never the preferred source. Anything that passes is rendered through level 3's sandbox, never injected inline into the host page.

### Level 3 — sandboxed iframe as the last render fallback

```tsx
<iframe
  sandbox=""                 // no allow-scripts, no allow-same-origin → opaque origin
  srcDoc={svgText}
  style={{ border: 0, width: `100%`, height: `100%` }}
/>
```

*Why a sandbox:* SVG is an **active document** format — scripts, `on*` handlers, `javascript:` URLs, external references, and `foreignObject` can all execute or exfiltrate. `sandbox=""` with no `allow-scripts` and no `allow-same-origin` blocks script execution, forms, popups and top-navigation, and gives the frame an opaque origin so it cannot reach the parent DOM, cookies, or storage.
*Why SMIL still runs:* SMIL (`<animate>`, `<animateTransform>`, `<animateMotion>`) is **declarative** SVG document semantics, not script. Blocking scripts does not block SMIL, so "no scripts" and "the preview still animates" are compatible requirements — the sandbox costs nothing here.
*Why last:* containment, not preference. By the time we reach level 3 the primary source has failed and the payload has passed validation; the sandbox limits what a still-somehow-hostile document can do.

### Level 4 — explicit error state instead of a silent broken image

When every level fails, render a dedicated error card, never a broken `<img>`:

- **What failed, and at which level** — e.g. *"asset route refused `image/svg+xml` (host process stale — restart the host)"* vs *"session payload failed XML validation at line 233 (suspected upstream session-log corruption)"* vs *"file is not a supported image type"*.
- **Actions:** *Re-read from disk* (retry level 1), *Open file location*, *Copy path*, *Report upstream issue* (pre-filled with the decoded evidence from §5).
- **Never** write to the traced file, never "repair" it, never silently degrade.

*Why:* a silent broken image hides the failure, mis-attributes it to the file, and invites exactly the wrong fix (editing the traced file). An explicit error state preserves the evidence, tells the user **which plane** failed (host staleness vs payload corruption vs genuinely unsupported file), and makes the upstream bug reportable instead of invisible.

### Chain summary

```
disk bytes (asset route)  →  structurally immune to the observed corruption class
        ↓ unavailable / refused
session payload           →  only after DOMParser well-formedness + active-content gates
        ↓ invalid
sandboxed iframe          →  containment for whatever passed validation (scripts blocked, SMIL runs)
        ↓ unusable
explicit error state      →  attribution + evidence + upstream report; read-only, never "repair"
```

---

## 5. Forensics method + prevention

### 5.1 Decoding the session log frame-by-frame

The session's generation file (e.g. `session.v4.jsonl.zstd` — a running session's log is being appended to as it works, cf. `DSH-0.1.7-A1-05` and the 0.2.0-rc.1 note) is a **concatenated-Zstandard** file: records are appended as JSONL and compressed in **independently flushed frames**, so the file is a *sequence* of zstd frames rather than one zstd stream. That is why a single-shot decode is not enough.

Method:

1. **Copy the file read-only**; record size and SHA-256 before touching it.
2. **Scan for frame boundaries by magic number** — zstd frame magic `28 B5 2F FD` (LE `0xFD2FB528`); skippable-frame magics `0x184D2A50`–`0x184D2A5F` (LE `50 2A 4D 18` … `5F 2A 4D 18`), for which the 4-byte size at offset +4 gives the frame length (`8 + size`).
3. **Decompress each frame independently** — reset the decompressor per frame; never feed frame *N+1*`s bytes into frame *N*`s stream. Streaming frames carry no content size, so magic-scan + per-frame decode is the robust approach (and it also tolerates a frame that fails to decode without losing the rest).
4. **Concatenate the decoded outputs in file order**, split on `\n` → JSONL records; index by `seq`/`type` and locate the `tool.result` record for the read call.
5. **Extract the stored text byte-for-byte** (JSON-parse the field; never regex it), hash it, and diff it against the file on disk — line-by-line first, then byte-level at the first divergence, recording both cut offsets.
6. **Report, do not clean.** The exact stored text, the exact source text, both hashes, the frame's byte range and decoded length, and the first divergent offset. The corruption *is* the evidence.

Why frame-by-frame matters — measured on a synthetic 3-frame reproduction (Appendix B):

- A one-shot decode of the whole file **silently returns only the first frame**: 2 of 4 records recovered, **no error raised**. The tail of the session — including the record you need — is silently lost. That is the difference between "the log says the text was fine" and "the log says the text was spliced".
- Frame-by-frame decoding recovers **all** records, and with one frame's payload corrupted (magics intact) it decodes the good frames while **reporting the damaged frame's byte range** — so a partially damaged log still yields evidence instead of nothing. A single-stream decoder fails or silently truncates at the first bad frame.

Reference decoder (Node ≥ 22.15 `node:zlib`; the Python equivalent is `zstandard.ZstdDecompressor().decompressobj()` per frame slice):

```js
import { readFileSync } from `node:fs`;
import zlib from `node:zlib`;

const MAGIC = 0xFD2FB528, SKIP_LO = 0x184D2A50, SKIP_HI = 0x184D2A5F;

function splitFrames(buf) {
  const ranges = []; let i = 0;
  while (i + 4 <= buf.length) {
    const m = buf.readUInt32LE(i);
    if (m === MAGIC) {
      const start = i; i += 4;
      while (i + 4 <= buf.length && buf.readUInt32LE(i) !== MAGIC &&
             !(buf.readUInt32LE(i) >= SKIP_LO && buf.readUInt32LE(i) <= SKIP_HI)) i++;
      ranges.push({ start, end: i });
    } else if (m >= SKIP_LO && m <= SKIP_HI) {
      const size = buf.readUInt32LE(i + 4);
      ranges.push({ start: i, end: i + 8 + size }); i += 8 + size;
    } else i++;
  }
  return ranges;
}

const gen = readFileSync(`session.generation.zstd`);
let text = ``;
for (const r of splitFrames(gen)) {
  const part = zlib.zstdDecompressSync(gen.subarray(r.start, r.end)); // one frame at a time
  text += part.toString(`utf8`);
}
// text is the full JSONL record stream; index by seq/type and extract the stored `text` field
```

### 5.2 Release-checklist items this incident adds

**A. Version-bump-before-build (structural).** Bump `package.json` (and every other version-bearing file) → typecheck/test → build → verify → commit → tag → push. Encode it as one release script (bump → build → assert → tag) so the order cannot be swapped by hand. The v0.3.8 log already records the corrected order; make it the only order.

**B. Grep the shipped bundle for the baked constant (pre-tag artifact gate).** Extract `PLUGIN_VERSION` from the built `lib/client.js` and assert it equals the manifest version **and** the tag about to be created; fail the release on mismatch (script in §1.5). Add the inverse check that no previous-version string survives anywhere in `lib/`, plus the behavioral test `newerTag(`v` + PLUGIN_VERSION) === undefined`. Consider deriving the compared version from the built commit SHA so a stale constant becomes structurally impossible.

**C. Per-mirror tag SHA verification (keep — and know what it proves).** After every push, `git ls-remote --tags` on **each** mirror and compare every tag SHA to the local tag object; all three matched here. It proves *delivery* integrity (every mirror serves exactly the bytes you pushed). It says nothing about *content* correctness, which is why it passed while the phantom badge shipped. Do not drop it; do not promote it to a release-correctness gate.

**D. Report the upstream text-corruption bug instead of papering over it in the plugin.** File the upstream report with: session id; generation file path, size and SHA-256; the carrying frame's byte range and decoded length; the record `seq`/`type`; the exact stored text and its hash; the source file, its hash and its well-formedness verdict; the first divergent byte offset and both cut offsets (52 / 35 here); and the non-determinism evidence (clean re-read). The plugin's only obligations are: validate before rendering (§4), fail explicitly, forward the evidence — no splice heuristics, no edits to the traced file, no per-incident special cases.

**E. Host-plane restart gate.** Any change to a plugin's host half (routes, services, tools, providers, whitelists) requires a full host stop + start, verified by probe (new extension `200` + correct content-type; old extension as control). Record the running process's generation (process start time vs last checkout change — `ghost-host-check.mjs` / Windows equivalent) so "disk 0.3.8 / memory pre-0.3.8" is a named state. Never verify a host-plane change through the client plane alone.

**F. One post-build smoke test on a real host would have caught both halves of this incident.** Boot a scratch profile with the built artifact and assert (i) the self-update check reports *up to date* — no badge — and (ii) the newly whitelisted extension answers `200` with the right content-type through the asset route. Two assertions, one boot, and neither the phantom badge nor the 404 survives to a user.

---

## Appendix A · Verified splice arithmetic

Reconstructed from `fixture/session-log-excerpt.txt` §1/§2 and checked by script:

```
src232     =     <circle r="98" fill="none" stroke="#dde6ea" stroke-width="6.5"/>
src247     =     <path d="M 587,730 A 122,122 0 0,1 821,730" fill="none" stroke="#ffffff" stroke-width="3" opacity=".7" stroke-linecap="round"/>
payload232 =     <circle r="98" fill="none" stroke="#dde6ea" stro0,1 821,730" fill="none" stroke="#ffffff" stroke-width="3" opacity=".7" stroke-linecap="round"/>

longest common prefix(payload232, src232) = 52 chars
  head =        <circle r="98" fill="none" stroke="#dde6ea" stro        (cut mid-token, inside stroke-width)
  tail = payload232.slice(52) = 0,1 821,730" fill="none" stroke="#ffffff" stroke-width="3" opacity=".7" stroke-linecap="round"/>
  tail found in src247 at offset 35                                  (cut mid-token, inside the arc flags 0 0,1)
  payload232 === src232.slice(0,52) + src247.slice(35)   →  true
  source lines dropped: 233..247  →  15 lines
  XML verdict column lands on the first byte of the spliced-in tail (offset 52 = column 53 in the excerpt's
  source-file numbering; the persisted payload's own numbering reports 233:54 — a one-line offset)
```

Consequences: the stored payload is **not** a truncation (which would merely end early) and **not** a duplication — it is a head/tail **splice with the middle dropped**, both cuts landing inside tokens at a shared prefix. The manufactured attribute `stro0` has no value, which is exactly the reported parser error.

## Appendix B · Frame-by-frame zstd decode — measured reproduction

A synthetic 3-frame concatenated-zstd file (4 JSONL records: a `tool.call`, two `tool.result` — one of them carrying the spliced SVG text — and a `turn.end`) was built with `zlib.zstdCompressSync` per chunk and concatenated, then decoded both ways. Measured output:

```
generation file: 408 bytes = 3 frames of 193 + 152 + 63

[naive zstdDecompressSync(whole file)] -> 460 bytes  (only the FIRST frame is honoured)
   decoded records: 2 of 4

[frame scan] found 3 frames: [0,193) frame [193,345) frame [345,405) frame
[frame-by-frame] recovered 4 of 4 records
[seq 3] stored text sha256 = 89a91a9b408976a7
[seq 3] stored text  = <circle r="98" fill="none" stroke="#dde6ea" stro0,1 821,730" fill="none" stroke="#ffffff" stroke-width="3" opacity=".7" stroke-linecap="round"/>

# same file with 8 payload bytes flipped inside frame 2 (all magics intact):
[naive] decoded whole damaged file without error (tail silently lost)
[frame-by-frame] bytes [0,193)   OK -> 2 record(s)
[frame-by-frame] bytes [193,345) UNDECODABLE -> Data corruption detected — damage isolated to this frame; all other frames still recovered
[frame-by-frame] bytes [345,405) OK -> 1 record(s)
```

Two lessons for the forensics runbook: (1) a one-shot decode **silently loses every frame after the first**, so a naive read of the generation file can conclude "the stored text was clean" when the corrupted record was simply never decoded; (2) per-frame decoding both recovers everything and **localizes** damage to a byte range, which is what turns "the image was broken" into "frame `[193,345)`, record `seq 3`, stored text `<sha256>` diverges from the source file at byte 52".

## Appendix C · Scope statement

- Read-only inspection of `fixture/` (all 8 files) and the read-only skill reference tree; the fixture was not modified (verified by re-listing after the analysis).
- No migration, install, build, host start/stop, or network operation was performed; no path outside the allowed set was read, listed, globbed, or written.
- Temporary artifacts created for Appendix B (a synthetic `.zstd` reproduction and its inline decoder) were written inside `agent-output/S19-phantom-update-stale-host/` and deleted afterwards; their measured output is quoted verbatim above so the experiment is reproducible from the listing alone.
- No real session log was available inside the allowed paths; the forensics method in §5.1 is therefore stated as a procedure plus a synthetic, measured proof of the two failure modes it avoids.
