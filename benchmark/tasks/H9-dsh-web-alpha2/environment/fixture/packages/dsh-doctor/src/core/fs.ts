/**
 * Minimal filesystem abstraction used by every dsh-doctor core module.
 *
 * The interface deliberately covers only the operations the repair engine
 * needs, so that:
 * - the real implementation (nodeFs) is a thin wrapper over node:fs/promises,
 * - tests can run against an in-memory tree (memoryFs) with equivalent error
 *   semantics (ENOENT, EEXIST, ENOTDIR, EISDIR, ENOTEMPTY, EINVAL, ELOOP),
 * - every stateful module takes an injected FsLike and never touches
 *   node:fs directly.
 */

export interface StatInfo {
  kind: 'file' | 'dir' | 'link' | 'other'
  size: number
  mtimeMs: number
  dev: number
  ino: number
}

export interface DirEntryInfo {
  name: string
  kind: 'file' | 'dir' | 'link' | 'other'
}

export interface FsLike {
  readText(path: string): Promise<string>
  readBytes(path: string): Promise<Uint8Array>
  writeText(path: string, text: string): Promise<void>
  writeBytes(path: string, data: Uint8Array): Promise<void>
  exists(path: string): Promise<boolean>
  /** Follow symlinks in every path component, including the final one. */
  stat(path: string): Promise<StatInfo>
  /** Do not follow a final symlink; intermediate components are still followed. */
  lstat(path: string): Promise<StatInfo>
  readlink(path: string): Promise<string>
  symlink(target: string, path: string): Promise<void>
  mkdir(path: string, opts?: { recursive?: boolean }): Promise<void>
  /** Entries are returned sorted by name for deterministic iteration. */
  readdir(path: string): Promise<DirEntryInfo[]>
  rename(from: string, to: string): Promise<void>
  unlink(path: string): Promise<void>
  /** Remove a file, symlink, or (with recursive) a directory tree. */
  remove(path: string, opts?: { recursive?: boolean }): Promise<void>
}

/** Error carrying a stable filesystem error code (ENOENT, EEXIST, ...). */
export class FsError extends Error {
  readonly code: string
  readonly path: string
  constructor(code: string, path: string, detail?: string) {
    super('[fs] ' + code + ': ' + path + (detail === undefined ? '' : ' (' + detail + ')'))
    this.name = 'FsError'
    this.code = code
    this.path = path
  }
}

function classify(stat: { isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean }): StatInfo['kind'] {
  if (stat.isFile()) return 'file'
  if (stat.isDirectory()) return 'dir'
  if (stat.isSymbolicLink()) return 'link'
  return 'other'
}

function codeOf(error: unknown): string | undefined {
  return (error as { code?: unknown })?.code as string | undefined
}

/** Real filesystem backed by node:fs/promises. */
export const nodeFs: FsLike = {
  async readText(path) {
    const fsp = await import('node:fs/promises')
    return await fsp.readFile(path, 'utf8')
  },
  async readBytes(path) {
    const fsp = await import('node:fs/promises')
    return new Uint8Array(await fsp.readFile(path))
  },
  async writeText(path, text) {
    const fsp = await import('node:fs/promises')
    await fsp.writeFile(path, text, 'utf8')
  },
  async writeBytes(path, data) {
    const fsp = await import('node:fs/promises')
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
    await fsp.writeFile(path, buf)
  },
  async exists(path) {
    const fsp = await import('node:fs/promises')
    try {
      await fsp.lstat(path)
      return true
    } catch (error) {
      if (codeOf(error) === 'ENOENT') return false
      throw error
    }
  },
  async stat(path) {
    const fsp = await import('node:fs/promises')
    try {
      const s = await fsp.stat(path)
      return { kind: classify(s), size: s.size, mtimeMs: s.mtimeMs, dev: s.dev as number, ino: s.ino as number }
    } catch (error) {
      const code = codeOf(error)
      if (code !== undefined) throw new FsError(code, path)
      throw error
    }
  },
  async lstat(path) {
    const fsp = await import('node:fs/promises')
    try {
      const s = await fsp.lstat(path)
      return { kind: classify(s), size: s.size, mtimeMs: s.mtimeMs, dev: s.dev as number, ino: s.ino as number }
    } catch (error) {
      const code = codeOf(error)
      if (code !== undefined) throw new FsError(code, path)
      throw error
    }
  },
  async readlink(path) {
    const fsp = await import('node:fs/promises')
    return await fsp.readlink(path)
  },
  async symlink(target, path) {
    const fsp = await import('node:fs/promises')
    await fsp.symlink(target, path)
  },
  async mkdir(path, opts) {
    const fsp = await import('node:fs/promises')
    await fsp.mkdir(path, opts)
  },
  async readdir(path) {
    const fsp = await import('node:fs/promises')
    const entries = await fsp.readdir(path, { withFileTypes: true })
    return entries
      .map((entry) => ({ name: entry.name, kind: classify(entry) }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  },
  async rename(from, to) {
    const fsp = await import('node:fs/promises')
    await fsp.rename(from, to)
  },
  async unlink(path) {
    const fsp = await import('node:fs/promises')
    await fsp.unlink(path)
  },
  async remove(path, opts) {
    const fsp = await import('node:fs/promises')
    await fsp.rm(path, { recursive: opts?.recursive ?? false, force: false })
  },
}

/**
 * In-memory FsLike for tests and for dry-run candidate staging.
 *
 * Paths are POSIX-style absolute strings. Directory entries are sorted by
 * name on readdir. Symlinks store their raw target; relative targets are
 * resolved against the link's parent directory. Intermediate path components
 * are followed, and a final component is followed only by stat (mirroring
 * node semantics closely enough for the engine's needs).
 */
export function createMemoryFs(): FsLike {
  type Entry =
    | { type: 'file'; data: Uint8Array; mtime: number }
    | { type: 'dir' }
    | { type: 'link'; target: string }

  const entries = new Map<string, Entry>()
  let clock = 1000

  const normalize = (path: string): string => {
    if (typeof path !== 'string' || path.length === 0) throw new FsError('EINVAL', String(path), 'empty path')
    if (path.includes('\\')) throw new FsError('EINVAL', path, 'backslash paths are not supported')
    const out: string[] = []
    for (const part of path.split('/')) {
      if (part === '' || part === '.') continue
      if (part === '..') {
        if (out.length === 0) throw new FsError('EINVAL', path, 'path escapes the root')
        out.pop()
        continue
      }
      out.push(part)
    }
    return '/' + out.join('/')
  }

  const parentOf = (path: string): string => {
    const normalized = normalize(path)
    const idx = normalized.lastIndexOf('/')
    return idx <= 0 ? '/' : normalized.slice(0, idx)
  }

  const resolvePath = (path: string, followFinal: boolean, depth = 0): string => {
    if (depth > 8) throw new FsError('ELOOP', path)
    const normalized = normalize(path)
    const parts = normalized.split('/').filter((p) => p !== '')
    let resolved = ''
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]
      const isFinal = index === parts.length - 1
      const candidate = resolved === '' ? '/' + part : resolved + '/' + part
      const entry = entries.get(candidate)
      if (entry === undefined) {
        if (isFinal) return normalized
        throw new FsError('ENOENT', normalized, 'parent component ' + candidate + ' missing')
      }
      if (entry.type === 'link' && (!isFinal || followFinal)) {
        const rest = parts.slice(index + 1).join('/')
        const next = entry.target.startsWith('/')
          ? normalize(entry.target + (rest === '' ? '' : '/' + rest))
          : normalize(parentOf(candidate) + '/' + entry.target + (rest === '' ? '' : '/' + rest))
        return resolvePath(next, true, depth + 1)
      }
      resolved = candidate
    }
    return resolved
  }

  const lookup = (path: string, followFinal: boolean): Entry => {
    const resolved = resolvePath(path, followFinal)
    const entry = entries.get(resolved)
    if (entry === undefined) throw new FsError('ENOENT', path)
    return entry
  }

  const statOf = (path: string, follow: boolean): StatInfo => {
    const entry = lookup(path, follow)
    const kind = entry.type === 'dir' ? 'dir' : entry.type === 'link' ? 'link' : 'file'
    const size = entry.type === 'file' ? entry.data.byteLength : 0
    return { kind, size, mtimeMs: entry.type === 'file' ? entry.mtime : 0, dev: 1, ino: 0 }
  }

  const ensureDir = (path: string): void => {
    const normalized = normalize(path)
    if (normalized === '/') return
    const entry = lookup(path, true)
    if (entry.type !== 'dir') throw new FsError('ENOTDIR', path)
  }

  const ensureParent = (path: string): void => {
    const parent = parentOf(path)
    if (parent === path) return
    ensureDir(parent)
  }

  const fs: FsLike = {
    async readText(path) {
      const data = await fs.readBytes(path)
      return new TextDecoder('utf-8').decode(data)
    },
    async readBytes(path) {
      const entry = lookup(path, true)
      if (entry.type !== 'file') throw new FsError(entry.type === 'dir' ? 'EISDIR' : 'EINVAL', path)
      return entry.data.slice()
    },
    async writeText(path, text) {
      await fs.writeBytes(path, new TextEncoder().encode(text))
    },
    async writeBytes(path, data) {
      ensureParent(path)
      const normalized = normalize(path)
      const existing = entries.get(resolvePath(path, false))
      if (existing !== undefined && existing.type === 'dir') throw new FsError('EISDIR', path)
      entries.set(normalized, { type: 'file', data: data.slice(), mtime: (clock += 1) })
    },
    async exists(path) {
      try {
        lookup(path, true)
        return true
      } catch (error) {
        if (error instanceof FsError && error.code === 'ENOENT') return false
        throw error
      }
    },
    async stat(path) {
      return statOf(path, true)
    },
    async lstat(path) {
      return statOf(path, false)
    },
    async readlink(path) {
      const entry = lookup(path, false)
      if (entry.type !== 'link') throw new FsError('EINVAL', path, 'not a symlink')
      return entry.target
    },
    async symlink(target, path) {
      ensureParent(path)
      const normalized = normalize(path)
      if (entries.has(resolvePath(path, false))) throw new FsError('EEXIST', path)
      entries.set(normalized, { type: 'link', target })
    },
    async mkdir(path, opts) {
      const normalized = normalize(path)
      if (opts?.recursive === true) {
        const parts = normalized.split('/').filter((p) => p !== '')
        let current = ''
        for (const part of parts) {
          current = current === '' ? '/' + part : current + '/' + part
          const existing = entries.get(current)
          if (existing === undefined) entries.set(current, { type: 'dir' })
          else if (existing.type !== 'dir') throw new FsError('ENOTDIR', current)
        }
        return
      }
      ensureParent(normalized)
      if (entries.has(normalized)) throw new FsError('EEXIST', normalized)
      entries.set(normalized, { type: 'dir' })
    },
    async readdir(path) {
      ensureDir(path)
      const normalized = normalize(path)
      const prefix = normalized === '/' ? '/' : normalized + '/'
      const names = new Set<string>()
      for (const key of entries.keys()) {
        if (!key.startsWith(prefix)) continue
        const rest = key.slice(prefix.length)
        if (rest === '' || rest.includes('/')) continue
        names.add(rest)
      }
      return [...names]
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
        .map((name) => {
          const entry = entries.get(prefix + name)
          const kind = entry === undefined ? 'other' : entry.type === 'dir' ? 'dir' : entry.type === 'link' ? 'link' : 'file'
          return { name, kind }
        })
    },
    async rename(from, to) {
      const fromNorm = normalize(from)
      const toNorm = normalize(to)
      if (fromNorm === toNorm) return
      const source = resolvePath(from, false)
      const sourceEntry = entries.get(source)
      if (sourceEntry === undefined) throw new FsError('ENOENT', from)
      if (sourceEntry.type === 'dir' && toNorm.startsWith(source + '/')) {
        throw new FsError('EINVAL', to, 'cannot move a directory into itself')
      }
      const target = resolvePath(to, false)
      const targetEntry = entries.get(target)
      if (targetEntry !== undefined) {
        if (sourceEntry.type === 'dir' && targetEntry.type !== 'dir') throw new FsError('ENOTDIR', to)
        if (sourceEntry.type !== 'dir' && targetEntry.type === 'dir') throw new FsError('EISDIR', to)
        if (sourceEntry.type === 'dir' && targetEntry.type === 'dir') {
          const childPrefix = target + '/'
          const hasChildren = [...entries.keys()].some((key) => key.startsWith(childPrefix))
          if (hasChildren) throw new FsError('ENOTEMPTY', to)
          entries.delete(target)
        }
      }
      ensureParent(toNorm)
      const keysToMove =
        sourceEntry.type === 'dir'
          ? [...entries.keys()].filter((key) => key === source || key.startsWith(source + '/'))
          : [source]
      if (targetEntry !== undefined && targetEntry.type !== 'dir') entries.delete(target)
      const staged: [string, Entry][] = []
      for (const key of keysToMove) {
        const entry = entries.get(key)
        if (entry === undefined) continue
        entries.delete(key)
        staged.push([toNorm + key.slice(source.length), entry])
      }
      for (const [key, entry] of staged) entries.set(key, entry)
    },
    async unlink(path) {
      const target = resolvePath(path, false)
      const entry = entries.get(target)
      if (entry === undefined) throw new FsError('ENOENT', path)
      if (entry.type === 'dir') throw new FsError('EISDIR', path)
      entries.delete(target)
    },
    async remove(path, opts) {
      const target = resolvePath(path, false)
      const entry = entries.get(target)
      if (entry === undefined) throw new FsError('ENOENT', path)
      const normalized = normalize(path)
      if (entry.type !== 'dir') {
        entries.delete(target)
        return
      }
      const children = [...entries.keys()].filter((key) => key.startsWith(normalized === '/' ? '/' : normalized + '/'))
      if (opts?.recursive !== true) {
        if (children.some((key) => key !== normalized)) throw new FsError('ENOTEMPTY', path)
        entries.delete(normalized)
        return
      }
      for (const key of children) entries.delete(key)
      entries.delete(normalized)
    },
  }

  return Object.assign(fs, { __memory: true, _setClock: (value: number) => { clock = value }, _tree: entries })
}

/** Type guard: whether a FsLike is the in-memory implementation. */
export function isMemoryFs(fs: FsLike): boolean {
  return (fs as { __memory?: boolean }).__memory === true
}

export function parentDir(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx <= 0 ? '/' : path.slice(0, idx)
}

/** Recursively copy a directory tree without following symlinks. */
export async function copyTree(fs: FsLike, from: string, to: string): Promise<void> {
  const stat = await fs.lstat(from)
  if (stat.kind === 'file') {
    await fs.mkdir(parentDir(to), { recursive: true })
    await fs.writeBytes(to, await fs.readBytes(from))
    return
  }
  if (stat.kind === 'link') {
    await fs.mkdir(parentDir(to), { recursive: true })
    const target = await fs.readlink(from)
    try {
      await fs.symlink(target, to)
    } catch (error) {
      if (!(error instanceof FsError && error.code === 'EEXIST')) throw error
      await fs.unlink(to)
      await fs.symlink(target, to)
    }
    return
  }
  await fs.mkdir(to, { recursive: true })
  for (const child of await fs.readdir(from)) {
    await copyTree(fs, from + '/' + child.name, to + '/' + child.name)
  }
}

/**
 * Move a path across possibly different devices: rename first, then
 * copy+remove when the rename fails with EXDEV (works with both FsError and
 * raw node errors).
 */
export async function movePath(fs: FsLike, from: string, to: string): Promise<{ copied: boolean }> {
  try {
    await fs.rename(from, to)
    return { copied: false }
  } catch (error) {
    const code = error instanceof FsError ? error.code : codeOf(error)
    if (code === 'EXDEV') {
      await copyTree(fs, from, to)
      await fs.remove(from, { recursive: true })
      return { copied: true }
    }
    throw error
  }
}
