// Zero-dependency helpers shared by the H21 judge (and its own unit tests).
//
// The H21 judge drives two real published DSH user-questions services (rc.2
// and alpha.2) instead of the fake harness H11 used, so nothing here is
// mnemon-specific: the utilities cover process/exec plumbing, the final JSON
// emit, fixture change detection, candidate import, cohort manifest
// integrity, real-package module URLs, and a comment-stripped source scan
// over the src root and its locally imported helpers that flags the
// cross-cohort gaming strategies the task bans.

import { execFile } from 'node:child_process'
import { realpathSync, statSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Windows cannot execFile bare `npm`/`git` shims without their extension.
const WIN32 = process.platform === 'win32'
const EXECUTABLE_NAMES = WIN32 ? { npm: 'npm.cmd', git: 'git.exe', node: 'node.exe' } : {}

export function executableName(file) {
  return EXECUTABLE_NAMES[file] ?? file
}

/** Run a child process and settle with { code, stdout, stderr } instead of throwing. */
export function run(file, args, cwd, timeout = 60000) {
  return new Promise((resolve) => {
    const executable = executableName(file)
    // Windows batch shims (npm.cmd) need the shell; bare executables do not.
    const options = { cwd, timeout, shell: WIN32 && executable.endsWith('.cmd') }
    execFile(executable, args, options, (error, stdout, stderr) => {
      resolve({
        code: typeof error?.code === 'number' ? error.code : error ? 1 : 0,
        stdout: stdout ?? '',
        stderr: stderr ?? '',
      })
    })
  })
}

export function tail(text, size = 240) {
  return String(text).trim().slice(-size) || 'no output'
}

/** Emit the single-line judge result and exit 0 (the verifier normalizes it). */
export function emit(rawScore, reasons) {
  const score = Math.max(0, Math.min(100, Math.round(rawScore)))
  process.stdout.write(`${JSON.stringify({ score, max: 100, reasons })}\n`)
  process.exit(0)
}

/**
 * Detect whether the fixture working tree differs from the Docker baseline.
 * `repoRoot` is the git repository that owns `fixtureRel` (the image commits
 * the untouched fixture there at build time).
 */
export async function fixtureChanges(repoRoot, fixtureRel = 'fixture') {
  const result = await run('git', ['status', '--porcelain', '--', fixtureRel], repoRoot, 20000)
  if (result.code !== 0) {
    return { ok: false, detail: `git status failed: ${tail(result.stderr, 200)}` }
  }
  const lines = result.stdout.trim().split('\n').filter(Boolean)
  return lines.length > 0
    ? { ok: true, detail: `fixture changed: ${lines.join('; ')}` }
    : { ok: false, detail: 'fixture unchanged relative to baseline, graded as 0' }
}

/** Cache-busted file URL for one candidate module inside the fixture. */
export function candidateUrl(fixtureRoot, modulePath = 'src/register.js') {
  return `${pathToFileURL(`${fixtureRoot}/${modulePath}`).href}?judge=${Date.now()}`
}

/** Import the candidate module; resolves to its namespace or throws. */
export async function importCandidate(fixtureRoot, modulePath = 'src/register.js') {
  return import(candidateUrl(fixtureRoot, modulePath))
}

/**
 * Verify one installed cohort package manifest against its frozen versions.
 * The whole judge is worthless if the read-only cohort tree was tampered
 * with, so a mismatch is a hard zero.
 *
 * @param cohort { name, root, expected: { 'pkg name': 'exact version' } }
 */
export async function cohortManifestIntegrity(cohort) {
  const mismatches = []
  for (const [name, version] of Object.entries(cohort.expected)) {
    try {
      const pkgPath = realpathSync(`${cohort.root}/node_modules/${name}/package.json`)
      const pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
      if (pkg.version !== version) mismatches.push(`${name}@${pkg.version} (expected ${version})`)
    } catch (error) {
      mismatches.push(`${name}: unreadable (${error instanceof Error ? error.message : String(error)})`)
    }
  }
  return mismatches.length === 0
    ? { ok: true, detail: `${cohort.name}: manifests intact (${Object.keys(cohort.expected).join(', ')})` }
    : { ok: false, detail: `${cohort.name} manifest integrity failed: ${mismatches.join('; ')}` }
}

/**
 * Resolve a real cohort package entry file through the pnpm virtual store.
 * The `node_modules/@deepseek-ai/*` directories are symlinks on Linux and on
 * Windows pnpm, so the real path is resolved before building the file URL.
 */
export function cohortModuleUrl(cohortRoot, pkg, file = 'lib/index.js') {
  const dir = realpathSync(`${cohortRoot}/node_modules/${pkg}`)
  return pathToFileURL(`${dir}/${file}`).href
}

/**
 * Scan the implementation files that can actually run: every source file
 * directly under `sourceRoot`, plus every file reachable from them through
 * local relative static import/export specifiers (`import ... from './x'`,
 * `export ... from './x'`, side-effect `import './x'`), breadth-first. A
 * specifier resolves with common source suffixes (`.js`, `.mjs`, `.ts`,
 * `.tsx`, directory `index.*`), may never escape `sourceRoot`, and an
 * unresolvable or non-source target (including `package.json`) is ignored —
 * so manifest text, fixture test files and the task wording never influence
 * the result.
 *
 * Two check sets run per file:
 *
 * - CODE_BRANCH_CHECKS over comment+string-stripped text: DSH version
 *   variables, semver API use, host/context identity equality, `ctx.root`
 *   registration, `baseUrl` access and explicit `retry(...)` calls. Ordinary
 *   code — collection `.length`, `try/catch`, `process.env` reads,
 *   `.toString()` calls, capability tests such as
 *   `typeof service.registerProvider === 'function'`, and error-message
 *   wording — is deliberately NOT among the patterns.
 * - VERSION_SOURCE_CHECKS over comment-stripped text with string literals
 *   intact: DSH version/tag literals (`0.1.1-rc.2`, `alpha.2`) and reads of a
 *   `package.json` manifest. These rules must see string contents, so they
 *   run before string stripping; an ordinary error message merely mentioning
 *   "semver" or a package name matches neither set.
 */
export async function inspectBranching(sourceRoot) {
  const root = resolve(sourceRoot)
  const pending = []
  const visited = new Set()
  const hits = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isFile() && SOURCE_FILE_RE.test(entry.name)) pending.push(join(root, entry.name))
  }
  for (let index = 0; index < pending.length; index += 1) {
    const file = pending[index]
    if (visited.has(file)) continue
    visited.add(file)
    const source = stripComments(await readFile(file, 'utf8'))
    const executable = stripStrings(source)
    const rel = relative(root, file).replaceAll('\\', '/')
    for (const [pattern, label] of CODE_BRANCH_CHECKS) {
      if (pattern.test(executable)) hits.push(`${rel}: ${label}`)
    }
    for (const [pattern, label] of VERSION_SOURCE_CHECKS) {
      if (pattern.test(source)) hits.push(`${rel}: ${label}`)
    }
    for (const specifier of localImportSpecifiers(source)) {
      const target = resolveLocalImport(root, file, specifier)
      if (target && !visited.has(target)) pending.push(target)
    }
  }
  return { ok: hits.length === 0, hits }
}

// Rules over executable text (comments and string literals removed), so error
// messages, comments and capability test strings can never trigger them. The
// host/context identity rules ignore null/undefined/true/false and string
// literals on the compared side, keeping plain guards such as
// `service === null`, `ctx === undefined`, `service == null` and
// `typeof service.registerProvider === 'function'` legal. The `(?!=)` after
// each operator stops a backtracked `==`/`!=` alternative from consuming the
// first two characters of `===`/`!==` and skipping the guard.
const CODE_BRANCH_CHECKS = [
  [/\bsemver\b/i, 'version parsing'],
  [/\b(?:dsh|host|cohort)[._-]?version\b/i, 'DSH version variable'],
  [/(?<![$\w.])(?:ctx|context|service|host)\b\s*(?:===|!==|==|!=)(?!=)\s*(?!\s*(?:(?:null|undefined|true|false)\b|['"`]))/, 'host/context identity matching'],
  [/(?:===|!==|==|!=)(?!=)\s*(?<![$\w.])(?:ctx|context|service|host)\b/, 'host/context identity matching'],
  [/(?<![$\w.])(?:ctx|context)\.root\b/, 'ctx.root registration'],
  [/\bbaseUrl\b/, 'host identity probing'],
  [/\bretry\s*\(/i, 'explicit retry'],
]

// Version-string rules need the string literals themselves, so they run on
// comment-stripped source (strings intact) instead of executable text. The
// patterns are exact DSH version/tag shapes and manifest reads, so an error
// message merely naming "semver" or a package never matches.
const VERSION_SOURCE_CHECKS = [
  [/\b0\.1\.[12](?:-[0-9A-Za-z.-]+)?\b/, 'DSH version literal'],
  [/\b(?:rc|alpha)\.[12]\b/i, 'DSH tag literal'],
  [/(?:readFile(?:Sync)?|require\.resolve|import\.meta\.resolve)\s*\([^)]*\bpackage\.json\b/s, 'environment/package capability probe'],
]

// Only source files enter or join the scan: manifests, READMEs and other
// non-code text (e.g. package.json "version" fields) never do.
const SOURCE_FILE_RE = /\.(?:[cm]?[jt]sx?)$/
const IMPORT_SUFFIXES = ['.js', '.mjs', '.ts', '.tsx']

// Local relative static specifiers only: side-effect `import './x'` and the
// `... from './x'` clause of static import/export statements. Bare package
// names, node: builtins and dynamic `import(...)` never match.
const LOCAL_SPECIFIER_RE = /\bimport\s*(['"])(\.{1,2}\/[^'"]+)\1|\b(?:import|export)\b(?:(?!\bfrom\b)[\s\S])*?\bfrom\s*(['"])(\.{1,2}\/[^'"]+)\3/g

function localImportSpecifiers(source) {
  const specifiers = []
  for (const match of source.matchAll(LOCAL_SPECIFIER_RE)) {
    const specifier = match[2] ?? match[4]
    if (specifier) specifiers.push(specifier)
  }
  return [...new Set(specifiers)]
}

/** Resolve one `./`- or `../`-rooted specifier, or null when it cannot land
 * on an existing source file inside `sourceRoot`. Node-like order: an
 * explicit source extension resolves directly, otherwise the common suffixes
 * are tried before a directory `index.*` (the bare extensionless path is
 * never itself a file candidate, so e.g. a `./package.json` import cannot
 * drag the manifest into the scan). */
function resolveLocalImport(sourceRoot, fromFile, specifier) {
  const base = resolve(dirname(fromFile), specifier)
  const candidates = SOURCE_FILE_RE.test(base)
    ? [base]
    : [
        ...IMPORT_SUFFIXES.map((suffix) => `${base}${suffix}`),
        ...IMPORT_SUFFIXES.map((suffix) => join(base, `index${suffix}`)),
      ]
  for (const candidate of candidates) {
    const rel = relative(sourceRoot, candidate)
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) continue
    if (isFile(candidate)) return candidate
  }
  return null
}

function isFile(path) {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

// Explanatory comments and string literals may name rejected strategies; score
// executable text only. These deliberately small scanners cover the fixture's
// ordinary JavaScript without adding a parser dependency to the sealed judge.
export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\/.*$/gm, '')
}

export function stripStrings(source) {
  return source
    .replace(/'(?:\\\\.|[^'\\\\])*'/g, "''")
    .replace(/"(?:\\\\.|[^"\\\\])*"/g, '""')
    .replace(/`(?:\\\\.|[^`\\\\])*`/g, '``')
}
