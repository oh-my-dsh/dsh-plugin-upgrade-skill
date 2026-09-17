# S21 Diagnostic Report — The Resource Service That "Unavailable" (dsh 0.1.5-alpha.1 → 0.1.5-alpha.2, read-only inspection, Mode A)

Evidence pack: `fixture/README.md`, `symptom-log.txt`, `boot-manifest-excerpt.txt`, `combo-probe.txt`, `contrast-probe.txt`, `console-excerpt.txt`, `discussion-excerpt.txt`. Skill corridor reference: `plugin-upgrade/references/v0.1.5-alpha.2.md` (cards DSH-0.1.5-A2-01, -02, -09, -14, -21) and the A1-20 roster/combo card in `v0.1.5-alpha.1.md`.

---

## 1. Attribution — which layer actually fails

**The failing layer is the client resource-provider / workspaceFiles Remote chain (client-side service binding), not static artifact serving and not the host file system.**

What the two readers of the same file rule in and out (`contrast-probe.txt`):

- Both readers target the exact same session-scoped address:
  `dsh-resource://file/session/session-2844c12c-…/.dsh/tmp/sidebar-open-test-2.md`.
- **file-trace plugin (own host RPC, `/dsh-file-trace/*` routes): READS FINE** — 原文 and 阅读 modes both show the content. This rules out: the host file system being unable to read the path, the path being unauthorized, host-side session/workspace-root resolution being broken, and the host process being unhealthy. It also rules out the alpha.2 read-policy change (DSH-0.1.5-A2-02: reads are no longer confined to the workspace root) as the blocker — the host-side notes in `contrast-probe.txt` state "files OUTSIDE the session workspace are allowed".
- **documentpreview sidebar tab (api-workspace-files Remote): FAILS** — the metadata fetch never completes: "meta.status stays 'none'". This rules in the *client-side* resource chain: the tab never receives a usable `ResourceSnapshot` for the `file` resource type, i.e. no provider ever accepted/resolved the `file`-type address, so the read stalls before the Remote call completes (or is never issued).

What the metadata status says about where the read stalls: `meta.status === 'none'` means the snapshot never reached a loading/error state — the stall is **before transport**, at provider acquisition. That matches the tab's static fallback copy 「文件资源服务不可用。」 rather than a file-level error code such as `workspace-file/not-found` or `unknown-workspace` (A2-01 documents those outcomes when the Remote *is* reached and answers).

Corroborating facts:

- `boot-manifest-excerpt.txt`: the roster **does** list `@deepseek-ai/dsh-api-workspace-files` with `inject: ["@deepseek-ai/dsh-api-gateway","@deepseek-ai/dsh-client-resources"]`, and `@deepseek-ai/dsh-client-ui-sidebar-right` is present. Modules are served — the failure is in runtime wiring/activation of the resource-provider chain, not module availability.
- `symptom-log.txt` steps 2 vs 3 show two failures at **different layers**: the out-of-workspace link fails at the **tab-type claim** layer ("no registered tab type claims \"dsh-resource://file/absolute/…\"" — expected after alpha.2, see §3), while the in-workspace link opens a correctly titled tab whose **content read** fails. Title renders because the tab definition/chrome come from `ui-sidebar-documentpreview`/ui-dockkit, which loaded fine; only the resource read is dead.

Most probable root cause given the alpha.2 corridor: the alpha.2 file surface rewired the provider chain — the `file` resource value became `WorkspaceFileStat`, `reload` was deleted (A2-14), the provider factory became `createFileResourceProvider(remote, changes)` with inject dropping `sessions` (A2-01), and `workspaceFiles` resolves the workspace scope through a Typert `workspaceFileScope` lookup (A2-01). On this deployment (npm-global in-place upgrade onto a 0.1.2/0.1.3-era profile with six junction-linked external plugins — the A1-20 risk shape), roster and served modules are consistent (62/62 200), so what remains inconsistent is the **activated client composition / service binding**: the `file` resource provider (or the `workspaceFiles` Remote binding / `workspaceFileScope` lookup) did not take over, leaving `useResource<'file'>` permanently at `status: 'none'`. Same family as discussion #5999 round 1, where "the resource-provider chain did not take over" survived even after a restart healed the roster/combo mismatch (`discussion-excerpt.txt`).

## 2. Probe discipline — which combo probe is valid

(`combo-probe.txt`)

- **Valid measurement of static artifact serving: Probe 3, the per-module sweep — 62/62 HTTP 200, zero 404s** (and Probe 1, the single-module fetch returning 73 616 bytes). Each URL is exactly one module at the manifest `rev`, which is how a module is legitimately addressable; 200 with a real body proves the static server has every module the boot manifest lists. This answers "are the modules missing?" — **no module is missing**.
- **Invalid: Probe 2 — all 62 entries comma-joined into one ~4–5 KB URL → 404.** That URL was never constructed by the real loader; it is an artificial request. The 404 is the server's response to an oversized/malformed combined path (or an unrecognized combo), not evidence that any module is absent. Citing Probe 2 as "modules missing" is a measurement artifact and must never be done. It even contradicts its own premise: `boot-manifest-excerpt.txt` says **"Total entries: 60"** while Probe 2 joined 62 — the probe was not built from the roster it claims to test.
- **How the real loader fetches the roster**: it does not guess or join. The client first fetches the boot manifest (`window.__DSH_BOOT__`, same-origin, `boot-manifest-excerpt.txt`), which lists each plugin as `{"id": …, "url": "/plugins/??<id>/client.js&rev=234716e8f7370214-3", "inject": [...]}`, then loads **each listed URL individually at that rev** (small combos of a few modules at most, as in Probe 1). The `??` combo route is a bundling optimization keyed to the exact rev; the manifest's per-entry URL list is the authority.

Conclusion: static serving is healthy (Probe 3); the empty tab (§1) cannot be attributed to "modules missing on the server".

## 3. Distractor separation

- **The repeated `dsh-paste-input: fold skipped (parse failed)` warnings are unrelated.** `console-excerpt.txt` shows they fire "for every historical paste-attachment message" — a rendering-time issue in the paste-input plugin's collapse of old message-bubble content (the `==== DSH_PASTE_INPUT_V1 ====` marker protocol parse), not part of the file-read path. Crucially the console shows **no red errors from documentpreview or the sidebar** (`symptom-log.txt` step 4; "(no other console output captured)"): the warnings neither cause nor correlate with the resource failure, and the resource failure itself is silent (`status: 'none'` — itself a diagnosability gap, §5). The two bugs must be tracked separately.
- **What else changed in the roster** (`boot-manifest-excerpt.txt`; cards A2-09/A2-21): the client package `ui-sidebar-textpreview` was **renamed to `ui-sidebar-documentpreview`** in 0.1.5-alpha.2 — the old name has **0 mentions** in the boot HTML; `packages/bundle/web-app/cordis.patch.yml` now carries the `ui-sidebar-documentpreview` row and the old row is gone. The new package registers a document tab whose `canOpen` accepts only `parseFileAddress(address)?.scope === 'session'`.
- **Does the roster change explain the symptom? Partly — it explains symptom A, not symptom B.**
  - Symptom A (out-of-workspace link `dsh-resource://file/absolute/…` → "no registered tab type claims"): **fully explained** by alpha.2. The old `text` tab type registered by `ui-sidebar-textpreview` claimed `dsh-resource://file/**`; its replacement claims session-scoped addresses only. A2-01 also removed the `absolute` scope as an authorized address entirely (`absolute` always yields `workspace-file/unknown-workspace`; `fileAddressFor()` routes out-of-workspace paths through the `session` scope). The old chat link is stale alpha.1 file-surface vocabulary. This failure is loud (dialog) and expected.
  - Symptom B (session-scoped tab opens, title correct, content = 「文件资源服务不可用。」): the rename explains why the tab **opens at all** (documentpreview registered and claimed a session-scope address — progress over symptom A), but not the empty read: the module is present, served (Probe 3), active enough to register its tab type and title, yet the `file` resource metadata never arrives (`meta.status` stays `'none'`, §1). Symptom B is the resource-provider-chain failure — same family as #5999 round 1 — on a profile whose activated client composition predates the alpha.2 rewiring (A2-01/A2-14 provider contract changes). The roster content change is the visible alpha.2 delta; the **unmigrated activated composition** is the failure.

## 4. Mitigation decision — no plugin workaround; ordered maintainer actions

**The plugin should NOT work around the unavailable service** (no rewrite, no retry loop, no fallback content path). Reasons: (a) file-trace already demonstrates a plugin-side read path works, so a workaround would paper over a host/service-activation fault shared by every file-preview consumer; (b) the empty-tab copy is the host component's own message — the fault is below the plugin; (c) per the skill's safety boundaries, when the migration approach cannot be determined with high confidence from primary sources, stop and mark pending review rather than patch around; (d) the A2-01 contract change means any client-side retry would keep calling a chain that never resolves.

Ordered actions for the maintainer:

1. **First cheap step — full host stop + restart, then hard-refresh the browser.** #5999 round 1 showed a restart self-healed the roster/combo half of this failure family; the activated composition/roster is rebuilt at boot. Afterwards verify that the boot manifest, the served modules (per-module probes only, §2) and the activated client roster agree, and re-test the session-scoped link. Minutes of cost, zero writes.
2. **If restart does not heal: verified escape hatch — pinned rollback from an EXTERNAL terminal** (never from inside a dsh session; the session IS the host process): `npm i -g @deepseek-ai/dsh@0.1.3-alpha.2` — "verified as the escape hatch" in `discussion-excerpt.txt`. Full stop of every dsh process first; pinned exact version, no bare `latest`.
3. **Then repair forward properly**: the profile was created under 0.1.2/0.1.3 and carries six junction-linked external client plugins; bring the profile composition and external plugins through the alpha.2 file-surface corridor deliberately (A2-01 signature/provider changes, A2-09 rename, A2-14 `reload` removal) — fresh profile init via `--from-default-profile` or explicit patch updates, not another in-place overwrite onto the stale composition.
4. **Go upstream with forensics** (§5): a host-side binding/activation fault (roster consistent, modules served, resource provider still not taking over after a clean restart) is not fixable from the plugin.

## 5. Prevention / upstream

**A complete upstream report needs this forensic bundle** (all already collected here — package it):

- Exact upgrade path and mechanism: 0.1.5-alpha.1 → 0.1.5-alpha.2, npm-global **in-place**, Windows 11, profile origin 0.1.2/0.1.3, six external junction-linked client plugins (the A1-20 risk shape).
- The two-layer symptom separation: the loud absolute-scope claim error (expected alpha.2 behavior) vs the silent session-scope empty read (the actual bug), each with its exact address string.
- The contrast probe: same file, same moment — the plugin's own RPC reads fine, documentpreview's `workspaceFiles` Remote never completes, `meta.status` stays `'none'`.
- The probe-discipline evidence: 62/62 per-module 200s (static serving healthy) plus the explicit note that the joined-URL 404 is an invalid measurement (and the 60 vs 62 roster-count discrepancy).
- The boot manifest excerpt showing `api-workspace-files` present with its inject list, `ui-sidebar-textpreview` absent, `ui-sidebar-documentpreview` present.
- The clean console (no sidebar/resource errors) with the unrelated `dsh-paste-input` warnings flagged as a distractor.
- Prior-art linkage: deepseek-harness discussion #5999 (round 1: roster/combo mismatch, restart self-heal, resource chain still dead; round 2 forensics appended as comment 18371079).

**What the host could check at boot to fail loud instead of rendering an empty tab:**

- **Provider-registration completeness check**: after client plugins register, verify that every registered tab type whose render path depends on a resource type has a live provider for that resource in `ctx.resources` — a tab claiming `dsh-resource://file/…` with no `file` resource provider should fail registration (or boot) with a named error, not render 「文件资源服务不可用。」 silently.
- **Resource-chain self-probe**: at client startup, issue one cheap `workspaceFiles` Remote round-trip (e.g. a `stat`/scope lookup) and surface failure as a red console error / banner — today the chain fails with `status: 'none'` and zero console output (`console-excerpt.txt`).
- **Roster/activation consistency gate**: assert that every module listed in `__DSH_BOOT__` both serves 200 at its rev (per module, never via a joined combo) **and** completes client-side registration; a module that loads without registering is reported by name (the #5999 round-1 lesson — the first unregistered entry was named only innocently via `client-hmr`).
- **Composition-version stamp**: carry the host's expected client composition (package set + contract versions, e.g. the A2-01 provider contract) in the boot manifest and warn loudly when an activated plugin's composition predates the host — catching the in-place-upgrade stale-composition class (A1-20) before any user-visible empty tab.
