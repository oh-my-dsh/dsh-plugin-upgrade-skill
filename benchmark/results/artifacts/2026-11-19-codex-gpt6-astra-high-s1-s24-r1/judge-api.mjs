// GLM-5.3-Flash API 判卷通道（OpenAI 兼容 /chat/completions）。
// 用法：设 REPORT_JUDGE_BASE_URL / REPORT_JUDGE_API_KEY（REPORT_JUDGE_MODEL 默认 glm-5.3-flash）后
//   node judge-api.mjs            增量判全部（跳过已存在）
//   node judge-api.mjs skill.S1   只判一格（简报名前缀匹配）
// 之后：node judge-drive.mjs score judge-out-53f judge-results-53f.json
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const RUN = import.meta.dirname
const BASE = process.env.REPORT_JUDGE_BASE_URL
const MODEL = process.env.REPORT_JUDGE_MODEL || 'glm-5.3-flash'
const KEY = process.env.REPORT_JUDGE_API_KEY
if (!BASE || !KEY) { console.error('need REPORT_JUDGE_BASE_URL and REPORT_JUDGE_API_KEY'); process.exit(1) }

const only = process.argv[2] ?? ''
const briefs = readdirSync(join(RUN, 'judge-briefs')).filter(f => f.endsWith('.md') && f.startsWith(only))
const outDir = join(RUN, 'judge-out-53f')
mkdirSync(outDir, { recursive: true })

const SYSTEM = 'You are a strict benchmark judge. Read the brief (sealed rubric criteria + caps + candidate report). Return JSON ONLY: {"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"one sentence"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"one sentence"}]} — every criterion and cap exactly once, no extra ids. pass requires the requirement fully met with concrete located evidence; prefer partial over pass when unsure.'

function stripFence(text) {
  let t = String(text).trim()
  if (t.startsWith('```')) { t = t.replace(/^```[a-z]*\n?/, '') }
  if (t.endsWith('```')) { t = t.replace(/\n?```$/, '') }
  return t.trim()
}

async function judgeOne(name) {
  const outPath = join(outDir, name.replace(/\.md$/, '.json'))
  if (existsSync(outPath)) { console.log('skip:', name); return true }
  const brief = readFileSync(join(RUN, 'judge-briefs', name), 'utf8')
  const res = await fetch(BASE.replace(/\/$/, '') + '/chat/completions', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: brief }], temperature: 0, max_tokens: 4096 }),
  })
  if (!res.ok) { console.error('HTTP', res.status, name, (await res.text()).slice(0, 200)); return false }
  const j = await res.json()
  const text = stripFence(j.choices?.[0]?.message?.content ?? '')
  try {
    const v = JSON.parse(text)
    if (!Array.isArray(v.decisions)) throw new Error('no decisions array')
    writeFileSync(outPath, JSON.stringify(v, null, 1))
    console.log('judged:', name)
    return true
  } catch (e) {
    console.error('BAD JSON:', name, String(e).slice(0, 120))
    writeFileSync(outPath + '.bad', text.slice(0, 4000))
    return false
  }
}

let ok = 0
for (const t of briefs) if (await judgeOne(t)) ok += 1
console.log('done', ok + '/' + briefs.length)