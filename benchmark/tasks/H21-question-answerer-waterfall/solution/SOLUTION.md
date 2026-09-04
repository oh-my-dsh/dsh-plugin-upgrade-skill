# H21 dual-cohort question-answerer reference solution

The fixture's starting `src/register.js` claims the rc.2-era single-seat
provider registration (`service.registerProvider({ ask })`) and forwards
every request to the answerer. The published alpha.2 `UserQuestionService`
no longer exposes that seat at all — on that host the same call throws
`TypeError: service.registerProvider is not a function` even though the local
mock tests (which model exactly the rc.2 seat) stay green.

## What the published packages actually show

- rc.2 (`@deepseek-ai/dsh-user-questions@0.1.1-rc.2`): `registerProvider`
  exists and returns a disposer; an agentless `ask()` routes to the active
  provider. A second concurrent registration rejects with
  `DUPLICATE_PROVIDER`; asking without a provider rejects `NO_PROVIDER`.
- alpha.2 (`@deepseek-ai/dsh-user-questions@0.1.2-alpha.2`): no
  `registerProvider`; `ask()` validates the request and dispatches it over
  the Cordis answerer waterfall on the service's own Context — scope-targeted
  through `@deepseek-ai/dsh-scope` when a live agent is supplied, plain when
  it is not. Returning an answer claims the request; calling `next()` passes
  it on to the rest of the chain.

There is no common version or host field to read, and reading one would be
brittle anyway. The two hosts differ by one stable capability, so the seam is
chosen by capability detection, once, at attach time:

```js
if (typeof service.registerProvider === 'function') {
  // legacy single-seat host: rc.2 behavior unchanged
  return service.registerProvider({ ask: (request) => answerer.ask(request) })
}
// newer host: answerer listener on the shared context's waterfall
return ctx.on('user-questions/request', (request, next) => { ... })
```

## Waterfall claim/delegate semantics

- `request.agent === undefined` → claimed and answered: agentless requests
  (the `/auth`-style wizard has no agent) are taken over proactively.
- `request.agent.id === owner.agentId` → claimed and answered.
- `request.agent.id !== owner.agentId` → `return next()`, exactly once, so
  the host's remaining chain can still answer the question.
- The owner id is read per request (never captured at attach time), so
  rebinding the `owner` object after `/new`/`/resume`/rewind re-targets
  claims without reinstalling.
- The returned disposer is the registration disposer, and each fresh attach
  first disposes the previous registration for the same service/context, so
  repeat attaches do not stack answerers.

`ctx` is the context that the host composes the answerer into; agentless
delivery is only claimed on that shared context by construction of the test
topology, and no `ctx.root`, version literal, arity check, identity match, or
exception-driven fallback is used anywhere.

## Evidence and tests

- `plugin/src/register.js` is the reference implementation.
- `plugin/test/register.test.mjs` is the fixture regression suite for the
  oracle run: it keeps the three original rc.2-era mock assertions
  (legacy seat claim, forwarding, failure propagation) and adds a package-free
  mock of the newer host's waterfall dispatch (`on` + innermost-fallthrough)
  covering agentless claim, current-owner claim, one-shot foreign delegation,
  owner rebinding, disposer fall-through, and non-stacking repeat attach on
  both hosts.
- `solve.sh` copies both files into `/app/fixture`, then the fixture's
  `npm test` runs the whole suite.
- The sealed judge additionally drives the real rc.2 and alpha.2
  `UserQuestionService` instances from the installed cohort closures
  (shared-Context agentless `ask()`, `scopeTarget`-scoped waterfall dispatch)
  and must score 100 against this implementation.
