# JUDGE BRIEF · noskill.S13-peer-range-vs-runtime

## Criteria (sealed rubric)
- [removed-api-and-crash] (20pt) Locate session.events reads in plugin-source-excerpt.js and the iteration failure in crash-stack.txt; cite dsh-changelog-excerpt.md for removal at 0.1.2-alpha.4 and replacement by seq, eventAt and snapshotEvents. Explain undefined/non-iterable access. A release number or API name without this causal connection earns no credit.
- [peer-check-boundary] (20pt) Use npm-install-output.txt to explain why alpha.5 satisfies the declared ^0.1.2-alpha.2 range while npm only checks declared package-version compatibility, not API existence or runtime behavior. A peer declaration is an author claim, not evidence that any version was tested. Do not require reproducing the fixture comment’s expanded upper bound; the same-base prerelease ordering is sufficient.
- [distinct-breakage-categories] (20pt) Explain at least two genuinely distinct classes that can pass peer validation and still fail at runtime: removed/renamed API and changed behavior/signature such as sync-to-async, argument order or return shape. Equivalent concrete classes are accepted. Two names for the same removal are not two classes; partial credit for one correctly explained class.
- [author-prevention] (20pt) Require testing the actual supported target versions, then an actionable compatibility policy: narrow the declared peer range to exclude the breaking releases, or implement and verify runtime capability detection with correct old/new paths. Explain the role of version metadata versus runtime guards; an engines field does not itself test DSH API behavior. Both testing and a compatibility policy are required for full credit; either alone is partial.
- [user-preinstall-check] (20pt) Give at least one concrete pre-install investigation: inspect breaking changes between the peer floor and installed target, or inspect the plugin’s API usage against target declarations. Tie the check to this Session.events incident and its compatibility boundary. Merely rerunning npm install or inspecting whether the peer range accepts alpha.5 is insufficient.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [peers-prove-runtime] ceiling=20 The final conclusion claims satisfied peer ranges or an install without warnings prove the plugin’s runtime API compatibility, or denies the documented Session.events removal. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.

## Candidate report(s)
#### FILE: S13-peer-range-vs-runtime/report.md

# S13: Peer range satisfaction versus runtime compatibility

## Diagnosis and evidence

`@deepseek-harness-tui/dsh-tui@0.1.0-beta.4` uses the eagerly materialized `Session.events` array. dsh removed that API in **0.1.2-alpha.4**, replacing it with on-demand read APIs **`seq`, `eventAt()`, and `snapshotEvents()`**. The release notes explicitly say the array was removed to reduce memory overhead in long sessions and call out compatibility concerns. Source: [dsh changelog excerpt](../../fixture/dsh-changelog-excerpt.md), “dsh-v0.1.2-alpha.4 / Other Changes,” first bullet.

The [plugin source excerpt](../../fixture/plugin-source-excerpt.js) reads `liveAgent.session.events` near original `channel.js:734` and passes `agent.session.events` to `replayEvents` at original line 6685. The [crash stack](../../fixture/crash-stack.txt) then reports `TypeError: events is not iterable` in `prepareReplayEvents` at line 623, reached through `replayEvents` and `createChannel`. Together these establish a stale session API dependency: replay expects an iterable array that the host no longer supplies. An absent property ordinarily reads as `undefined`; no live debugger inspection was performed here. The excerpt reports 42 session `.events` references, so fixing just the first failing access is insufficient.

The separate changelog item about strong `SessionSeq` and `SessionLogOffset` types is another migration concern, but the provided stack does not establish it as the cause of this crash.

## Why installation succeeds

The [npm output](../../fixture/npm-install-output.txt) records successful installation without peer warnings. Its declared peer range, `^0.1.2-alpha.2`, expands to `>=0.1.2-alpha.2 <0.2.0-0` under npm semver rules. Alpha.5 is within those bounds and shares the prerelease comparator’s `0.1.2` version tuple. General prerelease admission rules still apply; this is not a claim that every prerelease below 0.2.0 is admitted.

Peer range satisfaction checks installed package versions against the plugin author's static metadata. A successful check means those versions satisfy the declared constraint; it is not proof that the declaration is accurate. npm does not inspect every session API or exercise plugin startup and replay to establish compatibility. A caret range expresses the author's intended compatible versions, not an enforceable promise that upstream preserves every API. In particular, alpha.5 being later than alpha.2 does not preserve `Session.events` across the breaking alpha.4 change.

Runtime compatibility instead concerns whether actual host APIs, data, and behavior meet the assumptions of executing plugin code. Breakages that can pass peer validation include:

- Removed or renamed properties/methods, producing undefined values, failed iteration, or calls to nonexistent functions, as here.
- Changed argument or return shapes, such as an array becoming a promise or a field changing type, causing code to operate on incompatible values.
- Changed lifecycle or initialization behavior, making an object unavailable when startup code previously expected it.

## What the author should do

Before publication, test the packaged plugin against the actual target dsh **0.1.2-alpha.5** and other versions the author intends to support. Include real startup and transcript replay with both empty and populated sessions, and audit all session `.events` uses. Type-checking against target declarations can catch removed members where types are available, but integration tests must exercise the behavior. A successful dependency installation is only a prerequisite.

Migrate each use according to its purpose: consult the target API contract for `snapshotEvents()` when replay needs a materialized view, and `seq`/`eventAt()` where indexed or incremental access is appropriate. Do not assume `seq` is an array length or a log offset; the fixture does not provide those detailed contracts.

For the unported legacy plugin, exclude the known breaking release and later versions. An illustrative constraint is `>=0.1.2-alpha.2 <0.1.2-alpha.4`, but even that asserts support for alpha.2/3 that must be tested; exact tested versions are preferable if evidence is narrower. Apply accurate constraints consistently to affected peer packages. A migrated release should advertise only its verified support range.

Use `peerDependencies` to encode supported host package versions and `engines` to encode supported execution environments such as Node/npm. An `engines` declaration is not an API probe; enforcement also depends on tooling/configuration. Runtime guards should explicitly detect the required session capabilities and return an actionable incompatibility message before replay. A deliberate adapter could select the new APIs when present and a verified iterable legacy `events` value on supported older hosts. Guard all relevant paths and do not silently replace missing history with an empty array. Feature presence alone still does not prove semantic compatibility; tests remain necessary.

## Concrete pre-install check

Inspect the candidate plugin's source or an unpacked package artifact alongside the exact target host's changelog before installing it. For this evidence pack, the read-only command `rg -n 'session\.events|liveSession\.events' plugin-source-excerpt.js`, run in the fixture directory, exposes the old API dependency. Compare those hits with the alpha.4 removal note above. For a full package, search the shipped JavaScript and inspect aliases too. This would flag this incompatibility before installation; a clean textual scan alone cannot prove compatibility. Also seek a published startup/replay test result for the exact plugin and host pair.

## Scope and limits

This is one static, read-only analysis of the supplied evidence. No skills, network access, installations, migrations, runtime execution, external repository material, or grading tools were used. The fixture was not modified. No execution blocker prevented the requested report; full compatibility certification and replacement API semantics remain beyond the supplied excerpts.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.