# H1 Reference Solution

## Reference Changes

See [solution/plugin/](plugin/) (same approach as the M1 reference solution: host-plane direct connection to the domain service, `inject: ["llm"]` + `ctx.llm.listProviders()`, and removal of the dead dependency); expected judge score 100.
Note that the reference solution may **keep or delete the misleading comment** — the judge only looks at which plane the final inject belongs to.

## Core Point (In One Sentence)

The "switch to `inject: ["remote"]` and you are done" comment in the source is a trap: apiProxy is a host-plane facade and `remote` is a client-plane facade, and the two do not live in the same runtime. A host-plane plugin that injects remote instead ends up `pending (waiting for service: remote)` (DSH-0.1.2-A1-01 field note, section 4 of the validation report). The agent must determine the runtime plane first and then pick the target injection name, instead of copying the comment.

## Negative-Test Anchor

If the agent follows the comment and switches to `inject: ["remote"]`: the container cold boot is guaranteed to end up `pending (waiting for service: remote)` → the 40-point tier, then capped to **20** by the static gate.
