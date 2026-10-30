# S4 · Legacy Client Runtime Touchpoints — Migration Touchpoint Report

**Subject plugin (read-only fixture):** `dsh-pet-session-bench` v0.1.0 — Web Client plugin (`"dsh": { "client": { "platform": "web" } }`), written in the dsh 0.1.1-rc.2 era.
**Migration target:** dsh 0.1.2-alpha.2
**Scan scope:** `fixture/` (4 files, fully enumerated: `README.md`, `package.json`, `src/client/index.ts`, `src/client/Pet.tsx`). Fixture left byte-identical; this report is the only file written.
**Card text availability (noskill arm):** full upgrade-card text is not mounted in this environment; card IDs and change statements come from the fixture-mounted maintainer reference (`fixture/README.md`). Where possible, claims were independently corroborated against the locally installed DSH runtime package (`@deepseek-ai/dsh` **0.2.1-rc.1** — note: a *later* release line than 0.1.2-alpha.2, used only as directional evidence). Anything not verifiable is explicitly marked **unconfirmed**.

---

## Touchpoint inventory (complete: 4 touchpoints, matching the fixture README's maintainer hint list)

### T1 — Removed `@deepseek-ai/dsh-client-runtime/client` import — **DSH-0.1.2-A1-25**
- **File/line:** `fixture/src/client/index.ts:1` — `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'` (the type is consumed by the `apply(ctx: ClientContext)` signature at `index.ts:9`).
- **Affected plane:** Web Client (plugin client entrypoint).
- **Break mechanism:** the `@deepseek-ai/dsh-client-runtime` package (and its `/client` subpath export) was removed in 0.1.2-alpha.2; the import specifier no longer resolves, so the plugin's client bundle fails to build/load.
- **Evidence:**
  - Card ID + removal asserted by `fixture/README.md` ("the `@deepseek-ai/dsh-client-runtime/client` package removal (DSH-0.1.2-A1-25)").
  - Corroborated locally: `@deepseek-ai/dsh-client-runtime` is **absent** from the installed runtime's `node_modules/@deepseek-ai` (0.2.1-rc.1), while the other client packages remain — consistent with a permanent removal.
- **Migration action:** delete the dependency on the removed package and import the client context type from the 0.1.2 replacement entry point mandated by card A1-25 (the exact replacement specifier is **unconfirmed** in this environment — card text not mounted). No other fixture file references this package.

### T2 — `__ModuleLoader__.load` registration id ≠ package.json `name` — **DSH-0.1.2-A1-26**
- **File/line:** `fixture/src/client/index.ts:10` — `__ModuleLoader__.load('pet-legacy-bundle', () => { /* legacy bundle id, not package name */ })`; the ambient loader declaration is at `index.ts:5`. The mismatching package identity is `fixture/package.json:2` — `"name": "dsh-pet-session-bench"`.
- **Affected plane:** plugin (client bundle registration with the Web Client module loader).
- **Break mechanism:** in 0.1.2-alpha.2 the module loader keys registrations by the plugin's package name; a hand-rolled legacy bundle id (`'pet-legacy-bundle'` ≠ `'dsh-pet-session-bench'`) no longer registers, so the plugin's client module is never loaded.
- **Evidence:**
  - Card ID + rule asserted by `fixture/README.md` ("`__ModuleLoader__.load` registration id ≠ package.json name (DSH-0.1.2-A1-26)").
  - The mismatch itself is directly verifiable in the fixture (`index.ts:10` vs `package.json:2`). The loader's new keying behavior is **not independently verifiable** here (loader internals are not part of the installed public typings) — **README-sourced, otherwise unconfirmed**.
- **Migration action:** make the registration id equal the package.json `name` (`__ModuleLoader__.load('dsh-pet-session-bench', ...)`), or drop the manual registration entirely if card A1-26's new loader auto-registers by package name (exact prescribed form **unconfirmed** — card text not mounted).

### T3 — Flat `useSession()` `nodes` snapshot — **DSH-0.1.2-A1-27**
- **File/line:** `fixture/src/client/index.ts:12` — `const { nodes } = useSession()`; consumed at `index.ts:13` — `const first = nodes[0]`. The hook is imported at `index.ts:2` — `import { useSession } from '@deepseek-ai/dsh-client-ui-chat/client'`.
- **Affected plane:** Web Client (session-state consumption in the plugin's client code).
- **Break mechanism:** in 0.1.2-alpha.2 `useSession()` no longer returns a flat `nodes` array snapshot; destructuring `nodes` and indexing `nodes[0]` yields `undefined`/type errors. The legacy import location (`dsh-client-ui-chat/client`) also no longer provides this hook shape.
- **Evidence:**
  - Card ID + change asserted by `fixture/README.md` ("the flat `useSession()` `nodes` snapshot (DSH-0.1.2-A1-27)").
  - Partially corroborated locally: in the installed runtime, `dsh-client-ui-chat`'s typings reference `useSession` only as an injected component prop of `ChatFlow`/`ChatView` (`lib/types/client/chat/ChatFlow.d.ts:3`, `ChatView.d.ts:6`) — i.e., the standalone flat-snapshot hook is no longer the public surface of that package. The exact replacement return shape (e.g., entry-based/projected session state) is **unconfirmed** — card text not mounted.
- **Migration action:** stop destructuring a flat `nodes` array; consume the session state through the selector/entry-based API that card A1-27 designates as the replacement, and update the import source accordingly (replacement API identifiers **unconfirmed** in this environment).

### T4 — Removed `ctx.connection.api` face — **DSH-0.1.2-A1-30**
- **File/line:** `fixture/src/client/index.ts:11` — `ctx.connection.api.agentPresets.list().then(...)` (inside `apply(ctx)`, `index.ts:9`).
- **Affected plane:** Web Client ↔ Host boundary (client-side connection face into a Host service).
- **Break mechanism:** the `ctx.connection.api` object was removed in 0.1.2-alpha.2; property access `ctx.connection.api` fails (type error at build, `undefined` at runtime), so the `agentPresets.list()` call cannot run.
- **Evidence:**
  - Card ID + removal asserted by `fixture/README.md` ("the removed `ctx.connection.api` face (DSH-0.1.2-A1-30)").
  - Corroborated locally (directional): in the installed runtime, agent presets are exposed as a Typert remote namespace (`dsh-agent-preset-registry/lib/typert.remote-client.d.ts` — `'agentPresets/list': () => Promise<RemoteResult<AgentPresetRoster>>`, plus `agentPresets/read`, `agentPresets/select`), not as a `connection.api` object face — consistent with the old face being gone. The exact 0.1.2-alpha.2 replacement access path (injected service vs. remote client) is **unconfirmed** — card text not mounted.
- **Migration action:** remove the `ctx.connection.api.agentPresets.list()` call and re-access the agent-preset registry via the replacement mechanism designated by card A1-30 (e.g., the typed remote call `agentPresets/list` or the injected client service, per the card).

---

## Non-touchpoints (checked, no action needed)
- `fixture/src/client/Pet.tsx:1` — trivial component, no dsh API usage.
- `fixture/src/client/index.ts:7` — `export const inject = ['slots', 'conversation']`: no 0.1.2-alpha.2 card covers the `inject` declaration; unchanged (**unconfirmed** beyond absence of a matching card in the README's known-change list).
- `fixture/package.json` — manifest shape (`dsh.client.platform: "web"`) matches no removal card; only its `name` field participates in T2.

## Summary table
| # | File:line | Plane | Card | Break | Action (essence) |
|---|-----------|-------|------|-------|------------------|
| T1 | src/client/index.ts:1 (used :9) | Web Client | DSH-0.1.2-A1-25 | `@deepseek-ai/dsh-client-runtime/client` package removed; import unresolvable | Re-import `ClientContext` from the A1-25 replacement entry |
| T2 | src/client/index.ts:10 (+ package.json:2) | plugin | DSH-0.1.2-A1-26 | Loader registration id `'pet-legacy-bundle'` ≠ package name | Register under `'dsh-pet-session-bench'` (or drop manual registration per card) |
| T3 | src/client/index.ts:12–13 (import :2) | Web Client | DSH-0.1.2-A1-27 | Flat `useSession()` `nodes` snapshot removed | Migrate to the card's replacement session-state API; fix import source |
| T4 | src/client/index.ts:11 | Web Client ↔ Host | DSH-0.1.2-A1-30 | `ctx.connection.api` face removed | Re-access agent presets via the card's replacement remote/service path |

## Method & read-only discipline
- Fixture enumerated exhaustively (4 files) and read only; no file under `fixture/` was created, modified, or deleted.
- No build, no dependency install, no reproduction environment; only read-only inspection commands were run (directory listing, content grep) against the fixture and the locally installed DSH package named by the runtime context.
- No network access; no `skills/`, `tests/`, `solution/`, or `benchmark/results/` content read; this report is the sole written artifact, placed under `agent-output/S4-legacy-client-imports/` as specified.

## Confidence & unconfirmed items
- **Confirmed (multi-source):** all four touchpoint locations in code (direct fixture read); existence and ID of the four change cards (fixture README maintainer reference); A1-25 and A1-30 break direction (independently corroborated against the installed 0.2.1-rc.1 runtime).
- **Unconfirmed:** exact replacement identifiers/import paths prescribed by each card (card full text not mounted in the noskill arm); the loader's new keying semantics behind A1-26 (README-sourced only); the precise post-A1-27 `useSession` return shape; any behavioral difference between 0.1.2-alpha.2 and the 0.2.1-rc.1 runtime used for corroboration.
