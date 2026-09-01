import { execFile, spawn } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const APP_ROOT = '/app'
export const FIXTURE_DIR = join(APP_ROOT, 'fixture')

export function emit(score, reasons) {
  process.stdout.write(JSON.stringify({
    score: Math.max(0, Math.min(100, Math.round(score))),
    max: 100,
    reasons,
  }) + '\n')
  process.exit(0)
}

function run(file, args, { cwd, timeout = 60000 } = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { cwd, timeout }, (error, stdout, stderr) => resolve({
      code: error?.code ?? 0,
      stdout: stdout ?? '',
      stderr: stderr ?? '',
    }))
  })
}

export async function fixtureChanges(relFixtureDir = 'fixture') {
  const result = await run('git', ['status', '--porcelain', '--', relFixtureDir], { cwd: APP_ROOT, timeout: 20000 })
  if (result.code !== 0) return { changed: null, detail: `git status failed: ${result.stderr.trim()}` }
  const lines = result.stdout.split('\n').filter(Boolean)
  return {
    changed: lines.length > 0,
    detail: lines.length ? lines.join('; ') : 'fixture unchanged relative to baseline',
  }
}

export async function dshAvailable() {
  return (await run('dsh', ['--version'], { timeout: 15000 })).code === 0
}

export async function createProfile(profile, bundles) {
  const dir = `/root/.dsh/profiles/${profile}`
  try {
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: `dsh-profile-${profile}`,
      private: true,
      dependencies: {},
      dsh: { profile: { bundles, patchReload: 'startup' } },
    }, null, 2) + '\n')
    writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n')
    writeFileSync(join(dir, 'cordis.patch.yml'), '[]\n')
    writeFileSync(join(dir, 'cordis.yml'), '[]\n')
    return { ok: true }
  } catch (error) {
    return { ok: false, detail: `profile setup failed: ${error.message}` }
  }
}

export async function addPlugin(profile, pluginDir) {
  const result = await run('dsh', ['plugin', '--profile', profile, 'add', pluginDir], { timeout: 180000 })
  return { ok: result.code === 0, detail: (result.stdout + result.stderr).trim().slice(-400) }
}

export function cleanupProfile(profile) {
  rmSync(`/root/.dsh/profiles/${profile}`, { recursive: true, force: true })
}

/** Use real Chromium execution to distinguish bundle delivery from client activation. */
export async function bootWebInBrowser(profile, pkgName) {
  const child = spawn('dsh', ['--profile', profile, '--no-open', '--port', '0'], {
    cwd: '/root',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })
  child.on('error', (error) => { output += `\n${error.message}` })

  const result = { output: '', entryUrl: '', bundleStatus: null, active: false, pageErrors: [], consoleErrors: [] }
  let browser
  try {
    for (let i = 0; i < 360; i += 1) {
      if (/dsh web: http|plugin tree failed|did not activate/i.test(output)
        || child.exitCode !== null || child.signalCode !== null) break
      await delay(250)
    }
    result.output = output
    const url = /dsh web: (http:\/\/\S+)/.exec(output)?.[1]
    if (!url) return { ...result, browserError: 'web URL was not emitted' }

    const { chromium } = await import('/opt/bench/node_modules/playwright-core/index.mjs')
    browser = await chromium.launch({
      executablePath: '/usr/bin/chromium',
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    })
    const page = await browser.newPage()
    page.on('pageerror', (error) => result.pageErrors.push(error.message.slice(0, 240)))
    page.on('console', (message) => {
      if (message.type() === 'error') result.consoleErrors.push(message.text().slice(0, 240))
    })
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
    result.entryUrl = await page.evaluate((id) =>
      globalThis.__DSH_BOOT__?.entries?.find((entry) => entry.id === id)?.url ?? '', pkgName)
    if (result.entryUrl) {
      result.bundleStatus = await page.evaluate(async (entryUrl) => (await fetch(entryUrl)).status, result.entryUrl)
    }

    let marker = false
    try {
      await page.waitForFunction(
        () => document.documentElement.dataset.benchBrowserActivation === 'active',
        undefined,
        { timeout: 15000 },
      )
      marker = true
    } catch {}
    await page.waitForTimeout(250)
    const activationFailure = [...result.pageErrors, ...result.consoleErrors].some((message) =>
      message.includes(pkgName) && /loaded without registering|failed to import loader entry/i.test(message))
    result.active = marker && !activationFailure
    return result
  } catch (error) {
    return { ...result, browserError: error.message }
  } finally {
    await browser?.close()
    await stop(child)
  }
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise((resolve) => child.once('exit', resolve))
  child.kill('SIGINT')
  await Promise.race([exited, delay(5000)])
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
}
