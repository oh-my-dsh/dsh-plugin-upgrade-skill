# S7 · Unpublished Cohort Install Plan — `@deepseek-ai/dsh-llm: ^0.1.2-alpha.1`

**Mode:** Mode A · inspect (read-only) → report only. No file under `/app/fixture/` was modified; **no install was run**.
**Fixture:** `dsh-cohort-bench@0.1.0` (`"private": true`, no source, no lockfile, no `dsh-plugin.json`, no `cordis.patch.yml`).
**Declared line under analysis:** `devDependencies: { "@deepseek-ai/dsh-llm": "^0.1.2-alpha.1" }`.
**Skill used:** `plugin-upgrade` (Mode A inspect). Primary sources: the skill's own version cards and the rollup, cited by ID below.

---

## 0. Headline answer

| Question | Answer |
|---|---|
| Will `npm install` fail? | **No — not because `alpha.1` is missing.** The caret range `^0.1.2-alpha.1` resolves to `>=0.1.2-alpha.1 <0.2.0-0`, and npm does **not** require the exact lower bound to exist. It installs the highest published version that satisfies the range. |
| Which version actually gets installed? | **`0.1.2-alpha.2`** under the npm reality stated in the brief (only `0.1.1-rc.1`, `0.1.1-rc.2`, `0.1.2-alpha.2` published). See §2.3 for registry-state sensitivity. |
| So is the declaration broken? | **Yes — but silently, and not where it looks.** It installs a *different* cohort than declared. The "never published" fact is a **red herring for the install step**; the real damage is that the declared floor (`alpha.1`) and the resolved floor (`alpha.2`) are **different API generations**, and the plugin compiles against neither in CI. |
| Is the README claim true? | **No.** "npm install gives you the type baseline" is false as written: npm gives you `0.1.2-alpha.2`, not the `alpha.1` baseline the manifest names. The declaration misstates its own intent. |

> **The headline correction to the brief's framing:** the brief asks "will install actually fail, and which version will actually be installed?" — the honest answer is *it will not fail, and it will silently install a version you did not declare*. The failure mode is **silent cohort drift**, not an install error. A report that only said "E404, alpha.1 missing" would be wrong.

---

## 1. What was actually inspected (read-only)

| Artifact | Read | Result |
|---|---|---|
| `fixture/package.json` | yes | 6 lines; `name: dsh-cohort-bench`, `version: 0.1.0`, `private: true`, one `devDependency`. No `peerDependencies`, no `dependencies`, no `engines`, no `packageManager`, no `scripts`, no lockfile. |
| `fixture/README.md` | yes | 3 lines; states the npm reality and the "npm install gives you the type baseline" claim; marks itself test-only, not to be executed/published. |
| `skills/plugin-upgrade/SKILL.md` | yes | Mode A/B/C selection; safety boundaries; validation & report structure. |
| `references/rollup-0.1.2.md` | yes | **R-01** (unpublished cohort), **R-02** (cross-cohort coexistence), **R-04** (CI/release coupling), **R-06** (baseline attribution), **R-08** (three install-channel pitfalls), **R-09** (`link:` track), **R-11** (type-surface export drift), **R-12** (host-self safety). |
| `references/v0.1.2-alpha.1.md` | yes | 28 cards; **DSH-0.1.2-A1-25** (client-runtime removal; "point type dependencies at the official source checkout with `link:`, or use tarball `overrides` per R-01" while the cohort is unpublished). |
| `references/v0.1.2-alpha.2.md` | yes | 8 cards; **DSH-0.1.2-A2-02 / A2-03 / A2-08 / A2-10** (Remote error vocabulary; peer trimming & adding; `sessionProjections` required inject+peer; `settingsNamespace` removal). |
| `references/v0.1.3-alpha.1.md` | yes | 8 cards; **DSH-0.1.3-A1-07** (unpublished-cohort source-launch recipe). |
| `references/v0.1.7-rc.1.md` | yes | **DSH-0.1.7-RC1-01** (peer ranges enforced at install and startup; the published semver matrix). |
| `references/precision-checklist.md` | yes | Peer floors; "peers are a superset of inject"; the `skipLibCheck: false` diagnostic; citation contract (`R-01` whenever the cohort is touched). |
| `references/pre-flight.md` | yes | §0 config/dependency inventory; §1 corridor construction; §1.5 ghost host. |
| `scripts/plan-migration.mjs` | **run** (read-only) | `--from dsh-v0.1.1-rc.2 --to dsh-v0.1.2-alpha.2`: 1 file scanned, **0 hits in all 7 touchpoint classes**. |
| `scripts/inject-lint.mjs` | **run** (read-only) | `verdict: FIX-REQUIRED` — but see §5.2: the cause is the missing `@deepseek-ai/cordis@^4.0.1` peer, **not** a residue bug. |
| `fixture-seal.pre.json` / `.source.json` | yes | Both identical; the fixture was re-hashed at the end — **both SHA-256 digests match the seal exactly** (README `b4a1f0ef…`, package.json `73b215c4…`). Fixture unchanged. |

Not consulted: any path outside the cell directory. The live host was **not** probed (no `dsh --version`, no `cordis_inspect_*`) — it runs a different generation than this task targets, so its facts would be misleading.

---

## 2. Consequence analysis — the real consequence

### 2.1 Caret expansion

node-semver's caret on a `0.x.y` version is **minor-locked**: `^0.1.2-alpha.1` expands to

```
>= 0.1.2-alpha.1  &&  < 0.2.0-0
```

The lower bound **keeps its prerelease tag**. (The semver >= 7.8.3 "caret change" documented in DSH-0.1.7-RC1-01 — where a caret bound with no prerelease loses the `-0` suffix and stops admitting prereleases — **does not apply here**, because this bound *does* carry a prerelease. That card's rule is about `^0.1.7`, not `^0.1.2-alpha.1`.)

### 2.2 The prerelease-admission rule (the part that decides everything)

node-semver's rule is **set-based, not per-comparator**: a prerelease version is admitted only if **some comparator in the same set** has the *same* `[major, minor, patch]` tuple **and** carries a prerelease. Here the set is `{>=0.1.2-alpha.1, <0.2.0-0}`; the lower comparator has tuple `[0,1,2]` and carries a prerelease. Therefore:

> **Every published `0.1.2-x` prerelease is admitted by `^0.1.2-alpha.1`, and every `0.1.1-x`, `0.1.3-x`, and stable `0.1.x` is rejected.**

The two published `0.1.1-rc.*` versions are rejected on **tuple grounds** (`[0,1,1] != [0,1,2]`), *not* because of any prerelease rule. This is exactly the mechanism the skill documents in R-08 ("the comparator must share the same tuple and carry a prerelease").

### 2.3 Which version actually installs

Resolution picks the **highest published version satisfying the range** — it never requires the lower bound to exist:

| Registry state | Highest satisfying `^0.1.2-alpha.1` | Outcome |
|---|---|---|
| **Brief's stated reality** (`0.1.1-rc.1`, `0.1.1-rc.2`, `0.1.2-alpha.2`) | **`0.1.2-alpha.2`** | install **succeeds**, silently on the wrong cohort |
| Later registry per the skill's rollup (adds `alpha.3/.4/.5`, `0.1.2-rc.1`) | `0.1.2-rc.1` | install succeeds on a *newer* cohort |
| A stable `0.1.7` exists | `0.1.7` | install succeeds on a *much* newer cohort |
| Only `0.1.1-rc.1`/`0.1.1-rc.2` published (hypothetical) | **none** | **E404/ETARGET — the only case where install actually fails** |

**Conclusion: install does not fail.** `alpha.1` never being published is *not* what breaks this. What breaks this is that the range's floor is a *floor*, and npm silently floors you on something else.

### 2.4 Why the resolved version is still wrong

`0.1.2-alpha.1` and `0.1.2-alpha.2` are **different API generations**, and the delta between them is precisely carded:

- **DSH-0.1.2-A2-02** (breaking) — Remote failures become `RemoteError` instances; error codes gain namespaces (`session-not-found` -> `session/not-found`, `internal` -> `gateway/internal`, `cancelled` -> `gateway/cancelled`, `bad-request` -> `gateway/bad-request`); `RemoteStreamError` / `TypertRemoteFailure` / `TypertLookupFailure` removed.
- **DSH-0.1.2-A2-03** (behavior) — npm packages trim peers; consumers of moved-out type packages must declare them directly. Its field note is the trap: **with `skipLibCheck: true`, a missing package does not error — it silently turns selectors/callbacks into implicit `any`.**
- **DSH-0.1.2-A2-08** (breaking) — `sessionProjections` becomes a *required* inject and peer for `dsh-agent`, `dsh-agent-loop`, `dsh-tool-subagent`, `dsh-terminal-bash`, `dsh-tool-todo`. The card is explicit that a missing peer **does not show up as a typecheck error** — it shows up as a runtime `pending (waiting for service: sessionProjections)`.
- **DSH-0.1.2-A2-10** (breaking) — `settingsNamespace()` deleted from `dsh-settings`; TS2724 on import.
- **R-11** (type-surface export drift) — `deepFreeze` / `assertNever` leave `@deepseek-ai/dsh-llm` for `@deepseek-ai/dsh-util-values`; `CallId` -> `ToolCallId`; `LlmModelDiscoveryError` -> `RemoteError<'llm/model-discovery-rejected'>`.

**`@deepseek-ai/dsh-llm` is directly hit by this drift** — the exact package the fixture declares. `CallId` -> `ToolCallId` is an `rc.2 -> alpha.1` change, so it is *already* in effect at the resolved `alpha.2`; `deepFreeze` / `assertNever` -> `dsh-util-values` is an `alpha.1 -> alpha.2` change, i.e. **exactly the edge the fixture straddles**.

### 2.5 The remaining, unstated failure: the peer floor

On hosts from `0.1.7-rc.1` onward, DSH peer ranges are **enforced at install and at startup** (DSH-0.1.7-RC1-01): the check is `semver.satisfies(runtime, range, { includePrerelease: true })`, and a refused row is **silently disabled at boot** (`dsh: disabling profile plugin row "<id>"`), while **`--dump-config` still prints the row** — so a dump-based check gives a false green.

The fixture declares the floor in `devDependencies`, not `peerDependencies`. Per DSH-0.1.7-RC1-01's inventory rule, **only `peerDependencies` keys named `@deepseek-ai/dsh*` are checked** — so *this* manifest is not itself refused. But a plugin that ships to a profile and declares `peerDependencies: { "@deepseek-ai/dsh-llm": "^0.1.2-alpha.1" }` is admitted on `0.1.2-alpha.2` ... `0.1.7-rc.1` and **REFUSED on `0.2.0-rc.1`** (verified against that card's own published matrix; the model described in §3 reproduces all its documented cases).

### 2.6 The README claim, adjudicated

> "npm install gives you the type baseline"

**False as written**, for three separate reasons:

1. **It gives a different version than declared** (§2.3) — the baseline you get is `alpha.2`, not `alpha.1`.
2. **It gives a *floating* baseline.** The same manifest resolves to `alpha.2` today and `0.1.2-rc.1` / `0.1.7` once those are published. A "type baseline" that moves under you is not a baseline — it is an unpinned dependency. The README promises a reproducible type surface; the manifest provides a moving one.
3. **`devDependencies` are not published to consumers** (DSH-0.1.2-A2-03 field note). So "npm install gives you the type baseline" is only true for *this* repository, and only for whoever happens to run it — not for anyone consuming the plugin.

---

## 3. Verification method (read-only, reproducible)

I did **not** run an install. The semver reasoning was validated by implementing node-semver's comparator-set semantics locally and **checking it against the skill's own published matrix** — the case table in **DSH-0.1.7-RC1-01** (runtime `0.1.7-rc.1`, `semver ^7.8.5`, `includePrerelease: true`).

**Model fidelity: every documented case reproduced** — 7 refused and 13 admitted, with no mismatch. (The card's empty-string row is listed as refused without a spelled-out range, and is not used as evidence here.) The model also reproduces the skill's independent **R-08 control**: `^0.1.0-rc.8` does **not** match `0.1.2-alpha.2` — the exact tuple-and-prerelease rule the rollup states.

Two independent implementations were used (a set-based one and a per-comparator one); they agree on every decision that matters here, and the set-based one is the one validated against the card, because node-semver's rule is set-based.

**Model self-check (semver >= 7.8.3 caret change handled):** a caret lower bound keeps its `-0` suffix only when it has no prerelease; the validated model reproduces the card's `^0.1.7` -> `>=0.1.7 <0.2.0-0` refusal and the `^0.1.7-0` admission.

---

## 4. Installation / type-baseline plan

All paths below are **plans**; none was executed. Each names its exit path and its rollback.

### Path A — Pin the floor to what the registry actually has (recommended default)

**Change:** `devDependencies: { "@deepseek-ai/dsh-llm": "^0.1.2-alpha.2" }`.

- **Why:** `^0.1.2-alpha.2` is the *published* floor. It still floats within `0.1.2-x`, but it never crosses an API edge without a deliberate bump, and it never silently drops to a cohort you did not review. It also matches the skill's own guidance in R-08 ("when bumping cohorts, explicitly rewrite it to `^0.1.2-alpha.2`") and the precision checklist's peer-floor rule.
- **Tradeoff:** still floats across `alpha.3/.4/.5` and `rc.1`. If you want immutability, use Path B.
- **Exit path:** when a cohort is published that you have reviewed, bump the floor to that cohort and re-run the corridor.
- **Rollback:** restore the previous `package.json` line; the range is the only artifact touched.
- **Companion work:** the `alpha.1 -> alpha.2` API delta (§2.4) must be reviewed *even though* the resolved version was already `alpha.2`. **The install was never the gate here — the code review is.** Specifically: `RemoteResult` error handling, `dsh-util-values` for `deepFreeze` / `assertNever`, and `sessionProjections` as an inject + peer.

### Path B — Pin exactly (maximum reproducibility)

**Change:** `devDependencies: { "@deepseek-ai/dsh-llm": "0.1.2-alpha.2" }` (exact pin).

- **Why:** the only option where "npm install gives you the type baseline" becomes *literally true* — the same declarations every time, on every machine, in CI and on a contributor's laptop.
- **Tradeoff:** a strict pin in a *library* is hostile to consumers; in a *type-baseline devDependency* it is the norm. If this package is ever published, keep the exact pin in `devDependencies` and express the *runtime* contract in `peerDependencies` with a range.
- **Exit path:** an explicit, reviewed bump.
- **Rollback:** one-line restore.
- **Note:** DSH-0.1.7-RC1-01's matrix shows an **exact prerelease pin is refused** by a `0.1.7` host's peer check — that applies to `peerDependencies`, not to `devDependencies`. Do not copy an exact pin into peers.

### Path C — Source/tarball override for a cohort the registry lacks (only if a *specific* unpublished cohort is genuinely required)

**Use when:** you need the **alpha.1** API surface specifically, and no published version will do.

- **Recipe (R-01):** build from the official tag in an isolated worktree, `pnpm pack` the cohort, and point the range at `file:` tarballs via `overrides`. Or, for types only, point at the source checkout with `link:` — the approach DSH-0.1.2-A1-25 prescribes verbatim: *"While the cohort is unpublished, point type dependencies at the official source checkout with `link:`, or use tarball `overrides` per R-01."*
- **Tradeoffs, and they are real:** R-01's own note is that the `pnpm@11.9.0` field report is **not reproduced** elsewhere and the suggested `packageManager: pnpm@11.24.0` pin needs a **minimal reproduction in the target repository** before you trust it. R-04 adds that a frozen lockfile with tarball overrides records **machine-dependent absolute paths**, so CI runners need a materialized tarball store and a cache keyed on the workspace hash. This path buys cohort fidelity and pays in reproducibility and CI complexity.
- **Verification (R-01):** `pnpm list --depth 0 | grep @deepseek-ai` must show the target version for every row, with no mixture.
- **Exit path:** delete the `overrides` block once the cohort ships — the manifest returns to registry resolution unchanged.
- **Rollback:** restore the manifest + lockfile; R-04 notes tarball-overrides rollback touches only the paths this task owns.

### Path D — Keep the npm baseline, cover the alpha cohort with wide peers (the community multi-repo pattern)

**Use when:** the plugin must run on an alpha host **and** on the current installable baseline, and you cannot ship an unpublished cohort to users.

- **Shape (per the skill's 07-multi-repo example):** keep `devDependencies` on the **npm release line** so `npm install` works on any machine, and express the alpha cohort through a **wide peer range** (`>=0.1.2-alpha.2 <0.2.0`, or `^0.1.0 || ^0.2.0-rc.1` if a `0.2.0` host is in scope) rather than a narrow prerelease floor.
- **Tradeoff:** wide peers mean the *runtime* may be a cohort you never type-checked against — that is the point of the dual-compatibility pattern (R-02 and example 04): make the call a **superset** both cohorts accept, and probe injected services at the use site instead of hard-requiring them, because an rc.2 host will otherwise leave the entry permanently `pending (waiting for service: ...)`.
- **Exit path:** tighten the peer range as cohorts land and are reviewed.
- **Rollback:** one-line peer restore.

### Path E — Read-only source-lane typecheck, without touching the install baseline (the lightest verification lane)

**Use when:** you only need to *prove* the type surface at a cohort, without changing what the package installs.

- **Shape (R-01, "Verify-only, no install" lane):** keep the install baseline at the published cohort; in CI, check out the upstream tag and run `tsc --noEmit` with the `paths` mapping from the upstream `tsconfig.base.json` pointing at the source.
- **Tradeoff:** proves the type surface only — it does **not** prove runtime. The skill is explicit that runtime is verified separately, and that all-green static checks do not prove the wire contract.
- **Exit path:** fold the result into a normal release gate once the cohort is published.
- **Rollback:** CI-only; nothing in the package changes.

### 4.1 Recommended sequencing

1. **Decide the target cohort** (the whole plan forks here). The fixture's own text says alpha.1 was never published — so "keep alpha.1" is not a choice that exists; the real question is **`alpha.2` (published) or a newer published cohort, or a source-built unpublished one**.
2. **Apply Path A or B** (both are one-line manifest edits: no install of an unpublished cohort, no CI rework).
3. **Review the `alpha.1 -> alpha.2` API delta** — the resolved version was *already* `alpha.2`, so this work is **owed today regardless** of the manifest fix. Cite DSH-0.1.2-A2-02 / A2-03 / A2-08 / A2-10 and R-11.
4. **Run the layered validation** (rollup checklist) — dependency resolution, static, card-level tests, one real cold boot with a message -> tool -> response round, plus a headless comparison if #7 is hit.
5. **Only then** consider Path C / D / E, and only if the cohort you actually need is unpublished.

### 4.2 Exit paths (how to leave each path)

| Path | Exit trigger | Exit action |
|---|---|---|
| A | a reviewed cohort is published | bump the floor; re-run the corridor |
| B | a reviewed cohort is published | bump the exact pin; re-run the corridor |
| C | the cohort ships to npm | delete `overrides`; return to registry resolution |
| D | alpha cohort stabilizes | narrow the peer range to the reviewed cohort |
| E | cohort ships | fold into the normal typecheck gate |

**Rollback for all paths:** the only files in scope are `package.json` (and, for Path C, the lockfile). Record the pre-change manifest hash, restore it, re-resolve. No third-party lifecycle-script side effects are promised rollback for (rollup Rollback §4).

---

## 5. Explicitly unconfirmed

Per the brief: anything not verifiable from the brief + fixture + mounted skill is marked **unconfirmed**, not guessed.

| Item | Status | Why |
|---|---|---|
| Whether the registry *currently* serves `0.1.2-alpha.2`, or a later `0.1.2-x` / stable `0.1.x` | **unconfirmed** | No network access and no install performed. §2.3 gives the resolution **as a function of registry state**; the version table in the brief is the assumed input. |
| The exact npm error text if the range matched nothing | **unconfirmed** | Never triggered — under the brief's stated registry the range *does* match. |
| Whether the plugin has source at all | **unconfirmed** | The fixture ships only `package.json` + `README.md`. No `src/`, no `tsconfig`, no `scripts`, no lockfile, no `dsh-plugin.json`, no profile composition. Any claim about *its* code touching the `alpha.1 -> alpha.2` API surface is therefore **not verifiable** — §2.4 is a statement about the **packages**, not about this plugin's code. |
| Whether the plugin is published, and to which profile it is installed | **unconfirmed** | Nothing in the fixture states an install track. |
| Whether the plugin declares `peerDependencies` in its real (non-fixture) form | **unconfirmed** | The fixture has none; §2.5 analyses the *peer* case conditionally. |
| The `0.1.1-rc.1` / `0.1.1-rc.2` -> `alpha.1` API delta as it would apply to this plugin | **unconfirmed** | No source to diff; the corridor cards are the only available evidence. |
| Whether `0.1.3-alpha.1` (or any `0.1.3+` `@deepseek-ai/dsh-llm`) is published | **unconfirmed** | The skill's rollup tracks the *umbrella* `@deepseek-ai/dsh` and the `0.1.3` line; it does not state a per-package `dsh-llm` version list. §2.3's "later registry" row is therefore a **conditional**, not a claim. |
| pnpm 11.9.0 vs 11.24.0 override behaviour (R-01) | **unconfirmed** | R-01 itself flags it as a single unreproduced field report requiring a local minimal reproduction. |
| Real cold-boot / runtime behaviour of this plugin | **unconfirmed** | No install, no host, no profile — and the installed host runs a different generation than this task targets. |
| The `dsh-client-runtime` / client-plane questions (A1-25, A1-26, A1-27, A1-29) | **not applicable here** | The fixture is a Host-plane type-baseline package with no client half; **0 touchpoint hits** in all 7 classes. Recorded as Skipped, not Pending. |

### 5.2 Note on the `inject-lint` verdict

`inject-lint` returned `FIX-REQUIRED` for the fixture. Reading the script's own logic, the cause is `cordis !== '^4.0.1'` — i.e. the fixture has **no `@deepseek-ai/cordis` peer at all** — and not a residue or inject problem: `runtimeRefsLeft`, `peersMissingForInject`, `peersMissingForImports` and `rawWebServerRouteFiles` are all empty. So the verdict is a **missing-peer-floor signal**, consistent with the precision checklist's peer rules, and it is an argument for adding a `peerDependencies` block (Path B/D) rather than evidence of a broken import. **No `dsh-client-runtime` residue exists** — that check is clean.

---

## 6. Report (skill's required structure)

- **Pre-existing (baseline):** **not collected** — Mode A is read-only; no mechanical suite was run, and running it would require an install, which the brief forbids. The fixture has no `scripts` to run. (R-06's baseline procedure is therefore **pending** for whoever executes this plan.)
- **Completed:** read-only analysis of the declared range; semver model built and **validated against DSH-0.1.7-RC1-01's own published matrix** and the R-08 control; consequence analysis (§2); five workable paths with tradeoffs and exit paths (§4); unconfirmed list (§5); `plan-migration.mjs` and `inject-lint.mjs` run read-only from the cell-local copy.
- **Skipped:** all 7 touchpoint classes — **0 hits** (`plan-migration.mjs`, rc.2 -> alpha.2). Client-plane cards (A1-25 / A1-26 / A1-27 / A1-29) — no client half. `verify-runtime.mjs` — **not read-only**; it installs and executes plugin code, which the brief forbids. `ghost-host-check.mjs` — probes a live host, which the brief forbids and which would be out of generation.
- **Pending / residual risk:** the `alpha.1 -> alpha.2` API drift (§2.4) is **owed today** — the resolved version was already `alpha.2`; a missing peer surfaces as a runtime `pending`, not a typecheck error (DSH-0.1.2-A2-08); with `skipLibCheck: true`, a missing declaration surfaces as **implicit `any`** rather than an error (DSH-0.1.2-A2-03) — run the diagnostic with `skipLibCheck: false`; `--dump-config` cannot detect a peer denial (DSH-0.1.7-RC1-01) — assert on **boot stderr** and **install exit code** instead; R-01's pnpm pin is unreproduced.
- **Rollback:** the manifest line is the only artifact (plus the lockfile for Path C). Pre-change manifest hash: `package.json` SHA-256 `73b215c4e9632a8a3d7b7b29bd659aaa42e0e799f3e3d64b666b8cb9f2be1b4e` — recorded and **unchanged**.
- **Recommendations:** (1) fix the range first, then the README; (2) state the cohort **and the exact version** in the README, and say plainly that the baseline is *pinned*, not "whatever npm gives"; (3) publish the type baseline as an **exact** pin in `devDependencies` and express the runtime contract as a **wide** `peerDependencies` range (Path B + Path D) — this is the shape that satisfies DSH-0.1.7-RC1-01's peer enforcement and R-02's cross-cohort coexistence at the same time; (4) add a CI lane that fails when the resolved `@deepseek-ai/*` version differs from the declared floor (R-01's verification: `pnpm list --depth 0 | grep @deepseek-ai` shows one consistent cohort, no mixture); (5) run the `inject-lint` peer check once `peerDependencies` exist.

### 6.1 The one-line correction the README needs

Current: *"npm install gives you the type baseline."*

Proposed: *"The type baseline is pinned: `@deepseek-ai/dsh-llm@<exact-version>`. `npm install` reproduces it exactly. `@deepseek-ai/dsh-llm@0.1.2-alpha.1` was never published to npm, so an unpinned `^0.1.2-alpha.1` range would have silently resolved to a different cohort."*

---

## 7. One-paragraph answer

`^0.1.2-alpha.1` expands to `>=0.1.2-alpha.1 <0.2.0-0`. Because the lower bound carries the prerelease tag and shares the `[0,1,2]` tuple, node-semver admits **every** published `0.1.2-x` prerelease and rejects the `0.1.1-rc.*` versions on tuple grounds. npm resolves to the **highest satisfying published version** and never requires the floor to exist — so **the install does not fail; it silently installs `0.1.2-alpha.2`** (the brief's registry state), not the `alpha.1` the manifest names. The real damage is therefore *not* a missing package but **silent cohort drift**: the declared and resolved floors are different API generations (DSH-0.1.2-A2-02 / A2-03 / A2-08 / A2-10, R-11), and the "npm install gives you the type baseline" claim is false because the range floats, because `devDependencies` never reach consumers, and because the resolved version is not the declared one. The workable plan is to **pin the floor to a published cohort** (Path A `^0.1.2-alpha.2`, or Path B an exact pin for a literally reproducible baseline), then **pay the `alpha.1 -> alpha.2` API-review debt that the install already incurred** — and only if a genuinely unpublished cohort is required, fall back to R-01's source / `link:` / `overrides` recipe (Path C) or the wide-peer dual-cohort pattern (Path D), each with a documented exit path back to registry resolution.

---

*Report generated read-only. Fixture SHA-256 digests re-verified against `fixture-seal.pre.json` — both match; the fixture is unchanged. No install, no network call, no host introspection was performed.*
