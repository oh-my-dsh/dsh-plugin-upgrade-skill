# Naming Compatibility & Registry Status — Judgment Report

**Plugin coordinate:** `acme/greet` (namespace `acme`, short name `greet`)
**Package:** `dsh-greet` 0.1.0 (declared `private: true` — packaging/registration note only, not a naming surface)
**Naming policy:** `dsh-plugin-naming/v1`, schemaVersion 1

## Scope & method (read-only, no registry access)

- I reviewed the fixture read-only: `package.json`, `dsh-plugin.naming.json`, `README.md`. Nothing under `fixture/` was modified.
- **No online registry query was performed** (network access is out of scope and prohibited by this brief). Consequently I make **no claim that any name is "reserved" or "globally available"**. Every availability/reservation question is reported as **needs registry context → unknown / not checked**.
- **No naming rules reference cards are available in this run (NOSKILL)**. I was instructed not to read or cite the repository skills/ cards. Format/validity judgments below are therefore based on the manifest's own consistency and on general naming conventions, not on an authoritative rule set. Rule-specific determinations that I cannot back with an authoritative rule are marked **unknown/unconfirmed** rather than asserted.

## Verdict vocabulary used below

- **compatibility error** — a definite rule/format violation that breaks compatibility.
- **collision recommendation** — well-formed but collision-prone (generic/unprefixed); recommend namespacing. A *warning*, not an error.
- **needs registry context** — the deciding fact (ownership, reservation, availability) can only come from a registry query I do not have.
- **unknown** — cannot be determined from available material (e.g., no authoritative rule on hand).

## Per-surface judgment

| # | Surface | Declared value | Verdict | Reasoning |
|---|---------|----------------|---------|-----------|
| 1 | Plugin namespace | `acme` | **no compatibility error**; ownership → **needs registry context** | Lowercase, valid token, and consistent with the coordinate prefix. Whether `acme` is a real, owned namespace vs. a placeholder is a registry question; I do not assert it is registered. |
| 2 | Plugin name (official short name) | `greet` | **no compatibility error**; **collision recommendation** | Valid lowercase short name. `greet` is a generic, high-frequency English word, so as a *short* (unqualified) name it is collision-prone across communities; the namespace `acme` is what disambiguates it. Prefixing is a *collision* recommendation only, not a compatibility error. Availability of `greet` → **unknown / not checked**. |
| 3 | Coordinate | `acme/greet` | **no compatibility error** | Internally consistent: namespace + name. |
| 4 | Package name | `dsh-greet` | **collision recommendation** + rule specifics **unknown** | Uses the `dsh-` prefix while the declared namespace is `acme` (coordinate `acme/greet`, loaderId `acme-greet`). If `dsh-` is a reserved first-party prefix, this package name misrepresents a community plugin as official; if it is merely a loose convention, it is a low-severity mismatch. Without the naming rules (NOSKILL) I mark this **unconfirmed**, recommend aligning the package name with the `acme` namespace, and leave "is `dsh-` reserved?" to **registry context**. |
| 5 | Loader id | `acme-greet` | **no compatibility error** | Namespace-prefixed, kebab-case, consistent with coordinate. |
| 6 | Service name | `search` | **collision recommendation** (warning, **not** an error) | Unprefixed and extremely generic. A service named `search` is highly collision-prone with core/platform services and with other plugins' services. Recommend `acme/search` (or equivalent namespacing). Whether `search` is already taken/reserved → **needs registry context (unknown)**. |
| 7 | Tool name | `acme_greet_hi` | **no compatibility error** | Namespace-prefixed, snake_case, specific. |
| 8 | Command name | `acme-greet-hi` | **no compatibility error** | Namespace-prefixed, kebab-case, specific. |
| 9 | Skill name | `greet` | **collision recommendation** | Unprefixed generic name identical to the plugin short name; if skill names resolve globally it is collision-prone. Availability → **needs registry context (unknown)**. |
| 10 | Skill provider | `acme-greet-filesystem` | **no compatibility error** | Namespace-prefixed, specific. |
| 11 | Event name | `web-search/ready` | **needs registry context** (shared channel, informational) | The `web-search/` prefix is **not** `acme` — this references another (likely) plugin/domain's channel. It is a **shared-channel / cross-plugin reference**, not a self-owned namespace. I do **not** classify it as a collision or error: whether `web-search` exists, owns `ready`, and whether acme/greet is authorized to subscribe/emit there is a registry/contract question → **unknown**. |
| 12 | Settings namespace | `acme-greet` | **no compatibility error** | Namespace-prefixed. |
| 13 | Route | `/api/plugins/acme-greet/hi` (exact) | **no compatibility error** | Valid path, namespaced by `acme-greet`, consistent with loaderId. Route *conflicts* would require server/router context, not naming rules. |

## Registry status summary (honest, not checked)

- I **did not** query any registry. Therefore: **none of the names above is asserted to be "reserved", "taken", "globally available", or "free".**
- Registry-relevant open questions that remain **unknown**: availability of short name `greet`, of service `search`, of skill `greet`, whether namespace `acme` is registered, whether `dsh-` is a reserved first-party prefix, and whether `web-search` is an existing plugin that owns the `ready` event.

## Overall conclusion

- **No compatibility errors** were identified from the manifest: every declared name is syntactically well-formed and internally consistent.
- **Collision recommendations**: unprefixed/generic names — short name `greet`, service `search`, skill `greet`, and (as a namespace-alignment concern) package name `dsh-greet` — should be namespaced (`acme/*`) before publishing.
- **Needs registry context**: the `web-search/ready` event is a shared/cross-plugin channel whose ownership must be confirmed against the registry before publishing; all availability/reservation determinations are likewise deferred to a registry query.
- **Unknown**: authoritative rule specifics (e.g., whether `dsh-` is reserved) could not be verified because no naming reference cards were available in this run.

**Negative capability held:** where the material does not establish a fact, the report says *unknown / not checked* rather than asserting "reserved" or "available".
