# JUDGE BRIEF · noskill.S4-legacy-client-imports

## Criteria (sealed rubric)
- [runtime-removal] (25pt) Locate the old ClientContext import, identify Web Client/plugin impact and A1-25, and require removing the deleted-package import in favor of a supported target owning package. A direction such as importing Context from its actual target owning package with the needed type augmentation is sufficient; the fixture does not establish the exact package name. Type erasure does not make a removed type package harmless. Respect the closed-book task: exact successor package names, symbols or signatures absent from the fixture are not mandatory for full credit. Accept a correct located diagnosis, card and defensible migration direction with unavailable details marked unconfirmed or deferred to the actual target owners/exports. Use the sealed references to check asserted details, not to require unseen names. Uncertainty alone without the diagnosis and migration direction earns no credit; positively invented replacements still lose credit.
- [registration-id] (25pt) Compare the actual pet-legacy-bundle loader ID with package.json name dsh-pet-session-bench, map A1-26 and require exact name alignment and client activation verification.
- [session-content] (25pt) Locate useSession/nodes, map A1-27 and require replacing the removed flat content access with a supported target content-reading surface, preserving ordering. Chat/durable windows or public selectors are supported directions; exact hook/store names such as useChat plus order/nodes.get are not mandatory when unavailable in the fixture. Do not positively claim that the old flat useSession nodes API remains supported. Pet.tsx is empty and has no breaking surface. Respect the closed-book task: exact successor package names, symbols or signatures absent from the fixture are not mandatory for full credit. Accept a correct located diagnosis, card and defensible migration direction with unavailable details marked unconfirmed or deferred to the actual target owners/exports. Use the sealed references to check asserted details, not to require unseen names. Uncertainty alone without the diagnosis and migration direction earns no credit; positively invented replacements still lose credit.
- [connection-face] (25pt) Locate connection.api.agentPresets.list, map A1-30 and require removing that deleted face in favor of a verified public target interface for the operation. Remote/public domain APIs are supported directions, but the exact successor name is not mandatory when unavailable in the fixture. Respect the closed-book task: exact successor package names, symbols or signatures absent from the fixture are not mandatory for full credit. Accept a correct located diagnosis, card and defensible migration direction with unavailable details marked unconfirmed or deferred to the actual target owners/exports. Use the sealed references to check asserted details, not to require unseen names. Uncertainty alone without the diagnosis and migration direction earns no credit; positively invented replacements still lose credit.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [invented-migration] ceiling=70 Apply ONLY if the report positively asserts an unsupported lifecycle replacement (apply to setup/activate) or that service inject generally must move into a manifest. Explicitly rejecting these claims, or legitimate cleanup of the deleted package from client.inject, does NOT trigger this cap.

## Candidate report(s)
#### FILE: S4-legacy-client-imports/migration-touchpoints.md

# S4 · Migration Touchpoint Report — `dsh-pet-session-bench` (0.1.1-rc.2 → 0.1.2-alpha.2)

Static, read-only scan. No build was created, nothing was executed, no host/runtime introspection was used.

---

## 0. Scope, inputs and method

| Item | Value |
| --- | --- |
| Fixture root | `fixture/` (4 files, mapped from `/app/fixture/`) |
| Plugin under analysis | `dsh-pet-session-bench` v0.1.0 (`fixture/package.json:2-3`) |
| Plane of the plugin | Web Client — `fixture/package.json:6` declares `"dsh": { "client": { "platform": "web" } }` |
| Source era | dsh 0.1.1-rc.2 (per task brief) |
| Target | dsh 0.1.2-alpha.2 |

**Files read (complete list — the fixture is exhaustive, there are no other files):**

| Ref | Path | Lines |
| --- | --- | --- |
| F1 | `fixture/src/client/index.ts` | 15 |
| F2 | `fixture/src/client/Pet.tsx` | 2 |
| F3 | `fixture/package.json` | 8 |
| F4 | `fixture/README.md` | 7 |

**Method:** each file was read once; a single consolidated pattern sweep over F1/F2/F3 confirmed that no API surface (`useSession`, `__ModuleLoader__`, `ClientContext`, `connection.api`, `nodes`, `inject`, import specifiers) occurs outside the sites listed below. Nothing was re-read.

### 0.1 Evidence base — where every card ID in this report comes from

The **only** in-scope source of change-card identifiers is `fixture/README.md:6`, which the fixture itself labels "maintainer reference, not part of the brief". It states that this plugin has *four* touchpoints that break on 0.1.2-alpha.2 and names them:

| Card ID | One-line hint, verbatim from `fixture/README.md:6` |
| --- | --- |
| `DSH-0.1.2-A1-25` | the `@deepseek-ai/dsh-client-runtime/client` package removal |
| `DSH-0.1.2-A1-26` | `__ModuleLoader__.load` registration id ≠ package.json name |
| `DSH-0.1.2-A1-27` | the flat `useSession()` `nodes` snapshot |
| `DSH-0.1.2-A1-30` | the removed `ctx.connection.api` face |

**These four IDs are the complete set of cards knowable from the fixture.** No card bodies, changelogs, upgrade guides or dependency manifests are present in scope. Consequently:

* every card ID asserted below is traceable to `fixture/README.md:6`;
* every statement about *what a card changes beyond its one-line hint* is marked **unconfirmed** — it was **not** derived from a card body, because none exists in scope;
* no card ID outside the table above is used anywhere in this report (the numeric gaps in the A1 sequence are left uninterpreted).

`fixture/README.md:6` also states the count: four breaking touchpoints. My independent code scan independently arrives at the same four (Section 2) — no fifth breakage was found in the source, and none is claimed.

---

## 1. Summary table — breaking touchpoints

| # | File : line | Symbol / statement | Plane | Card ID | Migration action |
| --- | --- | --- | --- | --- | --- |
| TP-1 | `fixture/src/client/index.ts:1` | `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'` | Web Client (removed client-runtime package surface); breakage lands in the plugin | `DSH-0.1.2-A1-25` | Re-source `ClientContext` off the removed `@deepseek-ai/dsh-client-runtime/client` entry point onto the replacement entry point named by the card. **Replacement specifier: unconfirmed.** |
| TP-1b | `fixture/src/client/index.ts:9` | `export function apply(ctx: ClientContext): void` | plugin (consumer of the removed type) | `DSH-0.1.2-A1-25` | No separate edit if TP-1 is fixed — the annotation re-resolves to the relocated `ClientContext`. Keeps `apply`'s public shape. |
| TP-2 | `fixture/src/client/index.ts:10` | `__ModuleLoader__.load('pet-legacy-bundle', …)` | plugin (id the plugin supplies); contract enforced by the loader that hosts the Web Client bundle — *which plane the loader itself ships on is unconfirmed* | `DSH-0.1.2-A1-26` | Pass the plugin's `package.json` `name` as the registration id: `'pet-legacy-bundle'` → `'dsh-pet-session-bench'` (`fixture/package.json:2`). |
| TP-3 | `fixture/src/client/index.ts:12` | `const { nodes } = useSession()` | Web Client (`useSession` session shape) | `DSH-0.1.2-A1-27` | Stop destructuring a flat `nodes` array off the `useSession()` result; read the node list through the non-flat session API defined by the card. **Exact accessor/shape: unconfirmed.** |
| TP-3b | `fixture/src/client/index.ts:13` | `const first = nodes[0]` | plugin (consumer of the flat snapshot) | `DSH-0.1.2-A1-27` | Re-express against the new session shape; positional indexing of a flat array is the assumption being removed. **New index semantics: unconfirmed.** |
| TP-4 | `fixture/src/client/index.ts:11` | `ctx.connection.api.agentPresets.list().then(…)` | Web Client (removed `ClientContext.connection.api` face) | `DSH-0.1.2-A1-30` | Replace the `ctx.connection.api.*` call with the post-0.1.2-alpha.2 agent-preset listing API. **Exact replacement and its sync/async contract: unconfirmed.** |

Planes used above: **Host** / **Web Client** / **plugin**. All four cards act on the Web Client runtime surface (`@deepseek-ai/dsh-client-runtime`, `@deepseek-ai/dsh-client-ui-chat`, the client module loader, `ClientContext`); the *edits* are all in plugin code. No card in scope affects the **Host** plane directly — stated explicitly so the plane column is not read as a Host-side gap.

---

## 2. Per-touchpoint detail

### TP-1 · `DSH-0.1.2-A1-25` — removal of `@deepseek-ai/dsh-client-runtime/client`

* **Site:** `fixture/src/client/index.ts:1` (primary) and `:9` (the type's use site).
* **Code:** `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'` — the specifier targets the `/client` subpath of the `@deepseek-ai/dsh-client-runtime` package.
* **Plane:** Web Client — the card removes a client-runtime package entry point; the plugin is the consumer that breaks.
* **Why it breaks:** the import target no longer exists at 0.1.2-alpha.2, so the module specifier fails to resolve and `ClientContext` becomes an unresolved type at `:9`.
* **Migration action:** repoint the import to the surviving/replacement client-runtime entry point specified by `DSH-0.1.2-A1-25`.
  * *Unconfirmed:* the card body is not in scope, so the **exact replacement module specifier is unconfirmed**. A move to the package root (`@deepseek-ai/dsh-client-runtime`) is plausible for a `/client` subpath removal, but nothing in the fixture states it — treat the target path as **unconfirmed** until the card body or the 0.1.2-alpha.2 package layout is consulted.
  * Confirmed by the fixture: the import is `import type`, so it is erased at compile time and carries no runtime coupling — a type-only failure.
* **Also check:** `apply(ctx: ClientContext)` at `:9` keeps its signature only if the replacement still exports a type named `ClientContext`; if it was renamed, `apply`'s parameter type must be updated too (**unconfirmed**).

### TP-2 · `DSH-0.1.2-A1-26` — `__ModuleLoader__.load` registration id must equal the package name

* **Site:** `fixture/src/client/index.ts:10`; the correct id is at `fixture/package.json:2`; the ambient declaration of the global is at `fixture/src/client/index.ts:5`.
* **Code:** `__ModuleLoader__.load('pet-legacy-bundle', () => { /* legacy bundle id, not package name */ })` — the in-source comment confirms the id is intentionally the legacy bundle id, and `fixture/package.json:2` declares `"name": "dsh-pet-session-bench"`.
* **Plane:** plugin supplies the id; the loader that consumes it hosts the Web Client bundle. Whether that loader is a Host-plane or Web-Client-plane component is **unconfirmed** from the fixture.
* **Why it breaks:** 0.1.2-alpha.2 enforces that the registration id matches the plugin's package name; `'pet-legacy-bundle'` ≠ `dsh-pet-session-bench`, so the module fails to register/resolve.
* **Migration action (fully determined by the fixture):**

      - __ModuleLoader__.load('pet-legacy-bundle', () => { … })
      + __ModuleLoader__.load('dsh-pet-session-bench', () => { … })

  The target value is read straight from `fixture/package.json:2`, so this action carries **no unconfirmed element**. If the plugin is ever renamed, this id must track `package.json` automatically.
* **Scope note:** only the *id* is covered by the card. The two-argument `load(id, fn)` signature and the callback form at `:10` are **not** claimed to have changed — no in-scope card says so.

### TP-3 · `DSH-0.1.2-A1-27` — flat `useSession()` `nodes` snapshot

* **Site:** `fixture/src/client/index.ts:12` (primary) and `:13` (consumer).
* **Code:**

      const { nodes } = useSession()
      const first = nodes[0]

* **Plane:** Web Client — the `useSession` hook is exported from `@deepseek-ai/dsh-client-ui-chat/client` (`:2`); the change is to the session shape it returns.
* **Why it breaks:** the card's subject is the *flat* `nodes` snapshot on `useSession()`. Destructuring `nodes` off the flat result no longer yields the node array.
* **Migration action:** stop treating `useSession()` as returning a flat snapshot and obtain the node list through the session API as defined by `DSH-0.1.2-A1-27`.
  * *Unconfirmed:* the **exact new accessor and shape are unconfirmed** (e.g. whether the nodes now live under a nested session object or behind a getter) — the fixture gives only the one-line hint, and no card body is in scope. Do not hard-code a guess; read the card.
  * `:13` (`nodes[0]`) must be re-expressed in the same change, since it assumes the flat array and positional indexing.
* **Import-site note:** `:2` (`import { useSession } from '@deepseek-ai/dsh-client-ui-chat/client'`) is **not** itself a removal touchpoint — `@deepseek-ai/dsh-client-ui-chat` is not named as removed by any in-scope card (only `@deepseek-ai/dsh-client-runtime/client` is, under A1-25). Line 2 stays; it is the *shape* of what it returns that moves.

### TP-4 · `DSH-0.1.2-A1-30` — removal of the `ctx.connection.api` face

* **Site:** `fixture/src/client/index.ts:11`.
* **Code:** `ctx.connection.api.agentPresets.list().then(presets => { /* legacy connection.api face */ })`
* **Plane:** Web Client — `ctx` is the `ClientContext` handed to the plugin entry point, and the `connection.api` face on it is removed.
* **Why it breaks:** `ctx.connection.api` no longer exists, so the property access (and the `agentPresets.list()` call beneath it) fails at runtime and at compile time.
* **Migration action:** route agent-preset enumeration through the post-0.1.2-alpha.2 API exposed on `ctx`.
  * *Unconfirmed:* the **replacement surface is unconfirmed** — the fixture does not say whether presets moved to `ctx.connection.agentPresets` (facade flattened), to another `ctx` sub-face, or to a service/composable. The card body must be consulted before choosing.
  * *Unconfirmed:* the **sync/async contract** of the replacement is unconfirmed. The current call chains `.then(...)`, i.e. it assumes a Promise; if the replacement is synchronous, the `.then` chain must be rewritten, and the `.then` callback's `presets` parameter is currently discarded.
  * **Dependency note (confirmed from the fixture):** `ctx` is typed as `ClientContext` imported at `:1`, so TP-1 and TP-4 must be fixed together — while `ClientContext` is unresolved, the shape of `ctx.connection` cannot be type-checked at all.

---

## 3. Sites reviewed and deliberately **not** claimed as 0.1.2-alpha.2 breakages

Listed so the scan is visibly exhaustive. Each of these was examined and **no in-scope card covers it**; asserting a break here would be a fabrication.

| File : line | Content | Why it is not claimed |
| --- | --- | --- |
| `fixture/src/client/index.ts:2` | `import { useSession } from '@deepseek-ai/dsh-client-ui-chat/client'` | The import *specifier* is not named as removed by any in-scope card; only the returned shape is affected, at `:12` (A1-27). |
| `fixture/src/client/index.ts:3` | `import { Pet } from './Pet.tsx'` | Local relative import, unaffected by any card. |
| `fixture/src/client/index.ts:5` | `declare const __ModuleLoader__: { load: (id, fn) => void }` | Ambient type declaration of the loader global. It is *context* for TP-2, but the declaration itself is not a removed symbol in any in-scope card. |
| `fixture/src/client/index.ts:7` | `export const inject = ['slots', 'conversation']` | Plugin entry contract; no in-scope card changes the `inject` array. |
| `fixture/src/client/index.ts:9` | `export function apply(ctx: ClientContext): void` | Entry-point shape; no card changes it. Its *type* is affected only via TP-1. |
| `fixture/src/client/Pet.tsx:1` | `export function Pet() {}` | Trivial component; no card covers component authoring or JSX runtime changes. |
| `fixture/package.json:1-8` | manifest | `dsh.client.platform: "web"` is the plane evidence for "Web Client". No in-scope card requires a manifest field change (no dependency/version-bump card is present). The dependency list is absent from the manifest, so dependency-level changes **cannot be assessed** from the fixture — see U-5. |

**Two observations raised by the scan but deliberately not converted into touchpoints:**

1. `inject` names `'slots'` and `'conversation'`, yet the module exports no slot or conversation provider. This may be an incomplete plugin, but no in-scope card concerns slot/conversation registration, so it is **not** a 0.1.2-alpha.2 breakage — flagged only so the maintainer does not read the absence of a break here as "nothing to do".
2. `useSession()` is called inside `apply(ctx)` at `:12`, i.e. outside a React render. This is a pre-existing structural issue independent of version, with no card behind it. It is **not** a migration touchpoint.

---

## 4. Unconfirmed register

Every item below is explicitly *not* verified from any in-scope source; each is a place where a reader must consult the actual `DSH-0.1.2-*` card body or the 0.1.2-alpha.2 package layout.

| Ref | Unconfirmed item | Why it cannot be confirmed here |
| --- | --- | --- |
| U-1 | The replacement module specifier for `ClientContext` after `@deepseek-ai/dsh-client-runtime/client` is removed (TP-1). | No card body in scope. |
| U-2 | Whether the relocated type is still named `ClientContext` and whether `apply`'s parameter type needs a rename (TP-1b). | No card body in scope. |
| U-3 | The new non-flat `useSession()` session shape / accessor for the node list (TP-3). | Only the one-line hint in `fixture/README.md:6` is available. |
| U-4 | The new index semantics for `nodes[0]` under the new session shape (TP-3b). | Same as U-3. |
| U-5 | The replacement agent-preset listing API and its sync/async contract for `ctx.connection.api.agentPresets.list()` (TP-4), and whether `manifest.dependencies` needs a version bump — the fixture manifest has **no** `dependencies` block, so dependency-level changes cannot be assessed at all. | No card body and no dependency manifest in scope. |
| U-6 | Which plane ships the module loader that enforces the registration-id rule (Host vs Web Client) for TP-2. | The fixture shows only the plugin side and the ambient global declaration. |
| U-7 | Whether any change between 0.1.1-rc.2 and 0.1.2-alpha.2 affects plugins **not** represented in this fixture (e.g. server-side/host-side plugin surfaces). | The fixture is a Web Client plugin only; the broader upgrade surface is out of scope. |
| U-8 | Whether any A1-series card *other than* the four named in `fixture/README.md:6` exists and would apply to this plugin. The four named IDs are asserted; the numeric gaps in the sequence are deliberately left uninterpreted, and no other card ID is written anywhere in this report. | The card list is not in scope. |

**Card-ID discipline:** the report asserts exactly four card IDs, all sourced to `fixture/README.md:6`. No other card ID is asserted anywhere, and no card's content beyond its one-line hint is reproduced or paraphrased as fact.

---

## 5. Read-only discipline — evidence

* **Fixture unmodified.** SHA-256 of every fixture file was recomputed after the analysis and compared against the in-scope seals `fixture-seal.pre.json` and `fixture-seal.source.json` (the two are identical to each other):

  | File | SHA-256 (abbrev.) | Matches seal |
  | --- | --- | --- |
  | `README.md` | `4dc7a7c5…365ecb` | yes |
  | `package.json` | `ffd9e5cc…c76142` | yes |
  | `src/client/Pet.tsx` | `037f6c3b…99bd27` | yes |
  | `src/client/index.ts` | `98183cf3…7a063` | yes |

  All four match. No file under `fixture/` was created, modified, moved or deleted.
* **Writes confined** to `agent-output/S4-legacy-client-imports/` (this report). No temporary files were written elsewhere; no system TEMP, `/tmp`, home directory or repository path was written.
* **No build / no reproduction environment.** No install, no bundler, no type-check, no test run, no migration was executed. The report is a static source scan.
* **No host probing.** No `dsh --version` / `--help` / `--dump-config` / `--dump-config-schema` / `plugin --help` / `headless --help`, and no `cordis_inspect_*` introspection were used. The installed host's version is out of scope by instruction.
* **No external services / network.** Nothing was fetched or published.
* **Whitelist respected.** Only files under the cell directory `…/noskill/S4-legacy-client-imports/` were read: `instruction.md`, `solver-prompt.txt`, `subagent-id.txt`, `fixture-seal.pre.json`, `fixture-seal.source.json`, and the four fixture files. No `skills/` path was opened or consulted; no `tests/`, `solution/` or other repository directory was read.
* **No skill applied** — the run operates under the no-skill arm.

---

## 6. Recommended migration order

1. **TP-1 / TP-1b** first (`:1`, `:9`) — it is a type-only import, so it is the cheapest fix, and it unblocks type-checking of every `ctx.*` access that follows.
2. **TP-4** (`:11`) together with step 1, since `ctx.connection.api` is only type-checkable once `ClientContext` resolves.
3. **TP-3 / TP-3b** (`:12`, `:13`) — `useSession()`'s new shape, one change across the pair of lines.
4. **TP-2** (`:10`) — a one-token id change to `'dsh-pet-session-bench'`; independent of the rest and safe to do at any point.

Before executing steps 1–3, read the `DSH-0.1.2-A1-25`, `-27` and `-30` card bodies for the replacement API details recorded as unconfirmed in Section 4 (U-1 … U-5).


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.