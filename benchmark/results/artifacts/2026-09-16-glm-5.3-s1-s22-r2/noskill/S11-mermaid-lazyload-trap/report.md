# S11 · Mermaid Lazy-Load Trap — Diagnosis Report

Task: read-only analysis of the three rollout incidents in `@org/dsh-attach-input`'s lazily
imported mermaid chunk. Evidence: `chunk-route.ts`, `console-split-chunks.txt`,
`console-403-windows.txt`, `ci-note.md` (fixture, unmodified).

---

## 1. Incident 1 — why the split-chunk approach failed

**Evidence.** `console-split-chunks.txt`: the entry `mermaid-chunk.js` loads (200, 8.1 kB —
far too small for mermaid), then 404s on `src-BfvxrPJe.js`, `pie-WAS4IAKB-CQHCQWWM.js`, and
the note "the sibling files … were NOT shipped with the package".

**Mechanism.** When a bundler (Rollup/Vite/webpack) code-splits a dynamically imported entry,
the emitted entry chunk is not self-contained: it contains *static imports* (import statements
or import-module-preload fetches) of sibling chunk files whose URLs are **relative to the entry
chunk's own URL**. The browser's module loader resolves and fetches every sibling before the
dynamic `import()` promise can settle. So a "lazy chunk" is really a *chunk graph*: shipping
(or serving) only the entry file guarantees failure — the entry 200s, each sibling 404s, and the
whole `import()` rejects with "Failed to fetch dynamically imported module" pointing at the
*entry* URL, which is misleading. The lib-only package shipped only the file the author named,
so 97 dependency chunks were never delivered, and no server-side fix can serve files that were
never shipped.

**Build-side fix.** Make the chunk graph a single node: bundle the mermaid entry with code
splitting *disabled* so the output is one self-contained file —

- Rollup/`tsdown`: `output.inlineDynamicImports = true` (single-entry precondition: one entry,
  no manual chunk splitting for this output);
- or equivalently one output file with all dynamic imports inlined (`preserveModules = false`,
  no `manualChunks`): one file, zero sibling module specifiers.

(Alternative, not chosen here: keep splitting and ship + serve the *entire* emitted asset
directory including the content-hashed names. That couples the host route to bundler hash
naming and packaging completeness; the single-file chunk is the robust choice for a lib-only
plugin served from a fixed prefix.)

## 2. Incident 2 — the exact containment-guard flaw (403 on Windows)

**Evidence.** `ci-note.md` production debug print:

    LIB_DIR   = "E:\\dsh\\profiles\\web\\node_modules\\@org\\dsh-attach-input\\lib"
    realpath  = "e:\\dsh\\profiles\\web\\node_modules\\@org\\dsh-attach-input\\lib\\mermaid-chunk.js"

The route log shows the *second* guard fired: the `realpathSync` re-check.

**Mechanism, precisely.** The guard does
`normalize(realpathSync(abs)).startsWith(LIB_DIR + sep)` — a **case-sensitive string prefix
test**. The two operands come from different APIs with different canonicalization rules:

- `LIB_DIR` comes from `fileURLToPath(new URL('.', import.meta.url))` + `normalize`. It
  inherits the drive-letter case baked into the module URL, here uppercase `E:\`.
- `fs.realpathSync` on Windows resolves through the filesystem and returns the
  **operating-system-reported canonical casing of every path component, including the drive
  letter**. On this Windows Server 2022 host the OS reports the volume as lowercase `e:\`,
  so realpath returns `e:\dsh\…` even though the input string was `E:\dsh\…`.

On Linux neither the drive letter nor any component case changes for an existing case-exact
path, so `startsWith` succeeds and CI is green. On the maintainer's laptop the toolchain
happened to build `LIB_DIR` with the casing realpath reported, so it passed by accident. On
production the one-character case difference (`E:\` vs `e:\`) makes
`"e:\dsh\…".startsWith("E:\dsh\…")` false → 403 "path escapes the plugin lib" for a path
plainly inside the directory. Windows path *comparisons* are unreliable, not Windows paths.

(The first guard has a latent instance of the same bug: it compares `normalize(join(...))` —
input casing — against `LIB_DIR` and would also break if the URL-decoded request ever
carried different case; the realpath guard is just where it detonates here.)

## 3. Fix direction for the guard + the other serving requirement

**Fix.** Canonicalize *both* sides through the same API, then compare path components rather
than raw string prefixes, with case-insensitivity on win32:

    const REAL_LIB = realpathSync(LIB_DIR)   // canonicalize the root once, same API as the file
    const isWin = process.platform === 'win32'
    const norm = (p) => (isWin ? p.toLowerCase() : p)
    const rel = relative(REAL_LIB, normalize(realpathSync(abs)))
    const escapes = rel === '' || rel.startsWith('..') || isAbsolute(rel)

Why robust on both platforms: both operands pass through `realpathSync`, so drive-letter and
component casing come from the same source (the OS) and agree by construction; `path.relative`
plus the `'..'` / absolute / empty checks implement containment structurally instead of by
prefix coincidence; lowercasing both sides on win32 absorbs any residual case difference (NTFS
is case-insensitive, so case can never carry security meaning there), while POSIX keeps
exact-case comparison where it *is* meaningful. Computing `realpath` of `LIB_DIR` once also
survives symlinked `node_modules` (pnpm-style layouts), where `LIB_DIR` itself may be a link.

**Other serving requirement.** The chunk URL must be served with the correct JavaScript MIME
type — `application/javascript` (the route already sets it; without it the browser refuses the
module: dynamic `import()` enforces strict MIME checking, unlike classic `<script>`).
Equally critical in the split-chunk world of incident 1: sibling URLs must resolve relative to
the served chunk URL, so the route's URL namespace must mirror the on-disk layout under the
prefix.

## 4. Incident 3 — why both handlers fire on one Ctrl+scroll

**Mechanism.** The modal's zoom handler and the pane's font-size handler are both registered as
`wheel` listeners (on `window`/`document` or ancestors in the bubble path) without ownership
arbitration. DOM `wheel` events **bubble** and do not stop propagating on their own: a
Ctrl+wheel over the fullscreen modal targets the diagram element, then propagates up through
every ancestor listener — modal handler and pane handler both run, in registration/depth order,
so the diagram zooms *and* the pane font resizes simultaneously. Neither handler calls
`preventDefault()`/`stopPropagation()`, and neither checks whether an overlay currently owns
the interaction.

**Ownership rule.** Exactly one handler owns a given user interaction at a time: the
topmost/fullscreen overlay that modally covers the pane owns wheel input while it is open.
Concretely, the modal registers its wheel listener (capture phase on the overlay root) and, on
Ctrl+wheel, calls `event.preventDefault()` and `event.stopPropagation()`
(`stopImmediatePropagation()` if sibling listeners share the node); defensively, the pane's
font handler must also ignore any wheel event whose `composedPath()` crosses an open overlay
(or check a single "modal open" state flag). When the modal closes, its listener is disposed
(`ctx.effect`) and ownership returns to the pane.

## 5. Regression tests that would have caught each incident

**Incident 1 — bundle self-containment test (build artifact gate):** after building the plugin,
load the emitted `mermaid-chunk.js` source and assert it contains no unresolved sibling
module specifiers: parse static/dynamic import specifiers (regex over `import ... from "./..."` /
`import("./...")` / import-module-preload fetches) and assert the set is empty (single-file
build) — or, if splitting is ever re-enabled, assert every referenced filename exists in the
shipped `lib/` and is reachable under the route prefix. Fails today with the 97 unshipped
siblings.

**Incident 2 — route guard platform tests:** unit-test the handler with a stubbed
`realpathSync` that returns a **case-differing drive letter** (`e:\…` for an `E:\…` root) —
exactly the Windows Server behavior — and assert the response is 200; plus traversal fixtures
(`..\..` segments, encoded `%2e%2e`, absolute `E:\other` inputs, symlink escape) asserting
403/404. Also run the symmetric-realpath / `relative()` guard against a pnpm-style
symlinked `LIB_DIR`. The case-fixture fails on the old `startsWith` guard and passes on the
fixed one, on both Linux CI and Windows.

**Incident 3 — wheel ownership test:** DOM-level test that mounts the pane (with a wheel spy on
its font-size handler) and the modal, dispatches a synthetic Ctrl+`wheel` event on the diagram
inside the open modal, and asserts (a) `preventDefault` was called, (b) the pane's handler spy
was **not** invoked (`stopPropagation` proven), and (c) after the modal closes, the same event
does reach the pane handler. A second case dispatches outside the modal and asserts only the
pane handler fires.

---

### Summary table

| Incident | Root cause | Fix |
|---|---|---|
| 1 · sibling 404s | code-split entry chunk imports sibling chunks by relative URL; only the entry was shipped; `import()` needs the whole graph | disable code splitting: `inlineDynamicImports` → one self-contained chunk |
| 2 · 403 on Windows | case-sensitive `startsWith` guard compares `import.meta.url`-derived casing (`E:\`) against `realpathSync`'s OS-canonical casing (`e:\`); Linux never rewrites case | realpath *both* sides once, `relative()`-based containment, lowercase compare on win32 |
| 3 · double zoom | bubbling `wheel` reaches both modal and pane listeners; no ownership arbitration | one interaction, one owner: overlay consumes and stops propagation while open; pane ignores events crossing an overlay |
