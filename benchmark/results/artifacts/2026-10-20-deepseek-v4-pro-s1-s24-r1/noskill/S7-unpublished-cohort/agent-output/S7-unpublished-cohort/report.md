# S7 · Unpublished Cohort — Installation / Type-Baseline Plan (Read-Only Analysis)

Scope: `@deepseek-ai/dsh-llm: ^0.1.2-alpha.1` declared as a devDependency in a
`private: true` package; README claims "npm install gives you the type baseline".
Registry reality (per the task brief): only `0.1.1-rc.1`, `0.1.1-rc.2`,
`0.1.2-alpha.2` are published — **0.1.2-alpha.1 was never published**.

## 1. Real consequence of the declaration

**Will `npm install` fail? No.** It resolves cleanly and installs
**`0.1.2-alpha.2`** — a *newer* prerelease than the one named.

Semver reasoning (node-semver / semver-spec semantics):

- The caret range `^0.1.2-alpha.1` desugars to
  `>=0.1.2-alpha.1 <0.2.0-0`. The lower bound is a **range**, not a pin, so it
  does not require `0.1.2-alpha.1` to actually exist.
- `0.1.2-alpha.2` satisfies the lower bound because prerelease identifiers
  compare numerically: `alpha.1 < alpha.2`, so `0.1.2-alpha.2 >= 0.1.2-alpha.1`.
  It satisfies the upper bound because `0.1.2 < 0.2.0`.
- The prerelease-gating rule permits this: a prerelease version is only allowed
  to match a range if at least one comparator carries a prerelease on the *same*
  `[major, minor, patch]` tuple. The comparator `>=0.1.2-alpha.1` has tuple
  `0.1.2` with a prerelease, so `0.1.2-alpha.2` (same tuple) is permitted.
- `0.1.1-rc.1` / `0.1.1-rc.2` are **excluded** — they are below the
  `0.1.2` lower bound, so the caret range never reaches back to them.
- `^0.1.2-...` on a `0.x` version locks the minor: the range is effectively
  `<0.2.0`, so it will **never** auto-upgrade to `0.2.x`.

Net effect: npm's resolver picks the highest version satisfying the range, which
is **`0.1.2-alpha.2`**. No ETARGET/notarget error, no warning, no special
handling of the "skipped" alpha.1 — npm only sees the range.

**Contrast (where failure *would* occur):**

- An **exact pin** `"0.1.2-alpha.1"` (no caret) → `npm install` fails with
  `ETARGET` / "No matching version found for @deepseek-ai/dsh-llm@0.1.2-alpha.1".
- The same caret range with **only** the `0.1.1-rc.x` versions published (no
  `0.1.2-alpha.x`) → fails, because the lower bound excludes them all.

**The real risk is silent drift, not failure:** the maintainer references a
version that never shipped, so "the type baseline" the README promises is
actually sourced from `0.1.2-alpha.2`, whose API/type surface may differ from
whatever an (intended but never-published) alpha.1 would have been. Nothing
flags this; types just come from alpha.2. Additionally, because this fixture has
no lockfile, the first real `npm install` would resolve and record alpha.2 in a
fresh `package-lock.json`.

## 2. Installation / type-baseline plan (paths, tradeoffs, exit paths)

Common pre-step for every path: run `npm view @deepseek-ai/dsh-llm versions` /
`npm view @deepseek-ai/dsh-llm dist-tags` against the real registry to confirm
the currently published set (the brief's list is the working assumption here and
is marked unconfirmed below), then decide.

### Path A — Align the caret to a published prerelease (recommended, minimal change)
Change the declaration to `"@deepseek-ai/dsh-llm": "^0.1.2-alpha.2"`.
- **Why:** matches reality, removes the reference to a nonexistent version, keeps
  the intended "latest 0.1.2 prerelease" semantics, and stays on the 0.1.2 line.
- **Tradeoff:** still on an alpha channel; keeps automatic patch-level movement
  within the 0.1.2 prerelease line (currently just alpha.2).
- **Exit path:** if types diverge from expectations, drop the caret and pin exact
  (Path B); if a stable release appears, move to Path C.

### Path B — Exact pin for a reproducible type baseline
Change to `"@deepseek-ai/dsh-llm": "0.1.2-alpha.2"`.
- **Why:** fully deterministic build/type baseline; lockfile then mirrors the pin.
- **Tradeoff:** no auto-updates; every upgrade is a manual bump + type check.
- **Exit path:** relax back to a caret (Path A) once the API stabilizes or a
  stable `0.1.2`/`0.2.x` is published.

### Path C — Move to a stable release when one exists (preferred long-term)
If `0.1.2` (stable) or `0.2.x` is published, set `"^0.1.2"` or `"^0.2.0"`
respectively.
- **Why:** leaves prerelease volatility; stable semantic versioning applies.
- **Tradeoff:** may introduce breaking changes; requires re-verifying the plugin's
  compile/type surface against the new baseline.
- **Exit path:** revert to the last known-good alpha/rc pin if the upgrade breaks
  types; bisect versions via the lockfile.
- **Status:** existence/timing of a stable release is **unconfirmed** (no registry
  access in this cell).

### Path D — Pin to a published RC as the baseline
Set `"@deepseek-ai/dsh-llm": "0.1.1-rc.2"` (exact) or `"^0.1.1-rc.2"`.
- **Why:** `0.1.1-rc.2` is a published version with a "release candidate"
  expectation; avoids the skipped-alpha ambiguity entirely.
- **Tradeoff:** an explicit **downgrade** below the 0.1.2 alpha line the
  maintainer aimed at; the `^0.1.2-alpha.1` range would never have selected it.
  The 0.1.1 types may lag the 0.1.2 alpha surface.
- **Exit path:** move up to Path A/C once the target line is confidently
  published.

### Path E — Drop the devDependency / vendor types
Remove `@deepseek-ai/dsh-llm` from `devDependencies` and either vendor the
needed `.d.ts` or depend on a different, published type source.
- **Why:** decouples the build from an unreliable prerelease channel.
- **Tradeoff:** loses the canonical baseline; vendoring requires maintenance.
- **Exit path:** re-add as a devDependency under Path A/C once the channel is
  stable.

**Do-not-do:** keeping `^0.1.2-alpha.1` verbatim. It works today only because
alpha.2 happens to exist and be greater; it encodes a version that never existed,
which is misleading for humans and brittle for any future tooling that checks
published versions.

## 3. Unconfirmed items

- **Registry contents** (`0.1.1-rc.1`, `0.1.1-rc.2`, `0.1.2-alpha.2` being
  the complete published set): taken from the task brief; **not independently
  verified** — no network access is permitted in this cell.
- **Whether `0.1.2-alpha.2`'s type/API surface matches the intended (never
  published) alpha.1:** unverifiable, since alpha.1 never existed.
- **Existence/timing of a stable `0.1.2` or `0.2.x` release:** unconfirmed.
- **Exact resolver behavior** was reasoned from node-semver / semver-spec
  semantics rather than executed (`npm install` is prohibited here), so the
  in-container execution is not empirically reproduced.

*This report is read-only analysis; the fixture was not modified, no install was
run, and no network or out-of-scope path was accessed.*
