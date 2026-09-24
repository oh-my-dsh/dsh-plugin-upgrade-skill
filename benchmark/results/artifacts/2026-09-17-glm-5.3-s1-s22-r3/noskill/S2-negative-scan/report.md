# S2 · Negative Scan — @demo/dsh-minimal-llm (0.1.1-rc.2 style → dsh 0.1.2-alpha.2)

Read-only touchpoint scan of the static fixture copy at
E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\tasks\S2-negative-scan\environment\fixture
(5 files: package.json, cordis.patch.yml, index.js, src/session-notes.js, README.md). No file
under the fixture was modified; dsh is not installed in the fixture environment, so nothing was
executed against a real host — this is a static scan plus corridor reasoning, exactly the
"zero hits ≠ compatible" setting the task names.

## Corridor and identity

- Declared plugin: `@demo/dsh-minimal-llm` v0.1.0, private, ESM (`"type": "module"`), entry `index.js`.
- Declared DSH dependency: `"@deepseek-ai/dsh-host-apiproxy": "0.0.1-rc.1"` in `dependencies` — the rc.2-era
  APIProxy host package. `index.js` self-describes as "0.1.1-rc.2 style". So the migration corridor is
  **dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.1 → dsh-v0.1.2-alpha.2**, read as a whole (net state folded) —
  not a single rc.2→alpha.2 jump.
- Profile composition: `cordis.patch.yml` inserts one loader row (id `minimal-llm`, package
  `@demo/dsh-minimal-llm`). This is composition, not a source patch (API-08 classification).
- Face: ordinary host-side Cordis plugin (no `dsh.client` manifest, no client code). The migration
  rules for Web Client plugins (ctx.remote.* table) do NOT apply to it.

## Touchpoint checkup (@demo/dsh-minimal-llm, 0.1.1-rc.2 → 0.1.2-alpha.2)

| Touchpoint | Hit | File/line | Applicable card | Confidence note |
|---|---:|---|---|---|
| #1 source patch / monkey patch | No | — | — | No `patchedDependencies`, `patch-package`, `DSH_HARNESS_SOURCE_ROOT`, or monkey-patching anywhere. `cordis.patch.yml` is profile composition (a filename containing "patch" is not a hit for this class). |
| #2 internal events / persistent events | No | — | — | No `ctx.on(`, `SessionEvent`, `subscribe(`, or dispatch/event vocabulary in any file. Plugin only consumes; produces no events. |
| #3 internal service probes / Remote | **YES** | index.js:2 (`export const inject = ["apiProxy"]`), index.js:8 (`ctx.apiProxy.llm.providers()`) | **DSH-0.1.2-A1-01** (breaking); secondary **DSH-0.1.2-A2-02**, **DSH-0.1.2-A2-03** | Host-plane plugin injects the rc.2 service key `apiProxy` and makes a dot-domain call. The `apiProxy` service and the whole `@deepseek-ai/dsh-host-apiproxy` package are deleted in alpha.1. |
| #4 direct host directory reads/writes | No | — | — | No `DSH_HOME`, `.dsh`, `homedir()`, `readFile`/`writeFile`/`mkdir`/`openPath`. No filesystem access at all. |
| #5 internal UI / commands / tool registration | No | — | — | No `registerCommand`, `ctx.tools`, slots, `dsh-client-runtime`, `useSession`/`useChat`, or client registration ids. |
| #6 custom HTTP / WS / RPC / DOM / CSS channels | No | — | — | No `createServer`, WebSocket, router, `/api/`, loopback addresses, DOM/CSS manipulation. The `console.error` logging in index.js is process stderr, not a channel. |
| #7 subprocess / stdout / stderr parsing | No | — | — | No `child_process`, `spawn`/`exec`, `execa`, no headless/`--profile` wrapper logic. `console.error` output is written, never parsed. |

Deliberate false-positive check: `src/session-notes.js` looks suspicious only by filename
("session" in the name). Its two exports (`formatSessionNote`, `chunk`) are pure string/array
utilities touching no host coupling surface — zero hits in all seven classes. The name is a
historical naming habit, not a touchpoint.

No-hit notes: scan covered all 5 fixture files (there is no test/, script/, CI, or lockfile in the
fixture). Dependencies and profile composition were checked separately from the seven classes —
see below; that plane is where the real incompatibility lives.

## Hit touchpoints → change cards

### DSH-0.1.2-A1-01 · APIProxy removed, Host/Web Client calls moved to @Remote (breaking, required-if-hit)

Evidence: `index.js` line 2 `export const inject = ["apiProxy"]`; line 8
`const providers = await ctx.apiProxy.llm.providers()`. `package.json` dependencies pin
`@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1`.

Consequences on an 0.1.2-alpha.2 host:

1. The `@deepseek-ai/dsh-host-apiproxy` package no longer exists in the target cohort. A
   dependency-resolution migration that keeps this row fails at install, and the DSH cohort must
   be exact and coherent (no mixed old/new peers).
2. Even if loading were forced, the `apiProxy` service never appears: the plugin's `inject`
   keeps the entry permanently `pending (waiting for service: apiProxy)` — a silent never-activates
   failure, not a crash.
3. Correct migration for this face (ordinary **host-side** Cordis plugin, per the card's field
   note: the old `apiProxy` is the host-plane facade and `ctx.remote.*` is the browser-plane
   facade — they are not interchangeable): skip the gateway and inject the domain service behind
   it directly:
   - `inject: ["llm"]`, then call the LLM service methods in place of `llm.providers()`. Note the
     operation split in the card table: old `llm.providers` becomes TWO results on the target
     (`listProviders` + `listConfigurableProviders` equivalents) — decide which one (or both) the
     plugin actually needs; do not assume a 1:1 rename.
   - Do NOT switch to `inject: ["remote"]`; on the host plane that produces the same permanent
     pending symptom.
4. Keep the call inside `ctx.effect()` (already the case) and handle the failure branch; this is
   a behavioral probe, so success plus one business-failure branch is the minimum coverage.

### DSH-0.1.2-A2-02 · Remote failures become RemoteError instances (conditional)

Directly applicable only if the call were migrated to the client-plane `ctx.remote.*` table. For
the recommended host-plane `ctx.llm.*` service injection this card does not govern the call
itself; the `catch (error)` in index.js stays but should not be turned into a defensive
code-string branch. Listed because #3 is its touchpoint class and the corridor must be read as a
whole.

### DSH-0.1.2-A2-03 · NPM packages trim/adjust peer dependencies (conditional, packaging plane)

Not a source touchpoint but it owns the other required change: `package.json` must drop the
deleted `@deepseek-ai/dsh-host-apiproxy` dependency and keep the DSH cohort exact and coherent
across install/lockfile. A successful install with mixed old/new peers is not a migration.

### Composition observation (no card hit)

`cordis.patch.yml` inserts row id `minimal-llm` for package `@demo/dsh-minimal-llm`. For a
host-side plugin this is ordinary composition and survives the corridor; but note the related
naming rule from the corridor (client-modules registration id must equal package.json name) — if
this plugin ever gains a client face, the id/name mismatch becomes a real defect. Record, do not
change now.

## Question 3: do the zero-hit categories prove compatibility with 0.1.2?

**No. Zero hits across six of seven classes does NOT mean this plugin is compatible — and in this
case it is provably NOT compatible as-is.** Three grounds:

1. **The scan is heuristic, not proof.** The pre-flight patterns detect known coupling shapes;
   "no hit" only means "not detected by the current patterns". Cards are a curated list, not a
   complete API diff, and this fixture has no lockfile, tests, or CI to widen the evidence.
2. **The single hit is itself a breaking card.** Category #3 is hit, and it maps to
   DSH-0.1.2-A1-01 (type: breaking, action level: required-if-hit). On the target host the plugin
   never activates (service `apiProxy` gone) and its pinned dependency package no longer exists.
   "Tiny plugin, mostly zero hits" and "compatible" are different claims; here the one hit is
   fatal.
3. **The dependency/configuration plane is outside the seven source classes and was checked
   separately.** `package.json` pins a deleted package (A1-01/A2-03 territory). A source scan
   that only counts touchpoint hits would have missed the install-time failure entirely.

What is still needed before any compatibility conclusion (mandatory post-migration steps — this
task does not run them, the fixture is a non-executable static copy):

1. Dependency resolution: install with the plugin's real package manager in an isolated
   directory; scan the full lockfile for the old cohort and for `dsh-host-apiproxy` residue, not
   just top-level deps.
2. Build/typecheck of the migrated plugin source (and, if TypeScript is ever adopted, one
   diagnostic typecheck with skipLibCheck: false when selectors go any).
3. Isolated-profile cold boot on the exact 0.1.2-alpha.2 tag: verify the entry activates and no
   required/provided service stays pending (the pre-migration signature of this plugin would be
   exactly a forever-pending `apiProxy` wait).
4. Functional smoke: one message → tool → response flow or the plugin's equivalent dedicated
   path — here, the migrated provider-listing probe succeeding on stderr, plus its failure branch.

## Bottom line

- Hit: only #3 (services/Remote). Cards: DSH-0.1.2-A1-01 (primary, breaking), DSH-0.1.2-A2-02
  (conditional), DSH-0.1.2-A2-03 (packaging plane). Migration: drop `@deepseek-ai/dsh-host-apiproxy`,
  `inject: ["llm"]`, replace `ctx.apiProxy.llm.providers()` with the split provider-listing calls
  on the `llm` domain service.
- The six zero-hit categories prove nothing about compatibility; the plugin is NOT compatible
  with 0.1.2-alpha.2 as-is, and even after the source fix, compatibility is only proven by the
  four verification steps above (dependency resolution, build/typecheck, isolated cold boot,
  functional smoke) — not by scan statistics.
