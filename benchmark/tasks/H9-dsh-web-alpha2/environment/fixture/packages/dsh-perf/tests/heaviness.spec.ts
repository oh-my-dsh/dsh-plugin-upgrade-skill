import { describe, expect, it, vi } from 'vitest'
import { scoreBlocks } from '../src/client/perf-heaviness'

describe('scoreBlocks (#2 负载加权)', () => {
  it('纯文本按字符数计分', () => {
    expect(scoreBlocks([{ kind: 'text', text: 'a'.repeat(1000) }])).toBe(1000)
  })

  it('代码围栏字符双倍计权: 15k 全代码消息超过 20k 阈值', () => {
    const fence = '```ts\n' + 'x'.repeat(15000) + '\n```'
    const score = scoreBlocks([{ kind: 'text', text: fence }])
    expect(score).toBeGreaterThan(20000)
    expect(score).toBeLessThanOrEqual(fence.length * 2)
  })

  it('未闭合围栏按到结尾计(流式中间态安全)', () => {
    const open = '```ts\n' + 'x'.repeat(5000)
    expect(scoreBlocks([{ kind: 'text', text: open }])).toBeGreaterThan(10000)
  })

  it('数学公式按固定成本加权', () => {
    const text = '前 ' + '$$E=mc^2$$'.repeat(4) + ' 后'
    const plain = scoreBlocks([{ kind: 'text', text: '前  后' }])
    const score = scoreBlocks([{ kind: 'text', text }])
    expect(score - plain).toBeGreaterThanOrEqual(4 * 1000)
  })

  it('reasoning 低权重: 100k 推理不触发 20k 阈值', () => {
    expect(scoreBlocks([{ kind: 'reasoning', text: 'r'.repeat(100000) }])).toBe(20000)
  })

  it('tool-call argsRaw 低权重', () => {
    expect(scoreBlocks([{ kind: 'tool-call', argsRaw: 'a'.repeat(40000) }])).toBe(10000)
  })

  it('空/缺字段安全', () => {
    expect(scoreBlocks([{}, { kind: 'text' }, { kind: 'unknown' }])).toBe(0)
  })
  it('病态定界符输入不会回溯失控', () => {
    const nasty = '$$'.repeat(5000) + '\\['.repeat(5000)
    const t0 = Date.now()
    scoreBlocks([{ kind: 'text', text: nasty }])
    expect(Date.now() - t0).toBeLessThan(200)
  })
})