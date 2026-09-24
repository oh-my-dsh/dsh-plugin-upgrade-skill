# S5 · Naming Four-State Judgment Report (Read-Only)

Task: S5-negative-naming · read-only naming-compatibility and registry-status judgment of a community plugin before publishing.

Mode: Mode A-style read-only inspection per the plugin-upgrade skill. No files were modified, no reproduction environment was built, no dependencies installed, no network/registry queries performed (the brief is closed-book and forbids external services).

## Inputs examined

- E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\tasks\S5-negative-naming\environment\fixture\dsh-plugin.naming.json (naming manifest, policy `dsh-plugin-naming/v1`, schemaVersion 1)
- E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\tasks\S5-negative-naming\environment\fixture\package.json (`dsh-greet` @ 0.1.0, `private: true`)
- E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\tasks\S5-negative-naming\environment\fixture\README.md (fixture self-description)

Method note: the naming policy `dsh-plugin-naming/v1` specification is not present in the fixture, and the brief forbids looking outside it. Judgments below are therefore derived from the manifest's own structure (namespaced coordinate `acme/greet` versus unprefixed leaf names) and general registry-collision reasoning, not from a policy text I could verify. Where policy semantics cannot be confirmed, that is stated.

## Per-surface judgments

Four states used: **compatibility error** / **collision recommendation** / **needs registry context** / **unknown**.

| Surface | Declared value | Verdict | Reasoning |
|---|---|---|---|
| Plugin coordinate | `acme/greet` | No compatibility error | Full coordinate is namespaced (`acme`), so it is structurally distinct from any other namespace's `greet`. |
| Plugin short name | `greet` (`pluginNames: ["greet"]`) | Collision recommendation (not an error) | The bare short name is a single generic English word; within any flat or search-based plugin listing it is very likely to collide with other plugins named `greet`. This is a recommendation-level risk: prefixing or keeping the coordinate form is advisable. It is not a compatibility error — the manifest remains loadable. |
| Loader id | `acme-greet` | No compatibility error | Derived deterministically from the namespaced coordinate; collision only possible with another `acme/greet`, which the coordinate itself disambiguates. |
| Service name | `search` | Collision recommendation | Unprefixed, generic, and semantically overlapping with the host's own web-search capability (the DSH host ships a `web` capability whose surface includes search). An unprefixed `search` service from a community plugin risks confusion and potential service-name collisions with core or other plugins. A namespaced form (e.g. `acme-greet/search` or `acme.search`) is recommended. Treated as a recommendation, not a hard error, because I could not verify that the naming policy makes unprefixed service names fatal. |
| Tool name | `acme_greet_hi` | No compatibility error | Namespaced with the plugin's own prefix; follows the prefixed convention and is unlikely to collide. Registry uniqueness of the exact string: unknown (see below). |
| Command name | `acme-greet-hi` | No compatibility error | Prefixed with the plugin coordinate slug; low collision risk. |
| Skill name | `greet` | Collision recommendation | Same generic-word problem as the plugin short name, in the skill catalog namespace where short user-facing names compete directly. If skills are meant to be user-invocable by bare name, `greet` alone is weakly identified; recommend a more specific name or reliance on provider qualification. |
| Skill provider | `acme-greet-filesystem` | No compatibility error | Prefixed with the plugin slug; specific enough. |
| Event name | `web-search/ready` | Needs registry context | The channel prefix `web-search` is not owned by this plugin (`acme/greet`). Emitting an event on another capability's channel may be intentional (a shared/standard channel) or an accidental squat on someone else's namespace. Whether it is legal depends on whether `web-search` is a registered shared channel in the naming registry — information this closed-book fixture cannot provide. Treat as informational pending registry context, not an error. |
| Settings namespace | `acme-greet` | No compatibility error | Plugin-owned slug; consistent with the loader id. |
| Route | `/api/plugins/acme-greet/hi` (exact) | No compatibility error | Nested under a plugin-prefixed path segment; the structure reserves the `acme-greet` subtree for this plugin. Collision would require another `acme/greet` plugin. |
| npm package name | `dsh-greet` (`package.json`) | Unknown (registry not queried) | Unscoped npm name in the `dsh-*` convention space. Whether `dsh-greet` is already taken on npm cannot be determined without an online registry query, which this task forbids. Also note `private: true` currently blocks publishing; that must be changed (with the skill's Mode B/C discipline) before any real publish. |

## Registry status — explicit negative statement

**No registry (DSH community naming registry, npm, or any other) was queried.** This is a closed-book, offline task. Accordingly:

- I do **not** claim any name here is "reserved" or "globally available".
- Every uniqueness question — including `dsh-greet` on npm, `acme/greet` in the plugin registry, `acme_greet_hi` in the tool namespace, and the `web-search` channel's ownership — is reported as **unknown / not checked**.
- "No findings" on a surface above means only "no structural problem visible from the manifest itself", never "verified free of conflicts".

## Summary counts

- Compatibility errors: 0
- Collision recommendations: 3 (plugin short name `greet`, service `search`, skill `greet`)
- Needs registry context: 1 (event `web-search/ready` channel ownership)
- Unknown / not checked: all registry-availability questions, notably the npm name `dsh-greet`

## Pre-publication recommendations

1. Rename the service to a namespaced form instead of bare `search`.
2. Consider a more specific skill name than `greet`, or ensure the catalog displays it qualified by provider.
3. Before publishing, run the actual registry checks that this offline judgment deliberately did not perform: npm availability of `dsh-greet`, plugin-coordinate availability of `acme/greet`, and confirmation that `web-search` is a shared event channel the plugin may emit on.
4. Remove `private: true` only as part of a deliberate, confirmed publish flow (Mode B/C of the plugin-upgrade skill); this report made no such change.

## Rollback / side effects

None. This task was read-only with respect to the fixture and the wider repository; the only file written is this report under the designated output directory.
