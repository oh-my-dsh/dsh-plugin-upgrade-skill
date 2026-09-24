# S21 · The Resource Service That "Unavailable" — diagnosis report

Scope: read-only analysis of `/app/fixture/` (untouched) for the 2026-09-09 dsh
0.1.5-alpha.1 → 0.1.5-alpha.2 in-place npm-global upgrade on Windows 11 (profile created
under 0.1.2/0.1.3, six external client plugins junction-linked). No migrations or
installations were executed. Card IDs cite `skills/plugin-upgrade/references/`.

Executive attribution in one line: **the tab, the module, and the file are all healthy —
what fails is the client-side `file` resource-provider chain that should carry the file's
metadata from the `api-workspace-files` Host Remote to the documentpreview tab; the read
stalls with `meta.status` stuck at `'none'` (no value, no error), i.e. the round trip
never completes, which is a host-plane wiring/boot defect, not a plugin bug and not a
static-serving problem.**

---

## 1. Attribution — which layer actually fails

**The layer that fails is the resource-provider / Remote transport between the sidebar tab
and the Host — not the filesystem, not the tab package, not static serving.**

The tab renders a correct title. That alone localizes the failure: module load, tab-type
registration, address parsing, and claim matching (`canOpen` on
`parseFileAddress(address)?.scope === 'session'`) all succeeded before any content was
requested. Everything that could fail *before* the content read demonstrably worked.

The contrast probe (`contrast-probe.txt`) is the decisive artifact — two readers of the
same file (`E:\deepseek-harness\test-lhh010\.dsh\tmp\sidebar-open-test-2.md`,
session-scoped address
`dsh-resource://file/session/session-2844c12c-…/.dsh/tmp/sidebar-open-test-2.md`) at the
same moment:

| Reader | Transport | Result |
|---|---|---|
| file-trace plugin | its own host RPC (`/dsh-file-trace/*` HTTP face) | reads fine — 原文/阅读 both show content |
| documentpreview sidebar tab | `file` resource → `api-workspace-files` Remote | fails — `meta.status` stays `'none'`, tab shows 文件资源服务不可用。 |

**What the working reader (file-trace) rules OUT** — because it exercises the same disk,
the same session, and the same host process:

- the file existing, path correctness, and OS-level readability (Windows locks/permissions);
- the Host's composed filesystem read path (`ctx.fs`) being broken;
- session workspace-root resolution — the Typert `workspaceFileScope` lookup
  (`sessions.get(sessionId)?.header.cwd`, fallback `sandboxPolicy.workspaceRoot`) resolves,
  since a host face reads the file fine (host-side notes in `contrast-probe.txt`);
- session-scoped authorization: on alpha.2 the `session` scope is precisely the authorized
  one; it is the `absolute` scope that no longer authorizes Host calls
  ([DSH-0.1.5-A2-01](../../../../../../../../skills/plugin-upgrade/references/v0.1.5-alpha.2.md)). The
  `.dsh/tmp` location under the workspace root is irrelevant either way — alpha.2 reads are
  no longer confined to the workspace root ([DSH-0.1.5-A2-02]);
- static artifact serving (62/62 per-module probes 200, and the tab itself loaded).

**What it rules IN** — the only difference between the two readers is the transport. The
plugin's own face works; the tab's read, which must go through the client `file` resource
provider over the `api-workspace-files` Remote, never produces anything. The defect is
therefore confined to that provider chain — the same residual failure #5999 round 1
already named: "the resource-provider chain did not take over"
(`discussion-excerpt.txt`). It is a host-plane composition/boot wiring defect of the
workspace-files client↔host face, not a plugin defect (file-trace is the healthy control,
not the suspect).

**What the metadata status says about where the read stalls.** The failing tab reports
`meta.status` staying `'none'` — the resource snapshot never transitions to a value **and
never transitions to an error**. Each alternative layer would leave a different
fingerprint:

- If the Host had received the request and refused it, the workspace-files error
  vocabulary would surface a distinguishable status (`workspace-file/not-found`,
  `outside-workspace`, `too-large`, or `gateway/lookup-not-found` when the scope lookup
  fails — [DSH-0.1.5-A2-01]/[A2-02]); the tab would render that error, not the bare
  "service unavailable" fallback.
- If static serving were broken, the module would never register — no tab at all, and a
  console error; that is the #5999 round-1 signature (all plugins
  "loaded without registering"), which is not what we see.
- A silent `'none'` with zero console errors means the request/response never completes a
  round trip through the resource/Remote plumbing: the client-side half of the
  workspace-files resource chain is not wired to a live answering end in this boot. The
  stall sits **between the tab and the Host Remote — in the provider/gateway wiring —
  before the Host's read logic is ever reached.**

Honest boundary: the evidence pins the layer but not the exact broken link inside it
(provider registration vs. gateway binding vs. Remote face advertisement). Per skill
discipline, that sub-attribution is marked **pending upstream source confirmation**, to be
resolved in the tagged alpha.2 tree, not guessed.

## 2. Probe discipline — which combo probe is valid

**Valid: Probe 3, the per-module sweep (62/62 HTTP 200). Invalid: Probe 2, the
all-62-entries-joined URL (404).**

- Probe 3 fetches each module exactly as the real loader does. The loader's contract is:
  read the `__DSH_BOOT__` roster (fetched same-origin after restart —
  `boot-manifest-excerpt.txt`), then import **each entry by its own advertised `url`** —
  a single-module combo URL with that entry's own `rev` (e.g.
  `/plugins/??@deepseek-ai/dsh-api-workspace-files/client.js&rev=234716e8f7370214-3`) —
  and each module registers via `__ModuleLoader__.load({ id, factory })`. Probe 1 (one
  manifest URL → 200, 73 616 bytes) is the same loader-shaped request. 62/62 200 is
  therefore a true measurement of static artifact serving: every advertised artifact is
  served.
- Probe 2 is out-of-contract and measures nothing about module availability:
  1. **No such URL exists in the system.** The manifest's per-entry `url` fields each name
     exactly one module; the host never advertises a 62-module join and the loader never
     issues one. A 404 for a hand-invented URL tells you the combo route rejects an
     out-of-contract request — plausibly its join/length limits (the URL is ~4–5 KB) —
     not that artifacts are missing.
  2. It is also technically sloppy: it reused `&rev=234716e8f7370214-0` for all 62
     modules, while manifest rows carry per-module revs (`-3`, `-N`, …).
  3. **Why it must never be cited as "modules missing":** it directly contradicts the
     valid probe, and acting on it would misdirect mitigation toward reinstalling or
     re-composing the package when every artifact serves correctly. The prior art shows
     what *real* missing modules look like on this very deployment — #5999 round 1: old
     modules 200 **and new modules 404 at the same rev**, every client plugin failing
     "loaded without registering" ([DSH-0.1.5-A1-20]). The alpha.2 evidence has the
     opposite signature; importing the alpha.1 diagnosis wholesale is exactly the trap.
  4. The discipline (per [DSH-0.1.5-A1-20]): attribute before touching plugins — probe one
     NEW and one OLD module at the same rev, the way the loader fetches them, and let the
     per-module result outrank any aggregate join.

## 3. Distractor separation

**The `dsh-paste-input` fold warnings are unrelated to the content-read failure.** Three
independent reasons:

1. **Different component and layer**: they come from the paste-input plugin's attachment
   bubble fold feature, firing per *historical* paste-attachment message whose
   `==== DSH_PASTE_INPUT_V1 ====` marker block fails to parse (`console-excerpt.txt`).
   Nothing in that path touches the `file` resource provider, the workspace-files Remote,
   or the gateway lane the sidebar tab uses.
2. **Different severity class**: they are warnings; the console shows **no red errors**
   from documentpreview, the sidebar, or the resource system. The failing tab's own
   signature is silence (`meta.status` `'none'`), not console noise.
3. **No explanatory power**: the warnings predate/parallel the failure but cannot make a
   resource read stall, and fixing folds would not bring the tab content back. Keep it as
   a *separate, minor* upstream item (a fold-parse regression on old attachment messages),
   explicitly fenced off from this diagnosis.

**What else changed in the roster, and whether it explains the symptom:**
`ui-sidebar-textpreview` → `ui-sidebar-documentpreview` (absent → replaced in the boot
census; [DSH-0.1.5-A2-09], with the new registry/slot capability in [DSH-0.1.5-A2-21]).
This rename explains **two** observations but **not the third**:

- It explains symptom 1 (the dialog): the old textpreview registered the `text` tab type
  claiming `dsh-resource://file/**`; the replacement documentpreview claims **only**
  `scope === 'session'`. The out-of-workspace link carries an `absolute`-scope address
  (`dsh-resource://file/absolute/E:/…`), which on alpha.2 has no claimant by design —
  absolute addresses are no longer the authorized vocabulary ([DSH-0.1.5-A2-01], which
  also has `fileAddressFor()` route out-of-workspace paths through the `session` scope).
  The "no registered tab type claims" dialog is the scope tightening working as designed,
  and the assistant's move (write the test file inside the session workspace so the link
  becomes session-scoped) is exactly the prescribed addressing.
- It explains the progress: the session-scoped link opens a correctly titled tab — the
  renamed module loaded, registered, and claimed the address.
- It does **not** explain the empty content: module identity/registration is demonstrably
  done working by the time a title renders. The failure begins at the metadata read behind
  the tab (`meta.status` `'none'`) — a different layer (Section 1). The rename is necessary
  context, not the root cause.

## 4. Mitigation decision — order of action

**The plugin should NOT work around the unavailable service.** No rewrite, no retry loop,
no fallback:

- The failing tab is the **host's own** documentpreview tab; the plugin (file-trace) is the
  healthy control reading the same file over its own RPC face. A plugin-side rewrite,
  retry, or fallback would conceal a host-plane defect (the mirror image of the skill's
  rule that DSH core must not be modified to conceal plugin incompatibility) and could not
  fix the host's tab anyway.
- Retrying is specifically wrong here: per the skill's safety boundaries, retry only when
  the error is retryable, the operation is idempotent, and policy allows. A read whose
  metadata never arrives (`meta.status` `'none'`, no error object) is not a retryable
  error — there is nothing to retry against.

**Order for the maintainer:**

1. **First cheap step (zero risk): one full host restart cycle.** Completely stop every
   dsh process (a browser refresh is not a host stop; a running host also holds Windows
   file locks — S12/S14 discipline), restart `dsh web`, hard-refresh the browser, re-fetch
   `__DSH_BOOT__`, retest the session-scoped link. Precedent: #5999 round 1 self-healed
   its roster/combo mismatch with exactly one restart ([DSH-0.1.5-A1-20] recipe: "restart
   the host once" before touching anything). Honest caveat from the same prior art: on
   alpha.1 the restart healed the *roster* but the content read **still** failed — so
   expect this step to be cheap but possibly insufficient; that outcome is itself
   diagnostic (it reproduces the round-1 residual exactly).
2. **Escape hatch: pinned rollback, verified on this deployment.** If the restart does not
   heal it, from an EXTERNAL terminal with the host fully stopped:
   `npm i -g @deepseek-ai/dsh@0.1.3-alpha.2` — the rollback #5999 verified as the escape
   hatch for this profile. Pin the exact version (bare names resolve the `latest` tag,
   which lags); never hand-copy package directories or hand-write shims. Do not attempt to
   repair by re-installing alpha.2 blindly — the artifacts are provably fine (62/62), so
   re-install treats the wrong layer.
3. **Upstream, regardless of the immediate outcome.** The defect lives in the host's
   resource-provider chain; only upstream can fix it. Append the round-2 forensics to
   #5999 (as was done, comment 18371079) and reference it from the plugin's troubleshooting
   notes as "host defect, upstream tracked" instead of shipping a workaround release.

## 5. Prevention / upstream

**Forensics a complete upstream report needs** (all of it collected in this pack; include
even the negative evidence):

- Environment and provenance: Windows 11; npm-global install; in-place
  0.1.5-alpha.1 → 0.1.5-alpha.2; profile created under 0.1.2/0.1.3; six external client
  plugins junction-linked; restart state at each observation.
- Timeline: the two-dialog sequence (absolute-scope claim error → session-scoped tab opens
  with 文件资源服务不可用。); terminal boot output (`[dsh-profiles] ready`, no visible
  errors).
- **The contrast probe** — two readers, same file, same moment: file-trace's own RPC
  succeeds; the sidebar tab's `meta.status` stays `'none'`. This single artifact
  localizes the fault to the resource-provider chain and exonerates the disk, auth, and
  workspace-lookup layers; it is the difference between an actionable report and a guess.
- The exact failing metadata status (`'none'` — no value, no error) and the full
  session-scoped address string, plus the probed URLs/revs.
- The **valid** probe result (per-module 62/62 200) **and** the explicit statement that
  the joined-62 URL 404 is an out-of-contract request that must not be read as "modules
  missing" — so upstream doesn't mis-triage either.
- Boot roster excerpt: documentpreview present / textpreview absent (the rename), the
  workspace-files host row present in the web-app bundle `cordis.patch.yml`, and the
  host-side notes (Typert scope lookup; out-of-workspace reads allowed by design).
- Console excerpt proving the absence of resource-system errors.
- Prior art: #5999 round 1 and the fact this is a narrower recurrence on the same profile
  (round 2, comment 18371079).

**What the host could check at boot so this class fails loud:**

1. **Self-probe the advertised roster at boot**: fetch every `__DSH_BOOT__` entry's own
   URL once at startup and assert 200-with-code at the entry's rev — turning the A1-20
   roster/combo lesson (which currently self-heals silently or fails innocuously) into a
   boot assertion.
2. **Health-check the resource chain end-to-end**: after client modules activate, verify
   the `api-workspace-files` Remote face is registered and answers a cheap probe (e.g. a
   `stat` on a canary session file through the same gateway lane the client uses). A
   resource provider that never takes over should abort or warn the boot, not wait for a
   user to click a file link.
3. **Fail loud in the UI**: if the chain is unwired, raise a visible boot error/banner
   ("file resource provider did not activate; previews disabled") instead of a tab that
   renders a title and a bare 文件资源服务不可用。 with no error and no retry.
4. **Make the fallback forensic**: the tab's unavailable-state UI should surface the
   resource status / gateway error code (`meta.status`, error code) and a retry
   affordance. A silent `'none'` is the anti-forensic part of this failure — it is what
   forced the contrast-probe detour.
5. Process discipline (already carded): the generalizable rule behind this incident is
   SKILL.md validation layer 4 — for a Web Client, read the boot manifest, request the
   advertised artifact, and **prove registration/mount rather than accepting a bare HTTP
   200** (`verify-runtime.mjs` encodes this). Per-module 200 was necessary but not
   sufficient; the missing check was the end-to-end resource read.

---

### Summary of citations

- Fixture: `symptom-log.txt`, `contrast-probe.txt`, `combo-probe.txt`,
  `boot-manifest-excerpt.txt`, `console-excerpt.txt`, `discussion-excerpt.txt`, `README.md`.
- Cards: [DSH-0.1.5-A2-01], [DSH-0.1.5-A2-02], [DSH-0.1.5-A2-09], [DSH-0.1.5-A2-21]
  (`references/v0.1.5-alpha.2.md`); [DSH-0.1.5-A1-11], [DSH-0.1.5-A1-20]
  (`references/v0.1.5-alpha.1.md`, incl. the six-plugin crossing record); skill safety
  boundaries and validation layer 4 (`SKILL.md`); S12/S14 troubleshooting rows
  (`references/troubleshooting.md`).
- Pending: exact broken link inside the resource-provider chain (provider registration vs
  gateway binding vs Remote face) — to be confirmed against the tagged alpha.2 source
  upstream; not guessable from the evidence pack.
