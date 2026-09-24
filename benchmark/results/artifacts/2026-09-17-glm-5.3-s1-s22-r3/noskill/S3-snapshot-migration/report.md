# S3 · Snapshot Read-Surface Migration Assessment — bench-pet (0.1.1-rc.1 → 0.1.2-alpha.2)

Read-only assessment of the fixture at environment/fixture (referred to below as fixture/). No fixture file was modified, created, deleted, or renamed; no migration or installation was executed. All line numbers refer to the fixture files.

## Scope of the review

Files inspected:

- fixture/package.json
- fixture/cordis.patch.yml
- fixture/src/client/index.ts
- fixture/src/client/Pet.tsx
- fixture/src/client/locales.ts

fixture/cordis.patch.yml and fixture/src/client/locales.ts are migration-neutral (a plain insert entry and a self-owned dictionary; no removed API is touched) and are not breaking surfaces.

## Breaking surfaces, post-migration forms, and card numbers

### 1. Removed `@deepseek-ai/dsh-client-runtime` type imports

Locations:

- fixture/src/client/index.ts:9 — `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'`
- fixture/src/client/Pet.tsx:6 — `import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'`

Why it breaks: `dsh-client-runtime` (including its `/client` entry) was deleted in the 0.1.2 alpha line; the module no longer exists, so typecheck/build reports a nonexistent module and missing exports. Note that type-only imports do not make this safe: type erasure does not repair an unresolved module path, and the runtime failure mode below (package.json inject) compounds it.

Post-migration form:

- `ClientContext`: `import type { Context as ClientContext } from '@deepseek-ai/cordis'`. The client Context type itself now comes from cordis; the client facets merged into Context (slots, locale, conversation, chat, etc.) arrive via type-only augmentations from their owning packages, imported per actual use (index.ts already does this pattern for locale and ui-conversation).
- `ConversationSnapshot`: snapshot types are NOT exported by cordis; they belong to their target Session/Chat domain owner. The old flat `ConversationSnapshot` aggregate is gone; for a chat-read surface the target-owned snapshot type is `ChatSnapshot`, owned by `@deepseek-ai/dsh-client-ui-chat/client` (defer to that package's actual exports at the exact target tag rather than inventing an export). `Pet.tsx` therefore imports its snapshot type from the chat-owning client package instead of the removed runtime package.
- Alongside the import swap, add the type-only Context augmentations the new read surface needs (e.g. `import type {} from '@deepseek-ai/dsh-client-ui-chat/client'` if the chat view/hook surface is used) — otherwise `skipLibCheck: true` can silently widen selectors and callbacks to `any` because the merged facets are missing from Context.

Card: **DSH-0.1.2-A1-25** (`@deepseek-ai/dsh-client-runtime` package removed, client symbols migrated by domain), with **API-10** (Web Client runtime unbundling, keyed chat snapshots) supplying the exact `ClientContext` → cordis `Context` mapping and the chat snapshot ownership.

### 2. Phantom `dsh-client-runtime` entry in the client inject manifest

Location: fixture/package.json:8 — `"inject": ["dsh-client-runtime", "dsh-client-ui-conversation", "dsh-client-locale"]`.

Why it breaks: the declared dependency references a package that no longer exists at 0.1.2-alpha.2. The plugin can fail to enter the boot graph or its assembly row can stay pending forever, often without any explicit startup error — a silent-dead-plugin failure mode, not a loud one.

Post-migration form: remove `dsh-client-runtime` from the `client.inject` array, keeping only real target providers (`dsh-client-ui-conversation`, `dsh-client-locale`, plus any owner of a newly used surface, e.g. the chat or renderer packages if their services/augmentations are consumed).

Card: **DSH-0.1.2-A1-25** (the card's recipe explicitly includes cleaning up `package.json` when the runtime package is dropped).

### 3. Flat `ConversationSnapshot` field reads in the pet animation selectors

Locations (all in fixture/src/client/Pet.tsx):

- fixture/src/client/Pet.tsx:11-13 — `isThinking` reads `snapshot.partial?.blocks` looking for a `reasoning` block
- fixture/src/client/Pet.tsx:21 — `useSession(s => s.runningCalls.length > 0)`
- fixture/src/client/Pet.tsx:23 — `useSession(s => s.turnEnds[s.turnEnds.length - 1]?.reason)`

Why it breaks: `partial`, `runningCalls` and `turnEnds` are chat-conversation state that used to live on the flat `ConversationSnapshot`. After the session-view split, that flat aggregate no longer exists; on alpha.2 the chat snapshot is a different, keyed surface (e.g. `ChatSnapshot.nodes` is a keyed store iterated via `snapshot.order` + `nodes.get(id)`, not an array), so these selectors reference fields that are gone.

Post-migration form — two-step:

1. Compatibility projection first: read all three fields through the chat legacy projection, e.g. `views.get('chat')?.legacy`, preserving each field's original semantics (`partial.blocks` reasoning check, `runningCalls` non-empty check, last `turnEnds` entry's `reason`). Handle the projection being absent (optional chaining / missing-chat case). This keeps the plugin working immediately on 0.1.2-alpha.2. This projection is a migration step, not the preferred permanent alpha.2-only data surface.
2. Then migrate field-by-field to the target-owned Chat/views/timeline surfaces once stable: chat state via the chat view / `useChat` seat, turn history via the timeline API. Do not assume the new collections keep the old array shape — `turnEnds` ordering must be preserved explicitly (e.g. iterate the new order/keyed structure rather than indexing `[length - 1]` blind).

Card: **DSH-0.1.2-A1-03** (session view internals split; its field note documents that the old flat snapshot fields `nodes`/`partial`/`runningCalls`/`turnEnds` remain readable through `views.get('chat')?.legacy` and recommends the two-step "legacy first, then views/timeline" migration). API-10 additionally documents the keyed `ChatSnapshot` shape on alpha.2.

### 4. Lifecycle field `running` — stays on the Session seat, NOT the chat projection

Location: fixture/src/client/Pet.tsx:19 — `const running = useSession(s => s.running)`.

This read does NOT break in the same way as the chat fields: `running` is Session lifecycle state and is not part of the chat conversation snapshot. It is not in the `views.get('chat')?.legacy` projection either. The correct migration is to keep `useSession(s => s.running)` exactly as it is on the Session/useSession lifecycle seat — the existing `useSession` call itself does not need renaming or replacing. What must change around it is only the separation of concerns: split the three chat-derived selectors (item 3) off onto the chat read path instead of (a) moving every field including `running` into the chat legacy projection, or (b) rewriting every `useSession` call into a chat hook. Practically, `running` is currently unused beyond the `void running` marker, but if it drives UI later, it stays on the Session seat.

Card: **DSH-0.1.2-A1-03** (the same field note: lifecycle fields such as `running` are not in the projection and must go through the `useSession` seat).

### 5. Scoped slot registration: `slots.register` into a declared slot → wait via `slots.inject`

Location: fixture/src/client/index.ts:40-48 — inside `ctx.inject(['slots', 'conversation'], (scope) => { scope.slots.register({ name: 'conversation.session.header.actions', id: 'pet', order: 10 }, Pet) })`.

Why it breaks: after the client runtime unbundling, `register()` into a slot that merely happens to be declared by another plugin's apply is no longer a reliable ordering assumption; the correct form is to wait for the named slot with `slots.inject(...)` and register inside it. Also, `scope.slots` typing itself needs the slots service's Context augmentation from its owning package — `import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'`; the existing locale (`dsh-client-locale/client`) and ui-conversation (`dsh-client-ui-conversation/client`) type-only imports pull different augmentations and do not provide the slots service types.

Post-migration form (preserving the slot name `conversation.session.header.actions`, registration id `pet`, order `10`, component `Pet`, and the scoped lifetime):

```ts
ctx.inject(['slots', 'conversation'], (scope: ClientContext) => {
  scope.slots.inject('conversation.session.header.actions', () => {
    return scope.slots.register(
      { name: 'conversation.session.header.actions', id: 'pet', order: 10 },
      Pet,
    )
  })
})
```

Keep the registration owned by the injected dependency scope and the slot lifetime (registered inside `slots.inject`'s callback and disposed when the slot or dependencies go away, recreated when they return). Do not hoist it to the root context. The locale dictionary effect (`ctx.effect(() => ctx.locale.register(NS, { zh, en }), ...)` at index.ts:36) and its lifetime are unaffected and stay as they are.

Card: **DSH-0.1.2-A1-03** (session view internals split — UI registration points/internal imports no longer work and are rebuilt by owning module, which is exactly the `slots.inject` + ui-renderer augmentation change here).

## Card mapping summary

| # | Breaking surface | Location | Card |
|---|---|---|---|
| 1 | Removed runtime-package type imports (`ClientContext`, `ConversationSnapshot`) | index.ts:9, Pet.tsx:6 | DSH-0.1.2-A1-25 (+ API-10 mapping) |
| 2 | Phantom `dsh-client-runtime` in `client.inject` | package.json:8 | DSH-0.1.2-A1-25 |
| 3 | Flat snapshot chat reads (`partial`, `runningCalls`, `turnEnds`) | Pet.tsx:11-13, 21, 23 | DSH-0.1.2-A1-03 |
| 4 | `running` stays on Session/useSession seat | Pet.tsx:19 | DSH-0.1.2-A1-03 |
| 5 | Slot registration ordering/lifetime + slots Context augmentation | index.ts:40-48 | DSH-0.1.2-A1-03 |

## Compatibility projection vs. immediate switch

Can run first through the compatibility projection (`views.get('chat')?.legacy`):

- `partial` (Pet.tsx:11-13) — reasoning-block check
- `runningCalls` (Pet.tsx:21) — tool-in-flight check
- `turnEnds` (Pet.tsx:23) — last turn end reason

These three are chat-derived flat-snapshot fields that the legacy projection still exposes with unchanged field semantics; migrate them to the target views/timeline (or target-owned Chat) surfaces in a second pass once stable, preserving turn ordering rather than assuming the new collections are arrays.

Must switch to a new read path / be changed immediately:

- `running` (Pet.tsx:19): there is no projection for it — but "immediate" here means simply keeping it on its existing Session/useSession seat and separating it from the chat selectors, not rewriting it into a chat hook.
- Type imports (index.ts:9, Pet.tsx:6): removed package; repoint `ClientContext` to cordis `Context` and the snapshot type to its chat-domain owner now — no projection exists for imports.
- `package.json` `client.inject` (line 8): delete the phantom `dsh-client-runtime` entry now, or the plugin risks never entering the boot graph with no explicit error.
- Slot registration (index.ts:40-48): wrap with `slots.inject` and add the ui-renderer Context augmentation now; the old register-into-declared-slot ordering edge is not covered by any projection.

## Suggested verification (not executed — static, read-only task)

After the migration is actually implemented: typecheck against the exact target-tag exports (do not trust guessed snapshot symbol names), cold-boot an isolated profile with the plugin in the boot graph and confirm no pending assembly row, and verify the pet renders, its frames follow thinking/tool-running/turn-end state, and the slot registration mounts/disposes with dependency and slot lifetime.

## Read-only discipline statement

All fixture files were inspected read-only. Nothing inside the fixture directory (or anywhere in the benchmark repository) was modified, created, deleted, or renamed; no migration, installation, or external service was executed. The only file written is this report in the designated output directory.
