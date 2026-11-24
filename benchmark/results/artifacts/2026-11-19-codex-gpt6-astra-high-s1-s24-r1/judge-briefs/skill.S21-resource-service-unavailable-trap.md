# JUDGE BRIEF · skill.S21-resource-service-unavailable-trap

## Criteria (sealed rubric)
- [metadata-chain-attribution] (20pt) Use symptom-log.txt and contrast-probe.txt: the session-scoped document tab is claimed/titled but meta.status stays none, while file-trace’s own RPC reads the same file. Localize the fault to the workspace-files resource-provider/RPC metadata delivery chain, not disk existence or the external plugin renderer. The workspace-files host row is already declared; static serving does not prove activation. Do not require an exact unseen internal failing function.
- [valid-probes-and-partitioning] (20pt) Use combo-probe.txt to distinguish the per-module 62/62 HTTP 200 sweep from the manually joined 4–5 KB URL’s 404. The real loader partitions combo requests to respect its URL limit (3 KB); the oversized join is not evidence of missing modules. Recognizing bounded partitioning is enough without memorizing the constant or exact byte count. The manifest excerpt says 60 while the probe says 62: accept explicit evidence-bounded treatment of that discrepancy, not invented reconciliation.
- [distractors-and-tab-scope] (20pt) Separate the paste-input fold warnings from the resource read, and use boot-manifest-excerpt.txt to explain textpreview→documentpreview and the new session-only canOpen scope. That scope explains the outside/absolute-address claim failure, not the session tab’s stalled metadata. Do not demand the fold-parser fix version or exact END-marker cause absent from the supplied evidence; acknowledging an independent warning family is sufficient.
- [ordered-mitigation] (20pt) Give restart once → rollback to a known published working version if still broken → upstream follow-up, using discussion-excerpt.txt’s 0.1.3-alpha.2 escape hatch or a clearly verified equivalent. Reject plugin-side rewrite/retry/fallback and duplicate service insertion as cures for this host-chain gap. Explain that the earlier alpha.1 roster mismatch is prior art, not proof the alpha.2 case still has missing bytes. Proposed actions suffice; do not execute a self-host global upgrade.
- [upstream-forensics-and-fail-loud] (20pt) Package versions/profile upgrade history, exact session/absolute address and symptom, roster, valid per-module sweep, same-file contrast and meta.status, plus the invalid-join caveat for upstream. Propose named host diagnostics for module registration/provider or metadata-RPC readiness at boot/first use; roster-versus-served-byte checks are useful but do not by themselves prove this already-served chain works. A specific meaningful failing-chain diagnostic is sufficient; do not require an unseen public health-check API.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [invalid-probe-as-missing-bytes] ceiling=40 The final diagnosis treats the oversized all-in-one 404 as proof modules are missing despite the individually successful sweep. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.
- CAP [plugin-workaround-or-duplicate-insert] ceiling=40 The proposed remedy rewrites the external plugin, adds blind retry/fallback to hide the host failure, or inserts another workspace-files service even though the bundle already provides it. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.

## Candidate report(s)
#### FILE: S21-resource-service-unavailable-trap/report.md

# S21 — read-only post-upgrade diagnosis

## Scope and completed work

Mode A, read-only diagnosis. Read plugin-upgrade/SKILL.md, the seven evidence files, the corridor index, troubleshooting guidance, and relevant cards DSH-0.1.5-A1-20 and DSH-0.1.5-A2-01/-02/-09. BENCHMARK-AUTH-v1 authorizes this report. No installation, migration, host restart, network request, or fixture modification was performed. Only this report was written. Pre-existing build baseline: not collected; this is an evidence review, not a source migration.

Observed installation identity: Windows 11, npm-global @deepseek-ai/dsh, 0.1.5-alpha.1 → 0.1.5-alpha.2, profile originally created under 0.1.2/0.1.3, six external client plugins linked by junction. Exact Node/npm versions, executable/prefix resolution, package hashes, plugin versions/SHAs, and resolved composition are not supplied and must not be invented.

## 1. Attribution: two distinct failures

The absolute-scope URL produces a tab-claim failure, before a reader runs. In alpha.2 documentpreview accepts only parseFileAddress(address)?.scope === 'session'. An absolute filesystem path can be represented within a session-scoped address; absolute URL scope and being physically outside the workspace are different concepts. A2-01 also documents that absolute scope no longer authorizes workspaceFiles calls. Thus the original no-claim dialog does not demonstrate that the session reader is broken or that its modules are missing.

The session-scoped test does get a documentpreview tab and correct title, proving tab registration, claim, and UI mounting sufficiently for that path. A title can be derived from the address; it proves no successful metadata/content read. The content failure belongs to the built-in runtime resource chain: documentpreview → client resources/file provider → remote.workspaceFiles/api-workspace-files → host workspaceFiles/scope lookup/filesystem. The contrast localizes the problem to that chain, particularly its availability/activation/Remote binding, rather than to the third-party plugin's content reader.

The same file at the same moment renders in both file-trace modes using its own /dsh-file-trace/* HTTP RPC. This rules out a missing or generally unreadable file, bad Markdown as the primary explanation, and a universally broken host filesystem. It does not prove that the built-in Remote, its lookup, composed filesystem, authorization, or provider injection is healthy: the transports differ. The host bundle already includes workspace-files, and the client boot manifest lists api-workspace-files with gateway and client-resources dependencies. A declared row is not proof of runtime service activation.

meta.status remains 'none': the file resource has not supplied metadata at all. The stall is before a successful stat/metadata result and before downstream content decoding/document rendering; it is not evidence of an empty file or a renderer parse error. Unavailable provider/Remote or an activation dependency that never resolves is the leading diagnosis. The exact failed link is not proven without runtime state and request traces. No red console error does not clear this path; the UI is presenting a quiet unavailable state.

The .dsh/tmp location is inside the session root and is not a blocker. Moreover alpha.2 file reads may target files outside that root via session scope, subject to the composed filesystem; confinement still matters for listings. Do not diagnose this as a simple workspace boundary restriction.

## 2. Probe discipline

The valid static-serving measurements are the actual advertised single-module URL (gateway: 200, 73,616 bytes) and the per-entry sweep (62/62 HTTP 200, zero 404s). These establish artifact accessibility at the probed boot revision, not factory execution, registration of every module, service activation, or successful Remote reads.

The synthesized URL joining all 62 entries into one approximately 4–5 KB request is not a faithful loader request. It can exceed supported combo batching/URL constraints; its zero-body 404 only shows that this artificial aggregate request failed. It must never be cited as 'modules missing', especially against the successful individual requests. The real loader fetches the roster through multiple bounded combo requests/chunks, preserving the advertised module/revision coordinates, rather than unconditionally making this single giant URL. Capture its actual Network requests to establish exact grouping and limits; no numeric limit or exact rejection mechanism is established by this pack.

The earlier alpha.1 round is different: valid new-module requests failed while old modules at the same revision succeeded, causing global registration failures. That supported a roster/artifact mismatch. The current alpha.2 sweep and working tab do not reproduce that static failure. A restart healed that earlier mismatch but did not establish a healthy resource service.

Evidence discrepancy: boot-manifest-excerpt labels the roster as 60 entries, while the symptom and sweep records say 62. Preserve both as supplied and reconcile against the complete same-boot manifest upstream. Do not silently equate those inventories; the reported sweep still contains no failing individual request.

## 3. Distractors and version changes

Repeated dsh-paste-input 'fold skipped (parse failed)' warnings concern recognition/collapsing of historical attachment-marker messages into chips. They are a separate message-format/parser problem; the evidence supplies no causal connection to workspaceFiles metadata. Track separately if needed, without rewriting it to cure the sidebar failure.

The missing ui-sidebar-textpreview name is expected: alpha.2 replaces it with ui-sidebar-documentpreview in the web-app bundle (A2-09), with richer document renderers and session-only canOpen behavior. This explains the old name disappearing and contributes to the absolute-scope no-claim symptom. It does not explain a session tab that has opened but cannot obtain file metadata. All six external plugins remain in the roster. The relevant additional contract change is A2-01's Typert workspaceFileScope lookup and file-provider/Remote changes (including removal of reload/restat); these identify seams to inspect, not proof that a specific third-party plugin needs migration.

## 4. Mitigation order and rollback

Do not rewrite the plugin to replace the host resource service, install a silent fallback, or add blanket retries. A missing provider will not be repaired by repeated reads; fallbacks conceal the host defect and may change authorization behavior. The existing file-trace reader can remain an explicit temporary way for the user to view content, without being wired into the failing host path.

1. First cheap operational step: one complete host stop/start and browser hard refresh, then verify version markers, actual loader requests, provider activation, and the same session-file metadata/content path. A browser refresh alone does not restart the host. The supplied timeline already records a restart and persistence of the failure, so do not promise that repeating it fixes the problem or loop restarts indefinitely. Record that outcome and move on if it persists.
2. Preserve forensic evidence before changing the install. If the built-in reader remains unavailable, use the known escape hatch: restore the previous known-working published deployment. The supplied prior round specifically verified 0.1.3-alpha.2; alpha.1 itself exhibited resource failure and is not a proven healthy target here. This is a recommendation, not an executed rollback.
3. Perform any global repair/rollback only after fully stopping all dsh processes and from an external terminal: npm install -g @deepseek-ai/dsh@0.1.3-alpha.2. Never replace the host underneath its running agent or use an unpinned latest install. Restart dsh web and verify the real behavior. Preserve the current profile/data and use a compatible pre-upgrade backup or separate appropriate profile: alpha.1 introduced session V3, and installing older binaries is not a promise that newly written logs can be read by the old host. Do not destructively rewrite sessions to achieve downgrade.
4. Report the persistent runtime resource-chain defect upstream, attaching the second-round evidence to discussion #5999/comment 18371079. No upstream submission was performed in this task.

Do not manually insert another workspace-files or sidebar row into the profile: the bundle already supplies them, and duplicate insert IDs can crash startup. Do not replace the whole profile configuration or patch host core to hide the problem.

## 5. Upstream forensics and prevention

A complete upstream report should contain:

- Exact before/after package versions, install track and commands, Windows and Node/npm versions, resolved executable/global prefix, install artifact identities, profile lineage, and the six junction targets/plugin versions. Separate source identity from installed runtime identity.
- Redacted composition and relevant bundle/profile patches, service dependency/activation states, pending or failed injections, and host startup diagnostics. Include the workspace-files host row and the client api-workspace-files injection coordinates, not just package existence.
- Full same-boot __DSH_BOOT__ manifest, revision and module count, actual loader chunk URLs, response statuses and body/module-registration checks. Preserve the 60/62 discrepancy, the valid 62/62 sweep, and mark the synthetic 404 as a non-loader probe. Include old/new module comparisons when investigating the earlier mismatch.
- Exact reproduction timeline with absolute versus session URL scope, session cwd/workspace lookup facts, a harmless small test file and metadata-state transitions, tab title/body screenshot, and the simultaneous file-trace versus documentpreview contrast.
- Client file-provider registration state, resources and remote.workspaceFiles availability, gateway binding, Typert workspaceFileScope lookup resolution, and redacted Remote request/result or absence-of-request evidence. Identify whether the call is never issued, lookup fails, transport fails, or host service is pending; retain typed error codes rather than only the translated unavailable text.
- Browser Network/Console and narrowly relevant host diagnostics, including the absence of sidebar errors and separately categorized paste warnings. Include restart/hard-refresh results and rollback outcome. Exclude credentials, cookies, tokens and private conversation/session logs; use a minimal sanitized reproduction.

Host boot should verify the manifest and advertised artifact/revision set agree, then verify module registration, not merely HTTP 200. It should validate required service dependencies, client file-provider registration, gateway Remote exposure and workspaceFiles activation, reporting missing providers and pending injections with owning modules. Session lookup readiness must also be checked once a real session is available; a safe small-file stat/read readiness probe can validate the complete path at that point. Fail loudly with an actionable diagnostic if required dependencies do not become ready, rather than allowing indefinite meta.status='none'. The tab should distinguish unavailable provider, pending lookup, typed read error and renderer error, with structured diagnostics and only justified, bounded recovery actions.

## Skipped and pending

Skipped: installs, source changes, package scripts, migrations, automated retries, live reproduction and network access; none is needed or authorized for this read-only fixture task. No fixture rollback is needed because it was unchanged. Pending: exact runtime broken link, artifact/manifest count reconciliation, live mitigation validation and upstream delivery. These are limits of the supplied evidence, not blockers to the report.

Local evidence sources: symptom-log.txt; contrast-probe.txt; boot-manifest-excerpt.txt; combo-probe.txt; console-excerpt.txt; discussion-excerpt.txt; README.md. Prior-art URL supplied by the evidence (not accessed): https://github.com/deepseek-ai/deepseek-harness/discussions/5999#discussioncomment-18371079.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.