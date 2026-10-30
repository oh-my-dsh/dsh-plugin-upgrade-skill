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

# S13 · Peer Range vs Runtime Reality — Diagnosis Report

## 1. The exact runtime incompatibility

**What was removed:** the eagerly materialized `Session.events` array.

**When:** dsh `v0.1.2-alpha.4` (the release notes are titled `dsh-v0.1.2-alpha.4`).

**What replaced it:** on-demand read APIs `seq`, `eventAt()`, and `snapshotEvents()`.

**Changelog citation** (`fixture/dsh-changelog-excerpt.md`, "Other Changes"):

> - **Replace `Session.events` with on-demand read APIs**: `seq`, `eventAt()`,
>   and `snapshotEvents()` - the eagerly materialized events array is removed
>   to reduce memory overhead in long sessions. Developers should pay attention
>   to compatibility. (@kermanx)

The plugin's `channel.js` reads `liveAgent.session.events` (42 total references to
`.events` on session objects, e.g. lines 734, 657, 2685, 3004) and iterates it. After
alpha.4 that property is gone, so `session.events` is `undefined`, and iterating it
throws `TypeError: events is not iterable` — which is exactly the crash in
`fixture/crash-stack.txt` (`prepareReplayEvents` → `replayEvents`).

The second changelog bullet — "Distinguish `SessionSeq` and `SessionLogOffset` with
strong types" — is a related compatibility note (a type/semantic change, not the direct
crash cause), but it reinforces that alpha.4 was a compatibility-relevant release.

## 2. Why npm installed with no warnings

A peer dependency range is only a **version-number constraint**, evaluated statically
against the package's `version` field in its metadata. `^0.1.2-alpha.2` desugars to
`>=0.1.2-alpha.2 <0.2.0-0` — i.e. "0.1.2-alpha.2 or any later 0.1.x, up to (but not
including) 0.2.0".

The installed dsh bundles the `dsh-*` packages at `0.1.2-alpha.5`, and
`0.1.2-alpha.5` sorts inside that range (alpha.2 < alpha.4 < alpha.5 < 0.1.2-final).
So npm's peer check passes silently, as the fixture's `npm-install-output.txt` shows.

**What a `^0.1.2-alpha.2` range guarantees:** only that the resolved version is
`>=0.1.2-alpha.2` and `<0.2.0-0` in semver ordering — i.e. that it is *within the
0.1.x line at or above alpha.2*.

**What it does NOT guarantee:**
- It does **not** guarantee any particular API surface still exists — the range
  explicitly admits alpha.4, which removed `Session.events`.
- It does **not** guarantee behavioral compatibility — semver prerelease tags sort
  lexically, not by "safe-ness"; `alpha.5` being numerically higher than `alpha.2`
  says nothing about whether an API survived.
- For `0.x` versions there is no stability promise at all: under SemVer, a `0.y.z`
  major of `0` means the public API is unstable and anything may change on any bump.

## 3. The fundamental principle

- **Peer-range satisfaction** checks *static package metadata*: does the installed
  version number fall inside the declared semver range? It is a pure version arithmetic
  test with zero knowledge of code or behavior.
- **Runtime compatibility** checks *behavioral reality*: does the code path the plugin
  actually executes (the concrete function/property it calls) still exist and behave as
  the plugin expects, when run against the installed version?

The first is decidable from `package.json` alone; the second is only decidable by
loading/executing against the real artifact.

**At least two categories of breakage that pass peer-range validation yet crash at runtime:**

1. **Removed API (this case).** The property/method is deleted in a still-in-range
   version (`Session.events` removed at alpha.4). The version still satisfies
   `^0.1.2-alpha.2`, but the code now reads `undefined` and throws.

2. **Signature / return-type / return-shape change.** The symbol still exists but now
   takes different arguments, returns a Promise instead of a sync value, or returns a
   differently shaped object; callers written for the old contract crash or misbehave
   (`eventAt()` vs. the old array is a concrete instance of "sync array" → "lazy
   accessor").

3. **Behavioral / semantic change.** The API is present but its meaning changed (e.g.
   eager → lazy materialization, so `.at(-1)` or `for…of` no longer reflects what the
   code assumes; or `SessionSeq`/`SessionLogOffset` re-typing changes what values are
   emitted). These are the hardest to catch because they fail silently or only at
   specific call sites.

## 4. What the plugin author should have done

**To catch this before publishing — test against the actual target version:**
- Run the plugin's own test/startup smoke test against the *exact* dsh it claims to
  support (`0.1.2-alpha.5`), not against an older alpha it developed against.
- Add a CI matrix that pins dsh at each alpha in the claimed range (`alpha.2`,
  `alpha.4`, `alpha.5`) and greps the dsh changelog for "Removed/Replace/BREAKING"
  entries whenever the floor version moves, so a removal like alpha.4's is caught at PR
  time rather than in the field.

**To help users — encode the right thing in metadata, and guard at runtime:**
- The **peer range / `engines` field can only encode a version bound**, and that bound
  must reflect *known-good* versions, not an optimistic `^`. Because 0.x prereleases
  carry no stability promise, the author should either pin an exact known-good version
  (or a very tight range that stops below the first breaking release) — but even a
  correct range cannot *prove* compatibility.
- What a range can **never** do is guarantee a property still exists, so the author must
  add a **runtime feature-detection guard**: probe for the replacement API before using
  the old one, e.g. prefer `session.snapshotEvents?.() ?? session.eventAt` and fall
  back / degrade gracefully, or throw a *clear, actionable* error ("dsh >= 0.1.2-alpha.4
  removed Session.events; please upgrade dsh-tui") instead of a bare `events is not
  iterable`. Guarding also future-proofs against the lazy/eager semantic change.

## 5. What the user can do RIGHT NOW (pre-install check)

Before installing any plugin against an installed dsh, read the dsh changelog/release
notes **for the gap between the plugin's peer floor and the installed version** and look
for removed or replaced APIs that the plugin depends on. Concretely, for this case:

- Check the installed dsh's exact version and read its release notes, e.g. the alpha.4
  entry "Replace `Session.events` with on-demand read APIs" — since your dsh is at
  `alpha.5`, that removal is already in effect.
- Programmatic confirmation without installing the plugin: feature-detect the API the
  plugin needs against the installed package, e.g.
  `node -e "const s=require('@deepseek-ai/dsh-session'); const S=s.Session.prototype; console.log({hasEvents:'events' in S, hasEventAt:typeof S.eventAt, hasSnapshot:typeof S.snapshotEvents, hasSeq:typeof S.seq})"`
  — `hasEvents: false` with `hasEventAt: 'function'` tells you the plugin will crash.
- `npm view @deepseek-ai/dsh-session versions` (or the umbrella `@deepseek-ai/dsh`)
  plus its changelog is the metadata-side complement: it shows you're on alpha.5, which
  is past the alpha.4 breaking release, even though the plugin's `^0.1.2-alpha.2`
  peer range is technically satisfied.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.