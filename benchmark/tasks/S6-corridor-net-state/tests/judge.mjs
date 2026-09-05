// S6-corridor-net-state 判分：fixture 只读门禁 + 净状态裁决四要点 + 陷阱封顶。
// 考点（DSH-0.1.2-A1-02 → DSH-0.1.2-A2-01 走廊折叠）：
//   1. 两张卡都要出现（一删一复的完整走廊）
//   2. 结论：删除 alpha.1 时代的防御代码（目标已恢复语义）
//   3. producer 语义：只有 informational 事件才写 ignorable: true（marker 不是消费端过滤指令）
//   4. 能力缺口：公开 Session.append 无 ignorable 参数，不能靠 cast 假装有公开入口
import { emit, fixtureChanges, readAgentText } from './judge-utils.mjs'
import { pathToFileURL } from 'node:url'
import { hasAffirmativeMatch } from './report-claims.mjs'

const TASK = 'S6-corridor-net-state'

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) main().catch((error) => emit(0, [`judge 异常: ${error.message}`]))

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

  const result = scoreReport(text)
  emit(result.score, [...reasons, ...result.reasons])
}

export function scoreReport(text) {
  const reasons = []
  let score = 0

  // 1. 走廊折叠：两张卡都出现
  const hasA102 = /(?:DSH-0\.1\.2-)?A1-02\b/.test(text)
  const hasA201 = /(?:DSH-0\.1\.2-)?A2-01\b/.test(text)
  if (hasA102 && hasA201) {
    score += 25
    reasons.push('走廊折叠：DSH-0.1.2-A1-02 与 DSH-0.1.2-A2-01 两张卡都出现（+25）')
  } else {
    reasons.push(`走廊折叠不完整（A1-02:${hasA102} A2-01:${hasA201}）（+0）`)
  }

  // 2. 删除防御代码
  if (/删除[^。\n]{0,15}(?:防御|这段|该段|该行|该代码)|(?:防御|这段)[^。\n]{0,15}(?:应)?删除/.test(text)) {
    score += 25
    reasons.push('结论正确：删除 alpha.1 防御代码（+25）')
  } else {
    reasons.push('未明确"删除防御代码"的结论（+0）')
  }

  // 3. producer 语义
  if (/producer[^。\n]{0,40}不(?:应|该|能|需)[^。\n]{0,12}(?:写|设置)[^。\n]{0,10}ignorable/.test(text)) {
    reasons.push('producer 语义答反：informational 事件才写 ignorable: true（+0）')
  } else if (/ignorable[^。\n]{0,40}(?:true|保留)|informational[^。\n]{0,40}ignorable|信息性[^。\n]{0,30}事件[^。\n]{0,30}ignorable/.test(text)) {
    score += 25
    reasons.push('producer 语义正确：informational 事件写 ignorable: true（+25）')
  } else {
    reasons.push('缺少正确 producer 语义（+0）')
  }

  // 4. Session.append 能力缺口
  if (/Session\.append|session\.append|append\(/.test(text) && /(?:能力缺口|公开[^。\n]{0,20}无[^。\n]{0,10}参数|没有[^。\n]{0,12}参数|不[^。\n]{0,6}cast|cast[^。\n]{0,16}(?:禁止|不可|假装))/.test(text)) {
    score += 25
    reasons.push('识别公开 Session.append 无 ignorable 参数的能力缺口、不靠 cast（+25）')
  } else {
    reasons.push('未识别 Session.append 的能力缺口（+0）')
  }

  // 陷阱：按注释继续保留防御/继续删 marker
  if (hasAffirmativeMatch(text, /(?:继续|仍应|保留)[^。\n]{0,20}删(?:除)?[^。\n]{0,10}marker|(?:保持|继续|保留)[^。\n]{0,20}防御(?:代码)?|(?<=marker[^。\n]{0,20})(?:继续|保留)[^。\n]{0,10}删/)) {
    score = Math.min(score, 10)
    reasons.push('陷阱命中：按注释继续删 marker / 保留防御，封顶 10')
  }

  return { score, reasons }
}
