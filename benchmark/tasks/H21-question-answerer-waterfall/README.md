# H21-question-answerer-waterfall · One answerer across two DSH cohorts

This hands-on task distills the structured-question answerer migration observed in
the real dsh-tui project during the DSH `0.1.1-rc.2 → 0.1.2` corridor
(`DSH-0.1.2-A1-20`). The fixture ships an rc.2-era registration: it claims the
legacy single-seat provider registration on the host's user-questions service and
forwards every question to an interactive `answerer`. Its local mock tests pass.
The real alpha.2 user-questions service no longer exposes that seat, so the same
attach path throws on the newer host and questions go unanswered.

The agent must produce one implementation that works against both real published
cohorts, keeps the exported entry point, the legacy mock tests, and the
claim/delegate/owner-swap/dispose contract, and proves it against the real
services installed under `/opt/dsh-cohorts/`. The fixture defines `owner` as a
mutable `{ agentId: string }` object and an addressed request's agent as
`{ id: string }`; matching is by identifier value, while a missing
`request.agent` is agentless. See [instruction.md](instruction.md) for the task
and [provenance/README.md](provenance/README.md) for the fixed incident, package,
and contamination evidence.

- **Environment:** Node 24, git, and two separately locked published package
  closures under `/opt/dsh-cohorts/{rc2,alpha2}`. Agent network access is
  disabled; the fixtures have no external runtime dependencies.
- **Verifier:** imports the candidate once per cohort, drives each cohort's real
  `UserQuestionService`, and requires registration plus the full claim,
  delegation, owner-swap, and disposal contract on the newer host while the
  legacy seat still works on rc.2. It also runs the candidate's unit tests and
  rejects version/identity/retry branching.
- **Oracle:** `harbor run -p benchmark/tasks/H21-question-answerer-waterfall -a oracle`,
  expected reward `1.0`.
- **Score design (summary; the sealed judge is authoritative):**
  - legacy-seat claim on the real rc.2 service, with the fixture's unchanged
    mock tests green — the rc.2 side is not allowed to break while alpha.2 is
    fixed;
  - real alpha.2 registration and delivery for the current owner, pass-on for a
    foreign owner, rebinding after an owner swap, and clean disposal without
    stacking on repeated attach;
  - agentless delivery checked only in the shared-Context topology;
  - static caps against parsing a version string, matching a host identity, or
    retrying a failed registration.
- **Evaluation boundary:** current-main skill material already states the
  `DSH-0.1.2-A1-20` recipe, so with-skill trials must use a fixed pre-answer
  skill snapshot (see the provenance document); no-skill and generic-skill
  conditions keep the unchanged prompt and task image.

This is a structured-question answerer registration test. It does not claim a TUI
panel render, keyboard interaction, provider credentials, or whole-product
equivalence between rc.2 and alpha.2.
