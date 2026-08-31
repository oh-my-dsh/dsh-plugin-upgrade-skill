// benchmark 判分公共库（harbor 版，零依赖）。
// 约定：
// - 每个 judge.mjs 退出码恒为 0，stdout 最后一行输出 {"score": 0-100, "max": 100, "reasons": [...]}；
// - 静态题 agent 产物在 /app/agent-output/<task-id>/ 下；
// - 容器题（M1/H1/H2/H3）由 agent 直接改 /app/fixture/，judge 在任务容器内做真实冷启动验证
//   （镜像已全局安装 dsh 0.1.2-alpha.2，无需 docker exec）；
// - 每个任务使用独立 profile（bench-<task>）与独立 /tmp 插件目录，judge 负责清理自建资产。
import { execFile } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

export const APP_ROOT = '/app'
export const FIXTURE_DIR = join(APP_ROOT, 'fixture')
export const DEFAULT_AGENT_OUTPUT = join(APP_ROOT, 'agent-output')
export const BENCH_TMP = (taskId) => `/tmp/bench-${taskId.toLowerCase()}`
export const PROFILE = (taskId) => `bench-${taskId.toLowerCase()}`

// ── 结果输出 ──────────────────────────────────────────────

export function emit(score, reasons) {
  const result = { score: Math.max(0, Math.min(100, Math.round(score))), max: 100, reasons }
  process.stdout.write(JSON.stringify(result) + '\n')
  process.exit(0)
}

// ── agent 输出收集（静态题）───────────────────────────────

const TEXT_EXT = new Set(['.md', '.txt', '.json', '.jsonl', '.log'])

function walkFiles(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) out.push(...walkFiles(path))
    else out.push(path)
  }
  return out
}

/** 收集 <agentOutput>/<taskId>/ 下全部文本产物，拼接为一个大字符串。 */
export function readAgentText(agentOutput, taskId) {
  const root = agentOutput || DEFAULT_AGENT_OUTPUT
  const dir = join(root, taskId)
  const files = walkFiles(dir).filter((file) => TEXT_EXT.has(file.slice(file.lastIndexOf('.'))))
  const text = files.map((file) => readFileSync(file, 'utf8')).join('\n\n')
  return { text, files: files.map((file) => relative(root, file)) }
}

// ── git 状态（fixture 是否被改动）─────────────────────────

function git(args, cwd) {
  return new Promise((resolvePromise) => {
    execFile('git', args, { cwd, timeout: 20000 }, (error, stdout, stderr) => {
      resolvePromise({ code: error?.code ?? 0, stdout, stderr: stderr ?? '' })
    })
  })
}

/** 返回 fixture 相对 APP_ROOT 的路径列表（被修改/新增/删除）。空数组 = 未改动。 */
export async function fixtureChanges(relFixtureDir = 'fixture') {
  const result = await git(['status', '--porcelain', '--', relFixtureDir], APP_ROOT)
  if (result.code !== 0) return { changed: null, detail: `git status 失败: ${result.stderr.trim()}` }
  const lines = result.stdout.split('\n').filter(Boolean)
  return {
    changed: lines.length > 0 ? true : false,
    detail: lines.length ? lines.join('; ') : 'fixture 相对基线无改动',
  }
}

// ── 本地命令原语（judge 运行在任务容器内）──────────────────

export function localExec(script, { stdin = '', timeout = 60000 } = {}) {
  return new Promise((resolvePromise) => {
    const child = execFile('sh', ['-c', script], { timeout }, (error, stdout, stderr) => {
      resolvePromise({
        code: error?.code ?? 0,
        stdout: stdout ?? '',
        stderr: stderr ?? '',
        killed: error?.killed === true || (error && error.code === undefined) === true,
      })
    })
    if (stdin) child.stdin.write(stdin)
    child.stdin.end()
  })
}

export async function dshAvailable() {
  const result = await localExec('dsh --version', { timeout: 15000 })
  return result.code === 0
}

// ── profile 生命周期 ──────────────────────────────────────

/** 创建隔离 profile（bundles 为宿主包名数组）。 */
export async function createProfile(profile, bundles) {
  const dir = `/root/.dsh/profiles/${profile}`
  const pkg = {
    name: `dsh-profile-${profile}`,
    private: true,
    dependencies: {},
    dsh: { profile: { bundles, patchReload: 'startup' } },
  }
  const write = await localExec(`rm -rf '${dir}' && mkdir -p '${dir}' && base64 -d > '${dir}/package.json'`, {
    stdin: Buffer.from(JSON.stringify(pkg, null, 2) + '\n').toString('base64'),
  })
  if (write.code !== 0) return { ok: false, detail: `profile 写入失败: ${write.stderr.trim()}` }
  const seed = await localExec(
    `cp /root/.dsh/profiles/headless/pnpm-workspace.yaml '${dir}/' 2>/dev/null || printf 'packages:\\n  - .\\n\\nnodeLinker: hoisted\\nautoInstallPeers: false\\n' > '${dir}/pnpm-workspace.yaml'
printf '[]\\n' > '${dir}/cordis.patch.yml'
printf '[]\\n' > '${dir}/cordis.yml'`,
  )
  if (seed.code !== 0) return { ok: false, detail: `profile 种子文件失败: ${seed.stderr.trim()}` }
  return { ok: true, dir }
}

export async function addPlugin(profile, pluginDir) {
  const result = await localExec(`dsh plugin --profile '${profile}' add '${pluginDir}'`, { timeout: 180000 })
  return { ok: result.code === 0, detail: (result.stdout + result.stderr).trim().slice(-400) }
}

/** 清理任务自建资产：profile、临时插件目录、残留 boot 进程。 */
export async function cleanupProfile(profile, tmpDir) {
  // pkill 模式用 [首字母] 括号技巧，避免匹配到正在执行本清理脚本的 sh -c 自身。
  const selfSafe = `[${profile[0]}]${profile.slice(1)}`
  await localExec(
    `pkill -f 'profile ${selfSafe}' 2>/dev/null; rm -rf '/root/.dsh/profiles/${profile}' '${tmpDir}' /tmp/${profile}-boot.log; true`,
  )
}

// ── 冷启动判定信号 ────────────────────────────────────────

export const NEGATIVE_SIGNAL = /plugin tree failed|did not activate|pending \(waiting for service|FAILED fiber|ClientPackageCompositionError/i
// headless profile 无 API key 时必然走到 MISSING_CREDENTIAL —— 能输出这行即证明
// 插件树已整体激活、启动流程推进到了宿主应用层（与验证报告的归因一致）。
export const HEADLESS_ACTIVATED_SIGNAL = /MISSING_CREDENTIAL|no API key|dsh: AUTH/i

/** headless 冷启动：返回完整输出。exit code 不做判定依据（无 key 时成功也是 1）。 */
export async function bootHeadless(profile) {
  const result = await localExec(`cd /root && timeout 30 dsh --profile '${profile}' 'ping' 2>&1`, { timeout: 60000 })
  return { output: result.stdout + result.stderr, code: result.code }
}

/**
 * web 冷启动并读取 __DSH_BOOT__：
 * 1. 后台拉起 `dsh --profile <p> --no-open`，等待日志出现 dsh web: URL；
 * 2. 用 bootstrap token 兑换 Cookie，GET / 取 HTML；
 * 3. 返回 { output, html }，由调用方判负向信号与插件 entry。
 */
export async function bootWebAndFetchIndex(profile, pkgName) {
  const logPath = `/tmp/${profile}-boot.log`
  await localExec(`cd /root && nohup timeout 45 dsh --profile '${profile}' --no-open > '${logPath}' 2>&1 & echo started`)
  const probe = await localExec(
    `node --input-type=module -e '
const logPath = process.argv[1];
const pkgName = process.argv[2];
const fs = await import("node:fs");
let log = "";
for (let i = 0; i < 90; i += 1) {
  try { log = fs.readFileSync(logPath, "utf8"); } catch {}
  if (/dsh web: http|plugin tree failed|did not activate/i.test(log)) break;
  await new Promise((r) => setTimeout(r, 1000));
}
const match = /dsh web: (http:\\S+)/.exec(log);
const outcome = { log };
if (match) {
  try {
    const r1 = await fetch(match[1], { redirect: "manual" });
    const setCookie = r1.headers.getSetCookie ? r1.headers.getSetCookie() : [r1.headers.get("set-cookie")];
    const cookie = setCookie.filter(Boolean).map((c) => c.split(";")[0]).join("; ");
    const r2 = await fetch("http://127.0.0.1:3080/", { headers: { cookie } });
    outcome.html = await r2.text();
  } catch (error) {
    outcome.fetchError = String(error);
  }
}
console.log("__RESULT__" + JSON.stringify(outcome));
' '${logPath}' '${pkgName}'`,
    { timeout: 150000 },
  )
  const marker = '__RESULT__'
  const idx = probe.stdout.lastIndexOf(marker)
  if (idx < 0) return { output: probe.stdout + probe.stderr, html: '', probeError: probe.stderr.trim() }
  try {
    const outcome = JSON.parse(probe.stdout.slice(idx + marker.length).trim())
    return { output: outcome.log ?? '', html: outcome.html ?? '', fetchError: outcome.fetchError }
  } catch {
    return { output: probe.stdout + probe.stderr, html: '', probeError: 'boot 结果解析失败' }
  }
}
