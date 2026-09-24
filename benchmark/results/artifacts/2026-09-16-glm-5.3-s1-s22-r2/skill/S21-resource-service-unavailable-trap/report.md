# S21 · The Resource Service That "Unavailable" — Read-Only Diagnosis

Task mode: **Mode A · inspect** (plugin-upgrade skill). Read-only analysis of the evidence
pack under the fixture directory; no migration, installation, or fixture modification was
performed. Baseline pre-existing failures: not collected (no build/test run — read-only task).

Deployment under diagnosis: dsh npm-global in-place upgrade 0.1.5-alpha.1 → 0.1.5-alpha.2 on
Windows 11; profile created under 0.1.2/0.1.3; six external client plugins junction-linked
(dsh-file-trace, dsh-paste-input, dsh-profiles, dsh-brand-version, …). Prior art: the same
failure family on 0.1.5-alpha.1 is documented in discussion #5999; this alpha.2 round is its
"round 2" (comment 18371079).

---

## 1. Attribution — which layer actually fails

There are **two distinct symptoms**, with two different layers:

### Symptom A — outside-workspace link → "no registered tab type claims …dsh-resource://file/absolute/…"

This is **not a failure of serving or of the resource service**. It is a deliberate scope
gate introduced by the alpha.2 roster change: the 0.1.5-alpha.2 tree replaced
`packages/client/ui-sidebar-textpreview` with `packages/client/ui-sidebar-documentpreview`
(the bundle `cordis.patch.yml` now carries the documentpreview row and the old textpreview
row is gone — confirmed by the boot-manifest census: `ui-sidebar-textpreview` has 0 mentions).
The old textpreview package registered a "text" tab claiming `dsh-resource://file/**`; the
replacement document tab's `canOpen` accepts only `parseFileAddress(address)?.scope === 'session'`.
An `…/file/absolute/E:/…` address therefore has no claiming tab type, and the sidebar
correctly reports "no registered tab type claims" instead of opening anything. That is the
documented alpha.2 corridor behavior (textpreview → documentpreview rename card), not a bug
in this deployment.

### Symptom B — in-workspace link → tab opens with title, content shows 「文件资源服务不可用。」

The failing layer is the **api-workspace-files resource-read chain (the Remote/service
seam), after the tab type has been resolved and before any file metadata arrives**:

- The tab **renders a title** because the title comes from the parsed resource address
  itself (`sidebar-open-test-2.md`); no service round-trip is needed for it.
- The content requires the `api-workspace-files` Remote. The contrast probe shows
  `meta.status` stays `'none'` — the metadata request never completes. The tab's own UI
  text ("文件 resource service unavailable") states the plugin's diagnosis: it is the
  **service** that is unavailable, not the file.
- The **contrast probe rules in/out** precisely:
  - **file-trace plugin, same file, same moment, via its own HTTP RPC** → READS FINE.
    This rules out: file nonexistence, filesystem permission issues, path resolution, the
    session header cwd / workspace-root resolution for this session, and the claim in the
    host doc that files outside/inside the workspace are allowed (the file is under
    `.dsh/tmp` inside the workspace root — not the blocker).
  - **documentpreview tab via the api-workspace-files Remote** → FAILS with
    `meta.status === 'none'`. This rules in: the workspace-files Remote call never
    resolves — the read stalls at the service layer (the resource-provider chain does not
    take over), consistent with the #5999 alpha.1 round where "the resource-provider chain
    did not take over" even after the roster self-healed.

So: static artifact serving is healthy, the tab-type registry works, the file is readable —
the **Remote/service seam for workspace files is the single failing layer**, and the
metadata status ('none', never 'error') shows the read **stalls (never answered)** rather
than being answered with a failure.

## 2. Probe discipline — which combo probe is valid

- **Valid**: Probe 1 (the boot manifest's own first combo URL — the exact URL the host
  generated) and Probe 3 (per-module sweep of all 62 manifest entries, 62/62 HTTP 200).
  These measure what they claim: each roster entry's client artifact is served by the
  running host at the advertised rev.
- **Invalid**: Probe 2 (all 62 entries comma-joined into one ~4–5 KB URL → 404). The
  `/plugins/??` route serves **host-blessed combos** — the combo ids/revs the host itself
  computed for specific module groups in the boot manifest. A hand-joined URL of every
  module is not a combo the host ever advertised; its 404 says only "this fabricated URL is
  not a known combo", and **must never be cited as "modules missing"**. Citing it that way
  is exactly the trap: it contradicts the valid 62/62 sweep and would misdirect the
  investigation toward artifact serving (which is healthy).
- **How the real loader fetches the roster**: the client reads the `__DSH_BOOT__` boot
  manifest (same-origin), which lists each module's `id`, exact `url` (already carrying
  its combo/rev index), and `inject` list; the loader fetches those URLs as given (per
  entry / per host-generated combo). It never constructs an all-entries join. The correct
  serving-health measurement is therefore: every manifest URL fetched verbatim → Probe 3.

## 3. Distractor separation

- **The `dsh-paste-input: fold skipped (parse failed)` warnings are unrelated** to the
  content-read failure. They come from a different plugin (dsh-paste-input), during
  message-bubble rendering of historical paste-attachment messages (the
  `==== DSH_PASTE_INPUT_V1 ====` marker protocol / `.dsh/tmp/attachments/…` chain), and
  repeat once per historical paste message. They touch neither the sidebar tab registry nor
  the api-workspace-files Remote. The console shows no errors at all from documentpreview,
  the sidebar, or the resource system — consistent with the stall being a silently
  unanswered Remote, not a thrown client error.
- **What actually changed in the roster between the versions**: `ui-sidebar-textpreview`
  → `ui-sidebar-documentpreview` (rename + scope-gated `canOpen`), with
  `ui-sidebar-textpreview` fully absent from the alpha.2 boot manifest. This change
  explains **Symptom A only** (the outside-workspace link no longer has a claiming tab).
  It does **not** explain Symptom B: on alpha.2 the documentpreview tab does open for the
  session-scoped file and the failure is downstream of it, in the workspace-files resource
  service chain. Two simultaneous but independent defects/behaviors must be kept separate:
  scope gate (expected alpha.2 behavior) vs. stalled resource service (deployment/host bug,
  same family as #5999).

## 4. Mitigation decision — ordering

**Should the plugin work around it?** No. The unavailable piece is a host seam (the
`api-workspace-files` Remote / workspace-files service), not plugin code. A plugin-side
rewrite, retry loop, or fallback reader would (a) duplicate the host resource surface,
(b) mask the host defect from forensics, and (c) break again when the seam self-heals.
The correct plugin behavior is what documentpreview already does: surface "service
unavailable" and stop.

Order of action for the maintainer:

1. **Cheapest first: full stop + cold restart of the host, then a browser hard refresh.**
   Per #5999, a host restart once self-healed the roster/combo mismatch on this very
   profile, and an in-place npm-global upgrade can leave the served client combo stale
   relative to the new roster. Restart, hard-refresh, re-test the in-workspace link and
   re-check the boot manifest.
2. **Verify enablement resolution**: confirm the workspace-files host row is actually
   active in the resolved composition (the row is present in `cordis.patch.yml`; confirm
   the plugin activates and the Remote answers — e.g. via the skill's
   `verify-runtime.mjs` isolated-profile contract check, which attributes failure to
   plugin-code / dependency-resolution / profile-config / dsh-runtime).
3. **Escape hatch: rollback** to the last known-good published version
   (`npm install -g @deepseek-ai/dsh@<pinned known-good>` — 0.1.3-alpha.2 was verified
   working on this profile in #5999; pin the exact version, never a bare tag). Note the
   skill's global-upgrade discipline: fully stop every dsh process first (native-module
   file locks), install from an external terminal, restart, hard-refresh.
4. **Upstream**: append the forensics (below) to discussion #5999 as round 2 / a new issue,
   and only pursue a host fix there. No plugin-side workaround ships.

## 5. Prevention / upstream

**Forensics a complete upstream report needs:**

- Exact from/to versions and channel (0.1.5-alpha.1 → 0.1.5-alpha.2, npm global, in place),
  OS (Windows 11), profile provenance (created under 0.1.2/0.1.3), and the six junction-linked
  external client plugins.
- Boot manifest excerpt (`__DSH_BOOT__`) with the sidebar/workspace-files rows and the
  textpreview-absence census.
- Serving evidence: the valid per-module sweep (62/62 × 200 at rev), explicitly noting the
  all-joined URL probe is non-evidence.
- The contrast probe: file-trace RPC succeeds vs. documentpreview Remote stalls with
  `meta.status === 'none'` on the same file at the same moment.
- Console excerpt showing zero errors from the sidebar/resource system.
- Host-side state at failure: whether the workspace-files plugin activated, the
  `lookups.register` workspace-root resolution for that session
  (`sessions.get(sessionId)?.header.cwd` / `sandboxPolicy.workspaceRoot` values), and any
  host logs around the unanswered Remote call.

**What the host could check at boot so this fails loud:**

- **Roster/serving consistency gate**: at boot, fetch (or internally verify) every combo URL
  the manifest is about to advertise and fail startup — or at least log loudly — if any
  advertised entry does not serve. This turns the #5999 alpha.1 silent "loaded without
  registering" class into a boot-time error.
- **Resource-service health self-check**: after the web-app bundle composes, perform one
  end-to-end workspace-files read (a known small file in the session workspace) and assert
  the Remote answers; a non-answering required service should block or banner, not render.
- **Distinguish "never answered" from "unavailable" in the tab UI**: `meta.status === 'none'`
  after a timeout should render an explicit error with a retry affordance and a diagnostic
  hint, not a bare 「文件资源服务不可用。」 empty tab.
- **Actionable scope-gate messaging**: for addresses no tab claims, the dialog could state
  that the document tab accepts session-scoped addresses only, so users don't read a scope
  gate as a serving failure.

---

## Skill-format summary

- **Completed**: read-only evidence analysis (all six fixture files); attribution of both
  symptoms; validation of probes 1/3 and rejection of probe 2 as non-evidence; distractor
  separation; mitigation ordering; upstream forensics and boot-check proposals. No files
  outside the designated output directory were written.
- **Skipped**: any runtime reproduction, install, or migration (prohibited by the brief);
  version-corridor card application (no source migration is requested — this is Mode A).
- **Pending/residual risk**: the true host-side root cause of the stalled workspace-files
  Remote (activation state, lookup resolution values at failure time) cannot be confirmed
  from the pack alone; it needs the host-side logs listed above.
- **Rollback**: nothing to roll back (read-only). The deployment's escape hatch is the
  pinned-version reinstall described in §4.
- **Recommendations**: route the host fix upstream (#5999 round 2); consider the boot-time
  roster/serving and resource-health gates in §5; external client plugins should treat the
  `ui-sidebar-documentpreview` session-scope gate as the new contract (alpha.2 corridor).
