# S13 · Peer Range vs Runtime Reality — Report

**Verdict:** `npm install` succeeded silently because npm's peer check only verified a
**semver-ordering** relationship between two version strings. It never executed a line of the
plugin or inspected a single export. The plugin reads `session.events`, which dsh **removed** in
`0.1.2-alpha.4` — a release that is *inside* the plugin's declared peer range
(`^0.1.2-alpha.2`). Semver-ordering satisfaction and runtime API compatibility are two
different planes; the range held, the API did not.

---

## 1. The exact runtime incompatibility

- **WHAT was removed:** the eager `Session.events` array (getter) on the `Session` object.
  The plugin's `channel.js` reads `liveAgent.session.events` / `session.events.at(-1)` and
  passes it to `replayEvents()` for transcript replay. At alpha.4 that getter is gone, so
  `session.events` is `undefined`, and iterating it throws
  `TypeError: events is not iterable` inside the plugin's own `prepareReplayEvents`
  (crash-stack.txt: `channel.js:623`).
- **WHEN:** **dsh v0.1.2-alpha.4** (the alpha.3 → alpha.4 edge). Cited from the fixture
  changelog entry `fixture/dsh-changelog-excerpt.md`, "Other Changes": *"Replace
  `Session.events` with on-demand read APIs: `seq`, `eventAt()`, and
  `snapshotEvents()` — the eagerly materialized events array is removed to reduce memory
  overhead in long sessions. Developers should pay attention to compatibility."*
- **What replaced it** (on-demand reads): `session.seq` (current log length),
  `session.eventAt(seq)` (one frozen event), `session.snapshotEvents(from?, toExclusive?)`
  (frozen half-open-range snapshot), and `session.ownEvents()` (events appended by this
  session, excluding the fork-inherited prefix). Card: **DSH-0.1.2-A4-03**.

Migration ledger (from the same card): `events.length → seq`,
`events[i] → eventAt(SessionSeq(i))`, whole-log `events → snapshotEvents()`,
`events.slice(a,b) → snapshotEvents(a,b)`.

## 2. Why npm installed without warnings

npm's peer-dependency check is a **static, package-metadata-level comparison of two strings**:
the installed host's declared version (`0.1.2-alpha.5`) is tested for membership in the
plugin's declared range (`^0.1.2-alpha.2`) by semver ordering. It runs no code and never
looks at exports, members, signatures, or services.

- `^0.1.2-alpha.2` expands to `>=0.1.2-alpha.2 <0.2.0-0` (caret on `0.1.2` pins only the
  minor; the fixture's own npm-install-output.txt states this range).
- `0.1.2-alpha.5` is `>= 0.1.2-alpha.2` and shares the same `0.1.2` tuple, so npm's
  prerelease-aware comparator matches → **silent pass, no warning**.
- Crucially, **`0.1.2-alpha.4` — the release that removed `Session.events` — also satisfies
  the range.** The range therefore admits hosts where the API both *exists* (alpha.2/alpha.3)
  and *does not exist* (alpha.4/alpha.5), and npm cannot tell the difference.

**What a peer range actually guarantees:** only the version-*ordering* claim
`installed >= 0.1.2-alpha.2 && installed < 0.2.0-0`, carried by the maintainer's SemVer
*convention* (minor = additive, major = breaking). It is a promise, not an enforced mechanism.

**What it does NOT guarantee:**

- that any named export/member exists (here: `Session.events`);
- that a symbol's signature, arity, return shape, or semantics is unchanged;
- that a required runtime service / Cordis inject is present and mountable;
- that transitively imported dependencies are actually installed;
- any behavioral property whatsoever (no code runs during the check).

The convention is additionally void here for two reasons: (a) `0.x.y` and prerelease tags are
explicitly "unstable — anything may change at any time," so breaking an API in a patch-position
bump (alpha.2 → alpha.4, still `0.1.2`) is permitted SemVer; (b) a caret on `0.x` spans the
whole minor line, so `^0.1.2-alpha.2` admits a corridor the skill's own cards show to be full
of breaking changes. See **R-08** (peer-floor prerelease semantics: the comparator must share
the tuple and carry a prerelease).

## 3. The fundamental principle

- **"Peer range satisfaction" checks:** whether a declared version *string* sorts inside a
  declared range *string* — a static, metadata-only, SemVer-ordering assertion. No execution,
  no symbol lookup.
- **"Runtime compatibility" checks:** whether the plugin's *actual code paths* succeed against
  the *actual host* — symbols exist, signatures match, injected services resolve, behavior is
  correct. This is empirical and can only be established by loading and running against the
  real target version.

**Breakage categories that pass peer validation but crash at runtime** (this fixture is #1):

1. **Removed / renamed exported member** — symbol reads `undefined` → `TypeError` on use
   (`Session.events` here; also `report` tool → `send_message`, A4-01; Python runtime
   package rename, A4-02).
2. **Signature / shape change on a still-present symbol** — `seedLength` → `isSeeded` +
   `inheritedEventCount`, seq values become branded `SessionSeq`/`SessionLogOffset`
   (DSH-0.1.2-A4-04).
3. **Missing runtime service / required inject** — install and typecheck pass, but the entry
   stalls `pending (waiting for service: sessionProjections)` (DSH-0.1.2-A2-08).
4. **Unconditional import of an optional/undeclared dependency** — npm skips the optional,
   static gates pass, the import crashes at startup (DSH-0.1.2-A2-03 field note).

## 4. What the plugin author should have done

**Before publishing (catch it):**

- Pin the *actual* target cohort in dev deps (`@deepseek-ai/dsh-session@0.1.2-alpha.5` etc.)
  and **run a real cold boot exercising the path that reads `.events`** (replay/transcript),
  not just `npm install` + `tsc`. The skill's runtime layer (`verify-runtime.mjs`) is exactly
  this gate.
- Typecheck against the actual host version: a typecheck at alpha.4+ fails with
  *"Property 'events' does not exist on type 'Session'"* (DSH-0.1.2-A4-03 symptom).
- Read the host release notes / version corridor for the target — the changelog literally warns
  "Developers should pay attention to compatibility."

**To help users (encode the right thing in the right place):**

- **Peer range / `engines` can only encode *version boundaries*** (a floor and ceiling of
  versions the author actually tested as compatible). They are strings, so they cannot express
  "symbol X exists." Honest options: (a) migrate the plugin to the new API and raise the floor
  to the breaking release, or (b) keep the old API and encode the *ceiling*
  (`>=0.1.2-alpha.2 <0.1.2-alpha.4`) — never a bare `^0.1.2-alpha.2` that silently admits the
  breaking release. `engines` (node, or a DSH manifest compatibility field) carries a floor,
  not API presence.
- **What must be a runtime guard instead:** a **feature-detection** check in the code —
  `if (typeof session.events === 'undefined') { /* use session.snapshotEvents() / seq / eventAt() */ }`,
  else use the legacy array — and, when neither API is available, fail with a *clear, actionable*
  message naming the required dsh version. The range encodes "which versions I intend to
  support"; the guard encodes "what capability I actually require" and degrades instead of crashing.

## 5. What the user can do RIGHT NOW (concrete pre-install check)

Do not trust the peer range — **probe the actual host API surface you are about to run against.**
Concretely, against your installed dsh@0.1.2-alpha.5, assert the symbol the plugin touches and
its replacement before you install/run the plugin:

1. `npm pack @deepseek-harness-tui/dsh-tui@0.1.0-beta.4` (downloads the tarball without
   installing), then `grep -rn '\.events' package/` to list every host API the plugin touches
   (the excerpt shows 42 such references).
2. Compare that list against your installed host's `Session` type / release notes for the
   corridor **between the plugin's peer floor (alpha.2) and your version (alpha.5)** — grep for
   "remove/removed/replace/rename". The fixture's changelog entry is exactly the red flag:
   `Session.events` removed, replaced by `seq` / `eventAt()` / `snapshotEvents()`.
3. Run a feature-detection one-liner against the resolved `@deepseek-ai/dsh-session` in YOUR
   install: check whether the `events` getter the plugin needs is gone and the replacement
   (`snapshotEvents` / `eventAt`) is present. If the replacement exists and `events` does not,
   any plugin still reading `.events` will crash exactly as here — reject or pin it before running.

**TL;DR pre-install check:** feature-detect the API (`'snapshotEvents' in session` present AND
`session.events` absent ⇒ any plugin still reading `.events` will crash) and scan the host
changelog between the peer floor and your installed version for removed/renamed symbols the
plugin consumes.
