# Rollup · 0.1.1 → 0.1.2 走廊

> **状态**: 基于 `dsh-v0.1.2-alpha.2`。**0.1.2 正式版尚未发布**——npm dist-tags 实测 `latest`/`next` = `0.1.1-rc.2`，`alpha` = `0.1.2-alpha.2`。正式发版后本文件需按 final tag 复核转正（[issue #1](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/issues/1) 的原始 caveat）。
> **定位**: 本文件不重复版本卡片。逐条变更以卡片为准，这里只写走廊层的增量——跨 cohort 共存、未发布 cohort 安装、CI/发布连带、分层验证清单。
> 卡片格式见 [README.md](README.md)。触点编号对应 [pre-flight 清单](pre-flight.md)。

## 怎么用这份 rollup

1. 先按 [pre-flight.md](pre-flight.md) 测出命中的触点类；
2. 按序读卡片，只应用命中触点的条目：[v0.1.2-alpha.1.md](v0.1.2-alpha.1.md)（12 张）→ [v0.1.2-alpha.2.md](v0.1.2-alpha.2.md)（4 张）；
3. 回到本文件处理走廊层问题——这些跨越单版本，卡片里没有；
4. 按本文件末尾的分层验证清单收工。

## 卡片索引（按触点）

| 触点 | 相关卡片 |
|---|---|
| #1 源码 patch | [ALPHA1-03](v0.1.2-alpha.1.md)（会话视图拆分） |
| #2 内部事件名 | [ALPHA1-02](v0.1.2-alpha.1.md) → [ALPHA2-01](v0.1.2-alpha.2.md)（`ignorable` 一删一复，**读完走廊再删防御代码**） |
| #3 服务探测 | [ALPHA1-01](v0.1.2-alpha.1.md)（APIProxy 移除，含 17 条操作映射表）、[ALPHA2-02](v0.1.2-alpha.2.md)（`RemoteError` 封装） |
| #4 宿主目录读写 | [ALPHA1-04](v0.1.2-alpha.1.md)（Profile 统一启动） |
| #5 UI / 命令注册 | [ALPHA1-03](v0.1.2-alpha.1.md)（破坏面）、[ALPHA1-08](v0.1.2-alpha.1.md) / [ALPHA1-09](v0.1.2-alpha.1.md) / [ALPHA1-10](v0.1.2-alpha.1.md)（机会面） |
| #6 子进程 / stdout | [ALPHA1-05](v0.1.2-alpha.1.md)（headless 输出语义）、[ALPHA1-04](v0.1.2-alpha.1.md)、[ALPHA1-12](v0.1.2-alpha.1.md) / [ALPHA2-04](v0.1.2-alpha.2.md)（workaround 可能过期） |
| 打包 / 分发 | [ALPHA2-03](v0.1.2-alpha.2.md)（peer deps 裁剪） |

> **跨版本回滚型变更先读完整走廊再动手**：字段或语义在中间版本删除、后续版本又恢复
> （典型如 `ignorable` 的 [ALPHA1-02](v0.1.2-alpha.1.md) → [ALPHA2-01](v0.1.2-alpha.2.md) 一删一复）。
> 迁移时必须先折叠走廊的净状态再修改源码——不要在 alpha.1 删一次、到 alpha.2 又加回来；
> 若最终目标已恢复该语义，旧版适配里的防御代码应当删除而不是保留。

## Remote 调用的错误流

承接 [ALPHA1-01](v0.1.2-alpha.1.md) 与 [ALPHA2-02](v0.1.2-alpha.2.md)。alpha.2 把错误面重构为 `RemoteError` + `RemoteResult`，**Consumer 侧 Remote 方法签名统一为 `Promise<RemoteResult<T>>`，永不 reject**。业务失败不是异常。

```typescript
// 业务失败走 ok === false 分支；result.error 是 typed RemoteFailure，无需 cast
const result = await ctx.remote.session.list({ limit: 10 })
if (!result.ok) {
  if (result.error.code === 'session/not-found') {
    return null
  }
  // 需要向上传播时：result.error 是真 Error，带 stack 与 message
  throw result.error
}
return result.value
```

catch 只适用于 Gateway client 层与传输层——`gateway/internal`、`gateway/cancelled`、以及 Gateway 的 17 个 `gateway/*` 装配码：

```typescript
import { isRemoteFailure } from '@deepseek-ai/dsh-api-gateway/client'

try {
  const result = await gateway.invoke('session', 'list', wireArgs)
  // ... 仍按 result.ok 分支处理业务失败
} catch (error) {
  // 传输/装配故障；判别永远读 code，不用 instanceof（跨 bundle 原型不同一）
  if (isRemoteFailure(error) && error.code === 'gateway/cancelled') {
    return
  }
  throw error
}
```

三条易错点：

- **不要**用 `error.failure.code`——那是 alpha.1 时代 `TypertRemoteFailure` 的形状，alpha.2 已删除；
- **不要**用 `instanceof RemoteError` 判别：Client 与 Host 是分别打包的程序，worker transport 又会再打包一份，同一个类存在多份拷贝；
- 未分类的 Host 抛出会被 Gateway 折叠一次成 `gateway/internal`，诊断链保留在 `message`——不要自己预先折叠成业务码。

来源：架构笔记 [ctx-remote-failure-vocabulary](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-alpha.2/.agents/notes/implemented/architecture/2026-08-28-ctx-remote-failure-vocabulary.md)（status: implemented）。

## 走廊层增量

以下四类问题跨越单个版本或落在卡片之外，来自社区实战（[discussion #5120](https://github.com/deepseek-ai/deepseek-harness/discussions/5120)，dsh-web 约 20 个包的迁移）。

### R-01 · 目标 cohort 未发布 npm

- **类型**: process
- **症状**: 任何 `0.1.2-alpha.*` 包名 npm 返回 404，常规 `pnpm install` 装不到目标 cohort。
- **配方**: 隔离 worktree 从官方 tag 构建一次，`pnpm pack` 出 tarball，用 `overrides` 钉到 `file:` 路径。

  ```sh
  git clone https://github.com/deepseek-ai/deepseek-harness.git /tmp/dsh-build
  cd /tmp/dsh-build && git checkout dsh-v0.1.2-alpha.2
  pnpm install && pnpm run build
  mkdir -p ~/.dsh-cohorts/0.1.2-alpha.2
  pnpm -r exec pnpm pack --pack-destination ~/.dsh-cohorts/0.1.2-alpha.2
  ```

  manifest 里 range 写 `^0.1.2-alpha.2`，将来正式发布删掉 overrides 段即回到 registry 解析。
- **注意（待确认）**: 以下 pnpm 版本钉点来自**单一实战报告，尚未在其他仓库复现验证**——报告称 `11.9.0` 对 file: tarball 的传递依赖在有第三方 peer 时会绕过 overrides 去 registry 找不存在的版本，钉 `packageManager: pnpm@11.24.0` 才解析正确。落地前先在目标仓库做最小复现确认，验证通过后回填结果并把本条目转正（与本文件末尾「待确认」小节同步更新）。
- **验证**: `pnpm list --depth 0 | grep @deepseek-ai` 全部指向目标版本，无混合。
- **来源**: [#5120](https://github.com/deepseek-ai/deepseek-harness/discussions/5120) 第 1 条。**未在官方 release notes 覆盖范围内**，属社区实践。

### R-02 · 跨 cohort 共存（旧宿主升不到未发布 cohort）

- **类型**: breaking（组合效应）
- **症状**: rc.2 宿主不可能升到未发布的 alpha，插件必须在两个 cohort 上都跑。两条硬耦合会浮出来：客户端 bundle 求值期硬 `require` 平台模块，在没有该模块表项的宿主上报 `missed the module table`；只在新宿主注册的服务被写进硬 `inject` 清单，旧宿主上入口永久 `pending (waiting for service: …)`。
- **配方**: 一个产物 + 运行时解析 cohort 表面。

  ```typescript
  // 共享 build 预设里生成 shim：不再 externalize 值导入，求值期用注入的 require 解析
  function resolveStoreEngine() {
    // 说明符拼接构造，避免被静态 external 扫描标记
    const platform = ['@deepseek-ai', 'dsh-client-store'].join('/')
    const legacy = ['@deepseek-ai', 'dsh-client-runtime', 'client'].join('/')
    try { return require(platform) } catch { return require(legacy) }
  }
  ```

  只转**共享**的值表面——cohort 独有导出绝不能 re-export，否则新值导入会在 build 时报 missing-export 而不是静默坏掉。类型导入照旧（编译期擦除）。

  注入服务从硬 inject 清单拿掉，在使用点探测；**cordis `remote` 代理对未注入属性是 throw 而非返回 undefined**，所以必须 try/catch 再回落：

  ```typescript
  let presets
  try { presets = ctx.remote.agentPresets } catch { presets = undefined }
  const roster = presets ?? ctx.connection.api.agentPresets
  ```

- **被否决的替代**: per-consumer try/catch 重复污染源码；按宿主 cohort 出不同产物（重新引入有状态构建）；硬等 inject wait（旧宿主永久 pending）。
- **验证**: 同一份产物分别 link 到旧宿主与新宿主，各跑一次冷启动 + 完整一轮对话。
- **来源**: [#5120](https://github.com/deepseek-ai/deepseek-harness/discussions/5120) 第 3、4 条。

### R-03 · 第三方预构建插件搭不上你的 shim

- **类型**: breaking
- **症状**: 预构建 npm 内容进入 profile，硬 require 旧说明符，在新宿主同样 `missed the module table`。你不构建它，build 预设的 shim 帮不到。
- **配方**: 仓库自持 `pnpm patch`（`patchedDependencies`），把那一条 require 改写成同样的双 cohort 探测。**别忘了 profile 的父层链接**——link 脚本可能把链接重指回未打补丁实例，需指到 `patch_hash=…` 实例。
- **验证**: 打补丁后冷启动，确认该插件的 UI 贡献点可见可用。
- **来源**: [#5120](https://github.com/deepseek-ai/deepseek-harness/discussions/5120) 第 7 条。

### R-04 · CI 与发布管线连带

- **类型**: process
- **症状**: overrides 用 file: tarball 后，frozen lockfile 记录机器相关绝对路径，每个 runner `pnpm install --frozen-lockfile` 缺 store。另外 cohort 未发布期间，版本 tag 一旦触发 npm publish，会发出 `@deepseek-ai/*` range 无法从 registry 解析的包，且对该版本不可逆。
- **配方**:
  - 加一个脚本在任何机器 materialize tarball store（解析 overrides；store 已存在则秒退），用以 `pnpm-workspace.yaml`（或 `package.json`）hash 为 key 的 actions cache 服务所有 pnpm 消费 job；
  - `pnpm/action-setup` 删掉 `version` 输入，让 `packageManager` 成为唯一版本来源，避免与钉点冲突；
  - release workflow 加 `NPM_PUBLISH_ENABLED` 开关：tag 仍跑全部门禁与 smoke，跳过 npm publish，直到 cohort 正式发布。
- **验证**: 干净 runner 上 `--frozen-lockfile` 安装成功；tag 演练确认未产生 publish。
- **来源**: [#5120](https://github.com/deepseek-ai/deepseek-harness/discussions/5120) 第 8、9 条。

### R-05 · 迁移前盘点被删包的下游

- **类型**: process
- **症状**: 依赖被删 SDK 包才能构建的插件（承接 [ALPHA1-01](v0.1.2-alpha.1.md)），迁移中途才发现无法构建，只能随迁移退役。
- **配方**: 迁移前先对全部插件跑一次「import 了哪些被删包」的盘点，把「必须退役」与「可迁移」分开排期，而不是边迁边发现。
- **验证**: 盘点清单与实际迁移结果一致，无中途新增退役项。
- **来源**: [#5120](https://github.com/deepseek-ai/deepseek-harness/discussions/5120) 第 10 条。

## 分层验证清单

按顺序跑，前一层不过不进下一层：

1. **依赖解析**: `pnpm list --depth 0 | grep @deepseek-ai` 版本一致；lockfile 无混合 cohort。
2. **静态**: typecheck + build。注意静态全绿证明不了 wire 契约正确——描述符层的参数漂移在这一层是静默的（[ALPHA1-01](v0.1.2-alpha.1.md)）。
3. **卡片级单测**: 每个命中触点至少一条断言。Remote 调用点覆盖 `ok: false` 的已知业务码、未知码兜底，以及 gateway 层 catch 分支；测试替身编码同一套描述符表，多/缺 key 就 fail，让漂移变成测试失败事件。
4. **真实冷启动**: 完整一轮对话（发消息 → 工具调用 → 回复）。观察日志无 `missed the module table`、无 `service-unavailable` 循环、无入口 `pending`。
5. **跨 cohort**（若做了 R-02）: 旧宿主与新宿主各跑一次第 4 步。
6. **headless**（若命中 #6）: 比对 stdout/stderr 的内容分类（[ALPHA1-05](v0.1.2-alpha.1.md)）。

## 回退

1. 升级前提交干净状态并打 tag；
2. tarball overrides 回滚：删掉 `overrides` 段，`git checkout <tag> -- pnpm-lock.yaml`；
3. 在独立分支迁移，不与功能改动混在一个提交；
4. 若问题源于宿主升级，优先回退宿主而不是把插件改成兼容两边。

## 待确认

- 0.1.2 正式版的 dist-tag、final tag 名与 alpha.2 的差异，需在发版后复核本文件全部条目；
- R-01/R-02 的 pnpm 版本敏感性来自单一实战报告，未在其他仓库复现验证。
