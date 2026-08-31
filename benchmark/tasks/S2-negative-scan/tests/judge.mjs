// S2-negative-scan 判分：
//   40 分 —— 命中类（#3 apiProxy）正确映射 DSH-0.1.2-A1-01；
//   20 分 —— 报告中承认存在零命中类并逐类交代（未命中说明）；
//   20 分 —— 明确「零命中 ≠ 兼容」语义；
//   20 分 —— 声明必须验证（build/typecheck、真实挂载/冷启动、功能路径）。
// 对应 references/pre-flight.md 的负面清单：启发式扫描不是兼容性证明。
import { emit, fixtureChanges, readAgentText } from './judge-utils.mjs'

const TASK = 'S2-negative-scan'

main().catch((error) => emit(0, [`judge 异常: ${error.message}`]))

async function main() {
  const reasons = []

  const gate = await fixtureChanges('fixture')
  if (gate.changed === true) {
    emit(0, [`fixture 被改动，本题 0 分（本题只要求输出报告）: ${gate.detail}`])
  }
  if (gate.changed === null) reasons.push(`警告: ${gate.detail}`)

  const { text, files } = readAgentText('', TASK)
  if (!text.trim()) {
    emit(0, [...reasons, `未在 /app/agent-output/${TASK}/ 找到报告，按 0 分处理`])
  }
  reasons.push(`读取到 agent 报告: ${files.join(', ')}`)

  let score = 0

  // 1. 正确卡片映射：#3 apiProxy → A1-01
  if (/(?:DSH-0\.1\.2-)?A1-01\b/.test(text)) {
    score += 40
    reasons.push('命中类 #3 正确映射到 DSH-0.1.2-A1-01（+40）')
  } else {
    reasons.push('未映射到 DSH-0.1.2-A1-01（+0）')
  }

  // 2. 承认零命中类的存在并逐类交代
  const hitZero = /零命中|无命中|未命中|0\s*命中|没有命中|no hits?|zero hit/i.test(text)
  if (hitZero) {
    score += 20
    reasons.push('报告交代了零命中触点类（+20）')
  } else {
    reasons.push('未交代零命中触点类（+0）')
  }

  // 3. 零命中 ≠ 兼容
  const notCompatible = /不(?:等于|代表|意味)|并非|不能(?:据此|视为|认为)|≠|没有?证明兼容|无法(?:据此)?证明|不构成兼容|不(?:能|可).*兼容/i.test(text)
  if (notCompatible) {
    score += 20
    reasons.push('明确零命中不等于兼容（+20）')
  } else {
    reasons.push('未声明「零命中 ≠ 兼容」（+0）')
  }

  // 4. 必须验证
  const mustVerify = /必须验证|还需验证|仍(?:须|需).{0,8}验证|真实挂载|真实验证|冷启动|烟测|build|typecheck|实机/i.test(text)
  if (mustVerify) {
    score += 20
    reasons.push('声明迁移前/后必须真实验证（+20）')
  } else {
    reasons.push('未声明必须验证（+0）')
  }

  emit(score, reasons)
}
