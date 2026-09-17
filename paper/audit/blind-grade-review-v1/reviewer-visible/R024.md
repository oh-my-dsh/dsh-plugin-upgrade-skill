# S5 · Naming Four-State Judgment Report — plugin `acme/greet` (`dsh-greet` 0.1.0)

Mode: **A · inspect** (read-only) per the plugin-upgrade skill. Evidence sources: `fixture/package.json`, `fixture/dsh-plugin.naming.json`, `fixture/README.md`. No file under the fixture was modified; no registry/network query was performed; no reproduction environment was built. The skill's own reference cards contain no plugin-naming rules — naming conventions belong to the dsh-community-standard, which is outside this closed-book fixture; any convention statement below that is not directly readable from the fixture is marked unconfirmed.

## Verdict summary

| # | Surface | Declared value | Verdict | One-line reasoning |
|---|---|---|---|---|
| 1 | Plugin name (short) | `greet` | Needs registry context (no compatibility error) | Generic word, viable short name; collision risk only after a registry check |
| 2 | Loader id | `acme-greet` | No compatibility error observed (structurally consistent) | Pairs the `acme` namespace with the short name; consistent with route/settings/coordinate |
| 3 | npm package name | `dsh-greet` | Needs registry context / collision recommendation | Flat unprefixed `dsh-*` name; whether `dsh-greet` is taken on npm is unverified here |
| 4 | Service name | `search` | Collision recommendation (warning, not error) | Fully generic, unprefixed; high clash probability with other plugins' services |
| 5 | Tool name | `acme_greet_hi` | No compatibility error observed | Correctly prefixed; namespace-consistent |
| 6 | Command name | `acme-greet-hi` | No compatibility error observed | Correctly prefixed; namespace-consistent |
| 7 | Skill name | `greet` | Needs registry context / collision recommendation | Same generic short name as the plugin; prefixing recommended but not an error |
| 8 | Skill provider | `acme-greet-filesystem` | No compatibility error observed | Prefixed; note the `filesystem` token resembles a core-capability word — registry/core-overlap context needed |
| 9 | Event name | `web-search/ready` | Collision recommendation (informational) — likely shared channel | Slashed, domain-generic name (`web-search`) not derived from `acme/greet`; may collide or be an intended shared channel |
| 10 | Settings namespace | `acme-greet` | No compatibility error observed | Prefixed, matches loader id; grammar consistent with the settings-namespace conventions in skill reference card DSH-0.1.2-A2-10 |
| 11 | Route | `/api/plugins/acme-greet/hi` (exact) | No compatibility error observed | Prefixed, namespaced under `/api/plugins/`; core-owned path segments unverified |

## Detailed reasoning per surface

1. **Plugin short name `greet`** — The manifest declares `plugin.coordinate: "acme/greet"` with `namespace: "acme"`, so the coordinate is already namespaced; the short name alone (`pluginNames: ["greet"]`) is a plain generic word. It is syntactically valid and I found **no compatibility error**: nothing in the fixture shows a reserved-word or grammar violation. Whether `greet` or `acme/greet` is already registered by another community plugin cannot be determined offline — prefixing is at most a **collision recommendation**, not a compatibility defect.
2. **Loader id `acme-greet`** — Consistently derived from namespace + name and reused verbatim in the route path and the settings namespace (internal symmetry holds). No error observed; global uniqueness unverified.
3. **Package name `dsh-greet`** — `package.json` declares the flat, unscooped `dsh-greet`. This is the one coordinate where a collision would be a hard, publish-blocking problem (npm names are globally unique), and it is exactly the coordinate I **cannot check offline**: verdict **needs registry context**. Verify before publishing; a scoped name would be a mitigation, but whether the community standard requires or rejects scoping is unconfirmed from this fixture.
4. **Service name `search`** — Fully generic and unprefixed, unlike every other contribution in the manifest (tools, commands, providers, settings are all `acme`-prefixed). Services share a flat namespace across plugins, so `search` is the manifest's most likely collision point. It will load; it may clash — a **warning / collision recommendation**, not an error. Recommend `acme-greet-search` or equivalent.
5. **Tool `acme_greet_hi` / Command `acme-greet-hi`** — Both carry the full plugin prefix; underscore-vs-hyphen matches the observed per-surface style. No error observed.
6. **Skill name `greet`** — Skill names are user-visible and share a catalog namespace. `greet` alone is very generic; prefixing (`acme-greet`) recommended but not an error on the evidence available; uniqueness unverified → **needs registry context**.
7. **Skill provider `acme-greet-filesystem`** — Prefixed correctly. The `filesystem` tail overlaps the name of a core capability (filesystem/fs), raising a semantic-overlap question resolvable only against core/registry context; no syntax or compatibility error observable.
8. **Event `web-search/ready`** — The only contribution neither derived from nor prefixed by `acme/greet`. A slashed, domain-generic event key like this is characteristically a **shared channel** name (multiple plugins emitting/listening on one domain event) — informational. If instead it is meant as this plugin's private event, the missing prefix makes it a collision risk with any other plugin's `web-search/ready`. Distinguishing "intended shared channel" from "forgotten prefix" requires author intent/registry context → **unknown which**, collision risk stated.
9. **Settings namespace `acme-greet`** — Prefixed and consistent with loader id; matches the compile-time settings-namespace grammar cited in the skill's alpha.2 reference (`SettingsNamespaceInput`: lowercase letter start, `[a-z0-9-]` body). No error observed.
10. **Route `/api/plugins/acme-greet/hi` (exact)** — Correctly under the `/api/plugins/<loader-id>` prefix implied by the manifest's own coordinates. No error observable statically; host-reserved `/api/` segments not checkable here.

## Explicit unknown / not-checked statements (restraint)

- **No registry claim**: no npm or plugin-registry query was performed. I do **not** claim that `dsh-greet`, `acme/greet`, `greet`, `acme-greet-filesystem`, or any other name is "reserved", "globally available", or "free". Every uniqueness question above is **unknown / not checked**.
- The dsh-community-standard's exact naming grammar and reserved-word list were not readable in this closed-book fixture; grammar statements are limited to what the fixture and the plugin-upgrade skill's local reference cards state.
- Internal consistency (all `acme`-derived names agree) is the only cross-check performed; it is static and local.
- "pre-existing" baseline: not collected — Mode A read-only inspection, no build or migration.

## Bottom line

- **Compatibility errors: none found** on any surface — restraint applies: absence of a findable error offline is not proof of global availability.
- **Collision recommendations (warnings):** service `search` (unprefixed, flat namespace), skill name `greet` (generic), package name `dsh-greet` (globally unique npm coordinate), event `web-search/ready` (generic shared-looking channel; confirm intent).
- **Needs registry context:** every uniqueness claim above; publishing should be gated on an actual npm + community-registry query.
- Fixture untouched: `package.json`, `dsh-plugin.naming.json`, `README.md` read only; no writes, installs, or environment creation performed.
