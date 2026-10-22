# JUDGE BRIEF · noskill.S5-negative-naming

## Criteria (sealed rubric)
- [official-short-name] (25pt) Locate greet in dsh-plugin.naming.json and distinguish the declared plugin name from its package/coordinate. Under the supplied fixture policy it is a valid official short name, not a compatibility error. A publisher prefix may reduce collisions but is not a mandatory compatibility repair. Merely repeating greet or valid is insufficient.
- [service-collision-advice] (25pt) Locate the unprefixed service search. Explain the collision risk and classify it as a warning/recommendation rather than a compatibility error. Do not treat a strict-mode nonzero exit as proof of an incompatible API. A strict-mode command is not required.
- [shared-event-context] (25pt) Locate web-search/ready as an event shared channel. Explain that matching names alone do not establish a conflict; publisher schema compatibility and registry context determine conflicts. Informational/shared-channel wording is equivalent; an unsupported claim of global uniqueness is not.
- [coverage-and-registry-limits] (25pt) Account for the remaining declared naming surfaces (loader, tool, command, skill/provider, settings and route), which may be grouped with a justified common verdict. Distinguish local naming compatibility from unqueried registry occupancy/reservation/availability. State unknown/not checked for registry-dependent claims and propose later verification without claiming it was run. Do not invent an error from private:true, which marks test material. An explicit rejection of all-clear/reserved/globally-available claims is correct.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [unsupported-all-clear] ceiling=30 Trigger only for an affirmative, unsupported blanket conclusion that every surface passes/is globally available or publication is cleared despite the unqueried registry. Correct local compatibility verdicts, hypothetical bad examples and explicitly rejected all-clear claims do not trigger this cap.

## Candidate report(s)
#### FILE: S5-negative-naming/S5-naming-judgment.md

# S5 · Naming Compatibility and Registry Judgment

**Plugin under review:** `acme/greet` — package `dsh-greet` @ `0.1.0`
**Declared sources (read-only):** `fixture/package.json`, `fixture/dsh-plugin.naming.json`
**Mode:** static, offline judgment. No registry query, no host/runtime introspection, no build or reproduction environment, no file under `fixture/` was modified (SHA-256 of all three fixture files re-verified as identical to `fixture-seal.source.json` after the review).

---

## 1. Verdict legend (the four states used below)

| State | Meaning in this report |
| --- | --- |
| **compatibility error** | The declaration breaks a rule that is visible in the fixture or stated in the brief. This alone would block publishing. |
| **collision recommendation** | The name is *permitted* — not an error — but it is generic/unprefixed enough that a namespaced variant is recommended to avoid likely contention with other plugins. Advisory only. |
| **needs registry context** | The status of the name depends on registry/host state that cannot be observed offline (availability, co-ownership, reservation). Deliberately not judged here. |
| **unknown** | The fixture carries too little information to judge the surface at all. |

**Headline result: no compatibility error was found on any surface.** Every open question in this report is a collision-risk or registry-availability question, and none of them was resolved, because resolving them would require a registry query that was neither performed nor permitted.

---

## 2. Per-surface verdicts

| # | Surface | Declared value | Verdict |
| --- | --- | --- | --- |
| 1 | Plugin short name | `greet` (`pluginNames`) | **collision recommendation** (advisory) |
| 2 | Plugin coordinate | `acme/greet` | **needs registry context** |
| 3 | Package name | `dsh-greet` (`package.json`, `plugin.packageName`) | **needs registry context** |
| 4 | Loader id | `acme-greet` | **needs registry context** |
| 5 | Service name | `search` | **collision recommendation** (advisory) |
| 6 | Tool name | `acme_greet_hi` | **needs registry context** |
| 7 | Command name | `acme-greet-hi` | **needs registry context** |
| 8 | Skill name | `greet` | **collision recommendation** (advisory) |
| 9 | Skill provider | `acme-greet-filesystem` | **needs registry context** |
| 10 | Event name | `web-search/ready` | **needs registry context** (informational) |
| 11 | Settings namespace | `acme-greet` | **needs registry context** |
| 12 | Route | `/api/plugins/acme-greet/hi` (`kind: exact`) | **needs registry context** |

### 1. Plugin short name — `greet` → collision recommendation
`greet` is a legal, well-formed official short name, and short names are not required to carry a prefix. It is therefore **not** a compatibility error. It is, however, a generic single word that is plausible for other community plugins to claim, and short names are the surface most likely to contend. Advisory: prefer referring to the plugin by its namespaced coordinate `acme/greet` in user-facing text and registry metadata. Whether the bare short name is actually already taken is **not checked** (see §4). Per the fixture's own guidance (`fixture/README.md`, key points): a valid short name with no compatibility error; prefixes are only collision recommendations.

### 2. Plugin coordinate — `acme/greet` → needs registry context
The coordinate is correctly namespaced and its short segment (`greet`) agrees with `pluginNames: ["greet"]`; the internal consistency of the manifest is intact. The open question is purely external: whether the coordinate (and the `acme` namespace itself) is already published by someone else, and what verification the registry requires for a namespace claim at publish time. No registry context was available offline, so the coordinate is **neither cleared nor flagged** beyond "not checked".

### 3. Package name — `dsh-greet` → needs registry context
The name is well formed, carries the conventional plugin-package prefix, and is identical to `plugin.packageName` in the naming manifest, so package and manifest agree. Availability in the package registry is **not checked**; this report makes no claim that `dsh-greet` is free or taken. (Publish-readiness note, outside the naming judgment: `package.json` sets `"private": true`, which is normally refused by a publish command. That is a manifest field, not a naming surface, and it is noted only because the stated intent is to publish.)

### 4. Loader id — `acme-greet` → needs registry context
The loader id is namespaced and consistent with the coordinate and the settings namespace. Whether the host accepts the `namespace-name` dash form for a loader id, and whether that id is already in use, could not be established from the fixture; the authoritative loader-id grammar was not consulted and the host was not introspected. Not flagged as an error.

### 5. Service name — `search` → collision recommendation (warning, not an error)
`search` is a highly generic, unprefixed service name. Unprefixed service names are permitted, so this is **not** a compatibility error — it is the classic "warning" case. Advisory: rename to a namespaced form such as `acme-search` (or `acme.search`, depending on the service-name grammar the target host version uses) so the service is attributable and does not contend with other plugins' services, including any built-in search facility. Whether a service named `search` already exists in the host or registry is **not checked** and therefore not asserted.

### 6. Tool name — `acme_greet_hi` → needs registry context
Already namespaced (`acme_greet_`), and the underscore form is consistent with the tool-naming style used elsewhere in the fixture. No defect found. Whether the fully qualified tool id is unique across the host and registry is **not checked**.

### 7. Command name — `acme-greet-hi` → needs registry context
Already namespaced and consistent with the command style in the fixture. No defect found. Uniqueness across other plugins' commands is **not checked**.

### 8. Skill name — `greet` → collision recommendation (advisory)
The skill name repeats the generic unprefixed short name, while the plugin's own skill *provider* is properly namespaced (`acme-greet-filesystem`) and its settings namespace is namespaced (`acme-greet`). Skill names are addressed globally by the host, so a bare `greet` is the surface most exposed to an ambiguous invocation. Advisory: rename the skill to `acme-greet` so it matches the plugin's other namespaced surfaces. This is a recommendation, not an error. Whether `greet` is currently taken as a skill name is **not checked**.

### 9. Skill provider — `acme-greet-filesystem` → needs registry context
Properly namespaced; no naming defect found. Uniqueness is **not checked**. Observation outside the naming scope: the name advertises filesystem access, so a capability/permission review of the provider would be worth doing separately — this judgment covers names only and says nothing about what the provider may do.

### 10. Event name — `web-search/ready` → needs registry context (informational)
This is a shared, publisher-agnostic channel name: it lives under a `web-search` channel rather than the plugin's own `acme` namespace, and the fixture indicates this is a shared channel carrying an informational readiness signal. **No error and no rename are asserted** — event channels are not namespace-exclusive, so co-publication is not per se a defect. The only open question is whether another publisher already emits `web-search/ready`, which is host/registry state and was **not checked**. Whether the plugin intends a shared channel or a plugin-private one cannot be determined from the fixture (unconfirmed); if a private event were intended, that would be an intent question for the author, not a defect in the manifest as written.

### 11. Settings namespace — `acme-greet` → needs registry context
Namespaced and consistent with the loader id. No defect found. Whether a settings namespace of that name is already claimed by another plugin is **not checked**.

### 12. Route — `/api/plugins/acme-greet/hi` (`kind: exact`) → needs registry context
The path is well formed, embeds the plugin's own namespace, and is declared as an **exact** match, which is the safe choice (no prefix shadowing). Two points remain open, and both require context this review does not have: (a) the fixture contains no route-reservation table, so whether the `/api/plugins/…` prefix is host-reserved, permitted for plugins, or expected to carry a different namespace form cannot be determined here — it is therefore **not** called an error; (b) the segment uses the dash form `acme-greet` rather than the coordinate form `acme/greet`; whether the target host expects the coordinate form in a URL segment is unconfirmed. Verify both before publishing.

---

## 3. Cross-surface consistency (checked, no error)

- The manifest is internally consistent: `plugin.name` = `greet` = `pluginNames[0]`; `plugin.packageName` = `dsh-greet` = `package.json#name`; the coordinate `acme/greet` agrees with the namespace `acme` used by the loader id, settings namespace, tool, command and skill provider.
- Namespace usage is coherent: one namespace (`acme`) across all surfaces, with the package name adding the conventional `dsh-` prefix.
- Style differences between surfaces (underscore for the tool, dash for the command) are consistent with per-surface conventions and are **not** treated as a defect.
- `schemaVersion: 1` and `policy: "dsh-plugin-naming/v1"` are self-declared. The authoritative schema for the target host version is not present in the fixture, so conformance beyond internal consistency is **unconfirmed** (not an error).
- `package.json` does not contain an explicit pointer to `dsh-plugin.naming.json`; whether the host discovers the naming manifest by filename convention or requires a pointer is **unconfirmed** from the fixture.

---

## 4. Registry status — NOT CHECKED (explicit)

No registry, package index, or host-side namespace catalogue was queried: the review was offline, and the brief forbids contacting external services.

Consequently, and for **every** identifier in this plugin — `greet` (plugin short name and skill name), `acme/greet` (coordinate), `dsh-greet` (package), `acme-greet` (loader id and settings namespace), `acme_greet_hi` (tool), `acme-greet-hi` (command), `acme-greet-filesystem` (skill provider), `search` (service), `web-search/ready` (event), and the route path — the availability state is:

> **UNKNOWN / NOT CHECKED.** This report asserts neither "reserved" nor "globally available" for any of them. The absence of a finding in §2 is **not** evidence that a name is free, and it must not be read as an availability clearance.

To close the open items, a registry lookup of the coordinate `acme/greet`, the package `dsh-greet`, and the host-side loader/tool/command/skill names is required before publishing.

---

## 5. Recommended actions (all advisory; none blocking)

1. **Before publishing:** query the registry for the coordinate, package name, and the namespaced host-side identifiers listed in §4. Until then, treat the naming as *compatible but unconfirmed for availability*.
2. **Rename (recommended, optional):** service `search` → a namespaced form; skill `greet` → `acme-greet`. Both are collision-avoidance recommendations, not errors, and the plugin remains publishable without them.
3. **Prefer the coordinate** `acme/greet` over the bare short name `greet` wherever a user-facing or registry-facing reference is written.
4. **Verify before publishing:** the `/api/plugins/…` route prefix and the dash-vs-coordinate form in the path segment (§12), plus the `private: true` publish flag (§3).
5. **Out of scope of this report:** capability review of the filesystem skill provider, and any runtime behaviour.

---

## 6. Method and limits

- Reviewed `fixture/package.json` and `fixture/dsh-plugin.naming.json` read-only; both are unchanged (SHA-256 verified against the fixture seal after the review).
- No build, installation, dependency install, reproduction environment, or migration was performed.
- No host introspection was used (no CLI version/help/dump, no runtime service inspection) — the authoritative naming grammar, route reservation table and registry data for the target version are therefore all **unconfirmed** here.
- Reference consulted: `fixture/README.md` (key points only): the official short name `greet` is valid with no compatibility error, where prefixes are only collision recommendations; the unprefixed service `search` is a warning, not an error; the event `web-search/ready` is a shared channel and informational; an unqueried registry is unknown.

*Verdict summary: 0 compatibility errors · 3 collision recommendations (advisory) · 9 needs-registry-context · 0 unknown.*


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.