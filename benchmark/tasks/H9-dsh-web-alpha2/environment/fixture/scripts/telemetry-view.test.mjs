import test from 'node:test'
import assert from 'node:assert/strict'

import viewer from '../market/telemetry-view/src/index.js'
import { renderDashboard, PAGE_CSP } from '../market/telemetry-view/src/page.js'

function context() { return { waitUntil() {} } }

test('telemetry-view refuses to serve until Access secrets are configured', async () => {
  const response = await viewer.fetch(new Request('https://tv.dsh-market.com/'), {}, context())
  assert.equal(response.status, 503)
  assert.match(await response.text(), /setup required/)
})

test('telemetry-view rejects requests without a valid Access JWT', async () => {
  const env = { ACCESS_TEAM: 'team', ACCESS_AUD: 'aud', TELEMETRY_READ_KEY: 'key' }
  const page = await viewer.fetch(new Request('https://tv.dsh-market.com/'), env, context())
  assert.equal(page.status, 401)
  const data = await viewer.fetch(new Request('https://tv.dsh-market.com/data?days=7'), env, context())
  assert.equal(data.status, 401)
})

test('dashboard document inlines CSP-safe boot data and the paginated shell', () => {
  const html = renderDashboard({
    days: 30,
    sizes: { paths: 10, items: 10 },
    data: {
      ok: true,
      range: { days: 30, since: '2026-07-28' },
      site: {
        totals: { pv: 3, uv_daily_sum: 2 },
        daily: [{ day: '2026-08-25', pv: 1, uv: 1 }, { day: '2026-08-26', pv: 2, uv: 1 }],
        top_paths: [{ path: '/</script><script>alert(1)</script>', pv: 2 }],
        paths_total: 1,
        paths_page: { offset: 0, limit: 10 },
      },
      plugins: { totals: { uv_daily_sum: 0, items: 0 }, daily: [], items_page: { offset: 0, limit: 10 }, items: [] },
    },
  })
  // No executable inline script: the client loads from same-origin /app.js
  // and boot data rides an inert JSON block, so an edge-injected CSP nonce
  // (which neutralizes 'unsafe-inline') cannot block the app.
  assert.ok(!html.includes('<script data-cfasync="false">'), 'no inline executable script remains')
  const bootMatch = html.match(/<script type="application\/json" id="boot-data">([\s\S]*?)<\/script>/)
  assert.ok(bootMatch, 'inert boot-data block present')
  assert.ok(!bootMatch[1].includes('</' + 'script>'), 'boot JSON must not self-terminate its block')
  assert.ok(bootMatch[1].includes('\\u003c'), 'angle brackets in data are unicode-escaped')
  const boot = JSON.parse(bootMatch[1])
  assert.equal(boot.data.site.top_paths[0].path, '/</script><script>alert(1)</script>')
  assert.ok(html.includes('<script src="/app.js"'), 'external client script referenced')
  assert.ok(html.includes('id="paths-pager"'))
  assert.ok(html.includes('id="items-pager"'))
  assert.match(PAGE_CSP, /script-src 'self'/)
  assert.ok(!/script-src[^;]*unsafe-inline/.test(PAGE_CSP), 'script-src must not rely on unsafe-inline')
  assert.match(PAGE_CSP, /connect-src 'self'/)
})
