# S19 · Phantom self-update, stale host half, corrupted session payload

**Scope** — read-only diagnosis of the 2026-09-05 release session of `@dsh-external/dsh-file-trace`
(v0.3.7 markdown fix + v0.3.8 SVG render preview). Evidence: `fixture/` (untouched, byte-identical).
Mode: A (inspect) per the `plugin-upgrade` skill — investigation and report only; no install, no
migration, no file repair, no network.

**One-line verdict** — three *independent* defects on three different layers, not one cascade:

| # | Symptom | Layer that is wrong | Root cause | Fix lives in |
|---|---|---|---|---|
| 1 | fresh v0.3.7 badges "新版本 v0.3.7 可用" | the **release artifact's provenance** (build-time constant) | build ran at 0.3.6, version bumped after the build; the shipped `lib/client.js` still embeds `0.3.6` | release *order* + an artifact assertion (no code defect in the update checker) |
| 2 | SVG render 404 while PNG 200, disk `lib/index.js` whitelists svg | the **running host process**, not the release | host half is imported once at boot and registers its route with the whitelist captured in the handler closure; the process predates the edit (ghost host) | restart the dsh host, then re-probe |
| 3 | one traced SVG renders broken; source is well-formed | **upstream result-text assembly** (model-visible tool result that gets persisted) | the stored read-result text is a prefix-overlap splice (source L232 cut at `stro`, L247's tail appended, L233–247 dropped) | upstream bug report + validation in the plugin; *not* editing the file |

The only thing the three share is the observability trap: **the disk told a different story than the
process and the transcript**. Disk says 0.3.7 / whitelists svg / valid XML; the running process,
the shipped bundle, and the persisted payload each say otherwise. Every conclusion below is therefore
pinned to *which* artifact was observed, not to a version number.

---

## 0 · Evidence index (claim → fixture file : line)

| Evidence | What it proves |
|---|---|
| `fixture/release-log.md` :3–4 | build at 16:22, `package.json` bumped 0.3.6 → 0.3.7 at 16:23 — **bump after build** |
| `fixture/release-log.md` :6 | the commit at 16:24 contains the *already built* `lib/client.js`, and the tag is cut on it |
| `fixture/release-log.md` :7, `fixture/git-tags.txt` :3–11 | three mirrors, identical tag SHAs for v0.3.7/v0.3.8 — mirror integrity is **not** the fault |
| `fixture/client-bundle-excerpt.js` :7–9 | shipped bundle literal `PLUGIN_VERSION = "0.3.6"`, inlined by tsdown at build time, not read at runtime |
| `fixture/client-bundle-excerpt.js` :11–17 | `newerTag("v0.3.7")` vs `0.3.6` → badge on its own release |
| `fixture/asset-route-probe.txt` :5–14 | PNG 200 `image/png`; SVG 404 `"unsupported image type"`; browser refreshed, host not restarted |
| `fixture/asset-route-probe.txt` :15–19, `fixture/lib-index-excerpt.js` :12 | the on-disk host half **does** whitelist `svg: 'image/svg+xml'` |
| `fixture/session-log-excerpt.txt` :6–10 | stored payload L232 = source L232 up to `stro` + source L247 tail; L233–247 absent |
| `fixture/session-log-excerpt.txt` :14–17 | disk copy of the same region is clean, including L247 |
| `fixture/session-log-excerpt.txt` :21–23 | source well-formed; payload not (`Specification mandates value for attribute stro0`, line 233 col 54) |
| `fixture/session-log-excerpt.txt` :31–34 | the *typed* result delivered to the caller was clean; the **persisted model-visible block** is the corrupt one; a re-read was clean (non-deterministic) |
| `fixture/package.json` :3 | committed manifest is 0.3.8 — the manifest is authoritative, the bundle constant is a stale copy of it |

Card / reference anchors used (IDs only, no text reproduced): skill `troubleshooting.md` rows for
phantom self-update, client/host plane asymmetry, and session-payload corruption; `migration-hygiene.md`
§1 (clean build) and §3 (client refresh vs host restart); `pre-flight.md` §1.5 + `scripts/ghost-host-check.mjs`
(ghost host); `host-plane-probes.md` discipline "ask the process, not the disk"; cards
`DSH-0.1.2-A1-19` (client bundle advertised through the boot manifest, revision-bearing URLs),
`DSH-0.1.5-A1-20` (an in-place upgrade can serve a stale/mismatched client combo — a host restart
self-heals it), `DSH-0.1.7-A2-04` (in some host versions client bundles are cached at host boot, so a
client-half edit can *also* need a restart — the plane rule is a default, not a law).

---

## 1 · Phantom self-update: the version constant is a **build-time** fact

### 1.1 Where the compared constant comes from

`PLUGIN_VERSION` is not a runtime read. The bundler (tsdown) inlines it from `package.json` **when the
bundle is emitted** (`client-bundle-excerpt.js` :7–9: "inlined … WHEN THE BUNDLE WAS BUILT — it is not
read dynamically at runtime"). So the bundle carries an *immutable snapshot* of the manifest version at
build time, and the release procedure is what decides whether that snapshot is still true when the tag
is cut. There are exactly two inputs to the badge decision:

* `latestTag` — fetched live from the mirrors (`git ls-remote --tags`, highest `vX.Y.Z`);
* `PLUGIN_VERSION` — frozen at build time.

### 1.2 The operation-order mistake

Reconstructed order (`release-log.md` :1–7):

1. 16:20 edit + tests; 16:21 typecheck/vitest green;
2. **16:22 `pnpm run build`** → the bundle is emitted while `package.json` still says `0.3.6`, so
   `PLUGIN_VERSION = "0.3.6"` is baked in;
3. **16:23 bump `0.3.6 → 0.3.7`** — this edits only the manifest, never the already-emitted JS;
4. 16:24 commit (including the stale `lib/client.js`) and `git tag v0.3.7`;
5. 16:25 push to three mirrors + `git ls-remote` SHA verification.

The bump therefore landed *after* the artifact it was supposed to describe. The artifact is version
0.3.6 by content and 0.3.7 by name. Nothing in the pipeline reconciled the two, because the build had
already finished — a *stale-constant* release, not a *stale-mirror* release.

At runtime `compareSemver("v0.3.7", "0.3.6") > 0`, so `newerTag` returns its **own tag** and the badge
renders on the very build that *is* v0.3.7. The update checker is not malfunctioning: it was handed a
self-description that was one release behind reality. Note the asymmetry that makes this so confusing
in the field — a *mirror lag* produces a **missing** badge; a *build-order inversion* produces a
**phantom** badge. Two opposite symptoms, two opposite causes.

### 1.3 Why mirror/tag integrity is irrelevant

`git-tags.txt` :3–11 shows all three mirrors (origin / public / omdsh) listing both tags with identical
SHAs, and `release-log.md` :7 records the `ls-remote` verification. That verification answers exactly
one question: *did every mirror receive the same object I pushed?* It cannot answer *does that object
describe itself correctly?* — the stale constant is **inside** the object, so it is pushed perfectly,
replicated perfectly, and verified perfectly, and is still wrong. A hash proves identity, not
correctness. The badge comes from mirror *tags*, which were always right; the lie came from the bundle's
own literal. Hence zero overlap between the two checks, hence "tag SHA verified on every mirror" and
"the plugin announces an update to itself" are simultaneously true.

### 1.4 Correct release order (what should have run)

1. edit + `typecheck` + tests (green);
2. **bump `package.json` version first** (the bump is an input to the build, never an afterthought);
3. `clean` then `build` — a clean build also removes the incremental-cache class of false signals
   (`migration-hygiene.md` §1);
4. **assert on the emitted artifact**, not on the source: grep the built `lib/client.js` for the baked
   constant and require it to equal the manifest version (and, for the host half, the same build stamp
   in `lib/index.js`);
5. update README install refs to `#v<new>`;
6. commit *including* the build output, then `git tag v<new>`;
7. push `main` + tag to every mirror; per mirror, verify the **exact tag's** SHA with
   `git ls-remote --tags <mirror> refs/tags/v<new>` (equality across mirrors, not "some tag exists");
8. post-release smoke against a **running** host: badge must be absent on the new version, and one
   host-plane probe (see §2) must answer for the new route.

### 1.5 The check that would have caught it before the push

Any one of these would have failed the release at step 4/6, before a tag existed:

* **Artifact grep (minimum viable gate).** Assert the shipped bundle literal equals the manifest:
  `grep -n 'PLUGIN_VERSION' lib/client.js` must show the *new* version. This is the exact check the
  carded lesson names ("bump first, then build, then grep the product for the new constant before
  commit/tag").
* **Self-update idempotence test (unit level).** `newerTag("v" + PLUGIN_VERSION) === undefined` — a
  plugin must never offer itself. This is a two-line test that encodes the whole invariant and does not
  depend on remembering release order.
* **Single-source the identity (structural).** Derive the displayed version from the served manifest /
  boot entry at runtime (the host already advertises the plugin's manifest — `DSH-0.1.2-A1-19`), or
  inline a build stamp *and* compare it with the manifest at load, logging a loud mismatch. Caution:
  any build-baked identity inherits the same order dependency, so cross-checking two baked values only
  helps if they are produced by different steps; the authoritative fix stays "the bump precedes the
  build".
* **Make the bump machine-owned.** Move the version bump into the release script (clean tree → bump →
  build → assert → tag) so a human cannot reorder it. Order is the defect; memory is not a control.

### 1.6 The re-release was itself a risk

`release-log.md` :10–13 records amend + rebuild + **force-move the tag on all three mirrors** as the
repair. It fixed the constant but rewrote published history: any consumer that already resolved
v0.3.7 to the old SHA now holds a divergent tag object, and mirror caches/CDNs may still serve the old
bytes. Correct handling: treat a force-moved tag as a *new* release for consumers (re-verify per-mirror
SHAs, re-run the artifact assertion, note the SHA change in the release log), and prefer a patch bump
(v0.3.7 → v0.3.7-1 / 0.3.8) over mutating a tag that has been observed. v0.3.8's corrected order
(bump → build, `release-log.md` :16–18) is the durable lesson.

---

## 2 · Client plane refreshed, host plane stale

### 2.1 Where each half is loaded, and when

| | Client half `lib/client.js` | Host half `lib/index.js` |
|---|---|---|
| loaded by | the **browser**, as a boot-manifest-advertised resource | the **host process**, via the plugin row's module import at apply |
| when | every page load / hard refresh (revision-bearing, no-cache URL) | **once**, at host boot, when the row is applied |
| lifetime | per document | per process (module cache + registered route + captured closure) |
| how a new build arrives | re-fetch on refresh | only by re-evaluating the module in a **new process** |
| what "hot update" covers | bundle replacement + config-row HMR mount/unmount | nothing — module code is not re-imported |

The observable split in this incident is exactly this table: the new **SVG render toggle rendered and
was clickable** (`asset-route-probe.txt` :2–3), so the browser was executing the v0.3.8 client half;
the host had **not** been restarted since before the whitelist edit (`release-log.md` :24–25).

Mechanism on the host side: `apply` runs once, registers the asset route on the web server, and the
handler closes over the `CONTENT_TYPES` map **as it was at registration time**. The extension check is
therefore frozen inside the running process. Editing/`pnpm build`-ing `lib/index.js` under a live host
changes a file nobody will read again — the process already has its module instance and its route.

### 2.2 How the three probe results pin it to the process

The probe trio (`asset-route-probe.txt` :5–19) is a small elimination proof:

1. **PNG → 200 `image/png`.** The route exists, the handler runs, path resolution and content-type
   mapping work. Rules out "route not registered", "server down", "whitelist empty".
2. **SVG → 404 with body `"unsupported image type"`.** That string is the handler's **own** whitelist
   rejection, not a filesystem error and not a framework 404. So execution reached the extension lookup
   and the lookup said "not whitelisted". Rules out a missing file (that would surface as ENOENT /
   a different error, and only *after* the whitelist passes) and rules out a client-side path encoding
   bug as the cause of *this* 404.
3. **Disk `lib/index.js` contains `svg: 'image/svg+xml'`** (`lib-index-excerpt.js` :12). The artifact on
   disk is correct, so the release is correct.

(1)+(2) say "the executing code rejects svg"; (3) says "the shipped code accepts svg". Both can only be
true if **executing code ≠ on-disk code** — i.e. the process is older than the change. Every alternative
attribution dies on one of the three facts: a bad release contradicts (3); an unregistered route
contradicts (1); a wrong request contradicts the handler-generated error text in (2).

This is the ghost-host signature from `pre-flight.md` §1.5 — *ask the process, not the disk*: the process
start time precedes the checkout's last change, while `package.json`, the tag and the directory name all
report the new version. `scripts/ghost-host-check.mjs` is the executable form of that verdict (exit 1 =
ghost); `host-plane-probes.md` is the same discipline applied to composition layers.

**Completing the proof (one extra probe each, still read-only).** The whitelist rejection happens
*before* the file is touched, so the current probe cannot distinguish "old whitelist, correct path" from
"old whitelist, wrong path". Two probes close that gap: request a **nonexistent `.png`** — on a healthy
route it passes the whitelist and fails at open (a *different* status/message), proving the handler does
reach the filesystem for whitelisted types; and request a **nonexistent `.svg`** on the restarted host —
it must answer "not found", not "unsupported image type". Together they separate whitelist state from
path validity.

### 2.3 What makes a host-plane change effective — and why the usual rule fails here

Making it effective: **fully stop the dsh host process, start it again, then re-probe.** A browser
refresh cannot help (the browser never loads `lib/index.js`), a rebuild cannot help (the process will
not re-import), and an install-tree edit cannot help even though, for a link/junction install, the repo
tree *is* the install directory and the edit is on disk instantly (the S14 link-install pattern: repo
edits are immediately visible on disk, yet the host half still needs the restart). Verification after
restart: same route, `.svg` → 200 + `content-type: image/svg+xml`, `.png` → 200, host start time later
than the file mtime, and the plugin row present in the boot graph.

Why "plugins hot-update" does not apply: the rule people carry is really two narrower rules that got
compressed into a slogan —

* **client-side HMR / bundle re-fetch**: a new `lib/client.js` is picked up because the *browser*
  re-fetches the advertised resource on load, and the client module registry re-evaluates it;
* **composition-level HMR**: adding/removing/toggling a Cordis row in the profile patch is applied live
  by the loader (mount/unmount), no process restart.

Neither path re-evaluates an already-imported **host module**. Node's module cache returns the instance
first evaluated, and the route registration is a side effect of that instance's `apply`, holding a
closure over its data. So host-half code changes are precisely the class that requires a process
restart. Two further caveats keep this honest: `DSH-0.1.7-A2-04` shows some host versions cache client
bundles at host boot too (a client-half edit then *also* needs a restart), and `DSH-0.1.5-A1-20` shows a
stale client combo that only a restart heals — i.e. "client = instant, host = restart" is a default,
verify both halves per host version rather than trusting the slogan.

**Defensive instrumentation worth adding.** Have the build inject one stamp into *both* halves and
return it from the asset route as a response header (`x-plugin-build: <stamp>`). Then a single request
distinguishes "old process" from "old release" without a restart or a shell, and the same single-source
discipline as §1.4 applies. Until then, the cheap habit is a two-line probe after any host-half change:
old type 200 + new type 200, or the change is not live.

---

## 3 · Broken image: the transcript was corrupted, not the file

### 3.1 Where the corruption happened

The chain is: **file on disk → host read tool → result-text assembly → session event → session-log
writer → client session payload → plugin renderer.** The fixture brackets the fault to one link:

* the source file loads as valid XML (no error);
* the **stored** payload record is not well-formed XML — `error on line 233 at column 54:
  Specification mandates value for attribute stro0`;
* the *typed* result handed to the caller was clean, and a later re-read came back clean.

So the writer persisted verbatim what it was given, and the file is innocent; the corrupt text was
produced while the **model-visible result block** was assembled — i.e. in the result-text assembly
upstream of the plugin, before persistence — and it is **non-deterministic** (same input, two different
persisted texts).

### 3.2 Shape of the damage — a prefix-overlap splice

Payload line 232 = source line 232 up to `... stroke="#dde6ea" stro` **plus** source line 247's tail
`0,1 821,730" ...`, and source lines 233–247 (15 lines) are simply gone. The join lands on a **shared
prefix**: `stro` ends 232's `stroke-width=`, and line 247's arc-flags field begins `0 0,1` — the spliced
tail starts at `0,1`. This is not bit-flip noise, not an encoding fault, and not truncation (the tail of
a *later* line is present): it is the fingerprint of an incremental accumulator that matched on a short
prefix and continued writing at the wrong offset, dropping the bytes in between. Corroborating detail:
the payload's own XML error names exactly the join point (`attribute stro0`), because `stro` + `0` reads
as an attribute name.

### 3.3 Why the plugin must treat the session payload as untrusted input

1. **It is not the file.** It is a projection: read → filtered/possibly truncated → assembled →
   persisted → replayed → transported. Any of those stages can alter it (as it just did), and the plugin
   has no way to audit them.
2. **It is demonstrably non-deterministic here.** The same region came back clean on re-read, so a
   renderer keyed on the payload produces flapping UI — right and wrong at different times, with no
   change to the file. A preview that is sometimes wrong is worse than one that says "unverified".
3. **Rendering is code-execution surface.** Inline SVG is not inert: `<script>`, `on*` handlers,
   `javascript:`/`data:` URLs, `<foreignObject>`, external `<use>`/`xlink:href`, DOCTYPE entities. A
   corrupted fragment also shifts parser-recovery behaviour (the parser may "repair" the splice into a
   tree nobody designed). So a payload that fails validation must never be injected into the app
   document.
4. **Provenance must be visible.** The user needs to know whether the preview shows what is on disk now
   or what the transcript claims was read. Silently rendering the payload hides that distinction.

### 3.4 Why editing / "repairing" the traced file would have been the wrong move

* **It is not the faulty artifact.** The evidence (two XML verdicts) already proves the file parses;
  editing it changes bytes that were never broken, while the real producer keeps corrupting every other
  read.
* **It destroys the only known-good reference.** The comparison "disk line 232 vs payload line 232" is
  the whole proof; once the file is touched, "the payload is corrupt" degrades to "they differ", and the
  attribution becomes unfalsifiable.
* **It destroys the forensic record.** The recoverable evidence is the *stored* text inside a specific
  zstd frame. Rewriting the source, or "fixing" the persisted payload, both erase the evidence needed
  for an upstream report (see §5) — and rewriting an append-only, hash-addressed log would also
  invalidate the session's integrity.
* **It hides a class-level bug.** The splice is produced by generic text assembly, so it can hit any
  file type and any session; a per-file repair converts a systemic defect into an unreproducible
  curiosity.
* **It corrupts user data for a cosmetic defect.** The render is a preview; the file is the user's
  artifact. Nothing about a broken preview authorises a write.
* **It would not even fix the symptom.** Other sessions, already-persisted logs, and every future read
  still carry the corruption; the plugin would keep rendering broken images from stale payloads.

Correct response: **(a)** validate before rendering (§4); **(b)** prefer disk bytes (§4 L1); **(c)** file
an upstream text-corruption report carrying source hash + frame index + exact stored text + XML error +
the clean re-read, and keep the local file untouched.

---

## 4 · Defensive render chain for an SVG preview

Design goal: maximise *authority* (render what is true), then *safety* (never execute untrusted SVG in
the app document), then *observability* (never a silent broken image). Four levels, in this order, each
with an explicit failure mode.

### L1 — disk bytes through the host asset route (authoritative)

`GET /<plugin>/asset?path=<abs>` → raw bytes, `Content-Type` from an explicit extension whitelist,
`X-Content-Type-Options: nosniff`.

Why first: it is the only source that cannot be affected by context spill, truncation, projection or
replay, and it is exactly what the user will commit. It also reuses the same bytes the trace claims to
describe, so a mismatch becomes a *signal* rather than a silent substitution.

Requirements: path confined to the trace's recorded root (no traversal, no absolute-path injection),
size cap before read, whitelist drives both type and disposition, `nosniff`, and a cache policy that
cannot serve a pre-edit body from the stale host (see §2 — the route is where staleness shows up first).

Residual failure: `404 unsupported image type` while another type answers 200 ⇒ **host stale**, not a
bad file — surface that specific diagnosis instead of "broken image" (§4 L4).

### L2 — session payload, only behind an XML well-formedness gate

Gate, in order, cheapest first:

1. structural: text starts with `<` / `<?xml`, no NUL bytes, size cap;
2. **well-formedness + root**: `new DOMParser().parseFromString(text, 'image/svg+xml')`; reject when
   `doc.getElementsByTagName('parsererror').length > 0` or `doc.documentElement.localName !== 'svg'` or
   the namespace is not `http://www.w3.org/2000/svg`;
3. active-content denial: no `<script>`, no `on*` attributes, no `javascript:`/`data:text/html` URLs, no
   `<foreignObject>`, no external `href`/`xlink:href`/`<use>` targets, no DOCTYPE/entity declarations,
   no `<style>@import`;
4. if it passes, it is still treated as an *unverified copy*: labelled with provenance ("from session
   payload, not re-read") and rendered only through L3.

Why second (not first): the payload is the text the trace points at, it can be the only surviving copy
(file since changed/deleted), and it keeps the preview consistent with the transcript — but it is lossy
and untrusted, so it must never outrank disk. The gate is what turns the S19 corruption into a clean,
explicit "payload invalid at line 233 col 54" instead of a broken image.

### L3 — sandboxed iframe as the last render fallback

`<iframe sandbox="" srcdoc="…" referrerpolicy="no-referrer">` (no `allow-scripts`, no
`allow-same-origin`), with the SVG embedded in a wrapper document carrying
`Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src data:`.

Why: even a validated SVG can be hostile (the validator is a denylist of known constructs; parser
recovery can synthesise structures the validator never saw). The iframe's opaque origin is the
containment boundary, and `sandbox=""` blocks scripts while **SMIL** (`<animate>`,
`<animateTransform>`) and CSS animations keep running — animation is not script, so the preview stays
faithful for exactly the traced artwork in question. Never `allow-scripts` together with
`allow-same-origin` (that combination can reach out of the frame and remove the sandbox).

Why last: it is the most expensive and the least integrated — no parent-DOM styling, no intrinsic-size
measurement for layout, pointer events sealed off. So: use it for animated/unverified content, and use
the cheaper `<img src="route">` path for static disk bytes when the engine's SMIL-in-`img` behaviour is
acceptable (browsers disable scripting inside `<img>` SVG, but SMIL/CSS animation support there is
engine-dependent — which is why the *animated* preview path is the iframe, not the `<img>`).

### L4 — explicit error state, never a silent broken image

State machine: `disk-ok` · `disk-missing` · `payload-valid-unverified` · `payload-invalid(line,col)` ·
`blocked-by-policy(reason)` · `host-stale(old-type-200 + new-type-404)`.

Each state renders a distinct message with: provenance (disk vs payload vs fallback), the DOMParser
error text and line/column when applicable, a **Re-read from disk** action that re-requests L1, and a
**Report this payload** action that packages the evidence of §5. No state may render an `<img>` with a
src that 404s and leave the browser's broken-image glyph as the only feedback.

Justification summary:

| Level | Authority | Safety | Cost | Failure surfaced |
|---|---|---|---|---|
| L1 disk via route | highest (byte-exact, current) | high (`nosniff`, whitelist, read-only) | one HTTP GET | `host-stale`, `disk-missing` |
| L2 payload + XML gate | low (projection, non-deterministic) | medium (validator + no inline mount) | parse only | `payload-invalid(line,col)` |
| L3 sandboxed iframe | inherits the chosen source | highest (opaque origin, scripts off, SMIL on) | iframe + wrapper | `blocked-by-policy` |
| L4 error states | — | — | — | converts every silent break into a diagnosis |

Ordering rationale in one sentence: **the most authoritative source wins by default, the least trusted
source needs a validator to exist at all, containment covers whatever the validator missed, and every
refusal is a visible state rather than a broken pixel.**

---

## 5 · Forensics: decoding a concatenated-Zstandard generation file

### 5.1 Why the container shape matters

The persisted session log (`session.v4.jsonl.zstd`) is JSONL records inside a **sequence of independent
zstd frames**, appended one frame per flush/generation, concatenated in a single file. Three
consequences:

* the file is not `JSON.parse`-able, and it is not one stream you can treat as a blob of text;
* decoding the whole file loses the generation boundary — you get the right characters but cannot say
  *which generation* stored them;
* because frames are append-only and never rewritten, the **exact bytes of the corrupt generation
  survive** even after a later clean re-read lands in a newer frame. That is what turns the anecdote
  ("it looked broken once") into evidence ("generation N stored this exact text; generation M stored a
  clean copy of the same region").

### 5.2 Procedure (read-only, reproducible)

1. **Preserve first.** Copy the log to the report workspace; record size + mtime + sha256 before and
   after the copy (a live host is still appending). Never edit, never re-compress, never "repair".
2. **Split frames by walking the structure — never by searching for the magic bytes.** `28 B5 2F FD`
   occurs inside compressed block payloads, so a magic search yields false boundaries. Walk instead:
   * 4-byte magic `0xFD2FB528`; skippable frames `0x184D2A50`–`0x184D2A5F` carry a 4-byte size to jump
     over;
   * Frame_Header_Descriptor → flags for `Window_Descriptor` presence, dictionary-id size
     (0/1/2/4 B), frame-content-size field size (0/1/2/4/8 B depending on the flag + single-segment
     bit);
   * block headers: 3-byte little-endian (last-block bit, 2-bit type, 21-bit size) — raw and compressed
     advance by `size`, RLE advances by 1, type 3 is reserved (parse error);
   * optional 4-byte content checksum after the last block.
3. **Decode each frame independently** (`node:zlib` `zstdDecompressSync` on the frame's byte range) and
   keep `(frameIndex, byteOffset, compressedLength)` with the decoded text.
4. **Locate the record** by session id + tool-call id + result kind, then extract `payload.text`
   **verbatim** — no trimming, no reflow, no normalisation — and hash it.
5. **Diff against the source of truth.** Map payload line N to disk line N (the trace is line-addressed),
   find the first divergent byte, print ±3 lines from both sides. In S19 the divergence is at line 232,
   the join sits on the shared prefix `stro`, the tail is source L247's, and L233–247 are absent — a
   shape that rules out truncation (a later line's tail is present) and encoding damage (only one join,
   everything before it byte-identical).
6. **Order the generations.** Show the corrupt frame and the later clean frame side by side; the pair
   proves producer-side non-determinism with the source file unchanged.
7. **Corroborate independently** with an XML well-formedness check on both texts (source: no error;
   payload: `attribute stro0`, line 233 col 54), and note that the *typed* result delivered to the
   caller was clean — the damage is in the model-visible/persisted block, which is why re-reading "fixed"
   it.
8. **Package and report upstream**: source path + hash, frame index + byte range, exact stored slice,
   parser error, timestamps, clean re-read frame index, and the reproduction hint (large single-file
   read, non-deterministic). Keep the original log untouched — it is the evidence.

### 5.3 Working artifact in this report

`session-log-decode.mjs` (this directory) implements steps 2–4: a sequential frame walker (with
skippable-frame support), per-frame `zstdDecompressSync`, and a `--find <regex> --context N` mode that
prints each matching record **with its generation index**.

`session-log-decode.selftest.mjs` proves it on a synthetic four-frame log (three data frames + one
skippable frame) built to reproduce the S19 shape — generation 1 stores the spliced text, generation 2
stores the clean copy of the same region — and asserts that (a) all frame extents reconstruct the file
exactly, (b) the splice is recovered byte-for-byte from frame 1, (c) the two generations are distinct.
Both scripts write only inside this directory and the self-test removes its temp file.

Verified in this session (synthetic data only — the fixture ships a *decoded* excerpt, not the binary
log): `node session-log-decode.selftest.mjs` → exit 0, `{ frames: 4, okFrames: true, spliceKept: true,
distinct: true }`; a CLI run over a two-frame sample printed the corrupt and the clean record under
separate frame headers (`offset=0` / `offset=84`).

Usage:

    node session-log-decode.mjs <copy-of-session.v4.jsonl.zstd> --find "tool/result" --context 2

### 5.4 Prevention checklist items this incident adds

**Release (client plane)**

1. **Version bump BEFORE build**, enforced by a release script, not by memory; `clean` before build.
2. **Grep the shipped bundle for the baked constant** and fail the release when it ≠ `package.json`
   (and assert the same for the host half's build stamp).
3. **Self-update idempotence test**: own version/tag must never produce a badge.
4. **Per-mirror tag SHA verification for the exact tag**, plus a re-read of the *content* that SHA points
   at (manifest version + baked constant) — SHA equality only proves replication, and this incident
   passed that check while shipping a lie.
5. **Never force-move a published tag**; if unavoidable, treat it as a new release, re-run items 2 and 4,
   and record the SHA change.

**Runtime (host plane)**

6. **Restart the host whenever `lib/index.js` changed**; after restart, probe one old type and one new
   type on the same route (200/200), and confirm the process start time is later than the file mtime.
7. **Ship a build stamp from both halves** (header on the asset route + the client constant) so
   half-vs-half staleness is one request away.
8. Add a `host-stale` diagnosis to the render chain (old type 200 + new type 404 ⇒ restart hint) instead
   of a generic failure.

**Payload / rendering (data plane)**

9. **Treat the session payload as untrusted rendering input**: XML well-formedness gate + active-content
   denial before any render, and never inline-mount it in the app document.
10. **Prefer disk bytes**; when only the payload exists, label it unverified and keep an explicit error
    state (never a silent broken image).
11. **Report the upstream text-corruption bug, never paper over it in the plugin**: no file edits, no
    payload rewriting, no truncation "sanitiser"; capture the frame-identified evidence bundle and file
    it. Adding a validator is defence; repairing the artifact is evidence destruction.

---

## 6 · Boundaries observed / not done

* `fixture/` was read only; nothing in it was created, modified, moved or deleted (no build, install,
  migration, `git` command or network call was run).
* No file outside the cell directory was read; all writes are inside
  `agent-output/S19-phantom-update-stale-host/` (this report plus the decoder and its self-test).
* Nothing here asserts that a fix was applied — this is a diagnosis. Item 1's repair is a release-order
  change (maintainer side), item 2's repair is a host restart plus verification, item 3's repair is
  upstream, and item 4 is a design to implement under a separate, confirmed change.
* Unverified by construction: the fixture contains excerpts, not the binary session log, the full
  bundles, or a live host; §5.4 items 6–7 are recommended checks, not performed ones.
