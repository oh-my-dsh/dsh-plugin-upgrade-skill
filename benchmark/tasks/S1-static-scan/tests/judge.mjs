// S1-static-scan grading: fixture read-only gate + card mapping completeness.
// Expected card set maps the seven touchpoints to corridor cards:
//   #3 apiProxy          → A1-01
//   #2 ignorable event   → A1-02 (removed in alpha.1) + A2-01 (restored in alpha.2) → corridor folding, net state kept
//   #1/#5 session-view split → A1-03
//   #4/#7 host path/wrapper → A1-04
//   #6 loopback HTTP     → A1-08
import { emit, fixtureChanges, readAgentText } from './judge-utils.mjs'

const TASK = 'S1-static-scan'
const EXPECTED_CARDS = ['A1-01', 'A1-02', 'A1-03', 'A1-04', 'A1-08', 'A2-01']
const PER_CARD = 100 / EXPECTED_CARDS.length

main().catch((error) => emit(0, [`judge error: ${error.message}`]))

async function main() {
  const reasons = []

  // Gate: the fixture must remain unchanged.
  const gate = await fixtureChanges('fixture')
  if (gate.changed === true) {
    emit(0, [`fixture was modified, 0 points for this task (read-only discipline): ${gate.detail}`])
  }
  if (gate.changed === null) reasons.push(`warning: ${gate.detail}`)
  else reasons.push('fixture unchanged (read-only discipline passed)')

  // Collect agent output; missing output is treated as 0 points.
  const { text, files } = readAgentText('', TASK)
  if (!text.trim()) {
    emit(0, [...reasons, `no report found under /app/agent-output/${TASK}/, treated as 0 points`])
  }
  reasons.push(`read agent report: ${files.join(', ')}`)

  // Card mapping: both A1-01 and DSH-0.1.2-A1-01 forms are allowed; the word boundary prevents A1-010 false matches.
  let score = 0
  for (const card of EXPECTED_CARDS) {
    const pattern = new RegExp(`(?:DSH-0\\.1\\.2-)?${card.slice(0, 2)}-${card.slice(3)}\\b`)
    if (pattern.test(text)) {
      score += PER_CARD
      reasons.push(`card ${card} present`)
    } else {
      reasons.push(`missing card ${card} (-${Math.round(PER_CARD)} points)`)
    }
  }

  emit(score, reasons)
}
