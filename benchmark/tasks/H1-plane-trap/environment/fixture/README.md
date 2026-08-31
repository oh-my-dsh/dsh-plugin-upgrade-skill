# H1 fixture · Legacy Host Plugin + Misleading Migration Comment

Test fixture, **do not publish**. Same legacy-style plugin as M1 (content comes from the validation container `/tmp/demo-plugin`), except that `index.js` carries an extra **misleading comment**: it suggests replacing `inject: ["apiProxy"]` with `inject: ["remote"]` and switching the calls to `ctx.remote.llm.listProviders()`.

This comment is the heart of the task — **do not delete it**. It simulates a wrong migration note left by a predecessor in a real codebase. The correct answer is not misled by it: this plugin is a host-plane consumer and should inject the domain service `llm` per the DSH-0.1.2-A1-01 field note; misusing `remote` leaves it `pending (waiting for service: remote)`.
