import { emitError } from './judge-result.mjs'
// S13-peer-range-vs-runtime grading: fixture read-only gate + five diagnosis aspects.
// Expected diagnosis:
//   1. dsh alpha.4 removed Session.events (the eagerly materialized array) and
//      replaced it with on-demand read APIs: seq, eventAt(), snapshotEvents().
//      The plugin reads session.events (42 references) -> undefined -> not iterable.
//   2. npm peer check passes because ^0.1.2-alpha.2 is satisfied by 0.1.2-alpha.5
//      in semver ordering. Peer range satisfaction is a STATIC package-metadata
//      check: it verifies version bounds, not API presence.
//   3. Peer range satisfaction checks: version ordering (semver), package
//      co-installability. It does NOT check: API surface (removed/renamed
//      methods), behavioral changes (sync to async, return type changes),
//      feature flags. Two categories that pass peers but crash at runtime:
//      (a) API removal (Session.events deleted, method renamed),
//      (b) behavioral/contract change (sync call now async, argument order changed).
//   4. Author should: test against the actual target version (not just the peer
//      floor), and either tighten the peer range to exclude incompatible
//      versions (e.g. <alpha.4) or add a runtime feature-detection guard
//      (typeof session.snapshotEvents === 'function').
//   5. User pre-install check: read the target dsh changelog between the peer
//      floor and the installed version, or grep the plugin source for API
//      surface usage against the target version's type definitions.
import { emit, fixtureChanges, readAgentText } from './judge-utils.mjs'

const TASK = 'S13-peer-range-vs-runtime'

const ASPECTS = [
  { key: 'Session.events removed at alpha.4, replaced by seq/eventAt()/snapshotEvents()',
    pattern: /Session\.events|snapshotEvents|eventAt|alpha\.4/i, points: 20 },
  { key: 'peer range satisfaction is static version-bound check, not API compatibility',
    pattern: /(semver|version.{0,30}(bound|order|range)).{0,200}(API|runtime|compat)|(API|runtime).{0,200}(semver|version.{0,30}(bound|range))/i, points: 20 },
  { key: 'two categories that pass peers but crash: API removal + behavioral/contract change',
    pattern: /(remov|delet|renam).{0,100}(API|method|function)|(behavio|contract|sync|async|argument|return).{0,100}(chang|break)/i, points: 20 },
  { key: 'author should: test against actual target version AND add runtime feature detection or tighten peer range',
    pattern: /(test|verify).{0,60}(actual|target|real).{0,30}version|(feature.?detect|runtime.?guard|typeof|tighten|narrow).{0,60}(peer|range)/i, points: 20 },
  { key: 'user pre-install check: read changelog between peer floor and installed version, or grep plugin source against target API',
    pattern: /(changelog|release.?note).{0,80}(between|from|alpha)|(grep|scan|search|check).{0,60}(source|code|API|type)/i, points: 20 },
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