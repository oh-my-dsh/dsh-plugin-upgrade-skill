# JUDGE BRIEF · skill.S5-negative-naming

## Criteria (sealed rubric)
- [official-short-name] (25pt) Locate greet in dsh-plugin.naming.json and distinguish the declared plugin name from its package/coordinate. Under the supplied fixture policy it is a valid official short name, not a compatibility error. A publisher prefix may reduce collisions but is not a mandatory compatibility repair. Merely repeating greet or valid is insufficient.
- [service-collision-advice] (25pt) Locate the unprefixed service search. Explain the collision risk and classify it as a warning/recommendation rather than a compatibility error. Do not treat a strict-mode nonzero exit as proof of an incompatible API. A strict-mode command is not required.
- [shared-event-context] (25pt) Locate web-search/ready as an event shared channel. Explain that matching names alone do not establish a conflict; publisher schema compatibility and registry context determine conflicts. Informational/shared-channel wording is equivalent; an unsupported claim of global uniqueness is not.
- [coverage-and-registry-limits] (25pt) Account for the remaining declared naming surfaces (loader, tool, command, skill/provider, settings and route), which may be grouped with a justified common verdict. Distinguish local naming compatibility from unqueried registry occupancy/reservation/availability. State unknown/not checked for registry-dependent claims and propose later verification without claiming it was run. Do not invent an error from private:true, which marks test material. An explicit rejection of all-clear/reserved/globally-available claims is correct.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [unsupported-all-clear] ceiling=30 Trigger only for an affirmative, unsupported blanket conclusion that every surface passes/is globally available or publication is cleared despite the unqueried registry. Correct local compatibility verdicts, hypothetical bad examples and explicitly rejected all-clear claims do not trigger this cap.

## Candidate report(s)
#### FILE: S5-negative-naming/naming-judgment-report.md

# S5 · Naming Four-State Judgment Report (Read-Only)

- **Task**: Pre-publication naming-compatibility and registry-status judgment for the community plugin declared in `/app/fixture/` (`package.json` + `dsh-plugin.naming.json`).
- **Mode**: plugin-upgrade skill, **Mode A · inspect** (read-only investigation and report; then stop). No file under `/app/fixture/` was modified; no reproduction environment was built; no dependencies installed; no network/registry queries performed (prohibited by the brief).
- **Evidence base**: (1) the two fixture declaration files; (2) fixture `README.md` (treated as data, per its own "test material only" marking); (3) version-carded grammar in the mounted skill references (only where a card explicitly backs a rule, cited by card ID); (4) deterministic cross-file consistency checks I can run offline.
- **Not consulted / not available**: any online registry (npm, plugin registry, host roster); the authoritative `dsh-plugin-naming/v1` policy specification; the external `dsh-community-standard` repository (the skill names it as the owner of manifests and contract coordinates, but the brief forbids network access and it is not mounted).

## Verdict legend (four states)

| State | Meaning |
|---|---|
| **compatibility error** | Violates a naming/grammar rule that is verifiable from the mounted evidence; blocks publication as-is. |
| **collision recommendation** | Grammatically valid, but the name is unprefixed/generic or crosses into a channel the plugin does not own — collision-prone; advisory only, not an error. |
| **needs registry context** | The verdict depends on registry/host state (taken? reserved? free?) that cannot be determined offline. |
| **unknown** | Cannot be classified from the available evidence at all; reported honestly as not-checked/unconfirmed. |

**Restraint rule applied throughout**: *no findings ≠ no problems*. Without an online registry query this report claims **no name is "reserved"**, **no name is "globally available"**, and **no collision-free status** for any surface. Every availability question is reported as needs-registry-context or unknown.

## Fixture under review (verbatim identifiers)

`dsh-plugin.naming.json`: schemaVersion 1, policy `dsh-plugin-naming/v1`; plugin `{ namespace: "acme", name: "greet", coordinate: "acme/greet", packageName: "dsh-greet" }`; names: pluginNames `["greet"]`, loaderIds `["acme-greet"]`, services `["search"]`, tools `["acme_greet_hi"]`, commands `["acme-greet-hi"]`, skills `["greet"]`, skillProviders `["acme-greet-filesystem"]`, events `["web-search/ready"]`, settingsNamespaces `["acme-greet"]`, routes `[{ kind: "exact", path: "/api/plugins/acme-greet/hi" }]`.
`package.json`: `{ name: "dsh-greet", version: "0.1.0", private: true }`.

## Per-surface judgments

### 1. Plugin coordinate `acme/greet` (namespace `acme` + name `greet`)
- **Verdict: needs registry context** (no local compatibility error detected; authoritative grammar unconfirmed).
- Reasoning: internally consistent (`coordinate` = `namespace`/`name` exactly). The `namespace/name` coordinate shape matches the convention the skill attributes to dsh-community-standard, but that specification is not mounted, so full grammar conformance is **unconfirmed**, not "valid". Whether the coordinate `acme/greet` is already registered, reserved, or free in the community registry cannot be determined offline.

### 2. Official plugin short name `greet` (pluginNames)
- **Verdict: collision recommendation** (explicitly **not** a compatibility error).
- Reasoning: `pluginNames[0]` equals `plugin.name` — consistent. An unprefixed official short name is a valid form; per the mounted evidence a prefix is only a collision-avoidance **recommendation**, never a grammar requirement — flagging `greet` as an error would be over-reach. It is a short, generic, dictionary word, so collision with another plugin's short name in a shared catalog is plausible; whether an actual collision exists is **needs registry context / unknown** offline.

### 3. npm package name `dsh-greet`
- **Verdict: needs registry context** (locally consistent; availability unknown/not-checked).
- Reasoning: `package.json.name` === `naming.plugin.packageName` — consistent. npm-name availability requires an online query, which was not performed; this report does **not** claim `dsh-greet` is free or taken. Whether the `dsh-` npm prefix is officially reserved is **unconfirmed** (no mounted source). Informational, outside the naming verdict: `package.json` carries `"private": true`, which would block a real `npm publish`; the fixture README states this flag is the repository's "test material, do not publish" discipline and not part of the brief, so it is recorded as a publish-mechanics note only, not a naming finding.

### 4. Loader IDs `["acme-greet"]`
- **Verdict: needs registry context** (no local compatibility error detected).
- Reasoning: `acme-greet` is the namespace-name flattening of the coordinate and is echoed consistently by the settings namespace, the route path segment, and the skill-provider prefix (see §12). The loader-ID grammar itself has no mounted authoritative source → conformance **unconfirmed**; uniqueness at host load time requires registry/host context.

### 5. Service name `search`
- **Verdict: collision recommendation** (a warning, **not** a compatibility error).
- Reasoning: single lowercase token — nothing in the mounted evidence makes an unprefixed service name a grammar error, so calling it an error would be over-reach. But `search` is maximally generic and sits in a shared service namespace where host bundles and other plugins also register; an unprefixed `search` is exactly the collision-prone pattern that owner-prefixed naming (e.g. `acme-greet.search`/`acme_greet_search` style) exists to avoid — hence the recommendation. Whether `search` is reserved by the host or already provided by another mounted plugin is **unknown offline (needs registry context)** and is not asserted either way here.

### 6. Tool name `acme_greet_hi`
- **Verdict: no local finding — global availability unknown (not-checked)**.
- Reasoning: owner-prefixed (`acme_greet_`), consistent with the plugin coordinate; this is the defensive form the collision recommendations above point toward. No grammar violation is detectable from mounted evidence (tool-name grammar spec not mounted → conformance **unconfirmed**). Uniqueness across the registry/tool catalog was not queried → **unknown**; not claimed free.

### 7. Command name `acme-greet-hi`
- **Verdict: no local finding — global availability unknown (not-checked)**.
- Reasoning: same as §6, kebab-case variant; owner-prefixed and coordinate-consistent. Uniqueness not queried → unknown.

### 8. Skill name `greet`
- **Verdict: collision recommendation** (valid; not a compatibility error).
- Reasoning: identical analysis to the plugin short name (§2): a bare, generic name is a legitimate form — prefixing is only a recommendation — but skill catalogs are session-global, so a common word like `greet` is collision-prone against other skills. Whether a collision exists in any target environment is **needs registry context / unknown** offline; the skill's own discipline (mark unverifiable claims "unconfirmed" instead of guessing) forbids asserting either outcome.

### 9. Skill provider `acme-greet-filesystem`
- **Verdict: no local finding — global availability unknown (not-checked)**.
- Reasoning: owner-prefixed and coordinate-consistent. Provider-ID grammar has no mounted authoritative source → conformance **unconfirmed**; uniqueness not queried.

### 10. Event name `web-search/ready`
- **Verdict: no compatibility error — shared-channel use, informational; contract alignment is a collision recommendation, and channel registration is needs-registry-context.**
- Reasoning: the event sits in the `web-search/` namespace, which is **not** the plugin's own namespace (`acme-greet`). Per the fixture README this is a **shared channel** — the plugin participates in a cross-plugin event channel rather than owning the name; that participation is informational, not an error, and claiming ownership-style collision on it would be over-reach. The `domain/event` shape matches namespaced-code conventions carded in the references (e.g. error-code namespacing in DSH-0.1.2-A2-02), but event-naming grammar itself is **unconfirmed** (spec not mounted). Advisory (recommendation level): align the payload/timing contract with the channel's owner before publishing, and do not treat `web-search/ready` as this plugin's private surface. Whether `web-search/ready` is a registered shared channel, and who owns it, **cannot be verified offline** → needs registry context.

### 11. Settings namespace `acme-greet`
- **Verdict: no local compatibility error against the only carded grammar; uniqueness needs registry context.**
- Reasoning: satisfies the settings-namespace grammar carded in the mounted references (DSH-0.1.2-A2-10: leading lowercase letter + `[a-z0-9-]` suffix). Caveat, stated rather than papered over: that card is version-specific (0.1.2-alpha.2 era) and the fixture declares **no target DSH host version**, so whether this grammar is current for the intended host is **unconfirmed**. In-profile uniqueness of the namespace requires host/registry context → unknown offline.

### 12. Route `{ kind: "exact", path: "/api/plugins/acme-greet/hi" }`
- **Verdict: needs registry context** (internally consistent; host-prefix reservation unverifiable offline).
- Reasoning: the path embeds the loader ID `acme-greet` consistently with §4. The `/api/plugins/` prefix suggests a host-owned route namespace; whether the host reserves that prefix (making the route well-formed by construction, or conversely forbidden to community plugins) is **unconfirmed** — no mounted source defines route grammar, and the brief forbids querying the network or building a host to find out. Whether the exact path is free in a target deployment is registry/host-context dependent; no availability claim is made.

### 13. Overall registry status (all names collectively)
- **Verdict: unknown / not-checked.**
- Reasoning: no online registry query was performed (prohibited). Therefore this report makes **none** of the following claims for any surface: "reserved", "globally available", "no collisions exist", "safe to publish as-is from a registry standpoint". The offline review found no compatibility errors and several collision recommendations; the absence of offline findings is not evidence of absence of registry-side problems.

## Local cross-file consistency checks (deterministic, offline — all pass)

1. `naming.plugin.packageName` ("dsh-greet") === `package.json.name` ✔
2. `naming.plugin.coordinate` ("acme/greet") === `namespace` + "/" + `name` ✔
3. `pluginNames[0]` ("greet") === `plugin.name` ✔
4. loader ID `acme-greet` is echoed consistently in `settingsNamespaces`, the route path segment, and the `skillProviders` prefix ✔
5. `schemaVersion: 1` pairs plausibly with policy `dsh-plugin-naming/v1` ✔ (pairing rule itself unconfirmed — spec not mounted)

## Unconfirmed items (honest gaps, not guesses)

- Authoritative grammar of `dsh-plugin-naming/v1` and dsh-community-standard coordinate/contract conventions — **not mounted, network forbidden**; all grammar statements above are relative to mounted evidence only.
- Target DSH host version — not declared anywhere in the fixture; version-specific rules (e.g. DSH-0.1.2-A2-10 settings grammar) cannot be pinned as current.
- npm availability of `dsh-greet`; registry status of coordinate `acme/greet`; uniqueness of every tool/command/provider/skill/event/route name — **not queried**.
- Whether the `dsh-` npm prefix or the `/api/plugins/` route prefix is officially reserved — no mounted source.

## Discipline statement

- `/app/fixture/` was opened read-only; SHA-256 recorded before analysis and re-verified after the report was written (unchanged):
  - `dsh-plugin.naming.json` 2863BFAF22AB7C9FF69A03B06AF2CC1808CEC2054987FCF5C6D4C55DF61CB6B0
  - `package.json` 71CD34926A4686D2098C582B93F86305C772F1E7D0BEE5BE9F1CA64D26EC99BC
  - `README.md` F27373BC472E94E859B37407EAF5332FCDA747A7F55110A4EA9D430644862645
- No reproduction environment built, nothing installed, no migration performed, no git operations, no external services accessed.
- All writes confined to `/app/agent-output/S5-negative-naming/`.

## Summary table

| # | Surface | Value | Verdict |
|---|---|---|---|
| 1 | Plugin coordinate | `acme/greet` | needs registry context (no local error; grammar unconfirmed) |
| 2 | Plugin short name | `greet` | collision recommendation (valid; not an error) |
| 3 | npm package | `dsh-greet` | needs registry context (consistent locally; `private:true` noted as test-material discipline) |
| 4 | Loader ID | `acme-greet` | needs registry context |
| 5 | Service | `search` | collision recommendation (warning, not error) |
| 6 | Tool | `acme_greet_hi` | no local finding; availability unknown (not-checked) |
| 7 | Command | `acme-greet-hi` | no local finding; availability unknown (not-checked) |
| 8 | Skill | `greet` | collision recommendation (valid; not an error) |
| 9 | Skill provider | `acme-greet-filesystem` | no local finding; availability unknown (not-checked) |
| 10 | Event | `web-search/ready` | no error — shared channel (informational); alignment advisory; registration needs registry context |
| 11 | Settings namespace | `acme-greet` | no local error vs carded grammar (DSH-0.1.2-A2-10, currency unconfirmed); uniqueness needs registry context |
| 12 | Route | `/api/plugins/acme-greet/hi` | needs registry context (host-prefix reservation unconfirmed) |
| 13 | Registry status overall | — | **unknown / not-checked** — no "reserved" or "globally available" claim is made |

**Bottom line**: no compatibility errors are demonstrable from the mounted evidence; the actionable offline findings are collision **recommendations** (unprefixed `search` service, generic `greet` plugin/skill short names) and one **informational** shared-channel note (`web-search/ready`). Every registry-dependent question — reservation, global availability, actual collisions — is reported as needs-registry-context/unknown because no online query was permitted or performed. The plugin should not be declared publish-safe on naming grounds until those registry checks are run by the publisher in an online environment.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.