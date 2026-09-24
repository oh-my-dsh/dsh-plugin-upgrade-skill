# S13 · Peer Range vs Runtime Reality — Report

## Evidence base

Read from the read-only fixture pack: npm-install-output.txt, crash-stack.txt, plugin-source-excerpt.js, dsh-changelog-excerpt.md.

## 1. The exact runtime incompatibility

**WHAT was removed:** the eagerly materialized `Session.events` array on the session object.

**WHEN:** dsh `v0.1.2-alpha.4`. The changelog entry reads:

> **Replace `Session.events` with on-demand read APIs**: `seq`, `eventAt()`, and `snapshotEvents()` — the eagerly materialized events array is removed to reduce memory overhead in long sessions. Developers should pay attention to compatibility. (@kermanx)

**What replaced it:** three on-demand read APIs — `seq`, `eventAt()`, and `snapshotEvents()`.

**Why the plugin crashes:** dsh-tui still reads `liveAgent.session.events` in 42 places (e.g. channel.js line 734 `const events = liveAgent.session.events`, line 657 `session.events.at(-1)`). On alpha.4/5 that property no longer exists, so `events` is `undefined`, and the plugin's `prepareReplayEvents` tries to iterate it, producing `TypeError: events is not iterable` inside the plugin's own `apply()` (crash-stack.txt: prepareReplayEvents → replayEvents → createChannel → apply → Fiber._reload). The plugin tree fails to load at startup.

## 2. Why npm installed without warnings

The plugin declares peerDependencies `^0.1.2-alpha.2` on every `@deepseek-ai/dsh-*` package. The installed dsh `0.1.2-alpha.5` satisfies `>=0.1.2-alpha.2 <0.2.0-0` in semver (alpha.5 sorts greater than alpha.2 as prerelease versions of the same 0.1.2 version), so npm's peer check passes silently. There is nothing to warn about — from npm's point of view everything is fine.

**What a peer range DOES guarantee:** only that the host package's *version string* falls inside a semver range — a static, package-metadata-level comparison against the version number in the host's package.json. It says "I claim to be compatible with these versions," not "I verified compatibility with these versions."

**What it does NOT guarantee:** any behavioral fact about the code the host actually ships. npm never loads the host's code, never checks that APIs the plugin calls still exist, and cannot know that alpha.4 removed `Session.events`. Note also that prerelease segments are compared as identifiers (alpha.5 > alpha.2), which says nothing about API stability across prereleases — that is exactly why the changelog marks the change "developers should pay attention to compatibility."

## 3. Peer-range satisfaction vs runtime compatibility

- **Peer-range satisfaction** checks: a static semver range against version *metadata*. It is a claim by the plugin author, validated only as string arithmetic.
- **Runtime compatibility** checks: whether the plugin's actual code paths work against the actual code the host version ships — behavioral, code-level reality.

At least two categories of breakage that pass peer-range validation but crash at runtime:

1. **Removed/renamed APIs** (this case): the host deletes or renames an export/property (`Session.events` → `seq`/`eventAt()`/`snapshotEvents()`) within the satisfied range; the plugin's call site now reads `undefined` and throws.
2. **Changed shapes/semantics of still-present APIs**: a function still exists but its return type changes (array → iterator/generator, synchronous → asynchronous, object → branded opaque type). `for (const e of session.events)` on a non-iterable new return value fails exactly like this case's "events is not iterable."
3. (Further examples) behavioral/contract changes: an event that no longer fires, a method that now throws on inputs it previously accepted, or timing changes — all invisible to version-string comparison.

## 4. What the plugin author should have done

**Before publishing:**
- Test against the actual target versions, not just the declared range floor: run the plugin's startup/e2e suite against every dsh prerelease in the intended range — at minimum alpha.2, alpha.3, alpha.4, alpha.5 — so an alpha.4 removal breaks CI before release. A matrix test against real host artifacts (per this repo's testing policy, built `lib/` or the declared launcher) catches exactly this.
- Track host changelogs marked "developers should pay attention to compatibility" and migrate proactively.

**Encoding compatibility for users:**
- The **peerDependencies range** can only encode version *floor and ceiling*; it should be narrowed to versions actually tested (e.g. pin to `~0.1.2-alpha.4`-style bounds or exclude known-broken prereleases) rather than a broad `^0.1.2-alpha.2`. `engines` encodes runtime requirements (Node version), not API compatibility, and cannot help here.
- Anything not expressible as a version range needs a **runtime feature-detection guard**: e.g. `if (session.events === undefined)` → fall back to the alpha.4+ API (`snapshotEvents()`, `eventAt()`, `seq`) or fail fast with a clear diagnostic ("this dsh-tui build supports dsh < 0.1.2-alpha.4; Session.events was removed in alpha.4") instead of `TypeError: events is not iterable`. A guard at plugin `apply()` time turns a cryptic stack trace into an actionable message.

## 5. What the user can do RIGHT NOW (pre-install check)

A concrete pre-install check: **grep the plugin's published source for the host APIs it touches, against the host version's actual exports.** For example, before installing:

```
# fetch the tarball without installing, then:
npm pack @deepseek-harness-tui/dsh-tui
tar -xzf dsh-tui-0.1.0-beta.4.tgz && grep -rn "\.events" package/dist/ | head
# and check the installed host actually still exposes it:
node -e "const s = require('@deepseek-ai/dsh-session'); console.log('events' in (s.prototype || s))"
```

42 references to `.events` on session objects, combined with the alpha.4 changelog entry "Replace `Session.events`...", immediately predicts the crash. More generally: read the host's changelog for entries between the peer-range floor (`alpha.2`) and your installed version (`alpha.5`) that are flagged as compatibility-relevant — any "removed/replaced" entry in that window is a red flag no peer-range check will surface. In this repo's terms, `@deepseek-ai/dsh-session` exposes on-demand `seq`/`eventAt()`/`snapshotEvents()` since alpha.4; an install-time smoke (`dsh --version && dsh -c "load plugins"` in a scratch profile) before adopting the plugin also catches load-time `apply()` failures like this one.

## Key takeaway

`^0.1.2-alpha.2` is satisfied by `0.1.2-alpha.5` because semver only compares version strings — it does not compare code. Peer-range satisfaction is a metadata claim; runtime compatibility is a behavioral fact. Prerelease ranges in particular carry no stability promise, which is why the alpha.4 changelog explicitly warns developers.
