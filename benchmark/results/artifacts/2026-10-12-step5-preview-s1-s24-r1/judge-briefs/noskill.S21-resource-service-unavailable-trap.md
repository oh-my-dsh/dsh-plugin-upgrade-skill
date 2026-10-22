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

# S21 — The Resource Service That "Unavailable" (Read-Only) — Analysis Report

Deployment under analysis: dsh 0.1.5-alpha.1 → 0.1.5-alpha.2, npm-global in-place upgrade, Windows 11,
profile created under 0.1.2/0.1.3, six external client plugins junction-linked.
Evidence: the read-only fixture pack (`symptom-log.txt`, `boot-manifest-excerpt.txt`, `combo-probe.txt`,
`contrast-probe.txt`, `console-excerpt.txt`, `discussion-excerpt.txt`).

---

## 1. Attribution — which layer actually fails

**Two different symptoms are visible; only one is a service failure.**

- **Symptom A (dialog on the absolute-scope link):** clicking a link outside the session workspace
  (`dsh-resource://file/absolute/E:/…/package.json`) yields `sidebarRight: no registered tab type claims
  "dsh-resource://file/absolute/…"`. Per the boot manifest note, in alpha.1 `ui-sidebar-textpreview`
  registered a `"text"` tab type claiming `dsh-resource://file/**` (all scopes); in alpha.2 its
  replacement `ui-sidebar-documentpreview` registers a document tab whose `canOpen` accepts
  `parseFileAddress(address)?.scope === 'session'` **only**. So Symptom A is a *claim-layer narrowing*,
  produced by the package rename — a behavior regression, but not the content-read failure.

- **Symptom B (the tab with a title and no content):** a session-scoped file
  (`E:\deepseek-harness\test-lhh010\.dsh\tmp\sidebar-open-test-2.md` →
  `dsh-resource://file/session/session-2844c12c-…/.dsh/tmp/sidebar-open-test-2.md`) **does** get a
  right-sidebar tab, and the tab is titled correctly — which proves the tab module loaded, registered,
  claimed the address, and parsed it. The content area shows only 「文件资源服务不可用。」 (no error text,
  no retry hint). The layer that fails is therefore **the runtime resource-read/metadata chain**:
  the client resource service consuming `@deepseek-ai/dsh-api-workspace-files` (the `dsh-resource://file/…`
  provider). Everything *below* (static serving), *above* (tab claiming, title rendering), and *beside*
  (file-trace's own RPC) works.

**What the two readers of the same file rule in / out** (contrast probe, same file, same moment):

| Reader | Result | Rules out |
|---|---|---|
| **file-trace plugin** via its **own host RPC** (`/dsh-file-trace/*` routes) | READS FINE — 原文 and 阅读 modes both show content | The OS/filesystem layer (file exists, is readable at that exact path on this Windows profile despite the junction links), the host process generally, and any session/workspace resolution being fundamentally broken — the host is alive and can serve this very file at this exact moment. |
| **documentpreview tab** via the **api-workspace-files Remote** | FAILS — metadata never arrives, tab shows 「文件资源服务不可用。」 | The sidebar UI layer and the tab-claim layer (the tab opened and titled correctly, so claiming and address parsing work). The failure is *downstream of the claim*: the resource-provider chain itself. |

**What `meta.status` staying `'none'` says about where the read stalls:** the read never transitions out of
its initial state — not `loading`, not `error`, certainly not `ready`. A missing file, a permission denial,
or a broken read would surface an *error* status with a message; a slow read would show `loading`. A status
frozen at `'none'` is the signature of a provider that **never answers at all**: the read request is issued
against the resource service but never reaches any implementation, or its response never comes back — the
service is *unavailable/unbound at runtime*, and the stall is at the very first hop of the chain
(client resource service → api-workspace-files Remote binding), **before any metadata or byte of the file
is produced**. The console is silent about it because nothing on that path is even far enough along to
throw. This matches the prior art's wording: "the resource-provider chain did not take over."

Note also (host-side notes, contrast probe): the workspace-files host row **is** in the web-app bundle
patch (`cordis.patch.yml: "- id: workspace-files / name: '@deepseek-ai/dsh-api-workspace-files'"`), and
the `read()` doc explicitly allows files outside the session workspace — so `.dsh/tmp` location and
"outside workspace" scope are not blockers. The service is *packaged and listed*; its runtime binding to
the client is what is dead.

---

## 2. Probe discipline — the two combo probes

- **Valid measurement of static artifact serving:** the **per-module sweep** (Probe 3: 62/62 HTTP 200),
  reinforced by Probe 1 (the boot manifest's own first combo URL, single module → 200, 73,616 bytes).
  These mirror real traffic: they fetch URLs of exactly the shape the bootstrap consumes.
- **Invalid measurement:** the **all-62-entries-joined single URL** (Probe 2 → 404, zero-length body).
  It must never be cited as "modules missing", for three independent reasons:
  1. **The probe is self-invalidating in construction.** The joined URL is ~4–5 KB long; a zero-length-body
     404 on such a request is a pre-routing rejection (request-line / proxy / route URL-length limits), so
     it measures the *probe*, not the server. The runtime never issues that request.
  2. **It is semantically wrong.** The boot manifest gives each entry its **own per-entry `rev`**
     (e.g. `@deepseek-ai/dsh-api-workspace-files` … `&rev=234716e8f7370214-3`, while gateway/others sit at
     `…-0` and the sidebar-right row at `…-N`). The joined probe pinned one rev (`…-0`) over all 62 —
     a state the real route is never asked to serve.
  3. **Its result is contradicted by the valid probe on the same host, same minute** (62/62 = 200), so it is
     a false negative. Citing it would mis-attribute a serving-layer failure where none exists and send the
     investigation (and the upstream report) down the wrong path.

**How the real loader fetches the roster instead:** from the same-origin `__DSH_BOOT__` manifest. Each
roster entry carries its own individual `url` field — `/plugins/??<module>/client.js&rev=<per-entry-rev>` —
and the client bootstrap enumerises the roster and fetches each module by that per-entry URL (the `??` combo
route exists for per-module/small combos, not a mega-join). The faithful reproduction is therefore the
per-module sweep: 62/62 HTTP 200 ⇒ **static artifact serving is healthy on 0.1.5-alpha.2**, and the failure
is definitively *not* in the serving layer. (Housekeeping for the upstream report: the excerpt header says
"Total entries: 60" while the probes counted 62 roster/combo entries — pin the exact roster and counts in
the final report.)

---

## 3. Distractor separation

**The repeated `dsh-paste-input: fold skipped (parse failed)` warnings are NOT related to the content-read
failure.** Evidence:
- They concern the *fold/collapse* of sent paste-attachment message bubbles (the
  `==== DSH_PASTE_INPUT_V1 ====` marker protocol and `.dsh/tmp/attachments/<session>/<send>/` directory
  logic) — i.e. rendering of already-sent history, a different subsystem from the resource chain.
- They repeat **for every historical paste-attachment message** — i.e. data predating the upgrade — so they
  are not even triggered by the current session/read path.
- The console shows **zero** errors from documentpreview / the sidebar / the resource system; the failing
  subsystem is *silent* (consistent with a frozen `meta.status`, cf. §1), so these warnings are not its
  exhaust.
- The console excerpt itself records that the paste protocol chain "do[es] not depend on snapshot-internal
  implementation details; the full chain was verified successfully in practice on 0809."

Treat it as a separate, pre-existing, cosmetic/known bug bundled in the same console capture. Keeps the
attribution clean.

**What else changed in the roster between the versions:** `packages/client/ui-sidebar-textpreview` was
**replaced** by `packages/client/ui-sidebar-documentpreview` (census: `ui-sidebar-textpreview` = 0 mentions;
the old cordis.patch.yml row is gone, the new row carries the document tab). The `api-workspace-files`
roster entry is present with its injection list (`@deepseek-ai/dsh-api-gateway`,
`@deepseek-ai/dsh-client-resources`), and all six external plugins (dsh-file-trace et al.) plus
dsh-profiles / dsh-brand-version are still present.

**Does that change explain the symptom?** Partially — it fully explains **Symptom A** (the absolute-scope
`no registered tab type claims…` dialog): the new document tab's `canOpen` accepts session scope only, so
absolute-scope addresses now legitimately have no claimant. It does **not** explain **Symptom B**: the
session-scoped file *did* get a tab with a correct title, proving the renamed module loaded and registered
fine — yet the metadata read still never arrived. So the rename is a distractor for the content failure
(it narrows what *can* be opened; within the still-supported session scope the read chain is still dead).
Also note the alpha.1 round's problem — roster/combo inconsistency ("loaded without registering") — is
absent in this round: every module serves (62/200) and loads, which is what makes the remaining failure
*precisely* the resource-provider runtime binding.

---

## 4. Mitigation decision

**Should the plugin work around the unavailable service (rewrite / retry / fallback)? No.**
- The failure lives in host code (the client-resources ↔ api-workspace-files resource-provider binding),
  not in anything the user-side plugin owns; a plugin-side rewrite/retry/fallback would mask an upstream
  bug, create a permanent maintenance fork, and diverge from the platform.
- Retry is demonstrably pointless: `meta.status` frozen at `'none'` is deterministic, not transient — the
  same outcome persisted across a restart in the alpha.1 round and across two alpha releases.

**Order of actions for the maintainer (cheap first, escape hatch, upstream):**
1. **First cheap step — restart and re-verify.** Run `dsh web restart` (and reload the web UI). Prior art
   shows a host restart previously self-healed a roster/combo mismatch; doing it here cleanly separates
   the two rounds: if resource metadata starts flowing, the cause was stale runtime registration; if the tab
   still shows 「文件资源服务不可用。」 with `meta.status` at `'none'`, you have confirmed a genuine
   registration bug and ruled out staleness. Cost: seconds. Simultaneously sanity-check that serving is fine
   (it is: 62/62 per-module 200) so nobody wastes time "fixing" the combo route.
2. **Escape hatch — roll back to the last known-good published version.** Verified in prior art:
   `npm i -g @deepseek-ai/dsh@0.1.3-alpha.2` (note: staying on 0.1.5-alpha.1 is *not* a fix — the symptom
   persisted there after the restart self-heal). Pin the version so an auto-upgrade cannot re-break the
   deployment.
3. **Upstream — report and track.** Attach the forensics (§5) to the existing thread (discussion #5999,
   round 2 — comment 18371079), watch for a fixed published version, re-upgrade only when it lands, and
   re-run this exact two-reader check after upgrading.

Rough severity call: this is a host-side regression with a safe workaround (rollback), not an emergency —
but the *silent* nature of the failure (a friendly-looking tab with no content and no console error) is
what makes it dangerous in daily use.

---

## 5. Prevention / upstream

**Forensics a complete upstream report needs** (append to #5999 round 2):
- **Environment:** before/after versions (0.1.5-alpha.1 → 0.1.5-alpha.2), install method (npm -g, in-place
  on the same machine), OS (Windows 11), profile provenance (created under 0.1.2/0.1.3, six
  junction-linked external client plugins — list their ids/versions).
- **Exact repro with both address scopes and the exact strings:** the absolute-scope dialog
  (`no registered tab type claims "dsh-resource://file/absolute/…"`), and the session-scope repro (tab
  titled `sidebar-open-test-2.md`, content 「文件资源服务不可用。」, `meta.status` stays `'none'`), including
  the full `dsh-resource://file/session/session-2844c12c-…/…` address and the on-disk path.
- **The contrast probe (the key exhibit):** same file, same moment — file-trace's own RPC reads fine, the
  documentpreview tab's api-workspace-files read never returns metadata.
- **Manifest + probe evidence:** the `__DSH_BOOT__` excerpt (workspace-files row with rev and inject list,
  sidebar-right row, the full 60/62-entry roster and reconciled counts), the sidebar census (textpreview 0
  mentions, documentpreview present), the valid per-module probe results (62/62 200) — and an explicit note
  that the joined-URL 404 is a probe artifact and must not be read as missing modules.
- **Console excerpt** (no resource/sidebar errors; paste-input fold warnings flagged as unrelated).
- **Prior art / timeline:** discussion #5999 round 1 (roster/combo mismatch, restart self-heal, persistent
  read failure, rollback verified) and this round's narrower symptom.
- **Maintainer question to phrase explicitly:** since the workspace-files host row is in the bundle patch
  and its files-readable doc is satisfied, why does the client-side resource-provider chain fail to take
  over after an in-place upgrade onto an old profile — is the in-migration registration of the
  client-resources ↔ api-workspace-files Remote binding (and/or the typert `lookups.register` entry
  resolving `sessions.get(sessionId)?.header.cwd` → `sandboxPolicy.workspaceRoot`) silently no-opping when
  the service registry was created by 0.1.2/0.1.3?

**What the host could check at boot so this class fails loud instead of rendering an empty tab:**
- **Roster/serving self-check (the alpha.1 lesson):** after fetching `__DSH_BOOT__`, probe each entry's own
  per-entry URL at its rev; if any 404s, abort/loud-banner instead of half-loading clients.
- **Claims/provider audit after boot:** assert that every scheme the UI is expected to open has a claimant
  and a provider — specifically that `dsh-resource://file/**` is claimed by some tab type, and that
  `dsh-api-workspace-files` is registered as a Remote with a live channel bound to `client-resources`. If
  a roster entry is present but its client-side provider/Remote binding is absent, emit a **red console
  error and a boot banner**, not silence. (This exact check would have caught Symptom B: module loaded,
  tab claimed, provider chain never bound.)
- **Client-side read watchdog / loud failure:** when a tab has claimed an address but the resource
  `meta.status` stays `'none'` past a short deadline (e.g. 2–5 s), surface a real error status
  ("resource service did not respond") with diagnostics — which provider was tried, the address, the last
  status — instead of the content-free 「文件资源服务不可用。」.
- **Profile/upgrade hygiene:** detect that the profile (and its service registry) was created by an older
  minor line, and either migrate the registry or warn at boot that an in-place upgrade carried stale
  registration state; log which service rows were re-registered vs inherited.
- **Scope-change visibility:** the rename narrowed `canOpen` from all scopes to session-only; that belongs
  in release notes, and absolute-scope opens should get a clear "unsupported address scope" message rather
  than the generic "no registered tab type claims" dialog.

---

## Verdict summary

| Question | Answer |
|---|---|
| Failing layer | Runtime resource-read/metadata chain (client resource service → api-workspace-files Remote). Tab claiming and static serving are healthy; file-trace's own RPC proves host+filesystem+session resolution fine. |
| Read-stall site | `meta.status` frozen at `'none'` — stall *before* the first byte: provider never answers (unbound/unavailable at runtime), not a read error. |
| Valid probe | Per-module sweep (62/62 200) and the manifest-shaped single-module combo — these mirror the loader, which fetches each roster entry by its own per-entry `url`/`rev`. |
| Invalid probe | The all-62-joined ~4–5 KB URL (404, zero-length body): pre-routing URL-length rejection + wrong single rev → measures the probe, never cite as "modules missing". |
| Distractors | `dsh-paste-input` fold warnings (unrelated, pre-existing, historical messages, silent failing subsystem); the textpreview→documentpreview rename explains Symptom A only. |
| Mitigation | No plugin-side workaround (host bug, deterministic, not transient). Order: restart & re-verify → roll back to 0.1.3-alpha.2 (pin) → report upstream with full forensics. |
| Prevention | Boot-time roster/serving probe, post-boot claims/provider audit, client read watchdog that fails loud, profile-migration warnings, release notes for the scope narrowing. |

*Constraint note: no in-place fix was performed and the fixture directory was left completely unchanged;
analysis is based solely on the evidence pack in the allowed read path.*


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.