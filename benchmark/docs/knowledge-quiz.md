# Knowledge quiz · dsh plugin upgrade (fast screening)

Eighteen closed-book questions covering the upgrade-skill material: version
corridors, planes and contracts, verification/attribution, toolchain hygiene,
naming/registry, and release/audit. Intended for fast screening (30–60s each,
recommended pass line 14/24) before running the Harbor tasks — an agent that
fails these will score near zero on the task benches, and an agent that passes
them still needs the with-skill task benches to prove behavior.

Questions are single-choice (S), multiple-choice (M), or true/false (T/F).
Answers with reasoning follow each question; every fact anchors to a card /
rollup entry of the upgrade skill.

> Calibration note (2026-08-31, one closed-book agent, three runs): T1-01/03/06
> were answered correctly in all three runs; T1-11 was wrong once; **T1-16 was
> wrong in all three runs** (all three picked A) and is the most discriminating
> item of the set.

---

**Q1 (S) — corridor construction.** Migrating a plugin from `dsh-v0.1.1-rc.2` to
`dsh-v0.1.2-alpha.2`, how is the version corridor constructed?

A. Read `v0.1.2-alpha.2.md` only — it is the complete list of changes for the target.
B. Read the reference files in filename lexicographic order.
C. Follow the directed `from → to` edges: `v0.1.1-rc.2.md` → `v0.1.2-alpha.1.md` → `v0.1.2-alpha.2.md`, then layer the rollup corridor-level deltas on top.
D. Read `rollup-0.1.2.md` only — the cards are redundant.

**Answer: C.** The corridor index forbids filename ordering (`alpha.10` sorts before
`alpha.2`); the rollup only holds corridor-level deltas and does not repeat cards.

**Q2 (T/F) — corridor folding.** `SessionEvent.ignorable` was removed in alpha.1
(DSH-0.1.2-A1-02) and its retention semantics restored in alpha.2 (DSH-0.1.2-A2-01).
If a plugin contains defense code that deletes the marker "for alpha.1", and the
migration target is alpha.2, the correct action is to **delete that defense**.

**Answer: true.** Read the full corridor first and fold to the net state: the target
restored the semantics, so the intermediate-state defense is deleted, not kept.

**Q3 (M) — baseline attribution.** A plugin repository already has failing
build/typecheck/tests *before* the migration starts. Which of the following are the
correct baseline-attribution practices?

A. Quietly fix the pre-existing failures as part of the migration so the suite turns green.
B. Collect the pre-existing failure list and fingerprints into an exemption list before any migration write.
C. After the migration, attribute every failure to the migration.
D. After the migration, compare failure fingerprints and count only failures new relative to the baseline.
E. Delete the failing test files so the set shrinks and the suite turns green.

**Answer: B, D.** A pollutes the migration diff and hides real regressions; C reports
pre-existing failures as migration breakage; E is an unjustified test-set reduction.
Source: rollup R-06.

**Q4 (S) — toolchain hygiene.** After editing source during a migration, typecheck
reports TS2305/TS2614 "cannot find export" but grepping the source finds no
reference. The most likely cause is:

A. The card recipe is wrong.
B. A stale incremental tsbuildinfo / build-cache false positive.
C. Missing dependencies.
D. Node outside the supported window.

**Answer: B.** Run `clean` first to rule out the cache, then grep for real
references. Source: migration-hygiene §1 / task H4.

**Q5 (S) — planes.** A 0.1.2 host-plane plugin needs the model catalog service.
Its `inject` should be:

A. `['remote']`
B. `['llm']`
C. `['apiProxy']`
D. `['connection']`

**Answer: B.** The host plane injects the domain service `llm`; `remote` is the Web
Client plane proxy (wrong injection leaves `pending (waiting for service: remote)`);
`apiProxy` was removed in 0.1.2. Source: DSH-0.1.2-A1-01 / task H1.

**Q6 (M) — Remote error flow.** About the alpha.2 Remote error flow
(DSH-0.1.2-A2-02), which statements are correct?

A. Error codes gained namespaces, e.g. `session-not-found` → `session/not-found`, `cancelled` → `gateway/cancelled`.
B. Cross-realm `instanceof RemoteError` distinguishes business failures.
C. `gateway/cancelled` should terminate or propagate the cancellation along the call chain — no retry, no generic error.
D. Business failures reject out of the call, so wrap every call in a defensive try/catch.
E. When re-throwing `result.error` upward, use `isRemoteFailure` for structural discrimination.

**Answer: A, C, E.** B misclassifies business failures vs local assembly defects
across realms; D is backwards — business/transport failures come back through the
`ok: false` branch, while rejects are assembly defects that should be surfaced.
Source: DSH-0.1.2-A2-02, rollup "Remote call error flow".

**Q7 (M) — install channels.** On the day an alpha cohort ships, CI installs of
`@deepseek-ai/*` fail. Which mechanisms are independent candidates?

A. Third-party mirrors (npmmirror etc.) lag fresh publishes by hours (E404/ETARGET).
B. pnpm 11's default `minimumReleaseAge` (24h supply-chain rule) refuses packages younger than one day.
C. A peer lower bound written as `^0.1.0-rc.8` does not match `0.1.2-alpha.2` under npm semver's prerelease rule (comparator must share the tuple and carry a prerelease).
D. The Node 24.0–24.11.1 loader-shape probe bug breaks installs.

**Answer: A, B, C.** D is the `dsh web` empty-client-graph bug (DSH-0.1.2-A2-04),
unrelated to installs. Source: rollup R-08.

**Q8 (T/F) — dependency-tree cold boot.** A plugin declares
`@deepseek-ai/dsh-util-time` in `optionalDependencies` but its `lib/index.js`
unconditionally imports it at top level. When npm skips the optional install,
static install and typecheck both stay green — only runtime crashes.

**Answer: true.** Declaration and use disagree; "installed successfully" ≠ usable —
the verification checklist must include a dependency-tree cold boot, not just
install success. Source: DSH-0.1.2-A2-03 field note.

**Q9 (S) — pnpm build scripts.** On pnpm 10+, a fresh environment refuses to build
a plugin's node-pty dependency. The correct remedy is:

A. `pnpm approve-builds --all` in the profile directory (and document it in the plugin README).
B. Switch to npm.
C. Add `minimumReleaseAge: 0` to the workspace.
D. `pnpm install --force`.

**Answer: A.** B violates "use the repository's only package manager"; C is the
R-08 supply-chain escape hatch for a different symptom. Source: migration-hygiene §4.

**Q10 (M) — naming profile.** About the external-plugin naming compatibility
profile, which statements are correct?

A. Compatibility errors are declarations rejected by the verified Harness/npm grammar.
B. Official short names (greet, metrics, hello, my-plugin, …) remain valid; publisher-aware prefixes are only collision recommendations (warnings).
C. The community coordinate `<namespace>/<plugin>` is an official field replacing the plugin ID.
D. When the local validator reports a warning, the published surface should be renamed automatically.
E. Events are shared channels — a same-name event conflicts only when publisher schemas are incompatible.

**Answer: A, B, E.** C — the coordinate is the community registry lookup key and
replaces no official field; D — renaming a published surface is a breaking change
requiring explicit authorization.

**Q11 (T/F) — registry states.** A central-registry query returning "no match"
means the name is globally available and safe to publish.

**Answer: false.** "No match" only means the reviewed index has no entry; timeout /
malformed data / network failure are unknown/not-checked; a discovery candidate is
not a reservation; a formal reservation exists only after a reviewed entry merges.
Report the four states separately.

**Q12 (M) — release semantics.** For a plugin version `0.2.0-beta.1`, which release
semantics are correct?

A. Publish to the `latest` dist-tag.
B. Publish to a declared non-latest dist-tag (e.g. next/beta) — prereleases never go to `latest`.
C. The GitHub Release tag must equal `v0.2.0-beta.1`.
D. The GitHub Release prerelease flag must match the version.
E. Before a stable publish, query the existing `latest` and refuse when the semver is lower.

**Answer: B, C, D, E.** A would auto-upgrade stable-host users to a prerelease with
incompatible peers. Source: plugin-release §4, rollup R-04 dist-tag note.

**Q13 (M) — LLM adapter protocol.** Which obligations are correct?

A. Emit the `usage` chunk before `finish`, and nothing after `finish`.
B. A terminal stop with no content blocks maps to `finish { kind: 'error' }` with `EMPTY_RESPONSE` — never silent success.
C. `reasoningTokens` is an extra counter on top of `outputTokens` and must be added when computing totals.
D. `inputTokens` already includes cache hits; `cacheReadTokens` is diagnostics only.
E. One adapter call equals one provider attempt — disable retries built into client libraries.

**Answer: A, B, E.** C — reasoningTokens is an informational subset already inside
outputTokens; D — inputTokens excludes cache, billable = input + cacheRead + cacheWrite.

**Q14 (M) — tool contract.** Which statements about a tool plugin's `execute()`
contract are correct?

A. `execute` returns one canonical JSON value; human explanation belongs in `output.render`.
B. `presentResult` projections may read session state and the clock, as long as they do not write.
C. Code Mode programs parse IDs like taskId out of the render prose.
D. In-flight work must stop when `exec.signal` aborts.
E. `defineTool` validates arguments, but constraints the DSL cannot express (nonempty strings, positive numbers, cross-field rules) must still be checked.

**Answer: A, D, E.** B — presentation projections must be pure functions of
args+result (they replay during log playback); C — Code Mode must return typed
handles, parsing prose is a hard error.

**Q15 (T/F) — waterfall.** A `ctx.waterfall` listener that receives `(…, next)`
and forgets to call `next()` **silently** short-circuits the whole chain.

**Answer: true.** Waterfall is around-middleware; omitting `next()` silently takes
over the flow — annotating/observing listeners must delegate.

**Q16 (S) — loader metadata.** In `cordis.yml`, `disabled: !!js process.env.SKIP`
results in:

A. Disabled according to the truthiness of SKIP.
B. Always disabled, regardless of the expression value.
C. Always enabled.
D. A parse error at load.

**Answer: B.** Loader metadata (id/name/group/disabled/inject/intercept/isolate)
must stay literal; `!!js` produces a truthy object, so `disabled` is always truthy.
JS expressions belong under plugin `config` only, with `!!js`, never `!js`.

**Q17 (M) — upgrade audit.** Which upgrade-audit disciplines are correct?

A. `git merge-base <from> <to>` must equal the from-commit; a drifted base halts the audit.
B. Format guards (SESSION_FORMAT_VERSION / SQLite SCHEMA_VERSION) that jump without a migration path are hard data breakage and go first in the report.
C. Sub-agent recon output can be written into the report as REMOVED findings directly.
D. A 20-commit interval should fan out all six recon planes to sub-agents.
E. Reverts get their own section.

**Answer: A, B, E.** C — recon output is a lead, not a finding: every REMOVED /
revert must be re-verified against both trees or marked inference; D — misjudging
scale (≤40 commits inline) is the main way audits go shallow.

**Q18 (M) — locale trap.** After the client product copy went fully localized
(rollup R-13), plugins anchoring host UI by display text fail silently (injection
disappears, no error). Which remedies are correct?

A. Prefer stable slot / data-slot anchors (e.g. `[data-slot="conversation.session.header.utilities"]`).
B. When text matching is unavoidable, cover all language variants and bound the length/scope.
C. After injecting, explicitly assert the injection actually rendered — make the silent absence observable.
D. Keep the English regex — the host default language is always English.

**Answer: A, B, C.** D is exactly the failure mode: button copy renders per locale
and the English regex stops matching.
