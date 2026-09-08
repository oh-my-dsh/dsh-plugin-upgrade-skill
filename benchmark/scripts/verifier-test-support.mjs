import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const tasks = fileURLToPath(new URL('../tasks/', import.meta.url))
export function runVerifier(source, task = 'S17-external-ui-plugin-onboarding-trap', env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'verifier-contract-'))
  const logs = join(dir, 'logs')
  mkdirSync(logs)
  for (const name of ['reward.txt', 'reward.json', 'grading.json', 'verifier-error.json']) writeFileSync(join(logs, name), 'stale')
  writeFileSync(join(dir, 'judge.mjs'), source)
  const taskDir = join(tasks, task, 'tests')
  for (const name of ['verifier.mjs', 'judge-utils.mjs', 'judge-result.mjs']) if (existsSync(join(taskDir, name))) copyFileSync(join(taskDir, name), join(dir, name))
  const shell = readFileSync(join(taskDir, 'test.sh'), 'utf8').replaceAll('/logs/verifier', logs).replaceAll('/tests/judge.mjs', join(dir, 'judge.mjs'))
  writeFileSync(join(dir, 'test.sh'), shell)
  const result = spawnSync('bash', [join(dir, 'test.sh')], { encoding: 'utf8', env: { ...process.env, VERIFIER_LOG_DIR: logs, ...env } })
  const files = Object.fromEntries(readdirSync(logs).map(name => [name, readFileSync(join(logs, name), 'utf8')]))
  rmSync(dir, { recursive: true, force: true })
  return { ...result, files }
}
