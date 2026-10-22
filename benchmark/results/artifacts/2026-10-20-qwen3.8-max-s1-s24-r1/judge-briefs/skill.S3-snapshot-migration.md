# JUDGE BRIEF · skill.S3-snapshot-migration

## Criteria (sealed rubric)
- [chat-projection] (20pt) Locate Pet.tsx partial/runningCalls/turnEnds reads. Explain their temporary chat legacy projection and subsequent views/timeline or target-owned Chat access. Accept a supported direct migration when it explains the compatibility option; merely saying legacy is insufficient.
- [session-lifecycle] (20pt) Locate running in Pet.tsx and explain it belongs to the Session/useSession lifecycle seat, outside chat legacy. Do not claim the existing useSession call itself must be renamed for running.
- [type-and-inject] (20pt) Locate removed dsh-client-runtime imports and the package.json client.inject entry. Repoint Context as ClientContext to scoped cordis and snapshot types to their target owner; do not claim every snapshot type is exported by cordis. Unknown exact snapshot symbols may be explicitly deferred to target exports.
- [slot-registration] (20pt) Locate the scoped slots.register call in index.ts. Explain slots.inject around registration and the ui-renderer/client Context augmentation/service ownership; preserve the slot name and lifetime. Accept equivalent supported registration forms.
- [mapping-and-plan] (20pt) Tie the located snapshot/lifecycle/slot changes to full DSH-0.1.2-A1-03 and separate temporary projection from immediate type/inject/lifecycle changes. A1-25 is a valid additional package-removal card. A bare card ID earns zero.

## Caps (score ceilings; judge returns each with triggered true/false)
(none)

## Candidate report(s)
#### FILE: S3-snapshot-migration/_evidence-fixture-hash-after.txt

fixture hash re-verification (sha256)
OK  cordis.patch.yml
OK  package.json
OK  README.md
OK  src/client/index.ts
OK  src/client/locales.ts
OK  src/client/Pet.tsx
UNCHANGED: true


#### FILE: S3-snapshot-migration/_evidence-inject-lint.json

{
  "importedClientModules": [
    "@deepseek-ai/dsh-client-locale",
    "@deepseek-ai/dsh-client-ui-conversation",
    "@deepseek-ai/dsh-client-ui-slots"
  ],
  "declaredInject": [],
  "peersMissingForInject": [],
  "peersMissingForImports": [
    "@deepseek-ai/dsh-client-locale",
    "@deepseek-ai/dsh-client-ui-conversation",
    "@deepseek-ai/dsh-client-ui-slots"
  ],
  "cordisPeer": null,
  "cordisOk": false,
  "runtimeRefsLeft": [
    "E:\\deepseek-harness\\dsh-plugin-upgrade-skill\\benchmark\\results\\artifacts\\2026-10-20-qwen3.8-max-s1-s24-r1\\skill\\S3-snapshot-migration\\fixture\\src\\client\\index.ts",
    "E:\\deepseek-harness\\dsh-plugin-upgrade-skill\\benchmark\\results\\artifacts\\2026-10-20-qwen3.8-max-s1-s24-r1\\skill\\S3-snapshot-migration\\fixture\\src\\client\\Pet.tsx"
  ],
  "rawWebServerRouteFiles": [],
  "routeReviewRequired": false,
  "verdict": "FIX-REQUIRED"
}


#### FILE: S3-snapshot-migration/_evidence-plan-migration.txt

# DSH plugin migration plan (read-only)

- Corridor: `dsh-v0.1.1-rc.1` → `dsh-v0.1.2-alpha.2`
- Target: `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-20-qwen3.8-max-s1-s24-r1\skill\S3-snapshot-migration\fixture`
- Scanned files: 5
- This is a heuristic plan, not compatibility proof. No target file was modified.
- Scanned code and config files only (no Markdown); hits list src/ code first, other code next, config last.

## Touchpoints

| ID | Name | Source | Hits (shown/total) |
|---:|---|---|---:|
| #1 | source patch / monkey patch | none | 0/0 |
| #2 | internal event names and persistent events | none | 0/0 |
| #3 | internal service probes / Remote | none | 0/0 |
| #4 | direct host directory reads/writes | none | 0/0 |
| #5 | internal UI / commands / tool registration | detected | 3/3 |
| #6 | custom HTTP / WS / RPC / DOM / CSS channels | none | 0/0 |
| #7 | subprocess / stdout / stderr parsing | none | 0/0 |

## Hit locations

- #5 `src/client/index.ts:6` (pattern 2)
- #5 `src/client/Pet.tsx:7` (pattern 2)
- #5 `package.json:8` (pattern 2)

## Corridor card sets

- `dsh-v0.1.1-rc.1` → `dsh-v0.1.1-rc.2`: `v0.1.1-rc.2.md` (curated)
- `dsh-v0.1.1-rc.2` → `dsh-v0.1.2-alpha.1`: `v0.1.2-alpha.1.md` (curated)
- `dsh-v0.1.2-alpha.1` → `dsh-v0.1.2-alpha.2`: `v0.1.2-alpha.2.md` (curated)

## Applicable cards

- **DSH-0.1.1-R2-01** (behavior/conditional, `v0.1.1-rc.2.md`) — Image attachment refs gain original dimensions
- **DSH-0.1.1-R2-02** (behavior/conditional, `v0.1.1-rc.2.md`) — `read_image` output exposes scaling facts and changes prompt text
- **DSH-0.1.1-R2-03** (behavior/conditional, `v0.1.1-rc.2.md`) — DeepSeek image requests prefer the Files API and keep a fallback path
- **DSH-0.1.2-A1-03** (breaking/required-if-hit, `v0.1.2-alpha.1.md`) — Session view internals split up extensively
- **DSH-0.1.2-A1-06** (breaking/required-if-hit, `v0.1.2-alpha.1.md`) — Code Mode renamed precisely to PTC mode
- **DSH-0.1.2-A1-09** (capability/optional, `v0.1.2-alpha.1.md`) — New capability: model settings page can integrate provider login configuration
- **DSH-0.1.2-A1-10** (capability/optional, `v0.1.2-alpha.1.md`) — New capability: support for registering third-party languages
- **DSH-0.1.2-A1-11** (capability/optional, `v0.1.2-alpha.1.md`) — New capability: subagents can select provider/model/reasoning effort/output cap
- **DSH-0.1.2-A1-25** (breaking/required-if-hit, `v0.1.2-alpha.1.md`) — `@deepseek-ai/dsh-client-runtime` package removed, client symbols migrated by domain
- **DSH-0.1.2-A1-26** (breaking/required-if-hit, `v0.1.2-alpha.1.md`) — client-modules scan contract: registration id must equal the package.json name
- **DSH-0.1.2-A1-28** (breaking/required-if-hit, `v0.1.2-alpha.1.md`) — composer edit surface changed from `<textarea>` to a contenteditable DIV
- **DSH-0.1.2-A1-29** (breaking/required-if-hit, `v0.1.2-alpha.1.md`) — `MarkdownText` labels changed to a required nested shape (ui-primitives)
- **DSH-0.1.2-A1-32** (breaking/required-if-hit, `v0.1.2-alpha.1.md`) — `IWorkspaces` navigation methods moved to `ctx.uiWorkspace`
- **DSH-0.1.2-A2-05** (behavior/conditional, `v0.1.2-alpha.2.md`) — Plugin inventory returns optional Agent Preset grouping

## Manual review cards

- **DSH-0.1.2-A1-12** (privacy/informational) — Official DeepSeek adapter attaches plugin package name and version by default
- **DSH-0.1.2-A1-23** (privacy/conditional) — base composition: two default changes — session telemetry defaults to `FEEDBACK_ONLY`, plus a new plugin package-name reporting row
- **DSH-0.1.2-A1-24** (behavior/required-if-hit) — `dsh-llm-pi-ai` bumps `@earendil-works/pi-ai` from 0.82 to 0.84; plugins that depend on it directly get a second instance
- **DSH-0.1.2-A2-03** (behavior/conditional) — NPM packages trim unneeded peer dependencies


#### FILE: S3-snapshot-migration/migration-assessment.md

# S3 · Snapshot Read-Surface Migration Assessment — `@demo/dsh-bench-pet`

**Task**: read-only migration assessment (Mode A · inspect, per the `plugin-upgrade` skill). The fixture stays untouched; this report is the deliverable. No migration, installation, or code change was executed.

- **Plugin**: `@demo/dsh-bench-pet` v0.1.0 (private, Web Client browser-pet plugin; pixel pet in the session header, animation driven by the live conversation snapshot)
- **Source era (corridor `from`)**: dsh **0.1.1-rc.1**
- **Host target (corridor `to`)**: dsh **0.1.2-alpha.2**
- **Corridor edges used** (connected by `from → to` metadata, not filename order):
  1. `dsh-v0.1.1-rc.1 → dsh-v0.1.1-rc.2` — 3 cards (`DSH-0.1.1-R2-*`, all image-surface; **non-hit**, see §4)
  2. `dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.1` — 28 cards (`DSH-0.1.2-A1-*`)
  3. `dsh-v0.1.2-alpha.1 → dsh-v0.1.2-alpha.2` — 8 cards (`DSH-0.1.2-A2-*`)
  - Net-state rule applied across the corridor (e.g. **DSH-0.1.2-A1-02** removes `SessionEvent.ignorable`, **DSH-0.1.2-A2-01** restores it → net: no action for this plugin, which produces no SessionEvents at all).
- **Availability of the target cohort**: per rollup **R-01** (npm reality, measured 2026-08-31), `0.1.2-alpha.2` **is published on npm** (alpha.1 never was). Query the registry first; `link:`/`file:` tarball overrides are only a fallback if a cohort package is missing.
- **Face**: Web Client (browser) plugin half only; no host-plane code, no Remote/apiProxy, no custom channels, no subprocess.

---

## 1. Touchpoint checkup (@demo/dsh-bench-pet, dsh-v0.1.1-rc.1 → dsh-v0.1.2-alpha.2)

Read-only scan of all 6 fixture files (planner + inject-lint evidence in §7; manual line-level review of every source file).

| Touchpoint | Hit | File/line | Applicable card | Confidence note |
|---|---:|---|---|---|
| #1 source patch | no | `cordis.patch.yml` is profile **composition**, not a source patch (API-08) | — | full-file review |
| #2 events | no | no SessionEvent producer/consumer, no code-mode tokens | — | full-file review |
| #3 services/Remote | no | no `apiProxy`/`ctx.remote`/`ctx.connection.api`; the service inject list is handled under #5 | — | full-file review |
| #4 host filesystem | no | — | — | full-file review |
| #5 UI/commands/tools | **yes** | `package.json:6-9`; `src/client/index.ts:6,8-10,29,36,38-43`; `src/client/Pet.tsx:7-8,10,13-15,19-23` | DSH-0.1.2-A1-03, DSH-0.1.2-A1-25, DSH-0.1.2-A1-26, DSH-0.1.2-A2-03; ledger API-10, R-11 | planner auto-hits: `index.ts:6`, `Pet.tsx:7`, `package.json:8`; rest from manual review |
| #6 custom channel/DOM | no | no `webServer` routes (inject-lint `rawWebServerRouteFiles: []`), no composer DOM manipulation | — | full-file review |
| #7 subprocess/output | no | — | — | full-file review |

No-hit notes: scan covered the whole fixture (5 code/config files + README); zero hits are heuristic, so dependency/manifest surfaces were checked separately (inject-lint) and are covered in §2/§5.

---

## 2. Breaking surfaces, post-migration form, and card mapping

Ordered by file. "Symptom" distinguishes the static (typecheck) layer from the runtime layer — the two fail differently here.

### B-1 · `package.json:6-9` — client declaration block (three distinct defects)

**(a) `dsh-client-runtime` inside the client `inject` list (line 8)**

- Old form: `"inject": ["dsh-client-runtime", "dsh-client-ui-conversation", "dsh-client-locale"]`
- How it breaks: the package was **deleted from `packages/client` in alpha.1** → it is a runtime *phantom dependency*: the assembly row never enters the boot graph / stays `pending` forever, typically **with no explicit error** (pet silently never appears). Card: **DSH-0.1.2-A1-25** (removal + `dsh.client.inject` cleanup); symptom row in the skill's troubleshooting table ("panel silently disappears").
- Target form: drop the entry; recompose inject with only real runtime-module edges (see (b)/(c) and §5 for the full manifest):
  `"inject": ["dsh-client-ui-chat", "dsh-client-locale"]` — plus `dsh-client-ui-conversation` **only if** the tag check in B-6 confirms it is still a runtime edge for this plugin. `dsh.client.inject` is an exact recomposition, not a subset (precision-checklist); the field-verified precedent for this exact product shape (slot + chat snapshot) keeps `dsh-client-ui-chat` (Example 06, dsh-ui-whale).

**(b) the declaration sits under a bare top-level `"client"` key (line 6)**

- How it breaks: since the 0810/rc.1 baseline the host reads **only `dsh.client`**, and client-modules enumerates browser plugins **only by the `dsh.client` declaration** — cards **DSH-0.1.1-R1-02** (`dshClient` merged into `dsh.client`) and **DSH-0.1.1-R1-03** (scan contract), carried forward by **DSH-0.1.2-A1-26** (boot manifest keys entries by package name). Corroborating evidence: the skill's own alpha.2 checker (`inject-lint.mjs`) reads `pkg.dsh.client.inject` and reports `declaredInject: []` for this fixture — the inject list is invisible to an alpha.2-shaped scanner.
- Target form: nest under `dsh`: `"dsh": { "client": { "platform": "web", "inject": [...] } }`.
- Discrepancy recorded per skill discipline (local observation vs primary source, report both): the fixture claims to be rc.1-era, yet the documented rc.1-era shape is already `dsh.client` (Example 06 "Before" shows `"dsh": {"client": ...}` on rc.1). Either the key was flattened while trimming the fixture, or it was never recognized on rc.1 either. Both readings converge on the same action: on 0.1.2-alpha.2 the declaration **must** live at `dsh.client`, and the packed manifest (not just source) must be verified; boot check via `window.__DSH_BOOT__.entries`.

**(c) zero `peerDependencies`/`devDependencies` for consumed declaration owners**

- How it breaks: after the runtime unbundling, every package whose declarations the source consumes must be a **direct** dev/peer dependency; a packed package's `devDependencies` are not transitive for consumers. With `skipLibCheck: true`, missing owners don't fail typecheck — they silently degrade `useChat`/`useSession` selectors and callbacks to implicit `any`. Cards: **DSH-0.1.2-A1-25** (owning-package mapping), **DSH-0.1.2-A2-03** (+ its 2026-08-31 field note on exactly this implicit-any failure), ledger **API-10** ("Type composition and dependency ownership"), precision-checklist ("peers are a superset of inject"; `@deepseek-ai/cordis` floor is **exactly `^4.0.1`**, not `^4.0.2`; `@deepseek-ai/dsh-*` floors on the target cohort).
- Evidence: inject-lint → `peersMissingForImports: [dsh-client-locale, dsh-client-ui-conversation, dsh-client-ui-slots]`, `cordisPeer: null`, `cordisOk: false`, verdict **FIX-REQUIRED**.
- Target form: see the full manifest in §5.

### B-2 · `src/client/index.ts:6` — `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'`

- How it breaks: TS2305 (module does not exist) at the first typecheck against the alpha.2 cohort. Cards: **DSH-0.1.2-A1-25**, **R-11** (type-drift ledger row 2), **API-10** (exact mapping row 1).
- Target form:
  ```ts
  import type { Context as ClientContext } from '@deepseek-ai/cordis'
  ```
  The Context *facets* (`ctx.slots`, `ctx.locale`, …) are no longer aggregated by a runtime package — activate each via type-only augmentation imports from the owning package (B-6), and add `@deepseek-ai/cordis` at `^4.0.1` to peers. Changing this import alone is explicitly **not enough** (API-10 "How it breaks").

### B-3 · `src/client/Pet.tsx:8` — `import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'`

- How it breaks: TS2305; beyond the import, **the flat snapshot type itself is gone** — 0.1.2 split session views and re-keyed the chat snapshot. Cards: **DSH-0.1.2-A1-25**, **DSH-0.1.2-A1-03** (+ field note), **API-10**, **R-11** row 3.
- Target form (alpha.2-only primary read path):
  ```ts
  import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
  ```
  with `@deepseek-ai/dsh-client-ui-chat` as a direct type dependency. Any helper annotated with the old type (`isThinking(snapshot: ConversationSnapshot)`, Pet.tsx:13) must be re-annotated to the shape it actually reads (keyed `ChatSnapshot`, or the chat-view legacy projection during a staged step — §3). Do not paper over with `any`: a newly introduced implicit `any` is a migration failure (API-10 rule 4).

### B-4 · `src/client/Pet.tsx:19-23` — flat conversation-snapshot reads (the core snapshot read surface)

The rc.1 `useSession(selector)` seat handed the component **one flat `ConversationSnapshot`** carrying lifecycle *and* content fields. In alpha.1/alpha.2 the content half moved into per-view projections (chat view; keyed store), and only lifecycle stays on the session seat. Cards: **DSH-0.1.2-A1-03** (session view split; its 2026-08-28 field note names this exact field set `nodes/partial/runningCalls/turnEnds` and the `views.get('chat')?.legacy` projection), **API-10** (keyed chat snapshots), **R-11** row 3, precedents: Example 06 (dsh-ui-whale / dsh-ui-progress — the same product shape as this pet) and Example 08 (plugin-lab, alpha.2: `order` + `nodes.get(id)`).

Per line:

| Line | Old read | Fate on alpha.2 | Failure mode |
|---|---|---|---|
| `Pet.tsx:19` | `useSession(s => s.running)` | **survives unchanged** — lifecycle fields stay on the `useSession` seat and are *not* in any projection (A1-03 field note) | none |
| `Pet.tsx:20` + `:13-15` | `useSession(isThinking)`, reading `snapshot.partial?.blocks.some(b => b.kind === 'reasoning')` | **breaks** — `partial` is no longer a flat session-snapshot field | **silent drift**: `undefined ?? false` → pet never enters the thinking pose; no crash, no console error |
| `Pet.tsx:21` | `useSession(s => s.runningCalls.length > 0)` | **breaks** — `runningCalls` gone from the flat surface | runtime `TypeError: Cannot read properties of undefined (reading 'length')` during render → slot crashes/blank |
| `Pet.tsx:23` | `useSession(s => s.turnEnds[s.turnEnds.length - 1]?.reason)` | **breaks** — turn timeline moved to the chat view's new `timeline` | same TypeError on `.length` |

Aggravating factor: if the owning declarations are missing (B-1c), all four selectors typecheck as implicit `any` under `skipLibCheck: true` — the static layer stays green while the runtime breaks (**DSH-0.1.2-A2-03** field note). This is why the `skipLibCheck: false` diagnostic pass is part of the plan (§6).

Target form — alpha.2-only primary read path (documented shapes):

```ts
// lifecycle: unchanged seat
const running = useSession(s => s.running)

// keyed transcript store (API-10 minimal shape; Example 08):
//   ChatSnapshot.nodes is a keyed store, NOT ConversationNode[];
//   order lives in ChatSnapshot.order
function orderedNodes(chat: ChatSnapshot) {
  return chat.order.flatMap((id) => {
    const node = chat.nodes.get(id)
    return node ? [node] : []
  })
}
const nodes = useChat((chat) => (chat ? orderedNodes(chat) : []))
// assistant final node: narrow by discriminant type === 'assistant-step', read data.finalNode
```

- `useChat` is documented as the alpha.2 seat replacing `useSession` transcript reads (`ctx.useChat`, API-10; Example 08). Component props in the alpha.1+ slot sheet combine **`useSession` (lifecycle) + `useConversation` (conversation views container)** — Example 06 step 4; whether `useChat` is exposed directly on the slot props sheet or reached via ctx is a **verify-at-tag** coordinate (§8-P3).
- Turn-end detection (`turnEnds[last].reason`) moves to the chat view's **`timeline`** ("Turn timeline now lives at `chat?.timeline`" — Example 06 After; dsh-ui-progress v0.9.4 "turn-end detection moved to the new timeline"). Exact timeline entry/field names are not spelled out in the ledger → verify at the alpha.2 tag (§8-P2); do not invent them from memory.
- Streaming-state fields (`partial`, `runningCalls`): documented as present in the chat view's `legacy` projection; their typed homes on the alpha.2-only primary surface are not spelled out in the ledger → verify at tag (§8-P2). Until verified, the projection path (§3) is the field-tested route for these two fields.

### B-5 · `src/client/index.ts:38-43` — bare `ctx.slots.register` inside `ctx.inject(['slots','conversation'], …)`

- Old form: an rc.1-era *ordering edge* — inject the `conversation` service so the slot is declared before `scope.slots.register({ name: 'conversation.session.header.actions', id: 'pet', order: 10 }, Pet)` runs (comment at `index.ts:24-28`).
- How it breaks: after the session-view split, apply order across entries is not a guarantee; a bare `ctx.slots.register` into another entry's slot can land before the owner's declaration and throw at apply time: `slot "conversation.session.header.actions" is not declared (a parent entry's children table must declare it)`. Source: skill troubleshooting row (cards checked first: **DSH-0.1.2-A1-25**, **DSH-0.1.2-A1-26**; closest describing card **DSH-0.1.2-A1-03**) and Example 06 step 5 (field-verified on this exact slot name).
- Target form:
  ```ts
  export function apply(ctx: ClientContext): void {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'pet: dictionaries')

    ctx.slots.inject('conversation.session.header.actions', () =>
      ctx.slots.register(
        { name: 'conversation.session.header.actions', id: 'pet', order: 10 },
        Pet,
      ),
    )
  }
  ```
  - `ctx.slots.inject(name, cb)` waits for the owner's declaration — it *replaces* the ordering-edge trick; the `'conversation'` entry can leave the service-level `export const inject` (line 29) once nothing else consumes that service (leave no dead face).
  - Registrant passes only `name`/`id`/`order` (never `kind`/`scope`) — the fixture is already compliant on this point.
  - `ctx.slots` types now come from the renderer package: add `import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'` and put ui-renderer in peers/devDeps; **do not** add renderer to `dsh.client.inject` solely for this type import (precision-checklist, "the renderer's double role" — after the split the `slots` service lives in ui-renderer, which the web host mounts itself).
  - The slot name itself, `conversation.session.header.actions`, is **unchanged** in alpha.1/alpha.2 (Example 06 After registers the same name; that fleet then rode alpha.2→rc.1 with zero source changes).
  - Service-level list (line 29): `export const inject = ['slots', 'locale']` post-migration; confirm at boot that no row is pending (§6).

### B-6 · `src/client/index.ts:8-10, 14-19` — type-only augmentation imports and the LocaleNamespaceMap merge

- Line 8, `import type {} from '@deepseek-ai/dsh-client-locale/client'` (ctx.locale merge): **survives** — `dsh-client-locale` remains the Locale/i18n owner (precision-checklist owner table); keep the import, keep the runtime `ctx.locale.register`, keep `dsh-client-locale` in `dsh.client.inject`.
- Lines 14-19, `declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap … }`: **survives** — alpha.2 still hosts the client-slot base Context augmentation in `packages/client/ui-slots/src/index.ts` (API-10 source list), and the precision-checklist *mandates* the pairing (type-level `LocaleNamespaceMap` augmentation **and** runtime `ctx.locale.register`) for any plugin shipping user-facing text. The fixture has both — keep both (do not drop the augmentation when cleaning imports).
- Line 10, `import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'` (the `header.actions` SlotMap merge): **pending tag check**. The package survives (**DSH-0.1.2-A1-25** mapping: `ConversationNode`/`IConversation` → `dsh-client-ui-conversation/client`), but **DSH-0.1.2-A1-03** split the session-view internals, and the field-verified alpha.1/alpha.2 augmentation set for this exact product shape is **ui-chat + ui-renderer** (Example 06 After: `import type {} from '@deepseek-ai/dsh-client-ui-chat/client'` and `…ui-renderer/client'`, registering the same `conversation.session.header.actions` slot, with no ui-conversation import). Action: verify against the alpha.2 tag which module declares the `header.actions` SlotMap entry; keep/replace the augmentation import accordingly, and keep `dsh-client-ui-conversation` in inject/peers only if the tag check shows a real runtime/type edge. Marked pending rather than guessed (skill rule: missing API coordinates → "pending review", never change from memory).
- `Pet.tsx:7,10` — `PropsRuntime`/`PropsLocale` from `@deepseek-ai/dsh-client-ui-slots`: no removal card in the corridor; `PropsRuntime` is still referenced by later-corridor docs (0.1.5-era cards), so the type names survive. What changes is the **seat composition behind `PropsRuntime<'conversation.session.header.actions'>`** (B-4): it can no longer be assumed that `useSession` carries content fields. Add `@deepseek-ai/dsh-client-ui-slots` to peers (currently missing — inject-lint).

### B-7 · Packaging / registration identity — verification surface (no fixture source to change, but must be proven)

- `cordis.patch.yml:1-3`: insert row `name: '@demo/dsh-bench-pet'` equals the package.json name → **compliant** with **DSH-0.1.2-A1-26** item 2 (row `name` = bare scoped package name; the 0.1.1 `file:///`-path + short-name form is what breaks). Row `id: bench-pet` is the loader-instance id and is not the boot-manifest key.
- The **client bundle registration id** (`__ModuleLoader__.load({ id })`, usually injected by the build banner `PLUGIN_ID`) must equal `@demo/dsh-bench-pet` (**DSH-0.1.2-A1-26** item 1). The fixture ships no build config → verify at pack time: `__DSH_BOOT__.entries` contains `"id":"@demo/dsh-bench-pet"`, and the combo-served artifact contains `__ModuleLoader__.load({ id: "@demo/dsh-bench-pet"`. Symptom if wrong: startup assertion `loaded without registering "<id>"`, or the pet silently missing from the boot graph.
- The client bundle must register through the loader factory (`require("react")` inside the factory), never as bare ESM — one raw top-level `import` fails the whole classic-script combo and **every** client plugin's registration (troubleshooting row).

---

## 3. Requirement 4 — compat projection first vs. immediate new read path

The alpha.2 chat view keeps a **compatibility projection** at `views.get('chat')?.legacy` that re-exposes the old flat content fields (**DSH-0.1.2-A1-03** field note, field-verified on dsh-ui-whale v0.3.5 / dsh-ui-progress v0.9.4 / dsh-input-history v0.1.4 — the same snapshot+slot product shape as this pet). The governing rules:

- **API-10**: "`snapshot.legacy.nodes` is only for staged compatibility with an explicit dual-host requirement; it should not become the new primary data surface for alpha.2-only plugins."
- **R-11** row 3: alpha.2-only code must not treat `legacy.nodes` as the primary data surface.
- Example 06 two-step plan: "move everything to legacy first so it runs, then migrate field by field to views/timeline once stable."

Applied to this fixture's fields:

| Field (old flat read) | In the `legacy` projection? | Verdict for this migration |
|---|---|---|
| `running` (Pet.tsx:19, lifecycle) | **No** — lifecycle fields are not in the projection (A1-03 field note) | **Immediate new read path** — and it is already the correct one: the `useSession` seat survives; keep the line as-is. It can never be routed through the projection. |
| `partial.blocks` → thinking pose (Pet.tsx:13-15,20) | Yes | **May run through the projection as step 1** of the two-step migration (field-tested shape: `chat?.legacy?.partial`). Because the host goes straight to alpha.2 and no dual-host requirement is stated, the projection is a *transitional* device only; final form = tag-verified typed fields on the chat view (§8-P2). |
| `runningCalls` → working pose (Pet.tsx:21) | Yes | Same as `partial`: projection OK as step 1 (`chat?.legacy?.runningCalls`); final form = tag-verified primary surface. |
| `turnEnds[].reason` → settle frame (Pet.tsx:23) | Yes (legacy), but the new home is the chat view's **`timeline`** | Projection OK as step 1; **final form must be the timeline read** (dsh-ui-progress v0.9.4 precedent: "turn-end detection moved to the new timeline"). |
| `nodes[]` array-shaped transcript reads (not used by this pet today, but governs any extension/tests) | `legacy.nodes` exists, yet alpha.2's primary `ChatSnapshot.nodes` is a **keyed store** | **Immediate new read path** for alpha.2-only code: `useChat` + `ChatSnapshot.order` + `nodes.get(id)` (API-10, Example 08). Any array assumption (indexing, `.length`, test fixtures constructing `nodes: []`) is wrong immediately and cannot be excused via legacy — fixtures must provide `get/values` + `order` (Example 08, failure #3). |

Cross-cohort note (**R-02**): *if* the maintainer later requires one artifact to also run on rc.x hosts, the projection (+ runtime probing of injected services) becomes the legitimate dual-cohort strategy. That is **not** this task's requirement — the host upgrades to alpha.2 — so the recommended end state is: step 1 projection only as a migration intermediate (optional), step 2 keyed/timeline reads as the shipping surface.

---

## 4. Cards checked and **not** hit (with evidence)

Non-hits matter as much as hits; each was checked against the actual fixture face (Web Client, no images, no host code):

- **DSH-0.1.1-R2-01/02/03** (rc.2 image-attachment/read_image/Files-API cards): fixture has zero image surface — the planner lists them only because it keeps all cards of an intersected touchpoint class; filtered by actual face per skill Mode C step 4.
- **DSH-0.1.2-A1-01 / A1-30** (APIProxy→Remote; `ctx.connection.api` removal): no `apiProxy`/`ctx.remote`/`connection` usage; `connection` is not in the service inject list.
- **DSH-0.1.2-A1-02 / A2-01** (`ignorable` removed→restored): net state across corridor = no action; fixture produces no SessionEvents.
- **DSH-0.1.2-A1-06** (Code Mode→PTC): no `tools.mode`/preset/dispatch tokens.
- **DSH-0.1.2-A1-08** (Connection auth gate): no custom routes; inject-lint `rawWebServerRouteFiles: []`, `routeReviewRequired: false`.
- **DSH-0.1.2-A1-20/21/22/24, A1-31** (userQuestions waterfall, resolveSessionPreset, isTokenDelta, pi-ai, subagent descriptor): none of these symbols/packages is referenced.
- **DSH-0.1.2-A1-27** (SessionBinding durable event window): applies to plugins reading session content via `session.getSnapshot().nodes`/`sessions.binding(id)`. This pet reads the **live slot snapshot** through its props seats, not per-session node snapshots — not hit. It would become the relevant card only if the pet were extended to read historical message content (then: `binding.eventSource.getSnapshot().entries`, `SessionEventLikeEntry` from `@deepseek-ai/dsh-api-session-controller/client`).
- **DSH-0.1.2-A1-28** (composer contenteditable): pet does not touch the composer DOM.
- **DSH-0.1.2-A1-29** (MarkdownText labels): no MarkdownText/ui-primitives rendering.
- **DSH-0.1.2-A1-32** (IWorkspaces navigation → `ctx.uiWorkspace`): no workspace navigation.
- **DSH-0.1.2-A2-02** (RemoteError vocabulary): no Remote calls.
- **DSH-0.1.2-A2-04** (Node 24 loader fix), **A2-05** (plugin inventory `agentPresets`), **A2-06** (`$host` facts), **A2-08** (`sessionProjections` peer — host-composition surface; users of the shipped bundle unaffected), **A2-10** (`settingsNamespace` removal — fixture registers no settings): not hit.
- **DSH-0.1.2-A1-09/10/11** (capabilities): optional; per skill rule, capability cards are never adopted automatically. **DSH-0.1.2-A1-19** is not a code hit but governs the acceptance procedure (§6 step 4).

---

## 5. Post-migration target form (consolidated)

```jsonc
// package.json — alpha.2 cohort
{
  "name": "@demo/dsh-bench-pet",
  "version": "0.1.0",            // plugin's own SemVer bump decided separately, after compat changes pass
  "private": true,
  "type": "module",
  "dsh": {                        // was: bare top-level "client"  (B-1b)
    "client": {
      "platform": "web",
      "inject": ["dsh-client-ui-chat", "dsh-client-locale"]
      // "dsh-client-runtime" removed (B-1a); "dsh-client-ui-conversation" kept only if the
      // B-6 tag check confirms a runtime edge; renderer/ui-slots are type edges, not inject rows.
    }
  },
  "peerDependencies": {           // peers ⊇ every consumed declaration owner (B-1c)
    "@deepseek-ai/cordis": "^4.0.1",                        // exact floor, NOT ^4.0.2
    "@deepseek-ai/dsh-client-ui-slots": "^0.1.2-alpha.2",   // PropsRuntime/PropsLocale/LocaleNamespaceMap
    "@deepseek-ai/dsh-client-ui-renderer": "^0.1.2-alpha.2",// ctx.slots augmentation
    "@deepseek-ai/dsh-client-ui-chat": "^0.1.2-alpha.2",    // ChatSnapshot/useChat
    "@deepseek-ai/dsh-client-ui-conversation": "^0.1.2-alpha.2", // pending B-6 tag check
    "@deepseek-ai/dsh-client-locale": "^0.1.2-alpha.2"      // ctx.locale augmentation
  }
}
```

```ts
// src/client/index.ts — alpha.2 form
import type { Context as ClientContext } from '@deepseek-ai/cordis'   // was dsh-client-runtime/client (B-2)
import type {} from '@deepseek-ai/dsh-client-locale/client'           // ctx.locale merge (kept)
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'      // ctx.slots merge (new owner)
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'          // chat snapshot types / SlotMap owner per B-6 tag check
import { Pet } from './Pet.tsx'
import { en, zh, type PetKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { pet: PetKey }                        // kept — pairing is mandatory
}

const NS = 'pet'

export const inject = ['slots', 'locale']   // 'conversation' ordering edge superseded by slots.inject (B-5)

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'pet: dictionaries')
  ctx.slots.inject('conversation.session.header.actions', () =>
    ctx.slots.register(
      { name: 'conversation.session.header.actions', id: 'pet', order: 10 },
      Pet,
    ),
  )
}
```

```tsx
// src/client/Pet.tsx — alpha.2 form (sketch; P-coordinates in §8 verified at tag before landing)
import { useEffect, useRef } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'  // was ConversationSnapshot (B-3)

export type PetProps = PropsRuntime<'conversation.session.header.actions'> & PropsLocale<'pet'>

export function Pet({ useSession, /* + chat seat per §8-P3 */ t }: PetProps) {
  const running = useSession(s => s.running)          // lifecycle: unchanged seat (B-4)
  // content reads: keyed store / timeline via the chat seat — NOT flat session fields:
  //   useChat(chat => chat ? chat.order.flatMap(id => ...) : [])            (API-10 shape)
  //   thinking/toolRunning: tag-verified chat-view fields, or chat?.legacy?.partial /
  //   chat?.legacy?.runningCalls strictly as the transitional step-1 projection (§3)
  //   settle frame: chat view timeline (replaces turnEnds[last].reason) (§8-P2)
  …
}
```

`cordis.patch.yml`: **no change** (row already compliant, B-7).

Host-side reminder (out of plugin scope but part of the upgrade): the dsh host upgrade itself must run from an **external terminal** with every dsh process stopped and a **pinned** install (`npm install -g @deepseek-ai/dsh@0.1.2-alpha.2`) — never from inside a dsh session, never via the bare `latest` dist-tag (skill global discipline; R-08 dist-tag drift).

---

## 6. Validation plan (to run **after** authorization to migrate; nothing executed in this task)

1. **Static**: `grep -r "dsh-client-runtime" src/ package.json` → zero hits (all of: imports, type-only imports, inject, devDeps, lockfile); re-run `inject-lint.mjs` → verdict OK; one diagnostic `tsc` pass with `skipLibCheck: false` to expose every missing declaration owner, then restore the repo policy (API-10 rule 4; A2-03 field note); confirm no implicit `any` in selectors; cordis peer exactly `^4.0.1`.
2. **Build/pack**: registration id in the packed client bundle equals `@demo/dsh-bench-pet` (A1-26); packed manifest carries `dsh.client`; no raw ESM in the combo bundle.
3. **Enablement**: `dsh --profile <p> --dump-config` — plugin row resolves to the package name, no pending rows (especially `slots`/`locale` services).
4. **Runtime mount (DSH-0.1.2-A1-19 acceptance)**: isolated profile, `dsh web --no-open` at the exact target tag; keep the full token URL; scripted lanes do manual-303 → capture `Set-Cookie` → request clean root/boot manifest with the cookie; read `window.__DSH_BOOT__.entries`; fetch the host-advertised artifact URL; assert `__ModuleLoader__.load` registration and a DOM marker (`.pet`), not a bare HTTP 200.
5. **Behavior**: one message → tool → response round; watch the pose sequence idle → thinking (reasoning streaming, no tool in flight) → working (tool call in flight) → settle frame on turn end; no console TypeError; frames actually change (guards against the silent `partial` drift, B-4).
6. **Teardown**: remove the plugin → clean unmount; every boot/smoke command under an explicit timeout.

Completion states are reported separately: "typecheck passed" ≠ "loader mount passed" ≠ "real behavior passed" (API-10 minimal validation ladder).

---

## 7. Read-only discipline & evidence

- `/app/fixture/` untouched: sha256 of all 6 files re-verified against the task-provided baseline `fixture-hash-before.json` → **UNCHANGED: true** (evidence file below).
- No migration, no install, no git operation, no network access; only read-only local scans were run (`plan-migration.mjs`, `inject-lint.mjs` — both documented read-only, both exited 0).
- Evidence artifacts (this directory):
  - `_evidence-plan-migration.txt` — corridor resolution rc.1→rc.2→alpha.1→alpha.2; touchpoint #5 hits at `src/client/index.ts:6`, `src/client/Pet.tsx:7`, `package.json:8` (heuristic; superseded by the manual line-level inventory in §1-§2).
  - `_evidence-inject-lint.json` — verdict FIX-REQUIRED; `declaredInject: []` (bare `client` key invisible to the alpha.2-shaped scanner); `runtimeRefsLeft`: index.ts, Pet.tsx; `peersMissingForImports`: locale/ui-conversation/ui-slots; `cordisOk: false`.
  - `_evidence-fixture-hash-after.txt` — per-file hash comparison, UNCHANGED: true.
- Pre-existing baseline failures: **not collected** (Mode A read-only assessment; no build/test was executed, per task scope).

## 8. Pending / residual risk (marked instead of guessed)

- **P1 · SlotMap owner of `conversation.session.header.actions` in alpha.2** (B-6): ui-conversation vs ui-chat/renderer — resolve by reading the alpha.2 tag's declarations (`packages/client/ui-conversation`, `packages/client/ui-chat`, `packages/client/ui-slots`); keep the augmentation import and the inject row aligned with the answer.
- **P2 · Typed homes of `partial`/`runningCalls` and the timeline entry shape (end-reason field)** on the alpha.2-only primary surface (B-4): the ledger documents the keyed nodes store and the existence of `chat.timeline`/`legacy`, but not these exact field coordinates → verify at tag (`packages/client/ui-chat/src/client/contract/snapshot.ts` at `dsh-v0.1.2-alpha.2`). Per API-10: if the tag conflicts with the ledger, the tag wins and the conflict is flagged as a knowledge-base gap.
- **P3 · Slot props sheet composition** (B-4/B-6): `PropsRuntime<'conversation.session.header.actions'>` seat names in alpha.2 (documented: `useSession` + `useConversation` dual seats from Example 06; `useChat` documented via `ctx.useChat`) — confirm with one `skipLibCheck: false` typecheck at the tag.
- **P4 · Bare `client` key discrepancy** (B-1b): recorded both readings (fixture's rc.1-era claim vs the R1-02/R1-03 scan contract); the target form is unambiguous (`dsh.client`), and the boot check (`__DSH_BOOT__.entries`) is the arbiter.
- **P5 · Build config absent from the fixture**: registration id / banner PLUGIN_ID / bundle format (B-7) can only be verified once the real build pipeline is in view.

## 9. Final summary table

| Hit location | Old interface | Typical symptom on alpha.2 | Target interface | Required / conditional | Verification status |
|---|---|---|---|---|---|
| package.json:8 | `dsh-client-runtime` in client inject | row out of boot graph / pending, silent | remove; recompose inject (ui-chat, locale; ui-conversation per P1) | required (DSH-0.1.2-A1-25) | static evidence (inject-lint); boot pending |
| package.json:6 | bare `"client"` key | declaration invisible to scanner | `"dsh": { "client": … }` (DSH-0.1.1-R1-02/03, DSH-0.1.2-A1-26) | required | linter-confirmed; boot pending (P4) |
| package.json (deps) | no peers/devDeps for consumed owners | selectors implicit `any` under skipLibCheck | peers ⊇ imports; cordis `^4.0.1` (DSH-0.1.2-A2-03, API-10) | required | inject-lint FIX-REQUIRED |
| index.ts:6 | `ClientContext` from dsh-client-runtime/client | TS2305 | `Context` from `@deepseek-ai/cordis` (DSH-0.1.2-A1-25, R-11) | required | static |
| index.ts:10 | ui-conversation SlotMap augmentation | possible TS2305/missing slot type | owning package per tag (P1); documented set ui-chat + ui-renderer | conditional | pending tag check |
| index.ts:38-43 | bare `ctx.slots.register` in `ctx.inject` ordering edge | `slot … is not declared` at apply, or works by luck | `ctx.slots.inject(name, () => ctx.slots.register(…))` (DSH-0.1.2-A1-03/25/26; troubleshooting) | required | documented + precedent-verified |
| index.ts:29 | service inject `['slots','conversation','locale']` | dead face / pending risk | `['slots','locale']` (+ conversation only per P1) | required | boot pending |
| Pet.tsx:8 | `ConversationSnapshot` import | TS2305 | `ChatSnapshot` from ui-chat/client (DSH-0.1.2-A1-25, API-10, R-11) | required | static |
| Pet.tsx:13-15,20 | `snapshot.partial?.blocks` (thinking) | **silent**: always false | chat-view read (P2) or staged `legacy.partial` (DSH-0.1.2-A1-03) | required | pending tag check |
| Pet.tsx:21 | `s.runningCalls.length` | TypeError in render | chat-view read (P2) or staged `legacy.runningCalls` | required | pending tag check |
| Pet.tsx:23 | `s.turnEnds[…].reason` | TypeError in render | chat view `timeline` (P2); staged `legacy.turnEnds` | required | pending tag check |
| Pet.tsx:19 | `useSession(s => s.running)` | none — lifecycle seat survives | unchanged (DSH-0.1.2-A1-03 field note) | no change | documented |
| Pet.tsx:7 | `PropsRuntime`/`PropsLocale` from ui-slots | type survives; seat composition changed | keep types; add ui-slots peer; seats per P3 | conditional | pending tag check |
| build/pack | registration id ≠ package name risk | `loaded without registering` / absent entry | id == `@demo/dsh-bench-pet` (DSH-0.1.2-A1-26) | required-at-pack | pending (P5) |
| cordis.patch.yml:1-3 | — | — | unchanged (compliant) | none | static |

*Report produced under BENCHMARK-AUTH-v1 (unattended, read-only). Card citations are point-form per task constraint; primary sources for every claim are the corridor card files, the alpha.2 API ledger (API-10), rollup R-01/R-02/R-11, the precision checklist, and Examples 06/08 in the plugin-upgrade skill references.*


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.