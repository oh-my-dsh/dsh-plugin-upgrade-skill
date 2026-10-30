# JUDGE BRIEF · noskill.S16-self-host-upgrade-trap

## Criteria (sealed rubric)
- [self-host-failure] (20pt) Use agent-session-log.txt and env-state.txt to connect the session/tool worker to the host installation npm is replacing. The running host dies during replacement, the GUI disconnects and the caller cannot record a completed tool result. Recognize this self-host dependency hazard instead of calling it a random network failure; preserve the log’s unknown final tool outcome. Do not require a universal claim that every in-place upgrade on every platform must crash.
- [interrupted-install-signature] (20pt) Explain env-state.txt: package content exists but dsh/dsh.cmd are missing and dsh.ps1 is stale, so the CLI entry points are broken and content presence does not prove a complete install. Relate the nonstandard/manually swapped tree to the broken shim state and reject hand-swapping directories or hand-writing shims as the repair.
- [external-pinned-repair] (20pt) Ground the remedy in repair-notes.md: rerun npm install -g @deepseek-ai/dsh@0.1.2-rc.1 from an external terminal/tool outside the stopped target host so npm regenerates the shims; verify dsh --version equals rc.1. Account for aligning the reference source checkout to the same tag when used, without demanding unrelated source edits. Describe the recorded repair and proposed verification separately from actions performed by the candidate.
- [handoff-protocol] (20pt) The agent must recognize it is running on the upgrade target and hand off, not execute the global install in that session. The external procedure fully stops the host before the exact-version npm install, then restarts the host, refreshes the browser and verifies. Explain that stop-host-first and exact version pinning are established rules, while refusing execution from inside the target host is the additional self-host rule. An external shell launched as a dependent tool inside the dying host is not an independent handoff.
- [guard-and-postupgrade-checks] (20pt) Describe an agent guard that relates the requested upgrade target to its own runtime/worker path. Use repair-notes.md’s alpha.5→rc.1 version-only diff to avoid needless plugin API migration; check local displayed version markers and actual plugin loading after restart/refresh, with optional backup cleanup only after successful verification. Keep this no-code-change conclusion specific to the supplied tags.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [execute-inside-target] ceiling=20 The agent’s final plan executes or retries the global upgrade from a session/tool worker on the target host, or runs the upgrade while that host is still live. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.
- CAP [manual-shim-repair] ceiling=40 The final fix substitutes manual directory swaps or handmade shims for the formal external pinned installation. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.

## Candidate report(s)
#### FILE: S16-self-host-upgrade-trap/report.md

# S16 · The Self-Host Upgrade Trap —— 根因、修复与协议报告

- 任务格：S16-self-host-upgrade-trap（noskill 臂）
- 证据包（只读，已保持逐字节不变）：fixture/README.md、fixture/agent-session-log.txt、fixture/env-state.txt、fixture/repair-notes.md
- 报告完成时间：2026-10-21T15:03:42+08:00（详见文末 run-stats）

---

## 0. 证据要点（仅列要点 + 文件 ID，不全文粘贴）

- **[agent-session-log.txt]** —— 会话内工具调用 pwsh: npm install -g @deepseek-ai/dsh@0.1.2-rc.1（在宿主自己的 worker 进程内执行）。时间线：16:41:02 warn cleaning → 16:41:05 info remove → 16:41:09 info fetch → 16:41:31 info linkStuff；就在 linkStuff 阶段 web GUI 会话死亡（浏览器 connection lost）。工具结果：「no result recorded —— 调用已被记录但没有持久化结果，成败未知」。随后新 shell 中 dsh --version、dsh web 均报「not recognized」；dir $env:APPDATA\npm | Select-String dsh 显示：dsh.ps1 陈旧（指向旧树）、dsh.cmd 缺失、node_modules\@deepseek-ai\dsh 在位但部分替换、node_modules\@deepseek-ai\dsh-old-0.1.1-rc.1 备份在位。
- **[env-state.txt]** —— BEFORE：0.1.2-alpha.5 健康（dsh web host 运行、GUI http://127.0.0.1:3080、会话就在该宿主进程内、npm 全局树含 dsh-old-* 备份、dsh/dsh.cmd/dsh.ps1 三个 shim 齐全）。AFTER：宿主死亡、dsh 命令消失、包内容（rc.1 文件）在位但「NOT a standard install」（其中一部分是用户手工修补时放进去的）、dsh.cmd 与 dsh 缺失、dsh.ps1 陈旧；结论：dsh CLI 不可用，只能由外部工具（另一个 agent CLI）修复安装。
- **[repair-notes.md]** —— 外部修复会话（另一个 agent CLI，运行在 dsh 之外）：① 从 registry 重跑正式安装 npm install -g @deepseek-ai/dsh@0.1.2-rc.1 → dsh / dsh.cmd / dsh.ps1 全部再生，dsh --version → 0.1.2-rc.1；② 源码 checkout 从 alpha.5 tag 对齐到 dsh-v0.1.2-rc.1 tag，无本地修改冲突。关键发现：dsh-v0.1.2-alpha.5..dsh-v0.1.2-rc.1 diff 共 252 个文件，全部是 package.json 版本号变更，零 API/功能变更 → 已按 0.1.2-alpha.x 迁移的插件无需再迁移。遗留：真实机验证（dsh --profile web、硬刷新浏览器、确认插件 whale / progress 等加载）；确认 rc.1 后可选清理 dsh-old-* 备份目录。

---

## 1. 结构性根因：为什么“在运行中的 dsh 会话内全局升级 dsh”必然失败，而不是偶发失败

**1.1 会话和它的 tool worker 就是 npm 要替换的那个东西本身。**
出问题的会话是一个 dsh web 会话，运行在 dsh 宿主进程里（host process = node .../node_modules/@deepseek-ai/dsh/...）。也就是说：执行这条 npm 命令的 pwsh tool worker，是该宿主进程派生的子进程；负责监督、记录、回传工具结果的会话运行时（tool-call 记录/回传链路）本身就在 @deepseek-ai/dsh 这个 npm 包的安装树里。而 npm install -g @deepseek-ai/dsh@0.1.2-rc.1 的变更对象，恰好就是全局树里的这同一个包目录。执行者位于被执行对象的内部——这是一次自我截肢式的“自宿主升级”。

**1.2 谁先死：宿主进程树先死，记录链路随之消失。**
npm 的生命周期顺序在日志里写得很清楚：cleaning → remove（删除旧包）→ fetch（取新包）→ linkStuff（放文件、重建 bin 链接/shim）。remove 那一步删掉的正是宿主进程正在运行的代码树（Windows 上 node 已加载的模块留在内存里，进程可能“瘸着走几步”，但任何懒加载 require、原生模块、子进程派生、以及所有指向该树的 shim 路径都已失效）；到 linkStuff 阶段宿主与 GUI 彻底死亡（浏览器 connection lost）。宿主一死，就没有任何进程来监督这条工具调用、持久化它的结果、再把结果回传给会话——所以日志里出现的是「[tool result] 无结果记录、结局未知」，而不是一条 npm 的成功/失败输出。工具调用“没有返回结果”不是因为它被 npm 异常中断，而是因为“能返回结果的那个东西”正是被替换掉的对象。

**1.3 为什么是“必然”而不是“碰巧”。**
这条操作的拓扑是自指的：行动者住在被操作对象里面。无论 npm 走到哪一步，只要它履行自己的职责（删除并替换旧安装树），就一定先于“结果回传”摧毁监督者。即使 npm 完美成功，会话/GUI 也会因自身安装被替换而死亡，从会话的视角看这条工具调用同样永远拿不到结果；而中途被打断则留下半替换的树。所以：在会话内重试一百次都是同一个结局——结构性失败，不是 flaky。

---

## 2. 事后破损状态：为什么包内容还在、dsh 命令却消失了，以及为什么手工搬目录/打补丁会更糟

**2.1 命令消失的机制（来自 env-state.txt 与 agent-session-log.txt）。**
Windows 上的 dsh 命令不是靠“包目录存在”就能用的：它靠 %APPDATA%\npm 下 npm 在 bin 链接（linkStuff）阶段生成的 shim 文件（dsh、dsh.cmd、dsh.ps1）来解析与转发。npm 在 remove 阶段把旧包连同旧 bin 链接一起删掉，随后在 linkStuff 阶段重建——而宿主恰好死在这两个阶段之间/之中。于是出现本次事故的标志性签名：**包内容在位（rc.1 文件已落地），shim 却缺失或陈旧**（dsh.cmd 与 dsh MISSING、dsh.ps1 STALE 且指向旧树）。此外用户还做过一次部分手工修复（env-state.txt：部分 rc.1 文件“by hand”放进去；repair-notes.md：目录被“replaced/manually swapped”），结果是“NOT a standard install”：目录里有内容，但 npm 的安装收据/元数据、bin 链接、生命周期脚本的产物都不一致。命令消失 ≠ 包丢失；包存在 ≠ 安装成立。

**2.2 为什么手工交换/修补目录会把问题弄得更糟。**
① 绕过 npm 安装生命周期：不生成 bin 链接、不跑生命周期脚本、不更新 npm 全局元数据——之后任何 npm install/uninstall 都在操作一个它不认识的状态，可能拒绝或继续叠加损坏。② 版本/指针错乱：陈旧的 dsh.ps1 指向旧树，真执行起来会跑旧代码或直接死；半替换的 rc.1 目录与 dsh-old-0.1.1-rc.1 备份并存，模块解析可能混用两套代码。③ 无法验证完整性：手工放进去的文件没有校验和/收据，无法证明“哪些文件属于哪个版本”，日后只会表现为诡异运行时行为而不是干净报错。④ 危险窗口还在：只要还有任何进程从该树运行，继续手工搬文件就重现“替换正在运行的安装”这一原始风险。正确做法只有一种：让 npm 从 registry 完整地重做一次正式安装（整树 + shim + 元数据一次性一致落地），而不是继续手补。

---

## 3. 实际采用的修复：修复笔记做了什么、为什么这种修复有效、如何验证

**3.1 修复动作（repair-notes.md）。**
由**运行在 dsh 之外**的另一个 agent CLI 执行：① 从 registry 重跑正式安装 npm install -g @deepseek-ai/dsh@0.1.2-rc.1 → dsh / dsh.cmd / dsh.ps1 全部再生，dsh --version → 0.1.2-rc.1；② 把作为 host 源参考的源码 checkout 从 alpha.5 tag 对齐到 dsh-v0.1.2-rc.1 tag（无本地修改冲突）。

**3.2 为什么这种形式有效，而会话内那次不可能有效。**
修复的执行上下文在被替换的树**之外**：不存在自宿主依赖，npm 可以自由删除/重建全局树并重新生成 bin 链接，监督进程不会被自己发起的安装杀死，结果能被完整记录。而且它是一次**完整的标准安装**——整树、shim、npm 元数据一次性一致落地——这恰好补齐了中断安装 + 手工修补所缺失的“标准性”：命令解析链（shim → 当前树）与包内容重新对齐。

**3.3 验证方式（三层）。**
① shim 层：dsh / dsh.cmd / dsh.ps1 全部再生且不再指向旧树；② 版本层：dsh --version → 0.1.2-rc.1；③ 行为层（留给用户的真实机验证）：dsh --profile web 启动、浏览器硬刷新、确认插件加载（whale / progress 等）。另外源码 checkout 已对齐 dsh-v0.1.2-rc.1 tag。关键发现直接决定了升级风险面：alpha.5..rc.1 差异仅 252 个 package.json 版本号、零 API/功能变更。

---

## 4. 代理本应遵循的协议：识别“我就是升级对象”，然后把操作交出去

**4.1 应当识别的自我关系。**
代理必须认识到：它自己的会话与其 tool worker 是“将被 npm 替换的那个包”的进程——宿主源就在全局安装树里。对一个活着的、自宿主的运行时做全局自升级，属于结构性禁区；失败不是运气问题，而是拓扑问题（见 §1）。

**4.2 是否应当执行这次全局安装？不应当。**
只要还有任何 dsh host/session 从该全局树运行（包括代理自己所在的会话），就绝不应执行 npm install -g 目标为 @deepseek-ai/dsh 的命令。正确边界是：“识别 + 规划 + 交接清单归我；执行归用户/外部上下文”。

**4.3 应交给用户的确切外部流程（顺序不可换）。**
1. **npm 运行之前必须先发生的事**：结束升级目标的运行时——关闭 dsh web GUI 标签页、彻底停止 dsh web host 进程，确认没有任何 node 进程运行自 %APPDATA%\npm\node_modules\@deepseek-ai\dsh；此后所有步骤都在普通终端或外部 CLI（**不是任何 dsh 会话**）中完成。
2. **安装命令必须长这样**：npm install -g @deepseek-ai/dsh@0.1.2-rc.1 —— 精确版本钉死（不是 latest、不是裸包名，目标确定、可复现、可核验）、带 -g（更新的正是全局树与 shim）、执行上下文完全在 dsh 之外（保证删旧树时不会杀死自己的监督进程，结果可被记录）。
3. **验证**：dsh --version → 0.1.2-rc.1；%APPDATA%\npm 下 dsh、dsh.cmd、dsh.ps1 齐全且 dsh.ps1 指向当前树（不得指向 dsh-old-*）；npm ls -g --depth=0 显示标准安装。
4. **重启与冒烟**：启动 dsh --profile web（或 dsh web），硬刷新浏览器，确认插件加载（whale / progress 等）。
5. **收尾**：确认 rc.1 正常后，清理 dsh-old-* 备份目录；确认之前保留。

**4.4 哪些是既有升级规则的直接推论，哪些是本事故新增。**
- **已有升级规则即可推出**：精确钉版本（不追 latest）；安装步骤按既定顺序执行；升级后必须验证（版本 + 冒烟）；确认前保留备份、确认后再清理。
- **本事故新增/被强化的部分**：(a) npm 运行前必须**彻底停止 dsh 宿主进程树**（含当前会话与 GUI）——因为会话与 tool worker 是被替换包的子进程，而非常观者；(b) 安装必须在**完全外部的上下文**执行，而不是“换个 dsh 会话再试一次”；(c) 验证必须**专门检查 shim/bin-link 再生**，因为本次中断安装的签名就是“包内容在、命令缺失”；(d) 插件无需再迁移这一结论（alpha.5..rc.1 仅版本号变更、零 API 变更）来自 repair-notes 的事故专属发现，属新增知识。

---

## 5. 预防：代理侧护栏长什么样，以及本机的升级后检查清单

**5.1 代理侧护栏（自变更检测器，self-mutation guard）。**
- **目标重叠检测**：执行任何 install/upgrade/migration/uninstall 命令前，解析“变更目标”（如 npm root -g + 包名）与“自身运行时路径”（宿主安装/源码目录、process.argv[1]、worker 可执行路径）。若两者重合（自身进程运行在将被替换的安装树内），判定为 SELF-MODIFYING：**拒绝执行**，改发外部交接流程。
- **命令类别门禁**：npm install -g / npm update -g / npm uninstall -g、pip install -U、winget/choco upgrade 等命中宿主包的命令，一律走“外部交接”路径，绝不从目标运行时自己的 tool worker 里执行。
- **前置存活检查**：列出可执行/脚本路径位于安装根内的进程；存在（尤其当前 host）→ 阻断并交接；不存在 → 允许，但仍需事后核验。
- **失败安全提示**：明确告知用户“当前会话/GUI 会随安装死亡、结果无法被记录”，把操作转成书面交接清单，而不是自己硬跑。
- **流程形态**：升级固定为“退出 → 外部安装 → 重启验证”三段式；永远不要热替换正在运行的自宿主进程。

**5.2 本机升级后检查清单（针对 alpha.5 → rc.1 与本次事故签名）。**
1. **shim 完整性**：dsh、dsh.cmd、dsh.ps1 三件齐全且新鲜；dsh.ps1 指向当前树，不得指向 dsh-old-*。（这是本次事故的直接签名项。）
2. **版本与标准性**：dsh --version = 0.1.2-rc.1；npm ls -g --depth=0 显示标准 @deepseek-ai/dsh@0.1.2-rc.1；残留的手工放置文件只能通过 npm 重装消除，禁止再手补目录。
3. **真实机冒烟**：启动 dsh --profile web，硬刷新浏览器，确认插件加载（whale / progress 等）——此前 GUI 是中途死亡，必须真机验证而非只看版本号。
4. **插件迁移**：**不需要**再迁移——alpha.5..rc.1 的 252 个文件全是 package.json 版本号变更、零 API/功能变更；已按 0.1.2-alpha.x 迁移的插件只需加载冒烟。
5. **源码 checkout**：保持对齐 dsh-v0.1.2-rc.1 tag（修复已对齐，后续保持同步）。
6. **备份清理**：rc.1 确认稳定后删除 dsh-old-* 备份目录；确认前保留。

---

## 结论

本次事故不是“npm 恰好崩了”，而是**在自宿主运行时内部替换该运行时**的结构性必然失败：会话与 tool worker 就是被 npm 删除/替换的包的进程，宿主先死、工具结果的记录链路随之消失，留下“包内容在、shim 缺失/陈旧”的中断安装签名。手工搬目录只会让 npm 状态进一步失真；唯一正确的修复是从外部上下文重跑正式安装以再生整树与 shim，并以版本 + shim + 真机插件冒烟三层验证。代理的纪律边界：识别自我关系后**不得执行**全局自升级，而应把“先停宿主、再从外部精确钉版本安装”的流程完整交给用户执行。

---

## run-stats

- toolcalls 总数：11 次内部工具调用（经 5 次 run_code 程序调用：1 glob + 4 read + 1 pwsh + 4 write + 1 send_message）
- token 用量：n/a（本会话不暴露 token 计数）
- 完成时间：2026-10-21T15:03:42+08:00


#### FILE: report.md

# S16 · The Self-Host Upgrade Trap —— 根因、修复与协议报告

- 任务格：S16-self-host-upgrade-trap（noskill 臂）
- 证据包（只读，已保持逐字节不变）：fixture/README.md、fixture/agent-session-log.txt、fixture/env-state.txt、fixture/repair-notes.md
- 报告完成时间：2026-10-21T15:03:42+08:00（详见文末 run-stats）

---

## 0. 证据要点（仅列要点 + 文件 ID，不全文粘贴）

- **[agent-session-log.txt]** —— 会话内工具调用 pwsh: npm install -g @deepseek-ai/dsh@0.1.2-rc.1（在宿主自己的 worker 进程内执行）。时间线：16:41:02 warn cleaning → 16:41:05 info remove → 16:41:09 info fetch → 16:41:31 info linkStuff；就在 linkStuff 阶段 web GUI 会话死亡（浏览器 connection lost）。工具结果：「no result recorded —— 调用已被记录但没有持久化结果，成败未知」。随后新 shell 中 dsh --version、dsh web 均报「not recognized」；dir $env:APPDATA\npm | Select-String dsh 显示：dsh.ps1 陈旧（指向旧树）、dsh.cmd 缺失、node_modules\@deepseek-ai\dsh 在位但部分替换、node_modules\@deepseek-ai\dsh-old-0.1.1-rc.1 备份在位。
- **[env-state.txt]** —— BEFORE：0.1.2-alpha.5 健康（dsh web host 运行、GUI http://127.0.0.1:3080、会话就在该宿主进程内、npm 全局树含 dsh-old-* 备份、dsh/dsh.cmd/dsh.ps1 三个 shim 齐全）。AFTER：宿主死亡、dsh 命令消失、包内容（rc.1 文件）在位但「NOT a standard install」（其中一部分是用户手工修补时放进去的）、dsh.cmd 与 dsh 缺失、dsh.ps1 陈旧；结论：dsh CLI 不可用，只能由外部工具（另一个 agent CLI）修复安装。
- **[repair-notes.md]** —— 外部修复会话（另一个 agent CLI，运行在 dsh 之外）：① 从 registry 重跑正式安装 npm install -g @deepseek-ai/dsh@0.1.2-rc.1 → dsh / dsh.cmd / dsh.ps1 全部再生，dsh --version → 0.1.2-rc.1；② 源码 checkout 从 alpha.5 tag 对齐到 dsh-v0.1.2-rc.1 tag，无本地修改冲突。关键发现：dsh-v0.1.2-alpha.5..dsh-v0.1.2-rc.1 diff 共 252 个文件，全部是 package.json 版本号变更，零 API/功能变更 → 已按 0.1.2-alpha.x 迁移的插件无需再迁移。遗留：真实机验证（dsh --profile web、硬刷新浏览器、确认插件 whale / progress 等加载）；确认 rc.1 后可选清理 dsh-old-* 备份目录。

---

## 1. 结构性根因：为什么“在运行中的 dsh 会话内全局升级 dsh”必然失败，而不是偶发失败

**1.1 会话和它的 tool worker 就是 npm 要替换的那个东西本身。**
出问题的会话是一个 dsh web 会话，运行在 dsh 宿主进程里（host process = node .../node_modules/@deepseek-ai/dsh/...）。也就是说：执行这条 npm 命令的 pwsh tool worker，是该宿主进程派生的子进程；负责监督、记录、回传工具结果的会话运行时（tool-call 记录/回传链路）本身就在 @deepseek-ai/dsh 这个 npm 包的安装树里。而 npm install -g @deepseek-ai/dsh@0.1.2-rc.1 的变更对象，恰好就是全局树里的这同一个包目录。执行者位于被执行对象的内部——这是一次自我截肢式的“自宿主升级”。

**1.2 谁先死：宿主进程树先死，记录链路随之消失。**
npm 的生命周期顺序在日志里写得很清楚：cleaning → remove（删除旧包）→ fetch（取新包）→ linkStuff（放文件、重建 bin 链接/shim）。remove 那一步删掉的正是宿主进程正在运行的代码树（Windows 上 node 已加载的模块留在内存里，进程可能“瘸着走几步”，但任何懒加载 require、原生模块、子进程派生、以及所有指向该树的 shim 路径都已失效）；到 linkStuff 阶段宿主与 GUI 彻底死亡（浏览器 connection lost）。宿主一死，就没有任何进程来监督这条工具调用、持久化它的结果、再把结果回传给会话——所以日志里出现的是「[tool result] 无结果记录、结局未知」，而不是一条 npm 的成功/失败输出。工具调用“没有返回结果”不是因为它被 npm 异常中断，而是因为“能返回结果的那个东西”正是被替换掉的对象。

**1.3 为什么是“必然”而不是“碰巧”。**
这条操作的拓扑是自指的：行动者住在被操作对象里面。无论 npm 走到哪一步，只要它履行自己的职责（删除并替换旧安装树），就一定先于“结果回传”摧毁监督者。即使 npm 完美成功，会话/GUI 也会因自身安装被替换而死亡，从会话的视角看这条工具调用同样永远拿不到结果；而中途被打断则留下半替换的树。所以：在会话内重试一百次都是同一个结局——结构性失败，不是 flaky。

---

## 2. 事后破损状态：为什么包内容还在、dsh 命令却消失了，以及为什么手工搬目录/打补丁会更糟

**2.1 命令消失的机制（来自 env-state.txt 与 agent-session-log.txt）。**
Windows 上的 dsh 命令不是靠“包目录存在”就能用的：它靠 %APPDATA%\npm 下 npm 在 bin 链接（linkStuff）阶段生成的 shim 文件（dsh、dsh.cmd、dsh.ps1）来解析与转发。npm 在 remove 阶段把旧包连同旧 bin 链接一起删掉，随后在 linkStuff 阶段重建——而宿主恰好死在这两个阶段之间/之中。于是出现本次事故的标志性签名：**包内容在位（rc.1 文件已落地），shim 却缺失或陈旧**（dsh.cmd 与 dsh MISSING、dsh.ps1 STALE 且指向旧树）。此外用户还做过一次部分手工修复（env-state.txt：部分 rc.1 文件“by hand”放进去；repair-notes.md：目录被“replaced/manually swapped”），结果是“NOT a standard install”：目录里有内容，但 npm 的安装收据/元数据、bin 链接、生命周期脚本的产物都不一致。命令消失 ≠ 包丢失；包存在 ≠ 安装成立。

**2.2 为什么手工交换/修补目录会把问题弄得更糟。**
① 绕过 npm 安装生命周期：不生成 bin 链接、不跑生命周期脚本、不更新 npm 全局元数据——之后任何 npm install/uninstall 都在操作一个它不认识的状态，可能拒绝或继续叠加损坏。② 版本/指针错乱：陈旧的 dsh.ps1 指向旧树，真执行起来会跑旧代码或直接死；半替换的 rc.1 目录与 dsh-old-0.1.1-rc.1 备份并存，模块解析可能混用两套代码。③ 无法验证完整性：手工放进去的文件没有校验和/收据，无法证明“哪些文件属于哪个版本”，日后只会表现为诡异运行时行为而不是干净报错。④ 危险窗口还在：只要还有任何进程从该树运行，继续手工搬文件就重现“替换正在运行的安装”这一原始风险。正确做法只有一种：让 npm 从 registry 完整地重做一次正式安装（整树 + shim + 元数据一次性一致落地），而不是继续手补。

---

## 3. 实际采用的修复：修复笔记做了什么、为什么这种修复有效、如何验证

**3.1 修复动作（repair-notes.md）。**
由**运行在 dsh 之外**的另一个 agent CLI 执行：① 从 registry 重跑正式安装 npm install -g @deepseek-ai/dsh@0.1.2-rc.1 → dsh / dsh.cmd / dsh.ps1 全部再生，dsh --version → 0.1.2-rc.1；② 把作为 host 源参考的源码 checkout 从 alpha.5 tag 对齐到 dsh-v0.1.2-rc.1 tag（无本地修改冲突）。

**3.2 为什么这种形式有效，而会话内那次不可能有效。**
修复的执行上下文在被替换的树**之外**：不存在自宿主依赖，npm 可以自由删除/重建全局树并重新生成 bin 链接，监督进程不会被自己发起的安装杀死，结果能被完整记录。而且它是一次**完整的标准安装**——整树、shim、npm 元数据一次性一致落地——这恰好补齐了中断安装 + 手工修补所缺失的“标准性”：命令解析链（shim → 当前树）与包内容重新对齐。

**3.3 验证方式（三层）。**
① shim 层：dsh / dsh.cmd / dsh.ps1 全部再生且不再指向旧树；② 版本层：dsh --version → 0.1.2-rc.1；③ 行为层（留给用户的真实机验证）：dsh --profile web 启动、浏览器硬刷新、确认插件加载（whale / progress 等）。另外源码 checkout 已对齐 dsh-v0.1.2-rc.1 tag。关键发现直接决定了升级风险面：alpha.5..rc.1 差异仅 252 个 package.json 版本号、零 API/功能变更。

---

## 4. 代理本应遵循的协议：识别“我就是升级对象”，然后把操作交出去

**4.1 应当识别的自我关系。**
代理必须认识到：它自己的会话与其 tool worker 是“将被 npm 替换的那个包”的进程——宿主源就在全局安装树里。对一个活着的、自宿主的运行时做全局自升级，属于结构性禁区；失败不是运气问题，而是拓扑问题（见 §1）。

**4.2 是否应当执行这次全局安装？不应当。**
只要还有任何 dsh host/session 从该全局树运行（包括代理自己所在的会话），就绝不应执行 npm install -g 目标为 @deepseek-ai/dsh 的命令。正确边界是：“识别 + 规划 + 交接清单归我；执行归用户/外部上下文”。

**4.3 应交给用户的确切外部流程（顺序不可换）。**
1. **npm 运行之前必须先发生的事**：结束升级目标的运行时——关闭 dsh web GUI 标签页、彻底停止 dsh web host 进程，确认没有任何 node 进程运行自 %APPDATA%\npm\node_modules\@deepseek-ai\dsh；此后所有步骤都在普通终端或外部 CLI（**不是任何 dsh 会话**）中完成。
2. **安装命令必须长这样**：npm install -g @deepseek-ai/dsh@0.1.2-rc.1 —— 精确版本钉死（不是 latest、不是裸包名，目标确定、可复现、可核验）、带 -g（更新的正是全局树与 shim）、执行上下文完全在 dsh 之外（保证删旧树时不会杀死自己的监督进程，结果可被记录）。
3. **验证**：dsh --version → 0.1.2-rc.1；%APPDATA%\npm 下 dsh、dsh.cmd、dsh.ps1 齐全且 dsh.ps1 指向当前树（不得指向 dsh-old-*）；npm ls -g --depth=0 显示标准安装。
4. **重启与冒烟**：启动 dsh --profile web（或 dsh web），硬刷新浏览器，确认插件加载（whale / progress 等）。
5. **收尾**：确认 rc.1 正常后，清理 dsh-old-* 备份目录；确认之前保留。

**4.4 哪些是既有升级规则的直接推论，哪些是本事故新增。**
- **已有升级规则即可推出**：精确钉版本（不追 latest）；安装步骤按既定顺序执行；升级后必须验证（版本 + 冒烟）；确认前保留备份、确认后再清理。
- **本事故新增/被强化的部分**：(a) npm 运行前必须**彻底停止 dsh 宿主进程树**（含当前会话与 GUI）——因为会话与 tool worker 是被替换包的子进程，而非常观者；(b) 安装必须在**完全外部的上下文**执行，而不是“换个 dsh 会话再试一次”；(c) 验证必须**专门检查 shim/bin-link 再生**，因为本次中断安装的签名就是“包内容在、命令缺失”；(d) 插件无需再迁移这一结论（alpha.5..rc.1 仅版本号变更、零 API 变更）来自 repair-notes 的事故专属发现，属新增知识。

---

## 5. 预防：代理侧护栏长什么样，以及本机的升级后检查清单

**5.1 代理侧护栏（自变更检测器，self-mutation guard）。**
- **目标重叠检测**：执行任何 install/upgrade/migration/uninstall 命令前，解析“变更目标”（如 npm root -g + 包名）与“自身运行时路径”（宿主安装/源码目录、process.argv[1]、worker 可执行路径）。若两者重合（自身进程运行在将被替换的安装树内），判定为 SELF-MODIFYING：**拒绝执行**，改发外部交接流程。
- **命令类别门禁**：npm install -g / npm update -g / npm uninstall -g、pip install -U、winget/choco upgrade 等命中宿主包的命令，一律走“外部交接”路径，绝不从目标运行时自己的 tool worker 里执行。
- **前置存活检查**：列出可执行/脚本路径位于安装根内的进程；存在（尤其当前 host）→ 阻断并交接；不存在 → 允许，但仍需事后核验。
- **失败安全提示**：明确告知用户“当前会话/GUI 会随安装死亡、结果无法被记录”，把操作转成书面交接清单，而不是自己硬跑。
- **流程形态**：升级固定为“退出 → 外部安装 → 重启验证”三段式；永远不要热替换正在运行的自宿主进程。

**5.2 本机升级后检查清单（针对 alpha.5 → rc.1 与本次事故签名）。**
1. **shim 完整性**：dsh、dsh.cmd、dsh.ps1 三件齐全且新鲜；dsh.ps1 指向当前树，不得指向 dsh-old-*。（这是本次事故的直接签名项。）
2. **版本与标准性**：dsh --version = 0.1.2-rc.1；npm ls -g --depth=0 显示标准 @deepseek-ai/dsh@0.1.2-rc.1；残留的手工放置文件只能通过 npm 重装消除，禁止再手补目录。
3. **真实机冒烟**：启动 dsh --profile web，硬刷新浏览器，确认插件加载（whale / progress 等）——此前 GUI 是中途死亡，必须真机验证而非只看版本号。
4. **插件迁移**：**不需要**再迁移——alpha.5..rc.1 的 252 个文件全是 package.json 版本号变更、零 API/功能变更；已按 0.1.2-alpha.x 迁移的插件只需加载冒烟。
5. **源码 checkout**：保持对齐 dsh-v0.1.2-rc.1 tag（修复已对齐，后续保持同步）。
6. **备份清理**：rc.1 确认稳定后删除 dsh-old-* 备份目录；确认前保留。

---

## 结论

本次事故不是“npm 恰好崩了”，而是**在自宿主运行时内部替换该运行时**的结构性必然失败：会话与 tool worker 就是被 npm 删除/替换的包的进程，宿主先死、工具结果的记录链路随之消失，留下“包内容在、shim 缺失/陈旧”的中断安装签名。手工搬目录只会让 npm 状态进一步失真；唯一正确的修复是从外部上下文重跑正式安装以再生整树与 shim，并以版本 + shim + 真机插件冒烟三层验证。代理的纪律边界：识别自我关系后**不得执行**全局自升级，而应把“先停宿主、再从外部精确钉版本安装”的流程完整交给用户执行。

---

## run-stats

- toolcalls 总数：11 次内部工具调用（经 5 次 run_code 程序调用：1 glob + 4 read + 1 pwsh + 4 write + 1 send_message）
- token 用量：n/a（本会话不暴露 token 计数）
- 完成时间：2026-10-21T15:03:42+08:00


#### FILE: tool-transcript.txt

# S16-self-host-upgrade-trap · tool transcript
# 格式：序号. 工具名 关键参数（全部经 run_code 程序内部调用；共 11 次内部工具调用 / 5 次 run_code 程序）
# CELL = E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S16-self-host-upgrade-trap

1. glob pattern=**/* path=CELL
2. read file_path=CELL\fixture\README.md
3. read file_path=CELL\fixture\agent-session-log.txt
4. read file_path=CELL\fixture\env-state.txt
5. read file_path=CELL\fixture\repair-notes.md
6. pwsh New-Item -ItemType Directory -Force -Path 'CELL\agent-output','CELL\agent-output\S16-self-host-upgrade-trap'; Get-Date -Format o
7. write file_path=CELL\agent-output\report.md （S16 报告正文：根因/破损状态/修复/协议/预防/run-stats）
8. write file_path=CELL\agent-output\S16-self-host-upgrade-trap\report.md （同内容副本，覆盖题面指定子目录）
9. write file_path=CELL\agent-output\tool-transcript.txt （本文件：全部工具调用清单）
10. write file_path=CELL\agent-output\transcript-manifest.txt （文件系统读写清单）
11. send_message agent_id=session-5d3ebe0e-127d-4dc4-a3b9-cb2199b04f8e message=<自包含结果汇报：报告路径 + 五点结论 + run-stats>


#### FILE: transcript-manifest.txt

# S16-self-host-upgrade-trap · transcript-manifest（真实发生的文件系统访问，R=读 W=写）
R CELL
R CELL\fixture\README.md
R CELL\fixture\agent-session-log.txt
R CELL\fixture\env-state.txt
R CELL\fixture\repair-notes.md
W CELL\agent-output
W CELL\agent-output\S16-self-host-upgrade-trap
W CELL\agent-output\report.md
W CELL\agent-output\S16-self-host-upgrade-trap\report.md
W CELL\agent-output\tool-transcript.txt
W CELL\agent-output\transcript-manifest.txt


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.