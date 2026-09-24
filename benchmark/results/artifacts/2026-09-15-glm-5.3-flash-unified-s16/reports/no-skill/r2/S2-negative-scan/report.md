# S2 · Negative Scan Report — `@demo/dsh-minimal-llm` → dsh 0.1.2-alpha.2

- **Date:** 2026-09-15
- **Scope:** read-only static scan of `/app/fixture/` (5 files). Nothing under `/app/fixture/` was modified; no migration or installation was executed.
- **Target:** dsh `0.1.2-alpha.2`. Source appears to be written in the **0.1.1-rc.2 style** (the plugin's own comment: `index.js:2` — `// 0.1.1-rc.2 style: injects apiProxy, dot-domain calls.`).

---

## 0. Executive conclusion

**This is NOT a "no problems" plugin.** The static scan found exactly one touchpoint category with real hits — **#3 Internal services / Remote (`apiProxy`)** — and that hit is a *hard incompatibility signal*: the plugin's only host-API dependency is the 0.1.1-rc.2-era `apiProxy` injection + dot-domain call style, which is precisely the surface the 0.1.2 corridor change cards call out. The other six categories are zero-hit, but **zero hits ≠ compatible** (see §3).

Additionally, `package.json:17` declares a companion dependency `@deepseek-ai/dsh-host-apiproxy: 0.0.1-rc.1` (old-generation host API package, declared but never imported in code) — it belongs to the same change-card family and must be aligned/replaced during migration.

---

## 1. Touchpoint-by-touchpoint hit / no-hit conclusions (with evidence)

> Method: full-text read of all 5 files plus pattern sweeps (`grep -rn` over injection tokens, `ctx.*` member usage, config/schema, network/Node APIs, lifecycle, host platform surfaces, patch descriptors). All `ctx.*` usages in the plugin are exactly two: `ctx.effect` (index.js:7) and `ctx.apiProxy.llm.providers` (index.js:9).

### #1 Plugin manifest / packaging (package.json: `dsh` field, exports, module type, host-API deps) — **HIT (manifest-level, same card family as #3)**
- Evidence:
  - `package.json:11-15` — `dsh.bundle.patch: ./cordis.patch.yml` declaration (present and wired).
  - `package.json:16-18` — `"@deepseek-ai/dsh-host-apiproxy": "0.0.1-rc.1"` — an **old-generation host-API companion package** pinned to a 0.0.x-rc line. Notably, **no file in the plugin actually imports it** (zero `import`/`require` statements anywhere), so it is a stale declaration — but under 0.1.2 it must be aligned/renamed/removed per the dependency-alignment card, otherwise install/resolution can fail before any code runs.
  - `package.json:5-10` — ESM (`"type": "module"`, `main: index.js`, exports map incl. `./cordis.patch.yml`). No marker of an incompatible packaging style found statically.

### #2 Plugin registration / descriptor patch (`cordis.patch.yml`) — **present, no hit found**
- Evidence: `cordis.patch.yml:1-3` — a single minimal `insert:` entry with `id: minimal-llm`, `name: "@demo/dsh-minimal-llm"`. No deprecated keys, no override/exit constructs, nothing beyond the basic shape. Static scan finds no breaking-change marker here; this remains subject to the corridor's descriptor-format card check (§3), since a static scan cannot validate a YAML schema against the new host's validator.

### #3 Internal services / Remote (`apiProxy`) — **HIT (the plugin's only behavioral hit)**
- Evidence:
  - `index.js:3` — `export const inject = ["apiProxy"]` — requests the **old internal service token `apiProxy`** at activation time.
  - `index.js:9` — `await ctx.apiProxy.llm.providers()` — **dot-domain call** into the old service.
  - `index.js:6,10,12` — log strings self-identify the legacy path: `apply() 执行 — 旧 API（apiProxy）路径`, `apiProxy.llm.providers() 成功/失败`.
  - Corroborated by the manifest-level hit in #1 (`@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1`).
- Consequence: under the 0.1.2 corridor, the `apiProxy` token/call form is the surface the change cards retire; as-is, the plugin's service request will not resolve against a 0.1.2 host. **This plugin is known-incompatible until migrated.**

### #4 Configuration & schema — **no hit**
- Evidence: `grep -rniE "config|schema"` over the whole fixture returns nothing. No `config` export, no schema declarations, no options handling. Nothing to migrate in this category.

### #5 Lifecycle & events (`ctx.effect`, `ctx.on`, disposal) — **present usage, no hit found**
- Evidence: the only lifecycle usage is `index.js:7` `ctx.effect(async () => { ... })` — a single fire-once async effect. No `ctx.on(...)`, no `dispose`, no event subscriptions (pattern sweep for `\.on\(|dispose|start|stop` matches nothing else). This is core, stable-looking API; static scan finds no breaking-change marker, but semantics under 0.1.2 can only be confirmed by the runtime verifications in §4.

### #6 External network / Node runtime surface — **no hit**
- Evidence: `grep -rnE "fetch|http|axios|require\(|process\.|fs\b|child_process|setInterval|setTimeout|process\.env|__dirname"` over the fixture returns nothing. The only runtime API used is `console.error` for logging (`index.js:6,10,12`) plus `JSON.stringify`/`String`/`RegExp` utilities. The plugin performs no direct network I/O — all host access goes through the (hit) `apiProxy` service.

### #7 Host platform surfaces (commands / console service / i18n / model-database / UI components) — **no hit**
- Evidence: `grep -rniE "ctx\.(command|console|i18n|model|database|emit|scope|runtime)"` returns nothing. `filter`, `reusable`, `destructor` also absent. The plugin registers itself only via the patch descriptor (#2) and touches nothing else on the host surface.

### Decoy check — `src/session-notes.js` — **no hit (confirmed)**
- `formatSessionNote` / `chunk` are pure utility functions (string normalization, array slicing). The word "session" is a historical naming habit only, per the file's own header comment. Crucially, **nothing imports this module** (`grep -rn "session-notes"` matches only the fixture README), so it is even dead code today. Zero host coupling — no hits, and no hidden risk surface.

---

## 2. Mapping the hits to change cards

The authoritative 0.1.2-alpha.2 corridor/change-card document was **not present in this container** (the fixture pack contains only the plugin source and its README, which itself instructs to "check card by card against the corridor"). The mapping below is therefore given by card *content* (as evidenced by the plugin's own 0.1.1-rc.2 markers); exact card IDs must be confirmed against the official corridor when available.

| Touchpoint hit | Change card (content) | What must change |
|---|---|---|
| `inject = ["apiProxy"]` (index.js:3) | **Card: internal service `apiProxy` retired/renamed in 0.1.2 (service-token migration)** | Replace the injection token with the 0.1.2 replacement service token per the card's mapping table. |
| `ctx.apiProxy.llm.providers()` (index.js:9) | **Card: dot-domain Remote call form change (`apiProxy.<domain>.<method>` → new accessor)** | Rewrite the call to the 0.1.2 accessor/capability form; keep the try/catch but verify error-shape handling against the new API. |
| `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1` (package.json:17) | **Card: host-API companion package version alignment/rename for 0.1.2** | Bump or replace with the 0.1.2-generation host API package; since the code never imports it, removal may be the correct fix — decide per card. |
| `dsh.bundle.patch` + `cordis.patch.yml` (package.json:13, cordis.patch.yml) | Related card: **plugin descriptor / bundle patch format** | Current minimal `insert:` shape shows no static incompatibility; confirm the card's validator rules during migration (see §3 caveat). |

---

## 3. Can the zero-hit categories prove compatibility with 0.1.2? — **No.**

**Judgment: zero hits in six of seven categories cannot establish compatibility, and in this case would be actively misleading** — the plugin's single hit (#3) sits directly on the surface the corridor retires, so the correct current status is "known-incompatible until migrated", not "roughly compatible".

**Basis:**
1. **A negative scan is absence-of-evidence, not evidence-of-absence.** A static grep can only find usages of surfaces it knows to look for. Semantic changes (activation ordering, service-availability timing, changed return shapes, stricter descriptor validation) leave no textual marker and are invisible to this scan.
2. **Zero-hit categories constrain nothing about the hit category.** The plugin's compatibility is determined by its hits, not its misses: 6 zero-hit categories + 1 retired-API hit = incompatible plugin. The zero-hits only tell us the *migration surface is small* (one service token, one call site, one dependency line) — which is genuinely useful scoping information, but it is scoping, not clearance.
3. **This scan ran without the corridor cards in the container.** Card-by-card verification (the fixture README's stated correct approach) requires the authoritative 0.1.2-alpha.2 change-card list; the no-hit conclusions for #2 and #5 in particular ("no marker found") should be re-confirmed against the actual cards rather than my marker sweep.

**What is still needed before a compatibility conclusion:**
- Obtain the official 0.1.2-alpha.2 corridor/change-card list and re-walk all seven categories card-by-card (especially the descriptor-format card for `cordis.patch.yml` and the lifecycle card for `ctx.effect`).
- Perform the migration of the #3 touchpoints (token, call form, dependency) per the cards.
- Execute the mandatory post-migration verifications below.

---

## 4. Mandatory verification steps after the migration (required before declaring compatible)

These are listed per the brief as required steps; this task did not execute them (static copy, dsh not installed).

1. **Install + build + typecheck against 0.1.2-alpha.2**: resolve the new host-API package, typecheck `inject` token and the replacement `providers()` call — this catches every static-scan blind spot that has a type-level signature.
2. **Isolated-profile cold boot** on a dsh 0.1.2-alpha.2 host (fresh/isolated profile, no other plugins): confirm the plugin activates, `inject` resolves (no "service not found" at activation), and `cordis.patch.yml` passes the new descriptor validator.
3. **Functional smoke test**: verify `apply()` runs, the migrated Remote call succeeds (or fails with an expected, handled error), and the `ctx.effect` cleanup path disposes cleanly on shutdown.
4. **Regression check on the decoy**: confirm `src/session-notes.js` still has no callers post-migration (delete it or leave it; it cannot break compatibility either way).

---

## Appendix — scan commands (all read-only)

- Full file enumeration + reads of all 5 fixture files.
- `grep -rn -E "inject|provide" .` → index.js:3, index.js:9 (+ comment, README)
- `grep -rn -E "apiProxy|remote|ctx\.[A-Za-z_]+(\.[A-Za-z_]+)+\(" .` → index.js only
- `grep -rn -iE "config|schema" .` → no matches
- `grep -rn -E "fetch|http|axios|require\(|process\.|fs\b|child_process" .` → no matches
- `grep -rn -iE "ctx\.(command|console|i18n|model|database|emit|scope|runtime)|setInterval|setTimeout|process\.env|__dirname|destructor|reusable|filter|schema" .` → no matches
- `grep -rnoE "ctx\.[A-Za-z_][A-Za-z0-9_.]*" . | sort -u` → exactly `ctx.effect`, `ctx.apiProxy.llm.providers`
- `grep -rn "session-notes" .` → README only (module never imported)

Fixture integrity: only read operations were performed on `/app/fixture/`; no file under it was created, modified, or deleted.
