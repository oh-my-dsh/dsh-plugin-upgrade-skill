# H21 · One structured-question answerer across two DSH cohorts

## Unattended benchmark authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation in a disposable isolated container; there will be
no follow-up user messages. This prompt is the user's explicit authorization and
confirmation for the analysis, plan, and execution needed to complete the task.
Proceed as soon as the plan is formed; do not pause to wait for "confirmation" and
do not ask the user follow-up questions. This authorization is limited to this scope:

- You may read local files and tools in the container, may modify `/app/fixture/`
  directly, and may write a report under
  `/app/agent-output/H21-question-answerer-waterfall/`;
- You may run local tests and probes, import the read-only published host packages
  installed under `/opt/dsh-cohorts/`, and create disposable verification files
  under `/tmp` (or under your report directory);
- You must not modify the skill, the verifier, the reference solution,
  `/opt/dsh-cohorts`, or any resources outside the container, and must not publish,
  push, or access external services;
- Do not use provider-side web search or outside repository material. If completion
  is impossible, report the blocker honestly, but do not stop merely because another
  round of confirmation is missing.

## Scenario

`/app/fixture/` is a small source slice distilled from a real UI-plugin migration:
an interactive answerer for structured host questions. Its local mock tests pass
after the plugin was written against the rc.2-era contract. Production still runs
two supported host cohorts, however:

- `/opt/dsh-cohorts/rc2` contains the published DSH 0.1.1-rc.2 package closure, whose
  user-questions service still offers the legacy single-seat provider registration
  that the fixture's mock models;
- `/opt/dsh-cohorts/alpha2` contains the published DSH 0.1.2-alpha.2 package closure,
  whose real user-questions service no longer exposes that seat: the fixture's
  current attach path throws against it even though `npm test` stays green, and
  questions then go unanswered.

The fixture exports one entry point, `installQuestionAnswerer(ctx, service, owner,
answerer)`, returning a disposer. `answerer.ask(request)` collects the human
answer for a structured question and resolves with it. The public data contract
is deliberately small: `owner` is a mutable object with a string `agentId`
property; a request that identifies an agent carries `request.agent` as an
object with a string `id`; compare those identifier values rather than object
identity. A request with no `request.agent` is agentless. The legacy mock does
not consume `owner`, but this input contract applies to both cohorts.

Repair `src/register.js` so that **one implementation** works against both real
cohorts and keeps the following contract intact:

1. The exported entry point and its return contract stay the same; repeated
   attachment must not leave multiple answerers active, and every returned disposer
   must be safe to call.
2. Keep the existing mock regression assertions in `test/register.test.mjs` passing:
   a host that still offers the legacy seat must be served through that seat exactly
   as before. Add focused regression coverage when needed for the newer host.
3. On the alpha.2 real host the same implementation must reach the answerer: a
   question raised for the current `owner.agentId` is claimed and answered; a
   question addressed to a foreign `request.agent.id` is not swallowed — it must
   pass on so the rest of the host's chain can still handle it; after
   `owner.agentId` changes, questions for the new owner are answered and the
   previous binding is not left behind; after the returned disposer runs, no
   further question is answered.
4. The implementation must not parse a DSH version, match a host identity string,
   or retry a failed registration.
5. If you prove agentless delivery (a request carrying no `request.agent`), run
   that proof where the answerer listener and the real user-questions service
   share the same Context. Treat sibling-entry non-delivery as a topology boundary
   rather than a universal behavior claim.

Make the changes directly under `/app/fixture/`. Verify with the fixture's `npm
test` and with your own disposable probes against the real published packages under
`/opt/dsh-cohorts/{rc2,alpha2}` (read the installed packages to learn their real
entry surface; construct each cohort's real service and exercise the contract
above). The installed cohort trees and the benchmark internals are evidence and
verification infrastructure, not editable task inputs. Do not publish the private
fixture.
