// H5 real-repository verifier. It grades the five compatibility surfaces documented by
// dsh-web v0.3.9 without requiring byte-identical agent formatting. The Oracle remains an
// exact upstream target and the target manifest constrains unrelated edits.
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runRuntimeSmoke } from './runtime-smoke.mjs'

const APP_ROOT = process.env.BENCH_APP_ROOT || '/app'
const FIXTURE = join(APP_ROOT, 'fixture')
const TEST_ROOT = dirname(fileURLToPath(import.meta.url))
const targetManifest = JSON.parse(readFileSync(join(TEST_ROOT, 'target-manifest.json'), 'utf8'))
const allowedPaths = new Set(targetManifest.files.map((entry) => entry.path))

main().catch((error) => emit(0, [`judge异常: ${error.stack || error.message}`]))

async function main() {
  const reasons = []
  const changes = await changedPaths()
  if (!changes.ok) emit(0, [`无法读取fixture基线: ${changes.detail}`])
  if (changes.paths.length === 0) emit(0, ['fixture相对v0.3.8基线无改动'])

  const unrelated = changes.paths.filter((path) => !allowedPaths.has(path))
  reasons.push(`检测到${changes.paths.length}个fixture改动路径`)
  if (unrelated.length) reasons.push(`存在兼容面外改动，最终封顶90: ${unrelated.slice(0, 12).join(', ')}`)

  let score = 0

  // 39: all 13 real settings consumers, including committed generated artifacts.
  const consumers = [
    { name: 'desktop-launcher', source: 'packages/dsh-desktop-launcher/src/index.ts', calls: 1 },
    { name: 'doctor', source: 'packages/dsh-doctor/src/index.ts', calls: 1 },
    { name: 'git-graph', source: 'packages/dsh-git-graph/src/index.ts', calls: 1 },
    { name: 'liangshen', source: 'packages/dsh-liangshen/src/index.ts', calls: 1 },
    { name: 'market', source: 'packages/dsh-market/src/index.ts', calls: 1, generated: 'packages/dsh-market/lib/index.js' },
    { name: 'perf', source: 'packages/dsh-perf/src/index.ts', calls: 1 },
    { name: 'pet', source: 'packages/dsh-pet/src/index.ts', calls: 1 },
    { name: 'remote-web-ui', source: 'packages/dsh-remote-web-ui/src/index.ts', calls: 1 },
    { name: 'ssh', source: 'packages/dsh-ssh/src/index.ts', calls: 1 },
    { name: 'task-board', source: 'packages/dsh-task-board/src/index.ts', calls: 1 },
    { name: 'tool-describe-image', source: 'packages/dsh-tool-describe-image/src/index.ts', calls: 1 },
    { name: 'usage', source: 'packages/dsh-usage/src/index.ts', calls: 1 },
    { name: 'skin-center', source: 'packages/skins/skin-center/src/index.ts', calls: 3, generated: 'packages/skins/skin-center/lib/index.js' },
  ]
  const migrated = []
  const missed = []
  for (const consumer of consumers) {
    const source = read(consumer.source)
    let ok = source.length > 0
      && !/\b(?:installSettingsSection|settingsNamespace)\b/.test(source)
      && /ctx\s*\.\s*inject\s*\(\s*\[\s*['"]settings['"]\s*\]/.test(source)
      && count(source, /settingsCtx\s*\.\s*settings\s*\.\s*installSection\s*\(/g) >= consumer.calls
    if (consumer.generated) {
      const generated = read(consumer.generated)
      ok = ok
        && generated.length > 0
        && !/\b(?:installSettingsSection|settingsNamespace)\b/.test(generated)
        && count(generated, /settingsCtx\s*\.\s*settings\s*\.\s*installSection\s*\(/g) >= consumer.calls
    }
    if (ok) {
      score += 3
      migrated.push(consumer.name)
    } else missed.push(consumer.name)
  }
  reasons.push(`settings服务缝迁移 ${migrated.length}/13（+${migrated.length * 3}）${missed.length ? `；缺失: ${missed.join(', ')}` : ''}`)

  // 6: provider bridge stopped calling the removed runtime namespace helper.
  const bridge = read('packages/dsh-web-settings/src/bridge.ts')
  if (!/\bsettingsNamespace\b/.test(bridge)
      && /deps\s*\.\s*settings\s*\.\s*mutate\s*\(\s*ns\s+as\s+SettingsNamespace/.test(bridge)) {
    score += 6
    reasons.push('web-settings bridge使用编译期品牌转换（+6）')
  } else reasons.push('web-settings bridge仍依赖旧settingsNamespace或未保留品牌类型（+0）')

  // 10 + 5: whole direct SDK cohort and the severed git-graph type edge.
  const packageAudit = auditPackageDependencies()
  if (packageAudit.relevant >= 50 && packageAudit.bad.length === 0) {
    score += 10
    reasons.push(`直接SDK/Cordis依赖统一到alpha.2/4.0.2，共${packageAudit.relevant}条（+10）`)
  } else reasons.push(`依赖cohort未统一（+0）: ${packageAudit.bad.slice(0, 10).join('; ') || `仅找到${packageAudit.relevant}条`}`)

  const gitGraphPackage = json('packages/dsh-git-graph/package.json')
  const gitGraphClient = read('packages/dsh-git-graph/src/client/index.ts')
  if (gitGraphPackage?.devDependencies?.['@deepseek-ai/dsh-client-ui-session']?.includes('0.1.2-alpha.2')
      && /import\s+type\s*\{\}\s+from\s+['"]@deepseek-ai\/dsh-client-ui-session\/client['"]/.test(gitGraphClient)) {
    score += 5
    reasons.push('git-graph补齐ui-session直接依赖和类型增强边（+5）')
  } else reasons.push('git-graph仍依赖被裁掉的传递类型边（+0）')

  // 10: alpha.2 is registry-resolved; no preview tarball store remains.
  const workspace = read('pnpm-workspace.yaml')
  const lockfile = read('pnpm-lock.yaml')
  const workflows = ['.github/workflows/ci.yml', '.github/workflows/deploy-market.yml', '.github/workflows/release.yml']
    .map(read).join('\n')
  let cohortPoints = 0
  if (!/^overrides:/m.test(workspace)
      && !workspace.includes('.dsh-cohorts')
      && ['@deepseek-ai/cordis@4.0.2', '@deepseek-ai/cordis-plugin-loader@1.0.3', '@deepseek-ai/cordis-plugin-include@1.0.7']
        .every((needle) => workspace.includes(needle))) cohortPoints += 4
  if (!existsSync(join(FIXTURE, 'scripts/build-cohort-tarballs.mjs'))
      && !/build-cohort-tarballs|Restore preview cohort store|Materialize preview cohort store/.test(workflows)) cohortPoints += 3
  if (lockfile.includes('0.1.2-alpha.2')
      && lockfile.includes('4.0.2')
      && !lockfile.includes('0.1.2-alpha.1')
      && !lockfile.includes('.dsh-cohorts')) cohortPoints += 3
  score += cohortPoints
  reasons.push(`npm cohort/lock/workflow迁移（+${cohortPoints}/10）`)

  // 15: exclude both real incompatible externals from every aggregate representation.
  const aggregate = read('packages/dsh-web-all/aggregate.yml')
  const aggregatePatch = read('packages/dsh-web-all/cordis.patch.yml')
  const aggregatePackage = json('packages/dsh-web-all/package.json')
  const aggregateTest = read('scripts/aggregate.test.mjs')
  let aggregatePoints = 0
  if (!/^\s*-\s*\{[^\n]*(?:better-sidebar|archive-manager)/m.test(aggregate)
      && /"better-session"[^\n]*"inactive"\s*:\s*true/.test(aggregate)) aggregatePoints += 5
  if (!aggregatePackage?.dependencies?.['dsh-better-sidebar']
      && !aggregatePackage?.dependencies?.['@mlgbnb/dsh-archive-manager']
      && aggregatePackage?.dependencies?.['@morlay/better-session']) aggregatePoints += 4
  if (!/web-ui-(?:better-sidebar|archive-manager)/.test(aggregatePatch)
      && /web-ui-session-branch[\s\S]{0,240}disabled:\s*true/.test(aggregatePatch)) aggregatePoints += 4
  if (/does not mount the dsh-client-runtime-dependent externals/.test(aggregateTest)
      && /dsh-better-sidebar must not be mounted/.test(aggregateTest)
      && /dsh-archive-manager must not be mounted/.test(aggregateTest)) aggregatePoints += 2
  score += aggregatePoints
  reasons.push(`alpha.2不兼容外部插件从manifest/deps/patch/test同步排除（+${aggregatePoints}/15）`)

  // 10: alpha.2 qualified gateway error still participates in the legacy retry policy.
  const hostRunner = read('packages/dsh-task-board/src/host-runner.ts')
  if (/code\s*===\s*['"]service-unavailable['"]\s*\|\|\s*code\s*===\s*['"]gateway\/service-unavailable['"]/.test(hostRunner)) {
    score += 10
    reasons.push('task-board同时识别旧码与qualified gateway错误码（+10）')
  } else reasons.push('task-board未恢复alpha.2启动竞态重试（+0）')

  // 5: run the real upstream script-level regressions on the migrated source slice.
  const regression = await run('node', ['--test', 'scripts/inject-contract.test.mjs', 'scripts/aggregate.test.mjs'], FIXTURE, 120000)
  if (regression.code === 0) {
    score += 5
    reasons.push('上游inject/aggregate脚本级回归通过（+5）')
  } else reasons.push(`上游脚本级回归失败（+0）: ${(regression.stdout + regression.stderr).trim().slice(-300)}`)

  // A static match is not sufficient proof for this practical task. Build the
  // candidate packages themselves, mount their local tarballs through the
  // official CLI, and require a real alpha.2 Web cold start. Runtime failure
  // caps the result at 80, so reward 1.0 is impossible without this proof.
  if (score >= 80) {
    const runtime = await runRuntimeSmoke(FIXTURE)
    reasons.push(...runtime.facts)
    if (runtime.ok) reasons.push('alpha.2真实安装/冷启动门禁通过')
    else {
      score = Math.min(score, 80)
      reasons.push(`alpha.2真实安装/冷启动门禁失败，最终封顶80：${runtime.detail}`)
    }
  } else reasons.push('静态兼容面低于80分，跳过重型运行时门禁')

  if (unrelated.length) score = Math.min(score, 90)
  emit(score, reasons)
}

function read(relPath) {
  try { return readFileSync(join(FIXTURE, relPath), 'utf8') } catch { return '' }
}

function json(relPath) {
  try { return JSON.parse(read(relPath)) } catch { return null }
}

function count(text, pattern) {
  return text.match(pattern)?.length ?? 0
}

function walk(directory) {
  const files = []
  if (!existsSync(directory)) return files
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) files.push(...walk(path))
    else files.push(path)
  }
  return files
}

function auditPackageDependencies() {
  const bad = []
  let relevant = 0
  for (const file of walk(join(FIXTURE, 'packages')).filter((path) => path.endsWith('/package.json'))) {
    let pkg
    try { pkg = JSON.parse(readFileSync(file, 'utf8')) } catch (error) {
      bad.push(`${file.slice(FIXTURE.length + 1)}: invalid JSON (${error.message})`)
      continue
    }
    for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      for (const [name, value] of Object.entries(pkg[section] || {})) {
        if (name === '@deepseek-ai/cordis') {
          relevant += 1
          if (!String(value).includes('4.0.2')) bad.push(`${pkg.name}:${name}=${value}`)
        } else if (name.startsWith('@deepseek-ai/dsh')) {
          relevant += 1
          if (!String(value).includes('0.1.2-alpha.2')) bad.push(`${pkg.name}:${name}=${value}`)
        }
      }
    }
  }
  return { relevant, bad }
}

function run(file, args, cwd, timeout) {
  return new Promise((resolvePromise) => {
    execFile(file, args, { cwd, timeout }, (error, stdout, stderr) => {
      resolvePromise({ code: error?.code ?? 0, stdout: stdout || '', stderr: stderr || '' })
    })
  })
}

function changedPaths() {
  return new Promise((resolvePromise) => {
    execFile('git', ['status', '--porcelain', '--untracked-files=all', '--', 'fixture'], { cwd: APP_ROOT, timeout: 30000 }, (error, stdout, stderr) => {
      if (error) return resolvePromise({ ok: false, detail: stderr || error.message, paths: [] })
      const paths = stdout.split('\n').filter(Boolean).flatMap((line) => {
        const raw = line.slice(3)
        const names = raw.includes(' -> ') ? raw.split(' -> ') : [raw]
        return names.map((name) => name.replace(/^fixture\//, ''))
      })
      resolvePromise({ ok: true, paths: [...new Set(paths)].sort() })
    })
  })
}

function emit(score, reasons) {
  const result = { score: Math.max(0, Math.min(100, Math.round(score))), max: 100, reasons }
  process.stdout.write(JSON.stringify(result) + '\n')
  process.exit(0)
}
