# Naming Four-State Judgment · `dsh-greet` (`acme/greet`)

- **Date**: 2026-09-15
- **Mode**: Read-only inspection (plugin-upgrade skill, Mode A · inspect). No file under `fixture/` was modified; no reproduction environment was built; no dependencies were installed; no network or registry query was performed.
- **Evidence examined (local, read-only)**:
  - `fixture/package.json` — `name: "dsh-greet"`, `version: 0.1.0`, `private: true`
  - `fixture/dsh-plugin.naming.json` — schemaVersion 1, policy `dsh-plugin-naming/v1`, plugin `acme/greet`, plus the `names` block judged below
  - `fixture/README.md` — fixture manifest notes
  - Workspace skill references: `references/pre-flight.md`, `references/pre-flight-patterns.json`, `references/v0.1.1-rc.1.md` (R1-09 service renames), `references/v0.1.2-alpha.2.md` (API ledger), `references/v0.1.2-alpha.4.md` (base-bundle `web_search`), `references/v0.1.5-alpha.1.md` / `v0.1.5-alpha.2.md` (host event-name examples), `references/api-migration-0.1.2-alpha.2.md` (`<domain>/<reason>` code grammar, settings-namespace grammar)

## Scope limit that shapes every verdict below

The normative text of policy `dsh-plugin-naming/v1` is **not present in the workspace** (the community standard it belongs to is an external resource, off-limits under this closed-book brief). All grammar/semantics statements below are therefore read off the field names themselves and cross-checked against conventions observable in the skill's version cards. Nothing was verifiable against the policy text, and nothing was verifiable against an online registry, the npm index, or a running DSH host. Per the brief: **an absence of local findings is not evidence of publishability**, and no claim of "reserved" or "globally available" is made anywhere in this report.

## Verdict summary

Legend (four states, per brief): **compatibility error** / **collision recommendation** / **needs registry context** / **unknown**.

| # | Surface | Declared value | Primary verdict | Severity / note |
|---|---|---|---|---|
| 1 | Package name (`package.json` `name`, `packageName`) | `dsh-greet` | needs registry context | Properly prefixed; availability on the target registry **not checked** |
| 2 | Plugin namespace + coordinate | `acme` / `acme/greet` | needs registry context | Scope/namespace ownership on the target registry **not checked** |
| 3 | Plugin short name (`pluginNames`) | `greet` | collision recommendation | Advisory only. No compatibility error; generic word, so publish under the prefixed forms |
| 4 | Loader id (`loaderIds`) | `acme-greet` | needs registry context | Consistent with the coordinate; uniqueness across installed plugins **not checked** |
| 5 | Service name (`services`) | `search` | collision recommendation | **Warning, not an error.** Unprefixed generic word in a flat, string-keyed service namespace |
| 6 | Tool id (`tools`) | `acme_greet_hi` | needs registry context | Prefixed; no local defect |
| 7 | Command id (`commands`) | `acme-greet-hi` | needs registry context | Prefixed; no local defect |
| 8 | Skill name (`skills`) | `greet` | collision recommendation | Conditional — same generic-word concern as #3; keying scope **unknown** (see reasoning) |
| 9 | Skill provider id (`skillProviders`) | `acme-greet-filesystem` | needs registry context | Prefixed; no local defect |
| 10 | Event channel (`events`) | `web-search/ready` | needs registry context | Shared channel, **informational**. Grammar-conformant, but the `web-search` domain is not owned by this plugin |
| 11 | Settings namespace (`settingsNamespaces`) | `acme-greet` | needs registry context | Prefixed; grammar-consistent with the alpha.2 settings-namespace card |
| 12 | HTTP route (`routes`) | `exact /api/plugins/acme-greet/hi` | needs registry context | Namespaced by loader id; runtime routing-table collision **not checked** |

**No surface received a "compatibility error" verdict.** That is a statement about local evidence only.

## Per-surface reasoning

### 1–2 · Package name `dsh-greet`, namespace/coordinate `acme` / `acme/greet` — needs registry context

The package name is prefixed with the `dsh-` convention and matches the coordinate's dash form (`acme/greet` → `acme-greet`); `package.json` `name` and `naming.json` `packageName` agree. Internally consistent — no error. Whether `dsh-greet`, the `acme` scope/namespace, or the coordinate `acme/greet` is free, taken, or reserved on the intended registry is **unknown**: no online query was permitted or performed. No claim is made either way.

Side observation, factual only: `package.json` carries `"private": true`. Per the fixture README this is the repository's "test material, do not publish" discipline, so it is **not** counted as a finding against the plugin; it is recorded only so the reader knows the file as-is would not publish to npm.

### 3 · Plugin short name `greet` — collision recommendation (advisory, not an error)

`greet` is a maximally generic dictionary word. Locally, nothing marks it invalid — the fixture manifest itself describes the official short name as valid, and the version cards show plugins are identified by namespaced coordinates (`acme/greet`, loader `acme-greet`, package `dsh-greet`) while short names stay bare. Verdict: **no compatibility error**. The risk is registry-level name crowding: other community plugins plausibly named `greet` cannot be ruled out or confirmed without the registry, so the only defensible statement is a recommendation — use `greet` as the in-plugin short name and do identification/publication through `acme/greet` / `dsh-greet`. Whether an actual collision exists: **unknown**.

### 4 · Loader id `acme-greet` — needs registry context

Dash-joined form of the coordinate; consistent. Loader ids are keyed within a host process (duplicate loader entries are a documented failure class in the skill's troubleshooting material), so a collision would come from another installed plugin using the same id — not checkable offline. **Unknown** whether `acme-greet` is unique in any target environment; the prefix makes an accidental collision unlikely, which is a likelihood judgment, not a verification.

### 5 · Service name `search` — collision recommendation (warning, not an error)

This is the sharpest naming concern in the declaration. DSH service identifiers are flat, string-keyed inject names — the version cards show host services as bare words (`httpServer`→`webServer`, `tasks`→`jobs`, `onTaskDone`→`onJobDone`, card DSH-0.1.1-R1-09). A community plugin registering the bare word `search` sits in the same flat namespace as host and third-party services, and "search" is exactly the kind of word other components plausibly use. Verdict: **collision recommendation** — recommend a namespaced service id (e.g. `acme-greet.search` or `acme-greet-search`), matching the pattern the plugin itself already applies to its tools, commands, and loader id.

Restraint markers: this is a **warning, not a compatibility error** — no local evidence shows unprefixed service names are rejected, and no local evidence shows a service actually named `search` exists in the host or in any other plugin. The existence question is **unknown / needs registry context**; only the defensive recommendation is asserted.

### 6–7 · Tool `acme_greet_hi`, command `acme-greet-hi` — needs registry context

Both carry the full `acme-greet` prefix (underscore grammar for the tool, dash grammar for the command — internally consistent, matching the two grammars visible in DSH tool/command naming). No local defect. Global keying/uniqueness across the host tool and command registries not verified: **unknown**, expected unproblematic.

### 8 · Skill name `greet` — collision recommendation (conditional) + unknown component

Same generic word as the plugin short name. What I could **not** determine locally is the keying scope: whether skill names are namespaced under their plugin/provider or keyed globally. That scope question is **unknown** — the policy text that would answer it is not in the workspace. If skills are plugin-scoped, `greet` is fine (same class as surface #3); if globally keyed, it is the same exposure as service `search`. Verdict given under uncertainty: advisory **collision recommendation** (a prefixed id such as `acme-greet-greet`, or reliance on the `acme-greet-filesystem` provider scoping, would be safe under either keying), explicitly conditioned on the unverified scope.

### 9 · Skill provider id `acme-greet-filesystem` — needs registry context

Fully prefixed. No local defect. Note for completeness only: the trailing word `filesystem` evokes host built-in tool vocabulary, but the `acme-greet-` prefix namespaces it; no error is implied. Uniqueness not checked.

### 10 · Event channel `web-search/ready` — needs registry context (shared channel; informational)

Two grounded observations, one restrained conclusion:

- Grammar: `<domain>/<state>` matches the slash convention DSH itself uses for namespaced channels — host session events like `goal/activation-changed`, `deliverables/presented`, `subagent/catalog` (v0.1.5 cards) and `RemoteError` codes `<domain>/<reason>` (alpha.2 ledger). The declaration is convention-conformant; **no compatibility error** on local evidence.
- Domain ownership: `web-search` is a domain the host ecosystem already occupies — the base bundle's `tool-web` ships a `web_search` tool (card in v0.1.2-alpha.4). This plugin therefore does not own the `web-search` domain, and a channel in it is a **shared channel**: if the host or another community plugin emits a literally-named `web-search/ready`, cross-talk (or intended interop) is possible.
- Conclusion: whether `web-search/ready` already exists as a channel, and who else produces or consumes it, is **not checkable offline** — verdict **needs registry context**. If the channel is meant to be private to this plugin, the safe form is a namespaced domain (e.g. `acme-greet/ready`); if it is deliberately an interop point with the web-search ecosystem, the name is appropriate but the contract is unverified. Reported as informational; severity not raised beyond that, because nothing local evidences a conflict.

### 11 · Settings namespace `acme-greet` — needs registry context

Prefixed and dash-grammar conforming; the alpha.2 ledger shows settings namespaces are grammar-conforming string literals (`'my-plugin'` style), which `acme-greet` matches. No local defect; cross-plugin namespace uniqueness not checked (**unknown**).

### 12 · Route `/api/plugins/acme-greet/hi` (exact) — needs registry context

Host API routes observed in the references are flat (`/api/agentPreset.list`, `/api/file`); this declaration instead sits under a `/api/plugins/<loaderId>/` path prefix, i.e. it is namespaced by the loader id rather than squatting on the flat host API namespace. No local evidence of error. Whether the host reserves or routers anything under `/api/plugins/...`, and whether any other plugin would mount the identical exact path in a shared process, is **unknown** — a live-host routing check would answer it and was not performed.

## Cross-surface consistency checks (verified locally)

- `package.json` `name` == `naming.json` `plugin.packageName` (`dsh-greet`) — consistent.
- `namespace` + `name` == `coordinate` (`acme` + `greet` = `acme/greet`) — consistent.
- `coordinate` dash-form == `loaderIds[0]` (`acme-greet`) — consistent.
- `pluginNames[0]` == `plugin.name` (`greet`) — consistent.
- Prefix discipline is applied on loader id, tool, command, skill provider, settings namespace, and route path — the two unprefixed generic values (`pluginNames`/`skills` short name `greet`, service `search`) are exactly the surfaces flagged above, plus the shared-domain event.
- schemaVersion / policy fields present; no unknown or malformed fields observed.

## Explicitly not claimed (negative-capability ledger)

1. **Not claimed**: that `dsh-greet`, `acme`, `acme/greet`, or `acme-greet` is reserved, free, or globally available on npm or on any DSH plugin registry. No online query was made; these are unknown.
2. **Not claimed**: that a service named `search` actually exists in the DSH host or in any third-party plugin. Only the defensive recommendation is asserted; the collision itself is unverified.
3. **Not claimed**: that `web-search/ready` is, or is not, an existing host or community event channel.
4. **Not claimed**: any rule from the `dsh-plugin-naming/v1` policy text — that document is not in the workspace; all grammar statements are inferences from field names and cross-referenced version-card conventions, and the keying-scope questions they leave open (skill names, tool/command global uniqueness) are marked unknown.
5. **Not claimed**: that absence of compatibility errors makes the plugin publishable. Registry status, host-runtime collision state, and policy-text conformance all remain unchecked, per brief requirement 2.

## What would resolve the open items (not performed, listed for completeness)

- A registry query for package `dsh-greet` and scope/namespace `acme` availability and any reservation policy.
- The `dsh-plugin-naming/v1` policy text, to confirm the four-state grammar and the keying scope of service/skill/event names.
- A live DSH host enumeration of services, routes, events, and loader ids, to test actual collision state.

## Attestation

`fixture/` was read only; no file, timestamp, or permission under it was changed. No reproduction environment was built and nothing was installed. All writes were confined to this report under `agent-output/S5-negative-naming/`.
