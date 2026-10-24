---
name: plugin-fast-adapt
description: 高性能 DSH 插件快速适配与破坏性更新自愈系统。通过本地确定性 CLI 实施环境覆盖层巡检与自愈、插件启用诊断、AST 符号级破坏性契约扫描、秒级沙箱冒烟测试与深度质量审计。当需要对 DSH 插件进行快速版本适配、排查升级后崩溃、消除 profiles 覆盖层旧包残留、排查插件安装未生效或验证插件运行时兼容性时触发。
---

# plugin-fast-adapt · DSH 插件高性能快速适配与自愈系统

基于确定性工程与轻量沙箱的高性能 DSH 插件适配系统。本技能放弃「阅读海量历史散文卡片」的臃肿模式，采用「本地 CLI 提取精确证据 → 符号级原子修补 → 毫秒级沙箱闭环 → 工业级质量审计」架构，彻底消除长上下文干扰与弱模型超时负迁移。

## 核心设计与四大防线 (遵循 MECE 原则)

1. **环境自愈与覆盖层防线（Host Environment & Overlay Gate）**：
   - 解决 issue #263 典型事故：DSH 宿主升级后，`~/.dsh/profiles/<profile>/node_modules/@deepseek-ai/*` 残留旧包引发运行时消息写面崩溃。
   - 一键体检与自愈：自动识别覆盖层毒化包并安全移至回收站，清理幽灵进程与临时残留。
2. **插件启用与依赖就绪防线（Activation & Resolution Gate）**：
   - 解决「插件已安装/已声明，但运行时未正确启用」：检查 `inject` 依赖是否在当前 profile 中被满足（防止 Cordis 永久静默 pending）；检查 `cordis.patch.yml` 挂载状态；检查构建产物是否存在。
3. **符号级契约防线（Symbol Contract Gate）**：
   - 毫秒级扫描 AST 语法树与依赖配置，精准提取 Settings 废弃、Client-Runtime 移除、Message v4 格式、peerDependencies 严格锁定等高频破坏性断点。
   - 仅向模型输出当前插件实际命中的微卡片（Micro-Recipe），单次上下文消耗控制在 1000 tokens 以内。
4. **秒级沙箱闭环与自举审核防线（Quick-Smoke & Audit Gate）**：
   - 纯内存模拟 Cordis 运行时上下文，100ms 内完成插件模块动态导入、依赖注入、`apply()` 执行与工具注册断言，解决传统冷启动超时 3600 秒痛点（issue #171）。
   - 四维度（性能内存安全、契约弹性弱耦合、上下文常驻预算、生命周期清理）深度审计。

---

## 适配执行标准流程

### 第一步：环境卫生体检与旧包自愈 (Stage 0)

在开始任何代码改动前，必须先确认宿主环境处于健康状态：

```sh
# 体检环境与覆盖层
node skills/plugin-fast-adapt/scripts/dsh-hygiene-doctor.mjs /path/to/plugin

# 一键自愈：安全隔离覆盖层旧包并清理陈旧快照
node skills/plugin-fast-adapt/scripts/dsh-env-healer.mjs
```

- 若发现覆盖层旧包残留：自愈脚本会自动将其安全转移至 `~/.dsh/.trash/` 对应日期目录下，使系统回落到全局宿主干净安装；
- 若发现运行中的 DSH 宿主进程：记录其 PID。若修改涉及 Host 服务侧代码，后续必须重启该进程。

### 第二步：插件启用就绪度排查 (Stage 1)

排查插件是否已在目标 Profile（默认 web）中正确配置与就绪：

```sh
node skills/plugin-fast-adapt/scripts/dsh-activation-doctor.mjs /path/to/plugin web
```

- 若提示产物缺失：先运行 `pnpm run build`；
- 若提示未挂载：在 `~/.dsh/profiles/web/cordis.patch.yml` 补全插入条目；
- 若提示服务缺失风险（Silent Pending 隐患）：按照提示改用弱依赖 `ctx.get()` 探测。

### 第三步：精准提取破坏性契约触点 (Stage 2)

执行静态符号扫描，提取具体文件和行号：

```sh
node skills/plugin-fast-adapt/scripts/dsh-contract-diff.mjs /path/to/plugin
```

根据输出的微卡片，按需执行代码修正。对于常规的 `peerDependencies` prerelease 拦截以及构建缓存，可运行自动修复器：

```sh
node skills/plugin-fast-adapt/scripts/auto-fixer.mjs /path/to/plugin
```

### 第四步：常见破坏性契约自愈指南 (Stage 3)

遇到以下触点时，按标准自愈模式重构代码：

1. **Settings 模块废弃**：
   - 现象：引入了 `@deepseek-ai/dsh-settings` 或调用 `settings.register`。
   - 修复：直接移除该依赖；导出 Cordis 原生 `Config` Schema（`export const Config = ...`），设置项将由宿主 `configEditor` 自动渲染。
2. **peerDependencies 预发布版本拒绝**：
   - 现象：声明了 `^0.2.0` 或 `>=0.2.0 <0.3.0`，在遇到 `0.2.1-alpha.1` 或 `0.1.0-rc.8` 等宿主时安装报错。
   - 修复：规范为含 `-0` 放行的宽容范围，如 `">=0.1.0-0 <0.3.0"`。
3. **服务弱契约解耦与降级**：
   - 现象：强 `import` 宿主非核心包（如 session-query）。
   - 修复：改用 `ctx.get('serviceName')` 动态探测 + 鸭子类型判断，未检测到服务时安全静默降级，不阻塞核心工具。
4. **提交与构建产物（Vendor 纪律）**：
   - 现象：配置了 `prepare` 脚本导致 pnpm 10+ 拦截 git 依赖构建。
   - 修复：移除 `prepare` 脚本，在提交代码时确保 `lib/` 编译产物已入库。

### 第五步：极速沙箱冒烟验证 (Stage 4)

代码修改后，先完成基础构建，再运行毫秒级沙箱冒烟：

```sh
cd /path/to/plugin && pnpm run clean && pnpm run build
node skills/plugin-fast-adapt/scripts/quick-smoke.mjs /path/to/plugin
```

沙箱将自动断言模块能够顺利被 Cordis 加载并成功激活，且正确暴露所声明的工具名与命令。

### 第六步：工业级质量与性能深度审计 (Stage 5)

运行深度审计器，对内存防护、I/O 阻塞、上下文预算与生命周期清理进行全量扫描：

```sh
node skills/plugin-fast-adapt/scripts/dsh-plugin-auditor.mjs /path/to/plugin
```

根据评分报告消除残留隐患，确保插件达到工业级生产标准。

### 第七步：双平面生效核验 (Stage 6)

依据改动所属平面，执行对应的生效操作：
- **Web Client 侧改动**（`src/client/*`, `lib/client.js`）：通知用户在浏览器中执行硬刷新（Cmd+Shift+R 或 Ctrl+F5）即可；
- **Host 侧改动**（`src/index.*`, `lib/index.js`）：必须在外部终端完全终止先前的 DSH 进程并重新启动 `dsh web`。
