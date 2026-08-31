// S1-static-scan 判分：fixture 只读门禁 + 卡片映射完整性。
// 期望卡集对应七类触点 → 走廊卡片的映射：
//   #3 apiProxy          → A1-01
//   #2 ignorable 事件    → A1-02（alpha.1 移除）+ A2-01（alpha.2 恢复）→ 走廊折叠，净状态保留
//   #1/#5 会话视图拆分   → A1-03
//   #4/#7 宿主路径/包装器 → A1-04
//   #6 loopback HTTP     → A1-08
import { emit, fixtureChanges, readAgentText } from './judge-utils.mjs'

const TASK = 'S1-static-scan'
const EXPECTED_CARDS = ['A1-01', 'A1-02', 'A1-03', 'A1-04', 'A1-08', 'A2-01']
const PER_CARD = 100 / EXPECTED_CARDS.length

main().catch((error) => emit(0, [`judge 异常: ${error.message}`]))

async function main() {
  const reasons = []

  // 门禁：fixture 必须零改动。
  const gate = await fixtureChanges('fixture')
  if (gate.changed === true) {
    emit(0, [`fixture 被改动，本题 0 分（只读纪律）: ${gate.detail}`])
  }
  if (gate.changed === null) reasons.push(`警告: ${gate.detail}`)
  else reasons.push('fixture 未被修改（只读纪律通过）')

  // 收集 agent 输出；缺输出按 0 分处理。
  const { text, files } = readAgentText('', TASK)
  if (!text.trim()) {
    emit(0, [...reasons, `未在 /app/agent-output/${TASK}/ 找到报告，按 0 分处理`])
  }
  reasons.push(`读取到 agent 报告: ${files.join(', ')}`)

  // 卡片映射：允许 A1-01 / DSH-0.1.2-A1-01 两种写法；词边界防 A1-010 误判。
  let score = 0
  for (const card of EXPECTED_CARDS) {
    const pattern = new RegExp(`(?:DSH-0\\.1\\.2-)?${card.slice(0, 2)}-${card.slice(3)}\\b`)
    if (pattern.test(text)) {
      score += PER_CARD
      reasons.push(`命中卡片 ${card}`)
    } else {
      reasons.push(`缺少卡片 ${card}（-${Math.round(PER_CARD)} 分）`)
    }
  }

  emit(score, reasons)
}
