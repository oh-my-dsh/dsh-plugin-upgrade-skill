# S21 — The Resource Service That "Unavailable" (Read-Only)

## 1. Attribution — which layer fails, and what the two readers rule in/out

**The failing layer is the resource-provider handoff — the `dsh-resource://file/**` address → host
`@deepseek-ai/dsh-api-workspace-files` service chain — not the filesystem, not the file, not tab
claiming, and not static serving.**

There are two distinct, sequential failures in the symptom log, and the "title but no content" case is
the second one:

1. **Tab-claim / scope failure (absolute address).** Clicking the OUTSIDE-workspace link
   (`dsh-resource://file/absolute/E:/deepseek-harness/dsh-input-history/package.json`) throws
   `sidebarRight: no registered tab type claims "dsh-resource://file/absolute/…"`. This is a *claim*
   failure: in 0.1.5-alpha.2 the old `ui-sidebar-textpreview` (which registered a `text` tab type
   claiming `dsh-resource://file/**` — all scopes) was replaced by `ui-sidebar-documentpreview`,
   whose `canOpen` accepts only `parseFileAddress(address)?.scope === 'session'`. An absolute-scope
   address is therefore no longer claimed by any tab type. (boot-manifest-excerpt.txt confirms
   `ui-sidebar-textpreview` is ABSENT and `ui-sidebar-documentpreview` is the replacement.)

2. **Content-read failure (session address — the "title but no content" case).** The assistant writes a
   file INSIDE the workspace; the address
   `dsh-resource://file/session/session-…/.dsh/tmp/sidebar-open-test-2.md` *is* claimed (the tab opens
   and is titled correctly), but the content area shows only 「文件资源服务不可用。」. This is the case the
   contrast probe isolates.

**The contrast probe (contrast-probe.txt) — two readers of the same file, same moment:**

| Reader | Transport | Result | Rules |
|---|---|---|---|
| file-trace plugin | its own host RPC (`/dsh-file-trace/*`) | READS FINE (原文/阅读 both show content) | **in**: file exists, readable, host is up, disk I/O + HTTP fine |
| documentpreview tab | `api-workspace-files` Remote | FAILS — `meta.status` stays `'none'`; tab shows 文件资源服务不可用 | **in**: the failure is specific to the workspace-files resource-provider path |

- **Rules OUT**: file missing / unreadable; filesystem/disk fault; host down; generic HTTP serving
  broken (file-trace's own route reads the same bytes fine).
- **Rules IN**: the resource-provider resolution — the client's `dsh-resource://file/session/…` read
  through the `api-workspace-files` Remote never yields a fulfilled metadata+content response.

**What `meta.status = 'none'` says about where the read stalls.** The tab already has enough to claim
the tab type and render a title (the filename derived from the address), so address parsing and tab
claiming completed. The stall is at the *metadata fetch itself*: `meta.status` never leaves its initial
`'none'` — the `read()` RPC never resolves with file metadata. In other words the read does not fail
with a *filesystem* error; it never arrives at all. That points to the resource-provider chain not
"taking over" — the session-scoped `dsh-resource://file/**` address is not being fulfilled by the
host workspace-files service. The host-side note is the smoking-gun hypothesis: the service resolves the
session's workspace root via a `typert lookups.register` entry using
`sessions.get(sessionId)?.header.cwd` (falling back to `sandboxPolicy.workspaceRoot`); on a profile
created under 0.1.2/0.1.3 and upgraded in place, that lookup/fallback does not resolve, so the read
stalls before any metadata is produced.

## 2. Probe discipline — which combo probe is a valid measurement

- **VALID: Probe 3 (per-module sweep, 62/62 HTTP 200).** Each manifest entry fetched individually returns
  200. This is the correct measurement of *static artifact serving*: it proves every artifact the roster
  references is present and served. Probe 1 (single module combo URL) is also valid and returns 200.
- **INVALID: Probe 2 (all 62 entries comma-joined into one `/plugins/??…` URL → 404, ~4–5 KB URL).**
  That 404 is a *probe artifact*, not evidence of absence. The `??` combo route is keyed by a
  content-addressed `rev` for a specific requested set and has practical URL-length limits; a single
  ~4–5 KB request joining the whole roster is oversized/malformed and is rejected with 404.
- **Why Probe 2 must never be cited as "modules missing":** the per-module sweep already returned
  62/62 × 200 for the *same* entries, so every module is demonstrably present. Citing the joined-URL 404
  as "modules missing" would be a false positive — conflating a malformed/oversized probe with real
  absence. (This is also the exact trap the 0.1.5-alpha.1 round warned about: *that* round had a genuine
  roster/combo mismatch where newly-added rows 404'd at their rev; in alpha.2 no such mismatch exists —
  modules serve individually at 200.)
- **How the real loader fetches the roster:** it reads the boot manifest injected same-origin as
  `__DSH_BOOT__` (fetch after restart), which lists each module id → its own `url` with its own
  `rev` (see boot-manifest-excerpt.txt). The loader loads modules through those per-entry URLs (single
  modules or small combos, each carrying the correct `rev`), never by concatenating all 62 entries into
  one URL. So "all-in-one join 404" tests a URL the loader would never generate.

## 3. Distractor separation — the paste-input warnings and the roster change

- **The `dsh-paste-input: fold skipped (parse failed)` warnings are UNRELATED to the content-read
  failure.** They are the dsh-paste-input plugin's client-side attempt to collapse *historical*
  paste-attachment message bubbles (the `==== DSH_PASTE_INPUT_V1 ====` marker protocol). The "parse
  failed" means those old bubbles' attachment blocks don't parse cleanly, so the fold is skipped — a
  cosmetic, per-message UX warning that fires for every historical paste attachment regardless of the
  sidebar/file path. It shares neither code nor data path with the documentpreview read. It is a
  simultaneous-but-independent bug and must not be blamed for the empty tab.
- **The roster change between the two versions** is the `ui-sidebar-textpreview` →
  `ui-sidebar-documentpreview` replacement (a rename + a `canOpen` narrowing to `scope === 'session'`).
  That change **explains the absolute-scope "no registered tab type claims" error** (failure #1) because
  the only tab type that used to claim `dsh-resource://file/absolute/**` is gone. It **does NOT explain
  the session-scope empty tab** (failure #2): a session-scoped address is still claimed and titled, yet
  the read stalls — that is the resource-provider chain issue described in §1. So the rename is a partial
  explanation only; the empty-content symptom has a separate cause.

## 4. Mitigation decision — work around or fix upstream?

- **The plugin should NOT rewrite or silently fall back around the unavailable service.** The root cause
  is host-side (the resource-provider chain does not take over / the workspace-files service fails to
  resolve the session workspace root on the legacy profile). A plugin-side rewrite (e.g. reimplementing
  the read via a private route) would mask a host regression and diverge from upstream, making the bug
  silent again later. The most a plugin should do is **fail loud**: surface a real error with the address
  and a retry hint instead of the generic 「文件资源服务不可用。」, and optionally a bounded retry — never a
  permanent fallback.
- **Order of maintainer action:**
  1. **First cheap step (read-only, host-side):** confirm where the chain breaks. Check the workspace-files
     service is actually registered as the resource provider for `dsh-resource://file/session/**`, and
     whether `sessions.get(sessionId)?.header.cwd` (and the `sandboxPolicy.workspaceRoot` fallback)
     resolves to a real path for the failing session on this 0.1.2/0.1.3-created profile. This is a
     lookup-inspection step, no code change, and directly tests the hypothesis in the evidence.
  2. **Escape hatch:** rollback to the last known-good published version
     (`npm i -g @deepseek-ai/dsh@0.1.3-alpha.2`), already verified as the escape hatch in discussion
     #5999 round 1. Do this rather than hacking the plugin if the host regression can't be fixed
     immediately.
  3. **Upstream:** file/append the round-2 forensics (see §5) so the host fixes the resource-provider
     chain; the maintainer does not ship a plugin workaround.

## 5. Prevention / upstream — forensics for the report and a boot-time loud-failure check

**A complete upstream report needs (all read-only, already in evidence):**
- Exact versions/platform/install: dsh 0.1.5-alpha.1 → 0.1.5-alpha.2, Windows 11, npm-global in-place,
  profile created under 0.1.2/0.1.3, six external client plugins junction-linked.
- The `__DSH_BOOT__` roster excerpt showing `ui-sidebar-textpreview` absent /
  `ui-sidebar-documentpreview` present (and the `dsh-api-workspace-files` row present).
- The contrast probe — file-trace's own RPC reads fine vs documentpreview's `meta.status = 'none'` — to
  prove the file/filesystem/host are fine and isolate the resource-provider path.
- The two failing addresses: the absolute-scope one (claim error) and the session-scope one (empty tab),
  with the full `dsh-resource://file/session/session-…` form.
- The per-module sweep (62/62 200) to rule out static-serving, plus the note that the all-in-one-join 404
  is a probe artifact, not missing modules.
- The console excerpt (no documentpreview/sidebar red errors; only unrelated paste-input warnings).
- The workspace-root resolution specifics: the `sessions.get(sessionId)?.header.cwd` +
  `sandboxPolicy.workspaceRoot` fallback, and what the registry returned for the failing session on the
  legacy profile.
- Reproduction steps + the prior-art fact that a host restart self-healed the alpha.1 roster/combo
  mismatch but *not* the resource chain.

**Boot-time checks the host should add so this class fails loud instead of rendering an empty tab:**
- **Provider↔tab completeness assertion:** at boot (and on provider registration) verify that every scope
  a tab type's `canOpen` claims (`dsh-resource://file/**`) has a registered resource provider, and
  that `@deepseek-ai/dsh-api-workspace-files` is registered for `dsh-resource://file/session/**`. If a
  claimed scope has no provider, emit a loud boot error/toast — this would have caught the absolute-scope
  regression immediately.
- **Workspace-root resolution self-check:** at boot, resolve the active session's workspace root
  (`header.cwd` or `sandboxPolicy.workspaceRoot`) and fail loud if it is empty/undefined on a legacy
  profile instead of serving an empty tab.
- **Roster/combo consistency check (from the alpha.1 lesson):** before printing "ready", HEAD each
  manifest entry's combo URL at its `rev` and fail loud on any non-200, so a roster/combo mismatch
  surfaces at boot rather than as "loaded without registering".
- **Client-side read timeout/status guard:** if a resource read's `meta.status` never leaves `'none'`
  (or the `read()` promise never settles), surface the address + a retry hint instead of the generic
  「文件资源服务不可用。」 — fail loud, don't fail blank.
