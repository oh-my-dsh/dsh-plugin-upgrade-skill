# JUDGE BRIEF · skill.S13-peer-range-vs-runtime

## Criteria (sealed rubric)
- [removed-api-and-crash] (20pt) Locate session.events reads in plugin-source-excerpt.js and the iteration failure in crash-stack.txt; cite dsh-changelog-excerpt.md for removal at 0.1.2-alpha.4 and replacement by seq, eventAt and snapshotEvents. Explain undefined/non-iterable access. A release number or API name without this causal connection earns no credit.
- [peer-check-boundary] (20pt) Use npm-install-output.txt to explain why alpha.5 satisfies the declared ^0.1.2-alpha.2 range while npm only checks declared package-version compatibility, not API existence or runtime behavior. A peer declaration is an author claim, not evidence that any version was tested. Do not require reproducing the fixture comment’s expanded upper bound; the same-base prerelease ordering is sufficient.
- [distinct-breakage-categories] (20pt) Explain at least two genuinely distinct classes that can pass peer validation and still fail at runtime: removed/renamed API and changed behavior/signature such as sync-to-async, argument order or return shape. Equivalent concrete classes are accepted. Two names for the same removal are not two classes; partial credit for one correctly explained class.
- [author-prevention] (20pt) Require testing the actual supported target versions, then an actionable compatibility policy: narrow the declared peer range to exclude the breaking releases, or implement and verify runtime capability detection with correct old/new paths. Explain the role of version metadata versus runtime guards; an engines field does not itself test DSH API behavior. Both testing and a compatibility policy are required for full credit; either alone is partial.
- [user-preinstall-check] (20pt) Give at least one concrete pre-install investigation: inspect breaking changes between the peer floor and installed target, or inspect the plugin’s API usage against target declarations. Tie the check to this Session.events incident and its compatibility boundary. Merely rerunning npm install or inspecting whether the peer range accepts alpha.5 is insufficient.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [peers-prove-runtime] ceiling=20 The final conclusion claims satisfied peer ranges or an install without warnings prove the plugin’s runtime API compatibility, or denies the documented Session.events removal. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.

## Candidate report(s)
#### FILE: S13-peer-range-vs-runtime/S13-peer-range-vs-runtime-report.md

# S13 · Peer Range vs Runtime Reality — Diagnosis Report

**Scenario**: `@deepseek-harness-tui/dsh-tui@0.1.0-beta.4` installed on dsh `0.1.2-alpha.5` —
npm install passed silently (peer floor `^0.1.2-alpha.2` satisfied), but the plugin crashes at startup
with `TypeError: events is not iterable`.

---

## 1. The exact runtime incompatibility

**WHAT**: dsh removed the eagerly materialized `Session.events` array (the `events` getter on `Session`).

**WHEN**: in release **dsh `0.1.2-alpha.4`** — i.e., *after* the plugin's peer floor alpha.2 but *before* the
installed alpha.5.

**Changelog citation** (fixture `dsh-changelog-excerpt.md`, dsh-v0.1.2-alpha.4 release notes, "Other Changes"):

> **Replace `Session.events` with on-demand read APIs**: `seq`, `eventAt()`, and `snapshotEvents()` —
> the eagerly materialized events array is removed to reduce memory overhead in long sessions.
> Developers should pay attention to compatibility. (@kermanx)

Skill reference card: **DSH-0.1.2-A4-03** (`references/v0.1.2-alpha.4.md`) — "`Session.events` is removed;
read the log through `seq` / `eventAt()` / `snapshotEvents()` / `ownEvents()`". Migration ledger:
`session.events[i]` → `session.eventAt(SessionSeq(i))`; whole log → `session.snapshotEvents()`;
`slice(a,b)` → `snapshotEvents(SessionLogOffset(a), SessionLogOffset(b))`. (Same edge also removed
`seedLength` in favour of branded `SessionSeq`/`SessionLogOffset`, card A4-04.)

**Crash mechanics**: the plugin reads `liveAgent.session.events` (channel.js:734; 42 total `.events`
references per the source excerpt). On alpha.5 that getter no longer exists, so the read yields `undefined`;
`prepareReplayEvents` then iterates it → `TypeError: events is not iterable` inside the plugin's own code
during `createChannel` → plugin tree fails to load at startup. This matches card A4-03's documented symptom
for untyped JavaScript: "reads `undefined` and then throws."

## 2. Why npm installed without warnings

The plugin's peerDependencies declare `"@deepseek-ai/dsh-*": "^0.1.2-alpha.2"`. npm's peer check is a
**purely static, package-metadata-level comparison**: is the *installed version string* of each peer inside the
declared range? With npm's same-tuple prerelease handling, `0.1.2-alpha.5` satisfies `^0.1.2-alpha.2`
(≈ `>=0.1.2-alpha.2 <0.2.0-0`), so the resolver passes silently.

What a peer range **does** guarantee: only *version presence and ordering* — "a package whose version falls in
this range is installed." It is an identity/compatibility **claim by the author**, checked by comparing two
strings against a range expression.

What it does **NOT** guarantee:

- That any API surface (getters, functions, services, events, exports) that existed at the range floor still
  exists at the resolved version — npm never loads, parses, or executes the plugin or the host;
- That behavior/semantics of surviving APIs are unchanged;
- That the author actually tested the whole range. A caret range on a **0.x prerelease line** is especially
  weak: per semver, 0.y.z is initial development where "anything may change at any time," and prerelease
  versions carry no compatibility commitment. `alpha.5 > alpha.2` in semver ordering says nothing about
  `Session.events` still existing at alpha.4/alpha.5 — the breaking change at alpha.4 sits *inside* the
  "satisfied" range.

## 3. The fundamental principle

- **"Peer range satisfaction" checks**: *static metadata* — resolved version ∈ declared semver range. It
  answers "is a claimed-compatible package version present?"
- **"Runtime compatibility" checks**: *behavioral, code-level reality* — does every API the plugin actually
  touches still exist, with the expected types, signatures, and semantics, in the running host process? Only
  executable evidence (cold start, activation, an exercised core path) answers this.

Categories of breakage that pass peer-range validation but crash (or silently misbehave) at runtime:

1. **API removal / rename** — exactly this case: `Session.events` removed in alpha.4; also e.g. `report`
   tool package removed for `send_message` (same edge), `codeRuntime`→`ptcRuntime` renames in later
   corridors.
2. **Semantic/signature drift of surviving APIs** — same name, different contract: sync → async
   (`agentLoop.create()`), changed payload shapes, tightened event-payload validation, removed function
   parameters (`workspaceFiles` dropping the `Agent` first parameter), narrowed return types.
3. **Composition/activation changes** — services renamed or split, bundle rows dropped/swapped, exports moved
   between packages: imports resolve at install time but the runtime service is never provided, leaving
   required injections pending.
4. **Type/export drift** — declarations or exports removed; untyped JS doesn't notice until the property read
   returns `undefined` mid-flow.

## 4. What the plugin author should have done

**Before publishing (catch it themselves):**

- Test against the *actual* newest target host, not the floor: install dsh `0.1.2-alpha.5`, cold-start a real
  profile, and exercise one core path (session open → transcript replay). The skill's layered validation
  (dependency resolution → enablement → static build/typecheck → runtime cold start → behavior) exists exactly
  for this; a runtime layer would have produced the same crash in CI.
- Read the host's release corridor between the peer floor and the latest release (alpha.2 → alpha.5 changelog
  / cards DSH-0.1.2-A4-03, A4-04) and migrate: `session.events` → `snapshotEvents()` /
  `eventAt(SessionSeq(i))`.

**To help users (metadata vs. guards):**

- **Peer range / engines should encode what is *verifiable at install time***: on a 0.x prerelease host line a
  bare `^0.1.2-alpha.2` over-promises. Declare the actually-tested window, e.g.
  `">=0.1.2-alpha.2 <0.1.2-alpha.4"` (or an exact pin `0.1.2-alpha.2 || 0.1.2-alpha.3`), and bump it only
  after re-verifying the newer host. An `engines` entry can carry the same floor for the host runtime.
- **Runtime feature detection guards what metadata cannot**: version ranges cannot express "getter removed in
  a patch-level prerelease," so hot paths should probe capabilities:
  ```js
  const events = typeof session.snapshotEvents === "function"
    ? session.snapshotEvents()          // alpha.4+ on-demand API
    : session.events;                   // alpha.2/alpha.3 legacy getter
  if (!events) throw new Error("dsh-tui requires dsh 0.1.2-alpha.2..alpha.3 or >=alpha.4 support; found incompatible Session API");
  ```
  A guard converts an opaque `events is not iterable` crash into a clear compatibility error and lets one
  plugin release span the breaking edge.

## 5. What I (the user) can do RIGHT NOW — concrete pre-install checks

1. **Read the plugin's declared peers and compare against the host changelog corridor, not just the resolver:**
   `npm view @deepseek-harness-tui/dsh-tui peerDependencies` → floor is alpha.2; then scan dsh release notes
   alpha.2 → your installed alpha.5 for "removed"/"breaking" entries (the alpha.4 notes name `Session.events`
   explicitly). A peer floor *below* your host with any breaking entry in between is a red flag.
2. **Grep the published artifact for removed APIs before installing** (no install needed):
   `npm pack @deepseek-harness-tui/dsh-tui --dry-run` / download the tarball and search its sources for
   `session.events` (and any other API the changelog says was removed in your corridor). 42 hits of
   `.events` + a removed-in-alpha.4 changelog entry = do not install on alpha.5.
3. **Check for evidence of a tested host version**: plugin README/repo CI matrix or issues naming the newest
   dsh version verified; absence of any post-alpha.2 verification on a fast-moving 0.x host is itself a signal.

**Bottom line**: `^0.1.2-alpha.2` matching `0.1.2-alpha.5` proved only string ordering. The runtime truth —
`Session.events` deleted at alpha.4 (DSH-0.1.2-A4-03), replaced by `seq`/`eventAt()`/`snapshotEvents()` —
is only knowable from the changelog and executable verification. Peer ranges are author claims checked
statically; runtime compatibility is behavior checked by running the code.

---
*Evidence: fixture/npm-install-output.txt, fixture/crash-stack.txt, fixture/plugin-source-excerpt.js,
fixture/dsh-changelog-excerpt.md; skill references v0.1.2-alpha.4.md (cards DSH-0.1.2-A4-03, A4-04).
Fixture left unchanged; read-only analysis.*


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.