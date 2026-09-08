// Read-only gate and artifact collection; diagnostic grading is independently testable.
import { emit, emitError, fixtureChanges, readAgentText } from './judge-utils.mjs'
import { pathToFileURL } from 'node:url'
import { scoreReport } from './report-grading.mjs'
export { scoreReport, gradeReport } from './report-grading.mjs'
const TASK = 'S3-snapshot-migration'
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) main().catch(error => emitError(error))
async function main() {
  const gate = await fixtureChanges('fixture')
  if (gate.changed === true) return emit(0, ['fixture was modified (read-only discipline): ' + gate.detail])
  if (gate.changed === null) return emitError(new Error('fixture gate unavailable: ' + gate.detail))
  const {text, files} = readAgentText('', TASK)
  const {score, reasons, ...metadata} = scoreReport(text)
  emit(score, ['fixture unchanged', 'read agent report: ' + files.join(', '), ...reasons], metadata)
}
