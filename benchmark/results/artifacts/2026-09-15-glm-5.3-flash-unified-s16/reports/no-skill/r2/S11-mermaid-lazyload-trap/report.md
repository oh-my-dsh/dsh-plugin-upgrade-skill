# S11 · Mermaid Lazy-Load Trap — Diagnosis Report

Plugin: `@org/dsh-attach-input` v0.4.0 (lib-only bundle), lazily imported mermaid chunk served via
the host prefix route `/dsh-attach-input/resources`. Evidence: `fixture/chunk-route.ts`,
`fixture/console-split-chunks.txt`, `fixture/console-403-windows.txt`, `fixture/ci-note.md`.

---

## 1. Incident 1 — why default code-splitting broke the lazy import

**Evidence:** `console-split-chunks.txt` — `mermaid-chunk.js` itself returned **200** (8.1 kB), but
its sibling imports `src-BfvxrPJe.js` and `pie-WAS4IAKB-CQHCQWWM.js` returned **404**, and the
footnote states the sibling files "were NOT shipped with the package".

**Root cause (bundler/import semantics, not a serving bug):** A dynamic `import()` is atomic over
the whole module graph. When the browser fetches `mermaid-chunk.js`, it must also resolve every
*static* `import` statement inside it relative to the chunk's own URL before evaluation. The
bundler's default code-splitting extracted shared dependencies into ~97 sibling chunks, and the
lib-only packaging shipped only the entry chunk. So:

1. `mermaid-chunk.js` fetches fine (200).
2. The browser then requests its static sibling imports (`./src-BfvxrPJe.js`,
   `./pie-WAS4IAKB-CQHCQWWM.js`) — those files don't exist under `lib/` → 404.
3. Any failed fetch anywhere in the graph rejects the *top-level* `import()` with
   `TypeError: Failed to fetch dynamically imported module .../mermaid-chunk.js` — the error
   names the entry chunk even though the entry chunk was the one file that loaded. That is why
   the console message looks like the entry failed when it did not.

This cannot be fixed at serve time for a lib-only package: the missing files simply are not in the
artifact.

**Build-side fix:** emit the lazily imported mermaid module as a **single self-contained chunk**
with no relative sibling imports. Concretely: build it as its own single-entry bundle with code
splitting disabled for that entry — Rollup/Vite `output.inlineDynamicImports: true` (Vite:
`build.rollupOptions.output.inlineDynamicImports`, or a separate single-file build of the mermaid
entry with `manualChunks` off) — which inlines all dependencies into `mermaid-chunk.js` (attempt 2
did exactly this, producing the 7.2 MB self-contained file). The alternative of shipping the whole
`dist/` directory (every sibling chunk) also removes the 404s, but it reintroduces the packaging
coupling this plugin deliberately avoids; inlining is the robust choice for a lib-only bundle.

---

## 2. Incident 2 — the exact guard flaw behind the Windows-only 403

**Evidence:** `console-403-windows.txt` — the route log shows the "path escapes the plugin lib"
branch fired for a path "plainly inside" the lib dir; the debugging session printed:

```
LIB_DIR   = "E:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib"
realpath  = "e:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\mermaid-chunk.js"
```

The only difference is the **case of the drive letter**: `E:` vs `e:`. The guard in
`chunk-route.ts` line 20 is:

```ts
if (!file.startsWith(LIB_DIR + sep)) { res.writeHead(403) ... }
```

**Mechanism, API by API:**

- `LIB_DIR = normalize(fileURLToPath(new URL('.', import.meta.url)))` — `fileURLToPath`,
  `path.normalize`, and `path.join` are **pure, case-preserving string transforms** on every
  platform. They return the drive letter exactly as it appears in the module URL (`E:` here,
  reflecting how Node loaded the plugin). On Linux they equally preserve input bytes.
- `fs.realpathSync(abs)` — resolves symlinks/junctions and returns the **canonical on-disk form as
  reported by the OS** (libuv `uv_fs_realpath` → `GetFinalPathNameByHandleW` on Windows). On
  Windows this reports the drive letter in the volume's canonical case — observed lowercase (`e:`)
  regardless of the input casing — and path components in their true on-disk case. On Linux it
  returns the byte-identical canonical path (case-sensitive filesystem, nothing to re-case).
- `String.prototype.startsWith` — a **case-sensitive** comparison on every platform. So
  `"e:\...".startsWith("E:\dsh\...\lib")` is `false` on the production host.

NTFS is case-insensitive (case-preserving): `E:` and `e:` are the same volume, and the file is
plainly accessible — the 403 is a false positive of the string comparison, not a real escape.

**Why the matrix in `ci-note.md` looks the way it does:** Linux CI passes because both sides of the
comparison share identical bytes (case-sensitive FS, consistent canonicalization). The Windows 11
laptop passed by accident: there `import.meta.url` yielded a lowercase `c:` matching what
`realpathSync` reports, so the two casings happened to agree. Production (uppercase `E:` from the
loader vs `realpathSync`'s lowercase) exposes the mismatch. "Windows paths are unreliable" is the
wrong takeaway — the bug is comparing a case-preserving value against an OS-re-cased value with a
case-sensitive string operation. Note the *first* guard (`abs.startsWith(LIB_DIR + sep)`) passes
because `abs` is built *from* `LIB_DIR` via `join` (same casing); only the realpath guard fires —
consistent with the log.

---

## 3. Fix direction for the guard + the other serving requirement

**Fix: canonicalize both sides, then compare case-insensitively on Windows.**

```ts
const LIB_DIR_REAL = normalize(realpathSync(LIB_DIR))          // once at startup
const file = normalize(realpathSync(abs))
const same = (p: string) =>
  process.platform === 'win32' ? p.toLowerCase() : p           // case-fold only where FS is case-insensitive
if (!same(file).startsWith(same(LIB_DIR_REAL) + sep)) { 403 }
```

Why this is robust on both platforms:

- `realpathSync(LIB_DIR)` runs the **same** OS canonicalization on the root as on the candidate,
  so both operands get the drive letter from the same source (`e:\...` vs `e:\...`) — the casing
  can no longer disagree. On Linux nothing changes: realpath of a real directory is a no-op
  canonicalization and the byte comparison is exact.
- Case-folding the comparison on `win32` additionally covers residual casing drift (on-disk
  component casing, mounted-volume quirks) and matches NTFS's own case-insensitive semantics.
  Keeping it platform-gated preserves strict, case-sensitive containment on Linux, where
  `E:\` vs `e:\`-style collisions do not exist but *different* case-sensitive siblings do.
- Keep the `+ sep` suffix (a path of `...\lib-evil` must not pass a `...\lib` prefix check) and
  keep the realpath resolution itself — it defeats symlink/traversal escapes.

**The other serving requirement:** for a dynamic `import()` to work at all, the response must be
served with a **valid JavaScript MIME type** (`application/javascript` / `text/javascript`).
Module scripts enforce strict MIME checking: a 200 response with `text/plain` or
`application/octet-stream` is refused by the browser and surfaces as the same
`Failed to fetch dynamically imported module` error. `chunk-route.ts` already does this
(`'content-type': 'application/javascript; charset=utf-8'`) — it must not regress (e.g., if the
route ever falls back to a generic static handler). (Same-origin here, so no CORS requirement;
that would be a third consideration only if the prefix were cross-origin.)

---

## 4. Incident 3 — why one Ctrl+scroll fires BOTH handlers

**Mechanism (event propagation, not a "Windows-style" quirk):** `wheel` events **bubble**. The
host reading pane implements font-size zoom as a ctrl+`wheel` listener at the **document/window
level** (global, so it works anywhere over the pane). The plugin's fullscreen zoom modal registers
its own ctrl+`wheel` handler on the **modal container element**. When the user Ctrl+scrolls over
the modal:

1. The event dispatches at the target inside the modal and bubbles up through the modal container,
   where the plugin's zoom handler runs (diagram scale changes).
2. Unless propagation is explicitly stopped, the *same* event continues bubbling past the modal to
   `document`/`window`, where the host's font-size handler also runs (pane font size changes) —
   the host handler has no knowledge that a plugin modal sits under the pointer.

Neither handler calls `preventDefault()`/`stopPropagation()` (and if the host listener was added
as passive — the default for `wheel` on window/document in Chromium — it could not `preventDefault`
anyway), so one gesture drives two independent zoom responses. Registration order and capture vs
bubble do not save you here: different targets on the same bubble path both receive the event.

**Ownership rule that fixes it:** exactly **one handler may consume a given ctrl+scroll gesture —
the surface the pointer is over owns it exclusively.**

- While the modal is open, the modal claims the gesture: its handler must call
  `event.preventDefault()` (blocks the browser's own page zoom) and
  `event.stopPropagation()` (blocks the host font-size handler further up the bubble path); if both
  handlers ever end up on the same target, `stopImmediatePropagation()` plus deliberate
  registration order. The listener must be registered with `{ passive: false }` so
  `preventDefault` is honored.
- When the modal closes, the plugin must remove its listener (or stop claiming), returning
  ownership to the host so pane font-size zoom works again.
- Durable host-side backstop: the host should yield ctrl+`wheel` when
  `event.target.closest('[data-plugin-modal-open]')` (or an equivalent "modal open" flag)
  matches — i.e., ownership is keyed to the topmost interactive surface, not to who registered
  first.

---

## 5. Regression tests that would have caught incidents 1–3

**Incident 1 — chunk self-containment (build gate):**
- *Packaging test:* after the build, scan every `.js` file in the shipped `lib/` for relative
  import specifiers (static `from './x.js'` and dynamic `import('./x.js')`), resolve each against
  its file, and assert the target exists in `lib/` — failing with the exact list of missing
  siblings. The attempt-1 capture (`src-BfvxrPJe.js`, `pie-...` 404s) is precisely this test
  failing.
- *Runtime integration test:* serve `lib/` (or the real route) and, in a headless browser
  (Playwright `page.evaluate`), `await import('<base>/mermaid-chunk.js')` and assert it resolves
  and evaluates (exports/mermaid global present). Dynamic-import graph failures reproduce here on
  every platform, not just production.

**Incident 2 — route guard (cross-platform correctness):**
- *Guard unit test (pure function, runs on any OS):* feed the containment predicate fixtures where
  the candidate's canonical case differs from LIB_DIR's case (e.g., win32 drive-letter
  `E:\...lib` vs realpath `e:\...lib`) and assert **accept**; assert reject for real escapes
  (`..%2F..%2F` traversal decoded into the path, a path merely prefixed like `...\lib-evil`, and a
  symlink pointing outside the lib).
- *Route integration test:* GET `/dsh-attach-input/resources/mermaid-chunk.js` through the
  registered route → 200 with `content-type` matching `javascript` (this also locks in the strict
  MIME requirement from section 3); traversal → 403; missing file → 404; non-GET → 405.
- *Windows CI leg (exact production repro):* on a Windows runner, install the plugin at a path
  whose drive-letter casing differs from what `fs.realpathSync` reports (as in the ci-note debug
  print) and assert the chunk GET returns 200. This is the test whose absence let the laptop-vs-
  production casing accident ship.

**Incident 3 — gesture ownership:**
- *Playwright behavioral test:* open the reading view, open the zoom modal, dispatch
  Ctrl+scroll over the modal (`keyboard.down('Control')` + `mouse.wheel(0, -240)`), then assert the
  diagram's scale/transform changed **and** the pane's computed `font-size` (or its CSS variable)
  is unchanged; then close the modal, Ctrl+scroll over the pane, and assert font size changed and
  no diagram-scale change occurred. Both assertions together enforce "exactly one owner per
  gesture, in both states".
- *jsdom unit test:* assert the modal's ctrl+`wheel` handler calls `preventDefault()` and
  `stopPropagation()` (spies) and is registered with `passive: false`, and that the listener is
  removed on modal close — the mechanism-level contract that makes the behavioral test pass.

---

## Summary of fixes

| Incident | Root cause | Fix |
|---|---|---|
| 1 · sibling 404s | Dynamic `import()` is atomic over the graph; default code-splitting emitted siblings that a lib-only package never ships | Single self-contained chunk: `inlineDynamicImports: true` / single-entry, split-free build of the mermaid module |
| 2 · Windows 403 | Case-preserving `fileURLToPath`/`normalize` (`E:`) vs OS-canonical `fs.realpathSync` (`e:`) compared with case-sensitive `startsWith` | `realpathSync` both sides, case-fold the comparison on `win32`, keep `+ sep` and realpath containment |
| 2b · serving | Module scripts require a JS MIME type | Keep `application/javascript; charset=utf-8` on every 200 |
| 3 · double zoom | `wheel` bubbles: modal-element handler and host window-level font-size handler both see one ctrl+scroll | Ownership rule: open modal claims the gesture (`preventDefault` + `stopPropagation`, `passive: false`), releases it on close; host yields over an open modal |
