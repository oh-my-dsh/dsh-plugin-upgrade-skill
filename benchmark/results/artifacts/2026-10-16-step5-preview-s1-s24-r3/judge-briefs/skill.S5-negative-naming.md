# JUDGE BRIEF · skill.S5-negative-naming

## Criteria (sealed rubric)
- [official-short-name] (25pt) Locate greet in dsh-plugin.naming.json and distinguish the declared plugin name from its package/coordinate. Under the supplied fixture policy it is a valid official short name, not a compatibility error. A publisher prefix may reduce collisions but is not a mandatory compatibility repair. Merely repeating greet or valid is insufficient.
- [service-collision-advice] (25pt) Locate the unprefixed service search. Explain the collision risk and classify it as a warning/recommendation rather than a compatibility error. Do not treat a strict-mode nonzero exit as proof of an incompatible API. A strict-mode command is not required.
- [shared-event-context] (25pt) Locate web-search/ready as an event shared channel. Explain that matching names alone do not establish a conflict; publisher schema compatibility and registry context determine conflicts. Informational/shared-channel wording is equivalent; an unsupported claim of global uniqueness is not.
- [coverage-and-registry-limits] (25pt) Account for the remaining declared naming surfaces (loader, tool, command, skill/provider, settings and route), which may be grouped with a justified common verdict. Distinguish local naming compatibility from unqueried registry occupancy/reservation/availability. State unknown/not checked for registry-dependent claims and propose later verification without claiming it was run. Do not invent an error from private:true, which marks test material. An explicit rejection of all-clear/reserved/globally-available claims is correct.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [unsupported-all-clear] ceiling=30 Trigger only for an affirmative, unsupported blanket conclusion that every surface passes/is globally available or publication is cleared despite the unqueried registry. Correct local compatibility verdicts, hypothetical bad examples and explicitly rejected all-clear claims do not trigger this cap.

## Candidate report(s)
#### FILE: S5-negative-naming/S5-negative-naming-judgment.md

# S5 · Naming Four-State Judgment — Read-Only Review Report

**Target:** community plugin naming declaration, reviewed before publishing.
**Verdict vocabulary (four states):** compatibility error · collision recommendation · needs registry context · unknown.
**Mode:** read-only judgment. No file under `fixture/` was modified; no build, no reproduction environment, no dependency install, no execution. Nothing outside the fixture and this report directory was touched.

---

## 0. Evidence and method

**Evidence read (read-only):**

| File | Role |
|---|---|
| `fixture/dsh-plugin.naming.json` | the naming declaration under judgment |
| `fixture/package.json` | package identity (`name: dsh-greet`, `version: 0.1.0`, `private: true`) |
| `fixture/README.md` | the fixture's own documentation (states the four judgment surfaces) |
| `skills/plugin-upgrade/SKILL.md`, `skills/plugin-upgrade/references/README.md` + targeted content searches | read-only skill reference |

**Negative capability — what was deliberately NOT done, and therefore cannot be claimed:**

1. **No online registry query** (network access is forbidden by the task brief). This report therefore makes **no claim** that any name — `greet`, `acme`, `acme/greet`, `dsh-greet`, `search`, `web-search/ready` — is *reserved*, *taken*, or *globally available*. Every such question is marked **needs registry context** below instead of being answered.
2. **No verification of the `dsh-plugin-naming/v1` policy text.** The skill explicitly defers naming/manifest conventions to the external `dsh-community-standard` repository ("owns manifests, contract coordinates, and negotiation conventions … reusing that classification without redefining it", SKILL.md), and no copy of that policy exists in the allowed paths. Searches of the skill for `naming.json`, `plugin-naming`, `loaderId` return **zero** matches: the manifest type itself is undocumented in the available references. Any statement of the form "the policy requires X" would be unconfirmed, so none is made.
3. **No runtime or build evidence.** The judgment is static, derived from the declaration files only.

**Standing caveat applying to every row below:** because no registry query was made, the *global occupancy* of **every** declared name is unverified. "No compatibility error" means "no error visible on the face of the declaration" — never "safe", never "clear".

---

## 1. State definitions as applied here

| State | Meaning in this report |
|---|---|
| **compatibility error** | The declaration is structurally invalid / would be rejected on its face (malformed coordinate, illegal characters, route outside the plugin's own mount area, missing required declaration) — determinable from the fixture alone |
| **collision recommendation** | Structurally valid, but the name is generic/unprefixed in a shared lookup space → prefix or rename **recommended**. Advisory, not blocking |
| **needs registry context** | The verdict depends on facts only an online/authoritative query can settle (package availability, namespace claim, coordinate occupancy, shared-channel ownership) |
| **unknown** | Not determinable at all from available evidence (e.g., the policy's own rules, manifest schema conformance) |

---

## 2. Declaration under review

`fixture/dsh-plugin.naming.json` declares `schemaVersion: 1`, `policy: "dsh-plugin-naming/v1"`, plugin identity `namespace: "acme"`, `name: "greet"`, `coordinate: "acme/greet"`, `packageName: "dsh-greet"`, and the following surfaces:

| # | Surface | Declared value | Verdict | Reasoning |
|---|---|---|---|---|
| 1 | Plugin short name | `greet` (`pluginNames`, `plugin.name`) | **collision recommendation** (advisory — *not* an error) | `greet` is the short leg of the namespaced coordinate `acme/greet`; a bare generic short name inside a namespaced coordinate is structurally ordinary and nothing in the declaration is malformed. Residual risk: the flat `pluginNames` entry `greet` is generic, so any global/flat lookup of the bare name could collide with another publisher. Prefixing is the recommended mitigation, not a requirement. |
| 2 | Plugin coordinate / namespace | `acme/greet`, namespace `acme` | **needs registry context** | Well-formed two-segment coordinate. Whether the `acme` namespace is claimable or reserved to someone else, and whether `acme/greet` is already occupied, cannot be determined offline. |
| 3 | Package name | `dsh-greet` (`packageName`; `package.json#name`) | **needs registry context** | Registry availability of `dsh-greet` is unknown without a query. Two further offline-visible facts: `package.json` carries `private: true` (per the fixture README this is the repository's "test material, do not publish" discipline — it must be cleared before any publish), and whether the `dsh-` prefix is a convention or a reserved prefix under the policy is **unconfirmed**. |
| 4 | Loader id | `acme-greet` | **no compatibility error** | Carries the namespace prefix and matches the hyphenated coordinate form; consistent with the declaration's own convention. Global uniqueness still unverified (standing caveat). |
| 5 | Service name | `search` | **collision recommendation** (warning — *not* an error) | The only unprefixed entry in a shared service-lookup space, and `search` is a maximally generic name: a second plugin publishing a service called `search` would collide. Recommend a prefixed form such as `acme-search` (or coordinate-qualified `acme/greet:search`). The declaration is **not invalid** — an unprefixed service is a warning, not an error. |
| 6 | Tool name | `acme_greet_hi` | **no compatibility error** | Prefixed; consistent with the namespace discipline. (Underscore form is a per-surface convention difference, not a defect.) |
| 7 | Command name | `acme-greet-hi` | **no compatibility error** | Prefixed; consistent. |
| 8 | Skill name | `greet` | **collision recommendation** (advisory) | Bare generic name. Skills are addressed by bare name in a shared catalog on this host (the session skill catalog lists global names such as `diagnose-windows-sandbox-acl`), so an unprefixed `greet` has real collision exposure; prefixing recommended. Not an error on the face of the declaration. |
| 9 | Skill provider | `acme-greet-filesystem` | **no compatibility error** | Prefixed; consistent. |
| 10 | Event name | `web-search/ready` | **needs registry context** (name itself structurally valid; shared channel, informational) | The name is a channel-style address: channel `web-search`, event `ready`. The channel segment does **not** match the plugin's own namespace (`acme`) — the plugin deliberately joins a channel that appears foreign/shared. Whether that channel is owned, reserved, or already published by another component, and who else emits `ready` on it, cannot be determined offline. **No collision recommendation is warranted from the name alone**: joining a shared channel is informational-by-design, not a defect. |
| 11 | Settings namespace | `acme-greet` | **no compatibility error** | Prefixed; consistent. |
| 12 | Route | `{ "kind": "exact", "path": "/api/plugins/acme-greet/hi" }` | **no compatibility error** | The path is mounted under the plugin's own coordinate (`/api/plugins/acme-greet/…`), which is the conventional plugin route area, and the exact-match route is well-formed. Whether the host reserves `/api/plugins/*` exactly as assumed is a policy question — **unconfirmed** — but self-namespacing is the compliant shape either way. |
| 13 | Policy semantics / schema conformance | `policy: "dsh-plugin-naming/v1"`, `schemaVersion: 1` | **unknown** | The normative source of this policy is external (`dsh-community-standard`) and no copy exists in the allowed paths; the skill's reference set does not document `dsh-plugin.naming.json` at all. Whether the manifest's field set is complete/valid, and whether any name above violates a rule that cannot be read, is unconfirmed. |

**Summary of verdicts:** 0 compatibility errors · 3 collision recommendations (plugin short name `greet` — advisory; service `search` — warning; skill name `greet` — advisory) · 3 needs-registry-context (coordinate/namespace, package name, event channel) · 1 unknown (policy semantics) · 6 no-compatibility-error (loaderId, tool, command, skillProvider, settingsNamespace, route).

---

## 3. Registry status (explicit)

**Unknown / not checked.** No online registry or community-standard query was performed — the task brief forbids it. Accordingly:

- It is **not** claimed that `dsh-greet` is available or taken on any registry.
- It is **not** claimed that the `acme` namespace or `acme/greet` coordinate is claimable, reserved, or occupied.
- It is **not** claimed that `search`, `greet`, or `web-search/ready` are free of other users.
- It is **not** claimed that any name is "reserved" or "globally available".

Each of these is a **needs registry context** item from section 2, not a finding.

---

## 4. "No findings ≠ no problems"

Zero compatibility errors were found **on the face of the declaration, with the policy text unavailable**. That is not a clean bill of health. Open items that remain before publishing (each requires an online/authoritative check or an owner decision):

1. Remove `private: true` from `package.json` (fixture README: test-material discipline, not part of the plugin).
2. Confirm `dsh-greet` availability on the target registry — **unqueried**.
3. Confirm `acme` namespace claimability and `acme/greet` coordinate occupancy — **unqueried**.
4. Service `search`: decide whether to rename to a prefixed form (genuine collision risk in the shared service space).
5. Bare names `greet` (plugin short name and skill name): decide whether to prefix.
6. Verify the whole manifest against the `dsh-plugin-naming/v1` normative source (online) — the policy rules themselves are **unconfirmed** here.
7. Event `web-search/ready`: confirm who owns the `web-search` channel and whether joining it is sanctioned.

---

## 5. Limitations

- The `dsh-plugin-naming/v1` policy text and the manifest schema are not available in the allowed paths; all policy-rule statements are unconfirmed.
- The judgment is static (declaration files only); no runtime, build, or mount evidence exists.
- The fixture's own README documents four judgment surfaces (short name valid, unprefixed service a warning, shared-channel event informational, unqueried registry unknown). It was read as fixture documentation; the verdicts above were derived independently from the declaration data and are consistent with it.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.