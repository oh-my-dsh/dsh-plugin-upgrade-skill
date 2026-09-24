# S5 · Naming Four-State Judgment Report — plugin `acme/greet` (`dsh-greet`)

- **Date:** 2026-09-15
- **Mode:** Read-only static review. No file under `fixture/` was modified; no reproduction environment was built; no network or registry query was performed (closed-book brief).
- **Inputs inspected:**
  - `fixture/package.json`
  - `fixture/dsh-plugin.naming.json` (declares policy `dsh-plugin-naming/v1`, schemaVersion 1)
  - `fixture/README.md` (fixture notes)
- **Verdict scale (four states):** `compatibility error` · `collision recommendation` · `needs registry context` · `unknown`

## 0. Confidence limits on this judgment (read first)

1. **The policy text `dsh-plugin-naming/v1` is referenced by the manifest but is not present in the fixture.** I therefore cannot verify any surface against the policy's formal grammar. Every "no compatibility error" verdict below means "**no compatibility error observed**" based on internal consistency of the manifest and conventional naming structure — not a verified policy conformance claim.
2. **No online registry query was made.** Per the brief, I do **not** claim any name is "reserved", "free", or "globally available". All availability questions are reported as unknown / not checked.
3. No local registry snapshot, marketplace index, or built-in-plugin list exists in the fixture, so collisions with built-ins are also **unconfirmed** (neither confirmed nor excluded).

## 1. Summary verdict table

| # | Surface | Declared value | Verdict |
|---|---------|----------------|---------|
| 1 | Plugin short name (`pluginNames`) | `greet` | **Collision recommendation** (not a compatibility error) |
| 2 | Plugin coordinate / namespace | `acme/greet` | **Needs registry context** |
| 3 | Package name (`package.json` `name` = `packageName`) | `dsh-greet` | **Needs registry context** |
| 4 | Loader ID (`loaderIds`) | `acme-greet` | **No compatibility error observed**; global uniqueness unknown |
| 5 | Service (`services`) | `search` | **Collision recommendation** (warning, not an error) |
| 6 | Tool (`tools`) | `acme_greet_hi` | **No compatibility error observed** |
| 7 | Command (`commands`) | `acme-greet-hi` | **No compatibility error observed** |
| 8 | Skill (`skills`) | `greet` | **Collision recommendation** |
| 9 | Skill provider (`skillProviders`) | `acme-greet-filesystem` | **No compatibility error observed**; informational note |
| 10 | Event (`events`) | `web-search/ready` | **Collision recommendation** (shared channel, informational) |
| 11 | Settings namespace (`settingsNamespaces`) | `acme-greet` | **No compatibility error observed** |
| 12 | Route (`routes`) | `exact /api/plugins/acme-greet/hi` | **No compatibility error observed**; host route-prefix convention unconfirmed |

**Overall:** No compatibility error is observed on any surface. Several surfaces carry collision risk because they are generic and/or unprefixed. All registry-dependent questions (availability, reservedness, built-in overlap) are **unknown — not checked**, per the constraints of this offline review.

## 2. Per-surface reasoning

### 2.1 Plugin short name — `greet` → Collision recommendation
The short name is a common English verb and, on its own, is highly likely to be desired by other plugins. It is structurally valid (no fault observed), so this is **not** a compatibility error. The namespaced coordinate `acme/greet` scopes it, which mitigates but does not eliminate ambiguity wherever the bare short name `greet` is displayed or resolved. Recommendation: this is a prefix/distinctness recommendation only — a stronger, more distinctive short name would reduce ambiguity, but nothing observed requires a change for structural correctness.

### 2.2 Plugin coordinate / namespace — `acme/greet` → Needs registry context
The coordinate is internally consistent: `namespace: "acme"` + `name: "greet"` = `coordinate: "acme/greet"`, and `acme/greet` is echoed consistently by `loaderIds`, `settingsNamespaces`, the tool/command prefixes, and the route. Structurally sound. However, whether the namespace **`acme` is actually owned by/allocated to the publisher** in the target registry/marketplace cannot be determined offline. If `acme` is already claimed by another publisher, publishing would conflict — that is exactly a registry question, not something this review can decide.

### 2.3 Package name — `dsh-greet` → Needs registry context
`package.json` `"name": "dsh-greet"` matches `plugin.packageName: "dsh-greet"` exactly — the consistency check passes. Open questions that only registry data can answer:
- Is `dsh-greet` free in the target package registry? **Not checked.**
- Is the `dsh-` prefix reserved for first-party/platform packages? The prefix matches the platform's own file (`dsh-plugin.naming.json`) and policy id (`dsh-plugin-naming/v1`), which *suggests* it is a platform-scoped prefix, but whether community use is allowed or discouraged is **unconfirmed**. I do not assert it is reserved or free.
- `private: true` is present; per the fixture README this is the repository's test-material discipline, not part of the brief, so no verdict is issued on it.

### 2.4 Loader ID — `acme-greet` → No compatibility error observed
Follows the `namespace-name` pattern and matches the coordinate. Collision risk is low because of the namespace prefix, but its global uniqueness still depends on registry state — **unknown, not checked**.

### 2.5 Service — `search` → Collision recommendation (warning, not an error)
This is the weakest name in the manifest. Unlike the tool and command surfaces, the service name carries **no namespace prefix**. `search` is one of the most generic service names possible; any other plugin exposing a `search` service creates an ambiguity/collision risk at any lookup point where services from multiple plugins share a namespace. On the observed evidence this is a **warning-level collision recommendation, not a compatibility error** (no structural fault is observable, and the manifest itself declares it as valid-shaped data). Whether the platform already ships a built-in `search` service that this would overlap with is **unconfirmed** — if one exists, the severity of this recommendation increases. Recommendation: rename to a prefixed form such as `acme-greet-search` (exact target name is the publisher's choice).

### 2.6 Tool — `acme_greet_hi` → No compatibility error observed
Properly prefixed (`acme_greet_`), consistent with the plugin identity, follows the underscore variant conventionally used for tool names. Collision risk low. Policy-grammar conformance is unverified (policy text absent) but nothing observable is wrong.

### 2.7 Command — `acme-greet-hi` → No compatibility error observed
Properly prefixed, hyphen variant matching the command-surface convention implied by the rest of the manifest. Collision risk low.

### 2.8 Skill — `greet` → Collision recommendation
Like the service name, the skill name is **unprefixed and generic**. `greet` as a skill name is plausible for many plugins, so cross-plugin ambiguity is likely wherever skill names are resolved in a shared space. Not a compatibility error on observed evidence (structurally valid, and the fixture notes treat the analogous short name as valid). Registry/built-in overlap: **unknown, not checked.** Recommendation: consider a prefixed or more distinctive skill name (e.g., `acme-greet-greet` style is ugly; a distinct verb like `acme-greet-hello` or scoped resolution is the publisher's call).

### 2.9 Skill provider — `acme-greet-filesystem` → No compatibility error observed (informational)
Fully prefixed, so ambiguity risk is low. Informational note: the tail `filesystem` is a generic capability word; if the platform defines well-known provider capability tails, this one reuses that vocabulary — which is normal for providers, but whether it interacts with any built-in `filesystem` provider is **unconfirmed**.

### 2.10 Event — `web-search/ready` → Collision recommendation (shared channel, informational)
The event channel `web-search/ready` is not namespaced to this plugin at all — `web-search` is a generic topic and `ready` is a generic lifecycle phase. Treat this as a **shared channel**: any other plugin that emits on `web-search/ready` would produce cross-talk for this plugin's subscribers, and vice versa. This is informational/weak in severity — shared lifecycle topics are a legitimate pattern — but the publisher should confirm the intended audience of the channel. If the event is meant only for this plugin's consumers, a namespaced topic (e.g., `acme-greet/ready`) is safer. Whether a first-party `web-search` subsystem exists that owns this channel is **unconfirmed**; if one does, this surface moves from informational toward a real collision.

### 2.11 Settings namespace — `acme-greet` → No compatibility error observed
Consistent with the loader ID and coordinate; properly namespaced; low risk.

### 2.12 Route — `exact /api/plugins/acme-greet/hi` → No compatibility error observed
The path is namespaced under the conventional `/api/plugins/<loader-id>/…` shape and the `kind: "exact"` declaration is explicit. Two caveats: (a) whether `/api/plugins/` is the correct host-wide route prefix for this platform version is **unconfirmed** (no host route table in the fixture); (b) the route embeds `acme-greet`, so it inherits whatever namespace-ownership question applies to the loader ID. No structural fault observed.

## 3. Cross-field consistency checks performed (all passed)

- `plugin.namespace` + `plugin.name` ⇒ `plugin.coordinate`: `acme` + `greet` = `acme/greet` — consistent.
- `plugin.packageName` (`dsh-greet`) = `package.json.name` (`dsh-greet`) — consistent.
- `loaderIds` / `settingsNamespaces` (`acme-greet`) = coordinate joined with `-` — consistent.
- Tool `acme_greet_hi`, command `acme-greet-hi`, route `/api/plugins/acme-greet/hi` — all derive from the same identity — consistent.
- No duplicate or contradictory entries across arrays.
- The two deliberately unprefixed surfaces (service `search`, skill `greet`) and the unnamespaced event topic (`web-search/ready`) are the outliers — see §2.5, §2.8, §2.10.

## 4. Explicit unknowns — not checked, not claimed

I make **no claim** about any of the following, and none of the verdicts above should be read as resolving them:

1. Whether `dsh-greet` is available or taken in the package registry.
2. Whether the plugin coordinate `acme/greet` / namespace `acme` is free or already owned by another publisher.
3. Whether any of `greet`, `search`, `acme-greet*`, or `web-search/ready` collides with a **built-in** platform plugin, service, event channel, or route.
4. Whether the `dsh-` package-name prefix is reserved for first-party packages.
5. Whether the names conform to the formal grammar of `dsh-plugin-naming/v1` — the policy text itself was not present in the fixture, so all structural verdicts are "no error **observed**", not "certified conformant".
6. Whether `/api/plugins/...` is the correct route prefix for the target host version.

## 5. Pre-publish recommendations (in priority order)

1. **Resolve the registry questions first** (§4 items 1–4) with an actual registry/marketplace query — every availability judgment is blocked on this, and the "no compatibility error observed" result must not be mistaken for a clearance to publish.
2. **Rename or namespace the service `search`** (e.g., `acme-greet-search`) — highest-value change; it is the only surface that is both generic and unprefixed in a shared lookup space (warning-level).
3. **Decide deliberately on the event topic `web-search/ready`** — keep only if subscribing to a genuinely shared channel is intended; otherwise namespace it.
4. **Consider a more distinctive skill name** than the bare `greet` (lower priority than 2; same class of risk).
5. **Confirm the `dsh-` package prefix** is permitted for community packages before adopting `dsh-greet` as the published package name.

## 6. Constraint compliance

- `fixture/` was opened read-only; no file under it was modified, and no reproduction environment was built or dependencies installed.
- No network access, no registry queries, no writes outside the designated `agent-output/S5-negative-naming/` directory.
- No "reserved" or "globally available" claim is made anywhere in this report; all such matters are marked unknown / not checked.
