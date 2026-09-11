import { emitError } from './judge-result.mjs'
// S10-paste-rename-and-version-chip grading: fixture read-only gate + five design/diagnosis aspects.
// Expected (post-release follow-ups on a lib-only attachment plugin):
//   1. Rename scheme + numbering: images paste_image.<ext>, other pasted files paste_file.<ext>,
//      collisions append (2), (3)… chosen against the occupied name set.
//   2. Authoritative conflict source: the LIVE composer chips (occurrences), not the records
//      cache alone — the alive-subscription retires entries on any momentary empty snapshot,
//      so a cache-only set silently empties and the numbering restarts.
//   3. Scope: only the paste path renames; drag-drop and the file/folder picker keep real names.
//   4. Version chip root cause + rule: the tag endpoint is CDN-cached (x-cache HIT, age; the
//      page predates the push), and the chip displayed the FETCHED tag as truth; it must
//      compare the fetched tag with the running PLUGIN_VERSION and show/update on the newer,
//      never presenting an older fetched tag as "latest".
//   5. Regression + release hygiene: consecutive same-name pastes yield (2)/(3) and coexist,
//      drop/picker names untouched, chip shows the newer of fetched vs running; hand-inlined
//      PLUGIN_VERSION synced with package.json, node --check, hard-refresh delivery (no host
//      update endpoint → update chip copies the install prompt).
import { emit, fixtureChanges, readAgentText } from './judge-utils.mjs'

const TASK = 'S10-paste-rename-and-version-chip'

const ASPECTS = [
  { key: 'rename scheme + sequence numbering (paste_image(2) / paste_file)', pattern: /paste[_ ](image|file|attachment)[\s\S]{0,400}(\(2\)|\(n\)|sequence|numbering|increment|suffix)/i, points: 20 },
  { key: 'authoritative conflict source = live chips/occurrences, cache alone is fragile', pattern: /(live|composer|occurrenc|chip)[\s\S]{0,200}(authoritative|source of truth|conflict|taken|occupied)|(records? (map|cache))[\s\S]{0,220}(retire|momentary|empty|flicker|lost|stale)/i, points: 20 },
  { key: 'paste-only scope: drops and picker keep real names', pattern: /(paste|clipboard)[\s\S]{0,220}(only|just)[\s\S]{0,260}(drop|drag|picker|select)|(drop|drag|picker)[\s\S]{0,200}(keep|preserve|untouched|real name)/i, points: 20 },
  { key: 'version chip: CDN-cached fetched tag shown as truth; compare with running version, show newer', pattern: /(cache|CDN)[\s\S]{0,240}(tag|version|fetch)|(fetched|remote|stale)[\s\S]{0,200}(running|local|PLUGIN_VERSION|ground truth)/i, points: 20 },
  { key: 'regression + release hygiene (same-name pastes coexist, version sync, hard refresh)', pattern: /(same[- ]name|two consecutive|second paste|repeated)[\s\S]{0,300}(coexist|assert|test|\(2\))|(PLUGIN_VERSION|hand-inlined|version constant)[\s\S]{0,240}(sync|package.json|in sync)/i, points: 20 },
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
