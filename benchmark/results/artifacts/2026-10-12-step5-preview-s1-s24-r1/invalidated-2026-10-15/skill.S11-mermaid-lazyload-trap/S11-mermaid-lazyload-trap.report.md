# S11 · Mermaid lazy-load trap — root-cause report (read-only analysis)

Plugin: `@org/dsh-attach-input` (community Web plugin, lib-only bundle), v0.4.0.
Scope: evidence-derived diagnosis + fixes + regression coverage only. No fixture, skill, evaluator
or host file was modified; the only writes are this report and a throwaway temp probe script.
Node used for measurements: **v24.14.1 on win32** (see §2.4 — the numbers are measured, not folklore).

Evidence used (all under `…/S11-mermaid-lazyload-trap/fixture/`):

| file | what it pins down |
|---|---|
| `console-split-chunks.txt` | attempt 1: entry 200, two sibling imports 404, dynamic import rejects against the entry |
| `chunk-route.ts` | attempt 2: the guard source (`startsWith`, `normalize`, `realpathSync`) |
| `console-403-windows.txt` | attempt 2: 403 on the Windows production host, guard branch fired for an inside-lib path |
| `ci-note.md` | the matrix: uppercase `E:\` broken, lowercase `c:\` green, Linux green; plus the `LIB_DIR`/`realpath` printout |

---

## 1 · Incident 1 — the split-chunk attempt

### 1.1 What the evidence shows

`console-split-chunks.txt:4-9`:

```
GET …/resources/mermaid-chunk.js        200  (8.1 kB)
GET …/resources/src-BfvxrPJe.js         404
GET …/resources/pie-WAS4IAKB-CQHCQWWM.js 404
TypeError: Failed to fetch dynamically imported module: …/resources/mermaid-chunk.js
```

and the maintainer's own inventory (`console-split-chunks.txt:11-12`): *"ls of the shipped lib/ at the
time: mermaid-chunk.js WAS present; the sibling files listed in its import statements were NOT
shipped with the package."*

So the entry was fetched successfully and the failure is one level deeper: the 8.1 kB `mermaid-chunk.js`
is **not** self-contained — it *statically imports* the shared slices the bundler split out of
mermaid's dependency graph (`src-BfvxrPJe.js`, `pie-WAS4IAKB-*.js`, … 97 of them).

### 1.2 What breaks, in bundler/browser semantics

A dynamic `import()` produces a **module graph**, not a file:

1. `import('./mermaid-chunk.js')` fetches and parses the entry.
2. The browser then resolves the entry's *static* import specifiers (`import … from './src-BfvxrPJe.js'`)
   **relative to the entry's own URL** — here `…/dsh-attach-input/resources/src-BfvxrPJe.js`, which is
   exactly the 404 URL in the capture.
3. Any member of that graph failing to fetch/parse means the whole graph fails to **instantiate**, so the
   *root* dynamic import rejects. That is why the `TypeError` is reported against
   `mermaid-chunk.js` even though that URL returned 200. The 200 is not evidence the entry is
   self-contained; the graph's reachable closure is.

The failure is therefore a **packaging/completeness gap**, not a route bug: the route works fine (it
serves any `*.js` under the prefix), the artifact set is incomplete. Code splitting is legal for a
lazily-imported entry *only if* every sibling it references is shipped **and** resolvable at runtime.

Two aggravating details visible in the evidence:

- **Content-hash names** (`src-BfvxrPJe.js`, `pie-WAS4IAKB-CQHCQWWM.js`): the child names are derived
  from content, so they cannot be enumerated or hardcoded by the plugin or the route — the only
  correct sources of truth are "the emitted output directory" and "whatever the entry imports".
- **The route maps a directory prefix**, so it would have served the siblings had they existed. The
  route is not the layer to fix here.

### 1.3 Fix (build side) — pick one, and make it enforced

Preferred for a lib-only plugin bundle: **make the lazy entry a single self-contained chunk** so the
graph closure is 1 file.

- esbuild: `--bundle --format=esm --splitting=false --outfile=lib/mermaid-chunk.js` (single entry +
  no splitting → everything inlined).
- Rollup / tsdown / rolldown (and Vite's lib mode): `output: { inlineDynamicImports: true }`
  (legal only with a single entry input — build this chunk in its own build step, not alongside
  `lib/index.js` / `lib/client.js`, or Rollup refuses with *"multiple inputs are not supported when
  inlineDynamicImports is true"*) and `preserveModules: false`.
- webpack: `optimization: { splitChunks: { chunks: () => false }, runtimeChunk: false }` with a fixed
  `output.filename`, or again ship the whole output dir.

Alternative, if you keep code splitting (lazy diagram rendering over a normal markdown pane is a
reasonable reason to keep it): **ship the entire emitted directory** — the packaging allowlist must
glob the output (`files: ["lib"]`, or `lib/*.js` — never an enumerated list of chunk names), because
hashing makes names unstable by design. The prefix route already serves that directory, so no route
change is needed for this path.

In both directions, the guarantee that must be tested is the same and is stated in §5 / T1:
*for every entry shipped, every relative import specifier reachable from it must resolve inside the
packed artifact.*

Minor follow-on: with a 7.2 MB single chunk you are paying the whole cost on first diagram; that is a
performance trade-off, not a correctness problem, and it is the price of "one file, no runtime
resolution".

---

## 2 · Incident 2 — the 403 on Windows

### 2.1 The guard

`chunk-route.ts:5` and `chunk-route.ts:16,19-20`:

```ts
const LIB_DIR = normalize(fileURLToPath(new URL('.', import.meta.url)))  // lexical, no fs access
…
const abs = normalize(join(LIB_DIR, rel))
if (!abs.startsWith(LIB_DIR + sep)) { 403 }
file = normalize(realpathSync(abs))
if (!file.startsWith(LIB_DIR + sep)) { 403 }   // ← this is the one that fired
```

The guard answers the question *"is the requested file inside my lib dir?"* with **`String.prototype.startsWith(LIB_DIR + sep)`**, an ordinal UTF-16 / byte-sequence comparison. That is not the
same question, and on Windows it is routinely false for a path that is plainly inside.

### 2.2 The mechanism, precisely

Two different Node APIs produced the two strings being compared, and they do **not agree on the
drive-letter case** (see `ci-note.md:11-12`, printed on the production host):

```
LIB_DIR  = "E:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib"     ← fileURLToPath(new URL('.', import.meta.url))
realpath = "e:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\mermaid-chunk.js"  ← realpathSync(abs)
```

- **`fileURLToPath(new URL('.', import.meta.url))`** is a pure **string** transformation. It takes the
  drive letter exactly as it appears in the module URL and performs **no case canonicalization, no
  filesystem access, no normalization** beyond the percent-decoding and slash→backslash mapping. On
  the production host the URL carried `E:` → `LIB_DIR` keeps `E:`.
- **`fs.realpathSync(abs)`** on Windows goes through libuv's `uv_fs_realpath`
  (`GetFinalPathNameByHandleW` with `VOLUME_NAME_DOS`): it opens the file and asks the OS for the
  canonical DOS path, so what comes back is the path **as that volume reports it** — drive prefix in
  the volume's own letter case (`e:` on that `E:` volume), any junction/symlink/metadata case
  resolved, and the `\\?\` extended-length prefix stripped. On the production host that yields `e:`.

Then `"e:\…\mermaid-chunk.js".startsWith("E:\…\lib\")` is **`false`**, an ordinal comparison of two
strings that differ in one code unit. The request is rejected with 403 *"path escapes the plugin lib"*
for a file that is inside the lib dir — exactly the symptom in `console-403-windows.txt:10-11`.

Measured on this box (win32, Node 24.14.1), the same two strings:

```
upper.startsWith(LIB + sep) = true
lower.startsWith(LIB + sep) = false
```

### 2.3 Why Linux passes, why the *laptop* passes, and why "Windows is unreliable" is the wrong lesson

`ci-note.md:4-6` gives the discriminating evidence:

| Environment | Drive letter case in the URL vs. in `realpathSync` | Result |
|---|---|---|
| Linux CI (bookworm) | no drive letters; both strings byte-identical | 200 |
| Win11 laptop, `C:\` (**lowercase** "in some tooling") | agree | 200 |
| Windows Server 2022, `E:\` (**uppercase**) | disagree → 403 |

Linux has no drive letters and `realpathSync` returns the same bytes it was handed, so an ordinal
prefix test happens to be right. The **Windows laptop with the lowercase `c:\` is also Windows and it
passes** — which falsifies "Windows is different". The variable is not the OS; it is whether the
**lexical** string derived from `import.meta.url` and the **canonical** string derived from
`realpathSync` agree in case. On a case-insensitive, case-*preserving* NTFS volume they can disagree
for a legitimate request, and `startsWith` notices. (Corollary: even a char-for-char-identical
prefix guard is checking the wrong property — containment is a *filesystem* question.)

Two further defects of the same guard, worth fixing in the same patch because they are the same
category error:

- **The parent side is never canonicalized.** Candidate is canonicalized (`realpathSync`) but the root
  is still lexical. A legitimate install reached through a junction or npm/pnpm symlink makes the
  canonicalized child leave the lexical root entirely. Measured on this box through a junction:
  `startsWith(lexical lib) = false`, `relative(libDir, realpath(child)) = "..\real\linked.js"`.
  That 403s **on Linux too** — a link-installed plugin loses its chunk route on every platform.
- The form is fragile for two more reasons, both measured: `'E:\a\b'.startsWith('E:\a\b' + sep) ===
  false` (a root with a trailing separator, easy to introduce by refactoring), and
  `'\\?\E:\a\b'.startsWith('E:\a\\') === false` (any future extended-length return value).

### 2.4 The fix direction

Answer the containment question with a **filesystem-aware comparison**, not a string prefix:

```ts
import { normalize, join, sep, relative, isAbsolute } from 'node:path'
import { realpathSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const RESOURCE_PREFIX = '/dsh-attach-input/resources'
// canonicalize the ROOT once, with the same call used on candidates:
const LIB_DIR = realpathSync(normalize(fileURLToPath(new URL('.', import.meta.url))))

// "is candidate inside root?" — not "do the byte sequences share a prefix?"
const inside = (root: string, candidate: string) => {
  const rel = relative(root, candidate)
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel)
}
```

Why this is robust on both platforms:

- `path.relative` is the platform's own relational resolution. Node's `path.win32` variants compare
  **case-insensitively** (they lowercase both operands before comparing), matching NTFS semantics;
  `path.posix` compares case-sensitively, matching POSIX semantics. Measured:
  `path.win32.relative('E:\\a', 'e:\\a\\b') === 'b'` — the exact production vector — and
  `path.posix.relative('/a', '/A/b') === '../A/b'`, i.e. it refuses to fold case where the filesystem
  is case-sensitive.
- It also normalizes separators (`/` vs `\`) and returns an **absolute path** when the two operands
  are on different roots, which `isAbsolute` then catches. Measured:
  `path.win32.relative('E:\\a', 'D:\\a\\b') === 'D:\\a\\b'` and `isAbsolute → true`.
- It expresses the actual semantic: escape ⇔ the relative result is `..` or starts with `.. + sep`
  (measured `relative('E:\\a', 'E:\\other') === '..\\other'`), plus the different-root case.
- Canonicalizing **both** sides with `realpathSync` removes the junction/symlink divergence in §2.3,
  so a link-installed plugin serves its chunks everywhere and a genuinely escaping symlink still 403s.

The lexical `abs.startsWith(LIB_DIR + sep)` check becomes redundant once both sides are canonical
(`join` + `normalize` already resolves `..` / `%2e%2e%2f` lexically) — replace it, don't keep it
beside the new one. Keep the `realpathSync` half: it is the only thing that defeats a symlink planted
inside `lib/`. Full patched shape:

```ts
const abs = normalize(join(LIB_DIR, rel))
let file: string
try { file = realpathSync(abs) } catch { res.writeHead(404).end('not found'); return }
if (!inside(LIB_DIR, file)) { res.writeHead(403).end('path escapes the plugin lib'); return }
```

### 2.5 The other serving requirement a dynamic import needs regardless of the guard

**The response must carry a JavaScript MIME type.** Module scripts are fetched with CORS mode and are
only executed if the response's MIME type is a JavaScript MIME type (`text/javascript`,
`application/javascript`, …). Anything else — including the default `application/octet-stream` or a
`text/plain` fallback from a static handler — makes the browser refuse to run it and reject the
dynamic import with the *same* `TypeError: Failed to fetch dynamically imported module`, with a
distinctive ("…the server responded with a MIME type of…") message and **no HTTP error status at
all**. That is the only failure mode in this family that produces zero telemetry, which is why it is
the classic second trap after the path bug.

`chunk-route.ts:23` already sets `content-type: application/javascript; charset=utf-8`, so attempt 2
satisfies it — it must be preserved (and the extension filter on line 14 is part of how it is known to
be JS). Related serving conditions worth pinning in the same place:

- same-origin (a dynamic `import()` is `mode: 'cors'`; a cross-origin prefix additionally needs
  `Access-Control-Allow-Origin`);
- a real **200 with the full body** — not a 302 to an HTML entry, not an SPA-fallback 200, and not a
  truncated 7.2 MB body (a body-size cap in the web server's raw handler would surface as the same
  `TypeError`);
- `Cache-Control` long-lived + immutable over content-hashed URLs, otherwise every host restart
  re-downloads 7.2 MB.

---

## 3 · Incident 3 — Ctrl+scroll zooms both the diagram and the pane font

### 3.1 Why both handlers fire on one wheel event

The gesture collides because two independent zoom surfaces see the same event, and `wheel` (unlike
`focus`/`blur`) **bubbles**:

- The pane's font-size handler for Ctrl+wheel was added earlier and is attached to an **ancestor**
  of the new overlay — the pane container, the app root, or `window` — because that is what the pane
  used to own exclusively.
- The modal's zoom handler is attached to the modal (or also to `window`) and runs, but it does not
  `stopPropagation()`, so the event continues up the ancestor chain and the pane handler runs too.
- Registration order is irrelevant here: across *different* elements a bubble-phase listener on an
  ancestor always runs after the target's own listeners. No amount of "register the modal first/last"
  changes it — only propagation control or a target-scoped check does. (Likewise, if both handlers sit
  on `window`, both run on the same dispatch and order is an accident of registration.)
- Independently, `ctrlKey` + wheel is also the browser's page-zoom gesture, so unless the modal calls
  `preventDefault()` from a **non-passive** listener, the page zooms as well — a third consumer of the
  same gesture that no `stopPropagation` can silence.

### 3.2 The ownership rule

**Exactly one surface owns a gesture; the owner is the innermost surface that claims it, and everyone
else must decline rather than never-receive.** Concretely:

1. The modal registers its wheel listener **on the modal root**, non-passive: `{ passive: false }` so
   `preventDefault()` is legal.
2. The modal's handler calls `event.preventDefault()` (kills browser page zoom) **and**
   `event.stopImmediatePropagation()` (use the "Immediate" form so a *second* handler on the same
   element cannot double-apply the zoom).
3. The pane's handler stops being a global/ancestor claim: either move it onto the pane element and
   gate it with `paneEl.contains(event.target)` (and/or an `activeOverlay`/zoom-owner token), so it
   **declines** events originating from a surface that claims ownership. This is the half that makes
   the rule hold for handlers you do not control, and it is required because a capture-phase listener
   on `window` runs *before* the modal's handler and therefore cannot be suppressed by a bubble-phase
   `stopPropagation`.
4. One modifier namespace for zoom per app: Ctrl+wheel inside a modal that claims zoom scroll-zooms
   the diagram; everywhere else it still resizes the pane font. Do not let the pane's handler and the
   modal's handler both treat Ctrl+wheel as "my zoom" — the second one to be added must be scoped
   when it is added.

---

## 4 · Regression tests that would have caught all three before release

The pattern for each: take the *observed* failure vector, assert the fixed property at the layer where
the root cause lives (build artifact, route containment, DOM gesture), and run the whole matrix on
**both** platforms — the whole reason incident 2 shipped is that the check existed only on a Linux-only
runner (`ci-note.md`).

**T1 — packaged chunk-graph closure (catches incident 1).** In the plugin's own test suite, against
the *packed* artifact, not the build dir:
1. `npm pack` (or the repo's pack step) into a temp dir; the test reads the **tarball**, so a
   packaging-allowlist regression is visible.
2. Walk every `*.mjs`/`*.js` file in the packed tree, extract every static
   `import … from './x.js'` and dynamic `import('./x.js')` specifier, and resolve each against the
   importing file's directory.
3. Assert **every** resolved path exists in the packed tree — this is precisely the 404 set from
   `console-split-chunks.txt`, caught pre-release.
4. Assert the lazy entry set is exactly the expected one file for the mermaid entry (a
   config-snapshot test on `inlineDynamicImports: true` / `splitting: false`, so re-enabling code
   splitting fails the build rather than QA).
5. **Route closure over HTTP (the decisive one):** boot the real prefix route against the unpacked
   lib dir and `await import('/dsh-attach-input/resources/mermaid-chunk.js')` from the client-test
   runtime (or a Playwright page). It walks the whole graph over HTTP, so it fails on any missing
   sibling, any wrong MIME type, any 403 from the guard, and any truncated body — i.e. incidents 1
   **and** 2 in one assertion, plus the §2.5 requirement.

**T2 — route containment matrix (catches incident 2).** Two complementary tests:
1. A **platform-independent unit test** of the containment helper via `path.win32` (runnable on the
   Linux runner too): `inside('E:\\a\\lib', 'e:\\a\\lib\\chunk.js') === true` — the exact production
   vector; `inside('E:\\a\\lib', 'e:\\a\\lib\\..\\..\\web-server\\index.js') === false`;
   `inside('E:\\a\\lib', 'D:\\a\\lib\\chunk.js') === false`; `inside('/a/lib', '/a/lib/b.js') ===
   true`; `inside('/a/lib', '/A/b.js') === false`.
2. A **handler test** with a fixture tree: uppercase root + lowercase candidate → **200** (the
   regression that matters); `..%2f..%2f`-encoded traversal → 403; a symlink/junction pointing out of
   `lib/` → 403; a symlink pointing *into* `lib/` → **200** (regression for the un-canonicalized root
   in §2.3); wrong extension → 404; `POST` → 405; non-existent file → 404. The skill's own precedent
   for these vectors is `workspaceFiles`' verification row — symlink, `..`, oversized, binary
   (`references/v0.1.5-alpha.1.md:423`).
3. **Process regression:** add `windows-latest` (and one uppercase non-`C:` volume, or a `subst`
   drive, to reproduce `E:\` casing) to the existing Linux-only CI matrix. Today's matrix can never
   fail on this guard; a guard test that only runs on Linux is what let attempt 2 ship.

**T3 — gesture ownership (catches incident 3).** A DOM-level test on the real surfaces (client test
runtime / jsdom), asserting behavior rather than listener bookkeeping:
1. Mount the markdown pane, open the zoom modal, dispatch
   `new WheelEvent('wheel', { ctrlKey: true, bubbles: true, cancelable: true })` on a node **inside**
   the modal; assert: the diagram zoom applied; the pane's font size is unchanged; the pane handler's
   spy was **not called**; `event.defaultPrevented === true` (no page zoom); the modal's listener is
   registered with `passive: false`.
2. Order-independence: run the same dispatch with the pane handler registered **before** and **after**
   the modal opens — identical results, so nobody "fixes" it later by reordering listeners.
3. Same-element double-claim: register a second handler on the modal root and assert a single zoom
   step (guards `stopImmediatePropagation`).
4. Negative case: dispatch the same event on the pane **outside** the modal and assert the pane zoom
   still applies (guards against over-claiming — the fix must not break the pre-existing gesture).
5. Portal/overlay placement: repeat (1) with the modal portaled to `document.body`, since the
   ancestor chain — and therefore which handlers see the event — differs.

**Cross-cutting:** the skill's layered validation (dependency → enablement → static → runtime →
behavior → wrapper, `SKILL.md:92-99`) plus the hygiene rule `clean → build → typecheck → test`
(`references/migration-hygiene.md:36`) applies here; the host half of this route change requires a
host restart to be exercised (`references/migration-hygiene.md:21`), so the runtime smoke must
restart `dsh web`, not just hard-refresh.

---

## 5 · Not verified in this pass

- No build, install, host boot, or browser run was performed (read-only task, and the fixture must
  stay untouched). Every claim above is either taken from the evidence pack or measured locally with
  `path`/`fs`/`url` on win32 / Node 24.14.1; the bundler-specific knobs in §1.3 are stated per
  ecosystem and were not executed here.
- The exact OS-side reason `GetFinalPathNameByHandleW` reports the production volume's drive letter
  lowercase is volume/mount dependent and was not observable from this container; that does not
  affect the diagnosis, which depends only on the *disagreement* between the two APIs (and the
  maintainer's own printout in `ci-note.md:11-12` shows it).
- Incident 3's handler source was not in the evidence pack; the mechanism in §3.1 is derived from the
  symptom (one Ctrl+scroll drives both surfaces) plus DOM propagation semantics. The report assumes
  the pane handler lives on an ancestor of the overlay or on `window`; if it instead lives on the
  same element as the modal handler, §3.2 items 2 and 3 are the parts that still apply.
