// M3-session-projection grading: compose the profile from the agent-modified fixture and cold boot.
//   100 — the composed tree activates (MISSING_CREDENTIAL without a key) AND still provides
//         the todo tool (the final composition must not drop the capability — dodging scores 0);
//    40 — the fixture changed but the boot still shows pending / plugin tree failed;
//    30 — installing a fixture-declared bundle failed;
//     0 — fixture unchanged, or the todo tool vanished from the final composition.
import { existsSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import {
  bootHeadless,
  dshAvailable,
  emit,
  fixtureChanges,
  HEADLESS_ACTIVATED_SIGNAL,
  NEGATIVE_SIGNAL,
  localExec,
} from './judge-utils.mjs'

const TASK = 'M3-session-projection'
const PROFILE = 'bench-m3-session-projection'
const PROFILE_DIR = `/root/.dsh/profiles/${PROFILE}`

main().catch((error) => emit(0, [`judge error: ${error.message}`]))

async function main() {
  const reasons = []

  const gate = await fixtureChanges('fixture')
  if (gate.changed !== true) {
    emit(0, [`fixture unchanged (${gate.detail}), graded as 0`])
  }
  reasons.push('fixture was modified by the agent')

  let pkg
  try {
    pkg = JSON.parse(readFileSync('/app/fixture/package.json', 'utf8'))
  } catch (error) {
    emit(0, [...reasons, `failed to parse fixture package.json: ${error.message}`])
  }
  const bundles = pkg?.dsh?.profile?.bundles
  if (!Array.isArray(bundles) || bundles.length === 0) {
    emit(0, [...reasons, 'fixture package.json declares no dsh.profile.bundles; graded as 0'])
  }
  if (!existsSync('/app/fixture/cordis.patch.yml')) {
    emit(0, [...reasons, 'fixture cordis.patch.yml is missing; graded as 0'])
  }
  reasons.push(`composing profile ${PROFILE} from fixture bundles: ${bundles.join(', ')}`)

  if (!(await dshAvailable())) {
    emit(0, [...reasons, 'dsh unavailable; runtime verification treated as failed'])
  }

  let score = 0
  try {
    const built = await localExec(
      `rm -rf '${PROFILE_DIR}' && mkdir -p '${PROFILE_DIR}' && cp /app/fixture/package.json '${PROFILE_DIR}/package.json' && cp /app/fixture/cordis.patch.yml '${PROFILE_DIR}/cordis.patch.yml' && printf '[]\\n' > '${PROFILE_DIR}/cordis.yml' && printf 'packages:\\n  - .\\n\\nnodeLinker: hoisted\\nautoInstallPeers: false\\n' > '${PROFILE_DIR}/pnpm-workspace.yaml'`,
    )
    if (built.code !== 0) {
      emit(0, [...reasons, `profile build failed: ${built.stderr.trim().slice(0, 300)}`])
    }

    // Bundles resolve through the dsh installation's module fallback (the global
    // dsh@0.1.2-alpha.2 tree ships all bundle packages) — no manual install needed;
    // the profile layer only needs the fixture's package.json + patch files.
    {
      reasons.push('bundle packages resolve through the dsh installation fallback; profile composed from fixture files')
      const boot = await bootHeadless(PROFILE)
      if (NEGATIVE_SIGNAL.test(boot.output)) {
        const hit = boot.output.match(/pending \(waiting for service: [^)]+\)/)?.[0] ?? 'plugin tree failed'
        score = 40
        reasons.push(`cold boot failed: ${hit} (changed but still broken; 40-point tier)`)
      } else if (HEADLESS_ACTIVATED_SIGNAL.test(boot.output)) {
        const dump = await localExec(`dsh --profile '${PROFILE}' --dump-config 2>&1`, { timeout: 60000 })
        const todoPresent = /@deepseek-ai\/dsh-tool-todo/.test(dump.stdout + dump.stderr)
        if (todoPresent) {
          score = 100
          reasons.push('cold boot activated (MISSING_CREDENTIAL expected without a key) and the final composition still provides dsh-tool-todo (+100)')
        } else {
          score = 0
          reasons.push('cold boot activated but dsh-tool-todo vanished from the final composition — the capability was dropped, graded as 0 (dodging)')
        }
      } else {
        score = 40
        reasons.push(`cold boot output cannot confirm activation: ${boot.output.trim().slice(0, 200)}`)
      }
    }
  } finally {
    await localExec(`rm -rf '${PROFILE_DIR}' /tmp/bench-m3-session-projection-boot.log; true`)
  }
  emit(score, reasons)
}
