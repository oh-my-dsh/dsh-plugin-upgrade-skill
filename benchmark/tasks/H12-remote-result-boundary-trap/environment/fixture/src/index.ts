// 0.1.2-alpha.2 client-plane plugin: session rename helper.
// The error vocabulary in this file is already migrated to the alpha.2 namespaced
// codes; the review below is about the control flow, not the code strings.
import type { Context } from '@deepseek-ai/cordis'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'

// ────────────────────────────────────────────────────────────
// Colleague's migration note (2026-08):
//   "The codes are already migrated to alpha.2 and RemoteError is typed, so the
//    safest pattern is to handle all failures in catch."
//   Keep this shape — it worked for the rename flow in our manual test.
// ────────────────────────────────────────────────────────────

export const name = 'h12-remote-result-boundary-fixture'

export function apply(ctx: Context) {
  ctx.slots.inject('session-rename-helper', () => {
    return {
      async renameSession(sessionId: string, title: string) {
        try {
          const result = await ctx.remote.session.rename({ sessionId, title })
          // wrong: treats the resolved result as success without checking result.ok
          return result.value
        } catch (error) {
          if (error instanceof RemoteError) {
            if (error.code === 'gateway/cancelled') {
              return retry(() => renameSession(sessionId, title))
            }

            if (error.code === 'session/not-found') {
              return null
            }
          }

          // wrong: converts genuine assembly/programming rejects into a retry loop
          return retry(() => renameSession(sessionId, title))
        }
      },
    }
  })
}

function retry<T>(operation: () => T): T {
  // production code would schedule a bounded retry here
  return operation()
}
