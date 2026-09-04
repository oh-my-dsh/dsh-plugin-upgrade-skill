/**
 * rc.2-era registration for the interactive structured-question answerer.
 *
 * The rc.2 host exposes one exclusive provider seat on its user-questions
 * service: claiming it returns a disposer, and every question raised on the
 * host is forwarded to the seat's ask adapter. The context and the current
 * owner identity are part of the stable entry contract and are not consulted
 * by this legacy seat.
 */
export function installQuestionAnswerer(ctx, service, owner, answerer) {
  return service.registerProvider({
    ask: (request) => answerer.ask(request),
  })
}
