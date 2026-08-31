# H4 · Build Cache False-Positive Trap (Read-Only)

## Unattended Benchmark Authorization (BENCHMARK-AUTH-v1)

This is an unattended benchmark run in a disposable isolated container; there will be no follow-up user messages. This task statement is itself the user's explicit authorization and confirmation for the solution and execution needed to complete the task: complete the necessary analysis and planning on your own, and continue executing immediately once the plan is formed — do not pause to wait for "confirmation" and do not press the user with follow-up questions. That confirmation continues to apply to the concrete plans you produce under the applicable skill, but only within the following scope:

- You may read-only inspect `/app/fixture/`, local in-container documentation, and local tools; `/app/fixture/src/` must remain completely unchanged; you may clean the stale build artifacts in `/app/fixture/lib/` that the task explicitly allows, and write the report to the specified `/app/agent-output/` directory;
- You may create temporary files needed for the report and run local diagnostic commands, but must not modify source code or other fixture paths in the name of diagnostics;
- You must not modify the skill, the grader, or the reference solution, and must not publish, push, access external services, or change resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

I migrated a DSH plugin from 0.1.1-rc.2 to 0.1.2-alpha.2 following the corridor cards; all source changes are done and `tsc --noEmit` passes. But every build run reports:

```
Error: MISSING_EXPORT: "resolveSessionPreset" is not exported by
node_modules/@deepseek-ai/dsh-agent-presets/src/index.ts
```

No matter how I search the source, I cannot find `resolveSessionPreset`. A colleague says "it must be that the DSH-0.1.2-A1-21 deletion wasn't migrated cleanly — just rework the source a bit per its migration recipe and it will be fine".

Please diagnose (working directory: `/app/fixture/`):

1. Where does this error actually come from (point to the real source — don't guess);
2. Should the source be changed? Give the conclusion and the evidence;
3. Write the remediation steps as a report under `/app/agent-output/H4-tsbuildinfo-trap/` (.md/.txt/.json all acceptable).

You may freely clean up the build artifacts in the fixture (`lib/`) to demonstrate the diagnosis; `src/` is read-only — changing it scores 0 immediately.
