import { emitError } from './judge-result.mjs'
// S11-mermaid-lazyload-trap grading: fixture read-only gate + five diagnosis aspects.
// Expected diagnosis (skills/plugin-heavy-dep checklist applied to the evidence):
//   1. Split chunks: a dynamically imported chunk's sibling imports resolve as URLs relative
//      to the chunk's own URL; the bundler's default code-splitting emits content-hashed
//      siblings that must each be served — unshipped/unrouted siblings 404 and the whole
//      import fails. Fix: bundle ONE self-contained file (code-splitting off).
//   2. Windows 403: realpathSync normalized the drive letter to lowercase (e:\...) while
//      LIB_DIR keeps the installed case (E:\...); the case-sensitive startsWith then
//      misjudges a contained path as escaping → 403. Linux (case-sensitive fs, consistent
//      casing) passes — the bug is in the comparison, not the platform.
//   3. Fix: path.relative-based containment (result must not be '' / start with '..' / be
//      absolute) — robust to case and separator differences; plus the JavaScript MIME
//      requirement for dynamic imports.
//   4. Modal ownership: the pane's Ctrl+wheel listener (document capture) and the modal's
//      wheel listener both fire for one gesture; the pane handler must stand down while the
//      modal is open (presence check), and the modal must preventDefault+stopPropagation.
//   5. Regression coverage: chunk-import failure → fallback rendering; sanitizer if any;
//      containment serves a case-differing contained path and refuses real escapes; modal
//      open → pane font handler inert.
import { emit, fixtureChanges, readAgentText } from './judge-utils.mjs'

const TASK = 'S11-mermaid-lazyload-trap'

const ASPECTS = [
  { key: 'split-chunk siblings resolve relative to the chunk URL; bundle one file', pattern: /(relative|against|resolve[sd]?)[\s\S]{0,120}(chunk|module)[\s\S]{0,160}(url|404)|(single|one)[\s\S]{0,60}(file|self-contained)[\s\S]{0,120}(bundle|chunk)/i, points: 20 },
  { key: 'Windows 403: realpath drive-letter case vs case-sensitive startsWith', pattern: /(realpath|drive)[\s\S]{0,160}(case|lower|upper|e\\:|E\\:)|startsWith[\s\S]{0,140}(case|sensitive)|403[\s\S]{0,200}(case|guard|startsWith)/i, points: 20 },
  { key: 'fix: path.relative containment (+ js MIME for dynamic import)', pattern: /(path\.relative|relative\()[\s\S]{0,160}(contain|escape|\.\.|absolute)|containment[\s\S]{0,120}(relative)/i, points: 20 },
  { key: 'modal owns all wheel events; pane Ctrl+wheel stands down while open', pattern: /(modal|overlay)[\s\S]{0,200}(own|stand down|skip|inert|yield|not fire)|ctrl[\s\S]{0,80}wheel[\s\S]{0,160}(modal|both|double|conflict)/i, points: 20 },
  { key: 'regression: import-failure fallback + containment case test + modal inertness', pattern: /(fallback|fall back)[\s\S]{0,200}(import|chunk)|(regression|test)[\s\S]{0,160}(contain|403|case)/i, points: 20 },
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
