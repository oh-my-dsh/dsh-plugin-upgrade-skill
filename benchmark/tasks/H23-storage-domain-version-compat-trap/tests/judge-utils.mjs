// Runtime-spec validation and scoring helpers for the H23 judge.
// Declarations and schemas are checked by value/behavior, not source spelling.
import { isDeepStrictEqual } from 'node:util'

// The fixed closure installed by the fixture lockfile, not whatever happens to
// remain in node_modules after a candidate edits its manifest.
export const REQUIRED_DEPENDENCIES = Object.freeze({
  '@deepseek-ai/cordis': '4.0.2',
  '@deepseek-ai/dsh-storage': '0.1.2-alpha.5',
  '@deepseek-ai/dsh-storage-domain': '0.1.2-alpha.5',
  '@deepseek-ai/dsh-storage-json': '0.1.2-alpha.5',
  zod: '4.4.3',
})

/** Check required runtime pins and scan dependency VALUES for alpha.4 (not prose). */
export function scanPackageJson(packageJson) {
  let parsed = null
  try {
    parsed = JSON.parse(packageJson)
  } catch {
    parsed = null
  }
  let pinsAlpha4 = false
  if (parsed !== null && typeof parsed === 'object') {
    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      const deps = parsed[section]
      if (deps === null || typeof deps !== 'object') continue
      for (const value of Object.values(deps)) {
        if (typeof value === 'string' && /0\.1\.2-alpha\.4/.test(value)) pinsAlpha4 = true
      }
    }
  }
  const dependencyErrors = Object.entries(REQUIRED_DEPENDENCIES)
    .filter(([name, version]) => parsed?.dependencies?.[name] !== version)
    .map(([name, version]) => `${name} must remain in dependencies at ${version}`)
  return { pinsAlpha4, dependencyErrors }
}

/** Validate the evaluated declaration, including constants and expressions. */
export function compatEntriesInvalid(spec) {
  if (spec === null || spec.compatibleVersions === undefined) return false
  return !Array.isArray(spec.compatibleVersions)
    || spec.compatibleVersions.some((entry) => !Number.isInteger(entry) || entry < 0 || entry >= spec.version)
}

/** Preserve valid records and reject missing/wrongly typed required fields. */
export function schemaContractHolds(spec) {
  const schema = spec?.tables?.summaries?.valueSchema
  if (typeof schema?.safeParse !== 'function') return false
  const valid = [
    { id: 'A', title: 'alpha4 notes' },
    { id: 'B', title: 'alpha4 more' },
    { id: 'C', title: 'alpha5 fresh', pinned: true },
    { id: 'optional', title: '', pinned: false },
  ]
  const invalid = [null, [], 'record', 1, { title: 'missing id' }, { id: 'missing title' }]
  for (const field of ['id', 'title']) {
    for (const value of [null, 0, false, [], {}]) {
      invalid.push({ id: 'probe', title: 'probe', [field]: value })
    }
  }
  for (const pinned of [null, 0, 'true', [], {}]) invalid.push({ id: 'probe', title: 'probe', pinned })
  try {
    return valid.every((record) => {
      const result = schema.safeParse(structuredClone(record))
      return result.success === true && isDeepStrictEqual(result.data, record)
    }) && invalid.every((record) => schema.safeParse(structuredClone(record)).success === false)
  } catch { return false }
}

/** Migration-correctness points from the imported runtime spec + schema probes (max 25). */
export function scoreMigration(spec, schemaHonest) {
  let score = 0
  const detail = []
  if (spec !== null && Array.isArray(spec.compatibleVersions) && spec.compatibleVersions.length === 1 && spec.compatibleVersions[0] === 4) {
    score += 15
    detail.push('compatibleVersions:[4]:15')
  } else {
    detail.push('compatibleVersions:[4]:0')
  }
  if (spec !== null && spec.version === 5) {
    score += 5
    detail.push('version:5')
  } else {
    detail.push('version!=5:0')
  }
  if (schemaHonest) {
    score += 5
    detail.push('schema-honest:5')
  } else {
    detail.push('schema-contract:0')
  }
  return { score, detail: detail.join(' ') }
}

/** Migration hygiene (max 10). */
export function scoreHygiene(packageScan) {
  return packageScan.pinsAlpha4 ? 7 : packageScan.dependencyErrors.length > 0 ? 0 : 10
}

/** Smallest triggered hard cap, or null. */
export function capFor({ spec, schemaHonest, packageScan }) {
  const caps = []
  if (spec === null || compatEntriesInvalid(spec)) caps.push(30)
  if (spec !== null && typeof spec.version === 'number' && spec.version < 5) caps.push(20)
  if (packageScan.pinsAlpha4) caps.push(20)
  if (packageScan.dependencyErrors.length > 0) caps.push(20)
  const compatHas4 = spec !== null && Array.isArray(spec.compatibleVersions) && spec.compatibleVersions.includes(4)
  if (spec?.invalidRecords === 'backup-and-skip' && !compatHas4) caps.push(50)
  if (!schemaHonest) caps.push(70)
  return caps.length > 0 ? Math.min(...caps) : null
}

/**
 * Assemble the final score from the behavioral total, the imported runtime
 * spec (null when the agent's module fails to load), and the fixture sources.
 * @returns {{ score: number, reasons: string[] }}
 */
export function assembleScore({ behavioral, spec, packageJson }) {
  const reasons = []
  const schemaHonest = schemaContractHolds(spec)
  const packageScan = scanPackageJson(packageJson)
  const specLoadFailed = spec === null
  const migration = scoreMigration(spec, schemaHonest)
  const hygiene = scoreHygiene(packageScan)
  reasons.push(`behavioral ${behavioral}/65; migration ${migration.score}/25 (${migration.detail}); hygiene ${hygiene}/10`)
  if (specLoadFailed) reasons.push('domain spec fails to load (invalid declaration?) — cap 30')
  if (compatEntriesInvalid(spec)) reasons.push('invalid compatibleVersions declaration — cap 30')
  if (spec !== null && typeof spec.version === 'number' && spec.version < 5) reasons.push(`domain version downgraded to ${spec.version} — cap 20`)
  if (packageScan.pinsAlpha4) reasons.push('alpha.4 dependency pin — cap 20')
  if (packageScan.dependencyErrors.length > 0) reasons.push(`required runtime dependencies missing or changed — cap 20: ${packageScan.dependencyErrors.join('; ')}`)
  if (spec?.invalidRecords === 'backup-and-skip' && !(spec !== null && Array.isArray(spec.compatibleVersions) && spec.compatibleVersions.includes(4))) {
    reasons.push('backup-and-skip used instead of version compatibility — cap 50')
  }
  if (!schemaHonest) reasons.push('schema fails record preservation or type validation (including any/unknown bypasses) — cap 70')
  let score = behavioral + migration.score + hygiene
  const cap = capFor({ spec, schemaHonest, packageScan })
  if (cap !== null && score > cap) {
    reasons.push(`capped at ${cap} (was ${score})`)
    score = cap
  }
  score = Math.max(0, Math.min(100, Math.round(score)))
  return { score, reasons }
}

export { emitError } from './judge-result.mjs'
