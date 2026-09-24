# S4 · Legacy Client Runtime Touchpoints — Migration Touchpoint Report (Read-Only)

Task: analyze a Web Client plugin written in the dsh 0.1.1-rc.2 era and identify every touchpoint that will break on dsh 0.1.2-alpha.2. Mode A-style read-only inspection per the plugin-upgrade skill; no file under the fixture was modified, no build or reproduction environment was created.

Corridor: 0.1.1-rc.2 → 0.1.2-alpha.2, connected via the skill's `from → to` metadata as rc.2 → alpha.1 (references/v0.1.2-alpha.1.md) followed by alpha.1 → alpha.2 (references/v0.1.2-alpha.2.md, plus references/api-migration-0.1.2-alpha.2.md). All cards cited below were verified against the card bodies in references/v0.1.2-alpha.1.md (lines 415–575); none are fabricated.

Fixture identity (recorded, not modified):

- Package: `dsh-pet-session-bench` @ 0.1.0, private, ESM, `dsh.client.platform = "web"` (package.json)
- Files: README.md, package.json, src/client/index.ts, src/client/Pet.tsx (4 files; static copy, not executable)
- No Host half, no cordis.patch.yml, no `dsh.client.inject` list, no lockfile in the fixture.

## Confirmed breaking touchpoints (4)

### T1 · Import of the removed `@deepseek-ai/dsh-client-runtime/client` package

- File/line: fixture src/client/index.ts:1 — `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'`
- Plane: Web Client (type import; build/typecheck surface). Touchpoint class #3/#5 per the card.
- Card: `DSH-0.1.2-A1-25` — "`@deepseek-ai/dsh-client-runtime` package removed, client symbols migrated by domain" (references/v0.1.2-alpha.1.md, card body at line 415).
- Why it breaks: the package was deleted from packages/client in alpha.1; the module no longer exists on the 0.1.2 cohort, so typecheck/build report a nonexistent module, and any runtime row referencing it stays out of the boot graph.
- Migration action: replace the `ClientContext` type with `import type { Context as ClientContext } from '@deepseek-ai/cordis'` per the card's verified symbol table. Also clean package.json: the fixture's `dsh.client.inject` does not list `dsh-client-runtime` (package.json:6 contains only the platform declaration), so no phantom-dependency row needs removal here — nothing to do beyond the import itself. While the cohort is unpublished, point type dependencies at the official source checkout with `link:` or tarball `overrides` (card / R-01).
- Source: card body + alpha.1 release notes and packages/client tree linked in the card.

### T2 · `__ModuleLoader__.load` registration id ≠ package.json name

- File/line: fixture src/client/index.ts:10 — `__ModuleLoader__.load('pet-legacy-bundle', ...)`; the comment in the fixture itself flags "legacy bundle id, not package name". Package name is `dsh-pet-session-bench` (package.json:2).
- Plane: Web Client / plugin packaging (client bundle registration). Touchpoint class #5.
- Card: `DSH-0.1.2-A1-26` — "client-modules scan contract: registration id must equal the package.json name" (references/v0.1.2-alpha.1.md, card body at line 443).
- Why it breaks: 0.1.2's boot manifest keys entries/modules/registrations by package name (`Entry name == package name`). A registration id of `pet-legacy-bundle` triggers the startup assertion `loaded without registering "dsh-pet-session-bench"`, or the panel silently disappears from the boot graph with no error.
- Migration action: align the registration id to the bare package name `dsh-pet-session-bench` (the id passed to `__ModuleLoader__.load`, usually injected by the tsdown banner `PLUGIN_ID`), and use the same bare package name on any future assembly row in cordis.patch.yml (the fixture currently has none, so only the id itself needs fixing).
- Verification (for the later implementation, not run here): index HTML `window.__DSH_BOOT__.entries` contains `"id":"dsh-pet-session-bench"`; no `loaded without registering` in startup logs.

### T3 · Flat `useSession()` `nodes` snapshot read

- File/line: fixture src/client/index.ts:12–13 — `const { nodes } = useSession()` then `nodes[0]`.
- Plane: Web Client (session-content read path; services touchpoint class #3).
- Card: `DSH-0.1.2-A1-27` — "Session content reads now go through the SessionBinding durable event window" (references/v0.1.2-alpha.1.md, card body at line 461).
- Why it breaks: 0.1.2 no longer exposes per-session conversation-node snapshots; the timeline becomes an internal projection of each view package. The flat `nodes` destructured from the chat store is the removed per-session snapshot, so `nodes` is undefined/empty and downstream reads throw or silently no-op (console factory errors).
- Migration action: read session content through the session binding's durable event window: `sessions.binding(id)` → `binding.eventSource.getSnapshot().entries` (`SessionEventLikeEntry[]`, user text in `event.data.content` text blocks), importing `SessionBinding`/`SessionEventLikeEntry` from `@deepseek-ai/dsh-api-session-controller/client`; scoped services via `binding.ctx.get(...)`. (Exact re-wiring of this fixture's minimal `nodes[0]` read is trivial once the binding path is adopted.) Unconfirmed detail: whether the `useSession` symbol itself moved or changed signature in `@deepseek-ai/dsh-client-ui-chat` — the alpha.1 card list does not carry a dedicated card for that export; treat the specific store hook signature as pending verification against the target tag's actual package exports.
- Source: card body + SessionBinding/SessionEventLikeEntry contract links in the card.

### T4 · Removed `ctx.connection.api` face (`agentPresets.list`)

- File/line: fixture src/client/index.ts:11 — `ctx.connection.api.agentPresets.list().then(presets => { ... })`.
- Plane: Web Client (services/Remote consumption; touchpoint class #3).
- Card: `DSH-0.1.2-A1-30` — "Client `ctx.connection.api` face removed entirely; history/transcript reads rerouted" (references/v0.1.2-alpha.1.md, card body at line 521).
- Why it breaks: alpha.1 removed the old apiProxy mirror face on `ctx.connection`; the `agentPresets.list()` call throws at runtime. The empty callback body would also swallow the rejection — the card's field note calls out that a swallowed error renders a "forever blank" UI while no-crash smokes stay green.
- Migration action: branch by session origin. For ordinary sessions, move history reads to the `session/page`|`session/follow` Remotes; for `agentPresets` specifically, the card names it as an example consumer of the removed face — the replacement must go through the successor Remote/route appropriate to the data (no `agentPresets`-specific successor is named in the corridor material; mark the exact successor endpoint as pending verification against the target tag). Once the client no longer consumes it, remove `connection` from the inject list and the type mirror — here the fixture's inject (index.ts:7) is `['slots', 'conversation']` and does not include `connection`, so no inject cleanup is required. Do not let the `then` callback swallow errors; surface an error state.
- Source: card body + alpha.1 connection/client/api.ts and the APIProxy→Remote architecture note linked in the card.

## Checked and not hit (with evidence)

- `dsh.client.inject` phantom dependency on the removed runtime package — not present: package.json:6 declares only `"dsh": { "client": { "platform": "web" } }`; no inject array exists in the manifest (part of A1-25's cleanup list).
- `ctx.workspaces` navigation (`connectWorkspace`/`pickDirectory`, `baselinesReady`/`recentWorkspaceId`) — no occurrence in the fixture (cards A1-32 n/a).
- Composer DOM manipulation (`textarea` assumptions) — none (card A1-28 n/a).
- `MarkdownText` labels shape — no ui-primitives usage (card A1-29 n/a).
- Subagent descriptor version assertions — none (card A1-31 n/a).
- Host-side `cordis` bare imports — none; the fixture has no Host half (A1-25 table row "unchanged").
- alpha.1→alpha.2 edge (references/v0.1.2-alpha.2.md and the API ledger): the fixture's client half does not hit the keyed chat snapshots / removed client runtime / command attachment surfaces beyond what A1-25 already covers; no additional alpha.2-specific card intersects this source.

## Pending / residual risk

- The exact successor endpoint for `agentPresets.list()` is not named in the corridor cards (see T4); verify against the 0.1.2-alpha.2 tag's client API before implementing.
- The `useSession` export's own signature at the target tag (see T3) — unconfirmed.
- This is a static, non-executable copy; no baseline build/typecheck/test run was possible or permitted (the brief forbids creating a reproduction environment), so the "pre-existing failures" list of Mode C step 0 is "not collected".
- The corridor between the fixture's rc.2-era code and the earliest card edges is fully covered (rc.2 → alpha.1 → alpha.2 cards exist); no unsupported gap.

## Rollback / discipline

- Read-only task: no file inside or outside the fixture was modified; only this report file was written to the designated output directory. No baseline to roll back.
