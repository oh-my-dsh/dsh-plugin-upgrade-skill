# JUDGE BRIEF · skill.S7-unpublished-cohort

## Criteria (sealed rubric)
- [published-version-evidence] (25pt) Use package.json and the supplied README/brief to distinguish the @deepseek-ai/dsh-llm declaration from the published version list: alpha.1 was never published there, while alpha.2 was. Do not infer each internal package exists from the root package or a dist-tag. The brief already supplies the registry fact: credit using it with proposed package-specific verification; never require an actual online npm view in this closed-book task.
- [caret-resolution] (25pt) Explain why ^0.1.2-alpha.1 can select the supplied published 0.1.2-alpha.2: the missing lower-bound release does not make the range unresolvable. Identify the silent declaration/type-baseline mismatch and prerelease compatibility uncertainty. Do not claim all alpha versions are missing or that the caret guarantees alpha.1. No mandatory semver formula or keyword spelling.
- [workable-baseline-plan] (25pt) Give at least ONE complete feasible plan with its tradeoff: either deliberately target the published alpha.2 using an exact pin and acknowledge that this does not validate alpha.1; or obtain a verified exact upstream alpha.1 source ref, build/package the necessary cohort and resolve local tarballs explicitly. One coherent plan is sufficient for full credit. Bare npm ci, tarball or overrides words are not a plan; do not require guessing an unavailable tag or command.
- [reproducibility-and-exit] (25pt) Make the chosen plan reproducible with one consistent project package manager, a committed lockfile/frozen install or equivalent, and a proposed typecheck against the intended target. For temporary local overrides, explain when/how to replace them with verified equivalent published packages and remove the overrides; an exact published-pin plan can describe deliberate future upgrades instead. Mark unverified source/build/runtime details honestly. Do not require both npm and pnpm, switching package managers, or executing installs.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [install-unpublished-registry-version] ceiling=10 Trigger only for an affirmative prescription to install the exact unpublished @deepseek-ai cohort alpha.1 version from npm as if available. The declared caret range, local tarballs built from alpha.1 source, rejected BAD examples and explicitly forbidden exact-install commands do not trigger this cap.

## Candidate report(s)
#### FILE: S7-unpublished-cohort/S7-unpublished-cohort-install-plan.md

# S7 · Unpublished Cohort — Installation & Type-Baseline Plan (Read-Only)

**Fixture**: `dsh-cohort-bench@0.1.0`, `private: true`, two files only —
`package.json` (line 5: `"devDependencies": { "@deepseek-ai/dsh-llm": "^0.1.2-alpha.1" }`) and `README.md`
(line 3: "npm install gives you the type baseline"). No lockfile, no `tsconfig`, no `src/`, no `.npmrc`, no CI config.
Nothing under `fixture/` was modified; nothing was installed; no git, no registry, no network was used.
Skill: `plugin-upgrade` (Mode A · inspect — read-only report, no writes, no install).

## 0. Answers in one block

| Question | Answer |
|---|---|
| Will `npm install` fail? | **No.** It fails only if someone pins the exact version (`0.1.2-alpha.1` / `npm i pkg@0.1.2-alpha.1`). A caret **range** is resolved against published versions, and a satisfiable range never raises ETARGET. |
| Which version is actually installed? | **Not alpha.1 — and not necessarily alpha.2.** Under the brief's registry snapshot (only `0.1.1-rc.1`, `0.1.1-rc.2`, `0.1.2-alpha.2`): **`0.1.2-alpha.2`**, deterministically. Under the skill's later measurements (alpha.3/alpha.4 on the `alpha` dist-tag, `0.1.2-rc.1` on `next`): the same range reaches the **max published 0.1.2 prerelease**, i.e. `0.1.2-rc.1` (or `0.1.2` if the final shipped) — see §1.3. |
| Is the README claim false? | **Yes, but narrowly.** "npm install gives you the type baseline" is true only as "you get *some* 0.1.2-line preview surface". It is not the alpha.1 surface, and it is not stable over time. The range token itself is a legitimate *floor* (§1.4d). |
| Is this a publish hazard? | **No.** `private: true` + `devDependencies` only. Unlike R-04, no unresolvable range is frozen into a published artifact. |

## 1. The real consequence of the declaration

### 1.1 What `^0.1.2-alpha.1` literally means

Caret on a `0.x` version allows patch/minor-position growth inside the same minor:

```
^0.1.2-alpha.1  ==>  >=0.1.2-alpha.1 <0.2.0-0
```

Then npm's prerelease admission rule applies: *a version carrying a prerelease satisfies a comparator set only if
some comparator in that set carries a prerelease **on the same `[major,minor,patch]` tuple**.* Here the floor
`0.1.2-alpha.1` supplies exactly that (tuple `0.1.2` + a prerelease tag), so the whole 0.1.2 prerelease corridor is
admitted. Everything outside that tuple is not:

| Candidate | Satisfies? | Why |
|---|---|---|
| `0.1.2-alpha.1` | would, but **does not exist** | floor itself |
| `0.1.2-alpha.2` … `0.1.2-alpha.5` | **yes** | same tuple + prerelease, above floor |
| `0.1.2-rc.1` | **yes** | same tuple; `rc` > `alpha` |
| `0.1.2` (final) | **yes** | plain version inside `<0.2.0-0` |
| `0.1.1-rc.1` / `0.1.1-rc.2` | no | below the floor |
| `0.1.3-alpha.2`, `0.1.5-alpha.2`, `0.1.7-rc.1` | no | prerelease of a **different** tuple |
| `0.1.3`/`0.1.7` (stable, if ever) | yes | stable versions are not filtered by the prerelease rule |
| `0.2.0-rc.1` | no | excluded by the `<0.2.0-0` ceiling (see the v0.2.0-rc.1 card: use `^0.1.0 \|\| ^0.2.0-rc.1`) |

This is the **inverse** of the well-known trap in [R-08] pitfall 3 and card **DSH-0.1.7-RC1-01**: there, `^0.1.7`
(no prerelease in any comparator) *refuses* `0.1.7-rc.1`. Same rule, opposite outcome, because the floor here carries
`-alpha.1`. Do not generalize "prerelease ranges never match"; and do not "fix" this declaration by stripping the
prerelease tag — `^0.1.2` would then *refuse* every 0.1.2 prerelease and resolve to nothing on a registry that has no
stable 0.1.x.

Corollary worth stating: the floor **must** name the target tuple. Writing the previous cohort's floor
`^0.1.1-rc.2` would *not* reach alpha.2 either (its comparators carry tuple `0.1.1`, so `0.1.2-alpha.2` is filtered
out), which is exactly why an unpublished-but-intended target has to appear in the range as `^0.1.2-alpha.1`.

### 1.2 So install does not fail — the failure mode is quieter

`npm install` reads the range, queries the registry, picks the highest published version that satisfies it, writes that
into `package-lock.json` + `node_modules`, and leaves `package.json`'s `^0.1.2-alpha.1` untouched (a range is only
rewritten when you `--save` a different spec). The install log is clean; exit code 0.

Install fails in exactly four cases, none of which is "the declared version is missing":

1. an **exact** spec — `"0.1.2-alpha.1"` (no `^`), `=0.1.2-alpha.1`, or `npm i @deepseek-ai/dsh-llm@0.1.2-alpha.1` →
   `ETARGET` / `E404` "No matching version found";
2. **mirror lag** — a corporate mirror / offline snapshot that has not indexed the satisfying version invents a 404 that
   looks like confirmation of the brief's premise ([R-08] pitfall 1). Always print `npm config get registry` first;
3. peer/engine refusal of the *resolved* version (`ERESOLVE`, `EBADENGINE`) — about alpha.2, not about alpha.1;
4. a range that expands to nothing, e.g. `^0.1.2` on a registry with no stable 0.1.x, or `~0.1.1-rc.2`.

The consequence therefore is **a wrong-but-installed baseline**, not a broken install: the author believes the code is
checked against alpha.1 while it is checked against alpha.2 (or rc.1). Nothing red appears until a type is used that
moved between those tags — and then it appears in bulk as TS2305/TS2614 ([R-11] ledger: `CallId` → `ToolCallId` on the
rc.2 → alpha.1 edge; the alpha.1 → alpha.2 edge deletes `settingsNamespace`, `installSettingsSection`,
`deepEqualJson`, the six `*Preset*Error` classes; alpha.4 removes the `report` tool and replaces `Session.events`).

### 1.3 "Which version" has two layers, and both disagree with the README

- **Layer 1 — the brief's registry snapshot** (`0.1.1-rc.1`, `0.1.1-rc.2`, `0.1.2-alpha.2` only): one candidate
  satisfies the range, so the answer is **`0.1.2-alpha.2`** and it is deterministic. The declaration is off by
  exactly one prerelease — the edge that carries the largest type-surface deletion of the corridor.
- **Layer 2 — the skill's own later registry measurements** (rollup header: `alpha` = `0.1.2-alpha` line, then
  `0.1.3-alpha.2` by 2026-09-07; `next`/`latest` = `0.1.2-rc.1` since 2026-09-03; `0.1.5-alpha.2` "on npm since
  2026-09-09"; the v0.1.3-alpha.1 card records a *version-specific* 404 window, not a permanent gap): alpha.3 and
  alpha.4 were published, and `0.1.2-rc.1` exists. Under that state the same range resolves to the **maximum published
  0.1.2 prerelease** — `0.1.2-rc.1`, or `0.1.2` if the final was released — i.e. the declaration is not one edge off
  but the *whole* 0.1.2 corridor off (five edges, four of them carded as breaking).
- **Both layers agree on the only thing that matters**: the install never lands on `0.1.2-alpha.1`.
- Which layer is true **today** cannot be settled inside this task (no network, no registry query allowed), so Layer 2
  is reported as **unconfirmed** and the plan below is written to be correct under *either*.

### 1.4 Why this is worse than an ordinary devDependency typo

a. **Silent by construction.** `@deepseek-ai/dsh-llm` is a `devDependencies` entry: types are consumed at compile time, the
   runtime module is supplied by the host/profile. A skewed devDependency therefore cannot fail at runtime — it either
   breaks the typecheck (good, loud) or *compiles green against declarations the running host does not have* (bad).
   The declaration is load-bearing precisely because nothing else validates it.
b. **Time-dependent.** The fixture has **no lockfile** (verified: the directory contains only `package.json` and
   `README.md`), so every clone and every CI run re-resolves to whatever the registry holds at that moment. Two
   developers on two days can typecheck against two cohorts while both see a green build.
c. **The README states a guarantee the manifest cannot keep.** "npm install gives you the type baseline" reads as
   "reproducible surface". `^0.1.2-alpha.1` guarantees "some 0.1.2-line surface, at or above alpha.1, chosen by the
   registry at install time" — a different and much weaker statement.
d. **The token, however, is defensible as a floor.** `precision-checklist` §"Peer version floors" explicitly accepts a
   DSH peer floor written as `^0.1.2-alpha.1` "or later within the cohort". So this is a *documentation + pinning*
   defect, not necessarily a malformed range. Any plan that "fixes" the range by downgrading or by stripping the
   prerelease tag is fixing the wrong half.
e. **Peer semantics, if it is ever copied to `peerDependencies`.** From 0.1.7-rc.1 the host enforces peers with
   `semver.satisfies(runtime, range, { includePrerelease: true })` on `semver ^7.8.5` (**DSH-0.1.7-RC1-01**). This
   range behaves correctly there: a `0.1.1-rc.2` host is refused (right), any `0.1.2` prerelease or final is accepted
   (right), and only the `0.2.x` line would need a rewrite.
f. **Not a release hazard here.** Because the package is `private` and the range sits in `devDependencies`, the
   irreversible case of [R-04] ("a tag publishes a package whose `@deepseek-ai/*` ranges cannot resolve") does not
   apply. Keep the escalation proportionate.

### 1.5 What the reader should stop believing

- "Unpublished `alpha.1` ⇒ `npm install` 404s." **False** for a range, true only for an exact spec.
- "Whatever installs is `alpha.2`." True only under the brief's snapshot, and only until the next 0.1.2 prerelease is
  published.
- "The type baseline is alpha.1 because the manifest says alpha.1." The manifest states a *floor*, not a baseline.

## 2. Plan — four workable paths, with tradeoffs and exit paths

All paths are additive to `package.json`/`README.md` plus a lockfile; none changes source code; none requires an
unpublished tarball. Recommended default: **A1**, with **A2** as the acceptable variant when the author wants to keep
the range's intent.

| # | Action | What installs | Pros | Cons | Exit path |
|---|---|---|---|---|---|
| **A1** *(recommended)* | `devDependencies: { "@deepseek-ai/dsh-llm": "0.1.2-alpha.2" }` — exact, no caret — plus commit `package-lock.json`; README naming that exact version | the pinned version, forever | deterministic; drift becomes a visible, reviewable diff; matches `precision-checklist` "exact values, not newer carets"; removes the prerelease-range subtlety from the repo entirely | one manual bump per cohort edge; a later 0.1.2 prerelease needs an edit before use | when `0.1.2` final ships → switch to `^0.1.2` + one lockfile bump |
| **A2** | keep `^0.1.2-alpha.1`, add `package-lock.json`, make CI use `npm ci` | locked version on CI; newest satisfying on a bare `npm install` | one-line change; preserves the floor's intent (any 0.1.2 preview is acceptable) | **still floats** for anyone without a lockfile; silently admits `rc.1`/`0.1.2` and their breaking cards; needs CI discipline that does not exist yet | converge to A1 at the next cohort bump |
| **B** · verify-only, no registry ([R-01] "Verify-only, no install" lane) | keep the *install* baseline at a published version and typecheck with `tsconfig` `paths` pointing at a checkout of the `dsh-v0.1.2-alpha.1` tag | nothing (no install) | the only way to prove the **alpha.1** surface, which is what the README claims; determinism comes from the git tag | needs a git checkout + build; explicitly *not* a runtime lane; more moving parts than the problem deserves | drop the `paths` mapping once the target version is published and A1 is adopted |
| **C** · offline tarball cohort ([R-01] main recipe) | clone the tag, `pnpm install && pnpm run build`, `pnpm -r exec pnpm pack` into a cohort dir, then `overrides` → `file:` tarballs | the exact unpublished cohort, at runtime too | the only path for a genuinely unpublished cohort end-to-end | machine-dependent absolute paths frozen into the lockfile and a missing pnpm store on every runner ([R-04]); pnpm-only; the pnpm-version pin in [R-01] is explicitly *pending confirmation* | delete the `overrides` section once registry resolution is available |
| **D** · host-derived baseline | declare the version read from the target profile (`node -p "require('@deepseek-ai/dsh-llm/package.json').version"`) as both `peer`/`dev` entry | matches the host by construction | eliminates skew by definition; doubles as the §3 check | needs a mounted host before any typecheck; not standalone CI-able | keep as a *verification step* inside A1/A2 rather than the primary mechanism |

**Do not** (anti-patterns, each with its reason):

- write `"0.1.2-alpha.1"` **exactly** → `ETARGET`, the one way to convert this into a real install failure;
- downgrade to `0.1.1-rc.2` and call the job done → a different cohort; the alpha.1/alpha.2 type surface is what the
  plugin actually codes against, and `^0.1.1-rc.2` will not even climb to alpha.2 (§1.1 corollary);
- strip the prerelease tag to `^0.1.2` → refuses every 0.1.2 prerelease and resolves to nothing;
- use a GitHub dependency as a shortcut for a sub-package (`github:deepseek-ai/deepseek-harness#dsh-v0.1.2-alpha.1`):
  the repository is a workspace monorepo and a git dependency installs a root package, not one `packages/**` member, so
  its internal `workspace:` siblings do not resolve — derived from the repo layout, **not executed** (unconfirmed);
- mix package managers, or reuse a `pnpm-lock.yaml` in an npm repo (SKILL step 1: one package manager per resolved
  identity — and here there is no lockfile to inherit, so the choice is still open).

**Concrete A1 diff (not applied — read-only task):**

```json
{
  "name": "dsh-cohort-bench",
  "version": "0.1.0",
  "private": true,
  "devDependencies": { "@deepseek-ai/dsh-llm": "0.1.2-alpha.2" }
}
```

plus README line 3 → state the pinned version and that runtime peers come from the host cohort.

## 3. Verification plan (for the maintainer to run later; nothing was executed here)

1. **Registry truth** — `npm view @deepseek-ai/dsh-llm versions --json` and `npm view @deepseek-ai/dsh-llm dist-tags`;
   `npm config get registry` (rules out mirror lag, [R-08] #1). This single query settles §1.3.
2. **Resolution, write-free** — `npm install --dry-run --json`; confirm the `resolved`/`version` field equals the
   intended pin before any real install.
3. **Post-install coherence** — `npm ls @deepseek-ai/dsh-llm` (one version, no `deduped`/duplicate rows) and
   `node -p "require('@deepseek-ai/dsh-llm/package.json').version"`; per [R-01] verification, no mixed `@deepseek-ai/*`
   cohort anywhere in the tree (`npm ls --depth 0`).
4. **Static** — `npx tsc --noEmit`. If a selector or callback unexpectedly becomes `any`, run one diagnostic pass with
   `skipLibCheck: false` and declare the packages that own the consumed declarations (SKILL step 5).
5. **Runtime (only if the plugin is mounted)** — separate staging profile (`dsh --profile <name> --port 30xx`), never
   the production instance; use the `link:` track for the plugin itself ([R-09]); one message → tool → response round.
6. **Drift watch** — the check that would have caught this originally: in CI, assert that the installed version equals
   the version named in the README.

## 4. Rollback

- **Files owned by this task**: `fixture/package.json` line 5, `fixture/README.md` line 3, and a new
  `package-lock.json`. Nothing else.
- **Baseline recorded**: the fixture is a two-file tree at git HEAD (grading requires it unchanged); no install was
  performed, so there is nothing to uninstall and no `node_modules` to clean. Reverting = restore those two files /
  delete the lockfile.
- **Not promised**: any rollback of side effects from third-party lifecycle scripts, if a future install runs them —
  none were run here.

## 5. Unconfirmed (explicitly not verified in this task)

1. **The registry's current contents and therefore the version that resolves today** — no network, no `npm view`
   (forbidden). Layer 1 (alpha.2) comes from the brief; Layer 2 (≥ alpha.3/alpha.4 on `alpha`, `0.1.2-rc.1` on `next`)
   comes from the skill's dated measurement records, not from a live query.
2. **Dist-tag mapping today** (`latest` / `next` / `alpha`) — quoted from dated skill records only.
3. **Whether `0.1.2` final was released** — would change the resolved version to `0.1.2`.
4. **Whether `0.1.2-alpha.2` declares `engines` or `peerDependencies` that would refuse this Node/npm combination** —
   an `EBADENGINE`/`ERESOLVE` risk on the resolved version is plausible and untested.
5. **The real repository's package-manager and lockfile policy** — the fixture is only a two-file extract.
6. **Monorepo git-dependency behaviour** (§2 anti-pattern) — derived from workspace layout, not executed.
7. **Whether the real plugin source consumes any alpha.1-only export** — no source was supplied, so the size of the
   actual type break cannot be measured here; only the corridor's carded breaks can be cited ([R-11], alpha.1→alpha.2
   ledger).

## 6. Skipped (with evidence)

- **Install / registry query / git / build / lifecycle scripts** — prohibited by the brief and by SKILL safety
  boundaries. No `node_modules` created; `fixture/` byte-identical.
- **Baseline test suite** — *not collected*: the fixture ships no `src/`, no scripts, and Mode A does not run package
  scripts.
- **`plan-migration.mjs`** — not run: zero source files, so the touchpoint planner has nothing to scan; its output
  would be empty by construction, not by evidence.
- **Web Client / runtime layers** — not applicable: the fixture is a manifest-only, `private` package with no
  composition, no `dsh.client` block, and no profile.

## 7. Recommendations

1. **Pin, then document.** Adopt A1 and make the README state the pinned version. A type baseline that is described as
   "whatever npm gives you" is not a baseline.
2. **Commit a lockfile** in the real repository, and use `npm ci` in CI — this is the only durable defence against the
   corridor's moving maximum.
3. **Keep the floor shape for peers.** If `@deepseek-ai/dsh-llm` ever moves to `peerDependencies`, keep a prerelease
   tag in the floor on the target tuple (**DSH-0.1.7-RC1-01**); `^0.1.2-alpha.1` is the correct shape there.
4. **Re-read the corridor before bumping.** Any move off alpha.1 must go through the edge cards rather than a version
   guess — the alpha.1 → alpha.2 edge alone deletes `settingsNamespace`, `installSettingsSection`, `deepEqualJson`
   and the `*Preset*Error` classes ([R-11]; the alpha.2 API ledger), and alpha.4 replaces `Session.events`.
5. **Add the drift assertion** of §3.6 — one line in CI, and this class of bug cannot recur silently.

## 8. 中文摘要（要点）

- `^0.1.2-alpha.1` 是**区间**不是精确版本，展开为 `>=0.1.2-alpha.1 <0.2.0-0`；下界本身带 prerelease 且元组为 0.1.2，
  按 npm 的预发布匹配规则，同元组的预发布版本被允许 → **安装不会失败**。
- 实际装到的是该区间内已发布的最高版本：按题面快照为 `0.1.2-alpha.2`；按 skill 中更晚的登记记录，
  可能已是 `0.1.2-rc.1`（若最终版发布则为 `0.1.2`）。**永远不会是 alpha.1**。
- 真正的问题是"静默的类型基线错位"：devDependencies 只影响类型，运行时包由宿主提供；再加上仓库**没有 lockfile**，
  每次安装都会随注册表漂移，而 README 把"某个 0.1.2 预览面"说成了稳定的基线。
- 方案：A1（精确钉版本 + 提交 lockfile + README 写明版本）为首选；A2（保留区间 + lockfile + `npm ci`）次选；
  B/C 为"确需 alpha.1 本身"时的离线/纯类型校验兜底；D 作为校验手段而非主方案。
- 不要做：精确写 `0.1.2-alpha.1`（必然 ETARGET）、降级到 rc.2、去掉 prerelease 标签、用 git 依赖取 monorepo 子包。

---
*Card IDs cited: [R-01], [R-04], [R-08], [R-09], [R-11], DSH-0.1.7-RC1-01, DSH-0.1.3-A1-07, the v0.2.0-rc.1 card,
and `references/precision-checklist.md` §"Peer version floors". Only IDs and conclusions are referenced; no card text
is reproduced.*


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.