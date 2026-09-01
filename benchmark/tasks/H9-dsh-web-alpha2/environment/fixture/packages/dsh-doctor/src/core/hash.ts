/**
 * Content hashing and canonical serialization.
 *
 * Determinism contract: fingerprints are computed over canonical JSON (object
 * keys sorted recursively), never over file text formatting or wall-clock
 * data, so two captures of the same logical state yield identical hashes.
 */
import { createHash } from 'node:crypto'

/** SHA-256 hex digest of a string or byte buffer. */
export function sha256Hex(data: string | Uint8Array): string {
  const hash = createHash('sha256')
  if (typeof data === 'string') hash.update(data, 'utf8')
  else hash.update(data)
  return hash.digest('hex')
}

/** Fixed-length prefix of the SHA-256 digest (default 8 hex chars). */
export function sha256Short(data: string | Uint8Array, length = 8): string {
  return sha256Hex(data).slice(0, length)
}

/**
 * Canonical JSON: object keys sorted recursively, arrays in order, JSON-safe
 * primitives only. Values that are not JSON-representable (functions,
 * undefined, symbols) are omitted from objects and replaced by null in arrays.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null'
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value)
    case 'number':
    case 'boolean':
      return JSON.stringify(value)
    case 'undefined':
    case 'function':
    case 'symbol':
    case 'bigint':
      return 'null'
    case 'object': {
      if (Array.isArray(value)) {
        return '[' + value.map((item) => canonicalJson(item)).join(',') + ']'
      }
      const record = value as Record<string, unknown>
      const keys = Object.keys(record).sort()
      const parts: string[] = []
      for (const key of keys) {
        const item = record[key]
        if (item === undefined || typeof item === 'function' || typeof item === 'symbol') continue
        parts.push(JSON.stringify(key) + ':' + canonicalJson(item))
      }
      return '{' + parts.join(',') + '}'
    }
    default:
      return 'null'
  }
}

/** Stable JSON text of a value (sorted keys, two-space indent, trailing newline). */
export function prettyJson(value: unknown): string {
  return JSON.stringify(sortObjectDeep(value), undefined, 2) + String.fromCharCode(10)
}

function sortObjectDeep(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((item) => sortObjectDeep(item))
  const record = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(record).sort()) out[key] = sortObjectDeep(record[key])
  return out
}
