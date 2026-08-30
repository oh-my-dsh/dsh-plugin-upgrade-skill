#!/usr/bin/env node
/**
 * 校验多 agent 清单文件与斜杠命令的一致性。
 *
 * 检查项：
 * 1. 所有清单 JSON 可解析
 * 2. 各清单声明的 version 一致
 * 3. 清单指向的 skills 目录存在
 * 4. skills/ 下每个 skill 有带 name/description 前置元数据的 SKILL.md
 * 5. 各 agent 目录的斜杠命令集合一致，且 description 相同
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const errors = []
const fail = (msg) => errors.push(msg)

/** 读取并解析 JSON；失败时记录错误并返回 null。 */
function readJson(rel) {
  const abs = join(root, rel)
  if (!existsSync(abs)) return fail(`缺少清单文件：${rel}`), null
  try {
    return JSON.parse(readFileSync(abs, 'utf8'))
  } catch (error) {
    return fail(`${rel} JSON 解析失败：${error.message}`), null
  }
}

// 1–2. 清单可解析且版本一致
const manifests = {
  '.claude-plugin/plugin.json': readJson('.claude-plugin/plugin.json'),
  '.claude-plugin/marketplace.json': readJson('.claude-plugin/marketplace.json'),
  '.codex-plugin/plugin.json': readJson('.codex-plugin/plugin.json'),
  '.agents/plugins/marketplace.json': readJson('.agents/plugins/marketplace.json'),
}

const versions = new Map()
for (const [rel, manifest] of Object.entries(manifests)) {
  if (!manifest) continue
  const found = manifest.version ?? manifest.plugins?.[0]?.version
  if (!found) fail(`${rel} 未声明 version`)
  else versions.set(rel, found)
}
const distinct = new Set(versions.values())
if (distinct.size > 1) {
  const detail = [...versions].map(([rel, v]) => `${rel}=${v}`).join(', ')
  fail(`清单版本不一致：${detail}`)
}

// 3. skills 目录存在
for (const [rel, manifest] of Object.entries(manifests)) {
  const skills = manifest?.skills
  if (typeof skills !== 'string') continue
  if (!existsSync(join(root, skills))) fail(`${rel} 的 skills 路径不存在：${skills}`)
}

// 4. 每个 skill 有合法 SKILL.md 前置元数据
const skillsDir = join(root, 'skills')
const skillNames = existsSync(skillsDir)
  ? readdirSync(skillsDir).filter((entry) => statSync(join(skillsDir, entry)).isDirectory())
  : []
if (skillNames.length === 0) fail('skills/ 下没有任何 skill 目录')

for (const name of skillNames) {
  const rel = `skills/${name}/SKILL.md`
  const abs = join(root, rel)
  if (!existsSync(abs)) {
    fail(`缺少 ${rel}`)
    continue
  }
  const text = readFileSync(abs, 'utf8')
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!frontmatter) {
    fail(`${rel} 缺少 YAML 前置元数据`)
    continue
  }
  const body = frontmatter[1]
  const declared = /^name:\s*(.+)$/m.exec(body)?.[1].trim()
  if (!declared) fail(`${rel} 前置元数据缺少 name`)
  else if (declared !== name) fail(`${rel} 的 name「${declared}」与目录名「${name}」不一致`)
  if (!/^description:\s*\S/m.test(body)) fail(`${rel} 前置元数据缺少 description`)
}

// 5. 斜杠命令跨工具对齐
/** 收集一个命令目录下的命令名 → description。 */
function collectCommands(dir, ext, extract) {
  const abs = join(root, dir)
  if (!existsSync(abs)) return null
  const out = new Map()
  for (const file of readdirSync(abs).filter((f) => f.endsWith(ext))) {
    const text = readFileSync(join(abs, file), 'utf8')
    out.set(file.slice(0, -ext.length), extract(text))
  }
  return out
}

const claudeCommands = collectCommands('.claude/commands', '.md', (text) =>
  /^description:\s*(.+)$/m.exec(text)?.[1].trim(),
)
const geminiCommands = collectCommands('.gemini/commands', '.toml', (text) =>
  /^description\s*=\s*"(.*)"$/m.exec(text)?.[1].trim(),
)

if (claudeCommands && geminiCommands) {
  for (const name of claudeCommands.keys()) {
    if (!geminiCommands.has(name)) fail(`命令 ${name} 缺少 .gemini/commands/${name}.toml`)
  }
  for (const name of geminiCommands.keys()) {
    if (!claudeCommands.has(name)) fail(`命令 ${name} 缺少 .claude/commands/${name}.md`)
  }
  for (const [name, description] of claudeCommands) {
    if (!description) fail(`.claude/commands/${name}.md 缺少 description`)
    else if (geminiCommands.has(name) && geminiCommands.get(name) !== description) {
      fail(`命令 ${name} 的 description 在 Claude 与 Gemini 之间不一致`)
    }
  }
}

// Distribution docs must use commands supported by the current CLI surfaces.
const readme = readFileSync(join(root, 'README.md'), 'utf8')
if (/\bcodex plugin add\b/.test(readme)) fail('README.md 使用不存在的 codex plugin add')
if (!/codex plugin marketplace add/.test(readme)) fail('README.md 缺少 Codex marketplace add 安装路径')
if (/git config --global url\./.test(readme)) fail('README.md 不得建议全局重写 GitHub URL')

// The conventional local entry point must run both dependency-free validators.
const rootPackage = readJson('package.json')
const validateScript = rootPackage?.scripts?.validate ?? ''
if (!validateScript.includes('scripts/validate.mjs') || !validateScript.includes('scripts/validate-manifests.mjs')) {
  fail('package.json scripts.validate 必须串联两个 validator')
}
if (rootPackage?.scripts?.test !== 'npm run validate') fail('package.json scripts.test 必须委托 npm run validate')

if (errors.length > 0) {
  console.error('清单校验失败：')
  for (const error of errors) console.error(`  - ${error}`)
  process.exit(1)
}

const version = distinct.values().next().value
console.log(`清单校验通过：${Object.keys(manifests).length} 个清单，版本 ${version}`)
console.log(`skills：${skillNames.join(', ')}`)
if (claudeCommands) console.log(`命令：${[...claudeCommands.keys()].join(', ')}`)
