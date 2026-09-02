import { readFile, readdir } from 'node:fs/promises'
import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const benchmarkRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(benchmarkRoot, '..')
const tasksRoot = join(benchmarkRoot, 'tasks')
const failures = []
const execFileAsync = promisify(execFile)

const expectedModes = new Map([
  ['S1-static-scan', 'readonly'],
  ['S2-negative-scan', 'readonly'],
  ['S3-snapshot-migration', 'readonly'],
  ['H4-tsbuildinfo-trap', 'build-artifacts-only'],
  ['M1-host-migration', 'mutable'],
  ['H1-plane-trap', 'mutable'],
  ['H2-baseline-trap', 'mutable'],
  ['H3-client-plane', 'mutable'],
  ['H5-runtime-export-drift', 'mutable'],
  ['M5-token-auth-smoke', 'mutable'],
  ['H8-fire-drill', 'mutable'],
  ['H9-dsh-web-alpha2', 'mutable'],
  ['H10-browser-activation-trap', 'mutable'],
  ['H13-ghost-host-trap', 'readonly'],
  ['H11-dual-cohort-rpc', 'mutable'],
  ['H6-remote-error-trap', 'readonly'],
  ['S4-legacy-client-imports', 'readonly'],
  ['S5-negative-naming', 'readonly'],
  ['S6-corridor-net-state', 'readonly'],
  ['S7-unpublished-cohort', 'readonly'],
  ['S8-release-routing-trap', 'readonly'],
  ['S9-composer-coordinate-trap', 'readonly'],
  ['S10-paste-rename-and-version-chip', 'readonly'],
  ['S11-mermaid-lazyload-trap', 'readonly'],
  ['H12-remote-result-boundary-trap', 'readonly'],
  ['M2-optional-dep-trap', 'mutable'],
  ['M3-session-projection', 'mutable'],
  ['M4-peer-prerelease-range', 'mutable'],
  ['H7-locale-trap', 'mutable'],
])

const compact = (text) => text.replaceAll('\r\n', '\n').replace(/\s+/g, ' ')
const count = (text, needle) => text.split(needle).length - 1
const fail = (file, message) => {
  failures.push(`${relative(benchmarkRoot, file).replaceAll('\\', '/')}: ${message}`)
}

const entries = (await readdir(tasksRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

for (const taskId of expectedModes.keys()) {
  if (!entries.includes(taskId)) fail(tasksRoot, `missing expected task: ${taskId}`)
}
for (const taskId of entries) {
  if (!expectedModes.has(taskId)) fail(tasksRoot, `task has no execution-contract mode: ${taskId}`)
}

for (const [taskId, mode] of expectedModes) {
  const taskRoot = join(tasksRoot, taskId)
  const instructionFile = join(taskRoot, 'instruction.md')
  const taskFile = join(taskRoot, 'task.toml')
  let instruction
  let taskToml
  try {
    ;[instruction, taskToml] = await Promise.all([
      readFile(instructionFile, 'utf8'),
      readFile(taskFile, 'utf8'),
    ])
  } catch (error) {
    fail(taskRoot, `cannot read contract inputs: ${error.message}`)
    continue
  }

  const normalized = compact(instruction)
  if (count(instruction, 'BENCHMARK-AUTH-v1') !== 1) {
    fail(instructionFile, 'must contain exactly one BENCHMARK-AUTH-v1 marker')
  }
  // Contract clauses are matched bilingually (Chinese originals and their English
  // translations), so both language variants of the task briefs stay valid.
  for (const [pattern, label] of [
    [/不会有后续用户消息|there will be no follow-up user messages/, 'no-follow-up clause'],
    [/在计划\s*形成后立即继续执行|(?:as soon as|immediately once|once) the plan (?:is )?(?:formed|takes shape)/, 'proceed-after-plan clause'],
    [/不要暂停等待["“]确认["”]|do not pause (?:to wait|waiting) for ["“]?confirmation["”]?/, 'no-pause clause'],
    [/不得修改 skill、评测器或参考答案|(?:must not|may not) modify the skill/, 'no-modify clause'],
    [/不得仅因为缺少另一轮确认而停止|do not stop merely because another round of confirmation is missing/, 'no-stop clause'],
  ]) {
    if (!pattern.test(normalized)) fail(instructionFile, `missing contract text: ${label}`)
  }

  const mutableAuthorize = /可以直接修改 `\/app\/fixture\/`|may modify `\/app\/fixture\/` directly/
  const readonlyZero = /`\/app\/fixture\/` 必须保持\s*零改动|`\/app\/fixture\/` must remain completely unchanged/
  const srcZero = /`\/app\/fixture\/src\/` 必须保持\s*零改动|`\/app\/fixture\/src\/` must remain completely unchanged/
  const libClean = /可以清理 `\/app\/fixture\/lib\/`|may clean (?:the stale build artifacts|up the build artifacts) in `\/app\/fixture\/lib\/`/

  if (mode === 'readonly') {
    if (!readonlyZero.test(normalized)) {
      fail(instructionFile, 'read-only task must require zero fixture changes')
    }
    if (mutableAuthorize.test(normalized)) {
      fail(instructionFile, 'read-only task must not authorize fixture changes')
    }
  } else if (mode === 'build-artifacts-only') {
    if (!srcZero.test(normalized)) {
      fail(instructionFile, 'build-artifact task must keep fixture source unchanged')
    }
    if (!libClean.test(normalized)) {
      fail(instructionFile, 'build-artifact task must limit writes to fixture build artifacts')
    }
    if (mutableAuthorize.test(normalized)) {
      fail(instructionFile, 'build-artifact task must not authorize arbitrary fixture changes')
    }
  } else if (!mutableAuthorize.test(normalized)) {
    fail(instructionFile, 'mutable task must explicitly authorize fixture changes')
  }

  if (count(taskToml, 'execution_contract = "BENCHMARK-AUTH-v1"') !== 1) {
    fail(taskFile, 'must declare execution_contract = "BENCHMARK-AUTH-v1" exactly once')
  }
  if (!/^version = "1\.1\.0"$/m.test(taskToml)) {
    fail(taskFile, 'task version must be 1.1.0 for BENCHMARK-AUTH-v1')
  }

  if (taskId === 'H9-dsh-web-alpha2') {
    const agentBlock = taskToml.match(/\[agent\]([\s\S]*?)(?=\n\[|$)/)?.[1] ?? ''
    const verifierBlock = taskToml.match(/\[verifier\]([\s\S]*?)(?=\n\[|$)/)?.[1] ?? ''
    for (const [pattern, label] of [
      [/\{ source = "\/app\/fixture" \}/, 'fixture artifact handoff'],
      [/\{ source = "\/app\/\.git" \}/, 'fixture baseline artifact handoff'],
    ]) {
      if (!pattern.test(taskToml)) fail(taskFile, `H9 missing closed-book control: ${label}`)
    }
    if (!/^network_mode = "no-network"$/m.test(agentBlock)) {
      fail(taskFile, 'H9 missing closed-book control: agent no-network policy')
    }
    if (!/^environment_mode = "separate"$/m.test(verifierBlock)) {
      fail(taskFile, 'H9 missing closed-book control: separate verifier mode')
    }
    if (!/^network_mode = "public"$/m.test(verifierBlock)) {
      fail(taskFile, 'H9 separate verifier must own the public network phase')
    }
    if (!/不得使用服务端网页搜索/.test(normalized)) {
      fail(instructionFile, 'H9 must explicitly prohibit provider-side web search')
    }
    for (const [pattern, label] of [
      [/已发布到\s*npm\s*的\s*v0\.3\.9/i, 'published target answer'],
      [/dsh-web-all[^\n]{0,80}17\s*个/i, 'exact aggregate verifier topology'],
    ]) {
      if (pattern.test(instruction)) fail(instructionFile, `H9 prompt leaks ${label}`)
    }

    const agentDockerfile = join(taskRoot, 'environment', 'Dockerfile')
    const verifierDockerfile = join(taskRoot, 'tests', 'Dockerfile')
    const closedBookRunner = join(taskRoot, 'run-codex-closed-book.sh')
    try {
      const [agentImage, verifierImage, runner] = await Promise.all([
        readFile(agentDockerfile, 'utf8'),
        readFile(verifierDockerfile, 'utf8'),
        readFile(closedBookRunner, 'utf8'),
      ])
      if (!/^COPY fixture \/app\/fixture$/m.test(agentImage)) {
        fail(agentDockerfile, 'agent image must copy only the source fixture')
      }
      if (/^COPY (?:\. |.*(?:solution|tests))/m.test(agentImage)) {
        fail(agentDockerfile, 'agent image must not embed the task, solution, or tests')
      }
      if (!/npm cache clean --force/.test(agentImage)) {
        fail(agentDockerfile, 'agent image must clear npm download cache')
      }
      if (!/COPY \. \/tests/.test(verifierImage)) {
        fail(verifierDockerfile, 'separate verifier image must embed sealed tests')
      }
      if (!/--ak web_search=disabled/.test(runner)) {
        fail(closedBookRunner, 'Codex runner must disable provider-side web search')
      }
    } catch (error) {
      fail(taskRoot, `cannot read H9 closed-book controls: ${error.message}`)
    }
  }

  if (taskId === 'H11-dual-cohort-rpc') {
    const snapshot = '7d33bf4c492da250c94f48aebd29bb16877d7a36'
    const snapshotTree = '933534bd1e0acf0e79cd667683c1db3fa5055e77'
    const snapshotArchive = '1d4f2413bca7c95578e6eae38ceddf3407408c2298218d9bb96f8b21a666baa7'
    const agentBlock = taskToml.match(/\[agent\]([\s\S]*?)(?=\n\[|$)/)?.[1] ?? ''
    for (const [pattern, label] of [
      [new RegExp(`^skill_snapshot_commit = "${snapshot}"$`, 'm'), 'fixed pre-answer skill snapshot'],
      [new RegExp(`^skill_snapshot_tree = "${snapshotTree}"$`, 'm'), 'fixed skill tree'],
      [new RegExp(`^skill_snapshot_archive_sha256 = "${snapshotArchive}"$`, 'm'), 'fixed skill archive hash'],
      [/^evaluation_partition = "closed-book-transfer"$/m, 'closed-book transfer partition'],
      [/^skill_snapshot_path = "skills\/plugin-upgrade"$/m, 'skill snapshot path'],
    ]) {
      if (!pattern.test(taskToml)) fail(taskFile, `H11 missing contamination control: ${label}`)
    }
    if (!/^network_mode = "no-network"$/m.test(agentBlock)) {
      fail(taskFile, 'H11 agent must run with no network')
    }
    if (!/不得使用服务端网页搜索|Do not use provider-side web search/i.test(normalized)) {
      fail(instructionFile, 'H11 must explicitly prohibit provider-side web search')
    }

    const dockerfile = join(taskRoot, 'environment', 'Dockerfile')
    const provenanceFile = join(taskRoot, 'provenance', 'README.md')
    try {
      const [dockerfileText, provenance] = await Promise.all([
        readFile(dockerfile, 'utf8'),
        readFile(provenanceFile, 'utf8'),
      ])
      for (const [pattern, label] of [
        [/COPY cohorts\/rc2 \/opt\/dsh-cohorts\/rc2/, 'locked rc.2 cohort'],
        [/COPY cohorts\/alpha2 \/opt\/dsh-cohorts\/alpha2/, 'locked newer cohort'],
        [/--frozen-lockfile --ignore-scripts/, 'frozen cohort install'],
      ]) {
        if (!pattern.test(dockerfileText)) fail(dockerfile, `H11 missing real-cohort control: ${label}`)
      }
      if (!provenance.includes(snapshot) || !/current tree would therefore measure answer retrieval/i.test(provenance)) {
        fail(provenanceFile, 'H11 provenance must explain why the current answer-bearing skill is invalid')
      }
      if (!provenance.includes(snapshotTree) || !provenance.includes(snapshotArchive)) {
        fail(provenanceFile, 'H11 provenance must record the evaluated skill tree and archive hashes')
      }
    } catch (error) {
      fail(taskRoot, `cannot read H11 closed-book controls: ${error.message}`)
    }

    try {
      await execFileAsync('git', ['cat-file', '-e', `${snapshot}:skills/plugin-upgrade/SKILL.md`], { cwd: repoRoot })
    } catch {
      fail(taskFile, `H11 skill snapshot does not contain skills/plugin-upgrade/SKILL.md: ${snapshot}`)
    }
    try {
      const { stdout } = await execFileAsync('git', ['rev-parse', `${snapshot}:skills/plugin-upgrade`], { cwd: repoRoot })
      if (stdout.trim() !== snapshotTree) fail(taskFile, `H11 skill snapshot tree mismatch: ${stdout.trim()}`)
    } catch (error) {
      fail(taskFile, `cannot resolve H11 skill snapshot tree: ${error.message}`)
    }
    try {
      const digest = await archiveDigest(snapshot, 'skills/plugin-upgrade', repoRoot)
      if (digest !== snapshotArchive) fail(taskFile, `H11 skill archive hash mismatch: ${digest}`)
    } catch (error) {
      fail(taskFile, `cannot hash H11 skill snapshot archive: ${error.message}`)
    }
    try {
      await execFileAsync('git', ['cat-file', '-e', `${snapshot}:skills/plugin-upgrade/examples/04-dual-cohort-plugin.md`], { cwd: repoRoot })
      fail(taskFile, 'H11 skill snapshot already contains the answer-bearing Example 04')
    } catch {
      // Expected: the answer-bearing example must not exist in the evaluated snapshot.
    }
  }
}

function archiveDigest(commit, path, cwd) {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash('sha256')
    let stderr = ''
    const child = spawn('git', ['archive', commit, path], { cwd })
    child.stdout.on('data', (chunk) => hash.update(chunk))
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolvePromise(hash.digest('hex'))
      else reject(new Error(stderr.trim() || `git archive exited ${code}`))
    })
  })
}

if (failures.length) {
  console.error(`Execution-contract validation failed (${failures.length}):`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`Execution-contract validation OK: ${expectedModes.size} tasks use BENCHMARK-AUTH-v1`)
