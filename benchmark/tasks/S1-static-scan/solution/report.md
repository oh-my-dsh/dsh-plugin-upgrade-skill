# Touchpoint inspection (legacy-plugin, dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.2)

Scan scope: all files under `benchmark/tasks/S1-static-scan/fixture/` (README excluded; no node_modules/vendor to exclude). This report is the product of a read-only scan; no fixture file was modified.

| Touchpoint | Hit | File/Line | Card | Notes |
|---|---|---|---|---|
| #1 patch | ✅ | patch.yml:1; cordis.patch.yml:2; scripts/apply-patch.mjs | DSH-0.1.2-A1-03 | patches the host session-view project source; alpha.1 split the session-view project heavily, so the patch target path breaks |
| #2 events | ✅ | src/index.ts:15-22 | DSH-0.1.2-A1-02 + DSH-0.1.2-A2-01 | producer writes third-party durable events with `ignorable: true`. Corridor folding: A1-02 removes the marker in alpha.1, A2-01 restores the keep semantics in alpha.2 — the target is alpha.2, net state = **keep the producer and the marker**, do not delete first and restore later |
| #3 service/Remote | ✅ | src/index.ts:25-32 | DSH-0.1.2-A1-01 | `ctx.get('apiProxy')` calls `session.rename` and `llm.providers`; apiProxy is removed entirely in alpha.1, host-plane consumers switch to injected domain services (`llm` → `ctx.llm.listProviders()`), only the client plane uses `ctx.remote.*` |
| #4 host filesystem | ✅ | src/index.ts:35-38 | DSH-0.1.2-A1-04 | hard-coded `~/.dsh/profiles/default`; from alpha.1 the profile layout follows `$DSH_HOME/profiles` and the runtime |
| #5 UI/commands/tools | ✅ | src/index.ts:10, 41-43 | DSH-0.1.2-A1-03 | imports `SessionView` from an internal session-view path + `contributes.registerCommand`, breaks with the session-view split; should move to the public facets |
| #6 custom channel | ✅ | src/index.ts:47-54 | DSH-0.1.2-A1-08 | loopback HTTP `127.0.0.1:43121/api/legacy` bypasses the Host Gateway authentication model; from alpha.1 Web/API channels use bootstrap token + signed Cookie, custom routes must hook into the connection auth gate |
| #7 subprocess/output | ✅ | src/index.ts:57-67; scripts/apply-patch.mjs | DSH-0.1.2-A1-04, DSH-0.1.2-A1-05 | spawns `dsh --profile headless` and treats stdout as JSONL `JSON.parse` — since rc.2 stdout is final text and never JSONL; defaulting stdout to JSON.parse is a wrong assumption. Also check the headless profile layout per A1-04 |

No-hit notes: all seven categories hit; there is no no-hit category. Still, this scan only covers coupling discoverable by static regex/reading, and it does not prove the dependency graph and config surface are risk-free — before migrating you must still check the package.json dependencies and the profile composition, and verify on a real mount of the target version.

Must verify: build/typecheck, a real cold boot of an isolated profile (no `pending (waiting for service: ...)`), and at least one core functional path.
