import { monitorEventLoopDelay } from 'node:perf_hooks'
type EventLoopDelayMonitor = ReturnType<typeof monitorEventLoopDelay>
import type { Context } from '@deepseek-ai/cordis'

export type PerfMode = 'off' | 'balanced' | 'aggressive'

export interface PerfMeterOptions {
  /** HUD 与服务端观测开关: off 时仅保留路由占位, 不订阅事件、不采样。 */
  mode: PerfMode
  /** 采样周期(毫秒), 也是 bucket 粒度。 */
  meterIntervalMs: number
  /** 环形窗口保留时间(秒), 用于 events/s 与类型分布。 */
  statsWindowSeconds: number
  /** bundle patch 应用的写批延迟(毫秒), 展示用。 */
  batchDelayMs: number
  /** 活跃会话告警阈值(≥ 时亮警): 默认 5 个并发 subagent/会话即提示。 */
  maxActiveSessions: number
  /** 全局事件速率告警阈值(events/s, ≥ 时亮警)。 */
  maxEventsPerSec: number
}

interface PerfBucket {
  at: number
  perSession: ReadonlyMap<string, number>
  types: Record<string, number>
}

export interface PerfSessionStat {
  id: string
  eventsPerSec: number
  lastType: string
  /** agent 状态(idle/running/…, 有 agent/status 迁移事件时) */
  status?: string
}

export interface PerfAlert {
  kind: 'sessions' | 'events' | 'both'
  activeSessions: number
  eventsPerSec: number
  maxSessions: number
  maxEventsPerSec: number
}

export interface PerfStats {
  ok: true
  ts: number
  uptimeMs: number
  mode: PerfMode
  meterIntervalMs: number
  batchDelayMs: number
  elDelay: { meanMs: number; p99Ms: number; maxMs: number }
  mem: { rssMB: number; heapUsedMB: number }
  events: { perSec: number; window: number; activeSessions: number; idleSessions?: number }
  topSessions: PerfSessionStat[]
  eventTypes: Record<string, number>
  alert: PerfAlert | null
}

export class PerfMeter {
  private readonly buckets: PerfBucket[] = []
  private readonly el: EventLoopDelayMonitor
  private timer: ReturnType<typeof setInterval> | undefined
  private disposed = false
  private started = false
  private windowMs: number
  private readonly lastTypeBySession = new Map<string, string>()
  private pendingSessions = new Map<string, number>()
  private pendingTypes: Record<string, number> = {}
  private lastDelay: { meanMs: number; p99Ms: number; maxMs: number } = { meanMs: 0, p99Ms: 0, maxMs: 0 }
  private readonly agentStatus = new Map<string, { status: string; at: number }>()

  constructor(
    private readonly ctx: Context,
    private options: PerfMeterOptions,
  ) {
    this.el = monitorEventLoopDelay({ resolution: 10 })
    this.windowMs = options.statsWindowSeconds * 1000
  }

  /** (Re)apply host-side options; cheap, safe to call on settings change. */
  applyOptions(options: PerfMeterOptions): void {
    this.windowMs = options.statsWindowSeconds * 1000
    const intervalChanged = options.meterIntervalMs !== this.options.meterIntervalMs
    const wasOff = this.options.mode === 'off'
    this.options = options
    if (wasOff && options.mode !== 'off' && this.started) { this.el.enable(); this.attach() }
    if (!wasOff && options.mode === 'off' && this.started) { this.detach(); this.el.disable() }
    if (intervalChanged && this.timer !== undefined) {
      clearInterval(this.timer)
      this.timer = setInterval(() => this.tick(), options.meterIntervalMs)
      this.timer.unref?.()
    }
  }

  start(): void {
    if (this.started) return
    this.started = true
    if (this.options.mode !== 'off') {
      this.el.enable()
      this.attach()
    }
    this.timer = setInterval(() => this.tick(), this.options.meterIntervalMs)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.disposed) return
    this.disposed = true
    this.detach()
    if (this.timer !== undefined) clearInterval(this.timer)
    this.el.disable()
    this.started = false
  }

  private attached = false
  private readonly disposers: (() => void)[] = []

  private attach(): void {
    if (this.attached) return
    this.attached = true
    const ctx = this.ctx as unknown as {
      on(event: string, listener: (subject: unknown, event: unknown) => void): () => void
    }
    const offEvent = ctx.on('session/event', (subject, event) => {
      const ev = event as { type?: string }
      const type = typeof ev?.type === 'string' ? ev.type : 'unknown'
      const id = (subject as { id?: string } | undefined)?.id ?? 'root'
      this.noteEvent(id, type)
    })
    if (typeof offEvent === 'function') this.disposers.push(offEvent)
    // agent 空闲/运行状态时间线(零上游观测): agent/status 由 agent-loop 迁移时发射。
    const offStatus = ctx.on('agent/status', (subject: unknown, data: unknown) => {
      const d = (data ?? subject) as { status?: unknown; id?: unknown } | undefined
      const status = typeof d?.status === 'string' ? d.status : 'unknown'
      const id = typeof d?.id === 'string' ? d.id : typeof (subject as { id?: unknown } | undefined)?.id === 'string' ? (subject as { id: string }).id : undefined
      if (id === undefined) return
      this.agentStatus.set(id, { status, at: Date.now() })
    })
    if (typeof offStatus === 'function') this.disposers.push(offStatus)
  }

  private detach(): void {
    for (const dispose of this.disposers) { try { dispose() } catch { /* noop */ } }
    this.disposers.length = 0
    this.attached = false
  }

  private noteEvent(id: string, type: string): void {
    this.pendingSessions.set(id, (this.pendingSessions.get(id) ?? 0) + 1)
    this.lastTypeBySession.set(id, type)
    this.pendingTypes[type] = (this.pendingTypes[type] ?? 0) + 1
  }

  /** 每 tick 归档 pending 到 per-session bucket; 读取 EL 延迟并清零。 */
  private tick(): void {
    const at = Date.now()
    if (this.pendingSessions.size > 0) {
      this.buckets.push({ at, perSession: new Map(this.pendingSessions), types: this.pendingTypes })
      this.pendingSessions.clear()
      this.pendingTypes = {}
    }
    this.compactBuckets(at)
    const meanMs = this.el.mean / 1e6
    const p99Ms = this.el.percentile(99) / 1e6
    const maxMs = this.el.max / 1e6
    this.el.reset()
    this.lastDelay = { meanMs, p99Ms, maxMs }
  }

  private compactBuckets(at: number): void {
    const cutoff = at - this.windowMs
    while (this.buckets.length > 0 && this.buckets[0].at < cutoff) this.buckets.shift()
    // 窗口外会话的 lastType 无界增长防护: 按当前窗口活跃集清理。
    const alive = new Set<string>()
    for (const bucket of this.buckets) { for (const id of bucket.perSession.keys()) alive.add(id) }
    for (const id of this.lastTypeBySession.keys()) { if (!alive.has(id)) this.lastTypeBySession.delete(id) }
    for (const id of this.agentStatus.keys()) { if (!alive.has(id)) this.agentStatus.delete(id) }
  }

  /** 窗口内聚合: 总速率 / 每会话速率 / 事件类型分布。 */
  private windowAggregate(): {
    perSec: number
    window: number
    activeSessions: number
    topSessions: PerfSessionStat[]
    eventTypes: Record<string, number>
  } {
    const bySession = new Map<string, number>()
    const types = new Map<string, number>()
    let count = 0
    for (const bucket of this.buckets) {
      for (const [id, n] of bucket.perSession) {
        count += n
        bySession.set(id, (bySession.get(id) ?? 0) + n)
      }
      for (const [type, n] of Object.entries(bucket.types)) {
        types.set(type, (types.get(type) ?? 0) + n)
      }
    }
    const seconds = Math.max(1, this.windowMs / 1000)
    const topSessions: PerfSessionStat[] = [...bySession.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, n]) => ({
        id,
        eventsPerSec: Math.round((n / seconds) * 10) / 10,
        lastType: this.lastTypeBySession.get(id) ?? 'unknown',
        status: this.agentStatus.get(id)?.status,
      }))
    return {
      perSec: Math.round((count / seconds) * 10) / 10,
      window: count,
      activeSessions: bySession.size,
      topSessions,
      eventTypes: Object.fromEntries([...types.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)),
    }
  }

  snapshot(): PerfStats {
    const agg = this.windowAggregate()
    const mem = process.memoryUsage()
    const sessionsOver = agg.activeSessions >= this.options.maxActiveSessions
    const eventsOver = agg.perSec >= this.options.maxEventsPerSec
    const alert: PerfAlert | null = sessionsOver || eventsOver
      ? {
          kind: sessionsOver && eventsOver ? 'both' : sessionsOver ? 'sessions' : 'events',
          activeSessions: agg.activeSessions,
          eventsPerSec: agg.perSec,
          maxSessions: this.options.maxActiveSessions,
          maxEventsPerSec: this.options.maxEventsPerSec,
        }
      : null
    return {
      ok: true,
      ts: Date.now(),
      uptimeMs: process.uptime() * 1000,
      mode: this.options.mode,
      meterIntervalMs: this.options.meterIntervalMs,
      batchDelayMs: this.options.batchDelayMs,
      elDelay: this.lastDelay,
      mem: { rssMB: Math.round(mem.rss / 1048576), heapUsedMB: Math.round(mem.heapUsed / 1048576) },
      events: { perSec: agg.perSec, window: agg.window, activeSessions: agg.activeSessions },
      topSessions: agg.topSessions,
      eventTypes: agg.eventTypes,
      alert,
    }
  }
}