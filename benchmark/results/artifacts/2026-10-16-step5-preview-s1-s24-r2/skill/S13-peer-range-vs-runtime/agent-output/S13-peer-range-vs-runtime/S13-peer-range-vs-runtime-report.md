# S13 · Peer Range vs Runtime Reality — Diagnosis Report

**Case**: `@deepseek-harness-tui/dsh-tui@0.1.0-beta.4` installed cleanly (no peer warnings) on
`@deepseek-ai/dsh@0.1.2-alpha.5`, then crashes at startup.
**Verdict in one line**: npm validated *version numbers*; the plugin needs an *API that was deleted
one release earlier*. `^0.1.2-alpha.2` matched `0.1.2-alpha.5` as a string range while the plugin's
code targets an API surface that stopped existing at `0.1.2-alpha.4`.

---

## 1. The exact runtime incompatibility

**WHAT was removed**: `Session.events` — the eagerly materialized, array-valued `events` getter on
Session objects (`session.events`, `session.events.length`, `session.events[i]`,
`session.events.at(-1)`, spread copies).

**WHEN (which release)**: **dsh v0.1.2-alpha.4** (the alpha.3 → alpha.4 edge, tag `4e84901e64`,
2026-09-01; 297 commits / 2371 files). Your host at alpha.5 still carries the alpha.4 removal — the
plugin's peer range (`^0.1.2-alpha.2`) spans the break.

**WHAT replaced it** — on-demand read APIs (nothing is eagerly materialized anymore, to cut memory
overhead in long sessions):

| Old (≤ alpha.3) | New (≥ alpha.4) |
|---|---|
| `session.events` (whole log) | `session.snapshotEvents()` — frozen snapshot of a half-open range, cached until the next append |
| `session.events[i]` | `session.eventAt(SessionSeq(i))` — one accepted, deeply frozen event |
| `session.events.length` | `session.seq` — current log length (a `SessionLogOffset`) |
| `session.events.slice(a, b)` | `session.snapshotEvents(SessionLogOffset(a), SessionLogOffset(b))` |
| "events this session itself appended (not the fork-inherited prefix)" | `session.ownEvents()` |

Companion change in the same release: `SessionSeq` / `SessionLogOffset` became **branded** number
types with throwing constructors, and `seedLength` was replaced by `isSeeded` +
`inheritedEventCount`.

**Changelog citation** (fixture `dsh-changelog-excerpt.md`, dsh v0.1.2-alpha.4 release notes,
"Other Changes"):

> - **Replace `Session.events` with on-demand read APIs**: `seq`, `eventAt()`, and
>   `snapshotEvents()` - the eagerly materialized events array is removed to reduce memory overhead
>   in long sessions. Developers should pay attention to compatibility. (@kermanx)
>
> - **Distinguish `SessionSeq` and `SessionLogOffset` with strong types** - developers should pay
>   attention to compatibility. (@tianyicui)

**How the crash maps onto the removal** (fixture `crash-stack.txt` + `plugin-source-excerpt.js`):

- `plugin-source-excerpt.js` line 734: `const events = liveAgent.session.events;` — at alpha.4+
  this getter is gone, so the read is `undefined` (in plain JS there is no type error; TypeScript
  would have failed with *"Property 'events' does not exist on type 'Session'"*).
- Line 6685: `replayEvents(agent.session.events);` passes `undefined` into the replay path.
- Stack: `prepareReplayEvents (channel.js:623:25)` → `replayEvents (channel.js:6127:33)` →
  `createChannel (channel.js:6685:5)` → `apply (plugin.js:425:21)` → Cordis
  `Fiber._reload (cordis/lib/index.js:1355:5)`.
- The plugin has **42 references to `.events` on session objects** (lines 657, 2685, 3004, 734,
  6685, …). The failure `TypeError: events is not iterable` is `undefined` reaching an iteration /
  spread site. One fixed line would not save it; the whole transcript-replay path reads a getter
  that no longer exists.
- The loader-level wrapper `dsh: plugin tree failed to load: failed to apply loader entry dsh-tui`
  is why the *entire* plugin tree dies at startup rather than just one feature.

---

## 2. Why npm installed without a single warning

**What `peerDependencies` actually is**: a purely *static, package-metadata-level* declaration.
At install time npm reads only `package.json` name/version strings: it resolves the peer *range*
against the version numbers of the packages it finds in the tree. It never opens the plugin's
code, never resolves its imports, never loads it, and never consults the host's changelog.

**What `^0.1.2-alpha.2` actually guarantees** — verified by re-implementing the range
(`>=0.1.2-alpha.2 <0.2.0-0`, with node-semver's rule that a prerelease version only matches a
comparator sharing its `[major,minor,patch]` tuple):

| Host dsh version | Satisfies `^0.1.2-alpha.2`? |
|---|---|
| 0.1.2-alpha.1 | ❌ (below the floor) |
| 0.1.2-alpha.2 | ✅ |
| **0.1.2-alpha.3** | ✅ (last version with `Session.events`) |
| **0.1.2-alpha.4** | ✅ (**the release that removed `Session.events`**) |
| **0.1.2-alpha.5** (yours) | ✅ |
| 0.1.2 / 0.1.3 / 0.1.2-rc.1 | ✅ (the whole 0.1.x line) |
| 0.1.1-rc.2 / 0.2.0-alpha.0 | ❌ |

So the guarantee is *only*: "the host's dsh packages will carry a **version number** inside
`>=0.1.2-alpha.2 <0.2.0-0`." That is a statement about semver ordering of strings — nothing more.

**What it does NOT guarantee**:

- that any API the plugin calls still exists (here: 42 reads of a getter deleted at alpha.4);
- that APIs are stable *across prereleases of the same `0.1.2` line* — prereleases of a version are
  explicitly **not** API-frozen; dsh's own release notes say "developers should pay attention to
  compatibility";
- that the plugin's imports resolve, that it loads, or that it behaves correctly;
- which of the 28 declared `@deepseek-ai/dsh-*` peers the plugin actually imports or what it calls
  on them (the peer list is name+version pairs; the code is never examined).

**Why the silence is structurally guaranteed**: npm ≥ 7 auto-installs peers and only emits
`ERESOLVE` when the range itself cannot be satisfied. Here `0.1.2-alpha.5` *does* satisfy the
range — there is no conflict to warn about. The breakage lives entirely in a dimension npm's peer
check does not model: **API surface over time inside a satisfied range**.

---

## 3. The fundamental principle

> **Peer-range satisfaction** is a *static, declaration-level* check on version strings:
> "does version X fall inside range R?" — evaluated by npm at install time, from metadata alone,
> before any code runs.
>
> **Runtime compatibility** is a *behavioral, code-level* reality: "when this plugin's actual
> instructions execute against the actual running host, does every API it touches exist, with the
> expected shape and semantics?" — only observable by executing the plugin.

The first says nothing about the second. A range is a coordinate in version space; it is not a
statement about API stability inside that coordinate.

**Categories of breakage that pass peer-range validation but fail at runtime** (this case exhibits
#1 and #2; all are real, carded dsh changes):

1. **API removal / rename inside the satisfied range** — `Session.events` removed at alpha.4 (this
   case); the `report` tool package deleted in favor of `send_message` (same release);
   `@deepseek-ai/dsh-code-runtime-python` renamed to
   `@deepseek-ai/dsh-experimental-code-runtime-python`. Range matches; the symbol is gone.
2. **Same-name signature / shape changes** — `SessionSeq`/`SessionLogOffset` became branded
   numbers with throwing constructors; `seedLength` → `isSeeded` + `inheritedEventCount`;
   workspace navigation (`connectWorkspace` / `pickDirectory`) moved from `ctx.workspaces` to
   `ctx.uiWorkspace`. TypeScript consumers get a compile error; **plain-JS consumers get a runtime
   crash or silent wrong behavior** — exactly the plugin's situation.
3. **Removed services / transports** — the ApiProxy transport layer was removed; a plugin row with
   `require: ['apiProxy']` never activates and the boot hangs on `waiting for service: apiProxy`.
   Install is silent; startup stalls.
4. **Default / behavior changes** — the `ptc` preset stopped publishing the general `workflow`
   tool; the base bundle enabled `web_fetch` by default (both alpha.4). No crash, no warning —
   silently different behavior.

Common thread: npm's peer check sees **package name + version string**; every category above is a
change to **code** (exports, types, services, defaults) that semver ranges in a prerelease line
simply do not encode.

---

## 4. What the plugin author should have done

### To catch this before publishing (test against the actual target, not the range)

1. **Install and boot the plugin on the real host at the newest version the range allows**
   (`0.1.2-alpha.5`, not alpha.2), in a throwaway profile: a cold start that asserts plugin-tree
   activation fails in ~1 s on a broken plugin (a dead model endpoint makes boot reach the model
   stage deterministically). The plugin-upgrade skill packages this as
   `skills/plugin-upgrade/scripts/verify-runtime.mjs <plugin-spec>`, which reports failure
   attribution as plugin-code / dependency-resolution / profile-config / dsh-runtime. This exact
   crash would have been classified `plugin-code` before release.
2. **Typecheck against the target cohort**: `tsc --noEmit` against `@deepseek-ai/dsh-session` at
   alpha.4/5 fails with *"Property 'events' does not exist on type 'Session'"* — 42 grep-able
   hits. If the plugin is plain JS, add the dsh type packages as dev dependencies and run the
   same check.
3. **Read the corridor** between the peer floor and the ceiling: the alpha.2 → alpha.5 edges are
   fully carded (`DSH-0.1.2-A4-03` is precisely this removal, with the old→new ledger), and a
   `rg -n "\.events\b"` self-scan against those cards takes minutes.

### To help users (metadata vs. runtime guard)

- **What the peer range / `engines` field SHOULD encode**: the version corridor that was actually
  *verified*. Across a prerelease line, a caret like `^0.1.2-alpha.2` is a promise the author
  cannot keep — it spans breaking alpha edges by construction. Pin exactly or narrowly
  (e.g. `"@deepseek-ai/dsh-session": "0.1.2-alpha.4"`, or a range whose ceiling excludes the next
  breaking edge), declare peers only on the packages actually imported (not 28 shotgun rows), and
  record the verified host version in release notes / `engines`.
- **What NO range can encode — and therefore needs a runtime feature-detection guard**: the mere
  *presence of a specific API*. The plugin should branch at runtime, e.g.
  `typeof session.snapshotEvents === 'function' ? replay(session.snapshotEvents()) : replay(session.events)`
  (dual-path across the transition window), and — when neither exists — fail with an actionable
  message ("dsh-tui requires dsh ≥ 0.1.2-alpha.4 (on-demand session read APIs); detected <version>")
  instead of a raw `TypeError: events is not iterable`.

---

## 5. What you can do RIGHT NOW — concrete pre-install check

1. **Read the metadata before anything touches your machine** (no install required):
   ```sh
   npm view @deepseek-harness-tui/dsh-tui peerDependencies engines   # what it claims
   dsh --version                                                     # what you actually run
   npm pack @deepseek-harness-tui/dsh-tui --pack-destination /tmp   # download only
   tar tzf deepseek-harness-tui-dsh-tui-0.1.0-beta.4.tgz            # inspect package.json
   ```
   Then compare the declared range against your real host version — and treat a *wide* range over
   a prerelease line as a red flag, not reassurance.
2. **The decisive check is behavioral, because metadata cannot prove runtime compatibility**:
   install into a throwaway profile and cold-boot the real host to confirm the plugin tree
   activates *before* enabling it globally —
   `node skills/plugin-upgrade/scripts/verify-runtime.mjs @deepseek-harness-tui/dsh-tui`
   (isolated `DSH_HOME`, dead-endpoint boot probe, exit code 0 = pass / 1 = fail / 2 =
   inconclusive, with plugin-code vs dependency-resolution vs profile-config vs dsh-runtime
   attribution). Your crash signature — `plugin tree failed to load` /
   `TypeError: events is not iterable` — matches the `ACTIVATION_RE` family that script classifies
   as a **fail**, before the plugin is ever trusted.
3. **Static shortcut**: `rg -n "session\.events|\.events\b"` across the unpacked tarball, then
   check those symbols against the changelog of your installed version. 42 hits on a removed
   getter is a verdict in seconds.
4. **Principle to carry forward**: *probe behavior, don't read version numbers.* The same lesson
   the plugin-upgrade skill enforces for ghost hosts ("a process's replies, not the disk, tell you
   its generation") applies to plugins: a satisfied peer range tells you what the author
   *declared*, never what the running host *provides*.

---

## What to do on this machine now

- This is **not** a broken install and not a bad peer range on npm's side — the install is
  correct; the plugin is genuinely incompatible with dsh 0.1.2-alpha.4/5. Do not reinstall.
- Practical options, in order: (a) check for a newer `dsh-tui` release fixed for alpha.4+, or
  report to the author with this evidence (crash stack + the alpha.4 changelog entry); (b) if you
  must stay on alpha.5, keep the plugin disabled — a failed loader entry takes the whole plugin
  tree down at startup; (c) if you must run dsh-tui today, downgrade the host to
  `0.1.2-alpha.3` from an **external terminal with every dsh process fully stopped**
  (`npm install -g @deepseek-ai/dsh@0.1.2-alpha.3`) — never from inside a running dsh session,
  because the session *is* the host process.
- This report is read-only diagnosis (Mode A): nothing was installed, modified, or executed
  against the fixture.

## Evidence index

| Fixture file | What it proved |
|---|---|
| `npm-install-output.txt` | Install succeeded, zero peer warnings; 28 `@deepseek-ai/dsh-*` peers all `^0.1.2-alpha.2`; alpha.5 satisfies the range |
| `dsh-changelog-excerpt.md` | `Session.events` removed in v0.1.2-alpha.4, replaced by `seq` / `eventAt()` / `snapshotEvents()` |
| `plugin-source-excerpt.js` | Plugin reads `session.events` (line 734) and replays it (line 6685); 42 `.events` references total |
| `crash-stack.txt` | `TypeError: events is not iterable` at `prepareReplayEvents` → `plugin tree failed to load` |
| `README.md` | Fixture is read-only evidence |

Corroborating read-only references from `skills/plugin-upgrade/`: change card
**DSH-0.1.2-A4-03** (`Session.events` removal + old→new ledger) and **DSH-0.1.2-A4-04** (branded
seq types) in `references/v0.1.2-alpha.4.md`; the seven-class touchpoint scan in
`references/pre-flight.md` (class #2, persistent events); the layered runtime-validation
requirement and `scripts/verify-runtime.mjs` in `SKILL.md` / `scripts/`.
