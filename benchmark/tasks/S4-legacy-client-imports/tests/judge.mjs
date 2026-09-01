// S4-legacy-client-imports 判分：fixture 只读门禁 + 四张卡片映射 + 幻觉卡封顶。
// 考点（0.1.1-rc.2 → 0.1.2-alpha.2 的 client runtime 四连）：
//   DSH-0.1.2-A1-25  @deepseek-ai/dsh-client-runtime 包拆除（类型与运行时都断）
//   DSH-0.1.2-A1-26  client-modules 扫描契约：注册 id 必须等于 package.json name
//   DSH-0.1.2-A1-27  会话内容读取改走 SessionBinding durable 事件窗
//   DSH-0.1.2-A1-30  客户端 ctx.connection.api face 整体移除
// 2026-08-31 标定新增：闭卷 agent 会自造"升级卡"（apply 生命周期替换 / inject 移入
// manifest 等不存在的变更）——确定性幻觉断言封顶 70；把 A1-25 说成"类型导入编译期
// 擦除所以无害"按未命中处理。
import { emit, fixtureChanges, readAgentText } from './judge-utils.mjs'

const TASK = 'S4-legacy-client-imports'
const EXPECTED_CARDS = ['A1-25', 'A1-26', 'A1-27', 'A1-30']
const PER_CARD = 100 / EXPECTED_CARDS.length
const ERASED_HARMLESS = /类型导入[^。\n]{0,30}(?:无害|编译期擦除)|擦除[^。\n]{0,30}无害/
const HALLUCINATED = /apply[^。\n]{0,12}(?:生命周期|被替换|已替换)|生命周期[^。\n]{0,12}替换|inject[^。\n]{0,30}manifest|manifest[^。\n]{0,30}注入|setup[^。\n]{0,12}activate/

main().catch((error) => emit(0, [`judge 异常: ${error.message}`]))

async function main() {
  const reasons = []

  const gate = await fixtureChanges('fixture')
  if (gate.changed === true) {
    emit(0, [`fixture 被改动，本题 0 分（只读纪律）: ${gate.detail}`])
  }
  if (gate.changed === null) reasons.push(`警告: ${gate.detail}`)
  else reasons.push('fixture 未被修改（只读纪律通过）')

  const { text, files } = readAgentText('', TASK)
  if (!text.trim()) {
    emit(0, [...reasons, `未在 /app/agent-output/${TASK}/ 找到报告，按 0 分处理`])
  }
  reasons.push(`读取到 agent 报告: ${files.join(', ')}`)

  let score = 0
  for (const card of EXPECTED_CARDS) {
    const pattern = new RegExp(`(?:DSH-0\\.1\\.2-)?${card.slice(0, 2)}-${card.slice(3)}\\b`)
    if (pattern.test(text) && !(card === 'A1-25' && ERASED_HARMLESS.test(text))) {
      score += PER_CARD
      reasons.push(`命中卡片 ${card}`)
    } else if (card === 'A1-25' && ERASED_HARMLESS.test(text)) {
      reasons.push(`A1-25 被误判为"类型导入编译期擦除所以无害"，按未命中处理（-${Math.round(PER_CARD)}）`)
    } else {
      reasons.push(`缺少卡片 ${card}（-${Math.round(PER_CARD)} 分）`)
    }
  }

  if (HALLUCINATED.test(text)) {
    score = Math.min(score, 70)
    reasons.push('报告含确定性幻觉断言（apply 生命周期替换 / inject 移入 manifest 等自造"卡"），封顶 70')
  }

  emit(score, reasons)
}
