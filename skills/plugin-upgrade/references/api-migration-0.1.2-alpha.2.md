# 接口迁移实战 · 0.1.1-rc.2 → 0.1.2-alpha.2

> 定位：面向插件作者的接口 ledger。重点回答三件事：哪些接口变了、旧写法会怎样
> 失败、目标版本的 best practice 是什么。安装流程、产品功能清单和 UI 变化不在本文展开。
>
> 精确走廊：`dsh-v0.1.1-rc.2`
> (`b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`) → `dsh-v0.1.2-alpha.1`
> (`cd5ef8148158c3a752a658978873241fdf8e2bbc`) → `dsh-v0.1.2-alpha.2`
> (`0a53fb55bea101816fa226bb964ae2bed71c343b`)。
>
> 版本状态：截至 2026-08-30，上游 `0.1.2` 系列的最新 tag 是
> `dsh-v0.1.2-alpha.2`，尚无 `dsh-v0.1.2` final tag。正式版发布后必须重新核对
> package exports、声明类型、实现与测试，不能把本文直接标成 final 兼容结论。

## 目录

- 一页结论
- API-01 · APIProxy 按运行平面迁到领域服务或 `ctx.remote` projection
  - Host / Web Client 最小正确写法
  - 常用 consumer ledger
  - Best practice
  - 验证
- API-02 · `RemoteResult` 版本边界与 alpha.2 `RemoteError`
  - 先把版本归属说清楚
  - Consumer 最新写法
  - Remote owner 最新写法
  - Best practice
  - 验证
- API-03 · Settings helper 移除与 provider-owned lifecycle
  - 升级前
  - 升级后
  - Best practice
  - 验证
- API-04 · 固定 Host facts 统一到 `ctx.remote.$host`
  - alpha.2 写法
  - Best practice
  - 验证
- API-05 · `SessionEvent.ignorable` 恢复了，但第三方写入面还没补齐
  - 危险旧写法
  - Best practice
  - 验证
- API-06 · Headless 的 argv 与进程输出契约
  - 正确调用与解释
  - Best practice
  - 最小 stub 矩阵
- API-07 · Package export 不等于发布物存在
  - Best practice
  - 验证
- API-08 · `cordis.patch.yml` 是 composition，不是源码 patch
  - Best practice
  - 验证
- API-09 · Plugin inventory 新增可选 `agentPresets`
  - Best practice
  - 验证
- CFG-01 · Code Mode 精确迁到 PTC mode
  - 精确 ledger
- Skill 输出这类迁移报告时应使用的结构
  - <接口名>
- 最小验证梯度

## 一页结论

| 接口面 | 旧写法 | 旧写法在目标版本的症状 | alpha.2 best practice |
|---|---|---|---|
| Host APIProxy consumer | APIProxy / `executeRemote(...)` | `apiProxy` 消失；机械改成 `remote` 会永久 pending | 跳过 Client gateway，直接注入 owning domain service，例如 `llm` / `session` / `settings` |
| Web Client APIProxy consumer | APIProxy / `executeRemote(...)` | 旧 package/service 消失；猜错 namespace 或方法会装配失败 | 使用生成的 `ctx.remote.<namespace>.<method>`，声明 `remote` 与具体 namespace 注入 |
| Unary failure | 只写 `try/catch`；解析 message；`instanceof` | `ok: false` 被当成功；跨 bundle 漏判；错误码分支失效 | 先分支 `result.ok`，按 `result.error.code` 处理；只在 stream/显式抛出等 catch boundary 用 `isRemoteFailure` |
| Failure classes | `TypertRemoteFailure` / `TypertLookupFailure` / `RemoteStreamError` | removed export 或 typecheck 失败；无域前缀 code 不再匹配 | owner 抛 `RemoteError('<domain>/<reason>', message, details)`；details 由 code 收窄 |
| Settings namespace | `settingsNamespace('x')` | `TS2305` / “no exported member” | 直接使用符合文法的字符串字面量，例如 `const NS = 'my-plugin'` |
| Settings lifecycle | 独立 `installSettingsSection(...)` | removed export；只改名字会丢 provider attach/detach 生命周期 | 在 `ctx.inject(['settings'], ...)` 内调用 `settingsCtx.settings.installSection(owner, ...)` |
| Host facts | 注入 `connection` 并读 generation snapshot | 与 transport 生命周期耦合；alpha.2 已有正式入口 | 读 `ctx.remote.$host.home/isLoopback`；重连时响应 `connection/reset` |
| SessionEvent | 看到 alpha.2 恢复 `ignorable` 就直接 `Session.append()` 自定义事件 | 写入现场成功，cold load 时因事件无 marker 被整条拒读 | alpha.2 只恢复 envelope 字段；公开 `Session.append()` 尚不能设置它，仓库外插件改用自有 sidecar/store |
| Headless process | `dsh headless`、`-p`、JSONL stdout、stderr 非空即失败 | argv 不被接受、JSON parse 失败、成功任务被误报 | `dsh --profile headless "task"`；stdout 是最终文本，stderr 是 reasoning/诊断，以退出码为准 |
| Package subpath | 看到 `exports["./src/*"]` 就直接导入 | 发布包可能根本不含 `src`，运行时报 module not found | 同时核对 exports、`files` 和实际 packed artifact；优先 `.` / `/client` 等稳定入口 |
| `cordis.patch.yml` | 按文件名当源码 patch | 误报并生成错误迁移任务 | 先按官方 Profile composition overlay 处理；只有真实替换宿主源码时才归源码 patch |
| Structured questions answerer | `userQuestions.registerProvider({ ask })` | attach 抛 `TypeError`；提问无人 answer（`NO_PROVIDER`） | `ctx.on('user-questions/request', (req, next) => answer)`；不带 agent 的 `ask()` 在服务自身 ctx 派发，同 fiber 树其他 entry 的监听者收不到（详见 [DSH-0.1.2-A1-20](v0.1.2-alpha.1.md)） |
| Type export drift | `CallId` / `JsonValue` / `collectSessionTitleMessages` / `todo/write` 类型声明 | typecheck 批量 TS2305 / TS2614 | 按 ledger 迁移：`ToolCallId`（dsh-llm 根导出）、`@deepseek-ai/dsh-util-values`、本地同语义折叠、本地 event-map 合并（详见 [rollup R-07](rollup-0.1.2.md)） |

## API-01 · APIProxy 按运行平面迁到领域服务或 `ctx.remote` projection

- **适用对象**：直接消费旧 APIProxy 的 Web Client、Host 集成或启动包装层。
- **会怎么炸**：旧 APIProxy package/service 不再存在。Host 侧把 `apiProxy` 机械替换为
  `remote` 会永久等待只存在于 Client face 的服务；Web Client 照搬设计笔记中的 wire route
  又容易写出目标 tag 中不存在的属性，例如 `ctx.remote.sessionTitle.rename`。
- **核心规则**：先判定运行平面。Host 插件跳过 Client gateway，直接注入旧调用背后的
  owning domain service；Web Client 才使用目标 tag 生成的 consumer projection，不自己拼
  `namespace/method` 字符串。alpha.2 的 Client API Remotes assembly 来自
  `@deepseek-ai/dsh-api-remotes/client`。

### Host / Web Client 最小正确写法

Host 侧直接使用 owning domain service；下例的 `llm` / `listProviders()` 已有可执行契约，
其他旧 APIProxy 调用必须按目标 tag 逐项确认，不能从 Client Remote 表反推：

```ts
export const inject = ['llm']
const providers = ctx.llm.listProviders()
```

Web Client 侧使用生成 projection：

```ts
import type { Context } from '@deepseek-ai/cordis'
// 类型合并：让当前编译 face 看见 ctx.remote 的已选择 namespaces。
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'

export const inject = ['remote', 'remote.session']

export async function renameSession(
  ctx: Context,
  sessionId: SessionId,
  title: string,
): Promise<void> {
  const result = await ctx.remote.session.rename({ sessionId, title })
  if (!result.ok) throw result.error
}
```

这里的实际路径是 `ctx.remote.session.rename(...)`；alpha.1 架构笔记中的
`sessionTitle/rename` 是设计过程文本，不能凌驾于同一 tag 的实现、生成 projection 和
consumer 测试。

### 常用 consumer ledger

| rc.2 / 历史 consumer 操作 | alpha.2 consumer projection | 迁移注意点 |
|---|---|---|
| `connection.api.sessions.rename({ sessionId, title })` | `ctx.remote.session.rename({ sessionId, title })` | 不存在 `ctx.remote.sessionTitle.rename` |
| `ctx.remote.commands.list(sessionId)` | 路径不变 | rc.2 已是 Remote；consumer 传 Session id，Host scope 解析 Agent |
| `ctx.remote.commands.execute(sessionId, line, images)` | 路径不变 | rc.2 已是 Remote；`images` 必传，无图传 `[]` |
| `connection.api.llm.providers({})` | `ctx.remote.llm.listProviders()` 和 `.listConfigurableProviders()` | 两个调用各自返回 `RemoteResult`，按 provider id 组合 live 与 configurable directory |
| `llm.discoverModels` | `ctx.remote.llm.discoverModels(settingsNs, request)` | 不写入 settings/credentials；返回候选模型 |
| `llm.models` | `ctx.remote.session.modelCatalog()` | 从 LLM 域移到 Session 域 |
| `credentials.describe` | `ctx.remote.credentials.describe(refs)` | 返回描述信息，不返回 secret 值 |
| `credentials.set/unset` | `ctx.remote.credentials.set(ref, value)` / `.unset(ref)` | secret 只在写入方向过线 |
| `settings.describe` | `ctx.remote.settings.describe()` | 返回脱敏 namespace view |
| `settings.update/replace/mutate` | `.update(ns, patch, expectedRevision)` / `.replace(ns, section, expectedRevision)` / `.mutate(ns, ops, expectedRevision)` | 严格 positional；不用 CAS 也显式传 `undefined`，不要整对象覆盖未知字段 |
| `settings.openDocument` | `ctx.remote.settings.openSettingsDocument(signal)` | native open capability 由 Host 拥有 |
| `agentPreset.read` | `ctx.remote.agentPresets.read(id)` | consumer 方法名是 `read` |
| `agentPreset.copy` | `ctx.remote.agentPresets.copy(from, id, name?)` | `name` 可选；成功值是 `void`，旧 APIProxy 返回的 preset id 不再存在 |
| `connection.api.agentPresets.remove({ agentPreset: id })` | `ctx.remote.agentPresets.deletePreset(id)` | 精确更名为 `deletePreset`，参数也从对象改为字符串 |
| `agentPreset.openDocument` | `ctx.remote.settings.openAgentPresetDirectory(id, signal)` | 移到 Settings 域 |
| `subagent.interrupt` | `ctx.remote.subagents.interruptByParent(childId, parentId, 'continuable')` | 保留 durable parent authority |
| `connection.api.workspace.list({})` | raw：`ctx.remote.workspace.follow(signal)` | 已变为 baseline/delta stream；普通 UI 优先消费 `ctx.workspaces` projection |
| `workspace.insertSessionBefore` | `ctx.remote.workspace.insertSessionBefore(request)` | unary mutation，处理 `RemoteResult` |
| `workspace.archiveSession` | `ctx.remote.workspace.archiveSession(request)` | unary mutation，处理 `RemoteResult` |
| `connection.api.skills.list({ sessionId }, signal)` | `ctx.remote.skills.list({ sessionId }, signal)` | 读取 catalog，不激活 cold Agent |
| `ctx.remote.fileReferences.list(sessionId, query, signal)` | 路径不变 | rc.2 已是 Remote；owner 移到 Session Controller adapter |
| `connection.api.host.openPath({ path })` | `ctx.remote.session.openWorkspacePath({ path })` | path 先由 Session-aware client 做 workspace resolution |
| `connection.hostDescription.getSnapshot()?.home` | `ctx.remote.$host.home` / `.isLoopback` | `$host` 是普通 facts getter，不是 unary RemoteResult |
| `session.export` | `GET/HEAD /api/session.export` | 流式 Fetch route，不是 JSON Remote；仍受 browser session/Host/Origin 认证 |

### Best practice

1. 先确认代码运行在哪个 face：Host、Web Client 还是普通 Cordis plugin。
2. Host 直接注入 owning domain service，不声明只存在于 Client face 的 `remote`；也不要把
   Host-only package 拉进 Client bundle。
3. Client contribution 显式声明 `remote` 和实际使用的 `remote.<namespace>`；不要依赖
   其他插件碰巧先挂载。
4. 以目标 tag 的 package exports、`.d.ts`、实现和 consumer 测试为准；架构笔记只解释
   意图，不是生成 API 的替代品。
5. `workspace.follow` 等 stream 使用 owning package 已提供的 reconnect/snapshot adapter；
   普通 UI 使用 `ctx.workspaces`，不要自行重写 generation baseline、mutation echo/race 或定时
   `list()`。

### 验证

- Host entry 注入真实领域服务后必须 active、不等待 `remote`，并执行一次对应领域方法；
- Web Client typecheck 必须使用真实 `Context` 与生成 projection，不能用 `ctx: any` 掩盖错误路径；
- 每个 unary 命中至少覆盖 `ok: true` 和一个领域错误码；支持 `AbortSignal` 的调用再覆盖取消；
- 验证 Remote contribution 未挂载时会明确暴露装配错误，而不是永久 pending；
- stream 覆盖 opening snapshot、增量、取消、carrier reconnect 与 teardown。

- **来源**：
  [alpha.2 SessionController 实际 Remote 方法](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.2/packages/api/session-controller/src/index.ts) ·
  [alpha.2 API Remotes Client assembly](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.2/packages/api/remotes/src/client/index.ts) ·
  [alpha.2 Workspace Remote owner](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.2/packages/api/workspace-controller/src/index.ts) ·
  [alpha.2 实际 rename consumer](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.2/packages/api/session-controller/src/client/sessions/session.ts) ·
  [本仓库 Host / Web Client face 契约](../examples/face-contracts/README.md)

## API-02 · `RemoteResult` 版本边界与 alpha.2 `RemoteError`

- **适用对象**：消费 `ctx.remote` 的 Client，以及定义/转发 Remote 的 Host plugin。
- **会怎么炸**：
  - 只靠 `catch` 处理业务失败，会把 `{ ok: false }` 当普通成功继续执行；
  - alpha.1 owner-side wrapper/catch 若继续读取 `error.failure.code`，换成 alpha.2
    `RemoteError` 后会读到 `undefined`；
  - `instanceof RemoteError` 跨 bundle、worker 或 realm 会漏判；
  - 导入 `TypertRemoteFailure`、`TypertLookupFailure` 或 `RemoteStreamError` 会 typecheck
    失败；
  - 继续匹配 `internal`、`cancelled`、`session-not-found` 等无域前缀旧 code，会落入
    default 分支。

### 先把版本归属说清楚

`RemoteResult<T>` 在 alpha.1 已经存在：生成的 unary Remote 解析为
`{ ok: true, value } | { ok: false, error }`。alpha.2 的 breaking change 是统一
failure vocabulary：`RemoteFailure` 变成按 code 收窄的 `RemoteError` union，code 改为
`<domain>/<reason>`，并删除旧 wrapper/stream error surface。不要把“开始处理 `result.ok`”
误写成 alpha.2 才需要做的迁移。Unary consumer 在 alpha.1 就应读 `result.error.code`；变化的
是 owner/catch 不再透过旧 wrapper 的 `.failure` 读取。

### Consumer 最新写法

```ts
const result = await ctx.remote.session.rename({ sessionId, title })

if (!result.ok) {
  switch (result.error.code) {
    case 'gateway/cancelled':
      // 结束当前操作，或沿调用链传播取消；不要包装成通用失败后重试。
      return
    case 'session/not-found':
      showSessionMissing(result.error.details.sessionId)
      return
    case 'session/agent-busy':
      showBusyState()
      return
    default:
      // 保留 code/details；未知码与 gateway/internal 默认不自动重试。
      reportRemoteFailure(result.error)
      return
  }
}

useRenamedSession(result.value)
```

普通业务、carrier 与取消失败进入 `ok: false`。arity、未挂载 method、缺 Context adapter
等装配或本地编程错误仍可能 reject；不要用一个宽泛 catch 把这些缺陷伪装成可重试业务
错误。

Unary consumer 主动 `throw result.error` 后，或 stream 抛出 terminal Remote failure 时，外层
catch boundary 使用结构 guard：

```ts
import { isRemoteFailure } from '@deepseek-ai/dsh-api-gateway/client'

try {
  await operationThatMayThrowRemoteFailure()
} catch (error) {
  if (isRemoteFailure(error)) {
    handleByCode(error.code, error.details)
    return
  }
  throw error
}
```

### Remote owner 最新写法

```ts
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    'my-plugin/not-found': { readonly id: string }
  }
}

throw new RemoteError(
  'my-plugin/not-found',
  `item "${id}" was not found`,
  { id },
)
```

### Best practice

1. 分支永远读 `code`，不要解析 `message`，不要依赖 class identity。
2. code 的声明放在每个 producer 都能看到的最低公共 package；命名使用
   `<domain>/<reason>`。
3. `gateway/cancelled` 结束或传播取消；`gateway/internal` 和未知码保留原始诊断并上报，
   默认不重试。
4. 重试必须同时满足：错误码明确瞬态、操作幂等、用户策略允许。写操作不能因 transport
   不确定性盲目重放。
5. 测试 double 使用真实 `RemoteError`/`RemoteResult` 形状，不返回只有 message 的普通
   object。`RemoteError` 是真实 `Error`，断言 code/details 时优先 `toMatchObject`，不要把它
   当成旧的普通字面量对象做完全相等比较。

### 验证

- Consumer：成功、领域失败、`gateway/cancelled`、`gateway/internal`、未知 code；
- Owner：code/details 的 module augmentation 能正确收窄；
- Boundary：显式抛出的 `result.error` 可被 `isRemoteFailure` 识别；普通 Error 原样抛出；
- 跨 bundle/worker 测试不使用 `instanceof`。

- **来源**：
  [alpha.1 已有的 `RemoteResult<T>` 定义](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.1/packages/typert/protocol/src/types.ts) ·
  [alpha.2 RemoteError vocabulary 决策](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.2/.agents/notes/implemented/architecture/2026-08-28-ctx-remote-failure-vocabulary.md) ·
  [alpha.2 `RemoteError` 实现](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.2/packages/typert/protocol/src/remote-error.ts)

## API-03 · Settings helper 移除与 provider-owned lifecycle

- **适用对象**：导入 `@deepseek-ai/dsh-settings` 的 Host/settings consumer plugin。
- **会怎么炸**：
  - `import { settingsNamespace } ...` 或 `import { installSettingsSection } ...` 报 removed
    export；
  - 把 `installSettingsSection(...)` 机械替换成同名 method、却不放在
    `ctx.inject(['settings'], ...)` 内，会破坏 optional provider attach/detach；
  - 从 `@deepseek-ai/dsh-settings` 继续导入 `deepEqualJson` 会失败，它已移到
    `@deepseek-ai/dsh-util-values`。

### 升级前

```ts
import {
  installSettingsSection,
  settingsNamespace,
} from '@deepseek-ai/dsh-settings'

const NS = settingsNamespace('my-plugin')
installSettingsSection(ctx, NS, Config, config, hooks)
```

### 升级后

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import { deepEqualJson } from '@deepseek-ai/dsh-util-values'
import z from '@deepseek-ai/schemastery'

const NS = 'my-plugin'
interface Config {
  enabled: boolean
}
const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
})

export function apply(ctx: Context, config: Config): void {
  let current = () => config
  let registered = config

  const refreshRegistrationFacts = (): void => {
    const next = current()
    if (deepEqualJson(registered, next)) return
    // 在这里替换真正捕获了配置快照的注册事实。
    registered = next
  }

  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, NS, Config, config, {
      setSource: (source) => {
        current = source
      },
      onChange: refreshRegistrationFacts,
    })
  })
}
```

### Best practice

1. namespace 使用小写字母开头，后续只含小写字母、数字和 `-`；字符串字面量在
   TypeScript 层检查，动态字符串在运行时检查。
2. 不要用 `as SettingsNamespace` 绕过 grammar；直接传 literal，保留推断。
3. `owner` 传消费插件自己的 `ctx`，调用 method 的对象是当前 attached
   `settingsCtx.settings`；两者不是同一个生命周期角色。
4. `setSource` 保存当前 authoritative getter；provider detach 后 helper 会回退到
   composition entry。`onChange` 只重建真正依赖配置的注册事实。
5. 需要 JSON equality/value helpers 时从 owning util package 导入，不依赖 Settings
   package 的历史顺带导出。

### 验证

- typecheck 不再引用三个旧导出；
- 合法 literal 注册成功，非法动态 namespace 抛 `TypeError`；
- settings provider attach 时读取 resolved scope，detach 时回退 composition entry；
- consumer 自身 unload 后不执行错误 fallback；disposer 和 watcher 不泄漏。

- **来源**：
  [alpha.1 Settings 入口](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.1/packages/settings/settings/src/index.ts) ·
  [alpha.2 Settings 入口](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.2/packages/settings/settings/src/index.ts) ·
  [alpha.2 官方 Settings README](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.2/packages/settings/settings/README.md)

> 兼容层不等于官方接口：DSH Desktop 当前可能通过本地 compatibility patch 暂时恢复
> 这些 deprecated helper。插件在 Desktop checkout 内 typecheck/运行通过，不能证明它兼容
> 未打补丁的官方 alpha.2；迁移与发布验证必须再使用纯官方 package artifact。

## API-04 · 固定 Host facts 统一到 `ctx.remote.$host`

- **适用对象**：Web Client 中只为读取 Host home 或 loopback 状态而注入
  `connection` 的插件。
- **会怎么炸**：把 `$host` 反投影到 alpha.1 会 typecheck 失败；在 alpha.2 继续读取
  generation store 虽可能工作，却让业务 package 依赖 carrier 内部生命周期。

### alpha.2 写法

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'

export const inject = ['remote']

export function apply(ctx: Context): void {
  const refreshHostDependentState = (): void => {
    const { home, isLoopback } = ctx.remote.$host
    // home 在第一个 ready frame 前可以是 undefined；在这里刷新依赖这些 facts 的状态。
    void home
    void isLoopback
  }

  refreshHostDependentState()
  ctx.on('connection/reset', refreshHostDependentState)
}
```

### Best practice

- `$host` 是 identity-stable 的普通 getter，不是 store、没有 subscribe、也没有 generation
  counter；不要轮询。
- 需要在重连后重读时响应 `connection/reset`，或依赖 owning domain 自己的 invalidation。
- alpha.1 compatibility branch 只能用 generation-ready snapshot；不要让 alpha.1 与
  alpha.2 共用一个未经 feature detection/编译隔离的源文件。

### 验证

- ready 前 `home === undefined`，ready 后为 Host home；
- loopback 和 non-loopback carrier 的布尔值正确；
- 重连只触发一次业务刷新，没有轮询 timer 或重复 listener。

- **来源**：
  [alpha.2 Gateway Client `$host` 实现](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.2/packages/api/gateway/src/client/index.ts) ·
  [Remote failure vocabulary note 的 Fixed Host facts](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.2/.agents/notes/implemented/architecture/2026-08-28-ctx-remote-failure-vocabulary.md)

## API-05 · `SessionEvent.ignorable` 恢复了，但第三方写入面还没补齐

- **适用对象**：想通过 `SessionEventMap` augmentation + `Session.append()` 持久化插件状态，
  或实现 persistence/reload/transport 的插件。
- **会怎么炸**：alpha.2 虽恢复了 event envelope 上的 `ignorable?: true`，公开
  `Session.append()` 的参数仍只有 `type`、`data`，以及仅 surface event 可用的
  `SurfaceIntent`；它不会把 `ignorable` 写进事件。仓库外自定义 type 因而可能 live append
  正常、持久化正常，却在下次 cold load 时抛 `SessionFormatUnsupportedError`，整条 Session
  拒绝恢复。这是 silent write / loud read，不能靠一次 live smoke 发现。

### 危险旧写法

```ts
declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    'my-plugin/state': { readonly value: string }
  }
}

// 这行可能成功，但 alpha.2 的 append 不会为事件写入 ignorable。
session.append('my-plugin/state', { value: 'x' })
```

`ignorable` 的 envelope 语义本身仍然有效：reader 遇到不认识的 type 时，只有该事件已经
带 `ignorable: true` 才允许继续；字段缺失意味着 required。问题是 alpha.2 尚未给普通
第三方 producer 提供受支持的 append/registration surface，不能通过 cast、解冻对象或手改
JSONL 绕过去。

### Best practice

1. 仓库外插件在 alpha.2 不要用自定义 `SessionEventMap` + `Session.append()` 持久化状态；
   使用插件自有 sidecar/store，并按 Session id 关联。
2. 能复用已有已知 event 时只复用真实相同的语义；不要把插件状态伪装成 model-visible 或
   core event。
3. `ignorable: true` 只适合“没有该插件的 reader 不解释此 type，仍能正确重建 Session”的
   附加信息。插件存在时可以消费它；但它的缺席不能改变 core/durable Session 语义。
4. persistence/transport owner 必须端到端保留已存在的 marker；未知且无 marker 的事件继续
   fail closed。
5. 只有上游提供受支持的 `append(..., { ignorable: true })`，或另一种能把 omission-safety
   marker 持久化、且不依赖当前 composition 才能判定兼容性的正式机制后，才重新评估第三方
   持久事件。仅注册 event name 不够；不要把字段恢复写成该能力已经交付。

### 验证

- 对任何现有自定义 append 做真正的 persist → process restart/cold load 测试，不能只测 live
  append；
- alpha.2 仓库外插件若命中这一路径，应把 cold-load refusal 当成迁移阻断并撤掉该持久化
  方案，而不是接受或吞掉错误；
- persistence/transport owner 仍需覆盖“已有 marker 的未知 event 可读”和“无 marker 的未知
  required event 明确拒绝”。

- **来源**：
  [alpha.2 `SessionEvent` 类型](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.2/packages/core/session/src/types.ts) ·
  [alpha.2 `Session.append()` 实现](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.2/packages/core/session/src/index.ts) ·
  [cold-load unknown event guard](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.2/packages/session/session-persistence/src/coordinator.ts) ·
  [恢复 ignorable 的实现决策](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.2/.agents/notes/implemented/architecture/2026-08-30-retain-ignorable-external-session-events.md)

## API-06 · Headless 的 argv 与进程输出契约

- **适用对象**：CLI wrapper、CI runner、subprocess bridge、stdout/stderr parser。
- **会怎么炸**：
  - `dsh headless ...`、`dsh --profile headless -p ...` 不是目标版本的命令形状；
  - 对 stdout 做 `JSON.parse` 会在普通最终文本上失败；
  - “stderr 非空即失败”会把含 reasoning 的成功执行误报为失败；
  - 忽略退出码会把无完成回合或直接启动失败当成功。

### 正确调用与解释

```sh
dsh --profile headless "run the tests"
```

Launcher flags 必须放在 task 之前；第一个非 launcher token 之后的内容属于 app/task：

```sh
dsh --profile headless --patch ./plugin.patch.yml "verify the plugin"
```

不要写成 `dsh --profile headless "verify the plugin" --patch ...`，否则 `--patch` 会进入 task
文本，而不是 composition overlay。

| 通道 | alpha.2 契约 |
|---|---|
| stdout | 最终 assistant 文本；不是 JSONL，不含中间 tool output |
| stderr | 非空 reasoning delta 以 `dsh: reasoning:` 开头；失败为 `dsh: <code>: <message>` |
| exit 0 | task 完成 |
| exit 1 | abort、error 或没有完成回合 |

另外，`SIGINT` 映射为 130；alpha.2 supervisor 将 `SIGTERM` 的普通停止映射为 0。调用方仍应
记录终止 signal，不要只看 stderr 文本猜测状态。`--dump-config` 是不启动 app 的 composition
检查，不能同时携带 task/app args。

### Best practice

1. 使用 argv 数组和 `spawn`/`execFile`，不要 shell 拼接用户 task。
2. 退出码是成功判据；stderr 是受控的 reasoning/诊断流。reasoning 可能敏感，明确日志
   retention 与访问范围。
3. 同时消费 stdout/stderr，处理取消、signal、spawn error 和 teardown；不要等进程结束后
   才读取可能塞满的 pipe。
4. 默认验证用 stub subprocess，不要求真实 API key 或模型调用。

### 最小 stub 矩阵

| 场景 | stdout | stderr | exit | 预期 |
|---|---|---|---:|---|
| 普通成功 | final text | empty | 0 | 成功 |
| reasoning 成功 | final text | `dsh: reasoning: ...` | 0 | 成功，reasoning 单独展示/记录 |
| task 失败 | empty 或换行 | `dsh: <code>: ...` | 1 | 失败 |
| spawn error | none | local diagnostic | 无 | wrapper 报启动失败并 teardown |

- **来源**：
  [alpha.2 Headless README](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.2/packages/bundle/headless/README.md) ·
  [rc.2 Headless README](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.1-rc.2/packages/bundle/headless/README.md)

## API-07 · Package export 不等于发布物存在

- **适用对象**：从 `@deepseek-ai/*/src/*`、`/internal` 或其他深层 subpath 导入的插件。
- **会怎么炸**：仅检查 source checkout 的 `package.json#exports`，可能认为路径公开可用；
  但实际 registry tarball 不含目标文件，安装后出现 `ERR_MODULE_NOT_FOUND`、bundler
  resolution failure 或缺少 `.d.ts`。

alpha.2 的 `@deepseek-ai/dsh-client-ui-conversation` 是一个典型风险信号：export map
包含 `"./src/*": "./src/*"`，但 `files` 只列出 `lib/index.js`、`lib/invariant.js`、
`lib/client.js` 与 `lib/types/**/*.d.ts`。因此“export map 里有”本身不能证明 registry
artifact 可解析 raw source subpath。

| 断裂边界 | 典型症状 |
|---|---|
| 文件物理存在，但 subpath 未进入 `exports` | `ERR_PACKAGE_PATH_NOT_EXPORTED` |
| `exports` 声明了 target，但 target 未进入 tarball | `ERR_MODULE_NOT_FOUND` |
| runtime `.js` 存在，但对应 types target / `.d.ts` 缺失 | TypeScript 或 bundler type-resolution failure |
| manifest 声明 `dsh.bundle.patch`，但 patch 未进入 tarball | 安装可被识别，Loader/dump 读取 overlay 时以缺文件失败 |

### Best practice

1. 证据顺序：目标已安装/packed artifact → 目标 tag 的 exports 与声明类型 → 目标实现与
   测试 → release notes/历史说明。
2. 优先使用 `.`、`/client`、`/types`、`/remote` 等 package owner 明确维护的入口。
3. 必须保留 raw source seam 时，固定精确目标版本，检查 pack file list，并把它视为高波动
   coupling；不能因为带 `src` 就自动判私有，也不能因为 export map 存在就判可发布。
4. typecheck 和 source checkout build 通过后，还要从实际 tarball/安装目录做一次 package
   smoke。

### 验证

- 构建前检查 `package.json#exports` 与 `files`；
- 用仓库既有包管理器生成 pack 清单（例如先审计构建需求，再运行
  `npm pack --dry-run --json --ignore-scripts`）；未知 lifecycle script 未经授权不执行；
- 从干净临时目录安装/解析实际 artifact，验证 runtime JS 与 `.d.ts` 均存在；
- 若 manifest 声明 `dsh.bundle.patch`，逐项确认目标 patch 也在 pack 清单和 tarball 中；
- 不在迁移中顺手把 package manager 或 lockfile 换掉。

- **来源**：
  [alpha.2 ui-conversation package manifest](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.2/packages/client/ui-conversation/package.json)

## API-08 · `cordis.patch.yml` 是 composition，不是源码 patch

- **适用对象**：扫描 `patch`、`patch.yml`、`cordis.patch.yml` 或 Loader row 的迁移工具。
- **会怎么炸**：仅按文件名把正常 Profile composition 判为 monkey/source patch，随后要求
  rebase 不存在的源码 hunk、删除有效 bundle row，或错误修改宿主源码。

### Best practice

1. `cordis.patch.yml` 默认按 DSH Profile/Bundle 的官方 Loader composition overlay 分类。
2. 只有出现真实 diff、`patch-package`/`patchedDependencies`、替换宿主实现、直接写发布
   artifact 等证据时，才进入“源码 patch”迁移。
3. composition 迁移核对 row、id、inject、config replacement 语义；源码 patch 迁移核对
   target file、semantic marker、合成结果和行为测试。两者用不同验证路径。
4. 作为 Bundle 发布时，manifest 的 `dsh.bundle.patch` 必须指向安全的包内相对路径，且该
   `cordis.patch.yml` 必须真的进入 packed artifact；Node `exports` 不能替代这条边界。
5. patch row 命中已有 `id` 时，`config` 是整个 replacement，不是 deep merge；后置 layer
   覆盖前置 layer，因此要重写所有仍需保留的配置字段。

alpha.2 的 composition 优先级从低到高是：

1. Profile manifest 的 `dsh.profile.bundles` 所列 bundle patches（按列表顺序）；
2. `$DSH_HOME/profiles/<name>/cordis.patch.yml`；
3. `$DSH_HOME/cordis.patch.yml`；
4. CLI 中按 argv 顺序提供的 `--patch` overlays。

后层胜于前层。这解释了为什么迁移某个高层 row 时必须先看完整 composed result，而不能只看
它自己的 YAML 片段。

### 验证

- 普通 `cordis.patch.yml` fixture 必须能被扫描器标成 public/negative control；
- 真正的 `.patch`/source replacement 能被识别并分类为 clean apply、needs rebase、
  upstreamed-remove 或 obsolete/conflicting；
- `npm pack --dry-run --json --ignore-scripts` 或等价 no-scripts pack 清单确认 manifest 指向的
  patch 实际存在；
- 用隔离 Profile 执行 `dsh --profile <name> --dump-config`，核对 layer、row id/name、whole-config
  replacement 与 unmatched-target diagnostics，不启动 GUI 或模型；
- 不以命中数量决定风险。

- **来源**：
  [alpha.2 Headless bundle 的 `cordis.patch.yml` 定位](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.2/packages/bundle/headless/README.md) ·
  [官方插件发布与 patch composition 文档](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.2/docs/user/develop/basic/publish.md) ·
  [alpha.2 CLI Profile/Bundle layer reference](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.2/apps/cli/reference/README.md)

## API-09 · Plugin inventory 新增可选 `agentPresets`

- **适用对象**：消费 `pluginInventory/list`、序列化 `PluginInventorySnapshot`，或使用严格
  closed schema 的 Client plugin。
- **会怎么炸**：拒绝未知字段的 decoder 会在 alpha.2 收到 `agentPresets` 时失败；手工
  重建整对象又可能静默丢掉该字段及未来扩展。

### Best practice

- 把 `agentPresets` 当 optional 字段；缺失时保持旧 `entries` view。
- 需要显示 preset 分组时再解析 `trust`、rows 与 `boolean | 'conditional'` enablement。
- decoder 对新增字段前向兼容，业务写回只 patch 自己拥有的路径，不整对象覆盖。

### 验证

- 无 preset roster 时字段可缺失；
- 多 preset、conditional row 能解析；
- 旧 entries 行为不变，round-trip 不丢未知字段。

- **来源**：
  [alpha.2 PluginInventorySnapshot 类型](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.2/packages/host/plugin-inventory/src/types.ts)

## CFG-01 · Code Mode 精确迁到 PTC mode

- **适用对象**：读取 tool presentation mode、preset id、dispatch 类型或 prompt rule 的
  插件/包装器。
- **会怎么炸**：`tools.mode: 'code'`、preset `code`、`CodeDispatch*` 或
  `tools:code-only` 不再匹配；全局替换 `code` 又会破坏 `run_code`、参数名与历史事件。

### 精确 ledger

| 旧值 | 新值 |
|---|---|
| `tools.mode: 'code'` | `tools.mode: 'ptc'` |
| preset id/目录 `code` | `ptc` |
| `tools/code-dispatch-log` | `tools/ptc-dispatch-log` |
| `CodeDispatch*` | `PtcDispatch*` |
| `tools:code-only` | `tools:ptc-only` |
| UI 文案 `Code Mode` | `PTC mode` / `PTC 模式` |

保持不变：`run_code`、它的 `code` 参数、`CodeSdkLanguage`、`CodeRunFailedError`、
`dsh-code-runtime*` package、持久事件 `tool/code-dispatch*`、`tools-code-mode` plugin name
和 sub-call id 中的 `:code:`。

- **验证**：目标配置接受新值；旧 Session 日志仍可加载；剩余旧词都能解释为明确保留，
  没有盲目全局替换。
- **来源**：
  [alpha.1 PTC rename ledger](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.1/.agents/notes/implemented/architecture/2026-08-25-rename-code-mode-to-ptc.md)

## Skill 输出这类迁移报告时应使用的结构

不要只输出“需要升级 API”。每个真实命中至少给出下列字段：

```markdown
### <接口名>

- 当前证据：<文件:行、当前 package/resolved version>
- 旧写法：<精确 import / signature / config>
- 会怎么炸：<typecheck diagnostic、runtime failure 或行为漂移>
- 目标写法：<精确 tag 下可编译的最小示例>
- Best practice：<lifecycle、error、face、packaging 边界>
- 验证：<成功、失败、取消、teardown 或 artifact smoke>
- 一手来源：<目标 tag 的 exports/type/source/test URL>
```

最终汇总表：

| 命中位置 | 旧接口 | 典型症状 | 目标接口 | 必须改 / 条件改 | 验证状态 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

如果目标 tag 的实际类型与本文冲突，必须以目标 tag 为准并把冲突标为知识库缺口；不要
为了“套卡片”而把可编译代码改坏。

## 最小验证梯度

1. **静态 inventory**：精确 package/resolved version、imports、exports、removed symbol、
   Remote namespace 与 face；
2. **typecheck/build**：使用真实 Context/projection，不用 `any`；
3. **focused tests**：每个 unary 的 success/domain failure/cancel/assembly fault，stream 的
   snapshot/reconnect/teardown；
4. **artifact smoke**：从实际 pack/install 产物解析 entry 与 types；
5. **headless-safe Loader/config smoke**：使用隔离 `DSH_HOME`/临时 Profile，不要求凭据；
6. **显式授权后的行为验证**：只有用户要求并提供环境时，才启动真实 Profile、GUI、长期
   服务或模型调用。

每次报告必须区分“typecheck 通过”“Loader 挂载通过”“真实行为通过”；三者不是同一个
完成状态。
