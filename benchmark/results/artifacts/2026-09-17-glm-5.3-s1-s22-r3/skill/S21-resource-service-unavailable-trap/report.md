# S21 · The Resource Service That "Unavailable" — Read-Only Diagnosis

Task: attribute a post-upgrade sidebar file-read failure from the evidence pack, separate
valid probes from invalid ones, separate unrelated bugs, order mitigations, and package
forensics for upstream. Methodology: plugin-upgrade skill, Mode A (read-only inspection).
No files outside the designated output directory were written; the fixture was not touched.

Evidence base (all under the task's environment/fixture directory, read-only):
symptom-log.txt, boot-manifest-excerpt.txt, combo-probe.txt, contrast-probe.txt,
console-excerpt.txt, discussion-excerpt.txt, README.md. Skill reference used:
skills/plugin-upgrade/references/v0.1.5-alpha.2.md (cards DSH-0.1.5-A2-09 and the
workspace-files scope/read cards).

Context in one line: dsh was upgraded in place (npm global, 0.1.5-alpha.1 → 0.1.5-alpha.2)
on a Windows profile created under 0.1.2/0.1.3 with six junction-linked external client
plugins. This is exactly the deployment shape that discussion #5999 (round 1, alpha.1)
already flagged as fragile: an old-profile home plus an in-place npm upgrade can serve a
client roster/combo or service-provider chain that never fully takes over.

## 1. Attribution — which layer fails

Two distinct symptoms appear in the timeline, and they are different failures:

Symptom A (absolute-scope link, "no registered tab type claims dsh-resource://file/absolute/…"):
this is a client-side tab-routing change, not a read failure. Per the boot-manifest excerpt
and card DSH-0.1.5-A2-09, 0.1.5-alpha.2 replaced ui-sidebar-textpreview (which registered
the "text" tab type claiming dsh-resource://file/**) with ui-sidebar-documentpreview, whose
canOpen accepts only parseFileAddress(address)?.scope === 'session'. An absolute-scope
address therefore has no claimant tab, and the sidebar correctly reports that no tab type
claims it. Expected behavior of the new version, not the bug under investigation.

Symptom B (session-scoped link, tab opens with correct title but shows only
「文件资源服务不可用。」): the failing layer is the api-workspace-files Remote
service chain, and specifically the point where the client-side Remote consumer needs a
provider to answer — not the file, not the filesystem, and not static artifact serving.

What the two readers of the same file rule in and rule out (contrast-probe.txt):

- file-trace (its own host RPC over /dsh-file-trace/* routes) READS THE SAME FILE FINE.
  This rules in: the file exists, is readable by the host process, the session's workspace
  root resolves, and the host's HTTP face works for other plugins.
- documentpreview tab (api-workspace-files Remote) FAILS, with meta.status staying 'none'.
  This rules out: file-missing, permission, path encoding, and absolute/session scope
  rejection (the address is session-scoped and the tab opened — scope was accepted).

The decisive signal is meta.status === 'none' observed in the failing tab. The client UI
distinguishes "asked and was refused/errored" from "never answered": 'none' means the
metadata request never completed at all — the Remote call was issued but no provider ever
responded. Combined with the fact that a sibling plugin's direct RPC works, the read stalls
in the workspace-files service activation/proxy chain on this boot: the client-side
Remote/provider for workspace-files never took over (service left pending), so the UI times
out into its explicit "service unavailable" fallback. That is the same failure family as
#5999 round 1, where "the resource-provider chain did not take over" after an in-place
upgrade on this same old profile — now narrower: modules serve, the tab opens, but the
service still never answers.

## 2. Probe discipline — which combo probe is valid

- Valid: Probe 1 (a single boot-manifest combo URL, 200, 73 616 bytes) and Probe 3 (the
  per-module sweep of all 62 manifest entries, one URL each: 62/62 HTTP 200, zero 404s).
  These measure exactly what they claim: the running host's /plugins route serves every
  roster-listed client artifact at the advertised rev. Static artifact serving is healthy.
- Invalid: Probe 2 (all 62 entries comma-joined into one ~4–5 KB URL → 404). This is not a
  measurement of anything the system promises. The combo route serves the groupings the
  host itself advertises; an arbitrarily hand-joined 62-module URL is outside the served
  namespace (and plausibly over a URL-length/format limit), so a 404 is the expected answer
  to a request nobody is designed to answer. It must never be cited as "modules missing":
  the modules demonstrably exist (Probe 3 proves it), and citing Probe 2 would misattribute
  a static-serving problem where none exists — actively harmful in this case because it
  would send the investigation down the wrong (roster/artifact) path when the real fault
  is the runtime service chain.

How the real loader fetches the roster: it does not join modules. The host renders the
__DSH_BOOT__ boot manifest into the page; the client loader requests each advertised
entry by its own combo URL (id + url + rev + inject list, as seen in
boot-manifest-excerpt.txt), i.e. manifest-driven per-entry fetches — the shape Probe 1
and Probe 3 replicate. Any probe should mimic that shape.

## 3. Distractor separation

- The repeated dsh-paste-input "fold skipped (parse failed)" warnings are UNRELATED to the
  content-read failure. Evidence: they are warnings (▲), not errors, from a different
  plugin's message-bubble collapsing of historical paste-attachment markers; the console
  shows no red errors from documentpreview, the sidebar, or the resource system; and the
  failing read produces no console output at all (consistent with a request that never
  completes rather than one that throws). Two simultaneous bugs on one page do not share
  a cause just because they co-occur.
- What actually changed in the roster between the two versions: ui-sidebar-textpreview is
  gone (0 mentions), replaced by ui-sidebar-documentpreview; ui-sidebar-right and the
  workspace-files API module are present; all six external plugins (including dsh-file-trace)
  and dsh-profiles are present. This rename DOES explain Symptom A (the absolute-scope tab
  claimant disappeared by design, per DSH-0.1.5-A2-09). It does NOT explain Symptom B: the
  documentpreview package loaded and registered (the tab opened and claimed the
  session-scoped address), and its content read goes through api-workspace-files — a
  different module that is also present and serving. So the roster rename is a true but
  separate change; the content failure is a service-activation problem, not a missing
  module.

## 4. Mitigation decision

Should the plugin work around it (rewrite / retry / fallback)? No — not as the primary
response, and a permanent workaround should not be shipped at all:

- The fault is in the host's service-provider chain on this deployment shape, not in the
  plugin's code. Retrying in the UI is harmless but futile: the failure is deterministic
  per boot (meta.status stays 'none'), not transient.
- Rewriting the plugin to bypass the Remote (e.g., rolling its own file RPC like
  file-trace's) would conceal a host regression and fork the resource surface the host
  just deliberately built (workspaceFileScope, readAll/readRelated, maxFileBytes). The
  existing "文件资源服务不可用。" message is already the correct explicit-degradation
  behavior; at most it deserves a retry affordance and a pointer to the forensics.
- The skill's discipline applies: when a migration/upgrade approach cannot be determined
  as plugin-side, fix the environment, don't paper over it in the plugin.

Order of action for the maintainer:

1. First cheap step: a full host restart — completely stop the dsh web process and start
   it again (a browser refresh is NOT a host stop), then hard-refresh the browser so the
   page re-fetches __DSH_BOOT__. Discussion #5999 documents that a host restart once
   self-healed a roster/combo mismatch on this same profile; it is minutes of cost and
   must be tried (and its outcome recorded) before anything else. Note round 1's caveat:
   even after the self-heal the content read still failed on that boot — so if the read
   still fails after a clean restart, do not keep restarting.
2. Escape hatch: pinned rollback to the last known-good published version
   (npm i -g @deepseek-ai/dsh@0.1.3-alpha.2 was verified working in #5999; any prior
   version verified on this profile works). Run it from an external terminal with the
   host fully stopped, per the pinned-install rule (never a bare package name that can
   drift to another dist-tag).
3. Upstream: file the round-2 forensics (see §5) as a follow-up on discussion #5999
   (round 2 was already appended as comment 18371079) and/or a host issue, so the
   provider-chain takeover failure on old-profile in-place upgrades gets a real fix.

## 5. Prevention / upstream

A complete upstream report needs:

- Versions and deployment identity: from/to dsh versions (0.1.5-alpha.1 → 0.1.5-alpha.2,
  npm global, in-place), Node version, Windows 11, and crucially the profile's origin
  (created under 0.1.2/0.1.3, six junction-linked external client plugins) — the old-profile
  home is the common factor across both rounds.
- The full __DSH_BOOT__ roster (not just the excerpt) with rev tokens, plus the bundle
  cordis.patch.yml rows for workspace-files and ui-sidebar-documentpreview.
- The probe evidence with methodology: per-module sweep results (62/62 × 200) and an
  explicit note that the all-joined URL probe is not a valid artifact measurement — so
  nobody downstream misreads it.
- The contrast probe: file-trace RPC succeeding vs documentpreview Remote failing on the
  same file at the same moment, including meta.status === 'none' (request never answered).
- The clean-restart outcome: whether a full host stop/start + hard refresh changes
  meta.status — this is the single most discriminating missing datum.
- Browser console excerpt (showing no resource-system errors) and the host-side terminal
  log; plus whether the host logs anything about workspace-files service activation or
  typert lookups.register resolution (sessions.get(sessionId)?.header.cwd fallback to
  sandboxPolicy.workspaceRoot — a session with neither would also leave reads unanswered
  and is worth ruling out with one log line).

What the host could check at boot so this class fails loud instead of rendering an
empty-looking tab:

- Roster/serve self-check: after building the boot manifest, verify each advertised combo
  URL actually serves at its rev (a HEAD/GET loop at boot). #5999 round 1 (roster listing
  modules the combo route 404'd at the same rev) would have failed loud here instead of
  surfacing as "loaded without registering" blame on an innocent plugin.
- Service-resolution assertion: before the web face accepts traffic, assert that every
  Remote the shipped client depends on (workspace-files above all) has an active provider —
  the same "required/provided services must not remain pending" check the skill's runtime
  verification layer uses. A pending provider should block or prominently warn at boot,
  not surface per-tab as 文件资源服务不可用.
- Client-side: distinguish "never answered" from "refused" in the tab UI — meta.status
  'none' past a timeout should render an explicit error with a retry and a boot-health
  hint, never a bare one-line "service unavailable" with no error in the console. At
  minimum, log one diagnostic when a workspace-files Remote call exceeds a deadline.
- Registration gate: refuse to serve a page whose client combo diverges from the roster
  (the A1-20 class of in-place-upgrade mismatch) instead of letting every client plugin's
  registration fail downstream.

## Summary answers

1. The failing layer is the api-workspace-files Remote chain (client-side provider never
   takes over); file-trace rules out file/FS/scope problems; meta.status 'none' means the
   read was issued but never answered — an activation/proxy stall, not a denied read.
2. The per-module sweep (and single-manifest-combo probe) is the valid static-serving
   measurement; the 62-joined URL is invalid (not a shape anything serves) and must never
   be cited as "modules missing". The loader fetches per boot-manifest entry URLs.
3. dsh-paste-input fold warnings are unrelated. The roster change (textpreview →
   documentpreview rename) explains only the absolute-scope tab-claim error, not the
   content-read failure.
4. No plugin workaround; order = full host restart (cheap) → pinned rollback to a verified
   prior version (escape hatch) → upstream report with forensics.
5. Upstream needs versions + old-profile provenance + full roster + valid probes + contrast
   probe + restart outcome; the host should boot-time-verify combo serving, assert Remote
   providers active, and render explicit timeouts instead of an empty tab.
