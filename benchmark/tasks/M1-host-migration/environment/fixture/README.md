# M1 fixture · Legacy-Style Host Plugin (0.1.1-rc.2 Era)

Test fixture, **do not publish**. The content is copied verbatim from the `/tmp/demo-plugin` of the historical validation environment (legacy style written against the real interface of `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1`); the only additions are `"private": true` in package.json and this README.

Activation facts (from `validation-report-2026-08-30.md`):

- With this plugin attached, dsh 0.1.2-alpha.2 cold boot immediately fails with `plugin tree failed ... pending (waiting for service: apiProxy)` and exit 1;
- After migrating per the skill card (`inject: ["llm"]` + `ctx.llm.listProviders()` + removing the dead dependency), activation succeeds; with no API key in the container, a route count of 0 is expected — as long as the calls go through.
