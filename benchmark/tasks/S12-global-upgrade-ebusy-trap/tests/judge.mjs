import { emitError } from './judge-result.mjs'
// S12-global-upgrade-ebusy-trap grading: fixture read-only gate + five diagnosis aspects.
// Expected diagnosis:
//   1. EBUSY root cause: the running dsh web HOST PROCESS loaded @koromix/koffi
//      (a native .node addon). The OS holds a file lock on loaded .node binaries until
//      the process exits. A browser page refresh only reloads the SPA; the host process
//      stays alive and the lock persists.
//   2. Downgrade root cause: npm install -g without a version pin resolves to the
//      `latest` dist-tag (0.1.1-rc.2), NOT the currently-installed or newest version.
//      The combined command unseated the pinned alpha.4 install.
//   3. Safe sequence: fully stop dsh (not just refresh) -> npm install -g
//      @deepseek-ai/dsh@0.1.2-alpha.5 (PINNED) -> npm install -g @deepseek-harness-tui/dsh-tui
//      -> restart dsh.
//   4. Prevention: plugin README install commands must always pin the version
//      (e.g. @deepseek-ai/dsh@0.1.2-alpha.5), never a bare @deepseek-ai/dsh.
//   5. The skill's lesson: a running process holds OS-level file locks on native
//      modules that outlast page navigation; and npm dist-tags (latest vs alpha)
//      are the real resolution target of unpinned installs.
import { emit, fixtureChanges, readAgentText } from './judge-utils.mjs'

const TASK = 'S12-global-upgrade-ebusy-trap'

const ASPECTS = [
  { key: 'EBUSY root cause: running dsh host process holds OS file lock on koffi.node (native addon), page refresh does not free it',
    pattern: /koffi|(native.{0,30}(module|addon|binary))|\.node.{0,30}(lock|held|held|busy)/i, points: 20 },
  { key: 'must fully stop/exit the dsh process, not just refresh the page',
    pattern: /(stop|exit|kill|close|shut.?down).{0,120}(dsh|host|process)/i, points: 20 },
  { key: 'downgrade root cause: unpinned npm install -g resolves to latest dist-tag (rc.2), not the desired version',
    pattern: /latest|dist.?tag|(unpin|no.?version|without.{0,20}version)/i, points: 20 },
  { key: 'safe upgrade: pin the version explicitly (@deepseek-ai/dsh@<exact-version>)',
    pattern: /@deepseek-ai\/dsh@\d|pin|exact.{0,20}version|version.{0,20}pin/i, points: 20 },
  { key: 'prevention: README install commands should pin versions so users never run unpinned global installs',
    pattern: /README|install.{0,40}command|documentation|doc/i, points: 20 },
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