# S5 · Naming Compatibility & Registry Status — Judgment Report (Read-Only)

**Mode:** A · inspect (read-only review). No fixture file was modified; no environment was built; no dependencies installed; no registry/network was contacted.

## Scope & method

Reviewed the plugin's naming declaration and package identity under the four-state judgment requested:

- **compatibility error** — a name violates a hard grammar/schema rule, or is internally inconsistent in a way that would break loading, registration, or publishing.
- **collision recommendation** — the name is grammatically valid but sits unprefixed/generic in a *shared/global* coordinate space; prefixing/namespacing is recommended to avoid collision, but its absence is **not** an error.
- **needs registry context** — correctness depends on an external/shared coordinate (a package slot, a shared event channel, a registered namespace) whose owner/state cannot be read from local material; a registry/owner query is required to settle it.
- **unknown** — cannot be determined from the available material (no registry access; the governing naming spec is not mounted).

Materials read: `fixture/package.json`, `fixture/dsh-plugin.naming.json`, `fixture/README.md`, and `skills/plugin-upgrade/SKILL.md` + the reference cards cited below. The authoritative naming convention lives in `dsh-community-standard` (normative background per SKILL.md); that spec is **not** mounted in this container, so every rule beyond the manifest's own self-declared `policy: "dsh-plugin-naming/v1"` and the DSH runtime rules below is marked **unconfirmed**, not assumed.

## Per-surface judgment

| # | Surface | Declared value | Verdict | Reasoning (key point only) |
|---|---|---|---|---|
| 1 | Plugin short name | `greet` (`plugin.name`, `pluginNames`) | **No compatibility error; collision recommendation** | Valid lowercase short name. Per the manifest's own convention, a namespace prefix is a *recommendation*, not a requirement — an unprefixed short name is not an error. "greet" is a generic word in a global short-name space, so a collision recommendation stands; registry availability of the name = **unknown**. |
| 2 | Package name (npm) | `dsh-greet` (`package.json#name`, `packageName`) | **No compatibility error; needs registry context** | Valid unscoped npm name and consistent with the community `dsh-*` plugin pattern (cf. `dsh-loop`, `dsh-mnemon`, `dsh-input-history` in the skill). Whether `dsh-greet` is already taken is a registry fact — **unknown** (not queried). No claim of "available" or "reserved". |
| 3 | Namespace | `acme` (`plugin.namespace`) | **No compatibility error; needs registry context** | Valid namespace token. Whether `acme` is a registered/reserved community namespace is a registry fact — **unknown** (not queried). |
| 4 | Coordinate | `acme/greet` | **No compatibility error** | Internally consistent with `namespace`+`name`; namespaced and unambiguous. |
| 5 | Loader ID | `acme-greet` (`loaderIds`) | **No compatibility error; unconfirmed cross-check** | Namespaced, valid. Cross-check: DSH keys registrations by package name (registration id == `package.json#name`; card DSH-0.1.2-A1-26 / troubleshooting "loaded without registering" row), while the declared `loaderIds` ("acme-greet") ≠ `packageName` ("dsh-greet"). Whether the community naming policy permits a loader id diverging from the package name is **unconfirmed** (spec not mounted); verify against `dsh-community-standard` before publishing rather than assuming either way. |
| 6 | Service | `search` (`services`) | **Collision recommendation** (not an error) | Unprefixed, generic service name in the global Cordis service namespace. Risk of colliding with another plugin's `search` service; recommend a namespace/coordinate-scoped name (e.g. `acme-search` / `acme/greet.search`). Grammatically valid — **not** a compatibility error. |
| 7 | Tool | `acme_greet_hi` (`tools`) | **No compatibility error** | Namespaced with the `acme_greet` prefix. Underscore naming convention for tools is **unconfirmed** against the spec, but no error is evidenced. |
| 8 | Command | `acme-greet-hi` (`commands`) | **No compatibility error** | Namespaced with the `acme-greet` prefix; hyphenated form is conventional. |
| 9 | Skill | `greet` (`skills`) | **Collision recommendation** (not an error) | Same reasoning as the short name: unprefixed generic skill name in a shared skill namespace; recommend namespacing. Not an error; availability = **unknown**. |
| 10 | Skill provider | `acme-greet-filesystem` (`skillProviders`) | **No compatibility error** | Namespaced with the `acme-greet` prefix. |
| 11 | Event | `web-search/ready` (`events`) | **Needs registry context** (informational) | Valid `domain/event` grammar, but the domain `web-search` is **not** this plugin's namespace (`acme`) — it is a shared/external channel. Declaring this event signals participation in a channel the plugin does not own; coordination with the channel's owner/other participants is required. Informational, **not** a compatibility error. |
| 12 | Settings namespace | `acme-greet` (`settingsNamespaces`) | **No compatibility error** | Conforms to the settings grammar — lowercase start + `[a-z0-9-]` suffix (card DSH-0.1.2-A2-10); namespaced. |
| 13 | Route | `/api/plugins/acme-greet/hi` (`routes`, exact) | **No compatibility error** | Host-local surface, namespaced under the plugin-derived `acme-greet` segment. Cross-plugin route uniqueness on a given host = **unknown** (no registry/host query). |

## Registry status (negative capability)

No online registry query was performed — the brief forbids network access and none is available in this container. Accordingly:

- I make **no** claim that any name is "reserved", "taken", "globally available", or "free" — not the package `dsh-greet`, not the namespace `acme`, not the short name `greet`, not the service `search`, not the skill `greet`, not the shared event channel `web-search/ready`.
- **No findings ≠ no problems.** The absence of a compatibility error here means only that the declared names conform to the grammar/conventions I can verify from the mounted material. It does **not** establish global availability or collision-freedom; those require a live registry/owner query that was deliberately not made.

## Out-of-scope observation

`package.json` carries `"private": true`. Per the fixture's own README this is the repository's "test material, do not publish" discipline and not part of the naming brief, so it is not scored as a naming verdict — but note that `private: true` would block an npm publish until removed, independent of naming.

## Bottom line

No **compatibility error** was established on any surface. Two surfaces carry **collision recommendation** (unprefixed generic `search` service; unprefixed generic `greet` skill/short name), one surface is a shared **event channel needing registry/owner context** (`web-search/ready`), one surface has an **unconfirmed loader-id/package-name cross-check**, and **every** registry-availability question is answered **unknown/not-checked** rather than asserted.

Citations (key point only): settings-namespace grammar → DSH-0.1.2-A2-10; loader/package-name registration identity → DSH-0.1.2-A1-26 and the troubleshooting "loaded without registering" row; naming convention ownership → SKILL.md normative background (`dsh-community-standard`).
