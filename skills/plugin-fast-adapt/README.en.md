# plugin-fast-adapt

English | [简体中文](README.md)

**plugin-fast-adapt** is a high-performance fast adaptation and breaking-update self-healing suite for the DeepSeek Harness (DSH) plugin ecosystem.

## Motivation

In traditional `plugin-upgrade` practices and benchmark suites (e.g. Harbor S/M/H tasks):
1. **Manual card-set maintenance bottleneck**: As upstream leaps thousands of commits (e.g. `0.2.0-rc.2 → 0.2.1-alpha.5` with 8,000+ files changed), manual cards fall behind, hitting `unsupported corridor gap`.
2. **Context bloat & negative transfer on lighter models**: Pumping tens of thousands of tokens of prose cards induces severe cognitive overhead on models like DeepSeek V4 Flash and Qwen 27B, leading to timeouts and score regressions.
3. **Dirty runtime environments & heavy cold-boot timeouts**: Issue #263 shows overlay package taint breaks message sinks without touching plugin source; Issue #171 shows cold-boot verifiers timing out after 3,600s.

**Core design of fast-adapt**:
- **Deterministic CLI-driven collection**: Hygiene check, activation diagnosis, and AST contract diffing complete in milliseconds;
- **Micro-context budget**: Keeps prompt overhead under 1,000 tokens;
- **In-memory sandbox smoke test**: Asserts Cordis module loading, dependency injection, and tool registrations in under 20ms using a MockContext;
- **Industrial quality audit**: Four-dimensional deep audit across memory safety, contract resilience, context token budget, and lifecycle teardown.

## Script Toolbox

| Script | Responsibility | Latency |
|---|---|---|
| `scripts/dsh-hygiene-doctor.mjs` | **Hygiene gate (Read-only)**: Audits `~/.dsh/profiles/` overlay packages (prevents issue #263 message sink rejections), detects active ghost hosts, checks `tsbuildinfo` cache pollution and `prepare` script traps. | < 50ms |
| `scripts/dsh-env-healer.mjs` | **Environment self-healing (Write)**: Isolates tainted overlay packages into `~/.dsh/.trash/` safely, cleans stale snapshots and locks. | < 30ms |
| `scripts/dsh-activation-doctor.mjs` | **Activation doctor (Read-only)**: Checks `inject` dependency satisfaction (prevents silent pending trap), `cordis.patch.yml` registration, and build artifacts. | < 40ms |
| `scripts/dsh-contract-diff.mjs` | **AST contract diff (Read-only)**: Pinpoints deprecated `@deepseek-ai/dsh-settings`, `client-runtime`, Message v4 formats, and provides dual-plane reload guidance. | < 80ms |
| `scripts/auto-fixer.mjs` | **Mechanical auto-fixer (Write)**: Normalizes `peerDependencies` for prereleases, strips intercepted `prepare` scripts, purges build caches. | < 20ms |
| `scripts/quick-smoke.mjs` | **In-memory sandbox smoke (Executes plugin apply)**: Mocks Cordis/DSH core context, asserts module activation and tool registration in 15ms. | 2~20ms |
| `scripts/dsh-plugin-auditor.mjs` | **Deep quality & resilience auditor (Read-only)**: Audits memory safety, contract resilience, context token budgets, and lifecycle teardown. | < 60ms |

## Workflow

```sh
# 1. Environment hygiene audit & healing
npm run doctor
npm run env:heal

# 2. Plugin activation readiness diagnosis
node skills/plugin-fast-adapt/scripts/dsh-activation-doctor.mjs /path/to/plugin web

# 3. Scan contract breaking points and auto-fix
node skills/plugin-fast-adapt/scripts/dsh-contract-diff.mjs /path/to/plugin
node skills/plugin-fast-adapt/scripts/auto-fixer.mjs /path/to/plugin

# 4. Clean build and instant in-memory smoke test
cd /path/to/plugin && pnpm run clean && pnpm run build
node skills/plugin-fast-adapt/scripts/quick-smoke.mjs /path/to/plugin

# 5. Deep quality & resilience audit
node skills/plugin-fast-adapt/scripts/dsh-plugin-auditor.mjs /path/to/plugin
```

## Verification

```sh
npm run test:fast-adapt
```
