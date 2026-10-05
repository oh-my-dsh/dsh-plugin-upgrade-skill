# S11 — Mermaid lazy-load rollout: root causes, fixes, and pre-release regression coverage

Evidence pack (read-only): `fixture/` — `chunk-route.ts`, `console-split-chunks.txt`, `console-403-windows.txt`, `ci-note.md`, `README.md`.
Platforms: Node APIs verified locally on Node v24.14.1 / win32; fixture line references are `file:line`.

---

## 1. Incident 1 — split chunks: the lazy entry loaded, its sibling chunks 404'd

**Symptom.** `mermaid-chunk.js` fetched 200 (8.1 kB), then `src-BfvxrPJe.js` and `pie-WAS4IAKB-CQHCQWWM.js` fetched 404, and the top-level `import()` rejected with `TypeError: Failed to fetch dynamically imported module: .../mermaid-chunk.js` (`console-split-chunks.txt:4-8`). The shipped `lib/` contained the entry but none of the siblings (`console-split-chunks.txt:11-12`).

**Why it breaks.** `import()` is not a one-file fetch; it instantiates a whole ES-module graph. The browser fetches the dynamic entry, then every statically imported module it declares (Rollup/Vite emits top-level `import "./pie-…js"` / `import "./src-…js"` plus `__vitePreload` dependency maps), then evaluates. Sibling specifiers resolve **relative to the fetched entry's URL** (`import.meta.url` → `/dsh-attach-input/resources/`), which is why the correct sibling URLs were requested. A 404 on any graph node rejects the awaited top-level `import()` promise, and the failure is reported against the entry URL — so it looks like the entry failed when the entry actually arrived fine.

The 8.1 kB entry was the tell: it was a thin facade re-exporting from shared chunks. With default code splitting, all of mermaid's dependencies were factored into ~97 sibling chunks that the build emitted (and/or npm packaged) outside the shipped/served `lib/` directory. Entry shipped, graph did not.

**Build-side fix.** Give the lazy entry no siblings — produce exactly one self-contained file:

- Dedicated build for the mermaid entry (isolated Rollup/Vite config or entry) with `output.format: 'es'`, `output.inlineDynamicImports: true`, and a fixed `output.entryFileNames: 'mermaid-chunk.js'`. `inlineDynamicImports` is only legal for a single-entry build, which an isolated lazy-entry build is; it inlines all reachable dependencies into the one chunk. This is the shape attempt 2 used (one 7.2 MB chunk) and it is correct — attempt 2's remaining failure was the host route, not the bundling.
- If splitting is intentionally kept: emit every chunk into the served directory under deterministic names, preserve the lib-relative directory layout so sibling URLs resolve under the route, and include the **entire** emitted output tree in the package manifest (`files`/`exports`), verified with `npm pack --dry-run`.
- On the client side, keep the dynamic import specifier pointing at the route URL so the browser fetches through the host route (and, for split output, so relative sibling URLs stay under the route prefix).

---

## 2. Incident 2 — 403 on the Windows production host: the exact flaw

```ts
const abs = normalize(join(LIB_DIR, rel))                    // chunk-route.ts:15
if (!abs.startsWith(LIB_DIR + sep)) → 403                    // chunk-route.ts:16
file = normalize(realpathSync(abs))                          // chunk-route.ts:19
if (!file.startsWith(LIB_DIR + sep)) → 403                   // chunk-route.ts:20
```

With the values captured on the production host (`ci-note.md:11-12`):

- `LIB_DIR = "E:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib"`
- `realpathSync(abs) = "e:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\mermaid-chunk.js"`

The first (lexical) check passes; the second (post-`realpathSync`) check fails, because `String.prototype.startsWith` is a **case-sensitive code-unit comparison** and `"e:\…"` does not start with `"E:\…" + "\"`. The route then logs `path escapes the plugin lib` for a file that is inside the lib (`console-403-windows.txt:10-12`).

**Mechanism, API by API:**

| Value | Produced by | Linux (case-sensitive FS) | Windows production (NTFS) |
|---|---|---|---|
| `LIB_DIR` | `fileURLToPath(new URL('.', import.meta.url))` | `/…/lib/` — the one legal spelling | `E:\…\lib` — drive letter/case come from the **module URL as loaded** (`E:` uppercase), not from the filesystem |
| `abs` | `normalize(join(LIB_DIR, rel))` | textual join; case unchanged | textual join; case unchanged (`E:` preserved) |
| `file` | `normalize(realpathSync(abs))` | resolves symlinks; for an existing file with identical case it is byte-identical to the input | resolves junctions/symlinks and returns the OS's filesystem spelling; the evidence shows the volume canonicalized to lowercase `e:` and per-component case folded to on-disk case |
| containment | `file.startsWith(LIB_DIR + sep)` | `true` (bytes equal) | **`false`** (case differs) although both strings name the same file |

Why the platforms differ *at all*: POSIX filesystems are case-sensitive, so there is exactly one legal spelling of a path and `realpath` cannot legally disagree with `LIB_DIR` except through symlink targets (none case-changing on CI). NTFS is case-insensitive but case-preserving: `E:` and `e:`, `lib` and `Lib` are the same directory, the OS returns its stored/canonical spelling from link/handle resolution, and `import.meta.url` preserves whatever casing the module was loaded with. Nothing canonicalizes the two APIs against each other, and `startsWith` layers strict case sensitivity on top. The laptop on `C:\` happened to have matching spellings; production on `E:\` did not. This is not "Windows paths are unreliable" — it is a deterministic, reproducible mismatch between two APIs whose casing parity is not guaranteed on a case-insensitive filesystem.

Secondary robustness note: `fileURLToPath(new URL('.', …))` and `normalize` both **preserve trailing separators** (verified: `win32.normalize('E:\\a\\lib\\') === 'E:\\a\\lib\\'`, `fileURLToPath` of a directory URL ends in a separator), so `LIB_DIR + sep` can also double the separator (`…\lib\\`) depending on how `LIB_DIR` is obtained; a candidate ending in `…\lib\x.js` then fails the compare. The production debug output shows `LIB_DIR` without a trailing separator, so the observed 403 is the casing mismatch; the fix below removes both classes of fragility.

---

## 3. Fix direction for the guard, plus the other serving requirement

**Recommended guard** — canonicalize both sides with `realpathSync`, then compare with `path.relative`, which applies each platform's own comparison rules:

```ts
const root = normalize(realpathSync(LIB_DIR))       // canonical root, computed once
...
let file: string
try { file = normalize(realpathSync(abs)) }
catch { res.writeHead(404).end('not found'); return }

const within = relative(root, file)
if (within === '' || within === '..' || within.startsWith('..' + sep) || isAbsolute(within)) {
  res.writeHead(403).end('path escapes the plugin lib'); return
}
```

Why it is robust on both platforms:

- `realpathSync` on **both** the root and the candidate means both strings come from the same OS facility — symlinks, junctions, 8.3 short names, and filesystem casing are resolved consistently (so a junctioned/pnpm lib dir cannot create a false "escape" either).
- `path.relative` encodes the platform's own path rules. On `win32`, Node compares the resolved paths **case-insensitively** (verified: `win32.relative('E:\\a\\lib', 'e:\\a\\lib\\x.js') === 'x.js'`, and the same for component-case variants), so `E:`/`e:` and `lib`/`Lib` no longer matter. On POSIX it stays case-sensitive (verified: `posix.relative('/a/lib', '/A/lib/x.js') === '../../A/lib/x.js'`), which is correct because Linux paths really are case-sensitive. A blanket `toLowerCase()` would be wrong on Linux; `startsWith` after realpathing both sides would mostly work but again silently depends on casing parity.
- It keeps the old check's security property. Verified rejections/labels: `…\libx\evil.js` → `..\libx\evil.js` (rejected), `…\other\y.js` → `..\other\y.js` (rejected), `..` traversal and percent-encoded traversal after `decodeURIComponent` (rejected), different drive → `relative` returns an absolute `C:\…` caught by `isAbsolute` (rejected), and the lib dir itself → `''` (rejected). Segment-wise comparison also avoids false accepts like `lib-evil`.

**The other serving requirement: a JavaScript MIME type.** The HTML Standard fails a module-fetch response whose `Content-Type` is not a JavaScript MIME type, and `X-Content-Type-Options: nosniff` makes that fatal — a 200 with the right bytes is still rejected as a module. The fixture already sets `application/javascript; charset=utf-8` (`chunk-route.ts:23`); the fix must preserve that (or serve `text/javascript`), and a regression test should assert it. (If the host UI could ever be served from a different origin than the web server, module fetches are CORS-mode and the route would additionally need `Access-Control-Allow-Origin`; for the same-origin evidence case this is not required.)

---

## 4. Incident 3 — Ctrl+scroll resizes both the modal diagram and the pane font

`wheel` is a bubbling event. One physical gesture dispatches a single `WheelEvent` from the deepest target (inside the zoom modal) up through its ancestors — modal root, pane container, `document`, `window` — and **every** listener registered anywhere on that propagation path runs, in per-node registration order and phase order. The modal's diagram-zoom handler and the pane's font-size handler are two independent listeners for the same event, so both fire.

`preventDefault()` cancels only the browser's default action (e.g., native page zoom); it does **not** stop event dispatch, so it cannot stop the pane handler. And `stopPropagation()` only helps if the pane listener is on an ancestor reached *after* the modal's listener and in the same or a later phase — it is ineffective if both listen on `window`, if the pane handler runs in the capture phase, or if a listener is passive. Ordering tricks are therefore not a real fix.

**Ownership rule:** a gesture has exactly one owner — the topmost active interactive layer. While the zoom modal is open, it exclusively owns Ctrl+wheel; every background handler must treat events originating inside the modal as not theirs. Concretely:

1. In the background/pane Ctrl+wheel handler, bail out when the overlay owns the input: `if (zoomModalOpen || (event.target instanceof Node && zoomRoot.contains(event.target))) return` (a `closest('[data-zoom-modal]')` containment check is equivalent).
2. The modal handler actively claims the gesture: `event.preventDefault(); event.stopPropagation();` — preventDefault for the browser default, stopPropagation so ancestors lacking the ownership guard still do not process it.
3. Register the modal listener with `{ passive: false }` whenever it calls `preventDefault`, and avoid duplicate global `window` listeners for the same gesture — one owner, or the explicit ownership guard.

---

## 5. Regression tests that would have caught incidents 1–3 before release

**Incident 1 — build/package contract plus lazy-import e2e:**
- CI test on build output: parse the emitted `mermaid-chunk.js` (`es-module-lexer` or equivalent) and assert the lazy entry has no import specifiers / modulepreload URLs referencing any file other than itself (self-contained). If splitting is allowed, assert every referenced URL maps to an existing emitted file.
- Packaging test: run `npm pack`, inspect the tarball, assert every chunk URL the runtime can request is present at its served path — this catches "entry shipped, siblings not".
- Headless-browser e2e: serve the packed `lib/` through the route, `await import('/dsh-attach-input/resources/mermaid-chunk.js')` and render a diagram in Playwright; fail on any 404 or "Failed to fetch dynamically imported module" console error.

**Incident 2 — route guard tests must exercise Windows semantics:**
- Extract the containment predicate into a pure helper and unit-test it with `path.win32` (and `path.posix`) from the Linux runner so Windows semantics are covered without a Windows runner: allow exact case, drive-letter case mismatch (root `E:`, child `e:`), and per-component case mismatch; reject `..`, percent-encoded traversal, `libx`/`lib-evil` prefix siblings, absolute paths, different drive/root, symlinks pointing outside the root, and the lib directory itself.
- Mock/inject realpath to return lowercased output (simulating the production host) and assert 200 rather than 403.
- HTTP-level route tests via the real server surface (supertest/undici): 200 + JS `content-type` for a real `.js`, 404 for missing or non-JS extensions, 405 for non-GET. Run the route e2e on a Windows CI job too — a Linux-only matrix cannot catch case-folding bugs, which is the entire point of this incident.
- Real-filesystem test on a case-insensitive volume: create `lib/Mermaid-Chunk.js` and request `/mermaid-chunk.js`, and vice versa.

**Incident 3 — gesture ownership tests:**
- jsdom/Vitest: spy on both handlers; with the modal open dispatch one `new WheelEvent('wheel', { ctrlKey: true, bubbles: true, cancelable: true })` on modal content; assert the modal zoom changed exactly once, the pane font-size is unchanged, and `event.defaultPrevented === true`.
- Same event on the pane with the modal closed: only the pane changes. Wheel without Ctrl: neither app handler claims it.
- Playwright variant to cover real capture/bubble/passive and listener-registration ordering across the two layers.

**Cross-cutting:** add Windows to the CI matrix for packaging/route tests, and test through the real HTTP surface rather than calling the handler with already-canonical paths.

---

**Limitations.** Analysis is based solely on the static evidence pack; no external documentation was consulted, per the brief. Where the abbreviated route excerpt and the captured debug output disagree about a trailing separator, the debug output was treated as the operative runtime state and the discrepancy is noted in §2.
