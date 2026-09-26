# S5 · Naming Four-State Judgment Report (Read-Only Review)

- Task: S5-negative-naming (naming four-state judgment, negative capability check)
- Reviewed material (read-only, unchanged):
  - E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S5-negative-naming/environment/fixture/package.json
  - E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S5-negative-naming/environment/fixture/dsh-plugin.naming.json
  - E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S5-negative-naming/environment/fixture/README.md
- Review mode: static, read-only. No file under the fixture directory was modified, created, or renamed. No reproduction environment was built, no dependencies installed, nothing published.
- Registry queries performed: **none**. The brief forbids network access; therefore no claim of "reserved", "taken", or "globally available" is made anywhere in this report.

## Verdict scale used

Per the brief, each surface receives one of: **compatibility error** (violates a structural/compatibility rule that can be established from the material itself), **collision recommendation** (well-formed but risky/generic; a rename or namespace prefix is advised), **needs registry context** (the judgment depends on data only a registry or host catalog can provide), **unknown** (cannot be determined from available evidence and was not checked).

Compound verdicts are given where a surface is structurally fine but its uniqueness cannot be judged offline; this is deliberate restraint, not hedging.

## Summary table

| # | Surface | Declared value | Verdict |
|---|---------|----------------|---------|
| 1 | Plugin short name | greet | Not a compatibility error · collision recommendation · global availability unknown |
| 2 | Plugin coordinate | acme/greet | Not a compatibility error · namespace uniqueness unknown (needs registry context) |
| 3 | Loader id | acme-greet | Not a compatibility error · uniqueness unknown |
| 4 | npm package name | dsh-greet | Collision recommendation · availability unknown · publish blocked by private:true (observation) |
| 5 | Service name | search | Collision recommendation (strong) · not claimed as an error · existence of a colliding host service unknown |
| 6 | Tool name | acme_greet_hi | Not a compatibility error · uniqueness unknown |
| 7 | Command name | acme-greet-hi | Not a compatibility error · uniqueness unknown |
| 8 | Skill name | greet | Collision recommendation · not claimed as an error · catalog overlap unknown |
| 9 | Skill provider | acme-greet-filesystem | Not a compatibility error · semantic overlap with core fs capability noted (informational) |
| 10 | Event name | web-search/ready | Informational: shared-channel style name · actual collision unknown (needs registry context) |
| 11 | Settings namespace | acme-greet | Not a compatibility error |
| 12 | Route | /api/plugins/acme-greet/hi (exact) | Not a compatibility error · global route uniqueness unknown |

No surface is judged a compatibility error. That is a judgment about this manifest's internal well-formedness only; it is not a statement that the plugin is safe to publish.

## Per-surface reasoning

### 1. Plugin short name: greet

- Well-formed as a short name: single lowercase word, no separators, no reserved-looking syntax. Nothing in the reviewed material makes it a compatibility error.
- It is a generic dictionary word. Published plugin ecosystems accumulate short names like this quickly, so as a community-publication name it carries collision risk: a collision recommendation, not an error.
- The manifest already carries the namespaced coordinate acme/greet and loader id acme-greet; a prefix-style recommendation (e.g., publishing under the acme namespace consistently) is the standard mitigation. Prefixes are a recommendation here, not a rule I can prove is mandatory — the normative text of dsh-plugin-naming/v1 is not included in the fixture, so any claim that unprefixed names are forbidden would be unverified.
- Whether "greet" (as a plugin name, or "dsh-greet" as a package) is already reserved or in use: **unknown / not checked**. No registry was queried.

### 2. Plugin coordinate: acme/greet

- Internally consistent with pluginNames ("greet") and loaderIds ("acme-greet"); the coordinate string itself is well-formed namespace/name.
- The namespace "acme" is the collision surface, not "greet": if another publisher already holds the "acme" namespace in whatever registry accepts community plugins, both greet and every derived name below inherit that conflict. That is exactly a needs-registry-context question and it is **unknown / not checked**.

### 3. Loader id: acme-greet

- Derived correctly from the coordinate (namespace-name, hyphenated). Consistent with the coordinate and with the tool/command/settings/route namespacing. No compatibility error established.
- Uniqueness against other installed plugins: unknown / not checked.

### 4. npm package name: dsh-greet

- Collision recommendation. An unscoped dsh-* package name sits in the same string space as first-party dsh tooling packages; community plugins that take unscoped dsh-* names are the classic impersonation/collision hazard. A scoped name (publisher-owned scope, e.g. @acme/...) or an explicit community prefix would remove the ambiguity. I cannot confirm from the fixture what convention the target registry prescribes for community package names, so the specific recommended form is unconfirmed; the hazard itself stands on the name's genericity.
- Availability of "dsh-greet" on npm: **unknown / not checked** (no network access).
- Observation, not a verdict: package.json sets "private": true, which makes the package unpublishable via npm as-is. The fixture README states this flag is repository test-material discipline rather than part of the brief; I record it as an observation and take no verdict from it.

### 5. Service name: search (the key negative test)

- Verdict: collision recommendation — a warning, **not** a compatibility error.
- Reasoning: "search" is a single unprefixed generic word for a service. Service namespaces are shared with the host and with every other plugin, so a bare generic verb-noun is the highest-risk shape in the manifest. The standard mitigation is a namespaced service name derived from the coordinate (for example acme-greet-scoped naming, exact form unconfirmed since the naming policy text is not in the fixture).
- Restraint checks applied:
  - I do not claim that "search" collides with a concrete built-in host service. Verifying that would require the host service catalog, which is outside the fixture and not queried. Status: unknown / not checked.
  - I do not claim the naming policy makes unprefixed service names an error. Without the policy's normative text this cannot be established; it stays a recommendation-level finding.

### 6. Tool name: acme_greet_hi

- Correctly prefixed with the coordinate-derived token and the underscore convention for tool names. No compatibility error established from the material.
- Whether this exact tool id is already registered in any host: unknown / not checked.

### 7. Command name: acme-greet-hi

- Prefixed, hyphenated, consistent with the coordinate. No compatibility error established. Global uniqueness: unknown / not checked.

### 8. Skill name: greet

- Verdict: collision recommendation, not an error.
- Same shape of problem as the service name: a bare generic word in a shared skill-name space. Skill catalogs commonly contain generic single words, and a community plugin claiming "greet" invites both provider-selection ambiguity and impersonation. Recommend a prefixed skill name (e.g. acme-greet style, exact prescribed form unconfirmed).
- Whether a "greet" skill already exists in any catalog: unknown / not checked.

### 9. Skill provider: acme-greet-filesystem

- Prefixed and consistent. No compatibility error established.
- Informational only: the tail token "filesystem" gestures at a capability area that host builds typically provide natively (filesystem/fs capability). If the intent is to wrap or shadow built-in filesystem behavior, that is a design question rather than a naming defect, and no overlap can be confirmed without the host catalog. Unknown / not checked.

### 10. Event name: web-search/ready

- Verdict: informational — shared-channel style name; collision cannot be confirmed without the event registry, so it is needs-registry-context / unknown, and I do not rate it an error.
- Reasoning: slash-form event names of the kind channel/event place this declaration in a shared event namespace. "web-search" is a plausible name for a channel that a host web/search capability could already own; if both a host build and this plugin emit or listen on web-search/ready, subscribers see cross-plugin traffic indistinguishable from their own. That is precisely why generic channel names in shared event spaces are informational-to-warning grade even when formally well-formed.
- Whether any host or other plugin already uses the web-search channel or the ready event on it: **unknown / not checked**. No event registry or host catalog was consulted.
- Restraint check: I do not claim this event name is reserved, nor that it is free.

### 11. Settings namespace: acme-greet

- Namespaced, consistent with loader id and command prefix. No compatibility error established. Overlap with another plugin's settings namespace: unknown / not checked, risk low given the prefix.

### 12. Route: /api/plugins/acme-greet/hi (kind: exact)

- Follows the conventional /api/plugins/<loader-id>/... layout with an exact-kind path. No compatibility error established from the material.
- Route collisions are decided by whatever host mounts plugin routes; uniqueness of this path across the host and other plugins: unknown / not checked.

## Cross-surface consistency observations

- Internal coherence is good: every derived surface (loader id acme-greet, tool acme_greet_hi, command acme-greet-hi, settings namespace acme-greet, route segment acme-greet) derives from the declared coordinate acme/greet, and the manifest declares them explicitly rather than implying them. No internal contradiction between package.json (name dsh-greet) and the naming manifest (packageName dsh-greet).
- The manifest declares schemaVersion 1 and policy dsh-plugin-naming/v1. The fixture does not include the normative schema or policy text, so conformance to that policy beyond structural well-formedness is **unconfirmed**. I flag this rather than asserting compliance.
- The two unprefixed outliers in an otherwise consistently prefixed manifest are the service name search, the skill name greet, and the shared-channel event web-search/ready; these are the surfaces where recommendation-level findings concentrate.

## Unknown / not-checked register (negative-capability ledger)

The following judgments were deliberately not made, because making them would require resources outside the fixture (a registry, the naming policy's normative text, or a host catalog), and the brief forbids both network access and building a reproduction environment:

1. Reservation or availability of the plugin name greet, the coordinate acme/greet, the loader id acme-greet, or the package name dsh-greet in any public registry (npm or a dsh plugin registry).
2. Whether the naming policy dsh-plugin-naming/v1 mandates prefixes for service names, skill names, or event channels, and what its exact legal grammar is (the fixture contains no policy text; only the policy identifier).
3. Whether a host-provided service named search, a skill named greet, a skill provider filesystem-style, or an event channel web-search already exists in the target host build.
4. Whether the route /api/plugins/acme-greet/hi is unique across the target host.
5. Whether acme is a squat-prone namespace commonly claimed by placeholder publishers (the acronym is a well-known placeholder, which raises the prior probability of namespace contention, but that remains an unquantified prior, not a finding).

Accordingly: no surface is reported as "reserved", none is reported as "globally available", and the absence of compatibility-error findings must not be read as a clean bill of registry health. The publish-blocking questions are all in the registry-context bucket and remain open.

## Process record

- Fixture accessed strictly read-only; nothing under the fixture directory or the benchmark repository was modified, created, deleted, or renamed.
- No reproduction environment was built; no dependencies were installed; no network or registry access was attempted.
- No files under the benchmark repository's skills/ directory were read (noskill constraint honored).
- This report is the only file written, at the designated output path.
