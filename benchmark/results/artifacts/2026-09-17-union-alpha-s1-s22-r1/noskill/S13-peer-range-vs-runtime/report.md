# S13 · Peer range versus runtime compatibility

## Finding and evidence

The affected plugin is @deepseek-harness-tui/dsh-tui@0.1.0-beta.4 running on dsh 0.1.2-alpha.5. **dsh v0.1.2-alpha.4 removed `Session.events`, the eagerly materialized events array, and replaced it with on-demand access through `seq`, `eventAt()`, and `snapshotEvents()`.**

Source: E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S13-peer-range-vs-runtime/environment/fixture/dsh-changelog-excerpt.md, heading “dsh-v0.1.2-alpha.4 release notes”, “Other Changes”: “Replace `Session.events` with on-demand read APIs”; the array was removed “to reduce memory overhead in long sessions.” The entry explicitly warns developers to pay attention to compatibility.

The same fixture directory contains:

- plugin-source-excerpt.js: `liveAgent.session.events` near line 734 and `replayEvents(agent.session.events)` near line 6685; another occurrence uses `session.events.at(-1)`. The excerpt reports 42 session `.events` references; that count is supplied evidence, not a scan I performed.
- crash-stack.txt: `TypeError: events is not iterable` in `prepareReplayEvents` at channel.js:623:25, called through `replayEvents`, `createChannel`, and plugin `apply`. The loader wraps the failure as “plugin tree failed to load.”
- npm-install-output.txt: installation succeeded without peer warnings, with the peer packages at alpha.5 satisfying the declared ranges.

The causal chain is direct: the plugin reads the removed property, receives no events array, and attempts to iterate it during startup replay. This is an obsolete API assumption in the plugin, not evidence that npm failed its version-range comparison. The additional changelog entry distinguishing `SessionSeq` and `SessionLogOffset` warrants migration review, but does not prove a second runtime failure here; strong typing alone is not a JavaScript runtime change.

## Why installation succeeded

The plugin declares `^0.1.2-alpha.2` for its dsh peers. This expands to `>=0.1.2-alpha.2 <0.2.0-0`, subject to npm-semver prerelease admission rules. Alpha.5 is later than alpha.2 and has the same major/minor/patch tuple, 0.1.2, as the prerelease comparator, so it is admitted. This does not mean every prerelease below 0.2.0 is admitted: prereleases with different tuples are normally excluded unless explicitly admitted.

**Peer-range satisfaction is a static package-metadata check:** does the resolved peer version satisfy the author’s declared version constraint? It communicates the author’s compatibility claim; it does not verify that claim against code.

**Runtime compatibility is a behavioral code-level check:** does the actual loaded host provide the APIs, values, calling conventions, and lifecycle behavior the plugin requires? npm does not compare the plugin’s `session.events` accesses with dsh’s implementation. Install scripts may execute code, but successful installation and peer validation are not a host/plugin integration test. Prerelease ordering is not a promise of API continuity, and 0.x development APIs are unstable.

Thus alpha.5 satisfying the caret range says nothing about whether `Session.events` still exists. Even stable-version metadata cannot mechanically prove that a publisher followed compatibility promises.

## Breakages that can pass peer validation

1. **Removed or renamed properties, methods, or exports:** this case removes `Session.events`; iterating its absent value throws.
2. **Changed returned values or calling conventions:** a formerly synchronous iterable might become a Promise, or a formerly present event payload field might disappear. Unchanged metadata can admit the host while old iteration or property access throws. These are general examples, not additional observed fixture failures.
3. **Module entry-point or export-map changes:** a plugin’s deep import can become unavailable, causing module-load failure despite the top-level package version satisfying its peer range.

Purely type-level changes may break compilation, but are not by themselves evidence of a runtime crash.

## What the author should do

### Validate before claiming support

Test the actual packaged plugin against the concrete target dsh version, including 0.1.2-alpha.5, rather than only against lower-bound development dependencies or relying on a successful install. Integration tests should cover plugin apply/startup, empty and populated session replay, and subsequent event updates. Typecheck against target declarations too, but do not substitute typechecking for runtime tests. Use a CI matrix for each supported prerelease and revalidate support when a new alpha appears. Future releases cannot be tested before they exist; a bounded support claim avoids implying that untested future alphas work.

Audit all session `.events` consumers, not only the first crashing line. Migrate replay and last-event access using the documented `snapshotEvents()`, `seq`, and `eventAt()` semantics, verifying signatures and the distinction between sequence numbers and log offsets in the actual target documentation. The fixture names the new APIs but does not supply their complete signatures or asynchronous/lifecycle behavior, so it is insufficient to justify a drop-in replacement implementation.

### Encode versions in metadata, capabilities in guards

Peer dependencies should encode the supported host-package versions. If alpha.2 and alpha.3 have actually passed tests, an old-API plugin could use `>=0.1.2-alpha.2 <0.1.2-alpha.4`, or exact tested versions. The fixture does not establish that either version passed tests, so this is a conditional recommendation, not a verified support matrix. Widen the range after migration and testing, not merely because a version is numerically later.

Use `engines.node` (and applicable package-manager constraints) for supported execution environments. Standard npm `engines` handling is generally advisory unless strict enforcement is configured; an arbitrary `engines.dsh` field must not be assumed to enforce host compatibility. A host-specific engines constraint helps only if the host explicitly supports and checks it. Neither peers nor engines express the existence of `Session.events`.

At startup, feature-detect the APIs required by the chosen implementation. An unchanged legacy implementation should check that the actual session exposes the required events array and methods, and otherwise fail early with an actionable message: “This plugin requires Session.events, removed in dsh alpha.4; install a plugin version supporting the new session read APIs or use an explicitly supported host.” A migrated adapter can check for the documented callable read methods and required sequence field, using a legacy path only when deliberately supported and tested. Do not silently replace missing history with an empty array. Feature detection improves capability checks and diagnostics, but method presence alone cannot prove full behavioral compatibility; integration tests remain necessary.

## Concrete pre-install check for the user

Before installing into the live host, inspect a local copy of the candidate plugin’s published source or package archive and search its JavaScript for `.events` accesses. Resolve each relevant receiver to a session object: a generic `.events` hit can be unrelated. Compare those uses with release notes between the plugin’s stated baseline and your exact host version. Here the source excerpt already shows session `.events` reads, and the alpha.4 changelog explicitly removes that property. That mismatch is sufficient to flag the plugin before installation; no execution is required.

Also look for CI results or a support matrix naming your exact dsh alpha. A later plugin publication date alone does not prove compatibility, nor does an older date rule out testing a release candidate. Prefer an explicitly tested, migrated plugin release. Pinning an older host is an alternative only after verifying support and considering session-data downgrade compatibility; no downgrade is established safe by this fixture.

## Scope and limitations

This is a read-only analysis of the task brief and all five fixture files. No installation, migration, plugin execution, external request, or benchmark-repository modification was performed. No independent integration test was run, and the report does not claim one passed. The supplied evidence suffices to identify the startup incompatibility; full migration details and a tested compatibility matrix require additional target API documentation and testing outside this task.
