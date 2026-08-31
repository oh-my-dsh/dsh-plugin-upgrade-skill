// H1-plane-trap grading: the plane trap = the comment lures you into injecting remote.
//   Static gate: if the fixture source injects "remote" but not "llm", the score is capped at 20;
//   container cold boot activated 100 / changed but pending 40 / add failed 30 / unchanged 0.
// The result is emitted after try/finally — process.exit() inside emit() would skip the finally cleanup.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { addPlugin, bootHeadless, cleanupProfile, createProfile, dshAvailable, emit, fixtureChanges, FIXTURE_DIR, HEADLESS_ACTIVATED_SIGNAL, NEGATIVE_SIGNAL } from './judge-utils.mjs'

const TASK = 'H1-plane-trap'
const FIXTURE = FIXTURE_DIR

main().catch((error) => emit(0, [`judge error: ${error.message}`]))

function collectSource(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...collectSource(path))
    else if (/\.(js|ts|mjs|cjs)$/.test(entry)) out.push(readFileSync(path, 'utf8'))
  }
  return out.join('\n')
}

async function main() {
  const reasons = []

  const gate = await fixtureChanges('fixture')
  if (gate.changed !== true) {
    emit(0, [`fixture unchanged (${gate.detail}); treated as 0 points`])
  }
  reasons.push('fixture was modified by the agent')

  // Static plane check: inject contains remote but not llm → cap of 20.
  const source = collectSource(FIXTURE)
  const hasRemote = /["']remote["']/.test(source)
  const hasLlm = /["']llm["']/.test(source)
  let cap = 100
  if (hasRemote && !hasLlm) {
    cap = 20
    reasons.push(`code injects "remote" but not "llm" — fell into the plane trap (misled by the comment); score capped at 20`)
  } else if (hasLlm) {
    reasons.push('code injects llm (not misled by the comment)')
  }

  if (!(await dshAvailable())) {
    emit(0, [...reasons, 'dsh unavailable in the container; runtime judgment impossible, treated as 0 points'])
  }

  const profile = 'bench-h1-plane-trap'
  const tmp = '/tmp/bench-h1-plane-trap'
  let result = { score: Math.min(cap, 40), reasons }
  try {
    const created = await createProfile(profile, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless'])
    if (!created.ok) result = { score: 0, reasons: [...reasons, created.detail] }
    else {
      const added = await addPlugin(profile, FIXTURE)
      if (!added.ok) result = { score: Math.min(cap, 30), reasons: [...reasons, `dsh plugin add failed: ${added.detail}`] }
      else {
        reasons.push('dsh plugin add succeeded')

        const boot = await bootHeadless(profile)
        if (NEGATIVE_SIGNAL.test(boot.output)) {
          const hit = boot.output.match(/pending \(waiting for service: [^)]+\)/)?.[0] ?? 'plugin tree failed'
          result = { score: Math.min(cap, 40), reasons: [...reasons, `cold boot failed: ${hit} (changed but still pending; 40-point tier)`] }
        } else if (HEADLESS_ACTIVATED_SIGNAL.test(boot.output)) {
          result = { score: cap, reasons: [...reasons, cap === 100
            ? 'cold boot activated successfully: inject llm is correct and the plugin tree has no pending'
            : `cold boot activated successfully, but the static plane gate was triggered; counted as ${cap}`] }
        } else {
          result = { score: Math.min(cap, 40), reasons: [...reasons, `cold boot output cannot confirm activation: ${boot.output.trim().slice(0, 200)}`] }
        }
      }
    }
  } finally {
    await cleanupProfile(profile, tmp)
  }
  emit(result.score, result.reasons)
}
