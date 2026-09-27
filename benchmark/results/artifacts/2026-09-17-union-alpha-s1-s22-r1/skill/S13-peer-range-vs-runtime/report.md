# S13 · Peer Range vs Runtime Reality — Inspection Report (Mode A · read-only)

Methodology: plugin-upgrade skill, Mode A (read-only inspection). No file, dependency, or version changes were made anywhere; the fixture at E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S13-peer-range-vs-runtime/environment/fixture was left untouched. Evidence used: the four fixture files (npm-install-output.txt, crash-stack.txt, plugin-source-excerpt.js, dsh-changelog-excerpt.md) and the skill's version card DSH-0.1.2-A4-03 in skills/plugin-upgrade/references/v0.1.2-alpha.4.md plus its troubleshooting lookup table. Baseline run: not collected (Mode A; no migration was performed).

## 1. The exact runtime incompatibility

**What was removed:** the eagerly materialized `Session.events` array — the session object's `events` getter no longer exists.

**When:** dsh `v0.1.2-alpha.4` (the alpha.3 → alpha.4 edge, ~297 commits, released ~2026-09-01). The user's host is `0.1.2-alpha.5`, i.e. *after* the removal; the plugin was written against the `alpha.2` cohort, where the events array still existed.

**What replaced it (per the alpha.4 release notes, changelog entry "Replace `Session.events` with on-demand read APIs"):** on-demand read APIs instead of one eagerly materialized array — `session.seq` (current log length, a `SessionLogOffset`), `session.eventAt(seq)` (one accepted, deeply frozen event), `session.snapshotEvents(fromSeq?, toSeqExclusive?)` (frozen snapshot of a half-open range), and `session.ownEvents()` (events the session appended itself, excluding the fork-inherited prefix). A companion card in the same release also brands `SessionSeq` / `SessionLogOffset` as strong types and replaces `seedLength` with `isSeeded` + `inheritedEventCount`.

**The crash, mapped to the plugin code:** the dsh-tui plugin's channel.js reads `liveAgent.session.events` / `agent.session.events` (42 references). At alpha.5 the property is `undefined`, and the first place the plugin tries to *iterate* it — `prepareReplayEvents` doing `for ... of events` (the stack's "events is not iterable" in `replayEvents → createChannel → apply`) — throws `TypeError: events is not iterable`, failing the loader entry so the whole plugin tree fails to load.

**Old → new migration ledger** (card DSH-0.1.2-A4-03):

| old | new |
|---|---|
| `session.events.length` | `session.seq` |
| `session.events[i]` | `session.eventAt(SessionSeq(i))` |
| `session.events` (whole log) | `session.snapshotEvents()` |
| `session.events.slice(a, b)` | `session.snapshotEvents(SessionLogOffset(a), SessionLogOffset(b))` |
| "events this session wrote, not the fork parent" | `session.ownEvents()` |

Also per the card: do not cache the array returned by `snapshotEvents()` across appends when live data is needed — re-read `seq` and call again. On the Remote face, `history`'s `atSeq` is now validated as a non-negative safe integer (rejected with `gateway/bad-request` otherwise).

## 2. Why npm installed with zero peer warnings

npm's peer-dependency check is a **pure metadata comparison**: it takes the version *ranges* the plugin declares in its package.json and the *installed versions* of the matching packages, and asks whether the installed version belongs to the declared range. Here every peer range is `^0.1.2-alpha.2` (i.e. `>=0.1.2-alpha.2 <0.2.0-0` under npm prerelease rules for this cohort), the installed dsh sub-packages are all `0.1.2-alpha.5`, and `0.1.2-alpha.5` sorts above `0.1.2-alpha.2` and below `0.2.0` — so the check passes, silently.

What a peer range guarantees: **only** the version *number* of each peer package at install time.

What it does **not** guarantee:
- That any exported symbol, class, getter, or method the plugin touches still *exists* in that version. Ranges express release-line intent, not an API inventory. `^0.1.2-alpha.2` advertises compatibility with *every* future 0.1.2 prerelease — including alpha.4/alpha.5, which removed an API the alpha.2-era code depends on.
- That the plugin's *runtime behavior* against those peers works — no call site is ever executed by the dependency resolver.
- Anything about intra-monorepo consistency: within a single dsh release the sub-packages move in lockstep, but a caret prerelease range cannot express "the exact dsh cohort I tested against".
- That removal-only breaking changes inside the same semver range are excluded. Removing `Session.events` in alpha.4 did **not** require bumping dsh's major (or even minor) version under the project's own prerelease-versioning policy, so the old range still *covers* the versions that broke it.

In short: peer satisfaction is "the numbers fit"; runtime compatibility is "the code fits". The plugin declared a range covering versions it had never tested against, and npm's resolver has no way to know that.

## 3. The fundamental principle

- **Peer-range satisfaction checks:** static, package-metadata-level facts — the declared range strings vs. the installed version strings, per package, at resolution time. It knows nothing about exports, call sites, or behavior.
- **Runtime compatibility checks:** behavioral, code-level reality — do the symbols the plugin actually dereferences exist with compatible shapes/signatures on the objects the host actually hands it, in the actual target host version, when the code actually runs.

Two-plus categories of breakage that pass peer-range validation but crash (or misbehave) at runtime:
1. **Removed API / removed property (this case):** `Session.events` deleted at alpha.4 — the plugin reads `undefined` and throws on first use. TypeScript would have caught it ("Property 'events' does not exist on type 'Session'"), but this plugin is untyped JS, so the error only surfaces when the iterator fails.
2. **Changed signatures / types:** the same release turned `SessionSeq`/`SessionLogOffset` into branded constructor types and replaced `seedLength` with `isSeeded` + `inheritedEventCount` (card DSH-0.1.2-A4-04) — code passing a plain `number` or reading `seedLength` keeps passing the peer check yet breaks or mis-constructs sessions at runtime.
3. **Moved/renamed packages (same class of static metadata masking runtime absence):** the identical alpha.4 release also deleted the `tool-subagent-report` package (replaced by `send_message`, card DSH-0.1.2-A4-01) and renamed the Python runtime package (card DSH-0.1.2-A4-02) — a range over the old name still "resolves" semantically, but the row/package simply stops existing at boot.
4. **Behavioral/contract drift with no type-visible removal:** e.g. the `ptc` preset dropping the general `workflow` tool (A4-05) or base-bundle `web_fetch` becoming default-on (A4-06) — no peer check and no type error flags a plugin whose logic assumed the old default.

## 4. What the plugin author should have done

**Catch it before publishing:**
- Run the mechanical suite (build / typecheck / tests) **against the actual target host version's packages**, not the author's dev cohort — i.e. set the dsh dependency cohort in package.json/lockfile to the exact target release (`0.1.2-alpha.4` at the time) and let typecheck run. The card's own verification step for A4-03 is precisely "`tsc --noEmit` of the plugin against `@deepseek-ai/dsh-session` at dsh-v0.1.2-alpha.4 passes with no `events` access". A typecheck against the target immediately names the removed property; shipping untyped JS removes even that last static net.
- Do a real cold-start: boot a real dsh profile of the target version and verify the plugin's entry activates with no pending services, then exercise one core path (for a TUI channel: one message → transcript replay → render flow). The skill's runtime validation layer exists exactly to catch "install success ≠ enablement ≠ working behavior".
- Read the target release's changelog / version cards before declaring compatibility; `Session.events` removal was a headline breaking change with a published migration ledger.
- Track the corridor, not a point: when a caret prerelease range spans multiple published edges (alpha.2 … alpha.5), the author either re-verifies per edge or narrows what the range claims.

**Help users — peer range / engines vs. feature detection:**
- The peer range should encode what the author *actually verified*: either the exact tested cohort (`0.1.2-alpha.2` pin, or a range ceiling such as `>=0.1.2-alpha.2 <0.1.2-alpha.4` / disallowing prereleases beyond the tested edge) — never a blind `^0.1.2-alpha.2` that claims forward compatibility with untested releases. Note npm prerelease-range semantics: a caret on a prerelease admits later prereleases of the same 0.1.2 line, which is exactly the trap here.
- Use `engines` (or the dsh host-compat field, e.g. `dsh-plugin.json`'s host compatibility convention) to declare the verified dsh host version corridor — `engines` is checked against the *host program* version, which is what actually contains the session implementation; peers alone pin sub-package versions the host may or may not honor.
- What metadata can never express — the shape of the objects handed over at runtime — must be guarded in code: a **feature-detection guard** at startup, e.g. `if (typeof session.snapshotEvents !== 'function') { disable replay / throw a clear "requires dsh >= 0.1.2-alpha.4 (or <= alpha.3) " error }` — plus, ideally, switch on `typeof session.events` to support both cohorts, or read through the new API with a fallback. A loud, attributed failure ("incompatible host version X, need Y") beats a bare "events is not iterable" deep inside cordis apply.

## 5. What the user can do right now (pre-install check)

A concrete check, in under a minute, before installing any third-party plugin onto a prerelease host:

1. **Diff the version corridor, then read the changelog for the gap:** the plugin declares peers `^0.1.2-alpha.2` — its authors verified at most the alpha.2 cohort. Your host is alpha.5. Before installing, read the release notes / version cards for alpha.3 → alpha.4 → alpha.5 and look for "breaking" entries touching the APIs the plugin uses (for dsh-tui: the session read surface). The alpha.4 notes state in one line: "**Replace `Session.events` with on-demand read APIs** … developers should pay attention to compatibility." That single line, found before install, predicts this exact crash.
2. In practice: check the plugin's repo/README for a stated "tested against dsh X.Y.Z" and compare it to your host; if the plugin's newest tested cohort is older than a release whose notes contain breaking changes in the plugin's touchpoint area (events, agent/session APIs), either upgrade the plugin first, or pin your host to the plugin's tested cohort, or expect breakage.
3. Optional deeper pre-flight: after installing into a scratch profile, cold-start it read-only and check the boot output for loader-entry failures before adopting the plugin in your real profile — "added 77 packages in 2m" tells you nothing about runtime activation.

## Completed

- Diagnosis from all four fixture files + card DSH-0.1.2-A4-03 / DSH-0.1.2-A4-04 (references/v0.1.2-alpha.4.md) + troubleshooting.md lookup; report answers all five requested points.

## Skipped

- No baseline run, no build/typecheck, no runtime boot: read-only Mode A, fixture must remain unchanged. All conclusions are derived from the static evidence pack plus the published version card whose contents directly match the fixture's changelog excerpt.

## Pending / residual risk

- The fixture is a static excerpt; the full 42 call sites of `.events` in the real plugin could not be enumerated, so the exact rewrite scope for the author is "all of channel.js lines ~657–3004+" per the excerpt's note.
- The changelog excerpt shown in the fixture matches card DSH-0.1.2-A4-03 verbatim; no conflicting primary source was found, so no divergence needed recording.

## Rollback

- Nothing to roll back: no file, dependency, or configuration path was touched (Mode A).

## Recommendations

- For the user: prefer plugins whose manifest states a tested dsh cohort; when none exists, treat prerelease-host upgrades as plugin-breaking until verified.
- For the plugin author: adopt typed dsh peers so `tsc --noEmit` against the target cohort is a publish gate; add the runtime feature-detection guard described in §4.
