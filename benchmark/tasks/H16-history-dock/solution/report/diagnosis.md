# Diagnosis — bench-history-dock on dsh 0.1.2-alpha.2

Plugin: `bench-history-dock` (client-only plugin: an invisible
`conversation.composer.dock` entry plus a document keydown listener that
navigates the composer draft through recently sent prompts).

## Breaks found

1. **The composer surface changed (card `DSH-0.1.2-A1-28`).** The composer is
   a Lexical contenteditable DIV now — there is no `<textarea>` element, so
   `document.querySelector('textarea')`, the native prototype value setter,
   and the dispatched `input` event are all dead ends. Drafts are written
   through the input machine action `inputActions.setDraft`, and the
   navigated keystroke must be consumed with `preventDefault` +
   `stopPropagation`, otherwise Lexical's keymap moves the caret right after
   the draft was replaced.
2. **The keydown listener must run in the capture phase and live in the dock
   component.** Lexical's editable keymap handles ArrowUp/ArrowDown
   synchronously in JS, so the bubble-phase apply-level listener observes the
   keystroke only after the caret moved; the listener must be a
   document-level capture-phase `keydown` registration (third argument
   `true`) so it precedes Lexical. And it must move out of the plugin's
   `apply` body into the session-scoped dock component (registered through
   `conversation.composer.dock`): hero/blank mode has no session machine, so
   an apply-level listener has nowhere to land. The in-source memo claiming
   the composer is "still a textarea under the hood" and that the
   apply-level listener should be kept for hero mode is false on both
   counts.
3. **The slash/@ arbitration contract changed with the capture phase.** The
   0.1.1-era heuristic deferred to `event.defaultPrevented`; capture-phase
   listeners run before those marks exist. Trigger menus are yielded through
   the stable `data-trigger-menu` marker instead.
4. **History collection moved to the ui-chat seat (card
   `DSH-0.1.2-A1-03`, session view split).** The dock's `session.nodes` prop
   is gone; the Chat target's legacy node slice arrives through
   `useChat(s => s.legacy.nodes)` (ui-chat's SessionStandardProps merge).
5. **The client inject list names a deleted package.** `dsh.client.inject`
   still lists `@deepseek-ai/dsh-client-runtime`, removed and split by domain
   (card `DSH-0.1.2-A1-25`); the web tree cannot compose with it in the
   list. The new list names ui-chat + ui-renderer, and the `Context` type
   comes from `@deepseek-ai/cordis` with type-only merges.
6. **Peer floors are on a dead cohort.** `^0.0.1-rc.1` floors and
   `@deepseek-ai/cordis ^4.0.1-rc.1` do not match `0.1.2-alpha.2` under npm
   semver prerelease rules; rewrite to `^0.1.2-alpha.1` + cordis `^4.0.1`,
   drop the runtime peer, add ui-chat/ui-renderer.

## Cards

- `DSH-0.1.2-A1-28` — composer surface: `<textarea>` → contenteditable DIV
  (Lexical). The textarea locator/native-setter path is dead; drafts go
  through `inputActions.setDraft`; capture-phase keydown precedes the
  Lexical keymap; slash/@ menus yield via `data-trigger-menu`.
- `DSH-0.1.2-A1-03` — session view internals split up extensively (the
  Chat target's legacy node slice via `useChat`, and the dock as the only
  session-scoped home for the listener).
- `R-01` — back the fixture up before touching it (baseline commit present).

## Fix plan

- client.js: register the listener inside the session-scoped dock component
  (the registration rides `conversation.composer.dock`); document-level
  capture-phase keydown (third arg `true`); write drafts via
  `inputActions.setDraft` + `stopPropagation`; guard with
  `data-trigger-menu`; collect history via `useChat(s => s.legacy.nodes)`;
  repoint the JSDoc type sources (cordis Context + type-only
  ui-chat/ui-conversation/ui-renderer `/client` merges).
- package.json: `dsh.client.inject` → locale, ui-slots, ui-conversation,
  ui-chat, ui-renderer; peers → the `0.1.2-alpha` cohort (+ cordis ^4.0.1),
  runtime peer removed, ui-chat/ui-renderer added; version `0.1.2` →
  `0.2.0`.
- Deploy: isolated web profile; the roster (`__DSH_BOOT__.entries`) must
  list `<pkg>/client.js` after the client plane re-composes.
