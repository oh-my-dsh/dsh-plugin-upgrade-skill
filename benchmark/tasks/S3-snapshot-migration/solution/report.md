# S3 Migration Assessment Report (Reference Answer)

## Breaking surfaces and migration forms

1. **Type imports (src/client/index.ts:6, Pet.tsx:8)**: the `@deepseek-ai/dsh-client-runtime/client` package was removed in alpha. The `ClientContext`/`ConversationSnapshot` types must be imported from `@deepseek-ai/cordis` instead; also delete the `dsh-client-runtime` declaration under `client.inject` in `package.json` (a leftover would fail startup with a missing-service error).
2. **Flat snapshot reads (Pet.tsx isThinking / toolRunning / lastTurnEnd)**: flat fields such as `partial`, `runningCalls`, `turnEnds` move into the `views.get('chat')?.legacy` compatibility projection. First step: read everything through the legacy projection (two-step move), field semantics unchanged; the `turnEnds` timeline semantics migrate to `timeline` later.
3. **Lifecycle fields (Pet.tsx running)**: `running` is not in the legacy projection and must be read through the `useSession` seat (session lifecycle was split into SessionSnapshot).
4. **Slot registration (end of index.ts apply)**: `ctx.slots.register` becomes `ctx.slots.inject(name, () => ctx.slots.register(...))`; the `ctx.slots` type requires importing `@deepseek-ai/dsh-client-ui-renderer/client`.

## Corresponding cards

- DSH-0.1.2-A1-03 (heavy split of the session-view project): items 2/3/4 above all come from this card.

## Two-step conclusion

Can run first through the compatibility projection: partial / runningCalls / turnEnds (fully readable through the legacy projection).
Must switch paths immediately: running (`useSession` seat), type imports, and the inject declaration (otherwise the plugin does not activate).
