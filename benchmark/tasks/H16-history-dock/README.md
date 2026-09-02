# H11 · History Dock

**One of the 13-task `H9/M6` portfolio series** — each task distills one real
community plugin migration from the 0.1.1 era onto dsh 0.1.2-alpha.2.

## What it tests

The **composer surface rewrite** (card `DSH-0.1.2-A1-28`) plus the **session
view split** (card `DSH-0.1.2-A1-03`) on the client plane, plus the
client-runtime split (card `DSH-0.1.2-A1-25`):

- the composer is a Lexical contenteditable DIV now — the
  `querySelector('textarea')` locator, the native value setter and the
  dispatched `input` event are all dead; drafts go through
  `inputActions.setDraft` and the navigated key is consumed with
  `stopPropagation`;
- navigation must be a **document-level capture-phase** keydown (third-arg
  `true` / `{ capture: true }`) so it precedes Lexical's keymap; the old
  bubble-phase listener observed keystrokes only after the caret moved;
- the listener must move **out of the plugin's `apply` body into the
  session-scoped dock component** — hero/blank mode has no session machine,
  so an apply-level listener has nowhere to land; the fixture's memo claims
  the opposite ("keep the apply-level listener so history works in hero
  mode too") — following it caps at 60;
- history collection moves from the `session.nodes` slice to the Chat
  target's legacy node slice via the ui-chat `useChat` seat
  (`useChat(s => s.legacy.nodes)`), and slash/@ menus are yielded via the
  `data-trigger-menu` marker (capture phase cannot read the
  `defaultPrevented` heuristics);
- `dsh.client.inject` drops the deleted `dsh-client-runtime` and names the
  new `dsh-client-ui-chat` + `dsh-client-ui-renderer` modules.

## Provenance

Distilled from `@huanlin/dsh-plugin-input-history` (repo
`huanlinoto/dsh-plugin-input-history`), adaptation commit `06e4057`
"适配 DSH v0.1.2-alpha.1：Lexical composer + runtime 包拆分" (runtime peer
removed, ui-chat/ui-renderer peers added; history collection →
`useChat(s => s.legacy.nodes)`; document-level capture-phase keydown →
`inputActions.setDraft` + `stopPropagation`; slash/@ yield via
`data-trigger-menu`; listener moved from `apply` into the dock component —
hero has no session machine). The IME guard and caret-geometry helpers are
elided.

## Layout

Standard Harbor task: `instruction.md` (agent prompt, `BENCHMARK-AUTH-v1`),
`task.toml`, `environment/` (Dockerfile + fixture, git baseline), `tests/`
(`test.sh` → `judge.mjs` → 0–1 reward), `solution/` (oracle: expected 1.0).

```sh
harbor run -p benchmark/tasks/H16-history-dock -a oracle   # reference answer must score 1.0
```
