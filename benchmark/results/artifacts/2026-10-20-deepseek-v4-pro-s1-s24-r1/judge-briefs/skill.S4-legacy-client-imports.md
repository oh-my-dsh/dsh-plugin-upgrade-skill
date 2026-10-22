# JUDGE BRIEF · skill.S4-legacy-client-imports

## Criteria (sealed rubric)
- [runtime-removal] (25pt) Locate the old ClientContext import, identify Web Client/plugin impact and A1-25, and require removing the deleted-package import in favor of a supported target owning package. A direction such as importing Context from its actual target owning package with the needed type augmentation is sufficient; the fixture does not establish the exact package name. Type erasure does not make a removed type package harmless. Respect the closed-book task: exact successor package names, symbols or signatures absent from the fixture are not mandatory for full credit. Accept a correct located diagnosis, card and defensible migration direction with unavailable details marked unconfirmed or deferred to the actual target owners/exports. Use the sealed references to check asserted details, not to require unseen names. Uncertainty alone without the diagnosis and migration direction earns no credit; positively invented replacements still lose credit.
- [registration-id] (25pt) Compare the actual pet-legacy-bundle loader ID with package.json name dsh-pet-session-bench, map A1-26 and require exact name alignment and client activation verification.
- [session-content] (25pt) Locate useSession/nodes, map A1-27 and require replacing the removed flat content access with a supported target content-reading surface, preserving ordering. Chat/durable windows or public selectors are supported directions; exact hook/store names such as useChat plus order/nodes.get are not mandatory when unavailable in the fixture. Do not positively claim that the old flat useSession nodes API remains supported. Pet.tsx is empty and has no breaking surface. Respect the closed-book task: exact successor package names, symbols or signatures absent from the fixture are not mandatory for full credit. Accept a correct located diagnosis, card and defensible migration direction with unavailable details marked unconfirmed or deferred to the actual target owners/exports. Use the sealed references to check asserted details, not to require unseen names. Uncertainty alone without the diagnosis and migration direction earns no credit; positively invented replacements still lose credit.
- [connection-face] (25pt) Locate connection.api.agentPresets.list, map A1-30 and require removing that deleted face in favor of a verified public target interface for the operation. Remote/public domain APIs are supported directions, but the exact successor name is not mandatory when unavailable in the fixture. Respect the closed-book task: exact successor package names, symbols or signatures absent from the fixture are not mandatory for full credit. Accept a correct located diagnosis, card and defensible migration direction with unavailable details marked unconfirmed or deferred to the actual target owners/exports. Use the sealed references to check asserted details, not to require unseen names. Uncertainty alone without the diagnosis and migration direction earns no credit; positively invented replacements still lose credit.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [invented-migration] ceiling=70 Apply ONLY if the report positively asserts an unsupported lifecycle replacement (apply to setup/activate) or that service inject generally must move into a manifest. Explicitly rejecting these claims, or legitimate cleanup of the deleted package from client.inject, does NOT trigger this cap.

## Candidate report(s)
#### FILE: S4-legacy-client-imports/report.md

# Migration Touchpoint Report — S4 · Legacy Client Runtime Touchpoints

- **Fixture**: `dsh-pet-session-bench` (Web Client plugin), source at
  `fixture/src/client/index.ts` (+ trivial `Pet.tsx`, `package.json`).
- **Corridor**: `dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.1 → dsh-v0.1.2-alpha.2`
  (edges from the skill corridor index: `v0.1.2-alpha.1.md` then `v0.1.2-alpha.2.md`).
- **Mode**: read-only inspection (Mode A / C-baseline-style scan). No file under the fixture
  was modified; no reproduction environment was built; no dependencies installed.
- **Plane**: all four touchpoints live in the browser-side client bundle → **Web Client** plane
  (the plugin's `src/client` half). `package.json` is unchanged and is the source of truth
  for the registration name.

## Touchpoint inventory (4 hits)

| # | File:line | Plane | Card | One-line break |
|---|---|---|---|---|
| 1 | `src/client/index.ts:1` (type used at :9) | Web Client | DSH-0.1.2-A1-25 | import from removed `@deepseek-ai/dsh-client-runtime/client` |
| 2 | `src/client/index.ts:10` (declare at :5) | Web Client | DSH-0.1.2-A1-26 | `__ModuleLoader__.load` id ≠ package.json name |
| 3 | `src/client/index.ts:12-13` (import at :2) | Web Client | DSH-0.1.2-A1-27 | flat `useSession()` `nodes` snapshot is gone |
| 4 | `src/client/index.ts:11` | Web Client | DSH-0.1.2-A1-30 | removed `ctx.connection.api` face |

---

### 1. index.ts:1 — import from removed `@deepseek-ai/dsh-client-runtime/client`

- **Card**: DSH-0.1.2-A1-25 (breaking; `@deepseek-ai/dsh-client-runtime` package removed,
  client symbols migrated by domain).
- **Plane**: Web Client (plugin client half).
- **Evidence**: `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'`;
  the type is used in `export function apply(ctx: ClientContext)` at :9.
- **Migration action**:
  - Drop the import entirely; map `ClientContext` → `import type { Context as ClientContext }
    from '@deepseek-ai/cordis'` (card A1-25 mapping table, first row).
  - If the plugin also declared the package in `dsh.client.inject`, remove it — here
    `package.json` has no `dsh.client.inject`, so nothing to remove (not a hit).
  - Add type-only augmentations only for the owning packages the code actually consumes
    (API-10 ledger); do not rely on the old aggregation package.
- **Source**: DSH-0.1.2-A1-25 (skill `references/v0.1.2-alpha.1.md`); API-10
  (`references/api-migration-0.1.2-alpha.2.md`).

### 2. index.ts:10 — `__ModuleLoader__.load` registration id ≠ package.json name

- **Card**: DSH-0.1.2-A1-26 (breaking; client-modules scan contract — registration id must
  equal the package.json `name`).
- **Plane**: Web Client (plugin client half).
- **Evidence**: `__ModuleLoader__.load('pet-legacy-bundle', …)` (declared at :5), while
  `package.json` `name` is `"dsh-pet-session-bench"`. The comment itself flags
  "legacy bundle id, not package name".
- **Migration action**: change the registration id to the bare package name
  `'dsh-pet-session-bench'` so `entry id == package name == __ModuleLoader__.load id`.
  (Normally injected by the tsdown banner `PLUGIN_ID`; here it is hand-written.)
- **Source**: DSH-0.1.2-A1-26 (skill `references/v0.1.2-alpha.1.md`).

### 3. index.ts:12-13 — flat `useSession()` `nodes` snapshot

- **Card**: DSH-0.1.2-A1-27 (breaking; session content reads rerouted off the flat per-session
  node snapshot).
- **Plane**: Web Client (plugin client half).
- **Evidence**: `const { nodes } = useSession()` (import at :2 from
  `@deepseek-ai/dsh-client-ui-chat/client`) then `const first = nodes[0]`.
- **Migration action**:
  - The flat `ConversationNode[]` snapshot is gone on 0.1.2. Switch `useSession` →
    `useChat`; `ChatSnapshot.nodes` is now a keyed store, so iterate `snapshot.order`
    and read `snapshot.nodes.get(id)` instead of `nodes[0]` (API-10 ledger).
  - For raw session-timeline content specifically, read through the SessionBinding durable
    event window: `sessions.binding(id)` → `binding.eventSource.getSnapshot().entries`
    (A1-27 recipe; `SessionBinding`/`SessionEventLikeEntry` from
    `@deepseek-ai/dsh-api-session-controller/client`).
- **Source**: DSH-0.1.2-A1-27 (skill `references/v0.1.2-alpha.1.md`); precise selector/keyed-store
  mapping from API-10 (`references/api-migration-0.1.2-alpha.2.md`).

### 4. index.ts:11 — removed `ctx.connection.api` face

- **Card**: DSH-0.1.2-A1-30 (breaking; client `ctx.connection.api` face removed entirely).
- **Plane**: Web Client (plugin client half).
- **Evidence**: `ctx.connection.api.agentPresets.list().then(presets => { … })`.
- **Migration action**:
  - Replace the `connection.api` mirror with the Remote face:
    `ctx.remote.agentPresets.list()` (A1-01 mapping table: `agentPreset.list` →
    `agentPresets/list`). Declare `remote` in the client `inject` export and obtain the
    generated type mounts via `@deepseek-ai/dsh-api-remotes/client`.
  - Handle the `RemoteResult<T>` shape (`result.ok` / `result.error`) rather than a raw
    promise; error codes are namespaced on alpha.2 (see DSH-0.1.2-A2-02).
  - Drop `connection` from `inject`/type mirror where it remains (here `inject` is
    `['slots', 'conversation']`, so nothing to remove for `connection`).
- **Source**: DSH-0.1.2-A1-30 and DSH-0.1.2-A1-01 (skill `references/v0.1.2-alpha.1.md`);
  DSH-0.1.2-A2-02 (`references/v0.1.2-alpha.2.md`).

## Scanned but not hit

Checked the remaining corridor cards against this fixture; none intersect the four lines
above (fixture has no host-plane code, no settings, no custom events, no DOM manipulation,
no subprocess output, no workspace navigation):

- alpha.1 non-hits: A1-02/A1-04…A1-24 (host plane, headless, PTC rename, web policy, presets,
  settings, llm, subagent descriptor, etc.), A1-28 (composer DOM), A1-29 (MarkdownText labels),
  A1-31 (subagent descriptor version), A1-32 (workspace navigation) — none used by the fixture.
- alpha.2 non-hits: A2-01 (SessionEvent.ignorable), A2-03 (peer trim — `package.json` has no
  `peerDependencies`), A2-04 (Node 24 fix — no workaround present), A2-05 (plugin inventory
  `agentPresets` — not consumed), A2-06 (`$host` facts — not used), A2-08
  (`sessionProjections` inject — host tool packages only), A2-10 (`settingsNamespace` — no
  settings code).
- `export const inject = ['slots', 'conversation']` (index.ts:7): no corridor card flags a
  rename/removal of the `slots`/ `conversation` service names for a Web Client plugin;
  treated as non-hit (no carded change found).
- `package.json` `dsh.client.platform: "web"`: already the post-rc.1 manifest form
  (`dsh.client`), no change in this corridor.

## Read-only discipline

- Fixture left byte-identical: only reads (`read`/`glob`) were performed against
  `fixture/**`; no writes, no edits, no dependency install, no build/reproduction.
- This report is the only artifact written, under the designated `agent-output/` path.
- No task `solution/` or `tests/` directories were read.

## Unconfirmed

- The exact runtime shape of `useSession` (removed vs. still-exported-but-different return)
  was not compiled against the target tag; the A1-27 + API-10 mapping is the carded/ledger
  guidance, not a local typecheck. Target-tag types win if they differ.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.