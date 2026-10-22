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
#### FILE: S21-report.md

# S21 — The Resource Service That "Unavailable" — Diagnostic Report

## 1. Attribution: which layer actually fails

The failing layer is **not** the sidebar UI, **not** static module serving, and **not** the file itself. It is the **workspace-files resource service (api-workspace-files Remote)** — the runtime read/metadata chain behind the documentpreview tab.

Evidence and reasoning:

- The tab **renders a correct title** ("sidebar-open-test-2.md") and opens at all — so tab-type claiming, address parsing, and the sidebar shell all work. The failure is confined to the **content read**.
- The **contrast probe** is decisive: two readers of the *same file at the same moment*:
  - file-trace plugin via its own host RPC (its `/dsh-file-trace/` routes) → **reads fine**, both 原文 and 阅读 modes. This rules out: the file (exists, readable), the host process's filesystem access, sandbox ACLs, path encoding, and anything Windows/junction-specific.
  - documentpreview sidebar tab via api-workspace-files Remote → **fails**: `meta.status` stays `'none'`, tab shows 「文件资源服务不可用。」
- `meta.status` staying at **`'none'`** (not `'error'`) says the read **stalls before it even starts**: the metadata request never produces a response the client can observe — the service-facing chain (service registration / lookup / transport into `@deepseek-ai/dsh-api-workspace-files`) never hands back a result. It is a *never-arrives* failure, not a *read-then-reject* failure. Combined with **zero red console errors**, the request is swallowed silently in the resource-provider chain rather than erroring in the UI.
- Ruled in: the host-side workspace-files service wiring on this profile (the Remote never answers). Ruled out: tab registration, static combo serving (62/62 200), file existence, and — per the host notes — the ".dsh/tmp is under workspace root" theory, because the service explicitly allows files outside the workspace and the path is *inside* it anyway.

## 2. Probe discipline: which combo probe is valid

- **Valid measurement: Probe 3, the per-module sweep (62/62 HTTP 200).** That is how the real loader actually fetches the roster: the client requests **each manifest entry individually** (the boot manifest carries one URL per module, each with its own `rev=...-N` suffix), so per-module 200s are the measurement that matches reality. Verdict: **static artifact serving is healthy** on alpha.2; "modules missing" is disproved.
- **Invalid measurement: Probe 2, the all-62-joined mega-URL → 404.** It must **never** be cited as "modules missing" because:
  1. **It tests an interface nothing uses.** The loader never joins all 62 entries into one combo URL; it fetches them per entry. A 404 on a synthetic URL says nothing about the real fetch path.
  2. **The 404 is an artifact of the probe itself**: a ~4–5 KB joined URL with 62 comma-joined module specs hits URL-length / combo-format limits of the `/plugins/??` route — a transport constraint, not a content-missing signal. A 404 there cannot distinguish "module absent" from "request malformed/oversized".
  3. Probe 2 also collapses the per-entry `rev` suffixes into one `-0`, so it isn't even requesting what the manifest requests.
- So: Probe 2 is a **negative control that only proves the naive join is invalid**; Probe 3 is the authoritative check. (Contrast with the alpha.1 round in discussion #5999, where the combo route 404'd the *newly-listed* modules *at their manifest rev* — that was a genuine roster/combo mismatch. On alpha.2 the same test returns 200, so that bug class is closed.)

## 3. Distractor separation

- **`dsh-paste-input: fold skipped (parse failed)` warnings: unrelated.** They fire on *historical paste-attachment messages* (the `DSH_PASTE_INPUT_V1` marker protocol in old chat bubbles) at render time, are client-side parse warnings, and live in a different plugin with no connection to the workspace-files resource chain. They are noise, not cause.
- **What actually changed in the roster between alpha.1 → alpha.2**: the package `packages/client/ui-sidebar-textpreview` was **replaced by** `packages/client/ui-sidebar-documentpreview` (boot manifest: textpreview 0 mentions, documentpreview row in cordis.patch.yml). The old textpreview registered the "text" tab claiming `dsh-resource://file/**`; the new documentpreview's document tab has `canOpen: parseFileAddress(address)?.scope === 'session'` only.
- **Does the rename explain the symptom? Partially — it explains the first symptom, not the second:**
  - The `no registered tab type claims "dsh-resource://file/absolute/…"` dialog for out-of-workspace links **is** explained: the absolute-scope claimer is gone; the new tab accepts session scope only.
  - The session-scoped tab showing 「文件资源服务不可用。」 is **not** explained by the rename — the tab *does* open; it is the backend read through api-workspace-files that never answers (contrast probe). The roster change and the service unavailability are two separate bugs that happen to be visible in the same click path. Keep them separate in the report.

## 4. Mitigation decision

- **The plugin should NOT work around the unavailable service.** No rewrite/retry/fallback in documentpreview: the contract is "host provides workspace-files resource service", and 62/62 modules load fine — a plugin-side fallback would mask a host wiring regression, fork the read path (file-trace already proves a second read path exists; duplicating it inside the preview tab creates two divergent semantics), and turn a loud host bug into silent technical debt.
- **Order of action for the maintainer:**
  1. **First cheap step — full host restart / clean re-resolve** (restart `dsh web`; if needed, reinstall alpha.2 so the npm-global tree is internally consistent). On alpha.1 a restart self-healed the roster/combo half of this failure family once — it is the cheapest probe of "stale in-place-upgrade state" and costs minutes.
  2. **Escape hatch — rollback to the previously published version** (`npm i -g @deepseek-ai/dsh@0.1.3-alpha.2`), already verified on this deployment in discussion #5999. Use it if the restart doesn't restore the read and the workflow is blocked.
  3. **Upstream — file/append the forensics** (this evidence pack) to the existing failure family thread (#5999, round 2 = comment 18371079) rather than working around locally.
- Do **not** "fix" it by pointing links through file-trace or patching the junction-linked external plugins — none of the six externals is implicated (all present and serving).

## 5. Prevention / upstream

**Forensics a complete upstream report needs:**
- Exact versions and upgrade path (npm global 0.1.5-alpha.1 → 0.1.5-alpha.2; profile lineage 0.1.2/0.1.3; Windows 11; six junction-linked external plugins).
- `window.__DSH_BOOT__` roster excerpt (60/62 entries, rev ids) + the cordis.patch.yml rows for workspace-files and documentpreview.
- Both probes: per-module sweep (62/62 200) and the naive join (404) **labeled invalid** so it isn't misread.
- The contrast probe table (file-trace RPC OK vs api-workspace-files Remote `meta.status: 'none'`) — this is the piece that localizes the stall.
- Console excerpt (no resource errors; only unrelated paste-input warnings), the symptom timeline, and the host-side notes on session workspace-root resolution (typert lookups.register → sessions.get(sessionId)?.header.cwd fallback sandboxPolicy.workspaceRoot).
- Whether the service plugin actually activated host-side (host logs / plugin state), which this pack couldn't capture — upstream should ask for it.

**What the host could check at boot to fail loud:**
- **Boot-time service self-check**: after plugin activation, the host should verify that every service declared in the bundle patch (e.g. `@deepseek-ai/dsh-api-workspace-files`) actually registered its Remote face — and **refuse to boot (or banner loudly)** if a declared service is silent, instead of letting tabs render 「文件资源服务不可用。」
- **Roster/combo consistency check**: the host knows the manifest it served; it can HEAD each entry at boot and fail loud on any non-200 (this is exactly the alpha.1 bug class).
- **Metadata-read watchdog / error surfacing**: a resource read whose `meta.status` never leaves `'none'` within a timeout should raise a visible host error naming the service (`api-workspace-files unreachable`), turning the silent stall into an actionable diagnostic.
- **Session-root resolution assertion**: log/verify the resolved workspace root per session at registration time, so a lookup that fell back (or returned nothing) is visible in host logs.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.