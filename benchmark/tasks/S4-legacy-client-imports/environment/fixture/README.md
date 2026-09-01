# S4 fixture · Legacy client runtime touchpoints (S4-specific copy)

A Web Client plugin source from the dsh 0.1.1-rc.2 era with four touchpoints that break on dsh 0.1.2-alpha.2. **Test material only — do not execute or publish** (`"private": true`).

- This task's grading requires the fixture to be unchanged relative to git HEAD; modifying/adding/deleting any file scores 0.
- Touchpoint hints (maintainer reference, not part of the brief): the `@deepseek-ai/dsh-client-runtime/client` package removal (DSH-0.1.2-A1-25), `__ModuleLoader__.load` registration id ≠ package.json name (DSH-0.1.2-A1-26), the flat `useSession()` `nodes` snapshot (DSH-0.1.2-A1-27), and the removed `ctx.connection.api` face (DSH-0.1.2-A1-30).
