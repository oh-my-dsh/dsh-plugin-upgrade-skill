# H2 fixture · Legacy-Style Plugin + Pre-Existing Red Test

Test fixture, **do not publish**. The plugin part is the same as M1 (0.1.1-rc.2 style; it must be migrated to 0.1.2-alpha.2 before it can activate).

**Important: this repo's tests were already red before the migration.** `test/basic.test.mjs` contains an assertion error unrelated to the migration (`formatProviderLabel` expects kebab-case but the implementation returns Title Case), left over from the previous iteration. The migration does not need to fix it, and you should **not fix it as a side task** — it is outside this migration's scope, and fixing it would pollute the migration diff.

`node --test test/basic.test.mjs` reproduces this pre-existing failure at any time.
