# DSH Plugin Upgrade Skill

**English** | [简体中文](README.zh-CN.md)

A community-maintained agent skill for the DeepSeek Harness plugin ecosystem, with version-aware migration guidance, breaking-change recipes, and field-tested examples.

[DSH (DeepSeek Harness)](https://github.com/deepseek-ai/deepseek-harness) is an agent harness where everything is a plugin. This repository helps agents inspect updates, read changelogs, migrate configuration and source code, and verify DSH plugin upgrades.

## Features

- **Continuously updated** — Version cards form an ordered migration corridor across DSH releases.
- **Community-tested** — Recipes incorporate real migrations such as [dsh-web #5120](https://github.com/deepseek-ai/deepseek-harness/discussions/5120).
- **Structured data** — Version cards follow a stable schema suitable for tooling.
- **Multi-agent support** — Works with Claude Code, Codex, Gemini CLI, Cursor, and other coding agents.

## Quick start

### skills CLI (recommended)

Install for 70+ supported agents with one command:

```bash
npx skills add oh-my-dsh/dsh-plugin-upgrade-skill
```

### Claude Code

**Marketplace:**

```bash
/plugin marketplace add oh-my-dsh/dsh-plugin-upgrade-skill
/plugin install dsh-plugin-upgrade-skill
```

> **SSH error?** Use the HTTPS URL if GitHub SSH keys are unavailable:
>
> ```bash
> /plugin marketplace add https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill.git
> /plugin install dsh-plugin-upgrade-skill
> ```
>
> Or configure Git to rewrite GitHub SSH URLs:
>
> ```bash
> git config --global url."https://github.com/".insteadOf git@github.com:
> ```

**Local development:**

```bash
git clone https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill.git
claude --plugin-dir /path/to/dsh-plugin-upgrade-skill
```

### Codex

Install from the marketplace or a local directory:

```bash
# Marketplace
codex plugin add oh-my-dsh/dsh-plugin-upgrade-skill

# Local
git clone https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill.git
codex plugin add ./dsh-plugin-upgrade-skill
```

### Gemini CLI

Install from GitHub or a local clone:

```bash
# GitHub
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

### Slash command (Claude / Gemini)

After installation:

```bash
/dsh-upgrade 0.1.2
```

Or ask directly:

```text
What breaking changes affect my plugin when upgrading DSH from 0.1.1 to 0.1.2?
```

### Skill invocation (any agent)

For agents without slash commands:

```text
Use the plugin-upgrade skill to upgrade my DSH plugin to 0.1.2.
```

## Skill index

| Skill | Purpose | Version coverage |
| --- | --- | --- |
| [plugin-upgrade](skills/plugin-upgrade/) | Safe inspection, installed-plugin updates, and DSH host compatibility migration with seven touchpoint classes, version cards, and rollback constraints | 0.1.1 → 0.1.2 |
| [plugin-write](skills/plugin-write/) | Write DSH plugins against a target Harness contract while distinguishing official monorepo packages from external installable plugins | Target Harness version |
| [plugin-test](skills/plugin-test/) | Select the smallest sufficient validation layer across unit, coverage, real API, snapshot, Web, and published-entry tests | Cross-version validation |

## Migration data status

| Version corridor | Status | Card set | Notes |
| --- | --- | --- | --- |
| 0.1.1 → 0.1.2 alpha.1 | ✅ Complete | [v0.1.2-alpha.1.md](skills/plugin-upgrade/references/v0.1.2-alpha.1.md) | Alpha 1 breaking changes |
| 0.1.1 → 0.1.2 alpha.2 | ✅ Complete | [v0.1.2-alpha.2.md](skills/plugin-upgrade/references/v0.1.2-alpha.2.md) | Alpha 2 incremental changes |
| 0.1.1 → 0.1.2 corridor | ✅ Complete for alpha.2 | [rollup-0.1.2.md](skills/plugin-upgrade/references/rollup-0.1.2.md) | Cross-cohort compatibility, unpublished cohort installation, `RemoteResult` flow, and layered validation |
| 0.1.1 → 0.1.2 final | 🔄 Awaiting official tag | — | DSH 0.1.2 final is not published; alpha.2 is the current tracked target |
| 0.1.2 → 0.1.3+ | 📝 Unclaimed | — | Contributions welcome; see [CONTRIBUTING.md](CONTRIBUTING.md) |

## References

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — Official DSH repository
- [Discussion #5120](https://github.com/deepseek-ai/deepseek-harness/discussions/5120) — Community migration findings and pain points
- [dsh-web migration](https://github.com/zhu1090093659/dsh-web) — Full migration by @zhu1090093659

## Installation and triggering

For project-local use, copy `skills/plugin-upgrade/` to:

```text
<your-project>/.agents/skills/plugin-upgrade/
```

DSH's local Skill provider can also load this repository's `skills/` root. Keep `SKILL.md` together with `references/`; copying only the entry file is insufficient.

Example requests:

- `Inspect this DSH plugin for updates without modifying any files.`
- `Upgrade the installed plugin to 1.4.0. Show the plan and wait for confirmation before writing.`
- `Migrate this plugin from dsh-v0.1.1-rc.2 to dsh-v0.1.2-alpha.2.`

## Layout

```text
skills/<skill-name>/
├── SKILL.md
├── references/     # Version facts and checklists loaded on demand
└── examples/       # Static fixtures; never executed by default
scripts/validate.mjs            # Skill structure validation
scripts/validate-manifests.mjs  # Multi-agent manifest validation
```

## Contributing and validation

1. Follow [skills/README.md](skills/README.md) when creating or updating a skill.
2. Follow the [version-card schema](skills/plugin-upgrade/references/README.md).
3. Run:

```sh
node scripts/validate.mjs
node scripts/validate-manifests.mjs
```

4. Open a PR and list the validation performed.

## Acknowledgements

- [@ccch1mneyyy](https://github.com/ccch1mneyyy) — Issue #1 proposal and alpha version cards
- [@zhu1090093659](https://github.com/zhu1090093659) — [dsh-web](https://github.com/zhu1090093659/dsh-web) migration findings
- [@tianyicui](https://github.com/tianyicui) — Discussion #5120 and official migration call

## License

[MIT](LICENSE)
