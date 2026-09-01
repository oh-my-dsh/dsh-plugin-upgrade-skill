/**
 * Drag stream — bridges the chrome's pointer drag state onto the renderer
 * contract's { get, subscribe } shape, so renderers with a dedicated drag
 * track (frames2d) can follow the chrome-owned drag gesture. Dispatch is
 * change-only, mirroring the phase stream.
 * @module @linxin666/dsh-pet/client/drag-stream
 */

/** The renderer-facing drag stream. */
export interface DragStream {
  /** Whether the chrome reports an active drag gesture. */
  get(): boolean
  /** Subscribe to drag state changes; returns the unsubscribe. */
  subscribe(listener: (dragging: boolean) => void): () => void
  /** Feed a fresh drag state; no-op when unchanged. */
  push(dragging: boolean): void
}

/** Create the stream (one per pet activation, owned by the renderer switch). */
export function createDragStream(): DragStream {
  let current = false
  const listeners = new Set<(dragging: boolean) => void>()
  return {
    get: () => current,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    push(dragging) {
      if (dragging === current) return
      current = dragging
      for (const listener of [...listeners]) listener(dragging)
    },
  }
}
