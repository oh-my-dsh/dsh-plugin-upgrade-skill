#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { runDockerSmoke } from '../../skills/plugin-test/scripts/docker-release-smoke.mjs'

const runtimeRoot = dirname(fileURLToPath(import.meta.url))
const benchmarkRoot = resolve(runtimeRoot, '..')
const repositoryRoot = resolve(benchmarkRoot, '..')
const casesPath = join(runtimeRoot, 'cases.json')
const referencesRoot = join(repositoryRoot, 'skills', 'plugin-upgrade', 'references')

function parseArguments(argv) {
  const options = { caseIds: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--check') options.check = true
    else if (argument === '--all') options.all = true
    else if (argument === '--case') {
      const value = argv[++index]
      if (!value) throw new Error('--case requires an ID')
      options.caseIds.push(value)
    } else if (argument === '--report-dir') {
      const value = argv[++index]
      if (!value) throw new Error('--report-dir requires a path')
      options.reportDirectory = resolve(value)
    } else if (argument === '--help' || argument === '-h') options.help = true
    else throw new Error(`unknown argument: ${argument}`)
  }
  if (!options.help && !options.check && !options.all && options.caseIds.length === 0) {
    throw new Error('choose --check, --all, or at least one --case <id>')
  }
  return options
}

function usage() {
  return [
    'Usage:',
    '  node tests/dsh/verify.mjs --check',
    '  node tests/dsh/verify.mjs --all [--report-dir <path>]',
    '  node tests/dsh/verify.mjs --case <id> [--report-dir <path>]',
  ].join('\n')
}

function requireString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be a non-empty string`)
  return value
}

function requireExactVersion(value, name) {
  const version = requireString(value, name)
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`${name} must be an exact semver version`)
  }
  return version
}

function requireInteger(value, name, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`)
  }
  return value
}

function validateCases(data) {
  if (data?.schema !== 1) throw new Error('cases.json schema must be 1')
  if (!data.defaults || typeof data.defaults !== 'object') throw new Error('cases.json defaults are required')
  requireString(data.defaults.image, 'defaults.image')
  requireExactVersion(data.defaults.pnpmVersion, 'defaults.pnpmVersion')
  requireString(data.defaults.profile, 'defaults.profile')
  if (!Array.isArray(data.defaults.startCommand) || data.defaults.startCommand.length === 0) {
    throw new Error('defaults.startCommand must be a non-empty argv array')
  }
  data.defaults.startCommand.forEach((part, index) => requireString(part, `defaults.startCommand[${index}]`))
  requireInteger(data.defaults.timeoutSeconds, 'defaults.timeoutSeconds', 1, 1800)
  requireInteger(data.defaults.shutdownGraceSeconds, 'defaults.shutdownGraceSeconds', 1, 60)
  if (!Array.isArray(data.cases) || data.cases.length === 0) throw new Error('cases.json must contain cases')
  const ids = new Set()
  for (const [caseIndex, entry] of data.cases.entries()) {
    const prefix = `cases[${caseIndex}]`
    const id = requireString(entry.id, `${prefix}.id`)
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error(`${prefix}.id must be kebab-case`)
    if (ids.has(id)) throw new Error(`duplicate case id: ${id}`)
    ids.add(id)
    const fromVersion = requireExactVersion(entry.from, `${prefix}.from`)
    const toVersion = requireExactVersion(entry.to, `${prefix}.to`)
    const corridorVersions = new Set([fromVersion, toVersion])
    if (!['target-only', 'dual'].includes(entry.compatibility)) {
      throw new Error(`${prefix}.compatibility must be target-only or dual`)
    }
    if (!Array.isArray(entry.cards) || entry.cards.length === 0) throw new Error(`${prefix}.cards are required`)
    for (const card of entry.cards) {
      requireString(card, `${prefix}.cards[]`)
      if (!new RegExp(`^### ${card.replaceAll('.', '\\.')}(?: |$)`, 'm').test(data.referenceText)) {
        throw new Error(`${id} references an unknown card: ${card}`)
      }
    }
    if (!entry.fixtures || typeof entry.fixtures !== 'object') throw new Error(`${prefix}.fixtures are required`)
    for (const [name, relativePath] of Object.entries(entry.fixtures)) {
      const path = resolve(benchmarkRoot, requireString(relativePath, `${prefix}.fixtures.${name}`))
      if (!path.startsWith(`${benchmarkRoot}/`)) throw new Error(`${id} fixture leaves benchmark: ${relativePath}`)
      if (!existsSync(join(path, 'package.json'))) throw new Error(`${id} fixture is missing package.json: ${relativePath}`)
    }
    if (!Array.isArray(entry.checks) || entry.checks.length === 0) throw new Error(`${prefix}.checks are required`)
    const checkIds = new Set()
    for (const [checkIndex, check] of entry.checks.entries()) {
      const checkPrefix = `${prefix}.checks[${checkIndex}]`
      const checkId = requireString(check.id, `${checkPrefix}.id`)
      if (checkIds.has(checkId)) throw new Error(`${id} has duplicate check id: ${checkId}`)
      checkIds.add(checkId)
      if (!entry.fixtures[check.fixture]) throw new Error(`${checkPrefix}.fixture is unknown: ${check.fixture}`)
      const dshVersion = requireExactVersion(check.dshVersion, `${checkPrefix}.dshVersion`)
      if (!corridorVersions.has(dshVersion)) {
        throw new Error(`${checkPrefix}.dshVersion must match the case from or to version`)
      }
      if (!['pass', 'fail'].includes(check.expect)) throw new Error(`${checkPrefix}.expect must be pass or fail`)
      if (check.expect === 'pass') requireString(check.readyText, `${checkPrefix}.readyText`)
      if (check.expect === 'fail') {
        requireString(check.failureClassification, `${checkPrefix}.failureClassification`)
        requireString(check.logPattern, `${checkPrefix}.logPattern`)
      }
    }
  }
  return data
}

async function loadCases() {
  const data = JSON.parse(await readFile(casesPath, 'utf8'))
  const referenceFiles = (await readdir(referencesRoot)).filter((name) => /^v\d.*\.md$/.test(name)).sort()
  data.referenceText = (
    await Promise.all(referenceFiles.map((name) => readFile(join(referencesRoot, name), 'utf8')))
  ).join('\n')
  return validateCases(data)
}

function runProcess(command, args, options = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8')
    })
    child.once('error', (error) => resolvePromise({ exitCode: null, stdout, stderr, error }))
    child.once('close', (exitCode) => resolvePromise({ exitCode, stdout, stderr }))
  })
}

async function packFixture(path, destination) {
  const result = await runProcess('npm', ['pack', '--json', '--pack-destination', destination], { cwd: path })
  if (result.error) throw result.error
  if (result.exitCode !== 0) throw new Error(`npm pack failed for ${path}: ${result.stderr || result.stdout}`)
  let metadata
  try {
    metadata = JSON.parse(result.stdout)
  } catch {
    throw new Error(`npm pack returned invalid JSON for ${path}: ${result.stdout}`)
  }
  const filename = metadata?.[0]?.filename
  if (!filename) throw new Error(`npm pack did not report an artifact for ${path}`)
  return join(destination, filename)
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function evaluateCheck(check, report) {
  if (check.expect === 'pass') {
    if (report.status !== 'passed') return `expected pass, got ${report.failureClassification ?? report.status}`
    return null
  }
  if (report.status !== 'failed') return `expected failure containing ${check.logPattern}, got pass`
  if (report.failureClassification !== check.failureClassification) {
    return `expected ${check.failureClassification} failure, got ${report.failureClassification}`
  }
  const logs = `${report.logs.stdout}\n${report.logs.stderr}`
  if (!logs.includes(check.logPattern)) return `expected failure log to contain: ${check.logPattern}`
  return null
}

async function runCase(entry, defaults, reportRoot, packageRoot, cacheVolume, toolchainVolumes) {
  const artifacts = new Map()
  const results = []
  for (const [name, relativePath] of Object.entries(entry.fixtures)) {
    artifacts.set(name, await packFixture(resolve(benchmarkRoot, relativePath), packageRoot))
  }
  for (const check of entry.checks) {
    const checkDirectory = join(reportRoot, entry.id, check.id)
    await mkdir(checkDirectory, { recursive: true })
    const config = {
      schema: 1,
      image: defaults.image,
      dshVersion: check.dshVersion,
      pnpmVersion: defaults.pnpmVersion,
      profile: defaults.profile,
      startCommand: defaults.startCommand,
      readyPattern: escapeRegex(check.readyText ?? '__dsh_upgrade_expected_failure_never_ready__'),
      timeoutSeconds: defaults.timeoutSeconds,
      shutdownGraceSeconds: defaults.shutdownGraceSeconds,
      probeCommand: [],
    }
    const { report, jsonPath, markdownPath } = await runDockerSmoke({
      config,
      pluginPath: artifacts.get(check.fixture),
      reportDirectory: checkDirectory,
      cacheVolume,
      toolchainVolume: toolchainVolumes.get(check.dshVersion),
    })
    const error = evaluateCheck(check, report)
    const result = {
      caseId: entry.id,
      checkId: check.id,
      expected: check.expect,
      status: error ? 'failed' : 'passed',
      error,
      smokeStatus: report.status,
      failureClassification: report.failureClassification,
      report: { jsonPath, markdownPath },
    }
    results.push(result)
    const detail = error
      ?? (check.expect === 'fail'
        ? `expected ${check.failureClassification} failure observed`
        : 'smoke passed')
    console.log(`${error ? 'FAIL' : 'PASS'} ${entry.id}/${check.id}: ${detail}`)
  }
  return results
}

function renderSummary(results) {
  const lines = ['# DSH migration integration summary', '', '| Case | Check | Expected | Result |', '|---|---|---|---|']
  for (const result of results) {
    lines.push(`| ${result.caseId} | ${result.checkId} | ${result.expected} | ${result.status}${result.error ? `: ${result.error}` : ''} |`)
  }
  lines.push('')
  return lines.join('\n')
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv)
  if (options.help) {
    console.log(usage())
    return 0
  }
  const data = await loadCases()
  console.log(`DSH case definitions OK: ${data.cases.length} case, ${data.cases.flatMap((entry) => entry.checks).length} checks`)
  if (options.check) return 0

  const selected = options.all
    ? data.cases
    : data.cases.filter((entry) => options.caseIds.includes(entry.id))
  const selectedIds = new Set(selected.map((entry) => entry.id))
  const missing = options.caseIds.filter((id) => !selectedIds.has(id))
  if (missing.length) throw new Error(`unknown case ID: ${missing.join(', ')}`)

  // Keep bind-mounted artifacts below the checkout. Docker Desktop and Colima
  // do not necessarily expose the host's system temporary directory to the VM.
  const temporaryBase = join(repositoryRoot, '.artifacts')
  await mkdir(temporaryBase, { recursive: true })
  const temporaryRoot = await mkdtemp(join(temporaryBase, 'dsh-upgrade-integration-'))
  const reportRoot = options.reportDirectory ?? join(temporaryRoot, 'reports')
  const packageRoot = join(temporaryRoot, 'packages')
  await mkdir(reportRoot, { recursive: true })
  await mkdir(packageRoot, { recursive: true })
  const cacheVolume = `dsh-upgrade-cache-${process.pid}-${Date.now()}`
  const versions = [...new Set(selected.flatMap((entry) => entry.checks.map((check) => check.dshVersion)))]
  const toolchainVolumes = new Map(
    versions.map((version, index) => [version, `dsh-upgrade-toolchain-${process.pid}-${Date.now()}-${index}`]),
  )
  const volumes = [cacheVolume, ...toolchainVolumes.values()]
  const createdVolumes = []
  const results = []
  try {
    for (const volume of volumes) {
      const volumeResult = await runProcess('docker', ['volume', 'create', volume])
      if (volumeResult.error) throw volumeResult.error
      if (volumeResult.exitCode !== 0) {
        throw new Error(`docker volume create failed: ${volumeResult.stderr || volumeResult.stdout}`)
      }
      createdVolumes.push(volume)
    }
    for (const entry of selected) {
      results.push(...(
        await runCase(entry, data.defaults, reportRoot, packageRoot, cacheVolume, toolchainVolumes)
      ))
    }
    await writeFile(join(reportRoot, 'summary.json'), `${JSON.stringify({ schema: 1, results }, null, 2)}\n`, 'utf8')
    await writeFile(join(reportRoot, 'summary.md'), renderSummary(results), 'utf8')
    const failed = results.some((result) => result.status === 'failed')
    console.log(options.reportDirectory || failed ? `Reports: ${reportRoot}` : 'Reports: not retained after successful run')
    return failed ? 1 : 0
  } finally {
    for (const volume of createdVolumes.reverse()) {
      await runProcess('docker', ['volume', 'rm', '--force', volume])
    }
    await rm(packageRoot, { recursive: true, force: true })
    if (options.reportDirectory || !results.some((result) => result.status === 'failed')) {
      await rm(temporaryRoot, { recursive: true, force: true })
    }
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().then(
    (exitCode) => {
      process.exitCode = exitCode
    },
    (error) => {
      console.error(`DSH integration failed: ${error.stack ?? error.message}`)
      process.exitCode = 2
    },
  )
}
