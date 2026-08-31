// S3-snapshot-migration grading: fixture read-only gate + five snapshot read-surface points.
// Expectations (matching the heavy split of the DSH-0.1.2-A1-03 session-view project):
//   1. flat snapshot fields → views.get('chat')?.legacy compatibility projection (step one of the two-step move)
//   2. lifecycle fields (running) → useSession seat
//   3. ClientContext type import → @deepseek-ai/cordis (dsh-client-runtime removed)
//   4. slot registration → ctx.slots.inject(name, () => ctx.slots.register(...))
//   5. report cites the full card DSH-0.1.2-A1-03
import { emit, fixtureChanges, readAgentText } from './judge-utils.mjs'

const TASK = 'S3-snapshot-migration'

const ASPECTS = [
  { key: 'legacy projection', pattern: /views[.]get|[.]legacy|兼容投影|compat projection|compatibility projection/, points: 20 },
  { key: 'useSession lifecycle seat', pattern: /useSession/, points: 20 },
  { key: 'cordis type-import replacement', pattern: /@deepseek-ai\/cordis/, points: 20 },
  { key: 'slots.inject registration', pattern: /slots[.]inject/, points: 20 },
  { key: 'card DSH-0.1.2-A1-03', pattern: /A1-03/, points: 20 },
]

main().catch((error) => emit(0, ['judge error: ' + error.message]))

async function main() {
  const reasons = []

  const gate = await fixtureChanges('fixture')
  if (gate.changed === true) {
    emit(0, ['fixture was modified, 0 points (read-only discipline): ' + gate.detail])
  }
  if (gate.changed === null) reasons.push('warning: ' + gate.detail)
  else reasons.push('fixture unchanged (read-only discipline passed)')

  const { text, files } = readAgentText('', TASK)
  if (!text.trim()) {
    emit(0, [...reasons, 'no report found under /app/agent-output/' + TASK + '/, treated as 0 points'])
  }
  reasons.push('read agent report: ' + files.join(', '))

  let score = 0
  for (const aspect of ASPECTS) {
    if (aspect.pattern.test(text)) {
      score += aspect.points
      reasons.push('point "' + aspect.key + '" present (+' + aspect.points + ')')
    } else {
      reasons.push('missing point "' + aspect.key + '" (-' + aspect.points + ')')
    }
  }

  emit(score, reasons)
}
