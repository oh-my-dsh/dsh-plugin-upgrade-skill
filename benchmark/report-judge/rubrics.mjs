// Default semantic criteria. Historical score packets are archived separately.
import { DIAGNOSIS_RUBRICS } from './diagnosis-rubrics.mjs'

export const PROTOCOL = 'report-judge-v2'
const criterion = (id, points, requirement, sourceRequired = true) => ({ id, points, requirement, sourceRequired })
const alpha1 = 'skills/plugin-upgrade/references/v0.1.2-alpha.1.md'
const alpha2 = 'skills/plugin-upgrade/references/v0.1.2-alpha.2.md'
const api = 'skills/plugin-upgrade/references/api-migration-0.1.2-alpha.2.md'
const cards = (...ids) => ids.map(id => ({ path: id.includes('-A2-') ? alpha2 : alpha1, heading: id }))
const closedBookReplacement = 'Respect the closed-book task: exact successor package names, symbols or signatures absent from the fixture are not mandatory for full credit. Accept a correct located diagnosis, card and defensible migration direction with unavailable details marked unconfirmed or deferred to the actual target owners/exports. Use the sealed references to check asserted details, not to require unseen names. Uncertainty alone without the diagnosis and migration direction earns no credit; positively invented replacements still lose credit.'

export const RUBRICS = {
  ...DIAGNOSIS_RUBRICS,
  'H4-tsbuildinfo-trap': {
    references: cards('DSH-0.1.2-A1-21'),
    allowDeletedPrefixes: ['lib/'],
    criteria: [
      criterion('artifact-attribution', 30, 'Locate the obsolete resolveSessionPreset import in lib/index.js and the old dependency graph in lib/tsconfig.tsbuildinfo. Explain why stale emitted output/incremental state can produce the build error despite a passing source typecheck. Naming cache or quoting the error alone is insufficient.'),
      criterion('clean-rebuild-plan', 30, 'Use package.json clean (or equivalent removal of lib and its incremental state), then rebuild from current source and recheck typecheck/build/tests. Explain what each step verifies. This is a proposed procedure: executing it is not required, the static fixture lacks scripts/build.mjs and a complete runnable toolchain, and success must not be fabricated. Partial credit for a sound clean/rebuild plan without verification detail.'),
      criterion('no-source-migration', 40, 'Ground the no-source-change conclusion in src/index.ts having no resolveSessionPreset reference and contrast it with the stale lib artifacts. Explain that the A1-21 deletion applies to real callers, so the colleague suggestion does not justify changing already migrated source. A bare no-change assertion earns no credit.'),
    ],
    caps: [{ id: 'unnecessary-source-migration', total: 30, requirement: 'Trigger only if the final recommendation affirmatively rewrites the source to replace resolveSessionPreset despite its absence there. Quoting or rejecting the colleague suggestion or migration recipe is not a violation.' }],
  },
  'H6-remote-error-trap': {
    references: [...cards('DSH-0.1.2-A2-02', 'DSH-0.1.2-A1-30'), { path: api, heading: 'API-02' }],
    criteria: [
      criterion('namespaced-codes', 25, 'Locate the bare cancelled/internal comparisons and misleading comment in src/remote-usage.ts. Explain migration to namespaced error codes and reject the comment using the contract. Correct gateway/cancelled and gateway/internal earn full credit; a located diagnosis with the namespace migration direction but exact unavailable spelling explicitly unconfirmed earns partial credit. Do not demand any additional unseen enum names or exact import paths in this closed-book task.'),
      criterion('cancel-policy', 25, 'Relate the current cancelled branch to the target cancellation behavior: terminate the operation or propagate cancellation deliberately, without retry or converting cancellation into a generic error. Include cancellation in the proposed verification matrix. Mere mentions of cancellation or retry earn nothing.'),
      criterion('internal-unknown-policy', 25, 'Locate the silent internal return and the unhandled unknown-code fallthrough. Preserve the original code/details and surface internal and unknown failures explicitly, without blind retries because internal does not prove the operation never ran. Include internal and an unknown code in proposed checks.'),
      criterion('exception-boundary', 25, 'Locate the blanket catch return and instanceof RemoteError test. Remove silent swallowing, expose/propagate genuine local assembly/programming faults, and use structural discrimination instead of cross-realm instanceof. Keep ordinary result.ok failure handling separate from real throw/catch boundaries; if a guard such as isRemoteFailure is named, use it at an actual thrown boundary. Propose success and unexpected-exception checks; no reproduction, installation or execution is required.'),
    ],
    caps: [
      { id: 'retain-old-codes', total: 25, requirement: 'The report affirmatively recommends keeping the bare old cancelled/internal strings as the correct target contract. Explicitly rejected bad examples do not trigger this cap.' },
      { id: 'cross-realm-instanceof', total: 50, requirement: 'The report affirmatively recommends instanceof RemoteError as the reliable cross-realm failure discriminator. Rejecting that advice is correct and must not trigger the cap.' },
    ],
  },
  'H12-remote-result-boundary-trap': {
    references: [...cards('DSH-0.1.2-A2-02'), { path: api, heading: 'API-02' }],
    criteria: [
      criterion('root-cause', 20, 'Locate src/index.ts renameSession and explain that ordinary unary failures resolve with ok:false/error rather than entering catch; the current code incorrectly assumes resolved means success. Do not falsely date the RemoteResult discriminated shape to alpha.2; it already exists in rc.2.'),
      criterion('current-problems', 10, 'Locate and explain at least two distinct actual defects in src/index.ts: unchecked result.value, catch used as the ordinary business-failure path, cross-realm instanceof, or retry of genuine assembly/programming rejects. Partial credit for one supported defect; a list of symbols alone earns zero.'),
      criterion('corrected-implementation', 25, 'Evaluate the proposed fenced ts/js code semantically: await the remote call, discriminate success/failure, handle the failure error and exit that path before reading success value. Accept equivalent variable names, destructuring, success-first branches and explicit propagation. A comment or string containing API tokens is not executable handling. No code block means missing for this criterion. Do not require running the static fixture.', false),
      criterion('resolved-control-flow', 20, 'Explain success ok:true/value and ordinary failure ok:false/error on the resolved result, with catch outside the ordinary failure route. The error-code vocabulary is already migrated; merely proposing renamed codes does not answer this task.', false),
      criterion('reject-boundary', 15, 'Identify genuine assembly/programming rejects, give a concrete supported example such as an unmounted method or missing Context adapter, and require propagating/exposing it rather than swallowing or blindly retrying it. Do not mistake ordinary remote business/carrier/cancellation failures for these faults.', false),
      criterion('error-discrimination', 10, 'Reject instanceof RemoteError across bundles/workers/realms; discriminate ordinary failures structurally/by code on the failed result. Place isRemoteFailure or an equivalent structural guard only at a genuine thrown boundary (for example explicitly throwing result.error), not as a replacement for checking the resolved result discriminant. Equivalent explanation without the exact helper spelling is valid.', false),
    ],
    caps: [
      { id: 'ordinary-failures-reject', total: 30, requirement: 'Trigger only on an affirmative final claim that ordinary unary remote failures primarily reject and should be handled in catch. Explicitly throwing an already discriminated failure is a valid separate boundary, not this misconception.' },
      { id: 'unsafe-corrected-code', total: 60, requirement: 'Trigger when the proposed corrected code actually reads the success value without discriminating success, uses cross-realm instanceof as its failure discriminator, or swallows/blindly retries genuine local rejects. Inspect executable behavior, not tokens in comments, quoted old code, or rejected examples.' },
    ],
  },
  'S1-static-scan': {
    references: cards('DSH-0.1.2-A1-01', 'DSH-0.1.2-A1-02', 'DSH-0.1.2-A1-03', 'DSH-0.1.2-A1-04', 'DSH-0.1.2-A1-05', 'DSH-0.1.2-A1-08', 'DSH-0.1.2-A2-01'),
    criteria: [
      criterion('source-patch', 10, 'Locate the source patch declaration/target and script, distinguish source patching from ordinary composition, and explain the private session-view coupling.'),
      criterion('events', 10, 'Locate the informational event producer/consumer and ignorable:true. Explain alpha.1 removal and alpha.2 restoration: preserve omission-safe informational markers, not a whitelist for required events. Do not claim arbitrary Session.append supports writing the marker.'),
      criterion('host-services', 10, 'Locate apiProxy usage and its removal. Distinguish Host domain-service injection (llm/listProviders) from Web Client Remote; do not prescribe a nonexistent Host remote service.'),
      criterion('host-path', 10, 'Locate the fixed homedir/.dsh/profiles/default path and explain using runtime DSH_HOME/profile information. Do not claim --profile was introduced in alpha.1.'),
      criterion('ui', 10, 'Locate both the private SessionView import and command registration and explain public owner/seam verification after the split.'),
      criterion('channel', 10, 'Locate the private loopback HTTP server. Explain that loopback does not bypass auth requirements and distinguish host-managed authenticated channels from raw routes.'),
      criterion('subprocess', 10, 'Locate dsh subprocess calls and stdout JSON.parse. Explain stdout final text vs stderr progress, and that the JSONL assumption was already wrong, rather than inventing an alpha.2 stdout change.'),
      criterion('mapping', 20, 'Map actual located couplings to A1-01, A1-02+A2-01, A1-03, A1-04, A1-08; A1-05 is a valid additional stdout mapping. A bare card list earns zero. Award half only when the mappings are substantively correct but incomplete.'),
      criterion('limits', 10, 'Account for all seven hit categories (there are no no-hit categories here), state the scan limits, and propose target-version build/typecheck, isolated boot and a functional path. Never require actually executing this static fixture.', false),
    ],
  },
  'S2-negative-scan': {
    references: cards('DSH-0.1.2-A1-01'),
    criteria: [
      criterion('host-break', 40, 'Locate index.js inject/apiProxy.llm.providers and map the breaking Host service to A1-01. Explain llm injection/listProviders and the dead apiproxy dependency in package.json; a card name alone earns zero.'),
      criterion('negative-coverage', 20, 'Account for each of the other six categories with scanned-file evidence. session-notes.js is a pure string/array utility; cordis.patch.yml is ordinary plugin composition, not a host-source patch. Interpret a negative patch conclusion in its touchpoint-category context: wording such as no patch file/declaration under the source-patch category can correctly mean no host-source patch, especially when the scan scope includes the composition file. Do not deduct solely because an ordinary composition file has patch in its name, or require an extra explanation of that naming distinction when the category conclusion and scan evidence are correct. Still deduct for an explicit denial that the existing composition file itself exists, for misclassifying its insertion as host-source modification, or for unsupported negative conclusions. Do not invent coupling from filenames.'),
      criterion('inference-boundary', 20, 'Explain why no static hits cannot establish compatibility: scan coverage is limited and dependency/config/runtime behavior needs separate evidence. Distinguish the existing decisive apiProxy break from the six negative categories.', false),
      criterion('verification-plan', 20, 'Specify post-migration build/typecheck, an isolated target-version cold boot with no pending, and an actual provider call. These are proposed checks, not checks supposedly executed inside this non-runnable fixture.', false),
    ],
  },
  'S3-snapshot-migration': {
    references: [...cards('DSH-0.1.2-A1-03', 'DSH-0.1.2-A1-25'), { path: api, heading: 'API-10' }],
    criteria: [
      criterion('chat-projection', 20, 'Locate Pet.tsx partial/runningCalls/turnEnds reads. Explain their temporary chat legacy projection and subsequent views/timeline or target-owned Chat access. Accept a supported direct migration when it explains the compatibility option; merely saying legacy is insufficient.'),
      criterion('session-lifecycle', 20, 'Locate running in Pet.tsx and explain it belongs to the Session/useSession lifecycle seat, outside chat legacy. Do not claim the existing useSession call itself must be renamed for running.'),
      criterion('type-and-inject', 20, 'Locate removed dsh-client-runtime imports and the package.json client.inject entry. Repoint Context as ClientContext to scoped cordis and snapshot types to their target owner; do not claim every snapshot type is exported by cordis. Unknown exact snapshot symbols may be explicitly deferred to target exports.'),
      criterion('slot-registration', 20, 'Locate the scoped slots.register call in index.ts. Explain slots.inject around registration and the ui-renderer/client Context augmentation/service ownership; preserve the slot name and lifetime. Accept equivalent supported registration forms.'),
      criterion('mapping-and-plan', 20, 'Tie the located snapshot/lifecycle/slot changes to full DSH-0.1.2-A1-03 and separate temporary projection from immediate type/inject/lifecycle changes. A1-25 is a valid additional package-removal card. A bare card ID earns zero.'),
    ],
  },
  'S4-legacy-client-imports': {
    references: [...cards('DSH-0.1.2-A1-25', 'DSH-0.1.2-A1-26', 'DSH-0.1.2-A1-27', 'DSH-0.1.2-A1-30'), { path: api, heading: 'API-10' }],
    criteria: [
      criterion('runtime-removal', 25, `Locate the old ClientContext import, identify Web Client/plugin impact and A1-25, and require removing the deleted-package import in favor of a supported target owning package. A direction such as importing Context from its actual target owning package with the needed type augmentation is sufficient; the fixture does not establish the exact package name. Type erasure does not make a removed type package harmless. ${closedBookReplacement}`),
      criterion('registration-id', 25, 'Compare the actual pet-legacy-bundle loader ID with package.json name dsh-pet-session-bench, map A1-26 and require exact name alignment and client activation verification.'),
      criterion('session-content', 25, `Locate useSession/nodes, map A1-27 and require replacing the removed flat content access with a supported target content-reading surface, preserving ordering. Chat/durable windows or public selectors are supported directions; exact hook/store names such as useChat plus order/nodes.get are not mandatory when unavailable in the fixture. Do not positively claim that the old flat useSession nodes API remains supported. Pet.tsx is empty and has no breaking surface. ${closedBookReplacement}`),
      criterion('connection-face', 25, `Locate connection.api.agentPresets.list, map A1-30 and require removing that deleted face in favor of a verified public target interface for the operation. Remote/public domain APIs are supported directions, but the exact successor name is not mandatory when unavailable in the fixture. ${closedBookReplacement}`),
    ],
    caps: [{ id: 'invented-migration', total: 70, requirement: 'Apply ONLY if the report positively asserts an unsupported lifecycle replacement (apply to setup/activate) or that service inject generally must move into a manifest. Explicitly rejecting these claims, or legitimate cleanup of the deleted package from client.inject, does NOT trigger this cap.' }],
  },
  'S5-negative-naming': {
    references: [],
    criteria: [
      criterion('official-short-name', 25, 'Locate greet in dsh-plugin.naming.json and distinguish the declared plugin name from its package/coordinate. Under the supplied fixture policy it is a valid official short name, not a compatibility error. A publisher prefix may reduce collisions but is not a mandatory compatibility repair. Merely repeating greet or valid is insufficient.'),
      criterion('service-collision-advice', 25, 'Locate the unprefixed service search. Explain the collision risk and classify it as a warning/recommendation rather than a compatibility error. Do not treat a strict-mode nonzero exit as proof of an incompatible API. A strict-mode command is not required.'),
      criterion('shared-event-context', 25, 'Locate web-search/ready as an event shared channel. Explain that matching names alone do not establish a conflict; publisher schema compatibility and registry context determine conflicts. Informational/shared-channel wording is equivalent; an unsupported claim of global uniqueness is not.'),
      criterion('coverage-and-registry-limits', 25, 'Account for the remaining declared naming surfaces (loader, tool, command, skill/provider, settings and route), which may be grouped with a justified common verdict. Distinguish local naming compatibility from unqueried registry occupancy/reservation/availability. State unknown/not checked for registry-dependent claims and propose later verification without claiming it was run. Do not invent an error from private:true, which marks test material. An explicit rejection of all-clear/reserved/globally-available claims is correct.'),
    ],
    caps: [{ id: 'unsupported-all-clear', total: 30, requirement: 'Trigger only for an affirmative, unsupported blanket conclusion that every surface passes/is globally available or publication is cleared despite the unqueried registry. Correct local compatibility verdicts, hypothetical bad examples and explicitly rejected all-clear claims do not trigger this cap.' }],
  },
  'S6-corridor-net-state': {
    references: cards('DSH-0.1.2-A1-02', 'DSH-0.1.2-A2-01'),
    criteria: [
      criterion('corridor-net-state', 25, 'Explain alpha.1 removal followed by alpha.2 restoration of SessionEvent.ignorable retention, applying the final alpha.2 state to produceExternalEvent in src/events.ts. Correct version history is required; bare A1-02/A2-01 card names earn no credit, and equivalent history without card IDs is acceptable.'),
      criterion('remove-marker-stripping', 25, 'Locate delete (event as any).ignorable and reject the comment prescribing continued stripping on alpha.2. Recommend removing that defense and correcting its obsolete rationale. Distinguish removing the stripping code from removing the marker itself. It is valid to note that the shown literal currently has no marker, so the delete is a no-op, while still rejecting the intended stripping policy.'),
      criterion('informational-producer', 25, 'Explain that only informational events whose semantics old readers may omit without breaking reconstruction can carry ignorable:true; required events must not be made ignorable. Retention across persistence/reload is not a reader-side filtering instruction: marked events remain in the loaded log. Apply this to the third-party/informational producer while respecting the live append limitation.', false),
      criterion('public-append-gap', 25, 'Identify the public live Session.append capability gap: it has no supported ignorable parameter. Ordinary plugins must not fake an entry with a cast, invented argument or unsupported API. Explicitly defer the exact producer/persistence integration pending target API verification; naming an undocumented successor is not required. Proposed retention/required-event checks are valid but actual execution is not required.', false),
    ],
    caps: [{ id: 'keep-stripping-marker', total: 10, requirement: 'Trigger only when the final recommendation affirmatively keeps the alpha.1 defense or continues deleting the marker on alpha.2. Negating that recommendation, quoting the old code for diagnosis, or removing the delete statement does not trigger it. Read the entire sentence and conclusion, including double negation and later contradictions.' }],
  },
  'S7-unpublished-cohort': {
    references: [],
    criteria: [
      criterion('published-version-evidence', 25, 'Use package.json and the supplied README/brief to distinguish the @deepseek-ai/dsh-llm declaration from the published version list: alpha.1 was never published there, while alpha.2 was. Do not infer each internal package exists from the root package or a dist-tag. The brief already supplies the registry fact: credit using it with proposed package-specific verification; never require an actual online npm view in this closed-book task.'),
      criterion('caret-resolution', 25, 'Explain why ^0.1.2-alpha.1 can select the supplied published 0.1.2-alpha.2: the missing lower-bound release does not make the range unresolvable. Identify the silent declaration/type-baseline mismatch and prerelease compatibility uncertainty. Do not claim all alpha versions are missing or that the caret guarantees alpha.1. No mandatory semver formula or keyword spelling.'),
      criterion('workable-baseline-plan', 25, 'Give at least ONE complete feasible plan with its tradeoff: either deliberately target the published alpha.2 using an exact pin and acknowledge that this does not validate alpha.1; or obtain a verified exact upstream alpha.1 source ref, build/package the necessary cohort and resolve local tarballs explicitly. One coherent plan is sufficient for full credit. Bare npm ci, tarball or overrides words are not a plan; do not require guessing an unavailable tag or command.', false),
      criterion('reproducibility-and-exit', 25, 'Make the chosen plan reproducible with one consistent project package manager, a committed lockfile/frozen install or equivalent, and a proposed typecheck against the intended target. For temporary local overrides, explain when/how to replace them with verified equivalent published packages and remove the overrides; an exact published-pin plan can describe deliberate future upgrades instead. Mark unverified source/build/runtime details honestly. Do not require both npm and pnpm, switching package managers, or executing installs.', false),
    ],
    caps: [{ id: 'install-unpublished-registry-version', total: 10, requirement: 'Trigger only for an affirmative prescription to install the exact unpublished @deepseek-ai cohort alpha.1 version from npm as if available. The declared caret range, local tarballs built from alpha.1 source, rejected BAD examples and explicitly forbidden exact-install commands do not trigger this cap.' }],
  },
  'S8-release-routing-trap': {
    references: [],
    criteria: [
      criterion('missing-mirror-tag', 20, 'Use ls-remote-tags.txt and sync-script.sh to explain that the README-pinned v0.9.5 is absent from the public mirror because the script pushes HEAD:main but not tags. Tie this to attempt 1 resolution failure, rather than guessing a network fault, consumer typo or missing npm package. Mere tag/version mentions earn no credit.'),
      criterion('runtime-compatibility-direction', 20, 'Use dsh-version.txt (0.1.1-rc.2) and compat-table.md (v0.9.7 targets 0.1.2-alpha.1) to explain attempt 2: a newer-client-API artifact on an older runtime lacks the expected useConversation seat. Successful installation/restarting does not establish API compatibility. Explain the direction rather than only repeating the error.'),
      criterion('frozen-runtime-remedy', 20, 'Honor the production freeze: select v0.9.3 using its rc.1 verification and the supplied additive rc.2 compatibility note. Notice v0.9.3 is ALSO absent from the mirror listing. Provide the consumer install command pinning #v0.9.3 after maintainer tag publication, or a reachable verified v0.9.3 commit as a conditional alternative. Do not invent a SHA, assume an unreachable commit resolves, require upgrading DSH, or present the absent tag as immediately installable.'),
      criterion('tag-distribution-repair', 20, 'Propose explicit release-tag distribution to every public mirror, grounded in the branch-only sync script, and verify the documented tags resolve. Non-forced git push <remote> <tag> or --tags are equivalent. Branch synchronization alone is insufficient; a bare --tags keyword does not establish the repair.'),
      criterion('version-routing-docs', 20, 'Prevent the second defect by routing README install commands according to the consumer DSH version: rc.2 users get the verified v0.9.3 artifact, alpha.1 users can use v0.9.7. Include a runtime version check or explicit compatibility matrix/branches. A single newest-tag default or restarting advice does not satisfy this requirement. Do not generalize support to every untested future alpha release.'),
    ],
  },
  'S9-composer-coordinate-trap': {
    references: [],
    criteria: [
      criterion('projection-contract', 20, 'Use host-input-contract.ts and host-input-facade.ts to distinguish published draft/Occurrence clipboard-text offsets from the detect-coordinate spans used by insertReference and consumeToken. A chip expands to clipboardText in the former and occupies one U+FFFC in the latter; ordinary text and separating spaces still contribute their normal width. Equivalent descriptions without exact type names are valid.'),
      criterion('repeat-paste-failure', 20, 'Locate snapshot.draft.length in plugin-client.js add and connect the captured first-success/second-failure behavior to the host detect-span splice. With an initially empty composer both coordinates coincide; after a chip, clipboard length overshoots the detect span and insertReference returns false, which the plugin turns into its changed-composer toast. Do not infer a real concurrent edit from the toast or require inconsistent hardcoded character counts from the capture.'),
      criterion('removal-and-bookkeeping', 20, 'Trace plugin-client.js remove: occurrence.offset/length are passed unconverted to consumeToken, its false result is ignored, and records.delete runs anyway. The live occurrence remains, while missing record data renders unavailable in the dock and the composer chip stays. Tie both symptoms to the same coordinate mismatch, rather than treating unavailable as a separate upload failure.'),
      criterion('conversion-and-success-gate', 20, 'Derive and apply the conversion at BOTH call sites: subtract the sum of (occurrence.length - 1) for preceding chips; for insertion at draft end account for all preceding occurrences, and for removal map occurrence.offset then use a one-detect-character span. Keep the revision guard; retire records only after successful consumption or a verified successful clipboard-coordinate fallback. Equivalent correct mapping/pseudocode is sufficient; merely saying convert offsets is incomplete.'),
      criterion('regression-sequences', 20, 'Propose two successive pastes with both occurrences/chips present, then remove a chip with another preceding chip and assert composer occurrence, dock chip and record are removed together while the other chip survives. Declined-consumption bookkeeping, first/last-chip and empty-again variants are valid additions. Code assertions and natural language are equivalent. Score only task items 1-4; item 5 host-source-reading discipline is explicitly unscored.', false),
    ],
  },
  'S10-paste-rename-and-version-chip': {
    references: [],
    criteria: [
      criterion('paste-names-and-scope', 20, 'Design paste_image and paste_file names, adding (2), (3), etc. before the extension until an unused name is found. Reserve names within the batch as well as across live attachments. Scope renaming to clipboard acquisition before duplicate validation/record creation; drop and picker keep their real names. An explicit paste-only option in a shared function is equivalent if other sources remain unchanged. Do not require the words increment or collision. The prompt explicitly makes item 2 (original extension/MIME fallback and chip/upload display details) unscored: do not require or deduct for those details.'),
      criterion('live-conflict-state', 20, 'Identify the live composer snapshot occurrences as the authoritative occupied-name source and explain why the records subscription can delete cache entries on a transient empty snapshot while an attachment remains live. Account for the current paste batch/in-flight reservations; records may supplement but cannot replace live state. Do not demand a particular variable name or literal source-of-truth phrase.'),
      criterion('stale-tag-display', 20, 'Use the captured cached tags response (x-cache HIT, age, older 0.2.9) and renderCurrentChip(tag) to explain the stale latest label. Compare fetched and running PLUGIN_VERSION semantically: show an update only when remote is newer, otherwise show the running version, never an older fetched tag. Equivalent pseudocode such as remote > local and remote <= local is sufficient.'),
      criterion('regressions', 20, 'Propose tests showing repeated/same-batch image pastes retain distinct live attachments, a live occurrence still blocks a name with an empty records cache, and drop/picker names stay unchanged. Test an older/equal remote tag against the running build and a genuinely newer remote tag. Concrete expected names or assertions in code suffice; no mandatory coexist/assert wording. Do not grade the unscored extension/display guidance.', false),
      criterion('release-hygiene', 20, 'Synchronize the package version and hand-inlined PLUGIN_VERSION in the distributed lib artifact, run its syntax check (node --check or equivalent) plus behavioral regressions, and explain deployment/update of the served plugin artifact followed by browser reload/hard refresh. A Git tag or update chip alone does not install the artifact; there is no host-side update endpoint. Package metadata wording is equivalent to package.json. Do not require executing or publishing this static fixture.'),
    ],
  },
  'S12-global-upgrade-ebusy-trap': {
    references: [],
    criteria: [
      criterion('native-module-owner', 20, 'Identify the running Windows dsh web-host node.exe (PID 42432 in running-processes.txt) as the process that loaded koffi.node. Explain that the loaded native binary remains in use until that host exits, so npm cannot copy/replace it and reports EBUSY. File-in-use/handle wording is equivalent to lock; do not require universal claims about other operating systems or the word exclusive.'),
      criterion('browser-versus-host-sequence', 20, 'Explain that refreshing the browser reloads the page/SPA without stopping the native-module-owning host. Give the ordered procedure: stop/confirm exit of the relevant dsh host, install, then restart. Separate numbered steps, prose and command blocks together establish the sequence; do not require a single sentence. Do not prescribe killing every unrelated Node process.', false),
      criterion('unpinned-dist-tag-resolution', 20, 'Explain that an unversioned npm global install follows latest, which npm-dist-tags.txt pins to 0.1.1-rc.2; alpha points to 0.1.2-alpha.5. This can replace the initially installed alpha.4 with rc.2 rather than preserving/upgrading it. A statement that an unpinned install does NOT preserve the installed version is correct, not contradictory advice. Distinguish a minor wrong prior-version label from a wrong resolution mechanism.'),
      criterion('safe-exact-commands', 20, 'Provide npm install -g (or npm i -g) @deepseek-ai/dsh@0.1.2-alpha.5 and @deepseek-harness-tui/dsh-tui, together or separately after stopping the host. Verify dsh --version is alpha.5 and restart the host. An explicit @alpha may be discussed as a mutable alternative but cannot replace the requested exact-version command. Shell examples are proposed instructions, not required executed actions.', false),
      criterion('readme-prevention', 20, 'Tell README authors to pin the exact intended/tested core version whenever a plugin install command also installs dsh, and avoid silently following latest over an existing prerelease. Accept separate pinned core/plugin commands or one pinned combined command. Read the recommendation across headings and list items; quoted unpinned BAD examples are not endorsements.', false),
    ],
  },
  'S15-slot-error-boundary-crash': {
    references: [],
    criteria: [
      criterion('busy-scope-and-trigger', 20, 'Locate the disabled expression in AttachmentChips: (props.input?.phase ?? plain) !== plain || busy. busy is local to sibling AttachButton and unbound in AttachmentChips. Explain empty occurrences return null before the map, while a present occurrence in plain phase makes the left guard false and evaluates busy, causing ReferenceError. Accept not declared/not in scope and equivalent language.'),
      criterion('slot-boundary', 20, 'Explain that a render exception is caught by the slot error boundary and removes the whole dock entry, rather than only the remove button; the separate attach-button slot survives. The diagnostic is in the browser console, not a user-facing banner.'),
      criterion('attribution-and-isolation', 20, 'Use the shipped v0.2.10 expression to establish that busy already occurs in the baseline. Propose a data-present plain-phase baseline mount or rollback/re-add isolation to locate it. Do not force a claim that the hover diff is harmless: feature.diff is inconsistent with the baseline about the old disabled line and places imageItem before the callback-scoped status/record. Credit grounded discussion of these extra defects/inconsistencies. The evidence does not prove exactly when every historical user first exercised the failure.'),
      criterion('fix-and-hardening', 20, 'Remove the dangling busy reference or explicitly provide properly owned state/props, preserving the phase guard. Harden missing arrays with record?.items ?? [] (or equivalent) and DOM targets with event.target?.closest?.(...) or a safe element/type check. Scope hover lookups to where record/status are defined. Equivalent safe fixes count; do not require an exact patch or executing changes in this read-only task.'),
      criterion('data-present-regression', 20, 'Propose a render/mount test with a matching occurrence in plain phase, asserting the chip/remove control exists and the error boundary captures no exception. Explain why an empty-state-only test misses the expression and why node --check/parsing cannot resolve free identifiers or execute the component. Assertions using expect/DOM queries and ordinary prose both count. Include a data-present slot smoke in pre-ship checks, without requiring an actual test run here.', false),
    ],
  },
}

for (const [task, rubric] of Object.entries(RUBRICS)) {
  if (rubric.criteria.reduce((sum, c) => sum + c.points, 0) !== 100) throw new Error(`${task}: weights must sum to 100`)
}
