import { emitError } from './judge-result.mjs'
// H23-storage-domain-version-compat-trap grading.
//
// A plugin upgrades alpha.4 → alpha.5, bumps its storage domain to version 5
// without declaring compatibleVersions, and its older per-record documents
// silently read as absent. The judge verifies the repair against the REAL
// published alpha.5 storage packages and the preloaded persisted records.
//
//   65 — behavioral, against the real runtime:
//        v4 records A+B visible again (25), v5 record C intact with its
//        optional field (10), unlisted v3 record D still foreign (10), a
//        write after reading a v4 record re-stamps the file to version 5
//        (10), close+reopen retains the expected state (10);
//   25 — migration correctness from the IMPORTED runtime spec + schema probes:
//        compatibleVersions === [4] (15), version stays 5 (5), honest schema
//        preserving valid records and rejecting invalid field types (5);
//   10 — hygiene: required runtime dependencies retain their exact pins;
//   caps — invalid compatibleVersions declaration → 30; version downgrade
//        → 20; alpha.4 pin / missing or changed required dependency → 20; backup-and-skip instead of compatibility
//        → 50; schema contract bypass (including any/unknown) → 70;
//    0 — fixture untouched, persisted data / tests / node_modules modified,
//        or the git baseline rewritten (all git-gated).
// Valid candidate outcomes emit a score packet; verifier failures exit nonzero.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { assembleScore } from './judge-utils.mjs'

function emit(score, reasons) {
  console.log(JSON.stringify({ score, max: 100, reasons }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  grade().catch(emitError)
}

// Explicit paths let regression tests use disposable fixtures and a separate
// verifier anchor. Production never accepts a baseline from the agent workspace.
export async function grade(APP = '/app', baselineFile = '/opt/h23-verifier/baseline.sha') {
  const SPEC_FILE = join(APP, 'fixture', 'src', 'domain-spec.mjs')
  const PACKAGE_FILE = join(APP, 'fixture', 'package.json')
  const DATA_ROOT = join(APP, 'fixture', 'data')
  const A_FILE = join(DATA_ROOT, 'migration_summaries', 'summaries', 'A.json')
  const CORDIS = join(APP, 'fixture', 'node_modules', '@deepseek-ai', 'cordis', 'lib', 'index.js')
  const STORAGE = join(APP, 'fixture', 'node_modules', '@deepseek-ai', 'dsh-storage', 'lib', 'index.js')
  const STORAGE_JSON = join(APP, 'fixture', 'node_modules', '@deepseek-ai', 'dsh-storage-json', 'lib', 'index.js')
  const STORAGE_DOMAIN = join(APP, 'fixture', 'node_modules', '@deepseek-ai', 'dsh-storage-domain', 'lib', 'index.js')
  const reasons = []
  if (!existsSync(SPEC_FILE)) { emit(0, ['fixture domain spec missing']); return }

  // Check the protected anchor before importing any candidate code. Never fall
  // back to HEAD or an agent-owned /app/baseline.sha when it is unavailable.
  const git = (...args) => execFileSync('git', ['-C', APP, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  let baseline
  try {
    baseline = readFileSync(baselineFile, 'utf8').trim()
    if (!/^[a-f0-9]{40}$/.test(baseline)) throw new Error('invalid baseline SHA')
    git('cat-file', '-e', `${baseline}^{commit}`)
  } catch (error) { emitError(error); return }

  // Recheck after candidate execution as well as before it. Only the judge's
  // own A write may alter sealed data; freeze its bytes before close/reopen and
  // schema probes so later candidate side effects cannot hide behind that write.
  const allowed = (p) => p.startsWith('fixture/src/') || p === 'fixture/package.json'
  const sealedDirectory = (p) => ['fixture/data/', 'fixture/tests/', 'fixture/node_modules/'].some((prefix) => p.startsWith(prefix))
  let judgeWrittenA = null
  let packageJson = null
  let modified = []
  function integrityHolds() {
    try {
      if (readFileSync(baselineFile, 'utf8').trim() !== baseline) throw new Error('trusted baseline changed')
      if (git('rev-parse', 'HEAD').trim() !== baseline) throw new Error('git history rewritten (baseline commit moved)')
      if (packageJson !== null && readFileSync(PACKAGE_FILE, 'utf8') !== packageJson) throw new Error('candidate package.json changed during verification')
      const lines = git('status', '--porcelain', '--untracked-files=all').split('\n').filter(Boolean)
      modified = lines.filter((line) => !line.startsWith('??')).map((line) => line.slice(3))
      const isJudgeWrite = (p) => judgeWrittenA !== null && p === 'fixture/data/migration_summaries/summaries/A.json'
      const tampered = modified.filter((p) => !allowed(p) && !isJudgeWrite(p))
      tampered.push(...lines.filter((line) => line.startsWith('??') && sealedDirectory(line.slice(3))).map((line) => line.slice(3)))
      if (judgeWrittenA !== null && !readFileSync(A_FILE).equals(judgeWrittenA)) tampered.push('fixture/data/migration_summaries/summaries/A.json')
      if (tampered.length > 0) throw new Error(`sealed files modified (persisted data / tests / node_modules / host): ${tampered.join(' | ').slice(0, 200)}`)
      return true
    } catch (error) {
      emit(0, [`integrity check failed: ${error.message}`])
      return false
    }
  }
  if (!integrityHolds()) return
  if (modified.length === 0) { emit(0, ['fixture untouched — no migration performed']); return }

  // Import the agent's spec module (an invalid declaration throws at load).
  let spec = null
  let expected
  try {
    // Snapshot sealed input records before loading candidate code.
    expected = Object.fromEntries(['A', 'B', 'C'].map((key) => [key,
      JSON.parse(readFileSync(join(DATA_ROOT, 'migration_summaries', 'summaries', `${key}.json`), 'utf8')).record,
    ]))
    packageJson = readFileSync(PACKAGE_FILE, 'utf8')
  } catch (error) { emit(0, [`fixture files unreadable: ${error.message}`]); return }
  try {
    const mod = await import(pathToFileURL(SPEC_FILE).href)
    spec = mod.spec ?? null
  } catch (error) {
    reasons.push(`domain spec fails to load: ${String(error.message).slice(0, 160)}`)
  }
  if (!integrityHolds()) return

  // Behavioral checks against the real alpha.5 runtime.
  let behavioral = 0
  if (spec !== null) {
    try {
      const { Context } = await import(pathToFileURL(CORDIS).href)
      const { default: Storage } = await import(pathToFileURL(STORAGE).href)
      const { JsonStorageBackend } = await import(pathToFileURL(STORAGE_JSON).href)
      const { DomainFacility } = await import(pathToFileURL(STORAGE_DOMAIN).href)

      async function openDomain() {
        const ctx = new Context()
        await ctx.plugin(Storage)
        ctx.storage.backend.register('json', new JsonStorageBackend(DATA_ROOT))
        const facility = new DomainFacility(ctx, { backend: 'json' })
        const domain = await facility.open(spec)
        return { domain, table: domain.table('summaries') }
      }

      const first = await openDomain()
      const visible = () => [...first.table.keys()].sort()

      const keys1 = visible()
      if (isDeepStrictEqual(first.table.get('A'), expected.A) && isDeepStrictEqual(first.table.get('B'), expected.B)) {
        behavioral += 25
        reasons.push('+25 v4 records A and B preserved unchanged')
      } else {
        reasons.push(`+0 v4 record contents missing or changed (got ${keys1.join(',') || 'none'})`)
      }
      const c = first.table.get('C')
      if (isDeepStrictEqual(c, expected.C)) {
        behavioral += 10
        reasons.push('+10 v5 record C intact with its optional field')
      } else {
        reasons.push('+0 v5 record C missing or field lost')
      }
      if (!keys1.includes('D')) {
        behavioral += 10
        reasons.push('+10 unlisted v3 record D still foreign')
      } else {
        reasons.push('+0 unlisted v3 record D became visible')
      }
      if (!integrityHolds()) return
      const expectedUpdated = { ...expected.A, title: 'judge-updated' }
      const a = first.table.get('A')
      if (a === undefined) {
        // Do not manufacture a schema-invalid record that backup-and-skip
        // would then quarantine on reopen: this is a failed read, not a write.
        reasons.push('+0 write: version-4 record A is absent')
      } else {
        await first.table.put('A', { ...a, title: 'judge-updated' })
        judgeWrittenA = readFileSync(A_FILE)
        const written = JSON.parse(judgeWrittenA.toString('utf8'))
        if (written.version === 5 && isDeepStrictEqual(written.record, expectedUpdated)) {
          behavioral += 10
          reasons.push('+10 read-modify-write preserved the record and re-stamped version 5')
        } else {
          reasons.push(`+0 write lost record fields or stamped version ${written.version} instead of 5`)
        }
      }
      await first.domain.close()

      const second = await openDomain()
      const keys2 = [...second.table.keys()].sort()
      const aUpdated = second.table.get('A')
      if (keys2.includes('A') && keys2.includes('B') && keys2.includes('C') && !keys2.includes('D')
        && isDeepStrictEqual(aUpdated, expectedUpdated)
        && isDeepStrictEqual(second.table.get('B'), expected.B)
        && isDeepStrictEqual(second.table.get('C'), expected.C)) {
        behavioral += 10
        reasons.push('+10 close+reopen retains the expected state')
      } else {
        reasons.push(`+0 reopen state mismatch (got ${keys2.join(',') || 'none'})`)
      }
      await second.domain.close()
    } catch (error) {
      reasons.push(`behavioral checks could not run: ${String(error.message).slice(0, 160)}`)
    }
  }

  const { score, reasons: migrationReasons } = assembleScore({ behavioral, spec, packageJson })
  if (!integrityHolds()) return
  reasons.push(...migrationReasons)
  emit(score, reasons)
}
