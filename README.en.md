# DSH Plugin Upgrade Skill

[简体中文](README.md) | **English**

**A skill that teaches AI to upgrade your dsh plugins.** Community-built.

[DSH (DeepSeek Harness)](https://github.com/deepseek-ai/deepseek-harness) is an AI runtime where every feature is a plugin. The catch: **every time dsh releases a new version, older plugins may stop working.** This repo turns every known pitfall into an upgrade manual that AI can read, so Claude Code, Codex, Gemini, and friends can migrate your plugin to the new version safely.

## What's in this repo

- **167 upgrade cards** — each records one real pitfall: what breaks, why, how to fix it, and which version the information comes from. Ordered by version, from 0.1.0-rc.8 all the way to 0.1.6-alpha.1 (alpha.5→rc.1 has no plugin-facing changes: 0 cards; alpha.2→alpha.3 has 2 cards (1 additive capability + SQLite removal backfill); alpha.3→alpha.4 has 6; rc.8→rc.1 carries 9 draft cards; 0.1.2-rc.1→0.1.3-alpha.1 adds 8 (2 session-log measured + 1 Windows install/fs-ext field report + 3 git-tag anchored + A1-07/08 unpublished-cohort recipe and runtime re-verification), 0.1.3-alpha.1→alpha.2 adds 5 draft cards, 0.1.3-alpha.2→0.1.5-alpha.1 adds 20 draft cards, 0.1.5-alpha.1→0.1.5-alpha.2 adds 24 draft cards (12 of them covering the client and packaging faces), 0.1.5-alpha.2→0.1.5-rc.1 adds 5 draft cards, 0.1.5-rc.1→rc.2 adds 6 draft cards, and 0.1.5-rc.2→0.1.6-alpha.1 adds 40 draft cards — the widest edge so far: 800 commits and 4015 changed files).
- **13 general-purpose countermeasures** — some problems have nothing to do with the version (back up first, run old and new side by side, what to do when startup hangs). These live in one checklist.
- **9 skills** — one unified workflow selects and coordinates stages, while the other eight check upgrades, write plugins, test plugins, release plugins, diff two dsh versions, debug runtime failures, integrate heavy dependencies into lightweight plugins, and turn real upgrade experiences into auto-graded benchmark tasks.
- **56 exam questions (benchmark)** — tests whether an AI with our skill actually knows how to upgrade a plugin. Every question is auto-graded; two reproduce the real dsh-web v0.3.8 → v0.3.9 and dsh-data-agent v0.1.3 → v0.1.4 migrations.
- **Multiple validation reports** — we installed two real dsh versions in Docker and confirmed that following the cards really does fix plugins, followed by several rounds of agent benchmark runs.

## Quick Start

### Using the skills CLI (recommended)

One command, installed into every agent it supports:

```bash
npx skills add oh-my-dsh/dsh-plugin-upgrade-skill
```

### Claude Code

**Marketplace installation**:

```bash
/plugin marketplace add oh-my-dsh/dsh-plugin-upgrade-skill
/plugin install dsh-plugin-upgrade-skill
```

**Local/development mode**:

```bash
git clone https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill.git
claude --plugin-dir /path/to/dsh-plugin-upgrade-skill
```

### Codex

Add a marketplace first, then install/enable the plugin in Codex's plugin UI:

```bash
# GitHub marketplace
codex plugin marketplace add oh-my-dsh/dsh-plugin-upgrade-skill

# Local development marketplace
git clone https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill.git
codex plugin marketplace add ./dsh-plugin-upgrade-skill
```

The current Codex CLI has no direct install subcommand; both GitHub and local paths are registered via `plugin marketplace add`.

### Gemini CLI

Install directly from the repository or a local clone:

```bash
# From the repository
gemini skills install https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill.git --path skills

# Local
git clone https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill.git
gemini skills install ./dsh-plugin-upgrade-skill/skills/
```

### Cursor

Copy `skills/` into `.cursor/skills/`:

```bash
git clone https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill.git
cp -r dsh-plugin-upgrade-skill/skills/* .cursor/skills/
```

## Usage

In Claude Code, invoke the skill by name (namespaced once the plugin is installed):

```
/plugin-workflow
/dsh-plugin-upgrade-skill:plugin-workflow
/plugin-upgrade 0.1.2
/dsh-plugin-upgrade-skill:plugin-upgrade 0.1.2
```

When the unified entry point is invoked without an explicit workflow, it first lists all 9
workflows and 14 optional capabilities. It recommends the read-only `health-check` but does not
start it automatically. Reply with a workflow number or ID and add or remove capabilities before
the phase ledger is created:

```text
Choose 1
Choose compatibility-migration, plus docker-smoke and browser-check
```

You can also ask directly in the conversation (any agent); the skill triggers on its description. Read-only checks return results directly, while upgrades or migrations produce a plan first and wait for confirmation:

```
Inspect this DSH plugin and let me choose upgrade, testing, cloud naming, and release stages.
What breaking changes are there for upgrading my plugin from 0.1.1 to 0.1.2?
Upgrade the dsh-ads plugin to dsh-v0.1.2-alpha.2
Validate this plugin's names and query the central registry; preserve the index URL and SHA-256 without submitting a registration.
```

`naming-registry` runs offline naming validation and a read-only central query by default; central
registration remains a separate external-publication step. On a proxied network, run the query with
Node 24+ and `node --use-env-proxy`; Node 20-23 built-in `fetch` is not guaranteed to consume proxy
environment variables. A failed, oversized, or invalid-v2 query is unknown/not checked, never available.

## What each of the 9 skills does

| Skill | What it's for |
| --- | --- |
| [plugin-workflow](skills/plugin-workflow/) | The unified entry point. Choose inspection, upgrade, testing, naming and registration, packaging, and release capabilities before execution; receive a phase ledger with separate write, runtime, and publication confirmations |
| [plugin-upgrade](skills/plugin-upgrade/) | The main one. Checks whether a plugin needs upgrading, performs the upgrade, adapts old plugins to a new dsh version |
| [plugin-write](skills/plugin-write/) | Writing new plugins, with naming rules and a name-collision check |
| [plugin-test](skills/plugin-test/) | Testing whether a plugin change is correct, including a Docker smoke test (actually boots dsh with your plugin) |
| [plugin-release](skills/plugin-release/) | Packaging and releasing a plugin, with automatic pre-release checks |
| [dsh-upgrade-audit](skills/dsh-upgrade-audit/) | Diffs two dsh versions to see what actually changed, as evidence for the upgrade cards |
| [plugin-runtime-debug](skills/plugin-runtime-debug/) | Debugging plugin runtime failures against host API contracts (coordinate/projection mismatches, stale version chips, phantom entries) |
| [plugin-heavy-dep](skills/plugin-heavy-dep/) | Wiring heavy dependencies (like mermaid) into lightweight plugins, with a lazy-loading integration checklist |
| [dsh-benchmark-case](skills/dsh-benchmark-case/) | Turns a plugin's real upgrade experience (or an existing version card) into one auto-graded benchmark task (fixture + instruction + judge + solution) |

## Which versions are covered

| Version range | Status | Cards | Notes |
| --- | --- | --- | --- |
| 0.1.0-rc.8 → 0.1.1-rc.1 | 📝 Draft | [v0.1.1-rc.1.md](skills/plugin-upgrade/references/v0.1.1-rc.1.md) | 9 draft cards (vlln plugin migrations: repository mechanism removal, strict inject, 0812 service renames, etc.; corridor is the closest published-tag alignment for the internal 0810–0812 snapshot window, pending upstream review) |
| 0.1.1-rc.1 → 0.1.1-rc.2 | ✅ Done | [v0.1.1-rc.2.md](skills/plugin-upgrade/references/v0.1.1-rc.2.md) | 3 cards |
| 0.1.1-rc.2 → 0.1.2-alpha.1 | ✅ Done | [v0.1.2-alpha.1.md](skills/plugin-upgrade/references/v0.1.2-alpha.1.md) | 28 cards |
| 0.1.2-alpha.1 → 0.1.2-alpha.2 | ✅ Done | [v0.1.2-alpha.2.md](skills/plugin-upgrade/references/v0.1.2-alpha.2.md) | 8 cards |
| 0.1.2-alpha.2 → 0.1.2-alpha.3 | ✅ Done | [v0.1.2-alpha.3.md](skills/plugin-upgrade/references/v0.1.2-alpha.3.md) | 2 cards (A3-01 additive `settings.plugin.item` keyed-slot settings card capability; A3-02 optional SQLite Session-persistence provider removed — opt-in deployments need an older build to export) |
| 0.1.2-alpha.3 → 0.1.2-alpha.4 | ✅ Done | [v0.1.2-alpha.4.md](skills/plugin-upgrade/references/v0.1.2-alpha.4.md) | 6 cards (`report` → `send_message`, Python runtime package rename, `Session.events` removal, branded seq types, PTC `workflow` and base `web_fetch` defaults; verified on three real hosts) |
| 0.1.2-alpha.4 → 0.1.2-alpha.5 | ✅ Done | [v0.1.2-alpha.5.md](skills/plugin-upgrade/references/v0.1.2-alpha.5.md) | 3 cards (storage-domain `compatibleVersions` read tolerance and `backup-and-skip` salvage; boot/title-loss fix for legacy homes; storage-layer reproduction record) |
| 0.1.2-alpha.5 → 0.1.2-rc.1 | ✅ Done | [v0.1.2-rc.1.md](skills/plugin-upgrade/references/v0.1.2-rc.1.md) | 0 cards (pure version bump; verification record, macOS real-host validation, and release-notes coverage matrix) |
| 0.1.2-rc.1 → 0.1.3-alpha.1 | 📝 Draft | [v0.1.3-alpha.1.md](skills/plugin-upgrade/references/v0.1.3-alpha.1.md) | 8 draft cards (session-log corridor A1-01/02 + Windows install on the fs-ext native build A1-03 + host-plane/policy A1-04/05/06 + A1-07/08 unpublished-cohort source-launch recipe and composer/read_image runtime re-verification; release tarball measured, tag alignment pending) |
| 0.1.3-alpha.1 → 0.1.3-alpha.2 | 📝 Draft | [v0.1.3-alpha.2.md](skills/plugin-upgrade/references/v0.1.3-alpha.2.md) | 5 draft cards (persona prefix/suffix split, `SubprocessHandle.pid` removal, base drops the str-replace editor default row, launcher `runCli()`/`import.meta.main`, pi-ai 0.84.2→0.85.1) |
| 0.1.3-alpha.2 → 0.1.5-alpha.1 | 📝 Draft | [v0.1.5-alpha.1.md](skills/plugin-upgrade/references/v0.1.5-alpha.1.md) | 20 draft cards (Session format V3 + `EpochHeader.system` removal, `ctx.agent` removal, `Inbox` typed interface, tighter session-event validation, PTC rename, system prompts in message history, CLI rejects `desktop`, `--from-default-profile`, new file surface, Web Client `details`→`rightbar` rework, right-sidebar/resource extension points, `tool-subagent` contract, host SSH/instruction-discovery seams; version-jump edge) |
| 0.1.5-alpha.1 → 0.1.5-alpha.2 | 📝 Draft | [v0.1.5-alpha.2.md](skills/plugin-upgrade/references/v0.1.5-alpha.2.md) | 24 draft cards (`workspaceFiles` moves to `workspaceFileScope`, file reads outside the workspace root with `maxFileBytes`, `conversation` moves under root-scoped `main`, shell-only minimal profiles, two non-ignorable session events, pi-ai config changes, scope-aware tool guidance, `present`/reveal, document-preview rename, new `chunked-list`/`tool-present` packages, MCP pagination-cursor rejection, session-format-status doc; 12 client/packaging cards: root-scoped `rightbar` + layout rewrite, `client-resources` drops `reload`, `ui-primitives` icon rename, `ui-dockkit` drift, message-feedback injected surface, `ui-workspace` navigation, deliverables turn tail, browser deps → devDeps, `documentPreviews` registry, action commands, feedback Remote, sidebar default-page rules) |
| 0.1.5-alpha.2 → 0.1.5-rc.1 | 📝 Draft | [v0.1.5-rc.1.md](skills/plugin-upgrade/references/v0.1.5-rc.1.md) | 5 draft cards (base default agent model id moves to `deepseek-flash`; the adapter catalog gains V41 Flash with image input, in-history system prompts and no gateway probe; document renderers gain a required `scrollportRef`; sidebar guide entries gain an optional `description`; negative evidence plus a 17-repository fleet verification record). This edge is 17 commits |
| 0.1.5-rc.1 → 0.1.5-rc.2 | 📝 Draft | [v0.1.5-rc.2.md](skills/plugin-upgrade/references/v0.1.5-rc.2.md) | 6 draft cards (the feedback surface's injected contract loses `toggle`/`acknowledge` and `openDialog` gains a required `rating`; both ratings confirm in the dialog and a failed submission becomes a 6s warning toast; `FileTypeIcon`'s 48 code categories move to the design-export artwork; the completed-turn footer and file-section spacing become a 20/16/20px contract; `service-stability` is re-labelled in both languages; plus negative evidence that no Host-plane surface changed) |
| 0.1.5-rc.2 → 0.1.6-alpha.1 | 📝 Draft | [v0.1.6-alpha.1.md](skills/plugin-upgrade/references/v0.1.6-alpha.1.md) | 40 draft cards (the widest edge carded here so far: 800 commits, 4015 changed files). Host: `agent/session-start` deleted and `agent/created` made serial + awaited, `auditStartupEntries` replaces the `assertEntries*` helpers, synchronous session-event reads deprecated, `registerMessageProjection()` added with a refusal for content-rewriting events that lack a registered interpreter, `session-log-deepseek` uploads by default. Runtime: `codeRuntime`→`ptcRuntime` with `run` split into `resolve`/`run`, async `confine` and `ShellExecutor.start`, subprocess `terminalEnvironment()` + optional control channel, `workflow-ptc` replacing the worker-thread provider, MCP 2.0 SDK, new `ctx.mcpResources` and `ctx.ssh`. LLM: adapters report `IMAGE_OFFLOAD_REQUIRED`, `deepseek-official` defaults to the Anthropic Messages protocol, images move to the v41 token grid, projection `stateVersion` 5, `AssistantProvenance`→`AssistantProviderMetadata`. Web Client: provenance→producer/provider metadata, required `CommandClaim.name`, new permission and keyed guide slots, `reconnectLabel` removal, context-aware diffs, `?fixture` mode retired. Packaging: base row swap, `image-offload` (required-on-read `image/offload`) and `mcp-resources` mounted by default, `tool-ralph` disabled, Web bundle drops the `code-runtime` row, a +22/−7 package ledger, headless `--session-id`/`--json`, public package manifest rebuild, experimental publication flipped to a denylist, native dependency floor `^0.1.4`→`^0.1.6`; plus negative evidence for the unmoved surfaces. Experimental Agent Teams: the profile layer disables `subagent`/`subagent_fork` in favor of `spawn_teammate` and the service's default member cap moves 8→16; Node PTC programs run in a fresh child process with an empty `process.env`. A companion [six-plugin fleet crossing record](skills/plugin-upgrade/references/rc-0.1.6-alpha.1-fleet-crossing.md) documents a release-day crossing with zero client-plugin code changes) |
| Cross-version countermeasures | ✅ Done | [rollup-0.1.2.md](skills/plugin-upgrade/references/rollup-0.1.2.md) | 13 items (running old and new side by side, back up first, what to do when startup hangs, etc.) |
| 0.1.1 → 0.1.2 final | 🔄 Waiting for the official release | — | dsh 0.1.2 final isn't out yet (npm `latest` is still rc.1; the corridor now extends to 0.1.6-alpha.1 with draft cards); we'll re-verify everything once 0.1.2 final is out |
| 0.1.6-alpha.1 → later versions (0.1.5/0.1.6 final, etc.) | 📝 Up for grabs | — | Want to help write cards? See the [contributing guide](CONTRIBUTING.md) |

## The exam (benchmark)

The [benchmark/](benchmark/) folder has 56 upgrade exam questions with auto-grading, in [Harbor](https://github.com/harbor-framework/harbor) task format: each question is a self-contained task (its own container with dsh preinstalled, plus an automatic verifier). Run `harbor run -p benchmark/tasks/<task-id> -a <agent>` to get a 0–1 score. Run the same AI twice — once with this skill installed, once without — and the score difference is the skill's real effect. See [benchmark/README.md](benchmark/README.md) for details. The result set includes two 2026-09-01 Codex + `gpt-5.6-terra` 22-task reports ([with the skill](benchmark/results/validation-report-2026-09-01-codex-gpt-5.6-terra-all-22.md), [with literally zero skills](benchmark/results/validation-report-2026-09-01-codex-gpt-5.6-terra-all-22-literal-no-skill.md)), four Codex + `gpt-5.6-luna` reports for the earlier 19-task snapshot, and the 2026-09-02 H22 dsh-data-agent pair ([with `plugin-upgrade`](benchmark/results/validation-report-2026-09-02-h22-dsh-data-agent-alpha2-plugin-upgrade.md), [with literally zero skills](benchmark/results/validation-report-2026-09-02-h22-dsh-data-agent-alpha2-no-skill.md)).

## References

- [Official repository](https://github.com/deepseek-ai/deepseek-harness) — the DSH main repository
- [Discussion #5120](https://github.com/deepseek-ai/deepseek-harness/discussions/5120) — the community pain-point collection where this repo started
- [dsh-web migration case study](https://github.com/zhu1090093659/dsh-web) — @zhu1090093659's complete migration case

## Use it inside your project

For the unified workflow, copy the complete `skills/` directory because `plugin-workflow` routes each phase to the other five owning Skills. If you only need upgrades, you can copy `skills/plugin-upgrade/` by itself:

```text
<your-project>/.agents/skills/
├── plugin-workflow/
├── plugin-upgrade/
├── plugin-write/
├── plugin-test/
├── plugin-release/
└── dsh-upgrade-audit/
```

Keep `SKILL.md` and the `references/` folder inside — don't copy just one file. You can also point DSH's local skill loader at the `skills/` directory of this repo.

## Repository layout

See [Skill CI and composition coverage](benchmark/docs/skill-ci.md) for workflow
regressions, reference-answer controls and manual model comparisons. Passing the
controls does not establish that a model used the Skills correctly.

```text
skills/<skill-name>/
├── SKILL.md        # how the skill triggers and what it does
├── references/     # upgrade cards and detailed material
├── scripts/        # small executable tools, including migration, workflow, and runtime verification planners
└── examples/       # example code (read-only, do not run)
scripts/validate.mjs            # repo self-check
scripts/validate-manifests.mjs  # multi-agent manifest self-check
benchmark/                      # 56 exam questions + grader + validation reports
```

## Contributing

1. Follow the conventions in [skills/README.md](skills/README.md);
2. Upgrade cards follow the [card format](skills/plugin-upgrade/references/README.md);
3. Run both self-checks and make sure they pass before opening a PR:

```sh
node scripts/validate.mjs
node scripts/validate-manifests.mjs
```

## Acknowledgments

- [@hikariming](https://github.com/hikariming) — repository maintenance and the dsh skill index site [dshfind.com](https://dshfind.com)
- [@ccch1mneyyy](https://github.com/ccch1mneyyy) — issue #1 proposal and the alpha version cards
- [@zhu1090093659](https://github.com/zhu1090093659) — [dsh-web](https://github.com/zhu1090093659/dsh-web) migration practice and detailed pain-point records
- [@huiliyi37](https://github.com/huiliyi37) — [dsh-tui](https://github.com/huiliyi37/dsh-tianshu-tui) 0.1.2-alpha.2 migration field notes
- [@tianyicui](https://github.com/tianyicui) — initiated discussion #5120 and the official call for contributions

## License

[MIT](LICENSE)
