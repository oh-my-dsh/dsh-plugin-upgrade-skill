# S1 Static Touchpoint Scan — legacy-plugin (dsh 0.1.1-era → 0.1.2-alpha.2)

Scope: read-only scan of `fixture/` (package.json, README.md, cordis.patch.yml, patch.yml, scripts/apply-patch.mjs, src/index.ts). No fixture file was modified. Corridor: `dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.2` = edge A1 (rc.2→alpha.1) + edge A2 (alpha.1→alpha.2); net state computed by folding intermediates before card mapping.

## Touchpoint checkup table

| Touchpoint | Hit | File/line | Applicable card | Confidence note |
|---|---|---|---|---|
| #1 patch | Yes | patch.yml:1-8, cordis.patch.yml:1-9, scripts/apply-patch.mjs:1-13 | DSH-0.1.2-A1-03 (target path `src/session/view/SessionView.ts` invalid post-split), DSH-0.1.2-A1-04 (patch surface via `DSH_HARNESS_SOURCE_ROOT` + standalone demo/profile assumptions) | `cordis.patch.yml` itself is profile composition, not a source patch (API-08); the hit is the `patch.yml` surface + apply-patch script |
| #2 events | Yes | src/index.ts:15-22 (emit/on `session/event`, `ignorable: true`) | DSH-0.1.2-A2-01 (net state; restores marker). A1-02 is the superseded intermediate — do NOT delete the marker | Folded: alpha.1 removed the marker, alpha.2 restored retention semantics → final state retains it; public `Session.append()` still cannot write it (API-05), so this is a capability gap, not a fixable producer change |
| #3 services/Remote | Yes | src/index.ts:25-32 (`ctx.get('apiProxy')`, `apiProxy.invoke('session.rename')`, `apiProxy.invoke('llm.providers')`) | DSH-0.1.2-A1-01 (APIProxy removed → host plane must inject owning domain service directly, e.g. `llm.listProviders()`; client plane uses `ctx.remote.session.rename`/`llm/listProviders`), DSH-0.1.2-A2-02 (RemoteError/namespaced codes once migrated) | Host-plane vs client-plane face distinction per API-01; mechanical `apiProxy`→`remote` swap on host hangs |
| #4 filesystem | Yes | src/index.ts:35-38 (`join(homedir(), '.dsh', 'profiles', 'default')` + `writeFileSync`) | DSH-0.1.2-A1-04 (profiles/ACP merged; do not hardcode user dirs — use `DSH_HOME`/profile as source of truth), DSH-0.1.2-A1-13 (conditional: old workarounds obsolete), DSH-0.1.2-A1-21 (conditional: preset roots moved in-package) | Also scripts/apply-patch.mjs:6 reads `DSH_HARNESS_SOURCE_ROOT` — env-dependent, preferable to hardcoding but unvalidated |
| #5 UI/commands/tools | Yes | src/index.ts:10 (`import ... from '@deepseek-ai/dsh-session-view/internal'`), src/index.ts:41-43 (`ctx.contributes.registerCommand('legacy.openView', ...)` + `new SessionView(...)`) | DSH-0.1.2-A1-03 (session view internals split; internal import + patch target both break), DSH-0.1.2-A1-25 (client runtime unbundling family; `dsh-client-runtime` removed — check inject lists), DSH-0.1.2-A1-26 (registerCommand/bundle id must equal package name) | Internal-path import is the concrete hit; `registerCommand` itself survives only via public seams |
| #6 custom channel | Yes | src/index.ts:47-54 (`createServer`, `server.listen(43121, '127.0.0.1')`, `/api/legacy`) | DSH-0.1.2-A1-08 (process-scoped bootstrap token + signed-cookie model; custom routes bypass the auth gate unless wired via `ctx.connection.requestRejection` / Connection carrier) | Loopback-only is not exempt; dead code (`void startLegacyBridge`, never invoked) but statically present |
| #7 subprocess/output | Yes | src/index.ts:56-67 (`spawn('dsh', ['--profile','headless', prompt])`, `JSON.parse(line)` on stdout), scripts/apply-patch.mjs:15-22 (`execFileSync('dsh', ...)`, line-wise `JSON.parse`) | DSH-0.1.2-A1-05 (headless stdout is the final assistant text, never JSONL; stderr carries `dsh: reasoning:`; exit code authoritative), API-06 (argv/invocation contract: `dsh --profile headless "task"`; no JSONL contract), DSH-0.1.2-A2-04 (conditional: Node 24.0–24.11.1 empty-graph fix; remove major-version workarounds only), DSH-0.1.2-A1-04 (merged ACP/SDK bins/profiles removed) | Treating stdout as JSONL and "stderr non-empty = failure" are both wrong at target |

## Corridor folding note (#2)

`SessionEvent.ignorable` was removed in `0.1.2-alpha.1` (DSH-0.1.2-A1-02) and restored in `0.1.2-alpha.2` (DSH-0.1.2-A2-01). Final net state for target `0.1.2-alpha.2`: the marker is retained on the event envelope/persistence, so the fixture's producer (`ignorable: true`, src/index.ts:17) must **not** be stripped. The remaining problem is that alpha.2 still has no supported public write surface for the marker (API-05): ordinary third-party producers with only `Session.append()` cannot persist it and will hit `SessionFormatUnsupportedError` on cold load. Map to A2-01; do not plan any change from A1-02.

## No-hit categories

None: all seven touchpoint classes are hit in this fixture (README's own table agrees). For completeness of scan: `fixture/README.md` and `fixture/package.json` were read and contain no additional coupling (package pins `version: 0.1.1`, no `@deepseek-ai/*` deps, no `dsh.client` block); the `cordis.patch.yml` `patch:` reference was classified per API-08 rather than double-counted as a source patch. Zero-hit would not have meant zero-risk — per pre-flight, this fixture cannot be compiled/executed by design, so conclusion still requires a real mount/build on the target tag; absence of patterns would only mean "not detected by current patterns", not compatibility.

## Must verify (post-migration, out of scope for this static scan)

- Host vs Web Client face for each `apiProxy` call site (API-01); wire envelope `{args:{...}}`, slash-form endpoints, cookie/token exchange for custom/`/api` routes.
- Headless wrapper: exit-code-based success, stdout as final text, stderr as reasoning; never `JSON.parse` stdout.
- Patch surface: every `patch.yml` target path still resolvable at `0.1.2-alpha.2` (SessionView paths moved).
- `~/.dsh/profiles/default` writes replaced by runtime `DSH_HOME`/profile seams; no JSONL assumption in any wrapper.
