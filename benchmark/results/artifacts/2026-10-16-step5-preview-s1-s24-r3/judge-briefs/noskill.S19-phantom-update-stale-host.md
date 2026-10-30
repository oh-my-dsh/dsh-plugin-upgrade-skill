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
#### FILE: S19-phantom-update-stale-host/report.md

# S19 诊断报告 · The Phantom Update, the Stale Host Half, and the Corrupted Payload

证据包：`@dsh-external/dsh-file-trace` v0.3.7 / v0.3.8 发布会话（2026-09-05）。
本报告仅基于 fixture 内只读证据 + 本地只读复算，未修改 fixture 任何字节。

## 0. 结论速览

| # | 症状 | 根因一句话 |
|---|---|---|
| 1 | v0.3.7 刚发布就提示"新版本 v0.3.7 可用" | 版本常量 `PLUGIN_VERSION` 是**构建期内联**的；发布顺序是先 build 后 bump，出厂 bundle 烤进的是 0.3.6 |
| 2 | v0.3.8 客户端开关到了、宿主路由 SVG 仍 404 | 客户端半区浏览器**每次加载重拉**（热更新）；宿主路由在**宿主进程 boot 时一次性注册**，会话内未重启宿主 |
| 3 | 同一 SVG 渲染成坏图 | 损坏发生在**上游结果文本装配层**（session payload 被静默损坏），磁盘源文件良构、重读干净；插件把 payload 当可信输入直接渲染 |

## 1. 幻影自更新（Phantom self-update）根因

**要点结论：比较基准 `PLUGIN_VERSION` 来自构建期（打包时从 package.json 内联），不是运行时读取；操作顺序错误是"先 build、后 bump"；镜像/tag 完整性无关——它恰恰证明发布传播正确。**

### 1.1 被比较的版本常量来自哪里：构建期，不是运行时

`client-bundle-excerpt.js`（v0.3.7 tag 实际下发给浏览器的 `lib/client.js` 原文）里写着：

- `export const PLUGIN_VERSION = "0.3.6";` —— 注释明示 "tsdown inlined this constant from package.json WHEN THE BUNDLE WAS BUILT — it is not read dynamically at runtime"。
- 自更新判定：`newerTag(latestTag) = compareSemver(latestTag, PLUGIN_VERSION) > 0`；`git-tags.txt` 注释说明检查方式是 `git ls-remote --tags` 拉全部镜像 tag、取最高 vX.Y.Z。
- 本次实测复算：baked = `0.3.6`，latestTag = `v0.3.7`，`compareSemver("v0.3.7","0.3.6") = 1 > 0` → badge 为 true，即刚发布的 v0.3.7 上显示"新版本 v0.3.7 可用"。

也就是说：**出厂 bundle 里烤着 0.3.6**，而镜像上最新 tag 是 v0.3.7，于是"比自己新"——插件在向自己发布更新公告。

### 1.2 实际的操作顺序错误（release-log.md）

| 时间 | 动作 | 影响 |
|---|---|---|
| 16:20 | 改 `src/client/markdown.tsx` + 回归测试 | — |
| 16:21 | typecheck / vitest 104 passed | — |
| **16:22** | **`pnpm run build`（client bundle 在此产出）** | 此刻 package.json 仍是 **0.3.6**，tsdown 内联 `PLUGIN_VERSION = "0.3.6"` |
| **16:23** | **bump `package.json` 0.3.6 → 0.3.7** | 只改了 manifest 磁盘值，**没有重新构建**，bundle 常量未刷新 |
| 16:24 | commit（含已构建的 `lib/client.js`）+ `git tag v0.3.7` | tag 指向"manifest=0.3.7、bundle 内=0.3.6"的错位提交 |
| 16:25 | 推 `main`+tag 到 origin/public/omdsh，逐镜像核对 tag SHA | 三镜像 SHA 一致（`748b5e5…`），忠实复制了错位产物 |

错误本质：**bump 落在 build 之后**，且 bump 后没有重建。打包器在 16:22 那一刻快照了版本号，之后对 manifest 的一切修改对已产出 bundle 无效。

### 1.3 为什么镜像/tag 完整性在这里无关

- 自更新检查**只做版本字符串比较**（`compareSemver(latestTag, PLUGIN_VERSION)`），从不校验内容完整性；它拉镜像 tag 只是为了知道"最新版本号是多少"。
- `git-tags.txt` 显示三个镜像都同时列出 v0.3.7 与 v0.3.8、SHA 完全一致（`748b5e5…` / `d887deb…`）——这恰恰**证明发布传播是正确的**：所有镜像拿到的都是同一份（带着 0.3.6 常量的）产物。
- 完整性校验能发现的是"镜像之间内容不一致"，**不可能发现"内容本身内联了旧版本"**。病灶在本地构建产物，不在传输/镜像层。所以"每个镜像的 tag SHA 都验过了"这个事实对本 bug 的定位毫无帮助，反而是一层干扰项。

### 1.4 纠正后的发布顺序 + 推送前能抓到陈旧常量的检查

正确顺序（把"构建时刻"当作版本语义生效的时刻）：

1. 改代码 → 2. typecheck + 单测 → 3. **bump `package.json` 版本** → 4. **build（bundle 此刻内联新版本）** → 5. **校验出厂产物常量**（见下） → 6. commit（含构建产物） → 7. tag → 8. 推三镜像 → 9. 逐镜像 `git ls-remote --tags` 核对 SHA 一致。

推送前的检查（pre-tag gate，任一步失败即中止发布）：

```bash
# 检查 1：grep 出厂 bundle 里烘焙的常量
grep -n 'PLUGIN_VERSION = "' lib/client.js     # 必须显示 "0.3.7"

# 检查 2：与 package.json 断言一致（等价门禁）
node -e 'const v=require("./package.json").version;
const s=require("fs").readFileSync("lib/client.js","utf8");
if (s.indexOf(v) < 0) throw new Error("stale PLUGIN_VERSION in shipped bundle");'
```

其中"grep 出厂 bundle 里的烘焙常量"正是本次事故新增清单项（见第 5 节）：bump 与 build 的顺序错误只能靠**检查产物本身**发现，因为构建期内联对运行时完全不可见。

## 2. 客户端 / 宿主双平面更新不对称

**要点结论：客户端半区是浏览器每次 reload 重拉（热更新），宿主半区 asset 路由（含白名单闭包）在宿主进程 boot 时一次性注册进内存；PNG 200 / SVG 404 / 磁盘 lib 含 svg 三件套把陈旧性锁定在 RUNNING host process。**

### 2.1 两半代码分别在哪里加载、何时加载

- **客户端半区（`lib/client.js`）**：由**浏览器在每次页面加载 / reload 时重新拉取**。v0.3.8 推送后刷新页面，浏览器拿到新 bundle，于是新的 SVG render toggle 立刻可见可点（`release-log.md` 明示 "the client half was confirmed refreshed: the new toggle button was rendered by the browser"）。客户端插件的"热更新"规则（文件换了，下次拉取就是新的）在这里**成立**。
- **宿主半区（`lib/index.js` 的 asset 路由）**：在**宿主进程 boot 时一次性注册**进进程内存——路由表、`CONTENT_TYPES` 白名单闭包都在进程启动那一刻物化。`release-log.md` 明示 "a host restart had NOT been performed in this session"。运行中的宿主进程持有的仍是旧白名单，磁盘上换成 v0.3.8 的 `lib/index.js` **不会热替换已注册的路由**。

### 2.2 探针结果如何把陈旧性锁定在"运行中的宿主进程"

`asset-route-probe.txt`（浏览器已确认刷新、宿主未重启之后执行）：

1. **PNG 200 `image/png`** → 路由本身存活、处理器在跑。若是路由缺失、安装未生效或包没推对，PNG 也会失败——路由层没问题。
2. **SVG 404 "unsupported image type"** → 404 的**报错文案来自路由内部的扩展名白名单分支**（一条代码路径），不是文件不存在、不是"路由不存在"式 404。路由活着，但白名单里没有 svg。
3. **磁盘 `lib/index.js`（v0.3.8 原文）确实含 `svg: 'image/svg+xml'`**（`lib-index-excerpt.js`，已实测确认字符串存在）→ 发布产物在磁盘上是正确的。

三者合并只有一种解释：**磁盘有新代码、运行进程无** → 陈旧性锁定在 RUNNING host process。若病因在发布侧，磁盘文件也不会含 svg；若病因在文件/路径侧，PNG 会一起失败；若病因在路由注册缺失，错误不会是白名单文案。

### 2.3 什么让宿主侧变更生效，以及为什么"插件热更新"规则在此不成立

- 唯一有效手段：**重启宿主进程**——重跑宿主加载钩子、重新读取 `lib/index.js`、重建 `CONTENT_TYPES`、重新注册路由。替换文件系统里的文件对已物化进内存的路由零影响。
- "插件热更新"规则的语义来源：客户端包被浏览器按需拉取，"下一次拉取即新版本"天然成立。而宿主半区是**启动期一次性物化**——它的"版本"就是进程启动那一刻的快照（路由表 + 白名单闭包）。这是唯一一类"改了文件也不生效、必须重启进程"的场景：路由注册是进程级资源，不是可热替换的字节流。

## 3. 破损图片归因（Broken-image attribution）

**要点结论：源文件良构、payload 文本被拼接损坏、重读干净——损坏发生在"模型可见结果块"的文本装配层（上游），不在磁盘、不在插件；session payload 必须当不可信渲染输入；编辑/修复被追踪文件是错误动作。**

### 3.1 损坏发生在哪一层

`session-log-excerpt.txt` 三组证据（本次已逐字符复算）：

- **源文件（磁盘）**：良构（System.Xml XmlDocument load 无错）。
- **session log 中存储的 payload**：第 232 行 = 源文件第 232 行前缀（到 `…stroke="#dde6ea" stro`，实测共享前缀 52 字符）+ 源文件第 **247** 行尾部（`0 0,1 821,730" fill="none" stroke="#ffffff" stroke-width="3" opacity=".7" stroke-linecap="round"/>`）；源文件 233–247 行的头部全部缺失。实测：payload 尾部正是 src247 偏移 35 处起的弧线旗标区切片；src232 在共享前缀之后本应还有 `ke-width="6.5"/>`，也丢了。
- **良构 verdict**：源文件 well-formed；payload NOT well-formed —— "error on line 233 at column 54: Specification mandates value for attribute stro0"（`stro0,1 …` 把 `stroke-width` 和弧线旗标 `0 0,1` 焊在一起，属性值非法）。

损坏形态学：两块文本（232 行块、247 行尾块）在公共子串 **"stro"**（232 行的 `stroke-width…` 与 247 行的 `stroke="#ffffff"`）上重叠，装配器做了重叠折叠/去重合并，把两共享前缀之间的整段（源 232 尾部到 247 头部）吞掉——典型的分块结果文本拼接 bug。

**损坏层定位**：fixture 明示"交付给调用方的 read 工具 TYPE 结果是干净的；被持久化进 session log 的是模型可见结果块（result-text assembly），upstream of the plugin"。即：插件从 session payload 拿到的**已经是坏文本**。重读同区间干净（非确定性）→ 排除磁盘/文件系统问题；插件不生成该文本 → 排除插件 bug；指向上游装配路径的竞态/缓冲区复用。

### 3.2 为什么插件必须把 session payload 当不可信渲染输入

该载荷已被实证可被**上游静默损坏**：非确定性、无报错、重读即好。把它直接喂给渲染器 = 静默坏图（本次症状）。渲染前必须校验（见第 4 节 DOMParser 良构闸），并在校验失败时显式报错而非渲染。

### 3.3 为什么编辑/"修复"被追踪文件是错误动作

- 磁盘源文件本来就良构——没有可修的东西；
- 重读已干净（非确定性损坏）→ 改了也治不了病根，病根在传输层；
- 修复会**销毁证据链**：第 5 节的取证正依赖"原始 payload vs 源文件"的逐行 diff 与双良构 verdict 来把 anecdote 变成 evidence；
- 更重要的是会**掩盖上游 bug**——在插件里把坏文本"补全"成能渲染的样子，等于替上游的错误结果打补丁，真实缺陷永远得不到上报和修复。

## 4. 防御性渲染链设计

**要点结论：磁盘字节 asset 路由优先 → session payload 仅在 XML 良构校验（DOMParser/`parsererror`）通过后使用 → 沙箱 iframe（禁脚本、SMIL 仍可运行）作为最后渲染兜底 → 任何失败落显式错误态，杜绝静默坏图。**

### 4.1 渲染源顺序（四级链）

```text
renderSVG(fileId):
  # L1 磁盘字节（权威源）
  bytes = assetRoute(fileId)                     # host 资产路由，字节级直读磁盘
  if bytes.ok:  return renderFromBytes(bytes)
  # L2 session payload（仅经良构校验）
  text  = sessionPayload(fileId)
  if xmlWellFormed(text):                        # DOMParser + parsererror 检查
      return renderFromMarkup(text)
  # L3 沙箱 iframe（最后渲染兜底）
  return renderInSandboxedIframe(markup)
  # L4 任何一级失败 → 显式错误态（绝不 silent broken image）
```

### 4.2 各级理由

- **L1 磁盘字节 asset 路由优先**：字节级权威、无文本序列化往返，天然绕开一切文本层损坏（本次损坏只发生在文本通道：PNG 200 证明路由字节通路工作）。只要路由能出字节，就不该退到文本源。
- **L2 session payload 仅在 XML 良构校验后使用**：当路由不可用（404/白名单拒绝/权限）时 payload 是唯一备用源；但它已被证明可被上游静默损坏——渲染前必须过良构闸（`DOMParser`：`getElementsByTagName("parsererror").length === 0`，且能解析出根元素）。不通过 → 不进渲染，直接走 L3/L4，**禁止静默 fallthrough 成坏图**。
- **L3 沙箱 iframe 作为最后渲染兜底**：若必须渲染来源不完全可信的 SVG 标记，把它关进 `<iframe sandbox>`（不授予 `allow-scripts`）——脚本被封锁（防 payload 中夹带脚本型 XSS），而 SMIL 是 SVG 声明式动画、不依赖脚本，仍可运行（预览动效不打折）；同时把不可信标记隔离在 iframe 文档内，不污染宿主 DOM。兜底 = 隔离，不是信任。
- **L4 显式错误态**：任一层失败都渲染明确错误（哪层失败、为什么：路由 404 / payload 非良构 / iframe 兜底失败），让故障可观测、可上报，正好衔接第 5 节的上游 bug 报告。静默坏图是把诊断信息扔掉的默认行为，必须消灭。

取舍总结：L1 最权威但依赖路由可用；L2 依赖不可信源，故加校验闸；L3 是隔离而非信任；L4 保证失败可见。四级合起来 = "字节优先、文本受检、渲染隔离、失败显式"。

## 5. 取证方法 + 预防清单

**要点结论：session log 是连缀 Zstandard 生成文件，逐帧解码可精确恢复存储文本；发布清单新增四项：version-bump-before-build、grep 出厂 bundle 烘焙常量、per-mirror tag SHA 验证、上报上游文本损坏 bug 而非在插件里糊。**

### 5.1 session log 的逐帧解码取证方法

session log 是**连缀 Zstandard 生成文件**：每个 generation（一次模型回复/工具结果追加）写成一帧 zstd，帧与帧直接连缀成单文件。逐帧解码并恢复精确存储文本：

```bash
# 方法 A（CLI，最简）：zstd CLI 默认透明解码全部连缀帧
zstd -d -c session.log.zst > decoded.jsonl

# 方法 B（Python）：跨帧流式读
import zstandard as zstd
with open("session.log.zst","rb") as fh:
    reader = zstd.ZstdDecompressor().stream_reader(fh, read_across_frames=True)
    data = reader.read()
# 或手动按帧切：decompressobj() 解完一帧后，对剩余字节新建 decompressor，循环至消费完

# 方法 C（Node ≥ 22.15）：zlib.zstdDecompress（单帧；连缀需自行按帧切分，或直接调 zstd CLI）
```

恢复"精确存储文本"的步骤（本次 S19-3 即按此执行，`session-log-excerpt.txt` 是产物）：

1. 逐帧解码出 generation 记录流（每帧一条/一段）；
2. 按 tool_use id / 文件路径定位包含该 SVG read 结果的 generation；
3. **原样提取结果文本字段**（字节级、不做任何规整——拼接点证据全在字节里）；
4. 与磁盘源文件同区间**逐行 diff**，定位拼接点：本例实测共享前缀 `…stroke="#dde6ea" stro`（52 字符）、payload 尾部 = src247 偏移 35 起的弧线旗标切片、源 233–247 行头缺失；
5. 对两侧文本各做 XML 良构校验，固化双 verdict（源 well-formed；payload "error on line 233 at column 54: Specification mandates value for attribute stro0"）。

这一步把"一次坏图轶事"变成可复现、可上报的证据链：损坏层（上游文本装配）、损坏形态（重叠前缀折叠）、非确定性（重读干净）。

### 5.2 本次事故新增的发布清单项

1. **version-bump-before-build**：bump 必须先于 build（或构建改为读取 post-bump manifest）。顺序即语义——打包器在构建时刻快照版本，bump 后不重建则产物永远旧。
2. **grep 出厂 bundle 里的烘焙常量**：build 后、tag 前断言 `PLUGIN_VERSION == package.json.version`，作为 pre-push gate（命令见 1.4）。这类错误运行时不可见，只能查产物。
3. **per-mirror tag SHA 验证**：`git ls-remote --tags` 逐镜像核对 SHA 一致（本例三镜像 `748b5e5…` 一致，做得对，保留）——但要清楚它**抓不到内联陈旧常量**这类问题，与第 2 项互补而非替代。
4. **上报上游文本损坏 bug，不在插件里糊**：把逐帧解码结果、拼接点 diff、双良构 verdict、复现步骤（非确定性、重读干净）整理成 issue 提给上游；插件侧只做防御性校验（第 4 节），根因修复归上游。

---

*取证与复算说明：本报告全部结论来自 fixture 只读证据；semver 比较、52 字符共享前缀定位、白名单字符串存在性、PNG 200/SVG 404 文案均在本机以只读脚本复算确认；fixture 目录零修改。*


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.