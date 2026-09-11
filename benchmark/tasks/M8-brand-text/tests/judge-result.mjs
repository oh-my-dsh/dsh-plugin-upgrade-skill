// Shared result protocol, copied into each isolated task tests directory.
import { writeSync } from 'node:fs'
export function emitError(error, metadata = {}) {
  const message = error instanceof Error ? error.message : String(error)
  const packet = { ...metadata, status: 'verifier_error', error: { message } }
  writeSync(1, JSON.stringify(packet) + '\n')
  process.exit(1)
}

export function emit(score, reasons, metadata = {}) {
  const max = Object.hasOwn(metadata, 'max') ? metadata.max : 100
  if (!Number.isFinite(score) || !Number.isFinite(max) || max <= 0 || score < 0 || score > max) {
    emitError('Invalid score or maximum supplied to emit')
    return
  }
  const packet = { ...metadata, score, max, reasons }
  writeSync(1, JSON.stringify(packet) + '\n')
  process.exit(0)
}
