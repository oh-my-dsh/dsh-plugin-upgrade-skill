// Shared grading library for the benchmark (harbor edition, zero dependencies).
// Conventions:
// - Every judge.mjs always exits 0; the last stdout line is {"score": 0-100, "max": 100, "reasons": [...]};
// - For static tasks, agent artifacts live under /app/agent-output/<task-id>/;
// - For container tasks (M1/H1/H2/H3), the agent modifies /app/fixture/ directly and the judge does real
//   cold-boot verification inside the task container (the image has dsh 0.1.2-alpha.2 installed globally,
//   no docker exec needed);
// - Each task uses its own profile (bench-<task>) and its own /tmp plugin directory; the judge cleans up
//   the assets it created.
import { execFile } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

export const APP_ROOT = '/app'
export const FIXTURE_DIR = join(APP_ROOT, 'fixture')
export const DEFAULT_AGENT_OUTPUT = join(APP_ROOT, 'agent-output')
export const BENCH_TMP = (taskId) => `/tmp/bench-${taskId.toLowerCase()}`
export const PROFILE = (taskId) => `bench-${taskId.toLowerCase()}`

// ── result output ──────────────────────────────────────────────

export function emit(score, reasons, extra = {}) {
  const result = { score: Math.max(0, Math.min(100, Math.round(score))), max: 100, reasons, ...extra }
  process.stdout.write(JSON.stringify(result) + '\n')
  process.exit(0)
}

/**
 * Evaluate declared checkpoints against recorded outcomes.
 * `patched` and `baseline` map checkpoint id -> 'pass' | 'fail' | 'unavailable'.
 *   fail-to-pass: patched must pass while the baseline must not pass;
 *   pass-to-pass: patched must keep passing (baseline fail blocks the credit);
 *   pass / report: patched-only requirement.
 * `requires` lists checkpoint ids that must all have passed before this one counts.
 * Caps apply after the sum: `cap.when` lists checkpoint ids that must all have
 * passed (used for cross-checkpoint traps), otherwise a failed checkpoint's own cap
 * applies when it was not passed.
 * @returns { score, reasons, checkpoints } — the structured per-checkpoint ledger.
 */
export function evaluateCheckpoints(checkpoints, patched, baseline) {
  const reasons = []
  const results = []
  const passedIds = new Set()
  let score = 0
  for (const cp of checkpoints) {
    const p = patched[cp.id] ?? 'unavailable'
    const b = baseline[cp.id] ?? 'unavailable'
    let ok = false
    if (cp.type === 'fail-to-pass') ok = p === 'pass' && b !== 'pass'
    else if (cp.type === 'pass-to-pass') ok = p === 'pass' && b !== 'fail'
    else ok = p === 'pass'
    const missing = (cp.requires ?? []).filter((id) => !passedIds.has(id))
    if (ok && missing.length > 0) {
      ok = false
      reasons.push(`checkpoint ${cp.id}: blocked — requires ${missing.join(', ')}`)
    }
    if (ok) {
      score += cp.points
      passedIds.add(cp.id)
    }
    if (!ok && missing.length === 0) {
      reasons.push(`checkpoint ${cp.id} (${cp.type}): 0/${cp.points} — patched ${p}, pristine ${b}`)
    } else if (ok) {
      reasons.push(`checkpoint ${cp.id} (${cp.type}): ${cp.points}/${cp.points} — patched ${p}, pristine ${b}`)
    }
    results.push({ id: cp.id, label: cp.label, type: cp.type, points: cp.points, awarded: ok ? cp.points : 0, patched: p, pristine: b })
  }
  for (const cp of checkpoints) {
    if (!cp.cap) continue
    const applies = cp.cap.when
      ? cp.cap.when.every((id) => passedIds.has(id)) && !passedIds.has(cp.id)
      : !passedIds.has(cp.id)
    if (applies && score > cp.cap.total) {
      reasons.push(`cap applied: total capped at ${cp.cap.total} — ${cp.cap.reason}`)
      score = cp.cap.total
    }
  }
  return { score, reasons, checkpoints: results }
}

/**
 * Restore the committed baseline fixture into a scratch directory
 * (`/tmp/pristine-<task-id>/fixture`). The verifier container's /app git repository
 * holds the baseline commit made by the task Dockerfile.
 */
export async function restorePristine(taskId) {
  const dir = `/tmp/pristine-${taskId.toLowerCase()}`
  const result = await localExec(`rm -rf '${dir}' && mkdir -p '${dir}' && git -C /app archive HEAD fixture | tar -x -C '${dir}'`)
  if (result.code !== 0) return { ok: false, detail: (result.stdout + result.stderr).trim().slice(-200) }
  return { ok: true, dir: `${dir}/fixture` }
}

// ── agent output collection (static tasks) ─────────────────────

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

/** Collect all text artifacts under <agentOutput>/<taskId>/ and join them into a single string. */
export function readAgentText(agentOutput, taskId) {
  const root = agentOutput || DEFAULT_AGENT_OUTPUT
  const dir = join(root, taskId)
  const files = walkFiles(dir).filter((file) => TEXT_EXT.has(file.slice(file.lastIndexOf('.'))))
  const text = files.map((file) => readFileSync(file, 'utf8')).join('\n\n')
  return { text, files: files.map((file) => relative(root, file)) }
}

// ── git status (whether the fixture changed) ───────────────────

function git(args, cwd) {
  return new Promise((resolvePromise) => {
    execFile('git', args, { cwd, timeout: 20000 }, (error, stdout, stderr) => {
      resolvePromise({ code: error?.code ?? 0, stdout, stderr: stderr ?? '' })
    })
  })
}

/** Return the fixture paths relative to APP_ROOT (modified/added/deleted). Empty array = unchanged. */
export async function fixtureChanges(relFixtureDir = 'fixture') {
  const result = await git(['status', '--porcelain', '--', relFixtureDir], APP_ROOT)
  if (result.code !== 0) return { changed: null, detail: `git status failed: ${result.stderr.trim()}` }
  const lines = result.stdout.split('\n').filter(Boolean)
  return {
    changed: lines.length > 0 ? true : false,
    detail: lines.length ? lines.join('; ') : 'fixture unchanged relative to baseline',
  }
}

// ── local command primitives (the judge runs inside the task container) ──

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

// ── profile lifecycle ──────────────────────────────────────────

/** Create an isolated profile (bundles is an array of host package names). */
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
  if (write.code !== 0) return { ok: false, detail: `profile write failed: ${write.stderr.trim()}` }
  const seed = await localExec(
    `cp /root/.dsh/profiles/headless/pnpm-workspace.yaml '${dir}/' 2>/dev/null || printf 'packages:\\n  - .\\n\\nnodeLinker: hoisted\\nautoInstallPeers: false\\n' > '${dir}/pnpm-workspace.yaml'
printf '[]\\n' > '${dir}/cordis.patch.yml'
printf '[]\\n' > '${dir}/cordis.yml'`,
  )
  if (seed.code !== 0) return { ok: false, detail: `profile seed files failed: ${seed.stderr.trim()}` }
  return { ok: true, dir }
}

export async function addPlugin(profile, pluginDir) {
  const result = await localExec(`dsh plugin --profile '${profile}' add '${pluginDir}'`, { timeout: 180000 })
  return { ok: result.code === 0, detail: (result.stdout + result.stderr).trim().slice(-400) }
}

/** Clean up task-created assets: the profile, the temporary plugin directory, and leftover boot processes. */
export async function cleanupProfile(profile, tmpDir) {
  // The pkill pattern uses the [first-letter] bracket trick to avoid matching the sh -c process that is running this cleanup script itself.
  const selfSafe = `[${profile[0]}]${profile.slice(1)}`
  await localExec(
    `pkill -f 'profile ${selfSafe}' 2>/dev/null; rm -rf '/root/.dsh/profiles/${profile}' '${tmpDir}' /tmp/${profile}-boot.log; true`,
  )
}

// ── cold-boot judgment signals ─────────────────────────────────

export const NEGATIVE_SIGNAL = /plugin tree failed|did not activate|pending \(waiting for service|FAILED fiber|ClientPackageCompositionError/i
// A headless profile without an API key is guaranteed to reach MISSING_CREDENTIAL — being able to emit
// this line proves the plugin tree activated as a whole and startup progressed to the host application layer
// (consistent with the validation report's attribution).
export const HEADLESS_ACTIVATED_SIGNAL = /MISSING_CREDENTIAL|no API key|dsh: AUTH/i

/** Headless cold boot: returns the full output. The exit code is not used for judgment (even a success exits 1 when there is no key). */
export async function bootHeadless(profile) {
  const result = await localExec(`cd /root && timeout 30 dsh --profile '${profile}' 'ping' 2>&1`, { timeout: 60000 })
  return { output: result.stdout + result.stderr, code: result.code }
}

/**
 * Web cold boot and read of __DSH_BOOT__:
 * 1. Launch `dsh --profile <p> --no-open` in the background and wait for a dsh web: URL in the log;
 * 2. Exchange the bootstrap token for a Cookie, then GET / for the HTML;
 * 3. Return { output, html }; the caller judges negative signals and plugin entry.
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
    return { output: probe.stdout + probe.stderr, html: '', probeError: 'failed to parse boot result' }
  }
}
