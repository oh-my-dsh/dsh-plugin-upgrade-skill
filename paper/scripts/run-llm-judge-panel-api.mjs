// Runs one panel judge over the blinded items through an OpenAI-compatible
// chat/completions endpoint, with the same request shape as callJudge() in
// benchmark/report-judge/judge.mjs (system = item.system, user =
// JSON.stringify(item.input), response_format json_object). Reads only
// items/ and manifest.json; never opens unblinding/ or other judges' verdicts.
//   REPORT_JUDGE_BASE_URL=https://api.openai.com/v1 REPORT_JUDGE_MODEL=<id> REPORT_JUDGE_API_KEY=... \
//   node paper/scripts/run-llm-judge-panel-api.mjs --judge openai-<id> [--retries 2]
// Resumable: items that already have a valid verdict are skipped.
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { apiConfig, scoreDecisions, sha256 } from '../../benchmark/report-judge/judge.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const panel = join(root, 'paper/audit/llm-judge-panel-v1')
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i === -1 ? fallback : process.argv[i + 1] }
const judge = arg('--judge')
const maxRetries = Number(arg('--retries', '2'))
if (!judge || !/^[a-z0-9][a-z0-9._-]*$/.test(judge)) throw new Error('usage: --judge openai-<model> (lowercase)')
const config = apiConfig(process.env)
const outDir = join(panel, 'verdicts', judge)
fs.mkdirSync(outDir, { recursive: true })
const metaPath = join(outDir, 'judge.json')
const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {
  judge, model: config.model, interface: `API ${new URL(config.url).origin}`, startedAt: new Date().toISOString(),
  finishedAt: null, items: 0, retries: [], calls: [],
  independence: 'Automated: the runner reads only items/*.json and manifest.json; no unblinding key, original scores, reviews, or other judges.',
  notes: '',
}
const saveMeta = () => fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n')
const { items } = JSON.parse(fs.readFileSync(join(panel, 'manifest.json'), 'utf8'))

async function judgeOnce(item) {
  const request = { model: config.model, messages: [{ role: 'system', content: item.system },
    { role: 'user', content: JSON.stringify(item.input) }], response_format: { type: 'json_object' } }
  const response = await fetch(config.url, { method: 'POST', redirect: 'error',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.key}` },
    body: JSON.stringify(request), signal: AbortSignal.timeout(300000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`) // never print bodies: may echo credentials
  const body = await response.json()
  const choice = body.choices?.[0]
  if (choice?.finish_reason !== 'stop' || typeof choice.message?.content !== 'string' || choice.message.refusal) {
    throw new Error(`incomplete or refused (finish_reason=${choice?.finish_reason})`)
  }
  const verdict = JSON.parse(choice.message.content)
  scoreDecisions({ rubric: item.input.rubric }, item.input.candidate_reports, verdict)
  return { verdict: { decisions: verdict.decisions, caps: verdict.caps },
    call: { returnedModel: body.model ?? null, requestId: body.id ?? null, usage: body.usage ?? null, requestSha256: sha256(JSON.stringify(request)) } }
}

let done = 0
for (const { id } of items) {
  const out = join(outDir, `${id}.json`)
  const item = JSON.parse(fs.readFileSync(join(panel, 'items', `${id}.json`), 'utf8'))
  if (fs.existsSync(out)) {
    try { scoreDecisions({ rubric: item.input.rubric }, null, JSON.parse(fs.readFileSync(out, 'utf8'))); done++; continue } catch { /* re-judge */ }
  }
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const { verdict, call } = await judgeOnce(item)
      fs.writeFileSync(out, JSON.stringify(verdict, null, 2) + '\n')
      meta.calls.push({ id, attempt, ...call })
      done++
      console.log(`${id} ok (${done}/${items.length})`)
      break
    } catch (error) {
      meta.retries.push({ id, attempt, reason: String(error.message).slice(0, 200) })
      console.log(`${id} attempt ${attempt} failed: ${error.message}`)
    }
  }
  saveMeta()
}
meta.items = done
if (done === items.length) meta.finishedAt = new Date().toISOString()
else meta.notes = `${done}/${items.length} items completed; remaining items have no verdict.`
saveMeta()
console.log(`valid ${done}/${items.length}`)
