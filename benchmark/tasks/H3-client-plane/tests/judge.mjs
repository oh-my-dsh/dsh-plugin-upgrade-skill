// H3-client-plane 判分：浏览器插件的 dsh.client 平面契约。
//   40 分 —— package.json 补齐 alpha 要求的顶层 "dsh": {"client": {...}} 声明
//             （对象且 platform 为 "web"；声明了但 platform 缺失给 20 —— 会响亮失败）；
//   20 分 —— 容器内 dsh plugin add 成功（10）+ 宿主半边冷启动无 pending（10）；
//   40 分 —— web 冷启动后 __DSH_BOOT__.entries 出现本插件（浏览器名册真实识别）；
//    0 分 —— fixture 未改动。
// 边界（browser 面不执行）：容器内无浏览器，client.js 的运行时行为不判，
// 只判「宿主公告的启动图把它列为 entry」——这正是 A1-19 要求的验收锚点之一。
// 结果在 try/finally 之后输出 —— emit() 里的 process.exit 会跳过 finally 清理。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  addPlugin,
  bootWebAndFetchIndex,
  cleanupProfile,
  createProfile,
  dshAvailable,
  emit,
  FIXTURE_DIR,
  fixtureChanges,
  NEGATIVE_SIGNAL,
} from './judge-utils.mjs'

const TASK = 'H3-client-plane'
const PKG = '@demo/dsh-bench-paste'

main().catch((error) => emit(0, [`judge 异常: ${error.message}`]))

async function main() {
  const reasons = []

  const gate = await fixtureChanges('fixture')
  if (gate.changed !== true) {
    emit(0, [`fixture 未改动（${gate.detail}），按 0 分处理`])
  }
  reasons.push('fixture 已被 agent 修改')

  // 1. 静态：dsh.client 声明。
  let pkg
  try {
    pkg = JSON.parse(readFileSync(join(FIXTURE_DIR, 'package.json'), 'utf8'))
  } catch (error) {
    emit(0, [...reasons, `package.json 解析失败: ${error.message}`])
  }
  const clientDecl = pkg?.dsh?.client
  let score = 0
  if (clientDecl && typeof clientDecl === 'object' && clientDecl.platform === 'web') {
    score += 40
    reasons.push('package.json 含顶层 dsh.client 声明且 platform=web（+40）')
  } else if (clientDecl && typeof clientDecl === 'object') {
    score += 20
    reasons.push('package.json 有 dsh.client 但 platform 缺失/非 web（+20，boot 会响亮失败）')
  } else {
    reasons.push('package.json 仍缺顶层 dsh.client 声明（+0，浏览器名册识别不到）')
  }

  if (!(await dshAvailable())) {
    emit(score, [...reasons, 'dsh 不可用，运行时验证按未通过处理'])
  }

  // 2/3. 容器：add + web 冷启动 + boot entries。
  const profile = 'bench-h3'
  const tmp = '/tmp/bench-h3'
  try {
    const created = await createProfile(profile, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
    if (!created.ok) reasons.push(created.detail)
    else {
      const added = await addPlugin(profile, FIXTURE_DIR)
      if (!added.ok) reasons.push(`dsh plugin add 失败: ${added.detail}`)
      else {
        reasons.push('dsh plugin add 成功')
        score += 10
        reasons.push('插件安装成功（+10）')

        const boot = await bootWebAndFetchIndex(profile, PKG)
        if (NEGATIVE_SIGNAL.test(boot.output)) {
          reasons.push(`web 冷启动出现负向信号: ${boot.output.match(/pending \(waiting for service: [^)]+\)|plugin tree failed|ClientPackageCompositionError/)?.[0] ?? 'unknown'}`)
        } else {
          score += 10
          reasons.push('web 冷启动宿主半边无 pending（+10）')
        }

        if (boot.html && boot.html.includes(`${PKG}/client.js`)) {
          score += 40
          reasons.push('__DSH_BOOT__.entries 含本插件 —— 浏览器名册真实识别（+40）')
        } else if (boot.html) {
          reasons.push('__DSH_BOOT__.entries 未出现本插件 —— dsh.client 声明未被宿主识别（+0）')
        } else {
          reasons.push(`未取得启动图页面${boot.fetchError ? `: ${boot.fetchError}` : ''}（+0）`)
        }
      }
    }
  } finally {
    await cleanupProfile(profile, tmp)
  }

  emit(score, reasons)
}
