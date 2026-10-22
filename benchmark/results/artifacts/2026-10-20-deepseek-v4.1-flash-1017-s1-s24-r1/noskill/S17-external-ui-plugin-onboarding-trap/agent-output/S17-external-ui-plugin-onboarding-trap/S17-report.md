# S17 — External UI Plugin Onboarding Trap: Root-Cause and Prevention Report

**Mode:** read-only post-incident analysis. The evidence pack under `fixture/` was read only; nothing in it was
executed, edited, or republished. No migrations, installs, or network calls were performed. One finding is marked
**inferred** where the fixture gives behaviour but not the host source.

---

## 0. Evidence index (what each artefact pins down)

| Evidence | Location | What it proves |
| --- | --- | --- |
| Browser failure on first boot | `fixture/browser-error.txt:3` | One error, naming loader entry `0c013085 (@deepseek-ai/dsh-typert-registry)`, whose nested cause is `bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)` |
| Blast radius | `fixture/browser-error.txt:5-7` | Plugin list empty; two previously working stock plugins also gone |
| The offending bundle as written | `fixture/plugin/lib/client.js:1-2, 18-22, 24-29` | Top-level ESM `import` (lines 1-2), module-scope DOM side effect, top-level `export function apply` |
| Profile wiring | `fixture/profile/cordis.patch.yml:1-9` | Three `insert` rows; the new one is `id: dsh-profiles`, `name: '@lhh010/dsh-profiles'` |
| Combo assembly at boot | `fixture/host-boot-log.txt:3` | "composed 53 loader entries into client bundle combo (4.5 MB, classic script)" |
| Second failure | `fixture/plugin-apply-error.txt:3` | `failed to apply loader entry (@lhh010/dsh-profiles): slot "settings.section" is not declared (a parent entry's children table must declare it)` |
| Working packaging shell | `fixture/working-plugin-excerpt.txt:5-19` | `window.__ModuleLoader__.load({ id, factory: (require) => {...} })`, `require("react/jsx-runtime")`, `require("@deepseek-ai/dsh-client-ui-primitives")`, `inject = ["slots"]`, `apply(ctx)`, `return module.exports` |
| Dev loop and EADDRINUSE | `fixture/restart-notes.txt:3-11`, `fixture/host-boot-log.txt:8-13` | Combo assembled once per boot; edits invisible until host restart; orphaned node keeps the port; `taskkill /PID <pid> /T /F` frees it |

Timeline reconstructed from the pack:

1. Boot A: combo composes 53 entries → browser parses the composed script → **syntax error** → 0 of 53 register → user sees "failed to load plugins" naming a stock entry.
2. User repackages only the client bundle → Boot B: combo compiles → 53 entries register → entry apply fails on a slot declaration check → 52 render, 1 fails.
3. Throughout: every edit needs a full host restart; one restart loses the port to an orphaned process tree.

---

## 1. Failure 1 — how one plugin's ESM bundle deregistered all 53 entries

### 1.1 What the host actually assembles, and in what form it reaches the browser

At boot the host resolves the loader entries from the composed cordis patch layer (three `insert` rows here:
`dsh-brand-version`, `dsh-file-trace`, `dsh-profiles` — `fixture/profile/cordis.patch.yml`), and for each entry that
has a **client** half it reads that plugin's client-bundle **file** from disk (served under
`/plugins/<package>/lib/client.js`). It then:

- concatenates the bundle file texts, in entry order, into **one artifact** ("client bundle combo"),
- and serves that artifact to the browser as a **single classic script** — `<script>` without `type="module"`
  (`fixture/host-boot-log.txt:3`: "4.5 MB, classic script").

The browser therefore receives **one** script unit containing 53 registration calls of the shape shown in
`fixture/working-plugin-excerpt.txt:5`:

~~~js
window.__ModuleLoader__.load({ id: "<package name>", factory: (require) => { ... return module.exports } })
~~~

There is no per-entry module graph, no per-entry fetch, and no per-entry error boundary at the browser level. The
registry that the loader later consults (`window.__ModuleLoader__`) is populated **only** by those concatenated calls
executing in order. One file, one parse, one execution — a single failure domain.

### 1.2 Why one bundle takes down every plugin's registration

`fixture/plugin/lib/client.js:1-2` begins with

~~~js
import React from 'react'
import { createPortal } from 'react-dom'
~~~

and line 24 uses `export function apply(ctx)` — both are **ES module only** syntax. A classic script cannot contain a
top-level `import`/`export`; it is an **early (parse-time) SyntaxError** ("Cannot use import statement outside a
module"). Two consequences matter:

1. **It is not a runtime error inside one entry, it is a compile error of the whole unit.** V8/SpiderMonkey follow the
   HTML "prepare a script" algorithm: parse first, execute only if parsing succeeded. A syntax error means the script
   is never executed at all — not partially, not up to the bad line. Every other entry's `__ModuleLoader__.load(...)`
   call in the same file is dead code.
2. **The registry is therefore empty, not half-full.** `0 of 53` entries exist when the loader asks for them, so the
   failure surfaces as a global "Failed to load plugins", and *stock, previously working plugins disappear too*. The
   blast radius (all entries, including plugins whose files are untouched) is the signature of a combo-level failure
   and is the single most valuable diagnostic signal in this incident.

The error position is also a fingerprint: `position 1:1` is the first character of `fixture/plugin/lib/client.js` —
exactly where the illegal `import` begins.

### 1.3 Why the message names `@deepseek-ai/dsh-typert-registry` even though that entry is innocent

The loader registers entries in a fixed order and imports them one by one, typically awaiting them sequentially or at
least reporting the *first* rejection it hits. The composed script never executes, so *every* entry import fails;
the loader wraps the first failure it observes as

> `failed to import loader entry 0c013085 (@deepseek-ai/dsh-typert-registry): <cause>`

`0c013085` is a content/entry hash, not a byte offset into the bad file, and `dsh-typert-registry` is simply the
entry at the head of the loader's ordered list for this profile (a stock host package the user never touched). The
message is therefore a **locus-of-observation** report, not a locus-of-fault report:

- Outer layer = "the first entry I was awaiting failed" → wrong attribution.
- Inner layer (`client-modules: bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)`) =
  the actual culprit, with the actual file and the actual offset.

Three independent proofs that `dsh-typert-registry` is innocent: (a) it is unmodified stock code and worked on the
previous boot; (b) its own bundle is not the one named in the nested cause; (c) if it were broken, the failure would
be scoped to that entry, whereas here the *entire* plugin list and other stock plugins vanished — impossible for a
per-entry failure, mandatory for a combo-parse failure.

**Inferred detail (not pinned by the fixture):** whether the loader's first-rejection wrapper or the client's
`Promise.all` ordering decides which entry is named. Either way the named entry is the *first awaited* one, which is
why the name changes if you add or remove the head of the entry list — a useful confirmation test, and a trap if you
read it as a dependency.

---

## 2. Diagnosis discipline — from the misleading error to the culprit

### 2.1 Triage by symptom shape before touching code

| Symptom | Failure class | Where to look |
| --- | --- | --- |
| *All* entries gone, one "failed to import loader entry X" | combo-level (parse/serve) | the nested cause; the bundles' syntax; the served combo |
| *One* entry gone, others fine, error arrives during apply | entry-level | that entry's `apply`, its slot names, its descriptor |
| Entry loads but renders nothing | slot/registration accepted but not declared/rendered | declared slot tree |

The rule: **never start from the named entry — start from the blast radius.** "Two stock plugins that worked before
are also missing" rules out a plugin bug and points at the shared artifact.

### 2.2 Read the error as a chain, innermost first

The message has a cause chain. The outer sentence answers "who did I try to import", the inner one answers "what
failed, where". Read right-to-left: file path → `position 1:1` → open that file at 1:1 → see `import`.

### 2.3 What to bisect, and what not to

Do **not** bisect plugin *code*: the parse error is binary (a bundle either compiles or it does not) and any
half-disabled edit still leaves the combo broken, producing identical "failed to import entry <head>" noise. Bisect
the **combo input list**, i.e. the `insert` rows in the profile's `cordis.patch.yml`:

1. Halve the `insert` rows (or move groups behind a comment), restart the host, reload.
2. If the error persists with a *different* named entry, the culprit is still in the remaining half — the name is
   worthless, the *presence* of the failure is the signal.
3. When the combo finally compiles, the last removed half contained the culprit; recurse.
4. Confirm positively instead of by elimination: with all entries restored, run the static compile check over every
   bundle (2.4). A parse check is O(entries) and takes milliseconds, versus O(log n) full host restarts.

Cost note for this repo's shape: each bisection step costs a host restart plus a hard refresh (`restart-notes.txt:9-11`),
so the static gate below must come first — it would have finished the investigation before the first restart.

### 2.4 The cheap static check that flags this bundle instantly

A classic-script *parse* without execution is exactly what `new Function` (or `vm.Script`) does. It needs no DOM, no
network, no host boot:

~~~js
// agent-output/.../check-client-bundles.mjs  (run per plugin, read-only)
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const files = process.argv.slice(2)
let bad = 0
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  try {
    new vm.Script(src, { filename: f })   // classic-script parse, executes nothing
  } catch (e) {
    bad++
    console.log(`FAIL ${f}: ${e.name}: ${e.message}`)  // -> SyntaxError: Cannot use import statement outside a module
    continue
  }
  if (!/^\s*window\.__ModuleLoader__\.load\(/.test(src)) {
    bad++
    console.log(`FAIL ${f}: not a ModuleLoader registration (missing window.__ModuleLoader__.load wrapper)`)
  }
}
process.exit(bad ? 1 : 0)
~~~

Equivalent one-liners for a quick triage:

- `node --check path/to/lib/client.js` → `SyntaxError: Cannot use import statement outside a module` (Node parses a
  bare `.js` as CommonJS unless the nearest `package.json` says `type: module`).
- `Select-String -Path .\lib\client.js -Pattern '^\s*(import|export)\s|import\.meta'` → a hit on a client bundle is
  almost always the bug.
- `node -e "require('node:vm').compileFunction(require('node:fs').readFileSync(process.argv[1],'utf8'))" lib/client.js`
  — the same check without writing a file.

The matching *positive* check is equally cheap and catches the mirror-image mistake (shipping ESM that the host
happens to tolerate, or forgetting the wrapper):

- first non-comment token is `window.__ModuleLoader__.load({`;
- `id` equals the package name in `package.json` (here `@lhh010/dsh-profiles`);
- every `require("...")` argument is a host-provided shared module (`react`, `react-dom`, `react/jsx-runtime`,
  `@deepseek-ai/dsh-client-ui-primitives`, and the profile's allow-list) — never a bare package the browser cannot
  resolve;
- no top-level side effects (no `document`, `window.addEventListener`, timers, fetches) outside `apply`;
- the factory returns `module.exports` and that object exposes `apply`.

### 2.5 The client-bundle format an external plugin must ship

An external plugin's `lib/client.js` must be a **classic script whose top-level statement is a ModuleLoader
registration**, not an ES module. Shape (contrast with the working excerpt at
`fixture/working-plugin-excerpt.txt:5-19`):

~~~js
window.__ModuleLoader__.load({
  id: "@lhh010/dsh-profiles",                 // MUST equal the loader entry's package name
  factory: (require) => {                      // called lazily by the host loader
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    // React is NOT imported and NOT bundled: it is obtained from the loader's require(),
    // which hands back the host's single shared instance (same for react-dom, jsx-runtime, primitives).
    const React = require("react");
    const { jsx } = require("react/jsx-runtime");
    const { /* ... */ } = require("@deepseek-ai/dsh-client-ui-primitives");

    function ProfilesSection() { /* ... */ }

    const inject = ["slots"];                  // dependency declaration, resolved before apply

    function apply(ctx) {
      // contribution form — see section 3.4/3.5
      const dispose = ctx.slots.register({
        name: "settings.section",              // target slot, declared by the owning/parent entry
        id: "profiles-manager",
        order: 5,
        component: ProfilesSection,
      });
      if (typeof ctx.effect === "function") ctx.effect(() => () => dispose?.());
    }

    exports.inject = inject;                   // what the wrapper must export
    exports.apply = apply;                     // what the wrapper must export (entry point)
    return module.exports;                     // factory returns the module object
  },
});
~~~

Contract, in one line each:

- **What wraps it:** the `window.__ModuleLoader__.load({ id, factory })` call. It is the only legal top-level code.
- **How React is obtained:** `require("react")` / `require("react/jsx-runtime")` / `require("react-dom")` from the
  injected `require`, so the plugin shares the host's single React instance (hooks, context, portals all need that
  identity). React must be `external` in the build and never inlined.
- **What the wrapper must export:** on the returned `module.exports`, an `apply(ctx)` function and the `inject`
  list (`["slots"]` here); `Symbol.toStringTag = "Module"` keeps interop metadata sane. The factory must
  `return module.exports`.
- **What it must not contain:** top-level `import`/`export`, `import.meta`, top-level `await`, top-level DOM
  side effects, or a bundled React.

For authors who write ESM/JSX sources, that shape is a **build output**, not a source format: an esbuild/tsc pass with
`format: "cjs"`-plus-a-committed-banner emitter, `external: ["react", "react-dom", "react/jsx-runtime",
"@deepseek-ai/dsh-client-ui-primitives"]`, and a post-build gate (2.4) that re-parses the artefact as a classic
script. Hand-written `lib/client.js` must be authored in the wrapper shape from line 1.

### 2.6 Two extra defects in the same file (worth naming, they are latent incidents)

`fixture/plugin/lib/client.js:18-22` runs at **module-evaluation time**, i.e. inside the combo, for every page:

- `document.createElement` / `document.body.appendChild` execute before any entry is applied, so the plugin mutates
  the page even if `apply` never succeeds; it also makes the bundle headless/SSR-hostile.
- `createPortal(...)` is called **outside** a React render (its return value is discarded on line 22). `createPortal`
  is only meaningful while rendering into a container managed by a React root; called at module scope it produces
  nothing useful and leaks a detached container that is never unmounted.
- The container is also appended outside the slot tree, so it can never be unmounted by the framework, and a reload
  would stack duplicates.

Correct placement: create DOM/portals inside the component (or a `useEffect`), render into the slot the host gives
you, and do all work inside `apply`.

---

## 3. Failure 2 — `slot "settings.section" is not declared (a parent entry's children table must declare it)`

### 3.1 What the message says

At apply time the loader validates the slot operation against the **composed slot tree**. The tree is built from
*declarations*: each entry owns a node with a name, structural fields (`kind`, `scope`), and a **children table**
mapping child slot names to their declarations. Registration may only attach to a child slot that already appears in
some parent entry's children table. `settings.section` appeared in **no** children table at the moment
`apply()` ran, so the operation is rejected — and because `apply` is the entry's whole setup, the entry is reported
as failed to apply.

Key distinction the error encodes: **registration is a contribution, not a declaration.** The message names the
missing *declaration* and tells you where declarations live (a parent entry's children table) — it is telling you the
call supplied a slot definition instead of a contribution to someone else's slot.

### 3.2 Who declares slots

The **owning entry** — the plugin/entry that renders the region and therefore controls its layout. A settings shell
entry declares something like a `settings` node with `kind: "section"`-ish structure and a children table listing
`settings.section` (and possibly per-section variants). That declaration is part of the entry's own slot tree and is
applied when *that* entry applies. External plugins never declare slots owned by other entries; they only contribute
children into a slot that is already declared, and they are responsible for using the *exact declared name* (a typo
like `settings.section` for a declared `settings.sections` produces this identical error — always confirm the name
against the live tree, e.g. the client Slots inspect tree or the host's declared-slot dump, before changing the code).

### 3.3 Why a bare registration of another entry's slot fails at apply time (and not at import time)

Three ordering facts stack up:

1. **Import ≠ apply.** In Failure 1 the bundle could not compile, so nothing was imported. Here the bundle compiles,
   so all 53 imports succeed; the failure moves to the per-entry `apply` phase. This is why the blast radius shrinks
   from 53 to 1 — a useful confirmation that the packaging fix worked and only the API contract is still wrong.
2. **The tree is validated when the operation executes, not when the module is parsed.** `apply(ctx)` runs against
   the slot service that has been composed so far; the service checks its declared children tables and throws.
3. **Declaration order is part of the contract.** A parent's declaration must be applied *before* a child's
   registration. The loader applies entries in loader order / dependency order; an entry that registers a slot whose
   declaring entry applies later in the same boot fails with the same message even though the name is correct. So the
   registration must be expressed as a *child declaration under the parent's children table* (the wrapper in 3.4),
   which the composition can resolve, rather than as an independent top-level claim that races the parent.

Because the throw happens inside `apply`, the host attributes it to the entry (`failed to apply loader entry
(@lhh010/dsh-profiles)`) and the other 52 entries render normally.

### 3.4 The exact wrapping form

The registration must be wrapped as a **child contribution inside the parent entry's children table**, with the
component carried *inside* the child descriptor (never as a second positional argument, never as a sibling
declaration):

~~~js
function apply(ctx) {
  const dispose = ctx.slots.register({
    // outer half: WHERE the contribution lands — a child slot already declared by the parent entry
    parent: "settings",                                  // the declaring entry's id
    children: {
      "settings.section": {                              // MUST already exist in that parent's children table
        // inner half: WHAT is contributed — identity, ordering, and the component itself
        id: "profiles-manager",
        order: 5,
        component: ProfilesSection,
      },
    },
  });
  if (typeof ctx.effect === "function") ctx.effect(() => () => dispose?.());
}
~~~

Equivalently, on hosts whose slot service exposes the flattened builder, the same thing expressed as a single
targeted descriptor — the invariant is identical, only the spelling differs:

~~~js
ctx.slots.register(
  { slot: "settings.section", id: "profiles-manager", order: 5 },  // target + own identity
  { component: ProfilesSection },                                   // contribution wrapper
);
~~~

The rule to remember: **you may only name a slot that a parent entry has already declared; you supply a child entry
inside that parent's children table, and the component lives in that child entry.** What the broken code did instead
(`fixture/plugin/lib/client.js:24-29`) was pass a *declaration-looking descriptor*
(`name` + `kind` + `scope`) plus a bare component, with no parent and no children table — i.e. it tried to define
`settings.section` rather than fill it.

### 3.5 Which fields a registrant may pass, and which it must not

| Field | Registrant | Why |
| --- | --- | --- |
| `id` | **may / should** | stable child identity used for dedupe, ordering ties, reload/unmount; must be unique within the slot |
| `order` | **may** | placement hint among siblings; purely local to the parent's slot |
| `component` (or the render function) | **must** | this *is* the contribution |
| optional props / render context for that component | **may** | consumed only by your own component |
| slot name (`name` / `slot`) | **may, as a target only** | it must match an already-declared child slot; it never creates one |
| `kind` | **must not** | structural classification owned by the declaration (section/panel/…) — the parent decides what `settings.section` *is* |
| `scope` | **must not** | ownership/namespace of the declaration, not of the consumer |
| `children` | **must not** (unless you are declaring an owned slot) | children tables belong to the entry that owns the node; a consumer adding children would be mutating another entry's structure |
| invented `declaredBy`/`parent` pointing at yourself | **must not** | the parent link must name the real declaring entry; self-parenting is exactly what produced the "not declared" error |

Cleanup is part of the contract too: `register` returns a disposer; wire it into `ctx.effect`/the entry's dispose so a
reload or HMR pass does not leave a duplicate child (duplicate `id` is the next failure you would otherwise hit).

---

## 4. Dev-loop discipline — why edits are invisible, and the Windows restart

### 4.1 Why the client bundle combo is not rebuilt when plugin files change

The combo is a **boot-time artefact**: the host enumerates entries, reads each client bundle file, concatenates, and
serves the result (`host-boot-log.txt:3`, "composed 53 loader entries ... once per boot"). After boot the bytes are
fixed in the host's response (and the browser's HTTP cache). Nothing watches plugin `lib/client.js` files; there is no
module graph in the browser to invalidate, and a hard refresh only re-downloads *the same composed bytes*. That is
why `restart-notes.txt:5-7` observes "no effect in the browser, even after a hard refresh, until the host process is
stopped and started again". Editing a plugin file changes a file on disk that the running host will never read again.

Corollary for diagnosis: **a browser reload is not a test**; the only test is "restart host → reload browser → read
the plugin list". Treat every iteration as costing one full boot, and spend the cheap static checks (2.4) first.

### 4.2 Correct restart procedure (Windows)

1. Stop the host **from its own foreground terminal** with `Ctrl+C` and wait for the process to exit and for the
   shell prompt to return — do not close the window (see 4.3).
2. Verify the port is actually released:
   `Get-NetTCPConnection -LocalPort 3080 -State Listen` (or `netstat -ano | findstr :3080`) → must be empty.
3. Start the host again; wait for the "web profile ready" line — that line *is* the signal that a new combo was
   composed (watch for the "composed N loader entries" line and check N is what you expect).
4. Hard refresh the browser (`Ctrl+Shift+R`, or DevTools "Disable cache" + reload) so the combo asset is not served
   from cache.
5. Check **Settings → Plugins → Plugin list**: any count other than the expected entry count means the combo failed
   again; an empty list means a global (parse) failure, i.e. back to section 2.1's first row.
6. Only then judge the edit.

### 4.3 Why EADDRINUSE survived closing the terminal, and why `/T` fixed it

Closing the launching console window is not a process-tree kill on Windows. The window close raises
`CTRL_CLOSE_EVENT` and gives the console process a short grace period; the node host is a child of that shell (and may
itself have spawned children, e.g. a host worker/server child). If the shell exits first, or the child outlives the
grace window, or the child was started detached / with `windowsHide`, the node process keeps running and keeps the
**listening socket** — and a socket handle inherited by a grandchild can keep the port bound even after the parent is
gone. Windows has no default group-kill semantics, so `Stop-Process` on the parent PID can leave exactly this state.

Then the next boot fails with `EADDRINUSE` because the port is still held by an orphan whose PID you no longer have in
front of you. The recovery is to find the *owner of the port*, not the PID you remember:

~~~powershell
# owner of the listening socket
Get-NetTCPConnection -LocalPort 3080 -State Listen | Select-Object OwningProcess
# graceful first
Stop-Process -Id <pid>
# if the port is still held (orphan or handle inherited by a child): recursive kill
taskkill /PID <pid> /T /F
# verify before restarting
Get-NetTCPConnection -LocalPort 3080 -State Listen
~~~

`/T` terminates the whole tree (the leftover worker children), `/F` forces it — matching
`restart-notes.txt:9-11`. Prevention on the dev side: always stop with `Ctrl+C` in the owning terminal, never launch a
second host "just to check", and if a launch reports EADDRINUSE, resolve the port owner *before* retrying (otherwise
you end up with two half-started hosts and an even more confusing plugin list).

---

## 5. Prevention

### 5.1 Host: make the boot fail loudly, per entry, before composing

1. **Per-entry compile gate at boot.** Before concatenating, parse each client bundle independently with
   `new vm.Script(src)` (or the bundler's `transform` in check mode). On failure: **exclude that entry from the
   combo**, log `[client-modules] skipped entry <patch id> (<package>): <file>:<line>:<col> <SyntaxError message>`,
   and continue. 52 entries then load, the browser shows 52, and the message names the right package. Fail-closed on
   the *entry*, not on the *combo*.
2. **Enforce the contract at install/lint time.** A `dsh plugin check <pkg>` (or boot `--strict-client`) that asserts:
   classic-script parse; top-level statement is `__ModuleLoader__.load`; `id` equals the package name; every
   `require()` target is a host-provided module; no top-level DOM/timer/network side effects; `apply` exported;
   `package.json` `files`/`exports` actually ship `lib/client.js`; patch `insert` ids are unique.
3. **Kill the ambiguity in the artefact.** Either emit **one `<script>` per entry** (then a parse error only kills
   that entry and the browser names the right URL), or keep one file but prepend a byte-range map
   (`/*# entry: <id> <package> <start>-<end> */`) so a reported `(line, col)` can be mapped back to an entry.
   Never concatenate untrusted third-party bundles into a single un-attributed parse unit.
4. **Pick one module contract and enforce it.** If ESM is the intended authoring format, serve `type="module"` +
   import map and reject CJS-only bundles; if classic-script registration is the contract (as the evidence shows),
   reject ESM at the door with a message that says exactly that.

### 5.2 Host: attribute combo failures correctly

- **Distinguish error classes** in the loader: `ENTRY_IMPORT_FAILED` (one entry) vs `COMBO_COMPILE_FAILED` (the shared
  artefact). For the latter, never print "failed to import loader entry <first awaited id>"; print "client bundle
  combo failed to compile at <file>:<line>:<col>; 0 of 53 entries registered".
- **Report consequences, not causes, as consequences.** A line like "entry 0c013085 (typert-registry) could not be
  imported" is acceptable *only* if paired with "cause: profiles bundle compile error" and a "this is the first awaited
  entry, not necessarily the faulty one" hint.
- **Host-side bisect on demand.** On a reported combo failure the host already has every bundle on disk: compile each
  one, list the failures, and return them to the client error surface (or log them) — turning a 30-minute bisect into
  one boot.
- **Use `Promise.allSettled` when importing entries** and surface "N of M registered", so one rejection cannot mask
  the rest and the count itself is diagnostic.
- Keep a per-entry mapping of the *served* URL ↔ patch id ↔ package name ↔ file path, and print it on failure.

### 5.3 Host: make slot errors actionable

- On an apply-time slot failure, dump the **declared slot tree** (names + declaring entry + kind/scope) and say which
  name was requested. "not declared" without the list is a riddle.
- Suggest the nearest declared name (edit distance) — this catches the `settings.section` vs `settings.sections` class
  of typo, and catches "you invented a slot" immediately.
- Reject declaration-shaped fields (`kind`, `scope`, `children`) in a *contribution* call with an explicit message
  ("kind/scope are owned by the declaring entry; drop them"), instead of letting them through to a confusing
  "not declared" error.
- Validate slot names at *build/install* time by dry-running `apply` against a stub `ctx` whose slot service knows only
  the declared tree — this moves the failure from a boot to a lint run.

### 5.4 Host/dev-loop: make the restart discipline unnecessary (or obvious)

- Watch plugin client bundles and rebuild the combo + trigger a client reload when they change (the HMR path), or, at
  minimum, log "client bundle combo is stale — restart required" the moment a watched file changes.
- Expose an explicit, documented dev command (e.g. `dsh web --reload-combo` / a dev endpoint) instead of asking people
  to guess when a restart is needed.
- On Windows: single-instance lock on the port with a clear "another host (pid N) holds 3080 — run `taskkill /PID N /T
  /F`" message; graceful shutdown that terminates the process tree; and `--force-port` / `--port` guidance in the
  EADDRINUSE message itself.

### 5.5 Authoring-side: template + checklist

Template repository (`create-dsh-plugin` / `dsh-plugin-template`) that makes the correct shape the default:

~~~
package.json            name, "dsh": { "client": "lib/client.js" }, files: ["lib"], scripts: { build, check, test }
src/client.tsx          normal ESM/JSX SOURCE (never served)
build.mjs               esbuild: bundle, format=cjs-ish, external react/react-dom/*/primitives,
                        post-build: wrap in window.__ModuleLoader__.load({...}) + banner
lib/client.js           GENERATED, committed, classic script  <-- the only thing served
scripts/check.mjs       the static gate from 2.4 (parse + wrapper + require allow-list + no top-level effects)
test/apply.test.mjs     loads lib/client.js in a VM with a stub require + stub ctx, asserts apply() registers
                        exactly one child into the declared slot tree and returns a disposer
~~~

Checklist for the next onboarding (print it in the README and in the failure message):

1. `lib/client.js` is a **classic script**; no top-level `import`/`export`/`import.meta` (verified by
   `new vm.Script`).
2. First statement is `window.__ModuleLoader__.load({ id, factory })`; `id` === package name.
3. React comes from `require("react")` / `require("react/jsx-runtime")`; React is `external` in the build; no bundled copy.
4. `require()` is used only for host-provided modules; no bare browser-unresolvable specifiers.
5. No top-level side effects: DOM, timers, fetch, storage, `createPortal` all live inside components/`apply`.
6. Factory returns `module.exports`; exports expose `apply` (and `inject = ["slots"]` when slots are used).
7. Slot registration is a **contribution**: name an already-declared child slot, pass `id`/`order`/`component`,
   drop `kind`/`scope`/`children`; confirm the exact declared name.
8. Registration is created inside `apply` and its disposer is wired to entry teardown (no duplicates on reload).
9. Patch row added once (`insert` with unique `id`), package linked into the web profile's `node_modules`.
10. Iterate: static check → restart host (Ctrl+C, port free) → hard refresh → plugin list count.
11. If a boot reports EADDRINUSE: find the port owner, `taskkill /PID <pid> /T /F`, verify, then start.
12. If the browser names an entry you did not touch: read the nested cause and re-check the combo, not that entry.

---

## 6. Attribution summary

| Failure | Layer | Root cause | Corrective |
| --- | --- | --- | --- |
| 1. Browser "failed to load plugins", names a stock entry | boot/assemble + browser parse | the client bundle is bare ESM (top-level `import`/`export`) inside a **single concatenated classic script**; the parse error kills the whole unit, so 0/53 entries register; the loader reports the **first awaited entry** | ship the `__ModuleLoader__.load` classic-script wrapper, React via `require`, `apply` exported; gate it with a `vm.Script` parse at build/boot; on the host, isolate and attribute per entry |
| 2. "slot settings.section is not declared" | apply/slot tree | a **declaration-shaped** descriptor (`name/kind/scope`) used where a **contribution** was required, with no parent children-table link | register inside the declaring parent's children table with `id`/`order`/`component`; drop `kind`/`scope`; verify the declared name |
| 3. Edits need a restart | dev loop | combo is composed **once at boot**; no watcher, no client-side module graph | restart host → hard refresh → check plugin list; improve with combo watch/reload |
| 4. EADDRINUSE, only `/T /F` helped | Windows process lifecycle | closing the console does not kill the node child tree; an orphan keeps the listening socket | `Ctrl+C` in the owning terminal; resolve port owner; `taskkill /PID <pid> /T /F`; add a single-instance guard |

**One-line lesson:** a browser plugin list is an all-or-nothing artefact of a boot-time concatenation, so a single
syntax error is reported as the *first awaited entry*; attribution must run from the blast radius and the nested
cause inward, and both the host (per-entry compile gate, one script per entry, slot-tree diagnostics) and the author
(one canonical wrapper, one static gate, one restart script) should make the correct path the easy one.
