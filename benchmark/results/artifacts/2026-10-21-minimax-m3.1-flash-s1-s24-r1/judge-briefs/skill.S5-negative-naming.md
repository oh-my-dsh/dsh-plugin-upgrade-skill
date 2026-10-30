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

# S5 · Naming Compatibility & Registry Judgment — `acme/greet` (read-only)

**Subject**: community plugin naming declaration in `/app/fixture/` (mapped to `fixture/` in this cell)
**Files reviewed (read-only, once each)**: `fixture/package.json`, `fixture/dsh-plugin.naming.json`, `fixture/README.md`
**Mode**: Mode A · inspect (read-only review). No writes, installs, builds, or reproductions were performed. The fixture was not modified.
**Verdict vocabulary**: `compatibility error` / `collision recommendation` / `needs registry context` / `unknown`

---

## 0. What the fixture actually declares

`dsh-plugin.naming.json` (`schemaVersion: 1`, `policy: "dsh-plugin-naming/v1"`):

| Field | Value |
|---|---|
| `plugin.namespace` | `acme` |
| `plugin.name` | `greet` |
| `plugin.coordinate` | `acme/greet` |
| `plugin.packageName` | `dsh-greet` |
| `names.pluginNames` | `["greet"]` |
| `names.loaderIds` | `["acme-greet"]` |
| `names.services` | `["search"]` |
| `names.tools` | `["acme_greet_hi"]` |
| `names.commands` | `["acme-greet-hi"]` |
| `names.skills` | `["greet"]` |
| `names.skillProviders` | `["acme-greet-filesystem"]` |
| `names.events` | `["web-search/ready"]` |
| `names.settingsNamespaces` | `["acme-greet"]` |
| `names.routes` | `[{ kind: "exact", path: "/api/plugins/acme-greet/hi" }]` |

`package.json`: `{ "name": "dsh-greet", "version": "0.1.0", "private": true }`

Two structural facts drive several verdicts below:

1. **The declaration is a manifest, not an implementation.** There is no `src/`, no `dsh-plugin.json`, no `cordis.patch.yml`, no lockfile, and no `dsh.client.inject` / `peerDependencies` in the fixture. A naming declaration cannot be cross-checked against the code that actually registers these names, so every surface below is judged on the declared string itself.
2. **`private: true` is present in `package.json`.** `fixture/README.md` states this is the repository's "test material, do not publish" discipline and is *not* part of the brief. As published under a first-party workspace policy, `private: true` and a public manifest are mutually exclusive (DSH-0.1.6-A1-35: "a manifest with `private: true` under a public policy and a public manifest without the access field are both rejected"). Whether that rule binds a third-party community package is **not** determinable from the fixture — flagged as a publish-precondition question, not a naming defect.

---

## 1. Per-surface four-state judgment

| # | Surface | Declared value | Verdict | Reasoning |
|---|---|---|---|---|
| 1 | Official plugin short name | `greet` | **collision recommendation** | `greet` is a single generic English word with no namespace qualifier, and it is the *only* unprefixed name in a manifest that prefixes everything else. It is grammatically valid and the fixture README explicitly records it as "valid (no compatibility error)". The risk is namespace squatting/ambiguity in a shared plugin registry, not a load failure. Recommendation (not an error): publish under the qualified coordinate `acme/greet` and register the short name as an alias, or choose a more distinctive short name. |
| 2 | Plugin coordinate | `acme/greet` | **unknown** | The coordinate is internally consistent with `namespace` + `name`, but whether `acme` is an available, uncontested, or reserved namespace in the community registry cannot be determined without an online registry query. Not checked here (see §3). |
| 3 | Loader id | `acme-greet` | **collision recommendation** | Qualified and distinctive, so it is a good shape. It carries the same unverified namespace assumption as the coordinate: the collision exposure of `acme-greet` is entirely a function of whether `acme-` is claimed by someone else. Not an error; the recommendation is to confirm the `acme` namespace is the publisher's own before shipping. |
| 4 | Service name | `search` | **collision recommendation** | `search` is an unprefixed, generic service identifier. On the Cordis/DSH service plane an unqualified service key is a *global* name in the host fiber graph: a second plugin registering `search` is a genuine collision, not a namespace-safe coexistence. This is exactly the failure mode the fixture README calls out ("the unprefixed service `search` is a warning not an error"). The published seam for a community plugin should be a provider-qualified key. |
| 5 | Tool name | `acme_greet_hi` | **collision recommendation** | Qualified with an underscore, so it is low-risk against other namespaces. Two open points, both below the error bar: (a) the fixture does not state the target DSH cohort, so the accepted tool-name separator set cannot be confirmed from the fixture — treat the underscore form as *unconfirmed* against the target tag's tool-name grammar rather than asserting it is wrong; (b) tool/Definition ids must be unique per logical node and collisions are no longer reported (DSH-0.1.7-RC1-03), so an unqualified name would be a silent hazard — this one is already qualified, so only the separator spelling remains open. |
| 6 | Command name | `acme-greet-hi` | **collision recommendation** | Qualified and hyphenated; consistent with the loader id and settings namespace. Low risk. Note the command token convention (DSH-0.1.6-A1-23: `CommandClaim.name` is the catalog name *without* the leading slash) — the declared string carries no leading slash, which is consistent. No error indicated. |
| 7 | Skill name | `greet` | **collision recommendation** | Same generic-word exposure as the plugin short name, and skills are surfaced to the agent/model, where a one-word skill name is ambiguous in the catalog. Recommendation: qualify (e.g. `acme-greet`) or accept the ambiguity deliberately. Not an error. |
| 8 | Skill provider | `acme-greet-filesystem` | **collision recommendation** | Qualified with a role suffix; good shape and self-describing. The only open question is the `acme` namespace ownership (same as #2/#3). |
| 9 | Event name | `web-search/ready` | **needs registry context** | This is a *shared channel* in a domain this plugin does not own (`web-search`), with a `/ready` sub-channel. The fixture README records it as informational. It is not the plugin's own namespace, so it is a **contract on somebody else's channel** — whether the host or another plugin owns and may legitimately emit `web-search/ready` cannot be checked from the fixture (no host source, no registry). It is also not a string this plugin may freely claim. Judged "needs registry context", not an error: if the intent is to *consume* the event, it is fine; if the intent is to *emit* it, the plugin is publishing into another namespace and should be treated as a coordination decision. |
| 10 | Settings namespace | `acme-greet` | **collision recommendation** | The declared value satisfies the documented settings-namespace grammar (lowercase first letter, then only `[a-z0-9-]` — api-migration-0.1.2-alpha.2 API-10 "Best practice"; DSH-0.1.2-A2-10 moved the check to compile time). So this is **not** a compatibility error. The remaining exposure is namespace ownership, i.e. whether `acme-greet` is already taken by another plugin's settings namespace. Note the version boundary: `ctx.settings.register` was removed in 0.1.7 (DSH-0.1.7-J1-04) and settings moved into the current profile's plugin Config; the fixture does not name a target cohort, so *how* this namespace is registered at the target version is unconfirmed. |
| 11 | Route | `/api/plugins/acme-greet/hi` (exact) | **collision recommendation** + **needs registry context** | Naming shape: qualified by `acme-greet` and namespaced under `/api/plugins/`, so it does not squat on a first-party API path. Two things are unverified rather than wrong: (a) the reserved/owned path space of the host's `/api/*` tree is not knowable from the fixture, so the route is claimed to be *exclusive to this plugin's prefix*, not proven free; (b) a raw `webServer` route does not automatically inherit Connection authentication — it must call `ctx.connection.requestRejection(req)`, or use `ctx.connection.fetch.register` / `ctx.connection.rpc.handle` (DSH-0.1.2-A1-08; precision-checklist "Channel auth joins the host gate"). The fixture contains no source, so the auth posture of this route is **unknown** — that is a runtime-auth question, not a name judgment, and is recorded as residual risk. |
| 12 | npm package name | `dsh-greet` | **needs registry context** | `dsh-greet` is an **unscoped** npm name in the `dsh-` prefix space that is already densely occupied by the first-party `@deepseek-ai/dsh-*` line. Whether `dsh-greet` is free, reserved, or already taken on the public registry **was not queried** (no network access in this run). It is therefore *not* claimed to be available. Recommendation: use a scoped name (e.g. `@<org>/dsh-acme-greet`) so the coordinate `acme/greet` and the registry identity cannot be split by a squatter. |
| 13 | Plugin → package-name consistency | `dsh-greet` vs `acme/greet` | **collision recommendation** | The bare package name `dsh-greet` drops the `acme` namespace that every other surface carries. The npm identity and the plugin coordinate therefore describe *different* scopes. This is consistent, not contradictory (the package is the delivery vehicle, the coordinate is the identity), but it is the one place where the manifest's own prefixing discipline is not applied. Recommendation: derive the package name from the coordinate, or state the mapping in the manifest. |
| 14 | Client registration id (implied) | — | **unknown** | If a client half is added later, the registration id (the `__ModuleLoader__.load` id / tsdown banner `PLUGIN_ID`) must equal the `package.json` `name` (DSH-0.1.2-A1-26; troubleshooting row: startup assertion `loaded without registering "<id>"`). The fixture declares `packageName: "dsh-greet"` but no registration id, and the short name `greet` is a *different* string. Whether the client registers under `greet` or `dsh-greet` is not stated — recorded as unknown so it is not silently assumed correct. |

### Surface verdict tally
- **compatibility error**: 0
- **collision recommendation**: 10 rows (plugin short name, loader id, service `search`, tool, command, skill, skill provider, settings namespace, route, package/coordinate consistency — the route also carries a registry-context need)
- **needs registry context**: 4 (coordinate, event, route path space, npm package name)
- **unknown**: 2 (client registration id; route authentication posture)

---

## 2. Cross-surface consistency checks

| Check | Result | Note |
|---|---|---|
| `plugin.coordinate` = `namespace` + `/` + `name` | **consistent** | `acme` + `greet` → `acme/greet` ✔ |
| `plugin.packageName` = `package.json` `name` | **consistent** | both `dsh-greet` ✔ |
| `plugin.packageName` = `dsh-` + `plugin.name` | **consistent** | `dsh-greet` ✔ (but drops `acme`, see row 13) |
| `loaderIds` / `settingsNamespaces` / route segment all equal `acme-greet` | **consistent** | one qualifier reused across loader id, settings namespace, and URL segment ✔ |
| `tools` (`acme_greet_hi`) and `commands` (`acme-greet-hi`) use different separators for the same qualifier | **inconsistent in style, not in scope** | underscore vs hyphen for the same `acme-greet` token. Harmless if each surface has its own grammar (tool ids commonly use `_`, command/namespace ids use `-`), but the manifest does not say which grammar governs which surface, so the *intentional* separator split is unconfirmed. |
| `pluginNames` / `skills` both `greet` | **consistent but weakly qualified** | the same unprefixed string is reused for two user/agent-visible surfaces, amplifying surface #1's collision exposure. |
| `services` vs everything else | **inconsistent qualification** | `search` is the only service key with no `acme-` qualifier, while loader id, tool, command, skill provider, and settings namespace all carry it. This is the strongest single signal in the manifest. |

---

## 3. Registry status — explicitly **not checked**

**No online registry query was performed in this run.** Therefore, and per the brief's "no findings ≠ no problems" rule, this report makes **none** of the following claims, and none of them should be inferred from the absence of a finding:

- `acme/greet` is **not** claimed to be reserved, registered, or globally available.
- `acme-greet` (loader id / settings namespace) is **not** claimed to be free of an existing holder.
- `search` as a service key is **not** claimed to be unclaimed by any installed or published plugin — the *recommendation* to qualify it is a namespace-hygiene argument, not a claim of a specific existing owner.
- `web-search/ready` is **not** claimed to be free, reserved, or host-owned; its ownership is unknown without the host source or a registry.
- `dsh-greet` on npm is **not** claimed to be available or taken.
- The tool-name separator (`_`) and the client registration id are **not** claimed to be correct against any target tag.

### What it would take to close each one (not performed here)

| Open item | Evidence needed | Note |
|---|---|---|
| Coordinate / namespace / loader id / settings namespace availability | Registry lookup of `acme/greet`, `acme-greet`, `acme-greet-filesystem` | one lookup closes rows 2, 3, 8, 10 |
| npm package name availability | `npm view dsh-greet` (and the scoped alternative) | unscoped `dsh-*` space is crowded by first-party `@deepseek-ai/dsh-*`; consider scoping |
| `web-search/ready` ownership | Host source / event catalog at the target tag | determines consume-vs-emit reading of row 9 |
| Service key `search` | Installed-plugin service inventory in a real profile | would turn row 4 from "recommendation" into a confirmed collision, or clear it |
| Tool name grammar | Target tag's tool-name / Definition-id rules | the fixture names no target cohort |
| Route auth posture | Plugin source (`ctx.webServer.register` vs `ctx.connection.fetch` / `rpc`) | DSH-0.1.2-A1-08 — lint can flag raw WebServer routes but cannot prove a rejection guard covers a route |
| `private: true` vs publication | The publisher's own publication policy for community packages | first-party workspace rule pairs `private: true` with the opposite of `publishConfig.access: "public"`; not demonstrably binding on a community package |

---

## 4. Verification actually performed (read-only)

| Action | Result |
|---|---|
| `node skills/plugin-upgrade/scripts/inject-lint.mjs fixture` (bundled, read-only) | `verdict: "FIX-REQUIRED"` — but the only trigger is `cordisPeer: null` (no `@deepseek-ai/cordis` peer declared) / `cordisOk: false`. `runtimeRefsLeft: []`, `declaredInject: []`, `peersMissingForInject: []`, `peersMissingForImports: []`, `rawWebServerRouteFiles: []`, `routeReviewRequired: false`. **Interpretation**: the fixture is a naming declaration with no source and no peer declarations, so the lint's peer findings are *absence-of-declaration*, not evidence of a broken dependency set. The "no raw WebServer routes" result reflects that there is no source — it is **not** evidence that the declared route is authenticated. Do not read `FIX-REQUIRED` as a naming defect. |
| Fixture SHA-256 re-hash after review | `package.json` `71cd3492…`, `dsh-plugin.naming.json` `2863bfaf…`, `README.md` `f27373bc…` — all three match `fixture-seal.pre.json` / `fixture-seal.source.json`. **Fixture unchanged.** |
| Host/runtime introspection | **Not performed.** No `dsh --version`, `--dump-config`, `dsh plugin --help`, or `cordis_inspect_*` calls. The installed host is a different version from the one this task targets, so its answers would be out of scope. |
| Build / reproduction environment | **Not created.** No install, no build, no profile mount, no reproduction of any kind. |

---

## 5. Cards and references cited (key points only)

- **DSH-0.1.2-A1-08** (alpha.1) — a raw `webServer.register`/`registerUpgrade` route does not automatically inherit Connection authentication; it must call `ctx.connection.requestRejection(req)` before protected data or side effects, or move to `ctx.connection.fetch.register` / `ctx.connection.rpc.handle`. → applies to row 11's unknown auth posture.
- **DSH-0.1.2-A1-26** (alpha.1) — the client bundle's registration id (`__ModuleLoader__.load` id / tsdown banner `PLUGIN_ID`) must equal the `package.json` `name`. → applies to row 14.
- **DSH-0.1.2-A2-10** (alpha.2) — settings-namespace validity moved to compile time; grammar is lowercase first letter followed by `[a-z0-9-]`; pass a literal, do not bypass with `as`. → `acme-greet` conforms; row 10.
- **API-10** (api-migration-0.1.2-alpha.2) — same namespace grammar restated as best practice; namespaces start with a lowercase letter and contain only lowercase letters, digits and `-`. → row 10.
- **DSH-0.1.7-J1-04** (jump-0.1.5-rc.2→0.1.7-rc.1) — `ctx.settings.register` is gone; settings live in the current profile's plugin Config. → the *mechanism* for row 10 depends on the target cohort, which the fixture does not name.
- **DSH-0.1.7-RC1-03** (v0.1.7-rc.1) — Conversation Definition ids must be unique per logical node; collisions are no longer reported. → raises the stakes on the tool-id row 5.
- **DSH-0.1.6-A1-23** (v0.1.6-alpha.1) — `CommandClaim.name` is the catalog command name *without* the leading slash. → the declared `acme-greet-hi` is shaped consistently; row 6.
- **DSH-0.1.6-A1-35** (v0.1.6-alpha.1) — first-party publication policy: omit `private` and set `publishConfig.access: "public"` together; `private: true` under a public policy is rejected. → the `private: true` precondition, flagged as not proven binding on a community package.
- **troubleshooting.md rows citing DSH-0.1.2-A1-25 / A1-26** — a plugin absent from the boot graph or asserting `loaded without registering "<id>"` when the registration id / assembly row name does not match the package name; and a duplicate loader entry id is fatal at boot. → general collision guidance behind rows 3 and 14.

---

## 6. Bottom line

**No compatibility error is demonstrable from the fixture.** Every declared string is internally consistent and, where a grammar is documented (settings namespace), it conforms. The real risk profile is:

1. **Qualification discipline is uneven** — the service key `search`, the plugin short name `greet`, and the skill name `greet` are the only unqualified surfaces, and the service key is the one that can genuinely collide in a shared fiber graph. These are **recommendations**, not errors.
2. **Registry status is entirely unverified.** `acme/greet`, `acme-greet`, `acme-greet-filesystem`, `dsh-greet`, and the `web-search/ready` channel have **not** been checked. Nothing in this report should be read as "reserved" or "globally available".
3. **Two things are genuinely unknown, not merely unchecked**: the client registration id (must equal the package name) and the route's authentication posture (raw `webServer` routes need an explicit Connection rejection guard). Both need the plugin source, which the fixture does not contain.

Recommended next actions, in order: (1) run the registry lookups in §3 to close the availability questions; (2) qualify the service key and decide deliberately whether `greet` stays unprefixed on the plugin/skill surfaces; (3) confirm the client registration id equals `dsh-greet` and that the `/api/plugins/acme-greet/hi` route is behind the Connection auth gate; (4) settle the `private: true` / `publishConfig.access` pairing against the community publication policy before the first publish.

---

*Prepared under the plugin-upgrade skill's Mode A (inspect) discipline: read-only, no writes outside this report, fixture byte-identical (hashes re-verified). No registry query, no host introspection, no reproduction environment.*


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.