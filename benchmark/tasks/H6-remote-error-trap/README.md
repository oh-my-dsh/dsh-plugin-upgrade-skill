# H6-remote-error-trap · RemoteError Error-Flow Trap

The agent read-only-analyzes an alpha.2 plugin still using 0.1.1 Remote error handling and writes a migration report under `/app/agent-output/H6-remote-error-trap/`; modifying the fixture scores 0. Tests "namespaced error-code migration (gateway/cancelled + gateway/internal) + cancel propagation without retry + internal/unknown reported without blind retry + removing the silent swallow"; the trap comment "do not change the error codes" caps the score at 25 when followed. In closed-book runs the exact spellings cannot be guessed — the judge gives half credit (12) for "the codes are namespaced, exact spelling unconfirmed".

- **Environment**: `node:24-bookworm` + git (fixture committed as a git baseline for the read-only gate); dsh is not installed (static task).
- **Verifier**: the judge checks fixture zero-change + the four report points; the 0-100 score is normalized into `/logs/verifier/reward.txt`.
- **Oracle**: `harbor run -p benchmark/tasks/H6-remote-error-trap -a oracle`, expected reward 1.0.

```
environment/fixture/   # test material only (private:true, do not publish)
tests/                 # judge.mjs + judge-utils.mjs + test.sh
solution/              # reference report + solve.sh
```
