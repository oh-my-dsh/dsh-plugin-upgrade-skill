# JUDGE BRIEF · noskill.S14-link-install-lock-trap

## Criteria (sealed rubric)
- [junction-deployment] (20pt) Use profile-introspection.txt LinkType Junction, Target and/or the link marker to establish that the profile entry resolves to the repo working tree. Repo edits already change the installed copy; copying those files through the junction is unnecessary and can act on the same physical files. Distinguish this from a copied dependency installation.
- [host-lock-and-client-cache] (20pt) Relate copy-session.txt and maintainer-thread.md to the running DSH host holding the loaded lib files/old module state. Closing a browser tab does not stop the host or release its lock. Separately explain stale client delivery/browser caching and why host restart plus cache-bypassing refresh is needed. Do not treat browser caching as a filesystem lock or extrapolate this host’s serving behavior to all DSH versions.
- [rename-recovery] (20pt) Explain why renaming through the junction renamed the sole source files and made the subsequent source copy fail. Restore client.js.old2 to client.js and index.js.old2 to index.js, preserve their contents, verify both with node --check or an equivalent syntax check, then activate. Stopping the host before restoration is a valid precaution; do not require renaming while locked or recreating/deleting the files.
- [ordered-activation] (20pt) Give the actual dependency order after repo edits/recovery: fully stop the host, restart dsh web, hard-refresh/bypass browser cache, then verify the new version/feature and absence of load errors. Syntax checking alone is not activation, and restarting only the browser is insufficient. Judge semantic order rather than the textual order of paragraphs.
- [install-mode-preflight] (20pt) Before any deployment file operation, inspect the actual profile entry with LinkType/Target or the cordis.patch.yml link marker and choose the procedure for linked versus copied installation. Explain why generic copy-into-node_modules advice caused this incident. Equivalent filesystem inspection is valid.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [copy-through-junction] ceiling=40 The final recovery/deployment plan still copies repo files onto the same junction target, deletes the only surviving .old2 files, or treats the two paths as independent copies. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.
- CAP [browser-only-activation] ceiling=40 The plan says browser refresh/closure alone releases the host lock or makes the host-side edit effective, without stopping and restarting the host. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.

## Candidate report(s)
#### FILE: S14-link-install-lock-trap/report.md

# S14 · Link-Install File-Lock Trap — 分析、恢复与激活报告

> 证据包（只读）：`fixture/profile-introspection.txt`、`fixture/copy-session.txt`、`fixture/maintainer-thread.md`。下文引用格式为 文件名:行号。
> 场景：社区 Web 插件 `@org/dsh-attach-input`（lib-only，无 build step），仓库 `E:\dev\dsh-attach-input`，profile `C:\Users\me\.dsh\profiles\web`。

## 0. 结论速览

1. **profile 的插件入口不是副本**：`C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input` 是 **Junction（目录联接）**，Target = `E:\dev\dsh-attach-input`（仓库本体）（profile-introspection.txt:1-5），`cordis.patch.yml` 带 `link:E:\dev\dsh-attach-input (installed 2026-08-30)` 安装标记（profile-introspection.txt:13-14）。**repo 树就是"已安装的那份"**——link 安装下"复制文件进 node_modules"从来就不是正确动作，一步也不需要。
2. **两把锁**：EBUSY 文件锁的主人是**正在运行的 dsh host 进程**（它 require 了 lib 入口、并把 `lib\client.js` 作为客户端 bundle 通过 HTTP 提供给浏览器），浏览器从不持有服务端文件句柄；"刷新看到旧代码"来自**浏览器对 client.js 的缓存 + host 端 Node 模块缓存**。关闭浏览器 tab 对这两把锁一个都解不开（copy-session.txt:6-8）。
3. **rename-aside 自毁的原因**：junction 让 profile 路径与仓库路径**是同一个目录**，Rename-Item 改的就是仓库里的文件；随后 Copy-Item 报"source 不存在"（copy-session.txt:14-15）是必然结果。文件没有任何丢失——只是名字变成了 `client.js.old2` / `index.js.old2`，内容正是 maintainer 编辑过的新版。
4. **恢复**：完全停掉 dsh host → 把两个 `.old2` 改回原名 → `node --check` 只读验证语法 → 启动 host → 浏览器硬刷新（绕过缓存）。
5. **预检**：先用 `Get-Item ... LinkType, Target` 与 `cordis.patch.yml` 的 `link:` 标记判定安装模式（link vs copied），再决定是否允许任何 copy 动作。

---

## 1. profile 入口实际是什么：Junction 安装的部署语义

**证据（profile-introspection.txt）**：

- :1-5 —— `Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input` → `LinkType : Junction`、`Target   : {E:\dev\dsh-attach-input}`；
- :7-11 —— `Get-Item E:\dev\dsh-attach-input` → `LinkType` 与 `Target` 均为空，即仓库本体是一个**真实目录**；
- :13-14 —— `cordis.patch.yml` 中 `- node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)`。

**含义**：Junction（NTFS 目录联接/ reparse point）是目录级的别名，不是复制。`node_modules\@org\dsh-attach-input` 这个"目录"只是仓库目录的第二个名字/入口；profile 里的 `lib\client.js` 与仓库的 `lib\client.js` 是**同一个 NTFS 文件对象**。因此：

- **部署语义 = 就地编辑**。在 `E:\dev\dsh-attach-input\lib\client.js` / `lib\index.js` 保存，就是"已安装文件"被改了；不存在独立的"发布到 profile"步骤。
- 本插件是 **lib-only、无 build step**（maintainer-thread.md:3-4）：没有编译产物、没有 dist 目录，也没有任何需要搬运的字节。
- **"复制 repo 文件进 profile 的 node_modules"是否曾经正确？——从来没有（NEVER）。** Copy-Item 的源与目标解析到同一个文件，属于"把文件拷贝给自己"；Windows 对这种自我拷贝/覆盖直接抛 `IOException: ... being used by another process`（EBUSY，copy-session.txt:1-3、:8），即使没有任何其它进程在跑也会失败。它既**不必要**（没有差异可部署），也**不可能成功**。只有当 profile 里是真实副本（`LinkType` 为空、无 `link:` 标记）时，"拷贝进 node_modules"才是正确动作。

---

## 2. 两把锁与它们的主人

**锁 1：文件句柄锁（EBUSY，`being used by another process`）→ 主人是运行中的 dsh host 进程，不是浏览器。**

- **谁提供 client bundle**：dsh host（运行 `dsh web` / Web GUI 后端的 Node 进程）。它启动时通过 Node 模块加载器 `require` 了 `lib\index.js`（host 侧入口，包含新的只读 host 路由），并在收到请求时读取 `lib\client.js` 把它作为插件客户端 bundle 发给浏览器；`package.json` 同样在加载链上。copy-session.txt:1-3、:8 显示 `client.js`、`index.js`、`package.json` 全部报 EBUSY——正是这批"加载链上的文件"被进程持有。
- **为什么关掉浏览器 tab 不释放 EBUSY**：浏览器只是通过 HTTP **接收了 bundle 的字节副本**，从不持有服务端磁盘文件的句柄。句柄在 dsh host 手里（require 缓存/读取句柄）。maintainer 关 tab 后重试依旧同样报错（copy-session.txt:6-8）——因为该进程从头到尾都没停。**只有完全停止 dsh host 进程**（确认 dsh/node 进程退出，而不是断开 Web GUI 会话）才会释放句柄。
- 附带一层：由于 junction，本次 Copy-Item 同时是"自我拷贝"，即使 host 停了也照样报 EBUSY（见 §1）。

**锁 2：陈旧代码锁（为什么刷新什么也看不到）→ 主人是浏览器缓存 + host 端模块缓存。**

- **浏览器侧**：`client.js` 是带缓存语义的静态脚本资源（HTTP cache + 内存缓存 + 已经执行过的 <script>）。普通 F5 刷新经常直接复用缓存里的旧字节（304/内存缓存），根本不重新读文件 → 看不到 hover-preview。
- **host 侧**：`lib\index.js` 早已加载进 Node 的 require 缓存；**浏览器刷新永远不会让 host 重新 require**，所以新的只读 host 路由在 host 重启前不存在。即使 `client.js` 是每请求从磁盘读，host 不重启则 host 侧行为照旧。
- **归属小结**：锁 1 归 **dsh host 进程**（唯一持有文件句柄者）；锁 2 由 **浏览器缓存（client.js 字节）** 与 **dsh host（index.js 模块缓存）** 共同持有。浏览器进程对锁 1 完全无辜，对锁 2 只负一半责任——所以"关 tab / 普通刷新"两个方向都落空。

---

## 3. rename-aside 为何把 SOURCE 也毁了 + 精确恢复步骤

**为什么源目录也消失了**：junction 使 `C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input` 与 `E:\dev\dsh-attach-input` **是同一个目录**（其下 `lib\` 亦然）。maintainer 执行的：

- `Rename-Item ($dst + '\client.js') 'client.js.old2'`、`Rename-Item ($dst + '\index.js') 'index.js.old2'`（copy-session.txt:11-13）——看似"把 profile 里的锁文件挪开"，实际改的就是**仓库里的文件**；
- 随后 `Copy-Item 'E:\dev\dsh-attach-input\lib\client.js' ...` 报 `Cannot find path ... because it does not exist`（copy-session.txt:14-15）——因为源文件 1 秒前刚被自己改名；
- 两处 `Get-ChildItem` 都只剩 `client.js.old2` / `index.js.old2`（copy-session.txt:16-22）——不是"两份目录各丢一次"，而是**同一个目录被从两个名字看过去**，只丢了一次文件名。

**数据安全评估**：没有任何字节丢失。`Copy-Item` 从未成功覆盖过任何文件，因此 `.old2` 文件的内容就是 maintainer 在 `E:\dev\dsh-attach-input\lib` 里编辑好的**新版**（hover-preview + 新只读 host 路由，maintainer-thread.md:6-7）；坏掉的只是**文件名**——插件入口文件名缺失导致 host/加载器找不到入口，插件"完全不可用"。

**精确恢复（从"只剩 .old2"的现状）**：

1. **先完全停止 dsh host**（释放残留句柄，避免 rename 撞锁，也保证重启时干净地重新 require）：退出 `dsh web`/停止 host 守护进程，用任务管理器或 `Get-Process node` 确认进程确实退出。
2. **恢复原名**（两个路径是同一目录，任选其一；用 Rename-Item/Move-Item，**绝不要 Copy-Item**）：

   ```powershell
   $lib = 'E:\dev\dsh-attach-input\lib'   # 也可用 ...\node_modules\@org\dsh-attach-input\lib —— 同一目录
   Rename-Item "$lib\client.js.old2" 'client.js'
   Rename-Item "$lib\index.js.old2"  'index.js'
   Get-ChildItem $lib    # 应看到 client.js、index.js；不应再有 .old2
   ```

3. **语法验证**（`node --check` 是只读解析检查，不执行插件代码、不改文件）：

   ```powershell
   node --check "$lib\client.js"
   node --check "$lib\index.js"
   ```

   两条命令都无输出且退出码 0 才继续；若报语法错误，直接按报错行修复（`.old2` 之外没有更多备份）。
4. **启动 dsh host**（`dsh web`）。
5. **浏览器硬刷新并验证新代码**（见 §4 步骤 4-5）。

注意：`.old2` 是"新版内容 + 错误文件名"，所以恢复 = **恢复文件名**，不是回滚代码；恢复后仓库与 profile 依旧通过 junction 保持同一份文件，二者同时痊愈。

---

## 4. link-installed lib-only Web 插件：编辑仓库后的完整激活顺序

前置（本次已完成）：改动就地保存在 `E:\dev\dsh-attach-input\lib\client.js`、`lib\index.js`（maintainer-thread.md:6-7）；lib-only、无 build step → **没有编译步骤、没有复制步骤**。

1. **预检安装模式**（§5）——判定为 link 安装后，**跳过一切 copy 动作**。
2. **完全停止 host 进程**：退出 `dsh web` / 停止 dsh host 守护进程，确认 dsh/node 进程真正退出。要点：必须是"进程完全结束"，**只关浏览器 tab、断开 Web GUI、注销会话都不算**；host 是独立于浏览器的服务进程。
3. **重新启动 host**：host 重新 require `lib\index.js` → 新的只读 host 路由生效；同时旧句柄被释放、文件重新打开。
4. **浏览器硬刷新**：Ctrl+Shift+R（macOS Cmd+Shift+R），或 DevTools → Network 勾选 `Disable cache` 后 F5。为什么必须"硬"：`client.js` 走 HTTP 缓存/内存缓存，普通刷新可能直接用旧字节；硬刷新带 `Cache-Control: no-cache` 语义绕过缓存强制回源。若 Web GUI 注册过 service worker，还需在 DevTools → Application → Service Workers 里 Unregister/Update 后再刷。
   - **顺序铁律**：host 先停后启 → **然后**才硬刷新。反过来没用：刷新不能让 host 重新 require（host 侧必须重启），host 重启也不能清掉浏览器缓存（浏览器侧必须硬刷新）——两者各解一把锁（§2）。
5. **验证新代码真的加载了**（不要只看"页面能开"）：
   - DevTools → Network：`client.js` 的响应为 **200** 且来源**不是** `from disk cache`/`from memory cache`，Size 非 0；
   - DevTools → Sources（或直接看响应内容）：在 `client.js` 里搜索新增标识（hover-preview 的函数名/特征字符串、版本号 `v0.2.11`）确认字节是新版；
   - 功能验证：悬停图片附件 → 预览出现；
   - host 侧验证：请求新的只读 host 路由 → 200 且返回预期结构；
   - 可靠技巧：编辑时顺手加一次性加载标记，如 `console.debug('[dsh-attach-input v0.2.11] client loaded')`，控制台看到它即证明新 bundle 已执行。

---

## 5. 触碰任何文件之前的预检：如何判定安装模式

**只读预检命令**：

```powershell
Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input |
  Select-Object FullName, LinkType, Target
Get-Content C:\Users\me\.dsh\profiles\web\cordis.patch.yml | Select-String dsh-attach-input
```

**判读规则**：

| 观察 | 判定 | 部署动作 |
| --- | --- | --- |
| `LinkType : Junction`（或 `SymbolicLink`）+ `Target : {E:\dev\dsh-attach-input}` | **link 安装** | 就地编辑仓库文件；重启 host + 硬刷新；**禁止任何 copy** |
| `LinkType` 为空、Target 空、是真实目录，且 patch 标记**不带** `link:` | **copied 依赖** | 才允许/需要把构建产物复制进 `node_modules`（并注意版本一致性） |

- **cordis.patch.yml 安装标记**是第二证据源：`- node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)`（profile-introspection.txt:13-14）——`link:` 前缀 + 安装日期，一眼可判；copied 安装的标记不含 `link:` 路径。

**为什么通用的"copy into node_modules"建议对 link 安装是主动有害的**：

1. **源 = 目标**：自我拷贝必然抛 EBUSY/"being used by another process"，把排障引向"找谁占用了文件、关浏览器、关杀软"，而真正的问题只是**安装模式判断错误**；
2. **变体更危险**：rename-aside 一类"绕过锁"的技巧会直接改坏仓库本体（§3），把一次部署升级成事故；
3. **制造不存在的流程**：link 安装下 repo 树就是已安装副本，根本没有"可部署的差异"；照做只会引入幻觉步骤与幻觉故障；
4. **模式混淆**：该建议只在 copied 依赖下成立；不区分两种模式正是本次事故的根源。正确顺序永远是：**先判模式（§5 预检），再动文件**。

---

## 6. 证据引用索引

- profile-introspection.txt:1-5（Junction / Target 指向仓库）、:7-11（仓库本体是真实目录）、:13-14（cordis.patch.yml 的 `link:` 安装标记）
- copy-session.txt:1-8（Copy-Item EBUSY；关浏览器 tab 后重试依旧）、:10-22（rename-aside 自毁全过程：rename 成功、copy 报"source 不存在"、两个路径同现状）
- maintainer-thread.md:3-17（事故时间线：直接编辑 lib → 只刷新浏览器 → 误判 copied 安装 → EBUSY → rename-aside → 最后才看 introspection）

## run-stats

- toolcalls 总数：24（8 次 run_code 执行 + 16 次内部工具调用：glob×1、read×8、write×6、send_message×1）
- token 用量：n/a（本会话不暴露 token 计数）
- 完成时间：2026/10/21 14:59:46（Asia/Shanghai） / 2026-10-21T06:59:46.291Z


#### FILE: report.md

# S14 · Link-Install File-Lock Trap — 分析、恢复与激活报告

> 证据包（只读）：`fixture/profile-introspection.txt`、`fixture/copy-session.txt`、`fixture/maintainer-thread.md`。下文引用格式为 文件名:行号。
> 场景：社区 Web 插件 `@org/dsh-attach-input`（lib-only，无 build step），仓库 `E:\dev\dsh-attach-input`，profile `C:\Users\me\.dsh\profiles\web`。

## 0. 结论速览

1. **profile 的插件入口不是副本**：`C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input` 是 **Junction（目录联接）**，Target = `E:\dev\dsh-attach-input`（仓库本体）（profile-introspection.txt:1-5），`cordis.patch.yml` 带 `link:E:\dev\dsh-attach-input (installed 2026-08-30)` 安装标记（profile-introspection.txt:13-14）。**repo 树就是"已安装的那份"**——link 安装下"复制文件进 node_modules"从来就不是正确动作，一步也不需要。
2. **两把锁**：EBUSY 文件锁的主人是**正在运行的 dsh host 进程**（它 require 了 lib 入口、并把 `lib\client.js` 作为客户端 bundle 通过 HTTP 提供给浏览器），浏览器从不持有服务端文件句柄；"刷新看到旧代码"来自**浏览器对 client.js 的缓存 + host 端 Node 模块缓存**。关闭浏览器 tab 对这两把锁一个都解不开（copy-session.txt:6-8）。
3. **rename-aside 自毁的原因**：junction 让 profile 路径与仓库路径**是同一个目录**，Rename-Item 改的就是仓库里的文件；随后 Copy-Item 报"source 不存在"（copy-session.txt:14-15）是必然结果。文件没有任何丢失——只是名字变成了 `client.js.old2` / `index.js.old2`，内容正是 maintainer 编辑过的新版。
4. **恢复**：完全停掉 dsh host → 把两个 `.old2` 改回原名 → `node --check` 只读验证语法 → 启动 host → 浏览器硬刷新（绕过缓存）。
5. **预检**：先用 `Get-Item ... LinkType, Target` 与 `cordis.patch.yml` 的 `link:` 标记判定安装模式（link vs copied），再决定是否允许任何 copy 动作。

---

## 1. profile 入口实际是什么：Junction 安装的部署语义

**证据（profile-introspection.txt）**：

- :1-5 —— `Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input` → `LinkType : Junction`、`Target   : {E:\dev\dsh-attach-input}`；
- :7-11 —— `Get-Item E:\dev\dsh-attach-input` → `LinkType` 与 `Target` 均为空，即仓库本体是一个**真实目录**；
- :13-14 —— `cordis.patch.yml` 中 `- node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)`。

**含义**：Junction（NTFS 目录联接/ reparse point）是目录级的别名，不是复制。`node_modules\@org\dsh-attach-input` 这个"目录"只是仓库目录的第二个名字/入口；profile 里的 `lib\client.js` 与仓库的 `lib\client.js` 是**同一个 NTFS 文件对象**。因此：

- **部署语义 = 就地编辑**。在 `E:\dev\dsh-attach-input\lib\client.js` / `lib\index.js` 保存，就是"已安装文件"被改了；不存在独立的"发布到 profile"步骤。
- 本插件是 **lib-only、无 build step**（maintainer-thread.md:3-4）：没有编译产物、没有 dist 目录，也没有任何需要搬运的字节。
- **"复制 repo 文件进 profile 的 node_modules"是否曾经正确？——从来没有（NEVER）。** Copy-Item 的源与目标解析到同一个文件，属于"把文件拷贝给自己"；Windows 对这种自我拷贝/覆盖直接抛 `IOException: ... being used by another process`（EBUSY，copy-session.txt:1-3、:8），即使没有任何其它进程在跑也会失败。它既**不必要**（没有差异可部署），也**不可能成功**。只有当 profile 里是真实副本（`LinkType` 为空、无 `link:` 标记）时，"拷贝进 node_modules"才是正确动作。

---

## 2. 两把锁与它们的主人

**锁 1：文件句柄锁（EBUSY，`being used by another process`）→ 主人是运行中的 dsh host 进程，不是浏览器。**

- **谁提供 client bundle**：dsh host（运行 `dsh web` / Web GUI 后端的 Node 进程）。它启动时通过 Node 模块加载器 `require` 了 `lib\index.js`（host 侧入口，包含新的只读 host 路由），并在收到请求时读取 `lib\client.js` 把它作为插件客户端 bundle 发给浏览器；`package.json` 同样在加载链上。copy-session.txt:1-3、:8 显示 `client.js`、`index.js`、`package.json` 全部报 EBUSY——正是这批"加载链上的文件"被进程持有。
- **为什么关掉浏览器 tab 不释放 EBUSY**：浏览器只是通过 HTTP **接收了 bundle 的字节副本**，从不持有服务端磁盘文件的句柄。句柄在 dsh host 手里（require 缓存/读取句柄）。maintainer 关 tab 后重试依旧同样报错（copy-session.txt:6-8）——因为该进程从头到尾都没停。**只有完全停止 dsh host 进程**（确认 dsh/node 进程退出，而不是断开 Web GUI 会话）才会释放句柄。
- 附带一层：由于 junction，本次 Copy-Item 同时是"自我拷贝"，即使 host 停了也照样报 EBUSY（见 §1）。

**锁 2：陈旧代码锁（为什么刷新什么也看不到）→ 主人是浏览器缓存 + host 端模块缓存。**

- **浏览器侧**：`client.js` 是带缓存语义的静态脚本资源（HTTP cache + 内存缓存 + 已经执行过的 <script>）。普通 F5 刷新经常直接复用缓存里的旧字节（304/内存缓存），根本不重新读文件 → 看不到 hover-preview。
- **host 侧**：`lib\index.js` 早已加载进 Node 的 require 缓存；**浏览器刷新永远不会让 host 重新 require**，所以新的只读 host 路由在 host 重启前不存在。即使 `client.js` 是每请求从磁盘读，host 不重启则 host 侧行为照旧。
- **归属小结**：锁 1 归 **dsh host 进程**（唯一持有文件句柄者）；锁 2 由 **浏览器缓存（client.js 字节）** 与 **dsh host（index.js 模块缓存）** 共同持有。浏览器进程对锁 1 完全无辜，对锁 2 只负一半责任——所以"关 tab / 普通刷新"两个方向都落空。

---

## 3. rename-aside 为何把 SOURCE 也毁了 + 精确恢复步骤

**为什么源目录也消失了**：junction 使 `C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input` 与 `E:\dev\dsh-attach-input` **是同一个目录**（其下 `lib\` 亦然）。maintainer 执行的：

- `Rename-Item ($dst + '\client.js') 'client.js.old2'`、`Rename-Item ($dst + '\index.js') 'index.js.old2'`（copy-session.txt:11-13）——看似"把 profile 里的锁文件挪开"，实际改的就是**仓库里的文件**；
- 随后 `Copy-Item 'E:\dev\dsh-attach-input\lib\client.js' ...` 报 `Cannot find path ... because it does not exist`（copy-session.txt:14-15）——因为源文件 1 秒前刚被自己改名；
- 两处 `Get-ChildItem` 都只剩 `client.js.old2` / `index.js.old2`（copy-session.txt:16-22）——不是"两份目录各丢一次"，而是**同一个目录被从两个名字看过去**，只丢了一次文件名。

**数据安全评估**：没有任何字节丢失。`Copy-Item` 从未成功覆盖过任何文件，因此 `.old2` 文件的内容就是 maintainer 在 `E:\dev\dsh-attach-input\lib` 里编辑好的**新版**（hover-preview + 新只读 host 路由，maintainer-thread.md:6-7）；坏掉的只是**文件名**——插件入口文件名缺失导致 host/加载器找不到入口，插件"完全不可用"。

**精确恢复（从"只剩 .old2"的现状）**：

1. **先完全停止 dsh host**（释放残留句柄，避免 rename 撞锁，也保证重启时干净地重新 require）：退出 `dsh web`/停止 host 守护进程，用任务管理器或 `Get-Process node` 确认进程确实退出。
2. **恢复原名**（两个路径是同一目录，任选其一；用 Rename-Item/Move-Item，**绝不要 Copy-Item**）：

   ```powershell
   $lib = 'E:\dev\dsh-attach-input\lib'   # 也可用 ...\node_modules\@org\dsh-attach-input\lib —— 同一目录
   Rename-Item "$lib\client.js.old2" 'client.js'
   Rename-Item "$lib\index.js.old2"  'index.js'
   Get-ChildItem $lib    # 应看到 client.js、index.js；不应再有 .old2
   ```

3. **语法验证**（`node --check` 是只读解析检查，不执行插件代码、不改文件）：

   ```powershell
   node --check "$lib\client.js"
   node --check "$lib\index.js"
   ```

   两条命令都无输出且退出码 0 才继续；若报语法错误，直接按报错行修复（`.old2` 之外没有更多备份）。
4. **启动 dsh host**（`dsh web`）。
5. **浏览器硬刷新并验证新代码**（见 §4 步骤 4-5）。

注意：`.old2` 是"新版内容 + 错误文件名"，所以恢复 = **恢复文件名**，不是回滚代码；恢复后仓库与 profile 依旧通过 junction 保持同一份文件，二者同时痊愈。

---

## 4. link-installed lib-only Web 插件：编辑仓库后的完整激活顺序

前置（本次已完成）：改动就地保存在 `E:\dev\dsh-attach-input\lib\client.js`、`lib\index.js`（maintainer-thread.md:6-7）；lib-only、无 build step → **没有编译步骤、没有复制步骤**。

1. **预检安装模式**（§5）——判定为 link 安装后，**跳过一切 copy 动作**。
2. **完全停止 host 进程**：退出 `dsh web` / 停止 dsh host 守护进程，确认 dsh/node 进程真正退出。要点：必须是"进程完全结束"，**只关浏览器 tab、断开 Web GUI、注销会话都不算**；host 是独立于浏览器的服务进程。
3. **重新启动 host**：host 重新 require `lib\index.js` → 新的只读 host 路由生效；同时旧句柄被释放、文件重新打开。
4. **浏览器硬刷新**：Ctrl+Shift+R（macOS Cmd+Shift+R），或 DevTools → Network 勾选 `Disable cache` 后 F5。为什么必须"硬"：`client.js` 走 HTTP 缓存/内存缓存，普通刷新可能直接用旧字节；硬刷新带 `Cache-Control: no-cache` 语义绕过缓存强制回源。若 Web GUI 注册过 service worker，还需在 DevTools → Application → Service Workers 里 Unregister/Update 后再刷。
   - **顺序铁律**：host 先停后启 → **然后**才硬刷新。反过来没用：刷新不能让 host 重新 require（host 侧必须重启），host 重启也不能清掉浏览器缓存（浏览器侧必须硬刷新）——两者各解一把锁（§2）。
5. **验证新代码真的加载了**（不要只看"页面能开"）：
   - DevTools → Network：`client.js` 的响应为 **200** 且来源**不是** `from disk cache`/`from memory cache`，Size 非 0；
   - DevTools → Sources（或直接看响应内容）：在 `client.js` 里搜索新增标识（hover-preview 的函数名/特征字符串、版本号 `v0.2.11`）确认字节是新版；
   - 功能验证：悬停图片附件 → 预览出现；
   - host 侧验证：请求新的只读 host 路由 → 200 且返回预期结构；
   - 可靠技巧：编辑时顺手加一次性加载标记，如 `console.debug('[dsh-attach-input v0.2.11] client loaded')`，控制台看到它即证明新 bundle 已执行。

---

## 5. 触碰任何文件之前的预检：如何判定安装模式

**只读预检命令**：

```powershell
Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input |
  Select-Object FullName, LinkType, Target
Get-Content C:\Users\me\.dsh\profiles\web\cordis.patch.yml | Select-String dsh-attach-input
```

**判读规则**：

| 观察 | 判定 | 部署动作 |
| --- | --- | --- |
| `LinkType : Junction`（或 `SymbolicLink`）+ `Target : {E:\dev\dsh-attach-input}` | **link 安装** | 就地编辑仓库文件；重启 host + 硬刷新；**禁止任何 copy** |
| `LinkType` 为空、Target 空、是真实目录，且 patch 标记**不带** `link:` | **copied 依赖** | 才允许/需要把构建产物复制进 `node_modules`（并注意版本一致性） |

- **cordis.patch.yml 安装标记**是第二证据源：`- node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)`（profile-introspection.txt:13-14）——`link:` 前缀 + 安装日期，一眼可判；copied 安装的标记不含 `link:` 路径。

**为什么通用的"copy into node_modules"建议对 link 安装是主动有害的**：

1. **源 = 目标**：自我拷贝必然抛 EBUSY/"being used by another process"，把排障引向"找谁占用了文件、关浏览器、关杀软"，而真正的问题只是**安装模式判断错误**；
2. **变体更危险**：rename-aside 一类"绕过锁"的技巧会直接改坏仓库本体（§3），把一次部署升级成事故；
3. **制造不存在的流程**：link 安装下 repo 树就是已安装副本，根本没有"可部署的差异"；照做只会引入幻觉步骤与幻觉故障；
4. **模式混淆**：该建议只在 copied 依赖下成立；不区分两种模式正是本次事故的根源。正确顺序永远是：**先判模式（§5 预检），再动文件**。

---

## 6. 证据引用索引

- profile-introspection.txt:1-5（Junction / Target 指向仓库）、:7-11（仓库本体是真实目录）、:13-14（cordis.patch.yml 的 `link:` 安装标记）
- copy-session.txt:1-8（Copy-Item EBUSY；关浏览器 tab 后重试依旧）、:10-22（rename-aside 自毁全过程：rename 成功、copy 报"source 不存在"、两个路径同现状）
- maintainer-thread.md:3-17（事故时间线：直接编辑 lib → 只刷新浏览器 → 误判 copied 安装 → EBUSY → rename-aside → 最后才看 introspection）

## run-stats

- toolcalls 总数：24（8 次 run_code 执行 + 16 次内部工具调用：glob×1、read×8、write×6、send_message×1）
- token 用量：n/a（本会话不暴露 token 计数）
- 完成时间：2026/10/21 14:59:46（Asia/Shanghai） / 2026-10-21T06:59:46.291Z


#### FILE: tool-transcript.txt

1. run_code 列出 fixture 证据包文件清单（内部 glob）
2. glob pattern=**/* path=E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S14-link-install-lock-trap\fixture
3. run_code 读取 README.md 与 profile-introspection.txt（内部 read x2）
4. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S14-link-install-lock-trap\fixture\README.md
5. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S14-link-install-lock-trap\fixture\profile-introspection.txt
6. run_code 读取 copy-session.txt 与 maintainer-thread.md（内部 read x2）
7. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S14-link-install-lock-trap\fixture\copy-session.txt
8. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S14-link-install-lock-trap\fixture\maintainer-thread.md
9. run_code 写分析报告 report.md 到两个输出路径（内部 write x2）
10. write E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S14-link-install-lock-trap\agent-output\S14-link-install-lock-trap\report.md
11. write E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S14-link-install-lock-trap\agent-output\report.md
12. run_code 回读 report.md 验证非空与渲染（内部 read x1）
13. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S14-link-install-lock-trap\agent-output\report.md
14. run_code 检查报告中段并定位残留占位符（内部 read x2）
15. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S14-link-install-lock-trap\agent-output\report.md (offset=40 limit=77)
16. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S14-link-install-lock-trap\agent-output\report.md
17. run_code 修正交叉引用与 run-stats 并写 tool-transcript/manifest（内部 read x1 + write x4）
18. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S14-link-install-lock-trap\agent-output\report.md
19. write E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S14-link-install-lock-trap\agent-output\S14-link-install-lock-trap\report.md
20. write E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S14-link-install-lock-trap\agent-output\report.md
21. write E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S14-link-install-lock-trap\agent-output\tool-transcript.txt
22. write E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S14-link-install-lock-trap\agent-output\transcript-manifest.txt
23. run_code 向父代理发送自包含结果（内部 send_message x1）
24. send_message agent_id=session-5d3ebe0e-127d-4dc4-a3b9-cb2199b04f8e


#### FILE: transcript-manifest.txt

R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S14-link-install-lock-trap\fixture\
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S14-link-install-lock-trap\fixture\README.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S14-link-install-lock-trap\fixture\profile-introspection.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S14-link-install-lock-trap\fixture\copy-session.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S14-link-install-lock-trap\fixture\maintainer-thread.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S14-link-install-lock-trap\agent-output\report.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S14-link-install-lock-trap\agent-output\S14-link-install-lock-trap\report.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S14-link-install-lock-trap\agent-output\report.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S14-link-install-lock-trap\agent-output\tool-transcript.txt
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S14-link-install-lock-trap\agent-output\transcript-manifest.txt


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.