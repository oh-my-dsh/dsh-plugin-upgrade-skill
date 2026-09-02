// 0.1.1-era cohort (pre v0.1.2-alpha): the browser half pulled its client
// context type from the client runtime package, and the ctx.slots service
// shipped inside that runtime.
//
// Host half: client-only plugin — the host plane has no runtime work. The
// browser half (client.js) registers a `conversation.composer.dock` entry
// that renders the braided whip hanging into the chat area from the dock
// under the composer card.

/**
 * Host apply — no-op. The braid is a pure client-side UI contribution;
 * all work happens in client.js.
 * @param {import('@deepseek-ai/cordis').Context} _ctx
 */
export function apply(_ctx) {
  console.error('[bench-sidebar-spur] host apply(): client-only plugin, no host-plane work (0.1.1-era cohort)')
}
