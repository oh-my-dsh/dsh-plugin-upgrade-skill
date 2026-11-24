# S13: peer range satisfaction is not runtime compatibility

The supplied evidence establishes that `@deepseek-harness-tui/dsh-tui@0.1.0-beta.4` reads a Session API removed before the installed host, `@deepseek-ai/dsh@0.1.2-alpha.5`. Installation succeeded because the declared version constraints accept alpha.5, not because npm verified the plugin's API usage.

## Exact incompatibility and release boundary

The **dsh-v0.1.2-alpha.4** changelog, “Other Changes,” explicitly says: **“Replace `Session.events` with on-demand read APIs”** and names `seq`, `eventAt()`, and `snapshotEvents()`. The eagerly materialized events array was removed to reduce memory overhead in long sessions. See [the supplied changelog](../../fixture/dsh-changelog-excerpt.md); the skill's `references/v0.1.2-alpha.4.md`, card **DSH-0.1.2-A4-03**, corroborates the API mapping.

The [plugin excerpt](../../fixture/plugin-source-excerpt.js) reads `liveAgent.session.events` and passes `agent.session.events` to `replayEvents`. On the newer API those reads yield `undefined`; attempting to iterate that value produces **`TypeError: events is not iterable`**. The [stack](../../fixture/crash-stack.txt) traces `prepareReplayEvents` → `replayEvents` → `createChannel` → `apply`, locating the failure in the plugin's replay/startup path. The excerpt also identifies `.events.at(-1)` and reports 42 Session `.events` references; fixing only the first read would leave additional failure sites.

For migration, whole-log reads become `session.snapshotEvents()`, lengths become `session.seq`, and indexed reads become `session.eventAt(SessionSeq(i))` with valid indices and the target's branded sequence constructor. The snapshot represents a point in time, so code requiring live events must refresh it after appends. `ownEvents()` is available for only the current session's appended events, excluding inherited events; it is not an interchangeable full-history replay replacement. This is an alpha.4 break inherited by alpha.5, not a newly introduced alpha.5 break.

## Why npm emitted no peer warnings

The [npm evidence](../../fixture/npm-install-output.txt) declares `^0.1.2-alpha.2` for `dsh-session`, `dsh-agent`, `dsh-llm`, and the other DSH peers. Its comparator interval is `>=0.1.2-alpha.2 <0.2.0-0`, subject to normal semver prerelease eligibility rules. Alpha.5 has the same `0.1.2` base as the explicitly admitted prerelease and is later than alpha.2, so it satisfies this range. This does not mean every prerelease with any base inside the interval is admitted by default.

A satisfied peer constraint establishes only that the resolved package version matches the author's declared acceptable version set. It does not establish that the declaration is accurate, that the author tested alpha.5, or that `Session.events` still exists. npm does not prove behavior by inspecting and executing every plugin code path against the host. In particular, prerelease ordering and a broad caret declaration do not prevent breaking API changes during alpha development. Lack of warnings is also not, by itself, a complete audit of which dependency copies load at runtime; this fixture separately states that the host bundles alpha.5 peers.

**Peer range satisfaction is a static package-metadata/version comparison. Runtime compatibility is whether the plugin's actual code and behavioral assumptions work with the APIs, services, and environment actually loaded.** Examples that can pass the former and fail the latter include:

- A removed or renamed API/export/property: here the absent `Session.events` becomes a non-iterable value.
- Changed method signatures, return types, event payload shapes, or validation rules: old arguments or property reads can throw even while the package versions satisfy all ranges.
- A missing runtime service/provider or changed activation/composition requirement: a package can resolve successfully while the service the plugin calls never activates.

## What the author should do

Before publishing, test the **actual target alpha.5 cohort**, with coherent exact package versions rather than stale alpha.2 declarations or mocks. Typecheck against that target's declarations, and boot the packaged plugin in an isolated real alpha.5 profile. Exercise startup transcript replay with empty and populated sessions, history updates after append, and inherited/forked history where supported. A clean npm install is only the dependency-resolution layer. Maintain a compatibility matrix covering the versions claimed, especially release boundaries such as alpha.3 → alpha.4; repeat those tests when widening support.

Metadata should truthfully encode the supported host/package version interval, including known exclusions or upper bounds. For this unmigrated release, a provisional bound such as `>=0.1.2-alpha.2 <0.1.2-alpha.4` excludes the known broken boundary, **but only claim alpha.2/alpha.3 if testing establishes their support**; exact tested versions are safer when evidence is limited. Merely raising the minimum to alpha.4 or alpha.5 would not repair the code. After migration and validation, publish a fixed plugin release with a range reflecting the versions actually supported.

Peer dependencies describe consumed peer-package versions. `engines.node` describes the supported Node runtime; a host-specific `engines.dsh` can describe supported DSH versions only where the host/tooling recognizes and enforces it. Do not assume npm or this alpha.5 host enforces an arbitrary engines key, and do not use Node's engine range to represent a Session API requirement. Metadata cannot express or prove that an object has a callable `snapshotEvents` or an iterable `events` property.

Add a runtime feature-detection guard before replay: check for a callable `session.snapshotEvents`, then use it with the correct receiver. If supporting the old API intentionally, check that `session.events` is actually iterable before using that branch. If neither supported contract exists, stop activation with a clear incompatibility message naming the required API and supported host versions. Do not silently replace missing history with an empty array, which hides the failure and loses replay data. Detection must accompany an implemented, tested compatibility path; a guard alone does not make a broken plugin compatible.

## A concrete pre-install check the user can do now

**Compare the exact candidate plugin's source/API usage with the target host changelog before installing.** For this evidence pack, run this read-only scan from the fixture directory:

```powershell
rg -n '\.events\b' plugin-source-excerpt.js
Get-Content -LiteralPath dsh-changelog-excerpt.md
```

The Session `.events` reads plus the alpha.4 removal entry already identify a known blocker for alpha.5, regardless of the peer match. For an actual release, inspect the exact version's locally obtained source or unpacked package without executing lifecycle scripts, search the corresponding replay implementation, and check the author's target-version test matrix/release notes. Merely repeating a semver check or an install dry run will not detect this API removal. Prefer a plugin release explicitly migrated and tested on alpha.5; this evidence pack does not identify such a release.

## Scope and validation record

- **Pre-existing:** Mode C baseline not collected; this is Mode A read-only diagnosis. The startup failure is supplied evidence, not a newly reproduced test.
- **Completed:** Read the skill, applicable alpha.4 card, and all five fixture files; correlated exact versions, source accesses, changelog boundary, and stack. Produced this report under BENCHMARK-AUTH-v1.
- **Skipped:** Installs, migrations, lifecycle scripts, profile changes, network access, and runtime execution are outside this task. No source repository SHA, lockfile, Node version, or full dependency tree is supplied; those facts are not invented.
- **Pending/residual risk:** A full plugin audit and real-host validation are needed to certify a corrected release. The excerpt alone cannot establish every compatibility issue or a known-good replacement version.
- **Rollback:** Fixture and installation were unchanged. Only this report was written; no runtime rollback is necessary.
- **Recommendations:** Correct all Session event reads, align compatibility metadata with verified support, and provide an actionable runtime feature guard. No blocker prevented the requested report.
