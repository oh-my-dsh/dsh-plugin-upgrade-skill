/**
 * In-memory fs behavior: the engine's DI filesystem.
 */
import { describe, expect, it } from 'vitest'
import { createMemoryFs, FsError, isMemoryFs, movePath, copyTree } from '../src/core/fs.ts'

describe('memory fs', () => {
  it('writes and reads files, creating nothing implicitly', async () => {
    const fs = createMemoryFs()
    await fs.mkdir('/home/u', { recursive: true })
    await fs.writeText('/home/u/a.txt', 'hello')
    expect(await fs.readText('/home/u/a.txt')).toBe('hello')
    await expect(fs.readText('/home/u/missing.txt')).rejects.toMatchObject({ code: 'ENOENT' })
    expect(fs).toSatisfy((value: unknown) => isMemoryFs(value as never))
  })

  it('mkdir is exclusive unless recursive', async () => {
    const fs = createMemoryFs()
    await fs.mkdir('/x', { recursive: true })
    await expect(fs.mkdir('/x', { recursive: false })).rejects.toMatchObject({ code: 'EEXIST' })
    await fs.mkdir('/x', { recursive: true })
    await expect(fs.mkdir('/x/missing/y', { recursive: false })).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('readdir returns sorted entries with kinds', async () => {
    const fs = createMemoryFs()
    await fs.mkdir('/d', { recursive: true })
    await fs.writeText('/d/b.txt', '1')
    await fs.writeText('/d/a.txt', '2')
    await fs.mkdir('/d/sub')
    await fs.symlink('/d/a.txt', '/d/link')
    const entries = await fs.readdir('/d')
    expect(entries.map((e) => e.name)).toEqual(['a.txt', 'b.txt', 'link', 'sub'])
    expect(entries.find((e) => e.name === 'link')?.kind).toBe('link')
  })

  it('renames files and replaces an existing file target', async () => {
    const fs = createMemoryFs()
    await fs.mkdir('/d', { recursive: true })
    await fs.writeText('/d/from.txt', 'from')
    await fs.writeText('/d/to.txt', 'to')
    await fs.rename('/d/from.txt', '/d/to.txt')
    expect(await fs.readText('/d/to.txt')).toBe('from')
    expect(await fs.exists('/d/from.txt')).toBe(false)
  })

  it('renames directory trees with descendants', async () => {
    const fs = createMemoryFs()
    await fs.mkdir('/d', { recursive: true })
    await fs.mkdir('/d/inner')
    await fs.writeText('/d/inner/deep.txt', 'deep')
    await fs.writeText('/d/top.txt', 'top')
    await fs.rename('/d', '/e')
    expect(await fs.readText('/e/inner/deep.txt')).toBe('deep')
    expect(await fs.readText('/e/top.txt')).toBe('top')
    expect(await fs.exists('/d')).toBe(false)
  })

  it('refuses moving a directory into itself and renaming into non-empty dirs', async () => {
    const fs = createMemoryFs()
    await fs.mkdir('/d', { recursive: true })
    await fs.mkdir('/d/inner')
    await fs.mkdir('/e')
    await fs.writeText('/e/occupied.txt', 'x')
    await expect(fs.rename('/d', '/d/inner/nested')).rejects.toMatchObject({ code: 'EINVAL' })
    await expect(fs.rename('/d', '/e')).rejects.toMatchObject({ code: 'ENOTEMPTY' })
  })

  it('lstat/stat distinguish symlinks; relative targets resolve against the link', async () => {
    const fs = createMemoryFs()
    await fs.mkdir('/d', { recursive: true })
    await fs.mkdir('/d/real')
    await fs.writeText('/d/real/ok.txt', 'ok')
    await fs.symlink('real/ok.txt', '/d/lnk')
    expect((await fs.lstat('/d/lnk')).kind).toBe('link')
    expect((await fs.stat('/d/lnk')).kind).toBe('file')
    expect(await fs.readlink('/d/lnk')).toBe('real/ok.txt')
    expect(await fs.readText('/d/lnk')).toBe('ok')
    await expect(fs.stat('/d/dangling')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('unlink removes files and links but not directories; remove handles trees', async () => {
    const fs = createMemoryFs()
    await fs.mkdir('/d', { recursive: true })
    await fs.writeText('/d/f.txt', 'x')
    await fs.symlink('/d/f.txt', '/d/lk')
    await fs.unlink('/d/lk')
    expect(await fs.exists('/d/lk')).toBe(false)
    await fs.unlink('/d/f.txt')
    await expect(fs.unlink('/d/f.txt')).rejects.toMatchObject({ code: 'ENOENT' })
    await fs.mkdir('/d/sub')
    await expect(fs.remove('/d', { recursive: false })).rejects.toMatchObject({ code: 'ENOTEMPTY' })
    await fs.remove('/d', { recursive: true })
    expect(await fs.exists('/d')).toBe(false)
  })

  it('movePath falls back to copy for EXDEV and keeps content', async () => {
    const failRename = (target: unknown): never => {
      throw new FsError('EXDEV', String(target))
    }
    const fs = createMemoryFs()
    await fs.mkdir('/a', { recursive: true })
    await fs.writeText('/a/file.txt', 'payload')
    const failing = { ...fs, rename: failRename }
    const result = await movePath(failing, '/a', '/b')
    expect(result.copied).toBe(true)
    expect(await fs.readText('/b/file.txt')).toBe('payload')
    expect(await fs.exists('/a')).toBe(false)
  })

  it('copyTree copies trees without following symlinks', async () => {
    const fs = createMemoryFs()
    await fs.mkdir('/src', { recursive: true })
    await fs.writeText('/src/file.txt', 'body')
    await fs.mkdir('/src/sub')
    await fs.writeText('/src/sub/nested.txt', 'n')
    await fs.symlink('/src/file.txt', '/src/link')
    await copyTree(fs, '/src', '/dst')
    expect(await fs.readText('/dst/sub/nested.txt')).toBe('n')
    expect((await fs.lstat('/dst/link')).kind).toBe('link')
    expect((await fs.stat('/dst/link')).kind).toBe('file')
  })
})