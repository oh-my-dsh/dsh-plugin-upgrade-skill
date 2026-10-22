# S11 · Mermaid Lazy-Load Trap — Root-Cause Report

> **摘要（中文）**：三起事故均可从证据精确推导，与"平台玄学"无关。(1) 动态 `import()` 只拉取入口 chunk，入口 chunk 内部的兄弟静态 `import` 由浏览器**按该 chunk 自身的 URL** 继续拉取；兄弟文件未随包发布 → 全部 404 → 整张模块图无法实例化，错误挂在最外层 `import()` 上（`Failed to fetch dynamically imported module`）。构建侧修复：把 mermaid 入口打成**自包含单文件 chunk**（关闭 code splitting / `inlineDynamicImports`），或把整个 chunk 闭包随包发布。(2) 守卫用**大小写敏感**的 `String.startsWith` 比较两条来源不同、大小写可能不一致的 Windows 路径字符串：`fileURLToPath(import.meta.url)` 得 `E:\...\lib`，`realpathSync` 得 `e:\...\lib\mermaid-chunk.js`（同一文件）→ 被误判"逃逸"→ 403。Linux 无盘符且两侧逐字节一致故通过；笔记本盘符拼写恰好一致故通过。修复：两侧都过 `realpathSync`，用 `path.relative` 做包含性判断（win32 大小写不敏感、POSIX 精确）。
> (3) Ctrl+wheel 只派发**一个** `wheel` 事件，沿完整捕获→目标→冒泡路径一次性传播；`preventDefault()` 只抑制默认行为、**不阻止其他监听器**；modal 的缩放处理器与面板的字号处理器都在该路径上且 modal 未 `stopPropagation` → 一次手势两个效果。所有权规则：**最上层打开的 modal 独占其内部的 Ctrl+wheel 手势**，全局处理器必须在 `composedPath()` 命中所有权元素时让位。
> 回归覆盖：chunk 闭包断言、真实路由 e2e（网络/控制台断言）、守卫表驱动单测（显式注入大小写错配）、Windows 大小写分歧启动路径 e2e、Ctrl+wheel 单效果测试。

## 0. Evidence inventory (fixture cards, read-only)

- **fixture/chunk-route.ts** — attempt-2 host prefix route. `RESOURCE_PREFIX = '/dsh-attach-input/resources'`; `LIB_DIR = normalize(fileURLToPath(new URL('.', import.meta.url)))`; two containment guards, both of the form `x.startsWith(LIB_DIR + sep)` (pre-realpath lexical on `abs = normalize(join(LIB_DIR, rel))`, post-realpath on `normalize(realpathSync(abs))`); only `*.js|.mjs` served; `content-type: application/javascript; charset=utf-8`; GET only; guard violation → 403 "path escapes the plugin lib".
- **fixture/console-split-chunks.txt** — attempt 1: `mermaid-chunk.js` 200 (8.1 kB) but siblings `src-BfvxrPJe.js`, `pie-WAS4IAKB-CQHCQWWM.js` 404 → `TypeError: Failed to fetch dynamically imported module`; `ls` of shipped lib/ showed only the entry chunk, not the 97 sibling files its imports name.
- **fixture/console-403-windows.txt** — attempt 2 on Windows Server 2022, DSH at `E:\dsh\`: every chunk GET 403; route log shows the guard branch fired ("path escapes the plugin lib") for a file plainly inside lib/; plugin falls back to code block.
- **fixture/ci-note.md** — matrix: Linux CI green · Win11 laptop green (DSH on `c:\`, lowercase in some tooling) · prod Win2022 red (DSH on `E:\`). Debug pair on the prod host: `LIB_DIR = "E:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib"` vs `realpath = "e:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\mermaid-chunk.js"`.

## 1. Incident 1 — why the split-chunk approach failed

### Mechanism: a dynamic import fetches a **chunk graph**, not a file

1. **Bundler semantics.** With default code splitting (Rollup `output.inlineDynamicImports: false`, esbuild `splitting: true`, webpack default), the mermaid entry is emitted as *many* files: `mermaid-chunk.js` (8.1 kB — clearly not all of mermaid) plus 97 siblings. Mermaid's own per-diagram lazy `import()`s (`pie-*`, `src-*`, …) become more chunks. The entry chunk keeps real specifiers such as `import {…} from './pie-WAS4IAKB.js'` (and hashed names like `pie-WAS4IAKB-CQHCQWWM.js`).
2. **Browser module semantics.** `import('./mermaid-chunk.js')` resolves the specifier against the **importer's URL** and fetches **only that URL**. After it arrives, the engine fetches the chunk's static imports **relative to the chunk's own URL** (`./x.js` → `/dsh-attach-input/resources/x.js`), transitively. There is no bundler runtime, manifest, or preload step in the browser to rewrite or substitute them; the hashed filenames are discoverable only by parsing the chunk itself.
3. **Packaging.** Only `mermaid-chunk.js` was shipped; the sibling files its import statements name were not in the package → every sibling GET 404 → the module graph can never be instantiated → the **whole** `import()` promise rejects with `TypeError: Failed to fetch dynamically imported module`. Note the error is reported against the *entry* chunk even though the 404s are the siblings: the graph is fetched as one unit, one failure rejects the same promise. The plugin's `catch` then falls back to a plain code block.
4. **The trap.** "The chunk file loaded fine" (200 on the entry) is not evidence the lazy feature works. The chunk is only the root of a multi-file graph; if *any* transitive file is missing, the lazy feature fails exactly as if the chunk itself had 404'd.

### Build-side fix

Make the lazy boundary produce a **self-contained chunk** — one file with no sibling imports:

- **Rollup**: build the mermaid entry in its **own build step** with `output.inlineDynamicImports: true` (one input → one file; mermaid's nested lazy `import()`s get inlined too). Do not apply this to the main plugin bundle — the `await import(...)` boundary must stay lazy.
- **esbuild**: `bundle: true, splitting: false, outfile: 'lib/mermaid-chunk.js'` for that entry (`splitting: false` inlines nested dynamic imports).
- **webpack**: `optimization.splitChunks: false` / `LimitChunkCountPlugin({ maxChunks: 1 })` scoped to that entry.
- Keep the lazy call in the plugin bundle: `await import(new URL('./mermaid-chunk.js', import.meta.url))` (or the resource URL) so the 7.2 MB mermaid code never enters the main lib bundle.
- **Ship-side verification**: assert the emitted chunk's import closure is empty — parse `mermaid-chunk.js` for static `import`/`export … from`/dynamic `import()` specifiers starting with `./` or `../` and fail the build if any exist (or if any referenced hashed file is absent from the published package file list).

The legitimate alternative: ship the **entire** chunk graph with the exact hashed filenames in one directory and serve that directory — then the guarantee to enforce at build time is "published file set ⊇ chunk import closure". Single-file is preferable here because the rollout surface is exactly one URL.

## 2. Incident 2 — the exact flaw in the containment guard

### The flaw in one line

The guard performs an **ordinal, case-sensitive string-prefix test** — `String.prototype.startsWith(LIB_DIR + sep)` — over two path *strings* produced by **two different pipelines whose case can disagree on Windows**, and on the production host they disagreed: `E:` (from `fileURLToPath(import.meta.url)`) vs `e:` (from `realpathSync`) for the *same* directory.

### What each API returns, per platform

| API in `chunk-route.ts` | Returns (prod Windows host) | Case behavior |
|---|---|---|
| `new URL('.', import.meta.url)` → `fileURLToPath` → `LIB_DIR` | `E:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib` | Round-trip is **case-faithful**: it preserves whatever spelling the process resolved the module path with (launch path, env var, service config). Local probe (Node v24.18.1): `pathToFileURL('E:\x').href` → `file:///E:/x`; `pathToFileURL('e:\x').href` → `file:///e:/x`; `fileURLToPath('file:///E:/x/')` → `E:\x\`; `fileURLToPath('file:///e:/x/')` → `e:\x\`. Nothing normalizes case here. |
| `join`, `normalize` | lexical: slash → `\`, collapse `.`/`..` | **Never touches case** (probe: `E:\lib\..\lib\.\mermaid-chunk.js` → `E:\lib\mermaid-chunk.js`) |
| `realpathSync(abs)` (and `realpathSync.native`) | `e:\dsh\...\lib\mermaid-chunk.js` | Asks the OS for the file's **final path** (`GetFinalPathNameByHandleW` lineage). The case of each component — notably the drive letter — is whatever the machine's volume/mount record holds, not what the caller passed. On the prod box the volume is recorded as lowercase `e:`, so an `E:\...` input comes back `e:\...`. |
| `normalize(realpathSync(abs))` | same, separators normalized | still no case normalization |
| `String.prototype.startsWith(LIB_DIR + sep)` | `false` | **case-sensitive ordinal comparison** |
| outcome | 403 "path escapes the plugin lib" | for a file plainly inside lib/ |

Local probe replaying the exact `ci-note.md` strings through the guard logic:

- `abs.startsWith(LIB_DIR + sep)` (pre-realpath guard) → **true** (passes: `abs` inherits `LIB_DIR`'s spelling)
- `realpathLower.startsWith(LIB_DIR + sep)` (post-realpath guard) → **false** → the 403 branch fires, exactly as the route log shows
- the same comparison lowercased on both sides → **true** (the file is inside)

### Why Linux passes and the laptop passes — precisely

- **Linux**: `sep = '/'`, no drive letter, and POSIX names are case-*sensitive*, so `realpathSync` returning the on-disk spelling yields a string identical to the one derived from `import.meta.url` (same directory name, same bytes). Byte-for-byte equality ⇒ `startsWith` succeeds. Symlink escapes are still caught because the comparison runs post-`realpath`.
- **Win11 laptop**: the launch spelling and the volume's recorded drive-letter case happened to agree (`c:\` throughout, per ci-note), so the two strings matched by coincidence of spelling.
- **Prod Win2022**: the two spellings disagree (`E:` vs `e:`). Windows file access is case-insensitive — both strings name the same file — but `startsWith` is not, so a lexical "inside" becomes a computed "escape".

The failing variable is **not** "Windows vs Linux"; it is *whether the case of the two strings agrees*, which depends on launch spelling vs. the machine's volume record. Given the two strings from the debug print, the 403 is deterministic — reproduced verbatim in the local probe above. The maintainer's "Windows paths are unreliable" takeaway is wrong: the paths are reliable, the **comparison operator** is mismatched to the platform.

### Same-class latent failures in the same guard

Any case where `realpathSync`'s output string differs lexically while naming a file inside: 8.3 short names (`PROGRA~1`), junction/symlink rewrites, per-segment case renames (`\Lib\` vs `\lib\`), subst/volume-mount rewrites. Also note `decodeURIComponent(url.pathname…)` throws on malformed percent-escapes (unhandled → 500). The guard does handle the sibling-prefix trap correctly (`LIB_DIR + sep`; probe: `relative(LIB, '…\lib2\x.js')` → `..\lib2\x.js`) — but only thanks to the `+ sep` suffix.

## 3. Fix direction for the guard + one other serving requirement

### Fix: compare like with like — same canonicalization pipeline on both sides, containment (not prefix), case-insensitive on Windows

```ts
// 1) canonicalize the ROOT with the same API that canonicalizes the candidate
const ROOT = realpathSync(LIB_DIR)            // once, at route setup

// 2) containment via path distance, not string prefix
function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)        // win32: case-insensitive, separator-aware; posix: exact
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel) && !rel.split(sep).includes('..')
}

// handler:
const abs = normalize(join(LIB_DIR, rel))
if (!isInside(LIB_DIR, abs)) { res.writeHead(403).end(); return }   // pre-FS lexical check
let file
try { file = realpathSync(abs) } catch { res.writeHead(404).end(); return }
if (!isInside(ROOT, file)) { res.writeHead(403).end(); return }     // post-FS: both sides from realpathSync
```

Why this is robust on **both** platforms:

- **Same pipeline both sides**: `ROOT = realpathSync(LIB_DIR)` and `realpathSync(abs)` come from the same OS final-path API, so drive-letter case, 8.3 names, junctions and symlinks normalize identically on both sides. If you keep the lexical pre-check, pair `LIB_DIR` with the lexical `abs` — never cross the two pipelines (that is precisely the bug).
- **`path.relative` encodes the platform's own comparison rules** (probe, Node v24.18.1): `win32.relative('E:\...\lib', 'e:\...\lib\mermaid-chunk.js')` → `mermaid-chunk.js` (the case difference is absorbed — matching Windows' case-insensitive file semantics), while `posix.relative('/a/lib', '/a/other/x.js')` → `../other/x.js` (exact case — matching POSIX case-sensitive semantics). Its `..` result is the canonical "outside" signal, and it is immune to the sibling-prefix pitfall (`relative(LIB, '…\lib2\x.js')` → `..\lib2\x.js`).
- If you prefer an explicit compare, lowercase **both** sides with an invariant/ordinal lowercase (fixed-locale `toLowerCase()` or `localeCompare(..., { sensitivity: 'accent' })`) — never a locale-sensitive lowercase (Turkish dotted-I), never a one-sided `startsWith`.
- Belt-and-braces: reject NUL bytes in `rel`, wrap `decodeURIComponent` in try/catch → 400, keep the `*.js|.mjs` whitelist, keep 405 for non-GET.

### One other serving requirement the route must satisfy for a dynamic import to work at all

**The response must be a 2xx response with a JavaScript MIME type.** Module fetches (`import()` and `<script type="module">`) are subject to **strict MIME checking**: a non-JS MIME (e.g. `text/html` from an SPA fallback, or `application/octet-stream`) makes the browser throw `Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of …`, and any non-2xx (403/404/redirect-to-HTML) rejects the import with `Failed to fetch dynamically imported module` — regardless of the bytes. Concretely:

1. keep `content-type: text/javascript; charset=utf-8` (or `application/javascript`) with **200** and the raw file bytes — no redirect hops, no body rewriting;
2. return a **real 404** for missing/unsupported names — the route must win over the host's SPA/HTML fallback; an `index.html` + 200 `text/html` answer turns a clean, debuggable 404 into a MIME/parse failure;
3. (corollary of Incident 1) the whole import closure must be reachable at the URLs the chunk names, with the exact hashed filenames, served at chunk-relative URLs.

(If the resource route were ever cross-origin, `Access-Control-Allow-Origin` would also be mandatory, since `import()` is CORS-checked; here it is same-origin on `127.0.0.1:3080`, so the 2xx + JS-MIME contract is the operative requirement.)

## 4. Incident 3 — why BOTH handlers fire on one Ctrl+scroll

### Mechanism (event-listener ordering)

1. **One gesture = one `wheel` event**, dispatched in a single pass through the **full capture → target → bubble path**. Every `wheel` listener on any node of that path runs (unless propagation is stopped), in deterministic order: capture listeners top-down (window first), then target-phase, then bubble listeners bottom-up; same node ⇒ registration order.
2. **Both handlers are on that path.** The zoom modal's Ctrl+wheel handler (on the modal root or `window`, with `{ passive: false }` so it can `preventDefault`) and the pane's global Ctrl+wheel **font-size** handler (on `window`/`document`, very often capture-phase — the usual "Ctrl+wheel adjusts editor font" feature). The modal is typically **portalled under `document.body`**, and `window` is an ancestor of everything — DOM containment of the modal does not isolate it; a `wheel` over the modal still reaches the global handler.
3. **`preventDefault()` ≠ event consumption.** The modal does call `preventDefault()` (otherwise the page would also scroll) — but that only suppresses the *default action*. It does **not** stop other listeners. Only `stopPropagation()` (stops later nodes/phases) or `stopImmediatePropagation()` (also stops later listeners on the same node) do — and the modal calls neither. So the event continues to the pane's handler, which also changes the pane font size. Hence one Ctrl+scroll → diagram zoom **and** pane font resize.
4. **Ordering trap**: if the pane's handler is a **capture-phase** `window` listener, it runs *before* the modal's target-phase handler no matter what the modal does at target — so "just add `stopPropagation()` in the modal" is insufficient in that layout. Both registration orders must be handled by rule, not by luck.

### The ownership rule that fixes it

**One gesture, one owner: the topmost open modal that interprets Ctrl+wheel owns the gesture for pointers inside it (deepest/topmost interactive surface wins); every ambient/global handler yields while an owner exists.**

Implement on both sides:

- **Owner (modal)**: on `wheel` with `ctrlKey` over its subtree → `preventDefault()` **and** `stopPropagation()` (plus `stopImmediatePropagation()` if any listener can share the node); bind with `{ passive: false }` (a passive listener's `preventDefault` is ignored) and register as early in the path as it can (capture phase on the modal root).
- **Yielder (pane/global font handler)**: before resizing the font, skip when the event's `composedPath()` intersects a registered wheel-owner — e.g. `event.composedPath().some(el => el instanceof Element && el.closest('[data-wheel-owner]'))` — or when a modal is open (`document.querySelector('dialog[open], [data-modal-open]')`). Prefer binding this handler in the **bubble** phase so the owner's `stopPropagation()` actually prevents it.
- **Inverse guard**: with no owner open, Ctrl+wheel over the pane must still change the font size exactly once — the skip condition must be scoped to the owned gesture, not a blanket kill.
- Derive the decision from the **event path**, not from shared mutable flags or registration-order assumptions; mount order may change later and the rule must still hold.

## 5. Regression tests that would have caught incidents 1–3

**T1 — chunk-graph closure (build-time unit; catches Incident 1).**
After building, parse `lib/mermaid-chunk.js` for static `import`/`export … from`/dynamic `import()` specifiers that start with `./` or `../`. Assert the list is **empty** (self-contained build) — or, if split output is intentional, assert every referenced hashed filename exists in the emitted file set **and** in the published package manifest (`npm pack --dry-run` / tarball file list) with matching content hash. Fail message names the missing sibling (e.g. `pie-WAS4IAKB-CQHCQWWM.js not shipped but imported by mermaid-chunk.js`). This is exactly the assertion attempt 1 failed: entry shipped, closure not.

**T2 — lazy-render integration e2e through the real host route (catches Incidents 1 and 2 in situ).**
Playwright (headless) against the *built* plugin served by the real route: open a document with one mermaid fence; assert the `svg` diagram appears; attach network + console listeners and assert **zero** non-2xx responses, zero `Failed to fetch dynamically imported module`, zero module-MIME errors. Additionally GET every filename appearing in the chunk's import specifiers through the live route and assert `200` + JS MIME. Run on both Linux and Windows runners.

**T3 — containment-guard table-driven unit tests, as a pure function (catches Incident 2).**
Extract `isInsideLib(libDir, candidate)` and table-drive it:

| case | expected |
|---|---|
| inside, exact casing | allow |
| inside, **drive-letter case mismatch** (`E:` vs `e:`) — the evidence's failing case | allow |
| inside, segment case mismatch (`\Lib\` vs `\lib\`) | allow |
| mixed/forward separators, trailing separator | allow |
| sibling-prefix trap (`…\lib2\x.js` under `…\lib`) | 403 |
| `..\` traversal escaping the root (incl. encoded `..%2f`, `..%5c` before decode) | 403 |
| `..\` traversal that returns inside | allow |
| symlink/junction whose `realpath` lands outside root | 403 |
| 8.3 short-name spelling of the root | allow |
| NUL byte / malformed percent-escape in `rel` | 400/403, never 500 |

**Critical**: inject the case mismatch **explicitly** (stub `realpathSync` to return a lowercased drive letter, or feed both spellings as strings) instead of relying on the CI machine's ambient casing — otherwise the test passes on the laptop exactly the way the bug did. These are pure string-semantics tests, so they reproduce the bug on any OS.

**T4 — Windows route e2e with a case-divergent launch path (catches Incident 2 end to end).**
On a Windows CI job, launch the host through a path spelled with the opposite drive-letter case from the volume's canonical spelling (or stub the module URL case), then `GET /dsh-attach-input/resources/mermaid-chunk.js`: assert `200`, a JS `content-type`, and byte-equality with the file on disk. Also assert `404` (not `200 text/html`) for a missing name and `403` for a `..%2f..%2f` escape — pinning the serving contract from `3` at the same time.

**T5 — Ctrl+wheel ownership test (catches Incident 3).**
Component/DOM test mounting the pane with its Ctrl+wheel font handler and the modal with its zoom handler **as production mounts them** (modal in a portal on `document.body`; pane handler on `window`; both capture and bubble variants; both registration orders). Dispatch **one** `WheelEvent('wheel', { ctrlKey: true, deltaY: -100, bubbles: true, cancelable: true })` on the diagram element and assert:

- exactly one visible effect: diagram scale changed **and** pane font-size unchanged (spy on both handlers: the non-owner must not mutate anything);
- `event.defaultPrevented === true`;
- pane handler's mutation counter is 0 for that event.

Variants: modal portalled vs nested; host handler capture vs bubble; pointer over modal chrome vs over the diagram; and the **inverse** — no modal open, Ctrl+wheel over the pane changes font size exactly once. Optional e2e: Playwright `mouse.wheel` with Control held inside the open zoom modal; assert the diagram's computed `transform: scale()` changed while the pane's computed `font-size` is identical before/after.

**T6 — module-serving contract smoke (cheap, protects the MIME/404-fallback class).**
For each route hit and one invented missing name, assert: hit → `200` + JS MIME + exact bytes; missing → `404` with a non-HTML body; traversal → `403`; non-GET → `405`. One test, covers the whole `import()` HTTP contract.

## run-stats

- **toolcalls**: 20 total — 5 × run_code wrappers; nested: 1 × glob, 6 × read, 5 × write, 2 × edit, 1 × send_message (plus 3 in-process `fs.realpathSync` probes, which are filesystem reads, not tool calls)
- **token usage**: n/a (not exposed to the solver)
- **completion time**: 2026-10-21T14:55:52.998+08:00 (Asia/Shanghai, +08:00; session clock sampled 2026-10-21T14:36:17+08:00 at task start)
