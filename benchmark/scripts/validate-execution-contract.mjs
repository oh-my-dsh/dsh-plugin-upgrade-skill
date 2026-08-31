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
  for (const required of [
    '不会有后续用户消息',
    '在计划 形成后立即继续执行',
    '不要暂停等待“确认”',
    '不得修改 skill、评测器或参考答案',
    '不得仅因为缺少另一轮确认而停止',
  ]) {
    if (!normalized.includes(required)) fail(instructionFile, `missing contract text: ${required}`)
  }

  if (mode === 'readonly') {
    if (!normalized.includes('`/app/fixture/` 必须保持 零改动')) {
      fail(instructionFile, 'read-only task must require zero fixture changes')
    }
    if (normalized.includes('可以直接修改 `/app/fixture/`')) {
      fail(instructionFile, 'read-only task must not authorize fixture changes')
    }
  } else if (mode === 'build-artifacts-only') {
    if (!normalized.includes('`/app/fixture/src/` 必须保持 零改动')) {
      fail(instructionFile, 'build-artifact task must keep fixture source unchanged')
    }
    if (!normalized.includes('可以清理 `/app/fixture/lib/`')) {
      fail(instructionFile, 'build-artifact task must limit writes to fixture build artifacts')
    }
    if (normalized.includes('可以直接修改 `/app/fixture/`')) {
      fail(instructionFile, 'build-artifact task must not authorize arbitrary fixture changes')
    }
  } else if (!normalized.includes('可以直接修改 `/app/fixture/`')) {
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
