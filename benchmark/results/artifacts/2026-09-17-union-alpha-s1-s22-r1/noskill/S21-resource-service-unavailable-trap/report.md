# S21 — Resource service unavailable: read-only diagnosis

## Conclusion

The session-scoped tab fails in the built-in runtime file-resource provider/Remote chain, not in basic sidebar tab creation or static module serving. The title proves that an address was claimed and a tab mounted; it does not prove metadata or file content was read. The contrast probe localizes the failure to the documentpreview → client resource provider → api-workspace-files Remote path. The exact missing activation, registration, lookup, or transport step remains unproven by this evidence.

No fixture or benchmark repository files were changed. No migrations, installations, restarts, network requests, or plugin modifications were executed. This report is an analysis and proposed recovery plan, not a claim that the deployment has been repaired.

## 1. Attribution and the two readers

Evidence: symptom-log.txt and contrast-probe.txt in E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S21-resource-service-unavailable-trap/environment/fixture/.

- The same E:/deepseek-harness/test-lhh010/.dsh/tmp/sidebar-open-test-2.md is readable through file-trace's own host RPC, in both 原文 and 阅读 modes, at the same moment that documentpreview fails through api-workspace-files Remote.
- This establishes that the file exists and is readable through that independent host path. It argues against corrupt/missing file content, a general filesystem outage, or a universal Markdown-rendering failure. It does not establish that the built-in Remote is registered, authorized, connected, or using the correct session lookup: the two readers use different transports and service bindings.
- The failing metadata remains at meta.status = 'none'. Metadata never becomes available to the tab; this is earlier than a successful metadata result followed by a content-page or renderer failure. It is not evidence of a returned ENOENT, unsupported format, or a completed read carrying an error. No captured HTTP trace identifies a specific server request failure, so the exact handoff must be investigated rather than invented.
- The workspace-files host bundle row and client manifest row both exist. The client row declares gateway and client-resources dependencies. Presence in configuration or manifest is not proof of runtime activation, provider registration, successful injection, or Remote readiness.
- The host resolves a session workspace through sessions.get(sessionId)?.header.cwd with sandboxPolicy.workspaceRoot as fallback. The fixture explicitly says the host read API permits files outside that root. Neither the test file being under .dsh/tmp nor a blanket workspace-containment rule explains the failure.

Separate the absolute-address dialog from this content failure. In alpha.2, documentpreview accepts parsed file addresses with session scope only. An absolute-scope dsh-resource address can therefore have no tab claimant even though the host file API itself permits external paths. Address-claim eligibility is distinct from filesystem permission. Rewriting scope is not a repair for a session-scoped tab whose metadata remains 'none'.

## 2. Probe discipline

Evidence: combo-probe.txt, boot-manifest-excerpt.txt, discussion-excerpt.txt.

The single manifest URL returning HTTP 200 and the individual sweep returning 62/62 HTTP 200 are valid observations of static artifact availability at the tested URLs/revisions. They do not prove JavaScript execution, registration, dependency readiness, or business-service health.

The manually constructed 62-module URL is not a loader-equivalent probe. It is approximately 4–5 KB long and combines the entire roster while reusing one revision. It may violate URL/chunk limits or the server's accepted ordered-list/revision mapping. Its 404 establishes only that this synthetic request was not served; it must never be cited as “modules missing.” The evidence does not identify which request validation or routing condition returned that 404.

The loader uses the boot-provided URLs/revisions and dependency ordering, fetching bounded combo batches rather than blindly joining the entire roster into one request. Reproduce actual Network-panel requests or fetch individual manifest entries, preserving the advertised revisions. A local installed-artifact inspection corroborates this design: dsh-client-modules partitions phase records into bounded combos, and the client uses a row's initialUrl (or its HMR reload URL), sharing in-flight transport for rows in the same batch. This local checkout is not independently version-verified against the recorded incident; its exact constants must not be promoted to historical facts.

Do not conflate the prior alpha.1 incident with alpha.2. In discussion #5999, newly listed modules really returned 404 individually at the advertised revision and registration failed. In alpha.2 the individual sweep succeeds and the document tab mounts: a related deployment history, but narrower current failure.

The manifest excerpt says 60 entries while the probe says 62. Preserve that discrepancy and request the complete same-boot manifest and probe input. Do not silently reconcile their counts or infer two missing modules.

## 3. Distractors and version changes

Evidence: console-excerpt.txt and boot-manifest-excerpt.txt.

The repeated dsh-paste-input warnings concern parsing/folding historical paste-attachment message blocks. They belong to a separate message-bubble presentation path, not the built-in file-resource read path. Nothing in the evidence connects them causally to missing file metadata. Track them independently; suppressing or fixing the warnings is not a content-read remedy. Absence of red console errors does not prove service readiness: the UI explicitly renders a normal unavailable-state message.

The missing ui-sidebar-textpreview roster name is expected: alpha.2 replaced it with ui-sidebar-documentpreview. That change explains the old name's absence and the narrower session-only claim behavior. It does not explain away the failing session-scoped read. All six external plugins are listed; neither their roster presence nor the warnings establishes that an external plugin caused the resource-provider failure.

## 4. Mitigation decision and order

1. Preserve cheap evidence (versions, boot revision, manifest and relevant logs), then perform a clean host stop/start and reload the browser page to obtain a fresh boot roster. Verify the browser is connected to the intended restarted process; retest the same session-scoped file through both readers. This is the first cheap recovery step, not a guaranteed fix: a restart once healed alpha.1's roster/combo mismatch but did not heal its content-read failure, and alpha.2 already reproduces after a restart.
2. If still broken, use the documented escape hatch: roll back to the previous known-working published version, 0.1.3-alpha.2, then restart and verify. The fixture records that rollback as verified in the earlier incident; it does not record a rollback performed during this analysis. Back up the old profile/configuration and preserve evidence before any maintainer-side change. Do not execute migrations or speculative reinstalls in this read-only task.
3. Report the remaining built-in runtime failure upstream, extending discussion #5999 / round-2 comment 18371079 with correlated evidence. If a clean-profile comparison is undertaken later, use a separate profile and retain the original profile untouched so an upgrade-state defect remains reproducible.

Do not rewrite file-trace, add blind retry loops, monkey-patch documentpreview, or silently fall back to another service to hide the failure. The plugin's own reader already works; replacing the broken built-in path would conceal a host readiness defect and potentially change permissions, scope, lifecycle, or error semantics. Its existing panel can remain an explicitly identified temporary way to view the file, not an automatic substitute presented as a repaired sidebar. A missing provider is not made ready by repeatedly reading it.

## 5. Upstream forensics and prevention

A complete report should include:

- Exact old/new dsh and Node/npm versions; Windows version; resolved global install/executable path; profile creation history; six external plugin versions, junction targets, and sanitized effective bundle/profile configuration.
- Clean stop/start timestamps, boot/process identity and revision, complete startup logs, browser reload/cache state, and complete boot manifest from the failing page. Explain the 60-versus-62 count discrepancy.
- Actual loader requests/HAR with URL, ordered module list, revision, status and response size; separately label individual sweep results and the invalid synthetic mega-combo result. Include any registration/dependency-wait diagnostics rather than equating HTTP 200 with activation.
- One minimal session-scoped file repro, session ID and effective workspace root; the absolute-scope counterexample kept separate; tab title/message and persistent meta.status = 'none'; same-time file-trace success and sidebar failure.
- Runtime state of gateway, client-resources, workspace-files host and client halves, file-resource provider registration, Remote binding/subscription and typert session-workspace lookup. Capture whether metadata requests are emitted, arrive, and settle, with correlated client/server errors and appropriate secret/path redaction.
- Separate paste-input warnings, the package rename and session-scope change, restart/rollback outcomes, and the prior discussion linkage. Distinguish observed evidence from hypotheses such as stale profile state or an injection failure.

Boot/readiness checks should verify the effective expected chain, not merely list package names: advertised artifacts at their exact revision; executed module registration; required dependency resolution; activated workspace-files provider and gateway binding; file-resource handler availability to the preview consumer. Surface unresolved dependencies and the owning provider explicitly instead of printing a healthy “ready” based only on the web listener. A bounded, read-only readiness/metadata smoke against a controlled valid session can validate the composed path after startup without scanning user files. Report an unavailable service differently from a file-not-found or permission error.

The preview should expose a persistent 'none' state as an actionable diagnostic, naming the missing/unready capability and recovery route, rather than leaving a titled tab with only a generic unavailable line. Add regression coverage for an upgraded older profile, dependency/provider absence or delayed activation, independent static-serving success, and session-versus-absolute address claims. Missing dependencies should fail loudly or show explicit waiting; no hidden fallback should mask the defect.

## Inspection limits

All seven fixture files and the instruction brief were read in full. Additional read-only grounding inspected installed dsh-client-ui-sidebar-documentpreview/lib/client.js (the unavailable branch checks meta.status === 'none') and dsh-client-modules/lib/index.js and lib/client.js (bounded combo generation and boot-URL fetching) under C:/Users/lhh/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/. These artifacts were not verified as the incident's exact installed build and do not replace fixture evidence. One attempted lookup of an assumed dsh-client-loader package failed because that directory does not exist; the actual dsh-client-modules artifacts were then located and read. No live incident reproduction or repair was attempted. The remaining blocker to exact root-cause identification is the absence of same-boot provider activation, Remote traffic and session-lookup diagnostics, not a lack of authorization to write this report.
