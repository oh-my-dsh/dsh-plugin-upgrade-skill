# S13 · Peer Range vs Runtime Reality — Analysis Report

**Symptom:** `@deepseek-harness-tui/dsh-tui@0.1.0-beta.4` installed cleanly into `@deepseek-ai/dsh@0.1.2-alpha.5` (no npm peer warnings), then crashes on startup with `TypeError: events is not iterable` at plugin `channel.js:623`.

---

## 1. The exact runtime incompatibility

- **What was removed:** `Session.events` — the eagerly materialized array of session events that plugins could read and iterate directly (`session.events`, `.at(-1)`, spread/`for..of`).
- **Which release removed it:** `@deepseek-ai/dsh` **0.1.2-alpha.4** — i.e., the removal happened *inside* the plugin's declared peer range, between the range floor (alpha.2) and your installed host (alpha.5).
- **What replaced it** (changelog excerpt, `dsh-changelog-excerpt.md`, "Other Changes"):

  > **Replace `Session.events` with on-demand read APIs**: `seq`, `eventAt()`, and `snapshotEvents()` — the eagerly materialized events array is removed to reduce memory overhead in long sessions. Developers should pay attention to compatibility. (@kermanx)

  The same release also **distinguishes `SessionSeq` and `SessionLogOffset` with strong types** (a second, type-level breaking change in the same window).
- **How the crash maps to the removal:** the plugin reads the array in ≥42 places (fixture `plugin-source-excerpt.js`): `liveAgent.session.events` (channel.js:734), `agent.session.events` (channel.js:6685), `session.events.at(-1)` (line 657), and more. At alpha.4+ `session.events` is `undefined`, so whenever the code iterates/spreads/indexes it — e.g. `prepareReplayEvents` at channel.js:623 — JavaScript throws `TypeError: events is not iterable` during plugin load (`plugin.js:425 → cordis Fiber._reload`), killing the whole plugin tree. The plugin is not "partially broken"; it cannot start at all.

## 2. Why npm installed cleanly despite a broken plugin

npm's peer-dependency check is **purely a version-string range match against package.json metadata**. Does installed `0.1.2-alpha.5` satisfy `^0.1.2-alpha.2` (= `>=0.1.2-alpha.2 <0.2.0-0`)? Yes — alpha.5 sorts greater than alpha.2, so the check passes **silently and correctly, as a version check**. No source code is ever executed, no API surface is inspected, and peer ranges carry *zero* information about which symbols exist.

- **A peer range guarantees:** that a package whose **version number** falls inside the range is (or can be) present next to your host — a static, metadata-level resolution constraint. That's all.
- **It does NOT guarantee:** that every API the plugin imports still exists at that version; that behavior, return shapes, types, or defaults are unchanged across the range; that the peer copy the host runs against is the same copy that satisfied the range at install time (npm may nest a conflicting second copy inside the plugin's own tree); or that future versions inside the range won't remove things.
- **The prerelease trap:** `^0.1.2-alpha.2` mathematically spans `alpha.3, alpha.4, alpha.5, …` up to `<0.2.0`. The caret's implicit compatibility promise assumes versions inside a range are interchangeable — an assumption semver explicitly forbids for prereleases ("unstable API"). dsh shipped a hard API removal at alpha.4 *without leaving the range*, so the range and the reality diverge exactly as designed by prereleases.

## 3. The fundamental principle

- **Peer-range satisfaction** answers: *"Is a version string inside this range?"* — static, arithmetic, install-time, metadata-level.
- **Runtime compatibility** answers: *"When the host actually executes the plugin's code, does every API it touch exist, with the expected shape and semantics?"* — behavioral, code-level, only knowable by running (or statically type-checking against) the real implementation.

**At least two categories of breakage that pass peer-range validation yet crash at runtime:**

1. **API removal / rename** (this case): `Session.events` existed at the floor, was removed mid-range at alpha.4, substituted with `seq` / `eventAt()` / `snapshotEvents()`.
2. **Semantic / contract drift on surviving APIs**: the symbol still exists but its type or behavior changed — e.g. the same release's `SessionSeq` vs `SessionLogOffset` split: values are now strongly typed and not interchangeable, so code that passes them around crashes or silently misbehaves even though "the version satisfied the range."
3. **(Bonus) Resolution/physical-layout mismatches**: peer satisfied by a nested duplicate of the package inside `node_modules`, not the host's copy, so the plugin binds to a different build than the running host; also changed option/required-config surfaces that npm sees nothing about.

In short: **peer satisfaction is a necessary but now-sufficient condition only by accident of version numbering — it is never evidence of compatibility.**

## 4. What the plugin author should have done

**Catch it before publishing (test against the actual target, not the metadata):**

- Run the plugin's test/smoke suite in CI against **actual installs of the host versions the peer range claims to support** — a version matrix spanning `0.1.2-alpha.2 … 0.1.2-alpha.5` (or at minimum the newest alpha their range admits), e.g. `npm i @deepseek-ai/dsh@<ver>` in the CI job and boot the plugin headless. The crash here is a *startup smoke test* failure — trivially catchable.
- Consume dsh's changelog/breaking-changes feed for **every version inside the declared range**, not just the version used at dev time.

**Fix the declaration + the code:**

- **Peer range must encode the minimum *known-good* (or known-bad-excluded) version, not the version they happened to build on.** Since `Session.events` survived only through alpha.3, until the code migrates the honest range would be `>=0.1.2-alpha.2 <0.1.2-alpha.4` — an **upper-bounded** range that excludes the removal. The real fix is to rewrite the 42 `.events` reads onto the replacement API (bulk replay → `snapshotEvents()`; random/positional access → `seq` + `eventAt()`), then declare `>=0.1.2-alpha.4` and test against alpha.5.
- **Engines / peerDependencies can only ever encode a version number** — and with dsh shipping breaking removals inside prereleases, *no* range is future-proof (a future `0.1.2-alpha.6` can remove anything else). So anything load-bearing needs a **runtime feature-detection guard** at plugin load, failing fast with an actionable message, e.g.:

  ```js
  if (typeof liveSession.snapshotEvents !== 'function') {
    throw new Error('dsh-tui requires dsh >= 0.1.2-alpha.4: Session.events was removed; use snapshotEvents()/eventAt()/seq')
  }
  ```

  That converts `events is not iterable` into an instantly diagnosable error. (`engines` is advisory at best — npm doesn't hard-block on it.)

## 5. What the user can do RIGHT NOW (pre-install check)

The class of bug installs silently, so verification must push past the version-range arithmetic. Concrete pre-install check — **diff the host's changelog across the plugin's peer window**:

```powershell
# 1) Get the plugin's declared peer floor
npm view @deepseek-harness-tui/dsh-tui peerDependencies
# 2) List every host version that will fall inside that range
npm view @deepseek-ai/dsh versions --json
# 3) Read each changelog entry between the floor and your installed version
#    for "removed / replaced / breaking" notes -> 0.1.2-alpha.4 removes Session.events
```

Corollary checks that would have flagged this before touching the real environment:

- **Smoke-test into a throwaway prefix first:** `npm install --prefix <tmp> @deepseek-harness-tui/dsh-tui` and boot it headless (`dsh-tui --help` / load the plugin tree) *before* the global install; the crash reproduces in seconds there.
- `npm install --dry-run` is fine for peer *conflicts* but will **not** catch this class (there is no conflict — only a wrong assumption).
- After install, `npm ls @deepseek-ai/dsh*` confirms single-copy vs. a nested duplicate peer copy (category 3 above).

**Immediate remediation for your situation:** don't just reinstall. Your options, best first: (a) wait for/patch the plugin to the replacement API (`snapshotEvents()` etc.) — check upstream for a beta.5+; (b) file/report the incompatibility citing the alpha.4 removal; (c) as a stopgap, `npm i -g @deepseek-ai/dsh@0.1.2-alpha.3` brings the host back inside the plugin's working window — but this is a host downgrade and should be temporary only.

---

### One-line takeaway

`0.1.2-alpha.5` satisfying `^0.1.2-alpha.2` proves only *version-string ordering*; dsh removed `Session.events` at alpha.4 — inside that range — so the plugin's 42 `.events` reads crashed at runtime. Peer ranges gate *which version is installed*; only testing against the actual target version (plus a runtime feature guard) gates *whether the code works*.
