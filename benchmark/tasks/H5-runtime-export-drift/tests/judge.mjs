// H5-runtime-export-drift 判分：把 agent 改后的 fixture pack 成 tarball 装进隔离
// profile 做真实冷启动（禁止 link 安装——会带进 fixture 自带 node_modules 掩盖漂移）。
//   100 —— pack + add 成功，冷启动无 pending / plugin tree failed，推进到应用层，
//          且没有任何绕过宿主契约的静态问题（无旧 runtime pin / shim / 未对齐 cohort）；
//    60 —— boot 绿但迁移不完整：仍引用 settingsNamespace，或 devDeps cohort 未对齐 alpha.2；
//    40 —— add 成功但真实 boot 失败（named export / plugin tree failed / pending / 无法确认）；
//    30 —— pnpm pack 或 dsh plugin add 本身失败；
//    20 —— 通过旧版 dsh-settings runtime pin 或自制 settingsNamespace shim 绕过（boot 绿也封顶）；
//     0 —— fixture 未改动，或宿主被降级/篡改（dsh 版本、全局 dsh-settings 导出面）。
// 注意：结果在 try/finally 之后输出 —— emit() 里的 process.exit 会跳过 finally 清理。
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { addPlugin, bootHeadless, cleanupProfile, createProfile, emit, fixtureChanges, HEADLESS_ACTIVATED_SIGNAL, NEGATIVE_SIGNAL, PROFILE, FIXTURE_DIR, localExec } from './judge-utils.mjs'

const TASK = 'H5-runtime-export-drift'
const SETTINGS_PKG = '@deepseek-ai/dsh-settings'

// 语句锚定的静态检测：只匹配真实的 import / export / 声明语句。注释行以 `//`
// 开头，无法命中 `^\s*import` / `^\s*export` 锚点——fixture 的诱导注释按此设计，
// 且不依赖"dist 无注释"假设（tsc 输出保留注释，已实测）。
const IMPORT_RESIDUAL_RE = /^\s*import\s*\{[\s\S]*?\bsettingsNamespace\b[\s\S]*?\}\s*from\s*['"]@deepseek-ai\/dsh-settings['"]/m
const SHIM_FN_RE = /^\s*(?:export\s+)?(?:async\s+)?function\s+settingsNamespace\s*\(/m
const SHIM_VAR_RE = /^\s*(?:export\s+)?(?:const|let|var)\s+settingsNamespace\b/m
const SHIM_REEXPORT_RE = /^\s*export\s*\{[^}]*\bsettingsNamespace\b[^}]*\}/m
const OLD_COHORT_RE = /0\.1\.[01]/

main().catch((error) => emit(0, [`judge 异常: ${error.message}`]))

async function main() {
  const reasons = []

  const host = await checkHostIntegrity()
  if (!host.ok) {
    emit(0, [`宿主完整性失败: ${host.detail}`])
  }
  reasons.push('宿主完整性 OK：全局 dsh 0.1.2-alpha.2，dsh-settings 导出面无 settingsNamespace')

  const gate = await fixtureChanges('fixture')
  if (gate.changed !== true) {
    emit(0, [`fixture 未改动（${gate.detail}），按 0 分处理`])
  }
  reasons.push('fixture 已被 agent 修改')

  const stat = staticChecks()
  reasons.push(...stat.reasons)

  const profile = PROFILE(TASK)
  const packDir = '/tmp/h5-pack'
  let result = { score: 40, reasons: [...reasons] }
  try {
    reasons.push(`judge 将 pack /app/fixture 并以 tarball 安装进隔离 profile ${profile}（link 安装会掩盖漂移，禁用）`)

    const packed = await packFixture(packDir)
    if (!packed.ok) result = { score: 30, reasons: [...reasons, `pnpm pack 失败: ${packed.detail}`] }
    else {
      reasons.push('pnpm pack 成功')
      const created = await createProfile(profile, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless'])
      if (!created.ok) result = { score: 0, reasons: [...reasons, created.detail] }
      else {
        const added = await addPlugin(profile, packed.tarball)
        if (!added.ok) result = { score: 30, reasons: [...reasons, `dsh plugin add 失败: ${added.detail}`] }
        else {
          reasons.push('dsh plugin add（tarball）成功')
          const boot = await bootHeadless(profile)
          if (NEGATIVE_SIGNAL.test(boot.output)) {
            const hit = /does not provide an export named '[^']+'/.exec(boot.output)?.[0]
              ?? boot.output.match(/pending \(waiting for service: [^)]+\)/)?.[0]
              ?? 'plugin tree failed'
            result = { score: 40, reasons: [...reasons, `冷启动失败: ${hit}（40 分档）`] }
          } else if (HEADLESS_ACTIVATED_SIGNAL.test(boot.output)) {
            result = { score: 100, reasons: [...reasons, '冷启动激活成功：无 pending、无 plugin tree failed，启动推进到宿主应用层（MISSING_CREDENTIAL 属无 key 预期）'] }
          } else {
            result = { score: 40, reasons: [...reasons, `冷启动输出无法确认激活: ${boot.output.trim().slice(0, 200)}`] }
          }
        }
      }
    }
  } finally {
    await cleanupProfile(profile, packDir)
  }

  let score = result.score
  const finalReasons = result.reasons
  if (stat.pin) {
    score = Math.min(score, 20)
    finalReasons.push(`旧 runtime pin 检测命中（${stat.pin}）—— 把旧 @deepseek-ai/dsh-settings 带进 runtime 绕过宿主契约，封顶 20`)
  }
  if (stat.shim) {
    score = Math.min(score, 20)
    finalReasons.push(`settingsNamespace shim 检测命中（${stat.shim}）—— 自制兼容 shim 绕过宿主契约，封顶 20`)
  }
  if (score === 100 && stat.residualImport) {
    score = Math.min(score, 60)
    finalReasons.push(`仍存在对 settingsNamespace 的 named import（${stat.residualImport}）—— 迁移不完整，封顶 60`)
  }
  if (score === 100 && stat.cohortOld) {
    score = Math.min(score, 60)
    finalReasons.push(`开发 dependency cohort 未对齐 alpha.2（${stat.cohortOld}）—— 本地类型面仍停留在旧线，封顶 60`)
  }
  emit(score, finalReasons)
}

// 宿主完整性：dsh 版本必须仍是 alpha.2；全局 @deepseek-ai/dsh-settings 的
// 运行时导出面不得被改回 settingsNamespace。global root 通过 `npm root -g`
// 确定，probe 在全局 dsh 包目录内解析——不会解析到 fixture 自己的 node_modules。
async function checkHostIntegrity() {
  const ver = await localExec('dsh --version', { timeout: 15000 })
  if (ver.code !== 0 || !(ver.stdout || '').includes('0.1.2-alpha.2')) {
    return { ok: false, detail: `dsh --version 异常（${(ver.stdout + ver.stderr).trim().slice(0, 160) || '无输出'}），宿主可能被降级` }
  }
  const rootRes = await localExec('npm root -g', { timeout: 15000 })
  const gRoot = (rootRes.stdout || '').trim()
  if (!gRoot) return { ok: true }
  const probe = await localExec(`cd '${gRoot}/@deepseek-ai/dsh' && node --input-type=module -e "import('@deepseek-ai/dsh-settings').then((m) => process.stdout.write(Object.keys(m).sort().join(','))).catch((e) => { process.stderr.write('RESOLVE_FAIL'); process.exit(3) })"`, { timeout: 30000 })
  if (probe.code !== 0) return { ok: true }
  const keys = (probe.stdout || '').split(',').filter(Boolean)
  if (keys.includes('settingsNamespace')) {
    return { ok: false, detail: '全局 @deepseek-ai/dsh-settings 出现 settingsNamespace 导出 —— DSH core 被篡改或宿主被降级' }
  }
  return { ok: true }
}

// package.json 用 JSON.parse 解析（不做文本 regex），覆盖所有能把旧
// @deepseek-ai/dsh-settings 带进 runtime 的常见入口；源码/产物扫描只跑
// 语句锚定正则。
function staticChecks() {
  const reasons = []
  let pin = null
  let shim = null
  let residualImport = null
  let cohortOld = null

  let pkg = null
  try {
    pkg = JSON.parse(readFileSync(join(FIXTURE_DIR, 'package.json'), 'utf8'))
  } catch (error) {
    reasons.push(`package.json 解析失败: ${error.message}`)
  }
  if (pkg) {
    const depFields = ['dependencies', 'optionalDependencies', 'peerDependencies', 'overrides']
    const entries = []
    for (const field of depFields) {
      if (pkg[field] && typeof pkg[field] === 'object') entries.push([field, pkg[field]])
    }
    if (pkg.pnpm && typeof pkg.pnpm === 'object' && pkg.pnpm.overrides && typeof pkg.pnpm.overrides === 'object') {
      entries.push(['pnpm.overrides', pkg.pnpm.overrides])
    }
    for (const [field, obj] of entries) {
      const spec = obj[SETTINGS_PKG]
      if (typeof spec === 'string' && OLD_COHORT_RE.test(spec)) {
        pin = `${field} 中 ${SETTINGS_PKG}: ${spec}`
        reasons.push(`旧 runtime pin 命中: ${pin}`)
      }
    }
    const dev = pkg.devDependencies && typeof pkg.devDependencies === 'object' ? pkg.devDependencies : {}
    const devSpec = dev[SETTINGS_PKG]
    if (typeof devSpec === 'string' && OLD_COHORT_RE.test(devSpec)) {
      cohortOld = `devDependencies 中 ${SETTINGS_PKG}: ${devSpec}`
      reasons.push(`开发 cohort 未对齐: ${cohortOld}（仍在旧线）`)
    } else if (typeof devSpec !== 'string') {
      cohortOld = 'devDependencies 中缺失 @deepseek-ai/dsh-settings'
      reasons.push(`开发 cohort 未对齐: ${cohortOld}（ctx.settings 类型增强来源缺失）`)
    } else {
      reasons.push(`开发 cohort 已对齐 alpha.2: ${SETTINGS_PKG}: ${devSpec}`)
    }
  }

  for (const file of walkSource(FIXTURE_DIR)) {
    const text = readFileSync(file, 'utf8')
    if (IMPORT_RESIDUAL_RE.test(text)) residualImport = file.replace(`${FIXTURE_DIR}/`, '')
    if (SHIM_FN_RE.test(text) || SHIM_VAR_RE.test(text) || SHIM_REEXPORT_RE.test(text)) shim = file.replace(`${FIXTURE_DIR}/`, '')
  }

  return { pin, shim, residualImport, cohortOld, reasons }
}

function walkSource(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walkSource(full, out)
    else if (/\.(js|mjs|ts)$/.test(entry)) out.push(full)
  }
  return out
}

async function packFixture(packDir) {
  await localExec(`rm -rf '${packDir}' && mkdir -p '${packDir}'`)
  const res = await localExec(`cd '${FIXTURE_DIR}' && pnpm pack --pack-destination '${packDir}'`, { timeout: 120000 })
  if (res.code !== 0) return { ok: false, detail: (res.stdout + res.stderr).trim().slice(-300) }
  const tgzs = readdirSync(packDir).filter((name) => name.endsWith('.tgz'))
  if (tgzs.length !== 1) return { ok: false, detail: `pack 产物数量异常: ${tgzs.length}` }
  return { ok: true, tarball: join(packDir, tgzs[0]) }
}
