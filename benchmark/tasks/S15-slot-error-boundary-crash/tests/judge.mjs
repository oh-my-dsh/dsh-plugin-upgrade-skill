import { emitError } from './judge-result.mjs'
// S15-slot-error-boundary-crash grading: fixture read-only gate + five diagnosis aspects.
// Expected (dangling identifier + short-circuit latency + slot error boundary):
//   1. Root cause: the remove button's disabled: A || busy throws ReferenceError (busy
//      is AttachButton's state, not in scope); only evaluated when the phase guard is
//      false AND a chip renders; the slot error boundary unmounts the whole entry so
//      the symptom is 'the dock vanished', error only in the browser console.
//   2. Attribution: the v0.2.11 diff merely first exercised the pre-existing line;
//      correct bisect = rollback/re-add or minimal render mount; the same line shipped
//      in v0.2.10.
//   3. Fix: drop the dangling reference (scope any busy-like state locally); harden
//      with ?? [] reads and closest?.()
//   4. Regression: a render smoke WITH an occurrence present (empty dock returns null
//      before the throwing line; empty-state tests cannot catch this class).
//   5. Process: node --check cannot catch free identifiers; lib-only slot plugins need
//      a data-present render smoke per slot component (and no-undef lint as a net).
import { emit, fixtureChanges, readAgentText } from './judge-utils.mjs'

const TASK = 'S15-slot-error-boundary-crash'

const ASPECTS = [
  { key: 'root cause: free identifier busy (other component scope) + || short-circuit latency + chip-present condition', pattern: /(busy|free identifier|out of[- ]scope|another component)[\s\S]{0,300}(ReferenceError|not defined|throws?|undeclared)/i, points: 20 },
  { key: 'slot error boundary unmounts the whole entry; console-only visibility; symptom is the vanished dock', pattern: /error[- ]boundary[\s\S]{0,300}(unmount|whole|entire|slot|entry|swallow|silent)|console[\s\S]{0,200}(only|visible|never open)/i, points: 20 },
  { key: 'attribution: pre-existing line first exercised by the new feature; bisect via rollback or minimal render mount', pattern: /(pre-?existing|latent|v0\.2\.10|shipped in)[\s\S]{0,260}(same|already|first|exercis|trigger)|(rollback|revert|minimal render|bisect)/i, points: 20 },
  { key: 'fix + hardening: remove dangling ref (scope locally), ?? [] reads, closest?.()', pattern: /(remove|drop|delete|eliminate)[\s\S]{0,200}(dangling|busy|reference|identifier)|(\?\? \[\])|(closest\?\.)/i, points: 20 },
  { key: 'regression + process: data-present render smoke (empty state returns null early); node --check insufficient; no-undef', pattern: /(render smoke|mount)[\s\S]{0,280}(occurrence|chip|data|present|with data)|empty[\s\S]{0,200}(returns? null|early|cannot)|(no-undef|lint)[\s\S]{0,160}(catch|flag|free identifier)?/i, points: 20 },
]

main().catch(emitError)

async function main() {
  const reasons = []
  const gate = await fixtureChanges('fixture')
  if (gate.changed === true) {
    emit(0, ['fixture was modified, 0 points for this task (read-only discipline): ' + gate.detail])
  }
  if (gate.changed === null) emitError(new Error('fixture baseline unavailable: ' + gate.detail))
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
      reasons.push('hit aspect: ' + aspect.key + ' (+' + aspect.points + ')')
    } else {
      reasons.push('missing aspect: ' + aspect.key + ' (-' + aspect.points + ')')
    }
  }
  emit(score, reasons)
}
