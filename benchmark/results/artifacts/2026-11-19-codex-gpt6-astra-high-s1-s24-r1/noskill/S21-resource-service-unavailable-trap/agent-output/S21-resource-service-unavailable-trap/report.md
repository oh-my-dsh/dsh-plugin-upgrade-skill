# S21: resource-service-unavailable attribution and response

## Scope and evidence

This is a single, read-only analysis of the seven supplied fixture files. No skill was read or used. No host restart, install, migration, network request, live reproduction, or fixture change was performed. The probe results below are supplied observations, not measurements repeated by this analysis.

## 1. Attribution: distinguish claiming a tab from reading a resource

The absolute-address dialog and the session-address content failure occur at different boundaries.

* The absolute address has no claimant because alpha.2 replaces ui-sidebar-textpreview with ui-sidebar-documentpreview. The old text type claimed dsh-resource://file/**; the replacement accepts only parseFileAddress(address)?.scope === 'session'. This explains rejection before a tab opens. It does not establish a filesystem-access prohibition: the workspace-files read documentation explicitly allows files outside the workspace.
* The session-scoped test address is accepted and a correctly titled document tab renders. Sidebar registration, session-address claiming, and enough UI execution to mount that tab therefore work. A title can come from the address; it does not prove that file metadata or bytes were retrieved.
* For this same file at the same moment, file-trace's independent /dsh-file-trace/* host RPC reads successfully in both modes, while documentpreview's api-workspace-files Remote leaves meta.status at 'none'. This localizes the failing path to the host's workspace-files/resource-provider/Remote service chain used by documentpreview, rather than the file-trace integration or a generic inability to read the file. The file exists and is readable through at least one host path; moving it into .dsh/tmp or rewriting its content is not supported as a remedy.

The 'none' metadata state means the tab has not obtained resource metadata; it stalls before a successful metadata/content acquisition, not merely during Markdown rendering after content delivery. It is consistent with a service/provider that is unavailable, unbound, or not propagating readiness/results. It is not proof of a particular missing injection, failed RPC endpoint, or lookup defect. The manifest lists workspace-files with gateway/resources injections, and the host bundle patch includes workspace-files. Those declarations do not prove runtime service registration or successful wiring. Session-root lookup uses sessions.get(sessionId)?.header.cwd, with sandboxPolicy.workspaceRoot fallback; its runtime result remains worth checking, but the evidence does not show that it is wrong.

The contrast does not prove that both readers have identical authorization, normalization, transport, or initialization behavior. It rules out a universal file/host-read failure and rules in investigation of the differing resource path; it cannot isolate the exact broken hop. Silence in the console is an observability gap, not evidence of a healthy provider.

## 2. Probe discipline

The boot manifest's actual first URL returning 200 and, more decisively, the individual sweep returning 62/62 HTTP 200 are valid evidence that the tested static artifacts are served at those URLs/revisions. They do not prove that the JavaScript evaluates, registers services, or completes RPC/resource reads.

The synthetic URL concatenating all 62 modules into a roughly 4–5 KB request is not a valid missing-module test. Its zero-body 404 concerns that constructed request, which changes length, grouping and revision context. Route parsing, request-length limits, supported combo grouping or revision handling may account for it; the pack does not identify which. Never describe it as “modules missing” when every independently tested module returns 200.

Follow the loader's manifest-directed requests: the roster supplies explicit /plugins/??...&rev=... URLs and dependency/injection information, rather than authorizing an arbitrary all-roster join under the first entry's rev. Reproduce actual loader requests and their supported grouping/chunking from a network trace. The supplied excerpt demonstrates individual manifest URLs but contains no loader implementation or complete trace, so exact batching limits, scheduling and grouping algorithms cannot be certified here.

The earlier alpha.1 discussion describes genuinely discriminating failures: new modules were 404 while old modules were 200 at the same revision. That historical roster/combo mismatch is not demonstrated by the current 62/62 result. A restart previously healed static roster inconsistency yet left resource reads broken, reinforcing the separation.

## 3. Distractors and roster changes

The repeated dsh-paste-input warnings concern parsing historical attachment-message blocks for bubble folding. They are not workspace-files Remote failures. The fixture says the attachment protocol and directory chain were independently verified. Treat folding as a separate parsing/display issue; the simultaneous warnings provide no causal evidence for unavailable resource metadata. Capture a sanitized representative message for that issue separately if needed.

The absence of ui-sidebar-textpreview is explained by its replacement with ui-sidebar-documentpreview in alpha.2 and the corresponding bundle-patch change. It is not, by itself, a missing-installation diagnosis. Its narrower session-only claim explains the absolute-link rejection, but cannot explain the session tab's unavailable-service state after a successful claim. All six external plugins are reported present; mere presence is neither proof of service health nor proof that an external plugin caused the failure.

## 4. Ordered mitigation decision

1. Preserve the failing boot's logs, manifest, revisions and request trace. The first cheap recovery step is a clean host stop/start and fresh browser load so stale host/roster/client state can be eliminated, then repeat the same two-reader comparison. A restart already occurred in the supplied timeline; do not present restart as an untried guaranteed cure or repeat it indefinitely. The prior report specifically shows that restart can fix one layer while leaving this one broken.
2. If content remains unavailable, use the previously verified rollback escape hatch, @deepseek-ai/dsh@0.1.3-alpha.2, after preserving the profile/configuration and plugin junction inventory. That version is the supplied verified fallback; the immediately preceding alpha.1 already exhibited this failure family. Do not claim that rollback has been executed or that this current profile has been retested under it. Installation/rollback is outside this read-only task.
3. Send the separated alpha.2 findings upstream, cross-referencing discussion #5999 and its round-2 comment 18371079. Ask for diagnosis/fix of service initialization and metadata delivery, and report absolute-address claiming compatibility as a distinct issue. Keep the paste-fold warning separate.

Do not rewrite the plugin around the host's unavailable service, silently route documentpreview through file-trace, relabel absolute paths as session paths, or add blind retries as the primary fix. Such changes would obscure the broken contract and could change authorization or address semantics. File-trace's already-working panel is a temporary manual way to inspect content; it need not become a competing resource backend. A clear unavailable-state message and an explicit retry after a known service-ready event can improve host UX, but retry is not a substitute for repairing initialization. No plugin source change is justified by this pack.

## 5. Complete upstream forensics and prevention

Attach or collect, with secrets and unrelated file contents redacted:

* Exact before/after dsh versions, Windows/browser/Node/npm versions, global package/executable resolution and actual installation path; the npm-global upgrade method, old-profile lineage, restart sequence, and six external-plugin versions plus junction targets. The latter details are requested forensics, not all present in this fixture.
* The full failing __DSH_BOOT__ roster, revisions, complete served URLs, bundle patch and relevant injection/service declarations. Preserve the per-module status/body-length results and distinguish them from the invalid joined probe. Include an actual boot network trace, request grouping, cache behavior, registration diagnostics and host startup logs.
* Minimal reproduction using both the absolute address and the session-scoped address, including session ID, resolved cwd/workspace root, normalized file address and a harmless test file. Record the same-file/same-time file-trace success alongside documentpreview failure, screenshots, meta.status transitions and timestamps.
* Trace the client resource lookup/provider selection, workspace-files Remote binding, gateway RPC request/response or absence of request, host service readiness, session-root lookup and metadata/content delivery. Collect failed, pending and absent requests distinctly; attach host errors as well as the quiet browser console. This is needed to identify the failed hop rather than infer it from the title.
* A controlled comparison of old versus clean profile, and external-plugin-enabled versus isolated baseline, only in a separate disposable profile with preserved configuration. Record outcomes if actually tested; none are supplied here. Include the prior restart/rollback outcomes with their version and historical scope.

At boot, the host should validate more than package presence or HTTP 200: verify that required modules registered, required injected services resolve, the resource-provider registry contains the file provider, workspace-files Remote and gateway bindings are ready, and the corresponding host service exists. When a session is available, validate session-root lookup and run a bounded, read-only metadata health probe against a known permitted file. A boot without a session should report that session-specific validation is deferred, not manufacture a successful check.

Emit a structured, correlated diagnostic identifying the missing/unready dependency and phase, with a timeout for readiness/metadata that never arrives. Distinguish pending initialization, unavailable provider, permission denial, missing file, transport failure and renderer failure. The sidebar should show an actionable error with diagnostic reference and appropriate retry instead of remaining at meta.status='none' with a generic message. Separately test the tab-claim contract for session and absolute addresses across upgrades so scope regressions are visible.

## Evidence limits and blockers

The pack is sufficient for layered attribution and an ordered response, not a definitive root-cause patch. No live service registry, gateway trace, complete loader code or host runtime logs are supplied. There are internal evidence discrepancies: the manifest excerpt says 60 total entries while the probe describes 62; README assigns the absolute-claim dialog to alpha.1, whereas symptom-log places it in the alpha.2 timeline. Preserve and reconcile these against raw boot captures upstream; do not silently rewrite them. Neither discrepancy invalidates the supplied same-file reader contrast or the demonstrated session-only alpha.2 claim rule.

Report completed without blockers to the requested read-only analysis. The exact failed service-chain hop and the synthetic combo 404 mechanism remain unproven pending additional runtime evidence.
