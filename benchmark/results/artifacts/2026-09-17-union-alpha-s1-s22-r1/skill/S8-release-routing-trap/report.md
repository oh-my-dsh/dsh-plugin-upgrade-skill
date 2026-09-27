# S8 — Release routing diagnosis

## Scope and method

Mode A: read-only inspection. The consumer must remain on DSH 0.1.1-rc.2. No installation, migration, package script, remote access, commit, push, or publishing was performed. Only this report is an intended output.

Evidence root: E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S8-release-routing-trap/environment/fixture

All five fixture files were read in full. The failure symptoms and attempted commands come from E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S8-release-routing-trap/instruction.md, also read in full.

## Completed — findings

### 1. Attempt 1: missing release tag, not a consumer error

ls-remote-tags.txt lists the public-org/dsh-ui-progress mirror's tags through v0.9.1, then v0.9.7. **v0.9.5 does not exist on that mirror**, so the README's exact Git selector cannot resolve:

~~~sh
dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.5'
~~~

sync-script.sh explains the release-engineering defect. Its loop visits origin, public, and mirror2 but pushes only:

~~~sh
git push --force-with-lease "$remote" HEAD:main
~~~

That explicit branch refspec does not distribute release-tag refs. Rewriting installation-source organizations and synchronizing main is not release-tag synchronization. The supplied listing demonstrates incomplete tag distribution on the consumer-facing mirror; it does not establish what tags exist on origin or mirror2. The presence of v0.9.7 does not prove that this script transported it, and its separate publication history is not supplied.

This is a deterministic missing-ref failure, not evidence of a network outage, a typo, or a pnpm defect. Tags v0.9.2–v0.9.6 are absent in the supplied listing, including the proposed compatible version v0.9.3.

### 2. Attempt 2: newer client artifact on an older runtime

| Identity | Supplied evidence |
|---|---|
| Plugin install/package coordinate | @org/dsh-ui-progress; manifest not supplied for independent verification |
| Git source coordinate | github:public-org/dsh-ui-progress; independent of package scope |
| Consumer runtime | dsh-version.txt: DSH 0.1.1-rc.2 |
| Plugin v0.9.3 target | compat-table.md: npm @deepseek-ai/dsh@0.1.1-rc.1, real-boot verified there; rc.2 described as additive image preprocessing |
| Plugin v0.9.7 target | compat-table.md: dsh-v0.1.2-alpha.1, migrated client API using views/legacy projection and the useConversation seat |

**v0.9.7 targets the newer DSH 0.1.2-alpha.1 client API, but the consumer runs the older DSH 0.1.1-rc.2 runtime.** The slot entry expects a useConversation seat that the older runtime does not supply as the required function. Calling it produces the reported TypeError. This is not the opposite direction of an old plugin broken by a host upgrade: the host stayed frozen while the plugin artifact moved forward.

The v0.9.7 tag resolves, which explains installation succeeding. Resolving/downloading a package does not prove browser API compatibility. Restarting the same runtime cannot add the missing API. No source or stack trace establishes the exact import/props access, so this report does not invent its module path or assert an export-level diagnosis.

The skill's references/README.md connects the relevant directed edge dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.1. Card DSH-0.1.2-A1-03 in references/v0.1.2-alpha.1.md corroborates the client snapshot/projection changes. The fixture itself supplies the specific useConversation requirement. references/v0.1.1-rc.2.md records three conditional image-related behavior changes; it is curated evidence, not proof that every rc.1 plugin works unchanged on rc.2.

### 3. Exact remedy under the production freeze

**Select plugin v0.9.3, not v0.9.7, and keep DSH at 0.1.1-rc.2.** The supplied compatibility table supports this older plugin line: v0.9.3 was verified on rc.1 and rc.2 is described as additive. This is a documented compatibility recommendation, not a new runtime test performed here.

There is a necessary prerequisite: **v0.9.3 is also missing from the listed public mirror.** The maintainer must restore the authentic, verified v0.9.3 release tag to the consumer-facing mirror (and synchronize both public mirrors), without moving an existing tag or relabeling newer code as v0.9.3. After verifying the ref and release identity on that mirror, the concrete consumer command is:

~~~sh
dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.3'
~~~

This command is a recommendation, not executed here, and **will not resolve against the currently supplied mirror listing** until the tag is restored. An already-verified alternate mirror or a verified immutable v0.9.3 commit could serve instead, but neither its coordinates nor a SHA is supplied; no unconditional alternate command can honestly be given. Do not substitute main, guess a SHA, or choose v0.9.1 merely because its tag exists—its compatibility is not documented in this evidence.

Replace or disable the broken v0.9.7 entry using the runtime's supported profile management, preserving unrelated configuration and retaining only one intended plugin entry. Verify the web profile resolves the v0.9.3 identity, reload the actual browser artifact, and exercise the progress slot. Removing the crash by disabling the plugin is interim containment, not restored functionality. No DSH host upgrade is needed or proposed.

### 4. Maintainer fix: distribution and routing are separate gates

**Release tooling**

- Add explicit, non-forced release-tag publication to every configured release remote, including origin and both public mirrors. For example, the relevant maintainer-side operation for the recovery tag is git push "$remote" refs/tags/v0.9.3:refs/tags/v0.9.3. This is a proposed operation only; no push was run.
- Backfill authentic missing release tags from the release source, including v0.9.3 and v0.9.5 if they are verified releases. Fail on conflicting existing tag identities; do not force-move or delete release tags.
- Gate release completion and README publication on each advertised mirror resolving every advertised tag to the approved release identity. A branch push success is insufficient. Check tag objects and peeled commits where relevant, and account explicitly for mirror-specific README transformations without tagging current main as an older release.
- Make partial mirror failures visible and fail the release job. Test the sync procedure with both lightweight and annotated tags. Explicit tag refspecs avoid relying on --follow-tags, which covers only eligible annotated tags; a controlled --tags publication is another option when every local tag is approved for distribution.

**Documentation and compatibility routing**

- Replace the single newest-tag default with a visible runtime-first chooser: run dsh --version, select the documented compatible plugin line, then copy the exact pinned command for the chosen mirror.
- For the supplied rows, route DSH 0.1.1-rc.1/rc.2 consumers to plugin v0.9.3, and DSH 0.1.2-alpha.1 consumers to plugin v0.9.7. Do not infer compatibility with all later DSH versions from one tested target.
- Put the compatibility table, per-runtime commands, mirror availability, and the wrong-line symptom (useConversation is not a function) next to installation instructions. Explain that restart and successful install do not establish compatibility.
- Record supported DSH cohorts in supported package/manifest compatibility metadata and add a tested pre-activation check where available. Do not assume a metadata field alone is enforced by the installer. Reject an unsupported client with an actionable version message instead of crashing its slot.
- Gate each supported artifact/runtime pair on static checks and a real Web mount/core-behavior smoke, and test rejection of the known incompatible pair. Keep plugin SemVer separate from DSH host versioning; select a release bump deliberately. A blanket mandatory MAJOR.MINOR bump for every host-target change is not established by the loaded skill or fixture and is not a substitute for routing.

## Validation and limitations

**Pre-existing:** not collected; Mode A static evidence pack, not Mode C baseline execution.

**Completed:** read the brief, skill methodology, all five fixture files, the corridor index, and relevant rc.2/alpha.1 reference material. Diagnosed both failures and produced conditional recovery and prevention steps. A grep script had a duplicate-variable syntax error and a spill-file read used an out-of-range offset; these were inspection errors, not plugin test failures.

**Skipped:** installs, lifecycle scripts, source changes, build/typecheck/tests, real host/browser mount, live mirror queries, dependency graph inspection and full seven-class source scan. They are outside this read-only release-evidence task or require artifacts not supplied. No passing runtime or installation validation is claimed. No optional migration capability was adopted.

**Pending/residual risk:** publication of authentic v0.9.3; confirmation of its tag identity and distributable artifact; a real rc.2 browser validation; the second mirror's state; actual package manifest/dependency cohort, lockfile, installation scripts, Node version, Git SHA/branch/worktree and profile configuration. The static fixture is not a checkout of the plugin, so those identities cannot be reconstructed from it. No assertion is made that metadata is absent merely because it was not supplied.

**Validation plan after recovery:** verify exact tag resolution on both mirrors; inspect the artifact manifest and package identity; use the profile's existing package manager/lockfile; inspect full dependency resolution for unexpected DSH cohorts; confirm one enabled v0.9.3 entry; cold-boot the frozen rc.2 profile, load its advertised browser resource, prove registration and progress-slot behavior, and fail on page errors. Capture exit/error output and teardown where applicable. Resource HTTP 200 alone is not sufficient.

**Rollback:** this inspection changed no consumer or fixture state. No consumer lockfile/config backup or source SHA was supplied, so no restoration was executed or claimed. Before an actual plugin replacement, preserve only the owned manifest/lockfile/profile rows and their hashes, then restore only those paths if needed. Disabling the failing plugin remains containment. Such backups cannot promise rollback of arbitrary lifecycle-script side effects or make v0.9.7 compatible with rc.2.

**Inspection integrity note:** one overly broad read-only grep unintentionally returned snippets from benchmark solutions, judges, and prior reports. Those are not evidence for this report; no such file was subsequently opened. Findings above are supported by the task brief and the five fixture files, with the explicitly identified skill references as background. No fixture or benchmark repository file was intentionally written.
