# S19 - The Phantom Update, the Stale Host Half, and the Corrupted Payload

Incident: client plugin `@dsh-external/dsh-file-trace`, release session of 2026-09-05, versions v0.3.7 (markdown renderer fix) and v0.3.8 (SVG render preview).
Evidence pack: `fixture/` (read-only). Report + reproduction artifacts: `agent-output/S19-phantom-update-stale-host/`.

---

## 0. Verdict at a glance

| # | Symptom | Root cause | Layer | Fix |
|---|---|---|---|---|
| 1 | Freshly released v0.3.7 shows its own update badge ("新版本 v0.3.7 可用") | `PLUGIN_VERSION` is inlined into `lib/client.js` **at build time**; `package.json` was bumped **after** `pnpm run build`, so the shipped bundle still carried `0.3.6` while the mirrors/tag carried `0.3.7` | release process (build order), not the mirrors, not the tag | bump **before** build + a pre-push gate that greps the built bundle for the baked constant |
| 2 | v0.3.8 SVG toggle appears in the browser, but Render 404s for `.svg` while `.png` returns 200 and the on-disk `lib/index.js` whitelists `image/svg+xml` | the host half is loaded **once at host boot**; the asset route was registered from a pre-svg module instance. The host process was never restarted, so the running route table still holds the old whitelist | **running host process** (in-memory module + route table), not the release | restart the host (or genuinely reload the plugin) so `lib/index.js` is re-evaluated and routes re-registered |
| 3 | Rendering one traced SVG produces a broken image | the **session payload** text was corrupted upstream (mid-file line spliced with another line's tail at a shared prefix); the file on disk is well-formed and a re-read is clean | session result-text assembly, upstream of the plugin | treat the session payload as untrusted rendering input; validate before rendering; never write it back to the traced file |

All three symptoms share one theme: **the artifact that was verified is not the artifact that was executed.** The tag SHA was verified on three mirrors (irrelevant to symptom 1), the disk copy of `lib/index.js` was correct (irrelevant to symptom 2), and the source file on disk was well-formed (irrelevant to symptom 3).

---

## 1. Evidence base and integrity

Everything below is derived from the eight files in `fixture/`. The fixture was accessed read-only; no file in it was created, modified or deleted. SHA-256 prefixes recorded at analysis time (so any later drift is detectable):

| File | Bytes | SHA-256 (first 16 hex) | Role in the analysis |
|---|---|---|---|
| `fixture/README.md` | 1152 | `110916a5e05224fc` | evidence index |
| `fixture/release-log.md` | 1591 | `a83ef6ebc611dc6b` | the actual operation order for v0.3.7 / v0.3.8 |
| `fixture/package.json` | 141 | `33a06353cc2771fa` | manifest as committed for v0.3.8 (`"version": "0.3.8"`) |
| `fixture/git-tags.txt` | 696 | `68f00028bbdcb055` | per-mirror tag listings (identical SHAs) |
| `fixture/client-bundle-excerpt.js` | 800 | `37b53a5eaa733e41` | shipped client bundle's self-update check, verbatim |
| `fixture/asset-route-probe.txt` | 766 | `444217154496a3e0` | PNG 200 / SVG 404 probes after the client was refreshed |
| `fixture/lib-index-excerpt.js` | 364 | `c664935064b5ffc8` | shipped host whitelist (contains `svg`) |
| `fixture/session-log-excerpt.txt` | 1968 | `620d7b9ec6fdd61a` | decoded session-log excerpt: stored text, source lines, XML verdicts |

Two claims in this report were **reproduced experimentally** rather than only read (see Appendix A for the artifacts):

1. the stored payload line is byte-for-byte reconstructible as `source[232][0:52] + source[247][35:131]` - and the same reconstruction, validated with .NET `System.Xml`, reproduces the evidence's quoted error position **exactly** (`Line 233, position 54`);
2. a concatenated-zstandard session generation file can be carved frame-by-frame and its stored text recovered, which is what turns the anecdote into evidence (section 6).

---

## 2. Finding 1 - the phantom self-update

### 2.1 Where the compared version constant comes from

`fixture/client-bundle-excerpt.js` is the self-update check as shipped for the v0.3.7 tag:

```js
/** The running plugin version (from package.json at build time). */
export const PLUGIN_VERSION = "0.3.6";
// tsdown inlined this constant from package.json WHEN THE BUNDLE WAS BUILT -
// it is not read dynamically at runtime.

function newerTag(latestTag) {
  return latestTag !== undefined && compareSemver(latestTag, PLUGIN_VERSION) > 0
    ? latestTag
    : undefined;
}
```

So the comparison has two operands from **two different clocks**:

* **left operand** - the newest tag, fetched at **runtime** by `git ls-remote --tags` against the three mirrors (`fixture/git-tags.txt`: "the self-update check fetches exactly these tags (git ls-remote --tags, no auth) and picks the highest vX.Y.Z");
* **right operand** - `PLUGIN_VERSION`, a **build-time snapshot** frozen into the bundle bytes by tsdown. Nothing re-reads `package.json` at runtime.

### 2.2 The actual operation-order mistake

`fixture/release-log.md` (v0.3.7, local timestamps):

```
16:20 edit src/client/markdown.tsx (frontmatter fix) and add regression tests
16:21 pnpm run typecheck - green; npx vitest run - 104 passed
16:22 pnpm run build - client bundle emitted           <- build ran here
16:23 bump package.json version 0.3.6 -> 0.3.7         <- version bumped AFTER the build
16:23 README install refs updated to #v0.3.7
16:24 git commit (includes the already-built lib/client.js) and git tag v0.3.7
16:25 pushed main + tag to the three mirrors (origin / public / omdsh);
      git ls-remote verified the tag SHA on all three
```

The bundle was emitted from a **0.3.6** manifest, so tsdown inlined `PLUGIN_VERSION = "0.3.6"`. Two minutes later the manifest and the tag moved to 0.3.7 and the (already-built) bundle was committed and published. The released artifact therefore advertises a version one behind the tag it was published under.

The badge then follows arithmetically. With `PLUGIN_VERSION = "0.3.6"` and the mirror list containing `v0.3.7`:

```
newerTag("v0.3.6") -> compareSemver = 0  ->  no badge
newerTag("v0.3.7") -> compareSemver = +1 ->  BADGE "新版本 v0.3.7 可用"
newerTag("v0.3.8") -> compareSemver = +2 ->  BADGE (had it been checked against 0.3.6)
```

The plugin is not lying about the mirrors and it is not confused about semver: it is comparing a stale build-time constant against a correct runtime tag list. That is why the symptom is *self-referential* - the released v0.3.7 announces an update to itself.

### 2.3 Why mirror/tag integrity is irrelevant here

`fixture/git-tags.txt` is, in fact, a clean bill of health:

```
origin  748b5e56e41ca4dc22da1631569fb29d8ae0b99d   refs/tags/v0.3.7
origin  d887deb0f526ba6a76818e531c740893bd8e9b33   refs/tags/v0.3.8
public  748b5e56...  refs/tags/v0.3.7      (identical SHA)
omdsh   748b5e56...  refs/tags/v0.3.7      (identical SHA)
```

All three mirrors serve the new bundle, both tags exist, and the tag SHA was verified on every mirror. Integrity checking answers exactly two questions: *do the mirrors agree with each other and with the local tag*, and *does the tag point at the intended commit*. It says nothing about **what is inside the artifact**, and the stale constant lives inside the artifact. This is why the incident is confusing: every check the release process actually performs was green. The defect was in the one thing it does not check - the bytes of the built bundle.

Concretely, tag verification cannot detect this failure because the tag is correct: `v0.3.7` really does point at a commit whose `lib/client.js` says `0.3.6`. Nothing is inconsistent *between* the mirrors; the inconsistency is *inside* the published artifact.

### 2.4 Corrected release order

```
1. bump package.json version (0.3.x -> 0.3.(x+1))          # FIRST, before any build
2. (optionally) git commit the bump alone, so the bump is reviewable
3. pnpm run typecheck && npx vitest run
4. pnpm run build                                       # bakes the NEW constant
5. GATE: assert the built bundle's PLUGIN_VERSION === package.json.version   (section 2.5)
6. git commit (including the built lib/) && git tag v0.3.(x+1)
7. push main + tag to each mirror
8. per-mirror verification: git ls-remote --tags <mirror> == git rev-parse v0.3.(x+1)
9. post-release smoke: on the released build, the self-update check must report NO update
```

The maintainer applied exactly this correction for v0.3.8 ("the rebuild order was corrected for v0.3.8 (bump FIRST, then build)"), which is why the v0.3.8 client shows no phantom badge: `PLUGIN_VERSION = "0.3.8"` and `compareSemver("v0.3.8", "0.3.8") = 0`.

### 2.5 The check that would have caught the stale constant before pushing

One line, run between step 4 and step 6, fails the release:

```bash
# extract the constant that tsdown baked into the shipped artifact ...
grep -o 'PLUGIN_VERSION = "[^"]*"' lib/client.js
# ... and compare it with the manifest of the commit being tagged
node -p "require('./package.json').version"
```

Run against the fixture's bundle excerpt this is exactly what it reports:

```
$ grep -o 'PLUGIN_VERSION = "[^"]*"' lib/client.js
  -> PLUGIN_VERSION = "0.3.6"        # fixture/client-bundle-excerpt.js (the v0.3.7 artifact)
$ node -p "require('./package.json').version"
  -> "0.3.8"                          # fixture/package.json (the v0.3.8 commit)
```

At v0.3.7 tag time the same gate would have printed `0.3.6` against a tag of `v0.3.7` and failed. Stronger forms of the same gate:

```js
// CI, before tagging:
const baked = grepConstant('lib/client.js');          // '0.3.6'
const manifest = require('./package.json').version;   // '0.3.7'
const tag = nextTag();                                // 'v0.3.7'
if (baked !== manifest)  fail('STALE VERSION CONSTANT: bundle=' + baked + ' manifest=' + manifest);
if (compareSemver(tag, baked) !== 0) fail('self-update would fire on the release itself');
```

Two structural improvements that remove the manual step entirely:

* **derive the version from git at build time** (`git describe --tags` / a `version` define injected by the bundler), so the constant cannot drift from the tag;
* **compare runtime-to-runtime**: have the client read the installed version from the manifest that ships next to the bundle instead of a constant frozen at build time. The current design is build-time-vs-runtime, which is a race by construction.

### 2.6 A note on the v0.3.7 remediation

The log records the fix as "amend + rebuild + force-move the tag on all mirrors". The rebuild is right, but force-moving an already-published tag destroys the guarantee that the per-mirror SHA verification is supposed to provide: anyone who fetched `v0.3.7` holds an object that no longer exists, and "all mirrors agree" becomes meaningless the moment the tag is moved. A patch release (`v0.3.7.1`) or letting `v0.3.8` supersede the bad artifact is the safer remediation - and, as it happens, `v0.3.8` did supersede it in the same session.

---

## 3. Finding 2 - client-plane refresh vs host-plane boot-time registration

### 3.1 Where each half’s code is loaded, and when

The plugin ships two halves with completely different loading models:

| | Client half (`lib/client.js`) | Host half (`lib/index.js`) |
|---|---|---|
| Runs in | the browser | the host Node process |
| Loaded by | an HTTP fetch of the bundle when the plugin UI loads | `import`/`require` at **host boot** (plugin load time) |
| Refreshed by | page reload (re-fetch of the bundle; hash/cache-busted), HMR in dev | **nothing at runtime** - the module instance lives in the process |
| Side effects at load | renders UI | **registers the asset route** into the host router, closing over that module instance’s `CONTENT_TYPES` |
| Stale-code window | one page load | until the host process restarts |

Because the client half is fetched over HTTP, pushing new code to the link-installed repo is enough: the next page load pulls the new bytes. Because the host half is evaluated once at boot, pushing new code to disk changes nothing in the running process - Node does not re-evaluate an already-cached module, and the route table that was built from the old instance is still the one serving requests.

### 3.2 Why the new client UI reached the browser but the new host route did not

* The v0.3.8 push updated `lib/client.js` on disk; the browser re-fetched it on reload and rendered the new SVG render toggle. No host involvement. (`fixture/release-log.md`: "the client half was confirmed refreshed: the new toggle button was rendered by the browser".)
* The v0.3.8 push also updated `lib/index.js` on disk - the shipped file *does* contain `svg: 'image/svg+xml'` (`fixture/lib-index-excerpt.js`). But the host process that answers `/dsh-file-trace/asset` had been started **before** that change ("a host restart had NOT been performed in this session"), so it was still serving the route registered from the older module instance, whose whitelist had no `svg` entry.

The client half therefore ran the new code while the host half ran the old code, in the same session, against the same commit on disk. Nothing was broken in either artifact.

### 3.3 How the probe results pin the staleness to the RUNNING host process

`fixture/asset-route-probe.txt` (executed *after* the browser was confirmed refreshed, host not restarted):

```
GET /dsh-file-trace/asset?path=E%3A%5C...%5Cdaigo-final.png
< 200 OK
< content-type: image/png

GET /dsh-file-trace/asset?path=E%3A%5C...%5Cdaigo-bicycle.svg
< 404 Not Found
< "unsupported image type"
```

Each observation eliminates a candidate explanation:

| Hypothesis | What it predicts | Probe result | Verdict |
|---|---|---|---|
| Route not registered at all (bad install, wrong mount path) | PNG also 404s | PNG **200** `image/png` | eliminated |
| Client bundle not refreshed (browser cache) | new toggle absent | toggle **visible and clickable** | eliminated |
| Release did not actually ship svg support (bad build / mirror drift) | disk `lib/index.js` lacks `svg` | disk copy **has** `svg: 'image/svg+xml'` | eliminated |
| Wrong path / bad URL encoding for this one file | both probes 404 | same path pattern, PNG 200 | eliminated |
| **Running host process still holds the pre-svg module instance** | route alive (PNG 200) but the whitelist branch rejects `svg` (404 "unsupported image type") | **exactly observed** | **consistent** |

The decisive detail is the 404 **body**: `"unsupported image type"` is not a router-level "no such route" message, it is the extension-whitelist branch *inside* the handler firing. A missing route cannot produce it; only a handler whose `CONTENT_TYPES` lacks `svg` can. Combined with the fact that the file on disk at that moment *does* whitelist `svg`, the difference is necessarily between **disk (new)** and **memory (old)** - i.e. the staleness is in the running host process, not in the release, the mirrors, the browser cache or the file.

### 3.4 What makes a host-plane change effective

A host-plane change becomes effective only when the host re-evaluates the plugin’s server code and rebuilds its side effects:

1. **restart the host process** (the reliable option), or
2. a genuine **plugin reload** that invalidates the module cache and re-registers the routes - note that a reload which merely re-`require`s the module may return the cached instance, so it must actually drop the cache entry and re-run the plugin’s registration hook.

After that, and only after that, the running handler sees the new whitelist and the SVG probe returns 200. Nothing on the client side can substitute: a reload, a hard refresh, or clearing the browser cache all act on the browser’s copy of `lib/client.js`, not on the host’s route table.

### 3.5 Why this is the one case where "plugins hot-update" does not hold

The usual rule - *plugins hot-update, so just reload the page* - is a statement about the **client plane**. It holds because client code is re-fetched from disk over HTTP every time the UI loads (and is additionally covered by HMR in dev). Its precondition is: *the code is read from its source when it is used*.

The host half violates that precondition. It is loaded once, at boot, into a long-lived process, and its load has side effects (route registration, service providers, host-side state) that are baked into the live process. There is no HMR for server-side route tables, and no file watcher re-imports the module when the repo changes. So:

* client-plane change -> effective after a **page reload**;
* host-plane change (routes, whitelists, content types, services, host state) -> effective only after a **host restart**.

Practical consequence, and the release-checklist item this adds: **any release that touches `lib/index.js` must be paired with a host restart, must say so in the release notes, and must be followed by a post-release probe** (one known-good PNG *and* one known-good SVG on the asset route). Skipping the probe is what let a deployment-ordering problem masquerade as a code bug for a whole session - and because the client half *had* refreshed, the release looked successful in the browser.

---

## 4. Finding 3 - broken-image attribution

### 4.1 The three facts

From `fixture/session-log-excerpt.txt`:

1. **the source file on disk is well-formed** - "System.Xml XmlDocument load: no error";
2. **the stored session payload is not well-formed** - "error on line 233 at column 54: Specification mandates value for attribute stro0";
3. **a re-read comes back clean** - "The read tool’s TYPE result delivered to the caller was clean; the corrupted text is the model-visible result block persisted into the session log ... A re-read of the same region afterwards came back clean (non-deterministic)."

### 4.2 The splice, proven byte-for-byte

Comparing the stored payload line 232 with the source file’s own lines shows it is not a mangled copy of line 232 but a **composite of two different source lines**:

```
payload line 232 = source[232][0:52]  +  source[247][35:131]

  source[232][0:52] = '    <circle r="98" fill="none" stroke="#dde6ea" stro'   (52 chars)
  source[247][35:]  = '0,1 821,730" fill="none" stroke="#ffffff" stroke-width="3"',
                     ' opacity=".7" stroke-linecap="round"/>'                      (96 chars)

  payload line 232 (148 chars) === source[232][0:52] + source[247][35:131]   ->  TRUE (byte-exact)
```

Both cut points are **mid-token**:

* in line 232 the cut lands inside `stroke-width` (after `stro`), so the tail `ke-width="6.5"/>` is gone;
* in line 247 the cut lands inside the arc flags `A 122,122 0 0,1 821,730` (between the `0 ` and the `0,1`), so the head `    <path d="M 587,730 A 122,122 0 ` (35 chars) is gone and only the last 96 characters of that line survive.

Consequences that are directly visible in the payload:

* **source lines 233-246 are absent entirely** (14 lines), and line 247 survives only as its tail;
* the payload’s line 233 is already a *later* `<path ...>` line (`<path d="M 587,730 L 615,742 L 607,752 L 581,740 Z" fill="#e8d9bd"/>`), i.e. the payload jumped past the end of the region instead of walking through it - so this is a dropped range plus a mis-splice, not a single bad character;
* the malformed attribute token is `stro0,1` - literally line 232’s `stro` followed by line 247’s `0,1` - which is why the parser reports a valueless attribute named `stro0`. **The attribute name in the validator’s error message is itself the splice fingerprint.**

Independent confirmation of the position: rebuilding the payload into a document (strip the read prefixes, wrap in one root element, so the corrupted line is document line 233) and loading it with .NET `System.Xml` reproduces the evidence’s quoted position exactly -

```
System.Xml.XmlException: ',' is an unexpected token. The expected token is '='. Line 233, position 54.
```

- while the clean source file and a clean re-read of the same region both load without error. (expat reports the same line one column earlier, pointing at the offending `,` itself; .NET points just past the token. Both identify the identical splice point.)

### 4.3 Which layer produced the text

Elimination chain:

| Candidate layer | Evidence | Verdict |
|---|---|---|
| The file on disk | well-formed under `System.Xml`; a re-read of the same region is clean | not corrupted |
| The read tool’s file I/O | "The read tool’s TYPE result delivered to the caller was clean" | not corrupted |
| A deterministic transform in the plugin / renderer | a re-read comes back clean (non-deterministic) | not corrupted |
| HTTP / storage transfer of the asset | the PNG probe works, the SVG *file* is fine; only the *stored payload text* is bad | not corrupted |
| **The session result-text assembly** (the model-visible result block that gets persisted into the session log) | the corrupted text exists *only* in the persisted payload; the same read, repeated, is clean | **the corrupting layer** |

So the corruption happened in the assembly/serialization of the tool result into the session record - upstream of the plugin. The plugin never saw a good copy: by the time the traced text reached it, the damage was already in the payload.

### 4.4 Why the plugin must treat the session payload as untrusted rendering input

* The payload is produced by a layer the plugin does not own and cannot fix;
* the corruption is **silent** - nothing in the payload announces it, and it only surfaces as a broken image;
* it is **non-deterministic** - "it parsed fine last time" is not a safety argument, and neither is "the same file rendered correctly a minute ago";
* the damage is **structural**, not cosmetic: it drops 14 lines and splices a foreign tail, so a renderer either fails or silently renders a *different* picture than the file on disk.

Rendering is a trust boundary. Anything that arrives through the session payload is untrusted *input* and must be validated before it reaches a renderer - exactly like user-supplied markup. The plugin’s job is to render the file, not to trust the transcript.

### 4.5 Why editing or "repairing" the traced file would have been the wrong move

* **There is nothing to repair.** The file on disk is well-formed XML. The corruption is in the payload, so "fixing" the file would mean overwriting correct data with a corrupted copy - destructive, lossy, and it would make the artifact diverge from reality.
* **The traced file is evidence.** Modifying it destroys the forensic value (the byte-exact splice proof, the missing-line range) and makes the upstream bug unreproducible. The whole point of decoding the session log frame-by-frame (section 6) is to be able to show the defect; a repaired file removes the exhibit.
* **Writing the payload back would create a real corruption.** If the plugin "repaired" the file from the payload, the next read would return genuinely broken XML - converting an upstream, non-deterministic bug into a self-inflicted, permanent data-corruption bug, and hiding the real defect behind a plausible-looking file.
* **It would paper over the defect instead of reporting it.** The correct response to an upstream corruption is a bug report upstream (with the decoded frames as evidence) plus defensive handling in the plugin - never a local mutation of the user’s data.

---

