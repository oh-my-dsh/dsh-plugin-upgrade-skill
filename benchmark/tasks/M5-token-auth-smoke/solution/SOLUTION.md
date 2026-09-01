# M5 Reference Solution

## Reference Changes

See [solution/plugin/](plugin/) (expected judge score 100):

1. `index.js`: `inject: ["webServer"]` → `inject: ["connection"]`, and the raw
   `ctx.webServer.register({ kind: 'prefix', path: '/ping', ... })` route →
   `ctx.connection.rpc.handle('/ping', handler)` returning
   `{ ok: true, value: { pong: true } }`;
2. `package.json`: bump 0.1.0 → 0.2.0, description reflects the fixed state.

## Core Point (In One Sentence)

DSH-0.1.2-A1-08 · Web/API channels use process-scoped bootstrap tokens and signed cookies: connection-registered channels are covered automatically (401 without the Cookie),
while raw `webServer.register` routes sit outside the gate — so the fix is to move the
channel's registration to `ctx.connection.rpc.handle()`, not to hand-roll a check
inside the route.

## Boundaries

- The judge replays the two requests itself in a clean profile; the agent's own
  smoke.md is only recorded as a reason, never scored.
- The channel root `/ping` alone is not a dispatch target — connection channels
  dispatch under `/ping/<endpoint>` with the envelope method equal to the
  endpoint, so the smoke posts to `/ping/ping` (method `ping`).
- A hand-rolled check inside a raw route (which also answers 401/200) is capped
  at 60 by the static `webServer.register` gate: it bypasses the host's unified
  auth instead of joining it.
