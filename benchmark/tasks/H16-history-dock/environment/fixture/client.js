// bench-history-dock — browser half (0.1.1-era cohort, pre v0.1.2-alpha).
//
// The DSH composer (InputBar) is a <textarea>: the plugin locates it with
// document.querySelector('textarea') and feeds history text back through the
// native prototype value setter + a dispatched 'input' event, which fires
// InputBar's controlled-component onChange → keyboard.setDraft — the same
// path the user's typing takes.
//
// Two registrations (distilled from the real PRE client sources):
//   - the conversation.composer.dock list entry (id `bench-history-dock`,
//     order 100) — the invisible dock that collects history from the
//     session's conversation-node slice (session.nodes) on every render;
//   - a document-level 'keydown' listener attached in the plugin's apply
//     body (NOT in the dock component), so the listener stays active in
//     hero/blank mode where the session-scoped dock is suppressed.
//
// History is collected from user/steering nodes, persisted to localStorage
// (FIFO, 500 entries), and shared across all sessions in the browser profile.
//
// ────────────────────────────────────────────────────────────
// Migration memo (left in the repo during the 0.1.1 era):
//   "The composer is still a <textarea> under the hood — only its styling
//    changed. Keep querySelector('textarea') and the apply-level keydown
//    listener so history navigation also works in hero mode; a session-
//    scoped listener would go dark exactly when the composer is on screen."
// ────────────────────────────────────────────────────────────

export const name = 'bench-history-dock-client'

/** Required services: slots + locale. */
export const inject = ['slots', 'locale']

const NS = 'bench-history-dock'
const STORAGE_KEY = 'bench-history-dock:v1'
const CAPACITY = 500

/** Navigation cursor + saved draft; module-scoped because the keydown
 * listener is attached once in `apply` and persists across dock
 * mount/unmount cycles. */
let navCursor = null
let savedDraft = null

/**
 * Client plugin body: register the dock + attach the document keydown
 * listener.
 *
 * @param {import('@deepseek-ai/dsh-client-runtime/client').ClientContext} ctx
 */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh: {}, en: {} }), 'bench-history-dock: dictionaries')

  // The dock collects history from the session's conversation-node slice.
  // Session-scoped: DSH suppresses the dock in hero/blank mode (blank
  // sessions render as hero), so collection only runs in active sessions.
  ctx.slots.inject('conversation.composer.dock', () =>
    ctx.slots.register(
      { name: 'conversation.composer.dock', id: 'bench-history-dock', order: 100, locale: NS },
      HistoryDock,
    ),
  )

  // Attach the document-level keydown listener. This lives in `apply` (not
  // in the dock component) so navigation stays active even when the dock is
  // suppressed in hero/blank mode. Bubble phase — the composer's own key
// handling runs first, and the handler below defers to it.
  ctx.effect(() => {
    if (typeof document === 'undefined') return undefined
    const handler = (event) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
      if (isImeComposition(event)) return
      // Slash/@ menu arbitration: the 0.1.1-era heuristic — InputBar marks
      // menu-navigated arrows as handled, and this handler defers to any
      // earlier consumer via the defaultPrevented branch.
      if (event.defaultPrevented) return
      const textarea = findComposerTextarea(event.target)
      if (textarea === null || event.target !== textarea) return
      if (textarea.readOnly || textarea.disabled) return

      const history = getHistoryStore().list
      const info = cursorLineInfo(textarea.value, textarea.selectionStart, textarea.selectionEnd)
      if (event.key === 'ArrowUp' && !info.atFirstLine) return
      if (event.key === 'ArrowDown' && !info.atLastLine) return

      const dir = event.key === 'ArrowUp' ? 'up' : 'down'
      const next = nextIndex(navCursor, history.length, dir)
      if (next === null) {
        const saved = savedDraft
        navCursor = null
        if (saved !== null) {
          setNativeTextareaValue(textarea, saved)
          savedDraft = null
        }
        event.preventDefault()
        return
      }
      if (navCursor === null && savedDraft === null) savedDraft = textarea.value
      const entry = entryAt(history, next)
      if (entry === null) return
      navCursor = next
      setNativeTextareaValue(textarea, entry)
      event.preventDefault()
    }
    document.addEventListener('keydown', handler, false)
    return () => {
      document.removeEventListener('keydown', handler, false)
    }
  }, 'bench-history-dock: keydown listener')
}

/**
 * Set the textarea value via the native prototype setter and dispatch an
 * `input` event so React's controlled-component onChange fires — the same
 * technique browser-automation libraries use on React controlled inputs.
 */
function setNativeTextareaValue(textarea, value) {
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')
  if (descriptor === undefined || descriptor.set === undefined) {
    textarea.value = value
    return
  }
  descriptor.set.call(textarea, value)
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
}

/**
 * Locate the DSH composer textarea. The real locator scopes the query to the
 * composer card's stable internal attribute; the distilled fixture keeps the
 * document-level shape the exam anchors on.
 */
function findComposerTextarea(from) {
  if (typeof document === 'undefined') return null
  if (from instanceof Element) {
    const card = from.closest('[data-composer-card]')
    if (card !== null) {
      const ta = card.querySelector('textarea')
      if (ta !== null) return ta
    }
  }
  return document.querySelector('textarea')
}

/**
 * The invisible dock entry: collects prompt history from the session's
 * conversation-node slice (session.nodes) on every render. Session-scoped;
 * suppressed in hero/blank mode.
 *
 * @param {{ session: { nodes: Array<{ kind: string, content?: Array<{ type: string, text?: string }> }> }}} props
 */
function HistoryDock(props) {
  const lastText = latestUserOrSteeringText(props.session.nodes)
  if (lastText !== null) getHistoryStore().append(lastText)
  return null // aria-hidden anchor elided in the fixture
}

/** Latest user/steering text from a conversation snapshot's nodes list. */
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

/** Caret line information for a multi-line textarea value. */
function cursorLineInfo(value, selectionStart, selectionEnd) {
  const end = selectionEnd ?? selectionStart
  const collapsed = selectionStart === end
  const totalLines = value.split('\n').length
  const currentLine = value.slice(0, selectionStart).split('\n').length - 1
  return {
    currentLine: Math.max(0, Math.min(currentLine, totalLines - 1)),
    totalLines,
    atFirstLine: collapsed && currentLine === 0,
    atLastLine: collapsed && currentLine === totalLines - 1,
  }
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
