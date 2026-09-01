import type { ServerResponse } from 'node:http'

/** Write a JSON response with a stable envelope and no-store caching. */
export function writeJson(res: ServerResponse, status: number, body: unknown, extraHeaders: Record<string, string> = {}): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...extraHeaders,
  })
  res.end(JSON.stringify(body))
}
