// bench-workspace-ya — browser half (0.1.1-era cohort).
//
// Replaces the official workspace browser on both seats (distilled from the
// real PRE client sources; the WorkspaceSidebar/WorkspacePicker component
// bodies are elided — the exam is the composition plane):
//   - `sidebar.workspaces` — the two-level sidebar: root navigation with a
//     global Recent Sessions block, then per-workspace session groups.
//   - `conversation.hero.workspace` — the hero picker on the empty state.
//
// The bundle patch disables the official `ui-workspace` client entry (see
// cordis.patch.yml), so this package is the only provider of both seats.
//
// ────────────────────────────────────────────────────────────
// Migration memo (left in the repo during the 0.1.1 era):
//   "The official @deepseek-ai/dsh-client-ui-workspace still ships in the
//    profile's node_modules — re-enable it by patching its dist bundle in
//    place (the provider registration is only commented out); do NOT write
//    your own root hooks."
// ────────────────────────────────────────────────────────────
//
// Type surface as it stands (type-only, erased at runtime — this is where
// the client-plane breaks live): the client context type comes from the
// 0.1.1-era runtime package's /client entry,
//
//   import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
//
// and so do the workspace/session types the sidebar consumes (WorkspaceId,
// WorkspaceView, SessionId, SessionSummary, SessionListState,
// SessionSearchResultItem). The plugin's slot contracts merge
// `sidebar.workspaces.directoryFlow` + `conversation.hero.workspace.
// directoryFlow` into the slots package's SlotMap — no global standard-hook
// merge exists in this era: the (disabled) official ui-workspace entry owns
// the global workspaces selector hook and the workspace navigation policy.

export const name = 'bench-workspace-ya-client'

/** Services required by both replacement client entries. */
export const inject = ['slots', 'sessions', 'workspaces', 'locale']

const NS = 'bench-workspace-ya'

/**
 * Client plugin body: register the replacement sidebar and hero picker.
 *
 * @param {import('@deepseek-ai/dsh-client-runtime/client').ClientContext} ctx
 */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh: {}, en: {} }), 'bench-workspace-ya: dictionaries')

  // Directory-flow occupancy source for both trigger surfaces: the slot is
  // occupied while a directory-picker conversation is open on that surface.
  const flowSource = (name) => ({
    getSnapshot: () => ctx.slots.entries(name).length > 0,
    subscribe: (listener) => ctx.slots.subscribe(name, listener),
  })
  const sidebarFlow = flowSource('sidebar.workspaces.directoryFlow')
  const pickerFlow = flowSource('conversation.hero.workspace.directoryFlow')
  const createWorkspace = (input) => ctx.workspaces.create(input)

  const searchSessions = async (query, signal) => {
    const result = await ctx.sessions.search(query, signal)
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }
  const sidebarInjected = () => ({
    // 0.1.1-era navigation: startSession delegates to the runtime's
    // workspace facade — the plugin owns no navigation policy of its own.
    startSession: (workspaceId) => { ctx.workspaces.startSession(workspaceId) },
    open: (sessionId) => { ctx.sessions.open(sessionId) },
    searchSessions,
    searchResultLimit: ctx.sessions.searchResultLimit,
    createWorkspace,
    hooks: { directoryFlow: sidebarFlow },
    // …rename/fork/archive/insertSessionBefore seams ride the elided
    // component bodies and are not part of the exam.
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

/** WorkspaceSidebar — the two-level browser; component body elided. */
function WorkspaceSidebar() {
  return null
}

/** WorkspacePicker — the hero picker; component body elided. */
function WorkspacePicker() {
  return null
}
