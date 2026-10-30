// client-graph.mjs —— 客户端半（dsh.client）启用就绪度判定。
//
// 为什么需要它：run.mjs 的冒烟只验宿主半（lib/index.js），而 2026-10-25 实录：
// 桌面 APP 起不来，真凶是插件客户端半的 manifest 死注入——dsh.client.inject
// 指向一个上游已移除、名册行已被覆盖层重写丢掉的包，客户端 entry 永卡
// loading，宿主把「entry did not activate」当致命错误（web profile 与桌面
// APP 共用同一套 platform:web 前端，两端一视同仁，一处死链两端都炸）。
//
// 失败模式按启动管线 MECE 分三层，每层对应 dsh-client-modules 合成器的一个
// 真实判定点（读宿主 @deepseek-ai/dsh-client-modules 源码得出，非臆造）：
//   1. 声明层 —— dsh.client 形状不合法，合成器 boot 即 throw；
//   2. 产物层 —— 声明了 dsh.client 但 exports 无 "./client" 或文件缺失，
//      合成器报 "client bundles not found"；
//   3. 名册层 —— inject 目标不在客户端名册（宿主内置 / bundles / overlay
//      挂载行）里，entry 卡 loading，整次 web boot 失败。
//
// 名册证据分强弱两档（第一性原理：装载行存在与否决定解析，包文件存在与否
// 不决定）。强证据（宿主内置、bundles 列名、overlay 挂载行）直接视为提供
// 方；弱证据（包在 node_modules 且自带 dsh.client，但无任何行证据）报 info
// 风险让人确认——宿主是否自动挂载依赖，静态分析判不了，诚实留白。

import fs from 'node:fs'
import path from 'node:path'

// ── 声明层 ──────────────────────────────────────────────────────────────────

// 镜像宿主 parseDshClient 的校验：platform 必须 string，inject/external
// 必须 string[]，immediately 必须 boolean。返回 null 表示没有客户端半。
export function readClientDecl(pkgName, manifest) {
  const dsh = manifest?.dsh
  if (!dsh || typeof dsh !== 'object' || dsh.client === undefined) return null
  const decl = dsh.client
  if (typeof decl !== 'object' || decl === null) {
    return { invalid: `${pkgName} has a non-object dsh.client declaration` }
  }
  if (typeof decl.platform !== 'string') {
    return { invalid: `${pkgName} dsh.client.platform must be a string` }
  }
  for (const field of ['inject', 'external']) {
    const value = decl[field]
    if (value !== undefined && (!Array.isArray(value) || value.some((x) => typeof x !== 'string'))) {
      return { invalid: `${pkgName} dsh.client.${field} must be a string array` }
    }
  }
  if (decl.immediately !== undefined && typeof decl.immediately !== 'boolean') {
    return { invalid: `${pkgName} dsh.client.immediately must be a boolean` }
  }
  return {
    platform: decl.platform,
    inject: decl.inject ?? [],
    external: decl.external ?? [],
    immediately: decl.immediately === true,
  }
}

// ── 产物层 ──────────────────────────────────────────────────────────────────

// 解析 exports["./client"]（字符串或 { default } 两种写法）到相对路径。
export function clientExportPath(manifest) {
  const entry = manifest?.exports?.['./client']
  if (entry === undefined) return null
  if (typeof entry === 'string') return entry
  if (typeof entry === 'object' && entry !== null && typeof entry.default === 'string') {
    return entry.default
  }
  return null
}

// ── 名册层 ──────────────────────────────────────────────────────────────────

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

// profile node_modules 顶层两轮扫描（普通名 + @scope/name）。
function profileDepManifests(profileDir) {
  const out = []
  const nm = path.join(profileDir, 'node_modules')
  let top = []
  try {
    top = fs.readdirSync(nm)
  } catch {
    return out
  }
  for (const name of top) {
    if (name.startsWith('.')) continue
    if (name.startsWith('@')) {
      try {
        for (const sub of fs.readdirSync(path.join(nm, name))) {
          out.push([`${name}/${sub}`, path.join(nm, name, sub)])
        }
      } catch {}
    } else {
      out.push([name, path.join(nm, name)])
    }
  }
  return out
}

// overlay 挂载名提取。与 env-doctor 的 parsePatchEntries 同一套块切分规则，
// 但不 import 它（env-doctor 依赖本模块，反向引用会成环）；
// 注释行剥除后取条目头部的 name/id/inline-insert。
export function overlayMountedNames(text) {
  const names = new Set()
  for (const block of text.split(/(?=^\s*-\s)/m)) {
    const live = block.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n')
    if (!/^\s*-\s/.test(live)) continue
    const header = live.split('\n').slice(0, 5).join('\n')
    for (const m of header.matchAll(/(?:name|id):\s*['"]?([\w@/.-]+)['"]?/g)) {
      if (m[1] && m[1] !== 'insert') names.add(m[1])
    }
  }
  return names
}

// 一个包是否被 overlay 显式补挂（- insert: 行向下 6 行内 name/id 命中）。
// 不用块切分：嵌套子项「    - id:」自身匹配行首「- 」会被切成独立块，
// name 落在下一块里导致 insert 块永远查不到载荷（2026-10-25 自测实录）。
// 这是「兼容垫片是有意保留」的判定信号，env-doctor 的 overlayFindings
// 用它把上游已移除包从 critical 降级为 info（同日实录：web 端
// client-runtime 垫片被误报 critical，实为刻意保留）。
export function isDeliberateRosterInsert(text, pkgName) {
  const want = new Set([pkgName, pkgName.replace(/^@[^/]+\//, '')])
  const lines = text.split('\n').filter((line) => !/^\s*#/.test(line))
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*-\s*insert/.test(lines[i])) continue
    // 窗口只吃到比 insert 行更深缩进的载荷行；同缩进的下一个条目即止，
    // 否则会把紧邻条目的 name 误认成 insert 载荷（自测实录）。
    const indent = lines[i].match(/^\s*/)[0].length
    for (let j = i; j < lines.length; j++) {
      if (j > i) {
        if (!lines[j].trim()) continue
        if (lines[j].match(/^\s*/)[0].length <= indent) break
      }
      const m = lines[j].match(/(?:name|id):\s*['"]?([\w@/.-]+)['"]?/)
      if (m && want.has(m[1])) return true
    }
  }
  return false
}

// 收集一个 profile 的客户端名册：Map<包名, { source: 强证据类型 }>。
// hostRoots 给全局宿主 node_modules 根（内置面）；profileDir 给 profile 目录。
export function collectRoster({ hostRoots = [], profileDir }) {
  const roster = new Map()

  // 宿主内置包有两层布局：全局根下的 @deepseek-ai/*（独立安装），以及
  // dsh 主包自带的 @deepseek-ai/dsh/node_modules/@deepseek-ai/*（官方套件
  // 捆绑面，client-connection/api-remotes/ui-settings 这些都在这层——
  // 漏扫会把全部内置注入误报成死链，2026-10-25 接线实测）。
  const builtinDirs = []
  for (const root of hostRoots) {
    builtinDirs.push(path.join(root, '@deepseek-ai'))
    builtinDirs.push(path.join(root, '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai'))
  }
  for (const scoped of builtinDirs) {
    let subs = []
    try {
      subs = fs.readdirSync(scoped)
    } catch {
      continue
    }
    for (const sub of subs) {
      if (sub === 'dsh' && scoped.endsWith(path.join('@deepseek-ai'))) continue // dsh 主包自身在根层，跳过避免与其嵌套层重复
      const pkg = readJson(path.join(scoped, sub, 'package.json'))
      const decl = readClientDecl(`@deepseek-ai/${sub}`, pkg)
      if (decl && !decl.invalid && decl.platform === 'web') {
        roster.set(`@deepseek-ai/${sub}`, { source: 'host-builtin' })
      }
    }
  }

  if (profileDir) {
    const profilePkg = readJson(path.join(profileDir, 'package.json'))
    const bundles = profilePkg?.dsh?.profile?.bundles
    const depNames = new Set()
    for (const [name, dir] of profileDepManifests(profileDir)) {
      depNames.add(name)
      const pkg = readJson(path.join(dir, 'package.json'))
      const decl = readClientDecl(name, pkg)
      if (decl && !decl.invalid && decl.platform === 'web') {
        if (Array.isArray(bundles) && bundles.includes(name)) {
          roster.set(name, { source: 'bundles' })
        }
      }
    }

    let overlayText = ''
    try {
      overlayText = fs.readFileSync(path.join(profileDir, 'cordis.patch.yml'), 'utf8')
    } catch {}
    for (const name of overlayMountedNames(overlayText)) {
      if (!roster.has(name)) roster.set(name, { source: 'overlay' })
    }

    // 弱证据单独返回：包在依赖里且自带 web 客户端半，但无行证据。
    const weak = new Map()
    for (const [name, dir] of profileDepManifests(profileDir)) {
      if (roster.has(name)) continue
      const pkg = readJson(path.join(dir, 'package.json'))
      const decl = readClientDecl(name, pkg)
      if (decl && !decl.invalid && decl.platform === 'web') weak.set(name, { source: 'dep-unmounted' })
    }
    return { roster, weak, depNames, bundles: Array.isArray(bundles) ? bundles : [] }
  }

  return { roster, weak: new Map(), depNames: new Set(), bundles: [] }
}

// ── 诊断 ────────────────────────────────────────────────────────────────────

// 对目标插件做三层判定。profileDirs 是 { name, dir } 列表；只在插件已装
// （出现在该 profile 依赖里）的 profile 上查注入，未装的跳过。
export function diagnoseClientHalf({ pluginDir, hostRoots = [], profiles = [] }) {
  const root = path.resolve(pluginDir)
  const manifest = readJson(path.join(root, 'package.json'))
  if (!manifest) return { checked: false, reason: '目标目录没有 package.json' }
  const pkgName = manifest.name || path.basename(root)

  const decl = readClientDecl(pkgName, manifest)
  if (decl === null) {
    return { checked: true, package: pkgName, declared: false, verdict: 'OK', note: '无 dsh.client 声明（纯宿主半插件）' }
  }

  const findings = []
  if (decl.invalid) {
    return {
      checked: true, package: pkgName, declared: true,
      findings: [{ layer: 'declaration', severity: 'critical', code: 'client-decl-invalid', detail: decl.invalid }],
      verdict: 'ERROR',
    }
  }

  const clientRel = clientExportPath(manifest)
  let bundleReady = false
  if (!clientRel) {
    findings.push({ layer: 'artifact', severity: 'critical', code: 'client-export-missing', detail: `${pkgName} 声明了 dsh.client 但 exports 没有 "./client"，合成器会报 client bundles not found` })
  } else {
    bundleReady = fs.existsSync(path.join(root, clientRel.replace(/^\//, '').replace(/^\.\//, '')))
    if (!bundleReady) {
      findings.push({ layer: 'artifact', severity: 'critical', code: 'client-bundle-missing', detail: `客户端产物缺失：${clientRel}` })
    }
  }

  const notes = []
  if (decl.platform !== 'web') {
    notes.push(`platform=${decl.platform}：web profile 与桌面 APP 不加载该客户端半（非失败）`)
  }

  const perProfile = []
  for (const { name: profileName, dir: profileDir } of profiles) {
    const { roster, weak, depNames } = collectRoster({ hostRoots, profileDir })
    if (!depNames.has(pkgName)) {
      perProfile.push({ profile: profileName, installed: false })
      continue
    }
    const entry = { profile: profileName, installed: true, deadInjects: [], weakInjects: [] }
    for (const target of decl.inject) {
      if (roster.has(target)) continue
      if (weak.has(target)) {
        entry.weakInjects.push(target)
        findings.push({
          layer: 'roster', severity: 'info', profile: profileName, code: 'client-inject-unmounted-evidence',
          detail: `注入目标 ${target} 只有包存在证据、无挂载行证据（bundles/overlay 均无）；宿主若不自动挂载它，本插件客户端半会卡 loading（2026-10-25 桌面端实录形态）`,
        })
      } else {
        entry.deadInjects.push(target)
        findings.push({
          layer: 'roster', severity: 'critical', profile: profileName, code: 'client-inject-dead',
          detail: `注入目标 ${target} 不在 ${profileName} 的客户端名册（宿主内置/bundles/overlay 均无，包也不在依赖里），客户端半必卡 loading`,
        })
      }
    }
    perProfile.push(entry)
  }

  let verdict = 'OK'
  if (findings.some((f) => f.severity === 'critical')) verdict = 'ERROR'
  else if (findings.some((f) => f.severity === 'info')) verdict = 'WARN'

  return { checked: true, package: pkgName, declared: true, platform: decl.platform, inject: decl.inject, bundleReady, findings, perProfile, notes, verdict }
}
