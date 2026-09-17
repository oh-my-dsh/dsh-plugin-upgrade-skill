# S21 Diagnostic Report — The Resource Service That "Unavailable" (Read-Only)

Evidence base: `E:/deepseek-harness/dsh-plugin-upgrade-skill/.../environment/fixture/` — `README.md`, `symptom-log.txt`, `boot-manifest-excerpt.txt`, `combo-probe.txt`, `contrast-probe.txt`, `console-excerpt.txt`, `discussion-excerpt.txt`. Fixture untouched.

## 1. Attribution — which layer actually fails

The failing layer is **not** static module serving and **not** the plugin's tab registration; it is the **file-resource metadata path over the `api-workspace-files` Remote** — the client-side resource service consumed by the sidebar tab.

Evidence:

- `symptom-log.txt`: the session-scoped file `sidebar-open-test-2.md` opens a right-Sidebar tab **titled correctly** ("sidebar-open-test-2.md"), so the tab type ("text"/document tab claiming `dsh-resource://file/**`) IS registered and the tab chrome works. Only the content area shows 「文件资源服务不可用。」 with no error and no retry hint.
- `contrast-probe.txt` — two readers of the **same file at the same moment**:
  - file-trace plugin via **its own host RPC** (`/dsh-file-trace/*` HTTP face): READS FINE (原文 and 阅读 modes both show content).
  - documentpreview sidebar tab via the **api-workspace-files Remote**: FAILS — `meta.status` stays `'none'`, i.e. the read **never arrives**.
  
  What this rules in: the host can read the file (file-trace proves the file exists, is readable, and is in scope); the failure is specific to the workspace-files resource service chain (Service Provider → Remote → client consumer). What it rules out: file-system permissions, workspace-scope rejection (per `contrast-probe.txt` host notes, `index.ts read()` documents "files outside it are allowed", and this file is *inside* the workspace anyway), and missing client modules (62/62 probes 200).
- The metadata status: `meta.status` stays `'none'` — the tab never receives even the metadata response, so the read **stalls before the host service answers the Remote call**: either the Remote/Gateway method never resolves to the workspace-files provider, or the client resource service never dispatches the request. Combined with `boot-manifest-excerpt.txt` showing `@deepseek-ai/dsh-api-workspace-files` declares `inject: ["@deepseek-ai/dsh-api-gateway", "@deepseek-ai/dsh-client-resources"]`, the stall is consistent with the injected resource-provider chain not being wired on this upgraded profile — matching `discussion-excerpt.txt` round 1: "the resource-provider chain did not take over."
- The absolute-scope dialog error (`no registered tab type claims "dsh-resource://file/absolute/…"`) is a separate, narrower behavior: on alpha.2 the replacement `ui-sidebar-documentpreview` registers a tab whose `canOpen` accepts only `parseFileAddress(address)?.scope === 'session'` (`boot-manifest-excerpt.txt`), so absolute-scope links have no claimant. That is a registration/scope-policy gap, not the content-read failure.

## 2. Probe discipline — which combo probe is valid

- **Valid**: `combo-probe.txt` Probe 3, the per-module sweep — all 62 manifest entries fetched one by one → 62/62 HTTP 200. The real loader fetches modules **individually**: the boot roster (`__DSH_BOOT__`) lists each entry with its own URL (`/plugins/??<one module>&rev=…-N`, see `boot-manifest-excerpt.txt`), and each is fetched separately. Probe 1 (single-module combo URL → 200, 73 616 bytes) confirms the serving route works for real request shapes.
- **Invalid**: Probe 2 — all 62 entries comma-joined into one ~4–5 KB URL → 404, zero-length body. This is **not** a measurement of static artifact serving: no real client ever issues that URL. A 4–5 KB combined module list exceeds the route/URL length the combo endpoint accepts, so the 404 reflects the oversized synthetic request, not missing artifacts. Citing it as "modules missing" would be a false diagnosis — it contradicts the 62/62 individual 200s from the same host at the same rev, and it does not explain a symptom (empty tab content) that module-loading failure would produce differently (per `discussion-excerpt.txt`, actual roster/combo mismatch in round 1 manifested as "loaded without registering" errors, which are absent here).
- How the real loader fetches the roster: it reads `__DSH_BOOT__` (fetched same-origin after restart, per `boot-manifest-excerpt.txt`) and loads each listed module URL individually — exactly the shape Probes 1 and 3 test.

## 3. Distractor separation

- The repeated `dsh-paste-input: fold skipped (parse failed)` warnings (`console-excerpt.txt`, repeating "for every historical paste-attachment message") are **unrelated** to the content-read failure. They come from a different plugin (`dsh-paste-input` client.js:1010) and concern bubble-collapsing of historical paste-attachment messages carrying the `==== DSH_PASTE_INPUT_V1 ====` marker protocol — a UI fold/parse concern, not file-resource reads. The excerpt explicitly notes there is **no other console output** on the failing page: no red errors from documentpreview or the sidebar. Treating the fold warnings as causal would misattribute a silent, separately-logged cosmetic bug.
- What else changed in the roster: `boot-manifest-excerpt.txt` shows `ui-sidebar-textpreview` is **ABSENT** in the alpha.2 tree — replaced by `ui-sidebar-documentpreview` (`packages/bundle/web-app/cordis.patch.yml` now carries the documentpreview row; the textpreview row is gone), and the new tab's `canOpen` only accepts session scope. This rename **partially** explains the symptom: it explains the absolute-scope "no registered tab type" dialog (no claimant for `file/absolute`), and it explains why an old-profile expectation of the text tab no longer holds. It does **not** explain the empty content on session-scoped files — the new tab opens and claims the address, yet `meta.status` never leaves `'none'`. That residual gap is the resource-provider chain not taking over (per `discussion-excerpt.txt` round 1 note), i.e. two distinct defects must be kept separate: (a) missing absolute-scope claimant after the textpreview→documentpreview rename, and (b) the workspace-files resource metadata read never completing.

## 4. Mitigation decision and order

The plugin (and user) should **not** work around the unavailable service with rewrites, retries, or a fallback reader: the tab's failure is a host-side resource-service wiring failure, and file-trace's working RPC is a parallel plugin capability, not a substitute for the standard `dsh-resource://` file tab — a client-side workaround would freeze a broken contract into the plugin and mask the host bug upstream.

Maintainer order:

1. **First cheap step**: restart the host once more and re-check. Round 1 of this same failure family self-healed a roster/combo mismatch with a restart (`discussion-excerpt.txt`: "A host restart self-healed the roster/combo mismatch once"). It is free and distinguishes stale-boot state from a persistent alpha.2 defect. Re-run the per-module probe and re-open the tab afterward.
2. **Escape hatch**: verified rollback — `npm i -g @deepseek-ai/dsh@0.1.3-alpha.2` restored function in round 1 (`discussion-excerpt.txt`). On a profile created under 0.1.2/0.1.3, roll back (or reinstall the profile fresh under alpha.2) to restore service while forensics go upstream.
3. **Upstream**: file/append the forensic package (below) to discussion #5999 (round 2, comment 18371079 per `discussion-excerpt.txt`) so the resource-provider takeover failure and the absolute-scope claimant gap get fixed in dsh, not worked around locally.

## 5. Prevention / upstream

A complete upstream report needs:

- Exact versions and upgrade path (0.1.5-alpha.1 → 0.1.5-alpha.2 in-place npm-global; profile created under 0.1.2/0.1.3; six junction-linked external client plugins; Windows 11) — per `README.md`/`symptom-log.txt`.
- The `__DSH_BOOT__` roster excerpt showing `@deepseek-ai/dsh-api-workspace-files` with its `inject` list, and the textpreview→documentpreview replacement with the new `canOpen` scope check (`boot-manifest-excerpt.txt`).
- The contrast probe: same file, same moment — file-trace own-RPC succeeds, sidebar `meta.status` stays `'none'` (`contrast-probe.txt`).
- Valid probe methodology: 62/62 per-module 200s at the same rev, and the explicit note that the joined-URL 404 is an invalid oversized-synthetic-request artifact (`combo-probe.txt`).
- The prior round-1 history and the verified rollback (`discussion-excerpt.txt`), plus clean console evidence (no errors; only unrelated paste-input warnings, `console-excerpt.txt`).

What the host could check at boot so this fails loud instead of an empty tab:

- **Resource-chain readiness probe**: after boot, the host should verify the workspace-files Service Provider actually registered and that its Remote/Gateway method resolves end-to-end (e.g. a self read of a known session file); a missing provider should surface as a loud boot error, not a silent client whose only signal is `meta.status === 'none'`.
- **Client fallback surface**: when the resource service is unavailable, the tab should render an explicit diagnostic (which service, which inject edge failed, restart hint) instead of the bare 「文件资源服务不可用。」 with no retry.
- **Roster/served-artifact consistency check**: at boot, assert every roster entry serves 200 at its advertised `rev` (round 1's mismatch class), and reject or warn on mismatch.
- **Tab-claimant coverage check**: warn when a `dsh-resource://file/<scope>` address class (e.g. `absolute`) has no registered claimant after the textpreview→documentpreview rename, so scope-policy regressions fail loud at load ("misconfiguration fails loud") rather than as a per-click dialog.
