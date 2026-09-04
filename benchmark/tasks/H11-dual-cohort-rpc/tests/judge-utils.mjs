import { readdir, readFile } from 'node:fs/promises'
import { relative } from 'node:path'

const BRANCH_CHECKS = [
  [/\.length\b/, 'function arity inspection'],
  [/\b(?:dsh|connection|host)Version\b/i, 'version variable'],
  [/\bsemver\b|0\.1\.[12]/i, 'version parsing/literal'],
  [/package\.json|process\.env|import\.meta\.resolve/i, 'environment/package capability probe'],
  [/\.toString\s*\(/, 'implementation source inspection'],
  [/\bcatch\s*\(/, 'exception retry/fallback'],
]

export function sameMembers(actual, expected) {
  if (actual.length !== expected.length) return false
  const left = [...actual].sort()
  const right = [...expected].sort()
  return left.every((value, index) => value === right[index])
}

export function registrationsFromCalls(calls) {
  return calls.map((args) => ({ channel: args[0], authority: args[2]?.authority }))
}

export function authorityPolicyMatches(result, expected) {
  return result.registrationOk && result.registrations.every(
    ({ channel, authority }) => expected[channel] === authority,
  )
}

export function formatAuthorities(registrations) {
  return [...registrations]
    .sort((left, right) => String(left.channel).localeCompare(String(right.channel)))
    .map(({ channel, authority }) => `${String(channel)}=${String(authority)}`)
    .join(', ') || 'none'
}

export async function inspectBranching(sourceRoot) {
  const hits = []
  for (const file of await sourceFiles(sourceRoot)) {
    const source = stripComments(await readFile(file, 'utf8'))
    for (const [pattern, label] of BRANCH_CHECKS) {
      if (pattern.test(source)) hits.push(`${relative(sourceRoot, file).replaceAll('\\', '/')}: ${label}`)
    }
  }
  return { ok: hits.length === 0, hits }
}

async function sourceFiles(root) {
  const files = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = `${root}/${entry.name}`
    if (entry.isDirectory()) files.push(...await sourceFiles(path))
    else files.push(path)
  }
  return files.sort()
}

// Explanatory comments may name rejected strategies; score executable text only.
// The task fixture contains no regex literals, so this deliberately small comment
// stripper is sufficient and avoids adding a parser dependency to the sealed judge.
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\/.*$/gm, '')
}
