
# S18 · The Terminal Sprite Render Trap — 根因分析报告（只读诊断）

- 任务格：E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S18-terminal-sprite-render-trap
- 证据（fixture/，只读，逐字节未改动）：renderer-excerpt.ts（出货渲染器摘录）、symptom-log.txt（症状位点）、frames-digest-report.txt（逐帧摘要对照源图）、ci-hang-evidence.txt（挂死证据）、README.md
- 方法与边界：依 plugin-upgrade 技能 SKILL.md 的 Mode A（inspect：只读调查并出报告，然后停止）纪律执行——仅静态阅读证据，不执行迁移/安装/发布，不写 fixture；产物只写入格内 agent-output\。文中只引技能要点与文档名，不粘贴全文。

---

## 1. 幻影像素（Phantom pixels）：背景 SGR 跨 cell 持久，半填充 cell 暴露它

### 1.1 半块（half-block）打包语义
每个终端 cell 打包上下两个垂直像素（renderer-excerpt.ts:1-4）：
- `▀`（U+2580）：前景色画**上半格 = 上像素**；**下半格由 cell 背景色填充 = 下像素**；
- `▄`（U+2584）：前景色画**下半格 = 下像素**；**上半格由 cell 背景色填充 = 上像素**；
- 空格：整个 cell 显示背景色。

因此"透明像素"必须被翻译成"**默认背景 \x1b[49m**"；只要省略背景项，它就被翻译成"沿用上一个 cell 的背景"。

### 1.2 哪个 SGR 状态跨 cell 持久
SGR 前景（`\x1b[38;2;R;G;Bm`，renderer-excerpt.ts:5）与背景（`\x1b[48;2;r;g;bm`，:6）是**两条独立通道，互不清除**。一旦某 cell 发过 `48;2;…m`，该 truecolor 背景一直生效，直到被显式改写或 `\x1b[0m`（RESET，:7）。
**泄漏的是背景通道（48;2 背景 SGR 状态）**；前景通道不泄漏（每个用到它的 cell 都显式重设了 fg）。

### 1.3 哪些 cell 暴露它
四分支（renderer-excerpt.ts:22-34）：
| 帧数据 | seq 输出 | glyph | 是否干净 |
|---|---|---|---|
| 上下都有像素（:22-24） | `fg(up)+bg(lo)` | `▀` | 干净（两通道齐全） |
| **仅上像素（:25-27）** | **`fg(up)`，无 bg** | `▀` | **暴露**：下半格显示残留背景 |
| **仅下像素（:28-30）** | **`fg(lo)`，无 bg** | `▄` | **暴露**：上半格显示残留背景 |
| 双透明（:31-34） | `''` → 去重逻辑发 RESET（:35-38） | 空格 | 干净 |

即幻影**只出现在半填充 cell 的透明半格**（`▀` 的下半格 / `▄` 的上半格），而帧数据在该半格是 `.`——所以幻影"不属于任何帧的数据"（symptom-log.txt:1-5）。残留颜色 = 最近一次发出 `bg(...)` 的那个 cell 的下像素颜色，典型是左侧相邻的双像素 cell（鲸体/暗色轮廓 `fg(dark)+bg(dark)`、sleep-Z 与心形 glyph 的双像素部分）。于是出现**紧贴暗色轮廓右侧、Z 旁、心形右侧的 1-cell 宽暗淡噪点列**，并随动画移动（边缘到哪，半填充 cell 到哪，幻影到哪；symptom-log.txt "appear and move with the animation"）。行内更右的双透明 cell 发过 RESET，故幻影严格是 1-cell 宽。

细节：seq 去重（:35-38）以"不完整的 seq 字符串"为键，连续同色半填充 cell 不补发任何序列，残留背景横跨整个游程；行尾 RESET（:42）只隔离行与行，修不了行内。

### 1.4 精确 escape 修复
让每个 cell 的 SGR **自包含两个半格**，透明半格显式发默认背景 `\x1b[49m`：

~~~
const BG_DEFAULT = '\x1b[49m'
// 上下都有:  seq = fg(up) + bg(lo);     ch = '▀'
// 仅上像素:  seq = fg(up) + BG_DEFAULT; ch = '▀'   // ← :26 补 + BG_DEFAULT
// 仅下像素:  seq = fg(lo) + BG_DEFAULT; ch = '▄'   // ← :29 补 + BG_DEFAULT
// 双透明:    seq = RESET;               ch = ' '
~~~

即 renderer-excerpt.ts:26 与 :29 各加一个 `+ BG_DEFAULT`（等价写法：每 cell 先 `\x1b[0m` 再发所需通道，更啰嗦）。此后 `current` 去重键等价于"完整 (fg,bg) 状态对"，去重继续安全；行尾 RESET 保留。**规则：任何 cell 输出都必须显式给出 fg 与 bg（含默认值），绝不依赖继承的 SGR。**

---

## 2. 幽灵像素（Ghost frames）：行尾裁剪 + 文本管线吃掉尾随空白

### 2.1 机制
1. 渲染器每行构建完执行 `out.replace(/[ ]+$/, '')`（renderer-excerpt.ts:41）——**把行尾透明 cell（空格）整段丢弃**。窄帧的行因此比宽帧的行短，末端若干列**不产生任何字符输出**。
2. 帧切换是覆盖式重绘（光标回到 sprite 区域、逐行重写同一批屏幕行）。覆盖语义里"**不写 = 保留旧内容**"：窄帧没写到的列继续显示宽帧 tail 的像素（symptom-log.txt:7-11）。
3. 文本管线（文本 widget / PTY 写出 / 消息组装）普遍 strip 行尾空白、或在 wrap/重排时丢弃尾随空格——即便渲染器补了空格，也可能在传输途中被吃掉，同样留下旧内容。

### 2.2 两部分修复（缺一不可）
1. **渲染端（擦除语义）**：每行在内容与行尾 RESET **之后**追加 **`\x1b[K`（EL，擦除到行尾）**：`…cells…\x1b[0m\x1b[K`。它显式擦掉"窄帧没覆盖的列"，且 `\x1b[K` 是非空白字符序列，任何尾随空白 strip 都吃不掉它。顺序必须 RESET → `\x1b[K`（EL 用当前背景擦除，否则会拿残留背景"涂色"）。（替代：每行 pad 到固定 40 列并用显式默认背景空格填充——但单独使用会被管线 strip 抵消。）
2. **管线端（传输契约）**：渲染行**原样传输**——禁止尾随空白 strip / wrap 重排 / trim；帧切换必须**覆盖同一屏幕行**（光标上移 N 行后重写或等价定位重绘），不得追加输出。若管线不能保证，则必须依赖第 1 条的 `\x1b[K`。

（可选第三重保险：切换前先清 sprite 区域——逐行 `\x1b[K` 或 `\x1b[J`。）两半合起来才"guarantee a clean frame switch"：渲染端保证"擦除存在且不可被 strip"，管线端保证"行按原样落到正确的屏幕行"。

---

## 3. 帧数据漂移（tail2）

### 3.1 digest 报告说了什么
逐帧 sha256（每帧 25 行）对照源图（frames-digest-report.txt:1-5）：standard/blink/fin1/fin2/spout1-6/tail1/tail3/tail4/heart1-3/sleep1-5 全部 OK，**唯 tail2 MISMATCH**：
- row 2：ported 的 D 在 col 26，source 在 col 27（整体左移 1 列）；
- row 3：col 25 多一个 D；cols 26-28 的 DBD 整体左移 1；cols 36-37 多出 DD；
- rows 4-6：右上簇整体左移 1 列；
- 合计 23 个差异 cell，全部落在右上 spout/tail-tip 区。

这正是症状 3 的"错位 6 像素簇"（symptom-log.txt:13-14）。注意：该帧**渲染器逻辑完全正常**——错的是帧数据本身。

### 3.2 为什么既有 per-excerpt 回归没抓住
- tail2 是转换时**手工拷贝（hand-copied）**入库的（frames-digest-report.txt:12-15），没有机械生成/校验；
- 后来加的回归是 **per-excerpt**（为另一个帧加的摘录快照），覆盖面只到被摘录的帧/片段，tail2 不在覆盖面内；
- excerpt 快照对比的是"渲染输出片段"，对"帧数据 ↔ 源图"的正确性是**零覆盖**：数据漂移在一个渲染输出看起来完全合理的帧里，不会被渲染快照发现。

### 3.3 防复发门禁
把 frames-digest-report 从"报告"升级为 **CI 全帧摘要门禁**：
- 对**每一个**帧计算 sha256（全部 25 行）与源图金样比对，任何 MISMATCH 即失败（tail2 式漂移在入库时即被拦下）；
- 帧只能由源图**机械转换脚本**生成（脚本入库、可重现），禁止手工拷贝行/列；
- 金样摘要与帧数据同 PR 入库、同 PR 更新；excerpt 快照只作补充回归，不承担门禁职责。

---

## 4. CI 挂死：自续 setTimeout 链钉住事件循环

### 4.1 机制（ci-hang-evidence.txt）
- **什么在无限续排**：动画 planner 每 tick 用 `setTimeout` 调度下一 tick（"one per tick … each re-arming the next"），只要组件保持 mounted 就永远续链。
- **哪些宿主不 unmount**：channel-ui 组的 scene checks / 无头 CI 宿主把 header（含该动画组件）mount 起来跑完检查后**不 unmount** 即结束；于是最后一个 ref'd Timeout 永远 pending（live handles = Timeout，每 tick 一个，逐个续排）。
- **为什么"跑完却挂住"**：全部 scene 检查 PASS、无运行中测试、无 pending 断言，但 Node 事件循环被 ref'd timer 保活 → 进程不退出，直到 runner 超时杀掉（历史基线 ~3 分钟；本地观测 19 分钟空闲后手动 kill）。时间线吻合：挂死首次出现与"动画特性 default-off → default-on"同一 push——default-off 时 planner 根本不排程。
- **交互式终端为何不受影响**：TTY/stdin 句柄本来就保活进程（产品是常驻进程），timer 链只是"多一个保活句柄"，不改变"进程应当一直活着"的语义，也没有"跑完必须退出"的期望。

### 4.2 一行修复
给续排的 Timeout 调 **`.unref()`**：`setTimeout(tick, ms).unref()`——timer 照常触发，但不再参与事件循环保活，"永不 unmount 的宿主"也能在检查跑完后退出。这是对当前宿主形态**唯一真正生效的一行**（仅做 unmount 时 `clearTimeout` 无法救这些宿主，因为它们根本不 unmount）。
配套（契约级，非本问"一行"）：unmount 时 `clearTimeout` 停链（防卸载后继续算/泄漏）；CI 加"最后一条断言后 N 秒内必须退出 / live handle 白名单"看门狗，并把 ~3 分钟历史基线写成超时阈值。

---

## 5. 预防

### 5.1 渲染器契约清单（terminal sprite 实现应随附交付）
1. **SGR 完整性**：每个 cell 显式写 fg+bg 两个通道（透明半格 = `\x1b[49m`，必要时 `\x1b[39m`）；禁止依赖继承状态；行尾 RESET；附逐 cell 校验器（扫描输出：每个 `▀/▄/空格` 前必须是完整 (fg,bg) 状态对）。
2. **几何/擦除契约**：固定 40 列宽，或行尾 `\x1b[K`（必须在 RESET 之后）；帧切换 = 覆盖 + 擦除，不是追加；尾随空白不得承载任何语义。
3. **管线契约**：渲染行原样传输，禁止尾随空白 strip / wrap 重排 / trim；文档写明管线是否 trim；若不能保证则强制 `\x1b[K` 方案。
4. **打包规范**：`▀` fg=上/bg=下、`▄` fg=下/bg=默认、空格=全默认；`.` = 透明；奇数行 lower`=''`；调色板映射确定性（未知字符不画，绝不猜测）。
5. **帧数据门禁**：帧一律由源图机械转换脚本生成（脚本入库、可重现）；每帧全量 sha256（25 行）对照源图金样在 CI 门禁；禁止手工拷贝入帧数据。
6. **视觉回归**：至少含"宽 → 窄切换"的 golden（逐帧 escape 序列字节级快照 + 切换序列）；excerpt 快照只能补充。
7. **生命周期/定时器契约**：动画 timer `unref()` + unmount `clearTimeout`；组件可 dispose；把"mount 后不 unmount 进程仍可退出"写成测试（event-loop live handle 计数白名单）。
8. **可诊断性**：digest 输出差异 cell 的行/列明细（tail2 报告式），失败可精确归因。

### 5.2 翻默认前审计（default-off → default-on 之前必跑）
1. **宿主/句柄审计**：列出所有 mount 该组件的宿主（CI scene checks、无头 harness、预览/SSR、批处理 job），逐个确认"要么 unmount + clearTimeout，要么 timer 已 unref"；CI 增加"mount 后不 unmount"用例并断言 N 秒内进程退出；记录 live handle 计数基线。
2. **数据审计**：全帧摘要门禁绿灯；所有手工 port 过的帧逐一复核（tail2 风险族）；转换脚本可重现、金样摘要同 PR。
3. **视觉审计**：幻影/幽灵专项用例——半填充 cell SGR 完整性扫描、宽→窄切换 golden、行尾 `\x1b[K`（且在 RESET 之后）存在性断言、"管线会 strip 尾随空白"的模拟传输测试。
4. **空闲/性能审计**：空闲期 CPU 与 pending timer 数稳定 O(1)（一 tick 一个），无随帧数增长的句柄泄漏。
5. **放量与退路**：先 flag/金丝雀一个环境跑满观察窗；保留 default-off 回退至少一个版本周期；监控"边缘噪点/残影"类用户反馈。
6. **基线守护**：把翻转前的 job 时长基线（channel-ui ~3 分钟）写成 CI 看门狗阈值，超时即算回归而非"慢"。
7. **签核**：5.1 清单逐项签字到人；结论与 fixture 证据（symptom-log / frames-digest / ci-hang）一并归档。

---

## 附：技能合规（plugin-upgrade SKILL.md）
- 模式：Mode A · inspect（只读调查与报告，然后停止）；未执行任何写入/安装/版本切换/包脚本/迁移。
- 边界：fixture 只读且未改动；产物仅写格内 agent-output\；未访问容器/白名单外资源。
- 报告口径参照技能"Validation and reporting"结构：本任务 pre-existing baseline 为 not collected（无基线运行）；无依赖/启用/静态/运行时迁移层可验，故以证据归因 + 验证建议（5.2 审计清单）替代；rollback 项不适用（零写入，天然可回滚）。

## run-stats
- toolcalls 总数：11（run_code 顶层 7 次；内含 read×6、glob×1、write×3、send_message×1）
- token 用量：n/a（本会话不暴露计量）
- 完成时间：2026-10-21T15:27:15.613+08:00
