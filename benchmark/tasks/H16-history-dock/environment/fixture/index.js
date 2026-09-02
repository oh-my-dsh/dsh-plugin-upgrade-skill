// bench-history-dock — host plugin entry (0.1.1-era cohort).
//
// Client-only plugin: the host half has no runtime work. The browser half
// (./client.js) registers an invisible entry in `conversation.composer.dock`
// that collects prompt history from the session's conversation-node slice
// and implements terminal-style history navigation (ArrowUp/ArrowDown) over
// the composer textarea.

export const name = 'bench-history-dock'

// Client-only plugin: the host half carries no runtime work — every exam
// surface lives in client.js (dock registration + keydown listener).
export const inject = []

/**
 * Host apply — no-op. All work happens in the browser half.
 *
 * @param {import('@deepseek-ai/cordis').Context} _ctx - host context (unused).
 */
export function apply(_ctx, config) {
  console.error('[bench-history-dock] host apply(): client-only plugin (0.1.1-era cohort); no host-side resources')
}
