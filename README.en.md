# DSH Plugin Upgrade Skill

[简体中文](README.md) | **English**

**An agent skill for the DeepSeek Harness plugin ecosystem, community-built. It provides version-agnostic migration guides, breaking-change recipes, and real migration examples.**

[DSH (DeepSeek Harness)](https://github.com/deepseek-ai/deepseek-harness) is an "everything is a plugin" agent harness. This repository provides an agent skill for upgrading DSH plugins — from checking for updates and reading the changelog, to migrating configuration, adapting source code, and verifying results.

## Features

- **Continuously updated** — each DSH version has its own dedicated migration card; apply them in order to upgrade across versions
- **Community-driven** — based on real migration practice (e.g. [dsh-web #5120](https://github.com/deepseek-ai/deepseek-harness/discussions/5120)), with pain points and recipes continuously added
- **Structured data** — version cards use a uniform format and support tooling (migration diffs can be auto-generated in the future)
- **Multi-agent support** — compatible with mainstream AI coding tools such as Claude Code, Codex, Gemini CLI, and Cursor

## Quick Start

### Using the skills CLI (recommended)

The fastest path — installed by the [skills CLI](https://github.com/justjavac/skills) into the agents it currently supports:

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
/plugin-upgrade 0.1.2
/dsh-plugin-upgrade-skill:plugin-upgrade 0.1.2
```

You can also ask directly in the conversation (any agent); the skill triggers on its description. Read-only checks return results directly, while upgrades or migrations produce a plan first and wait for confirmation:

```
What breaking changes are there for upgrading my plugin from 0.1.1 to 0.1.2?
Upgrade the dsh-ads plugin to dsh-v0.1.2-alpha.2
```

## Skill Index

| Skill | Description | Version coverage |
| --- | --- | --- |
| [plugin-upgrade](skills/plugin-upgrade/) | Three-mode safe upgrade: read-only inspection, installed-plugin upgrade, and DSH host compatibility migration; includes seven touchpoint classes, version cards, and rollback constraints | 0.1.1 → 0.1.2 |
| [plugin-write](skills/plugin-write/) | Write DSH plugins against the target Harness contract, distinguishing official monorepo packages from externally installable plugins | Per target Harness version |
| [plugin-test](skills/plugin-test/) | Choose the minimal yet sufficient testing tier for DSH plugin changes, covering unit tests, coverage, real APIs, snapshots, web, and real release entry points | Cross-version validation |
| [plugin-release](skills/plugin-release/) | Package, publish, and distribute DSH plugins: release-track selection, unpublished-cohort installation, CI gates, and rollback | Cross-version |

## Version Compatibility Audit (dsh-upgrade-audit)

[dsh-upgrade-audit](skills/dsh-upgrade-audit/) audits external compatibility and rollback between two DSH versions, producing an UPGRADE-ADAPTATION report plus a boundary-signature table as evidence for version cards. Case study: [0.1.2-alpha.1 → alpha.2](skills/dsh-upgrade-audit/examples/0.1.2alpha1-to-0.1.2alpha2/UPGRADE-ADAPTATION.md).

## Version Data Status

| Version range | Status | Card file | Notes |
| --- | --- | --- | --- |
| 0.1.1 → 0.1.2 alpha.1 | ✅ Done | [v0.1.2-alpha.1.md](skills/plugin-upgrade/references/v0.1.2-alpha.1.md) | Alpha 1 breaking changes |
| 0.1.1 → 0.1.2 alpha.2 | ✅ Done | [v0.1.2-alpha.2.md](skills/plugin-upgrade/references/v0.1.2-alpha.2.md) | Alpha 2 incremental changes |
| 0.1.1 → 0.1.2 corridor | ✅ Done (based on alpha.2) | [rollup-0.1.2.md](skills/plugin-upgrade/references/rollup-0.1.2.md) | Rollup-layer increments: cross-cohort coexistence, unpublished-cohort installation, `RemoteResult` error flow, layered validation |
| 0.1.1 → 0.1.2 | 🔄 Awaiting official release tag | — | The official 0.1.2 release has not been published yet (latest: alpha.2) |
| 0.1.2 → 0.1.3+ | 📝 Up for grabs | — | Awaiting community contribution ([contributing guide](CONTRIBUTING.md)) |

## References

- [Official repository](https://github.com/deepseek-ai/deepseek-harness) — the DSH main repository
- [Discussion #5120](https://github.com/deepseek-ai/deepseek-harness/discussions/5120) — community migration practices and pain-point collection
- [dsh-web migration case study](https://github.com/zhu1090093659/dsh-web) — @zhu1090093659's complete migration case

## Installation & Triggering

For project-level use, copy `skills/plugin-upgrade/` to:

```text
<your-project>/.agents/skills/plugin-upgrade/
```

You can also have DSH's local Skill provider load the `skills/` root directory of this repository directly. Make sure `SKILL.md` and `references/` remain in the directory — don't copy only the main file.

Example requests:

- `Do a read-only check for new versions of this DSH plugin; don't modify any files.`
- `Upgrade the installed plugin to 1.4.0 — give me the plan first, and execute only after I confirm.`
- `Adapt this plugin from dsh-v0.1.1-rc.2 to dsh-v0.1.2-alpha.2.`

## Directory Structure

```text
skills/<skill-name>/
├── SKILL.md
├── references/     # version facts and checklists loaded on demand
└── examples/       # static fixtures, not executed by default
scripts/validate.mjs            # Skill structure validation
scripts/validate-manifests.mjs  # multi-agent manifest validation
```

## Contributing & Validation

1. Write or update a Skill following [skills/README.md](skills/README.md);
2. Version cards follow the [card schema](skills/plugin-upgrade/references/README.md);
3. Run:

```sh
node scripts/validate.mjs
node scripts/validate-manifests.mjs
```

4. Open a PR, and state which validations you have run.

## Acknowledgments

- [@hikariming](https://github.com/hikariming) — repository maintenance and the dsh skill index site [dshfind.com](https://dshfind.com)
- [@ccch1mneyyy](https://github.com/ccch1mneyyy) — issue #1 proposal and the alpha version cards
- [@zhu1090093659](https://github.com/zhu1090093659) — [dsh-web](https://github.com/zhu1090093659/dsh-web) migration practice and detailed pain-point records
- [@huiliyi37](https://github.com/huiliyi37) — [dsh-tui](https://github.com/huiliyi37/dsh-tianshu-tui) 0.1.2-alpha.2 migration field notes (user-questions waterfall card, preset host-scope prerequisite, type-drift ledger)
- [@tianyicui](https://github.com/tianyicui) — initiated discussion #5120 and the official call for contributions

## License

[MIT](LICENSE)
