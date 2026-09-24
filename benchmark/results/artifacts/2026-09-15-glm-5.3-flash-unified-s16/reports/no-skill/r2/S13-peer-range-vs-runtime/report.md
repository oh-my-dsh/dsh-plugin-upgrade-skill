# S13 Report — Peer Range vs Runtime Reality

Environment: dsh `0.1.2-alpha.5`; plugin `@deepseek-harness-tui/dsh-tui@0.1.0-beta.4`.
Evidence: `fixture/npm-install-output.txt`, `fixture/crash-stack.txt`, `fixture/plugin-source-excerpt.js`, `fixture/dsh-changelog-excerpt.md`.

---

## 1. The exact runtime incompatibility

**WHAT was removed:** the `Session.events` property — the eagerly materialized events array on the dsh session object.

**WHEN:** dsh **`v0.1.2-alpha.4`**. Citing `fixture/dsh-changelog-excerpt.md` (release notes for `dsh-v0.1.2-alpha.4`, "Other Changes"):

> - **Replace `Session.events` with on-demand read APIs**: `seq`, `eventAt()`, and `snapshotEvents()` — the eagerly materialized events array is removed to reduce memory overhead in long sessions. Developers should pay attention to compatibility. (@kermanx)
>
> - **Distinguish `SessionSeq` and `SessionLogOffset` with strong types** — developers should pay attention to compatibility. (@tianyicui)

**What replaced it:** three on-demand read APIs on the session — `seq` (current sequence number), `eventAt(i)` (indexed access), and `snapshotEvents()` (materialize events on demand) — instead of a always-populated `session.events` array.

**The crash mechanism:** the plugin reads the removed property 42 times (`fixture/plugin-source-excerpt.js`: `liveAgent.session.events` at line 734, `replayEvents(agent.session.events)` at 6685, plus `session.events.at(-1)` at 657, etc.). After alpha.4, `session.events` no longer exists, so every read evaluates to `undefined`. The plugin then tries to **iterate** that `undefined` value, producing the observed `TypeError: events is not iterable` inside `prepareReplayEvents (channel.js:623)` during plugin load (`fixture/crash-stack.txt`), which fails the plugin tree loader and aborts startup.

Note this is not a version-mismatch error or a missing module — the plugin's host version is *inside its declared peer range*; the API surface simply changed underneath it.

## 2. Why npm installed silently

`npm install -g @deepseek-harness-tui/dsh-tui` printed "added 77 packages" and **zero peer warnings** (`fixture/npm-install-output.txt`). That is expected, because:

**What `^0.1.2-alpha.2` actually guarantees:** it expands to the semver interval `>=0.1.2-alpha.2 <0.2.0-0`. npm's peer-dependency check is a **purely static, metadata-level comparison**: it takes the *declared* version strings in the installed packages' `package.json` and checks membership in the declared range. The installed `@deepseek-ai/dsh@0.1.2-alpha.5` bundles the `dsh-*` packages at `0.1.2-alpha.5`, and in prerelease ordering `alpha.2 < alpha.4 < alpha.5 < 0.1.2`, so `0.1.2-alpha.5` is inside the interval. Check passes → no warning. The range guarantees exactly one thing: *the host's version number falls within an interval the plugin author asserted compatibility with.*

**What it does NOT guarantee:** that the plugin's code actually works on any given version inside that interval. Specifically:

- A caret range asserts the author's *intent/belief* ("I tested against something in this window"), not a verified property of each version in the window.
- On a `0.x` prerelease line, "compatible" minor-and-patch movement is fiction: `alpha.2 → alpha.3 → alpha.4 → alpha.5` are all "same version, increasing prerelease" to semver ordering, yet **alpha.4 contained a hard breaking API removal** while remaining inside `^0.1.2-alpha.2`. Semver ordering sees `alpha.5 > alpha.2`; it knows nothing about `Session.events`.
- npm never inspects code. No static check — peer ranges, `engines`, `--dry-run` — can detect that a symbol the plugin calls was deleted from the host at runtime.

So "npm installed with no warnings" and "crashes immediately at startup" are not contradictory; they are two independent layers, and only one of them was ever checked.

## 3. The fundamental principle

- **Peer-range satisfaction checks: static, package-metadata-level facts.** "Does the declared version string of the installed host fall inside the declared range in `package.json`?" It is a string/interval comparison over *declarations of intent*. It validates nothing about behavior, exports, or execution.
- **Runtime compatibility checks: behavioral, code-level reality.** "On the actual host binary/version at hand, does every exported symbol the plugin dereferences exist with the expected name, signature, shape, and semantics when the plugin executes?" It can only be established by executing (or faithfully analyzing) the plugin against the real host version.

**Categories of breakage that pass peer-range validation but crash at runtime** (≥2 required):

1. **API removal / rename** — the host deleted or renamed an exported symbol while staying in-range. *This case:* `Session.events` removed in `0.1.2-alpha.4`; the plugin's 42 `.events` reads become `undefined` → `TypeError: events is not iterable`.
2. **Signature / return-shape / semantics change** — the symbol still exists but its contract changed: different parameters, a sync API turned async (plugin iterates a now-Promise/array-like), a returned object lost or re-typed fields, or values re-typed into incompatible strong types. The same alpha.4 changelog ships a second instance: `SessionSeq` vs `SessionLogOffset` "distinguished with strong types" — invisible to JS at install time, breaking TS consumers and any caller who conflates the two.
3. *(additional)* **Behavioral/protocol changes with stable signatures** — changed error types, changed event ordering/lifecycle, changed throw conditions, changed config-key meanings — all pass any range check and surface only as misbehavior or crashes at run time.

## 4. What the plugin author should have done

**Catch it before publishing (testing against the actual target version):**

- Add a CI job that performs a **real install + smoke test against the concrete target host**, not a range: `npm i -g @deepseek-ai/dsh@0.1.2-alpha.5 && npm i -g @deepseek-harness-tui/dsh-tui && dsh-tui --smoke` (headless startup, load the plugin, exercise `createChannel`). A 5-second boot test would have caught the alpha.4 removal immediately.
- Test a **matrix**: the lower bound of the peer range (`alpha.2`) *and* the latest published host (`alpha.5` at publish time), re-run on every new host prerelease. Prerelease-line churn means "the latest alpha" is a moving target that must be re-verified, not assumed.
- Maintain **contract/API-surface tests**: snapshot the dsh exports the plugin depends on (`session.events`, `session.seq`, `eventAt`, `snapshotEvents`) and assert their existence/shape against the pinned host version in CI; or run `tsc` against the host's type definitions so removals/strong-typing changes (like the `SessionSeq`/`SessionLogOffset` split) fail the build.

**Help users — what to encode where:**

- **Peer range (static declaration):** encode only what was *actually tested*. If the plugin was verified against `alpha.3` but not `alpha.4+`, the range must not claim `^0.1.2-alpha.2` (i.e., `<0.2.0-0`); use a narrow upper-bounded range such as `>=0.1.2-alpha.2 <0.1.2-alpha.4` (or an exact pin `0.1.2-alpha.3`) and widen it only after re-testing against the newer host. On 0.x prerelease lines, narrow ranges/exact pins are the honest encoding.
- **`engines` field (still static):** if the dsh host honors `engines`, declaring the supported dsh version there is an additional visible constraint dsh can enforce at load/install time — better discoverability than peerDependencies alone, but it is still a static declaration and does not by itself verify behavior.
- **Runtime feature-detection guard (the part that must be code, not metadata):** at plugin init, probe for the API before using it and fail with an actionable message, e.g.:

  ```js
  function makeEventReader(session) {
      if (typeof session.snapshotEvents === 'function') {      // dsh >= 0.1.2-alpha.4
          return () => session.snapshotEvents();
      }
      if (Array.isArray(session.events)) {                     // dsh <= 0.1.2-alpha.3
          return () => session.events;
      }
      throw new Error(
          `dsh-tui is incompatible with this dsh version: Session.events was removed in ` +
          `dsh 0.1.2-alpha.4 (replaced by seq/eventAt()/snapshotEvents()). ` +
          `Upgrade dsh-tui, or pin dsh to 0.1.2-alpha.3.`);
  }
  ```

  Feature detection (does `snapshotEvents` exist? is `events` an array?) converts a cryptic `TypeError` at stack-frame 623 into a diagnosable version-mismatch message, and ideally lets the plugin support both host generations. Feature detection handles behavior; only the tested peer range tells the user *before* install; only the smoke test tells the author *before* publish.

## 5. What you can do RIGHT NOW, before installing

A concrete pre-install check — **cross-reference the host's changelog against the plugin's actual code for everything inside the peer range**:

1. Get the plugin's range and pull its published code without installing it into dsh:
   ```bash
   npm view @deepseek-harness-tui/dsh-tui peerDependencies          # shows ^0.1.2-alpha.2
   npm pack @deepseek-harness-tui/dsh-tui@0.1.0-beta.4              # downloads tarball only
   tar -tzf dsh-tui-0.1.0-beta.4.tgz && tar -xzf dsh-tui-0.1.0-beta.4.tgz
   ```
2. List the host releases inside the range (`npm view @deepseek-ai/dsh versions`) and read their changelogs — here `dsh-v0.1.2-alpha.4` explicitly says "`Session.events` … removed … Developers should pay attention to compatibility."
3. Grep the unpacked plugin for the removed/changed symbols:
   ```bash
   grep -rn "\.events\b" package/dist/   # → 42 hits on session.events ⇒ will break on alpha.4+
   ```
   Any hit on a symbol the changelog says was removed/changed inside your installed version's window = do not install (or pin the host below the breaking release, e.g. `0.1.2-alpha.3`).

Equivalently, when code inspection is impractical: **smoke-test in isolation first** — install the plugin into a throwaway prefix/container with the real dsh version and launch it once (`npm prefix -g` untouched), so a startup crash costs a container, not your dsh installation. The key point: never treat a silent `npm install` as a compatibility verdict — npm only ever checked the version strings.
