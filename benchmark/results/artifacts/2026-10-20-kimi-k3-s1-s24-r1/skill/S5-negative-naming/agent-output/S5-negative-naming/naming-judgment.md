# S5 · Naming Four-State Judgment — Read-Only Report

**Subject**: community plugin naming declaration in `fixture/` (`package.json` + `dsh-plugin.naming.json`)
**Mode**: read-only inspection (Mode A). No file under `fixture/` was modified; no reproduction environment built; no registry, network, or system-directory query performed.
**Method note (four-state discipline)**: each surface gets exactly one verdict — *compatibility error / collision recommendation / needs registry context / unknown*. Absence of findings is **not** evidence of availability: nothing below is claimed "reserved" or "globally available", because no online registry query was (or may be) run in this review.

## 0. Declared identity (as read)

| Coordinate | Value |
|---|---|
| npm package name (`package.json`) | `dsh-greet` @ 0.1.0, `private: true` |
| Plugin namespace / name | `acme` / `greet` |
| Plugin coordinate | `acme/greet` |
| Declared packageName in naming manifest | `dsh-greet` (consistent with `package.json`) |
| Policy | `dsh-plugin-naming/v1`, schemaVersion 1 |

Per the plugin-upgrade skill's identity rule, the plugin coordinate (`acme/greet`) and the registry package name (`dsh-greet`) are **independent coordinates**; the manifest pairing them is internally consistent, and no rewrite is implied either way. `private: true` blocks npm publish as-is (fixture README calls this test-material discipline, not part of the brief — recorded as an observation only).

## 1. Per-surface verdicts

| # | Surface | Value | Verdict | Reasoning |
|---|---|---|---|---|
| 1 | Plugin name (`pluginNames`) | `greet` | **No compatibility error** (verdict: *collision recommendation* — advisory only) | The official short name `greet` is valid: the naming policy treats namespacing prefixes as collision-mitigation recommendations, not hard requirements. A short, unprefixed, dictionary-word name carries an elevated chance of clashing with another community plugin, so adopting the `acme-`-qualified form in display/registry-facing contexts is *recommended* — but there is no error to fix. Whether any other plugin already uses `greet` is **unknown (not checked)** — see §2. |
| 2 | Service name (`services`) | `search` | **Collision recommendation (warning, not error)** | `search` is an unprefixed, highly generic service name in the shared Cordis service namespace. If any other enabled plugin (or the host) provides or consumes a service named `search`, resolution becomes ambiguous; consumers doing `ctx.get('search')`-style lookup may bind the wrong provider. Recommendation: rename to a namespaced id such as `acme-greet.search`/`acme.search`. This is a warning — the naming policy does not make it a compatibility error. Whether an actual collision exists today is **unknown (not checked)**. |
| 3 | Event name (`events`) | `web-search/ready` | **No compatibility issue — informational** (namespace ownership: *unknown*) | The event is well-formed and carries a namespace segment (`web-search/...`), i.e. it is a *shared channel* rather than a plugin-private signal. Emitting or listening on a channel owned by another plugin/the ecosystem is a legitimate design, not a collision — events are not exclusive registrations. Informational only: the plugin should document that it interoperates on the `web-search` channel. Who owns that namespace: **unknown (not checked)**; no action required. |
| 4 | Skill name (`skills`) | `greet` | **No compatibility error** (*collision recommendation* — advisory only) | Same shape as surface #1: the short skill name is valid under the policy. Skill catalogs are shown to users, so a bare `greet` is more likely to sit next to another plugin's `greet`; prefixing (`acme-greet`) is recommended for discoverability/collision resistance, not mandated. Actual catalog occupancy: **unknown (not checked)**. |
| 5 | Loader IDs (`loaderIds`) | `acme-greet` | **No compatibility error** | Namespace-prefixed, matches the `acme` namespace and the package stem; well-formed. Registry uniqueness: unknown (not checked). |
| 6 | Tool names (`tools`) | `acme_greet_hi` | **No compatibility error** | Prefixed with the namespace; tool ids use snake_case consistently. Uniqueness against other plugins: unknown (not checked). |
| 7 | Command names (`commands`) | `acme-greet-hi` | **No compatibility error** | Namespace-prefixed; matches coordinate. Uniqueness: unknown (not checked). |
| 8 | Skill provider IDs (`skillProviders`) | `acme-greet-filesystem` | **No compatibility error** | Fully qualified with the plugin id; no bare/generic segment. Uniqueness: unknown (not checked). |
| 9 | Settings namespaces (`settingsNamespaces`) | `acme-greet` | **No compatibility error** | Equals the plugin id, so it cannot be mistaken for another plugin's settings scope. Uniqueness: unknown (not checked). |
| 10 | Route (`routes`, kind `exact`) | `/api/plugins/acme-greet/hi` | **No compatibility error** | The exact route is scoped under the plugin's own id segment (`/api/plugins/acme-greet/...`), which is the recommended route-partitioning pattern; an exact (non-prefix) kind limits the surface to one path. Whether another plugin already serves this exact path: unknown (not checked) — but the id-scoped layout makes accidental collision unlikely. |

## 2. Registry status — honest negative capability

| Question | Answer |
|---|---|
| Is `dsh-greet` taken/free on npm? | **Unknown — not checked.** No registry query was run (offline read-only review; network use is also outside this task's scope). |
| Is the coordinate `acme/greet` reserved or registered in a community/plugin registry? | **Unknown — not checked.** No such registry was queried; this review cannot claim it "reserved" or "globally available". |
| Do the service/skill/event names collide with anything in the wild? | **Unknown — not checked.** §1 flags only *risk classes* (generic `search`, short `greet`), never an observed collision. |
| Can this package even be published as-is? | `private: true` in `package.json` blocks `npm publish` until removed — a local, verifiable fact; separate from any registry occupancy question. |

**No findings ≠ no problems.** Surfaces 5–10 show no *local* compatibility error, but their global uniqueness is unverified by construction of this review. Before publishing, run the actual registry queries (npm `view dsh-greet`, the community plugin registry/coordinate list) — this report deliberately does not substitute for them.

## 3. Summary

- **Compatibility errors found: 0.** Nothing in the manifest violates the naming policy as readable from the fixture.
- **Collision recommendations: 2** — service `search` (strong recommendation: prefix it) and the short plugin/skill name `greet` (advisory).
- **Informational: 1** — event `web-search/ready` is a shared channel by design.
- **Unknown / not checked: all registry and cross-plugin uniqueness questions.** Reported honestly as unknown rather than "reserved" or "available".

*Scope statement: review confined to `fixture/` (read-only) and the plugin-upgrade skill instructions; fixture left byte-identical; report written only under `agent-output/`.*
