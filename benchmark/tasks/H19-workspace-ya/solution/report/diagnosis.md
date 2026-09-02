# Diagnosis — bench-workspace-ya on dsh 0.1.2-alpha.2

Plugin: `bench-workspace-ya` (workspace-browser replacement: the bundle patch
disables the official `ui-workspace` client entry and the browser half
provides both `sidebar.workspaces` and `conversation.hero.workspace`; host
stub + browser composition examined).

## Breaks found

1. **The client inject list names a deleted package (boot-fatal).**
   `dsh.client.inject` still lists `@deepseek-ai/dsh-client-runtime`, which
   was removed and split by domain (card `DSH-0.1.2-A1-25`): the web tree
   cannot compose with it in the list. The replacement modules are the
   Workspace/Session API controllers (`dsh-api-workspace-controller`,
   `dsh-api-session-controller`, card `DSH-0.1.2-A1-03` — session view
   internals split up extensively: `SessionId` → `dsh-session/types`,
   `SessionListState`/`SessionSummary` → `api-session-controller/client`)
   plus `dsh-client-ui-renderer` (the `ctx.slots` service merge) and
   `dsh-client-ui-session`.
2. **The disabled official provider's roles are unowned.** The bundle patch
   disables `ui-workspace`, which used to own (a) the global `useWorkspaces`
   standard hook — now this plugin declares
   `GlobalStandardProps.useWorkspaces` on the
   `@deepseek-ai/dsh-client-ui-slots` module augmentation and binds the
   Workspace Controller snapshot via
   `ctx.slots.provideRoot({ hooks: { workspaces: ctx.workspaces.list } })`;
   (b) the `uiWorkspace` navigation service — since alpha.1 the official
   ui-sidebar/ui-conversation/ui-agent-preset/directory-picker client entries
   inject `uiWorkspace`, so the plugin must self-provide the stand-in service
   or the WebUI boot dead-locks (fibers park forever); (c) the
   reuse-or-create blank-session navigation — now implemented from the
   Workspace/Session Controller snapshots
   (`ctx.workspaces.list.getSnapshot()` scan + `ctx.sessions.create`) instead
   of the deleted runtime's `ctx.workspaces.startSession`.
3. **The browser type surface points at the deleted package.** `ClientContext`
   and the workspace/session types resolve from
   `@deepseek-ai/dsh-client-runtime/client`; the context type becomes
   `Context` from `@deepseek-ai/cordis` with type-only merges
   (api-workspace-controller/client, api-session-controller/client,
   dsh-session/types, ui-renderer for ctx.slots).
4. **Peer floors are on a dead cohort.** All `^0.0.1-rc.1` floors and the
   bare `cordis ^4.0.0-rc.7` peer do not match `0.1.2-alpha.2` under npm
   semver prerelease rules; they must be rewritten to the `0.1.2-alpha`
   cohort (`^0.1.2-alpha.1`), the runtime peer dropped, and the new
   controller/ui peers added.

The fixture's "migration memo" (patch the shipped `dsh-client-ui-workspace`
dist bundle in the profile's node_modules to re-enable it) is false and
dangerous: shipped packages are never edited — the composition replaces the
official entry through `slots.provideRoot` + the plugin's own stand-in
service.

## Cards

- `DSH-0.1.2-A1-25` — `@deepseek-ai/dsh-client-runtime` removed, client
  symbols migrated by domain (the client inject list, the controller packages
  that re-home the workspace/session types, and the boot-fatal composition).
- `DSH-0.1.2-A1-03` — session view internals split up extensively (SessionId
  → `dsh-session/types`, list/summary types → `api-session-controller`,
  session standard hooks → `dsh-client-ui-session`).
- `R-01` — back the fixture up before touching it (baseline commit present).

## Fix plan

- `dsh.client.inject`: drop the runtime; name the two API controllers,
  `dsh-client-ui-renderer`, `dsh-client-ui-session`, and the surviving
  locale/primitives/conversation/sidebar/slots modules.
- Browser half: declare the `GlobalStandardProps { useWorkspaces }` merge on
  the slots package; `ctx.slots.provideRoot({ hooks: { workspaces: … } })`;
  self-provide the `uiWorkspace` navigation stand-in; implement
  connectWorkspace reuse-or-create navigation from the Controller snapshots.
- Host half: `Context` type from `@deepseek-ai/cordis` (bare cordis gone).
- `package.json`: peers → `^0.1.2-alpha.1` cohort (+ `@deepseek-ai/cordis`),
  runtime peer removed, controller/ui-session/ui-workspace/remotes/typert
  peers added; version `0.3.3` → `0.4.0`.
- Deploy: isolated web profile; the roster (`__DSH_BOOT__.entries`) must list
  `<pkg>/client.js` after the client plane re-composes. Never edit the
  shipped `dsh-client-ui-workspace` dist — the patch row disabling it stays.
