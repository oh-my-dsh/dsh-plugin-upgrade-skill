# S21 — The Resource Service That "Unavailable" (read-only analysis)

**Scope.** Analysis of the sealed evidence pack only (`/app/fixture/` → `fixture/` in this cell).
No live host probing was performed (no `dsh --*`, no `cordis_inspect_*`) — the installed host runs a
different version than the one under investigation, so any live fact would be out of scope. The fixture
was not modified; nothing was written outside the designated output directory.

**Subject.** Windows 11, npm-global in-place upgrade of `@deepseek-ai/dsh` 0.1.5-alpha.1 → 0.1.5-alpha.2
on a profile created under 0.1.2/0.1.3 with six external client plugins junction-linked.

---

## 0. Verdict up front

Two *different* failures are on screen, and they must not be merged:

| # | Symptom | Layer | Cause class | Status |
|---|---|---|---|---|
| A | `sidebarRight: no registered tab type claims "dsh-resource://file/absolute/…"` | chat-link address ↔ sidebar tab-type claim | **Explained**: alpha.2 replaced `ui-sidebar-textpreview` (claimed `dsh-resource://file/**`) with `ui-sidebar-documentpreview` (claims `scope === 'session'` only) | Contract change, needs a decision (not a service outage) |
| B | Tab opens, title correct, content only `文件资源服务不可用。` | sidebar tab → **api-workspace-files resource service** | **Unexplained**: the resource-service binding for that read path never yields metadata (`meta.status` stays `'none'`) | The real defect; the file, the host, the artifact serving and the transport are all healthy |

**B is not caused by missing modules** (62/62 modules serve 200), **not by the module rename** (the same
`文件资源服务不可用` already existed on 0.1.5-alpha.1, per the prior-art round), **not by the paste-input
fold warnings** (different plugin, different code path), and **not by file permissions/emptiness** (a second
reader of the same file succeeded at the same moment).

---

## 1. Attribution

### 1.1 Which layer actually fails

The failing layer is the **resource-read path that the sidebar document tab uses**: the sidebar tab's
`api-workspace-files` Remote/provider call, i.e. the *client→host service binding* for the workspace-files
resource service (plus the `dsh-client-resources` service that the workspace-files client module declares
in its `inject` list).

Everything *around* that call is demonstrably healthy:

- **Static artifact layer: healthy.** Per-module sweep 62/62 HTTP 200, zero 404s; a single-module combo
  request returns 200 / 73 616 bytes. Modules are present and served.
- **Client module load + tab registration: healthy.** The tab *opens* and its *title renders correctly*
  (`sidebar-open-test-2.md`). A tab type that did not load or did not register could not have opened a
  correctly-titled tab. The alpha.1 failure signature ("loaded without registering", first unregistered
  entry innocently named `client-hmr`) is therefore **ruled out**.
- **Routing / tab-claim layer: healthy for this address.** The session-scoped address *is* claimed (the tab
  opened) — so the "no registered tab type claims" error belongs to symptom A (absolute scope), not to B.
- **Host process, RPC transport, and the file itself: healthy.** The `file-trace` plugin performed its own
  host RPC over its `/dsh-file-trace/*` routes *at the same moment* and rendered the file in both 原文 and
  阅读 modes. So the transport works, the session id resolves, the file exists and has content.
- **Content formatting / rendering layer: not reached.** No metadata object ever arrived, so there was
  nothing to format.

Only the service leg between the tab and the workspace-files service fails.

### 1.2 What the two readers of the same file rule in and rule out

The contrast probe pairs two readers of the identical file `…\.dsh\tmp\sidebar-open-test-2.md`
(session address `dsh-resource://file/session/session-2844c12c-…/.dsh/tmp/sidebar-open-test-2.md`):

**`file-trace` (own host RPC) — READS FINE ⇒ rules IN**
- The host process is alive, serving RPC, and reachable from the client.
- The file exists, is non-empty, is not locked or OS-permission-denied for the host.
- The session id is valid and the session-scoped address format is parseable.
- The host's file-reading capability is intact.

**`file-trace` (own host RPC) — rules OUT**
- "The file is missing / empty / unreadable" as an explanation.
- "Files outside the workspace are refused" as an explanation: the host notes state the workspace-files
  `read()` contract allows files outside the workspace, and this file is *under* the workspace root
  (`.dsh/tmp/…`) anyway.
- "The client↔host transport is broken" — the transport demonstrably carried a different RPC successfully
  in the same session.
- Any artifact-serving/module-registration explanation.

**`documentpreview` sidebar tab (api-workspace-files Remote) — FAILS ⇒ rules IN**
- The fault is **specific to the workspace-files resource path**; it is not a general file/host problem.
- Because the tab claims and opens, the *client module* side of the tab is fine; the broken part is the
  *service* it depends on.

**Important caveat on the control's validity:** `file-trace` is a *different service on a different route*.
It is a valid *health* control (host + file + transport) but **not an equivalence control** — its success
does not prove the workspace-files path is healthy, and its failure would not have localised the fault as
precisely. The contrast narrows the blast radius; it does not by itself pick which side of the binding
broke.

### 1.3 What `meta.status` staying `'none'` says about where the read stalls

The failing tab's resource metadata never leaves its initial value: **`meta.status` stays `'none'`** while
the UI renders the generic `文件资源服务不可用。` (no error message, no retry hint).

This pins the stall precisely:

- A *successful* read would have flipped `status` to a ready/ok value and produced content.
- A *rejected* read (file missing, permission denied, out of range) would have come back as a metadata
  record carrying a terminal error state **and a reason string** — the tab would have shown *that reason*,
  not a generic string. Its absence rules out "the host answered and said no".
- `status` remaining at the pre-response value means **no response object was ever produced**: the call
  either never left the client, was never routed to a live service instance, or its failure was collapsed
  into "no metadata" by the catch path. The stall is **on the request/response leg of the service call**,
  *before* the metadata record is formed — not in the filesystem, not in artifact serving, not in
  formatting, and not in the tab's rendering.

The wording of the message is a second, independent tell: `文件资源服务不可用` = "the file **service** is
unavailable", not "the file cannot be read". The service instance is missing/unreachable on the client
side of the binding.

### 1.4 The absolute-scope error is a *different* defect with a known cause

`no registered tab type claims "dsh-resource://file/absolute/E:/…"` is explained by the roster change:
the `text` tab type that claimed `dsh-resource://file/**` was registered by `ui-sidebar-textpreview` in
alpha.1; in alpha.2 that package is **replaced** by `ui-sidebar-documentpreview` (the bundle patch row
changed, the old row is gone, 0 mentions of `ui-sidebar-textpreview` remain in the HTML), and the
replacement's `canOpen` accepts `parseFileAddress(address)?.scope === 'session'` **only**. An absolute-scope
address therefore has no claimant by design.

Actionable reading: the chat-link emitter still produces `dsh-resource://file/absolute/…` for files outside
the session workspace, which alpha.2 no longer claims. This is a **contract mismatch between two
components** (emitter ↔ new tab's `canOpen`), it is *cheap and local* to fix (emit session scope for
workspace files; for genuinely outside-workspace files, say "outside the session workspace — not openable
here" instead of emitting an unclaimable link), and it is **not** evidence of the B outage. It also proves
the point about error quality: a *policy* refusal is reported with an internal-sounding message
("no registered tab type claims") that reads like a plugin bug.

### 1.5 What remains undecided, and exactly how to close it

From the pack alone one **cannot** decide *which* side of the binding is missing:

- **Host side**: is `@deepseek-ai/dsh-api-workspace-files` actually *registered* in the live host? The
  bundle patch row exists (`cordis.patch.yml`: `workspace-files` → `@deepseek-ai/dsh-api-workspace-files`),
  but a patch row is a *declaration*, not proof of live registration.
- **Client side**: is the client-side service/injection present? The boot manifest shows
  `dsh-api-workspace-files` with `inject: ["@deepseek-ai/dsh-api-gateway","@deepseek-ai/dsh-client-resources"]`,
  and `dsh-client-resources` has **no row of its own in the excerpt** — the dependency that provides the
  client resource service is exactly the thing to check.

**Leading hypothesis (unconfirmed):** the client-side resource service (`dsh-client-resources` /
the api-workspace-files client binding) is not registered in the client runtime, so the tab's Remote has no
live service to call ⇒ no response ⇒ `meta.status` stays `'none'` ⇒ generic unavailable string. This is
consistent with the alpha.1 prior art, where the "resource-provider chain did not take over".

**To close it (one capture, no install):** the client service registry snapshot at boot (which services
are actually registered, and whether `dsh-client-resources` is among them) **plus** the host service
registry snapshot / host log for the workspace-files request **plus** the F12 Network/WebSocket frames for
the read call (request emitted? status? response? error?). If the request never leaves the browser ⇒
client-side binding. If it leaves and the host logs no service for it ⇒ host-side registration.

---

## 2. Probe discipline — which combo probe is a valid measurement

### 2.1 Verdict

- **Valid measurement of static artifact serving: Probe 3 (per-module sweep) — 62/62 HTTP 200, zero 404s.**
  It fetches every roster entry the way the product actually fetches it.
- **Not a valid measurement: Probe 2 (all 62 entries comma-joined into one URL) — 404, zero-length body.**
  It measures the probe's own invented request, not the product's.
- **Probe 1 (single-module combo URL) — 200 / 73 616 bytes** is the control that proves the `??` route and
  the multi-file form work in principle.

### 2.2 Why Probe 2 must never be cited as "modules missing"

1. **It is not a request the loader ever makes.** The boot roster exposes *one row per module*, each with
   its own `??` URL and its own `rev` token. The loader consumes those rows; it never concatenates the
   roster into a single 4–5 KB query string. A 404 on a request the product does not issue is a fact about
   the probe, not about the deployment.
2. **The same 62 modules are proven served.** Probe 3 gets 200 on all 62, and Probe 1 proves the `??` form
   itself returns real bytes. The artifacts are present.
3. **The symptom disproves the module-missing theory anyway.** If the document-preview module had not been
   served/loaded, the tab would never have opened with a correct title.
4. **The failure mode of a joined-URL 404 is a plausible artifact of URL length / multi-module query
   parsing** (≈4–5 KB query, 62 comma-separated entries) — an artifact of probe construction.
5. **It points triage at the wrong layer.** "Modules missing ⇒ rebuild/republish/reinstall the client
   bundle" is a multi-hour dead end for a fault that lives in the service-registration chain; it also
   wrongly implicates the module set and the packaging.

### 2.3 It is also *not* the alpha.1 `#5999` combo-404 class, and that distinction matters

The prior-art round (alpha.1) had a *genuine* roster/combo mismatch: the roster listed newly-added
`ui-sidebar-*` modules and **the per-module request for those very rows 404'd at the same `rev`**, while
old modules returned 200 — hence "loaded without registering" (with `client-hmr` named innocently as the
first unregistered entry).

That is the *shape* of measurement that would justify "modules missing": a request the loader actually
made, for a specific row, answered 404 — plus a matching client-side symptom. **Neither holds in alpha.2:**
the per-module requests all return 200, and the tab registers and opens. The superficial resemblance of
"a 404 on a combo URL" is exactly the trap; the two must be reported as different mechanisms, and the
upstream report should say so explicitly.

### 2.4 How the real loader fetches the roster

- The boot payload (`__DSH_BOOT__`, fetched same-origin after restart) carries **per-module rows**, each
  row naming the module id, its own `/plugins/??<module-id>/client.js&rev=<rev-token>-<n>` URL, and an
  `inject` list. Example row (verbatim from the excerpt):
  `{"id":"@deepseek-ai/dsh-api-workspace-files","url":"/plugins/??@deepseek-ai/dsh-api-workspace-files/client.js&rev=234716e8f7370214-3","inject":["@deepseek-ai/dsh-api-gateway","@deepseek-ai/dsh-client-resources"]}`
- The `??` form is a *multi-file* form used **per row**; the loader requests each module (and each injected
  dependency) **individually**, with that row's `rev` token, and then honours the `inject` graph to make
  sure a dependency's service is present in the client runtime before the dependent module is used.
- Therefore the correct serving measurement = fetch **each row's own URL** (Probe 3), not a hand-joined URL.

### 2.5 The general lesson to carry into the report

**Served ≠ registered.** HTTP 200 proves bytes were delivered; it says nothing about whether the module
*registered its service* in the client runtime. The alpha.1 bug was a serve/roster mismatch; this alpha.2
bug is a *registration/service-binding* failure with serving fully healthy. Any probe that stops at HTTP
status will misdiagnose this class.

---

## 3. Distractor separation

### 3.1 The `dsh-paste-input` fold warnings are unrelated

The repeated `dsh-paste-input: fold skipped (parse failed)` lines are a **cosmetic bubble-collapse**
feature of a *different* plugin: after a message is sent, the verbose attachment-path text block (carrying
the `==== DSH_PASTE_INPUT_V1 ====` marker) is meant to collapse into a 📎 file chip. The marker protocol and
the `.dsh/tmp/attachments/<session>/<send>/` directory logic are independent of the snapshot internals, and
the chain was verified working in practice on 0809. The warnings repeat for **every historical
paste-attachment message** in the thread.

They are: a different plugin, a different code path (message bubble vs right sidebar), a different data
(attachment-path text blocks vs resource metadata), and non-fatal by design. **They neither cause nor
exacerbate the content-read failure.** They matter only as the explanation for "why is F12 not clean?" —
and as a reminder that a *console is not the health channel for this class of failure*.

### 3.2 What else changed in the roster between the versions

- `packages/client/ui-sidebar-textpreview` → `packages/client/ui-sidebar-documentpreview` (the alpha.2 tree
  **replaced** the package; `packages/bundle/web-app/cordis.patch.yml` carries the new row, the old row is
  gone; 0 mentions of `ui-sidebar-textpreview` in the served HTML).
- The new document tab's `canOpen` accepts `scope === 'session'` only, whereas the old text tab claimed
  `dsh-resource://file/**` (any scope).
- Present and unchanged in the census: `ui-sidebar-right`, `dsh-file-trace` (all six external plugins
  present), `dsh-profiles`, `dsh-brand-version`.

### 3.3 Does that change explain the symptom?

- **For symptom A (absolute-scope link): yes, fully.** The renamed package no longer claims absolute
  addresses; a link emitter still emitting `dsh-resource://file/absolute/…` has no claimant. The fix belongs
  to the emitter/claim contract, and it is *not* a service outage.
- **For symptom B (`文件资源服务不可用`): no.** Three reasons:
  1. The rename only changes *which tab claims which scope*; for a session-scoped address the new tab
     claims it, opens, and titles correctly — the claim and open steps succeeded.
  2. The failure is in the *read* leg (metadata never arrives), not in the *claim/registration* leg.
  3. **Decisive prior art:** the same `文件资源服务不可用` already occurred on **0.1.5-alpha.1** (round 1 of
     `#5999`), and — critically — *even after a host restart had self-healed the roster/combo mismatch, the
     sidebar content read STILL failed and "the resource-provider chain did not take over"*. The
     resource-chain defect therefore **predates the alpha.2 module rename**; the rename cannot be its
     cause. It is a *related but narrower* symptom, and the alpha.1 round is the same family with a
     different (or additional) mechanism.
- The rename is at most an **enabling/visibility condition**: the new document-preview module is the sidebar
  consumer of the workspace-files Remote, so a missing resource-service binding surfaces exactly there.

### 3.4 The "no red errors" observation is *not* a health signal

F12 shows no errors from the sidebar or the document-preview module. That is **not** evidence of health —
it is evidence that the failure is being **swallowed** into a generic string before it can reach the
console. A silent, empty, title-only tab is the signature of a collapsed error path; treat "clean console"
here as a *diagnostic gap*, not a clearance.

---

## 4. Mitigation decision and ordering

### 4.1 Should the plugin work around the unavailable service?

**No — not as a content workaround, and not yet.** The fault is in the host-provided resource service, not
in the plugin's logic, so a client-side "fix" cannot be correct; it would only hide the outage.

Explicitly **not** recommended:
- **Rewrite** the address into another scheme/format hoping another tab claims it — that trades a precise
  failure for a wrong-content failure, and the scope rules are intentional.
- **Retry-loop** the same call — the stall is *before* any response, so an identical call fails identically;
  a retry loop is a hot loop against a dead service.
- **Fake the content** (render the raw address/placeholder as if it were the document) — masks a real
  outage and desynchronises the sidebar from the filesystem.
- **Silently fall back to a different transport** (e.g. file-trace's route) from inside the preview tab —
  it hides the defect and diverges from upstream semantics; file-trace is a *different service* and may not
  be present on every profile.

**What *is* justified as a plugin-side action (diagnostics + precise messaging, not content):**
- Make the failure **legible**: show *which* hop failed (no-claim vs service-unavailable vs read-error),
  the address, and the raw cause; add a manual "retry" button and a "copy diagnostics" action.
- **Log the swallowed error once** (not silently) so the console carries a real cause — this is exactly what
  the missing signal would have saved.
- **Fix the address emitter** (symptom A): normalise workspace-internal files to a session-scoped address;
  for files outside the session workspace, do not emit an unclaimable `dsh-resource://file/absolute/…` link
  — say "outside the session workspace — not openable here".
- Do **not** patch the installed alpha.2 tree to re-add the `ui-sidebar-textpreview` row: that row was
  deliberately removed upstream, and it would neither fix B nor restore alpha.1 semantics.

### 4.2 Ordered plan (cheap → expensive; capture before you change anything)

**Step 0 — Capture the failing leg (free, minutes, no install, do this first).**
Reproduce the click and record, in one pass: the exact failing address and session id; the client's
service registry snapshot (is `dsh-client-resources` / the api-workspace-files client binding present?);
the F12 Network/WS frames for the read call (does a request leave the browser? status? response? error?);
the host-side log for the workspace-files request; and the host's resolved workspace root for the session
(`sessions.get(sessionId)?.header.cwd`, fallback `sandboxPolicy.workspaceRoot`). This converts
"文件资源服务不可用" into a *named missing hop* and is the raw material for the upstream report.
*Why first:* a rollback or reinstall destroys the reproduction state; and the decision between the
client-side and host-side branch is made here, not by guessing.

**Step 1 — Cheapest plausible fix: full host restart (`dsh web`), seconds.**
It re-runs the client injection/registration pass and re-fetches a fresh `rev`. Prior art shows a restart
can heal roster/combo state, and it also cleanly *closes* the alpha.1 hypothesis if the read still fails
afterwards (which it did in round 1). Low cost, no downside, do it before anything destructive.

**Step 2 — Local, non-destructive plugin changes (the only justified local fix).**
Apply the §4.1 diagnostics/messaging/emitter changes. This is a UX + observability fix, explicitly *not* a
content workaround. Do it *after* Step 0 so the diagnostics assert the hop that actually broke.

**Step 3 — Escape hatch: restore service by rolling back the global install.**
`npm i -g @deepseek-ai/dsh@0.1.3-alpha.2` was verified working in `#5999`. Until the resource chain is
fixed, treat the sidebar document preview as unavailable and use the `file-trace` path (or an external
editor) for file viewing. Additionally: stop promoting `0.1.5-alpha.*` pre-releases onto this profile
while it carries six junction-linked external client plugins, and treat the pre-release as not
production-ready until the resource chain is verified.

**Step 4 — Upstream (parallel with Steps 0–1; its content is already determined by the evidence).**
Append the forensics to discussion `#5999` as round 2 (existing round-2 comment `18371079`) with the
attribution, the probe-validity note, the roster diff, the client/host service-registry evidence, and the
boot self-check proposal (§5.2). Ask for the two fixes separately: a **host** fix (boot assertion) and a
**client** fix (do not swallow; surface the cause).

**Ordering principles to state in the report:** capture-before-change (a rollback destroys evidence);
cheap-and-reversible before expensive-and-destructive; upstream report drafted in parallel because its
content does not depend on the outcome of Steps 1–3; and the plugin-side change is a *diagnostics*
commit that may ship before the upstream fix, but must never be sold as "the fix".

---

## 5. Prevention and upstream packaging

### 5.1 Forensics a complete upstream report must carry

1. **Versions & provenance**: 0.1.5-alpha.1 → 0.1.5-alpha.2, `npm i -g @deepseek-ai/dsh@…`, Windows 11,
   Node version, dsh profile created under 0.1.2/0.1.3, and the **six junction-linked external client
   plugins** (ids + junction targets + their versions).
2. **The boot roster**: the `__DSH_BOOT__` dump (or the relevant rows) *with the `rev` tokens*, the
   `inject` graph, and the entry count. **Reconcile the 60-vs-62 discrepancy** (the excerpt says
   "Total entries: 60"; the probe enumerates 62 modules) — do not paper over it; state which is which.
3. **Addresses**: the failing session-scoped address and the failing absolute-scope address, verbatim, with
   the session id; the session's resolved workspace root *as the host sees it*
   (`sessions.get(sessionId)?.header.cwd`, fallback `sandboxPolicy.workspaceRoot`).
4. **The probes, with validity labels**: the per-module sweep (62/62, exact URL form per row) as the
   *valid* serving measurement; the single-module control (200 / 73 616 bytes); and the all-in-one joined
   URL explicitly **labelled invalid** with the reason (not a loader request; URL length / multi-module
   query parsing) — so nobody downstream re-cites it as "modules missing".
5. **Transport evidence**: the client Network/WS frames for the read call (request emitted? status?
   response? error?) and the console — including the fact that the error is swallowed, so the absence of
   red errors is documented as an observability gap.
6. **Service registries**: the client-side registry snapshot (is `dsh-client-resources` present? is the
   api-workspace-files client binding present?) and the host-side registry snapshot / host log for the
   workspace-files request; the `cordis.patch.yml` rows as declared intent.
7. **The alpha.1 ↔ alpha.2 diff of the relevant packages**: `ui-sidebar-textpreview` →
   `ui-sidebar-documentpreview`, the `cordis.patch.yml` row change, the api-workspace-files /
   `dsh-client-resources` wiring, the new tab's `canOpen` scope rule, and *what the old text preview used
   for its read path* (this decides whether the rename is causally connected).
8. **Prior art**: discussion `#5999` round 1 (alpha.1 combo 404 for the newly added rows ⇒ "loaded without
   registering", first offender named `client-hmr`) and round 2 (comment `18371079`).
9. **Repro recipe + expected vs actual** + the **rollback verification** (0.1.3-alpha.2 restores the read).
10. **An explicit "what this is NOT" section**: not the combo-404 class, not the paste-input fold
    warnings, not the module rename for symptom B, not a file/permission problem, not artifact serving.
    This is what stops the next reader from re-running the same dead ends.

### 5.2 What the host could check at boot so this fails loud

The failure was silent because *no layer compared what was declared with what was actually live*. Boot-time
assertions that would have turned an empty tab into a startup error:

1. **Client-side registration assertion (post-injection)**: after injecting the roster, verify that every
   service the loaded client modules require — in particular `@deepseek-ai/dsh-client-resources` and the
   api-workspace-files client binding — is actually *registered* in the client service registry, following
   the roster's `inject` graph. On failure, emit a **loud, deduplicated, named error** (which service, which
   module needed it, which inject edge) and surface it in a host-health view, not only in the console.
2. **Declared-vs-registered reconciliation (client ∪ host)**: compare the roster's *declared* service set
   against the *live* client and host service sets at boot. This catches both known families at once: the
   alpha.1 roster/combo mismatch and the alpha.2 served-but-not-registered gap. Compare *declared vs
   registered*, not *declared vs served* — HTTP 200 was never the broken part.
3. **Host-side live-registration assertion**: verify the host really registered
   `@deepseek-ai/dsh-api-workspace-files` (the bundle-patch row is only an intent) and that the client and
   host agree on the shared contract for that service; a mismatch must fail loudly at startup.
4. **End-to-end smoke test at boot (or on first session open)**: perform one workspace-files read of a known
   file for the active session and assert `meta.status` leaves `'none'`. If it does not, log **which hop
   failed** — client service missing / session root unresolved (`header.cwd` *and*
   `sandboxPolicy.workspaceRoot` both empty) / provider unregistered / no response — instead of letting a
   tab render empty.
5. **Error-propagation contract in the preview tab**: never collapse every failure into one string. Keep
   *no-tab-claims* (routing/scope), *service-unavailable* (binding) and *read-error* (file/permission)
   distinct; log the raw cause to the console; show the address and offer retry + copy-diagnostics. The
   current behaviour also makes a policy refusal sound like a plugin bug — the tab-type/scope census should
   be logged at boot so the message can say "outside the session workspace" instead.
6. **Asset-freshness check**: verify that the bytes served for each roster row match that row's `rev` token,
   so a partially-upgraded global install or a stale client cache fails loudly at boot rather than at click
   time (and so a joined/partial URL can never masquerade as a missing module).
7. **Upgrade-hygiene check**: detect an in-place global upgrade performed over a profile that carries
   junction-linked external client plugins, and verify those plugins' client-side service registrations
   after the upgrade; warn if the host/client service sets diverge.

### 5.3 Suggested split of the upstream fix

- **Host side**: boot assertions (1–3), the smoke test (4), asset-freshness check (6).
- **Client side**: stop swallowing the read error, surface cause/address/retry (5), and register the
  `dsh-client-resources` dependency (or make the workspace-files client tolerate its absence explicitly).
- **Product side**: decide the contract for out-of-workspace files — either the link emitter stops emitting
  `dsh-resource://file/absolute/…`, or a tab claims the absolute scope again — and document the intended
  scope matrix so both sides can be checked against it.

---

## 6. Open items / explicitly unconfirmed

- **Which side of the binding is broken** (client service missing vs host service unregistered) is **not
  decidable from the pack**; the leading hypothesis is the client-side `dsh-client-resources` /
  api-workspace-files binding, but Step 0's captures decide it.
- **60 vs 62 roster entries** — unreconciled in the pack; flagged for the upstream report; it does not change
  any conclusion here (the relevant rows are present, and 62/62 rows serve 200).
- **Whether the old `ui-sidebar-textpreview` used a different read path** than the new
  `ui-sidebar-documentpreview` — unknown from the pack; it decides whether the rename is causally related
  to B beyond visibility. (The prior-art alpha.1 occurrence of the same string already shows the resource
  defect predates the rename.)
- **Why the alpha.1 round's read failure survived a restart** — the pack does not say; the same gap in
  client-side registration is the most consistent reading, but it is inference.
- No live-host facts were collected (out of scope by instruction); nothing here depends on them.

---

## 7. Evidence index (file → the point it supports)

| Fixture file | Key point used |
|---|---|
| `symptom-log.txt` | timeline of both dialogs; tab opens with correct title but body `文件资源服务不可用。`; file-trace reads the same file fine; clean F12; 62/62 module probe |
| `boot-manifest-excerpt.txt` | per-module roster rows with `rev` + `inject`; `ui-sidebar-textpreview` absent / `ui-sidebar-documentpreview` replaces it; new tab's `canOpen` = session scope only; 60 entries stated |
| `combo-probe.txt` | Probe 1 single-module 200/73 616 B; Probe 2 joined URL 404; Probe 3 per-module 62/62 200 |
| `contrast-probe.txt` | file-trace vs documentpreview on the same file; `meta.status` stays `'none'`; workspace-files host row present; session root resolution; outside-workspace reads allowed |
| `console-excerpt.txt` | only `dsh-paste-input` fold-skip warnings; no documentpreview/sidebar errors; the marker/attachment path is independent of snapshot internals |
| `discussion-excerpt.txt` | alpha.1 round of the same family: roster/combo 404 for new modules ⇒ "loaded without registering"; restart healed the roster but **not** the read; rollback to 0.1.3-alpha.2 verified |
| `README.md` | evidence-pack index and scope |

*Analysis only — no fixture file was modified, no install/migration was executed, no external service was contacted.*
