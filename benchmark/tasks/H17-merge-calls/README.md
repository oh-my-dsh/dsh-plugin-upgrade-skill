# H12 · Merge Tool Calls

**One of the 13-task `H9/M6` portfolio series** — each task distills one real
community plugin migration from the 0.1.1 era onto dsh 0.1.2-alpha.2.

## What it tests

The deepest client-plane rewire in the portfolio — a toolview takeover that
touches four contracts at once (cards `DSH-0.1.2-A1-03` session-view split,
`DSH-0.1.2-A1-29` primitives labels, `DSH-0.1.2-A1-25` runtime removal):

- the chat node types (`ChatNodeStore` / `ChatConversationViewNode` /
  `ToolCallBlock` / `ToolResultNode`) move from the deleted
  `dsh-client-runtime/client` to `@deepseek-ai/dsh-client-ui-chat/client`;
  node-key scanning no longer recomputes ui-conversation's internal
  `conversationContextKey` — calls are located by call id;
- in-session reads move to `useChat` (the Chat target merged into
  SessionStandardProps by ui-chat) — the session-store chat slice is gone;
- `dsh-client-ui-tool` deleted its per-call view derivations: the
  read/search/diff/terminal/web cards derive from `block.meta` + call args +
  result text now;
- primitives labels contract: `ReadBlock`/`SearchBlock`/`DiffBlock`/
  `WebBlock` label keys must exist in the plugin's base zh/en dicts; the
  19-language override dicts relax to `Partial` (missing keys fall back to
  the base zh/en);
- `dsh.client.inject` recomposes to six modules (locale, ui-renderer,
  ui-tool, ui-chat, ui-slots, ui-primitives); runtime in the list is
  boot-fatal; the bare `cordis` peer is removed.

The fixture's "migration memo" claims `resultView`/`callView` were *only
renamed* and tool views should keep reading the session store — following it
caps at 60 (the derivation fields no longer exist on the call object).

## Provenance

Distilled from `@huanlin/dsh-plugin-merge-tool-calls` (repo
`huanlinoto/dsh-plugin-merge-tool-calls`), adaptation commit `720a077`
"适配 DSH v0.1.2-alpha.1（0.2.2 -> 0.3.0）" (chat node types →
`dsh-client-ui-chat/client`; call-id scanning replaces the
`conversationContextKey` key recomputation; `useChat` Chat target; the
ui-tool card-derivation rework onto `block.meta` + args + result text; the
primitives labels keys + `Partial` override dicts; peer cohort rewrite to
`^0.1.2-alpha.1` + `@deepseek-ai/cordis ^4.0.1`, bare `cordis` peer
removed). Four of the six card derivations are elided.

## Layout

Standard Harbor task: `instruction.md` (agent prompt, `BENCHMARK-AUTH-v1`),
`task.toml`, `environment/` (Dockerfile + fixture, git baseline), `tests/`
(`test.sh` → `judge.mjs` → 0–1 reward), `solution/` (oracle: expected 1.0).

```sh
harbor run -p benchmark/tasks/H17-merge-calls -a oracle   # reference answer must score 1.0
```
