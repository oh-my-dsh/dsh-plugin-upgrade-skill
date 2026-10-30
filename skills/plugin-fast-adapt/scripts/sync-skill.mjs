#!/usr/bin/env node
// sync-skill.mjs —— 把本工具仓的「技能面」同步到下游技能目录，并查漂移。
//
// 为什么需要它：plugin-fast-adapt 拆分独立仓后，dsh-plugin-upgrade-skill/skills/
// 下留了一份静态副本。两份都是真文件时，下游会静默滞后（2026-10-25 实测：
// 主仓已加客户端半三层判定，下游还缺 lib/client-graph.mjs、SKILL.md 也旧），
// 而滞后副本被误跑时查不出新问题。同步面固定为技能读者真正会用的文件：
//   SKILL.md / README.md / README.en.md / references/** / scripts/**
// package.json 不入技能面（下游技能目录不带它，工具版本降级为 commit 可观测）。
//
// 用法：
//   node scripts/sync-skill.mjs --dest <下游技能目录>            # 同步
//   node scripts/sync-skill.mjs --dest <下游技能目录> --check   # 只查漂移（退出码 1 = 有漂移）
//   node scripts/sync-skill.mjs --dest <下游技能目录> --dry-run # 打印将要复制的文件，不落盘

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const TOOL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// 技能面：相对 TOOL_ROOT 的glob 式目录/文件清单
const SURFACE = ['SKILL.md', 'README.md', 'README.en.md', 'references', 'scripts']
const SKIP_DIRS = new Set(['node_modules', '.git', 'tmp', '.trash', 'coverage'])

// 展开技能面为相对路径清单（递归目录）
export function skillSurface(root = TOOL_ROOT) {
  const out = []
  const walk = (rel) => {
    const full = path.join(root, rel)
    let stat
    try { stat = fs.statSync(full) } catch { return }
    if (stat.isFile()) {
      out.push(rel)
      return
    }
    for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
      const childRel = path.join(rel, entry.name)
      if (entry.isDirectory()) walk(childRel)
      else out.push(childRel.split(path.sep).join('/'))
    }
  }
  for (const item of SURFACE) walk(item)
  return out.sort()
}

function readMaybe(file) {
  try { return fs.readFileSync(file) } catch { return null }
}

// 漂移检查：missing=目标缺文件，differing=内容不一致，same=一致数
export function checkSkillSync({ srcRoot = TOOL_ROOT, destRoot } = {}) {
  if (!destRoot) throw new Error('需要 --dest <下游技能目录>')
  const dest = path.resolve(destRoot)
  const missing = []
  const differing = []
  let same = 0
  for (const rel of skillSurface(srcRoot)) {
    const srcFile = path.join(srcRoot, rel)
    const destFile = path.join(dest, rel)
    const a = readMaybe(srcFile)
    const b = readMaybe(destFile)
    if (b === null) { missing.push(rel); continue }
    if (a && b && a.equals(b)) same++
    else differing.push(rel)
  }
  return { srcRoot, destRoot: dest, missing, differing, same, clean: missing.length === 0 && differing.length === 0 }
}

// 同步：把技能面复制到目标（默认覆盖）。返回写入的文件清单。
export function syncSkill({ srcRoot = TOOL_ROOT, destRoot, dryRun = false } = {}) {
  if (!destRoot) throw new Error('需要 --dest <下游技能目录>')
  const dest = path.resolve(destRoot)
  const written = []
  for (const rel of skillSurface(srcRoot)) {
    const srcFile = path.join(srcRoot, rel)
    const destFile = path.join(dest, rel)
    if (dryRun) { written.push(rel); continue }
    fs.mkdirSync(path.dirname(destFile), { recursive: true })
    fs.copyFileSync(srcFile, destFile)
    written.push(rel)
  }
  return { srcRoot, destRoot: dest, written, dryRun }
}

// 同步后给镜像仓的提交命令建议：add 路径取 dest 相对其 git 仓根（只加同步路径，
// 防夹带），commit 主题带真源当前 commit——手敲这两处最容易错。不自动提交，
// git 的控制权留给用户；任一侧不是 git 仓时返回 null 静默跳过。
export function suggestCommitCommand({ srcRoot = TOOL_ROOT, destRoot } = {}) {
  try {
    // realpath 两侧再算相对路径：macOS 的 /var → /private/var 一类软链会让
    // git 返回的仓根与调用方路径前缀不一致，relative 直接给出跨目录的错路径
    const realDest = fs.realpathSync(destRoot)
    const repoRoot = fs.realpathSync(
      execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: destRoot, encoding: 'utf8' }).trim()
    )
    const rel = path.relative(repoRoot, realDest)
    const short = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: srcRoot, encoding: 'utf8' }).trim()
    return `git -C "${repoRoot}" add "${rel}" && git -C "${repoRoot}" commit -m "chore(fast-adapt): 同步独立仓 ${short}"`
  } catch {
    return null
  }
}

function parseArgv(argv) {
  const flags = { dest: null, check: false, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dest') flags.dest = argv[++i]
    else if (a === '--check') flags.check = true
    else if (a === '--dry-run') flags.dryRun = true
    else throw new Error(`未知参数「${a}」`)
  }
  return flags
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const flags = parseArgv(process.argv.slice(2))
  if (!flags.dest) {
    process.stderr.write('用法: node scripts/sync-skill.mjs --dest <下游技能目录> [--check|--dry-run]\n')
    process.exit(2)
  }
  if (flags.check) {
    const result = checkSkillSync({ destRoot: flags.dest })
    process.stderr.write(
      `\n漂移检查: ${result.srcRoot} → ${result.destRoot}\n` +
      `  一致 ${result.same} 个｜缺失 ${result.missing.length} 个｜内容不同 ${result.differing.length} 个\n`
    )
    for (const f of result.missing) process.stderr.write(`  缺失: ${f}\n`)
    for (const f of result.differing) process.stderr.write(`  漂移: ${f}\n`)
    process.stderr.write(result.clean ? '  结论: 无漂移\n' : '  结论: 有漂移——跑同步（去掉 --check）\n')
    process.exit(result.clean ? 0 : 1)
  }
  const result = syncSkill({ destRoot: flags.dest, dryRun: flags.dryRun })
  process.stderr.write(`\n${result.dryRun ? '[dry-run] 将写入' : '已写入'} ${result.written.length} 个文件 → ${result.destRoot}\n`)
  if (!flags.dryRun) {
    const suggestion = suggestCommitCommand({ destRoot: result.destRoot })
    if (suggestion) process.stderr.write(`建议镜像仓提交（只 add 同步路径，防夹带；不自动提交）:\n  ${suggestion}\n`)
  }
  process.exit(0)
}
