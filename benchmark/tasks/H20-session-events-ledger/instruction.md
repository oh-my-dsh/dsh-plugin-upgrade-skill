# H20 · Alpha.4 Session Event Ledger Migration (Hands-On)

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be no follow-up user messages. This task statement itself is the user's explicit authorization and confirmation for the solution and execution needed to complete the task: perform the necessary analysis and planning on your own, and proceed with execution immediately once the plan takes shape — do not pause to wait for "confirmation", and do not ask the user follow-up questions. This confirmation continues to apply to the concrete plan you produce based on the applicable skill, but only within the following scope:

- You may read `/app/fixture/` (including the installed packages under `/app/fixture/node_modules/` and their published type declarations) and local in-container documentation and tools; you may modify `/app/fixture/` directly, and write to the designated `/app/agent-output/` directory as specified by the task;
- You may create throwaway local verification scripts and temporary files, and run local tests and Node commands;
- You may not modify the skill, the verifier, or the reference solution; you may not modify the installed packages under `/app/fixture/node_modules/` or the contract tests under `/app/fixture/tests/` — the runtime is pinned and the tests are the contract, so patching either is not a migration; you may not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

## The situation

We are migrating our plugin from dsh 0.1.2-alpha.3 to dsh 0.1.2-alpha.4. The
alpha.4 runtime is installed in this container, pinned to the exact published
version — its sources and type declarations live under
`/app/fixture/node_modules/@deepseek-ai/dsh-session/`. One alpha.4 change
breaks this plugin module directly; the handover note in `/app/fixture/README.md`
explains what the module is for and which behavior must survive.

`/app/fixture/src/session-ledger.mjs` is the only place our plugin reads the
session event log. Migrate the five helpers in that file from their alpha.3
form to the alpha.4 runtime so every one of them keeps its documented
behavior — including on forked sessions, which carry history inherited from
their parent.

Verify from inside the fixture directory:

```sh
cd /app/fixture && node tests/contract.test.mjs
```

All checks must pass. The contract tests exercise your module against real
alpha.4 session objects (an ordinary session and a forked session with
inherited history) and check only the module's documented behavior. The judge
additionally verifies that the migration went through the installed runtime's
public alpha.4 API surface — do not invent replacement methods, do not keep
reading surfaces that alpha.4 removed, and do not reach into runtime
internals; write the migration in `/app/fixture/src/` only.
