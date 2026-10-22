# S5 · Naming Compatibility Judgment — Read-Only Review

**Target:** community plugin `acme/greet` (package `dsh-greet@0.1.0`)
**Inputs (read-only):** `fixture/package.json`, `fixture/dsh-plugin.naming.json`, `fixture/README.md`
**Verdict type:** naming compatibility + registry status, four-state judgment
**Registry queried:** **No.** No network access was used and none is required for this report.

---

## 0. Method, and the negative-capability statement up front

### 0.1 What I did

1. Read the three fixture files. Nothing else in the container was read.
2. Parsed `dsh-plugin.naming.json` as JSON (it parses cleanly) and cross-checked every declared name against the other declared names and against `package.json`.
3. Computed SHA-256 digests of the three fixture files **before** writing this report, to evidence that the fixture was opened read-only (see §6).
4. Performed **no** registry lookup, **no** host route-table lookup, **no** reserved-prefix lookup, and **no** policy-document lookup.

### 0.2 What I could NOT verify — stated plainly

The following are **unconfirmed**. Every conclusion below that depends on them is marked accordingly, and none of them is guessed at:

| Unverified input | Why it matters | Consequence for this report |
|---|---|---|
| The normative text of policy `dsh-plugin-naming/v1` | Defines which names are legal vs. merely discouraged | I can prove *internal consistency* and *collision risk*, but I cannot prove a rule violation |
| The plugin registry (DSH) | Whether any name is already taken by another plugin | Every "is this free?" question is answered **unknown**, never "available" |
| The npm registry | Whether `dsh-greet` (and any other package name) is already owned | Same: **unknown** |
| The host route table | Whether `/api/plugins/acme-greet/hi` collides with a host-registered route | Route verdict is **needs registry context** |
| The host's reserved-prefix / built-in name list | Whether `search`, `filesystem`, `greet`, `web-search` touch reserved space | Collision verdicts are **recommendations**, never "reserved" or "safe" |
| The full surface taxonomy the policy expects | Whether `names` omits a required surface | Coverage is reported as **unknown**, not as "complete" |

### 0.3 The rule I held myself to

> **No findings ≠ no problems.**
> Because no registry was queried, this report never asserts that any name is *reserved*, *taken*, *free*, or *globally available*. "I found no defect" appears in this document only in the form **"no defect provable from the available inputs."**

---

## 1. The four states, as applied here

| State | Applied when | Explicitly NOT |
|---|---|---|
| **compatibility error** | A rule violation I can demonstrate from the fixture plus a rule I can actually cite | not "this looks wrong", not "probably non-conforming" |
| **collision recommendation** | Structurally legal, but raises namespace-collision risk that a prefix would remove | not a defect; not evidence a collision exists |
| **needs registry context** | The answer depends on data I did not query | not a defect; not a pass |
| **unknown** | I cannot form a judgment at all from the available inputs | not "fine" |

A fifth label, **informational / no local defect**, is used for surfaces where nothing is wrong *given only the fixture*. It is strictly weaker than "safe to publish" and is labelled as such every time.

---

## 2. Surface-by-surface verdicts

Summary table (detail follows):

| # | Surface | Declared value | Verdict | One-line reason |
|---|---|---|---|---|
| 1 | plugin name | `greet` | **informational / no local defect** + weak collision recommendation | Valid short name; a bare English word is collision-prone, but that is a recommendation, not an error |
| 2 | plugin namespace | `acme` | **unknown** | `acme` is a placeholder-style vendor id; whether it is a registered namespace cannot be checked offline |
| 3 | plugin coordinate | `acme/greet` | **informational** | Well-formed `<namespace>/<name>`, consistent with #1 and #2 |
| 4 | package name | `dsh-greet` | **needs registry context** (highest-priority unknown) | Matches `package.json` exactly, but does **not** encode the namespace; whether that is legal is unverifiable |
| 5 | loader id | `acme-greet` | **informational** | Consistent `<namespace>-<name>`; agrees with settings namespace and route segment |
| 6 | **service name** | `search` | **collision recommendation** | Unprefixed generic word, in a plugin named *greet* — highest collision exposure in the file |
| 7 | tool name | `acme_greet_hi` | **informational** | Namespaced, snake_case, matches the command's hyphenated twin |
| 8 | command name | `acme-greet-hi` | **informational** | Namespaced, kebab-case, consistent with #7 |
| 9 | **skill name** | `greet` | **collision recommendation** | Same bare-word exposure as #1 |
| 10 | skill provider id | `acme-greet-filesystem` | **informational** + advisory | Fully qualified, but the tail token `filesystem` is generic and cross-domain for a *greet* plugin |
| 11 | **event name** | `web-search/ready` | **informational (shared channel)** + ownership **unknown** | Channel namespace `web-search` ≠ plugin namespace `acme`; publish-vs-subscribe direction is not declared |
| 12 | settings namespace | `acme-greet` | **informational** | Identical to the loader id — internally consistent |
| 13 | route | `exact /api/plugins/acme-greet/hi` | **needs registry context** | Path segment is correctly namespaced, but exact-route collision with a host route cannot be checked offline |
| 14 | manifest header | `schemaVersion: 1`, `policy: "dsh-plugin-naming/v1"` | **unknown** | Whether this is the current/only accepted policy id and schema version is unverifiable |
| 15 | surface coverage | 10 surfaces declared | **unknown** | Whether the policy requires further surfaces is unverifiable |

### 2.1 Plugin name — `greet`

- **Structure:** single lowercase ASCII segment, no reserved-looking punctuation, and the coordinate `acme/greet` decomposes cleanly as `<namespace>/<name>`. `pluginNames` repeats the same value. Nothing is malformed.
- **Verdict: informational / no local defect** — I cannot name a rule it breaks.
- **But not a clean bill of health:** `greet` is a bare English word and one of the most obvious names a community plugin author would pick. Unprefixed, it sits directly in the shared namespace where two unrelated plugins can choose the same string. That is a **collision recommendation** (always consume it as `acme/greet`, never as `greet`), not an error — a prefix requirement would make it an error, and I cannot confirm such a requirement exists.
- **Not claimed:** that `greet` is reserved, taken, or globally available.

### 2.2 Plugin namespace — `acme`

- **Verdict: unknown.** `acme` reads as a placeholder vendor identifier rather than an owned one. Whether the policy requires namespace registration, and whether `acme` holds one, is not answerable from the fixture. Flagged, not judged.

### 2.3 Package name — `dsh-greet` (the highest-priority unknown)

- **Provable:** `package.json` `"name": "dsh-greet"` and the manifest's `plugin.packageName` agree **exactly**. The two files are internally consistent.
- **Not provable:** the package name does **not** encode the namespace `acme`, while every other identifier in the manifest does (`acme-greet`, `acme-greet-hi`, `acme_greet_hi`, `acme-greet-filesystem`, `acme-greet` route segment). If the policy derives the package name from the coordinate (e.g. requiring a `dsh-acme-greet` or scoped form), this is a **compatibility error**. If it does not, it is merely a shorter-than-ideal npm name.
- **Verdict: needs registry context.** This is the single place where a hidden compatibility error is most likely to be hiding, and it is exactly the kind of thing I must not resolve by guessing. It should be checked against the policy text and the npm registry before publishing.

### 2.4 Loader id — `acme-greet`

- **Provable:** consistent `<namespace>-<name>` derivation; identical to `settingsNamespaces[0]`; identical to the path segment inside the declared route. Three-way agreement is the strongest internal evidence of correct namespacing in the whole file.
- **Verdict: informational.** Residual collision risk exists (another plugin could derive the same id) but is unquantifiable offline.

### 2.5 Service name — `search` ⚠ highest collision exposure

- **Structure:** a single, unprefixed, generic English word. No namespace, no vendor segment, no domain qualifier.
- **Cross-domain anomaly (provable):** the plugin is named *greet*, its tool is *hi*, its command is *hi* — yet the service it exposes is *search*. The declared identity and the declared service belong to different domains.
- **Verdict: collision recommendation.** The name is not malformed, and nothing in the fixture shows that unprefixed service names are forbidden — but this is the surface most likely to be stepped on by another community plugin, and the fix is trivial (`acme-greet-search`, or `acme_greet_search` following the underscore style already visible in `acme_greet_hi`).
- **Not claimed:** that `search` is reserved by a built-in, already claimed by another plugin, or free.

### 2.6 Tool name — `acme_greet_hi`

- **Provable:** namespaced, snake_case, and a clean hyphen/underscore twin of the command `acme-greet-hi`. The pairing is coherent.
- **Verdict: informational.**

### 2.7 Command name — `acme-greet-hi`

- **Provable:** namespaced, kebab-case, consistent with the tool name.
- **Verdict: informational.**

### 2.8 Skill name — `greet`

- **Provable:** same bare-word exposure as the plugin name in §2.1. Well-formed; unprefixed.
- **Verdict: collision recommendation** — recommend consuming it through the plugin coordinate rather than as a bare `greet`.
- **Not claimed:** anything about reserved skill names, or about skill-name syntax rules (unverified).

### 2.9 Skill provider id — `acme-greet-filesystem`

- **Provable:** fully qualified under `acme-greet-`, so it cannot *exactly* collide with a bare `filesystem` provider.
- **Advisory (provable, and the most surprising line in the file):** a plugin whose name, plugin name, skill, tool and command are all *greet* / *hi* declares a skill provider named **`filesystem`**. Either the plugin's declared identity under-describes what it does, or the provider is doing more than the name suggests. Nothing here is a rule violation; it is the line I would ask the author about first.
- **Verdict: informational** + advisory. Weak collision recommendation on the generic tail token `filesystem`.

### 2.10 Event name — `web-search/ready`

- **Provable:** the channel's namespace segment is `web-search`, which is **not** the plugin's namespace `acme`. If the policy required plugin-declared events to live under the plugin's own namespace, this would be a **compatibility error**. If cross-namespace shared channels are permitted, it is simply a consumer declaration.
- **Not provable, and material:** the manifest lists only the channel *name*. It does not declare whether this plugin **publishes** or **subscribes** to `web-search/ready`. Publishing onto a channel owned by another namespace and listening on one are very different compatibility questions, and the file does not say which is happening.
- **Verdict: informational (shared channel)** for the name itself; **unknown** for ownership/direction; **needs registry context** for whether the channel exists and who owns it.
- **Not claimed:** that the channel is reserved, hosted by a built-in, or free.

### 2.11 Settings namespace — `acme-greet`

- **Provable:** identical to the loader id, so settings land in the plugin's own bucket.
- **Verdict: informational.**

### 2.12 Route — `{ "kind": "exact", "path": "/api/plugins/acme-greet/hi" }`

- **Provable and good:** the path is namespaced beneath `/api/plugins/acme-greet/`, matching the loader id exactly. This is the correct shape for a plugin-owned route.
- **Provable and open:** (a) it is an **exact** route and the only route declared — whether the host requires a parent/base registration beneath `/api/plugins/acme-greet` is unknown; (b) the `/api/plugins/` prefix reads as host-owned (it is the host's own plugin namespace), and whether host policy permits a plugin to register beneath it is unverified; (c) whether the host itself registers an exact route at this path cannot be checked without the host route table.
- **Verdict: needs registry context.** The naming shape is right; the collision question is not answerable offline.
- **Also unknown:** the complete value set of `kind` — only `exact` appears, so I cannot confirm it is a legal enum member.

### 2.13 Manifest header and coverage

- `schemaVersion: 1` and `policy: "dsh-plugin-naming/v1"` are well-formed, but whether this policy id and schema version are current and accepted is **unknown**. A stale or unrecognised policy id would be a hard compatibility error, and I cannot rule it out.
- Ten surfaces are declared. Whether the policy expects additional surfaces (and their absence is therefore an omission) is **unknown**. The manifest is *self-consistent*, which is not the same as *complete*.

---

## 3. The strongest provable finding: cross-domain drift

The most useful conclusion I can support from the fixture alone is not about any single name — it is about the pattern across them.

The plugin's identity is consistently **greet**: namespace `acme`, name `greet`, coordinate `acme/greet`, skill `greet`, tool `acme_greet_hi`, command `acme-greet-hi`.

But two of its surfaces point somewhere else entirely:

- the **service** is `search`;
- the **event channel** is `web-search/ready`.

Two independent surfaces drifting into a *search / web-search* domain, inside a plugin that calls itself *greet*, is the clearest signal in the file. It is not a naming-format error, and it may be entirely intentional (a greeting plugin that reacts to search readiness). But it means the manifest's declared identity under-describes the plugin's actual reach, and it is the reason the unprefixed `search` service in §2.5 is worth more than a routine style nit: the service is not merely unprefixed, it is *off-brand for this plugin*.

**Actionable recommendation:** confirm with the author whether this is a search plugin that was named *greet*, or a greet plugin that genuinely consumes a search channel. The answer changes whether §2.5 and §2.10 are minor advisories or the main finding.

---

## 4. Negative capability — what this report refuses to say

For the avoidance of doubt, and because the brief asks for it explicitly:

- I do **not** say that `greet`, `search`, `acme-greet`, `acme_greet_hi`, `acme-greet-hi`, `acme-greet-filesystem`, `web-search/ready`, `acme-greet` (settings) or `/api/plugins/acme-greet/hi` is **reserved**.
- I do **not** say that any of them is **already taken**.
- I do **not** say that any of them is **globally available** or **safe to publish**.
- I do **not** claim the plugin is naming-compatible with the registry. I claim only that **no compatibility error is provable from the fixture alone**.
- Every verdict above that depends on the policy text, the DSH registry, the npm registry, or the host route table is marked **unknown** or **needs registry context**, and is not resolved by inference.
- The fixture's own `README.md` asserts that the plugin short name is valid, that an unprefixed service is a warning rather than an error, that `web-search/ready` is a shared channel, and that an unqueried registry is unknown. I read that file, but I could not verify any of those policy claims against the policy itself, so I have treated them as **fixture-internal assertions and inputs**, not as verified facts, and I have re-derived each conclusion from the manifest data independently.

---

## 5. Publish-gate summary

| Gate | Status |
|---|---|
| Any **proven** compatibility error? | **None provable from the available inputs.** This is not a clean bill of health — see §0.3. |
| Any **proven** registry collision? | **None.** No registry was queried, so none could be found. |
| Highest-priority unknown | Package name `dsh-greet` not encoding the namespace `acme` (§2.3) — verify against the policy text. |
| Highest-priority collision risk | Service `search` (§2.5) — unprefixed and cross-domain. |
| Highest-priority advisory | Cross-domain drift, *greet* identity vs. *search* / *web-search* surfaces (§3). |
| Must be checked online before publishing | DSH plugin registry (every name in §2); npm registry (`dsh-greet`); host route table (§2.12); policy id/schema currency (§2.13). |

**Bottom line:** the manifest is internally coherent and every declared name is well-formed, but *well-formed and internally consistent is not the same as compatible and available*. Three surfaces — the service name, the package-name derivation, and the route — plus the manifest's policy header can only be settled with a registry/policy lookup that this read-only review deliberately did not perform. Publish only after those four checks.

---

## 6. Non-modification evidence

SHA-256 of the fixture files, computed at review time. The fixture was opened read-only; no file under `fixture/` was created, written, moved, or deleted.

| File | Bytes | SHA-256 |
|---|---|---|
| `package.json` | 67 | `71cd34926a4686d2098c582b93f86305c772f1e7d0bee5be9f1ca64d26ec99bc` |
| `dsh-plugin.naming.json` | 573 | `2863bfaf22ab7c9ff69a03b06af2cc1808cec2054987fcf5c6d4c55df61cb6b0` |
| `README.md` | 641 | `f27373bc472e94e859b37407eaf5332fcda747a7f55110a4ea9d430644862645` |

All three files carry an mtime of `2026-09-03T10:21:09Z`, i.e. none was touched by this review.

### Out of scope, noted once

`package.json` sets `"private": true`, which blocks `npm publish`. The fixture README states this is repository test-material discipline and not part of this brief, so I have excluded it from every verdict above; it is recorded here only because your stated goal is to publish.

---

*Report produced read-only. No reproduction environment was built, no dependency was installed, and nothing outside `fixture/` (read) and `agent-output/S5-negative-naming/` (written) was touched.*
