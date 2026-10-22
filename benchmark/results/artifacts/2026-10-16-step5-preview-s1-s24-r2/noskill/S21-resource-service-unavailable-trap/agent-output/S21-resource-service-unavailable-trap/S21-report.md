# S21 — 「文件资源服务不可用」: layer attribution, probe discipline, and upstream packaging

**Case**: dsh `0.1.5-alpha.1 → 0.1.5-alpha.2` npm-global in-place upgrade, Windows 11; profile
created under 0.1.2/0.1.3 with six external client plugins junction-linked. After upgrade +
restart: an out-of-workspace chat link throws a claim error; an in-workspace link opens a
right-Sidebar tab with the correct title but a body that reads only
「文件资源服务不可用。」; the console shows no sidebar/resource errors; a per-module probe
of the roster returns 62/62 HTTP 200 while a joined mega-URL returns 404.

**Evidence**: `fixture/` (symptom-log.txt, boot-manifest-excerpt.txt, combo-probe.txt,
contrast-probe.txt, console-excerpt.txt, discussion-excerpt.txt, README.md) — read-only,
opened read-only, unmodified.
**Prior art**: deepseek-ai/deepseek-harness discussion #5999 (alpha.1 round of the same
failure family; alpha.2 round appended as comment 18371079).

---

## 0. Verdict in one paragraph

The static-serving layer and the tab-registration layer are both healthy for
session-scoped addresses: every one of the 62 roster entries serves HTTP 200 individually,
and the alpha.2 `ui-sidebar-documentpreview` tab opens and renders its correct title. The
failure sits one layer below the UI and one layer above the disk: the **file-resource
metadata read** — the documentpreview tab's dependency on the
`@deepseek-ai/dsh-client-resources` / `@deepseek-ai/dsh-api-workspace-files` provider
chain. In the failing tab `meta.status` never leaves `'none'`: the metadata request is
never answered, so the read stalls at the provider-resolution boundary, before any content,
permission, or parse logic runs. The control reader (file-trace's own
`/dsh-file-trace/*` RPC) reads the same file fine, which rules out the file, the disk,
permissions, host liveness, and scope policy, and pins the defect to the resource-provider
chain — the same "resource-provider chain did not take over" signature recorded in #5999
round 1. The repeated `dsh-paste-input` fold warnings are an unrelated
per-historical-message rendering issue. Fix order: restart + client cache clear (cheap),
runtime provider-registration check, rollback to `0.1.3-alpha.2` as the escape hatch,
then a complete forensic appendix to #5999 — with **no** client-side rewrite/retry/fallback
as "the fix".

---

## 1. Attribution — which layer actually fails

### 1.1 The layer stack and where it breaks

| Layer | Observation from evidence | State |
|---|---|---|
| L0 Static artifact serving (`/plugins/??…` combo route) | Probe 1: the manifest's own combo URL → 200 (73,616 B). Probe 3: 62/62 per-module → 200, zero 404s. | **healthy** |
| L1 Client plugin load + tab-type registration | The alpha.2 tab opened and rendered the title "sidebar-open-test-2.md" → `ui-sidebar-documentpreview` loaded, executed, registered, and its `canOpen` accepted the session-scoped address. | **healthy for `scope === 'session'`** |
| L2 Content read: documentpreview tab → resource service (`dsh-client-resources` / `api-workspace-files` Remote) | Body shows only 「文件资源服务不可用。」; `meta.status` stays `'none'`; no console error, no retry hint. | **FAILS HERE** |
| L3 Host workspace-files service + filesystem | Control reader (file-trace's own RPC) reads the same file fine; the workspace-files host row is present in `cordis.patch.yml`; the service's scope rules would allow the file. | **healthy** |

The failing layer is therefore **L2 — the renderer-side consumption of the file-resource
service**: the tab's request for file *metadata* never receives a response. It is
specifically **not**:

- **L0** — the alpha.1 round's failure mode (combo answered 404 for newly-added modules at
  the roster's rev → every client plugin "loaded without registering") is absent here: all
  62 entries serve, and the module demonstrably loaded and registered.
- **L1** — the tab opened and titled correctly, so registration succeeded for the
  session-scoped address. The claim error in step 2 of the symptom log is a *different*
  dialog with a *different address scope* (see 1.2).
- **L3** — a second reader proves the file and the host HTTP face are fine (see 1.3).

### 1.2 The absolute-scope dialog is a separate, narrower failure

Step 2's error —

`sidebarRight: no registered tab type claims "dsh-resource://file/absolute/E:/deepseek-harness/dsh-input-history/package.json"`

— is explained by the roster delta, not by the content bug. In alpha.1
`ui-sidebar-textpreview` registered a `text` tab type claiming
`dsh-resource://file/**` (any scope). In alpha.2 the replacement package
`ui-sidebar-documentpreview` registers a `document` tab whose `canOpen` accepts
`parseFileAddress(address)?.scope === 'session'` **only**. An absolute-scope address therefore
has no claimant at all. That is a real behavior regression worth reporting, but it is
**orthogonal** to the content-read failure: the session-scoped link *is* claimed (the tab
opens) and the tab still cannot read.

### 1.3 What the two readers of the same file rule in and rule out

Same file, same moment —
`E:deepseek-harness	est-lhh010.dsh	mpsidebar-open-test-2.md`
(session address `dsh-resource://file/session/session-2844c12c-5870-41e0-bb46-7d1fdc7c183a/.dsh/tmp/sidebar-open-test-2.md`):

- **file-trace plugin, own host RPC (`/dsh-file-trace/*` routes, own HTTP face) → READS
  FINE** (原文 and 阅读 modes both show the content).
  Rules **out**: the file being missing/unreadable/corrupt; OS-level permission or sandbox
  denial; the host being down or the web server not serving; a globally broken profile; and
  any scope/policy explanation for the read — the address is session-scoped, and the
  service's `read()` doc says "files outside it are allowed", so `.dsh/tmp` sitting
  under the workspace root is not the blocker either.
- **documentpreview sidebar tab, `api-workspace-files` Remote → FAILS**
  (`meta.status` stays `'none'`).
  Rules **in**: the resource-service chain the tab depends on — client-resources ↔
  api-workspace-files — as the defective component. Also rules **out**: "the module didn't
  load" (it registered), "the tab is broken" (its title renders from the parsed address),
  and "the file is the problem" (the control reader succeeds).

Together the two readers isolate the defect to exactly one seam: **the provider half of the
file-resource service never becomes live for that session**, while every neighbouring seam
is proven working by a control. That is precisely the signature #5999 recorded for round 1:
"the resource-provider chain did not take over", even after the roster/combo mismatch
self-healed.

### 1.4 What the observed metadata status says about where the read stalls

`meta.status === 'none'` is the *initial, never-transitioned* state. The read therefore
stalls **before the provider produces any answer at all** — no `'loading' → 'ready'`
progress, and no terminal `'error'` status. Three consequences:

1. It is **not** a slow read, a permission denial, a bad path, or a parse failure — each of
   those would terminate in an error status or a console error. The console confirms: no
   red errors from documentpreview or the sidebar.
2. The stall sits at the **RPC / provider-resolution boundary**: the tab waits on a Remote
   whose provider half was never registered (or whose session lookup entry — the
   `typert lookups.register` resolution of `sessions.get(sessionId)?.header.cwd`,
   falling back to `sandboxPolicy.workspaceRoot` — is missing), so the request is
   dispatched into a void and the promise never settles.
3. The tab's fallback string is literally accurate and diagnostically empty:
   「文件资源服务不可用。」 = "the file *resource service* is unavailable" — i.e. **no
   provider answered** — yet it names no service, no address, no state, offers no retry,
   and logs nothing. That is why a dead service presents as a rendering mystery.

---

## 2. Probe discipline — which combo probe measures what

### 2.1 The two probes

- **Probe 3 — per-module sweep** (each of the 62 manifest entries fetched one by one):
  **62/62 HTTP 200, zero 404s.** This is the **valid** measurement of static artifact
  serving. Each URL is taken verbatim from the boot manifest and fetched the way the real
  loader fetches modules; it proves every entry the roster lists is actually served.
- **Probe 2 — all 62 entries comma-joined into one `/plugins/??…` URL (~4–5 KB long):
  404, zero-length body.** This is an **invalid** measurement. It tests the probe's own URL
  construction, not the server's inventory: a hand-synthesized 4–5 KB mega-URL is not a URL
  any loader builds, and the same route answers 200 for the manifest's own combo URL
  (Probe 1) and for all 62 individual URLs (Probe 3). A 404 with an empty body on such a
  URL says nothing about module availability.
- **Probe 1** (the boot manifest's own first combo URL, single module → 200, 73,616 bytes)
  corroborates that the combo route itself is healthy when handed a real manifest URL.

### 2.2 Why the failing probe must never be cited as "modules missing"

1. **It is contradicted by the valid probe in the same file.** If modules were missing,
   Probe 3 would return 404 for those modules; it returns 200 for all of them. Citing
   Probe 2 as "the modules are missing / the combo is broken" contradicts the evidence
   printed beside it.
2. **The symptom does not match a missing-module failure.** A module that fails to load
   produces client-side registration errors — the alpha.1 round's "loaded without
   registering", with an innocent first offender such as `client-hmr`. The console here
   shows no such errors, and `ui-sidebar-documentpreview` demonstrably loaded, registered,
   and opened a tab.
3. **It is a measurement artifact by construction.** Probe 2's independent variable is the
   mega-URL's length/shape; what it measures is the combo route's URL-handling limit.
   Reporting "404 → modules missing" attributes a probe limitation to the server — the
   classic invalid-probe trap, and the one this scenario is built to catch.
4. **It sends the investigation down the wrong path.** "Modules missing" points at
   build/combo/roster surgery (the alpha.1 fix), while the actual defect is the runtime
   provider chain. Probe 2's 404 is the *alpha.1 failure mode's fingerprint*; the alpha.2
   evidence shows that failure mode is absent.

### 2.3 How the real loader fetches the roster instead

The loader does **not** synthesize a joined URL. It reads the `__DSH_BOOT__` manifest
(fetched same-origin after the restart), which enumerates each plugin's `id`, its own
combo `url` (e.g.
`/plugins/??@deepseek-ai/dsh-api-workspace-files/client.js&rev=234716e8f7370214-3`), and
its `inject` dependency list (e.g. `["@deepseek-ai/dsh-api-gateway",
"@deepseek-ai/dsh-client-resources"]`), then fetches **each entry's own URL** — Probe 1
shows even a manifest-sourced single-module combo URL serves correctly. Probe 3 reproduces
exactly that behaviour: one request per roster entry, URLs verbatim. That is why Probe 3 is
the faithful measurement and Probe 2 is not.

*Forensic hygiene note*: the probes were run with `rev=…-0` while roster rows carry
per-entry revs (`…-3`, `…-N`). An upstream report should re-run the sweep with the
manifest's exact per-entry URLs and revs.

---

## 3. Distractor separation

### 3.1 The `dsh-paste-input` fold warnings are unrelated

- **Different subsystem and transport.** They come from the paste-input / chat-message
  rendering path (collapsing verbose attachment text blocks into 📎 chips in the message
  bubble), not from the sidebar or the resource system. The failing read is the
  documentpreview tab's `api-workspace-files` Remote. There is no shared code path.
- **Different severity and shape.** They are warnings (▲), repeating once per *historical*
  paste-attachment message — a per-message rendering parse-skip of old transcript content,
  not a failure of any live operation. The console excerpt itself records "no red errors
  from documentpreview or the sidebar".
- **Self-declared independence.** The excerpt notes the attachment protocol
  (`==== DSH_PASTE_INPUT_V1 ====` marker) and the
  `.dsh/tmp/attachments/<session>/<send>/` directory logic "do not depend on
  snapshot-internal implementation details; the full chain was verified successfully in
  practice on 0809".
- They co-occur with the symptom only because both are printed to the same browser console.
  Co-location is not causation; file them as a separate cosmetic issue.

### 3.2 What else changed in the roster between the two versions

The one roster change that matters: **`ui-sidebar-textpreview` was replaced by
`ui-sidebar-documentpreview`** (`packages/bundle/web-app/cordis.patch.yml` carries the
new row; the old row is gone; the served HTML has zero mentions of textpreview). The
registered tab type changed with it: alpha.1's `text` tab claimed
`dsh-resource://file/**` (all scopes); alpha.2's `document` tab accepts
`scope === 'session'` only. Everything else relevant is unchanged: `ui-sidebar-right`
present, `dsh-file-trace` and all six external plugins present, `dsh-profiles` and
`dsh-brand-version` present, and the `api-workspace-files` host row present in the
bundle patch.

### 3.3 Does that change explain the symptom? Partially — one dialog, not the read

- **Yes for the absolute-scope dialog** (step 2): with `canOpen` narrowed to session
  scope, `dsh-resource://file/absolute/…` has no claimant. Fully explained by the
  rename — and a genuine regression to report (out-of-workspace link previews are lost
  entirely).
- **No for the content-read failure** (step 3): the session-scoped link *is* claimed — the
  tab opens with the correct title — so registration and the new module are working. The
  failure is downstream, in the metadata read (`meta.status` stuck at `'none'`), and
  the contrast probe shows the host-side service row and scope rules are fine. The rename
  cannot explain a read that never gets a provider answer; the provider chain not taking
  over (#5999's signature) can.
- Keep the alpha.1 round's failure mode separate as well: that round's symptom was "loaded
  without registering" for every client plugin (combo 404 at the roster's rev for
  newly-added modules). This round's modules all serve 200 and the tab registers — the
  evidence's own description is "related-but-narrower". Do not import the alpha.1
  explanation wholesale.

---

## 4. Mitigation decision

### 4.1 Should the plugin work around the unavailable service? No — not as the fix

The defect is that **no provider answers** the metadata request. A client-side workaround
cannot honestly fix that:

- **Retry** re-issues an RPC into a void: the promise never settles because the provider
  half was never registered, and there is no error to retry on (`meta.status` stays
  `'none'`, console clean). A retry loop only converts a silent hang into a slow hang.
- **Fallback to "read it myself"** (the tab issuing its own host RPC the way file-trace
  does) duplicates `api-workspace-files`' job — session cwd / workspace-root resolution,
  sandbox policy, scope rules — inside a generic preview component, forks the resource
  contract, and masks a host defect that will hit every other consumer of
  `@deepseek-ai/dsh-client-resources`.
- **Rewrite / re-registration hacks** in a junction-linked external plugin would paper over
  the host's upgrade-hygiene bug and break again on the next upgrade.

The only legitimate client-side change is an **upstream hardening**, not a local
workaround: the tab must distinguish "no provider / never settles" from "provider returned
an error", surface the failing address and service name, and log loudly (see 5.2).

### 4.2 Order of action for the maintainer

1. **First cheap step — restart the host and drop stale client state.** `dsh web restart`
   plus a hard refresh / client-cache clear so the browser re-fetches `__DSH_BOOT__`.
   Rationale: this deployment's history (#5999 round 1) shows an in-place npm-global upgrade
   onto a profile created under 0.1.2/0.1.3 can leave client roster/combo state stale, and a
   restart self-healed that mismatch once. Cost: seconds. It discriminates "stale client
   state" from "dead provider wiring" — and the alpha.2 evidence (roster fresh and
   consistent with 62/62 serving) already suggests the remaining fault is the provider
   chain, which a restart may or may not heal.
2. **Second cheap diagnostic — verify the provider chain at runtime (read-only).** Confirm
   whether `@deepseek-ai/dsh-client-resources`' provider actually registers for the
   session — i.e. whether the `typert lookups.register` entry resolves
   `sessions.get(sessionId)?.header.cwd` (or falls back to
   `sandboxPolicy.workspaceRoot`) — and whether *any* consumer of `api-workspace-files`
   works (the workspace file tree; file-trace's panel is the control). This localizes the
   break to "provider never registers for this session" vs "registers but the read hangs" —
   exactly the detail the upstream report needs.
3. **Escape hatch — roll back to the last known-good published version**:
   `npm i -g @deepseek-ai/dsh@0.1.3-alpha.2`, verified working on this deployment in #5999.
   Bonus: rollback also restores the alpha.1-era `text` tab type that claimed all scopes,
   un-breaking the absolute-scope dialog. If alpha.2 features are required, the narrower
   hatch is to restore the `ui-sidebar-textpreview` row in the bundle patch (pin the
   sidebar package) — but the honest escape is the version rollback, and the read failure
   still needs the host fix.
4. **Upstream — package the forensics and append to #5999** (round 2, comment 18371079) per
   §5, and let the maintainers fix the host. Ship no local workaround as "the fix"; at most,
   land the fail-loud hardening from §5.2 upstream.

---

## 5. Prevention / upstream

### 5.1 Forensics a complete upstream report needs

1. **Environment and provenance**: before/after versions (`0.1.5-alpha.1` →
   `0.1.5-alpha.2`), install mode (npm global, in-place), OS (Windows 11), profile created
   under 0.1.2/0.1.3, and the six junction-linked external client plugins with their
   versions and link targets.
2. **Exact reproduction**: both addresses verbatim (the absolute-scope
   `dsh-resource://file/absolute/E:/deepseek-harness/dsh-input-history/package.json` and the
   session-scoped `dsh-resource://file/session/session-2844c12c-5870-41e0-bb46-7d1fdc7c183a/.dsh/tmp/sidebar-open-test-2.md`),
   both error strings verbatim (including the Chinese 「文件资源服务不可用。」), and
   screenshots of both dialogs.
3. **Full `__DSH_BOOT__` dump**: every row (id / url / rev / inject), the served-HTML
   sidebar census, and the `cordis.patch.yml` rows (workspace-files present;
   ui-sidebar-documentpreview replacing ui-sidebar-textpreview).
4. **Probe results, labelled**: the per-module sweep (62/62 × 200) as the valid measurement,
   and the joined-URL 404 explicitly labelled an invalid probe artifact (4–5 KB hand-joined
   URL; the same route serves the manifest's own combo URL) so reviewers do not re-derive
   "modules missing". Re-run the sweep with the manifest's exact per-entry revs.
5. **The contrast probe**: same file, two readers, both results; the failing tab's
   `meta.status` trajectory (`'none'`, never settles); ideally the RPC/network trace
   showing the metadata request is sent and never answered — or never sent because no
   provider handle exists.
6. **Console log**, with the `dsh-paste-input` fold warnings explicitly separated as
   unrelated (different subsystem; per-historical-message rendering warnings).
7. **Host-side notes**: the workspace-root resolution path
   (`sessions.get(sessionId)?.header.cwd` → `sandboxPolicy.workspaceRoot` via the
   `typert lookups.register` entry) and the `read()` scope doc ("files outside it are
   allowed").
8. **Prior art and history**: link discussion #5999, summarize round 1 (restart self-healed
   the roster once; the read still failed; rollback to `0.1.3-alpha.2` verified), and
   reference this round's comment (18371079).
9. **Bookkeeping reconciliation**: the manifest excerpt header says 60 entries while the
   sweep covered 62 — reconcile the count (roster rows vs swept entries) so the report is
   internally consistent, and list the alpha.1 → alpha.2 roster delta explicitly.

### 5.2 What the host could check at boot so this fails loud instead of rendering an empty tab

1. **Roster/combo consistency self-probe at boot.** After building `__DSH_BOOT__`, the host
   fetches every listed module URL at its listed rev (Probe 3's method, in-process) and
   **fails the boot or prints a loud, named error** if any entry does not serve — instead of
   shipping a roster the combo route cannot serve. This makes the alpha.1 failure mode
   impossible.
2. **Injection-closure + service-row check.** Verify that each client module's declared
   `inject` dependencies (e.g. `api-workspace-files` → `["dsh-api-gateway",
   "dsh-client-resources"]`) are present in the roster **and** that the corresponding host
   service rows exist in the bundle patch — i.e. that any tab type whose content depends on
   a resource service has a live host-side counterpart. A sidebar module whose provider
   cannot be resolved should refuse to register, and the host should warn.
3. **Provider-liveness / handshake assertion per session.** Require the
   `typert lookups.register` entry that resolves the session's workspace root
   (`sessions.get(sessionId)?.header.cwd` → `sandboxPolicy.workspaceRoot`) to resolve at
   session start, and log/raise if it does not; make the client-resources ↔
   api-workspace-files handshake observable rather than implicit.
4. **Tab-level fail-loud contract + watchdog.** A tab that cannot obtain content must render
   a *distinguishable* error state — provider-missing vs read-error vs timeout — naming the
   service and the failing address, offering a retry affordance, and logging a console
   error; never a bare localized 「不可用」 string. Add a watchdog: if `meta.status` stays
   `'none'` past a threshold, surface "resource service did not respond (no provider
   registered?)" with diagnostics. This alone converts this entire incident from a mystery
   into a one-line error.
5. **Scope-claim diagnostics.** When no registered tab type claims an address (the
   absolute-scope dialog), log *which* tab types were considered and which scope check
   rejected the address, instead of throwing an opaque "no registered tab type claims …".
6. **Upgrade-hygiene checks.** On boot after a version change, detect profile provenance
   mismatch (profile created under an older minor; external plugins junction-linked) and
   warn or re-link; and detect a stale client boot roster (rev mismatch between the served
   HTML/roster and what the client cached) so the client re-fetches.

---

## Appendix A — evidence index

| File | Role in the analysis |
|---|---|
| `symptom-log.txt` | Timeline: two distinct dialogs (absolute-scope claim error; session-scoped content failure), clean terminal, F12 observation. |
| `boot-manifest-excerpt.txt` | Roster excerpt: documentpreview replaces textpreview; `canOpen` narrowed to `scope === 'session'`; all six external plugins present. |
| `combo-probe.txt` | Probe 1 (manifest combo URL, 200), Probe 2 (joined mega-URL, 404 — invalid), Probe 3 (per-module sweep, 62/62 200 — valid). |
| `contrast-probe.txt` | Two readers, same file: file-trace RPC works; documentpreview tab's `meta.status` stuck `'none'`. Host-side notes on workspace-root resolution and scope rules. |
| `console-excerpt.txt` | No documentpreview/sidebar errors; only `dsh-paste-input` fold warnings (per-historical-message, self-declared independent). |
| `discussion-excerpt.txt` | #5999 round 1: roster/combo inconsistency → "loaded without registering"; restart self-healed once but the read still failed ("resource-provider chain did not take over"); rollback to 0.1.3-alpha.2 verified; alpha.2 = round 2, comment 18371079. |
| `README.md` | Pack contents. |

## Appendix B — limits of this analysis

- The evidence proves *where* the read stalls (provider-resolution boundary; no answer ever
  arrives) but not *why* the provider half never registers — stale junction-linked profile
  state, a missing `typert lookups.register` entry, and an injection-graph break are all
  consistent with the observations. Step 2 of §4.2 is the discriminating check.
- Two minor internal inconsistencies in the pack are flagged for the upstream report rather
  than resolved here: the manifest header says 60 entries while the sweep covered 62; and
  the probes used `rev=…-0` while roster rows carry per-entry revs (`…-3`, `…-N`).
  Neither changes any conclusion above.
- The fixture was opened read-only and left byte-identical; no migrations, installations, or
  network access were performed.
