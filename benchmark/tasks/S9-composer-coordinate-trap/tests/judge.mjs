import { emitError } from './judge-result.mjs'
// S9-composer-coordinate-trap grading: fixture read-only gate + five diagnosis aspects.
// Expected diagnosis (one contract misread under two symptoms):
//   1. The two projections named: the published draft/occurrence offsets are CLIPBOARD-text
//      coordinates (a chip = its whole clipboardText), while the insert/consume span guards
//      compare against the DETECT text where a chip is exactly one U+FFFC.
//   2. First-succeeds-then-fails signature: with an empty draft both projections coincide
//      (length 0), so paste #1 applies; after one chip exists the draft-length insertion
//      point overshoots the detect text and the span splice/cas rejects (returns false).
//   3. unavailable chip: consumeToken silently declined (same coordinate mismatch) while the
//      plugin deleted its record anyway; the dock renders record === undefined as
//      'unavailable' and the composer chip never went away.
//   4. Fix direction: convert clipboard coordinates to detect coordinates before both verbs
//      (each earlier chip folds length-1 out of the offset; a chip spans exactly 1 there),
//      at the insert point AND the removal span; retire bookkeeping only when the verb
//      reports success.
//   5. Regression plan: repeat the same interaction twice (two consecutive pastes must both
//      land and coexist) + removal must clear every view (dock + composer + record).
import { emit, fixtureChanges, readAgentText } from './judge-utils.mjs'

const TASK = 'S9-composer-coordinate-trap'

const ASPECTS = [
  { key: 'the two projections named (clipboard vs detect / U+FFFC)', pattern: /clipboard[\s\S]{0,140}(detect|U\+FFFC)|(detect|U\+FFFC)[\s\S]{0,140}clipboard/i, points: 20 },
  { key: 'first-works-then-fails signature explained (coincide when empty; insertion point overshoots)', pattern: /(empty|no (chips?|attachments?))[\s\S]{0,200}(coincide|same|equal|both)|((insertion|insert|span)[\s\S]{0,40}(point|offset))?[\s\S]{0,200}(overshoot|past the|beyond|outside|out of range|exceed)/i, points: 20 },
  { key: 'unavailable traced to the declined verb + early bookkeeping delete', pattern: /(consumeToken|consume)[\s\S]{0,240}(fail|declin|reject|return(s|ed)? false|no-?op|silent)|(record|map)[\s\S]{0,140}(deleted?|removed?)[\s\S]{0,140}unavailable/i, points: 20 },
  { key: 'fix: convert coordinates before both verbs (chip folds length-1 / spans one char)', pattern: /((length|chip)[\s\S]{0,50}[-−—]\s*1|fold|convert|map|shift|recomput)[\s\S]{0,180}(detect|coordinate|offset|span|projection)/i, points: 20 },
  { key: 'regression: repeat interaction + removal clears every view', pattern: /(two|second|consecutive|repeat)[\s\S]{0,180}(paste|attachment|insert|chip)[\s\S]{0,260}(coexist|both|still|remain|assert|removed|cleared|disappear)/i, points: 20 },
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
