/**
 * Chatter unit tests: the status voice (scene-stable lines, cadence rotation,
 * per-tool families, argument hints) and the murmur engine (keyword moods,
 * cooldown, output-volume budget). Everything is deterministic round-robin,
 * so exact lines are asserted.
 */
import { describe, expect, it } from 'vitest'
import {
  STATUS_POOLS,
  StatusVoice,
  TOOL_POOLS,
  toolArgHint,
  toolCategory,
  WHISPER_CATEGORY_POOLS,
  WHISPER_RESULT_POOLS,
  looksLikeTestTool,
  WhisperEngine,
  type VoicePackOverrides,
} from './chatter.ts'

describe('StatusVoice', () => {
  it('opens every scene with its legacy fixed line', () => {
    // The first pool line is the wording the plugin has always shown.
    expect(STATUS_POOLS.prepare[0]).toBe('准备开始')
    expect(STATUS_POOLS.waiting[0]).toBe('等待模型响应')
    expect(STATUS_POOLS.thinking[0]).toBe('正在思考')
    expect(STATUS_POOLS.review[0]).toBe('整理回复中')
    expect(STATUS_POOLS.toolResult[0]).toBe('处理工具结果')
    expect(STATUS_POOLS.done[0]).toBe('完成啦')
    expect(STATUS_POOLS.failed[0]).toBe('执行失败')
    expect(STATUS_POOLS.toolFailed[0]).toBe('工具执行失败')
  })

  it('keeps the line stable while a scene repeats within the rotation window', () => {
    const voice = new StatusVoice()
    // Streamed chunks re-emit the same scene many times a second: the copy
    // must not flicker per chunk.
    expect(voice.scene('thinking', 1000)).toBe('正在思考')
    expect(voice.scene('thinking', 2000)).toBe('正在思考')
    expect(voice.scene('thinking', 4999)).toBe('正在思考')
  })

  it('advances the line once the scene persists past the rotation cadence', () => {
    const voice = new StatusVoice()
    expect(voice.scene('thinking', 1000)).toBe('正在思考')
    expect(voice.scene('thinking', 5001)).toBe(STATUS_POOLS.thinking[1])
    expect(voice.scene('thinking', 9002)).toBe(STATUS_POOLS.thinking[2])
  })

  it('rotates round-robin when a scene is revisited after another scene', () => {
    const voice = new StatusVoice()
    expect(voice.scene('thinking', 0)).toBe(STATUS_POOLS.thinking[0])
    expect(voice.scene('review', 100)).toBe(STATUS_POOLS.review[0])
    expect(voice.scene('thinking', 200)).toBe(STATUS_POOLS.thinking[1])
  })

  it('interpolates the tool name and argument hint into tool lines', () => {
    const voice = new StatusVoice()
    expect(voice.tool('bash', 'bash', 'npm test', 0)).toBe('正在使用 bash')
    // Same family within the window: the pool line repeats but the CURRENT
    // call's name/hint are interpolated, so copy never goes stale.
    expect(voice.tool('bash', 'bash', 'pnpm build', 100)).toBe('正在使用 bash')
    // Past the cadence the shell family rotates to a hint-carrying line.
    const rotated = voice.tool('bash', 'bash', 'npm test', 5000)
    expect(rotated).toBe(TOOL_POOLS.shell[1]!.replace('{hint}', 'npm test'))
  })

  it('falls back to the tool name when no argument hint is available', () => {
    const voice = new StatusVoice()
    const line = voice.tool('grep', 'grep', undefined, 5000)
    expect(line).not.toContain('{hint}')
    expect(line).not.toContain('{tool}')
  })

  it('interpolates the running count into the remaining-tools line', () => {
    const voice = new StatusVoice()
    expect(voice.toolRemaining(1, 0)).toBe('还有 1 个工具运行中')
    expect(voice.toolRemaining(3, 5000)).toContain('3')
  })
})

describe('toolCategory', () => {
  it('maps the common tool vocabulary onto copy families', () => {
    expect(toolCategory('read')).toBe('read')
    expect(toolCategory('write')).toBe('write')
    expect(toolCategory('edit')).toBe('edit')
    expect(toolCategory('str_replace_editor')).toBe('edit')
    expect(toolCategory('run_code')).toBe('shell')
    expect(toolCategory('bash')).toBe('shell')
    expect(toolCategory('grep')).toBe('grep')
    expect(toolCategory('glob')).toBe('find')
    expect(toolCategory('web_search')).toBe('webSearch')
    expect(toolCategory('browserFetch')).toBe('webFetch')
    expect(toolCategory('mcp__mem0__search_memories')).toBe('memory')
    expect(toolCategory('subagent')).toBe('subagent')
    expect(toolCategory('todo_write')).toBe('todo')
    expect(toolCategory('some_future_tool')).toBe('generic')
  })
})

describe('toolArgHint', () => {
  it('extracts the shell command', () => {
    expect(toolArgHint('bash', '{"command":"npm test"}')).toBe('npm test')
    expect(toolArgHint('run_code', '{"code":"console.log(1)"}')).toBe('console.log(1)')
  })

  it('reduces file paths to their basename', () => {
    expect(toolArgHint('read', '{"file_path":"/repo/src/client/PetSprite.tsx"}')).toBe('PetSprite.tsx')
  })

  it('extracts search patterns and web queries', () => {
    expect(toolArgHint('grep', '{"pattern":"bubbleStack"}')).toBe('bubbleStack')
    expect(toolArgHint('web_search', '{"query":"dsh 插件"}')).toBe('dsh 插件')
  })

  it('stays hintless for unparseable or shapeless arguments', () => {
    expect(toolArgHint('bash', 'not json')).toBeUndefined()
    expect(toolArgHint('bash', '[]')).toBeUndefined()
    expect(toolArgHint('bash', '{"timeout":1000}')).toBeUndefined()
  })

  it('caps long hints so the bubble stays compact', () => {
    const hint = toolArgHint('bash', JSON.stringify({ command: 'x'.repeat(60) }))
    expect(hint).toBeDefined()
    expect(hint!.length).toBeLessThanOrEqual(28)
    expect(hint!.endsWith('...')).toBe(true)
  })
})

describe('WhisperEngine', () => {
  it('speaks a category line for the current situation, then respects the cooldown', () => {
    const engine = new WhisperEngine()
    expect(engine.feed('thinking', 0)).toBe(WHISPER_CATEGORY_POOLS.thinking[0])
    expect(engine.feed('writing', 1)).toBeUndefined()
  })

  it('rotates within each category and keeps the category cursors apart', () => {
    const engine = new WhisperEngine()
    expect(engine.feed('thinking', 0)).toBe(WHISPER_CATEGORY_POOLS.thinking[0])
    expect(engine.feed('writing', 9001)).toBe(WHISPER_CATEGORY_POOLS.writing[0])
    expect(engine.feed('thinking', 18002)).toBe(WHISPER_CATEGORY_POOLS.thinking[1])
  })

  it('stays quiet on an explicitly muted category', () => {
    const engine = new WhisperEngine(() => ({ whispers: { categories: { thinking: [] } } }))
    expect(engine.feed('thinking', 0)).toBeUndefined()
  })

  it('wakes outcome whispers on their own shorter cooldown and rotates per outcome', () => {
    const engine = new WhisperEngine()
    expect(engine.result('pass', 0)).toBe(WHISPER_RESULT_POOLS.pass[0])
    expect(engine.result('fail', 1000)).toBeUndefined()
    expect(engine.result('fail', 5001)).toBe(WHISPER_RESULT_POOLS.fail[0])
    expect(engine.result('pass', 10002)).toBe(WHISPER_RESULT_POOLS.pass[1])
  })

  it('paces category and outcome whispers against one shared clock', () => {
    const engine = new WhisperEngine()
    expect(engine.feed('writing', 0)).toBe(WHISPER_CATEGORY_POOLS.writing[0])
    // An outcome right after a category reply must wait the outcome cooldown.
    expect(engine.result('done', 4999)).toBeUndefined()
    expect(engine.result('done', 5000)).toBe(WHISPER_RESULT_POOLS.done[0])
    // After an outcome, the category must wait the full category cooldown
    // measured from the outcome whisper (5000), so 14000 is the next slot.
    expect(engine.feed('thinking', 5001)).toBeUndefined()
    expect(engine.feed('thinking', 14000)).toBe(WHISPER_CATEGORY_POOLS.thinking[0])
  })

  it('mutes an outcome with an explicit empty pool', () => {
    const engine = new WhisperEngine(() => ({ whispers: { results: { fail: [] } } }))
    expect(engine.result('fail', 0)).toBeUndefined()
  })
})

describe('looksLikeTestTool', () => {
  it('recognizes test tools by name and by shell command', () => {
    expect(looksLikeTestTool('run_tests', undefined)).toBe(true)
    expect(looksLikeTestTool('run_code', '{"command":"npm test"}')).toBe(true)
    expect(looksLikeTestTool('run_code', '{"command":"pnpm run test -- --run"}')).toBe(true)
    expect(looksLikeTestTool('bash', '{"command":"pytest -q"}')).toBe(true)
    expect(looksLikeTestTool('bash', '{"command":"go test ./..."}')).toBe(true)
    expect(looksLikeTestTool('run_code', '{"code":"import pytest"}')).toBe(true)
  })

  it('does not misfire on ordinary tools or mentions in generic code', () => {
    expect(looksLikeTestTool('bash', '{"command":"node server.js"}')).toBe(false)
    expect(looksLikeTestTool('grep', '{"pattern":"test"}')).toBe(false)
    expect(looksLikeTestTool('read', '{"file_path":"/repo/test/fixture.txt"}')).toBe(false)
    expect(looksLikeTestTool('run_code', '{"code":"server.listen(8080)"}')).toBe(false)
  })
})

describe('voice-pack overrides (pet-center M4)', () => {
  const PACK = (): VoicePackOverrides => ({
    status: {
      done: ['自定义完工', '第二句完工'],
      thinking: [],
    },
    tools: {
      shell: ['敲命令 {hint}', '再来一次 {tool}'],
    },
    toolRemaining: ['后台还有 {n} 个'],
    whispers: {
      categories: { thinking: ['自定义思考', '自定义思考二'] },
      results: { pass: ['自定义全绿'] },
    },
  })

  it('replaces a scene pool and keeps untouched scenes on the built-in pools', () => {
    const voice = new StatusVoice(PACK)
    expect(voice.scene('done', 0)).toBe('自定义完工')
    expect(voice.scene('done', 5000)).toBe('第二句完工')
    expect(voice.scene('thinking', 0)).toBe(STATUS_POOLS.thinking[0])
  })

  it('falls back to the built-in pool when the override pool is empty', () => {
    const voice = new StatusVoice(PACK)
    // PACK.thinking is an empty array: a scene line always renders.
    expect(voice.scene('thinking', 0)).toBe(STATUS_POOLS.thinking[0])
  })

  it('interpolates placeholders from an overridden tool pool', () => {
    const voice = new StatusVoice(PACK)
    expect(voice.tool('bash', 'bash', 'npm test', 0)).toBe('敲命令 npm test')
    const rotated = voice.tool('bash', 'bash', 'npm test', 5000)
    expect(rotated).toBe('再来一次 bash')
  })

  it('uses an overridden remaining-tools pool', () => {
    const voice = new StatusVoice(PACK)
    expect(voice.toolRemaining(4, 0)).toBe('后台还有 4 个')
  })

  it('interpolates every occurrence of a repeated placeholder', () => {
    const pack: ReturnType<typeof PACK> = {
      ...PACK(),
      tools: { shell: ['{tool} 和 {tool} 一起跑 {hint} {hint}'] },
      toolRemaining: ['{n} 路并进，共 {n} 路'],
    }
    const voice = new StatusVoice(() => pack)
    expect(voice.tool('bash', 'bash', 'npm test', 0)).toBe('bash 和 bash 一起跑 npm test npm test')
    expect(voice.toolRemaining(2, 5000)).toBe('2 路并进，共 2 路')
  })

  it('follows a provider swap on the next draw without rebuilding the engine', () => {
    let pack: ReturnType<typeof PACK> = PACK()
    const voice = new StatusVoice(() => pack)
    expect(voice.scene('done', 0)).toBe('自定义完工')
    pack = { ...PACK(), status: { done: ['换声了'] } }
    expect(voice.scene('done', 5000)).toBe('换声了')
  })

  it('replaces whisper category pools per key', () => {
    const engine = new WhisperEngine(PACK)
    expect(engine.feed('thinking', 0)).toBe('自定义思考')
    expect(engine.feed('writing', 9000)).toBe(WHISPER_CATEGORY_POOLS.writing[0])
    expect(engine.feed('thinking', 18000)).toBe('自定义思考二')
  })

  it('replaces whisper outcome pools per key', () => {
    const engine = new WhisperEngine(PACK)
    expect(engine.result('pass', 0)).toBe('自定义全绿')
    expect(engine.result('fail', 5001)).toBe(WHISPER_RESULT_POOLS.fail[0])
  })

  it('mutes a whisper channel with an explicit empty override', () => {
    const engine = new WhisperEngine(() => ({ whispers: { categories: { thinking: [] }, results: { done: [] } } }))
    expect(engine.feed('thinking', 0)).toBeUndefined()
    expect(engine.result('done', 0)).toBeUndefined()
  })
})
