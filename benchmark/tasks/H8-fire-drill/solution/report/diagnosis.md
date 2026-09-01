# H8 Fire Drill — Diagnosis

- `drill-host`: host-plane plugin still on the 0.1.1-rc.2 API. `inject: ["apiProxy"]`
  no longer resolves on 0.1.2-alpha.2, and the dependency
  `@deepseek-ai/dsh-host-apiproxy` was removed from the SDK. Fix per
  DSH-0.1.2-A1-01 · APIProxy removed, Host/Web Client calls moved to `@Remote`:
  inject the `llm` domain service and call `ctx.llm.listProviders()`. The comment
  suggesting `inject: ["remote"]` is the wrong plane for the host half — that shape
  hangs in `pending (waiting for service: remote)`.
- `drill-web`: the `/ping` channel is registered through the raw `webServer.register`
  route, which sits outside the host's unified authentication. Fix per
  DSH-0.1.2-A1-08 · Web/API channels use process-scoped bootstrap tokens and signed
  cookies: register through `ctx.connection.rpc.handle('/ping', …)`; the "caller
  brings its own check" comment is wrong.
- `drill-tools`: `dependencies` pins `@deepseek-ai/dsh-tools` to `^0.1.2-alpha.1`, a
  cohort never published to npm (R-01 · Target cohort dependency packages not fully
  published to npm); the caret silently resolves it to a published `0.1.2-alpha.*`.
  Fix: pin the published version exactly and keep the lockfile in sync.
