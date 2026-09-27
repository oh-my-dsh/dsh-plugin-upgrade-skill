# S2 · Negative Scan Report — @demo/dsh-minimal-llm (0.1.1-rc.2 style → dsh 0.1.2-alpha.2)

- Mode: **A · inspect (read-only)** per the plugin-upgrade skill. No file under the fixture was modified, created, deleted, or renamed; no install, migration, or package script was executed. No baseline suite was run (static copy, not executable) — "pre-existing: not collected".
- Corridor: dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.1 (28 cards, DSH-0.1.2-A1-*) → dsh-v0.1.2-alpha.2 (8 cards, DSH-0.1.2-A2-*), connected by the from→to index, not filename order. Exact tags from the API ledger: rc.2 b150a55 → alpha.1 cd5ef81 → alpha.2 0a53fb5.
- Method: pre-flight configuration/dependency inventory + the seven-class touchpoint scan (patterns from pre-flight-patterns.json, schema 1) + manual full-file review of all 5 fixture files (52 source lines total — the manual review is exhaustive, not sampled).

## 0. Identity and configuration inventory (pre-flight step 0)

- Package: @demo/dsh-minimal-llm, version 0.1.0, private, ESM ("type": "module"), main index.js. Not published (test fixture).
- Face: **ordinary Host-plane Cordis plugin**. No dsh.client key, no client bundle, no browser face.
- Composition: cordis.patch.yml — one insert row, id minimal-llm, name "@demo/dsh-minimal-llm". Packaging wiring: package.json declares dsh.bundle.patch = ./cordis.patch.yml and exports ./cordis.patch.yml.
- Dependencies: @deepseek-ai/dsh-host-apiproxy 0.0.1-rc.1 (the rc.2-era cohort of the package that owns the apiProxy service key).
- No lockfile, no node_modules, no .git in the static copy: actual resolved versions, install track, and Git SHA could not be verified and are recorded as "not collected". The from-version is pinned from the source comment (index.js:2 "0.1.1-rc.2 style") plus the dependency cohort; the real repository must confirm the exact from-tag.
- No dsh-plugin.json manifest (community-standard manifest not adopted).

## 1. Touchpoint checkup (@demo/dsh-minimal-llm, dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.2)

| Touchpoint | Hit | File/line | Applicable card | Confidence note |
|---|---:|---|---|---|
| #1 source patch / monkey patch | NO | — | (A1-03 listed, not applicable) | cordis.patch.yml and the dsh.bundle.patch key are profile composition, classified per API-08: "cordis.patch.yml is composition, not a source patch". A filename containing patch alone is explicitly not a hit for this class. |
| #2 internal events / persistent events | NO | — | none | No ctx.on, no SessionEvent, no session.append, no persisted events, no PTC/code-mode tokens. |
| #3 internal service probes / Remote | **YES** | index.js:3, index.js:9; package.json:17 | **DSH-0.1.2-A1-01** (required-if-hit); corridor-level R-05; A2-02 conditional only | Explicit service key injection plus a dot-domain call on the removed APIProxy face, plus the dead dependency row. See section 2. |
| #4 direct host directory reads/writes | NO | — | none | No fs calls, no DSH_HOME/path construction, no homedir(). |
| #5 internal UI / commands / tools | NO | — | none | No commands, tools, slots, views, client runtime, ModuleLoader, PLUGIN_ID. No Web Client face, so all client-plane cards (A1-25/26/27/28/29/30/32, API-10) are out of scope by face. Note: the composition row name already equals the bare package.json name ("@demo/dsh-minimal-llm"), which is what A1-26 requires — but that card governs client bundles, which this plugin does not have. |
| #6 custom HTTP / WS / RPC / DOM / CSS channels | NO | — | none | No server, socket, /api route, DOM access, or CSS injection. A1-08/A1-19/A1-28 not applicable. |
| #7 subprocess / stdout / stderr parsing | NO | — | none | console.error in index.js writes diagnostics; it does not spawn or parse any dsh subprocess (no child_process, no headless/--profile tokens). Writing to stderr is not stdout/stderr parsing. |

No-hit notes: scan scope = all 5 tracked files (README.md, package.json, cordis.patch.yml, index.js, src/session-notes.js); no node_modules/vendor/generated artifacts exist in the fixture; no lockfile exists to scan. Dependency/configuration surfaces were checked separately per step 0 (one dependency row, one composition row, one bundle-patch key) rather than only by source patterns.

Decoy check: src/session-notes.js has "session" in the filename but is a pure utility module (formatSessionNote, chunk) with zero imports and zero host-coupling surface — **genuine zero hits**; a filename-based scan would have over-triggered here, and the content review is the deciding evidence.

## 2. Hit touchpoints mapped to change cards

### #3 hit · apiProxy injection and call (index.js:3, index.js:9) — DSH-0.1.2-A1-01, action level required-if-hit

- Current evidence: index.js:3 export const inject = ["apiProxy"]; index.js:9 const providers = await ctx.apiProxy.llm.providers(); package.json:17 "@deepseek-ai/dsh-host-apiproxy": "0.0.1-rc.1".
- Old form: rc.2 APIProxy consumer — service key apiProxy (type ApiProxy, package @deepseek-ai/dsh-host-apiproxy), dot-domain call ctx.apiProxy.llm.providers().
- How it breaks on alpha.2: A1-01 deletes the @deepseek-ai/dsh-host-apiproxy package and the apiProxy service key entirely in alpha.1; there is no APIProxy identifier at the target. The entry's hard inject never resolves → the plugin sits at pending (waiting for service: apiProxy) / out of the boot graph, often without an explicit error (the silent-failure mode recorded in A1-25/A1-30 field notes).
- Target form (host plane): this plugin runs on the Host plane, so per the A1-01 field note and API-01 "Minimal correct patterns for Host", skip the Client gateway and inject the owning domain service directly:

      export const inject = ["llm"]
      export function apply(ctx) {
        ctx.effect(async () => {
          const providers = await ctx.llm.listProviders()
          // if only the configurable directory is needed: ctx.llm.listConfigurableProviders()
        })
      }

  A1-01 splits the old llm.providers one call into llm/listProviders + llm/listConfigurableProviders. Do NOT mechanically switch to inject: ["remote"] — remote exists only on the Client face; the host plane then reports pending (waiting for service: remote) forever (same symptom as discussion #5120 pain point #4). The generated declarations at the target tag are authoritative; confirm the listProviders return shape there before relying on it.
- Error handling: the existing catch (index.js:11-13) reads error.message and swallows the failure. A2-02 (RemoteError vocabulary, namespaced codes) applies only to ctx.remote consumers, which this host-plane plugin is not — but the corridor-wide lesson (API-02, A1-30 field note) is that swallowed call-site errors render failures invisible. Narrow the catch: log and rethrow, or at minimum stop treating every throw as a tolerable condition.
- Adjacent awareness, not a required change: A2-02 (RemoteError/RemoteResult vocabulary) becomes relevant only if the plugin is ever moved to a Web Client face; DSH-0.1.2-A2-05 (pluginInventory agentPresets) and A2-06 (ctx.remote.$host) touch surfaces this plugin never calls; DSH-0.1.2-A2-08/A2-03/A1-24 are packaging/cohort concerns for other dependency shapes.

### Dependency row (package.json:17) — corridor-level R-05 (inventory of removed-package consumers)

@deepseek-ai/dsh-host-apiproxy is one of the 5 packages removed in rc.2 → alpha.1 (with dsh-acp-demo, dsh-acp-snapshot, dsh-client-runtime, dsh-sdk-jsonrpc-demo); alpha.1 → alpha.2 removes none. The row is dead on the target cohort and must be removed in the same migration as the code change (removing the code but keeping the row leaves a stale rc.2-cohort package in the tree; removing the row without the code change is impossible since the code is the consumer). A plain-JS host plugin needs no replacement dependency — services arrive via inject; if the plugin later gains TypeScript, the owning domain package must become a direct dev/peer dependency.

### Packaging (package.json:11-15, cordis.patch.yml) — API-07/API-08 verification items, no card work needed

The insert row's name already uses the bare package name and the patch is a legal composition overlay. Verification item carried forward: the manifest declares dsh.bundle.patch, so after any re-pack, confirm the patch file itself is present in the packed artifact (API-07 row 4) — a recognized install with a missing overlay file fails later at Loader/dump time.

### Corridor net-state check (skill Mode C step 2)

The only cross-version revert in this corridor is SessionEvent.ignorable (removed A1-02, restored A2-01) — this plugin produces no SessionEvents, so no fold-back applies. Net state of the corridor for this plugin = a single-step replacement: apiProxy → llm domain service, dead dependency row removed. No remove-then-re-add sequencing exists.

## 3. Judgment: can the zero-hit categories prove compatibility with 0.1.2? — **No.**

Judgment: zero hits in six of seven categories does **not** establish compatibility, and in this specific case the plugin is provably **incompatible as-is** with 0.1.2-alpha.2, because the one hit (#3) is a required-if-hit breaking card (A1-01). Compatibility is a property of the whole plugin, not a vote among categories: one fatal hit outweighs any number of zero-hit categories.

Basis:

1. The pre-flight checklist states this explicitly: "This is a heuristic scan, not proof of compatibility. Zero hits across the seven classes only means 'not detected by the current patterns'; you must still check dependencies/configuration and run a build, a real mount, and functional smoke tests."
2. The card sets are curated, not complete: references/README.md — "curated means only the identified plugin-relevant changes are included, not a complete API diff"; and both card files close with the same warning that changes without cards do not prove the absence of API or behavior impact. An uncarded change can still break the plugin.
3. The seven classes do not cover the surfaces where this plugin's remaining coupling actually lives: the dead dependency row (packaging/install-channel: A2-03, A1-24, R-01, R-08 — all "Touchpoints: none" surfaces), the composition row's mount semantics (provable only via --dump-config on a real profile), and bundle-artifact presence (API-07). A plugin could be zero-hit on all seven classes and still fail to install, resolve, or mount.
4. Failure modes in this corridor are frequently silent: pending rows without explicit errors (A1-25, A2-08), catch-swallowed errors rendering blank surfaces while smokes stay green (A1-30), typecheck-silent rendering crashes (A1-29, typecheck needed skipLibCheck:false to expose dependency ownership). Absence of a detected static hit cannot rule out a silent runtime break.
5. In this concrete case the scan's own result refutes the hasty conclusion: the plugin is tiny and six classes are clean, yet it is not compatible with the target without migration. That is precisely the trap this fixture was built to test (fixture README: the correct approach is card-by-card checking plus the statement that zero hits ≠ compatible and real verification is still required).

What the zero-hit categories DO establish (their real value): they bound the migration scope. No client face (so the entire Web Client card family — A1-25/26/27/28/29/30/32 and API-10 — is out of scope by face), no event surface (the A1-02→A2-01 ignorable net-state fold is unnecessary), no filesystem, no custom channels, no subprocess parsing. The complete migration is the one card (#3/A1-01) plus the dead dependency row. That is scoping evidence, not compatibility proof.

What is still needed before any compatibility conclusion (the layered validation ladder; these are the mandatory post-migration steps, deliberately not executed in this task):

1. Dependency resolution: after removing the dead row, install against the exact 0.1.2-alpha.2 cohort with a single package manager; scan the full lockfile for old-cohort rows; no mixed old/new peers (a successful install with mixed peers is not a migration).
2. Static: build/typecheck against target-cohort declarations with real types (no implicit any; one skipLibCheck:false pass on first migration).
3. Card-level unit test for the #3 hit: the migrated ctx.llm.listProviders() path covers the success branch, one business failure, and cancellation (A1-01 verification requirement); no catch-swallowing that turns failure into silent no-op.
4. Runtime: isolated-profile cold boot at the pinned target tag (dsh --profile <p> --dump-config shows the minimal-llm row, correct name, nothing pending; then a real cold boot with the entry active, no pending rows, no service-unavailable loop). A keyless mount smoke (pack → fresh scratch profile → headless/web boot) is sufficient and needs no credentials.
5. Behavior: execute the plugin's one core path — llm providers listing succeeds on the target host.
6. Wrapper layer: not applicable (no subprocess surface).

Only after those layers pass does "compatible with 0.1.2-alpha.2" become a supportable conclusion — and even then the API ledger's own caveat applies: the 0.1.2 final release is not tagged, so the conclusion must be re-verified against the final tag when it ships.

## 4. Recommended minimal migration plan (plan only — not executed, per Mode A and the task scope)

1. index.js: inject ["llm"]; replace ctx.apiProxy.llm.providers() with ctx.llm.listProviders() (or listConfigurableProviders() if the configurable directory is the actual need); keep the console marker but stop swallowing errors — rethrow after logging.
2. package.json: delete the @deepseek-ai/dsh-host-apiproxy dependency row; keep everything else (exports, dsh.bundle.patch, ESM markers) unchanged; bump the plugin's own SemVer separately from any DSH version (never adopt the host version as the plugin version).
3. cordis.patch.yml: unchanged (row name already equals the package name).
4. Do not adopt any capability card (A1-09/A1-10/A1-11) — none intersect this plugin's touchpoints, and capability cards are suggestions only.
5. If the deployment must span rc.2 and alpha.2 hosts simultaneously, R-02 cross-cohort rules apply (runtime probe of the service surface, no hard inject of a cohort-specific key) — out of scope unless dual-cohort operation is actually required.

## 5. Skipped / not applicable (with evidence)

- All client-plane cards (A1-25, A1-26, A1-27, A1-28, A1-29, A1-30, A1-32, API-10): plugin has no Web Client face (no dsh.client, no client bundle).
- A1-02/A2-01 (SessionEvent.ignorable): plugin produces no SessionEvents.
- A1-04, A1-13, A1-21 (filesystem/profile paths): no fs or path usage.
- A1-05, A2-04, API-06 (headless/stdout/stderr): no subprocess usage.
- A1-06/CFG-01 (PTC rename): no code-mode tokens.
- A1-08, A1-19 (channels/web acceptance): no channels, no client acceptance surface.
- A1-20 (user-questions), A1-22 (isTokenDelta), A1-31 (subagent descriptor), A2-10 (settings), A2-05 (plugin inventory), A2-06 ($host), A2-08 (sessionProjections peers), R-11 type-surface drift: none of these surfaces appear anywhere in the source (the plugin imports nothing from any @deepseek-ai package in code — its only DSH couplings are the runtime inject key, the dependency row, and the composition row).
- A1-12/A1-23 (privacy/composition defaults): informational for deployments, no plugin-code action.

## 6. Pending / residual risk

- Resolved versions and install track unverifiable from the static copy (no lockfile, no .git); the from-tag pin rests on the source comment plus the dependency cohort — confirm against the real repository before migrating.
- Curated card coverage: uncarded plugin-facing changes in the corridor cannot be ruled out by this scan (see section 3, basis 2).
- The 0.1.2 final release is untagged; exports, types, and behavior must be re-checked at the final tag before any compatibility claim is promoted to final.
- No build/typecheck/runtime evidence exists yet for either cohort; every compatibility statement above is static-read evidence only.

## 7. Rollback

No writes were performed by this task to the fixture, the skill, the benchmark repository, or anywhere else outside the designated output directory. Rollback = nothing to undo. For the future migration, record the baseline (HEAD, lockfile, resolved versions, file hashes) before any change per the skill's Mode C step 0 and R-06.

## Bottom line

- Hit: touchpoint #3 only — one breaking card (DSH-0.1.2-A1-01, required-if-hit) plus one dead dependency row (R-05). The plugin is **not compatible with 0.1.2-alpha.2 as-is**; the minimal migration is small (two files, one service-key swap, one dependency removal).
- No-hit categories (#1, #2, #4, #5, #6, #7): they bound the migration scope but **cannot prove compatibility** — the scan is heuristic, the cards are curated rather than a complete diff, the remaining coupling surfaces (dependencies, composition, packaging) sit outside the seven classes, and this corridor's characteristic failures are silent at static-scan time. Compatibility requires the validation ladder: dependency resolution → static → card-level tests → isolated-profile cold boot → one functional path.
