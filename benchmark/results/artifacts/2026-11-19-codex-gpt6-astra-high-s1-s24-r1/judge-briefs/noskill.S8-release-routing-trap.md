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
#### FILE: S8-release-routing-trap/diagnosis.md

# Release routing diagnosis

## Attempt 1: missing release ref

The supplied `ls-remote-tags.txt` for `public-org/dsh-ui-progress` contains no `refs/tags/v0.9.5`. The README command requests that exact Git ref, so the mirror cannot resolve it. This is a release-distribution defect, not evidence of a malformed command or a consumer network problem.

`sync-script.sh` explains the distribution gap: its loop pushes only `HEAD:main` to origin, public, and mirror2. A branch push does not publish release tags. Updating the mirror branch therefore does not make the README's pinned release available. The excerpt establishes the missing tag synchronization mechanism; it does not prove whether v0.9.5 exists at the source or on mirror2. The pack supplies no pnpm log, so the exact diagnostic text is unknown.

## Attempt 2: newer plugin on an older host

The public listing does contain v0.9.7, explaining why changing the pin permits resolution. Installation success does not establish host API compatibility.

`compat-table.md` routes plugin v0.9.7 to DSH `dsh-v0.1.2-alpha.1`, whose client API includes the migrated views/legacy projection and `useConversation` seat. `dsh-version.txt` establishes the consumer actually runs `0.1.1-rc.2`. Thus a plugin migrated forward to alpha.1 is being loaded into an older rc.2 runtime; the supplied `TypeError: useConversation is not a function` is consistent with that unavailable callable API. This is not an old plugin failing on a new host. Restarting the same runtime cannot supply the newer API. No browser log or source code is supplied to independently inspect the failing binding.

## Remedy under the runtime freeze

Keep DSH at `0.1.1-rc.2` and route this consumer to plugin **v0.9.3**. The compatibility table identifies v0.9.3 as real-boot verified on npm DSH `0.1.1-rc.1` and describes rc.2 as rc.1 plus additive image preprocessing. That supports selecting the rc-compatible release, but is not a claim that an rc.2 boot test was performed in this task.

There is a necessary publication prerequisite: the provided public mirror listing also lacks **v0.9.3**. Merely changing the README pin to v0.9.3 would reproduce the first failure today. The maintainer must locate and verify the authentic v0.9.3 release artifact/ref, publish that immutable tag and its target to both public mirrors, and confirm the public ref resolves to the intended compatible release. Do not retag the alpha.1 code as v0.9.3.

After that prerequisite, the concrete consumer command is:

```sh
dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.3'
```

Ensure the effective plugin selection replaces the installed v0.9.7 with v0.9.3 using the runtime's supported replacement procedure if `add` does not replace an existing plugin; the evidence does not document those CLI semantics, so no uninstall/replace flags are invented here. Verify the selected version and smoke-test the slot on the unchanged rc.2 runtime.

No immediately usable, already-published compatible install target is established by this pack. Older listed tags have no supplied compatibility mapping, and there is no second-mirror inventory or verified source URL to justify an alternate command. If the authentic v0.9.3 artifact cannot be recovered, the maintainer must produce and validate an rc.2-compatible backport and publish it under a new immutable version before providing its install pin. Upgrading the host to alpha.1 is outside the consumer's constraint.

## Prevent recurrence: release tooling and documentation

1. Publish explicit release tag refs, not only branches, to every advertised mirror. For an authenticated existing local release tag, the relevant operation is `git push <remote> refs/tags/v0.9.3:refs/tags/v0.9.3`; use the selected release tag for future releases. This is a proposed maintainer action, not a command executed here. Backfill missing legitimate advertised releases, including v0.9.5 if it is an actual intended release. Preserve immutable tags and fail on conflicting remote targets rather than force-moving them.
2. Account for per-mirror install-source rewriting: verify that each published tag points to its intended release contents, not just that main contains rewritten documentation. Audit both mirrors; the current evidence directly inventories only one. Make the workflow fail if any mirror lacks the requested ref or resolves it to unexpected contents. Confirm annotated tags by their peeled targets where applicable.
3. Gate release announcement and README install commands on successful publication verification for every advertised mirror. Test the exact documented Git install spec in a clean environment, then boot the slot on each declared supported runtime. Installation and runtime compatibility are separate checks. Add direct rc.2 coverage rather than treating rc.1 testing as an rc.2 test.
4. Put a version-selection table next to installation instructions, ask consumers to check `dsh --version`, and provide explicit pins: rc.1/rc.2 users select the verified rc-compatible v0.9.3 release once published; alpha.1 users select v0.9.7. Do not globally replace a working compatibility pin with the numerically newest tag. Document minimum supported runtime and migration boundaries in release notes and supported package/plugin metadata; use an early compatibility check where the host supports one.
5. Correct or remove the unsupported default v0.9.5 instruction. Publishing its missing tag alone does not establish that it is compatible with rc.2; the supplied table gives no such guarantee.

## Scope and evidence limits

Single static, no-skill analysis using only this cell's instruction and fixture. No network requests, installs, migrations, publishing, runtime execution, grading, or fixture edits were performed. The report is complete; execution of the consumer remedy is blocked by the missing compatible public tag and remains a maintainer publication action. Remote state and boot success have not been independently validated.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.