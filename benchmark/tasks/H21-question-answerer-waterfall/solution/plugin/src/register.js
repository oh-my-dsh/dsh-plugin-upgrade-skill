/**
 * One interactive structured-question answerer registration across the two
 * supported DSH host cohorts.
 *
 * The seam is chosen by capability, not by version or host identity: a host
 * that still exposes the legacy single-seat user-questions provider is
 * served through that seat exactly as the rc.2-era code did — claiming
 * returns the seat's own disposer and every request is forwarded to the
 * answerer. A host without the seat (the newer user-questions service) is
 * served by a listener on the answerer request waterfall of the shared
 * context.
 *
 * Waterfall semantics per request:
 * - no agent carried: claimed and answered (the /auth-style wizard has no
 *   agent and must still reach a human);
 * - agent id matches the current owner: claimed and answered;
 * - agent id differs from the current owner: `next()` is called so the rest
 *   of the host's chain can still handle the request;
 * - the owner identity is read per request, so rebinding the owner object
 *   re-targets claims without reinstalling.
 *
 * Each attach supersedes the previous one for the same service/context
 * (fresh attach wins, old registrations are disposed), and every attach
 * returns a disposer.
 */

const legacySeats = new WeakMap()
const waterfallSeats = new WeakMap()

export function installQuestionAnswerer(ctx, service, owner, answerer) {
  if (typeof service.registerProvider === 'function') {
    dispose(legacySeats, service)
    const disposer = service.registerProvider({
      ask: (request) => answerer.ask(request),
    })
    legacySeats.set(service, disposer)
    return disposer
  }
  dispose(waterfallSeats, ctx)
  const disposer = ctx.on('user-questions/request', (request, next) => {
    if (request.agent === undefined) return answerer.ask(request)
    if (request.agent.id !== owner.agentId) return next()
    return answerer.ask(request)
  })
  waterfallSeats.set(ctx, disposer)
  return disposer
}

function dispose(seats, key) {
  const previous = seats.get(key)
  if (previous === undefined) return
  seats.delete(key)
  previous()
}
