# S11 · Mermaid Lazy-Load Trap — Diagnosis & Fix Report

**Subject:** ` @org/dsh-attach-input ` v0.4.0 — a lazily imported mermaid chunk served by a host prefix route, in a lib-only bundle.
**Evidence:** the read-only fixture pack, referenced below as **[EV-ROUTE]** (`chunk-route.ts`), **[EV-C1]** (`console-split-chunks.txt`), **[EV-C2]** (`console-403-windows.txt`), **[EV-CI]** (`ci-note.md`) and **[EV-README]**.
**Method:** each root cause is derived from bundler/module-graph semantics, Windows path-API semantics, and DOM event propagation — not from "Windows is unstable". Path claims marked *(measured)* were re-measured on this host (Node 24, win32) while writing this report.

---

## 0. Summary

| # | Symptom | Root cause | Fix class |
|---|---|---|---|
| 1 | Entry chunk 200, every sibling 404, `Failed to fetch dynamically imported module` | A dynamically imported chunk is **not self-contained**. Its static `import` specifiers are resolved *at module-graph instantiation* against the chunk's own URL, one HTTP request each. Rollup's default code-splitting emitted hashed sibling chunks that the lib-only publish never shipped. | Build one self-contained chunk with a stable name (`inlineDynamicImports`), or ship **and** serve the entire chunk graph. |
| 2 | `GET .../mermaid-chunk.js 403` on Windows Server 2022 only; the guard log says "path escapes the plugin lib" | The guard compares a **filesystem-resolved** path against a **URL-derived** string with `String.startsWith`, a code-unit comparison. NTFS gives one file identity but many spellings; `realpath` returns the OS-canonical spelling (evidence: `e:` vs `E:`). Code-unit prefix test → false → 403. On POSIX a name has exactly one spelling, so the prefix always matches. | Compare **resolved root** to **resolved target** with `path.relative`; reject `''`, `..`-relative and `isAbsolute()` results. |
| 3 | Ctrl+wheel in the zoom modal resizes both the diagram and the pane font size | One `wheel` event, two independent listeners at different nodes/phases → both run. `preventDefault()` suppresses only the browser's default action; it stops neither propagation nor the other listener. A `window`/`document` **capture** listener has already run before any target-phase handler can call `stopPropagation()`. | Ownership rule: one gesture, one owner. The topmost interaction scope owns wheel input; outer scopes stand down (or are suspended) and never mutate state. |

Incident 2 is a **false-deny**, not a security escape: the guard is over-strict and refuses legitimate files. "Lowercase both strings" and "drop the guard" are both wrong; compare resolved-to-resolved with a platform-aware comparator.

---

## 1. Incident 1 — split chunks: the entry loads, the module graph does not

### 1.1 What the capture shows
[EV-C1] is precise, and the reading decides the diagnosis:

- `mermaid-chunk.js` → **200, 8.1 kB**. The entry is fine.
- `src-BfvxrPJe.js` → 404, `pie-WAS4IAKB-CQHCQWWM.js` → 404. The first is a Rollup shared-chunk name (`src-<hash>`); the second is one of mermaid's **own lazily registered diagram renderers** (`pie`), reached inside mermaid through `import()` (`registerLazyLoadedDiagrams`).
- The listing of the shipped `lib/` at the time: the entry **was** present, the siblings were **not shipped**. So the route never even answered; and the failures are 404, not 403 — they passed the route's `.m?js$` gate and died on disk.
- The `TypeError` names **the entry URL**, which is why the maintainer concluded "the chunk loaded, so the chunk is fine". It is not: the browser reports the *importing* module, not the missing dependency.

### 1.2 Mechanism
A dynamic `import('./mermaid-chunk.js')` runs three steps:

1. **fetch + parse** the entry module record;
2. **instantiate** the graph: for every static `import` / `export ... from` in the entry, resolve the specifier **relative to the entry's own URL** and fetch it. Each sibling is a separate HTTP request issued by the module loader, not by your code;
3. **evaluate**, only after step 2 succeeds.

"Dynamic chunk" means *the entry is fetched on demand*. It does **not** mean *the entry is self-contained*. There is no client-side bundling: if the entry says `import "./src-BfvxrPJe.js"` and that URL 404s, step 2 rejects and the whole `import()` rejects — even though step 1 returned 200. That is exactly the shape of [EV-C1]: one successful entry request followed by a rejection whose message names the entry.

Two build-side problems compound it:

- **Rollup/Vite default code splitting** hoists shared modules out of the lazy entry into extra chunk files named `[name]-[hash].js`. Those names are unpredictable at publish time, so they cannot be curated by hand.
- **The package is a lib-only bundle** with a curated `lib/` file set. Hashed build-generated siblings are not in that set, so the published tarball contains an entry whose dependency closure is broken. Nothing on the host side can repair that: no route can serve a file that was never shipped.

Ordering trap worth naming: mermaid's own `import()` of its renderers becomes a **static** import of a shared chunk in the built output, so mermaid's runtime laziness does not save you — the graph is fetched eagerly at instantiation. And a sibling still reachable only dynamically is requested later, against the same base URL, and fails identically; that is the "97 siblings" cascade.

### 1.3 Build-side fix
Emit the lazy entry as **one self-contained ES module with a stable file name**:

    // dedicated build invocation for the lazy entry only
    build: {
      lib: { entry: 'src/mermaid-entry.ts', formats: ['es'], fileName: () => 'mermaid-chunk.js' },
      rollupOptions: {
        output: {
          inlineDynamicImports: true,   // fold EVERY dynamic import into this single chunk
          manualChunks: undefined,      // no shared-chunk hoisting
          chunkFileNames: '[name].js',  // no [hash]: the host route serves a fixed path
          assetFileNames: 'mermaid-chunk.[ext]',
          preserveModules: false,
        },
      },
      cssCodeSplit: false,              // do not split CSS per module
      assetsInlineLimit: 0,             // or ship the assets (see below)
    }

Why each knob:
- `inlineDynamicImports: true` is the switch that folds the whole reachable graph — including mermaid's per-diagram `import()` calls — into one file. It requires a single input for that build, hence the dedicated invocation: do not apply it to the multi-entry plugin build.
- `manualChunks: undefined` plus `preserveModules: false` remove the other two ways a sibling file can appear.
- `chunkFileNames` without `[hash]` gives the route a stable URL and makes "did it ship?" assertable.
- Anything still emitted separately (CSS, workers, WASM, fonts) must either be inlined (`?worker&inline`, `cssCodeSplit:false`, base64 assets) or shipped **and** served by the same route.

Trade-off, and the alternative route shape:
- Attempt 2's single 7.2 MB file ([EV-C2]) is the **correct shape**; the size is the price of self-containment. Mitigate with transport compression and by keeping the import lazy (fetched on the first mermaid fence).
- If 7.2 MB is unacceptable, the invariant inverts rather than disappears: the publish artifact must contain the **complete** chunk graph and the route must serve it as a **directory tree**, with a manifest mapping entry → hashed siblings, plus the pack-closure test in §5.1. Never ship a hashed graph through a curated file list.

---

## 2. Incident 2 — the 403: a code-unit prefix test against a filesystem-canonical name

### 2.1 Which guard branch fired
[EV-ROUTE] applies containment **twice**: on the joined path (`abs.startsWith(LIB_DIR + sep)`), and again after resolution (`file = realpathSync(abs)`, then the same prefix test). [EV-C2] reports the log line **"path escapes the plugin lib"**, i.e. a guard branch fired for a path that is plainly inside `lib/`. The first check is a pure string prefix of `LIB_DIR`, so it passes by construction; the **post-realpath check** is the one that rejects.

[EV-CI]'s debug print is the smoking gun:

    LIB_DIR  = "E:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib"
    realpath = "e:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\mermaid-chunk.js"

Same file, same components, same order. The only difference is **casing**: `E:` vs `e:`. A `startsWith` prefix test between those two strings is `false`, because `String.prototype.startsWith` compares UTF-16 code units and knows nothing about filesystems.

### 2.2 The precise mechanism — what each API returns on each platform

**`LIB_DIR` is a URL artifact, not a filesystem answer.**
`fileURLToPath(new URL('.', import.meta.url))` is a pure string transform of the module URL. Whatever casing the loader had in that URL is preserved verbatim: `file:///E:/...` when DSH is installed at `E:\dsh`, `file:///e:/...` when the process was started through a path spelled with a lowercase drive. Nothing in that expression asks the filesystem what the volume or the directories are actually called. *(measured: `fileURLToPath('file:///E:/dsh/.../lib/')` → `E:\dsh\...\lib\` — trailing separator included.)*

**`realpathSync` is a filesystem answer, in the filesystem's spelling.**
On Windows it ends in `GetFinalPathNameByHandleW` (via libuv for `realpathSync.native`), which returns the volume's DOS path as the **mount manager** spells it plus each component's **on-disk** name. That spelling is not derived from your input string: NTFS stores *a* casing (chosen when the name was created) and is case-insensitive on lookup, so the canonical spelling is free to differ from the one you typed. *(measured here: `fs.realpathSync.native('e:\DEEPSEEK-HARNESS\dsh-plugin-upgrade-skill')` → `'E:\deepseek-harness\dsh-plugin-upgrade-skill'` — drive letter **and** every component re-cased. Note also that Node's non-native `fs.realpathSync` keeps the caller's spelling for non-link components, so which spelling you get depends on the code path and the mount — which is why the bug looks intermittent.)*

On the production host the two operands are therefore:

- left: a **URL-derived** string ending in `E:` (from the install path / loader URL);
- right: an **OS-canonical** string spelled `e:` (from `GetFinalPathNameByHandleW` through the volume mount point).

Both are correct. Both name the same directory. The string comparison returns `false`. 403.

**Why Linux passes, mechanically.** POSIX pathnames are byte strings with exactly one spelling per directory entry. `realpath(3)` can only *remove* `..` and symlink components; it never changes letter case, and `\/opt/x` and `\/opt/X` are different files (or one does not exist). So the resolved path is always a string extension of the same root and the prefix test is trivially true. The guard is only accidentally correct on Linux: it silently encodes "POSIX canonicalization is case-preserving" as if that were a portable law.

**Why the maintainer's laptop passed.** [EV-CI] places it on `C:\`; loader URL and volume both spelled `C:`, so the two operands coincided. The defect needs a *disagreement*, and Windows Server + `E:\` install manufactured one. The failing input is an environment property, not a code path — which is precisely why "works on my machine" carries no information here.

### 2.3 Two further defects in the same five lines (independent of the 403)
1. **Resolved target vs unresolved root.** `LIB_DIR` is never realpath'd while the target is. Any legitimate layout where `lib/` is reached through a junction/reparse point or symlink (pnpm store, `npm link`, npm workspaces, a profile dir linked into `node_modules`) makes `realpath(abs)` textually leave `LIB_DIR` → same 403, same log line, no case difference involved. This one will bite CI-green Linux installs too.
2. **Text-form dependence of `LIB_DIR + sep`.** `fileURLToPath` of a *directory* URL (`new URL('.', ...)`) keeps the trailing separator, and `normalize` preserves it *(measured: `normalize('E:\a\b\')` → `'E:\a\b\'`; `normalize('/a/b/')` → `'/a/b/'`)*. So `LIB_DIR + sep` can become a **doubled** separator, and the prefix test then fails for every request on **every** platform. The guard's correctness currently depends on the exact textual form of a runtime constant; the root should be normalized once with `resolve()` (which strips the trailing separator) and never concatenated.

Same function, extra hardening: the URL path is decoded once and then joined. On win32 a backslash is a separator, so a percent-encoded backslash traversal decodes into a real traversal *(measured: `win32.join('E:\a\b','..\x.js')` → `E:\a\x.js`)*; and double-encoded dots must not be decoded twice. Containment-after-realpath neutralises traversal anyway, but rejecting backslash, colon and NUL in the decoded relative path is cheap defence in depth.

---

## 3. Fix direction for the guard

### 3.1 The comparison to use
Compare **resolved root** with **resolved target** using `path.relative()`, and accept only a non-empty, non-`..`, non-absolute relative result.

    import { realpathSync } from 'node:fs'
    import { fileURLToPath } from 'node:url'
    import { resolve, relative, isAbsolute, sep } from 'node:path'

    // once, at module load: absolute, no trailing separator, same resolution as the target
    const ROOT = realpathSync(resolve(fileURLToPath(new URL('.', import.meta.url))))

    function isInsideRoot(target: string, root: string = ROOT): boolean {
      const rel = relative(root, target)        // platform-aware comparison
      if (rel === '') return false              // the root itself is not a servable file
      if (isAbsolute(rel)) return false         // win32: other drive/UNC -> absolute result
      return rel !== '..' && !rel.startsWith('..' + sep)
    }

    const route = {
      kind: 'prefix',
      path: RESOURCE_PREFIX,
      handler: async (req, res) => {
        if (req.method !== 'GET') { res.writeHead(405).end(); return }

        const url = new URL(req.url ?? '/', 'http://dsh.internal')
        const decoded = decodeURIComponent(url.pathname.slice(RESOURCE_PREFIX.length)) // exactly once
        if (decoded.includes('\0') || decoded.includes('\\')) { res.writeHead(400).end(); return }

        const rel = decoded.replace(/^\/+/, '')
        if (rel === '' || !/\.m?js$/.test(rel)) { res.writeHead(404).end('not a js resource'); return }

        let file: string
        try {
          file = realpathSync(resolve(ROOT, rel)) // resolve() also defuses '..' and absolute rel
        } catch { res.writeHead(404).end('not found'); return }
        if (!isInsideRoot(file)) { res.writeHead(403).end('path escapes the plugin lib'); return }

        const data = await readFile(file)         // read the path that was validated
        res.writeHead(200, {
          'content-type': 'application/javascript; charset=utf-8',
          'content-length': String(data.byteLength),
          'x-content-type-options': 'nosniff',
          'cache-control': 'no-cache',            // immutable caching only for hashed names
        })
        res.end(data)
      },
    }

### 3.2 Why it is robust on both platforms
- `path.relative` is the **platform's own** comparator. On win32 it folds ASCII case and treats backslash and forward slash interchangeably *(measured: `win32.relative('E:\a\b','e:\A\B\x.js')` → `'x.js'`; `win32.relative('E:\dsh\lib','e:\DSH\LIB\chunk.js')` → `'chunk.js'`)*; on POSIX it stays byte-exact, which is the correct semantics there. It is not a heuristic like "lowercase both strings on Windows": it is the same equivalence relation the filesystem itself uses, so the check can never be *more* permissive than the filesystem.
- It collapses dot segments, doubled separators and (on win32) namespaced `\\?\` prefixes for you, so no textual form of `ROOT` can defeat it.
- `isAbsolute(rel)` closes a Windows-only hole that a naive `!rel.startsWith('..')` leaves wide open: for a target on a **different drive**, win32 `relative` returns the absolute target rather than a dot-dot path *(measured: `win32.relative('C:\a\b','D:\a\b\x.js')` → `'D:\a\b\x.js'`)*.
- `rel === ''` covers target-equals-root, and testing `'..' + sep` (rather than a bare `startsWith('..')`) refuses to misclassify a sibling directory such as `..libx` *(measured: `'E:\dsh\lib'` vs `'E:\dsh\libx\a.js'` → `'..\libx\a.js'`, correctly outside)*.
- Realpathing **both** sides keeps junctions/symlinks working (the root resolves to its target, and every request resolves into that same target), while a link inside `lib/` that points outside still resolves outside and is refused. Reading the resolved path closes the validate-then-read gap.

### 3.3 The other serving requirement a dynamic import needs
Beyond 200 plus the right bytes, a module fetch must be answered **as JavaScript**:

1. **A JavaScript MIME type** — `application/javascript` or `text/javascript`. Module scripts are MIME-strict: a 200 whose body is HTML (the SPA history fallback answering the chunk URL) or `text/plain` fails with *"Expected a JavaScript module script but the server responded with a MIME type of text/html"*, and with `X-Content-Type-Options: nosniff` it is refused outright. Consequence: the prefix route must be matched **before** the SPA/static fallback and must never fall through on a resource-prefix miss. A guard that misroutes is indistinguishable, in the console, from a guard that denies — and the current 403-plus-text/plain body is exactly why [EV-C2] shows a generic `TypeError` and no actionable message. **Log both operands and return a diagnosable error.**
2. **A stable, absolute, same-origin URL** whose path is exactly what the importer resolves against — and which is also the base URL for the chunk's own relative imports (§1). A redirected or rewritten URL silently changes the base for the siblings.
3. **CORS, if and only if the page and the route are on different origins.** Module fetches are always CORS-mode, so cross-origin needs `Access-Control-Allow-Origin` (with correct `Vary: Origin`). The current same-origin `127.0.0.1:3080` setup does not need it — but do not regress it if the GUI is ever served from another port or host.
4. **Serve the whole graph**, not just the entry — the serving-side counterpart of §1.3, and the reason attempt 2 needed `inlineDynamicImports` before its route could ever be sufficient.

---

## 4. Incident 3 — two handlers, one wheel event

### 4.1 Why both fire
A `wheel` event dispatched over the diagram has the diagram element as target and then **traverses the whole ancestor chain**: capture (window → document → … → modal), target phase (modal handlers), bubble (modal → … → document → window). Every listener on that path runs, in that order, for the *same* event object. The pane's Ctrl+wheel font-zoom handler is an app-level input handler (bound on `window` or `document`, typically with `passive: false`, often in the **capture** phase to beat the browser's own zoom); the modal's handler is on the modal (target/bubble). Both are on the path, so both run, and each mutates its own state — diagram transform and pane font-size. One tick, two zooms.

### 4.2 Why the obvious fixes do not work
- `preventDefault()` means "skip the browser's default action". It does **not** stop propagation and does **not** stop other listeners. It only sets `event.defaultPrevented`, which other handlers are free to ignore — and the pane's handler does ignore it.
- `stopPropagation()` stops the event reaching *later nodes*, but a **capture-phase listener on window has already run** before the modal's target-phase handler executes. Ordering is capture-first, always; calling it in the modal is too late for anything upstream.
- `stopImmediatePropagation()` only silences remaining listeners on the *same node in the same phase*. Necessary, not sufficient, when the other listener lives elsewhere.
- Guarding on `event.target` alone is fragile with shadow DOM and composed events; use `event.composedPath()`.

No combination of stop-calls inside the modal can un-run a handler the platform already invoked. The defect is architectural: **two owners for one gesture.**

### 4.3 The ownership rule (fix)
**One gesture, one owner.** Wheel / Ctrl+wheel input belongs to exactly one *interaction scope* at a time: the innermost active scope that contains the event target — here, the open zoom modal. While that scope is open, every outer scope must **stand down before touching state**. Ownership is decided by the scope stack, not by listener registration order and not by winning a propagation race.

Implement it structurally, in decreasing order of preference:

1. **Single router + scope stack (recommended).** One capture-phase `wheel` listener on `window`, registered once with `capture: true, passive: false`. It resolves the owning scope from `event.composedPath()` plus a `data-input-scope` marker, hands the event to **only** the top-most scope, then calls `preventDefault()` and `stopImmediatePropagation()`. Scopes stop registering their own wheel listeners, so the double-owner class of bug cannot recur — and the same router later covers pointer, trackpad and pinch.
2. **Suspend the outer handler while the modal is open.** Register the pane's font-zoom listener with an `AbortController` signal, abort it on modal open and re-register on close. Deterministic, no ordering assumptions.
3. **Minimum viable patch if 1–2 cannot land now.** The modal's handler must be **capture-phase on window** and call `preventDefault()` **and** `stopImmediatePropagation()`; independently, the pane's handler must early-return when `event.defaultPrevented` is true or when `event.composedPath()` contains an element marked `data-zoom-owner`. Both halves are required — either alone is a race.

Two supporting invariants:
- **The modal must not touch pane font-size at all**, and the pane font-zoom must not touch the diagram transform: separate state, separate owners. A "global Ctrl+wheel font zoom" that mutates a shared CSS variable is what lets one gesture reach two states.
- **Do not rely on cancelling the browser's own page zoom.** Chrome may treat Ctrl+wheel as a non-cancellable browser zoom in some configurations; the modal must zoom correctly whether or not `preventDefault` suppresses the page zoom.

---

## 5. Regression tests that would have caught incidents 1–3

All three escaped for the same reason: tests asserted *code ran*, not *the contract held at the boundary* — the published artifact, the OS path API, the event dispatch. Each test below fails on the shipped code.

### 5.1 Build/pack closure — incident 1
Test the **packed tarball**, not the working tree (the working tree has the siblings; the tarball did not).

    // test/pack-closure.test.mjs — after `npm pack` into a dir inside the repo
    test('lazy chunk dependency closure is shipped and single', async () => {
      const libDir = extractTarball('org-dsh-attach-input-0.4.0.tgz').lib
      const entry  = path.join(libDir, 'mermaid-chunk.js')
      const code   = await readFile(entry, 'utf8')

      // every static/dynamic specifier in the emitted chunk must resolve inside the shipped set
      const specs = parseImports(code)     // es-module-lexer, not a regex
      const bad = specs.filter(s => s.startsWith('.') && !existsSync(path.resolve(libDir, s)))
      assert.deepEqual(bad, [], 'chunk imports modules missing from the published file set')

      assert.equal(countChunks(libDir, /^mermaid-chunk/), 1)                       // no hashed siblings
      assert.doesNotMatch(path.basename(entry), /-[A-Za-z0-9_-]{8}\.js$/, 'stable name')
    })

Runtime half of the same test: serve `libDir` through the **real route handler** (not a static server) and actually `await import()` the chunk URL (Node `vm.SourceTextModule` against an http base, or a Playwright page). The assertion is "the import resolves" — precisely what [EV-C1] disproves.

### 5.2 Route containment — incident 2 (and it must run on Windows in CI)
Split the guard into a pure predicate and table-test it, so Linux CI can prove Windows behaviour without a Windows runner, **plus** one real-filesystem test on a Windows runner.

    // test/containment.test.mjs
    const T = [
      [win32, 'E:\dsh\lib',      'e:\dsh\lib\chunk.js',     true ],  // the production 403
      [win32, 'E:\dsh\lib',      'E:\dsh\lib\CHUNK.js',     true ],
      [win32, 'E:\dsh\lib',      'E:\dsh\libx\a.js',        false],  // sibling prefix, outside
      [win32, 'E:\dsh\lib',      'E:\dsh\lib\..\secret.js', false],
      [win32, 'C:\dsh\lib',      'D:\dsh\lib\chunk.js',     false],  // other drive -> absolute
      [win32, '\\srv\share',     '\\SRV\SHARE\lib\x.js',    false],  // sibling dir, outside root
      [posix, '/opt/lib',        '/opt/lib/chunk.js',       true ],
      [posix, '/opt/lib',        '/Opt/lib/chunk.js',       false],  // POSIX case-sensitive: outside
      [posix, '/opt/lib',        '/opt/libx/a.js',          false],
      [posix, '/opt/lib',        '/opt/lib/../secret.js',   false],
    ]

Handler-level tests with real temp dirs: create `lib/`, pass a **case-flipped** root string (the exact production input), a root reached through a **junction/symlink** (Windows: `New-Item -ItemType Junction`; POSIX: `ln -s`), and a link *inside* `lib/` pointing outside (must 403). Request-level table: dot-dot traversal, percent-encoded dots, percent-encoded backslash traversal, double-encoded dots, absolute `C:/x.js`, trailing slash, NUL byte, `POST`, `chunk.js.map`, `chunk.ts`, a percent-encoded Unicode name. Assert 200 for the legitimate pair on both platforms, 4xx for the rest, and never a 200 outside the root.

The one-line test that would have caught the incident: **`isInsideRoot('E:\dsh\lib', 'e:\dsh\lib\chunk.js') === true`, running on Linux.** It fails on the old guard and passes on `path.relative`.

CI requirement: `runs-on: [ubuntu-latest, windows-latest]` for this suite, on node 20/22/24. [EV-CI] is not a mystery — it is a missing test-matrix cell. The only environment that could fail was the one never exercised.

### 5.3 Wheel ownership — incident 3

    test('Ctrl+wheel in the zoom modal has exactly one owner', async () => {
      const font = spy(), diagram = spy()
      // pane font zoom bound exactly as in production: window capture, passive:false
      window.addEventListener('wheel', e => { if (e.ctrlKey) font(e) }, { capture: true, passive: false })
      await openModal()
      const ev = await dispatchWheel(modalCanvas, { ctrlKey: true, deltaY: -100 })

      assert.equal(diagram.calls, 1, 'diagram zoom applies once')
      assert.equal(font.calls, 0,    'pane font zoom must not run while the modal owns the gesture')
      assert.equal(pane.style.fontSize, before)
      assert.equal(ev.defaultPrevented, true)

      await closeModal()
      await dispatchWheel(paneEl, { ctrlKey: true, deltaY: -100 })
      assert.equal(font.calls, 1, 'pane regains ownership after close')
    })

Bind the pane handler in the **capture** phase deliberately: a test that only binds it in bubble phase would pass with `stopPropagation()` alone and let the real bug back in. Encode "one tick = one zoom step" explicitly, since double application is otherwise invisible. Assert ownership is *released* on close so the fix cannot be "disable font zoom forever". Re-run one case through Playwright against the real GUI — jsdom's listener ordering is not Chrome's.

### 5.4 The end-to-end gate
One Playwright test, one mermaid fence, real page: assert the SVG rendered; assert `page.on('response')` saw **zero** 4xx/5xx under the resource prefix; assert `page.on('console')` saw zero errors; assert `page.on('requestfailed')` is empty. [EV-C1] and [EV-C2] are both this test failing. A console-error gate in CI would have caught both incidents with no new test code at all.

---

## 6. Residual notes
- The 7.2 MB self-contained chunk is a deliberate trade: correctness over bytes. If it must shrink, take the "ship the whole graph + manifest" branch in §1.3 — and land §5.1 first, since that test is the invariant in both designs.
- The guard fix is a **containment** fix; it adds no authentication. If plugin resources must be unreadable by other local pages, that is a separate origin / CORS / `Sec-Fetch-Site` decision, out of scope here.
- [EV-ROUTE] is an excerpt; the shipped code may differ in the details flagged in §2.3 (trailing-separator doubling, unresolved root). Both are worth fixing regardless of the 403, because each independently produces the same false-deny signature.
