import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
const fail = (file, message) => failures.push(`${relative(root, file).replaceAll('\\', '/')}: ${message}`)

async function walk(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(path)))
    else files.push(path)
  }
  return files
}

function parseFrontmatter(text, file, required = true) {
  const normalized = text.replaceAll('\r\n', '\n')
  if (!normalized.startsWith('---\n')) {
    if (required) fail(file, 'missing YAML frontmatter')
    return { meta: {}, body: normalized }
  }
  const end = normalized.indexOf('\n---\n', 4)
  if (end < 0) {
    fail(file, 'unterminated YAML frontmatter')
    return { meta: {}, body: normalized }
  }
  const meta = {}
  for (const line of normalized.slice(4, end).split('\n')) {
    if (!line.trim()) continue
    const match = /^([A-Za-z][A-Za-z0-9-]*):\s*(.*)$/.exec(line)
    if (!match) {
      fail(file, `unsupported frontmatter line: ${line}`)
      continue
    }
    const [, key, raw] = match
    const value = raw.replace(/^['"]|['"]$/g, '')
    meta[key] = /^\d+$/.test(value) ? Number(value) : value
  }
  return { meta, body: normalized.slice(end + 5) }
}

const allFiles = await walk(root)
const markdownFiles = allFiles.filter((file) => file.endsWith('.md'))

// Skill frontmatter and directory ownership.
const skillsRoot = join(root, 'skills')
const skillEntries = (await readdir(skillsRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory())
for (const entry of skillEntries) {
  const file = join(skillsRoot, entry.name, 'SKILL.md')
  if (!existsSync(file)) {
    fail(file, 'missing SKILL.md')
    continue
  }
  const { meta } = parseFrontmatter(await readFile(file, 'utf8'), file)
  if (meta.name !== entry.name) fail(file, `name must equal directory (${entry.name})`)
  if (typeof meta.description !== 'string' || meta.description.trim().length < 20) {
    fail(file, 'description must state a concrete trigger')
  }
}

// Repository-relative Markdown links; external links are deliberately not network-gated.
for (const file of markdownFiles) {
  const text = await readFile(file, 'utf8')
  const links = text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)
  for (const match of links) {
    let target = match[1].trim().replace(/^<|>$/g, '')
    if (/^(https?:|mailto:|#)/.test(target)) continue
    target = target.split('#', 1)[0].split('?', 1)[0]
    if (!target) continue
    if (!existsSync(resolve(dirname(file), target))) fail(file, `broken relative link: ${match[1]}`)
  }
}

// CONTRIBUTING delegates the card schema instead of maintaining a second copy.
const contributingFile = join(root, 'CONTRIBUTING.md')
const contributingText = await readFile(contributingFile, 'utf8')
for (const required of [
  'skills/plugin-upgrade/references/README.md',
  '#1–#7',
  'scripts/validate.mjs',
  'scripts/validate-manifests.mjs',
]) {
  if (!contributingText.includes(required)) fail(contributingFile, `missing current contribution contract: ${required}`)
}
if (/\bBC-\d{2}\b|六类触点/.test(contributingText)) fail(contributingFile, 'contains retired card schema')

// Every skill is self-contained: relative links stay inside skills/<name>/ so installers
// that copy only that directory (npx skills, gemini skills install, Cursor) get a working skill.
// plugin-test and plugin-write additionally must not depend on plugin-upgrade (#19).
const standalone = new Set(['plugin-test', 'plugin-write'])
for (const entry of skillEntries) {
  const skillRoot = join(skillsRoot, entry.name)
  const files = (await walk(skillRoot)).filter((file) => file.endsWith('.md'))
  for (const file of files) {
    const text = await readFile(file, 'utf8')
    if (standalone.has(entry.name) && /\bplugin-upgrade\b/.test(text)) fail(file, 'standalone skill must not depend on plugin-upgrade')
    for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      let target = match[1].trim().replace(/^<|>$/g, '')
      if (/^(https?:|mailto:|#)/.test(target)) continue
      target = target.split('#', 1)[0].split('?', 1)[0]
      if (!target) continue
      const resolved = resolve(dirname(file), target)
      if (relative(skillRoot, resolved).startsWith('..')) {
        fail(file, `link leaves the skill directory: ${match[1]}`)
      }
    }
  }
}

// Version-card schema, IDs and directed corridor metadata.
const referencesDir = join(root, 'skills', 'plugin-upgrade', 'references')
const cardFiles = (await readdir(referencesDir))
  .filter((name) => /^v.*\.md$/.test(name))
  .map((name) => join(referencesDir, name))
const requiredMeta = ['kind', 'schema', 'from', 'to', 'status', 'coverage', 'cardCount', 'idPrefix', 'verifiedAt']
const requiredFields = ['类型', '适用对象', '影响触点', '操作级别', '症状', '迁移配方', '验证', '来源']
const allowedTypes = new Set(['breaking', 'behavior', 'capability', 'fix', 'security', 'privacy'])
const allowedActions = /^(required|conditional|optional|informational|required-if-[A-Za-z0-9.-]+)$/
const tag = /^dsh-v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const allCardIds = new Set()
const edges = new Map()
let totalCards = 0
const indexText = await readFile(join(referencesDir, 'README.md'), 'utf8')

for (const file of cardFiles) {
  const text = await readFile(file, 'utf8')
  const { meta, body } = parseFrontmatter(text, file)
  for (const key of requiredMeta) if (meta[key] === undefined || meta[key] === '') fail(file, `missing metadata: ${key}`)
  if (meta.kind !== 'dsh-version-card-set') fail(file, 'kind must be dsh-version-card-set')
  if (meta.schema !== 1) fail(file, 'schema must be 1')
  if (!tag.test(String(meta.from))) fail(file, `invalid from tag: ${meta.from}`)
  if (!tag.test(String(meta.to))) fail(file, `invalid to tag: ${meta.to}`)
  if (meta.from === meta.to) fail(file, 'from and to must differ')
  if (!['draft', 'reviewed'].includes(meta.status)) fail(file, `invalid status: ${meta.status}`)
  if (!['curated', 'complete'].includes(meta.coverage)) fail(file, `invalid coverage: ${meta.coverage}`)
  if (edges.has(meta.from)) fail(file, `duplicate corridor edge from ${meta.from}`)
  edges.set(meta.from, meta.to)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(meta.verifiedAt))) fail(file, `verifiedAt must be an ISO date (YYYY-MM-DD), got: ${meta.verifiedAt}`)

  const headings = [...body.matchAll(/^###\s+([A-Za-z0-9.-]+)\s+·\s+.+$/gm)]
  if (headings.length !== meta.cardCount) fail(file, `cardCount=${meta.cardCount}, found ${headings.length}`)
  if (!indexText.includes(`](${basename(file)})`) || !indexText.includes(`| ${meta.cardCount} |`)) {
    fail(file, 'version index is missing this file or its card count')
  }
  let previousSuffix = 0
  for (const heading of headings) {
    const match = /-(\d{2})$/.exec(heading[1])
    const suffix = match === null ? NaN : Number(match[1])
    if (!Number.isInteger(suffix) || suffix <= previousSuffix) {
      fail(file, `${heading[1]} must use a two-digit suffix strictly increasing from the previous card`)
    }
    previousSuffix = suffix
  }

  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index]
    const id = heading[1]
    const end = headings[index + 1]?.index ?? body.length
    const card = body.slice(heading.index, end)
    if (!id.startsWith(`${meta.idPrefix}-`)) fail(file, `${id} does not match idPrefix ${meta.idPrefix}`)
    if (allCardIds.has(id)) fail(file, `duplicate card ID: ${id}`)
    allCardIds.add(id)
    totalCards += 1

    for (const field of requiredFields) {
      if (!new RegExp(`^- \\*\\*${field}\\*\\*:`, 'm').test(card)) fail(file, `${id} missing field: ${field}`)
    }
    const type = /^- \*\*类型\*\*:\s*([^\r\n]+)/m.exec(card)?.[1]?.trim()
    const action = /^- \*\*操作级别\*\*:\s*([^\r\n]+)/m.exec(card)?.[1]?.trim()
    if (!allowedTypes.has(type)) fail(file, `${id} invalid type: ${type}`)
    if (!allowedActions.test(action ?? '')) fail(file, `${id} invalid action: ${action}`)
    if (!/^- \*\*来源\*\*:[\s\S]*?https:\/\//m.test(card)) fail(file, `${id} must cite a primary URL`)
    const sourceLine = /^- \*\*来源\*\*:([^\r\n]+)/m.exec(card)?.[1] ?? ''
    for (const match of sourceLine.matchAll(/https:\/\/[^ )]+/g)) {
      if (/github\.com\/[^/]+\/[^/]+\/blob\/(main|master)([/?#]|$)/.test(match[0])) {
        fail(file, `${id} source must pin a tag or commit, got an unpinned blob link: ${match[0]}`)
      }
    }
  }
}

// Corridor edges must not cycle.
for (const start of edges.keys()) {
  const seen = new Set()
  let cursor = start
  while (edges.has(cursor)) {
    if (seen.has(cursor)) {
      fail(join(referencesDir, 'README.md'), `version corridor cycle at ${cursor}`)
      break
    }
    seen.add(cursor)
    cursor = edges.get(cursor)
  }
}

// Every full card reference in Markdown must resolve; retired short IDs are forbidden.
for (const file of markdownFiles) {
  const text = await readFile(file, 'utf8')
  for (const match of text.matchAll(/\bDSH-\d+\.\d+\.\d+-A\d+-\d{2}\b/g)) {
    if (!allCardIds.has(match[0])) fail(file, `unknown card reference: ${match[0]}`)
  }
  if (/\bALPHA[12]-\d{2}\b/.test(text)) fail(file, 'contains retired short card ID')
}

// The rollup is a current navigation document, not an unchecked historical snapshot.
const rollupFile = join(referencesDir, 'rollup-0.1.2.md')
const rollupText = await readFile(rollupFile, 'utf8')
for (const required of ['#7 子进程']) {
  if (!rollupText.includes(required)) fail(rollupFile, `missing current rollup contract: ${required}`)
}
if (/Consumer.*永不 reject|#6 子进程|git checkout <tag> -- pnpm-lock\.yaml/.test(rollupText)) {
  fail(rollupFile, 'contains a retired Remote, touchpoint, or rollback rule')
}

// Executable pre-flight patterns must be valid and hit the static fixture.
const patternFile = join(referencesDir, 'pre-flight-patterns.json')
const patternData = JSON.parse(await readFile(patternFile, 'utf8'))
if (patternData.schema !== 1) fail(patternFile, 'schema must be 1')
const ids = patternData.classes.map((entry) => entry.id)
if (new Set(ids).size !== 7 || ![1, 2, 3, 4, 5, 6, 7].every((id) => ids.includes(id))) {
  fail(patternFile, 'touchpoint IDs must be exactly 1..7')
}
const fixtureRoot = join(root, 'skills', 'plugin-upgrade', 'examples', 'legacy-plugin')
const fixtureFiles = (await walk(fixtureRoot)).filter((file) => basename(file) !== 'README.md')
const fixtureText = (await Promise.all(fixtureFiles.map((file) => readFile(file, 'utf8')))).join('\n')
for (const entry of patternData.classes) {
  let hit = false
  for (const source of entry.patterns) {
    try {
      if (new RegExp(source, 'm').test(fixtureText)) hit = true
    } catch (error) {
      fail(patternFile, `#${entry.id} invalid regex ${source}: ${error.message}`)
    }
  }
  if (!hit) fail(patternFile, `#${entry.id} has no fixture hit`)
}

// Host and Web Client examples must execute their distinct control-flow contracts.
const faceCheckFile = join(root, 'skills', 'plugin-upgrade', 'examples', 'face-contracts', 'check.mjs')
try {
  const { runFaceContractChecks } = await import(pathToFileURL(faceCheckFile).href)
  await runFaceContractChecks()
} catch (error) {
  fail(faceCheckFile, `face contract check failed: ${error.stack ?? error.message}`)
}

// The planner must stay read-only, redact source lines, resolve card corridors, and report gaps.
const plannerCheckFile = join(root, 'skills', 'plugin-upgrade', 'scripts', 'plan-migration.check.mjs')
try {
  const { runMigrationPlannerChecks } = await import(pathToFileURL(plannerCheckFile).href)
  await runMigrationPlannerChecks()
} catch (error) {
  fail(plannerCheckFile, `migration planner check failed: ${error.stack ?? error.message}`)
}

// Official compatibility, community recommendations, collision semantics, and CLI behavior must agree.
const namingCheckFile = join(root, 'skills', 'plugin-write', 'scripts', 'validate-names.check.mjs')
try {
  const { runNamingValidatorChecks } = await import(pathToFileURL(namingCheckFile).href)
  await runNamingValidatorChecks()
} catch (error) {
  fail(namingCheckFile, `naming validator check failed: ${error.stack ?? error.message}`)
}

// The online phase must consume only registry v2, preserve offline validation, and distinguish unavailable from free.
const registryCheckFile = join(root, 'skills', 'plugin-write', 'scripts', 'query-registry.check.mjs')
try {
  const { runRegistryQueryChecks } = await import(pathToFileURL(registryCheckFile).href)
  await runRegistryQueryChecks()
} catch (error) {
  fail(registryCheckFile, `registry query check failed: ${error.stack ?? error.message}`)
}

if (failures.length) {
  console.error(`Validation failed (${failures.length}):`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`Validation OK: ${skillEntries.length} skill, ${cardFiles.length} card sets, ${totalCards} cards, ${markdownFiles.length} Markdown files, 7 touchpoint fixtures, 2 face contracts, read-only planner, offline naming validator, read-only registry v2 query`)
