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
#### FILE: S11-mermaid-lazyload-trap/report.md

# S11 — Mermaid lazy-load diagnosis

Read-only Mode A investigation using `skills/plugin-upgrade/SKILL.md` and `references/troubleshooting.md`. The authorized plan was to inspect the supplied evidence, explain all three incidents, and document fixes and regression coverage without executing or modifying the fixture. BENCHMARK-AUTH-v1 authorizes this report write. No installation, migration, network access, or package scripts were run.

## 1. Split chunks: the entry is only the first module in the graph

`console-split-chunks.txt:4–12` proves that the entry returned 200 while its sibling modules returned 404, and explicitly says those siblings were absent from the shipped lib directory. An ESM import such as `./pie-WAS4IAKB-CQHCQWWM.js` is resolved relative to the importing module URL, so it becomes another request under `/dsh-attach-input/resources/`. Loading the entry successfully does not make the dependency graph available. A static dependency failure rejects entry evaluation; a nested dynamic import fails when its diagram renderer is requested. Both can surface as “Failed to fetch dynamically imported module” and trigger the fallback.

Build the Mermaid entry separately as a browser ESM bundle with all its dependencies bundled and dynamic imports inlined, producing one self-contained `mermaid-chunk.js`. For Rollup-style output this means a single input and `output.inlineDynamicImports: true`; use the actual bundler's equivalent and check its output graph. Merely calling the entry a bundle, or changing its filename, does not eliminate internal imports. Keep the outer client-side `import(resourceURL)` lazy; inlining the inner graph does not require loading Mermaid at page startup. Ship that generated file in the lib-only package. A viable alternative is to ship and serve the complete split graph at the matching relative URLs, but the requested single-file design avoids that deployment obligation.

## 2. Windows 403: lexical prefix comparison versus filesystem identity

The decisive evidence is `ci-note.md:11–12`:

- LIB_DIR: `E:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib`
- realpath: `e:\dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\mermaid-chunk.js`

`chunk-route.ts:5,15–20` mixes a lexical path with a filesystem-resolved path and uses JavaScript's case-sensitive `startsWith` to decide containment.

On Windows, `fileURLToPath` yields a Windows filesystem path from the file URL. `path.normalize` normalizes separators and dot segments but does not establish canonical filesystem identity or reliably unify drive-letter case: the supplied uppercase E survives in LIB_DIR and the joined candidate. `fs.realpathSync` resolves filesystem links and returns the resolved path spelling; in this production observation its drive is lowercase e. Normalizing that result does not uppercase it. The first guard can therefore pass, while the second compares `e:\...` against `E:\...\` and rejects a file on the same drive inside the directory. JavaScript string comparison does not acquire Windows path semantics just because the strings are paths. Lowercase drive output is the observed result here, not a promise that every Windows realpath always lowercases every component.

On Linux, fileURLToPath/normalize produce POSIX paths with `/`; realpath returns a resolved absolute POSIX path. There is no drive-letter representation mismatch in the passing CI layout, so its prefix matches. Linux success is evidence about that layout, not proof that lexical and resolved paths are interchangeable when symlinks exist. The laptop's matching spellings similarly explain why a Windows-only CI checkbox would not necessarily catch this.

A separate excerpt caveat: `new URL('.', import.meta.url)` normally retains a terminal separator, and normalize can preserve it. Appending another `sep` then creates a double separator in the prefix. The debug log shows LIB_DIR without that trailing separator, so this does not explain the documented production case; it is another reason to remove string-prefix containment and include a trailing-separator regression. The route excerpt is static evidence, not a complete executable project.

## 3. Correct containment and serving contract

Use path-component containment via the platform's `path.relative`, and compare real paths with real paths. Illustrative algorithm (proposal only):

```ts
const root = realpathSync(LIB_DIR)
function inside(base: string, target: string) {
  const delta = relative(base, target)
  return delta !== '' && delta !== '..' &&
    !delta.startsWith('..' + sep) && !isAbsolute(delta)
}
const candidate = resolve(root, rel)
if (!inside(root, candidate)) return forbidden()
const file = realpathSync(candidate)
if (!inside(root, file)) return forbidden()
// Verify this is a regular file, then read and serve it.
```

Use native `node:path` on the running host (or explicitly win32/posix in platform-focused unit cases). Windows relative comparison handles drive-letter case; POSIX comparison preserves case sensitivity. Rejecting an absolute relative result also rejects a different Windows drive or share. The separator-aware parent check rejects `../outside` without rejecting an innocent name such as `..notes.js`. It also avoids accepting a prefix sibling such as `lib-evil`. Canonicalizing both root and file accommodates a legitimate junction/symlink installation root while rejecting links inside lib whose real target escapes that root. The lexical check rejects traversal before filesystem access; the realpath check enforces the resolved boundary. Do not “fix” this by removing the guard or lowercasing all paths on every platform. A mutable hostile installation tree would additionally require addressing the check/read race; this proposal assumes a trusted deployment tree.

A dynamic import also needs a successful HTTP response with a JavaScript MIME type and actual browser-compatible module bytes. The route already sets `application/javascript; charset=utf-8` at line 23, which must be preserved; HTML fallback with a 200 is not sufficient. An authenticated same-origin browser request must reach this route. Preserve existing host authorization rather than bypassing it. The observed guard log distinguishes this case from an origin/authentication fence failure.

## 4. Ctrl+wheel: one event needs one owner

The reported double change means both the pane font-zoom logic and the modal diagram-zoom logic accept the same Ctrl+wheel event. `preventDefault()` cancels the browser default; it does not stop other JavaScript listeners. `stopPropagation()` does not suppress other listeners on the same node. If both listeners are native document capture listeners, they execute in registration order: a pane listener installed first has already resized the font by the time the later modal listener calls even `stopImmediatePropagation()`. Likewise, a document capture handler precedes a modal-element/bubble handler. Later cancellation cannot undo an earlier state update.

The evidence pack does not include either wheel listener or their registration code, so the exact node/phase/order cannot be verified here. The above ordering mechanism explains why adding cancellation in the modal alone is insufficient; inspect listener registration to confirm the concrete topology.

Define explicit ownership: while the diagram zoom modal is open, it owns Ctrl+wheel for its surface, and the pane font handler must return before changing state for those events. If the fullscreen modal blocks all pane interaction, suppress pane zoom for the entire modal lifetime. Use shared modal state or an event composed-path/overlay ownership predicate that works with portals, rather than relying on incidental listener order. The owner applies diagram zoom once and uses a non-passive listener plus `preventDefault()` where browser zoom must be suppressed. Clean up listeners on close/unmount. `stopImmediatePropagation()` may limit later listeners but is not the primary ownership contract.

## 5. Regression coverage to add

1. **Packaged module graph:** inspect the actual distributable, not just the build directory. Assert the selected self-contained build emits and ships its entry without unresolved sibling imports or browser-unresolvable bare imports. In a clean browser with caches disabled, import through the real resource URL and render both a basic diagram and pie/other lazily selected diagram families. Assert SVG output, no code-block fallback, and no failed module requests. Include the split artifact with a deliberately missing sibling as a negative harness case. Check no Mermaid fetch occurs before use.
2. **Containment/platform matrix:** exercise the route on Linux and native Windows, explicitly mixing uppercase root drive and lowercase resolved-file drive (the exact E/e evidence), plus the reverse/matching cases. Test root with and without a trailing separator, paths containing spaces, and a junction installation root. Valid JS inside lib must return 200 with JS MIME. Reject traversal (including encoded and Windows-separator forms), a prefix sibling such as lib-evil, a different drive/share, and an internal symlink/junction targeting outside lib. Permit a link resolving inside the canonical root. Assert missing files return 404 and unsupported methods return 405. Pure win32 path tests help, but cannot replace native realpath/junction integration coverage.
3. **Serving integration:** through the running host's registered route, verify exact module bytes and JavaScript MIME, and perform an actual browser dynamic import plus render. Assert that a 200 HTML fallback or incorrect MIME fails the test. Test the deployed lib-only artifact so accidentally available source-tree files cannot hide omissions.
4. **Event ownership:** mount pane first and open modal afterward; dispatch a cancelable Ctrl+wheel from a nested SVG element. Assert diagram scale changes once and pane font stays unchanged. Repeat with reversed listener registration and applicable capture/bubble arrangements to demonstrate order independence. Close modal and assert pane Ctrl+wheel changes only font. Reopen repeatedly and assert no stacked listeners. Test portal placement, ordinary wheel without Ctrl, modal teardown, and default prevention on owned Ctrl+wheel. Browser integration should cover actual native listeners, not only direct invocation of handler functions.

## Completion and limits

- **Pre-existing:** baseline suite not collected; none was supplied or executed. The three reported incidents are the diagnostic inputs.
- **Completed:** inspected all five fixture files; identified package `@org/dsh-attach-input`, source excerpt version v0.4.0, lib-only deployment, three root-cause/fix directions, and proposed regression cases. No exact DSH migration corridor is supplied, so no version-card migration is asserted.
- **Skipped:** installs, source edits, builds, migrations, live host/browser tests, and Git-wide inspection are outside this read-only evidence task. No tests above are claimed to have passed.
- **Pending/residual risk:** modal listener topology, bundler configuration, packed artifact, complete host source, host version and Git SHA are not provided. They limit implementation verification but do not block this diagnostic report. Windows/Linux runtime validation remains follow-up work.
- **Rollback:** fixture was not modified. Only this report was created under the designated agent-output directory; no runtime rollback is needed.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.