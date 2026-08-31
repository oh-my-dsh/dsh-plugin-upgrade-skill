# S2 Reference Solution

## Reference report

See [solution/report.md](report.md), expected judge score 100.

## Point under test (in one sentence)

pre-flight's negative checklist: heuristic scanning is not a compatibility proof. The plugin hits only #3 (apiProxy → DSH-0.1.2-A1-01); the other six categories have zero hits; the agent must make clear that "zero hits ≠ compatible" — it still has to check dependencies/config card by card against the corridor, and verify on a real mount of the target version (build/typecheck, cold boot, functional smoke test), instead of concluding "should be fine" right after scanning.
