// M1-host-migration 判分：把 agent 改后的 fixture 装进隔离 profile 做真实冷启动。
//   100 —— 插件树整体激活（无 pending/plugin tree failed，且启动推进到宿主应用层）；
//    40 —— fixture 改了但仍有 pending / 插件树加载失败；
//    30 —— dsh plugin add 本身失败；
//     0 —— fixture 未改动。
// 判定思路与 validation-report-2026-08-30.md 一致：无 API key 时 headless 冷启动
// 必输出 MISSING_CREDENTIAL —— 出现该输出即证明插件树已激活、启动越过插件层。
// 注意：结果在 try/finally 之后输出 —— emit() 里的 process.exit 会跳过 finally 清理。
import { addPlugin, bootHeadless, cleanupProfile, createProfile, dshAvailable, emit, fixtureChanges, HEADLESS_ACTIVATED_SIGNAL, NEGATIVE_SIGNAL, PROFILE, FIXTURE_DIR } from './judge-utils.mjs'

const TASK = 'M1-host-migration'

main().catch((error) => emit(0, [`judge 异常: ${error.message}`]))

async function main() {
  const reasons = []

  const gate = await fixtureChanges('fixture')
  if (gate.changed !== true) {
    emit(0, [`fixture 未改动（${gate.detail}），按 0 分处理`])
  }
  reasons.push('fixture 已被 agent 修改')

  if (!(await dshAvailable())) {
    emit(0, [...reasons, '容器内 dsh 不可用，无法做运行时判定，按 0 分处理'])
  }

  const profile = PROFILE(TASK)
  const tmp = '/tmp/bench-m1-host-migration'
  let result = { score: 40, reasons }
  try {
    reasons.push(`judge 将以 /app/fixture 作为插件目录安装进隔离 profile ${profile}`)

    const created = await createProfile(profile, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless'])
    if (!created.ok) result = { score: 0, reasons: [...reasons, created.detail] }
    else {
      const added = await addPlugin(profile, FIXTURE_DIR)
      if (!added.ok) result = { score: 30, reasons: [...reasons, `dsh plugin add 失败: ${added.detail}`] }
      else {
        reasons.push('dsh plugin add 成功')

        const boot = await bootHeadless(profile)
        if (NEGATIVE_SIGNAL.test(boot.output)) {
          const hit = boot.output.match(/pending \(waiting for service: [^)]+\)/)?.[0] ?? 'plugin tree failed'
          result = { score: 40, reasons: [...reasons, `冷启动失败: ${hit}（改了但还有 pending，40 分档）`] }
        } else if (HEADLESS_ACTIVATED_SIGNAL.test(boot.output)) {
          result = { score: 100, reasons: [...reasons, '冷启动激活成功：插件树无 pending，启动推进到宿主应用层（MISSING_CREDENTIAL 属无 key 预期）'] }
        } else {
          result = { score: 40, reasons: [...reasons, `冷启动输出无法确认激活: ${boot.output.trim().slice(0, 200)}`] }
        }
      }
    }
  } finally {
    await cleanupProfile(profile, tmp)
  }
  emit(result.score, result.reasons)
}
