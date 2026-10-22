# S13 — Peer Range vs Runtime Reality

## 1. Exact runtime incompatibility

- **Removed API:** `Session.events` — the eagerly materialized array of session events on every session object. It no longer exists in dsh `0.1.2-alpha.4`+.
- **When removed:** dsh `v0.1.2-alpha.4` (per `fixture/dsh-changelog-excerpt.md`, release notes "dsh-v0.1.2-alpha.4", section "Other Changes", entry "@kermanx").
- **What replaced it:** on-demand read APIs — `seq`, `eventAt()`, and `snapshotEvents()`.
- The same alpha.4 batch also introduced strongly-typed `SessionSeq` vs `SessionLogOffset` distinction ("@tianyicui"), so positional offsets and sequence numbers are no longer interchangeable.
- **Crash evidence:** `fixture/crash-stack.txt` — `TypeError: events is not iterable at prepareReplayEvents (channel.js:623:25)` inside the plugin; `fixture/plugin-source-excerpt.js` — line 734 `const events = liveAgent.session.events;` (plus 42 total `.events` references at lines 657, 2685, 3004, 6685, …). Reading `session.events` now yields `undefined`, and iterating it (`replayEvents(agent.session.events)` at channel.js:6685) throws.

## 2. Why npm installed silently

`npm install` peer validation is **static, package-metadata-level only**. The plugin declares peerDependencies `^0.1.2-alpha.2` for the `@deepseek-ai/dsh-*` packages; the installed dsh `0.1.2-alpha.5` bundles those at `0.1.2-alpha.5`, which semver-satisfies `>=0.1.2-alpha.2 <0.2.0-0`. So npm's peer check passes and no warning is printed (`fixture/npm-install-output.txt`).

What `^0.1.2-alpha.2` guarantees: only that the **version numbers** of the peer packages found in the tree fall inside that range.

What it does NOT guarantee:
- that any particular API (`Session.events`) still exists at that version;
- that an API's shape/semantics are unchanged (e.g. `events` went from array to removed, offsets changed type);
- that the plugin was ever tested against the satisfying version;
- note `alpha.5 > alpha.2` in semver ordering does **not** imply the code at alpha.5 is a superset of the API at alpha.2 — prerelease minors routinely remove APIs. A peer range is an inequality on version strings, not a contract about behavior.

## 3. Fundamental principle & breakage categories that pass peer validation

- **Peer-range satisfaction checks:** the *declared* semantic version interval of peer package names in the installed tree — metadata only, no code is loaded or executed.
- **Runtime compatibility checks:** the *actual behavioral surface* the plugin touches at execution time — does the import exist, is the method present, does the object still have that field, does the wire protocol/event name/registration signature match, do types/units (offset vs seq) line up.

Classes of breakage that pass peer-range validation but crash/misbehave at runtime:
1. **Removed or renamed exports/fields** — e.g. `Session.events` removed in alpha.4 → `undefined`, `TypeError: events is not iterable`.
2. **Changed signatures or semantics** — e.g. `SessionSeq` vs `SessionLogOffset` merged/split, changed event names, changed payload shapes, async→sync or promise→callback flips.
3. **Behavioral/protocol changes without API change** — a method keeps its signature but alters auth (401 vs ok), ordering, nullability, or wire format (ghost-host style generation differences); also removed transitive/internal service probes (`ctx.remote.*`, service names, headless argv contract).
4. **Environment/engines mismatch** — Node/runtime version, global flags, or required peer service not actually mounted, all unrelated to the semver string.

## 4. What the plugin author should have done

Before publishing:
- **Test against the actual target versions** — run the plugin mounted in dsh `0.1.2-alpha.4`/`alpha.5` (not just the oldest alpha.2 it was coded against), with functional smoke tests of transcript replay; CI should spin up each supported host generation.
- **Track the migration notes** for each supported corridor entry (`Session.events` → `seq`/`eventAt()`/`snapshotEvents()`) and migrate the 42 `.events` call sites.
- Ship both cohorts or branch by capability if supporting pre- and post-alpha.4.

Package metadata vs code:
- **peerDependencies/engines encode only coarse facts npm can enforce**: which host package names and version intervals the plugin claims to support, and the Node engine. After the rewrite it should be split, e.g. peer range `^0.1.2-alpha.4` for the new API (or dual ranges per supported line). Never claim alpha.2–alpha.5 support in the range if alpha.4 removed the API you use.
- **Feature detection / runtime guards encode what ranges cannot**: a guard at load time, e.g. `if (typeof session.snapshotEvents === 'function') { …new API… } else if (Array.isArray(session.events)) { …legacy… } else { throw new Error('dsh: unsupported session API; need dsh >= 0.1.2-alpha.4 (or legacy)') }`, possibly with a clear user-facing error instead of `events is not iterable`. Ranges/engines declare intent; guards make failure explicit and enable graceful degradation.

## 5. Concrete pre-install check for the user

Before installing a plugin, run the plugin's own pre-flight touchpoint scan (shipped with the dsh plugin-upgrade skill): inventory its `package.json` peerDependencies/engines, then grep its source for dsh touchpoints — direct session/event surface reads (`.events`, `session.events`), service probes, event-name usage, host directory reads, HTTP/WS channels — and diff each hit against the target dsh version's changelog/migration notes for removals. In this case a single scan for `session.events` would have flagged it, and the alpha.4 changelog entry ("Replace `Session.events` with on-demand read APIs") confirms the breakage **before install**. Complement with: `npm view <plugin> peerDependencies`, compare against `dsh --version`, and check the plugin's issue tracker / supported-versions doc. If any touchpoint the plugin uses was removed or its signature changed in your version, don't install (or pin an older dsh / wait for a plugin update); a version-range match is necessary, not sufficient.
