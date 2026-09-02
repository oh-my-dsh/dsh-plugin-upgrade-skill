# H16 Reference Solution

## Reference Changes

See [solution/plugin/](plugin/) (mirrors the real
`@huanlin/dsh-plugin-input-history` adaptation commit `06e4057`):

1. `package.json` — `dsh.client.inject` drops the deleted
   `dsh-client-runtime` and names the recomposed module set (locale,
   ui-slots, ui-conversation, ui-chat, ui-renderer); peers rewritten to the
   `^0.1.2-alpha.1` cohort (+ `@deepseek-ai/cordis ^4.0.1`), runtime peer
   removed, ui-chat/ui-renderer peers added; version `0.1.2` → `0.2.0`.
2. `client.js` (browser half) — the composer is a Lexical contenteditable
   now (card `DSH-0.1.2-A1-28`): no `querySelector('textarea')`, no native
   value setter; drafts go through `inputActions.setDraft` and the navigated
   keystroke is consumed with `stopPropagation`. The keydown listener is a
   document-level **capture-phase** registration (third arg `true`) written
   **inside the session-scoped dock component** — the apply body attaches
   nothing, because hero/blank mode has no session machine for the listener
   to land on. History collection reads the Chat target's legacy node slice
   via `useChat(s => s.legacy.nodes)`; slash/@ menus are yielded through the
   `data-trigger-menu` marker.
3. The fixture's memo ("the composer is still a textarea under the hood —
   keep the textarea query and the apply-level listener for hero mode") is a
   double trap: the textarea is gone, and hero has no input machine — the
   listener belongs in the session-scoped dock.

## Expected judge score: 100

15 (diagnosis: names the plugin, cites `DSH-0.1.2-A1-28` + `DSH-0.1.2-A1-03`,
with `DSH-0.1.2-A1-25` + `R-01` in the fix plan)
+ 50 (static contract across the client plane) + 25 (add + web cold boot +
roster entry) + 10 (version bump + private flag) = 100.

## Core point (in one sentence)

The composer is a Lexical contenteditable and the session view is split — an
agent that keeps the textarea locator, the bubble-phase apply-level listener
(per the memo), or the deleted runtime in the inject list has migrated
nothing; the browser roster check proves the client plane re-composed.
