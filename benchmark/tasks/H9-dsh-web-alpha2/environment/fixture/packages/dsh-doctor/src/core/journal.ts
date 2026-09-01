/**
 * Append-only JSONL journal with replay.
 *
 * Every mutation records a JournalEntry; replay returns entries in order and
 * counts corrupted lines instead of failing, so a torn write never prevents
 * recovery auditing.
 */
import { join } from 'node:path/posix'
import type { FsLike } from './fs.ts'
import type { JournalEntry } from './types.ts'

export interface JournalDeps {
  fs: FsLike
  /** Absolute journal file path. */
  file: string
  /** ISO timestamp provider. */
  now(): string
}

export interface Journal {
  append(entry: { op: string; ok: boolean; detail?: Record<string, unknown> }): Promise<JournalEntry>
  /** Replay all entries; corrupted lines are skipped and counted. */
  replay(): Promise<{ entries: JournalEntry[]; corrupted: number }>
  /** Absolute journal path. */
  readonly path: string
}

/** Create a journal rooted at a directory (journal.jsonl). */
export function createJournal(deps: JournalDeps): Journal {
  return {
    path: deps.file,
    async append(entry) {
      const current = await readFileOrEmpty(deps.fs, deps.file)
      let seq = 1
      if (current.trim() !== '') {
        const lastLine = current.trim().split(String.fromCharCode(10)).pop()
        if (lastLine !== undefined) {
          try {
            seq = (JSON.parse(lastLine) as JournalEntry).seq + 1
          } catch (error) {
            seq = countLines(current) + 1
          }
        }
      }
      const full: JournalEntry = { ...entry, seq, at: deps.now() }
      const line = JSON.stringify(full) + String.fromCharCode(10)
      await deps.fs.writeText(deps.file, current + line)
      return full
    },
    async replay() {
      const text = await readFileOrEmpty(deps.fs, deps.file)
      if (text === '') return { entries: [], corrupted: 0 }
      const entries: JournalEntry[] = []
      let corrupted = 0
      for (const line of text.split(String.fromCharCode(10))) {
        if (line.trim() === '') continue
        try {
          const parsed = JSON.parse(line) as JournalEntry
          if (typeof parsed.seq === 'number' && typeof parsed.op === 'string') entries.push(parsed)
          else corrupted += 1
        } catch (error) {
          corrupted += 1
        }
      }
      return { entries: entries.sort((a, b) => a.seq - b.seq), corrupted }
    },
  }
}

function countLines(text: string): number {
  return text.split(String.fromCharCode(10)).filter((l) => l.trim() !== '').length
}

async function readFileOrEmpty(fs: FsLike, file: string): Promise<string> {
  try {
    return await fs.readText(file)
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'ENOENT') return ''
    throw error
  }
}

/** Convenience default journal path builder. */
export function defaultJournalPath(home: string): string {
  return join(home, '.dsh-doctor', 'journal.jsonl')
}