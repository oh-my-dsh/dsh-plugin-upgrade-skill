// S7-unpublished-cohort 判分：fixture 只读门禁 + 方案四要点 + 陷阱封顶。
// 考点（rollup R-01 + npm semver 语义）：
//   1. registry 查证先行（npm view / 从未发布），不凭 dist-tag 推断
//   2. 合法路径 A：GitHub tag 构建 + pnpm pack → overrides 钉 file: tarball；
//      合法路径 B：精确 pin 已发布 0.1.2-alpha.2 + lockfile + npm ci + tsc 门禁
//   3. 退出路径/纪律：正式发布后删 overrides；不切换包管理器
//   4. 语义分析：^0.1.2-alpha.1 按 semver 静默解析到 alpha.2（声明与解析背离）
import { emit, fixtureChanges, readAgentText } from './judge-utils.mjs'

const TASK = 'S7-unpublished-cohort'

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

  // 1. registry 查证先行
  if (/npm view|从未发布|registry[^。\n]{0,24}(?:查|证实|确认)|已发布清单/i.test(text)) {
    score += 25
    reasons.push('registry 查证先行（+25）')
  } else {
    reasons.push('缺少 registry 查证（+0）')
  }

  // 2. 方案 A（overrides/tarball）或方案 B（精确 pin + lockfile）
  const pathA = /overrides|tarball|pnpm pack|file:/.test(text)
  const pathB = /lockfile|npm ci|pnpm ci|精确[^。\n]{0,8}pin|pin[^。\n]{0,24}0\.1\.2-alpha\.2|改钉[^。\n]{0,20}alpha\.2/.test(text)
  if (pathA && pathB) {
    score += 25
    reasons.push('给出两条合法路径（overrides tarball + 精确 pin/lockfile）（+25）')
  } else if (pathA) {
    score += 25
    reasons.push('方案 A：overrides/file: tarball（+25）')
  } else if (pathB) {
    score += 25
    reasons.push('方案 B：精确 pin 已发布版本 + lockfile（+25）')
  } else {
    reasons.push('未给出可行安装方案（+0）')
  }

  // 3. 退出路径/纪律
  if (/(?:正式发布|stable)[^。\n]{0,30}(?:删(?:除|掉)?|移除)[^。\n]{0,20}override|不(?:切换|混用)[^。\n]{0,10}包管理器/.test(text)) {
    score += 25
    reasons.push('退出路径/包管理器纪律明确（+25）')
  } else {
    reasons.push('缺少退出路径或包管理器纪律（+0）')
  }

  // 4. semver 语义分析（声明与解析背离）
  if (/(?:静默|^)[^。\n]{0,30}(?:解析到|漂移|背离)|\^0\.1\.2-alpha\.1[^。\n]{0,60}(?:解析|漂移|背离|装到|落到)/.test(text)) {
    score += 25
    reasons.push('识别 ^0.1.2-alpha.1 静默解析到 alpha.2 的声明背离（+25）')
  } else {
    reasons.push('未识别 caret 范围的静默解析语义（+0）')
  }

  // 陷阱：直接 npm i alpha.1 的处方
  if (/npm (?:i|install)[^。\n]{0,50}0\.1\.2-alpha\.1/.test(text)) {
    score = Math.min(score, 10)
    reasons.push('陷阱命中：处方直接安装从未发布的 alpha.1，封顶 10')
  }

  emit(score, reasons)
}
