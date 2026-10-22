# S2 Negative Scan Report — @demo/dsh-minimal-llm

- Plugin: `@demo/dsh-minimal-llm` v0.1.0 (static copy, `type: module`, entry `index.js`)
- Corridor assumed: current rc.2-style source (`0.1.1-rc.2` API surface) → target `dsh 0.1.2-alpha.2` (edges: rc.2→alpha.1, alpha.1→alpha.2)
- Scan scope: all files under `fixture/` (`index.js`, `src/session-notes.js`, `package.json`, `cordis.patch.yml`, `README.md`), plus read-only `plan-migration.mjs` run (`--from dsh-v0.1.1-rc.2 --to dsh-v0.1.2-alpha.2`). Fixture left unmodified.

## 1. Touchpoint checkup (seven classes)

| Touchpoint | Hit | File/line | Applicable card | Confidence note |
|---|---:|---|---|---|
| #1 source patch / monkey patch | No hit | — | `DSH-0.1.2-A1-03` (none needed) | `cordis.patch.yml` exists but is profile composition (API-08), not a source patch; no `patchedDependencies`/`patch-package`/`DSH_HARNESS_SOURCE_ROOT`/monkey-patch markers. Filename containing "patch" is not a hit. |
| #2 internal event names / persistent events | No hit | — | `A1-02`, `A1-06`, `A2-01` — not applicable | No `SessionEvent`, `ctx.on(`, `subscribe(`, `session/event`, `connection/reset`, `tools-code-mode` in any file. |
| #3 internal service probes / Remote | **HIT** | `index.js:3` (`export const inject = ["apiProxy"]`), `index.js:9` (`ctx.apiProxy.llm.providers()`), `package.json:17` (`"@deepseek-ai/dsh-host-apiproxy": "0.0.1-rc.1"`) | `DSH-0.1.2-A1-01` (primary); `DSH-0.1.2-A2-02` (when migrated to `@Remote`); `DSH-0.1.2-A2-03`/`A1-24` (dependency graph) | Confirmed by planner (1 hit at index.js:2, pattern 1). `apiProxy` is the rc.2 host-plane service; alpha.1 deletes the package and surface. |
| #4 direct host directory reads/writes | No hit | — | `A1-04`, `A1-13`, `A1-21` — not applicable | No `DSH_HOME`, `.dsh`, `profiles/`, `homedir(`, `readFile/writeFile/mkdir/openPath`. |
| #5 internal UI / commands / tool registration | No hit | — | `A1-03`, `A1-09/10/11`, `A1-26`, `A1-28`, `A1-29` — not applicable | No `registerCommand/registerView/contributes/ctx.tools/commands.execute`, no `dsh-client-runtime`, `ctx.slots`, `useSession`, `useChat`, `__ModuleLoader__`, `PLUGIN_ID`. |
| #6 custom HTTP / WS / RPC / DOM / CSS channels | No hit | — | `A1-08`, `A1-28` — not applicable | No `createServer(`, `WebSocket`, `MutationObserver`, `insertRule`, `127.0.0.1/localhost`, `/api/`, `contenteditable`. |
| #7 subprocess / stdout / stderr parsing | No hit | — | `A1-04/05`, `A1-06`, `A1-13`, `A2-04` — not applicable | No `node:child_process`, `spawn(`, `execSync`, `execa`, `Bun.spawn`, `headless`, `--profile`. |

Red-herring note: `src/session-notes.js` contains only pure string/array utilities; the word "session" in the filename triggers no event/persistence/Remote patterns. Zero hits there is genuine.

## 2. Hit → card mapping

- **#3 → `DSH-0.1.2-A1-01`** (breaking, required-if-hit): the old `APIProxy` surface is removed in alpha.1. Specifically:
  - `inject: ["apiProxy"]` — the `apiProxy` service key no longer exists on alpha.1+; the entry will stall at `pending (waiting for service: apiProxy)` at mount.
  - `ctx.apiProxy.llm.providers()` — the rc.2 dot-domain APIProxy call is gone; `llm.providers` maps to `llm/listProviders` + `llm/listConfigurableProviders`.
  - `@deepseek-ai/dsh-host-apiproxy` dependency is a package deleted in alpha.1 (no `APIProxy` identifier); per the card's field note, the host-plane migration must inject the domain service directly (e.g. `inject: ["llm"]`, `ctx.llm.listProviders()`), **not** `inject: ["remote"]` (which is the client-plane facade — a common mistake that yields `pending (waiting for service: remote)`).
- Secondary, once the plugin is migrated to Remote/`RemoteResult` shapes: `DSH-0.1.2-A2-02` (error shape/code namespaces). Packaging: `DSH-0.1.2-A2-03` / `A1-24` require re-checking the dependency graph after the `dsh-host-apiproxy` line is dropped.
- All other planner-suggested cards (`A1-06/07/11/14/20/21/22/25/27/30/31/32`, `A2-05/06/08/10`, etc.) trace back to generic Remote/Service pattern matches, not to actual identifiers in this source; card-by-card review confirms the plugin intersects only `A1-01` (+ `A2-02` after migration, + packaging cards).

## 3. Does "zero hits in seven categories" prove 0.1.2 compatibility?

**No.** Judgment and basis:

1. This plugin is itself the counterexample: six of seven categories are zero-hit, yet the single #3 hit maps to a breaking card (`A1-01`) that renders the plugin non-functional on 0.1.2-alpha.2 (pending service at mount; deleted package; removed `llm.providers` call). A hasty "mostly zero-hit ⇒ roughly compatible" conclusion would miss exactly this.
2. Zero hits is a statement about the *current pattern set*, not about the API surface: the scan only detects identifiers listed in `pre-flight-patterns.json`. Renamed or rarely-used seams, transitive behavior of injected services, and cross-version wire contracts can slip through. The pre-flight doc itself states this ("not proof of compatibility … zero hits still require checking dependencies/imports and running build plus a real mount").
3. The heuristic planner only narrows candidates; the fixture still needed a card-by-card fold over the full rc.2→alpha.1→alpha.2 corridor (net state: APIProxy still absent at alpha.2, `RemoteError` vocabulary now in force via `A2-02`).
4. Dependencies/configuration must be checked separately (here: the pinned `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1` dependency is a hard blocker regardless of code-pattern hits).

What else is needed before concluding compatibility (mandatory verification, not executed in this task since the source is a static copy):
- migrate per `DSH-0.1.2-A1-01` first (host-plane: inject the domain `llm` service; do not switch to `remote`); drop the deleted `dsh-host-apiproxy` dependency; adopt `RemoteResult` error handling per `A2-02` where applicable;
- build/typecheck (per-alpha2 precision checklist, with `skipLibCheck: false` diagnostic pass for declaration drift);
- isolated-profile cold boot (`verify-runtime.mjs` layer), confirming no `pending (waiting for service: …)` rows and entry activation;
- one functional smoke test of the plugin's core path (e.g. `llm.listProviders()` call through the injected domain service);
- then re-run the seven-class scan to confirm the hit is closed.

## Pending / limitation

- No external documentation was consulted (per task rules); corridor reasoning is limited to the in-skill reference cards.
- `dsh` is not installed in this environment, so dependency resolution, cold boot, and functional tests were declared as required next steps rather than executed.
- The assumed `from` tag is inferred from the rc.2-style code (`apiProxy`, dot-domain calls) and the 0.0.1-rc.1 dependency pin; if the plugin's actual baseline differs, re-pin `--from` and re-run the planner.
