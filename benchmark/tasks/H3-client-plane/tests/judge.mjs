// H3-client-plane grading: the dsh.client plane contract of a browser plugin.
//   40 pts — package.json gains the top-level "dsh": {"client": {...}} declaration the
//             alpha requires (an object with platform "web"; declared but platform
//             missing → 20 — it fails loudly);
//   20 pts — in-container `dsh plugin add` succeeds (10) + host half cold boots with
//            no pending (10);
//   40 pts — the plugin appears in __DSH_BOOT__.entries after a web cold boot (real
//            recognition in the browser roster);
//    0 pts — fixture unchanged.
// Boundary (the browser half is not executed): there is no browser in the container, so
// client.js runtime behavior is not graded; only "the host's announced boot graph lists
// it as an entry" is judged — exactly one of the acceptance anchors DSH-0.1.2-A1-19
// requires. Results are emitted after try/finally — process.exit() inside emit() would
// skip the finally cleanup.
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

const TASK = 'H3-client-plane'
const PKG = '@demo/dsh-bench-paste'

main().catch((error) => emit(0, [`judge error: ${error.message}`]))

async function main() {
  const reasons = []

  const gate = await fixtureChanges('fixture')
  if (gate.changed !== true) {
    emit(0, [`fixture unchanged (${gate.detail}), graded as 0`])
  }
  reasons.push('fixture was modified by the agent')

  // 1. Static: the dsh.client declaration.
  let pkg
  try {
    pkg = JSON.parse(readFileSync(join(FIXTURE_DIR, 'package.json'), 'utf8'))
  } catch (error) {
    emit(0, [...reasons, `failed to parse package.json: ${error.message}`])
  }
  const clientDecl = pkg?.dsh?.client
  let score = 0
  if (clientDecl && typeof clientDecl === 'object' && clientDecl.platform === 'web') {
    score += 40
    reasons.push('package.json has a top-level dsh.client declaration with platform=web (+40)')
  } else if (clientDecl && typeof clientDecl === 'object') {
    score += 20
    reasons.push('package.json has dsh.client but platform is missing/not web (+20; boot will fail loudly)')
  } else {
    reasons.push('package.json still lacks the top-level dsh.client declaration (+0; not recognized in the browser roster)')
  }

  if (!(await dshAvailable())) {
    emit(score, [...reasons, 'dsh unavailable; runtime verification treated as failed'])
  }

  // 2/3. Container: add + web cold boot + boot entries.
  const profile = 'bench-h3'
  const tmp = '/tmp/bench-h3'
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
          score += 40
          reasons.push('__DSH_BOOT__.entries contains this plugin — real recognition in the browser roster (+40)')
        } else if (boot.html) {
          reasons.push('__DSH_BOOT__.entries does not contain this plugin — the host did not recognize the dsh.client declaration (+0)')
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
