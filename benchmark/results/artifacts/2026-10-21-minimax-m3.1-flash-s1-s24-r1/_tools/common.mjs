import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

export const REPO = 'E:\\deepseek-harness\\dsh-plugin-upgrade-skill'
export const TASKS = join(REPO, 'benchmark', 'tasks')
export const SKILL_SRC = join(REPO, 'skills', 'plugin-upgrade')
export const ROOT = 'E:\\deepseek-harness\\dsh-plugin-upgrade-skill\\benchmark\\results\\artifacts\\2026-10-21-minimax-m3.1-flash-s1-s24-r1'

export function sha256File(p) {
  return createHash('sha256').update(readFileSync(p)).digest('hex')
}

export function walkFiles(dir, base = dir, out = []) {
  let names
  try { names = readdirSync(dir) } catch { return out }
  for (const name of names.sort()) {
    const p = join(dir, name)
    let st
    try { st = statSync(p) } catch { continue }
    if (st.isDirectory()) walkFiles(p, base, out)
    else out.push(relative(base, p).split(sep).join('/'))
  }
  return out
}

// Fixture seal: map of relPath -> sha256 for every file under a directory.
export function sealDir(dir) {
  const seal = {}
  for (const rel of walkFiles(dir)) seal[rel] = sha256File(join(dir, rel))
  return seal
}

export function sealDiff(a, b) {
  const changed = []
  for (const k of Object.keys(a)) {
    if (!(k in b)) changed.push({ path: k, kind: 'deleted' })
    else if (a[k] !== b[k]) changed.push({ path: k, kind: 'modified' })
  }
  for (const k of Object.keys(b)) if (!(k in a)) changed.push({ path: k, kind: 'added' })
  return changed
}

export const S_TASKS = readdirSync(TASKS).filter(n => /^S\d+-/.test(n))
  .sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)))
