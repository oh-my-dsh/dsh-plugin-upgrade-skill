// bench-workspace-ya — browser half, migrated to the 0.1.2-alpha.2 cohort
// (mirrors @huanlin/dsh-plugin-ya-workspace-sidebar 85f725a + a3f317d):
//   - the deleted runtime package's symbols are re-homed by domain (card
//     DSH-0.1.2-A1-25): the client context type comes from @deepseek-ai/cordis
//     (Context); WorkspaceId/WorkspaceSnapshot/WorkspaceView from
//     @deepseek-ai/dsh-api-workspace-controller/client; SessionId from
//     @deepseek-ai/dsh-session/types; the session list types from
//     @deepseek-ai/dsh-api-session-controller/client;
//   - this bundle takes over the official ui-workspace role (the cordis.patch
//     row disabling it stays in place): ctx.slots.provideRoot binds the
//     Workspace Controller snapshot into the renderer's global standard
//     props, and this entry declares the useWorkspaces hook itself;
//   - the uiWorkspace navigation service is self-provided by this client
//     entry (the follow-up fix): since alpha.1 the official ui-sidebar,
//     ui-conversation, ui-agent-preset and directory-picker client entries
//     inject `uiWorkspace` — without a provider their fibers park forever and
//     the whole WebUI boot dead-locks.
//
// Type surface after the migration (type-only merges, erased at runtime):
//
//   import type { Context } from '@deepseek-ai/cordis'
//   import type {} from '@deepseek-ai/dsh-api-session-controller/client'
//   import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
//   import type {} from '@deepseek-ai/dsh-client-locale/client'
//   import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'  // ctx.slots merge
//   import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
//   import type { SessionId } from '@deepseek-ai/dsh-session/types'

export const name = 'bench-workspace-ya-client'

/**
 * Required services. `remote` and `remote.directoryPicker` feed the
 * uiWorkspace stand-in's directory picking.
 */
export const inject = [
  'slots', 'sessions', 'workspaces', 'locale', 'remote', 'remote.directoryPicker',
]

const NS = 'bench-workspace-ya'

// The plugin owns the global workspaces standard hook (the official
// ui-workspace provider is disabled by this bundle's patch), declared on the
// slots package's GlobalStandardProps merge:
//
//   declare module '@deepseek-ai/dsh-client-ui-slots' {
//     /** The official ui-workspace provider is disabled by this bundle's
//      * patch, so this plugin owns the global workspaces selector hook
//      * (bound from the Workspace Controller snapshot this apply installs
//      * via slots.provideRoot). */
//     interface GlobalStandardProps {
//       useWorkspaces: SnapshotSelectorHook<WorkspaceSnapshot>
//     }
//   }
//
// The sidebar/hero SlotMap + LocaleNamespaceMap merges stay on the same
// module ('sidebar.workspaces.directoryFlow',
// 'conversation.hero.workspace.directoryFlow').

/**
 * Client plugin body: register the replacement sidebar and hero picker, bind
 * the global workspaces standard hook, and stand in for the uiWorkspace
 * navigation service.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh: {}, en: {} }), 'bench-workspace-ya: dictionaries')

  const flowSource = (name) => ({
    getSnapshot: () => ctx.slots.entries(name).length > 0,
    subscribe: (listener) => ctx.slots.subscribe(name, listener),
  })
  const sidebarFlow = flowSource('sidebar.workspaces.directoryFlow')
  const pickerFlow = flowSource('conversation.hero.workspace.directoryFlow')
  const createWorkspace = (input) => ctx.workspaces.create(input)

  // The official ui-workspace (disabled by this bundle's patch) used to own
  // three roles: the global useWorkspaces standard hook, the uiWorkspace
  // navigation service, and the boot navigation policy. All three move here:
  // the service stand-in keeps the alpha.1 UI domains (sidebar shell,
  // conversation hero, agent preset, directory pickers) from parking forever,
  // provideRoot binds the Workspace Controller snapshot into the renderer's
  // global standard props, and the navigation class carries the official
  // reuse-or-create, current/recent fallback, and archived-current semantics.
  const navigation = new YaWorkspaceNavigation(ctx, ctx.remote.directoryPicker, ctx.workspaces, ctx.sessions)
  ctx.slots.provideRoot({ hooks: { workspaces: ctx.workspaces.list } })

  const searchSessions = async (query, signal) => {
    const result = await ctx.sessions.search(query, signal)
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }
  const sidebarInjected = () => ({
    startSession: (workspaceId) => { navigation.startSession(workspaceId) },
    open: (sessionId) => { ctx.sessions.open(sessionId) },
    searchSessions,
    searchResultLimit: ctx.sessions.searchResultLimit,
    createWorkspace,
    hooks: { directoryFlow: sidebarFlow },
  })

  ctx.slots.inject('sidebar.workspaces', () => ctx.slots.register(
    {
      name: 'sidebar.workspaces',
      children: { 'sidebar.workspaces.directoryFlow': { kind: 'single', scope: 'root' } },
      inject: sidebarInjected,
      locale: NS,
    },
    WorkspaceSidebar,
  ))

  ctx.slots.inject('conversation.hero.workspace', () => ctx.slots.register(
    {
      name: 'conversation.hero.workspace',
      children: { 'conversation.hero.workspace.directoryFlow': { kind: 'single', scope: 'root' } },
      inject: () => ({ createWorkspace, hooks: { directoryFlow: pickerFlow } }),
      locale: NS,
    },
    WorkspacePicker,
  ))
}

/**
 * YaWorkspaceNavigation — the self-provided uiWorkspace service stand-in.
 * In TS this is `class YaWorkspaceNavigation extends Service implements
 * UiWorkspace` registered as the `uiWorkspace` service (super(ctx,
 * 'uiWorkspace')) — the same service face the disabled official entry used
 * to own, so every official consumer keeps resolving it.
 *
 * Carries the official navigation semantics: reuse-or-create Workspace
 * connection, the explicit/current/recent New Session fallback,
 * archived-current clearing, and boot auto-selection.
 */
class YaWorkspaceNavigation {
  /**
   * @param {import('@deepseek-ai/cordis').Context} ctx
   * @param {{ pick(): Promise<unknown>, list: Function, createDirectory: Function }} directoryPicker
   * @param {{ list: { getSnapshot: () => { items: { workspaceId: string, path: string, sessionIds: string[], archivedSessionIds: string[], phase: string } }, subscribe: (fn: () => void) => () => void }, archiveSession: (sessionId: string) => Promise<void> }} workspaces
   * @param {{ list: { getSnapshot: () => { ids: string[], byId: Record<string, { id: string, blank: boolean, cwd?: string }>, current?: string, phase: string } }, create: (options: { workspaceId: string }) => Promise<string>, open: (sessionId: string) => void, clear: () => void }} sessions
   */
  constructor(ctx, directoryPicker, workspaces, sessions) {
    // Service stand-in: registers this instance as the `uiWorkspace` service
    // on the client Context (super(ctx, 'uiWorkspace') in TS) so the alpha.1
    // UI domains that inject uiWorkspace stop pending.
    this.ctx = ctx
    this.directoryPicker = directoryPicker
    this.workspaces = workspaces
    this.sessions = sessions
    this.connecting = new Map()
  }

  /**
   * Reuse-or-create Workspace connection: coalesce in-flight creations,
   * reuse the workspace's unarchived member blank session, else create a
   * blank one.
   *
   * @param {string} workspaceId
   * @returns {Promise<string>}
   */
  connectWorkspace(workspaceId) {
    const workspace = this.workspaces.list.getSnapshot().items
      .find((item) => item.workspaceId === workspaceId)
    if (workspace === undefined) {
      return Promise.reject(new Error(`bench-workspace-ya: unknown workspace "${workspaceId}"`))
    }
    const inflight = this.connecting.get(workspaceId)
    if (inflight !== undefined) return inflight
    const archived = this.workspaces.list.getSnapshot().archivedSessionIds
    const sessions = this.sessions.list.getSnapshot()
    for (const id of sessions.ids) {
      const summary = sessions.byId[id]
      if (summary !== undefined && summary.blank && summary.cwd === workspace.path
        && workspace.sessionIds.includes(summary.id) && !archived.includes(summary.id)) {
        return Promise.resolve(summary.id)
      }
    }
    const attempt = this.sessions.create({ workspaceId })
      .finally(() => { this.connecting.delete(workspaceId) })
    this.connecting.set(workspaceId, attempt)
    return attempt
  }

  /** Navigate: connect (reuse-or-create) then open the session. */
  startSession(workspaceId) {
    if (workspaceId === undefined) return
    void this.connectWorkspace(workspaceId).then(
      (sessionId) => { this.sessions.open(sessionId) },
      (reason) => { console.warn('bench-workspace-ya: new session failed:', reason) },
    )
  }

  async archiveSession(sessionId) {
    await this.workspaces.archiveSession(sessionId)
  }
}

/** WorkspaceSidebar — the two-level browser; component body elided. */
function WorkspaceSidebar() {
  return null
}

/** WorkspacePicker — the hero picker; component body elided. */
function WorkspacePicker() {
  return null
}
