# S7 · Unpublished Cohort — Install / Type-Baseline Plan (read-only report)

**Task**: analyze a plugin fixture whose type baseline declares `@deepseek-ai/dsh-llm: ^0.1.2-alpha.1`
while `0.1.2-alpha.1` was never published to npm. Deliver an installation/type-baseline plan.
**Mode**: plugin-upgrade **Mode A · inspect** (read-only investigation and report; then stop). No install, no build,
no network, no fixture write.
**Report date**: 2026-10-16. **Fixture state**: unchanged (read-only).

---

## 0. TL;DR verdict

| Question | Answer |
|---|---|
| Will `npm install` fail? | **No.** It succeeds, silently. |
| Which version actually gets installed? | **`0.1.2-alpha.2`** (the highest published version the caret range admits). |
| Is the declared baseline (`0.1.2-alpha.1`) obtainable from npm? | **No** — it was never published. |
| Is the README claim "npm install gives you the type baseline" true? | **No, in two independent ways**: the named version does not exist, and a caret range never guarantees the version it names. |
| What is the real hazard? | Not a broken install — a **silent, unreproducible type-baseline substitution** onto the `0.1.2-alpha.1 → 0.1.2-alpha.2` edge, which carries plugin-visible type-surface changes. |
| Recommended fix | Pin the exact published version (`0.1.2-alpha.2`) + commit a lockfile, or run a **verify-only source lane** if alpha.1's surface is genuinely required. |

The single most important nuance: **the caret range is what converts a loud failure into a silent
substitution.** Had the same maintainer written the exact version `0.1.2-alpha.1`, npm would have
failed hard with `ETARGET`/`E404` ("No matching version found"). The caret swallows that error.

---

## 1. Evidence base and scope

### 1.1 Fixture (the only task evidence) — inspected read-only, never written

| File | Bytes | SHA-256 |
|---|---:|---|
| `fixture/package.json` | 141 | `73b215c4e9632a8a3d7b7b29bd659aaa42e0e799f3e3d64b666b8cb9f2be1b4e` |
| `fixture/README.md` | 468 | `b4a1f0ef2a1ce99d3e89b0c77d35fc2d55331b8eb10e41c35f7a4a172fa89ab9` |

`fixture/package.json` in full:

```json
{
  "name": "dsh-cohort-bench",
  "version": "0.1.0",
  "private": true,
  "devDependencies": { "@deepseek-ai/dsh-llm": "^0.1.2-alpha.1" }
}
```

`fixture/README.md` (relevant excerpt): *"A plugin whose type baseline declares
`@deepseek-ai/dsh-llm: ^0.1.2-alpha.1` while the README claims "npm install gives you the type
baseline". npm reality: `@deepseek-ai/*` has only 0.1.1-rc.1 / 0.1.1-rc.2 / 0.1.2-alpha.2 —
**alpha.1 was never published**."*

Observations that constrain every plan below:

- The declaration sits in **`devDependencies`**, not `dependencies` and not `peerDependencies`.
- The package is **`private: true`** with no `scripts`, no `engines`, no `dsh-plugin.json`,
  no `cordis.patch.yml`, no `tsconfig.json`, and **no lockfile** in the fixture.
- There is **no plugin source** in the fixture. Which `@deepseek-ai/*` symbols the plugin actually
  imports is therefore **unknown** → every statement about *its* type errors is unconfirmed (§8).
- No `.npmrc` was read, printed, or committed (per the skill's safety boundary); only whether a
  registry configuration exists is relevant, and that is not observable from the allowed paths.

### 1.2 Skill reference material consulted (read-only)

`skills/plugin-upgrade/` · `SKILL.md` (mode discipline, safety boundaries, validation layers) ·
`references/rollup-0.1.2.md` (R-01, R-02, R-04, R-08, R-09, R-11, layered validation checklist) ·
`references/v0.1.2-alpha.1.md` (A1-24, A1-25) · `references/v0.1.2-alpha.2.md` (A2-02, A2-03, A2-08,
A2-10) · `references/v0.1.3-alpha.1.md` (A1-07/A1-08) · `references/README.md` (corridor index) ·
`references/precision-checklist.md` (peer-floor rule) · `references/jump-0.1.5-rc.2-to-0.1.7-rc.1.md`
(prerelease-range matrix) · `examples/04-dual-cohort-plugin.md` (reversible source overlay).

The registry snapshot quoted by the task brief is corroborated by the skill's own measurement
(`rollup-0.1.2.md` R-01, "npm reality" measured 2026-08-31): *"on npm, the `@deepseek-ai/dsh-*`
packages only have `0.1.1-rc.1`, `0.1.1-rc.2`, and `0.1.2-alpha.2`; alpha.1 was never published."*

### 1.3 Method for the semver claim

Because this task forbids running any install or touching the network, the semver conclusion was
derived by **re-implementing the documented node-semver rules npm's resolver uses** (caret expansion +
the prerelease "same `[major, minor, patch]` tuple" admission gate + max-satisfying selection) in a
scratch script, run locally, then deleted. The rules and the resulting matrix are reproduced in §2 so
the conclusion can be checked by hand. The re-implementation reproduces two independently documented
behaviours of the skill (R-08 pitfall 3 and the `0.1.7-rc.1` range matrix), which is the strongest
available cross-check in an offline container.

---

## 2. Requirement 1 — the real consequence of the declaration

### 2.1 What `^0.1.2-alpha.1` actually means

A caret range never means "this version". It means "this version **and everything the caret's
left-most-non-zero rule allows**". For a `0.x.y` version the caret pins the **minor**:

```
^0.1.2-alpha.1   :=   >=0.1.2-alpha.1   <0.2.0-0
```

(the `-0` upper bound is the prerelease-aware form; it exists to keep `0.2.0` prereleases out.)

On top of the comparators, node-semver applies a **prerelease admission gate**: a prerelease version
is only eligible when *some* comparator in the range carries a prerelease on the **same
`[major, minor, patch]` tuple**. Here the only prerelease comparator is `>=0.1.2-alpha.1`, tuple
`(0,1,2)`. Therefore:

* `0.1.2-alpha.2`, `0.1.2-beta.1`, `0.1.2-rc.1`, and the final `0.1.2` all share tuple `(0,1,2)` → **admitted**;
* `0.1.1-rc.1` / `0.1.1-rc.2` are below the lower bound → rejected;
* `0.1.3-alpha.1`, `0.1.3-alpha.2`, `0.2.0-rc.1` are prereleases on a **different tuple** → rejected by the gate
  even though they are numerically `< 0.2.0-0`.

### 2.2 Verified resolution matrix

Registry set per the task brief: `{0.1.1-rc.1, 0.1.1-rc.2, 0.1.2-alpha.2}`.
"Later" = versions the skill's own measurements show as published after the brief's snapshot
(alpha.3/alpha.4 under the `alpha` tag, `0.1.2-rc.1` on `next`) — listed to show the drift surface.

| Declared spec | Expands to | Admits (tested set) | Resolves to, against the brief's registry |
|---|---|---|---|
| **`^0.1.2-alpha.1`** (the fixture) | `>=0.1.2-alpha.1 <0.2.0-0` | `0.1.2-alpha.2`, `0.1.2-alpha.3`, `0.1.2-alpha.5`, `0.1.2-rc.1`, `0.1.2` | **`0.1.2-alpha.2` — install succeeds** |
| `0.1.2-alpha.1` (had it been an exact pin) | `= 0.1.2-alpha.1` | *(none)* | **no match → `ETARGET` / `E404`, hard failure** |
| `^0.1.1-rc.2` (today's published line) | `>=0.1.1-rc.2 <0.2.0-0` | `0.1.1-rc.2`, `0.1.2` | `0.1.1-rc.2` — install succeeds |
| `^0.1.0-rc.8` (an old-style floor) | `>=0.1.0-rc.8 <0.2.0-0` | `0.1.2` only | **no match → hard failure** (the R-08 pitfall-3 mechanism) |

npm resolves a range to the **maximum satisfying version**, so with the brief's registry set the
only candidate is `0.1.2-alpha.2`.

### 2.3 Answers

1. **Will install actually fail?** **No.** `npm install` (and `npm install` with no arguments, which
   includes devDependencies by default) resolves `@deepseek-ai/dsh-llm@^0.1.2-alpha.1` to
   `0.1.2-alpha.2` and completes with exit code 0. There is no warning that names the phantom
   version: npm only reports "no matching version" when *nothing* satisfies the range.
2. **Which version will actually be installed?** `@deepseek-ai/dsh-llm@0.1.2-alpha.2`, as a
   devDependency of `dsh-cohort-bench@0.1.0`.
3. **What is the real consequence?** The declared type baseline and the installed type baseline
   differ by **one corridor edge** — `0.1.2-alpha.1 → 0.1.2-alpha.2` — and that edge is *not* empty.
   The plugin will be typechecked against alpha.2 declarations while its author believed it was
   typechecked against alpha.1 declarations.
4. **When *would* it fail?** Only through channels unrelated to alpha.1's absence:
   * a **lagging mirror** (npmmirror and similar lag `@deepseek-ai/*` by hours or more → `E404`/`ETARGET`), R-08 pitfall 1;
   * a **hand-written or stale lockfile** pinning `0.1.2-alpha.1` → `npm ci` fails (an exact version
     that cannot exist in the registry can never be satisfied);
   * pnpm's `minimumReleaseAge` 24 h supply-chain rule on release day, R-08 pitfall 2;
   * `--omit=dev` / `NODE_ENV=production`, which skips the devDependency entirely (a *different*
     failure: "no type baseline at all").

### 2.4 The contrast that makes the hazard visible

| | Exact pin `0.1.2-alpha.1` | Caret `^0.1.2-alpha.1` |
|---|---|---|
| Install result | **fails loudly** (`ETARGET`) | **succeeds silently** |
| Version you get | none | `0.1.2-alpha.2` |
| Signal to the maintainer | immediate, at install time | **none** |
| Reproducibility | n/a | registry-state dependent |

A second, subtler point: **even in a world where `0.1.2-alpha.1` had been published, the caret would
still not have installed it** — npm picks the maximum satisfying version, which is alpha.2. The caret
is structurally incapable of pinning a baseline; it only ever expresses a floor.

---

## 3. Requirement 2 — real consequences, ranked

### C1 · Silent substitution (primary)
No install error, no peer warning, no deprecation notice. The only way to notice is to *ask the tree*
(`npm ls @deepseek-ai/dsh-llm` / `npm why` / read the lockfile). "Install succeeded" is not evidence
of the right baseline — the skill's own field notes make the same point for a different failure mode
(*"a dependency-tree cold boot, not just successful installation"*, DSH-0.1.2-A2-03 field note ②).

### C2 · The installed baseline is the alpha.1→alpha.2 edge, which carries type-surface changes
`rollup-0.1.2.md` **R-11** ("0.1.2 type-surface export drift — ledger not in the release notes") lists
the alpha.1→alpha.2 rows that hit a `@deepseek-ai/dsh-llm` consumer directly:

| alpha.1 surface | alpha.2 surface |
|---|---|
| `JsonValue`, `isJsonValue`, `snapshotJsonValue` (from `dsh-session` / re-exported by `dsh-tools`) | `@deepseek-ai/dsh-util-values` (a **new direct dependency** is required) |
| `deepFreeze`, `assertNever` from `@deepseek-ai/dsh-llm` | moved out to `@deepseek-ai/dsh-util-values` |
| `LlmModelDiscoveryError` (code `model-discovery-failed`) | `RemoteError<'llm/model-discovery-rejected'>` |
| `settingsNamespace()` / `installSettingsSection()` / `deepEqualJson()` (`dsh-settings`) | all deleted — namespaces validated at compile time (DSH-0.1.2-A2-10) |
| `*Error` classes from `dsh-agent-presets` | deleted; branch on `RemoteError` codes (DSH-0.1.2-A2-02) |

R-11 also records that a real plugin's *entire* post-upgrade typecheck failure set came from a single
one of these rows (`settingsNamespace`, dsh-better-sidebar PR #472). So "the caret quietly moved me
one alpha" can mean "my typecheck is now red for reasons I did not choose".

### C3 · The baseline is a moving target, not a version
The same range admits `0.1.2-alpha.3`, `0.1.2-alpha.5`, `0.1.2-rc.1` and the final `0.1.2`. The
skill's measurements show those publications actually happened: alpha.3/alpha.4 landed under the
`alpha` dist-tag (2026-09-02) and `0.1.2-rc.1` on `next` (2026-09-03/04). So the *string in
`package.json`* does not identify a baseline — **the install date and the registry state do**. Two
developers, or a developer and CI, can legitimately end up on different type surfaces. [unconfirmed
for this container: the exact registry state at any future install date cannot be verified offline.]

### C4 · The README claim is false in two independent ways
(a) the named version was never published, so "npm install gives you the type baseline" cannot mean
"gives you 0.1.2-alpha.1"; (b) a caret range is a floor, so even a published alpha.1 would not be
what you get. Documentation that states a version the manifest cannot deliver is a defect regardless
of which fix is chosen.

### C5 · "Install succeeded" ≠ "type baseline complete"
* A packed package's **`devDependencies` are not passed to consumers** (DSH-0.1.2-A2-03 field note).
  `.d.ts` files that reference declarations owned by other packages will resolve only if those
  packages happen to be present; with `skipLibCheck: true` a missing owner does not error — selectors
  and callbacks silently become `any`. The prescribed diagnostic is **one `tsc --noEmit` with
  `skipLibCheck: false`**, then declaring the actual owners as direct devDependencies.
* `dsh-llm` alone is a *narrow* baseline. A DSH plugin's type surface normally spans session,
  settings, agent-presets, typert-protocol, client packages, etc. Whether this plugin needs more is
  **[unconfirmed]** — the fixture contains no source, no `tsconfig.json`, and no import list.

### C6 · Downstream and CI exposure
* **Mirror lag** (R-08 pitfall 1): a consumer behind a lagging mirror can hit a real `E404`/`ETARGET`
  for a range that resolves fine on the official registry. Both CLI installs and in-profile pnpm
  should point at the official registry (`npm_config_registry=https://registry.npmjs.org`).
* **Publication hazard** (R-04): while a cohort is unpublished, a release tag that triggers npm
  publish ships a package whose `@deepseek-ai/*` ranges cannot resolve from the registry — *"that is
  irreversible for that version"*. Here the range *does* resolve (to alpha.2), so this specific
  hazard is softened, but the *declared intent* (alpha.1) is unattainable, and any consumer on a
  lagging mirror is exposed. Also: plugin releases that adapt an alpha cohort should be published
  under a prerelease number on the **`alpha`** dist-tag, never `latest` (R-04).
* Because the declaration is a **devDependency** of a `private: true` package that is never
  published, C6's publish hazard does not apply to this fixture as-is — it applies the moment this
  `package.json` is used as a template or the package loses `private: true`.

### C7 · The same string is correct in a different seat (do not "fix" it globally)
`references/precision-checklist.md` requires that *"every `@deepseek-ai/dsh-*` **peer** floor sits on
the target cohort (`^0.1.2-alpha.1` or later within the cohort)"*. As a **peer floor** matched
against a running host (with `includePrerelease`), `^0.1.2-alpha.1` is a legitimate expression: a host
at `0.1.2-alpha.2` satisfies it. As a **devDependency baseline pin** it is a phantom. The string is
seat-dependent — so any fix must be applied to the dependency seat only, and peer floors must not be
rewritten in the same sweep. The fixture declares no peers today, so this is advisory.

---

## 4. Requirement 2 — installation / type-baseline plan

Four workable paths plus a rejected one. All of them are **plans**: per the skill's Mode A discipline
and this task's read-only authorization, **nothing below has been executed**, and each write requires
separate confirmation before it happens.

### Path A · Pin exactly to the published `0.1.2-alpha.2` — **recommended default**

Accept the substitution explicitly and make it reproducible.

**Change** (in the plugin's own `package.json`, in a dedicated branch/worktree):

```diff
- "devDependencies": { "@deepseek-ai/dsh-llm": "^0.1.2-alpha.1" }
+ "devDependencies": { "@deepseek-ai/dsh-llm": "0.1.2-alpha.2" }
```

then regenerate and **commit the lockfile** (`package-lock.json`), and correct the README claim to
name the version that actually lands.

* **Why exact, not `^0.1.2-alpha.2` / `~0.1.2-alpha.2`**: both of those expand to the same
  `>=0.1.2-alpha.2 <0.2.0-0` set and therefore admit `0.1.2-rc.1` and the final `0.1.2` — the drift
  survives. Only an exact pin removes it.
* **Follow-ups**: add the declaration owners the plugin actually consumes as **direct** devDependencies
  (see C5; `@deepseek-ai/dsh-util-values` is the R-11 row that most often bites a `dsh-llm` consumer).
* **Tradeoffs**: minimal, cheap, reversible, offline-verifiable; but the baseline is alpha.2, so any
  source written against alpha.1's surface must be checked against the R-11 ledger (§3 C2). This is
  the "declare what you actually use" fix, not the "get alpha.1" fix.
* **Exit path**: revert the one-line diff and the lockfile; nothing else changes. If alpha.2's type
  surface breaks the plugin, go to Path B or C rather than widening the range.
* **Do not**: widen to `^0.1.1`, `*`, or a dist-tag; do not add `overrides`/`resolutions` forcing
  `0.1.2-alpha.1` (that version does not exist → `ETARGET`); do not switch package managers (the
  skill forbids mixing npm/pnpm/bun in one tree).

### Path B · Verify-only source lane — no install at all (dsh-TUI #622 / #647, cited by R-01)

Keep the installable baseline on the published line and prove the type surface against the target
tag's **source**:

* keep `package.json`/lockfile installable from the registry;
* in CI (or a scratch checkout), check out the upstream tag and run `tsc --noEmit` with a `paths`
  mapping from `tsconfig.base.json` pointing at the source tree;
* record which edge this proves and which it does not — R-01 is explicit that this lane *"proves the
  type surface; runtime is verified separately"*, and #647 kept the lane even after going npm on
  alpha.2.

* **Tradeoffs**: zero registry dependence, fully reproducible, no unpublished cohort in any lockfile;
  but it is a *type* lane only — it proves nothing about installability, peers, or runtime, and it
  needs a network fetch of the tag (out of scope for this read-only container).
* **Exit path**: drop the CI lane and switch to Path A once the target cohort is on npm; the
  repository never carries an unpublished version in the meantime.
* **Best when**: the goal is "keep CI green and keep the lockfile installable" rather than "actually
  typecheck against alpha.1".

### Path C · Build the unpublished cohort from the official tag (R-01 recipe, A1-25, example 04)

The only path that genuinely delivers `0.1.2-alpha.1`'s type surface. Two variants:

**C1 — tarball store + `overrides`** (R-01, verbatim shape):

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git /tmp/dsh-build
cd /tmp/dsh-build && git checkout dsh-v0.1.2-alpha.1
pnpm install && pnpm run build
mkdir -p ~/.dsh-cohorts/0.1.2-alpha.1
pnpm -r exec pnpm pack --pack-destination ~/.dsh-cohorts/0.1.2-alpha.1
```

then write the range as `^0.1.2-alpha.1` and pin the needed packages to those tarballs via
`overrides` (`file:` specs). **"Once the final release ships, deleting the `overrides` section returns
to registry resolution"** — that is the designed exit path.

**C2 — reversible `link:` source overlay** (DSH-0.1.2-A1-25: *"While the cohort is unpublished, point
type dependencies at the official source checkout with `link:`"*; implemented end-to-end by
`dsh-mnemon` in `examples/04-dual-cohort-plugin.md`): build the tag's `lib/` outputs in an isolated
checkout and link only the `@deepseek-ai/*` outputs into `node_modules`, with a link script that
(1) validates the DSH root version, every package name/version and the built `lib/`, (2) records all
original registry symlinks into an exclusive restore record, (3) only then replaces links, and
(4) restores item-by-item and deletes the restore record when verification ends. This keeps the
unpublished alpha **out of the lockfile** and never leaves a half-linked mixed cohort.

* **Tradeoffs**: heaviest path — needs network, pnpm, a full monorepo build, and (for CI) a
  materialized tarball store keyed by a workspace hash, because a frozen lockfile records
  machine-dependent absolute paths (R-04). Also R-01's pnpm-version sensitivity
  (`packageManager: pnpm@11.24.0` rather than `11.9.0` for `file:` tarball transitive peers) is a
  **single field report, not reproduced** → must be minimally reproduced before adoption.
* **Exit path**: C1 — delete the `overrides` block; C2 — run the restore script, then re-run the
  registry lane to confirm the tree is back on the published line. Both are designed to be atomic
  and reversible; if a link/override half-applies, restore from the recorded baseline rather than
  hand-editing `node_modules`.
* **Do not**: hand-copy package directories or hand-write shims; do not let an unpublished version
  reach the committed lockfile or a published tarball.

### Path D · Cross-cohort coexistence (R-02) — conditional

Only relevant if this plugin ships a **Web Client bundle** or hard-`require`s platform modules and
must run on both an rc.2 host and the alpha cohort: keep **one artifact** and resolve the cohort
surface at runtime (`require`-probe for `@deepseek-ai/dsh-client-store` vs the removed
`dsh-client-runtime/client`), and put cohort differences into `!!js` probes in
`cordis.patch.yml` on the host plane; take injected services out of hard `inject` lists and probe at
the use site. Rejected alternatives: per-consumer try/catch duplication, per-cohort artifacts,
inject-wait (old hosts stay `pending` forever).

* **Applicability here**: **[unconfirmed]** — the fixture has no `dsh.client`, no bundle, and no
  source, so no touchpoint hit can be established. Listed for completeness; do not adopt it
  speculatively.
* **Exit path**: drop the probes once the old cohort is retired; verification is a cold boot on
  *each* cohort.

### Path E · Rejected

* **Widen the range** (`^0.1.1`, `*`, `latest`) — destroys the baseline entirely and can silently
  cross minor lines.
* **Force `0.1.2-alpha.1` via `overrides`/`resolutions`** — the version does not exist; `ETARGET`.
* **Distrust the install and re-run until it "looks right"** — there is nothing to look at; the
  failure mode is silent.
* **Treat `npm view @deepseek-ai/dsh-llm dist-tags` as the answer** — sub-package `latest` tags are
  known to sit far behind (`0.0.1-rc.1` / `0.1.0-rc.6` per R-01); dist-tags govern bare installs, not
  an explicit range. (Use dist-tags only to confirm the *channel*, per R-08's verification step.)

### 4.1 Recommended landing (the concrete patch, for confirmation)

| Step | Action | Owner |
|---|---|---|
| 1 | In a dedicated branch/worktree, set `devDependencies["@deepseek-ai/dsh-llm"]` to `"0.1.2-alpha.2"` (exact) | `package.json` |
| 2 | Install once on the **official** registry (`npm_config_registry=https://registry.npmjs.org`) to defeat mirror lag (R-08) | lockfile |
| 3 | Commit `package-lock.json`; scan the **whole** lockfile for the `@deepseek-ai` cohort, not just top level | lockfile |
| 4 | Run one `tsc --noEmit` with `skipLibCheck: false`; add every declaration owner actually consumed as a direct devDependency | `package.json` |
| 5 | Correct the README: state the version that actually installs, and that `0.1.2-alpha.1` was never published | `README.md` |
| 6 | Record the baseline per R-06 (commands, exit codes, resolved versions, lockfile hash) so later failures are attributable | report |
| 7 | If this ever becomes a published package: prerelease version + `alpha` dist-tag, never `latest` (R-04) | release workflow |

Rollback: revert steps 1–3 (the diff is one line plus the lockfile); steps 4–5 are additive and
independently revertible. Nothing outside these owned paths is touched.

### 4.2 Validation checklist (do not stop at "install exited 0")

1. **Dependency resolution** — `npm ls @deepseek-ai/dsh-llm` / `npm why` show exactly `0.1.2-alpha.2`;
   no second `@deepseek-ai` cohort anywhere in the lockfile; no peer warnings in the install log
   (R-08's landed signal).
2. **Static** — `tsc --noEmit` and build; the one `skipLibCheck: false` diagnostic run has been done
   and its owners declared (C5).
3. **Runtime** — an install-tree cold boot in an **isolated** profile (`dsh --profile <name> --port 30xx`,
   token on stdout), never the production instance (R-09/R-12): confirm the plugin's row is in the
   boot graph with nothing `pending`, and run one message → tool → response round. A green install
   and a green typecheck do not prove this (A2-03 field notes ① and ② are both "install and typecheck
   pass, runtime fails").
4. **Behaviour** — execute one core plugin path; for a Web Client plugin, additionally the
   token→cookie → boot-manifest → advertised-artifact → real-mount acceptance (DSH-0.1.2-A1-19);
   a bare HTTP 200 is not acceptance.
5. **Reporting** — pre-existing failures (from the R-06 baseline, untouched) / completed / skipped /
   pending-residual-risk / rollback / recommendations.

---

## 5. Answers to the three stated requirements, condensed

1. **Real consequence**: `npm install` does **not** fail. `^0.1.2-alpha.1` expands to
   `>=0.1.2-alpha.1 <0.2.0-0`; the prerelease admission gate lets `0.1.2-alpha.2` (same
   `(0,1,2)` tuple) through while excluding `0.1.3-*`; npm picks the maximum satisfying version, so
   **`0.1.2-alpha.2` is installed**. The declared baseline is never materialized, the README claim is
   false, and the plugin is silently typechecked against the alpha.1→alpha.2 edge (R-11 drift rows).
   Had the version been pinned exactly, the install would have failed loudly instead.
2. **Plan**: Path A (pin `0.1.2-alpha.2` exactly + lockfile + declaration owners) as the default;
   Path B (verify-only `paths` lane) when the lockfile must stay on the published line; Path C
   (build the tag, tarball `overrides` or reversible `link:` overlay) when alpha.1's surface is
   genuinely required, with the designed exit "delete the overrides / run the restore script";
   Path D (R-02 dual-cohort) only if a client bundle exists; Path E rejected. Each has tradeoffs and
   an exit path in §4.
3. **Unconfirmed**: see §8 — chiefly the plugin's actual import surface, the registry state at any
   future install date, and whether a lockfile/tsconfig would be generated by an install.

---

## 6. What was *not* done (scope discipline)

* No file under `fixture/` was created, modified, or deleted (SHA-256 recorded in §1.1; the fixture
  tree still contains exactly `package.json` and `README.md`).
* **No install, no `npm`/`pnpm` invocation, no build, no `git` operation, no network access.**
* No reproduction environment, no dependency installation, no migration of anything.
* No `.npmrc`, credential, token, or session log was read or printed.
* The only scratch file created (`semver-check.mjs`, used for §2's offline verification) was written
  inside `agent-output/S7-unpublished-cohort/` and deleted; the output directory now contains only
  this report.
* Nothing outside the three allowed paths was listed, globbed, or opened.

---

## 7. Evidence index

| Claim | Source |
|---|---|
| `0.1.2-alpha.1` never published; npm has only `0.1.1-rc.1` / `0.1.1-rc.2` / `0.1.2-alpha.2` | task brief; `references/rollup-0.1.2.md` R-01 "npm reality" (2026-08-31) |
| alpha.3/alpha.4 later published under `alpha`; `0.1.2-rc.1` on `next` | `rollup-0.1.2.md` R-01 update (2026-09-02) + status header (2026-09-04/07) |
| Unpublished-cohort install recipe (build tag, `pnpm pack`, `file:` overrides, delete overrides when shipped) | `rollup-0.1.2.md` R-01 |
| `link:`/source-overlay lane for an unpublished cohort | `references/v0.1.2-alpha.1.md` A1-25; `examples/04-dual-cohort-plugin.md` |
| Verify-only type lane (`tsc` + `paths`, dsh-TUI #622/#647) | `rollup-0.1.2.md` R-01 |
| Mirror lag / pnpm `minimumReleaseAge` / peer-floor prerelease semantics | `rollup-0.1.2.md` R-08 |
| alpha.1→alpha.2 type-surface drift ledger (incl. `dsh-llm` rows) | `rollup-0.1.2.md` R-11 |
| `settingsNamespace()` removal; `RemoteError` codes; peer trim | `references/v0.1.2-alpha.2.md` A2-10 / A2-02 / A2-03 |
| Packed devDependencies are not passed to consumers; `skipLibCheck: false` diagnostic | `references/v0.1.2-alpha.2.md` A2-03 field notes |
| Install/typecheck green ≠ runtime green (dependency-tree cold boot) | `references/v0.1.2-alpha.2.md` A2-03 field notes ①/② |
| Peer floors on the target cohort (`^0.1.2-alpha.1` or later) | `references/precision-checklist.md` |
| Cross-cohort coexistence (one artifact + runtime probes) | `rollup-0.1.2.md` R-02 |
| Publication while a cohort is unpublished is irreversible; `alpha` dist-tag for plugin releases | `rollup-0.1.2.md` R-04 |
| Unpublished cohort → verify on a source-launched host | `references/v0.1.3-alpha.1.md` A1-07/A1-08 |
| Prerelease-range admission matrix (same-tuple rule) | `references/jump-0.1.5-rc.2-to-0.1.7-rc.1.md` DSH-0.1.7-J1-01; `references/v0.1.7-rc.1.md` |
| Read-only inspect mode; confirm before any write; validation layers; report structure | `skills/plugin-upgrade/SKILL.md` |
| Caret/prerelease resolution result (§2) | offline re-implementation of documented node-semver rules (§1.3) |

---

## 8. Unconfirmed items

1. **The plugin's actual import surface.** The fixture contains no source, `tsconfig.json`, or
   dependency list beyond `dsh-llm`. Whether the plugin consumes any R-11/A2-03-drifted symbol
   (`settingsNamespace`, `JsonValue`, `deepFreeze`, `assertNever`, `LlmModelDiscoveryError`,
   `dsh-client-runtime`, …) is **unconfirmed**; consequently whether the silent alpha.2 substitution
   breaks this plugin's typecheck is **unconfirmed**.
2. **Registry state at any future install date.** Only the brief's snapshot
   (`0.1.1-rc.1`/`0.1.1-rc.2`/`0.1.2-alpha.2`) was used. Whether `0.1.2-rc.1` or a final `0.1.2` is
   reachable at the moment a real install runs is **unconfirmed** — the skill's later measurements
   suggest they are, which is exactly why the range must be pinned rather than left as a caret.
3. **Whether an install would generate a `package-lock.json` / how the tree resolves in practice.**
   No install was run (forbidden). Expected npm behaviour is described, not observed.
4. **Whether the plugin needs more than `dsh-llm` for a complete type baseline** (session, settings,
   typert-protocol, client packages, `@deepseek-ai/cordis`, …). **Unconfirmed** without source.
5. **pnpm version sensitivity for `file:` tarball transitive peers** (`11.9.0` vs `11.24.0`) — a
   single field report in R-01, explicitly **not reproduced**; must be minimally reproduced before
   Path C is adopted.
6. **Path D applicability** — no `dsh.client`, bundle, or composition file exists in the fixture, so
   dual-cohort necessity is **unconfirmed**.
7. **Whether the fixture's `package.json` is a template for published packages** — it is
   `private: true` today; the R-04 publication hazard is therefore conditional, not active.
