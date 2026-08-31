# M1 Reference Solution

## Reference Changes

See [solution/plugin/](plugin/) (copied verbatim from the container's `/tmp/demo-plugin-v2-migrated`, verified to activate successfully in the 2026-08-30 container validation); expected judge score 100:

1. `index.js`: `inject: ["apiProxy"]` → `inject: ["llm"]`;
   `await ctx.apiProxy.llm.providers()` → `ctx.llm.listProviders()`;
2. `package.json`: remove the dead dependency `@deepseek-ai/dsh-host-apiproxy` (removed as of alpha.1).

## Core Point (In One Sentence)

DSH-0.1.2-A1-01's **host-plane** migration: apiProxy is the host-plane gateway facade; after it was removed, host-plane consumers inject the underlying domain service directly (`llm` → `ctx.llm.listProviders()`) instead of switching to `remote`. In verification, no API key → a route count of 0 is expected; as long as the calls go through, the plugin activates and scores.

## Boundaries

- The judge decides by headless-profile cold boot: with no key, the MISSING_CREDENTIAL output proves the plugin tree activated; this matches the validation report's attribution principle (configuration issues do not count as plugin failures).
- If the agent mistakenly migrates the host plane to `inject: ["remote"]`, it lands in the 40-point tier (`pending (waiting for service: remote)`) — that shape is H1's core point; M1 only requires final activation.
