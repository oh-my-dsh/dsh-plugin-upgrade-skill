// S18-terminal-sprite-render-trap grading: fixture read-only gate + five diagnosis aspects.
// Expected (terminal half-block sprite render trap):
//   1. Phantom pixels: half-filled cells (one empty half) leave the previous cell's SGR
//      background set; the stale background paints the empty half; fix = explicit bg
//      reset (ESC[49m) on half-filled cells.
//   2. Ghost frames: rows trimmed at trailing transparent cells let a narrower frame leave
//      the previous frame's pixels; fix = full-sprite-width rows + erase-to-EOL (ESC[K).
//   3. Frame data drift: hand-ported frame diverges from source art (23 cells / 6-pixel
//      tail-tip cluster); excerpt regression missed it; fix = digest ALL frames vs source.
//   4. Hang: rescheduling timer chain (planner setTimeout forever while mounted) pins
//      probe hosts that mount without unmount; fix = timer.unref(); interactive TUI is
//      kept alive by TTY/stdin handles.
//   5. Prevention: renderer contract checklist (half-cell bg reset, full-width rows,
//      erase-to-EOL, digest parity gate) + default-on rollout audit of probe timers.
import { emit, fixtureChanges, readAgentText } from './judge-utils.mjs'

const TASK = 'S18-terminal-sprite-render-trap'

const ASPECTS = [
  { key: 'phantom pixels: half-filled cell leaves previous SGR background set (persists across cells); fix = explicit background reset on half-filled cells', pattern: /(half|half.?filled|empty half)[\s\S]{0,200}(background|bg|sgr)[\s\S]{0,200}(persist|leak|stale|reset|49m)|(49m|background reset)[\s\S]{0,160}(half|phantom)/i, points: 20 },
  { key: 'ghost frames: trailing-transparent trim lets a narrower frame leave previous pixels; fix = full-width rows + erase-to-EOL', pattern: /(trim|trailing|narrower|full width|full-width)[\s\S]{0,200}(ghost|previous frame|survive|erase|eol|k)|(erase|eol|k)[\s\S]{0,160}(frame switch|switch|clean)/i, points: 20 },
  { key: 'frame data drift: hand-ported tail2 diverges from source art (excerpt regression missed it); fix = digest ALL frames against the source and assert', pattern: /(digest|sha|parity)[\s\S]{0,200}(all|every|22|frames)[\s\S]{0,160}(source|art|assert|drift)|(drift|hand.?ported|excerpt)[\s\S]{0,200}(digest|all frames)/i, points: 20 },
  { key: 'hang: rescheduling timer chain (planner setTimeout forever while mounted) pins probe hosts that never unmount; fix = timer.unref(); interactive TUI kept alive by TTY/stdin', pattern: /(unref|timer|timeout|settimeout)[\s\S]{0,220}(pin|event loop|alive|hang|drain)|(mount|unmount|probe)[\s\S]{0,200}(unref|timer|hang)/i, points: 20 },
  { key: 'prevention: renderer contract checklist (half-cell bg reset, full-width rows, erase-to-EOL, digest parity gate) + default-on rollout audit of probe timers', pattern: /(checklist|contract|audit)[\s\S]{0,240}(renderer|render|rollout|default|timer|probe)|(default.?on|rollout)[\s\S]{0,200}(audit|timer|probe)/i, points: 20 },
]

main().catch((error) => emit(0, ['judge error: ' + error.message]))

async function main() {
  const reasons = []
  const gate = await fixtureChanges('fixture')
  if (gate.changed === true) {
    emit(0, ['fixture was modified, 0 points for this task (read-only discipline): ' + gate.detail])
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
      reasons.push('hit aspect: ' + aspect.key + ' (+' + aspect.points + ')')
    } else {
      reasons.push('missing aspect: ' + aspect.key + ' (-' + aspect.points + ')')
    }
  }
  emit(score, reasons)
}
