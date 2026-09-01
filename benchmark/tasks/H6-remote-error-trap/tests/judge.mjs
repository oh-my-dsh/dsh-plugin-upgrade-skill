// H6-remote-error-trap 判分：fixture 只读门禁 + 错误流迁移四要点 + 陷阱封顶。
// 考点（DSH-0.1.2-A2-02 + DSH-0.1.2-A1-30 实战批注"静默吞错"）：
//   1. 错误码命名空间迁移：cancelled → gateway/cancelled、internal → gateway/internal
//      （闭卷下精确拼写不可猜——"指出已加命名空间 + 拼写待确认"得半分 12）
//   2. gateway/cancelled：终止或沿调用链传播取消，不重试、不报通用错误
//   3. gateway/internal 与未知码：保留原始 code/details 并上报，不盲重试
//   4. 拆除 catch 全吞：装配缺陷应暴露修复；禁用跨 realm instanceof RemoteError
import { emit, fixtureChanges, readAgentText } from './judge-utils.mjs'

const TASK = 'H6-remote-error-trap'

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

  // 1. 错误码迁移
  const hasCancelled = /gateway\/cancelled/.test(text)
  const hasInternal = /gateway\/internal/.test(text)
  const namespacedHint = /命名空间|namespace/i.test(text) && /待确认|确切[^。\n]{0,10}拼写|具体拼写/i.test(text)
  if (hasCancelled && hasInternal) {
    score += 25
    reasons.push('错误码命名空间迁移完整（gateway/cancelled + gateway/internal）（+25）')
  } else if (namespacedHint) {
    score += 12
    reasons.push('指出错误码已加命名空间但精确拼写待确认（半分 +12）')
  } else {
    reasons.push('未给出错误码命名空间迁移（+0）')
  }

  // 2. cancel 语义
  if (/(?:gateway\/cancelled|取消|cancel)[^。\n]{0,60}(?:不重试|传播|终止)|(?:不重试|传播|终止)[^。\n]{0,60}(?:取消|cancel)/.test(text)) {
    score += 25
    reasons.push('cancel 分支：终止/传播取消、不重试、不报通用错误（+25）')
  } else {
    reasons.push('缺少 cancel 分支正确语义（+0）')
  }

  // 3. internal/未知码
  if (/(?:gateway\/internal|internal|未知码?)[^。\n]{0,80}(?:上报|保留[^。\n]{0,10}(?:code|码)|不(?:盲)?重试|fail-closed|显式失败)/i.test(text)) {
    score += 25
    reasons.push('internal/未知码：保留 code/details 上报、不盲重试（+25）')
  } else {
    reasons.push('缺少 internal/未知码正确语义（+0）')
  }

  // 4. 拆吞错 + 禁用 instanceof
  if (/(?:吞|catch)[^。\n]{0,60}(?:暴露|拆|去除|不)|装配缺陷|静默吞错/.test(text)) {
    score += 25
    reasons.push('拆除静默吞错、装配缺陷暴露修复（+25）')
  } else {
    reasons.push('缺少拆除静默吞错的处置（+0）')
  }

  // 陷阱 1：保留旧码/继续用老字符串（照抄注释）
  if (/(?:保留|别改|不改|继续用)[^。\n]{0,30}(?:老|旧)(?:码|错误码|字符串)|(?:老|旧)(?:码|字符串)[^。\n]{0,20}(?:别改|不改|继续)/.test(text)) {
    score = Math.min(score, 25)
    reasons.push('陷阱命中：报告按注释保留旧错误码，封顶 25')
  }
  // 陷阱 2：建议（而非禁止）跨 realm 用 instanceof 判别业务失败
  if (/(?:建议|应当|应该|可以|可用)[^。\n]{0,8}用[^。\n]{0,8}instanceof|instanceof[^。\n]{0,6}(?:判断|判别)/.test(text)) {
    score = Math.min(score, 50)
    reasons.push('报告建议用 instanceof RemoteError 判别业务失败，封顶 50')
  }

  emit(score, reasons)
}
