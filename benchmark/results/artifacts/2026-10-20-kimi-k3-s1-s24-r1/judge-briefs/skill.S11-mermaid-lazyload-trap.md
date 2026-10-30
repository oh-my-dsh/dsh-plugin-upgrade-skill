# JUDGE BRIEF · skill.S11-mermaid-lazyload-trap

## Criteria (sealed rubric)
- [split-chunk-attribution] (20pt) Use console-split-chunks.txt to explain that sibling module imports resolve relative to the fetched chunk URL, but the emitted siblings were not shipped, so entry HTTP 200 still ends in a failed dynamic import. Propose a self-contained single-file feature bundle with code splitting disabled. Do not require a particular bundler option spelling; an equivalent complete bundling/serving solution may earn credit if it explicitly accounts for every dependency.
- [windows-containment-attribution] (20pt) Compare chunk-route.ts and ci-note.md: configured LIB_DIR has uppercase E: while the resolved realpath has lowercase e:, so a case-sensitive startsWith containment test rejects an actually contained file. Explain why the supplied Linux/control environments pass. Do not claim Windows paths are intrinsically unreliable or realpath always lowercases on every machine.
- [safe-route-fix] (20pt) Propose path.relative-based containment using canonical base/target paths and platform-appropriate path semantics; reject parent traversal and absolute/outside results, including symlink escapes after resolution. Equivalent safe containment is valid. Preserve a JavaScript MIME type for dynamic import. Removing the guard, lowercasing arbitrary paths on case-sensitive systems, or merely naming path.relative is insufficient. No executed route test is required.
- [modal-event-ownership] (20pt) Explain that the pane font handler and modal zoom handler both act on the same Ctrl+wheel gesture. Give the modal exclusive ownership: the pane handler must stand down while the modal owns the gesture; the modal prevents the browser default and stops propagation as appropriate. If the pane uses ancestor capture, stopping propagation later in the modal cannot undo it. Equivalent listener arbitration is valid; a specific modal selector or unseen source line is not required.
- [incident-regressions] (20pt) Propose checks with expected outcomes covering all three incidents: import failure preserves a code-block fallback and the built dependency set is deployable; a case-differing contained Windows path serves while real traversal/symlink escape is refused; modal Ctrl+wheel zooms the diagram without changing pane font size. Partial credit for a meaningful but incomplete matrix. These are planned checks, not claims of execution.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [unsafe-containment] ceiling=40 The proposed fix disables containment or deliberately serves paths outside the plugin resource root. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.

## Candidate report(s)
#### FILE: S11-mermaid-lazyload-trap/S11-mermaid-lazyload-trap-report.md

# S11 · Mermaid Lazy-Load Trap — Diagnosis & Fix Report

Plugin: `@org/dsh-attach-input` v0.4.0 (lib-only bundle). Evidence: `fixture/chunk-route.ts`,
`fixture/console-split-chunks.txt`, `fixture/console-403-windows.txt`, `fixture/ci-note.md`.
Mode: read-only inspection (no fixture file modified; no DSH version corridor involved, so no
upgrade cards apply — all three root causes are plugin-internal: bundler output semantics,
Node path/realpath platform behavior, DOM event propagation).

---

## 1. Incident 1 — split chunks: entry loads, every sibling 404s

**What breaks.** A dynamic `import()` of a code-split bundle fetches only the *entry chunk*; that
entry is not self-contained. Default code-splitting factored the mermaid module graph into the
8.1 kB entry (`mermaid-chunk.js`) plus **97 hashed siblings** (`src-BfvxrPJe.js`,
`pie-WAS4IAKB-*.js`, …) which the entry pulls in via relative specifiers
(`import './pie-WAS4IAKB.js'`). In the browser those specifiers resolve against the entry
chunk's URL — same prefix route — and each is fetched as its **own HTTP request**. A split chunk
graph is a *set of files* that must be deployed and served verbatim, hashed names included.

Evidence (`console-split-chunks.txt` final note): the shipped `lib/` contained
`mermaid-chunk.js` but **none of the sibling files listed in its import statements** — the
"lib-only" package's file/publish list only covered the declared entry outputs, so the hashed
sibling chunks emitted by default splitting never reached the host. Any serving layer would 404
them; the browser then surfaces the generic
`TypeError: Failed to fetch dynamically imported module` against the original `import()` call,
even though the entry itself returned 200.

**Build-side fix.** Make the lazy entry a single self-contained chunk so there are no relative
sibling imports at all:

- Rollup: `output.inlineDynamicImports: true` (single-input build; for a multi-entry lib build,
  give the mermaid entry its own build/output, or a `manualChunks` rule pinning the entire
  mermaid subgraph into one chunk); Vite exposes the same via `build.rollupOptions.output`.
- The weaker alternative — keep splitting — requires shipping *every* emitted chunk (publish
  `files`/pack step must include the hashed siblings, preserving relative layout) and serving
  them all; brittle and pointless for a route-served plugin chunk.
- Complementary requirement: the client must `import()` via the served URL (absolute
  route/publicPath URL), which attempt 2 already does.

## 2. Incident 2 — exact guard flaw: cross-domain, case-sensitive prefix comparison

The route has two containment checks (`chunk-route.ts`); only the **second** is broken:

- Line 15–16: `abs = normalize(join(LIB_DIR, rel))`; `abs.startsWith(LIB_DIR + sep)`. Both
  sides derive from the same `LIB_DIR` string → identical case → consistent everywhere. (Latent
  fragility: `new URL('.', import.meta.url)` ends in `/`, and `fileURLToPath`/`normalize`
  keep the trailing separator, so `LIB_DIR + sep` can degenerate to `…\\lib\\\\` — the
  debug print shows no trailing separator here, but the form is brittle.)
- Line 19–20: `file = normalize(realpathSync(abs))`; `file.startsWith(LIB_DIR + sep)`. **This
  compares two different normalization domains with a case-sensitive string prefix:**

  | API | What it returns on Windows |
  |---|---|
  | `fileURLToPath`, `path.join`, `path.normalize` | Pure string operations; **preserve the case of the input**. `LIB_DIR = "E:\dsh\…\lib"` (uppercase, matching how DSH was installed/launched). |
  | `fs.realpathSync` | Returns the **filesystem-canonical** path; Node's Windows realpath normalizes the drive letter — evidence prints `"e:\dsh\…\lib\mermaid-chunk.js"` (lowercase `e:`). On a case-insensitive NTFS volume no segment's case is guaranteed to match the input string. |
  | `String.prototype.startsWith` | **Case-sensitive** → `"e:\…".startsWith("E:\…") === false` → 403 "path escapes the plugin lib" for a path plainly inside lib. |

**Platform reconciliation** (`ci-note.md` matrix):

- **Linux CI**: realpath on a case-sensitive FS with no symlinks in the path returns the
  byte-identical string → prefix holds → green.
- **Windows laptop**: tooling supplied `LIB_DIR` already lowercase `c:\…`, coincidentally
  matching realpath's lowercase output → green *by case agreement*, not by correctness.
- **Production (Windows Server, `E:\` uppercase)**: uppercase `E:` in `LIB_DIR` vs lowercase
  `e:` from realpath → deterministic 403 on every chunk GET.

So the precise mechanism is **not** "Windows paths are unreliable": it is comparing an
unresolved, original-case root against a realpath-canonicalized candidate with a case-sensitive
string prefix.

## 3. Fix direction

1. **Canonicalize both sides into the same domain.** Compute once at startup:
   `LIB_ROOT = realpathSync(fileURLToPath(new URL('.', import.meta.url)))`;
   per request: `file = realpathSync(resolve(LIB_ROOT, rel))`. Both sides now carry realpath's
   drive-letter casing → case agrees on Windows.
2. **Replace the prefix test with a semantic containment test:**
   ```ts
   const inner = path.relative(LIB_ROOT, file)
   const allowed = inner !== '' && inner !== '..' && !inner.startsWith('..' + sep) && !path.isAbsolute(inner)
   ```
   Robust on both platforms: no string-case assumption, no trailing-separator pitfall, no
   shared-prefix hazard (`/lib` vs `/lib-evil`), and still rejects `..` escapes plus symlinks
   pointing out of lib (realpath resolves them before the test).
3. **Other serving requirement:** a dynamic `import()` is fetched as a **module script**, and
   browsers enforce MIME-type checking — the response must carry a JavaScript MIME type
   (`application/javascript` / `text/javascript`); a 200 with `text/plain` or
   `application/octet-stream` still fails the import. The route's
   `'content-type': 'application/javascript; charset=utf-8'` (line 23) already satisfies this —
   keep it. (Same-origin host here, so no CORS needed; module fetches are CORS-mode, so a
   cross-origin chunk would additionally need `Access-Control-Allow-Origin`.)

## 4. Incident 3 — why BOTH handlers fire on one Ctrl+scroll

`wheel` is a composed, **bubbling** DOM event. One physical Ctrl+scroll dispatches **one event
object** that walks the capture phase (window → target) and then the bubble phase (target →
window); **every listener on that propagation path is invoked** unless a listener stops it. The
pane's Ctrl+wheel font-zoom listener sits on the pane container (or window/document, possibly
capture-phase) — an ancestor of the modal content — while the modal's zoom listener sits inside,
so both receive the same event. Registration order does not change this, and even
`preventDefault()` does not stop other listeners.

**Ownership rule:** while a fullscreen overlay is open, it **exclusively owns wheel gestures
targeted inside it**. Enforce by having the modal register a **capture-phase, non-passive**
wheel listener while open (non-passive is required so `preventDefault()` is honored — wheel
listeners on document-level targets default to passive), calling `e.preventDefault()` +
`e.stopPropagation()`. Capture-phase interception makes the modal act before any pane-level
listener regardless of where/how the pane registered. Defensively, the pane handler should also
ignore events whose `composedPath()` / `target.closest()` lies inside the overlay, and the
modal must remove its listener on close to restore pane ownership. Net rule: **exactly one
handler consumes a given wheel event — the topmost owner stops propagation; everything else
ignores events it does not own.**

## 5. Regression tests that would have caught all three

1. **Pack-completeness (incident 1):**
   - Build → `npm pack --dry-run --json`; extract every relative import/export specifier from
     each shipped `.js` (es-module-lexer); assert each resolves to a file in the packed list.
     Attempt-1 output fails: 97 referenced siblings missing.
   - Bundle-shape assertion: the mermaid lazy entry emits exactly one chunk containing zero
     relative `import` specifiers (locks in `inlineDynamicImports`).
   - E2E: install the tarball, serve via the route, `import()` the chunk in a headless browser;
     assert success and zero 404s among transitive fetches.
2. **Route guard (incident 2):**
   - Unit-test the handler under `path.win32` semantics with mocked `realpathSync` returning a
     lowercased drive (root `E:\…\lib`, realpath `e:\…\lib\mermaid-chunk.js`) → expect
     200; plus mixed-case segment variants.
   - Negative tests: `../` and `%2e%2e%2f` traversal, absolute-path escape, symlink inside lib
     pointing outside → 403/404; symlink pointing inside → 200.
   - Header assertion: response `content-type` is a JavaScript MIME.
   - Run the suite on both a Windows and a Linux CI job to pin cross-platform behavior.
3. **Wheel ownership (incident 3):**
   - Mount pane + open modal; dispatch
     `new WheelEvent('wheel', { ctrlKey: true, bubbles: true, cancelable: true })` inside the
     modal → assert diagram zoom applied, pane handler **not** called / pane font-size unchanged,
     `defaultPrevented === true`.
   - Dispatch outside the modal → pane font-zoom fires; modal unaffected.
   - Repeat with the pane listener on `window` with `{ capture: true }` to lock the
     ordering guarantee, and assert the modal listener is non-passive.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.