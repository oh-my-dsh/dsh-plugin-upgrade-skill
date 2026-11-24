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

# S11 — Mermaid lazy-loading diagnosis

This is a read-only analysis of the five supplied fixture files and the task brief. No skills, network, installations, migrations, fixture execution, grading, or fixture edits were used. The checks below are proposed regression coverage, not executed tests.

## 1. Split-chunk failure

`console-split-chunks.txt` shows the entry returning 200 and its sibling modules returning 404. It explicitly says that the shipped lib directory omitted those siblings. Loading an ES module entry does not embed its dependency graph: relative import specifiers resolve against the importing module URL. Here `./pie-…js` resolves underneath `/dsh-attach-input/resources/`, and the browser must fetch it separately when that diagram is needed. A successful entry download therefore does not establish successful module evaluation or rendering. Transitive static or dynamic import failures can reject the lazy-loading operation and produce the reported fallback.

Keep the application's lazy import boundary, but build that boundary as one self-contained browser ES module. Disable code splitting and inline the renderer's internal dynamic imports (for a Rollup-style build, a dedicated single entry with `output.inlineDynamicImports: true`; equivalent configuration depends on the actual bundler). Include transitive dependencies rather than leaving browser-unresolvable externals. The fixture does not identify the bundler, so this is a build direction, not a verified configuration patch. The alternative is to package and serve every emitted dependency at its expected relative URL. Merely copying the entry or renaming its output cannot fix missing dependencies.

## 2. Windows containment failure

The decisive evidence is `ci-note.md`:

- `LIB_DIR` begins `E:\dsh\…\lib`.
- `realpathSync(abs)` returns a file beginning `e:\dsh\…\lib\mermaid-chunk.js` on production.

`fileURLToPath` converts the module file URL to a native filesystem path. `path.normalize` normalizes separators and dot segments; it does not canonicalize drive-letter casing or resolve symlinks. Thus the lexical base retains the uppercase `E:`. `join` and `normalize` likewise construct a candidate retaining that casing. `realpathSync` resolves the actual filesystem path and links; its spelling can differ from the original lexical spelling, as the lowercase drive letter demonstrably does here. Applying `normalize` to that result does not change `e:` back to `E:`.

JavaScript `String.startsWith` is case-sensitive regardless of operating system. Consequently the second guard compares `e:\…` with `E:\…\` and rejects a valid child. This is a mismatch between filesystem path equivalence and string-prefix equality, not an unavailable file or a browser chunk-size issue. Windows realpath is not guaranteed always to lowercase drives; the captured mismatch, rather than such a blanket claim, explains this incident and why another Windows machine passes.

On Linux the corresponding APIs use POSIX paths (for example `/…/lib/mermaid-chunk.js`), with no drive letter. Normalize performs lexical cleanup; realpath still resolves links. For the CI installation the base and resolved file spellings agree, so the string prefix succeeds. Linux paths are normally case-sensitive, so universal lowercasing would be an incorrect cross-platform repair. A symlinked base could also make lexical-versus-realpath comparison fail on Linux.

There is an additional source-excerpt caveat: `new URL('.', import.meta.url)` denotes a directory, and `normalize` can preserve its trailing separator. Appending another `sep` blindly could make the first prefix guard reject valid children too. The diagnostic base printed in the fixture has no trailing separator, so this does not explain the supplied drive-case trace. A replacement guard should eliminate that fragility as well. The excerpt also appears to have a transcription issue in its leading-slash regex; it was not compiled or treated as an executable reproduction.

## 3. Guard repair and module serving

Compare path relationships with the native `path.relative`, not raw string prefixes. Resolve the base once, use a lexical containment check before filesystem lookup, then compare the resolved candidate to the resolved base to reject symlink/junction escapes. Conceptually:

```js
const lexicalRoot = path.resolve(LIB_DIR);
const realRoot = fs.realpathSync(lexicalRoot);
function isStrictChild(root, candidate) {
  const rel = path.relative(root, candidate);
  return rel !== '' &&
    rel !== '..' &&
    !rel.startsWith('..' + path.sep) &&
    !path.isAbsolute(rel);
}
const candidate = path.resolve(lexicalRoot, decodedRelativePath);
if (!isStrictChild(lexicalRoot, candidate)) return forbidden();
const realFile = fs.realpathSync(candidate);
if (!isStrictChild(realRoot, realFile)) return forbidden();
```

Use the current platform's `path` implementation for actual filesystem paths. Windows relative-path semantics handle drive-letter case equivalence; POSIX semantics preserve case sensitivity. Explicit parent-segment and absolute-result checks reject traversal and other-drive results without confusing a neighbor such as `lib-other` with a child of `lib`. Comparing two real paths also handles a symlinked installation root while blocking a child link that resolves outside it. Keep URL decoding, route boundaries and filename validation deliberate; malformed percent encoding should receive a controlled client error. An exact allowlist for the intended chunk can further narrow exposure. This sketch is a fix direction, not a complete hardened server implementation or protection against concurrent filesystem link replacement.

The response must also have a JavaScript module MIME type, such as `application/javascript; charset=utf-8`, and contain browser-compatible ES module bytes rather than an HTML fallback or CommonJS-only output. The supplied route already sets that MIME type on its success path. If delivery is cross-origin, module fetches additionally require appropriate CORS permission; the captured URLs alone do not establish that such a setup exists.

## 4. Ctrl+wheel ownership

The brief reports that a modal diagram zoom and the pane font zoom both respond to the same Ctrl+wheel. A wheel event travels through the DOM propagation path, so modal presence alone does not exclude a global or pane listener. `preventDefault()` cancels the browser default; it does not cancel other JavaScript listeners. A modal's bubble-phase `stopPropagation()` is too late if a pane/global handler has already run during capture. On the same target, ordinary stopPropagation does not suppress sibling listeners; registration order matters, and even stopImmediatePropagation cannot undo an earlier listener.

There is no modal or pane listener source in this fixture. Thus the exact capture flag, target and registration order cannot be established from the evidence. An earlier global capture listener followed by the modal listener is a concrete mechanism consistent with the symptom, not an observed source fact.

The repair is explicit gesture ownership: while the diagram modal owns a Ctrl+wheel gesture, the pane font handler must return without changing font size. Put that exclusion before any pane mutation, ideally through one shared ownership predicate or centralized dispatcher; determine ownership using modal state and the event's composed path when relevant. The modal handles the gesture once and uses a non-passive wheel listener if it must call preventDefault. For a fullscreen modal, background pane zoom should be disabled while it is active. Remove the exclusion when it closes. This remains correct regardless of listener phase or registration order; propagation controls alone are insufficient when another handler has already executed.

## 5. Regression coverage

1. **Published module graph:** Build the distributable package and inspect its emitted module graph. For the single-file strategy, fail on remaining external relative module dependencies or bare browser imports. Serve the actual packaged lib directory and render representative diagram types, including pie and types reached only through lazy imports. In a clean browser session assert successful rendering, no fallback, no module-fetch failures, and no missing sibling requests. If splitting is intentional, recursively verify every dependency is packaged and served at the correct URL. Testing the development tree would miss the exact packaging defect.
2. **Path behavior:** Unit-test the containment predicate with `path.win32` inputs whose base is uppercase `E:` and real candidate lowercase `e:`, plus the reverse and matching cases. Test POSIX inputs separately, including case-distinct directories. Cover base paths with and without trailing separators, a root itself, a valid nested child, `..` traversal, sibling-prefix directories, a different drive and UNC roots. Do not rely only on a passing C-drive laptop.
3. **Real route on both systems:** In Windows and Linux CI, install a packaged fixture in a temporary test directory, request the chunk and assert 200, correct MIME and loadable module content. Include the observed E/e path-spelling mismatch through a controlled realpath test seam if a CI runner cannot reproduce it naturally, while retaining native Windows filesystem coverage. Exercise a symlink/junction to an outside file (403) and a symlinked plugin root with a valid internal file (allowed). Include missing resource (404), non-GET (405), invalid encoding, encoded traversal and non-resource paths. These are proposed disposable test fixtures, not changes made here.
4. **Gesture integration:** With the modal open, send an actual browser Ctrl+wheel over the diagram and assert its zoom changes once and pane font size is unchanged. Repeat with the pane registered before the modal and with a pane capture listener, so a late stopPropagation-only repair fails. Cover events over nested modal elements, modal closure restoring pane font zoom, ordinary scrolling, and repeated open/close cycles without duplicate listeners. Check browser default suppression where required. Record listener phase/order in the reproduction to resolve the current evidence gap.

No blocker prevents this report. Exact bundler settings, native runtime reproduction and precise event registration order remain unverified because build configuration, runnable host and listener sources were not supplied.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.