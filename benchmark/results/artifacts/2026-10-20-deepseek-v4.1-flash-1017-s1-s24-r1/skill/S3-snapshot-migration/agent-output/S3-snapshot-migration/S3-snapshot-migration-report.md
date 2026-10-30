# S3 · Snapshot Read-Surface Migration Assessment — `@demo/dsh-bench-pet`

**Corridor**: `0.1.1-rc.1`-era client source → `dsh-v0.1.2-alpha.2` (via `dsh-v0.1.1-rc.2` → `dsh-v0.1.2-alpha.1` → `dsh-v0.1.2-alpha.2`)
**Mode**: A/C read-only assessment (plan only — **no code was touched, nothing installed, nothing executed against a host**)
**Subject**: `fixture/` (byte-identical; verified untouched after the scan)
**Prepared**: 2026-10-20 · single-pass, unattended evaluation

| Item | Value |
|---|---|
| Plugin package | `@demo/dsh-bench-pet` (private), plugin version `0.1.0` |
| Plugin version ≠ host corridor | plugin SemVer (`0.1.0`) must be bumped separately from the DSH corridor (`0.1.2-alpha.2`) |
| Face | Web Client (browser half) + one profile composition row; **no** Host half, **no** Remote/APIProxy, **no** custom channel, **no** subprocess |
| Target host cohort | `@deepseek-ai/dsh-*@0.1.2-alpha.2`, `@deepseek-ai/cordis@^4.0.1` |
| Source evidence | target-tag API ledger `API-10`, cards `DSH-0.1.2-A1-03/25/26`, `DSH-0.1.2-A2-03`, `DSH-0.1.1-R1-02/03`, `R-01/R-06/R-11`, precision checklist |
| Static scan run | `node skills/plugin-upgrade/scripts/inject-lint.mjs <fixture>` (read-only, exit 0) |

---

## 1. One-page conclusion

**The plugin as written cannot load on `0.1.2-alpha.2` at all**, for two independent hard stops, and its entire animation logic reads a snapshot shape that no longer exists:

1. `src/client/index.ts:6` and `src/client/Pet.tsx:8` import types from `@deepseek-ai/dsh-client-runtime/client` — that package was **deleted** in alpha.1 (`DSH-0.1.2-A1-25`, `R-11`, `API-10`). Typecheck fails; the client bundle graph loses its Context augmentation.
2. `package.json:6-9` declares the browser half under a **top-level `"client"` key**, not `dsh.client`. `client-modules` only enumerates packages declaring `dsh.client` (`DSH-0.1.1-R1-02`, `DSH-0.1.1-R1-03`, `DSH-0.1.2-A1-26`), so the row never enters the browser roster — the pet silently disappears with **no error in any log**. The read-only lint confirms the consequence: `declaredInject: []`.

On top of that, `dsh-client-runtime` survives inside `dsh.client.inject` (a runtime phantom that keeps the assembly row pending even after the manifest key is fixed — `DSH-0.1.2-A1-25`), and four flat snapshot selectors (`partial`, `runningCalls`, `turnEnds`, plus the `ConversationSnapshot` type they are typed by) moved into the per-view chat projection (`DSH-0.1.2-A1-03`).

Net state after the migration described below: no `dsh-client-runtime` anywhere; `dsh.client.inject` recomposed by capability; snapshot reads split between the chat view projection (`partial`/`runningCalls`/`turnEnds`) and the session lifecycle seat (`running`); `ChatSnapshot.order` + `nodes.get(id)` as the alpha.2-only primary read.

### Surface summary

| # | Hit (file:line) | Old interface | Typical symptom on alpha.2 | Target interface | Change | Cards |
|---|---|---|---|---|---|---|
| S1 | `src/client/index.ts:6` | `ClientContext` from `dsh-client-runtime/client` | TS2307 module not found; `ctx` facets become `any` | `Context` from `@deepseek-ai/cordis` + per-owner type-only augmentations | required | `DSH-0.1.2-A1-25`, `R-11`, ledger `API-10` |
| S2 | `src/client/Pet.tsx:8` | `ConversationSnapshot` from `dsh-client-runtime/client` | same module-not-found; selector params degrade to `any` under `skipLibCheck` | `ChatSnapshot` from `dsh-client-ui-chat/client` | required | `DSH-0.1.2-A1-25`, `DSH-0.1.2-A1-03`, ledger `API-10` |
| S3 | `src/client/Pet.tsx:13-15, 20-23` | flat `snapshot.partial / runningCalls / turnEnds` | undefined / empty; animation frozen at `idle`, console factory errors | `views.get('chat')?.legacy` (staged) → `useChat` + `order`/`nodes.get(id)`; turn end in `chat.timeline` | required | `DSH-0.1.2-A1-03`, ledger `API-10`, `R-11` |
| S4 | `src/client/Pet.tsx:19` | `useSession(s => s.running)` | silently becomes the only lifecycle read that still works — must **not** be moved into the projection | unchanged `useSession` seat | keep (guard) | `DSH-0.1.2-A1-03` |
| S5 | `package.json:6-9` | top-level `"client"` + `"dsh-client-runtime"` in `inject` | plugin missing from boot graph / row pending, no error | `"dsh": { "client": { … } }` with recomposed inject | required | `DSH-0.1.1-R1-02`, `DSH-0.1.1-R1-03`, `DSH-0.1.2-A1-26`, `DSH-0.1.2-A1-25` |
| S6 | `package.json` (no `peerDependencies`) | no direct type owners declared | implicit `any` on selectors under `skipLibCheck`; typecheck churn | cohort-floor peers = superset of inject + type owners | required | `DSH-0.1.2-A2-03` (+ field note), `R-01`, precision checklist |
| S7 | `src/client/index.ts:38-43` | bare `ctx.slots.register` guarded by `ctx.inject(['slots','conversation'])` | "slot not declared" at apply time when declaration order is unconstrained | `ctx.slots.inject(name, () => ctx.slots.register(...))` | conditional (harden) | `DSH-0.1.2-A1-03`, ledger `API-10` |
| S8 | `src/client/index.ts:14-19` | `declare module '@deepseek-ai/dsh-client-ui-slots' { LocaleNamespaceMap }` | if the target moved the declaration, `t` silently loses its keys | keep augmentation, re-point to the declaring package at target | verify | precision checklist (locale pairing) |
| S9 | `src/client/Pet.tsx:14` | `block.kind === 'reasoning'` (ContentBlock family) | `@deepseek-ai/dsh-llm` absent from peers → unresolved declarations | add `@deepseek-ai/dsh-llm` peer | required | precision checklist, `DSH-0.1.2-A2-03` |
| S10 | `package.json` / `cordis.patch.yml:1-3` | bundle registration identity | `loaded without registering "<id>"` or a silent absence | registration id == package name; row name already bare (`ok`) | verify | `DSH-0.1.2-A1-26`, `API-08` |

---

## 2. Identity, baseline, and what could not be measured

- **Install identity**: unknown from the fixture (no lockfile, no registry metadata, no `.git`). Recorded as "task material snapshot"; treat the install track as *source-migrate* (Mode C), not installed-upgrade (Mode B).
- **Baseline (`R-06` pattern): not collected.** The fixture is intentionally trimmed (README: "cannot be run"): no `tsconfig`, no build/test scripts, no `node_modules`, no generated client bundle. No build/typecheck/test failure set exists to exempt, and **no compile or boot layer was executed** in this pass (also forbidden by the brief). Every conclusion below is *static*, derived from target-tag interface ledgers and cards — it is not "typecheck passed", "Loader mount passed", or "behavior passed".
- **Fixture integrity**: read-only throughout; `inject-lint.mjs` only reads. The two flagged `runtimeRefsLeft` entries are pre-existing source, not something this assessment introduced. Recorded post-analysis SHA-256 prefixes (first 16 hex) for a later diff gate:

| Fixture file | Bytes | SHA-256 (prefix) |
|---|---:|---|
| `cordis.patch.yml` | 64 | `73D74CF519C91984` |
| `package.json` | 227 | `154E9FD5F8E1B900` |
| `README.md` | 204 | `C1114413138587E9` |
| `src/client/index.ts` | 1546 | `94533A879790CDCB` |
| `src/client/locales.ts` | 337 | `D56AA3AAFF649BDD` |
| `src/client/Pet.tsx` | 1520 | `777A963FFA454F0B` |

---

## 3. Touchpoint checkup (7 classes)

| Touchpoint | Hit | File/line | Applicable card | Confidence note |
|---|---:|---|---|---|
| #1 patch / monkey patch | no | — (`cordis.patch.yml` is composition, not a source patch) | `API-08` | classified as profile overlay; no `patchedDependencies`, no host source replacement |
| #2 events / persistent events | no | — | `DSH-0.1.2-A1-02` / `DSH-0.1.2-A2-01` | no `SessionEventMap` augmentation, no `Session.append`, no `ctx.on('session/event')`. `block.kind` at `Pet.tsx:14` is a **ContentBlock** discriminant, not the session-event `kind`/`type` seam of `DSH-0.1.1-R1-06` — not a hit |
| #3 services / Remote | yes | `index.ts:6,29,36,38`; `Pet.tsx:8` | `DSH-0.1.2-A1-25`, `DSH-0.1.2-A1-03`, ledger `API-10` | client-plane service consumption only; no `ctx.remote`, no `connection.api` |
| #4 host filesystem | no | — | — | no `DSH_HOME`, no `readFile`/`writeFile` |
| #5 UI / slots / client registration | yes | `index.ts:14-19, 29, 38-43`; `Pet.tsx:7, 10`; `package.json:6-9` | `DSH-0.1.2-A1-25`, `DSH-0.1.2-A1-26`, `DSH-0.1.2-A1-03`, `DSH-0.1.1-R1-02`/`DSH-0.1.1-R1-03` | `PropsRuntime`/`PropsLocale` stay in `dsh-client-ui-slots`; the `slots` **service** must be injected from its owner |
| #6 custom channel / DOM / CSS | no | — | — | `className="pet"` only styles the plugin's own div; no `webServer` route, no MutationObserver |
| #7 subprocess / output | no | — | — | no child process, no `--profile` parsing |

No-hit notes: the scan covered every file in `fixture/` (`README.md`, `cordis.patch.yml`, `package.json`, `src/client/{index.ts,Pet.tsx,locales.ts}`). Dependency/configuration surfaces were checked separately (`4 S5/S6/S10) because the fixture ships no dependency block at all.

---

## 4. Break inventory (each surface: evidence → old → how it breaks → target → verification)

### S1 · `ClientContext` imported from the removed client runtime

- **Evidence**: `src/client/index.ts:6` — `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'`. Also `:35` uses it as the `apply` parameter type.
- **Old form**: the aggregate runtime package re-exported the client `Context` façade.
- **How it breaks**: the package was deleted in alpha.1 (`DSH-0.1.2-A1-25`; `R-11` row "ClientContext … from the removed `dsh-client-runtime/client`"). Typecheck: `TS2307 Cannot find module` / missing exported member. Under `skipLibCheck: true` the more dangerous variant appears: `ctx` facets and every callback parameter that came from the aggregate silently become `any`, so the migration "compiles" while the runtime is wrong.
- **Target form** (alpha.2 minimal, compiles against the real `Context`):

```ts
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// one type-only augmentation per owner actually used:
import type {} from '@deepseek-ai/dsh-client-locale/client'         // ctx.locale
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client' // header.actions SlotMap entry
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'     // ctx.slots declaration owner
```

- **Best practice**: the type graph and the runtime service graph are two checks. A `type {}` import is erased at build time — it cannot provide `slots`/`locale`; it only makes the declarations visible. Never add a package to `dsh.client.inject` *because of* a type-only import (`DSH-0.1.2-A1-25`; precision checklist "renderer's double role").
- **Verification**: `tsc --skipLibCheck false` once, to prove no declaration-owner package is missing (`DSH-0.1.2-A2-03` field note); then the normal policy config; grep for `dsh-client-runtime` → zero hits in source **and** manifests.
- **Cards**: `DSH-0.1.2-A1-25`, `DSH-0.1.2-A1-03`, `R-11`, ledger `API-10`.

### S2 · `ConversationSnapshot` type gone

- **Evidence**: `src/client/Pet.tsx:8` — `import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'`; used at `:13` as the `isThinking` parameter.
- **How it breaks**: same deleted package. Note the *type name itself* is not remapped row-for-row by the ledger: `API-10`/`DSH-0.1.2-A1-25` map `ConversationNode` → `dsh-client-ui-conversation/client`, and the snapshot container to the **chat view** snapshot (`DSH-0.1.2-A1-03`). Keep the mapping at the layer it belongs to instead of inventing a substitute import path.
- **Target form**: type the selector against the chat projection for the staged step, and against `ChatSnapshot` for the alpha.2-only primary read:

```ts
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client' // if a SessionBinding read is added
```

- **Verification**: no import of `dsh-client-runtime` anywhere; `ChatSnapshot` resolves from the packed `.d.ts` of `dsh-client-ui-chat` (check `exports` **and** the packed file list — `API-07`), not only from a source checkout.
- **Cards**: `DSH-0.1.2-A1-25`, `DSH-0.1.2-A1-03`, `R-11`, ledger `API-10`.

### S3 · Flat conversation-snapshot reads (`partial`, `runningCalls`, `turnEnds`)

- **Evidence**: `src/client/Pet.tsx:13-15` (`snapshot.partial?.blocks.some(block => block.kind === 'reasoning')`), `:21` (`s.runningCalls.length > 0`), `:23` (`s.turnEnds[s.turnEnds.length - 1]?.reason`); `:20` passes the same selector shape into `useSession`.
- **Old form**: one flat `ConversationSnapshot` carrying `nodes / partial / runningCalls / turnEnds` read through `useSession(selector)`.
- **How it breaks**: 0.1.2 no longer exposes a per-session conversation-node snapshot — the timeline became an internal projection **of each view package** (`DSH-0.1.2-A1-03`, `DSH-0.1.2-A1-27`). The selectors return `undefined`/empty, so the pet freezes on `idle` exactly as if the model were never thinking; nothing throws where the user can see it. At the type level the selector parameter is no longer `ConversationSnapshot` (`S2`), so the compiler may not even catch it.
- **Target form — step 1, compatibility projection (runs first, single pass)**:

```tsx
// per-view projection; documented staged-compatibility surface (DSH-0.1.2-A1-03)
const projection = useChat(chat => chat?.legacy ?? EMPTY_PROJECTION)
const thinking   = projection.partial?.blocks.some(b => b.kind === 'reasoning') ?? false
const toolRunning = projection.runningCalls.length > 0
// turn end: readable in the legacy projection, but the real home is the chat turn timeline
const lastTurnEnd = useChat(chat => chat?.timeline?.turns.at(-1)?.endReason)
```

- **Target form — step 2, alpha.2 primary read (field-by-field)**:

```ts
function orderedNodes(chat: ChatSnapshot) {
  return chat.order.flatMap(id => {
    const node = chat.nodes.get(id)
    return node ? [node] : []
  })
}
// assistant step: narrow the discriminant, then read data.finalNode
```

- **Precision caveats (do not guess these at write time)**: `useChat` arrives either as a slot standard prop or as `ctx.useChat` on the plugin Context (`API-10` shows the `ctx.useChat` form); the exact `timeline` member names for a finished turn are **not** pinned by any card in this corridor — pin them from the target `ui-chat` slot/snapshot contract before writing them. `legacy` is staged compatibility only and must not become the permanent data surface (`API-10` explicitly); `chat.nodes` is a keyed store, so test fixtures must supply `get/values` and define order through `order`, not `nodes: []`.
- **Verification**: with one live session, drive thinking → tool call → settled turn and assert the three frames in order; empty/unknown session returns the empty projection instead of throwing; unit test the missing-id branch of `nodes.get`.
- **Cards**: `DSH-0.1.2-A1-03` (field notes: the four legacy fields + "`running` is not in the projection"), `R-11`, ledger `API-10`.

### S4 · `running` is a lifecycle read and must stay off the projection

- **Evidence**: `src/client/Pet.tsx:19` — `const running = useSession(s => s.running)`.
- **Finding**: this is the **one selector that does not move**. Lifecycle fields are not part of the chat view projection; they are read through the `useSession` seat (`DSH-0.1.2-A1-03` field note; the fleet record states the same split — "`running` and friends go through the `useSession` seat"). It works today and keeps working, but it is also the constraint that forbids "just move all four selectors to `legacy`" as a final state: `running` has no projection fallback at all.
- **Target form**: unchanged call, but the component must combine the two hooks (`useSession` for lifecycle, `useChat` for content/timeline) — `PetProps` composes both from the slot's standard props.
- **Cards**: `DSH-0.1.2-A1-03`.

### S5 · `dsh.client.inject` must be recomposed (manifest key **and** phantom dependency)

- **Evidence**: `package.json:6-9`:

```json
"client": { "platform": "web",
  "inject": ["dsh-client-runtime", "dsh-client-ui-conversation", "dsh-client-locale"] }
```

- **Two distinct defects**:
  1. **Wrong key.** The browser half must be declared at `dsh.client` (`DSH-0.1.1-R1-02`: `dshClient`-era field merged into `dsh.client`; `DSH-0.1.1-R1-03`: `client-modules` scans **only** packages declaring `dsh.client`). A top-level `client` object is not read by the scanner or by the lint, so the client half never enters the roster — silent disappearance, no Node-half error. Measured consequence in this pass: `inject-lint.mjs` reports `declaredInject: []`.
  2. **Runtime phantom.** `dsh-client-runtime` no longer exists; keeping it in `inject` leaves the assembly row `pending`/out of the boot graph even after the key is fixed (`DSH-0.1.2-A1-25` — verified field note: "with the runtime package left in inject the row did not enter the graph").
- **Target form** (values are **bare package names**, no `@deepseek-ai/` prefix — as the current file already does):

```json
{
  "name": "@demo/dsh-bench-pet",
  "dsh": {
    "client": {
      "platform": "web",
      "inject": ["dsh-client-ui-slots", "dsh-client-ui-conversation", "dsh-client-locale"]
    }
  }
}
```

- **Why these three**: `inject` records *runtime module* dependencies, resolved from product shape — "mounts into a host slot point" → `@deepseek-ai/dsh-client-ui-slots`; "own strings / i18n" → `@deepseek-ai/dsh-client-locale`; the slot this entry occupies is declared by `ui-conversation`, so that row stays (precision checklist "`dsh.client.inject` is an exact recomposition, not a subset"). Do **not** add `dsh-client-ui-renderer` to `inject` on the strength of the type-only import; if the target host's module table attributes the `slots` *service* to `ui-renderer`, confirm it against `__DSH_BOOT__`/the module table first and record the measurement.
- **Verification**: `dsh --profile <p> --dump-config` shows the row with no `pending` and the row `name` is the bare package name; the boot manifest `entries` contains `"id":"@demo/dsh-bench-pet"`; `inject-lint.mjs` returns no `runtimeRefsLeft` and no `peersMissingForInject`.
- **Cards**: `DSH-0.1.1-R1-02`, `DSH-0.1.1-R1-03`, `DSH-0.1.2-A1-25`, `DSH-0.1.2-A1-26`.

### S6 · No peer/dependency ownership for the declared types

- **Evidence**: `package.json` ships no `peerDependencies`, no `devDependencies`, no `engines` — for a plugin whose source consumes `cordis`, `ui-slots`, `ui-conversation`, `locale` types.
- **How it breaks**: `DSH-0.1.2-A2-03` + its 2026-08-31 field note: a packed package's `devDependencies` are **not** passed to consumers, and `ui-chat` declarations reference `dsh-client-store`, UI primitives, session/commands/conversation. With `skipLibCheck: true` the missing owner does not surface as a dependency error — it turns `useChat` selectors and callbacks into **implicit `any`**. Also `DSH-0.1.2-A1-25`: the cohort must stay exact and coherent in `package.json` **and** the lockfile.
- **Target form**: `peerDependencies` on the cohort floor (`^0.1.2-alpha.2`) for every package whose types/services are touched — a **superset** of `dsh.client.inject`: `@deepseek-ai/cordis@^4.0.1` (exact caret — `^4.0.2` is a miss), `dsh-client-ui-slots`, `dsh-client-ui-conversation`, `dsh-client-locale`, `dsh-client-ui-chat` (`ChatSnapshot`), `dsh-client-ui-renderer` (`ctx.slots` declarations), `dsh-llm` (`ContentBlock`). Keep the flags in `peerDependenciesMeta.optional` truthful.
- **Best practice**: while the alpha cohort may be unpublished, point type dependencies at the official source checkout with `link:` or tarball `overrides` (`R-01`) — `R-01` must be cited whenever the migration touches peer floors or the cohort, not only for unpublished installs.
- **Verification**: fresh install with the repository's single package manager + frozen lockfile; `tsc --skipLibCheck false` clean; a full lockfile scan shows no old cohort and no `dsh-client-runtime`.
- **Cards**: `DSH-0.1.2-A2-03` (+ field note), `DSH-0.1.2-A1-25`, `R-01`.

### S7 · Slot registration: wait on the declaration, not only on the service

- **Evidence**: `src/client/index.ts:38-43` — `ctx.inject(['slots','conversation'], scope => scope.slots.register({ name: 'conversation.session.header.actions', id: 'pet', order: 10 }, Pet))`. The in-file comment already states the underlying constraint ("register() into an undeclared slot throws").
- **How it breaks**: cross-package apply order is unconstrained. The `conversation` **service** being available does not prove `ui-conversation`'s `apply` has already declared the `header.actions` entry; when that order flips, the apply throws `slot "<name>" is not declared` and — because it throws inside `apply` — the whole `ctx.effect` (the locale registration at `:36`) never runs.
- **Target form**:

```ts
ctx.slots.inject('conversation.session.header.actions', () =>
  ctx.slots.register(
    { name: 'conversation.session.header.actions', id: 'pet', order: 10 },
    Pet,
  ),
)
```

  Keep the service-level `ctx.inject(['slots','conversation'], …)` as the availability edge if the bundle still needs it; the declaration-level wait is what removes the ordering hazard. The registration object shape `{ name, id, order }` is unchanged.
- **Also verify**: the **slot id itself**. `DSH-0.1.2-A1-03` (session-view internals split) and `DSH-0.1.2-A1-28`'s field note both say slot names/panel ids are authoritative only from the target `packages/client/ui-*` source — no card in this corridor renames `conversation.session.header.actions`, so it is *unverified*, not *proven stable*. Mark it as a runtime-verify item rather than rewriting it from memory.
- **Cards**: `DSH-0.1.2-A1-03`, ledger `API-10` (context/slot base augmentation).

### S8 · `LocaleNamespaceMap` augmentation: keep both halves, re-point the declaring module

- **Evidence**: `src/client/index.ts:14-19` (`declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { pet: PetKey } }`) **paired with** `:36` (`ctx.effect(() => ctx.locale.register('pet', { zh, en }), 'pet: dictionaries')`).
- **Status**: the **pairing is already correct** — type-level augmentation *and* runtime registration, which the precision checklist makes mandatory for any plugin shipping user-facing text. The risk is only the augmentation's target module: `LocaleNamespaceMap` is consumed by `PropsLocale`, and after the client split the owning package is the one that declares it at the target tag (`dsh-client-ui-slots` vs. the locale package). If it moved, the augmentation merges into nothing and `t('idle')` silently widens to `string`/never type-errors on a typo.
- **Target form**: keep the runtime call as is; keep the augmentation, but confirm the declaring module from the target `.d.ts` and keep that package in `peerDependencies`.
- **Verification**: a deliberate bad key (`t('idle-typo')`) must fail typecheck; the `zh`/`en` dictionaries must both resolve at runtime.
- **Cards**: precision checklist ("Locale namespaces are declared, not implied"); `DSH-0.1.2-A1-25` for the ownership move.

### S9 · `ContentBlock` values without an `dsh-llm` peer

- **Evidence**: `src/client/Pet.tsx:14` — `block.kind === 'reasoning'` narrows a content block coming out of `partial.blocks`.
- **Finding**: this cohort moved the `ContentBlock`-family declarations into `@deepseek-ai/dsh-llm`; touching those values requires that package in `peerDependencies` (precision checklist "Peer dependency completeness"; `DSH-0.1.2-A2-03`). Without it, the discriminant narrows to `any` and a future block-kind rename cannot be caught.
- **Target form**: add `"@deepseek-ai/dsh-llm": "^0.1.2-alpha.2"` to peers (types only — not a `dsh.client.inject` row), and keep the discriminant read local:
  `const isReasoning = (b: ContentBlock) => b.kind === 'reasoning'`.
- **Cards**: `DSH-0.1.2-A2-03`; precision checklist.

### S10 · Registration identity and bundle packaging

- **Evidence**: `cordis.patch.yml:1-3` inserts row `{ id: bench-pet, name: '@demo/dsh-bench-pet' }`; `package.json:2` `"name": "@demo/dsh-bench-pet"`; no client bundle source in the fixture.
- **Finding (mostly clean)**: `DSH-0.1.2-A1-26` requires three ids to agree, baseline = `package.json.name`: (1) the client bundle's `__ModuleLoader__.load({ id })` (usually injected by the tsdown banner `PLUGIN_ID`), (2) the assembly row `name` — **already the bare package name, correct**, (3) `package.json.name`. Item (1) cannot be checked here because the bundle is not in the fixture; if it was built with a short id (`pet`/`bench-pet`) the host asserts `loaded without registering "<id>"` or the panel silently vanishes.
- **Target form**: build the client bundle so the registration id is exactly `"@demo/dsh-bench-pet"`; keep the row `name` bare; if the plugin is published as a bundle, `dsh.bundle.patch` must point at an in-package relative path and the `cordis.patch.yml` must be in the packed artifact (`API-08`; `API-07` export ≠ artifact presence).
- **Verification**: `__DSH_BOOT__.entries` contains `"id":"@demo/dsh-bench-pet"`; the combo route `/plugins/??@demo/dsh-bench-pet/client.js&rev=…` returns the module with the matching `load({ id })`; no `loaded without registering` in the startup log.
- **Cards**: `DSH-0.1.2-A1-26`, `API-08`, `API-07`.

---

## 5. Card map (full IDs used above)

| Card | Why it is cited here | Hit surfaces |
|---|---|---|
| `DSH-0.1.2-A1-25` | `@deepseek-ai/dsh-client-runtime` removed; client symbols migrated by domain; remove the phantom from `dsh.client.inject` | S1, S2, S5, S6, S8 |
| `DSH-0.1.2-A1-03` | Session view internals split; flat snapshot fields readable only through the per-view `legacy` projection; lifecycle stays on the `useSession` seat | S1, S2, S3, S4, S7 |
| `DSH-0.1.2-A1-26` | client-modules scan contract: registration id == row name == `package.json.name` | S5, S10 |
| `DSH-0.1.1-R1-02` | manifest field `dshClient` → `dsh.client` | S5 |
| `DSH-0.1.1-R1-03` | `client-modules` enumerates only `dsh.client`-declaring packages | S5 |
| `DSH-0.1.2-A2-03` | peer trimming; direct type-owner dependencies; `skipLibCheck: false` diagnostic run | S6, S9 |
| `R-01` | cohort/peer-floor and unpublished-cohort install path | S5, S6 |
| `R-06` | pre-migration baseline attribution (recorded as "not collected") | `2 |
| `R-11` | 0.1.2 type-surface export drift (`ClientContext`/`ConversationNode`/`CommandRowProps`; `useSession` + `nodes[]`) | S1, S2, S3 |
| `API-10` (ledger) | exact rc.2→alpha.2 mapping for the client runtime, keyed chat snapshots, `useChat` minimal read shape | S1, S2, S3, S7 |
| `API-07` / `API-08` | export ≠ artifact presence; `cordis.patch.yml` is composition, not a source patch | S10, `3 #1 |
| `DSH-0.1.2-A1-27` | durable event window — cited as the *alternative* content-read seam, **not hit** here | `7 |
| `DSH-0.1.2-A2-04` | `dsh web` empty client graph on Node 24.0–24.11.1 — verification-environment risk only | `8 |

Corridor fold note (net state, not step-by-step): `dsh-client-runtime` is removed at alpha.1 and never returns; `SessionEvent.ignorable` is removed at alpha.1 (`DSH-0.1.2-A1-02`) and restored at alpha.2 (`DSH-0.1.2-A2-01`) — this plugin produces no session events, so the net state is "no event migration", and the trap of deleting-then-re-adding a producer marker does not apply. The rc.1→rc.2 edge (`DSH-0.1.1-R2-01/02/03`) is image/attachment-only: no hit.

---

## 6. Which fields can run first through a compatibility projection, and which must switch immediately

The migration is **not** one uniform "rewrite all selectors" job. Three different classes exist, and mixing them is what produces a plugin that boots but animates wrongly.

| Field / surface | Where it lives on alpha.2 | Compatibility projection? | Earliest allowed state | Why |
|---|---|---|---|---|
| `partial` (`partial.blocks`, thinking) | chat view projection | **Yes** — `views.get('chat')?.legacy.partial` | step 1 (compat) | flat legacy field retained for staged compatibility (`DSH-0.1.2-A1-03` field note; ledger `API-10`) |
| `runningCalls` (tool in flight) | chat view projection | **Yes** — `…legacy.runningCalls` | step 1 (compat) | same |
| `nodes` (not read here today) | chat view projection | **Yes** — `…legacy.nodes` | step 1, but must not become primary | `API-10`: alpha.2-only code must not treat `legacy.nodes` as the primary data surface |
| `turnEnds` (settle frame) | chat **turn timeline** | Partly — readable in `legacy`, but `chat.timeline` is the real home | step 1 for boot, **step 2 mandatory** | the fleet migration moved turn-end detection to the new timeline; turn semantics are exactly what drifts silently |
| `running` (lifecycle) | session lifecycle | **No — none exists** | immediate | not in the projection at all; must use the `useSession` seat (`DSH-0.1.2-A1-03`) |
| `ConversationSnapshot` / `ClientContext` types | removed package | **No** | immediate | the package is gone; a type cannot be projected |
| `dsh-client-runtime` in `dsh.client.inject` | packaging | **No** | immediate | a phantom keeps the row out of the boot graph; nothing runs until it is removed |
| `"client"` manifest key | packaging | **No** | immediate | not scanned; the browser half is never enumerated |

**Ordered work plan** (each step independently verifiable, no step re-does another):

1. **Immediate / no behavior change**: manifest key `dsh.client` + inject recomposition (S5), peer block (S6/S9), type imports `Context`/`ChatSnapshot` (S1/S2), `ctx.slots.inject` hardening (S7). Nothing here can be "compat-projected"; the plugin is simply not admitted before it.
2. **Boot pass (step 1 of the two-step read migration)**: move `partial`/`runningCalls`/`turnEnds` onto `views.get('chat')?.legacy` + keep `running` on `useSession`. This restores animation on alpha.2 with the smallest diff and gives a working baseline for the next step.
3. **Semantic pass**: move turn-end detection to `chat.timeline` and pin the exact member names from the target contract (S3).
4. **Primary-surface pass**: replace `legacy.nodes`-style reads with `useChat` + `chat.order`/`nodes.get(id)`, covering the missing-id branch — leaving `legacy` only if the plugin must also run on the 0.1.1 line, in which case branch by feature detection and do not share one file between cohorts.
5. **Release identity**: bump the plugin's own SemVer (`0.1.0` → its own next version) separately from the host cohort, and extend the README compatibility matrix.

**Rule of thumb**: a field may use the compatibility projection **only if a card names it as projection-backed**. Anything that is a *type*, a *manifest declaration*, or a *lifecycle field* has no projection and is immediate work.

---

## 7. Skipped / non-hits (with evidence)

| Candidate surface | Verdict | Evidence |
|---|---|---|
| `DSH-0.1.2-A1-27` SessionBinding durable event window | not hit | no `sessions.binding`, no `sessionOf`, no `getSnapshot().nodes`; the pet reads the live snapshot only. If a later feature needs historical message text, this card is the seam to use |
| `DSH-0.1.2-A1-30` `ctx.connection.api` removal | not hit | no `connection.api` reference anywhere in `fixture/` |
| `DSH-0.1.2-A1-01` / `DSH-0.1.2-A2-02` Remote/APIProxy | not hit | no `ctx.remote`, no `RemoteResult`, no error-code branching |
| `DSH-0.1.2-A2-05` `agentPresets` inventory field · `DSH-0.1.2-A2-06` `$host` facts · `DSH-0.1.2-A2-10` `settingsNamespace` | not hit | no inventory decode, no host facts, no host-side settings |
| `DSH-0.1.2-A2-08` `sessionProjections` inject | not hit | no Host half, no tool packages |
| `DSH-0.1.2-A1-02` / `DSH-0.1.2-A2-01` `SessionEvent.ignorable` | not hit | no `SessionEventMap` augmentation, no `Session.append` |
| `DSH-0.1.2-A1-28` composer `textarea`→contenteditable · `DSH-0.1.2-A1-29` `MarkdownText` labels · `DSH-0.1.2-A1-32` `ctx.uiWorkspace` · `DSH-0.1.2-A1-08` channel auth · `DSH-0.1.2-A1-19` web acceptance | not hit / verification-only | no composer DOM work, no Markdown labels, no workspace navigation, no `webServer` route. `A1-19` still supplies the *procedure* for step 4 verification |
| `DSH-0.1.1-R1-06` session-event `kind`→`type` | not hit | `Pet.tsx:14` `block.kind` is a ContentBlock discriminant, not an event envelope field — do not "fix" it |
| `cordis.patch.yml` as a source patch | not hit by design | profile composition overlay (`API-08`), and the insert row `name` is already the bare package name |

---

## 8. Pending / residual risk

1. **Slot id `conversation.session.header.actions`** — no card in this corridor renames or removes it, and none guarantees it. Must be confirmed against the target `packages/client/ui-conversation/src/client/contract/slots.ts` or a runtime `slots.entries()` probe before being declared stable (`A1-03`, `A1-28` field note: authoritative source is the target tag, not 0.1.1 memory).
2. **`chat.timeline` member names for a finished turn** — not pinned by any card read here; `turnEnds` semantics (end reason → settle frame) must be re-derived from the target timeline contract, not guessed.
3. **`LocaleNamespaceMap` declaring module** — verify from the target `.d.ts` (`S8`).
4. **No build/typecheck/boot executed** (read-only brief, trimmed fixture): the static layer is complete, the compile layer, Loader layer, and behavior layer are **not** measured. Per house rule these three are different completion states and must not be conflated.
5. **Verification environment**: `dsh web` on **Node 24.0–24.11.1** starts with an empty `__DSH_BOOT__.entries` client graph (`DSH-0.1.2-A2-04`) — this would look exactly like the `DSH-0.1.2-A1-26` symptom and mislead the migration. Pin the verification matrix to Node 24.9 / 24.12+ / 22 LTS.
6. **Host-self safety (`R-12`)**: if the upgrade target turns out to be the host currently serving the session, do not restart/replace it from inside; hand the external procedure to the maintainer.
7. `Pet.tsx:24-31` has a non-migration hygiene defect: `frame.current` is written in an effect and read during render, so the DOM attribute never re-renders (and `void lastTurnEnd as CSSProperties` is a no-op cast). Fix it while the selectors are being rewritten, but do not bill it to the upgrade.

---

## 9. Validation ladder (ready to run once the upgrade is authorized)

1. **Static**: `rg -n "dsh-client-runtime" src package.json` → empty; `node scripts/inject-lint.mjs <plugin>` → no `runtimeRefsLeft`, no `peersMissingForInject`, `cordisOk: true`; full lockfile scan for the old cohort and the removed package.
2. **Typecheck**: one `tsc --skipLibCheck false` pass to expose missing declaration owners (`DSH-0.1.2-A2-03` field note), then the repository's normal policy; zero new implicit `any`.
3. **Unit**: selectors against a real `ChatNodeStore` shape (`order` + keyed `get`), covering a missing id and the `assistant-step` `data.finalNode`; the `legacy` projection branch and the empty-projection branch.
4. **Artifact**: `pack` → packed filename and packed manifest both carry the plugin's own version; `dsh.client` present in the **packed** manifest; if bundle-published, the `cordis.patch.yml` is in the tarball (`API-07/08`).
5. **Runtime (Web)**: isolated profile cold boot → token URL → cookie → boot manifest `entries` → advertised client artifact 200 → registration/mount → remove (`DSH-0.1.2-A1-19`); no `pending` rows.
6. **Behavior**: one live session, thinking → tool call → settled turn; assert `data-frame` goes `thinking` → `working` → `idle`/celebrate and that the frame matches what the transcript shows.
7. **Teardown**: uninstall/removal leaves no `pending (waiting for service: slots)` and no `loaded without registering` residue.

---

## 10. Rollback / baseline record

- **Read-only pass**: nothing was changed, so there is nothing to roll back. The fixture is byte-identical (only `read`/`grep`/`glob` and one read-only lint process ran).
- **Baseline for the future code change**: `@demo/dsh-bench-pet@0.1.0`, 6 files, no lockfile (there is none to preserve). The SHA-256 prefixes in section 2 are the gate: re-hash before editing, and if anything differs, the scan baseline is stale. When the real migration starts, capture the package manager's lockfile + the composition files first, and change only `package.json`, `src/client/index.ts`, `src/client/Pet.tsx` — `locales.ts`, `README.md`, and the `cordis.patch.yml` row are expected to stay untouched.

---

## 11. Method and sources

- Corridor built from `from → to` metadata, never filename order: `v0.1.1-rc.2.md` (3 cards), `v0.1.2-alpha.1.md`, `v0.1.2-alpha.2.md`, plus `api-migration-0.1.2-alpha.2.md` (`API-10` exact mapping) and `rollup-0.1.2.md` (`R-01/R-06/R-11/R-12`).
- Cards are a curated list, not a complete API diff: surfaces with no card (slot id, timeline member names, `LocaleNamespaceMap` owner) are marked *pending verification* above instead of being rewritten from memory.
- Only key points and card IDs are reproduced here; the primary source, exact mapping tables, and code samples live in the skill references at the target tag.
- Read-only discipline: `fixture/` unchanged; no `git`, no install, no network, no host boot, no lifecycle script. The one executable artifact was the shipped read-only `inject-lint.mjs` scan, whose output is quoted in `2`/`S5`.
