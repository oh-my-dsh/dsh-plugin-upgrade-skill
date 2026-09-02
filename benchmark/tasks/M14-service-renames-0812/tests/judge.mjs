// M14-service-renames-0812 grading: the migrated Node half must use the alpha.2
// service names — `webServer` (was the pre-0812 `httpServer`), `jobs` (was
// `tasks`), and the `onJobDone` completion listener (was `onTaskDone`) — and must
// really activate and serve its route on the alpha.2 host.
//   Gate     — fixture unchanged → flat 0 (mutable task).
//   Static   — 60 pts, old-identifier sweep + new-identifier presence on the
//              migrated Node half (code AND comments):
//              `webServer` present (10); `jobs` present (10);
//              no `httpServer` token left (10); no `ctx.tasks` usage left (10);
//              no `onTaskDone` token left (10); `onJobDone` present (10).
//              (The fixture's trap comments insist the old names are official;
//              leaving an old identifier anywhere — inject, ctx usage, or a
//              comment — loses its sweep point. DSH-0.1.1-R1-09.)
//   Runtime  — 40 pts: `dsh plugin add` succeeds (10); web cold boot has no
//              negative signal (10: `pending (waiting for services: tasks,
//              httpServer)` / `plugin tree failed` / `failed to apply loader
//              entry … onTaskDone`); route smoke `GET /bench-status/status`
//              answers 200 with `{"ok":true}` (20 — the live `ctx.jobs` read
//              inside the handler also proves the registry rename works).
// Boundary: there is no browser in this container and this task has no client
// half, so no client/runtime behavior is graded — the anchors are host-side only
// (boot log, service resolution, HTTP route). The judge sweeps the single Node
// entry file (package.json `main`); a separate `src/` build tree is out of scope
// because the fixture's Node half IS the packed artifact (like dsh-loop's
// `main → lib/`), so "grep the packed artifact" and "grep the source" coincide.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  addPlugin,
  bootWebAndFetchIndex,
  cleanupProfile,
  createProfile,
  dshAvailable,
  emit,
  FIXTURE_DIR,
  fixtureChanges,
  localExec,
  NEGATIVE_SIGNAL,
} from './judge-utils.mjs'

const TASK = 'M14-service-renames-0812'
const PROFILE = 'bench-m14-service-renames-0812'
const TMP = '/tmp/bench-m14-service-renames-0812'
const ROUTE = '/bench-status/status'

// Statement-anchored sweeps. The fixture/trap may mention the old identifiers,
// but the *migrated* Node half must not contain them anywhere (code or comment) —
// the oracle's comments therefore avoid the old literal tokens entirely.
const NEW_WEB_CARRIER = /\bwebServer\b/
const NEW_TASK_REGISTRY = /\bjobs\b/
const OLD_WEB_CARRIER = /httpServer/
const OLD_TASK_USAGE = /ctx\.tasks\b/
const OLD_EVENT_KEY = /onTaskDone/
const NEW_EVENT_KEY = /\bonJobDone\b/

main().catch((error) => emit(0, [`judge error: ${error.message}`]))

async function main() {
  const reasons = []

  const gate = await fixtureChanges('fixture')
  if (gate.changed !== true) {
    emit(0, [`fixture unchanged (${gate.detail}), graded as 0`])
  }
  reasons.push('fixture was modified by the agent')

  let pkg
  try {
    pkg = JSON.parse(readFileSync(join(FIXTURE_DIR, 'package.json'), 'utf8'))
  } catch (error) {
    emit(0, [...reasons, `failed to parse package.json: ${error.message}`])
  }
  let score = 0

  const nodeHalf = findNodeHalf(pkg)
  if (nodeHalf === null) {
    emit(0, [...reasons, 'cannot locate the Node half source under /app/fixture to sweep it'])
  }
  const nodeText = readFileSync(nodeHalf, 'utf8')

  // 1. Static: old-identifier sweep + new-identifier presence on the migrated Node half.
  if (NEW_WEB_CARRIER.test(nodeText)) {
    score += 10
    reasons.push('Node half uses the renamed web carrier `webServer` (+10)')
  } else {
    reasons.push('Node half does not name the renamed web carrier `webServer` (+0)')
  }

  if (NEW_TASK_REGISTRY.test(nodeText)) {
    score += 10
    reasons.push('Node half uses the renamed task registry `jobs` (+10)')
  } else {
    reasons.push('Node half does not name the renamed task registry `jobs` (+0)')
  }

  if (OLD_WEB_CARRIER.test(nodeText)) {
    reasons.push('Node half still contains the old web carrier identifier `httpServer` (+0; also check comments — the fixture claims it is official)')
  } else {
    score += 10
    reasons.push('no old web carrier identifier `httpServer` left in the Node half (+10)')
  }

  if (OLD_TASK_USAGE.test(nodeText)) {
    reasons.push('Node half still reads the task registry through `ctx.tasks` (+0)')
  } else {
    score += 10
    reasons.push('no `ctx.tasks` usage left in the Node half (+10)')
  }

  if (OLD_EVENT_KEY.test(nodeText)) {
    reasons.push('Node half still registers the old completion listener `onTaskDone` (+0; on the alpha.2 host `jobs.onTaskDone` is not a function)')
  } else {
    score += 10
    reasons.push('no old completion listener `onTaskDone` left in the Node half (+10)')
  }

  if (NEW_EVENT_KEY.test(nodeText)) {
    score += 10
    reasons.push('Node half registers the renamed completion listener `onJobDone` (+10)')
  } else {
    reasons.push('Node half does not register the renamed completion listener `onJobDone` (+0)')
  }

  if (!(await dshAvailable())) {
    emit(score, [...reasons, 'dsh unavailable; runtime verification treated as failed'])
  }

  // 2. Runtime: add + web cold boot + route smoke.
  try {
    const created = await createProfile(PROFILE, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
    if (!created.ok) reasons.push(created.detail)
    else {
      const added = await addPlugin(PROFILE, FIXTURE_DIR)
      if (!added.ok) reasons.push(`dsh plugin add failed: ${added.detail}`)
      else {
        reasons.push('dsh plugin add succeeded')
        score += 10
        reasons.push('plugin installed successfully (+10)')

        const boot = await bootWebAndFetchIndex(PROFILE, '@demo/dsh-bench-status')
        if (NEGATIVE_SIGNAL.test(boot.output)) {
          const hit = boot.output.match(/pending \(waiting for services?[^)]*\)|plugin tree failed|failed to apply loader entry[^\n]*|FAILED fiber[^\n]*/)?.[0] ?? 'unknown'
          reasons.push(`web cold boot shows a negative signal: ${hit} (the old service names still do not resolve on alpha.2)`)
        } else {
          score += 10
          reasons.push('web cold boot: no pending, the plugin tree activated (+10)')
        }

        const url = /dsh web: (\S+)/.exec(boot.output)?.[1]
        if (url === undefined) {
          reasons.push(`could not find the dsh web URL in the boot log (tail: ${boot.output.trim().slice(-160)})`)
        } else {
          const smoke = await routeSmoke(url)
          if (smoke.status === 200 && smoke.ok) {
            score += 20
            reasons.push(`route smoke green: GET ${ROUTE} -> 200 with {"ok":true,"open":<number>} (+20)`)
          } else {
            reasons.push(`route smoke failed: GET ${ROUTE} -> ${smoke.status ?? 'no response'}${smoke.error ? ` (${smoke.error})` : ''} (the webServer.register wiring did not come up)`)
          }
        }
      }
    }
  } finally {
    await cleanupProfile(PROFILE, TMP)
  }

  emit(score, reasons)
}

/** Browserless smoke: GET the plugin's route and report status + ok flag.
 * NOTE: the inner script must not contain single quotes — it is embedded inside an
 * sh -c single-quoted argument, and a stray quote would mangle the -e program
 * (SyntaxError instead of a fetch verdict). The payload is therefore asserted via
 * JSON.parse, quote-free. */
async function routeSmoke(url) {
  const base = url.split('/?')[0]
  const routeUrl = `${base}${ROUTE}`
  const script = `
const routeUrl = process.argv[1];
const outcome = { status: null, ok: false };
try {
  const res = await fetch(routeUrl, { redirect: "manual" });
  outcome.status = res.status;
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch {}
  outcome.ok = parsed !== null && parsed.ok === true && typeof parsed.open === "number";
} catch (error) {
  outcome.error = String(error);
}
console.log("__RESULT__" + JSON.stringify(outcome));
`
  const result = await localExec(`node --input-type=module -e '${script}' '${routeUrl}'`, { timeout: 60000 })
  const marker = '__RESULT__'
  const idx = result.stdout.lastIndexOf(marker)
  if (idx < 0) return { status: null, ok: false, error: result.stderr.trim().slice(-200) }
  try {
    return JSON.parse(result.stdout.slice(idx + marker.length).trim())
  } catch {
    return { status: null, ok: false, error: 'failed to parse route smoke result' }
  }
}

function exists(relative) {
  try {
    readFileSync(join(FIXTURE_DIR, relative))
    return true
  } catch {
    return false
  }
}

/** Locate the Node half source file: prefer main / exports["."] resolution, then lib/index.mjs, then index.mjs. */
function findNodeHalf(pkg) {
  for (const candidate of [pkg?.main, pkg?.exports?.['.']].filter((x) => typeof x === 'string')) {
    if (exists(candidate)) return join(FIXTURE_DIR, candidate)
  }
  for (const candidate of ['lib/index.mjs', 'lib/index.js', 'index.mjs', 'index.js']) {
    try {
      readFileSync(join(FIXTURE_DIR, candidate))
      return join(FIXTURE_DIR, candidate)
    } catch {
      /* keep probing */
    }
  }
  return null
}