/**
 * dsh-input-history browser half (excerpt): terminal-style input recall.
 * Capture Ctrl+Up / Ctrl+Down at the document level and drive the composer
 * draft through a pure history state machine.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type {
  ConversationNode, IConversation, SessionInput,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import { down, extractHistory, IDLE, resync, up, type HistoryBrowse } from './history.ts'
import { applyWithCompat } from './compat.ts'

export const name = 'dsh-input-history'

export const inject = ['sessions', 'uiConversation', 'conversation']

/** The per-press session resolution: current session, its input facade and chat nodes. */
interface ResolvedSession {
  readonly input: SessionInput
  readonly nodes: readonly ConversationNode[]
}

const EMPTY_NODES: readonly ConversationNode[] = []

function applyBody(ctx: ClientContext): void {
  let browse: HistoryBrowse = IDLE
  let lastSessionId: string | undefined

  const sessions: ISessions = ctx.sessions

  const resolve = (): ResolvedSession | null => {
    const id = sessions.list.getSnapshot().current
    if (id === undefined) return null
    if (id !== lastSessionId) {
      // Session switch: recall must start fresh on the new session.
      browse = IDLE
      lastSessionId = id
    }
    const actx = sessions.scope(id)
    if (actx === undefined) return null
    const conversation = actx.get('conversation') as IConversation | undefined
    if (conversation === undefined) return null
    const chat = ctx.uiConversation.binding(id).snapshot.getSnapshot().views.get('chat')
    const nodes = chat === undefined ? EMPTY_NODES : chat.legacy.nodes
    return { input: conversation.input.for(actx), nodes }
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (!e.ctrlKey || e.altKey || e.metaKey) return
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    if (e.isComposing) return
    if (!isComposerTarget(e.target)) return
    const resolved = resolve()
    if (resolved === null) return
    const history = extractHistory(resolved.nodes)
    const draft = resolved.input.state.getSnapshot().draft
    const step = e.key === 'ArrowUp' ? up(history, draft, browse) : down(history, browse)
    if (step.text === null) return
    e.preventDefault()
    e.stopPropagation()
    browse = step.browse
    resolved.input.setDraft(step.text)
  }

  ctx.effect(() => {
    window.addEventListener('keydown', onKeyDown, true)
    return () => { window.removeEventListener('keydown', onKeyDown, true) }
  }, 'dsh-input-history: composer keyboard capture')
}

/**
 * Client plugin entry: run applyBody behind a graceful-compatibility guard —
 * when the running DSH lacks the client APIs this plugin needs, a remediation
 * banner renders instead of a thrown activation error.
 */
export function apply(ctx: ClientContext): void {
  applyWithCompat(
    'dsh-external/dsh-input-history',
    '当前 DSH 客户端 API 与插件不匹配',
    ['升级 DSH 到已适配版本。', '或更新插件到适配当前 DSH 的版本。'],
    [
      ['sessions.list', ctx?.sessions?.list],
      ['sessions.scope', ctx?.sessions?.scope],
      ['sessions.sessionOf', ctx?.sessions?.sessionOf],
      ['uiConversation.binding', ctx?.uiConversation?.binding],
    ],
    () => { applyBody(ctx) },
  )
}
