# S12 · dsh 全局升级：EBUSY 与降级陷阱的诊断报告

**对象**：Windows 上的 DSH 全局安装（`npm install -g`），当前运行 `0.1.2-alpha.4`，目标 `dsh-v0.1.2-alpha.5`，另需 `@deepseek-harness-tui/dsh-tui`。
**证据**：`fixture/` 只读证据包（attempt1-ebusy.log、attempt2-downgrade.log、npm-dist-tags.txt、running-processes.txt、README.md）。本报告未执行任何安装/迁移，`fixture/` 逐字节未改。

---

## 0. 结论速览

| 现象 | 直接原因 | 性质 |
|---|---|---|
| 尝试 1：`EBUSY ... copyfile ... koffi.node` | 正在运行的 dsh web host（PID 42432，及其 agent session worker 23768）把 `@koromix/koffi-win32-x64/win32_x64/koffi.node` 作为原生镜像加载进进程；Windows 在进程存活期间不允许替换/删除该文件。刷新浏览器只重载前端 SPA，host 进程不死，锁不释放。 | OS 级文件占用（进程未停），不是权限、不是 npm bug、不是缓存 |
| 尝试 2：装完 `dsh --version` 显示 `0.1.1-rc.2` | 组合命令里 `@deepseek-ai/dsh` **没有版本/标签**，等价于 `@deepseek-ai/dsh@latest`；注册表 `latest = 0.1.1-rc.2`（`next` 也是它），而 `alpha = 0.1.2-alpha.5`。于是"升级"实际执行了一次降级（0.1.2-alpha.4 → 0.1.1-rc.2）。 | 注册表 dist-tag 解析问题：不锁定版本时 npm 跟的是 `latest`，既不"保持已装版本"，也不"取最新版本" |

两条陷阱互相独立：即使把锁的问题解决了，只要命令仍是裸包名，结果依旧是 rc.2。

---

## 1. 尝试 1：为什么 `koffi.node` 被锁，刷新浏览器为什么没用

### 1.1 谁持有文件

`running-processes.txt` 给出了三个 node 进程：

| PID | 角色 | 与锁的关系 |
|---|---|---|
| 42432 | dsh web host | **持有者**：启动时 `require` 了 `@koromix/koffi`（sandbox / 文件系统操作所需的原生 FFI 插件） |
| 23768 | agent session worker | **共同持有者/寄生者**：由 host 派生、同一套运行时，通常同样加载 koffi；`/T` 杀树时必须一起处理 |
| 23920 | `npm install -g` 自身 | 受害者：执行 copyfile 时撞上共享冲突 |

`attempt1-ebusy.log` 只给了 5 行，关键两行是源 `...\@koromix\koffi-win32-x64\win32_x64\koffi.node` 与目标 `...\@deepseek-ai\.dsh-TMPDIR\...\koffi.node`——即 npm 在 `@deepseek-ai` scope 下建暂存目录、把包内容搬进去的过程中被 Windows 拒绝。

### 1.2 机制（为什么是 EBUSY 而不是 EACCES/EPERM）

- `.node` 是 **PE 原生 DLL**。进程加载它时，Windows 把它按 **image section（内存映射镜像）** 映射进地址空间，并让内核为该 section 保留对磁盘文件的引用。
- 只要还有进程映射着这个 image，对该文件的**写入、截断、重命名、删除**都会被拒绝（sharing violation）。典型表现：`copyfile` / `rename` 路径上抛 EBUSY/EPERM/UNKNOWN。
- npm 在 Windows 上把这类共享冲突统一报成 `EBUSY`（`syscall: copyfile`），所以它看起来像"文件被占用"，实质上就是"这个 DLL 还在内存里跑着"。
- 区别于普通数据文件：文本/配置类文件通常以共享读写方式打开，改它不会失败；**已加载的原生模块不行**，这是 Windows 加载器语义，不是 npm 能绕过的。
- 也因此：`npm cache clean`、`--force`、删 `node_modules`、换 registry、重开终端**都不解决**——锁在进程里，不在磁盘上。

### 1.3 为什么"刷新浏览器页面"不释放

dsh 是 **host 进程 + 浏览器前端** 的分离架构：

- 浏览器里的页面只是 SPA 客户端（HTML/JS/CSS）。刷新（F5 / 硬刷新 / 关标签页）只销毁并重建**渲染进程里的前端代码**。
- `koffi.node` 是 **host 侧** node.exe 加载的，服务于沙箱与文件系统调用；host 是常驻后台进程，浏览器断开它照样活着（否则会话、后台任务、其他 GUI 客户端都会断）。
- 结论：刷新最多让前端重新拉一次静态资源，host 的 PID 42432 不变，image section 不变，锁不变。**必须终止 host 进程本身**，而不是它的客户端。
- 同理，只关浏览器、只关某个标签页、只 `Ctrl+C` 掉一个前台 TUI，都可能在 23768 这类 worker 上留下残余锁。

### 1.4 由此得到的正确"先停后升"顺序（原则）

1. **先降载**：退出 TUI、关掉所有 GUI 标签页、结束正在跑的 agent 会话/后台任务（否则停 host 会把它们连根拔掉）。
2. **停服务**：停 dsh web host（42432）与所有 session worker（23768 一类），优先用 dsh 自带的 `stop`/服务管理命令；没有就按 PID 杀树。
3. **验证锁已释放**：确认没有 node 进程再映射 `koffi.node`、确认端口已释放（见 §3 Phase 1 的校验命令）。**这一步不能跳**，它是"停干净了没有"的唯一客观判据。
4. **再安装**：此时 `npm install -g` 才可能成功。
5. **装完校验**：`dsh --version` 必须等于期望版本，再重启 host。
6. **升级动作不要从 dsh 自己的会话/内置终端里发起**：那是"自己杀自己"，且被杀的 worker 可能重建锁；一律用系统自带的 cmd/PowerShell 外部窗口。
7. 若全部 node 进程已退出仍报 EBUSY：先怀疑杀毒/索引器/资源管理器的短暂扫描（等几秒重试一次），再排查托盘程序、停靠的桌面端、编辑器扩展宿主等其他嵌入了 koffi 的进程；最后手段是重启机器。

---

## 2. 尝试 2：为什么装完是 `0.1.1-rc.2`（一次静默降级）

### 2.1 无版本号的全局安装等于什么

```
npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui
```

npm 的规则：**`npm install -g <name>` 是 `<name>@latest` 的语法糖**。所以第一条参数被展开成 `@deepseek-ai/dsh@latest`，npm 去注册表读 `dist-tags.latest` 指向哪个版本，就装哪个版本。

### 2.2 当时的注册表状态（`npm-dist-tags.txt`）

| dist-tag | 指向 | 说明 |
|---|---|---|
| `latest` | **0.1.1-rc.2** | 裸包名跟的就是它 → 这就是降级的直接来源 |
| `next` | **0.1.1-rc.2** | 与 latest 同版本，所以改成 `@next` 同样救不了 |
| `alpha` | **0.1.2-alpha.5** | 用户真正想要的版本，**只在 `alpha` 这个 tag 下** |

### 2.3 为什么这构成"降级"而不是"保持不变"

三条常见误解，逐条否掉：

- **误解 A："不写版本就会保留已装版本。"** 错。npm 不会读你机器上已装的版本做基准；它只解析 tag。已装的 `0.1.2-alpha.4` 完全没被参考。
- **误解 B："不写版本就会装到最新的那个。"** 错。npm 不做"版本排序取最大"，它取 `latest` 这个 tag 的**字面指向**。发布者没有把 alpha 线提升到 `latest`，所以最新的 alpha.5 不会因"更新"而被选中。
- **误解 C："rc.2 听起来比 alpha 新。"** 语义化版本比较：`0.1.1-rc.2` < `0.1.2-alpha.4`（次版本 1 < 2，预发布标识不改变这个顺序）。所以这是一次真实的**向后降级**，跨了 release 线（0.1.1-rc 线 → 0.1.2-alpha 线）。

净效果：`0.1.2-alpha.4` 被替换成 `0.1.1-rc.2`，用户以为在"升级"，实际在回退，而且没有任何报错——这就是"陷阱"的地方：**命令成功、退出码 0、版本却是错的**。

### 2.4 组合命令放大了问题（第二层风险）

`npm install -g A B` 会在**同一棵树**里解析两个 spec：

- 两个包都不锁版本 → 两个都跟 `latest`，各自漂移；TUI 与 core 的版本对不上也没人拦。
- 即使只锁了 core，如果 `dsh-tui` 对 `@deepseek-ai/dsh` 声明的是 `dependencies`/`peerDependencies` 区间（例如 `^0.1.1`），npm 仍可能为了满足该区间把 core **降级/去重**成 rc 线，或装出嵌套的第二份 core，最终 `dsh` 这个 bin 指向哪一份取决于链接顺序。
- 结论：**core 与插件必须分别、且都锁定版本安装**；把"官方组合命令"当成"一条命令搞定"是这类 README 的典型坑。

### 2.5 顺带说明：证据能证明与不能证明的边界

- 能证明：命令确实无版本号；`latest`/`next` 当时确实指向 `0.1.1-rc.2`；`dsh --version` 输出确实是 `0.1.1-rc.2`。三者已经构成完整因果链。
- 不能证明（需现场复核，不在本报告断言）：TUI 包当时的具体版本与依赖区间、是否存在嵌套 core、降级后配置文件是否被旧版重写。§5 给出复核与兜底动作。

---

## 3. 针对这台机器的确切安全升级命令

前提：Windows，全局 prefix 已知；目标是 **alpha.5 这条线**，且要 **TUI 插件**。下面命令在**外部** PowerShell（非 dsh 会话内）执行；只读诊断段可先用。

### Phase 0 · 取证与基线（只读，先记录"升级前长什么样"）

```powershell
npm prefix -g
where.exe dsh
dsh --version                     # 记录：应为 0.1.2-alpha.4
npm ls -g --depth=0               # 记录 core 与 TUI 的现有版本
npm view @deepseek-ai/dsh dist-tags
npm view @deepseek-harness-tui/dsh-tui dist-tags
npm view @deepseek-ai/dsh@0.1.2-alpha.5 version
```

顺手备份配置（防降级已改写过配置，见 §5）：
```powershell
Copy-Item -Recurse -Force "$env:USERPROFILE\.dsh" "$env:USERPROFILE\.dsh.bak-$(Get-Date -Format yyyyMMdd-HHmmss)"
```

### Phase 1 · 停干净（这是 attempt 1 的正解，顺序不能反）

```powershell
# 1) 退出 TUI（在其窗口按退出键 / Ctrl+C），关闭所有 dsh GUI 标签页
# 2) 看清还剩哪些 node 进程、分别是干什么的
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Select-Object ProcessId, ParentProcessId, CommandLine | Format-List

# 3) 停 dsh web host 及其会话 worker（按实际 PID 替换；/T 连子进程一起）
taskkill /PID 42432 /T /F
taskkill /PID 23768 /T /F

# 若进程号已变，按命令行批量收（确认列表里只有 dsh 相关项再执行）
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'dsh|deepseek' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

**放锁验证（关键闸门，任一不满足就别往下走）**：

```powershell
tasklist /m koffi.node                     # 期望：没有任何进程列出 koffi.node
Get-Process node -ErrorAction SilentlyContinue   # 期望：空（或只剩与 dsh 无关的 node）
netstat -ano | findstr :3080               # 期望：无 LISTENING（端口已释放）
```

需要精确到"谁握着这个文件"时（Sysinternals，可选）：
```powershell
handle64.exe koffi.node
```
若 `tasklist /m` 看不到但 `handle64` 能看到，说明持有者在别的会话/位数下，按 handle 报的 PID 处理。

> 若此刻仍有 EBUSY：不要加 `--force`、不要删 `node_modules`。先等 10 秒重试一次（杀毒/索引器瞬时占用），再排查托盘/桌面端/编辑器扩展宿主等其它加载了 koffi 的进程，最后手段重启机器。**跳过验证直接重试是本任务要避免的核心错误。**

### Phase 2 · 先装 core，锁死版本

```powershell
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5
```

（等价且更明确：`npm install -g @deepseek-ai/dsh@alpha`——但 `alpha` tag 会随发布前移，可复现性不如精确版本。**唯一不能写的是裸包名。**）

### Phase 3 · 立刻校验 core（不通过就不要装 TUI）

```powershell
dsh --version                                  # 期望精确输出：0.1.2-alpha.5
npm ls -g --depth=0 @deepseek-ai/dsh           # 期望：0.1.2-alpha.5，且只有一份
```
如果这里又是 rc.2，说明 shell 里 `dsh` 命中了别的 prefix/旧 shim：
```powershell
where.exe dsh; npm prefix -g; $env:PATH -split ';' | Select-String -Pattern 'npm|nodejs'
```

### Phase 4 · 再装 TUI，同样锁版本

先查清哪个 TUI 版本与 alpha.5 配套（不要凭感觉）：
```powershell
npm view @deepseek-harness-tui/dsh-tui dist-tags
npm view @deepseek-harness-tui/dsh-tui versions --json
npm view @deepseek-harness-tui/dsh-tui@<候选版本> dependencies peerDependencies engines
```
选 `dependencies/peerDependencies` 中对 `@deepseek-ai/dsh` 的约束**能接受 0.1.2-alpha.5** 的那个版本，然后：
```powershell
npm install -g @deepseek-harness-tui/dsh-tui@<该确切版本>
```
装完再确认没有把 core 拖回去、也没有出现第二份 core：
```powershell
dsh --version                                  # 仍须是 0.1.2-alpha.5
npm ls -g --depth=0
npm ls -g @deepseek-ai/dsh                     # 期望单实例；出现 nested/多版本即需处理
```

> 允许一条命令同时装两个**都已锁版本**的包：
> `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @deepseek-harness-tui/dsh-tui@<确切版本>`
> 但**只要其中有一个没锁**，就退化成 §2.4 的漂移/降级风险。分两步装 + 每步校验，是更稳的默认做法。

### Phase 5 · 收尾：重启并确认在跑新版本

```powershell
dsh web            # 或你平时启动 host 的方式
dsh --version
```
重启后确认 GUI 能连上、插件列表里六个 Web 插件都在、端口回到 3080。

### Phase 6 · 回滚（出问题就用，别现场猜）

```powershell
npm install -g @deepseek-ai/dsh@0.1.2-alpha.4   # 回到升级前
npm install -g @deepseek-harness-tui/dsh-tui@<升级前记录的版本>
dsh --version
```
配置若被旧版/新版改写过，用 Phase 0 的 `.dsh.bak-*` 恢复。**回滚同样要先停机过 Phase 1 的闸门。**

---

## 4. 预防：插件 README 作者应该怎么改安装命令

目标：让"照抄 README 就掉坑"在结构上不可能发生。按优先级排列。

1. **消灭裸包名。** 任何 `npm install -g` 示例都必须带精确版本或显式 tag，且 tag 要在文里解释指向。反面样本（本次陷阱）：
   `npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui`
   正面：
   `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5`
   `npm install -g @deepseek-harness-tui/dsh-tui@<与上一行配套的版本>`
2. **拆开 core 与插件，分步给命令。** 一条"官方组合命令"会同时踩两个坑：无版本漂移、以及同树解析把 core 降级/去重。分步 + 每步一行"期望输出"，用户才能在某一步失败时停下。
3. **显式写清"裸装跟的是 latest，而 latest 不一定是新版本"。** 一句话就够：`latest` 是发布者手动指向的 tag，预发布线（`alpha`/`next`）通常**不**在 `latest` 上；不写版本 = 装 `latest`，可能把你**降级**。需要某条线就写 `@alpha` 或精确版本。
4. **加"停机"前置段，Windows 要专门写。** 明确：升级前退出 TUI、关闭 GUI、停掉 web host 与所有 session worker；**刷新浏览器不释放锁**；给出验证命令（`tasklist /m koffi.node`、`Get-Process node`、端口检查）。并说明为什么：`koffi.node` 是原生 FFI 模块，被进程映射期间 Windows 拒绝替换。再补一句"别用 `--force`/删 `node_modules` 绕过 EBUSY，那是掩盖症状"。
5. **禁止从 dsh 自己的会话/内置终端里执行升级。** 那条命令会杀掉承载它的 host，既大概率失败又可能留下半装状态；README 要显式要求"用系统终端"。
6. **给兼容矩阵，并在包里用 `peerDependencies` + `engines` 兜底。** 表格列：TUI 版本 ↔ dsh core 版本区间。文档写了、元数据也写了，npm 才会在解析时报警而不是静默装错。
7. **每段安装后面跟一条"断言式校验"。** 例如"运行 `dsh --version`，必须精确打印 `0.1.2-alpha.5`；不是就停下并按回滚段处理"。把"版本对不对"变成可执行的检查，而不是让用户自己看。
8. **必带回滚段与"升级前备份配置"一句。** 降级会写坏配置（schema 回退），这是二次伤害；备份 + 回滚命令能把它变成可恢复事故。
9. **给出可复现的解析说明（可选但高价值）。** 例如"本版本对应 `npm view @deepseek-ai/dsh dist-tags` 的哪个 tag、为什么不能只写包名"，让抄命令的人知道自己在跟哪条线。
10. **别把 `latest` 当成"推荐版本"的代词。** 推荐就写具体版本号；要跟线就写 tag 名，并说明该 tag 会移动、因此不适合生产复现。

一句话版给 README 作者：**命令必须自包含（版本可复现）、步骤必须可分步失败、前置条件（停机）和事后断言（版本校验）必须写在命令旁边。**

---

## 5. 遗留风险与建议复核项

- **降级已经发生过**：机器上现在是 `0.1.1-rc.2`。旧版可能已按旧 schema 重写配置；升回 alpha.5 前按 Phase 0 备份，升完若插件配置异常，用备份恢复而不是手改。
- **半装残留**：attempt 1 的 EBUSY 发生在 copyfile 阶段，可能存在 `.dsh-TMPDIR` 暂存目录或包树不完整。Phase 2 覆盖安装通常能修好；仍异常时用 `npm ls -g --depth=0` 看完整性，必要时先 `npm uninstall -g @deepseek-ai/dsh`（**停机后**）再装回。
- **TUI 兼容性未在证据中**：本报告不假设 `dsh-tui` 的具体版本，Phase 4 用 `npm view` 现场定版；若没有任何 TUI 版本支持 alpha.5，则正确做法是**先不装 TUI**（core 优先），而不是让 TUI 把 core 拖回 rc 线。
- **六个 Web 插件未在证据中**：升级后需逐个确认在 alpha.5 下仍加载；插件若声明了 core 版本区间，同样用 `npm view <pkg> peerDependencies` 核对，避免下一个"组合命令"陷阱。
- **复现性**：`latest`/`next`/`alpha` 会移动。任何写进脚本/文档的升级命令都应带精确版本，tag 只作为"人读的提示"。

---

## 附录 A · 一页纸命令清单（照抄即可）

```powershell
# --- 0. 基线（只读） ---
dsh --version; npm ls -g --depth=0; npm view @deepseek-ai/dsh dist-tags

# --- 1. 停干净 ---
# 退出 TUI、关闭 GUI 标签页
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Select ProcessId,CommandLine | Format-List
taskkill /PID 42432 /T /F
taskkill /PID 23768 /T /F
tasklist /m koffi.node                 # 必须为空
netstat -ano | findstr :3080           # 必须无 LISTENING

# --- 2. 装 core（锁版本） ---
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5
dsh --version                          # 必须是 0.1.2-alpha.5

# --- 3. 装 TUI（锁版本，先查兼容） ---
npm view @deepseek-harness-tui/dsh-tui dist-tags
npm view @deepseek-harness-tui/dsh-tui@<候选> peerDependencies dependencies
npm install -g @deepseek-harness-tui/dsh-tui@<确切版本>
dsh --version; npm ls -g @deepseek-ai/dsh   # 仍 alpha.5，且单实例

# --- 4. 重启 & 收尾 ---
dsh web
```

## 附录 B · 判断口径（面试/评审可能会追问）

- **为什么是 EBUSY 而非 EPERM/EACCES**：Windows 映射镜像的共享冲突经 libuv 上报，npm 归类为 EBUSY；本质与权限无关，所以改 ACL、管理员运行、`--force` 全部无效。
- **为什么"停 dsh"必须连 worker 一起停**：worker 由 host 派生、共享同一运行时；只杀 host 可能留下仍映射 koffi 的子进程，锁依旧在。
- **为什么刷新浏览器无效**：锁属于 host 进程的地址空间，与浏览器渲染进程生命周期无关；前端重载不重建 host。
- **为什么无版本安装会降级**：`install -g pkg` ≡ `pkg@latest`；`latest` 是 tag 不是"最大版本"；本例 `latest = 0.1.1-rc.2` 且 semver 低于已装的 `0.1.2-alpha.4`。
- **为什么 `@next` 也救不了**：当时 `next` 与 `latest` 同指向 rc.2，只有 `@alpha` 或精确版本能拿到 alpha.5。
- **为什么组合命令风险更高**：一次解析一棵树，插件的依赖区间可以反过来钉住/降级 core，且两个包都不锁时各自漂移。
