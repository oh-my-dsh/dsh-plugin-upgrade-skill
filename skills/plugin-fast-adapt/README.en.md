# plugin-fast-adapt

[简体中文](README.md) | English

DSH plugin adaptation and breaking-change detection. Checks DeepSeek's latest release, pulls that version's official upgrade guide, scans local plugin code, and reports which breaking changes the plugin hits together with the vendor's own fix instructions.

## How this differs from a migration card library

The usual approach is a hand-maintained migration knowledge base: dozens of cards per version range, each describing what broke and how to fix it. The inevitable outcome is **lag** — a single upstream DSH jump can touch thousands of files, so cards are stale the moment they are written, with coverage gaps in between.

This skill takes a different approach: **maintain the method of obtaining knowledge, not the knowledge itself.**

The authoritative description of breaking changes lives in the DeepSeek harness repository at `docs/upgrade-guide/<version>/<topic>/guide.md`. It is updated in the same release, has a fixed format with `## Change` (what changed) and `## Migration` (how to fix it). Version information lives in the npm registry's `dist-tags`.

Both are vendor sources, so **the skill catches up the moment upstream ships** — there is no card lag.

## Four steps

```sh
# 1. Inspect the local environment: installed version, stale overlay packages, installed plugins
node scripts/env-doctor.mjs <plugin-dir>

# 2. Resolve the target version: what is upstream's latest, should this machine follow it
node scripts/guide-sync.mjs <local-version>

# 3. Fetch that version's official upgrade guide (reuses a local clone when present)
node scripts/guide-sync.mjs <local-version> --clone

# 4. Find which changes the plugin hits
node scripts/code-scan.mjs <plugin-dir> <upgrade-guide-dir> <local-version> <target-version>
```

Heal stale overlay packages first when any are reported (dry-run by default):

```sh
node scripts/env-heal.mjs           # report only
node scripts/env-heal.mjs --apply   # move to ~/.dsh/.trash/<date>/, never delete
```

## Dependencies

Zero external dependencies. Only Node built-ins (`node:fs`, `node:path`, `node:os`, `node:child_process`) plus the `git` and `npm` commands.

No TypeScript, no AST library, no HTTP client. Runs on Node 18+ (type stripping is an optional path, off by default).

## Scan accuracy

A naive first version reported 12 findings on a real plugin; on inspection **all 12 were false positives**. The current version applies four layers of noise reduction, and the same plugin reports 0.

The rules and the measurements behind them are in [references/heuristics.md](references/heuristics.md). Summary:

- The scanner uses a state machine to skip comments and strings, so a name mentioned in a comment is not a hit
- Full member chains win; overly generic parent chains like `ctx.tools` are dropped
- Generic words (`register`, `resolve`, `readFile`) and short names never become anchors
- "Old → new" replacement pairs are recognized, so a plugin already using the new symbol is not reported
- Constant anchors come only from the `Change` section; example values in `Migration` do not count
- Matching requires the object parts to be mutual suffixes, so `engines.dsh` never collides with `result.dsh`

The self-test covers these rules with 34 assertions (including SOP link integrity):

```sh
npm run test:fast-adapt
```

## Scripts

| Script | Responsibility |
| --- | --- |
| `scripts/env-doctor.mjs` | Probe the local DSH environment |
| `scripts/env-heal.mjs` | Heal stale overlay packages (dry-run by default) |
| `scripts/guide-sync.mjs` | Resolve the target version and fetch the official guide |
| `scripts/code-scan.mjs` | Scan plugin code against official change anchors |
| `scripts/self-test.mjs` | Self-test |
| `scripts/lib/scanner.mjs` | Lexical scanner and version comparison |
| `scripts/lib/guide-parser.mjs` | Official guide parsing and anchor extraction |

## Safety posture

- `env-doctor` and `code-scan` are strictly read-only
- `env-heal` is dry-run by default and moves rather than deletes when applied
- Never modifies DSH itself, nor config or profile declarations under `~/.dsh`
- Never edits plugin code automatically; it reports findings and vendor fixes only
- Network is used only with `--clone`, always with a timeout, and failures are reported explicitly

## Legacy plugins

The official upgrade guide only goes back to dsh-v0.1.7-rc.2. For older plugins, follow the [legacy migration SOP](references/legacy-migration-sop.md): use the sibling skill plugin-upgrade's hand-curated card corridor (from dsh-v0.1.0-rc.8 on) as the difference source and walk a seven-stage checklist (mode → read-only prep → ghost-host check → corridor assembly → seven touchpoint classes → plan & confirm → six-layer validation). The SOP references rather than copies the cards, so renamed cards are caught by the self-test's dead-link assertion.

## Known limitations

The official upgrade guide does not cover every breaking change (package retirement is one class that is not documented there); the `env-doctor` overlay inspection covers that case. Same-named symbols can still collide and require human judgment of the surrounding code. This skill performs static matching only and does not verify runtime behaviour.
