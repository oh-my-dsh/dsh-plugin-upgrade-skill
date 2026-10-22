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

# S7 · Unpublished Cohort Install / Type-Baseline Plan

> Mode: **A · inspect (read-only)** — analysis + plan only. No install was run, no fixture file was modified, nothing was fetched from the network.

## 1. Source identity (recorded, shared read-only prep)

- Fixture files: `package.json`, `README.md` only — no lockfile, no `tsconfig`, no source tree.
- `package.json`: `"name": "dsh-cohort-bench"`, `"version": "0.1.0"`, `"private": true`,
  `devDependencies: { "@deepseek-ai/dsh-llm": "^0.1.2-alpha.1" }`.
- README claim: "npm install gives you the type baseline".
- Declared cohort: `0.1.2-alpha.1` (never published). Registry reality (per brief, matches R-01 "npm reality"):
  only `0.1.1-rc.1`, `0.1.1-rc.2`, `0.1.2-alpha.2` exist for the `@deepseek-ai/*` line.

## 2. Real consequence of the declaration (the semver question)

**Install does NOT fail. It resolves to `0.1.2-alpha.2`.** This is the subtle and important part — the
declaration *looks* broken ("alpha.1 was never published") but the caret range silently admits alpha.2.

Reasoning (node-semver caret + prerelease rules):

1. For a `0.x` version the caret bounds the **minor**: `^0.1.2-alpha.1` expands to
   `>=0.1.2-alpha.1 <0.2.0-0` (a `0.x` caret never crosses the minor boundary; the `-0` upper bound
   is the prerelease form of `0.2.0`).
2. Prerelease matching rule: a prerelease candidate is only admitted when at least one comparator carries a
   prerelease **in the same `[major, minor, patch]` tuple**. The lower-bound comparator
   `>=0.1.2-alpha.1` has tuple `[0,1,2]` with prerelease `alpha.1`; candidate `0.1.2-alpha.2` is in the
   same tuple, and `alpha.2 > alpha.1`. So the candidate is admitted.
3. `0.1.1-rc.1` / `0.1.1-rc.2` are excluded: tuple `[0,1,1]` is below the `>=0.1.2-alpha.1` floor.

So `npm install` picks the highest published version satisfying the range — **`0.1.2-alpha.2`** — and
silently substitutes alpha.2 for the alpha.1 the author named. The hazard is therefore **drift, not breakage**.

Two follow-on drift vectors worth noting:

- If `0.1.2` **stable** ever ships, `^0.1.2-alpha.1` also admits `0.1.2.0` (stable has no prerelease, so
  the prerelease gate does not apply, and `0.1.2 >= 0.1.2-alpha.1`), i.e. the baseline will keep moving.
- alpha.1 → alpha.2 is **not** a no-op: it carries type-surface export drift (R-11 ledger), e.g.
  `deepFreeze` / `assertNever` move from `@deepseek-ai/dsh-llm` to `@deepseek-ai/dsh-util-values`,
  and `JsonValue`/`isJsonValue`/`snapshotJsonValue` move from `@deepseek-ai/dsh-session` to
  `@deepseek-ai/dsh-util-values` (DSH-0.1.2-A2-03). Code written against alpha.1 can therefore fail
  typecheck on alpha.2 (TS2305/TS2614) or silently compile against the shifted surface.

## 3. Installation / type-baseline plan (paths, tradeoffs, exit paths)

### Path 1 — Explicitly adopt alpha.2 (recommended for a pure type baseline)

- Rewrite the range to `^0.1.2-alpha.2` (or `~0.1.2-alpha.2`) so the declared intent matches what npm
  actually installs today. This is the minimum, most honest fix.
- Before installing: `npm view @deepseek-ai/dsh-llm dist-tags` and `npm view @deepseek-ai/dsh-llm versions`
  to confirm the published set, then `npm install --dry-run` (or pnpm equivalent). Sub-packages may lag on
  `latest`; install with an explicit version or the `alpha`/`next` tag (R-01 preamble).
- Channel hygiene (R-08): force the official registry (`npm_config_registry=https://registry.npmjs.org`) to
  avoid mirror-lag E404; under pnpm 11 add a per-scope supply-chain exemption
  `minimumReleaseAgeExclude: ['@deepseek-ai/*', <plugin-name>]` instead of disabling the rule globally.
- **Tradeoff:** the type baseline is alpha.2's surface, not the alpha.1 the manifest named; any alpha.1-only
  surface is gone. For this fixture (no source) that is irrelevant — it only decides which `.d.ts` lands in
  the editor/tsc.
- **Exit:** when 0.1.2 final ships, bump to `^0.1.2` and drop the prerelease tag.

### Path 2 — Exact alpha.1 baseline from the Git tag (R-01 primary recipe)

- The only way to obtain `0.1.2-alpha.1` specifically is to build it: `rc.2 → alpha.1` can only be built
  from a GitHub tag (R-01). Clone `deepseek-ai/deepseek-harness`, checkout `dsh-v0.1.2-alpha.1` in an
  isolated worktree, `pnpm install && pnpm run build`, then `pnpm -r exec pnpm pack --pack-destination <store>`,
  and pin the tarballs via `overrides` while keeping the manifest range `^0.1.2-alpha.1`.
- **Tradeoff:** exact parity, but heavy (builds the whole cohort) and the frozen lockfile records
  machine-dependent absolute paths (R-04); `pnpm@11.9.0` has a reported overrides-bypass for `file:` tarball
  transitive peers → pin `pnpm@11.24.0` (single-field report, **unconfirmed**).
- **Exit:** delete the `overrides` block once the cohort publishes to npm.

### Path 3 — Verify-only, no install (R-01 / dsh-TUI #622)

- Keep the install baseline at `0.1.1-rc.2`; CI checks out the upstream alpha.1 tag and runs
  `tsc --noEmit` with the `paths` mapping from `tsconfig.base.json` pointing at the checked-out source.
  This proves the type surface against alpha.1 without it ever being published; runtime is verified
  separately (dsh-TUI #647 kept this lane even after going npm on alpha.2).
- **Tradeoff:** the type surface is proven but not installed as a devDependency; two baselines to keep in sync.
- **Exit:** move to npm once alpha.2+ (or final) is available.

## 4. Unconfirmed

- Exact registry contents and the actual `npm`/pnpm resolution could not be re-measured in this container
  (no network access, no install allowed per the brief). The "installs `0.1.2-alpha.2`" conclusion is derived
  from node-semver caret + prerelease rules (normative) and is **unconfirmed empirically** until `npm view`
  / a dry-run install is run.
- The `pnpm@11.24.0` overrides pin (Path 2) is a single field report per R-01 and is **unconfirmed**.
- The alpha.1→alpha.2 drift items are taken from the R-11 ledger in the skill; not re-verified against tarballs here.

## 5. Recommendation

Default to **Path 1**: rewrite `^0.1.2-alpha.1` → `^0.1.2-alpha.2` and install from the official registry
with the R-08 channel hygiene. It is the smallest change and simply makes the manifest say what npm already
does. Choose **Path 2 / Path 3** only if the author genuinely needs alpha.1's exact type surface; otherwise
leaving `^0.1.2-alpha.1` as-is is misleading because it silently resolves to alpha.2 (and later to `0.1.2`
stable), moving the "type baseline" the README promises.

## References (key points only, card IDs)

- R-01 (rollup-0.1.2.md): cohort packages not fully published; build-from-tag + `file:` overrides; verify-only
  no-install via tsconfig `paths`; "alpha.1 was never published".
- R-04: lockfile records absolute paths under `file:` overrides; release coupling.
- R-08: mirror lag, pnpm 11 supply-chain `minimumReleaseAgeExclude`, peer-floor prerelease semantics.
- R-11: alpha.1 → alpha.2 type-surface export drift ledger (incl. DSH-0.1.2-A2-03 `dsh-util-values` moves).


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.