// Pure source-analysis helpers for the H20-session-events-ledger judge.
//
// Scoring model (see tests/judge-utils.test.mjs for the regression controls):
//   behavioral 75 (run against real alpha.4 Session objects) +
//   canonical  15 (3 per helper: the alpha.4 ledger API call, or a documented
//                    honest alternative at 2) +
//   hygiene    12 (no stale removed-surface read, no invented getEvents(),
//                    no runtime-internal field access, no seq-as-array-index;
//                    3 off per trap present)
//   hard caps  — stale removed-surface read → 30; invented getEvents() → 15;
//                runtime-internal access → 60; seq-as-array-index → 70.
// The fixture-untouched and node_modules/tamper gates live in judge.mjs.

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

/**
 * Extract exported helper bodies from a (comment-stripped) module source.
 * Handles `export function name(...) { body }` and
 * `export const name = (args) => ...` (block or inline expression).
 * Returns Map<name, bodyText>; a later duplicate name overwrites the first.
 */
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

/**
 * Scan one comment-stripped source text for the trap forms.
 * @returns {{ staleEvents: boolean, getEvents: boolean, privateAccess: boolean, seqIndex: boolean }}
 */
export function scanForbidden(text) {
  const staleEvents = /\.events\b|\[['"]events['"]\]|\{\s*events\s*[,}]/.test(text)
  const getEvents = /\.getEvents\s*\(|\[['"]getEvents['"]\]/.test(text)
  const privateAccess = /(?<!console)\.(?:log|eventsSnapshot)\b|\[['"](?:log|eventsSnapshot)['"]\]/.test(text)
  const seqIndex = /\[\s*seq\b|\.at\(\s*seq\b/.test(text)
  return { staleEvents, getEvents, privateAccess, seqIndex }
}

/**
 * Canonical ledger-API scoring per helper (max 15 = 5 × 3).
 * Honest alternatives (explicit event-position reads without the canonical
 * verb) earn 2 instead of 3; trap shapes earn 0.
 */
export function scoreCanonical(bodies) {
  const helpers = [
    ['fullVisibleLog', (b) => (/\.snapshotEvents\(\s*\)/.test(b) ? 3 : /\.snapshotEvents\(/.test(b) ? 2 : 0)],
    ['windowFrom', (b) => (/\.snapshotEvents\(\s*[^,\n)]+\s*\)/.test(b) ? 3 : /\.snapshotEvents\([^)]*,\s*[\w$.]+\.seq\s*\)/.test(b) ? 2 : 0)],
    ['eventAtSeq', (b) => (/\.eventAt\s*\(/.test(b) ? 3 : /\.find\s*\(/.test(b) && /\.seq\s*===/.test(b) ? 2 : 0)],
    ['eventInWindow', (b) => (/\.eventAt\s*\(/.test(b) ? 3 : /\.find\s*\(/.test(b) && /\.seq\s*===/.test(b) ? 2 : 0)],
    ['ownOnlyEvents', (b) => (/\.ownEvents\s*\(\s*\)/.test(b) ? 3 : /\.snapshotEvents\([^)]*inheritedEventCount/.test(b) ? 2 : 0)],
  ]
  let score = 0
  const detail = []
  for (const [name, check] of helpers) {
    const body = bodies.get(name)
    const pts = body === undefined ? 0 : check(body)
    score += pts
    detail.push(`${name}:${pts}`)
  }
  return { score, detail: detail.join(' ') }
}

/** Migration hygiene (max 12): 3 off per trap form present. */
export function scoreHygiene(scan) {
  const hits = [scan.staleEvents, scan.getEvents, scan.privateAccess, scan.seqIndex].filter(Boolean).length
  return 12 - hits * 3
}

/** Smallest hard cap triggered by the trap forms, or null. */
export function capFor(scan) {
  const caps = []
  if (scan.staleEvents) caps.push(30)
  if (scan.getEvents) caps.push(15)
  if (scan.privateAccess) caps.push(60)
  if (scan.seqIndex) caps.push(70)
  return caps.length > 0 ? Math.min(...caps) : null
}

/**
 * Assemble the final score from the behavioral total and the module sources.
 * @param {{ sources: string[], behavioral: number }} input
 * @returns {{ score: number, reasons: string[] }}
 */
export function assembleScore({ sources, behavioral }) {
  const reasons = []
  const stripped = stripComments(sources.join('\n'))
  const scan = scanForbidden(stripped)
  const bodies = extractNamedFunctions(stripped)
  const canonical = scoreCanonical(bodies)
  const hygiene = scoreHygiene(scan)
  reasons.push(`behavioral ${behavioral}/75; canonical ${canonical.score}/15 (${canonical.detail}); hygiene ${hygiene}/12`)
  if (scan.staleEvents) reasons.push('stale removed-surface read still present (cap 30)')
  if (scan.getEvents) reasons.push('invented getEvents() surface present (cap 15)')
  if (scan.privateAccess) reasons.push('runtime-internal field access present (cap 60)')
  if (scan.seqIndex) reasons.push('seq used as an array index (cap 70)')
  let score = behavioral + canonical.score + hygiene
  const cap = capFor(scan)
  if (cap !== null && score > cap) {
    reasons.push(`capped at ${cap} (was ${score})`)
    score = cap
  }
  score = Math.max(0, Math.min(100, Math.round(score)))
  return { score, reasons }
}
