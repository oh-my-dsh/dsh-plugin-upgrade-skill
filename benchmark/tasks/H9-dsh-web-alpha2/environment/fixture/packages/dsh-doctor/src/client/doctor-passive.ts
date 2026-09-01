/**
 * Passive browser failure probe for the dsh-doctor recovery console.
 *
 * Captures window error and unhandledrejection events into a bounded ring
 * buffer and notifies a consumer. Also serves as the single incident sink for
 * app-level signals the console itself produces (React boundary catches and
 * connection-rebuild boot signals), so everything appears in one probe list.
 *
 * Resilience contract: no method of this module ever throws. Event listeners
 * read event facts structurally because jsdom (tests) and browsers may hand us
 * differently shaped event objects; every read is guarded.
 * @module @linxin666/dsh-doctor/client
 */

/** Kinds of passive incident the probe can carry. */
export type PassiveKind =
  | 'window-error'
  | 'unhandled-rejection'
  | 'react-boundary'
  | 'connection-reset'
  | 'plugin-startup-failure'

/** One captured passive incident. */
export interface PassiveIncident {
  /** Monotonic id inside this probe instance. */
  id: string
  kind: PassiveKind
  /** Human-readable message (never raw structured data). */
  message: string
  /** Event source path, when the event carried one. */
  source?: string
  /** 1-based line number, when available. */
  line?: number
  /** 1-based column number, when available. */
  column?: number
  /** Longer detail (stack excerpt or described reason), capped. */
  detail?: string
  /** Epoch ms of capture. */
  at: number
}

/** Structural shape of a window error event (browser ErrorEvent or test fake). */
interface ErrorEventLike {
  message?: unknown
  filename?: unknown
  lineno?: unknown
  colno?: unknown
  error?: unknown
}

/** Structural shape of an unhandledrejection event (browser or test fake). */
interface RejectionEventLike {
  reason?: unknown
}

/** Options for PassiveProbe. */
export interface PassiveProbeOptions {
  /** Push each captured batch; the consumer merges it into its store. */
  notify: (incidents: readonly PassiveIncident[]) => void
  /** Ring capacity (default 50). */
  max?: number
  /** Clock seam (default Date.now). */
  now?: () => number
}

/** Max detail length kept per incident. */
const MAX_DETAIL_CHARS = 800

/** Max message length kept per incident. */
const MAX_MESSAGE_CHARS = 300

/** Skip an exact repeat of the last incident within this window (ms). */
const DEDUPE_WINDOW_MS = 2_000

/** Cap a string, appending an ellipsis when truncated. */
export function capText(text: string, limit: number): string {
  if (text.length <= limit) return text
  return text.slice(0, limit) + '...'
}

/** Produce a safe, plain-text description of an unknown error value. */
export function safeDescribe(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  if (typeof value === 'string') return capText(value, MAX_DETAIL_CHARS)
  if (typeof value !== 'object') return String(value)
  if (value instanceof Error) {
    const name = value.name || 'Error'
    const message = capText(value.message ?? '', MAX_MESSAGE_CHARS)
    const stack = typeof value.stack === 'string' ? capText(value.stack, MAX_DETAIL_CHARS) : ''
    return name + ': ' + message + (stack !== '' ? '\n' + stack : '')
  }
  try {
    const seen = new Set<unknown>()
    const text = JSON.stringify(value, (_key, inner) => {
      if (typeof inner === 'object' && inner !== null) {
        if (seen.has(inner)) return '[circular]'
        seen.add(inner)
        if (Array.isArray(inner) && inner.length > 20) return inner.slice(0, 20).concat('[...]')
      }
      return inner
    })
    return capText(text ?? String(value), MAX_DETAIL_CHARS)
  } catch {
    return capText(String(value), MAX_DETAIL_CHARS)
  }
}

/** Normalize one window error event into incident fields (never throws). */
export function normalizeWindowError(event: unknown): Pick<PassiveIncident, 'message' | 'source' | 'line' | 'column' | 'detail'> {
  if (typeof event === 'object' && event !== null && 'message' in event) {
    const like = event as ErrorEventLike
    const message = safeDescribe(like.message ?? like.error ?? 'unknown window error')
    const source = typeof like.filename === 'string' && like.filename !== '' ? like.filename : undefined
    const line = typeof like.lineno === 'number' && Number.isFinite(like.lineno) ? Math.trunc(like.lineno) : undefined
    const column = typeof like.colno === 'number' && Number.isFinite(like.colno) ? Math.trunc(like.colno) : undefined
    const detail = like.error === undefined ? undefined : safeDescribe(like.error)
    return { message: capText(message, MAX_MESSAGE_CHARS), source, line, column, detail }
  }
  return { message: capText(safeDescribe(event), MAX_MESSAGE_CHARS) }
}

/** Normalize one unhandledrejection event into incident fields (never throws). */
export function normalizeRejection(event: unknown): Pick<PassiveIncident, 'message' | 'detail'> {
  if (typeof event === 'object' && event !== null && 'reason' in event) {
    const like = event as RejectionEventLike
    const reason = like.reason
    const message = capText(safeDescribe(reason), MAX_MESSAGE_CHARS)
    const detail = reason instanceof Error ? safeDescribe(reason) : undefined
    return { message, detail }
  }
  return { message: capText(safeDescribe(event), MAX_MESSAGE_CHARS) }
}

/**
 * Bounded, non-throwing capture of window failure events plus the app-level
 * signal sink. Start once per page; stop on plugin teardown.
 */
export class PassiveProbe {
  private readonly notify: (incidents: readonly PassiveIncident[]) => void
  private readonly max: number
  private readonly now: () => number
  private readonly incidents: PassiveIncident[] = []
  private sequence = 0
  private started = false
  private readonly onError = (event: unknown): void => {
    try {
      this.push('window-error', normalizeWindowError(event))
    } catch {
      // The probe must never take the GUI down.
    }
  }
  private readonly onRejection = (event: unknown): void => {
    try {
      this.push('unhandled-rejection', normalizeRejection(event))
    } catch {
      // The probe must never take the GUI down.
    }
  }

  constructor(options: PassiveProbeOptions) {
    this.notify = options.notify
    this.max = options.max ?? 50
    this.now = options.now ?? (() => Date.now())
  }

  /** Install window listeners (no-op outside a browser window). */
  start(): void {
    if (this.started) return
    try {
      if (typeof window === 'undefined') return
      window.addEventListener('error', this.onError as EventListener)
      window.addEventListener('unhandledrejection', this.onRejection as EventListener)
      this.started = true
    } catch {
      this.started = false
    }
  }

  /** Remove window listeners and stop capturing raw window events. */
  stop(): void {
    if (!this.started) return
    try {
      if (typeof window !== 'undefined') {
        window.removeEventListener('error', this.onError as EventListener)
        window.removeEventListener('unhandledrejection', this.onRejection as EventListener)
      }
    } catch {
      // Teardown must never throw.
    }
    this.started = false
  }

  /** Current snapshot (copy; never throws). */
  snapshot(): readonly PassiveIncident[] {
    return [...this.incidents]
  }

  /** Clear the ring and notify an empty batch. */
  clear(): void {
    this.incidents.length = 0
    try {
      this.notify([])
    } catch {
      // Consumer failure is its own.
    }
  }

  /** Record an app-level signal (boundary catch or connection rebuild). */
  record(kind: 'react-boundary' | 'connection-reset', message: string, detail?: string): void {
    try {
      this.push(kind, { message, detail })
    } catch {
      // The probe must never take the GUI down.
    }
  }

  /** Record a Web UI plugin that was listed in the boot graph but never started. */
  recordPluginStartupFailure(pluginId: string, detail?: string): void {
    try {
      const id = typeof pluginId === 'string' ? pluginId.trim() : ''
      if (id === '') return
      this.push('plugin-startup-failure', { message: 'plugin failed to start: ' + id, detail })
    } catch {
      // The probe must never take the GUI down.
    }
  }

  private push(kind: PassiveKind, fields: Pick<PassiveIncident, 'message' | 'source' | 'line' | 'column' | 'detail'>): void {
    const at = this.now()
    const last = this.incidents[this.incidents.length - 1]
    if (last !== undefined
      && last.kind === kind
      && last.message === fields.message
      && last.source === fields.source
      && last.line === fields.line
      && at - last.at <= DEDUPE_WINDOW_MS && at >= last.at) {
      // The window is measured from the first occurrence; repeated events
      // inside it do not extend it.
      return
    }
    const incident: PassiveIncident = {
      id: 'probe-' + String(++this.sequence),
      kind,
      message: fields.message,
      source: fields.source,
      line: fields.line,
      column: fields.column,
      detail: fields.detail,
      at,
    }
    this.incidents.push(incident)
    if (this.incidents.length > this.max) this.incidents.splice(0, this.incidents.length - this.max)
    try {
      this.notify([incident])
    } catch {
      // Consumer failure is its own.
    }
  }
}
