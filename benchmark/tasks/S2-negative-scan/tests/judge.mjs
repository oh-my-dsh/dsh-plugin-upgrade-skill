// S2-negative-scan grading:
//   40 points — the hit category (#3 apiProxy) maps correctly to DSH-0.1.2-A1-01;
//   20 points — the report acknowledges the zero-hit categories and accounts for each (no-hit notes);
//   20 points — states the "zero hits ≠ compatible" semantics explicitly;
//   20 points — declares mandatory verification (build/typecheck, real mount/cold boot, functional paths).
// Matches the negative checklist in references/pre-flight.md: heuristic scanning is not a compatibility proof.
import { emit, fixtureChanges, readAgentText } from './judge-utils.mjs'

const TASK = 'S2-negative-scan'

main().catch((error) => emit(0, [`judge error: ${error.message}`]))

async function main() {
  const reasons = []

  const gate = await fixtureChanges('fixture')
  if (gate.changed === true) {
    emit(0, [`fixture was modified, 0 points (this task only requires a report output): ${gate.detail}`])
  }
  if (gate.changed === null) reasons.push(`warning: ${gate.detail}`)

  const { text, files } = readAgentText('', TASK)
  if (!text.trim()) {
    emit(0, [...reasons, `no report found under /app/agent-output/${TASK}/, treated as 0 points`])
  }
  reasons.push(`read agent report: ${files.join(', ')}`)

  let score = 0

  // 1. Correct card mapping: #3 apiProxy → A1-01
  if (/(?:DSH-0\.1\.2-)?A1-01\b/.test(text)) {
    score += 40
    reasons.push('hit category #3 correctly mapped to DSH-0.1.2-A1-01 (+40)')
  } else {
    reasons.push('not mapped to DSH-0.1.2-A1-01 (+0)')
  }

  // 2. Acknowledge the zero-hit categories and account for each
  const hitZero = /零命中|无命中|未命中|0\s*命中|没有命中|no hits?|zero hit/i.test(text)
  if (hitZero) {
    score += 20
    reasons.push('report accounts for the zero-hit touchpoint categories (+20)')
  } else {
    reasons.push('zero-hit touchpoint categories not accounted for (+0)')
  }

  // 3. Zero hits ≠ compatible
  const notCompatible = /不(?:等于|代表|意味)|并非|不能(?:据此|视为|认为)|≠|没有?证明兼容|无法(?:据此)?证明|不构成兼容|不(?:能|可).*兼容|(?:do|does|did) (?:not|n'?t) (?:equal|mean|imply)|(?:not|no) (?:proof|evidence) of|(?:cannot|can'?t) (?:prove|conclude)/i.test(text)
  if (notCompatible) {
    score += 20
    reasons.push('clearly states zero hits does not equal compatibility (+20)')
  } else {
    reasons.push('does not state "zero hits ≠ compatible" (+0)')
  }

  // 4. Mandatory verification
  const mustVerify = /必须验证|还需验证|仍(?:须|需).{0,8}验证|真实挂载|真实验证|冷启动|烟测|build|typecheck|实机|must verify|must-verify|cold boot|cold start|smoke|real mount|live mount/i.test(text)
  if (mustVerify) {
    score += 20
    reasons.push('declares that real verification is required before/after migration (+20)')
  } else {
    reasons.push('does not declare mandatory verification (+0)')
  }

  emit(score, reasons)
}
