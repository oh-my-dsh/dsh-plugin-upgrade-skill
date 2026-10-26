#!/usr/bin/env node
// scaffold.mjs —— 第 0 步（可选）：从零造插件，一条命令出可冒烟的骨架。
//
// 输入 coordinate（namespace/name）+ 形态（tool/hook/service/config/llm-adapter），
// 生成五件套：package.json、lib/index.js、cordis.patch.yml、dsh-plugin.naming.json、
// README。命名投影按上游 plugin-write 的 collision-resistant 规则全量推导，
// 不让 agent 手工抄 manifest。
//
// 模板依据（不得凭记忆改写契约）：
//   - 形态契约：上游 plugin-write skill 五份 form reference（tool/hook/service/
//     config/llm-adapter-plugin.md），本文件只抽最小可跑骨架，完整规则仍以原文为准
//   - 命名投影：上游 naming-conventions.md 的 community coordinate 表
//   - 挂载层形状：对拍本机真实插件（argo-dsh / plainspoken-writing-dsh 的
//     cordis.patch.yml，均为 `- insert:` + `- id:` + `name:` 条目）
//   - 免构建路线：外部插件不带构建链（对拍 argo-dsh：纯 JS、零依赖、main 直指
//     源文件），tool/hook 骨架因此零 npm 依赖即可冒烟
//
// 诚实边界：
//   - service/config/llm-adapter 依赖宿主提供的 @deepseek-ai/* 基类（cordis/
//     schemastery/dsh-llm），本机没装就 import 不了，自动冒烟只对 tool/hook 跑；
//     其余三形态生成结构骨架，装包后手动跑 quick-smoke
//   - llm-adapter 的基类导出与包名上游文档没有钉死，骨架里是 TODO 占位，
//     生成后必须对照目标宿主 checkout 核对（参考 packages/llm/llm-deepseek）
//   - 骨架语法与结构由本脚本保证；naming 的完整语义校验（碰撞推荐、registry
//     查询）仍走上游 plugin-write 的 validate-names / query-registry 两个脚本

import fs from 'node:fs'
import path from 'node:path'
import { printJson } from './lib/scanner.mjs'
import { parsePatchEntries, candidateGlobalRoots } from './env-doctor.mjs'
import { runQuickSmoke } from './quick-smoke.mjs'

const FORMS = ['tool', 'hook', 'service', 'config', 'llm-adapter']

// 零依赖可自动冒烟的形态；其余依赖宿主 @deepseek-ai/* 基类，缺包时 import 必炸
const SMOKEABLE_FORMS = new Set(['tool', 'hook'])

// kebab 语法（namespace 与插件名同一条官方惯例；settings/command 正则在
// naming-conventions 里更宽，但收在这里能保证全部投影天然合法）
const KEBAB_RE = /^[a-z]([a-z0-9]*(-[a-z0-9]+)*)?$/

// ── 命名投影（collision-resistant profile）─────────────────────────────────

export function projectNames(namespace, name) {
  const base = `${namespace}-${name}`
  const camel = base
    .split('-')
    .map((seg, i) => (i === 0 ? seg : seg[0].toUpperCase() + seg.slice(1)))
    .join('')
  const pascal = camel[0].toUpperCase() + camel.slice(1)
  return {
    coordinate: `${namespace}/${name}`,
    packageName: `@${namespace}/dsh-${name}`,
    pluginNames: [name],
    loaderIds: [base],
    services: [`${camel}Index`],
    tools: [`${base.replace(/-/g, '_')}_query`],
    commands: [base],
    skills: [base],
    skillProviders: [`${base}-filesystem`],
    events: [`${base}/ready`],
    settingsNamespaces: [base],
    routes: [{ kind: 'exact', path: `/api/plugins/${base}/query` }],
    // 内部引用用
    base, camel, pascal,
  }
}

function validateCoordinate(coordinate) {
  const slash = coordinate.indexOf('/')
  if (slash === -1 || slash !== coordinate.lastIndexOf('/')) {
    throw new UsageError(`coordinate 必须是 <namespace>/<name> 形式（如 taxueseek/my-tool），实得「${coordinate}」`)
  }
  const namespace = coordinate.slice(0, slash)
  const name = coordinate.slice(slash + 1)
  if (!KEBAB_RE.test(namespace)) {
    throw new UsageError(`namespace 须为小写 kebab（${KEBAB_RE.source}），实得「${namespace}」`)
  }
  if (!KEBAB_RE.test(name)) {
    throw new UsageError(`name 须为小写 kebab（${KEBAB_RE.source}），实得「${name}」`)
  }
  return { namespace, name }
}

export class UsageError extends Error {}

// ── 宿主版本探测（显式参数 > 全局安装 > null）───────────────────────────────

export function detectHarnessVersion({ env = process.env, platform = process.platform } = {}) {
  for (const root of candidateGlobalRoots({ env, platform })) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, '@deepseek-ai', 'dsh', 'package.json'), 'utf8'))
      if (pkg?.version) return pkg.version
    } catch {}
  }
  return null
}

// ── 骨架模板 ────────────────────────────────────────────────────────────────

function packageJsonTemplate(names, form, harnessVersion) {
  const formSentence = {
    tool: '模型可调用工具插件（raw JSON Schema 注册，registry 原生支持）',
    hook: '钩子插件（在 tools/pre-execute 等扩展点拦截，waterfall 语义）',
    service: '服务插件（向其他插件通过 ctx 提供能力）',
    config: '配置插件（cordis.yml 提供用户配置，Schemastery 校验）',
    'llm-adapter': 'LLM adapter 插件（接入新模型 provider，协议义务多，见 README）',
  }[form]
  const pkg = {
    name: names.packageName,
    version: '0.1.0',
    description: `DSH ${formSentence}。由 dsh-plugin-fast-adapt scaffold 生成（针对 dsh-v${harnessVersion || 'unknown'}）`,
    license: 'MIT',
    type: 'module',
    main: './lib/index.js',
    exports: {
      '.': './lib/index.js',
      './package.json': './package.json',
    },
    files: ['lib', 'cordis.patch.yml'],
    dsh: {
      bundle: { patch: './cordis.patch.yml' },
    },
    engines: { node: '>=18' },
    keywords: ['deepseek-harness', 'dsh', 'cordis', form],
  }
  return JSON.stringify(pkg, null, 2) + '\n'
}

function namingManifestTemplate(names) {
  const manifest = {
    schemaVersion: 1,
    policy: 'dsh-plugin-naming/v1',
    plugin: {
      namespace: names.coordinate.split('/')[0],
      name: names.pluginNames[0],
      coordinate: names.coordinate,
      packageName: names.packageName,
    },
    names: {
      pluginNames: names.pluginNames,
      loaderIds: names.loaderIds,
      services: names.services,
      tools: names.tools,
      commands: names.commands,
      skills: names.skills,
      skillProviders: names.skillProviders,
      events: names.events,
      settingsNamespaces: names.settingsNamespaces,
      routes: names.routes,
    },
  }
  return JSON.stringify(manifest, null, 2) + '\n'
}

function patchYmlTemplate(names) {
  return `# ${names.coordinate} 挂载层（bundle patch）。
#
# 宿主组合时按这里把插件插进会话；没有本条目，装了也不会生效（env-doctor
# 的 activation 检查看的就是 patch 层有没有提及插件）。同 id + 同 name 的
# 条目在用户层 cordis.patch.yml 里是替换语义，可用于覆盖配置。装进 profile
# 后重启宿主生效。
#
# config 里的字段由插件入口的 Config Schema 校验；Loader 元数据（id/name/
# disabled/inject 等）必须保持字面量，不要用 !!js 表达式（disabled 用 !!js
# 会恒为真值，插件永远被禁用）。

- insert:
    - id: ${names.loaderIds[0]}
      name: '${names.packageName}'
`
}

function entryTemplate(form, names) {
  if (form === 'tool') {
    return `// 零依赖最小工具插件：raw JSON Schema 注册（registry 原生支持这条路）。
// 要类型增强（defineTool 自动校验参数与推导 execute 类型）时，装
// @deepseek-ai/dsh-tools 后按上游 plugin-write skill 的 tool-plugin.md 迁移。
// 完整契约（execute 的九条义务、输出投影、UI 卡片、Code Mode）见该文档。

export const name = '${names.pluginNames[0]}'
export const inject = ['tools']

export function apply(ctx) {
  ctx.tools.register({
    name: '${names.tools[0]}',
    description: 'TODO: 一句话说清这个工具给模型什么能力。',
    parameters: {
      query: { type: 'string', required: true, description: 'TODO: 参数含义' },
    },
    async execute(args, exec) {
      // TODO: 实现真正的能力。exec.signal 中止时尽快返回；抛错即 isError。
      return { query: args.query }
    },
  })
}
`
  }
  if (form === 'hook') {
    return `// 零依赖最小钩子插件：在 tools/pre-execute 扩展点拦截工具调用。
// waterfall 语义（重点）：监听器收到 (...args, next)。不调 next() 就是
// 短路整条链——只做观察的监听器必须调 next() 把决定权交回去，静默接管
// 是这个形态最危险的坑。完整扩展点表与规则见上游 plugin-write 的
// hook-plugin.md。

export const name = '${names.pluginNames[0]}'

export function apply(ctx) {
  ctx.on('tools/pre-execute', async (exec, next) => {
    // TODO: 策略判断。返回 { kind: 'deny', reason } 拒绝；
    // { kind: 'ask', ... } 走 ctx.approval 征求批准；放行就 return next()。
    return next()
  })
}
`
  }
  if (form === 'service') {
    return `// 最小服务插件：class 形态向其他插件提供 ctx 能力。
// 依赖宿主提供的 @deepseek-ai/cordis（Service 基类），本机装了 DSH 宿主或
// 在插件目录 npm install 后才能 import。加载期强依赖缺失时插件静默 pending
// 不报错（Cordis 的已知陷阱，env-doctor 的 activation 段查这个）。
// 完整契约（声明合并、typed events、HMR、capability seam 拆包判据）见
// 上游 plugin-write 的 service-plugin.md。

import { Service } from '@deepseek-ai/cordis'

export default class ${names.pascal}Service extends Service {
  static inject = []

  constructor(ctx) {
    super(ctx, '${names.camel}Index')
  }

  // TODO: 公共方法写 JSDoc @param/@returns；消费者声明 inject:
  // ['${names.camel}Index'] 使用本服务。
}
`
  }
  if (form === 'config') {
    return `// 最小配置插件：cordis.yml 的 config 行提供用户配置。
// 依赖宿主提供的 @deepseek-ai/schemastery。必须导出 Schemastery Schema，
// 不能导出普通对象（Cordis 走 Standard Schema 接口校验，普通对象会在
// 加载期失败）。无效配置必须在加载期显式报错，不许静默吞。
// 完整规则（!!js 边界、凭据不入配置、HMR）见上游 plugin-write 的
// config-plugin.md。

import Schema from '@deepseek-ai/schemastery'

export const Config = Schema.object({
  greeting: Schema.string().default('Hello'),
})

export function apply(ctx, config) {
  // config 已过 Schema 校验并填好默认值。
  // TODO: 可调参数一律走 Config，不许在代码里写死部署值。
}
`
  }
  // llm-adapter —— 五形态里唯一「生成后必须对照宿主源码核名」的：
  // 基类 LlmAdapter 的 import 来源上游文档没有钉死，不能替用户猜。
  return `// ⚠ LLM adapter 是五形态里协议义务最重的（streaming 闭联集、usage 先于
// finish、tool-call 参数原样透传、两条错误路径、attribution 头、空闲超时
// 上限……），本骨架只是结构起点。
//
// 生成后必做：对照目标宿主 checkout 核对 LlmAdapter 的 import 来源与导出
// 名（参考 packages/llm/llm-deepseek），再按上游 plugin-write 的
// llm-adapter-plugin.md 逐条过「协议义务」清单。

export const name = '${names.pluginNames[0]}'
export const inject = ['llm']

// TODO: import { LlmAdapter } from '<以目标宿主 checkout 为准>'
// TODO: class Adapter extends LlmAdapter { async *stream(options) { ... } }

export function apply(ctx) {
  // TODO: ctx.llm.registerAdapter(['${names.base}'], new Adapter())
  // 同一 provider 路由重复注册会抛错；replace() 可原子换路由集。
}
`
}

function readmeTemplate(names, form, harnessVersion) {
  const REF_ROOT = 'https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/tree/main/skills/plugin-write'
  return `# ${names.packageName}

DSH ${form} 形态插件骨架，由 [dsh-plugin-fast-adapt](https://github.com/taxueseek/plugin-fast-adapt) 的 scaffold 生成，针对 dsh-v${harnessVersion || 'unknown（未探测到本机宿主）'}。

## 文件

- \`lib/index.js\` — 插件入口（免构建纯 ESM，main 直指源文件）
- \`cordis.patch.yml\` — 挂载层；没有它装了不生效
- \`dsh-plugin.naming.json\` — 命名声明（collision-resistant 投影已全量生成）

## 下一步

1. **写完能力后过体检门**：\`node <fast-adapt>/scripts/write-gate.mjs .\` —— 冒烟＋启用就绪＋四维体检＋官方指南核查一条命令出报告（刚生成完可加 \`--skip-smoke\` 免重复冒烟）
2. **环境核查**：\`node <fast-adapt>/scripts/env-doctor.mjs .\` 看启用就绪度与覆盖层
3. **体检**：\`node <fast-adapt>/scripts/plugin-audit.mjs .\` 四维打分
4. **命名完整校验**（碰撞推荐 + registry 查询，可选联网）：
   \`node <plugin-write>/scripts/validate-names.mjs --manifest ./dsh-plugin.naming.json\`
5. **对照形态文档补能力**：${REF_ROOT}/references/ 下五份 form reference，本骨架只给了最小可跑结构

## 测试挂载

把 \`cordis.patch.yml\` 合进 profile（或 \`dsh plugin --profile <name> add <本目录>\`），重启宿主。${names.loaderIds[0]} 条目已按最小挂载生成。
`
}

// ── 生成主流程 ──────────────────────────────────────────────────────────────

export async function scaffoldPlugin({ coordinate, form, outDir, harnessVersion = undefined, autoSmoke = true } = {}) {
  if (!FORMS.includes(form)) {
    throw new UsageError(`--form 必须是 ${FORMS.join(' | ')} 之一，实得「${form}」`)
  }
  const { namespace, name } = validateCoordinate(coordinate)
  const names = projectNames(namespace, name)

  const resolvedOut = path.resolve(outDir || path.join(process.cwd(), `dsh-${name}`))
  if (fs.existsSync(resolvedOut) && fs.readdirSync(resolvedOut).length > 0) {
    throw new UsageError(`目标目录已存在且非空，拒绝覆盖: ${resolvedOut}`)
  }

  const detected = harnessVersion === undefined ? detectHarnessVersion() : harnessVersion

  const files = [
    ['package.json', packageJsonTemplate(names, form, detected)],
    ['lib/index.js', entryTemplate(form, names)],
    ['cordis.patch.yml', patchYmlTemplate(names)],
    ['dsh-plugin.naming.json', namingManifestTemplate(names)],
    ['README.md', readmeTemplate(names, form, detected)],
    ['.gitignore', 'node_modules/\n'],
  ]
  for (const [rel, content] of files) {
    const abs = path.join(resolvedOut, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
  }

  let smoke = null
  if (autoSmoke && SMOKEABLE_FORMS.has(form)) {
    const result = await runQuickSmoke(resolvedOut)
    smoke = {
      run: true,
      success: result.success,
      durationMs: result.durationMs ?? null,
      registeredTools: result.registeredTools ?? [],
      injectedServices: result.injectedServices ?? [],
      mockFallbacks: result.mockFallbacks ?? [],
      error: result.error ?? null,
    }
  }

  return {
    coordinate: names.coordinate,
    form,
    outDir: resolvedOut,
    harnessVersion: detected,
    files: files.map(([rel]) => rel),
    naming: {
      packageName: names.packageName,
      loaderIds: names.loaderIds,
      tools: names.tools,
      services: names.services,
    },
    smoke,
    nextSteps: [
      '写完能力后跑: node scripts/write-gate.mjs <outDir>  # 出生证：冒烟＋启用就绪＋四维体检＋指南核查（刚生成完可加 --skip-smoke 免重复冒烟）',
      'node scripts/env-doctor.mjs <outDir>  # 单看启用就绪度',
      '上游 validate-names / query-registry 做完整命名校验（可选联网）',
    ],
  }
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseArgv(argv) {
  const positional = []
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--form' || arg === '--out' || arg === '--harness') {
      const value = argv[++i]
      if (value === undefined) throw new UsageError(`${arg} 缺少值`)
      flags[arg.slice(2)] = value
    } else if (arg === '--no-smoke') {
      flags.noSmoke = true
    } else if (arg.startsWith('--')) {
      throw new UsageError(`未知参数「${arg}」，支持 --form/--out/--harness/--no-smoke`)
    } else {
      positional.push(arg)
    }
  }
  return { positional, flags }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  try {
    const { positional, flags } = parseArgv(process.argv.slice(2))
    if (positional.length !== 1) {
      throw new UsageError('用法: node scripts/scaffold.mjs <namespace>/<name> --form tool|hook|service|config|llm-adapter [--out <dir>] [--harness <version>] [--no-smoke]')
    }
    const result = await scaffoldPlugin({
      coordinate: positional[0],
      form: flags.form,
      outDir: flags.out,
      harnessVersion: flags.harness,
      autoSmoke: !flags.noSmoke,
    })
    printJson(result)
    process.stderr.write(`\n[骨架已生成] ${result.coordinate}（${result.form}）→ ${result.outDir}\n`)
    process.stderr.write(`目标宿主: dsh-v${result.harnessVersion || '未探测到，README 里已如实标注'}\n`)
    if (result.smoke) {
      if (result.smoke.success) {
        process.stderr.write(`冒烟: 通过（${result.smoke.durationMs}ms，注册工具 ${result.smoke.registeredTools.length} 个${result.smoke.mockFallbacks.length ? `，Mock 兜底 ${result.smoke.mockFallbacks.length} 处` : ''}）\n`)
      } else {
        process.stderr.write(`冒烟: 失败——${result.smoke.error}\n`)
        process.exit(1)
      }
    } else {
      process.stderr.write('冒烟: 跳过（本形态依赖宿主基类，装包后手动跑 quick-smoke）\n')
    }
    process.stderr.write(`下一步:\n  - ${result.nextSteps.join('\n  - ')}\n`)
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`用法错误: ${err.message}\n`)
      process.exit(2)
    }
    process.stderr.write(`失败: ${err.stack || err.message}\n`)
    process.exit(1)
  }
}
