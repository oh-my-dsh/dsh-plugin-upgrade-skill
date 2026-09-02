# M14-service-renames-0812 · 0812 Service Renames (httpServer→webServer, tasks→jobs, onTaskDone→onJobDone)

The agent migrates the Node half in `/app/fixture/` (`lib/index.mjs`), an npm bundle
plugin still written against the pre-0812 host services: `inject: ['tasks',
'httpServer']`, `ctx.tasks` reads, `ctx.httpServer.register`, and an `onTaskDone`
listener. On the alpha.2 host those names no longer resolve, so the boot fails at
`pending (waiting for services: tasks, httpServer)`. The migrate is a pure rename
per the DSH-0.1.1-R1-09 recipe: `webServer` / `jobs` / `onJobDone`, keeping
`webServer.register`'s shape and the same `/bench-status/status` route. Task
statement in [instruction.md](instruction.md), grading logic in
[tests/judge.mjs](tests/judge.mjs).

**The subtle trap**: the fixture's comments insist the old names are the official
ones ("`httpServer` is the official web carrier service name — do not rename it;
`tasks` is the official task-registry name"). Following the comments keeps the
plugin at `pending (waiting for services: tasks, httpServer)`; the judge sweeps the
migrated Node half for the old identifiers (code **and** comments), so a rename
that leaves an old-name comment behind still loses the sweep points. dsh-loop /
whale-girl / dsh-task-status / plugin-registry all hit the same rename on 0812
(four repositories, one root cause — the cards' field note).

- **Environment**: `node:24-bookworm` + git (the fixture is committed as a git baseline so changes can be detected) + global dsh 0.1.2-alpha.2 (the judge does a real cold boot inside the container; no docker exec needed).
- **Verifier**: the judge checks that the fixture was changed + static sweep of the migrated Node half (webServer present 10 / jobs present 10 / httpServer swept 10 / ctx.tasks swept 10 / onTaskDone swept 10 / onJobDone present 10) + `dsh plugin add` (10) + web cold boot with no pending (10) + route smoke `GET /bench-status/status` → 200 with `{"ok":true}` (20), normalized 0-100 written to `/logs/verifier/reward.txt`.
- **Oracle**: `harbor run -p benchmark/tasks/M14-service-renames-0812 -a oracle`, expected reward 1.0.

```
environment/fixture/   # bundle plugin with pre-0812 service names (pending trap)
environment/Dockerfile # node:24-bookworm + git + global dsh 0.1.2-alpha.2
tests/                 # judge.mjs + judge-utils.mjs + test.sh
solution/              # renamed Node half + solve.sh
```