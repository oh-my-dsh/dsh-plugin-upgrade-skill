# S5 · Naming Four-State Judgment Report (Read-Only)

## Task and method

- **Task**: read-only judgment of the naming compatibility and registry status of the community plugin declared in the S5 fixture (`package.json` + `dsh-plugin.naming.json`), using the four-state verdict vocabulary: **compatibility error / collision recommendation / needs registry context / unknown**.
- **Method**: closed-book, offline, fixture-only inspection per the brief and the `plugin-upgrade` skill (Mode A · inspect — read-only; no writes to the fixture, no reproduction environment, no dependency installs, no network/registry queries). Working directory copy of the fixture was not created; the fixture directory was only read.
- **Fixture identity**: `dsh-plugin.naming.json` declares `schemaVersion: 1`, policy `dsh-plugin-naming/v1`, plugin coordinate `acme/greet`, package `dsh-greet` v0.1.0 (`private: true`).

## Constraint that shapes every verdict

No online registry (community plugin registry, npm, skill catalog) was queried — the brief forbids it. Therefore **nothing below can be certified as "reserved" or "globally available"**; all availability questions are reported as **unknown / not checked**. Absence of a finding is not evidence of safety.

## Surface-by-surface judgment

| # | Surface | Declared value | Verdict | Reasoning |
|---|---|---|---|---|
| 1 | Plugin coordinate | `acme/greet` | **No compatibility error**; namespace prefix present → residual **collision recommendation** only | A `namespace/name` coordinate is well-formed (non-empty namespace `acme`, short name `greet`). Short, generic lower-case names are the most crowded segment of any community registry; the prefix is what carries the disambiguation, so the coordinate itself is fine. Whether `acme/greet` is already taken is **unknown** (registry not queried). |
| 2 | Plugin name (short) | `greet` | **No compatibility error; collision recommendation** | A bare short name `greet` is syntactically valid — an unprefixed short name is not a compatibility error, only a collision-risk flag: it is a common English verb with no namespace qualifier, so it is likely to be contested in a community catalog. Recommend relying on (and displaying) the full coordinate `acme/greet`; optionally lengthen the short name. Not an error. Registry occupancy: **unknown**. |
| 3 | npm package name | `dsh-greet` | **Needs registry context / unknown** | Unscoped, short, `dsh-`-prefixed npm name. Two unverified risks: (a) npm occupancy of `dsh-greet` is **unknown** — not checked, no query performed; (b) whether the community standard reserves or recommends a particular package-naming pattern for third-party plugins is **unconfirmed** in this closed-book brief (the `dsh-plugin-naming/v1` policy document is not available locally). Additionally `package.json` sets `private: true`, which will make `npm publish` refuse outright — that must be flipped deliberately before publishing, and its current state suggests test material not yet publish-prepared. |
| 4 | Loader id | `acme-greet` | **No compatibility error; collision recommendation (weak)** | Namespaced (`acme-`) and distinct from the short name; correct pattern. Uniqueness within a user's installed set is **unknown** — depends on what else the user loads; only a registry/install-set query could confirm. |
| 5 | Service name | `search` | **Collision recommendation (warning, not a compatibility error)** | Cordis service names are resolved process-wide by bare string. `search` is a maximally generic, unprefixed name that a host or another plugin (web-search capability, etc.) can plausibly already provide; a same-name registration collides or overrides silently. Recommend a namespaced id (e.g. `acme-greet/search` or `acme-greet.search`, per whatever the community standard specifies — exact convention **unconfirmed** offline). The host's currently-provided service list was not enumerated (no runtime/registry query allowed), so an *actual* clash is **unknown**, but the *risk* is high enough to warrant the recommendation regardless. |
| 6 | Tool name | `acme_greet_hi` | **No compatibility error**; occupancy **unknown** | Prefixed and specific — the right pattern; tool ids share a model-visible namespace so prefixing matters. Whether another installed plugin already registers it: **not checked**. |
| 7 | Command | `acme-greet-hi` | **No compatibility error**; occupancy **unknown** | Prefixed, hyphenated, specific. Same caveat. |
| 8 | Skill name | `greet` | **Collision recommendation / needs registry context** | Skill catalogs are typically host-wide and matched by bare name; an unprefixed generic word like `greet` invites shadowing or collision with any other greet-named skill. Recommend prefixing (`acme-greet`-style) or a more specific name. Whether a `greet` skill already exists anywhere: **unknown**. |
| 9 | Skill provider | `acme-greet-filesystem` | **No compatibility error**; occupancy **unknown** | Properly prefixed and specific. |
| 10 | Event name | `web-search/ready` | **Needs registry context (informational — shared channel, not an error)** | The key is scoped under a **foreign/other capability's channel prefix** (`web-search/`), i.e. it reads as an event on a shared, community-owned channel rather than the plugin's own `acme-greet/` scope. That is not a compatibility error, but it means correctness depends on channel-owner semantics: whether third parties may emit/extend under `web-search/*`, and what payload contract that channel fixes, is defined by the channel owner — **unconfirmed** here (no access to the channel registry/spec). If the event is actually this plugin's own lifecycle signal, prefer its own scope (`acme-greet/ready`). |
| 11 | Settings namespace | `acme-greet` | **No compatibility error**; occupancy **unknown** | Namespaced and specific; consistent with the loader id. |
| 12 | Route | `/api/plugins/acme-greet/hi` (exact) | **No compatibility error**; occupancy **unknown** | Namespaced under `/api/plugins/` with the plugin slug — the correct defensible pattern. Whether the host or another plugin already binds this exact path in a given installation: **not checked**. |

## Registry status (explicit negative statement)

- Community plugin registry occupancy of `acme/greet`, `greet`, `acme-greet`: **unknown — not checked** (no online query permitted or performed).
- npm availability of `dsh-greet`: **unknown — not checked**. I do **not** claim it is free, reserved, or taken.
- Skill/tool/command/settings/event-channel global uniqueness: **unknown — not checked**.
- Validity of the `dsh-plugin-naming/v1` policy document itself and any reserved-name lists it defines: **unconfirmed** (closed-book; the policy text is not in the fixture).

## Summary counts

- **Compatibility errors: 0** — no surface violates a naming rule verifiable from the fixture alone.
- **Collision recommendations: 3** — short plugin name `greet` (weak; coordinate prefix mitigates), unprefixed service `search` (strongest finding), unprefixed skill `greet`.
- **Needs registry context: 2** — package name `dsh-greet` (plus `private: true` publish blocker), event `web-search/ready` (shared-channel semantics owned elsewhere).
- **Unknown (availability): all occupancy questions above** — honestly reported as not checked.

## Pre-publication recommendations (advisory only; nothing was modified)

1. Rename the service from `search` to a namespaced id; this is the one change I would treat as near-blocking for a community release.
2. Prefix or specialize the skill name `greet`.
3. Decide whether `web-search/ready` is intentionally on the shared `web-search` channel; if it is this plugin's own event, move it under `acme-greet/`.
4. Before publishing: resolve `private: true`, then run the actual registry/npm availability checks that this closed-book review could not.
5. Rely on the full coordinate `acme/greet` (not the bare `greet`) in documentation and marketing to defuse short-name collisions.

## Scope / integrity notes

- Fixture files read: `dsh-plugin.naming.json`, `package.json`, `README.md`. Nothing under the fixture (or anywhere in the benchmark repository) was created, modified, renamed, or deleted; no build, install, or reproduction environment was created.
- Skill mode used: **Mode A · inspect** (read-only) — no confirmation-gated writes were needed, and none were performed.
- The only file written by this task is this report in the designated output directory.
