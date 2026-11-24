# JUDGE BRIEF · skill.S5-negative-naming

## Criteria (sealed rubric)
- [official-short-name] (25pt) Locate greet in dsh-plugin.naming.json and distinguish the declared plugin name from its package/coordinate. Under the supplied fixture policy it is a valid official short name, not a compatibility error. A publisher prefix may reduce collisions but is not a mandatory compatibility repair. Merely repeating greet or valid is insufficient.
- [service-collision-advice] (25pt) Locate the unprefixed service search. Explain the collision risk and classify it as a warning/recommendation rather than a compatibility error. Do not treat a strict-mode nonzero exit as proof of an incompatible API. A strict-mode command is not required.
- [shared-event-context] (25pt) Locate web-search/ready as an event shared channel. Explain that matching names alone do not establish a conflict; publisher schema compatibility and registry context determine conflicts. Informational/shared-channel wording is equivalent; an unsupported claim of global uniqueness is not.
- [coverage-and-registry-limits] (25pt) Account for the remaining declared naming surfaces (loader, tool, command, skill/provider, settings and route), which may be grouped with a justified common verdict. Distinguish local naming compatibility from unqueried registry occupancy/reservation/availability. State unknown/not checked for registry-dependent claims and propose later verification without claiming it was run. Do not invent an error from private:true, which marks test material. An explicit rejection of all-clear/reserved/globally-available claims is correct.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [unsupported-all-clear] ceiling=30 Trigger only for an affirmative, unsupported blanket conclusion that every surface passes/is globally available or publication is cleared despite the unqueried registry. Correct local compatibility verdicts, hypothetical bad examples and explicitly rejected all-clear claims do not trigger this cap.

## Candidate report(s)
#### FILE: S5-negative-naming/naming-judgment.md

# Read-only naming judgment: acme/greet

Completed: inspected all three fixture files and the supplied plugin-upgrade SKILL.md in Mode A. Package identity is `dsh-greet`, version `0.1.0`; naming policy claims `dsh-plugin-naming/v1`, schema version 1. Package and naming manifest packageName agree. The fixture README supplies local interpretation for the short name, service, and event; no external normative standard or registry was retrieved.

Plan executed under BENCHMARK-AUTH-v1: read the declarations, distinguish compatibility from collision advice and registry questions, and write this report only. No source, configuration, package, or naming declaration was changed.

## Judgment categories

- **compatibility error**: a demonstrated violation of an applicable contract; none established by these declarations.
- **collision recommendation**: advisory namespace hygiene, not a compatibility failure or proof of collision.
- **needs registry context**: a concrete ownership/uniqueness question requires the relevant registry or host composition.
- **unknown**: available evidence cannot establish the result. All registry status is unknown/not checked.

A surface can be locally acceptable and still have unknown registry status. No findings does not mean no problems.

| Surface and declared value | Verdict | Reasoning and limits |
|---|---|---|
| Plugin short name / pluginNames: `greet` | collision recommendation | Valid short name according to fixture README; absence of a prefix is not a compatibility error. A distinctive name may reduce ambiguity, but renaming is optional advice. No evidence establishes exclusive ownership. |
| Namespace `acme`; coordinate `acme/greet` | needs registry context | Coordinate matches the declared namespace and name. Authority to use `acme` and ownership of `acme/greet` cannot be established from self-declaration. |
| Package `dsh-greet` | needs registry context | `package.json.name` agrees with `plugin.packageName`. npm existence, ownership, publish rights, and availability were not queried. A `dsh-` prefix does not establish official status or reservation. |
| Loader ID `acme-greet` | needs registry context | Distinctive prefix is helpful, but uniqueness depends on actual loader/profile entries, which are absent. No collision is demonstrated. |
| Service `search` | collision recommendation | Generic, unprefixed service key merits a collision warning, not an error. Actual competing providers and intended service contract are unknown; consider an owned prefix if this is a private plugin-specific service. Do not rename an intentionally shared service contract blindly. |
| Tool `acme_greet_hi` | unknown | Appears plugin-prefixed; no local collision evidence. No tool registry, implementation, or target-host grammar supplied to certify runtime acceptance or uniqueness. |
| Command `acme-greet-hi` | unknown | Appears plugin-prefixed; no demonstrated defect. Runtime command registration and collisions are unverified. |
| Skill `greet` | collision recommendation | A generic short skill name can overlap other installed skills; an owned prefix is advisory, not a proven compatibility requirement. Actual skill resolution and registry ownership remain unknown. |
| Skill provider `acme-greet-filesystem` | unknown | Distinctive provider name offers local namespace hygiene, but provider registration, ownership, and uniqueness are unverified. |
| Event `web-search/ready` | needs registry context (informational) | Fixture explicitly identifies a shared channel. Using another-looking prefix is not itself an error and does not justify an automatic rename. The event contract, payload, publisher/subscriber role, and applicable host version are not supplied; confirm those before treating interoperability as proven. |
| Settings namespace `acme-greet` | unknown | Consistent with plugin identity, with no local conflicting declaration. Actual settings registry and scope are absent. |
| Exact route `/api/plugins/acme-greet/hi` | needs registry context | Plugin-scoped path is a useful collision precaution. The exact-route declaration does not show other exact/prefix routes, method matching, mount precedence, or host routing rules, so actual collision/acceptance remains unverified. |
| `schemaVersion: 1`, policy `dsh-plugin-naming/v1` | unknown | These identify the intended schema/policy; no schema validator or complete normative naming specification is supplied. Declaration alone does not prove conformance. |

## Registry status and conclusion

**Registry query: not performed. Status: unknown/not checked for every identifier.** Neither `greet`, `search`, `web-search/ready`, nor any other name is asserted to be reserved, registered to this author, occupied by another owner, or globally available. Prefix consistency is not a registry check. The local review establishes no compatibility error; it does not certify publication readiness, runtime compatibility, or the absence of collisions.

Completed: declaration consistency review and per-surface judgment above. Skipped: builds, dependency installation, package scripts, migrations, reproduction environments, runtime mounting, network queries, and publication, as required. Pre-existing baseline: not collected; this is not a migration. Host/Node version, source SHA, installed-plugin identity and DSH dependency cohort: unconfirmed/not supplied; no wider repository inspection was performed.

Pending: authoritative policy validation, ownership checks against the relevant registries, and target-profile contract/route inventory if publication validation is later authorized. These evidence gaps do not block this bounded read-only report.

Rollback: no fixture changes were made; no rollback is necessary. Only this report was created in the authorized agent-output directory. `private: true` is expressly test-material discipline in the fixture README, not a naming defect; no change or publication is recommended for this fixture.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.