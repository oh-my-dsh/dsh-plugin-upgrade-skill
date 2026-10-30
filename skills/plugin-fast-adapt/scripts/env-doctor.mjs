#!/usr/bin/env node
// env-doctor.mjs —— 第 1 步：探测本机 DSH 环境。
//
// 只读，不写任何东西。回答四个问题：
//   1. 本机装的 DSH 是什么版本？（全局 + 各 profile）
//   2. profiles 覆盖层里有没有和主安装脱节的包？（issue #263 那一类）
//   3. 共享 node_modules 农场（profiles/node_modules）有没有悬空软链？
//   4. 当前有哪些插件，它们的 peer 声明覆盖哪个版本窗口？
//
// 输出 JSON，供后续步骤和人不读散文也能用。
//
// 两层 patch 都要看：各 profile 自己的 cordis.patch.yml，以及全局
// ~/.dsh/cordis.patch.yml（dump-config 显示它拼在每个 profile 的最后一层，
// 旧实现只读前者会把它整个漏掉）。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { printJson, isDshPackage, isPluginForm, packageBase, parseVersion, compareVersions, peerFloor, maskSource, CODE } from './lib/scanner.mjs'
import { diagnoseClientHalf, isDeliberateRosterInsert } from './lib/client-graph.mjs'

const HOME = os.homedir()
// DSH 目录：默认 ~/.dsh。DSH_PFA_DSH_HOME 可覆盖（自检与容器场景用；
// 不设时行为与旧版完全一致）。写成函数而不是常量：调用时求值，
// 自检才能在每个用例里改指向临时 DSH 树。
function dshDir() {
  return process.env.DSH_PFA_DSH_HOME || path.join(HOME, '.dsh')
}

// ── 全局安装发现（不写死单一路径） ─────────────────────────────────────────

// 全局 node_modules 候选根。spawn 一次 npm root -g 要 60-120ms，旧实现每次
// 探测都 spawn（一个进程里跑两遍），是 env-doctor 的主要耗时。这里静态路径
// 零成本先行，全都探不到 @deepseek-ai 目录时才问 npm 兜底（自定义 prefix、
// volta、asdf 一类安装位），结果缓存供整个进程复用。
// Windows 下 npm/dsh 是 .cmd 批处理，spawn 必须走 shell 才找得到（Node 官方
// 文档：.bat/.cmd 需 shell 选项）；POSIX 保持 shell:false 不变。
const SPAWN_SHELL = process.platform === 'win32' ? true : false

let globalRootsCache = null

// platform/env 可注入，供自检做 Windows 模拟；带注入的调用不写缓存，
// 模拟结果不会污染本进程后续的真实探测。
export function candidateGlobalRoots({ platform = process.platform, env = process.env } = {}) {
  const simulated = platform !== process.platform || env !== process.env
  if (globalRootsCache && !simulated) return globalRootsCache
  const roots = [
    path.join(HOME, '.local', 'lib', 'node_modules'),
    '/usr/local/lib/node_modules',
    '/opt/homebrew/lib/node_modules',
  ]
  // Windows npm 默认前缀是 %APPDATA%\npm，node_modules 在其下；
  // 先探这里可以免掉一次 npm spawn
  if (platform === 'win32' && env.APPDATA) {
    roots.push(path.join(env.APPDATA, 'npm', 'node_modules'))
  }
  try {
    const nvmDir = env.NVM_DIR || path.join(HOME, '.nvm')
    const versions = path.join(nvmDir, 'versions', 'node')
    if (fs.existsSync(versions)) {
      for (const v of fs.readdirSync(versions)) {
        roots.push(path.join(versions, v, 'lib', 'node_modules'))
      }
    }
  } catch {}
  if (!roots.some((r) => fs.existsSync(path.join(r, '@deepseek-ai')))) {
    try {
      const npmRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', shell: SPAWN_SHELL }).trim()
      if (npmRoot) roots.push(npmRoot)
    } catch {}
  }
  const result = [...new Set(roots.filter(Boolean))]
  if (!simulated) globalRootsCache = result
  return result
}

function readPackageJson(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  } catch {
    return null
  }
}

// 导出供 code-scan 的宿主实测核查复用：guide 是二手语义，
// 目标宿主的 node_modules 是一手事实——包到底还在不在，stat 一次就知道。
export function findGlobalDsh() {
  for (const root of candidateGlobalRoots()) {
    const pkg = readPackageJson(path.join(root, '@deepseek-ai', 'dsh'))
    if (pkg?.version) {
      return { version: pkg.version, location: path.join(root, '@deepseek-ai', 'dsh'), source: 'node_modules' }
    }
  }
  try {
    const out = execFileSync('dsh', ['--version'], { encoding: 'utf8', shell: SPAWN_SHELL }).trim()
    const m = out.match(/(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/)
    if (m) return { version: m[1], location: null, source: 'dsh --version' }
  } catch {}
  return null
}

// ── profiles 覆盖层 ────────────────────────────────────────────────────────

function listProfiles() {
  const dir = path.join(dshDir(), 'profiles')
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    // profiles/ 下会混进 node_modules 之类的目录，不是 profile
    .filter((name) => !name.startsWith('.') && name !== 'node_modules')
}

function scanOverlay(profile, globalVersion) {
  const nodeModules = path.join(dshDir(), 'profiles', profile, 'node_modules', '@deepseek-ai')
  if (!fs.existsSync(nodeModules)) return []

  const packages = []
  for (const name of fs.readdirSync(nodeModules)) {
    const pkg = readPackageJson(path.join(nodeModules, name))
    if (!pkg?.version) continue
    packages.push({ name: `@deepseek-ai/${name}`, version: pkg.version, dir: path.join(nodeModules, name) })
  }

  const findings = []
  let overlayText = ''
  try {
    overlayText = fs.readFileSync(path.join(dshDir(), 'profiles', profile, 'cordis.patch.yml'), 'utf8')
  } catch {}
  for (const pkg of packages) {
    const reasons = []
    let severity = null

    if (RETIRED_PACKAGES.has(pkg.name)) {
      if (overlayText && isDeliberateRosterInsert(overlayText, pkg.name)) {
        // 2026-10-25 实录：web 端 client-runtime 垫片被 overlay 显式补挂
        // （- insert 行），是有意保留的兼容层不是意外残留，误报 critical
        // 会引导人拆掉还在供旧插件 require 的垫片。
        reasons.push('上游宿主已移除该包，但 overlay 有显式补挂行（兼容垫片，有意保留）；确认全部消费方改净后可移除')
        severity = 'info'
      } else {
        reasons.push('上游宿主已移除该包，留在覆盖层会导致运行时装载冲突')
        severity = 'critical'
      }
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

// ── 共享 node_modules 农场（悬空软链） ───────────────────────────────────────
// ~/.dsh/profiles/node_modules 是指向宿主安装的软链农场（本机 250 个
// @deepseek-ai/* 加 react-dom/express 等传递依赖）。宿主升级后包被移除，
// 软链留在原地变成悬空链接：任何 require 它的插件都以 ERR_MODULE_NOT_FOUND
// 收场（2026-10-26 实测 209 条断链，宿主启动日志里 client-runtime /
// orca-agent-hooks 两行装载失败）。
//
// 它不在各 profile 的覆盖层目录里，旧实现只扫 profiles/<name>/node_modules，
// 这一层完全看不见（overlayFindings 报 0）。单独成节而不是塞进 overlayFindings：
// 两者字段语义不同——这里没有 profile、没有版本，只有软链目标，而且
// 「修」的动作也不是把包移走，是清掉悬空链接本身。

export function scanSharedFarm({ farmDir = null, hostRoots = null } = {}) {
  const dir = farmDir ?? path.join(dshDir(), 'profiles', 'node_modules')
  const roots = hostRoots ?? candidateGlobalRoots()
  // 宿主安装树下的软链才是「宿主升级后包被移除」那一类；指向别处的
  // 断链（如某个包自己的嵌套 node_modules）同样有害，但性质不同，分开标注。
  const hostPrefixes = roots.map((r) => path.join(r, '@deepseek-ai'))
  const result = { farmDir: dir, symlinkCount: 0, brokenCount: 0, hostBackedBroken: 0, findings: [] }
  if (!fs.existsSync(dir)) return result

  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return result
  }

  const links = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    if (entry.name.startsWith('@')) {
      let subs = []
      try {
        subs = fs.readdirSync(path.join(dir, entry.name), { withFileTypes: true })
      } catch {
        continue
      }
      for (const sub of subs) {
        if (sub.name.startsWith('.')) continue
        links.push({ name: `${entry.name}/${sub.name}`, linkPath: path.join(dir, entry.name, sub.name) })
      }
      continue
    }
    links.push({ name: entry.name, linkPath: path.join(dir, entry.name) })
  }

  for (const { name, linkPath } of links) {
    let stat
    try {
      stat = fs.lstatSync(linkPath)
    } catch {
      continue
    }
    if (!stat.isSymbolicLink()) continue
    result.symlinkCount++
    let raw = null
    try {
      raw = fs.readlinkSync(linkPath)
    } catch {
      continue
    }
    const target = path.isAbsolute(raw) ? raw : path.resolve(path.dirname(linkPath), raw)
    if (fs.existsSync(target)) continue
    const hostBacked = hostPrefixes.some((prefix) => target === prefix || target.startsWith(prefix + path.sep))
    result.brokenCount++
    if (hostBacked) result.hostBackedBroken++
    result.findings.push({
      package: name,
      target,
      hostBacked,
      severity: hostBacked ? 'critical' : 'info',
      reasons: hostBacked
        ? `软链指向宿主安装树下的 ${name}，该位置已不存在（宿主升级后包被移除）；消费它的插件会以 ERR_MODULE_NOT_FOUND 失败`
        : `软链目标已不存在（${target}）；不属宿主安装树，但消费方仍会失败`,
      path: linkPath,
    })
  }

  return result
}

// ── 已装插件清单 ───────────────────────────────────────────────────────────

// 解析 patch 层条目。多行 YAML 是常态（- insert: / - id: 换行后才是 name），
// 单行正则会把活跃插件整个漏掉——实测 web profile 的 wide-research 条目
// name 在 - id: 的下一行，argo-dsh 被误判成「未挂载」。
// 注释掉的条目不算挂载；只看条目头部，深层 config.name 是模型名不是插件名。
export function parsePatchEntries(text) {
  const entries = []
  for (const block of text.split(/(?=^\s*-\s)/m)) {
    const live = block.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n')
    if (!/^\s*-\s/.test(live)) continue
    const header = live.split('\n').slice(0, 5).join('\n')
    const name = header.match(/name:\s*['"]?([\w@/.-]+)['"]?/)
    const id = header.match(/id:\s*['"]?([\w@/.-]+)['"]?/)
    const inlineInsert = header.match(/^\s*-\s*insert:\s*(\S+)/m)
    const parts = [...new Set([name?.[1], id?.[1], inlineInsert?.[1]].filter(Boolean))]
    if (parts.length) entries.push(`- ${parts.join(' ')}`)
  }
  return entries
}

// 全局 patch 层：~/.dsh/cordis.patch.yml。dump-config 显示它拼在每个 profile
// 的最后一层（本机由 Orca 写入 orca-agent-hooks 行），对所有 profile 生效。
// 只读各 profile 自己的 patch 层会把它整个漏掉——该行引用的包没装，
// 每次启动都报 "1 entry did not activate"，工具却报 0 处（2026-10-26 实测）。
function readGlobalPatchLayer() {
  const file = path.join(dshDir(), 'cordis.patch.yml')
  if (!fs.existsSync(file)) return { file: null, entries: [], text: '' }
  try {
    const text = fs.readFileSync(file, 'utf8')
    return { file, entries: parsePatchEntries(text), text }
  } catch {
    return { file, entries: [], text: '' }
  }
}

export function listInstalledPlugins() {
  const global = readGlobalPatchLayer()
  const plugins = []
  for (const profile of listProfiles()) {
    const patchFile = path.join(dshDir(), 'profiles', profile, 'cordis.patch.yml')
    const patchEntries = []
    if (fs.existsSync(patchFile)) {
      patchEntries.push(...parsePatchEntries(fs.readFileSync(patchFile, 'utf8')))
    }
    plugins.push({
      profile,
      patchFile,
      globalPatchFile: global.file,
      globalPatchEntries: global.entries,
      // 全局层对所有 profile 生效，合并进来后 registered 判定才与宿主实际一致
      patchEntries: [...global.entries, ...patchEntries],
    })
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

const stripDotSlash = (p) => String(p).replace(/^\.\//, '')

// 入口解析：Node 的解析顺序是 exports['.'] 优先于 main，两者都没有才退 lib/index.js。
// 旧实现只看 main，遇到「无 main、入口写在 exports」的包会误报 ERROR——
// 实测 @local/dsh-env-sweeper（exports['.'] = './index.js'，日志每天在写）
// 被报成「入口产物不存在」，把人引导去修没坏的东西。
export function resolveEntryFile(pkg) {
  const exportsField = pkg.exports
  if (typeof exportsField === 'string' && exportsField) return stripDotSlash(exportsField)
  if (exportsField && typeof exportsField === 'object') {
    const root = exportsField['.']
    if (typeof root === 'string' && root) return stripDotSlash(root)
    if (root && typeof root === 'object') {
      const picked = root.default ?? root.import ?? root.require ?? root.node
      if (typeof picked === 'string' && picked) return stripDotSlash(picked)
    }
  }
  if (typeof pkg.main === 'string' && pkg.main) return stripDotSlash(pkg.main)
  return 'lib/index.js'
}

// 声明入口存在就用它；不存在则退回 main 再退 lib/index.js（exports 只写了
// types 子路径时，真实文件可能仍挂在 main 上）。
function pickExistingEntry(root, pkg, declaredEntry) {
  const candidates = [declaredEntry, typeof pkg.main === 'string' ? pkg.main : null, 'lib/index.js']
    .filter(Boolean)
    .map(stripDotSlash)
  return candidates.find((f) => fs.existsSync(path.join(root, f))) ?? candidates[0]
}

// disabled 判定限定在同一个条目块内：按列表项「- 」为界切块，
// 防止本插件条目被后面其他插件条目的 disabled: true 跨条目误伤
// （误伤会跳过 Silent Pending 风险检查，把该报的吞掉）。
function isDisabledInPatch(text, pkgName) {
  if (!text) return false
  const nameEsc = pkgName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const nameRe = new RegExp(`name:\\s*['"]?${nameEsc}['"]?`)
  return text
    .split(/(?=^\s*-\s)/m)
    .some((block) => nameRe.test(block) && /disabled:\s*true/.test(block))
}

export function diagnoseActivation(targetDir, installedPlugins) {
  const root = path.resolve(targetDir)
  const pkg = readPackageJson(targetDir)
  if (!pkg) return { checked: false, reason: '目标目录没有 package.json' }

  // 形态错配守卫：非插件目标（无生态依赖、无 dsh.client 的纯工具仓）不适用
  // 启用就绪检查——按插件规则跑会把「无 main 入口」误报成 ERROR
  // （2026-10-25 自审实录）。记 N/A 而不是 ERROR，索引里可区分。
  if (!isPluginForm(pkg)) {
    return { checked: false, verdict: 'N/A', reason: '目标不是 DSH 插件形态（无 @deepseek-ai/* 依赖、无 dsh.client），启用就绪检查不适用' }
  }

  const declaredEntry = resolveEntryFile(pkg)
  const entryFile = pickExistingEntry(root, pkg, declaredEntry)
  const entryReady = fs.existsSync(path.join(root, entryFile))
  const injects = extractInjects(root, entryFile)

  const perProfile = installedPlugins.map(({ profile, patchFile, patchEntries, globalPatchFile }) => {
    const texts = [patchFile, globalPatchFile]
      .filter(Boolean)
      .map((f) => {
        try {
          return fs.readFileSync(f, 'utf8')
        } catch {
          return ''
        }
      })
    const disabled = texts.some((text) => isDisabledInPatch(text, pkg.name))
    const registered = patchEntries.some((e) => e.includes(pkg.name))
    return { profile, registered, disabled }
  })

  const pendingRisks = []
  if (injects.length && perProfile.some((p) => p.registered && !p.disabled)) {
    for (const { profile, registered, disabled } of perProfile) {
      if (!registered || disabled) continue
      let patchText = ''
      try {
        patchText = fs.readFileSync(path.join(dshDir(), 'profiles', profile, 'cordis.patch.yml'), 'utf8')
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
    entry: { file: entryFile, ready: entryReady },
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

  const sharedFarm = scanSharedFarm({})

  const running = []
  try {
    // ps 是 POSIX 命令；Windows 上没有，try/catch 退化为空清单（不误报）
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

  // 客户端半（dsh.client）三层判定：宿主半冒烟覆盖不到的另一半。
  // web profile 与桌面 APP 共用同一套 platform:web 前端，这里一视同仁。
  const clientHalf = diagnoseClientHalf({
    pluginDir: targetDir,
    hostRoots: candidateGlobalRoots(),
    profiles: profiles.map((name) => ({ name, dir: path.join(dshDir(), 'profiles', name) })),
  })
  if (clientHalf.checked && activation.checked) {
    const order = { OK: 0, WARN: 1, ERROR: 2 }
    if (order[clientHalf.verdict] > order[activation.verdict]) activation.verdict = clientHalf.verdict
    activation.client = {
      declared: clientHalf.declared,
      platform: clientHalf.platform,
      bundleReady: clientHalf.bundleReady,
      findings: clientHalf.findings ?? [],
      perProfile: clientHalf.perProfile ?? [],
      verdict: clientHalf.verdict,
    }
    activation.clientRisks = clientHalf.findings?.filter((f) => f.severity !== 'info') ?? []
  }

  return {
    timestamp: new Date().toISOString(),
    globalDsh,
    profiles,
    overlayFindings: overlay,
    sharedFarmFindings: sharedFarm,
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
    dshDir: dshDir(),
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const target = process.argv[2] || process.cwd()
  const report = probeEnvironment(target)
  printJson(report)

  const overlayCount = report.overlayFindings.length
  const farm = report.sharedFarmFindings
  process.stderr.write(
    `\n全局 DSH: ${report.globalDsh?.version || '未检测到'} (${report.globalDsh?.source || 'n/a'})\n` +
    `profiles: ${report.profiles.join(', ') || '无'}\n` +
    `覆盖层问题: ${overlayCount} 处` +
    (farm && farm.brokenCount
      ? `｜共享农场悬空软链: ${farm.brokenCount} 处（指向宿主 ${farm.hostBackedBroken}）`
      : '') + '\n' +
    `运行中宿主进程: ${report.runningProcesses.length} 个\n` +
    (report.activation?.checked
      ? `目标插件启用就绪: ${report.activation.verdict}${report.activation.pendingRisks.length ? `（Silent Pending 风险 ${report.activation.pendingRisks.length} 处）` : ''}${report.activation.client ? `｜客户端半: ${report.activation.client.verdict}${report.activation.clientRisks.length ? `（死链 ${report.activation.clientRisks.length} 处）` : ''}` : ''}\n`
      : report.activation?.verdict === 'N/A'
        ? `目标插件启用就绪: N/A（${report.activation.reason}）\n`
        : '')
  )
}
