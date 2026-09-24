# S13 · Peer Range vs Runtime Reality — Diagnosis Report

**Scenario**: `@deepseek-harness-tui/dsh-tui@0.1.0-beta.4` installed on dsh `0.1.2-alpha.5`. `npm install -g` succeeded with zero peer warnings; the plugin crashes at first startup. Evidence: `fixture/npm-install-output.txt`, `fixture/crash-stack.txt`, `fixture/plugin-source-excerpt.js`, `fixture/dsh-changelog-excerpt.md`. Corroborated against the plugin-upgrade skill's version cards (`references/v0.1.2-alpha.4.md`, cards DSH-0.1.2-A4-03/04) and install-channel notes (`references/rollup-0.1.2.md`, R-08).

---

## 1. The exact runtime incompatibility

**WHAT was removed**: `Session.events` — the eagerly materialized, iterable events array on the dsh `Session` object.

**WHEN**: dsh **`v0.1.2-alpha.4`**. The changelog entry (`fixture/dsh-changelog-excerpt.md`, alpha.4 release notes, "Other Changes"):

> **Replace `Session.events` with on-demand read APIs**: `seq`, `eventAt()`, and `snapshotEvents()` — the eagerly materialized events array is removed to reduce memory overhead in long sessions. Developers should pay attention to compatibility. (@kermanx)

The same release also carries a second compatibility-relevant entry:

> **Distinguish `SessionSeq` and `SessionLogOffset` with strong types** — developers should pay attention to compatibility. (@tianyicui)

**What replaced it** (per skill card DSH-0.1.2-A4-03, matching the changelog's `seq` / `eventAt()` / `snapshotEvents()`):

| Old (`<= alpha.3`)                  | New (`alpha.4+`)                                            |
|-------------------------------------|-------------------------------------------------------------|
| `session.events.length`             | `session.seq`                                               |
| `session.events[i]`                 | `session.eventAt(SessionSeq(i))`                            |
| `session.events` (whole log)        | `session.snapshotEvents()`                                  |
| `session.events.slice(a, b)`        | `session.snapshotEvents(SessionLogOffset(a), SessionLogOffset(b))` |
| events this session appended itself | `session.ownEvents()`                                       |

The new API is read-on-demand (frozen snapshots, cached until the next append) instead of an eagerly materialized array.

**The crash mechanism**: the plugin's `channel.js` has **42 references to `.events` on session objects** (`fixture/plugin-source-excerpt.js`: `const events = liveAgent.session.events;` at line 734, `replayEvents(agent.session.events)` at line 6685, `session.events.at(-1)` at line 657, …). At alpha.5 the `events` property no longer exists, so every one of those reads evaluates to `undefined`. The plugin then *iterates* the value in `prepareReplayEvents` → `TypeError: events is not iterable` (`fixture/crash-stack.txt`, `channel.js:623:25`, during `createChannel` → plugin tree fails to load). This is the textbook runtime signature of a removed API consumed by untyped/loosely-typed plugin JavaScript: `undefined` flows silently through the property read and only explodes at the iteration site, deep inside plugin code, at startup.

## 2. Why npm installed without warnings

npm's peer-dependency check is **arithmetic on version strings in package metadata**, performed once at install time. The plugin declares `"@deepseek-ai/dsh-*": "^0.1.2-alpha.2"` for every peer. A caret on `0.1.2-alpha.2` desugars to the interval **`>=0.1.2-alpha.2 <0.2.0-0`**. Your installed `0.1.2-alpha.5` lies inside that interval — in semver prerelease ordering `0.1.2-alpha.2 < 0.1.2-alpha.4 < 0.1.2-alpha.5 < 0.1.2` — and because the comparator's prerelease shares the same `[0,1,2]` version tuple, npm's prerelease matching rule accepts it (the "peer-floor prerelease semantics" documented in skill reference R-08). Check passes, zero warnings, `added 77 packages`.

**What `^0.1.2-alpha.2` actually guarantees**: only that the *author declared* "I develop against the dsh `0.1.2-alpha` line with floor alpha.2" and that the resolved version *number* is not below that floor. It is a static statement of intent plus interval arithmetic — nothing more.

**What it does NOT guarantee**:

- **That the author ever ran or tested anything above alpha.2.** The floor records where development *started*, not what was verified.
- **That any specific API still exists at the resolved version.** Semver gives prerelease versions (and 0.x lines) **no stability guarantee whatsoever**: on an active alpha line, any prerelease bump may remove or change APIs. A caret range floored at alpha.2 spans alpha.3, alpha.4, alpha.5, … — i.e., it *by construction* crosses the alpha.4 removal of `Session.events` while remaining formally "satisfied".
- **Behavioral contracts**: default tool exposure, event payload shapes, wire-protocol validation, service activation order.
- npm performs the check against `package.json` fields only; the package manager has **no knowledge of which JS properties the plugin reads at runtime**.

In short: "`0.1.2-alpha.5 > 0.1.2-alpha.2`" is true and **completely irrelevant** to whether `Session.events` exists at alpha.5. Version ordering and API surface are orthogonal on a prerelease line.

## 3. The fundamental principle

| | Peer range satisfaction | Runtime compatibility |
|---|---|---|
| **Checks** | Does the version *number* requested by the consumer fall inside the *interval* declared by the plugin? | Does the API surface actually exported by the *executing host* (properties, signatures, types, services, defaults, protocols) match what the *executing plugin code* assumes on every path it exercises? |
| **Nature** | Static, package-metadata-level | Behavioral, code-level |
| **When/who** | Install time, by the package manager, against `package.json` | Only by typechecking against the target's real declarations (static but code-level) and by actually cold-starting/mounting the plugin on the target host |

npm validates **one integer interval**; the runtime exercises **thousands of concrete property reads**. The two can only be correlated by the author's testing — never inferred from version arithmetic.

**Categories of breakage that pass peer-range validation but crash/misbehave at runtime** (all with real dsh `0.1.2-alpha.4` examples from the skill cards):

1. **Removed/renamed APIs** — *this case*: `Session.events` removed at alpha.4; `session.events` reads `undefined`, iteration throws `TypeError`. (Card DSH-0.1.2-A4-03)
2. **Type/signature tightening with runtime enforcement** — `SessionSeq`/`SessionLogOffset` became branded numeric types whose constructors throw `TypeError` on plain/invalid numbers; `seedLength` → `isSeeded` + `inheritedEventCount`; the Remote `history` request's `atSeq` is now validated and rejected with `gateway/bad-request`. Peer metadata is unchanged; code still crashes or gets refused. (Cards DSH-0.1.2-A4-04 / A4-03)
3. **Package inventory removals/renames** — `@deepseek-ai/dsh-code-runtime-python` renamed to `…experimental…`; the `tool-subagent-report` package deleted outright. Peer/dependency declarations on the old names can resolve cleanly while imports or composition rows fail at load. (Cards A4-01/A4-02)
4. **Behavior/default changes with no API removal** — `web_fetch` enabled by default in the base bundle; the general `workflow` tool no longer published in the PTC preset. The plugin loads "successfully" and then misbehaves or violates deployment assumptions. (Cards A4-05/A4-06)

## 4. What the plugin author should have done

**To catch this before publishing:**

- **Typecheck against the actual target cohort, not the dev floor**: run `tsc --noEmit` with `@deepseek-ai/dsh-session` resolved at `0.1.2-alpha.4`. TypeScript fails with *"Property 'events' does not exist on type 'Session'"* (card A4-03 symptoms) — the break is statically detectable the moment the target declarations are real.
- **Cold-start a real host pinned to the target version and mount the plugin** (the runtime validation layer: boot an isolated profile with the cohort-pinned dsh, verify entry activation, run one core flow). A single boot surfaces `events is not iterable` immediately. CI mount lanes should pin the dsh version to the target cohort, exactly as the skill's release practice prescribes.
- **Read the corridor changelog from the peer floor to the newest release before every publish**, and grep the source for each symbol the changelog removed: `grep -rn '\.events' src/` → 42 hits on a symbol alpha.4 removed ⇒ stop and migrate before publishing.
- Treat **every alpha-line bump as potentially breaking**; prerelease ranges promise nothing.

**Peer range / engines vs runtime guard — who encodes what:**

- The **peer range should encode the verified interval, not the historical dev floor**. If the plugin was built and tested against alpha.3, declare exactly that cohort — an exact pin (`0.1.2-alpha.3`) or a tight upper-bounded interval (`>=0.1.2-alpha.2 <0.1.2-alpha.4`) — never an open caret across untested releases. (Ecosystem practice per R-08: rewrite the peer floor explicitly per cohort when bumping; publish alpha-cohort plugin builds under a prerelease dist-tag so `latest` never drags stable-host users into an untested cohort.) An `engines`-style host-version field, where the host honors one, should carry the exact tested host version for the same reason.
- **No static field can certify behavior** — that is what the runtime guard is for. The plugin should feature-detect at startup and fail with an actionable message, e.g.:

  ```js
  if (typeof session.snapshotEvents !== 'function' && !Array.isArray(session.events)) {
      throw new Error(
          'dsh-tui: this dsh version has no Session.events (removed in dsh 0.1.2-alpha.4); ' +
          'upgrade dsh-tui to an alpha.4-compatible release'
      );
  }
  ```

  — and, of course, migrate all 42 `.events` reads to `seq` / `eventAt()` / `snapshotEvents()` / `ownEvents()` (with `snapshotEvents()` results not cached across appends). Static metadata decides whether installation should proceed; feature detection decides whether startup degrades gracefully or explodes opaquely.

## 5. What you can do RIGHT NOW before installing

A concrete pre-install check (entirely read-only, nothing gets installed):

1. **Read the plugin's peer floor**: `npm view @deepseek-harness-tui/dsh-tui peerDependencies` → `^0.1.2-alpha.2`.
2. **Read your installed host version**: `npm ls -g @deepseek-ai/dsh` → `0.1.2-alpha.5`.
3. **Read the host changelog for every release between the floor and your version** (alpha.2 → alpha.5). The alpha.4 notes say: *"Replace `Session.events` with on-demand read APIs … Developers should pay attention to compatibility."* A removed API inside your interval is a red flag regardless of the peer check passing.
4. **Mechanically confirm the plugin still uses the removed API**: fetch the tarball without installing — `npm pack @deepseek-harness-tui/dsh-tui` — and `grep -rn '\.events' package/`. 42 hits on a symbol the changelog removed ⇒ do not install; the startup crash is guaranteed.

Rule of thumb to carry forward: **a peer range tells you where the plugin started, the changelog tells you what changed since, and only a cold boot tells you it works.** When the peer floor and your installed version are far apart on an alpha/0.x line, a silent peer check means nothing.

---

*Sources: fixture evidence pack (`/app/fixture/`: npm-install-output.txt, crash-stack.txt, plugin-source-excerpt.js, dsh-changelog-excerpt.md); plugin-upgrade skill references `references/v0.1.2-alpha.4.md` (cards DSH-0.1.2-A4-03, DSH-0.1.2-A4-04, corridor verification record) and `references/rollup-0.1.2.md` (R-08 peer-floor prerelease semantics). No files were modified outside `agent-output/`; the fixture directory is untouched.*
