# S21 · The Resource Service That "Unavailable" — Attribution Report

Mode: A · inspect (read-only evidence analysis; no files changed in the fixture). Skill: plugin-upgrade, corridor 0.1.5-alpha.1 → 0.1.5-alpha.2 (references/v0.1.5-alpha.2.md).

## 1. Attribution

**Primary attribution: the built-in Host/Web Client resource-provider and workspaceFiles Remote activation path is unavailable; the evidence does not identify its exact broken dependency.** This is a host runtime/composition investigation, not evidence that file-trace needs a rewrite.

- The session-scoped link is claimed, a document tab mounts, and its title renders. This proves the sidebar registration/opening path works for that address; a title can be derived from the address without reading file metadata or content.
- contrast-probe.txt compares the exact same file at the same moment. file-trace's own HTTP/RPC face reads it in both 原文 and 阅读 modes. That rules out a missing/unreadable file as the common explanation and shows that independent transport works. It does **not** prove the built-in Remote is registered, its dependencies active, its session lookup resolved, or its composed filesystem policy identical.
- The failing tab's meta.status remains 'none', rather than reaching a ready value or a concrete read error. The resource metadata never enters the normal stat/read flow. The likely stall is at provider availability/selection or activation of its Remote dependencies, before content rendering. This is not evidence of a Markdown parser problem, a slow content response, or an explicit filesystem denial. Capture actual request/activation traces to locate the exact break; the evidence is not a server stack trace.
- boot-manifest-excerpt.txt lists api-workspace-files with gateway/resources dependencies; contrast-probe.txt also confirms its Host bundle row. Neither declaration nor HTTP 200 proves Cordis activation. Check the client 'resources', 'remote', and 'remote.workspaceFiles' dependency chain, file-provider registration, Host workspaceFiles dependencies, and the Typert workspaceFileScope lookup. The lookup resolves sessions.get(sessionId)?.header.cwd with the sandbox root fallback. Do not infer a missing row and manually insert duplicates.

**Separate address-claim failure:** the document tab in alpha.2 accepts only parseFileAddress(address)?.scope === 'session'. The old absolute-scope link is therefore rejected before any read. Alpha.2 routes even out-of-workspace absolute paths through a session-scoped address; absolute scope itself no longer authorizes a Host call. This does not mean all outside-workspace file reads are forbidden. The session-scoped test under .dsh/tmp still fails, so workspace containment cannot explain the resource-service symptom. Fix confirmed legacy address construction as its own compatibility task, not as a supposed cure for meta.status 'none'.

The README summarizes the absolute dialog as an alpha.1 symptom whereas symptom-log.txt includes it after the alpha.2 restart. Retain that timeline discrepancy in upstream evidence. The alpha.2 scope rule explains the supplied absolute address regardless; it does not erase the independent session-scoped failure.

## 2. Probe discipline

Probe 1 (the advertised single-module gateway URL) and Probe 3 (62 individual advertised module URLs, 62/62 HTTP 200) are valid static-serving measurements for those URLs/revisions. They show that those artifacts are individually retrievable, not that they register or activate successfully.

Probe 2 manually joins all 62 modules into one approximately 4–5 KB URL and gets a zero-body 404. This is not a valid replay of the loader's request strategy. The real loader fetches its roster in bounded, URL-length-limited combo batches, not one arbitrarily long all-roster URL. A long synthetic request can hit combo/request-size or routing constraints. The supplied response does not establish the precise server rejection reason. It must **never** be cited as “modules missing,” especially against 62 successful individual requests. Preserve the actual loader batch URLs in a Network capture and replay those with their original revision to test loader-serving equivalence.

The boot excerpt says 60 entries while the sweep reports 62. Do not silently reconcile or invent the two extra modules: collect a contemporaneous complete manifest and probe list with timestamps/revision. The count discrepancy limits exact cross-capture comparison, not the meaning of each successful request.

The prior alpha.1 incident had genuinely discriminating evidence: new modules 404 and old modules 200 at the same revision, followed by registration failures for every client plugin. That is unlike this round's individually available modules and working document-tab mount. Do not copy the old “missing combo module” diagnosis into round 2.

## 3. Distractor separation

The repeated dsh-paste-input “fold skipped (parse failed)” warnings concern parsing historical attachment-message markers and collapsing message bubbles. The captured examples even contain prose discussing the marker protocol. They do not demonstrate a failure of the workspaceFiles Remote or the document tab's resource provider. Treat any fold/parser issue separately; do not change attachment protocols, clear history, or blame that plugin for the missing metadata. No red sidebar errors is compatible with a silently unavailable dependency/provider; it is not proof of healthy activation.

The roster's absent ui-sidebar-textpreview is intentional: alpha.2 replaces it with ui-sidebar-documentpreview in the bundle. The tab type changes from the old text type to the session-scoped document type. This explains why searching for the old package name is misleading and why the old absolute address is unclaimed, but **not** why a claimed session-scoped document tab has no metadata. All six external plugins are present in the supplied roster evidence. Presence is not a full compatibility certification, but no supplied fact singles one out as causal.

Relevant cards: DSH-0.1.5-A2-01 (scope lookup and provider dependencies), A2-02 (outside-workspace reads), A2-09 (preview package rename), A2-14 (removed resource reload API). A2-21 is optional preview extensibility, not an instruction to implement a replacement reader. Historical DSH-0.1.5-A1-20 provides the restart/rollback precedent, not a proven round-2 root cause.

## 4. Mitigation decision and order

**Do not rewrite the plugin, add blind retries, add a hidden filesystem/RPC fallback, or hand-insert built-in workspace-files/sidebar bundle rows.** None restores an unavailable provider; fallback would mask the host defect and may change authorization semantics. The independent file-trace panel may remain an explicitly separate way to view the file, not a transparent replacement for the broken built-in chain. Alpha.2 also removed ResourceSnapshot.reload: do not resurrect an obsolete API as a speculative repair.

1. Preserve the current small evidence set, then try one **full host stop/start followed by a browser hard refresh** as the first cheap action. A refresh alone does not rebuild the host roster. Verify the actual host process/version/revision and rerun the session-scoped read contrast. Prior art establishes that a restart healed static roster serving once, not that it healed metadata. The fixture already records a restart and continuing failure; do not cycle indefinitely or claim that the initial restart succeeded end-to-end.
2. If the resource metadata still stays 'none', retain the diagnostics and use the **previous published 0.1.3-alpha.2** as the documented escape hatch. The supplied discussion says that rollback was verified in this deployment; it is a historical observation, not a rollback executed in this analysis. Do not choose an unverified alpha.1 “fix” merely because it is adjacent; alpha.1 also exhibited the failure family.
3. Perform any global host reinstall/rollback only **outside the running DSH session**, after fully stopping all DSH processes, from an external terminal using the exact pin: npm i -g @deepseek-ai/dsh@0.1.3-alpha.2. Restart dsh web and hard-refresh afterward. Never run npm-global replacement from the host it would replace; never manually copy package files or regenerate shims. Preserve the current profile/configuration and persistent data before rollback. Older readers may reject newer Session events/formats; this escape hatch does not promise downgrade readability. Test with a separate compatible profile/session and keep newer data untouched for return to the newer host.
4. Append the round-2 evidence upstream to discussion #5999, comment 18371079, clearly separating the repaired/absent static-serving problem from the continuing resource-chain failure. Do this before making speculative source/configuration changes. This report only prepares that submission; no external service was accessed and nothing was posted.

A successful mitigation requires more than a titled tab or 200 response: the provider registers, required services activate, metadata leaves 'none', and the session-scoped file's actual content renders. Recheck an outside-workspace path encoded in session scope separately from the expected rejection of legacy absolute scope.

## 5. Prevention and upstream forensics

A complete, sanitized upstream report should contain:

- Exact Windows, Node, npm, installed DSH package/build versions and resolved installation path; upgrade command/channel and restart timeline; profile origin (0.1.2/0.1.3) and all six external plugin identities, versions, junction targets, and dependency cohorts. Keep plugin release versions separate from the host corridor. The fixture supplies Windows 11, npm-global and host versions, but not the other exact identities.
- A same-boot full __DSH_BOOT__ roster and revision, relevant resolved composition rows (read-only), artifact paths/hashes and package versions for gateway, resources, workspace-files, sidebar-right and documentpreview. Resolve the 60-versus-62 discrepancy without discarding either original observation.
- Actual loader-generated bounded batch URLs, status/body length, requested module membership and registration outcome; same-revision individual probes with timestamps. Label the oversized synthetic 404 as an invalid loader-equivalence probe. Supply response details if diagnosing its rejection reason separately.
- The exact session-scoped and absolute resource addresses, session root and relevant lookup result, minimal file content/size or non-sensitive reproduction file, and expected/actual behavior. Capture the successful file-trace own-RPC read beside the failing built-in Remote path at the same time. Record metadata transitions, provider selection, whether stat/read requests are issued, and any Remote error code or absence of request.
- Host and Client Cordis activation/waiting diagnostics for workspaceFiles, resources, gateway/Remote and remote.workspaceFiles; the registered file provider, Typert workspaceFileScope lookup registration/resolution, and required Host dependencies (fs, sandboxPolicy, sessions, typert). A declared bundle row is not an activation trace. Include focused browser Network/Console and host startup diagnostics; redact tokens, cookies and private paths/content, and do not dump credentials or Session logs.
- Reproduction outcomes before/after one cold restart and hard refresh, and rollback results if undertaken; where practical compare a clean stock profile with the aged junction-linked profile in a separately authorized reproduction environment. This distinguishes profile-dependent composition from a universal host regression without editing the failing profile. Keep paste-fold reproduction separate.

**Fail-loud host checks:** reconcile the advertised roster/revision with artifacts through the same bounded batching used by the loader; separately require registration acknowledgements and expose activation/waiting dependencies. After activation settles, verify that the enabled built-in document preview has a registered 'file' provider, that its Remote exists and the Host workspaceFiles service/lookup is registered. If a required chain remains pending, report the precise missing dependency/provider and affected tab instead of silently claiming readiness. Do not fail optional unrelated services merely for being absent.

At boot there may be no selected session, so session-specific lookup and stat/read health must also be checked when a session/tab becomes available (or through a controlled non-sensitive smoke fixture). Make an unresolved lookup, unavailable provider, loading state, and actual Remote read error distinguishable in both UI and diagnostics. Log a focused diagnostic once rather than flooding the console. Add regression coverage for aged-profile upgrades, dependency/provider absence, delayed activation and recovery, same-revision artifact/registration mismatches, session-scoped in/out-of-workspace reads, and legacy absolute-scope rejection. An end-to-end preview assertion must verify metadata **and content**, not only a tab title.

## 6. Completion, limits, and rollback record

**Pre-existing:** not collected as a mechanical Mode C baseline. This is Mode A; the supplied failures are observations, not new failures caused by this analysis.

**Completed:** read the task instruction and all seven fixture files; analyzed the alpha.1 → alpha.2 corridor using the targeted A2 cards above and the A1-20/troubleshooting precedent; separated static serving, activation, address claim, resource metadata and content; wrote this report incrementally. No migration, installation, package script, runtime restart, source change or upstream posting was performed. Evidence claims about HTTP and UI behavior are supplied observations, not newly executed probes.

**Skipped:** source-patch inventory, builds/typechecks/tests, full seven-touchpoint migration and SemVer changes are inapplicable to this read-only symptom report with no plugin source checkout supplied. No optional preview capability was adopted. No live-host inspection was substituted for the historical target: the current harness need not equal the affected alpha.2 installation. Git branch/HEAD/dirty state, submodule and lockfile baseline were not collected because the inputs are an evidence pack, not the target source/installation.

**Pending/residual risk:** exact failure within the built-in resource/Remote dependency chain; target installation identity/Node version/plugin versions and lockfile cohort; runtime activation/request traces; matching manifest/probe counts and exact timeline; exact reason the oversized synthetic URL was rejected. The bounded-loader explanation should be confirmed against target loader Network requests/source in upstream reproduction; no exact byte threshold is asserted. These limits prevent naming a specific broken line, not the higher-level attribution. Nothing here proves all external plugins compatible or a universal alpha.2 defect.

**Rollback:** only this report was written. Fixture and benchmark repository remain unchanged; there are no analysis-owned runtime changes to undo. No target configuration hashes or persisted-data backup were supplied. The external pinned rollback above is a recommendation supported by prior evidence, with no promise to reverse third-party install-script effects or make newer persisted data readable by an older host.

**Recommendations:** prioritize Host activation diagnostics and an end-to-end resource read regression upstream. Keep any separately confirmed legacy-address migration and paste-fold repair in distinct work items.

Evidence root: E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S21-resource-service-unavailable-trap/environment/fixture

Skill reference root: E:/deepseek-harness/dsh-plugin-upgrade-skill/skills/plugin-upgrade/references

Primary local references: v0.1.5-alpha.2.md (A2-01, A2-02, A2-09, A2-14, A2-21); v0.1.5-alpha.1.md (A1-20); troubleshooting.md (duplicate built-in insertion warning).

Upstream destination, supplied by the evidence (not fetched): https://github.com/deepseek-ai/deepseek-harness/discussions/5999#discussioncomment-18371079
