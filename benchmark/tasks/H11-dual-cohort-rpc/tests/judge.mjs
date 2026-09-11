import { emitError } from './judge-result.mjs'
// H11 grading uses two exact published HostConnectionService implementations.
// Points: candidate import 10, unit regression 10, rc.2 real registration 20,
// newer real registration 20, exact authority policy 30, branch-free source 10.
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import {
  authorityPolicyMatches,
  formatAuthorities,
  inspectBranching,
  registrationsFromCalls,
  sameMembers,
} from './judge-utils.mjs'

const FIXTURE = '/app/fixture'
const EXPECTED_CHANNELS = [
  '/mnemon.read',
  '/mnemon.activation',
  '/mnemon.write',
  '/mnemon.settings',
]
const EXPECTED_AUTHORITIES = {
  'read-only': {
    '/mnemon.read': 'trusted-host',
    '/mnemon.activation': 'trusted-host',
    '/mnemon.write': 'loopback',
    '/mnemon.settings': 'loopback',
  },
  'trusted-host': {
    '/mnemon.read': 'trusted-host',
    '/mnemon.activation': 'trusted-host',
    '/mnemon.write': 'trusted-host',
    '/mnemon.settings': 'trusted-host',
  },
}
const COHORTS = [
  { name: 'rc2', root: '/opt/dsh-cohorts/rc2', version: '0.1.1-rc.2' },
  { name: 'alpha2', root: '/opt/dsh-cohorts/alpha2', version: '0.1.2-alpha.2' },
]

main().catch(emitError)

async function main() {
  const reasons = []
  const changed = await fixtureChanged()
  if (!changed.ok) emit(0, [changed.detail])
  reasons.push(changed.detail)

  let candidate
  try {
    candidate = await import(`${pathToFileURL(`${FIXTURE}/src/register.js`).href}?judge=${Date.now()}`)
  } catch (error) {
    emit(0, [...reasons, `candidate import failed: ${error instanceof Error ? error.message : String(error)}`])
  }
  if (typeof candidate.registerMnemonChannels !== 'function') {
    emit(0, [...reasons, 'required export registerMnemonChannels(connection, config) is missing'])
  }

  let score = 10
  reasons.push('candidate imports and preserves registerMnemonChannels')

  const unit = await run('npm', ['test'], FIXTURE, 60000)
  if (unit.code === 0) {
    score += 10
    reasons.push('candidate mock regression tests pass')
  } else {
    reasons.push(`candidate tests fail: ${tail(unit.stdout + unit.stderr, 240)}`)
  }

  const probes = new Map()
  for (const cohort of COHORTS) {
    const integrity = await cohortVersion(cohort)
    if (!integrity.ok) emit(0, [...reasons, integrity.detail])
    for (const remoteAccess of ['read-only', 'trusted-host']) {
      probes.set(`${cohort.name}:${remoteAccess}`, await probe(
        candidate.registerMnemonChannels,
        cohort,
        remoteAccess,
      ))
    }
  }

  for (const cohort of COHORTS) {
    const cohortProbes = ['read-only', 'trusted-host'].map((mode) => probes.get(`${cohort.name}:${mode}`))
    if (cohortProbes.every((result) => result.registrationOk)) {
      score += 20
      reasons.push(`${cohort.name}: both configs register all four routes through real HostConnectionService`)
    } else {
      for (const result of cohortProbes.filter((item) => !item.registrationOk)) {
        reasons.push(`${cohort.name}/${result.remoteAccess}: ${result.error}`)
      }
    }
  }

  let policyPasses = 0
  for (const remoteAccess of ['read-only', 'trusted-host']) {
    const expected = EXPECTED_AUTHORITIES[remoteAccess]
    const expectedRegistrations = Object.entries(expected)
      .map(([channel, authority]) => ({ channel, authority }))
    const expectedDescription = formatAuthorities(expectedRegistrations)
    const results = COHORTS.map((cohort) => probes.get(`${cohort.name}:${remoteAccess}`))
    const ok = results.every((result) => authorityPolicyMatches(result, expected))
    if (ok) {
      policyPasses += 1
      reasons.push(`${remoteAccess}: one call shape preserves per-channel authorities ${expectedDescription}`)
    } else {
      for (const [index, result] of results.entries()) {
        if (!authorityPolicyMatches(result, expected)) {
          reasons.push(`${COHORTS[index].name}/${remoteAccess}: expected authorities ${expectedDescription}, got ${formatAuthorities(result.registrations)}`)
        }
      }
    }
  }
  score += policyPasses * 15

  const branchCheck = await inspectBranching(`${FIXTURE}/src`)
  if (branchCheck.ok) {
    score += 10
    reasons.push('source uses no version, arity, source-text, or exception-retry cohort branch')
  } else {
    reasons.push(`branch-free gate failed: ${branchCheck.hits.join(', ')}`)
  }

  emit(score, reasons)
}

async function probe(register, cohort, remoteAccess) {
  const calls = []
  const routes = []
  try {
    const connectionModule = await import(pathToFileURL(
      `${cohort.root}/node_modules/@deepseek-ai/dsh-client-connection/lib/index.js`,
    ))
    const cordisModule = await import(pathToFileURL(
      `${cohort.root}/node_modules/@deepseek-ai/cordis/lib/index.js`,
    ))
    const context = new cordisModule.Context()
    context.provide('webServer', {
      register(route) {
        routes.push(route.path)
        return () => { routes.splice(routes.indexOf(route.path), 1) }
      },
    })
    const service = new connectionModule.HostConnectionService(context, ['trusted.example'], {
      isAuthenticated: () => true,
      authorizeIndex: () => true,
      authenticatedUrl: value => value,
    })
    const realRpc = service.rpc
    const recordingConnection = {
      rpc: {
        handle(...args) {
          calls.push(args)
          return realRpc.handle(...args)
        },
      },
    }
    await register(recordingConnection, { remoteAccess })
    const channels = calls.map((args) => args[0])
    const registrationOk = sameMembers(channels, EXPECTED_CHANNELS)
      && sameMembers(routes, EXPECTED_CHANNELS)
    return {
      remoteAccess,
      registrationOk,
      registrations: registrationsFromCalls(calls),
      error: registrationOk
        ? undefined
        : `expected call/route set ${EXPECTED_CHANNELS.join(', ')}; calls=${channels.join(', ') || 'none'} routes=${routes.join(', ') || 'none'}`,
    }
  } catch (error) {
    return {
      remoteAccess,
      registrationOk: false,
      registrations: registrationsFromCalls(calls),
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function cohortVersion(cohort) {
  try {
    const pkg = JSON.parse(await readFile(
      `${cohort.root}/node_modules/@deepseek-ai/dsh-client-connection/package.json`,
      'utf8',
    ))
    return pkg.version === cohort.version
      ? { ok: true }
      : { ok: false, detail: `${cohort.name} package version changed: ${String(pkg.version)}` }
  } catch (error) {
    return { ok: false, detail: `${cohort.name} package integrity check failed: ${error.message}` }
  }
}

async function fixtureChanged() {
  const result = await run('git', ['status', '--porcelain', '--', 'fixture'], '/app', 20000)
  if (result.code !== 0) throw new Error(`fixture baseline unavailable: ${tail(result.stderr, 200)}`)
  const lines = result.stdout.trim().split('\n').filter(Boolean)
  return lines.length > 0
    ? { ok: true, detail: `fixture changed: ${lines.join('; ')}` }
    : { ok: false, detail: 'fixture unchanged relative to baseline, graded as 0' }
}

function run(file, args, cwd, timeout) {
  return new Promise((resolve) => {
    execFile(file, args, { cwd, timeout }, (error, stdout, stderr) => {
      resolve({ code: typeof error?.code === 'number' ? error.code : error ? 1 : 0, stdout: stdout ?? '', stderr: stderr ?? '' })
    })
  })
}

function tail(text, size) {
  return String(text).trim().slice(-size) || 'no output'
}

function emit(rawScore, reasons) {
  const score = Math.max(0, Math.min(100, Math.round(rawScore)))
  process.stdout.write(`${JSON.stringify({ score, max: 100, reasons })}\n`)
  process.exit(0)
}
