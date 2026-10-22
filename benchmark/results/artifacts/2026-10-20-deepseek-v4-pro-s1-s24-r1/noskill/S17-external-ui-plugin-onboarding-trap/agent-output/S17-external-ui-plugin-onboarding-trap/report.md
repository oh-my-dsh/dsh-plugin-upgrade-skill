# S17 · The External UI Plugin Onboarding Trap — Incident Report

Evidence pack: `fixture/` (read-only). This report reconstructs the three-failure
chain from the static evidence: the browser error (`browser-error.txt`), the boot log
(`host-boot-log.txt`), the offending bundle (`plugin/lib/client.js`), the apply-time
error (`plugin-apply-error.txt`), the patch rows (`profile/cordis.patch.yml`), the
restart notes (`restart-notes.txt`), and a working bundle for comparison
(`working-plugin-excerpt.txt`).

---

## 1. Failure 1 — root cause

**The offending bundle.** `plugin/lib/client.js` is *bare ESM*: it starts with a
top-level `import React from 'react'` and `import { createPortal } from 'react-dom'`,
and ends with `export function apply(ctx) { … }`.

**What the host assembles, and the form that reaches the browser.** At boot the host's
`client-modules` layer reads every installed plugin's client bundle and *composes all of
them into one single artifact* — the "client bundle combo" (boot log: `composed 53 loader
entries into client bundle combo (4.5 MB, classic script)`). Each plugin contributes one
loader entry (an `id → factory` registration). Those 53 entries are concatenated into
**one classic `<script>`** that is served to the browser; the browser then imports
entries lazily, by id, from that preloaded combo (the `window.__ModuleLoader__`
registry shown in `working-plugin-excerpt.txt`).

**Why one bad bundle takes down every plugin.** The combo is a *single* compiled artifact,
so its compilation is all-or-nothing. A top-level `import`/`export` is not legal in a
classic script, so the combo compile fails on the offending bundle
(`bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)` — the
`import` sits at the very first characters, hence 1:1). With the combo unloadable, *no*
loader entry can be imported: Settings → Plugins → Plugin list is empty and the two
untouched stock plugins vanish from the header too.

**Why the error names `@deepseek-ai/dsh-typert-registry` despite it being innocent.** It is
an attribution bug, not a `dsh-typert-registry` fault. The outer message
(`failed to import loader entry 0c013085 (@deepseek-ai/dsh-typert-registry)`) names the
*first entry the loader awaited* (its content-id `0c013085`); when the whole-combo compile
fails, the rejection surfaces on whichever entry's import was in flight. The *real* culprit
is only visible in the nested message that names
`/plugins/@lhh010/dsh-profiles/lib/client.js`.

---

## 2. Diagnosis discipline + the correct client-bundle contract

**Locating the culprit from a misleading error.** Read past the outer "failed to import
loader entry …" line: the *nested* `bundle <path> compile error` names the real file. To
confirm, bisect `profile/cordis.patch.yml`: remove the `dsh-profiles` insert row (or
binary-search rows), restart + hard-refresh; the combo recovers the instant the offending
plugin is dropped. The cheap static check: open each plugin's `lib/client.js` and look at
its first line — a leading `import`/`export` token is the flag (grep for `^import` /
`^export`). A correct bundle never starts with `import`.

**The client-bundle format an external plugin must ship** (per
`working-plugin-excerpt.txt`) — not bare ESM, but a **classic script wrapped in
`window.__ModuleLoader__.load({ … })`**:

- **`id`**: the plugin's loader-entry id (e.g. `"@local/dsh-brand-version"`).
- **`factory: (require) => { … }`**: a function that receives a `require`.
- Inside the factory: create `var module = { exports: {} }; var exports = module.exports;`
  and `Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" })`.
- **React is obtained via `require` inside the factory**, never a top-level import —
  e.g. `let react_jsx_runtime = require("react/jsx-runtime")`, and other deps via
  `require(...)` (e.g. `require("@deepseek-ai/dsh-client-ui-primitives")`).
- **Return `module.exports`**, and the exported object must expose `apply(ctx)` (the
  entry body) plus an `inject` capability list (e.g. `const inject = ["slots"]`)
  declaring what the plugin consumes.

---

## 3. Failure 2 — cross-entry slot declaration ordering

**What the error means.** `slot "settings.section" is not declared (a parent entry's
children table must declare it)` is a declaration-ordering enforcement: a slot may only be
registered against a slot that is *declared in the children table of the entry that owns the
parent UI surface*.

**Who declares slots.** The entry that provides the parent surface — here the Settings
screen entry — *declares* its child slots (`settings.section`) in its own children table.
Only that owning entry owns the slot's identity and its `kind`/`scope` metadata.

**Why the bare registration fails at apply time.** The plugin called
`ctx.slots.register({ name: 'settings.section', id: …, order: 5, kind: 'section',
scope: 'settings' }, ProfilesSection)`. That is a *declaration-style* call: it attempts to
declare a slot whose identity belongs to another entry. Apply-time validation looks the name
up in the registrant's own (parent) children table, finds nothing, and rejects it — the
plugin is not the owner of `settings.section`, so it may not declare/register it. This
failure is scoped to the one entry's `apply`, which is why all other entries still loaded
on that boot (`plugin-apply-error.txt`).

**The correct wrapping form.** Contribute *into* an already-declared slot with the
injection API, exactly as the working bundle does — `ctx.slots.inject(...)`: target the
Settings section slot owned by the settings entry, and inject the component (and its
position) into it, instead of declaring a slot.

**Fields a registrant may pass vs. must not.** A registrant may pass the *contribution*
fields: a unique `id` (e.g. `profiles-manager`), an `order` (e.g. `5`) for
positioning, and the value/component to render. It must **not** pass the slot *declaration*
fields it does not own — the slot `name` (identity is fixed by the owning entry),
`kind`, and `scope` — because those belong to the slot's declaring entry.

---

## 4. Dev-loop discipline

**Why edits don't reach the browser.** The combo is assembled **once at host boot** (in
memory) and served from that snapshot; the host does not watch or rebuild plugin client
bundles when files change on disk. Editing a plugin file changes nothing in the browser —
even after a hard refresh — until the host process is stopped and started again (boot log:
"the combo line appears ONCE per boot").

**Correct restart procedure.** (1) Fully stop the host process *and its child process
tree*; (2) confirm the listening port is actually released; (3) start a fresh host;
(4) hard-refresh the browser; (5) verify Settings → Plugins → Plugin list is non-empty
(empty = the combo failed again).

**Why the Windows restart died with EADDRINUSE.** Closing the launching terminal only
tears down the terminal's own shell; the spawned `node` host process survives and keeps
holding the listening port, so the next boot cannot bind and fails with `EADDRINUSE`.
Killing only the parent PID is insufficient when children hold resources; `taskkill /PID
<pid> /T /F` kills the whole tree, frees the port, and the next boot then binds normally
(`restart-notes.txt`).

---

## 5. Prevention

**Host-side.**
- Compile/validate each client bundle *individually* (or retain per-bundle compile context
  and source maps), so a combo compile failure names the offending bundle and its plugin id
  directly instead of the first awaited entry.
- At combo-failure time, surface the nested `bundle <path> compile error` and map the path
  back to a plugin id/name, emitting the plugin name prominently (e.g. "combo failed because
  of `@lhh010/dsh-profiles`").
- Eagerly validate bundles at startup and fail fast with the offending plugin named, before
  the combo is served to the browser.
- Scope each loader entry with a name so lazy-import errors are attributed to the entry whose
  bundle is actually being loaded, not the in-flight one.

**Authoring-side (external-plugin template/checklist)** — designed to make all three
failures impossible:
1. **Bundle format:** ship a classic-script bundle wrapped in
   `window.__ModuleLoader__.load({ id, factory: (require) => { … } })` — no top-level
   `import`/`export`; obtain React inside the factory via `require("react/jsx-runtime")`;
   `return module.exports` exposing `apply(ctx)` and `inject: [...]`.
2. **Slots:** contribute UI via `ctx.slots.inject(...)` into a slot the owning entry
   declares; never `ctx.slots.register(...)` for another entry's slot, and never pass
   `name`/`kind`/`scope` as a registrant. Do not run DOM side effects at module
   top level (the classic script runs at combo-eval time); render only inside the injected
   component.
3. **Dev loop:** restart the *whole* host process after every bundle edit; on Windows use
   `taskkill /PID <pid> /T /F` to clear the port (avoid EADDRINUSE); hard-refresh and
   confirm a non-empty plugin list.
4. **Static self-check before install:** grep the bundle's first line — it must not start
   with `import`/`export` — and confirm the `__ModuleLoader__.load` wrapper is present.

---

### Conclusion

One mis-packaged external plugin (`@lhh010/dsh-profiles`) shipped a bare-ESM client
bundle, which failed to compile inside the single all-or-nothing classic-script combo and
was mis-attributed to the innocent first-awaited entry `@deepseek-ai/dsh-typert-registry`;
after repackaging, its `ctx.slots.register` of another entry's `settings.section` slot
violated slot-declaration ownership; and the boot-assembled combo plus Windows terminal-only
shutdown produced the no-rebuild dev loop and the EADDRINUSE restart failure. The fix spans
both host-side error attribution and an authoring contract (classic-script
`__ModuleLoader__.load` wrapper + `ctx.slots.inject`) that eliminates all three failure
modes at the source.
