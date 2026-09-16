# S21 · The Resource Service That "Unavailable" — diagnosis report

Scenario: dsh 0.1.5-alpha.1 → 0.1.5-alpha.2 in-place npm-global upgrade on a Windows
profile created under 0.1.2/0.1.3, six external client plugins junction-linked.
Evidence: `fixture/symptom-log.txt`, `boot-manifest-excerpt.txt`, `combo-probe.txt`,
`contrast-probe.txt`, `console-excerpt.txt`, `discussion-excerpt.txt` (all read-only).
Skill references consulted: `references/v0.1.5-alpha.2.md` (cards A2-01, A2-02, A2-09,
A2-14, A2-21), `references/v0.1.5-alpha.1.md` (cards A1-11, A1-20 and the six-plugin
crossing record), `references/troubleshooting.md`.

Executive summary: the sidebar tab machinery and the static module-serving layer are
healthy. The failure is confined to one seam — the `@deepseek-ai/dsh-api-workspace-files`
Remote resource chain that the documentpreview tab depends on — where the read stalls
silently before any metadata or error reaches the client (`meta.status` stays `'none'`).
It is a host-side wiring/activation defect of the resource-provider chain on an
in-place-upgraded profile, the same failure family already recorded for 0.1.5-alpha.1 in
discussion #5999. No plugin-side workaround is appropriate; the maintainer should restart
once (cheap, self-healed the alpha.1 round), then use the pinned-version rollback escape
hatch, and send the forensics package upstream.

---

## 1. Attribution — which layer actually fails

The symptom decomposes into three layers, and only one of them is broken:

| Layer | Evidence | Verdict |
|---|---|---|
| Tab registration / client module loading | The session-scoped link **opens a tab with the correct title** ("sidebar-open-test-2.md"); `ui-sidebar-documentpreview` is in the boot roster and serves 200; no `no registered tab type claims …` for session-scope addresses | Healthy |
| Static artifact serving | 62/62 per-module probes HTTP 200 (combo-probe.txt probe 3); probe 1 (manifest's own first URL) 200 with 73,616 bytes | Healthy |
| **File resource read chain (`api-workspace-files` Remote)** | Tab content renders only 「文件资源服务不可用。」; contrast probe: the same file, same moment, read through the `api-workspace-files` Remote **never arrives**, `meta.status` stays `'none'` | **This is the failing layer** |

What the two readers of the same file rule in and rule out (contrast-probe.txt):

- **file-trace's own RPC (`/dsh-file-trace/*` routes) reads the file fine** (原文 and
  阅读 modes both show content). This rules OUT: the file being missing or unreadable on
  disk, host-process death, host HTTP being down, the client being unable to reach the
  host, and — per the host-side notes — workspace-root resolution and workspace
  containment as blockers (alpha.2 explicitly allows reads outside the workspace root,
  card DSH-0.1.5-A2-02; "files outside it are allowed" is the `read()` doc in the alpha.2
  `workspace-files` tree).
- **The documentpreview tab's read via the `api-workspace-files` Remote never arrives.**
  This rules IN: the failure lives specifically in the workspace-files resource chain —
  client `file` resource provider → gateway → the `api-workspace-files` host service —
  and nowhere else.

What the metadata status says about where the read stalls: in the failing tab
`meta.status` stays `'none'` — no metadata, and crucially **no error** ever reaches the
client. Card DSH-0.1.5-A2-01 documents that an unresolvable scope lookup should surface
`gateway/lookup-not-found`; card A1-11 documents the `workspace-file/*` error-code family.
None of that arrived — the tab had nothing to render but its fallback line. That places
the stall **upstream of error reporting**: the Remote call is never answered at all. The
service row is composed (cordis.patch.yml carries `- id: workspace-files / name:
'@deepseek-ai/dsh-api-workspace-files'`; the boot manifest lists it with
`inject: [api-gateway, client-resources]`) and its module serves, yet the runtime face
does not take the call — matching discussion #5999 round 1's finding verbatim: "the
resource-provider chain did not take over." Whether the exact host-side stall point is an
unactivated/pending service, a silently unregistered `workspaceFileScope` typert lookup,
or a gateway routing gap **cannot be separated from the client-side evidence alone** — no
host-side activation logs exist in the pack. That separation is precisely the forensics
to request upstream (§5). The 「文件资源服务不可用。」 text is the tab's rendering of "no
resource metadata arrived"; the pointer it gives is correct.

## 2. Probe discipline — valid vs. invalid combo measurement

The evidence contains two combo probes with opposite-looking results
(combo-probe.txt):

- **Probe 3 — per-module sweep, 62/62 HTTP 200: this is the valid measurement.** It
  fetches each manifest entry by its own URL at the current rev, i.e. it mirrors what the
  loader actually requests. Result: every module's static artifact is served. Whatever is
  broken, it is not "modules missing".
- **Probe 2 — all 62 entries joined into one URL → 404: this is NOT a valid measurement
  of artifact serving, and must never be cited as "modules missing".** Three reasons:
  1. **It is a synthetic request the loader never makes.** The real loader consumes the
     `__DSH_BOOT__` manifest and fetches each entry's own `url` field (module-by-module,
     each with its own `rev` parameter — see probe 1, which uses the manifest's first URL
     verbatim and succeeds). The host authors the combos; a hand-rolled 62-module join
     corresponds to nothing in the boot contract.
  2. **It measures the route's request limits, not artifact presence.** The joined URL is
     ~4–5 KB long; a 404 on an over-long combined request is the combo route's
     length/entry handling answering, and zero-length body at that. A limit rejection
     carries no information about whether any individual artifact exists.
  3. **It is contradicted by the direct measurement.** 62/62 individual 200s at the same
     rev refute "missing modules" outright. Citing the join-404 would misattribute a
     runtime resource-chain failure to the static-serving layer and send the maintainer
     hunting in the wrong place (re-installing, re-linking plugins, patching the host
     tree).

The contrast with the alpha.1 round is instructive rather than contradictory: per card
DSH-0.1.5-A1-20, that round's *individual* fetches of newly-added modules 404'd at the
same rev while old modules 200'd — there the per-module pattern genuinely pinned an
artifact/rev gap, and one host restart self-healed the roster/combo mismatch. Here the
per-module pattern is the opposite (uniform 200s), so the A1-20 diagnosis does not apply
to this round; only the "attribute before touching plugins" discipline does. (Minor
evidence note: the manifest excerpt header counts 60 entries while the probe text says
62; either way the sweep found zero 404s, so the conclusion is unaffected.)

## 3. Distractor separation — paste-input warnings and the roster rename

**The `dsh-paste-input: fold skipped (parse failed)` warnings are unrelated to the
content-read failure.** Evidence: they come from a different plugin (paste-input, a
vanilla-lib client plugin, vs. the documentpreview/workspace-files chain); they are
console *warnings*, not red errors, and console-excerpt.txt notes they repeat "for every
historical paste-attachment message" — i.e., paste-input re-parses old messages carrying
its `==== DSH_PASTE_INPUT_V1 ===` marker and skips the bubble-collapse (fold) when a
parse fails. That is a self-contained cosmetic feature of one plugin's own message
formatting. The failing read path (client `file` resource provider → gateway →
`api-workspace-files`) never touches paste-input, and the console shows zero errors from
documentpreview or the sidebar. Two simultaneous bugs with no shared code path: keep them
separate; fixing or dismissing one says nothing about the other.

**What else changed in the roster: `ui-sidebar-textpreview` →
`ui-sidebar-documentpreview`** (card DSH-0.1.5-A2-09; the boot census confirms
`ui-sidebar-textpreview` ABSENT, replaced by `ui-sidebar-documentpreview` in the alpha.2
tree). This rename explains **the first symptom but not the second**:

- It explains the absolute-scope dialog: in alpha.2 the replacement package registers a
  document tab whose `canOpen` accepts only `parseFileAddress(address)?.scope ===
  'session'`, and card DSH-0.1.5-A2-01 documents the underlying contract change —
  `absolute`-scope addresses no longer authorize a Host call at all (they resolve to
  `workspace-file/unknown-workspace`; `fileAddressFor()` routes out-of-workspace absolute
  paths through the `session` scope instead). So `sidebarRight: no registered tab type
  claims "dsh-resource://file/absolute/…"` is the **designed alpha.2 behavior**, not a
  malfunction: the old `text` tab type that claimed `dsh-resource://file/**` is gone by
  rename, and absolute addresses are refused by design.
- It does **not** explain the session-scoped content failure: the renamed package is
  present, serves, registers its tab, and renders the title correctly — the rename is
  working. The content read rides the `file` resource whose contract alpha.2 also rewrote
  (A2-01/A2-14: scope lookup replaces the Agent parameter, `reload`/`restat` removed,
  `WorkspaceFileStat` value), and that chain is the thing that never answers. So: one
  rename, two consequences — a by-design scope-authorization tightening (symptom 1) and a
  genuine runtime defect in the resource chain it sits on top of (symptom 2). Conflating
  them would produce the wrong fix ("downgrade to keep textpreview"), which would also
  forfeit the alpha.2 document-preview capability without fixing the resource chain.

## 4. Mitigation decision — no plugin workaround; restart, then pinned rollback, then upstream

**The plugin must not work around the unavailable service.** No rewrite, no retry loop,
no fallback read path:

- The failing component is not plugin code. The six external plugins crossed this edge
  with zero code changes (alpha.1 crossing record), and documentpreview is a first-party
  host package. The defect is in the host's own resource chain.
- A fallback (e.g., routing reads through a plugin's own RPC, as file-trace happens to
  have) would (a) not help the built-in documentpreview tab or any other consumer of the
  `file` resource, (b) mask the host defect from upstream telemetry and from the user,
  and (c) fork the read path away from the supported seam (`workspaceFiles` is the public
  face, cards A1-11/A2-01) — divergence the next host release will punish. The skill's
  boundary "must not modify DSH core to conceal plugin incompatibility" applies
  symmetrically: a plugin must not paper over a host service outage.
- Retries are also wrong here: the skill's retry rule requires a retryable error,
  idempotent operation, and policy — but there is **no error at all** (`meta.status`
  stays `'none'`; an unanswered Remote is not a retryable error signal).

**Order of action for the maintainer** (following the A1-20 recipe, adapted, and the
skill's global-upgrade discipline):

1. **First cheap step — one full stop and restart of the host, from an external
   terminal, then a browser hard refresh.** Rationale: the directly analogous failure on
   this very profile (A1-20 roster/combo mismatch) self-healed with exactly one restart;
   a restart re-runs boot composition and service wiring and costs nothing. Never perform
   host work from inside a dsh session. Then re-verify with the same instruments: boot
   manifest rows still list `workspace-files`/`documentpreview`, per-module probes still
   200, a session-scoped file link opens **with content**, and (F12 Network) the
   `remote.workspaceFiles` call gets an answer.
2. **Escape hatch — pinned rollback if the restart does not heal it.** From an external
   terminal with the host fully stopped: `npm i -g @deepseek-ai/dsh@<exact-last-verified-good>`
   — for this deployment `0.1.3-alpha.2` was verified as the escape hatch (discussion
   #5999). Pin the exact version; a bare package name resolves the `latest` dist-tag,
   which lags the alpha line (`latest` = 0.1.2-rc.1 while alpha builds ride the `alpha`
   tag). After rollback, verify version markers and that plugins load. This restores a
   working deployment while upstream debugs; do not hand-patch the global package tree.
3. **What goes upstream — the forensics package (§5).** This is a host-side defect in the
   workspace-files resource chain after an in-place upgrade; it belongs to upstream,
   where the forensics for both rounds were appended to discussion #5999 (round 2,
   comment 18371079). Local host patching to conceal it is out of bounds.

## 5. Prevention / upstream — forensics to package, and fail-loud boot checks

**A complete upstream report needs, at minimum** (so upstream can reproduce without the
machine):

- **Environment identity**: Windows 11; npm-global install track; exact from→to
  (`0.1.5-alpha.1 → 0.1.5-alpha.2`, tags `5dda764e…` → `b2e3b2a0…`); profile provenance —
  created under 0.1.2/0.1.3, upgraded in place, six external client plugins
  junction-linked. The in-place upgrade onto an old-cohort profile is the recurring
  constant across both failure rounds; upstream cannot triage without it.
- **The two symptoms, explicitly separated**: the absolute-scope dialog (by-design
  alpha.2 behavior per A2-01/A2-09) and the session-scope content read that stalls (the
  actual defect).
- **The contrast probe** (the load-bearing artifact): same file, same moment — plugin's
  own RPC reads fine; the sidebar tab's `api-workspace-files` Remote read never arrives;
  `meta.status` stays `'none'` (no value, no error).
- **Probe-discipline evidence**: 62/62 per-module 200s, with the joined-URL 404 recorded
  *as an artifact of a synthetic over-long request* so nobody downstream re-cites it as
  "modules missing".
- **Negative findings** (they narrow the search space): no console errors from
  documentpreview/sidebar; file exists and is readable; boot terminal output clean
  ("[dsh-profiles] ready", web URL, no errors); host row present in cordis.patch.yml and
  in the boot manifest with its inject list.
- **Source coordinates from the alpha.2 tree** for the suspected stall:
  `packages/api/workspace-files/src/index.ts` (scope lookup via typert
  `lookups.register`, `sessions.get(sessionId)?.header.cwd` fallback
  `sandboxPolicy.workspaceRoot`; `inject = ['fs','sandboxPolicy','sessions','typert']`;
  read() doc "files outside it are allowed"), the web-app `cordis.patch.yml`
  workspace-files row, and the A2-01 expectation that a failed lookup yields
  `gateway/lookup-not-found` — against the observation that **no error arrived at all**,
  localizing the stall upstream of error reporting (service activation vs. lookup
  registration vs. gateway routing — exactly what host-side logs must now decide).
- **What would reproduce**: in-place npm-global upgrade on an 0.1.2/0.1.3-era Windows
  profile with junction-linked client plugins, then open a session-scoped file link in
  the right sidebar.

**What the host could check at boot so this class fails loud** instead of rendering an
empty tab:

- **Roster ↔ served-artifact reconciliation** (the alpha.1 lesson): at boot, fetch every
  roster entry's URL at the current rev and fail loudly (boot banner + UI banner) on any
  non-200, instead of letting the browser discover it as "loaded without registering".
- **Resource-chain wiring probe**: after composition, verify the advertised resource
  services actually answer — the workspace-files service is not left pending, and a typed
  ping/`stat` through the gateway (including one resolution of the `workspaceFileScope`
  typert lookup for a live session) returns. Print it like "[dsh-profiles] ready" —
  e.g. "[dsh-workspace-files] ready" or a loud boot failure. This is the host applying to
  itself the skill's own validation rule: prove registration/mount, never accept a bare
  HTTP 200.
- **Loud client-side failure semantics**: when a resource tab's metadata never arrives
  (`status` stuck at `'none'` / timeout), render the underlying error code and a retry
  affordance, and emit a console error — today the chain turns "no answer" into a silent
  bare line (「文件资源服务不可用。」, no code, no retry, no console trace), which is what
  made this failure diagnosis-only. Silence should never be a representable state of the
  resource chain.
- **Old-profile upgrade self-check**: on boot, detect a profile created under an older
  cohort (this profile has now produced the same failure family on alpha.1 and alpha.2)
  and run the extended self-check above automatically, reporting a single actionable
  boot error instead of per-plugin mysteries.

---

### Report metadata

- Task: S21-resource-service-unavailable-trap (read-only diagnosis; fixture unmodified;
  no migrations or installations executed)
- Attribution confidence: failing seam (`api-workspace-files` Remote resource chain,
  silent pre-metadata stall) — high, from the contrast probe + boot manifest + probes;
  exact host-side stall point (service activation vs. typert lookup registration vs.
  gateway routing) — explicitly unresolved, requires host-side logs (requested upstream).
- Key cards cited: DSH-0.1.5-A2-01, A2-02, A2-09, A2-14, A2-21; DSH-0.1.5-A1-11, A1-20;
  troubleshooting rows (duplicate loader entry / #5999).
