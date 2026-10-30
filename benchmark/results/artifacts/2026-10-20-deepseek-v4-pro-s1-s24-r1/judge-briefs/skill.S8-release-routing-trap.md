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
#### FILE: S8-release-routing-trap/report.md

# S8 · Release Routing Trap — Release-Engineering Diagnosis

## Conclusion (two distinct root causes)

- **Attempt 1 (`#v0.9.5` fails)** → *tag distribution defect*: the release sync never pushes tags to the mirrors, so the README-pinned tag is absent from the advertised mirror.
- **Attempt 2 (`#v0.9.7` installs but crashes)** → *version routing defect*: the "newest tag" targets a newer DSH than the frozen runtime, so it calls a client seat that does not exist on the host.

## Evidence (fixture, read-only)

- `dsh-version.txt`: runtime is **0.1.1-rc.2**.
- `compat-table.md`:
  - v0.9.3 → npm `@deepseek-ai/dsh@0.1.1-rc.1` (rc.1 real-boot verified; **rc.2 = rc.1 + image preprocessing (additive)**);
  - v0.9.7 → **dsh-v0.1.2-alpha.1** (migrated to the alpha.1 client API: views/legacy projection + `useConversation` seat).
- `ls-remote-tags.txt`: the `public-org/dsh-ui-progress` mirror carries tags v0.1.0 … v0.9.0, v0.9.1, **v0.9.7** — with **no v0.9.2–v0.9.6**. So `v0.9.5` (and `v0.9.3`) are missing from that mirror.
- `sync-script.sh`: `git push --force-with-lease $remote HEAD:main` — pushes the **branch only**, never tags.

## 1. Attempt-1 root cause — why `#v0.9.5` could not resolve

Release-engineering defect: **tag distribution is not part of the release sync.** The sync script pushes only `HEAD:main` to each remote and never pushes tags (`--tags` / `refs/tags/*`). The mirror tag set is therefore stale and incomplete, and the README default pin `#v0.9.5` points at a tag that does not exist on the mirror (`ls-remote-tags.txt` has no `v0.9.5`). pnpm resolves a Git `#<tag>` dependency against the remote tag refs, so an absent tag fails immediately.

This is the maintainer distribution gap, **not** the network or the command. (Same class as the install-channel "mirror lag / missing ref" pitfall — rollup-0.1.2 **R-08**.)

## 2. Attempt-2 root cause — installed but crashes at slot entry

Version routing: the "newest tag" is **forward-incompatible** with the frozen runtime. `compat-table.md` maps **v0.9.7 → dsh 0.1.2-alpha.1**, migrated to the alpha.1 client API (views/legacy projection + `useConversation` seat — the session-view split, card **DSH-0.1.2-A1-03**). The runtime is **0.1.1-rc.2**, which predates the alpha.1 client surface and does not provide the `useConversation` seat. The slot entry reference to `useConversation` is therefore `undefined` → `TypeError: useConversation is not a function` at mount. Restarting dsh cannot help because the API is absent at that host version, not broken.

**Compatibility direction:** the v0.9.7 artifact targets a **newer** DSH (0.1.2-alpha.1) than the **0.1.1-rc.2** runtime. The plugin requires a newer host API; it is not an old plugin failing on a new host.

## 3. Remedy for the consumer right now (frozen at 0.1.1-rc.2)

Use the plugin release that targets the consumer cohort. `compat-table.md` shows **v0.9.3 targets 0.1.1-rc.1**, and rc.2 is rc.1 + additive image preprocessing, so v0.9.3 is compatible with 0.1.1-rc.2. v0.9.7 is **not** (targets alpha.1). Concrete command:

```
dsh plugin --profile web add @org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.3
```

Caveat tied to defect 1: the mirrored tag set in `ls-remote-tags.txt` also lacks `v0.9.3`, so the maintainer must first push the v0.9.3 tag to the mirror (§4a), or the consumer installs from a source where the v0.9.3 tag resolves (the canonical repo, or a mirror after tag sync). The version choice is fixed by the freeze; tag availability on the chosen source is the maintainer-side prerequisite.

## 4. Maintainer-side fix so neither defect recurs

**(a) Tag distribution (defect 1).**
- Push tags in the sync script, e.g. add after the branch push: `git push --force-with-lease $remote refs/tags/*:refs/tags/*` (or `--tags`).
- Gate release completion on verification: `git ls-remote --tags <each mirror>` must contain the just-released tag **before** the README default is updated.
- Never point the README default at a tag until that tag is confirmed present on every advertised mirror.

**(b) Version routing (defect 2).**
- Declare the plugin DSH compatibility range in the manifest (peer range in `package.json` / `dsh-plugin.json`), not only in a README table, so host peer enforcement can refuse a mismatched runtime (DSH peer-range enforcement at install/startup — **v0.1.7-rc.1** cards).
- Make the install command runtime-aware: per-cohort pins (0.1.1-rc.x → `#v0.9.3`; ≥ 0.1.2-alpha.1 → `#v0.9.7`), or publish both compatibility lines under distinct npm dist-tags (`latest` vs `legacy`) so a stable-host user is never auto-routed to the new-host release (dist-tag split — rollup-0.1.2 **R-07/R-08** region).
- Add CI that cross-checks the compat table against the declared peer range for every tag before release.

## Limits

- Only the `public-org` mirror tag state is evidenced (one `ls-remote` snapshot). The second mirror is expected to show the same gap because the sync script applies identically (branch-only) to both, but it is not directly observed here.
- The attempt-2 crash symptom is quoted in the brief, not shipped as a log file (per `fixture/README.md`).


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.