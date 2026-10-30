# JUDGE BRIEF · noskill.S8-release-routing-trap

## Criteria (sealed rubric)
- [missing-mirror-tag] (20pt) Use ls-remote-tags.txt and sync-script.sh to explain that the README-pinned v0.9.5 is absent from the public mirror because the script pushes HEAD:main but not tags. Tie this to attempt 1 resolution failure, rather than guessing a network fault, consumer typo or missing npm package. Mere tag/version mentions earn no credit.
- [runtime-compatibility-direction] (20pt) Use dsh-version.txt (0.1.1-rc.2) and compat-table.md (v0.9.7 targets 0.1.2-alpha.1) to explain attempt 2: a newer-client-API artifact on an older runtime lacks the expected useConversation seat. Successful installation/restarting does not establish API compatibility. Explain the direction rather than only repeating the error.
- [frozen-runtime-remedy] (20pt) Honor the production freeze: select v0.9.3 using its rc.1 verification and the supplied additive rc.2 compatibility note. Notice v0.9.3 is ALSO absent from the mirror listing. Provide the consumer install command pinning #v0.9.3 after maintainer tag publication, or a reachable verified v0.9.3 commit as a conditional alternative. Do not invent a SHA, assume an unreachable commit resolves, require upgrading DSH, or present the absent tag as immediately installable.
- [tag-distribution-repair] (20pt) Propose explicit release-tag distribution to every public mirror, grounded in the branch-only sync script, and verify the documented tags resolve. Non-forced git push <remote> <tag> or --tags are equivalent. Branch synchronization alone is insufficient; a bare --tags keyword does not establish the repair.
- [version-routing-docs] (20pt) Prevent the second defect by routing README install commands according to the consumer DSH version: rc.2 users get the verified v0.9.3 artifact, alpha.1 users can use v0.9.7. Include a runtime version check or explicit compatibility matrix/branches. A single newest-tag default or restarting advice does not satisfy this requirement. Do not generalize support to every untested future alpha release.

## Caps (score ceilings; judge returns each with triggered true/false)
(none)

## Candidate report(s)
#### FILE: S8-release-routing-trap/S8-release-routing-trap-diagnosis.md

# S8 · Release Routing Trap — Diagnosis

Scope: static evidence pack only (`fixture/`, read-only, unmodified). Two failures, two distinct
root causes: **tag distribution** (attempt 1) vs **version routing** (attempt 2).
Consumer constraint: **dsh 0.1.1-rc.2, production freeze — no runtime upgrade**. Every remedy below
stays inside that constraint.

---

## 0. Evidence inventory

| ID | Source (fixture) | What it fixes in the argument |
|---|---|---|
| E1 | `dsh-version.txt` | Consumer runtime is exactly `0.1.1-rc.2` (`dsh --version` output). |
| E2 | `ls-remote-tags.txt` | Full tag ref list of the install source `github:public-org/dsh-ui-progress`: `v0.1.0, v0.2.0, v0.3.0, v0.4.0, v0.5.0, v0.5.1, v0.6.0, v0.7.0, v0.8.0, v0.9.0, v0.9.1, v0.9.7`. Annotated tags dereferenced and sorted — so gaps are real, not a formatting artifact. |
| E3 | `compat-table.md` | Plugin↔DSH routing: `v0.9.3` → `dsh 0.1.1-rc.1` ("rc.1 real-boot verified; rc.2 is rc.1 + image preprocessing (additive)"); `v0.9.7` → `dsh-v0.1.2-alpha.1` ("migrated to the alpha.1 client API (views/legacy projection + useConversation seat)"). |
| E4 | `sync-script.sh` | Release sync loop per mirror: only `git push --force-with-lease "$remote" HEAD:main`. No tag ref is ever pushed to any mirror. |
| E5 | Task brief | Attempt-2 symptom: `TypeError: useConversation is not a function`, survives a `dsh` restart. |

Derived facts used below:

- **F1** `v0.9.5` is absent from E2; `v0.9.3` is absent too. The whole patch range `v0.9.2 … v0.9.6`
  is missing from the mirror; only `v0.9.0`, `v0.9.1` and `v0.9.7` exist.
- **F2** The gaps sit exactly between two hand-pushed tags — the signature of tags created locally
  at release time and never mirrored (E4), not of tags deleted at the source.
- **F3** `v0.9.7` targets the **next** DSH client-API generation (`0.1.2-alpha.1`); the consumer is
  one generation **behind** (`0.1.1-rc.2`). Plugin semver ordering (`0.9.7 > 0.9.3`) is orthogonal
  to DSH runtime ordering — "newest tag" does not mean "compatible with my runtime".
---

## 1. Attempt 1 — why `#v0.9.5` could never resolve

**Root cause: the ref does not exist on the install source. This is a release-engineering defect in
tag distribution — not a consumer network problem and not a malformed command.**

Mechanism: in `dsh plugin add '<pkg>@github:<org>/<repo>#<ref>'`, the fragment is a **git ref** that
the package manager must resolve remotely (`git ls-remote` against `public-org/dsh-ui-progress`)
before any dependency graph, registry lookup or build step runs. If the remote does not advertise
that tag ref, resolution ends in an immediate hard error (ref not found / "could not resolve" on the
`#v0.9.5` selector). That is exactly "pnpm failed **immediately**": the failure happens at
spec-resolution, so a flaky network, a different registry mirror or a bad command cannot explain it —
and the command is the README's own default.

Why the tag was missing:

1. **E4 pushes branches, never tags.** The sync loop publishes only `HEAD:main` to
   `origin | public | mirror2`. `git push <remote> HEAD:main` does not carry tag refs, and nothing in
   the release path passes `--tags`, `--follow-tags`, or an explicit `refs/tags/<t>:refs/tags/<t>`.
   Tags therefore reach a mirror only when someone pushes them by hand — which is precisely the
   intermittent, non-monotonic tag set in **E2** (`v0.9.0`/`v0.9.1` present, `v0.9.2–v0.9.6` absent,
   `v0.9.7` present).
2. **No release-time ref-parity gate.** After the push, nothing compares the mirror's
   `ls-remote --tags` with the canonical repo's. A missing tag on a mirror stays invisible until a
   consumer pins it — the defect was live for five patch releases.
3. **`--force-with-lease HEAD:main` makes published history mutable.** Rewriting `main` on the
   install mirrors orphans anything pointing into the replaced history, and it removes the only
   fallback a consumer has when a tag is missing (pinning a commit SHA). The mirror can therefore
   never be treated as an immutable install source.
4. **Docs assumed an invariant the pipeline never provided.** The README advertises a tag-pinned
   default command while the automation only guarantees branch delivery — a docs/automation contract
   mismatch, and the direct trigger for attempt 1.

Ruled out: consumer network, pnpm/CLI version, syntax, auth. An auth or connectivity failure would
produce a different error and would equally have broken attempt 2 — yet `#v0.9.7` resolved and
installed from the same host minutes later, which isolates the variable to the ref itself.

---

## 2. Attempt 2 — why the newest tag installs but the slot entry crashes

**Root cause: version routing. `v0.9.7` is built against the `dsh 0.1.2-alpha.1` client API; the
consumer runs `0.1.1-rc.2`. The compatibility direction is *forward* (plugin newer than runtime), so
the artifact is simply not runnable on the frozen runtime.**

Step by step:

1. `#v0.9.7` **does** exist on the mirror (E2) → resolution and install succeed. Install success
   proves ref resolution and tarball/dependency integrity only; it says nothing about the client API
   generation.
2. `v0.9.7` was migrated to the alpha.1 client API: per E3 it moved to the **views /
   legacy-projection** model with a **`useConversation` seat**. That hook is a member of the
   *alpha.1* client API surface.
3. On `0.1.1-rc.2` (E1) that surface does not exist yet, so the slot entry's binding for
   `useConversation` is `undefined`, and calling it throws
   `TypeError: useConversation is not a function` **at render time in the browser** rather than at
   import time. That shape is itself diagnostic: a missing module or a missing *named ESM export*
   would fail earlier (resolution/link error, and would also fail the build). A runtime `TypeError`
   on an undefined binding means the host bundle loaded, exposed the namespace, but did not provide
   that member — an API-generation mismatch, not a broken install.
4. **Restarting did not help, and cannot.** The failing version is persisted in the profile's
   dependency state (`node_modules` + lockfile for `--profile web`); a restart re-loads the same
   `v0.9.7` tree deterministically. There is no cache to clear — the only variables are *which plugin
   version* and *which runtime*.
5. **Direction of the mismatch:** plugin `v0.9.7` requires `dsh ≥ 0.1.2-alpha.1`; consumer
   `0.1.1-rc.2` requires plugin `v0.9.3` (E3). The consumer is exactly one API generation behind.
6. **The frozen runtime is not the blocker.** E3 records that `rc.2` = `rc.1` + additive image
   preprocessing and that `v0.9.3` was **real-boot verified on rc.1** — so `v0.9.3` is the supported
   artifact for `0.1.1-rc.2`, with no runtime change required, *provided that version can actually be
   fetched* (see the §3 caveat).

Contributing release-engineering defects (why the routing failure reached the consumer silently):

- **No compatibility metadata in the artifact.** The package declares no DSH range (no
  `peerDependencies`/`engines` on the dsh runtime), so the installer cannot warn or refuse; the
  incompatibility is discoverable only from a markdown table (E3).
- **No capability probe or fail-fast at entry.** The plugin assumes the alpha.1 hook exists and dies
  with a bare `TypeError` instead of a named, actionable error.
- **The README routed by recency, not compatibility.** "Newest tag" is the maintainer's runtime tip,
  not the consumer's; bumping the default command moved a frozen consumer across an API generation.
- **Plugin and runtime version spaces share no signal** (`v0.9.x` plugin vs `0.1.x` dsh), and the CI
  gate is install-only — a render-time `TypeError` cannot be caught by an install smoke test, only by
  a boot/render test.
---

## 3. Remedy for the consumer — right now, without upgrading dsh

Target state: `@org/dsh-ui-progress` at the **rc-line artifact (`v0.9.3`)** on `dsh 0.1.1-rc.2`.
Do **not** upgrade dsh to `0.1.2-alpha.1` (freeze), and do **not** keep `v0.9.7`.

### 3.1 Remove the crashing version first

```
dsh plugin --profile web remove '@org/dsh-ui-progress'
```

If the profile CLI has no `remove`, drop the entry from the `web` profile's plugin list / dependency
block and re-resolve — never leave two versions of the package in one profile.

### 3.2 Install the rc-compatible version — pinned, from a ref that really exists

**Path A — canonical, once `v0.9.3` is on the mirror** (a one-liner for the maintainer, no runtime
change; fastest unblock):

```
# maintainer, seconds, no rebuild:
#   git push public refs/tags/v0.9.3:refs/tags/v0.9.3

dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.3'
```

> **Caveat proven by the evidence (important):** E2 shows the mirror currently has **no** `v0.9.3`
> either — `v0.9.2…v0.9.6` were never mirrored. So this command fails for exactly the same reason as
> `#v0.9.5` until the tag ref is pushed. Verify before and after with:
>
> ```
> git ls-remote --tags https://github.com/public-org/dsh-ui-progress.git
> ```
>
> The install is unblocked only when `refs/tags/v0.9.3` appears in that output. If the mirror cannot
> be touched today, use Path B.

**Path B — offline / mirror-agnostic, needs no new tag** (recommended while the freeze makes the
mirror a third-party dependency): have the maintainer hand over the **`v0.9.3` release tarball**
(`npm pack` of the `v0.9.3` commit, checksum published alongside), then:

```
dsh plugin --profile web add 'file:./dsh-ui-progress-0.9.3.tgz'
```

`file:` installs resolve locally — no tag, no mirror, no network — so it is the only form of the
remedy immune to the §1 defect. This is the safest option under a production freeze.

**Path C — minimum-risk stopgap** if neither A nor B is available today: install the newest tag the
mirror actually has below the alpha.1 line, i.e. `v0.9.1` (E2):

```
dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.1'
```

Treat it as a stopgap: `v0.9.1` is **not** in the compat table (E3), so it is uncertified against
`0.1.1-rc.2`; the bar is only that it renders. Replace it with `v0.9.3` as soon as A or B lands.

**Never as a remedy:** `#main`, `#latest`, or any unpinned install. `main` on the mirror has already
been force-rewritten to the alpha.1 line (E4), so it reproduces the attempt-2 crash exactly.

### 3.3 Acceptance check (proves the fix, not just the install)

1. `git ls-remote --tags <mirror>` shows the pinned ref (Path A) — the resolution precondition.
2. `dsh plugin --profile web list` shows `@org/dsh-ui-progress` at `0.9.3`, exactly one copy.
3. Inspect the installed tree: `node_modules/@org/dsh-ui-progress/package.json` version is `0.9.3`,
   and the slot entry bundle contains **no** `useConversation` reference — that symbol is the alpha.1
   migration marker. Its presence means the wrong artifact is still installed.
4. Restart `dsh` and open the conversation surface that hosts the slot: no `TypeError`, panel
   renders. (After the §4 hardening a clear, action-named refusal would also be acceptable; today the
   success criterion is "renders".)
5. Freeze the result: keep the version pinned in the profile lockfile and pin the same tag in the
   team's install runbook, so the next `dsh` restart cannot silently drift forward.
---

## 4. Maintainer-side fix — so neither defect can recur

### 4.1 Release tooling: make tag distribution a hard, verified invariant

1. **Push tag refs explicitly and atomically per mirror** (fixes §1):
   `git push --atomic "$remote" HEAD:main "refs/tags/$TAG:refs/tags/$TAG"`, one tag per release.
   (`--follow-tags` covers annotated release tags but explicit refs are safer in a loop script.)
   Never rely on `HEAD:main` alone.
2. **Ref-parity gate after the push**, per mirror, failing the release: `git ls-remote --tags
   "$remote"` must contain every tag in the release manifest, with the same **peeled** SHA as
   `origin`. Compare the full ref map, not just the new tag — that retro-detects gaps like
   `v0.9.2…v0.9.6` and blocks further publishing until a backfill push runs.
3. **Backfill once, now:** push the missing tags to every mirror, then re-run the parity gate. Until
   then each mirror is an incomplete install source.
4. **Stop force-pushing published history to install mirrors.** Generate the mirror branch as a
   build-time export (install-org strings rewritten into a fresh commit) so mirror history is
   append-only and SHA pinning remains a valid fallback when a tag is missing. Never
   `--force-with-lease` a release branch onto a public install source.
5. **Tag immutability policy:** create tags once on the canonical repo, mirror them verbatim, never
   retag or force-move a published tag; to withdraw a release, publish a new patch version. Tag
   deletion/retagging becomes a loud, documented exception.
6. **Assert tag↔manifest consistency in CI:** the tag's commit must be the commit the release notes
   and the compat row were written against (guards against tagging the wrong HEAD).

### 4.2 Version routing: encode compatibility in the artifact, not only in a table

1. **Declare the runtime range in the package:** `peerDependencies`/`engines` on the dsh runtime
   (e.g. the `0.1.1-rc` line for the 0.9.x-rc artifact, `>=0.1.2-alpha.1` for the alpha.1 artifact),
   plus a machine-readable compat manifest so tooling can route automatically instead of humans
   reading markdown.
2. **Do not migrate the client API in a patch/minor without a compatibility layer.** Ship a
   capability-detected adapter — use the alpha.1 hook when it is a function, otherwise the legacy
   projection — so one artifact boots on both generations. If dual support is genuinely impossible,
   **fail fast with an actionable error** at slot entry ("dsh-ui-progress 0.9.7 requires dsh >=
   0.1.2-alpha.1; on 0.1.1-rc.x install 0.9.3") instead of an undiagnosable `TypeError`.
3. **Keep a maintenance branch for the frozen line** (0.9.x for `0.1.1-rc`), tagged and mirrored like
   any release, so frozen consumers still get fixes without an API jump.
4. **Install×boot CI matrix per supported dsh version:** from a clean temp profile, run the README's
   **default command verbatim** (doc-tested), then *boot the client and render the slot entry* — the
   only gate that catches a render-time `TypeError`. Add one matrix cell per supported dsh version
   plus a negative cell asserting a clear error on unsupported ones.
5. **Publish per-line dist-tags/aliases** (`rc-line`, `alpha-line`) so nobody ever installs by
   recency again.

### 4.3 Docs: route by runtime version, never by "newest tag"

1. The README **default** command must pin the tag certified for the **current stable/rc** runtime
   and state which `dsh --version` it serves; alpha/next artifacts move behind an explicit
   "prerelease channel — requires `dsh 0.1.2-alpha.1` or newer" section with a warning.
2. Ship the compat matrix (E3) as a **routing table with a decision rule**: "run `dsh --version`,
   take the row, install that exact tag"; include the tag-existence self-check
   (`git ls-remote --tags <mirror>`) so a missing ref is diagnosed in one step; state plainly that
   plugin tags and dsh versions are different version spaces.
3. Mark `v0.9.7` **breaking** in the changelog (client API migration: views/legacy projection +
   `useConversation` seat) and record the runtime floor in the release notes.
4. One release checklist as the single source of truth: tag created → pushed to every mirror →
   parity gate green → install+boot matrix green on each supported dsh version → README/matrix row
   updated → only then announce. The incident violated the last step, which is why the incompatible
   artifact reached the consumer at all.

---

## 5. Summary

Attempt 1 failed before any code ran: `#v0.9.5` is a git ref the mirror never received, because the
release sync script publishes only `HEAD:main` and never tag refs, with no post-push parity check and
a force-push that makes `main` a moving, non-pinnable target — a tag **distribution** defect.
Attempt 2 installed a ref that does exist, but `v0.9.7` had been migrated to the `dsh 0.1.2-alpha.1`
client API (views/legacy projection + `useConversation` seat) while the consumer is frozen on
`0.1.1-rc.2`, so the hook is `undefined` at slot render — a version **routing** defect, one API
generation forward.

The frozen runtime is still serviceable: `v0.9.3` is the rc.1-verified artifact and `rc.2` is additive
over `rc.1`. The consumer's fix is to remove `v0.9.7` and install `v0.9.3` pinned — from the mirror
only after the missing tag ref is pushed (verify with `git ls-remote --tags` first), or, better under
a freeze, from the maintainer's `v0.9.3` tarball via `file:`, which needs no tag and no network. The
maintainer's fix is mechanical: push and verify tag refs atomically on every mirror, keep published
history immutable, put the runtime range in the package (plus a capability-detected adapter or a named
fail-fast error), keep an rc-line maintenance branch, gate releases on an install-*and-boot* matrix,
and make the README route by `dsh --version` instead of by newest tag.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.