# H7-locale-trap · Locale Trap

The agent fixes the `/app/fixture/` web plugin whose browser half anchors the
host UI by display text (rollup R-13). Tests "stable data-slot anchor + render
assertion + real web cold-boot recognition in the browser roster".

- **Environment**: `node:24-bookworm` + git (fixture committed as a git baseline) + globally installed pnpm@11.24.0 and dsh 0.1.2-alpha.2 (container task; the judge performs web cold-boot verification inside the container).
- **Verifier**: fixture changed (else 0) + static gates (data-slot anchor without the display-text regex: 30; explicit render assertion: 10) + `dsh plugin add` succeeded (10) + host half no pending (10) + `__DSH_BOOT__.entries` actually contains this plugin (40). A multi-language regex without a stable anchor and assertion caps at 40 (the trap). Boundary (same as H3): there is no browser in the container, so client.js runtime behavior is not graded — only the host-announced boot graph entry is judged.
- **Oracle**: `harbor run -p benchmark/tasks/H7-locale-trap -a oracle`, expected reward 1.0.

```
environment/fixture/   # test material only (private:true, do not publish)
tests/                 # judge.mjs + judge-utils.mjs + test.sh
solution/              # reference plugin files + solve.sh
```
