# S7 · Unpublished Cohort Install Plan (Read-Only Report)

Task: analyze, read-only, the consequence of `devDependencies: { "@deepseek-ai/dsh-llm": "^0.1.2-alpha.1" }` in a plugin whose README claims "npm install gives you the type baseline", given that `@deepseek-ai/*` on npm has only `0.1.1-rc.1`, `0.1.1-rc.2`, and `0.1.2-alpha.2` — alpha.1 was never published.

Mode: **A · inspect** (plugin-upgrade skill). No file under the fixture was read-written, no install was run, no build environment created. The only writes were this report file in the designated output directory.

Fixture evidence (E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\tasks\S7-unpublished-cohort\environment\fixture):

- package.json: name `dsh-cohort-bench`, version `0.1.0`, `"private": true`, single devDependency `@deepseek-ai/dsh-llm: ^0.1.2-alpha.1`.
- README.md: restates the "npm install gives you the type baseline" claim and the npm reality; test material only.
- No source files, lockfile, tsconfig, or CI configuration exist in the fixture — only the manifest and README.

## 1. Real consequence of the declaration (semver analysis)

**Install will NOT fail. It will silently install `0.1.2-alpha.2`, not alpha.1.**

npm (node-semver) rules at work:

1. Range expansion: `^0.1.2-alpha.1` (caret over 0.x with left-most non-zero digit at the minor position) means `>=0.1.2-alpha.1 <0.2.0`.
2. Prerelease gating: a version WITH a prerelease tag satisfies a range only if at least one comparator in the range shares its `[major, minor, patch]` tuple AND itself carries a prerelease. Applying that to the three published versions:
   - `0.1.1-rc.1` / `0.1.1-rc.2`: tuple 0.1.1 ≠ 0.1.2 — **rejected** (also below the floor).
   - `0.1.2-alpha.2`: tuple 0.1.2 matches the comparator's tuple, both carry prereleases, and `alpha.2` orders after `alpha.1` — **accepted**.
3. Dist-tags are irrelevant to range resolution. `0.1.2-alpha.2` sitting on the `alpha` dist-tag (with `latest` on older versions for `@deepseek-ai/dsh-*` sub-packages) does not prevent a range from resolving to it; dist-tags only matter for bare `npm install pkg` / `npm install pkg@alpha` installs.

So `npm install` (and `pnpm install`) succeed and resolve `@deepseek-ai/dsh-llm` to exactly `0.1.2-alpha.2`.

The failure is therefore not mechanical but **semantic**: the README's "npm install gives you the type baseline" is false in the load-bearing direction —

- The intended baseline (alpha.1) is unobtainable from the registry; it exists only as the Git tag `dsh-v0.1.2-alpha.1` (per the skill's rollup R-01 npm-reality note, measured 2026-08-31).
- The de-facto baseline (alpha.2) is one corridor edge ahead of the declared intent, and the alpha.1→alpha.2 edge carries real type-surface drift (R-11 ledger): `JsonValue`/`isJsonValue`/`snapshotJsonValue`, `deepFreeze`, `assertNever` move to the new `@deepseek-ai/dsh-util-values` package; `collectSessionTitleMessages` leaves the public surface; `settingsNamespace()`/`installSettingsSection()` are deleted from `dsh-settings`; the `dsh-agent-presets` error classes and `LlmModelDiscoveryError` are replaced by `RemoteError` code unions. Code written against alpha.1 types can fail typecheck in bulk (TS2305) against the actually-installed alpha.2 — a "clean install, red typecheck" situation that looks like a bug but is a baseline mismatch.
- The range is also **floating**: any future publish inside `>=0.1.2 <0.2.0` that satisfies the prerelease gate (e.g. `0.1.2-alpha.3`, `0.1.2` final, `0.1.3`) silently moves the "baseline" again on the next clean install/lockfile regen. A type baseline declared with a caret prerelease range is not a baseline.

Secondary install-channel caveats that apply the moment you actually install alpha.2 (rollup R-08), even though the version exists:

- Third-party mirrors may lag the `@deepseek-ai/*` alpha publications (E404/ETARGET) — use `npm_config_registry=https://registry.npmjs.org`.
- pnpm 11's default `minimumReleaseAge` (24 h supply-chain rule) refuses day-old alphas — add `minimumReleaseAgeExclude: ['@deepseek-ai/*']` per scope rather than disabling it globally.
- If any peer floor is written as an old range like `^0.1.0-rc.8`, npm's prerelease comparator rules judge it NOT to match `0.1.2-alpha.2` (different tuple), producing peer warnings regardless of real compatibility — rewrite the floor explicitly.

## 2. Installation / type-baseline plan (paths, tradeoffs, exits)

Notation: the *declared* baseline is alpha.1; the *registry-obtainable* baseline is alpha.2. Pick one path per purpose (local dev vs CI proof vs future-proofing); they can be combined.

### Path A — Accept the registry reality: pin the baseline to alpha.2 explicitly

Change the devDependency to an exact pin `"0.1.2-alpha.2"` (or `"~0.1.2-alpha.2"` if you want alpha.2-line patches only), regenerate the lockfile, and migrate the plugin's type usage across the alpha.1→alpha.2 edge using the R-11 ledger (add `@deepseek-ai/dsh-util-values` as a direct dependency where needed).

- Pros: zero extra infrastructure; registry-resolved; lockfile records the truth; CI works anywhere.
- Cons: you no longer test against the version you originally wrote for; requires a (small, carded) source migration.
- Exit path: when the corridor stabilizes, relax the pin back to a caret range; nothing to undo beyond the manifest line.

### Path B — Get a true alpha.1 baseline by building from the Git tag (R-01 recipe)

The unpublished version is still reachable as a source tag. In an isolated worktree (never inside this evaluation container; the brief forbids creating build environments here — this is the recipe to hand to the maintainer):

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git /tmp/dsh-build
cd /tmp/dsh-build && git checkout dsh-v0.1.2-alpha.1
pnpm install && pnpm run build
mkdir -p ~/.dsh-cohorts/0.1.2-alpha.1
pnpm -r exec pnpm pack --pack-destination ~/.dsh-cohorts/0.1.2-alpha.1
```

Then consume the tarballs via pnpm `overrides` with the range kept as `^0.1.2-alpha.1`.

- Pros: authentic alpha.1 type surface; validates the originally declared intent.
- Cons: machine-local tarball store; frozen lockfiles record machine-dependent absolute paths, so every CI runner must materialize the store (cache keyed on the manifest hash); publishing the plugin in this state ships unresolvable `@deepseek-ai/*` ranges — gate npm publish behind a switch until the cohort ships.
- Known pitfall (single field report, unconfirmed): pnpm 11.9.0 allegedly bypasses overrides for `file:` transitive tarballs when third-party peers are present; pinning `packageManager: pnpm@11.24.0` was reported to fix it. Reproduce minimally before relying on it.
- Exit path: delete the `overrides` section once alpha.1-equivalent versions are registry-resolvable — in practice they never will be (alpha.1 is a historical, permanently unpublished version), so the realistic exit is Path A or D.

### Path C — Verify-only, no install: keep the install baseline elsewhere, prove the type surface in CI (dsh-TUI #622 pattern)

Keep the manifest exactly as-is (or on rc.2 for runtime) and add a CI lane that checks out the upstream `dsh-v0.1.2-alpha.1` tag and runs `tsc --noEmit` with `paths` mappings from the tag's `tsconfig.base.json` pointing at the tag's source. This proves the alpha.1 type contract without ever installing the cohort; runtime compatibility is verified separately.

- Pros: zero registry dependence; the declaration drift never reaches node_modules; cheapest honest signal for "does my code typecheck against alpha.1".
- Cons: type-plane only — proves nothing about runtime/wire behavior; requires the upstream repo checkout in CI; the local `npm install` claim in the README still resolves to alpha.2, so the README must be corrected regardless.
- Exit path: once the target cohort is published (Path D), drop the lane or repoint it at the registry version.

### Path D — Move forward to a published newer cohort

Per the rollup's re-measurement, `0.1.2-alpha.3`/`0.1.2-alpha.4` are published under the `alpha` dist-tag (and later lines exist). Jumping the declaration to `^0.1.2-alpha.4` folds the alpha.1→alpha.2→alpha.3→alpha.4 corridor into its net state before touching source (alpha.2→alpha.3 has zero cards; alpha.3→alpha.4 has six, including the `report`→`send_message` tool change and the `Session.events` API removal).

- Pros: registry-resolvable, current, and where the corridor is heading; one migration instead of two.
- Cons: the largest source delta from the original intent; must read the full corridor first.
- Exit path: this is the terminal path; no fallback needed beyond Git.

### Recommended combination

Adopt **Path A now** (unblock `npm install` honestly, fix the README claim), and add the **Path C CI lane** if proving alpha.1-specific compatibility is a real requirement (e.g. you support users pinned to alpha.1 hosts built from tag). Use Path B only if a user-facing artifact must genuinely link against alpha.1. Schedule Path D as the follow-up migration.

## 3. Unconfirmed items

- **Current npm state**: closed-book brief — the version list (rc.1 / rc.2 / alpha.2 only) is taken from the task statement and the fixture README, cross-checked against the skill reference's 2026-08-31/09-02 measurements. I did not query the registry (no network use permitted); today's actual dist-tags and any newly published versions are unconfirmed.
- **Why alpha.1 was never published / whether it ever will be**: historical registry behavior, not verifiable from the fixture. Treated as permanently unavailable; Path B's exit path assumes it stays that way.
- **Which R-11 drift items actually bite this plugin**: the fixture contains no source, tsconfig, or imports, so the set of affected type usages cannot be enumerated; only the general alpha.1→alpha.2 exposure can be stated.
- **pnpm version sensitivity in Path B** (11.9.0 vs 11.24.0 override behavior): single field report, not reproduced (the skill itself carries it under "Pending confirmation").
- **Lockfile/CI specifics**: no lockfile or CI config exists in the fixture, so Path A/B/C impact on the actual build pipeline is unconfirmed.

## Validation and reporting (skill structure)

- **Pre-existing baseline**: not collected — Mode A read-only inspection; no build, test, or install was run.
- **Completed**: read the fixture manifest and README; semver consequence analysis (caret-over-prerelease expansion, tuple-gated prerelease matching, dist-tag irrelevance); four-path install/type-baseline plan with tradeoffs and exits; corridor references identified (rollup R-01, R-08, R-11; v0.1.2-alpha.2 card set).
- **Skipped**: any file write under the fixture (forbidden); registry queries (closed-book); building an alpha.1 reproduction environment (forbidden by the brief); running installs (forbidden).
- **Pending/residual risk**: the floating-caret problem persists until the declaration is pinned; if the plugin is published while the range still resolves to an unpublished-in-spirit baseline, consumers inherit the same silent alpha.2 resolution.
- **Rollback**: nothing to roll back — no configuration, dependency, or source was modified. The fixture is byte-identical to its pre-inspection state.
- **Recommendations**: (1) replace the README sentence with "npm install resolves `^0.1.2-alpha.1` to `0.1.2-alpha.2` — the alpha.1 type baseline is only available from the Git tag"; (2) pin the devDependency or adopt the CI verify-only lane; (3) plan the forward migration to a published cohort via the corridor cards rather than hand-rolling diffs.
