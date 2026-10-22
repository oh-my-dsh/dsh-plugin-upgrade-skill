# S8 · Release Routing Trap — diagnosis (read-only evidence pack)

Scope: static diagnosis from `fixture/` + the plugin-upgrade skill's version cards. No installs, no git commands,
no network, no writes outside this report. `fixture/` is byte-unchanged.

## 0. Evidence identity (what each artifact actually is)

| Fact | Value | Source |
|---|---|---|
| Consumer host | `0.1.1-rc.2` (frozen; cannot upgrade) | `fixture/dsh-version.txt` |
| Mirror tag namespace (public mirror) | `v0.1.0 … v0.9.0, v0.9.1, v0.9.7` — **no v0.9.2 … v0.9.6** (so no `v0.9.5`, no `v0.9.3`) | `fixture/ls-remote-tags.txt` |
| Plugin ↔ host routing table | `v0.9.3 → 0.1.1-rc.1` (rc.2 = rc.1 + additive image preprocessing); `v0.9.7 → dsh-v0.1.2-alpha.1` (alpha.1 client API: views/`legacy` projection + `useConversation` seat) | `fixture/compat-table.md` |
| Release sync path | per mirror: `git push --force-with-lease "$remote" HEAD:main` — **branch only, no tag refspec, no `--tags`/`--follow-tags`** | `fixture/sync-script.sh` |
| Attempt-2 symptom | `TypeError: useConversation is not a function`, survives restart | task brief |

The two failures are orthogonal by construction: attempt 1 dies inside dependency resolution (no package bytes
fetched), attempt 2 installs cleanly and dies in the browser at first slot render. One is a **ref-distribution**
fault, the other a **version-routing** fault.

## 1. Attempt 1 — why `#v0.9.5` could not resolve

**Root cause (release engineering, not network): the release pipeline publishes the branch but not the tag, so the
documented install coordinate was never distributed to the mirror.**

- The README's default command pins a *Git ref*: `github:public-org/dsh-ui-progress#v0.9.5`. pnpm resolves that by
  asking the remote for the ref first (`git ls-remote`), then fetching the tree. A ref that does not exist fails
  immediately, before any tarball/dependency work — matching "pnpm failed immediately".
- The mirror's tag listing proves the ref is absent: the namespace is `v0.9.0, v0.9.1, v0.9.7` — a sparse,
  hole-ridden set. `v0.9.5` is not there, and neither are `v0.9.2`–`v0.9.6`. This is not a lag/404 edge: the
  intermediate tags are missing on *both* sides of the published ones.
- The sync script explains the shape. `git push "$remote" HEAD:main` transfers exactly one ref. `git push` never
  implies tags: only an explicit `refs/tags/...` refspec, `--tags`, or `--follow-tags` moves tag objects. So each
  release copied `main` to three mirrors and left the tag namespace to whatever a human happened to push by hand.
  The result is exactly the observed survivorship pattern: `v0.9.7` exists because someone pushed the tag for the
  announcement; `v0.9.5` never left the maintainer's clone.
- Because the documented coordinate is a tag and the pipeline only guarantees commits, **the artifact the docs
  advertise and the artifacts the mirrors can serve are different sets**. The README bump is hand-typed with no
  gate against `ls-remote`, so "documented" was never "published".
- Secondary hazard, same script: the loop rewrites install-source orgs and force-pushes `main` per mirror. If a
  mirror's history is rewritten while its tags point at pre-rewrite commits, tags and branch diverge, and `#main`
  and `#vX.Y.Z` can resolve to different trees. Any "tag exists on origin but not on mirror2" state becomes
  invisible to the maintainer because the sync run reports success (branch push is all it checks).

Ruled out: consumer network, proxy/DNS, pnpm version, command quoting/quoting of the `@scoped@github:` form. The
identical command shape installed `v0.9.7` one attempt later, over the same channel — only the ref changed.

## 2. Attempt 2 — why the newest tag installs but crashes

**Root cause (version routing): `v0.9.7` targets the *newer* host line `0.1.2-alpha.1`; the consumer's frozen host
`0.1.1-rc.2` is one API line *behind*, and does not provide the `useConversation` seat that build calls.**

- Direction of compatibility is explicit in the plugin's own table: `v0.9.7 → dsh-v0.1.2-alpha.1`, described as
  "migrated to the alpha.1 client API (views/`legacy` projection + `useConversation` seat)". The seat is a
  **0.1.2-alpha.1-era client-contract symbol**, delivered through the session kit / slot props; it is not part of
  the `0.1.1-rc.2` client plugin surface. On rc.2 the slot entry therefore receives `undefined` and calls it →
  `TypeError: useConversation is not a function`.
- Card corroboration (IDs only, per citation rules): **DSH-0.1.2-A1-03** — alpha.1 splits session-view internals and
  moves consumers onto `views.get('chat')?.legacy` plus the seats; **DSH-0.1.2-A1-25** — alpha.1 removes
  `@deepseek-ai/dsh-client-runtime` and re-homes client symbols by domain, i.e. the rc.2 client kit is a different
  contract, not a superset; **DSH-0.1.6-A2-03** — `useConversation` is a declared ui-conversation session-kit seat on
  the alpha line, i.e. it belongs to the post-alpha.1 contract. The compat table's alpha.1 claim and the cards agree:
  the symbol cannot exist at rc.2.
- Why the install "succeeded": installability only proves the tag resolves and the package's declared dependencies
  install. Compatibility is a separate layer (skill validation layer 2 vs 1: enablement/API resolution ≠ dependency
  resolution). The consumer's host has **no peer-range enforcement** — that enforcement appears only on the
  0.1.7-rc.1-line hosts — so an API-incompatible client build passes `add` and fails at first render.
- Why restarting did not help: the crash is not a stale roster/combo cache. Cache/registration faults heal on a host
  restart (contrast DSH-0.1.5-A1-20); a static call to a symbol the host's client kit never exports cannot heal. That
  "restart did not help" observation is itself the differential that separates this from a boot-manifest fault.
- Defect generalization: **release recency was used as the compatibility selector**. "Newest tag" is a release-order
  fact; it is not a routing decision. `v0.9.7 > v0.9.3` in SemVer, but for host `0.1.1-rc.2` the compatible
  coordinate is `v0.9.3` (rc.2 is documented as rc.1 + additive preprocessing). Two distinct host corridors share
  one tag namespace with no machine-readable guard, so a correct install of the wrong corridor is inevitable.

## 3. Remedy for the consumer, on `0.1.1-rc.2`, no host upgrade

Target artifact: **`v0.9.3`** — the only release the plugin documents for the `0.1.1-rc.x` line. Do not choose
`v0.9.4`–`v0.9.6` (undocumented corridor) and do not keep `v0.9.7`.

Complication, and why the command below is not the obvious one: **`v0.9.3` is also absent from the mirror tag list**
(the same defect as attempt 1). Re-running the README's pattern with `#v0.9.3` would reproduce failure 1. The remedy
must therefore name the artifact by an **immutable coordinate that does not depend on a published tag** — a commit
SHA, an upstream tag that is verified to exist, or a packed tarball.

1. Verify which refs actually exist, on each mirror, before installing (read-only):
   `git ls-remote --tags <mirror-url> | grep -E 'v0\.9\.[0-9]+'` — pick a mirror that lists the intended ref.
2. Replace the pin with the v0.9.3 **commit** (40-hex SHA from the maintainer's repo; a short tag name is *not*
   acceptable, it is exactly what is missing):
   ```
   dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#<40-hex-sha-of-v0.9.3>'
   ```
   (Same shape if the tag is verifiably present on another remote, e.g. `github:<origin-org>/dsh-ui-progress#v0.9.3`.)
3. If neither mirror can serve v0.9.3 (likely, given the tag list) use the offline lane — still no host change, still
   no upgrade: have the maintainer `pnpm pack` the v0.9.3 tree and install the tarball
   (`'@org/dsh-ui-progress@file:/<path>/dsh-ui-progress-0.9.3.tgz'`), or `link:` a local v0.9.3 checkout.
4. Remove the broken artifact rather than stacking: drop the `v0.9.7` dependency/composition row so the profile does
   not still compose the incompatible client bundle, then add the v0.9.3 coordinate and re-install.
5. Restart the host process (the client bundle is read at host boot; a browser refresh alone is not a host restart),
   then verify in this order: `dsh --profile web --dump-config` shows the row resolving to the v0.9.3 package/commit
   → the client bundle registers and the slot entry mounts (no `useConversation` TypeError, no vanished slot) →
   one real progress-path interaction completes.
6. Keep the exact coordinate pinned (SHA/tarball digest) for the duration of the production freeze; re-evaluate only
   when the host line moves.

If v0.9.3 cannot be obtained in any of the three forms above, the honest blocker is "the compatible artifact was never
distributed", not the consumer's environment — escalate to the maintainer for a pack/SHA, do not substitute v0.9.7.

## 4. Maintainer-side fix (so neither defect can recur)

### Release tooling

- **T1 · Publish the tag as part of the release, in the same loop, atomically with the branch.** Push
  `refs/tags/vX.Y.Z` explicitly to every remote (`git push "$remote" HEAD:main refs/tags/vX.Y.Z`), or
  `--follow-tags` on the release commit, or `refs/tags/*:refs/tags/*` for a batch. Tags are the installation
  coordinate; a branch-only push guarantees that documented tags are missing.
- **T2 · Gate on the tag, per mirror, before announcing.** After the push loop, for each remote run
  `git ls-remote --tags <remote>` and assert the new tag exists **and dereferences to the same commit on every
  mirror** (annotated tags: compare the `^{}` line, not the tag object). Non-zero exit → no README bump, no
  announcement. Add an idempotent re-push for a lagging mirror instead of a silent success.
- **T3 · Prove the documented command, not just the ref.** In CI, cold-install the README's exact command from each
  mirror into a scratch profile. The ref list can be correct while the install path is broken; the install is the
  contract.
- **T4 · Make tags immutable.** Never force/delete/recreate a release tag: pinned consumers resolve by tag name, so a
  moved tag silently rewrites their dependency tree. If a release must be withdrawn, publish a new version and mark
  the old one in the routing table.
- **T5 · Stop rewriting history under tags.** The org-rewrite + `--force-with-lease HEAD:main` per mirror leaves tags
  pointing at commits the mirror no longer has on `main`. Rewrite once, at tag creation, before the tag is pushed, and
  push the same commit objects to all mirrors; verify `git merge-base --is-ancestor <tag> <mirror-main>` per mirror.
- **T6 · Declare and enforce the compatibility contract.** Put the host corridor in the package (`peerDependencies` on
  the DSH cohort and/or the community-standard `dsh` compatibility field) so modern hosts refuse at install/startup.
  Because rc.2-era hosts do **not** enforce peers, also add a fail-closed runtime guard in the client entry: compare
  the host client-API version / probe the seat, and throw one explicit message
  ("dsh-ui-progress vX requires DSH >= 0.1.2-alpha.1; this host is 0.1.1-rc.2 — install v0.9.3") instead of a bare
  `TypeError`. A one-line "this build needs a newer host" beats a blank slot.
- **T7 · Channel discipline for cross-corridor builds.** Alpha-cohort builds get a prerelease version and the
  `alpha` dist-tag; `latest` and the README default stay on the stable-host line (practice recorded in the skill's
  rollup, R-08). Keep a `0.1.1-rc.x` maintenance branch so frozen consumers receive backports without a host upgrade,
  and never let "newest tag" become "default install".

### Docs

- **D1 · The compatibility table is the routing table, not an appendix.** One row per plugin release × supported DSH
  range, each row carrying its exact install coordinate, ordered by **host line**, not by release date. Add the
  missing rows for `v0.9.4`–`v0.9.6` (or state "untested — do not install") so no consumer has to infer.
- **D2 · Every install snippet states its host requirement inline**, plus a prominent note that *the newest tag is not
  the default for older hosts*. Generate the default pin from the verified tag list so docs cannot name an
  unpublished ref (this alone kills attempt 1).
- **D3 · Release notes carry the corridor.** Each release states which DSH line it targets and whether it is
  installable-but-incompatible on older hosts; note that `0.1.2-alpha.1` was never npm-published (rollup R-01), so
  GitHub-tag installs are the only channel for that line — which is exactly why T1/T2 cannot be optional.
- **D4 · Troubleshooting entry.** Add the two symptoms to the docs' symptom table: "tag not found → tag was never
  pushed to this mirror (see T1)"; "`useConversation is not a function` after a successful install → wrong corridor,
  downgrade to the row for your host (see D1)".

## 5. Validation performed / not performed

- Performed (read-only): fixture byte scan, ref-set comparison against the documented pin, compat-table routing
  against `dsh --version`, sync-script refspec analysis, cross-check of both root causes against skill cards
  (DSH-0.1.2-A1-03, DSH-0.1.2-A1-25, DSH-0.1.6-A2-03, DSH-0.1.5-A1-20 for the cache contrast, rollup R-01/R-08 for
  the publication and channel rules). No files in `fixture/` were written; no git/install/network commands were run.
- Not performed, therefore stated as unverified: the v0.9.3 commit SHA and its presence on the other mirrors; whether
  `v0.9.2`–`v0.9.6` exist anywhere upstream (fixture shows only the one mirror); the consumer's built client bundle.
  The remedy therefore specifies the *kind* of immutable coordinate plus a verification command, and deliberately does
  not invent a SHA or a mirror org.

## 6. Residual risk / rollback

- The "rc.2 = rc.1 + additive preprocessing" claim is the plugin author's assertion; the install must be validated at
  the runtime layer (mount + one core path), not accepted because the dependency graph resolved.
- If a v0.9.3 client build also used an rc.1-only symbol that rc.2 lacks, the same mount test catches it; the fallback
  is then "no published artifact is compatible" — a maintainer backport, not a consumer workaround.
- Rollback: nothing was changed. For the consumer, the prior (broken) state is the v0.9.7 pin; keeping the profile's
  `package.json`/`pnpm-lock.yaml` and the composition row copy is sufficient to restore it. No credentials or
  `.npmrc` contents were read or recorded.
