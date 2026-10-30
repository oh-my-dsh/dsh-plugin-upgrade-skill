# S21 · The Resource Service That "Unavailable" — diagnosis (read-only, skill arm)

**Task**: S21-resource-service-unavailable-trap · skill arm · `plugin-upgrade` (Mode A: read-only inspect)
**Target edge**: `dsh-v0.1.5-alpha.1` → `dsh-v0.1.5-alpha.2` (npm-global in-place upgrade, Windows 11, profile created under 0.1.2/0.1.3, six external client plugins junction-linked)
**Mode**: A · inspect. Nothing was installed, migrated, or written outside `agent-output/`. `fixture/` untouched.
**Verdict in one line**: the tab title proves the *tab-type* layer is healthy; the empty body is a failure in the **Web Client resource-provider chain for the `file` resource** (`client-resources` provider + `remote.workspaceFiles` Remote), *not* in the host file surface, *not* in artifact serving, and *not* caused by the paste-input warnings. Mitigation = restart → pinned rollback → upstream; no plugin-side workaround.

---

## 1. Attribution — which layer actually fails

**Conclusion**: the title renders, so the sidebar tab registry and the address-claim layer are healthy on this boot. The failure is one layer *below* the tab: the **content read**, i.e. the `file` resource provider chain in `client-resources` driving the `workspaceFiles` Remote. The host file surface is exonerated by an independent reader of the same bytes.

### What each observation pins down

| Observation | What it proves | What it rules out |
|---|---|---|
| Tab titled `sidebar-open-test-2.md` correctly (symptom-log 3) | `ui-sidebar-documentpreview` loaded, registered its tab kind, and `canOpen` **accepted** the session-scoped address | the alpha.1 `no registered tab type claims …` failure (roster/combo/registration gap) is **not** the active fault on this boot |
| Body shows only 「文件资源服务不可用。」, no error text, no retry hint (symptom-log 3) | the *content* plane never produced a value — the tab rendered its empty state | nothing about tab registration, slot layout, or locale |
| `meta.status` stays `'none'` (contrast-probe) | the resource snapshot never left its initial idle state: **no fetch was ever started or resolved** | rules out a *reported* host refusal: an authorization failure would have moved the status to an error carrying `workspace-file/unknown-workspace` (DSH-0.1.5-A2-01), and an over-cap read would report `too-large` (DSH-0.1.5-A2-02). Neither appeared. |
| F12 console: no red errors from documentpreview / sidebar / resource system (console-excerpt) | the read did not throw, time out visibly, or log — consistent with a subscription that silently never dispatches | an exception in the preview component or a network-level failure |

### The two readers of the same file

Same file, same moment, same host
(`E:\deepseek-harness\test-lhh010\.dsh\tmp\sidebar-open-test-2.md`, address `dsh-resource://file/session/session-2844c12c-…/.dsh/tmp/sidebar-open-test-2.md`):

1. **file-trace plugin, its own host RPC over its own `/dsh-file-trace/*` HTTP face → READS FINE** (原文 and 阅读 modes both show content). This **rules out**: file existence, permissions, the composed `ctx.fs` read access, the sandbox policy, the session→workspace-root resolution (`sessions.get(sessionId)?.header.cwd` → `sandboxPolicy.workspaceRoot` typert lookup), and any workspace-containment theory. The host can serve these bytes; the host-side `workspace-files` row *is* in the web-app bundle patch and the typert lookups entry exists.
2. **documentpreview sidebar tab via `api-workspace-files` Remote → the read never arrives** (`meta.status` `'none'`). This **rules in**: the client-side provider/subscription chain — no provider claimed the address, or the claimed provider never dispatched its Remote call. The read stalls *before* the host, at the client↔Remote boundary.

So the stall point is: **client resource plane, before any host call is issued** — matching the round-1 wording in discussion #5999: "the resource-provider chain did not take over." The host service is present and would have answered.

---

## 2. Probe discipline — which combo probe is valid

**Conclusion**: Probe 3 (per-module sweep, **62/62 HTTP 200**) is the valid measurement of static artifact serving. Probe 2 (all 62 entries hand-joined into one `/plugins/??…` URL, 404) is **not a measurement of anything** and must never be cited as "modules missing".

- **Probe 3 is valid** because it reproduces what the real loader does: each manifest entry has its own artifact URL, and fetching each one individually at the same rev is exactly the contract the boot roster advertises. 62/62 with zero 404s proves **every module the roster lists is present and servable in the npm tree at that rev**.
- **Probe 2 is invalid** because that URL is an artifact of the probe, not of the system: ~4–5 KB of comma-joined module ids with a single `rev` suffix is not a URL any code path constructs, and its 404 is a URL/route-matching outcome (length, encoding, or the route refusing an over-long/unrecognised combo), not a statement about any module's existence. Two independent facts already refute "modules missing" on this boot: (a) the per-module sweep is 62/62, and (b) a module that failed to load could not have registered a tab type — yet the documentpreview tab opened and rendered a correct title.
- **How the real loader fetches the roster**: the host publishes `__DSH_BOOT__` with the module roster — ids plus their rev-tagged combo URLs — and the client module loader (`ClientModuleRegistry.fetchBundle`, made public on the previous edge, DSH-0.1.5-A1-16) requests **the advertised per-entry/combo URLs for the modules it needs**. The roster is the source of truth; the loader never synthesises a mega-URL. A valid combo probe therefore fetches *the manifest's own combo URL(s)* (as Probe 1 did: 200, 73 616 bytes), not a hand-rolled join.
- **Attribution discipline** (per DSH-0.1.5-A1-20): before blaming a plugin, compare old vs. new module at the *same rev*. Here old and new both answer 200 per-module, so the gap is **not** in the host's artifact/rev set — it is downstream, in the client resource chain. The round-1 signature (roster lists modules, combo route 404s for the *new* rows only) is absent in round 2.

---

## 3. Distractor separation

**Conclusion**: the `dsh-paste-input` fold warnings are **unrelated** to the content-read failure. The roster change that *is* relevant (`ui-sidebar-textpreview` → `ui-sidebar-documentpreview`) explains the **first** dialog only, and explains it as documented, by-design narrowing — not as the cause of the empty tab.

### 3a. `dsh-paste-input: fold skipped (parse failed)`

- Scope: the attachment-message protocol (the `==== DSH_PASTE_INPUT_V1 ====` marker) and the `.dsh/tmp/attachments/<session>/<send>/` directory logic, folding **historical paste-attachment message bubbles** into file chips. It repeats once per historical paste message.
- It touches none of: `dsh-resource://` addressing, `client-resources`, `useResource`, `remote.workspaceFiles`, or the sidebar tab registry. The console excerpt shows **no** documentpreview/resource/sidebar error at all.
- Verdict: a **simultaneous, independent** cosmetic warning about old message payloads. Keep it in a separate bucket; do not let it into the attribution chain.

### 3b. What else changed in the roster between alpha.1 and alpha.2

- `@deepseek-ai/dsh-client-ui-sidebar-textpreview` (alpha.1) was **renamed** to `@deepseek-ai/dsh-client-ui-sidebar-documentpreview` (alpha.2); the npm registry corroborates it (the old name stops at alpha.1). Census: `ui-sidebar-right` present, `ui-sidebar-textpreview` ABSENT (0 mentions), `ui-sidebar-documentpreview` present, and all six external plugins present.
- Contract change on the replacement (DSH-0.1.5-A2-09, DSH-0.1.5-A2-21): alpha.1's text tab claimed `dsh-resource://file/**` with `canOpen = parseFileAddress !== undefined` — it accepted **any** parseable file address, including `absolute` scope. alpha.2's document tab's `canOpen` accepts **`parseFileAddress(address)?.scope === 'session'` only**.

### 3c. Does that change explain the symptom?

- **Yes for dialog #1** (outside-workspace absolute link → `sidebarRight: no registered tab type claims "dsh-resource://file/absolute/E:/…"`). In alpha.2 an `absolute`-scope address no longer authorizes a Host call (`fileAddressFor()` routes out-of-workspace absolute paths through the `session` scope; a literal `absolute` address returns `workspace-file/unknown-workspace` — DSH-0.1.5-A2-01). No tab type claims `absolute`, so the dialog is **expected alpha.2 behavior**, a documented narrowing, not a defect.
- **No for dialog #2** (session-scoped in-workspace file → title renders, content empty). The document tab *did* claim and open that address, and reads are no longer confined to the workspace root at alpha.2 (`locateFile` dropped `confine`; `outside-workspace` now applies to listings only — DSH-0.1.5-A2-02), which the contrast probe confirms: ".dsh/tmp being under the workspace root is not the blocker". The rename therefore explains the first dialog and is a red herring for the second.

---

## 4. Mitigation decision

**Conclusion**: **No plugin-side workaround.** Rewrite / retry / fallback inside a plugin would mask an unattributed first-party defect and install a competing provider over the same `dsh-resource://file/**` address space — it would then have to be ripped out when the host chain is fixed. The host service is present and functional (proved by the independent reader), the host row is in the bundle patch, and the six junction-linked plugins all loaded and registered. Nothing here is attributable to plugin code.

**Order of action for the maintainer** (cheapest first):

1. **First cheap step — one full host restart, done properly.** Stop *every* dsh process (a browser refresh is not a host stop; a running host holds file locks), then restart `dsh web` and hard-refresh the browser. This is the documented self-heal for the in-place-upgrade roster/combo mismatch (DSH-0.1.5-A1-20, discussion #5999 round 1: "a host restart self-healed the roster/combo mismatch once"). In this round the artifact half is already healthy (62/62), so the restart targets the *resource-provider chain taking over*. **Decisive verification datum**: re-open the same link and check `meta.status` — it must leave `'none'`. Record the yes/no; it is the single most valuable upstream data point.
2. **Escape hatch — pinned rollback from an EXTERNAL terminal.** If the restart does not heal it: stop all dsh processes, then from outside any dsh session run the exact-version install `npm i -g @deepseek-ai/dsh@0.1.5-alpha.1` (verified escape hatch in #5999; never a bare package name — `latest`/`next` resolve to older lines and can silently downgrade). Restart, hard-refresh, re-verify.
3. **Upstream — report, do not patch.** Append the forensics (section 5) to discussion #5999 (round 2 already filed as comment 18371079). Do not hand-copy package directories, hand-write shims, or modify the host to conceal the gap.
4. **Plugins**: no action. Do not add `ui-sidebar-*` rows to the profile patch by hand — the web-app bundle provides them (a duplicate `insert` is a fatal Cordis error, not a fix).

---

## 5. Prevention / upstream

**Conclusion**: the upstream report must separate *artifact serving* (healthy) from *resource-chain wiring* (broken) and must include the restart experiment. At boot the host should assert roster↔artifact consistency and provider-chain completeness, and the empty tab should name its own failure instead of rendering a generic message.

### 5a. Forensics a complete upstream report needs

- **Version & install coordinates**: exact from/to tags (`5dda764…` → `b2e3b2a…`), npm dist-tag state at the time, npm-global in-place upgrade, Windows 11, Node version, profile origin (created under 0.1.2/0.1.3).
- **Plugin inventory**: the six external client plugins by id + version, junction/link install mode (`LinkType`/`Target`), and confirmation that all six appear in the boot roster (so the report cannot be misread as a plugin failure).
- **Boot manifest roster verbatim** (`__DSH_BOOT__`): the relevant rows with their `rev`, plus the sidebar/workspace-files census (right present, textpreview absent, documentpreview present) and the web-app bundle patch rows.
- **Both probe classes, correctly labelled**: the per-module sweep (62/62 200, with the actual URLs and rev), the manifest's *own* combo URL result (Probe 1: 200), and npm-tree artifact existence checks — **never** a hand-joined mega-URL, and never a 404 on one presented as "modules missing".
- **The contrast pair**: the same file read through a working independent face (file-trace's own RPC) vs. the failing face (`api-workspace-files` Remote), with the exact address (`dsh-resource://file/session/<sessionId>/.dsh/tmp/…`), the observed metadata status (`'none'`), and the empty-state string.
- **Console separation**: no documentpreview/resource/sidebar errors; the `dsh-paste-input` fold warnings explicitly listed as unrelated.
- **The restart experiment**: full host stop + restart → did `meta.status` leave `'none'`? (the decisive host-side vs. stale-state datum), plus rollback verification if performed.

### 5b. What the host could check at boot so this fails loud

- **Roster↔artifact consistency assertion**: for every module id in `__DSH_BOOT__`, fetch its advertised artifact (or the manifest's own combo URL) at boot and **log/fail loudly** on any 404 — instead of letting the mismatch surface later as a per-module import failure or, worse, a silently empty tab. This is exactly the gap carded in DSH-0.1.5-A1-20.
- **Provider-chain completeness check**: after client modules register, verify that every `dsh-resource://` protocol the sidebar can be asked to open has at least one registered provider, and that the host services those providers depend on (`remote.workspaceFiles`, the `workspaceFileScope` typert lookup) actually resolved — warn at startup when a provider is missing or a Remote endpoint is unbound.
- **Fail-loud empty state**: the document tab should distinguish *no provider registered* / *provider pending* / *provider returned an error* and render the actual reason plus a retry affordance, instead of a generic 「文件资源服务不可用。」 with `meta.status` stuck at `'none'`. A provider that never resolves should be time-bounded and reported.
- **Optional boot self-probe**: open one known in-workspace resource through the real chain at boot and log the outcome, so a broken chain is visible in the terminal rather than only in a browser tab.

---

## Cards and references consulted (key points only, per skill rules)

- **DSH-0.1.5-A1-16** — right-sidebar/resource extension points: `ctx.resources`, `useResource`, `dsh-resource://` protocol, `ctx.sidebarRightTabs`; `ClientModuleRegistry.fetchBundle` is public.
- **DSH-0.1.5-A1-17** — chat file links route through `ctx.sidebarRight.openResource` with a file address.
- **DSH-0.1.5-A1-20** — in-place npm-global upgrade can serve a roster/combo that omits newly-added bundle modules; attribute by comparing old vs. new at the same rev; a host restart may self-heal; pinned rollback is the escape hatch; upstream thread #5999.
- **DSH-0.1.5-A2-01** — `workspaceFiles` scope lookup replaces the `Agent` parameter; `absolute` addresses no longer authorize Host calls (`workspace-file/unknown-workspace`); `fileAddressFor()` routes out-of-workspace paths through `session` scope.
- **DSH-0.1.5-A2-02** — reads are no longer confined to the workspace root; `maxFileBytes` cap and `readAll`/`readRelated`.
- **DSH-0.1.5-A2-09 / A2-21** — `ui-sidebar-textpreview` renamed to `ui-sidebar-documentpreview`; document tab `canOpen` accepts `scope === 'session'` only; `ctx.documentPreviews` registry; preview reads are text-paged or byte-complete.
- **DSH-0.1.5-A2-13 / A2-14 / A2-24** — `rightbar` root scope + `rightbar.session`, layout service/store rewrite, `client-resources` drops `reload`, lazy sidebar seeding / close rules.
- **troubleshooting.md** — related rows: `loaded without registering` attribution, `failed to import loader entry`, duplicate-loader-entry from manual `insert`, EBUSY on Windows in-place upgrades, junction/link-install semantics.
- **discussion #5999** — prior art for this failure family (round 1 on alpha.1; round 2 forensics = comment 18371079).

## Files read (fixture, read-only)

`symptom-log.txt`, `boot-manifest-excerpt.txt`, `combo-probe.txt`, `contrast-probe.txt`, `console-excerpt.txt`, `discussion-excerpt.txt`, `README.md` — all under `fixture/`.

## Report status

Complete. No writes outside `agent-output/S21-resource-service-unavailable-trap/`; no installs, migrations, or host modifications were performed. `fixture/` is byte-unchanged.
