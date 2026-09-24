# S7 · Unpublished Cohort Install Plan (Read-Only Report)

Task: analyze (read-only) the fixture plugin at
E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\tasks\S7-unpublished-cohort\environment\fixture
which declares `"devDependencies": { "@deepseek-ai/dsh-llm": "^0.1.2-alpha.1" }` while its README claims "npm install gives you the type baseline". No install was executed; nothing under the fixture was modified.

## 1. What the declaration actually does (semver analysis)

Registry reality stated by the brief: `@deepseek-ai/dsh-llm` has only `0.1.1-rc.1`, `0.1.1-rc.2`, and `0.1.2-alpha.2` published; `0.1.2-alpha.1` was never published.

### 1.1 Caret range with a prerelease lower bound

`^0.1.2-alpha.1` desugars (node-semver) to:

`>=0.1.2-alpha.1 <0.2.0`

Two rules matter:

1. **Caret on 0.x**: for `0.1.x` the caret allows only changes in the patch position (`>=0.1.2 <0.2.0`), not minor changes as it would for `>=1.0.0`.
2. **Prerelease matching**: node-semver only lets a version with a prerelease tag satisfy a range if some comparator in the range has a prerelease on the **same `[major, minor, patch]` tuple**. Here the lower-bound comparator carries the prerelease on tuple `0.1.2`, so prerelease versions of `0.1.2` are candidates; prerelease versions of any other tuple are not.

### 1.2 Which published versions match

| Version | Tuple | Matches `^0.1.2-alpha.2…`… i.e. `>=0.1.2-alpha.1 <0.2.0`? | Why |
|---|---|---|---|
| `0.1.1-rc.1` | 0.1.1 | **No** | Below the lower bound, and prerelease on a different tuple (0.1.1) can never satisfy the range |
| `0.1.1-rc.2` | 0.1.1 | **No** | Same as above |
| `0.1.2-alpha.2` | 0.1.2 | **Yes** | Same tuple as the prerelease comparator; `alpha.2` sorts **after** `alpha.1` (`2 > 1` on the prerelease identifier list), and it is `<0.2.0` |

Key point that is easy to get wrong: **"alpha.1 was never published" does NOT make install fail.** The range is a range, not a pin. `^0.1.2-alpha.1` requests "at least 0.1.2-alpha.1, below 0.2.0", and `0.1.2-alpha.2` satisfies it. Prerelease identifiers compare numerically when both are numeric, so `alpha.2 > alpha.1`.

### 1.3 Actual install outcome

`npm install` **succeeds** and resolves `@deepseek-ai/dsh-llm` to **`0.1.2-alpha.2`** (npm picks the highest version satisfying the range; no lower-bound version needs to exist for a range to match). So:

- The README's claim "npm install gives you the type baseline" is **operationally true** (install does not break), but the "baseline" silently becomes `0.1.2-alpha.2`, a version the manifest never names.
- The real defect is **declarative drift**, not a broken install: the manifest names a version that has never existed on npm. Anyone reasoning from `package.json` (or a lockfile-free fresh install on a different day) believes the baseline is `alpha.1`.
- **Floating-baseline risk (ongoing)**: because the range is open upward within `0.1.2`, any future publish of `0.1.2-alpha.3`, `0.1.2-beta.1`, or `0.1.2` final would be picked up automatically by lockfile-free installs. Two developers installing on different days, or CI without `npm ci`, can get **different type baselines from the same manifest**.
- If a future publish ever bumped to `0.1.3`+ the caret on `0.x` would exclude it, so drift is bounded within the `0.1.2` line — but that line itself is not frozen.

### 1.4 What "unconfirmed" here

Per the closed-book rules I could not query the npm registry, so the following are **unconfirmed** (taken from the brief's statement of registry reality, not verified live):

- The exact published-version set (`0.1.1-rc.1`, `0.1.1-rc.2`, `0.1.2-alpha.2`) and that `0.1.2-alpha.1` is absent — **unconfirmed, assumed per brief**.
- Whether `0.1.2-alpha.2`'s TypeScript typings are identical to what `alpha.1` would have shipped (i.e., whether the drift is purely nominal or also type-level) — **unconfirmed**; needs a diff once a baseline tarball is in hand.
- Whether other `@deepseek-ai/*` packages have the same cohort problem — **unconfirmed** (fixture has only this one devDependency).
- Whether the consuming project is expected to use a lockfile at all (no lockfile in the fixture) — **unconfirmed**.

## 2. Installation / type-baseline plan

Goal restated: make "npm install gives you the type baseline" a **reproducible, truthful** statement — every install, everywhere, yields one known set of types.

### Path A — Pin the baseline exactly (recommended)

Change the devDependency to an exact, published version:

```json
"devDependencies": { "@deepseek-ai/dsh-llm": "0.1.2-alpha.2" }
```

(`npm install --save-dev --save-exact @deepseek-ai/dsh-llm@0.1.2-alpha.2` when actually executing.)

- **Pros**: the manifest now names a version that exists; the named baseline and the installed baseline are the same thing by construction; immune to future `0.1.2-*` publishes; no lockfile needed for type reproducibility (though still keep one).
- **Cons**: upgrades become manual, deliberate edits (which is what you want for a *type baseline* — types should move consciously, with a compile pass).
- **Exit path**: when `0.1.2` final (or a later line) is published and you adopt it, switch the pin, run `typecheck`, and commit manifest + lockfile together.

### Path B — Keep the caret range, freeze it with a lockfile + `npm ci`

Leave `^0.1.2-alpha.1` but commit `package-lock.json` and require `npm ci` (never bare `npm install`) in CI and contributor docs.

- **Pros**: no manifest change; `npm ci` reproduces `0.1.2-alpha.2` exactly; the caret still auto-picks up fixes within `0.1.2` when the lockfile is refreshed deliberately.
- **Cons**: the manifest keeps naming a nonexistent version (declarative drift persists — confusing for readers and for tools that resolve ranges without the lockfile, e.g. some stacks/code review); bare `npm install` still floats.
- **Exit path**: any CI job that observes a resolved version differing from the locked one fails; from there, either re-lock consciously or migrate to Path A.

### Path C — Correct the range to the real cohort floor

If a floating-within-0.1.2 baseline is acceptable, at least make the manifest name reality:

```json
"devDependencies": { "@deepseek-ai/dsh-llm": "^0.1.2-alpha.2" }
```

- **Pros**: range semantics unchanged (still resolves to `alpha.2` today), but every version named in the file exists; future `0.1.2-*` or `0.1.2` final still flow in.
- **Cons**: baseline still floats within the `0.1.2` line (same day-to-day drift risk as §1.3); needs a lockfile for true reproducibility anyway.
- **Exit path**: combine with Path B's lockfile discipline, or collapse to Path A when stability matters more than auto-upgrades.

### Path D — Offline / vendored tarball baseline (only if the registry is unreachable or the cohort must never move)

`npm pack @deepseek-ai/dsh-llm@0.1.2-alpha.2`, store the tarball in the repo (or an internal artifact store), and reference it by URL/path in devDependencies.

- **Pros**: fully reproducible without registry access; immune to unpublish/deprecation of the alpha.
- **Cons**: repo bloat; manual security/upgrade flow; unusual for consumers — **use only if the other paths are blocked**. (Unconfirmed whether vendoring is acceptable in this repo's policy; check before choosing it.)

### Recommended sequence

1. Path A now (exact pin `0.1.2-alpha.2`) — smallest honest fix, no behavioral risk.
2. Add a lockfile + `npm ci` in CI regardless of path chosen.
3. Add a typecheck step that runs against the installed baseline so "type baseline" is enforced, not just installed.
4. Fix the README only after the manifest names a real version, so the sentence "npm install gives you the type baseline" becomes verifiable by `npm ci && typecheck`.

## 3. Verification plan (when execution is later permitted)

- `npm view @deepseek-ai/dsh-llm versions` to confirm the published cohort (currently unconfirmed).
- `npm install --dry-run` (or `npm ci --dry-run`) to confirm resolution lands on `0.1.2-alpha.2` without mutating `node_modules`.
- `npm ls @deepseek-ai/dsh-llm` after a real install to assert the resolved version.
- `tsc --noEmit` against the baseline to detect any type-level drift between `alpha.2` and what the code assumed of `alpha.1`.

## 4. Summary

`^0.1.2-alpha.1` does **not** fail to install: caret-with-prerelease semantics admit `0.1.2-alpha.2` (same `0.1.2` tuple, sorts above `alpha.1`, below the `<0.2.0` cap), and npm installs it. The bug is a silently floating, never-published named baseline; the fix is an exact pin to `0.1.2-alpha.2` plus lockfile/`npm ci` discipline and a typecheck gate. Registry state and the alpha.2-vs-alpha.1 type delta remain unconfirmed pending live verification.
