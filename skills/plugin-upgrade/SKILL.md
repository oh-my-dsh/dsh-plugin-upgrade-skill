---
name: plugin-upgrade
description: Inspect or upgrade installed DSH (DeepSeek Harness) plugins, or migrate plugin source to a newer DSH host. Inspection stays read-only; show a plan and obtain confirmation before changing configuration, dependencies, or source. 用于检查、升级或适配 DSH 插件。
---

**English** | [简体中文](SKILL.zh-CN.md)

# plugin-upgrade

Safely handle three tasks: read-only update inspection, installed-plugin updates, and DSH host compatibility migration. If intent is unclear, confirm the mode; never turn “check for updates” into installation or source changes.

## Step 0: choose a mode

| Mode | User intent | Default allowed action |
|---|---|---|
| A · inspect | Check updates or assess impact from a DSH release | Read-only investigation and report; then stop |
| B · update | Upgrade an installed plugin to an explicit version | Plan and confirm before changing composition or dependencies |
| C · host-migrate | Adapt plugin source after a DSH host upgrade | Build the version corridor and touchpoint inventory, then plan and confirm |

This skill does not handle DSH core-only upgrades, and it must not modify DSH core to conceal plugin incompatibility.

## Shared read-only preparation

1. Read repository rules such as `AGENTS.md` and `CLAUDE.md`; inspect branch, HEAD, working tree, and submodules. Stop and report unfamiliar changes or untracked files. Never auto-stash, reset, clean, or checkout.
2. Identify the installation track: registry package, Git checkout, workspace/junction, or copied install. Record declared and resolved versions, Git SHA, and current DSH/Node versions.
3. Preserve file ownership boundaries:
   - `package.json` and lockfile: package and dependencies;
   - `dsh-plugin.json`: community-standard manifest, when present;
   - `cordis.patch.yml`, `agent.cordis.yml`, and legacy `cordis.yml`: profile composition;
   - resolved config: runtime evidence only; never write the whole object back.
4. Verify the target source, tag/package name, compatibility range, release notes, install scripts, and known breaking changes. Never read, print, or commit tokens, `.npmrc` contents, credentials, or session logs.
5. Record the rollback baseline: current HEAD/package version, lockfile, and hashes or paths for configuration that may change. Describe recovery only for the explicit paths owned by this task; do not promise rollback of arbitrary third-party script effects.

## Mode A · inspect (read-only)

Report current and available versions, source, compatibility range, breaking changes, recommended target, risks, and validation plan. Do not edit files, install dependencies, run lifecycle scripts, use `git pull`, or switch versions. If the user chooses to proceed, enter Mode B or C with separate confirmation.

## Mode B · update an installed plugin

1. Select one update mechanism from the installation track. When a lockfile exists, use its package manager only; do not mix npm, pnpm, and bun.
2. Present the exact target, commands, files, lifecycle scripts, configuration migration, and rollback steps.
3. **Obtain explicit confirmation before any write or install**, even when no breaking change is known.
4. Make the smallest change in a dedicated branch or worktree. Patch configuration by path and preserve unknown fields. For Git installs, fetch and compare an explicit tag or commit; never `git pull` a dirty worktree.
5. Run “Validation and reporting.” On failure, restore only paths owned by this task and report residual effects.

## Mode C · migrate with a DSH host upgrade

1. Confirm exact from/to tags. Build the corridor from the `from → to` metadata in [references/README.md](references/README.md), never filename sort order.
2. Read the full corridor and compute the final net state before editing. If a field is removed in one version and restored later, do not delete and re-add it.
3. Use [pre-flight.md](references/pre-flight.md) to scan seven touchpoint classes: source patches, events, services/Remote, host filesystem, UI/commands/tools, custom channels, and subprocess/output. Zero hits are heuristic only; still inspect dependencies/imports and run build plus a real mount.
4. Keep only cards intersecting the detected touchpoints and the actual face: Host, Web Client, or ordinary plugin. Cards are curated, not a complete API diff. Mark missing corridor edges or API coordinates unsupported/pending instead of guessing.
5. Group the migration plan by seam, naming hit files, cards, target behavior, and tests. After confirmation, implement in a dedicated branch or worktree. Suggest `capability` cards; never adopt them automatically.

## Safety boundaries

- Show the plan and obtain confirmation before file writes, installs, version fetch/switch operations, or package scripts.
- Never auto-stash, reset, clean, force-update, or overwrite user or agent work.
- Never expose credentials; diagnostics may report only configuration presence and non-sensitive versions or sources.
- Do not retry unknown `gateway/internal` or other failures by default. Retry only a classified transient error for an idempotent operation when policy allows it.
- If primary sources or reproducible behavior cannot establish a migration with high confidence, stop and mark it pending review.
- When local evidence conflicts with a primary source, record both, reproduce, and report the discrepancy.

## Validation and reporting

Validate the applicable layers:

1. Resolution: package manager, lockfile, and dependency graph contain only expected changes.
2. Static: build, typecheck, and plugin tests.
3. Runtime: cold-start a real DSH profile; verify entry activation and that required/provided Cordis services do not remain pending.
4. Behavior: execute one core plugin path. Host migrations require at least one message → tool → response flow or an equivalent specialized path.
5. Wrapper: verify exit code, stdout, stderr, cancellation, and teardown.

Structure the report as:

- **Completed**: versions, files, cards, and validation;
- **Skipped**: non-hits or inapplicable items with evidence;
- **Pending/residual risk**: missing sources, untested platforms, lifecycle-script effects;
- **Rollback**: recorded baseline and recoverable paths;
- **Recommendations**: optional capabilities and future migration to public seams.

## References

| File | Purpose |
|---|---|
| [references/README.md](references/README.md) | Version corridors, card schema, and maintenance rules |
| [references/pre-flight.md](references/pre-flight.md) | Seven-class touchpoint scan and report template |
| [references/v0.1.2-alpha.1.md](references/v0.1.2-alpha.1.md) | rc.2→alpha.1: 14 curated cards |
| [references/v0.1.2-alpha.2.md](references/v0.1.2-alpha.2.md) | alpha.1→alpha.2: 6 curated cards |
| [references/rollup-0.1.2.md](references/rollup-0.1.2.md) | 0.1.1→0.1.2 corridor rollup: cross-cohort compatibility, unpublished cohort installation, `RemoteResult` flow, and layered validation; **based on alpha.2 and subject to final-release review** |
| [examples/legacy-plugin/](examples/legacy-plugin/) | Static seven-touchpoint fixture; never execute it |

[dsh-community-standard](https://github.com/oh-my-dsh/dsh-community-standard) owns manifest, contract-coordinate, and negotiation conventions. This skill handles practical upgrades and reuses that classification without redefining it. The official migration call is [deepseek-harness discussion #5120](https://github.com/deepseek-ai/deepseek-harness/discussions/5120).
