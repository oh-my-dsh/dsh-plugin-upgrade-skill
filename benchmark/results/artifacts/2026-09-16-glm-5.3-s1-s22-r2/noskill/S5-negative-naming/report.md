# S5 · Naming Four-State Judgment Report (Read-Only)

## Scope and evidence

- Evidence (read-only, unchanged): fixture `package.json`, fixture `dsh-plugin.naming.json`, fixture `README.md`.
- Closed-book: no online registry, no npm/DSH registry query was performed. Therefore **no "reserved" or "globally available" claim is made anywhere in this report**. Registry-dependent facts are reported as **unknown / not checked**.
- No reproduction environment was built; no file inside the fixture or the benchmark repository was modified.

The manifest declares: plugin coordinate `acme/greet`, package `dsh-greet@0.1.0` (private), plus service/tool/command/skill/event/settings/route surfaces.

Judgment vocabulary (four states): **compatibility error** (violates a stated format rule), **collision recommendation** (format-valid but collision-prone; rename or prefix advised), **needs registry context** (cannot be judged without registry data — informational/unknown), **unknown** (not checked / insufficient evidence).

## Per-surface verdicts

| Surface | Declared value | Verdict | Reasoning |
|---|---|---|---|
| Plugin name | `greet` (official short name) | **No compatibility error** | `greet` is a plain lowercase alphanumerical short name; nothing in the manifest or naming policy text available in the fixture marks it invalid. Whether the bare short name is *taken* by another plugin is registry-dependent → registry status unknown. |
| Plugin coordinate | `acme/greet` | **No compatibility error** | `namespace/name` form with a namespace; structurally well-formed. Namespace ownership is a registry question — unknown/not checked. |
| packageName | `dsh-greet` | **Needs registry context** | Format-valid `dsh-*` package name, but `private: true` and the fixture README note this is test material not intended for publishing. npm-name availability is unknown without a registry query. |
| loaderIds | `acme-greet` | **No error; collision risk low but unverified** | Namespaced-id-derived loader id; format-valid. Uniqueness in any loader context is unknown. |
| services | `search` (unprefixed) | **Collision recommendation** | A bare generic word like `search` is format-valid (warning, not an error per the fixture's own annotation) but highly collision-prone across plugins and confusable with existing web/search capabilities. Recommend renaming to a prefixed id, e.g. `acme/greet-search` or `acme-greet/search`. |
| tools | `acme_greet_hi` | **No compatibility error** | Namespaced with `acme_greet_` prefix; format-valid. Collision with other tools is unlikely given the prefix but unverified. |
| commands | `acme-greet-hi` | **No compatibility error** | Namespaced kebab-case; format-valid. Uniqueness unknown. |
| skills | `greet` | **Collision recommendation** | Bare generic short name in the shared skill catalog; collision-prone and ambiguous in `/skill` listings. Recommend a qualified name (e.g. `acme-greet` or `acme/greet`). |
| skillProviders | `acme-greet-filesystem` | **No compatibility error** | Namespaced; format-valid. Provider-id registry uniqueness unknown. |
| events | `web-search/ready` | **Needs registry context (informational)** | Emitted under a namespace this plugin does not own (`web-search` reads as a shared/foreign channel). This is not a format error; it is a shared-channel event name. Whether the plugin is *entitled* to emit on that channel depends on the registry/event catalog, which was not queried → unknown. Recommend emitting under the plugin's own namespace unless ownership is confirmed. |
| settingsNamespaces | `acme-greet` | **No compatibility error** | Prefixed and consistent with the coordinate; format-valid. |
| routes | `/api/plugins/acme-greet/hi` (exact) | **No compatibility error** | Scoped under `/api/plugins/acme-greet/`; low collision risk by construction. Cross-plugin route registry not checked. |

## Negative-capability statement (no findings ≠ no problems)

- **Registry status: unknown.** No online or local registry query was performed (closed-book brief, no external services). I therefore make **no** claim that any of `greet`, `acme/greet`, `dsh-greet`, or any other declared name is "reserved", "available", "globally unique", or "safe to publish". All uniqueness/ownership facts are **not checked**.
- The absence of compatibility errors above means only "no rule violation is derivable from the fixture alone". It does **not** mean the names are free to take.
- Additional unknowns: whether `acme` namespace is registered to this author; whether `web-search/ready` is an existing shared event channel; whether the DSH plugin registry enforces coordinate/packageName binding. All unknown/not checked.

## Consolidated action advice (pre-publish, when a registry becomes available)

1. Rename service `search` → prefixed id (collision recommendation).
2. Qualify skill `greet` → `acme-greet` (collision recommendation).
3. Verify ownership of the `web-search` event namespace before emitting `web-search/ready`; otherwise emit `acme-greet/ready` (needs registry context).
4. Query the registry for `acme/greet`, `dsh-greet`, and namespace `acme` before publishing (currently unknown).
5. Remove `private: true` only as part of a real publish decision — out of scope for this read-only judgment.

## Fixture integrity

Fixture files were only read; nothing under the fixture directory or the benchmark repository was created, modified, deleted, or renamed.
