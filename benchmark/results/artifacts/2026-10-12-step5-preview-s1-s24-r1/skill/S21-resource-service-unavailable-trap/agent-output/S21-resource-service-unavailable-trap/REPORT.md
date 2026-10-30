# S21 · Report — The Resource Service That "Unavailable"

**Scenario**: dsh `0.1.5-alpha.1 → 0.1.5-alpha.2` npm-global in-place upgrade, Windows 11, profile created under 0.1.2/0.1.3 with six junction-linked external client plugins. Post-upgrade + restart: an out-of-workspace chat file link throws a tab-claim error; an in-workspace link opens a correctly-titled right-sidebar tab whose body shows only 「文件资源服务不可用。」

**Bottom line**: the failing layer is the **client-side resource-provider chain** (`api-workspace-files` client face → `client-resources` `file` provider → gateway Remote), not the host file service, not the file, and not the tab-claim registry for session-scoped addresses. Two independent prior failures must be kept apart: (a) the absolute-scope claim error = intended alpha.2 behavior of the `ui-sidebar-textpreview → ui-sidebar-documentpreview` rename; (b) the empty-content stall = the A1-20 upgraded-profile client-bundle failure family, round 2. The `dsh-paste-input` warnings are an unrelated distractor.

---

## 1. Attribution — which layer actually fails

**The tab's claim succeeded; the content read never happened.** The session-scoped link opened a tab with the correct title ("sidebar-open-test-2.md"), which per the boot manifest can only happen if `ui-sidebar-documentpreview`'s document tab registered and its `canOpen` accepted the address (`parseFileAddress(address)?.scope === 'session'`). So the failure is strictly in what happens *after* the claim: the tab body's `useResource`/pinned read produces no data.

**What the two readers of the same file rule in / rule out** (contrast-probe.txt, same file, same moment, session-scoped address `dsh-resource://file/session/session-2844c12c-…/.dsh/tmp/sidebar-open-test-2.md`):

| Reader | Transport | Result |
|---|---|---|
| file-trace plugin | its own host RPC (`/dsh-file-trace/*`) | **reads fine** (原文/阅读 modes) |
| documentpreview tab | `api-workspace-files` Remote via `client-resources` | **never arrives** — `meta.status` stays `'none'`, tab shows 「文件资源服务不可用。」 |

- **file-trace's success rules OUT**: the file itself (content readable, path resolved), host-process filesystem read access at that path, session workspace-root resolution (`.dsh/tmp` under the workspace root — and per DSH-0.1.5-A2-02 reads outside the root are allowed anyway), and general host/data-plane health. Whatever the host exposes directly works.
- **file-trace's success also rules OUT attributing this to the host `workspaceFiles` service's existence or file policy**: the host row IS composed in the web-app bundle patch (`cordis.patch.yml` carries `workspace-files`), and the host's read path demonstrably works.
- **The tab's failed read rules IN the client-plane provider chain**: the `file` resource provider registered by the `api-workspace-files` client face (`createFileResourceProvider(remote, changes)`), its Remote call through the gateway, or the provider's registration in the browser at all. This is exactly where the alpha.1 round of the same family stopped: after the restart healed module serving, "the sidebar tab's content read STILL failed (文件资源服务不可用) — the resource-provider chain did not take over" (discussion #5999, discussion-excerpt.txt:15).
- **It rules OUT the tab-claim layer for session scope** (the tab opened, title correct) and **rules out a file-resolution error**: `not-found` / `too-large` / `unknown-workspace` would surface as an error status with a code, not silence.

**What `meta.status === 'none'` says about where the read stalls**: the resource snapshot never leaves its initial state — the pinned read was never issued to completion or its promise never settled. The stall is at/before the Remote call (provider activation or transport), *not* inside host-side file resolution: no response with a status, an error code, or content ever came back. A generic placeholder ("文件资源服务不可用。") with "no error message, no retry hint" (symptom-log.txt:23) is the rendered consequence of a provider chain that never produced a result — consistent with the A1-20 class: on an upgraded profile the client bundle can fail to effectively register, leaving `useResource` with no working provider/Remote while module-level HTML probes still look healthy. The two symptoms in the log are two different failures:

1. **Absolute-scope link** (`dsh-resource://file/absolute/E:/…/package.json`) → `sidebarRight: no registered tab type claims …`: a *claim* failure. alpha.1's `text` tab (`ui-sidebar-textpreview`) claimed `dsh-resource://file/**` with `canOpen = parseFileAddress !== undefined`; alpha.2's `ui-sidebar-documentpreview` accepts **session scope only**. Per DSH-0.1.5-A2-01, absolute-scope addresses no longer authorize host calls (`workspace-file/unknown-workspace`) and out-of-workspace absolute paths must be addressed in the `session` scope. **This is intended alpha.2 behavior, not a defect.**
2. **Session-scoped link** → tab opens, content empty: the **provider-chain read failure** analyzed above. This is the real bug.

---

## 2. Probe discipline — the two combo probes

**Valid measurement: Probe 3 (the per-module sweep, 62/62 HTTP 200)** — and Probe 1 (a single boot-manifest combo URL → 200). Both faithfully mirror what the real loader requests.

**Invalid measurement: Probe 2 (all 62 entries naively joined into one `~4–5 KB` URL → 404).** It must never be cited as "modules missing", because:

- **Nothing in the real boot ever requests that URL.** The boot manifest (`__DSH_BOOT__`) lists **one row per module**, each row a single-module combo URL of the form `/plugins/??@deepseek-ai/dsh-api-workspace-files/client.js&rev=<rev>` (boot-manifest-excerpt.txt:4–6). Probe 2's joined URL has no counterpart in the loader's actual fetch pattern, so its 404 measures a property of the *synthetic URL* (the route's handling of that join/length), not the availability of any module.
- **It would resurrect an already-disproven diagnosis.** The alpha.1 round (DSH-0.1.5-A1-20) was a genuine roster/combo gap, and its attribution recipe is precisely "old modules 200 + **newly-added** modules 404 at the same rev". The 62/62 per-module sweep *disproves* that here; the joined-URL 404 would falsely re-assert "modules missing" and misdirect the maintainer back to the (already-healed) serve/roster path instead of the provider chain.
- Probe discipline: **a probe is only evidence for the request shape it mirrors.** Attribute failures with probes that replicate the real request; flag synthetic ones as artifacts.

**How the real loader fetches the roster**: the client fetches the same-origin `__DSH_BOOT__` manifest and requests **each row's own single-module combo URL at that row's pinned `rev`** (via `ClientModuleRegistry.fetchBundle`/the client module registry), one module per request — exactly what Probes 1 and 3 do.

---

## 3. Distractor separation

**`dsh-paste-input: fold skipped (parse failed)` warnings: unrelated.** They are the paste-input plugin failing to parse its own `==== DSH_PASTE_INPUT_V1 ====` attachment-marker protocol in *historical chat messages*, repeating once per historical paste-attachment message (console-excerpt.txt:10–21). They live in the chat message-rendering plane; they touch neither the `file` resource provider, the `workspaceFiles` Remote, nor the sidebar. Decisive cross-check: the console shows **no** red errors from documentpreview or the sidebar, and the contrast probe proves the host read plane works. A render-plane parse bug in one plugin cannot cause (or explain) a resource-chain stall — keep it as a separate, pre-existing plugin defect to be reported on its own track.

**What else changed in the roster between alpha.1 and alpha.2**: the **`ui-sidebar-textpreview` → `ui-sidebar-documentpreview` package rename** (DSH-0.1.5-A2-09; the boot-manifest census: textpreview ABSENT, 0 mentions; documentpreview present). npm corroborates the rename (the old package stops at alpha.1; the new one resolves at alpha.2), so this is not a serving gap.

**Does it explain the symptom? — Partially, and only the first symptom.** The rename plus A2-01's absolute-scope change explains the **tab-claim dialog** for `dsh-resource://file/absolute/…`: the old `text` tab accepted `file/**` generally; the new document tab accepts `parseFileAddress(…)?.scope === 'session'` only. That is documented, intended alpha.2 behavior — the fix is addressing (build session-scoped addresses via `fileAddressFor`, which routes out-of-workspace absolute paths through the `session` scope), not a workaround. The rename does **not** explain the second symptom: for session-scoped addresses the document tab registers and opens fine (correct title), yet the content still never arrives — that remains the provider-chain stall of §1. Do not let the rename absorb the empty-content bug.

---

## 4. Mitigation decision

**Should the plugin work around the unavailable service (rewrite / retry / fallback)? No.** The failing layer is host infrastructure (client-face provider registration + Remote transport), proven by the contrast probe. A plugin-side retry/fallback would mask the fault, and it is barely even expressible: alpha.2 **removed** `ResourceSnapshot.reload` / provider `reload` / `restat` (DSH-0.1.5-A2-14, A2-01), so "retry the resource" is no longer a supported client surface — you would be hand-rolling Remote calls to replace the very provider that is broken. Per the skill: do not retry unknown `gateway/internal` failures by default, and never modify the host to conceal the incompatibility.

**The maintainer's order of actions:**

1. **First cheap step — one full host restart**: stop every dsh process, restart `dsh web`, hard-refresh the browser. This is the documented self-heal for the A1-20 upgraded-profile client-bundle family (alpha.1's roster/combo mismatch healed on restart) and it re-establishes client-module registration state. It is necessary and free — but note from #5999 it healed module serving while the content read **still failed** on that boot, so treat it as step 1 of diagnosis, not a fix guarantee. After restart, verify by reopening the session-scoped link and confirming `meta.status` leaves `'none'` (transitions loading → ready), i.e. the provider chain actually takes over.
2. **Re-run the attribution probes post-restart**: per-module combo probes at the pinned rev (expect 62/62 200) and the two-reader contrast probe. Old-200/new-404 at the same rev would reopen the roster/combo gap; persistent file-trace-works / sidebar-fails pins the provider chain.
3. **Escape hatch — rollback**: pinned reinstall of the previous published version from an external terminal with the host fully stopped — `npm i -g @deepseek-ai/dsh@0.1.5-alpha.1` (never a bare `latest`, which can resolve to an older line), then restart `dsh web` and confirm the content read returns. This was verified as the escape hatch in #5999.
4. **Upstream**: package the forensics (§5) and append to the existing thread (discussion #5999, round 2, comment 18371079) rather than opening a duplicate.
5. Separately, for symptom 1 (absolute-scope claim error): no mitigation — migrate addressing to session scope per A2-01/A2-09 (documented behavior).

**Explicitly do NOT**: add client retry loops or fallback reads; hand-copy package artifacts or hand-write shims; manually `insert` bundle-provided rows into the profile patch (new 0.1.5 rows like `workspace-files` / `ui-sidebar-*` are bundle-provided; a duplicate insert is a fatal boot error); or upgrade the host from inside a dsh session.

---

## 5. Prevention / upstream

**Forensics a complete upstream report needs** (modeled on #5999 round 2 / DSH-0.1.5-A1-20):

- **Identity & provenance**: exact from/to versions, install channel (npm global, pinned command used), OS/Node, profile provenance (created under 0.1.2/0.1.3), the six junction-linked external client plugins by name/version.
- **Boot evidence**: terminal output (`[dsh-profiles] ready`, no visible errors); the `__DSH_BOOT__` roster excerpt with total entry count; the sidebar package census (textpreview 0 / documentpreview present) proving the rename, not a serving gap.
- **Serving evidence**: per-module combo probes (62/62 200 at the pinned rev) **with the joined-URL 404 explicitly flagged as a probe artifact**, so no reader mistakes it for the alpha.1-style module gap.
- **The contrast probe**: file-trace's own RPC read succeeds vs the documentpreview tab read never arrives (`meta.status === 'none'`) — the single fact that isolates the provider chain from the host data plane.
- **Scope-separated symptoms**: absolute-scope claim error (intended rename behavior) vs session-scope empty content (the defect), with the exact addresses.
- **Console excerpt**: no red errors from the sidebar/resource system; the `dsh-paste-input` warnings listed as an unrelated, separately-tracked defect.
- **Lifecycle evidence**: whether a restart healed module serving and whether it healed the content read; rollback verification (pinned reinstall → symptom gone).

**What the host could check at boot so this class fails loud instead of rendering an empty tab:**

1. **Roster-vs-served consistency assertion**: at boot, verify each `__DSH_BOOT__` row's single-module combo URL actually serves at its `rev` (the alpha.1 failure was roster-200/combo-404 asymmetry). A mismatch should fail the boot loudly instead of letting client plugins "load without registering" with an innocent first-unregistered name.
2. **Provider-liveness check for `dsh-resource://file/**`**: after client modules activate, assert `ctx.resources` has a registered provider for the file resource (per session for session-scoped addresses). If absent, surface a boot/runtime diagnostic naming the missing provider rather than letting tabs render.
3. **Distinguish "no provider / stalled read" from "file error"**: `meta.status` must not park silently at `'none'` — the pinned resource should carry a timeout/error state with a code (e.g. `gateway/lookup-not-found`, `workspace-file/unknown-workspace`, transport failure), and the tab should render that code instead of a bare 「文件资源服务不可用。」 placeholder. The alpha.2 Typert `workspaceFileScope` lookup resolution (`sessions.get(id)?.header.cwd` → `sandboxPolicy.workspaceRoot`) is checkable at boot for the active session.
4. **Name the failing transport at the point of failure**: when a Remote call for the file resource never settles, log which module/face was expected to provide it — the host already composes `workspace-files` and `ui-sidebar-documentpreview` rows, so it knows what should exist and can assert the client faces registered correspondingly.

---

## Evidence index (read-only fixture)

- `symptom-log.txt` — timeline: absolute-scope claim dialog (alpha.1 dialog carried into alpha.2), session-scoped tab with correct title + empty body, F12 observation, 62/62 probe summary.
- `boot-manifest-excerpt.txt` — `__DSH_BOOT__` single-module combo URL rows; textpreview ABSENT / documentpreview rename; document tab `canOpen = scope === 'session'`.
- `combo-probe.txt` — Probe 1 (single module 200), Probe 2 (naive 62-join 404, invalid), Probe 3 (per-module 62/62 200, valid).
- `contrast-probe.txt` — two readers, same file: file-trace RPC works; documentpreview Remote never arrives (`meta.status` 'none'); host-side notes (row in bundle patch; typert lookup; out-of-root reads allowed).
- `console-excerpt.txt` — no red sidebar/resource errors; only `dsh-paste-input` fold-skip repeats (distractor).
- `discussion-excerpt.txt` — #5999 alpha.1 round: restart self-heal left the content read broken ("resource-provider chain did not take over"); rollback verified; round-2 forensics = comment 18371079.
- `README.md` — evidence pack map.

Skill references consulted (read-only): `references/v0.1.5-alpha.1.md` (DSH-0.1.5-A1-11/16/17/20), `references/v0.1.5-alpha.2.md` (DSH-0.1.5-A2-01/02/09/13/14/21/24), `references/troubleshooting.md`, `references/host-plane-probes.md`, `SKILL.md` (host-upgrade discipline, mitigation ordering, validation/reporting structure).
