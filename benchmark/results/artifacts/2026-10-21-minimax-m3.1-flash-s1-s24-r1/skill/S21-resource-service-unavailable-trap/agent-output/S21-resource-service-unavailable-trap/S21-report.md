# S21 · The Resource Service That "Unavailable" — diagnosis report

**Task:** S21-resource-service-unavailable-trap (read-only, BENCHMARK-AUTH-v1)
**Skill / mode:** `skills/plugin-upgrade` — **Mode A · inspect** (read-only investigation and report; no writes to the fixture, no installs, no host probing).
**Deployment under investigation:** Windows 11, npm-global dsh `0.1.5-alpha.1 → 0.1.5-alpha.2` in-place upgrade on a profile created under 0.1.2/0.1.3 with six junction-linked external client plugins.
**Evidence base:** `fixture/` only — `symptom-log.txt`, `boot-manifest-excerpt.txt`, `combo-probe.txt`, `contrast-probe.txt`, `console-excerpt.txt`, `discussion-excerpt.txt`, `README.md`. Plus the skill's reference cards (cited by ID below).
**Convention:** every claim is either **Confirmed** (a fixture line says it) or **Unconfirmed** (plausible but not decidable from the fixture; listed in Appendix C). The live host was not probed — the installed host runs a different version, so host-side facts are taken from the fixture's own host-side notes.

---

## Executive summary

Two **different** defects are on screen, and neither explains the other:

| # | Symptom | Failing layer | Status |
|---|---|---|---|
| 1 | `sidebarRight: no registered tab type claims "dsh-resource://file/absolute/…"` | **Address-shape producer** (client emits an `absolute`-scope address) + alpha.2's tab-claim rule (documentpreview claims **session scope only**) | Confirmed as *explained*; the emitting component is Unconfirmed |
| 2 | Session-scoped link opens a right-Sidebar tab with the right title but the body shows only 「文件资源服务不可用。」 and `meta.status` stays `'none'` | **The resource-provider chain** — client `file` resource provider → `remote.workspaceFiles` Remote → Host `workspace-files` service / `workspaceFileScope` lookup | Confirmed as the failing **seam**; the exact sub-cause inside that seam is Unconfirmed |

**The headline finding:** the tab layer, the client artifact layer, and the Host's general ability to read the file are all **healthy**. The read stalls *between* the preview tab and the Host's workspace-files service. The joined-URL 404 is an **invalid probe** and must never be cited as "modules missing" — the same 62 artifacts answer **62/62 HTTP 200** when fetched the way the loader actually fetches them. The `dsh-paste-input` fold warnings are an **unrelated simultaneous bug**. The correct maintainer posture is: **do not patch the plugin**, run the cheap boot-side check first, keep a pinned rollback as the escape hatch, and ship the forensics upstream to discussion #5999 round 2.

---

## 1. Attribution — which layer actually fails

### 1.1 What the tab proves

The failing tab is the strongest single piece of evidence, because it is a **positive** observation, not an absence:

- The tab **opens** and its **title renders correctly** (`sidebar-open-test-2.md`). Title derivation runs off the resource address and the tab-type registry, so: the tab type was **claimed** (a matching `canOpen` accepted the address), the right-sidebar registry and dock kit are alive, and the address was parsed into a title. The tab layer is **not** the failing layer.
- The tab **body** shows 「文件资源服务不可用。」 and the resource **metadata status stays `'none'`**.

Per **DSH-0.1.5-A2-14** (client-resources), the framework's internal `idle(status)` snapshot is the "no value yet" state and it no longer carries a `reload`. `meta.status === 'none'` is exactly that idle value. Therefore:

> **The read never produced a value and never produced an error.** The snapshot never left the idle state.

This rules out an *error-shaped* failure (a Host refusal would have produced a terminal error state, e.g. `workspace-file/unknown-workspace`, `workspace-file/outside-workspace`, or `too-large` per **DSH-0.1.5-A2-01 / A2-02**). The stall is **pre-value**: either the provider was never asked, or the Remote request was never answered. It also explains the "no red errors in F12" observation — a never-satisfied dependency wait is silent by construction.

### 1.2 What the two readers of the same file rule in and rule out

The contrast probe is the decisive instrument: **one file, one moment, two readers, two transports, two outcomes.**

| Reader | Transport | Outcome |
|---|---|---|
| file-trace plugin's own host RPC (`/dsh-file-trace/*`) | its own HTTP face | **READS FINE** (原文 and 阅读 both render the content) |
| documentpreview sidebar tab | `api-workspace-files` Remote | **FAILS** — `meta.status` stays `'none'` |

**Ruled OUT** (each would otherwise be the obvious first hypothesis):

1. **The file** — it exists, is non-empty, and is byte-identical for both readers.
2. **OS-level access** (ACL / lock / sharing violation) — file-trace read the same path successfully at the same moment.
3. **The Host process, the profile, and the session** — file-trace's request went to the same Host process and the same session-scoped workspace.
4. **"Outside the workspace" as a containment blocker** — the fixture's host-side note records that the service's `read()` documents *files outside the workspace are allowed*, and **DSH-0.1.5-A2-02** confirms `locateFile` no longer calls `confine(...)` (reads are governed by the composed `ctx.fs` + sandbox policy; `outside-workspace` now applies to **listings only**). The test file is under the workspace root anyway.
5. **A broken client artifact / roster / combo** — 62/62 modules serve 200 individually (see §2).
6. **A generic "the resource system is broken"** — the failure is **specific to the workspace-files path**, not to resources in general.

**Ruled IN:**

> The defect lives on the seam that the **documentpreview tab uses** and that file-trace does **not** use: the **client `file` resource provider → `remote.workspaceFiles` Remote → Host `workspace-files` service → `workspaceFileScope` Typert lookup** chain. file-trace bypasses that chain with its own host RPC and is unaffected.

The prior art agrees, in the same words: the alpha.1 round of the same failure family (**discussion #5999**) records that after the roster/combo mismatch self-healed on restart, *"the sidebar tab's content read STILL failed on that boot (文件资源服务不可用) — **the resource-provider chain did not take over**."* The alpha.2 round is the **same stall with a narrower symptom**: modules now all serve individually, but the resource-provider chain still does not take over.

### 1.3 Candidate sub-causes inside that seam (and why the fixture cannot decide)

The seam is confirmed; which link inside it is broken is **Unconfirmed**. Three candidates, all consistent with `status === 'none'` and with zero console errors:

- **C1 — client provider never activated / never asked.** **DSH-0.1.5-A2-01** changed the client provider factory to `createFileResourceProvider(remote, changes)` with the inject list dropping `sessions` → `['resources','remote','remote.workspaceFiles']`. If `remote.workspaceFiles` never becomes available on the client (an unfulfilled injection wait), the provider never runs, the snapshot stays idle, and **nothing throws** — a perfect match for the observed silence.
- **C2 — Host row present but the service/scope lookup not live.** The fixture confirms the **row is composed** (`- id: workspace-files / name: '@deepseek-ai/dsh-api-workspace-files'` is in the web-app bundle patch), and **DSH-0.1.5-A2-01** moved scope resolution to a Typert lookup registered *next to* the Remote, resolving `sessions.get(sessionId)?.header.cwd` with a `sandboxPolicy.workspaceRoot` fallback. A row that composes but whose service or lookup never registers produces the same silent idle.
- **C3 — client/host contract skew.** A pre-upgrade-shaped client bundle calling an alpha.2-changed `workspaceFiles` surface (the A2-01 signature/lookup change and the A2-14 `reload` removal are both breaking) would also never obtain a value.

**Discriminating probes (cheap, read-only — must be run before any code change):** inspect the browser's module/service state for whether `remote.workspaceFiles` resolves and whether the file resource provider registered at all (C1) versus whether the Remote is reachable from the client at all but the Host's lookup fails (C2). The fixture contains no evidence on this point, so it is recorded as pending rather than guessed.

### 1.4 The first error is a *different* defect (do not merge it with the second)

`sidebarRight: no registered tab type claims "dsh-resource://file/absolute/…"` is a **tab-claim** failure, not a read failure:

- In alpha.1 the `text` tab type (from `ui-sidebar-textpreview`) claimed `patterns:['dsh-resource://file/**']` with `canOpen = parseFileAddress!==undefined` (**DSH-0.1.5-A1-16**). An `absolute` address parsed, so it was claimed.
- In alpha.2 the replacement package `ui-sidebar-documentpreview` registers a **document** tab whose `canOpen` accepts **`parseFileAddress(address)?.scope === 'session'` only** (boot-manifest excerpt, verbatim; **DSH-0.1.5-A2-09** documents the rename). An `absolute`-scope address has no claimant → the throw.
- Independently, **DSH-0.1.5-A2-01** states that an `absolute` scope address **no longer authorizes a Host call at all** and always answers `workspace-file/unknown-workspace`, and that the correct client behaviour is `fileAddressFor()`, which **routes out-of-workspace absolute paths through the `session` scope**.

So an `absolute`-scope link is **unopenable by design on alpha.2**, and the correct fix belongs to whoever *emitted* the address (the link producer still builds the alpha.1-style `absolute` form). The fixture does not identify the emitter — the sample path points at an external plugin's own package file (`dsh-input-history/package.json`), which is a hint, not a finding (**Unconfirmed**).

**Net:** the alpha.2 rename moved this failure *earlier* in the pipeline (claim-time throw instead of read-time refusal). It did **not** create, cause, or explain the content stall of §1.1–1.3 — the session-scoped address was claimed and read-failed, so the two symptoms are independent.

---

## 2. Probe discipline — which combo probe is a measurement

### 2.1 Verdict

| Probe | Result | Is it a valid measurement of static artifact serving? |
|---|---|---|
| **Probe 1** — the boot manifest's own first combo URL, single module, at its own `rev` | **200, 73 616 bytes** | **YES** |
| **Probe 2** — all 62 entries comma-joined into one `/plugins/??a,b,c,…` URL | **404, zero-length body** | **NO — invalid measurement** |
| **Probe 3** — per-module sweep, each of the 62 entries fetched one by one at its own `rev` | **62/62 → 200, zero 404s** | **YES (and it is the controlling one)** |

### 2.2 Why Probe 2 measures nothing about module presence

1. **It is not a URL the host ever serves.** The roster gives **each entry its own URL**, and those URLs differ — e.g. `/plugins/??@deepseek-ai/dsh-api-gateway/client.js&rev=234716e8f7370214-0` versus `/plugins/??@deepseek-ai/dsh-api-workspace-files/client.js&rev=234716e8f7370214-3` versus `…&rev=234716e8f7370214-N`. The `-0 / -3 / -N` suffixes show each row carries its **own revision token**. A single comma-joined URL collapses 62 distinct revision-scoped requests into one address that no roster entry ever names.
2. **Its shape is unlike the served shape.** `??` is the host's delimiter for one module spec. `62 modules comma-joined` is not a request form the loader issues — it is a synthetic construction made by the probe, not a URL extracted from the manifest.
3. **Length.** The joined URL is ~4–5 KB, which is in the range where a request line / URI length limit rejects the request before routing. A **404 with a zero-length body** is the signature of *the request never being routed to a module handler* — not of "artifact absent". An absent artifact produces a per-module 404 **with** the module's context (that is exactly the **DSH-0.1.5-A1-20** signature: *old module 200 + new module 404 at the same rev*).
4. **Logical refutation by the data itself.** The very same 62 artifacts answer 200 when fetched individually (Probe 3). A set cannot simultaneously contain 62 missing artifacts and answer 62/62 present. The 404 belongs to the **probe's construction**, not to the artifact set.

### 2.3 Why the failing probe must never be cited as "modules missing"

Citing Probe 2 as "modules missing" would:

- **Contradict the fixture** (62/62 = 200, zero 404s).
- **Re-import the alpha.1 confusion.** The alpha.1 round's genuine roster/combo gap (**DSH-0.1.5-A1-20**, real-host verified) had a *different* fingerprint: the roster listed the new modules, but the **combo route 404'd for them while answering 200 for pre-existing modules at the same rev**, and the browser reported `failed to import loader entry <id>` with **every** client plugin unregistered. The alpha.2 page shows **no such error**, the documentpreview tab **registers and claims**, and all modules serve. Round 2 is a *related but narrower* symptom — as the discussion excerpt itself states.
- **Send the maintainer to the wrong repair.** "Modules missing" points at the artifact/roster layer and invites re-installing or re-inserting package rows. The failing layer here is the **resource-provider chain**, which no re-install fixes (the alpha.1 round already proved this: the mismatch self-healed on restart and the content read *still* failed).

### 2.4 How the real loader fetches the roster

The host injects the **boot manifest** into the page as `window.__DSH_BOOT__`; each roster entry carries its own `id`, `url` and `inject` list. The client's module registry then fetches **each entry's own URL individually** — the public `ClientModuleRegistry.fetchBundle(request)` surface (**DSH-0.1.5-A1-16**) — at that entry's own `rev`, and registers the results through the module loader. In other words:

> **The artifact-serving measurement that counts is "one request per roster entry, at that entry's own `rev`"** — exactly Probe 3, plus Probe 1 as the single-entry sanity check with a byte count. There is no "all modules at once" fetch in the loading path.

**Unconfirmed:** whether the loader performs any batching beyond per-entry fetches (e.g. a shared cache or a coalescing layer) is not decidable from the fixture; it does not affect the verdict, since the manifest itself enumerates per-entry URLs.

---

## 3. Distractor separation — two simultaneous, unrelated bugs

### 3.1 The `dsh-paste-input` fold warnings are NOT related

Evidence in `console-excerpt.txt`: the warnings are `▲ dsh-paste-input: fold skipped (parse failed)` and they **repeat for every historical paste-attachment message**. The excerpt itself records that the attachment protocol (`==== DSH_PASTE_INPUT_V1 ====`) and the `.dsh/tmp/attachments/<session>/<send>/` directory logic **do not depend on snapshot-internal implementation details** and that the full chain was **verified successfully in practice on 0809**.

Why it is orthogonal:

- **Different subject matter.** The warning is about *folding an already-stored chat bubble's text* into a 📎 chip. The failure is about *fetching file bytes for a sidebar preview*. No shared object.
- **Different scaling.** The warning count scales with **the number of historical paste messages**; the content failure scales with **the number of preview opens**. They co-occur because the page has many old paste messages — not because of causation.
- **Different severity and channel.** They are warnings (▲), not errors; the failing tab produces **no** console output at all.
- **Wrong layer.** `dsh-paste-input` is a client plugin operating on message content; the stall is a Remote seam.

**Verdict: an unrelated simultaneous bug.** Fix it separately (it is a plugin-side fold/parse tolerance issue, and the plugin owns it); do not let it colour the attribution of the resource failure, and do not list it as a symptom of the upgrade.

### 3.2 What else changed in the roster between the two versions

| Change | Card | Does it explain the content-read failure? |
|---|---|---|
| `ui-sidebar-textpreview` → `ui-sidebar-documentpreview` (package rename; bundle patch row replaced; the old row is gone) | **DSH-0.1.5-A2-09** | **No** — it explains *symptom 1* (the absolute-scope claim throw), because the new tab's `canOpen` is session-scope-only. It does not explain symptom 2: the session-scoped address *was* claimed and the tab *did* open with a correct title. |
| `workspaceFiles` drops the `Agent` first parameter for a Typert `workspaceFileScope` lookup; client provider factory becomes `createFileResourceProvider(remote, changes)` (inject drops `sessions`); `absolute` scope no longer authorizes a Host call; `parseFileAddress` becomes handwritten prefix parsing that ignores `?`/`#` and does not resolve `.`/`..` | **DSH-0.1.5-A2-01** | **Yes — prime suspect.** This is precisely the seam that stalls (§1.3): a scope lookup + a re-shaped client provider + a rewritten address parser, all on the exact path the failing tab uses. |
| Unconfined reads (`locateFile` no longer calls `confine`), new `maxFileBytes` cap, new `readAll`/`readRelated` | **DSH-0.1.5-A2-02** | **No — it exonerates a hypothesis.** It makes "the file is outside the workspace" a non-blocker for reads and rules out a confinement refusal. |
| `client-resources` drops `reload` from `ResourceSnapshot`/`ResourceProvider`; the internal `idle(status)` no longer attaches one | **DSH-0.1.5-A2-14** | **No (not a cause), but it explains the *shape* of the failure**: the failing tab is showing the framework's idle snapshot, which now has no `reload` affordance — hence a title with an empty body, a static message, and no retry hint. |
| `rightbar` becomes root-scoped with a new `rightbar.session` child; layout service/store rewritten; `selectPanel`/`beginNavigation`/`usePanelInfo` | **DSH-0.1.5-A2-13** | **No** — the tab opened and rendered its title in the right column, so the rightbar seating works. |
| Sidebar-right default pages seed lazily; last tab's close collapses the column; guide tabs lose `description` | **DSH-0.1.5-A2-24** | **No** — no guide/page-seeding behaviour is involved in a resource tab's body. |
| `ctx.documentPreviews` registry + keyed slot `sidebar.right.tab.document`; preview reads are text-paged or byte-complete; over-limit files are refused, never truncated | **DSH-0.1.5-A2-21** | **No** — an over-limit file would be *refused* (`too-large`), producing an error state, not `status === 'none'`. It is a candidate source of *other* preview bugs, not this one. |
| `present`/reveal delivery surface; `deliverables/presented` + `subagent/catalog` become **non-ignorable** session events | **DSH-0.1.5-A2-05**, **A2-08** | **No** for the sidebar symptom. A2-05 does carry a real, *separate* upgrade hazard: **an older harness cannot read a session log containing those non-ignorable events** — which matters for the rollback plan (§4) and must be disclosed before any downgrade. |

**Net roster change:** the roster delta that matters for *this* symptom is the **A2-01 workspaceFiles/address/provider rework**, not the preview-package rename (which owns symptom 1) and not the paste-input plugin (unrelated).

### 3.3 A roster-count discrepancy worth carrying upstream

The boot manifest excerpt says **"Total entries: 60"**, while the sweep in the symptom log and the combo probe covers **62 manifest entries**. The two lists are not demonstrably the same set (the sweep list may include the six external plugin modules, or count differently). This does not change the verdict — every probed entry answers 200, and the tab layer demonstrably registered — but it is an **unexplained discrepancy** and belongs in the upstream forensics as **two verbatim lists**, not as one reconciled number.

---

## 4. Mitigation decision — should the plugin work around it, and in what order?

### 4.1 Decision: **no plugin-side workaround**

| Candidate workaround | Verdict | Reason |
|---|---|---|
| **Rewrite the address** (e.g. convert an `absolute` address into a `session` one inside the plugin) | **Reject** | It re-implements `fileAddressFor()` in the wrong place, and it targets **symptom 1**, not the stall. Under **DSH-0.1.5-A2-01** an `absolute` address is *documented* to be unauthorized (`workspace-file/unknown-workspace`); papering over it in one plugin spreads a contract violation across the fleet and hides the real address-producer defect. Also: the failing case was already **session-scoped**, so address rewriting does not touch it at all. |
| **Retry** the read on failure | **Reject** | The read never *failed* — it never returned. `meta.status` stayed `'none'`; there is no error code, no retryable classification, and (per **DSH-0.1.5-A2-14**) no `reload` on the idle snapshot to hang a retry on. Retrying an unfulfilled injection wait is a no-op or a hot loop. The skill's safety boundary also forbids default retries of unknown `gateway/internal`-class failures unless the failure is retryable, the operation is idempotent, and policy allows — **none of the three holds**. |
| **Fallback** (plugin re-reads the file through its own RPC, like file-trace does) | **Reject as a fix; acceptable as an interim UX only** | It would make the preview work by duplicating a Host capability inside a client plugin, with its own path/scope/permission semantics. It also diverges from alpha.2's documented boundary (**DSH-0.1.5-A2-02**: the effective read boundary is the composed `ctx.fs` + sandbox policy, and a plugin that serves file content must enforce its own containment). Good as a *temporary* user route; wrong as a repair. |
| **Re-insert / add the `workspace-files` row to the profile's `cordis.patch.yml`** | **Reject — actively harmful** | The host row is **already composed by the web-app bundle** (fixture host-side note). The 0.1.5 series ships `workspace-files` / `ui-sidebar-*` via the bundle; adding a duplicate insert makes Cordis treat it as a **fatal duplicate loader entry id** at boot (troubleshooting reference, Cordis composition rules). This would trade an empty tab for a host that will not start. |

**Principle applied:** the defect is host-side / contract-level, in a seam the plugin does not own and cannot repair from the client. The six junction-linked external plugins are **not** implicated — file-trace reads the same file successfully through its own transport. Rewriting plugin code here would be **masking a host defect**, which the skill explicitly forbids ("must not modify DSH core to conceal plugin incompatibility", in the same spirit).

### 4.2 The order to act in

**Step 0 — free, user-facing, zero risk (do it now).**
Route readers to the **file-trace plugin's own panel** (原文 / 阅读), which reads the same file successfully. This is the existing, working reader; it needs no code change and it restores the user's ability to see file content today. Note it in the report and in the upstream thread.

**Step 1 — FIRST CHEAP STEP (minutes, read-only): one clean host restart + hard browser refresh.**
- Stop **every** dsh process (Windows file locks make an in-place replace fail with EBUSY; a browser refresh is not a host stop — troubleshooting reference, EBUSY row), then start the host again and hard-refresh the page.
- Why first: the alpha.1 round of this same failure family **self-healed its roster/combo mismatch on a subsequent boot** (**DSH-0.1.5-A1-20**), and the client bundle/roster state is rebuilt at host boot. It costs minutes and it can also tell you whether the stall is stale in-process state.
- If the stall persists after a clean restart (expected, given the alpha.1 precedent where the content read still failed post-restart), **record that fact** — it converts "maybe a stale boot" into "reproducible across clean boots", which is exactly what the upstream report needs.

**Step 2 — cheap discriminating probes (still read-only), before touching any code:**
1. Re-run the **per-entry sweep at each entry's own `rev`** (the controlling measurement) — confirm it is still 62/62 = 200 and record byte counts (this re-validates §2 and refreshes the upstream evidence).
2. Determine **where the stall sits** — client side (does `remote.workspaceFiles` resolve / did the file resource provider register?) vs Host side (is the `workspace-files` service/its `workspaceFileScope` lookup live for that session?). This is the one gap in the current evidence pack (Appendix C) and it selects between C1/C2/C3 in §1.3.
3. Verify the **profile composition** for a duplicate `workspace-files` / `ui-sidebar-*` insert (must be absent) and confirm the row's activation in the resolved composition.

**Step 3 — ESCAPE HATCH (pinned rollback), when the workflow must be restored:**
- Command shape (pinned **exact** version — never the bare `latest` dist-tag, which can silently resolve to an older line):
  `npm i -g @deepseek-ai/dsh@<exact-version>`, executed **from an external terminal** with **all dsh processes stopped**.
- Two candidate pins, and the honest difference between them:
  - `0.1.5-alpha.1` — the version this deployment's six external plugins shipped "declare support" patch releases against (six-plugin crossing record, **DSH-0.1.5-A1-20** file). It restores the pre-upgrade roster, but **its own round also showed 文件资源服务不可用 on that boot** — so it is *not* a guaranteed fix for the content read.
  - `0.1.3-alpha.2` — the version the discussion records as the **verified rollback target** for this deployment family. It predates the right-sidebar/resource extension points entirely (**DSH-0.1.5-A1-16** landed at alpha.1), so the file-link-in-sidebar feature disappears with the bug. Stability restored, feature removed.
- **Disclose before downgrading:** **DSH-0.1.5-A2-05** — alpha.2 sessions carry **non-ignorable** session events (`deliverables/presented`, `subagent/catalog`). A **downgraded** harness **cannot read a session log containing them**. Before rolling back, confirm the sessions to be preserved are readable by the target build, or export what matters first.
- **Never execute the global host upgrade/rollback from inside a dsh session** — the session *is* the host process; npm replaces the tree it is executing from and the `dsh` command disappears until an external pinned re-install repairs it (skill, "Global DSH host upgrades").

**Step 4 — GOES UPSTREAM:** the forensics package of §5, appended to **discussion #5999** (round 2 already exists there as comment **18371079**), plus a host-side bug report for the resource-provider chain. The upstream thread is where a maintainer-side fix belongs: the client cannot repair an unfulfilled service/lookup wait.

### 4.3 What the maintainer should explicitly *not* do

- Do not cite the joined-URL 404 as "modules missing" (§2.3).
- Do not reinstall/re-link the six external plugins — file-trace's successful read proves the plugin plane is healthy.
- Do not add a `workspace-files` insert to the profile patch (fatal duplicate loader entry).
- Do not treat the `dsh-paste-input` warnings as part of this bug (§3.1).
- Do not patch the host to hide the symptom (the skill's explicit prohibition on concealing incompatibility).

---

## 5. Prevention and upstream

### 5.1 What a complete upstream report must contain

1. **Identity & environment:** host versions before/after (`0.1.5-alpha.1` → `0.1.5-alpha.2`), npm-global install channel, Windows version, node version, the profile's creation lineage (0.1.2/0.1.3), and the six junction-linked external client plugins by name + version + install mode.
2. **The boot roster, verbatim** — the `__DSH_BOOT__` manifest as fetched after the restart, **including the 60-vs-62 count discrepancy shipped as two lists** (§3.3), not one reconciled number.
3. **The artifact evidence, correctly framed:**
   - the manifest's own first entry URL fetched verbatim → **200 + byte count** (73 616 bytes);
   - the **per-entry sweep at each entry's own `rev`** → **62/62 = 200, zero 404s**, with byte counts;
   - the joined-URL probe **explicitly labelled INVALID**, with the reason (not a URL the host serves; own-rev tokens collapse; ~4–5 KB length; zero-length body ⇒ not routed) — so no one downstream re-cites it as missing modules.
4. **The contrast probe in full** — the exact session-scoped address, both readers, both transports, both outcomes at the same moment, plus the host-side composition notes (the `workspace-files` row's presence and id/name, the scope-resolution description, and the "reads outside the workspace are allowed" quote). *This is the load-bearing artefact: it is what exonerates the file, the OS, the sandbox, and the Host's read capability.*
5. **The client-side observation set:** `meta.status === 'none'`, the literal UI copy 「文件资源服务不可用。」, zero console errors from the sidebar/documentpreview/resource system, no `failed to import loader entry`, no `duplicate loader entry id`.
6. **The two symptom classes, kept apart:** (a) absolute-scope claim throw — explained by the alpha.2 rename plus the session-scope-only `canOpen`; (b) session-scope content stall — the actual defect.
7. **The exclusion list, with the evidence for each:** paste-input fold warnings (unrelated); roster/combo mismatch of the **DSH-0.1.5-A1-20** type (ruled out — per-entry 200s, tab registered and claiming, no loader errors); file/OS/permission/sandbox (ruled out — file-trace's successful read).
8. **The card mapping** for the seam, by ID only: **DSH-0.1.5-A2-01** (workspaceFiles scope lookup + client provider + address semantics), **A2-02** (unconfined reads), **A2-09** (preview package rename), **A2-14** (`reload` removal / idle snapshot), **A2-21** (preview registry), **A1-16** (resource + right-sidebar extension points), **A1-20** (the earlier real-host roster/combo pitfall and its restart-heals behaviour).
9. **What was NOT captured** — an explicit unconfirmed list (Appendix C), so upstream does not have to guess or re-derive it.
10. **Rollback evidence:** the exact pinned command that was verified, the outcome, and the A2-05 non-ignorable-session caveat attached to it.

### 5.2 What the host could check at boot so this class of failure fails loud

The whole family here is **silent by construction**: a title renders, an idle snapshot renders as a generic "service unavailable" string, and the console stays clean. The host/client should convert that silence into a boot-time (or first-use) red line:

- **B1 — Service/lookup reachability assertion at boot.** After composition, assert that the `workspace-files` row **activated**, that its service is registered, **and** that the `workspaceFileScope` lookup **resolves** for a sample session (the `sessions.get(sessionId)?.header.cwd` / `sandboxPolicy.workspaceRoot` fallback). A row that composes but whose service or lookup never registers must be reported as *"workspace-files composed but scope lookup unresolved"*, not left to fail on a click. This directly targets candidate **C2**.
- **B2 — Client-side injection liveness assertion.** The client already has the vocabulary for this ("waiting for service: …", "N entries did not activate"). Extend it to the resource chain: assert that `remote.workspaceFiles`, the `resources` service and the **file resource provider** are live after module load, and fail loudly (console + a visible banner) when an injection wait is unfulfilled. This directly targets candidate **C1** and is the single highest-value change: it converts the exact silent state that produced this bug into a boot error.
- **B3 — Roster-vs-artifact consistency check at boot.** For every `__DSH_BOOT__` entry, assert the artifact for that **id + rev** exists and is servable; and assert that no roster entry names a module that the installed tree renamed or removed (e.g. a roster still referencing `ui-sidebar-textpreview` on an alpha.2 tree). Report the offending ids by name. This would have caught **DSH-0.1.5-A1-20** *before* the first click, instead of after.
- **B4 — Address/claim coverage check.** When `sidebarRight.openResource` is handed an address that **no registered tab type claims**, the error must be actionable: echo the address **scope** (`absolute` / `session`), the list of registered claimants and their patterns, and the documented rule (on alpha.2 an `absolute` address is never claimable and never authorizes a Host call; out-of-workspace paths must be routed through `fileAddressFor()` into the `session` scope — **DSH-0.1.5-A2-01**). Today it is a bare "no registered tab type claims …", which reads like a missing module and is what made this round confusing.
- **B5 — Distinct, surfaced failure states for reads.** A resource read must distinguish: *not permitted* (`workspace-file/unknown-workspace`, `workspace-file/outside-workspace`, `too-large`), *remote error* (with its code and request id), and *never answered* (a stall). Today all three collapse into one generic 「文件资源服务不可用。」 with `status === 'none'`, and the idle snapshot has no `reload` affordance (**DSH-0.1.5-A2-14**), so a user cannot tell "denied" from "never asked" and gets no retry affordance. The visible copy should carry the **Remote error code**, and the idle state should offer a **retry** once the framework supports it.
- **B6 — Joinable diagnostics.** A resource-diagnostics dump (address → provider id → status timeline → last Remote error) reachable from the sidebar's own debug affordance, plus a Host-side log line per workspace-files Remote call (method, sessionId, resolved root, outcome). The alpha.1 and alpha.2 rounds both had to be attributed with indirect probes because the two sides could not be joined; a shared correlation id would make the next round a five-minute diagnosis.
- **B7 — A supported "health" command.** A read-only host check that answers "is the resource chain alive on this profile?" (rows composed vs services registered vs lookups resolvable vs artifacts servable) — the kind of thing the fleet could run across many upgraded profiles instead of hand-probing each one.

---

## Appendix A · Evidence index (fixture line → what it establishes)

| Fixture file | Establishes |
|---|---|
| `symptom-log.txt` | Two distinct dialogs (absolute-scope claim error; session-scoped content failure); boot printed no errors; tab opens with correct title but empty body; file-trace reads the same file fine; F12 has no sidebar/resource errors; 62/62 per-module 200 |
| `contrast-probe.txt` | Same file / same moment / two readers / two transports / two outcomes; `meta.status` stays `'none'`; the `workspace-files` row **is** in the web-app bundle patch; scope resolution via the typert lookup with the cwd/workspaceRoot fallback; reads outside the workspace are allowed |
| `combo-probe.txt` | Probe 1 single-module 200 (73 616 bytes); Probe 2 joined URL 404 zero-length, ~4–5 KB; Probe 3 per-module 62/62 = 200 |
| `boot-manifest-excerpt.txt` | Roster excerpt with per-entry URLs and per-entry `rev` suffixes; 60 entries; `ui-sidebar-right` present, `ui-sidebar-textpreview` **absent**, `ui-sidebar-documentpreview` is the replacement; all six external plugins present; the alpha.2 document tab's `canOpen` accepts **session scope only** |
| `console-excerpt.txt` | Only `dsh-paste-input` fold warnings (per historical paste message); the paste protocol does not depend on snapshot internals and was verified working on 0809; nothing else logged |
| `discussion-excerpt.txt` | Alpha.1 round of the same family (#5999): roster/combo 404s at one rev, all plugins unregistered, restart self-healed the roster but **the content read still failed — "the resource-provider chain did not take over"**; rollback to `0.1.3-alpha.2` verified as the escape hatch; alpha.2 round is narrower; forensics already appended as round 2 (comment 18371079) |
| `README.md` | Evidence-pack provenance: real 2026-09-09 npm-global alpha.1 → alpha.2 in-place upgrade on Windows, profile created under 0.1.2/0.1.3, six junction-linked external client plugins |

## Appendix B · Cards cited (key points only)

| Card | Key point used here |
|---|---|
| **DSH-0.1.5-A2-01** | `workspaceFiles` drops the `Agent` parameter for a Typert `workspaceFileScope` lookup; client provider becomes `createFileResourceProvider(remote, changes)` (inject drops `sessions`); an `absolute` address no longer authorizes a Host call and answers `workspace-file/unknown-workspace`; `fileAddressFor()` routes out-of-workspace paths through the `session` scope; `parseFileAddress` is now handwritten prefix parsing |
| **DSH-0.1.5-A2-02** | Reads are no longer workspace-confined (`locateFile` no longer calls `confine`); `outside-workspace` applies to listings only; new `maxFileBytes` cap on `readAll`/`readRelated` with `too-large` (never truncated) |
| **DSH-0.1.5-A2-05** | `deliverables/presented` and `subagent/catalog` are non-ignorable session events → **an older harness cannot read sessions containing them** (rollback caveat) |
| **DSH-0.1.5-A2-09** | `ui-sidebar-textpreview` → `ui-sidebar-documentpreview` rename (bundle row replaced) |
| **DSH-0.1.5-A2-13** | `rightbar` becomes root-scoped with a new `rightbar.session` child; layout service/store rewritten |
| **DSH-0.1.5-A2-14** | `client-resources` drops `reload` from `ResourceSnapshot`/`ResourceProvider`; the internal `idle(status)` no longer attaches one — the basis for reading `status === 'none'` as "never left idle" |
| **DSH-0.1.5-A2-21** | `ctx.documentPreviews` registry + keyed slot `sidebar.right.tab.document`; paged `read` for text/code/Markdown, `readAll` bytes for PDF/HTML/images; over-limit files are refused, not truncated |
| **DSH-0.1.5-A2-24** | Sidebar-right default pages seed lazily; last tab's close collapses the column; guide tabs lose `description` |
| **DSH-0.1.5-A1-16** | The `client-resources` service, the `dsh-resource://` address protocol, the right-sidebar tab registry, and `ClientModuleRegistry.fetchBundle(request)` as the client-side bundle surface; alpha.1's `text` tab claimed `dsh-resource://file/**` |
| **DSH-0.1.5-A1-20** | Real-host-verified pitfall: an in-place npm-global upgrade can serve a combo that omits newly-added bundle modules (old 200 + new 404 at the same rev, all plugins unregistered); **a host restart self-healed it**; rollback to the previous published version is the escape hatch; upstream thread = discussion #5999 |

## Appendix C · Unconfirmed (not decidable from the brief + fixture)

1. **Which link of the resource-provider chain stalls** — client provider never activated / Remote never answered / client-host contract skew (§1.3, C1–C3). Discriminating probe specified in §4.2 Step 2.
2. **Who emitted the `absolute`-scope address** in symptom 1 (a link producer still using the alpha.1 address form). The sampled path points into an external plugin's tree; that is a hint, not a finding.
3. **The 60 (roster) vs 62 (swept) entry-count discrepancy** — whether the swept list is the roster plus the six external plugin modules, or a different counting basis.
4. **Whether the client loader ever batches** beyond per-entry fetches (§2.4). Does not affect the verdict.
5. **Whether a clean host restart changes the outcome.** The alpha.1 round's restart healed the roster but not the content read; the alpha.2 round's restart outcome for the content read is not in the fixture — hence Step 1 is ordered first, and its result is to be recorded.
6. **Whether the six external plugins' own client bundles are affected** in any way beyond the address-shape issue. file-trace's successful read shows the plugin plane works; the other five were not individually exercised in this evidence pack.

## Appendix D · Constraints observed during this run

- **Read-only.** The fixture was **not** modified, moved, or deleted; the report is the only artifact written, under the designated output directory.
- **No host probing.** No `dsh --version` / `--dump-config` / `plugin --help` / `headless --help`, and no `cordis_inspect_*` introspection: the installed host runs a different version, so its facts would be out of scope and wrong for this task.
- **No installs, migrations, restarts, or upgrades** were performed, and no external service was contacted. The mitigation steps in §4 are **recommendations for the maintainer**, not actions taken here.
- **Boundary respected**: every file read came from the cell directory (fixture + `skills/plugin-upgrade/` reference material). No card text is reproduced wholesale — Appendix B lists card IDs with key points only.
