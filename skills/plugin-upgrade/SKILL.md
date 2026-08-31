---
name: plugin-upgrade
description: Inspect or upgrade installed DSH (DeepSeek Harness) plugins, or adapt plugin source to a newer DSH host version. Inspection stays read-only; show a plan and obtain confirmation before any configuration, dependency, or source write.
---

English | [简体中文](SKILL.zh-CN.md)

# plugin-upgrade

Safely handle three task types: read-only update inspection, installed-plugin upgrades, and DSH host version compatibility migration. If user intent is unclear, confirm the mode first; never let "help me check for updates" slide into installing or changing code.

Note: the version cards under `references/` are kept in Chinese; card IDs, field names, and cited commands are language-neutral.

## Step 0: choose a mode

| Mode | User intent | Default allowed action |
|---|---|---|
| A · inspect | Check for updates or assess impact from a DSH release | Read-only investigation and report; then stop |
| B · update | Upgrade an installed plugin to an explicit version | Plan and confirm before changing composition or dependencies |
| C · host-migrate | Adapt plugin source after a DSH host upgrade | Build the version corridor and touchpoint inventory, then plan and confirm |

This skill does not handle "upgrade DSH core only and leave the plugins alone," and it must not modify DSH core to conceal plugin incompatibility.

## Shared read-only preparation

1. Read the target repository's rules such as `AGENTS.md` / `CLAUDE.md`; check branch, HEAD, working tree, and submodules. Stop and report unfamiliar changes or untracked files; never auto-stash, reset, clean, or checkout.
2. Record source identity and installation identity separately: registry package, Git checkout, workspace/junction, or copied install; record the source repository/URL, Git SHA, actual package name, declared/resolved versions, and current DSH/Node versions. GitHub owner/repo and registry scope/package are independent coordinates — do not derive or rewrite one from the other.
3. Preserve file ownership boundaries:
   - `package.json` / lockfile: package and dependencies;
   - `dsh-plugin.json`: community-standard manifest (if adopted);
   - `cordis.patch.yml` / `agent.cordis.yml` / legacy `cordis.yml`: profile composition;
   - resolved config: runtime composition result, used for verification only; never write the whole object back.
4. Verify the target version's source, tag/package name, compatibility range, release notes, install scripts, and known breaking changes. Never read, print, or commit tokens, `.npmrc` contents, credentials, or session logs.
5. Record the rollback baseline: current HEAD/package version, lockfile, and hashes/paths for configuration that may change. Describe recovery only for the explicit paths owned by this task; do not promise rollback of arbitrary third-party script side effects.

## Mode A · inspect (read-only)

Report: current/available versions, source, compatibility range, breaking changes, recommended target, risks, and a validation plan. Do not edit files, install dependencies, run lifecycle scripts, `git pull`, or switch versions. If the user decides to proceed, enter Mode B or C with separate confirmation.

## Mode B · update (upgrade an installed plugin)

1. Choose the single update mechanism that matches the resolved package identity and installation track; when a lockfile exists, use only its package manager — do not mix npm/pnpm/bun, and do not rewrite a registry package name to match a GitHub owner.
2. Produce a change plan: exact target version, commands to run, files that will change, lifecycle scripts that may run, configuration migration, and rollback steps.
3. Obtain explicit user confirmation before any write or install, even when no breaking change is known.
4. Make minimal changes in a dedicated branch/worktree; patch configuration by path and preserve unknown fields. For Git sources, fetch and compare an explicit tag or commit first; never `git pull` a dirty worktree.
5. Successful dependency installation does not mean DSH has enabled the plugin; verify the target profile's composition actually resolves to the target package, remove old source lines owned by this upgrade if any exist, and confirm the runtime entry is active.
6. Run "Validation and reporting"; on failure, restore only the paths owned by this task and report residual side effects.

## Mode C · host-migrate (migrate the plugin with a DSH upgrade)

0. Run the baseline first: in the repository's own dependency state (no target pin, no target env) run the mechanical suite (build / typecheck / tests; these run package scripts, so first show the commands to be executed per the safety boundaries and obtain confirmation), and record pre-existing failures as an exemption list (see R-06 in [references/rollup-0.1.2.md](references/rollup-0.1.2.md); later corridors follow the same pattern). The migration must not add or worsen failures; pre-existing failures are exempted per the baseline.
1. Confirm exact from/to tags; connect version corridors by the `from → to` metadata in [references/README.md](references/README.md) — never by filename lexicographic order.
2. Read the full corridor first and compute the final net state. When a field is removed in an intermediate version and restored in the target, do not delete and re-add it.
3. Scan the seven touchpoint classes per [pre-flight.md](references/pre-flight.md): source patches, events, services/Remote, host filesystem, UI/commands/tools, custom channels, subprocess/output. You may first run the read-only [migration planner](scripts/README.md) to generate paths/line numbers and candidate cards, but its results remain heuristic; zero hits still require checking dependencies/imports and running build plus a real mount.
4. Keep only cards that intersect the hit touchpoints and the actual face (Host / Web Client / ordinary plugin). Cards are a curated list, not a complete API diff; when corridor edges or API coordinates are missing, mark them unsupported/pending instead of changing things from memory.
5. Produce a source-migration plan grouped by seam, listing hit files, cards, target behavior, and tests; obtain confirmation before implementing in a dedicated branch/worktree. `capability` cards are suggestions only — never adopt them automatically.

## Safety boundaries

- Show the plan and obtain confirmation before any file write, install, version fetch/switch, or package script run;
- Never auto-stash/reset/clean/force-update, and never overwrite user or other agents' work;
- Never expose credentials; diagnostics may report only whether something is configured and non-sensitive versions/sources;
- Do not retry unknown `gateway/internal` or other failures by default; retry only when the error is retryable, the operation is idempotent, and policy allows;
- When a migration approach cannot be determined with high confidence from primary sources or reproducible behavior, stop automatic changes and mark it "pending review";
- When local observation conflicts with a primary source, record both, reproduce, and report — do not silently pick one side.

## Validation and reporting

Validate at least the applicable layers:

1. Dependency resolution: the package manager, lockfile, and dependency graph change only as expected;
2. Enablement resolution: the target profile's composition points to the expected package identity, with no old source or duplicate rows;
3. Static: build, typecheck, and plugin tests;
4. Runtime: cold-start a real DSH profile; verify entry activation and that required/provided Cordis services do not remain pending;
5. Behavior: execute one core plugin path; host migrations must complete at least one message → tool → response flow, or an equivalent dedicated flow;
6. Wrapper: verify exit code, stdout, stderr, cancellation, and teardown.

Structure the report as:

- pre-existing (Mode C with the baseline run; other modes note "not collected"): the list of failures from the baseline (untouched, not attributed to this migration);
- **Completed**: versions, files, cards, and validation;
- **Skipped**: non-hits or inapplicable items with evidence;
- **Pending/residual risk**: missing sources, untested platforms, lifecycle-script side effects;
- **Rollback**: recorded baseline and recoverable paths;
- **Recommendations**: optional capabilities and follow-up work migrating to public seams.

## References

| File | Purpose |
|---|---|
| [references/README.md](references/README.md) | Version corridors, card schema, and maintenance rules |
| [references/pre-flight.md](references/pre-flight.md) | Seven-class touchpoint self-check and summary template |
| [references/v0.1.2-alpha.1.md](references/v0.1.2-alpha.1.md) | rc.2→alpha.1 curated cards |
| [references/v0.1.2-alpha.2.md](references/v0.1.2-alpha.2.md) | alpha.1→alpha.2 curated cards |
| [references/api-migration-0.1.2-alpha.2.md](references/api-migration-0.1.2-alpha.2.md) | Exact rc.2→alpha.2 interface ledger; read when API, Remote, Settings, events, Headless, packaging, or composition surfaces are hit |
| [references/rollup-0.1.2.md](references/rollup-0.1.2.md) | 0.1.1 → 0.1.2 corridor (rollup): cross-cohort coexistence, unpublished-cohort installation, `RemoteResult` error flow, pre-migration baseline attribution, bounded retry for boot race, base-only preset precondition, type-surface export drift, host-self safety boundary, and the layered validation checklist; based on alpha.2 and subject to final-release review |
| [scripts/README.md](scripts/README.md) | Read-only migration planner: scans the target repository, connects the card corridor, and outputs a candidate migration plan |
| [examples/legacy-plugin/](examples/legacy-plugin/) | Static fixture for the seven touchpoint classes (never execute) |

Normative background: [dsh-community-standard](https://github.com/oh-my-dsh/dsh-community-standard)
owns manifests, contract coordinates, and negotiation conventions; this skill handles practical upgrades of existing plugins, reusing that classification without redefining it. The official call for contributions is [deepseek-harness discussion #5120](https://github.com/deepseek-ai/deepseek-harness/discussions/5120).
