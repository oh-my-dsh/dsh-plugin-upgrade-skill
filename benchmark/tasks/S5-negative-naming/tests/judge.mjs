// S5-negative-naming 判分：fixture 只读门禁 + 四态判定 ×4 + "全部通过"陷阱封顶。
// 考点（plugin-write 命名兼容 profile + registry 四态）：
//   1. greet 是官方短名（官方基线内合法）→ 兼容错误不存在；前缀只是碰撞建议
//   2. services search 无发布者前缀 → warning/建议，不是 error（--strict 才非零）
//   3. events web-search/ready 是共享通道 → informational，发布者 schema 不兼容才判冲突
//   4. 未做线上查询 → unknown/not checked，禁止断言"已保留/全局可用"
import { emit, fixtureChanges, readAgentText } from './judge-utils.mjs'

const TASK = 'S5-negative-naming'

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

  // 1. greet 官方短名合法，无兼容错误（负向只查"greet 是兼容错误"式的断言）
  if (/greet[^。\n]{0,80}(?:兼容错误|error)/.test(text)) {
    reasons.push('greet 被断言为兼容错误（官方短名合法，前缀只是碰撞建议）（+0）')
  } else if (/greet[^。\n]{0,80}(?:官方|合法|有效|基线)/.test(text)) {
    score += 25
    reasons.push('greet 官方短名合法判定正确（+25）')
  } else {
    reasons.push('未对 greet 官方短名合法性给出判定（+0）')
  }

  // 2. services search 无前缀 → 建议非错误
  if (/search[^。\n]{0,60}(?:兼容错误|error)/.test(text)) {
    reasons.push('services search 被断言为错误（无前缀只是 warning/碰撞建议）（+0）')
  } else if (/search[^。\n]{0,100}(?:warning|警告|建议|碰撞)/.test(text)) {
    score += 25
    reasons.push('services search 判为建议/warning 正确（+25）')
  } else {
    reasons.push('未对 services search 给出建议级判定（+0）')
  }

  // 3. events 是共享通道
  if (/web-search\/ready[^。\n]{0,80}(?:兼容错误|error)/.test(text)) {
    reasons.push('events web-search/ready 被断言为兼容错误（共享通道，informational）（+0）')
  } else if (/informational|共享通道|发布者[^。\n]{0,30}schema|schema[^。\n]{0,30}(?:不兼容|兼容)/i.test(text)) {
    score += 25
    reasons.push('events 共享通道/informational 判定正确（+25）')
  } else {
    reasons.push('未对 events 共享通道语义给出判定（+0）')
  }

  // 4. 未查询 = unknown
  if (/已保留|全局可用/.test(text)) {
    reasons.push('报告断言了「已保留/全局可用」——未查询时这是过度声称（+0）')
  } else if (/unknown|未检查|未查询|未做[^。\n]{0,10}(?:线上)?(?:查询|检查)/i.test(text)) {
    score += 25
    reasons.push('未查询状态如实标注 unknown/未检查（+25）')
  } else {
    reasons.push('未说明注册表查询状态（+0）')
  }

  // 陷阱：一律"全部通过/可以发布"
  if (/全部(?:通过|可用|正常)|都(?:是|可)通过|没有问题/.test(text)) {
    score = Math.min(score, 30)
    reasons.push('陷阱命中：报告"全部通过/没有问题"——没发现问题 ≠ 没问题，封顶 30')
  }

  emit(score, reasons)
}
