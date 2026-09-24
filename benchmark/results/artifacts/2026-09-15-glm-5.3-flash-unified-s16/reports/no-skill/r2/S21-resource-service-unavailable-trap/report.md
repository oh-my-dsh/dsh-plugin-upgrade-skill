# S21 — The Resource Service That "Unavailable" (diagnosis report)

Environment: dsh 0.1.5-alpha.1 → 0.1.5-alpha.2 in-place npm-global upgrade, Windows 11,
profile created under 0.1.2/0.1.3, six external client plugins junction-linked.
Evidence: `/app/fixture/` (read-only). Prior art: deepseek-harness discussion #5999 (alpha.1
round of the same failure family; forensics for this round appended there as round 2,
comment 18371079).

**Verdict up front.** Two independent things changed, and only one of them is a defect on
this boot:

1. The *absolute-scope dialog* (symptom 1) is the expected consequence of the alpha.2
   rename `ui-sidebar-textpreview` → `ui-sidebar-documentpreview`: the new document tab's
   `canOpen` accepts only `parseFileAddress(address)?.scope === 'session'`, so nothing
   claims `dsh-resource://file/absolute/…` anymore.
2. The *content-read failure* (symptom 2 — tab titled correctly, content area shows
   「文件资源服务不可用。」) is a host-side failure of the **runtime resource-provider
   chain** (`api-workspace-files` Remote used by the sidebar tab). Static serving, tab
   registration, and filesystem access are all exonerated by the evidence.

---

## 1. Attribution — which layer actually fails

The failing layer is the **runtime client↔service RPC chain for file resources**
(the `api-workspace-files` Remote that the documentpreview tab calls), **not** static
artifact serving, **not** tab-type registration, and **not** the host's ability to read
the file.

What the two readers of the same file, at the same moment, rule in and rule out
(contrast-probe.txt):

| Observation | Rules OUT | Rules IN |
|---|---|---|
| file-trace plugin reads the same file fine via its **own** host RPC (`/dsh-file-trace/*`), both 原文 and 阅读 modes | File absence, bad path/encoding, Windows permissions, host process down, broken session→workspace-root resolution (`sessions.get(...)?.header.cwd` / `sandboxPolicy.workspaceRoot`), and any "file is outside an allowed root" theory | The host's file-read capability and the session root resolution work end-to-end |
| documentpreview sidebar tab fails on the same file via the **api-workspace-files Remote** | A filesystem-level cause; a client-bundle-level cause (the tab UI itself loads, renders the title, and passed `canOpen`); static serving (62/62 probes 200) | The failing leg is exactly the sidebar tab's transport: the workspace-files resource-provider chain on this boot |

This matches prior art: #5999 round 1 already observed "the sidebar tab's content read
STILL failed on that boot (文件资源服务不可用) — the resource-provider chain did not take
over", even after a restart had healed the roster/combo mismatch.

**What the metadata status says about where the read stalls.** In the failing tab
`meta.status` stays `'none'`. A healthy read moves through a lifecycle
(`none → loading → done`), and a failing read lands in an error state with a message.
Status frozen at `'none'` means **no lifecycle transition ever happened**: the read
request was never dispatched/accepted by a bound service — it stalled at the very first
hop, in the client's binding to the workspace-files resource service (or at a host that
never registered its provider side). That is why the tab can only render a generic
「文件资源服务不可用。」placeholder with no error detail and no retry hint, and why the
console shows no red errors: nothing "errored"; nothing ran. The 服务不可用 message is
the client's rendering of an *unbound/unavailable* service handle, not of a failed read.

## 2. Probe discipline — which combo probe is valid

The evidence contains three probes with opposite-looking results; only one of the two
"combo" probes measures static artifact serving:

- **Valid: Probe 3, the per-module sweep — 62/62 HTTP 200.** Each manifest entry is
  fetched exactly the way the loader consumes it: one URL per module, taken verbatim from
  the `__DSH_BOOT__` roster (`/plugins/??<id>/client.js&rev=…`). 200 on every entry
  proves the combo route serves every artifact at the current rev. Probe 1 (single
  module, 200, 73,616 bytes) is consistent with this.
- **Invalid: Probe 2, the all-62-entries-joined URL — 404.** This concatenates all 62
  modules into one ~4–5 KB URL. A 404 here measures the **combo route's URL
  length/entry-count limits** (or the router rejecting an oversized path), not the
  existence of the modules. It conflates "the route refuses this giant URL" with "an
  artifact is missing".

Why the failing probe must never be cited as "modules missing":

- It is contradicted by the direct measurement (62/62 individual 200s at the same rev) —
  every module the join referenced is in fact served.
- It invites re-importing the **alpha.1** diagnosis (roster listed new modules while the
  combo 404'd them at the same rev → "loaded without registering"). That failure class is
  *ruled out* on this boot: every roster row serves. Citing the join-404 would re-litigate
  a bug that is not present and send the fix in the wrong direction.
- It is not a measurement the real loader ever performs.

**How the real loader fetches the roster:** the client does not discover modules by
probing URLs; it parses the `__DSH_BOOT__` roster embedded in the same-origin boot HTML
(each row: `id`, `url`, `inject`) and loads each listed URL as given — exactly the shape
the per-module sweep reproduced. Any validity claim for a probe must come from mimicking
that consumption, entry by entry, at the manifest's rev.

## 3. Distractor separation — the paste-input warnings and the rename

**The `dsh-paste-input: fold skipped (parse failed)` warnings are unrelated to the
content-read failure.**

- They come from a *different plugin's* feature: collapsing historical paste-attachment
  message bubbles (the `==== DSH_PASTE_INPUT_V1 ===` marker protocol) into 📎 chips. They
  repeat once per historical paste-attachment message — a per-message client-side parse
  skip, not a service call.
- They are warnings (`▲`), not red errors; the console excerpt shows **no** errors from
  documentpreview or the sidebar. A parse-failed fold-skip cannot hold `meta.status` at
  `'none'` on an unrelated tab's Remote call. Keep them as a separate (cosmetic,
  plugin-local) issue.

**What else changed in the roster between versions, and does it explain the symptom?**

The alpha.2 tree **replaced `packages/client/ui-sidebar-textpreview` with
`packages/client/ui-sidebar-documentpreview`** (boot manifest: `ui-sidebar-textpreview`
→ 0 mentions; `cordis.patch.yml` carries the `ui-sidebar-documentpreview` row; the old
row is gone). The new package registers a document tab whose `canOpen` accepts only
`parseFileAddress(address)?.scope === 'session'`; the old textpreview was the registrant
of the `"text"` tab type claiming `dsh-resource://file/**`.

- This rename **fully explains symptom 1** (the absolute-path link dialog): with
  textpreview gone and documentpreview refusing non-session scope, no tab type claims
  `dsh-resource://file/absolute/…`, so the host falls back to the
  "no registered tab type claims …" dialog.
- It does **not** explain symptom 2: a session-scoped address passes `canOpen` (the tab
  opens, correctly titled), so the registration layer worked; the failure is downstream
  in the read. A scope narrowing in `canOpen` cannot freeze `meta.status` at `'none'`,
  and it cannot explain why file-trace's own RPC reads the same session-scoped file fine.

So: two distinct issues. (a) By-design scope narrowing surfaced as an opaque dialog on
absolute links; (b) the actual defect — the workspace-files resource-provider chain not
taking over on this boot. The rename is context for (a) and a red herring for (b).

## 4. Mitigation decision — should the plugin work around it?

**No.** The defect is host-side (the resource-provider chain binding on this boot); a
plugin cannot fix an unbound host service. Concretely:

- **Rewrite** (point links at session scope, or re-register a claiming tab type): at best
  it papers over symptom 1's dialog; it does nothing for symptom 2, since the failing leg
  is the same Remote any claiming tab would call. It also destroys the diagnostic signal.
- **Retry**: pointless — `meta.status` stuck at `'none'` means the request never leaves
  the gate; there is nothing transient to retry.
- **Fallback** (render content via the plugin's own RPC in the sidebar tab): technically
  possible for file-trace, but it would silently mask a host regression, fragment the
  product's file-open behavior, and remove the reproducibility upstream needs. The
  plugin's working RPC is diagnostic evidence, not a license to bypass.

Recommended order of action for the **maintainer**:

1. **First cheap step — restart the host and re-verify.** `dsh web` restart is free and
   has prior art: in #5999 round 1 a restart self-healed the roster/combo mismatch. After
   restart: re-fetch `__DSH_BOOT__`, confirm the `api-workspace-files` row and its
   `inject` entries (`dsh-api-gateway`, `dsh-client-resources`) are all present, and
   re-run the per-module sweep. Expectation set by prior art: the *serving* layer heals
   with restarts, the *content read* did not — so if the tab still shows
   「文件资源服务不可用。」with `meta.status: 'none'`, stop iterating locally.
2. **Escape hatch — rollback to the last known-good published version.** Verified in
   prior art on this very profile: `npm i -g @deepseek-ai/dsh@0.1.3-alpha.2` restored a
   working sidebar read path (the old textpreview claiming `dsh-resource://file/**`).
   Rollback is the correct move whenever sidebar file preview is needed for real work;
   keep alpha.2 only in a throwaway profile for forensics.
3. **What goes upstream — the forensics package** (Section 5), appended to discussion
   #5999 as round 2 (comment 18371079), because this is a host bug in the
   upgrade/boot path, not something any of the six external plugins should absorb.

Interim user-level workaround (no code): read the file through file-trace's own panel
(原文/阅读), which is verified working; treat the sidebar preview as down until the host
fix lands.

## 5. Prevention / upstream

**Forensics a complete upstream report needs** (all already collected in this pack —
attach verbatim to #5999 round 2):

- Versions and mutation: 0.1.5-alpha.1 → 0.1.5-alpha.2, `npm i -g`, in-place, Windows 11;
  **profile provenance** (created under 0.1.2/0.1.3, six external client plugins
  junction-linked) — the recurring precondition of this failure family.
- Boot manifest excerpt: the `api-workspace-files` row with its `inject` list; the
  `ui-sidebar-documentpreview` row present and `ui-sidebar-textpreview` absent (rename);
  the `cordis.patch.yml` rows.
- Probe results, correctly framed: per-module sweep **62/62 HTTP 200** at the manifest rev
  (plus the single-module 200), and the all-joined 404 explicitly labeled invalid
  (URL-size artifact) so nobody reads it as "modules missing".
- The contrast probe: same file, same moment — file-trace's own RPC reads fine;
  documentpreview's api-workspace-files Remote fails with `meta.status` frozen at
  `'none'`; the exact session-scoped address and on-disk path; the host-side notes
  (workspace-files row in the bundle patch; session-root resolution via
  `lookups.register`; read() docs saying outside-workspace files are allowed).
- Console excerpt showing the absence of errors (silent placeholder, no retry hint) and
  the unrelated paste-input warnings flagged as such.
- Repro steps (upgrade in place → restart → click session-scoped chat file link), the
  timeline, prior-art cross-reference (#5999 round 1, restart self-healed serving but not
  the read), and the verified rollback escape hatch.

**What the host could check at boot so this class fails loud:**

- **Post-boot provider self-test:** after the roster is built, exercise the
  resource-provider chain once (e.g., write+read a probe file under a session workspace
  through the api-workspace-files service). If the read does not complete, raise a loud,
  named terminal error ("resource provider chain not bound") instead of booting clean —
  today the terminal showed "[dsh-profiles] ready" with no visible errors.
- **Inject-dependency verification:** every `inject` entry in the `__DSH_BOOT__` rows
  (e.g., api-workspace-files requires `dsh-api-gateway` and `dsh-client-resources`)
  should be verified loaded/registered before the host advertises the dependent module;
  an unsatisfied inject should be a boot failure or a loud warning, not a silently
  unbound Remote.
- **Fail loud in the client:** when a Remote/service handle is unbound, the placeholder
  tab (「文件资源服务不可用。」) should also log a console error and offer a retry /
  diagnostics affordance. A silent `meta.status: 'none'` with no red error is what made
  this failure look like "nothing happened".
- **Profile/version-skew detection:** a profile created under 0.1.2/0.1.3 and upgraded
  in place across two minors is the recurring precondition (#5999 round 1 and this
  round). The host should detect stale/skewed profile state on boot and either re-run
  migration or warn loudly, rather than serving a partially wired client.
