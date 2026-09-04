#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const GROUPS = ['no-injected-skill', 'upgrade-only', 'all-skills']

export function compareEvidence(groups) {
  const baseline = groups['no-injected-skill']?.evidence
  if (!baseline) throw new Error('Missing baseline evidence')
  for (const name of GROUPS) {
    const { evidence, summary } = groups[name] ?? {}
    if (!evidence?.complete || evidence.dirty) throw new Error(`${name}: incomplete or dirty evaluation; cannot compare`)
    for (const field of ['sourceCommit', 'model', 'attempts', 'tasks', 'harborVersion']) {
      if (JSON.stringify(evidence[field]) !== JSON.stringify(baseline[field])) throw new Error(`${name}: mismatched ${field}`)
    }
    if (evidence.condition !== name || !summary?.groups?.[name]) throw new Error(`${name}: wrong condition identity`)
    const tasks = summary.groups[name].perTask
    if (Object.keys(tasks).length !== baseline.tasks.length) throw new Error(`${name}: incomplete task inventory`)
    for (const task of baseline.tasks) {
      const result = tasks[task]
      if (result?.n !== baseline.attempts || !Number.isFinite(result?.median) || result.median < 0 || result.median > 1) throw new Error(`${name}: invalid result for ${task}`)
    }
  }
  return baseline.tasks.map((task) => {
    const scores = Object.fromEntries(GROUPS.map((name) => [name, groups[name].summary.groups[name].perTask[task].median]))
    return { task, ...scores, compositionDelta: Number((scores['all-skills'] - scores['upgrade-only']).toFixed(4)) }
  })
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.length !== 3) throw new Error('Pass the downloaded evaluation artifact directory')
    const directory = resolve(process.argv[2])
    const groups = Object.fromEntries(GROUPS.map((name) => [name, {
      evidence: JSON.parse(readFileSync(join(directory, `skill-evaluation-${name}`, 'evidence.json'), 'utf8')),
      summary: JSON.parse(readFileSync(join(directory, `skill-evaluation-${name}`, 'summary.json'), 'utf8')),
    }]))
    const rows = compareEvidence(groups)
    const lines = ['# Skill outcome comparison', '',
      '| Task | No injected Skill | Upgrade only | All Skills | All − upgrade |',
      '|---|---:|---:|---:|---:|',
      ...rows.map((row) => `| ${row.task} | ${row['no-injected-skill']} | ${row['upgrade-only']} | ${row['all-skills']} | ${row.compositionDelta} |`),
      '', `${rows.filter((row) => row.compositionDelta < 0).length} tasks have lower all-Skill medians than upgrade-only.`, '',
      'This is an outcome regression signal, not proof of Skill activation or the absence of semantic conflicts. No performance threshold has been established.', '',
      `Attempts per task: ${groups['all-skills'].evidence.attempts}. A single attempt is a smoke run, not a stable effect estimate.`, '',
      ...GROUPS.map((name) => `${name} usage: ${JSON.stringify(groups[name].evidence.usage)}`), '']
    const markdown = lines.join('\n')
    writeFileSync(join(directory, 'comparison.md'), markdown)
    writeFileSync(join(directory, 'comparison.json'), `${JSON.stringify(rows, null, 2)}\n`)
    process.stdout.write(markdown)
  } catch (error) {
    console.error(`[skill-comparison] ${error.message}`)
    process.exitCode = 1
  }
}
