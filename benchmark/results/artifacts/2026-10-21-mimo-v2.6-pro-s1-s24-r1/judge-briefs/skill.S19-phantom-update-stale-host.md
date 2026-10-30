# JUDGE BRIEF · skill.S19-phantom-update-stale-host

## Criteria (sealed rubric)
- [baked-version-release-order] (20pt) Compare release-log.md and client-bundle-excerpt.js: build preceded the bump, baking 0.3.6 into the shipped v0.3.7 client, so a newer-tag comparison reports an update to itself despite correct mirrored tags. Explain that package.json is not reread at runtime. Bump before build, inspect the emitted version constant before commit/tag/distribution, and retain mirror verification; do not confuse v0.3.8’s later manifest with the earlier build.
- [client-host-update-asymmetry] (20pt) Use asset-route-probe.txt and lib-index-excerpt.js: the refreshed client shows the toggle, PNG 200 proves the route exists, SVG 404 unsupported-type shows its running whitelist is old while disk already permits SVG. This linked install needs the host restarted to reload its boot/apply-time handler; client refresh does not replace that closure. Keep the conclusion specific to this host lifecycle, not every possible plugin hot-reload mechanism.
- [payload-corruption-attribution] (20pt) Use session-log-excerpt.txt’s clean source/XML and typed read result versus spliced persisted model-visible text and clean reread to locate corruption in upstream result-text assembly. The plugin consumes the damaged copy; the traced disk file is innocent. Treat the payload as untrusted input and do not “repair” the good SVG. No identification of an unseen internal function is required.
- [validated-render-fallbacks] (20pt) Design and justify the ordered chain: authoritative disk bytes via the asset route; session payload only after XML well-formedness validation (DOMParser/parsererror or equivalent); a sandboxed iframe fallback with scripts blocked while permitting SMIL; an explicit error if content/validation/rendering fails. Validation failure must not pass the same malformed payload unchecked to the iframe. Equivalent implementation details are accepted; this is a plan, not an executed security test.
- [forensics-and-prevention] (20pt) Explain decoding all concatenated Zstandard frames, preserving order and reconstructing the JSONL event containing the exact stored splice, then comparing that text with the source and reporting the upstream bug. A decoder that handles concatenated frames directly is equivalent to a manual frame loop; do not require magic-byte constants. Checklist: bump before build, verify the shipped constant and per-mirror tag SHA, and use plane-specific runtime probes. No actual log decode or upstream posting is required.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [contradictory-release-render-advice] ceiling=0 The final advice says bump-after-build is acceptable, mirror repush alone repairs the baked constant, browser refresh updates this host route without restart, or the clean traced SVG should be edited. Rendering the session payload without XML validation or allowing scripts in the fallback also triggers this cap. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.

## Candidate report(s)
#### FILE: S19-phantom-update-stale-host/report.md

# S19 · 幽灵自更新徽标 / 主机半侧滞留 / 损坏会话载荷 — 只读取证归因报告

- **对象**：client 插件 `@dsh-external/dsh-file-trace`，同一会话先后发布 v0.3.7（markdown 渲染修复）与 v0.3.8（SVG render-preview）
- **模式**：plugin-upgrade 技能 Mode A · inspect（只读取证与设计）。全程未执行迁移/安装/构建；`fixture/` 8 份证据逐字节未改动；仅在 `agent-output/` 写入报告。
- **引用卡片（只列 ID 与要点）**：DSH-0.1.2-A1-08（进程代际只能靠探针分辨）、DSH-0.1.5-A1-20（原地升级后 host 重启自愈服务组合错配）、DSH-0.1.7-A2-04（client bundle 在 host 启动时缓存、页面自动重连）、migration-hygiene §3（client 硬刷新生效 / host 半侧需重启）、pre-flight §1.5 ghost-host（问进程、不问磁盘）。

---

## 0. 证据要点速览

| 证据文件 | 钉死的事实 |
|---|---|
| release-log.md | v0.3.7 实际操作序：16:22 **build** → 16:23 **bump** 0.3.6→0.3.7 → 16:24 commit+tag（**包含已构建好的 lib/client.js**）→ 16:25 三镜像推送并验证 tag SHA |
| client-bundle-excerpt.js | 发货 bundle 内 `export const PLUGIN_VERSION = "0.3.6"`；tsdown **构建时**从 package.json 内联，运行时不重读 |
| git-tags.txt | origin/public/omdsh 三镜像均列 v0.3.7、v0.3.8，SHA 逐一同值（v0.3.7 = 748b5e5…） |
| asset-route-probe.txt | 浏览器**已**刷新（新 toggle 可见）、主机**未**重启：PNG → 200 `image/png`；SVG → 404 "unsupported image type" |
| lib-index-excerpt.js | 磁盘上的 `lib/index.js`（v0.3.8 tag）CONTENT_TYPES **含** `svg: 'image/svg+xml'` |
| session-log-excerpt.txt | 日志载荷第 232 行被拼接（源 232 前缀 `…stro` + 源 247 行尾 `0 0,1 821,730"…`），源 233–247 行整体缺失；磁盘源文件 XML 良构、重读干净；载荷 XML 解析在 233:54 报 `Specification mandates value for attribute stro0` |

---

## 1. 幽灵自更新的根因（"新版本 v0.3.7 可用" 出现在 v0.3.7 自己身上）

### 1.1 被比较的版本常量来自哪里：构建期，而非运行期

`lib/client.js` 里参与自更新比较的是 `PLUGIN_VERSION`，它是 **tsdown 在构建时从当时的 package.json 内联进 bundle 的常量**（证据原注释即写明 "inlined this constant from package.json WHEN THE BUNDLE WAS BUILT — it is not read dynamically at runtime"）。而比较的另一端是**运行期**实时取的镜像 tag 列表（`git ls-remote --tags`，取最高 `vX.Y.Z`）。

于是比较式 `compareSemver(latestTag, PLUGIN_VERSION)` 实际在比：

```
运行期查询到的 latest = v0.3.7   vs   构建期烙入的 PLUGIN_VERSION = 0.3.6
→ newerTag("v0.3.7") = "v0.3.7"  → 徽标 "新版本 v0.3.7 可用"
```

**"宣布更新到自己"的不是远端，而是自己肚子里过期的常量**：刚发布的 v0.3.7 与 latest tag v0.3.7 其实是同一个东西，但 bundle 以为自己还是 0.3.6。

### 1.2 真正的操作序错误：先构建、后改版本号（bump-after-build）

release-log 钉死了错误链：16:22 `pnpm run build` 时 package.json 仍是 0.3.6 → 内联常量 0.3.6；16:23 才 bump 到 0.3.7（只改了 package.json 与 README）；16:24 commit **原样提交了早已构建好的 bundle**。版本号的修改发生在构建之后，永远追不进已生成的产物——常量于是"固化在旧版本"。

### 1.3 为什么镜像/tag 完整性与本 bug 无关

git-tags.txt 显示三个镜像的 tag 齐全、SHA 逐一同值、发布者也逐一验证过；分发链完全干净。但完整性校验回答的是"**传输的东西是否被篡改/丢失**"，而本缺陷是"**产物本身在打包时就带错了常量**"。哪怕把同一份 bundle 从官方源原封不动取回，比较结果仍然错误——错误在构建产物内部的"构建期快照 vs 运行期查询"不对称，不在传输层。**镜像验证做对了，也挡不住这类回归**：它与"常量是否与本次版本一致"是两个正交的检查。

### 1.4 正确的发布序 + 上线前就能抓住过期常量的检查

正确顺序（v0.3.8 已按此修正：bump FIRST, then build）：

1. 改代码、跑测试（typecheck / vitest）；
2. **先 bump** `package.json` version（0.3.6 → 0.3.7）；
3. `pnpm run clean && pnpm run build`（clean 排除增量构建缓存假阳性 — migration-hygiene §1）；
4. **产物常量门禁**（本事故应新增的检查，能恰好在 push 前拦住）：
   - 从构建出的 `lib/client.js` 提取 `PLUGIN_VERSION = "x.y.z"`，**断言其等于 package.json 的 version**，不等即 fail；
   - 行为不变式：`newerTag(<本次发布 tag>) === undefined`（即"自己不能更新到自己"），在发货 bundle 上直接跑一次该函数断言；
5. commit（源码 + 新鲜产物）→ `git tag v0.3.7`；
6. push 三镜像 → 逐镜像 `git ls-remote --tags` 验证 SHA 一致（既有动作，保留）。

一句话：**bump-before-build + 发货 bundle 里的常量与 package.json 一致性断言**，二者任一在 push 前执行都能抓住 16:22 那个 0.3.6。

---

## 2. 客户端平面与主机平面的更新不对称（为什么 UI 新了、路由还 404）

### 2.1 两半代码各自在哪里、何时加载

| 半侧 | 文件 | 加载位置与时机 | 生效动作 |
|---|---|---|---|
| 客户端半侧 | `lib/client.js` | 由 host 发布给**浏览器**，页面加载/刷新时重新取回并在浏览器 JS 上下文执行 | 浏览器硬刷新（migration-hygiene §3）；注意 DSH-0.1.7-A2-04：新版本 host 会在**启动时缓存** client bundle，此时连 client 改动也要重启 |
| 主机半侧 | `lib/index.js` | **dsh host 进程**在启动/插件激活时 import，路由表（如 `/dsh-file-trace/asset`）在激活时注册，`CONTENT_TYPES` 等模块级常量被注册进 handler 闭包 | **必须重启 host** |

本事故里浏览器确实拿到了新 client 半侧（v0.3.8 的 SVG render toggle 可见可点），而 host 自"SVG 白名单改动之前"起就**没重启过**——运行中的 asset 路由 handler 仍闭包着**旧的** `CONTENT_TYPES`（没有 `svg` 键）→ `image/svg+xml` 查不到 → 404 "unsupported image type"。

### 2.2 三个探针如何把"滞留"钉在**运行中的 host 进程**上，而不是发布上

1. **PNG 200**：路由活着、handler 在跑、旧白名单本来就有 png → 排除"路由没注册 / 插件没激活 / 路径写错"；
2. **SVG 404 + "unsupported image type"**：这正是扩展名白名单拒绝的语义 → 说明 handler 手里的白名单没有 svg 键；
3. **磁盘 `lib/index.js` 明确含 `svg: 'image/svg+xml'`**（v0.3.8 tag 亦然）→ 排除"发布没带这个能力"：**代码在盘上是对的，进程里是旧的**。

三者合起来只剩一种自洽解释：路由由**早于白名单改动的那次启动**注册，进程内存里的闭包常量从未重读。这正是 pre-flight §1.5 的 ghost-host 形态与 DSH-0.1.2-A1-08 的教训：**问进程，不问磁盘**——磁盘会说谎（它已是新代码），只有探针的应答能分辨代际（本例的探针就是 GET asset 路由各一次 PNG/SVG）。DSH-0.1.5-A1-20 也印证：这类安装树/进程错配，**host 重启即自愈**。

### 2.3 什么才让主机平面改动生效；为什么"插件热更新"经验在此不成立

- **生效条件**：停掉并重新启动 dsh host（`lib/index.js` 只在启动/激活时被 import 一次；Node 模块缓存 + 路由表驻留进程内存，磁盘替换只影响"下一次启动"），然后**用探针复验**（对新白名单里的类型 GET 一次 asset 路由，期待 200 + 正确 content-type）。
- **"插件热更新"规则的适用边界**：热更新/HMR、bundle 重取描述的是**浏览器侧 client 产物**的更新语义；它从未覆盖 host 进程已经注册的 HTTP 路由与模块级常量。DSH-0.1.7-A2-04 甚至说明某些版本连 client bundle 都在 host 启动时缓存——所以经验法则应升级为：**client 半侧 = 刷新（必要时重启）；host 半侧 = 必定重启；一律以对运行进程的探针应答为准，而不是以磁盘内容为准**。
- **验收动作**：发布清单里对任何 `lib/index.js` 变更加一条"重启 host + 目标类型 asset 路由 200 探针"作为放行条件；本次 404 不是回归发布，而是**没重启**造成的假回归。

---

## 3. 坏图归因（spliced payload，而非 traced 文件）

### 3.1 三个事实定位损坏层

1. 磁盘源文件：**XML 良构**（System.Xml XmlDocument 加载无错），事后**重读同一区域干净**；
2. 会话日志中存储的 read-result 文本：**损坏**——载荷 232 行 = 源 232 行（到 `…stroke="#dde6ea" stro`）+ 源 247 行尾（从 `0 0,1 821,730"…` 起），源 233–247 行整体缺失；拼接点恰落在**共享前缀 `stro`**（`stroke-width…` vs 弧参数 `0 0,1…`）；
3. XML 解析器对载荷报错于 **233:54 `Specification mandates value for attribute stro0`**——`stro`+`0 0,1…` 拼出非法属性名，正是拼接痕迹的"指纹"。

**结论：损坏发生在会话载荷的 result-text 组装/持久化层——上游、插件之前**。证据链：磁盘完好（排除文件损坏）、重读干净（排除确定性工具 bug、说明非确定性）、插件拿到的 TYPE 结果在调用侧是干净的而落进 session log 的文本块坏了（排除渲染器凭空造错）。即：**是上游会话载荷文本损坏 bug**，插件只是忠实地把收到的坏文本拿去渲染。

### 3.2 为什么插件必须把会话载荷当作"不可信渲染输入"

会话日志是多个上游层拼装、持久化、再回放的转写文本：任何一层的缓冲/偏移 bug（本例）、截断、转义错误或事后人工编辑都会让载荷偏离源文件；而 SVG 是**可携带脚本、事件处理器、外部引用的活动内容**。把未经校验的载荷直接喂进图像/SVG 渲染，等于让上游文本 bug 直接变成用户可见的坏图，甚至变成代码执行面。因此渲染链必须"**先验证、后渲染，失败显式报错**"（见 §4），并把**磁盘字节**当作权威源。

### 3.3 为什么"编辑/修复" traced 文件是错误动作

- 磁盘文件是**唯一权威物证**且完好——"修"它会销毁对照组，之后再也无法证明"损坏不在文件里"；
- 拿一份**坏拷贝**去改**好原件**，方向反了：极可能把真正的损坏引入原本良构的文件；
- 在插件里加"修补启发式"或改文件，都是**粉饰上游 bug**：它会继续在别处复发且不再被看见；
- 会使 trace 失去可复现性，取证作废。

正确动作：文件保持原样、截取日志载荷做证据、按 §5 做帧级取证、**向上游上报文本损坏 bug**、把渲染器改得对坏载荷有弹性。

---

## 4. 防御式渲染链设计（SVG 预览的取源顺序）

**取源顺序 = 磁盘字节 → 校验过的会话载荷 → 沙箱 iframe 兜底 → 显式错误态**（每一级失败都流入下一级，绝不静默渲染半截文档）：

1. **磁盘字节 asset 路由优先**（`GET /dsh-file-trace/asset?path=…`，content-type 走白名单）
   - 理由：磁盘是权威源且已证良构，直接绕开会话载荷损坏面；附带校验返回 content-type（`image/svg+xml`）与长度/哈希。前置条件：host 已重启、路由白名单是新代际（§2 的探针先行）。
2. **会话载荷仅在 XML 良构校验通过后使用**（历史会话/文件已删时的回退）
   - 校验：`DOMParser.parseFromString(text, 'image/svg+xml')` 后检查 **`parsererror`**（各引擎位置不同，用 `querySelector('parsererror')` 兼容）；根元素必须是 `<svg>`；再做结构健全性检查（行号连续、大小在预期范围、可选：与磁盘字节做 SHA-256 对比）。
   - 理由：载荷不可信（§3）；`parsererror` 把"静默坏图"变成"可检出的故障"；DOMParser 不解析外部实体，校验本身无副作用。本事故的载荷会在 233:54 被此关卡截获。
3. **沙箱 iframe 作为最后渲染兜底**（校验通过但仍需渲染"活动 SVG"时）
   - 做法：`<iframe sandbox>` **不带** `allow-scripts`、不带 `allow-same-origin`（不透明源），或用 `<img src="blob:…">` 渲染（天然不执行脚本）；屏蔽 `<script>`、`on*` 事件属性、外部引用。
   - 理由：即便校验漏判，也没有任何 JS 能触达应用同源环境；**SMIL 动画（`<animate>`/`<animateTransform>`）是声明式呈现，在图片/沙箱渲染器里照常播放**——既保住合法动画 SVG 的保真度，又不开代码执行通道。
4. **显式错误态，而不是静默坏图**
   - 做法：校验/取数失败时展示错误卡："SVG 预览不可用——载荷未通过 XML 良构校验（233:54，疑似会话载荷损坏）"，并提供动作：**从磁盘重读**、查看原始载荷、打开源文件；绝不把半截文档塞进 `<img>` 让浏览器显示碎图图标。
   - 理由：碎图会掩盖"哪一层坏了"，并诱导错误修复（比如去改 traced 文件）；显式错误态既归因、又给用户恢复路径（回退磁盘）、还留下上报入口。

---

## 5. 取证方法 + 发布检查单增补

### 5.1 会话日志（concatenated-Zstandard 生成文件）的帧级取证

该会话的 generation 文件是**逐代追加的 Zstandard 串接流**（同族形态见卡片 DSH-0.2.0-RC2-A1-02 的 `session.v4.jsonl.zstd`；格式谱系：DSH-0.1.2-A1-01/A1-02 会话日志走廊、A1-05/A1-06 Session log v2 + 迁移目录、v0.1.7-alpha.1 的 Session log V4 + 批量迁移工具）。取证步骤：

1. **只读复制原件**，绝不改写原日志；
2. **逐帧解压**：zstd 允许串接帧，用流式解码器（如 `zstd -d`、`zstd.streaming_decompress`、Node 侧 zstd 绑定）一帧一帧地产出——**帧边界 = 代际边界**，每帧独立解码，即使尾帧撕裂也不影响前面帧；记录每帧字节偏移；
3. 每帧按 **JSONL** 解析，建立 seq/事件类型索引，定位目标 traced SVG 的 read-result 条目（本例载荷第 232 行附近），**原样保留字段文本 + 帧号 + 行号 + 字节偏移 + 哈希**——这就是"精确存储文本"的物证；
4. 与磁盘重读做 diff：得到拼接指纹（共享前缀 `stro` 处拼接、233–247 行缺失）；对两侧分别跑 XML 良构校验（XmlDocument / xmllint / DOMParser），记录解析器定位（载荷 233:54 `stro0`；源文件良构）；
5. 记录**非确定性**（事后重读干净）→ 归因为 result-text 组装/持久化层的上游 bug；将帧级解码结果 + 定位 + 解析结论打包**上报上游**，而不是在插件里打补丁遮掩。

### 5.2 本次事故新增的发布检查单条目

1. **version-bump-before-build**：发布第一步就 bump 版本号，然后 clean + build（本次反例：build 时 package.json 还是 0.3.6）；
2. **grep 发货 bundle 里的常量**：构建后断言 `lib/client.js` 内 `PLUGIN_VERSION` == package.json version，并跑"自己不能更新到自己"的行为不变式（§1.4）；
3. **逐镜像 tag SHA 验证**：push 后 `git ls-remote --tags` 对三镜像逐一核对 SHA（本次已做、必须保留；但明确认知：它验证分发完整性，**不能**抓构建期常量错误，与 1/2 互补而非替代）；
4. **上报上游文本损坏 bug，不在插件里粉饰**：带帧级解码证据开 issue；禁止在插件里加"改写 traced 数据"的修补逻辑；
5. **host 半侧改动的重启门禁**（§2 新增）：任何 `lib/index.js` 变更，重启 host + 对新能力发一次探针（asset 路由新类型 200）才算发布完成；
6. **发布后自检**：在刚发布的版本上打开插件抽屉，**更新徽标不得出现**——"宣布更新到自己"定性为发布阻断级回归。

---

## 报告结构（plugin-upgrade 技能要求）

- **pre-existing**：not collected（Mode A 只读取证，无基线构建/测试运行；本容器亦禁止执行安装/迁移）。
- **Completed**：三症状根因归因（§1 构建期常量 + bump-after-build；§2 host 进程代际滞留；§3 上游会话载荷拼接损坏）；防御式渲染链设计（§4）；帧级取证方法与检查单增补（§5）。证据 8 份全部读取，未改动。
- **Skipped**：未运行 plan-migration / verify-runtime / ghost-host-check 等脚本（本题为归因报告，无被迁移仓库与运行中的 host 进程，探针以 fixture 的 probe 记录为准）；未查阅与本题无关的走廊卡片全文。
- **Pending / residual risk**：上游 result-text 组装 bug 未定位到具体代码行（证据只到"组装/持久化层、非确定性、共享前缀拼接"）；SMIL 在目标浏览器沙箱渲染器中的行为应按目标引擎实测一次；DSH-0.1.7-A2-04 指出部分版本 client bundle 也随 host 启动缓存，实际生效面应以对运行进程的探针复核。
- **Rollback**：本次无写入（仅新增报告文件），fixture 逐字节未动，无需回滚；可删除 `agent-output/` 下的产物即恢复。
- **Recommendations**：把 §1.4 的产物常量门禁做成 CI 脚本（发布阻断）；渲染链的 DOMParser 校验给错误卡带上游上报链接；把"host 重启 + 探针"写进该插件的发布清单模板。

## run-stats

- toolcalls 总数：31（run_code 封装 12 次；内层 read 17 / glob 6 / grep 3 / write 4，另 send_message 1）
- token 用量：n/a（本会话不暴露计量）
- 完成时间：2026-10-21T07:46:48.437Z（UTC；本地 Asia/Shanghai 2026-10-21 下午）


#### FILE: report.md

# S19 · 幽灵自更新徽标 / 主机半侧滞留 / 损坏会话载荷 — 只读取证归因报告

- **对象**：client 插件 `@dsh-external/dsh-file-trace`，同一会话先后发布 v0.3.7（markdown 渲染修复）与 v0.3.8（SVG render-preview）
- **模式**：plugin-upgrade 技能 Mode A · inspect（只读取证与设计）。全程未执行迁移/安装/构建；`fixture/` 8 份证据逐字节未改动；仅在 `agent-output/` 写入报告。
- **引用卡片（只列 ID 与要点）**：DSH-0.1.2-A1-08（进程代际只能靠探针分辨）、DSH-0.1.5-A1-20（原地升级后 host 重启自愈服务组合错配）、DSH-0.1.7-A2-04（client bundle 在 host 启动时缓存、页面自动重连）、migration-hygiene §3（client 硬刷新生效 / host 半侧需重启）、pre-flight §1.5 ghost-host（问进程、不问磁盘）。

---

## 0. 证据要点速览

| 证据文件 | 钉死的事实 |
|---|---|
| release-log.md | v0.3.7 实际操作序：16:22 **build** → 16:23 **bump** 0.3.6→0.3.7 → 16:24 commit+tag（**包含已构建好的 lib/client.js**）→ 16:25 三镜像推送并验证 tag SHA |
| client-bundle-excerpt.js | 发货 bundle 内 `export const PLUGIN_VERSION = "0.3.6"`；tsdown **构建时**从 package.json 内联，运行时不重读 |
| git-tags.txt | origin/public/omdsh 三镜像均列 v0.3.7、v0.3.8，SHA 逐一同值（v0.3.7 = 748b5e5…） |
| asset-route-probe.txt | 浏览器**已**刷新（新 toggle 可见）、主机**未**重启：PNG → 200 `image/png`；SVG → 404 "unsupported image type" |
| lib-index-excerpt.js | 磁盘上的 `lib/index.js`（v0.3.8 tag）CONTENT_TYPES **含** `svg: 'image/svg+xml'` |
| session-log-excerpt.txt | 日志载荷第 232 行被拼接（源 232 前缀 `…stro` + 源 247 行尾 `0 0,1 821,730"…`），源 233–247 行整体缺失；磁盘源文件 XML 良构、重读干净；载荷 XML 解析在 233:54 报 `Specification mandates value for attribute stro0` |

---

## 1. 幽灵自更新的根因（"新版本 v0.3.7 可用" 出现在 v0.3.7 自己身上）

### 1.1 被比较的版本常量来自哪里：构建期，而非运行期

`lib/client.js` 里参与自更新比较的是 `PLUGIN_VERSION`，它是 **tsdown 在构建时从当时的 package.json 内联进 bundle 的常量**（证据原注释即写明 "inlined this constant from package.json WHEN THE BUNDLE WAS BUILT — it is not read dynamically at runtime"）。而比较的另一端是**运行期**实时取的镜像 tag 列表（`git ls-remote --tags`，取最高 `vX.Y.Z`）。

于是比较式 `compareSemver(latestTag, PLUGIN_VERSION)` 实际在比：

```
运行期查询到的 latest = v0.3.7   vs   构建期烙入的 PLUGIN_VERSION = 0.3.6
→ newerTag("v0.3.7") = "v0.3.7"  → 徽标 "新版本 v0.3.7 可用"
```

**"宣布更新到自己"的不是远端，而是自己肚子里过期的常量**：刚发布的 v0.3.7 与 latest tag v0.3.7 其实是同一个东西，但 bundle 以为自己还是 0.3.6。

### 1.2 真正的操作序错误：先构建、后改版本号（bump-after-build）

release-log 钉死了错误链：16:22 `pnpm run build` 时 package.json 仍是 0.3.6 → 内联常量 0.3.6；16:23 才 bump 到 0.3.7（只改了 package.json 与 README）；16:24 commit **原样提交了早已构建好的 bundle**。版本号的修改发生在构建之后，永远追不进已生成的产物——常量于是"固化在旧版本"。

### 1.3 为什么镜像/tag 完整性与本 bug 无关

git-tags.txt 显示三个镜像的 tag 齐全、SHA 逐一同值、发布者也逐一验证过；分发链完全干净。但完整性校验回答的是"**传输的东西是否被篡改/丢失**"，而本缺陷是"**产物本身在打包时就带错了常量**"。哪怕把同一份 bundle 从官方源原封不动取回，比较结果仍然错误——错误在构建产物内部的"构建期快照 vs 运行期查询"不对称，不在传输层。**镜像验证做对了，也挡不住这类回归**：它与"常量是否与本次版本一致"是两个正交的检查。

### 1.4 正确的发布序 + 上线前就能抓住过期常量的检查

正确顺序（v0.3.8 已按此修正：bump FIRST, then build）：

1. 改代码、跑测试（typecheck / vitest）；
2. **先 bump** `package.json` version（0.3.6 → 0.3.7）；
3. `pnpm run clean && pnpm run build`（clean 排除增量构建缓存假阳性 — migration-hygiene §1）；
4. **产物常量门禁**（本事故应新增的检查，能恰好在 push 前拦住）：
   - 从构建出的 `lib/client.js` 提取 `PLUGIN_VERSION = "x.y.z"`，**断言其等于 package.json 的 version**，不等即 fail；
   - 行为不变式：`newerTag(<本次发布 tag>) === undefined`（即"自己不能更新到自己"），在发货 bundle 上直接跑一次该函数断言；
5. commit（源码 + 新鲜产物）→ `git tag v0.3.7`；
6. push 三镜像 → 逐镜像 `git ls-remote --tags` 验证 SHA 一致（既有动作，保留）。

一句话：**bump-before-build + 发货 bundle 里的常量与 package.json 一致性断言**，二者任一在 push 前执行都能抓住 16:22 那个 0.3.6。

---

## 2. 客户端平面与主机平面的更新不对称（为什么 UI 新了、路由还 404）

### 2.1 两半代码各自在哪里、何时加载

| 半侧 | 文件 | 加载位置与时机 | 生效动作 |
|---|---|---|---|
| 客户端半侧 | `lib/client.js` | 由 host 发布给**浏览器**，页面加载/刷新时重新取回并在浏览器 JS 上下文执行 | 浏览器硬刷新（migration-hygiene §3）；注意 DSH-0.1.7-A2-04：新版本 host 会在**启动时缓存** client bundle，此时连 client 改动也要重启 |
| 主机半侧 | `lib/index.js` | **dsh host 进程**在启动/插件激活时 import，路由表（如 `/dsh-file-trace/asset`）在激活时注册，`CONTENT_TYPES` 等模块级常量被注册进 handler 闭包 | **必须重启 host** |

本事故里浏览器确实拿到了新 client 半侧（v0.3.8 的 SVG render toggle 可见可点），而 host 自"SVG 白名单改动之前"起就**没重启过**——运行中的 asset 路由 handler 仍闭包着**旧的** `CONTENT_TYPES`（没有 `svg` 键）→ `image/svg+xml` 查不到 → 404 "unsupported image type"。

### 2.2 三个探针如何把"滞留"钉在**运行中的 host 进程**上，而不是发布上

1. **PNG 200**：路由活着、handler 在跑、旧白名单本来就有 png → 排除"路由没注册 / 插件没激活 / 路径写错"；
2. **SVG 404 + "unsupported image type"**：这正是扩展名白名单拒绝的语义 → 说明 handler 手里的白名单没有 svg 键；
3. **磁盘 `lib/index.js` 明确含 `svg: 'image/svg+xml'`**（v0.3.8 tag 亦然）→ 排除"发布没带这个能力"：**代码在盘上是对的，进程里是旧的**。

三者合起来只剩一种自洽解释：路由由**早于白名单改动的那次启动**注册，进程内存里的闭包常量从未重读。这正是 pre-flight §1.5 的 ghost-host 形态与 DSH-0.1.2-A1-08 的教训：**问进程，不问磁盘**——磁盘会说谎（它已是新代码），只有探针的应答能分辨代际（本例的探针就是 GET asset 路由各一次 PNG/SVG）。DSH-0.1.5-A1-20 也印证：这类安装树/进程错配，**host 重启即自愈**。

### 2.3 什么才让主机平面改动生效；为什么"插件热更新"经验在此不成立

- **生效条件**：停掉并重新启动 dsh host（`lib/index.js` 只在启动/激活时被 import 一次；Node 模块缓存 + 路由表驻留进程内存，磁盘替换只影响"下一次启动"），然后**用探针复验**（对新白名单里的类型 GET 一次 asset 路由，期待 200 + 正确 content-type）。
- **"插件热更新"规则的适用边界**：热更新/HMR、bundle 重取描述的是**浏览器侧 client 产物**的更新语义；它从未覆盖 host 进程已经注册的 HTTP 路由与模块级常量。DSH-0.1.7-A2-04 甚至说明某些版本连 client bundle 都在 host 启动时缓存——所以经验法则应升级为：**client 半侧 = 刷新（必要时重启）；host 半侧 = 必定重启；一律以对运行进程的探针应答为准，而不是以磁盘内容为准**。
- **验收动作**：发布清单里对任何 `lib/index.js` 变更加一条"重启 host + 目标类型 asset 路由 200 探针"作为放行条件；本次 404 不是回归发布，而是**没重启**造成的假回归。

---

## 3. 坏图归因（spliced payload，而非 traced 文件）

### 3.1 三个事实定位损坏层

1. 磁盘源文件：**XML 良构**（System.Xml XmlDocument 加载无错），事后**重读同一区域干净**；
2. 会话日志中存储的 read-result 文本：**损坏**——载荷 232 行 = 源 232 行（到 `…stroke="#dde6ea" stro`）+ 源 247 行尾（从 `0 0,1 821,730"…` 起），源 233–247 行整体缺失；拼接点恰落在**共享前缀 `stro`**（`stroke-width…` vs 弧参数 `0 0,1…`）；
3. XML 解析器对载荷报错于 **233:54 `Specification mandates value for attribute stro0`**——`stro`+`0 0,1…` 拼出非法属性名，正是拼接痕迹的"指纹"。

**结论：损坏发生在会话载荷的 result-text 组装/持久化层——上游、插件之前**。证据链：磁盘完好（排除文件损坏）、重读干净（排除确定性工具 bug、说明非确定性）、插件拿到的 TYPE 结果在调用侧是干净的而落进 session log 的文本块坏了（排除渲染器凭空造错）。即：**是上游会话载荷文本损坏 bug**，插件只是忠实地把收到的坏文本拿去渲染。

### 3.2 为什么插件必须把会话载荷当作"不可信渲染输入"

会话日志是多个上游层拼装、持久化、再回放的转写文本：任何一层的缓冲/偏移 bug（本例）、截断、转义错误或事后人工编辑都会让载荷偏离源文件；而 SVG 是**可携带脚本、事件处理器、外部引用的活动内容**。把未经校验的载荷直接喂进图像/SVG 渲染，等于让上游文本 bug 直接变成用户可见的坏图，甚至变成代码执行面。因此渲染链必须"**先验证、后渲染，失败显式报错**"（见 §4），并把**磁盘字节**当作权威源。

### 3.3 为什么"编辑/修复" traced 文件是错误动作

- 磁盘文件是**唯一权威物证**且完好——"修"它会销毁对照组，之后再也无法证明"损坏不在文件里"；
- 拿一份**坏拷贝**去改**好原件**，方向反了：极可能把真正的损坏引入原本良构的文件；
- 在插件里加"修补启发式"或改文件，都是**粉饰上游 bug**：它会继续在别处复发且不再被看见；
- 会使 trace 失去可复现性，取证作废。

正确动作：文件保持原样、截取日志载荷做证据、按 §5 做帧级取证、**向上游上报文本损坏 bug**、把渲染器改得对坏载荷有弹性。

---

## 4. 防御式渲染链设计（SVG 预览的取源顺序）

**取源顺序 = 磁盘字节 → 校验过的会话载荷 → 沙箱 iframe 兜底 → 显式错误态**（每一级失败都流入下一级，绝不静默渲染半截文档）：

1. **磁盘字节 asset 路由优先**（`GET /dsh-file-trace/asset?path=…`，content-type 走白名单）
   - 理由：磁盘是权威源且已证良构，直接绕开会话载荷损坏面；附带校验返回 content-type（`image/svg+xml`）与长度/哈希。前置条件：host 已重启、路由白名单是新代际（§2 的探针先行）。
2. **会话载荷仅在 XML 良构校验通过后使用**（历史会话/文件已删时的回退）
   - 校验：`DOMParser.parseFromString(text, 'image/svg+xml')` 后检查 **`parsererror`**（各引擎位置不同，用 `querySelector('parsererror')` 兼容）；根元素必须是 `<svg>`；再做结构健全性检查（行号连续、大小在预期范围、可选：与磁盘字节做 SHA-256 对比）。
   - 理由：载荷不可信（§3）；`parsererror` 把"静默坏图"变成"可检出的故障"；DOMParser 不解析外部实体，校验本身无副作用。本事故的载荷会在 233:54 被此关卡截获。
3. **沙箱 iframe 作为最后渲染兜底**（校验通过但仍需渲染"活动 SVG"时）
   - 做法：`<iframe sandbox>` **不带** `allow-scripts`、不带 `allow-same-origin`（不透明源），或用 `<img src="blob:…">` 渲染（天然不执行脚本）；屏蔽 `<script>`、`on*` 事件属性、外部引用。
   - 理由：即便校验漏判，也没有任何 JS 能触达应用同源环境；**SMIL 动画（`<animate>`/`<animateTransform>`）是声明式呈现，在图片/沙箱渲染器里照常播放**——既保住合法动画 SVG 的保真度，又不开代码执行通道。
4. **显式错误态，而不是静默坏图**
   - 做法：校验/取数失败时展示错误卡："SVG 预览不可用——载荷未通过 XML 良构校验（233:54，疑似会话载荷损坏）"，并提供动作：**从磁盘重读**、查看原始载荷、打开源文件；绝不把半截文档塞进 `<img>` 让浏览器显示碎图图标。
   - 理由：碎图会掩盖"哪一层坏了"，并诱导错误修复（比如去改 traced 文件）；显式错误态既归因、又给用户恢复路径（回退磁盘）、还留下上报入口。

---

## 5. 取证方法 + 发布检查单增补

### 5.1 会话日志（concatenated-Zstandard 生成文件）的帧级取证

该会话的 generation 文件是**逐代追加的 Zstandard 串接流**（同族形态见卡片 DSH-0.2.0-RC2-A1-02 的 `session.v4.jsonl.zstd`；格式谱系：DSH-0.1.2-A1-01/A1-02 会话日志走廊、A1-05/A1-06 Session log v2 + 迁移目录、v0.1.7-alpha.1 的 Session log V4 + 批量迁移工具）。取证步骤：

1. **只读复制原件**，绝不改写原日志；
2. **逐帧解压**：zstd 允许串接帧，用流式解码器（如 `zstd -d`、`zstd.streaming_decompress`、Node 侧 zstd 绑定）一帧一帧地产出——**帧边界 = 代际边界**，每帧独立解码，即使尾帧撕裂也不影响前面帧；记录每帧字节偏移；
3. 每帧按 **JSONL** 解析，建立 seq/事件类型索引，定位目标 traced SVG 的 read-result 条目（本例载荷第 232 行附近），**原样保留字段文本 + 帧号 + 行号 + 字节偏移 + 哈希**——这就是"精确存储文本"的物证；
4. 与磁盘重读做 diff：得到拼接指纹（共享前缀 `stro` 处拼接、233–247 行缺失）；对两侧分别跑 XML 良构校验（XmlDocument / xmllint / DOMParser），记录解析器定位（载荷 233:54 `stro0`；源文件良构）；
5. 记录**非确定性**（事后重读干净）→ 归因为 result-text 组装/持久化层的上游 bug；将帧级解码结果 + 定位 + 解析结论打包**上报上游**，而不是在插件里打补丁遮掩。

### 5.2 本次事故新增的发布检查单条目

1. **version-bump-before-build**：发布第一步就 bump 版本号，然后 clean + build（本次反例：build 时 package.json 还是 0.3.6）；
2. **grep 发货 bundle 里的常量**：构建后断言 `lib/client.js` 内 `PLUGIN_VERSION` == package.json version，并跑"自己不能更新到自己"的行为不变式（§1.4）；
3. **逐镜像 tag SHA 验证**：push 后 `git ls-remote --tags` 对三镜像逐一核对 SHA（本次已做、必须保留；但明确认知：它验证分发完整性，**不能**抓构建期常量错误，与 1/2 互补而非替代）；
4. **上报上游文本损坏 bug，不在插件里粉饰**：带帧级解码证据开 issue；禁止在插件里加"改写 traced 数据"的修补逻辑；
5. **host 半侧改动的重启门禁**（§2 新增）：任何 `lib/index.js` 变更，重启 host + 对新能力发一次探针（asset 路由新类型 200）才算发布完成；
6. **发布后自检**：在刚发布的版本上打开插件抽屉，**更新徽标不得出现**——"宣布更新到自己"定性为发布阻断级回归。

---

## 报告结构（plugin-upgrade 技能要求）

- **pre-existing**：not collected（Mode A 只读取证，无基线构建/测试运行；本容器亦禁止执行安装/迁移）。
- **Completed**：三症状根因归因（§1 构建期常量 + bump-after-build；§2 host 进程代际滞留；§3 上游会话载荷拼接损坏）；防御式渲染链设计（§4）；帧级取证方法与检查单增补（§5）。证据 8 份全部读取，未改动。
- **Skipped**：未运行 plan-migration / verify-runtime / ghost-host-check 等脚本（本题为归因报告，无被迁移仓库与运行中的 host 进程，探针以 fixture 的 probe 记录为准）；未查阅与本题无关的走廊卡片全文。
- **Pending / residual risk**：上游 result-text 组装 bug 未定位到具体代码行（证据只到"组装/持久化层、非确定性、共享前缀拼接"）；SMIL 在目标浏览器沙箱渲染器中的行为应按目标引擎实测一次；DSH-0.1.7-A2-04 指出部分版本 client bundle 也随 host 启动缓存，实际生效面应以对运行进程的探针复核。
- **Rollback**：本次无写入（仅新增报告文件），fixture 逐字节未动，无需回滚；可删除 `agent-output/` 下的产物即恢复。
- **Recommendations**：把 §1.4 的产物常量门禁做成 CI 脚本（发布阻断）；渲染链的 DOMParser 校验给错误卡带上游上报链接；把"host 重启 + 探针"写进该插件的发布清单模板。

## run-stats

- toolcalls 总数：31（run_code 封装 12 次；内层 read 17 / glob 6 / grep 3 / write 4，另 send_message 1）
- token 用量：n/a（本会话不暴露计量）
- 完成时间：2026-10-21T07:46:48.437Z（UTC；本地 Asia/Shanghai 2026-10-21 下午）


#### FILE: tool-transcript.txt

1. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\SKILL.md（plugin-upgrade 技能全文）
2. glob pattern=**/* path=E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S19-phantom-update-stale-host（列出格目录全部文件）
3. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S19-phantom-update-stale-host\fixture\README.md
4. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S19-phantom-update-stale-host\fixture\asset-route-probe.txt
5. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S19-phantom-update-stale-host\fixture\client-bundle-excerpt.js
6. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S19-phantom-update-stale-host\fixture\git-tags.txt
7. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S19-phantom-update-stale-host\fixture\lib-index-excerpt.js
8. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S19-phantom-update-stale-host\fixture\package.json
9. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S19-phantom-update-stale-host\fixture\release-log.md
10. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S19-phantom-update-stale-host\fixture\session-log-excerpt.txt
11. glob pattern=**/* path=E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references（循环内第 1 次）
12. glob pattern=**/* path=E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references（循环内第 2 次）
13. glob pattern=**/* path=E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references（循环内第 3 次）
14. glob pattern=**/* path=E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references（循环内第 4 次）
15. grep pattern="zstd|concatenat" path=E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade
16. grep pattern="cached at host boot|boot-time|at host boot|host restart" path=E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade
17. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\migration-hygiene.md
18. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\v0.1.7-alpha.2.md offset=60 limit=60（DSH-0.1.7-A2-04 卡片）
19. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\v0.2.0-rc.2.md offset=85 limit=50（session.v4.jsonl.zstd 提及处）
20. glob pattern=**/* path=E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade（技能目录全清单）
21. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\host-plane-probes.md
22. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\pre-flight.md（含 §1.5 ghost-host）
23. grep pattern="session-format|session log|Session log|zstd|generation" path=E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\troubleshooting.md
24. write E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S19-phantom-update-stale-host\agent-output\S19-phantom-update-stale-host\report.md（主报告）
25. write E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S19-phantom-update-stale-host\agent-output\report.md（同内容副本）
26. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S19-phantom-update-stale-host\agent-output\S19-phantom-update-stale-host\report.md offset=1 limit=3（写后校验）
27. write E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S19-phantom-update-stale-host\agent-output\tool-transcript.txt（本文件）
28. write E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S19-phantom-update-stale-host\agent-output\transcript-manifest.txt
29. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S19-phantom-update-stale-host\agent-output\tool-transcript.txt（写后校验）
30. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S19-phantom-update-stale-host\agent-output\transcript-manifest.txt（写后校验）
31. send_message agent_id=session-5d3ebe0e-127d-4dc4-a3b9-cb2199b04f8e（向父代理汇报结果）


#### FILE: transcript-manifest.txt

R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S19-phantom-update-stale-host
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S19-phantom-update-stale-host\fixture\README.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S19-phantom-update-stale-host\fixture\asset-route-probe.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S19-phantom-update-stale-host\fixture\client-bundle-excerpt.js
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S19-phantom-update-stale-host\fixture\git-tags.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S19-phantom-update-stale-host\fixture\lib-index-excerpt.js
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S19-phantom-update-stale-host\fixture\package.json
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S19-phantom-update-stale-host\fixture\release-log.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S19-phantom-update-stale-host\fixture\session-log-excerpt.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\SKILL.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\migration-hygiene.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\v0.1.7-alpha.2.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\v0.2.0-rc.2.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\host-plane-probes.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\pre-flight.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\troubleshooting.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S19-phantom-update-stale-host\agent-output\S19-phantom-update-stale-host\report.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S19-phantom-update-stale-host\agent-output\report.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S19-phantom-update-stale-host\agent-output\S19-phantom-update-stale-host\report.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S19-phantom-update-stale-host\agent-output\tool-transcript.txt
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S19-phantom-update-stale-host\agent-output\transcript-manifest.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S19-phantom-update-stale-host\agent-output\tool-transcript.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S19-phantom-update-stale-host\agent-output\transcript-manifest.txt


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.