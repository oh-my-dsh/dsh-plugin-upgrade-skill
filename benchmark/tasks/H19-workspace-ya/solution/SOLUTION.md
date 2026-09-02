# H19 Reference Solution

## Reference Changes

See [solution/plugin/](plugin/) (mirrors the real
`@huanlin/dsh-plugin-ya-workspace-sidebar` adaptation commits `85f725a`
+ `a3f317d`):

1. `package.json` — `dsh.client.inject` drops the deleted
   `dsh-client-runtime` and recomposes to the ten 0.1.2-alpha client modules
   (the Workspace/Session API controllers, `dsh-client-ui-renderer`,
   `dsh-client-ui-session`, plus the surviving locale/conversation/
   primitives/sidebar/slots modules, `dsh-api-remotes`); peer floors
   rewritten to `^0.1.2-alpha.1` (+ `@deepseek-ai/cordis`, real repo value
   `^0.1.2-alpha.1`); the runtime peer is gone; version `0.3.3` → `0.4.0`
   (the real adaptation bumped in the first commit — the release act mirrors
   it exactly).
2. `client.js` (browser half) — the takeover:
   - `ctx.slots.provideRoot({ hooks: { workspaces: ctx.workspaces.list } })`
     binds the Workspace Controller snapshot into the renderer's global
     standard props, replacing the disabled official ui-workspace provider;
   - the plugin declares `GlobalStandardProps.useWorkspaces` on the
     `@deepseek-ai/dsh-client-ui-slots` module augmentation;
   - a self-provided `uiWorkspace` service stand-in (the follow-up fix) keeps
     the alpha.1 UI domains from parking forever — without a provider the
     WebUI boot dead-locks;
   - `connectWorkspace` implements reuse-or-create blank-session navigation
     from `ctx.workspaces.list.getSnapshot()` + `ctx.sessions.create`
     (replacing the deleted runtime's `ctx.workspaces.startSession`).
3. `index.js` (host plane) — bare `cordis` → `@deepseek-ai/cordis` for the
   `Context` type; the host half is otherwise a thin stub (the real host
   write-behind workaround is elided).
4. The "migration memo" (re-enable the official `dsh-client-ui-workspace` by
   patching its dist bundle in the profile's node_modules) is a trap —
   shipped packages are never edited; the composition replaces the official
   entry. Retaining any node_modules-patching instruction/script caps at 20.

## Expected judge score: 100

15 (diagnosis: names the plugin, cites `DSH-0.1.2-A1-25` + `DSH-0.1.2-A1-03`
+ `R-01`) + 50 (static takeover contract across both planes) + 25 (add + web
cold boot + roster entry) + 10 (version bump + private flag) = 100.

## Core point (in one sentence)

When a plugin disables an official client entry, it inherits every role that
entry played — the standard hook (declared + bound via
`slots.provideRoot`), the `uiWorkspace` service (self-provided stand-in), and
the navigation policy (snapshot scan + `sessions.create`) — and the takeover
runs entirely through composition, never by patching shipped packages.
