# JUDGE BRIEF · skill.S7-unpublished-cohort

## Criteria (sealed rubric)
- [published-version-evidence] (25pt) Use package.json and the supplied README/brief to distinguish the @deepseek-ai/dsh-llm declaration from the published version list: alpha.1 was never published there, while alpha.2 was. Do not infer each internal package exists from the root package or a dist-tag. The brief already supplies the registry fact: credit using it with proposed package-specific verification; never require an actual online npm view in this closed-book task.
- [caret-resolution] (25pt) Explain why ^0.1.2-alpha.1 can select the supplied published 0.1.2-alpha.2: the missing lower-bound release does not make the range unresolvable. Identify the silent declaration/type-baseline mismatch and prerelease compatibility uncertainty. Do not claim all alpha versions are missing or that the caret guarantees alpha.1. No mandatory semver formula or keyword spelling.
- [workable-baseline-plan] (25pt) Give at least ONE complete feasible plan with its tradeoff: either deliberately target the published alpha.2 using an exact pin and acknowledge that this does not validate alpha.1; or obtain a verified exact upstream alpha.1 source ref, build/package the necessary cohort and resolve local tarballs explicitly. One coherent plan is sufficient for full credit. Bare npm ci, tarball or overrides words are not a plan; do not require guessing an unavailable tag or command.
- [reproducibility-and-exit] (25pt) Make the chosen plan reproducible with one consistent project package manager, a committed lockfile/frozen install or equivalent, and a proposed typecheck against the intended target. For temporary local overrides, explain when/how to replace them with verified equivalent published packages and remove the overrides; an exact published-pin plan can describe deliberate future upgrades instead. Mark unverified source/build/runtime details honestly. Do not require both npm and pnpm, switching package managers, or executing installs.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [install-unpublished-registry-version] ceiling=10 Trigger only for an affirmative prescription to install the exact unpublished @deepseek-ai cohort alpha.1 version from npm as if available. The declared caret range, local tarballs built from alpha.1 source, rejected BAD examples and explicitly forbidden exact-install commands do not trigger this cap.

## Candidate report(s)
#### FILE: S7-unpublished-cohort/report.md

# S7 · Unpublished-Cohort Install Plan / Type-Baseline Plan (Read-Only Report)

**Target**: fixture `dsh-cohort-bench@0.1.0` (`"private": true`) at `fixture/`
**Declaration under analysis**: `devDependencies: { "@deepseek-ai/dsh-llm": "^0.1.2-alpha.1" }`
**README claim under analysis**: "npm install gives you the type baseline"
**Skill mode**: `plugin-upgrade` · Mode A (inspect, read-only) — no install executed, `fixture/` untouched
**Date**: 2026-10-21 (Asia/Shanghai)
**Cards referenced** (key points only): R-01, R-04, R-06, R-08, R-11 (references/rollup-0.1.2.md); DSH-0.1.3-A1-07 (references/v0.1.3-alpha.1.md)

## 摘要

- `^0.1.2-alpha.1` 是**范围**不是精确 pin。按 npm 默认 prerelease 语义，它恰好被 `0.1.2-alpha.2` 满足，因此 **install 不会失败**，会**静默安装 0.1.2-alpha.2**（不是声明的 alpha.1，也不是 0.1.1-rc.x）。
- README 的 "npm install gives you the type baseline" 双重失真：装到的是 alpha.2 的类型面（R-11 有 alpha.1→alpha.2 导出漂移），且范围在未来会漂（任何 0.1.x 正式版都满足）。
- 建议路径：Path A 精确对齐 registry（默认）/ Path B 仅验证的 alpha.1 源码类型基线 / Path C 本地构建 cohort + `overrides` + `file:` tarball / Path D 兜底 vendored `.d.ts`。

---

## 1. The real consequence of the declaration

### 1.1 What the range actually means (semver)

- `^0.1.2-alpha.1` desugars to `>=0.1.2-alpha.1 <0.2.0` (caret on 0.x: `^0.1.2` := `>=0.1.2 <0.2.0`; the prerelease part stays attached to the lower bound).
- npm/pnpm/yarn all use node-semver semantics with **`includePrerelease: false` by default**: a version carrying a prerelease satisfies a range **only if** some comparator of the range (a) itself carries a prerelease and (b) shares the **same [major, minor, patch] tuple**. The comparator `>=0.1.2-alpha.1` carries the tuple `0.1.2` + prerelease `alpha.1`, so **all `0.1.2-…` prereleases ≥ alpha.1 are eligible**, and every plain release in `[0.1.2, 0.2.0)` is eligible.
- Verified boundary table (self-contained semver computation, no registry access):

| Version | satisfies `^0.1.2-alpha.1` | why |
|---|---|---|
| `0.1.1-rc.1`, `0.1.1-rc.2` | **no** | below the `0.1.2-alpha.1` floor (different tuple 0.1.1) |
| `0.1.2-alpha.1` | yes | exact floor |
| **`0.1.2-alpha.2`** | **yes** | same tuple 0.1.2, prerelease `alpha.2 > alpha.1` |
| `0.1.2-alpha.10`, `0.1.2-rc.1`, `0.1.2` | yes | same tuple, higher precedence |
| `0.1.3-alpha.1`, `0.1.3-rc.1` | **no** | prerelease at tuple 0.1.3, no comparator with that tuple carries a prerelease |
| `0.1.3`, `0.1.9` | **yes** | plain releases within `[0.1.2, 0.2.0)` |
| `0.2.0-alpha.1`, `0.2.0` | no | outside the `<0.2.0` ceiling |

### 1.2 Will install actually fail? — **No**

Given the npm reality stated in the brief (`@deepseek-ai/*` publishes only `0.1.1-rc.1` / `0.1.1-rc.2` / `0.1.2-alpha.2`; **alpha.1 was never published** — corroborated by card R-01's "npm reality" note dated 2026-08-31), exactly one published version satisfies the range:

- `npm install` **succeeds** and resolves **`@deepseek-ai/dsh-llm@0.1.2-alpha.2`** (max-satisfying pick).
- The absence of `0.1.2-alpha.1` is **silent**: npm resolves a *range* against whatever exists and never reports "the version you wrote is missing". There is no warning that the declared floor never existed.
- Contrast: an exact pin `"@deepseek-ai/dsh-llm": "0.1.2-alpha.1"` **would** fail at resolution with `ETARGET`/`E404` ("No matching version found for 0.1.2-alpha.1" / 404 for the version) — that failure mode exists only for exact/dist-tag specs, not for this caret range.
- **When it would fail** (range-level): nothing satisfies the range at all (e.g. if `0.1.2-alpha.2` were later unpublished → `ETARGET: No matching version found for ^0.1.2-alpha.1`), or an install-channel pitfall blocks delivery although the version exists — mirror lag `E404` (R-08 pitfall 1), pnpm 11 `minimumReleaseAge` refusing fresh packages (R-08 pitfall 2), a stale lockfile pinning vanished versions (R-08 pitfall 2), or peer-floor prerelease mismatch warnings/refusals (R-08 pitfall 3). Exact npm error strings: **unconfirmed** (no registry/network access in this evaluation).

### 1.3 Which version gets installed, and the drift risk

- **Today: `0.1.2-alpha.2`** — the only published satisfying version; `0.1.1-rc.1/rc.2` are below the floor and are *not* candidates.
- **The range floats**: without a lockfile, a future `0.1.3`, `0.1.4`, … (plain releases) all satisfy, as do future `0.1.2-alpha.N`/`0.1.2-rc.N` prereleases. Only prereleases at *other* tuples (`0.1.3-alpha.x`) and `0.2.0`-anything are excluded. So "the type baseline" is a **moving target** across fresh installs/CI runs until a lockfile pins it.
- No lockfile exists in the fixture (only `package.json` + `README.md`), and the package manager is not declared → the resolution is currently **non-reproducible**; which manager the repo will adopt is **unconfirmed**.

### 1.4 Consequence for the type baseline

- The README claim is false in a second way: what "npm install" gives you is **the 0.1.2-alpha.2 declaration surface, not the declared alpha.1 baseline**. Compilers see alpha.2's `.d.ts`.
- **R-11 (0.1.2 type-surface export drift)** records exactly the drift between these cohorts (key points): `deepFreeze`/`assertNever` leave `@deepseek-ai/dsh-llm` for `@deepseek-ai/dsh-util-values` (alpha.1→alpha.2); `LlmModelDiscoveryError` is deleted in favour of `RemoteError<'llm/model-discovery-rejected'>`; the `dsh-settings` helpers are deleted; and earlier (rc.2→alpha.1) `CallId` → `ToolCallId`. A plugin authored against alpha.1 can therefore fail typecheck against the silently-installed alpha.2 (TS2305/TS2614-style) or bind to a different surface than intended.
- `devDependencies` supplies **types only**; runtime module/service activation comes from the host at mount time. Keep the type baseline and runtime composition as separate concerns (type-check green ≠ runtime green, and vice versa) — per the skill's alpha.2 precision discipline.
- The fixture contains **no source, no tsconfig, no lockfile** → which exports the plugin actually consumes is **unconfirmed**; the drift impact above is conditional on its imports.
- **Source conflict recorded, not silently resolved** (skill safety boundary): the brief's npm reality (only rc.1/rc.2/alpha.2 published) vs. R-01's later update (0.1.2-alpha.3/alpha.4 published under the `alpha` dist-tag as of 2026-09-02) describe different registry snapshots. The live registry state at execution time is **unconfirmed** (network access is prohibited here); the analysis above holds for the brief's stated set, and only the *identity* of the max-satisfying pick changes if more versions exist (it can only move upward, e.g. to alpha.3/alpha.4, never back to alpha.1).

---

## 2. Workable installation / type-baseline plan

**Principles**: one package manager + committed lockfile; declare the DSH cohort once and exactly; separate the *type* baseline from runtime activation; collect the baseline (R-06) before fixing anything; keep the fixture read-only in this task — every step below is a plan for an execution session, not something run here.

### Path A · Align the declaration with the registry (default recommendation)

1. Rewrite the devDependency to an **exact pin** `"@deepseek-ai/dsh-llm": "0.1.2-alpha.2"` (or `~0.1.2-alpha.2`); avoid `^`, which floats across the 0.1.x line (§1.3).
2. Commit a lockfile (`package-lock.json` or `pnpm-lock.yaml` — whichever manager the repo standardises on; never mix managers).
3. Run typecheck (`tsc --noEmit`) and reconcile the R-11 drift: e.g. add `@deepseek-ai/dsh-util-values` as a direct dependency for `deepFreeze`/`assertNever`, branch on `RemoteError` codes instead of deleted error classes.
4. Fix the README wording: "npm install gives you the **0.1.2-alpha.2** type baseline" — the declaration and the docs must name the same cohort.

- **Tradeoffs**: real, reproducible install; smallest diff; CI becomes deterministic. Cost: the baseline is alpha.2, so alpha.1-era code may need the small R-11 adjustments.
- **Exit path**: if the plugin genuinely needs an alpha.1-only API surface → Path B (verify-only) or Path C (build the cohort); if the drift is too large to fold in, freeze at the published `0.1.1-rc.2` baseline and treat the alpha.2 move as a separate Mode C migration with the corridor cards.

### Path B · Verify-only alpha.1 type baseline (the dsh-TUI #622 lane, R-01)

1. Keep the install baseline at a **published** cohort (rc.2 or alpha.2, per Path A) — no alpha.1 install exists or is needed.
2. In CI, check out the upstream source tag `dsh-v0.1.2-alpha.1` and run `tsc --noEmit` with the `paths` mapping taken from upstream `tsconfig.base.json`, pointed at the source tree. This proves the **alpha.1 type surface** exactly.
3. Verify runtime separately (a mounted host run), since type-surface proof carries no runtime guarantee.

- **Tradeoffs**: true alpha.1 fidelity for types, zero unpublished installs; but no runtime coverage, needs the git tag + toolchain + network, and is CI-only.
- **Exit path**: if tag `dsh-v0.1.2-alpha.1` cannot be confirmed (**unconfirmed** here), treat the segment as an unsupported gap — derive from exact-tag source/packed declarations (Mode C step 1 discipline) or fall back to Path A/D.

### Path C · Build the missing cohort locally (R-01 recipe, "unpublished-cohort installation")

1. `git clone` upstream, `git checkout dsh-v0.1.2-alpha.1`, `pnpm install && pnpm run build`.
2. `pnpm -r exec pnpm pack --pack-destination ~/.dsh-cohorts/0.1.2-alpha.1` to materialise local tarballs.
3. Pin them with `overrides` + `file:` tarballs while keeping the manifest range as `^0.1.2-alpha.1` (per R-01: the range stays; the overrides decide the actual artifact). Once the cohort ships officially, **deleting the overrides section returns to registry resolution** — that is the exit path.
4. Release hygiene (R-04): add a CI script that materialises the tarball store (cache keyed on the workspace hash) so `--frozen-lockfile` runs work on clean runners; drop the `version` input from pnpm setup so `packageManager` is the single source; keep `NPM_PUBLISH_ENABLED` off while the cohort is unpublished so a version tag can never ship unresolvable ranges (irreversible); publish cohort-adapting plugin releases under a prerelease number on the `alpha` dist-tag.

- **Tradeoffs**: exact cohort fidelity at both type and runtime level; cost: heavyweight, frozen lockfiles record machine-dependent absolute paths, and pnpm override quirks apply — the pnpm 11.9.0 override-bypass report (fix: pin `packageManager: pnpm@11.24.0`) is a **single field report, unconfirmed**; reproduce minimally before adopting.
- **Exit path**: if the tag or build cannot be reproduced, fall back to Path B (types only) or Path A (accept alpha.2).

### Path D · Vendored type declarations (last resort)

1. Check in a minimal `*.d.ts` covering exactly the consumed surface; map it via `paths`/`typeRoots`; runtime stays host-provided (types only).
2. Never re-export cohort-specific exports through plugin code (R-02 discipline: type imports are erased, but re-exports turn drift into build breaks); run **one diagnostic typecheck with `skipLibCheck: false`** if a selector/callback silently becomes `any`, and declare the owning packages directly.

- **Tradeoffs**: zero install, offline-friendly, deterministic. Cost: manual maintenance and drift risk; violations surface late.
- **Exit path**: delete the vendored declarations the moment Path A or C lands.

### Cross-cutting install-channel hygiene (R-08)

- Mirror lag `E404`: force `npm_config_registry=https://registry.npmjs.org` for installs (and pnpm inside profiles).
- pnpm 11 supply-chain rule: per-scope `minimumReleaseAgeExclude: ['@deepseek-ai/*', <plugin name>]` in the workspace/profile `pnpm-workspace.yaml`; regenerate stale lockfiles that pin vanished versions; `minimumReleaseAge: 0` only as a last resort.
- Peer-floor prerelease semantics: if the plugin declares DSH peer ranges, rewrite them to the exact target cohort (e.g. `^0.1.2-alpha.2`); an old floor like `^0.1.0-rc.8` does **not** match `0.1.2-alpha.2` (different tuple + prerelease rule) and produces install-time peer warnings/refusals regardless of real compatibility.

---

## 3. Validation plan (for the execution session that applies a path)

0. **Baseline first (R-06)**: in the repo's own dependency state, record HEAD, working-tree state, lockfile hash, commands and failure fingerprints before any change; pre-existing failures go to a do-not-fix exemption list. (Not collected in this read-only task — installs are prohibited.)
1. **Dependency resolution**: `npm ls @deepseek-ai/dsh-llm` (or `pnpm list --depth 0 | grep @deepseek-ai`) shows one coherent cohort pointing at the pinned version; scan the full lockfile for old/removed packages (e.g. `dsh-client-runtime`) and for any residual `0.1.2-alpha.1` phantom pin.
2. **Static**: `tsc --noEmit` + build green without `@ts-ignore` reliance; if selectors become `any`, one diagnostic run with `skipLibCheck: false` and direct declarations of the owning packages.
3. **Type vs runtime separation**: the type baseline proves declarations only; verify runtime module/service activation on a real host profile in a separate step (out of scope for this read-only report).
4. **Docs/declaration consistency**: the README's baseline claim names exactly the version the lockfile resolves.

---

## 4. Unconfirmed items (cannot be verified in this read-only, offline evaluation)

1. **Live npm registry state** (versions/dist-tags of `@deepseek-ai/dsh-llm` today) — network/probes are prohibited; the "only rc.1/rc.2/alpha.2" premise comes from the task brief + R-01's 2026-08-31 measurement, while R-01's update (alpha.3/alpha.4 under `alpha` as of 2026-09-02) reports a different snapshot. Both are recorded (§1.4).
2. **Existence/buildability of git tag `dsh-v0.1.2-alpha.1`** — needed by Paths B/C; no repo access here.
3. **Which type exports the fixture's plugin actually consumes** — the fixture contains only `package.json` and `README.md`; the R-11 drift impact is therefore conditional.
4. **Exact npm/pnpm error strings** in the failure branches (ETARGET/E404 wording) — derived from semver/registry semantics, not reproduced here.
5. **Package manager choice for this repo** — no lockfile, no `packageManager` field.
6. **pnpm 11.9.0 `overrides` bypass for file: tarballs** (and the pnpm@11.24.0 pin) — single field report in R-01, marked pending confirmation there.
7. **0.1.2 final release status and current dist-tags** — R-01's own "Pending confirmation" says every entry must be re-reviewed after the final release.
8. **Runtime behaviour on a real host** — not attempted (read-only scope).

---

## 5. Skill report structure

- **pre-existing**: not collected (baseline requires an install, which this task prohibits).
- **Completed**: read-only analysis of `package.json`/README; semver derivation of `^0.1.2-alpha.1` (range → `>=0.1.2-alpha.1 <0.2.0` + prerelease tuple rule) with a computed boundary table; the resolution answer (**install succeeds → `0.1.2-alpha.2`**); type-baseline consequence via R-11; four installation paths (A–D) with tradeoffs and exit paths; install-channel hygiene (R-08); validation plan.
- **Skipped**: no install executed (prohibited); no registry/network probe (prohibited); no fixture modification (sealed); no runtime/mount verification (out of scope).
- **Pending / residual risk**: §4 unconfirmed list; caret-range floating without a lockfile; silent cohort substitution (declared alpha.1 → installed alpha.2); R-11 type drift breaking alpha.1-authored code; install-channel pitfalls (R-08); irreversible publish of unresolvable ranges if a release ships while the cohort is unpublished (R-04).
- **Rollback**: not applicable (nothing changed). For a future execution session: revert only the paths owned by the task (`package.json`, lockfile, `overrides`/`paths` entries, README line) against the recorded hashes; never promise rollback of third-party lifecycle-script side effects.
- **Recommendations**: prefer Path A now (exact pin + lockfile + README fix), keep Path B in CI if alpha.1 fidelity matters, keep Path C as the documented fallback when a cohort is unpublished (delete the overrides once published), Path D only as a stopgap; declare the DSH cohort once and exactly; if the plugin is ever published while the cohort is unpublished, gate npm publish (R-04) and ship cohort-adapting releases on the `alpha` dist-tag.

---

## run-stats

- toolcalls total: 13
- token usage: n/a (not visible in this harness)
- completion time: 2026-10-21 14:27 (Asia/Shanghai)


#### FILE: report.md

# S7 · Unpublished-Cohort Install Plan / Type-Baseline Plan (Read-Only Report)

**Target**: fixture `dsh-cohort-bench@0.1.0` (`"private": true`) at `fixture/`
**Declaration under analysis**: `devDependencies: { "@deepseek-ai/dsh-llm": "^0.1.2-alpha.1" }`
**README claim under analysis**: "npm install gives you the type baseline"
**Skill mode**: `plugin-upgrade` · Mode A (inspect, read-only) — no install executed, `fixture/` untouched
**Date**: 2026-10-21 (Asia/Shanghai)
**Cards referenced** (key points only): R-01, R-04, R-06, R-08, R-11 (references/rollup-0.1.2.md); DSH-0.1.3-A1-07 (references/v0.1.3-alpha.1.md)

## 摘要

- `^0.1.2-alpha.1` 是**范围**不是精确 pin。按 npm 默认 prerelease 语义，它恰好被 `0.1.2-alpha.2` 满足，因此 **install 不会失败**，会**静默安装 0.1.2-alpha.2**（不是声明的 alpha.1，也不是 0.1.1-rc.x）。
- README 的 "npm install gives you the type baseline" 双重失真：装到的是 alpha.2 的类型面（R-11 有 alpha.1→alpha.2 导出漂移），且范围在未来会漂（任何 0.1.x 正式版都满足）。
- 建议路径：Path A 精确对齐 registry（默认）/ Path B 仅验证的 alpha.1 源码类型基线 / Path C 本地构建 cohort + `overrides` + `file:` tarball / Path D 兜底 vendored `.d.ts`。

---

## 1. The real consequence of the declaration

### 1.1 What the range actually means (semver)

- `^0.1.2-alpha.1` desugars to `>=0.1.2-alpha.1 <0.2.0` (caret on 0.x: `^0.1.2` := `>=0.1.2 <0.2.0`; the prerelease part stays attached to the lower bound).
- npm/pnpm/yarn all use node-semver semantics with **`includePrerelease: false` by default**: a version carrying a prerelease satisfies a range **only if** some comparator of the range (a) itself carries a prerelease and (b) shares the **same [major, minor, patch] tuple**. The comparator `>=0.1.2-alpha.1` carries the tuple `0.1.2` + prerelease `alpha.1`, so **all `0.1.2-…` prereleases ≥ alpha.1 are eligible**, and every plain release in `[0.1.2, 0.2.0)` is eligible.
- Verified boundary table (self-contained semver computation, no registry access):

| Version | satisfies `^0.1.2-alpha.1` | why |
|---|---|---|
| `0.1.1-rc.1`, `0.1.1-rc.2` | **no** | below the `0.1.2-alpha.1` floor (different tuple 0.1.1) |
| `0.1.2-alpha.1` | yes | exact floor |
| **`0.1.2-alpha.2`** | **yes** | same tuple 0.1.2, prerelease `alpha.2 > alpha.1` |
| `0.1.2-alpha.10`, `0.1.2-rc.1`, `0.1.2` | yes | same tuple, higher precedence |
| `0.1.3-alpha.1`, `0.1.3-rc.1` | **no** | prerelease at tuple 0.1.3, no comparator with that tuple carries a prerelease |
| `0.1.3`, `0.1.9` | **yes** | plain releases within `[0.1.2, 0.2.0)` |
| `0.2.0-alpha.1`, `0.2.0` | no | outside the `<0.2.0` ceiling |

### 1.2 Will install actually fail? — **No**

Given the npm reality stated in the brief (`@deepseek-ai/*` publishes only `0.1.1-rc.1` / `0.1.1-rc.2` / `0.1.2-alpha.2`; **alpha.1 was never published** — corroborated by card R-01's "npm reality" note dated 2026-08-31), exactly one published version satisfies the range:

- `npm install` **succeeds** and resolves **`@deepseek-ai/dsh-llm@0.1.2-alpha.2`** (max-satisfying pick).
- The absence of `0.1.2-alpha.1` is **silent**: npm resolves a *range* against whatever exists and never reports "the version you wrote is missing". There is no warning that the declared floor never existed.
- Contrast: an exact pin `"@deepseek-ai/dsh-llm": "0.1.2-alpha.1"` **would** fail at resolution with `ETARGET`/`E404` ("No matching version found for 0.1.2-alpha.1" / 404 for the version) — that failure mode exists only for exact/dist-tag specs, not for this caret range.
- **When it would fail** (range-level): nothing satisfies the range at all (e.g. if `0.1.2-alpha.2` were later unpublished → `ETARGET: No matching version found for ^0.1.2-alpha.1`), or an install-channel pitfall blocks delivery although the version exists — mirror lag `E404` (R-08 pitfall 1), pnpm 11 `minimumReleaseAge` refusing fresh packages (R-08 pitfall 2), a stale lockfile pinning vanished versions (R-08 pitfall 2), or peer-floor prerelease mismatch warnings/refusals (R-08 pitfall 3). Exact npm error strings: **unconfirmed** (no registry/network access in this evaluation).

### 1.3 Which version gets installed, and the drift risk

- **Today: `0.1.2-alpha.2`** — the only published satisfying version; `0.1.1-rc.1/rc.2` are below the floor and are *not* candidates.
- **The range floats**: without a lockfile, a future `0.1.3`, `0.1.4`, … (plain releases) all satisfy, as do future `0.1.2-alpha.N`/`0.1.2-rc.N` prereleases. Only prereleases at *other* tuples (`0.1.3-alpha.x`) and `0.2.0`-anything are excluded. So "the type baseline" is a **moving target** across fresh installs/CI runs until a lockfile pins it.
- No lockfile exists in the fixture (only `package.json` + `README.md`), and the package manager is not declared → the resolution is currently **non-reproducible**; which manager the repo will adopt is **unconfirmed**.

### 1.4 Consequence for the type baseline

- The README claim is false in a second way: what "npm install" gives you is **the 0.1.2-alpha.2 declaration surface, not the declared alpha.1 baseline**. Compilers see alpha.2's `.d.ts`.
- **R-11 (0.1.2 type-surface export drift)** records exactly the drift between these cohorts (key points): `deepFreeze`/`assertNever` leave `@deepseek-ai/dsh-llm` for `@deepseek-ai/dsh-util-values` (alpha.1→alpha.2); `LlmModelDiscoveryError` is deleted in favour of `RemoteError<'llm/model-discovery-rejected'>`; the `dsh-settings` helpers are deleted; and earlier (rc.2→alpha.1) `CallId` → `ToolCallId`. A plugin authored against alpha.1 can therefore fail typecheck against the silently-installed alpha.2 (TS2305/TS2614-style) or bind to a different surface than intended.
- `devDependencies` supplies **types only**; runtime module/service activation comes from the host at mount time. Keep the type baseline and runtime composition as separate concerns (type-check green ≠ runtime green, and vice versa) — per the skill's alpha.2 precision discipline.
- The fixture contains **no source, no tsconfig, no lockfile** → which exports the plugin actually consumes is **unconfirmed**; the drift impact above is conditional on its imports.
- **Source conflict recorded, not silently resolved** (skill safety boundary): the brief's npm reality (only rc.1/rc.2/alpha.2 published) vs. R-01's later update (0.1.2-alpha.3/alpha.4 published under the `alpha` dist-tag as of 2026-09-02) describe different registry snapshots. The live registry state at execution time is **unconfirmed** (network access is prohibited here); the analysis above holds for the brief's stated set, and only the *identity* of the max-satisfying pick changes if more versions exist (it can only move upward, e.g. to alpha.3/alpha.4, never back to alpha.1).

---

## 2. Workable installation / type-baseline plan

**Principles**: one package manager + committed lockfile; declare the DSH cohort once and exactly; separate the *type* baseline from runtime activation; collect the baseline (R-06) before fixing anything; keep the fixture read-only in this task — every step below is a plan for an execution session, not something run here.

### Path A · Align the declaration with the registry (default recommendation)

1. Rewrite the devDependency to an **exact pin** `"@deepseek-ai/dsh-llm": "0.1.2-alpha.2"` (or `~0.1.2-alpha.2`); avoid `^`, which floats across the 0.1.x line (§1.3).
2. Commit a lockfile (`package-lock.json` or `pnpm-lock.yaml` — whichever manager the repo standardises on; never mix managers).
3. Run typecheck (`tsc --noEmit`) and reconcile the R-11 drift: e.g. add `@deepseek-ai/dsh-util-values` as a direct dependency for `deepFreeze`/`assertNever`, branch on `RemoteError` codes instead of deleted error classes.
4. Fix the README wording: "npm install gives you the **0.1.2-alpha.2** type baseline" — the declaration and the docs must name the same cohort.

- **Tradeoffs**: real, reproducible install; smallest diff; CI becomes deterministic. Cost: the baseline is alpha.2, so alpha.1-era code may need the small R-11 adjustments.
- **Exit path**: if the plugin genuinely needs an alpha.1-only API surface → Path B (verify-only) or Path C (build the cohort); if the drift is too large to fold in, freeze at the published `0.1.1-rc.2` baseline and treat the alpha.2 move as a separate Mode C migration with the corridor cards.

### Path B · Verify-only alpha.1 type baseline (the dsh-TUI #622 lane, R-01)

1. Keep the install baseline at a **published** cohort (rc.2 or alpha.2, per Path A) — no alpha.1 install exists or is needed.
2. In CI, check out the upstream source tag `dsh-v0.1.2-alpha.1` and run `tsc --noEmit` with the `paths` mapping taken from upstream `tsconfig.base.json`, pointed at the source tree. This proves the **alpha.1 type surface** exactly.
3. Verify runtime separately (a mounted host run), since type-surface proof carries no runtime guarantee.

- **Tradeoffs**: true alpha.1 fidelity for types, zero unpublished installs; but no runtime coverage, needs the git tag + toolchain + network, and is CI-only.
- **Exit path**: if tag `dsh-v0.1.2-alpha.1` cannot be confirmed (**unconfirmed** here), treat the segment as an unsupported gap — derive from exact-tag source/packed declarations (Mode C step 1 discipline) or fall back to Path A/D.

### Path C · Build the missing cohort locally (R-01 recipe, "unpublished-cohort installation")

1. `git clone` upstream, `git checkout dsh-v0.1.2-alpha.1`, `pnpm install && pnpm run build`.
2. `pnpm -r exec pnpm pack --pack-destination ~/.dsh-cohorts/0.1.2-alpha.1` to materialise local tarballs.
3. Pin them with `overrides` + `file:` tarballs while keeping the manifest range as `^0.1.2-alpha.1` (per R-01: the range stays; the overrides decide the actual artifact). Once the cohort ships officially, **deleting the overrides section returns to registry resolution** — that is the exit path.
4. Release hygiene (R-04): add a CI script that materialises the tarball store (cache keyed on the workspace hash) so `--frozen-lockfile` runs work on clean runners; drop the `version` input from pnpm setup so `packageManager` is the single source; keep `NPM_PUBLISH_ENABLED` off while the cohort is unpublished so a version tag can never ship unresolvable ranges (irreversible); publish cohort-adapting plugin releases under a prerelease number on the `alpha` dist-tag.

- **Tradeoffs**: exact cohort fidelity at both type and runtime level; cost: heavyweight, frozen lockfiles record machine-dependent absolute paths, and pnpm override quirks apply — the pnpm 11.9.0 override-bypass report (fix: pin `packageManager: pnpm@11.24.0`) is a **single field report, unconfirmed**; reproduce minimally before adopting.
- **Exit path**: if the tag or build cannot be reproduced, fall back to Path B (types only) or Path A (accept alpha.2).

### Path D · Vendored type declarations (last resort)

1. Check in a minimal `*.d.ts` covering exactly the consumed surface; map it via `paths`/`typeRoots`; runtime stays host-provided (types only).
2. Never re-export cohort-specific exports through plugin code (R-02 discipline: type imports are erased, but re-exports turn drift into build breaks); run **one diagnostic typecheck with `skipLibCheck: false`** if a selector/callback silently becomes `any`, and declare the owning packages directly.

- **Tradeoffs**: zero install, offline-friendly, deterministic. Cost: manual maintenance and drift risk; violations surface late.
- **Exit path**: delete the vendored declarations the moment Path A or C lands.

### Cross-cutting install-channel hygiene (R-08)

- Mirror lag `E404`: force `npm_config_registry=https://registry.npmjs.org` for installs (and pnpm inside profiles).
- pnpm 11 supply-chain rule: per-scope `minimumReleaseAgeExclude: ['@deepseek-ai/*', <plugin name>]` in the workspace/profile `pnpm-workspace.yaml`; regenerate stale lockfiles that pin vanished versions; `minimumReleaseAge: 0` only as a last resort.
- Peer-floor prerelease semantics: if the plugin declares DSH peer ranges, rewrite them to the exact target cohort (e.g. `^0.1.2-alpha.2`); an old floor like `^0.1.0-rc.8` does **not** match `0.1.2-alpha.2` (different tuple + prerelease rule) and produces install-time peer warnings/refusals regardless of real compatibility.

---

## 3. Validation plan (for the execution session that applies a path)

0. **Baseline first (R-06)**: in the repo's own dependency state, record HEAD, working-tree state, lockfile hash, commands and failure fingerprints before any change; pre-existing failures go to a do-not-fix exemption list. (Not collected in this read-only task — installs are prohibited.)
1. **Dependency resolution**: `npm ls @deepseek-ai/dsh-llm` (or `pnpm list --depth 0 | grep @deepseek-ai`) shows one coherent cohort pointing at the pinned version; scan the full lockfile for old/removed packages (e.g. `dsh-client-runtime`) and for any residual `0.1.2-alpha.1` phantom pin.
2. **Static**: `tsc --noEmit` + build green without `@ts-ignore` reliance; if selectors become `any`, one diagnostic run with `skipLibCheck: false` and direct declarations of the owning packages.
3. **Type vs runtime separation**: the type baseline proves declarations only; verify runtime module/service activation on a real host profile in a separate step (out of scope for this read-only report).
4. **Docs/declaration consistency**: the README's baseline claim names exactly the version the lockfile resolves.

---

## 4. Unconfirmed items (cannot be verified in this read-only, offline evaluation)

1. **Live npm registry state** (versions/dist-tags of `@deepseek-ai/dsh-llm` today) — network/probes are prohibited; the "only rc.1/rc.2/alpha.2" premise comes from the task brief + R-01's 2026-08-31 measurement, while R-01's update (alpha.3/alpha.4 under `alpha` as of 2026-09-02) reports a different snapshot. Both are recorded (§1.4).
2. **Existence/buildability of git tag `dsh-v0.1.2-alpha.1`** — needed by Paths B/C; no repo access here.
3. **Which type exports the fixture's plugin actually consumes** — the fixture contains only `package.json` and `README.md`; the R-11 drift impact is therefore conditional.
4. **Exact npm/pnpm error strings** in the failure branches (ETARGET/E404 wording) — derived from semver/registry semantics, not reproduced here.
5. **Package manager choice for this repo** — no lockfile, no `packageManager` field.
6. **pnpm 11.9.0 `overrides` bypass for file: tarballs** (and the pnpm@11.24.0 pin) — single field report in R-01, marked pending confirmation there.
7. **0.1.2 final release status and current dist-tags** — R-01's own "Pending confirmation" says every entry must be re-reviewed after the final release.
8. **Runtime behaviour on a real host** — not attempted (read-only scope).

---

## 5. Skill report structure

- **pre-existing**: not collected (baseline requires an install, which this task prohibits).
- **Completed**: read-only analysis of `package.json`/README; semver derivation of `^0.1.2-alpha.1` (range → `>=0.1.2-alpha.1 <0.2.0` + prerelease tuple rule) with a computed boundary table; the resolution answer (**install succeeds → `0.1.2-alpha.2`**); type-baseline consequence via R-11; four installation paths (A–D) with tradeoffs and exit paths; install-channel hygiene (R-08); validation plan.
- **Skipped**: no install executed (prohibited); no registry/network probe (prohibited); no fixture modification (sealed); no runtime/mount verification (out of scope).
- **Pending / residual risk**: §4 unconfirmed list; caret-range floating without a lockfile; silent cohort substitution (declared alpha.1 → installed alpha.2); R-11 type drift breaking alpha.1-authored code; install-channel pitfalls (R-08); irreversible publish of unresolvable ranges if a release ships while the cohort is unpublished (R-04).
- **Rollback**: not applicable (nothing changed). For a future execution session: revert only the paths owned by the task (`package.json`, lockfile, `overrides`/`paths` entries, README line) against the recorded hashes; never promise rollback of third-party lifecycle-script side effects.
- **Recommendations**: prefer Path A now (exact pin + lockfile + README fix), keep Path B in CI if alpha.1 fidelity matters, keep Path C as the documented fallback when a cohort is unpublished (delete the overrides once published), Path D only as a stopgap; declare the DSH cohort once and exactly; if the plugin is ever published while the cohort is unpublished, gate npm publish (R-04) and ship cohort-adapting releases on the `alpha` dist-tag.

---

## run-stats

- toolcalls total: 13
- token usage: n/a (not visible in this harness)
- completion time: 2026-10-21 14:27 (Asia/Shanghai)


#### FILE: tool-transcript.txt

1. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\SKILL.md
2. glob pattern=**/* path=E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S7-unpublished-cohort (survey task cell)
3. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S7-unpublished-cohort\fixture\package.json
4. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S7-unpublished-cohort\fixture\README.md
5. glob pattern=**/* path=E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade (list skill files)
6. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\rollup-0.1.2.md
7. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\v0.1.3-alpha.1.md
8. run_code inline semver analysis of ^0.1.2-alpha.1 (pure computation, no filesystem/registry access; produced boundary table + maxSatisfying=0.1.2-alpha.2)
9. write E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S7-unpublished-cohort\agent-output\S7-unpublished-cohort\report.md
10. write E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S7-unpublished-cohort\agent-output\report.md (identical copy for discovery)
11. write E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S7-unpublished-cohort\agent-output\tool-transcript.txt
12. write E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S7-unpublished-cohort\agent-output\transcript-manifest.txt
13. send_message agent_id=session-5d3ebe0e-127d-4dc4-a3b9-cb2199b04f8e (self-contained result summary)


#### FILE: transcript-manifest.txt

R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S7-unpublished-cohort
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S7-unpublished-cohort\fixture\package.json
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S7-unpublished-cohort\fixture\README.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\SKILL.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\rollup-0.1.2.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\v0.1.3-alpha.1.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S7-unpublished-cohort\agent-output\S7-unpublished-cohort\report.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S7-unpublished-cohort\agent-output\report.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S7-unpublished-cohort\agent-output\tool-transcript.txt
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S7-unpublished-cohort\agent-output\transcript-manifest.txt


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.