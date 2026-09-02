# M11 Reference Solution

## Reference Changes

See [solution/plugin/](plugin/) (mirrors the real `@huanlin/dsh-plugin-spur`
adaptation commit `f50bbf9`):

1. `package.json` — `dsh.client.inject` drops the deleted
   `@deepseek-ai/dsh-client-runtime` and adds
   `@deepseek-ai/dsh-client-ui-renderer` (the slots service's new home); the
   `dsh-client-runtime` peer is deleted and the remaining floors rewritten to
   `^0.1.2-alpha.1` (+ `@deepseek-ai/cordis ^4.0.1` exactly, no bare
   `cordis` key); `peerDependenciesMeta` kept in sync; version bumped
   `0.1.2` → `0.1.3`.
2. `client.js` (browser half) — the client context type comes from
   `@deepseek-ai/cordis` (`Context`) with type-only merges
   (`dsh-client-locale/client` for `ctx.locale`,
   `dsh-client-ui-renderer/client` for `ctx.slots`,
   `dsh-client-ui-conversation/client` for the dock SlotMap); the dock
   registration call shape is unchanged
   (`ctx.slots.inject('conversation.composer.dock', …)` + `ctx.slots.register`),
   and the two-arg `ctx.locale.register(NS, { zh, en })` is untouched. The
   in-source memo ("the ctx.slots service still lives in dsh-client-runtime
   on alpha — keep the runtime inject entry") is a trap: the package is
   deleted; the SlotRegistry merge lives in ui-renderer since the split.
3. `index.js` (host half) — unchanged no-op stub (client-only plugin); the
   context annotation already pointed at `@deepseek-ai/cordis`.

## Expected judge score: 100

15 (diagnosis: names `bench-sidebar-spur`, cites `DSH-0.1.2-A1-25` + `R-01`)
+ 50 (static contract on the client plane) + 25 (add + web cold boot + roster
entry) + 10 (version bump + private flag) = 100.

## Deviation from the real history

The real adaptation commit `f50bbf9` did **not** bump the version: the
package stayed at `0.1.2` pre and post. The oracle bumps to `0.1.3` purely
because this exam's release-hygiene act requires a version bump vs the git
baseline (Act 4). The judge compares against the committed fixture baseline,
so the bump is what scores the release points.

## Core point (in one sentence)

The deleted `dsh-client-runtime` package cannot stay in the client inject
list (boot-fatal), and `ctx.slots` must be re-sourced type-only from
`@deepseek-ai/dsh-client-ui-renderer/client` — an agent that follows the
memo's "keep the runtime entry so the dock keeps mounting" advice has
migrated nothing.
