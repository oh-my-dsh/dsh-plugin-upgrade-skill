# M10 Reference Solution

## Reference Changes

See [solution/plugin/](plugin/) (mirrors the real
`@huanlin/dsh-plugin-tools-manager` adaptation commit `4d70dfa`):

1. `package.json` — `dsh.client.inject` drops the deleted
   `@deepseek-ai/dsh-client-runtime` and recomposes to exactly
   `dsh-client-ui-primitives` + `dsh-client-ui-slots` (card
   `DSH-0.1.2-A1-25`); the `dsh-client-runtime` peer and its optional meta are
   removed; `dsh-client-ui-renderer` + `dsh-client-ui-settings` peers added;
   every floor rewritten to the `^0.1.2-alpha.1` cohort (`@deepseek-ai/cordis`
   off its rc line to `^4.0.1`); version bumped `0.1.0` → `0.2.0` (matches the
   real adaptation's bump).
2. `client.js` (browser half) — the client context type moves from the deleted
   `dsh-client-runtime/client` (`ClientContext`) to `@deepseek-ai/cordis`
   (`Context`), with type-only merges pulled from
   `@deepseek-ai/dsh-client-ui-renderer/client` (the ctx.slots SlotRegistry
   merge — the runtime service lives in ui-renderer since the split) and
   `@deepseek-ai/dsh-client-ui-settings/client` (the `'settings.section'`
   SlotMap entry). The in-source memo ("ctx.slots is provided by ui-slots; the
   ui-renderer import is only cosmetic — skip it and the inject entry") is a
   trap: without the ui-renderer wiring the slots service is absent and the
   boot pends on `slots`.
3. `index.js` (host half) — unchanged by the real adaptation: it was already
   on the scoped `@deepseek-ai/cordis` Context; the registry + policy +
   gateway body is elided in the fixture.

## Expected judge score: 100

15 (diagnosis: names the plugin, cites `DSH-0.1.2-A1-25` + `R-01`)
+ 50 (static contract across both planes) + 25 (add + web cold boot + roster entry)
+ 10 (version bump `0.1.0` → `0.2.0` + private flag) = 100.

## Core point (in one sentence)

Since the client-runtime split the `ctx.slots` service lives in
`dsh-client-ui-renderer` (and the `'settings.section'` SlotMap entry in
`dsh-client-ui-settings`): the client half must carry the type-only merges from
both packages and drop the deleted runtime from the client inject — skipping
the ui-renderer wiring (the memo's bait) leaves the panel pending on `slots`.
