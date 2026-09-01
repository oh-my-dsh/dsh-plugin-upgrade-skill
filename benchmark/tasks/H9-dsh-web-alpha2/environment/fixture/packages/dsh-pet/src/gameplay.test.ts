/**
 * Gameplay tests — the manifest block (fail-closed structure, parsed through
 * parsePetManifest) and the host engine (lazy settle, effects, rolls) with
 * injected clock/rng for determinism.
 */
import { describe, expect, it } from 'vitest'
import { parsePetManifest } from './manifest-v2.ts'
import {
  applyGameplayEffects,
  clampGameplay,
  drawLotteryTier,
  initialGameplayState,
  rollTouchBranch,
  rollWorkOutcome,
  settleGameplay,
  touchZoneAt,
  type PetGameplayManifest,
} from './gameplay.ts'

/** A miku-shaped frames2d manifest carrying the full gameplay block. */
function mikuManifest(gameplay: Record<string, unknown>): Record<string, unknown> {
  return {
    petManifestVersion: 2,
    id: 'miku',
    displayName: 'Miku',
    license: 'MIT',
    renderer: 'frames2d',
    frames2d: {
      dir: 'thumb',
      tracks: {
        idle: {}, drag: {}, standup: {}, sleep: {}, work: {}, success: {}, fail: {},
        happy: {}, shy: {}, flirty: {}, angry: {}, scratch: {}, blink1: {}, blink2: {}, eat: {}, shop: {},
      },
      phases: { idle: 'idle', done: 'success', failed: 'fail' },
    },
    gameplay,
  }
}

const FULL_GAMEPLAY: Record<string, unknown> = {
  idleDirector: {
    intervalMs: 5000,
    maxMiss: 2,
    idleWeight: 40,
    acts: [
      { track: 'scratch', weight: 18 },
      { track: 'blink1', weight: 9 },
      { track: 'blink2', weight: 9 },
      { track: 'eat', weight: 24 },
    ],
  },
  stats: {
    hunger: { max: 100, initial: 100, decayPerMinute: 1, workingDecayPerMinute: 5 },
    mood: { max: 100, initial: 100, decayPerMinute: 0.5 },
    energy: { max: 100, initial: 100, decayPerMinute: 0.25 },
    affection: { max: 500, initial: 100, idleDecayPerMinute: 0.2 },
  },
  hitBox: { x0: 0.2, y0: 0.05, x1: 0.42, y1: 0.56 },
  touch: {
    zones: [
      { name: 'head', y0: 0, y1: 0.55, branches: [{ probability: 0.05, effects: [{ stat: 'affection', amount: 5 }], state: 'happy', stateMs: 3000, phrases: ['hi'] }] },
      { name: 'body', y0: 0.55, y1: 0.75, branches: [{ probability: 0.1, effects: [{ stat: 'affection', amount: 10 }], state: 'shy', stateMs: 3000 }] },
      {
        name: 'legs', y0: 0.75, y1: 1, branches: [
          { probability: 0.1, effects: [{ stat: 'affection', amount: 30 }], state: 'flirty', stateMs: 3000 },
          { probability: 0.9, effects: [{ stat: 'affection', amount: -5 }], state: 'angry', stateMs: 3000 },
        ],
      },
    ],
  },
  work: {
    state: 'work',
    successState: 'success',
    failState: 'fail',
    tickMs: 10_000,
    resultMs: { success: 1300, fail: 1900 },
    successProbability: 0.5,
    success: { effects: [{ currency: 'coins', amount: 3 }] },
    fail: { effects: [{ currency: 'coins', amount: -1 }] },
  },
  sleep: { state: 'sleep', wakeState: 'standup', restore: { stat: 'energy', amount: 4, intervalMs: 30_000 } },
  passiveIncome: { currency: 'coins', amount: 1, intervalMs: 60_000 },
  shop: {
    state: 'shop',
    items: [
      { id: 'food1', label: 'bread', price: 5, currency: 'coins', effects: [{ stat: 'hunger', amount: 40 }] },
      { id: 'gamecoin', label: 'coin', price: 10, currency: 'coins', effects: [{ currency: 'gamecoins', amount: 1 }] },
      {
        id: 'lottery', label: 'ticket', price: 10, currency: 'gamecoins',
        lottery: {
          effects: [{ stat: 'hunger', amount: 10 }, { stat: 'mood', amount: 10 }, { stat: 'energy', amount: 10 }, { stat: 'affection', amount: 10 }],
          tiers: [
            { probability: 0.0001, prize: 1_000_000 },
            { probability: 0.9836, prize: 50 },
          ],
        },
      },
    ],
  },
  dragState: 'drag',
}

describe('gameplay manifest', () => {
  it('accepts the full miku-shaped block', () => {
    const result = parsePetManifest(mikuManifest(FULL_GAMEPLAY), 'mem')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const gameplay = result.manifest.gameplay!
    expect(gameplay.idleDirector?.acts).toHaveLength(4)
    expect(gameplay.stats?.affection?.max).toBe(500)
    expect(gameplay.touch?.zones).toHaveLength(3)
    expect(gameplay.work?.tickMs).toBe(10_000)
    expect(gameplay.sleep?.restore).toEqual({ stat: 'energy', amount: 4, intervalMs: 30_000 })
    expect(gameplay.shop?.items).toHaveLength(3)
    expect(gameplay.dragState).toBe('drag')
  })

  it('rejects gameplay on non-frames2d renderers', () => {
    const sprite = {
      petManifestVersion: 2, id: 'cat', displayName: 'Cat', license: 'CC0-1.0',
      renderer: 'sprite2d', sprite2d: { spritesheetPath: 'spritesheet.webp' },
      gameplay: {},
    }
    const result = parsePetManifest(sprite, 'mem')
    expect(result.ok).toBe(false)
  })

  it('rejects unknown fields and dangling references', () => {
    expect(parsePetManifest(mikuManifest({ ...FULL_GAMEPLAY, casino: {} }), 'mem').ok).toBe(false)
    const badStatRef = mikuManifest({ stats: { hunger: { max: 100 } }, shop: { items: [{ id: 'x', label: 'x', price: 1, currency: 'coins', effects: [{ stat: 'ghost', amount: 1 }] }] } })
    expect(parsePetManifest(badStatRef, 'mem').ok).toBe(false)
    const badTrackRef = mikuManifest({ work: { state: 'ghost', successState: 'success', failState: 'fail', tickMs: 1000, successProbability: 0.5 } })
    expect(parsePetManifest(badTrackRef, 'mem').ok).toBe(false)
  })

  it('rejects probability sums above 1 and duplicate shop ids', () => {
    const overTouch = mikuManifest({ touch: { zones: [{ name: 'z', y0: 0, y1: 1, branches: [{ probability: 0.6 }, { probability: 0.6 }] }] } })
    expect(parsePetManifest(overTouch, 'mem').ok).toBe(false)
    const dupShop = mikuManifest({ shop: { items: [
      { id: 'a', label: 'a', price: 1, currency: 'c', effects: [{ currency: 'c', amount: 1 }] },
      { id: 'a', label: 'b', price: 1, currency: 'c', effects: [{ currency: 'c', amount: 1 }] },
    ] } })
    expect(parsePetManifest(dupShop, 'mem').ok).toBe(false)
  })

  it('rejects a shop item with neither effects nor lottery', () => {
    const bare = mikuManifest({ shop: { items: [{ id: 'a', label: 'a', price: 1, currency: 'coins' }] } })
    expect(parsePetManifest(bare, 'mem').ok).toBe(false)
  })

  it('rejects bad ranges (tickMs, decay, zone slices, stateMs)', () => {
    const badTick = mikuManifest({ work: { state: 'work', successState: 'success', failState: 'fail', tickMs: 50, successProbability: 0.5 } })
    expect(parsePetManifest(badTick, 'mem').ok).toBe(false)
    const badDecay = mikuManifest({ stats: { hunger: { max: 100, decayPerMinute: -1 } } })
    expect(parsePetManifest(badDecay, 'mem').ok).toBe(false)
    const badZone = mikuManifest({ touch: { zones: [{ name: 'z', y0: 0.8, y1: 0.2, branches: [{ probability: 1 }] }] } })
    expect(parsePetManifest(badZone, 'mem').ok).toBe(false)
  })
})

describe('gameplay engine', () => {
  const manifest = parsePetManifest(mikuManifest(FULL_GAMEPLAY), 'mem')
  if (!manifest.ok) throw new Error('fixture must parse')
  const def = manifest.manifest.gameplay!

  it('initializes stats at their declared initial (default max)', () => {
    const state = initialGameplayState(def, 1000)
    expect(state.stats).toEqual({ hunger: 100, mood: 100, energy: 100, affection: 100 })
    expect(state.currencies).toEqual({})
    expect(state.mode).toBeNull()
  })

  it('lazy-settles decay, passive income and sleep restore', () => {
    const state = initialGameplayState(def, 0)
    state.stats.hunger = 50
    state.mode = 'sleep'
    // 10 minutes pass with an active session: hunger -10 (1/min), mood -5,
    // energy -2.5 then +20 sleep restore (10 x 30s ticks x 4), coins +10.
    const changed = settleGameplay(state, def, 600_000, { sessionActive: true })
    expect(changed).toBe(true)
    expect(state.stats.hunger).toBe(40)
    expect(state.stats.mood).toBe(95)
    expect(state.stats.energy).toBe(100) // 97.5 + 20 clamped to max
    expect(state.currencies.coins).toBe(10)
    expect(state.settledAt).toBe(600_000)
  })

  it('applies the working decay variant while working and idle decay without a session', () => {
    const state = initialGameplayState(def, 0)
    state.mode = 'work'
    settleGameplay(state, def, 60_000, { sessionActive: true })
    expect(state.stats.hunger).toBe(95) // working: 5/min
    const idle = initialGameplayState(def, 0)
    settleGameplay(idle, def, 300_000, { sessionActive: false })
    expect(idle.stats.affection).toBe(99) // idle decay 0.2/min over 5 min
  })

  it('clamps effects into stat max and currency floors', () => {
    const state = initialGameplayState(def, 0)
    applyGameplayEffects(state, def, [{ stat: 'affection', amount: 10_000 }, { currency: 'coins', amount: -5 }])
    expect(state.stats.affection).toBe(500)
    expect(state.currencies.coins).toBe(0)
  })

  it('rolls touch branches by cumulative probability with no-op mass', () => {
    const zone = def.touch!.zones[0]! // head: 5% hit
    expect(rollTouchBranch(zone, () => 0.04)?.state).toBe('happy')
    expect(rollTouchBranch(zone, () => 0.5)).toBeUndefined()
    const legs = def.touch!.zones[2]!
    expect(rollTouchBranch(legs, () => 0.05)?.state).toBe('flirty')
    expect(rollTouchBranch(legs, () => 0.5)?.state).toBe('angry')
  })

  it('rolls work outcomes and draws lottery tiers with fallthrough', () => {
    expect(rollWorkOutcome(def.work!, () => 0.4)).toBe('success')
    expect(rollWorkOutcome(def.work!, () => 0.6)).toBe('fail')
    const lottery = def.shop!.items[2]!.lottery!
    expect(drawLotteryTier(lottery, () => 0.00005).prize).toBe(1_000_000)
    expect(drawLotteryTier(lottery, () => 0.5).prize).toBe(50)
    // Sum < 1: the uncovered roll mass falls through to the last tier.
    expect(drawLotteryTier(lottery, () => 0.9999).prize).toBe(50)
  })

  it('locates the touch zone for a hit-box fraction', () => {
    expect(touchZoneAt(def.touch!, 0.3)?.name).toBe('head')
    expect(touchZoneAt(def.touch!, 0.6)?.name).toBe('body')
    expect(touchZoneAt(def.touch!, 0.9)?.name).toBe('legs')
    expect(touchZoneAt(def.touch!, 0.55)?.name).toBe('body')
  })

  it('clamps gameplay state into declared maxima', () => {
    const state = initialGameplayState(def, 0)
    state.stats.hunger = 10_000
    state.currencies.coins = 100_000_000
    clampGameplay(state, def)
    expect(state.stats.hunger).toBe(100)
    expect(state.currencies.coins).toBe(9_999_999)
  })
})
