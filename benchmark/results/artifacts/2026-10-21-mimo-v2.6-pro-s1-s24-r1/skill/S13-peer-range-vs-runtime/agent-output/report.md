# S13 · Peer Range vs Runtime Reality — Report

**Scope**: read-only analysis of the evidence pack in `fixture/` (npm peer-deps output, crash stack, plugin source excerpt, dsh changelog excerpt) for `@deepseek-harness-tui/dsh-tui@0.1.0-beta.4` crashing on `@deepseek-ai/dsh@0.1.2-alpha.5`. No installs or migrations were run; the fixture is untouched. Card IDs from the plugin-upgrade skill are cited by ID and key point only.

---

## 1. The exact runtime incompatibility

**WHAT was removed**: `Session.events` — the eagerly materialized events array on the dsh session object
(`session.events`, `session.events.length`, `session.events[i]`, `session.events.at(-1)`, spread copies).
The plugin reads this at 42 call sites (`fixture/plugin-source-excerpt.js`: `liveAgent.session.events` at
channel.js:734, `replayEvents(agent.session.events)` at :6685, `:657`, `:2685`, `:3004`, …), so the crash is
systemic, not a single bad line.

**WHEN**: dsh **v0.1.2-alpha.4** (tag `dsh-v0.1.2-alpha.4` = `4e84901e64`, 2026-09-01; 297 commits after
alpha.3 = `dd6322d604`). Cited changelog entry (`fixture/dsh-changelog-excerpt.md`, alpha.4 release notes,
"Other Changes"):

> **Replace `Session.events` with on-demand read APIs**: `seq`, `eventAt()`, and `snapshotEvents()` —
> the eagerly materialized events array is removed to reduce memory overhead in long sessions.
> Developers should pay attention to compatibility.

Skill card **DSH-0.1.2-A4-03** (corridor dsh-v0.1.2-alpha.3 → alpha.4) records the same breaking removal
(`Session` no longer has an `events` getter; untyped JS reads `undefined` and throws on iteration).

**WHAT REPLACED IT**: on-demand read APIs on `Session` (card DSH-0.1.2-A4-03 ledger):

| Old (removed) | New |
|---|---|
| `session.events.length` | `session.seq` (a `SessionLogOffset`) |
| `session.events[i]` | `session.eventAt(SessionSeq(i))` |
| `session.events` (whole log) | `session.snapshotEvents()` (frozen snapshot, cached until next append) |
| `session.events.slice(a, b)` | `session.snapshotEvents(SessionLogOffset(a), SessionLogOffset(b))` |
| "events written by this session" | `session.ownEvents()` |

Companion card **DSH-0.1.2-A4-04** (same edge): `SessionSeq` / `SessionLogOffset` become branded numbers
(constructors throw `TypeError` on anything but non-negative safe integers) and `seedLength` becomes
`isSeeded` + `inheritedEventCount` — a second incompatibility the plugin's seq arithmetic will also hit.

**Mechanism of the crash** (`fixture/crash-stack.txt`): on the alpha.5 host (which is *after* alpha.4, so the
removal is live), `liveAgent.session.events` evaluates to `undefined`; `prepareReplayEvents` then iterates it
→ `TypeError: events is not iterable` (channel.js:623), which fails the loader entry `dsh-tui` at startup
(`dsh: plugin tree failed to load`). alpha.5 does not restore the API (its cards are storage-layer only).

## 2. Why npm install succeeded with no warnings

`^0.1.2-alpha.2` expands to `>=0.1.2-alpha.2 <0.2.0-0`. `0.1.2-alpha.5` satisfies it: semver's prerelease rule
(a prerelease matches only comparators with the same major.minor.patch tuple and a prerelease tag) holds here
(both sides are `0.1.2-alpha.*`), and `0.1.2-alpha.5 > 0.1.2-alpha.2` in semver ordering. So npm compared
**two version strings** and passed silently (`fixture/npm-install-output.txt`). npm never inspects code.

**What a peer range (`^0.1.2-alpha.2`) actually guarantees** — only package-metadata-level facts:

1. **Resolvability**: the package manager can install a version whose *number* lies in the interval.
2. **A publish-time claim by the author** that they intended compatibility with that interval — a hand-written
   assertion, not a test result.
3. At most, for **stable** releases, the semver contract that compatible versions keep the public API.

**What it does NOT guarantee**:

- That any named API (e.g. `Session.events`) still exists in any in-range version — the range describes
  *ordering of numbers*, not the shape of an object.
- That the author ever ran the plugin against alpha.4/alpha.5 — the range is untested claim space.
- Behavioral/semantic stability: defaults, wire protocol, type contracts inside the interval.
- **Prerelease stability at all**: per semver §9 a prerelease "might not satisfy the intended compatibility
  requirements as denoted by its associated normal version" — `alpha.2 → alpha.5` explicitly spans the alpha.4
  breaking release. On a `0.x` line even the stable part of the semver contract is weak (major 0 = anything may
  change), and `^0.1.2-…` admits the whole `0.1.x` line up to `<0.2.0` — far wider than "what I tested at alpha.2".

The trap named by this task: `0.1.2-alpha.5 > 0.1.2-alpha.2` in semver ordering proves only **ordering**, not that
`Session.events` survived the alpha.4 removal sitting *between* them inside the same range.

## 3. The fundamental principle

- **Peer range satisfaction** checks: *static, package-metadata-level* — "does the installed **version number**
  lie inside the declared **interval**?" Inputs: `package.json` peerDependencies strings + resolved versions.
  Zero behavioral content.
- **Runtime compatibility** checks: *behavioral, code-level* — "does the **API surface the plugin actually
  touches** still exist on the running host, with compatible semantics?" Inputs: the host's real
  exports/objects and the plugin's real call sites.

**Categories of breakage that pass peer-range validation but crash at runtime** (from the corridor cards):

1. **Removed / renamed API surface** — a symbol the plugin reads is gone or moved: `Session.events` removed
   (A4-03); the `report` subagent tool package deleted in favour of `send_message` (A4-01); package renames
   such as `@deepseek-ai/dsh-code-runtime-python` → `…dsh-experimental-code-runtime-python` (A4-02).
2. **Changed signatures / type contracts on surviving names** — the member exists but no longer accepts or
   returns what it did: branded `SessionSeq`/`SessionLogOffset` constructors now throw `TypeError` (A4-04);
   Remote `history` `atSeq` is validated and rejected with `gateway/bad-request` (A4-03).
3. **Behavioral / default changes with no signature change** — code runs but silently does the wrong thing:
   the `ptc` preset drops the `workflow` tool (A4-05); the base bundle enables `web_fetch` by default (A4-06).

Any one of these leaves every peer range satisfied and the plugin broken.

## 4. What the plugin author should have done

**Before publishing (catch it):**

- **Test against the actual target cohort, not the peer floor.** Run `tsc --noEmit` of the plugin against
  `@deepseek-ai/dsh-*` at the *newest claimed* version (and the floor): every `.events` read would fail with
  "Property 'events' does not exist on type 'Session'" before any user sees `events is not iterable`. Type
  checking against real host declarations turns API-removal breakage into a build error.
- **Cold-boot smoke test on a real host of each claimed version** in an isolated throwaway profile (the
  plugin-upgrade skill's `verify-runtime.mjs` pattern: install into an isolated profile with a dead model
  endpoint, verify entry activation and that services are not pending). The plugin's own startup path
  (`createChannel` → `replayEvents`) is exactly such a smoke test and would have crashed in CI.
- **Track the host changelog/version cards across the whole claimed window** (e.g. skill cards
  DSH-0.1.2-A4-01…06 for the alpha.3→alpha.4 edge). "Developers should pay attention to compatibility" markers
  are mandatory re-verification points. On a prerelease line there is no stability contract — re-verify at
  **each** host alpha/RC, and publish the adapted plugin build under the npm `alpha` dist-tag (rollup R-08
  dist-tag practice) so `latest` users are not auto-upgraded into an incompatible build.
- **Touchpoint scan of own source** (skill `pre-flight.md` seven classes; here #2 persistent events, #3 Remote
  history): a grep for the removed symbol across the source (42 `.events` hits) is the cheap static version.

**To help users (what metadata encodes what):**

- **The peer range should encode what was actually tested** — a verified claim window, not a wish. For
  prerelease hosts pin the tested cohort explicitly, e.g. `">=0.1.2-alpha.2 <0.1.2-alpha.4"` or
  `"0.1.2-alpha.2 || 0.1.2-alpha.3"`, and widen only after re-testing the new edge. `^0.1.2-alpha.2` is exactly
  the over-wide claim that let alpha.4/alpha.5 through. Keep every peer value a string (card
  DSH-0.1.7-RC1-01: a non-string peer makes the manifest unverifiable).
- **`engines` encodes the environment floor** (Node/runtime version), **not** API availability — neither
  `peerDependencies` nor `engines` can express "needs `Session.snapshotEvents`".
- What ranges cannot express needs a **runtime feature-detection guard**: probe the seam actually used at
  startup (`typeof session.snapshotEvents === 'function'` / `'events' in session`) and either run a dual-read
  adapter (legacy `.events` if present, else `snapshotEvents()` — one build works across alpha.2…alpha.5) or
  fail fast with an actionable message ("dsh-tui 0.1.0-beta.4 requires `Session.events`, removed in dsh
  0.1.2-alpha.4; use snapshotEvents() or a dsh ≤ 0.1.2-alpha.3"), instead of `events is not iterable` deep in a
  replay helper.
- Note: newer dsh (0.1.7-rc.1, card **DSH-0.1.7-RC1-01**) enforces DSH peer ranges at install and startup
  with exact-version exemptions in `<profile>/compatibility.json` — but that enforcement runs the same
  `semver.satisfies` arithmetic on the same strings, so it validates *ranges*, not *APIs*. An honest, tested
  range plus feature detection remains the author's job.

## 5. What I (the user) can do RIGHT NOW — a concrete pre-install check

**Inspect the packed artifact and diff its API usage against the host's breaking changes *before* installing.**
Concretely (nothing is installed; the tarball is unpacked to a scratch dir for reading):

```sh
# 1. the metadata claim, without installing
npm view @deepseek-harness-tui/dsh-tui@0.1.0-beta.4 peerDependencies engines

# 2. fetch the exact tarball you would install and unpack it read-only
npm view @deepseek-harness-tui/dsh-tui@0.1.0-beta.4 dist.tarball
curl -sL <dist.tarball> -o dsh-tui.tgz && mkdir scratch && tar -xzf dsh-tui.tgz -C scratch

# 3. list the host APIs the plugin touches (here the smoking gun)
grep -rn "session\.events\|\.events\b" scratch/package --include=*.js
```

Then hold each hit against the dsh release notes between the peer floor (alpha.2) and your host (alpha.5):
any symbol a release marks "removed"/"replaced" (here `Session.events`, alpha.4) is a **pre-install kill
signal** — this one grep reproduces the whole diagnosis without ever running the plugin.

Same-class variants: typecheck the plugin against your exact dsh alpha.5 declarations (`tsc --noEmit` reports
the dead `events` property), or cold-boot it in a **throwaway profile** (skill `verify-runtime.mjs`-style
isolated profile — never the global install) and read the loader error there. Class principle: before install,
verify **API-surface overlap between the plugin's call sites and the host's exports**; the peer range answers
only "is 0.1.2-alpha.5 inside [0.1.2-alpha.2, 0.2.0)".

**Immediate remediation for the broken install**: pin back to a dsh host that still has `Session.events`
(≤ 0.1.2-alpha.3), or move to/patch a dsh-tui build that uses `snapshotEvents()`; file this evidence pack with
the plugin author.

---

## run-stats

- toolcalls: 21 effective (20 nested tool calls across 12 run_code invocations + 1 send_message; 1 malformed-argument read attempt was rejected before any filesystem access)
- token usage: n/a (not visible to this session)
- completed: 2026-10-21 14:55 (Asia/Shanghai)
