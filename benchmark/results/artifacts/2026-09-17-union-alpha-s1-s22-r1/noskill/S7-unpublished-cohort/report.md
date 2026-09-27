# S7 — Unpublished cohort installation and type-baseline plan

## Conclusion

The missing publication of `0.1.2-alpha.1` does **not**, by itself, make the declared dependency unresolvable. `^0.1.2-alpha.1` is a range, not an exact pin. With the supplied published-version set (`0.1.1-rc.1`, `0.1.1-rc.2`, `0.1.2-alpha.2`), a fresh ordinary npm resolution of this development dependency selects **`0.1.2-alpha.2`**. It does not install alpha.1 or silently fall back to an rc.

This establishes the version selected by the range, not that an entire install will succeed or that alpha.2 provides alpha.1's intended API. The fixture README's claim that “npm install gives you the type baseline” is misleading if “the baseline” means exactly alpha.1. It would supply the selected alpha.2 package, assuming installation succeeds and development dependencies are included.

## Evidence and scope

Read the task instruction in full, then both files in the supplied fixture:

- E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S7-unpublished-cohort/instruction.md
- E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S7-unpublished-cohort/environment/fixture/package.json
- E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S7-unpublished-cohort/environment/fixture/README.md

The manifest is private, version `0.1.0`, and declares only `devDependencies: { "@deepseek-ai/dsh-llm": "^0.1.2-alpha.1" }`. The fixture contains no lockfile, source, TypeScript configuration, installed dependency tree, package tarball, or host-version record. Registry availability is a supplied premise, not independently fetched evidence. No fixture or benchmark-repository files were changed; no install, build, migration, publication, or network lookup was performed.

A read-only computation with an already-installed node-semver 7.8.5 confirmed the normalized range and candidate membership. This was a local library check, not an npm install. Node reported `v24.14.1`; npm reported `11.11.0`. Initial attempts to load the checker failed because static imports are not supported in the execution wrapper; dynamic imports resolved that issue. Initial candidate library paths were absent; the eventual computation used an existing local copy. No dependencies were obtained for this check.

## 1. Range semantics and actual consequence

node-semver normalizes the range to:

```text
>=0.1.2-alpha.1 <0.2.0-0
```

For a zero-major caret range, the first nonzero component here is the minor component, `1`; the upper bound is therefore the next minor, not the next major. Prerelease admission also matters: because the lower comparator explicitly includes a prerelease on `0.1.2`, later prereleases of that same major/minor/patch tuple are eligible. It does not generally admit prereleases on other tuples.

| Version | Satisfies? | Reason |
| --- | --- | --- |
| `0.1.1-rc.1` | No | Below the lower bound. |
| `0.1.1-rc.2` | No | Below the lower bound. |
| `0.1.2-alpha.2` | Yes | Same prerelease tuple, greater prerelease number. |
| `0.1.2` | Yes, if published | Stable release exceeds its prereleases. |
| `0.1.3` | Yes, if published | Stable version below the upper bound. |
| `0.1.3-alpha.1` | No by default | Different tuple lacks an admitting prerelease comparator. |
| `0.2.0-alpha.1` / `0.2.0` | No | Outside the upper bound. |

Only alpha.2 is eligible among the three supplied releases. The lower-bound version need not itself exist in a registry. By contrast, an **exact** dependency on `0.1.2-alpha.1` would be unavailable from that registry and normally produce a no-matching-version/ETARGET failure.

The range is also not an alpha.2 pin: future eligible releases can change a fresh unlocked resolution. A lockfile can stabilize a previously resolved tree, but cannot conjure an unpublished alpha.1 package. Production installs that omit devDependencies do not provide this development type baseline at all. Full install success remains **unconfirmed**: transitive dependencies, peer constraints, engines, exports, registry configuration, and package contents are absent from the fixture.

## 2. Recommended path: explicitly adopt published alpha.2

This is the simplest path if the maintainer can accept alpha.2 rather than requiring historical alpha.1 fidelity. Proposed actions below are for a separately authorized writable project; none were executed here.

1. Declare `@deepseek-ai/dsh-llm` as the exact development version `0.1.2-alpha.2`, explicitly naming alpha.2 as the supported type baseline. A future command could be `npm install --save-dev --save-exact @deepseek-ai/dsh-llm@0.1.2-alpha.2`.
2. Inventory the plugin's actual imported DSH/Cordis packages and the target host version. Inspect alpha.2 manifests, exports, declaration files, peer requirements, and transitive resolution. Keep the participating packages on a tested compatible cohort; do not assume every scoped package exists at the same version merely because the brief summarizes registry availability. Do not invent extra dependencies absent from the fixture.
3. Generate and retain a lockfile after review, record toolchain versions, and use `npm ci` for subsequent reproducible development/CI installs with devDependencies enabled. Inspect the actual resolved tree for duplicate or incompatible shared packages. Exact direct pins alone do not freeze transitives.
4. Compile the plugin against the installed declarations and check representative API usage. Then load and exercise it in the intended host, including relevant lifecycle behavior. Compilation alone does not prove runtime compatibility.
5. Update the README to distinguish the verified alpha.2 baseline from alpha.1. If runtime peer dependencies are needed, declare tested support rather than inferring it from a devDependency.

**Tradeoff:** accessible published artifacts and straightforward reproducibility, but possible API changes from the desired alpha.1. Those differences are **unconfirmed** without source and artifacts. **Exit:** if tests fail, stop adoption; return to a previously verified manifest/lockfile pair, or choose the source-cohort path. The original unpinned caret declaration is not a reproducible alpha.1 rollback.

## 3. If exact alpha.1 behavior is required: pinned source cohort

An exact npm version request is not a viable path under the supplied publication premise. A potential alternative is an authoritative immutable source revision corresponding to alpha.1, plus locally produced artifacts for the required package cohort. Such a revision and any usable artifacts are **unconfirmed**: the fixture supplies neither a repository, commit, tag, archive, nor build instructions. Do not substitute current main or treat a similarly named tag as sufficient evidence.

Before execution, establish source provenance and the exact commit, dependency lockfile, toolchain, package list, and documented build procedure. In a separate authorized environment, build/package the coherent needed cohort; ensure its declaration files and runtime exports are present and its internal dependencies do not still request unpublished registry packages. Install verified local tarballs or a deliberately configured workspace, with explicit mappings for all required unpublished dependencies. A single leaf tarball or raw source checkout may still fail to resolve or supply types. Keep host and shared Cordis identities compatible; broad overrides or peer-check bypasses are not compatibility proof.

Record artifact hashes and revision provenance and run type/runtime checks. **Tradeoff:** potentially faithful historical baseline, but higher build and dependency-cohort maintenance cost. **Exit:** if the source revision or coherent artifacts cannot be established, mark exact alpha.1 reproduction blocked rather than fabricated; move to tested alpha.2 or defer support. Retire temporary local mappings when a suitable verified published cohort is adopted. No source retrieval or reproduction environment was created here.

## 4. Optional older published baseline

If the plugin and host can intentionally target an older API, evaluate exact `0.1.1-rc.2` (or rc.1 where specifically required) with its compatible dependencies and a new lockfile. This requires an explicit declaration change: neither rc satisfies the existing range. API availability and compatibility are **unconfirmed**. It is an alternative target, not an equivalent alpha.1 replacement or an automatic npm fallback. Reject this option if required APIs or host compatibility are missing; restore the last tested cohort.

## Verification still required

The semver result is verified locally against the supplied release list. Successful artifact installation, usable type declarations, alpha.1/alpha.2 API equivalence, source-revision availability, complete cohort versions, and host runtime compatibility are all **unconfirmed**. The missing package/source/host evidence prevents certifying those outcomes, but does not prevent the installation plan or the definitive range-selection conclusion above.
