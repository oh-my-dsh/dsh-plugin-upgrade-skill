# Diagnosis — bench-merge-calls on dsh 0.1.2-alpha.2

Plugin: `bench-merge-calls` (client-only toolview takeover: shadows the
shipped `read`/`grep`/`glob` toolviews in `tool.call.toolview` and merges
consecutive same-tool calls into one card with compact child rows).

## Breaks found

1. **The chat node types moved packages** (card `DSH-0.1.2-A1-03`).
   `ChatNodeStore` / `ChatConversationViewNode` / `ToolCallBlock` /
   `ToolResultNode` lived on `@deepseek-ai/dsh-client-runtime/client`; they
   ship from `@deepseek-ai/dsh-client-ui-chat/client` now. The node-key
   format stays a ui-conversation internal — the seat must locate itself by
   scanning the store for the tool-call node owning its **call id** instead
   of recomputing `conversationContextKey`.
2. **In-session reads go through `useChat`** (card `DSH-0.1.2-A1-03`). The
   0.1.1-era rows read the session store's chat slice
   (`useSession(s => readRun(s.chat.order, s.chat.nodes, ...))`); ui-chat
   merged `useChat` into SessionStandardProps and the snapshot now exposes
   top-level `order`/`nodes`.
3. **ui-tool deleted its per-call view derivations.** The per-call view
   fields (`resultView`/`callView`) are gone: the read/search/diff/terminal/
   web cards derive from `block.meta` + the parsed call args + the result
   text now. The in-source memo claiming they were "only renamed" is false —
   keeping those reads means the cards never render. (Workspace-path
   helpers become local mirrors: the static util package is not in the
   client module table.)
4. **The primitives labels contract** (card `DSH-0.1.2-A1-29`):
   ReadBlock/SearchBlock/DiffBlock/WebBlock label keys must exist in the
   plugin's base zh/en dicts; the 19-language better-locale override dicts
   relax to `Partial` — missing keys fall back to base zh/en.
5. **`dsh.client.inject` still names the deleted
   `@deepseek-ai/dsh-client-runtime`** (card `DSH-0.1.2-A1-25`) — the web
   tree cannot compose (boot-fatal). The POST list is exactly locale +
   ui-renderer + ui-tool + ui-chat + ui-slots + ui-primitives.
6. **Peer cohort is dead and carries a bare `cordis` peer.** The pinned
   `0.1.0-rc.6` floors and `cordis ^4.0.0-rc.7` do not match
   `0.1.2-alpha.2` under npm semver prerelease rules; rewrite every floor to
   `^0.1.2-alpha.1`, replace the bare `cordis` peer with
   `@deepseek-ai/cordis ^4.0.1`, and add `dsh-client-ui-chat` +
   `dsh-client-ui-renderer` peers.

## Cards

- `DSH-0.1.2-A1-03` — Session view internals split up extensively (the chat
  node package move, the call-id scan, and the `useChat` read contract).
- `DSH-0.1.2-A1-29` — MarkdownText/Block labels nested shape in
  ui-primitives (the Read/Search/Diff/Web label keys the base dicts must
  carry; overrides relax to `Partial`).
- `DSH-0.1.2-A1-25` — `@deepseek-ai/dsh-client-runtime` removed, symbols
  migrated by domain (the inject list and the type surface).
- `R-01` — back the fixture up before touching it (baseline commit present).

## Fix plan

- `client.js`: card derivations → `block.meta` + args + result text (the
  legacy per-call view reads are deleted, not renamed); node location by
  call id; `useChat` for the in-session read; type surface repointed
  (`ToolCallBlock` ← ui-chat/client, `ctx.slots` merge ← ui-renderer/client,
  Context ← `@deepseek-ai/cordis`); labels keys added; override dicts →
  `Partial`.
- `package.json`: `dsh.client.inject` → exactly locale + ui-renderer +
  ui-tool + ui-chat + ui-slots + ui-primitives; peers → all
  `^0.1.2-alpha.1` + `@deepseek-ai/cordis ^4.0.1`; bare `cordis` peer
  removed; version `0.2.2` → `0.3.0`.
- Deploy: isolated web profile; the roster (`__DSH_BOOT__.entries`) must
  list `<pkg>/client.js` after the client plane re-composes.
