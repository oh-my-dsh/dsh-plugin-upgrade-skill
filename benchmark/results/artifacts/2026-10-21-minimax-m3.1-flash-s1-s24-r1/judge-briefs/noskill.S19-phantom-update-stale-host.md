# JUDGE BRIEF · noskill.S19-phantom-update-stale-host

## Criteria (sealed rubric)
- [baked-version-release-order] (20pt) Compare release-log.md and client-bundle-excerpt.js: build preceded the bump, baking 0.3.6 into the shipped v0.3.7 client, so a newer-tag comparison reports an update to itself despite correct mirrored tags. Explain that package.json is not reread at runtime. Bump before build, inspect the emitted version constant before commit/tag/distribution, and retain mirror verification; do not confuse v0.3.8’s later manifest with the earlier build.
- [client-host-update-asymmetry] (20pt) Use asset-route-probe.txt and lib-index-excerpt.js: the refreshed client shows the toggle, PNG 200 proves the route exists, SVG 404 unsupported-type shows its running whitelist is old while disk already permits SVG. This linked install needs the host restarted to reload its boot/apply-time handler; client refresh does not replace that closure. Keep the conclusion specific to this host lifecycle, not every possible plugin hot-reload mechanism.
- [payload-corruption-attribution] (20pt) Use session-log-excerpt.txt’s clean source/XML and typed read result versus spliced persisted model-visible text and clean reread to locate corruption in upstream result-text assembly. The plugin consumes the damaged copy; the traced disk file is innocent. Treat the payload as untrusted input and do not “repair” the good SVG. No identification of an unseen internal function is required.
- [validated-render-fallbacks] (20pt) Design and justify the ordered chain: authoritative disk bytes via the asset route; session payload only after XML well-formedness validation (DOMParser/parsererror or equivalent); a sandboxed iframe fallback with scripts blocked while permitting SMIL; an explicit error if content/validation/rendering fails. Validation failure must not pass the same malformed payload unchecked to the iframe. Equivalent implementation details are accepted; this is a plan, not an executed security test.
- [forensics-and-prevention] (20pt) Explain decoding all concatenated Zstandard frames, preserving order and reconstructing the JSONL event containing the exact stored splice, then comparing that text with the source and reporting the upstream bug. A decoder that handles concatenated frames directly is equivalent to a manual frame loop; do not require magic-byte constants. Checklist: bump before build, verify the shipped constant and per-mirror tag SHA, and use plane-specific runtime probes. No actual log decode or upstream posting is required.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [contradictory-release-render-advice] ceiling=0 The final advice says bump-after-build is acceptable, mirror repush alone repairs the baked constant, browser refresh updates this host route without restart, or the clean traced SVG should be edited. Rendering the session payload without XML validation or allowing scripts in the fallback also triggers this cap. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.

## Candidate report(s)
#### FILE: S19-phantom-update-stale-host/S19-phantom-update-stale-host-report.md

# S19 · The Phantom Update, the Stale Host Half, and the Corrupted Payload

**Analysis report (read-only).** Evidence base: the sealed fixture pack under `fixture/`
(8 files, SHA-verified by `fixture-seal.pre.json` / `fixture-seal.source.json`, which are
identical — the pack is unmodified). Nothing under `fixture/` was changed. No live host
introspection, no network, no external services were used; every claim below is derived
from the fixture and the task brief, and anything not derivable is listed in §6.

---

## 0. Executive summary

| # | Symptom | Root cause | One-line fix |
|---|---|---|---|
| 1 | v0.3.7 shows "新版本 v0.3.7 可用" on itself | The compared constant `PLUGIN_VERSION` is **baked into the client bundle at build time**; the build ran at 16:22 while the version bump ran at 16:23, so the shipped v0.3.7 bundle still said `"0.3.6"` | **Bump the version BEFORE the build**; CI-assert the shipped bundle's constant == the released version |
| 2 | v0.3.8 SVG toggle appears, but the host asset route 404s on `.svg` (PNG 200) | **Split-brain across planes**: the client half is re-fetched by the browser (new UI), the host half is a Node module evaluated **once at host boot** — and no host restart happened | **Restart the host process**; treat host-plane changes as "requires host restart", not "hot-updates like plugins" |
| 3 | One traced SVG renders broken | The **session-log payload text** is corrupted: line 232 was spliced with line 247's tail at a shared prefix (`stro`+`0,1` ⇒ attribute `stro0`), and source lines 233–247 are gone. The file on disk is well-formed; a re-read is clean ⇒ **intermittent corruption in result-text assembly, upstream of the plugin** | **Never render unvalidated text**; validate with `DOMParser`/`parsererror`, prefer disk bytes, and **report the upstream bug — do not "repair" the file** |

The three are independent failure modes that happened to land in one release session. Only #1
is a release-process defect; #2 is a deployment/operational defect; #3 is an upstream
host-tooling defect that the plugin can only *defend* against, not fix.

---

## 1. The phantom self-update: a build-time constant compared against a live tag

### 1.1 Where the compared constant comes from

`fixture/client-bundle-excerpt.js` is the verbatim shipped `lib/client.js` for the
**v0.3.7 tag** — i.e. the file actually served to the browser after the release. It
contains:

```js
/** The running plugin version (from package.json at build time). */
export const PLUGIN_VERSION = "0.3.6";
// tsdown inlined this constant from package.json WHEN THE BUNDLE WAS BUILT —
// it is not read dynamically at runtime.
```

and the check itself:

```js
function newerTag(latestTag) {
  return latestTag !== undefined && compareSemver(latestTag, PLUGIN_VERSION) > 0
    ? latestTag : undefined;
}
// newerTag("v0.3.7") with PLUGIN_VERSION "0.3.6" -> "v0.3.7"  → badge shows
// "新版本 v0.3.7 可用" on the just-released v0.3.7 itself.
```

So the check is a comparison between **two values of completely different lifetimes**:

| Operand | Where it comes from | Lifetime |
|---|---|---|
| `latestTag` | `git ls-remote --tags` against the mirrors, no auth; the highest `vX.Y.Z` wins (`fixture/git-tags.txt`) | **live** — re-read at runtime, every check |
| `PLUGIN_VERSION` | `package.json`, inlined by tsdown **at build time** | **frozen** — whatever the manifest said when the bundle was produced |

The plugin therefore compares *what the world currently has* against *what the bundle
believes it is*. The bundle's self-belief is a **build-time artifact**, and the release
process made that belief false by one release.

### 1.2 The actual operation-order mistake

`fixture/release-log.md` (v0.3.7, reconstructed from the session):

```
3. 16:22 `pnpm run build` — client bundle emitted           ← build ran here
4. 16:23 bump `package.json` version 0.3.6 → 0.3.7          ← version bumped AFTER the build
5. 16:23 README install refs updated to `#v0.3.7`
6. 16:24 `git commit` (includes the already-built `lib/client.js`) and `git tag v0.3.7`
7. 16:25 pushed `main` + tag to the three mirrors (origin / public / omdsh);
   `git ls-remote` verified the tag SHA on all three
```

The mistake is a **two-step ordering inversion**, and it has two halves that must both be
true for the phantom to appear:

1. **The build preceded the bump.** At 16:22 the manifest said `0.3.6`, so tsdown inlined
   `PLUGIN_VERSION = "0.3.6"` into `lib/client.js`. The 16:23 bump changed
   `package.json` — a *different file* that the already-emitted bundle no longer depends
   on, because the constant was inlined rather than imported.
2. **The stale bundle was committed and tagged.** Step 6 commits "the already-built
   `lib/client.js`" into the v0.3.7 tag. So tag `v0.3.7` denotes a tree in which
   `package.json` says `0.3.7` and `lib/client.js` says `0.3.6` — the artifact is
   internally inconsistent, and the inconsistency was *published and tagged*.

Note that the *content* fix (the markdown frontmatter fix in `src/client/markdown.tsx`)
was perfectly fine; only the version identity baked beside it was wrong.

### 1.3 Why mirror and tag integrity are irrelevant to this symptom

The badge is a pure function of two operands:

```
badge = newerTag( max over mirrors of vX.Y.Z , PLUGIN_VERSION_baked_into_the_running_bundle )
```

The mirror side is *correct* — and that is precisely the problem. `fixture/git-tags.txt`
shows all three mirrors listing **both** tags with **identical SHAs**
(`v0.3.7` = `748b5e56…`, `v0.3.8` = `d887deb0…`). The release log records that
`git ls-remote` verified the tag SHA on every mirror. So:

- **Transport was verified, content was not.** A per-mirror SHA check proves *all mirrors
  serve the same bytes*; it says nothing about *what those bytes claim about themselves*.
- **The wrong value is the one that was checked.** The mirror integrity check observed
  the distribution channel; the defect lives in the artifact travelling through it. The
  same stale `"0.3.6"` was on origin, public and omdsh — *identically* — so SHA equality
  across mirrors is a **consistency** signal, not a **correctness** signal. Had the
  mirrors disagreed, that would have been a different bug.
- **The failure is intra-artifact, not inter-mirror.** The question "is `lib/client.js`'s
  version constant == the tag it is shipped under?" is answerable by looking at one file
  and one manifest. It is orthogonal to how many mirrors exist.
- **The comparison can only ever be against a live tag.** The check fetches "the newest
  mirror tag" — so publishing a tag is *precisely* what creates the divergence. Before
  16:25 the newest tag was `v0.3.6` and the baked constant was `0.3.6` ⇒
  `compareSemver === 0` ⇒ no badge. The instant `v0.3.7` was pushed, the *same* bundle
  became "outdated by one release" — against itself.

Therefore the badge is not evidence of a broken mirror, a failed push, a partial rollout,
or a tag-SHA problem. It is evidence that **the shipped bundle's self-identification is
stale by exactly one release**.

A secondary observation (robustness nit, not the cause): the constant is written
unprefixed (`"0.3.6"`) while the tag carries a `"v"` prefix (`"v0.3.7"`). The
fixture's own comment shows the comparator tolerating that, but a release should normalise
the prefix on both sides so a future comparator change cannot turn into a second class of
phantom/phantom-silence bug.

### 1.4 Corrected release order, and the check that catches the stale constant

**Wrong (v0.3.7):**

```
edit → typecheck → test → BUILD (bakes 0.3.6) → BUMP to 0.3.7 → README
     → commit (stale bundle) → tag v0.3.7 → push → verify SHA (passes!) → announce
```

**Right (the order the release log says was adopted for v0.3.8 — "bump FIRST, then build"):**

```
edit → typecheck → test
     → BUMP package.json to 0.3.7            ← identity first
     → BUILD (bakes 0.3.7)                   ← artifact now matches identity
     → VERIFY (see checks below)
     → COMMIT (bundle regenerated in the same commit)
     → TAG v0.3.7 → PUSH
     → per-mirror `git ls-remote --tags` SHA verification (all three == local tag SHA)
     → announce
```

**The pre-push check that would have caught the stale constant** (this is the missing
gate; the SHA check that *was* performed cannot catch it):

1. **Grep the shipped bundle for the baked constant and compare it to the manifest.**
   ```bash
   # the exported constant must equal the released version
   grep -oE 'PLUGIN_VERSION\s*=\s*"[^"]+"' lib/client.js      # -> PLUGIN_VERSION = "0.3.7"
   # no older version literal may survive anywhere in the artifact
   grep -oE '"[0-9]+\.[0-9]+\.[0-9]+"' lib/client.js | sort -u # -> must be exactly {0.3.7}
   # and it must equal package.json
   node -p "require('./package.json').version"                  # -> 0.3.7
   ```
2. **A self-check unit test — the direct expression of the bug.** The plugin must never
   report itself as outdated relative to its own version:
   ```js
   expect(newerTag("v0.3.7")).toBeUndefined();  // PLUGIN_VERSION === "0.3.7"
   ```
   Under the shipped v0.3.7 bundle this test fails immediately (`newerTag("v0.3.7") ===
   "v0.3.7"`).
3. **A reproducibility / stale-artifact gate in CI:** rebuild from the tagged commit and
   require a clean diff — ```bash
   git checkout v0.3.7 && pnpm build && git diff --exit-code
   ```
   This proves the committed bundle really is the build of the tagged source, which is
   exactly the invariant step 6 broke.
4. **Mechanical enforcement of the order** (so it cannot regress by hand):
   - run the build from the version lifecycle (`preversion`/`version`/`postversion`, or
     `pnpm version` → `pnpm build`) so bumping *always* rebuilds;
   - and/or have the release script assert the bundle is **newer than** the
     `package.json` mtime, failing loudly if a build predates the bump.

**After-the-fact repair.** The release log records that a re-release (amend + rebuild +
force-move the tag on all mirrors) was required, which is consistent with this analysis:
the bad artifact was already published *and already fetched by browsers*, so fixing the
source alone would not help installed clients. Two cautions: force-moving a tag mutates
an immutable name, and any client that cached the old SHA must be forced to re-fetch —
so the per-mirror SHA verification must be repeated **after** the force-move, and
preferring a *new* tag (as v0.3.8 did) over mutating `v0.3.7` is the safer long-term
practice.

---

## 2. Client plane vs host plane: why the new UI arrived and the new route did not

### 2.1 The two halves, and where each one is loaded

The plugin ships two artifacts with two different lifecycles:

| Half | Artifact | Where it lives | When its code is evaluated | How a new version reaches it |
|---|---|---|---|---|
| **Client plane** | `lib/client.js` (the bundle excerpted in the fixture) | Served over HTTP to the browser as static assets | In the **browser**, at page load / bundle fetch | The browser **re-fetches** the bundle; a refresh picks up the new bytes |
| **Host plane** | `lib/index.js` (the host half, excerpted in the fixture) | A Node module loaded by the long-lived **DSH host process** | **Once, at host boot / plugin load** — module-level constants like `CONTENT_TYPES` and the route registration are evaluated then | Only when the host process **re-evaluates the module** — i.e. a host restart (or a plugin host-side reload, if the host supports one) |

The host half's whitelist is module-level state:

```js
// fixture/lib-index-excerpt.js — shipped lib/index.js (host half) at tag v0.3.8
const CONTENT_TYPES = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif', ico: 'image/x-icon',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
};
```

Because `CONTENT_TYPES` is a `const` evaluated when the module is imported, a process
that imported it *before* the SVG entry existed holds the **old table in memory
forever** — the file on disk can be correct while the running process is not.

### 2.2 What the fixture shows, and what it pins down

`fixture/release-log.md` (v0.3.8 section) states: "a host restart had **NOT** been
performed in this session (the client half was confirmed refreshed: the new toggle button
was rendered by the browser)". `fixture/asset-route-probe.txt` is explicit that the
probes ran "AFTER the browser was confirmed refreshed … host NOT restarted since before
the SVG whitelist change."

The three probes, and what each one eliminates:

1. **PNG → `200 OK`, `content-type: image/png`.**
   The route `/dsh-file-trace/asset?path=…` **is registered and serving**. The plugin
   is loaded; the handler runs; the content-type machinery works. This eliminates
   "route missing", "plugin not installed", "wrong URL", "host down".

2. **SVG → `404 Not Found`, body `"unsupported image type"`.**
   The 404 is not a *routing* failure — its body names the **whitelist** as the reason.
   The handler made a *decision*: "the extension of this path is not in the table I am
   holding". That is the signature of a **running process holding an older table**, not
   of a missing route and not of a bug in the whitelist logic of the current release.

3. **The shipped `lib/index.js` on disk DOES whitelist `svg: 'image/svg+xml'`.**
   The release artifact is **correct**. Therefore the process is **not** running the
   release. Disk and memory have diverged.

Put together: *correct release + correct client bundle + no restart + a decision-shaped
404* ⇒ the staleness is pinned to the **running host process**, not to the release, not
to the mirrors, not to the client, and not to the network. The SVG route would have
answered 200 the moment the host re-evaluated the shipped `lib/index.js`.

### 2.3 What makes a host-plane change effective

**Restart the host process** (or any mechanism that causes the host half to be
re-imported and the route re-registered with the new `CONTENT_TYPES`). The fixture
records no host-side unload/reload capability, so "restart the host" is the operative
remedy; a plugin-host-side reload would be equivalent **only** if the host actually
re-evaluates the module rather than reusing the cached one.

Two operational corollaries:

- **Re-installing or re-linking the plugin on disk is not a restart.** Updating the files
  on disk changes what a *future* boot would load; it does not retroactively change the
  module already evaluated in the live process. This is exactly how the two halves
  diverged in the first place: the client half was re-fetched over HTTP, and the host
  half was never re-evaluated.
- **A host-plane change is invisible in the UI.** Nothing in the browser indicates that
  the server is running old code. The new toggle button rendering is evidence about the
  *client* half only — it is not evidence about the host half. The two planes have
  independent lifecycles, and "the feature appears" is not "the feature works".

### 2.4 Why this is the one case where the "plugins hot-update" rule does not hold

The common rule is that plugins hot-update: you do not need to restart the application to
pick up plugin improvements, because the plugin's browser-side code is re-fetched and
swapped. That rule is **true for the client plane and false for the host plane**:

- Client plane: new code reaches the browser on the next fetch/reload — no process
  restart, no coordination, visible immediately (here: the v0.3.8 SVG render toggle).
- Host plane: new code reaches the host only at **boot**. Routes, service providers and
  module-level tables are bound when the module is evaluated. A client-only refresh
  therefore yields a **split-brain system**: a UI newer than the server that serves it.

The general rule to carry forward: **when a release touches both planes, the client side
can be verified by observation, but the host side can only be verified by a restart plus
a re-probe.** The v0.3.8 release note should therefore have said, explicitly,
"requires a host restart" — and the upgrade path should have performed it.

---

## 3. The broken image: attribution to the session payload, not to the traced file

### 3.1 The shape of the corruption

From `fixture/session-log-excerpt.txt`:

- **Stored in the session log (payload ~line 232):**
  `    232:     <circle r="98" fill="none" stroke="#dde6ea" stro0,1 821,730" fill="none" stroke="#ffffff" stroke-width="3" opacity=".7" stroke-linecap="round"/>`
  — and the file's real lines 233–247 are **absent**; line 247 survives only as its tail.
- **On disk (same region, read separately):**
  `    232:     <circle r="98" fill="none" stroke="#dde6ea" stroke-width="6.5"/>`
  `    233:     <circle r="92" fill="none" stroke="#ffffff" stroke-width="2.4" opacity=".5"/>`
  `    …`
  `    247:     <path d="M 587,730 A 122,122 0 0,1 821,730" fill="none" stroke="#ffffff" stroke-width="3" opacity=".7" stroke-linecap="round"/>`
- **Verdicts:** source file = *well-formed* (`System.Xml XmlDocument` load: no error);
  log payload = **not** well-formed — "error on line 233 at column 54: Specification
  mandates value for attribute `stro0`".

The **attribute name `stro0` is the smoking gun.** It can only be produced by
concatenating the truncated `stro` (the start of `stroke-width="6.5"` on source line
232) with a following `0,1` (the arc flags of line 247's path data). The payload is a
**splice of two non-adjacent source regions**, cut at a point the assembler judged to be a
shared prefix, with source lines 233–247 dropped entirely.

Two consequences that matter for the fix:

- The payload is **not merely malformed, it is incomplete**. Even a parser that tolerated
  the bad attribute would render a visibly *wrong* drawing: two `<circle>` rings and the
  closing arc `<path>` are simply gone. **No local patch can restore fidelity.**
- The corruption is **not content-specific to XML**. Any read result that assembles text
  from multiple chunks can be spliced the same way; the SVG merely made it *visible*
  because the browser renders malformed markup as a broken image.

### 3.2 Which layer produced the text

The fixture answers this directly:

> "The read tool's TYPE result delivered to the caller was clean; the corrupted text is
> the model-visible result block persisted into the session log, i.e. the corruption
> happened in the result-text assembly, upstream of the plugin. A re-read of the same
> region afterwards came back clean (non-deterministic)."

So the pipeline was:

```
read tool (typed result — CLEAN)
   → result-block / model-visible text assembly   ← ★ CORRUPTION HERE (upstream of the plugin)
   → session log (concatenated-zstd generation file) — stores the corrupted text
   → plugin renders the model-visible payload → BROKEN IMAGE
```

The three facts that together locate the fault:

1. **The file on disk is well-formed** ⇒ the file was never damaged; no write path
   touched it.
2. **The stored payload is not well-formed** ⇒ the defect is in the text that travelled,
   not in the file it describes.
3. **A re-read came back clean** ⇒ the defect is **intermittent**, not deterministic.
   A deterministic bug (a bad regex, a wrong serialiser, a lossy codec) would corrupt
   *every* read; a clean re-read proves the trigger is a race / interleaving / chunk-merge
   condition in the assembly path.

**The plugin is downstream of the fault and cannot be its author.** The plugin received a
byte sequence that was already corrupt, and it faithfully rendered what it was given.

### 3.3 Why the plugin must treat the session payload as untrusted rendering input

- **The transport does not guarantee byte fidelity.** The payload crossed at least two
  lossy/async hops (tool result → result-block assembly → session-log persistence → back
  into the plugin's model-visible context). This incident is the proof that the guarantee
  does not hold; the plugin has no way to know in advance which read was hit.
- **The payload is a *view* of the file, not the file.** It carries a line-number gutter
  (`    232:     …`), and it may be truncated, summarised, header-prefixed or partially
  re-serialised. The plugin cannot assume "the text I was handed is the file's bytes".
  Anything it renders must be validated *after* normalisation, on the exact bytes it will
  display.
- **Rendering unvalidated text is a security boundary, not only a correctness one.** SVG
  and HTML sinks accept `<script>`, event-handler attributes, `javascript:`/
  external references and entity payloads. Feeding unvalidated bytes into a rendering sink
  is an XSS-class exposure, independent of the corruption bug.
- **Validating is cheap; a broken render is expensive.** `DOMParser` on a few KB of
  markup is free next to the cost of showing a broken image and the debugging time it
  causes (as this very incident shows).

### 3.4 Why editing or "repairing" the traced file would have been the wrong move

1. **The file is correct; editing it would create the damage.** The on-disk source
   passes `XmlDocument` load. Patching it to match a corrupted copy would corrupt good
   user data in order to match bad transported bytes.
2. **It would not fix anything.** The defect is in the assembly path, upstream. The next
   read of the next file would corrupt again — silently, because the symptom would now
   look "handled".
3. **It cannot restore the lost content.** Lines 233–247 are gone from the payload; any
   local "repair" of the `stro0` attribute would still yield a picture missing two rings
   and the closing arc. A repair that produces a *parseable but wrong* image is worse than
   a visible error, because it looks successful.
4. **It hides the real defect.** The upstream race keeps corrupting other reads,
   unobserved, until it hits something more important than a preview thumbnail.
5. **"Repair heuristics" in a renderer are a general corruption vector.** A plugin that
   silently rewrites text before rendering can mangle legitimate content and can be
   exploited to smuggle altered markup past validation.
6. **Ownership.** The user's file is the source of truth; the transport is the defective
   component. The correct plugin behaviour is *validate, fall back, and surface the
   error*; the correct maintainer behaviour is *report the upstream bug with evidence*.
   A re-read that comes back clean is the strongest possible argument for "the file is
   fine, the transport is not" — repair is the wrong side of that conclusion.

---

## 4. Defensive render chain for the SVG preview

Design principle: **each tier trades fidelity for information, and no tier may ever
degrade into a silent broken image.**

```
  ┌ L1  disk bytes via the host asset route      ← authentic, byte-exact
  │        │  404 "unsupported image type" / 5xx / timeout
  │        ▼
  ├ L2  session payload, ONLY after DOMParser XML well-formedness check
  │        │  parsererror present / not <svg> root
  │        ▼
  ├ L3  sandboxed <iframe> (scripts blocked, SMIL animations still run) — contained best-effort
  │        │  nothing renderable
  │        ▼
  └ L4  explicit error state (never a broken <img>, never an empty box)
```

### L1 — Disk-bytes asset route (first choice)

Request the file's **bytes** from the host asset route
(`GET /dsh-file-trace/asset?path=…`) and render those bytes, not a text copy.

*Why:* it is the only source whose provenance is unambiguous — the bytes come from the
file itself, bypassing the session-payload transport that corrupted the text. It is also
the path already proven alive by the PNG probe, and it returns a correct
`content-type` header, so the renderer needs no guessing. Cache-bust it (path + mtime or
hash) so a previously cached 404/negative response cannot be reused, and **do not cache
failures**.

*Required handling:* a `404 "unsupported image type"` from L1 is **not** a render
failure — it is the **stale-host signature** from §2 and must be reported as such
("host restart required"), then the chain continues to L2. Treating it as "image
unavailable" would have produced exactly the silent broken image the brief asks to
eliminate.

### L2 — Session payload, only after an XML well-formedness check

If L1 is unavailable (stale host, file not on disk, path not permitted), fall back to
the model-visible payload text, but **validate before rendering**:

```js
const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
const failed = doc.getElementsByTagName('parsererror').length > 0;   // XML mode reports here
if (failed) throw new RenderError('payload-not-well-formed', detailFrom(doc));
if (doc.documentElement?.localName !== 'svg') throw new RenderError('not-an-svg');
```

*Why this gate and not a try/catch around the render:* `DOMParser` in XML mode does not
throw — it returns a document whose `parsererror` element carries the diagnostic (here:
the attribute `stro0` at line 233 column 54). The failure mode is a **successfully
parsed error document**, so the check must be an explicit `parsererror` test. Requiring an
`<svg>` root additionally rejects a well-formed non-SVG payload (e.g. an HTML error page
or a JSON blob) that would otherwise render as garbage.

*Additional content policy before rendering anything from the payload:* reject
`<script>`, `on*` handler attributes, `<foreignObject>`, `javascript:` and
external `href`/`xlink:href` targets, and DOCTYPE/ENTITY declarations (XXE /
billion-laughs). Validate **the exact byte string that will be rendered**, after any
gutter-stripping/normalisation — validating a pre-normalisation string proves nothing
about what is displayed.

*Why L2 is not first:* the payload is a lossy, occasionally-corrupt *view* of the file
(§3.3). It is a legitimate fallback because it is what the model already has in context —
but only behind a proof of well-formedness.

### L3 — Sandboxed iframe (last render fallback)

When the bytes cannot be validated as XML but a best-effort preview is still wanted
(the user explicitly asked to see the file; partial content may still render), load the
content in a sandboxed `<iframe>`:

```html
<iframe sandbox="" srcdoc="…the svg…" title="SVG preview"></iframe>
```

*Why:* the iframe is a **containment boundary**. With `sandbox` and **no**
`allow-scripts`, no script in the SVG executes; with **no** `allow-same-origin`, the
frame is an opaque origin and cannot reach the plugin UI's DOM, cookies or storage; with
no `allow-top-navigation` it cannot hijack the page. A malformed or hostile SVG inside
such a frame can at worst look wrong — it cannot break the plugin.

*Why SMIL still works:* SVG's declarative animation (`<animate>`, `<animateTransform>`,
`<animateMotion>`) is interpreted by the SVG rendering engine, **not** by the script
engine. Blocking JavaScript therefore stops `<script>` while leaving SMIL animation
fully functional — the property that makes L3 a useful *render* tier rather than a
last-ditch display of text.

*What L3 does not buy you:* the browser still renders malformed SVG as best-effort
garbage. A sandbox contains the damage; it does not validate the input. So L3 must still
be followed by L4 whenever the frame produces nothing, and the "contained" nature of the
frame must never be reported to the user as "the file rendered successfully".

### L4 — Explicit error state (instead of a silent broken image)

When no tier yields a valid render, show a **structured, actionable error card** in the
plugin UI — never a broken `<img>` with alt text, never a blank box, never a spinner
that resolves to nothing. The card should carry:

- **Which tiers were tried**, in order, and why each was rejected:
  - *L1*: HTTP status and response body — e.g. `404 "unsupported image type"` ⇒
    **"the host process is running an older version; restart the host"** (the §2 case);
  - *L2*: the parser diagnostic — e.g. *not well-formed, attribute `stro0`, line 233
    column 54* ⇒ **"the session payload for this file is corrupted; re-read the file"**;
  - *L3*: "contained preview produced no output".
- **The file identity** (path, size, mtime) so the same failure is recognisable across
  sessions.
- **The next action**: restart the host (L1 failure) / re-read the file (L2 failure) /
  report upstream (L2 failure that repeats on re-read — a signal of the §3 upstream bug).
- **Which tier actually rendered**, recorded in diagnostics, so a support ticket can tell
  "this was an L2 render of a payload that happened to be valid" from "this was an
  authentic L1 render".

*Why:* a silent broken image destroys the evidence. This incident was only diagnosable
because the failure was captured and the session log was decodable; an empty box would
have produced an unanswerable bug report. An explicit error state is both better UX and
better instrumentation.

### Summary of the ordering rationale

| Tier | Source | Fidelity | Safety | Cost | When it applies |
|---|---|---|---|---|---|
| L1 | host asset route | exact bytes | typed response | one HTTP round-trip | always first |
| L2 | session payload + validation | good, but only if `parsererror` is absent | validated + policy-filtered | in-memory parse | L1 unavailable |
| L3 | sandboxed iframe | best-effort, may be wrong | isolated (no script, opaque origin) | cheap | content not validatable but user asked to see it |
| L4 | error state | n/a | n/a | n/a | nothing validatable — **never** a broken image |

---

## 5. Forensics method and prevention

### 5.1 Decoding the session log frame-by-frame (and the trap that hides the evidence)

The session log is a **concatenated-Zstandard generation file**: a sequence of
independent zstd frames, one per generation/record, laid end to end.

**The trap (verified empirically on this machine — Node v24.14.1 `zlib`, Python
`zstandard` 0.25.0):** a naive whole-buffer decode returns **only the first frame, and
does so silently, with no error and a success exit code.**

| Method | Result on a synthetic 3-frame file (210 payload bytes total) |
|---|---|
| `zlib.zstdDecompressSync(concatBuf)` (Node 24) | **78 bytes — frame 0 only**, no error raised |
| `zlib.createZstdDecompress()` streaming, `end(concatBuf)` (Node 24) | **frame 0 only** |
| Python `ZstdDecompressor().decompress(concatBuf)` | **78 bytes — frame 0 only**, no exception |
| Python `stream_reader(..., read_across_frames=True)` | all 3 frames, but frames are not individually addressable |

Consequence for the investigation: anyone who "decodes the session log" with a single
decompress call sees only the first generation and will **wrongly conclude the corruption
is not there**. The evidence is not missing; the decoder is.

**Correct method — decode frame-by-frame with exact boundaries.** Python's
`zstandard` gives the precise primitive: `decompressobj()` + `unused_data`.

```python
import zstandard as zstd

buf = open(log_path, "rb").read()
i = 0
while buf:
    d = zstd.ZstdDecompressor().decompressobj()
    out = d.decompress(buf)     # exactly one generation
    buf = d.unused_data         # exact byte boundary of the next frame
    emit(i, out)                # the stored text, verbatim
    i += 1
```

Verified: this recovered all three frames of the synthetic file with exact per-frame
lengths (78 / 61 / 43) and correct per-frame text, in order.

**Fallbacks when `zstandard` is unavailable.** The `zstd` CLI is not present on this
machine; the standard CLI `zstd -d file.zst` likewise stops at the first frame, so it is
not a substitute. Use instead:

- *Python, magic scan + per-candidate decode:* find each frame header
  (`\x28\xb5\x2f\xfd`) and decode from each candidate offset, accepting a candidate
  only if it decodes cleanly. Caveat: the magic can also occur inside compressed payload
  bytes, so a naive scan can yield false positives — always validate the candidate.
- *Node (no external deps):* `zlib.zstdDecompressSync` exists in Node ≥ 22.15/24 but
  also stops at frame 0; combine it with the same magic scan, which I verified recovers
  every frame.

Then, on the recovered generations:

1. Locate the generation holding the **read result for the traced SVG**.
2. Extract the **exact stored text bytes** (do not re-render, re-format or "fix" them).
3. Diff that text against a **fresh read of the same region from disk**. The diff is the
   splice: payload 232 = source 232 truncated at `"stro"` + source 247's tail from
   `"0,1 821,730"` onward, with source 233–247 absent.
4. Run the well-formedness verdict on **both** sides and keep both verdicts:
   - source: well-formed (`System.Xml XmlDocument` load: no error);
   - payload: **not** well-formed — "error on line 233 at column 54: Specification
     mandates value for attribute `stro0`".
   I reproduced the verdict locally with Python's `xml.dom.minidom`: the spliced string
   raises *"not well-formed (invalid token)"* while the source parses cleanly.
5. Note the **non-determinism** (a re-read is clean) and the **incompleteness** (15 lines
   missing) — the first rules out a deterministic transform, the second rules out a
   "repair" as a remedy.

The **decisive datum** is the attribute name `stro0`: it is producible only by
concatenating the truncated `stro` with a following `0,1`, i.e. it proves a splice of
two non-adjacent regions rather than a plain truncation. That single token, plus the
clean re-read, turns the anecdote into evidence.

### 5.2 Release-checklist items this incident adds

1. **Bump the version BEFORE the build** (and make it mechanical).
   Order: *bump → build → verify → test → commit → tag → push*. Never build before
   bumping. Enforce it with a lifecycle hook so bumping always rebuilds
   (`preversion`/`version`/`postversion` → `pnpm build`) and/or a release-script
   assertion that the bundle's mtime is **newer** than `package.json`'s. The v0.3.7
   release log shows the inversion; the same log records that the order was corrected for
   v0.3.8.
2. **Grep the shipped bundle for the baked constant** before pushing.
   Assert the exported `PLUGIN_VERSION` in the built artifact equals the released
   version, that no older version literal survives anywhere in the bundle, and that both
   equal `package.json`. Add the **self-check test** `newerTag("<own tag>") === undefined`
   — the direct expression of "a plugin must never report itself as outdated relative to
   its own version". Add the **rebuild-from-tag gate** `git checkout <tag> && pnpm build &&
   git diff --exit-code`, which proves the committed bundle is the build of the tagged
   source (the invariant the v0.3.7 commit broke).
3. **Per-mirror tag SHA verification — keep it, and know what it does *not* prove.**
   `git ls-remote --tags` on **each** mirror (origin / public / omdsh) and assert the
   SHA is identical across mirrors *and* equal to the local tag's SHA — the fixture shows
   this was done and was *correct*. The lesson is not to drop it but to add the
   **intra-artifact** check beside it: SHA equality is a *consistency* signal (the same
   bytes everywhere), while the phantom was a *correctness* defect (the same wrong bytes
   everywhere). Corollary: after a force-move re-release, re-verify the SHAs on all
   mirrors, and prefer publishing a new tag over mutating an existing one.
4. **Report the upstream text-corruption bug — do not paper over it in the plugin.**
   File it against the result-block assembly / session-log persistence layer with the
   decoded frame evidence, the exact splice shape, the attribute-level smoking gun
   (`stro0`), the 15 missing lines, the non-determinism, and the reproduction recipe from
   §5.1. The plugin's correct response is **validation + fallback + an explicit error
   state** (§4) — *not* repair heuristics, and *not* edits to the user's file.
5. **Add a "requires host restart" note to any release that touches the host half**,
   and make the upgrade path perform the restart. Route/whitelist/service changes are
   bound at host boot; the release notes are the only place a user learns this. A cheap
   hardening: have the host log its effective asset-route content-type table at startup,
   so "the host is running an older build" is diagnosable in one glance instead of by
   probe archaeology.
6. **Never ship a prebuilt artifact without proving it corresponds to the tagged source.**
   Tie the build into the commit (no "commit the already-built bundle" step) and let CI
   rebuild from the tag to prove it.

---

## 6. Evidence index, and what remains unconfirmed

### 6.1 Claim → evidence

| Claim | Evidence |
|---|---|
| The compared constant is build-time-baked, not read at runtime | `fixture/client-bundle-excerpt.js` (comment: "tsdown inlined this constant from package.json WHEN THE BUNDLE WAS BUILT"; value `"0.3.6"`) |
| The badge logic and its result for `v0.3.7` | same file (`newerTag` + the inline comment `newerTag("v0.3.7") … -> "v0.3.7"`) |
| Build preceded the version bump; stale bundle committed and tagged | `fixture/release-log.md` steps 3, 4, 6 |
| All three mirrors carry both tags with identical SHAs | `fixture/git-tags.txt` |
| The check reads the newest mirror tag, unauthenticated | `fixture/git-tags.txt` comment |
| The host half's whitelist on disk includes `svg` | `fixture/lib-index-excerpt.js` (tag v0.3.8) |
| PNG 200 / SVG 404 "unsupported image type"; route alive; host not restarted | `fixture/asset-route-probe.txt` |
| The client half was refreshed; no host restart in the v0.3.8 session | `fixture/release-log.md` (v0.3.8 section) + `asset-route-probe.txt` header |
| The payload is spliced (232 + 247-tail), lines 233–247 missing | `fixture/session-log-excerpt.txt` §1, §4 |
| Source well-formed; payload not (attribute `stro0`, 233:54) | `fixture/session-log-excerpt.txt` §3 |
| The corruption is upstream of the plugin, in result-text assembly, and intermittent | `fixture/session-log-excerpt.txt` §4 (final paragraph) |
| v0.3.7 shipped the phantom and required an amend/rebuild/force-move re-release; the order was fixed for v0.3.8 | `fixture/release-log.md` (post-release symptom paragraph) |
| Manifest version for the current release is 0.3.8 | `fixture/package.json` |

### 6.2 Unconfirmed (flagged rather than guessed)

- **The precise upstream mechanism of the splice.** The fixture attributes it to
  "result-text assembly, upstream of the plugin"; it does not identify the specific
  writer/merge routine, and the fixture is the only admissible source here. What *is*
  established: the file on disk was never written, the read tool's typed result was clean,
  the corrupted text is the model-visible result block, and a re-read is clean
  (intermittent). The exact internal cause is unconfirmed.
- **The exact column arithmetic of the XML error (233:54).** The decisive datum is the
  attribute name `stro0`; the reported column depends on the payload's line-gutter format
  and on whether the payload carries a preamble header (the reported *line* 233 for a
  payload line numbered 232 suggests a one-line offset). The excerpt does not show the
  payload in full, so the exact column is unconfirmed — the attribute name is not.
- **A minor discrepancy inside the fixture itself.** The prose in
  `session-log-excerpt.txt` §4 describes the spliced tail as starting at
  `"0 0,1 821,730"`, while the literal payload line shows `…stro0,1 821,730"` and the
  parser error names the attribute `stro0`. The literal payload and the error message
  agree that the tail begins at `"0,1"`; the prose appears to carry a transcription slip.
  Treated here as: literal payload authoritative.
- **Whether the shipped v0.3.7 client bundle in `git-tags.txt` (`748b5e56…`) is the
  original or the amended re-release.** The fixture records that a re-release was
  required but does not label the SHA. Unconfirmed.
- **Whether the v0.3.8 client bundle has a correct baked constant.** The release log
  states the rebuild order was corrected for v0.3.8, but the only bundle excerpt in the
  pack is the v0.3.7 one. If the order fix was applied, v0.3.8 is clean; the pack does
  not let this be verified, and the §5.2 checks would confirm it.
- **The mechanism by which the client bundle was re-fetched** (cache headers, plugin
  cache invalidation, HMR) is not recorded; the fixture establishes only the observable
  fact that the client half was refreshed (the new toggle rendered).
- **Whether the host supports unloading/reloading a plugin's host half** without a full
  restart. Not in the fixture; "restart the host" is therefore given as the operative
  remedy.
- **The host's internal route-registration API** is not in the pack; the conclusion that
  the whitelist is bound at module load follows from the evidence (module-level `const`
  in the shipped file + a decision-shaped 404 from a non-restarted process), not from
  host internals.

### 6.3 Scope note

Nothing under `fixture/` was modified; the only writes were the report and a scratch
area under `agent-output/`. No host introspection, no network access, and no
external services were used — every finding comes from the fixture plus the task brief.

---

## Appendix A · Verified tooling recipes used in this report

Both were executed locally against synthetic inputs (not against the sealed fixture) to
confirm the technique before describing it.

**A.1 Whole-buffer zstd decode silently returns only the first frame**

```js
// Node v24.14.1
const z = require('node:zlib');
const f1 = z.zstdCompressSync(Buffer.from('A\n'));
const f2 = z.zstdCompressSync(Buffer.from('B\n'));
const cat = Buffer.concat([f1, f2]);
z.zstdDecompressSync(cat).toString();   // -> 'A\n'   (frame 2 lost, no error)
```

**A.2 Frame-by-frame decode with exact boundaries (Python)**

```python
import zstandard as zstd
buf = open(log_path, 'rb').read()
while buf:
    d = zstd.ZstdDecompressor().decompressobj()
    out = d.decompress(buf)   # one generation
    buf = d.unused_data       # exact next-frame boundary
    print(out.decode('utf-8', 'replace'))
```

**A.3 Node fallback: magic scan + per-candidate decode**

```js
const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
let pos = 0;
while ((pos = cat.indexOf(MAGIC, pos)) !== -1) {
  try { console.log(z.zstdDecompressSync(cat.subarray(pos)).toString()); } catch {}
  pos += 1;
}
```
(A magic byte sequence can also occur inside compressed payload bytes — treat a candidate
as valid only if it decodes cleanly, and prefer the `unused_data` method where the
library exposes it.)

**A.4 The well-formedness gate**

```js
const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
const bad = doc.getElementsByTagName('parsererror').length > 0;
```

**A.5 The semver self-check**

```js
// with PLUGIN_VERSION = "0.3.6"  -> newerTag("v0.3.7") === "v0.3.7"  (phantom)
// with PLUGIN_VERSION = "0.3.7"  -> newerTag("v0.3.7") === undefined  (correct)
```


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.