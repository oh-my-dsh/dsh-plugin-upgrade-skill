import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

const NEGATIVE_SIGNAL = /plugin tree failed|did not activate|pending \(waiting for service|FAILED fiber|ClientPackageCompositionError|failed to import loader entry/i
const OUTPUT_LIMIT = 80_000

/**
 * Build the candidate workspace, pack every local @linxin666 package, force the
 * aggregate package to consume those exact tarballs, install it through the
 * official CLI, then cold-start the real alpha.2 Web profile and inspect its
 * browser boot graph.
 */
export async function runRuntimeSmoke(fixture) {
  const facts = []
  const scratch = mkdtempSync('/tmp/bench-h5-runtime-')
  const familyDir = join(scratch, 'family-tarballs')
  const rewriteDir = join(scratch, 'aggregate-rewrite')
  const rewriteTmp = join(scratch, 'rewrite-tmp')
  const dshHome = join(scratch, 'dsh-home')
  const profile = join(dshHome, 'profiles', 'web')
  let server = null

  try {
    const version = await command('dsh', ['--version'], { timeout: 15_000 })
    requireCommand(version, '读取 dsh 版本')
    if (!/0\.1\.2-alpha\.2/.test(version.output)) {
      throw new SmokeFailure(`运行时不是固定的 dsh 0.1.2-alpha.2：${tail(version.output)}`)
    }
    facts.push('运行时固定为 dsh 0.1.2-alpha.2')

    // The v0.3.9 compatibility slice intentionally does not include an
    // unrelated root-package change made between the tags. Regenerate only
    // the install lock from the candidate manifests; the sealed static judge
    // already checked the submitted lockfile before this point.
    const install = await command('pnpm', ['install', '--no-frozen-lockfile', '--ignore-scripts'], {
      cwd: fixture,
      timeout: 360_000,
    })
    requireCommand(install, '安装候选 workspace 依赖')

    const build = await command('pnpm', ['-r', '--workspace-concurrency=2', 'build'], {
      cwd: fixture,
      timeout: 360_000,
    })
    requireCommand(build, '构建候选 workspace')
    facts.push('候选 v0.3.9 workspace 完整安装并构建成功')

    mkdirSync(familyDir, { recursive: true })
    const pack = await command('pnpm', [
      '-r',
      '--workspace-concurrency=2',
      'pack',
      '--pack-destination',
      familyDir,
    ], { cwd: fixture, timeout: 360_000 })
    requireCommand(pack, '打包候选 workspace')

    const tarballs = readdirSync(familyDir).filter((name) => name.endsWith('.tgz'))
    const aggregateName = tarballs.find((name) => name.startsWith('linxin666-dsh-web-all-'))
    if (!aggregateName) throw new SmokeFailure(`workspace 打包后未找到 dsh-web-all tarball（共${tarballs.length}个）`)

    mkdirSync(rewriteDir, { recursive: true })
    mkdirSync(rewriteTmp, { recursive: true })
    const aggregateTgz = join(familyDir, aggregateName)
    requireCommand(await command('tar', ['-xzf', aggregateTgz, '-C', rewriteDir], { timeout: 30_000 }), '解包聚合 tarball')

    const packedManifestPath = join(rewriteDir, 'package', 'package.json')
    const packedManifest = readJson(packedManifestPath)
    if (packedManifest.name !== '@linxin666/dsh-web-all') {
      throw new SmokeFailure(`聚合 tarball 包名异常：${packedManifest.name ?? 'missing'}`)
    }
    const familyNames = Object.keys(packedManifest.dependencies || {}).filter((name) => name.startsWith('@linxin666/'))
    if (familyNames.length !== 17) {
      throw new SmokeFailure(`聚合包必须保留真实的17个家族依赖，当前为${familyNames.length}个`)
    }

    const rewrite = await command('node', [
      join(fixture, 'scripts', 'e2e-mount-rewrite'),
      packedManifestPath,
      '--root',
      fixture,
      '--family-dir',
      familyDir,
    ], {
      cwd: fixture,
      env: { TMPDIR: rewriteTmp },
      timeout: 180_000,
    })
    requireCommand(rewrite, '把聚合依赖递归改写为候选本地 tarball')

    const rewrittenManifest = readJson(packedManifestPath)
    const nonLocal = familyNames.filter((name) => !String(rewrittenManifest.dependencies?.[name]).startsWith('file:'))
    if (nonLocal.length) throw new SmokeFailure(`仍有家族依赖回落到 registry：${nonLocal.join(', ')}`)

    const rewrittenTgz = join(scratch, 'dsh-web-all-candidate.tgz')
    requireCommand(await command('tar', ['-czf', rewrittenTgz, '-C', rewriteDir, 'package'], { timeout: 30_000 }), '重打聚合 tarball')
    facts.push(`聚合包的${familyNames.length}个家族依赖全部锁定到候选本地 tarball`)

    createProfile(profile)
    const runtimeEnv = {
      DSH_HOME: dshHome,
      DSH_TELEMETRY_MODE: 'DISABLED',
      NO_COLOR: '1',
    }
    const add = await command('dsh', ['plugin', '--profile', 'web', 'add', `file:${rewrittenTgz}`], {
      cwd: scratch,
      env: runtimeEnv,
      timeout: 300_000,
    })
    requireCommand(add, '通过官方 CLI 安装候选聚合包')

    const profileManifest = readJson(join(profile, 'package.json'))
    const bundles = profileManifest.dsh?.profile?.bundles || []
    if (!bundles.includes('@linxin666/dsh-web-all')) {
      throw new SmokeFailure('dsh plugin add 完成后聚合包未注册到 profile bundles')
    }

    const profileLock = readFileSync(join(profile, 'pnpm-lock.yaml'), 'utf8')
    const notInstalledLocally = familyNames.filter((name) => {
      const packageManifest = join(profile, 'node_modules', ...name.split('/'), 'package.json')
      return !existsSync(packageManifest) || !profileLock.includes(`${name}@file:`)
    })
    if (notInstalledLocally.length) {
      throw new SmokeFailure(`profile 未从本地 tarball 安装完整家族：${notInstalledLocally.join(', ')}`)
    }
    facts.push('官方 dsh plugin add 已把本地候选聚合包及全部家族包装入隔离 web profile')

    server = startServer(dshHome, scratch)
    const ready = await waitForWeb(server, 150_000)
    if (!ready.url) throw new SmokeFailure(ready.detail)

    const html = await fetchIndex(ready.url)
    await delay(2_000)
    if (NEGATIVE_SIGNAL.test(server.output())) {
      throw new SmokeFailure(`Web 启动日志出现负向信号：${signal(server.output())}`)
    }

    const expectedEntries = [
      '@linxin666/dsh-web-all/client.js',
      '@linxin666/dsh-client-ui-task-board/client.js',
      '@linxin666/dsh-client-ui-web-ui-settings/client.js',
    ]
    const missingEntries = expectedEntries.filter((entry) => !html.includes(entry))
    if (missingEntries.length) {
      throw new SmokeFailure(`__DSH_BOOT__.entries 缺少候选插件：${missingEntries.join(', ')}`)
    }
    facts.push('真实 dsh web 冷启动成功，且启动图含聚合包、task-board 与 web-settings 客户端')

    return { ok: true, facts }
  } catch (error) {
    return {
      ok: false,
      facts,
      detail: error instanceof Error ? error.message : String(error),
    }
  } finally {
    if (server) await stopServer(server)
    rmSync(scratch, { recursive: true, force: true })
  }
}

class SmokeFailure extends Error {}

function createProfile(profile) {
  mkdirSync(profile, { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    name: 'dsh-profile-web',
    private: true,
    dependencies: {},
    dsh: {
      profile: {
        bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'],
      },
    },
  }, null, 2) + '\n')
  writeFileSync(join(profile, 'cordis.patch.yml'), '[]\n')
  writeFileSync(join(profile, 'pnpm-workspace.yaml'), `packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false

allowBuilds:
  node-pty: true
  protobufjs: true
  cloudflared: true
  cpu-features: true
  ssh2: true

minimumReleaseAgeExclude:
  - '@linxin666/*'
  - '@morlay/better-session@0.0.11'
  - '@morlay/session-branch@0.0.11'
  - '@morlay/session-rdb@0.0.11'
  - '@morlay/ui-conversation-message-actions@0.0.11'
`)
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new SmokeFailure(`无法读取 ${path}：${error.message}`)
  }
}

function requireCommand(result, label) {
  if (result.code !== 0) {
    const suffix = result.timedOut ? '（超时）' : ''
    throw new SmokeFailure(`${label}失败${suffix}：${tail(result.output)}`)
  }
}

function command(file, args, { cwd, env = {}, timeout = 60_000 } = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(file, args, {
      cwd,
      env: { ...process.env, ...env },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    let finished = false
    const append = (chunk) => {
      output = (output + chunk.toString()).slice(-OUTPUT_LIMIT)
    }
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    const timer = setTimeout(() => {
      killGroup(child.pid, 'SIGTERM')
      setTimeout(() => killGroup(child.pid, 'SIGKILL'), 2_000).unref()
      finish(null, true)
    }, timeout)
    const finish = (code, timedOut = false) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      resolvePromise({ code: code ?? 1, output, timedOut })
    }
    child.on('error', (error) => {
      append(error.message)
      finish(127)
    })
    child.on('close', (code) => finish(code))
  })
}

function startServer(dshHome, cwd) {
  const child = spawn('dsh', ['web', '--port', '0', '--no-open'], {
    cwd,
    env: {
      ...process.env,
      DSH_HOME: dshHome,
      DSH_TELEMETRY_MODE: 'DISABLED',
      NO_COLOR: '1',
    },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  let exited = false
  let code = null
  const append = (chunk) => { output = (output + chunk.toString()).slice(-OUTPUT_LIMIT) }
  child.stdout.on('data', append)
  child.stderr.on('data', append)
  child.on('error', (error) => {
    append(error.message)
    exited = true
  })
  child.on('close', (value) => {
    exited = true
    code = value
  })
  return { child, output: () => output, exited: () => exited, code: () => code }
}

async function waitForWeb(server, timeout) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const output = server.output()
    if (NEGATIVE_SIGNAL.test(output)) {
      return { detail: `Web 启动日志出现负向信号：${signal(output)}` }
    }
    const match = /dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=\S+)/.exec(output)
    if (match) return { url: match[1] }
    if (server.exited()) {
      return { detail: `dsh web 提前退出（code=${server.code()}）：${tail(output)}` }
    }
    await delay(1_000)
  }
  return { detail: `150秒内未等到 dsh web 就绪：${tail(server.output())}` }
}

async function fetchIndex(tokenUrl) {
  try {
    const first = await fetch(tokenUrl, { redirect: 'manual', signal: AbortSignal.timeout(20_000) })
    if (first.status === 200) return await first.text()
    const cookies = first.headers.getSetCookie
      ? first.headers.getSetCookie()
      : [first.headers.get('set-cookie')].filter(Boolean)
    const cookie = cookies.map((value) => value.split(';')[0]).join('; ')
    const base = new URL(tokenUrl)
    base.pathname = '/'
    base.search = ''
    const page = await fetch(base, {
      headers: cookie ? { cookie } : {},
      signal: AbortSignal.timeout(20_000),
    })
    if (!page.ok) throw new Error(`HTTP ${page.status}`)
    return await page.text()
  } catch (error) {
    throw new SmokeFailure(`无法读取真实 Web 启动页：${error.message}`)
  }
}

async function stopServer(server) {
  if (!server.exited()) {
    killGroup(server.child.pid, 'SIGTERM')
    await delay(1_000)
    if (!server.exited()) killGroup(server.child.pid, 'SIGKILL')
  }
}

function killGroup(pid, signalName) {
  if (!pid) return
  try { process.kill(-pid, signalName) } catch {}
}

function signal(output) {
  return output.match(NEGATIVE_SIGNAL)?.[0] ?? 'unknown'
}

function tail(output) {
  const compact = String(output || '').trim()
  return compact.slice(-1_000) || '无输出'
}

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}
