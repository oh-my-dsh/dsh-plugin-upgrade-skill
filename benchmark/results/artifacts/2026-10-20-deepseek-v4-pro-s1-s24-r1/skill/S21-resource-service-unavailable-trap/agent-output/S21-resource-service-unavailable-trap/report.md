# S21 · The Resource Service That "Unavailable" — Diagnosis Report

Scope: dsh 0.1.5-alpha.1 → 0.1.5-alpha.2 in-place npm-global upgrade on Windows; profile
created under 0.1.2/0.1.3; six external client plugins junction-linked. Mode A (read-only
inspect); no source was modified and no migration/install was executed.

## 1. Attribution — which layer fails, and where the read stalls

The evidence splits the read into two independent readers of the **same file**, and that
split is the whole diagnosis.

| Reader | Transport | Result |
|---|---|---|
| file-trace plugin, own RPC (route prefix /dsh-file-trace/…) | its own host HTTP face | READS FINE (原文/阅读 both show content) |
| documentpreview sidebar tab | api-workspace-files Remote (remote.workspaceFiles) | FAILS — meta.status stays 'none', tab shows 「文件资源服务不可用。」 |

- **The disk/filesystem layer is ruled out.** file-trace's own RPC reads the same
  .dsh/tmp/sidebar-open-test-2.md bytes through the host process, so the file exists,
  the host can read it, and the session workspace root resolves far enough for file-trace
  to find it. The "file itself is unreadable / not found / outside workspace" hypotheses
  are all dead — and the "outside workspace" one doubly so: reads are no longer confined
  to the workspace root at alpha.2 (DSH-0.1.5-A2-02), and .dsh/tmp sits *under* the root
  anyway.
- **The failing layer is the host resource-provider chain** — specifically the
  workspaceFiles Remote and its scope resolution, not the byte read. The documentpreview
  tab reads through useResource<'file'> → createFileResourceProvider(remote, changes),
  which stats the address via remote.workspaceFiles before it ever requests content.
- **Where the read stalls:** meta.status staying 'none' (never 'error', never a resolved
  stat) means the tab's first Remote call — the **metadata / stat resolution** — never
  comes back with a value. That is exactly the boundary where the alpha.2 workspaceFiles
  service resolves the session → workspace root through the Typert workspaceFileScope
  lookup (sessions.get(sessionId)?.header.cwd, falling back to
  sandboxPolicy.workspaceRoot; DSH-0.1.5-A2-01). The stall is at **scope resolution, in
  front of the filesystem read** — not at byte-serving. The documented failure mode for a
  lookup that cannot resolve is gateway/lookup-not-found (DSH-0.1.5-A2-01), and the tab's
  generic empty state is the symptom of that error being swallowed.

Title-but-no-content is consistent with this: the tab **title** is derived client-side from
the address (parseFileAddress → filename), which needs no Remote round-trip; the
**content** depends on the stat→read chain that stalls at the scope lookup.

## 2. Probe discipline — which combo probe is a measurement, and how the loader really fetches

- **Valid measurement of static artifact serving: the per-module sweep (62/62 HTTP 200).**
  Each roster entry's own url is fetched one by one and every one returns 200 with body.
  That directly proves the host is *serving* every module's client.js artifact. Zero 404s.
- **Not a valid measurement: the all-62-joined single URL (404).** It concatenates 62
  arbitrary manifest entries into one GET /plugins/??… URL ~4–5 KB long and gets a 404
  with a zero-length body. That 404 is a property of the *request shape* (an oversized /
  not-a-real-combo URL the route does not accept), **not** a property of the modules. It
  must never be cited as "modules missing", because (a) the per-module sweep already
  disproves missing artifacts, and (b) the loader never issues such a URL.
- **How the real loader fetches the roster:** it reads the boot manifest (__DSH_BOOT__)
  and consumes each entry's **own pre-built url** — e.g.
  /plugins/??@deepseek-ai/dsh-api-workspace-files/client.js&rev=234716e8f7370214-3,
  each already a single-module combo with its own rev suffix. The loader requests those
  exact per-entry URLs (or the combos the manifest already specifies); it does not
  synthesize an "all modules" URL. The joined probe measures a request the system never
  makes, so its 404 is a red herring for both the "modules missing" hypothesis and the
  actual failure.

## 3. Distractor separation — paste-input warnings, and what the roster actually changed

- **'dsh-paste-input: fold skipped (parse failed)' is unrelated.** It repeats once per
  *historical* paste-attachment message and concerns the
  '==== DSH_PASTE_INPUT_V1 ====' attachment marker / bubble-collapse parsing — a
  per-message client-side cosmetic issue, not the content-read path. The console excerpt
  itself records the paste-input chain was otherwise verified working (0809). It shares the
  failing page but not the failing subsystem; keep it filed separately.
- **What changed in the roster between versions:** ui-sidebar-textpreview was renamed to
  ui-sidebar-documentpreview (DSH-0.1.5-A2-09), and the old fallback tab type it
  registered — kind 'text', canOpen = parseFileAddress !== undefined (claims any
  dsh-resource://file/… address, including 'absolute') — was replaced by a document tab
  whose canOpen accepts **scope === 'session' only** (boot-manifest-excerpt; DSH-0.1.5-A2-01
  "an 'absolute' scope address … always returns workspace-file/unknown-workspace").
- **Does that explain the symptom? Only the first half.** The roster/rename change explains
  the **absolute-scope link** failure (no registered tab type claims
  dsh-resource://file/absolute/…) — an out-of-workspace path hand-built in the legacy
  'absolute' scope is now claimed by no tab, where alpha.1's fallback 'text' tab used to
  claim it. It does **not** explain the main symptom: the session-scoped link **does** open
  a tab, with a correct title, so the tab registry and canOpen already worked. The empty
  content is the separate workspaceFiles scope-lookup defect of §1. The rename is a
  distractor with respect to the content-read failure.

## 4. Mitigation decision — no plugin workaround; act host-side in this order

**Do not work around it in the plugin** (no rewrite/retry/fallback). The plugin's own read
path (file-trace RPC) already works, so a plugin-side rewrite would only fork a shared host
surface to mask a host regression, and a fallback would paper over a defect the host must
own. The correct owner is the host upgrade path, and the skill discipline is to attribute
before touching plugins (DSH-0.1.5-A1-20 "attribute before touching plugins").

Order of action:

1. **First cheap step — restart, then re-probe.** Fully stop the host, restart 'dsh web',
   hard-refresh the browser. This is free, non-destructive, and the alpha.1 round proved a
   host restart self-heals the roster/combo mismatch (DSH-0.1.5-A1-20). Re-run the
   two-reader contrast and one combo fetch to confirm the half-state is gone. Do not expect
   this to fix the *content* read — in the alpha.1 round the read still failed after the
   roster healed (discussion #5999) — but it must be excluded before anything else.
2. **Escape hatch — pinned rollback.** If the read still fails, roll the global package
   back from an **external** terminal with the host stopped, to the previously verified
   version: npm i -g @deepseek-ai/dsh@0.1.3-alpha.2 (the escape hatch recorded in
   discussion #5999; always pin an exact version — a bare name resolves to 'latest' and
   can silently downgrade). This restores the pre-workspaceFiles file-opening path.
3. **What goes upstream.** The scope-lookup defect + the forensics in §5 go to the host
   project (appended to discussion #5999, round 2). The fix — the resource-provider chain
   taking over on an in-place-upgraded profile — can only land host-side; there is no
   plugin change that corrects it.

## 5. Prevention / upstream — forensics, and a fail-loud boot check

**Complete upstream report needs:**

- Environment: exact host pair (0.1.5-alpha.1 → 0.1.5-alpha.2), npm-global in-place,
  Windows 11, Node version, profile created under 0.1.2/0.1.3, the six junction-linked
  plugins and their versions.
- Roster/combo state: the __DSH_BOOT__ excerpt with rev values; the 62/62 per-module
  sweep result (proves artifacts serve individually, isolating the failure to runtime, not
  packaging); the fact that the naive 62-joined URL 404s and is *not* evidence of missing
  modules.
- The two-reader contrast (file-trace own RPC 200 vs workspaceFiles Remote failure) —
  this is the key isolation: the failure is in the resource-provider chain, not the disk.
- The exact failing address + session id, and what the scope lookup actually sees:
  the resolved value of sessions.get(sessionId)?.header.cwd (present? null? stale?) and
  whether the sandboxPolicy.workspaceRoot fallback fired; the result of the Typert
  workspaceFileScope lookup.
- The **actual error code** returned by workspaceFiles.stat/read
  (gateway/lookup-not-found vs unknown-workspace vs not-found) — captured from the
  network tab or host log; meta.status = 'none' is the absence of a definitive answer, and
  the report should supply the code the tab swallowed.
- A reproduction matrix: fresh 0.1.5-alpha.2 profile (read works?) vs in-place-upgraded
  profile (read fails) — this proves the bug is **upgrade-path-specific**, not a general
  alpha.2 regression.
- Whether a host restart heals the read (alpha.1 evidence says the roster heals but the
  read does not).

**Fail-loud boot checks the host could add:**

- At boot, after composing the client roster, self-verify each advertised combo artifact is
  servable (HEAD/GET each roster url, assert 200). A roster/combo mismatch would then
  fail loudly instead of surfacing as "loaded without registering" / empty tabs — the
  A1-20 class.
- Verify the resource-provider chain actually took over: assert the workspaceFileScope
  Typert lookup is registered and can resolve a scope (a boot-time round-trip stat/read on
  a synthetic session-scoped address), and that workspaceFiles + sessions + sandboxPolicy
  are composed. If the lookup cannot resolve, fail the boot or raise a prominent "resource
  service not ready" banner rather than letting tabs render.
- On the client, the documentpreview empty state must surface the underlying Remote error
  code (lookup-not-found / unknown-workspace / not-found) instead of collapsing it into a
  generic 「文件资源服务不可用。」 with no error and no retry — that swallow is precisely
  what turned a host defect into a silent empty tab.

## References (key point + card id only)

- DSH-0.1.5-A2-01 — workspaceFiles first parameter becomes a Typert workspaceFileScope
  lookup (inject sessions/sandboxPolicy/typert); 'absolute' scope no longer authorizes a
  Host call; unresolvable lookup → gateway/lookup-not-found.
- DSH-0.1.5-A2-02 — reads are no longer confined to the workspace root; maxFileBytes cap
  + readAll/readRelated.
- DSH-0.1.5-A2-09 — ui-sidebar-textpreview renamed to ui-sidebar-documentpreview.
- DSH-0.1.5-A2-14 — client-resources drops reload (staleness via version).
- DSH-0.1.5-A2-21 — ctx.documentPreviews registry + keyed sidebar.right.tab.document;
  text reads are paged, byte reads whole-file.
- DSH-0.1.5-A1-11 — new workspaceFiles / ctx.fs.readByteRange / /api/file file surface.
- DSH-0.1.5-A1-16 — right-sidebar/resource extension points; alpha.1 'text' tab
  (canOpen = parseFileAddress !== undefined) as reference implementation.
- DSH-0.1.5-A1-17 — file links open via ctx.sidebarRight.openResource.
- DSH-0.1.5-A1-20 — in-place npm-global upgrade can serve a combo omitting new bundle
  modules; host restart self-heals; attribute before touching plugins; discussion #5999.
- troubleshooting.md — duplicate-loader / junction / EBUSY rows (S12/S14/S20 provenance),
  and the "upgrading the host itself from inside a session is structurally fatal" boundary.
