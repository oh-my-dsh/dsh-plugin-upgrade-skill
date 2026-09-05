// S17-external-ui-plugin-onboarding-trap grading: fixture read-only gate + five diagnosis aspects.
// Expected (external UI plugin onboarding):
//   1. Root cause: ONE client bundle with raw ESM fails the WHOLE classic-script combo,
//      zero plugins register, and the named entry is only the first awaited import (innocent).
//   2. Diagnosis discipline: bisect insert rows / syntax-check bundles (node --check); the
//      client half must ship as window.__ModuleLoader__.load({id, factory}) with require("react")
//      inside the factory and inject/apply exports.
//   3. Cross-entry slot declaration: bare register of another entry's declared slot races the
//      owner's declaration; wrap with ctx.slots.inject(name, () => ctx.slots.register(...));
//      registrant passes only name/id/order(/label), never kind/scope.
//   4. Dev loop: combo assembled once at boot (no HMR) — every edit needs a full host restart;
//      on Windows kill the process tree (taskkill /PID /T /F) or the next boot dies EADDRINUSE.
//   5. Prevention: startup static scan naming the offending plugin; combo failures attributed to
//      the culprit; authoring template/checklist (no top-level imports, inject wrapper, restart).
import { emit, fixtureChanges, readAgentText } from './judge-utils.mjs'

const TASK = 'S17-external-ui-plugin-onboarding-trap'

const ASPECTS = [
  { key: 'combo root cause: one raw-ESM client bundle fails the whole classic-script combo; zero plugins register; the named entry is only the first awaited import (misattribution)', pattern: /(import|esm)[\s\S]{0,200}(combo|whole|entire|classic|all plugins)[\s\S]{0,220}(fail|compile|syntax)|(typert-registry|first awaited|first entry)[\s\S]{0,220}(innocent|misattribut|not the culprit|named)[\s\S]{0,120}(entry|plugin)/i, points: 20 },
  { key: 'diagnosis discipline: bisect insert rows or syntax-check the bundle; client half ships as __ModuleLoader__.load({id, factory}) with require(react) inside and inject/apply exports', pattern: /(bisect|node --check|syntax.?check)[\s\S]{0,200}(insert|bundle)|(__ModuleLoader__|ModuleLoader)[\s\S]{0,160}(load|factory)[\s\S]{0,200}(require|inject|apply)/i, points: 20 },
  { key: 'slot declaration: wrap cross-entry registration with ctx.slots.inject(name, () => register); registrant only name/id/order(/label), never kind/scope', pattern: /(slots?\.inject|inject\()[\s\S]{0,200}(register|declared|race|order)|(name|id|order)[\s\S]{0,160}(kind|scope)[\s\S]{0,120}(must not|never|not pass|omit)/i, points: 20 },
  { key: 'dev loop: combo assembled once at boot (no HMR) so every edit needs a full host restart; on Windows tree-kill (taskkill /T /F) else EADDRINUSE on next boot', pattern: /(assembl|compose|boot)[\s\S]{0,180}(once|restart|no hmr|hmr)|(taskkill|process tree|eaddrinuse)[\s\S]{0,180}(port|restart|next boot|bind)/i, points: 20 },
  { key: 'prevention: startup static scan naming the offending plugin; combo failure attributed to the culprit; authoring template/checklist', pattern: /(scan|static check|attribute|name the)[\s\S]{0,200}(plugin|culprit|offend|startup)|(template|checklist|authoring)[\s\S]{0,200}(onboard|next|author)/i, points: 20 },
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
