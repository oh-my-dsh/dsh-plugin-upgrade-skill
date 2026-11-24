# Snapshot read-surface migration assessment

Mode A: read-only assessment. Target: **dsh 0.1.2-alpha.2**. Plugin: `@demo/dsh-bench-pet`, plugin version `0.1.0` (`fixture/package.json:2–3`). All source locations below are relative to `fixture/`.

The plugin cannot be migrated by merely replacing an import. The removed runtime package, content projection, lifecycle read path, and declaration composition must be handled together. **`partial`, `runningCalls`, and `turnEnds` can first use the chat compatibility projection; `running` cannot.** No fixture or skill files were edited, no package scripts or migrations were run, and no network services were accessed.

## Evidence and version boundary

Read `skills/plugin-upgrade/SKILL.md`, the corridor index and cards, the alpha.2 API ledger (especially API-10), the pre-flight and precision checklists, and applicable rollup guidance. The corridor follows metadata: `dsh-v0.1.1-rc.1 → dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.1 → dsh-v0.1.2-alpha.2`. The rc.2 image-related cards have no hits here. The relevant snapshot and runtime breaks enter at alpha.1 and remain at alpha.2.

This is a six-file, deliberately non-runnable fixture (`README.md:3–4`), not a complete installed plugin. There is no lockfile, dependency declaration, build configuration, packed client artifact, host installation identity, or fixture-local Git identity supplied. Thus resolved cohort, package manager, running host/Node versions, activation, and build success are not established. Parent repository metadata was not inspected.

## Completed: source-linked migration inventory

| Source location | Failure or affected contract | Correct alpha.2 form | Upgrade card |
|---|---|---|---|
| `src/client/index.ts:6`, annotations at `:35,38` | `ClientContext` comes from removed `@deepseek-ai/dsh-client-runtime/client`; import/type resolution fails. | `import type { Context as ClientContext } from '@deepseek-ai/cordis'`; retain the alias at both annotations. Add owning-package type augmentations for the actual services, as below. | **DSH-0.1.2-A1-25**; API-10 |
| `src/client/Pet.tsx:8,13` | `ConversationSnapshot` comes from the removed runtime, and the helper expects the former flat aggregate. | Use `ChatSnapshot` from `@deepseek-ai/dsh-client-ui-chat/client` for a chat selector. For a staged helper that still consumes the old fields, derive its input as `ChatSnapshot['legacy']`, then pass `chat.legacy`, not the session lifecycle snapshot. | **DSH-0.1.2-A1-25**, **DSH-0.1.2-A1-03**; API-10 |
| `src/client/Pet.tsx:14,20` | `snapshot.partial` is no longer a top-level field of the lifecycle snapshot supplied by `useSession`. The optional chain can hide the missing data by producing false indefinitely. | Read `useChat(chat => chat?.legacy.partial?.blocks.some(block => block.kind === 'reasoning') ?? false)`. At the view-projection boundary the path is `snapshot.views.get('chat')?.legacy.partial`. | **DSH-0.1.2-A1-03**; API-10 |
| `src/client/Pet.tsx:21` | `s.runningCalls.length` reads content/tool activity from the wrong snapshot and can throw on undefined. | `useChat(chat => (chat?.legacy.runningCalls.length ?? 0) > 0)`; equivalent projection field: `views.get('chat')?.legacy.runningCalls`. | **DSH-0.1.2-A1-03**; API-10 |
| `src/client/Pet.tsx:23` | Flat `s.turnEnds` is gone from the lifecycle read surface; indexing and `.length` can throw. | `useChat(chat => { const ends = chat?.legacy.turnEnds; return ends?.[ends.length - 1]?.reason })`; projection field: `views.get('chat')?.legacy.turnEnds`. Later migrate completion reads to the owning timeline API after checking its target declarations. | **DSH-0.1.2-A1-03**; API-10 |
| `src/client/Pet.tsx:18–19` | Lifecycle and content must be separated. `running` is not part of the chat legacy projection. The existing choice of `useSession` for this field is already the right seat; moving all reads to legacy would introduce a new failure. | Keep lifecycle on `useSession(s => s?.running ?? false)`. Destructure both `useSession` and `useChat` from the slot props. Do not use `chat.legacy.running`, `useChat(chat => chat.running)`, or invent a content-based running signal. | **DSH-0.1.2-A1-03**; API-10 |
| `package.json:8` | The runtime module list still requests `dsh-client-runtime`. It no longer exists; a pending or absent browser entry can prevent any pet mount. | Remove that entry from the actual `dsh.client.inject` declaration. Retain only real runtime module dependencies selected from actual service use; compose the chat/session, conversation and locale owners as needed by the target client graph. Type-only imports are not a reason to add a runtime module edge. | **DSH-0.1.2-A1-25**; API-10 and precision checklist |
| `src/client/index.ts:8–10,29,35–43`; `Pet.tsx:7,10,18–23`; missing dependency blocks in `package.json:1–10` | Runtime aggregation no longer pulls every Context/slot declaration into the type graph. Merely renaming Context can leave `ctx.slots` unknown or callbacks effectively `any`, and packed dependencies do not transitively install devDependencies. | Explicitly include renderer-owned `ctx.slots`, session-controller and ui-chat declarations, retain locale/conversation declaration imports, and declare direct dev/peer dependencies for consumed owners. Pin development resolution coherently to `0.1.2-alpha.2`; Cordis peer guidance is `^4.0.1`. Preserve runtime `inject = ['slots', 'conversation', 'locale']` and the scoped conversation/slots wait unless target activation evidence requires an additional service edge. | **DSH-0.1.2-A1-25**, **DSH-0.1.2-A2-03**; API-10, precision checklist, rollup **R-01** |

`DSH-0.1.2-A1-03` is the precise snapshot card, including its field note explicitly naming `nodes/partial/runningCalls/turnEnds` and excluding lifecycle `running`. `DSH-0.1.2-A1-25` addresses removed package/type ownership, not the entire snapshot migration by itself.

### Exact staged read shape

Illustrative migration form, **not applied or compiled**:

```tsx
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'

type LegacyChat = ChatSnapshot['legacy']
function isThinking(snapshot: LegacyChat): boolean {
  return snapshot.partial?.blocks.some(block => block.kind === 'reasoning') ?? false
}

// Inside Pet, retain the existing slot-props contract and add useChat:
// export function Pet({ useSession, useChat, t }: PetProps) {
const running = useSession(s => s?.running ?? false)
const thinking = useChat(chat => chat ? isThinking(chat.legacy) : false)
const toolRunning = useChat(chat => (chat?.legacy.runningCalls.length ?? 0) > 0)
const lastTurnEnd = useChat(chat => {
  const ends = chat?.legacy.turnEnds
  return ends?.[ends.length - 1]?.reason
})
```

For `index.ts`, the type graph should include:

```ts
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
```

Renderer owns the `slots` service declaration after the split. The renderer type import does not activate its runtime service. `PropsRuntime<'conversation.session.header.actions'> & PropsLocale<'pet'>` is not itself proven removed by this corridor; retain it and make its actual owner augmentations visible. There is no evidence here supporting a guessed slot rename or a new `PropsRuntime` replacement.

### Compatibility boundary and long-term form

A staged projection adapter may retain the **content** algorithms for `partial`, `runningCalls`, `turnEnds`, and, if used later, `nodes`. Move their input to `views.get('chat')?.legacy`, or the corresponding `useChat(chat => chat?.legacy...)` hook immediately. This is a change of read source, not permission to continue accessing the old flat `useSession` snapshot. Guard the absent chat/empty-session case.

Lifecycle state such as **`running` must use `useSession` immediately** and never the compatibility projection. The existing line 19 uses that seat, so its main requirement is preservation and null-safe selection while the other three selectors move.

For a native alpha.2 chat-node consumer, the new API is keyed, not an array:

```ts
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
function orderedNodes(snapshot: ChatSnapshot) {
  return snapshot.order.flatMap(id => {
    const node = snapshot.nodes.get(id)
    return node ? [node] : []
  })
}
// useChat(chat => chat ? orderedNodes(chat) : [])
// Narrow node.type === 'assistant-step' before reading node.data.finalNode.
```

The supplied code has no `nodes` read, so this is future guidance, not another present hit. API-10 recommends native keyed reads for alpha.2-only code and reserves legacy node reads for an explicit staged/dual-host compatibility need. The reference does not enumerate the exact native timeline method names for replacing `turnEnds`; none are invented here. The documented legacy form above supplies a concrete supported first-stage migration for the current reads.

For raw durable session content, a separate public path exists under **DSH-0.1.2-A1-27**: `const binding = sessions.binding(id)`; guard undefined; then `binding.eventSource.getSnapshot().entries`. `SessionBinding` and `SessionEventLikeEntry` belong to `@deepseek-ai/dsh-api-session-controller/client`, and scoped services come from `binding.ctx.get(...)`. This is not necessary to replace this pet's live chat projection with a custom event reducer.

## Packaging baseline caveat

`package.json:6–9` literally declares top-level `client`, not nested `dsh.client`. If this trimmed file is used as the actual package manifest, the target scanner will not see the client half. The required target structure is `dsh: { client: { platform: 'web', ... } }`, with the actual built client entry and legitimate module dependencies. No built entry is supplied, so its filename cannot be asserted. This is an existing fixture packaging deficiency rather than a new rc.1→alpha.2 field removal: **DSH-0.1.1-R1-02**, **DSH-0.1.1-R1-03** establish the earlier manifest contract; **DSH-0.1.2-A1-26** establishes target registration identity.

`cordis.patch.yml:3` already names the bare package `@demo/dsh-bench-pet`, matching `package.json:2`. Keep it. The row's local `id: bench-pet` is not evidence of a client bundle registration mismatch. The missing bundle must eventually register as `@demo/dsh-bench-pet`, and the boot entry must carry that package identity (**DSH-0.1.2-A1-26**). Do not rewrite the composition overlay as though it were a host-source patch.

## Skipped and preserved, with evidence

All six fixture files were inspected. Touchpoints #3 (client services/snapshots), #5 (slot/UI), and packaging are hit. There are no host patches (#1), event producers/listeners (#2), host filesystem paths (#4), custom HTTP/WS/RPC or composer DOM manipulation (#6), or subprocess/output parsers (#7). A JSX `div` and CSS class do not create a custom transport migration.

The locale pairing is already present: `index.ts:14–19` declares `LocaleNamespaceMap.pet`, `index.ts:36` registers `{ zh, en }`, and `locales.ts:2–4` supplies both dictionaries. Preserve both halves. **DSH-0.1.2-A1-10** is an optional language capability, not a mandatory rewrite of this registration.

No `ctx.connection.api`, Remote calls, settings helper, command execution, workspace navigation, custom auth route, image adapter, or host tool composition appears. Accordingly **DSH-0.1.2-A1-01**, **DSH-0.1.2-A1-30**, **DSH-0.1.2-A1-32**, **DSH-0.1.2-A2-02**, **DSH-0.1.2-A2-08**, and **DSH-0.1.2-A2-10** have no source-migration action here. `SessionEvent.ignorable` removal/restoration likewise has no hit; there is no event writer to alter.

## Pre-existing, validation, and residual risk

Pre-existing mechanical failures: **not collected** (read-only Mode A; fixture expressly cannot run). Static observations independent of the upgrade: `Pet.tsx:28–31` updates a ref after rendering without scheduling another render, and `running`/`lastTurnEnd` are discarded at `:26–27`; the claimed completed-turn celebration is not implemented in this trimmed source. These are not attributed to host migration.

Completed validation is source/reference inspection only. No tests, verifier scripts, build, installation, host launch, or browser smoke was executed. This assessment does not claim runtime compatibility.

Recommended later acceptance, after a real implementation is authorized:

1. Resolve a coherent alpha.2 dependency cohort and inspect the packed manifest/bundle; remove every old runtime import/inject/dependency residue. Use the actual project's lockfile manager. Rollup **R-01** requires verifying package availability before any fallback build; no present registry state is claimed.
2. Establish the real project's old-cohort baseline first (rollup **R-06**), then run typecheck/build including one `skipLibCheck: false` diagnostic. Verify selector parameters retain real types.
3. Exercise absent chat, empty session, reasoning stream, active and settled tool calls, completed turn reason, and session switch. Verify lifecycle `running` independently from chat legacy fields.
4. Cold-boot an isolated target Web profile, redeem the printed token URL for its cookie, find the package in the boot manifest, load the advertised artifact, verify package-name registration, then assert `.pet` mounts and its frames update. Check service activation and disposal. This is the complete acceptance boundary under **DSH-0.1.2-A1-19** and **DSH-0.1.2-A1-26**, not merely an HTTP 200.

Pending: real target declarations/build artifact and runtime validation; exact native timeline API beyond the documented compatibility projection. These do not block delivering the read-only assessment.

## Rollback and delivery

No migration was performed. The six fixture files and skill remain unchanged; rollback of source, dependencies, host, and composition is unnecessary. Only this report was written under the authorized `agent-output/S3-snapshot-migration/` directory. No confirmation blocker remains: BENCHMARK-AUTH-v1 authorized the inspection and report writing.
