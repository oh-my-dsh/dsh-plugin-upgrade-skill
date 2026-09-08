import { emitError } from './judge-result.mjs'
// S14-link-install-lock-trap grading: fixture read-only gate + five diagnosis aspects.
// Expected (link-installed lib-only plugin rollout failure):
//   1. Junction semantics: the profile entry IS the repo working tree; copying repo files
//      into node_modules was never necessary (and is harmful) for a link install.
//   2. Lock attribution: the EBUSY holder is the RUNNING DSH HOST process (not the
//      browser, which is why closing the tab did not help); the stale client code after
//      refresh is browser cache of client.js (needs hard refresh).
//   3. Rename-aside mechanism + recovery: both paths are the same directory through the
//      junction, so the rename moved the only copy; recovery = rename .old2 back,
//      node --check, then activate.
//   4. Ordered activation: stop host fully -> restart dsh web -> hard-refresh browser ->
//      verify loaded (version marker / feature / console).
//   5. Pre-flight install-mode check: LinkType/Target (or cordis.patch.yml link: marker)
//      BEFORE any file operation; generic copy-into-node_modules advice is for copied
//      installs only.
import { emit, fixtureChanges, readAgentText } from './judge-utils.mjs'

const TASK = 'S14-link-install-lock-trap'

const ASPECTS = [
  { key: 'junction semantics: repo tree IS the installed copy; copy was never needed', pattern: /(junction|link)[\s\S]{0,300}(same (directory|tree|files)|installed copy|is the (repo|working tree)|no copy|nothing to copy|never (be )?necessar|harmful)/i, points: 20 },
  { key: 'lock owners: running dsh host holds the lib files (not the browser); browser cache needs hard refresh', pattern: /(host|dsh (web )?process|node process)[\s\S]{0,220}(holds?|lock|open|handle|file lock|EBUSY)/i, points: 20 },
  { key: 'rename-aside same-directory mechanism + rename-back recovery', pattern: /(same directory|one (physical )?copy|junction)[\s\S]{0,260}(rename|old2|restore|back to)|rename[\s\S]{0,200}(back|restore|original name)/i, points: 20 },
  { key: 'ordered activation: full host stop -> restart -> hard refresh -> verify', pattern: /(stop|quit|exit|fully? stop)[\s\S]{0,240}(host|dsh)[\s\S]{0,300}(restart|relaunch)[\s\S]{0,300}(hard[- ]refresh|cache bypass|Ctrl\+Shift\+R)/i, points: 20 },
  { key: 'pre-flight install-mode check (LinkType/Target or patch.yml link marker)', pattern: /(LinkType|Target|patch\.yml|link:)[\s\S]{0,240}(before|first|pre-?flight|check|determin)/i, points: 20 },
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
