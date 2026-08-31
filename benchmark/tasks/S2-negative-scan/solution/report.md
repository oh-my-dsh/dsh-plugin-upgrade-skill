# Touchpoint inspection (dsh-minimal-llm, dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.2)

Scan scope: all files under `/app/fixture/` (package.json, index.js, cordis.patch.yml, src/session-notes.js), read-only, no file modified.

| Touchpoint | Hit | File/Line | Card | Notes |
|---|---|---|---|---|
| #1 patch | ❌ | — | — | no patch file/declaration |
| #2 events | ❌ | — | — | no SessionEvent/ctx.on |
| #3 service/Remote | ✅ | index.js:3, 8 | DSH-0.1.2-A1-01 | `inject: ["apiProxy"]` + `ctx.apiProxy.llm.providers()`; apiProxy removed entirely in alpha.1, must migrate (host plane injects `llm` and uses `ctx.llm.listProviders()`; only the client plane uses `ctx.remote.*`) |
| #4 host filesystem | ❌ | — | — | no homedir/.dsh reads/writes |
| #5 UI/commands/tools | ❌ | — | — | no registerCommand/contributes |
| #6 custom channel | ❌ | — | — | no createServer/WebSocket |
| #7 subprocess/output | ❌ | — | — | no spawn/stdout parsing |

`src/session-notes.js` zero hits: pure string/array utility functions; "session" in the filename is only historical naming, not host coupling.

## Conclusion: zero hits ≠ compatible

- The single #3 hit is already the decisive break (DSH-0.1.2-A1-01): without migration the plugin goes `pending (waiting for service: apiProxy)` and never starts on 0.1.2.
- Zero hits in the other six categories **only mean "not found in the current patterns"**, not proof of no host coupling: this scan did not cover dependency-graph resolution (package.json still depends on `@deepseek-ai/dsh-host-apiproxy`, which was deleted with alpha.1), and it cannot replace real execution.
- Mandatory verification: after migration, remove the dead dependency, build/typecheck, do a real cold boot in an isolated 0.1.2-alpha.2 profile to confirm no pending, and run through one `llm.listProviders()` call.
