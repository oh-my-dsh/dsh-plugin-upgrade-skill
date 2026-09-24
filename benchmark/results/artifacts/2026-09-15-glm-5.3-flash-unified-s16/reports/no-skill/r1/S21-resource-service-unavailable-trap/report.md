# S21 — The Resource Service That "Unavailable" — Diagnosis Report

Environment: dsh 0.1.5-alpha.1 → 0.1.5-alpha.2 in-place npm-global upgrade, Windows 11,
profile created under 0.1.2/0.1.3, six external client plugins junction-linked.
Evidence: read-only pack under `fixture/` (symptom-log, boot-manifest-excerpt,
combo-probe, contrast-probe, console-excerpt, discussion-excerpt, README).

---

## 1. Attribution — which layer actually fails

**The failing layer is the host-side resource-provider chain — the `api-workspace-files`
service that the sidebar tab's Remote is supposed to reach is not answering on the
running 0.1.5-alpha.2 host.** It is not the file, not disk/permissions, not the tab/claim
system, and not static asset serving.

What already works (proven by the symptom log): the session-scoped link opens a
right-Sidebar tab titled correctly (`sidebar-open-test-2.md`). So resource-address
parsing (`parseFileAddress`), tab-type registration/claim routing
(`ui-sidebar-documentpreview`'s `canOpen`, `scope === 'session'`), and the client-side
tab shell all function. The failure is confined to the content read.

**What the two readers of the same file rule in and rule out** (contrast-probe.txt,
same file, same moment):

- **file-trace plugin (own host RPC, `/dsh-file-trace/*` routes) — READS FINE** (原文 and
  阅读 both show content). This rules IN: the file exists and is readable on disk; host
  file I/O works; per-session workspace-root resolution (`typert lookups.register` →
  `sessions.get(sessionId)?.header.cwd`, fallback `sandboxPolicy.workspaceRoot`) works;
  permissions/encoding are fine. It rules OUT: missing file, disk or permission faults,
  and "the path is outside the workspace" as a blocker (the `read()` doc explicitly
  allows files outside the workspace root — and this file is inside it anyway).
- **documentpreview sidebar tab (api-workspace-files Remote) — FAILS.** This rules IN:
  the fault is specific to the workspace-files resource path — the link between the
  sidebar client and the workspace-files provider. It rules OUT everything the first
  reader already exonerated, and rules OUT static module serving (the boot manifest
  lists `@deepseek-ai/dsh-api-workspace-files`, and the per-module sweep is 62/62 200).

**What the metadata status says about where the read stalls:** in the failing tab
`meta.status` stays `'none'` — the read state machine never advances at all. No metadata
arrives, no content arrives, and no error status is ever set. A provider that received
the request would either return metadata or set an error status (and the F12 console is
clean for this path — no red errors from documentpreview or the sidebar). Status stuck
at `'none'` therefore localizes the stall to *before any provider response*: the Remote
call never reaches a live workspace-files provider — the resource-provider chain did not
take over on this boot. The request neither resolves nor rejects, so the tab can only
render its generic fallback string 「文件资源服务不可用。」 with no error and no retry
hint. This is the same residue documented in discussion #5999 round 1, where a restart
healed the roster/combo half but the content read still failed.

---

## 2. Probe discipline — which combo probe is valid

- **Valid: Probe 3, the per-module sweep (62/62 HTTP 200, zero 404s).** It fetches each
  manifest entry's `client.js` by its own URL at the same rev — exactly the access
  pattern the real loader uses — so it is a faithful measurement of static artifact
  serving. (Probe 1, the single-module fetch returning 200, is valid too but only
  samples one entry.)
- **Invalid: Probe 2, all 62 entries comma-joined into one ~4–5 KB URL → 404.** That URL
  is a synthetic construction no real client ever issues. The combo route (and/or the
  HTTP layer in front of it) rejects over-long / over-many joins, so the 404 with a
  zero-length body is the route refusing the malformed oversized *request* — a property
  of the probe method, not of artifact availability.
- **Why the failing one must never be cited as "modules missing":** every one of those
  62 modules returns 200 individually at the same rev. The artifacts exist and are
  served. Citing the joined 404 as "modules missing" would directly contradict the
  per-module sweep, misattribute the incident to the static file server (which the sweep
  exonerates), and steer the fix in exactly the wrong direction. A probe is only valid
  if it reproduces the real consumer's access pattern; the mega-join does not.
- **How the real loader fetches the roster:** the client fetches `__DSH_BOOT__`
  same-origin after the restart, then loads each roster row by its own `url`
  (`/plugins/??<id>/client.js&rev=…` requests, honoring the declared `inject`s). It
  never joins all entries into one URL — which is precisely why the per-module sweep,
  not the mega-join, is the probe that mirrors reality.

---

## 3. Distractor separation

- **The repeated `dsh-paste-input: fold skipped (parse failed)` warnings are NOT related
  to the content-read failure.** They come from a different plugin (paste-input), fire
  once per historical paste-attachment message, and concern only that plugin's
  bubble-collapse/fold parsing of the `==== DSH_PASTE_INPUT_V1 ====` marker protocol.
  They are warnings (▲), not errors, and they touch neither the resource system,
  workspace-files, nor the sidebar read path. They are a simultaneous but independent
  cosmetic bug and must be kept out of this incident's causal chain. (Their one useful
  contribution: they confirm the console was actually being watched — the failing tab's
  path genuinely logs nothing.)
- **What else changed in the roster:** 0.1.5-alpha.2 REPLACED
  `packages/client/ui-sidebar-textpreview` with
  `packages/client/ui-sidebar-documentpreview` (`cordis.patch.yml` now carries the
  documentpreview row; the textpreview row is gone).
- **Does that change explain the symptom? It explains only the FIRST symptom, not the
  second.** In 0.1.5-alpha.1 the `"text"` tab type claiming `dsh-resource://file/**` was
  registered by `ui-sidebar-textpreview`. The alpha.2 replacement registers a document
  tab whose `canOpen` accepts only `parseFileAddress(address)?.scope === 'session'`, so
  absolute-scope links now die with 「no registered tab type claims
  `dsh-resource://file/absolute/…`」 (the 无法打开文件 dialog). But a session-scoped link
  passes `canOpen`, the tab opens with the correct title — and the read still never
  completes because the workspace-files provider chain does not answer. These are two
  distinct defects in one failure family: (a) the rename, an expected behavior change
  that drops absolute-scope support (arguable UX regression), and (b) the provider-chain
  non-takeover, the real bug behind 「文件资源服务不可用。」, same residue as #5999
  round 1. Conflating them would mis-target the fix at the renamed package.

---

## 4. Mitigation decision

**Should the plugin work around the unavailable service (rewrite / retry / fallback)?
No.**

- **Retry** is pointless: the Remote has no live provider on this boot; retrying cannot
  make one appear, and `meta.status` staying `'none'` shows no round-trip ever happens.
- **Rewrite** (routing reads through another face, e.g. file-trace's own RPC) masks a
  host defect, forks the file-read policy per plugin, and hides exactly the failure
  class upstream needs reported.
- **Fallback** has the same objection: silently succeeding via a side channel turns a
  loud host bug into a per-plugin quirk.

The failure lives in the host's resource-provider wiring, so the fix belongs to the
host, not to any plugin. The most a plugin should do is surface a *precise* error
(service id, host version/rev) instead of the generic 「文件资源服务不可用。」 string.

**Order of action for the maintainer:**

1. **First cheap step — one full host restart, then re-verify the boot state.** After a
   complete process restart (not just a web reload), check: `__DSH_BOOT__` lists
   `@deepseek-ai/dsh-api-workspace-files` and `ui-sidebar-documentpreview`; per-module
   probes return 200; click a fresh session-scoped file link. #5999 round 1 showed a
   restart self-heals the roster/combo half of this failure family, so a stale boot must
   be ruled out before concluding the provider-chain residue persists. Cost: minutes, no
   data risk.
2. **Escape hatch — verified rollback.** If 「文件资源服务不可用。」 still reproduces
   after a verified-clean boot, roll the global install back to the last working
   published version: `npm i -g @deepseek-ai/dsh@0.1.3-alpha.2` (verified as the escape
   hatch in #5999). Do not stay blocked on the alpha.
3. **What goes upstream — the provider-chain report** (contents in §5), appended to
   discussion #5999 as round 2 (forensics comment 18371079), so the alpha.1 and alpha.2
   rounds of the same family are tracked together. The absolute-scope `canOpen` gap from
   the textpreview→documentpreview rename should be reported alongside it as a separate,
   lower-severity behavior-change issue.

---

## 5. Prevention / upstream

**Forensics a complete upstream report needs:**

- Environment: exact versions and upgrade path (profile created under 0.1.2/0.1.3 →
  in-place npm-global 0.1.5-alpha.1 → 0.1.5-alpha.2, Windows 11, six junction-linked
  external client plugins), plus restart history (which restart healed what).
- Roster evidence: the `__DSH_BOOT__` excerpt with rev (`234716e8f7370214-*`), the
  `dsh-api-workspace-files` / `ui-sidebar-documentpreview` rows, and the
  `ui-sidebar-textpreview` absence census.
- **The contrast probe** (two readers, same file, same moment: file-trace RPC OK;
  documentpreview Remote fails; `meta.status` stuck at `'none'`) — the single most
  decisive artifact; it moves the bug out of "file/disk/permissions" and into the
  provider chain.
- Serving evidence: the per-module sweep (62/62 200), with the joined-URL 404 explicitly
  labeled a method artifact so nobody reads it as "modules missing".
- Console excerpt showing the failing path is silent, with the unrelated
  `dsh-paste-input` warnings identified as distractors.
- Host-side pointers from the alpha.2 tree: `cordis.patch.yml` contains the
  workspace-files row; session workspace-root resolution via `typert lookups.register`
  (`sessions.get(sessionId)?.header.cwd`, fallback `sandboxPolicy.workspaceRoot`);
  `read()` doc "files outside it are allowed" — i.e. the service looks correctly
  configured yet still never answers, which is exactly why it needs an upstream fix.
- Minimal repro: write a file inside the session workspace, click its chat link →
  correctly-titled tab + 「文件资源服务不可用。」 with a silent console; plus the
  absolute-scope link repro for the `canOpen` gap.
- Prior art: #5999 round 1 and the round-2 append (comment 18371079).

**What the host could check at boot so this class fails loud instead of rendering an
empty tab:**

1. **Post-boot roster self-verification:** for every `__DSH_BOOT__` entry, fetch its own
   URL at the current rev; on any non-200, fail the boot loudly naming the first failing
   module. This catches the roster/combo mismatch of #5999 round 1.
2. **Resource-chain health check:** after boot, perform one round-trip through the
   `api-workspace-files` Remote against a sentinel file in a temp workspace and require
   metadata to arrive (`meta.status` leaves `'none'`). If the provider lookup resolves
   to nothing, the host should refuse to serve the web UI — or print a loud boot error
   naming the unwired service — instead of letting every file tab render an empty
   content area.
3. **Claim↔provider cross-check:** for each registered tab type's claimed resource
   scopes, verify a live backing provider exists at boot. The alpha.2 absolute-scope gap
   would then be announced at boot ("no provider backs scope 'absolute' for the
   document tab") rather than surfacing as a runtime dialog.
4. **Client-side diagnostics:** when a Remote has no provider or `meta.status` never
   advances, log a console *error* carrying the service id, host version and rev, and
   render that in the tab in place of 「文件资源服务不可用。」 — a message that is itself
   a trap, since it suggests the static service is unavailable while modules serve
   62/62.
