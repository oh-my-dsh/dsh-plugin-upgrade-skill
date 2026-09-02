// M13-repository-plugins-removal grading: the legacy repository-plugin shape must be
// converted to an npm package (bundle plugin) that installs and activates on
// 0.1.2-alpha.2, and its browser half must be recognized by client-modules.
//   Gate     — fixture unchanged → flat 0 (mutable task).
//   Static   — 50 pts: `dsh.bundle.patch` resolves to a real cordis.patch.yml (15);
//              `exports["./client"]` resolves to a real client entry (10);
//              `dsh.client` declared with platform "web" (10);
//              `main`/`exports["."]` resolves to the real Node entry (5);
//              cordis.patch.yml contains an insert row (10).
//   Legacy   — 10 pts: the Node half no longer contains `httpServer.tapIndex`
//              (the self-executing page-script loading path is gone, per DSH-0.1.1-R1-01).
//   Runtime  — 40 pts: `dsh plugin add` succeeds (10); web cold boot has no pending (10);
//              `__DSH_BOOT__.entries` actually contains this plugin's client (20).
// Boundary (the browser half is not executed): there is no browser in the container,
// so client.js runtime behavior is not graded; "the host's announced boot graph lists
// its client as an entry" is judged — the same acceptance anchor as H3.
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

const TASK = 'M13-repository-plugins-removal'
const PKG = '@demo/dsh-bench-repo'

main().catch((error) => emit(0, [`judge error: ${error.message}`]))

async function main() {
  const reasons = []

  const gate = await fixtureChanges('fixture')
  if (gate.changed !== true) {
    emit(0, [`fixture unchanged (${gate.detail}), graded as 0`])
  }
  reasons.push('fixture was modified by the agent')

  // 1. Static manifest checks.
  let pkg
  try {
    pkg = JSON.parse(readFileSync(join(FIXTURE_DIR, 'package.json'), 'utf8'))
  } catch (error) {
    emit(0, [...reasons, `failed to parse package.json: ${error.message}`])
  }
  let score = 0

  const bundlePatch = pkg?.dsh?.bundle?.patch
  if (typeof bundlePatch === 'string' && bundlePatch && exists(bundlePatch)) {
    score += 15
    reasons.push(`dsh.bundle.patch resolves to a real file (${bundlePatch}) (+15)`)
  } else {
    reasons.push('dsh.bundle.patch is missing or does not resolve to a real file (+0)')
  }

  const clientExport = pkg?.exports?.['./client']
  if (typeof clientExport === 'string' && clientExport && exists(clientExport)) {
    score += 10
    reasons.push(`exports["./client"] resolves to a real client entry (${clientExport}) (+10)`)
  } else {
    reasons.push('exports["./client"] is missing or does not resolve to a real file (+0; the browser half will never be recognized)')
  }

  const clientDecl = pkg?.dsh?.client
  if (clientDecl && typeof clientDecl === 'object' && clientDecl.platform === 'web') {
    score += 10
    reasons.push('dsh.client declares platform=web (+10)')
  } else {
    reasons.push('dsh.client is missing or platform is not web (+0)')
  }

  const mainEntry = pkg?.main ?? pkg?.exports?.['.']
  if (typeof mainEntry === 'string' && mainEntry && exists(mainEntry)) {
    score += 5
    reasons.push(`Node entry resolves to a real file (${mainEntry}) (+5)`)
  } else {
    reasons.push('main / exports["."] is missing or does not resolve to a real file (+0)')
  }

  const patchFile = join(FIXTURE_DIR, 'cordis.patch.yml')
  try {
    const patchText = readFileSync(patchFile, 'utf8')
    if (/- insert:/.test(patchText) && /\n\s+- id:/.test(patchText)) {
      score += 10
      reasons.push('cordis.patch.yml contains an insert row (+10)')
    } else {
      reasons.push('cordis.patch.yml exists but has no insert row (+0)')
    }
  } catch {
    reasons.push('cordis.patch.yml missing (+0)')
  }

  // 2. Legacy loading path removed from the Node half.
  const nodeHalf = findNodeHalf(pkg)
  if (nodeHalf) {
    const nodeText = readFileSync(nodeHalf[0], 'utf8')
    if (/tapIndex/.test(nodeText) || /pet\/ui\.js/.test(nodeText)) {
      reasons.push('Node half still serves the legacy /pet/ui.js + httpServer.tapIndex path (+0)')
    } else {
      score += 10
      reasons.push('legacy /pet/ui.js + httpServer.tapIndex loading path removed (+10)')
    }
  } else {
    reasons.push('cannot locate the Node half source to check legacy removal')
  }

  if (!(await dshAvailable())) {
    emit(score, [...reasons, 'dsh unavailable; runtime verification treated as failed'])
  }

  // 3. Runtime: add + web cold boot + boot entries.
  const profile = 'bench-m13'
  const tmp = '/tmp/bench-m13'
  try {
    const created = await createProfile(profile, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
    if (!created.ok) reasons.push(created.detail)
    else {
      const added = await addPlugin(profile, FIXTURE_DIR)
      if (!added.ok) reasons.push(`dsh plugin add failed: ${added.detail}`)
      else {
        reasons.push('dsh plugin add succeeded')
        score += 10
        reasons.push('plugin installed successfully (+10)')

        const boot = await bootWebAndFetchIndex(profile, PKG)
        if (NEGATIVE_SIGNAL.test(boot.output)) {
          reasons.push(`web cold boot shows a negative signal: ${boot.output.match(/pending \(waiting for service: [^)]+\)|plugin tree failed|ClientPackageCompositionError/)?.[0] ?? 'unknown'}`)
        } else {
          score += 10
          reasons.push('web cold boot: host half has no pending (+10)')
        }

        if (boot.html && boot.html.includes(`${PKG}/client.js`)) {
          score += 20
          reasons.push('__DSH_BOOT__.entries contains this plugin — the browser half is recognized (+20)')
        } else if (boot.html) {
          reasons.push('__DSH_BOOT__.entries does not contain this plugin — client-modules did not recognize the client entry (+0)')
        } else {
          reasons.push(`could not obtain the boot graph page${boot.fetchError ? `: ${boot.fetchError}` : ''} (+0)`)
        }
      }
    }
  } finally {
    await cleanupProfile(profile, tmp)
  }

  emit(score, reasons)
}

function exists(relative) {
  try {
    readFileSync(join(FIXTURE_DIR, relative))
    return true
  } catch {
    return false
  }
}

/** Locate the Node half source file: prefer main / exports["."] resolution, then .dsh-plugin/index.js. */
function findNodeHalf(pkg) {
  for (const candidate of [pkg?.main, pkg?.exports?.['.']].filter((x) => typeof x === 'string')) {
    if (exists(candidate)) return [join(FIXTURE_DIR, candidate), candidate]
  }
  for (const candidate of ['.dsh-plugin/index.js', 'index.js']) {
    try {
      readFileSync(join(FIXTURE_DIR, candidate))
      return [join(FIXTURE_DIR, candidate), candidate]
    } catch {
      /* keep probing */
    }
  }
  return null
}