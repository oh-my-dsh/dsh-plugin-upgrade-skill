// 0.1.2-alpha.2 migration (mirrors @huanlin/dsh-plugin-d399 6184995):
//   - the client-runtime package is deleted (DSH-0.1.2-A1-25): the browser
//     half's ClientContext type moves to @deepseek-ai/cordis (Context), with
//     the ctx.sessions merge pulled type-only from
//     @deepseek-ai/dsh-api-session-controller/client.
//   - dsh.client.inject recomposed to the two client platform modules the
//     overlay actually needs (locale + api-session-controller).
//   - peer floors rewritten to the 0.1.2-alpha cohort; @deepseek-ai/cordis
//     drops its -rc prerelease suffix (^4.0.1).

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
