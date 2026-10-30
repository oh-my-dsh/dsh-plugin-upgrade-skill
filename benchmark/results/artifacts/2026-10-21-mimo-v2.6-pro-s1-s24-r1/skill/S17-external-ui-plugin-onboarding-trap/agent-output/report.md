# S17 · The External UI Plugin Onboarding Trap — incident report

Mode: plugin-upgrade skill **Mode A (inspect, read-only)** — diagnosis and prevention design only.
Nothing under `fixture/` was modified; no migration, install, or publish was performed.
Evidence below is cited by fixture file (primary evidence) and by skill reference card ID with
key points only (per the citation budget). Statements marked *(inference)* are engineering
conclusions drawn from the evidence, not literal fixture text.

---

## 0. Evidence index

| Artifact | What it proves |
|---|---|
| `fixture/browser-error.txt` | Failure 1: whole-combo load failure; the error HEAD names `0c013085 (@deepseek-ai/dsh-typert-registry)`, the error TAIL names the real culprit path `/plugins/@lhh010/dsh-profiles/lib/client.js` compile error (position 1:1); zero plugins registered |
| `fixture/plugin/lib/client.js` | The culprit bundle as written: bare ESM `import` at line 1 col 1, plus a bare `ctx.slots.register` of `settings.section` with `kind`/`scope` |
| `fixture/profile/cordis.patch.yml` | The 3 `insert` rows of the profile patch layer (brand-version, file-trace, the new dsh-profiles) — the bisect surface |
| `fixture/plugin-apply-error.txt` | Failure 2: `slot "settings.section" is not declared (a parent entry's children table must declare it)` at apply time; every other plugin loads |
| `fixture/host-boot-log.txt` | Failure 3: `client-modules: composed 53 loader entries into client bundle combo (4.5 MB, classic script)` — once per boot; EADDRINUSE after a "restart" until the tree was force-killed |
| `fixture/restart-notes.txt` | Dev-loop observations: boot-time combo assembly/caching, orphaned node process on Windows, post-restart verification steps |
| `fixture/working-plugin-excerpt.txt` | The correct packaging shell: `window.__ModuleLoader__.load({ id, factory })` + CJS shim + `require(...)` + `inject`/`apply` exports |

Reference cards used (IDs + key points only): troubleshooting rows `Failed to load plugins…` /
`slot … is not declared…` (plugin-upgrade `references/troubleshooting.md`); **DSH-0.1.2-A1-26**
(registration id == package.json name, `__ModuleLoader__.load` contract, combo route
`/plugins/??<pkg>/client.js&rev=…`); **DSH-0.1.2-A1-19** (boot manifest `window.__DSH_BOOT__`,
token URL, "200 alone proves nothing" acceptance rule); **DSH-0.1.5-A1-20** (one dropped/broken
combo module fails EVERY client plugin's registration; the named entry is the first awaited one
and is innocent; attribution probe: fetch one module vs the combo at the same rev); **DSH-0.1.7-A2-04**
(client bundles are read and cached at host boot — an install-tree client edit needs a host
restart; Web pages auto-reconnect, so verify served bytes); **DSH-0.1.1-R1-03** (client-modules
scans only packages declaring `dsh.client`); **DSH-0.1.2-A1-25** (`dsh.client.inject` phantom
rows keep the row out of the graph); **DSH-0.1.7-J1-34** (`settings.launcher` / `settings.models.sign-in`
seats: "the settings shell declares the seat in its children", register via
`ctx.slots.inject(name, () => ctx.slots.register(...))` because cross-package apply order is
unconstrained); **DSH-0.1.7-J1-30** (slot/factory declaration shape); example `06-real-world-batch-migration`
(the exact inject-wrapped registration form and the `inject`/devDeps notes).

---

## 1. Failure 1 root cause — one ESM token zeroes the whole roster

**What the host assembles and in what form it reaches the browser.** At boot the host's
client-modules scan enumerates installed packages that declare `dsh.client` (DSH-0.1.1-R1-03),
reads each entry's `lib/client.js`, and composes ALL of them into **one client bundle combo** —
the boot log line `composed 53 loader entries into client bundle combo (4.5 MB, classic script)`
is literal: 53 loader entries concatenated into a single 4.5 MB **classic (non-module) `<script>`**
served at a revisioned combo route (`/plugins/??<pkg>/client.js&rev=…`, advertised through
`window.__DSH_BOOT__`, DSH-0.1.2-A1-19). The combo is a concatenation of
`window.__ModuleLoader__.load({ id, factory })` calls (see the working excerpt).

**Why one plugin takes down every plugin.** A classic script is compiled as ONE Script-grammar
program before any of it executes. The user's bundle starts with `import React from 'react'`
(fixture `plugin/lib/client.js` line 1) — an `import` declaration is only legal in Module grammar,
so the *entire* combo is a parse error at compile time. Nothing executes: not a single
`__ModuleLoader__.load` call runs, so **zero** entries register — including the two stock plugins
that worked before the insert (browser-error.txt: "Settings → Plugins → Plugin list: EMPTY").
This is the shared-combo blast radius also documented as one-dropped-module ⇒ every client
plugin's registration fails (DSH-0.1.5-A1-20).

**Why the error named `dsh-typert-registry`.** The client loader boots by awaiting loader entries
in roster order; the combo's compile failure surfaces at the **first awaited entry**, so the
message head attributes the failure to `0c013085 (@deepseek-ai/dsh-typert-registry)` — a stock,
unmodified host package that is merely first in the await order (troubleshooting row: "the named
`<id>` is only the first awaited entry … innocent"). The same error line's tail carries the real
attribution: `client-modules: bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error
(position 1:1)` — position 1:1 is exactly the `import` token at line 1, col 1 of the user's bundle.
The innocent entry is a red herring produced by await-order naming; the culprit path is in the
message body.

---

## 2. Diagnosis discipline

**Read the whole error before touching anything.** The head names the first awaited entry; the
tail names the offending bundle path and position. In this incident the culprit was already
printed — the mistake was reading only the head and suspecting a stock package.

**Cheap static check that flags the offending bundle (run before any bisect).** The failure is a
*compile* error, so it is reproducible offline per file, with no host and no browser:

- classic-script parse each installed plugin's `lib/client.js` — e.g. `node --check <file>`
  (CJS goal → "Cannot use import statement outside a module") or `node -e "new
  (require('vm').Script)(require('fs').readFileSync(p,'utf8'))"`. Exactly one file throws, at
  position 1:1 — the culprit. (The same check belongs in CI, see §5.)
- or a one-line grep over the same files: `rg -n '^\s*(import|export)\b' **/lib/client.js` —
  bare ESM tokens in a shipped client bundle is the smell; conversely
  `rg -n '__ModuleLoader__|PLUGIN_ID'` (pre-flight touchpoint #5 pattern) flags a bundle that
  lacks the required wrapper.

**What to bisect if static checks are inconclusive.** The profile patch layer's `insert` rows
(`fixture/profile/cordis.patch.yml` — exactly 3: dsh-brand-version, dsh-file-trace, dsh-profiles)
is the natural unit: disable half the rows (the new row first), reboot, and observe the roster
come back; DSH-0.1.5-A1-20's attribution probe applies here too — fetch one single-module route
and the combo at the same rev: single OK + combo broken ⇒ combo content, i.e. one member's bytes,
not the host artifact set. Never start by editing the innocent named entry.

**The client-bundle format an external plugin must ship instead of bare ESM** (fixture
`working-plugin-excerpt.txt`, troubleshooting row 13, DSH-0.1.2-A1-26):

```js
window.__ModuleLoader__.load({
  id: "<package.json name>",              // == package.json#name (tsdown banner PLUGIN_ID)
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    let react_jsx_runtime = require("react/jsx-runtime");          // host module table
    let ui = require("@deepseek-ai/dsh-client-ui-primitives");     // host module table
    /* components ... */
    const inject = ["slots"];              // ctx services this plugin waits on
    function apply(ctx) { /* ctx.slots.inject(...) registrations */ }
    return module.exports;
  },
});
```

- **What wraps the code**: a CJS-style factory handed a `require` function; the whole client half
  lives inside `factory`, prefixed with the `module`/`exports` shim and the
  `Symbol.toStringTag` marker, returning `module.exports`. The shipped artifact is this wrapper
  call — never a bare ESM module, never a self-executing top-level script.
- **How React is obtained**: via the factory's `require("react")` / `require("react/jsx-runtime")`
  (and other host UI packages via `require("@deepseek-ai/dsh-client-ui-primitives")`) — supplied
  by the host's module table at load time. Do **not** ESM-import React, do not bundle React into
  the plugin, and do not hard-require cohort-unique modules during factory evaluation
  (rollup R-02 "missed the module table").
- **What the wrapper must export**: `apply(ctx)` — the activation entry the loader calls — and
  `inject`, the list of ctx service names the plugin waits on (here `["slots"]`; e.g. `'uiWorkspace'`
  per DSH-0.1.2-A1-32). The registration id must equal `package.json#name`, and the profile
  assembly row's `name` must be the bare package name (DSH-0.1.2-A1-26's three-ids rule).
- Side note on the culprit file beyond the import: it runs `document.body.appendChild` and
  `createPortal` at module evaluation. Evaluation-time DOM side effects inside a shared combo are
  fragile; all work belongs in `apply`/components *(inference, flagged as good practice)*.

---

## 3. Failure 2 — `slot "settings.section" is not declared …`

**What the error means.** The slot tree is declarative: a slot name exists only when some entry
**declares** it in its own **children table** — the slot contract of the entry that renders/owns
the parent surface. At apply time the loader validates each registration against the declared
tree; a registration naming an undeclared slot is rejected with
`slot "<name>" is not declared (a parent entry's children table must declare it)`.

**Who declares slots.** The **owner/parent entry** declares the seats of its surface in its
children table (the "slot contract", e.g. the settings shell declaring seats in its own contract
file — DSH-0.1.7-J1-34 states it directly for the settings seats: "the settings shell declares
the seat in its children"). `settings.section` belongs to the settings-surface owner; a third-party
plugin may **fill** that seat but may not declare it. A plugin that invents a genuinely new surface
declares its own slots in its **own** entry's children table (DSH-0.1.7-J1-30 shape).

**Why a bare registration of another entry's slot fails at apply time.** The culprit calls
`ctx.slots.register({ name: 'settings.section', id: 'profiles-manager', order: 5, kind: 'section',
scope: 'settings' }, ProfilesSection)` directly. That both (a) treats a foreign seat as its own
declaration and (b) relies on the owner's declaration already existing — but cross-entry apply
order is **undefined/unconstrained**, so the registration can run before the declaring entry's
children table lands ⇒ apply-time rejection (plugin-apply-error.txt; only this entry fails, the
rest of the fleet renders normally — failure 2 is plugin-local, unlike failure 1).

**The exact wrapping form.** Defer the registration until the declaration exists:

```js
const inject = ["slots"];
function apply(ctx) {
  ctx.slots.inject('settings.section', () => ctx.slots.register(
    { name: 'settings.section', id: 'profiles-manager', order: 5 },
    ProfilesSection,
  ));
}
```

`ctx.slots.inject(name, () => ctx.slots.register(...))` queues the contribution on the declaring
entry's slot and fires it when the parent's children table declares the name — the standard form
for cross-entry seats (troubleshooting row 14; DSH-0.1.7-J1-34 "Register through
`ctx.slots.inject(name, () => ctx.slots.register(...))` so the contribution waits on the declaring
plugin's slot declaration (cross-package apply order is unconstrained)"; example 06 shows the
same rewrite from a bare register).

**Which fields a registrant may pass, and which it must not.** Registrant-owned: `name` (the
declared slot name), its own `id`, `order` (and `label` where the seat type has one) — nothing
else. Declaration-owned — **must not** be passed by a registrant: `kind`, `scope` (and `children`/
contract typing). The culprit passed `kind: 'section', scope: 'settings'`; both belong to the
parent's declaration and are illegal on a registration.

---

## 4. Dev-loop discipline

**Why the combo is not rebuilt when plugin files change.** The combo is assembled **once, at host
boot**: the host reads every installed plugin's `lib/client.js`, concatenates them into the single
classic-script combo and caches those bytes in the running process (restart-notes.txt; boot log's
combo line appears once per boot = the assembly moment). Since 0.1.7 this caching is explicit
behaviour (DSH-0.1.7-A2-04: "client bundles are cached at host boot … editing a served
`lib/client.js` on disk NO LONGER takes effect on page refresh alone; only a host restart serves
the new bytes"). So an edit changes disk bytes only; the running host keeps serving the cached
combo — even a hard refresh fetches stale bytes. Worse, the same card notes Web pages now
auto-reconnect across a server restart and may keep running **pre-restart** client bytes, so "the
page responds" is not proof; fetch the served combo URL and inspect the bytes.

**The correct restart procedure** (per iteration):
1. edit → **rebuild** the plugin's client bundle (the combo consumes the built `lib/client.js`);
2. **fully stop the host process** — verify no surviving node process; closing the browser tab or
   the launching terminal is NOT a host stop (same discipline as the Windows file-lock/EBUSY row
   and the global-upgrade note in SKILL.md);
3. start `dsh web` again and confirm a fresh `client-modules: composed … combo` line (one per boot);
4. browser **hard refresh**, then check Settings → Plugins → Plugin list (empty list = the combo
   failed again) and verify the served combo bytes actually contain the edit.

**Why the Windows restart died with EADDRINUSE until the tree was force-killed.** Closing the
launching terminal tore down the console but left the spawned node host alive — the orphan kept
the listening socket open. The "restart" then failed to bind (`EADDRINUSE`) because the port was
genuinely still held by that surviving process (host-boot-log.txt). Because the orphan is a child
of the now-dead console, only killing the whole process tree removed it:
`taskkill /PID <pid> /T /F`; the next boot then bound normally (restart-notes.txt item 2).
Discipline: stop via tree-kill, confirm the port is free / no node process remains, then boot.
(This is the same "a browser refresh is not a host stop" boundary as the skill's global-upgrade
rule and the Windows EBUSY row.)

---

## 5. Prevention

### 5.1 Host-side (startup / combo-failure time)

1. **Per-bundle compile gate at assembly.** Before composing, parse each scanned `lib/client.js`
   as a classic script (the cheap static check from §2) and log/refuse per package:
   `client-modules: @lhh010/dsh-profiles/lib/client.js compile error (position 1:1) — excluded`.
   A boot-time per-entry table (declared / compiled / registered, printable via `--dump-config`
   or the boot log) turns "53 entries composed" into named per-plugin status.
2. **Name the owner of the failing bytes, not the first awaited entry.** The combo is assembled
   from known per-entry byte ranges; map a compile/runtime error offset back to the owning entry
   and put that path at the **head** of the browser error (today it is only in the tail), with the
   innocent first-awaited entry demoted to context. Keep per-entry markers/comments around each
   segment so the mapping is mechanical.
3. **Fail-soft per entry.** Import/apply errors in one entry should not zero the roster: catch
   per-entry failures, skip that plugin with a named error, and register the rest (today zero
   entries register from one bad byte range).
4. **Bisect affordances at combo-failure time.** Emit the roster + which entry's bytes failed to
   parse, and keep the single-module route fetchable so the DSH-0.1.5-A1-20 probe (single 200 +
   combo fail ⇒ combo content) needs no guesswork.
5. **Contract lint at scan time.** Registration id ≠ package name is already asserted
   (DSH-0.1.2-A1-26); add the two cheap ones surfaced here: bare top-level `import|export` in the
   artifact, and a bare `ctx.slots.register` of a name not in any declaring entry's children table
   — reporting the plugin name at apply time as failure 2 already does.

### 5.2 External-plugin authoring template / checklist

**Manifest** — `package.json#name` is the registration id and the assembly-row name (bare package
name); declare `dsh.client` (`platform: web` + client entry) or the client half is never scanned
(DSH-0.1.1-R1-03); `dsh.client.inject` lists exactly the packages the factory `require`s — no
phantom rows (DSH-0.1.2-A1-25) and no host-mounted packages the plugin does not import; DSH peer
range matches the host cohort.

**Build** — emit the `window.__ModuleLoader__.load({ id: PLUGIN_ID, factory })` wrapper with the
CJS shim and `Symbol.toStringTag`; `PLUGIN_ID` banner equals the package name; `react`,
`react/jsx-runtime`, and host UI packages are **externalized** and obtained through the factory's
`require`; exports are `apply(ctx)` plus `inject` (e.g. `["slots"]`).

**Static gates on the shipped artifact (CI, seconds)** —
(a) classic-script parse succeeds (`new vm.Script(code)` / `node --check`);
(b) `rg -n '^\s*(import|export)\b' lib/client.js` is empty;
(c) `__ModuleLoader__.load({ id: "<package name>"` present and id == `package.json#name`;
(d) no DOM/global side effects at module evaluation — everything inside `apply`/components;
(e) `dsh.client.inject` matches the actual `require` set.

**Slots** — contribute to another entry's seat ONLY as
`ctx.slots.inject(name, () => ctx.slots.register({ name, id, order }, Comp))`; pass only
`name`/`id`/`order`(`label`) — never `kind`/`scope`; declare new surfaces' slots in your own entry's
children table.

**Dev loop & acceptance** — rebuild → full host stop (Windows: tree-kill `taskkill /PID <pid> /T /F`,
confirm the port is free) → restart → hard refresh → Plugin list non-empty → fetch the served
combo bytes and confirm the edit → then the DSH-0.1.2-A1-19 smoke: token URL exchange,
`window.__DSH_BOOT__.entries` contains your id, the advertised/combo resource returns 200 **and
contains** your `__ModuleLoader__.load` registration, a DOM marker of your plugin appears, and the
page error collector is empty (a bare HTTP 200 proves nothing).

**Incident → gate mapping (each failure gets one gate):** Failure 1 ⇒ static gate (a)+(b)+(c);
Failure 2 ⇒ the slot-wrapper rule + field whitelist (e)…plus the inject-wrapped register form;
Failure 3 ⇒ the restart procedure with tree-kill and the served-bytes check in acceptance.

---

## run-stats

- toolcalls 总数: 37 — run_code 程序 7 次 + 嵌套工具 29 次（read 18、glob 2、grep 6、write 3）+ send_message 1 次
- token 用量: n/a（本会话未暴露逐调用 token 计数）
- 完成时间: 2026-10-21T07:20:25.351Z（UTC；采样起始 2026-10-21T15:13:07+08:00）
- 产物: agent-output/report.md（本文件）、agent-output/tool-transcript.txt、agent-output/transcript-manifest.txt
- 边界遵守: fixture/ 逐字节未改动；未执行任何迁移/安装/发布；仅读取本格目录与 skills/plugin-upgrade/ 白名单。
