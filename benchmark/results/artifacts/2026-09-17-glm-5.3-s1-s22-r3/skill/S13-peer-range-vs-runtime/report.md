# S13 · Peer Range vs Runtime Reality — Analysis Report

Task: read-only diagnosis of why `@deepseek-harness-tui/dsh-tui@0.1.0-beta.4`
installs cleanly on dsh `0.1.2-alpha.5` yet crashes at startup.

Mode: A · inspect (plugin-upgrade skill) — read-only investigation; no files,
dependencies, or runtime state were changed. Fixture evidence under
`environment/fixture/` was read and left untouched.

## Evidence used

- `npm-install-output.txt` — install succeeded, no peer warnings; peerDependencies
  declare `^0.1.2-alpha.2` for every `@deepseek-ai/dsh-*` package.
- `crash-stack.txt` — `TypeError: events is not iterable` at `prepareReplayEvents
  (channel.js:623)`, inside the plugin's own `apply()`.
- `plugin-source-excerpt.js` — the plugin reads `session.events` (42 references,
  e.g. lines 734, 6685, 657, 2685, 3004) and iterates it for transcript replay.
- `dsh-changelog-excerpt.md` — dsh v0.1.2-alpha.4 release notes.

## 1. The exact runtime incompatibility

**WHAT was removed:** the eagerly materialized `Session.events` array. The dsh
v0.1.2-alpha.4 changelog entry states:

> **Replace `Session.events` with on-demand read APIs**: `seq`, `eventAt()`,
> and `snapshotEvents()` — the eagerly materialized events array is removed
> to reduce memory overhead in long sessions.

**WHEN:** dsh `0.1.2-alpha.4` (the corridor edge 0.1.2-alpha.3 → 0.1.2-alpha.4;
the same card is documented in the plugin-upgrade skill's
`references/v0.1.2-alpha.4.md`). The same release also introduced the strongly
branded `SessionSeq` / `SessionLogOffset` types.

**WHAT replaced it:** the on-demand read APIs `session.seq`, `session.eventAt()`,
and `session.snapshotEvents()`.

**Mechanism of the crash:** the plugin declares a corridor floor of
`^0.1.2-alpha.2`, so it was written against the alpha.2-era API where
`session.events` was a real array. On alpha.5 that property no longer exists.
The first read of `liveAgent.session.events` yields `undefined`; passing it to
iteration in `prepareReplayEvents`
(`for (... of events)` / spread / destructuring) throws
`TypeError: events is not iterable` inside `apply()`, which fails the Cordis
fiber load ("plugin tree failed to load: failed to apply loader entry dsh-tui").
A missing property that flows into an iteration is exactly the failure mode
produced by this removal.

## 2. Why npm installed without warnings

npm's peer-dependency check is a **pure static semver comparison against package
metadata**. It resolves the peer ranges declared in the plugin's `package.json`
against the versions of `@deepseek-ai/dsh-*` bundled with the globally installed
`@deepseek-ai/dsh@0.1.2-alpha.5`, and asks one question: *do the installed
versions fall inside the declared ranges?*

- Declared: `^0.1.2-alpha.2`, i.e. `>=0.1.2-alpha.2 <0.2.0-0` (for 0.x versions,
  `^` pins the same minor, so the range covers all 0.1.2 prereleases and the
  0.1.2 final, but not 0.1.3).
- Installed: 0.1.2-alpha.5. In semver, prereleases of the same version tuple
  compare by their dot-separated identifiers: `alpha.5 > alpha.3 > alpha.2`.
  So alpha.5 satisfies the range and npm passes silently.

What a peer range **guarantees**: only that the host's package versions are
numerically within the corridor the *author declared* — an install-time,
metadata-level statement about version numbers.

What it **does NOT guarantee**:

- that the author actually tested any version in that range (the range is a
  hand-written claim, not a test result);
- that the APIs the plugin calls still exist or behave the same at every version
  inside the range — semver *ordering* says nothing about API *content*;
- anything about the actual runtime shape of loaded modules, services, or
  objects (npm never loads or executes the peer packages' code).

Here the author's range was simply wrong: it predates (or ignores) the
alpha.4 removal of `Session.events`, so a numerically "compatible" alpha.5
host ships code where the property the plugin reads 42 times is gone.

## 3. Peer-range satisfaction vs runtime compatibility

**"Peer range satisfaction" checks:** a static, package-metadata-level condition —
*version numbers declared in the installed tree fall inside the ranges the
consumer declared*. It is evaluated by the package manager at install time
without loading any code.

**"Runtime compatibility" checks:** a behavioral, code-level condition — *when the
plugin's code actually executes against the host's actually-loaded modules, every
API it consumes exists with the expected signature and semantics*. It is only
observable by running (or statically analyzing actual loaded code / type
declarations).

Two categories of breakage that pass peer-range validation but crash at runtime:

1. **Removed/renamed API surface** (this case): the host deletes or renames an
   export, property, or method (`Session.events` → `seq`/`eventAt()`/
   `snapshotEvents()`). Install is clean; the plugin throws at first use
   (`TypeError: events is not iterable`, `x is not a function`,
   `Cannot read properties of undefined`).
2. **Behavioral/contract changes with unchanged names** — the export still exists
   but its signature, return type, timing, or semantics changed (e.g. a callback
   gains a required parameter, a method becomes async, a returned array becomes a
   cursor/iterator, required fields added to a payload the plugin must now send).
   Nothing is `undefined`, so the crash is subtler: wrong results, unhandled
   rejections, or validation errors deep inside the host.

(Other instances of the same class: a consumed Cordis service is renamed or
split, so `ctx.get()` returns `undefined`; an event payload schema tightens and
the host rejects the plugin's emissions.)

Key principle: for prerelease corridors especially, semver ordering
(`alpha.5 > alpha.2`) encodes *sequence*, not *compatibility*. A 0.x prerelease
series carries no compatibility promise at all; every alpha edge can remove APIs
while remaining inside the same `^` range.

## 4. What the plugin author should have done

**Before publishing (catch it):**

- Test against the actual target versions, not just the corridor floor: run the
  plugin's load/mount against every host version the peer range admits — at
  minimum the floor (alpha.2) and the current top of the range (alpha.5 at
  publish time), in a clean profile, asserting the plugin activates and one core
  path executes (here: transcript replay over session events).
- Treat the peer range as a *tested* claim: tighten it to what was actually
  verified (e.g. pin `0.1.2-alpha.2` … `0.1.2-alpha.3` by declaring
  `~`/`>=… <` bounds that exclude alpha.4+, i.e. `">=0.1.2-alpha.2 <0.1.2-alpha.4"`)
  and widen it only after re-testing against newer hosts. CI against a matrix of
  host versions from the range keeps the claim honest over time.
- Watch the host changelog corridor edges the range spans (alpha.3→alpha.4 here)
  and re-run tests on every new host release inside the range.

**What metadata can encode vs. what needs runtime guards:**

- The **peer range / engines field** should encode the *known-tested corridor*:
  versions the author has actually built and run against. It cannot encode
  "which API generation this plugin targets" once a range spans a breaking edge.
- **Runtime feature detection** is required for anything the range cannot pin:
  detect the API generation at startup and branch —
  `const events = typeof session.snapshotEvents === 'function' ? session.snapshotEvents() : session.events;`
  — or, better, fully migrate to the new API (`snapshotEvents()`,
  `eventAt()`, `seq`) and lower the peer floor to `>=0.1.2-alpha.4` so the
  metadata and the code agree. Fail loud with a clear message naming the missing
  API and the host version rather than throwing a bare `TypeError`.

## 5. What the user can do RIGHT NOW (concrete pre-install check)

Before installing, grep the plugin's published code (or its tarball /
repository) for the APIs the current host changelog has removed, and compare
against the host's shipped type declarations:

1. Fetch the exact bits npm would install without executing them:
   `npm view @deepseek-harness-tui/dsh-tui@0.1.0-beta.4 dist.tarball`, download
   and unpack it (or `npm pack`), then `grep -rn "\.session\.events\|session\.events"
   package/` — 42 hits immediately flags use of the removed API.
2. Cross-check every hit against the removal entries in the host changelog for
   all versions inside the declared peer range (alpha.3→alpha.4 here removes
   `Session.events`), or typecheck the plugin's sources against the installed
   host's `@deepseek-ai/dsh-*` type declarations (`skipLibCheck: false`):
   `Property 'events' does not exist on type 'Session'` is the static tell of
   this exact crash.

The general check: **the set of host APIs the plugin references must be a subset
of the APIs the installed host still exports** — a comparison npm's peer-range
check never performs.

## Verdict summary

| Question | Answer |
|---|---|
| Removed API | `Session.events` (eagerly materialized events array) |
| Removed in | dsh `0.1.2-alpha.4` |
| Replaced by | `session.seq`, `session.eventAt()`, `session.snapshotEvents()` |
| Why install passed | `^0.1.2-alpha.2` is a static semver range; alpha.5 numerically satisfies it; npm never checks API existence |
| Categories passing peers but crashing | removed/renamed exports; renamed/split services; behavioral contract changes on unchanged names |
| Author fix | test against actual range endpoints; encode the tested corridor in peers; runtime feature-detect (`snapshotEvents` vs `.events`) or migrate and raise the floor |
| User pre-install check | grep the tarball for removed APIs / typecheck against installed host declarations |

## Skipped / not applicable

- No installs, migrations, or runtime executions were performed (read-only Mode A;
  the benchmark forbids them). The crash mechanism is derived from the stack
  trace, source excerpt, and changelog, not reproduced live.
- Remediation of the plugin (code changes, peer-range tightening) is proposed
  only; implementing it would require the plugin author's repository.

## Pending / residual risk

- Line numbers in the crash stack and source excerpt do not line up exactly
  (623/6127/6685 vs "line 734 area"), consistent with an excerpted/minified
  artifact; the API identification is unaffected.
