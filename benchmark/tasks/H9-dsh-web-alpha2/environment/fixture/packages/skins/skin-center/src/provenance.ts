/**
 * Official-market provenance verification (issue #1073).
 *
 * Skins installed one-click from the DSH Market carry a
 * dsh-market.provenance.json written by the market installer at install
 * time, pinning every installed file to its sha256 and to the market
 * origin. The market's skin content is built from THIS repository (same
 * review, same release), so when the on-disk skin.json and hooks entry
 * hash-match the provenance, the hooks bytes are exactly the reviewed
 * bytes and may run like a built-in skin's.
 *
 * Fail-closed: invalid provenance and any post-install byte mismatch keep the
 * hooks-refused behavior for user-directory skins. A pre-provenance install
 * recovers only by matching this release's generated reviewed identity.
 * Forging the provenance
 * requires write access to $DSH_HOME itself — an attacker with that access
 * can already install full plugins, so the file is a provenance record,
 * not a capability guard against the local user.
 * @module @linxin666/dsh-client-ui-skin-center/provenance
 */

import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'

import { REVIEWED_SKIN_HOOKS } from './reviewed-hooks.generated.ts'

/** Provenance filename written by the market installer (mirrors PROVENANCE_FILENAME in @linxin666/dsh-client-ui-market; no cross-package runtime import). */
export const MARKET_PROVENANCE_FILENAME = 'dsh-market.provenance.json'

/** Market origin the provenance must pin (mirrors MARKET_ORIGIN in @linxin666/dsh-client-ui-market). */
export const MARKET_PROVENANCE_SOURCE = 'https://dsh-market.com'

function sha256Hex(abs: string): string | null {
  try {
    return createHash('sha256').update(readFileSync(abs)).digest('hex')
  } catch {
    return null
  }
}

/**
 * Whether the skin directory at dir carries valid official-market
 * provenance for skinId whose declared hooks entry (already validated as a
 * safe relative path by the manifest validator) hash-matches the recorded
 * bytes — skin.json included, so the facet entry path itself is pinned.
 */
export function verifyMarketProvenance(dir: string, skinId: string, hooksEntry: string): boolean {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(join(dir, MARKET_PROVENANCE_FILENAME), 'utf8'))
  } catch {
    return false
  }
  if (typeof raw !== 'object' || raw === null) return false
  const prov = raw as Record<string, unknown>
  if (prov.version !== 1) return false
  if (prov.source !== MARKET_PROVENANCE_SOURCE) return false
  if (prov.id !== skinId) return false
  const files = prov.files
  if (typeof files !== 'object' || files === null) return false
  const hashes = files as Record<string, unknown>
  for (const rel of ['skin.json', hooksEntry]) {
    const expected = hashes[rel]
    if (typeof expected !== 'string' || !/^[0-9a-f]{64}$/.test(expected)) return false
    const actual = sha256Hex(join(dir, ...rel.split('/')))
    if (actual === null || actual !== expected) return false
  }
  return true
}

/**
 * Recover a pre-provenance Workshop install only when its executable identity
 * is byte-for-byte one of this release's reviewed market skins. This is a
 * read-only fallback: no provenance is minted and no user file is replaced.
 */
export function verifyReviewedLegacyHooks(dir: string, skinId: string, hooksEntry: string): boolean {
  const reviewed = REVIEWED_SKIN_HOOKS[skinId]
  if (reviewed === undefined || reviewed.entry !== hooksEntry) return false
  const manifestHash = sha256Hex(join(dir, 'skin.json'))
  const hooksHash = sha256Hex(join(dir, ...hooksEntry.split('/')))
  return manifestHash === reviewed.manifestSha256 && hooksHash === reviewed.hooksSha256
}

export interface SkinIntegrityReport {
  id: string
  status: 'valid' | 'tampered' | 'missing-files' | 'missing-provenance' | 'unverified'
  hooksTrusted: boolean
  hasProvenance: boolean
  mismatches: string[]
  missing: string[]
  totalFilesChecked: number
}

/**
 * Deep integrity verification of one skin directory: checks all files declared
 * in dsh-market.provenance.json against recorded sha256 hashes, or verifies
 * against the reviewed legacy registry when provenance is absent.
 */
export function verifySkinIntegrity(
  dir: string,
  skinId: string,
  options: { isBuiltin?: boolean; hooksEntry?: string | null } = {},
): SkinIntegrityReport {
  if (options.isBuiltin) {
    return {
      id: skinId,
      status: 'valid',
      hooksTrusted: true,
      hasProvenance: false,
      mismatches: [],
      missing: [],
      totalFilesChecked: 0,
    }
  }

  let raw: unknown = null
  try {
    raw = JSON.parse(readFileSync(join(dir, MARKET_PROVENANCE_FILENAME), 'utf8'))
  } catch {
    raw = null
  }

  if (typeof raw === 'object' && raw !== null) {
    const prov = raw as Record<string, unknown>
    if (prov.version === 1 && prov.source === MARKET_PROVENANCE_SOURCE && prov.id === skinId && typeof prov.files === 'object' && prov.files !== null) {
      const hashes = prov.files as Record<string, unknown>
      const mismatches: string[] = []
      const missing: string[] = []
      let totalFilesChecked = 0

      for (const [rel, expected] of Object.entries(hashes)) {
        if (typeof expected !== 'string') continue
        totalFilesChecked++
        const abs = join(dir, ...rel.split('/'))
        const actual = sha256Hex(abs)
        if (actual === null) {
          missing.push(rel)
        } else if (actual !== expected) {
          mismatches.push(rel)
        }
      }

      if (missing.length > 0) {
        return {
          id: skinId,
          status: 'missing-files',
          hooksTrusted: false,
          hasProvenance: true,
          mismatches,
          missing,
          totalFilesChecked,
        }
      }

      if (mismatches.length > 0) {
        return {
          id: skinId,
          status: 'tampered',
          hooksTrusted: false,
          hasProvenance: true,
          mismatches,
          missing,
          totalFilesChecked,
        }
      }

      return {
        id: skinId,
        status: 'valid',
        hooksTrusted: true,
        hasProvenance: true,
        mismatches: [],
        missing: [],
        totalFilesChecked,
      }
    }
  }

  // No valid provenance file
  const hooksEntry = options.hooksEntry
  if (hooksEntry) {
    const legacyTrusted = verifyReviewedLegacyHooks(dir, skinId, hooksEntry)
    if (legacyTrusted) {
      return {
        id: skinId,
        status: 'valid',
        hooksTrusted: true,
        hasProvenance: false,
        mismatches: [],
        missing: [],
        totalFilesChecked: 2,
      }
    }
    return {
      id: skinId,
      status: 'missing-provenance',
      hooksTrusted: false,
      hasProvenance: false,
      mismatches: [],
      missing: [],
      totalFilesChecked: 0,
    }
  }

  return {
    id: skinId,
    status: 'unverified',
    hooksTrusted: false,
    hasProvenance: false,
    mismatches: [],
    missing: [],
    totalFilesChecked: 0,
  }
}

const SAFE_REL_RE = /^[A-Za-z0-9._][A-Za-z0-9._\-/]{0,199}$/

function isSafeRel(rel: string): boolean {
  if (typeof rel !== 'string' || !SAFE_REL_RE.test(rel)) return false
  if (rel.includes('..') || rel.includes('//') || rel.startsWith('/') || rel.endsWith('/')) return false
  return true
}

function collectLocalFiles(dir: string, base: string = ''): string[] {
  const list: string[] = []
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.') || name === MARKET_PROVENANCE_FILENAME) continue
    const abs = join(dir, name)
    const rel = base ? `${base}/${name}` : name
    const st = statSync(abs)
    if (st.isDirectory()) {
      list.push(...collectLocalFiles(abs, rel))
    } else if (st.isFile()) {
      list.push(rel)
    }
  }
  return list
}

export interface SkinRepairOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
  localSourceDir?: string
}

export interface SkinRepairResult {
  ok: boolean
  id: string
  error?: string
  repairedFiles?: number
}

/**
 * Repairs a corrupted or tampered skin directory by pulling pristine files
 * from the local source tree or the official DSH Market and rewriting provenance.
 */
export async function repairSkinFromMarket(
  destDir: string,
  skinId: string,
  options: SkinRepairOptions = {},
): Promise<SkinRepairResult> {
  if (!skinId || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(skinId)) {
    return { ok: false, id: skinId, error: 'invalid-id' }
  }

  // 1. Check local source mirror if available
  const localDir = options.localSourceDir
    ?? (existsSync(join(import.meta.dirname, '..', 'skins', skinId, 'skin.json'))
      ? join(import.meta.dirname, '..', 'skins', skinId)
      : null)

  if (localDir && existsSync(join(localDir, 'skin.json'))) {
    const files = collectLocalFiles(localDir)
    if (files.length > 0) {
      const hashes: Record<string, string> = {}
      mkdirSync(destDir, { recursive: true })
      for (const rel of files) {
        const src = join(localDir, ...rel.split('/'))
        const target = join(destDir, ...rel.split('/'))
        const guard = rel.split('/').slice(0, -1).join(sep)
        if (guard) mkdirSync(join(destDir, guard), { recursive: true })
        cpSync(src, target, { force: true })
        const h = sha256Hex(target)
        if (h) hashes[rel] = h
      }
      const provenance = {
        version: 1,
        source: MARKET_PROVENANCE_SOURCE,
        kind: 'skin',
        id: skinId,
        installedAt: new Date().toISOString(),
        files: hashes,
      }
      writeFileSync(join(destDir, MARKET_PROVENANCE_FILENAME), JSON.stringify(provenance, null, 2) + '\n')
      return { ok: true, id: skinId, repairedFiles: files.length }
    }
  }

  // 2. Fetch from market
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 15_000
  try {
    const manifestUrl = `${MARKET_PROVENANCE_SOURCE}/manifest/skins.json`
    const res = await fetchImpl(manifestUrl, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) {
      return { ok: false, id: skinId, error: `manifest-fetch-failed: ${res.status}` }
    }
    const manifest = (await res.json()) as { items?: Array<{ id: string; files?: string[] }> }
    const item = manifest?.items?.find((it) => it.id === skinId)
    if (!item || !Array.isArray(item.files) || item.files.length === 0) {
      return { ok: false, id: skinId, error: 'skin-not-found-on-market' }
    }

    const tmp = destDir + '.repair-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
    mkdirSync(tmp, { recursive: true })
    const hashes: Record<string, string> = {}

    try {
      for (const rel of item.files) {
        if (!isSafeRel(rel)) {
          throw new Error(`unsafe manifest path: ${rel}`)
        }
        const fileUrl = `${MARKET_PROVENANCE_SOURCE}/assets/skins/${encodeURIComponent(skinId)}/${rel.split('/').map(encodeURIComponent).join('/')}`
        const fileRes = await fetchImpl(fileUrl, { signal: AbortSignal.timeout(timeoutMs) })
        if (!fileRes.ok) {
          throw new Error(`failed to download ${rel}: ${fileRes.status}`)
        }
        const buf = Buffer.from(await fileRes.arrayBuffer())
        const target = join(tmp, ...rel.split('/'))
        const guard = rel.split('/').slice(0, -1).join(sep)
        if (guard) mkdirSync(join(tmp, guard), { recursive: true })
        writeFileSync(target, buf)
        hashes[rel] = createHash('sha256').update(buf).digest('hex')
      }

      const provenance = {
        version: 1,
        source: MARKET_PROVENANCE_SOURCE,
        kind: 'skin',
        id: skinId,
        installedAt: new Date().toISOString(),
        files: hashes,
      }
      writeFileSync(join(tmp, MARKET_PROVENANCE_FILENAME), JSON.stringify(provenance, null, 2) + '\n')

      if (existsSync(destDir)) {
        rmSync(destDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
      }
      try {
        renameSync(tmp, destDir)
      } catch {
        const start = Date.now()
        while (Date.now() - start < 50) { /* spin */ }
        renameSync(tmp, destDir)
      }
      return { ok: true, id: skinId, repairedFiles: item.files.length }
    } finally {
      try {
        if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
      } catch { /* best effort */ }
    }
  } catch (err) {
    return { ok: false, id: skinId, error: err instanceof Error ? err.message : String(err) }
  }
}
