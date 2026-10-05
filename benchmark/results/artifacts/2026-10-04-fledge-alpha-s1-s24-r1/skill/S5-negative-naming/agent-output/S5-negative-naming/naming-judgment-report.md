# S5 Naming Four-State Judgment Report

Scope: read-only review of `fixture/` (`dsh-plugin.naming.json`, `package.json`, `README.md`). No files under `fixture/` were modified, no registry was queried, no reproduction environment was built.

## Manifest facts

- policy: `dsh-plugin-naming/v1`, schemaVersion 1
- plugin: namespace `acme`, name `greet`, coordinate `acme/greet`, packageName `dsh-greet` (matches fixture `package.json` `name`)
- names declared: pluginNames `["greet"]`, loaderIds `["acme-greet"]`, services `["search"]`, tools `["acme_greet_hi"]`, commands `["acme-greet-hi"]`, skills `["greet"]`, skillProviders `["acme-greet-filesystem"]`, events `["web-search/ready"]`, settingsNamespaces `["acme-greet"]`, routes `[{kind:"exact", path:"/api/plugins/acme-greet/hi"}]`

## Per-surface verdicts

| Surface | Value | Verdict | Reasoning |
|---|---|---|---|
| Plugin name (official short name) | `greet` (`acme/greet`) | Compatibility: no error (valid). | The short official name is permitted; prefixes such as `acme-` are only collision recommendations, not requirements. Declaring `greet` is not a compatibility error. |
| Loader id | `acme-greet` | Collision recommendation (informational). | Namespaced with the plugin's own namespace, consistent with the coordinate; no error. Uniqueness against other loaders is a registry question (see below). |
| Service name | `search` | Warning, not error. | The service is unprefixed with the plugin namespace/package. This risks collisions with other plugins or core services and is a collision recommendation (warning), not a hard compatibility error. |
| Event name | `web-search/ready` | Shared channel (informational). | The event sits in the shared `web-search/` channel rather than an `acme/`-scoped channel. Informational only; shared channels are allowed but it should be documented so subscribers expect it to be emitted by multiple producers. |
| Tool name | `acme_greet_hi` | Compatibility: no error. | Carries the `acme_greet` prefix; consistent with the namespace. |
| Command name | `acme-greet-hi` | Compatibility: no error. | Namespaced consistently with the plugin id. |
| Skill name | `greet` | Valid; collision recommendation. | Same short name as the plugin. Allowed, but because skills are a shared registry, prefixing (e.g. `acme-greet`) would reduce collision odds — recommendation, not error. |
| Skill provider | `acme-greet-filesystem` | Compatibility: no error. | Prefixed; consistent. |
| Settings namespace | `acme-greet` | Compatibility: no error. | Prefixed; consistent. |
| Route | `/api/plugins/acme-greet/hi` (exact) | Compatibility: no error (structurally namespaced path); collision recommendation. | Path is scoped under `/api/plugins/acme-greet/`, consistent with the loader id. Whether it conflicts with another plugin's route is a registry/runtime question not answered offline. |
| Package name / registry status | `dsh-greet`, `private: true`, version `0.1.0` | Unknown / not checked. | `private: true` marks the package as not intended for direct publish. Without an online registry query we cannot confirm whether `dsh-greet` (or `acme/greet`) is reserved, taken, or globally available; we report "unknown / not checked" rather than claiming availability. |

## Registry availability (honest negative capability)

- No online registry query was performed. Therefore no name is claimed to be "reserved", "taken", "globally available", or "free".
- `private: true` in `package.json` means the repo applies a "do not publish" discipline; it is not evidence of registry status.
- Before real publishing, the author must query the registry (namespace `acme`, package `dsh-greet`, and all declared loader/service/event/skill/route identifiers) and record the result honestly — including the case where a name is already occupied.

## Summary

- No hard compatibility errors found in the declaration surface itself; the official short name `greet` is valid.
- Collision recommendations (warnings, not errors): unprefixed service `search`; shared skill name `greet`; unprefixed `search` and shared channel event `web-search/ready` noted informationally.
- Registry status: unknown / not checked; cannot assert reserved/available without a registry query.

Limitation: no external documentation or registry was consulted; judgments above rely solely on the fixture and the task brief.
