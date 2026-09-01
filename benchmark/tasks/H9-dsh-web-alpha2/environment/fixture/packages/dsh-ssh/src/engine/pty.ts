/**
 * PTY shell sessions for the web terminal: a standalone (non-pooled)
 * ssh2 connection with a long-lived shell channel, resize, and pausable
 * output delivery.
 */

import { connectChain, type KeyboardInteractiveHandler, type PoolEngine } from './connection-pool.ts'

/** A live PTY shell session. */
export interface ShellSession {
  /** Assign to receive remote output. */
  onData?: (data: Buffer) => void
  /** Assign to be notified when the channel closes. */
  onExit?: (code: number | null, error?: string) => void
  /** Write raw input to the shell. */
  send(data: string): void
  /** Resize the remote PTY. */
  resize(cols: number, rows: number): void
  /** Close the session and its channel. */
  close(): void
  /** Pause remote output delivery (transport backpressure). */
  pause(): void
  /** Resume remote output delivery. */
  resume(): void
}

/**
 * Open a PTY shell session for the web terminal (standalone connection).
 * The shell is a long-lived exclusive stream: it uses its own connection so
 * closing it can never tear down a pooled exec/tunnel sharing the alias.
 */
export async function openShell(
  engine: PoolEngine,
  alias: string,
  size: { cols: number; rows: number },
  onKeyboardInteractive?: KeyboardInteractiveHandler,
): Promise<ShellSession> {
  const entry = engine.store.find(alias)
  if (entry === undefined) throw new Error('alias \'' + alias + '\' not found — add it first')
  const { client, hops } = await connectChain(engine, entry, onKeyboardInteractive)
  return await new Promise<ShellSession>((resolve, reject) => {
    client.shell({ term: 'xterm-256color', cols: size.cols, rows: size.rows }, (error, stream) => {
      if (error !== undefined) {
        try { client.end() } catch { /* closed */ }
        for (const hop of hops) { try { hop.end() } catch { /* closed */ } }
        reject(error)
        return
      }
      let tornDown = false
      const teardown = (): void => {
        if (tornDown) return
        tornDown = true
        try { client.end() } catch { /* closed */ }
        for (const hop of hops) { try { hop.end() } catch { /* closed */ } }
      }
      const session: ShellSession = {
        send: (data) => { try { stream.write(data) } catch { /* channel gone */ } },
        resize: (cols, rows) => { try { stream.setWindow(rows, cols, rows, cols) } catch { /* channel gone */ } },
        close: () => {
          try { stream.close() } catch { /* channel gone */ }
          teardown()
        },
        pause: () => { try { stream.pause() } catch { /* channel gone */ } },
        resume: () => { try { stream.resume() } catch { /* channel gone */ } },
      }
      stream.on('data', (chunk: Buffer) => { session.onData?.(chunk) })
      stream.on('close', (code: number | null) => {
        teardown()
        session.onExit?.(code)
      })
      stream.on('error', (streamError: Error) => {
        teardown()
        session.onExit?.(null, streamError instanceof Error ? streamError.message : String(streamError))
      })
      resolve(session)
    })
  })
}