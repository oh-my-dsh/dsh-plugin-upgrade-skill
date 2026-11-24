# JUDGE BRIEF · noskill.S5-negative-naming

## Criteria (sealed rubric)
- [official-short-name] (25pt) Locate greet in dsh-plugin.naming.json and distinguish the declared plugin name from its package/coordinate. Under the supplied fixture policy it is a valid official short name, not a compatibility error. A publisher prefix may reduce collisions but is not a mandatory compatibility repair. Merely repeating greet or valid is insufficient.
- [service-collision-advice] (25pt) Locate the unprefixed service search. Explain the collision risk and classify it as a warning/recommendation rather than a compatibility error. Do not treat a strict-mode nonzero exit as proof of an incompatible API. A strict-mode command is not required.
- [shared-event-context] (25pt) Locate web-search/ready as an event shared channel. Explain that matching names alone do not establish a conflict; publisher schema compatibility and registry context determine conflicts. Informational/shared-channel wording is equivalent; an unsupported claim of global uniqueness is not.
- [coverage-and-registry-limits] (25pt) Account for the remaining declared naming surfaces (loader, tool, command, skill/provider, settings and route), which may be grouped with a justified common verdict. Distinguish local naming compatibility from unqueried registry occupancy/reservation/availability. State unknown/not checked for registry-dependent claims and propose later verification without claiming it was run. Do not invent an error from private:true, which marks test material. An explicit rejection of all-clear/reserved/globally-available claims is correct.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [unsupported-all-clear] ceiling=30 Trigger only for an affirmative, unsupported blanket conclusion that every surface passes/is globally available or publication is cleared despite the unqueried registry. Correct local compatibility verdicts, hypothetical bad examples and explicitly rejected all-clear claims do not trigger this cap.

## Candidate report(s)
#### FILE: S5-negative-naming/naming-judgment.md

# Naming compatibility and registry judgment

This is a read-only, local review of `package.json`, `dsh-plugin.naming.json`, and the fixture README. No compatibility error is established by the supplied evidence. This does **not** establish that every name is safe, reserved, registered, owned, or globally available. Registry status is **unknown / not checked** for every surface; no network or registry query was performed.

The README supplies specific local interpretation for the short plugin name, service, and event. The manifest identifies `dsh-plugin-naming/v1` but does not supply its complete normative schema or runtime implementation. Consequently, the judgments below distinguish supported advice from unconfirmed compatibility. “Collision recommendation” is advisory, not an error or evidence of an actual collision. “Needs registry context” identifies an ownership/context question; its present answer remains unknown.

| Surface | Declared value | Verdict | Reasoning |
| --- | --- | --- | --- |
| Plugin short name | `greet` (`plugin.name`, `names.pluginNames`) | collision recommendation | The fixture explicitly says this official short-name form is valid. A prefix may reduce collisions but is not a compatibility requirement. Both declarations agree. No actual collision is demonstrated. |
| Plugin namespace | `acme` | needs registry context | The declaration alone does not prove ownership, authorization, or registry acceptance of this namespace. |
| Plugin coordinate | `acme/greet` | needs registry context | It agrees locally with namespace `acme` and name `greet`. Registration, ownership, and availability require authoritative registry context. |
| Package name | `dsh-greet` | needs registry context | `package.json.name` equals `plugin.packageName`; there is no local mismatch. Registry ownership, availability, and any required package-to-plugin mapping are unconfirmed. |
| Loader ID | `acme-greet` | unknown | Its prefix is consistent with the declared identity and reduces obvious ambiguity. Loader grammar, registration, and installed-loader collisions cannot be verified from these files. |
| Service | `search` | collision recommendation | This generic unprefixed name presents collision risk. The fixture explicitly treats it as a warning, not a compatibility error. Consider an appropriately namespaced identifier if consumers permit it; no existing conflicting service is shown. |
| Tool | `acme_greet_hi` | unknown | It includes the namespace and plugin name. No duplicate is shown locally, but tool grammar, runtime registration, and other providers are absent. |
| Command | `acme-greet-hi` | unknown | The name is identity-prefixed. No command compatibility violation is established; command syntax and installed command inventory are not provided. |
| Skill | `greet` | collision recommendation | A short, generic skill name may overlap with another provider. Namespacing is advisory based on collision risk, not an established mandatory syntax rule. No actual conflict or compatibility error is proven. |
| Skill provider | `acme-greet-filesystem` | unknown | It carries a distinguishing identity prefix. Provider rules, implementation, and other installed provider registrations are not supplied. |
| Event | `web-search/ready` | needs registry context | The fixture identifies this as a shared channel: informational, not a compatibility error or automatic rename recommendation. Its different prefix alone is not evidence of misuse. Channel contract, publisher/subscriber intent, and ownership or reservation claims remain unconfirmed. |
| Settings namespace | `acme-greet` | unknown | Identity-prefixed and locally consistent, but settings namespace requirements and host registrations are unavailable. Reusing the same text on a different surface does not itself prove a collision. |
| Exact route | `/api/plugins/acme-greet/hi` | unknown | The route embeds the plugin identity and declares `kind: exact`. No duplicate route is present in the manifest. Router constraints and host/other-plugin route overlap cannot be verified without their inventories and matching rules. |

## Evidence limits and disposition

The manifest has `schemaVersion: 1` and policy label `dsh-plugin-naming/v1`; these labels alone do not prove conformance. Each supplied name list has one entry, so no within-list duplicate is visible. Cross-surface repeated text is not sufficient evidence of a conflict. No runtime source, complete naming specification, host inventory, or registry response is supplied.

`private: true` is explicitly described by the fixture as a test-material publication guard, not a naming finding. No publication, build, reproduction environment, dependency installation, migration, or runtime verification was attempted. The fixture was not modified.

Disposition: retain the valid short-name judgment; treat generic-name collision concerns as advice; treat the shared event as informational; leave registry status unknown/not checked. This report is not a global availability certificate or publication clearance. Authoritative policy/runtime evidence and an authorized registry lookup would be needed to resolve the remaining unknowns.

No skills were consulted. There is no blocker to completing this local report; the missing authoritative context limits stronger conclusions.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.