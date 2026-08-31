import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { useSession } from '@deepseek-ai/dsh-client-ui-chat/client'
import { Pet } from './Pet.tsx'

declare const __ModuleLoader__: { load: (id: string, fn: () => void) => void }

export const inject = ['slots', 'conversation']

export function apply(ctx: ClientContext): void {
  __ModuleLoader__.load('pet-legacy-bundle', () => { /* legacy bundle id, not package name */ })
  ctx.connection.api.agentPresets.list().then(presets => { /* legacy connection.api face */ })
  const { nodes } = useSession()
  const first = nodes[0]
}
