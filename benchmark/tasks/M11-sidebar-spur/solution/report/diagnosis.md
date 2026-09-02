# Diagnosis — bench-sidebar-spur on dsh 0.1.2-alpha.2

Plugin: `bench-sidebar-spur` (client-only decorative dock widget registered
into the conversation composer's dock slot; the host half is a no-op stub —
all breaks live on the client plane).

## Breaks found

1. **The client inject list names a deleted package.** `dsh.client.inject`
   still lists `@deepseek-ai/dsh-client-runtime`, which was removed and split
   by domain in alpha.1 (card `DSH-0.1.2-A1-25`); the web tree cannot compose
   with it in the list (boot-fatal). The list must drop it and name
   `@deepseek-ai/dsh-client-ui-renderer` — the slots service's new home.
2. **The client context type comes from the deleted package.** The apply
   body's `ctx` is typed `ClientContext` from
   `@deepseek-ai/dsh-client-runtime/client` (JSDoc import path). On alpha.1
   the context is `@deepseek-ai/cordis` `Context` with type-only merges:
   `dsh-client-locale/client` (`ctx.locale`), `dsh-client-ui-renderer/client`
   (`ctx.slots`, the SlotRegistry — it moved here in the split),
   `dsh-client-ui-conversation/client` (the dock SlotMap entry).
3. **The `ctx.slots` service's source moved.** The in-source memo claiming
   the slots service "still lives in dsh-client-runtime on alpha — only
   renamed internally; keep the runtime inject entry so the dock keeps
   mounting" is false: the package is deleted. The dock registration call
   shape (`ctx.slots.inject('conversation.composer.dock', …)` +
   `ctx.slots.register`) is unchanged — only its type source moved.
4. **Peer floors are on a dead cohort.** All `^0.0.1-rc.1` floors and
   `@deepseek-ai/cordis ^4.0.1-rc.1` do not match `0.1.2-alpha.2` under npm
   semver prerelease rules; they must be rewritten to `^0.1.2-alpha.1` plus
   `@deepseek-ai/cordis ^4.0.1` exactly (no bare `cordis` key). The
   `dsh-client-runtime` peer is deleted; `dsh-client-ui-renderer` is added.
   The unchanged surfaces (`ctx.locale.register(NS, { zh, en })` two-arg
   call, the `LocaleNamespaceMap` type-level namespace declaration) must
   survive the edit.

## Cards

- `DSH-0.1.2-A1-25` — `@deepseek-ai/dsh-client-runtime` package removed,
  client symbols migrated by domain (the client inject list, the context
  type, and the slots service's move to ui-renderer).
- `R-01` — back the fixture up before touching it (baseline commit present).

## Fix plan

- Browser half: type the context from `@deepseek-ai/cordis`; add the
  type-only `dsh-client-ui-renderer/client` merge; keep the dock registration
  shape and the two-arg locale register; keep/declare the
  `LocaleNamespaceMap` augmentation.
- `package.json`: `dsh.client.inject` → locale, ui-renderer, ui-slots,
  ui-primitives, ui-conversation; peers → the `0.1.2-alpha` cohort (+
  `@deepseek-ai/cordis ^4.0.1`); delete the runtime peer, add the
  ui-renderer peer; version `0.1.2` → `0.1.3`.
- Deploy: isolated web profile; the roster (`__DSH_BOOT__.entries`) must list
  `<pkg>/client.js` after the client plane re-composes.
