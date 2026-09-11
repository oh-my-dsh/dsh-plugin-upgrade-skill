// Local deterministic diagnostic rubric, not general semantic certification.
// Criteria use bounded report units (a paragraph/list item/table row), concrete
// fixture symbols, and asserted migration facts. Card IDs never affect credit.
// Exact successor symbols unavailable in a closed-book fixture are not required.
// Claim polarity rules are inlined so Harbor can copy this tests directory in isolation.
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
      // A negation of an earlier proposition is not a negation of this action.
      // Keep explicit coordinated target inheritance; otherwise bind locally
      // after an independent conjunction or a Chinese conditional consequence.
      const localPrefix = prefix.split(/\b(?:and|then|so|therefore)\b|(?:时|后|则|就)(?=(?:也|仍|还)?(?:应|需|可|必|请|要|不|勿))/i).at(-1)
      const negations = [...localPrefix.matchAll(NEGATION)].length
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

export function hasAffirmativeMatch(text, pattern) {
  return analyze(text, pattern).claims.some(claim => !claim.negated)
}

const CARDS = /(?:DSH-0\.1\.2-)?A[12]-\d{2}\b/g
function context(text) {
  const clean = text.replace(CARDS, '').replace(/[`*]/g, '')
  const units = clean.split(/\n\s*\n|(?<=[。.!?])\n|\n(?=\s*(?:[|#]|[-+] |\d+[.)] ))/).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean)
  // Oversized prose is split at sentence boundaries, never a report-wide bag.
  const bounded = units.flatMap(s => s.length <= 1400 ? [s] : s.split(/(?<=[。!?]|\.(?=\s))\s*/))
  return { clean, units: bounded, has: (...patterns) => bounded.some(s => s.length <= 1400 && patterns.every(p => p.test(s))), claim: (anchors, action) => bounded.some(s => s.length <= 1400 && anchors.every(p => p.test(s)) && hasAffirmativeMatch(s, action)) }
}
function result(text, criteria, caps = []) {
  let score = criteria.reduce((n, c) => n + (c[2] ? c[1] : 0), 0)
  const reasons = criteria.map(([id, points, met]) => `${id}: ${met ? points : 0}/${points}`)
  for (const [hit, ceiling, reason] of caps) if (hit) { score = Math.min(score, ceiling); reasons.push(reason) }
  return { score: Math.round(score), reasons, gradingMode: 'deterministic-diagnostic-rubric', rubricVersion: '2', metrics: { cardIds: [...new Set(text.match(CARDS) || [])], criteria: criteria.map(([id, points, met]) => ({id, points, earned: met ? points : 0})) } }
}
const removed = /removed|deleted|retired|拆除|移除|删除|失效|消失/i
const migrate = /migrat\w*|replac\w*|switch|repoint|use\b|inject\w*|改走|改从|替换|迁移|改为|注入|使用|对齐/i
export function scoreReport(text) {
  const {has, claim, clean} = context(text)
  const runtime = claim([/index\.ts/, /dsh-client-runtime/, /ClientContext/], removed)
  const registration = has(/pet-legacy-bundle/, /dsh-pet-session-bench|package\.json/, /mismatch|≠|not|align|不一致|不等|违反/i)
  const content = claim([/index\.ts/, /useSession/, /nodes/], /removed|flat|移除|平铺|失效/i)
  const connection = claim([/index\.ts/, /connection\.api/, /agentPresets/], removed)
  const invented = hasAffirmativeMatch(clean, /(?:replace|change|migrate)\s+apply\s+(?:with|to)\s+(?:setup|activate)|apply[^。\n]{0,12}(?:生命周期|被替换|已替换)|(?:move|put)\s+(?:service\s+)?inject\s+(?:into|to)\s+(?:the\s+)?manifest|inject[^。\n]{0,30}(?:移入|移到)manifest/i)
  const harmless = hasAffirmativeMatch(clean, /(?:type imports?[^。\n]{0,30}(?:harmless|safe)|类型导入[^。\n]{0,30}无害)/i)
  return result(text, [
    ['runtime-removal', 25, runtime && claim([/Context/, /owner|owning|cordis|目标.*包|所属|归属/i], /import|replac|改从|导入|替换/i) && !harmless],
    ['registration-id', 25, registration && claim([/注册\s*id|registration|loader|bundle|name/i, /package\.json|name/i], /align|match|equal|对齐|一致|相同/i)],
    ['session-content', 25, content && has(/durable|selector|target.*content|公开.*读|事件窗/i, /order|保序|顺序/i, /read|use|读取|经|改走/i)],
    ['connection-face', 25, connection && claim([/Remote|public.*interface|public.*API|公开访问面|公开.*接口/i], /switch|replac|use|migrat|改走|迁移|替换/i)],
  ], [[invented, 70, 'unsupported lifecycle/manifest migration'], [hasAffirmativeMatch(clean, /(?:keep|retain|continue using|保留|继续使用)\s+(?:the\s+)?(?:old\s+)?(?:connection\.api|dsh-client-runtime|useSession\s+nodes)/i), 40, 'reverse migration: retaining removed client API']])
}

export const gradeReport = scoreReport
