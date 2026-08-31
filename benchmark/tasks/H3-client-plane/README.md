# H3-client-plane · Client Plane (Installs and Activates, and Must Be Listed in the Browser Roster)

The agent migrates the old dsh 0.1.1 browser plugin in `/app/fixture/` to 0.1.2-alpha.2:
the top-level `client` legacy convention in `package.json` moves into the `dsh.client`
declaration (platform=web), and `client.js` is updated per DSH-0.1.2-A2-02 for the
`RemoteResult` branch. Tests the "dsh.client plane contract + real recognition in the
browser roster (`__DSH_BOOT__.entries`) + silent-failure trap". Task statement in
[instruction.md](instruction.md), grading logic in [tests/judge.mjs](tests/judge.mjs).

- **Environment**: `node:24-bookworm` + git (the fixture is committed as a git baseline so changes can be detected) + global dsh 0.1.2-alpha.2 (the judge does a real cold boot inside the container; no docker exec needed).
- **Verifier**: the judge checks that the fixture was changed + the static `dsh.client` declaration (40) + `dsh plugin add` (10) + web cold boot with no pending (10) + `__DSH_BOOT__.entries` contains this plugin (40), normalized 0-100 written to `/logs/verifier/reward.txt`.
- **Oracle**: `harbor run -p benchmark/tasks/H3-client-plane -a oracle`, expected reward 1.0.

```
environment/fixture/   # legacy plugin source (missing dsh.client declaration trap)
environment/Dockerfile # node:24-bookworm + git + global dsh 0.1.2-alpha.2
tests/                 # judge.mjs + judge-utils.mjs + test.sh
solution/              # reference plugin files + solve.sh
```
