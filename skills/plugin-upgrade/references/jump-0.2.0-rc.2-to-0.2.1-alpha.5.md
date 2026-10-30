---
kind: dsh-version-jump-card-set
schema: 1
from: dsh-v0.2.0-rc.2
to: dsh-v0.2.1-alpha.5
status: draft
coverage: curated
cardCount: 20
idPrefix: DSH-0.2.1-J1
verifiedAt: 2026-10-16
---

# Change cards · 0.2.0-rc.2 → 0.2.1-alpha.5

> This file is a curated list of plugin-relevant changes, not a complete API diff.
>
> Upstream comparison: [dsh-v0.2.0-rc.2...dsh-v0.2.1-alpha.5](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.2.0-rc.2...dsh-v0.2.1-alpha.5)
> · Tags: `dsh-v0.2.0-rc.2` = `639ed015397290b3745d163aafe02ffee4aa3f84`, `dsh-v0.2.1-alpha.5` = `1517a4dbca0a2789ff1d41ba439600f8547d23fa`
> · npm dist-tag `alpha` = `0.2.1-alpha.5`（`latest` 仍为 `0.2.0-rc.2`）；Card format: see [references/README.md](README.md)
> · Touchpoint numbering: see [pre-flight.md](pre-flight.md)
>
> **This is a version-jump edge.** It spans `0.2.0-rc.2 → 0.2.1-alpha.1 → … → 0.2.1-alpha.5`
> (1912 commits, 8361 changed files, +315,897/−84,270) and records the **net** state change from
> `0.2.0-rc.2` to `0.2.1-alpha.5`. The report draws on the upstream external-compatibility audit
> (CHANGELOG + UPGRADE-ADAPTATION shipped with the release) cross-checked against a full local
> checkout of both tags, plus first-hand fleet evidence from a 28-plugin sweep on Windows
> (Field notes inline). It is **not** a per-edge ledger of the intermediate alphas.
>
> Per-edge cards for the same window are [v0.2.1-alpha.1.md](v0.2.1-alpha.1.md) …
> [v0.2.1-alpha.5.md](v0.2.1-alpha.5.md) (orders 21–25). Overlapping entries: J1-01 ↔ DSH-0.2.1-A4-01,
> J1-02 ↔ DSH-0.2.1-A1-01, J1-03 ↔ DSH-0.2.1-A2-11, J1-04 ↔ DSH-0.2.1-A2-09, J1-05 ↔ DSH-0.2.1-A2-02,
> J1-06 ↔ DSH-0.2.1-A2-02/A2-03/A2-04, J1-07 ↔ DSH-0.2.1-A2-01.
>
> Claim: [oh-my-dsh/dsh-plugin-upgrade-skill#284](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/issues/284).

## Contents

- DSH-0.2.1-J1-01 · breaking: DSH plugin compatibility now reads `engines.dsh` first, renames `peers` → `requirements`, and evaluates ranges with `includePrerelease`
- DSH-0.2.1-J1-02 · breaking: the runtime-invariants system is removed wholesale (`@deepseek-ai/dsh-invariants`, 38 `./invariant` subpaths, `ctx.invariants`)
- DSH-0.2.1-J1-03 · breaking: the `webRuntime` service is replaced by `webStartup` (`trustedHosts` moves to `--trusted-host`); the `connection` row config survives
- DSH-0.2.1-J1-04 · breaking: the `{{cwd}}` prompt variable is removed (persona/suffix fail at first model request)
- DSH-0.2.1-J1-05 · breaking: the subagent delegation model is reworked — `startActivation` + `delivery`, `run_in_background`/`settleRun`/`startContinuable` are gone, requests lose `persona`/`toolFilter` and gain `agentPreset`
- DSH-0.2.1-J1-06 · breaking: a band of profile/config keys is deleted (`backgroundMode`, `enableRunInBackground`, `toolFilter`, `maxPendingMessagesPerMember`, `dshHome`, `models` on `llm-deepseek-account`, …)
- DSH-0.2.1-J1-07 · breaking: tool presentation `mode: 'both'` is rejected at assembly
- DSH-0.2.1-J1-08 · breaking: client-plugin API removals (`projectUserText` → `UserTextRun`/`ReferenceChip`, toolview hook-context types, `FontSizeRow*`, `ThemeSnapshot.fontSize`)
- DSH-0.2.1-J1-09 · breaking: `TerminalBlockLabels` gains the required `commandLine(line)` member
- DSH-0.2.1-J1-10 · breaking: npm package-set churn (−3/+28 names, 192 packages gain `./locale/*.json` subpaths, `schedule-bundle` → `tool-schedule`)
- DSH-0.2.1-J1-11 · breaking: session data upgrades one way (`job/*`, `working-directory/change` events; `subagent/catalog` v2) — back up before upgrading
- DSH-0.2.1-J1-12 · breaking: CLI and deployment reversals (`dsh plugin --profile` position, destructive `--from-default-profile`, wildcard `host` refused, credential priority, headless off by default)
- DSH-0.2.1-J1-13 · breaking: the client performs a host-release handshake (`ClientReleaseChange`) — a hard browser refresh is part of the upgrade
- DSH-0.2.1-J1-14 · breaking: `dsh-tools` requires `dsh-working-directory`; SDK-server assembly injects `workingDirectory`
- DSH-0.2.1-J1-15 · breaking: `dsh-session-persistence-jsonl` loses its default export
- DSH-0.2.1-J1-16 · breaking (protocol peers): terminal `follow`/`write`/`resize` → duplex `attach`; `OperatorPeer` → `Peer`; `session/projections` becomes a discriminated union
- DSH-0.2.1-J1-17 · behavior: hooks/webhook/Ralph packages leave the CLI dependency set — install and select them explicitly
- DSH-0.2.1-J1-18 · toolchain: fleet-upgrade mechanics on Windows (pnpm self-bootstrap, junction-linked dev trees, profile pinned versions, no concurrent installs)
- DSH-0.2.1-J1-19 · breaking: the client conversation contract drifts — `ToolResultNode`/`StartedToolCall` gain required `name`/`args`, `ChatNodeStore` gains `bottomSource`
- DSH-0.2.1-J1-20 · breaking: presets that restate official bundle presets wholesale must be regenerated from the target tag

---

### DSH-0.2.1-J1-01 · DSH plugin compatibility now reads `engines.dsh` first, renames `peers` → `requirements`, and evaluates ranges with `includePrerelease`

- **Type**: breaking
- **Applies to**: every plugin whose `package.json` declares `@deepseek-ai/dsh-*`, `@deepseek-ai/cordis`,
  `@deepseek-ai/schemastery`, or `@deepseek-ai/cosmokit` under `peerDependencies`; the Web plugin
  page and `plugin_manager` tool consumers.
- **Touchpoints**: #1 for the manifest contract.
- **Action level**: required
- **Symptoms**: unmet requirements block **installation and activation** (`IncompatiblePlugin`,
  `code: 'incompatible-version'`); the rejection record's `peers` field is now `requirements`.
  **Evaluation semantics changed in this very corridor**: rc.2 evaluated ranges with default
  semver (where `^0.2.0-rc.1` refuses the `0.2.1-alpha.5` prerelease — the 0.1.7-era trap), but
  alpha.5's `plugin-compatibility.ts` calls
  `semver.satisfies(runtimeVersion, range, { includePrerelease: true })`, so plain floors
  (`^0.2.0-rc.1`, `^4.0.4`, open `>=…`) now **admit** the prerelease host at the activation gate.
  The vendored peers also moved to `4.0.5-alpha.2`/`3.18.5-alpha.2`/`1.8.6-alpha.2`.
- **Migration recipe**: when `engines.dsh` is present it decides **alone** (the `@deepseek-ai/dsh`
  peer range is ignored; `workspace:` is not a legal value there). Otherwise bump every DSH peer:
  `@deepseek-ai/dsh-*` → `^0.2.1-alpha.5`, vendored peers mirror the official published pins —
  `@deepseek-ai/cordis` `~4.0.5-alpha.2`, `@deepseek-ai/schemastery` `~3.18.5-alpha.2`,
  `@deepseek-ai/cosmokit` `~1.8.6-alpha.2` (official packages pin dsh peers exactly, e.g.
  `0.2.1-alpha.5`). The bump is still the honest declaration even though the activation gate
  forgives stale floors: registry/pnpm resolvers use default semver (peer warnings,
  `dsh plugin add` lookups), and the next final release re-tightens everything.
  Exact-version exemptions (`dsh plugin --profile <p> allow-version <pkg>@<ver> --dsh-version
  <ver> --accept-risk`) still exist but a correct range is always preferable.
- **Verification**: the plugin's rows appear enabled in `dsh plugin --profile <p> list`;
  `pnpm peers check` noise drops after the bump.
- **Source**: [alpha.5 `packages/boot/app-boot/src/plugin-compatibility.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.5/packages/boot/app-boot/src/plugin-compatibility.ts) (line 52: `semver.satisfies(runtimeVersion, range, { includePrerelease: true })`) · [alpha.5 `packages/boot/plugin-manager/src/types.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.5/packages/boot/plugin-manager/src/types.ts) · npm: `npm view @deepseek-ai/dsh-tools@0.2.1-alpha.5 peerDependencies`
- **Field note** (2026-10-17, fleet): the `includePrerelease` flip means stale third-party
  floors **do not** get rows disabled on an alpha host — the 0.1.7-era "prerelease trap blocks
  activation" behavior is gone in this corridor. What actually kills unadapted third-party
  plugins is the **runtime surface**: e.g. a row whose `inject` lists the removed `webRuntime`
  service stays PENDING forever (the plugin never activates — no crash, the feature just
  vanishes), and terminal-relay code calling the deleted `follow`/`write` remotes fails on use.
  Audit third-party plugins by scanning their built `lib/` for removed symbols, not by their
  declared ranges.
- **Field note** (2026-10-17, fleet): **0.2.1-rc.1 is a version-gate release** — the tag range
  over alpha.5 is 4 commits: the version bump plus vendored finals (cordis 4.0.5, cosmokit
  1.8.6, schemastery 3.18.5, loader/timer/logger-console finals). No API changes; the whole
  adaptation is floors (`^0.2.1-alpha.5` → `^0.2.1-rc.1`, vendored alpha pins → finals) and
  vendor re-sync. **npm lands before git**: the rc.1 packages appeared on the npm dist-tag
  `next` hours before `dsh-v0.2.1-rc.1` was pushed — scope the delta fast with
  `npm diff --diff=<pkg>@alpha.5 --diff=<pkg>@rc.1 --diff-name-only` (a version-only result
  means floors-only work), but vendor-sync ladders and the host SOP still block on the git
  tag (`DEEPSEEK_HARNESS_VERSION` checks out `dsh-v${version}`). Keep a `git ls-remote --tags`
  watcher running and sequence host-upgrade → plugin-swap accordingly.
- **Field note** (2026-10-17, fleet): **floor sweeps have escaped-regex blind spots**. Guard
  specs pin versions inside regex literals (`/^\^0\.2\.1-alpha\.5$/` — backslash-escaped dots),
  so a plain `grep '0.2.1-alpha.5'` misses them; also sweep `alpha\.`-style escaped forms
  (`rg '0\\\.2\\\.1'`) and watch for pin points without a package prefix (e.g. an e2e helper's
  `DSH_EXPECT_VERSION:-0.2.1-alpha.5` default — a whole-string replace leaves it behind while
  the baseline spec asserts both lines). The version constants live in the repo's
  baseline-guard spec family and its siblings; treat them as first-class floor surface.
- **Field note** (2026-10-16, Windows, 28-plugin fleet): a line-oriented edit of the
  `peerDependencies` block only (leave `devDependencies` untouched — local `@deepseek-ai` dev deps
  resolve through junctions, not the registry) upgraded 29 manifests without breaking any
  `pnpm-lock.yaml`; plugins with no `@deepseek-ai` peers (data-only presets, skills repos) need no bump.

### DSH-0.2.1-J1-02 · the runtime-invariants system is removed wholesale

- **Type**: breaking
- **Applies to**: plugins importing `@deepseek-ai/dsh-invariants`, any `<pkg>/invariant` subpath
  (38 packages had one), `ctx.invariants`, or `InvariantRegistry`/`InvariantInstaller`/
  `InvariantFailure`/`InvariantError`; profiles patching `invariants`/`session-invariant`/
  `agent-invariant`/`scope-invariant`/`agent-loop-invariant`.
- **Touchpoints**: #1 for imports; #3 for the service.
- **Action level**: required-if-hit
- **Symptoms**: `ERR_MODULE_NOT_FOUND` for the package or subpath; loader failure at startup for
  `cordis.yml`/patch rows naming them; `patch: entry <id> not found` for those five ids; the four
  emitters (`credentials/reference-updated`, `credentials/record-updated`, `authorization/settled`,
  `llm/adapters-updated`) now log `INVARIANT` failures instead of re-throwing.
- **Migration recipe**: delete the rows, patch entries, and dependencies; if the plugin genuinely
  shipped an `src/invariant.ts`, fold its checks into the owning plugin's normal validation. The
  official guide is `docs/upgrade-guide/v0.2.0-rc.2/remove-runtime-invariants/guide.md` at the tag.
- **Verification**: a grep for `dsh-invariants|/invariant|ctx\.invariants|Invariant` over the plugin
  comes back empty; the profile boots without `patch: entry … not found`.
- **Source**: [alpha.5 `docs/upgrade-guide/v0.2.0-rc.2/remove-runtime-invariants/guide.md`](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-alpha.5/docs/upgrade-guide/v0.2.0-rc.2/remove-runtime-invariants) · alpha.5 tree-wide absence: `git grep -l '"./invariant"' dsh-v0.2.1-alpha.5` = 0 hits (rc.2 = 38)

### DSH-0.2.1-J1-03 · the `webRuntime` service is replaced by `webStartup`

- **Type**: breaking
- **Applies to**: host-half plugins that `inject: [webRuntime]` or read `ctx.get('webRuntime')`
  (typically for `trustedHosts` in a custom trust fence), and profiles patching the `web-runtime`
  row's `trustedHosts`.
- **Touchpoints**: #3 for the service; #6 for trust fences.
- **Action level**: required-if-hit
- **Symptoms**: a row injecting `webRuntime` never activates (the service never exists — the row
  waits forever); `ctx.get('webRuntime')` is permanently `undefined`, silently degrading the fence
  to loopback-only; a patch row overriding `web-runtime.trustedHosts` no longer changes browser trust.
- **Migration recipe**: the `web-startup` row (package `@deepseek-ai/dsh-web-app`,
  `packages/bundle/web-app/src/startup.ts`) now provides the `webStartup` service
  (`WEB_STARTUP_SERVICE = 'webStartup'`), carrying `trustedHosts` parsed from repeatable
  `--trusted-host` flags. Change `inject: [..., 'webRuntime']` → `'webStartup'` and
  `ctx.get('webRuntime')` → `ctx.get('webStartup')` — the field name `trustedHosts` is unchanged.
  **The `connection` row still publishes `config.trustedHosts`** (now
  `!!js ctx.webStartup.trustedHosts`), so a plugin that live-reads the connection row's config
  through `ctx.loader.entries()` keeps working untouched. Deployments pass
  `dsh --profile web --trusted-host app.internal` instead of editing patch YAML.
- **Verification**: with `--trusted-host x` the plugin's fence accepts a request whose authority is
  `x`; without it only loopback connects; `pnpm typecheck` shows no `webRuntime` residue.
- **Source**: [alpha.5 `packages/bundle/web-app/src/startup.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.5/packages/bundle/web-app/src/startup.ts) · [alpha.5 `packages/bundle/web-app/cordis.patch.yml`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.5/packages/bundle/web-app/cordis.patch.yml)
- **Field note** (2026-10-16, fleet): two of the swept plugins injected `webRuntime` for their
  WS trust fences; both migrated by renaming the service in `inject` + `ctx.get` with zero further
  changes. A third plugin that reads the `connection` row via `ctx.loader.entries()` needed **no**
  change — verify which pattern a plugin uses before editing. A fourth access pattern exists:
  structural context casts (`ctx as unknown as MyShape`) reading `ctx.webStartup?.trustedHosts`
  as a plain property — rename the interface member there. `pnpm test` on pnpm ≥ 12 may print an
  install-looking `verify-deps-before-run` relink from the local store on first run; that is not
  a registry fetch.

### DSH-0.2.1-J1-04 · the `{{cwd}}` prompt variable is removed

- **Type**: breaking
- **Applies to**: custom personas, `personaSuffix`, preset `suffix` fields, or any system-prompt
  template text containing `{{cwd}}`.
- **Touchpoints**: #1 for prompt templates.
- **Action level**: required-if-hit
- **Symptoms**: the variable no longer interpolates; a template that keeps `{{cwd}}` **fails at the
  first model request** (assembly error, not load time), so the breakage hides until the first turn.
- **Migration recipe**: delete the clause. The current directory is now provided by the Session
  working-directory context; a subprocess that needs an explicit directory takes it from the
  subagent start request's `cwd`.
- **Verification**: `rg '\{\{cwd\}\}'` over the plugin/preset is empty; a first turn after upgrade
  runs without an assembly error.
- **Source**: [alpha.5 `packages/core/agent-loop/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.5/packages/core/agent-loop/src/index.ts) (only `provider`/`model` variables remain)
- **Field note** (2026-10-16, fleet): local presets carried
  `suffix: Your working directory is {{cwd}}.` — plain deletion is correct; do not substitute
  `{{provider}}`-style placeholders.

### DSH-0.2.1-J1-05 · the subagent delegation model is reworked

- **Type**: breaking
- **Applies to**: plugins calling `ctx.subagents.start(provider, request)` / `startContinuable(…)` /
  importing `settleRun`, `ContinuableStart(Spec)`, `SubagentRun`, `SubagentDescriptorInput`,
  `OneShotSubagentDescriptorInput`, `resolveChildCwd`, `validateConfiguredCwd`; tools exposing
  `run_in_background` and results collected via `job_output`/`job_kill`; anything passing
  `persona`/`toolFilter` inside a start request.
- **Touchpoints**: #1 for imports; #3 for the service; #5 for the tool surface.
- **Action level**: required-if-hit
- **Symptoms**: compile errors on the removed exports; `ctx.subagents.start is not a function`;
  requests carrying `persona`/`toolFilter` are rejected at capability assertion; the official
  `subagent` tool no longer offers `run_in_background` and returns
  `{ kind: 'activation', subagentId }` immediately, with the result delivered by a parent
  completion notice.
- **Migration recipe**: one call shape now serves every path —
  `await ctx.subagents.startActivation({ provider, label, request, signal, delivery })` where
  `request: Omit<SubagentStartRequest, 'label' | 'signal'>` (`prompt`, `parent`, optional `cwd`,
  `agentPreset`, `agentOptions`, `outputSchema`, `maxDepth`) and `delivery: 'parent' | 'caller'`.
  `parent` notifies the parent model on completion (the official default);
  `caller` resolves `activation.result: Promise<SubagentResult>` at the call site (the old
  foreground path — pair with `activation.dispose()`, both still exist on the returned
  `SubagentActivation`, which also carries `childId` and an optional accepted `messageId`).
  `persona`/`toolFilter` have no successor fields — personas come from agent presets
  (`agentPreset` id) and tool filters are gone. A reserved `childId` is only legal for a local
  (continuable-capable) backend. Depth still flows through `resolveMaxDepth`. The jobs API
  (`JobSpec`/`jobs.start`, `owner: SessionId`) is unchanged in shape, so a plugin-owned one-shot
  background path can keep using it — just feed it `startActivation` instead of the removed `start`.
- **Verification**: `rg 'startContinuable|settleRun|SubagentRun|run_in_background'` is empty (or the
  plugin documents its own tool schema); a delegation returns an activation id; `delivery: 'caller'`
  resolves and `dispose()` settles.
- **Source**: [alpha.5 `packages/subagent/subagent/src/types.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.5/packages/subagent/subagent/src/types.ts) · [alpha.5 `packages/subagent/subagent/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.5/packages/subagent/subagent/src/index.ts) · [alpha.5 `packages/subagent/tool-subagent/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.5/packages/subagent/tool-subagent/src/index.ts) · [alpha.5 `packages/jobs/jobs/src/types.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.5/packages/jobs/jobs/src/types.ts)
- **Field note** (2026-10-16, fleet): **`JobKindMap` lost its `subagent` member** — rc.2 declared
  `{ bash, subagent }`, alpha.5 only `{ bash }`. A plugin that keeps a jobs-backed path now fails
  `jobs.start({ kind: 'subagent', … })` with `TS2322`. Declare your own kind the official way
  (as `tool-pwsh`/`tool-workflow` do): `declare module '@deepseek-ai/dsh-jobs' { interface JobKindMap { subagent: 'subagent' } }`.

### DSH-0.2.1-J1-06 · a band of profile/config keys is deleted

- **Type**: breaking
- **Applies to**: profile patches and plugin configs carrying any of: `tool-subagent`'s
  `backgroundMode`/`enableRunInBackground`/`persona`/`toolFilter` (the latter two throw in
  `apply`), `subagent-acp`/`subagent-dsh-sdk` `config.cwd`, `agent-instructions` `dshHome`,
  `dsh-experimental-agent-team` `maxPendingMessagesPerMember`, `dsh-web-app` `trustedHosts`,
  `llm-deepseek-account` `models` (loading-time stop; models now come from the account listing,
  per-model tweaks via `modelOverrides`), `session-title-llm` `targetWords`/`targetCjkCharacters`.
- **Touchpoints**: #1 for config keys.
- **Action level**: required-if-hit
- **Symptoms**: load-time failure or `apply`-time throw naming the key — not silent degradation.
- **Migration recipe**: delete each listed key from `cordis.patch.yml`/`cordis.yml` overlays;
  replace `llm-deepseek-account.models` with `modelOverrides`; subagent child directories move to
  the start request `cwd`; the `dshHome` concept is `resolveDshHome()` (`$DSH_HOME` → `~/.dsh`).
- **Verification**: the profile boots clean; `dsh --profile <p> --dump-config-schema` shows no
  removed keys.
- **Source**: [alpha.5 `docs/upgrade-guide/`](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-alpha.5/docs/upgrade-guide) series for the corridor · [alpha.5 `packages/bundle/headless/cordis.patch.yml`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.5/packages/bundle/headless/cordis.patch.yml)
- **Field note** (2026-10-16, fleet): a **plugin-owned** config key named like a removed host key
  (e.g. the plugin's own `backgroundMode` selecting among its own code paths) is unaffected — the
  removals bind to the official rows' Config schemas, not to plugin vocabularies. Verify the row
  id each key targets before deleting.

### DSH-0.2.1-J1-07 · tool presentation `mode: 'both'` is rejected at assembly

- **Type**: breaking
- **Applies to**: configs setting `mode: both` (or env `DSH_TOOLS_MODE=both`) on tool presentation
  / `agent-tool-presentation`.
- **Touchpoints**: #1.
- **Action level**: required-if-hit
- **Symptoms**: assembly-time rejection; `ToolPresentationMode` is `'native' | 'ptc'`.
- **Migration recipe**: choose `native` or `ptc`; scrub CI/shell exports of `DSH_TOOLS_MODE=both`.
- **Verification**: profile boots; `rg "'both'"` over config surfaces finds only string literals
  unrelated to presentation.
- **Source**: [alpha.5 `packages/core/tools/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.5/packages/core/tools/src/index.ts)

### DSH-0.2.1-J1-08 · client-plugin API removals

- **Type**: breaking
- **Applies to**: Web client plugins importing from `@deepseek-ai/dsh-client-ui-primitives` /
  `-ui-tool`: `projectUserText`/`UserTextReferences`, `ToolCallHookContext`/`ToolCallInjected`/
  `UseToolCallArgumentsPartial` (the `tool.call.toolview` **hook-context** exports; the slot itself
  and its `PropsRuntime` phases are intact), `RenderMessageImages`, `FontSizeRowComponentProps`/
  `FontSizeRowInjected`/`FontSizeRowState` (→ `FontSettingsGroupProps`/`FontSettingsInjected`/
  `FontRowState`), and `ThemeSnapshot.fontSize: number` (→ `fontSizes`/`fontFamilies`).
- **Touchpoints**: #1 for imports; #5 for rendered UI.
- **Action level**: required-if-hit
- **Symptoms**: unresolved build imports / `undefined` at render; settings rows built on
  `FontSizeRow*` stop compiling.
- **Migration recipe**: `projectUserText(text, refs, skills)` → compose `UserTextRun` (verbatim
  inline run; no Markdown/reference recognition) and `ReferenceChip({ appearance, label, title,
  onActivate? })` yourself — matching/activation is now the caller's business rule; the upstream
  `ui-chat` composer is the reference consumer. Streaming-argument partials are no longer exposed
  as a standalone hook: during the `preparing` phase the streamed arguments live in
  `block.args` (a `PartialArguments` lazy view from `@deepseek-ai/dsh-util-values`) — mirror the
  host `ui-tool` `argumentSummary` (file-shaped tools read the completed `file_path`, others read
  the streaming `description`) instead of reading a raw prefix. Font settings migrate to the
  `FontSettingsGroup*` family over `ThemeSnapshot.fontSizes`/`fontFamilies` (text/code/terminal
  are configured independently).
- **Verification**: `rg -i 'projectUserText|FontSizeRow|ToolCallHookContext|RenderMessageImages|useToolCallArgumentsPartial'`
  over **`src/` and `tests/ together** is empty (case-insensitive: the deleted hook was the prop
  `useToolCallArgumentsPartial`, not only the type `UseToolCallArgumentsPartial`); user-echo rows
  render references as chips with working activation.
- **Source**: [alpha.5 `packages/client/ui-primitives/src/user-text.tsx`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.5/packages/client/ui-primitives/src/user-text.tsx) · [alpha.5 `packages/client/ui-tool/src/client/contract/slots.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.5/packages/client/ui-tool/src/client/contract/slots.ts)
- **Field note** (2026-10-17, fleet): **image rendering moved to a factory slot and the official
  side reclaimed slot ownership** — rc.2 `ChatNodeOwnerProps` carried `openSkill`/`loadImage`/
  `renderMessageImages`; alpha.4 leaves `openFile`/`loadImage`/`inspectCall`/`forkAt`/
  `fileMentions`, images render through the factory slot `conversation.chat.user.images` +
  `renderFactorySlot`, and the official `UserMessageNodeView` signature is now
  `{ node, renderFactorySlot, loadImage, t }`. A third-party shadow renderer that declared the
  `user.images` children itself or drew the bubble from the old owner props is **silently never
  invoked** — the exact failure behind "message action buttons stopped rendering" in a fleet
  plugin: zero type errors, zero load errors, the row just disappears. Port to the factory-slot
  consumption shape (upstream `ui-chat` is the reference) instead of re-declaring the slot.
  For display-only echo text (no activation behavior), a plain `UserTextRun` plus non-interactive
  `ReferenceChip`s is a faithful drop-in; do not re-implement the old parser to "keep chips
  inline" — the new contract wants resolved JSON data. Dropping the raw-prefix hook is
  **user-visible**: a preparing card that used to show a JSON prefix now shows the summarized
  streaming argument. Also scan built artifacts — a stale `lib/` still carries removed symbols,
  so grep residue **after** `pnpm run build`, not before.
- **Field note** (2026-10-17, fleet): **the client row is served by `exports["./client"]`'s
  `default` condition and must be the wrapped factory.** The host resolves that one condition
  (string form or `{ default }`; `import`/`require`/`types` are ignored) and serves the file as
  a **classic script**; it must be the `window.__ModuleLoader__.load({ id, factory:
  (require) => … })` CJS registration script. A `default` pointing at the raw ESM library
  (bare `import … from "react"` statements) is a guaranteed parse error: the row dies with
  `loaded without registering "<pkg>" via __ModuleLoader__.load`, the batch URL first fails
  and later shows as `skipped after an earlier failure of this bundle`, and the host-side boot
  log stays **completely clean** — client-row breakage is invisible without a browser.
  Bundler presets that derive the client factory's externals from `peerDependencies` will
  bare-`require` any client-side shared library left in peers, demanding a module-table row
  the library may no longer ship; move such libraries to devDependencies so the factory
  bundles them (host faces are unaffected — their external rules read `dependencies`).

### DSH-0.2.1-J1-09 · `TerminalBlockLabels` gains the required `commandLine(line)` member

- **Type**: breaking
- **Applies to**: any plugin constructing a `TerminalBlockLabels` object (locale helpers for
  `TerminalBlock` in `@deepseek-ai/dsh-client-ui-primitives`).
- **Touchpoints**: #1 for the type; #5 for a11y.
- **Action level**: required-if-hit
- **Symptoms**: TypeScript error (missing member); without it a horizontally overflowing command
  line has no accessible name or tab stop.
- **Migration recipe**: add `commandLine: (line: number) => string` to the labels object, backed by
  the plugin's locale dictionary (the block itself calls it with the 1-based line index).
- **Verification**: typecheck passes; an overflowing terminal command exposes the per-line label.
- **Source**: [alpha.5 `packages/client/ui-primitives/src/TerminalBlock.tsx`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.5/packages/client/ui-primitives/src/TerminalBlock.tsx)
- **Field note** (2026-10-16, fleet): plugins that centralize labels in one `terminalLabels(t)`
  helper fix this in a single place; remember the dictionary key must be added to **both**
  language files when the plugin carries zh/en dictionaries.

### DSH-0.2.1-J1-10 · npm package-set churn

- **Type**: breaking
- **Applies to**: dependency lists, `cordis.patch.yml` inserts, and build configs naming moved or
  removed packages.
- **Touchpoints**: #1.
- **Action level**: required-if-hit
- **Symptoms**: `ERR_MODULE_NOT_FOUND` / loader "cannot find package"; deep-referencing build
  configs break on the three packages whose `./client` became a conditional export
  (`dsh-api-gateway`, `dsh-client-connection`, `dsh-typert-registry` — specifier `pkg/client`
  unchanged, hardcoded `lib/client.js` now wrong).
- **Migration recipe**: removed — `dsh-invariants` (J1-02), `dsh-experimental-schedule-bundle`
  (→ `dsh-tool-schedule` + `dsh-web-app`'s own `schedule`/`ui-schedule` rows),
  `dsh-subagent-in-process-driver` (→ merged into `dsh-subagent`). Added (28) include
  `dsh-api-remote-access`, `dsh-client-ui-plugin-market`, `dsh-client-ui-secret-mask`, `dsh-cua`,
  `dsh-plugin-market*`, `dsh-tool-working-directory`, `dsh-working-directory`, the
  `dsh-experimental-{claude-code-mods, session-inspector, session-search, translator, worktree,
  …}` family. 192 same-name packages additionally export `./locale/*.json` (client copy ships with
  the package; add the subpath to `files`/`exports` when a plugin adopts it).
  `dsh-experimental-inspector` no longer ships a `cordis.patch.yml` subpath.
- **Verification**: `pnpm why <pkg>` resolves for every name the plugin declares; a grep for the
  removed names is empty.
- **Source**: [alpha.5 tree `packages/**/package.json` `name` census (362 vs 337)](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-alpha.5/packages) · [alpha.5 `apps/cli/package.json`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.5/apps/cli/package.json)

### DSH-0.2.1-J1-11 · session data upgrades one way

- **Type**: breaking
- **Applies to**: deployments holding `$DSH_HOME/sessions` (and SQLite derivatives); anything that
  downgrades after running the new host.
- **Touchpoints**: #4 for stored data.
- **Action level**: required
- **Symptoms**: downgrade direction: an rc.2 reader **rejects** any log containing
  `job/registered`, `job/settled`, `working-directory/change` (all non-`ignorable`) or a
  `subagent/catalog` v2 record — and the `base` profile mounts `dsh-jobs-local` and
  `dsh-working-directory` by default, so nearly every tool-running session writes them.
- **Migration recipe**: back up `$DSH_HOME/sessions` (and `storages/*.sqlite`) before upgrading;
  treat downgrade as unsupported. Upgrade direction is safe: v3→v4 guards, the JSONL frame format,
  and the SQLite schema versions (`SESSION_QUERY_SQLITE_SCHEMA_VERSION` = 8) are unchanged; derived
  stores open without reset.
- **Verification**: after upgrade, pre-upgrade sessions list and open; keep the backup until the
  new host has run a few days.
- **Source**: [alpha.5 `packages/core/session/src/known-event-types.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.5/packages/core/session/src/known-event-types.ts) · [alpha.5 `packages/session/session-format-v3-to-v4/src/validation.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.5/packages/session/session-format-v3-to-v4/src/validation.ts)
- **Field note** (2026-10-16, Windows): `robocopy` of a 565 MB sessions tree took < 1 s on SSD;
  there is no excuse to skip it.

### DSH-0.2.1-J1-12 · CLI and deployment reversals

- **Type**: breaking
- **Applies to**: scripts driving `dsh` (plugin add/update, profile bootstrap, host binding,
  headless jobs).
- **Touchpoints**: none (CLI surface)
- **Action level**: required-if-hit
- **Symptoms**: (a) `dsh plugin add <pkg> --profile <name>` now errors
  `required option '--profile <name>' not specified`; (b) re-running
  `--from-default-profile <name>` **deletes and replaces** the target profile directory
  (`node_modules`, `cordis.patch.yml` included); (c) `--host 0.0.0.0` (any wildcard) is refused at
  load — a concrete local IPv4/IPv6 literal is required; (d) credentials now resolve
  `$DSH_HOME/.credentials.yaml` **before** the environment (silent account switch when both hold
  the same key); (e) the headless profile disables credentials/authorization/DeepSeek-account rows
  — only startup env/`.env` authenticate.
- **Migration recipe**: write `dsh plugin --profile <name> <args>`; drop `--from-default-profile`
  from start scripts (use it only to intentionally reset a profile, after backing up
  `cordis.patch.yml`); bind `--host 127.0.0.1` or a LAN literal, add `--public-url`/`--tls-cert`/
  `--tls-key` when exposing; deduplicate stored vs exported credentials; export
  `DEEPSEEK_API_KEY` for headless or restore the three disabled rows per the headless README.
- **Verification**: each rewritten script runs twice idempotently; the host binds the literal
  address; headless authenticates.
- **Source**: [alpha.5 `apps/cli/src/args.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.5/apps/cli/src/args.ts) · [alpha.5 `packages/host/webserver`](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-alpha.5/packages/host/webserver) · [alpha.5 `packages/credentials/credentials-local/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.5/packages/credentials/credentials-local/src/index.ts) · [alpha.5 `packages/bundle/headless/cordis.patch.yml`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.5/packages/bundle/headless/cordis.patch.yml)

### DSH-0.2.1-J1-13 · the client performs a host-release handshake

- **Type**: breaking
- **Applies to**: every open browser tab across a host upgrade; custom web clients.
- **Touchpoints**: none (deployment surface)
- **Action level**: required
- **Symptoms**: `__DSH_BOOT__` now carries `release{version, commit?}`; a page whose boot release
  differs from the host's announces `ClientReleaseChange` and **pauses plugin updates** (plugins
  stay at the old graph) until refresh — a half-upgraded session that looks alive but ignores new
  plugin code. Old↔new pairings additionally lose the terminal panel (`terminal/attach` is new)
  and remote-access surfaces.
- **Migration recipe**: after every host upgrade, restart `dsh web` **and** hard-refresh open tabs
  (`Ctrl+Shift+R`). Pin clients and host to the same release.
- **Verification**: the browser console shows no `ClientReleaseChange`; the Plugins page reflects
  the new versions.
- **Source**: [alpha.5 `packages/client/modules`](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-alpha.5/packages/client/modules) (release compare + `ClientReleaseChange`) · [alpha.5 `packages/api/terminal-controller/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.5/packages/api/terminal-controller/src/index.ts)

### DSH-0.2.1-J1-14 · `dsh-tools` requires `dsh-working-directory`

- **Type**: breaking
- **Applies to**: compositions mounting `@deepseek-ai/dsh-tools` (or the SDK server) without the
  new working-directory package; anything reading the sdk-minimal default tool set.
- **Touchpoints**: #3 for assembly.
- **Action level**: required-if-hit
- **Symptoms**: the SDK-server plugin does not mount (`inject` grew `'workingDirectory'`); minimal
  profiles silently gain tools (`read_image`, `working_directory`, compaction plugins) and may
  auto-compact under pressure (an extra model request).
- **Migration recipe**: add `@deepseek-ai/dsh-working-directory` beside `dsh-tools` (the shipped
  bundles already do); re-benchmark tool-name-locked or per-request-billed consumers.
- **Verification**: an SDK server session boots and answers `session/working-directory/get`.
- **Source**: [alpha.5 `packages/sdk/server/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.5/packages/sdk/server/src/index.ts) · [alpha.5 `packages/bundle/sdk-minimal/cordis.patch.yml`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.5/packages/bundle/sdk-minimal/cordis.patch.yml)

### DSH-0.2.1-J1-15 · `dsh-session-persistence-jsonl` loses its default export

- **Type**: breaking
- **Applies to**: SDK consumers importing the JSONL persistence class directly.
- **Touchpoints**: #1.
- **Action level**: required-if-hit
- **Symptoms**: `import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'`
  fails to compile.
- **Migration recipe**: namespace-import the plugin (`import * as JsonlSessionPersistence from …`)
  and mount via `ctx.plugin(JsonlSessionPersistence, config)`; type service injections as
  `SessionPersistence`.
- **Verification**: compile + a session round-trips through JSONL.
- **Source**: [alpha.5 `packages/session/session-persistence-jsonl/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.5/packages/session/session-persistence-jsonl/src/index.ts)

### DSH-0.2.1-J1-16 · protocol-peer breakages (terminal, Peer, projections)

- **Type**: breaking
- **Applies to**: protocol peers and SDK consumers of the terminal controller, gateway identity,
  or session projections — not ordinary plugins.
- **Touchpoints**: #3.
- **Action level**: required-if-hit
- **Symptoms**: terminal Remote `follow`/`write`/`resize` are gone (single duplex `attach` returning
  `RemoteStream<TerminalFrame, TerminalInput>` with `ack` frames); `InvokeRemoteRequest.peer` and
  stream opens require an explicit peer (new errors `gateway/peer-disposed`,
  `gateway/interactions-forbidden`); `OperatorPeer` → `Peer`, `HostConnectionHandle.operator` →
  `browserPeer`, `ConnectionFetchHandler.fetch(request, peer)`; `session/projections` returns
  `{ kind: 'sequenced' | 'migration-required' } | null` (cold sessions needing migration read as
  `migration-required`, not a normal sequence); non-owner `list`/`search`/`control` pass through
  `remoteAccess` policies (`/connect` launch-token exchange issues v2 cookies; v1 still accepted).
- **Migration recipe**: port terminal panels to `terminal/attach` + `ack`; thread the peer through
  fetch/gateway calls; treat `migration-required` as a distinct UI state; adopt `/connect` for
  remote principals. The SDK JSON-RPC wire protocol itself is purely additive (`session/resume`,
  `session/wait`, `session/working-directory/{get,set}`). **Host-side in-process consumers** of
  `ctx.terminalController.attach` must synthesize a `RemoteInvocation` (request/service/peer/
  signal/uplink) and reach the service through `ctx.extend({ invocation }).terminalController` —
  the service reads `this.ctx.invocation` and throws without one; the gateway dispatcher and the
  upstream controller spec are the reference patterns.
- **Verification**: old↔new pairing matrix shows only the terminal/remote-access faces dead; both
  same-release sides pass.
- **Source**: [alpha.5 `packages/api/terminal-controller/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.5/packages/api/terminal-controller/src/index.ts) · [alpha.5 `packages/client/connection/src/peer.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.5/packages/client/connection/src/peer.ts) · [alpha.5 `packages/api/gateway/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.5/packages/api/gateway/src/index.ts) · [alpha.5 `packages/api/session-controller/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.5/packages/api/session-controller/src/index.ts)
- **Field note** (2026-10-16): third-party host-companion plugins riding the old terminal remotes
  (e.g. remote-relay bridges) break until their authors port to `attach` — not fixable from the
  profile side. **Plugin unit tests are also in scope**: any test that drives the real `/api`
  carrier (`createSharedFetchHandler('/api').fetch(request)`) now crashes with
  `TypeError: Cannot read properties of undefined (reading 'principal')` — the peer argument is
  mandatory and exact routes admit only `principal.kind === 'owner'`. Pass
  `connection.createPeer({ principal: { kind: 'owner' } })` as the second argument.
- **Field note** (2026-10-17, fleet, host-side port): `WebTerminalInfo.controllerId` is gone —
  control is now a per-follower `writable` bit on `snapshot`/`state` frames, and a running
  terminal with no controller is indistinguishable from a user-controlled one. `write` semantics
  changed from a synchronous RPC to an async per-attachment ack: inputs are numbered from 1 per
  attachment (a gap kills the stream), refusal arrives as `ack.refusal: 'read-only' |
  'not-running'` instead of an exception, and preserving "send resolves when delivered" requires
  your own waiter. One input over `maxInputBytes` (default 64 KiB) kills the whole attachment
  stream as an infrastructure error, not a refusal.

### DSH-0.2.1-J1-17 · hooks/webhook/Ralph leave the CLI dependency set

- **Type**: behavior
- **Applies to**: profiles relying on `dsh-hooks-claude-code`, `dsh-hooks-codex`, `dsh-tool-ralph`,
  `dsh-webhook`, `dsh-webhook-github` being present by default.
- **Touchpoints**: #3.
- **Action level**: required-if-hit
- **Symptoms**: the packages still publish but the CLI composition no longer mounts them; rows
  referencing them fail to resolve.
- **Migration recipe**: install explicitly with their peers, e.g.
  `dsh plugin --profile <p> add @deepseek-ai/dsh-hooks-claude-code @deepseek-ai/dsh-hook-protocol`
  (GitHub adapter also `@deepseek-ai/dsh-webhook`).
- **Verification**: the row resolves and the hook fires.
- **Source**: [alpha.5 `apps/cli/package.json`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.5/apps/cli/package.json)
- **Field note** (2026-10-16, fleet): Ralph is a partial case — `dsh-tool-ralph` left `apps/cli`
  dependencies but the new `@deepseek-ai/dsh-experimental-ralph-bundle` (a CLI dependency) carries
  it transitively, so a profile selecting that bundle keeps `tool-ralph` without extra installs;
  only hand-rolled compositions need the explicit add.

### DSH-0.2.1-J1-18 · fleet-upgrade mechanics on Windows (toolchain card)

- **Type**: behavior
- **Applies to**: operators sweeping a plugin fleet against a source checkout (`~/.dsh/source/current`).
- **Touchpoints**: none (toolchain)
- **Action level**: informational
- **Symptoms**: environment/toolchain failures during the sweep, one per pitfall below:
  1. `pnpm install` in the upgraded tree fails `resolve pnpm@11.28.5 … npmmirror` when the mirror
     lags the fresh release; 2. two `pnpm install`s racing in "different" trees corrupt
     `node_modules` (`ENOENT … @anthropic-ai/sdk`, `EPERM unlink …`) when `~/.dsh/source/current`
     is a **junction** to the dev clone — they are the same physical tree; 3. `pnpm peers check`
     floods with "missing peer" noise because link-installed plugins' peers resolve from the host
     tree at runtime; 4. plugins whose `node_modules/@deepseek-ai/*` are **relative** junctions into
     the source tree need **no** `pnpm install` after a host upgrade — a rebuild
     (`pnpm run build`) suffices; 5. profile-pinned `@deepseek-ai/*@0.2.0-rc.2` entries must be
     hand-bumped (link-installed plugins are not updated by `dsh plugin update`); 6. `rm -rf` in
     build scripts does not exist on Windows — `Remove-Item -Recurse -Force` first.
- **Migration recipe**: export `npm_config_registry=https://registry.npmjs.org/` for the
  bootstrap install (`--prefer-offline` keeps the bulk local); run **one** install at a time;
  bump profile pins then `pnpm install` in the profile; per plugin run `pnpm typecheck && pnpm test
  && pnpm run build` and verify `lib/` artifacts; never launch `dsh web` from an automation agent.
- **Verification**: `node ~/.dsh/source/current/apps/cli/lib/bin.js --version` prints
  `0.2.1-alpha.5`; `Test-Path …/apps/cli/lib/bin.js` and `…/packages/bundle/web-app/lib/index.js`.
- **Source**: [alpha.5 `pnpm-workspace.yaml` (`packageManager: pnpm@11.28.5`)](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.5/pnpm-workspace.yaml) · local fleet run 2026-10-16 (Windows 11, shared pnpm store, 28 plugins)
- **Field notes** (2026-10-16, fleet, all first-hand):
  1. **Junction false-green** — a plugin's `node_modules/@deepseek-ai/*` may be pnpm store
     symlinks resolving the **old** rc.1/rc.2 copies, so typecheck/test "pass" against stale
     types. Probe **every** `@deepseek-ai/*` link, not one:
     `node -e "console.log(require('./node_modules/@deepseek-ai/<pkg>/package.json').version)"`.
     A vendored package declared as a plain `dependencies` entry (schemastery is the repeat
     offender) escapes both the peer bump and the junction sweep. Fix by replacing the links
     with junctions into the built source tree.
  2. **Vendor peers live in `dsh/vendor/{cordis,schemastery,cosmokit,loader,include}`**, not
     under `packages/`; workspace packages are found by `package.json` `name`, **not** directory
     name (`packages/client/ui-tool` hosts `@deepseek-ai/dsh-client-ui-tool`). Types live in
     `lib/types/index.d.ts`. On Windows `mklink /J` (and junction creation in general) must be
     given an **absolute** target — a relative target resolves against the process CWD and
     silently produces a wrong link.
  3. After relinking, `tsc -b --clean` then a full pass — `tsbuildinfo` incrementals can mask the
     switch. Also note a rebuilt bundle **freezes dependency provenance**: when the code body is
     unchanged, the only signal that a bundle linked stale store copies is its `//#region` path
     comments.
  4. Run a **baseline** `pnpm test` before touching anything: one fleet repo had carried red
     tests since the *previous* upgrade (its release never ran the suite); new/old debt must be
     separated before you claim the jump broke anything.
  5. pnpm ≥ 12 `verify-deps-before-run` may silently relink from the local store **and rewrite
     `pnpm-lock.yaml`** on the first `pnpm <script>` — review and commit that diff; reverting it
     strands a stale lockfile. Stale `minimumReleaseAgeExclude` entries naming old store versions
     (e.g. `schemastery@3.18.4`) are a regression channel: one fresh `pnpm install` under old
     devDep ranges pulls the old copies back.
  6. `gh pr create --body @- <<'EOF'` is bash-only; on pwsh write the body to a file and use
     `--body-file`. Check the repo's default branch (`master` vs `main`) before `gh pr create`.
  7. Repos without `.git` (local presets): `git init`, commit the pre-change baseline first —
     otherwise the upgrade diff is unreadable. If the peer bump already landed in the working
     tree before the baseline, fold it into the baseline commit and say so in the message
     (plugin lockfiles never record `peerDependencies`, so the old floors are otherwise
     unrecoverable — restate the peer delta in the PR body). A never-published plugin may lack
     the GitHub repo too: `git init -b master`, dshfind card/`.gitignore` check, then
     `gh repo create <org>/<repo> --public --source --push` + description/topics.
  8. Static-scan task lists can miss duplicated blocks (e.g. two presets copying the same rows);
     read the whole file and re-grep after editing (`rg '<removed-key>'` must go to zero).
  9. pwsh `Get-ChildItem -Recurse` over the full dsh tree can silently return nothing (deep/long
     paths); probe expected package paths directly instead.
  10. A tests tsconfig extending the main one inherits `rootDir: "src"` and fails with TS6059 —
     override `"rootDir": "."` (harmless under `noEmit`).
  11. `tsc -b --clean` **deletes tracked prebuilt `lib/`** output — run it before the baseline
     commit or restore `lib/` afterwards, or the baseline diff lies.
  12. pnpm ≥ 12 `verify-deps-before-run` may **replace a manual junction with a store symlink**
     on the next script run — manual junctions are scaffolding, not a stable state; what matters
     is that the resolved version probes correct. Bumping the range so the relink lands on the
     right version is the durable fix.
  13. **Host-only no-build plugins** (a single `index.js`, no scripts, no peers) have no card
     face at all: their compatibility lives entirely in the host services they read at runtime.
     Reverse-lookup every service from the plugin's `inject` array and `ctx.*` reads against the
     target tag's source; also check the webserver now **throws on duplicate routes at startup**
     — both `exact` **and `prefix`** `(kind, path)` pairs are deduplicated, so an upstream route
     that later collides with yours fails the whole boot.
  14. **Externals-only bundles** (all `@deepseek-ai` imports left to the runtime module table)
     rebuild **byte-identical** across host versions by design — a clean `lib/` after rebuild is
     not evidence of a stale build; the compatibility proof is the typecheck plus the module
     table identity.
  15. Scan-tool traps: `rg -rn` is **replace-with-"n"**, not recursive-line-numbers — its output
     can fake an API rename. And runtime-optional imports (`createRequire(...)('…').loadOverlayPatches`
     style) escape import greps entirely; verify such exports against the tag's source by hand.
  16. Layered resolution means "false-green" has layers: tsconfig `paths` pointing straight into
     the source tree decouples **typecheck** from `node_modules` (junctions only matter for
     vitest runtime value imports and pnpm), and vitest configs that alias `~/.dsh/source/current`
     may test a **different tree** than the one your junctions point at — attribute per channel.
     Repos that gitignore `pnpm-lock.yaml`/`pnpm-workspace.yaml` (local dev-only) can't carry
     lockfile diffs in the PR; their stale `minimumReleaseAgeExclude` entries are per-machine
     manual cleanup. On the flip side, pnpm ≥ 12 `verify-deps-before-run` often **solves** the
     stale-lockfile problem for you by relinking from the local store — review what it wrote
     rather than assuming an install ran. Also note `tsdown`'s first-config `clean: true`
     deletes tracked `lib/` before rebuilding — same trap family as note 11.
  17. More false-green channels found in the wild: a test suite that **whole-mocks a host
     package** (`vi.mock('@deepseek-ai/dsh-tools')`) is blind to its API drift — green tests
     prove nothing about the host seam; only manual signature comparison plus an explicit `tsc`
     compensates. `src/client` can be excluded from **every** tsconfig (esbuild bundles without
     typechecking) — a wider silent-debt surface than untyped tests. A dead spec file whose name
     misses the vitest `include` glob has never executed. Bare `rg '{{cwd}}'` is a regex error
     (`{` is a quantifier) — exit **2**, not exit 1; check exit codes or escape as `\{\{cwd\}\}`.
     Temporary tsconfigs resolve `rootDir`/`typeRoots` relative to the **config file's own
     directory** — pass absolute paths or TS6059/TS2688 flood. On pwsh, piping an array into
     `Set-Content -NoNewline` concatenates without separators and corrupts YAML.
  18. **DOM-contract plugins** (no npm API surface; they couple to rendered markup like
     `[data-chat-running]` or locale copy like `深度求索中`) have no card face either — verify
     each DOM/locale touchpoint against the target tag's source, and add a README/AGENTS
     dev-setup freshness check to the sweep: two fleet repos carried two-generation-old
     dev docs (old peer strings, junction instructions that no longer match). Also
     `@types/react-dom`'s 18.3 line ends at **18.3.7** while `@types/react` reaches 18.3.31 —
     never copy one range to the other — and `pnpm peers check` noise may be entirely unrelated
     optional peers (jsdom's `@emnapi/*`); filter before concluding the `@deepseek-ai` face is
     dirty. When a fix spans two cards (vendored-as-`dependencies` needs **both** the J1-01 pin
     recipe and the J1-18 link sweep), apply both.
  19. **Vendored-source monorepos** are a third adaptation topology (beyond junction/registry):
     some third-party repos vendor the whole dsh tree with a patch series and a version pin
     (e.g. `mise.toml DEEPSEEK_HARNESS_VERSION`). Their upgrade is a vendor-sync ladder — bump
     the pin, re-run sync→patch→vendor→prebuild, and expect Windows-specific generator bugs
     (path-separator literals like `/packages/` splitting, backslash keys) and an `oxfmt .`
     pass at the end because vendored copies arrive unformatted. **Do not trust a Windows-built
     dist from such a repo**: one fleet repo's tsdown plugin on win32 silently dropped relative
     source modules from bundles (entry facades importing `./x.ts` files that were never
     emitted) and resolved `inline` targets to absolute backslash paths — every multi-module
     package's dist was unloadable while `build` exited 0. **Installing their unpublished
     adapted build** into a profile: prefer a **Linux CI artifact** (push a `workflow_dispatch`
     pack workflow to your fork — token `workflow` scope suffices) over two alternatives that
     bite: `pnpm pack` locally (broken dist on win32) and the maintainer's GitHub Packages feed
     (`npm.pkg.github.com` requires a `read:packages` token even for readable packages; the
     usual `gh auth token` lacks it). Reference all sibling packages as `file:` tarballs
     **and add matching `pnpm.overrides`** — pnpm otherwise queries the registry for the
     tarballs' internal exact-version deps (which do not exist there) and fails. Note some
     alpha.5 client packages **undeclare new third-party runtime deps** their `lib`
     bare-imports (`simple-icons`, `zod`, `picomatch`, `diff`) — a flat-tarball dev tree must
     add them to the plugin's devDependencies explicitly. **Verification must reach the browser**:
     a clean host boot log (zero `failed to import`, zero pending) says nothing about client rows —
     they load in the browser via `__ModuleLoader__.load` and fail silently host-side (J1-08 field
     note). And **reinstalling same-version `file:` tarballs after rebuilding them**: pnpm pins the
     old integrity in `pnpm-lock.yaml`, so `pnpm install --force` still reuses the stale copy —
     delete the lockfile (and `node_modules`) for a full re-resolution instead.
  20. **Temp worktrees do not belong in Temp** (or any `AppData` path): one repo's
      `bundledRgCandidates` derives `modulePath` from `process.argv[1]` (the vitest binary path)
      and its spec asserts candidates never contain `AppData` — a worktree under
      `C:\Users\...\AppData\Local\Temp` fails on directory-walk candidate collection alone. Put
      scratch worktrees on a project drive (`D:\Projects\...`). Two more environment tools:
      without corepack, align a repo's `packageManager` via `pnpm dlx pnpm@<ci-version> ...`
      (the global pnpm acts only as the dlx carrier; the lockfile format does not drift). And
      the cheapest regression test for a suspicious spec failure is a **control run on the
      untouched main worktree** — if it fails there too, record it as pre-existing instead of
      rolling back your own changes.

---

### DSH-0.2.1-J1-19 · the client conversation contract drifts — required `name`/`args` on tool records, `bottomSource` on the node store

- **Type**: breaking
- **Applies to**: Web client plugins (and their **test fixtures**) constructing `ToolResultNode`,
  `StartedToolCall`, `ToolCallHead`, or stubbing `ChatNodeStore` from
  `@deepseek-ai/dsh-client-ui-conversation` / `-ui-chat` / `-ui-tool`.
- **Touchpoints**: #1 for the types; #5 for toolview rendering.
- **Action level**: required-if-hit
- **Symptoms**: `TS2322`/`TS2739`/`TS2741` on fixtures (`src/` may compile clean while tests
  break); render specs fail wholesale. `ToolResultNode` and `StartedToolCall` now require
  top-level `name: string` and `args: ToolArgs` (a `PartialArguments` lazy view, exported from
  **`@deepseek-ai/dsh-util-values`** — frequently missing from the plugin's dev deps and
  junctions); `ChatNodeStore` requires `bottomSource(key): ObservableSnapshot<boolean>`.
- **Migration recipe**: fixtures add `name` and `args: PartialArguments.fromText(argsRaw)` (the
  host's own specs are the canonical spelling); store stubs add
  `bottomSource: () => ({ getSnapshot: () => false })`. Add `@deepseek-ai/dsh-util-values` as a
  dev dependency (`link:` into the source tree locally) and junction it when absent.
- **Verification**: typecheck covers `tests/` (see the trap below); render specs pass against the
  new records.
- **Source**: [alpha.5 `packages/client/ui-conversation/src/client/contract/records.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.5/packages/client/ui-conversation/src/client/contract/records.ts) · [alpha.5 `packages/util/values/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.5/packages/util/values/src/index.ts)
- **Field note** (2026-10-16, fleet): repositories whose `tsconfig.json` says `include: ["src"]`
  **do not typecheck tests** — the drift then manifests as silent fixture debt (tests still pass
  because they never read `args`) instead of compile errors. Two fleet plugins hit the compile
  form, one hit the silent form. The silent-debt net is wider than tool records: whole-array
  `as` casts over branded fields (`SessionSeq`), `message.content` (now `readonly ContentBlock[]`
  on the llm side), and spec tsconfigs combining `types: ["vitest/globals"]` with custom
  `typeRoots` (TS2688 — config debt that looks like an upgrade break) all surfaced only once
  tests joined the typecheck. Run `vitest` and `tsc` over `tests/` explicitly before calling
  the migration done. A spec tsconfig that has **never** compiled is pre-existing debt — verify
  against the rc.2 tag before charging it to this jump. Two more silent-debt shapes surfaced in
  the fleet: **tautological assertions** (`expect(x).length > 0` is always truthy — the check
  never tested anything) and **layered unmasking** (fixing one test-type error reveals the next;
  budget a fix → rerun → fix loop instead of assuming one pass). Fixture stubs are also
  program-dependent: the official specs' `GlobalStandardProps` stubs (e.g. `useResource`) only
  compile when your program actually pulls in that module's `declare module` merge — copy the
  stub set your imports justify, not the upstream one. TS2688 on a spec tsconfig can be a
  **composite mask**: fixing it may release a flood of previously hidden errors (stale package
  name mappings, SlotMap cascades) — the fix/rerun loop is the norm. And remember the corridor
  cuts both ways: a plugin that last validated against an **older** baseline may carry drift
  from intermediate jumps (e.g. `SessionListState.current` left in rc.1); the jump's `from`
  version decides which earlier card sets you must also read. **Declaration merging is
  copy-sensitive**: a `declare module` augmentation compiled against a source-junctioned d.ts
  never merges with a consumer reading a tarball/registry d.ts of the same package — SlotMap
  entries collapse (`PropsRuntime<'…'>` unsatisfied) or lose members. The augmentation provider
  and every consumer must resolve the **same physical copy**. **Source junctions can also
  dual-instantiate React**: a client package junctioned from the host source tree resolves
  `react` through the host tree's `node_modules` (e.g. 18.3.1) while the plugin's tests resolve
  their store copy (18.2.0) — every hook call then crashes with `Cannot read properties of null
  (reading 'useMemo')` across the whole render suite. For react-carrying client packages,
  install from npm tarballs (the CI registry topology) instead of junctioning source.
- **Field note** (2026-10-16, fleet, service stand-ins): **`implements` cannot catch parameter
  widening.** A plugin that mirrors an official service interface with its own stand-in
  (`implements UiWorkspace` …) keeps typechecking green while silently **dropping new parameters**
  at runtime (`agentPreset`, draft initialization, `allowMigration`). When your plugin substitutes
  an official service, diff the official interface's every method signature against the stand-in
  by hand — typecheck is not a safety net there. Same family: `ctx.uiWorkspace.startSession()`
  with no arguments now **mints a new session** (blank reuse narrowed to the options path, and the
  Host claims only named session ids) — an old mirror preserves the obsolete semantics.

### DSH-0.2.1-J1-20 · presets that restate official bundle presets wholesale must be regenerated from the target tag

- **Type**: breaking
- **Applies to**: local/custom agent presets that override an official preset with a **keyed
  full-config restatement** (a whole copied preset body used to suppress or tweak one row, e.g.
  hiding the built-in `subagent` tool) rather than id-targeted config patches.
- **Touchpoints**: #1 for preset YAML.
- **Action level**: required-if-hit
- **Symptoms**: none at load — the restated preset keeps working, but it pins the **old**
  generation's rows: missing the new tool/plugin rows (`time-context`, `tool-schedule`,
  `plugin-market`, rewritten plan-mode guidance, …) and still referencing removed ones
  (`tool-subagent-codex`, `-claude-code`, `tool-ralph` rows). The profile quietly runs a
  previous-era composition.
- **Migration recipe**: regenerate the restated body verbatim from the target tag's shipped
  presets (`packages/bundle/web-app/presets/{standard,ptc,cordis}.patch.yml` at
  `dsh-v0.2.1-alpha.5`), then re-apply the local delta (e.g. drop the `tool-subagent` delegation
  row you were suppressing). Keep the file's own "regenerate on every dsh upgrade" note if
  present — it is this card in miniature.
- **Verification**: diff the restated rows against the tag's preset file; the only differences
  should be the intentional local delta.
- **Source**: [alpha.5 `packages/bundle/web-app/presets/`](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-alpha.5/packages/bundle/web-app/presets)
- **Field note** (2026-10-16, fleet): one fleet preset carried `{{cwd}}` suffixes in **three**
  places (not two — the restatement had copied them into each preset variant); duplicated blocks
  are exactly how removed keys survive a checklist sweep.
