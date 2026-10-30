# S13 — Peer Range vs Runtime Reality

## 1. The exact runtime incompatibility

**WHAT was removed:** the eagerly materialized `Session.events` array property.
**WHEN:** dsh **v0.1.2-alpha.4** (the user runs alpha.5, so the removal is already in effect).
**WHAT replaced it:** on-demand read APIs — `seq`, `eventAt()`, and `snapshotEvents()`.

Changelog citation (fixture/dsh-changelog-excerpt.md, "dsh-v0.1.2-alpha.4 release notes", *Other Changes*):

> **Replace `Session.events` with on-demand read APIs**: `seq`, `eventAt()`, and `snapshotEvents()` — the eagerly materialized events array is removed to reduce memory overhead in long sessions. Developers should pay attention to compatibility.

The plugin `@deepseek-harness-tui/dsh-tui@0.1.0-beta.4` still reads `liveAgent.session.events` (channel.js line 734), calls `replayEvents(agent.session.events)` (line 6685), and has ~42 total references to `.events` on session objects. Since alpha.4+, `session.events` is `undefined`; iterating it throws `TypeError: events is not iterable` inside `prepareReplayEvents` (channel.js:623), killing plugin load at startup (crash-stack.txt).

## 2. Why npm installed without warnings

The plugin's peerDependencies declare `^0.1.2-alpha.2` for every `@deepseek-ai/dsh-*` package. Under npm semver rules for 0.x prereleases, `^0.1.2-alpha.2` resolves to `>=0.1.2-alpha.2 <0.2.0-0`. The installed `0.1.2-alpha.5` sorts above `alpha.2` and below `0.2.0-0`, so the static check passes silently (npm-install-output.txt: "added 77 packages", zero peer warnings).

**What the peer range guarantees:** only *version-set membership* — that the installed host package's version string falls inside the declared semver interval. It is a pure metadata comparison of name + version.

**What it does NOT guarantee:**
- That any API (property, method, event) the plugin actually calls still exists in the installed version.
- That signatures, return types, sync/async behavior, or semantics are unchanged.
- That the host behaves the way the plugin assumes at any point inside the range.

Semver itself permits this: for 0.x versions and prerelease tags, breaking changes are allowed between patch/prerelease increments ("anything may change at any time", semver.org §4–5). `alpha.5 > alpha.2` in version ordering says nothing about `Session.events` surviving to alpha.4/alpha.5. The range check never looks at code — npm does not (and cannot) verify that the plugin's runtime behavior matches the host's runtime API surface.

## 3. The fundamental principle

- **"Peer range satisfaction"** is a *static, package-metadata-level* check: does the installed version string ∈ declared semver range? Computed from `package.json` fields alone, at install time, without executing or analyzing any code.
- **"Runtime compatibility"** is a *behavioral, code-level* reality: does every host API the plugin invokes actually exist, with the expected signature, type shape, and semantics, in the version actually running? It can only be established by examining or executing the code against the real host.

Categories of breakage that pass peer-range validation but crash (or misbehave) at runtime:

1. **Removed/renamed APIs** — exactly this case: `Session.events` deleted in alpha.4. Any property or method deletion/rename passes the version check and dies with `TypeError`/`undefined is not a function` at first touch.
2. **Changed signatures or return types** — e.g., a sync array-returning API becomes async/iterator-based (`events` array → `snapshotEvents()` call), or argument order/shape changes. The symbol exists, so no import error, but results are wrong or calls throw.
3. **Semantic/behavioral changes** — same name and shape, different meaning: event ordering, timing (eager vs lazy), units, default values, or event payload contents. Code "works" but produces incorrect behavior.
4. **Type-shape / structural changes** — fields moved or renamed inside returned objects (e.g., the `SessionSeq` vs `SessionLogOffset` strong-typing change noted in the same changelog), breaking property access downstream.

All four are invisible to semver-range arithmetic.

## 4. What the plugin author should have done

**To catch it before publishing:**
- Test against the *actual* target versions, not just the peer-range floor: a CI matrix running the plugin's integration suite against each dsh release from `0.1.2-alpha.2` through the latest (`alpha.5`), plus a job tracking dsh nightly/latest. Loading the plugin under a real dsh runtime would have thrown `events is not iterable` immediately on alpha.4.
- Subscribe to / read the host's changelog — the alpha.4 notes explicitly flag "developers should pay attention to compatibility."
- Smoke-test plugin load as an automated step (the crash occurs at startup, so even a trivial load test catches it).

**To help users (metadata vs runtime guard):**
- **Peer range / engines fields** should encode *honest, tested* version windows: e.g. narrow to `>=0.1.2-alpha.2 <0.1.2-alpha.4` until alpha.4+ support lands (note: for 0.x prereleases npm caret ranges are wide — pin precisely), and publish a compatibility table in the README. `engines` only covers node/npm versions; the host-app version belongs in `peerDependencies` and docs. These are static hints — necessary but never sufficient.
- **Runtime feature detection** handles forward compatibility where metadata cannot: guard the call site, e.g.
  ```js
  const events = session.snapshotEvents ? session.snapshotEvents() : session.events;
  ```
  or probe `typeof session.eventAt === 'function'` and select the new read path; when neither exists, fail early with a clear "requires dsh >= X / <= Y" error instead of a raw `TypeError`. Feature detection checks behavior/capability — the same axis on which runtime breakage actually occurs.

## 5. What the user can do RIGHT NOW (pre-install check)

Concrete check: **diff the host's breaking-change list against the plugin's API usage before installing.**

1. Read the changelog of your *installed* host version (dsh `0.1.2-alpha.5`) for removed/changed APIs since the plugin's peer floor — here, alpha.4's "Replace `Session.events`..." entry.
2. Grep the plugin's published code for those removed symbols *before* installing globally:
   ```sh
   npm pack @deepseek-harness-tui/dsh-tui --dry-run   # or fetch the tarball / browse unpkg
   # extract and search:
   grep -rn ".session.events|session.events" dsh-tui-0.1.0-beta.4/
   ```
   (or browse `https://unpkg.com/@deepseek-harness-tui/dsh-tui@0.1.0-beta.4/channel.js`). Finding `session.events` — an API your host removed — is a red flag the peer range will never raise.
3. Complementary quick signals: check the plugin repo's CI/test matrix (does it test against *your* dsh version?), its README compatibility table, and open issues mentioning your host version; or install into a scratch directory / container first and run a load smoke test, instead of installing globally.

Peer-range silence is not compatibility evidence — only the host changelog plus the plugin's actual API usage (or a real load test) answers that question.

---

*Sources: fixture/crash-stack.txt, fixture/plugin-source-excerpt.js, fixture/dsh-changelog-excerpt.md, fixture/npm-install-output.txt (S13 evidence pack).*
