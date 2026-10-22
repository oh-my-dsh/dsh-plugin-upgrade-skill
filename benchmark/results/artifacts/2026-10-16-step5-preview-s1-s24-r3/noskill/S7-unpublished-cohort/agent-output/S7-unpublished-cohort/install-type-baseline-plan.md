# S7 · Install / Type-Baseline Plan — `@deepseek-ai/dsh-llm@^0.1.2-alpha.1`

**Scope:** read-only analysis of `fixture/`. No file under `fixture/` was modified; no `npm install` was executed; no network/registry access was attempted (offline container). This report is written to `agent-output/S7-unpublished-cohort/install-type-baseline-plan.md`.

---

## 1. Evidence examined (fixture, read-only)

| File | Relevant content |
|---|---|
| `fixture/package.json` | `"name": "dsh-cohort-bench"`, `"version": "0.1.0"`, `"private": true`, `devDependencies: { "@deepseek-ai/dsh-llm": "^0.1.2-alpha.1" }`. No lockfile, no other config, no source files. |
| `fixture/README.md` | Claims "npm install gives you the type baseline"; states that npm only has `0.1.1-rc.1`, `0.1.1-rc.2`, `0.1.2-alpha.2` and that `0.1.2-alpha.1` was never published. |

The registry state is **taken as given** by the task brief; it could not be re-verified from inside the container (offline, and repository/benchmark paths are outside the allowed read scope, so no in-repo guidance was consulted either). Anything depending on it is marked **unconfirmed** in §6.

## 2. Consequence analysis (the core answer)

### 2.1 What `^0.1.2-alpha.1` actually means

npm / yarn / pnpm all use node-semver-compatible range semantics:

- **Caret (`^`)** = "compatible with": permits changes that do not modify the left-most *non-zero* digit. For a `0.1.x` version the left-most non-zero digit is the **minor**, so:

  ```
  ^0.1.2-alpha.1  ==  >=0.1.2-alpha.1 <0.2.0-0
  ```

  (The `-0` on the upper bound only excludes `0.2.0` *prereleases*; nothing near `0.2.0` is published, so it is inert here.)

- **Prerelease inclusion rule:** a version carrying a prerelease tag satisfies a range **only if** at least one comparator in that range carries a prerelease tag on the **same `major.minor.patch` tuple**.

### 2.2 Candidate-by-candidate evaluation

| Published version | Tuple | vs floor `0.1.2-alpha.1` | Prerelease-tuple match? | Satisfies `^0.1.2-alpha.1`? |
|---|---|---|---|---|
| `0.1.1-rc.1` | 0.1.1 | **below** the floor (`0.1.1 < 0.1.2-alpha.1` — a prerelease tag only breaks ties within an equal triple) | no comparator carries a prerelease on tuple `0.1.1` | **No** |
| `0.1.1-rc.2` | 0.1.1 | below the floor | no | **No** |
| `0.1.2-alpha.2` | 0.1.2 | **above** the floor (`alpha.2 > alpha.1`) | yes — the floor comparator `>=0.1.2-alpha.1` itself carries a prerelease on tuple `0.1.2` | **Yes** |

### 2.3 Will the install fail? — **No.**

`npm install` resolves a **range**, never the literal string in `package.json`, and installs the **highest published version that satisfies the range**. The only satisfying published version is `0.1.2-alpha.2`, so:

- **The install succeeds**, and the installed type baseline is **`0.1.2-alpha.2`** — `alpha.1` is never installed because it does not exist.
- The real consequence is **silent baseline drift, not an install error**: the maintainer believes they are on `alpha.1`'s type surface but actually gets `alpha.2`'s. Whether that breaks anything depends on whether `alpha.2` changed any `.d.ts` the plugin consumes — **unconfirmable**, because `alpha.1` was never published and cannot be diffed against `alpha.2`.
- The README claim "npm install gives you the type baseline" is misleading twice over:
  1. the floor version it points at does not exist; and
  2. a caret range is a *floating* constraint, not a pin — even if `alpha.1` had existed, `npm install` would install the *highest* satisfying version, not necessarily the one the plugin was developed against. A reproducible type baseline requires an **exact pin** or a **committed lockfile**.

### 2.4 The cases where it *would* actually fail (`ETARGET` / "No matching version found")

- an **exact pin** `"0.1.2-alpha.1"` (no range operator) in `package.json`;
- **`npm ci`** against a committed `package-lock.json` that pins `0.1.2-alpha.1` (the fixture ships no lockfile, so a plain `npm install` would simply rewrite the lockfile to `alpha.2`);
- an offline/frozen cache or mirror that lacks `alpha.2` (unconfirmed).

### 2.5 Drift in the other direction

Because of the prerelease-tuple rule, this range will **not** auto-adopt future prereleases of *other* tuples (e.g. a future `0.1.3-alpha.1` is excluded). It **will**, however, auto-adopt any future **stable** `0.1.x` (`0.1.3`, `0.1.4`, … anything `<0.2.0`). An unattended `npm install` can therefore silently promote the "type baseline" from an alpha to a stable `0.1.x` whose types may differ from `alpha.2` — a second reproducibility hazard on top of §2.3.

## 3. Installation / type-baseline plan

Verify the ground truth first (maintainer runs these; nothing was executed here):

```bash
npm view @deepseek-ai/dsh-llm versions --json                      # what actually exists
npm view @deepseek-ai/dsh-llm dist-tags --json                     # where next / alpha / latest point
npx semver -r '^0.1.2-alpha.1' 0.1.1-rc.1 0.1.1-rc.2 0.1.2-alpha.2  # expect: only 0.1.2-alpha.2
npm install --dry-run                                              # full resolution, nothing written
```

After any install, gate on types rather than on the installer: `npx tsc --noEmit` is the plugin's real "type baseline" check, plus `npm ls @deepseek-ai/dsh-llm` to record what actually landed.

### Option comparison

| # | Approach | Change | Effective range | Tradeoffs | Exit path |
|---|---|---|---|---|---|
| A | **Rebase the caret floor to the published prerelease** (default recommendation) | `"^0.1.2-alpha.1"` -> `"^0.1.2-alpha.2"` | `>=0.1.2-alpha.2 <0.2.0-0` | Minimal diff; resolves to `0.1.2-alpha.2` today; would auto-adopt a hypothetical `0.1.2-alpha.3+` and any stable `0.1.x`. Still floats — pair with a committed lockfile. | If a stable `0.1.x` breaks types: tighten to `~0.1.2-alpha.2` (`>=0.1.2-alpha.2 <0.1.3-0`) or pin exact (B). |
| B | **Exact pin** | `"0.1.2-alpha.2"` | exact | Fully deterministic; matches the "type baseline" intent; no surprise upgrades. Needs manual bumps; hard failure if `alpha.2` is ever unpublished (unconfirmed risk). | When a stable `0.1.x` ships and is vetted: move to `^0.1.2` (or the actual stable floor). |
| C | **Fall back to the rc cohort** | `"0.1.1-rc.2"` (or `"^0.1.1-rc.2"`) | exact / `>=0.1.1-rc.2 <0.2.0-0` | Use only if `alpha.2`'s types are incompatible with the plugin's code. Note: `^0.1.2-alpha.1` never matched the rc line, so this is an explicit cohort change. Counterintuitive but important: `^0.1.1-rc.2` resolves to `0.1.1-rc.2` — the tuple rule excludes `0.1.2-alpha.2` from it. | Once alphas are compatible again: switch to A/B. |
| D | **Install by dist-tag** | `npm i -D @deepseek-ai/dsh-llm@next` (or `@alpha`) | tag -> resolved exact version | Lets the registry decide; npm writes the resolved version as an exact pin. Tag existence and target are **unconfirmed** — check `dist-tags` first. | If the tag disappears or moves: pin A/B. |
| E | **Vendored / internal copy of `alpha.1`** | `file:` dep or vendored `.d.ts` | exact, local | Only if the *exact* `alpha.1` surface is mandatory and obtainable (npm cache, internal mirror, git ref — availability **unconfirmed**). Heaviest option; diverges from the registry. | Delete the vendor once a registry version matches the needed surface. |
| F | **Drop the devDependency** | remove the entry | — | If the plugin does not actually consume `@deepseek-ai/dsh-llm` types, removal eliminates this whole class of drift. | Re-add A/B if types are needed later. |

### Cross-cutting (applies to every option)

- Commit `package-lock.json` and use `npm ci` in CI — a caret range is only reproducible with a lockfile.
- Treat `npx tsc --noEmit` as the authoritative type-baseline gate; installer success/failure is not the signal.
- Optionally add a cheap CI guard (`npm view ... version <pinned>`) that fails loudly if the pinned version ever disappears — registry-dependent, unconfirmed offline.

## 4. Recommendation

1. Confirm the registry state with the verification block in §3.
2. Apply **Option A** (`^0.1.2-alpha.2`) plus a committed lockfile; choose **Option B** instead if strict, lockfile-free determinism is preferred for this devDependency.
3. Reserve **Option C** for a proven type incompatibility with `alpha.2`; **Option D** only if a suitable dist-tag is confirmed; **Option E** only if the exact `alpha.1` surface is mandatory; **Option F** if the types turn out to be unused.

## 5. Unconfirmed items

- Registry contents and dist-tags (`next` / `alpha` / `latest`): taken from the task brief; not re-verifiable from this offline container.
- The type-surface diff between `0.1.2-alpha.1` (never published) and `0.1.2-alpha.2`: impossible to produce.
- Exact npm error strings/codes (`ETARGET`, "No matching version found …") may vary slightly by npm version; the range-resolution semantics above are shared across npm/yarn/pnpm, but the specific engine versions present in a real environment are unverified.
- Whether any lockfile, CI config, or consuming source exists in the real repository: the fixture contains only `package.json` and `README.md`.
- Offline / frozen-cache and private-mirror behaviors.
