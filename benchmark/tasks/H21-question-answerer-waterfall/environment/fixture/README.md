# Private H21 benchmark fixture — do not publish

This source slice models the structured-question answerer entry of an interactive
host UI plugin, written in the rc.2-era style. It has no external runtime
dependencies of its own.

- `npm test` runs the local mock, which models the rc.2-era user-questions
  service exactly as that host exposed it: one exclusive provider seat whose
  registration returns a disposer. The starting source claims that seat and
  forwards every question to the answerer, so the mock stays green while the
  newer real host no longer offers the seat at all.

The public integration API is `installQuestionAnswerer(ctx, service, owner,
answerer)` from `src/register.js`:

- `ctx` — the host context;
- `service` — the host's user-questions service instance;
- `owner` — a mutable object whose string `agentId` names the agent/session
  this answerer currently serves;
- `answerer` — the interactive implementation; it must expose
  `ask(request)`, which collects the human answer for a structured question
  and resolves with it.

When a request identifies an agent, `request.agent` is an object with a string
`id`. Compare identifier values (`request.agent.id` and `owner.agentId`), not
object identity. A request with no `request.agent` is agentless. The agentless
integration assertion is limited to a topology where the listener and
user-questions service share one Context.

It returns a disposer that releases the registration.

Exam material only, **do not publish** (`"private": true` in package.json).
Distilled from the dsh-tui question-answerer migration (DSH-0.1.2-A1-20); see
the task README and `provenance/` for the fixed sources.
