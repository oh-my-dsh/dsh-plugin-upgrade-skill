/**
 * dsh-perf 消息渲染负载加权评估(#2)。
 *
 * 实测依据(官方 bundle 锚点):
 * - 助手 data.blocks 只有 text / reasoning / tool-call 三种; 代码围栏是 text 块
 *   内的 markdown 源码, settled 时每个围栏在主线程同步 codeToHtml(shiki), 且聊天
 *   代码块无行数上限(对比官方 ReadBlock/DiffBlock/TerminalBlock 的 16 行封顶)。
 * - KaTeX 在 settled 时逐公式 renderToString + DOMParser, 无缓存; 流式期不解析。
 * - reasoning 终态是折叠纯文本(ReasoningRow), 无高亮无公式, 成本远低于正文。
 * - tool-call 的 argsRaw 终态默认折叠, 按低权重计入。
 *
 * 纯函数, 供单测直接引用; 不引 react。
 */

export interface HeavinessBlock {
  kind?: string
  text?: string
  argsRaw?: string
}

/** 围栏内字符在基础长度上额外计权(shiki 逐字符 tokenize 是主导成本)。 */
const CODE_EXTRA_WEIGHT = 1
/** 每个数学公式的等价字符成本(renderToString + DOMParser 的固定开销)。 */
const FORMULA_WEIGHT = 1000
/** reasoning 终态为折叠纯文本, 按 1/5 计。 */
const REASONING_FACTOR = 0.2
/** tool-call argsRaw 终态默认折叠, 按 1/4 计。 */
const TOOL_CALL_FACTOR = 0.25

const FENCE_RE = /```[\s\S]*?(?:```|$)/g

/** 统计未配对定界符数量(O(n) 扫描, 避免正则灾难性回溯)。 */
function countDelimiters(text: string, delimiter: string): number {
  let count = 0
  let at = text.indexOf(delimiter)
  while (at >= 0) {
    count += 1
    at = text.indexOf(delimiter, at + delimiter.length)
  }
  return count
}

/** 计算一组消息块的渲染负载分(等价字符数)。 */
export function scoreBlocks(blocks: readonly HeavinessBlock[]): number {
  let score = 0
  for (const block of blocks) {
    if (block === undefined || block === null) continue
    if (block.kind === 'reasoning') {
      score += (block.text?.length ?? 0) * REASONING_FACTOR
      continue
    }
    if (block.kind === 'tool-call') {
      score += (block.argsRaw?.length ?? 0) * TOOL_CALL_FACTOR
      continue
    }
    const text = block.text ?? ''
    score += text.length
    FENCE_RE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = FENCE_RE.exec(text)) !== null) {
      score += match[0].length * CODE_EXTRA_WEIGHT
    }
    const formulas = Math.floor(countDelimiters(text, '$$') / 2) + countDelimiters(text, '\\[')
    score += formulas * FORMULA_WEIGHT
  }
  return Math.round(score)
}
