// bench-history-dock — browser half, migrated to 0.1.2-alpha.2 (mirrors the
// real @huanlin/dsh-plugin-input-history adaptation commit 06e4057):
//
//   - the composer is a Lexical contenteditable DIV now (card
//     DSH-0.1.2-A1-28): the textarea locator and the native value setter are
//     gone — drafts are written through the input machine action
//     inputActions.setDraft and the navigated keystroke is consumed with
//     stopPropagation (capture phase, document level) so Lexical's editable
//     keymap never moves the caret after the draft was replaced.
//   - the keydown listener is registered on the document in the CAPTURE
//     phase (third argument true): Lexical's keymap moves the caret
//     synchronously in JS on the editable element, so a bubble-phase
//     listener would observe the keystroke only after the caret moved.
//     Capture-phase handlers cannot read the defaultPrevented arbitration
//     heuristics of the 0.1.1 era — an open slash/@ trigger menu is
//     detected through its data-trigger-menu marker instead, and the
//     arrows are yielded to menu highlight arbitration.
//   - the listener lives inside the session-scoped dock component (the
//     registration rides conversation.composer.dock), NOT in the plugin's
//     apply body: the input machine (and inputActions) exists only for a
//     current session, and hero/blank mode has no session machine — an
//     apply-level listener would have nowhere to land (card
//     DSH-0.1.2-A1-03, session view split). In hero mode the plugin is
//     dormant by design.
//   - history collection reads the Chat target's legacy node slice through
//     the ui-chat useChat seat: useChat(s => s.legacy.nodes) — the plain
//     conversation-node list rides ui-chat's SessionStandardProps merge now.
//
// Type surface: Context from @deepseek-ai/cordis, with type-only merges from
// @deepseek-ai/dsh-client-ui-renderer/client (ctx.slots),
// @deepseek-ai/dsh-client-ui-conversation/client (dock SlotMap + useInput +
// inputActions) and @deepseek-ai/dsh-client-ui-chat/client (useChat).

export const name = 'bench-history-dock-client'

/** Required services: slots + locale. */
export const inject = ['slots', 'locale']

const NS = 'bench-history-dock'

/**
 * Client plugin body: register the session-scoped dock entry that owns both
 * plugin behaviors (collection + navigation). The apply body attaches no
 * document listeners — the keydown listener belongs to the dock component,
 * where the session-scoped machine faces (input, inputActions, useChat)
 * actually exist.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh: {}, en: {} }), 'bench-history-dock: dictionaries')

  // The dock is session-scoped; in hero/blank mode it is unmounted and the
  // plugin is dormant — the input machine does not exist there to drive.
  ctx.slots.inject('conversation.composer.dock', () =>
    ctx.slots.register(
      { name: 'conversation.composer.dock', id: 'bench-history-dock', order: 100, locale: NS },
      HistoryDock,
    ),
  )
}

/**
 * The session-scoped dock component: owns BOTH behaviors, because both need
 * machine faces that only session-scoped slot components receive.
 *
 * - Collection: the Chat target's legacy node slice via useChat.
 * - Navigation: the document-level CAPTURE-phase keydown listener.
 *
 * @param {{
 *   input: { phase: string, draft: string } | undefined,
 *   useChat: (selector: (state: unknown) => unknown) => unknown,
 *   inputActions: { setDraft: (text: string) => void } | undefined,
 *   sessionId: string,
 * }} props - dock runtime share (InputZone owner + standard kit, incl. the
 *   ui-chat useChat seat) — the SessionStandardProps merge of ui-chat +
 *   ui-conversation.
 * @returns {null} an aria-hidden anchor with zero layout footprint.
 */
function HistoryDock({ input, useChat, inputActions, sessionId }) {
  // History collection: the Chat target's legacy node slice (plain
  // conversation-node list, newest last) via the ui-chat useChat seat.
  const nodes = useChat(s => s.legacy.nodes)
  const lastText = latestUserOrSteeringText(nodes)
  if (lastText !== null) getHistoryStore().append(lastText)

  // Capture-phase document keydown: third argument true puts the listener
  // ahead of Lexical's editable keymap, which moves the caret synchronously
  // in JS. In the real component this block runs inside useEffect and
  // returns the removeEventListener cleanup.
  const handler = (event) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    if (isImeComposition(event)) return
    if (inputActions === undefined || input === undefined) return
    const editable = findComposerEditable(event.target)
    if (editable === null) return
    // Slash/@ trigger menu open: arrows belong to menu highlight
    // arbitration. Capture phase cannot read the defaultPrevented
    // heuristics — the menu is detected through its data-trigger-menu
    // marker instead.
    if (findTriggerMenu(editable) !== null) return
    if (input.phase !== 'plain') return

    const history = getHistoryStore().list
    const dir = event.key === 'ArrowUp' ? 'up' : 'down'
    const next = nextIndex(navCursor, history.length, dir)
    if (next === null) {
      const saved = savedDraft
      navCursor = null
      if (saved !== null) {
        inputActions.setDraft(saved)
        savedDraft = null
      }
      consume(event)
      return
    }
    if (navCursor === null && savedDraft === null) savedDraft = input.draft
    const entry = entryAt(getHistoryStore().list, next)
    if (entry === null) return
    navCursor = next
    inputActions.setDraft(entry)
    consume(event)
  }
  document.addEventListener('keydown', handler, true)
  return null
}

/**
 * Consume a navigated keystroke: preventDefault stops the browser gesture,
 * stopPropagation (capture phase, document level) keeps the event from ever
 * reaching Lexical's editable keydown listener.
 */
function consume(event) {
  event.preventDefault()
  event.stopPropagation()
}

/**
 * Locate the composer editable the event targeted: the Lexical
 * contenteditable inside the composer card (the internal
 * data-composer-input marker), not the card's chrome.
 */
function findComposerEditable(from) {
  if (typeof document === 'undefined') return null
  if (from === null || !(from instanceof Element)) return null
  const card = from.closest('[data-composer-card]')
  if (card === null) return null
  const editable = card.querySelector('[data-composer-input]')
  if (editable === null) return null
  return editable.contains(from) ? editable : null
}

/**
 * Detect an open slash/@ trigger menu inside the composer card: while it is
 * open, arrows move the highlighted row and must not recall history. The
 * menu carries the stable data-trigger-menu marker.
 */
function findTriggerMenu(editable) {
  const card = editable.closest('[data-composer-card]')
  return card === null ? null : card.querySelector('[data-trigger-menu]')
}

/** Latest user/steering text from the Chat target's legacy node list. */
function latestUserOrSteeringText(nodes) {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i]
    if (node.kind !== 'user' && node.kind !== 'steering') continue
    if (node.content === undefined) continue
    let text = ''
    for (const block of node.content) {
      if (block.type === 'text' && typeof block.text === 'string') text += block.text
    }
    return text
  }
  return null
}

/** The pure decision: is this keyboard event part of an IME composition? */
function isImeComposition(event) {
  return event.isComposing === true || event.keyCode === 229
}

/** Terminal-style cursor: ArrowUp walks to older entries, ArrowDown to newer. */
function nextIndex(cursor, length, dir) {
  if (length === 0) return null
  if (dir === 'up') return cursor === null ? length - 1 : cursor - 1
  return cursor === null ? null : cursor + 1
}

/** The history entry at a cursor index, or null when out of bounds. */
function entryAt(history, index) {
  return index >= 0 && index < history.length ? history[index] : null
}

/** Module-scope history store: FIFO list of unique prompts in localStorage. */
let historyStore = null
function getHistoryStore() {
  if (historyStore === null) {
    const key = 'bench-history-dock:v1'
    let list = []
    try {
      list = JSON.parse(window.localStorage.getItem(key) ?? '[]')
    } catch {
      list = []
    }
    historyStore = {
      get list() {
        return list
      },
      append(prompt) {
        const trimmed = prompt.trim()
        if (trimmed === '') return
        const filtered = list.filter((item) => item !== trimmed)
        filtered.push(trimmed)
        list = filtered.slice(-500)
        try {
          window.localStorage.setItem(key, JSON.stringify(list))
        } catch {
          // Storage unavailable: degrade to the in-memory list.
        }
      },
    }
  }
  return historyStore
}

/** Navigation cursor + saved draft, module-scoped across dock remounts. */
let navCursor = null
let savedDraft = null
