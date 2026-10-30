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
#### FILE: S13-peer-range-vs-runtime/report.md

# S13 · Peer Range vs Runtime Reality — Diagnostic Report

**Mode**: read-only inspection (plugin-upgrade skill, Mode A). Evidence base: the sealed fixture pack
(`npm-install-output.txt`, `crash-stack.txt`, `plugin-source-excerpt.js`, `dsh-changelog-excerpt.md`),
cross-checked against skill reference cards (cited by ID, key points only). No files in `fixture/` were
modified; no migration, install, or execution was performed. This report is the only output.

**Subject**: `@deepseek-harness-tui/dsh-tui@0.1.0-beta.4` installed on `@deepseek-ai/dsh@0.1.2-alpha.5`;
npm install passed with zero peer warnings; the plugin crashes at startup with
`TypeError: events is not iterable`.

---

## 1. The exact runtime incompatibility

**WHAT was removed**: the `Session.events` property — the eagerly materialized events array on the
`Session` object (from the `@deepseek-ai/dsh-session` package surface).

**WHEN**: dsh **v0.1.2-alpha.4**. Changelog citation (`fixture/dsh-changelog-excerpt.md`, "Other Changes"):

> **Replace `Session.events` with on-demand read APIs**: `seq`, `eventAt()`, and `snapshotEvents()` —
> the eagerly materialized events array is removed to reduce memory overhead in long sessions.
> Developers should pay attention to compatibility. (@kermanx)

The same release carried a companion breaking change (same fixture, @tianyicui): "**Distinguish
`SessionSeq` and `SessionLogOffset` with strong types** — developers should pay attention to
compatibility." Both are carded in the skill references as **DSH-0.1.2-A4-03** and **DSH-0.1.2-A4-04**.

**What replaced it** (per the changelog entry and card DSH-0.1.2-A4-03, key points):

| Old API | New on-demand read API |
|---|---|
| `session.events` (whole log array) | `session.snapshotEvents()` — frozen snapshot of a half-open range; `snapshotEvents(fromSeq?, toSeqExclusive?)` for slices |
| `session.events[i]` | `session.eventAt(seq)` — one accepted, deeply frozen event |
| `session.events.length` | `session.seq` — current log length (a `SessionLogOffset`) |
| (fork-inherited prefix filtering) | `session.ownEvents()` — only events this session appended itself |

Card A4-04 adds that constructed seq/offset values must now be wrapped in the branded constructors
`SessionSeq(n)` / `SessionLogOffset(n)` (plain numbers no longer type-check; invalid values throw
`TypeError`), and snapshots must not be cached across appends when live data is needed.

**Crash mechanism in this installation**: the host is alpha.5, i.e. **past the alpha.4 removal**, so its
`Session` has no `events` getter. dsh-tui is untyped/bundled JavaScript (`channel.js`), so nothing
failed at build time; at startup `createChannel` reads `liveAgent.session.events` (source excerpt,
line ~734) → `undefined`, passes it into `replayEvents` → `prepareReplayEvents` (crash stack:
`channel.js:623`) tries to iterate it → `TypeError: events is not iterable` → the Cordis loader entry
fails to apply → "plugin tree failed to load". The source excerpt shows **42 references to
`.events` on session objects** (including `session.events.at(-1)`), so this is systemic usage of the
removed API, not one stray call site.

**Why the declared peer range never caught it**: the plugin's floor is `^0.1.2-alpha.2`; the removal
landed at **alpha.4, inside the declared-satisfied interval**. The plugin was evidently built and tested
against an alpha.2-era host and the range was never revalidated when alpha.4 shipped.

---

## 2. Why npm installed without warnings even though the plugin is broken

**What npm actually did**: the peer-dependency check is a purely static comparison of *version strings*
in package metadata. It resolved the installed `@deepseek-ai/dsh-*` packages at `0.1.2-alpha.5`
against the declared range `^0.1.2-alpha.2`, which expands to `>=0.1.2-alpha.2 <0.2.0-0`. Under semver
prerelease matching, a comparator carrying a prerelease on tuple `[0,1,2]` admits other prereleases of
the same tuple, and `alpha.5 > alpha.2` in prerelease ordering — so the check passes silently
(`npm-install-output.txt` confirms exactly this). npm never loads either package's code, exports, type
declarations, or changelogs; it does interval arithmetic on numbers and nothing else.

**What a peer range DOES guarantee**: only that the *installed version number* falls inside the declared
interval. It is a metadata-level claim — "the author built/tested against some version in this window" —
plus a resolver hint for dedup/hoisting. That is the entire guarantee.

**What it does NOT guarantee**:
- That any specific API, export, type, service, event, or behavior the plugin consumes exists in *every*
  version inside the interval. The floor records the *minimum tested version*, not an API contract frozen
  across the whole range.
- That a *newer* in-range version is compatible with the floor version. In semver terms `0.1.2-alpha.5`
  is "greater than" `0.1.2-alpha.2`, but greater ≠ compatible: for 0.x and especially prerelease
  versions, semver explicitly disclaims stability — **every alpha bump may break APIs**, and the alpha.4
  release notes themselves warned "Developers should pay attention to compatibility."
- Concretely here: `^0.1.2-alpha.2` says nothing whatsoever about whether `Session.events` still
  exists at alpha.4/alpha.5. It was removed at alpha.4 — *inside* the range — and no range check can see
  that. Moreover, **no semver range syntax can express "property X exists"**; ranges encode version
  numbers, never API surfaces. A silent pass here is npm working exactly as designed, not a bug.

---

## 3. The fundamental principle

- **"Peer range satisfaction" checks**: a *static, package-metadata-level* fact at install time —
  interval arithmetic on version strings declared in `package.json`. Question answered: *"Is the
  installed version number within the declared interval?"*
- **"Runtime compatibility" checks**: a *behavioral, code-level* reality at load/execution time — whether
  the modules, exports, services, methods, events, slots, and semantics the plugin's code actually
  touches exist with the expected shape in the resolved host. Question answered: *"Does the code run?"*

The two are decoupled because the range check is a cheap *proxy* that assumes semver discipline (breaking
change ⇒ contract-visible version bump). During a 0.x prerelease cohort that assumption is void, so the
proxy diverges from reality.

**Categories of breakage that pass peer-range validation but crash at runtime** (at least two required;
five named, all real in this corridor):

1. **Removed or renamed APIs/symbols inside the range** — this case: `Session.events` removed at alpha.4
   while the floor stays alpha.2. Same release family: the `report` tool package removed in favour of
   `send_message` (**DSH-0.1.2-A4-01**) and a package rename (**DSH-0.1.2-A4-02**).
2. **Changed signatures / type shapes with the symbol still present** — e.g. `SessionSeq` /
   `SessionLogOffset` becoming branded numbers (**DSH-0.1.2-A4-04**): code compiles/runs against the old
   shape and throws `TypeError` on plain numbers under the new one.
3. **Behavioral/contract changes with identical signatures** — timing, ordering, async lifecycle, event
   contract, or read-path semantics change; the call "succeeds" but produces wrong results or races.
4. **Composition/default changes in the host bundle** — the plugin consumes a service, tool, or preset
   row the new host no longer mounts or enables by default (e.g. the `ptc` preset dropping the general
   `workflow` tool, **DSH-0.1.2-A4-05**). Every per-package range passes; the capability simply isn't
   wired up at runtime.
5. **Mixed cohort resolution** — each package's peer range passes individually, but the resolved graph
   mixes old and new dsh packages that were never co-tested (skill rule: "a successful install with mixed
   old/new peers is not a migration").

---

## 4. What the plugin author should have done

### 4a. Catching this before publishing (testing against the actual target version)

- **Build and typecheck against the current in-range host, not just the floor.** A `tsc --noEmit` (or
  even a JS-level symbol smoke test) against `@deepseek-ai/dsh-session@0.1.2-alpha.5` declarations
  would have failed immediately with "Property 'events' does not exist on type 'Session'" (the exact
  symptom recorded in card DSH-0.1.2-A4-03). Testing only against alpha.2 proved only alpha.2.
- **Runtime validation, per the skill's validation ladder**: cold-start a real dsh profile with the
  plugin mounted, verify entry activation, and exercise the core path — here, transcript replay
  (`createChannel` → `replayEvents`) — against **each host release the plugin claims to support**,
  with a CI compatibility matrix covering at minimum the floor *and* the latest in-range version.
- **Track host release notes as a publishing gate.** The alpha.4 notes explicitly flagged the removal
  with "Developers should pay attention to compatibility." On each host release, either re-validate and
  widen/keep the range, migrate the code, or narrow the declared range until migration is done. Leaving
  `^0.1.2-alpha.2` published unchanged after alpha.4 shipped is what turned a metadata claim into a
  false advertisement.

### 4b. Helping users: what metadata encodes vs. what needs a runtime guard

- **The peer range should encode exactly the span of host versions this build was actually verified
  against** — nothing wider. After alpha.4 removed `Session.events`, the honest options were:
  - migrate to the new API (ledger: `session.events` → `snapshotEvents()`, `events[i]` →
    `eventAt(SessionSeq(i))`, `events.slice(a,b)` → `snapshotEvents(SessionLogOffset(a),
    SessionLogOffset(b))`) and raise the floor to `^0.1.2-alpha.4`; **or**
  - keep the old code and *narrow* the range to the last known-good versions (an explicit
    `0.1.2-alpha.2 || 0.1.2-alpha.3`-style pin), so npm would actually warn/refuse on alpha.4+ hosts.
  During prerelease cohorts, publish the prerelease-adapted build under the npm `alpha` dist-tag,
  keeping `latest` for the stable-host line (community practice recorded in rollup reference **R-08**).
- **The `engines` field has the same static nature**: it can encode a Node/host *engine floor* (another
  version-string interval) and is useful for that, but it likewise cannot express "`Session.events`
  exists." **No package-metadata field can encode API presence** — that is a capability fact, not a
  version-number fact.
- **Therefore the API contract needs a runtime feature-detection guard.** In `createChannel` (or plugin
  entry), probe the surface actually used and fail fast with an actionable message:
  ```js
  const session = liveAgent.session;
  const readEvents =
    typeof session.snapshotEvents === "function" ? (() => session.snapshotEvents()) :  // alpha.4+
    Array.isArray(session.events) ? (() => session.events) :                            // alpha.2–alpha.3
    null;
  if (!readEvents) {
    throw new Error(
      "dsh-tui@0.1.0-beta.4 requires the dsh session read API (Session.events or Session.snapshotEvents); " +
      "this host provides neither. Upgrade dsh-tui to a release built for your dsh version."
    );
  }
  ```
  The dual-path version works on both sides of the alpha.4 boundary; at minimum, the guard converts a
  cryptic `events is not iterable` deep inside a replay frame into a clear startup diagnostic naming
  the incompatibility. Metadata (peer/engine ranges) tells the package manager when to warn; **only code
  can tell the runtime whether the capability exists**.

---

## 5. What the user can do RIGHT NOW — concrete pre-install checks

**The core check (name one, concretely): diff the plugin's peer floor against the host changelog between
the floor and your installed version.**

1. `npm view @deepseek-harness-tui/dsh-tui peerDependencies` → floor `^0.1.2-alpha.2` (the plugin was
   built/tested against an alpha.2-era host).
2. Your host is `0.1.2-alpha.5`. Read the dsh release notes for **every release strictly between the
   floor and your version**: alpha.3 → alpha.4 → alpha.5. The alpha.4 entry "Replace `Session.events`
   with on-demand read APIs … developers should pay attention to compatibility" immediately flags the
   breakage — *before installing anything*.

Rule of thumb: a peer floor means "tested at least this far back", so the risk lives in the **changelog
delta from floor → current**, never in the range-satisfaction result. "npm printed no warnings" carries
zero information about that delta.

Supporting checks (minutes, no commitment):

- **Static symbol probe**: `npm pack @deepseek-harness-tui/dsh-tui@0.1.0-beta.4` into a temp dir and
  grep the shipped code for the session APIs it uses (here `.events` appears 42 times); then confirm
  those symbols still exist in the installed host's `@deepseek-ai/dsh-session` (exports/type
  declarations, or a one-line `node -e` probe). A plugin referencing a symbol the host no longer
  provides is broken regardless of what npm said.
- **Freshness heuristic**: compare publish dates — `npm view @deepseek-harness-tui/dsh-tui time` vs the
  host release dates. A plugin last published *before* host alpha.4 has never seen alpha.4+; check
  `npm view ... versions` for a newer release, or the upstream repo/issues for alpha.4 mentions.
- **Smoke in a throwaway profile**: install/mount the plugin in a disposable secondary dsh profile and
  cold-start it (skill validation layer 4) before wiring it into your daily profile.

Forward note: newer DSH hosts (0.1.7-rc.1 onward, per skill reference `v0.1.7-rc.1`) **enforce peer
ranges at install and startup** with exact-version exemptions in the profile's `compatibility.json` —
that closes the "declared range ignored" gap, but it is still version-string enforcement; the
changelog-delta check above remains the user's real defense against in-range API removal.

---

## Evidence & citations

- Fixture pack (read-only, unchanged): `npm-install-output.txt` (silent peer pass, range expansion
  `>=0.1.2-alpha.2 <0.2.0-0`), `crash-stack.txt` (`prepareReplayEvents`, channel.js:623,
  `events is not iterable`), `plugin-source-excerpt.js` (42 `.events` references, line ~734),
  `dsh-changelog-excerpt.md` (alpha.4 removal entry, quoted in §1).
- Skill references (key points + IDs only): **DSH-0.1.2-A4-03** (`Session.events` removal, replacement
  ledger, untyped-JS symptom), **DSH-0.1.2-A4-04** (branded `SessionSeq`/`SessionLogOffset`),
  **DSH-0.1.2-A4-01/02/05** (other in-range breakage categories), rollup-0.1.2 **R-08** (peer-floor
  prerelease semantics, dist-tag practice), `v0.1.7-rc.1` (peer-range enforcement at install/startup),
  skill validation ladder layers 3–5 (typecheck / real-profile cold start / core behavior path).

**Compliance statement**: inspection and report only; `fixture/` untouched byte-for-byte; no installs,
migrations, git operations, or external network access; sole written artifact is this report under
`agent-output/S13-peer-range-vs-runtime/`.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.