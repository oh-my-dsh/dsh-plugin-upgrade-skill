import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
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
  if (changes.paths.length === 0) emit(0, ['fixture相对v0.1.3基线无改动'])

  const unrelated = changes.paths.filter((path) => !allowedPaths.has(path))
  reasons.push(`检测到${changes.paths.length}个fixture改动路径`)
  if (unrelated.length) reasons.push(`存在tag差异面外改动，最终封顶90: ${unrelated.slice(0, 12).join(', ')}`)

  let score = 0

  // 16: release declaration, alpha.2 dependency cohort, and exact provider inject graph.
  const pkg = json('package.json')
  const community = json('dsh-plugin.json')
  if (pkg?.version === '0.1.4' && community?.version === '0.1.4'
      && pkg?.dsh?.engines?.dsh === '>=0.1.2-alpha.2') {
    score += 4
    reasons.push('发布版本与dsh alpha.2引擎边界同步（+4）')
  } else reasons.push('发布版本/社区清单/引擎边界未同步（+0）')

  const expectedInject = [
    '@deepseek-ai/dsh-api-session-controller',
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-ui-agent-preset',
    '@deepseek-ai/dsh-client-ui-tool',
    '@deepseek-ai/dsh-client-ui-conversation',
    '@deepseek-ai/dsh-client-ui-renderer',
    '@deepseek-ai/dsh-client-ui-session',
    '@deepseek-ai/dsh-client-ui-workspace',
  ].sort()
  const actualInject = [...(pkg?.dsh?.client?.inject ?? [])].sort()
  if (JSON.stringify(actualInject) === JSON.stringify(expectedInject)) {
    score += 5
    reasons.push('client provider注入图与alpha.2完全一致（+5）')
  } else reasons.push('client provider注入图缺失、残留或被扩大（+0）')

  const cohort = auditCohort(pkg)
  const workspace = read('pnpm-workspace.yaml')
  const lock = read('pnpm-lock.yaml')
  if (cohort.ok
      && /koffi:\s*false/.test(workspace)
      && /verifyDepsBeforeRun:\s*false/.test(workspace)
      && /dsh-api-session-controller@0\.1\.2-alpha\.2/.test(workspace)
      && /dsh-client-ui-agent-preset@0\.1\.2-alpha\.2/.test(workspace)
      && /dsh-util-values@0\.1\.2-alpha\.2/.test(workspace)
      && /['"]?@deepseek-ai\/dsh-util-values['"]?:/.test(lock)
      && /version:\s*0\.1\.2-alpha\.2/.test(lock)) {
    score += 7
    reasons.push(`peer/dev/workspace/lockfile cohort对齐alpha.2（${cohort.relevant}条，+7）`)
  } else reasons.push(`依赖cohort或解析策略未完整迁移（+0）: ${cohort.bad.slice(0, 6).join('; ') || 'workspace/lockfile未同步'}`)

  // 10: type owners and client Context boundaries moved without a compatibility shim.
  const clientIndex = read('src/client/index.ts')
  const catalogTools = read('src/catalog-tools.ts')
  const tool = read('src/tool.ts')
  const analysisVm = read('src/client/analysis-view-model.ts')
  const dashboard = read('src/client/AnalysisDashboard.tsx')
  const typeChecks = [
    /import\s+type\s*\{\s*Context\s+as\s+ClientContext\s*\}\s+from\s+['"]@deepseek-ai\/cordis['"]/.test(clientIndex),
    !/@deepseek-ai\/dsh-client-runtime/.test(clientIndex),
    /sessions:\s*ISessions[\s\S]*slots:\s*SlotRegistry[\s\S]*uiWorkspace:\s*UiWorkspace/.test(clientIndex),
    /scope\s+as\s+unknown\s+as/.test(clientIndex),
    /import\s+type\s*\{\s*JsonValue\s*\}\s+from\s+['"]@deepseek-ai\/dsh-util-values['"]/.test(catalogTools),
    /import\s+type\s*\{\s*JsonValue\s*\}\s+from\s+['"]@deepseek-ai\/dsh-util-values['"]/.test(tool),
    /ToolCallBlock\s*}\s+from\s+['"]@deepseek-ai\/dsh-client-ui-conversation\/client['"]/.test(analysisVm),
    !/@deepseek-ai\/dsh-client-runtime/.test(analysisVm),
    !/<Modal[\s\S]{0,220}closeLabel=/.test(dashboard),
    /ctx\.inject\(\['slots', 'locale', 'sessions', 'uiWorkspace'\]/.test(clientIndex),
  ]
  const typePoints = typeChecks.filter(Boolean).length
  score += typePoints
  reasons.push(`客户端Context/类型owner/API面迁移 ${typePoints}/10（+${typePoints}）`)

  // 10: session-scoped workbench follows the alpha.2 projection and consumes the bridge.
  const workbench = read('src/client/DataAgentWorkbench.tsx')
  const sessionChecks = [
    /projectionValues\?:\s*\{[\s\S]*agentPreset/.test(workbench),
    /projectionValues\?\.agentPreset\s*===\s*DATA_AGENT_PRESET/.test(workbench),
    !/byId\[sessionId\s+as\s+never\]\?\.agentPreset/.test(workbench),
    /hooks:\s*\{[\s\S]*workbenchOpen:\s*ObservableSnapshot<WorkbenchOpenSnapshot>/.test(workbench),
    /acknowledgeWorkbenchOpen\(revision:\s*number\)/.test(workbench),
    /requestedFromHero\s*=\s*openRequest\.sessionId\s*===\s*sessionId/.test(workbench),
    /useState\(requestedFromHero\)/.test(workbench),
    /acknowledgeWorkbenchOpen\(openRequest\.revision\)/.test(workbench),
    /slots\.inject\(['"]conversation\.input\.right['"]/.test(clientIndex),
    /hooks:\s*\{\s*sessions:\s*sessionsSource,\s*workbenchOpen:\s*workbenchOpen\.store\s*\}/.test(clientIndex),
  ]
  const sessionPoints = sessionChecks.filter(Boolean).length
  score += sessionPoints
  reasons.push(`Session投影与会话内Workbench交付 ${sessionPoints}/10（+${sessionPoints}）`)

  // 18: root Hero must wrap, not replace, the live host-owned preset seat.
  const hero = read('src/client/DataAgentHeroControls.tsx')
  const heroChecks = [
    /slots\.inject\(['"]conversation\.hero\.agentPreset['"]/.test(clientIndex),
    /slots\.entries\(['"]conversation\.hero\.agentPreset['"]\)/.test(clientIndex),
    /filter\(entry\s*=>\s*entry\.component\s*!==\s*DataAgentHeroControls\)/.test(clientIndex),
    /sort\(\(left, right\)\s*=>\s*priorityOf\(left\)\s*-\s*priorityOf\(right\)\)/.test(clientIndex),
    /const\s+originalSeat\s*=\s*next\.component/.test(clientIndex),
    /const\s+originalInject\s*=\s*next\.inject/.test(clientIndex),
    /const\s+face\s*=\s*originalInject\(\)/.test(clientIndex),
    /\.\.\.face[\s\S]*hooks:\s*\{[\s\S]*\.\.\.face\.hooks/.test(clientIndex),
    /priority\s*=\s*Math\.min\(\.\.\.entries\.map\(priorityOf\)\)\s*-\s*1/.test(clientIndex),
    /slots\.subscribe\(['"]conversation\.hero\.agentPreset['"],\s*schedule\)/.test(clientIndex),
    /queueMicrotask\(reconcile\)/.test(clientIndex),
    /unsubscribe\(\)[\s\S]*disposeShadow\?\.\(\)/.test(clientIndex),
    /<OriginalSeat\s+\{\.\.\.props\}\s*\/>/.test(hero),
    /preset\s*===\s*DATA_AGENT_PRESET\s*&&\s*currentSessionId\s*===\s*undefined/.test(hero),
    /useAgentPresetSeat\(\(state:[^)]+\)\s*=>\s*state\.current\)/.test(hero),
    /props\.useSessions\(\(state:[^)]+\)\s*=>\s*state\.current\)/.test(hero),
    /overrideComposerPlaceholder\(card,\s*placeholder\)/.test(hero),
    /onClick=\{requestWorkbench\}/.test(hero),
  ]
  const heroPoints = heroChecks.filter(Boolean).length
  score += heroPoints
  reasons.push(`New Session Hero宿主seat保真包装 ${heroPoints}/18（+${heroPoints}）`)

  // 16: revisioned one-way hand-off, including failure and disposal paths.
  const bridge = read('src/client/workbench-open.ts')
  const bridgeChecks = [
    /createObservable<WorkbenchOpenSnapshot>\(\{\s*pending:\s*false,\s*revision:\s*0\s*\}\)/.test(bridge),
    /const\s+unsubscribe\s*=\s*sessions\.subscribe\(settle\)/.test(bridge),
    /if\s*\(!current\.pending\)\s*return/.test(bridge),
    /list\.byId\[sessionId\]\?\.projectionValues\?\.agentPreset\s*!==\s*DATA_AGENT_PRESET/.test(bridge),
    /revision:\s*current\.revision\s*\+\s*1,\s*sessionId/.test(bridge),
    /if\s*\(store\.getSnapshot\(\)\.pending\)\s*return/.test(bridge),
    /store\.set\(\{\s*pending:\s*true,\s*revision:\s*current\.revision\s*\}\)/.test(bridge),
    /startSession\(\)[\s\S]*settle\(\)/.test(bridge),
    /catch\s*\(error\)[\s\S]*pending:\s*false[\s\S]*throw\s+error/.test(bridge),
    /current\.revision\s*!==\s*revision\s*\|\|\s*current\.sessionId\s*===\s*undefined/.test(bridge),
    /store\.set\(\{\s*pending:\s*false,\s*revision:\s*current\.revision\s*\}\)/.test(bridge),
    /dispose\(\)\s*\{\s*unsubscribe\(\)/.test(bridge),
    /getSnapshot:\s*\(\)\s*=>\s*snapshot/.test(bridge),
    /subscribe\(fn\)[\s\S]*listeners\.add\(fn\)[\s\S]*listeners\.delete\(fn\)/.test(bridge),
    /if\s*\(Object\.is\(snapshot,\s*next\)\)\s*return/.test(bridge),
    /for\s*\(const\s+listener\s+of\s+listeners\)\s*listener\(\)/.test(bridge),
  ]
  const bridgePoints = bridgeChecks.filter(Boolean).length
  score += bridgePoints
  reasons.push(`Hero→Session一次性握手 ${bridgePoints}/16（+${bridgePoints}）`)

  // 10: Lexical visible-placeholder + attribute bridge, with guarded restoration and textarea fallback.
  const placeholder = read('src/client/workbench-placeholder.ts')
  const placeholderChecks = [
    /querySelector<HTMLTextAreaElement>\(['"]textarea['"]\)/.test(placeholder),
    /\[role="textbox"\]\[contenteditable="true"\]/.test(placeholder),
    /\[data-composer-placeholder="true"\]/.test(placeholder),
    /const\s+input\s*=\s*lexical\s*\?\?\s*textarea/.test(placeholder),
    /lexical\s*===\s*null\s*\?\s*['"]placeholder['"]\s*:\s*['"]data-placeholder['"]/.test(placeholder),
    /hostPlaceholder\s*=\s*input\.getAttribute\(attribute\)/.test(placeholder),
    /hostVisibleText\s*=\s*visiblePlaceholder\?\.textContent/.test(placeholder),
    /input\.setAttribute\(attribute,\s*placeholder\)/.test(placeholder),
    /if\s*\(input\.getAttribute\(attribute\)\s*===\s*placeholder\)/.test(placeholder),
    /if\s*\(visiblePlaceholder\?\.textContent\s*===\s*placeholder\)/.test(placeholder),
  ]
  const placeholderPoints = placeholderChecks.filter(Boolean).length
  score += placeholderPoints
  reasons.push(`Lexical/textarea占位符与安全回滚 ${placeholderPoints}/10（+${placeholderPoints}）`)

  // 20: release artifacts/conformance (10) plus exact bytes for all 34 target paths (10).
  const inventory = json('conformance/dsh-ecosystem/inventory.json')
  const generatedOk = [
    'lib/types/client/DataAgentHeroControls.d.ts',
    'lib/types/client/workbench-open.d.ts',
    'lib/types/client/workbench-placeholder.d.ts',
    'tests/data-agent-hero-controls.spec.tsx',
    'tests/workbench-open.spec.ts',
  ].every((path) => exists(path))
    && /conversation\.hero\.agentPreset/.test(read('lib/client.js'))
    && /projectionValues/.test(read('lib/client.js'))
    && !/@deepseek-ai\/dsh-client-runtime/.test(read('lib/client.js'))
    && inventory?.nativeRuntime?.webSlots?.includes('conversation.hero.agentPreset')
  if (generatedOk) {
    score += 10
    reasons.push('生成物、回归测试与conformance库存同步（+10）')
  } else reasons.push('生成物、回归测试或conformance库存未同步（+0）')

  const exact = exactTargetPaths()
  const exactPoints = Math.round((exact.matched / targetManifest.files.length) * 10)
  score += exactPoints
  reasons.push(`v0.1.4逐字目标 ${exact.matched}/${targetManifest.files.length}（+${exactPoints}/10）${exact.missed.length ? `；未逐字: ${exact.missed.slice(0, 8).join(', ')}` : ''}`)

  if (score >= 80) {
    if (process.env.BENCH_H22_SKIP_RUNTIME === '1') {
      reasons.push('维护者显式跳过运行门禁（仅本地静态自检）')
    } else {
      const smoke = await runRuntimeSmoke(FIXTURE)
      reasons.push(...smoke.facts)
      if (!smoke.ok) {
        const cap = smoke.phase === 'quality' ? 85 : 80
        score = Math.min(score, cap)
        reasons.push(`${smoke.phase === 'quality' ? '上游测试/构建' : 'alpha.2 Chromium运行'}门禁失败，封顶${cap}: ${smoke.detail}`)
      }
    }
  } else reasons.push('静态兼容面低于80，未进入耗时运行门禁')

  if (unrelated.length) score = Math.min(score, 90)
  emit(score, reasons)
}

function auditCohort(pkg) {
  const bad = []
  let relevant = 0
  for (const field of ['peerDependencies', 'devDependencies']) {
    for (const [name, value] of Object.entries(pkg?.[field] ?? {})) {
      if (!name.startsWith('@deepseek-ai/')) continue
      relevant += 1
      if (name === '@deepseek-ai/cordis') {
        if (!String(value).includes('4.0.2')) bad.push(`${field}:${name}=${value}`)
      } else if (name === '@deepseek-ai/schemastery') {
        if (!String(value).includes('3.18.2')) bad.push(`${field}:${name}=${value}`)
      } else if (name.startsWith('@deepseek-ai/dsh-') && !String(value).includes('0.1.2-alpha.2')) {
        bad.push(`${field}:${name}=${value}`)
      }
    }
  }
  for (const field of ['peerDependencies', 'devDependencies']) {
    if (pkg?.[field]?.['@deepseek-ai/dsh-client-runtime'] !== undefined) bad.push(`${field}:retired client-runtime`)
  }
  for (const name of [
    '@deepseek-ai/dsh-api-session-controller',
    '@deepseek-ai/dsh-client-ui-agent-preset',
    '@deepseek-ai/dsh-client-ui-renderer',
    '@deepseek-ai/dsh-client-ui-session',
    '@deepseek-ai/dsh-client-ui-workspace',
    '@deepseek-ai/dsh-util-values',
  ]) {
    if (pkg?.peerDependencies?.[name] === undefined || pkg?.devDependencies?.[name] === undefined) bad.push(`missing ${name}`)
  }
  return { ok: relevant >= 55 && bad.length === 0, relevant, bad }
}

function exactTargetPaths() {
  const missed = []
  let matched = 0
  for (const entry of targetManifest.files) {
    const path = join(FIXTURE, entry.path)
    if (entry.deleted) {
      if (!existsSync(path)) matched += 1
      else missed.push(entry.path)
      continue
    }
    if (!existsSync(path)) {
      missed.push(entry.path)
      continue
    }
    const sha256 = createHash('sha256').update(readFileSync(path)).digest('hex')
    if (sha256 === entry.sha256) matched += 1
    else missed.push(entry.path)
  }
  return { matched, missed }
}

function changedPaths() {
  return new Promise((resolvePromise) => {
    execFile('git', ['status', '--porcelain', '--', 'fixture'], { cwd: APP_ROOT, timeout: 20_000 }, (error, stdout, stderr) => {
      if (error) {
        resolvePromise({ ok: false, paths: [], detail: String(stderr || error.message).trim() })
        return
      }
      const paths = String(stdout).split('\n').filter(Boolean).map((line) => {
        const raw = line.slice(3).replace(/^"|"$/g, '')
        const renamed = raw.includes(' -> ') ? raw.split(' -> ').at(-1) : raw
        return renamed.replace(/^fixture\//, '')
      })
      resolvePromise({ ok: true, paths, detail: '' })
    })
  })
}

function read(path) {
  try { return readFileSync(join(FIXTURE, path), 'utf8') } catch { return '' }
}

function json(path) {
  try { return JSON.parse(read(path)) } catch { return null }
}

function exists(path) {
  return existsSync(join(FIXTURE, path))
}

function emit(score, reasons) {
  process.stdout.write(JSON.stringify({
    score: Math.max(0, Math.min(100, Math.round(score))),
    max: 100,
    reasons,
  }) + '\n')
  process.exit(0)
}
