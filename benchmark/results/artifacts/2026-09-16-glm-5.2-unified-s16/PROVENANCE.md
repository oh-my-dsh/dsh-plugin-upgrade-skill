# PROVENANCE — unified GLM-5.2 two-arm run (16 tasks × 2 arms × 2 repeats)

Status: **kit frozen, solver runs not started.** Derived from the completed
[2026-09-15-glm-5.3-flash-unified-s16 kit](../2026-09-15-glm-5.3-flash-unified-s16/PROVENANCE.md): the 16-task selection, interleaving
schedule and execution order are byte-identical (workplan §5 requires the same
task pool across configurations); only the solver model differs.

- Source kit commit: see [2026-09-15-glm-5.3-flash-unified-s16/PROVENANCE.md](../2026-09-15-glm-5.3-flash-unified-s16/PROVENANCE.md)
- Solver model: **GLM-5.2** — endpoint/credential NOT available on the kit
  author's machine; the operator launching trials must record the served-model
  identity per workplan §5 before running
- Judge: same sealed report-judge-v2 pipeline as the 2026-09-15-glm-5.3-flash-unified-s16 run
  (GLM-5.3-Flash subagent judge, arm-blind) for cross-config judge consistency
- Trials: 64 = 16 tasks × 2 arms × 2 reps, ABBA job interleave (see schedule.json)

## To be recorded at run time

| Field | Value |
|---|---|
| Solver endpoint / provider | _(fill at launch)_ |
| Server-side model identifier | _(fill at launch — workplan: cannot trust alias alone)_ |
| Weights revision / quantization | _(fill at launch)_ |
| Per-cell tokens, wall time, stop reason | _(fill after run)_ |

## Execution

Follow [the unified run book](../../../docs/unified-glm53flash-run.zh.md) with
this directory in place of the flash run dir. Reports go to
reports/<arm>/r<repeat>/<task>/report.md, then:

    node benchmark/scripts/collect-unified-run-cells.mjs   # adapt RUN_DIR constants per run
    node benchmark/scripts/analyze-unified-paired.mjs      # adapt RUN_DIR constants per run
