# S2 · Negative Scan Report — `@demo/dsh-minimal-llm` → dsh 0.1.2-alpha.2

- Date: 2026-09-15
- Target: `@demo/dsh-minimal-llm` 0.1.0 (source: `/app/fixture/`, static copy, read-only)
- Method: read-only static scan (grep pattern passes + full manual read of all 5 files). No migration, no install, no execution of plugin code. Nothing under `/app/fixture/` was modified.
- Scan baseline (SHA-256, bytes scanned unchanged):
  - `index.js` — `7306621926891cdf7d26ef268725b5f386213ce8410259947a30662117b0a866` (15 lines)
  - `src/session-notes.js` — `7a3219984c595f4c927e386b54e688c9ace2d0a50cad0e72a436f93c9c673748` (10 lines)
  - `package.json` — `414adb496685d6467d57740acf03aeccdb343f1d231b2b3f05e354124508602e` (19 lines)
  - `cordis.patch.yml` — `d50c34ae80e26e0dd0ab56b9e2835a6b3049665b8777027033ff52695ca02abe` (3 lines)
  - `README.md` — `fdca9077f0c9fb810f365d890f677e1cab35208e1ffc78ae9d1b3f54aa39d479`

> Note on references: no change-card / corridor reference document exists in this container. The category list below is anchored on the plugin source's own labeling (`index.js:1` and `README.md:3` both call the apiProxy surface "touchpoint category #3, internal service/Remote"); the remaining six categories follow the standard dsh touchpoint set. Change-card mapping in section 2 is therefore by card *subject*, to be pinned to exact card IDs against the 0.1.1-rc.2 → 0.1.2-alpha.2 corridor before executing the migration (see section 3).

---

## 1. Hit / no-hit per touchpoint category (with evidence)

**Bottom line: exactly 1 hit category — #3 Internal services / Remote (`apiProxy`). All others: no hit on the static scan.**

| # | Category | Verdict | Key evidence |
|---|----------|---------|--------------|
| 1 | Entry & lifecycle contract | **No hit** (pattern-scan clean) | Uses the ordinary entry contract of the era: `export const inject = ["apiProxy"]` (`index.js:3`), `export function apply(ctx)` (`index.js:5`), `ctx.effect(async () => {...})` (`index.js:7`). No deprecated lifecycle patterns found. Caveat: the *injected service name* is itself a #3 hit; and whether the lifecycle contract shape itself changed in 0.1.2 is a corridor question (see §3b), not answerable by grep. |
| 2 | UI / interface layer | **No hit** | No component/render/DOM/style/webview code in any file. The only grep match is the English word "style" inside a comment (`index.js:2`) — false positive. |
| 3 | **Internal services / Remote** | **HIT** | Three concrete usages: (a) `inject = ["apiProxy"]` (`index.js:3`); (b) dot-domain Remote call `await ctx.apiProxy.llm.providers()` (`index.js:9`); (c) pinned host client dependency `"@deepseek-ai/dsh-host-apiproxy": "0.0.1-rc.1"` (`package.json:17`). The source self-identifies as old-style: "0.1.1-rc.2 style: injects apiProxy, dot-domain calls" (`index.js:2`), "旧 API（apiProxy）路径" (`index.js:6`). |
| 4 | Data storage / persistence | **No hit** | Zero matches for storage/kv/db/sqlite/fs/persist/localStorage across all five files. No file I/O of any kind. |
| 5 | Events / messaging | **No hit** | No `on(`/`emit`/`subscribe`/bus/hook/listener usage. Only grep match is `error.message` (`index.js:12`) — a plain property access, false positive. |
| 6 | Manifest & registration | **No hit** (pattern-scan clean, affirmative usage exists) | Manifest present and matches the 0.1.1-rc.2-era format: `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` (`package.json:11-14`), `cordis.patch.yml` with an `insert` block (`id: minimal-llm`, `name: "@demo/dsh-minimal-llm"`), plus `exports` mapping `./cordis.patch.yml` (`package.json:7-10`). No deprecated manifest pattern detected. Caveat in §3b. |
| 7 | Dependencies & runtime | **No hit** on module system; **one affected dep** | Clean ESM (`"type": "module"` `package.json:5`), no CJS `require`, no Node builtins, no timers/`process`. However the dependency list pins the host client `@deepseek-ai/dsh-host-apiproxy` `0.0.1-rc.1` (`package.json:17`) — that is part of the #3 hit surface and must follow the 0.1.2 corridor (bump / replace / drop). |

**Decoy checked and cleared:** `src/session-notes.js` looks suspicious by filename ("session") but is pure utility code — `formatSessionNote` (trim/collapse/slice) and `chunk` (array slicing), no imports, no host coupling (10 lines). Zero hits. Filename-based scanning would have produced a false positive here; the verdict is based on reading the code, not the name.

---

## 2. Hit touchpoints → change-card mapping

Category #3 (the only hit) maps onto the internal-service/Remote card family of the 0.1.1-rc.2 → 0.1.2-alpha.2 corridor, at three concrete points in this plugin:

| Plugin location | Corridor card (subject) | Required change |
|---|---|---|
| `index.js:3` — `inject = ["apiProxy"]` | Card: service-injection / Remote API rename-replacement (apiProxy no longer provided under the old name in 0.1.2) | Replace the inject item with the 0.1.2 service name |
| `index.js:9` — `ctx.apiProxy.llm.providers()` | Card: dot-domain Remote call syntax removed/changed (source itself labels this "0.1.1-rc.2 style", `index.js:2`) | Rewrite the call to the 0.1.2 accessor for LLM providers |
| `package.json:17` — `@deepseek-ai/dsh-host-apiproxy` `0.0.1-rc.1` | Card: host client package version alignment | Bump to the 0.1.2-generation client, or remove the dep if the surface is folded into the host SDK |

Secondary mapping (no pattern hit, but must be confirmed card-by-card because the plugin affirmatively uses these surfaces):
- `index.js:3,5,7` → lifecycle-contract cards (does 0.1.2 still honor `inject` + `apply(ctx)` + `ctx.effect`?).
- `package.json:11-14` + `cordis.patch.yml` → manifest/registration cards (is the `dsh.bundle.patch` + cordis `insert` schema still accepted by 0.1.2-alpha.2?).

**Honesty note:** exact card IDs and titles cannot be cited from this container — the corridor/change-card reference is not present here. The mapping above is derived from the source's own annotations. Before executing the migration, pin this mapping against the official 0.1.1-rc.2 → 0.1.2-alpha.2 change-card list; if any card there also touches categories 1, 6, or 7, this report's "no hit" for those categories must be re-judged against that card.

---

## 3. Can the no-hit categories tell you this plugin is compatible with 0.1.2?

**Judgment: No. Zero hits does not equal compatible — and on the evidence available, this plugin is *not* compatible with 0.1.2 as-is**, because the single #3 hit lands squarely on a surface the code itself labels as the old API ("旧 API（apiProxy）路径", `index.js:6`). "Tiny" and "six of seven categories clean" do not add up to "no compatibility problems".

Basis:

- **(a) Absence of evidence is not evidence of absence.** A static negative scan only proves the absence of *known pattern matches*. Dynamic property access, computed strings, runtime-only code paths, and transitive dependencies can all hide real API usage from grep. The scan bounds what was found, not everything that exists.
- **(b) "No hit" is only meaningful relative to a card list.** Compatibility is defined by the 0.1.1-rc.2 → 0.1.2-alpha.2 corridor, card by card. A card can change *semantics* — manifest schema acceptance, lifecycle ordering, how services are provisioned at boot — with zero corresponding source-code pattern hits. Concretely: category 6 pattern-scans clean, but whether 0.1.2 still accepts this exact `dsh.bundle.patch` / cordis `insert` schema is decided by the host, not by the plugin source. The same holds for the lifecycle contract (category 1).
- **(c) The one hit is in a known breaking area.** Category #3 is the surface the corridor reworked (old apiProxy inject + dot-domain calls). So the minimal correct conclusion is: *this plugin requires a migration, however small* — the `inject` name, the call shape, and the pinned `0.0.1-rc.1` host client all have to change.
- **(d) Static scan cannot verify runtime integration.** Whether the 0.1.2 service is actually provided to this plugin at boot, and whether the call path works, is only observable at runtime. Note also that the current code swallows failures and only logs them (`index.js:11-14`, catch → `console.error`), so a broken Remote path could fail silently after a naive "it compiles" migration.

**What is needed before a compatibility conclusion:**

1. **The corridor reference.** Re-run this scan's categories 1, 6, and 7 card-by-card against the official 0.1.1-rc.2 → 0.1.2-alpha.2 change-card list, and pin the section-2 mapping to exact card IDs. Until then, "no hit" for those categories is provisional.
2. **Execute the #3 migration** (inject name, `llm.providers()` call shape, host client dependency version) — analysis alone cannot make the plugin compatible.
3. **Run the mandatory post-migration verification** below.

---

## 4. Mandatory post-migration verification checklist (to be run after the migration; not executed in this task by design)

1. **Build / typecheck** passes on the migrated source.
2. **Isolated-profile cold boot**: plugin loads and registers (the cordis `insert` entry is accepted by 0.1.2); `inject` resolves (no "unknown service" for the old `apiProxy` name); `apply()` runs and the `ctx.effect` callback registers.
3. **Functional smoke test**: `providers` list is actually returned through the new API; also deliberately exercise the failure branch (`index.js:11-14`) to confirm a broken Remote path is not silently masked.
4. **Manifest check**: host plugin list shows `minimal-llm` (`@demo/dsh-minimal-llm`) after cold boot.
5. **Dependency audit**: `@deepseek-ai/dsh-host-apiproxy` removed or aligned to the 0.1.2-generation client version.

---

## Integrity statement

- `/app/fixture/` was not modified: only read-only commands (grep, shasum, wc) touched it; checksums above record the exact bytes scanned.
- No migration or installation was executed, per the brief.
- All findings above cite `file:line` inside the fixture.
