# plugin-fast-adapt

[简体中文](README.md) | English

[![CI](https://github.com/taxueseek/plugin-fast-adapt/actions/workflows/ci.yml/badge.svg)](https://github.com/taxueseek/plugin-fast-adapt/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE) [![Node](https://img.shields.io/badge/node-%3E%3D22.13-blue.svg)](package.json) [![Dependencies](https://img.shields.io/badge/dependencies-0-blue.svg)](#dependencies) [![Self-test](https://img.shields.io/badge/self--test-129%20passing,%20zero%20network-brightgreen.svg)](#dependencies)

> **Every time DSH ships a new release, existing plugins can stop working.** This skill reads the vendor's official upgrade guide directly, scans your plugin code, and reports which breaking changes you hit together with the vendor's own fix instructions; it also scaffolds a smoke-testable plugin from zero in one command.

## At a glance

| | |
| --- | --- |
| Upstream ships a new release | Works immediately, zero changes (reads vendor sources, no hand-curated cards) |
| Scan false positives | 12 → 0 (four noise-reduction layers) |
| Verifying one change | 3,600 s real host cold start → millisecond-scale in-memory smoke test |
| Self-test | 130 assertions, zero network, runs on any machine |
| External dependencies | 0 (Node built-ins + the `git`/`npm` commands only) |
| Scaffolding | One command emits a smoke-testable skeleton in five forms, then a write gate issues the birth certificate |

## What problem it solves

DSH (DeepSeek Harness) is an AI runtime framework where everything is a plugin, and the trouble is that every new release can break existing plugins. The common workaround is hand-written upgrade cards: dozens of cards per version range, each recording what broke and how to fix it. That path has three problems it cannot get around:

1. **Cards go stale the moment they are written**. A single upstream jump can touch thousands of files, and there are "corridor gaps" the cards never cover.
2. **A large knowledge base costs context**. Loading the full card library is a real burden for small models. The paper's only negative result — a locally served qwen3.8-27b at -3.07 pp over 56 tasks (7 improved, 18 regressed, 31 flat) — is judged **inconclusive and infrastructure-confounded** there (CI [-8.13, +1.99], heavy skill-arm local-serving timeouts), and Qwen3.8-Max records +8.13 under the same protocol, so it is not evidence that cards hurt weaker models; it only says context cost is worth controlling.
3. **Verification is expensive**. Every change needs a real host cold start (a 3,600-second timeout is on record), and stale packages left in the profiles overlay after a host upgrade break plugin loading.

This project takes a different approach: **maintain the method of obtaining knowledge, not the knowledge itself.** The authoritative description of breaking changes lives in the vendor harness repository at `docs/upgrade-guide/<version>/<topic>/guide.md`, updated with each release in a fixed format (`## Change` for what changed, `## Migration` for how to fix it); version information lives in the npm registry's `dist-tags`. Both are vendor sources, so the skill catches up the moment upstream ships.

### Advantages

- **Tracks new releases automatically**: reads the official `docs/upgrade-guide/` and npm `dist-tags` directly, so it works the moment upstream ships — no card lag, no corridor gaps
- **Zero false positives**: four noise-reduction layers took a real plugin from 12 false positives to 0, and every finding carries `severity`, `evidence` and provenance anchors pointing straight at the official guide
- **Cheap verification**: the in-memory Cordis smoke test returns in milliseconds to seconds, with no real host cold start; add `--real-smoke` when you need real-host evidence (clean profile, install and boot)
- **Zero external dependencies**: Node built-ins plus the `git`/`npm` commands only — no TypeScript, no AST library, no HTTP client
- **Reproducible**: 130 assertions, zero network, runs on any machine; CI runs on every push and pull request
- **More than adaptation**: `scaffold.mjs` emits a smoke-testable skeleton in five forms in one command, and `write-gate.mjs` issues a birth certificate when you are done
- **Honest about its limits**: a passing smoke test is not host compatibility, and the tool says so in its output; soft audit metrics are passed through, never turned into a verdict on your behalf

## Install

With the [skills CLI](https://github.com/vercel-labs/skills) (recommended — one command installs to every supported agent):

```sh
npx skills add taxueseek/plugin-fast-adapt
```

Claude Code marketplace:

```sh
/plugin marketplace add taxueseek/plugin-fast-adapt
/plugin install plugin-fast-adapt
```

npm (ships a `plugin-fast-adapt` command that forwards to the one-command pipeline):

```sh
npx plugin-fast-adapt <plugin-dir>
```

Manual install:

```sh
git clone https://github.com/taxueseek/plugin-fast-adapt.git
# Point your agent at the repository root (where SKILL.md lives) as a skill directory
# Cursor users: cp -r plugin-fast-adapt/* .cursor/skills/plugin-fast-adapt/
```

## Pipeline

Run the whole chain with one command (recommended); every run writes a local log:

```sh
node scripts/run.mjs <plugin-dir>        # env → version → guide → scan → audit → smoke → typecheck
node scripts/run.mjs <plugin-dir> --real-smoke   # plus one more tier: install & boot in a clean profile (bridges upstream verify-runtime)
node scripts/run-log.mjs list           # review past runs (tool version@commit included)
node scripts/run-log.mjs doctor         # cross-check run logs × host startup logs (first stop for "plugin erroring")
node scripts/run-log.mjs sanitize --latest --out share.json   # sanitise before sharing
```

You can also run each step on its own (the six-step spine remains; run.mjs just chains the steps below, and the optional ones are added as needed):

```sh
# 1. Inspect the local environment: installed version, stale overlay packages,
#    installed plugins, activation readiness
node scripts/env-doctor.mjs <plugin-dir>

# 2. Resolve the target version: what is upstream's latest, should this machine follow it
node scripts/guide-sync.mjs <local-version>

# 2b. Upstream watch (cron/agent friendly): exit 1 = new version out (guides prefetched),
#     0 = nothing to do, 2 = could not determine
node scripts/guide-sync.mjs --check

# 3. Fetch that version's official upgrade guide (reuses a local clone when present)
node scripts/guide-sync.mjs <local-version> --clone

# 4. Find which changes the plugin hits
node scripts/code-scan.mjs <plugin-dir> <upgrade-guide-dir> <local-version> <target-version>

# 4b. Seam query: dual-source verdict for a package/API symbol across the official
#     guide anchors and the local host install ("removed" is only concluded when both agree)
node scripts/seams.mjs dsh-settings
```

Heal stale overlay packages first when any are reported (dry-run by default):

```sh
node scripts/env-heal.mjs           # report only
node scripts/env-heal.mjs --apply   # move to ~/.dsh/.trash/<date>/, never delete
```

Two optional steps complete the "verify as you build, audit as you upgrade" loop:

```sh
# 5. Post-fix smoke verification: in-memory Cordis mock checks module loading,
#    the apply contract and tool registration. Undeclared-inject host-service
#    access is rejected with the same contract error the real host throws.
node scripts/quick-smoke.mjs <plugin-dir>

# 6. Four-dimension audit while you are at it: performance, resilience,
#    context budget, lifecycle
node scripts/plugin-audit.mjs <plugin-dir>
node scripts/plugin-audit.mjs <plugin-dir> --guide <guide-root> <local-version> <target-version>
node scripts/plugin-audit.mjs <plugin-dir> --guide <guide-root> <local-version> <target-version> --peer-patch  # print verified peer patches

# 7. One-command host-log diagnosis: StartupError / port-in-use /
#    undeclared inject / dead client entry
node scripts/log-doctor.mjs --pattern '^startup-' --limit 5

# 8. Sync the skill surface to a downstream skill directory (--check = drift only)
node scripts/sync-skill.mjs --dest <downstream-skill-dir> --check
```

## Scan accuracy: from 12 false positives to 0

A naive first version reported 12 findings on a real plugin; on inspection **all 12 were false positives**. The current version applies four layers of noise reduction, and the same plugin reports 0:

- The scanner uses a state machine to skip comments and strings, so a name mentioned in a comment is not a hit
- Full member chains win; overly generic parent chains like `ctx.tools` are dropped
- Generic words (`register`, `resolve`, `readFile`) and short names never become anchors; "old → new" replacement pairs are recognized, so a plugin already using the new symbol is not reported
- Constant anchors come only from the `Change` section; matching requires the object parts to be mutual suffixes, so `engines.dsh` never collides with `result.dsh`
- Package semantic gate: a package name becomes an anchor only when mentioned in a sentence with a removal/renaming verb — contextual mentions ("The mode fields of X accept only …", about field values) do not count. All 3 criticals reported on dsh-files were of this kind; the gate zeroed them

Each finding carries a `severity` (package=critical, member=high, code=medium — fix the front of the list first), an `evidence` line (the source line itself, so checking for false positives needs no file opening) and provenance anchors (`guideFile`/`guideLine`, pointing straight at the official guide's original location). The rules and the measurements behind them are in [references/heuristics.md](references/heuristics.md). Scan roots are the union of source roots (`src` plus sibling `client`/`web`/`ui`); build outputs (`lib`/`dist`) are not scanned twice. The smoke test discloses its mock fallbacks: the `mockFallbacks` list in the output names every property the plugin touched but the mock does not provide — the longer that list, the less the result can be trusted. **A passing smoke test is not host compatibility**, and the tool says so in its output, not just in the docs. The smoke test also rejects undeclared-`inject` host-service access at the `inject_contract` stage, matching the real Cordis contract, instead of letting load-time crashes pass silently. When you need real-host evidence, `run.mjs --real-smoke` bridges upstream plugin-upgrade's `verify-runtime.mjs`: install → boot → four-class attribution in a clean profile (honestly skipped with install guidance when the script is absent).

## Scaffold a plugin from zero

```sh
node scripts/scaffold.mjs <namespace>/<name> --form tool|hook|service|config|llm-adapter [--out <dir>] [--harness <version>]
```

One command emits a smoke-testable skeleton: package.json (build-free pure-ESM invariants), a minimal runnable entry per form, a `cordis.patch.yml` mounting row, and a `dsh-plugin.naming.json` with collision-resistant naming projections derived in full (the output passes upstream validate-names in `--strict` mode). The tool and hook forms are dependency-free and smoke-tested on the spot; service, config and llm-adapter need host `@deepseek-ai/*` base classes, so scaffolding honestly skips their smoke run and says so. Non-empty target directories and invalid coordinates are rejected before anything is written.

The skeleton guarantees structure and naming compliance only; capability implementation still follows the five form references of [plugin-write](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/tree/main/skills/plugin-write). When the capability is written, gate it in one command:

```sh
node scripts/write-gate.mjs <plugin-dir>   # birth certificate: hard gates auto-judged, soft metrics passed through
```

There are only three hard gates (entry artifact exists, smoke passes, zero critical findings against the official guide); a failing one exits 1. Audit scores, high/medium findings, mockFallbacks and the not-yet-mounted fact all land in the discretion section labelled for human judgment — the tool never says "qualified" on your behalf. Guide discovery reuses the guide-sync cache (zero network); a new plugin is scanned against the full historical corridor; pass `--skip-smoke` right after scaffolding to skip the duplicate smoke run.

## Dependencies

Zero external dependencies. Only Node built-ins (`node:fs`, `node:path`, `node:os`, `node:child_process`) plus the `git` and `npm` commands.

No TypeScript, no AST library, no HTTP client. Runs on Node 22.13+ (`import.meta.dirname` needs 20.11+, the optional type stripping needs 22.13+; type stripping is off by default).

Self-test:

```sh
npm test   # node scripts/self-test.mjs, 130 assertions
```

Contributors should enable the pre-commit gate (one time): `git config core.hooksPath .githooks` — every commit runs the self-test, so a forgotten downstream sync is caught at commit time.

Covers scanner false positives (names in comments and strings are not hits), false negatives, version heuristics, replacement-pair recognition, end-to-end findings (with guide file + line provenance anchors), dual-source seam-query verdicts (agree-removed / host-still-present disagreement / honest no-record), run-log × host-log cross-checks, the --real-smoke bridge tier (fail → exit 2 with a next-step pointer), the upstream-watch exit codes, the sync commit-command suggestion (adds only the synced path), SOP reference integrity, dist-tags cache states, smoke verification (including the undeclared-inject contract rejection), the four-dimension audit (including peer patches), activation diagnostics, the plugin scaffolder (all five forms, naming-projection grammar, smoke closure, patch-layer recognizability, invalid-input and non-empty-target rejection), the write gate (hard-gate interception, soft metrics never overrule, skip semantics, scaffold handoff), log diagnosis, downstream-sync drift checks plus a real-machine zero-drift gate, a self-test size gate and a scanner performance gate. Zero network, zero external dependencies, runs on any machine.

To gate your own plugin's repository at commit time (smoke/typecheck as hard gates, audit as a soft report), see [references/ci-snippet.md](references/ci-snippet.md).

## Scripts

| Script | Responsibility |
| --- | --- |
| `scripts/cli.mjs` | npm entry (`npx plugin-fast-adapt`), forwards to run.mjs |
| `scripts/run.mjs` | One-command orchestration of the full chain (env → version → guide → scan → audit → smoke → typecheck), unified report plus a local run log; `--real-smoke` bridges upstream verify-runtime for a real-cold-boot tier |
| `scripts/run-log.mjs` | Run-log viewing (list/show), cross-checking (doctor: run logs × host startup logs) and sanitised export (sanitize) |
| `scripts/seams.mjs` | Seam query: dual-source verdict for one package/API symbol across official guide anchors and the local host install |
| `scripts/scaffold.mjs` | Scaffold a plugin from zero: one command emits a smoke-testable skeleton in any of the five forms (package.json invariants + form entry + patch layer + naming projections), verified on creation |
| `scripts/write-gate.mjs` | Gate a finished plugin: orchestrates smoke + activation readiness + four-dimension audit + official-guide scan into a birth certificate; only three hard gates auto-judge, soft metrics pass through untouched |
| `scripts/env-doctor.mjs` | Probe the local DSH environment (version, overlay, plugins, processes, activation readiness) |
| `scripts/env-heal.mjs` | Heal stale overlay packages (dry-run by default) |
| `scripts/guide-sync.mjs` | Resolve the target version and fetch the official guide (dist-tags cached 1 h, degrades to stale cache) |
| `scripts/code-scan.mjs` | Scan plugin code against official change anchors |
| `scripts/quick-smoke.mjs` | Post-fix smoke verification (in-memory Cordis mock, discloses fallbacks) |
| `scripts/plugin-audit.mjs` | Four-dimension performance & architecture audit, optional `--guide` cross-check; `--peer-patch` prints verified peer patches |
| `scripts/log-doctor.mjs` | One-command diagnosis of `~/.dsh/logs/` (startup header / failed plugins / waiting services / signal summary) |
| `scripts/sync-skill.mjs` | Sync the skill surface to a downstream skill directory; `--check` reports drift |
| `scripts/self-test.mjs` | Self-test |
| `scripts/lib/scanner.mjs` | Lexical scanner and version comparison (zero-dependency) |
| `scripts/lib/guide-parser.mjs` | Official guide parsing and anchor extraction |
| `references/legacy-migration-sop.md` | Legacy migration SOP (for ranges the official guide does not cover) |
| `references/heuristics.md` | Scan noise-reduction rules and the measurements behind them |
| `references/ci-snippet.md` | CI gate template for plugin repositories (smoke/typecheck hard gates + audit soft report) |

## Safety posture

- `env-doctor`, `code-scan`, `plugin-audit`, `log-doctor`, `seams` and `run-log` are strictly read-only
- `env-heal` is dry-run by default and moves rather than deletes when applied (into `~/.dsh/.trash/<date>/`)
- `sync-skill` writes to a downstream skill directory explicitly, copying only the fixed skill surface (`SKILL.md`/`README*`/`references`/`scripts`); `--check`/`--dry-run` let you inspect first
- Never modifies DSH itself, nor config or profile declarations under `~/.dsh`
- Never edits plugin code automatically; it reports findings and vendor fixes only, and `--peer-patch` prints rather than applies
- Network is used only with `--clone`, always with a timeout, and failures are reported explicitly instead of silently skipped

## Legacy plugins

The official upgrade guide only goes back to dsh-v0.1.7-rc.2. For older plugins, follow the [legacy migration SOP](references/legacy-migration-sop.md): use the upstream [plugin-upgrade skill](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/tree/main/skills/plugin-upgrade)'s hand-curated card corridor (from dsh-v0.1.0-rc.8 on) as the difference source and walk a seven-stage checklist (mode → read-only prep → ghost-host check → corridor assembly → seven touchpoint classes → plan & confirm → six-layer validation). The SOP references rather than copies the cards, so renamed cards are caught by the self-test's dead-link assertion.

## Known limitations

- The official upgrade guide does not cover every breaking change (package retirement is one class that is not documented there); the `env-doctor` overlay inspection covers that case
- Same-named symbols can still collide (a plugin's `path.resolve()` versus the guide's `runtime.resolve()`) and require human judgment of the surrounding code
- Static matching only, no runtime-behaviour verification; the smoke mock covers the common host surface only

## Provenance and division of work

This project was split out of [oh-my-dsh/dsh-plugin-upgrade-skill](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill) (a skill collection that teaches AI agents to upgrade DSH plugins, with an [arXiv paper](https://arxiv.org/abs/2609.30120)) via git subtree and has evolved independently since. The upstream project carries 195 hand-maintained upgrade cards, 11 skills and a 63-case auto-graded benchmark.

The two projects complement each other:

| Aspect | Upstream | This project |
| --- | --- | --- |
| Difference source | Hand-maintained upgrade cards | Official `docs/upgrade-guide/` + npm `dist-tags`, updates with upstream automatically |
| New release ships | Wait for cards, corridor gaps in between | Works immediately, zero changes needed |
| Verifying one change | Real host cold start, measured up to 3,600 s | In-memory Cordis smoke test, milliseconds to seconds |
| Stale overlay packages | Manual troubleshooting | `env-doctor` inspection + `env-heal` healing (dry-run by default) |
| Context cost | Full card library in context | Six independent scripts, one small output each |
| Code-level scanning | None | Anchor matching + four noise-reduction layers |
| Fleet-wide sweep | `plugin-fleet-sweep` owns breadth | The six-step pipeline owns depth |

A fleet-wide sweep after a host upgrade goes to upstream's [plugin-fleet-sweep](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/tree/main/skills/plugin-fleet-sweep) (breadth), and each flagged plugin comes back to this project's six-step pipeline for a deep pass (depth). For historical corridors the official guide does not cover (before v0.1.7-rc.2), this project's SOP references upstream's cards and scripts — segments with a guide use this project's `code-scan`, segments without use upstream's `plan-migration.mjs` and cards, and runtime verification uses upstream's `verify-runtime.mjs` (directly bridgeable via this project's `run.mjs --real-smoke`).
