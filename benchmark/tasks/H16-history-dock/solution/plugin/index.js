// bench-history-dock — host plugin entry, migrated to the 0.1.2-alpha.2 cohort
// (mirrors @huanlin/dsh-plugin-input-history 06e4057). Client-only plugin: the
// host half stays a no-op; the whole migration lives on the browser half.
//
// The client plane re-composed on the new module split: the deleted client
// runtime is gone from dsh.client.inject and the peers, ui-chat (the Chat
// target + useChat seat) and ui-renderer (ctx.slots) joined the inject list,
// and the Context type comes from @deepseek-ai/cordis.

export const name = 'bench-history-dock'

// Client-only plugin: the host half has no runtime work.
export const inject = []

/**
 * Host apply — no-op. All exam surface lives in client.js (dock registration,
 * capture-phase keydown navigation, useChat history collection).
 *
 * @param {import('@deepseek-ai/cordis').Context} _ctx - host context (unused).
 */
export function apply(_ctx, config) {
  console.error('[bench-history-dock] host apply(): client-only plugin (0.1.2-alpha.2 cohort); no host-side resources')
}
