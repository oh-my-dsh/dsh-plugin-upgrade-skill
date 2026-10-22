# S17 · The External UI Plugin Onboarding Trap — Diagnosis Report

Scope: read-only diagnosis of the evidence pack under `fixture/` (unchanged). Three
failures, one causal chain: a mis-packaged client bundle (bare ESM) poisoned the whole
boot-assembled client combo; repackaging unmasked a latent slot-registration bug; the
dev loop then demanded full host restarts, and on Windows an orphaned process held the
port (EADDRINUSE). Cards cited by ID only.

---

## 0. Executive summary

1. **Failure 1 (whole-combo collapse, misattributed error).** The new plugin's client
   bundle `lib/client.js` was **bare ESM** (top-level `import React from 'react'` at
   position 1:1, `export function apply`). The host composes *every* installed plugin's
   client bundle into **one classic `<script>` combo** at boot; a single ESM token fails
   the whole combo at compile time, so **zero** loader entries register and every plugin
   (including the two stock ones) disappears. The browser error names
   `@deepseek-ai/dsh-typert-registry` only because it is the **first awaited entry** —
   an innocent stock package; the real culprit is named only in the host-side compile
   error (`bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)`).
2. **Failure 2 (slot declaration ordering).** After repackaging, the combo compiled and
   apply time was reached; the plugin's bare `ctx.slots.register({name:'settings.section', …})`
   was refused because `settings.section` is **declared by another (parent) entry's
   children table** and cross-package apply order is undefined. The registration must be
   wrapped in `ctx.slots.inject(name, () => ctx.slots.register(...))` and may pass only
   `name`/`id`/`order`(`label`) — never `kind`/`scope`.
3. **Failure 3 (dev loop + Windows restart).** The combo is assembled once at host boot
   and cached, so client-bundle edits need a **full host stop/restart** (a refresh is not
   a host stop). On Windows, closing the launching terminal left an orphaned node process
   holding the listening port → next boot `EADDRINUSE` until the whole process tree was
   killed (`taskkill /PID <pid> /T /F`).

---

## 1. Failure 1 · root cause of the whole-combo collapse

_Conclusion: one plugin's client bundle — bare ESM with a top-level `import` — failed the
single boot-assembled classic-script combo at compile time, so every loader entry failed
to import; the error named the first awaited entry (`dsh-typert-registry`), which is innocent._

### 1.1 What the host assembles, and in what form it reaches the browser

- At boot the host's `client-modules` layer scans installed packages and composes the
  client halves into **one client bundle combo** (boot log: `composed 53 loader entries
  into client bundle combo (4.5 MB, classic script)`). The combo is served as a **classic
  script** — the whole browser plugin roster rides on that single `<script>` tag; the host
  advertises it through `window.__DSH_BOOT__` as a revision-bearing combo URL
  (`/plugins/??…&rev=…`) (cards DSH-0.1.2-A1-19 / A1-26; scan contract DSH-0.1.1-R1-03:
  only packages declaring `dsh.client` enter the roster).
- Because every entry's registration is concatenated into one classic script, the combo
  is **all-or-nothing**: one member bundle that does not parse as a classic script fails
  the *entire* combo at compile time, and the browser's loader then fails to import *every*
  entry — the plugin list renders empty and the two stock plugins vanish (troubleshooting
  row "Failed to load plugins … then zero plugins register"; cf. card DSH-0.1.5-A1-20,
  where one bad module took down every client plugin's registration).
- The culprit bundle (`fixture/plugin/lib/client.js`) starts with `import React from 'react'`
  (line 1), `import { createPortal } from 'react-dom'` (line 2) and ends with
  `export function apply(ctx)` (line 23). None of that is valid in a classic-script
  context — hence `compile error (position 1:1)`. It also self-renders DOM at module top
  level (`document.createElement` / `appendChild` / `createPortal(...)` at lines 18–21)
  instead of registering through `{ name, apply }`.

### 1.2 Why the error named `dsh-typert-registry` even though that entry is innocent

- The browser loads the combo and imports loader entries in roster order, awaiting them
  one by one. When the combined script throws at compile time, the reported failure is
  attached to the **first awaited entry** — `@deepseek-ai/dsh-typert-registry`, a stock
  host package the user never touched. The named id is an artifact of *which entry the
  loader happened to be awaiting*, not of which bundle is broken (troubleshooting row;
  the same misattribution shape is carded for combo failures in DSH-0.1.5-A1-20).
- The host-side log already contained the true attribution —
  `client-modules: bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error
  (position 1:1)` — it simply never reached the browser-facing error.

### 1.3 Empirical confirmation (read-only static check)

- Parsing the offending bundle under **classic-script goal** (temp `.cjs` copy inside the
  cell's `agent-output/`) fails at line 1 on `import` — mirroring the host's
  `compile error (position 1:1)`; the working plugin's wrapper passes the same check.
  (`node --check` on a `.js` file *passes* it, because Node auto-detects ESM syntax —
  which is exactly why the cheap check must force script goal.)

---

## 2. Diagnosis discipline · locating the culprit and the required bundle format

_Conclusion: bisect the patch layer's `insert` rows; the cheap static check is a
classic-script-goal parse plus an `__ModuleLoader__`/`PLUGIN_ID` presence scan; an
external client bundle must ship the `window.__ModuleLoader__.load({id, factory})`
CommonJS wrapper with `require("react")` inside the factory, returning `module.exports`._

### 2.1 How to locate the culprit from the misleading error

- **Do not trust the named entry.** Treat the named id as "the first awaited entry" and
  bisect the **patch layer's `insert` rows** (here: 3 rows — `dsh-brand-version`,
  `dsh-file-trace`, `dsh-profiles`): disable/remove rows one at a time and re-boot, or
  fetch each module individually from the combo route at the same `rev`, until the combo
  compiles again. The prime suspect is always the **most recently inserted row** —
  here `@lhh010/dsh-profiles`, the only row the user added.
- **Cheap static checks** (run before any boot):
  - `rg -n "__ModuleLoader__|PLUGIN_ID" .` (pre-flight #5): a correctly packaged client
    bundle contains the wrapper; the offending file has none (verified: only the working
    excerpt contains `__ModuleLoader__`).
  - Parse each client bundle under **classic-script goal** (`node --check` on a `.cjs`
    copy, or `--input-type=commonjs`): top-level `import`/`export` = guaranteed combo
    compile error (verified: offending fails at 1:1, working passes). A plain
    `rg -n "^\s*(import|export)\s"` on client bundles gives the same signal in one pass.
  - Check the **three ids agree**: bundle `__ModuleLoader__.load` id == `package.json`
    `name` == insert row `name` (bare scoped name) (card DSH-0.1.2-A1-26). Here the row
    `name: '@lhh010/dsh-profiles'` is already correct — the packaging failure is purely
    the bundle format.

### 2.2 The client-bundle format an external plugin must ship

The working excerpt (`fixture/working-plugin-excerpt.txt`) shows the contract:

- The code is wrapped in **`window.__ModuleLoader__.load({ id: '<package name>', factory:
  (require) => { … } })`** — a CommonJS-style factory (in practice produced by the build,
  e.g. tsdown with a banner injecting `PLUGIN_ID` as the `id`).
- **React is obtained inside the factory** via `require("react")` /
  `require("react/jsx-runtime")` (and other deps likewise, e.g.
  `require("@deepseek-ai/dsh-client-ui-primitives")`) — never a top-level `import`.
- The factory builds `var module = { exports: {} }; var exports = module.exports;` … and
  **must `return module.exports`** — the registration object (the `apply(ctx)` function
  plus the `inject` service list).
- No top-level side effects: the client entry registers via `{ name, apply }`; it must
  not touch the DOM at import time (the v0.1.1-rc.1 field note records exactly this
  transition from "page script" to `{name, apply}` registration).

| Aspect | Offending `plugin/lib/client.js` | Required (working excerpt) |
|---|---|---|
| Wrapper | none — bare ESM module | `window.__ModuleLoader__.load({id, factory})` |
| React | top-level `import React from 'react'` | `require("react")` inside factory |
| Exports | `export function apply` | factory `return module.exports` |
| Entry behavior | self-renders DOM at top level (lines 18–21) | registers via `apply(ctx)` |
| Registration id | absent (no `__ModuleLoader__.load` id) | `id` == package.json name |

---

## 3. Failure 2 · `slot "settings.section" is not declared`

_Conclusion: `settings.section` is declared by the slot's owning (parent) entry — the
settings shell's children table; a plugin contributing into another entry's slot must
not `register` it bare (apply order across packages is undefined) but wrap the call in
`ctx.slots.inject(name, () => ctx.slots.register(...))`, passing only `name`/`id`/`order`
(`label`) and never `kind`/`scope`._

- **Who declares slots.** Each slot is declared by its **owning entry** as part of that
  entry's slot contract — the declaration lives in the parent entry's **children table**
  (slot-declaration shape `{ name, id, order?, locale?, children?, inject? }`; the
  settings shell declares its seats in its own children, per the slot-contract cards in
  the 0.1.7 corridor). A third-party plugin never declares another package's slot; it
  *contributes* into it.
- **Why the bare registration failed at apply time.** `ctx.slots.register` is the
  *declaration* API. Cross-package apply order is unconstrained, so the registrant's
  `apply(ctx)` can run **before** the owner's declaration exists; at that moment the name
  is not declared, and apply refuses with
  `slot "settings.section" is not declared (a parent entry's children table must declare it)`
  (troubleshooting row for this exact message).
- **The exact wrapping form the registration must use:**

  ```js
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      { name: 'settings.section', id: 'profiles-manager', order: 5 },
      ProfilesSection,
    ),
  )
  ```

  `inject` defers the contribution until the declaring plugin's slot declaration exists,
  so ordering no longer matters (the same pattern is prescribed for every cross-package
  seat in the 0.1.5→0.1.7 corridor, e.g. `settings.launcher`).
- **Fields a registrant may pass / must not pass.** Only `name`, `id`, `order` (and
  `label` where the contract types it). It must **not** pass `kind` or `scope` — those
  belong to the *declaration* (the owner's children table). The offending call passed
  `kind: 'section'` and `scope: 'settings'`; both are illegal on a contribution and are
  part of the same misuse (registering a foreign slot as if it owned it).
- **Why this only appeared on the second boot.** Boot 1's combo never compiled, so **no**
  entry was ever applied — the slot apply phase never ran and the bug stayed latent.
  Repackaging fixed the compile error, apply time was reached, and the pre-existing slot
  misuse surfaced. Fixing failure 1 unmasked failure 2 — the two errors are one incident.

---

## 4. Dev-loop discipline · boot assembly, restarts, and the Windows EADDRINUSE

_Conclusion: the combo is assembled once at host boot and cached, so every client-bundle
edit needs a full host stop → `dsh web` restart → hard refresh; on Windows the launching
terminal is not the host, an orphaned node process keeps the port, and only killing the
process tree (`taskkill /PID <pid> /T /F`) frees it._

- **Why edits never take effect on refresh.** The host reads every installed plugin's
  client bundle and composes the combo **once per boot** (boot log: the combo line appears
  once; restart notes: "Editing a plugin file on disk afterwards has NO effect … until
  the host process itself is restarted"). This is carded as DSH-0.1.7-A2-04: client
  bundles are read and cached at host boot — editing a served `lib/client.js` no longer
  takes effect on page refresh; only a host restart serves the new bytes. A refresh-only
  verification therefore reports **stale content and can mislead a diagnosis**. Web pages
  also auto-reconnect after a server restart, so an open page may keep working while
  running pre-restart bytes — verify the **served bundle itself** (fetch the combo URL
  and inspect), not merely that the page responds.
- **Correct restart procedure.** Fully stop the host process (a browser refresh is *not*
  a host stop; closing the launching terminal is not reliably a stop either) → start
  `dsh web` again → hard-refresh the browser → check Settings → Plugins → Plugin list
  (an empty list means the combo failed again). Repeat after every client-bundle edit.
- **Why the Windows restart died with EADDRINUSE.** Closing the launching terminal left
  the host's node process **alive** (orphaned) and still holding the listening port, so
  the next boot could not bind. The port was freed only after killing the **whole process
  tree**: `taskkill /PID <pid> /T /F` (`/T` = tree, `/F` = force); the next boot then
  bound normally. This is the same discipline the skill mandates around host operations:
  fully stop every dsh process first — a running host holds file locks (EBUSY) and ports,
  and a browser refresh is not a host stop.

---

## 5. Prevention · host-side and authoring-side

_Conclusion: the host should validate and report per-module at combo assembly (naming the
offending plugin instead of the first awaited entry), and an external-plugin template must
enforce the `__ModuleLoader__` wrapper, the `slots.inject` contribution pattern, and the
stop→restart→verify dev loop — none of the three failures would have shipped past it._

### 5.1 What the HOST could do at startup / at combo-failure time

- **Per-module compile validation at assembly.** While composing the combo, parse each
  loader entry's bundle individually under **classic-script goal**; if one fails, refuse
  to compose (or compose without it) and report **that module's path and position** —
  the host already computes it (`/plugins/@lhh010/dsh-profiles/lib/client.js`,
  position 1:1) — instead of a doomed combo whose browser-side error names an innocent
  first-await entry.
- **Attribute the browser-facing error.** Replace `failed to import loader entry <first
  entry>` with the real cause, e.g. `combo compile failed at <module path> (position
  1:1): classic-script context cannot contain an ESM import — client bundles must
  register via window.__ModuleLoader__.load({id, factory})`. Surface the same attribution
  in `--dump-config`-style diagnostics.
- **Per-entry import isolation.** Import loader entries individually (try/catch per
  module) so one bad bundle cannot take down every plugin's registration — the failure
  blast radius should be one entry, not the roster.
- **Install/startup pre-flight gate.** Scan each client bundle for top-level
  `import`/`export` tokens or a missing `__ModuleLoader__.load`/`PLUGIN_ID` wrapper, and
  fail the offending plugin's row with a named message at insert time rather than at the
  browser's first boot.

### 5.2 Authoring template / checklist for the next onboarding

1. **Client entry packaging** — ship the `window.__ModuleLoader__.load({ id, factory })`
   CommonJS wrapper (build via tsdown with the `PLUGIN_ID` banner); never bare ESM in
   `lib/client.js`; no top-level `import`/`export`; no top-level DOM side effects —
   register via `{ name, apply }` and let the factory `return module.exports`.
2. **React and deps** — obtained with `require("react")` / `require("react/jsx-runtime")`
   **inside** the factory.
3. **Identity** — bundle registration `id` == `package.json` `name` == the `insert` row's
   `name` (bare scoped name); declare `dsh.client` in `package.json` so `client-modules`
   scans the package (cards DSH-0.1.1-R1-03 / DSH-0.1.2-A1-26).
4. **Slots** — contributing into another entry's slot
   (`settings.section`, `conversation.*`, …) uses
   `ctx.slots.inject(name, () => ctx.slots.register(...))` and passes only
   `name`/`id`/`order`(`label`) — never `kind`/`scope` (those are the owner's declaration
   fields).
5. **Dev loop** — after every client-bundle edit: full host stop → restart `dsh web` →
   hard refresh → check the plugin list → **fetch the combo URL** to confirm the served
   bytes (never trust page response alone, given boot caching and auto-reconnect).
6. **Windows restart discipline** — before restarting, kill the whole process tree
   (`taskkill /PID <pid> /T /F`); a closed terminal is not a stopped host, and an
   orphaned process holds the port (EADDRINUSE) and native file locks (EBUSY).
7. **Static gates before install** — `node --check` under script goal (or `.cjs` copy),
   `rg -n "__ModuleLoader__|PLUGIN_ID" .`, and a top-level `import`/`export` grep on the
   client bundle — all three are seconds-cheap and catch failure 1 before the first boot.

---

## Appendix · evidence and verification trail

- Evidence read (all under `fixture/`, unchanged): `README.md`, `browser-error.txt`,
  `host-boot-log.txt`, `plugin-apply-error.txt`, `restart-notes.txt`,
  `working-plugin-excerpt.txt`, `plugin/lib/client.js`, `profile/cordis.patch.yml`.
- Cards/references consulted (by ID, not pasted): troubleshooting rows "Failed to load
  plugins …" and "slot … is not declared"; DSH-0.1.1-R1-03; DSH-0.1.2-A1-19 /
  DSH-0.1.2-A1-26; DSH-0.1.5-A1-20; DSH-0.1.7-A2-04; pre-flight #5 static scans; the
  0.1.5→0.1.7 corridor slot-contract cards (`settings.launcher`, turnTail `inject`).
- Read-only commands run: `node --check` on the offending bundle under classic-script
  goal (fails at 1:1 on `import`) and on the working wrapper (passes); content greps for
  top-level `import`/`export` and `__ModuleLoader__` over `fixture/`. Temp files
  (`tmp-offending.cjs`, `tmp-working.js`) live only inside this cell's `agent-output/`.
