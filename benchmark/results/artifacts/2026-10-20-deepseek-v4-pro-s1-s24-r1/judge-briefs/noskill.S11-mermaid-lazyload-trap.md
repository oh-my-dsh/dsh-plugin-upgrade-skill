# JUDGE BRIEF · noskill.S11-mermaid-lazyload-trap

## Criteria (sealed rubric)
- [split-chunk-attribution] (20pt) Use console-split-chunks.txt to explain that sibling module imports resolve relative to the fetched chunk URL, but the emitted siblings were not shipped, so entry HTTP 200 still ends in a failed dynamic import. Propose a self-contained single-file feature bundle with code splitting disabled. Do not require a particular bundler option spelling; an equivalent complete bundling/serving solution may earn credit if it explicitly accounts for every dependency.
- [windows-containment-attribution] (20pt) Compare chunk-route.ts and ci-note.md: configured LIB_DIR has uppercase E: while the resolved realpath has lowercase e:, so a case-sensitive startsWith containment test rejects an actually contained file. Explain why the supplied Linux/control environments pass. Do not claim Windows paths are intrinsically unreliable or realpath always lowercases on every machine.
- [safe-route-fix] (20pt) Propose path.relative-based containment using canonical base/target paths and platform-appropriate path semantics; reject parent traversal and absolute/outside results, including symlink escapes after resolution. Equivalent safe containment is valid. Preserve a JavaScript MIME type for dynamic import. Removing the guard, lowercasing arbitrary paths on case-sensitive systems, or merely naming path.relative is insufficient. No executed route test is required.
- [modal-event-ownership] (20pt) Explain that the pane font handler and modal zoom handler both act on the same Ctrl+wheel gesture. Give the modal exclusive ownership: the pane handler must stand down while the modal owns the gesture; the modal prevents the browser default and stops propagation as appropriate. If the pane uses ancestor capture, stopping propagation later in the modal cannot undo it. Equivalent listener arbitration is valid; a specific modal selector or unseen source line is not required.
- [incident-regressions] (20pt) Propose checks with expected outcomes covering all three incidents: import failure preserves a code-block fallback and the built dependency set is deployable; a case-differing contained Windows path serves while real traversal/symlink escape is refused; modal Ctrl+wheel zooms the diagram without changing pane font size. Partial credit for a meaningful but incomplete matrix. These are planned checks, not claims of execution.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [unsafe-containment] ceiling=40 The proposed fix disables containment or deliberately serves paths outside the plugin resource root. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.

## Candidate report(s)
#### FILE: S11-mermaid-lazyload-trap/report.md

# S11 · Mermaid Lazy-Load Trap — Root-Cause Report

Diagnosis of the three rollout incidents for the lazily-imported mermaid chunk in
@org/dsh-attach-input, derived from the evidence pack (chunk-route.ts, the two console
captures, and the maintainer's CI note).

## 1. Incident 1 — split-chunk approach (sibling import 404s)

Evidence (console-split-chunks.txt): the entry chunk mermaid-chunk.js is fetched 200 (8.1 kB),
then src-BfvxrPJe.js and pie-WAS4IAKB-CQHCQWWM.js return 404, then
"TypeError: Failed to fetch dynamically imported module". The ls note states only
mermaid-chunk.js was shipped; the sibling files referenced by its import statements were not.

Root cause: mermaid's diagram registry lazy-loads each diagram type with a runtime-computed
dynamic import() specifier (roughly import("./diagrams/" + id ...)). Under the bundler's default
code-splitting, a dynamic specifier that is not statically analyzable can only be emitted as a
chunk graph: one entry chunk plus many sibling chunks (one per diagram type, plus shared async
chunks such as src-*.js). The entry chunk is therefore NOT self-contained — it still contains
inner import("./pie-....js") and import("./src-....js") statements. When the entry chunk runs and
those inner imports fire, the browser resolves the relative specifiers against the entry chunk's
own URL and requests the sibling files. Because only the single entry file was shipped and
served, every sibling import 404s and the whole dynamic import() rejects with "Failed to fetch
dynamically imported module".

So the failure is: a dynamically imported chunk that itself contains dynamic import() of sibling
chunks breaks unless every sibling is also shipped and served.

Build-side fix: disable code-splitting for the mermaid entry so it is emitted as ONE
self-contained file with all inner dynamic imports inlined, and ship that single file:
- Rollup / Vite: build.rollupOptions.output.inlineDynamicImports = true (single entry, or set
  preserveEntrySignatures = false).
- esbuild: splitting = false (bundled IIFE/ESM output).
- webpack: disable splitChunks for this entry (or LimitChunkCountPlugin({ maxChunks: 1 })).

After the fix, lib/ contains exactly one mermaid chunk and no pie-* / src-* siblings.

## 2. Incident 2 — 403 on Windows, passes on Linux (realpath drive-letter case)

Evidence (ci-note.md debug print): LIB_DIR = "E:\dsh\...\lib" (uppercase E:) while
realpath = "e:\dsh\...\lib\mermaid-chunk.js" (lowercase e:). The failing guard is:

    file = normalize(realpathSync(abs))
    if (!file.startsWith(LIB_DIR + sep)) { res.writeHead(403); return }

Precise mechanism (not "Windows is different"):
- String.prototype.startsWith is a case-sensitive, byte-for-byte comparison.
- On Linux, realpath(3) (what Node's fs.realpathSync wraps) resolves symlinks and . / .. but
  never changes the casing of the path; the filesystem is case-sensitive and preserves the input
  casing. The realpath'd file and LIB_DIR therefore share an identical prefix and startsWith
  passes.
- On Windows, Node's fs.realpathSync / realpathSync.native ultimately uses
  GetFinalPathNameByHandleW, which returns the path with the drive letter in the casing stored in
  the OS DOS-device namespace (the casing the volume was mapped/assigned with). That casing can
  differ from the input casing: LIB_DIR came from fileURLToPath(import.meta.url) and preserved the
  launch-time uppercase E:, while realpathSync canonicalized the drive letter to the on-disk
  lowercase e:. The guard then compares e:\dsh\... against E:\dsh\...\ and, because startsWith
  is case-sensitive, reports an escape for a path that is plainly inside the lib dir -> 403.

The actual bug: the guard compares a realpath'd path against a NON-realpath'd LIB_DIR, so it is
not comparing like-with-like, and Windows realpath may normalize the drive-letter case.

## 3. Fix direction + the other serving requirement

Fix direction: canonicalize BOTH operands with the same realpathSync before comparing, and prefer
a structural containment check with path.relative instead of raw string prefixing. Robust form:

    const libReal = normalize(realpathSync(LIB_DIR));   // resolve once
    // per request:
    const file = normalize(realpathSync(abs));
    const relPath = path.relative(libReal, file);
    if (relPath.startsWith('..') || path.isAbsolute(relPath)) { res.writeHead(403); return; }

Both libReal and file now come from the same canonicalizing API, so drive-letter casing (and
symlink resolution, and .. traversal) is identical on both platforms. path.relative makes the
containment check structurally unambiguous (a result of ".." or an absolute path = escape) rather
than relying on case-sensitive string prefix matching. This is robust on both platforms because
the comparison no longer depends on input casing differing from canonical casing.

Other serving requirement: even after the guard is fixed and the bytes are returned, a dynamic
import() still fails unless the response carries a JavaScript MIME type — Content-Type:
application/javascript (or text/javascript). The browser's module loader rejects a module fetched
with any other MIME (e.g. text/html or application/octet-stream) with the same "Failed to fetch
dynamically imported module" error. The route already sets application/javascript; charset=utf-8;
that must be retained, and the chunk must be served as exact, untransformed bytes with HTTP 200.

## 4. Incident 3 — Ctrl+scroll resizes BOTH the diagram and the font

Why both handlers fire: there are two wheel listeners — the pane's font-zoom handler (Ctrl+wheel =
zoom font), attached on the pane/document (an ancestor), and the new zoom modal's diagram-scale
handler, attached on the modal (a descendant). A wheel event dispatched on the modal bubbles from
the target up through its ancestors, so after the modal handler runs (target phase) the event
continues bubbling to the pane's handler, which also runs. Neither handler claims the event
(preventDefault / stopPropagation), so one Ctrl+scroll triggers both.

Ownership rule (fix): exactly one handler must own a gesture. The innermost/active surface (the
modal) must claim Ctrl+wheel and stop it from reaching the ancestor handler: call
event.preventDefault() and event.stopPropagation() in the modal's zoom handler (registered in the
bubble phase so it fires before the ancestor's bubble listener). Alternatively, the pane's
font-zoom handler must early-return when the event originates inside the modal
(event.target.closest('.zoom-modal')). Either way, one owner per gesture; while the modal is open,
the modal owns Ctrl+wheel.

## 5. Regression tests that would have caught 1–3

1. Split-chunk (build/package): a post-build test that lists the emitted mermaid assets and fails
   if lib/ contains any JS besides the single self-contained entry (no pie-*.js, no src-*.js, no
   *-[hash].js siblings); plus a scan of the built entry asserting it contains no unresolved
   dynamic import("./…") sibling references. Add a Playwright e2e that loads a page containing a
   mermaid fence and asserts zero failed import() network requests and that the SVG diagram
   renders — this would have caught the shipped-but-missing sibling files.
2. Route containment (Windows casing): a unit test of the route handler with fs.realpathSync mocked
   so the resolved file path differs from LIB_DIR only in drive-letter case (e:\... vs E:\...) and
   asserts the handler returns 200, not 403. Run the route test in a CI matrix that includes a
   Windows runner whose install root is on a differently-cased drive. Also assert the response
   Content-Type is a JavaScript MIME type.
3. Zoom modal (DOM/UI): a jsdom/DOM or Playwright test that attaches both handlers, dispatches a
   WheelEvent with ctrlKey: true on the modal element, and asserts exactly one handler ran (spy the
   font-zoom handler and assert it was NOT called / the pane font-size is unchanged, while the
   diagram scale changed). This would have caught the double-fire before release.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.