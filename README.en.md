# DSH Plugin Upgrade Skill

[简体中文](README.md) | **English**

[![arXiv](https://img.shields.io/badge/arXiv-2609.30120-b31b1b.svg)](https://arxiv.org/abs/2609.30120) [![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE) ![Skills](https://img.shields.io/badge/skills-11-blue) ![Upgrade cards](https://img.shields.io/badge/upgrade%20cards-198-blue) ![Benchmark](https://img.shields.io/badge/benchmark-63%20tasks-blue)

**Agent skills that teach AI to upgrade your DSH plugins.** Community-built.

[DSH (DeepSeek Harness)](https://github.com/deepseek-ai/deepseek-harness) is an AI runtime where every feature is a plugin. The catch: **every new DSH release can break older plugins.** This repository turns known pitfalls into upgrade manuals that AI can read, so Claude Code, Codex, Gemini, and other agents can migrate plugins safely, and it ships a public benchmark to check whether they actually got it right.

> 📄 **Paper**: [Evaluating Agent Skills for Version-Specific Plugin Migration: A Retrospective Study](https://arxiv.org/abs/2609.30120) (arXiv:2609.30120). See [Paper](#paper) for the evaluation design and main findings.

## What's in this repo

- **198 upgrade cards**: each records one real pitfall: what breaks, why, how to fix it, and which version the evidence comes from. Cards are ordered along the version corridor from 0.1.0-rc.8 to 0.2.0-rc.2 (the 0.1.7-rc.1 → 0.1.7-rc.2 edge is not yet carded); per-edge counts and status are in the [coverage table](#which-versions-are-covered).
- **13 general-purpose countermeasures**: version-independent problems (back up first, run old and new side by side, what to do when startup hangs) collected in one checklist.
- **11 skills**: a unified workflow selects and coordinates stages; nine skills check upgrades, write, test, and release plugins, diff two DSH versions, debug runtime failures, integrate heavy dependencies, sweep the installed plugin fleet after a host upgrade, and turn upgrade experience into benchmark tasks; one framework-agnostic migration methodology without DSH-specific facts serves as the control arm for comparative experiments.
- **63 auto-graded benchmark tasks**: 22 static diagnosis, 14 mixed, and 27 hands-on tasks, including two real migrations (dsh-web and dsh-data-agent).
- **A paper with fully traceable evidence**: raw answers, criterion-level grading, and cross-model re-grading are public and recomputable; see [Paper](#paper).

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

## What each of the 11 skills does

| Skill | What it's for |
| --- | --- |
| [plugin-workflow](skills/plugin-workflow/) | The unified entry point. Choose inspection, upgrade, testing, naming and registration, packaging, and release capabilities before execution; receive a phase ledger with separate write, runtime, and publication confirmations |
| [plugin-upgrade](skills/plugin-upgrade/) | The main one. Checks whether a plugin needs upgrading, performs the upgrade, adapts old plugins to a new dsh version |
| [plugin-write](skills/plugin-write/) | Writing new plugins, with naming rules and a name-collision check |
| [plugin-test](skills/plugin-test/) | Testing whether a plugin change is correct, including a Docker smoke test (actually boots dsh with your plugin) |
| [plugin-release](skills/plugin-release/) | Packaging and releasing a plugin, with automatic pre-release checks |
| [dsh-upgrade-audit](skills/dsh-upgrade-audit/) | Diffs two dsh versions to see what actually changed, as evidence for the upgrade cards |
| [plugin-runtime-debug](skills/plugin-runtime-debug/) | Debugging plugin runtime failures against host API contracts (coordinate/projection mismatches, stale version chips, phantom entries) |
| [plugin-fleet-sweep](skills/plugin-fleet-sweep/) | Sweeping the whole installed plugin fleet after a host upgrade: static sweep for renamed/removed APIs, per-plugin driven-browser assertions, and a per-plugin fix/release loop |
| [plugin-heavy-dep](skills/plugin-heavy-dep/) | Wiring heavy dependencies (like mermaid) into lightweight plugins, with a lazy-loading integration checklist |
| [dsh-benchmark-case](skills/dsh-benchmark-case/) | Turns a plugin's real upgrade experience (or an existing version card) into one auto-graded benchmark task (fixture + instruction + judge + solution) |
| [generic-migration](skills/generic-migration/) | Framework-agnostic plugin migration methodology (inventory coupling points, read the version corridor, verify in layers) with no DSH-specific facts; used as the control arm in comparative experiments |

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
| 0.1.5-rc.2 → 0.1.6-alpha.1 | 📝 Draft | [v0.1.6-alpha.1.md](skills/plugin-upgrade/references/v0.1.6-alpha.1.md) | 38 draft cards (the widest edge carded here so far: 800 commits, 4015 changed files). Host: `agent/session-start` deleted and `agent/created` made serial + awaited, `auditStartupEntries` replaces the `assertEntries*` helpers, synchronous session-event reads deprecated, `registerMessageProjection()` added with a refusal for content-rewriting events that lack a registered interpreter, `session-log-deepseek` uploads by default. Runtime: `codeRuntime`→`ptcRuntime` with `run` split into `resolve`/`run`, async `confine` and `ShellExecutor.start`, subprocess `terminalEnvironment()` + optional control channel, `workflow-ptc` replacing the worker-thread provider, MCP 2.0 SDK, new `ctx.mcpResources` and `ctx.ssh`. LLM: adapters report `IMAGE_OFFLOAD_REQUIRED`, `deepseek-official` defaults to the Anthropic Messages protocol, images move to the v41 token grid, projection `stateVersion` 5, `AssistantProvenance`→`AssistantProviderMetadata`. Web Client: provenance→producer/provider metadata, required `CommandClaim.name`, new permission and keyed guide slots, `reconnectLabel` removal, context-aware diffs, `?fixture` mode retired. Packaging: base row swap, `image-offload` (required-on-read `image/offload`) and `mcp-resources` mounted by default, `tool-ralph` disabled, Web bundle drops the `code-runtime` row, a +22/−7 package ledger, headless `--session-id`/`--json`, public package manifest rebuild, experimental publication flipped to a denylist, native dependency floor `^0.1.4`→`^0.1.6`; plus negative evidence for the unmoved surfaces) |
| 0.1.6-alpha.1 → 0.1.6-alpha.2 | 📝 Draft | [v0.1.6-alpha.2.md](skills/plugin-upgrade/references/v0.1.6-alpha.2.md) | 4 draft cards (`SessionListState.current` removed — resolve the main Session through `uiSession.adapter.current`; global standard props swap `useSessionPendingInteraction` for `useSessionStatus` + `useSessionRetainInfo` while `useSessions` stays; the new Plugin Manager manages profile bundles and patch-row toggles, link-installed plugins stay outside it; npm E404 window after the GitHub release; first-hand fixes shipped in three external plugins) |
| 0.1.6-alpha.2 → 0.1.7-alpha.1 | 📝 Draft | [v0.1.7-alpha.1.md](skills/plugin-upgrade/references/v0.1.7-alpha.1.md) | 11 draft cards (every client primitives `*16` icon export removed, `workspaceFiles` reads unify on `readBytes`, settings move into the Profile's plugin configuration, bundle-declared agent presets, session log V4, the official DeepSeek adapter is Messages-API only, ordered multi-patch bundles, tolerant Profile loading, locale-aware plugin metadata, custom-event attachments no longer auto-read, and two new settings-page seats `settings.launcher`/`settings.models.sign-in`; the preceding 0.1.6-alpha.1 → 0.1.6-alpha.2 edge is carded separately) |
| 0.1.7-alpha.1 → 0.1.7-alpha.2 | 📝 Draft | [v0.1.7-alpha.2.md](skills/plugin-upgrade/references/v0.1.7-alpha.2.md) | 4 draft cards (`spill-policy` moves to `maxInlineTokens`, vendored auto-updates pin to same-minor patches, first install auto-selects an npm registry, client bundles cached at host boot with automatic page reconnect) |
| 0.1.7-alpha.2 → 0.1.7-rc.1 | 📝 Draft | [v0.1.7-rc.1.md](skills/plugin-upgrade/references/v0.1.7-rc.1.md) | 5 draft cards (DSH peer ranges enforced at install and startup, with the `^0.1.7` trap under the host's semver ≥ 7.8.3; three-phase toolview owners; transient conversation starts; four work-detail modes; bounded silent pnpm runs in the Plugin Manager) |
| Cross-version countermeasures | ✅ Done | [rollup-0.1.2.md](skills/plugin-upgrade/references/rollup-0.1.2.md) | 13 items (running old and new side by side, back up first, what to do when startup hangs, etc.) |
| 0.1.1 → 0.1.2 final | 🔄 Waiting for the official release | — | dsh 0.1.2 final isn't out yet (npm `latest` is still rc.1; the corridor now extends to 0.2.0-rc.1 with draft cards); we'll re-verify everything once 0.1.2 final is out |
| 0.1.7-rc.1 → 0.1.7-rc.2 | 📝 Up for grabs / not yet carded | — | 346 commits with real changes (Schedule shipped in the default Web composition then disabled, the native-command Windows adapter, auto-review, user-questions timed waits, tool-description trims, Plugin Manager fixes); `plan-migration` reports a corridor gap from ≤0.1.7-rc.1. Want to help write cards? See the [contributing guide](CONTRIBUTING.md) |
| 0.1.7-rc.2 → 0.2.0-rc.1 | 📝 Draft | [v0.2.0-rc.1.md](skills/plugin-upgrade/references/v0.2.0-rc.1.md) | 6 draft cards (host packages cross to 0.2.0: every `^0.1.x`-floored DSH peer is refused and `^0.2.0` itself does not admit the rc host — measured range table with first-hand evidence; Web work-details default moves to `detailed` with the default in client code and an optional `transcriptView`; Schedule rows leave the default web-app bundle for `@deepseek-ai/dsh-experimental-schedule-bundle`; telemetry rows join the bundle composition; `fork` gains `onCreated`; Explorer path-opening spawns visible — retire local reveal hotfixes. The two Desktop 0.2.0-rc.2 field notes are folded into the next-edge card set) |
| 0.2.0-rc.1 → 0.2.0-rc.2 | 📝 Draft | [v0.2.0-rc.2.md](skills/plugin-upgrade/references/v0.2.0-rc.2.md) | 3 draft cards (Desktop runner surface, first-hand on a real Desktop 0.2.0-rc.2 install: the Electron shell forwards renderer requests through `dsh-app://app` after deleting `host`/`origin`/`cookie`/`sec-fetch-site` and rewrites the WS `origin` to the Host authority — plugin fences that require an affirmative browser marker 403 every route, realign with the platform fence trust semantics; the two former field notes are folded in as cards — Desktop `ctx.sessions` registry empty with the upstream discussion link, and minimal subprocess `PATH` on Windows; an unattributed field note records the `readSession` seeded-session replay validation). The next edge, 0.2.1-alpha.1, has a claim in flight |

## Benchmark

[benchmark/](benchmark/) holds 63 upgrade tasks with automatic grading in the [Harbor](https://github.com/harbor-framework/harbor) task format: each task is self-contained (a container with its own DSH environment plus an automatic verifier), and `harbor run -p benchmark/tasks/<task-id> -a <agent>` yields a 0 to 1 score. Run the same agent with and without the skill; the difference is the skill's measured effect. Results for several models and agents are summarized in [benchmark/README.md](benchmark/README.md), with full reports in [benchmark/results/](benchmark/results/).

## Paper

We report the evaluation of this skill as a retrospective study: [arXiv:2609.30120](https://arxiv.org/abs/2609.30120). Its central question: **when the score goes up, does the migration advice actually satisfy the target version's contract?**

- **Score gain**: on 16 static migration-diagnosis tasks (64 answers), making the skill available raises mean reward from 93.83 to 98.75 (+4.92, 95% interval [0.31, 10.86]). The gain is concentrated in a few tasks, and eight task pairs are at the ceiling.
- **Contract-level checks**: tracing all 328 criterion decisions to their version contracts, with executable probes, exposes grading problems, e.g., a path guard that accepts the parent directory still receives full credit. A high score is not the same as correct advice.
- **Cross-model re-grading**: judges from two other model families (Claude Opus 5.5 and GPT-5.5), blind to condition and prior scores, re-grade all 64 answers. They agree with the original judge on 91.8% and 95.7% of decisions and give gains of +10.63 and +6.09: same direction, judge-dependent size.
- **Recomputable**: raw answers, grades, reviews, the re-grading protocol, and scripts are all in this repository; start from [paper/](paper/).

Limitations (one framework, static diagnosis, no independent human annotation or control arm yet) are stated in the paper together with planned follow-up work.

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
benchmark/                      # 63 benchmark tasks + graders + validation reports
```

## Contributing

1. Follow the conventions in [skills/README.md](skills/README.md);
2. Upgrade cards follow the [card format](skills/plugin-upgrade/references/README.md);
3. Run both self-checks and make sure they pass before opening a PR:

```sh
node scripts/validate.mjs
node scripts/validate-manifests.mjs
```

## Citation

If this repository or the paper helps your work, please cite:

```bibtex
@misc{liu2026evaluating,
  title         = {Evaluating Agent Skills for Version-Specific Plugin Migration: A Retrospective Study},
  author        = {Liu, Beiming and Li, Haihao and Chen, Minjie and Chen, Ning and Wang, Yiran and Ye, Jiming and Zhang, Puzhao and Wang, Tongtao and Gao, Sheng and Jin, William and Mu, Weihao and Liu, Chengzhi and Xia, Yucheng and Wang, Guangren and Fan, Chaoyang and Huang, Changfeng and Lin, Xunming and Shen, Yuanjie},
  year          = {2026},
  eprint        = {2609.30120},
  archivePrefix = {arXiv},
  primaryClass  = {cs.SE},
  url           = {https://arxiv.org/abs/2609.30120}
}
```

## Acknowledgments

The paper authors and every contributor who opened a pull request built this repository together; see [Contributors](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/graphs/contributors) for the full list.

- [@hikariming](https://github.com/hikariming) — repository maintenance and the dsh skill index site [dshfind.com](https://dshfind.com)
- [@ccch1mneyyy](https://github.com/ccch1mneyyy) — issue #1 proposal and the alpha version cards
- [@zhu1090093659](https://github.com/zhu1090093659) — [dsh-web](https://github.com/zhu1090093659/dsh-web) migration practice and detailed pain-point records
- [@huiliyi37](https://github.com/huiliyi37) — [dsh-tui](https://github.com/huiliyi37/dsh-tianshu-tui) 0.1.2-alpha.2 migration field notes
- [@tianyicui](https://github.com/tianyicui) — initiated discussion #5120 and the official call for contributions

## License

[MIT](LICENSE)
