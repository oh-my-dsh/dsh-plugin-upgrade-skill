# JUDGE BRIEF · skill.S8-release-routing-trap

## Criteria (sealed rubric)
- [missing-mirror-tag] (20pt) Use ls-remote-tags.txt and sync-script.sh to explain that the README-pinned v0.9.5 is absent from the public mirror because the script pushes HEAD:main but not tags. Tie this to attempt 1 resolution failure, rather than guessing a network fault, consumer typo or missing npm package. Mere tag/version mentions earn no credit.
- [runtime-compatibility-direction] (20pt) Use dsh-version.txt (0.1.1-rc.2) and compat-table.md (v0.9.7 targets 0.1.2-alpha.1) to explain attempt 2: a newer-client-API artifact on an older runtime lacks the expected useConversation seat. Successful installation/restarting does not establish API compatibility. Explain the direction rather than only repeating the error.
- [frozen-runtime-remedy] (20pt) Honor the production freeze: select v0.9.3 using its rc.1 verification and the supplied additive rc.2 compatibility note. Notice v0.9.3 is ALSO absent from the mirror listing. Provide the consumer install command pinning #v0.9.3 after maintainer tag publication, or a reachable verified v0.9.3 commit as a conditional alternative. Do not invent a SHA, assume an unreachable commit resolves, require upgrading DSH, or present the absent tag as immediately installable.
- [tag-distribution-repair] (20pt) Propose explicit release-tag distribution to every public mirror, grounded in the branch-only sync script, and verify the documented tags resolve. Non-forced git push <remote> <tag> or --tags are equivalent. Branch synchronization alone is insufficient; a bare --tags keyword does not establish the repair.
- [version-routing-docs] (20pt) Prevent the second defect by routing README install commands according to the consumer DSH version: rc.2 users get the verified v0.9.3 artifact, alpha.1 users can use v0.9.7. Include a runtime version check or explicit compatibility matrix/branches. A single newest-tag default or restarting advice does not satisfy this requirement. Do not generalize support to every untested future alpha release.

## Caps (score ceilings; judge returns each with triggered true/false)
(none)

## Candidate report(s)
#### FILE: S8-release-routing-trap/S8-release-routing-trap.md

# S8 · Release Routing Trap — Release-Engineering Diagnosis

**Subject**: community plugin `@org/dsh-ui-progress`, two-stage consumer failure
**Consumer runtime**: `dsh --version` → **`0.1.1-rc.2`** (frozen; production freeze, no host upgrade possible)
**Install source**: `github:public-org/dsh-ui-progress` (public GitHub mirror)
**Mode**: read-only diagnosis (plugin-upgrade Mode A · inspect). Nothing in `fixture/` was modified; no migration, install, or publish was executed.

---

## 0. Verdict in one table

| | Attempt 1 — `#v0.9.5` | Attempt 2 — `#v0.9.7` |
|---|---|---|
| Observed | pnpm fails **immediately** | install **succeeds**, then slot entry crashes: `TypeError: useConversation is not a function` |
| Defect class | **Release/tag distribution** — a documented tag does not exist on the mirror | **Version routing** — the artifact installed targets a *newer* DSH host than the consumer runs |
| Root cause | README default pin `#v0.9.5` is a **dangling ref**: `git ls-remote --tags` on the mirror lists `v0.9.0, v0.9.1, v0.9.7` — no `v0.9.2`…`v0.9.6`. The release sync script pushes `HEAD:main` only and **never pushes tags**, so the mirror's tag set is incomplete by construction, and nothing verifies that doc-referenced tags exist per mirror | `v0.9.7` is built for **`dsh-v0.1.2-alpha.1`** ("migrated to the alpha.1 client API — `views`/`legacy` projection + `useConversation` seat"). The consumer runs **`0.1.1-rc.2`**, whose client API has **no `useConversation` seat** (and no `views` projection). The imported binding is `undefined` on rc.2 → call throws |
| Fix direction | publish/verify the tag (maintainer) | route by **compatibility**, not by **recency** (docs + consumer) |
| Remedy for the consumer now | `dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.1'` | same command — see §4 |

**The two failures have two distinct root causes.** The maintainer's "bump the README to the newest tag" response treated a *distribution* defect as a *staleness* defect. That made the immediate failure disappear and converted it into a **silent runtime incompatibility** — strictly worse for the consumer, because it now fails in the browser instead of at install time.

---

## 1. Evidence base (read-only)

All facts below come from `fixture/` plus the read-only `plugin-upgrade` skill reference at
`E:deepseek-harnessdsh-plugin-upgrade-skillskillsplugin-upgrade`.

| Fixture file | Content used |
|---|---|
| `fixture/dsh-version.txt` | `$ dsh --version` → `0.1.1-rc.2` — the consumer's actual runtime |
| `fixture/ls-remote-tags.txt` | `git ls-remote --tags https://github.com/public-org/dsh-ui-progress.git` (annotated tags dereferenced, ascending): `v0.1.0, v0.2.0, v0.3.0, v0.4.0, v0.5.0, v0.5.1, v0.6.0, v0.7.0, v0.8.0, v0.9.0, v0.9.1, v0.9.7` |
| `fixture/compat-table.md` | `v0.9.3` ↔ `@deepseek-ai/dsh@0.1.1-rc.1` (rc.1 real-boot verified; rc.2 = rc.1 + image preprocessing, additive) · `v0.9.7` ↔ `dsh-v0.1.2-alpha.1` (migrated to the alpha.1 client API: `views`/`legacy` projection + `useConversation` seat) |
| `fixture/sync-script.sh` | post-release mirror sync: `for remote in origin public mirror2; do git push --force-with-lease "$remote" HEAD:main; done` — **branch only, no tag push** |
| `fixture/README.md` | static evidence pack; the attempt-2 crash symptom is quoted in the task brief, not shipped as a log |

Corroborating skill references (secondary, read-only):
`references/v0.1.1-rc.2.md` (DSH-0.1.1-R2-01/02/03), `references/v0.1.2-alpha.1.md`
(DSH-0.1.2-A1-03 / A1-25 / A1-26), `references/rollup-0.1.2.md` (R-02, R-08),
`references/troubleshooting.md`, `examples/06-real-world-batch-migration.md`.

> **Scope note.** `examples/06-real-world-batch-migration.md` cites a `plugin-release` skill
> ("§8 版本路由 / §9 文档引用的每个 tag 必须存在于每个镜像 / §10 更新提示词自足性") and a
> "profile dependency management recipe (#67)". Those documents are **outside my allowed read
> paths**, so they are cited here only as second-hand pointers, never as verified primary
> evidence. Everything asserted as fact above is backed by the fixture or by
> `skills/plugin-upgrade/`.

---

## 2. Attempt 1 — why `#v0.9.5` could not resolve

### 2.1 The mechanical fact

The README's default install command pins `#v0.9.5`. The mirror's authoritative tag listing
contains **no `v0.9.5`**:

```
v0.9.0
v0.9.1      ← newest tag below the gap
   …        ← v0.9.2 / v0.9.3 / v0.9.4 / v0.9.5 / v0.9.6 : ABSENT
v0.9.7
```

`github:owner/repo#<ref>` installs are resolved by a git ref lookup, so pnpm/git fails at
ref-resolution time, before any package is fetched or built. That matches "pnpm failed
immediately".

### 2.2 Differential proof that it is **not** the consumer's network or command

The consumer did not mistype the command and the channel is healthy:

1. The command is verbatim the README's own default — the pin came from the documentation, not from the consumer.
2. The **same command shape** with `#v0.9.7` **succeeded minutes later** (attempt 2). Same host, same registry, same network, same package manager, same org/repo coordinate. The only variable that changed is the ref string.
3. Therefore the failure is a property of the **ref**, i.e. of the published tag set — not of connectivity, auth, pnpm version, or command syntax.

### 2.3 The release-engineering defect

The defect is in **release tooling**, and `fixture/sync-script.sh` shows it directly:

```bash
# release sync script (excerpt) — runs after every release, for each mirror
for remote in origin public mirror2; do
  # rewrite install-source orgs for the target mirror, then:
  git push --force-with-lease "$remote" HEAD:main
done
```

- The sync pushes **`HEAD:main` only**. There is no `git push --tags`, no `--follow-tags`,
  and no per-version `refs/tags/v<version>` push. **Tag objects are never propagated to the
  mirrors by the release pipeline.**
- Because only the branch is force-pushed, the tag set that ends up on a mirror is whatever
  happened to be created there by hand (e.g. a GitHub Release cut directly on the mirror) —
  an **arbitrary, incomplete subset**: `v0.9.1` and `v0.9.7` are present, the whole
  `v0.9.2`–`v0.9.6` window is missing.
- **No gate checks documentation against reality.** The README's default install pin is a
  hand-maintained literal; nothing asserts "every tag referenced by the README / compat table
  / built-in update prompt exists on every mirror and points at the same SHA". So a pin can
  reference a version that was released internally but never distributed.

Result: `#v0.9.5` is a **phantom pin** — a documented install ref with no backing tag object on
the mirror the README points consumers at. The same defect also removed `v0.9.3` from the
mirror, which is what makes the correct remedy non-obvious (see §4).

**Secondary aggravation:** the script has no `set -euo pipefail`, no post-push verification,
and no failure reporting — a partially applied release across three mirrors would be silent.

---

## 3. Attempt 2 — why the newest tag installed but crashes

### 3.1 The compatibility direction

The consumer's runtime and the artifact's target are on **opposite sides of the 0.1.2 line**:

```
consumer runtime : dsh 0.1.1-rc.2          (0.1.1 line — last of the 0.1.1 series)
v0.9.7 targets   : dsh-v0.1.2-alpha.1      (0.1.2 line — first alpha)
```

`fixture/compat-table.md` states this explicitly: `v0.9.7` "Migrated to the alpha.1 client API
(`views`/`legacy` projection + `useConversation` seat)". This is a **plugin-newer-than-host**
pairing: the artifact is built against a client API contract that the running runtime does not
provide. It is *not* a host-newer-than-plugin pairing, and it is not a bug in the plugin's own
logic — it is a **routing** error (the newest tag was chosen instead of the compatible tag).

### 3.2 Why that produces exactly `TypeError: useConversation is not a function`

`useConversation` is a **seat introduced by the rc.1 → alpha.1 client-API migration**, not a
long-standing export:

- `examples/06-real-world-batch-migration.md` step 4 (the rc.1 → alpha.1 batch migration):
  "生命周期拆分：`running` 等改走 `useSession` 座；组件 props 用 `useSession` + `useConversation` 双座"
  — i.e. `useSession` / `useConversation` are **new seats** that only exist from 0.1.2-alpha.1 on.
- `references/v0.1.2-alpha.1.md` · DSH-0.1.2-A1-03 field note: on the 0.1.1 line the conversation
  snapshot is the **flat** `ConversationSnapshot` (`nodes` / `partial` / `runningCalls` /
  `turnEnds`); from alpha.1 those fields move behind `views.get('chat')?.legacy`, and lifecycle
  fields must be read through the `useSession` seat.
- `references/v0.1.2-alpha.1.md` · DSH-0.1.2-A1-25: `@deepseek-ai/dsh-client-runtime` still
  exists on rc.2 and is **deleted** in alpha.1, with client symbols split by domain — the two
  cohorts do not share one client package layout.

On the consumer's rc.2 host, the v0.9.7 client bundle therefore asks the host for a seat that
does not exist there. Client halves load as `window.__ModuleLoader__.load({ id, factory })`
with `require(...)` **inside** the factory (`references/troubleshooting.md`), so a host package
that no longer exports the symbol yields `undefined` rather than a hard module-resolution
error — and the first call inside the slot entry throws precisely
`TypeError: useConversation is not a function`. The same shape is already catalogued in
`references/troubleshooting.md` for `workspaces.connectWorkspace is not a function`:
*"install and typecheck can stay green while [the call] throws"* — a method that only exists on
the newer cohort.

### 3.3 Why restarting dsh cannot help

The defect is in the **artifact**, not in process state:

- The failure is deterministic and version-bound: every cold boot loads the same v0.9.7 client
  bundle against the same rc.2 host API. No amount of restarting changes which exports the host
  provides.
- Per `examples/06-real-world-batch-migration.md` 错误 6, a *client-plane* change is normally
  picked up by a browser hard refresh and a *host-plane* change needs a dsh restart — neither
  applies, because nothing changed on disk: the wrong artifact was installed.
- "Install succeeded" only proves **dependency resolution** worked. It says nothing about
  **enablement/contract compatibility** — exactly the distinction the plugin-upgrade skill
  draws between "a successful install with mixed old/new peers is not a migration" and a real
  verification (Mode B step 5, Validation layers 1–5).

### 3.4 What attempt 2 rules out

Not a network/registry problem (install succeeded); not a profile-composition problem (the row
resolved and the entry mounted far enough to execute); not a stale-process or caching artifact
(crash persists across restarts); not a plugin-code regression (the same code is correct on the
host it was built for — `dsh-v0.1.2-alpha.1`). The single variable is the **host version**.

---

## 4. The exact remedy for the consumer, right now

### 4.1 Which artifact the consumer actually needs

| Plugin version | DSH version | Fits `0.1.1-rc.2`? |
|---|---|---|
| `v0.9.3` | `@deepseek-ai/dsh@0.1.1-rc.1` (rc.1 real-boot verified; rc.2 = rc.1 + image preprocessing, additive) | **Yes — the documented match** |
| `v0.9.7` | `dsh-v0.1.2-alpha.1` | **No — causes the crash** |

The rc.1 → rc.2 delta is additive and confined to the image plane
(`references/v0.1.1-rc.2.md`: DSH-0.1.1-R2-01 `originalDimensions` on attachment refs,
R2-02 `read_image` output, R2-03 DeepSeek Files-API preference). None of those touch the
conversation/slot surface a UI progress plugin uses, so an rc.1-line build runs on rc.2.

**The trap:** `v0.9.3` — the version the compat table says to use — is *also* missing from the
mirror (same tag-distribution defect as §2). The consumer cannot install the documented match
by tag today.

### 4.2 Concrete command (works on the frozen `0.1.1-rc.2`, from the mirror already in use)

```sh
dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.1'
```

Why `v0.9.1` is the correct available choice — the evidence chain:

1. `v0.9.7` is the row that was "migrated to the alpha.1 client API"; the alpha.1 migration
   therefore landed **after** `v0.9.3`.
2. `v0.9.3` is still on the pre-migration (`0.1.1-rc.1`) line per the compat table, so the
   migration version is `> v0.9.3`.
3. `v0.9.1 < v0.9.3`, so `v0.9.1` is on the **pre-migration, rc.1/rc.2-compatible line**.
4. `v0.9.1` **does** exist on the mirror (`fixture/ls-remote-tags.txt`), and it is the newest
   published tag on that line — no tag between `v0.9.1` and `v0.9.7` exists on the mirror.

Because the consumer already has a successful `v0.9.7` install, the row must be **replaced**,
not merely re-added (a lower GitHub ref will not silently downgrade an existing row):

```sh
# 1. remove the incompatible row (same CLI surface, or delete the source line in the
#    profile's cordis.patch.yml — do not hand-edit a resolved config)
dsh plugin --profile web remove '@org/dsh-ui-progress'

# 2. install the runtime-compatible tag
dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.1'

# 3. verify composition actually resolves to v0.9.1, with nothing pending
dsh --profile web --dump-config

# 4. restart dsh, then hard-refresh the browser
```

Acceptance criteria: `--dump-config` shows exactly one `@org/dsh-ui-progress` row resolving to
the `#v0.9.1` source with no `pending` row and no leftover `#v0.9.7` line; after restart +
hard refresh the slot entry renders and the browser console shows **no**
`useConversation is not a function`.

**Rollback** (if `v0.9.1` turns out to lack a feature the consumer needs): re-run the `add`
command with the previous ref; the only path touched is the plugin's own source row in the
profile composition.

### 4.3 Alternatives considered, and why they are not the remedy

| Option | Verdict |
|---|---|
| Keep `#v0.9.7` and restart / hard-refresh / reinstall | Rejected — deterministic version-bound crash; retrying cannot change the host's export surface |
| Upgrade the host to `0.1.2-alpha.1+` to match `v0.9.7` | **Excluded by the consumer's production freeze.** (It is also the wrong direction to recommend: it drags a whole 0.1.2 alpha cohort — `@deepseek-ai/dsh-client-runtime` removal, `views`/`legacy` rework — into a frozen production host to satisfy one plugin.) |
| `#v0.9.3` (the compat-table match) | **Correct target, not currently installable** — the tag is absent from the mirror. This is the maintainer-side fix (§5, items A1–A3); once the tag is re-pushed, the consumer re-runs the same command with `#v0.9.3` and that becomes the preferred pin. |
| Install from the `origin` mirror instead of `public` | Unverifiable from this evidence pack — `fixture/ls-remote-tags.txt` only lists the `public` mirror's tags. Only pursue if the maintainer confirms `origin` still carries `v0.9.3`, and it still leaves the mirror defect in place. |
| Pin a commit SHA of the `v0.9.3` release | Workable in principle, but the evidence pack contains **no SHAs**, so no concrete command can be given. Re-pushing the tag is strictly better (it also fixes every other consumer). |
| Use a floating ref such as `#main` | Rejected — `main` is force-pushed by the sync script and tracks the newest (alpha.1-targeted) code, i.e. it reproduces the attempt-2 crash. |

---

## 5. Maintainer-side fix so both defects cannot recur

Two independent defects, two independent fixes. A single "newest tag" README bump fixed neither.

### A · Tag-distribution defect (attempt 1)

**A1 — Push tags in the release sync, and fail loudly.**

```bash
#!/bin/bash
set -euo pipefail
VERSION="v${PLUGIN_VERSION}"          # single source of truth, e.g. from package.json
TAGREF="refs/tags/${VERSION}"

for remote in origin public mirror2; do
  git push --force-with-lease "$remote" HEAD:main
  git push --force-with-lease "$remote" "${TAGREF}"      # ← the missing line
done

# A2 — post-push gate: every mirror must carry the tag, at the same SHA
EXPECTED="$(git rev-parse "${TAGREF}^{commit}")"
for remote in origin public mirror2; do
  GOT="$(git ls-remote "$remote" "${TAGREF}" | cut -f1)"
  [ -n "$GOT" ] || { echo "FATAL: ${remote} is missing ${TAGREF}"; exit 1; }
  [ "$GOT" = "$EXPECTED" ] || { echo "FATAL: ${remote} ${TAGREF} -> $GOT, expected $EXPECTED"; exit 1; }
done
echo "release ${VERSION} verified on all mirrors"
```

**A3 — Gate the docs against the published refs.** In CI, extract every `#vX.Y.Z` ref from
`README.md`, the compat table, and the built-in update-prompt constant, then assert each one
resolves on every mirror (`git ls-remote --tags <remote> | grep -F "refs/tags/<ref>"`). This is
the check that would have caught `#v0.9.5` before the consumer ever ran it. (The practice is
cited in `examples/06-real-world-batch-migration.md`: "文档引用的每个 tag 必须存在于每个镜像"
— every tag a doc references must exist on every mirror.)

**A4 — Generate the README install line from the release, never hand-maintain it.** The default
install command should be rendered from the same `PLUGIN_VERSION` variable that drives the tag,
so a doc pin can never drift from the published tag set.

**A5 — Stop relying on git tags as the primary channel.** Publish the plugin to npm and install
by semver; keep GitHub refs as a fallback. Registry installs remove the "does this tag exist on
this mirror" failure mode entirely, and npm dist-tags give a controlled routing channel (see B3).
If git refs must stay the default, use a ref that always resolves rather than a hand-pinned tag.

### B · Version-routing defect (attempt 2)

**B1 — Make the compat matrix normative, and route the install command through it.** The
fixture's `compat-table.md` already contains the right information — it simply was not used to
choose the default install pin. Keep the table in the README (append rows, never delete old
ones — `examples/06-real-world-batch-migration.md` step 3), and derive the default install
command from the row that matches the consumer's `dsh --version`, not from "the newest tag".

**B2 — Add a "which version do I need?" section to the README**, with the one-line probe and a
routing table:

```sh
dsh --version          # 0.1.1-rc.2  →  install #v0.9.x  (0.1.1 line)
                       # 0.1.2-*     →  install #v0.9.7  (0.1.2 line)
```

**B3 — Route new-cohort builds to a separate channel so "newest" never means
"stable-host-compatible".** When the plugin migrates to a new DSH line, publish that build
under a prerelease/next channel and keep the stable line on `latest`; per
`references/rollup-0.1.2.md` R-07, publishing an alpha-cohort adaptation under a prerelease
number and dist-tag is what stops stable-host users from being auto-upgraded onto incompatible
peers. The `0.1.1` line must keep receiving supported patch releases (a backport branch) so a
frozen host is never orphaned.

**B4 — Declare the DSH cohort so a mismatch is refused, not crashed.** Add an explicit
peer/engine range for the DSH host to each plugin release, so an incompatible install is
rejected at install/startup instead of throwing in the browser. (Later hosts enforce exactly
this: `references/v0.1.7-rc.1.md` — "DSH peer ranges are enforced at install and at startup
with exact-version exemptions".) For the rc.2-era host, where no such enforcement exists, the
manifest range is the only install-time guard available.

**B5 — Verify the shipped artifact against the *oldest supported* host, not only the target.**
The compat table's "rc.1 real-boot verified" claim must be backed by a real cold boot on
`dsh-v0.1.1-rc.1`/`rc.2` of the exact artifact being published — a green build + typecheck
against the alpha.1 cohort proves nothing about the rc.2 line (the same lesson as
DSH-0.1.2-A1-29: "typecheck is silent about this … only real host rendering blows up").

**B6 — Add a runtime self-check in the client `apply`.** Per the alpha-phase robustness advice
in `examples/06-real-world-batch-migration.md`: probe the capabilities the entry depends on
(`typeof useConversation === 'function'`, `ctx.slots.inject`, `ctx.locale.register`, …) and,
when they are missing, render a readable banner — *"this plugin build needs dsh ≥ 0.1.2-alpha.1;
your runtime is 0.1.1-rc.2 — install plugin v0.9.x instead"* — instead of a black-screen
`TypeError`. That turns a silent incompatibility into an actionable message and makes the
routing error self-documenting.

**B7 — Keep the update prompt self-sufficient and version-constant-correct.** The built-in
"new version available" badge must state **which host the new version needs**, and the version
constant burned into `lib/client.js` must be rebuilt after every bump — otherwise the badge
points frozen-host users at a tag they cannot run
(`references/troubleshooting.md`: build-time inlined version constants; a bump without a rebuild
makes the badge permanently report a phantom update).

---

## 6. Residual risk / not verifiable from this evidence pack

1. **`v0.9.1` has no compat row.** The fixture documents only `v0.9.3` and `v0.9.7`. The
   `v0.9.1` recommendation is an inference from version ordering plus the location of the
   alpha.1 migration (§4.2, steps 1–4). It is the strongest available inference, but the
   maintainer should confirm it and add the row; the consumer should confirm the slot renders
   after install (acceptance criteria in §4.2).
2. **No tag SHAs are in the pack**, so no SHA-pinned command can be produced, and the
   per-mirror SHA equality gate in §5/A2 cannot be pre-populated here.
3. **Only the `public` mirror was listed.** Tag availability on `origin` / `mirror2` is unknown;
   the sync script's three-remote loop implies they can diverge.
4. **The attempt-2 crash is quoted from the task brief, not shipped as a log** (stated in
   `fixture/README.md`). The mechanism in §3.2 is derived from the compat table plus the
   rc.2/alpha.1 client-API cards, not from a stack trace.
5. **The `plugin-release` skill's §8/§9/§10 and recipe #67** are cited second-hand by
   `examples/06-real-world-batch-migration.md` but are outside this task's read paths, so §5
   restates their content from the plugin-upgrade evidence rather than quoting them.
6. **Whether the consumer's profile uses a `link:`/junction install** is unknown. If it does,
   an install-tree client edit requires a host restart before the page sees it
   (`references/v0.1.7-alpha.2.md`); the restart step in §4.2 covers either case.

---

## 7. One-paragraph answer for the consumer

Your first attempt failed because `#v0.9.5` was never published as a tag on the mirror — the
release script only force-pushes `main` and never pushes tags, and nothing checks that the
README's pin actually exists. Your second attempt failed for a completely different reason:
`v0.9.7` is the build for **dsh 0.1.2-alpha.1** (it uses the new `views`/`legacy` projection and
the `useConversation` seat), while your runtime is **0.1.1-rc.2**, which has no `useConversation`
at all — so the plugin installs fine and then throws in the browser, and restarting cannot fix
it. On your frozen runtime, remove the `v0.9.7` row and install
`dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.1'`
(the newest published tag that predates the 0.1.2 migration), then restart dsh and hard-refresh.
Do **not** upgrade your host and do **not** use `#v0.9.7`. The version you really want is
`#v0.9.3` — the one the plugin's own compat table says matches your runtime — but its tag is
missing from the mirror for the same reason `#v0.9.5` was; ask the maintainer to re-push it, and
switch to `#v0.9.3` once it exists.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.