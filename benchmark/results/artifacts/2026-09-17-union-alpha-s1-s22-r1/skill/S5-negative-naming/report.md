# S5 · Naming Four-State Judgment Report (Read-Only)

Task: read-only compatibility judgment of the naming declaration in the S5 fixture before community publication. Mode A (inspect) of the plugin-upgrade skill: investigation and report only; no file under the fixture was modified, and no build, install, migration, or network/registry query was performed. Closed-book brief: no reference material outside the fixture was consulted, so every claim below rests on the fixture files alone (package.json, dsh-plugin.naming.json, README.md) plus the plugin-upgrade skill's own guidance.

## Pre-existing
Not collected (read-only inspection mode; no baseline run applicable).

## Sources inspected
- fixture package.json: name "dsh-greet", version 0.1.0, private: true.
- fixture dsh-plugin.naming.json: schemaVersion 1, policy dsh-plugin-naming/v1, plugin coordinate acme/greet, packageName dsh-greet.
- No other evidence (no lockfile, no source code, no registry manifest) exists in the fixture.

## Four-state verdict legend
- compatibility error — the name breaks a naming/coordinate rule or guarantees breakage.
- collision recommendation — the name is valid but so generic or shared that a prefix/namespace change is advised.
- needs registry context — validity depends on whether the name is already taken by another published plugin; the local evidence cannot decide it.
- unknown / not checked — no evidence available locally; not claimed either way.

## Per-surface judgment

### 1. Plugin coordinate acme/greet (pluginNames: ["greet"])
Verdict: collision recommendation, with a needs-registry-context component.
Reasoning: the coordinate is properly two-part (namespace "acme" + name "greet"), which is structurally valid — no compatibility error. However, the short name "greet" is a highly generic dictionary word. Within the namespace it is unambiguous, but the generic short name invites confusion with any other plugin named "greet" and weakens search/discovery. Whether any published plugin already occupies "acme" or "greet" cannot be determined without a registry query, so the occupancy question is needs registry context / unknown, not "available". The prefix ("greet" instead of a more specific "acme-greet" style short name) is a recommendation, not an error.

### 2. Package name "dsh-greet" (packageName)
Verdict: needs registry context.
Reasoning: the package name uses the bare "dsh-" prefix with no namespace segment. Locally this is internally consistent with the manifest (packageName field matches). Whether "dsh-greet" is free on the registry, and whether the community naming policy reserves or discourages un-namespaced "dsh-*" package names, cannot be verified in this closed-book review. No compatibility error is claimed; the occupancy and policy questions are reported as unknown/not-checked. Note: nothing in the fixture shows a GitHub owner/repo to compare against the registry scope; per the skill, those are independent coordinates and no inference was made between them.

### 3. Loader id "acme-greet"
Verdict: collision recommendation (mild).
Reasoning: the id is namespaced, so it is structurally sound. It derives cleanly from the coordinate. Only risk is generic collision with other "acme" namespace users, which is a registry-context question, not an error.

### 4. Service name "search"
Verdict: collision recommendation.
Reasoning: this is the clearest naming weakness in the manifest. "search" is a completely unprefixed, maximally generic service name. Service names are consumed via ctx.get('search') / inject: ['search'], so any second plugin exposing an unprefixed "search" service in the same host composition collides or silently shadow-resolves — a real compatibility hazard, but one that depends on what else is installed, not on a rule violation in this file alone. It is therefore a warning-level collision recommendation (prefix it, e.g. acme-greet-search), not a compatibility error. The fixture README itself frames this surface as "warning not an error", which matches.

### 5. Tool name "acme_greet_hi"
Verdict: no compatibility error; collision risk low.
Reasoning: fully prefixed with the plugin namespace and underscore-delimited, which is the strong pattern for tool names. Generic collision is unlikely. Whether the exact identifier is already used elsewhere is unknown/not-checked (no registry or corpus was queried), but structurally this is the best-named surface in the manifest.

### 6. Command "acme-greet-hi"
Verdict: no compatibility error; collision risk low.
Reasoning: fully namespaced with the plugin prefix, mirroring the tool. Same residual unknown: global uniqueness not verified.

### 7. Skill name "greet"
Verdict: collision recommendation.
Reasoning: unlike the tool/command, the skill short name is unprefixed and generic ("greet"). Skill names are user-visible and matched by name, so a generic single word collides easily with any other plugin or built-in skill named "greet". A prefixed name (acme-greet) would be safer. Not an error, but the weakest skill-surface choice; occupancy elsewhere is needs registry context.

### 8. Skill provider "acme-greet-filesystem"
Verdict: collision recommendation.
Reasoning: the provider id embeds the plugin namespace correctly, but the "filesystem" tail echoes a well-known built-in/capability name family (dsh filesystem capability). If any host or plugin also registers a "-filesystem" skill provider, confusion between an acme-owned provider and the platform filesystem surface is plausible. Verdict stays at recommendation level: no rule break is demonstrable from the fixture, and actual occupancy is unknown.

### 9. Event "web-search/ready"
Verdict: collision recommendation / shared-channel (informational).
Reasoning: scoped event names ("web-search/ready") read as a shared, platform-level channel namespace ("web-search") rather than an acme-owned one. If the host or another plugin emits or listens on "web-search/ready", this plugin's event would share that channel — either intentional interop or an unintended cross-talk. Nothing in the fixture proves "web-search" is a reserved host namespace (closed book), so this is reported as informational: treat the scope as shared unless acme owns it; do not assume exclusivity. Not a compatibility error.

### 10. Settings namespace "acme-greet"
Verdict: no compatibility error.
Reasoning: namespaced consistently with the loader id and coordinate. Low generic-collision risk. Global occupancy not checked.

### 11. Route /api/plugins/acme-greet/hi (kind: exact)
Verdict: no compatibility error.
Reasoning: the route lives under the conventional /api/plugins/<loader-id>/ prefix with the plugin's own loader id segment, which is the structurally correct, namespaced pattern for plugin HTTP surfaces. Exact-kind matching is narrow. No conflict is demonstrable locally.

## No findings ≠ no problems — explicit honesty section
- No online registry, npm index, GitHub, or community-plugin catalog was queried (closed-book brief; no external services). Consequently:
  - No surface is claimed to be "reserved", "free", or "globally available".
  - Occupancy of every name above is reported as unknown/not-checked; several verdicts would tighten (to collision error) or relax (to available) once a registry query is possible.
  - Whether the "web-search" event scope or the "-filesystem" provider tail collides with actual platform built-ins in a live host is unconfirmed — it depends on the host version's registration inventory, which the fixture does not contain.
- The manifest declares policy dsh-plugin-naming/v1 and schemaVersion 1; this review had no normative copy of that policy available (the community-standard document is external and was not fetched), so rule-level judgments are derived from the plugin-upgrade skill's general guidance and internal consistency of the fixture. Any strict conformance check against the normative policy text is unconfirmed.
- package.json is private: true; the fixture README states this is repository test discipline. Publication readiness of the package metadata itself (license, repository, exports) was out of scope and not evaluated.

## Completed
- Read-only inspection of all three fixture files; every declared naming surface judged with a four-state verdict and reasoning; no fixture or repository file modified; no build, install, or migration performed.

## Skipped
- Registry/occupancy queries (closed-book, no external access): reported as unknown rather than guessed.
- Normative dsh-plugin-naming/v1 policy conformance check: policy text unavailable locally.
- Runtime activation or mount verification: not requested and would violate the no-reproduction-environment constraint.

## Pending / residual risk
- The generic service name "search" is the highest-impact residual risk: harmless alone, hazardous in any composition where another plugin exposes the same unprefixed service.
- The "web-search/ready" event and "acme-greet-filesystem" provider may interact with platform built-ins in ways unverifiable here.
- Package name "dsh-greet" availability and any un-namespaced "dsh-*" policy restriction are unconfirmed.

## Recommendations
1. Rename the service to a prefixed name (e.g. acme-greet-search) before publishing.
2. Prefix the skill name (e.g. acme-greet) for the same reason.
3. Confirm ownership or intentional interop of the "web-search" event scope; if acme does not own it, switch to an acme-owned scope.
4. Verify "dsh-greet" package occupancy and any community policy on un-namespaced "dsh-*" package names with a real registry query before publishing.
5. Confirm the "acme" namespace itself is claimed/owned by the publisher, since every coordinate in the manifest depends on it.
6. Keep tool/command/settings/route names as-is: they follow the strong namespaced pattern.

## Rollback
Not applicable — no files were changed; the fixture and all repository paths remain at their original state.
