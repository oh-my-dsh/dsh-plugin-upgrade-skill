# S2 · Negative Scan Report — @demo/dsh-minimal-llm migration to dsh 0.1.2-alpha.2

**Scan mode:** read-only static scan of the fixture source (no file under the fixture was modified; no migration, install, or boot was executed).
**Fixture:** `@demo/dsh-minimal-llm@0.1.0` — 5 files: `index.js`, `package.json`, `cordis.patch.yml`, `src/session-notes.js`, `README.md`.

> Note on taxonomy: no skill/card catalog was injected into this session, so the seven touchpoint categories below are derived from the DSH architecture (host capability services, Remote RPC, plugin halves, session events, tools, client UI, manifest/config coordinates) and checked one by one. Change cards are therefore named descriptively rather than by an external card id.

## 1. Hit / no-hit per touchpoint category

| # | Category | Verdict | Evidence |
|---|----------|---------|----------|
| 1 | Host capability services via `inject` + `ctx.<service>` | **HIT** | `index.js`: `export const inject = ["apiProxy"]`; `ctx.apiProxy.llm.providers()` inside `ctx.effect()`. `apiProxy` is a 0.1.1-rc.2-era internal service name (dot-domain Remote style). |
| 2 | Remote RPC surface (dot-domain Remote calls / RPC client) | **HIT (same site)** | `await ctx.apiProxy.llm.providers()` is the old Remote calling convention; the whole plugin exists to exercise this path. |
| 3 | Manifest & dependency coordinates (`package.json`) | **HIT (correlative)** | `dependencies: { "@deepseek-ai/dsh-host-apiproxy": "0.0.1-rc.1" }` — a pinned pre-0.1.x coordinate for the removed apiProxy host package. |
| 4 | Client half / slots / theme / locale | **No hit** | No `client.js`, no slot/theme/React code, no UI copy anywhere in the fixture. |
| 5 | Session events / session-log format | **No hit** | No event emission, no `SessionEventMap` references. `src/session-notes.js` only *sounds* like a session touchpoint: its two exports (`formatSessionNote`, `chunk`) are pure string/array utilities with zero host coupling — filename is a historical naming habit, a designed false positive. |
| 6 | Model-visible tools registration | **No hit** | No `ctx.tools.register`, no tool definitions, nothing model-visible. |
| 7 | Config composition (`cordis.patch.yml`) | **No hit (format-level)** | A single `insert:` of plugin id `minimal-llm` / name `@demo/dsh-minimal-llm`. No overlay variants, no `!!js`, no cross-tree references. Format looks current; not proof of correctness (see §4). |

Runtime cross-check (successor runtime, evidence only): the installed `@deepseek-ai/dsh` runtime (0.1.6-alpha.1, a later release on the same line as 0.1.2-alpha.2) contains **zero occurrences of `apiProxy`** in its shipped `lib/` and no `dsh-host-apiproxy` package in its dependency tree; capability services are consumed as `inject: ["web"]` + `ctx.web.search(...)`-style calls. The old service name and its host package are gone from the platform line, which is exactly what the #1/#2/#3 hits depend on.

## 2. Hit touchpoints → change cards

- **Card A — "internal service / Remote: apiProxy removed, replaced by the current capability-service + Remote RPC model."**
  Applies to hit #1/#2. `inject: ["apiProxy"]` will never be satisfied on 0.1.2-alpha.2 (Cordis keeps the plugin waiting on a service no provider publishes), and even if injected, `ctx.apiProxy.llm.providers()` targets a removed dot-domain RPC surface. Migration: identify what the plugin actually needs (listing LLM providers) and re-express it against the 0.1.2-alpha.2 surface — the LLM capability's Service Definition (provider list query) or, for Remote-style calls, the current package-private RPC convention. The diagnostic logging around the call should be kept so the post-migration smoke test has an observable signal.
- **Card B — "dependency coordinates refresh: stale host-package pins."**
  Applies to hit #3. `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1` must be removed (the package no longer exists on the 0.1.2 coordinate set; install/resolution fails or silently drifts). Per repo convention the host runtime is a `@deepseek-ai/cordis` peer dependency, not a pinned host-package dependency.

No other change cards apply: no client half, no session events, no tools, no UI, and the patch YAML uses the plain insert form.

## 3. Do the zero-hit categories prove 0.1.2 compatibility? — **No.**

Judgment: **zero hits ≠ compatible.** The scan yields only negative evidence of a specific, narrow kind:

1. **Absence of reference is not absence of breakage.** A static scan can only certify "this source does not *name* a changed surface." It cannot certify that surfaces the plugin uses implicitly (loader semantics, ESM resolution, effect/inject lifecycle timing, Node engine range, config-tree mounting of the patch entry) are unchanged between 0.1.1-rc.2 and 0.1.2-alpha.2.
2. **This plugin is *known* incompatible already.** The one category it does hit (#1/#2/#3) is a hard break: an unsatisfied `inject` service plus a dead dependency coordinate. So the question "is the rest compatible" is moot until Cards A/B are applied — and the migration itself will touch `index.js` and `package.json`, re-opening the possibility of new incompatibilities the pre-migration scan never saw.
3. **Scan coverage is only as good as the category list.** If the 0.1.2-alpha.2 change set contains a change outside my seven derived categories (or outside the fixture's visible source — e.g. transitive deps, bundle patch loading rules such as duplicate-id insert guards), a zero-hit scan says nothing about it.
4. **Runtime-only failures are invisible statically:** plugin id collisions in the target profile, service-provision ordering, and peer-range vs runtime mismatches all surface only at boot.

## 4. What is still required before concluding compatibility (mandatory post-migration steps)

1. **Build / typecheck** the migrated plugin against the 0.1.2-alpha.2 type surface (catches renamed service methods the scan guessed about).
2. **Isolated-profile cold boot** with only this plugin mounted: confirms `cordis.patch.yml` insert is accepted (no duplicate-id boot crash), the `inject` service resolves, and the plugin reaches `apply()`.
3. **Functional smoke test** of the one behavior: the provider-listing call succeeds (or fails loudly with a real error), verified via the plugin's stderr diagnostics.
4. **Install/resolution check**: fresh install of the profile with the updated `package.json` (Card B) to prove no dead coordinates remain.

Only after 1–4 pass is "compatible with 0.1.2-alpha.2" a supported conclusion.

## 5. Scan integrity

- Files read: all 5 fixture files, in full.
- Files modified: none (fixture and benchmark repo untouched; only this report was written).
- Commands run: read-only globs/greps against the fixture and the local installed `@deepseek-ai/dsh` package for runtime cross-evidence.
