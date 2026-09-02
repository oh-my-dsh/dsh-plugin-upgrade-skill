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

const PKG = '@yejiming/dsh-data-agent'
const NEGATIVE_SIGNAL = /plugin tree failed|did not activate|pending \(waiting for service|FAILED fiber|ClientPackageCompositionError|failed to import loader entry|does not provide an export named/i
const BROWSER_ACTIVATION_FAILURE = /loaded without registering|failed to import loader entry|does not provide an export named/i
const OUTPUT_LIMIT = 100_000

/** Install, test, build, pack, add, cold-boot, and execute the candidate client. */
export async function runRuntimeSmoke(fixture) {
  const facts = []
  const scratch = mkdtempSync('/tmp/bench-h22-runtime-')
  const packDir = join(scratch, 'pack')
  const dshHome = join(scratch, 'dsh-home')
  const profile = join(dshHome, 'profiles', 'web')
  let server = null
  let browser = null

  try {
    const version = await command('dsh', ['--version'], { timeout: 15_000 })
    requireCommand(version, '读取dsh版本', 'quality')
    if (!/0\.1\.2-alpha\.2/.test(version.output)) {
      throw new SmokeFailure('quality', `运行时不是固定的dsh 0.1.2-alpha.2：${tail(version.output)}`)
    }

    const install = await command('pnpm', ['install', '--frozen-lockfile'], {
      cwd: fixture,
      timeout: 360_000,
    })
    requireCommand(install, 'frozen-lockfile安装候选依赖', 'quality')

    const tests = await command('pnpm', ['test'], { cwd: fixture, timeout: 360_000 })
    requireCommand(tests, '执行上游完整测试', 'quality')
    const typecheck = await command('pnpm', ['typecheck'], { cwd: fixture, timeout: 240_000 })
    requireCommand(typecheck, '执行上游typecheck', 'quality')
    const build = await command('pnpm', ['build'], { cwd: fixture, timeout: 360_000 })
    requireCommand(build, '构建候选发布产物', 'quality')
    facts.push('候选使用frozen lockfile安装，并通过上游test/typecheck/build')

    mkdirSync(packDir, { recursive: true })
    const pack = await command('npm', ['pack', '--pack-destination', packDir], {
      cwd: fixture,
      timeout: 120_000,
    })
    requireCommand(pack, '打包候选插件', 'quality')
    const tarballName = readdirSync(packDir).find((name) => name.endsWith('.tgz'))
    if (!tarballName) throw new SmokeFailure('quality', 'npm pack未生成tarball')
    const tarball = join(packDir, tarballName)

    createProfile(profile)
    const runtimeEnv = {
      DSH_HOME: dshHome,
      DSH_TELEMETRY_MODE: 'DISABLED',
      NO_COLOR: '1',
    }
    const add = await command('dsh', ['plugin', '--profile', 'web', 'add', `file:${tarball}`], {
      cwd: scratch,
      env: runtimeEnv,
      timeout: 300_000,
    })
    requireCommand(add, '通过官方CLI安装候选tarball', 'runtime')

    const installedManifestPath = join(profile, 'node_modules', '@yejiming', 'dsh-data-agent', 'package.json')
    if (!existsSync(installedManifestPath)) throw new SmokeFailure('runtime', 'profile中未找到候选插件manifest')
    const installed = JSON.parse(readFileSync(installedManifestPath, 'utf8'))
    if (installed.version !== '0.1.4') throw new SmokeFailure('runtime', `profile候选版本异常：${installed.version}`)
    const lock = readFileSync(join(profile, 'pnpm-lock.yaml'), 'utf8')
    if (!lock.includes('@yejiming/dsh-data-agent@file:')) {
      throw new SmokeFailure('runtime', 'profile lockfile未把dsh-data-agent锁定到候选本地tarball')
    }
    facts.push('官方dsh plugin add从当前fixture候选tarball安装0.1.4')

    server = startServer(dshHome, scratch)
    const ready = await waitForWeb(server, 150_000)
    if (!ready.url) throw new SmokeFailure('runtime', ready.detail)

    const { chromium } = await import('/opt/bench/node_modules/playwright-core/index.mjs')
    browser = await chromium.launch({
      executablePath: '/usr/bin/chromium',
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    })
    const page = await browser.newPage()
    const pageErrors = []
    const consoleErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message.slice(0, 500)))
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 500))
    })
    await page.goto(ready.url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    const entryUrl = await page.evaluate((id) =>
      globalThis.__DSH_BOOT__?.entries?.find((entry) => entry.id === id)?.url ?? '', PKG)
    if (!entryUrl) throw new SmokeFailure('runtime', '__DSH_BOOT__.entries缺少候选dsh-data-agent/client.js')

    const bundleStatus = await page.evaluate(async (url) => (await fetch(url)).status, entryUrl)
    if (bundleStatus !== 200) throw new SmokeFailure('runtime', `候选client bundle HTTP ${bundleStatus}`)

    try {
      await page.waitForFunction(() => typeof globalThis.__ModuleLoader__?.load === 'function', undefined, { timeout: 30_000 })
    } catch {
      throw new SmokeFailure('runtime', 'Chromium中未出现alpha.2的__ModuleLoader__.load')
    }
    let handoff
    try {
      handoff = await page.evaluate(({ id, url }) => new Promise((resolve, reject) => {
        const loader = globalThis.__ModuleLoader__
        const originalLoad = loader.load
        const timer = setTimeout(() => finish(new Error('候选bundle未向__ModuleLoader__交付模块')), 30_000)
        const script = document.createElement('script')
        let observed = null

        function finish(error) {
          clearTimeout(timer)
          loader.load = originalLoad
          script.remove()
          if (error) reject(error)
          else resolve(observed)
        }

        loader.load = function capture(candidate) {
          if (candidate?.id === id) {
            observed = { id: candidate.id, factoryType: typeof candidate.factory }
            return undefined
          }
          return originalLoad.call(this, candidate)
        }
        script.async = true
        script.src = new URL(url, location.href).href
        script.onload = () => finish(observed ? null : new Error('候选bundle执行后没有交付预期模块'))
        script.onerror = () => finish(new Error('候选bundle脚本加载失败'))
        document.head.append(script)
      }), { id: PKG, url: entryUrl })
    } catch (error) {
      throw new SmokeFailure('runtime', `alpha.2加载器无法执行候选client：${error.message}`)
    }
    if (handoff?.id !== PKG || handoff.factoryType !== 'function') {
      throw new SmokeFailure('runtime', `候选client加载器交付异常：${JSON.stringify(handoff)}`)
    }
    await page.waitForTimeout(1_500)

    const browserFailures = [...pageErrors, ...consoleErrors].filter((message) => BROWSER_ACTIVATION_FAILURE.test(message))
    if (browserFailures.length) {
      throw new SmokeFailure('runtime', `浏览器client激活失败：${browserFailures.slice(0, 3).join(' | ')}`)
    }
    if (NEGATIVE_SIGNAL.test(server.output())) {
      throw new SmokeFailure('runtime', `Web启动日志出现负向信号：${signal(server.output())}`)
    }
    facts.push('真实alpha.2 Web冷启动成功，Chromium执行候选client并观察到正确的__ModuleLoader__模块交付且无激活失败')
    return { ok: true, phase: 'runtime', facts }
  } catch (error) {
    return {
      ok: false,
      phase: error instanceof SmokeFailure ? error.phase : 'runtime',
      facts,
      detail: error instanceof Error ? error.message : String(error),
    }
  } finally {
    await browser?.close()
    if (server) await stopServer(server)
    rmSync(scratch, { recursive: true, force: true })
  }
}

class SmokeFailure extends Error {
  constructor(phase, message) {
    super(message)
    this.phase = phase
  }
}

function createProfile(profile) {
  mkdirSync(profile, { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    name: 'dsh-profile-web',
    private: true,
    dependencies: {},
    dsh: {
      profile: {
        bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'],
        patchReload: 'startup',
      },
    },
  }, null, 2) + '\n')
  writeFileSync(join(profile, 'cordis.patch.yml'), '[]\n')
  writeFileSync(join(profile, 'cordis.yml'), '[]\n')
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
  - '@morlay/better-session@0.0.11'
  - '@morlay/session-branch@0.0.11'
  - '@morlay/session-rdb@0.0.11'
  - '@morlay/ui-conversation-message-actions@0.0.11'
`)
}

function requireCommand(result, label, phase) {
  if (result.code !== 0) {
    const suffix = result.timedOut ? '（超时）' : ''
    throw new SmokeFailure(phase, `${label}失败${suffix}：${tail(result.output)}`)
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
    const append = (chunk) => { output = (output + chunk.toString()).slice(-OUTPUT_LIMIT) }
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
  const child = spawn('dsh', ['--profile', 'web', '--no-open', '--port', '0'], {
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
    if (NEGATIVE_SIGNAL.test(output)) return { detail: `Web启动日志出现负向信号：${signal(output)}` }
    const match = /dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=\S+)/.exec(output)
    if (match) return { url: match[1] }
    if (server.exited()) return { detail: `dsh web提前退出（code=${server.code()}）：${tail(output)}` }
    await delay(1_000)
  }
  return { detail: `150秒内未等到dsh web就绪：${tail(server.output())}` }
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
  return compact.slice(-1_200) || '无输出'
}

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}
