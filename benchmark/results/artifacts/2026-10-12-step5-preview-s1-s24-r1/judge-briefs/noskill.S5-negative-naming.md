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

# S5 · Plugin Naming Judgment Report (read-only review)

**Target:** `fixture/package.json`, `fixture/dsh-plugin.naming.json`
**Declared policy:** `dsh-plugin-naming/v1`, `schemaVersion: 1`
**Mode:** read-only review. Nothing under `fixture/` was created, modified, or deleted. No reproduction environment, registry query, or dependency install was performed.
**Decider:** see "Verdict taxonomy" below.

---

## 1. Verdict taxonomy

| Verdict | Meaning used in this report |
|---|---|
| **compatibility error** | A local, file-internal contradiction with the declared `dsh-plugin-naming/v1` **compatibility** rules (unusable as-written, or self-inconsistent). |
| **collision recommendation** | Locally compatible, but the identifier's namespace hygiene is weak, so a collision advisory is warranted. **Not** an error and **not** a claim that a collision exists. |
| **needs registry context** | Cannot be decided without an authoritative registry lookup. Reported as not-checked. |
| **unknown** | Insufficient information in the fixture, even in principle; requires author intent. |

**Negative-capability statement (read this first):** no online registry was queried, and no skill/docs were read. Therefore **every "free / available / reserved" claim is retracted**. Where the fixture gives no rule text, this report does not assert the rule. `policy` and `schemaVersion` are declared strings with no accompanying rule table in the fixture; they are treated as opaque version markers, and their validity is **unconfirmed** (see §4).

---

## 2. Surfaces

### 2.1 Plugin name `greet` (manifest) + package name `dsh-greet` (`package.json`)

**Verdict: compatibility error** (one line) — manifest `plugin.name: "greet"`, coordinate `acme/greet`, versus package name `dsh-greet`.

Reasoning: within the fixture's own declarations, the two identifiers do not agree. The manifest declares `plugin.name` = `greet` and `coordinate` = `acme/greet`, but `packageName` is `dsh-greet` and `package.json:name` is also `dsh-greet`. A community-registry submission keyed on a *namespace-qualified* plugin name cannot be resolved against a *bare* `dsh-greet`. The short name `greet` itself is a **valid** short name — short names are a legitimate namespace component rather than a compatibility defect, so this is **not** an "unprefixed short name" error.

Prefix policy: the `dsh-` prefix appears on a package whose plugin coordinate is `acme/greet`. Whether `dsh-` is reserved for first-party/organizational packages is a **registry question** and is not asserted here (see §4). What *is* assertable locally: `dsh-greet` bears no trace of the declared `acme` namespace, so the package name does not encode the coordinate it claims. Recommend a namespace-bearing package name (e.g. `dsh-acme-greet` or `@acme/greet`) — a **collision recommendation**, not an error, since no reserved-prefix list was available to confirm enforcement.

The two fields `plugin.namespace: "acme"` and `plugin.name: "greet"` are internally coherent (`acme/greet`), so the inconsistency is specifically manifest-vs-`package.json`.

### 2.2 Service name `search` (unprefixed)

**Verdict: collision recommendation.**

Reasoning: `services: ["search"]` is an unprefixed, generic word. Prefixed form `search` lacks the `acme` namespace and lacks a verb-qualified intent, so it is a strong third-party collision candidate. The fixture does not declare a rule requiring services to be namespaced, and unprefixed identifiers are not a syntax problem, so this is **not** a compatibility error. Note the same `acme` prefixing discipline is applied to `skills` — the strategy is inconsistent across surfaces, which is advisory, not breaking.

### 2.3 Event name `web-search/ready`

**Verdict: informational.**

Reasoning: `events: ["web-search/ready"]` is a `/`-qualified channel under the `web-search` namespace. It does not belong to this plugin's own `acme` namespace, so it should be read as *subscribing to a shared channel owned by another package*, not as claiming one. Channel names with a `/` segment are structurally well-formed. There is no local contradiction with `acme/greet`, so nothing to fix. Registry overlap with whatever actually owns `web-search` was not checked.

### 2.4 Skill name `greet`

**Verdict: compatibility error.**

Reasoning: `skills: ["greet"]` equals `plugin.name` and carries no namespace qualifier, while every other skills-related surface in the manifest *is* qualified: `skillProviders: ["acme-greet-filesystem"]`, `loaderIds: ["acme-greet"]`, `settingsNamespaces: ["acme-greet"]`, `commands: ["acme-greet-hi"]`. So within the file the skills surface is the outlier. A skill name resolving into the global/unprefixed skill namespace that collides with the plugin's own short name is a namespace-ownership ambiguity: callers cannot distinguish "this plugin's skill `greet`" from "any other package's skill `greet`". Recommend a qualified name (e.g. `acme/greet` or `acme-greet`).

Two related oddities, both **collision recommendations** and not errors:
- `skillProviders: ["acme-greet-filesystem"]` — the id embeds `filesystem`, but the plugin declares only a greeting surface (`acme_greet_hi`, `acme-greet-hi`, `/hi`). The provider name advertises a capability family the manifest never declares. Either a stale copy-paste name or an undeclared capability; the latter would be a real mislabel. Author intent required.
- `skills: ["greet"]` and `pluginNames: ["greet"]` are identical strings used in two different namespaces. Overloading one token across the plugin-name and skill-name surfaces is the mechanism by which ambiguity is created.

### 2.5 Route `/api/plugins/acme-greet/hi`

**Verdict: unknown.**

Reasoning: `routes: [{ "kind": "exact", "path": "/api/plugins/acme-greet/hi" }]`. The path is structurally consistent with the namespace (`acme-greet` loader id matches `loaderIds`) and is an exact, self-contained route with no wildcards or parameter capture. However, the fixture declares **no** routing rules — no allowable path prefix, no requirement that routes be nested under a plugin namespace, no reserved path prefixes, and no rule about `/api/plugins/<ns>/...` being derived from the plugin coordinate. The path also does not mirror the manifest's own coordinate form (`acme/greet` uses a `/`; the route uses the hyphenated loader id `acme-greet`). Whether any of this is a violation cannot be decided from the fixture; a routing-policy reference is needed. Not a compatibility error on the evidence available, and not assumed to be safe either.

### 2.6 Other surfaces

| Surface | Value | Verdict | Reasoning |
|---|---|---|---|
| `tools` | `acme_greet_hi` | collision recommendation | Correctly namespace-qualified (snake_case with `acme_greet_` prefix). No local contradiction. Weak prefix hygiene relative to `acme`/`greet`, so advisory only. Unlike `skills`, this surface is *not* overloaded across namespaces. |
| `commands` | `acme-greet-hi` | collision recommendation | Correctly namespace-qualified and consistent with `loaderIds`/`settingsNamespaces`. Advisory only. |
| `settingsNamespaces` | `acme-greet` | collision recommendation | Namespace-qualified; internally consistent with `loaderIds`. Advisory only. |
| `loaderIds` | `acme-greet` | collision recommendation | Namespace-qualified; consistent with the route and settings namespace. Advisory only. |
| `plugin.coordinate` | `acme/greet` | collision recommendation | Qualified coordinate; coherent with `namespace` + `name`. Conflicts with `packageName` (see §2.1). |
| `plugin.namespace` | `acme` | needs registry context | Whether `acme` is available/claimable is a registry question. Not queried. |
| `policy` / `schemaVersion` | `dsh-plugin-naming/v1` / `1` | unknown | No rule table supplied with the fixture; cannot be validated against any known revision. Treated as opaque markers throughout. |

---

## 3. Cross-surface summary

```text
compatibility error  greet (skill name, §2.4), plugin name/package name mismatch (§2.1)
collision rec.       search (service), all four "advisory only" surfaces (§2.6)
informational        web-search/ready (event, §2.3)
unknown              /api/plugins/acme-greet/hi (route, §2.5), policy/schemaVersion (§2.6)
needs registry ctx.  acme namespace availability, reserved-prefix questions (§4)
```

**Bottom line:** the manifest is *internally* coherent for the qualified surfaces (`tools`, `commands`, `settingsNamespaces`, `loaderIds`, `plugin.coordinate`) and for the service/event surfaces under a non-breaking reading. The defensible defects are (a) the manifest-declared plugin name/coordinate disagreeing with the `package.json` package name, and (b) the unqualified, coordinate-duplicating skill name `greet`. Both are fixable before publication without a registry query.

## 4. Not-checked / unconfirmed (negative capability)

1. **No registry query was performed.** So:
   - `dsh-greet` — **not checked** for existence or reservation. No claim is made.
   - `acme` namespace — **not checked**. No claim that it is available or taken.
   - `greet` as a plugin name / skill name — **not checked**.
   - `web-search` channel ownership — **not checked**.
2. **No `dsh-` reserved-prefix list was available.** This report does not claim `dsh-` is reserved, nor that it is not. §2.1's package-name finding rests solely on the internal manifest/`package.json` mismatch, not on prefix reservation.
3. **No naming rule book for `dsh-plugin-naming/v1` was mounted.** The strictness of `search`, `greet`, and the route cannot be graded against the authoritative spec; §2.2/§2.4/§2.5 verdicts are grounded in *intra-file* consistency, which is the only evidence present.
4. **`skillProviders` semantics are unknown.** The `-filesystem` suffix may be a copy-paste artifact or may signal an undeclared capability. Author intent required.
5. **No build, no reproduction environment, no dependency install, no migration was performed**, per the brief.
6. Nothing under `fixture/` was modified; this report is the only file created, at `agent-output/S5-negative-naming/`.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.