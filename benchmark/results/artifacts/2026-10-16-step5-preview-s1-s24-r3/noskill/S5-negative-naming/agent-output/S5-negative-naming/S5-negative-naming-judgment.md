# S5 · Naming Four-State Judgment Report (read-only review)

**Target:** community plugin `acme/greet` (package `dsh-greet`, v0.1.0), pre-publication naming review
**Evidence reviewed (read-only):** `fixture/package.json`, `fixture/dsh-plugin.naming.json`, `fixture/README.md`
**Date of review:** 2026-10-16 (Asia/Shanghai)
**Method:** static review of the fixture only. **No online registry query was performed, no network access, no build/reproduction environment, no runtime or inspect-provider query, and no file under `fixture/` was modified.** Fixture integrity verified by SHA-256 before and after the review (see Appendix A).

---

## 1. Verdict vocabulary (four states, as applied)

| State | Meaning in this report |
|---|---|
| **Compatibility error** | Hard, policy-level violation that should block publication. |
| **Collision recommendation** | Policy-valid but collision-prone; non-blocking advice to prefix or rename. |
| **Needs registry context** | Verdict cannot be finalized offline because it hinges on registry facts (existence, ownership, availability). |
| **Unknown** | Not checked / not verifiable from the materials available in this container. |

**Standing caveat (negative capability).** This is a registry-less review. Absence of findings is **not** evidence of absence of problems: no name below is claimed to be "reserved", "taken", or "globally available". Every availability/collision statement is conditional on a registry query that was not run.

**Evidentiary limit.** The policy document behind `policy: "dsh-plugin-naming/v1"` / `schemaVersion: 1` is **not present in the fixture** and was not readable from this cell, so the policy identifiers are taken at face value and the policy-level semantics used below are the ones stated in the fixture's own `README.md` (quoted where relied upon). Anything not verifiable from the fixture is marked *unconfirmed*.

---

## 2. Surface-by-surface verdicts

### 2.1 Plugin name — short name `greet` (`plugin.name`, `pluginNames: ["greet"]`, coordinate `acme/greet`)

- **Verdict: no compatibility error — valid.** The strongest state the policy supports here is *collision recommendation* (never an error).
- **Reasoning:** the name is well-formed, and the bare short name is legitimately qualified by the declared coordinate `acme/greet` (`namespace: "acme"` + `name: "greet"`, internally consistent). Per the policy semantics recorded in the fixture README, *"the official short name `greet` is valid (no compatibility error; prefixes are only collision recommendations)"* — i.e. a missing inline prefix is recommendation-level, not a compatibility error. The only soft advice available is to keep using the fully qualified `acme/greet` coordinate in user-facing surfaces.
- **Registry status: unknown / not checked.** Whether the short name `greet` is already taken by another publisher cannot be determined without a registry query.

### 2.2 Skill name — `greet` (`skills: ["greet"]`)

- **Verdict: no compatibility error; at most a collision recommendation (soft).**
- **Reasoning:** well-formed, but unprefixed. Skills occupy a shared (global) namespace, so an unprefixed `greet` carries a collision *risk*; a prefixed form (e.g. `acme-greet`) would be the conventional mitigation. Per the policy semantics above, prefixing is recommendation-level only — this is **not** a compatibility error.
- **Registry status: unknown / not checked** (whether a `greet` skill already exists is a registry fact).

### 2.3 Service name — `search` (`services: ["search"]`)

- **Verdict: collision recommendation (warning, not an error).**
- **Reasoning:** unprefixed and highly generic in the global service namespace — the classic collision shape. The fixture README states the expected severity explicitly: *"the unprefixed service `search` is a warning not an error."* Recommended remediation: prefix it (e.g. `acme-search` or `acme/search`).
- **Registry status: unknown / not checked.** It must **not** be claimed that `search` is reserved, taken, or free — that requires a registry query.

### 2.4 Event name — `web-search/ready` (`events: ["web-search/ready"]`)

- **Verdict: needs registry context (informational; not a compatibility error).**
- **Reasoning:** the channel is well-formed, but the `web-search/` prefix is a **foreign namespace** — this plugin's namespace is `acme`. The fixture README classifies it as *"a shared channel (informational)"*, so on its face it is not an error. What cannot be settled offline: whether the `web-search` namespace exists, who owns it, and whether emitting/listening on another namespace's channel is permitted for a community plugin. That is exactly registry context, and the registry was not queried.
- **Registry status: unknown / not checked.**

### 2.5 Tool — `acme_greet_hi` (`tools`)

- **Verdict: no compatibility error.** Namespaced, conventional `namespace_name_action` snake_case. **Registry status: unknown.**

### 2.6 Command — `acme-greet-hi` (`commands`)

- **Verdict: no compatibility error.** Namespaced `namespace-name-subcommand` form, consistent with the coordinate. **Registry status: unknown.**

### 2.7 Loader id — `acme-greet` (`loaderIds`)

- **Verdict: no compatibility error.** Namespaced; matches the coordinate derivation. **Registry status: unknown.**

### 2.8 Skill provider — `acme-greet-filesystem` (`skillProviders`)

- **Verdict: no compatibility error.** Namespaced `namespace-name-role` form. **Registry status: unknown.**

### 2.9 Settings namespace — `acme-greet` (`settingsNamespaces`)

- **Verdict: no compatibility error.** Namespaced; identical to the loader id, which is the conventional pattern. **Registry status: unknown.**

### 2.10 Route — `/api/plugins/acme-greet/hi` (`kind: "exact"`)

- **Verdict: no compatibility error.** The path lives under the `/api/plugins/<namespace>/` prefix, so no cross-plugin route collision is expected by construction. **Registry status: unknown** (whether the host mounts this path, and whether it is already served, was not checked).

### 2.11 Package name — `dsh-greet` (`package.json:name`, `plugin.packageName`)

- **Verdict: no compatibility error (format).** Conventional `dsh-` package name; the two declarations are mutually consistent (`dsh-greet` in both files). **Registry status: unknown** — availability of the package name on the package registry was not queried.

### 2.12 Coordinate / namespace — `acme/greet`, `acme`

- **Verdict: no compatibility error.** Well-formed and internally consistent across every derived surface (coordinate, loader id, command, tool, settings namespace, route prefix). **Registry status: unknown** — whether the `acme` namespace is claimable/registered is a registry fact that was not checked.

---

## 3. Summary table

| # | Surface | Value | Verdict | Blocking? |
|---|---|---|---|---|
| 1 | Plugin name (short) | `greet` | No compatibility error — valid (ceiling: collision recommendation) | No |
| 2 | Skill name | `greet` | No compatibility error; soft collision recommendation | No |
| 3 | Service name | `search` | **Collision recommendation** (warning) | No |
| 4 | Event name | `web-search/ready` | **Needs registry context** (informational) | No |
| 5 | Tool | `acme_greet_hi` | No compatibility error | No |
| 6 | Command | `acme-greet-hi` | No compatibility error | No |
| 7 | Loader id | `acme-greet` | No compatibility error | No |
| 8 | Skill provider | `acme-greet-filesystem` | No compatibility error | No |
| 9 | Settings namespace | `acme-greet` | No compatibility error | No |
| 10 | Route | `/api/plugins/acme-greet/hi` | No compatibility error | No |
| 11 | Package name | `dsh-greet` | No compatibility error (format) | No |
| 12 | Coordinate / namespace | `acme/greet`, `acme` | No compatibility error | No |
| — | **Registry status (all of the above)** | — | **Unknown — not checked** | — |

**Zero compatibility errors were found.** Per the brief's requirement, that is explicitly **not** a clean bill of health: it only means no *hard* violation is visible from the fixture alone. The registry dimension of every surface is **unknown**.

---

## 4. Publish-readiness judgment

1. **No blocking compatibility errors** are visible in the naming manifest, within the limits of a registry-less static review.
2. **Two soft, non-blocking recommendations** (collision level, never errors):
   - prefix the service `search` (e.g. `acme-search`);
   - consider prefixing the skill `greet` (e.g. `acme-greet`).
3. **One deferred item:** the event `web-search/ready` on the foreign `web-search/` channel needs registry context before its legitimacy can be confirmed.
4. **Before actually publishing**, an online registry query is required to resolve the *unknown* items: availability of `greet`, `search`, `dsh-greet`, and the `acme` / `web-search` namespaces. None of these can be asserted from this container.

---

## 5. Adjacent observations (outside the naming scope, noted for completeness)

- `package.json` contains `"private": true`. The fixture README states this is the repository's "test material, do not publish" discipline and is **not part of this brief**; it is recorded here only because `private: true` would ordinarily block `npm publish`.
- The policy identifier `dsh-plugin-naming/v1` and `schemaVersion: 1` could not be validated against a policy specification (not present in the fixture) — *unconfirmed*, taken at face value.
- Internal consistency checks that **passed**: `packageName` == `package.json:name`; `coordinate` == `namespace/name`; `loaderId` == `namespace-name`; `command` == `namespace-name-subcommand`; `tool` == snake_case of the same; `settingsNamespace` == `loaderId`; route path nested under `/api/plugins/<namespace>/`.

---

## Appendix A — Fixture integrity (read-only guarantee)

SHA-256, computed immediately before and re-verified after the review (identical; no writes were made to `fixture/`):

| File | Bytes | SHA-256 |
|---|---|---|
| `package.json` | 67 | `71cd34926a4686d2098c582b93f86305c772f1e7d0bee5be9f1ca64d26ec99bc` |
| `dsh-plugin.naming.json` | 573 | `2863bfaf22ab7c9ff69a03b06af2cc1808cec2054987fcf5c6d4c55df61cb6b0` |
| `README.md` | 641 | `f27373bc472e94e859b37407eaf5332fcda747a7f55110a4ea9d430644862645` |

Both JSON files parse as valid JSON. No reproduction environment was built, no dependencies installed, nothing migrated, and no path outside `agent-output/` was written.
