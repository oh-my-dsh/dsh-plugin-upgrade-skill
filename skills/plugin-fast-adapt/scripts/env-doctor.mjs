#!/usr/bin/env node
// env-doctor.mjs —— 第 1 步：探测本机 DSH 环境。
//
// 只读，不写任何东西。回答三个问题：
//   1. 本机装的 DSH 是什么版本？（全局 + 各 profile）
//   2. profiles 覆盖层里有没有和主安装脱节的包？（issue #263 那一类）
//   3. 当前有哪些插件，它们的 peer 声明覆盖哪个版本窗口？
//
// 输出 JSON，供后续步骤和人不读散文也能用。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { printJson, isDshPackage, packageBase, parseVersion, compareVersions, peerFloor, maskSource, CODE } from './lib/scanner.mjs'

const HOME = os.homedir()
const DSH_DIR = path.join(HOME, '.dsh')

// ── 全局安装发现（不写死单一路径） ─────────────────────────────────────────

function candidateGlobalRoots() {
  const roots = []
  try {
    const npmRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
    if (npmRoot) roots.push(npmRoot)
  } catch {}
  roots.push(path.join(HOME, '.local', 'lib', 'node_modules'))
  roots.push('/usr/local/lib/node_modules')
  roots.push('/opt/homebrew/lib/node_modules')
  try {
    const nvmDir = process.env.NVM_DIR || path.join(HOME, '.nvm')
    const versions = path.join(nvmDir, 'versions', 'node')
    if (fs.existsSync(versions)) {
      for (const v of fs.readdirSync(versions)) {
        roots.push(path.join(versions, v, 'lib', 'node_modules'))
      }
    }
  } catch {}
  return [...new Set(roots.filter(Boolean))]
}

function readPackageJson(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  } catch {
    return null
  }
}

function findGlobalDsh() {
  for (const root of candidateGlobalRoots()) {
    const pkg = readPackageJson(path.join(root, '@deepseek-ai', 'dsh'))
    if (pkg?.version) {
      return { version: pkg.version, location: path.join(root, '@deepseek-ai', 'dsh'), source: 'node_modules' }
    }
  }
  try {
    const out = execFileSync('dsh', ['--version'], { encoding: 'utf8' }).trim()
    const m = out.match(/(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/)
    if (m) return { version: m[1], location: null, source: 'dsh --version' }
  } catch {}
  return null
}

// ── profiles 覆盖层 ────────────────────────────────────────────────────────

function listProfiles() {
  const dir = path.join(DSH_DIR, 'profiles')
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    // profiles/ 下会混进 node_modules 之类的目录，不是 profile
    .filter((name) => !name.startsWith('.') && name !== 'node_modules')
}

function scanOverlay(profile, globalVersion) {
  const nodeModules = path.join(DSH_DIR, 'profiles', profile, 'node_modules', '@deepseek-ai')
  if (!fs.existsSync(nodeModules)) return []

  const packages = []
  for (const name of fs.readdirSync(nodeModules)) {
    const pkg = readPackageJson(path.join(nodeModules, name))
    if (!pkg?.version) continue
    packages.push({ name: `@deepseek-ai/${name}`, version: pkg.version, dir: path.join(nodeModules, name) })
  }

  const globalPkgDir = path.join(DSH_DIR, 'profiles', profile, 'node_modules', '@deepseek-ai')
  const findings = []
  for (const pkg of packages) {
    const reasons = []
    let severity = null

    if (RETIRED_PACKAGES.has(pkg.name)) {
      reasons.push('上游宿主已移除该包，留在覆盖层会导致运行时装载冲突')
      severity = 'critical'
    }

    const globalSibling = findGlobalPackageVersion(pkg.name)
    if (globalSibling && compareVersions(pkg.version, globalSibling) !== 0) {
      reasons.push(`覆盖层版本 (${pkg.version}) 与全局宿主所带版本 (${globalSibling}) 不一致，优先解析会引发接口破坏`)
      severity = 'critical'
    }

    if (globalVersion) {
      const shortBase = pkg.name.replace('@deepseek-ai/', '')
      if (DSH_SUITE_PACKAGES.has(shortBase) || pkg.name === '@deepseek-ai/dsh') {
        const pv = parseVersion(pkg.version)
        const gv = parseVersion(globalVersion)
        if (pv.major !== gv.major || pv.minor !== gv.minor) {
          reasons.push(`DSH 套件子包版本 (${pkg.version}) 与全局宿主版本 (${globalVersion}) 跨 minor 脱节`)
          severity = severity || 'high'
        }
      }
    }

    if (reasons.length) {
      findings.push({ profile, package: pkg.name, version: pkg.version, severity, reasons, path: pkg.dir })
    }
  }

  // 全局同名包查询走缓存，避免重复遍历
  void globalPkgDir
  return findings
}

// 上游已移除、不该再出现在覆盖层的包
const RETIRED_PACKAGES = new Set([
  '@deepseek-ai/dsh-client-runtime',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/dsh-report',
])

// 版本号跟随宿主走的套件子包（用于识别跨 minor 脱节）
const DSH_SUITE_PACKAGES = new Set([
  'dsh-tools', 'dsh-invariants', 'dsh-session', 'dsh-client-ui-primitives',
  'dsh-user-questions', 'dsh-schedule', 'dsh-attachments', 'dsh-subagent-claude-code',
  'dsh-subagent-codex', 'dsh-experimental-code-runtime-python',
])

let globalPackageCache = null
function findGlobalPackageVersion(name) {
  if (!globalPackageCache) {
    globalPackageCache = new Map()
    for (const root of candidateGlobalRoots()) {
      const dir = path.join(root, '@deepseek-ai')
      if (!fs.existsSync(dir)) continue
      for (const sub of fs.readdirSync(dir)) {
        const pkg = readPackageJson(path.join(dir, sub))
        if (pkg?.version) globalPackageCache.set(`@deepseek-ai/${sub}`, pkg.version)
      }
    }
  }
  return globalPackageCache.get(name)
}

// ── 已装插件清单 ───────────────────────────────────────────────────────────

function listInstalledPlugins() {
  const plugins = []
  for (const profile of listProfiles()) {
    const patchFile = path.join(DSH_DIR, 'profiles', profile, 'cordis.patch.yml')
    const patchEntries = []
    if (fs.existsSync(patchFile)) {
      const text = fs.readFileSync(patchFile, 'utf8')
      for (const m of text.matchAll(/^\s*-\s*insert:\s*(.+)$/gm)) {
        patchEntries.push(m[1].trim())
      }
    }
    plugins.push({ profile, patchFile, patchEntries })
  }
  return plugins
}

// ── 插件启用就绪度（防「装了但没生效」） ──────────────────────────────────
// 三件事：构建产物在不在、各 profile 有没有挂载、声明的 inject 服务
// 在 profile 里有没有提供方特征。最后一条是 Cordis 的静默陷阱：
// 强 inject 一个不存在的服务，插件不报错，只是永远 pending。

export function extractInjects(root, entryFile) {
  const candidates = [entryFile, 'src/index.ts', 'src/index.js', 'src/index.mjs'].map((f) => path.join(root, f))
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue
    const text = fs.readFileSync(file, 'utf8')
    const mask = maskSource(text)
    // 只认代码区的 inject 声明；注释里的不算
    for (const m of text.matchAll(/inject\s*=\s*\[([^\]]*)\]/g)) {
      if (mask[m.index] !== CODE) continue
      const list = m[1].split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean)
      if (list.length) return list
    }
  }
  return []
}

// profile 里常见宿主服务的文本特征。这是特征级推断，不是服务解析器：
// 报「有风险」让人去确认，不报「一定挂」。
const SERVICE_SIGNATURES = [
  { name: 'sessionQuery', pattern: /dsh-session-query/ },
  { name: 'llm', pattern: /dsh-llm/ },
  { name: 'tools', pattern: /dsh-tool|\btools\b/ },
  { name: 'webServer', pattern: /web|server/ },
]

export function diagnoseActivation(targetDir, installedPlugins) {
  const root = path.resolve(targetDir)
  const pkg = readPackageJson(targetDir)
  if (!pkg) return { checked: false, reason: '目标目录没有 package.json' }

  const main = pkg.main || 'lib/index.js'
  const entryReady = fs.existsSync(path.join(root, main))
  const injects = extractInjects(root, main)

  const perProfile = installedPlugins.map(({ profile, patchFile, patchEntries }) => {
    let disabled = false
    try {
      const text = fs.readFileSync(patchFile, 'utf8')
      const nameEsc = pkg.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      disabled = new RegExp(`name:\\s*['"]?${nameEsc}['"]?[\\s\\S]*?disabled:\\s*true`).test(text)
    } catch {}
    const registered = patchEntries.some((e) => e.includes(pkg.name))
    return { profile, registered, disabled }
  })

  const pendingRisks = []
  if (injects.length && perProfile.some((p) => p.registered && !p.disabled)) {
    for (const { profile, registered, disabled } of perProfile) {
      if (!registered || disabled) continue
      let patchText = ''
      try {
        patchText = fs.readFileSync(path.join(DSH_DIR, 'profiles', profile, 'cordis.patch.yml'), 'utf8')
      } catch {}
      const available = SERVICE_SIGNATURES.filter((s) => s.pattern.test(patchText)).map((s) => s.name)
      for (const inj of injects) {
        const known = SERVICE_SIGNATURES.find((s) => s.name === inj)
        if (known && !available.includes(inj)) {
          pendingRisks.push({
            profile,
            service: inj,
            reason: `插件声明强制注入 "${inj}"，但该 profile 的组合里没有它的提供方特征`,
            solution: `确认宿主确实提供该服务，或改用弱依赖 ctx.get('${inj}') 探测降级`,
          })
        }
      }
    }
  }

  let verdict = 'OK'
  if (!entryReady) verdict = 'ERROR'
  else if (pendingRisks.length || perProfile.every((p) => !p.registered)) verdict = 'WARN'

  return {
    checked: true,
    package: pkg.name,
    entry: { file: main, ready: entryReady },
    injects,
    perProfile,
    pendingRisks,
    verdict,
  }
}

// ── 主流程 ──────────────────────────────────────────────────────────────────

export function probeEnvironment(targetDir = process.cwd()) {
  const globalDsh = findGlobalDsh()
  const profiles = listProfiles()
  const overlay = []
  for (const profile of profiles) {
    overlay.push(...scanOverlay(profile, globalDsh?.version))
  }

  const installedPlugins = listInstalledPlugins()

  const running = []
  try {
    const ps = execFileSync('ps', ['-eo', 'pid,etime,command'], { encoding: 'utf8' })
    for (const line of ps.split('\n')) {
      if (/\bdsh\b/.test(line) && /web|desktop|serve/.test(line) && !/ps -eo/.test(line)) {
        const [pid, etime, ...rest] = line.trim().split(/\s+/)
        running.push({ pid, elapsed: etime, command: rest.join(' ') })
      }
    }
  } catch {}

  // 目标插件自身的信息
  const pluginPkg = readPackageJson(targetDir)
  const peers = pluginPkg?.peerDependencies || {}
  const peerWindows = Object.entries(peers)
    .filter(([name]) => isDshPackage(name))
    .map(([name, range]) => ({ package: name, range, floor: peerFloor(range) }))

  const activation = diagnoseActivation(targetDir, installedPlugins)

  return {
    timestamp: new Date().toISOString(),
    globalDsh,
    profiles,
    overlayFindings: overlay,
    runningProcesses: running,
    installedPlugins,
    activation,
    target: {
      dir: path.resolve(targetDir),
      package: pluginPkg?.name || null,
      version: pluginPkg?.version || null,
      peerWindows,
    },
    home: HOME,
    dshDir: DSH_DIR,
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const target = process.argv[2] || process.cwd()
  const report = probeEnvironment(target)
  printJson(report)

  const overlayCount = report.overlayFindings.length
  process.stderr.write(
    `\n全局 DSH: ${report.globalDsh?.version || '未检测到'} (${report.globalDsh?.source || 'n/a'})\n` +
    `profiles: ${report.profiles.join(', ') || '无'}\n` +
    `覆盖层问题: ${overlayCount} 处\n` +
    `运行中宿主进程: ${report.runningProcesses.length} 个\n` +
    (report.activation?.checked
      ? `目标插件启用就绪: ${report.activation.verdict}${report.activation.pendingRisks.length ? `（Silent Pending 风险 ${report.activation.pendingRisks.length} 处）` : ''}\n`
      : '')
  )
}
