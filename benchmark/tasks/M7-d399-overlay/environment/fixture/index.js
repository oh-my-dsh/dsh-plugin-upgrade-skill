// Host half (minimal): the d399 overlay is a client-only UI contribution —
// the host half has no runtime work (mirrors the real plugin's src/index.ts).
//
// 0.1.1-era cohort (pre v0.1.2-alpha): the browser half pulled its client
// context type from the client-runtime package, and the sessions list store
// had no typed home of its own.

export const name = 'bench-d399-overlay'

// Client-only plugin: the host half declares no injections.
export const inject = []

/**
 * Host apply — no-op. The overlay is mounted entirely by the browser half.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx, config) {
  console.error('[bench-d399-overlay] host apply(): client-only overlay plugin; the browser half mounts the bottom-right teaser while the model generates')

  ctx.effect(() => {
    console.error('[bench-d399-overlay] no host-plane registrations (overlay is client-only)')
  }, 'bench-d399-overlay: host')
}
