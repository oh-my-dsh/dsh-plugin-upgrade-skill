# S13 — Peer Range vs Runtime Reality

## 1. The exact runtime incompatibility

- **What was removed:** the eagerly materialized `Session.events` array on dsh session objects (`session.events`, read in the plugin ~42 times, e.g. `liveAgent.session.events` at channel.js:734, `session.events.at(-1)` at channel.js:657). It no longer exists, so iterating it throws `TypeError: events is not iterable` at plugin load (`prepareReplayEvents`, channel.js:623).
- **When:** in `dsh-v0.1.2-alpha.4` release notes (fixture `dsh-changelog-excerpt.md`):
  > "Replace `Session.events` with on-demand read APIs: `seq`, `eventAt()`, and `snapshotEvents()` — the eagerly materialized events array is removed to reduce memory overhead in long sessions. Developers should pay attention to compatibility."
  The same release also introduced the strong-type distinction `SessionSeq` vs `SessionLogOffset`.
- **What replaced it:** on-demand read APIs — `seq`, `eventAt()`, `snapshotEvents()` — plus explicit `SessionSeq`/`SessionLogOffset` offset types. The plugin at beta.4 still reads `session.events`, so on dsh alpha.4/alpha.5 it crashes at startup.

## 2. Why `npm install` passed with zero peer warnings

The plugin declares `peerDependencies: { "@deepseek-ai/dsh-*": "^0.1.2-alpha.2" }` for all 24+ dsh packages. npm's peer check is purely a semver test: does the installed version (0.1.2-alpha.5) fall inside the declared range? For `^0.1.2-alpha.2` that resolves to `>=0.1.2-alpha.2 <0.2.0-0`, and alpha.5 sorts after alpha.2, so npm says "satisfied" and warns about nothing (fixture `npm-install-output.txt`).

What the range **guarantees**: only that the *version number* lies in an interval consistent with semver precedence. What it **does NOT guarantee**: that every API the plugin imports/reads at runtime still exists, keeps its shape, or behaves the same in the installed version. A caret range on a `0.x` alpha line asserts roughly "same minor feature line," which says nothing about additive promises vs. breaking refactors of individual properties. The `Session.events` removal is a behavioral change that version arithmetic cannot see.

## 3. The fundamental principle

- **Peer-range satisfaction** is a static, package-metadata-level check: "is the installed package's *version* inside the range I declared?"
- **Runtime compatibility** is a behavioral, code-level check: "does every API surface my code actually touches still exist, with the same signatures and semantics, in the installed version?"

At least two breakage categories pass peer-range validation but crash at runtime:

1. **Removals / renames of individual APIs** — e.g. `Session.events` deleted, a method renamed. Code reading the old property gets `undefined` / "not iterable" / "is not a function" at call time.
2. **Shape / type changes of existing APIs** — e.g. strong-typing `SessionSeq` vs `SessionLogOffset`, an option becoming required, a return value changing from an array to a generator/promise, a callback signature gaining a required argument. The symbol still exists, so nothing warns, but iteration/argument behavior breaks.

(Related sub-categories: changed event ordering, error types replaced, and any transitive dependency silently deduped/hoisted to an incompatible copy.)

## 4. What the plugin author should have done

Before publishing:

- Run the plugin's test suite (at minimum, a smoke "load + replay channel" test) against each supported host version of `@deepseek-ai/dsh` — alpha.2, alpha.3, alpha.4, alpha.5 — not just the version it was authored on; a CI matrix over concrete dsh versions would have caught the `events is not iterable` crash immediately.
- Publish a changelog/migration note alongside, and bump the plugin's version in lockstep with host breaking changes.

For users:

- Encode only the *true* supported interval in `peerDependencies`/`engines`: since alpha.4 removed `Session.events`, the correct peer range for beta.4's code is `<0.1.2-alpha.4` (e.g. `>=0.1.2-alpha.2 <0.1.2-alpha.4`), and the migrated plugin should declare `>=0.1.2-alpha.4`. Narrowing the range converts a runtime crash into a loud install-time warning. An `engines` entry for the host can add a second guardrail.
- Anything narrower than a whole-range assertion — "works on alpha.4 only if `snapshotEvents` exists" — cannot be expressed in semver, so add a runtime feature-detection guard at startup, e.g. check `typeof session.events === 'undefined'` vs. `typeof session.snapshotEvents === 'function'` and either use the on-demand APIs or emit a clear "plugin requires dsh >= alpha.4 (or < alpha.4 for the legacy path)" error instead of an opaque `events is not iterable` stack.

## 5. What I can do right now, before installing

Concrete pre-install check: compare the plugin's declared peer range against the dsh changelog's documented breaking changes, and grep the plugin's code for the APIs that were removed. Specifically, for `dsh-tui@0.1.0-beta.4` and dsh alpha.5:

- `npm view @deepseek-harness-tui/dsh-tui peerDependencies` to read its declared range, and `@deepseek-ai/dsh@<version>` changelog for each alpha between the range floor and my installed version;
- `npm view`/`npm pack` the plugin (or read its repo source) and grep for `.events` on session objects — finding `session.events` still referenced while the changelog says "`Session.events` removed in alpha.4" tells me it will crash.

As a habit: never treat a passing peer-range as proof of compatibility; treat the intersection of (plugin's declared range) ∩ (host changelog breaking-change set) ∩ (plugin source's API usage) as the real compatibility test. If external docs are unreachable, the install-time tells are short: crash on first run with "X is not iterable/a function" right after a host reinstall means a peer range hid a runtime break.
