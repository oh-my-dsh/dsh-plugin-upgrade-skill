/**
 * dsh-perf settle 翻转全局串行队列(#1)。
 *
 * 问题(实测): 旧实现给每条 heavy 消息一个独立的 600ms 定时器。会话打开、多步
 * 回合、批量消息结束时, N 条 heavy 消息在同一帧集体翻转 -> 单帧内串起 N x
 * (全量 markdown 解析 + 每围栏 shiki codeToHtml + 每公式 KaTeX renderToString
 * + innerHTML 解析), 官方管线没有任何错峰机制(全 bundle 无 requestIdleCallback
 * / scheduler.postTask)。
 *
 * 设计: 模块级 FIFO 队列。每条消息入队时带 eligibleAt = 入队时刻 + delayMs
 * (保持原有"终态高亮至少延迟 600ms"的观感承诺); 队列排空时每次只翻转一条,
 * 相邻翻转至少间隔 intervalMs —— 把 N 条消息的同步突发摊成 N 帧, 帧间可绘制、
 * 可响应输入。只改翻转时机, 不动官方渲染器与 data 形状, 终态逐像素一致。
 *
 * 纯模块, 时钟与定时器可注入, 供单测直接驱动。
 */

export interface FlipQueueOptions {
  /** 单条消息入队后的最小延迟(对应原 FINALIZE_DELAY_MS)。 */
  delayMs: number
  /** 相邻两次翻转的最小间隔。 */
  intervalMs: number
  now?: () => number
  setTimeoutFn?: (fn: () => void, ms: number) => unknown
  clearTimeoutFn?: (handle: unknown) => void
}

export interface FlipQueue {
  /** 入队一次翻转; 返回取消函数(组件卸载时调用, 已翻转则为空操作)。 */
  enqueue: (fire: () => void) => () => void
  /** 当前待翻转条数(诊断/测试用)。 */
  readonly size: number
}

interface FlipRequest {
  eligibleAt: number
  fire: () => void
}

export function makeFlipQueue(options: FlipQueueOptions): FlipQueue {
  const now = options.now ?? ((): number => Date.now())
  const setTimeoutFn = options.setTimeoutFn ?? ((fn: () => void, ms: number): unknown => setTimeout(fn, ms))
  const clearTimeoutFn = options.clearTimeoutFn ?? ((handle: unknown): void => { clearTimeout(handle as Parameters<typeof clearTimeout>[0]) })
  const queue: FlipRequest[] = []
  let timer: unknown
  let lastFlipAt = 0

  function pump(): void {
    if (timer !== undefined || queue.length === 0) return
    const head = queue[0]
    if (head === undefined) return
    const at = now()
    let wait = Math.max(head.eligibleAt - at, 0)
    if (lastFlipAt > 0) wait = Math.max(wait, lastFlipAt + options.intervalMs - at)
    timer = setTimeoutFn((): void => {
      timer = undefined
      const request = queue.shift()
      if (request !== undefined) {
        lastFlipAt = now()
        request.fire()
      }
      pump()
    }, wait)
  }

  return {
    enqueue(fire: () => void): () => void {
      const request: FlipRequest = { eligibleAt: now() + options.delayMs, fire }
      queue.push(request)
      pump()
      return (): void => {
        const index = queue.indexOf(request)
        if (index >= 0) queue.splice(index, 1)
      }
    },
    get size(): number {
      return queue.length
    },
  }
}
