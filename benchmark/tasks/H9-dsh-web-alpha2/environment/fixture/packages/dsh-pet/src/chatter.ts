/**
 * Pet chatter — the pet's voice while sessions work. Two speakers live here:
 *
 *  1. The status voice (session bubbles): big per-scene copy pools instead of
 *     one fixed line per phase, a fine-grained tool-name → copy-family map,
 *     and a compact real-argument hint ('跑跑 npm test'), in the spirit of
 *     the working-activity plugin's status line. Lines rotate round-robin —
 *     while a phase persists the copy advances every few seconds, so the pet
 *     feels alive without flickering per streamed chunk.
 *  2. The murmur engine (碎碎念): the pet's inner whispers — category
 *     lines woken by the SITUATION (thinking / writing / the running tool
 *     family), plus outcome lines woken only by structured session results
 *     (test green, tool errors, turn completion). The model's own prose is
 *     never read, and no whisper ever quotes real content. Cooldowns keep
 *     whispers occasional.
 *
 * Pure and deterministic: round-robin everywhere (no Math.random), clocks are
 * injected. The first line of each status pool is the legacy fixed copy the
 * plugin has always shown, so existing installs keep their wording until the
 * scene cycles. No emoji anywhere (repository rule); ～ is the whale-girl's
 * signature.
 *
 * Since pet-center M4 (issue #677) every pool is overridable through a
 * {@link VoicePoolsProvider}: the built-in pools are the fallback layer, and
 * voice packs (per-pet voice.json / the global .voice.json) layer their
 * pools on top at draw time.
 * @module @linxin666/dsh-pet/chatter
 */

/** Status copy scenes — the situations a session bubble can report. */
export type StatusScene =
  | 'prepare'
  | 'waiting'
  | 'thinking'
  | 'review'
  | 'toolResult'
  | 'done'
  | 'failed'
  | 'toolFailed'
  | 'maxTokens'
  | 'interrupted'
  | 'blocked'

/** While a scene persists, its copy advances on this cadence (ms). */
export const STATUS_ROTATE_MS = 4000

/** Fixed-copy pools per status scene (first line = legacy wording). */
export const STATUS_POOLS: Readonly<Record<StatusScene, readonly string[]>> = {
  prepare: [
    '准备开始',
    '撸起袖子开工啦',
    '新一轮，出发～',
    '打起精神，开干！',
    '整理一下桌面，开始吧',
    '氧气充满，下潜开始～',
    '热身完毕，跃跃欲试',
    '开工仪式感已就位',
  ],
  waiting: [
    '等待模型响应',
    '呼叫大脑中，请稍等',
    '信号发射中，等一个回音',
    '灵感正在路上～',
    '竖起耳朵等回复',
    '大脑在咕噜咕噜加载',
    '等它伸个懒腰再开口',
    '模型：来了来了',
    '等一个灵感砸中我',
    '滴——等待连线中',
    '它在组织语言，别催',
    '等它热身完毕',
    '灵感快递派送中',
    '屏住呼吸等回复',
  ],
  thinking: [
    '正在思考',
    '嗯……让我想一想',
    '脑内风暴进行中',
    '思绪咕噜咕噜冒泡',
    '灵光集结中～',
    '眉头一皱，认真分析',
    '左脑右脑一起开会',
    '答案正在浮出水面',
    '盘一下，盘一下逻辑',
    '让子弹再飞一会儿',
    '别催别催，在想呢',
    '大脑转起来了',
    '让我把线索捋一捋',
    '脑内跑火车中',
    '小脑瓜高速运转',
    '让我琢磨琢磨',
    '翻翻脑子里的藏书',
    '让我嚼一嚼这个问题',
    '脑子在煮咖啡，马上好',
    '思考的鱼游来了',
    '让我康康这里面的门道',
    '正在盘逻辑链',
    '思绪整理收纳中',
    '嗯？有点意思……',
    '让思路沉淀一下',
    '脑内弹幕飞速滚动',
  ],
  review: [
    '整理回复中',
    '把想法写下来',
    '组织语言中～',
    '落笔成文，请稍候',
    '字斟句酌中',
    '把答案装进信封里',
    '遣词造句打磨中',
    '把思绪码成整整齐齐的字',
    '奋笔疾书中',
    '把最好的表达挑出来',
    '文字排版美容师上线',
    '收尾润色一下下',
  ],
  toolResult: [
    '处理工具结果',
    '看看带回了什么',
    '消化一下刚到的结果',
    '结果解读中～',
    '验收工具的成果',
    '把线索拼接起来',
    '战利品清点中',
    '这份结果有点东西',
    '把新情报归档',
    '结果到手，继续前进',
  ],
  done: [
    '完成啦',
    '搞定收工～',
    '任务达成，耶！',
    '这一轮圆满完成',
    '顺利抵达终点',
    '收工！求摸摸奖励',
    '交差！下一位',
    '齐活，漂亮收官',
    '拿下！击掌～',
    '稳了，满分交卷',
    '搞定，去喝口水',
    '完工咯，转个圈圈',
    '这一轮，我们配合满分',
    '妥了妥了，收工收工',
  ],
  failed: [
    '执行失败',
    '哎呀，中途卡住了',
    '这一步没能走完',
    '被小石头绊倒了',
    '半路翻车了，揉揉膝盖',
    '出了点岔子，缓缓再来',
  ],
  toolFailed: [
    '工具执行失败',
    '工具闹脾气了，哄哄它',
    '哎呀，工具掉链子了',
    '这个工具今天不太听话',
    '工具翻车了，扶起来继续',
    '没跑通，再来一次',
    '工具：我罢工三秒钟',
    '这一步摔了一跤，没事',
  ],
  maxTokens: [
    '达到输出上限',
    '话说到一半被截断了',
    '字数用完了，喘口气',
    '一口气说太满，缓缓',
  ],
  interrupted: [
    '执行意外中断',
    '哎呀，被意外打断了',
    '半路踩了急刹车',
    '被迫停下，意犹未尽',
  ],
  blocked: [
    '等待继续',
    '在这里等你发令',
    '暂停待命，随时出发',
    '蹲一个继续的指令',
  ],
}

/** Tool families for friendlier per-tool status copy. */
export type ToolCategory =
  | 'read'
  | 'write'
  | 'edit'
  | 'shell'
  | 'grep'
  | 'find'
  | 'ls'
  | 'webSearch'
  | 'webFetch'
  | 'mcp'
  | 'memory'
  | 'subagent'
  | 'todo'
  | 'browser'
  | 'git'
  | 'ask'
  | 'generic'

/** Every status scene key, in declaration order (voice-pack key allow-list). */
export const STATUS_SCENES: readonly StatusScene[] = [
  'prepare', 'waiting', 'thinking', 'review', 'toolResult', 'done',
  'failed', 'toolFailed', 'maxTokens', 'interrupted', 'blocked',
]

/** Every tool-family key, in declaration order (voice-pack key allow-list). */
export const TOOL_CATEGORIES: readonly ToolCategory[] = [
  'read', 'write', 'edit', 'shell', 'grep', 'find', 'ls', 'webSearch',
  'webFetch', 'mcp', 'memory', 'subagent', 'todo', 'browser', 'git', 'ask', 'generic',
]

/** Map a raw tool name onto its copy family (working-activity style regexes). */
export function toolCategory(toolName: string): ToolCategory {
  const name = toolName.toLowerCase()
  if (/mem0|recall|memory/.test(name)) return 'memory'
  if (/subagent|workflow|ralph|agent|task/.test(name)) return 'subagent'
  if (/web_search|websearch|search_web|exa|brave|tavily/.test(name)) return 'webSearch'
  if (/fetch|browser|playwright|chrome/.test(name)) return 'webFetch'
  if (/grep|search|rg/.test(name)) return 'grep'
  if (/glob|find/.test(name)) return 'find'
  if (/^ls$|list_dir|list/.test(name)) return 'ls'
  if (/ask_user|ask/.test(name)) return 'ask'
  if (/todo|plan/.test(name)) return 'todo'
  if (/git/.test(name)) return 'git'
  if (/mcp__|mcp/.test(name)) return 'mcp'
  if (/read|open|load|describe|inspect/.test(name)) return 'read'
  if (/edit|patch|replace|rename/.test(name)) return 'edit'
  if (/write|create|save/.test(name)) return 'write'
  if (/run_code|bash|shell|terminal|exec|command|ssh/.test(name)) return 'shell'
  return 'generic'
}

/**
 * Per-family tool status pools. '{tool}' interpolates the compact tool name,
 * '{hint}' the compact real-argument hint (both optional per line); the first
 * entry of every pool is the legacy '正在使用 {tool}' wording.
 */
export const TOOL_POOLS: Readonly<Record<ToolCategory, readonly string[]>> = {
  read: [
    '正在使用 {tool}',
    '翻翻 {hint}',
    '读一下 {hint}',
    '让我康康这个文件',
    '逐行品味 {hint}',
    '翻阅资料中～',
    '瞄一眼 {hint}',
    '把文件摊开看一看',
    '认真研读 {hint}',
  ],
  write: [
    '正在使用 {tool}',
    '写写写，写 {hint}',
    '下笔中～',
    '码字呢，别催',
    '写下 {hint}',
    '落笔成章',
    '把想法存进 {hint}',
    '开写开写',
    '存个文件压压惊',
  ],
  edit: [
    '正在使用 {tool}',
    '改改 {hint}',
    '修修补补中',
    '润色一下 {hint}',
    '改两行，就两行',
    '补一刀 {hint}',
    '动动手指改一改',
    '精雕细琢 {hint}',
    '微调一下下',
  ],
  shell: [
    '正在使用 {tool}',
    '跑跑 {hint}',
    '敲几行命令试试',
    '命令行走起：{hint}',
    '使唤终端跑个腿',
    '终端全速运转中',
    '敲回车！{hint}',
    '让命令飞一会儿',
    '去终端里探个究竟',
  ],
  grep: [
    '正在使用 {tool}',
    '搜搜 {hint}',
    '找找匹配：{hint}',
    '关键词走你',
    '在代码里挖一挖',
    '检索小雷达启动',
    '顺着 {hint} 追下去',
    '掘地三尺找一找',
    '过滤筛选中～',
  ],
  find: [
    '正在使用 {tool}',
    '找找文件 {hint}',
    '寻宝中～',
    '文件在哪里呀',
    '找啊找啊找文件',
    '把 {hint} 揪出来',
    '查找模式中',
  ],
  ls: [
    '正在使用 {tool}',
    '列个清单看看',
    '看看目录里有啥',
    '目录走起～',
    '瞟一眼文件夹',
    '数数这里有几个文件',
  ],
  webSearch: [
    '正在使用 {tool}',
    '网上搜搜 {hint}',
    '网络冲浪中',
    '帮你问问互联网',
    '搜一圈 {hint}',
    '去外面的世界打听打听',
    '查找资料中～',
    '情报收集模式开启',
  ],
  webFetch: [
    '正在使用 {tool}',
    '抓个页面看看',
    '拉取 {hint}',
    '扒拉一下网页',
    '取点内容回来',
    '打开 {hint} 瞅瞅',
  ],
  mcp: [
    '正在使用 {tool}',
    '连一下外部服务',
    '喊个外援来',
    '接个工具用用',
    '问问插件小助手',
    '外部力量接入中',
  ],
  memory: [
    '正在使用 {tool}',
    '翻翻小本本',
    '回想一下之前的事',
    '在记忆里挖一挖',
    '提取记忆碎片～',
    '我们之前的约定是……',
  ],
  subagent: [
    '正在使用 {tool}',
    '派个小弟去跑腿',
    '小助手出动！',
    '交给分身去办',
    '多线作战，分身出击',
    '召唤队友支援',
    '集思广益中～',
  ],
  todo: [
    '正在使用 {tool}',
    '列个待办清单',
    '写个小计划',
    '待办安排得明明白白',
    '打个勾，继续',
    '把任务排排坐',
  ],
  browser: [
    '正在使用 {tool}',
    '开个浏览器看看',
    '网页操作小能手',
    '替你点点页面',
    '浏览器跑腿中',
  ],
  git: [
    '正在使用 {tool}',
    '提交一下代码',
    '版本控制走起',
    '管管仓库',
    '给改动安个家',
  ],
  ask: [
    '正在使用 {tool}',
    '问你个事儿',
    '请教一下下',
    '等等，我需要确认',
    '这个问题得你拍板',
  ],
  generic: [
    '正在使用 {tool}',
    '召唤 {tool} 出击',
    '{tool} 工作中',
    '借助 {tool} 的力量',
    '拜托 {tool} 一下',
    '{tool}，启动！',
  ],
}

/** Pools for the parallel-tools line; '{n}' interpolates the running count. */
export const TOOL_REMAINING_POOL: readonly string[] = [
  '还有 {n} 个工具运行中',
  '{n} 路并进，分身们还在忙',
  '还有 {n} 位小助手在加班',
  '{n} 条战线同时推进中',
  '另 {n} 个工具在后台跑',
]

/**
 * A compact, human-readable hint of what a tool call actually touches —
 * the command, the path, the pattern, the query. Best-effort parse of the
 * raw arguments JSON; unknown shapes stay hintless. Capped short so the
 * bubble stays compact.
 */
export function toolArgHint(toolName: string, argumentsJson: string): string | undefined {
  let args: unknown
  try {
    args = JSON.parse(argumentsJson)
  } catch {
    return undefined
  }
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return undefined
  const record = args as Record<string, unknown>
  const category = toolCategory(toolName)
  const candidateKeys: readonly string[] = (() => {
    switch (category) {
      case 'shell': return ['command', 'code', 'cmd']
      case 'grep': return ['pattern', 'query', 'path']
      case 'find': return ['pattern', 'path', 'glob']
      case 'read': case 'write': case 'edit': return ['file_path', 'path', 'filePath', 'file']
      case 'webSearch': return ['query', 'q', 'keyword']
      case 'webFetch': case 'browser': return ['url', 'uri']
      case 'subagent': return ['description', 'label', 'prompt']
      case 'ls': return ['path', 'dir', 'directory']
      case 'git': return ['command', 'message']
      default: return ['command', 'query', 'path', 'file_path', 'description', 'title', 'name']
    }
  })()
  for (const key of candidateKeys) {
    const value = record[key]
    if (typeof value !== 'string') continue
    const compact = value.replace(/\s+/g, ' ').trim()
    if (compact === '') continue
    const base = compact.split('/').pop() ?? compact
    const shown = (category === 'read' || category === 'write' || category === 'edit') && base !== '' ? base : compact
    return shown.length <= 28 ? shown : shown.slice(0, 25) + '...'
  }
  return undefined
}

/**
 * Round-robin voice for status copy. Scene-keyed picks stay STABLE while the
 * same scene repeats (streaming chunks re-emit the same phase many times per
 * second, and rotating per chunk would make the bubble flicker), but advance
 * once the scene has persisted past the rotation cadence, so a long thinking
 * stretch keeps changing its wording.
 */
export class StatusVoice {
  private readonly pools: VoicePoolsProvider
  private readonly rotateMs: number
  private readonly counters = new Map<string, number>()
  private lastScene = ''
  private lastLine = ''
  private lastLineAt = Number.NEGATIVE_INFINITY

  constructor(pools: VoicePoolsProvider = () => BUILTIN_VOICE_PACK, rotateMs: number = STATUS_ROTATE_MS) {
    // Plain property assignment, not parameter properties: this module is
    // imported by scripts/ under node's strip-only mode (pet-center M4).
    this.pools = pools
    this.rotateMs = rotateMs
  }

  /** Draw the next line of one pool, advancing its round-robin cursor. */
  private draw(poolKey: string, pool: readonly string[]): string {
    const index = (this.counters.get(poolKey) ?? 0) % pool.length
    this.counters.set(poolKey, index + 1)
    return pool[index]!
  }

  /** Reuse the stable line or advance when the cadence elapsed. */
  private voice(scene: string, poolKey: string, pool: readonly string[], nowMs: number): string {
    if (scene === this.lastScene && nowMs - this.lastLineAt < this.rotateMs) return this.lastLine
    this.lastScene = scene
    this.lastLine = this.draw(poolKey, pool)
    this.lastLineAt = nowMs
    return this.lastLine
  }

  /**
   * A scene's effective pool: the voice-pack override when it carries lines,
   * else the built-in pool. Empty overrides fall back rather than blank the
   * bubble — a scene line always renders.
   */
  private scenePool(scene: StatusScene): readonly string[] {
    const override = this.pools().status?.[scene]
    return override !== undefined && override.length > 0 ? override : STATUS_POOLS[scene]
  }

  /** Status line for a phase scene. */
  scene(scene: StatusScene, nowMs: number): string {
    return this.voice('scene:' + scene, 'pool:' + scene, this.scenePool(scene), nowMs)
  }

  /** Status line for a tool call, with the real-argument hint when known. */
  tool(toolName: string, displayName: string, hint: string | undefined, nowMs: number): string {
    const category = toolCategory(toolName)
    const override = this.pools().tools?.[category]
    const pool = override !== undefined && override.length > 0 ? override : TOOL_POOLS[category]
    const line = this.voice('tool:' + category, 'tool:' + category, pool, nowMs)
    return line
      .replaceAll('{tool}', displayName)
      .replaceAll('{hint}', hint ?? displayName)
  }

  /** Status line while sibling tools still run (always reflects the count). */
  toolRemaining(count: number, nowMs: number): string {
    const override = this.pools().toolRemaining
    const pool = override !== undefined && override.length > 0 ? override : TOOL_REMAINING_POOL
    return this.voice('toolRemaining', 'toolRemaining', pool, nowMs)
      .replaceAll('{n}', String(count))
  }
}

/** The pet's outcome moments — woken by structured session results only. */
export type WhisperResult = 'pass' | 'fail' | 'done'

/** The situations a whisper can comment on — the pet's category awareness. */
export type WhisperCategory =
  | 'thinking'
  | 'writing'
  | 'reading'
  | 'editing'
  | 'running'
  | 'searching'
  | 'git'
  | 'delegating'
  | 'browsing'
  | 'generic'

/** Every whisper category key, in declaration order (voice-pack key allow-list). */
export const WHISPER_CATEGORIES: readonly WhisperCategory[] = [
  'thinking', 'writing', 'reading', 'editing', 'running', 'searching',
  'git', 'delegating', 'browsing', 'generic',
]

/** Every whisper outcome key, in declaration order (voice-pack key allow-list). */
export const WHISPER_RESULTS: readonly WhisperResult[] = ['pass', 'fail', 'done']

/** Murmur pacing: the cooldown between category whispers. */
export const WHISPER_COOLDOWN_MS = 9000
/** Outcome whispers get their own shorter cooldown so a real moment still speaks. */
export const WHISPER_RESULT_COOLDOWN_MS = 5000
/** How long a whisper stays on screen (host-side expiry). */
export const WHISPER_TTL_MS = 8000

/** Map a tool family onto the whisper category it belongs to. */
export function whisperCategoryOf(tool: ToolCategory): WhisperCategory {
  switch (tool) {
    case 'read':
    case 'grep':
    case 'find':
    case 'ls':
      return 'reading'
    case 'write':
    case 'edit':
      return 'editing'
    case 'shell':
      return 'running'
    case 'webSearch':
    case 'webFetch':
    case 'memory':
    case 'mcp':
      return 'searching'
    case 'git':
      return 'git'
    case 'subagent':
    case 'todo':
      return 'delegating'
    case 'browser':
      return 'browsing'
    case 'ask':
    case 'generic':
      return 'generic'
  }
}

/**
 * Whether a tool invocation looks like a test run. The whisper engine never
 * reads the model's prose (a discussion that merely mentions a keyword must
 * not wake a mood); a test-outcome mood is wanted only when a test tool
 * actually ran, so the projection marks the call at tool/call time and the
 * pass mood fires from the paired tool/result.
 */
export function looksLikeTestTool(name: string, argumentsText: string | undefined): boolean {
  const tool = name.toLowerCase()
  if (/(^|[\/_.-])(test|tests|spec|vitest|jest|pytest|mocha|playwright|cypress|karma)([\/_.-]|$)/.test(tool)) {
    return true
  }
  if (argumentsText === undefined) return false
  // Prefer the real command / code fields when the arguments parse; the raw
  // JSON fallback still catches model-produced shapes the parser misses.
  let haystack = argumentsText.toLowerCase()
  try {
    const parsed = JSON.parse(argumentsText) as unknown
    if (typeof parsed === 'object' && parsed !== null) {
      const record = parsed as Record<string, unknown>
      const command = record.command
      const code = record.code
      const picked = typeof command === 'string' && command !== ''
        ? command
        : typeof code === 'string' && code !== ''
          ? code
          : undefined
      if (picked !== undefined) haystack = picked.toLowerCase()
    }
  } catch {
    // Keep the raw text below.
  }
  return /\b(pnpm|npm|yarn|npx|bun|python)\s+(run\s+)?(test|tests?)\b/.test(haystack)
    || /\b(pytest|vitest|jest|mocha|cypress|playwright|go test|cargo test)\b/.test(haystack)
}

/** Category-level inner-whisper pools — the pet knows roughly what is going on. */
export const WHISPER_CATEGORY_POOLS: Readonly<Record<WhisperCategory, readonly string[]>> = {
  thinking: [
    '先在脑子里搭个框架',
    '它在心里打草稿，我垫着脚看',
    '思路在一颗一颗冒泡',
    '脑内开会中，都别抢话筒',
    '先想清楚，再动手不迟',
    '草稿纸已经画满了',
    '让我听听它下一步打算',
    '嗯，方案在成型了',
  ],
  writing: [
    '落笔成文，我旁边听着',
    '句子排着队往外走',
    '把想法一句句摆整齐',
    '它在组织语言，我打打气',
    '写回复呢，不催',
    '字斟句酌，快好了',
  ],
  reading: [
    '翻资料呢，我保持安静',
    '一行一行读，不跳页',
    '在纸堆里找线索',
    '眼珠子跟着字跑',
    '边读边做记号',
    '翻箱倒柜找重点',
  ],
  editing: [
    '动手改起来了，手稳一点',
    '这里补一笔，那边修一修',
    '在改东西，听不到声音才怪',
    '落笔小心，别有错别字',
    '改写的节奏，我听得见',
    '刷刷地改，一行都没跑',
  ],
  running: [
    '跑起来了跑起来了',
    '命令敲出去，等个回响',
    '在跑什么呢，我踮脚看',
    '输出开始冒烟了',
    '它在跑活，我不吵',
    '盯着输出，蹲一个结果',
    '这波跑完就靠它了',
  ],
  searching: [
    '去外面捞点信息',
    '翻翻记忆库，等我一小会儿',
    '顺着网线找线索',
    '把老账翻出来对一对',
    '情报在路上了',
    '搜索引擎当跑腿',
  ],
  git: [
    '版本在往前迈步',
    '改动排队上车',
    '提交历史在长个子',
    '分支合并，神清气爽',
    '记录都焊在时间线上',
  ],
  delegating: [
    '派了活儿出去，等回话',
    '清单列好，一件件来',
    '任务拆开分了组',
    '手下的伙计在远处跑着',
    '分工完毕，各司其职',
  ],
  browsing: [
    '它在看网页，我偷瞄两眼',
    '页面一张张翻过去',
    '网页里翻答案呢',
    '这网速，我先歇会儿',
  ],
  generic: [
    '这波活儿，我陪着',
    '又开工了，我盯梢',
    '它忙它的，我守着',
    '不打扰，就安静待着',
    '有活儿就有我',
  ],
}

/** The pet's outcome reactions — woken by structured session results only. */
export const WHISPER_RESULT_POOLS: Readonly<Record<WhisperResult, readonly string[]>> = {
  pass: [
    '全绿！亮瞎我眼了',
    '测试过了，击掌～',
    '绿灯一排排，看着就舒坦',
    '稳了稳了，这波稳得很',
    '全绿，奖励自己一口小鱼干',
    '这波测试，赢得干脆',
  ],
  fail: [
    '哎呀，踩到小石子了',
    '这报错我盯上它了',
    '别慌，先看它在喊什么',
    '修好它，今天才不算白干',
    '又一次踩坑，老熟人了',
    '问题不大，就是有点问题',
  ],
  done: [
    '搞定，收工～',
    '又翻过一页，踏实',
    '努力没白费，开心',
    '任务清零，舒服',
    '攻下一城，转个圈',
    '收工收工，今天圆满',
  ],
}

/**
 * Voice-pack overrides (pet-center M4, issue #677): the content a voice
 * pack can replace, one pool at a time. Every field is optional — missing
 * keys inherit the built-in pools. Resolution happens at draw time through
 * a provider function, so swapping pets (or editing the global file) re-
 * voices live engines without rebuilding them.
 *
 * Override semantics:
 *  - status/tools/toolRemaining: a non-empty override replaces the built-in
 *    pool for that key; an empty override falls back to the built-in pool
 *    (a scene line always renders, so it can never be blanked).
 *  - whispers.categories / whispers.results: a key replaces that key's
 *    built-in pool; an explicit empty array mutes that channel (a whisper
 *    can always be silenced, unlike a scene line).
 */
export interface VoicePackOverrides {
  /** Status copy pools by scene; each key replaces that scene's pool. */
  status?: Partial<Record<StatusScene, readonly string[]>>
  /** Tool copy pools by family; each key replaces that family's pool. */
  tools?: Partial<Record<ToolCategory, readonly string[]>>
  /** The parallel-tools count line pool ({n} interpolates the count). */
  toolRemaining?: readonly string[]
  /** Murmur pools; each key replaces the built-in pool as a whole. */
  whispers?: {
    /** Category pools; a key replaces that category's pool (empty mutes it). */
    categories?: Partial<Record<WhisperCategory, readonly string[]>>
    /** Outcome pools (test green / error / completion); empty mutes the outcome. */
    results?: Partial<Record<WhisperResult, readonly string[]>>
  }
}

/** Read the current effective voice-pack overrides (draw-time resolution). */
export type VoicePoolsProvider = () => VoicePackOverrides

/** The built-in voice pack: the plugin's default copy. */
export const BUILTIN_VOICE_PACK: VoicePackOverrides = {
  status: STATUS_POOLS,
  tools: TOOL_POOLS,
  toolRemaining: TOOL_REMAINING_POOL,
  whispers: { categories: WHISPER_CATEGORY_POOLS, results: WHISPER_RESULT_POOLS },
}

/**
 * The murmur engine (碎碎念): the pet's inner voice while sessions work.
 * Category awareness: the projection feeds the current situation (thinking /
 * writing / the running tool family), and the engine answers with a line from
 * that category's pool — so a whisper always roughly knows what is going on
 * without ever quoting real content (no tool names, no paths, no model text).
 * Outcome moments (test green, tool errors, turn completion) fire from the
 * structured result events, never from output text, so a mood cannot mis-
 * fire on a discussion that merely mentions a keyword. A cooldown keeps
 * whispers occasional; all picks are round-robin so tests reproduce exact
 * lines. The voice-pack provider (pet-center M4) swaps the pools at draw
 * time, so a pet switch re-voices live engines in place.
 */
export class WhisperEngine {
  private readonly pools: VoicePoolsProvider
  private readonly categoryCooldownMs: number
  private readonly resultCooldownMs: number
  private readonly categoryCursor = new Map<WhisperCategory, number>()
  private readonly resultCursor = new Map<WhisperResult, number>()
  private lastWhisperAt = Number.NEGATIVE_INFINITY

  constructor(
    pools: VoicePoolsProvider = () => BUILTIN_VOICE_PACK,
    categoryCooldownMs: number = WHISPER_COOLDOWN_MS,
    resultCooldownMs: number = WHISPER_RESULT_COOLDOWN_MS,
  ) {
    this.pools = pools
    this.categoryCooldownMs = categoryCooldownMs
    this.resultCooldownMs = resultCooldownMs
  }

  /** Effective category pool (an explicit empty override mutes the category). */
  private categoryPool(category: WhisperCategory): readonly string[] {
    const override = this.pools().whispers?.categories?.[category]
    return override === undefined ? WHISPER_CATEGORY_POOLS[category]! : override
  }

  /** Effective outcome pool (an explicit empty override mutes the outcome). */
  private resultPool(kind: WhisperResult): readonly string[] {
    const override = this.pools().whispers?.results?.[kind]
    return override === undefined ? WHISPER_RESULT_POOLS[kind]! : override
  }

  /**
   * Feed one situation while a session works. Returns the whisper to show,
   * or undefined when the moment stays quiet (cooldown, or the category
   * pool is muted).
   */
  feed(category: WhisperCategory, nowMs: number): string | undefined {
    if (nowMs - this.lastWhisperAt < this.categoryCooldownMs) return undefined
    const pool = this.categoryPool(category)
    if (pool.length === 0) return undefined
    const index = (this.categoryCursor.get(category) ?? 0) % pool.length
    this.categoryCursor.set(category, index + 1)
    return this.speak(pool[index]!, nowMs)
  }

  /**
   * Feed one structured outcome (test green / tool failure / turn
   * completion). Outcomes carry their own shorter cooldown so the emotional
   * moment is heard unless another whisper just spoke.
   */
  result(kind: WhisperResult, nowMs: number): string | undefined {
    if (nowMs - this.lastWhisperAt < this.resultCooldownMs) return undefined
    const pool = this.resultPool(kind)
    if (pool.length === 0) return undefined
    const index = (this.resultCursor.get(kind) ?? 0) % pool.length
    this.resultCursor.set(kind, index + 1)
    return this.speak(pool[index]!, nowMs)
  }

  private speak(line: string, nowMs: number): string {
    this.lastWhisperAt = nowMs
    return line
  }
}
