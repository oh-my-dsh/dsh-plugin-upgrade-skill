# S7 · Unpublished Cohort — Installation / Type-Baseline Plan (Read-Only Report)

**Scope of this report.** Read-only analysis of the fixture at `fixture/` (package `dsh-cohort-bench@0.1.0`, `private: true`). No install was executed, no dependency was fetched, and no fixture file was modified. Registry facts are taken from the task brief (no network access in this container) and are marked where unconfirmed.

## 0. Fixture inventory (everything that exists to reason from)

| File | Relevant content |
|---|---|
| `fixture/package.json` | `"devDependencies": { "@deepseek-ai/dsh-llm": "^0.1.2-alpha.1" }`, `"private": true`, no `resolutions`/`overrides` |
| `fixture/README.md` | Claims "npm install gives you the type baseline"; documents that only `0.1.1-rc.1`, `0.1.1-rc.2`, `0.1.2-alpha.2` exist on npm |

Not present in the fixture (each has consequences noted below): **no lockfile** (`package-lock.json` / `pnpm-lock.yaml` / `yarn.lock`), **no `.npmrc`**, **no `tsconfig.json`**, **no source files**, no reference to any other `@deepseek-ai/*` package.

---

## 1. Real consequence of the declaration `^0.1.2-alpha.1`

### 1.1 What the caret range actually means

Caret semantics: *allow changes that do not modify the left-most non-zero element*.
In `0.1.2-alpha.1` the left-most non-zero element is the **minor `1`** (major is `0`), so:

```
^0.1.2-alpha.1   ≡   >=0.1.2-alpha.1 <0.2.0
```

node-semver (shared by npm / pnpm / yarn) adds the **prerelease tuple rule**: a version carrying a prerelease tag satisfies a comparator set only if at least one comparator in the set has the *same* `[major, minor, patch]` tuple **and** also carries a prerelease tag. The only prerelease-bearing comparator here is the lower bound `0.1.2-alpha.1` itself (tuple `[0,1,2]`).

### 1.2 Verdict per published version

| Version | In range `>=0.1.2-alpha.1 <0.2.0`? | Why |
|---|---|---|
| `0.1.1-rc.1` | **No** | `0.1.1-rc.1 < 0.1.2-alpha.1` (patch 1 < 2); tuple `[0,1,1]` ≠ `[0,1,2]`, so the prerelease rule also excludes it |
| `0.1.1-rc.2` | **No** | Same as above |
| `0.1.2-alpha.1` | Yes (equal to lower bound) | **Never published — cannot be installed by anyone, ever** |
| `0.1.2-alpha.2` | **Yes** | Same tuple `[0,1,2]` as the prerelease lower bound; `alpha.2 > alpha.1` (identifier `alpha` equal, then `2 > 1`); and `< 0.2.0` |

### 1.3 Answer to the two direct questions

- **Will install actually fail?** **No.** `ETARGET` ("no matching version found") is raised only when *no* published version satisfies the range. Here `0.1.2-alpha.2` satisfies it, so `npm install` succeeds with no error and no warning — the problem is **silent**.
- **Which version will actually be installed?** **`0.1.2-alpha.2`** — npm resolves to the highest published version in range, and it is the only one. The declared `alpha.1` is unattainable; the range's lower bound points at a version that does not exist.

### 1.4 Secondary consequences

1. **The README promise is half-true.** "npm install gives you the type baseline" does hold mechanically — but the baseline installed is **alpha.2's types**, not the declared alpha.1's. The declared baseline never existed in the registry, so no type surface was ever "the alpha.1 baseline".
2. **The declaration stays wrong in the manifest.** npm does not rewrite the range in `package.json` on a plain install (only an explicit `npm i pkg@ver --save-exact` would). The repo keeps documenting a fictional version indefinitely.
3. **Silent baseline drift (the real hazard for a *type baseline*).** The upper bound `<0.2.0` means any future **stable** `0.1.x` (e.g. `0.1.3`, `0.1.10`) also satisfies the range and would be auto-adopted on a later install — the "type baseline" then silently changes between machines and over time. Note the asymmetry: future `0.1.x` **prereleases** (e.g. `0.1.3-beta.1`) do *not* satisfy the range, because the only prerelease comparator sits at tuple `[0,1,2]`. Stable drift in, prereleases out — surprising either way.
4. **Lockfile / CI.** The fixture has no lockfile, so nothing pins alpha.1 and a fresh resolve lands on alpha.2. If any lockfile or CI cache *outside* the fixture pins `0.1.2-alpha.1` (resolved URL / integrity), `npm ci` **hard-fails** (E404 on the tarball / ETARGET) even though `npm install` would re-resolve. Unconfirmed whether such a lockfile or cache exists — it is not in the fixture and is out of scope to look.
5. **Blast radius is dev-only.** The dep is a `devDependency` and the package is `"private": true`, so the exposure is development/CI type-checking, not the plugin's runtime.
6. **Type errors, if any, are drift against an unverifiable baseline.** alpha.1's types never existed publicly, so there is nothing to diff against; whether alpha.2's `.d.ts` surface matches what the code expects is **unconfirmed** (the fixture contains no source files and no `tsconfig.json` to check imports or `paths`/`skipLibCheck` settings).

---

## 2. Installation / type-baseline plan (paths, tradeoffs, exits)

### Path A — No change; accept the implicit resolution *(stopgap only)*

- **Do:** leave `^0.1.2-alpha.1`, run `npm install`, record the resolved version (`npm ls @deepseek-ai/dsh-llm` → `0.1.2-alpha.2`) in docs/CI output.
- **Tradeoffs:** zero repo change; works today. But the manifest keeps citing a never-published version, the baseline can silently drift to a future stable `0.1.x`, and without a committed lockfile installs are not reproducible.
- **Exit:** if drift or alpha.2 breaks the type-check → move to Path B (or C).

### Path B — Pin to the version that actually exists *(recommended)*

- **Do:** change the devDependency to the exact version `"@deepseek-ai/dsh-llm": "0.1.2-alpha.2"` (no range), regenerate and commit the lockfile (`package-lock.json`), and document in the README that the baseline is alpha.2.
- **Tradeoffs:** one-line manifest change plus lockfile churn; manual bumps later. In exchange the baseline is deterministic, honest, and `npm ci`-reproducible — which is what a "type baseline" is supposed to be.
- **Exit:** if alpha.2's types prove incompatible with the code → Path C; when a proper `0.1.2` stable ships → re-pin to it deliberately (not silently).

### Path B′ — Bounded range instead of an exact pin

- **Do:** `"@deepseek-ai/dsh-llm": "~0.1.2-alpha.2"` (≡ `>=0.1.2-alpha.2 <0.2.0`).
- **Tradeoffs:** tolerates a future stable `0.1.x` automatically, but only upward from a lower bound that actually exists. Softer than B; still drifts within `0.1.x`. For a *type baseline*, the exact pin of Path B is preferable.

### Path C — Fall back to the rc line *(contingency)*

- **Do:** pin `"@deepseek-ai/dsh-llm": "0.1.1-rc.2"` (the newest published `0.1.1` line).
- **Tradeoffs:** the only older published line; it is *outside* the current range and presumably an older API surface. Whether the plugin's code compiles against rc.2's types is **unconfirmed** (no source files in the fixture to check).
- **Exit:** if the code doesn't type-check against rc.2 → back to Path B.

### Path D — Drop the dependency; rely on host-provided or vendored types *(contingency)*

- **Do:** remove the devDependency and rely on ambient types shipped by the DSH host/runtime, or vendor the needed stubs locally.
- **Tradeoffs:** no dependence on an alpha at all, but loses upstream type updates and adds stub-maintenance burden. Feasible **only if** the plugin's source does not actually import from `@deepseek-ai/dsh-llm` — **unconfirmed** (no source files and no host type package are referenced anywhere in the fixture).

### Path E — Fix the root cause upstream

- **Do:** ask the DSH maintainers to either publish `0.1.2-alpha.1` or confirm that `0.1.2-alpha.2` is the intended baseline, and correct the README wording.
- **Tradeoffs:** no local change, but blocked on an external action (whether they will act is **unconfirmed**).
- **Exit:** Path B keeps CI green in the meantime; revisit if/when upstream responds.

### Recommended sequence

1. **Now:** Path B — pin `0.1.2-alpha.2`, commit the lockfile, document the real baseline.
2. **In parallel:** Path E — raise the manifest/README fiction with upstream.
3. **Only if needed:** Path C (rc line) or Path D (no dep) as contingencies; Path A only as a temporary stopgap; Path B′ if a hard pin is politically impossible.
4. **If type errors appear inside the dependency's `.d.ts` after pinning:** `skipLibCheck: true` in `tsconfig.json` is a pragmatic band-aid — tradeoff: it also masks genuine type conflicts elsewhere. Prefer fixing the pin first.

### Verification commands for the maintainer (NOT executed here — read-only, no network)

Run in an environment with registry access; expected results follow from the semver analysis above but are **unconfirmed until actually run**:

```bash
npm view @deepseek-ai/dsh-llm versions --json                      # expect 0.1.1-rc.1, 0.1.1-rc.2, 0.1.2-alpha.2
npm view '@deepseek-ai/dsh-llm@>=0.1.2-alpha.1 <0.2.0' version      # expect 0.1.2-alpha.2
npm install --dry-run                                               # expect resolution to 0.1.2-alpha.2, no ETARGET
npx semver -r '^0.1.2-alpha.1' 0.1.1-rc.1 0.1.1-rc.2 0.1.2-alpha.2   # expect only 0.1.2-alpha.2
```

---

## 3. Unconfirmed items (could not verify from the fixture / no network)

1. **Actual registry contents** — taken from the task brief (`0.1.1-rc.1`, `0.1.1-rc.2`, `0.1.2-alpha.2` published; `0.1.2-alpha.1` never published). No registry access in this container to verify.
2. **Whether `0.1.2-alpha.2`'s type surface matches what the code needs** — the fixture has no source files and no `tsconfig.json`; nothing to compile or diff.
3. **Whether the plugin's code imports `@deepseek-ai/dsh-llm` at all** — no source files present.
4. **Whether a lockfile or CI cache outside the fixture pins `0.1.2-alpha.1`** — the fixture contains no lockfile; out of scope to inspect CI. If one exists, `npm ci` fails (E404/ETARGET) while `npm install` re-resolves.
5. **Which package manager / version CI uses** — npm, pnpm and yarn share node-semver range semantics for this resolution, but their lockfile and CI behaviors differ.
6. **Whether the DSH host provides ambient types** that would make the devDependency unnecessary (Path D feasibility).
7. **Whether upstream will publish alpha.1 or bless alpha.2** (Path E outcome).

## 4. Compliance notes

- Fixture read only; **no file under `fixture/` was modified**; no `npm install` / network access / dependency installation was performed; no files written outside `agent-output/S7-unpublished-cohort/`.
- The only inputs used were `fixture/package.json` and `fixture/README.md`; no repository, skill, solution, or test materials were read.
