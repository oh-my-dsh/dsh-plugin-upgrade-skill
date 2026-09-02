// H12-remote-result-boundary-trap grading: read-only gate + section-scoped Markdown scoring.
//
// This task grades the RemoteResult resolved-vs-rejected control-flow boundary.
// It deliberately does NOT grade error-code migration or retry policy as its
// primary axis — H6-remote-error-trap owns the error vocabulary/policy surface;
// this task starts after that vocabulary migration and asks only how an ordinary
// unary Remote failure reaches the consumer.
//
// Six canonical sections, graded independently on their own text:
//   Root Cause                 20  paired: ordinary failure -> ok:false AND does not reject / never enters catch
//   Problems in the Current Code 10  at least two real wrongness items, correct direction
//   Corrected Implementation   25  fenced code only: awaits the remote call (5) + explicit failure branch (8)
//                                 + accesses result.error in the branch (6) + result.value only after the branch (6)
//   RemoteResult Control Flow  20  success ok:true/value (5) + failure ok:false/error (5) + Promise stays resolved (5)
//                                 + catch is not the ordinary business-failure path (5)
//   Reject Boundary            15  assembly/programming faults can reject (5) + a concrete example (5)
//                                 + genuine rejects propagate/expose, not swallowed/retried (5)
//   Error Boundary             10  no instanceof discrimination, branch on code (5) + isRemoteFailure only at a
//                                 true throw/catch boundary (5)
//
// Hard caps (minimum of all triggered caps; each cap is written into reasons):
//   fixture modified                                          -> 0
//   no report / empty report                                  -> 0
//   Root Cause / Control Flow claim ordinary failures primarily throw/reject and
//   should be handled in catch                               -> cap 30
//   report never mentions result.ok (or an explicit equivalent discriminant) -> cap 50
//   Corrected Implementation fenced code reads result.value without a prior
//   result.ok failure branch                                  -> cap 60
//   Corrected Implementation fenced code discriminates with instanceof RemoteError -> cap 60
//   Corrected Implementation fenced code has a catch block that swallows/retries/
//   converts rejects instead of propagating them              -> cap 60
//
// Direction awareness: wrong-claim detection ignores matches preceded by a negation
// window ("should NOT be handled in catch" is a correct statement). Old-code quoting
// in prose/inline code never triggers caps — only fenced code inside Corrected
// Implementation is graded as the agent's proposed fix.
import { pathToFileURL } from 'node:url'
import { emit, fixtureChanges, readAgentText } from './judge-utils.mjs'

const TASK = 'H12-remote-result-boundary-trap'

const CANONICAL = [
  'Root Cause',
  'Problems in the Current Code',
  'Corrected Implementation',
  'RemoteResult Control Flow',
  'Reject Boundary',
  'Error Boundary',
]
const ALIASES = {
  'Root Cause': ['根本原因', '根因'],
  'Problems in the Current Code': ['当前代码的问题', '当前代码问题', '现有代码的问题'],
  'Corrected Implementation': ['修正后的实现', '修正实现', '正确的实现', '修复后的实现'],
  'RemoteResult Control Flow': ['RemoteResult 控制流', '控制流'],
  'Reject Boundary': ['Reject 边界', '拒绝边界', '异常边界'],
  'Error Boundary': ['错误边界'],
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) main().catch((error) => emit(0, [`judge error: ${error.message}`]))

async function main() {
  const reasons = []

  const gate = await fixtureChanges('fixture')
  if (gate.changed === true) {
    emit(0, [`fixture was modified, 0 points (read-only discipline): ${gate.detail}`])
  }
  if (gate.changed === null) reasons.push(`warning: ${gate.detail}`)
  else reasons.push('fixture unchanged (read-only discipline passed)')

  const { text, files } = readAgentText('', TASK)
  if (!text.trim()) {
    emit(0, [...reasons, `no report found under /app/agent-output/${TASK}/, treated as 0 points`])
  }
  reasons.push(`read agent report: ${files.join(', ')}`)

  const result = scoreReport(text)
  emit(result.score, [...reasons, ...result.reasons])
}

// ── Pure scoring logic (exported for offline negative-control testing) ──

export function scoreReport(reportText) {
  const sections = parseSections(reportText)
  const reasons = []

  for (const title of CANONICAL) {
    if (!sections.has(title)) reasons.push(`missing section "## ${title}" (0 points for that block)`)
  }

  const root = sections.get('Root Cause') ?? ''
  const problems = sections.get('Problems in the Current Code') ?? ''
  const corrected = sections.get('Corrected Implementation') ?? ''
  const control = sections.get('RemoteResult Control Flow') ?? ''
  const reject = sections.get('Reject Boundary') ?? ''
  const boundary = sections.get('Error Boundary') ?? ''

  let score = 0

  // 1. Root Cause (20): paired semantics.
  const okFalse = /ok\s*:\s*false|failure branch|失败分支/i.test(root)
  const notReject = NOT_REJECT_RE.test(root)
  if (okFalse) { score += 10; reasons.push('Root Cause: business failure -> ok:false / failure branch (+10)') }
  else reasons.push('Root Cause: missing the ok:false / failure-branch fact (+0)')
  if (notReject) { score += 10; reasons.push('Root Cause: ordinary failures do not reject / never enter catch (+10)') }
  else reasons.push('Root Cause: missing "ordinary failures do not reject / do not enter catch" (+0)')

  // 2. Problems in the Current Code (10): at least two real wrongness items.
  const wrongnessItems = [
    [/result\.value.{0,60}(?:without|before|no|未|没有|不).{0,20}(?:checking|check|ok|判断|检查)|(?:reads?|returns?)\s+result\.value.{0,60}(?:unchecked|未检查)/i, 'reads result.value without checking ok'],
    [/(?:never|does\s+not|doesn'?t|won'?t|will\s+not|不会|不).{0,40}(?:enter|reach|go\s+into|land\s+in|进入|走到).{0,15}catch|catch.{0,80}(?:never|not|不会|不能|不).{0,30}(?:ok\s*:\s*false|business\s+failure|业务失败)/i, 'catch never receives ok:false'],
    [/instanceof\s+RemoteError/i, 'instanceof RemoteError as primary discrimination'],
    [/(?:assembly|programming|local|装配|编程|本地).{0,50}(?:error|fault|defect|错误).{0,40}(?:swallow|吞|retr|重试|convert|转换|hide|掩盖|伪装)/i, 'assembly rejects swallowed/retried/converted'],
    [/catch.{0,80}(?:treat|handle|当作|当成|作为).{0,40}(?:business|failure|业务|失败)/i, 'catch treated as the business-failure path'],
    [/(?:resolved\s+)?result.{0,40}(?:treated|assumed|当作|假设).{0,30}(?:as\s+)?success/i, 'resolved result assumed success'],
  ]
  let problemsHits = 0
  for (const [pattern, label] of wrongnessItems) {
    if (pattern.test(problems)) {
      problemsHits += 1
      reasons.push(`Problems: identified "${label}"`)
    }
  }
  if (problemsHits >= 2) { score += 10; reasons.push('Problems: at least two real wrongness items (+10)') }
  else if (problemsHits === 1) { score += 5; reasons.push('Problems: only one wrongness item (+5)') }
  else reasons.push('Problems: no real wrongness item identified (+0)')

  // 3. Corrected Implementation (25): fenced code content only.
  const blocks = extractFencedBlocks(corrected)
  if (blocks.length === 0) {
    reasons.push('Corrected Implementation: no fenced code block found (+0 for the whole block)')
  } else {
    const block = blocks.find((b) => /!\s*result\.ok\b|result\.ok\s*===\s*false/.test(b)) ?? blocks[0]
    let blockScore = 0
    if (/await\s+(?:ctx\.)?remote|const\s+result\s*=\s*await/i.test(block)) {
      blockScore += 5
      reasons.push('Corrected Implementation: awaits the remote call (+5)')
    } else {
      reasons.push('Corrected Implementation: fenced code does not await the remote call (+0)')
    }
    if (/!\s*result\.ok\b|result\.ok\s*===\s*false/.test(block)) {
      blockScore += 8
      reasons.push('Corrected Implementation: explicit failure branch (!result.ok) present (+8)')
    } else {
      reasons.push('Corrected Implementation: fenced code has no result.ok failure branch (+0)')
    }
    if (/result\.error/.test(block)) {
      blockScore += 6
      reasons.push('Corrected Implementation: failure branch accesses result.error (+6)')
    } else {
      reasons.push('Corrected Implementation: fenced code does not access result.error (+0)')
    }
    const valueIndex = block.search(/result\.value/)
    const branchIndex = block.search(/!\s*result\.ok\b|result\.ok\s*===\s*false/)
    if (branchIndex >= 0 && valueIndex >= 0 && branchIndex < valueIndex) {
      blockScore += 6
      reasons.push('Corrected Implementation: result.value is read only after the failure branch (+6)')
    } else if (branchIndex >= 0 && valueIndex < 0) {
      reasons.push('Corrected Implementation: no result.value read; ordering not verifiable (+0)')
    } else if (branchIndex < 0) {
      reasons.push('Corrected Implementation: ordering not applicable without a failure branch (+0)')
    } else {
      reasons.push('Corrected Implementation: result.value is read before the failure branch (+0)')
    }
    score += blockScore
  }

  // 4. RemoteResult Control Flow (20): four items, 5 each.
  if (/(?:ok\s*:\s*true)|(?:success).{0,30}value|value.{0,30}success/i.test(control)) {
    score += 5; reasons.push('RemoteResult Control Flow: success -> ok:true / result.value (+5)')
  } else reasons.push('RemoteResult Control Flow: missing success -> ok:true / result.value (+0)')
  if (/ok\s*:\s*false|failure branch|失败分支/i.test(control)) {
    score += 5; reasons.push('RemoteResult Control Flow: ordinary failure -> ok:false / result.error (+5)')
  } else reasons.push('RemoteResult Control Flow: missing ordinary failure -> ok:false / result.error (+0)')
  if (NOT_REJECT_RE.test(control)) {
    score += 5; reasons.push('RemoteResult Control Flow: the Promise stays resolved for ordinary unary failures (+5)')
  } else reasons.push('RemoteResult Control Flow: missing "Promise stays resolved" (+0)')
  if (/catch.{0,60}(?:not|never|不).{0,30}(?:business|ordinary|failure|失败)|(?:not|不).{0,40}(?:ordinary|business|普通|业务).{0,30}(?:catch|path)/i.test(control)) {
    score += 5; reasons.push('RemoteResult Control Flow: catch is not the ordinary business-failure path (+5)')
  } else reasons.push('RemoteResult Control Flow: missing "catch is not the business-failure path" (+0)')

  // 5. Reject Boundary (15): three items, 5 each.
  if (/(?:assembly|programming|arity|unmounted|Context\s+adapter|装配|编程).{0,50}(?:reject|throw|拒绝|抛出)/i.test(reject)) {
    score += 5; reasons.push('Reject Boundary: assembly/programming faults can reject (+5)')
  } else reasons.push('Reject Boundary: missing "assembly/programming faults can reject" (+0)')
  if (/arity|unmounted|missing.{0,20}(?:Context\s+)?adapter/i.test(reject)) {
    score += 5; reasons.push('Reject Boundary: concrete example (arity / unmounted method / missing Context adapter) (+5)')
  } else reasons.push('Reject Boundary: no concrete assembly-fault example (+0)')
  if (/(?:reject|assembly|programming|arity|unmounted|adapter|装配|编程|异常).{0,80}(?:propagat|surface|expose|传播|暴露|not.{0,20}swallow|不.{0,20}吞)/i.test(reject)) {
    score += 5; reasons.push('Reject Boundary: genuine rejects must propagate/expose (+5)')
  } else reasons.push('Reject Boundary: missing "genuine rejects must propagate" (+0)')

  // 6. Error Boundary (10): two items, 5 each.
  if (/(?:not|never|avoid|don'?t|shouldn'?t|不应|不要|避免).{0,30}instanceof|(?:discriminat|区分|判别).{0,30}(?:by|按|用).{0,15}code/i.test(boundary)) {
    score += 5; reasons.push('Error Boundary: no instanceof discrimination / branch on code (+5)')
  } else reasons.push('Error Boundary: missing "do not discriminate via instanceof" (+0)')
  if (/isRemoteFailure/i.test(boundary) && /(?:only|真正|只|仅)[\s\S]{0,60}?(?:catch|throw|stream)|(?:catch|throw|stream)[\s\S]{0,60}?(?:only|真正|只|仅)|catch\s+boundary|boundary[\s\S]{0,40}?isRemoteFailure|isRemoteFailure[\s\S]{0,40}?boundary/i.test(boundary)) {
    score += 5; reasons.push('Error Boundary: isRemoteFailure scoped to a true throw/catch boundary (+5)')
  } else reasons.push('Error Boundary: missing the isRemoteFailure throw/catch-boundary scope (+0)')

  // ── Direction-aware wrong-claim detection (Root Cause + Control Flow) ──
  const wrongClaim = /(?:all|every|ordinary|business|unary|remote).{0,60}(?:failures?|errors?).{0,30}(?:reject|throw|are\s+thrown|are\s+rejected|surface\s+in\s+catch|enter\s+catch|caught)|(?:should|must|primary|mainly|primarily).{0,40}(?:handl|catch)|handl.{0,10}(?:in|via|through|by).{0,10}catch|(?:全部|所有).{0,15}(?:失败|错误).{0,20}(?:会|都).{0,10}(?:throw|reject|抛)|主要靠.{0,10}catch/i
  const wrongHits = []
  for (const section of [root, control]) {
    for (const match of section.matchAll(new RegExp(wrongClaim.source, 'gi'))) {
      const before = section.slice(Math.max(0, match.index - 50), match.index)
      // The negation may sit inside the matched span itself ("does **not** reject"),
      // so the negation window covers the text before AND the match.
      if (/(?:not|don'?t|shouldn'?t|doesn'?t|never|不|不应|不该|不能|避免)/i.test(`${before} ${match[0]}`)) continue
      wrongHits.push(match[0].slice(0, 80))
    }
  }

  // ── Caps (minimum of all triggered caps) ──
  let capped = 100
  const correctedBlocks = extractFencedBlocks(corrected)
  const correctedCode = correctedBlocks.join('\n')

  if (wrongHits.length > 0) {
    capped = Math.min(capped, 30)
    reasons.push(`cap 30: report still claims ordinary failures primarily throw/reject and are handled in catch (${wrongHits[0]})`)
  }
  if (!/result\.ok|result\[['"]ok['"]\]|ok\s*:\s*false|ok\s*===\s*false/i.test(reportText)) {
    capped = Math.min(capped, 50)
    reasons.push('cap 50: the report never mentions result.ok (no success/failure discriminant anywhere)')
  }
  {
    const valueIndex = correctedCode.search(/result\.value/)
    const branchIndex = correctedCode.search(/!\s*result\.ok\b|result\.ok\s*===\s*false/)
    if (valueIndex >= 0 && (branchIndex < 0 || branchIndex > valueIndex)) {
      capped = Math.min(capped, 60)
      reasons.push('cap 60: the corrected fenced code reads result.value without a prior result.ok failure branch')
    }
  }
  if (/instanceof\s+RemoteError/i.test(correctedCode)) {
    capped = Math.min(capped, 60)
    reasons.push('cap 60: the corrected fenced code discriminates with instanceof RemoteError')
  }
  for (const body of catchBodies(correctedCode)) {
    if (!/throw|reject/.test(body)) {
      capped = Math.min(capped, 60)
      reasons.push('cap 60: the corrected fenced code has a catch block that swallows/retries/converts rejects instead of propagating them')
      break
    }
  }

  return { score: Math.min(score, capped), reasons }
}

// Patterns shared by Root Cause and RemoteResult Control Flow.
const NOT_REJECT_RE = /(?:does|do)\s+\*{0,2}not\*{0,2}\s+(?:reject|throw)|(?:is|are)\s+\*{0,2}not\*{0,2}\s+(?:rejected|thrown)|never\s+(?:rejects?|throws?)\b|never\s+(?:enters?|lands?\s+in|goes?\s+into)\b.{0,20}catch|no\s+rejection|(?:不进|不会进|不进入|不会进入|不会走|不走).{0,10}catch|(?:not|不).{0,20}(?:through|via|by)\s+(?:reject|throw|catch)|(?:stays?|remains?|is)\s+resolved/i

// ── Markdown section parser ──
// Only level-2 Markdown headings (`## ...`) start or switch a block; `###` / `####`
// sub-headings never end the current canonical section, so content below a `### Detail`
// keeps counting toward the enclosing section. Only canonical titles (plus the accepted
// aliases) are scored; an unrecognized `##` heading switches to an unscored block, and
// content outside any recognized section is ignored.
export function parseSections(text) {
  const sections = new Map()
  const lines = text.replaceAll('\r\n', '\n').split('\n')
  let current = null
  for (const line of lines) {
    const h2 = /^##\s+(.+?)\s*$/.exec(line)
    if (h2) {
      const title = h2[1].trim()
      const canonical = CANONICAL.find((c) => title.toLowerCase() === c.toLowerCase())
      const aliasOf = canonical ?? CANONICAL.find((c) => (ALIASES[c] ?? []).includes(title))
      current = aliasOf ?? null
      if (aliasOf && !sections.has(aliasOf)) sections.set(aliasOf, [])
      continue
    }
    if (current) {
      const entry = sections.get(current)
      entry.push(line)
    }
  }
  const result = new Map()
  for (const title of CANONICAL) result.set(title, (sections.get(title) ?? []).join('\n'))
  return result
}

// Extract catch-block bodies with brace matching. A lazy `[\s\S]*?` stops at the
// first `}`, so a correct fix like `catch (e) { if (x) { log(e) } throw e }`
// would be misread as swallowing; walk brace depth to the real end of the block.
export function catchBodies(code) {
  const bodies = []
  const re = /catch\s*(?:\([^)]*\))?\s*\{/g
  for (const m of code.matchAll(re)) {
    let depth = 1
    let i = m.index + m[0].length
    while (i < code.length && depth > 0) {
      if (code[i] === '{') depth++
      else if (code[i] === '}') depth--
      i++
    }
    bodies.push(code.slice(m.index + m[0].length, i - 1))
  }
  return bodies
}

// Fenced code blocks: ```ts / ```js / ```typescript / ```javascript / plain ```.
export function extractFencedBlocks(text) {
  const blocks = []
  const re = /```[ \t]*(?:ts|typescript|js|javascript)?[ \t]*\r?\n([\s\S]*?)\r?\n?```/g
  for (const match of text.matchAll(re)) blocks.push(match[1])
  return blocks
}
