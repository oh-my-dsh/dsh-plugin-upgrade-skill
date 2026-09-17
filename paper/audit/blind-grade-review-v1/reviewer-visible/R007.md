# S7 · Unpublished Cohort Install Plan (Read-Only Diagnostic Report)

Task: `dsh-cohort-bench` fixture declares `devDependencies: { "@deepseek-ai/dsh-llm": "^0.1.2-alpha.1" }` while its README claims "npm install gives you the type baseline". Registry reality (per the skill's rollup evidence and the brief): npm carries only `0.1.1-rc.1`, `0.1.1-rc.2`, and `0.1.2-alpha.2` for the `@deepseek-ai/*` cohort line in this window — **`0.1.2-alpha.1` was never published**.

Mode: A · inspect (read-only). No file under the fixture was modified; no install was run. Findings below cite the fixture files and the `dsh-plugin-upgrade` skill references (rollup-0.1.2.md, v0.1.2-alpha.2.md).

---

## 1. Real consequence of the declaration

### 1.1 Semver semantics of `^0.1.2-alpha.1`

- The caret range `^0.1.2-alpha.1` means `>=0.1.2-alpha.1 <0.2.0`.
- npm's prerelease matching rule: a prerelease version only satisfies a range if **at least one comparator has the same [major, minor, patch] tuple and carries a prerelease**. Here the only comparator tuple with a prerelease is `0.1.2`, so the range can only ever match `0.1.2-*` prereleases. `0.1.1-rc.1` / `0.1.1-rc.2` (different minor tuple `0.1.1`, and lower) are excluded.
- Inside tuple `0.1.2`, the published versions are only `0.1.2-alpha.2` (per the brief; rollup-0.1.2.md R-01 "npm reality (2026-08-31)" confirms: "the `@deepseek-ai/dsh-*` packages only have `0.1.1-rc.1`, `0.1.1-rc.2`, and `0.1.2-alpha.2`; alpha.1 was never published"). Prerelease identifier ordering puts `alpha.2 > alpha.1`, so it qualifies.

### 1.2 Will install actually fail?

**No.** A plain `npm install` / `pnpm install` in the fixture directory would **succeed**, resolving `@deepseek-ai/dsh-llm@0.1.2-alpha.2` — the sole published version inside the range. The missing `0.1.2-alpha.1` never causes a resolution failure because npm never needs to hit the exact declared version; it evaluates the range against the registry metadata.

Caveats that can still make the install fail or go unclean (rollup-0.1.2.md R-08, "the three install-channel pitfalls"):

1. **Mirror lag** — third-party mirrors (e.g. npmmirror) lag fresh `@deepseek-ai/*` publications by hours; E404/ETARGET is possible. Remedy: `npm_config_registry=https://registry.npmjs.org`.
2. **pnpm 11 `minimumReleaseAge`** (24h supply-chain rule) can refuse a fresh alpha.2. Remedy: per-scope `minimumReleaseAgeExclude: ['@deepseek-ai/*']` rather than disabling globally.
3. **Peer-floor prerelease semantics** — if any peer floor in the graph is written as an old range like `^0.1.0-rc.8`, npm semver judges it **not to match** `0.1.2-alpha.2` (comparator tuple mismatch), producing install-time peer warnings/refusals. Remedy: rewrite the floor to `^0.1.2-alpha.2`.

### 1.3 The real problem: silent version drift, not install failure

The fixture's README claim, "npm install gives you the type baseline", is **misleading in a specific way**: you do not get the declared `alpha.1` type baseline — you silently get `alpha.2`. Consequences:

- The lockfile/resolved tree records `0.1.2-alpha.2`, while the author's declared intent (`alpha.1`) was never on the registry, so the "baseline" was aspirational from day one.
- `alpha.1 → alpha.2` is a real corridor edge with plugin-facing cards (references/v0.1.2-alpha.2.md): e.g. **DSH-0.1.2-A2-01** (restores `SessionEvent.ignorable`), **DSH-0.1.2-A2-02** (`RemoteResult.error` becomes a `RemoteError` instance, `isRemoteFailure` added, `RpcError`/`RemoteStreamError`/`TypertRemoteFailure` removed — this changes the `dsh-api-gateway`/`dsh-typert-protocol` type surface), **DSH-0.1.2-A2-03** (npm packages trim unneeded peer dependencies — a direct-consumer impact on exactly the kind of type-package devDependency this fixture has), **DSH-0.1.2-A2-08** (`sessionProjections` becomes a required inject/peer), **DSH-0.1.2-A2-10** (`dsh-settings` drops the runtime `settingsNamespace` export). Code written against the *intended* alpha.1 surface may typecheck differently or fail against what actually installed.
- A subtle type-only trap (v0.1.2-alpha.2.md field note): with `skipLibCheck: true`, a missing declaration package does not surface at the dependency declaration — selectors/callbacks silently become implicit `any`. One diagnostic typecheck with `skipLibCheck: false` reveals the true declaration owners.
- The fixture itself is `"private": true` (package.json) and labeled "Test material only — do not execute or publish" (README.md) — so this analysis stays read-only; nothing here should be published or installed.

---

## 2. Workable installation / type-baseline plans

### Path A · Accept registry reality: pin the devDependency to `0.1.2-alpha.2` (recommended when alpha.2 is the true target)

- Change `devDependencies` to `"@deepseek-ai/dsh-llm": "^0.1.2-alpha.2"` (or pin exactly `0.1.2-alpha.2`), regenerate the lockfile, install from the official registry.
- **Why**: honest declaration, cleanest resolution, the version actually exists. Also removes the alpha.2's trimmed-peer surprises from hiding (A2-03) — declare type packages the source actually imports as direct devDependencies.
- **Tradeoffs / exit paths**: mutates `package.json` (here forbidden — the fixture must remain unchanged, so this is a plan for the real repo). If a later final release ships, the caret range picks it up; if you must stay frozen, pin exact. Verify with `pnpm list --depth 0 | grep @deepseek-ai` and `npm view @deepseek-ai/dsh-llm dist-tags` (R-08 verification). Requires running the alpha.1→alpha.2 corridor cards against the source (A2-01/02/08/10 at minimum).

### Path B · Build the unpublished `alpha.1` from the official tag and pin via `file:` tarballs (R-01 recipe, when alpha.1 itself is mandatory)

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git /tmp/dsh-build
cd /tmp/dsh-build && git checkout dsh-v0.1.2-alpha.1
pnpm install && pnpm run build
mkdir -p ~/.dsh-cohorts/0.1.2-alpha.1
pnpm -r exec pnpm pack --pack-destination ~/.dsh-cohorts/0.1.2-alpha.1
```

Then pin with `overrides`: `"@deepseek-ai/dsh-llm": "file:~/.dsh-cohorts/0.1.2-alpha.1/<packed>.tgz"`, keeping the range written as `^0.1.2-alpha.1`.

- **Why**: reproduces the exact declared baseline; the declared range becomes truthful.
- **Tradeoffs**: heavy (full workspace build), machine-dependent absolute paths leak into the lockfile (breaks `--frozen-lockfile` CI — R-04; needs a tarball-store materialization step + actions cache), and the pnpm 11 overrides/file:-tarball bypass issue is **pending confirmation** (rollup says `11.9.0` may bypass overrides for file: transitive deps with third-party peers; pin `packageManager: pnpm@11.24.0` after a minimal repro).
- **Exit path**: "once the final release ships, deleting the overrides section returns to registry resolution" (R-01).

### Path C · Verify-only type baseline, no install at all (cheapest; matches this fixture's "do not install" constraint)

Per R-01's "Verify-only, no install" note (dsh-TUI #622): keep the install baseline where it is (or absent), check out the upstream `dsh-v0.1.2-alpha.1` tag, and run `tsc --noEmit` with a `paths` mapping (from its `tsconfig.base.json`) pointing at the checked-out source. This proves the type surface without touching npm. Runtime is verified separately (#647 kept this lane even after moving to npm on alpha.2).

- **Why**: zero registry dependency; works even while alpha.1 is unpublished; ideal for CI.
- **Tradeoffs**: proves types only, not runtime module activation; the paths mapping must be maintained. This is the only path executable **today** under the fixture's read-only/no-install constraint, and even it requires cloning the upstream repo, which this closed-book environment does not provide — so it is recorded as the plan, not executed.

### Path D · Retarget forward to a published cohort (`0.1.2-alpha.4` / `0.1.2-rc.1` under the `alpha`/`next` dist-tags)

Rollup notes `0.1.2-alpha.3`–`alpha.4` are published under the `alpha` dist-tag and `next` = `0.1.2-rc.1` (re-measured 2026-09-07); sub-packages' `latest` still lags, so install with an **explicit version or dist-tag**, never bare. Walk the corridor cards alpha.1→…→rc.1 (rollup §"Read the full corridor first") instead of jumping blindly.

- **Why**: gets onto maintained, published versions with one coherent cohort.
- **Tradeoffs**: largest change surface; requires the full card walk and the R-08 channel safeguards (official registry, `minimumReleaseAgeExclude`, peer-floor rewrite to the target range).

**Recommended sequencing**: C now (prove the type surface read-only) → A if alpha.2 is acceptable as the baseline → B only if alpha.1 exactly is contractually required → D when ready to leave the alpha line.

---

## 3. Unconfirmed items

- **Live registry state**: this closed-book, no-network run cannot query npm directly. Version availability (`0.1.1-rc.1/rc.2`, `0.1.2-alpha.2` only; alpha.1 unpublished; alpha.3/alpha.4/rc.1 later additions) is taken from the brief and rollup-0.1.2.md's dated measurements (2026-08-31, 2026-09-02, 2026-09-07) — current registry state is **unconfirmed**; run `npm view @deepseek-ai/dsh-llm versions` / `npm view @deepseek-ai/dsh dist-tags` before executing any path.
- **Exact resolution of `^0.1.2-alpha.1` against today's registry** (whether anything newer than alpha.2 in tuple `0.1.2` exists and would be preferred) — unconfirmed for the same reason. The range analysis itself (tuple-locked prerelease matching) is semver fact, not dependent on registry state.
- **The pnpm 11 overrides/file:-tarball bypass** (`11.9.0` vs `11.24.0`) in Path B — explicitly marked "pending confirmation" in rollup-0.1.2.md; requires a minimal reproduction in the target repository.
- **Whether the fixture's source code actually consumes any alpha.1→alpha.2-changed API** (A2-02 error types, A2-10 settings export, etc.): the fixture contains only `package.json` and `README.md` — no source to scan — so the drift impact is potential, not demonstrated.
- **`@deepseek-ai/dsh-llm`'s own dependency/peer floors at alpha.2** (whether R-08's peer-floor rewrite applies to it specifically) — not inspectable offline.

---

## Report metadata

- Mode: A · inspect (read-only). Files read: `fixture/package.json`, `fixture/README.md`; skill references `SKILL.md`, `references/rollup-0.1.2.md`, `references/v0.1.2-alpha.2.md`.
- Fixture unchanged; no install, build, clone, or network access performed.
- Pre-existing baseline (Mode C requirement): not collected — read-only inspection, no commands run.
- Rollback: n/a — no writes made.
