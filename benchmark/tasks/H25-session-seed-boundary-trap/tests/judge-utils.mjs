// Pure source-analysis and scoring-assembly helpers for the H25 judge.
//
// Scoring model (behavioral inputs come from the real alpha.4 runtime in
// judge.mjs; unit tests pin the calibrated values):
//   behavioral 65 (fresh fork cut correct 15 / resumed fork retains the
//                  ORIGINAL cut 20 / unforked session 10 / projection
//                  init+apply correct 10 / valid seq+offset construction 5 /
//                  invalid constructors still throw 5)
//   migration  25 (no stale seedLength 5 / makeForkMeta isSeeded true with
//                  no seedLength key 5 / fresh session header isSeeded 5 /
//                  eventPosition uses SessionSeq 5 / logOffset uses
//                  SessionLogOffset 5)
//   hygiene    10 (no alpha.3 dependency pin)
//   hard caps  — as-cast bypass → 30; unsafe position/offset construction
//                bypass → 40; SessionSeq used for offsets → 60;
//                SessionLogOffset used for positions → 60; resume uses the
//                current log length → 65; resume uses firstLiveSeq → 65;
//                isSeeded true without the inherited count → 40;
//                inherited count without isSeeded → 40; stale seedLength
//                kept → 70; alpha.3 pin → 20; spec/helpers fail to load
//                → 30.
//   flat 0     — fixture untouched, node_modules/host modified, or the git
//                baseline rewritten (judge.mjs gates).

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

/** Index of the character closing the bracket opened at openIndex (-1 when unbalanced). */
function matchingClose(source, openIndex, openChar, closeChar) {
  let depth = 0
  let quote = null
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i]
    if (quote !== null) {
      if (ch === '\\') { i += 1; continue }
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue }
    if (ch === openChar) depth += 1
    else if (ch === closeChar) {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

/** Capture one `export const name = <expr>` right-hand side (depth-aware). */
function extractConstExpr(source, start) {
  const n = source.length
  let i = start
  while (i < n && /\s/.test(source[i])) i += 1
  let depth = 0
  let quote = null
  const expr = []
  while (i < n) {
    const ch = source[i]
    if (quote !== null) {
      expr.push(ch)
      if (ch === '\\') { expr.push(source[i + 1] ?? ''); i += 2; continue }
      if (ch === quote) quote = null
      i += 1
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; expr.push(ch); i += 1; continue }
    if (ch === '(' || ch === '{' || ch === '[') depth += 1
    else if (ch === ')' || ch === '}' || ch === ']') depth -= 1
    expr.push(ch)
    if (depth === 0 && ch === ';') return expr.join('').trim()
    if (depth === 0 && ch === '\n' && /^\s*export\b/.test(source.slice(i + 1))) return expr.join('').trim()
    i += 1
  }
  return expr.join('').trim() || null
}

/** Extract exported function/const bodies from a comment-stripped module. */
export function extractNamedFunctions(source) {
  const out = new Map()
  const n = source.length
  let i = 0
  while (i < n) {
    const e = source.indexOf('export', i)
    if (e < 0) break
    const after = source.slice(e + 6)
    const mFn = /^(?:\s+async\s+function\s+|\s+function\s+)([A-Za-z_$][\w$]*)\s*\(/.exec(after)
    const mConst = /^\s+const\s+([A-Za-z_$][\w$]*)\s*=/.exec(after)
    if (mFn) {
      const name = mFn[1]
      const parenOpen = source.indexOf('(', e + 6)
      const parenClose = matchingClose(source, parenOpen, '(', ')')
      if (parenClose < 0) { i = e + 6; continue }
      let bodyOpen = parenClose + 1
      while (bodyOpen < n && /\s/.test(source[bodyOpen])) bodyOpen += 1
      if (source[bodyOpen] !== '{') { i = e + 6; continue }
      const bodyClose = matchingClose(source, bodyOpen, '{', '}')
      if (bodyClose < 0) { i = e + 6; continue }
      out.set(name, source.slice(bodyOpen + 1, bodyClose))
      i = bodyClose + 1
    } else if (mConst) {
      const name = mConst[1]
      const exprStart = e + 6 + mConst[0].length
      const body = extractConstExpr(source, exprStart)
      if (body === null) { i = e + 6; continue }
      out.set(name, body)
      i = exprStart + body.length
    } else {
      i = e + 6
    }
  }
  return out
}

/** Scan the (comment-stripped) fork-state source for trap forms. */
export function scanSource(source) {
  const text = stripComments(source)
  const bodies = extractNamedFunctions(text)
  const eventPos = bodies.get('eventPosition') ?? ''
  const logOff = bodies.get('logOffset') ?? ''
  const resume = bodies.get('resumeForkSession') ?? ''
  return {
    staleSeedLength: /seedLength/.test(text),
    asCasts: /as\s+(any|unknown)|as\s+unknown\s+as/.test(text),
    eventPositionHasSessionSeq: /SessionSeq\s*\(/.test(eventPos),
    logOffsetHasSessionLogOffset: /SessionLogOffset\s*\(/.test(logOff),
    seqUsedForOffsets: /SessionSeq\s*\(/.test(logOff),
    offsetUsedForPositions: /SessionLogOffset\s*\(/.test(eventPos),
    resumeUsesLogLength: /\.length/.test(resume),
    resumeUsesFirstLive: /firstLiveSeq/.test(resume),
  }
}

/** Scan the fixture package.json dependency VALUES for the alpha.3 pin. */
export function scanPackageJson(packageJson) {
  let parsed = null
  try {
    parsed = JSON.parse(packageJson)
  } catch {
    parsed = null
  }
  let pinsAlpha3 = false
  if (parsed !== null && typeof parsed === 'object') {
    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      const deps = parsed[section]
      if (deps === null || typeof deps !== 'object') continue
      for (const value of Object.values(deps)) {
        if (typeof value === 'string' && /0\.1\.2-alpha\.3/.test(value)) pinsAlpha3 = true
      }
    }
  }
  return { pinsAlpha3 }
}

/**
 * Migration-correctness points from runtime facts + source scan (max 25).
 * @param runtime - { metaShape: { isSeeded, hasSeedLengthKey, inheritedEventCount },
 *                    freshHeaderIsSeeded: boolean }
 */
export function scoreMigration(runtime, scan) {
  let score = 0
  const detail = []
  if (!scan.staleSeedLength && runtime.metaShape.hasSeedLengthKey === false) {
    score += 5
    detail.push('seedLength-gone:5')
  } else {
    detail.push('seedLength-gone:0')
  }
  if (runtime.metaShape.isSeeded === true && runtime.metaShape.hasSeedLengthKey === false) {
    score += 5
    detail.push('isSeeded:5')
  } else {
    detail.push('isSeeded:0')
  }
  if (runtime.metaShape.inheritedEventCount === 3) {
    score += 5
    detail.push('inheritedEventCount:5')
  } else {
    detail.push('inheritedEventCount:0')
  }
  if (scan.eventPositionHasSessionSeq && !scan.offsetUsedForPositions) {
    score += 5
    detail.push('SessionSeq-position:5')
  } else {
    detail.push('SessionSeq-position:0')
  }
  if (scan.logOffsetHasSessionLogOffset && !scan.seqUsedForOffsets) {
    score += 5
    detail.push('SessionLogOffset-offset:5')
  } else {
    detail.push('SessionLogOffset-offset:0')
  }
  return { score, detail: detail.join(' ') }
}

/** Migration hygiene (max 10). */
export function scoreHygiene(packageScan) {
  return packageScan.pinsAlpha3 ? 7 : 10
}

/**
 * Smallest triggered hard cap, or null.
 * @param observations - { invalidRejected: boolean (constructors threw as expected) }
 */
export function capFor({ scan, packageScan, observations, runtime, loadFailed }) {
  const caps = []
  if (loadFailed) caps.push(30)
  if (scan.asCasts) caps.push(30)
  if (!observations.invalidRejected && !loadFailed) caps.push(40)
  if (scan.seqUsedForOffsets) caps.push(60)
  if (scan.offsetUsedForPositions) caps.push(60)
  if (scan.resumeUsesLogLength) caps.push(65)
  if (scan.resumeUsesFirstLive) caps.push(65)
  if (runtime.metaShape.isSeeded === true && runtime.metaShape.inheritedEventCount === undefined) caps.push(40)
  if (runtime.metaShape.inheritedEventCount !== undefined && runtime.metaShape.isSeeded !== true) caps.push(40)
  if (scan.staleSeedLength) caps.push(70)
  if (packageScan.pinsAlpha3) caps.push(20)
  return caps.length > 0 ? Math.min(...caps) : null
}

/**
 * Assemble the final score.
 * @param behavioral - 0..65 from the real-runtime checks.
 * @param runtime - { metaShape, freshHeaderIsSeeded, resumedCutOk } runtime facts.
 * @param source - fork-state source text.
 * @param packageJson - fixture package.json text.
 * @param observations - { invalidRejected }.
 * @param loadFailed - the fixture module failed to load.
 */
export function assembleScore({ behavioral, runtime, source, packageJson, observations, loadFailed }) {
  const reasons = []
  const scan = scanSource(source)
  const packageScan = scanPackageJson(packageJson)
  const migration = scoreMigration(runtime, scan)
  const hygiene = scoreHygiene(packageScan)
  reasons.push(`behavioral ${behavioral}/65; migration ${migration.score}/25 (${migration.detail}); hygiene ${hygiene}/10`)
  if (loadFailed) reasons.push('fixture module fails to load — cap 30')
  if (scan.asCasts) reasons.push('unsafe as-cast bypass — cap 30')
  if (!observations.invalidRejected && !loadFailed) reasons.push('invalid position/offset constructors no longer throw — cap 40')
  if (scan.seqUsedForOffsets) reasons.push('SessionSeq used for offsets — cap 60')
  if (scan.offsetUsedForPositions) reasons.push('SessionLogOffset used for positions — cap 60')
  if (scan.resumeUsesLogLength) reasons.push('resume uses the current log length instead of the original cut — cap 65')
  if (scan.resumeUsesFirstLive) reasons.push('resume uses firstLiveSeq instead of the original cut — cap 65')
  if (runtime.metaShape.isSeeded === true && runtime.metaShape.inheritedEventCount === undefined) reasons.push('isSeeded true without the inherited count — cap 40')
  if (runtime.metaShape.inheritedEventCount !== undefined && runtime.metaShape.isSeeded !== true) reasons.push('inherited count without isSeeded — cap 40')
  if (scan.staleSeedLength) reasons.push('stale seedLength kept — cap 70')
  if (packageScan.pinsAlpha3) reasons.push('alpha.3 dependency pin — cap 20')
  let score = behavioral + migration.score + hygiene
  const cap = capFor({ scan, packageScan, observations, runtime, loadFailed })
  if (cap !== null && score > cap) {
    reasons.push(`capped at ${cap} (was ${score})`)
    score = cap
  }
  score = Math.max(0, Math.min(100, Math.round(score)))
  return { score, reasons }
}

export { emitError } from './judge-result.mjs'
