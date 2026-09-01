import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const benchmarkRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tasksRoot = join(benchmarkRoot, 'tasks')
const failures = []

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
}

if (failures.length) {
  console.error(`Execution-contract validation failed (${failures.length}):`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`Execution-contract validation OK: ${expectedModes.size} tasks use BENCHMARK-AUTH-v1`)
