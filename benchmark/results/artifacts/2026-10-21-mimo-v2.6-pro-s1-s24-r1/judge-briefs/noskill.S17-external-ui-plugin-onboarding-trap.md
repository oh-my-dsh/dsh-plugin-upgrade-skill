# JUDGE BRIEF · noskill.S17-external-ui-plugin-onboarding-trap

## Criteria (sealed rubric)
- [whole-combo-attribution] (20pt) Connect plugin/lib/client.js’s top-level ESM import with host-boot-log.txt’s classic-script combo and browser-error.txt’s compile failure: one syntax error prevents the whole combo compiling, so no entries register. The named stock typert-registry entry is the first awaited victim, not the faulty bundle. Do not infer that raw ESM is invalid in every JavaScript loading context.
- [diagnosis-and-packaging] (20pt) Bisect the profile insert rows to isolate the offending bundle and parse it as a classic script (vm.Script or equivalent; node --check alone can accept ESM and is insufficient). Describe a host ModuleLoader.load({id, factory}) bundle, package-name identity, host-provided React through require inside the factory, and inject/apply exports. Equivalent variable names and wrapper implementations are valid; do not require exact formatting or the elided bodies in working-plugin-excerpt.txt.
- [cross-entry-slot-registration] (20pt) Use plugin-apply-error.txt and the bare settings.section registration to explain that another entry owns the declaration and apply ordering is not guaranteed. Show or precisely describe ctx.slots.inject("settings.section", () => ctx.slots.register(...)) so registration waits for the declaration. Registrants supply name/id/order (optional label), not declaration-owned kind/scope. A block callback returning the registration or equivalent supported deferred form is valid; a bare mention of slots.inject is insufficient.
- [boot-restart-discipline] (20pt) Use host-boot-log.txt/restart-notes.txt: this host assembles the combo once at boot, so file edits and browser refresh do not rebuild it. Fully stop/restart the host for each iteration, kill the old Windows process tree if it retains the port (taskkill /PID <pid> /T /F or equivalent), then refresh and verify plugin registration. Explain EADDRINUSE as the old process retaining the port, not a new plugin packaging defect.
- [host-and-author-prevention] (20pt) Propose per-plugin classic-script validation and culprit attribution at startup/combo failure instead of blaming the first awaited entry. Give an authoring template/checklist covering loader factory, host React and inject/apply, deferred cross-entry slots, and host restart/Windows tree cleanup. A generic “add tests” or card list without these prevention measures is incomplete.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [contradictory-operational-advice] ceiling=0 The report recommends keeping bare top-level ESM in this classic combo, omitting/removing slots.inject in favor of immediate cross-entry registration, setting kind/scope on the registrant, or relying on HMR/browser refresh instead of the required host restart. These contradict the central incident contracts. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.

## Candidate report(s)
#### FILE: report.md

# S17 · The External UI Plugin Onboarding Trap — Incident Report

Scope: analysis of the read-only evidence pack under `fixture/` (browser-error.txt,
host-boot-log.txt, plugin-apply-error.txt, restart-notes.txt, working-plugin-excerpt.txt,
plugin/lib/client.js, profile/cordis.patch.yml). All claims below are grounded in those
files; the fixture was only read/scanned, never modified.

---

## 1. Failure 1 root cause — one ESM bundle took down EVERY plugin's registration

**What the host actually assembles, and in what form it reaches the browser.**
At boot, `client-modules` reads every installed plugin's client bundle from disk (each
linked plugin's `lib/client.js`), wraps each one as a "loader entry", and composes ALL of
them into ONE **client bundle combo** — host-boot-log: *"client-modules: composed 53 loader
entries into client bundle combo (4.5 MB, classic script)"*. That combo is a single
**classic script** (no `type="module"`) served to the browser and executed as one script
program. Each entry is expected to register itself into `window.__ModuleLoader__` when the
script runs. The combo line appears **once per boot**: the artifact is built at startup and
then served statically.

**What the user shipped.** `plugin/lib/client.js` is bare ESM: top-level
`import React from 'react'` (L1), `import { createPortal } from 'react-dom'` (L2), and
`export function apply(ctx)` (L23) — plus top-level side effects (DOM node creation +
`createPortal`, L18–L21) that would run at load time.

**Why one bundle kills all 53 entries.** A classic script is parsed as a *single program*,
and top-level `import`/`export` are illegal in a classic script: the file fails **at parse
time** with a SyntaxError before any statement executes. Consequently **no**
`window.__ModuleLoader__.load(...)` call in the entire combo ever runs — zero entries
register. That is exactly the observed symptom: *"Plugin list: EMPTY. Zero entries
registered"*, and the two stock plugins (brand version, file tracking) that rendered before
the insert are gone as well. Because all 53 bundles are one concatenated parse unit, one
offending bundle is fatal to every plugin. The reported **position 1:1** is line 1 column 1
of the offending bundle = `import React from 'react'`. Reproduced locally with classic-script
semantics: `new Function(src)` throws `SyntaxError: Cannot use import statement outside a
module` on the fixture bundle.

**Why the error named `@deepseek-ai/dsh-typert-registry` even though it is innocent.**
The error is an *entry-attribution* artifact, not a cause statement. When the shared combo
fails to compile, the import of **every** loader entry rejects with the same underlying
compile error; the host's error path wraps that shared failure with the identity of the
entry it happened to be awaiting when the failure surfaced — here the first awaited /
first-composed entry, id `0c013085` = `@deepseek-ai/dsh-typert-registry`, a stock host
package the user never touched and whose own bundle is fine. The headline
*"failed to import loader entry 0c013085 (…dsh-typert-registry)"* therefore answers "which
entry's import was in flight", while the message **tail** answers the real question:
*"client-modules: bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error
(position 1:1)"* — which names the true culprit bundle path and position.

---

## 2. Diagnosis discipline — finding the culprit behind a misleading error

**Trust the tail, not the headline.** The full console error already contains the failing
bundle path and position (`/plugins/@lhh010/dsh-profiles/lib/client.js`, 1:1). The named
entry is merely the first awaited loader entry of a combo that failed as a whole.

**Cheap static check that flags the offending bundle.** Because the combo is a classic
script, any top-level ESM token is fatal. Scan every plugin's client bundle for top-level
`import`/`export`:

```
Select-String -Path */lib/client.js -Pattern '^\s*(import|export)\s'
# or: rg -n '^\s*(import|export)\s' <plugin-dirs>/lib/client.js
```

On the fixture this instantly flags L1, L2 and L23 of `@lhh010/dsh-profiles` and nothing
else. Also check the positive shape: the bundle must contain
`window.__ModuleLoader__.load(`. **Do NOT rely on `node --check`** — Node ≥ 22
module-syntax detection parses the same file as ESM and exits 0 (observed), masking the
failure. The check that matches browser combo semantics is a classic-script compile:
`new Function(src)` (or an equivalent parse with script goal), which throws on the first
byte.

**Bisect procedure when the static check is inconclusive.** The combo is all-or-nothing, so
bisect the *install surface*: comment out half of the `insert` rows in the profile's
`cordis.patch.yml` (and/or temporarily unlink half of the plugin dirs), fully restart the
host, hard-refresh, and read **Settings → Plugins → Plugin list**: non-empty = the removed
half contained the culprit; empty = the culprit is still present. Narrow to one plugin in
⌈log2 53⌉ ≈ 6 restart cycles; keep halves coarse because each step costs a full restart.

**The client-bundle format an external plugin must ship instead of bare ESM.**
Per `working-plugin-excerpt.txt`, the bundle must be a classic script whose entire body is
ONE loader-registration call — a CJS-style module factory wrapped by the module loader:

```js
window.__ModuleLoader__.load({
  id: "@lhh010/dsh-profiles",                 // the plugin's package name
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    let react = require("react");             // shared React from the loader registry
    let react_jsx_runtime = require("react/jsx-runtime");
    let ui = require("@deepseek-ai/dsh-client-ui-primitives");
    /* ... components ... */
    const inject = ["slots"];                 // ctx services used by apply
    function apply(ctx) { /* ctx.slots.inject(...) */ }
    /* attach apply (and inject) to module.exports */
    return module.exports;
  },
});
```

- **What wraps the code:** `window.__ModuleLoader__.load({ id, factory })` — the bundle
  registers exactly one module with the combo's module loader; all plugin code lives inside
  `factory`, treated by the loader as a CommonJS module body (hence the `module`/`exports`
  shim and the `Symbol.toStringTag = "Module"` marker).
- **How React is obtained:** exclusively through the injected `require` —
  `require("react")`, `require("react/jsx-runtime")`, and
  `require("@deepseek-ai/dsh-client-ui-primitives")` — resolved to the single shared
  instances inside the combo. Never top-level `import`, never bundle your own React copy.
- **What the wrapper must export:** the factory must `return module.exports` carrying at
  least `apply(ctx)` plus the `inject` service list (e.g. `["slots"]`), matching the working
  excerpt's shell. Top-level side effects (the user's `document.body.appendChild` +
  `createPortal` at load) must not run in the bundle body; DOM work belongs in `apply` or
  component render.

---

## 3. Failure 2 — `slot "settings.section" is not declared (a parent entry's children table must declare it)`

**What it means.** Slots are **declared, not created by consumers**. Each UI surface slot
(e.g. `settings.section`) is owned by a **parent entry** — the entry that renders the
settings surface — and is named in that parent entry's **children table**, the declarative
table in the parent's registration listing its slots (name, kind, scope, order). At apply
time the host validates every slot operation against the declared children tables; a slot
name that no *parent entry's* children table declares cannot be used.

**Why a bare registration of another entry's slot fails at apply time.** The user's
`apply(ctx)` (plugin/lib/client.js L23–L27) called

`ctx.slots.register({ name: 'settings.section', id: 'profiles-manager', order: 5, kind: 'section', scope: 'settings' }, ProfilesSection)`

— a **declaration** call, as if `@lhh010/dsh-profiles` owned the settings surface. But
`settings.section` belongs to a *different* entry's children table; a sibling/child entry
cannot declare it, and the declaration ordering is parent-first: only after the owning
parent's children table declares the slot do contributions to it become valid. Hence the
apply-time error for this entry alone, while "all other plugins load and render normally on
this boot" (plugin-apply-error.txt).

**The exact wrapping form the registration must use.** Two nested contracts:
1. The code is wrapped in the loader factory (Section 2) and exports `apply` + `inject`.
2. Inside `apply(ctx)`, the contribution must be an **injection into the declared slot**,
   using the inject API of the working excerpt (`ctx.slots.inject(...)`), not a declaration:

```js
const inject = ["slots"];
function apply(ctx) {
  ctx.slots.inject("settings.section", ProfilesSection, {
    id: "profiles-manager",   // contribution identity
    order: 5,                 // ordering inside the slot
  });
}
exports.apply = apply;
exports.inject = inject;
return module.exports;
```

**Fields a registrant may pass vs. must not.**
- MAY pass: the component; the contribution's own `id` (e.g. `profiles-manager`); its
  `order` within the slot.
- MUST NOT pass: `name` (the slot name is fixed by the parent's declaration; reference it
  when calling inject, never re-declare it), and the declaration fields `kind` (e.g.
  `section`) and `scope` (e.g. `settings`) — those belong to the parent entry's children
  table. Passing them in a `register`-style descriptor is precisely what triggers
  *"a parent entry's children table must declare it"*. The registrant supplies content, not
  the slot's schema.

---

## 4. Dev-loop discipline — boot-assembled combo and the Windows restart

**Why the combo is not rebuilt when plugin files change.** The combo is assembled **once at
host boot**: the host reads every installed plugin's client bundle from disk, concatenates
them into one classic script and serves that artifact (host-boot-log: the "composed 53
loader entries…" line appears ONCE per boot). There is no file watcher and no per-request
rebuild for client bundles. Editing a plugin file afterwards therefore changes nothing in
the browser — **not even after a hard refresh**, because the refresh refetches the same
pre-built combo — until the host process itself is stopped and started so it re-reads the
bundles.

**Correct restart procedure (every plugin edit iteration).**
1. Save the plugin files.
2. Stop the host process itself (Ctrl+C in its console / stop the service). On Windows,
   *closing the launching terminal is NOT sufficient* (see below).
3. Verify no listener remains on the port (`Get-NetTCPConnection -LocalPort <port>` /
   `netstat -ano | findstr :<port>`); if a node process still holds it, free it with
   `taskkill /PID <pid> /T /F` (whole tree, forced).
4. Start the host and wait for "web profile ready".
5. Browser **hard refresh** (Ctrl+Shift+R), then check **Settings → Plugins → Plugin list**:
   non-empty = combo compiled; empty = combo failed again — read the console *tail* for the
   offending bundle path.

**Why the Windows restart died with EADDRINUSE until the tree was force-killed.**
Closing the launching terminal kills the console window, not the spawned node process tree.
Windows console-close does not propagate a job-control signal to descendants the way a shell
Ctrl+C does, so the node host survives as an **orphan still listening on the port**. The
next boot's `listen()` then fails with `EADDRINUSE` because the orphaned process still owns
the TCP endpoint. Only after the whole process tree was force-killed
(`taskkill /PID <pid> /T /F`) did the port release and the next boot bind normally
(host-boot-log notes). Discipline: never assume closing a window stopped the host — confirm
the port is free (kill the tree by PID if not), then start.

---

## 5. Prevention

### Host-side (name the offender instead of the first awaited entry)
- **Per-bundle compile check at composition time**, before concatenating: compile each
  bundle in isolation with classic-script semantics (`new Function(bundle)` or an
  equivalent script-goal parse). On failure, report
  `<plugin id> — <bundle path> — SyntaxError at line:col` and **skip only that bundle**
  (graceful degradation: the other 52 entries register) or refuse to serve the combo with a
  per-plugin message.
- **Isolation option:** serve each bundle as its own `<script>` unit (or as separate
  modules) instead of one concatenated classic script, so a single parse error cannot take
  down every plugin's registration — this removes the whole class of "one bad bundle, empty
  plugin list".
- **Fix the attribution at combo-failure time:** the host already receives the offending
  bundle path from the compile error; promote it to the headline
  (`failed to load plugin @lhh010/dsh-profiles: bundle …/lib/client.js compile error
  (position 1:1)`) instead of `failed to import loader entry 0c013085 (…dsh-typert-registry)`.
  If the in-flight entry label is kept for tracing, append `while awaiting entry X; culprit
  bundle: Y`.
- **Startup lint in the boot log:** per plugin, print PASS/FAIL for the packaging contract
  (contains `window.__ModuleLoader__.load`; no top-level `import`/`export`; factory returns
  `module.exports` with `apply` + `inject`; all `require()`s resolve to known shared deps)
  and for slot usage (only `inject` into parent-declared slots).
- **Better apply-time slot errors:** name the parent entry that declares the slot (or state
  that no parent declares it) and suggest `ctx.slots.inject(...)` instead of `register`.

### External-plugin authoring template / checklist (prevents all three failures)
1. **File shape:** `lib/client.js` is a classic script whose entire body is
   `window.__ModuleLoader__.load({ id: "<package name>", factory: (require) => { … return module.exports; } })`.
2. **CJS shim** at factory top: `var module = { exports: {} }; var exports = module.exports;`
   + `Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" })`.
3. **Dependencies only via injected require:** `require("react")`,
   `require("react/jsx-runtime")`, `require("@deepseek-ai/dsh-client-ui-primitives")`.
   Never top-level `import`/`export`; never bundle a second React.
4. **Export contract:** `module.exports` carries `apply(ctx)` and the `inject` service list
   (e.g. `["slots"]`); the factory returns `module.exports`.
5. **No top-level side effects:** no DOM insertion / `createPortal` at bundle load; render
   from components or `apply`.
6. **Slots:** never declare/register a slot you do not own. Identify the parent's declared
   slot name and contribute with `ctx.slots.inject("<slot>", Component, { id, order })`.
   Pass only `id` + `order` + component; never `name`/`kind`/`scope` of the slot.
7. **Install:** link the plugin dir into the profile's `node_modules` + exactly one
   `insert` row (id + name) in the profile's `cordis.patch.yml`.
8. **Pre-flight checks before every restart:** `rg -n '^\s*(import|export)\s' lib/client.js`
   must be empty; `new Function(fs.readFileSync('lib/client.js','utf8'))` must not throw.
   `node --check` is NOT a valid check (module-syntax detection masks the failure).
9. **Dev loop:** after any plugin-file change → full host restart (on Windows kill the
   process tree, `taskkill /PID <pid> /T /F`, and confirm the port is free) → hard refresh →
   verify Settings → Plugins list is non-empty.
10. **Symptom triage:** empty plugin list = combo compile failure → read the console TAIL for
    the failing bundle path; ignore the headline "first awaited entry" name.

---

## run-stats
- toolcalls: 21
- token usage: n/a (not visible in this session)
- completion time: 2026-10-21T15:11:11+08:00 [Asia/Shanghai]


#### FILE: tool-transcript.txt

1. run_code>pwsh  Get-ChildItem -Recurse -File  (workdir: ..\fixture) — enumerate evidence pack
2. run_code>read  ..\fixture\README.md
3. run_code>read  ..\fixture\browser-error.txt
4. run_code>read  ..\fixture\host-boot-log.txt
5. run_code>read  ..\fixture\plugin-apply-error.txt
6. run_code>read  ..\fixture\restart-notes.txt
7. run_code>read  ..\fixture\working-plugin-excerpt.txt
8. run_code>read  ..\fixture\plugin\lib\client.js
9. run_code>read  ..\fixture\profile\cordis.patch.yml
10. run_code>pwsh  Select-String -Path 'plugin\lib\client.js' -Pattern '^\s*(import|export)\s' (workdir: ..\fixture) — cheap static ESM scan (flags L1/L2/L23)
11. run_code>pwsh  node --check 'plugin\lib\client.js' (workdir: ..\fixture) — exits 0; Node module-syntax detection masks the failure
12. run_code>pwsh  node -e "new Function(fs.readFileSync('plugin\\lib\\client.js','utf8'))" (workdir: ..\fixture) — classic-script compile → SyntaxError: Cannot use import statement outside a module
13. run_code>pwsh  Get-Date -Format 'yyyy-MM-ddTHH:mm:sszzz' — completion timestamp probe
14. run_code>write agent-output\report.md — full S17 incident report (5 required sections + run-stats)
15. run_code>write agent-output\tool-transcript.txt — tool transcript (first draft)
16. run_code>write agent-output\transcript-manifest.txt — fs access manifest
17. run_code>edit  agent-output\report.md — run-stats toolcalls 16 → 18
18. run_code>read  agent-output\report.md — verify report non-empty (265 lines) and run-stats present
19. run_code>pwsh  Get-Item agent-output\{report.md,tool-transcript.txt,transcript-manifest.txt} + Select-String run-stats — verify outputs non-empty
20. run_code>write agent-output\tool-transcript.txt — final transcript (this file, 21 entries)
21. run_code>edit  agent-output\report.md — run-stats toolcalls 18 → 21 (final)


#### FILE: transcript-manifest.txt

R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S17-external-ui-plugin-onboarding-trap\fixture  (directory listing)
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S17-external-ui-plugin-onboarding-trap\fixture\README.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S17-external-ui-plugin-onboarding-trap\fixture\browser-error.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S17-external-ui-plugin-onboarding-trap\fixture\host-boot-log.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S17-external-ui-plugin-onboarding-trap\fixture\plugin-apply-error.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S17-external-ui-plugin-onboarding-trap\fixture\restart-notes.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S17-external-ui-plugin-onboarding-trap\fixture\working-plugin-excerpt.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S17-external-ui-plugin-onboarding-trap\fixture\plugin\lib\client.js
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S17-external-ui-plugin-onboarding-trap\fixture\profile\cordis.patch.yml
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S17-external-ui-plugin-onboarding-trap\agent-output\report.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S17-external-ui-plugin-onboarding-trap\agent-output\report.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S17-external-ui-plugin-onboarding-trap\agent-output\tool-transcript.txt
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S17-external-ui-plugin-onboarding-trap\agent-output\transcript-manifest.txt


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.