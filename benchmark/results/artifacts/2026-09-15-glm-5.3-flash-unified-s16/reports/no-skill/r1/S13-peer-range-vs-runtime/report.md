# S13 · Peer Range vs Runtime Reality — Diagnosis Report

**Scenario:** `@deepseek-harness-tui/dsh-tui@0.1.0-beta.4` installed cleanly on `@deepseek-ai/dsh@0.1.2-alpha.5` (no peer warnings), crashes at startup.
**Verdict:** Not an install problem. The plugin depends on an API (`Session.events`) that dsh removed in `0.1.2-alpha.4` — a release that is *inside* the plugin's declared peer range. Peer-range satisfaction is a static metadata check and was never a guarantee of runtime compatibility.

---

## 1. The exact runtime incompatibility

**WHAT was removed:** the `Session.events` property — the eagerly materialized events array on the dsh session object.

**WHEN:** dsh **`v0.1.2-alpha.4`**, per the changelog excerpt (`fixture/dsh-changelog-excerpt.md`):

> - **Replace `Session.events` with on-demand read APIs**: `seq`, `eventAt()`, and `snapshotEvents()` — the eagerly materialized events array is removed to reduce memory overhead in long sessions. Developers should pay attention to compatibility. (@kermanx)

The same alpha.4 release also shipped a second compatibility hazard:

> - **Distinguish `SessionSeq` and `SessionLogOffset` with strong types** — developers should pay attention to compatibility. (@tianyicui)

**What replaced it:** `Session.seq`, `Session.eventAt(index)`, and `Session.snapshotEvents()` — on-demand read accessors instead of a live array.

**Why it crashes:** the plugin reads `agent.session.events` in 42 places (`fixture/plugin-source-excerpt.js`: `liveAgent.session.events`, `session.events.at(-1)`, `agent.session.events`, `liveSession.events`, …) and passes it to `replayEvents()`, which iterates it. After alpha.4, `session.events` is `undefined`, and iterating `undefined` throws:

```
TypeError: events is not iterable
    at prepareReplayEvents (channel.js:623:25)
    at replayEvents (channel.js:6127:33)
    ...
Error: dsh: plugin tree failed to load: failed to apply loader entry dsh-tui
```

This is the classic shape of a "property removed" breakage: the access does not throw (reading a missing property yields `undefined`); it is the *first use* of the value — iteration, `.at(-1)`, etc. — that throws, and it throws deep inside the plugin's own code, far from the actual cause.

## 2. Why npm installed silently

The plugin declares `peerDependencies` of `^0.1.2-alpha.2` for every `@deepseek-ai/dsh-*` package. In semver, `^0.1.2-alpha.2` expands to **`>=0.1.2-alpha.2 <0.2.0-0`**. npm's range algebra says:

- prerelease comparators match prereleases on the same `[major, minor, patch]` tuple, so `0.1.2-alpha.4` and `0.1.2-alpha.5` both satisfy the range;
- prerelease ordering is `alpha.2 < alpha.4 < alpha.5`, and the host `0.1.2-alpha.5` is "greater than" the floor.

npm's peer check at install time is therefore a pure **version-string vs. range comparison**. It passes silently — correctly, by its own rules.

**What `^0.1.2-alpha.2` actually guarantees:** only that the *declared version number* of the host falls in an interval the plugin author *chose*. Nothing more.

**What it does NOT guarantee:**

1. **That the range was authored from evidence.** The author appears to have picked alpha.2 as "the version I developed against" and let the caret do the rest — but an alpha/beta series is, by definition, allowed to change. alpha.4 introduced a breaking removal *within* the range.
2. **That any API surface still exists.** Semver ordering (`alpha.5 > alpha.2`) encodes nothing about code. "Greater than" ≠ "superset of".
3. **That any behavior, signature, or shape is preserved.** A function can keep its name and change its parameters; an array can become an accessor pair; a number can become a strong type — all inside one satisfied range.
4. **That npm inspected or executed anything.** The peer check never reads the host's exports, let alone runs code. There is no install-time API verification step at all.

In short: a peer range is the author's *claim* about compatibility; npm verifies only that the claim and the host's *label* are arithmetically consistent. It cannot verify the claim against reality.

## 3. The fundamental principle

| | Peer-range satisfaction | Runtime compatibility |
|---|---|---|
| **Checks** | Package *metadata*: does the host's declared version string fall within the plugin's declared semver interval? | *Behavior*: does the host's actual code at the exact installed version expose every symbol the plugin calls, with compatible signatures, shapes, and semantics, when executed? |
| **Nature** | Static, declarative, version-arithmetic; runs at install/resolution time | Behavioral, code-level reality; only observable by loading/executing the host against the plugin |
| **Verified by** | npm dependency resolution | Actually running the plugin against that host build (tests, smoke test, feature detection) |

**Categories of breakage that pass peer-range validation but crash at runtime** (any two suffice; here are four, the first two evidenced in this fixture):

1. **Removed/renamed APIs inside the range** — `Session.events` deleted in `0.1.2-alpha.4` while `^0.1.2-alpha.2` still admits alpha.4/5. Access yields `undefined`; first use throws (`events is not iterable`). *(This case.)*
2. **Type/shape changes** — same changelog: `SessionSeq` vs `SessionLogOffset` split into strong types; a swapped numeric ID corrupts logic silently or throws on use. More generally: a return type changing from array to object, sync to promise, or a property renamed, all without a version-range violation.
3. **Signature/arity changes** — same exported name, different parameters or option names; calls misbehave or throw at call time.
4. **Behavioral contract changes** — ordering, lifecycle, or timing changes (e.g., when a plugin hook is invoked, whether a collection is live or snapshotted) that only manifest on execution.

## 4. What the plugin author should have done

**To catch it before publishing — test against the actual target version:**

- Install the real host at the *tip of the declared range* (`dsh@0.1.2-alpha.5`) in CI and run a startup smoke test (`dsh-tui` boots, loads one transcript) against it before `npm publish`. This single step would have caught the crash immediately, because the crash is at startup.
- Run a CI matrix across the range endpoints (floor `alpha.2` and latest in-range `alpha.5`) rather than only the version they developed on. "Range declared" must mean "every version in the range verified".
- Track the host's changelog for entries flagged "developers should pay attention to compatibility" (alpha.4 had two such entries, including the exact API the plugin uses) and treat them as release blockers.

**To help users — encode reality honestly, and fail loudly at the boundary:**

- **Peer range:** declare only what has actually been tested. Here that means excluding the breaking release, e.g. `">=0.1.2-alpha.2 <0.1.2-alpha.4"` (or pinning to `0.1.2-alpha.2` / using a narrow tilde-style bound) until the plugin is ported — not an optimistic caret over an unstable prerelease series.
- **Runtime feature-detection guard:** version ranges cannot express "this symbol must exist", so the plugin must check at load time and fail with an actionable message, e.g.:

  ```js
  const session = liveAgent.session;
  if (typeof session.snapshotEvents !== "function" && !Array.isArray(session.events)) {
      throw new Error(
          "dsh-tui requires dsh >= 0.1.2-alpha.4 (Session.events was replaced by " +
          "seq/eventAt()/snapshotEvents() in 0.1.2-alpha.4). " +
          `Detected dsh without snapshotEvents(); please upgrade dsh.`
      );
  }
  ```

- **Better: bridge both eras.** Use `session.events` when present (alpha.2–alpha.3), else `snapshotEvents()` (alpha.4+), so one build supports hosts on both sides of the removal — while still narrowing the peer range to what is genuinely exercised.
- The payoff of the guard: the user sees "requires dsh >= 0.1.2-alpha.4" instead of a bare `TypeError: events is not iterable` buried at `channel.js:623`.

## 5. What you can do RIGHT NOW before installing any plugin

A concrete pre-install check (30 seconds, no install needed):

1. **Fetch the plugin's declared peer range and compare it against your host's changelog, not just your version number:**

   ```bash
   npm view @deepseek-harness-tui/dsh-tui@0.1.0-beta.4 peerDependencies
   ```

   Note the range floor (here `0.1.2-alpha.2`), then read the host changelog for **every release between that floor and your installed version** (`0.1.2-alpha.3`, `-alpha.4`, `-alpha.5`) looking for breaking/compatibility entries. Here, the alpha.4 note "Replace `Session.events` … Developers should pay attention to compatibility" is visible *before* any install and names exactly the kind of removal that breaks plugins.

2. **If you want to be certain, grep the plugin for the symbol before installing it into your real environment** (e.g., into a scratch directory):

   ```bash
   npm pack @deepseek-harness-tui/dsh-tui@0.1.0-beta.4 && tar xzf deepseek-harness-tui-dsh-tui-0.1.0-beta.4.tgz
   grep -n "\.events" package/src/*.js   # does it touch APIs removed since the range floor?
   ```

3. **Cheap generalization:** prefer installing plugins into a disposable container/profile first and smoke-testing one startup, and be extra suspicious whenever the host is a `0.x` prerelease — caret ranges over prerelease series routinely admit breaking changes, exactly as `^0.1.2-alpha.2` admitted the alpha.4 removal.

---

### One-line summary

`^0.1.2-alpha.2` is a claim about version numbers; dsh `0.1.2-alpha.4` removed `Session.events` (replaced by `seq` / `eventAt()` / `snapshotEvents()`) while remaining inside that range, so npm's metadata-level peer check passed silently while the plugin's 42 `session.events` accesses exploded at startup — peer-range satisfaction checks package metadata, runtime compatibility checks code, and only testing against the actual host version (plus a runtime feature-detection guard and an honest, narrowed peer range) closes the gap.
