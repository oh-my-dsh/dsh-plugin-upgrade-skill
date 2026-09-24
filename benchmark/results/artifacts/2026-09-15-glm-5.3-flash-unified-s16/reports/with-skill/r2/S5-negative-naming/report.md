# S5 · Naming Four-State Judgment — `dsh-greet` (`acme/greet`)

Read-only review of `fixture/package.json` and `fixture/dsh-plugin.naming.json`. Nothing under `fixture/` was modified (verified: `git status --porcelain` in the fixture is clean); no reproduction environment was built; no dependencies were installed; no online registry was queried.

Verdict vocabulary (per the brief): **compatibility error / collision recommendation / needs registry context / unknown**. Every claim below is derived only from the two fixture files, their README, and the local `skills/plugin-upgrade/` material. Anything that would require an online registry or a naming-policy document that is not present locally is explicitly marked **not checked**.

## Method and evidence

- Read both fixture JSON files and the fixture README.
- Ran a read-only internal-consistency check of the manifest against its own `plugin` block (namespace `acme`, name `greet`):
  - coordinate `acme/greet` = `namespace/name` — consistent;
  - `loaderIds` / `settingsNamespaces` = `acme-greet` — consistent with each other and with the route prefix;
  - `tools` = `acme_greet_hi`, `commands` = `acme-greet-hi`, `skillProviders` = `acme-greet-filesystem` — all carry the plugin prefix;
  - the **only** surface whose namespace segment is not owned by this plugin is the event `web-search/ready`;
  - the only unprefixed generic names are `greet` (plugin short name, skill) and `search` (service).
- Limitation: the manifest declares `policy: dsh-plugin-naming/v1`, but the policy text itself is **not present in the fixture**, and the normative external standard referenced by the local skill is out of scope for this closed-book review. Conformance judgments below are therefore limited to (a) internal consistency of the manifest and (b) statements in the fixture's own README. All structural conventions I could not confirm locally are marked unconfirmed.

## Per-surface verdicts

| # | Surface | Declared value | Verdict |
|---|---|---|---|
| 1 | npm package name | `dsh-greet` (package.json) | **needs registry context** |
| 2 | Plugin namespace | `acme` | **needs registry context** |
| 3 | Plugin short name | `greet` (`pluginNames`) | no compatibility error; **collision recommendation (mild)** in a shared registry |
| 4 | Plugin coordinate | `acme/greet` | no compatibility error; **needs registry context** for global uniqueness |
| 5 | Loader id | `acme-greet` | no compatibility error; global uniqueness **unknown / not checked** |
| 6 | Service name | `search` | **collision recommendation** (warning, not an error) |
| 7 | Tool name | `acme_greet_hi` | no compatibility error; global uniqueness **unknown / not checked** |
| 8 | Command name | `acme-greet-hi` | no compatibility error; global uniqueness **unknown / not checked** |
| 9 | Skill name | `greet` | no compatibility error; **collision recommendation (mild)**; global uniqueness **unknown** |
| 10 | Skill provider | `acme-greet-filesystem` | no compatibility error; contract intent **unconfirmed** |
| 11 | Event name | `web-search/ready` | **needs registry context** (shared channel — informational, not an error) |
| 12 | Settings namespace | `acme-greet` | no compatibility error; matches loader id; not checked globally |
| 13 | Route | `exact /api/plugins/acme-greet/hi` | no compatibility error; uniqueness inherits loader-id registry context |

### Reasoning per surface

1. **Package name `dsh-greet` — needs registry context.** The name is internally consistent with the manifest (`dsh-` + short name). Whether `dsh-greet` is free on npm, and whether the `dsh-` name space is reserved for first-party packages, cannot be verified without a registry query — **not checked**; I make no claim in either direction. Open question (flagged, not judged): the package name carries no namespace segment while the coordinate does (`acme/greet`); whether the community convention expects `dsh-<namespace>-<name>` is **unconfirmed** from local material. Factual note: `package.json` has `"private": true`, which blocks npm publish as-is; the fixture README states this is the repository's test-material discipline rather than part of the brief, so it is recorded here as an observation only.

2. **Namespace `acme` — needs registry context.** Namespace ownership in any community registry is exactly the kind of fact an offline review cannot establish. `acme` is also the archetypal example/placeholder name, so if this plugin is published under a registry where namespaces are claimed globally, a more distinctive namespace would be advisable — but that is a **recommendation contingent on registry facts I did not check**, not a compatibility error.

3. **Plugin short name `greet` — no compatibility error; mild collision recommendation.** The short name is structurally valid and consistent with the coordinate. It is a maximally generic English word, so if short names are compared globally in the target registry, collision exposure is real; if they are scoped by namespace, `acme/greet` already disambiguates. Which model applies is **unconfirmed** locally — hence recommendation-level only.

4. **Coordinate `acme/greet` — no compatibility error; needs registry context.** Internally consistent with the declared namespace and name. Global uniqueness of the coordinate is a registry fact — **not checked**.

5. **Loader id `acme-greet` — no compatibility error; not checked.** Matches `namespace-name` and is reused consistently by settings namespace and route. Whether any installed plugin or host component already uses this loader id in a given deployment is a runtime fact I did not and could not check in this read-only review.

6. **Service name `search` — collision recommendation (warning, not a compatibility error).** This is the only service entry and it is bare and maximally generic (`search`). Service names live in a table shared across plugins, so a plain `search` is the classic collision candidate — any web-search or code-search plugin in the same host could provide or look up the same key. The restrained judgment: this is a **warning and a rename recommendation** (e.g. qualify it under the plugin identity), **not** a compatibility error — I found no local rule stating that bare service keys are invalid, and I cannot confirm from local material whether service keys are globally flat or per-plugin scoped (that detail is **unconfirmed**), so I do not escalate beyond a recommendation.

7. **Tool name `acme_greet_hi` — no compatibility error; not checked.** Properly prefixed with the plugin identity; consistent separator style (`_`). Global uniqueness across a tool registry was not checked.

8. **Command name `acme-greet-hi` — no compatibility error; not checked.** Same reasoning as tools, with `-` separators consistent with the loader id.

9. **Skill name `greet` — no compatibility error; mild collision recommendation; global uniqueness unknown.** Same generic-word exposure as surface 3. Whether skill names are runtime-namespaced by their owning plugin or matched globally is **unconfirmed** from the local material, so the honest state is: no local error, recommendation to consider `acme-greet`-style qualification, global uniqueness **not checked**.

10. **Skill provider `acme-greet-filesystem` — no compatibility error; contract intent unconfirmed.** The id is correctly prefixed with the loader id, so it does not collide with the host's own provider ids as far as the local material shows. One flag, informational only: the `-filesystem` suffix borrows the vocabulary of the host filesystem provider plane, and whether this provider is meant to attach to a well-known provider contract (the local skill's API ledger shows providers attach via an owner-scoped lifecycle, e.g. settings `installSection(owner, …)`) cannot be confirmed from the manifest alone — **unconfirmed**, no action recommended beyond confirming the intended contract before publication.

11. **Event `web-search/ready` — needs registry context (shared channel; informational).** This is the one surface whose namespace segment (`web-search`) is **not owned by this plugin** (`acme`). Read as a channel name, the plugin is listening on / emitting into someone else's namespace. The restrained judgment: this is **not** a compatibility error and **not** automatically a collision to fix — it is cross-plugin integration. It becomes correct or incorrect only with context this review cannot obtain offline: who owns the `web-search` channel, whether it is an official shared channel, and what the `ready` payload contract is. All three are **not checked / needs registry context**; I explicitly do not claim the channel is reserved by anyone, nor that it is free.

12. **Settings namespace `acme-greet` — no compatibility error.** Identical to the loader id, which is the self-consistent choice. Uniqueness was not checked globally.

13. **Route `/api/plugins/acme-greet/hi` (exact) — no compatibility error.** The path embeds the plugin's own loader id inside the host-owned `/api/plugins/` prefix, so route containment follows the plugin identity; two plugins can only collide here if their loader ids collide, which reduces to surface 5 (**not checked**).

## Summary

- **Compatibility errors found: 0.** Nothing in the manifest is structurally broken by local evidence, and I explicitly decline to manufacture errors from genericness alone.
- **Collision recommendations: 1 clear (service `search`)**, plus soft generic-word notes on `greet` (short name, skill) and, contingently, the `acme` namespace and package name — each contingent on registry facts not verified here.
- **Needs registry context: npm package availability, namespace ownership, event-channel (`web-search`) ownership/contract.**
- **Unknown / not checked (honest negatives):** any global uniqueness claim for loader id, tool, command, skill, settings namespace, or route; whether service/skill names are namespaced at runtime; the full `dsh-plugin-naming/v1` policy text; the external community standard. **No online registry was queried in this review; accordingly this report makes no "reserved" and no "globally available/free" claim about any name.** Absence of a compatibility-error finding above must not be read as a guarantee of availability.
