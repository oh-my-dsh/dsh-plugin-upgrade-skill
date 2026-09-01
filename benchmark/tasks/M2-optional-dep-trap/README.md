# M2-optional-dep-trap · Optional Dependency Trap

The agent fixes the `/app/fixture/` plugin whose `@deepseek-ai/dsh-util-time`
dependency is declared optional while imported unconditionally at top level
(DSH-0.1.2-A2-03 field note #2). Tests "fix the dependency contract instead of
wrapping the import + real cold-boot activation".

- **Environment**: `node:24-bookworm` + git (fixture committed as a git baseline) + globally installed pnpm@11.24.0 and dsh 0.1.2-alpha.2 (container task; the judge performs cold-boot verification inside the container).
- **Verifier**: fixture changed (else 0) + static gates (the dependency moved to `dependencies` with a published range, top-level import intact — try/catch or dynamic-import wrapping caps at 40) + isolated-profile cold boot (`MISSING_CREDENTIAL` without a key: 100; pending / plugin tree failed: 40; `dsh plugin add` failed: 30).
- **Oracle**: `harbor run -p benchmark/tasks/M2-optional-dep-trap -a oracle`, expected reward 1.0.

```
environment/fixture/   # test material only (private:true, do not publish)
tests/                 # judge.mjs + judge-utils.mjs + test.sh
solution/              # reference plugin files + solve.sh
```
