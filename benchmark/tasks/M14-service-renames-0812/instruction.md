# M14 · 0812 Service Renames (webServer / jobs / onJobDone)

## Unattended Benchmark Authorization (BENCHMARK-AUTH-v1)

This is an unattended benchmark run in a disposable isolated container; there will be no follow-up user messages. This task statement is itself the user's explicit authorization and confirmation for the solution and execution needed to complete the task: complete the necessary analysis and planning on your own, and continue executing immediately once the plan is formed — do not pause to wait for "confirmation" and do not press the user with follow-up questions. That confirmation continues to apply to the concrete plans you produce under the applicable skill, but only within the following scope:

- You may read `/app/fixture/`, local in-container documentation, and local tools; you may modify `/app/fixture/` directly and write to the specified `/app/agent-output/` directory as instructed;
- You may create disposable local verification profiles and temporary files, and run local tests, builds, and dsh commands;
- You must not modify the skill, the grader, or the reference solution, and must not publish, push, access external services, or change resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

I have a plugin (working directory: `/app/fixture/`) that is already an npm bundle
package — it installs through `dsh plugin --profile web add` and has a working
`dsh.bundle`/`cordis.patch.yml` shape. Its Node half (`lib/index.mjs`) was written
against the pre-0812 host service names: it injects `tasks` and `httpServer`, reads
the task registry through `ctx.tasks`, registers its route through
`ctx.httpServer.register`, and subscribes to job completion through the
`onTaskDone` listener.

The host in this container is dsh 0.1.2-alpha.2, which **renamed those services on
0812** (DSH-0.1.1-R1-09): the web carrier `httpServer` → `webServer`, the task
registry `tasks` → `jobs`, and the completion listener `onTaskDone` → `onJobDone`.
The old names no longer exist on this host: `inject` entries and `ctx.*` references
for them do not resolve, so the plugin currently sits at
`pending (waiting for services: tasks, httpServer)` and the whole tree fails to
activate. Migrate the Node half so it activates on 0.1.2-alpha.2 through the one
official path: **rename the injected service identifiers and every `ctx` usage**
(`httpServer`→`webServer`, `tasks`→`jobs`) **and the event listener**
(`onTaskDone`→`onJobDone`). The route-registration interface
(`webServer.register`) otherwise keeps its shape — keep serving the same
`/bench-status/status` route with its JSON payload and keep the same
`cordis.patch.yml` insert; do not rewrite unrelated code. The trailing "status"
path segment and the payload must keep working so the route can be smoke-tested
after a cold boot.

dsh 0.1.2-alpha.2 is already installed globally in the container. You may create an
isolated profile yourself and run cold boot verification with `dsh plugin
--profile … add` / `dsh --profile … --no-open`: with the old names the boot must
fail at `pending (waiting for services: tasks, httpServer)`, and after the rename
it must reach `dsh web: …` with no pending entry, and `GET /bench-status/status`
must answer 200. Edit the files under `/app/fixture/` directly. Everything outside
`/app/fixture/` is not part of this task — leave it alone.