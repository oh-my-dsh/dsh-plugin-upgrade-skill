# Pre-flight · 宿主升级前触点自查

> 这是启发式扫描，不是兼容性证明。七类零命中只表示“未被当前模式发现”，仍须检查
> 依赖/配置并执行 build、真实挂载和功能烟测。

前六类沿用 [dsh-community-standard 迁移指南](https://github.com/oh-my-dsh/dsh-community-standard/blob/main/guides/migration.md)
的分类；本 skill 另加 #7 子进程/输出解析。机器校验读取
[pre-flight-patterns.json](pre-flight-patterns.json)。下列 `rg` 仅为示例；Agent 应优先
使用当前环境提供的内容搜索工具。

## 0. 先做配置与依赖盘点

扫描全部受跟踪的源码、测试、脚本、CI 和根配置，排除生成物、vendor 与
`node_modules`。至少记录：

- `package.json` 的插件版本、`peerDependencies`、`engines` 与 `@deepseek-ai/*` 导入；
- resolved 版本与 lockfile（只认仓库正在使用的包管理器）；
- 标准 manifest `dsh-plugin.json`（若存在）；
- profile composition：`cordis.patch.yml`、`agent.cordis.yml`、历史 `cordis.yml`；
- 实际安装轨：registry 包、Git checkout、workspace/junction 或复制安装。

这些文件所有权不同，不能统一称为 manifest，也不能整对象重写未知字段。

## 1. 构造版本走廊

1. 用精确 tag 确认 from/to；
2. 按 [版本走廊索引](README.md#版本走廊索引) 的 `from → to` 边连接，禁止按文件名字典序；
3. 先读完整走廊并折叠“移除后又恢复”等净变化，再生成修改计划；
4. 缺卡时报告 unsupported gap，先做一手来源调研，不凭记忆自动改插件。

## #1 源码 patch / monkey patch

```sh
rg -n "cordis\.patch\.yml|patch\.yml|patchedDependencies|patch-package" .
rg -n "DSH_HARNESS_SOURCE_ROOT|patch-surface|monkeypatch|monkey-patch" .
```

命中后逐个记录宿主目标路径与替换意图；目标 tag 中找不到等价 owning 模块时标
「待确认」，不猜路径。

**关联卡**: `DSH-0.1.2-A1-03`

## #2 内部事件名与持久事件

```sh
rg -n "SessionEvent|session/event|ctx\.on\(|subscribe\(" .
rg -n "tool/code-dispatch|tools-code-mode|connection/reset" .
```

区分 producer、persistence、reload、transport 与普通 observer；未知 required 事件不能
因白名单而被放过。

**关联卡**: `DSH-0.1.2-A1-02`、`DSH-0.1.2-A1-06`、`DSH-0.1.2-A2-01`

## #3 内部服务探测 / Remote

```sh
rg -n "APIProxy|apiProxy|ctx\.get\(|ctx\.remote|@Remote" .
rg -n "@deepseek-ai/dsh-api-.+/client|/internal" .
```

同时记录调用所在 face（Host、Web Client、普通 Cordis plugin）与包入口；内部架构迁移
不能直接当成所有插件的公开 API 建议。

**关联卡**: `DSH-0.1.2-A1-01`、`DSH-0.1.2-A1-06`、`DSH-0.1.2-A1-11`、`DSH-0.1.2-A2-02`、`DSH-0.1.2-A2-05`、`DSH-0.1.2-A2-06`

## #4 直接读写宿主目录

```sh
rg -n "DSH_HOME|\.dsh[/\\]|profiles[/\\]|homedir\(" .
rg -n "readFile|writeFile|mkdir|openPath" .
```

同一行搜索无法发现数据流；命中路径构造函数后继续追踪变量来源与写入目标。不得打印
配置内容、token、`.npmrc` 或会话日志。

**关联卡**: `DSH-0.1.2-A1-04`、`DSH-0.1.2-A1-13`

## #5 内部 UI / 命令 / 工具注册

```sh
rg -n "registerCommand|registerView|contributes|ctx\.tools" .
rg -n "ctx\.effect\(|/internal" .
```

将公开 seam 与内部路径分开；机会型 capability 只建议、不自动采用。

**关联卡**: `DSH-0.1.2-A1-03`、`DSH-0.1.2-A1-06`、`DSH-0.1.2-A1-09`、`DSH-0.1.2-A1-10`、`DSH-0.1.2-A1-11`

## #6 自建 HTTP / WS / RPC / DOM / CSS 通道

```sh
rg -n "createServer\(|WebSocket|MutationObserver|insertRule" .
rg -n "127\.0\.0\.1|localhost|router\.(get|post|put|delete)\(|/api/" .
```

检查认证、Host/Origin、端口生命周期和 teardown；不能因“只监听 loopback”就跳过认证。

**关联卡**: `DSH-0.1.2-A1-08`

## #7 子进程 / stdout / stderr 解析

```sh
rg -n "node:child_process|spawn\(|exec(File)?Sync\(|execa|Bun\.spawn" .
rg -n "headless|--profile" .
```

记录 argv、cwd、env、取消、退出码、stdout/stderr 所有权；不要只验证进程能启动。

**关联卡**: `DSH-0.1.2-A1-04`、`DSH-0.1.2-A1-05`、`DSH-0.1.2-A1-06`、`DSH-0.1.2-A1-13`、`DSH-0.1.2-A2-04`

## 特殊面

- 权限/审批：另查 `DSH-0.1.2-A1-07`；
- 打包/依赖：另查 `DSH-0.1.2-A2-03`；
- 隐私/数据出境：另查 `DSH-0.1.2-A1-12`、`DSH-0.1.2-A1-14`。

## 汇总模板

```markdown
## 触点体检（<插件>，<from> → <to>）

| 触点 | 命中 | 文件/行 | 适用卡 | 置信说明 |
|---|---:|---|---|---|
| #1 patch | | | | |
| #2 事件 | | | | |
| #3 服务/Remote | | | | |
| #4 文件系统 | | | | |
| #5 UI/命令/工具 | | | | |
| #6 自建通道 | | | | |
| #7 子进程/输出 | | | | |

未命中说明：<扫描范围、排除目录、依赖/配置另行检查结果>
必须验证：<build/typecheck、真实 profile 挂载、功能路径>
```
