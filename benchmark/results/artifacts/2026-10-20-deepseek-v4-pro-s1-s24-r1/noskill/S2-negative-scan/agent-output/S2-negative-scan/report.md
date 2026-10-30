# S2 · Negative Scan Report — @demo/dsh-minimal-llm (legacy → dsh 0.1.2-alpha.2)

## 0. Scope, method, and an upfront limitation

- Source scanned (read-only, nothing modified): `fixture/` — 5 files, read in full:
  `README.md`, `cordis.patch.yml`, `index.js`, `package.json`, `src/session-notes.js`.
- Method: full read of every file + token greps across the fixture for each host-coupling
  surface (apiProxy / Service / .on( / event / config / tool / theme / slot / emit /
  subscribe / provide / schema / Remote / effect / inject / apply / Schema / Props /
  Context / ctx. / dsh-).
- **NOSKILL limitation (honest note for one requirement):** this run has no skill
  available and I am forbidden from reading the `skills/` directory, its SKILL.md files,
  and its card identifiers. Therefore I cannot cite canonical card IDs (e.g.
  DSH-0.1.x-xx). The seven touchpoint categories below are reconstructed from (a) the
  fixture's own README, which names category #3 as "internal service/Remote: apiProxy",
  and (b) the known dsh plugin host-coupling surfaces. The hit/no-hit findings and the
  reasoning are unaffected; only the canonical card ID for the one hit is left unnamed.

## 1. Source inventory

| File | Role | Host coupling? |
|---|---|---|
| index.js | plugin entry — `inject`, `apply`, `ctx.effect` | **YES** (apiProxy) |
| package.json | manifest — declares `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1`, `dsh.bundle.patch` | dependency tied to apiProxy |
| cordis.patch.yml | registration patch (`insert` id/name) | registration only |
| src/session-notes.js | two pure utility functions | none (see §5) |
| README.md | fixture self-description | n/a |

## 2. Touchpoint scan results (7 categories)

| # | Category | Verdict | Evidence |
|---|---|---|---|
| 1 | Plugin entry / registration (inject·apply, patch, `dsh.bundle`) | **no hit** | `inject`/`apply`/`cordis.patch.yml` present but only in the stable 0.1.x entry shape; no removed/renamed entry surface. |
| 2 | Dependencies (dsh package versions) | **no hit** (as a category) | the only dsh dep is `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1`, which is *evidence of* category #3, not an independent break; no dsh-core version pin otherwise. |
| 3 | **Internal service / Remote bridge (apiProxy)** | **HIT** | `index.js:3` `export const inject = ["apiProxy"]`; `index.js:9` `ctx.apiProxy.llm.providers()`; `package.json:17` `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1`. 0.1.1-rc.2 style, per `index.js:2`. |
| 4 | Service methods (business Services) | **no hit** | grep `Service`, `Schema`, `ctx.<svc>` → 0 matches; no business-service calls. |
| 5 | Events (`.on(`/emit/subscribe) | **no hit** | grep `.on(`, `event`, `emit`, `subscribe` → 0 matches. |
| 6 | Config schema | **no hit** | grep `config`, `schema` → 0 matches. |
| 7 | Tool / Theme / Slot surfaces | **no hit** | grep `tool`, `theme`, `slot`, `Props`, `Context` → 0 matches. |

Conclusion: **exactly one hit** — category #3 (internal service / Remote bridge,
`apiProxy`). All six other categories are zero-hit. (The `src/session-notes.js` file that
"looks suspicious" is a true negative — see §5.)

## 3. Hit mapping → change card

- Hit: `inject = ["apiProxy"]` + `ctx.apiProxy.llm.providers()` (dot-domain internal-service
  bridge) + `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1` dependency.
- Required change (key point only — card ID withheld under NOSKILL): the 0.1.1-rc
  `apiProxy` bridge is replaced in 0.1.2 by the new Remote/Services API. The plugin must
  (a) stop injecting `apiProxy`, (b) move the `llm.providers()` call onto the new service
  surface, and (c) drop the `@deepseek-ai/dsh-host-apiproxy` dependency. This is the
  single incompatibility in this plugin.

## 4. The question you actually asked: do zero-hit categories prove 0.1.2 compatibility?

**No.** Zero hits in the other six categories do **not** establish compatibility, and the
plugin is in fact **not** compatible as-is (category #3 already fails). Basis:

1. **A zero is only as strong as the scan's coverage.** "No occurrence of pattern X" means
   "no *detected* occurrence". Static pattern/grep scanning can miss dynamic construction,
   indirection, transitive deps, and typo-variants. Here the files are tiny and read in
   full, so coverage is high — but in general a zero-hit is evidence of absence, not proof.
2. **One hit is sufficient to break compatibility.** Compatibility is an AND over all
   touchpoints: a single hit (apiProxy) means the plugin cannot be called "compatible" no
   matter how clean the other six are.
3. **Zero-hit ≠ zero-impact.** A category can be affected by the 0.1.2 corridor without
   the plugin referencing the *specific* old token I grepped for (e.g. a default/behavioral
   change, a type-level change, a runtime-only change). Static source scan cannot see those.
4. **The scan is negative evidence about *this* snapshot only.** It says nothing about the
   build/type-check/runtime behavior under the actual 0.1.2 host.

So the correct reading of this fixture is: **one real, confirmed incompatibility (apiProxy),
plus six categories that carry no evidence of further incompatibility — but "no evidence"
must be converted into "verified clean" by actual checks, not by assertion.**

## 5. The "suspicious" file — true negative

`src/session-notes.js` has a session-y name but contains only two pure functions
(`formatSessionNote`, `chunk`) with no `ctx`, no inject, no service/event/config/tool
surface. Grep confirms zero host-coupling tokens. It is a **true zero-hit** — the filename
is a historical naming habit, not a compatibility signal.

## 6. What is still needed before I would conclude "compatible"

Static scan alone is insufficient; the following are **mandatory** post-migration
verification (not performed here — no migration may run in this container, and `fixture/`
must stay unchanged):

1. **Apply the category-#3 migration** (drop `apiProxy`, adopt the new Remote/Services API,
   remove the apiproxy dependency).
2. **Build / typecheck** against the 0.1.2 host types (catches type-level breakage the
   grep cannot see).
3. **Isolated-profile cold boot** of the plugin under 0.1.2 (catches runtime/registration
   breakage, e.g. a removed `inject` service name).
4. **Functional smoke test** of the migrated `llm.providers()` path (confirms the new
   service actually resolves and returns).
5. Re-scan the *migrated* source for the other six categories against the 0.1.2 corridor
   (confirms the zero-hits hold after the change, not just before).

Only after (1)–(5) pass can the plugin be called compatible with 0.1.2; the negative scan
alone can only rule *in* the one incompatibility it found, not rule *out* everything else.
