# S13 · Peer Range vs Runtime Reality — Report

**Task**: `@deepseek-harness-tui/dsh-tui@0.1.0-beta.4` installed on dsh `0.1.2-alpha.5`; npm install clean, plugin crashes at startup. Read-only diagnosis.
**Mode**: A · inspect (read-only), per plugin-upgrade skill. Evidence: fixture pack (npm output, crash stack, plugin source excerpt, dsh changelog excerpt) plus the skill's corridor card v0.1.2-alpha.4

## 1. The exact runtime incompatibility

**What was removed**: the eagerly materialized `Session.events` array — the session API the plugin reads 42 times (`agent.session.events`, `session.events.at(-1)`, `liveSession.events`, etc. in `plugin-source-excerpt.js`).

**When**: dsh **v0.1.2-alpha.4**. The changelog excerpt states:

> **Replace `Session.events` with on-demand read APIs**: `seq`, `eventAt()`, and `snapshotEvents()` — the eagerly materialized events array is removed to reduce memory overhead in long sessions. Developers should pay attention to compatibility.

**What replaced it**: the on-demand read APIs `session.seq`, `session.eventAt()`, and `session.snapshotEvents()`. This is the same removal recorded as a curated card in the skill's corridor (alpha.4 card set: "`Session.events` replaced by `seq`/`eventAt()`/`snapshotEvents()`", together with the branded `SessionSeq`/`SessionLogOffset` types also visible in the changelog).

**Why it crashes here**: the plugin does `const events = liveAgent.session.events` (now `undefined`) and passes it to `replayEvents`/iteration → `TypeError: events is not iterable` at `prepareReplayEvents (channel.js:623)` during `apply` → the whole plugin tree fails to load. The crash is inside the plugin's own code, not dsh.

## 2. Why npm installed without warnings

- The plugin declares `peerDependencies: { "@deepseek-ai/dsh-*": "^0.1.2-alpha.2" }` for all 27 dsh packages.
- The installed host bundles those packages at `0.1.2-alpha.5`. In npm's semver semantics (prerelease-comparison enabled because both sides share the `0.1.2-alpha` prerelease tag), `^0.1.2-alpha.2` means `>=0.1.2-alpha.2 <0.2.0`, and `0.1.2-alpha.5 > 0.1.2-alpha.2` — so alpha.5 **satisfies** the range. The static peer check passes; npm prints nothing.

**What a peer range guarantees**: only that the *package version numbers* npm resolves fall inside the declared semver range — a metadata-level, install-time assertion that the host packages are "close enough in version" for the plugin to coexist with them in one node_modules tree.

**What it does NOT guarantee**: anything about the *runtime shape of the code*. npm never reads the plugin's source, never checks that every API the plugin calls still exists in the resolved host build. A semver range is the *author's claim* about compatibility, not a *verification* of it — and pre-1.0/alpha semver makes the claim especially weak: in the 0.x line even **patch/minor-level bumps carry breaking changes by SemVer convention**, and DSH's own corridor explicitly flags alpha-edge removals ("developers should pay attention to compatibility"). `^0.1.2-alpha.2` therefore does not mean "safe with alpha.5"; it only means "alpha.5 sorts after alpha.2".

## 3. The fundamental principle

- **Peer-range satisfaction** checks: *static version arithmetic* on package.json metadata — "is the resolved version number inside the declared range?" It is a claim about versions.
- **Runtime compatibility** checks: *behavioral, code-level reality* — "does every API the plugin actually invokes exist with the expected signature in the loaded host at run time?" It is a fact about code.

**Categories of breakage that pass peer-range validation but crash at runtime** (at least two required):

1. **Removed/renamed APIs** — exactly this case: `Session.events` deleted in alpha.4; the version still satisfies `^0.1.2-alpha.2`, but `session.events` is `undefined` at runtime → `TypeError` on iteration. Same class: removed `tasks.peek`, removed `SubprocessHandle.pid`, renamed service/event keys — all present in the skill's corridor cards.
2. **Signature/behavioral drift without a version-satisfying signal** — a method still exists but its parameters, return type, or timing changed (e.g. `workspaceFiles` dropping its `Agent` first parameter, waterfall listeners now required to call `next()`, injected-surface contracts losing fields). Nothing is `undefined`, so the plugin fails later and more subtly: wrong data, silent no-ops, or deep stack traces.
3. (Bonus) **Type-vs-runtime divergence** — a method may exist in the shipped *.d.ts (so typecheck passes) yet be unregistered/not activated in the actual runtime composition; and conversely host-side composition changes (bundle module rosters, service injection becoming strict) can break activation even when every individual API still exists.

## 4. What the plugin author should have done

**Before publishing (catch it)**:
- **Test against the actual target versions, not the range floor**: CI matrix installing the *newest* released dsh cohort (and ideally the corridor edges: alpha.2 and current latest) and running a real mount — cold-start a profile, let `apply()` run, and exercise one core path (the plugin-upgrade skill's runtime validation layer / `verify-runtime.mjs` pattern). The crash occurs inside the plugin's own `apply`, so any smoke mount on alpha.4/5 would have caught it instantly.
- **Treat the 0.x alpha corridor as breaking by default**: after a new dsh alpha lands, run the corridor cards / changelog diff and re-verify touchpoints; `Session.events` removal is explicitly listed as a card.
- **Encode the truth in metadata**: the peer range should encode only what was *actually tested and verified* — e.g. pin to the verified cohort (`~0.1.2-alpha.2` or exact `0.1.2-alpha.2` for the floor, raised to `>=0.1.2-alpha.4` only after migrating to the new API), not an optimistic open `^` across an alpha series where removals happen. (Note npm's prerelease peer-floor semantics: a `^` range over prereleases spans the whole alpha series — the author must not rely on it to exclude untested builds.)
- **Feature-detect instead of assuming**: where the plugin must support a corridor spanning the removal, guard at runtime rather than trusting the range:
  ```js
  const events = typeof session.snapshotEvents === 'function'
    ? session.snapshotEvents()          // dsh >= 0.1.2-alpha.4
    : session.events;                   // older corridor segment
  ```
  and fail **loudly with an actionable message** ("this dsh-tui build requires dsh < 0.1.2-alpha.4; upgrade dsh-tui or downgrade dsh") instead of a bare `TypeError` deep in the loader. Guards belong around *capability presence*; the peer range/engines field encodes *version claims you have verified*.

**To help users**: publish a compatibility table (plugin version → verified dsh cohort), and cut a new plugin release migrating to `seq`/`eventAt()`/`snapshotEvents()` with a peer floor of the version that introduced them.

## 5. What the user can do RIGHT NOW (concrete pre-install check)

- **Read the host changelog for every version between the peer floor and the installed host** — here: alpha.2 → alpha.3 → alpha.4 → alpha.5. The alpha.4 entry explicitly says `Session.events` was replaced and "developers should pay attention to compatibility". Any plugin written against the old API and range-floored below alpha.4 is suspect. (Equivalently: check the plugin's release/migration notes against the skill's corridor cards for the alpha.3→alpha.4 edge.)
- **Static grep before install**: fetch the plugin tarball (`npm pack @deepseek-harness-tui/dsh-tui` or the unpkg URL) and search for APIs the corridor removed:
  ```
  npm view @deepseek-harness-tui/dsh-tui@0.1.0-beta.4 peerDependencies   # floor vs your host
  npm pack @deepseek-harness-tui/dsh-tui && tar xzf *.tgz
  grep -rn "\.events" package/ | head     # 42 hits → uses removed Session.events
  ```
  Hits on removed-API names (`session.events`, `tasks.peek`, `SubprocessHandle.pid`, …) against a host above the removal version = do not install; pick a newer plugin build.
- Cheapest variant with zero tooling: `npm view <plugin> peerDependencies` and compare the floor against the host's changelog — if the floor is **below** a release that carries "developers should pay attention to compatibility" entries, assume breakage until the plugin's changelog says it migrated.

## Verdict summary

| Question | Answer |
|---|---|
| Removed API | `Session.events` (eager events array) |
| Release | dsh **v0.1.2-alpha.4** |
| Replacement | `session.seq`, `session.eventAt()`, `session.snapshotEvents()` |
| Why install was silent | `0.1.2-alpha.5` satisfies `^0.1.2-alpha.2` (>=alpha.2 <0.2.0); peer check is version metadata only |
| Crash mechanism | `session.events` → `undefined` → `TypeError: events is not iterable` in plugin's `prepareReplayEvents` during `apply` |
| Immediate user fix | Upgrade dsh-tui to a build migrated to the on-demand APIs, or install a dsh `<0.1.2-alpha.4` cohort / older plugin pairing; check changelog + grep the tarball before installing |

*Fixture directory untouched; no installs or migrations executed; read-only Mode A analysis.*
