
# S21 · The Resource Service That "Unavailable" — Diagnosis Report

**Case**: dsh 0.1.5-alpha.1 → 0.1.5-alpha.2 npm-global in-place upgrade, Windows 11, profile created under 0.1.2/0.1.3, six external client plugins junction-linked.
**Evidence pack**: `fixture/` (read-only, unchanged). All claims below are traceable to `symptom-log.txt`, `boot-manifest-excerpt.txt`, `combo-probe.txt`, `contrast-probe.txt`, `console-excerpt.txt`, `discussion-excerpt.txt`, `README.md`.

---

## 1. Attribution — which layer actually fails

**Conclusion.** Two different layers fail, and only the second one is the subject of this case. The **absolute-scope click fails in the tab-type claim layer** (address → registered tab type), and that failure is loud and already explained by a deliberate roster change. The **session-scope click fails one layer deeper, in the resource-metadata read chain** between the documentpreview tab and the `@deepseek-ai/dsh-api-workspace-files` host service: the tab registers, claims the address, renders the title, and then the metadata record never leaves its initial `meta.status === 'none'` state, so the tab renders its `文件资源服务不可用。` fallback. The host file service itself is **not** the failing layer.

### 1.1 What each symptom localizes

| Symptom | Layer | Fails how |
|---|---|---|
| `sidebarRight: no registered tab type claims "dsh-resource://file/absolute/E:/…"` | tab-type claim layer (address → tab type) | loud, dialog (`无法打开文件 / 重试`), no tab created |
| Session-scope file: tab titled `sidebar-open-test-2.md`, content `文件资源服务不可用。` | resource-metadata read chain (tab → resource provider → api-workspace-files Remote → gateway → host service) | **silent** — no red console error, no retry hint, `meta.status` stuck at `none` |

### 1.2 The two readers of the same file — what they rule in and rule out

`contrast-probe.txt` reads the *same* file (`E:\deepseek-harness\test-lhh010\.dsh\tmp\sidebar-open-test-2.md`, session-scoped address `dsh-resource://file/session/session-2844c12c-…/.dsh/tmp/sidebar-open-test-2.md`) through two independent transports at the same moment:

- **file-trace plugin, its own host RPC face (`/dsh-file-trace/*`) — READS FINE** (both 原文 and 阅读 modes show content). This rules **out**: the file being missing/unreadable, filesystem permission/ACL problems, session→workspace-root resolution being broken, and `.dsh/tmp` being outside the allowed scope (the contrast probe explicitly notes the service allows files outside the workspace root, and that `.dsh/tmp` under the workspace root "is not the blocker"). In other words: **the host-side read capability is intact.**
- **documentpreview sidebar tab, via the api-workspace-files Remote — FAILS**, `meta.status` stays `'none'`. This rules **out** a client-side rendering bug in the tab itself (the title renders correctly, the tab component and its layout work) and rules out the tab-type registration layer (a session-scoped address *is* claimed — otherwise we would get the same dialog as the absolute-scope click). It rules the failure **in** to the segment between the tab's metadata request and a completed host read: the resource-provider chain / Remote registration / gateway hop — i.e. the request is either never claimed by a registered provider or never completed, and nothing reports it.

### 1.3 What `meta.status === 'none'` says about where the read stalls

`meta.status` is the lifecycle state of the resource metadata record for the opened address. `'none'` is the **initial / never-resolved** state: no provider has ever produced metadata for that address. Therefore the read does **not** stall *inside* the host file read (that would be a mid-read error and would surface as an error status, and file-trace's parallel success proves the host read would succeed anyway). It stalls **before** the host read — at provider resolution/claim, or on the client↔host transport (Remote/gateway) where the request is neither answered nor rejected. The absence of any console error is consistent: nothing in the chain detects the stall, so the tab falls back to a generic, silent "unavailable" string instead of an error state.

---

## 2. Probe discipline — the two combo probes

**Conclusion.** Only the **per-module sweep (Probe 3: 62/62 HTTP 200)** is a valid measurement of static artifact serving; the **all-62-joined URL (Probe 2: 404)** is not a measurement of anything real and must never be cited as "modules missing".

### 2.1 Which probe is valid, and why

- **Probe 1 (the boot manifest's first combo URL, single module → 200, 73 616 bytes)** and **Probe 3 (every manifest entry fetched one by one → 62/62 200, zero 404s)** are valid, because each URL is *exactly* a URL the boot manifest hands to the client. A 200 per entry proves each module's static JS artifact is served correctly at the failing rev. Together they establish the **negative result that matters**: the alpha.1 failure signature (roster rows the combo route cannot serve at that rev) is **absent** in this round.
- **Probe 2 (all 62 entries comma-joined into one ~4–5 KB URL → 404, zero-length body)** is invalid as a measurement of module availability. No client, loader, or browser ever requests that URL; it is an artifact constructed by the prober. The 404 is explained by the URL itself (length / route-parsing / proxy-and-gateway limits on a multi-KB query string), not by any module being absent — a hypothesis already disproved by Probe 3, where the same 62 modules each return 200. Citing Probe 2 as "modules missing" would be citing a measurement of the *probe's own URL construction*, and would send the investigation after a non-existent serving bug while the real defect (a silent resource-metadata stall) goes unreported.

### 2.2 How the real loader fetches the roster instead

The real client does **not** join entries into one URL. It fetches `__DSH_BOOT__` **same-origin after the restart** (the boot manifest excerpt is that dump: 60 total entries, each with `id`, `url`, `inject`), then loads **each entry individually by its own `/plugins/??<one-module>/client.js&rev=…` URL**, resolving the dependency graph through the `inject` field (e.g. `@deepseek-ai/dsh-api-workspace-files` injects `@deepseek-ai/dsh-api-gateway` and `@deepseek-ai/dsh-client-resources`). That is precisely the traffic Probes 1 and 3 measure — which is why the per-module sweep is the correct instrument and the joined probe measures a URL that exists nowhere in the pipeline. (Note also the honest labeling: the boot manifest excerpt reports "Total entries: 60", while the sweep covers "62 manifest combo entries" — the counts come from different scopes, so any upstream report must state which roster/rev each number refers to.)

---

## 3. Distractor separation

**Conclusion.** The `dsh-paste-input` fold warnings are **unrelated** to the content-read failure and must be filed separately. The one roster change between the two versions — `ui-sidebar-textpreview` being **replaced by `ui-sidebar-documentpreview`** — fully explains the *first* symptom (the absolute-scope claim dialog) and does **not** explain the *second* (the silent content-read stall).

### 3.1 `dsh-paste-input: fold skipped (parse failed)` — unrelated

The warnings are emitted at `client.js:1010` and concern the **paste-attachment message-bubble collapsing protocol**: the fenced `=== DSH_PASTE_INPUT_V1 ===` marker (a triple-backtick code fence) and the `.dsh/tmp/attachments/<session>/<send>/` directory logic. Per `console-excerpt.txt`, they repeat **for every historical paste-attachment message** (a per-message render-time parse skip on old messages), the console note states the chain "was verified successfully in practice on 0809", and they are the **only** console output on the failing page — no documentpreview or resource-system error at all. Nothing in that path touches the sidebar tab-type layer, the resource-provider chain, or api-workspace-files; it is a client-side message-rendering parse skip, independent of the file-read failure. Keep it as a **separate, pre-existing bug** (report it separately; do not let it absorb the resource failure, and do not let the resource failure hide it).

### 3.2 What changed in the roster, and what it does / does not explain

Change (from `boot-manifest-excerpt.txt`): in 0.1.5-alpha.2 the tree **replaced `packages/client/ui-sidebar-textpreview` with `packages/client/ui-sidebar-documentpreview`**; `packages/bundle/web-app/cordis.patch.yml` carries the `ui-sidebar-documentpreview` row, the old `ui-sidebar-textpreview` row is gone, and a substring census over the served HTML shows `ui-sidebar-textpreview` **ABSENT (0 mentions)** while `ui-sidebar-right` is present. The **`text` tab type** that claimed `dsh-resource://file/**` was registered by `ui-sidebar-textpreview` in alpha.1; the replacement `ui-sidebar-documentpreview` registers a **document tab whose `canOpen` accepts `parseFileAddress(address)?.scope === 'session'` only**.

- **Explains symptom 1 (absolute-scope claim error).** The new document tab deliberately narrows its claim to session scope, so `dsh-resource://file/absolute/…` addresses have **no claimer** → the "no registered tab type claims" dialog. This is a **contract/behavior change introduced by the rename**, and it fails **loud** — visible, diagnosable at click time.
- **Does not explain symptom 2 (silent content-read stall).** For a session-scoped address the new tab *does* claim and open (the title proves it), so the claim layer passes and the rename's narrowed `canOpen` is not in the path. The stall is downstream, in metadata resolution. The rename changes **who claims addresses**, not **whether the resource service returns metadata**; it cannot produce a `meta.status` that never leaves `'none'`.

So: the rename is a **co-occurring, version-induced regression** that explains the dialog; the read stall is a **separate defect** that must not be attributed to the rename. `discussion-excerpt.txt` corroborates the separation — on the alpha.1 round a restart self-healed the roster/combo mismatch, yet "the sidebar tab's content read STILL failed on that boot" — i.e. the serving/roster problem and the read failure are independent.

---

## 4. Mitigation decision

**Conclusion.** The plugin should **not** work around the unavailable service by rewriting/retrying/falling back the read path — at least not as a first move. file-trace proves the host file service is healthy through a different face, so a client-side retry/fallback would paper over a host/gateway-side registration or transport defect that every other consumer of the same resource chain will also hit, and retrying a request that is never claimed is a busy-loop against a silent stall.

### 4.1 Order of action for the maintainer

1. **First cheap step — restart the host and hard-reload the client** (`dsh web` restart, reload with cache bypass). Rationale: this is an in-place npm-global upgrade onto a profile created under 0.1.2/0.1.3 with six junction-linked external client plugins, i.e. exactly the state in which the client plugin graph / provider registration can be left inconsistent; the alpha.1 precedent (`discussion-excerpt.txt`, #5999) shows a restart self-healed the roster/combo mismatch once. It is cheap, reversible, and diagnostic: re-run the contrast probe afterwards (session-scope click + file-trace RPC + documentpreview tab) and see whether `meta.status` ever leaves `'none'`.
2. **Escape hatch — roll back to the last known-good published version** (`npm i -g @deepseek-ai/dsh@0.1.5-alpha.1`; the alpha.1 round verified `@deepseek-ai/dsh@0.1.3-alpha.2` as the escape hatch). Take this if the restart does not clear the stall, and take it **before** writing any code workaround.
3. **Stopgap only if rollback is impossible — make the failure loud, not silent.** Do not invent a second read path. Either (a) have the tab render a diagnostic state (the resource address, its scope, which provider was asked, elapsed time, and an explicit retry affordance) instead of the bare `文件资源服务不可用。`, or (b) read through an already-working face (the file-trace-style own-RPC route) as a local patch. Both are patches to be reported upstream, not fixes.
4. **Symptom 1 needs no workaround at all.** The absolute-scope claim error is the new, declared contract: either open such addresses by another route (move/copy the file into the session workspace, or use the working file-trace face) or ask upstream to restore absolute-scope claims — and, at minimum, to make the dialog state the supported scopes.

### 4.2 What goes upstream

Everything in §5 — and explicitly **not** a local rewrite of the resource chain. The fix belongs where the stall is produced (provider claim / Remote registration / gateway hop, or the missing boot-time self-check).

---

## 5. Prevention / upstream

**Conclusion.** A complete upstream report needs version/install provenance, the full boot roster, both probes with the invalid one explicitly labeled, the contrast probe with the observed `meta.status`, the console and boot output, and a minimal repro; and the host should check roster↔combo consistency, tab-type/provider claim coverage per scope, and a metadata-response watchdog at boot so this class fails loud instead of rendering an empty tab.

### 5.1 Forensics a complete upstream report needs

- **Version & install provenance**: exact from → to (`0.1.5-alpha.1` → `0.1.5-alpha.2`), install method (npm global, in-place), OS, profile provenance (created under 0.1.2/0.1.3), and the **six junction-linked external client plugins** with their ids and link method.
- **Boot roster**: the complete `__DSH_BOOT__` dump (every entry's `id`/`url`/`inject`) plus the served-HTML census of `ui-sidebar-*` rows (present vs. absent, including the `ui-sidebar-textpreview` → `ui-sidebar-documentpreview` replacement and the removal of the old `cordis.patch.yml` row).
- **Probe evidence**: the per-module sweep (62/62 HTTP 200) **and** the joined probe, with the joined probe **explicitly labeled as an invalid, self-constructed measurement** (never as "modules missing"); plus per-module status for the two relevant entries (`@deepseek-ai/dsh-api-workspace-files`, `@deepseek-ai/dsh-client-ui-sidebar-right`) at the failing rev, and a statement of which roster/rev each count (60 vs. 62) refers to.
- **Contrast probe**: the exact failing session-scoped address, both readers' results, and the observed metadata lifecycle — `meta.status` stays `'none'`, never resolved — with the file-trace RPC success on the same file as the control.
- **Silent-failure evidence**: the F12 console excerpt (no documentpreview/resource errors; only the unrelated `dsh-paste-input` warnings) and the terminal boot output (`[dsh-profiles] ready`, web URL, no visible errors) — establishing that nothing in the chain reports the stall.
- **Registered tab-type contract**: which tab type is registered for `dsh-resource://file/**` in alpha.2 and its `canOpen` predicate (`scope === 'session'` only), versus the alpha.1 `text` tab type that claimed `dsh-resource://file/**`.
- **Repro & controls**: the exact steps (write a file inside the session workspace, click the link, observe the empty tab; click an absolute-scope link, observe the dialog), the restart result, the rollback verification result, and a fresh-profile-vs-upgraded-profile comparison.

### 5.2 What the host could check at boot so this fails loud

- **Roster ↔ combo consistency check**: for every `__DSH_BOOT__` entry, fetch its module URL at the listed rev **server-side, in-process**, and fail loud on any non-200. This is exactly the alpha.1 signature (newly-added roster rows 404 at that rev while old rows 200) and it is currently only discoverable by hand-probing.
- **Tab-type claim coverage per scope**: after client plugins load, assert that at least one registered tab type claims `dsh-resource://file/**` for each scope the host intends to support (session *and* absolute), or that the supported scopes are explicitly declared — so a rename that narrows `canOpen` surfaces at boot instead of at click time with an unexplained dialog.
- **Resource-provider chain health**: assert that the provider chain for file addresses is actually registered in the client plugin graph (e.g. verify the `inject` graph for `@deepseek-ai/dsh-api-workspace-files` → `@deepseek-ai/dsh-api-gateway` + `@deepseek-ai/dsh-client-resources`, or ping the service / inspect the gateway route table) and report missing injections.
- **Metadata watchdog / explicit failure state**: when a tab requests file metadata, require a provider to answer within a timeout; on timeout or never-claimed, render a **diagnostic** state (address, scope, provider asked, elapsed, retry) instead of the bare `文件资源服务不可用。` — i.e. turn a `meta.status` stuck at `'none'` into an explicit `timeout` / `unclaimed` status carrying the request details.
- **Upgrade integrity check for junction-linked external plugins**: after an in-place upgrade, verify that junction-linked plugins' expected entry ids still resolve and warn when a roster row's package was renamed/replaced, so contract changes like `ui-sidebar-textpreview` → `ui-sidebar-documentpreview` are surfaced at upgrade time rather than discovered by a user clicking a link.

---

## Appendix — evidence → claim map

| Claim | Source |
|---|---|
| Absolute-scope claim dialog; session-scope empty tab; file-trace RPC reads the same file | `symptom-log.txt` §2–§3, `contrast-probe.txt` |
| Tab renders title, content `文件资源服务不可用。`, no retry hint | `symptom-log.txt` §3 |
| `meta.status` stays `'none'`; documentpreview uses api-workspace-files Remote | `contrast-probe.txt` |
| Host service allows files outside the workspace root; `.dsh/tmp` not the blocker | `contrast-probe.txt` |
| `ui-sidebar-textpreview` → `ui-sidebar-documentpreview` replacement; `canOpen` accepts session scope only; `text` tab type claimed `dsh-resource://file/**` in alpha.1 | `boot-manifest-excerpt.txt` |
| `__DSH_BOOT__` same-origin roster; `inject` graph of api-workspace-files | `boot-manifest-excerpt.txt` |
| Per-module 62/62 200; joined URL 404 (~4–5 KB) | `combo-probe.txt` |
| Only `dsh-paste-input` warnings; paste protocol details; verified 0809 | `console-excerpt.txt` |
| alpha.1 round: roster/combo 404 → "loaded without registering"; restart self-healed roster but read still failed; rollback verified | `discussion-excerpt.txt` (#5999, round 2 = comment 18371079) |
| Pack is exam material, read-only | `README.md` |
