# S7 · Unpublished Cohort — Install / Type-Baseline Diagnostic Report

Read-only analysis of `fixture/package.json` and `fixture/README.md` (paths adapted locally to
`E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S7-unpublished-cohort/environment/fixture`).
No install was run; no file under the fixture was modified.

## Evidence in the pack

- `package.json`:
  ```json
  {
    "name": "dsh-cohort-bench",
    "version": "0.1.0",
    "private": true,
    "devDependencies": { "@deepseek-ai/dsh-llm": "^0.1.2-alpha.1" }
  }
  ```
- `README.md`: declares the type baseline `@deepseek-ai/dsh-llm: ^0.1.2-alpha.1` and claims
  *"npm install gives you the type baseline"*; also states npm reality: published versions are
  only `0.1.1-rc.1`, `0.1.1-rc.2`, `0.1.2-alpha.2` — **`0.1.2-alpha.1` was never published**.
  It marks the fixture as test material only (`"private": true`).

No lockfile (`package-lock.json`, `pnpm-lock.yaml`, `npm-shrinkwrap.json`) exists in the fixture —
verified by directory listing; the pack contains only `package.json` and `README.md`.

## 1. Real consequence of the declaration

**Key point: the install will NOT fail.** The caret range is satisfiable by an existing published
version, even though the exact version named in the range was never published.

Semver resolution of `^0.1.2-alpha.1`:

- Caret on `0.1.2` (major `0`, minor `>0`) means `>=0.1.2-alpha.1 <0.2.0`.
- npm prerelease matching rule: a version with a prerelease tag satisfies the range only if at
  least one comparator in the range shares the same `[major, minor, patch]` tuple **and** the
  comparators themselves carry a prerelease. Here the lower bound comparator is
  `>=0.1.2-alpha.1` (prerelease of tuple `0.1.2`), so prereleases of `0.1.2` participate.
- Applying it to the registry reality quoted in the README:
  - `0.1.1-rc.1` / `0.1.1-rc.2` — below `0.1.2-alpha.1`; excluded, and their tuple `0.1.1` differs
    from the comparator's tuple, so they are out in any case.
  - `0.1.2-alpha.2` — same tuple `0.1.2`, prerelease `alpha.2 > alpha.1`, and
    `0.1.2-alpha.2 < 0.2.0`; **satisfies the range**.
  - A future stable `0.1.x` would also satisfy (`>=0.1.2-alpha.1 <0.2.0`), so resolution is not
    frozen on the prerelease line.

Therefore:

- **Installed version: `@deepseek-ai/dsh-llm@0.1.2-alpha.2`** (the only in-range published
  version). `npm install` / `pnpm install` succeeds; npm does not error on "version named in the
  range never published" — it only needs *some* version in the range to exist.
- The README's claim *"npm install gives you the type baseline"* is therefore **misleading but not
  broken**: you get a baseline, but it is **alpha.2, not alpha.1**. Whether that is acceptable
  depends on whether the plugin's types were written against alpha.1 APIs; alpha.2 is a *newer*
  prerelease of the same patch tuple and may add, change, or remove APIs relative to alpha.1.
- **Reproducibility risk (no lockfile in the pack):** the caret range will silently drift. Today
  it resolves to alpha.2; if `0.1.3`, `0.1.5-beta.1`, or any other `>=0.1.2-alpha.1 <0.2.0`
  version is published later, a fresh install picks that instead. Without a lockfile or a pinned
  range, every machine/CI run may get a different type baseline. (Whether any such newer version
  exists *today* beyond the three listed is **unconfirmed** — the version list is taken from the
  README's statement of npm reality, not from a live registry query, which this closed-book brief
  forbids.)

Edge cases worth noting (not applicable to this exact declaration, but they bound the claim
"install never fails"):

- A caret range can hard-fail only when **no** published version falls inside it
  (e.g. `^0.1.2` alone with only `0.1.1-rc.*` published would fail with `ETARGET` /
  "No matching version"). Here alpha.2 saves the install.
- `^0.1.2-alpha.1` does **not** match prereleases of other tuples, so `0.1.3-beta.1` would be
  skipped even if published; a stable `0.1.3` would be preferred by npm (highest non-prerelease
  in range by default resolution ordering).

## 2. Workable installation / type-baseline plans

### Plan A — Accept alpha.2, pin it (lowest friction, recommended first step)

- Change the declaration to `"@deepseek-ai/dsh-llm": "0.1.2-alpha.2"` (exact pin) — or keep the
  caret but **commit a lockfile** so every environment resolves to alpha.2 deterministically.
- Then run typecheck against alpha.2. If it passes, the README claim becomes *almost* true: one
  install, one baseline — but the baseline is alpha.2, so update the README to say which version
  is the actual baseline.
- Tradeoffs: exact pin trades away automatic patch/prerelease updates; lockfile keeps caret
  ergonomics but is package-manager-specific (npm lockfile ≠ pnpm lockfile). Exit path: widen
  back to a caret (e.g. `^0.1.2-alpha.2`) once the API stabilizes.

### Plan B — Target the last published stable/rc line (`0.1.1-rc.2`)

- Declare `"^0.1.1-rc.2"` or pin `"0.1.1-rc.2"`. This is installable today and, being an rc of a
  published line, arguably closer to anything already documented as stable. Caveat: `^0.1.1-rc.2`
  matches `>=0.1.1-rc.2 <0.2.0`; by the prerelease-matching rule it matches `0.1.2-alpha.2` only
  if a comparator shares tuple `0.1.1` — it does, so **`0.1.2-alpha.2` would still be picked**
  (higher version). To actually stay on the rc line, pin exactly `"0.1.1-rc.2"` or use
  `"~0.1.1-rc.2"` (which still admits `0.1.1-rc.3+` but not `0.1.2-*`).
- Tradeoff: you may lose APIs alpha.1/alpha.2 introduced; requires re-checking the plugin's type
  usage. Exit path: bump to the next stable `0.1.x` once published.

### Plan C — Override / alias the dependency (no manifest edit to the baseline intent)

- Keep the declared intent but force resolution with the package manager's override mechanism
  (`overrides` in npm's `package.json`, `pnpm.overrides` in pnpm). E.g.
  `"overrides": { "@deepseek-ai/dsh-llm": "0.1.2-alpha.2" }`.
- Tradeoff: the manifest then carries two sources of truth (devDependency range + override) and
  the override must be removed manually later; pnpm and npm override syntax/behavior differ
  (exact pnpm key nesting is **unconfirmed** here and was not verified against a live toolchain).
- Exit path: delete the override once the devDependency range is corrected.

### Plan D — Fix the declaration to reference reality (the actual root cause)

- The declaration `^0.1.2-alpha.1` names a version that was never published. Whatever baseline
  the plugin was authored against, the honest range is either `^0.1.2-alpha.2` (if authored
  against alpha.2-era APIs) or `0.1.1-rc.2`-based (if against the rc line). Edit the
  devDependency accordingly, regenerate the lockfile, and align the README wording ("npm install
  gives you the type baseline `@deepseek-ai/dsh-llm@0.1.2-alpha.2`").
- This is the only plan that removes the misleading claim rather than papering over it, and it is
  what should land upstream — the fixture itself stays untouched per the brief's read-only rule.

### Not recommended

- `npm install @deepseek-ai/dsh-llm@0.1.2-alpha.1` (exact install of the ghost version): will
  fail with `404 Not Found / ETARGET` because alpha.1 does not exist on the registry. Any plan
  premised on "install alpha.1" is not workable.
- Vendoring/type-stubbing the package locally: heavier maintenance, diverges from the registry,
  and cannot be validated in this read-only exercise.

## 3. Unconfirmed items

- **Live registry state**: the set of published versions (`0.1.1-rc.1`, `0.1.1-rc.2`,
  `0.1.2-alpha.2`) is taken from the fixture README's statement of npm reality; no network query
  was made (closed-book brief). Any newer in-range version published after that statement is
  unconfirmed and would change Plan A's "resolves to alpha.2" conclusion for fresh installs.
- **API compatibility between alpha.1 and alpha.2** (whether typechecking against alpha.2
  succeeds where the code expected alpha.1): unverifiable without installing alpha.2, which the
  brief forbids.
- **Exact pnpm `overrides` semantics for prerelease resolutions** in Plan C: not verified
  against the actual package-manager version.
- **Package-manager choice** (npm vs pnpm) for this plugin: the pack contains no lockfile and no
  `packageManager` field, so the intended manager is unconfirmed; lockfile advice in Plan A
  should follow whichever manager is actually used.
