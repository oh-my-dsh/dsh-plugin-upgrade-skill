# S21 — The Resource Service That Is "Unavailable" (Read-Only Analysis)

Deployment: dsh 0.1.5-alpha.1 → 0.1.5-alpha.2 in-place npm-global upgrade on Windows;
profile created under 0.1.2/0.1.3; six external client plugins junction-linked.
Evidence: fixture/ symptom-log, boot-manifest excerpt, combo probes, contrast probe,
console excerpt, discussion #5999 excerpt. Corridor cards: references/v0.1.5-alpha.1.md
(DSH-0.1.5-A1-20) and references/v0.1.5-alpha.2.md (client-resources drops `reload`;
ui-sidebar-textpreview → ui-sidebar-documentpreview rename; workspaceFiles Typert
scope/absolute-authorization rework).

## 1. Attribution — which layer actually fails

The failing layer is the **client resource-service chain** (the documentpreview tab's
read through the `api-workspace-files` Remote / `dsh-client-resources` provider), **not**
static module serving and **not** sidebar tab claiming.

- Tab claiming works: the session-scoped click opens a correctly titled tab
  ("sidebar-open-test-2.md"). The alpha.2 `ui-sidebar-documentpreview` document tab
  claimed the `dsh-resource://file/session/…` address. The earlier absolute-address
  error (`no registered tab type claims "dsh-resource://file/absolute/…"`) is a
  *different, by-design* claim failure: the alpha.2 replacement registers a document tab
  whose `canOpen` accepts only `parseFileAddress(address)?.scope === 'session'`
  (boot-manifest-excerpt note), so the absolute scope is legitimately unclaimed.
- Static serving works: 62/62 manifest modules return HTTP 200 (combo-probe Probe 3).

What the two readers of the same file rule in and out (contrast-probe):

| Ruled OUT | Evidence |
|---|---|
| File content / path / ACL problem | file-trace reads the identical file fine in both 原文 and 阅读 modes |
| Session-scope or ".dsh/tmp under workspace root" authorization | same session-scoped address; host notes say outside-workspace files are allowed anyway |
| Sidebar tab registration | tab opens with the correct title |

| Ruled IN | Evidence |
|---|---|
| The documentpreview → workspace-files Remote read path | meta.status stays `'none'` — the read never completes |

The metadata status is the decisive forensic: `meta.status === 'none'` means the tab
never even got a *pending/failed* metadata response — the resource read **stalls before
any host round-trip produces a result**. The request never effectively arrives at the
host service (file-trace's own RPC arriving proves the host is reachable), so the stall
is in the client-side resource-provider chain: the alpha.2 `client-resources` contract
changed (the card `client-resources` drops `reload`, and `workspaceFiles` moved to the
Typert `workspaceFileScope` with `reload`/`restat`/`absolute` rework). A provider
registered against the old contract, or a provider whose registration silently did not
take, yields exactly this: no console error, no rejected promise, status stuck at 'none',
and the tab's generic fallback 「文件资源服务不可用。」. This is the same family as
discussion #5999 round 1, where after the roster self-heal "the resource-provider chain
did not take over" — round 2 is narrower: modules serve, the tab claims, but the provider
hand-off still does not happen.

## 2. Probe discipline — valid vs invalid measurements

- **Valid**: Probe 3, the per-module sweep (62/62 HTTP 200), and Probe 1 (the manifest's
  own single-module combo URL → 200). These measure exactly what the serving layer must
  do: deliver each artifact the boot manifest advertises, at the advertised rev.
- **Invalid**: Probe 2, the naive all-62-modules comma-join → 404. It is **not a
  measurement of anything the product does**. The combo route answers the specific combo
  URLs the boot manifest emits; it is not obliged to materialize arbitrary client-invented
  joins. A ~4–5 KB joined URL also brushes against URL/query length limits and combo
  chunking rules. Its 404 proves only that *this synthetic URL* is not served — it must
  **never be cited as "modules missing"**, because the modules demonstrably exist
  (62/62 individual 200s at the same rev).
- **How the real loader fetches the roster**: it reads `window.__DSH_BOOT__` (the boot
  manifest), which lists each module id with its exact `/plugins/??…&rev=…` URL, and
  fetches **those URLs as listed** (manifest-chunked combos, not a hand-built superset).
  The correct validity test for "is static serving healthy" is therefore: fetch every
  manifest-listed URL verbatim (or module-by-module) — which passes here. Static serving
  is exonerated; the failure is at runtime service resolution, one layer up.

## 3. Distractor separation

- The repeated `dsh-paste-input: fold skipped (parse failed)` warnings are **unrelated**.
  They come from an external plugin re-scanning *historical* paste-attachment messages
  whose bubble text no longer matches its `DSH_PASTE_INPUT_V1` fold parser — a cosmetic,
  pre-existing parse miss repeated per old message. No error from documentpreview,
  client-resources, or the sidebar appears in the console, which is itself the signature
  of a *silent* provider stall rather than a thrown exception.
- What changed in the roster between the versions: `ui-sidebar-textpreview` was removed
  and replaced by `ui-sidebar-documentpreview` (bundle cordis.patch.yml row swapped;
  textpreview has 0 mentions in the new HTML). This rename **does explain symptom #2's
  absolute-address claim error** (the new tab type accepts session scope only) but
  **does NOT explain symptom #3's empty content**: the documentpreview tab registered
  and claimed successfully — the content read fails one layer below it, in the resource
  service. Keep the two dialogs separate: claim-scope narrowing (explained, by design)
  vs provider-chain stall (unexplained by the rename; the real bug).

## 4. Mitigation decision

**No plugin-side workaround.** The plugin should not rewrite addresses, retry loops, or
fall back to its own transport to bypass the resource service: the contract
(`api-workspace-files` Remote + `client-resources` provider) still exists on both
versions; duplicating it forks behavior, masks the host regression, and breaks again on
the next contract change. file-trace already demonstrates that "read it yourself" works —
that is precisely why the *plugin* must not "fix" this.

Maintainer action order:

1. **First cheap step**: full host restart (stop every dsh process, restart `dsh web`,
   hard-refresh the browser). Per DSH-0.1.5-A1-20 and #5999 round 1, an in-place
   npm-global upgrade can leave roster/combo/provider state inconsistent, and a restart
   self-heals it. Verify with the same probes: manifest URLs 200 + open a session-scoped
   file link and check meta.status leaves 'none'.
2. **Escape hatch**: if the stall survives a clean restart, roll back with the pinned
   external install — `npm i -g @deepseek-ai/dsh@0.1.5-alpha.1` (or the previously
   verified 0.1.3-alpha.2 per #5999) — host fully stopped, from an external terminal,
   then restart and verify. Never hand-copy package trees or hand-write shims.
3. **Upstream**: report with the forensics package below (this evidence was correctly
   appended to discussion #5999 as round 2, comment 18371079).

## 5. Prevention / upstream

A complete upstream report needs:

- Exact version pair, install channel (npm global, in-place), OS, profile lineage
  (created under 0.1.2/0.1.3), and the six junction-linked external plugins.
- The `__DSH_BOOT__` manifest (full roster + rev), before and after restart.
- Both probe classes: manifest-verbatim/per-module fetches (valid) and the joined probe
  clearly *labelled invalid* so it is not misread as module loss.
- The contrast probe: two readers, same file, same moment — one working (file-trace RPC),
  one stalling (documentpreview meta.status 'none').
- Full browser console + host terminal logs across the boot (to show the *absence* of
  errors), plus the network trace of whether the workspace-files Remote read is ever
  emitted.
- The by-design scope change (absolute-scope no longer claimed) listed separately so it
  is not conflated with the content-read stall.

What the host could check at boot so this fails loud instead of rendering an empty tab:

- **Roster/combo consistency assertion**: after building the boot manifest, HEAD/GET
  every advertised module URL at its rev; refuse (or loudly warn on) a boot that would
  serve a stale combo — the A1-20 failure mode.
- **Resource-provider handshake**: for every registered client resource type
  (`dsh-resource://file/*` etc.), verify at boot that a live provider resolved through
  the required services (`workspace-files`, `client-resources`) — i.e. the Cordis
  required/provided services are not pending. If a claimed scheme has no resolved
  provider, surface a boot error naming the service, instead of letting the tab render
  「文件资源服务不可用。」 with a clean console.
- **Contract-version check on cached client modules**: after an in-place upgrade, detect
  client artifacts/providers built against the previous contract (e.g. expecting the
  removed `client-resources.reload`) and force re-resolution/restart rather than
  silently pairing old providers with new services.

---
*Fixture left untouched. Analysis only; no installs, migrations, or writes outside
agent-output were performed.*
