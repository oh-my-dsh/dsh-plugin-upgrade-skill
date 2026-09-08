// Verifier-only probes: run in disposable node:24-bookworm, with /benchmark read-only
// and /evidence writable. Does not run an agent or reproduce task Docker images.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
if (process.env.MAIN56_DISPOSABLE_CONTAINER !== '1') throw new Error('Run only in the documented disposable container')
const hash = (text) => createHash('sha256').update(text).digest('hex')
const rows = [...readFileSync('/benchmark/README.md', 'utf8').matchAll(/^\| ([SMH]\d+-[^ |]+) \| Static \|/gm)].map(m => m[1])
if (rows.length !== 20) throw new Error(`Expected 20 registry Static tasks; got ${rows.length}`)
const cardPattern = /(?:DSH-\d+\.\d+\.\d+-)?(?:A\d|RC\d)-\d{2}\b/g
const result = { scope: 'unmodified-static-judge-and-wrapper-in-disposable-base-image', imageTag: 'node:24-bookworm', createdAt: new Date().toISOString(), limitations: ['not Harbor task-image admission', 'not independent semantic human validation', 'card removal is a lexical intervention, not certified equivalent paraphrase'], tasks: [] }
const git = (...args) => execFileSync('git', args, { cwd: '/app', encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
for (const id of rows) {
  const source = `/benchmark/tasks/${id}`
  rmSync('/app', { recursive: true, force: true }); mkdirSync('/app')
  rmSync('/tests', { recursive: true, force: true }); cpSync(`${source}/tests`, '/tests', { recursive: true })
  cpSync(`${source}/environment/fixture`, '/app/fixture', { recursive: true })
  git('init', '-q'); git('add', '-f', 'fixture'); git('-c', 'user.name=admission', '-c', 'user.email=admission@local', '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'baseline')
  writeFileSync('/verifier-baseline.sha', git('rev-parse', 'HEAD')+'\n')
  const oracle = readFileSync(`${source}/solution/report.md`, 'utf8')
  const codes = [...new Set(oracle.match(cardPattern) ?? [])]
  const variants = { oracle, empty: '', without_card_ids: oracle.replace(cardPattern, '[reference omitted]'), card_ids_only: codes.join('\n') }
  const task = { taskId: id, sourceHashes: { judge: hash(readFileSync(`${source}/tests/judge.mjs`)), wrapper: hash(readFileSync(`${source}/tests/test.sh`)), oracle: hash(oracle), helpers: Object.fromEntries(readdirSync(`${source}/tests`).filter(name => name.endsWith('.mjs') && !name.endsWith('.test.mjs')).sort().map(name => [name, hash(readFileSync(`${source}/tests/${name}`))])) }, variants: {} }
  for (const [variant, report] of Object.entries(variants)) {
    rmSync('/app/agent-output', { recursive: true, force: true }); mkdirSync(`/app/agent-output/${id}`, { recursive: true })
    if (variant !== 'empty') writeFileSync(`/app/agent-output/${id}/report.md`, report)
    rmSync('/logs/verifier', { recursive: true, force: true }); mkdirSync('/logs/verifier', { recursive: true })
    const run = spawnSync('bash', [`${source}/tests/test.sh`], { cwd: '/app', encoding: 'utf8', timeout: 20000 })
    const out = (run.stdout ?? '') + (run.stderr ?? '')
    const packets = out.split('\n').flatMap(line => { try { const x=JSON.parse(line); return Number.isFinite(x.score)&&Number.isFinite(x.max) ? [x] : [] } catch { return [] } })
    const packet = packets.at(-1) ?? null
    const gateError = packet?.reasons?.some(r => /judge error|git status failed|read-only check failed/i.test(r)) ?? false
    const record = { reportSha256: hash(report), exitCode: run.status, error: run.error?.message ?? null, packet, gateError }
    task.variants[variant] = record
    const dest = `/evidence/static/${id}/${variant}`; mkdirSync(dest, { recursive: true })
    writeFileSync(`${dest}/report.md`, report); writeFileSync(`${dest}/stdout.log`, out)
    for (const name of readdirSync('/logs/verifier')) cpSync(`/logs/verifier/${name}`, `${dest}/${name}`, { recursive: true })
    if (run.status !== 0 || !packet || gateError) record.valid = false
    else record.valid = true
  }
  result.tasks.push(task)
  writeFileSync('/evidence/static-probes.json', JSON.stringify(result, null, 2)+'\n')
  console.log(id, Object.fromEntries(Object.entries(task.variants).map(([k,v])=>[k,v.valid?v.packet.score:'ERROR'])))
}
