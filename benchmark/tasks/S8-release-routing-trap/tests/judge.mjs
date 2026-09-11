import { emitError } from './judge-result.mjs'
// S8-release-routing-trap grading: fixture read-only gate + five diagnosis aspects.
// Expected diagnosis (profile-dependency-management §8 version routing + §9 tag sync):
//   1. Attempt-1: the README-pinned tag v0.9.5 does not exist on the public mirror
//      (the sync script never pushes tags) — not a consumer-side typo.
//   2. Attempt-2: v0.9.7 was built for the alpha.x client API; the consumer's runtime is
//      older (rc.2) and forward-incompatible — symptom useConversation is not a function.
//   3. Remedy for the consumer: install the rc-compatible version v0.9.3.
//   4. Maintainer fix: push tags to all mirrors (release tooling must sync tags).
//   5. Prevention: route the install command by the consumer's DSH version in the docs.
import { emit, fixtureChanges, readAgentText } from './judge-utils.mjs'

const TASK = 'S8-release-routing-trap'

const ASPECTS = [
  { key: 'attempt-1: tag missing on the mirror', pattern: /v0\.9\.5[\s\S]{0,200}(tag|mirror)|(tag|mirror)[\s\S]{0,120}v0\.9\.5|could not resolve/i, points: 20 },
  { key: 'attempt-2: forward-incompatible client API', pattern: /useConversation/i, points: 20 },
  { key: 'version direction identified (alpha.x build on rc.x runtime)', pattern: /(alpha)[\s\S]{0,60}(rc)|rc\.2[\s\S]{0,60}(alpha|incompat)|forward[\s-]?incompat/i, points: 20 },
  { key: 'remedy: install the rc-compatible v0.9.3', pattern: /v0\.9\.3/, points: 20 },
  { key: 'maintainer fix: push/sync tags to all mirrors', pattern: /--tags|tags? sync|sync[\s\S]{0,30}tags|push[\s\S]{0,30}tags|release tooling[\s\S]{0,40}tag/i, points: 20 },
]

main().catch(emitError)

async function main() {
  const reasons = []

  const gate = await fixtureChanges('fixture')
  if (gate.changed === true) {
    emit(0, [`fixture was modified, 0 points for this task (read-only discipline): ${gate.detail}`])
  }
  if (gate.changed === null) emitError(new Error('fixture baseline unavailable: ' + gate.detail))
  else reasons.push('fixture unchanged (read-only discipline passed)')

  const { text, files } = readAgentText('', TASK)
  if (!text.trim()) {
    emit(0, [...reasons, `no report found under /app/agent-output/${TASK}/, treated as 0 points`])
  }
  reasons.push(`read agent report: ${files.join(', ')}`)

  let score = 0
  for (const aspect of ASPECTS) {
    if (aspect.pattern.test(text)) {
      score += aspect.points
      reasons.push(`hit aspect: ${aspect.key} (+${aspect.points})`)
    } else {
      reasons.push(`missing aspect: ${aspect.key} (-${aspect.points})`)
    }
  }

  emit(score, reasons)
}
