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

# S13 · Peer Range vs Runtime Reality — Diagnostic Report

**Scenario:** `@deepseek-harness-tui/dsh-tui@0.1.0-beta.4` installed on dsh `0.1.2-alpha.5`.
npm install passed with zero peer warnings, yet the plugin crashes at startup with
`TypeError: events is not iterable`.

**Evidence used (read-only):** `fixture/npm-install-output.txt`, `fixture/crash-stack.txt`,
`fixture/plugin-source-excerpt.js`, `fixture/dsh-changelog-excerpt.md`.

---

## 1. The exact runtime incompatibility

- **WHAT was removed:** the eagerly materialized **`Session.events` array** — the plugin's
  transcript-replay code reads `liveAgent.session.events` (channel.js:734) and iterates it
  (`replayEvents(agent.session.events)` at channel.js:6685; `prepareReplayEvents` at
  channel.js:623 does the actual iteration). There are **42 references to `.events` on session
  objects** in the plugin. On alpha.5 the property no longer exists, so it reads `undefined`,
  and iterating `undefined` throws `TypeError: events is not iterable` inside
  `prepareReplayEvents → replayEvents → createChannel → plugin apply → Fiber._reload (cordis)`
  — exactly the observed crash stack.
- **WHEN:** in **dsh v0.1.2-alpha.4** (the changelog excerpt is the alpha.4 release notes).
  The user runs alpha.5, which is *after* the removal — hence broken.
- **What replaced it (changelog citation, `dsh-changelog-excerpt.md`):**
  > "**Replace `Session.events` with on-demand read APIs**: `seq`, `eventAt()`, and
  > `snapshotEvents()` — the eagerly materialized events array is removed to reduce memory
  > overhead in long sessions. Developers should pay attention to compatibility. (@kermanx)"

  So the migration path is the on-demand trio: **`seq`, `eventAt()`, `snapshotEvents()`**
  (e.g. replay would use `snapshotEvents()` / iterate via `seq` + `eventAt()` instead of the
  old materialized array). A companion alpha.4 change — "**Distinguish `SessionSeq` and
  `SessionLogOffset` with strong types** … (@tianyicui)" — is a second, type-level breaking
  change in the same release that plugin code touching session sequencing must also absorb.
- Note both entries explicitly say "**developers should pay attention to compatibility**" —
  i.e., the dsh project itself flagged these as breaking for downstream plugin authors, within
  a mere *prerelease bump* (alpha.3→alpha.4).

## 2. Why npm installed silently even though the plugin is broken

- The plugin's peerDependencies declare `"^0.1.2-alpha.2"` for every `@deepseek-ai/dsh-*`
  package. In semver, `^0.1.2-alpha.2` expands to **`>=0.1.2-alpha.2 <0.2.0-0`**. The installed
  bundle version `0.1.2-alpha.5` satisfies that range (prerelease ordering:
  alpha.2 < alpha.3 < alpha.4 < alpha.5, same [major, minor, patch] tuple), so npm's peer check
  **passes silently** — npm only warns when the installed version *fails* the range or the peer
  is missing. It has no signal that the range itself is an over-promise.
- **What a peer range actually guarantees:** only a **static, metadata-level fact** — "the
  *version string* of the installed peer package falls inside the declared comparator range."
  It is a string/ordering comparison performed at install time. Nothing more.
- **What it does NOT guarantee:**
  - that any particular **API, export, property, method, or type still exists** (here:
    `Session.events` was deleted at alpha.4 while alpha.4/alpha.5 still satisfy the range);
  - that **behavior/semantics** of surviving APIs are unchanged;
  - that the plugin's code will **load or run** at all against the installed version;
  - and critically, for **0.x versions and prereleases** the semver spec itself disclaims
    stability ("anything may change at any time"; major version 0 = initial development, no
    compatibility contract). `^0.1.2-alpha.2` therefore encodes essentially **zero** API
    guarantees — "alpha.5 > alpha.2 in semver ordering" means only *newer*, never *compatible*.
- The gap: the plugin author's range claims compatibility with the whole
  `[alpha.2, 0.2.0)` window, but the plugin was only ever *true* for `[alpha.2, alpha.4)`.
  npm trusts the declared claim; it cannot verify it. Install-time success is thus fully
  consistent with startup-time crash.

## 3. The fundamental principle

- **"Peer range satisfaction" checks:** a **static, package-metadata-level predicate** —
  version-identifier arithmetic (`satisfies(installedVersion, declaredRange)`) at install time.
  No code is read, no types are checked, nothing is executed.
- **"Runtime compatibility" checks:** a **behavioral, code-level reality** — when the consumer's
  code actually executes against the installed dependency, do the required APIs/exports/shapes/
  semantics exist and behave as assumed? This is only knowable by running the code (or by
  type-checking / API-surface diffing against the *actual* target version).
- Peer-range satisfaction is a **necessary-but-not-sufficient** proxy: it is cheap metadata
  filtering, not a compatibility proof.
- **Categories of breakage that pass peer-range validation but crash (or misbehave) at runtime**
  (at least two required; the fixture demonstrates #1 and #2):
  1. **API removal / rename within the allowed range** — this exact case: `Session.events`
     removed at alpha.4, range still admits alpha.4/alpha.5 → `undefined` read →
     `events is not iterable`.
  2. **Signature / type-shape changes** — e.g. the alpha.4 split of the old loose sequence type
     into strongly typed `SessionSeq` vs `SessionLogOffset`: code compiled/written against the
     old shape type-errors or silently mis-handles values; likewise changed parameter lists,
     changed return shapes (array → iterator/pager), sync → async flips.
  3. **Behavioral/semantic changes with an intact API surface** — same name, same signature,
     different meaning: altered defaults, ordering, timing, error conditions, laziness
     (eager array → on-demand reads is precisely a semantics shift even for code that adapts).
  4. **Transitive/bundled version drift** — the umbrella `@deepseek-ai/dsh@0.1.2-alpha.5`
     bundles all `dsh-*` subpackages at alpha.5; a range written against alpha.2-era subpackages
     can be satisfied while the actually-resolved transitive graph differs from what was tested.
  5. **Missing optional/native/runtime-environment dependencies** — peer metadata says nothing
     about engine features, native modules, or host capabilities that the code assumes.

## 4. What the plugin author should have done

**(a) Catch it before publishing — test against the actual target versions:**
- **CI version matrix + real load test:** install the plugin against *every* dsh version the
  peer range admits — especially the **latest** (alpha.5 at publish time), not just the floor
  (alpha.2) — and run a **startup smoke test** (actually launch `dsh-tui` / apply the plugin in
  a cordis host and assert the tree loads). The observed crash happens in `apply → createChannel`
  at load, so a single smoke boot per matrix cell would have failed the release immediately.
- **Type-check against the target's `.d.ts`:** build the plugin with `tsc --noEmit` against
  alpha.5's bundled types; `session.events` would be a hard compile error ("property does not
  exist"), flagging all 42 call sites at once.
- **Changelog/API-diff gate:** subscribe to dsh release notes and diff the public API surface
  between the tested floor and each new release before widening (or keeping) the peer range;
  the alpha.4 notes literally said "pay attention to compatibility".

**(b) Help users — what metadata should encode vs. what needs a runtime guard:**
- **Peer range (and `engines`) should encode the *tested, known-compatible window* — an honest
  claim, not a hopeful one.** Here the correct declaration at publish time was something like
  `">=0.1.2-alpha.2 <0.1.2-alpha.4"` (exclude the release that removed `Session.events`),
  updated only after re-testing against newer alphas. Declaring `^0.1.2-alpha.2` over-promised
  the entire `[alpha.2, 0.2.0)` window and is why npm waved the broken install through.
  `engines` similarly can only pin coarse runtime constraints (node version, etc.) — **neither
  field can express "the `Session.events` property must exist"; version metadata has no
  vocabulary for API surface**, all the more so in 0.x/prerelease land where semver guarantees
  nothing.
- **Therefore pair the honest range with a runtime feature-detection guard** at plugin load:
  ```js
  // fail fast, with an actionable message, instead of "events is not iterable" 60 frames deep
  if (!Array.isArray(session.events)) {
    if (typeof session.snapshotEvents === "function") {
      events = session.snapshotEvents();          // alpha.4+ on-demand API path
    } else {
      throw new Error(
        "dsh-tui requires Session.events (removed in dsh 0.1.2-alpha.4) or snapshotEvents(); " +
        "found neither. Use dsh >=0.1.2-alpha.2 <0.1.2-alpha.4, or upgrade dsh-tui."
      );
    }
  }
  ```
  Best practice is **both**: the peer range gates *install* (keeps npm honest and warns users
  on incompatible versions), while feature detection gates *execution* (degrades gracefully to
  the replacement API when possible, otherwise converts a cryptic TypeError into a precise
  diagnosis naming the removed API, the release that removed it, and the fix).

## 5. What the user can do RIGHT NOW — concrete pre-install checks

1. **Changelog diff between the peer floor and your installed version (the cheapest decisive
   check here):** read `@deepseek-ai/dsh` release notes for everything in
   `(0.1.2-alpha.2, 0.1.2-alpha.5]` — i.e., alpha.3/alpha.4/alpha.5 — and grep for
   *Removed/Replaced/Breaking* entries touching APIs the plugin uses. The alpha.4 entry
   "Replace `Session.events` with on-demand read APIs" is an immediate red flag: the plugin's
   peer floor predates the removal, and prerelease notes are where such breakage hides.
2. **Smoke-boot the plugin against your exact dsh in a throwaway environment before relying on
   it:** install into a temp prefix / disposable container (never assume a clean
   `npm install -g` output means "works"), then run the plugin once (`dsh-tui`) and watch for
   load-time errors. A single launch surfaces `events is not iterable` in seconds — runtime
   reality beats metadata every time.
3. **Grep the plugin's code for the host APIs it consumes and verify they still exist:** e.g.
   `grep -c "session.events" node_modules/@deepseek-harness-tui/dsh-tui/**` (42 hits here), then
   check the installed dsh's exported types/`.d.ts` (or docs) for `Session.events` — absent in
   alpha.5. Any removed/renamed symbol the plugin dereferences unguarded = broken at runtime,
   regardless of npm's silence.
4. **Treat `^0.x` / prerelease peer ranges as "unverified" by default:** when a plugin's peers
   are `^0.1.2-alpha.2`-style ranges on a 0.x prerelease line, assume the range encodes no API
   guarantee (semver explicitly allows anything to change in 0.x and between prereleases);
   prefer plugins that pin/exclude tested windows and ship feature-detection guards.

**Bottom line:** npm verified only that `0.1.2-alpha.5` ∈ `[>=0.1.2-alpha.2, <0.2.0-0)` — a
string comparison. It never asked whether `Session.events` survives at alpha.5; dsh deleted it
in alpha.4 and replaced it with `seq`/`eventAt()`/`snapshotEvents()`. Peer-range satisfaction
is static metadata filtering; runtime compatibility is behavioral truth. The plugin's over-broad
peer claim plus unguarded `.events` access turned a documented breaking change into a silent
install and a cryptic startup crash.

---
*Report generated from the sealed evidence pack at `/app/fixture/` (all 5 files verified
byte-identical to `fixture-hash-before.json`, sha256). No fixture, skill, evaluator, or
out-of-cell path was modified; no network or install/migration commands were run.*


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.