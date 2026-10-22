# S13 · Peer Range vs Runtime Reality — Report

Scenario: `@deepseek-harness-tui/dsh-tui@0.1.0-beta.4` installed cleanly (no peer warnings) against
`@deepseek-ai/dsh@0.1.2-alpha.5`, then crashed at startup. Evidence pack: `fixture/`
(`npm-install-output.txt`, `crash-stack.txt`, `plugin-source-excerpt.js`, `dsh-changelog-excerpt.md`).

## 1. The exact runtime incompatibility

**WHAT was removed:** the eagerly materialized **`Session.events` array** (the session object's
`events` property). The plugin reads it in 42 places — `liveAgent.session.events` (channel.js:734),
`replayEvents(agent.session.events)` (channel.js:6685), `session.events.at(-1)` (channel.js:657),
etc. (fixture: `plugin-source-excerpt.js`). At alpha.5 that property no longer exists, so
`session.events` evaluates to `undefined`; it is handed to `replayEvents` → `prepareReplayEvents`,
which iterates it and throws `TypeError: events is not iterable` (fixture: `crash-stack.txt`,
frame `prepareReplayEvents (channel.js:623:25)`).

**WHEN:** release **dsh-v0.1.2-alpha.4** — i.e. the break landed *inside* the plugin's own declared
peer range, one prerelease before the user's alpha.5.

**WHAT REPLACED IT:** on-demand read APIs **`seq`, `eventAt()`, `snapshotEvents()`**.
Changelog citation (fixture: `dsh-changelog-excerpt.md`, section "Other Changes",
entry *"Replace `Session.events` with on-demand read APIs"* — `dsh-v0.1.2-alpha.4`, @kermanx):
"the eagerly materialized events array is removed to reduce memory overhead in long sessions.
Developers should pay attention to compatibility."

**Second, subtler hazard in the same release:** the entry *"Distinguish `SessionSeq` and
`SessionLogOffset` with strong types"* (@tianyicui) — another flagged compatibility change that can
break code even where the API name survives.

## 2. Why npm install produced no warnings

**What a peer range actually is:** `^0.1.2-alpha.2` is a pure *version-string* constraint. For a
0.1.x prerelease it expands to `>=0.1.2-alpha.2 <0.2.0-0`. Since `0.1.2-alpha.5` sorts inside that
interval (prerelease identifier `alpha.5` > `alpha.2`), npm's peer check passes silently
(fixture: `npm-install-output.txt` — "npm's peer check passes silently"; all 26 `@deepseek-ai/dsh-*`
peers declare `^0.1.2-alpha.2` and are bundled at 0.1.2-alpha.5).

**What it guarantees:** only that the *resolved version string* falls within the declared interval,
i.e. dependency-graph consistency at metadata level.

**What it does NOT guarantee:**
- that any API the plugin calls still exists (`Session.events` is gone at alpha.4/5);
- unchanged behavior/semantics behind an unchanged name (the `SessionSeq`/`SessionLogOffset` split);
- type/contract shape (sync vs async, array vs iterator vs `undefined`, iteration protocol);
- that the author ever tested against anything but the floor version;
- any stability promise for prerelease tags — `^` on 0.1.x only excludes `0.2.0`, so alpha.2 → alpha.5
  may contain arbitrary breaking changes and still "satisfy" the range.

Bottom line: npm compares **numbers**; the crash comes from **code**. A peer range cannot express
"provides `Session.events`".

## 3. The fundamental principle

| Check | Level | Question answered |
|---|---|---|
| **Peer range satisfaction** | static, package-metadata | "Is the installed version string inside the declared semver range?" (dependency-graph consistency) |
| **Runtime compatibility** | behavioral, code-level | "When the plugin's code actually executes against this dsh build, do the referenced APIs exist and behave as assumed?" (API-surface + semantics) |

`alpha.5 > alpha.2` in semver ordering says **nothing** about `Session.events` still existing.

**Categories of breakage that pass peer-range validation but crash at runtime** (at least two):
1. **API removal / rename** — a symbol vanishes inside the declared range. *This case:* `Session.events`
   removed at alpha.4 while the peer range spans alpha.2…0.2.0-0.
2. **Semantic / behavioral change with the same signature** — same call sites still resolve, different
   results. *This case:* `SessionSeq` vs `SessionLogOffset` becoming distinct strong types at alpha.4 —
   offsets and sequence numbers that were interchangeable now diverge (wrong replay windows, throws).
3. **Contract / shape change** — return-type or protocol changes (array → `undefined`/iterator,
   sync → async); here the iteration protocol broke: "events is not iterable".
4. **Transitive / schema drift** — changed defaults, config or loader-entry schemas, or the peer's own
   transitive dependency changes, none of which any semver peer check inspects.

## 4. What the plugin author should have done

**Before publishing (catch it):**
- **Test against the actual target versions**, not just the floor: a CI matrix that installs each
  supported `@deepseek-ai/dsh-*` build (at minimum the floor alpha.2 and the newest alpha.5) and runs a
  **startup smoke test** (load plugin → `createChannel` → transcript replay). "npm install succeeded"
  is not a test.
- **Type-check the plugin's own source against each target's type declarations** — `tsc` against
  alpha.4/alpha.5's `.d.ts` would have flagged all 42 `session.events` sites
  (`Property 'events' does not exist on type 'Session'`) before publishing.
- Read the upstream changelog — alpha.4 explicitly said "Developers should pay attention to
  compatibility".

**Helping users (metadata vs runtime guard):**
- **peerDependencies/engines should encode only what version numbers can express**: the *actually
  tested* interval — e.g. `>=0.1.2-alpha.2 <0.1.2-alpha.4` (the band where `Session.events` exists),
  or pin the exact tested prerelease; `engines` for Node/dsh CLI requirements. Never widen a range
  beyond what was tested merely to silence npm.
- **Version fields cannot encode API presence — that needs a runtime feature-detection guard**, e.g.
  `const events = typeof session.events !== 'undefined' ? session.events : await session.snapshotEvents();`
  with a fallback via `eventAt()`/`seq`, and, when no path works, an actionable startup preflight
  error: "dsh-tui 0.1.0-beta.4 needs Session.events (dsh < 0.1.2-alpha.4); detected 0.1.2-alpha.5 —
  upgrade the plugin or downgrade dsh" instead of `TypeError: events is not iterable`.

## 5. Concrete pre-install check (what the user can do RIGHT NOW)

**Tarball API-usage scan cross-referenced with the changelog** — before installing:

```sh
# 1) see what the plugin claims
npm view @deepseek-harness-tui/dsh-tui@0.1.0-beta.4 peerDependencies dist.tarball

# 2) fetch the artifact into a scratch dir and scan for removed-API usage
npm pack @deepseek-harness-tui/dsh-tui@0.1.0-beta.4
tar -xzf deepseek-harness-tui-dsh-tui-0.1.0-beta.4.tgz
rg -n "session\.events|\.events\b" package/dist

# 3) cross-reference every hit against the dsh changelog entries between the peer
#    floor (alpha.2) and the version you run (alpha.5): any use of an API the
#    changelog marks removed/replaced => known-broken at runtime
```

Even stronger: type-check or smoke-run the unpacked plugin against your exact dsh build
(`0.1.2-alpha.5`) in a scratch directory before a global install.

What does **NOT** work as a check: `npm install --dry-run`, `npm ls`, `npm explain` — they all re-run
the same metadata-level semver comparison and will pass for this plugin. The decisive signals are the
plugin's own call sites vs. the changelog/API surface of the target version.

## run-stats

- toolcalls 总数: 17 (6 × run_code 外层调用 + 11 次嵌套工具调用: 1 glob, 1 working_directory, 5 read, 3 write, 1 send_message)
- token 用量: n/a (本会话未暴露 token 计量)
- 完成时间: 2026-10-21T14:50:01.861+08:00 (Asia/Shanghai, +08:00)
