# S21 · The Resource Service That "Unavailable" — Analysis Report

Scenario: dsh 0.1.5-alpha.1 → 0.1.5-alpha.2 in-place npm-global upgrade on Windows, profile created under 0.1.2/0.1.3, six external client plugins junction-linked. Evidence: `symptom-log.txt`, `boot-manifest-excerpt.txt`, `combo-probe.txt`, `contrast-probe.txt`, `console-excerpt.txt`, `discussion-excerpt.txt`.

## 1. Attribution — which layer actually fails

**The failing layer is the client→host resource read through the `@deepseek-ai/dsh-api-workspace-files` Remote, not static artifact serving and not tab registration.**

Evidence chain:

- The tab opens with the correct title (`sidebar-open-test-2.md`). A title render means the sidebar tab type **was claimed and instantiated**: `ui-sidebar-documentpreview` loaded, its `canOpen` accepted the session-scoped `dsh-resource://file/session/…` address, and the tab component mounted. Only the content area shows 「文件资源服务不可用。」.
- `combo-probe.txt` Probe 3: all 62 boot-manifest entries serve HTTP 200 individually. The client bundles — including documentpreview and api-workspace-files — are being delivered correctly. Static artifact serving is healthy.
- `contrast-probe.txt`: **two readers of the same file at the same moment diverge.**
  - **file-trace plugin** (its own host RPC, `/dsh-file-trace/*` routes over its own HTTP face): reads fine in both 原文 and 阅读 modes. This reader rules **out**: a broken host process, filesystem permission problems, Windows path/junction issues, sandbox denial of `.dsh/tmp`, and anything wrong with the file itself. The host can read the file.
  - **documentpreview sidebar tab** (via the `api-workspace-files` Remote): fails.
- Therefore the divergence is isolated to the **workspace-files resource-provider chain** — the Remote/RPC path between the client tab and the host-side workspace-files service — not the file, not the FS, not the tab UI.

**What `meta.status === 'none'` says about where the read stalls:** the tab never receives even *metadata* for the file. A file-level failure (not-found, denied, outside-policy) would produce an **error** status. `'none'` means no response of any kind arrived — the Remote call was issued but never resolved: the request stalls or is silently dropped before reaching a live host-side handler. That points at the service-wiring layer (the workspace-files Remote has no answering host handler on this boot — e.g., the host plugin row exists in `cordis.patch.yml` but the service was never registered/activated, or the gateway route for its methods is not connected), rather than at `read()` logic, which the excerpt shows resolves the workspace root via typert `lookups.register` (`sessions.get(sessionId)?.header.cwd` with `sandboxPolicy.workspaceRoot` fallback) and explicitly *allows* files under `.dsh/tmp` inside the workspace.

## 2. Probe discipline — which combo probe is a valid measurement

- **Valid: Probe 3 (per-module sweep).** It requests exactly the URLs the boot manifest lists, one per entry, and gets 62/62 HTTP 200. That is a faithful measurement of static artifact serving: every roster entry is servable at its rev.
- **Invalid: Probe 2 (all 62 entries comma-joined into one ~4–5 KB URL).** No component of the system ever constructs or requests such a URL. The 404 with zero-length body means the combo route does not recognize that ad-hoc joined identifier — a request-format artifact, not a serving failure. It must **never** be cited as "modules missing" because it measures nothing about module availability; Probe 3 directly contradicts that reading on the identical module set.
- **How the real loader fetches the roster:** the page reads the `__DSH_BOOT__` boot payload embedded/served same-origin, which lists each plugin entry with its **own** combo URL (e.g. `/plugins/??@deepseek-ai/dsh-api-workspace-files/client.js&rev=…-3`, with a per-entry suffix index). The loader fetches those per-entry URLs as listed — one request per entry (or the specific small combos the manifest names) — it never synthesizes one giant joined URL.

## 3. Distractor separation

**The `dsh-paste-input` fold warnings are unrelated.** They come from a different plugin, on the client rendering path, parsing historical paste-attachment marker messages (`==== DSH_PASTE_INPUT_V1 ====` protocol) to collapse them into 📎 chips. The paste-input chain "does not depend on snapshot-internal implementation details" and was verified working; the warnings repeat once per historical paste message, which is exactly what a display-time parse failure over old bubbles would do. Nothing connects that code path to the resource Remote, and their timing/pattern is independent of clicking file links. Simultaneous unrelated bugs — keep them separate.

**What actually changed in the roster:** `ui-sidebar-textpreview` → `ui-sidebar-documentpreview` (replaced package; the old text tab type that claimed `dsh-resource://file/**` is gone; the new document tab's `canOpen` accepts only `parseFileAddress(address)?.scope === 'session'`).

**Does that explain the symptom?** It explains **symptom step 2 only** — the outside-workspace link (`dsh-resource://file/absolute/E:/…`) is now unclaimed by any tab type, producing `sidebarRight: no registered tab type claims "dsh-resource://file/absolute/…"`. That is a deliberate scope narrowing, arguably intended. It does **not** explain the content-read failure: the session-scoped link *is* claimed, the tab *does* open, and the failure is downstream in the workspace-files read chain. The rename is a co-occurring change, not the cause of 「文件资源服务不可用。」.

## 4. Mitigation decision

**No, the plugin should not work around it.** No rewrite, retry, or client-side fallback:

- The tab already rendered the correct contract state (title, claimed address); the missing piece is a host-side service answer. A client-side retry can't fix a Remote with no answering handler.
- A fallback (e.g., the tab reading the file through some other route, as file-trace does) would mask a genuine upstream regression on a supported code path and break the single-owner model of the resource service.
- The failure is a version-upgrade wiring bug on the host, in scope for upstream — the right fix belongs there.

**Order of action for the maintainer:**

1. **First cheap step — restart the host process and re-verify.** In the prior round (#5999) a restart self-healed a roster/combo mismatch once, and in-place npm-global upgrades on old profiles have already shown stale state. Also re-check that the profile's junction-linked external plugins didn't shadow the new bundle. Cost: seconds.
2. **Escape hatch — rollback:** `npm i -g @deepseek-ai/dsh@0.1.3-alpha.2` (verified as the working escape hatch for this deployment in #5999). This restores service immediately while upstream investigates. Staying on 0.1.5-alpha.1 is *not* a clean escape — that version showed the same failure family.
3. **Upstream:** append forensics to discussion #5999 (round 2, comment 18371079 already references this) or file an issue with the evidence pack below, so the workspace-files Remote activation path gets fixed for the next release.

## 5. Prevention / upstream

**Forensics a complete upstream report needs:**

- Exact version pair and install mode (0.1.5-alpha.1 → 0.1.5-alpha.2, npm global, in-place), plus profile provenance (created under 0.1.2/0.1.3) and the list of junction-linked external client plugins.
- The full `__DSH_BOOT__` roster HTML and the census (which sidebar packages present/absent, confirming textpreview → documentpreview).
- Per-module probe results (the valid Probe 3), explicitly noting that the joined-URL probe is not evidence.
- The contrast probe: file-trace RPC result vs documentpreview result for the same session-scoped address, with `meta.status` observation.
- Browser console excerpt (no documentpreview errors) and the full host terminal log for the boot — crucially, whether the host logged registration of the workspace-files service at startup.
- Network trace of the actual Remote method invocations from the tab (does the request leave the browser? does the gateway route it? does anything answer?) — this pins the stall between client, gateway, and host handler.
- Session facts the service depends on: `sessions.get(sessionId)?.header.cwd` resolution and `sandboxPolicy.workspaceRoot` fallback for the affected session.

**Host checks that would make this fail loud at boot:**

- **Roster/serving consistency self-probe:** after the web server starts, fetch every roster entry's URL at its declared rev and fail the boot (or log loudly) on any non-200 — this catches the alpha.1-class mismatch before a user ever loads the page.
- **Advertised-service liveness check:** for every Remote the client bundle is told to use (like api-workspace-files), verify at boot that a host-side handler is actually registered on the gateway — not merely that the package row exists in `cordis.patch.yml`. A roster row without a live handler is exactly the silent gap here.
- **End-to-end smoke:** at boot, the host resolves a session workspace root and performs one real `read()` through the full chain (typert lookup → root resolution → read), failing loud if any step stalls.
- **Client-side:** a tab whose `meta.status` stays `'none'` past a timeout should surface an explicit error with retry affordance and a console diagnostic, not a bare 「文件资源服务不可用。」 with no status and no console output — silence in F12 is what made this hard to attribute.

## Summary

Static serving is healthy (62/62 per-module 200s; the joined-URL 404 is an invalid probe). The roster rename (textpreview → documentpreview, session-scope-only `canOpen`) explains only the outside-workspace dialog. The real failure is the workspace-files Remote read stalling with no host answer (`meta.status: 'none'`) while an independent reader of the same file succeeds — a host-side service-wiring regression after the in-place upgrade. The paste-input warnings are an unrelated bug. Act: restart first, roll back to 0.1.3-alpha.2 if needed, report upstream with the full forensics, and ask the host to self-probe roster/service liveness at boot.
