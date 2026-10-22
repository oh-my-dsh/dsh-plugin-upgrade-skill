# S5 · Naming Four-State Judgment — `acme/greet` (`dsh-greet`)

**Mode:** read-only review. **Registry queries performed:** none (offline, no network).
**Fixture read:** `fixture/package.json`, `fixture/dsh-plugin.naming.json`, `fixture/README.md`. **Fixture modified:** no.
**Compiled/built/installed anything:** no. **Rule text consulted:** the declaration itself (`policy: dsh-plugin-naming/v1`, `schemaVersion: 1`) plus baseline naming conventions; the authoritative policy document was not available in this arm, so rule-level statements are marked *unconfirmed* where they rest on that document.

---

## 1. Verdict vocabulary used

| State | Meaning in this report |
| --- | --- |
| **compatibility error** | The declared name demonstrably violates a structural/syntactic naming rule, so the publisher must change it before publishing. Asserted only where the violation is visible inside the manifest itself. |
| **collision recommendation** | Legal and publishable as declared, but the name is weak/unprefixed/generic enough that a clash with another plugin is plausible; a prefix change is *recommended*, not required. Not an error. |
| **needs registry context** | The verdict depends on state that only an online registry / runtime can supply (who owns a namespace, whether a name is taken, whether a channel or route already exists). No verdict on availability is given. |
| **unknown** | Not determinable from the available material at all (e.g. declaration-vs-implementation drift with no source present; policy revision support). Explicitly *not checked*, not "clean". |

## 2. Surface-by-surface judgment

| # | Surface | Declared value | Verdict | Reasoning |
| --- | --- | --- | --- | --- |
| 1 | Plugin short name | `greet` | **collision recommendation** (registry sub-state: needs registry context) | `greet` is a well-formed lowercase single-token name; nothing in the manifest makes it illegal, so calling it a compatibility error would be an over-read. It is, however, a generic dictionary word with no namespace prefix, so co-installation with another plugin that also calls itself `greet` is the realistic risk. Recommendation only. Whether `greet` is already taken is **not checked**. |
| 2 | Coordinate | `acme/greet` | **needs registry context** | Syntax is a normal `namespace/name` pair and matches the `plugin` block. The substantive question is whether the `acme` namespace belongs to this publisher — that is registry state and was not queried. Sub-state of the coordinate's *shape*: no compatibility error. |
| 3 | Package name | `dsh-greet` | **needs registry context** (shape: consistent) | Matches `package.json#name` exactly, so no internal mismatch. Whether the registry convention expects the namespace inside the package name (e.g. `dsh-<namespace>-<name>`) is *unconfirmed*; if it does, this becomes a recommendation, not a proven error. Availability of the package name: **unknown / not checked**. |
| 4 | Loader id | `acme-greet` | **collision recommendation** (shape: conforming) | Correctly derived from namespace + name, and it is the same token reused for settings and for the route prefix, which is the consistent form. Loader-id uniqueness is an install-time/registry property — **not checked**. |
| 5 | Service name | `search` | **collision recommendation** (warning, not an error) | Unprefixed, generic, and inconsistent with every sibling surface in this manifest (tools, commands, skill providers, settings are all `acme…`-prefixed). A service called `search` is the single most likely name to already exist in a host that ships search. It is still syntactically valid, so: warning + recommendation to namespace it (e.g. `acme-greet-search`). Whether a host/built-in `search` service exists: **needs registry context / not checked**. |
| 6 | Tool | `acme_greet_hi` | **no compatibility error** | snake_case, starts with a letter, underscore-separated, namespace-prefixed — the conventional tool form. Tool-name collisions with other installed plugins remain possible but are runtime/registry state (**not checked**). |
| 7 | Command | `acme-greet-hi` | **no compatibility error** | kebab-case, namespace-prefixed, matches the `acme-greet` loader token. Command-key collisions: registry/runtime state, **not checked**. |
| 8 | Skill name | `greet` | **collision recommendation** (uniqueness: needs registry context) | Same defect class as #1 and #5: fine as a string, but a bare generic skill name is the most collision-prone thing a plugin can ship, and it contradicts the plugin's own prefixing discipline. Recommend `acme-greet`. Whether a skill `greet` is already registered: **not checked**. |
| 9 | Skill provider | `acme-greet-filesystem` | **no compatibility error** | Prefixed with the loader token and suffixed with the provider kind — consistent, unambiguous. |
| 10 | Event | `web-search/ready` | **needs registry context (informational — shared channel)** | The channel segment `web-search` is *not* this plugin's namespace; the plugin is attaching to a channel owned by another domain (or a host feature). On its own that is not an error — shared channels are a normal integration pattern — but the name carries no indication that the publisher controls the channel, the payload contract, or its emission timing. Treat as shared/informational: confirm ownership + payload/compat contract against the registry before relying on it. Whether that channel exists at all, and with what contract: **unknown / not checked**. |
| 11 | Settings namespace | `acme-greet` | **no compatibility error** | Identical to the loader id — correct and consistent. |
| 12 | Route | `exact` `/api/plugins/acme-greet/hi` | **needs registry context** (shape: conforming) | Path sits under `/api/plugins/<loader-id>/`, i.e. already namespaced by the loader id, and `kind: exact` is the least ambiguous matcher. Path collision with another plugin's route, or with a reserved prefix, is registry/runtime state — **not checked**. |
| 13 | Policy declaration | `policy: dsh-plugin-naming/v1`, `schemaVersion: 1` | **unknown** | Self-consistent pair, but whether the current toolchain still accepts `v1` (or expects a later revision/shape) is *unconfirmed* — no policy document or validator was available offline. |
| 14 | Declaration ↔ implementation | (no source present) | **unknown** | The fixture contains only `package.json`, the naming manifest, and a README. Nothing proves that the shipped code registers exactly these names; drift in either direction is undetectable here. |

## 3. Internal-consistency checks (all pass, cross-surface)

- `plugin.namespace` + `plugin.name` = `acme` + `greet` → coordinate `acme/greet` ✔, loader id `acme-greet` ✔, settings namespace `acme-greet` ✔, route prefix `/api/plugins/acme-greet/` ✔ — one token reused consistently instead of four near-misses.
- `plugin.packageName` =`dsh-greet` = `package.json#name` ✔ (no packaging mismatch on the name field).
- Prefixed surfaces: tool `acme_greet_`, command `acme-greet-`, skill provider `acme-greet-` ✔.
- **The two exceptions to that discipline are exactly surfaces #5 (`search`) and #8 (`greet`)**, which is why they are flagged and nothing else is. The inconsistency is internal and provable from the manifest alone; it is still only a *recommendation*, because unprefixed names are not syntactic violations at the plugin-name level.

## 4. What this report deliberately does **not** claim

- **Not** "the name is reserved", "the namespace `acme` is held by this publisher", "no other plugin uses `greet` / `search` / `acme-greet`", "the package name is available", "the route/channel is free". No registry was queried, so none of those statements is supportable.
- **Not** "no compatibility errors ⇒ publishable". Zero errors in the *structural* column + two weak names + one foreign channel + several unknowns is not a green light; it is an incomplete check.
- **Not** "unknown = fine". Every unknown above is a *gap*, and gaps in this task are the majority of the interesting surface area (availability of ~6 names, one channel contract, one route, one policy revision, all of implementation drift).

## 5. Honest summary

| State | Count | Surfaces |
| --- | --- | --- |
| compatibility error | **0** | — (nothing in the manifest is a provable structural violation) |
| collision recommendation | **3** | plugin name `greet`, service `search` (warning), skill `greet` |
| needs registry context | **5** | coordinate `acme/greet` (namespace ownership), package name `dsh-greet` (availability/convention), event `web-search/ready` (shared channel, contract), route (path collision), loader id / tool / command uniqueness |
| unknown | **2** | policy `v1` acceptance, declaration↔implementation drift |

**Bottom line for the publisher:** the manifest is *structurally coherent* — it should not be blocked on a naming-syntax error — but it is **not cleared**. Three names are unprefixed/generic and worth renaming before publication (`search` and `greet` are the ones most likely to bite), the `web-search/ready` subscription needs the channel owner's contract confirmed, and every availability/ownership question is **unverified**, because no registry query was made in this read-only, offline pass.

## 6. Out-of-scope observation (not a naming verdict)

`package.json` carries `"private": true`. The fixture README states this is deliberate "test material, do not publish" discipline and not part of the brief, so it is not scored as a naming verdict — but as a *packaging* fact it would block an actual `npm publish` unchanged. Recorded so the observation is not silently lost; no action recommended inside this task.

## 7. Reproducibility of this review

- Inputs: the three fixture files above (byte-for-byte untouched; no writes attempted outside `agent-output/S5-negative-naming/`).
- Method: static reading + cross-field consistency comparison. No install, no build, no execution of plugin code, no network, no registry.
- Any verdict above that depends on external state is labelled rather than guessed; the correct follow-up is one authenticated registry query per name (namespace `acme`, package `dsh-greet`, service `search`, skill `greet`, loader id `acme-greet`, route path, event channel `web-search/ready`).
