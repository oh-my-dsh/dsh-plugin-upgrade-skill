# S13 · Peer Range vs Runtime Reality — Diagnosis

**Case:** `@deepseek-harness-tui/dsh-tui@0.1.0-beta.4` installs cleanly on dsh `0.1.2-alpha.5`
(no peer warnings) but crashes at startup. **Read-only diagnosis; nothing executed, installed, or modified.**

**One-line verdict:** The plugin's `peerDependencies` range `^0.1.2-alpha.2` was *satisfied* by
`0.1.2-alpha.5` — a **static, package-metadata version-number check** — while the plugin's actual code
calls `Session.events`, an API dsh **removed at runtime in `0.1.2-alpha.4`**, a release that sits
*inside* that same caret range. Range satisfaction and runtime compatibility are two different checks;
only the second one loads code, and only the second one was broken.

---

## 1. The exact runtime incompatibility

- **API removed:** `Session.events` — the eagerly materialized, directly indexable/spreadable events
  array getter on the Session object (`session.events`, `session.events.length`, `session.events[i]`,
  `session.events.at(-1)`).
- **When:** dsh **`v0.1.2-alpha.4`**. Change card **DSH-0.1.2-A4-03** ("`Session.events` is removed; read
  the log through `seq` / `eventAt()` / `snapshotEvents()` / `ownEvents()`"), type **breaking**.
- **Changelog citation** (`fixture/dsh-changelog-excerpt.md:5-8`, alpha.4 release notes):
  > "**Replace `Session.events` with on-demand read APIs**: `seq`, `eventAt()`, and
  > `snapshotEvents()` — the eagerly materialized events array is removed to reduce memory overhead
  > in long sessions. Developers should pay attention to compatibility. (@kermanx)"

- **What replaced it** (on-demand, read-once reads instead of a live array):
  | old (removed) | new (alpha.4+) |
  |---|---|
  | `session.events.length` | `session.seq` (current log length, a `SessionLogOffset`) |
  | `session.events[i]` | `session.eventAt(SessionSeq(i))` (one accepted, deeply-frozen event) |
  | `session.events` (whole log) | `session.snapshotEvents(fromSeq?, toSeqExclusive?)` (frozen range snapshot, cached until next append) |
  | `session.events.slice(a,b)` | `session.snapshotEvents(SessionLogOffset(a), SessionLogOffset(b))` |
  | "events this session appended itself" | `session.ownEvents()` |

  A companion breaking card on the same edge, **DSH-0.1.2-A4-04**, also branded `SessionSeq` /
  `SessionLogOffset` as validated numbers and replaced `seedLength` with `isSeeded` +
  `inheritedEventCount` — the same corridor the plugin was blind to.

- **How the crash maps to the removal** (`fixture/crash-stack.txt`, `fixture/plugin-source-excerpt.js`):
  - `plugin-source-excerpt.js:6` reads `const events = liveAgent.session.events;` and `:8` calls
    `replayEvents(agent.session.events)`. At alpha.4+ the `events` getter is gone, so both read
    `undefined`.
  - `crash-stack.txt:5-9`: `TypeError: events is not iterable at prepareReplayEvents (channel.js:623) →
    replayEvents (channel.js:6127) → createChannel (channel.js:6685)`, surfacing as
    "plugin tree failed to load … events is not iterable."
  - This is verbatim the A4-03 symptom for an **untyped** plugin: *"untyped JavaScript reads `undefined`
    and then throws on `.length` / index access."* The excerpt notes **42 references to `.events`** on
    session objects — the breakage is systemic, not a one-liner.
  - **Why no earlier gate caught it:** this is plain **JavaScript** (no type surface). A TypeScript
    plugin would have failed at compile time — *"Property 'events' does not exist on type 'Session'"*
    (A4-03). With no `tsc` in the path, the missing member is invisible until the code runs.

---

## 2. Why npm installed with no warnings

The plugin declares `"@deepseek-ai/dsh-session": "^0.1.2-alpha.2"` (and the same floor for 24+ more
`@deepseek-ai/dsh-*` packages) — `fixture/npm-install-output.txt:9-15`. The installed
`@deepseek-ai/dsh@0.1.2-alpha.5` bundles those packages at `0.1.2-alpha.5`.

**What a peer range `^0.1.2-alpha.2` actually guarantees:**
- That a version **whose number falls inside the range** is present in the tree. Mechanically it expands
  to roughly `>=0.1.2-alpha.2 <0.2.0-0`; because the floor is a **prerelease**, npm's semver only
  admits the *same* `major.minor.patch` (`0.1.2`) prereleases from the floor up — i.e. exactly
  `0.1.2-alpha.2, -alpha.3, -alpha.4, -alpha.5, …`. `0.1.2-alpha.5 > 0.1.2-alpha.2` in semver ordering
  and shares the `0.1.2` tuple, so it matches. The fixture states this plainly: *"satisfies
  `>=0.1.2-alpha.2 <0.2.0-0` in semver. npm's peer check passes silently."*
- It is a **resolution-time, version-string containment test** performed by the package manager. It never
  loads, links, or executes the plugin against the host, so it cannot see whether any symbol the plugin
  touches still exists.

**What it does NOT guarantee:**
- That the **APIs the plugin actually calls** still exist, keep their names, or keep their shape at the
  resolved version. The caret encodes a *human promise* of backward compatibility across `<0.2.0`; dsh
  broke that promise by shipping a **breaking removal (`Session.events`) at alpha.4 while staying inside
  `0.1.2`**. `alpha.4` is inside `^0.1.2-alpha.2`, so the range admitted the very release that deleted
  the API. "Newer inside the range" ≠ "still compatible."
- Peer checks say nothing about behavior, service composition, or packaging gaps (see §3). npm printed no
  warning because, from its vantage point, nothing was wrong: the constraint was met.

> Core asymmetry: **the peer range is a claim about version numbers; runtime compatibility is a fact about
> code.** dsh kept the numbers inside one caret band while changing the code out from under it.

---

## 3. The fundamental principle

- **"Peer range satisfaction" checks a static, package-metadata property:** *is there an installed version
  whose version number lies in the declared numeric range?* Resolved once, before any code runs, by string
  comparison. It can only be as honest as the range author's guess about which versions are compatible.
- **"Runtime compatibility" checks a behavioral, code-level reality:** *does the code the plugin executes —
  exported functions, object shapes, member names, service injects, event names, wire contracts — actually
  exist and behave as the plugin expects in the version that is actually loaded and running?* Only observable
  by loading/booting the plugin. It is the ground truth; the range is a proxy for it.

**Categories that pass peer-range validation yet crash (or misbehave) at runtime** — this case is #1, and
the skill's corridor cards supply the rest:

1. **Removed / renamed API surface within the range.** The called symbol is deleted or renamed while the
   version stays in-band. *Here:* `Session.events` removed at alpha.4 (A4-03). Siblings: the `report`
   subagent-tool **package** removed (A4-01), `dsh-code-runtime-python` → `dsh-experimental-code-runtime-python`
   rename (A4-02), the `settingsNamespace` runtime export dropped (A2-10).
2. **Changed shape / semantics of a still-present API.** The member still resolves but its type or contract
   moved: branded `SessionSeq`/`SessionLogOffset` and `seedLength`→`isSeeded`+`inheritedEventCount`
   (A4-04); `RemoteResult.error` becoming a `RemoteError` with namespaced codes (A2-02); keyed chat-snapshot
   reshape (API-10). Resolves fine, behaves wrong.
3. **Service/composition injects that go `pending` at boot.** Package present and peer satisfied, but a
   required Cordis service is no longer provided (or a new required inject is missing) — the entry stalls at
   `pending (waiting for service: …)` instead of activating (A2-08 `sessionProjections`).
4. **Dependency-resolution gaps that aren't declared peers.** `legacy-peer-deps` skipping a real peer,
   `optionalDependencies` imported unconditionally, or `devDependencies` not shipped to consumers — static
   install and typecheck pass, cold boot throws `ERR_MODULE_NOT_FOUND` (A2-03 field notes). The skill's own
   warning: *"a missing peer shows up not as a typecheck error but as a runtime pending"* and *"the
   verification checklist should include a dependency-tree cold boot, not just successful installation."*

---

## 4. What the plugin author should have done

**To catch it before publishing (test against the actual target, not the floor):**
- The breakage sits **between the floor (alpha.2) and the newest in-range version (alpha.5)** — at alpha.4.
  If you claim to support a range, you must test its **edges and everything in between**, not just the floor
  you happened to develop against. Developing against `0.1.2-alpha.2` proves nothing about `alpha.5`.
- Run the skill's validation chain against the **specific cohort you support**, and — because this is an
  **untyped JS** plugin where `tsc` cannot see the missing member — include a **real-profile cold boot /
  activation probe**. That is exactly what `skills/plugin-upgrade/scripts/verify-runtime.mjs` does: install
  into an isolated throwaway `DSH_HOME`, point the model at a dead endpoint, and cold-boot; a broken plugin
  fails activation in ~1s and the failure is attributed (here: **plugin-code**). A4-03's own verification
  step is "a runtime read of a live session through the new API." Keep the dsh cohort exact and coherent in
  `package.json` + lockfile — *"a successful install with mixed old/new peers is not a migration"* (SKILL §Mode C).

**To help users (what metadata encodes vs. what needs a runtime guard):**
- **peer range / `engines` should encode the real floor you depend on.** If the plugin needs the on-demand
  API, the floor is **`^0.1.2-alpha.4`** (or `>=0.1.2-alpha.4`), **not** `^0.1.2-alpha.2`. Declaring the
  true minimum turns the silent break into an install-time peer error. `engines` can additionally gate the
  Node version. But be honest about the limit: a floor catches "too old," it **cannot** express "and not a
  later in-range version that removes something else" — so the range is a *necessary but not sufficient*
  signal. (Upstream later made this concrete: from 0.1.7-rc.1 DSH **enforces** peer ranges at install *and*
  startup with exact-version exemptions — precisely because advisory caret ranges under-promise.)
- **Anything that varies *within* the supported range needs a runtime feature-detection guard**, because no
  static field can carry it. Since the on-demand API is **additive** at alpha.4 while `.events` was
  **removed**, a plugin supporting both cohorts should detect and branch, e.g.:
  ```js
  const read = (s) => typeof s.snapshotEvents === 'function'
    ? s.snapshotEvents()                 // alpha.4+
    : Array.isArray(s.events) ? s.events : []   // legacy floor, only if still present
  ```
  Never reach through a member you have not confirmed exists — especially across a prerelease corridor where
  the caret admits breaking alphas.

---

## 5. What the user can do RIGHT NOW, before installing

Do not treat a silent `npm install` as a green light. Two concrete pre-install checks, cheap → strong:

- **(a) Static corridor check (seconds):** read the plugin's declared peer floor, then check the dsh
  changelog for the corridor *from that floor to your installed version* for breaking changes to the APIs
  the plugin uses. Concretely: `npm view @deepseek-harness-tui/dsh-tui peerDependencies` shows the floor
  `^0.1.2-alpha.2`; `npm pack` the tarball (or read its repo) **without a global install** and run the
  skill's pre-flight touchpoint scan (class **#2 events** / **#3 services**) — a plain
  `grep -n "\.events\b" ` over the packed source would have flagged **42 hits** here, and a cross-check
  against the alpha.4 "removed `Session.events`" card names the exact break. This is the skill's rule that
  *zero install output is not evidence of compatibility*.
- **(b) Behavioral isolated cold-boot probe (strongest, ~1 min):** install the plugin into a **throwaway
  isolated `DSH_HOME` profile and cold-boot it before adopting it globally** —
  `node skills/plugin-upgrade/scripts/verify-runtime.mjs @deepseek-harness-tui/dsh-tui` (isolated profile,
  dead model endpoint; a broken plugin fails activation in ~1s and the verdict attributes the failure to
  plugin-code / dependency-resolution / profile-config / dsh-runtime). Your real global install and
  `$DSH_HOME` are never touched. This is the direct answer to "npm succeeded — is it actually usable?": the
  `events is not iterable` activation failure surfaces immediately, exactly as the skill's dependency-tree
  cold-boot discipline intends.

The general habit: **version-range satisfaction is a promise; a cold boot is the proof.** For a
prerelease/alpha host, always take the proof before you rely on the plugin.

---

## Evidence index (all read-only, from `fixture/`)

| Claim | Source |
|---|---|
| No peer warnings; floor `^0.1.2-alpha.2`; alpha.5 in `>=0.1.2-alpha.2 <0.2.0-0` | `fixture/npm-install-output.txt:3-15` |
| Crash: `events is not iterable` at `prepareReplayEvents`/`replayEvents`/`createChannel` | `fixture/crash-stack.txt:4-13` |
| Plugin reads `liveAgent.session.events` / `replayEvents(agent.session.events)`; 42 `.events` refs | `fixture/plugin-source-excerpt.js:6-13` |
| Removal of `Session.events` at alpha.4 → `seq`/`eventAt()`/`snapshotEvents()` | `fixture/dsh-changelog-excerpt.md:5-8` |
| Full breaking card DSH-0.1.2-A4-03 (+ A4-04 branded seq types) | skill `references/v0.1.2-alpha.4.md:68-84` |
| Untyped-JS symptom; field plugins unaffected; A2-03/A2-08 cold-boot + pending-service lessons | `references/v0.1.2-alpha.4.md:85`, `references/v0.1.2-alpha.2.md` (A2-03/A2-08) |
| Runtime cold-boot verification method / attribution | skill `scripts/verify-runtime.mjs`; `SKILL.md` §Mode C step 4; `references/pre-flight.md` (#2/#3) |
| Later upstream **enforcement** of peer ranges at install + startup | `SKILL.md` corridor index rows for `references/v0.1.7-rc.1.md`, `references/jump-0.1.5-rc.2-to-0.1.7-rc.1.md` |

**Note on what this confirms in the skill:** the alpha.4 corridor card marked A4-03's migration ledger as
*source-derived, not field-hit* ("none of the … plugins read `Session.events` directly"). `dsh-tui` is the
real-world field hit for that card — a JS plugin that passes install, has no type gate, and dies at
activation reading the removed array.
