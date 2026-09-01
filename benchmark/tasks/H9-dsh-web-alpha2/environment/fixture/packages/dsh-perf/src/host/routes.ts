import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { isLoopbackRequest } from './loopback.ts'
import { writeJson } from './http-util.ts'
import type { PerfMeter } from './perf-meter.ts'

export const PERF_API_PREFIX = '/api/dsh-perf'

/** Loopback-fenced stats route: aggregate metrics only, no session content. */
export function makePerfStatsRoute(meter: PerfMeter): WebRoute {
  return {
    kind: 'exact',
    path: PERF_API_PREFIX + '/stats',
    handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
      if (!isLoopbackRequest(req)) {
        writeJson(res, 403, { ok: false, error: 'forbidden: loopback-only' })
        return
      }
      writeJson(res, 200, meter.snapshot(), { 'cache-control': 'no-store' })
    },
  }
}
