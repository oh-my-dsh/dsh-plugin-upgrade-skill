# S21 · The Resource Service That "Unavailable" — Diagnosis Report

**Subject:** dsh `0.1.5-alpha.1 → 0.1.5-alpha.2` in-place npm-global upgrade on Windows 11; profile created under `0.1.2/0.1.3`; six external client plugins junction-linked.
**Mode:** A · inspect (read-only diagnosis). Evidence pack is read-only and was not modified.
**Deliverable:** this report. Prior art: [discussion #5999](https://github.com/deepseek-ai/deepseek-harness/discussions/5999) round 1 (alpha.1) + round 2 comment [18371079](https://github.com/deepseek-ai/deepseek-harness/discussions/5999#discussioncomment-18371079).

## Verdict in one line

There are **two failures at two different layers**, and only one of them is a bug. The out-of-workspace link dialog is the *intended* consequence of the `ui-sidebar-textpreview → ui-sidebar-documentpreview` rename (card **DSH-0.1.5-A2-09**); the titled-but-empty tab is a **host-side resource-provider-chain gap** — the `file` resource provider's read over the `api-workspace-files` Remote never resolves (`meta.status` stays `'none'`). It is the same "resource-provider chain did not take over" family as #5999 round 1 (card **DSH-0.1.5-A1-20**), now *narrowed*: static serving has healed (62/62 per-module 200), but the runtime read is still dead. The `dsh-paste-input` warnings and the all-62-joined 404 are **distractors** and must not be cited as the cause.

---

## Q1 · Attribution — which layer fails, what the two readers rule in/out, and where the read stalls

### The tab renders a title ⇒ the claim layer works; it renders no content ⇒ the read layer fails
- **Title renders** → the documentpreview tab **claimed** the address, **registered**, and derived the filename from the address. So the sidebar/documentpreview tab registration and address-scope claim are healthy for a **session-scoped** address.
- **Body is only `文件资源服务不可用` (file resource service unavailable)** → the **content-read layer** is what fails. Content is loaded through the `file` resource provider — `createFileResourceProvider(remote, changes)` injecting `['resources','remote','remote.workspaceFiles']` (card **DSH-0.1.5-A2-01**) — which calls the `api-workspace-files` Remote to obtain the `WorkspaceFileStat`. That read never completes.

So the failing layer is the **runtime resource-read / provider → Remote transport seam**, *not*:
- the static module serving (per-module probe = 62/62 HTTP 200, see Q2),
- the tab/claim layer (the title proves it registered and claimed),
- the documentpreview package (it loaded and opened the tab),
- the filesystem or the file (see the contrast probe).

### What the two readers of the same file rule IN and rule OUT
From **contrast-probe.txt** — same file, same instant, two readers:

| Reader | Transport | Result | What it establishes |
|---|---|---|---|
| file-trace plugin | its **own** host RPC, `/dsh-file-trace/*` routes, own HTTP face | **READS FINE** (原文 + 阅读 both show content) | **Rules OUT** every filesystem-side cause: the file exists, its bytes are present, the composed `ctx.fs` grants read access, the path resolves, it is not locked, and workspace containment is not the blocker (card **DSH-0.1.5-A2-02**: reads may target paths outside the workspace root; `outside-workspace` now applies to listings only). |
| documentpreview sidebar tab | `api-workspace-files` Remote (the `file` resource provider path) | **FAILS** — `meta.status` stays `'none'`, the read **never arrives**, tab shows `文件资源服务不可用` | **Rules IN** the `api-workspace-files` Remote / `file` resource-provider registration-activation path as the *specific* failing component. |

Together the two readers localize the fault with no ambiguity: **not the file, not the filesystem** (file-trace reads it) and **not the tab** (title renders) — the break is precisely in the resource-provider chain that should carry the `api-workspace-files` read to the documentpreview tab.

### What `meta.status === 'none'` says about where the read stalls
`meta` is the resource metadata snapshot (`WorkspaceFileStat`) that the provider is supposed to deliver. The status value is the tell:
- A read that **reached** the service and was **rejected** would resolve to an **error status** — `workspace-file/unknown-workspace` (the documented outcome for an `absolute` scope address, A2-01), `too-large` (over `maxFileBytes`, A2-02), or `outside-workspace` (a listing). Those are *answered* failures.
- `'none'` is the **unresolved / never-answered** state: the provider never produced any snapshot, so the request either never reached a live handler or the handler never returned.

That places the stall **at the provider → Remote seam, before the workspace-files service logic ever runs** — a registration/activation gap, i.e. "the resource-provider chain did not take over" (#5999 round 1). It is *not* an authorization or size error; those would have flipped `meta.status` to a concrete code. This matches the contrast-probe host note that the workspace-files row **is** in `cordis.patch.yml` and the scope lookup (`sessions.get(sessionId)?.header.cwd → sandboxPolicy.workspaceRoot`) is wired — the *inputs* to the read are all present, yet the read is never dispatched.

---

## Q2 · Probe discipline — which combo probe is valid, and how the real loader fetches

The pack contains two combo probes with opposite-looking results. Only one measures static artifact serving.

- **VALID — Probe 3, the per-module sweep (62/62 HTTP 200).** This fetches each module exactly the way the boot manifest advertises it and the way the client module loader loads it: **one combo URL per roster entry**. It proves every static artifact serves at the served rev. It is also the disciplined attribution probe carded in **DSH-0.1.5-A1-20**: *"fetch one NEW bundle module and one OLD module at the same rev; old 200 + new 404 pins the gap to the host's artifact/rev set, not to the plugin."* Here the modern equivalent — sweep all entries individually — returns **zero 404s**, so the artifact/rev set is complete.
- **INVALID — Probe 2, all 62 entries joined into one URL (404, zero-length body).** This is a **probe-construction artifact, not a measurement**. The joined URL is ~4–5 KB long; the `/plugins/??` combo route does not accept that many modules concatenated into a single request, so it 404s on the request shape itself. It does not resemble anything the loader does.

### Why the failing probe must never be cited as "modules missing"
Citing Probe 2's 404 as "modules are missing" would be a **false negative produced by the probe, not the host**. Proof: the *same* modules each return **200 individually**. A genuine "module missing / combo omission" (the A1-20 failure) manifests as a **per-module 404 for a NEW bundle module while an OLD module at the same rev returns 200** — and that is *exactly what is not happening* here. The all-joined 404 tells you the *probe* was malformed (over-long URL), nothing about module availability. Contrast with round 1: there, per-module fetch of the newly-added `ui-sidebar-*` modules returned 404 at that rev while old modules returned 200 — *that* was the real combo-omission signal, and a host restart self-healed it. Round 2 shows the combo gap has healed; the remaining defect is the runtime read, not serving.

### How the real loader fetches the roster
The client module loader reads the boot manifest (`__DSH_BOOT__`, fetched same-origin after restart) and loads **each entry by its own advertised combo URL** — e.g. `/plugins/??@deepseek-ai/dsh-api-workspace-files/client.js&rev=…`, one request per row. It never joins all 62 modules into one giant URL. Therefore **Probe 3 mirrors the real loader** and is the citable measurement; **Probe 2 does not** and must be discarded.

> Forensic note for upstream: `boot-manifest-excerpt.txt` header says **"Total entries: 60"** while the sweep and symptom log say **62**. Reconcile the exact roster count in the report (did the roster change between the boot fetch and the probe, or is the header stale?) so the roster is provably stable — a moving count is itself something a boot check should catch.

---

## Q3 · Distractor separation

### Are the repeated `dsh-paste-input` fold warnings related to the content-read failure? — **No.**
They belong to a **different subsystem**: the paste-attachment folding of the `==== DSH_PASTE_INPUT_V1 ====` marker block and the `.dsh/tmp/attachments/<session>/<send>/` directory logic, collapsing verbose attachment-path text in a message bubble into a 📎 chip. `console-excerpt.txt` states outright there is **"no other console output captured on the failing page"** and that the protocol **"does not depend on snapshot-internal implementation details."** There are **zero documentpreview / resource / sidebar red errors**. The warnings repeat once per *historical* paste-attachment message, so they are a **pre-existing, simultaneous, unrelated bug** (message-bubble rendering), not the file-resource read path. Keep them in a separate bucket; do not let repeating console noise masquerade as the cause of a silent read stall.

### What else in the roster changed between the two versions, and does it explain the symptom?
The visible roster change is **`ui-sidebar-textpreview` → `ui-sidebar-documentpreview`** (card **DSH-0.1.5-A2-09**, corroborated by the npm registry: the old package stops at alpha.1, the new one resolves at alpha.2). In alpha.1 the `text` tab claimed `dsh-resource://file/**` (**any** scope); the alpha.2 documentpreview tab's `canOpen` accepts `parseFileAddress(address)?.scope === 'session'` **only**. New packages `chunked-list` / `tool-present` (A2-10) and the `workspaceFiles`/`client-resources` surface changes (A2-01/A2-02/A2-14) also landed.

Does that rename explain the symptom? **It explains symptom 1, not symptom 2:**
- **Symptom 1** (out-of-workspace `dsh-resource://file/absolute/…` link → `no registered tab type claims …`, dialog 无法打开文件/重试): **yes** — an *absolute*-scope address no longer has any claiming tab, because the old all-scope `text` tab is gone and the new document tab is session-scoped. This is the rename working **as redesigned** — a real UX regression for out-of-workspace links, but not the content-read bug.
- **Symptom 2** (session-scoped test file → titled tab opens, body = `文件资源服务不可用`): **no** — the session-scoped address *did* claim and open the documentpreview tab (the title proves the new package loaded and registered), so the rename did not break this path. The failure is downstream, in the `file` resource provider → `api-workspace-files` Remote read (Q1). Attributing symptom 2 to "the package was renamed so it can't read" would be a category error.

Bottom line: the rename and the paste-input warnings are both real, simultaneous changes, but **neither** is the cause of the empty-content read. Two unrelated things changed/shone at the same time as a third, deeper host gap.

---

## Q4 · Mitigation decision — should the plugin work around it, and in what order to act

### Should the plugin work around the unavailable service? — **No.**
This is a **host-side registration/activation gap** in a first-party read path, not a transient or plugin-fixable condition. All three workaround variants are wrong here:
- **Rewrite** (e.g. force `absolute → session` scope): only touches symptom 1, which is *intended* A2-09 behavior; does nothing for the content read; masks a design decision rather than a bug.
- **Retry**: the read **never arrives** (`meta.status` `'none'`) — a registration/transport stall, not a timeout. Retrying a never-dispatched call is futile, and the skill forbids auto-retrying `gateway/internal`-class failures unless idempotent **and** genuinely retryable **and** policy-allowed — none of which hold.
- **Fallback** (reimplement the read via another path, à la file-trace's own RPC): **conceals a host incompatibility** (the skill explicitly forbids modifying core to conceal plugin incompatibility), diverges from the sanctioned `file` resource contract, and leaves the real defect in place for every other consumer.

The correct fix is **host-side**; consumers should **report, not paper over**.

### Order of maintainer action
0. **Attribute first** (done above): host resource-provider-chain gap — not a plugin bug, not static serving, not the fs, not the rename.
1. **First cheap step — one clean, fully-stopped host restart + hard browser refresh, then confirm the read.** Fully stop every `dsh` process (a browser refresh is *not* a host stop; the client bundle is cached), `dsh web` restart, hard-refresh, re-open the session-scoped link, and check that the `api-workspace-files` service actually **activated** (not a pending service) and `meta.status` leaves `'none'`. This is the cheap probe that separates "stale registration that self-heals" (A1-20: the restart healed the roster/combo) from "the provider chain genuinely did not take over." *Expectation from #5999:* the restart healed the combo but **not** the content read in round 1 — so this step may **confirm** the host bug rather than fix it.
2. **Escape hatch — external pinned rollback to the last verified version.** From an **EXTERNAL** terminal, after fully stopping the host: `npm i -g @deepseek-ai/dsh@<last-verified>` (#5999 verified `0.1.3-alpha.2`; the immediate prior line is `0.1.5-alpha.1`). **Pin the exact version** — a bare package name resolves to `latest` and can silently downgrade. This restores known-good while the host fix lands.
3. **Upstream — file the forensics** (see Q5), appended to **#5999** (round 2, comment 18371079). The fix belongs in the host: make the documentpreview tab's `file` resource provider / `api-workspace-files` Remote reliably register and activate across an in-place upgrade, and add the boot-time fail-loud check.

---

## Q5 · Prevention / upstream — forensics package, and a boot check that fails loud

### Forensics a complete upstream report needs
1. **Environment / identity:** dsh `0.1.5-alpha.1 → 0.1.5-alpha.2`, npm-global **in-place**, Windows 11, profile created under `0.1.2/0.1.3`, Node version, six junction-linked external client plugins (file-trace et al.).
2. **The two distinct dialogs, separated by layer:** (a) absolute-scope `dsh-resource://file/absolute/…` → `no registered tab type claims …` = tab-claim/scope layer (A2-09 rename, intended); (b) session-scoped file → titled tab + `文件资源服务不可用` = content-read layer (the actual bug).
3. **The contrast probe** — the decisive evidence: file-trace's own RPC **reads fine**; the documentpreview tab's `api-workspace-files` Remote read **never arrives** (`meta.status` `'none'`). This isolates the fault to the provider→Remote seam and rules out fs/file/tab.
4. **The valid probe only:** per-module sweep **62/62 HTTP 200** (static serving healthy); explicitly flag the **all-62-joined 404 as an invalid probe** (over-long-URL artifact) so it is never read as "modules missing." State the A1-20 attribution rule (old 200 + new 404 at the same rev = host artifact gap; not observed here).
5. **Console, with the distractor labeled:** no documentpreview/resource/sidebar errors; the `dsh-paste-input` fold warnings called out as a **separate, unrelated** paste-attachment-folding bug.
6. **Service-resolution detail:** workspace-files row present in `cordis.patch.yml`; scope lookup `sessions.get(sessionId)?.header.cwd → sandboxPolicy.workspaceRoot`; reads outside workspace allowed (A2-02). All read inputs present, yet the read never dispatches ⇒ provider/Remote never took over.
7. **Exact address forms** (`absolute` vs `session`) and which tab claims which; note `meta.status` `'none'` ≠ a resolved `unknown-workspace`/`too-large` (those would be answered failures).
8. **Whether a full-process-stop restart + hard refresh was tried**, to separate the self-healing stale-registration case from a genuine provider gap.
9. **Reconcile the roster count** (manifest header 60 vs sweep 62) so the roster is provably stable, and link round 1 (#5999) as prior art.

### What the host could check at boot so this fails loud instead of an empty tab
Today the failure is **deferred and silent**: the tab opens (claim OK), then the read silently never resolves → empty state, no console error. Front-load resource-path health into boot assertions:

1. **Assert the resource-provider chain activates.** After composition, verify that every resource-consuming tab type (documentpreview / `sidebar.right.tab.document`, card A2-21) has its `file` resource provider **registered** and its Remote (`remote.workspaceFiles` / `api-workspace-files` service) **bound and not pending**. If the row is in the patch but the service stays pending or the `workspaceFileScope` Typert lookup is unregistered, **fail the boot with a named error** — the same loud pattern already used elsewhere (`web boot: N entries did not activate`, `waiting for service: …`).
2. **A boot-time probe read.** When a preview/resource provider registers, resolve a trivial probe (e.g. stat the workspace root) through the provider and confirm metadata **resolves** (status leaves `'none'`); a never-resolving provider fails loud at boot rather than at click time.
3. **Roster/combo + count consistency.** Verify the served combo actually contains every roster-listed module at the served rev (the A1-20 check) and reconcile the manifest entry count, so a stale/omitted/moving roster is caught at boot, not as a silent empty tab.
4. **Apply the existing validation discipline to this seam.** Per the skill's runtime layer: *prove registration/mount rather than accepting a bare HTTP 200*, and *verify entry activation and that required/provided Cordis services do not remain pending* (`verify-runtime.mjs` already reports plugin-code / dependency-resolution / profile-config / dsh-runtime attribution). Extending that to the resource-provider chain converts a runtime `文件资源服务不可用` empty tab into a **startup error that names the missing/pending service** — the difference between failing loud and failing silently.

---

## Evidence index (read-only, unmodified)
- `fixture/symptom-log.txt` — timeline; two distinct dialogs; F12 observation.
- `fixture/boot-manifest-excerpt.txt` — `__DSH_BOOT__` roster excerpt; textpreview absence / documentpreview replacement; canOpen session-only.
- `fixture/combo-probe.txt` — Probe 1 single 200; Probe 2 all-joined 404 (invalid); Probe 3 per-module 62/62 200 (valid).
- `fixture/contrast-probe.txt` — file-trace RPC reads fine vs documentpreview Remote read never arrives; workspace-files row + scope-lookup host notes.
- `fixture/console-excerpt.txt` — no documentpreview/resource errors; only `dsh-paste-input` fold-skip warnings.
- `fixture/discussion-excerpt.txt` — #5999 round 1 (alpha.1): combo omission self-healed by restart, content read still failed; rollback escape hatch; round 2 comment 18371079.

## Card citations
- **DSH-0.1.5-A2-09** — `ui-sidebar-textpreview → ui-sidebar-documentpreview` rename; session-scoped `canOpen` → explains symptom 1.
- **DSH-0.1.5-A2-01** — `workspaceFiles` scope lookup; `file` resource = `WorkspaceFileStat`; provider `createFileResourceProvider(remote, changes)` w/ `remote.workspaceFiles`; `absolute` scope → `unknown-workspace` → grounds the `meta.status` analysis.
- **DSH-0.1.5-A2-02** — reads may target paths outside the workspace; `outside-workspace` is listings-only; `maxFileBytes`/`too-large` → rules out fs/containment causes.
- **DSH-0.1.5-A2-21** — `ctx.documentPreviews` + `sidebar.right.tab.document`; the preview tab's registration seam.
- **DSH-0.1.5-A1-20** — the combo-omission / restart-self-heal / rollback-escape-hatch card; the per-module attribution probe rule; upstream thread #5999.
