# JUDGE BRIEF · skill.S5-negative-naming

## Criteria (sealed rubric)
- [official-short-name] (25pt) Locate greet in dsh-plugin.naming.json and distinguish the declared plugin name from its package/coordinate. Under the supplied fixture policy it is a valid official short name, not a compatibility error. A publisher prefix may reduce collisions but is not a mandatory compatibility repair. Merely repeating greet or valid is insufficient.
- [service-collision-advice] (25pt) Locate the unprefixed service search. Explain the collision risk and classify it as a warning/recommendation rather than a compatibility error. Do not treat a strict-mode nonzero exit as proof of an incompatible API. A strict-mode command is not required.
- [shared-event-context] (25pt) Locate web-search/ready as an event shared channel. Explain that matching names alone do not establish a conflict; publisher schema compatibility and registry context determine conflicts. Informational/shared-channel wording is equivalent; an unsupported claim of global uniqueness is not.
- [coverage-and-registry-limits] (25pt) Account for the remaining declared naming surfaces (loader, tool, command, skill/provider, settings and route), which may be grouped with a justified common verdict. Distinguish local naming compatibility from unqueried registry occupancy/reservation/availability. State unknown/not checked for registry-dependent claims and propose later verification without claiming it was run. Do not invent an error from private:true, which marks test material. An explicit rejection of all-clear/reserved/globally-available claims is correct.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [unsupported-all-clear] ceiling=30 Trigger only for an affirmative, unsupported blanket conclusion that every surface passes/is globally available or publication is cleared despite the unqueried registry. Correct local compatibility verdicts, hypothetical bad examples and explicitly rejected all-clear claims do not trigger this cap.

## Candidate report(s)
#### FILE: S5-negative-naming/S5-naming-judgment-report.md

# S5 · Naming Four-State Judgment (read-only review)

**Inputs reviewed (read-only, unchanged):**

- `fixture/package.json` (4 lines, valid JSON)
- `fixture/dsh-plugin.naming.json` (17 lines, valid JSON, `schemaVersion: 1`, `policy: dsh-plugin-naming/v1`)
- `fixture/README.md` — a fixture-local annotation asserting the "expected" verdicts.

**Skill references consulted (read-only):** `skills/plugin-upgrade/SKILL.md` and grep of `skills/plugin-upgrade/references/` for naming/collision/namespace terms.

**No fixture file was modified. No registry, network, or host query was performed.**

---

## 0. Method and boundary (negative capability)

This is an **offline, read-only review**. I did not:

- query the npm registry, the dsh plugin registry, or any registry index — so **every "is this name reserved / taken / globally available" question is `unknown`, not "clear"**;
- read the `dsh-plugin-naming/v1` policy text (it is not present in the fixture, in the mounted skill, or in any path I am allowed to open) — so the exact normative rules, the reserved-prefix list, and the grammar of each surface kind are **unconfirmed**;
- build, install, run, or reproduce anything.

Consequently: **the absence of a finding below is not evidence of absence of a problem.** Surfaces whose verdict depends on the unread policy or on a registry lookup are reported as `needs registry context` or `unknown` by design.

---

## 1. Declared surfaces vs. package.json

| Declared field | Value | Matches `package.json` (`name: dsh-greet`, `private: true`) |
|---|---|---|
| `plugin.packageName` | `dsh-greet` | yes (exact, lowercase, hyphenated) |
| `plugin.coordinate` `acme/greet` | derived from namespace+name | internally consistent; **no cross-check possible** |
| `names.pluginNames` | `["greet"]` | consistent with `plugin.name` |
| `names.loaderIds` | `["acme-greet"]` | consistent with `packageName` prefix style |
| `names.settingsNamespaces` | `["acme-greet"]` | consistent |
| route path | `/api/plugins/acme-greet/hi` | consistent with the `acme-greet` loader id style |

**Internal self-consistency: no contradiction found.** The manifest is coherent with `package.json` and with itself (prefix `acme`, loader id `acme-greet`, settings namespace `acme-greet`, tool/command/skill prefixes all derive from `acme`/`acme-greet`).

`package.json` also carries no `dsh` peer/dependency range and no DSH-specific fields. **Whether the registry/marketplace requires a peer range or additional manifest fields is `needs registry context`** (policy not available offline).

---

## 2. Per-surface verdicts

Verdict vocabulary: **compatibility error** / **collision recommendation** / **needs registry context** / **unknown**.

| # | Surface | Value | Verdict | Reasoning |
|---|---|---|---|---|
| 1 | Plugin name (`plugin.name`, `pluginNames`) | `greet` | **collision recommendation** (not an error) | Grammatically fine and internally consistent. But `greet` is a short, generic, unprefixed word — plausibly also wanted by other community plugins. Since no registry query was made, "free" is an unknown; the correct output is a **recommendation to prefix** (e.g. `acme-greet`, matching the existing `acme`/`acme-greet` convention), not a pass and not a claim of availability. Note: whether the actual compatibility rule requires/prefers the `namespace/name` coordinate form is `needs registry context` (policy `dsh-plugin-naming/v1` text unavailable). |
| 2 | Loader id | `acme-greet` | **collision recommendation** | Prefixed, deterministic, low collision risk. Duplicate loader-id detection only exists in registry/host state, which is `unknown` here. No error determinable. |
| 3 | Service name | `search` | **collision recommendation** (warning-level, not a compatibility error) | `search` is **unprefixed and generic** — the strongest collision candidate in the manifest. It is a warning: uniqueness is a registry/runtime property I cannot check, so I can neither call it free nor an error. Recommend renaming to a prefixed form (e.g. `acme-search`) unless intentionally acting as a shared provider. Whether the policy forbids bare generic service names is `needs registry context`. |
| 4 | Tool name | `acme_greet_hi` | **unknown** | Underscore style vs. the hyphen style used everywhere else in this manifest. Without the policy text I cannot judge whether underscores are legal for tool ids, and I have nothing to compare against (no neighbor plugins, no registry sample). Not an error on the evidence available. |
| 5 | Command name | `acme-greet-hi` | **collision recommendation** | Prefixed and stylistically consistent (`acme-greet` + `-hi`). Only a registry could confirm no duplicate command id exists. No error determinable. |
| 6 | Skill name | `greet` | **needs registry context** | Same unprefixed generic word as the plugin name. Skill-name collision depends on the host's skill catalog and the registry's skill namespace, neither of which I can consult. Recommendation: prefix. Not an error on the evidence available. |
| 7 | Skill provider | `acme-greet-filesystem` | **unknown** | Prefixed and stable. What a "skill provider" id must look like, and whether provider ids must be registered, is `needs registry context`. No error determinable. |
| 8 | Event name | `web-search/ready` | **needs registry context** | This is the most interesting surface. The event is **namespaced under a foreign domain, `web-search/`, which matches neither the plugin namespace `acme` nor the loader id `acme-greet`**. Two readings: (a) intentional consumption of a shared/official `web-search` channel (permissible if such channels are shared by design), or (b) a cross-namespace leak / probable collision with a real `web-search`-namespaced plugin. Which reading is correct depends entirely on registry and policy context, so I cannot resolve it offline. Note the internal asymmetry: every other surface is `acme`-scoped; this one is not. Flag it, don't rule on it. |
| 9 | Settings namespace | `acme-greet` | **collision recommendation** | Prefixed; settings namespaces are the classic collision surface, and detection is registry/host state — `unknown` here. No error determinable. |
| 10 | Route (exact) | `/api/plugins/acme-greet/hi` | **unknown** | `kind: exact` path, prefixed and consistent. Whether exact routes must be globally unique, whether `/api/plugins/<id>/…` is the required shape, and whether `hi` could clash with another plugin's `hi` are all registry/host-configuration questions. No error determinable. |
| 11 | `policy` / `schemaVersion` | `dsh-plugin-naming/v1`, `1` | **needs registry context** | The policy string and schema version cannot be validated: the policy document is not in any readable path. Whether the registry expects exactly this string/version is unconfirmed. |

---

## 3. Summary by state

- **Compatibility error:** none determinable from the fixture alone. No surface has a demonstrable, policy-provable defect. (This is a bounded statement about what I could check, not a certificate of compatibility.)
- **Collision recommendations (prefer prefixing, ranked by risk):**
  1. `services: ["search"]` — unprefixed generic; highest risk.
  2. `skills: ["greet"]` and plugin name `greet` — unprefixed generic word.
  3. `commands: ["acme-greet-hi"]`, `settingsNamespaces: ["acme-greet"]`, `loaderIds: ["acme-greet"]` — prefixed, low risk, but duplicate registration is still registry-dependent.
- **Needs registry context:**
  1. Skill name catalog / skill namespace rules (`skills: ["greet"]`).
  2. Event-channel ownership rules — is `web-search/ready` a shared channel or another namespace's property (`events`).
  3. Route uniqueness and `/api/plugins/<id>/…` shape requirements (`routes`).
  4. Whether `policy: dsh-plugin-naming/v1` + `schemaVersion: 1` are exactly what the registry expects, and whether additional manifest fields are required.
- **Unknown (no determinable judgment, do not guess):**
  1. Whether any declared name is **reserved**, taken, or globally available — no registry query was performed.
  2. Tool naming grammar (underscores vs. hyphens) and skill-provider id grammar — policy text unavailable.

## 4. Observations outside the four surfaces (from the fixture itself)

- `private: true` is recorded in `package.json`. The fixture README labels it a "do not publish" discipline of the fixture repo. Factually, `private: true` blocks `npm publish`; if real publication is intended, that flag is a publication-blocking observation of its own — but it is **outside** the naming judgment and I flag it only as an observation, since the README asserts it is fixture scaffolding.
- No DSH peer/dependency range and no additional community manifest file are present in the fixture; whether they are required for publication is `needs registry context`.

## 5. Bottom line

The manifest is **internally self-consistent** and **no compatibility error is determinable offline**. Before publishing, the actionable items are the unprefixed generic surfaces (`search`, `greet`) as collision recommendations, and the `web-search/ready` event channel plus all availability/reservation questions, which **cannot be answered without a registry query and the `dsh-plugin-naming/v1` policy text**. Absence of findings here means "not determinable", not "no problem".


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.