# DSH Plugin Upgrade Skill

[简体中文](README.md) | **English**

**A skill that teaches AI to upgrade your dsh plugins.** Community-built.

[DSH (DeepSeek Harness)](https://github.com/deepseek-ai/deepseek-harness) is an AI runtime where every feature is a plugin. The catch: **every time dsh releases a new version, older plugins may stop working.** This repo turns every known pitfall into an upgrade manual that AI can read, so Claude Code, Codex, Gemini, and friends can migrate your plugin to the new version safely.

## What's in this repo

- **57 upgrade cards** — each records one real pitfall: what breaks, why, how to fix it, and which version the information comes from. Ordered by version, from 0.1.0-rc.8 all the way to 0.1.2-rc.1 (alpha.2→alpha.3 and alpha.5→rc.1 have no plugin-facing changes: 0 cards; alpha.3→alpha.4 has 6; rc.8→rc.1 carries 9 draft cards).
- **12 general-purpose countermeasures** — some problems have nothing to do with the version (back up first, run old and new side by side, what to do when startup hangs). These live in one checklist.
- **8 skills** — one unified workflow selects and coordinates stages, while the other seven check upgrades, write plugins, test plugins, release plugins, diff two dsh versions, debug runtime failures, and integrate heavy dependencies into lightweight plugins.
- **26 exam questions (benchmark)** — tests whether an AI with our skill actually knows how to upgrade a plugin. Every question is auto-graded; one reproduces the real dsh-web v0.3.8 → v0.3.9 migration.
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

When the unified entry point is invoked without an explicit workflow, it first lists all 7
workflows and 12 optional capabilities. It recommends the read-only `health-check` but does not
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
```

## What each of the 8 skills does

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

## Which versions are covered

| Version range | Status | Cards | Notes |
| --- | --- | --- | --- |
| 0.1.0-rc.8 → 0.1.1-rc.1 | 📝 Draft | [v0.1.1-rc.1.md](skills/plugin-upgrade/references/v0.1.1-rc.1.md) | 9 draft cards (vlln plugin migrations: repository mechanism removal, strict inject, 0812 service renames, etc.; corridor is the closest published-tag alignment for the internal 0810–0812 snapshot window, pending upstream review) |
| 0.1.1-rc.1 → 0.1.1-rc.2 | ✅ Done | [v0.1.1-rc.2.md](skills/plugin-upgrade/references/v0.1.1-rc.2.md) | 3 cards |
| 0.1.1-rc.2 → 0.1.2-alpha.1 | ✅ Done | [v0.1.2-alpha.1.md](skills/plugin-upgrade/references/v0.1.2-alpha.1.md) | 28 cards |
| 0.1.2-alpha.1 → 0.1.2-alpha.2 | ✅ Done | [v0.1.2-alpha.2.md](skills/plugin-upgrade/references/v0.1.2-alpha.2.md) | 8 cards |
| 0.1.2-alpha.2 → 0.1.2-alpha.3 | ✅ Done | [v0.1.2-alpha.3.md](skills/plugin-upgrade/references/v0.1.2-alpha.3.md) | 0 cards (no plugin-facing changes; carries the verification record) |
| 0.1.2-alpha.3 → 0.1.2-alpha.4 | ✅ Done | [v0.1.2-alpha.4.md](skills/plugin-upgrade/references/v0.1.2-alpha.4.md) | 6 cards (`report` → `send_message`, Python runtime package rename, `Session.events` removal, branded seq types, PTC `workflow` and base `web_fetch` defaults; verified on three real hosts) |
| 0.1.2-alpha.4 → 0.1.2-alpha.5 | ✅ Done | [v0.1.2-alpha.5.md](skills/plugin-upgrade/references/v0.1.2-alpha.5.md) | 3 cards (storage-domain `compatibleVersions` read tolerance and `backup-and-skip` salvage; boot/title-loss fix for legacy homes; storage-layer reproduction record) |
| 0.1.2-alpha.5 → 0.1.2-rc.1 | ✅ Done | [v0.1.2-rc.1.md](skills/plugin-upgrade/references/v0.1.2-rc.1.md) | 0 cards (pure version bump; verification record, macOS real-host validation, and release-notes coverage matrix) |
| Cross-version countermeasures | ✅ Done | [rollup-0.1.2.md](skills/plugin-upgrade/references/rollup-0.1.2.md) | 12 items (running old and new side by side, back up first, what to do when startup hangs, etc.) |
| 0.1.1 → 0.1.2 final | 🔄 Waiting for the official release | — | dsh 0.1.2 final isn't out yet (latest is rc.1; the corridor is verified through rc.1); we'll re-verify everything once it is |
| 0.1.2 → later versions | 📝 Up for grabs | — | Want to help write cards? See the [contributing guide](CONTRIBUTING.md) |

## The exam (benchmark)

The [benchmark/](benchmark/) folder has 29 upgrade exam questions with auto-grading, in [Harbor](https://github.com/harbor-framework/harbor) task format: each question is a self-contained task (its own container with dsh preinstalled, plus an automatic verifier). Run `harbor run -p benchmark/tasks/<task-id> -a <agent>` to get a 0–1 score. Run the same AI twice — once with this skill installed, once without — and the score difference is the skill's real effect. See [benchmark/README.md](benchmark/README.md) for details. Seven validation reports sit in the same folder: [validation-report-2026-08-30.md](benchmark/results/validation-report-2026-08-30.md) (the earlier migration/benchmark validation record), [validation-report-2026-08-31.md](benchmark/results/validation-report-2026-08-31.md) (end-to-end validation after the Harbor format rework), [validation-report-2026-08-31-auth-v1.md](benchmark/results/validation-report-2026-08-31-auth-v1.md) (BENCHMARK-AUTH-v1 unattended-authorization validation), and four 2026-09-01 Codex + `gpt-5.6-luna` runs ([18-task batch with the skill](benchmark/results/validation-report-2026-09-01-codex-gpt-5.6-luna-other-18.md), [18-task batch with no Harbor-injected skill](benchmark/results/validation-report-2026-09-01-codex-gpt-5.6-luna-other-18-no-injected-skill.md), [real-repository task with the skill](benchmark/results/validation-report-2026-09-01.md), [real-repository task with no Harbor-injected skill](benchmark/results/validation-report-2026-09-01-h8-dsh-web-alpha2-no-skill.md)).

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

```text
skills/<skill-name>/
├── SKILL.md        # how the skill triggers and what it does
├── references/     # upgrade cards and detailed material
├── scripts/        # small executable tools, including migration, workflow, and runtime verification planners
└── examples/       # example code (read-only, do not run)
scripts/validate.mjs            # repo self-check
scripts/validate-manifests.mjs  # multi-agent manifest self-check
benchmark/                      # 23 exam questions + grader + validation report
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
