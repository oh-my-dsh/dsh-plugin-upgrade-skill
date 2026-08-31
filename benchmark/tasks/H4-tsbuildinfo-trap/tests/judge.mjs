// H4-tsbuildinfo-trap grading: src read-only gate + three false-positive attribution points + trap cap.
// Points (migration-hygiene §1 + DSH-0.1.2-A1-21 field notes):
//   - the error comes from stale build artifacts/incremental cache (resolveSessionPreset
//     left over in lib/index.js and lib/tsconfig.tsbuildinfo), not a real source reference;
//   - correct remediation = pnpm run clean, then rebuild, with zero source changes;
//   - the trap = "fixing" a non-existent reference per the DSH-0.1.2-A1-21 migration
//     recipe (changing the source scores 0).
import { emit, fixtureChanges, readAgentText } from './judge-utils.mjs'

const TASK = 'H4-tsbuildinfo-trap'
const TRAP = /resolveRecordedPreset|presets\//

main().catch((error) => emit(0, ['judge error: ' + error.message]))

async function main() {
  const reasons = []

  // Gate: src must stay completely unchanged (lib/ may be cleaned).
  const gate = await fixtureChanges('fixture/src')
  if (gate.changed === true) {
    emit(0, ['src was modified; this task scores 0 (trap hit: the source never needed migration): ' + gate.detail])
  }
  if (gate.changed === null) reasons.push('warning: ' + gate.detail)
  else reasons.push('src was not modified (gate passed)')

  const { text, files } = readAgentText('', TASK)
  if (!text.trim()) {
    emit(0, [...reasons, 'no report found under /app/agent-output/' + TASK + '/; graded as 0'])
  }
  reasons.push('read agent report: ' + files.join(', '))

  let score = 0
  const hasConclusion = /零引用|没有(任何)?(真实)?引用|并非(真实)?(引用|依赖)|不是真实|伪报错|无需(改动|修改|迁移)|zero references?|no (real )?references?|not (a |from a )?real (reference|dependency)|not referenced|false (error|positive)|phantom error|no (source )?change(s)? (needed|required)|no need to (change|modify|migrate)|does not need to be (changed|modified|migrated)/i.test(text)
  if (/tsbuildinfo|增量缓存|构建缓存|陈旧|stale|假阳性|incremental cache|build cache|false positive/i.test(text)) {
    score += 30; reasons.push('point hit: "identified the build cache/artifact false positive" (+30)')
  } else { reasons.push('point missing: "identified the build cache/artifact false positive" (-30)') }
  if (/clean/i.test(text)) {
    score += 30; reasons.push('point hit: "clean then rebuild remediation" (+30)')
  } else { reasons.push('point missing: "clean then rebuild remediation" (-30)') }
  if (hasConclusion) {
    score += 40; reasons.push('point hit: "explicit conclusion that the source needs no changes" (+40)')
  } else { reasons.push('point missing: "explicit conclusion that the source needs no changes" (-40)') }

  // Trap cap: triggers only when the report "fixes" per the DSH-0.1.2-A1-21 recipe without
  // reaching the "source needs no changes" conclusion; quoting the card verbatim (including
  // literals like presets/) alongside the correct conclusion does not false-positive.
  if (TRAP.test(text) && !hasConclusion) {
    score = Math.min(score, 30)
    reasons.push('trap hit: the report "fixed" a non-existent reference per the DSH-0.1.2-A1-21 recipe; capped at 30')
  }

  emit(score, reasons)
}
