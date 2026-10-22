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
#### FILE: S8-release-routing-trap/release-routing-diagnosis.md

# S8 · Release Routing Trap — Release-Engineering Diagnosis

**Scope**: static, read-only diagnosis from the fixture evidence pack
(`.../S8-release-routing-trap/fixture/`, unchanged). No installs, migrations, or
network actions were performed. The consumer's dsh runtime is frozen at
`0.1.1-rc.2` (production freeze), so every remedy below works on that runtime.

## 1. Bottom line

| Attempt | Symptom | Root cause class | One-line root cause |
|---|---|---|---|
| 1 · `#v0.9.5` | pnpm fails immediately, ref cannot resolve | **Release distribution defect** (tags never synced to mirrors) | The per-mirror sync script pushes only `HEAD:main` — no tag refs — so the mirror does not serve `v0.9.5`, which the README told consumers to pin |
| 2 · `#v0.9.7` | Install succeeds; slot entry crashes `TypeError: useConversation is not a function`; restart doesn't help | **Version routing defect** (recency ≠ compatibility) | `v0.9.7` is built against `dsh-v0.1.2-alpha.1`'s client API; the consumer's frozen `0.1.1-rc.2` host has no `useConversation` seat, so the artifact is artifact-ahead-of-host and deterministically crashes |

Two distinct defects, deliberately different mechanisms: **attempt 1 is about
which refs exist on the mirror; attempt 2 is about which artifact matches the
consumer's host.**

## 2. Evidence base (all from the fixture, read-only)

- `ls-remote-tags.txt` — `git ls-remote --tags https://github.com/public-org/dsh-ui-progress.git`
  serves: `v0.1.0, v0.2.0, v0.3.0, v0.4.0, v0.5.0, v0.5.1, v0.6.0, v0.7.0, v0.8.0,
  v0.9.0, v0.9.1, v0.9.7`. **`v0.9.5` is absent** (as is the whole `v0.9.2`–`v0.9.6` block).
- `sync-script.sh` — the post-release sync runs, per mirror (`origin`, `public`, `mirror2`):
  `git push --force-with-lease "$remote" HEAD:main`. **There is no tag push** —
  no `--tags`, no `--follow-tags`, no `refs/tags/...` refspec.
- `dsh-version.txt` — consumer runtime: `0.1.1-rc.2` (frozen).
- `compat-table.md` — the plugin's own compatibility matrix:
  - `v0.9.3` → npm `@deepseek-ai/dsh@0.1.1-rc.1` (rc.2 is rc.1 + additive image
    preprocessing, i.e. rc.2-compatible);
  - `v0.9.7` → `dsh-v0.1.2-alpha.1` — "Migrated to the alpha.1 client API
    (views/legacy projection + `useConversation` seat)".
- `README.md` — confirms the fixture is static and that the attempt-2 crash
  symptom is quoted in the brief rather than shipped as a log.

Corroborating skill knowledge (reference material, not fixture evidence): in this
plugin ecosystem the client session kit passes `useConversation` to slot entries
through the Web Client contract, and "a component that calls the missing prop
throws at render and takes the whole slot subtree down" — i.e. a missing-seat
call is a deterministic render-time `TypeError`, exactly the reported crash
shape, and no host restart can heal it.

## 3. Attempt-1 root cause — why `#v0.9.5` could not resolve

**The defect is in release tooling: tag refs are never distributed to the mirrors.**

- The consumer's command followed the README's documented default install
  command verbatim (`@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.5`).
  The command syntax, org, repo, and transport were all valid — proven by the
  fact that attempt 2 resolved `#v0.9.7` from the *same* mirror with the *same*
  command shape.
- What failed is the **ref**: `git ls-remote --tags` on the mirror does not list
  `v0.9.5`. pnpm/git therefore cannot fetch the pinned object — a
  ref-non-resolution failure (404-class / "couldn't find remote ref"), not a
  network, auth, or typo problem.
- The mechanism is visible in `sync-script.sh`: after every release, the sync
  loop force-pushes only `HEAD:main` to each mirror. Git tags are independent
  refs; nothing in the release flow ever creates them on the mirrors. So any
  README pin can reference a tag that exists only on the canonical repo.
- The contiguous missing block `v0.9.2`–`v0.9.6` shows tag distribution is ad-hoc
  (historical/manual pushes), not part of the release — the honor-system setup
  broke exactly when a fresh pin was documented.
- Note the asymmetry: `v0.9.7` *is* present on the mirror while `v0.9.3`/`v0.9.5`
  are not — consistent with an occasional manual push rather than a scripted,
  verified distribution. This is the same defect, not an exception to it.

## 4. Attempt-2 root cause — why the newest tag installed but crashed

**The defect is version routing: the README routed consumers by tag recency
instead of by host compatibility, and `v0.9.7` targets a newer DSH than the
consumer runs.**

- Compatibility direction (from the plugin's own compat table):
  - `v0.9.7` (the installed artifact) → targets **`dsh-v0.1.2-alpha.1`** — a
    *newer* host. It was migrated to the alpha.1 Web Client API and consumes
    the `useConversation` seat.
  - Consumer's actual runtime: **`0.1.1-rc.2`** — an *older* host that predates
    the alpha.1 client contract. The session-kit seat does not exist there.
- On `0.1.1-rc.2`, the slot entry's call to `useConversation` executes against
  `undefined`, producing `TypeError: useConversation is not a function` at
  render, which takes the slot subtree down. The artifact is statically built
  against the alpha.1 contract, so the failure is **deterministic** — this is
  why restarting dsh (and re-installing) cannot help: there is no stale state
  to clear, the host simply lacks the API the artifact requires.
- The maintainer's README bump (`v0.9.5` → `v0.9.7`) treated the problem as
  "pin something that resolves" instead of "pin something that matches the
  consumer's host". Resolving and being compatible are orthogonal — and
  "newest tag" is not a compatibility routing rule.

## 5. Exact remedy for the consumer right now (runtime stays `0.1.1-rc.2`)

The only plugin line documented for the consumer's host cohort is **`v0.9.3`**
(`0.1.1-rc.1` verified; `rc.2` = rc.1 + additive image preprocessing). But
`v0.9.3` is also missing from the mirror's tag list (see §3), so the fix has two
paths:

**Path A — immediate, no waiting (install from the canonical repo).**
The canonical repository (the sync script's `origin` remote) is where the tags
live. The fixture does not name the canonical org, so substitute it (the org the
plugin's official/repo links use):

```
dsh plugin --profile web add '@org/dsh-ui-progress@github:<canonical-org>/dsh-ui-progress#v0.9.3'
```

Before running anything, a 5-second pre-flight makes the ref checkable:

```
git ls-remote --tags https://github.com/<canonical-org>/dsh-ui-progress.git | grep v0.9.3
```

**Path B — stay on the mirror (needs one maintainer action first).**
The maintainer pushes the missing tag to both mirrors:

```
git push public  v0.9.3
git push mirror2 v0.9.3
```

then the consumer retries the original command shape with the corrected pin:

```
dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.3'
```

**Mandatory companion steps (either path):**

1. **Remove the broken `v0.9.7` installation first** (remove the
   `@org/dsh-ui-progress` composition row from the `web` profile / re-point it)
   — otherwise the crashing row remains and re-adding leaves a duplicate or
   keeps the crash.
2. Cold-restart dsh and hard-refresh the browser (the client bundle is
   browser-cached), then verify: `dsh --version` still `0.1.1-rc.2`, the progress
   strip slot renders, and the console shows no `useConversation` error.
3. **Do not "fix" this by upgrading the host.** The consumer's freeze forbids
   it, and the artifact's target (`dsh-v0.1.2-alpha.1`) is an alpha line — the
   correct move is the plugin artifact *down* the cohort to the frozen host, not
   the host up.
4. **Do not fall back to `#v0.9.0` / `#v0.9.1`** just because they exist on the
   mirror: the published compat table does not cover them for `0.1.1-rc.2`.
   Per the skill's discipline, an uncarded corridor is "pending review", not a
   recommendation. Use the documented pair `v0.9.3 ↔ 0.1.1-rc.x`.

## 6. Maintainer-side fix — so both defects cannot recur

### 6.1 Release tooling (fixes the tag-distribution defect)

1. **Push tags in the sync loop.** The per-mirror sync must transfer the release
   tag, not just the branch:
   ```bash
   for remote in public mirror2; do
     git push "$remote" "refs/tags/$RELEASE_TAG"   # tags first
     git push "$remote" HEAD:main
   done
   ```
   (`git push --follow-tags "$remote" HEAD:main` is the minimal one-line form.)
2. **Never force-push to `origin`.** Drop `--force-with-lease` for the canonical
   remote; force semantics belong on mirrors only.
3. **Add a release gate that fails the release on missing tags.** After pushing:
   ```bash
   for remote in public mirror2; do
     git ls-remote --tags "$remote" | grep -q "refs/tags/$RELEASE_TAG" || fail "$remote missing $RELEASE_TAG"
     # also compare the dereferenced SHA of the tag on each mirror to the local tag object
   done
   ```
   Standing rule (matching the ecosystem's release discipline): *every tag the
   docs reference must exist on every mirror, with the remote SHA and tag target
   verified per mirror* — a release is not done until that check passes.
4. **Make the README rewrite mirror-aware.** The sync script's "rewrite
   install-source orgs for the target mirror" step must rewrite *only the org*,
   and may only emit pins that the tag-existence gate just verified on that
   mirror. A docs rewrite that can point at a nonexistent ref is how the README
   ended up instructing consumers to pin `#v0.9.5`.

### 6.2 Docs & routing (fixes the version-routing defect)

5. **Never make "newest tag" the default install instruction.** The README's
   default command must route by the consumer's runtime:
   - Step 0: "run `dsh --version`";
   - then a per-cohort pin table right next to the command, e.g.
     - dsh `0.1.1-rc.x` → `#v0.9.3`
     - dsh `0.1.2-alpha.x` → `#v0.9.7`
   - The full compat matrix (plugin version ↔ DSH version, with verification
     status) ships beside the install command, as in `compat-table.md`.
6. **Prefer cohort channel tags over recency.** Publish moving tags per host
   cohort (e.g. `#dsh-0.1.1`, `#dsh-0.1.2-alpha`) so the docs command never has
   to name a specific release to be correct, and frozen-runtime users always
   have a valid target.
7. **CI install/boot smoke per documented pin.** For each README pin: resolve
   the tag from each mirror, install against the paired DSH cohort, cold-boot
   the profile, and assert the slot entry mounts. Attempt 2's crash — an
   artifact calling a host seat that doesn't exist on the paired cohort — is
   exactly what this matrix catches (at minimum, static-assert the required host
   API symbols exist in the paired cohort before release).
8. **Dual-track releases.** When the plugin's main line crosses to a newer DSH
   host, cut a maintenance version from the older-cohort line at the same time,
   so the docs always offer a valid pin for every still-supported host — rather
   than leaving frozen-runtime users with only "the tag that crashes".

## 7. Residual risk / evidence gaps (stated honestly)

- The fixture's `ls-remote` output covers only the `public-org` mirror; tag
  presence on `mirror2` cannot be confirmed from the evidence, and neither can
  the canonical repo's tag list (whether `v0.9.2`–`v0.9.6` ever existed there).
  The verifiable defect stands regardless: the README instructed consumers to
  pin a tag the mirror does not serve, and the sync script contains no tag-push
  step.
- Attempt-1's exact stderr was not included in the fixture (the fixture README
  notes the crash symptom is quoted in the brief only); the
  ref-non-resolution classification follows directly from the `ls-remote`
  listing plus the later success of the same command shape with `#v0.9.7`.
- The canonical org name (the sync script's `origin`) is not in the fixture;
  Path A's command carries a `<canonical-org>` placeholder that the consumer
  fills from the plugin's official repository link.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.