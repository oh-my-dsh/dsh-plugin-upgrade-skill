#!/usr/bin/env node
/**
 * Validate consistency across the multi-agent manifest files.
 *
 * Checks:
 * 1. Every manifest JSON parses
 * 2. All manifests declare the same version
 * 3. The skills directory each manifest points to exists
 * 4. Every skill under skills/ has a SKILL.md with name/description frontmatter
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const errors = []
const fail = (msg) => errors.push(msg)

/** Read and parse JSON; record the error and return null on failure. */
function readJson(rel) {
  const abs = join(root, rel)
  if (!existsSync(abs)) return fail(`Missing manifest file: ${rel}`), null
  try {
    return JSON.parse(readFileSync(abs, 'utf8'))
  } catch (error) {
    return fail(`Failed to parse ${rel} JSON: ${error.message}`), null
  }
}

// 1–2. Manifests parse and versions agree
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
  if (!found) fail(`${rel} does not declare a version`)
  else versions.set(rel, found)
}
const distinct = new Set(versions.values())
if (distinct.size > 1) {
  const detail = [...versions].map(([rel, v]) => `${rel}=${v}`).join(', ')
  fail(`Manifest versions are inconsistent: ${detail}`)
}

// 3. Skills directory exists
for (const [rel, manifest] of Object.entries(manifests)) {
  const skills = manifest?.skills
  if (typeof skills !== 'string') continue
  if (!existsSync(join(root, skills))) fail(`Skills path in ${rel} does not exist: ${skills}`)
}

// 4. Every skill has valid SKILL.md frontmatter
const skillsDir = join(root, 'skills')
const skillNames = existsSync(skillsDir)
  ? readdirSync(skillsDir).filter((entry) => statSync(join(skillsDir, entry)).isDirectory())
  : []
if (skillNames.length === 0) fail('No skill directories under skills/')

for (const name of skillNames) {
  const rel = `skills/${name}/SKILL.md`
  const abs = join(root, rel)
  if (!existsSync(abs)) {
    fail(`Missing ${rel}`)
    continue
  }
  const text = readFileSync(abs, 'utf8')
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!frontmatter) {
    fail(`${rel} is missing YAML frontmatter`)
    continue
  }
  const body = frontmatter[1]
  const declared = /^name:\s*(.+)$/m.exec(body)?.[1].trim()
  if (!declared) fail(`${rel} frontmatter is missing name`)
  else if (declared !== name) fail(`name "${declared}" in ${rel} does not match directory name "${name}"`)
  if (!/^description:\s*\S/m.test(body)) fail(`${rel} frontmatter is missing description`)
}

// Distribution docs must use commands supported by the current CLI surfaces.
// README.en.md mirrors README.md, so both are held to the same rules to prevent drift.
for (const doc of ['README.md', 'README.en.md']) {
  const text = readFileSync(join(root, doc), 'utf8')
  if (/\bcodex plugin add\b/.test(text)) fail(`${doc} uses the nonexistent codex plugin add`)
  if (!/codex plugin marketplace add/.test(text)) fail(`${doc} is missing the Codex marketplace add install path`)
  if (/git config --global url\./.test(text)) fail(`${doc} must not advise globally rewriting GitHub URLs`)
}

// The conventional local entry point must run both dependency-free validators.
const rootPackage = readJson('package.json')
const validateScript = rootPackage?.scripts?.validate ?? ''
if (!validateScript.includes('scripts/validate.mjs') || !validateScript.includes('scripts/validate-manifests.mjs')) {
  fail('package.json scripts.validate must chain both validators')
}
const testScript = rootPackage?.scripts?.test ?? ''
if (!/^npm run validate(?:\s*&&|\s*$)/.test(testScript)) {
  fail('package.json scripts.test must delegate to npm run validate first')
}

if (errors.length > 0) {
  console.error('Manifest validation failed:')
  for (const error of errors) console.error(`  - ${error}`)
  process.exit(1)
}

const version = distinct.values().next().value
console.log(`Manifest validation passed: ${Object.keys(manifests).length} manifests, version ${version}`)
console.log(`skills: ${skillNames.join(', ')}`)
