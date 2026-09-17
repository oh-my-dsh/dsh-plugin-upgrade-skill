# S17 Diagnostic Report · The External UI Plugin Onboarding Trap

Evidence base (read-only fixture pack): `browser-error.txt`, `plugin/lib/client.js`, `profile/cordis.patch.yml`, `plugin-apply-error.txt`, `working-plugin-excerpt.txt`, `host-boot-log.txt`, `restart-notes.txt`, `README.md`.

## 1. Failure 1 root cause — one bad bundle killed every plugin, and the error named an innocent entry

**What the host assembles.** The host boot log states it directly: `[boot] client-modules: composed 53 loader entries into client bundle combo (4.5 MB, classic script)`. At boot, the host reads **every installed plugin's client bundle** (the profile patch resolved 3 insert rows: `dsh-brand-version`, `dsh-file-trace`, `dsh-profiles`), concatenates/wraps them into a **single classic script combo**, and serves that one artifact to the browser. There is no per-plugin module file at runtime — the browser evaluates one classic (non-module) script.

**Why everything died.** The new plugin's bundle `plugin/lib/client.js` begins with top-level ESM:

```js
import React from 'react'
import { createPortal } from 'react-dom'
```

Bare `import` statements are a syntax error inside a classic script / CommonJS-style concatenated bundle. The combo compiler failed on this bundle ("compile error (position 1:1)" — i.e. the very first token), and because the combo is one indivisible artifact, **the whole combo failed to load**. The browser message confirms the scope of the blast radius: "Failed to load plugins" and "Settings → Plugins → Plugin list: EMPTY. Zero entries registered." Even the two previously working stock plugins (brand version, file tracking) vanished from the header.

**Why the error named `dsh-typert-registry`.** The browser's loader iterates the combo's registered entries and imports/awaits them one by one ("failed to import loader entry 0c013085 (@deepseek-ai/dsh-typert-registry)"). `@deepseek-ai/dsh-typert-registry` is a stock host package the user never touched; it simply happened to be the **first awaited entry** when the combo-level failure surfaced. Its entry id got attached to the error as the import context, while the actual diagnostic text — `client-modules: bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)` — names the true culprit. The named entry is an innocent bystander; the bundle path in the message is the real attribution.

## 2. Diagnosis discipline — locating the culprit despite the misleading error

- **What to bisect:** the combo's member bundles, not the named loader entry. Remove/skip the newly inserted plugin's bundle (the one row just added to `cordis.patch.yml`, `@lhh010/dsh-profiles`) and re-boot: if the other 52 entries register again, the removed bundle is the culprit. The error text itself already hands you the member path (`/plugins/@lhh010/dsh-profiles/lib/client.js`), so bisecting confirms rather than discovers here.
- **Cheap static check that flags the offending bundle:** grep each plugin's client bundle for **top-level ESM syntax** — lines starting with `import `` … from`` or bare `export `` at file top level. A conforming bundle uses only the CommonJS-in-wrapper style (see below) and contains no top-level `import`/`export` statements. `plugin/lib/client.js` fails this check on its very first line ("position 1:1" in the error matches line 1: `import React from 'react'`).
- **The client-bundle format an external plugin must ship** (per the working comparison excerpt `working-plugin-excerpt.txt`):
  - Wrap everything in the module-loader registration:
    ```js
    window.__ModuleLoader__.load({
      id: "@lhh010/dsh-profiles",
      factory: (require) => {
        var module = { exports: {} };
        var exports = module.exports;
        Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
        // ...
        return module.exports;
      },
    });
    ```
  - **How React is obtained:** through the injected `require` inside the factory — `require("react/jsx-runtime")` (as the working plugin does) or `require("react")` / `require("react-dom")` — never a top-level ESM `import`.
  - **What the wrapper must export:** a `module.exports` carrying the plugin's `apply(ctx)` function (and its `inject` service array, e.g. `const inject = ["slots"]`), returned from the factory. The user's file did define `apply`, but with `export function apply` — ESM export syntax that is equally invalid in this format.

## 3. Failure 2 — `slot "settings.section" is not declared (a parent entry's children table must declare it)`

After repackaging, the bundle compiled and the other plugins worked, but the new plugin's apply step failed. Meaning of the message:

- **Who declares slots:** the **parent entry** that owns the surface where the slot lives — its children table (declaration) lists the slot names that exist under it, e.g. the settings entry declares which section slots exist. A slot name that no parent entry's children table declares simply does not exist as an attachable anchor.
- **Why the bare registration fails:** the user wrote a full slot *declaration* inside another entry's surface:
  ```js
  ctx.slots.register(
    { name: 'settings.section', id: 'profiles-manager', order: 5, kind: 'section', scope: 'settings' },
    ProfilesSection,
  )
  ```
  `ctx.slots.register` (declaration-style registration) requires the named slot to already be declared by the owning parent entry's children table. At apply time the host checks the declaration tables; `settings.section` was not declared there, so the whole entry's apply failed ("failed to apply loader entry (@lhh010/dsh-profiles)"), while everything else on that boot loaded normally.
- **The exact wrapping form the registration must use:** the **inject** form shown in the working plugin's excerpt — `ctx.slots.inject(...)` inside `apply(ctx)`, with the plugin declaring `const inject = ["slots"]` so the slots service is available. Injection targets an already-declared slot anchor instead of attempting to declare a new one.
- **Which fields a registrant may pass and which it must not:** the registrant may pass the **name of an existing declared slot** and its **component** (plus presentation payload the inject API documents, e.g. ordering/props it supports). It must **not** pass declaration-owned descriptor fields — `kind`, `scope`, and a fresh slot `id`/`order` that amount to re-declaring the slot (`{ name, id, order, kind, scope }` in the failing call is a declaration, not an injection). Declaration of slot names and their children table belongs exclusively to the parent entry that owns the surface.

## 4. Dev-loop discipline — boot-assembled combo and the Windows restart

- **Why edits never show up:** the host composes the client bundle combo **once, at host boot** ("composed 53 loader entries into client bundle combo"). The served combo is a snapshot; there is no rebuild/watch step reading plugin files afterwards. The user's note records exactly this: editing any plugin file afterwards changes nothing in the browser "until the host process itself is restarted", not even after a hard refresh. So every plugin edit requires a full host stop/start.
- **Correct restart procedure:** (1) fully stop the host — on Windows, do **not** just close the launching terminal; stop the process explicitly; (2) verify the port is free; if the previous node process survived, kill the whole process tree: `taskkill /PID <pid> /T /F`; (3) start the host again; (4) hard-refresh the browser; (5) check Settings → Plugins → Plugin list — an empty list means the combo failed again.
- **Why EADDRINUSE happened:** closing the terminal window on Windows does not terminate the child node process the host was launched with; the orphaned process kept the listening port held. The next boot's bind failed with EADDRINUSE. Only killing the entire process tree (`taskkill /T /F`, which terminates children, not just the parent) released the port, after which the boot bound normally.

## 5. Prevention

**Host-side (name the offender, not the first awaited entry):**
- At combo-assembly time, compile/parse each member bundle **individually** before concatenation and attach the plugin id/package name to any compile failure — the boot log should say "client bundle of plugin `@lhh010/dsh-profiles` failed to compile: top-level ESM `import` at 1:1; classic-script wrapper required", instead of letting the browser report a random awaited entry id (`0c013085 (@deepseek-ai/dsh-typert-registry)`).
- On combo failure at boot or at serve time, emit a per-entry diagnosis listing exactly which bundle(s) failed and why, and either exclude the bad entry with a loud warning or fail fast with the offending plugin named — never attribute the failure to whichever entry the loader happened to await first.
- At apply time, when a slot registration fails, the error could additionally list the parent entries whose children tables declare slots, so an external author can see which entry owns `settings.section` and that they must inject, not declare.

**External-plugin authoring template / checklist:**
1. **Packaging shell:** wrap all client code in `window.__ModuleLoader__.load({ id, factory: (require) => { …; return module.exports; } })`; never ship top-level `import`/`export` ESM statements (this caused Failure 1).
2. **Dependencies:** obtain React and host UI through `require(...)` inside the factory (e.g. `require("react/jsx-runtime")`, `require("@deepseek-ai/dsh-client-ui-primitives")`).
3. **Exports:** `module.exports` must expose `apply(ctx)` and the `inject` service array (e.g. `["slots"]`).
4. **Slots:** only `ctx.slots.inject(...)` into slot names already declared by the owning parent entry's children table; never re-declare another entry's slot with `register({ name, id, order, kind, scope }, …)` (this caused Failure 2). Do not pass declaration-owned fields (`kind`, `scope`, fresh slot `id`/`order`).
5. **Dev loop:** remember the combo is built once at host boot — every file edit needs a full host restart; on Windows stop the process explicitly and, if needed, `taskkill /PID <pid> /T /F` to avoid orphaned port holders (Failure 3); then hard-refresh and verify the Plugin list is non-empty before debugging further.
6. **Pre-flight static check:** before install, grep the bundle for top-level `import`/`export` — any hit means it is not yet in the wrapper format.
