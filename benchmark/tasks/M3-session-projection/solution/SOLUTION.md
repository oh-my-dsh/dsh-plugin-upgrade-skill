# M3-session-projection reference solution

## Reference files

See [solution/profile/](profile/) — the fix adds `@deepseek-ai/dsh-base` to the
bundles (base ships `session-projection` and the todo tool) and drops the
synthetic todo row (keeping it would duplicate the `todo_write` registration).
Expected judge score 100.

## What it tests (one line)

DSH-0.1.2-A2-08: a missing inject service is a runtime pending, not a typecheck
error — fix the composition, never edit the shipped package.
