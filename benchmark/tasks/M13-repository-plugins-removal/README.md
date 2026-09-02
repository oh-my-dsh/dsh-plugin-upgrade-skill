# M13-repository-plugins-removal · Repository-Plugins Removal (External Plugins Become npm Packages)

The agent migrates the old 0.1.1-era **repository-plugin** in `/app/fixture/` to
0.1.2-alpha.2: the `.dsh-plugin/` folder with `dsh.entry`, the `/pet/ui.js` route and
the `httpServer.tapIndex` page-script injection are replaced by a bundle npm package
(root `dsh.bundle` + `dsh.client` + `exports`, cordis.patch.yml insert row) installed
through `dsh plugin --profile web add`. Tests the DSH-0.1.1-R1-01 migration recipe
against the real removal of the repository-plugins mechanism. Task statement in
[instruction.md](instruction.md), grading logic in [tests/judge.mjs](tests/judge.mjs).

**The subtle trap**: the alpha host's client-modules locates a package's manifest by
walking *up* from the Node entry to the nearest `package.json`. The migrated Node half
stays inside `.dsh-plugin/`, so keeping the legacy `.dsh-plugin/package.json` (which
lacks `dsh.client`) shadows the root manifest: the plugin installs and the host half
activates, but the browser half is silently absent from `__DSH_BOOT__.entries` — the
R1-01 "drop legacy artifacts" step is not optional. The oracle drops that file (see
[solution/solve.sh](solution/solve.sh)).

- **Environment**: `node:24-bookworm` + git (the fixture is committed as a git baseline so changes can be detected) + global dsh 0.1.2-alpha.2 (the judge does a real cold boot inside the container; no docker exec needed).
- **Verifier**: the judge checks that the fixture was changed + static manifest (dsh.bundle 15 / exports client 10 / dsh.client 10 / Node entry 5 / patch insert row 10) + legacy loading path removed (10) + `dsh plugin add` (10) + web cold boot with no pending (10) + `__DSH_BOOT__.entries` contains this plugin's client (20), normalized 0-100 written to `/logs/verifier/reward.txt`.
- **Oracle**: `harbor run -p benchmark/tasks/M13-repository-plugins-removal -a oracle`, expected reward 1.0.

```
environment/fixture/   # legacy repository-plugin (dsh.entry + tapIndex self-executing client trap)
environment/Dockerfile # node:24-bookworm + git + global dsh 0.1.2-alpha.2
tests/                 # judge.mjs + judge-utils.mjs + test.sh
solution/              # reference bundle files + solve.sh
```