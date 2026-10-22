# JUDGE BRIEF · noskill.S18-terminal-sprite-render-trap

## Criteria (sealed rubric)
- [half-cell-background] (20pt) Locate the upper-only/lower-only branches in renderer-excerpt.ts: they emit foreground only, leaving a previous cell’s SGR background active and painting the transparent half. Reset background on each half-filled cell with ESC[49m or an equivalent reset followed by restoring the intended foreground. A row-end reset alone occurs too late. Tie the mechanism to the edge symptoms rather than blaming artwork or the terminal emulator.
- [frame-clearing] (20pt) Explain the renderer’s trailing transparent-space trim and downstream whitespace handling: a narrower frame does not overwrite the previous frame’s surplus columns. Propose full-sprite-width row output plus erase-to-EOL (ESC[K), or a demonstrably equivalent explicit clearing procedure that survives whitespace trimming. Keep SGR state controlled. Merely adding spaces without accounting for the pipeline is incomplete.
- [frame-data-integrity] (20pt) Use frames-digest-report.txt to identify the hand-ported tail2 mismatch (23 changed cells; the visible shifted cluster is not the full diff count), distinguish data drift from renderer artifacts, and explain that a different-frame excerpt test missed it. Compare/assert every frame against trusted source art using digests or exact rows. Testing one excerpt or hashing against the already-drifted port is insufficient.
- [timer-liveness] (20pt) Use ci-hang-evidence.txt: mounted probe hosts never unmount, the planner continuously rearms referenced setTimeout handles, so finished checks cannot exit. Interactive TTY/stdin already keeps the product alive. Unref each newly scheduled planner timeout (timer.unref or equivalent) so animation continues while another handle is live but does not keep probes alive by itself. Extending CI timeouts or stopping animation globally does not fix the lifecycle contract.
- [renderer-and-rollout-prevention] (20pt) Consolidate background reset, full-width/erase behavior, balanced SGR state and source-backed all-frame integrity into a renderer checklist. Before default-on rollout audit timers and every mounting host, especially probes that finish without unmounting, and propose an exit/liveness regression. No actual render or CI execution is required.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [contradictory-render-advice] ceiling=0 The final advice denies the need to reset the half-cell background, retains trailing trimming without equivalent clearing, rejects source-backed frame checks, or says the repeating planner timer should remain referenced / unref is harmful. Blaming the terminal emulator instead of fixing the demonstrated renderer defect also triggers this cap. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.

## Candidate report(s)
#### FILE: S18-terminal-sprite-render-trap/report.md

# S18 · The Terminal Sprite Render Trap — 诊断报告

> 证据包（只读，未修改）：`fixture/renderer-excerpt.ts`（出厂渲染器）、`fixture/symptom-log.txt`（用户可见症状）、`fixture/frames-digest-report.txt`（帧摘要对比）、`fixture/ci-hang-evidence.txt`（CI 挂起证据）、`fixture/README.md`。

**症状 → 根因映射总览**

| 症状 | 根因 | 证据位置 |
|---|---|---|
| 右缘幻影像素（1 格宽彩色噪声） | 半填充单元格只发前景 SGR，背景色跨单元格残留，污染空的那一半 | renderer-excerpt.ts:22-34 |
| 宽帧→窄帧后残影 | 每行尾随空白被裁剪、终端不回写未写单元格，宽帧尾巴原样残留 | renderer-excerpt.ts:41 |
| tail2 帧数据漂移（23 格） | 手工拷贝移植时整体左移 1 列；逐段回归只覆盖了另一帧的片段 | frames-digest-report.txt |
| CI “PASS 后挂起” | 动画 planner 自重置 setTimeout 钉住事件循环；主机挂载 header 组件后不卸载 | ci-hang-evidence.txt |

---

## 1. Phantom pixels（右缘幻影像素）

**要点结论**：渲染器对“只有一个垂直像素有着色”的半填充单元格只发前景色 SGR，而半块字形（▀/▄）会同时用前景和**背景**绘制两半——背景色是 SGR 粘滞状态，跨单元格保留上一个完整单元格（双像素）设置的值，于是空的那一半被染成上一个单元格的底色，形成贴右缘的幻影。修复：半填充单元格必须显式补发透明背景（`\x1b[49m` 或画布底色），让每个单元格携带完整 SGR 状态。

### 1.1 机制（对照出厂代码逐格分析）

渲染器逐格分支（`renderer-excerpt.ts:17-40`）：

```ts
if (up !== undefined && lo !== undefined) { seq = fg(up) + bg(lo); ch = '▀' } // 双像素：前景+背景都发
else if (up !== undefined)               { seq = fg(up);           ch = '▀' } // 只有上像素：只发前景
else if (lo !== undefined)               { seq = fg(lo);           ch = '▄' } // 只有下像素：只发前景
else                                     { seq = '';               ch = ' ' }
if (seq !== current) { out += seq === '' ? RESET : seq; current = seq }       // 只发“变化过的”序列
out += ch
```

三个事实叠出幻影：

1. **半块字形同时消费前景和背景**：`▀`(U+2580) 上半块=前景色、下半块=**背景色**；`▄`(U+2584) 下半块=前景色、上半块=**背景色**。也就是说，一个半块字形会画满整格，其中一半永远由背景色填充。
2. **只有“双像素”分支设置背景**（`fg(up)+bg(lo)`）。两个单像素分支只发前景色，**没有**把背景复位成任何显式值。
3. **SGR 是粘滞状态**：`\x1b[48;2;r;g;bm` 一旦发出，跨单元格持续生效，直到被新背景覆盖或被 RESET——终端不会“每格自动恢复默认”。

于是单像素分支的渲染结果依赖**历史**：那个空半用的是**同一行内左侧最近一个双像素单元格**所设置的 `bg(lo)`。帧数据里这一半是 `'.'`（透明），所以屏上多出的那一小块颜色“不属于任何帧数据”——正是症状 1 的“1 格宽、贴右缘的暗色彩色噪声”。

### 1.2 哪个 SGR 状态跨格残留、哪些格暴露它

- **跨格残留的状态：背景色 SGR** `\x1b[48;2;r;g;bm`（前景 `\x1b[38;2;…m` 同样粘滞，但半块字形的前景半在每个单像素分支里都被显式设置，不会出错；真正无人看管的是背景）。`current` 缓存只按“发出的序列串”比对，对单像素格而言这个串里没有背景，优化于是假设“前景串足以描述整格渲染状态”——这个假设正是漏洞。
- **暴露它的单元格**：同一行内“恰好只有一个垂直像素有着色”的**半填充单元格**，且其左侧最近一次背景设置来自某个双像素格（底色非默认）。落在精灵右缘的就是：深色轮廓的最右列（1 格高的轮廓像素紧贴左侧完整格）、睡姿 Z 符号的边缘格、爱心边缘格——它们的空半分别继承邻格的深色/Z 色/爱心色，于是噪声“直接贴在轮廓、Z、爱心的右侧”，且随帧切换而移动变色（继承值就是相邻美术格当帧实际设置的颜色）。
- **为什么只污染行内、不跨行**：每行收尾都保证以 RESET 结束（尾随透明格序列里的 RESET 在裁剪后仍在行尾；否则 `if (!row.endsWith(RESET)) row += RESET` 补上），行间 SGR 状态是干净的——与症状“伪影严格局限在精灵格子区域内、无其他 UI 元素受影响”完全一致。

### 1.3 精确修复（转义级）

半填充单元格必须**补发透明背景**，让每个画 `▀`/`▄` 的格都携带完整 SGR 状态：

```ts
const BG_TRANSPARENT = '\x1b[49m'   // 默认背景；若精灵画在非默认底色上，则用 bg(canvasRgb)
...
} else if (up !== undefined) {   // 只有上像素：下半显式涂成透明
  seq = fg(up) + BG_TRANSPARENT
} else if (lo !== undefined) {   // 只有下像素：上半显式涂成透明
  seq = BG_TRANSPARENT + fg(lo)
}
```

更彻底的统一写法：每格显式算出两半颜色 `seq = fg(up ?? T) + bg(lo ?? T)`（`T` = 透明/画布色，字形仍为 `▀`/`▄`，全透明格仍走 `RESET + ' '`），使**任何格子的渲染结果都不依赖 SGR 历史**；修复后 `current` 缓存自然以“完整 (fg,bg) 状态串”为键，缓存语义与终端真实状态重新一致。

渲染器不变式（应写进契约）：**凡是会画 `▀`/`▄` 的格，必须同时携带前景与背景；空的那一半必须是显式写出的颜色，绝不能是从上一个单元格继承来的颜色。**

## 2. Ghost frames（帧切换残影）

**要点结论**：渲染器每行用 `replace(/[ ]+$/, '')` 裁掉尾随透明空格，窄帧写出的格子数少于宽帧；文本管线/终端只回写实际写出的单元格、从不清除行尾未写区域（尾随空白也被裁掉而非写成空格），于是宽帧尾巴的像素原样留在屏上。两部分修复：(a) 渲染器不再裁剪、按精灵包围盒全宽补写每一行（透明格显式写“透明底+空格”）；(b) 帧切换路径显式擦除——每行行尾发 EL（`\x1b[K`）并在每帧开始清空精灵区域。

### 2.1 机制：渲染器丢了什么、管线对尾随空白做了什么

- **渲染器从每行丢弃了什么**：`renderer-excerpt.ts:41` 的 `let row = out.replace(/[ ]+$/, '')`。每行渲染出的尾随透明格（`RESET + ' '`）里的空格被整段裁掉——窄帧每行实际写出的字符数远少于宽帧。也就是说，**宽帧摆尾伸到的最右几列，在窄帧里根本不会被写入**（不是被写成空格，是压根不出现）。
- **文本管线/终端对尾随空白做什么**：管线只回写字符串里实际存在的单元格；终端对一行写入**从不清除写到范围之外的内容**（除非显式收到擦除序列）。而尾随空白又恰被渲染器裁掉（行式重绘/回滚缓冲管线通常也会把尾随空白规范化掉而不是写成空格），所以没有任何“空格笔刷”去覆盖旧像素。
- **结果**：宽帧→窄帧切换时，窄帧把自己的格子画好了，但宽帧多出来的那几列**原样留在屏上**——上一个姿势的尾巴像素在旧位置继续显示，即“ghost pixels”。这与渲染器每行独立 RESET 收尾并不矛盾：RESET 只清 SGR 属性，**不擦除任何已画出的格子**。

### 2.2 两部分修复（保证干净切换）

1. **渲染器侧——停止裁剪，整行全宽回写**：删掉尾空白裁剪；每一行都按**精灵包围盒的固定全宽**（动画的 bounding box 宽度，不是当前帧自己的宽度）输出，透明格显式写成“透明背景 + 空格”（`bg(T) + ' '`），使每帧都把包围盒内**每一个**格子覆盖一遍。注意：若只补到“当前帧的宽度”，窄帧依然盖不住更宽的旧帧——补宽目标必须是包围盒宽度。
2. **切换侧——显式擦除**：每行行尾追加 EL（`\x1b[K`，即 `\x1b[0K`，从光标擦到行尾）；并且每帧重绘前先清空整个精灵区域（逐行 `\x1b[2K` 或区域清屏），把包围盒之外（例如比盒子还宽的残留、局部重绘残留）也一并擦掉。

两部分合起来才构成**保证**：盒子内被新帧数据完整覆盖（第 1 部分），盒子外被显式擦除（第 2 部分）——单靠任一部分都留有漏洞（只补宽：盒外残留还在；只擦 EL：管线若分块写入/光标语义异常时行尾之外仍可能漏）。

## 3. Frame data drift（帧数据漂移）

**要点结论**：摘要报告显示 tail2 与源美术不一致——23 个差异格全部集中在上右喷水/尾尖区域，整体左移 1 列（row 2 的 D 在 col 26 而源在 col 27；row 3 多出 col 25 的 D、26-28 的 DBD 左移、36-37 多出 DD；rows 4-6 上右簇整体左移 1 列）。它是转换时手工拷贝引入的；后来补的回归只覆盖了**另一个帧**的一小段（excerpt），既没渲染 tail2，也没覆盖发生漂移的上右区域，逐段测试只能证明片段正确、看不见别处漂移。防复发闸门：整帧摘要闸门——对**每一个**帧（含手工移植帧）的完整 25 行数据计算 sha256 并与源美术摘要比对，100% 帧覆盖、摘要钉入清单、CI 强制，任何不一致即失败。

### 3.1 摘要报告说了什么

`frames-digest-report.txt` 对每个帧的 25 行数据做 sha256、与移植所依据的源美术帧逐一比对：

- `standard / blink / fin1 / fin2 / spout1-6 / tail1 / tail3 / tail4 / heart1-3 / sleep1-5`：全部 **OK**。
- `tail2`：**MISMATCH**，共 **23 个差异格，全部集中在上右喷水/尾尖区域**：
  - row 2：移植版 D 在 col 26，源美术在 col 27（**整体左移 1 列**）；
  - row 3：col 25 多出一个 D；cols 26-28 的 `DBD` 整体左移 1 列；cols 36-37 多出 `DD`；
  - rows 4-6：上右簇**整段左移 1 列**。
- 成因（报告自述）：**移植 tail2 是转换过程中手工拷贝的**；后来补的回归是**逐段（excerpt）式**的，且是为**另一个帧**加的，没有覆盖 tail2。

症状日志第 3 条与之对应：这一个手工移植帧出现尾尖错位——6 像素簇画在了错误位置。

### 3.2 为什么逐段回归没抓住漂移

- **覆盖面错位**：那个回归是针对**另一个帧**加的，tail2 根本不在其渲染集合里——对它零覆盖。
- **粒度太粗**：即便是它自己覆盖的帧，也只断言了一小段（excerpt）区域；逐段测试只能证明“被断言的那一段是对的”，对片段之外（这里恰是漂移所在的上右簇）完全失明。手工移植引入的系统性错位（整体左移 1 列）恰恰落在未被断言的区域。
- 本质：**部分覆盖的回归 = 对未覆盖区域无任何保证**；帧数据这类“逐字节必须等于源”的资产，必须用全量比对而不是抽样。

### 3.3 防复发闸门：整帧摘要闸门

- **闸门定义**：对**每一个**帧（含所有手工移植帧）的**完整 25 行数据**计算 sha256，与源美术帧的摘要逐一比对；**100% 帧覆盖**，摘要钉进仓库清单（manifest），作为 CI **必过检查**，任何一格不一致即构建失败、帧不得进入动画序列。
- 配套纪律：移植步骤**机械化**（脚本转换 + 摘要自校验），禁止手工拷贝；新增/修改帧时必须先过摘要闸门再合入。
- 这条闸门覆盖“数据正确性”维度：渲染管线再对，喂进去的帧数据错了，屏上就是错的——第 1、2 节修的是渲染，本节修的是数据。

## 4. The hang（CI 挂起）

**要点结论**：动画 planner 是自重置的 setTimeout 循环——每个 tick 再排下一个 setTimeout，只要组件还挂着就有一个活跃 Timeout 句柄钉住事件循环；flip 后默认开启，channel-ui 组的场景检查主机挂载了 header 组件、断言跑完后**不卸载**，进程于是永远不退出（PASS 之后空转到被 runner 超时杀掉，本地观测到 19 分钟空转，而历史上只需约 3 分钟）。交互式终端产品不受影响：它的进程本来就靠 TTY/stdin 句柄活着，定时器链只是锦上添花、无从暴露。一行修复：把重置的定时器 `unref()`，使其不再钉住事件循环（结构性配套是卸载时 clearTimeout，但主机不卸载时唯一管用的就是 unref）。

### 4.1 机制：谁把事件循环钉死了

- **什么在永远重排**：精灵动画 planner 是一个**自重置的 setTimeout 链**——每个 tick 结束再 `setTimeout(tick, interval)` 排下一个，于是事件循环里始终有一个（每 tick 一个）**活跃 Timeout 句柄**。Node 只要还有未 unref 的活跃定时器就**不会退出事件循环**——测试断言全部 PASS 也没用，进程就是不退出。
- **链子何时断**：只要 planner 所在组件**一直挂着**（tick 永远重排），链子永不终止。
- **哪些主机会挂载却不卸载**：flip 之后特性默认开启，**channel-ui 组的场景检查主机**挂载了 header 组件（planner 随之启动），断言跑完后**不卸载**它（无 teardown），于是链子从测试结束一直转到被 runner 超时杀掉。时间线佐证：挂起与“默认从 off 翻成 on”的同一个 push 首次出现——默认关闭时这些主机根本不挂组件、根本没有这条定时器链，所以历史上 ~3 分钟稳定结束；flip 后空转到超时（本地观测到 19 分钟空转后被手动杀）。
- **杀掉时的进程状态**：没有在跑的测试、没有挂起的断言——纯粹是事件循环里那串 Timeout 句柄（每 tick 一个、互相重排）让进程“活着”。

### 4.2 为什么交互式终端产品不受影响

它的进程**本来就靠 TTY/stdin 句柄活着**——TTY 打开期间事件循环永远不会因为“没事可做”而退出，所以多一条自重置定时器链对它**没有任何可观测影响**（动画 planner 本就该随 UI 生命周期常驻）。同一段代码，在“UI 常驻 + TTY 保活”的交互产品里是天经地义，在“跑完就该退出”的 CI 主机里就是挂起——差异不在代码，在**宿主是否给了进程退出的机会**。

### 4.3 一行修复

```ts
const t = setTimeout(tick, interval); if (t.unref) t.unref()   // 定时器不再钉住事件循环
```

把重排的定时器 **unref**：它照常触发（交互产品里 TTY 仍保活、动画照跑），但**不再阻止进程退出**——CI 里测试一跑完、没有别的保活句柄，进程立即退出，job 正常结束。

结构性配套（防回归，非那一行）：planner 在组件 dispose/unmount 时 `clearTimeout`；测试主机显式卸载组件；CI 加一条“跑完断言零活跃 Timeout 句柄”的退出探针。注意：**只靠“卸载时清理”修不了当前 CI**——证据明确说这些主机压根不卸载，所以让定时器不保活（unref）才是对现状直接生效的一行修复。

## 5. Prevention（预防）

**要点结论**：终端半块精灵实现应随附一份渲染器契约清单（每格完整 SGR、RESET 收尾、禁止尾空白裁剪、显式擦除语义、帧数据摘要闸门、黄金转义测试、定时器生命周期卫生），并在把动画特性默认开启之前跑一次上线审计（退出行为探针、定时器活柄清单、挂载/卸载审计、渲染器契约审查、整帧摘要复跑、灰度开关）。

### 5.1 渲染器契约清单（终端半块精灵实现应随附）

1. **每格完整 SGR**：任何画 `▀`/`▄` 的格必须同时显式携带前景与背景（有着色的半 = palette 色，空的半 = 透明/画布色）；**禁止**依赖 SGR 粘滞——空的那一半永远显式写出。
2. **状态缓存以完整 (fg,bg) 对为键**：`current` 之类的“只发变化量”优化必须按整格渲染状态比对，任何一半变化都要重发。
3. **行收尾 RESET**：每行以 `\x1b[0m` 结束，任何属性不得泄漏到下一行/下一帧。
4. **禁止尾空白裁剪**：行按精灵包围盒全宽输出，透明格显式写成“透明底 + 空格”——终端从不清除未写入的格子，裁剪=留鬼。
5. **显式擦除语义**：每行行尾 EL（`\x1b[K`）；每帧重绘前清空精灵区域——窄帧不得残留宽帧。
6. **帧数据完整性闸门**：100% 帧（含手工移植帧）整帧 sha256 对源美术，摘要钉清单、CI 必过；移植脚本化、禁手抄。
7. **黄金转义测试**：对边缘样例断言**逐字节**的转义输出——右缘半填充格、连续透明段、奇数行数、最宽/最窄帧、宽→窄帧切换（并断言切换后无残留格）。
8. **动画生命周期卫生**：planner 定时器 unref 或在 dispose 时 `clearTimeout`；组件可被干净卸载；测试断言 teardown 后零活跃 Timeout 句柄。

### 5.2 翻默认开关之前的上线审计（flip 前必跑）

1. **退出行为探针**：以新默认态跑完整 CI（**非 TTY 环境**），确认进程跑完即**退出**、总时长贴近 flip 前基线（本例 ~3 分钟）；任何“PASS 后空转”立即视为挂起。
2. **定时器活柄清单**：grep 所有自重置 `setTimeout`/`setInterval`，逐个分类（unref 了？dispose 时清了？）；用 `process.getActiveResourcesInfo()` 断言套件结束后无残留 Timeout。
3. **挂载/卸载审计**：枚举特性在测试/CI 主机会挂载的每个组件，验证 teardown 真的卸载；补“挂载→卸载→零活柄”测试。
4. **渲染器契约审查**：按 5.1 清单逐条过渲染器；补幻影/残影边缘用例（右缘半填充格；宽→窄切换残留断言）。
5. **整帧摘要复跑**：重跑摘要闸门（全帧、非逐段），要求全 OK 才允许开。
6. **灰度与可回滚**：默认开启先走特性开关灰度，双态（on/off）各跑一轮 CI 观察 soak；保留一键回滚；盯 job 时长与空转进程症状。

### 5.3 一页纸复盘

| 层 | 缺陷 | 修复 | 契约条目 |
|---|---|---|---|
| 渲染（SGR） | 半填充格只发前景，背景粘滞污染空半 | 半填充格补发透明背景（`\x1b[49m`） | 契约 1/2/3 |
| 渲染（擦除） | 行尾空白裁剪 + 无 EL，宽帧尾巴残留 | 全宽回写 + 行尾 EL + 帧前清区 | 契约 4/5/7 |
| 数据 | tail2 手工移植左移 1 列，逐段回归漏掉 | 整帧 sha256 闸门、100% 覆盖、移植脚本化 | 契约 6 |
| 运行时 | 自重置 setTimeout 钉住事件循环，CI 主机不卸载 | 定时器 `unref()`（+ dispose 清理/卸载审计） | 契约 8 |

---

## 附录 A · 证据文件清单

- `fixture/README.md`
- `fixture/renderer-excerpt.ts`（46 行，半块渲染器出厂实现）
- `fixture/symptom-log.txt`（3 类症状：幻影/残影/漂移）
- `fixture/frames-digest-report.txt`（tail2 = MISMATCH，23 格，上右区域左移 1 列）
- `fixture/ci-hang-evidence.txt`（PASS 后事件循环被 Timeout 句柄钉住）


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.