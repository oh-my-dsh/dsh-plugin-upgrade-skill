# S6-corridor-net-state · Corridor Net-State Folding

The agent read-only-analyzes the alpha.1-era defense code that deletes `SessionEvent.ignorable` and writes a migration report under `/app/agent-output/S6-corridor-net-state/`; modifying the fixture scores 0. Tests "the DSH-0.1.2-A1-02 ↔ DSH-0.1.2-A2-01 remove-then-restore net-state judgment: delete the defense code + correct producer semantics (only informational events carry `ignorable: true`) + the public `Session.append` capability gap (no cast)". The trap comment "keep the defense" caps the score at 10 when followed.

- **Environment**: `node:24-bookworm` + git (fixture committed as a git baseline for the read-only gate); dsh is not installed (static task).
- **Verifier**: the judge checks fixture zero-change + the four report points; the 0-100 score is normalized into `/logs/verifier/reward.txt`.
- **Oracle**: `harbor run -p benchmark/tasks/S6-corridor-net-state -a oracle`, expected reward 1.0.

```
environment/fixture/   # test material only (private:true, do not publish)
tests/                 # judge.mjs + judge-utils.mjs + test.sh
solution/              # reference report + solve.sh
```
