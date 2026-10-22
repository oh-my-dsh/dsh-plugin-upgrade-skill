---
kind: dsh-version-jump-card-set
schema: 1
from: dsh-v0.1.5-rc.2
to: dsh-v0.1.7-rc.1
status: draft
coverage: curated
cardCount: 34
idPrefix: DSH-0.1.7-J1
verifiedAt: 2026-09-23
---

# Change cards · 0.1.5-rc.2 → 0.1.7-rc.1

> This file is a curated list of plugin-relevant changes, not a complete API diff.
>
> Upstream comparison: [dsh-v0.1.5-rc.2...dsh-v0.1.7-rc.1](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.1.5-rc.2...dsh-v0.1.7-rc.1)
> · Release notes: [dsh-v0.1.7-rc.1](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.7-rc.1)
> · Tags: `dsh-v0.1.5-rc.2` = `fb2c4b9e698e30edb738bca4cf0618587db7d203`, `dsh-v0.1.7-rc.1` = `46a7f68b0922371ce7144b668b90e377d8e799f4`
> · Card format: see [references/README.md](README.md)
> · Touchpoint numbering: see [pre-flight.md](pre-flight.md)
>
> **This is a version-jump edge.** It spans `0.1.5-rc.2 → 0.1.6-alpha.1 → 0.1.6-alpha.2 →
> 0.1.7-alpha.1 → 0.1.7-alpha.2 → 0.1.7-rc.1` (~3300 commits, ~7900 changed files, only 346 of
> them `package.json`). It records the **net** state change from 0.1.5-rc.2 to 0.1.7-rc.1. The
> intermediate `0.1.5-rc.2 → 0.1.6-alpha.1`, `0.1.6-alpha.1 → 0.1.6-alpha.2` and
> `0.1.6-alpha.2 → 0.1.7-alpha.1/alpha.2` edges were still in open pull requests when this file
> was written; this edge is the jump view for a deployment that never stopped on the alphas. Do not
> read it as a per-edge ledger of the intermediate corridors.
>
> Per-edge cards: [v0.1.6-alpha.1.md](v0.1.6-alpha.1.md), `v0.1.6-alpha.2.md` (edge
> `dsh-v0.1.6-alpha.1 → dsh-v0.1.6-alpha.2`), [v0.1.7-alpha.1.md](v0.1.7-alpha.1.md),
> [v0.1.7-alpha.2.md](v0.1.7-alpha.2.md) and [v0.1.7-rc.1.md](v0.1.7-rc.1.md). Card IDs here use the
> `DSH-0.1.7-J1` prefix so they never collide with the rc.1 edge's `DSH-0.1.7-RC1` cards. This file
> is schema-validated as `kind: dsh-version-jump-card-set` but is not a corridor edge:
> `plan-migration.mjs` builds corridors only from the per-edge `v*.md` files.

## Contents

- DSH-0.1.7-J1-01 · breaking: DSH peer compatibility is enforced at install **and** startup
- DSH-0.1.7-J1-02 · breaking: the PTC runtime is renamed (`codeRuntime` → `ptcRuntime`) and the Node engine moves to a separate process
- DSH-0.1.7-J1-03 · breaking: agent presets become declarative profile YAML (`dsh-agent-presets` is split and removed)
- DSH-0.1.7-J1-04 · breaking: settings move into the profile plugin Config; `ctx.settings.register` is gone
- DSH-0.1.7-J1-05 · breaking: Session log V4, the `session-format-v3-to-v4` migration, and attachment-carrier narrowing
- DSH-0.1.7-J1-06 · breaking: Remote gains duplex/binary transfer and workspace reads move to `readBytes`
- DSH-0.1.7-J1-07 · breaking: the Agent lifecycle is async — `agent/session-start` is removed and `agent/created` gains `source`
- DSH-0.1.7-J1-08 · breaking: the LLM `Message` is a role union and `createSystemMessage` loses its `plugin` argument
- DSH-0.1.7-J1-09 · breaking: the official DeepSeek adapter is Messages-only (base URL moves to `/anthropic`)
- DSH-0.1.7-J1-10 · breaking: the subagent runtime requires a Config, changes `listChildren`, and defaults delegation depth to 1
- DSH-0.1.7-J1-11 · breaking: the E2B providers are removed; the POSIX SSH provider family replaces them
- DSH-0.1.7-J1-12 · behavior: Ralph is disabled in the shipped defaults
- DSH-0.1.7-J1-13 · breaking: `spill-policy` becomes token-budgeted (`maxInlineBytes` → `maxInlineTokens`)
- DSH-0.1.7-J1-14 · breaking: `tool-cordis` is narrowed to read-only inspection
- DSH-0.1.7-J1-15 · breaking: the bundle manifest takes ordered patch lists and drops several `dsh.*` fields
- DSH-0.1.7-J1-16 · breaking: package rename ledger for the whole corridor
- DSH-0.1.7-J1-17 · capability: new CLI/Headless surfaces (config schema dump, profile shorthand, stdin/`--session-id`/`--json`)
- DSH-0.1.7-J1-18 · breaking: Agent Team becomes one bundle and the old subagent creation tools are off inside it
- DSH-0.1.7-J1-19 · capability: experimental speech-to-text and browser/computer-use registries
- DSH-0.1.7-J1-20 · capability: the bundled LibreOffice runtime and the packaged-app Node requirement
- DSH-0.1.7-J1-21 · capability: MCP resources, URI templates and tool pagination
- DSH-0.1.7-J1-22 · privacy: the DeepSeek session-log upload now defaults to on
- DSH-0.1.7-J1-23 · breaking: `tool.call.toolview` gains a `preparing` phase
- DSH-0.1.7-J1-24 · breaking: the chat-node hook context is reshaped and `turnTail` becomes a list
- DSH-0.1.7-J1-25 · breaking: the transcript mode becomes a presentation policy channel
- DSH-0.1.7-J1-26 · breaking: product icons rename from pixel suffixes to weight names
- DSH-0.1.7-J1-27 · breaking: the client settings transport renames `settingsScope` → `configForms`
- DSH-0.1.7-J1-28 · breaking: the right-sidebar tab contract (retained tabs, guide entries, placement)
- DSH-0.1.7-J1-29 · capability: the new sidebar surfaces ship as packages
- DSH-0.1.7-J1-30 · capability: component factories in the slot system
- DSH-0.1.7-J1-31 · capability: the plugin-manager page, its slots and the `pluginManager` Remote
- DSH-0.1.7-J1-32 · breaking: `ModelDirectory.select` returns a `RemoteResult`
- DSH-0.1.7-J1-33 · breaking: session-row actions become slot lists and `WorkspaceBrowserInjected` changes
- DSH-0.1.7-J1-34 · capability: two new settings-page seats — `settings.launcher` and `settings.models.sign-in`

---

### DSH-0.1.7-J1-01 · DSH peer compatibility is enforced at install and startup

- **Type**: breaking
- **Applies to**: every plugin whose `package.json` declares `@deepseek-ai/dsh` or any
  `@deepseek-ai/dsh-*` package under `peerDependencies`, and every profile that installs one. Also
  the Web plugin page and `dsh plugin` CLI.
- **Touchpoints**: #1 for the manifest contract; #7 for the install path.
- **Action level**: required-if-hit
- **Symptoms**: install is refused before pnpm runs (`ManagementFailure` with
  `code: 'incompatible-version'`, nothing lands in the profile), and a plugin already in the tree is
  **disabled at startup** (`dsh: disabling profile plugin …`), so it is never imported. A native
  `cordis:include` file that reaches an incompatible plugin is denied as a whole. `workspace:^`,
  `workspace:~` and `workspace:*` are read as the running version; an **exact pinned** range such as
  `0.1.7-alpha.2` does **not** satisfy `0.1.7-rc.1`, while a prerelease range on the same tuple
  (`^0.1.7-alpha.2`) does.
- **Migration recipe**: publish peers as a range that admits the target runtime (the classic
  `^0.1.x` / `~0.1.x`, or `workspace:*` for in-repo bundles).
  **Warning — the `^0.1.7` trap:** a floor written at the target tuple does not admit a 0.1.7
  prerelease. `~0.1.7` and `>=0.1.7` refuse `0.1.7-rc.1` under every semver version, and `^0.1.7`
  refuses it too once the host resolves semver ≥ 7.8.3 (app-boot declares `^7.8.5`). Use a floor
  below the target minor (`^0.1.6`, `~0.1.6`) or a prerelease floor (`^0.1.7-0`); fleet pre-checks
  must use semver ≥ 7.8.3 with `{ includePrerelease: true }`. Full matrix and evidence:
  DSH-0.1.7-RC1-01 in [v0.1.7-rc.1.md](v0.1.7-rc.1.md). If a hard mismatch must be accepted
  anyway, grant an exact-version exemption: `dsh plugin --profile <p> allow-version
  <pkg>@<pkgVersion> --dsh-version <exactDshVersion> --accept-risk` (without `--accept-risk` it
  refuses). Exemptions live in a **separate** profile file `compatibility.json`
  (`{ "<pkg>@<ver>": ["<exact dsh version>"] }`) — never in `package.json` or `cordis.patch.yml`.
  `revoke-version` and `version-exemptions` manage the ledger.
- **Verification**: the refused package must not appear under `profiles/<p>/node_modules`; after
  granting, startup stderr contains the plugin's own startup line. A malformed `compatibility.json`
  authorizes nothing but does not stop startup.
- **Source**: [rc.1 `packages/boot/app-boot/src/plugin-compatibility.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/boot/app-boot/src/plugin-compatibility.ts) · [rc.1 `.../src/profile-compatibility.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/boot/app-boot/src/profile-compatibility.ts) · [rc.1 `.../src/compatibility-preflight.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/boot/app-boot/src/compatibility-preflight.ts) · [rc.1 `apps/cli/src/plugin.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/apps/cli/src/plugin.ts)

### DSH-0.1.7-J1-02 · the PTC runtime is renamed and the Node engine moves to a separate process

- **Type**: breaking
- **Applies to**: plugins that inject/read `ctx.codeRuntime`, import
  `@deepseek-ai/dsh-code-runtime` / `@deepseek-ai/dsh-code-runtime-worker-thread`, or import
  `@deepseek-ai/dsh-workflow-worker-thread`.
- **Touchpoints**: #1 for imports and service reads; #7 for subprocess execution.
- **Action level**: required
- **Symptoms**: `ERR_MODULE_NOT_FOUND` for the old package names; `ctx.codeRuntime` is `undefined`;
  `requireCodeRuntime` throws `mode "ptc" requires a PTC runtime`. No alias or compatibility package
  is shipped.
- **Migration recipe**: `@deepseek-ai/dsh-code-runtime` → `@deepseek-ai/dsh-ptc-runtime`;
  `@deepseek-ai/dsh-code-runtime-worker-thread` → `@deepseek-ai/dsh-ptc-runtime-node`
  (`NodePtcRuntime`, now a separate sandboxed process); `@deepseek-ai/dsh-workflow-worker-thread`
  → `@deepseek-ai/dsh-workflow-ptc` (default export `WorkerThreadWorkflowEngine` →
  `PtcWorkflowEngine`); the `experimental-code-runtime-python` package → `experimental-ptc-runtime-python`.
  Service/type vocabulary: `ctx.codeRuntime` → `ctx.ptcRuntime`, `CodeRuntime` → `PtcRuntime`,
  `CodeSdkLanguage` → `PtcSdkLanguage`. The model-facing `run_code` operation and its `code`
  argument keep their names.
- **Verification**: `ctx.get('ptcRuntime')` resolves after loading the Node provider; `grep` your
  plugin for `codeRuntime`, `CodeRuntime`, `CodeSdkLanguage`, `workflow-worker-thread`.
- **Source**: [rc.1 `packages/ptc-runtime/ptc-runtime/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/ptc-runtime/ptc-runtime/src/index.ts) · [rc.1 `packages/ptc-runtime/ptc-runtime-node/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/ptc-runtime/ptc-runtime-node/src/index.ts) · [rc.1 `packages/workflow/workflow-ptc/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/workflow/workflow-ptc/src/index.ts)

### DSH-0.1.7-J1-03 · agent presets become declarative profile YAML (`dsh-agent-presets` is split and removed)

- **Type**: breaking
- **Applies to**: plugins importing `@deepseek-ai/dsh-agent-presets`, `AgentPresets`,
  `AgentPresetSettings`/`SETTINGS_NAMESPACE`/`AgentPresetSettingsSchema`, or calling
  `ctx.agentPresets.copy/remove/compositionInventory/standingKeyFor`; profiles with directory presets.
- **Touchpoints**: #1 for imports; #3 for the `agentPresets` service and its remotes.
- **Action level**: required
- **Symptoms**: the `@deepseek-ai/dsh-agent-presets` package no longer resolves; the removed
  methods/remotes fail at runtime; directory presets are not discovered, and a preset id saved in
  session data that has no matching definition is rejected on restart.
- **Migration recipe**: split into `@deepseek-ai/dsh-agent-preset` (declares one preset as ordinary
  Cordis YAML; `Config = PresetDefinition`) and `@deepseek-ai/dsh-agent-preset-registry`
  (`AgentPresetRegistry`). The service key is still `ctx.agentPresets`. Removed methods: `copy`,
  `remove`, `compositionInventory`, `standingKeyFor`, public `read`; removed remotes `copy`,
  `deletePreset`. New/renamed: `register`, `readDocument`, `select`, `mount`, `recompose`. Saving
  through the Web editor writes the active profile's user patch (not a copied directory); duplicate
  ids are refused. Migrate directory presets to declarations; the shipped Web presets are
  `packages/bundle/web-app/presets/{standard,ptc,minimal,cordis}.patch.yml`.
- **Verification**: mount both packages, `register` a definition, resolve it by id; a saved edit
  lands in `$DSH_HOME/profiles/<profile>/cordis.patch.yml`; a duplicate id is refused.
- **Source**: [rc.1 `packages/preset/agent-preset/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/preset/agent-preset/src/index.ts) · [rc.1 `packages/preset/agent-preset-registry/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/preset/agent-preset-registry/src/index.ts)

### DSH-0.1.7-J1-04 · settings move into the profile plugin Config; `ctx.settings.register` is gone

- **Type**: breaking
- **Applies to**: every plugin that declared a settings namespace with
  `ctx.settings.register(namespace, schema)`, imported a `*SettingsSchema`, or read the old
  `$DSH_HOME/settings.yaml`.
- **Touchpoints**: #1 for the API and type removal; #3 for the settings service.
- **Action level**: required
- **Symptoms**: `ctx.settings.register` no longer exists; a settings page bound to the old
  namespace shows `unavailable`; the values no longer live in `settings.yaml`.
- **Migration recipe**: delete `ctx.settings.register(...)`. Declare a Cordis `Config` on the plugin
  entry and mark each editable field `.volatile()`
  (`export const Config = z.object({ enabled: z.boolean().default(true).volatile() })`), then in
  `apply` run `ctx.inject(['settings'], (child) => child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)))`.
  Values persist per profile in `cordis.patch.yml` under the entry id. The old `$DSH_HOME/settings.yaml`
  is imported **once** at startup and renamed `settings.yaml.imported`. Two shipped package renames:
  `@deepseek-ai/dsh-settings-file` → `@deepseek-ai/dsh-settings` + `@deepseek-ai/dsh-config-editor`,
  and `SettingsController` drops its static `Config` (`(ctx, config, internals)` → `(ctx, internals)`).
- **Verification**: edit the field in the UI and confirm it lands under the entry's `config` in
  `cordis.patch.yml`; clearing it re-inherits the bundle default; deleting the value does not resurrect
  `settings.yaml`.
- **Source**: [rc.1 `packages/settings/settings/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/settings/settings/src/index.ts) · [rc.1 `packages/api/settings-controller/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/api/settings-controller/src/index.ts) · [rc.1 `.agents/notes/implemented/architecture/2026-09-19-profile-owned-live-configuration.md`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/.agents/notes/implemented/architecture/2026-09-19-profile-owned-live-configuration.md)

### DSH-0.1.7-J1-05 · Session log V4, the `session-format-v3-to-v4` migration, and attachment-carrier narrowing

- **Type**: breaking
- **Applies to**: plugins that read raw Session logs, store image/file attachments in **custom**
  (unknown-ignorable) session events, or register message projections.
- **Touchpoints**: #1 for types; #4 for stored data.
- **Action level**: required-if-hit
- **Symptoms**: old V3 logs are converted on read (V0–V3 → V4 via the new
  `@deepseek-ai/dsh-session-format-v3-to-v4` package). Attachments that existed **only** inside a
  custom-event payload are no longer reachable by the built-in attachment readers or the archive
  reader: the readers now select content fields by built-in event type (assistant blocks, direct
  content blocks, flat V4 tool-role messages), so a custom-event carrier is opaque. `Message` also
  gains a first-class `developer` role (`DeveloperMessage`), and `@deepseek-ai/dsh-session` re-exports
  `SessionMessageProjection`/`SessionMessageProjectionContext` for detached readers.
- **Migration recipe**: to keep attachment references readable, use a supported built-in content
  occurrence (or implement your own reader). Register detached readers as `SessionMessageProjection`
  definitions; the first-party list is `currentSessionMessageProjections` in
  `packages/session/session-format-catalog/src/message-projections.ts`. Batch migration is now an
  in-persistence catalog pass (`prepareCatalogFacts`).
- **Verification**: read a V3 fixture and assert the restored session passes relationship validation;
  a session whose attachment lives only in a custom event exports without those bytes.
- **Source**: [rc.1 `packages/session/session-format-v3-to-v4/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/session/session-format-v3-to-v4/src/index.ts) · [rc.1 `packages/session/session-format-catalog/src/message-projections.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/session/session-format-catalog/src/message-projections.ts) · [rc.1 `.agents/notes/implemented/bug-fix/2026-09-19-declared-session-attachment-carriers.md`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/.agents/notes/implemented/bug-fix/2026-09-19-declared-session-attachment-carriers.md)

### DSH-0.1.7-J1-06 · Remote gains duplex/binary transfer and workspace reads move to `readBytes`

- **Type**: breaking
- **Applies to**: authors of `@Remote({ mode: 'stream' })` methods, and plugins calling the
  `workspaceFiles` Remote.
- **Touchpoints**: #3 for Remote; #4 for workspace files.
- **Action level**: required-if-hit
- **Symptoms**: `readAll` and `readRelated` are gone; the old
  `readBytes(scope, path, range, signal)` shape does not match the new `(scope, path, options, signal)`;
  `WorkspaceFileBytes.data` is native bytes (`Uint8Array` on Host, `ArrayBuffer` on the generated
  client), **not** a base64 string.
- **Migration recipe**: `readAll(scope, path, signal)` → `readBytes(scope, path, {}, signal)`;
  `readRelated(scope, path, relative, signal)` → `readBytes(scope, path, { baseFile }, signal)`.
  `WorkspaceByteReadOptions { range?, baseFile? }`. For duplex streams, declare
  `RemoteStream<Out, In>` and read the uplink with `this.ctx.invocation!.uplink<In>()`; the gateway
  config gains `streamInboxBytes` (default `262144`) and new error codes `gateway/uplink-overflow`,
  `gateway/protocol`.
- **Verification**: a full read returns a non-empty `Uint8Array`; a ranged read returns
  `{ offset, data, eof }`; sending past `streamInboxBytes` fails with `gateway/uplink-overflow`.
- **Source**: [rc.1 `packages/api/workspace-files/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/api/workspace-files/src/index.ts) · [rc.1 `packages/api/gateway/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/api/gateway/src/index.ts) · [rc.1 `.agents/notes/implemented/architecture/2026-09-19-remote-duplex-stream.md`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/.agents/notes/implemented/architecture/2026-09-19-remote-duplex-stream.md)

### DSH-0.1.7-J1-07 · the Agent lifecycle is async — `agent/session-start` is removed and `agent/created` gains `source`

- **Type**: breaking
- **Applies to**: plugins subscribing to `agent/session-start` or `agent/created`, and callers of
  `agents.register`/`announce`.
- **Touchpoints**: #1 for the registry signature; #2 for the events.
- **Action level**: required
- **Symptoms**: `agent/session-start` listeners never fire (the event is deleted). `agent/created`
  payload is now `{ agent, source, signal? }` where `source` is
  `'startup' | 'resume' | 'clear' | 'compact'` (`SessionStartSource`), and dispatch is serial: a
  listener that throws or rejects now **rejects creation** instead of only logging. `AgentRegistry.register`
  returns an awaitable Cordis effect disposer.
- **Migration recipe**: delete `agent/session-start` subscriptions and read `source` from
  `agent/created`; make the listener async and non-re-entrant; `await` the `register` disposer before
  using the agent.
- **Verification**: a throwing `agent/created` listener fails `agents.create()`; a recording listener
  sees `'startup'` on create and `'resume'` on resume.
- **Source**: [rc.1 `packages/core/agent/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/core/agent/src/index.ts) · [rc.1 `packages/core/agent/src/runtime-types.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/core/agent/src/runtime-types.ts)

### DSH-0.1.7-J1-08 · the LLM `Message` is a role union and `createSystemMessage` loses its `plugin` argument

- **Type**: breaking
- **Applies to**: plugins importing `Message`, `AssistantProvenance`, `createSystemMessage`, or
  hand-building request messages.
- **Touchpoints**: #1
- **Action level**: required
- **Symptoms**: `interface X extends Message` no longer compiles (`Message` is now
  `MessageRoleMap[keyof MessageRoleMap]` over `MessageBase`); `createSystemMessage(text, plugin)`
  takes one argument; `AssistantProvenance` is renamed; `GenerateOptions.messages` is
  `RequestMessage[]`.
- **Migration recipe**: define concrete messages against `MessageBase` or a specific role interface;
  `createSystemMessage(text)`; add `createDeveloperMessage`/`DeveloperMessage`;
  `AssistantProvenance` → `AssistantProviderMetadata`; `LlmErrorOptions` gains `offloadImages`
  (with `IMAGE_OFFLOAD_REQUIRED`) and models gain `inputModalities`.
- **Verification**: compile a plugin that extends a concrete role and calls `createSystemMessage('x')`.
- **Source**: [rc.1 `packages/llm/llm/src/message.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/llm/llm/src/message.ts) · [rc.1 `packages/llm/llm/src/types.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/llm/llm/src/types.ts)

### DSH-0.1.7-J1-09 · the official DeepSeek adapter is Messages-only (base URL moves to `/anthropic`)

- **Type**: breaking
- **Applies to**: profiles/deployments that set `llm-deepseek.baseURL` or `protocol`, or import
  `MAX_CHAT_IMAGE_BYTES` / `RequestDefaults` / the image-policy helpers.
- **Touchpoints**: #1 for exports; #3 for the provider.
- **Action level**: required-if-hit
- **Symptoms**: a pinned `baseURL: https://api.deepseek.com` now targets the retired Chat-Completions
  endpoint; passing `protocol` throws
  `llm-deepseek: protocol is not configurable; remove it and use a Messages-compatible baseURL`;
  `MAX_CHAT_IMAGE_BYTES` no longer resolves.
- **Migration recipe**: `PUBLIC_BASE_URL` is now `https://api.deepseek.com/anthropic` — update any
  explicit `baseURL`. Remove `protocol` from config/settings. Exports renamed:
  `MAX_CHAT_IMAGE_BYTES` → `MAX_IMAGE_BYTES`; `resolveRequestImagePolicy`/`DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET`
  → `resolveRequestImageTarget`/`resolveRequestImageMaxBytes`/`REQUEST_IMAGE_MAX_DIMENSION`;
  `RequestDefaults` now comes from `./types.ts`.
- **Verification**: run against `https://api.deepseek.com/anthropic`; `resolveAdapterOptions({ protocol: 'x' })`
  throws; `grep` for the old exports.
- **Source**: [rc.1 `packages/llm/llm-deepseek/src/config.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/llm/llm-deepseek/src/config.ts) · [rc.1 `packages/llm/llm-deepseek/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/llm/llm-deepseek/src/index.ts)

### DSH-0.1.7-J1-10 · the subagent runtime requires a Config, changes `listChildren`, and defaults depth to 1

- **Type**: breaking
- **Applies to**: plugins composing `dsh-subagent`, importing `SubagentCatalog`/`SubagentListEntry`,
  calling `ctx.subagents.resolveMaxDepth`, or relying on `tool-subagent.maxDepth`.
- **Touchpoints**: #1 for the constructor and types; #3 for the removed remote.
- **Action level**: required
- **Symptoms**: `new SubagentRuntime(ctx)` no longer typechecks (now `(ctx, config)`);
  `SubagentRuntime.remoteExportList` / `@Remote('list')` is gone; `SubagentCatalog`/`SubagentListEntry`
  imports fail; omission of `maxDepth` now resolves to the Host default `1` (was `3`), so nested
  delegation at depth 2 is rejected; a cold resume at capacity rejects `subagent/delivery-unavailable`.
- **Migration recipe**: mount with `{ maxDepth, maxActiveSubagents }` (`maxActiveSubagents` default 8;
  both `Volatile<number>`); read catalog entries from `listChildren()` (`SubagentCatalogEntry[]`);
  pin an explicit `maxDepth` if you need the old depth.
- **Verification**: `new SubagentRuntime(ctx, { maxDepth, maxActiveSubagents })`; a depth-2 delegation
  is rejected under the default.
- **Source**: [rc.1 `packages/subagent/subagent/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/subagent/subagent/src/index.ts) · [rc.1 `packages/subagent/tool-subagent/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/subagent/tool-subagent/src/index.ts)

### DSH-0.1.7-J1-11 · the E2B providers are removed; the POSIX SSH provider family replaces them

- **Type**: breaking
- **Applies to**: custom compositions that mounted `@deepseek-ai/dsh-e2b`, `dsh-fs-e2b`,
  `dsh-subprocess-e2b`, or the E2B opt-in workflow.
- **Touchpoints**: #3 for the services; #4 for the filesystem; #7 for the subprocess.
- **Action level**: required-if-hit
- **Symptoms**: the E2B packages and their SDK dependency are absent; importing them fails.
- **Migration recipe**: switch to the local providers or the new SSH family —
  `@deepseek-ai/dsh-ssh` (`SshConnection`), `dsh-fs-ssh` (`SshFileSystem`),
  `dsh-subprocess-ssh` (`SshSubprocessRuntime`), `dsh-sandbox-ssh` (`SshSandboxProvider`). The
  `ctx.fs`/`ctx.subprocess` interfaces are unchanged. SSH config requires an existing OpenSSH host
  alias plus absolute `node`/`helper`/`workspace` paths and a `helperHash`; BatchMode only, no
  interactive auth.
- **Verification**: mount the SSH providers and run a confined command; `SshSubprocessRuntime`
  extends `SubprocessRuntime`.
- **Source**: [rc.1 `packages/ssh/ssh/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/ssh/ssh/src/index.ts) · [rc.1 `packages/ssh/subprocess-ssh/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/ssh/subprocess-ssh/src/index.ts) · [rc.1 `.agents/notes/implemented/simplification/2026-09-11-remove-e2b-providers.md`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/.agents/notes/implemented/simplification/2026-09-11-remove-e2b-providers.md)

### DSH-0.1.7-J1-12 · Ralph is disabled in the shipped defaults

- **Type**: behavior
- **Applies to**: profiles/presets that expect `ralph` in the default tool catalog.
- **Touchpoints**: #5 for the tool roster.
- **Action level**: required-if-hit
- **Symptoms**: `ralph` is absent from default Web/headless/sdk/acp sessions and from the
  `standard`/`ptc`/`cordis` presets; the `ptc` preset also disables `workflow-ptc` (its only remaining
  consumer). Existing transcripts still replay.
- **Migration recipe**: re-enable by overriding the row in `$DSH_HOME/cordis.patch.yml` (or a
  `--patch` file): set `disabled: false` on `tool-ralph`; in `ptc` also un-disable `workflow-ptc`
  (the tool injects `ctx.workflowEngine`, so leaving it off yields an unresolved injection). For a
  Web preset, save it under a **new id** (duplicate ids are refused).
- **Verification**: `apps/cli/tests/web-agent-presets.e2e.ts` pins that any preset carrying
  `tool-ralph` disables it; `snapshots/session/ralph-loop` re-enables it under its own composition.
- **Source**: [rc.1 `packages/bundle/base/cordis.patch.yml`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/bundle/base/cordis.patch.yml) · [rc.1 `.agents/notes/implemented/simplification/2026-09-12-ralph-off-in-shipped-defaults.md`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/.agents/notes/implemented/simplification/2026-09-12-ralph-off-in-shipped-defaults.md)

### DSH-0.1.7-J1-13 · `spill-policy` becomes token-budgeted (`maxInlineBytes` → `maxInlineTokens`)

- **Type**: breaking
- **Applies to**: compositions setting `@deepseek-ai/dsh-spill-policy` `maxInlineBytes`, and any tool
  result retained by it.
- **Touchpoints**: #1 for the config key.
- **Action level**: required-if-hit
- **Symptoms**: an old `maxInlineBytes` key is an unknown field and is ignored, so spill retention is
  silently disabled; the unit and semantics change from UTF-8 bytes to estimated **tokens** shared
  across text, images and notices.
- **Migration recipe**: `maxInlineBytes: <bytes>` → `maxInlineTokens: <tokens>`; the shipped baseline
  moved `50000` → `12500`. Omission still disables the policy.
- **Verification**: an invalid value reports `spill-policy: maxInlineTokens must be a non-negative
  integer`; a large tool result is replaced with head/tail plus a locator. The per-edge card is
  DSH-0.1.7-A2-01 in [v0.1.7-alpha.2.md](v0.1.7-alpha.2.md).
- **Source**: [rc.1 `packages/spill/spill-policy/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/spill/spill-policy/src/index.ts) · [rc.1 `packages/bundle/base/cordis.patch.yml`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/bundle/base/cordis.patch.yml)

### DSH-0.1.7-J1-14 · `tool-cordis` is narrowed to read-only inspection

- **Type**: breaking
- **Applies to**: profiles/agent presets relying on `cordis_define`, `cordis_run`, `cordis_stop`,
  `cordis_undefine`, `cordis_inspect_self`, or importing `@deepseek-ai/dsh-tool-cordis`.
- **Touchpoints**: #5 for tool names; #3 for the inspection provider.
- **Action level**: required-if-hit
- **Symptoms**: those five tool names are gone; only `cordis_inspect_list` and `cordis_inspect_query`
  remain. `inject` drops `systemPrompt`/`dynamicCordisRunner`, and the `Builtin` inspect provider is
  replaced by a `Config` provider (`listConfigs`).
- **Migration recipe**: query the `Config` provider with `cordis_inspect_query`
  (`{ entry }` or `{ name, offset, limit }`) instead of `Builtin`; register the first-party providers
  through the new `@deepseek-ai/dsh-tool-cordis/host` export (service `cordis-inspect-providers`),
  which the Web composition now does. A plugin that genuinely needs dynamic define/run must ship its
  own replacement.
- **Verification**: `packages/extensions/tool-cordis/tests/config.spec.ts` and `host.spec.ts`.
- **Source**: [rc.1 `packages/extensions/tool-cordis/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/extensions/tool-cordis/src/index.ts) · [rc.1 `packages/extensions/tool-cordis/src/host.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/extensions/tool-cordis/src/host.ts)

### DSH-0.1.7-J1-15 · the bundle manifest takes ordered patch lists and drops several `dsh.*` fields

- **Type**: breaking
- **Applies to**: every bundle package's `package.json.dsh`, and profile manifests.
- **Touchpoints**: #1 for the manifest contract.
- **Action level**: required
- **Symptoms**: `dsh.bundle.patch` is now `string | string[]`; the removed fields
  `dsh.profile.patchReload`, `dsh.configTrees`, `dsh.sessionFormatMigration`, `dsh.moduleFallback`
  are no longer read/validated. `dsh.manifestVersion` is new, and package metadata (`name`, `version`,
  `description`, `icon`, `private`, `engines.dsh`) is part of the manifest contract.
- **Migration recipe**: keep `"patch": "./cordis.patch.yml"` (still valid) or use an ordered list
  `"patch": ["a.yml", "b.yml"]`; list every patch file and include them in `files`/`exports`.
  Replace `dsh.profile.patchReload` with the profile composition / HMR configuration. The Web App
  bundle now declares five patch files plus `presets/*.patch.yml`.
- **Verification**: `bundlePatchPaths(dir, manifest.dsh.bundle)` loads every declared patch; select
  the bundle and confirm each preset row mounts.
- **Source**: [rc.1 `packages/util/package-manifest/src/types.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/util/package-manifest/src/types.ts) · [rc.1 `packages/bundle/web-app/package.json`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/bundle/web-app/package.json) · [rc.1 `packages/boot/app-boot/src/profile.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/boot/app-boot/src/profile.ts)

### DSH-0.1.7-J1-16 · package rename ledger for the whole corridor

- **Type**: breaking
- **Applies to**: any plugin dependency list or composition referring to the old package names.
- **Touchpoints**: #1
- **Action level**: required
- **Symptoms**: `ERR_MODULE_NOT_FOUND` / loader "cannot find package".
- **Migration recipe**: (old → new) `@deepseek-ai/dsh-code-runtime` → `@deepseek-ai/dsh-ptc-runtime`;
  `@deepseek-ai/dsh-code-runtime-worker-thread` → `@deepseek-ai/dsh-ptc-runtime-node`;
  `@deepseek-ai/dsh-workflow-worker-thread` → `@deepseek-ai/dsh-workflow-ptc`;
  `@deepseek-ai/dsh-agent-presets` → `@deepseek-ai/dsh-agent-preset` +
  `@deepseek-ai/dsh-agent-preset-registry`; `@deepseek-ai/dsh-settings-file` →
  `@deepseek-ai/dsh-settings` (+ `@deepseek-ai/dsh-config-editor`); `@deepseek-ai/cordis-plugin-hmr`
  → `@deepseek-ai/dsh-hmr`. Read the specific card for each rename's vocabulary change.
- **Verification**: `pnpm why <new-name>` resolves and a grep for the old names comes back empty.
- **Source**: [rc.1 `packages/bundle/base/package.json`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/bundle/base/package.json) · [rc.1 `packages/bundle/web-app/package.json`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/bundle/web-app/package.json)

### DSH-0.1.7-J1-17 · new CLI/Headless surfaces

- **Type**: capability
- **Applies to**: scripts/automation driving `dsh`, and CI using the headless profile.
- **Touchpoints**: none
- **Action level**: optional
- **Symptoms**: none (additive). `dsh web` still boots the Web profile, now expanded to
  `--profile web`; `dsh <profile>` is a generic shorthand; `plugin` must be the first argument.
- **Migration recipe**: adopt `dsh --profile <p> --dump-config-schema` to export the Cordis config
  JSON Schema without mounting. Headless gains task intake from stdin (positional omitted or `-`),
  `--session-id <id>` resume, and `--json` NDJSON events (`session` … `status`/`text`/`thinking`/
  `tool_call`/`tool_result` … `final`, with 8 KiB per string/key and 32 KiB per line caps; exit 0 only
  on a completed `turn/end`). `apps/cli` also exports a new `./profile-boot` entry.
- **Verification**: `dsh --profile <p> --dump-config-schema` prints a schema; a piped headless task
  runs and `--json` emits `session` … `final`.
- **Source**: [rc.1 `apps/cli/src/args.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/apps/cli/src/args.ts) · [rc.1 `packages/bundle/headless/README.md`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/bundle/headless/README.md)

### DSH-0.1.7-J1-18 · Agent Team becomes one bundle and the old subagent creation tools are off inside it

- **Type**: breaking
- **Applies to**: profiles whose `dsh.profile.bundles` selects
  `@deepseek-ai/dsh-experimental-agent-team-web-profile`, and plugins expecting `tool-subagent*` in a
  team session.
- **Touchpoints**: #1 for the bundle selection; #5 for the tool roster.
- **Action level**: required-if-hit
- **Symptoms**: a saved profile still selecting the removed Web bundle fails startup (unresolved
  package; no automatic rewrite). Inside a team session, `tool-subagent`, `tool-subagent-fork`,
  `tool-subagent-control` and `tool-subagent-list-agents` are `disabled: true` — coordination goes
  through `spawn_teammate`, `send_message`, `list_agents`, `interrupt_agent`.
- **Migration recipe**: select the single `@deepseek-ai/dsh-experimental-agent-team-profile` bundle
  (row ids `agent-team`, `tool-agent-team`, `ui-agent-team` are retained, so per-row profile patches
  keep working); the old `agent-team-web-profile` package is gone. Use the team tools in team sessions.
- **Verification**: `packages/experimental/agent-team-profile/tests/profile.spec.ts`; enable the one
  bundle and confirm the Team controls appear.
- **Source**: [rc.1 `packages/experimental/agent-team-profile/cordis.patch.yml`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/experimental/agent-team-profile/cordis.patch.yml) · [rc.1 `.agents/notes/implemented/architecture/2026-09-18-agent-teams-single-bundle.md`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/.agents/notes/implemented/architecture/2026-09-18-agent-teams-single-bundle.md)

### DSH-0.1.7-J1-19 · experimental speech-to-text and browser/computer-use registries

- **Type**: capability
- **Applies to**: plugins registering a speech provider, a browser provider, or a computer-use provider.
- **Touchpoints**: #1 for the service types; #3 for the Remote.
- **Action level**: optional
- **Symptoms**: none (new). Shipped off by default.
- **Migration recipe**: speech — `ctx.speechToText` with `register(provider)`, `listProviders()`,
  `follow(signal)`, `configure()`; packages `experimental-speech-to-text`,
  `experimental-speech-to-text-sensevoice` (local ONNX, download-source selection),
  `experimental-api-speech-to-text`, `experimental-client-ui-voice-input`, and the optional
  `experimental-voice-input-bundle`. Browser/computer use — `ctx.browserUse.register(name)` and
  `ctx.computerUse.register(name)` are **exclusive** registries (one provider, no name fallback),
  backed by the new `@deepseek-ai/dsh-browser-use` / `@deepseek-ai/dsh-computer-use` core packages
  and experimental provider packages.
- **Verification**: registering a second provider fails; a transcription stream follows a signal.
- **Source**: [rc.1 `packages/experimental/speech-to-text/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/experimental/speech-to-text/src/index.ts) · [rc.1 `packages/browser-use/browser-use/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/browser-use/browser-use/src/index.ts) · [rc.1 `.agents/notes/implemented/architecture/2026-09-16-experimental-voice-input.md`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/.agents/notes/implemented/architecture/2026-09-16-experimental-voice-input.md)

### DSH-0.1.7-J1-20 · the bundled LibreOffice runtime and the packaged-app Node requirement

- **Type**: capability
- **Applies to**: plugins/deployments rendering Office documents, and Electron/SEA-packaged apps.
- **Touchpoints**: #1 for the service and config; #7 for the conversion subprocess.
- **Action level**: required-if-hit
- **Symptoms**: `skill-office` defaults its CLI to the installed kit's `lib/cli.js`; in Electron or a
  Node SEA executable `officeRuntime()` throws
  `skill-office: packaged applications must supply a standalone Node executable`.
- **Migration recipe**: use `@deepseek-ai/dsh-office-to-pdf` (`ctx.officeToPdf`, bounded-queue config)
  and `@deepseek-ai/dsh-skill-office` (skills `office-docx`/`office-pptx`/`office-xlsx`) with the
  bundled `@deepseek-ai/libreoffice-kit` (`^0.1.0`). In a packaged app supply an absolute `node`
  executable; a Node-free deployment must set `cli: false`. A declared native kit package that is
  missing is an incomplete install and never falls back to WASM.
- **Verification**: convert a `.docx` to PDF under the bundled kit; a packaged app without `node`
  fails with the explicit error until `node` is supplied.
- **Source**: [rc.1 `packages/skill/skill-office/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/skill/skill-office/src/index.ts) · [rc.1 `packages/document/office-to-pdf/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/document/office-to-pdf/src/index.ts) · [rc.1 `pnpm-workspace.yaml`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/pnpm-workspace.yaml)

### DSH-0.1.7-J1-21 · MCP resources, URI templates and tool pagination

- **Type**: capability
- **Applies to**: MCP client consumers and plugins exposing resources.
- **Touchpoints**: #3 for the Remote/service; #1 for exports.
- **Action level**: optional
- **Symptoms**: none (additive); `createMcpToolDefinition` is now public and a resources service exists.
- **Migration recipe**: adopt `@deepseek-ai/dsh-mcp-resources` (`McpResourceRuntime`,
  `McpResourceProvider`, `McpResourceRequest`); import `createMcpToolDefinition`/
  `McpToolDefinitionOptions` from `@deepseek-ai/dsh-mcp-client`; the client config gains a per-call
  timeout and the connection layer negotiates the updated protocol and paginates the tool list.
- **Verification**: mount `mcp-resources` and list resources/URI templates; a paged tool list is
  followed to the end.
- **Source**: [rc.1 `packages/mcp/mcp-resources/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/mcp/mcp-resources/src/index.ts) · [rc.1 `packages/mcp/mcp-client/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/mcp/mcp-client/src/index.ts)

### DSH-0.1.7-J1-22 · the DeepSeek session-log upload now defaults to on

- **Type**: privacy
- **Applies to**: profiles composing `@deepseek-ai/dsh-session-log-deepseek` that relied on the
  previous opt-in default.
- **Touchpoints**: #3
- **Action level**: required-if-hit
- **Symptoms**: the `dsh_session_log` field is contributed to official DeepSeek requests without an
  explicit opt-in.
- **Migration recipe**: set `enabled: false` explicitly to keep the old opt-out behavior.
- **Verification**: inspect the `dsh_session_log` field on an official request under default config.
- **Source**: [rc.1 `packages/session/session-log-deepseek/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/session/session-log-deepseek/src/index.ts) · [rc.1 `.agents/notes/implemented/architecture/2026-09-14-session-log-upload-default.md`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/.agents/notes/implemented/architecture/2026-09-14-session-log-upload-default.md)

### DSH-0.1.7-J1-23 · `tool.call.toolview` gains a `preparing` phase

- **Type**: breaking
- **Applies to**: any Web Client plugin registering a keyed `tool.call.toolview` view, importing
  `ToolCallOwnerProps`/`ToolCallViewProps`/`ToolCallBlock`; in-tree `ui-cordis` and `ui-deliverables`.
- **Touchpoints**: #5 for the slot; #1 for the props types.
- **Action level**: required
- **Symptoms**: the owner props are now a `phase` union — `'preparing'` with a `PreparingToolCall`
  that has **no `argsRaw`**, `'start'` with `StartedToolCall`, `'result'` with `ToolResultNode`. A
  view that reads `block.argsRaw` unconditionally throws or under-renders during argument streaming.
- **Migration recipe**: branch on `props.phase === 'preparing'` first (render a lightweight,
  argument-free row) and delegate the rest to `StartedToolCallViewProps`
  (`Exclude<ToolCallViewProps, { phase: 'preparing' }>`). Optional raw prefix during preparing comes
  from `useToolCallArgumentsPartial` (`inject.hooks.toolCallArgumentsPartial`). `inspect` is now
  optional; `loadImage` is a `MessageImageLoader`; `RunningToolCall` splits into
  `PreparingToolCall | StartedToolCall`.
- **Verification**: a view renders under `phase: 'preparing'` without throwing and still renders the
  settled card; `packages/extensions/ui-cordis/tests/status-icons.client.spec.tsx` asserts
  `[data-state="preparing"]`.
- **Source**: [rc.1 `packages/client/ui-tool/src/client/contract/slots.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/client/ui-tool/src/client/contract/slots.ts) · [rc.1 `packages/client/ui-conversation/src/client/contract/records.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/client/ui-conversation/src/client/contract/records.ts) · [rc.1 `.agents/notes/implemented/architecture/2026-09-22-tool-call-three-phases.md`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/.agents/notes/implemented/architecture/2026-09-22-tool-call-three-phases.md)

### DSH-0.1.7-J1-24 · the chat-node hook context is reshaped and `turnTail` becomes a list

- **Type**: breaking
- **Applies to**: plugins registering keyed `conversation.chat.node` renderers or
  `conversation.chat.turnTail`; importers of `ChatNodeTurnDataInjected`, `ChatNodeOwnerProps`,
  `TurnTailOwnerProps`.
- **Touchpoints**: #5
- **Action level**: required-if-hit
- **Symptoms**: `hookContext` is no longer the turn-data store itself (it is now
  `{ turnData, disclosureReset }`); `ChatNodeTurnDataInjected` → `ChatNodeInjected`; a `turnTail`
  entry registered as `chain` never renders because the slot is now `kind: 'list'`.
- **Migration recipe**: read `hooks.turnData`; new `hooks.disclosure`
  (`SlotHookFactory<..., UseDisclosure>`) resets on turn change. Owner props add `groupPart`, `openSkill`,
  and `inspectCall` becomes optional. Replace `turnTail` `{ name, select, ... }` with
  `{ name, id, order?, locale?, children?, inject? }` and return `null` when a contribution has no content.
- **Verification**: register a `turnTail` entry with an `id` and confirm it renders in order beside
  deliverables; the disclosure hook resets on turn change.
- **Source**: [rc.1 `packages/client/ui-chat/src/client/contract/slots.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/client/ui-chat/src/client/contract/slots.ts) · [rc.1 `packages/client/ui-chat/src/client/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/client/ui-chat/src/client/index.ts)

### DSH-0.1.7-J1-25 · the transcript mode becomes a presentation policy channel

- **Type**: breaking
- **Applies to**: plugins importing `TranscriptViewMode`, reading `ChatViewInjected.hooks.transcriptView`,
  or relying on the persisted `ui-chat.transcriptView` values `normal`/`compact`.
- **Touchpoints**: #5 for the setting; #1 for the exports.
- **Action level**: required-if-hit
- **Symptoms**: `'normal'` is no longer a mode; persisted `normal`/`expanded` migrate to
  `standard`/`detailed`. The channel is a derived policy object, not the mode store, so a renderer
  branching on the raw mode breaks.
- **Migration recipe**: `TRANSCRIPT_VIEW_MODES = ['compact','standard','detailed','verbose']`,
  default `standard`. `hooks.transcriptView` → `hooks.presentation`
  (`ObservableSnapshot<ChatPresentationPolicy>`); select `foldCompletedTurns`, `stepGrouping`,
  `liveProcessDetail`, `settledReasoningPreview` instead of comparing an enum. Optional new settings:
  `performanceUsage` and `linkOpening` (`'sidebar' | 'new-tab'`).
- **Verification**: a `verbose` turn does not fold and a `compact` turn does; switching modes keeps
  the grouped container mounted.
- **Source**: [rc.1 `packages/client/ui-chat/src/client/presentation-policy.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/client/ui-chat/src/client/presentation-policy.ts) · [rc.1 `packages/client/ui-chat/src/chat-settings.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/client/ui-chat/src/chat-settings.ts) · [rc.1 `packages/client/ui-chat/src/client/contract/slots.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/client/ui-chat/src/client/contract/slots.ts)

### DSH-0.1.7-J1-26 · product icons rename from pixel suffixes to weight names

- **Type**: breaking
- **Applies to**: every plugin importing icons (or `ReferenceIcon`/`LinkIcon`/`PermissionIcon`) from
  `@deepseek-ai/dsh-client-ui-primitives`.
- **Touchpoints**: #1 for imports; #5 for rendered UI.
- **Action level**: required-if-hit
- **Symptoms**: `IconSearchOutline16`, `IconSettingsOutline14`, `IconChevronDownOutline14`,
  `ReferenceIcon`, `LinkIcon` no longer exist → unresolved build import, or `undefined` at runtime
  ("Element type is invalid"). The pixel suffixes are gone (66 symbols at the baseline).
- **Migration recipe**: `Icon<Name>Outline16`/`Outline14`/`Fill16`/`Fill14` →
  `Icon<Name>OutlineRegular`/`OutlineMedium`/`FillRegular`/`FillMedium`; the `size` prop now controls
  dimensions (`Regular` = 1px stroke, `Medium` = 1.3px). `ReferenceIcon` → `ReferenceIconRegular|Medium`;
  `LinkIcon` → `LinkIconRegular|Medium`; permission glyphs move to `PermissionIcon.tsx`
  (`PermissionIconFullAccessRegular/Medium`, `PermissionIconReadOnlyRegular/Medium`,
  `PermissionIconWorkspaceWriteRegular/Medium`). Plugin artwork is now
  `PluginArtworkTerminal|Loop|Subagent|Search|Default`.
- **Verification**: a grep for `Outline16`/`Outline14` in your plugin is empty; a build importing the
  new names succeeds. The per-edge card DSH-0.1.7-A1-01 in [v0.1.7-alpha.1.md](v0.1.7-alpha.1.md)
  covers the same rename with first-hand fleet evidence (a missing export vanishes the whole slot
  entry via React #130) and the driven-browser assertions to run.
- **Source**: [rc.1 `packages/client/ui-primitives/src/icons/index.tsx`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/client/ui-primitives/src/icons/index.tsx) · [rc.1 `packages/client/ui-primitives/src/PermissionIcon.tsx`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/client/ui-primitives/src/PermissionIcon.tsx) · [rc.1 `.agents/notes/implemented/architecture/2026-09-16-size-neutral-product-icon-weights.md`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/.agents/notes/implemented/architecture/2026-09-16-size-neutral-product-icon-weights.md)

### DSH-0.1.7-J1-27 · the client settings transport renames `settingsScope` → `configForms`

- **Type**: breaking
- **Applies to**: every browser plugin that persisted preferences via
  `ctx.settingsScope.bind({ namespace })` and `SettingsScope<T>`; e.g. `ui-theme`, `locale`,
  `ui-agent-preset`, `ui-chat`, `ui-conversation`.
- **Touchpoints**: #1 for the service/type names; #3 for the service.
- **Action level**: required
- **Symptoms**: `inject: ['settingsScope']` never activates; `ctx.settingsScope` is undefined;
  `SettingsScope`/`SettingsScopeSnapshot`/`SettingsScopeSpec` no longer export from
  `@deepseek-ai/dsh-client-ui-settings/client`; `set`/`unset`/`mutate` now return
  `Promise<boolean>` (was `Promise<void>`).
- **Migration recipe**: `inject: ['configForms']`; `const form = ctx.configForms.get<T>(entryId)`
  (for shipped plugins the entry id equals the old namespace string); `SettingsScope<T>` →
  `ConfigForm<T>`. Pages editing another plugin's namespace use
  `ctx.configForms.whileServed(namespaces, register)`. Host-side, drop `ctx.settings.register` and
  declare `.volatile()` Config fields (see DSH-0.1.7-J1-04).
- **Verification**: a grep for `settingsScope` in the plugin is empty; `form.set(...)` resolves `true`
  on Host accept and `false` on refusal.
- **Source**: [rc.1 `packages/client/ui-settings/src/client/config-form.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/client/ui-settings/src/client/config-form.ts) · [rc.1 `packages/client/ui-settings/src/client/config-form-types.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/client/ui-settings/src/client/config-form-types.ts)

### DSH-0.1.7-J1-28 · the right-sidebar tab contract (retained tabs, guide entries, placement)

- **Type**: breaking
- **Applies to**: plugins registering `sidebar.right.pane.tab` types or `rightbar.session` bodies;
  importers of `SidebarRightTabInfo`, `SidebarRightTabPlacement`, `SidebarRightTabDefinition`,
  `SidebarRightTabParamsMap`.
- **Touchpoints**: #5 for the slots; #1 for the types.
- **Action level**: required-if-hit
- **Symptoms**: a `rightbar.session` body that assumed it is always visible now receives `active` and
  must call `retainTab`; `SidebarRightTabInfo.tab.visible` semantics narrowed to foreground-only plus
  expansion/selection. New `sidebar.right.tab.guide.entry` slot; `SidebarRightTabDefinition` gains
  `multiple?`, `keepMounted?`, `patterns?`, `priority?` (`'extension'|'builtin'|'fallback'`, default
  extension), `canOpen?`, `title(address)`, `guide?`.
- **Migration recipe**: use `ctx.sidebarRightTabs.register(def)`, `ctx.sidebarRight.openResource(address, { params, preferNewPane })`,
  `ctx.sidebarRight.registerCloseHandler(kind, handler)`; `SidebarRightTabPlacement.preferNewPane?`
  is new; declare deep-link params by module-augmenting `SidebarRightTabParamsMap`.
  `rightbar.session` owner: `RightbarOwnerProps & { active, retainTab(tabId, signal) => () => void }`.
- **Verification**: register a tab type with `priority: 'extension'` and confirm it shadows nothing
  shipped; a retained body survives tab presentation changes.
- **Source**: [rc.1 `packages/client/ui-sidebar-right/src/client/contract/slots.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/client/ui-sidebar-right/src/client/contract/slots.ts) · [rc.1 `packages/client/ui-sidebar-right/src/client/tab-registry.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/client/ui-sidebar-right/src/client/tab-registry.ts)

### DSH-0.1.7-J1-29 · the new sidebar surfaces ship as packages

- **Type**: capability
- **Applies to**: plugins launching terminals/browsers, opening subagent chats, or extending previews.
- **Touchpoints**: #5 for the tabs; #3 for the client services.
- **Action level**: optional
- **Symptoms**: none (new). Document previews now read **bytes** (`workspaceFiles.readBytes(sessionId, path, {}, signal)`,
  was `readAll`) and render through new `office`/`excel` renderers.
- **Migration recipe**: terminal — inject `webTerminals` (`retainTabs`, `view`, `launchShells`,
  `selectShell`, `close`); tab type `terminal` from `@deepseek-ai/dsh-client-ui-sidebar-terminal`.
  Browser — `@deepseek-ai/dsh-client-ui-sidebar-browser` registers kind `browser` (Electron webview via
  `dshDesktop.browser`, else iframe). Subagent chat — `@deepseek-ai/dsh-client-ui-subagent` registers
  `subagentchat`, opened with `ctx.sidebarRight.openResource(...)`. Plan — `@deepseek-ai/dsh-client-ui-plan`
  adds persistent Chat cards and a `plan` tab type. Deliverables — a `changes-review` tab plus file-action
  list slots. `@deepseek-ai/dsh-client-ui-open-in-app` adds `sidebar.right.tab.document.actions` /
  `.unpreviewable`.
- **Verification**: open each sidebar type; the terminal body survives tab presentation changes.
- **Source**: [rc.1 `packages/client/ui-sidebar-terminal/src/client/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/client/ui-sidebar-terminal/src/client/index.ts) · [rc.1 `packages/client/ui-sidebar-documentpreview/src/client/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/client/ui-sidebar-documentpreview/src/client/index.ts)

### DSH-0.1.7-J1-30 · component factories in the slot system

- **Type**: capability
- **Applies to**: plugins that publish a reusable UI assembly with caller-selected local components.
- **Touchpoints**: #5
- **Action level**: optional
- **Symptoms**: none (additive); `SlotCore.snapshot()` now returns `LiveCompositionNode[]`
  (`type: 'slot' | 'factory'`), and `ComposedProps` becomes five-share.
- **Migration recipe**: declare `interface SlotFactoryMap { '<name>': { scope; props?; children?; store?; inject?; locale?; slots? } }`,
  register with `ctx.slots.registerFactory({ name, scope, ... }, Definition)`, render with
  `renderFactorySlot('<name>', props, { slots, fallback })` and `useFactorySlot(name, fallback)`.
  `ui-conversation` ships the `conversation.content` factory (children `conversation.session`,
  `conversation.composer`, `conversation.composer.bar`, `conversation.input.dock`, and the hero slots).
- **Verification**: `packages/client/ui-renderer/tests/factory-slots.client.spec.tsx`; a factory renders
  a local slot override.
- **Source**: [rc.1 `packages/client/ui-slots/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/client/ui-slots/src/index.ts) · [rc.1 `packages/client/ui-renderer/src/client/registry.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/client/ui-renderer/src/client/registry.ts) · [rc.1 `.agents/notes/implemented/architecture/2026-09-10-component-factories-and-local-slots.md`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/.agents/notes/implemented/architecture/2026-09-10-component-factories-and-local-slots.md)

### DSH-0.1.7-J1-31 · the plugin-manager page, its slots and the `pluginManager` Remote

- **Type**: capability
- **Applies to**: plugins wanting a configuration page, an official-plugin card, or detail-page
  contributions; consumers of `@deepseek-ai/dsh-api-remotes/client`.
- **Touchpoints**: #5 for the slots; #3 for the Remote.
- **Action level**: optional
- **Symptoms**: n/a (new). A plugin still registering the retired `settings.plugin.item` slot silently
  shows nothing. `ManagementError['code']` gains `'incompatible-version'` with an
  `incompatible?: IncompatiblePlugin[]` payload, and `PackageResult` gains `timedOut?`/`incompatible?`,
  so an exhaustive `switch` over the old union changes.
- **Migration recipe**: bundle form — register `plugins.bundle.config` keyed by package name (only
  `view: 'page'` renders); declared row — `plugins.row.config` keyed `<package>#<row id>`; official
  page — `plugins.item`; detail contributions — `plugins.detail.actions`/`.badge`/`.section`. Remote
  namespace `pluginManager` methods: `listBundles`, `listPlugins`, `inspect`, `installBundle`,
  `waitForInstall`, `cancelInstall`, `setBundleEnabled`, `setPluginEnabled`, `removeBundle`,
  `registries`. `PluginManagerFace` gains a required `useGithubMirror`.
- **Verification**: the form/card appears only while the owning row is enabled;
  `packages/client/ui-plugin-manager/tests/*`.
- **Source**: [rc.1 `packages/client/ui-plugin-manager/src/client/slot-contract.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/client/ui-plugin-manager/src/client/slot-contract.ts) · [rc.1 `packages/api/remotes/src/client/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/api/remotes/src/client/index.ts) · [rc.1 `packages/boot/plugin-manager/src/types.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/boot/plugin-manager/src/types.ts)

### DSH-0.1.7-J1-32 · `ModelDirectory.select` returns a `RemoteResult`

- **Type**: breaking
- **Applies to**: importers of `@deepseek-ai/dsh-client-ui-model-selection/client`
  (`ModelDirectory`, `ModelSelectInjected`); the `conversation.input.model` seat.
- **Touchpoints**: #1 for the signature; #3 for the Remote.
- **Action level**: required-if-hit
- **Symptoms**: `ModelDirectory.select` no longer throws on failure, and the injected `select`
  changed from `Promise<boolean>` to `Promise<RemoteResult<void> | undefined>`, so a `try/catch`
  no longer catches selection failures.
- **Migration recipe**: consume the result —
  `const r = await directory.select(sel); if (r !== undefined && !r.ok) { /* r.error.code, e.g. 'session/writer-held' */ }`;
  the seat may resolve `undefined` when the session cannot select.
- **Verification**: `packages/client/ui-model-selection/tests/model-select.client.spec.tsx`.
- **Source**: [rc.1 `packages/client/ui-model-selection/src/client/directory.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/client/ui-model-selection/src/client/directory.ts) · [rc.1 `packages/client/ui-model-selection/src/client/slots.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/client/ui-model-selection/src/client/slots.ts)

### DSH-0.1.7-J1-33 · session-row actions become slot lists and `WorkspaceBrowserInjected` changes

- **Type**: breaking
- **Applies to**: plugins adding Session-row actions or importing `WorkspaceBrowserInjected`;
  `ui-workspace` consumers.
- **Touchpoints**: #5 for the slots; #1 for the injected face.
- **Action level**: required-if-hit
- **Symptoms**: new root-scoped list slots; `WorkspaceBrowserInjected.renameSession/sessionId,title` →
  `requestSessionRename(sessionId, currentTitle)`; `forkSession`/`archiveSession`/`insertSessionBefore`
  are removed; `createWorkspace`/`unarchiveSession`/`notifyArchivedNotOpenable` are new.
- **Migration recipe**: add a menu row by registering a `list` entry into
  `sidebar.workspaces.session.menu.item` (root scope, owner `{ sessionId, displayTitle }`, shipped
  ids `pin` 100, `rename` 200, `fork` 300, `archive` 400), and a hover button into
  `sidebar.workspaces.session.row.action`; ship plain `role="menuitem"` buttons
  (`ui-primitives` exports `MenuItemButton`). Surfaces raised by actions live in `shell.overlay`.
- **Verification**: `packages/client/ui-workspace/tests/session-actions.client.spec.tsx`.
- **Source**: [rc.1 `packages/client/ui-workspace/src/client/contract/slots.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/client/ui-workspace/src/client/contract/slots.ts) · [rc.1 `packages/client/ui-workspace/src/client/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/client/ui-workspace/src/client/index.ts) · [rc.1 `.agents/notes/implemented/architecture/2026-09-17-session-row-menu-actions-slot.md`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/.agents/notes/implemented/architecture/2026-09-17-session-row-menu-actions-slot.md)

### DSH-0.1.7-J1-34 · two new settings-page seats: `settings.launcher` and `settings.models.sign-in`

- **Type**: capability
- **Applies to**: plugins extending the settings panel's opening surface (sidebar account
  launcher) or the Models settings credential flow (sign-in step).
- **Touchpoints**: #5 for the seats.
- **Action level**: optional
- **Symptoms**: n/a (new). Both seats are optional by contract and render nothing without a
  registrant.
- **Migration recipe**: `settings.launcher` — root-scoped `single` seat typed in the `ui-settings`
  slot contract; the rendering site passes `{ wide, openSettings(), openOnboarding(id) }` and the
  contribution is the sidebar account launcher that opens the shell-owned settings panel (the
  settings shell declares the seat in its children). `settings.models.sign-in` — root-scoped
  `single` seat in `ui-settings-models`; the site passes `{ complete(), useApiKey() }` and the
  contribution renders the optional account login choice before the credential editor. Register
  through `ctx.slots.inject(name, () => ctx.slots.register(...))` so the contribution waits on the
  declaring plugin's slot declaration (cross-package apply order is unconstrained). Both arrived
  with the DeepSeek account sign-in integration inside this corridor (first tagged
  `dsh-v0.1.7-alpha.1`).
- **Verification**: `packages/client/ui-settings-general/tests/shell.client.spec.ts` covers the
  launcher seat; in a driven browser, register a stub into each seat and assert it renders.
- **Source**: [rc.1 `packages/client/ui-settings/src/client/contract/slots.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/client/ui-settings/src/client/contract/slots.ts) · [rc.1 `packages/client/ui-settings-models/src/client/slot-contract.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.1/packages/client/ui-settings-models/src/client/slot-contract.ts) · [introducing commit 048297321a](https://github.com/deepseek-ai/deepseek-harness/commit/048297321ad1364557308d360b8e535978ec8876)
- **See also**: DSH-0.1.7-A1-11 in the per-edge file [v0.1.7-alpha.1.md](v0.1.7-alpha.1.md).
