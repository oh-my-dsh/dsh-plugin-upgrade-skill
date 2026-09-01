import { describe, expect, it, vi } from 'vitest'
import { makeFlipQueue } from '../src/client/perf-flip-queue'

describe('makeFlipQueue (#1 settle 串行翻转)', () => {
  it('单条消息在 delayMs 后翻转', () => {
    vi.useFakeTimers()
    const queue = makeFlipQueue({ delayMs: 600, intervalMs: 120 })
    const fire = vi.fn()
    queue.enqueue(fire)
    vi.advanceTimersByTime(599)
    expect(fire).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fire).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('N 条同刻入队的消息按 intervalMs 串行翻转, 不同帧突发', () => {
    vi.useFakeTimers()
    const queue = makeFlipQueue({ delayMs: 600, intervalMs: 120 })
    const fires = [vi.fn(), vi.fn(), vi.fn()]
    for (const fire of fires) queue.enqueue(fire)
    vi.advanceTimersByTime(600)
    expect(fires[0]).toHaveBeenCalledTimes(1)
    expect(fires[1]).not.toHaveBeenCalled()
    vi.advanceTimersByTime(120)
    expect(fires[1]).toHaveBeenCalledTimes(1)
    expect(fires[2]).not.toHaveBeenCalled()
    vi.advanceTimersByTime(120)
    expect(fires[2]).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('取消函数阻止翻转(组件卸载)', () => {
    vi.useFakeTimers()
    const queue = makeFlipQueue({ delayMs: 600, intervalMs: 120 })
    const fire = vi.fn()
    const cancel = queue.enqueue(fire)
    cancel()
    vi.advanceTimersByTime(5000)
    expect(fire).not.toHaveBeenCalled()
    expect(queue.size).toBe(0)
    vi.useRealTimers()
  })

  it('晚入队的消息eligibleAt 顺延, 不插先前的队', () => {
    vi.useFakeTimers()
    const queue = makeFlipQueue({ delayMs: 600, intervalMs: 120 })
    const first = vi.fn()
    const second = vi.fn()
    queue.enqueue(first)
    vi.advanceTimersByTime(300)
    queue.enqueue(second)
    vi.advanceTimersByTime(300) // t=600: first 翻转
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled() // second 需 t=900 才 eligible
    vi.advanceTimersByTime(300) // t=900
    expect(second).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})