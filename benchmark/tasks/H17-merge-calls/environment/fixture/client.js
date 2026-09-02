// Browser half: shadows the shipped tool.call.toolview entries for every
// grouped tool at priority -1 (the keyed slot's shadowing rule: lowest
// priority renders), merging consecutive same-tool calls into one card with
// compact child rows.
//
// 0.1.1-era type surface (pre v0.1.2-alpha): the client context type AND the
// chat node types (ChatNodeStore / ChatConversationViewNode / ToolCallBlock /
// ToolResultNode) come from the client-runtime package:
//
//   import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
//
// and node-key scanning recomputes ui-conversation's internal
// conversationContextKey (a value import from the same package in the real
// sources) to locate the seat's node in snapshot.chat.order.
//
// ────────────────────────────────────────────────────────────
// Migration memo (left in the repo during the 0.1.x era):
//   "resultView/callView were only renamed on alpha — keep reading them off
//    the call object. useChat is for the chat window only: tool views keep
//    reading ctx.session."
// ────────────────────────────────────────────────────────────

export const name = 'bench-merge-calls-client'

// slots (the keyed toolview shadowing) + locale (row copy zh/en).
export const inject = ['slots', 'locale']

const NS = 'merge-tool-calls'

// Base row copy (distilled from locales.ts zh/en — the real pre-adaptation
// key set, elided to the count keys + the terminal block keys).
const zh = {
  running: '进行中',
  failed: '失败',
  stopped: '已中断',
  expand: '展开',
  collapse: '折叠',
  mergedCount: '已合并 {n} 次调用',
  countFiles: '{n} 个文件',
  'terminal.exitCode': '退出码 {code}',
  'terminal.noOutput': '无输出',
}
const en = {
  running: 'Running',
  failed: 'Failed',
  stopped: 'Interrupted',
  expand: 'Expand',
  collapse: 'Collapse',
  mergedCount: '{n} calls merged',
  countFiles: '{n} Files',
  'terminal.exitCode': 'exit code {code}',
  'terminal.noOutput': 'No output',
}

// The 19 better-locale override languages, distilled to 2 (real values).
// Full-dict shape: every dictionary carries the same key set as en/zh —
// enforced by the Record<MergeToolCallsKey, string> annotation:
//
// @type {Record<string, Record<string, string>>}
const overrideDicts = {
  ja: {
    running: '実行中',
    failed: '失敗',
    stopped: '中断',
    expand: '展開',
    collapse: '折りたたむ',
    mergedCount: '{n} 回の呼び出しを統合',
    countFiles: '{n} 個のファイル',
    'terminal.exitCode': '終了コード {code}',
    'terminal.noOutput': '出力なし',
  },
  ko: {
    running: '실행 중',
    failed: '실패',
    stopped: '중단됨',
    expand: '펼치기',
    collapse: '접기',
    mergedCount: '{n}번 호출 병합됨',
    countFiles: '파일 {n}개',
    'terminal.exitCode': '종료 코드 {code}',
    'terminal.noOutput': '출력 없음',
  },
}

/**
 * Structural view of better-locale's override store (optional; no runtime
 * dep). PRE contract: each per-language dictionary carries the SAME key set
 * as the base en/zh dictionaries (compiler-enforced full Record).
 */
const overrideStoreShape = undefined // { register(ns, dicts: Record<string, Record<string, string>>): () => void }

/** Register the override dicts into ctx.betterLocale (optional service). */
function registerOverrideDicts(ctx) {
  ctx.effect(() => {
    let dispose
    const sync = () => {
      dispose?.()
      dispose = undefined
      const store = ctx.get('betterLocale')
      if (store !== undefined) dispose = store.register(NS, overrideDicts)
    }
    sync()
    const unsubscribe = ctx.locale.subscribe(sync)
    return () => {
      unsubscribe()
      dispose?.()
    }
  }, 'bench-merge-calls: better-locale override dicts')
}

// ── merged-run detection (distilled from merge-run.ts, PRE shape) ────────

/** Tool-call node kind registered by ui-conversation's built-in tool definition. */
const TOOL_CALL_KIND = 'tool-call'

/** The ui-conversation internal node key. The real code imports
 * conversationContextKey as a value from
 * @deepseek-ai/dsh-client-runtime/client and recomputes the node key from
 * (kind, callId); the format itself is upstream-internal (elided). */
const conversationContextKey = undefined

/** Extract a root call block from a chat node, when it is a tool-call node. */
function toolRootOf(node) {
  if (node.kind !== TOOL_CALL_KIND) return null
  const root = node.data?.root
  return typeof root === 'object' && root !== null ? root : null
}

/** The wire tool name of a call in either lifecycle form (mirrors ui-tool). */
function callNameOf(block) {
  return 'kind' in block ? (block.call?.name ?? '') : block.name
}

/** Whether the call's wire name is one of the grouped tools (empty = all). */
function isGroupedTool(name, tools) {
  return tools.length === 0 || tools.includes(name)
}

/**
 * Pure detection of the consecutive same-tool run this seat belongs to
 * (PRE shape): the seat recomputes the ui-conversation internal node key
 * from its call id and locates itself in the chat order by that key.
 * @param {readonly string[]} order - chat node key order.
 * @param {Record<string, { kind: string, data: { root?: unknown } }>} nodes - chat node store.
 * @param {string} myCallId - the call id of the seat asking about itself.
 */
function readRun(order, nodes, myCallId, tools, groupBy, maxGroupSize) {
  const myKey = conversationContextKey(TOOL_CALL_KIND, myCallId)
  const myIndex = order.indexOf(myKey)
  if (myIndex < 0) return null
  const myRoot = rootAtNode(order, nodes, myIndex)
  if (myRoot === null) return null
  const myName = callNameOf(myRoot)
  const size = Math.max(1, maxGroupSize)

  // (the family/groupBy partition walk is elided — the exam is the node-key
  // contract and the session read, not the grouping algebra)
  const blocks = [myRoot]
  return { isFirst: true, blocks: groupBy === 'step' ? blocks : blocks.slice(0, size) }
}

function rootAtNode(order, nodes, index) {
  const key = order[index]
  const node = key === undefined ? undefined : nodes.get(key)
  return node === undefined ? null : toolRootOf(node)
}

// ── card derivations (distilled from card-model.ts, PRE shape) ───────────
// The plugin reads the shipped ui-tool per-call derivations off the call
// object: `block.resultView` (result-side card) and `block.callView`
// (call-side view). Two of the six derivations are kept as specimens.

/** Resolve a path relative to the session cwd (ui-tool mirror, elided). */
function relativizeToCwd(path, cwd) {
  return cwd !== undefined && path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : path
}

/** Resolve a terminal workdir against the session cwd (mirrors ui-tool). */
function resolveTerminalCwd(cwd, sessionCwd) {
  return cwd === undefined || cwd === '' ? sessionCwd : cwd
}

/**
 * Read-card derivation (PRE shape): projects the shipped ui-tool read card
 * off `block.resultView`.
 * @param {{ resultView?: { card?: string, lines?: unknown, title?: string, path?: string, totalLines?: number } }} block
 */
function readCardOf(block, cwd) {
  if (!('kind' in block)) return null
  const result = block.resultView?.card === 'read' ? block.resultView : null
  if (result === null) return null
  if (!Array.isArray(result.lines)) return null
  const lines = result.lines
    .filter((line) => typeof line === 'object' && line !== null
      && typeof line.number === 'number' && typeof line.text === 'string')
    .map((line) => ({ number: line.number, text: line.text }))
  return {
    label: result.title ?? relativizeToCwd(result.path, cwd),
    lines,
    totalLines: typeof result.totalLines === 'number' ? result.totalLines : lines.length,
  }
}

/**
 * Terminal-card derivation (PRE shape): the call-side view carries the
 * command + workdir, the result-side view the output.
 * @param {{ callView?: { card?: string, title?: string, cwd?: string, description?: string }, resultView?: { card?: string, title?: string, output?: string, exitCode?: number } }} block
 */
function terminalCardOf(block, sessionCwd) {
  const call = block.callView?.card === 'terminal' ? block.callView : null
  if (!('kind' in block)) {
    return call === null ? null : {
      card: { command: call.title, cwd: resolveTerminalCwd(call.cwd, sessionCwd), running: true },
    }
  }
  const result = block.resultView?.card === 'terminal' ? block.resultView : null
  if (result === null) return null
  return {
    card: {
      command: result.title ?? call?.title ?? '',
      cwd: call === null ? undefined : resolveTerminalCwd(call.cwd, sessionCwd),
      output: result.output,
      exitCode: result.exitCode,
      running: false,
    },
  }
}

// ── the shadowed toolview ────────────────────────────────────────────────
// Renders the merged run card for the run's first call; continuation calls
// render nothing. In-session reads go through the session store's chat
// slice (useSession, distilled from rows.tsx: the row receives `useSession`
// and reads snapshot.chat.order / snapshot.chat.nodes).

/**
 * @param {{ callId: string, toolName: string, block: { kind?: string, resultView?: unknown, callView?: unknown }, cwd?: string, t: (key: string) => string, cfg: { tools: string[], groupBy: string, maxGroupSize: number }, useSession: (selector: (snapshot: unknown) => unknown) => unknown }} props
 */
export function MergedToolRow(props) {
  const { callId, toolName, block, cwd, t, cfg, useSession } = props
  const run = useSession((snapshot) => readRun(
    snapshot.chat.order,
    snapshot.chat.nodes,
    callId,
    cfg.tools,
    cfg.groupBy,
    cfg.maxGroupSize,
  ))
  if (run === null || !run.isFirst) return null
  const card = toolName === 'read' ? readCardOf(block, cwd) : terminalCardOf(block, cwd)
  return card === null ? null : card // the row component body is elided
}

/**
 * Client plugin body: register one shadowed toolview per grouped tool and
 * the plugin's own + override dictionaries.
 * @param {import('@deepseek-ai/dsh-client-runtime/client').ClientContext} ctx
 * @param {{ tools?: string[], groupBy?: string, maxGroupSize?: number }} config - cordis row config (loosely typed).
 */
export function apply(ctx, config = {}) {
  const cfg = { tools: [], groupBy: 'adjacent', maxGroupSize: 8, ...config }

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'bench-merge-calls: dictionaries')
  registerOverrideDicts(ctx)

  const toolNames = cfg.tools.length === 0 ? ['read', 'grep', 'glob'] : [...new Set(cfg.tools)]
  for (const tool of toolNames) {
    ctx.slots.inject('tool.call.toolview', () =>
      ctx.slots.register({
        name: 'tool.call.toolview',
        key: tool,
        priority: -1,
        locale: NS,
      }, MergedToolRow))
  }
}
