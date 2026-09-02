// Browser half — migrated to 0.1.2-alpha.2 (mirrors
// @huanlin/dsh-plugin-merge-tool-calls 720a077):
//   - the client context type comes from @deepseek-ai/cordis (Context); the
//     ctx.slots merge is pulled type-only from
//     @deepseek-ai/dsh-client-ui-renderer/client;
//   - the chat node types (ChatNodeStore / ChatConversationViewNode /
//     ToolCallBlock / ToolResultNode) moved to
//     @deepseek-ai/dsh-client-ui-chat/client — the deleted runtime package's
//     chat surface lives there now;
//   - the seat locates itself by scanning the store for the tool-call node
//     owning its call id (the node key format stays a ui-conversation
//     internal — no key recomputation any more);
//   - in-session reads go through useChat (the Chat target merged into
//     SessionStandardProps by ui-chat): useChat((snapshot) => readRun(
//     snapshot.order, snapshot.nodes, callId, ...));
//   - ui-tool deleted its per-call view derivations: the read/terminal cards
//     derive from block.meta + the call args + the result text now;
//   - primitives labels contract (card DSH-0.1.2-A1-29): the base zh/en
//     dicts gain the ReadBlock/SearchBlock/DiffBlock/WebBlock label keys and
//     the 19-language override dicts relax to Partial (missing keys fall
//     back to the base zh/en dictionaries).
//
// The in-source memo ("the per-call view fields were only renamed; tool
// views keep reading ctx.session") is a trap: those fields no longer exist
// on the call object, and the chat-flow read goes through useChat.

export const name = 'bench-merge-calls-client'

// slots (toolview shadowing) + locale (row copy zh/en).
export const inject = ['slots', 'locale']

const NS = 'merge-tool-calls'

// Base row copy (distilled from locales.ts). The primitives labels contract
// (card DSH-0.1.2-A1-29) added the ReadBlock/SearchBlock/DiffBlock/WebBlock
// label keys (`read.*` / `search.*` / `diff.*` / `web.*` / `markdown.*` /
// `copy` / `copied`); templates mirror the ui-conversation upstream copy.
const zh = {
  running: '进行中',
  failed: '失败',
  stopped: '已中断',
  expand: '展开',
  collapse: '折叠',
  mergedCount: '已合并 {n} 次调用',
  countFiles: '{n} 个文件',
  copy: '复制',
  copied: '已复制',
  'terminal.exitCode': '退出码 {code}',
  'terminal.noOutput': '无输出',
  'read.window': '显示 {shown} / {total} 行',
  'read.expandAria': '展开其余 {count} 行',
  'search.noResults': '无结果',
  'diff.files': '{count} 个文件',
  'web.http': 'HTTP',
  'markdown.footnotes': '脚注',
}
const en = {
  running: 'Running',
  failed: 'Failed',
  stopped: 'Interrupted',
  expand: 'Expand',
  collapse: 'Collapse',
  mergedCount: '{n} calls merged',
  countFiles: '{n} Files',
  copy: 'Copy',
  copied: 'Copied',
  'terminal.exitCode': 'exit code {code}',
  'terminal.noOutput': 'No output',
  'read.window': 'Showing {shown} of {total} lines',
  'read.expandAria': 'Expand {count} more lines',
  'search.noResults': 'No results',
  'diff.files': '{count} files',
  'web.http': 'HTTP',
  'markdown.footnotes': 'Footnotes',
}

// The 19 better-locale override languages, distilled to 2 (real values).
// Each dictionary is PARTIAL: languages carry the keys they translate, and a
// missing key falls through the locale lookup chain to the base zh/en
// dictionaries. (Dictionaries written before the v0.1.2-alpha.1 adaptation
// predate the read/search/diff/web card-label keys; those render in English
// under an override language until a translation lands here.)
//
// /** @type {Record<string, Partial<Record<string, string>>>} */
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
 * Register the override dictionaries into ctx.betterLocale (the optional
 * better-locale override store; activation-order-safe). The store's register
 * now takes partial per-language dictionaries:
 *
 * @param {string} ns
 * @param {Record<string, Partial<Record<string, string>>>} dicts
 * @returns {() => void} disposer
 */
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

// ── card derivations (POST shape) ────────────────────────────────────────
// ui-tool deleted its per-call view derivations: the read/terminal cards
// derive from block.meta + the parsed call args + the result text.

/** Narrow the parsed call args of a tool-call block (mirrors ui-tool). */
function parsedArgsOf(block) {
  const call = 'kind' in block ? block.call : undefined
  if (call === undefined || typeof call.name !== 'string') return null
  let args = call.args
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args)
    } catch {
      return null
    }
  }
  if (typeof args !== 'object' || args === null) return null
  return { name: call.name, args }
}

/** The result text of a tool-call block: its text blocks joined (real shape). */
function singleResultText(block) {
  if (!Array.isArray(block.content)) return undefined
  const parts = block.content
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
  return parts.length === 1 ? parts[0] : undefined
}

/** Narrow the read card's metadata off the block (mirrors ui-tool). */
function readMetaOf(meta) {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return null
  if (!Array.isArray(meta.lines)) return null
  return {
    path: typeof meta.path === 'string' ? meta.path : undefined,
    lines: meta.lines,
    totalLines: typeof meta.totalLines === 'number' ? meta.totalLines : meta.lines.length,
    lang: typeof meta.lang === 'string' ? meta.lang : undefined,
  }
}

/** Local mirror of the static workspace-path util (not in the client module table). */
function resolveWorkspacePath(cwd, path) {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path) ? path : `${cwd ?? '.'}/${path}`
}

/** Abbreviate the home prefix to `~` (owner props carry `home` through). */
function abbreviateHomePath(path, home) {
  return home !== undefined && path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path
}

function relativizeToCwd(cwd, path) {
  return cwd !== undefined && path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : path
}

/**
 * Read-card derivation (POST shape): the parsed call args name the tool,
 * block.meta carries the projected lines, and the result text supplies the
 * body — nothing is read off the call object any more.
 * @param {ToolCallBlock} block
 */
function readCardOf(block, cwd, home) {
  if (!('kind' in block)) return null
  const parsed = parsedArgsOf(block)
  if (parsed?.name !== 'read') return null
  const path = parsed.args.file_path
  if (typeof path !== 'string' || path.trim() === '') return null
  const meta = readMetaOf(block.meta)
  if (meta === null) return null
  const text = singleResultText(block)
  if (text === undefined) return null
  return {
    label: abbreviateHomePath(relativizeToCwd(meta.path ?? path, cwd), home),
    lines: meta.lines,
    totalLines: meta.totalLines,
    lang: meta.lang,
  }
}

/**
 * Terminal-card derivation (POST shape): command + workdir from the parsed
 * call args, output + exit code from block.meta + the result text.
 * @param {ToolCallBlock} block
 */
function terminalCardOf(block, sessionCwd, home) {
  const parsed = parsedArgsOf(block)
  if (parsed?.name !== 'bash' && parsed?.name !== 'pwsh') return null
  if (typeof block.meta !== 'object' || block.meta === null || Array.isArray(block.meta)) return null
  const meta = block.meta
  return {
    command: typeof meta.command === 'string' ? meta.command : String(parsed.args.command ?? ''),
    cwd: abbreviateHomePath(resolveWorkspacePath(sessionCwd, typeof meta.workdir === 'string' ? meta.workdir : '.'), home),
    output: singleResultText(block),
    exitCode: typeof meta.exitCode === 'number' ? meta.exitCode : undefined,
    running: false,
  }
}

/**
 * The merged-run detector (POST shape, distilled from merge-run.ts): the
 * node key format stays a ui-conversation internal, so the seat finds itself
 * by scanning the store for the tool-call node owning its call id instead of
 * recomputing the key.
 * @param {readonly string[]} order - chat node key order.
 * @param {Record<string, { kind: string, data: { root?: unknown } }>} nodes - chat node store.
 * @param {string} myCallId - the call id of the seat asking about itself.
 */
function myIndexOf(order, nodes, callId) {
  for (let index = 0; index < order.length; index++) {
    const node = nodes[order[index]]
    const root = node === undefined ? null : toolRootOf(node)
    if (root?.callId === callId) return index
  }
  return -1
}

function toolRootOf(node) {
  if (node.kind !== 'tool-call') return null
  const root = node.data?.root
  return typeof root === 'object' && root !== null ? root : null
}

/**
 * Pure detection of the consecutive run this seat belongs to (grouping walk
 * elided — the exam is the call-id scan + the chat read contract, not the
 * grouping math).
 */
function readRun(order, nodes, myCallId) {
  const myIndex = myIndexOf(order, nodes, myCallId)
  if (myIndex < 0) return null
  const root = myIndexOf.length > 0 ? toolRootOf(nodes[order[myIndex]]) : null
  if (root === null) return null
  return { isFirst: true, blocks: [root] }
}

/**
 * The shadowed toolview (POST shape): renders the merged run card for the
 * run's first call. The in-session read goes through useChat — the Chat
 * target merged into SessionStandardProps by ui-chat — with the top-level
 * ChatSnapshot.order / ChatSnapshot.nodes shape (the 0.1.1-era code read the
 * ChatSnapshot.order / ChatSnapshot.nodes shape (the pre-alpha code read the
 * session store's chat slice instead).
 *
 * Type surface after the migration:
 *   import type { Context } from '@deepseek-ai/cordis'
 *   import type { ToolCallBlock } from '@deepseek-ai/dsh-client-ui-chat/client'
 *   import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
 *
 * @param {{ callId: string, toolName: string, block: ToolCallBlock, cwd?: string, home?: string, t: (key: string) => string, cfg: { tools: string[], groupBy: string, maxGroupSize: number }, useChat: (selector: (snapshot: { order: readonly string[], nodes: Record<string, { kind: string, data: { root?: unknown } }> }) => unknown) => unknown }} props
 */
export function MergedToolRow(props) {
  const { callId, toolName, block, cwd, home, t, cfg, useChat } = props
  const run = /** @type {ReturnType<typeof readRun> | null} */ (
    useChat((snapshot) => readRun(
      snapshot.order,
      snapshot.nodes,
      callId,
      cfg.tools,
      cfg.groupBy,
      cfg.maxGroupSize,
    ))
  )
  if (run === null || !run.isFirst) return null
  const card = toolName === 'read'
    ? readCardOf(run.blocks[0] ?? block, cwd, home)
    : terminalCardOf(block, cwd, home)
  return card === null ? null : { card }
}

/**
 * Client plugin body: register one shadowed toolview per grouped tool and
 * the plugin's own + override dictionaries.
 * @param {import('@deepseek-ai/cordis').Context} ctx
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
