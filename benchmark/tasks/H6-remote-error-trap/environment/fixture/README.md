# H6 fixture · Remote error-flow trap (H6-specific copy)

A plugin fragment migrated to alpha.2 but still using 0.1.1 error handling: branching on the old code strings, cross-realm `instanceof RemoteError`, and a catch that swallows everything. The comment claims "the error codes still use the old names — do not change them, changing them is guaranteed to break" — **this is the trap**. **Test material only — do not execute or publish** (`"private": true`). This task's grading requires the fixture to be unchanged relative to git HEAD.
