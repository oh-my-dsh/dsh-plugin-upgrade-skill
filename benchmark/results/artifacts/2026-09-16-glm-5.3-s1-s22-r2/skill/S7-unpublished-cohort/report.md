# S7 · Unpublished Cohort Install / Type-Baseline Plan (Read-Only Report)

Task: analyze, without modifying anything and without running any install, what `devDependencies: { "@deepseek-ai/dsh-llm": "^0.1.2-alpha.1" }` really does when `0.1.2-alpha.1` was never published, and produce an installation/type-baseline plan.

- Mode: **A · inspect** (plugin-upgrade skill). No file under the fixture was touched; no install, build, or network access was performed.
- Fixture inspected: `fixture/package.json` (name `dsh-cohort-bench`, version `0.1.0`, `private: true`, single devDependency as above) and `fixture/README.md` (repeats the same claim: "npm install gives you the type baseline").
- Skill method: SKILL.md (Mode A) + `references/rollup-0.1.2.md` (R-01 unpublished cohort, R-08 install-channel pitfalls, R-11 type-surface drift ledger, layered validation checklist).
- Baseline (Mode C layer 0): **not collected** — read-only inspection task; no mechanical suite was run.

## 1 · Real consequence of `^0.1.2-alpha.1`

**Install will NOT fail.** npm-semver caret semantics on a 0.x prerelease floor:

- `^0.1.2-alpha.1` desugars to `>=0.1.2-alpha.1 <0.2.0-0` (verified locally with the bundled `semver` package: `validRange` output).
- A prerelease version satisfies a range only if some comparator shares its `[major, minor, patch]` tuple and itself carries a prerelease. So:
  - `0.1.1-rc.1` / `0.1.1-rc.2` — **do not match** (different minor tuple).
  - `0.1.2-alpha.2` — **matches** (same `0.1.2` tuple, higher prerelease). Verified: `satisfies('0.1.2-alpha.2', '^0.1.2-alpha.1') === true`; `maxSatisfying` of the three published versions is `0.1.2-alpha.2`.
- Given the brief's registry reality (only rc.1, rc.2, alpha.2 published), `npm install` / `pnpm install` resolves `@deepseek-ai/dsh-llm` to **`0.1.2-alpha.2`**, silently.

Consequences that follow:

1. **The README is wrong in a subtle way.** "npm install gives you the type baseline" is true only for a *drifting* baseline. You get alpha.2 types, never the declared alpha.1. Because alpha.1 was never published, nobody can reproduce an alpha.1 type baseline via the registry.
2. **Type drift is real on this edge.** Per the R-11 ledger, alpha.1 → alpha.2 moves `deepFreeze` and `assertNever` **out of `@deepseek-ai/dsh-llm`** into `@deepseek-ai/dsh-util-values` (and `JsonValue`-family exports move from `dsh-session`/`dsh-tools` to `dsh-util-values`). Code written and compiling against alpha.1 can fail typecheck against the silently-installed alpha.2 — the failure would look mysterious because the manifest "didn't change". (The `CallId` → `ToolCallId` rename happened rc.2 → alpha.1, so it is *not* hit by this particular silent bump.)
3. **The range is wider than it looks.** `^0.1.2-alpha.1` has upper bound `<0.2.0-0`, not `<0.1.3-0`. Any later 0.1.x line (0.1.3-alpha.x, 0.1.5-alpha.x — corridors that the skill cards record as carrying further breaking type changes) also satisfies it once published, so a plain reinstall can silently jump the baseline again. For a *type baseline*, a caret range on a prerelease is the wrong tool.
4. **Peer-floor interaction (R-08 pitfall 3).** If `dsh-llm@0.1.2-alpha.2` (or its siblings) declare peer floors written as old ranges like `^0.1.0-rc.8`, npm semver's prerelease rule judges them not to match `0.1.2-alpha.2`, producing peer warnings/refusals despite actual host compatibility. Unconfirmed for this exact package version pair (closed-book; not queried).

## 2 · Installation / type-baseline plan

Record first (R-01): missing package/version = `@deepseek-ai/dsh-llm@0.1.2-alpha.1` (unpublished); registry substitutes `0.1.2-alpha.2`. Choose ONE of the paths below; they are ranked.

### Path A (recommended) — accept alpha.2 as the baseline, explicitly

Decide the type baseline is alpha.2 and make the manifest say so honestly.

1. Change the devDependency to an **exact pin** `"@deepseek-ai/dsh-llm": "0.1.2-alpha.2"` (or `^0.1.2-alpha.2` if range semantics are wanted — but the exact pin is what makes "the type baseline" reproducible; see consequence 3 above). Fix the README wording to name the actual version.
2. Apply the alpha.1 → alpha.2 R-11 drift relevant to `dsh-llm`: move `deepFreeze`/`assertNever` imports to `@deepseek-ai/dsh-util-values` (add it as a direct devDependency); re-check any `JsonValue` re-export imports.
3. Install-channel hygiene (R-08): point installs at the official registry (`npm_config_registry=https://registry.npmjs.org`) — mirrors lag fresh `@deepseek-ai/*` publications; if pnpm 11 is used, add `minimumReleaseAgeExclude: ['@deepseek-ai/*', 'dsh-cohort-bench']` rather than disabling the supply-chain rule; if peer warnings appear, rewrite the peer floor to `^0.1.2-alpha.2` and treat the warning's disappearance as the landed signal.
- **Tradeoff**: cheapest, fully registry-resolved, CI-friendly. You never see alpha.1, so any code that genuinely depends on alpha.1-only surface must be migrated now.
- **Exit path**: when the cohort you actually target is fully published, replace the pin with the intended range and delete the exclusions.

### Path B — materialize a real alpha.1 baseline from the git tag (R-01 recipe)

Only if alpha.1 types are genuinely required (e.g. reproducing a bug fixed in alpha.2).

1. In an isolated worktree: `git clone https://github.com/deepseek-ai/deepseek-harness.git`, `git checkout dsh-v0.1.2-alpha.1` (tag name **unconfirmed** — verify it exists before relying on it), `pnpm install && pnpm run build`, then `pnpm -r exec pnpm pack --pack-destination ~/.dsh-cohorts/0.1.2-alpha.1`.
2. In the plugin manifest keep the range as `^0.1.2-alpha.1` and pin via pnpm `overrides` to `file:` tarballs (also override the *whole* `@deepseek-ai/*` cohort the plugin touches — a mixed old/new peer set is not a baseline).
3. CI coupling (R-04): `file:` overrides record machine-dependent absolute paths in the lockfile — add a script that materializes the tarball store on every runner and cache it keyed by the manifest hash.
- **Tradeoff**: exact alpha.1 types and runtime; but heavyweight, lockfile/CI coupling, and the R-01 caveat applies: one field report says pnpm 11.9.0 bypasses `file:` overrides for transitive deps with third-party peers — pin `packageManager: pnpm@11.24.0` after a minimal reproduction (**unconfirmed**, single-source note in the skill).
- **Exit path**: once the needed version is on the registry, delete the `overrides` section and regenerate the lockfile.

### Path C — verify-only lane, no install change (dsh-TUI #622 pattern)

Keep the installable baseline at what the registry offers, and prove the alpha.1 *type surface* in CI without depending on it:

1. Keep `^0.1.2-alpha.1` in the manifest (or pin per Path A for runtime work); CI additionally checks out the upstream `dsh-v0.1.2-alpha.1` tag and runs `tsc --noEmit` with the `paths` mapping from its `tsconfig.base.json` pointing at the source.
- **Tradeoff**: proves the type surface only; runtime compatibility is verified separately. Note this lane was kept by dsh-TUI even after going npm on alpha.2, which suggests pairing it with Path A rather than replacing it.
- **Exit path**: drop the lane when the registry baseline and the target cohort coincide.

### Verification (applicable layers of the skill checklist)

- Dependency resolution: `pnpm list --depth 0 | grep @deepseek-ai` shows a single coherent target version, no mixture; scan the full lockfile for stray old-cohort entries.
- Static: typecheck under the chosen baseline; treat failures new relative to a pre-change baseline as introduced by the switch (R-06 discipline — run the mechanical suite before editing).
- Runtime (if the plugin ships, not just types): cold-boot a real profile and confirm no `pending (waiting for service)` entries; the skill's `verify-runtime.mjs` covers this layer end-to-end.
- Channel: `npm view @deepseek-ai/dsh-llm dist-tags` before installing, to confirm which channel the target version lives on (**unconfirmed here** — no registry access in this task).

## 3 · Unconfirmed / residual risk

- **Registry state is taken from the brief** (closed-book): "only 0.1.1-rc.1, 0.1.1-rc.2, 0.1.2-alpha.2". Not independently queried; the skill's rollup notes later publications (alpha.3+ under the `alpha` dist-tag, 0.1.3/0.1.5 lines), so the *live* max-satisfying version of `^0.1.2-alpha.1` may be higher than alpha.2 today — which strengthens consequence 3 (pin exactly).
- The git tag name `dsh-v0.1.2-alpha.1` and whether an alpha.1 tarball builds cleanly from it: unconfirmed.
- Whether `dsh-llm@0.1.2-alpha.2`'s own peer declarations trigger the R-08 prerelease peer-floor mismatch: unconfirmed.
- pnpm 11.9.0 override-bypass behavior (Path B): single field report, unconfirmed.
- The fixture has no source, lockfile, tests, or CI — so "which alpha.1-only APIs the plugin actually consumes" cannot be determined; Path A's drift-fix list is the ledger's `dsh-llm`-relevant rows only.

## 4 · Rollback baseline (recorded, read-only)

Fixture at benchmark HEAD (`S7-unpublished-cohort/environment/fixture`, files `package.json` + `README.md`, both read; fixture must remain unchanged relative to git HEAD per its README). No files were modified anywhere in the benchmark repository; the only write is this report in the designated output directory. Since no install or migration was performed, there is nothing to roll back.

## 5 · Recommendations

- Adopt Path A now (exact pin `0.1.2-alpha.2` + import fixes + README correction), and add Path C as a CI lane if alpha.1 surface coverage matters.
- Reserve Path B for reproducing alpha.1-specific behavior; never mix it into the default branch's lockfile.
- Fix the README claim to state the actual resolved version, or add a CI gate (`npm ls @deepseek-ai/dsh-llm` asserted against an exact version) so a silent baseline jump cannot recur.
- Never write a caret range on an unpublished prerelease when the manifest's purpose is to define a reproducible type baseline; the caret's 0.x upper bound (`<0.2.0-0`) admits every future 0.1.x line.
