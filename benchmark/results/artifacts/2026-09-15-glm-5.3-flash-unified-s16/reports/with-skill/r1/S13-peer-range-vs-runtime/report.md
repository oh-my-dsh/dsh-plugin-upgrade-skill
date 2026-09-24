# S13 · Peer Range vs Runtime Reality — Diagnosis Report

**Symptom**: `@deepseek-harness-tui/dsh-tui@0.1.0-beta.4` installed cleanly (no peer warnings) on `@deepseek-ai/dsh@0.1.2-alpha.5`, then crashes at startup with `TypeError: events is not iterable` inside the plugin's own code (`prepareReplayEvents`, `channel.js:623`), while reading the dsh session object.

**Verdict**: this is a *runtime API removal* that install-time peer validation cannot see. The plugin was written against the `0.1.2-alpha.2` session surface; dsh removed `Session.events` two prereleases later, at `0.1.2-alpha.4`. The version number arithmetic in the peer range still passes because `0.1.2-alpha.5` sits inside `^0.1.2-alpha.2` — but the API the plugin reads no longer exists.

---

## 1. The exact runtime incompatibility

**WHAT was removed**: the `Session.events` property — the eagerly materialized event-log array on dsh session objects. In untyped JavaScript at alpha.4/5, `session.events` evaluates to `undefined`; the plugin then tries to iterate it and throws.

**WHEN**: dsh **v0.1.2-alpha.4** (published 2026-09-01; corridor: alpha.3 → alpha.4, 297 commits).

**What replaced it**: on-demand read APIs instead of one materialized array (memory-overhead fix for long sessions). The full migration ledger:

| Old (`≤ alpha.3`) | New (`≥ alpha.4`) |
|---|---|
| `session.events` (whole log) | `session.snapshotEvents()` — frozen snapshot of the full log, cached until next append |
| `session.events.length` | `session.seq` (a `SessionLogOffset`) |
| `session.events[i]` | `session.eventAt(SessionSeq(i))` |
| `session.events.slice(a, b)` | `session.snapshotEvents(SessionLogOffset(a), SessionLogOffset(b))` |
| "events this session wrote itself" | `session.ownEvents()` |

**Changelog citation** (`fixture/dsh-changelog-excerpt.md`, "dsh-v0.1.2-alpha.4 release notes (excerpt)"):

> - **Replace `Session.events` with on-demand read APIs**: `seq`, `eventAt()`, and `snapshotEvents()` - the eagerly materialized events array is removed to reduce memory overhead in long sessions. Developers should pay attention to compatibility. (@kermanx)

This is card **DSH-0.1.2-A4-03** in the plugin-upgrade reference set (`skills/plugin-upgrade/references/v0.1.2-alpha.4.md`), which additionally documents `ownEvents()` and the branded-`SessionSeq` requirement of the new API. The companion card for alpha.5 (`v0.1.2-alpha.5.md`) confirms `@deepseek-ai/dsh-session` had **no source changes** on the alpha.4 → alpha.5 edge (version bumps only) — so `Session.events` is still gone on your alpha.5 host.

**Crash chain, mapped to evidence**:

1. Plugin source (`fixture/plugin-source-excerpt.js`): `const events = liveAgent.session.events;` (line 734), `replayEvents(agent.session.events)` (line 6685), plus 42 total `.events` reads on session objects — all now read `undefined`.
2. `undefined` is passed into `replayEvents` / `prepareReplayEvents`, which iterates it (`for…of` / spread).
3. `fixture/crash-stack.txt`: `TypeError: events is not iterable at prepareReplayEvents (channel.js:623:25)` → `replayEvents` → `createChannel` → the dsh plugin loader aborts with `failed to apply loader entry dsh-tui`.

Nothing is wrong with the install; the code touches a removed property.

## 2. Why npm installed without warnings — and what a peer range does and does not guarantee

**The mechanical answer**: npm's peer-dependency check is a *static comparison of version strings against declared ranges*, run by the resolver at install time. The plugin declares `^0.1.2-alpha.2` for every `@deepseek-ai/dsh-*` package. Under npm semver that expands to `>=0.1.2-alpha.2 <0.2.0-0`, and by npm's prerelease matching rule a prerelease version matches a comparator only when it shares the same `[major, minor, patch]` tuple and carries a prerelease — `0.1.2-alpha.5` shares the `[0,1,2]` tuple with the floor `0.1.2-alpha.2`, so it satisfies the range (this exact matching rule is documented in rollup card R-08, `skills/plugin-upgrade/references/rollup-0.1.2.md`). The resolver sees "inside the interval", stays silent, and never inspects a single export, type declaration, or behavior of the installed host.

**What `^0.1.2-alpha.2` actually guarantees** — almost nothing beyond arithmetic:

- That the resolved host version number sorts at or above `0.1.2-alpha.2` and below `0.2.0-0` by semver precedence.
- That the author *declared an intent* ("I developed against the alpha.2 cohort") — an intent, not a fact about other versions in the range.

**What it does NOT guarantee**:

- That the author ever *ran* the plugin against anything above alpha.2 — and it demonstrably did not: dsh shipped a **breaking change inside the caret range** (alpha.4, within `>=0.1.2-alpha.2 <0.2.0-0`).
- That any named API (`Session.events` included) still exists, has the same shape, or has the same semantics anywhere in the range. In a `0.x` prerelease line, everything may change at any prerelease bump; the caret's "compatibility" claim is only as honest and as current as the author who typed it.
- Anything about defaults and behavior (e.g. alpha.4 also enabled `web_fetch` by default in the base bundle — card DSH-0.1.2-A4-06), storage formats, or wire contracts.

The key inversion: the peer range is a claim the **plugin author** wrote *once*, at authoring time, against the cohort they knew. It is not a property npm verifies against reality. `alpha.5 > alpha.2` in semver ordering is true and completely irrelevant to whether `Session.events` exists — ordering compares version strings; existence is a property of the code at that tag.

## 3. The fundamental principle

- **Peer-range satisfaction** checks: *do the declared version ranges of the dependency metadata intersect with the resolved versions of the installed packages?* It is a **static, package-metadata-level** check, evaluated by the package manager at install time, over version strings only. It validates the *label*, never the *contents*.
- **Runtime compatibility** checks: *does the host, as actually booted at this exact version, still expose every API surface the plugin's code touches — with compatible signatures and semantics — and does the plugin actually load, register, and execute a real flow?* It is a **behavioral, code-level** reality that can only be established by running the real artifact against the real host (typecheck against the target cohort's declarations, then a cold boot and a functional pass).

**Categories of breakage that pass peer-range validation but crash or break at runtime** (this incident is category 1):

1. **Removed/renamed properties or methods on host objects** — this case: `Session.events` removed at alpha.4; untyped JS reads `undefined` and throws on first use (`events is not iterable`). TypeScript would have caught it ("Property 'events' does not exist on type 'Session'"); plain JavaScript cannot.
2. **Type-shape/contract changes invisible to metadata** — e.g. the same alpha.4 release branded `SessionSeq`/`SessionLogOffset` and replaced `seedLength` with `isSeeded` + `inheritedEventCount` (card DSH-0.1.2-A4-04): install stays green, runtime constructors throw `TypeError` on plain numbers and fork-seeding breaks.
3. **Removed packages or phantom references** — e.g. the `report` subagent tool package deleted at alpha.4 (A4-01), or a client `inject` referencing a removed package: the row silently never enters the graph and the plugin loads "successfully" while never registering (the troubleshooting table's "silently disappears, no error at all" family). The runtime-verification record (`rc-0.1.3-runtime-verification.md`) shows real plugins that `dsh plugin add` installs fine yet are `fail/not-listed` across three host generations.
4. **Wire/protocol and persistence-format drift** — e.g. the Remote `history` request's `atSeq` validation tightened at alpha.4 (requests now rejected), and session-store generation mismatches that refuse the boot (A5-03): all invisible to a version-range check.
5. **Silent default/behavior changes** — `web_fetch` on by default in the base bundle, `workflow` tool dropped from the PTC preset (A4-05/A4-06): no crash, but the plugin's assumptions about the environment no longer hold.

## 4. What the plugin author should have done

**To catch this before publishing (test against the actual target version):**

- **Typecheck against the target cohort's real declarations**: run `tsc --noEmit` with the plugin's imports resolving to `@deepseek-ai/dsh-*` at the exact target tag (e.g. alpha.4/alpha.5), not the floor version. This alone fails on `Property 'events' does not exist on type 'Session'` and blocks the release. The corridor practice keeps a "verify-only" CI lane that checks out the upstream tag and typechecks against it (rollup R-01's verification lane).
- **Cold-boot the built artifact against the pinned host before publishing**: a mount smoke in an isolated throwaway profile — `pnpm build && pnpm pack`, install the tarball into a scratch profile on the pinned CLI, start the host, and prove the entry actually registers and executes one real flow (the skill's layered-validation "runtime + behavior" layers; the `verify-runtime`-style isolated-profile cold boot demonstrated in `rc-0.1.3-runtime-verification.md`). A silent peer check would still pass; the boot would have failed exactly like the user's — before 26k downloads instead of after.
- **Re-verify on every cohort edge, not once**: whenever dsh publishes a new prerelease in the range, re-run the two steps above; grep the plugin source against that edge's breaking-change cards (here, one `grep -rn 'session\.events\|\.events\b' src/` against the A4-03 ledger would have found all 42 hits).

**To help users (what to encode statically vs. guard at runtime):**

- **Peer range / engines field should encode the *verified* cohort — i.e., what you actually tested, kept current.** After migrating to the new read APIs, rewrite the floor to `^0.1.2-alpha.4` so install-time validation excludes hosts the plugin genuinely cannot run on, and so alpha.2/alpha.3-era users get a visible warning instead of a crash. On fast-moving `0.x` prerelease surfaces, consider pinning the exact tested cohort (the version cards' own advice for experimental packages) rather than a wide caret. An `engines`-style declaration can carry a host-version floor, but npm does not enforce nonstandard `engines` by default — the peer range is the mechanism users actually see.
- **The static range can never encode "this field still exists" — so code touching unstable surfaces needs a runtime feature-detection guard.** Where the plugin reads the session log, branch on capability, not on version:

  ```js
  if (typeof session.snapshotEvents === 'function') {
      events = session.snapshotEvents();          // alpha.4+ on-demand read API
  } else if (Array.isArray(session.events)) {
      events = session.events;                    // legacy surface (≤ alpha.3)
  } else {
      throw new Error(
        'dsh-tui requires a dsh host with Session.snapshotEvents() ' +
        '(>= 0.1.2-alpha.4) or Session.events (<= 0.1.2-alpha.3); ' +
        'found neither — check the host version.');
  }
  ```

  That converts an opaque `events is not iterable` at loader-apply time into a precise, actionable message (or a working dual-surface plugin), and the mixed peer range becomes honest: support both ends of the range in code, or narrow the range to the tested end.

## 5. What you can do RIGHT NOW, before installing (concrete pre-install check)

Treat "install succeeded with no warnings" as proving nothing, and spend two minutes on this before any community plugin install:

1. **Compare the plugin's cohort floor against the host changelog between that floor and your version.** `npm view @deepseek-harness-tui/dsh-tui@0.1.0-beta.4 peerDependencies` shows `^0.1.2-alpha.2`; then scan the dsh release notes for `0.1.2-alpha.3 → alpha.4 → alpha.5` (the span the range silently spans). Alpha.4's notes literally say "Developers should pay attention to compatibility" for `Session.events`. A plugin whose floor predates a documented breaking change inside its own range is suspect until proven otherwise.
2. **Grep the plugin's published code for the removed API before installing** (read-only, no host changes): fetch the tarball npm would install and scan it —
   ```bash
   npm view @deepseek-harness-tui/dsh-tui@0.1.0-beta.4 dist.tarball
   curl -sL <tarball-url> | tar -xzO --wildcards 'package/dist/*' | grep -c 'session\.events\|\.events\b'
   ```
   (or `npm pack --dry-run` + inspect). Any hit on a symbol your host's changelog removed is a predicted crash — this check would have flagged dsh-tui's 42 `.events` reads against alpha.4's removal before you ever ran it.
3. **If you proceed anyway, install and first-run in a disposable scratch profile / isolated boot**, never your daily host, and confirm the plugin actually registers and completes one real flow — a successful install is not enablement, and a silent loader failure (or a crash like this one) is the expected failure mode this class of issue produces.

---

### One-line summary

`^0.1.2-alpha.2` promised the version number, not the API: dsh v0.1.2-alpha.4 removed `Session.events` (replaced by `seq` / `eventAt()` / `snapshotEvents()` / `ownEvents()`), dsh-tui@0.1.0-beta.4 still reads `.events` 42 times, npm's static range check cannot see that, and only runtime verification — typecheck against the target tag plus a real cold boot — or a runtime feature-detection guard can catch this class of breakage.

*Sources: `fixture/dsh-changelog-excerpt.md`, `fixture/crash-stack.txt`, `fixture/plugin-source-excerpt.js`, `fixture/npm-install-output.txt`; workspace skill references `v0.1.2-alpha.4.md` (cards DSH-0.1.2-A4-03/A4-04/A4-06), `v0.1.2-alpha.5.md` (A5 cards, session API unchanged alpha.4→alpha.5), `rollup-0.1.2.md` (R-08 peer-floor prerelease semantics, verification lanes), `rc-0.1.3-runtime-verification.md`, `troubleshooting.md`, `SKILL.md` (layered validation; "successful dependency installation does not mean DSH has enabled the plugin").*
