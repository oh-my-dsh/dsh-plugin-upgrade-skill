// H21 sealed judge: one interactive structured-question answerer across the
// real rc.2 and alpha.2 user-questions services.
//
// Points: fixture changed + candidate import + stable export 10; fixture
// `npm test` 10; real rc.2 single-seat claim/dispose 15; real alpha.2
// shared-Context agentless delivery 15; scoped current-owner claim 15;
// foreign-owner delegation 15; owner swap 10; repeat attach + stale disposer 10.
// Real service behavior is the primary evidence; the event name and scope-carrier
// dispatch are absent from the prompt and fixture README, but discoverable by
// inspecting the read-only published cohort packages allowed by the task.
//
// Static source scan caps: version parsing/literals, host/context identity
// matching, ctx.root registration, and explicit retry fallbacks zero the
// alpha.2 behavior checkpoints; capability detection
// (`typeof service.registerProvider === 'function'`) is valid and passes.

import assert from 'node:assert/strict'
import {
  cohortManifestIntegrity,
  cohortModuleUrl,
  emit,
  fixtureChanges,
  importCandidate,
  inspectBranching,
  run,
  tail,
} from './judge-utils.mjs'

const REPO_ROOT = process.env.H21_REPO ?? '/app'
const FIXTURE = process.env.H21_FIXTURE ?? '/app/fixture'
const COHORT_ROOT = process.env.H21_COHORT_ROOT ?? '/opt/dsh-cohorts'

// Judge/tests-only knowledge: the newer host dispatches answerer requests
// over this context waterfall event (absent from instruction.md and the
// fixture README on purpose).
const REQUEST_EVENT = 'user-questions/request'

const COHORTS = [
  {
    name: 'rc2',
    root: `${COHORT_ROOT}/rc2`,
    expected: {
      '@deepseek-ai/cordis': '4.0.2',
      '@deepseek-ai/dsh-user-questions': '0.1.1-rc.2',
      '@deepseek-ai/dsh-scope': '0.1.1-rc.2',
    },
  },
  {
    name: 'alpha2',
    root: `${COHORT_ROOT}/alpha2`,
    expected: {
      '@deepseek-ai/cordis': '4.0.2',
      '@deepseek-ai/dsh-user-questions': '0.1.2-alpha.2',
      '@deepseek-ai/dsh-scope': '0.1.2-alpha.2',
    },
  },
]

const EXPORT_NAME = 'installQuestionAnswerer'

main().catch((error) => emit(0, [`judge error: ${error instanceof Error ? error.stack : String(error)}`]))

async function main() {
  const reasons = []

  // --- 1. fixture changed + candidate import + stable export (10) --------
  const changed = await fixtureChanges(REPO_ROOT, 'fixture')
  if (!changed.ok) emit(0, [changed.detail])
  reasons.push(changed.detail)

  let candidate
  try {
    candidate = await importCandidate(FIXTURE)
  } catch (error) {
    emit(0, [...reasons, `candidate import failed: ${error instanceof Error ? error.message : String(error)}`])
  }
  if (typeof candidate[EXPORT_NAME] !== 'function') {
    emit(0, [...reasons, `required export ${EXPORT_NAME}(ctx, service, owner, answerer) is missing`])
  }
  let score = 10
  reasons.push(`candidate imports and preserves ${EXPORT_NAME}`)

  // --- 2. fixture mock regression tests (10) -----------------------------
  const unit = await run('npm', ['test'], FIXTURE, 60000)
  if (unit.code === 0) {
    score += 10
    reasons.push('fixture mock regression tests pass under npm test')
  } else {
    reasons.push(`fixture npm test failed: ${tail(unit.stdout + unit.stderr, 240)}`)
  }

  // --- cohort manifest integrity (tampering is a hard zero) ---------------
  for (const cohort of COHORTS) {
    const integrity = await cohortManifestIntegrity(cohort)
    if (!integrity.ok) emit(0, [...reasons, integrity.detail])
  }
  reasons.push('both cohort closures match their frozen manifests (user-questions 0.1.1-rc.2 / 0.1.2-alpha.2)')

  // --- static anti-gaming scan (alpha.2 checkpoints are capped by hits) ---
  const branch = await inspectBranching(`${FIXTURE}/src`)
  if (!branch.ok) {
    const hits = branch.hits.join(', ')
    emit(score, [...reasons, `static anti-gaming gate failed (${hits}); real-service checkpoints not attempted`])
  }

  // --- 3. real rc.2 single-seat claim and disposal (15) -------------------
  const rc2 = await probeLegacyCohort(candidate[EXPORT_NAME])
  if (rc2.ok) {
    score += 15
    reasons.push('rc.2: real service claim forwards a question to the answerer and the disposer restores NO_PROVIDER')
  } else {
    reasons.push(`rc.2 real service: ${rc2.detail}`)
  }

  // --- 4-8. real alpha.2 waterfall contract (15 + 15 + 15 + 10 + 10) ------
  // Checkpoint 8 is a repeat attach on the same Context and owner: claims
  // must not stack, the stale disposer must spare the replacement listener,
  // and the live disposer must stop claims.
  const alpha2 = await probeWaterfallCohort(candidate[EXPORT_NAME])
  for (const step of alpha2) {
    if (step.ok) {
      score += step.points
      reasons.push(`alpha.2: ${step.label}`)
    } else {
      reasons.push(`alpha.2 ${step.label}: ${step.detail}`)
    }
  }

  emit(score, reasons)
}

/** Real rc.2 UserQuestionService: install, agentless ask, dispose, NO_PROVIDER. */
async function probeLegacyCohort(install) {
  const cohort = COHORTS[0]
  let ctx
  try {
    const cordis = await import(cohortModuleUrl(cohort.root, '@deepseek-ai/cordis'))
    const userQuestions = await import(cohortModuleUrl(cohort.root, '@deepseek-ai/dsh-user-questions'))
    ctx = new cordis.Context()
    const service = new userQuestions.UserQuestionService(ctx)
    const saw = []
    const answerer = {
      ask: async (request) => {
        saw.push(request.questions[0].id)
        return answerMarker(request.questions[0].id)
      },
    }
    const request = { questions: [{ id: 'rc2-claim-q', text: 'continue?', options: [{ label: 'yes', value: 'yes' }] }] }

    let disposer
    try {
      disposer = install(ctx, service, { agentId: 'agent-current' }, answerer)
    } catch (error) {
      return fail(`attach threw: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (typeof disposer !== 'function') {
      return fail('install did not return a disposer function')
    }

    const answer = await service.ask(request)
    assert.deepEqual(answer, answerMarker('rc2-claim-q'))
    assert.deepEqual(saw, ['rc2-claim-q'], 'answerer did not receive exactly the raised question')

    disposer()
    await rejectsWithCode(service.ask({ questions: [{ id: 'rc2-after-q' }] }), 'NO_PROVIDER')
    return { ok: true }
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  } finally {
    await disposeContext(ctx)
  }
}

/**
 * Real alpha.2 UserQuestionService on its own Context. A first attach covers
 * the agentless shared-Context ask (4), scoped current-owner claim (5),
 * foreign-owner delegation (6) and owner-object swap (7). A repeat attach on
 * the same Context and owner then covers disposer semantics (8): claims must
 * not stack, the stale disposer from the first attach must leave the
 * replacement listener alive, and the live disposer must stop claims.
 * Scoped dispatches replicate the service's post-validation path:
 * `ctx.waterfall(scopeTarget(agent, agent), event, request, next)`.
 */
async function probeWaterfallCohort(install) {
  const cohort = COHORTS[1]
  const steps = []
  const failStep = (label, points, error) => steps.push({ label, points, ok: false, detail: error instanceof Error ? error.message : String(error) })

  let ctx
  let disposer
  let replacementDisposer
  try {
    const cordis = await import(cohortModuleUrl(cohort.root, '@deepseek-ai/cordis'))
    const userQuestions = await import(cohortModuleUrl(cohort.root, '@deepseek-ai/dsh-user-questions'))
    const scope = await import(cohortModuleUrl(cohort.root, '@deepseek-ai/dsh-scope'))
    ctx = new cordis.Context()
    const service = new userQuestions.UserQuestionService(ctx)

    const saw = []
    const fell = []
    const answerer = {
      ask: async (request) => {
        saw.push(request.questions[0].id)
        return answerMarker(request.questions[0].id)
      },
    }
    const dispatchScoped = async (agentId, questionId) => {
      const agent = { id: agentId }
      const request = { questions: [{ id: questionId, text: 'choose?' }], agent }
      // The waterfall's `next` callback has no request parameter. Capture the
      // id in this per-dispatch tail instead of relying on an undocumented
      // argument being forwarded by Cordis.
      const downstream = async () => {
        fell.push(questionId)
        return downstreamMarker(questionId)
      }
      const answer = await ctx.waterfall(
        scope.scopeTarget(agent, agent),
        REQUEST_EVENT,
        request,
        downstream,
      )
      return answer
    }
    const owner = { agentId: 'agent-current' }

    // --- first attach; a missing disposer disables every later step -------
    try {
      disposer = install(ctx, service, owner, answerer)
    } catch (error) {
      for (const { label, points } of WATERFALL_STEPS) failStep(label, points, `attach threw: ${error.message}`)
      return steps
    }
    if (typeof disposer !== 'function') {
      for (const { label, points } of WATERFALL_STEPS) failStep(label, points, 'install did not return a disposer function')
      return steps
    }

    try {
      const agentless = { questions: [{ id: 'alpha-agentless-q', text: 'go?' }] }
      assert.deepEqual(await service.ask(agentless), answerMarker('alpha-agentless-q'))
      assert.deepEqual(saw, ['alpha-agentless-q'], 'agentless ask did not reach exactly the answerer')
      assert.deepEqual(fell, [], 'agentless ask leaked to the downstream fallback')
      steps.push({ label: 'shared-Context agentless ask is claimed and answered', points: 15, ok: true })
    } catch (error) {
      failStep('shared-Context agentless ask is claimed and answered', 15, error)
    }

    try {
      assert.deepEqual(await dispatchScoped('agent-current', 'alpha-current-q'), answerMarker('alpha-current-q'))
      assert.deepEqual(saw, ['alpha-agentless-q', 'alpha-current-q'])
      assert.deepEqual(fell, [])
      steps.push({ label: 'scoped current-owner request is claimed; downstream untouched', points: 15, ok: true })
    } catch (error) {
      failStep('scoped current-owner request is claimed; downstream untouched', 15, error)
    }

    try {
      assert.deepEqual(await dispatchScoped('agent-foreign', 'alpha-foreign-q'), downstreamMarker('alpha-foreign-q'))
      assert.deepEqual(saw, ['alpha-agentless-q', 'alpha-current-q'], 'foreign request reached the answerer')
      assert.deepEqual(fell, ['alpha-foreign-q'], 'foreign request did not delegate exactly once')
      steps.push({ label: 'foreign-owner request delegates to the next handler exactly once', points: 15, ok: true })
    } catch (error) {
      failStep('foreign-owner request delegates to the next handler exactly once', 15, error)
    }

    try {
      owner.agentId = 'agent-foreign'
      assert.deepEqual(await dispatchScoped('agent-foreign', 'alpha-swap-claim-q'), answerMarker('alpha-swap-claim-q'))
      assert.deepEqual(saw, ['alpha-agentless-q', 'alpha-current-q', 'alpha-swap-claim-q'])
      assert.deepEqual(fell, ['alpha-foreign-q'])
      assert.deepEqual(await dispatchScoped('agent-current', 'alpha-swap-delegate-q'), downstreamMarker('alpha-swap-delegate-q'))
      assert.deepEqual(saw, ['alpha-agentless-q', 'alpha-current-q', 'alpha-swap-claim-q'], 'delegated request reached the answerer')
      assert.deepEqual(fell, ['alpha-foreign-q', 'alpha-swap-delegate-q'])
      steps.push({ label: 'owner-object rebinding moves claims to the new owner', points: 10, ok: true })
    } catch (error) {
      failStep('owner-object rebinding moves claims to the new owner', 10, error)
    }

    try {
      // Repeat attach on the same Context and owner while the first disposer
      // is still outstanding (plugin re-mount; owner.agentId is agent-foreign
      // here, so scoped agent-foreign dispatches are current-owner claims).
      // Claims must move to the replacement answerer without stacking, the
      // stale disposer from the first attach must not kill the replacement
      // listener, and the live replacement disposer must stop claims
      // entirely afterwards. Baselines are captured below so this step still
      // judges its own requests exactly even if an earlier step failed.
      const sawBefore = [...saw]
      const fellBefore = [...fell]
      const replacementSaw = []
      const replacementAnswerer = {
        ask: async (request) => {
          replacementSaw.push(request.questions[0].id)
          return answerMarker(request.questions[0].id)
        },
      }
      replacementDisposer = install(ctx, service, owner, replacementAnswerer)
      if (typeof replacementDisposer !== 'function') {
        throw new Error('repeat install did not return a disposer function')
      }

      // Probe before calling the stale disposer: a correct replacement must
      // already have removed the first listener, rather than relying on the
      // old handle to remove it later.
      const preDisposed = await dispatchScoped('agent-foreign', 'alpha-repeat-pre-dispose-q')
      assert.deepEqual(replacementSaw, ['alpha-repeat-pre-dispose-q'], 'the replacement answerer did not supersede the first listener before stale disposal')
      assert.deepEqual(saw, sawBefore, 'the first answerer still claims before stale disposal (claims stack instead of superseding)')
      assert.deepEqual(fell, fellBefore, 'a current-owner request reached the downstream before stale disposal')
      assert.deepEqual(preDisposed, answerMarker('alpha-repeat-pre-dispose-q'), 'the replacement request was not answered as a claim before stale disposal')

      disposer() // stale: from the first attach, must leave the new listener alive
      const claimed = await dispatchScoped('agent-foreign', 'alpha-repeat-claim-q')
      assert.deepEqual(replacementSaw, ['alpha-repeat-pre-dispose-q', 'alpha-repeat-claim-q'], 'the replacement answerer did not claim exactly the re-attached requests (the stale disposer killed the new listener, or the old listener still claims)')
      assert.deepEqual(saw, sawBefore, 'the first answerer still claims after repeat attach (claims stack instead of superseding)')
      assert.deepEqual(fell, fellBefore, 'a current-owner request reached the downstream before the live disposer ran')
      assert.deepEqual(claimed, answerMarker('alpha-repeat-claim-q'), 'the re-attached request was not answered as a claim')

      replacementDisposer()
      const after = await dispatchScoped('agent-foreign', 'alpha-repeat-disposed-q')
      assert.deepEqual(after, downstreamMarker('alpha-repeat-disposed-q'), 'a request after the replacement disposer ran did not fall through to the downstream')
      assert.deepEqual(replacementSaw, ['alpha-repeat-pre-dispose-q', 'alpha-repeat-claim-q'], 'the replacement answerer claimed after its own disposer ran')
      assert.deepEqual(saw, sawBefore, 'the first answerer claimed after the replacement disposer ran')
      assert.deepEqual(fell, [...fellBefore, 'alpha-repeat-disposed-q'], 'the post-disposal request did not reach the downstream exactly once')
      steps.push({ label: 'repeat attach does not stack claims; the stale disposer spares the replacement listener; the replacement disposer stops claims afterwards', points: 10, ok: true })
    } catch (error) {
      failStep('repeat attach does not stack claims; the stale disposer spares the replacement listener; the replacement disposer stops claims afterwards', 10, error)
    }
    return steps
  } catch (error) {
    for (const { label, points } of WATERFALL_STEPS) failStep(label, points, `probe setup failed: ${error.message}`)
    return steps
  } finally {
    // Dispose in reverse install order (both are idempotent no-ops when the
    // step already ran them); never leave a stale disposer attached.
    try { replacementDisposer?.() } catch { /* best-effort */ }
    try { disposer?.() } catch { /* best-effort */ }
    await disposeContext(ctx)
  }
}

const WATERFALL_STEPS = [
  { label: 'shared-Context agentless ask is claimed and answered', points: 15 },
  { label: 'scoped current-owner request is claimed; downstream untouched', points: 15 },
  { label: 'foreign-owner request delegates to the next handler exactly once', points: 15 },
  { label: 'owner-object rebinding moves claims to the new owner', points: 10 },
  { label: 'repeat attach does not stack claims; the stale disposer spares the replacement listener; the replacement disposer stops claims afterwards', points: 10 },
]

/** Distinct markers make the provenance of every answer exact. */
const answerMarker = (questionId) => ({ kind: 'choice', questionId, origin: 'answerer' })
const downstreamMarker = (questionId) => ({ kind: 'choice', questionId, origin: 'downstream' })

async function rejectsWithCode(promise, code) {
  let error
  try {
    await promise
  } catch (caught) {
    error = caught
  }
  assert.ok(error, `expected rejection with code ${code}, got a resolution`)
  assert.equal(error.code, code, `expected code ${code}, got ${String(error?.code)} (${error?.message ?? ''})`)
}

async function disposeContext(ctx) {
  if (!ctx) return
  try {
    await ctx.fiber.dispose()
  } catch {
    // The root fiber of a bare Context has no teardown work; never fatal.
  }
}

function fail(detail) {
  return { ok: false, detail: String(detail).slice(0, 500) }
}
