# S21 · The Resource Service That "Unavailable" — Analysis Report

Task: S21-resource-service-unavailable-trap (read-only analysis)
Evidence: E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\tasks\S21-resource-service-unavailable-trap\environment\fixture (symptom-log.txt, boot-manifest-excerpt.txt, combo-probe.txt, contrast-probe.txt, console-excerpt.txt, discussion-excerpt.txt, README.md)

Scenario recap: dsh 0.1.5-alpha.1 → 0.1.5-alpha.2 in-place npm-global upgrade on Windows, profile created under 0.1.2/0.1.3, six external client plugins junction-linked. Two distinct symptoms: (a) a dialog `sidebarRight: no registered tab type claims "dsh-resource://file/absolute/…"` for links outside the session workspace; (b) a session-scoped link that opens a correctly titled right-sidebar tab whose body shows only 「文件资源服务不可用。」.

---

## 1. Attribution — which layer actually fails

**The failing layer is the host-side resource chain behind the `api-workspace-files` Remote, not the tab system, not the file, and not the browser client.** The evidence pins this down:

- The tab **opens and renders a correct title** ("sidebar-open-test-2.md"). Tab-type claiming, sidebar registration, and address parsing all work: `ui-sidebar-documentpreview`'s `canOpen` accepted the session-scoped `dsh-resource://file/session/…` address. The right-hand sidebar stack is healthy.
- The **contrast probe** (contrast-probe.txt) is the decisive evidence. Two readers read the *same file at the same moment*:
  - `dsh-file-trace`'s own host RPC (`/dsh-file-trace/*` routes): **reads fine** — both 原文 and 阅读 modes show content. This rules out: the file not existing, filesystem/permission problems, the session workspace root being wrong, the host process being dead, and general HTTP transport to the host.
  - The documentpreview tab via the `api-workspace-files` Remote: **fails**. The only remaining variable is that specific Remote → host-service path.
- **The metadata status tells us where the read stalls.** In the failing tab, `meta.status` stays `'none'` — it never transitions to a loading/ready state and never to an error state. That means the read does not *fail* (a failed read would surface an error status); the request is **never answered at all**. The stall is upstream of any file I/O — at the point where the client Remote call needs a registered, running host-side service to answer it. 「文件资源服务不可用。」 is the client's rendering of "the file resource service is unavailable", i.e. service-level unavailability, not a file-level read error.

Combined with host-side notes (contrast-probe.txt): the workspace-files host row IS present in `cordis.patch.yml`, and files outside the workspace are documented as allowed — so neither bundle wiring nor scope policy blocks `.dsh/tmp/…`. What remains is that the resource-provider chain "did not take over" on this boot (the same wording as discussion #5999 round 1): the host-side service the Remote depends on is not registered/activated in the running 0.1.5-alpha.2 host, so the Remote call goes unanswered.

**What the two readers rule in / rule out:**
- Ruled out by file-trace succeeding: file existence, file readability, workspace-root resolution, sandbox/permission denial, host process liveness, client↔host HTTP connectivity.
- Ruled in by the tab failing while its sibling succeeds: the `api-workspace-files` Remote ↔ host service registration/activation layer of the 0.1.5-alpha.2 in-place-upgraded host.

## 2. Probe discipline — which combo probe is valid

- **Valid measurement of static artifact serving: the per-module sweep (combo-probe.txt, Probe 3).** Fetching each of the 62 manifest entries one by one returned 62/62 HTTP 200, zero 404s. This matches how static serving actually works and proves every advertised module artifact is served at its advertised rev. Probe 1 (the manifest's own first combo URL, single module, 200 / 73,616 bytes) is likewise valid because it is a URL the host itself generated.
- **Invalid: the naive all-in-one join (Probe 2).** Joining all 62 ids into one ~4–5 KB `/plugins/??…` URL and getting a 404 with a zero-length body is **not a measurement of module availability** — it is a test of a hand-crafted URL the loader never issues. A 404 here reflects the combo route rejecting an unsupported/malformed combination query (wrong join syntax, unlisted combination, or size limits), not any module being missing from the server. It must never be cited as "modules missing" because the per-module sweep of the *same* 62 entries at the *same* rev returned 200 for every one; the two results cannot both describe artifact availability, and the one that reproduces the loader's actual access pattern (per-entry URLs) is authoritative.
- **How the real loader fetches the roster:** it does not invent joined URLs. The client reads the `__DSH_BOOT__` boot manifest (boot-manifest-excerpt.txt), which lists each plugin entry with its own ready-made `url` (`/plugins/??<id>/client.js&rev=<rev>-<n>`) and `inject` list, and fetches those per-entry URLs individually. The manifest is the source of truth for what should load; the correct consistency check is "every manifest entry's own URL answers 200", which is exactly Probe 3 — and it passes. Static serving is therefore **not** the problem in the alpha.2 round (unlike the alpha.1 round in #5999, where genuinely-listed modules 404'd at their rev before a restart self-healed the roster/combo mismatch).

## 3. Distractor separation

- **The `dsh-paste-input` fold warnings are unrelated.** They come from a different subsystem (collapsing verbose paste-attachment marker blocks in message bubbles), they fire once per *historical* paste-attachment message on page load, and they are warnings, not errors. Nothing in the resource-read path (address parsing, tab claiming, Remote call, host service) touches the ```==== DSH_PASTE_INPUT_V1 ====`` marker protocol or `.dsh/tmp/attachments/` layout. Coincidental co-occurrence on the same upgraded deployment; keep it out of the causal chain (though it is worth its own low-priority ticket).
- **What actually changed in the roster:** the 0.1.5-alpha.2 tree **replaced `ui-sidebar-textpreview` with `ui-sidebar-documentpreview`** (`cordis.patch.yml` carries the new row; the old row is gone — 0 substring mentions in the served HTML). Consequences:
  - The old `text` tab type, which claimed `dsh-resource://file/**`, is gone. The new document tab's `canOpen` accepts only `parseFileAddress(address)?.scope === 'session'`.
  - **This fully explains symptom (a)**: the outside-workspace link with an `absolute` scope is no longer claimed by any tab type → the "no registered tab type claims …" dialog. That is a deliberate scope-narrowing behavior change in alpha.2, not a malfunction.
  - **It does NOT explain symptom (b)**: the session-scoped tab opens fine under the new package; the content-read stall is in the resource-service chain (Section 1). Two separate changes, two separate symptoms — the rename/scope-narrowing is by-design, the unavailable service is the bug.

## 4. Mitigation decision — ordering

**Should the plugin work around it? No.** `dsh-file-trace` already reads the file correctly through its own RPC; adding a rewrite/retry/fallback inside the sidebar's resource path would only mask a host-side service-availability defect, duplicate the resource capability, and diverge from upstream once the real fix lands. The failure is not in any plugin's code — no rewrites, no retries, no fallbacks. Workarounds here convert a loud-ish upstream bug into a silent permanent fork.

**Order of action for the maintainer:**

1. **First cheap step — clean full restart of the host** (`dsh web` down completely, then up), then re-verify. Discussion #5999 documents a restart self-healing a roster/combo mismatch on the alpha.1 round; before anything else, rule out the same one-bad-boot class on alpha.2. While at it, cheaply confirm the host side actually owns the service: check boot output for the workspace-files/api gateway activation and re-run the contrast probe (file-trace RPC vs sidebar tab on the same session file). Cost: minutes.
2. **Escape hatch — rollback to the last known-good published version**: `npm i -g @deepseek-ai/dsh@0.1.3-alpha.2` (verified working for this failure family in #5999). Use it if the restart does not restore the resource chain and the tab content is needed for work. Note separately that the absolute-scope dialog will persist across versions near this line — that part is the intended session-only scope rule.
3. **Upstream — file the report** (append as round 2 to discussion #5999, comment 18371079 already exists as a slot) with the forensics pack from Section 5, so the registration gap in the in-place-upgrade path is fixed at the source. Keep the `dsh-paste-input` fold-skip noise as its own minor item, not part of this report's causal claim.

## 5. Prevention / upstream

**Forensics a complete upstream report needs:**

- Exact version history: from/to versions (0.1.5-alpha.1 → 0.1.5-alpha.2), the profile's creation version (0.1.2/0.1.3), OS (Windows 11), install mode (npm global, in-place), and the six junction-linked external client plugins listed by id.
- Full `__DSH_BOOT__` boot manifest dump (not just the excerpt) with rev string, plus the served HTML substring census (`ui-sidebar-textpreview` absent, `ui-sidebar-documentpreview` present, externals present).
- Per-module probe results (Probe 3: 62/62 × 200) and the manifest's own first combo URL result (Probe 1), explicitly noting that the joined-URL 404 (Probe 2) is a non-loader access pattern and not evidence.
- The contrast probe table: same file, same moment, file-trace RPC (works) vs documentpreview Remote (`meta.status` stuck at `'none'`), with the session-scoped resource address used.
- Host-side evidence of the missing link: boot terminal output, host logs showing which services/providers registered, confirmation that `cordis.patch.yml` carries the workspace-files row while the runtime Remote goes unanswered — i.e. bundle-wired-but-not-activated.
- Console excerpt showing no client-side errors (rules out client exceptions), plus note that the paste-input warnings are unrelated.
- The workspace-root resolution inputs for the session (`sessions.get(sessionId)?.header.cwd` / `sandboxPolicy.workspaceRoot`) to pre-answer the "is it a scope problem" question — it is not.

**What the host could check at boot so this fails loud:**

- **Cross-plane consistency assertion**: before serving the boot manifest, verify that every host-side service a manifest entry's `inject` list depends on (e.g. `@deepseek-ai/dsh-api-workspace-files` injecting the gateway/resources chain) has a registered, activated provider in the running host. If a bundle-wired row has no live service, emit a loud boot error (or refuse to advertise that module) instead of serving a client that can only render 「文件资源服务不可用。」.
- **Remote liveness handshake**: after the web server starts, exercise each advertised Remote's cheapest method once host-side; a non-answering Remote should fail boot loudly, mirroring the roster/combo consistency a restart fixed in round 1.
- **Client-side timeout with actionable diagnostics**: a tab whose `meta.status` never leaves `'none'` within a timeout should surface an explicit "resource service registered-but-unanswered" error with a retry affordance, instead of a bare static string — the current empty tab with zero console output is the least diagnosable presentation this class can have.
- **Roster/artifact self-check route**: a boot-time host check that every manifest entry's own URL answers 200 (the Probe 3 invariant, automated), so roster-vs-serving drift from in-place upgrades is caught at startup rather than by hand.

---

## Summary of answers

1. **Attribution**: the host-side `api-workspace-files` Remote/service chain fails to answer; the tab and title render fine. file-trace's successful read of the same file rules out file/permission/transport/host-liveness causes; `meta.status` pinned at `'none'` shows the read never even starts — service unavailability, not a read error.
2. **Probe discipline**: the per-module sweep (62/62 × 200) is the valid static-serving measurement; the all-in-one joined-URL 404 is an invalid hand-crafted access pattern and must never be cited as "modules missing". The loader fetches per-entry URLs from the `__DSH_BOOT__` manifest.
3. **Distractors**: paste-input fold warnings are unrelated (different subsystem, benign, per-history-message). The real roster change is `ui-sidebar-textpreview` → `ui-sidebar-documentpreview` with session-only `canOpen`, which explains the absolute-scope dialog (by design) but not the content-read failure.
4. **Mitigation**: no plugin-level workaround. Order: clean host restart (cheap, documented self-heal) → rollback to 0.1.3-alpha.2 (escape hatch) → upstream report to #5999 round 2.
5. **Prevention**: full forensic pack as listed; boot-time cross-plane service/Remote consistency assertions and a client-side stall timeout so this fails loud instead of an empty tab.
