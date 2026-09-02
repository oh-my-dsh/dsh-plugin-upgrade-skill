// 0.1.2-alpha.2 migration (mirrors @huanlin/dsh-plugin-spur f50bbf9):
//   - client-only plugin: the host half stays a no-op stub; the dock braid is
//     a pure client-side UI contribution.
//   - The client context type moved to @deepseek-ai/cordis with type-only
//     Context merges (see client.js) — the deleted runtime package is gone
//     from the client inject list (card DSH-0.1.2-A1-25).

export const name = 'bench-sidebar-spur'

// Host half: client-only plugin, no host-plane injections.
export const inject = []

/**
 * Host apply — no-op. The braid is a pure client-side UI contribution.
 * @param {import('@deepseek-ai/cordis').Context} _ctx
 */
export function apply(_ctx) {
  console.error('[bench-sidebar-spur] host apply(): client-only plugin, no host-plane work (0.1.2-alpha.2 cohort)')
}
