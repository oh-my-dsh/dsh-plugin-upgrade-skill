/**
 * Voice-pack unit tests (pet-center M4, issue #677): normalization rules
 * (structure fail-closed per file, content warn-and-drop per slot), the
 * per-kind placeholder whitelists, and the layer merge precedence
 * (later layers win per slot).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  mergeVoicePacks,
  normalizePanel,
  normalizePool,
  normalizeVoicePack,
  normalizeWhisperCategories,
  normalizeWhisperResults,
  PANEL_ACTIONS,
  PANEL_LABEL_KEYS,
  PANEL_STAT_KEYS,
  VOICE_LINE_MAX,
  VOICE_PACK_KEYS,
  VOICE_PACK_V1,
  WHISPER_KEYS,
} from './voice-pack.ts'
import { STATUS_SCENES, TOOL_CATEGORIES, WHISPER_CATEGORIES, WHISPER_RESULTS } from './chatter.ts'
import { petPackageRoot } from './registry.ts'

function collectWarnings(pack: unknown): { pack: ReturnType<typeof normalizeVoicePack>; warnings: string[] } {
  const warnings: string[] = []
  const result = normalizeVoicePack(pack, message => warnings.push(message))
  return { pack: result, warnings }
}

describe('normalizeVoicePack structure', () => {
  it('accepts a minimal pack and drops it when nothing usable remains', () => {
    expect(normalizeVoicePack({})).toBeUndefined()
    expect(normalizeVoicePack({ status: { done: ['收工'] } })).toBeDefined()
  })

  it('rejects a non-object root with a warning (fail-closed per file)', () => {
    const { pack, warnings } = collectWarnings(['not', 'an', 'object'])
    expect(pack).toBeUndefined()
    expect(warnings[0]).toContain('must be a JSON object')
  })

  it('warns on unknown top-level fields and unknown voicePackVersion', () => {
    const { pack, warnings } = collectWarnings({
      voicePackVersion: 99,
      mystery: true,
      status: { done: ['收工'] },
    })
    expect(pack).toBeDefined()
    expect(warnings.join('\n')).toContain('mystery')
    expect(warnings.join('\n')).toContain('voicePackVersion')
  })

  it('normalizes top-level remarks and ranks (#1226)', () => {
    const { pack, warnings } = collectWarnings({
      remarks: {
        pet: ['Purr~ So comfortable!'],
        feed: 'Yummy fish!',
      },
      ranks: {
        '0': 'Baby Whale',
        '幼鲸': 'Little Whale',
      },
    })
    expect(pack).toBeDefined()
    expect(pack?.remarks?.pet).toEqual(['Purr~ So comfortable!'])
    expect(pack?.remarks?.feed).toEqual(['Yummy fish!'])
    expect(pack?.ranks).toEqual({
      '0': 'Baby Whale',
      '幼鲸': 'Little Whale',
    })
    expect(warnings).toHaveLength(0)
  })

  it('merges remarks and ranks across layers (#1226)', () => {
    const base = normalizeVoicePack({
      remarks: { pet: ['Base pet'], feed: ['Base feed'] },
      ranks: { '0': 'Base 0', '25': 'Base 25' },
    })
    const layer = normalizeVoicePack({
      remarks: { pet: ['Layer pet'] },
      ranks: { '0': 'Layer 0' },
    })
    const merged = mergeVoicePacks(base, layer)
    expect(merged?.remarks?.pet).toEqual(['Layer pet'])
    expect(merged?.remarks?.feed).toEqual(['Base feed'])
    expect(merged?.ranks).toEqual({
      '0': 'Layer 0',
      '25': 'Base 25',
    })
  })
})

describe('normalizePool', () => {
  it('accepts a single string and arrays, dropping non-string entries', () => {
    const warnings: string[] = []
    expect(normalizePool('一行', 'status', m => warnings.push(m))).toEqual(['一行'])
    expect(normalizePool(['一', 7, '二'], 'status', m => warnings.push(m))).toEqual(['一', '二'])
    expect(warnings.join('\n')).toContain('non-string')
  })

  it('caps pool length and truncates long lines', () => {
    const lines = Array.from({ length: 80 }, (_, i) => '行' + i)
    const warnings: string[] = []
    const pool = normalizePool(lines, 'status', m => warnings.push(m))
    expect(pool).toHaveLength(64)
    expect(warnings.join('\n')).toContain('extra lines')
    expect(normalizePool(['x'.repeat(500)], 'status')?.[0]).toHaveLength(VOICE_LINE_MAX)
  })

  it('drops lines carrying placeholders the pool kind does not allow', () => {
    const warnings: string[] = []
    const pool = normalizePool(['好的 {tool}', '干净的'], 'status', m => warnings.push(m))
    expect(pool).toEqual(['干净的'])
    expect(warnings.join('\n')).toContain('unsupported placeholder')
  })

  it('keeps allowed placeholders per kind', () => {
    expect(normalizePool(['跑 {hint}', '用 {tool}'], 'tools')![0]).toBe('跑 {hint}')
    expect(normalizePool(['还有 {n} 个'], 'toolRemaining')![0]).toBe('还有 {n} 个')
    expect(normalizePool(['好感 {rank}'], 'stat')![0]).toBe('好感 {rank}')
  })

  it('preserves an explicit empty array (mute semantics) but not absent', () => {
    expect(normalizePool([], 'whisperCategory')).toEqual([])
    expect(normalizePool(undefined, 'whisperCategory')).toBeUndefined()
  })
})

describe('normalizeWhisperCategories', () => {
  it('keeps known categories, keeps an explicit empty pool (mute) and warns on unknown keys', () => {
    const warnings: string[] = []
    const pools = normalizeWhisperCategories({ thinking: ['自定义思考'], running: [], bogus: ['x'] }, m => warnings.push(m))
    expect(pools).toEqual({ thinking: ['自定义思考'], running: [] })
    expect(warnings.join('\n')).toContain('unknown whisper category')
  })

  it('returns undefined for an absent or non-object section', () => {
    expect(normalizeWhisperCategories(undefined)).toBeUndefined()
    const warnings: string[] = []
    expect(normalizeWhisperCategories(['x'], m => warnings.push(m))).toBeUndefined()
    expect(warnings.join('\n')).toContain('must be an object')
  })
})

describe('normalizeWhisperResults', () => {
  it('keeps known outcomes, keeps an explicit empty pool (mute) and warns on unknown keys', () => {
    const warnings: string[] = []
    const pools = normalizeWhisperResults({ pass: ['自定义全绿'], done: [], bogus: ['x'] }, m => warnings.push(m))
    expect(pools).toEqual({ pass: ['自定义全绿'], done: [] })
    expect(warnings.join('\n')).toContain('unknown whisper result')
  })

  it('returns undefined for an absent or non-object section', () => {
    expect(normalizeWhisperResults(undefined)).toBeUndefined()
    const warnings: string[] = []
    expect(normalizeWhisperResults('x', m => warnings.push(m))).toBeUndefined()
    expect(warnings.join('\n')).toContain('must be an object')
  })
})

describe('normalizePanel', () => {
  it('normalizes labels, stats and the action subset', () => {
    const panel = normalizePanel({
      labels: { feed: '投喂', confirm: '好的', bogus: 'x' },
      stats: { rank: '好感 {rank}', points: '{points} 分' },
      actions: ['hide', 'feed', 'hide', 'bogus'],
    })
    expect(panel?.labels).toEqual({ feed: '投喂', confirm: '好的' })
    expect(panel?.stats).toEqual({ rank: '好感 {rank}', points: '{points} 分' })
    expect(panel?.actions).toEqual(['feed', 'hide'])
  })

  it('rejects non-string labels and labels carrying placeholders', () => {
    const warnings: string[] = []
    const panel = normalizePanel({ labels: { feed: 3, rename: '改名 {tool}' } }, m => warnings.push(m))
    expect(panel?.labels).toBeUndefined()
    expect(warnings.length).toBe(2)
  })

  it('keeps an explicit empty action list (hides every action)', () => {
    expect(normalizePanel({ actions: [] })?.actions).toEqual([])
  })
})

describe('mergeVoicePacks', () => {
  it('merges per-key with later layers winning', () => {
    const global = normalizeVoicePack({
      status: { done: ['全局收工'], thinking: ['全局思考'] },
      panel: { labels: { feed: '全局投喂' } },
    })
    const pet = normalizeVoicePack({
      status: { done: ['宠物收工'] },
      panel: { labels: { feed: '宠物投喂', hide: '宠物藏' } },
    })
    const merged = mergeVoicePacks(global, pet)
    expect(merged?.overrides.status?.done).toEqual(['宠物收工'])
    expect(merged?.overrides.status?.thinking).toEqual(['全局思考'])
    expect(merged?.panel?.labels).toEqual({ feed: '宠物投喂', hide: '宠物藏' })
  })

  it('lets the pet pack replace whisper keys while the global stays', () => {
    const global = normalizeVoicePack({ whispers: { categories: { thinking: ['全局思考'] }, results: { pass: ['全局全绿'] } } })
    const pet = normalizeVoicePack({ whispers: { categories: { thinking: ['宠物思考'] } } })
    const merged = mergeVoicePacks(global, pet)
    expect(merged?.overrides.whispers?.categories?.thinking).toEqual(['宠物思考'])
    expect(merged?.overrides.whispers?.results?.pass).toEqual(['全局全绿'])
  })

  it('warns and ignores the legacy generic / rules whisper fields', () => {
    const { pack, warnings } = collectWarnings({
      whispers: { generic: ['老环境池'], rules: [{ keywords: ['测试'], pool: ['老全绿'] }], categories: { thinking: ['新思考'] } },
    })
    expect(pack?.overrides.whispers?.categories?.thinking).toEqual(['新思考'])
    expect(pack?.overrides.whispers?.categories?.generic).toBeUndefined()
    expect(warnings.join('\n')).toContain('generic')
    expect(warnings.join('\n')).toContain('rules')
  })

  it('returns undefined when every layer is empty', () => {
    expect(mergeVoicePacks(undefined, undefined)).toBeUndefined()
  })
})

describe('normalizeVoicePack schema twin', () => {
  it('accepts the $schema field without a warning', () => {
    const { pack, warnings } = collectWarnings({
      $schema: 'http://json-schema.org/draft-07/schema#',
      status: { done: ['收工'] },
    })
    expect(pack).toBeDefined()
    expect(warnings).toEqual([])
  })

  it('drops the tail when the length cap cuts a placeholder token in half', () => {
    const line = 'x'.repeat(155) + '{tool}'
    const { pack, warnings } = collectWarnings({ tools: { shell: [line] } })
    expect(pack?.overrides.tools?.shell).toEqual(['x'.repeat(155)])
    expect(warnings.some(w => w.includes('unterminated placeholder'))).toBe(true)
  })
})

describe('voice-pack schema file drift lock', () => {
  const schema = JSON.parse(readFileSync(
    join(petPackageRoot(import.meta.url), 'contracts', 'voice-pack-v1.schema.json'),
    'utf8',
  )) as {
    properties: Record<string, { const?: number; properties?: Record<string, unknown>; items?: { enum?: string[] } }>
  }

  it('locks the schema top-level fields to the validator allow-list', () => {
    expect(new Set(Object.keys(schema.properties))).toEqual(VOICE_PACK_KEYS)
  })

  it('locks the scene, tool, whisper and panel key sets', () => {
    const props = schema.properties
    expect(new Set(Object.keys(props.status?.properties ?? {}))).toEqual(new Set(STATUS_SCENES))
    expect(new Set(Object.keys(props.tools?.properties ?? {}))).toEqual(new Set(TOOL_CATEGORIES))
    const whispers = props.whispers?.properties ?? {}
    expect(new Set(Object.keys(whispers))).toEqual(WHISPER_KEYS)
    expect(new Set(Object.keys((whispers.categories as { properties?: Record<string, unknown> })?.properties ?? {}))).toEqual(new Set(WHISPER_CATEGORIES))
    expect(new Set(Object.keys((whispers.results as { properties?: Record<string, unknown> })?.properties ?? {}))).toEqual(new Set(WHISPER_RESULTS))
    const panel = props.panel?.properties ?? {}
    const labels = (panel.labels as { properties?: Record<string, unknown> } | undefined)?.properties ?? {}
    const stats = (panel.stats as { properties?: Record<string, unknown> } | undefined)?.properties ?? {}
    expect(new Set(Object.keys(labels))).toEqual(new Set(PANEL_LABEL_KEYS))
    expect(new Set(Object.keys(stats))).toEqual(new Set(PANEL_STAT_KEYS))
    const actions = (panel.actions as { items?: { enum?: string[] } } | undefined)
    expect(actions?.items?.enum).toEqual([...PANEL_ACTIONS])
  })

  it('keeps the schema version const in sync', () => {
    expect(schema.properties.voicePackVersion?.const).toBe(VOICE_PACK_V1)
  })
})
