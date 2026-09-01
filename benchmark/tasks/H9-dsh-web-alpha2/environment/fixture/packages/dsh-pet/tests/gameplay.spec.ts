/**
 * Gameplay verb routes + service integration (miku-pet generalization):
 * a frames2d pet with a gameplay block served over the real HTTP routes —
 * listing, state view, touch/mode/work-tick/buy verbs and persistence.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { Context } from '@deepseek-ai/cordis'
import { PetService } from '../src/service.ts'
import { makePetRoutes } from '../src/routes.ts'
import { loadPetRegistry } from '../src/registry.ts'

const WEBP_BYTES = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])

const MIKU_MANIFEST = {
  petManifestVersion: 2,
  id: 'miku',
  displayName: 'Miku',
  license: 'MIT',
  renderer: 'frames2d',
  frames2d: {
    dir: 'thumb',
    tracks: {
      idle: {}, happy: {}, flirty: {}, angry: {}, work: {}, success: {}, fail: {}, sleep: {}, standup: {}, drag: {}, shop: {},
    },
    phases: { idle: 'idle', done: 'success', failed: 'fail' },
  },
  gameplay: {
    stats: {
      hunger: { max: 100, decayPerMinute: 1, workingDecayPerMinute: 5 },
      mood: { max: 100, decayPerMinute: 0.5 },
      energy: { max: 100, decayPerMinute: 0.25 },
      affection: { max: 500, initial: 100 },
    },
    hitBox: { x0: 0.2, y0: 0.05, x1: 0.42, y1: 0.56 },
    touch: {
      zones: [
        { name: 'head', y0: 0, y1: 0.55, branches: [{ probability: 1, effects: [{ stat: 'affection', amount: 5 }], state: 'happy', stateMs: 3000, phrases: ['happy!'] }] },
        {
          name: 'legs', y0: 0.55, y1: 1, branches: [
            { probability: 0.1, effects: [{ stat: 'affection', amount: 30 }], state: 'flirty', stateMs: 3000, phrases: ['flirty!'] },
            { probability: 0.9, effects: [{ stat: 'affection', amount: -5 }], state: 'angry', stateMs: 3000, phrases: ['hm!'] },
          ],
        },
      ],
      clickBoost: { stat: 'mood', min: 0, max: 3 },
    },
    work: {
      state: 'work', successState: 'success', failState: 'fail',
      tickMs: 10_000, successProbability: 0.5,
      success: { effects: [{ currency: 'treats', amount: 1 }] },
    },
    sleep: { state: 'sleep', wakeState: 'standup', restore: { stat: 'energy', amount: 4, intervalMs: 30_000 } },
    passiveIncome: { currency: 'treats', amount: 1, intervalMs: 1_800_000 },
    shop: {
      state: 'shop',
      items: [
        { id: 'food1', label: 'bread', image: 'thumb/shop/food.webp', price: 2, currency: 'treats', effects: [{ stat: 'hunger', amount: 40 }] },
        {
          id: 'lottery', label: 'ticket', price: 3, currency: 'treats',
          lottery: {
            currency: 'treats',
            effects: [{ stat: 'mood', amount: 10 }],
            tiers: [{ probability: 1, prize: 5 }],
          },
        },
      ],
    },
    dragState: 'drag',
  },
}

let dir: string
let server: Server
let port: number

function post(path: string, body?: unknown): Promise<{ status: number; json: () => Promise<never> }> {
  return fetch('http://127.0.0.1:' + port + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  }) as Promise<never>
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'dsh-pet-gameplay-'))
  const petDir = join(dir, 'assets', 'miku')
  mkdirSync(petDir, { recursive: true })
  writeFileSync(join(petDir, 'pet.json'), JSON.stringify(MIKU_MANIFEST), 'utf8')
  for (const track of ['idle', 'happy', 'flirty', 'angry', 'work', 'success', 'fail', 'sleep', 'standup', 'drag', 'shop']) {
    mkdirSync(join(petDir, 'thumb', track), { recursive: true })
    writeFileSync(join(petDir, 'thumb', track, track + '_1_200.webp'), WEBP_BYTES)
  }
  writeFileSync(join(petDir, 'thumb', 'shop', 'food.webp'), WEBP_BYTES)

  const ctx = new Context()
  const registry = loadPetRegistry({ packageRoot: dir, petsDir: '', dshPetsDir: '' })
  const service = new PetService(ctx, { persistDir: join(dir, 'home'), registry })
  const routes = makePetRoutes({ service, ctx })
  server = createServer((req, res) => {
    const pathname = (req.url ?? '').split('?')[0]!
    for (const route of routes) {
      if (route.kind === 'exact' && pathname === route.path) {
        void route.handler(req, res)
        return
      }
    }
    for (const route of routes) {
      if (route.kind === 'prefix' && (pathname === route.path || pathname.startsWith(route.path + '/'))) {
        void route.handler(req, res)
        return
      }
    }
    res.writeHead(404)
    res.end()
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  port = (server.address() as AddressInfo).port
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  rmSync(dir, { recursive: true, force: true })
})

interface GameplayView { stats: Record<string, number>; mode: 'work' | 'sleep' | null }
interface VerbResult { ok: boolean; error?: string; hit?: boolean; state?: string; stateMs?: number; phrase?: string; outcome?: string; prize?: { amount: number; currency: string }; view?: GameplayView }

describe('gameplay routes', () => {
  it('lists the frames2d pet with its gameplay block and rewritten shop image URLs', async () => {
    const pets = await fetch('http://127.0.0.1:' + port + '/api/pet/pets').then(res => res.json()) as Array<{
      id: string
      renderer: string
      frames2d?: { tracks: Record<string, { frames: string[] }>; phases: Record<string, string> }
      gameplay?: { shop?: { items: Array<{ id: string; image?: string }> }; dragState?: string }
    }>
    const miku = pets.find(entry => entry.id === 'miku')!
    expect(miku.renderer).toBe('frames2d')
    expect(miku.frames2d?.phases.done).toBe('success')
    expect(miku.frames2d?.tracks.idle?.frames).toEqual(['/pet/miku/thumb/idle/idle_1_200.webp'])
    expect(miku.gameplay?.dragState).toBe('drag')
    expect(miku.gameplay?.shop?.items[0]?.image).toBe('/pet/miku/thumb/shop/food.webp')
  })

  it('serves frames2d frames and shop icons through the asset route', async () => {
    for (const path of ['/pet/miku/thumb/idle/idle_1_200.webp', '/pet/miku/thumb/shop/food.webp']) {
      const res = await fetch('http://127.0.0.1:' + port + path)
      expect(res.status).toBe(200)
      expect(Buffer.from(await res.arrayBuffer())).toEqual(WEBP_BYTES)
    }
    const blocked = await fetch('http://127.0.0.1:' + port + '/pet/miku/thumb/work/../../pet.jsonx')
    expect(blocked.status).toBe(404)
  })

  it('includes the gameplay view in the state snapshot', async () => {
    const state = await fetch('http://127.0.0.1:' + port + '/api/pet/state').then(res => res.json()) as { gameplay?: GameplayView }
    expect(state.gameplay?.stats).toEqual({ hunger: 100, mood: 100, energy: 100, affection: 100 })
    expect(state.gameplay?.mode).toBeNull()
  })

  it('drives the work loop: mode, adjudicated ticks, stop', async () => {
    const enter = await post('/api/pet/gameplay/mode', { mode: 'work' }).then(res => res.json()) as VerbResult
    expect(enter.ok).toBe(true)
    expect(enter.view?.mode).toBe('work')
    const tick = await post('/api/pet/gameplay/work-tick').then(res => res.json()) as VerbResult
    expect(tick.ok).toBe(true)
    expect(['success', 'fail']).toContain(tick.outcome)
    const leave = await post('/api/pet/gameplay/mode', { mode: null }).then(res => res.json()) as VerbResult
    expect(leave.view?.mode).toBeNull()
    const stale = await post('/api/pet/gameplay/work-tick').then(res => res.json()) as VerbResult
    expect(stale.ok).toBe(false)
    expect(stale.error).toBe('not-working')
  })

  it('rolls touch zones and the click boost', async () => {
    const head = await post('/api/pet/gameplay/touch', { zone: 'head' }).then(res => res.json()) as VerbResult
    expect(head.hit).toBe(true)
    expect(head.state).toBe('happy')
    expect(head.phrase).toBe('happy!')
    expect(head.view?.stats.affection).toBe(105)
    const legs = await post('/api/pet/gameplay/touch', { zone: 'legs' }).then(res => res.json()) as VerbResult
    expect(legs.hit).toBe(true)
    expect(['flirty', 'angry']).toContain(legs.state)
    const boost = await post('/api/pet/gameplay/touch').then(res => res.json()) as VerbResult
    expect(boost.ok).toBe(true)
    const unknown = await post('/api/pet/gameplay/touch', { zone: 'ghost' }).then(res => res.json()) as VerbResult
    expect(unknown.ok).toBe(false)
    expect(unknown.error).toBe('unknown-zone')
  })

  it('runs the shop on the treats economy: funds check, food, lottery prize', async () => {
    const broke = await post('/api/pet/gameplay/buy', { item: 'food1' }).then(res => res.json()) as VerbResult
    expect(broke.ok).toBe(false)
    expect(broke.error).toBe('insufficient-funds')
    // Earn treats through the work loop (+1 per success, capped at 20).
    await post('/api/pet/gameplay/mode', { mode: 'work' })
    for (let i = 0; i < 80; i++) {
      const tick = await post('/api/pet/gameplay/work-tick').then(res => res.json()) as VerbResult
      expect(tick.ok).toBe(true)
    }
    await post('/api/pet/gameplay/mode', { mode: null })
    const stocked = (await fetch('http://127.0.0.1:' + port + '/api/pet/state').then(res => res.json()) as { treats: { stocked: number } }).treats.stocked
    expect(stocked).toBe(20)
    const hungerBefore = (await fetch('http://127.0.0.1:' + port + '/api/pet/state').then(res => res.json()) as { gameplay: GameplayView }).gameplay.stats.hunger
    const fed = await post('/api/pet/gameplay/buy', { item: 'food1' }).then(res => res.json()) as VerbResult
    expect(fed, JSON.stringify({ fed, stocked, hungerBefore })).toMatchObject({ ok: true })
    expect(fed.view?.stats.hunger).toBe(Math.min(100, hungerBefore + 40))
    const afterFood = (await fetch('http://127.0.0.1:' + port + '/api/pet/state').then(res => res.json()) as { treats: { stocked: number } }).treats.stocked
    expect(afterFood).toBe(stocked - 2)
    const draw = await post('/api/pet/gameplay/buy', { item: 'lottery' }).then(res => res.json()) as VerbResult
    expect(draw.ok).toBe(true)
    expect(draw.prize).toEqual({ amount: 5, currency: 'treats' })
    // Lottery cost 3, prize 5: capped back at the 20-stock cap.
    const afterDraw = (await fetch('http://127.0.0.1:' + port + '/api/pet/state').then(res => res.json()) as { treats: { stocked: number } }).treats.stocked
    expect(afterDraw).toBe(20)
  })

  it('persists gameplay stats under the pet id and keeps treats in the shared ledger', async () => {
    const persisted = JSON.parse(readFileSync(join(dir, 'home', 'pet.json'), 'utf8')) as {
      gameplay?: Record<string, { currencies: Record<string, number>; mode: string | null }>
      treats?: { treats: number }
    }
    expect(persisted.gameplay?.miku).toBeDefined()
    // Treats are the wallet-free currency: the gameplay currency record is empty.
    expect(persisted.gameplay?.miku.currencies).toEqual({})
    expect(persisted.treats?.treats).toBe(20)
  })

  it('rejects gameplay verbs for a pet without a gameplay block', async () => {
    // Switch to a plain sprite2d pet, then every verb reports no-gameplay.
    await post('/api/pet/set-pet', { petId: 'miku' }) // ensure known starting point
    const ctx = new Context()
    const plainRoot = mkdtempSync(join(tmpdir(), 'dsh-pet-gameplay-plain-'))
    try {
      mkdirSync(join(plainRoot, 'assets', 'whale'), { recursive: true })
      writeFileSync(join(plainRoot, 'assets', 'whale', 'pet.json'), JSON.stringify({
        id: 'whale-girl', displayName: 'whale', spritesheetPath: 'spritesheet.webp',
      }), 'utf8')
      const plain = new PetService(ctx, { persistDir: join(plainRoot, 'home'), registry: loadPetRegistry({ packageRoot: plainRoot, petsDir: '', dshPetsDir: '' }) })
      const result = await plain.gameplayTouch('head')
      expect(result.ok).toBe(false)
      expect(result.error).toBe('no-gameplay')
      expect((await plain.gameplaySetMode('work')).error).toBe('no-gameplay')
      expect((await plain.gameplayBuy('food1')).error).toBe('no-gameplay')
    } finally {
      rmSync(plainRoot, { recursive: true, force: true })
    }
  })
})
