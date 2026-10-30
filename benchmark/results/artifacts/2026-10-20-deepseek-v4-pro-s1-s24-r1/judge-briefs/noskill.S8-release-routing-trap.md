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
#### FILE: S8-release-routing-trap/report.md

# S8 · Release Routing Trap — Release-Engineering Diagnosis

Consumer runtime (frozen, cannot upgrade): dsh 0.1.1-rc.2 (from fixture/dsh-version.txt).

## Evidence consulted
- fixture/dsh-version.txt — consumer `dsh --version` -> 0.1.1-rc.2
- fixture/ls-remote-tags.txt — git ls-remote --tags on the public mirror
- fixture/compat-table.md — plugin<->DSH compatibility matrix (from plugin README)
- fixture/sync-script.sh — release sync script excerpt

## 1. Attempt-1 root cause — tag-distribution defect (why #v0.9.5 cannot resolve)

The mirror's tag list contains v0.1.0 ... v0.9.1 and then jumps straight to v0.9.7. The entire
v0.9.2 ... v0.9.6 range is absent — there is NO v0.9.5 tag on the mirror, so pnpm fails to resolve
#v0.9.5. This is a release-engineering defect, not a consumer network or command issue.

Root cause is in sync-script.sh: after a release it pushes only the branch, never the tags:

    git push --force-with-lease "$remote" HEAD:main

HEAD:main distributes the main branch ref only; there is no --tags, --follow-tags, or explicit
tag ref, so release tags are never propagated to public / mirror2. The older tags still visible
(v0.1.0 ... v0.9.1) are remnants of an earlier correct process; the newer tags (v0.9.2+) never
reached the mirror, leaving the README's pinned #v0.9.5 dangling.

## 2. Attempt-2 root cause — version-routing defect (why #v0.9.7 installs but crashes)

v0.9.7 is not a compatible patch bump for this consumer. Per compat-table.md, v0.9.7 migrated the
plugin to the dsh 0.1.2-alpha.1 client API (views/legacy projection + useConversation seat). The
consumer runs 0.1.1-rc.2, an older line that does not export useConversation, so the plugin's slot
entry calls useConversation(...) and throws `TypeError: useConversation is not a function`.
Restarting dsh cannot help: the installed artifact and the runtime are on different API generations.

Compatibility direction: v0.9.7 targets a DSH version NEWER than the consumer's (0.1.2-alpha.1 >
0.1.1-rc.2). Bumping the README to "the newest tag" routed the consumer to an artifact built for
the wrong runtime line. The compat table ties the consumer's runtime to the rc line: v0.9.3 targets
0.1.1-rc.1, and rc.2 = rc.1 + image preprocessing (additive), so v0.9.3 is the verified compatible
release for 0.1.1-rc.2.

## 3. Exact remedy for the consumer (works on the frozen 0.1.1-rc.2 runtime)

Pin the newest tag that is BOTH present on the mirror AND on the pre-alpha (rc) line — not v0.9.7,
and not #main / #latest (which already point at the alpha line).

Additional trap: the verified rc release v0.9.3 is ALSO missing from the mirror (same
tag-distribution defect), so it cannot be installed until the maintainer restores the tag.

- Immediate self-serve command (newest rc-line tag present on the mirror = v0.9.1):

    dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.1'

- Preferred pin once the maintainer re-publishes the missing tags (v0.9.3, the verified
  rc-compatible release):

    dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.3'

## 4. Maintainer-side fix (prevent both defects)

Release tooling — distribute tags with every release:
- Change the sync push to carry tags, e.g. `git push --follow-tags "$remote" HEAD:main` (or --tags,
  or an explicit `git push "$remote" "refs/tags/v$VERSION"`).
- Add a release gate / CI check that runs `git ls-remote --tags <each-mirror>` after every release
  and fails if the new tag is absent from any mirror.
- Backfill: re-push the missing v0.9.2 ... v0.9.6 tags (especially v0.9.3) to both mirrors.

Docs — route by compatibility, not "newest":
- Replace the hard-coded default #vX.Y.Z pin and the "bump README to newest tag" habit with a
  maintained compatibility matrix plus per-runtime install snippets that pin the correct tag for
  each supported DSH line (route to "newest compatible", never the global newest).
- Make the breaking-change boundary (alpha client-API migration) explicit in the matrix and notes.

Plugin hardening:
- Declare a peerDependency on @deepseek-ai/dsh, and/or add a startup guard that detects the host API
  surface and fails with a clear message (e.g. "requires dsh >= 0.1.2-alpha.1; detected 0.1.1-rc.2")
  instead of a raw TypeError.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.