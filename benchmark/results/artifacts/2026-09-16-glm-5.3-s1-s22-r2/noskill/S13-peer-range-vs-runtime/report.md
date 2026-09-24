# S13 · Peer Range vs Runtime Reality — Report

## Evidence basis

Fixture: `npm-install-output.txt`, `crash-stack.txt`, `plugin-source-excerpt.js`, `dsh-changelog-excerpt.md` (read-only). Scenario: `@deepseek-harness-tui/dsh-tui@0.1.2-beta.4` peer-declaring `^0.1.2-alpha.2` on every `@deepseek-ai/dsh-*` package, installed against `dsh@0.1.2-alpha.5`.

## 1. The exact runtime incompatibility

**What was removed:** the eagerly materialized `Session.events` array.

**When:** dsh **v0.1.2-alpha.4** — changelog entry, "Other Changes":

> **Replace `Session.events` with on-demand read APIs**: `seq`, `eventAt()`, and `snapshotEvents()` — the eagerly materialized events array is removed to reduce memory overhead in long sessions. Developers should pay attention to compatibility. (@kermanx)

**What replaced it:** the on-demand read APIs `Session.seq`, `Session.eventAt()`, and `Session.snapshotEvents()` (plus the same release's `SessionSeq`/`SessionLogOffset` strong-type split).

**Why the crash has this shape:** the plugin's `channel.js` reads `liveAgent.session.events` (42 references to `.events` in total) and passes it to `replayEvents`, which iterates it. On alpha.4/5 the property no longer exists, so `replayEvents` receives `undefined` and fails with `TypeError: events is not iterable` inside the plugin's own `apply()`, which Cordis surfaces as "failed to apply loader entry dsh-tui … events is not iterable".

## 2. Why npm installed without warnings

npm's peer-dependency resolution is a **pure semver range check against package metadata**. `^0.1.2-alpha.2` means `>=0.1.2-alpha.2 <0.2.0-0`; the bundled dsh packages at `0.1.2-alpha.5` fall inside that interval (prerelease versions compare only within the same `0.1.2` alpha series, and alpha.5 > alpha.2), so the peer check passes and npm says nothing.

What the range **does** guarantee: only that the installed dsh package versions are numerically inside the interval the plugin author declared — a static, version-string-level assertion.

What it does **not** guarantee:

- that the plugin author ever actually ran the plugin against any version in the range beyond the one they developed on (here, alpha.2 or earlier);
- that the APIs the plugin calls still exist or have the same shape in later versions inside the range;
- anything behavioral whatsoever. Semver ranges encode the *author's claim* about compatibility, not compatibility itself. The claim was simply wrong: a breaking API removal shipped inside the range at alpha.4, and the author never widened their knowledge to cover it.

## 3. Peer-range satisfaction vs runtime compatibility

- **Peer-range satisfaction** checks: *numbers in package metadata* — "is the installed version string inside the declared semver interval?" It never looks at code.
- **Runtime compatibility** checks: *behavior at execution time* — does every API the plugin actually calls exist, with the expected signature and semantics, in the running host?

Breakage categories that pass peer-range validation but crash at runtime (at least two required):

1. **API removal/rename inside the satisfied range** — exactly this case: `Session.events` removed in alpha.4 while `^0.1.2-alpha.2` still admits alpha.5. (Related: renamed exports, moved modules.)
2. **Type/shape changes** — `SessionSeq` vs `SessionLogOffset` strong typing from the same alpha.4 release: values that were previously interchangeable bare numbers/shapes now diverge; code that treats them uniformly fails or corrupts data at call time.
3. Others in the same class: behavioral/semantic changes (an API that exists but behaves differently, e.g. becomes async or lazy — `snapshotEvents()` is now on-demand), and load-order/context changes (services registered later, plugin `apply()` running before data is available) — all invisible to a semver interval.

## 4. What the plugin author should have done

**Before publishing (catch it):**

- Test against the *actual newest* version inside the declared peer range, not just the version in the dev lockfile — if the range admits `0.1.2-alpha.5`, CI must run against `0.1.2-alpha.5` (ideally a matrix over the range's endpoints).
- Watch the host project's changelog entries marked "developers should pay attention to compatibility" and re-release after such releases; the alpha.4 entry explicitly flags `Session.events`'s removal.
- Migrate the code: replace all 42 `session.events` reads with the on-demand APIs (`session.snapshotEvents()` for bulk replay, `session.eventAt(i)`/`session.seq` for indexed/latest access), then cut a new release.

**In metadata and code (help users):**

- Encode only what is *actually tested* in the peer range: pin to the exact tested series (e.g. `0.1.2-alpha.5` or `~0.1.2-alpha.5`) rather than an open `^` caret spanning untested prereleases; an `engines` constraint can additionally encode the minimum host version that provides the APIs the plugin uses. Widen the range only after re-testing.
- Accept that *no* range can encode "the `Session.events` API still exists" — for anything not expressible as a version interval, add a **runtime feature-detection guard**: at `apply()`, probe for the API (e.g. `typeof session.snapshotEvents === 'function'`) and fail loudly with a clear message ("this dsh-tui build requires dsh >= 0.1.2-alpha.4's on-demand session APIs; `Session.events` was removed") — or degrade gracefully — instead of a raw `TypeError: events is not iterable` deep in a stack trace.

## 5. What the user can do right now, before installing

Concrete pre-install check: **read the host changelog for every version between the plugin's declared floor and your installed version, and diff the APIs the plugin uses against them.** Concretely:

1. `npm view @deepseek-harness-tui/dsh-tui peerDependencies` — note the floor is `0.1.2-alpha.2`.
2. Read the dsh changelog entries for `0.1.2-alpha.3`, `alpha.4`, `alpha.5` (the interval your install satisfies). The alpha.4 entry explicitly states `Session.events` was replaced by `seq`/`eventAt()`/`snapshotEvents()` with a developer-compatibility warning.
3. Grep the plugin's published source for the removed symbol: `npm pack @deepseek-harness-tui/dsh-tui` (or the unpkg/tarball source) and `grep -n "session.events"` — 42 hits on a removed API is an immediate red flag.

A cheap automated variant: install the plugin into a scratch project, load it once against the real dsh (`dsh-tui --help` or a dry plugin-tree load) before trusting it — the crash reproduces deterministically at startup, before any real session data is at risk.

**Bottom line:** `^0.1.2-alpha.2` only means "alpha.5 is a bigger number than alpha.2". It says nothing about whether `Session.events` still exists — and it doesn't, since alpha.4 removed it.
