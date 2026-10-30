# JUDGE BRIEF · noskill.S5-negative-naming

## Criteria (sealed rubric)
- [official-short-name] (25pt) Locate greet in dsh-plugin.naming.json and distinguish the declared plugin name from its package/coordinate. Under the supplied fixture policy it is a valid official short name, not a compatibility error. A publisher prefix may reduce collisions but is not a mandatory compatibility repair. Merely repeating greet or valid is insufficient.
- [service-collision-advice] (25pt) Locate the unprefixed service search. Explain the collision risk and classify it as a warning/recommendation rather than a compatibility error. Do not treat a strict-mode nonzero exit as proof of an incompatible API. A strict-mode command is not required.
- [shared-event-context] (25pt) Locate web-search/ready as an event shared channel. Explain that matching names alone do not establish a conflict; publisher schema compatibility and registry context determine conflicts. Informational/shared-channel wording is equivalent; an unsupported claim of global uniqueness is not.
- [coverage-and-registry-limits] (25pt) Account for the remaining declared naming surfaces (loader, tool, command, skill/provider, settings and route), which may be grouped with a justified common verdict. Distinguish local naming compatibility from unqueried registry occupancy/reservation/availability. State unknown/not checked for registry-dependent claims and propose later verification without claiming it was run. Do not invent an error from private:true, which marks test material. An explicit rejection of all-clear/reserved/globally-available claims is correct.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [unsupported-all-clear] ceiling=30 Trigger only for an affirmative, unsupported blanket conclusion that every surface passes/is globally available or publication is cleared despite the unqueried registry. Correct local compatibility verdicts, hypothetical bad examples and explicitly rejected all-clear claims do not trigger this cap.

## Candidate report(s)
#### FILE: S5-negative-naming/naming-judgment-report.md

# S5 Naming Four-State Judgment Report — acme/greet (community plugin, pre-publish)

**Scope:** read-only review of `fixture/package.json` and `fixture/dsh-plugin.naming.json`. No file under `fixture/` was modified; no registry, network, or external system was queried; no reproduction environment was built.

**Verdict scale (as required by the brief):** `compatibility error` · `collision recommendation` · `needs registry context` · `unknown`

**Registry status disclaimer:** No online registry query was performed in this review (offline container, and the brief forbids external access). Therefore **nothing in this report may be read as "reserved" or "globally available"**. Every registry-dependent claim below is reported as `unknown` / `needs registry context` — absence of findings here is **not** absence of problems.

---

## 1. Per-surface verdicts

| # | Surface | Declared value | Verdict | Reasoning |
|---|---------|----------------|---------|-----------|
| 1 | Plugin official short name | `greet` (namespace `acme`, coordinate `acme/greet`) | **collision recommendation** (no compatibility error) | The short name itself is syntactically valid and allowed. Unprefixed short names are not a hard compatibility error; the standard guidance is only to prefer the namespaced coordinate `acme/greet` in user-facing and cross-plugin contexts to reduce collision risk with other plugins that may also claim `greet`. Whether any other plugin actually owns `greet` is a registry question — not checked (see §2). |
| 2 | Loader IDs | `acme-greet` | **no compatibility error** | Namespace-prefixed; consistent with the `acme` namespace. Registry uniqueness not verified (unknown). |
| 3 | Service name | `search` | **collision recommendation** (warning, **not** an error) | `search` is an unprefixed, highly generic service name. This is a warning-level collision recommendation: other plugins (or the host) plausibly expose a service with the same generic name, so consumers may resolve the wrong service. Recommended rename to e.g. `acme-greet-search`. It does **not** block loading, so it is not a compatibility error. Whether an actual collision exists requires registry context — not checked. |
| 4 | Tool name | `acme_greet_hi` | **no compatibility error** | Carries the `acme_greet_` prefix; follows the namespacing recommendation. Registry uniqueness not verified (unknown). |
| 5 | Command name | `acme-greet-hi` | **no compatibility error** | Namespace-prefixed. Registry uniqueness not verified (unknown). |
| 6 | Skill name | `greet` | **collision recommendation** | Short, unprefixed skill name. Valid, but a generic word like `greet` is likely to be claimed by multiple community plugins; prefer `acme-greet` as the skill name to disambiguate. Actual collision status: unknown (no registry query). |
| 7 | Skill provider | `acme-greet-filesystem` | **no compatibility error** | Namespace-prefixed. Registry uniqueness not verified (unknown). |
| 8 | Event name | `web-search/ready` | **collision recommendation — informational only (shared channel)** | Event channels with a `<domain>/<event>` shape are **shared channels by design**: multiple plugins may legitimately publish/subscribe to the same well-known event. Declaring `web-search/ready` is therefore informational, not a defect and not a collision in the exclusive-ownership sense. Caveat: if this plugin intends the event as *private* to itself, a shared generic channel name is the wrong choice (recommend `acme-greet/...`); if it intentionally interoperates on the shared `web-search` channel, no action needed. Ownership/reservation status of the channel: unknown (no registry query). |
| 9 | Settings namespace | `acme-greet` | **no compatibility error** | Namespace-prefixed. Registry uniqueness not verified (unknown). |
| 10 | Route | `{ kind: "exact", path: "/api/plugins/acme-greet/hi" }` | **no compatibility error** | The route lives under the per-plugin `/api/plugins/acme-greet/` prefix, which is the recommended namespacing for plugin HTTP routes; an `exact` match further limits surface. Registry uniqueness not verified (unknown). |

**Cross-file consistency (informational):** `package.json` `name: "dsh-greet"` matches the manifest's `packageName: "dsh-greet"`; `coordinate: "acme/greet"` is internally consistent with `namespace` + `name`. No mismatch found. (`private: true` is the repository's "test material, do not publish" marker, not a naming property.)

## 2. Registry status (honest negative capability)

- **Plugin coordinate `acme/greet`, package name `dsh-greet`, and every identifier above:** **unknown** — no registry was queried. This review **cannot and does not** claim any of them is "reserved", "taken", or "globally available".
- **Before publishing**, each of: plugin coordinate, package name, service `search`, skill `greet`, loader ID, settings namespace, and the route prefix **needs registry context** — a live registry query is the only way to convert these `unknown` verdicts into "available" or "collision".
- No findings in this offline review ≠ no problems.

## 3. Bottom-line judgment

1. **No compatibility errors** were found in the naming manifest; nothing declared is structurally forbidden.
2. **Three collision recommendations** stand: service `search` (unprefixed generic — strongest recommendation to rename), skill `greet` and plugin short name `greet` (prefer namespaced forms; the short name remains valid as-is).
3. **One informational note:** event `web-search/ready` is a shared channel — fine if intentional, wrong if meant to be private.
4. **Everything registry-dependent is unknown / needs registry context.** Do not publish on the strength of this offline review alone; run the registry availability checks first.

---
*Review performed read-only on `fixture/`; report written to `agent-output/S5-negative-naming/` only. Registry: not queried (offline). Anything not verifiable from the fixture is marked unknown/unconfirmed rather than guessed.*


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.