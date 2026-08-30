#!/usr/bin/env node
/**
 * Materialize two published @deepseek-ai/dsh versions for an npm-mode audit.
 *
 * Usage: node materialize-npm.mjs <versionA> <versionB> <out-dir> [--packages name1,name2] [--no-github]
 *
 * Versions accept npm versions (0.1.2-alpha.2), dsh tag spellings (dsh-v0.1.2-alpha.2),
 * or dist-tags (alpha, latest, next). Installs the CLI dependency closure (plus any
 * supplement packages, default: the SQLite persistence backend) into <out-dir>/a and
 * /b with scripts disabled, then emits a manifest diff and GitHub commit enrichment
 * when the repository is public. Prints a stats JSON to stdout; exits 1 with the
 * published version list when a requested version is not on the registry.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const CLI = '@deepseek-ai/dsh'
const DEFAULT_SUPPLEMENTS = ['@deepseek-ai/dsh-session-persistence-sqlite']
const args = process.argv.slice(2)
const [va, vb, out] = args.filter((a) => !a.startsWith('--'))
if (!va || !vb || !out) {
  console.error('Usage: node materialize-npm.mjs <versionA> <versionB> <out-dir> [--packages name1,name2] [--no-github]')
  process.exit(2)
}
function flagValue(name) {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const supplements = flagValue('--packages')?.split(',') ?? DEFAULT_SUPPLEMENTS
const useGithub = !args.includes('--no-github')

/** dsh-v0.1.2-alpha.2 -> 0.1.2alpha2 (report-directory naming). */
function normalizeTag(tag) {
  const m = tag.match(/^(?:dsh-)?v?(\d+\.\d+\.\d+)(?:-(.+))?$/)
  return m ? m[1] + (m[2] ? m[2].replace(/\./g, '') : '') : tag
}

function npm(...a) {
  return execFileSync('npm', [...a, '--loglevel=error'], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] })
}

/** Resolve a spec (version or dist-tag) against the registry; null when absent. */
function resolve(spec) {
  try {
    return { spec, resolved: JSON.parse(npm('view', `${CLI}@${spec}`, 'version', '--json')) }
  } catch {
    return { spec, resolved: null }
  }
}
const published = JSON.parse(npm('view', CLI, 'versions', '--json'))
const distTags = JSON.parse(npm('view', CLI, 'dist-tags', '--json'))
const repository = npm('view', CLI, 'repository.url').trim().replace(/^git\+|\.git$/g, '')
const [a, b] = [resolve(va), resolve(vb)]
const missing = [a, b].filter((r) => !r.resolved)
if (missing.length) {
  console.log(JSON.stringify({ error: 'requested version(s) not published', requested: missing.map((m) => m.spec), published, distTags }, null, 2))
  process.exit(1)
}

const supplementsResolved = supplements.map((p) => {
  try {
    return { pkg: p, resolved: JSON.parse(npm('view', `${p}@${b.resolved}`, 'version', '--json')) }
  } catch {
    return { pkg: p, resolved: null }
  }
})

/** Install one root: CLI closure + supplement packages, scripts disabled. */
function materialize(root, version) {
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'dsh-upgrade-audit-root', private: true }, null, 2) + '\n')
  const specs = [`${CLI}@${version}`, ...supplements.filter((s) => s.resolved).map((s) => `${s.pkg}@${version}`)]
  execFileSync('npm', ['install', '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund', '--loglevel=error', ...specs], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    stdio: ['ignore', 'ignore', 'inherit'],
  })
}

materialize(join(out, 'a'), a.resolved)
materialize(join(out, 'b'), b.resolved)

/** Scoped packages present under node_modules/@deepseek-ai in a root. */
function scopedPkgs(root) {
  const dir = join(root, 'node_modules', '@deepseek-ai')
  return existsSync(dir) ? readdirSync(dir).sort() : []
}
const pkgsA = scopedPkgs(join(out, 'a'))
const pkgsB = scopedPkgs(join(out, 'b'))
const manifestFields = ['version', 'bin', 'files', 'exports', 'dependencies', 'peerDependencies']

let manifestDiff = `# package.json manifest diff: ${CLI} ${a.resolved} -> ${b.resolved}\n\n`
for (const name of new Set([...pkgsA, ...pkgsB].sort())) {
  const pa = join(out, 'a', 'node_modules', '@deepseek-ai', name, 'package.json')
  const pb = join(out, 'b', 'node_modules', '@deepseek-ai', name, 'package.json')
  const fa = existsSync(pa) ? JSON.parse(readFileSync(pa, 'utf8')) : null
  const fb = existsSync(pb) ? JSON.parse(readFileSync(pb, 'utf8')) : null
  if (!fa || !fb) {
    manifestDiff += `## ${name}: ${fa ? 'REMOVED in b' : 'ADDED in b'}\n\n`
    continue
  }
  const deltas = manifestFields
    .filter((f) => JSON.stringify(fa[f] ?? null) !== JSON.stringify(fb[f] ?? null))
    .map((f) => `- ${f}:\n  a: ${JSON.stringify(fa[f] ?? null)}\n  b: ${JSON.stringify(fb[f] ?? null)}`)
  if (deltas.length) manifestDiff += `## ${name} (${fa.version} -> ${fb.version})\n\n${deltas.join('\n')}\n\n`
}
writeFileSync(join(out, 'manifest-diff.txt'), manifestDiff)

/** GitHub compare enrichment: commit list + revert detection across the tag pair. */
let enrichment = { attempted: false }
if (useGithub && repository.includes('github.com')) {
  enrichment.attempted = true
  const [, owner, repo] = repository.match(/github\.com[/:]([^/]+)\/([^/]+)$/) ?? []
  if (owner) {
    const range = `dsh-v${a.resolved}...dsh-v${b.resolved}`
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/compare/${range}`)
      if (res.ok) {
        const data = await res.json()
        const commits = (data.commits ?? []).map((c) => `${c.sha.slice(0, 10)} (${c.commit.author.date.slice(0, 10)}) ${c.commit.message.split('\n')[0]}`)
        writeFileSync(join(out, 'commits.txt'), commits.join('\n') + '\n')
        const reverts = commits.filter((c) => /revert/i.test(c))
        writeFileSync(join(out, 'reverts.txt'), reverts.join('\n') + '\n')
        enrichment = {
          attempted: true,
          ok: true,
          range,
          totalCommits: data.total_commits,
          commitsListed: commits.length,
          truncated: commits.length < data.total_commits,
          reverts: reverts.length,
        }
      } else {
        enrichment = { attempted: true, ok: false, status: res.status }
      }
    } catch (e) {
      enrichment = { attempted: true, ok: false, error: String(e) }
    }
  }
}

const stats = {
  from: { requested: a.spec, resolved: a.resolved },
  to: { requested: b.spec, resolved: b.resolved },
  distTags,
  publishedVersions: published,
  outDir: out,
  supplements: supplementsResolved,
  packagesA: pkgsA.length,
  packagesB: pkgsB.length,
  packagesOnlyInA: pkgsA.filter((p) => !pkgsB.includes(p)),
  packagesOnlyInB: pkgsB.filter((p) => !pkgsA.includes(p)),
  github: enrichment,
  artifacts: ['a/', 'b/', 'manifest-diff.txt', ...(enrichment.ok ? ['commits.txt', 'reverts.txt'] : [])],
}
console.log(JSON.stringify(stats, null, 2))
