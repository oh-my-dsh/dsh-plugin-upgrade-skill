# JUDGE BRIEF · noskill.S21-resource-service-unavailable-trap

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

# S21 · The Resource Service That "Unavailable" — Diagnostic Report

Cell: noskill / S21-resource-service-unavailable-trap
Evidence base (read-only, unmodified): `fixture/symptom-log.txt`, `fixture/boot-manifest-excerpt.txt`, `fixture/combo-probe.txt`, `fixture/contrast-probe.txt`, `fixture/console-excerpt.txt`, `fixture/discussion-excerpt.txt`, `fixture/README.md`.
Scenario: npm-global in-place upgrade 0.1.5-alpha.1 → 0.1.5-alpha.2 on Windows 11, profile created under 0.1.2/0.1.3, six junction-linked external client plugins.

---

## 1. Attribution — which layer actually fails

The timeline contains **two distinct failures at two distinct layers**; they must not be merged:

**F1 — absolute-scope claim error (dialog 无法打开文件).**
`sidebarRight: no registered tab type claims "dsh-resource://file/absolute/E:/…/package.json"` is a **tab-type claiming/registration** failure, and its cause is visible in the boot manifest excerpt: in 0.1.5-alpha.1 the "text" tab type registered by `ui-sidebar-textpreview` claimed `dsh-resource://file/**` (all scopes). In 0.1.5-alpha.2 that package was **replaced** by `ui-sidebar-documentpreview`, whose document tab's `canOpen` accepts only `parseFileAddress(address)?.scope === 'session'`. Absolute-scope addresses therefore have no claimant on alpha.2 — a scope-narrowing behavior change in a **first-party host package**, not an external-plugin fault and not a serving fault.

**F2 — session-scoped file: tab opens, title correct, content shows 「文件资源服务不可用。」**
This is the failure the task centers on, and it sits in the **resource content-read chain**: documentpreview tab → its `@deepseek-ai/dsh-api-workspace-files` Remote (injected via `@deepseek-ai/dsh-api-gateway` + `@deepseek-ai/dsh-client-resources` per the manifest row) → host workspace-files service. The failing layer is **that service chain — not the filesystem, not static module serving, not tab registration**.

Evidence chain for F2:

| Observation | What it proves |
|---|---|
| Tab opens with correct title | The documentpreview module was served, loaded, and **successfully registered** its tab type; the session-scoped address parses and is claimed. Title derives from address parsing — no service round-trip needed. |
| Content area: only 「文件资源服务不可用。」 | The **first thing that needs the workspace-files service** (content/metadata read) never completes. Everything service-independent works; the read path alone is dead. |
| Contrast probe, same file, same moment: file-trace plugin reads fine via its own HTTP RPC (/dsh-file-trace/* routes), 原文 and 阅读 modes both show content | **Rules out**: file nonexistence, wrong path, NTFS ACL/lock/sharing issues, the `.dsh/tmp` location (the host-side note confirms the service even allows files outside the workspace root, so location is not a blocker), host-process file I/O capability, and the web server in general. **Rules in**: everything specific to the workspace-files resource-service path — service registration/instantiation on this boot, the client Remote/inject wiring, and the per-session workspace-root lookup (typert `lookups.register` → `sessions.get(sessionId)?.header.cwd`, fallback `sandboxPolicy.workspaceRoot`). |
| `meta.status` stays **`'none'`** in the failing tab | The metadata subscription never received **any** status transition — not `loading`, not `error`. The read stalls **before any service response exists**: the request was either never issued or issued into an unresolved/unregistered Remote that never answers and never throws. A permission denial, parse failure, or transport error would have produced an error status and/or a red console entry; neither exists. Combined with "no red errors in F12", this is a **silent service-availability failure**, i.e. the resource-provider chain never took over — exactly the residual symptom discussion #5999 round 1 recorded after the roster/combo mismatch self-healed on restart. |

**Localization (what the evidence supports vs. what needs host-side confirmation).** The evidence firmly localizes F2 to the workspace-files service chain on this particular boot of an aged profile. The exact stall point (service never registered host-side; client Remote proxy never resolved through the inject chain; or the session-root lookup never registered/resolved for a 0.1.2-era session record) cannot be pinned from the fixture alone — that is what the upstream forensics in §5 must capture. Note the manifest row for `dsh-api-workspace-files` carries rev suffix `-3` and injects `api-gateway` + `client-resources`; the module itself serves 200 (§2), so **loading succeeded and wiring/registration is the suspect**, not artifact availability.

---

## 2. Probe discipline — valid vs. invalid measurements

Three probes exist in `combo-probe.txt`:

- **Probe 1 — single module via the manifest's own combo URL** (`/plugins/??@deepseek-ai/dsh-api-gateway/client.js&rev=234716e8f7370214-0` → 200, 73 616 bytes): **valid**. It is byte-for-byte the request shape the loader issues for a manifest row.
- **Probe 3 — per-module sweep, all 62 manifest entries fetched one by one → 62/62 HTTP 200, zero 404s**: **valid, and the decisive one**. It measures exactly the property in question — "is every static artifact in the roster servable at its rev?" — using per-entry requests, the same granularity the loader uses.
- **Probe 2 — all 62 entries comma-joined into one ~4–5 KB URL → 404**: **invalid as a measurement of artifact serving**. No loader code path ever issues this request. Its 404 is over-determined by probe-construction artifacts:
  1. URL/query-length and combo-batch limits — a 4–5 KB synthetic mega-request tests the server's request-shape rejection, not its inventory;
  2. **rev mishandling** — manifest rows carry **per-row** rev suffixes (e.g. workspace-files at `…-3`, sidebar-right at `…-N`), but the joined probe stamped a single `rev=…-0` over all 62 modules, asking for a combination the host never publishes.
  Citing Probe 2 as "modules missing" would **contradict a same-moment, same-route valid measurement** (62/62 200) and misattribute the failure to static serving — sending the maintainer chasing a nonexistent artifact problem while the real fault (the service chain, §1) stays unexamined. An invalid probe's result is evidence **about the probe**, not about the system.

**How the real loader gets the roster:** it does not "fetch" a combo at all. The roster is embedded in the boot document as `window.__DSH_BOOT__`, served same-origin by the host when the page loads (the manifest excerpt was captured exactly this way after the restart). The loader then enumerates the entries and fetches **each entry's own `url` with its own rev**, honoring `inject` dependency order (e.g. `dsh-api-workspace-files` loads only after `dsh-api-gateway` and `dsh-client-resources`). So the ground truth for serving is per-entry URL status — Probe 3 — and the ground truth for the roster is the served `__DSH_BOOT__` HTML itself.

*(Artifact discrepancy, noted for hygiene: the boot-manifest excerpt says "Total entries: 60" while the combo probe sweeps "62 entries". The two captures were likely taken at different moments/boots (cf. #5999, where a restart changed the roster). No conclusion here rests on the count; both figures should be reported verbatim upstream with their capture times.)*

---

## 3. Distractor separation

**`dsh-paste-input: fold skipped (parse failed)` — unrelated.** Different plugin, different subsystem: it is the paste-attachment **message-bubble folding** feature failing to parse the `==== DSH_PASTE_INPUT_V1 ====` marker in **historical** paste-attachment messages, so those bubbles render unfolded. It repeats once per historical message, is purely cosmetic, shares no code path with `dsh-resource://` reads or the workspace-files service, and the console excerpt itself notes the attachment chain was verified working on 0809. Decisively: the console shows **zero** errors/warnings from documentpreview or the sidebar — the failing subsystem left no console trace at all, and the noisy subsystem is not the failing one. Keep it in the report as a separate known-cosmetic item; never as a cause.

**What else changed in the roster between alpha.1 and alpha.2:**
- `ui-sidebar-textpreview` → **ABSENT (0 mentions)**; replaced by `ui-sidebar-documentpreview` (the 0.1.5-alpha.2 tree swapped `packages/client/ui-sidebar-textpreview` for `packages/client/ui-sidebar-documentpreview`; `packages/bundle/web-app/cordis.patch.yml` carries the new row and the old row is gone).
- The tab-type contract changed with it: `file/**` (all scopes) → **session-scope only** `canOpen`.
- Everything else is stable: `ui-sidebar-right` present, `dsh-api-workspace-files` present (with its inject chain), and **all six external plugins present** (`dsh-file-trace`, `dsh-profiles`, `dsh-brand-version`, …).

**Does that change explain the symptom? Only F1, not F2.** The scope-narrowed `canOpen` fully explains the absolute-scope "no registered tab type claims" dialog. It does **not** explain the session-scoped content failure: the replacement package demonstrably loaded and registered (the tab opens and titles correctly for a session-scoped address), and serving is proven healthy per-module (62/62 200). F2 lives downstream of the rename, in the workspace-files resource-service chain — and #5999 round 1 shows this same residual read failure persisted **even after** a restart repaired the roster/combo inconsistency, i.e. F2 survives both the serving fix and the roster fix. The rename is context for F2 (documentpreview is the new consumer of that chain), not its cause.

---

## 4. Mitigation decision and ordering

**Should the plugin work around the unavailable service? No.**
1. **Wrong owner.** The failing components are first-party host pieces (`ui-sidebar-documentpreview` + `dsh-api-workspace-files` chain). The six junction-linked external plugins are not broken — file-trace's own reader works — so there is nothing legitimate for "the plugin" to patch.
2. **Fallback readers fork the read path.** Having an external plugin (e.g. file-trace) serve sidebar content would create a second, divergent read path with different scope/policy semantics (workspace-files deliberately mediates reads, including its outside-workspace policy), mask a host regression from telemetry, and leave the workaround behind as permanent cruft after the upstream fix.
3. **Retries are noise.** Retrying against a Remote whose service never registered just re-renders 「文件资源服务不可用」 and adds churn; `meta.status 'none'` says there is no transient error to retry through.
4. **Address rewriting is lying about scope.** For F1, rewriting `absolute` addresses into `session` scope to dodge the narrowed `canOpen` defeats a deliberate policy change (or, if unintended, destroys the evidence upstream needs). F1's disposition is an upstream question ("should absolute-scope links remain claimable?"), not a local hack.

**Order of action for the maintainer:**

1. **First cheap step — clean restart + fresh client state, then re-verify.** Fully kill stale node/dsh processes (an npm-global in-place upgrade on Windows readily leaves an old server bound to the port), start `dsh web` fresh, hard-refresh the browser (Ctrl+F5 / cleared cache) so the `__DSH_BOOT__` roster is re-fetched. Then re-check: served manifest lists documentpreview + workspace-files at current revs; per-module probe still 62/62; open a **brand-new session** and retry the read. Precedent: #5999 round 1's restart self-healed the roster/combo mismatch once. Also try a **fresh throwaway profile** on alpha.2 — if the read works there, the trigger is aged-profile state (0.1.2/0.1.3 era session records / lookups), not alpha.2 code per se. All of this is non-destructive and minutes-scale. (In this scenario a restart already happened and F2 persisted — so for this exact boot, step 1 is the new-session/fresh-profile discrimination plus confirming no stale server answered the probes.)
2. **Escape hatch — rollback to a version verified good on this profile.** `npm i -g @deepseek-ai/dsh@0.1.3-alpha.2` is the escape hatch **verified in #5999** on this same deployment; alternatively keep alpha.2 but run it on a newly created profile while the old profile stays untouched. Rollback restores function immediately; do it **before** any deeper surgery. Never hand-edit `node_modules` or hand-migrate profile state to "fix" this.
3. **Upstream — report with full forensics.** Append the evidence package to discussion #5999 as round 2 (the fixture records this was done: comment 18371079), or open a tracking issue if maintainers prefer; include repro, the §5 checklist, the rollback verification, and the aged-profile detail so the fix can be tested against the same upgrade path. Re-test on the next alpha before upgrading the daily-driver profile again.

**Do not**, at any point: build silent workarounds into external plugins, treat the paste-input warnings as related, or cite the joined-URL 404 as justification for any action.

---

## 5. Prevention and upstream packaging

**Forensics a complete upstream report needs:**

- **Environment**: OS (Windows 11), node/npm versions, npm-global prefix, upgrade path 0.1.5-alpha.1 → alpha.2 (in-place), profile creation version (0.1.2/0.1.3), the six external plugins with names, versions, and linkage method (junctions).
- **Terminal output** of the upgrade and of `dsh web` start/restart, verbatim (here: "[dsh-profiles] ready", URL printed, no errors — itself a datum: the boot considered itself healthy).
- **The served `__DSH_BOOT__` manifest** (full, with capture time; entry count verbatim — 60 in this excerpt — and per-row revs), plus the relevant `packages/bundle/web-app/cordis.patch.yml` rows (workspace-files present; documentpreview row; textpreview row gone).
- **Probe table**: single-entry combo (200), per-module sweep (62/62 200), and the synthetic joined URL (404) with its exact URL and length — **explicitly labeled as an invalid control** so no future reader re-cites it as "modules missing".
- **Exact repro** of F1 and F2 separately: the verbatim address strings (`dsh-resource://file/absolute/E:/deepseek-harness/dsh-input-history/package.json`; `dsh-resource://file/session/session-2844c12c-…/.dsh/tmp/sidebar-open-test-2.md`), dialog texts (无法打开文件 / 重试), and the tab's UI string 「文件资源服务不可用。」.
- **Internal state observed**: `meta.status === 'none'` in the failing tab, where inspected, and that no console error accompanied it.
- **Contrast probe**: file-trace own-RPC read of the same file succeeding at the same moment (the single most valuable exclusion datum).
- **Console excerpt**: no documentpreview/sidebar output; paste-input fold warnings listed **as unrelated** with the reason.
- **Host-side state probes** (the discriminating data for the exact stall point): is the workspace-files service registered/instantiated on this boot? Did the inject chain (`api-gateway`, `client-resources`) resolve on the client? Did the typert `lookups.register` session-root entry register for the failing session — does `sessions.get(sessionId)?.header.cwd` exist for a 0.1.2-era session record, did the `sandboxPolicy.workspaceRoot` fallback fire, and what root did it yield?
- **Intervention history**: what each restart changed (roster self-heal in round 1, read still failing), new-session and fresh-profile results, rollback version + verified outcome.
- **Cross-links and timestamps**: #5999 round 1, round 2 comment 18371079, capture times for every artifact (resolving the 60-vs-62 count discrepancy).

**What the host should check at boot so this class of failure fails loud:**

1. **Roster ↔ artifact self-consistency**: after generating the roster, probe every entry URL at its own rev (HEAD/GET or hash check); log and surface any 404/mismatch at boot instead of letting clients discover it later (the alpha.1 failure mode).
2. **Service-registration assertion**: after wiring, enumerate declared services (`api-workspace-files` et al.) and assert each registered/instantiated with its inject dependencies resolved; a first-party UI component depending on a Remote that never comes up should produce a red console entry and a boot-log error — not a silent `'none'`.
3. **Session-root resolution health check**: at startup and on session load, run the `lookups.register` resolver for each active session; warn when `header.cwd` is missing and the fallback engages, error when neither resolves. Aged-profile sessions are exactly where this goes quiet.
4. **Client-side timeout with diagnostics**: documentpreview should move `meta.status` from `'none'` to a reasoned `'error'` after a bounded timeout, name the unresponsive service in the console, and offer a retry — never render a bare 「不可用」 string with zero console signal.
5. **Renamed/removed-package guard on upgrade**: when building the roster over an aged profile, detect rows referencing removed/renamed packages (textpreview) or expected replacements that are missing, and fail loud or migrate deliberately.
6. **Scope-policy UX**: when no tab type claims an address because of scope narrowing, the dialog should say so ("absolute-scope files are no longer openable in the sidebar") instead of the generic no-claimant error — turning F1 from a mystery into a documented behavior change.
7. **Version-skew canary**: log host version + profile schema version at boot and warn on in-place upgrades over aged profiles, so evidence collection can start before the user hits the failure.

---

## Appendix — epistemic limits

The fixture proves: F1 = scope-narrowed claiming in the replacement package; F2 = a silent stall in the workspace-files service chain with the file, the server, the artifacts, and the external plugins all exonerated. It cannot prove **which link** of that chain (host registration, Remote resolution, or session-root lookup) is the exact stall point; §5's host-side probes are the discriminating experiments, and until they run, rollback (§4.2) — not a workaround — is the correct user-facing disposition.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.