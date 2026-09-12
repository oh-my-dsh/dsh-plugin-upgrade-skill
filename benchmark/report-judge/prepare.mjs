import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { PROTOCOL, RUBRICS } from './rubrics.mjs'
import { collectFiles, isMain, sha256 } from './judge.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
export const REPO = resolve(HERE, '../..')

export function excerpt(text, heading) {
  const lines = text.split('\n')
  const start = lines.findIndex(line => /^#{2,3} /.test(line) && line.replace(/^#+ /, '').startsWith(`${heading} `))
  if (start < 0) throw new Error(`missing reference heading: ${heading}`)
  const level = lines[start].match(/^#+/)[0].length
  let end = start + 1
  while (end < lines.length && !(new RegExp(`^#{1,${level}} `).test(lines[end]))) end += 1
  return { start: start + 1, end, text: lines.slice(start, end).join('\n').trim() }
}

export function makePacket(task, root = REPO) {
  const rubric = RUBRICS[task]
  if (!rubric) throw new Error(`not a semantic report task: ${task}`)
  const taskRoot = join(root, 'benchmark/tasks', task)
  const references = rubric.references.map(ref => {
    const full = readFileSync(join(root, ref.path), 'utf8')
    return { id: ref.heading, path: ref.path, source_sha256: sha256(full), ...excerpt(full, ref.heading) }
  })
  let commit = null
  try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch {}
  return { protocol: PROTOCOL, task, source_commit: commit,
    instruction: readFileSync(join(taskRoot, 'instruction.md'), 'utf8'),
    rubric: { criteria: rubric.criteria, caps: rubric.caps ?? [] }, references,
    ...(rubric.allowDeletedPrefixes ? { allowedDeletions: Object.keys(collectFiles(join(taskRoot, 'environment/fixture'))).filter(path => rubric.allowDeletedPrefixes.some(prefix => path.startsWith(prefix))) } : {}),
    fixture: collectFiles(join(taskRoot, 'environment/fixture')) }
}

export function semanticToml(original, taskVersion = '4.0.0') {
  // Keep task identity, agent limits and resources; only the verifier changes.
  const artifacts = 'artifacts = [{ source = "/app/fixture" }, { source = "/app/agent-output" }]'
  const withArtifacts = /^artifacts = /m.test(original)
    ? original.replace(/^artifacts = .*$/m, artifacts)
    : original.replace('schema_version = "1.4"', `schema_version = "1.4"\n${artifacts}`)
  return withArtifacts
    .replace(/^version = "[^"]+"$/m, `version = "${taskVersion}"`)
    .replace(/\[verifier\][\s\S]*?(?=\n\[environment\])/, `[verifier]
timeout_sec = 240.0
environment_mode = "separate"
network_mode = "public"

[verifier.env]
REPORT_JUDGE_BASE_URL = "\${REPORT_JUDGE_BASE_URL}"
REPORT_JUDGE_MODEL = "\${REPORT_JUDGE_MODEL}"
REPORT_JUDGE_API_KEY = "\${REPORT_JUDGE_API_KEY}"
`)
}

export function defaultFiles(task, root = REPO) {
  const source = join(root, 'benchmark/tasks', task)
  // Content hashes, rather than the current HEAD, seal checked-in packets.
  // Keeping HEAD out avoids changing every packet on an unrelated commit.
  const packet = { ...makePacket(task, root), source_commit: null }
  const dockerfile = readFileSync(join(source, 'environment/Dockerfile'), 'utf8')
  return new Map([
    ['tests/packet.json', JSON.stringify(packet, null, 2) + '\n'],
    ['tests/judge.mjs', readFileSync(join(root, 'benchmark/report-judge/judge.mjs'), 'utf8')],
    ['tests/test.sh', '#!/bin/bash\nset -euo pipefail\nexec node "$(dirname "$0")/judge.mjs" "$@"\n'],
    ['tests/Dockerfile', 'FROM node:24-bookworm\nWORKDIR /tests\nCOPY . /tests\nRUN chmod +x /tests/test.sh\n'],
    ['task.toml', semanticToml(readFileSync(join(source, 'task.toml'), 'utf8'), RUBRICS[task].taskVersion)],
    ['environment/Dockerfile', dockerfile.includes('RUN mkdir -p /app/agent-output')
      ? dockerfile : dockerfile.trimEnd() + '\n\nRUN mkdir -p /app/agent-output\n'],
  ])
}

export function syncDefaults({ root = REPO, check = false } = {}) {
  const stale = []
  const files = Object.keys(RUBRICS).flatMap(task => [...defaultFiles(task, root)]
    .map(([name, text]) => [join(root, 'benchmark/tasks', task, name), text]))
  for (const [path, text] of files) {
    if (existsSync(path) && readFileSync(path, 'utf8') === text) continue
    stale.push(relative(root, path))
    if (!check) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text) }
  }
  for (const task of Object.keys(RUBRICS)) {
    for (const name of ['judge-utils.mjs', 'report-claims.mjs', 'report-grading.mjs', 'report-grading-utils.mjs', 'judge.test.mjs', 'prompt.txt']) {
      const path = join(root, 'benchmark/tasks', task, 'tests', name)
      if (!existsSync(path)) continue
      stale.push(relative(root, path))
      if (!check) rmSync(path)
    }
  }
  if (check && stale.length) throw new Error(`stale default report verifiers; run npm run sync:report-judge:\n${stale.join('\n')}`)
  return { tasks: Object.keys(RUBRICS).length, changed: stale }
}

export function prepare(out, root = REPO) {
  const destination = resolve(out)
  const rel = relative(join(root, 'benchmark/tasks'), destination)
  if (!rel || (!rel.startsWith('..') && !isAbsolute(rel))) throw new Error('prepared output must be outside benchmark/tasks')
  if (existsSync(destination)) throw new Error('prepared output already exists; choose a fresh directory')
  // Finish validating inputs before creating the output directory.
  const packets = Object.keys(RUBRICS).map(task => makePacket(task, root))
  mkdirSync(destination, { recursive: true })
  const manifest = { protocol: PROTOCOL, tasks: [] }
  for (const packet of packets) {
    const source = join(root, 'benchmark/tasks', packet.task)
    const target = join(destination, packet.task)
    mkdirSync(join(target, 'tests'), { recursive: true })
    for (const name of ['instruction.md', 'environment', 'solution']) cpSync(join(source, name), join(target, name), { recursive: true })
    for (const [name, text] of defaultFiles(packet.task, root)) writeFileSync(join(target, name), text)
    const packetJson = JSON.stringify(packet, null, 2) + '\n'
    writeFileSync(join(target, 'tests/packet.json'), packetJson)
    manifest.tasks.push({ task: packet.task, packet_sha256: sha256(JSON.stringify(packet)),
      judge_sha256: sha256(readFileSync(join(HERE, 'judge.mjs'))), instruction_sha256: sha256(packet.instruction),
      original_judge_sha256: sha256(readFileSync(join(source, 'tests/judge.mjs'))),
      original_solution_sha256: sha256(readFileSync(join(source, 'solution/report.md'))) })
  }
  writeFileSync(join(destination, 'report-judge-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  return manifest
}

if (isMain(import.meta.url)) {
  try {
    const args = process.argv.slice(2)
    const result = args.length === 1 && ['--sync', '--check'].includes(args[0])
      ? syncDefaults({ check: args[0] === '--check' })
      : args.length === 2 && args[0] === '--out' ? prepare(args[1]) : null
    if (!result) throw new Error('Usage: node benchmark/report-judge/prepare.mjs --sync | --check | --out <fresh-directory>')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
