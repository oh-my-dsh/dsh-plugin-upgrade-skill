# S3 — Snapshot read-surface migration assessment

## Verdict and scope

**The fixture is not alpha.2-ready.** Its main problem is not just a removed import: it assumes one flat conversation snapshot supplies both lifecycle and chat content. The migration must separate those readers and bind registration to the actual slot's lifetime.

Mode A, read-only assessment with an author-migration plan; no implementation, installation, packing, package scripts, host upgrade, publishing, or external services were used. Only this report was written. All six fixture files were read in full. Fixture paths below are relative to E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S3-snapshot-migration/environment/fixture.

The directed corridor is **dsh-v0.1.1-rc.1 → dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.1 → dsh-v0.1.2-alpha.2**, following references/README.md metadata, not filename order. The card sets are curated, not an exhaustive upstream API diff. None of the alpha.2 cards restore the deleted client-runtime or the old flat read surface.

## Identity and pre-existing baseline

- Plugin: @demo/dsh-bench-pet, own version 0.1.0, private ESM package (package.json:2–5). This is separate from the host-version corridor.
- Source: a trimmed local task fixture, explicitly non-runnable and non-publishable (README.md:3–4), not evidence of a registry installation. Source URL/standalone plugin SHA, installed plugin location, resolved DSH/Node versions and dependency cohort are not supplied.
- Enclosing evidence repository: E:/deepseek-harness/dsh-plugin-upgrade-skill; branch benchmark/glm-r3-flash-rejudge-a2; HEAD dbca8e4583e36c01105028734631d4f255332363. Read-only git status was empty; submodule status had no entries. This SHA identifies the evidence repository, not a separately released pet plugin.
- No lockfile, dependency blocks, build scripts, tests, compiled entry, or dsh-plugin.json are present in the six-file fixture. No package manager can be inferred.
- **Pre-existing failures: not collected.** The README forbids running this task material; no build/typecheck/test baseline was executed and no passing runtime compatibility claim is made.

## Completed: breaking surfaces and required target forms

### 1. Deleted aggregate client-runtime package — DSH-0.1.2-A1-25

**Locations:** src/client/index.ts:6,35,38; src/client/Pet.tsx:8,13; package.json:8.

Both imports target a deleted package; the manifest's dsh-client-runtime entry is a phantom runtime module dependency. Fixing TypeScript alone leaves activation broken.

Replace the context import with:

```ts
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
```

Remove the old ConversationSnapshot import rather than merely renaming its source and continuing to read its old fields. Infer selector inputs from the new hooks; where an explicit chat type is needed, use ChatSnapshot from @deepseek-ai/dsh-client-ui-chat/client. A staged helper should accept only the legacy projection it actually reads, not the deleted aggregate type.

Remove dsh-client-runtime from package-level client injection and all eventual dependencies/lockfiles. Keep actual conversation/locale module dependencies and arrange the chat contribution required by the new reader. Runtime package edges, service-level inject and TypeScript augmentation are three different things: a type-only renderer import describes ctx.slots but does not activate the renderer. Verify that the actual alpha.2 profile mounts its renderer/slots service and chat view; do not blindly add every type owner as a runtime module edge.

**Supporting card:** DSH-0.1.2-A2-03 (direct declaration ownership). Declare consumed type packages directly in the real plugin's dev/peer dependencies; use a coherent exact alpha.2 development cohort, with the Cordis peer requirement ^4.0.1. Run one diagnostic typecheck with skipLibCheck false; newly implicit-any selectors are failures, not a compatibility workaround.

### 2. Slot registration must follow slot availability — DSH-0.1.2-A1-03

**Locations:** src/client/index.ts:25–29,38–43; missing renderer augmentation beside imports at :6–10.

The existing ctx.inject(['slots', 'conversation'], ...) waits for services, not for the named slot declaration. The target migration uses the slot registry's named-slot injection, so registration occurs only while that slot is available and is disposed with it:

```ts
ctx.slots.inject('conversation.session.header.actions', () =>
  ctx.slots.register(
    { name: 'conversation.session.header.actions', id: 'pet', order: 10 },
    Pet,
  ),
)
```

Retain the necessary service-level inject for slots and locale. The old conversation service wait must not remain the sole claimed guarantee of slot existence; when used only for that ordering purpose it is redundant after named-slot injection. Preserve the header slot name, pet id and order; the supplied corridor does not support inventing a replacement slot name. Import the renderer-owned Context augmentation shown above. Preserve the existing effect-owned locale registration.

### 3. Split component hook inputs — DSH-0.1.2-A1-03

**Locations:** src/client/Pet.tsx:7–10,13–23.

PropsRuntime<'conversation.session.header.actions'> is not by itself evidence that PropsRuntime was deleted. Its effective props depend on owner augmentations. Keep the locale intersection, but compose/consume the **session lifecycle useSession** and **conversation useConversation** seats supplied for this slot. The component can no longer destructure only useSession and use it for every field. Add ui-chat's augmentation to type the 'chat' view; for an alpha.2-native chat reader, the owner also supplies useChat.

The required separation is:

```ts
// Conceptual selector bodies; hook types come from the target slot's props.
const running = useSession(s => s?.running ?? false)
const thinking = useConversation(s =>
  s?.views.get('chat')?.legacy.partial?.blocks.some(
    block => block.kind === 'reasoning',
  ) ?? false,
)
const toolRunning = useConversation(s =>
  (s?.views.get('chat')?.legacy.runningCalls.length ?? 0) > 0,
)
const timeline = useConversation(s => s?.views.get('chat')?.timeline)
```

These show the supported staged access paths, not a compiled replacement component. Undefined session/view/partial states must yield idle/false or no completion, not an exception. Do not read chat fields from the lifecycle selector, and do not move running into chat.legacy.

### 4. Reasoning/partial read — DSH-0.1.2-A1-03

**Locations:** src/client/Pet.tsx:13–15,20.

Old: isThinking(ConversationSnapshot) reads snapshot.partial and is passed to useSession. New staged read: conversationSnapshot.views.get('chat')?.legacy.partial, obtained through useConversation, preserving the reasoning-block predicate. Change both the helper input and its hook call; replacing only the field path inside a helper still wired to the wrong hook is incomplete.

The target's native chat entry is useChat(chat => ...), with ChatSnapshot owned by ui-chat. Legacy is a transition projection, not a new aggregate runtime package. For an alpha.2-only implementation prefer native chat views after verifying the exact target partial/streaming declarations; do not manufacture an unverified native partial field.

### 5. Running tool calls — DSH-0.1.2-A1-03

**Location:** src/client/Pet.tsx:21.

Old: useSession(s => s.runningCalls.length > 0). New staged source: views.get('chat')?.legacy.runningCalls, read through useConversation (or the corresponding chat projection through useChat). The absent-chat default is false. Keep tool-running precedence over thinking as expressed at :29; this is tool activity, not the session lifecycle running flag.

### 6. Turn completion/timeline — DSH-0.1.2-A1-03

**Location:** src/client/Pet.tsx:22–23,27.

Old: useSession(s => s.turnEnds[s.turnEnds.length - 1]?.reason). New authoritative source: **conversationSnapshot.views.get('chat')?.timeline** (or chat?.timeline when reading through useChat). Select the last completed turn and its end reason from that timeline's target-declared discriminated entries, not by indexing the lifecycle snapshot or assuming the final timeline item is a completed turn. Handle an empty timeline and a trailing in-progress turn; track completion identity so rereads/reconnects do not replay celebration.

The A1-03 field note says legacy retains turnEnds as well as nodes/partial/runningCalls, so a temporary reader at chat?.legacy.turnEnds can bridge old content logic. However, the documented target for turn semantics is chat.timeline, and the real-world progress migration explicitly moved turn-end detection there. Recommend moving this call site in the first implementation pass; do not mistake a compatibility array for the new timeline API.

**Precision limit:** the local card/example supplies the timeline path but not its entry member declarations. No exact alpha.2 source/tarball was available in this fixture, and external retrieval was prohibited. Therefore the precise native last-completed-turn discriminator/member accessor is pending target-declaration review; no fabricated timeline.turnEnds, .reason or .at(-1) API is asserted here. This is the remaining limit on a fully compile-ready native selector.

### 7. Package discovery / composition completeness

**Locations:** package.json:6–9; cordis.patch.yml:1–3.

The supplied package has a top-level client field, whereas target discovery uses **dsh.client**. The production package must declare dsh: { client: { platform: 'web', ... } }, including a real built client entry, and remove the deleted runtime from its inject array. No compiled-entry filename is supplied, so do not invent one. This is a pre-existing trimmed-manifest/discovery concern, not newly introduced by the rc.1→alpha.2 edge: related older cards are **DSH-0.1.1-R1-02** (legacy field merge) and **DSH-0.1.1-R1-03** (scan requires dsh.client).

**DSH-0.1.2-A1-26** requires the built registration id and boot entry identity to equal @demo/dsh-bench-pet. The patch already uses that bare scoped package as name at :3. Its row id bench-pet is not the client module registration id and does not need renaming merely to match the package. No bundler/banner is present, so a registration-id mismatch is not established.

## Compatibility projection versus immediate switch

| Field/surface | Can stage through compatibility? | Required alpha.2 read / decision |
|---|---|---|
| partial | Yes | useConversation → views.get('chat')?.legacy.partial; stop using the flat useSession input now. |
| runningCalls | Yes | useConversation → views.get('chat')?.legacy.runningCalls; missing chat means no tool in flight. |
| nodes | Yes in a deliberate transition, but not read by this fixture | Native alpha.2 uses useChat plus ChatSnapshot.order and nodes.get(id), not nodes[]. Do not introduce an unnecessary node migration here. |
| turnEnds | Legacy availability is documented, but not the native completion API | Move completion logic to views.get('chat')?.timeline; native member details require exact target types. Legacy bridging is temporary only. |
| running and other lifecycle fields | **No** | Immediately use the lifecycle useSession seat, not chat.legacy. This call already spells useSession but must now be typed as the lifecycle reader. |
| ClientContext / removed runtime imports and inject | **No** | Switch imports to owning packages and remove phantom module dependency before activation. |
| Slot declaration lifetime | **No** | Use ctx.slots.inject(exactSlotName, registerCallback), not only service availability. |

The two-step content projection approach is documented in DSH-0.1.2-A1-03. API-10 further cautions that legacy.nodes is for explicit staged/dual-host compatibility, not the permanent alpha.2-only primary surface. There is no dual-host requirement in this brief; staging is a bounded migration tactic, not a promise that one artifact now supports rc.1 and alpha.2.

For completeness, the native keyed-node API shape (not a fixture hit) is:

```ts
chat.order.flatMap(id => {
  const node = chat.nodes.get(id)
  return node ? [node] : []
})
```

## Skipped / no-hit evidence

Seven-class scan covered all supplied source and root configuration:

| Class | Finding |
|---|---|
| #1 source patches | No source/monkey patches. cordis.patch.yml is composition, not a patch to host source. |
| #2 events | No event producers, persistence, subscriptions or ignorable marker. A1-02/A2-01 has no code hit. Reading projected turn information is not a persisted-event producer. |
| #3 services / Remote | Client runtime/type ownership and slots/locale service consumption hit. No APIProxy, ctx.remote, settings, Workspace navigation or host services. |
| #4 host filesystem | No host filesystem access. |
| #5 UI / commands / tools | Principal hit: snapshot selectors, props, slot registration and package module declarations. No command execution, MarkdownText or tool registration. |
| #6 custom channels | No HTTP/WS/RPC routes or composer DOM mutation. A div with className/data-frame is not an authenticated channel. |
| #7 subprocess / output | No wrapper, launcher, subprocess or output parser. |

Locales are already paired: index.ts:14–19 augments LocaleNamespaceMap, :36 registers the same pet namespace, and locales.ts:2–4 supplies both zh/en dictionaries with matching keys. Preserve both; no invented locale migration is needed. R2 image changes, alpha.2 RemoteError/settings changes and sessionProjections tool-provider injection are non-hits. Do not add a host half, polling endpoint or auth retrofit to solve this slot-based browser reader.

## Validation plan — not executed

1. Obtain the complete runnable plugin repository and exact alpha.2 declarations. Record its real dependency/lockfile baseline and run its existing build/typecheck/tests before migration, outside this read-only fixture. Resolve the remaining timeline entry and final slot-prop types from their actual owners.
2. Apply only the planned imports, manifest dependencies, named-slot registration and reader separation; preserve locale pairing and composition package identity. Keep the plugin's own release version separate from the host cohort.
3. Check all source, manifests and full lockfile for the old runtime/cohort. Use the repository's one package manager; verify direct declaration owners with skipLibCheck false and then the normal checks. Never suppress errors with any or casts to old snapshot shapes.
4. Test missing session/chat, idle, streaming reasoning, tool execution (wins over thinking), tool completion, completed/error/cancelled turns, trailing in-progress turns, session switching and empty/reloaded histories. If native keyed nodes are introduced, cover order and missing ids. Test late slot declaration, disposal and remount without duplicate pets/dictionaries.
5. On an isolated exact-target Web profile with bounded timeouts, verify token→cookie exchange, boot entry @demo/dsh-bench-pet, advertised client resource, actual registration and visible pet mount, no pending services and no page errors. Execute an equivalent core flow that drives reasoning→tool→completion and observes the pet. HTTP 200 alone is insufficient (DSH-0.1.2-A1-19; authentication context DSH-0.1.2-A1-08).
6. Validate stop/remove teardown. No subprocess-wrapper behavior exists to test here.

## Pending / residual risk

- Runtime activation, build, tests, native timeline item accessors and exact slot prop declarations are **unverified**, not passed. The fixture explicitly cannot be run and lacks a resolved alpha.2 cohort.
- One broad read-only local source discovery glob timed out; it yielded no usable exact-tag source. No attempt was made to install/fetch target code or inspect evaluator/reference-answer material.
- Independent pre-existing UI issues: frame.current is mutated in an effect but refs do not schedule React renders (Pet.tsx:24,28–31); lastTurnEnd is voided and no celebration is implemented (:23,27). The thinking helper comment claims no tool in flight but checks only reasoning; effect precedence currently prevents that from winning over working. These are not established host-migration regressions. Preserve attribution and test actual animation, not just selector values.

## Rollback

No fixture/configuration/dependency change occurred, so no rollback is needed. The six original fixture paths remain the baseline; the enclosing Git SHA is recorded above. Any later approved implementation should snapshot only its owned package manifest, existing lockfile, client source and build configuration. Do not reset/clean the evidence repository or promise rollback of arbitrary installation-script side effects.

## Recommendations and evidence sources

Recommend a small browser-only migration: keep the same header slot and locale namespace, split lifecycle from chat reads, use a short-lived legacy content adapter only if needed, and finalize native timeline logic from exact target declarations. Do not change DSH core or add optional capabilities as part of compatibility work.

Local sources read on demand (all under E:/deepseek-harness/dsh-plugin-upgrade-skill/skills/plugin-upgrade/):

- SKILL.md — methodology and read-only boundaries.
- references/README.md — directed corridor metadata.
- references/pre-flight.md — seven touchpoint classes.
- references/v0.1.1-rc.2.md — rc.1→rc.2 cards, no pet hits.
- references/v0.1.2-alpha.1.md:125–144,415–484 — DSH-0.1.2-A1-03, DSH-0.1.2-A1-25, DSH-0.1.2-A1-26 and the adjacent content-read context DSH-0.1.2-A1-27. A1-27's durable event window is not necessary for this in-slot pet reader.
- references/v0.1.2-alpha.2.md — final-edge net state; DSH-0.1.2-A2-03 type-dependency caution.
- references/api-migration-0.1.2-alpha.2.md:590–645 — API-10 exact owners, useChat/keyed-store shape and type/runtime separation.
- references/precision-checklist.md — renderer augmentation, peer ownership and locale pairing.
- examples/06-real-world-batch-migration.en.md:71–118 — concrete named-slot injection, useConversation/chat legacy/timeline versus lifecycle useSession migration.
- references/v0.1.1-rc.1.md:58–81 — older package-discovery baseline, not misattributed as a new alpha.2 break.

These references contain pinned upstream source coordinates, including dsh-v0.1.2-alpha.2 packages/client/ui-chat/src/client/contract/snapshot.ts and slots.ts. Those remote files were not fetched in this task; recommendations distinguish reference-backed API facts from the remaining exact-declaration/runtime checks.
