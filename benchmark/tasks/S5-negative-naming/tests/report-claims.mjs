// Kept identical in S5, S6, S7 and H8: Harbor copies each task's tests in isolation.
// Recognize explicit denials/prohibitions locally, not a report-wide exemption.
// These bounded text rules are not a general natural-language entailment parser.
const BOUNDARY = /([。！？!?；;，,|\r\n]|\.(?=\s|$)|但是|然而|不过|而是|反而|但|却|\b(?:but|however|instead|yet)\b)/i
const NEGATION = /并非|不(?:是|要|应(?:该)?|能|可(?:以)?|必|需(?:要)?|该|得|会|建议|推荐|允许|认定|认为|等于|意味着)|不(?=保留|保持|继续|删|运行|执行|使用|安装|断言)|无[需须]|没有|严禁|禁止|避免|拒绝|切勿|请勿|勿|别|错误(?:示例|做法|建议)|反例|\b(?:not(?!\s+(?:only|just)\b)|never|no|cannot|can['’]t|don['’]t|doesn['’]t|shouldn['’]t|mustn['’]t|avoid|forbidden|prohibited|bad example|incorrect example)\b|(?:不|无)\s*$/gi
const COORDINATION = /^[\s"'“”‘’]*(?:或(?:者)?|和|与|及|以及|并且|且|也|\/|、|and|or)[\s"'“”‘’]*(?:(?:pnpm|npm|yarn)\s+)?$/i
const REJECTED_AFTER = /^[\s\])}"'“”‘’]*(?:(?:代码|逻辑|操作|命令|做法|说法|建议|这个判断)\s*)?(?:(?:是|属于|为)?\s*(?:错误的?|不可取|不被允许|不推荐|不应(?:该)?(?:使用|执行|运行|采用)|应(?:该)?避免)|(?:is|are|would be)\s+(?:wrong|incorrect|forbidden|prohibited|not\s+(?:recommended|allowed|an?\s+option))\b)/i

function analyze(text, pattern) {
  const normalized = text
    // Keep an explicit warning attached to its fenced command example.
    .replace(/([:：])[ \t]*\r?\n[ \t]*```[^\r\n]*\r?\n/g, '$1 ')
    .replace(/[`*]/g, '')
  const matcher = new RegExp(pattern.source, [...new Set(pattern.flags.replace(/[gy]/g, '') + 'g')].join(''))
  const parts = normalized.split(BOUNDARY)
  const claims = []
  for (let i = 0; i < parts.length; i += 2) {
    const clause = parts[i]
    let previous = null
    const spans = []
    for (const match of clause.matchAll(matcher)) {
      const end = match.index + match[0].length
      const prefix = clause.slice(previous?.end ?? 0, match.index)
      const inherited = previous && COORDINATION.test(prefix) ? previous.negated : false
      const negations = [...prefix.matchAll(NEGATION)].length
      const negated = inherited || negations % 2 === 1 || REJECTED_AFTER.test(clause.slice(end))
      claims.push({ negated })
      if (negated) spans.push([match.index, end])
      previous = { end, negated }
    }
    // Mask only the rejected claim, keeping other assertions on the same line.
    for (const [start, end] of spans.reverse()) {
      parts[i] = parts[i].slice(0, start) + ' '.repeat(end - start) + parts[i].slice(end)
    }
  }
  return { text: parts.join(''), claims }
}

export function maskNegatedMatches(text, pattern) {
  return analyze(text, pattern).text
}

export function hasAffirmativeMatch(text, pattern) {
  return analyze(text, pattern).claims.some(claim => !claim.negated)
}
