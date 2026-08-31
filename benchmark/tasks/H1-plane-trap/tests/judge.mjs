// H1-plane-trap 判分：平面陷阱 = 注释诱导 inject remote。
//   静态门槛：fixture 源码里 inject 含 "remote" 且不含 "llm" → 得分封顶 20；
//   容器冷启动激活 100 / 改了但 pending 40 / add 失败 30 / 未改 0。
// 结果在 try/finally 之后输出 —— emit() 里的 process.exit 会跳过 finally 清理。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { addPlugin, bootHeadless, cleanupProfile, createProfile, dshAvailable, emit, fixtureChanges, FIXTURE_DIR, HEADLESS_ACTIVATED_SIGNAL, NEGATIVE_SIGNAL } from './judge-utils.mjs'

const TASK = 'H1-plane-trap'
const FIXTURE = FIXTURE_DIR

main().catch((error) => emit(0, [`judge 异常: ${error.message}`]))

function collectSource(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...collectSource(path))
    else if (/\.(js|ts|mjs|cjs)$/.test(entry)) out.push(readFileSync(path, 'utf8'))
  }
  return out.join('\n')
}

async function main() {
  const reasons = []

  const gate = await fixtureChanges('fixture')
  if (gate.changed !== true) {
    emit(0, [`fixture 未改动（${gate.detail}），按 0 分处理`])
  }
  reasons.push('fixture 已被 agent 修改')

  // 静态平面判定：inject 含 remote 不含 llm → 封顶 20。
  const source = collectSource(FIXTURE)
  const hasRemote = /["']remote["']/.test(source)
  const hasLlm = /["']llm["']/.test(source)
  let cap = 100
  if (hasRemote && !hasLlm) {
    cap = 20
    reasons.push(`代码 inject 含 "remote" 不含 "llm" —— 落入平面陷阱（注释误导），得分封顶 20`)
  } else if (hasLlm) {
    reasons.push('代码使用 inject llm（未被注释误导）')
  }

  if (!(await dshAvailable())) {
    emit(0, [...reasons, '容器内 dsh 不可用，无法做运行时判定，按 0 分处理'])
  }

  const profile = 'bench-h1-plane-trap'
  const tmp = '/tmp/bench-h1-plane-trap'
  let result = { score: Math.min(cap, 40), reasons }
  try {
    const created = await createProfile(profile, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless'])
    if (!created.ok) result = { score: 0, reasons: [...reasons, created.detail] }
    else {
      const added = await addPlugin(profile, FIXTURE)
      if (!added.ok) result = { score: Math.min(cap, 30), reasons: [...reasons, `dsh plugin add 失败: ${added.detail}`] }
      else {
        reasons.push('dsh plugin add 成功')

        const boot = await bootHeadless(profile)
        if (NEGATIVE_SIGNAL.test(boot.output)) {
          const hit = boot.output.match(/pending \(waiting for service: [^)]+\)/)?.[0] ?? 'plugin tree failed'
          result = { score: Math.min(cap, 40), reasons: [...reasons, `冷启动失败: ${hit}（改了但还有 pending，40 分档）`] }
        } else if (HEADLESS_ACTIVATED_SIGNAL.test(boot.output)) {
          result = { score: cap, reasons: [...reasons, cap === 100
            ? '冷启动激活成功：inject llm 正确，插件树无 pending'
            : `冷启动激活成功，但静态平面门槛已触发，按 ${cap} 计`] }
        } else {
          result = { score: Math.min(cap, 40), reasons: [...reasons, `冷启动输出无法确认激活: ${boot.output.trim().slice(0, 200)}`] }
        }
      }
    }
  } finally {
    await cleanupProfile(profile, tmp)
  }
  emit(result.score, result.reasons)
}
