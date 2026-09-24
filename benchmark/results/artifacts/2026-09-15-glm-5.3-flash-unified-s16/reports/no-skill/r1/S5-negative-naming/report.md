# S5 · Naming Four-State Judgment Report — plugin `acme/greet` (package `dsh-greet`)

- Date: 2026-09-15
- Scope: read-only review of `fixture/package.json` and `fixture/dsh-plugin.naming.json` (container: `/app/fixture/`). The fixture was not modified (verified clean against git HEAD after review).
- Method: offline static inspection only. No registry, marketplace, npm, or route-table query was performed; no network access; no reproduction environment built.
- Important limitation: the authoritative specification of policy `dsh-plugin-naming/v1` is **not present in the fixture**. Everything below is judged from the fixture's own contents and internal consistency; any statement that would require the policy spec or an external registry is marked **unconfirmed / not checked**.

## Verdict vocabulary used

| State | Meaning |
|---|---|
| compatibility error | Offline-verifiable violation: the name as declared would break, be rejected, or violate its own manifest's structure. |
| collision recommendation | Advisory only: the name is structurally valid but generic / unprefixed / shared, so cross-plugin collisions are plausible. Not an error. |
| needs registry context | A final judgment (taken vs. free, reserved vs. available) requires an online registry/occupancy query that was **not performed**. |
| unknown | Cannot be determined from available evidence at all (missing spec/semantics, not checked). |

## Per-surface verdicts

| # | Surface | Declared value | Verdict | Reasoning |
|---|---|---|---|---|
| 1 | Plugin short name (`pluginNames`) | `greet` | **No compatibility error**; uniqueness → **needs registry context** | A lowercase single word; nothing in the fixture makes it invalid, and the plugin coordinate is already namespaced (`acme/greet`). Whether any other registered plugin already claims the short name `greet` cannot be known offline — not checked. It must **not** be reported as "available" or "globally unique". |
| 2 | Package name (`plugin.packageName` = package.json `name`) | `dsh-greet` | **Needs registry context** (occupancy); format OK offline | Passes npm's basic offline format rules (lowercase, hyphenated, allowed characters, length). Occupancy of `dsh-greet` on npm was not checked. Whether the `dsh-` prefix is platform-reserved is **unknown** (no policy spec in fixture). Offline fact from the manifest itself: `private: true` in package.json will make `npm publish` refuse to publish — a publish blocker the author must resolve (a packaging flag, not a naming verdict). |
| 3 | Loader id (`loaderIds`) | `acme-greet` | **No offline error**; uniqueness → **needs registry context** | Consistently derived from `namespace` + `name`, and reused consistently by commands, settings, route, and provider. Global uniqueness of `acme-greet` and of namespace `acme` not checked. |
| 4 | Service name (`services`) | `search` | **Collision recommendation** (warning, **not** an error) | The only service surface with no plugin prefix, and `search` is one of the most generic capability words. If service lookup is flat across plugins, shadowing/cross-talk with another plugin's `search` service is plausible. Recommend a namespaced form (e.g., `acme-greet.search`). No offline-verifiable rule is violated, and whether the platform enforces service-name uniqueness is **unconfirmed**. |
| 5 | Tool name (`tools`) | `acme_greet_hi` | **No compatibility error**; residual **unknown** | Properly prefixed with namespace+name (snake_case), consistent with the other surfaces. Ownership of the `acme` namespace is not verifiable offline (unknown). |
| 6 | Command name (`commands`) | `acme-greet-hi` | **No compatibility error**; residual **unknown** | Properly prefixed; same namespace-ownership caveat as #5. |
| 7 | Skill name (`skills`) | `greet` | **No offline error**; **conditional collision recommendation** (scoping semantics **unknown**) | Bare name identical to the plugin short name. Whether skill names are auto-scoped per plugin or globally flat cannot be determined from the fixture (unconfirmed). If globally flat, the same generic-word collision concern as service `search` applies; if plugin-scoped, no issue. Registry not checked. |
| 8 | Skill provider (`skillProviders`) | `acme-greet-filesystem` | **No compatibility error** | Loader-id prefix present. `filesystem` is a generic capability suffix, but a collision requires another plugin sharing the exact `acme-greet` prefix — registry not checked. |
| 9 | Event name (`events`) | `web-search/ready` | **Collision recommendation** (informational — shared channel) | The only surface *not* derived from the plugin's own namespace; it reads as a topic on a shared `web-search` channel that other plugins may also emit or subscribe to. If it is meant as a private lifecycle event, rename (e.g., `acme-greet/ready`); if it is meant for interop on a common channel, coordination with that channel's owner is required — whose existence is **unknown / not checked**. Informational, not an error. |
| 10 | Settings namespace (`settingsNamespaces`) | `acme-greet` | **No compatibility error** | Matches the loader id; internally consistent. |
| 11 | Route (`routes`) | exact `/api/plugins/acme-greet/hi` | **No compatibility error**; occupancy **unknown** | Embeds the loader id in the conventional `/api/plugins/<loader-id>/` segment — internally consistent with the rest of the manifest. Whether `/api/plugins/` is the platform's reserved route root, and whether this exact path is taken, was **not checked**. |

## Internal consistency checks (offline-verifiable)

- `package.json.name` (`dsh-greet`) == `plugin.packageName` (`dsh-greet`) — consistent.
- `loaderIds` (`acme-greet`) == `namespace` (`acme`) + `name` (`greet`) — consistent.
- Command, tool, settings, route, and provider identifiers all derive from the same loader id (kebab-case vs snake_case per surface type) — consistent.
- Exactly two surfaces deviate from the plugin's own namespace: service `search` and event `web-search/ready` — these are precisely the two surfaces carrying collision recommendations.
- Both files are well-formed JSON (validated). `schemaVersion: 1` and `policy: "dsh-plugin-naming/v1"` are declared; actual compliance with the `dsh-plugin-naming/v1` spec could not be verified because the spec is not in the fixture — **unconfirmed**.

## Explicitly NOT checked / unknown (no findings ≠ no problems)

No online registry, npm, marketplace, or route-table query was performed. Therefore **no claim is made that any name is reserved, free, taken, or globally available**:

- npm occupancy of `dsh-greet`; whether the `dsh-` prefix is reserved by the platform.
- Registry occupancy of coordinate `acme/greet`, short name `greet`, loader id `acme-greet`, and namespace `acme`.
- Whether the service name `search` is already bound by another plugin at runtime.
- Whether `web-search/ready` is a canonical shared channel and, if so, who owns it.
- Whether skill names are plugin-scoped or globally unique.
- Whether `/api/plugins/` is a platform-reserved route root; occupancy of the exact route path.
- The authoritative rules and reserved-word lists of `dsh-plugin-naming/v1` (spec absent from fixture).

## Bottom line

- **0 compatibility errors** found by offline inspection.
- **2 collision recommendations**: service `search` (warning — recommend namespacing, e.g. `acme-greet.search`) and event `web-search/ready` (informational — shared channel; confirm whether shared-channel interop is intended).
- **1 offline, non-naming publish blocker** observed in the manifest: `private: true` in package.json will block `npm publish` until changed.
- All uniqueness/occupancy/reservation questions remain **needs-registry-context / unknown** and were deliberately not answered. A clean offline review does **not** imply the names are free or globally available.
