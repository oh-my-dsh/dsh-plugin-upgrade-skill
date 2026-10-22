# JUDGE BRIEF · noskill.S19-phantom-update-stale-host

## Criteria (sealed rubric)
- [baked-version-release-order] (20pt) Compare release-log.md and client-bundle-excerpt.js: build preceded the bump, baking 0.3.6 into the shipped v0.3.7 client, so a newer-tag comparison reports an update to itself despite correct mirrored tags. Explain that package.json is not reread at runtime. Bump before build, inspect the emitted version constant before commit/tag/distribution, and retain mirror verification; do not confuse v0.3.8’s later manifest with the earlier build.
- [client-host-update-asymmetry] (20pt) Use asset-route-probe.txt and lib-index-excerpt.js: the refreshed client shows the toggle, PNG 200 proves the route exists, SVG 404 unsupported-type shows its running whitelist is old while disk already permits SVG. This linked install needs the host restarted to reload its boot/apply-time handler; client refresh does not replace that closure. Keep the conclusion specific to this host lifecycle, not every possible plugin hot-reload mechanism.
- [payload-corruption-attribution] (20pt) Use session-log-excerpt.txt’s clean source/XML and typed read result versus spliced persisted model-visible text and clean reread to locate corruption in upstream result-text assembly. The plugin consumes the damaged copy; the traced disk file is innocent. Treat the payload as untrusted input and do not “repair” the good SVG. No identification of an unseen internal function is required.
- [validated-render-fallbacks] (20pt) Design and justify the ordered chain: authoritative disk bytes via the asset route; session payload only after XML well-formedness validation (DOMParser/parsererror or equivalent); a sandboxed iframe fallback with scripts blocked while permitting SMIL; an explicit error if content/validation/rendering fails. Validation failure must not pass the same malformed payload unchecked to the iframe. Equivalent implementation details are accepted; this is a plan, not an executed security test.
- [forensics-and-prevention] (20pt) Explain decoding all concatenated Zstandard frames, preserving order and reconstructing the JSONL event containing the exact stored splice, then comparing that text with the source and reporting the upstream bug. A decoder that handles concatenated frames directly is equivalent to a manual frame loop; do not require magic-byte constants. Checklist: bump before build, verify the shipped constant and per-mirror tag SHA, and use plane-specific runtime probes. No actual log decode or upstream posting is required.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [contradictory-release-render-advice] ceiling=0 The final advice says bump-after-build is acceptable, mirror repush alone repairs the baked constant, browser refresh updates this host route without restart, or the clean traced SVG should be edited. Rendering the session payload without XML validation or allowing scripts in the fallback also triggers this cap. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.

## Candidate report(s)
#### FILE: S19-phantom-update-stale-host/S19-phantom-update-stale-host-report.md

# S19 — The Phantom Update, the Stale Host Half, and the Corrupted Payload

**Case:** @dsh-external/dsh-file-trace v0.3.7 (markdown renderer fix) + v0.3.8 (SVG render preview), one maintainer session on 2026-09-05.
**Mode:** read-only forensic analysis. The evidence pack under `fixture/` was never modified (hashes in Appendix A); nothing outside this cell was read.
**Deliverable:** this report. No migration, install, network call, or write outside `agent-output/` was performed.

## 0. 结论速览

1. **幽灵自更新**：被比较的版本号是**构建期内联**的常量，不是运行时读取。16:22 先构建（此时 `package.json` 还是 0.3.6），16:23 才 bump 到 0.3.7，已构建的 `lib/client.js` 被原样提交进 tag ⇒ tag 的内容自称 0.3.6，而 tag 名是 v0.3.7。镜像/tag 校验只能证明"三个镜像字节一致"，恰好证明了那份**错的内容**被一致地发布出去，因此与本 bug 无关。
2. **客户端/宿主不对称**：客户端 bundle 是每次页面加载重新取回并执行的短生命周期资产（所以新 UI 出现）；宿主 `lib/index.js` 只在进程启动时被 require 一次、路由表在 `apply()` 里注册一次，Node 模块缓存让旧闭包一直存活。PNG 200 + SVG 404("unsupported image type") + 磁盘 `lib/index.js` 里有 `svg` ⇒ 运行中的进程 ≠ 磁盘产物，唯一解释是**未重启的宿主进程**。
3. **坏图归因**：磁盘文件 well-formed，日志 payload 不是 well-formed，且 payload = 源 232 行前 52 字节 + 源 247 行第 35 字节起的尾巴，把 233–247 行整段吞掉。这发生在**结果文本装配/落盘层**（上游），插件拿到的就是被污染文本；重读干净 ⇒ 非确定性。改/修 SVG 文件是错的：既会破坏一个好文件，又会抹掉上游 bug 的证据。
4. **防御渲染链**：磁盘字节（权威）→ 会话 payload（**必须先过 DOMParser + parsererror**）→ 沙箱 iframe（无 allow-scripts，SMIL 仍跑）→ 显式错误态（带来源、状态码、解析器行列号）。每一级都要能说明"为什么还没到下一级"。

## 1. 五个问题的判定一览

| # | 问题 | 判定 | 决定性证据 |
|---|---|---|---|
| 1 | 刚发布的 v0.3.7 为什么给自己弹更新 | 打包顺序错：**build 在 bump 之前**，bundle 里 `PLUGIN_VERSION = "0.3.6"` 被冻进 tag | `fixture/release-log.md:5-6`、`fixture/client-bundle-excerpt.js:7-9` |
| 2 | 新客户端 UI 到了，新宿主路由为什么还 404 | 宿主半边是**启动期加载**，进程没重启，跑的是旧白名单闭包 | `fixture/asset-route-probe.txt:5-19`、`fixture/lib-index-excerpt.js:12`、`fixture/release-log.md:26` |
| 3 | 坏图是谁的错 | 上游**结果文本装配/会话落盘**在共享前缀处拼接错行；磁盘文件本身没问题 | `fixture/session-log-excerpt.txt:4-33` + 本报告 4.2 节的精确对位 |
| 4 | 渲染源顺序怎么设计 | 磁盘字节 →（校验后）payload → 沙箱 iframe → 显式错误态，且要记录"像素是谁给的" | 设计见第 5 节 |
| 5 | 取证与预防 | 对 concatenated-zstd 逐帧解码 → 取 JSON 原文 → 与磁盘做字节级 diff → 定位拼接点 | 方法见第 6 节，清单见第 7 节 |

---

## 2. 幽灵自更新：为什么插件宣告"自己是新版本"

### 2.1 被比较的常量从哪来：构建期 vs 运行时

`fixture/client-bundle-excerpt.js:7-9` 是发布出去的 `lib/client.js` 原文：

- `export const PLUGIN_VERSION = "0.3.6";`
- 紧跟着的证据注释：`tsdown inlined this constant from package.json WHEN THE BUNDLE WAS BUILT — it is not read dynamically at runtime.`

也就是说存在两种"版本"事实源，生命周期完全不同：

| 事实源 | 何时求值 | 谁持有 | v0.3.7 发布后其值 |
|---|---|---|---|
| `package.json` `version` | 构建时（bundler 的 `define` 内联） | 源码仓库 / 发布工具链 | 0.3.7 |
| `PLUGIN_VERSION`（bundle 内） | **构建那一刻快照**，此后不可变 | 浏览器里执行的静态资产 | **0.3.6** |
| 镜像最新 tag | 每次自更新检查时 `git ls-remote --tags` | 三个镜像 | v0.3.7 |

浏览器端的 bundle 永远不会去读 `package.json`——它是被 `<script>` 加载的静态模块，没有文件系统。所以"我正在跑的版本"这个自我认知被永久钉在 16:22 的磁盘状态上。**运行时唯一的版本真相在宿主**，而比较逻辑却用了客户端自己烤进去的副本：这是一个自我指涉的闭环。

### 2.2 真正的操作顺序错误（逐分钟复盘）

| 时刻 | 动作 | 缺陷 |
|---|---|---|
| 16:20 | 改 `src/client/markdown.tsx` + 回归测试 | — |
| 16:21 | `typecheck` 绿、`vitest` 104 passed | 测试全绿**也不报错**：没有断言"我的版本 == 我发布的 tag" |
| 16:22 | **`pnpm run build`，bundle 落盘** | ← 此处把 0.3.6 烤进 `lib/client.js` |
| 16:23 | **bump `package.json` 0.3.6 → 0.3.7** | **顺序颠倒**：版本号的消费者（build）先跑，生产者（manifest）后改 |
| 16:23 | README 安装引用改成 `#v0.3.7` | 文档先"宣称" 0.3.7，产物仍自称 0.3.6 |
| 16:24 | `git commit`（**包含已经构建好的 `lib/client.js`**）+ `git tag v0.3.7` | 把陈旧产物钉进 tag：tag 名与 tag 内容互相矛盾 |
| 16:25 | push 到 origin/public/omdsh，`ls-remote` 校验 tag SHA 三处一致 | 校验的是"一致性"，不是"自洽性" |

缺陷可以一句话概括：**版本号是在 build 之后才改的，而 build 会把它烧进产物**。发布物因此比它自己的名字旧一个 patch。

### 2.3 为什么它偏偏在"发布之后"才现形

`fixture/client-bundle-excerpt.js:11-17` 的比较逻辑是单向的"远端更新则提示"：

```js
function newerTag(latestTag) {
  return latestTag !== undefined && compareSemver(latestTag, PLUGIN_VERSION) > 0
    ? latestTag : undefined;
}
```

- 发布**前**：镜像最高 tag 是 v0.3.6，`0.3.6 > 0.3.6` 为假 ⇒ 无 badge。
- 发布**后**：最高 tag 变成 v0.3.7，`0.3.7 > 0.3.6` 为真 ⇒ badge "新版本 v0.3.7 可用"。

所以触发条件是"那个 tag 真的存在"，而 tag 存在正是发布动作本身。这解释了为什么症状看起来像"镜像提前泄露了新版本"或"缓存没刷"——现象学上，**自我过期**和**被镜像告知有新版本**产生了完全相同的 UI。噪声点在于：badge 文案里的版本号恰好等于用户刚刚安装的版本，这是唯一的不协调信号。

### 2.4 为什么镜像/tag 完整性检查在这里完全无效

`fixture/git-tags.txt:4-9` 显示三个镜像的 `refs/tags/v0.3.7` 都是 `748b5e56…`、`v0.3.8` 都是 `d887deb0…`，且 `ls-remote` 无鉴权可读——**分发的完整性是满分的**。

问题在于这三类校验各自能证明什么：

| 校验 | 能证明 | 不能证明 |
|---|---|---|
| 三镜像 tag SHA 相同 | 三处字节一致、没有镜像滞后/投毒/半同步 | 那份一致的字节**是否正确** |
| tag 指向预期 commit | 引用解析正确 | 该 commit 里的产物是否**与 tag 名自洽** |
| bundle 可下载、可执行 | 分发链路健康 | bundle 自称的版本是否等于 tag |

SHA 相等是"三个证人说了同一句话"，不是"这句话是真的"。事实上，三镜像一致**加强**了错误：它证明陈旧常量已经被不可逆地、三方一致地发布出去，任何基于"换镜像重试"的修复都不会有效。`fixture/release-log.md:12-15` 记录的重发布（amend + rebuild + 强推 tag）正是这个结论的代价证明。

### 2.5 正确的发布顺序

单一事实源是 `package.json` 的 `version`；一切派生值（bundle 常量、README 引用、changelog 标题、tag 名）都必须**在它之后**生成：

1. 改代码 + 回归测试（在源码树上，`git status` 干净）。
2. **先 bump `package.json`**（0.3.6 → 0.3.7）。这是唯一一次"写版本"。
3. **再 build**：让 bundler 从新 manifest 内联常量；构建后**不再触碰** `package.json`。
4. **构建期断言**（见 2.6）：bundle 里的常量 == manifest 版本，不等则 fail-closed。
5. 更新 README/changelog 引用（派生，且与 manifest 对齐）。
6. `git commit`（只提交第 3 步之后重新生成的产物；提交后 `git status --porcelain` 必须为空）。
7. 打 tag → 三镜像 push → `ls-remote` 逐镜像核对 SHA。
8. 发布后冒烟：用**构建产物本身**跑一次自更新判定，`newerTag("v0.3.7")` 必须为 `undefined`。

### 2.6 本可以在 push 之前拦住它的检查

**主检查（构建后、打 tag 前，10 行，必过）**——直接读发布物，而不是读源码：

```js
// scripts/verify-bundle-version.mjs — run right after build, before tag/push
import { readFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const src = readFileSync('lib/client.js', 'utf8');
const m = src.match(/PLUGIN_VERSION\s*=\s*"([^"]+)"/);
if (!m) throw new Error('no PLUGIN_VERSION in shipped bundle');
if (m[1] !== pkg.version) {
  throw new Error('stale baked constant: bundle=' + m[1] + ' manifest=' + pkg.version);
}
```

人类可读的等价一行（这就是题面要求的 "grepping the shipped bundle for the baked constant"）：

```sh
grep -o 'PLUGIN_VERSION = "[0-9.]*"' lib/client.js   # -> "0.3.6"
node -p "require('./package.json').version"          # -> "0.3.7"  => mismatch, abort
```

**辅助检查（各自覆盖不同的失误通道）**

| 检查 | 抓什么 |
|---|---|
| 自更新单元测试跑在**构建产物**上：`newerTag("v" + pkg.version) === undefined` 且 `newerTag("v0.3.9") !== undefined` | 比较逻辑回归；也能抓"比较方向写反" |
| tag 后重建对拍：`git worktree add /tmp/v037 v0.3.7 && npm ci && npm run build && git diff --exit-code -- lib/` | 产物不可复现 / 提交了手工改过的 bundle |
| `git status --porcelain` 在 build 后必须为空 | "build 之后又改了 `package.json`"这一类顺序错误 |
| 版本号只在一处出现（manifest），其余全部生成 | 从根上消灭"两个事实源" |

**结构性修复（治本）**：不要把"当前版本"烤进客户端。客户端应问宿主（例如走 `/plugin/meta` 或由宿主在引导 HTML 里注入，和 `dsh web` 注入 `window.__DSH_BOOT__` 的做法同源），bundle 内常量降级为离线兜底显示值。这样"我是不是旧版本"永远以**正在运行的宿主**为准，自我指涉的闭环消失。

### 2.7 事故后的补救方式也值得记入清单

用 amend + force-move 把公开 tag 挪走，会破坏任何已经 `ls-remote` 过该 tag 的客户端的 SHA 固定、缓存和审计链——它把一个"自洽性 bug"升级成"引用完整性事故"。正确补救是**发一个新 patch（0.3.8）**并在 changelog 里说明 0.3.7 的自我提示是误报；已经被消费的 tag 不要动。

---

## 3. 客户端 vs 宿主：两个平面，两种生命周期

### 3.1 代码在哪里、何时被加载

| | 客户端半边（`lib/client.js`） | 宿主半边（`lib/index.js`） |
|---|---|---|
| 运行位置 | 浏览器页面 | Node 宿主进程 |
| 加载时机 | 每次页面加载/导航：loader 重新取 bundle 并执行 | **进程启动时 require/import 一次** |
| 生命周期 | 短：刷新即弃 | 长：直到进程退出 |
| 更新生效方式 | 重新取回 + 重新执行（刷新/HMR 即可） | **重建路由表需要重启进程** |
| 缓存层 | HTTP 缓存 / 模块图（按 URL/hash 失效） | Node require 缓存（按解析后路径 memo，进程级） |
| 本案例中的事实 | 新 toggle 出现了 ⇒ 新 bundle 已被执行 | 旧 `CONTENT_TYPES` 闭包仍在响应请求 |

宿主的路由是在插件 `apply(ctx)`（启动期）里注册的；`CONTENT_TYPES` 是被 handler 闭包捕获的**模块级常量**。文件在磁盘上被替换，对已经完成求值的模块没有任何影响——Node 不会监视 `lib/index.js` 并热替换其导出对象，更不会回溯替换闭包里已经捕获的对象。这就是"磁盘是新的、行为是旧的"的机制。

### 3.2 三个探针如何把问题钉在"运行中的宿主进程"

| 观测 | 它排除了什么 | 它留下什么 |
|---|---|---|
| PNG `200 OK` + `content-type: image/png` | 路由没注册、插件没加载、服务挂了、鉴权/路径白名单把请求挡在 handler 之外 | handler 活着，扩展名→content-type 映射对 png 正常 |
| SVG `404 Not Found` + body `"unsupported image type"` | 通用 404（路由不存在会返回框架的 404 页，而不是 handler 自己的错误串）；文件不存在（那会是另一条错误）；磁盘没写（`lib-index` 里有 svg） | **handler 执行到了白名单分支并主动拒绝了 svg** ⇒ 正在执行的那份白名单里没有 `svg` 这个 key |
| 磁盘 `lib/index.js` 含 `svg: 'image/svg+xml'`（`fixture/lib-index-excerpt.js:12`） | 发版内容有误、tag/镜像/发布链有问题 | 产物正确 ⇒ 差异只能来自"已加载但过期的进程镜像" |
| 本会话内**未重启宿主**（`fixture/release-log.md:26`） | 其他"旧代码"来源（例如另一个监听端口的旧实例、旧容器） | 陈旧副本 = 启动时加载进内存的那一份 |

四条合起来是唯一自洽的解释：**运行中的宿主进程镜像 ≠ 磁盘产物，而发布物是正确的**。注意第三个观测是关键的"排除法锚点"——它把"发版漏了 svg"这个最省事的假设直接否掉，也说明 `404` 这个状态码本身是误导性契约（见 3.4）。

反过来验证这个结论只需要一个动作：重启宿主 → 重放同一个 SVG 探针 → 期望 `200` + `content-type: image/svg+xml`。如果重启后仍 404，才轮到怀疑白名单分支（例如扩展名大小写、query 里的 `%2E` 编码、realpath 后的后缀判断）。

### 3.3 让宿主平面变更生效的正确姿势

1. 明确标注"此版本含宿主平面变更"（路由、content-type 白名单、config schema、service 方法、启动钩子），发布说明里写 **requires host restart**。
2. **重启宿主进程**（不是刷新页面、不是重装插件）。插件重装只会更新磁盘文件，不会重新执行已经求值的模块。
3. 重启后跑**路由契约探针**：对白名单内每种扩展名各发一次请求，断言 `status` 与 `content-type`，而不只是"能打开"。这一步正是本案例缺的验收。
4. 加**陈旧宿主检测**：宿主在响应头里带自己的构建标识（如 `x-plugin-build: 0.3.8`），客户端把它与自己 bundle 的构建标识比对；不一致时 UI 显示"宿主需要重启以启用 SVG 预览"，而不是让用户看到一个坏图或 404。这是把"看不见的平面差异"变成"可读的状态"的最低成本手段。

### 3.4 为什么这里恰好是"插件热更新"规则的例外

通常说的"插件热更新"覆盖的是**客户端平面**：bundle 是每次加载重新取回、重新求值的产物，dev 下还有 HMR 接收器，所以改前端能"立刻看到"。这条规则不适用于：

- 宿主模块在进程内只求值一次，导出对象与闭包被 `require` 缓存固化；
- 路由表是**启动期一次性注册**到宿主 HTTP 服务上的（注册完就与模块解耦，改文件无法改变已注册的 matcher）；
- 宿主持有会话状态、进行中的任务和文件句柄，隐式热重启会破坏这些不变量，所以运行时**故意**不提供宿主热替换——这不是缺陷，是设计约束。

推论（值得写进插件开发规范）：**凡是落在 `lib/index.js` 的改动，验收必须包含一次宿主重启 + 重启后探针**；只有客户端改动才允许"刷新即验收"。本案例的 toggle 出现只证明了前半句，团队把"客户端可见"误当成了"发布完成"。

---

## 4. 坏图归因：坏的是文本，不是文件

### 4.1 三条事实互相矛盾，唯一能同时成立的解释只有一个

| 事实 | 来源 |
|---|---|
| 磁盘上的 SVG 是 well-formed XML（`XmlDocument` 加载无错） | `fixture/session-log-excerpt.txt:21` |
| 会话日志里的 read 结果文本**不是** well-formed，解析器报 `line 233 at column 54: Specification mandates value for attribute stro0` | `fixture/session-log-excerpt.txt:22-23` |
| 同一区域重读一次，回来是干净的 | `fixture/session-log-excerpt.txt:31-33` |

如果坏的是文件，重读不可能干净；如果坏的是渲染器/编码器（确定性的变换），两次读会得到同样的坏文本。**只有"非确定性的文本装配"能同时满足三条**。而"日志里的文本"与"插件/模型收到的文本"是同一份字节——见下一节的列号对位。

### 4.2 精确对位：把 16 行压成 1 行的拼接

用 `fixture/session-log-excerpt.txt` 的三段文本做字节级比位（0-based 切片，忽略行号前缀）：

```
payload  = src232[0 : 52] + src247[35 : ]
丢弃 232 尾  = src232[52:68]  = 'ke-width="6.5"/>'
丢弃 247 头  = src247[0:35]   = '    <path d="M 587,730 A 122,122 0 '
```

- 232 行的公共前缀是 `    <circle r="98" fill="none" stroke="#dde6ea" stro`（到 `stro` 为止，52 字节）；
- 断点之后紧接的是 247 行的 `0,1 821,730" fill="none" stroke="#ffffff" …`，即 247 行第 35 字节起的尾巴；
- 中间 233–247 共 15 行**整段消失**，被折叠进 232 这一行；
- 拼接点两侧恰好共享 `stro`：232 行是 `stroke-width="6.5"`，247 行断点上一位是 `…A 122,122 0 ` 的弧参数。共享前缀让拼接看起来"像连续文本"，人眼扫过去不容易发现。

**列号对位（这一步把"日志文本"升级为"送达文本"的证明）**：`stro0` 这个假属性名在该行内起始于第 49 列；解析器报错列是 54，即紧跟在 `stro0` 之后的那个 `,`（`stro0` 占 5 字符，49+5=54）。这说明解析器**确实在 `stro0` 后遇到 `,` 而要求 `=`**，与 `Specification mandates value for attribute stro0` 完全吻合——日志里存的字节就是被解析的那份字节，不是"日志显示层的再加工"。解析器的行号 233 比示例标注的 232 大 1，可由该结果块自身带一行引导（换行/`<svg>` 起始行）解释，属同一处错行的偏移，不影响归因。

### 4.3 哪一层产生了这段文本

按数据流从下往上排：

```
磁盘文件(完好) → read 工具读字节 → 结构化结果 → 【结果文本装配】 → 会话日志(generation 帧) → 宿主/客户端插件 → 用户看到的 SVG
                                                     ^^^^^^^^^^^^^^^^ 在这里坏
```

证据指向**工具结果的文本装配/会话落盘层**（模型可见 result block 的拼装与序列化），即插件上游：

- 症状是"行级合并 + 尾段替换"，典型的缓冲区/切片/追加偏移 bug（例如按块拼接时用错的 offset，或对"共享前缀"做了去重/续写优化），而不是任何 XML/SVG 语义错误；
- 非确定性（重读干净）= 竞态或按块边界/缓冲余量触发，跟文件内容只有"提供共享前缀"的关系；
- 插件从未解析过这 16 行的原文，它只是把字符串塞进渲染路径——它拿到什么就渲染什么。

一个必须诚实标注的残余歧义：`fixture/session-log-excerpt.txt:31-33` 同时写了"read 工具的 TYPE result 交付给调用方是干净的"和"模型可见的 result block 写进日志时是 corrupted"。如果这两句指**同一次**读取，那么坏点更靠上（结构化结果 → 文本块渲染那一步）而不是传输；如果"干净"指的是后来的重读，那就与"非确定性"一致。区分实验很便宜：对同一区域连续读 N 次（含大文件、跨块边界、带共享前缀的行），同时抓结构化结果与最终文本块，逐字节比对；差异一旦只在文本块出现且可复现于特定块边界，就锁死在文本装配层。无论哪种，归属都在插件上游，不改变结论 3。

### 4.4 为什么插件必须把会话 payload 当不可信输入

1. **它是转录副本，不是文件**：经过读窗口裁剪、行号/前缀加工、可能的截断与摘要，天然可能与磁盘不同；本案还出现了拼接和丢行。
2. **它可能被别的写者污染**：会话里同一路径可能出现多次（旧读、坏读、干净读），payload 是"某一次"的采样，没有版本或校验和。
3. **它可能是攻击面**：文件内容会进入转录；SVG 可以携带 `<script>`、`on*` 属性、外部 `<image href>`、`<foreignObject>`。把 payload 直接送进 DOM 等于把"文件内容"当成"可信代码"。
4. **它的失败模式是静默的**：坏文本在 `<img src=blob:>` 里只表现为一个坏图图标，没有任何错误信息——正是本案用户看到的。

因此信任顺序必须是：**磁盘字节（权威、可校验）> 会话 payload（方便、需校验）> 沙箱隔离渲染（不确定时的容器）> 显式错误（绝不静默）**。

### 4.5 为什么"修复"被 trace 的文件是错误动作

- 磁盘文件本来就是 well-formed 的（`fixture/session-log-excerpt.txt:21`）——去"修"它就是**改一个没有坏的文件**，还可能把它改坏；
- 它会**销毁证据**：一旦文件被改写，就无法再证明日志里的文本是拼接产物，事故会退化成"某个 SVG 兼容性问题"，上游的文本装配 bug 继续存在，并会命中任何"行间共享前缀"的文件（例如批量生成的 path/circle 序列、缩进一致的配置/代码），危害面远大于一个 SVG；
- 它**不解决渲染路径**：下次 payload 再被污染，同样的坏图会重现；用户还得再被"修"一次；
- 它会**污染版本历史**：一个只为绕过上游 bug 的无关改动混进这个插件的 diff，未来排查时成为噪声。

正确动作是：保留原文件不动 → 用日志帧取证 → 把"帧 id + 拼接偏移 + 两处 sha256 + 复现条件"报给上游 → 在插件侧加校验与显式错误态（让自己在下一次不再静默）+ 在 UI 上提供"从磁盘重试"。**报 bug，不要打补丁掩盖**。

---

## 5. 防御性渲染链

### 5.1 顺序与每一级的理由

| 级别 | 源 | 前置条件 | 为什么是这一级 |
|---|---|---|---|
| **L1 磁盘字节** | `GET /dsh-file-trace/asset?path=…`（宿主按请求读盘） | 路径在已 trace 集合内、realpath 落在允许根内、扩展名在白名单、大小上限 | 与用户磁盘上的文件**同源同字节**；插件不依赖转录，天然免疫 4.x 所述的文本污染；可顺带返回内容 sha256 供 UI 显示"来源：磁盘" |
| **L2 会话 payload** | 日志里的 read 结果文本 | **必须先过 XML well-formedness**：`DOMParser` + `parsererror`；根元素 `localName === 'svg'` 且 `namespaceURI === 'http://www.w3.org/2000/svg'`；再消毒（去 `<script>`/`<foreignObject>`/`on*`/`javascript:`/外部引用）后从 DOM 重新序列化 | 只在 L1 不可用（宿主路由 404、文件被移走、远端工作区、离线回放）时启用；校验把"坏文本"变成"带行列号的明确错误"，而不是坏图。DOM 往返还顺带证明可解析、可安全重排 |
| **L3 沙箱 iframe** | 已校验/已消毒的 SVG，或来源不确定但 well-formed 的 SVG | `<iframe sandbox="">`（**不给** `allow-scripts`、`allow-same-origin`、`allow-top-navigation`）+ `srcdoc` 内联 CSP `default-src 'none'; style-src 'unsafe-inline'` | 最后一道渲染兜底：需要动画/`<img>` 渲染不了的特性，或来源不确定时，用硬隔离容器渲染；脚本被禁，**SMIL 与 CSS 动画属声明式、不受 `allow-scripts` 约束，仍会跑**，正好满足"要动起来但绝不许执行脚本" |
| **L4 显式错误态** | 无 | — | 三级都失败时给出**可诊断**结果：错误码、尝试过的源、HTTP 状态、解析器行列号、消毒统计、`[从磁盘重试]` `[查看 payload 原文]` `[复制诊断]`。绝不用静默坏图代替错误 |

关键不变量：

- **不能越级静默降级**：L1 因"unsupported image type"404 而落到 L2，必须在 UI 上标明"当前由会话 payload 渲染（宿主路由未就绪，可能需重启宿主）"。本案里这一句提示就能让用户 5 秒定位到第 3 节所述的宿主陈旧问题。
- **像素要有出处**：渲染结果附带 `provenance: disk | payload | sandbox`，并打日志。
- **L2 失败不是致命错误，但要可见**：`parsererror` 的 `line/column/message` 直接展示（本案会显示 `line 233 col 54: … attribute stro0`，任何人一看就知道是文本拼接而非 SVG 不兼容）。
- **L1 的响应契约要收紧**：`image/svg+xml` + `X-Content-Type-Options: nosniff` + 一条 `Content-Security-Policy`（`default-src 'none'; style-src 'unsafe-inline'`），并考虑 `Content-Disposition: inline` 只在 iframe 内使用；不支持的类型返回 **415**（或 400）+ 被拒扩展名 + 白名单版本，而不是 404 `"unsupported image type"`——本案正是这个错状态码把"宿主陈旧"伪装成了"文件不存在"。

### 5.2 骨架（伪代码，含降级理由）

```js
async function renderSvgPreview(path) {
  // L1: authoritative disk bytes
  const r = await fetch(assetUrl(path));              // host route, per-request read
  if (r.ok && r.headers.get('content-type') === 'image/svg+xml') {
    return { provenance: 'disk', url: URL.createObjectURL(await r.blob()) };
  }
  const l1 = { status: r.status, body: await r.text() };   // keep for diagnostics

  // L2: session payload, only after well-formedness + sanitisation
  const text = payloadFor(path);                      // may be corrupted / stale
  if (text != null) {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const err = doc.querySelector('parsererror');
    if (err) return fail('payload-not-well-formed', { l1, parsererror: err.textContent });

    const root = doc.documentElement;
    if (root.localName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg') {
      return fail('payload-not-svg-root', { l1 });
    }
    const clean = sanitize(root);                     // strip script/foreignObject/on*/js:/ext refs
    if (clean.removed.length) log('sanitised', clean.removed);
    return { provenance: 'payload', ...sandbox(serialize(clean.svg)) };
  }

  // L3 is reached through sandbox() above; L4 is the explicit terminal state
  return fail('svg-unavailable', { l1, hint: l1.status === 404 ? 'host may be stale: restart host' : null });
}

function sandbox(svgMarkup) {
  // no allow-scripts, no allow-same-origin, no top-navigation; SMIL/CSS animations still run
  return { kind: 'iframe', sandbox: '', srcdoc: cspMeta() + svgMarkup };
}
```

### 5.3 这一串设计分别挡住了什么

| 故障类别 | 本案例里的表现 | 被哪一级挡住 |
|---|---|---|
| 转录文本损坏（拼接/丢行） | 坏图，无任何提示 | L2 的 `parsererror` → L4 显式错误（"line 233 col 54"） |
| 宿主路由陈旧 | SVG 404，PNG 200 | L1 的 415/404 分类 + provenance 标注 + "需重启宿主"提示 |
| 文件被移走/改名 | 路由 404 | L1 落到 L2（payload 仍可预览），provenance 标注 |
| 恶意 SVG（脚本/外链） | 静默执行或外连 | L2 消毒 + L3 `sandbox=""`（无 `allow-scripts`）+ CSP `default-src 'none'` |
| 需要动画的 SVG | `<img>` 不播 SMIL | L3 iframe（脚本仍禁） |
| 一切都没救 | 坏图图标 | L4 错误态 + 诊断 + 重试入口 |

---

## 6. 取证方法：把"轶事"变成"证据"

### 6.1 对象形态

会话日志是**按代（generation）追加**的文件：每代一个独立 zstd 帧，直接首尾相接写在同一文件里（concatenated frames，帧魔数 `28 B5 2F FD`）。它不是一个"大 zstd 流"，而是"很多个完整帧的序列"——这一点决定了逐帧解码是可行的、无损的：

- 每个帧自带头部（含 content size、是否 checksum），可独立解压；
- 流式解压器（`ZSTD_decompressStream` 语义）在帧结束处返回"本帧完成"，可以据此切出**每代**的原文；
- 因此你可以把"某一段坏文本首次出现在哪一代""哪一代里同一路径是干净的"精确定位到帧，而不是靠时间戳猜测。

### 6.2 逐帧解码步骤

1. **只读拷贝 + 固定证据**：把日志复制到 `agent-output/`（本报告的临时区），记 `sha256` 与字节数；原文件全程只读。
2. **枚举帧**：用支持 concatenated frames 的工具列帧，或流式解压并在每帧结束时记 `(frameIndex, compressedOffset, uncompressedLen)`。`zstd -l` / `zstd --list` 会逐帧列出；Node 侧可用 `zlib.createZstdDecompress()` 之类的流式接口（它对拼接帧与 `gunzip` 对多 member 的行为一致），每次 `'data'` 段对应一段输出，帧界由解压器的帧完成事件给出。
3. **逐帧落盘**：第 i 帧 → `gen-000i.jsonl`（不要合并成一个文件，否则丢失"哪一代写的"这一维）。
4. **逐帧解析 JSONL**：定位 `tool_result` 条目，取 `content` 里的 **原始字符串**（只做 JSON 反转义，不做 trim、不做换行归一化、不重新渲染 markdown）。这一步得到的就是"当时真正存进去的字节"。
5. **与磁盘做字节级 diff**：以 `fs.readFileSync(path)`（binary/utf8，**不做 CRLF 转换**）为基准，算公共前缀长度得到拼接点（本案 52），再用"payload 余段是否是源某行的后缀"搜索定位供体行（本案 src247 偏移 35）。
6. **跨代比对**：在所有帧里搜同一路径，列出"坏文本帧"与"干净文本帧"，证明同一读取在不同时刻产生不同字节 ⇒ 非确定性 ⇒ 排除磁盘与确定性编码器。
7. **完整性登记**：每帧 sha256、抽取出的文本 sha256、拼接偏移、解析器原文报错，全部写进 bug 报告与随附清单。
8. **同时刻磁盘复核**：在同一时间窗内用独立通道（二进制拷贝 + `xmllint`/`XmlDocument`）确认磁盘文件 well-formed，排除"取证期间文件被改"的时间差。

### 6.3 本案据此得到的一句话证据

> 第 N 代帧中 `read` 结果文本 = 源文件第 232 行前 52 字节 + 第 247 行第 35 字节起的尾部；232 行尾 `ke-width="6.5"/>` 与 247 行首 `    <path d="M 587,730 A 122,122 0 ` 丢失；233–247 行整段缺失；该文本 XML 解析在 `stro0` 后的 `,` 处失败（解析器自身报 `line 233 col 54`，与 0-based 列 54 精确对应）。

这条证据把"用户说图坏了"变成"上游在共享前缀处发生了缓冲区/切片拼接错误，偏移可复算"，并且能直接支撑"不要改文件、去报上游"的结论。

### 6.4 取证时的常见坑

| 坑 | 后果 | 规避 |
|---|---|---|
| 只解最后一帧 / 只 tail 文件 | 坏文本在更早的帧里，看不到 | 逐帧全解，按帧索引 |
| 把拼接帧当成单一 zstd 流处理 | 解压到第二帧就报错或被截断 | 用支持 concatenated frames 的流式解码 |
| 用文本模式读文件（Windows 下自动 CRLF） | 偏移全错、diff 全是噪声 | 二进制读，显式 UTF-8 解码 |
| 用 markdown 渲染/重新排版后再比较 | 把展示层差异误当成数据差异 | 只做 JSON 反转义，保持原始空白 |
| 只看损坏的一份，不做跨代对照 | 无法证明非确定性，结论停在"可能是文件问题" | 同路径全代扫描 + 重读采样 |

---

## 7. 预防：这次事故给发布清单加的条目

| # | 条目 | 针对的故障类 | 具体动作（可执行） |
|---|---|---|---|
| 1 | **版本先 bump，再 build** | 构建期内联常量陈旧（本案） | 顺序固定为 manifest → build；build 结束后禁止再改 `package.json`；用 `git status --porcelain` 守门 |
| 2 | **grep 发布物里的烤死常量**，与 manifest 对比 | 任何"构建后改版本/改配置"的漂移 | `verify-bundle-version.mjs`（`2.6`）挂在 build 之后、tag 之前，fail-closed |
| 3 | 在**构建产物**上跑自更新冒烟 | 比较逻辑回归、方向写反 | `newerTag("v"+pkg.version) === undefined` 且 `newerTag("v0.3.9") === "v0.3.9"` |
| 4 | **逐镜像 tag SHA 核对**（保留） | 镜像滞后/半同步/投毒 | `git ls-remote --tags` × 3 镜像，逐条比 SHA（本案已做，仍必要但不充分） |
| 5 | 打 tag 后重建对拍 | 提交了手改产物 / 不可复现 | `git worktree add <tmp> <tag> && npm ci && npm run build && git diff --exit-code -- lib/` |
| 6 | 标记"宿主平面变更"并**重启 + 探针验收** | 客户端可见被误当发布完成（本案） | 发布说明写 requires host restart；重启后对白名单每种扩展名断言 `status + content-type` |
| 7 | 宿主带构建标识（`x-plugin-build`），客户端比对 | 陈旧宿主不可见 | 不一致时 UI 提示"需重启宿主"，而不是坏图 |
| 8 | 资源路由状态码语义化 | "宿主陈旧"被 404 伪装成"文件不存在" | 不支持类型返回 415/400 + 被拒扩展名 + 白名单版本 |
| 9 | 渲染链：磁盘优先、payload 必须过 `parsererror`、iframe 兜底、错误显式 | 静默坏图（本案 3） | 见第 5 节；错误态带 provenance 与解析器行列号 |
| 10 | **报上游文本损坏 bug，而不是在插件里掩盖** | 系统性文本装配缺陷反复命中 | bug 单附：帧号、帧/文本 sha256、拼接偏移（52 / 35）、复现条件（大文件、跨块、共享前缀行）、解析器原始报错 |
| 11 | 已发布 tag 不可移动 | 引用完整性事故 | 出错就发新 patch 版本并在 changelog 说明；禁止 amend + force-push tag |

清单的第 2 条是本案例的"最小充分检查"：它读的是**要发布的那份字节**，而不是源码树里的意图；一条 `grep` + 一次字符串比较就能在 16:25 之前拦住整起事故。第 4 条要保留，但要认清它的边界——它证明"三方一致"，不证明"内容自洽"；两者一起才是完整的发布门禁。

---

## 8. 残余不确定与可证伪的后续动作

1. **文本装配坏点的精确子层**：见 4.3 的歧义。判别实验：同一区域重复读 N 次，同步抓结构化结果与最终文本块，逐字节比对；若差异只在文本块且与块边界相关，则锁定在文本块装配/序列化。
2. **宿主重启后 svg 是否 200**：这是对第 3 节结论的直接证伪点；若重启后仍 404，则需检查扩展名大小写、URL 编码、realpath 后缀判断、以及是否存在第二个未重启的实例。
3. **是否有第二个受害文件**：用"行间共享前缀"做启发式扫描（连续行缩进相同、属性序列相同），若同类文件的 payload 也出现丢行，说明是通用装配缺陷而非单文件巧合。
4. **客户端 bundle 的 HTTP 缓存策略**：确认新 UI 出现是因为内容变了，而不是因为 `no-cache` 让旧字节重新执行——若是后者，第 3 节的"客户端已刷新"这一前提要重新界定（但探针结论不受影响）。

---

## 附录 A — 证据索引（file:line → 用于支撑什么）

| 证据 | 内容要点 | 支撑 |
|---|---|---|
| `fixture/release-log.md:5-6` | 16:22 build 落盘；16:23 bump 0.3.6→0.3.7（build 之后） | 2.2 顺序错误 |
| `fixture/release-log.md:8-10` | commit 含已构建 `lib/client.js`；tag；三镜像 push + ls-remote 校验 | 2.2 / 2.4 |
| `fixture/release-log.md:12-15` | 现象：自我更新 badge；重发布需 amend + rebuild + 强推 tag；v0.3.8 改为 bump 先行 | 2.2 / 2.5 / 2.7 |
| `fixture/release-log.md:26` | 本会话**未重启宿主**；客户端已确认刷新 | 3.1 / 3.2 |
| `fixture/client-bundle-excerpt.js:7-9` | `PLUGIN_VERSION = "0.3.6"`，构建期内联，非运行时读取 | 2.1 |
| `fixture/client-bundle-excerpt.js:11-17` | `newerTag` 单向比较；`v0.3.7 > 0.3.6` ⇒ badge | 2.3 |
| `fixture/git-tags.txt:4-9` | 三镜像 v0.3.7/v0.3.8 SHA 完全相同 | 2.4 |
| `fixture/asset-route-probe.txt:5-19` | PNG 200 `image/png`；SVG 404 `"unsupported image type"`；磁盘 `lib/index.js` 含 svg；未重启 | 3.2 |
| `fixture/lib-index-excerpt.js:3-14` | `CONTENT_TYPES` 含 `svg: 'image/svg+xml'` 与 `pdf` | 3.2 / 5.1 |
| `fixture/package.json:1-6` | v0.3.8 的 manifest（版本唯一事实源） | 2.5 |
| `fixture/session-log-excerpt.txt:4-10` | 日志里的坏文本（232 行被拼接） | 4.1 / 4.2 |
| `fixture/session-log-excerpt.txt:12-17` | 磁盘同区域的干净行（232、247） | 4.2 |
| `fixture/session-log-excerpt.txt:19-23` | 源文件 well-formed；payload 非 well-formed，报 `stro0` | 4.1 / 4.3 |
| `fixture/session-log-excerpt.txt:25-33` | 拼接形状；233–247 缺失；重读干净（非确定性）；坏点在结果文本装配 | 4.2 / 4.3 / 6.3 |

**完整性**（SHA-256 前缀，取证前后一致；本次仅读取）：

| 文件 | 字节 | SHA-256（前 16 hex） |
|---|---|---|
| asset-route-probe.txt | 766 | 444217154496A3E0 |
| client-bundle-excerpt.js | 800 | 37B53A5EAA733E41 |
| git-tags.txt | 696 | 68F00028BBDCB055 |
| lib-index-excerpt.js | 364 | C664935064B5FFC8 |
| package.json | 141 | 33A06353CC2771FA |
| README.md | 1152 | 110916A5E05224FC |
| release-log.md | 1591 | A83EF6EBC611DC6B |
| session-log-excerpt.txt | 1968 | 620D7B9EC6FDD61A |

## 附录 B — 拼接算术（可复算）

```
src232  = '    <circle r="98" fill="none" stroke="#dde6ea" stroke-width="6.5"/>'            # 68 bytes
src247  = '    <path d="M 587,730 A 122,122 0 0,1 821,730" fill="none" stroke="#ffffff" ...' # 131 bytes
payload = '    <circle r="98" fill="none" stroke="#dde6ea" stro0,1 821,730" fill="none" ...' # 148 bytes

commonPrefixLen(payload, src232)           = 52     # '…stroke="#dde6ea" stro'
longest src247 tail that payload endsWith  = 96 bytes, starting at src247[35]
=> payload = src232[0:52] + src247[35:]            # 52 + 96 = 148 字节，长度自洽
dropped: src232[52:68]  = 'ke-width="6.5"/>'       (16 bytes)
dropped: src247[0:35]   = '    <path d="M 587,730 A 122,122 0 '  (35 bytes)
lines collapsed: source 233..247 (15 lines) -> gone
parser: name token 'stro0' starts at column 49; error column 54 == the ',' right after it
```

长度自洽（52 + 96 = 148）说明这是**替换式拼接**（丢中间、接尾巴），不是插入或字符丢失——与"缓冲区偏移/切片错误"的机制吻合，也与"重读干净"（偏移只在特定块边界出现）相容。


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.