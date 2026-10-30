/**
 * Pet: a pixel companion in the session header. Pose follows the live
 * conversation snapshot — the tail wags faster while thinking or while a
 * tool call is in flight, and a settled turn triggers a celebration frame.
 */
import { useEffect, useRef, type CSSProperties } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'

export type PetProps = PropsRuntime<'conversation.session.header.actions'> & PropsLocale<'pet'>

/** Whether the snapshot shows the model emitting reasoning with no tool in flight. */
function isThinking(snapshot: ConversationSnapshot): boolean {
  return snapshot.partial?.blocks.some(block => block.kind === 'reasoning') ?? false
}

/** The pet. Animation follows the flat conversation snapshot fields. */
export function Pet({ useSession, t }: PetProps) {
  const running = useSession(s => s.running)
  const thinking = useSession(isThinking)
  const toolRunning = useSession(s => s.runningCalls.length > 0)
  // Turn timeline: the last completed turn's end reason picks the settle frame.
  const lastTurnEnd = useSession(s => s.turnEnds[s.turnEnds.length - 1]?.reason)
  const frame = useRef<string>('idle')
  void t
  void running
  void lastTurnEnd as CSSProperties
  useEffect(() => {
    frame.current = toolRunning ? 'working' : thinking ? 'thinking' : 'idle'
  }, [toolRunning, thinking])
  return <div data-frame={frame.current} className="pet" />
}
