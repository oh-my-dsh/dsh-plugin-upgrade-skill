# JUDGE BRIEF · skill.S21-resource-service-unavailable-trap

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
#### FILE: S21-resource-service-unavailable-trap/S21-report.md

# S21 · The Resource Service That "Unavailable" — read-only diagnosis

**Mode**: A · inspect (read-only) per `plugin-upgrade` SKILL.md — investigation + report, then stop.
**Corridor**: dsh `0.1.5-alpha.1 → 0.1.5-alpha.2`, npm-global in-place upgrade, Windows 11, profile created under 0.1.2/0.1.3, six junction-linked external client plugins.
**Executed here**: reading `/app/fixture/` (7 files) and the skill's corridor cards only. **Not executed**: no install, no migration, no host restart, no network call, no write outside `/app/agent-output/`. Fixture integrity re-verified by sha256 against `fixture-hash-before.json`: **7/7 identical** (see §9).
**Authorization**: BENCHMARK-AUTH-v1 (unattended; the brief is the confirmation).

---

## 0. Verdict in one table

| # | Finding | Layer | Status |
|---|---|---|---|
| A | `sidebarRight: no registered tab type claims "dsh-resource://file/absolute/…"` for an out-of-workspace link | Tab-type **claim** layer (client tab registry) | Explained: alpha.2 narrowed the file tab's `canOpen` to `scope === 'session'`; an `absolute`-scope address now has no claimant **and** is documented unauthorized at the Host. Separate defect from B; fixing B does not fix A. |
| B | Session-scoped file opens a correctly **titled** tab whose body is only 「文件资源服务不可用。」, `meta.status` stays `'none'` | **Resource provider / service-resolution** layer (`ctx.resources` `file` provider ← `api-workspace-files` client half → `remote.workspaceFiles`) | The read is **never dispatched**. Not static serving, not the file, not permissions, not scope authorization, not the fs. Leading hypothesis H1 (§2.5). |
| C | `dsh-paste-input: fold skipped (parse failed)` repeats | Message-bubble fold parsing, a different plugin | **Unrelated distractor** — but a genuine second regression candidate; own ticket, own forensics (§4.1). |
| D | Per-row sweep 62/62 HTTP 200 vs all-62-joined 404 | Measurement quality | Probe 3 is the valid **shape**; Probe 2 is **invalid** and must never be cited as "modules missing". The pack itself has hygiene defects (60 vs 62 entries; probe `rev …-0` vs row `rev …-3/…-N`) — re-capture before it goes upstream (§3). |

---

## 1. Question 1 — Attribution: which layer actually fails

### 1.1 The two dialogs are two different failures at two different scopes

| | Dialog A (log step 2) | Dialog B (log step 3) |
|---|---|---|
| Address | `dsh-resource://file/absolute/E:/deepseek-harness/dsh-input-history/package.json` (outside the session workspace) | `dsh-resource://file/session/session-2844c12c-…/.dsh/tmp/sidebar-open-test-2.md` (inside it) |
| Scope | `absolute` | `session` |
| UI | `sidebarRight: no registered tab type claims …` + 「无法打开文件 / 重试」 | Tab **opens**, title `sidebar-open-test-2.md` renders, body = 「文件资源服务不可用。」, no error, no retry |
| Failing layer | Tab-type **claim** (`canOpen` coverage) | **Resource read** (provider/service resolution) |
| Same bug? | No | No |

Dialog A is a *claim-coverage* failure: nothing in the registry accepts the address, so no tab is ever created and no read is attempted. Dialog B is the opposite shape: the claim succeeded, the tab mounted, the title rendered — and the content pipeline behind it produced nothing. Treating them as one bug is the single easiest way to mis-fix this: a claim fix (registering an absolute-capable tab) would still leave the body empty, because an `absolute` address is separately documented to return `workspace-file/unknown-workspace` at the Host in alpha.2 (**DSH-0.1.5-A2-01**).

### 1.2 Layer ladder, and where the evidence places the stall

| Rung | Layer | Verdict | Evidence |
|---|---|---|---|
| L0 | Static artifact serving (`/plugins/??…/client.js`) | **OK** | per-row sweep 62/62 200 (`combo-probe.txt` Probe 3); single module 200 / 73 616 B (Probe 1) |
| L1 | Module registration / cordis apply | **OK** for the preview package | no `failed to import loader entry`, no `loaded without registering` in the log or console |
| L2 | Tab-type claim (`canOpen`) | **OK for `session`, FAILS for `absolute`** | Dialog A vs Dialog B; boot-manifest note: alpha.2 `canOpen` accepts `parseFileAddress(address)?.scope === 'session'` only |
| L3 | Tab mount + title render | **OK** | title `sidebar-open-test-2.md` shown |
| L4 | **Resource provider / service resolution** (`ctx.resources` `file` provider, `useResource`, `remote.workspaceFiles` handle) | **← STALLS HERE** | `meta.status` stays `'none'`; body is the "service unavailable" branch; zero red console output |
| L5 | Remote / gateway dispatch | never reached | no error status, no reported request |
| L6 | Host scope lookup (Typert `workspaceFileScope`: `sessions.get(sessionId)?.header.cwd` → `sandboxPolicy.workspaceRoot`) | never reached | would have produced `gateway/lookup-not-found` (**A2-01**) |
| L7 | fs read / caps (`maxFileBytes`, `too-large`, `outside-workspace`) | never reached — and independently proven healthy | the same bytes read fine through file-trace; **A2-02** (reads are no longer workspace-confined, so `.dsh/tmp` under the root is not the blocker — the pack says this too) |

**What `meta.status === 'none'` tells us.** `'none'` is the *initial/idle* value, not an error value: the metadata did not fail, it never began. A read that was dispatched and rejected would land on an error status and would leave a network entry (and, normally, a console line); an authorization failure would be a named outcome (`workspace-file/unknown-workspace`, `outside-workspace`, `too-large`). "Never dispatched + no exception" is the signature of a **missing/unresolved provider or service handle at mount time**: the consumer takes an expected "unavailable" branch instead of throwing, which is exactly why F12 is clean. `discussion-excerpt.txt` names the same thing from the alpha.1 round: "the resource-provider chain did not take over". The relevant contract surface moved in this very edge — provider factory `createFileResourceProvider(remote, changes)`, inject list `['resources','remote','remote.workspaceFiles']` (dropping `sessions`), value type `WorkspaceFileStat`, `reload`/`restat` deleted (**A2-01**), plus `reload` removed from `ResourceSnapshot`/`ResourceProvider` (**A2-14**) — so a consumer/provider drift or a non-activated provider row lands precisely here.

**What the correct title does *not* prove.** The title comes from the tab definition / the live-title seat fed by the parsed address (**A2-24** notes `sidebar.right.pane.tab.title` is used by document-preview tabs), i.e. from L2–L3, without touching L4–L7. "Title right, body empty" is therefore *progress over Dialog A but not evidence of a healthy read path* — it is the fingerprint of a stall at or below L4. It also proves L0/L1 for that package better than any HTTP code does: a module that was not served and registered cannot veto-claim an address and render a titled tab.

### 1.3 The two readers of the same file: what they rule in and rule out

Same file, same moment, same page (`contrast-probe.txt`): file-trace's own host RPC (`/dsh-file-trace/*`) **reads fine** (原文 and 阅读 both render); the documentpreview tab via the `api-workspace-files` Remote **fails** with `meta.status` stuck at `'none'`.

**Ruled OUT** (because one independent transport succeeds on the identical resource):
- the file itself — existence, content, encoding, Windows path form, ACL/permissions, "the file is locked/hidden";
- the host process being dead, hung, or its HTTP face being down;
- host-side filesystem access to that path, and session→workspace-root resolution being fundamentally broken;
- the browser page being broken (JS runtime, CSP, a crashed React tree, an offline/reconnecting socket);
- the session being unknown to the host;
- "the six external plugins are broken" as a blanket claim — the plugin-owned transport is the one that *works*;
- static artifact serving as the cause of the empty body (jointly with L0/L1 above).

**Ruled IN**:
- the fault is confined to **one specific service path** — the workspace-files / client-resources chain the first-party preview consumer uses — while a parallel transport is healthy. Two transports diverging on one resource localizes the defect to the transport that failed, not to the shared substrate;
- it is an **activation/resolution** failure, not a data failure: nothing arrives at all (as opposed to wrong, stale, or corrupt content);
- the failing ends are **first-party alpha.2 packages** (consumer: `ui-sidebar-documentpreview`; provider: `api-workspace-files` client half over `client-resources`), while the junction-linked plugins were untouched by the upgrade and had already crossed `0.1.3-alpha.2 → 0.1.5-alpha.1` with zero code changes (alpha.1 crossing record) — so this is not "plugin incompatibility" and must not be fixed by editing plugins;
- the defect is **persistent, not a one-boot artifact**: it survived the alpha.1 healing restart and reappeared on alpha.2 (`discussion-excerpt.txt`), which demotes "stale boot snapshot" and promotes "composition/contract" causes.

### 1.4 Dialog A attribution (the absolute-scope claim error)

Alpha.1's reference file tab was `kind='text'`, `priority:'fallback'`, `patterns:['dsh-resource://file/**']`, `canOpen = parseFileAddress !== undefined` — i.e. **any** parseable file address (**DSH-0.1.5-A1-16**). Alpha.2 replaced the package (**DSH-0.1.5-A2-09**: `ui-sidebar-textpreview` → `ui-sidebar-documentpreview`) and the document tab's `canOpen` accepts `scope === 'session'` only (boot-manifest excerpt). Meanwhile **A2-01** documents that an `absolute`-scope address no longer authorizes a Host call at all (always `workspace-file/unknown-workspace`) and that `fileAddressFor()` routes out-of-workspace absolute paths through the **session** scope.

So the claim coverage narrowed exactly where the host's own authorization model narrowed. The open question is **why an `absolute`-scope address is still being produced** on an alpha.2 client. Two candidates, both checkable read-only:
1. a **persisted historical link** — the address string was baked into a chat node / turn tail written under alpha.1 and is replayed from the session log (alpha.2 reshaped that area: **A1-07** system prompts in history, **A2-19** `ChatFileMentions.forClosing` + deliverables turn tail);
2. a **producer that hand-builds** `dsh-resource://file/absolute/…` instead of calling alpha.2's `fileAddressFor()`. The failing path — `E:/deepseek-harness/dsh-input-history/package.json` — is out-of-workspace *and* happens to be one external plugin's own directory, which makes that plugin's link producer worth inspecting first (read-only), without presuming guilt.

Either way the correct fix is at the **producer** (emit the session-scope address alpha.2 authorizes) plus a host-side fail-loud check (§6.2) — not a workaround inside the preview tab.

### 1.5 Ranked hypotheses for Dialog B, with the probe that separates them

| H | Hypothesis | Mechanism | Discriminating read-only probe | Standing |
|---|---|---|---|---|
| **H1** | First-party provider non-activation / consumer-provider contract drift inside the alpha.2 client composition | The `file` resource provider that `api-workspace-files`' client half registers into `ctx.resources` is absent when documentpreview mounts → `useResource` yields the idle snapshot → status `'none'` → "unavailable" branch, no exception | HAR of the failing tab open: **expect zero** workspace-files requests. Then inspect the resolved client composition / the provider registry for a `file` provider, and the roster row's `inject` prerequisites (`dsh-api-gateway`, `dsh-client-resources`) | **Leading** — fits every observation, including the clean console, the persistent-across-restart history, and the fact that the contract on both sides of this boundary moved in the same edge (A2-01 / A2-14 / A2-21) |
| **H2** | Ghost host / cross-plane version skew | Client halves are re-fetched on every hard refresh, but the host half only changes on a **real process restart** (hygiene §3; troubleshooting row 16). A running alpha.1 host process exposes the old `workspaceFiles` Remote (Agent-first signatures, no Typert `workspaceFileScope` lookup) to an alpha.2 client | Compare the host **process start time** against the installed tree's version/mtime (pre-flight §1.5; `ghost-host-check.mjs` is POSIX-only, so on Windows do it manually), and classify by a **behavioral** probe, never by a version string. The log says "dsh web restart" but does not evidence a full process stop — and a browser refresh is not a host stop | **Live** — cheap to exclude, and the in-place-upgrade + Windows + file-lock context makes it plausible |
| **H3** | Legacy-profile composition residue | A profile created under 0.1.2/0.1.3 and hand-patched during earlier upgrades can compose a half-migrated client tree (stale/disabled row, or a stale `ui-sidebar-textpreview` reference in the profile layer) | `dsh --profile <name> --dump-config` (read-only): are the alpha.2 rows present, enabled, non-duplicated? Any pre-0.1.5 row left? | **Plausible.** The *fatal* variant is excluded: a manual `insert` of a bundle-provided id crashes boot with `duplicate loader entry id` (troubleshooting row 18), and this host boots |
| H4 | A1-20-class artifact/roster gap (combo omits newly-added modules) | Roster lists a module, combo 404s for it at its own rev while old modules 200 | Per-row fetch at each row's **own** rev, new-vs-old contrast | **Effectively excluded for alpha.2** (per-row 200s, no loader-entry assertion, preview mounted). It *is* the explanation for the alpha.1 round — do not re-import it via Probe 2 |
| H5 | File / permission / path / scope-authorization / size-cap cause | — | — | **Excluded** by the contrast probe and by the named error outcomes such causes would produce (A2-01/A2-02) |

---

## 2. Question 2 — Probe discipline: which combo probe measures anything

### 2.1 The three probes

| Probe | Request | Result | Verdict |
|---|---|---|---|
| 1 | one pre-existing module, `rev=…-0` | 200, 73 616 B | Valid but weak: proves the route serves. Mislabeled — the excerpt's first row is `api-workspace-files` at `rev …-3`, not `api-gateway` at `…-0` |
| 2 | all 62 modules comma-joined into one `/plugins/??` URL (~4–5 KB), `rev=…-0` | 404, zero-length body | **INVALID** as a measurement of static artifact serving |
| 3 | all 62 entries fetched one by one | 62/62 200 | **Valid shape** (mirrors the loader); not yet citable as-is — see §2.4 |

### 2.2 Why Probe 2 is not a measurement

1. **It is not a request the loader ever makes.** The roster is per-row (`id` + `url` + optional `inject`); the loader fetches each row's own URL. The `??` combo is scoped to what a row declares, never to "the entire roster in one URL". A 404 for a request shape the product does not emit measures the *request*, not the *artifacts*.
2. **The URL length alone can explain the 404.** At ~4–5 KB the request sits in the range where server/proxy URL and header limits reject before any artifact lookup happens. A **zero-length body** is the shape of a route/limit rejection; a genuine missing-module lookup in this family reports the module (cf. `failed to import loader entry <id>`).
3. **The `rev` is wrong for every row.** Both probes used `rev=234716e8f7370214-0`; the roster rows carry per-row revs (`…-3`, `…-N`). The request therefore does not even address the artifacts the roster advertises.
4. **The denominator does not match the snapshot.** The manifest excerpt says **60** entries; the probes say **62**. The joined URL was not built from the roster it is being compared against.

### 2.3 Why the failing probe must never be cited as "modules missing"

"Modules are missing from the served combo" is a **specific, falsifiable host defect** with a known valid test — the **A1-20** pattern: fetch one **new** bundle module and one **old** module **at the same rev**; old-200 + new-404 pins the gap to the host's artifact/rev set rather than to a plugin. Probe 2 has no per-module resolution, no matching rev, and no control, so it cannot distinguish "artifact absent" from "request rejected".

Citing it anyway costs three things:
- **Inverted attribution.** It points at static serving, which this pack's own evidence contradicts twice over (62/62 per-row 200; and the preview package demonstrably loaded, registered, claimed, and titled a tab). The real defect — a resource-provider stall — would go unreported.
- **Wrong mitigations.** It licenses reinstall loops, `node_modules` surgery, hand-inserted profile rows (fatal per troubleshooting row 18), and rollback for the wrong reason.
- **Poisoned upstream.** A maintainer who cannot reproduce a 4–5 KB joined-URL 404 will discount the whole report, including the real finding. An invalid probe is worse than no probe: it spends the one resource the reporter cannot refund — upstream's trust. (Round 1 of #5999 was already hard to read because a genuine roster/combo mismatch and a residual content failure were tangled; round 2 must not add a third, artificial strand.)

### 2.4 Probe 3 is the right shape — with two repairs before it is citable

- Re-run **in the same boot** as the manifest capture, at **each row's own `rev`**, and reconcile the entry count (**60 vs 62**) — record which snapshot each number came from.
- Remember that **HTTP 200 is necessary, not sufficient**. SKILL.md validation layer 4 requires exactly this for a Web Client plugin: exchange the token URL for its cookie, read the host boot manifest, request the advertised client artifact, and **prove registration/mount rather than accepting a bare HTTP 200**. Here registration is proven *behaviorally* (claim + title), which is stronger evidence than any status code.

### 2.5 How the real loader actually fetches the roster

1. The host injects `window.__DSH_BOOT__` into the same-origin page HTML; each entry carries `id`, `url` (a `/plugins/??<that row's module(s)>/client.js&rev=<per-row rev>` combo), and an optional `inject` list of prerequisite module ids — e.g. `api-workspace-files` injects `dsh-api-gateway` and `dsh-client-resources`.
2. The loader walks the entries, satisfies the `inject` prerequisites, and fetches **each entry's own URL** — one request per row, never a roster-wide join.
3. Client halves register through `window.__ModuleLoader__.load({ id, factory })` with `require("react")` inside the factory (troubleshooting row 13); a row whose script executes without registering trips `loaded without registering "<id>"` (row 8), and the id named there is only the **first awaited entry**, routinely an innocent one.
4. Therefore the correct probe grammar is: **per row → at the row's own rev → then prove registration/mount**, plus the A1-20 new-vs-old same-rev contrast when an artifact gap is suspected.

---

## 3. Question 3 — Distractor separation

### 3.1 The `dsh-paste-input` fold warnings are unrelated to the content-read failure

| Test | Result |
|---|---|
| Same component/plane? | No — message-bubble fold parsing vs the right-sidebar resource read |
| Severity? | `warning`, not error; the failing page has **no** red output from documentpreview or the resource system |
| Correlates with the trigger? | No — it "repeats for every historical paste-attachment message", i.e. with chat-history volume, not with tab opens |
| Shared data path? | No — it consumes message text / the `DSH_PASTE_INPUT_V1` marker and `.dsh/tmp/attachments/<session>/<send>/`, not `dsh-resource://` reads or `ctx.resources` |
| Decisive control | At the same moment, in the same page, another reader (file-trace) succeeds — nothing page-global is broken; and the tab still opened and titled |

**But it is a second real defect, not noise to discard.** The plugin's own console text records that the marker protocol and attachments-directory logic were "verified successfully in practice on 0809"; a parse failure on alpha.2 is therefore a regression candidate against this edge's chat-surface reshaping (**A1-07** system prompts moved into message history, **A2-05** two new non-ignorable session events, **A2-19** `ChatFileMentions.forClosing(sessionId)` + deliverables turn tail). Give it its own ticket with its own forensics (which message nodes fail to fold; one redacted payload sample; the same session compared on alpha.1 vs alpha.2). It is explicitly **not** a cause, a mitigation, or an acceptance criterion for the sidebar defect.

**Why the separation matters mechanically:** bundling them makes a first-party resource-chain defect look plugin-caused (the warnings are the only visible plugin output on the page), which is precisely how a host bug gets closed as "third-party plugin noise" — and how a genuine paste-input regression gets fixed by nobody.

### 3.2 What else changed in the roster between the two versions

- `ui-sidebar-textpreview` → **0 mentions**; replaced by `ui-sidebar-documentpreview`, and `packages/bundle/web-app/cordis.patch.yml` carries the new row with the old one gone (**A2-09**: package rename; a dependency on the old name resolves nowhere).
- The contract set around it moved in the same edge: **A2-01** (`workspaceFiles` Agent-first parameter → Typert `workspaceFileScope` lookup; `createFileResourceProvider(remote, changes)`; inject drops `sessions`; `WorkspaceFileStat`; `reload`/`restat` deleted; `absolute` scope unauthorized; `parseFileAddress` rewritten), **A2-14** (`client-resources` drops `reload`), **A2-21** (`ctx.documentPreviews` registry + keyed `sidebar.right.tab.document`; text-paged vs byte-complete reads; `observedVersion`), **A2-24** (guide `description` removed; `defaultSeed(tabs)` lazy seeding; live-title seat), **A2-13** (`rightbar` root scope + `rightbar.session`; layout service/store rewrite).

### 3.3 Does that change explain the symptom? Split verdict.

- **Dialog A — yes, directly.** The claiming package changed identity and its `canOpen` narrowed from "any parseable file address" to "`session` scope only". The roster change *is* the mechanism (with the producer-side question of §1.4 still open).
- **Dialog B — no, not by itself.** The renamed package is in the roster, served, loaded, registered; it claimed the session address and rendered the title. Had the rename failed, a session address would also have produced a no-claim error or a `loaded without registering` assertion. What the rename legitimately does is **locate the risk**: the same edge rewrote the file-resource contract on *both* sides of the boundary the read must cross, which is exactly where a first-party consumer/provider drift or a non-activated provider row surfaces as "no provider → status `'none'` → 「文件资源服务不可用。」". Combined with the profile's 0.1.2/0.1.3 provenance and #5999 round 1's restart-surviving failure, **composition/provider activation (H1–H3) — not the rename — remains the leading attribution**.
- **A third thing to keep separate:** the pack's own measurement inconsistency (60 vs 62 entries; probe `rev …-0` vs row `rev …-3/…-N`). That is a defect in *our forensics*, not in the product; fix it before filing.

---

## 4. Question 4 — Mitigation decision

### 4.1 Should the plugin work around the unavailable service? **No.**

| Workaround | Verdict | Why |
|---|---|---|
| **Rewrite** (plugin rewrites the address or renders the content itself) | No | The preview tab and the file resource provider are **first-party host-bundle packages** the plugin does not own; a plugin cannot legitimately patch another entry's slot/service. Rewriting addresses would launder an address-shape contract violation into "working" behavior while the host keeps emitting unauthorized `absolute` addresses. Address correction belongs at the **producer** (call alpha.2's `fileAddressFor()`) — that is a correctness fix, not a workaround |
| **Retry** | No | Policy: SKILL.md safety boundaries forbid retrying unknown `gateway/internal`-class failures by default (retry only when the error is retryable, the operation is idempotent, and policy allows). Mechanically: status `'none'` means **nothing was dispatched**, so there is no failed request to repeat — a timer-driven retry against an unresolved provider is a retry storm that adds noise and destroys attribution |
| **Fallback** (read the bytes via another transport — own RPC, `/api/file`, raw fetch — and render them) | No | Forks the resource-address semantics; **bypasses the alpha.2 authorization and cap model** (scope authorization, `maxFileBytes`, `too-large` refusal instead of truncation, and A2-02's unconfined-read posture) — i.e. it silently *widens* file exposure while appearing to fix a UI bug; creates a second preview implementation to maintain against A2-21's registry; and removes the upstream signal (an empty tab that quietly works is a defect that never gets fixed). It also violates the mirror of the skill's rule that DSH core must not be modified to conceal plugin incompatibility: **plugins must not be modified to conceal a host defect** |

**Also do not**: edit the installed tree / `node_modules` (wiped by the next install; conceals the defect), re-add a `ui-sidebar-textpreview` dependency (resolves nowhere — **A2-09**), or hand-`insert` `workspace-files` / `ui-sidebar-*` rows into the profile patch — the web-app bundle already provides them and a duplicate insert is **fatal** at boot (`duplicate loader entry id`, troubleshooting row 18). Per that row: when such a plugin is genuinely unavailable, the root cause is a **compose/artifact gap, not a missing insert**.

### 4.2 The order the maintainer should act in

**Step 0 — read-only triage (done here).** Attribute from evidence before touching anything.

**Step 1 — the first cheap step: a *real* host stop → restart → hard refresh → verify markers.** Cost: minutes, zero writes.
- Stop **every** dsh process (a running host holds native-module file locks → EBUSY; **a browser refresh is not a host stop**).
- Restart `dsh web`, hard-refresh the browser, then verify the version marker **and** that the process is not a ghost (pre-flight §1.5): compare the host process start time against the installed tree's version/mtime; classify by a behavioral probe, not a version string.
- Never run the global upgrade from inside a dsh session (the session *is* the host process; npm replaces the tree it executes from). If an install was already interrupted, repair from an **external** shell by re-running the **pinned** formal install — never hand-copy package directories or hand-write shims.
- **Expected outcome, honestly stated:** per #5999 round 1 a restart healed the roster/combo mismatch but the content read **still failed**. So the likely result here is "Dialog B persists" — and that negative result *is* the payload: it moves attribution from transient boot-snapshot staleness (H4) to persistent composition/contract drift (H1–H3).

**Step 2 — attribution probes, still read-only.** Re-capture the boot manifest and per-row probes **in the same boot, at each row's own rev**, reconciling the entry count; HAR the failing tab open (expect **zero** workspace-files requests while status stays `'none'` — that single observation confirms L4 and kills L5–L7); `dsh --profile <name> --dump-config` for the resolved composition (are `workspace-files` / `client-resources` / `ui-sidebar-documentpreview` present, enabled, non-duplicated; any pre-0.1.5 residue); host stdout for `N entries did not activate` / pending required services. On POSIX in a throwaway container, `scripts/verify-runtime.mjs` gives the four-way attribution (**plugin-code / dependency-resolution / profile-config / dsh-runtime**) — note it is **not read-only** (it installs and cold-boots) and **POSIX-only**, so it was not run in this Windows read-only cell.

**Step 3 — minimal-profile isolation.** Cold-start a fresh minimal profile with the base bundle only, no external junction-linked plugins, and open one session-scoped file. Works there → **profile-config / plugin interaction** (H3); fails there too → **dsh-runtime / bundle composition** (H1) → straight to Step 5. This is the decisive fork and it still writes nothing to the installed tree.

**Step 4 — the escape hatch: pinned rollback.** `npm i -g @deepseek-ai/dsh@0.1.3-alpha.2` (verified as the escape hatch in #5999 round 1), from an **external** terminal with every dsh process stopped, exact version **pinned** — a bare package name resolves to the `latest` dist-tag and can silently change line. Record the rollback baseline first (current version, profile patch + lockfile hashes, session-log locations).
- **Two one-way doors to state before rolling back:** Session log **V3** is not downgrade-readable (**A1-01**), and alpha.2 sessions carry two **non-ignorable** events that older harnesses cannot read (**A2-05**). Any session written under 0.1.5 will be unreadable on 0.1.3-alpha.2 — export/back up first and accept that post-upgrade sessions are orphaned.
- Rollback restores the file-open path (alpha.1's `text` tab claims all scopes) at the cost of every alpha.1/alpha.2 feature. It is an escape hatch, not a fix, and it does not repair Dialog B's upstream cause.
- Plugin-side risk of rollback is low: the six plugins crossed `0.1.3-alpha.2 → 0.1.5-alpha.1` with zero code changes.

**Step 5 — upstream + legitimate interim workarounds.** File the forensics (§5.1). Meanwhile the user keeps working **without code changes**: read the file in file-trace's own panel (proven healthy), or open it in an external editor; for out-of-workspace links, have the producer emit a session-scope address. The six plugin authors should change **nothing** on the preview path.

---

## 5. Question 5 — Prevention and upstream packaging

### 5.1 Forensics a complete upstream report needs

1. **Identity, recorded separately for source and install** (SKILL.md shared prep §2): dsh from/to (`0.1.5-alpha.1 → 0.1.5-alpha.2`), install channel (npm global, in-place), Node version, OS, registry/mirror; profile provenance (created under 0.1.2/0.1.3) and its patch-file hashes; for each of the six plugins: install identity (**junction** — prove with `LinkType`/`Target`), package name, plugin version, declared vs resolved DSH peer cohort. A plugin release version is not the host corridor; do not conflate them.
2. **Procedure**: the exact command sequence, whether every dsh process was fully stopped before npm ran, whether any install was interrupted (EBUSY), and whether the restart was a process restart or a browser refresh.
3. **Boot artifacts**: the **full** `__DSH_BOOT__` roster (not an excerpt) with per-row `rev` and the entry count; the resolved bundle patch rows for this profile; `--dump-config` output (redacted); any `compatibility.json`; host stdout including `N entries did not activate` / pending-service lines.
4. **Runtime service state**: is the `api-workspace-files` provided service **resolved or pending**; does `ctx.resources` hold a `file` provider at the moment documentpreview mounts; which consumer receives `undefined`; the exact fallback string key (「文件资源服务不可用。」) with its owning package so a maintainer can locate the rendering branch; the `meta.status` transition trace (`'none'` → nothing).
5. **Network**: HAR of the failing tab open — the load-bearing observation is **whether any workspace-files request was issued at all** (expected: none). Plus per-row artifact fetches at each row's own rev with byte sizes, the boot rev, and the served `index.html` hash.
6. **Console**: the full log, with the paste-input fold warnings **split into their own ticket**; "no red errors" is itself evidence for L4 and must be stated as such.
7. **Reproduction + negative controls**: minimal deterministic steps; the minimal-profile result (Step 3) or its absence; the two-reader contrast on the same file; the absolute-vs-session scope behavior difference; the new-vs-old same-rev contrast if an artifact gap is alleged.
8. **History**: round 1 (alpha.1 — roster/combo mismatch, healed by restart, content read still failed) and round 2 (alpha.2), with the rollback verification. #5999 already carries round 2 as comment 18371079 — append there for the resource-chain defect, and open a **separate** issue for the absolute-scope claim narrowing (a behavior/contract question: is `canOpen` session-only intentional, and if so why does any host producer still emit `absolute` addresses?), plus a **third** for paste-input folding.
9. **Hygiene red lines**: no tokens, no `.npmrc` contents, no credentials, no session logs pasted (report only *whether* something is configured, plus non-sensitive versions/sources). Redact the session id and workspace paths in the HAR.
10. **Pending, not guessed**: per SKILL.md, anything that cannot be determined from primary sources or reproducible behavior is marked "pending review" — here: the producer of the `absolute` address (§1.4), the 60-vs-62 entry discrepancy, and the H1/H2/H3 fork until Steps 2–3 run.

### 5.2 What the host could check at boot so this class fails loud

| # | Boot check | Which silence it removes |
|---|---|---|
| 1 | **Roster↔artifact reconciliation**: for every `__DSH_BOOT__` entry, verify the served combo actually contains that module **at that rev**; log/fail loudly on mismatch, and stamp the boot rev | The A1-20 class (roster lists it, combo 404s) — today it surfaces as an innocent-looking `loaded without registering <first-entry>` |
| 2 | **Registration proof, not status code**: assert every roster entry registers its module id, and name **all** non-registering entries rather than the first awaited one | Mis-attribution to an innocent plugin |
| 3 | **Required/provided service audit**: at boot, assert that services declared by mounted rows resolve; print unresolved services with their consumer **and** provider rows | `meta.status 'none'` with a clean console — the exact failure in this task |
| 4 | **Address-scope coverage contract**: verify every file-address scope the host's own producers can emit has at least one claiming tab type; on a no-claim error, print the registered kinds **and the scopes each accepts**, not just the address | Dialog A's opaque `no registered tab type claims "…"` — the message names the address but not the coverage gap |
| 5 | **Loud consumer fallback**: the "service unavailable" branch must emit a console diagnostic (expected provider/service id, resolution state, address) and offer a retry/reload affordance; the metadata state machine must distinguish `'none'` (never dispatched) from `'error'` (dispatched, failed) and expose both to diagnostics | An empty tab with no error, no retry, and no way to tell "not attempted" from "attempted and refused" |
| 6 | **Resource-chain self-test**: one boot-time (or on-demand) probe that reads a known session file end-to-end and reports per-layer status — route → provider registration → Remote resolve → scope lookup → fs read | Replaces six hand-built HTTP probes with a single attributable answer, and makes invalid probes (like the 62-way join) unnecessary |
| 7 | **Process/artifact generation guard**: detect that the running process predates the on-disk tree (ghost host) and warn; likewise detect a profile whose composition predates the host (a 0.1.2/0.1.3 profile on a 0.1.5 host) and warn about stale rows instead of silently composing a half-migrated bundle. Never *require* manual inserts of bundle-provided ids (duplicates are fatal); peer-range enforcement at install/startup — later carded at 0.1.7-rc.1 — is the direction this should keep going | H2 and H3, both of which are invisible today until a UI tab comes up empty |

---

## 6. Report structure per SKILL.md

- **Pre-existing**: not collected (Mode A read-only inspection; no baseline build/test run was authorized or executed).
- **Completed**: full evidence-pack read (7 files); corridor cards consulted for `0.1.5-alpha.1 → 0.1.5-alpha.2` (A1-16, A1-17, A1-20, A2-01, A2-02, A2-05, A2-09, A2-13, A2-14, A2-19, A2-21, A2-24) plus troubleshooting rows 8/13/16/18/19, hygiene §3, pre-flight §1.5, SKILL.md validation layers 4–5; layer attribution with a ruled-in/ruled-out contrast; probe validity adjudication; distractor separation; ranked hypotheses with discriminators; ordered mitigation ladder; upstream forensics + boot-check list; fixture sha256 re-verification.
- **Skipped (with evidence)**: `verify-runtime.mjs` and `ghost-host-check.mjs` — POSIX-only and (for verify-runtime) not read-only, so out of scope for this Windows read-only cell; `plan-migration.mjs` / `inject-lint.mjs` — no plugin source is in scope and no migration is being implemented; any install, host restart, HAR capture, or `--dump-config` run — recommended to the maintainer in §4.2, not executed here.
- **Pending / residual risk**: the H1/H2/H3 fork is unresolved without Steps 2–3; the producer of the `absolute`-scope address is unidentified; the 60-vs-62 entry discrepancy and the probe `rev` mismatch mean the current per-row sweep is directionally valid but not yet citable; the paste-input fold regression is uninvestigated (own ticket).
- **Rollback**: baseline recorded as "0.1.5-alpha.2 running, profile untouched, fixture untouched"; escape hatch = pinned `@deepseek-ai/dsh@0.1.3-alpha.2` from an external terminal, with the V3 session-format and non-ignorable-event one-way doors stated (§4.2 Step 4).
- **Recommendations**: keep three tickets separate (resource-chain stall / absolute-scope claim narrowing / paste-input fold); adopt the per-row + registration-proof probe grammar as the standard for this fleet; ask upstream for boot checks 3, 4, 5 and 6 above, which together would have turned this silent empty tab into a one-line attribution.

---

## 7. Evidence index (points only, no full quotes)

| Source | Used for |
|---|---|
| `fixture/symptom-log.txt` L9–14, L16–26, L28–32 | Dialog A text; Dialog B (titled tab, 「文件资源服务不可用。」, file-trace reads fine); clean F12; 62/62 |
| `fixture/boot-manifest-excerpt.txt` L2, L4–6, L9–18, L20–23 | 60 entries; workspace-files row with `inject: [api-gateway, client-resources]` and `rev …-3`; sidebar-right row `rev …-N`; textpreview 0 mentions; documentpreview replaces it in the bundle patch; alpha.2 `canOpen` = `scope === 'session'` only |
| `fixture/combo-probe.txt` L4–16 | Probes 1/2/3, the 4–5 KB joined URL, the zero-length 404, `rev …-0` |
| `fixture/contrast-probe.txt` L3–10, L12–18 | Two readers, two transports; `meta.status` stays `'none'`; workspace-files host row present in the bundle patch; typert scope lookup; reads outside the workspace allowed |
| `fixture/console-excerpt.txt` L10–21 | paste-input fold warnings only; repeats per historical paste message; no documentpreview output |
| `fixture/discussion-excerpt.txt` L7–17, L19–22 | #5999 round 1 (roster/combo mismatch, restart self-heal, content read still failed, rollback verified); round 2 = comment 18371079 |
| Cards | **A1-16** alpha.1 `text` tab (patterns `dsh-resource://file/**`, `canOpen = parseFileAddress !== undefined`), `ctx.resources`/`useResource`, `sidebarRightTabs`; **A1-17** `openFile` → `sidebarRight.openResource`; **A1-20** combo omits newly-added modules + the valid new-vs-old same-rev probe + restart/rollback recipe; **A2-01** scope lookup, provider factory/inject, `absolute` unauthorized, `reload`/`restat` gone; **A2-02** unconfined reads + `maxFileBytes`/`too-large`; **A2-05** non-ignorable events (rollback caveat); **A2-09** textpreview→documentpreview rename; **A2-13** rightbar/layout rewrite; **A2-14** `client-resources` drops `reload`; **A2-19** turn tail → deliverables; **A2-21** `ctx.documentPreviews` + `sidebar.right.tab.document`; **A2-24** lazy seeding + live-title seat; **A1-01** V3 not downgrade-readable (rollback caveat) |
| Skill prose | SKILL.md host-upgrade discipline (external terminal, pinned version, "a browser refresh is not a host stop"), safety boundaries (no default retry; never conceal), validation layer 4 ("prove registration/mount rather than accepting a bare HTTP 200"), report structure; troubleshooting rows 8/13/16/18/19; hygiene §3 (client refresh vs host restart); pre-flight §1.5 (ghost host) |

---

## 8. Boundary compliance

- `/app/fixture/` read-only: **unchanged**, 7/7 sha256 identical to `fixture-hash-before.json`.
- Writes: this report only, under `/app/agent-output/S21-resource-service-unavailable-trap/`. No temp files elsewhere.
- No installs, no migrations, no host restart, no git, no external network access, no modification of the skill / evaluator / reference answers.

## 9. Fixture integrity record (sha256, verified after all reading)

| File | Bytes | sha256 (re-computed after every read/write in this cell) | Baseline |
|---|---:|---|---|
| README.md | 1158 | `102ac5ac2d97981c033f06e7eb677dc56535e357e7fe35d3216b4dad0ca8edd2` | ✔ match |
| boot-manifest-excerpt.txt | 1393 | `1d905c0be86e06f9c9b124fc9abd95abc52f736b05c0a25deb9a78716f9342ca` | ✔ match |
| combo-probe.txt | 586 | `0cba6cc87fa0bab1610c158edf040ad3d14cfe8a2a36a6b9900f310862d2a3e4` | ✔ match |
| console-excerpt.txt | 1220 | `7c10810c2ae5fced353ff46847da891542ed0f13db6b64bc57cb5057669d3134` | ✔ match |
| contrast-probe.txt | 1152 | `6e227d8ea910e0d0e9a5cb4f63b007a08f4c6562fbc9604c76aaac04e2fb6a06` | ✔ match |
| discussion-excerpt.txt | 1339 | `a0dda3ec69df4bb1d709e5603a4950d9487c259ef29e5e26c16d1fdbdb1a01e4` | ✔ match |
| symptom-log.txt | 1364 | `7bec44892079515d451bb695ef95d5366d8b19759e415275587d55ac1ef650c0` | ✔ match |

All seven digests equal `fixture-hash-before.json` byte-for-byte: the evidence pack was read only and is unmodified.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.