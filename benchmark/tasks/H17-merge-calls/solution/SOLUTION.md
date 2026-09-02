# H12 Reference Solution

## Reference Changes

See [solution/plugin/](plugin/) (mirrors the real
`@huanlin/dsh-plugin-merge-tool-calls` adaptation commit `720a077`):

1. `package.json` — `dsh.client.inject` recomposed to exactly
   locale + ui-renderer + ui-tool + ui-chat + ui-slots + ui-primitives (the
   deleted `dsh-client-runtime` module is gone; ui-renderer supplies the
   slots merge and ui-chat the chat types); every `@deepseek-ai` peer floor
   rewritten to `^0.1.2-alpha.1` (+ `@deepseek-ai/cordis ^4.0.1`); the bare
   `cordis ^4.0.0-rc.7` peer removed; version bumped.
2. `client.js` — the chat node types move to
   `@deepseek-ai/dsh-client-ui-chat/client` (card `DSH-0.1.2-A1-03`); the
   seat locates itself by scanning the store for the tool-call node owning
   its call id (the ui-conversation node-key format stays internal); the
   in-session read goes through `useChat` (`ChatSnapshot.order/nodes`, the
   Chat target merged into SessionStandardProps by ui-chat); the card
   derivations move from the deleted ui-tool per-call view fields to
   `block.meta` + call args + result text; the base zh/en dicts gain the
   ReadBlock/SearchBlock/DiffBlock/WebBlock label keys (card
   `DSH-0.1.2-A1-29`) and the 19-language override dicts relax to
   `Partial` (missing keys fall back to base zh/en).
3. The in-source memo ("the per-call view fields were only renamed; tool
   views keep reading ctx.session") is a trap — ui-tool deleted those
   fields, and the chat read moved to `useChat`.

## Expected judge score: 100

15 (diagnosis: names the plugin, cites `DSH-0.1.2-A1-03` + `DSH-0.1.2-A1-29`
+ `DSH-0.1.2-A1-25` + `R-01`) + 50 (static contract) + 25 (add + web cold
boot + roster entry) + 10 (version bump + private flag) = 100.

## Core point (in one sentence)

The toolview takeover must follow the ui-tool/ui-chat rework end to end —
derive the cards from `block.meta` + args + result text, read the chat flow
through `useChat`, and recompose the inject list — because the fields the
memo says to keep reading (`resultView`/`callView`) no longer exist.
