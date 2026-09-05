// Pure source-analysis and scoring-assembly helpers for the H24 judge.
//
// Scoring model (behavioral inputs come from the real alpha.5 runtime in
// judge.mjs; unit tests pin the calibrated values):
//   behavioral 70 (domain open resolves 20 / healthy A+B intact 15 /
//                  corrupt document moved to backup 15 / backup bytes equal
//                  the sealed baseline bytes 10 / damaged key absent before
//                  rebuild 5 / rebuilt key persists across reopen 5)
//   migration  20 (scoped invalidRecords 'backup-and-skip' on the runtime
//                  spec 10 + honest schema without z.any 5 + domain/version/
//                  layout contract preserved 5)
//   hygiene    10 (no alpha.4 dependency pin)
//   hard caps  — spec fails to load → 30; version downgrade → 20; alpha.4
//                pin → 20; catch-and-empty around the open → 30; schema
//                loosened so the corrupt record parses → 40 (z.any) / 60
//                (field-level); backup-and-skip then deleting the backup
//                → 60; manual backup without the runtime contract → 50;
//                policy globalized outside the domain spec → 70.
//   flat 0     — fixture untouched, sealed files modified (the runtime's
//                authorized rename of the one corrupt document excepted),
//                or the git baseline rewritten (judge.mjs gates).
// The declaration is judged from the IMPORTED runtime spec, never grep alone.

/** Remove // line and / * block * / comments (string-aware). */
export function stripComments(source) {
  let out = ''
  let i = 0
  const n = source.length
  let quote = null
  while (i < n) {
    const ch = source[i]
    const next = source[i + 1]
    if (quote !== null) {
      out += ch
      if (ch === '\\') { out += next ?? ''; i += 2; continue }
      if (ch === quote) quote = null
      i += 1
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; out += ch; i += 1; continue }
    if (ch === '/' && next === '/') {
      while (i < n && source[i] !== '\n') i += 1
      continue
    }
    if (ch === '/' && next === '*') {
      i += 2
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) i += 1
      i += 2
      out += ' '
      continue
    }
    out += ch
    i += 1
  }
  return out
}

/** Scan the (comment-stripped) domain-spec source for trap forms. */
export function scanSpecSource(specSource) {
  const text = stripComments(specSource)
  return {
    invalidRecordsDeclared: /invalidRecords\s*:\s*['"]backup-and-skip['"]/.test(text),
    hasZAny: /\bz\.any\b/.test(text),
    hasCompat: /compatibleVersions/.test(text),
    versionDeclared: (() => {
      const match = /version\s*:\s*(\d+)/.exec(text)
      return match === null ? null : Number(match[1])
    })(),
  }
}

/** Scan all fixture source files for a catch around the domain open. */
export function scanSrcForCatch(srcTexts) {
  let catchPresent = false
  for (const text of srcTexts) {
    const stripped = stripComments(text)
    if (/catch\s*\(/.test(stripped)) catchPresent = true
  }
  return { catchPresent }
}

/** Scan the fixture package.json dependency VALUES for the alpha.4 pin. */
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
  return { pinsAlpha4 }
}

/** Migration-correctness points from the imported runtime spec + source scan (max 20). */
export function scoreMigration(spec, scan) {
  let score = 0
  const detail = []
  if (spec !== null && spec.invalidRecords === 'backup-and-skip') {
    score += 10
    detail.push('backup-and-skip:10')
  } else {
    detail.push('backup-and-skip:0')
  }
  if (!scan.hasZAny) {
    score += 5
    detail.push('schema-honest:5')
  } else {
    detail.push('z.any:0')
  }
  if (spec !== null && spec.version === 5 && spec.layout === 'per-record') {
    score += 5
    detail.push('contract:5')
  } else {
    detail.push('contract:0')
  }
  return { score, detail: detail.join(' ') }
}

/** Migration hygiene (max 10). */
export function scoreHygiene(packageScan) {
  return packageScan.pinsAlpha4 ? 7 : 10
}

/**
 * Smallest triggered hard cap, or null.
 * @param observations - behavioral facts from judge.mjs:
 *   { openRejected, brokenVisible, brokenFileAbsent, backupExists, catchPresent }
 */
export function capFor({ spec, scan, packageScan, observations, specLoadFailed, policyOutsideSpec }) {
  const caps = []
  if (specLoadFailed) caps.push(30)
  if (spec !== null && typeof spec.version === 'number' && spec.version < 5) caps.push(20)
  if (packageScan.pinsAlpha4) caps.push(20)
  if (observations.openRejected && observations.catchPresent) caps.push(30) // catch-and-empty
  const policyActive = spec !== null && spec.invalidRecords === 'backup-and-skip'
  if (observations.brokenVisible && !policyActive) {
    caps.push(scan.hasZAny ? 40 : 60) // schema loosened instead of salvage
  }
  if (policyActive && observations.brokenFileAbsent && !observations.backupExists) caps.push(60) // backup deleted
  if (!policyActive && observations.brokenFileAbsent && observations.backupExists) caps.push(50) // manual backup without the contract
  if (!policyActive && observations.brokenFileAbsent && !observations.backupExists && !observations.openRejected) caps.push(30) // corrupt record deleted with no salvage and no backup
  if (policyOutsideSpec) caps.push(70) // policy globalized outside the domain spec
  return caps.length > 0 ? Math.min(...caps) : null
}

/**
 * Assemble the final score.
 * @param behavioral - 0..70 from the real-runtime checks.
 * @param spec - imported runtime spec or null when the module fails to load.
 * @param specSource - domain-spec source text.
 * @param packageJson - fixture package.json text.
 * @param srcTexts - all fixture/src file texts (catch scan).
 * @param observations - behavioral facts for the caps.
 * @param policyOutsideSpec - invalidRecords found in a non-spec source file.
 */
export function assembleScore({ behavioral, spec, specSource, packageJson, srcTexts, observations, policyOutsideSpec }) {
  const reasons = []
  const scan = scanSpecSource(specSource)
  const packageScan = scanPackageJson(packageJson)
  const catchScan = scanSrcForCatch(srcTexts)
  const specLoadFailed = spec === null
  const migration = scoreMigration(spec, scan)
  const hygiene = scoreHygiene(packageScan)
  const allObservations = { ...observations, catchPresent: catchScan.catchPresent }
  reasons.push(`behavioral ${behavioral}/70; migration ${migration.score}/20 (${migration.detail}); hygiene ${hygiene}/10`)
  if (specLoadFailed) reasons.push('domain spec fails to load — cap 30')
  if (spec !== null && typeof spec.version === 'number' && spec.version < 5) reasons.push(`domain version downgraded to ${spec.version} — cap 20`)
  if (packageScan.pinsAlpha4) reasons.push('alpha.4 dependency pin — cap 20')
  if (allObservations.openRejected && allObservations.catchPresent) reasons.push('catch-and-empty around the open — cap 30')
  if (allObservations.brokenVisible && !(spec !== null && spec.invalidRecords === 'backup-and-skip')) {
    reasons.push(`schema loosened so the corrupt record parses (${scan.hasZAny ? 'z.any' : 'field-level'}) — cap ${scan.hasZAny ? 40 : 60}`)
  }
  if (spec !== null && spec.invalidRecords === 'backup-and-skip' && allObservations.brokenFileAbsent && !allObservations.backupExists) {
    reasons.push('backup deleted after salvage — cap 60')
  }
  if (!(spec !== null && spec.invalidRecords === 'backup-and-skip') && allObservations.brokenFileAbsent && allObservations.backupExists) {
    reasons.push('manual backup without the runtime contract — cap 50')
  }
  if (!(spec !== null && spec.invalidRecords === 'backup-and-skip') && allObservations.brokenFileAbsent && !allObservations.backupExists && !allObservations.openRejected) {
    reasons.push('corrupt record deleted with no salvage and no backup — cap 30')
  }
  if (policyOutsideSpec) reasons.push('salvage policy globalized outside the domain spec — cap 70')
  let score = behavioral + migration.score + hygiene
  const cap = capFor({ spec, scan, packageScan, observations: allObservations, specLoadFailed, policyOutsideSpec })
  if (cap !== null && score > cap) {
    reasons.push(`capped at ${cap} (was ${score})`)
    score = cap
  }
  score = Math.max(0, Math.min(100, Math.round(score)))
  return { score, reasons }
}
