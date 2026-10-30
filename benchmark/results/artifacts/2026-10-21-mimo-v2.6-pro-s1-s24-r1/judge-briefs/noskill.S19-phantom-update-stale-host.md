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

# S19 · 幻影自更新、宿主半程陈旧与损坏载荷 —— 根因、归因与防御链报告

- 任务格: `S19-phantom-update-stale-host`（noskill 臂）
- 证据包: `fixture\`（只读，全程逐字节未改动；报告只摘要点与关键行，不全文转贴）
- 报告文件: `agent-output\S19-phantom-update-stale-host\report.md`（副本：`agent-output\report.md`）
- 插件: `@dsh-external/dsh-file-trace`（客户端插件，v0.3.7 / v0.3.8，2026-09-05 发布会话）

## TL;DR（三个症状、三个层、三个结论）

| 症状 | 真正的层 | 一句话根因 |
|---|---|---|
| v0.3.7 自报"新版本 v0.3.7 可用" | 产物内容（构建期烘焙常量） | `PLUGIN_VERSION` 在 build 时被 tsdown 内联为 `0.3.6`，而 bump 发生在 build 之后；常量陈旧，tag 新 → 自指更新 |
| v0.3.8 的 SVG Render：PNG 200 / SVG 404，磁盘 lib 却白名单 svg | 运行中的 host 进程（boot 期路由注册） | 客户端半程随浏览器刷新生效，宿主半程路由表只在 host 启动时注册；未重启 → 内存里仍是旧白名单 |
| traced SVG 渲染成坏图 | 会话载荷装配/持久化层（插件上游） | session log 里的 read-result 文本在共享前缀处行拼接 + 丢行；磁盘源文件良好、重读干净 → 载荷不可信，文件不是嫌疑人 |

---

## 0. 证据清单（要点 + 文件 ID，不全文）

| ID（fixture 文件） | 关键要点 |
|---|---|
| `release-log.md` | v0.3.7 实际操作顺序：16:22 **build** → 16:23 **bump 0.3.6→0.3.7** → 16:24 commit(含已构建 lib/client.js)+tag → 16:25 三镜像推送；v0.3.8 同会话发布 SVG 预览，**host 未重启** |
| `package.json` | 清单版本已是 0.3.8 |
| `git-tags.txt` | 三镜像（origin/public/omdsh）tag SHA 逐一相同（v0.3.7=748b5e5…，v0.3.8=d887deb…）；自检用 `git ls-remote --tags`（无鉴权）取最高 vX.Y.Z |
| `client-bundle-excerpt.js` | 出货 `lib/client.js` 内 `export const PLUGIN_VERSION = "0.3.6"`；注释注明 tsdown 在**构建时**内联，运行时不读 package.json |
| `asset-route-probe.txt` | 浏览器已刷新（新 toggle 可见）后：PNG probe **200 image/png**，SVG probe **404 "unsupported image type"**；host 未重启 |
| `lib-index-excerpt.js` | 磁盘 `lib/index.js` 的 `CONTENT_TYPES` **含** `svg: 'image/svg+xml'` |
| `session-log-excerpt.txt` | 会话载荷 232 行拼接损坏（233–247 丢失）；源文件 XmlDocument 判定良好；载荷判定 NOT well-formed（line 233 col 54）；重读干净（非确定性） |

---

## 1. 幻影自更新：根因与修复

### 1.1 被比较的版本常量来自**构建期**，不是运行期

- 出货 bundle（`client-bundle-excerpt.js`）里就是 `export const PLUGIN_VERSION = "0.3.6"` —— **0.3.6**，而 tag 打的是 **v0.3.7**。文件注释写明：tsdown 在 bundle 构建时从 package.json 内联该常量，**不是运行时动态读取**。
- 自检逻辑（bundle 内 `newerTag`）：`compareSemver(latestTag, PLUGIN_VERSION) > 0` 才显示徽标；`latestTag` 来自镜像 `git ls-remote --tags` 取最高 vX.Y.Z。
- 代入现场值：`newerTag("v0.3.7")` 与 `PLUGIN_VERSION="0.3.6"` 比较 → 0.3.7 > 0.3.6 → 返回 v0.3.7 → 徽标 **"新版本 v0.3.7 可用"** 显示在刚发布的 v0.3.7 自己身上。这是**自指**：比较的两端本应同一版本，但左端（常量）是旧构建的化石，右端（tag）是新发布。

### 1.2 实际的顺序错误：bump 发生在 build 之后

`release-log.md` 的时间线（要点）：16:22 `pnpm run build`（此时 package.json 还是 **0.3.6**，tsdown 即按 0.3.6 烘焙常量）→ 16:23 才 bump 到 0.3.7 → 16:24 commit（连同**已构建**的 `lib/client.js`）+ tag → 16:25 推送三镜像。

- bump 位于 build 之后，**不会追溯改写已烘焙进产物的常量**；于是 commit 的内容自相矛盾：清单/README 写 0.3.7，产物内部常量是 0.3.6。
- 这不是"版本号写错"，而是**产物与清单脱钩**：常量的真值时刻是 build 时刻，而维护者把它当成了 tag/commit 时刻的值。

### 1.3 为什么镜像/tag 完整性在这里无关紧要

- `git-tags.txt` 证明三个镜像的 tag SHA **完全一致**（v0.3.7=748b5e5…，v0.3.8=d887deb…）——传输与推送完整性无懈可击。
- 但 SHA 校验回答的是"**到达的字节 == 推送的字节**"，不回答"**推送的字节是不是按正确版本构建的**"。本缺陷在产物**内容**（烘焙常量）内部：完整性验证只是证明同一份错误被忠实地复制了三遍。integrity ≠ correctness；镜像侧做得再对，也治不了构建期就写错的常量。

### 1.4 修正后的发布顺序 + 能拦下本次事故的事前检查

**正确顺序**（v0.3.8 已按此执行，release-log 记载"bump FIRST, then build"）：

1. 改代码 + 回归测试；
2. **先 bump `package.json` 版本**（0.3.6 → 0.3.7）；
3. typecheck / vitest；
4. **再 build**（tsdown 此时内联的就是新版本）；
5. **出货物断言**（见下）；
6. commit（含构建产物）+ tag；
7. 推送三镜像 + `git ls-remote --tags` 逐镜像核对 SHA。

**事前检查（任何一条都能在 push 前拦住本次事故）**：

- **grep 出货 bundle 的烘焙常量**：`grep -n 'PLUGIN_VERSION' lib/client.js`（或 `node -e` 动态 import 读取导出常量），断言其值 **=== `package.json.version`**，并断言旧版本字符串不再出现于 bundle；
- **自检冒烟**：对将发布的 tag 运行 bundle 内 `newerTag(latestMirrorTag)`，断言返回 `undefined` —— 插件不得向自己报更新。

v0.3.7 的补救（release-log 已记载）：amend + **重新构建** + 三镜像 force-move tag；教训固化为"先 bump 后 build"。

---

## 2. 客户端 vs 宿主：平面更新不对称

### 2.1 两半代码各自在哪里、何时被加载

| 平面 | 代码 | 加载时机 | 何时"生效" |
|---|---|---|---|
| 客户端 | `lib/client.js`（浏览器端 bundle） | 浏览器页面加载 / re-fetch / reload 时取用 | 磁盘 bundle 更新后**刷新页面即生效** → v0.3.8 的 SVG render toggle 出现在浏览器 = 客户端半程确实已刷新 |
| 宿主 | `lib/index.js`（host 进程内路由） | host (Node) 进程 **boot/import 时刻**：模块顶层代码执行一次，把路由与 `CONTENT_TYPES` 白名单注册进**正在运行**的服务器 | **重启 host 进程**（或显式热重载重新注册路由）才生效 |

- 本会话事实（`release-log.md` / `asset-route-probe.txt`）：**host 从未重启**；浏览器端确认新 toggle 可见可点。
- 因此运行中进程持有的是**旧** `CONTENT_TYPES`（无 svg 项）：GET asset?…svg → 404 "unsupported image type"；GET asset?…png → 200 image/png（旧白名单一直有 png）。

### 2.2 探针如何把"陈旧"钉在 **运行中的 host 进程** 而不是发布物

三点交叉定位（`asset-route-probe.txt` + `lib-index-excerpt.js`）：

1. **PNG 200** → 路由存在、handler 活着（排除"路由缺失/挂错/进程没起来"）；
2. **SVG 404 "unsupported image type"** → 拒绝来自**扩展名白名单**分支的错误文案（不是 IO/权限错误）；
3. **磁盘 `lib/index.js` 含 `svg: 'image/svg+xml'`** → 发布物/磁盘代码是新的。

⇒ **磁盘代码新、运行代码旧** = 陈旧位于已加载进内存的 host 进程。反证也成立：若 release 本身陈旧，磁盘 lib 里不会有 svg 项；若路由坏了，PNG 探针也会失败。404 与 200 的差分恰好是"白名单版本"的指纹。

### 2.3 为什么"插件热更新"这条经验在这里失效

- 热更新 / HMR 的语义覆盖的是**客户端 bundle**：浏览器重新取件、重新加载，换掉的只是渲染端代码；
- 宿主半程是**常驻服务进程**：route 注册是 import 时的一次性副作用。Node 不会因为磁盘上换了 `lib/index.js` 就重新执行已加载模块的顶层代码；没有显式 `--watch` / 模块失效 + 路由重注册机制时，**换文件 ≠ 换行为**；
- 所以宿主平面变更生效的常规手段**只有重启**（或等效显式热重载）。这正是"插件热更新"经验的边界：它只描述客户端平面，宿主平面遵循"进程生命周期"规则；
- 发布纪律：宿主平面改动必须在 release note 标注 **"host restart required"**，并以**能力探针**验证生效（对新扩展名发一次 GET/HEAD 断言 200 + 正确 content-type），而不是以 UI toggle 出现为准。**UI 可见 ≠ 两平面都生效**；本例的"客户端新、宿主旧"混合态正是这种误判的产物。

---

## 3. 坏图归因：损坏在会话载荷，不在被追踪文件

### 3.1 证据链（`session-log-excerpt.txt` 要点）

1. **磁盘源文件**（单独读取）：良好 XML —— System.Xml XmlDocument load 无错误；
2. **会话日志里存储的 read-result 文本**（payload 约 232 行）：232 行 = 源 232 行（到 `...stroke="#dde6ea" stro`）+ 源 247 行尾（`0 0,1 821,730"` 起的弧标志与 path 尾部），**源 233–247 行整体缺失**；XML 判定 NOT well-formed（line 233 col 54：*Specification mandates value for attribute stro0*）；
3. **交付给调用方的 TYPE 结果是干净的**；事后**重读同一区域干净**（非确定性）。

⇒ 损坏发生在**结果文本装配 / 持久化层**：即"模型可见 result block 被写入 session log"的那一步，在插件**上游**。插件只是如实渲染了会话载荷带来的那段文本；被追踪的 SVG 文件不是嫌疑人。

### 3.2 插件为什么必须把会话载荷当作**不可信渲染输入**

- **载荷 ≠ 磁盘真相**：本例就是二者分叉的实证。载荷经装配、传输、持久化多环，任一环都可能带入损坏（本例形态：共享前缀处的行拼接 + 丢行，拼接点恰落在 `stro`/`0 0,1` 的共享前缀上）；
- 渲染器若把载荷当真相，损坏就会被可视化成"文件坏了"的假象，**归因被误导**（用户、维护者都会去怀疑源文件）；
- 因此：渲染前必须验证（至少 XML well-formedness，见第 4 节）；验证不过 → 显式错误态，绝不渲染。

### 3.3 为什么"编辑 / 修复"被追踪文件是错误动作

1. **磁盘文件本来就是好的**——没有东西可修；"修"等于拿损坏副本去改写完好源文件，**制造真实损坏**；
2. **掩盖上游 bug**（papering over）：证据被销毁，结果文本装配层的缺陷会继续影响其他文件；
3. 会造成文件与其追踪记录进一步分叉，甚至破坏用户内容；
4. 正确动作：归因到载荷层 → 重读/再验证确认非确定性 → **上报上游文本损坏 bug**，插件侧只做防御性校验（清单见 §5.2）。

---

## 4. 防御性渲染链（SVG 预览）设计

**渲染源优先级（严格顺序，禁止跳跃）：**

**L0 · 磁盘字节（资产路由优先）**
先经 host asset route（白名单 `svg: 'image/svg+xml'`）取**磁盘 bytes** 渲染。
*理由*：磁盘是已被证明完好的真相源（XmlDocument 判定良好）；从磁盘取字节**绕开载荷损坏整条路径**，且资产路由给出受控 content-type，不经会话层污染面。

**L1 · 会话载荷（仅当磁盘不可得，且必须过校验）**
`DOMParser.parseFromString(text, 'image/svg+xml')`，检查 `doc.getElementsByTagName('parsererror').length === 0`（或 `querySelector('parsererror')` 为 null）；**不通过即拒绝**，不进入渲染。
*理由*：本例损坏恰是"非良构拼接"，一次 parse 校验即可拦下整类损坏；绝不大意地认为"载荷就是文件内容"。

**L2 · 沙箱 iframe 兜底渲染（脚本阻断，SMIL 保留）**
即便 XML 良构，SVG 仍可能携带 `<script>`、`onload=` 等事件属性、外部引用（`<image href>`/`<use href>`）、`javascript:` URL。用 `<iframe sandbox>`（**不加** `allow-scripts`）以 srcdoc/src 承载，或用 `<img src>` 方式渲染（浏览器对 img 中的 SVG 不执行脚本）。
*理由*：沙箱去掉的是**可执行性**，不是视觉/动画表现——脚本与事件被阻断，而 **SMIL 动画（`<animate>`/`<animateTransform>` 等声明式动画）照常播放**。即：安全降级不牺牲"动起来的预览"。

**L3 · 显式错误态（禁止静默破图）**
校验失败 / 资源不可得时渲染错误卡：*"SVG 预览失败：载荷 XML 不合法 / 资源不可用"* + 诊断（用了哪个源、解析错误消息、行:列）+ 动作（从磁盘重读、查看原始文本）。
*理由*：破图图标无信息量且**误导归因**（让人以为文件坏）；显式错误态指名失败层、保留证据、给出下一步。本次事故里，一个"载荷 232 行不合法（attr stro0）"的错误态会立刻把矛头指向载荷而不是文件。

**不变式**：渲染器任何状态下都不得出现"未校验载荷直接渲染"或"静默破图"。

---

## 5. 取证方法 + 预防清单

### 5.1 会话日志（concatenated-Zstandard generation file）逐帧解码

**原理**：zstd 帧自定界——帧头魔数 `0x28 0xB5 0x2F 0xFD`（LE 字节序 `2F FD 28 B5`），skippable 帧为 `0x184D2A5x`；一个"generation 文件"是多个生成/持久化步骤各自输出的帧**顺序拼接**，每帧可独立解压，无须先解整个文件。流式 zstd 解码器在帧边界自然停顿/续读，天然按序给出每帧输出。

**步骤（把轶事变成可复核证据）**：

1. 将 generation 文件原样拷入工作区（fixture 不可动）；
2. 按魔数切帧（扫描 `2F FD 28 B5` 边界；或直接用流式解码器顺序消费）；
3. 逐帧解压（`zstd -dc` / `pzstd` / Python `zstandard`·`pyzstd` 流式 / Node `zlib.zstdDecompressSync`），按序拼接；
4. 对每帧解码文本算 **sha256** 并与"工具交付结果"文本比对 → 定位分叉点（本例：**存储** result block 的帧与**交付**结果在 232 行分叉）；
5. 保存逐帧解码原文 + 帧偏移表，作为可复核证据。

**本次方法演练**（`agent-output\_tmp-zstd-demo\`）：3 帧拼接 486 bytes，魔数偏移 0 / 145 / 343，逐帧解码 sha256 与各原始文本**逐一匹配**（byte-exact recovery），证明该路径可复现（见 `decoded-frames.txt`）。实际取证时同样只需：解码 → 取 payload 约 232 行的**存储文本**逐字保存 → 与磁盘文件、交付结果三方对照。

**最小证据集**：(a) 日志中存储的载荷原文；(b) 磁盘文件原文；(c) 两者的 XML well-formedness 判定；(d) 交付结果 vs 存储结果的差异对照；(e) 非确定性记录（重读干净）。五件齐备，"损坏在载荷装配层"才是归因而非猜测。

### 5.2 本次事故新增的发布清单项

1. **version-bump-before-build**：先 bump 再 build（v0.3.8 已改此顺序）；CI 用文件时间戳/产物断言固化顺序；
2. **grep 出货 bundle 的烘焙常量**：断言 `PLUGIN_VERSION` 内联值 === `package.json.version`，且旧版本串不出现于出货 bundle；
3. **逐镜像 tag SHA 校验**（`git ls-remote --tags` 于 origin / public / omdsh，SHA 一致）——保留，但明确其边界：验证**传输完整性**，不验证**产物正确性**（§1.3）；
4. **上报上游文本损坏 bug**（session result-text 装配层的行拼接/丢行）而不是在插件里绕过或粉饰；插件侧只加防御性校验（§4）；
5. **发布后双平面生效验证**：自检冒烟（对最新 tag 不显示更新徽标）+ host 能力探针（新扩展名 asset 返回 200 且 content-type 正确）；宿主平面改动在 release note 标注 **"host restart required"**；UI toggle 出现不作为生效判据。

---

## 6. 结论

1. **幻影自更新**：比较用的 `PLUGIN_VERSION` 是 **build 时刻**由 tsdown 内联的化石常量（0.3.6），而 bump 在 build 之后；`newerTag` 拿镜像最高 tag（v0.3.7）与之比较必然自指。镜像/tag 完整性证明"字节传对了"，不证明"字节构建对了"。修复 = 先 bump 后 build + 出货物常量断言 + 自检冒烟。
2. **平面不对称**：客户端 bundle 随浏览器 re-fetch/reload 生效；宿主路由表在 host 进程 boot/import 时注册一次，换磁盘文件不重注册。PNG 200 / SVG 404 / 磁盘 lib 白名单 svg 三点交叉把陈旧钉在**运行中的 host 进程**；宿主平面变更必须重启（或显式热重载）才生效——"插件热更新"只适用于客户端平面。
3. **坏图归因**：损坏在会话载荷的 read-result 文本（232 行拼接 247 行尾、233–247 丢失），磁盘源文件良好、重读干净 → 属于**上游结果文本装配/持久化层**。插件必须把会话载荷当不可信渲染输入；改被追踪文件是拿损坏副本改好文件，只会制造损坏并掩盖上游 bug。
4. **防御链**：磁盘字节（资产路由）→（磁盘不可得时）过 DOMParser/`parsererror` 校验的载荷 → 沙箱 iframe 兜底（脚本阻断、SMIL 保留）→ 显式错误态；任何状态都不静默破图。
5. **取证**：concatenated-zstd generation 文件按帧魔数/流式解码逐帧恢复原文并做 sha 比对，即可把"渲染坏了"的轶事升级为"哪一层、哪一行、哪一帧"的证据；并以上游 bug 上报 + 发布清单五项防止复发。

---

## run-stats

- toolcalls 总数：**25**（计数口径：每次真实工具调用一行，含嵌套调用；12 次 `read`〔4 次直接调用失败、8 次嵌套〕、6 次 `write`、3 次 `edit`、2 次 `pwsh`、1 次 `run_code` 执行体〔zstd 逐帧解码演示，进程内 fs〕、1 次 `send_message`；明细见 `agent-output\tool-transcript.txt`）
- token 用量：**n/a**（本会话未暴露计量）
- 完成时间：**2026-10-21 15:21:13 +08:00[Asia/Shanghai]**


#### FILE: _tmp-zstd-demo/decoded-frames.txt

concatenated file: E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S19-phantom-update-stale-host\agent-output\_tmp-zstd-demo\session-gen.zst (486 bytes, 3 frames)
frame magic offsets: 0, 145, 343
--- frame 1 [0..145) decoded 153 bytes, sha256/16=a79626fea2a78833 match-original=true
GENERATION 1 (2026-09-05 17:02) read tool TYPE result delivered to caller (clean):
232: <circle r="98" fill="none" stroke="#dde6ea" stroke-width="6.5"/>
--- frame 2 [145..343) decoded 247 bytes, sha256/16=7196874e6b6615d3 match-original=true
GENERATION 2 (2026-09-05 17:03) model-visible result block PERSISTED to session log (corrupted):
232: <circle r="98" fill="none" stroke="#dde6ea" stro0,1 821,730" fill="none" stroke="#ffffff" stroke-width="3" opacity=".7" stroke-linecap="round"/>
--- frame 3 [343..486) decoded 153 bytes, sha256/16=93c08eb9dab8d7f2 match-original=true
GENERATION 3 (2026-09-05 17:11) re-read of same region (clean, non-deterministic):
232: <circle r="98" fill="none" stroke="#dde6ea" stroke-width="6.5"/>


#### FILE: report.md

# S19 · 幻影自更新、宿主半程陈旧与损坏载荷 —— 根因、归因与防御链报告

- 任务格: `S19-phantom-update-stale-host`（noskill 臂）
- 证据包: `fixture\`（只读，全程逐字节未改动；报告只摘要点与关键行，不全文转贴）
- 报告文件: `agent-output\S19-phantom-update-stale-host\report.md`（副本：`agent-output\report.md`）
- 插件: `@dsh-external/dsh-file-trace`（客户端插件，v0.3.7 / v0.3.8，2026-09-05 发布会话）

## TL;DR（三个症状、三个层、三个结论）

| 症状 | 真正的层 | 一句话根因 |
|---|---|---|
| v0.3.7 自报"新版本 v0.3.7 可用" | 产物内容（构建期烘焙常量） | `PLUGIN_VERSION` 在 build 时被 tsdown 内联为 `0.3.6`，而 bump 发生在 build 之后；常量陈旧，tag 新 → 自指更新 |
| v0.3.8 的 SVG Render：PNG 200 / SVG 404，磁盘 lib 却白名单 svg | 运行中的 host 进程（boot 期路由注册） | 客户端半程随浏览器刷新生效，宿主半程路由表只在 host 启动时注册；未重启 → 内存里仍是旧白名单 |
| traced SVG 渲染成坏图 | 会话载荷装配/持久化层（插件上游） | session log 里的 read-result 文本在共享前缀处行拼接 + 丢行；磁盘源文件良好、重读干净 → 载荷不可信，文件不是嫌疑人 |

---

## 0. 证据清单（要点 + 文件 ID，不全文）

| ID（fixture 文件） | 关键要点 |
|---|---|
| `release-log.md` | v0.3.7 实际操作顺序：16:22 **build** → 16:23 **bump 0.3.6→0.3.7** → 16:24 commit(含已构建 lib/client.js)+tag → 16:25 三镜像推送；v0.3.8 同会话发布 SVG 预览，**host 未重启** |
| `package.json` | 清单版本已是 0.3.8 |
| `git-tags.txt` | 三镜像（origin/public/omdsh）tag SHA 逐一相同（v0.3.7=748b5e5…，v0.3.8=d887deb…）；自检用 `git ls-remote --tags`（无鉴权）取最高 vX.Y.Z |
| `client-bundle-excerpt.js` | 出货 `lib/client.js` 内 `export const PLUGIN_VERSION = "0.3.6"`；注释注明 tsdown 在**构建时**内联，运行时不读 package.json |
| `asset-route-probe.txt` | 浏览器已刷新（新 toggle 可见）后：PNG probe **200 image/png**，SVG probe **404 "unsupported image type"**；host 未重启 |
| `lib-index-excerpt.js` | 磁盘 `lib/index.js` 的 `CONTENT_TYPES` **含** `svg: 'image/svg+xml'` |
| `session-log-excerpt.txt` | 会话载荷 232 行拼接损坏（233–247 丢失）；源文件 XmlDocument 判定良好；载荷判定 NOT well-formed（line 233 col 54）；重读干净（非确定性） |

---

## 1. 幻影自更新：根因与修复

### 1.1 被比较的版本常量来自**构建期**，不是运行期

- 出货 bundle（`client-bundle-excerpt.js`）里就是 `export const PLUGIN_VERSION = "0.3.6"` —— **0.3.6**，而 tag 打的是 **v0.3.7**。文件注释写明：tsdown 在 bundle 构建时从 package.json 内联该常量，**不是运行时动态读取**。
- 自检逻辑（bundle 内 `newerTag`）：`compareSemver(latestTag, PLUGIN_VERSION) > 0` 才显示徽标；`latestTag` 来自镜像 `git ls-remote --tags` 取最高 vX.Y.Z。
- 代入现场值：`newerTag("v0.3.7")` 与 `PLUGIN_VERSION="0.3.6"` 比较 → 0.3.7 > 0.3.6 → 返回 v0.3.7 → 徽标 **"新版本 v0.3.7 可用"** 显示在刚发布的 v0.3.7 自己身上。这是**自指**：比较的两端本应同一版本，但左端（常量）是旧构建的化石，右端（tag）是新发布。

### 1.2 实际的顺序错误：bump 发生在 build 之后

`release-log.md` 的时间线（要点）：16:22 `pnpm run build`（此时 package.json 还是 **0.3.6**，tsdown 即按 0.3.6 烘焙常量）→ 16:23 才 bump 到 0.3.7 → 16:24 commit（连同**已构建**的 `lib/client.js`）+ tag → 16:25 推送三镜像。

- bump 位于 build 之后，**不会追溯改写已烘焙进产物的常量**；于是 commit 的内容自相矛盾：清单/README 写 0.3.7，产物内部常量是 0.3.6。
- 这不是"版本号写错"，而是**产物与清单脱钩**：常量的真值时刻是 build 时刻，而维护者把它当成了 tag/commit 时刻的值。

### 1.3 为什么镜像/tag 完整性在这里无关紧要

- `git-tags.txt` 证明三个镜像的 tag SHA **完全一致**（v0.3.7=748b5e5…，v0.3.8=d887deb…）——传输与推送完整性无懈可击。
- 但 SHA 校验回答的是"**到达的字节 == 推送的字节**"，不回答"**推送的字节是不是按正确版本构建的**"。本缺陷在产物**内容**（烘焙常量）内部：完整性验证只是证明同一份错误被忠实地复制了三遍。integrity ≠ correctness；镜像侧做得再对，也治不了构建期就写错的常量。

### 1.4 修正后的发布顺序 + 能拦下本次事故的事前检查

**正确顺序**（v0.3.8 已按此执行，release-log 记载"bump FIRST, then build"）：

1. 改代码 + 回归测试；
2. **先 bump `package.json` 版本**（0.3.6 → 0.3.7）；
3. typecheck / vitest；
4. **再 build**（tsdown 此时内联的就是新版本）；
5. **出货物断言**（见下）；
6. commit（含构建产物）+ tag；
7. 推送三镜像 + `git ls-remote --tags` 逐镜像核对 SHA。

**事前检查（任何一条都能在 push 前拦住本次事故）**：

- **grep 出货 bundle 的烘焙常量**：`grep -n 'PLUGIN_VERSION' lib/client.js`（或 `node -e` 动态 import 读取导出常量），断言其值 **=== `package.json.version`**，并断言旧版本字符串不再出现于 bundle；
- **自检冒烟**：对将发布的 tag 运行 bundle 内 `newerTag(latestMirrorTag)`，断言返回 `undefined` —— 插件不得向自己报更新。

v0.3.7 的补救（release-log 已记载）：amend + **重新构建** + 三镜像 force-move tag；教训固化为"先 bump 后 build"。

---

## 2. 客户端 vs 宿主：平面更新不对称

### 2.1 两半代码各自在哪里、何时被加载

| 平面 | 代码 | 加载时机 | 何时"生效" |
|---|---|---|---|
| 客户端 | `lib/client.js`（浏览器端 bundle） | 浏览器页面加载 / re-fetch / reload 时取用 | 磁盘 bundle 更新后**刷新页面即生效** → v0.3.8 的 SVG render toggle 出现在浏览器 = 客户端半程确实已刷新 |
| 宿主 | `lib/index.js`（host 进程内路由） | host (Node) 进程 **boot/import 时刻**：模块顶层代码执行一次，把路由与 `CONTENT_TYPES` 白名单注册进**正在运行**的服务器 | **重启 host 进程**（或显式热重载重新注册路由）才生效 |

- 本会话事实（`release-log.md` / `asset-route-probe.txt`）：**host 从未重启**；浏览器端确认新 toggle 可见可点。
- 因此运行中进程持有的是**旧** `CONTENT_TYPES`（无 svg 项）：GET asset?…svg → 404 "unsupported image type"；GET asset?…png → 200 image/png（旧白名单一直有 png）。

### 2.2 探针如何把"陈旧"钉在 **运行中的 host 进程** 而不是发布物

三点交叉定位（`asset-route-probe.txt` + `lib-index-excerpt.js`）：

1. **PNG 200** → 路由存在、handler 活着（排除"路由缺失/挂错/进程没起来"）；
2. **SVG 404 "unsupported image type"** → 拒绝来自**扩展名白名单**分支的错误文案（不是 IO/权限错误）；
3. **磁盘 `lib/index.js` 含 `svg: 'image/svg+xml'`** → 发布物/磁盘代码是新的。

⇒ **磁盘代码新、运行代码旧** = 陈旧位于已加载进内存的 host 进程。反证也成立：若 release 本身陈旧，磁盘 lib 里不会有 svg 项；若路由坏了，PNG 探针也会失败。404 与 200 的差分恰好是"白名单版本"的指纹。

### 2.3 为什么"插件热更新"这条经验在这里失效

- 热更新 / HMR 的语义覆盖的是**客户端 bundle**：浏览器重新取件、重新加载，换掉的只是渲染端代码；
- 宿主半程是**常驻服务进程**：route 注册是 import 时的一次性副作用。Node 不会因为磁盘上换了 `lib/index.js` 就重新执行已加载模块的顶层代码；没有显式 `--watch` / 模块失效 + 路由重注册机制时，**换文件 ≠ 换行为**；
- 所以宿主平面变更生效的常规手段**只有重启**（或等效显式热重载）。这正是"插件热更新"经验的边界：它只描述客户端平面，宿主平面遵循"进程生命周期"规则；
- 发布纪律：宿主平面改动必须在 release note 标注 **"host restart required"**，并以**能力探针**验证生效（对新扩展名发一次 GET/HEAD 断言 200 + 正确 content-type），而不是以 UI toggle 出现为准。**UI 可见 ≠ 两平面都生效**；本例的"客户端新、宿主旧"混合态正是这种误判的产物。

---

## 3. 坏图归因：损坏在会话载荷，不在被追踪文件

### 3.1 证据链（`session-log-excerpt.txt` 要点）

1. **磁盘源文件**（单独读取）：良好 XML —— System.Xml XmlDocument load 无错误；
2. **会话日志里存储的 read-result 文本**（payload 约 232 行）：232 行 = 源 232 行（到 `...stroke="#dde6ea" stro`）+ 源 247 行尾（`0 0,1 821,730"` 起的弧标志与 path 尾部），**源 233–247 行整体缺失**；XML 判定 NOT well-formed（line 233 col 54：*Specification mandates value for attribute stro0*）；
3. **交付给调用方的 TYPE 结果是干净的**；事后**重读同一区域干净**（非确定性）。

⇒ 损坏发生在**结果文本装配 / 持久化层**：即"模型可见 result block 被写入 session log"的那一步，在插件**上游**。插件只是如实渲染了会话载荷带来的那段文本；被追踪的 SVG 文件不是嫌疑人。

### 3.2 插件为什么必须把会话载荷当作**不可信渲染输入**

- **载荷 ≠ 磁盘真相**：本例就是二者分叉的实证。载荷经装配、传输、持久化多环，任一环都可能带入损坏（本例形态：共享前缀处的行拼接 + 丢行，拼接点恰落在 `stro`/`0 0,1` 的共享前缀上）；
- 渲染器若把载荷当真相，损坏就会被可视化成"文件坏了"的假象，**归因被误导**（用户、维护者都会去怀疑源文件）；
- 因此：渲染前必须验证（至少 XML well-formedness，见第 4 节）；验证不过 → 显式错误态，绝不渲染。

### 3.3 为什么"编辑 / 修复"被追踪文件是错误动作

1. **磁盘文件本来就是好的**——没有东西可修；"修"等于拿损坏副本去改写完好源文件，**制造真实损坏**；
2. **掩盖上游 bug**（papering over）：证据被销毁，结果文本装配层的缺陷会继续影响其他文件；
3. 会造成文件与其追踪记录进一步分叉，甚至破坏用户内容；
4. 正确动作：归因到载荷层 → 重读/再验证确认非确定性 → **上报上游文本损坏 bug**，插件侧只做防御性校验（清单见 §5.2）。

---

## 4. 防御性渲染链（SVG 预览）设计

**渲染源优先级（严格顺序，禁止跳跃）：**

**L0 · 磁盘字节（资产路由优先）**
先经 host asset route（白名单 `svg: 'image/svg+xml'`）取**磁盘 bytes** 渲染。
*理由*：磁盘是已被证明完好的真相源（XmlDocument 判定良好）；从磁盘取字节**绕开载荷损坏整条路径**，且资产路由给出受控 content-type，不经会话层污染面。

**L1 · 会话载荷（仅当磁盘不可得，且必须过校验）**
`DOMParser.parseFromString(text, 'image/svg+xml')`，检查 `doc.getElementsByTagName('parsererror').length === 0`（或 `querySelector('parsererror')` 为 null）；**不通过即拒绝**，不进入渲染。
*理由*：本例损坏恰是"非良构拼接"，一次 parse 校验即可拦下整类损坏；绝不大意地认为"载荷就是文件内容"。

**L2 · 沙箱 iframe 兜底渲染（脚本阻断，SMIL 保留）**
即便 XML 良构，SVG 仍可能携带 `<script>`、`onload=` 等事件属性、外部引用（`<image href>`/`<use href>`）、`javascript:` URL。用 `<iframe sandbox>`（**不加** `allow-scripts`）以 srcdoc/src 承载，或用 `<img src>` 方式渲染（浏览器对 img 中的 SVG 不执行脚本）。
*理由*：沙箱去掉的是**可执行性**，不是视觉/动画表现——脚本与事件被阻断，而 **SMIL 动画（`<animate>`/`<animateTransform>` 等声明式动画）照常播放**。即：安全降级不牺牲"动起来的预览"。

**L3 · 显式错误态（禁止静默破图）**
校验失败 / 资源不可得时渲染错误卡：*"SVG 预览失败：载荷 XML 不合法 / 资源不可用"* + 诊断（用了哪个源、解析错误消息、行:列）+ 动作（从磁盘重读、查看原始文本）。
*理由*：破图图标无信息量且**误导归因**（让人以为文件坏）；显式错误态指名失败层、保留证据、给出下一步。本次事故里，一个"载荷 232 行不合法（attr stro0）"的错误态会立刻把矛头指向载荷而不是文件。

**不变式**：渲染器任何状态下都不得出现"未校验载荷直接渲染"或"静默破图"。

---

## 5. 取证方法 + 预防清单

### 5.1 会话日志（concatenated-Zstandard generation file）逐帧解码

**原理**：zstd 帧自定界——帧头魔数 `0x28 0xB5 0x2F 0xFD`（LE 字节序 `2F FD 28 B5`），skippable 帧为 `0x184D2A5x`；一个"generation 文件"是多个生成/持久化步骤各自输出的帧**顺序拼接**，每帧可独立解压，无须先解整个文件。流式 zstd 解码器在帧边界自然停顿/续读，天然按序给出每帧输出。

**步骤（把轶事变成可复核证据）**：

1. 将 generation 文件原样拷入工作区（fixture 不可动）；
2. 按魔数切帧（扫描 `2F FD 28 B5` 边界；或直接用流式解码器顺序消费）；
3. 逐帧解压（`zstd -dc` / `pzstd` / Python `zstandard`·`pyzstd` 流式 / Node `zlib.zstdDecompressSync`），按序拼接；
4. 对每帧解码文本算 **sha256** 并与"工具交付结果"文本比对 → 定位分叉点（本例：**存储** result block 的帧与**交付**结果在 232 行分叉）；
5. 保存逐帧解码原文 + 帧偏移表，作为可复核证据。

**本次方法演练**（`agent-output\_tmp-zstd-demo\`）：3 帧拼接 486 bytes，魔数偏移 0 / 145 / 343，逐帧解码 sha256 与各原始文本**逐一匹配**（byte-exact recovery），证明该路径可复现（见 `decoded-frames.txt`）。实际取证时同样只需：解码 → 取 payload 约 232 行的**存储文本**逐字保存 → 与磁盘文件、交付结果三方对照。

**最小证据集**：(a) 日志中存储的载荷原文；(b) 磁盘文件原文；(c) 两者的 XML well-formedness 判定；(d) 交付结果 vs 存储结果的差异对照；(e) 非确定性记录（重读干净）。五件齐备，"损坏在载荷装配层"才是归因而非猜测。

### 5.2 本次事故新增的发布清单项

1. **version-bump-before-build**：先 bump 再 build（v0.3.8 已改此顺序）；CI 用文件时间戳/产物断言固化顺序；
2. **grep 出货 bundle 的烘焙常量**：断言 `PLUGIN_VERSION` 内联值 === `package.json.version`，且旧版本串不出现于出货 bundle；
3. **逐镜像 tag SHA 校验**（`git ls-remote --tags` 于 origin / public / omdsh，SHA 一致）——保留，但明确其边界：验证**传输完整性**，不验证**产物正确性**（§1.3）；
4. **上报上游文本损坏 bug**（session result-text 装配层的行拼接/丢行）而不是在插件里绕过或粉饰；插件侧只加防御性校验（§4）；
5. **发布后双平面生效验证**：自检冒烟（对最新 tag 不显示更新徽标）+ host 能力探针（新扩展名 asset 返回 200 且 content-type 正确）；宿主平面改动在 release note 标注 **"host restart required"**；UI toggle 出现不作为生效判据。

---

## 6. 结论

1. **幻影自更新**：比较用的 `PLUGIN_VERSION` 是 **build 时刻**由 tsdown 内联的化石常量（0.3.6），而 bump 在 build 之后；`newerTag` 拿镜像最高 tag（v0.3.7）与之比较必然自指。镜像/tag 完整性证明"字节传对了"，不证明"字节构建对了"。修复 = 先 bump 后 build + 出货物常量断言 + 自检冒烟。
2. **平面不对称**：客户端 bundle 随浏览器 re-fetch/reload 生效；宿主路由表在 host 进程 boot/import 时注册一次，换磁盘文件不重注册。PNG 200 / SVG 404 / 磁盘 lib 白名单 svg 三点交叉把陈旧钉在**运行中的 host 进程**；宿主平面变更必须重启（或显式热重载）才生效——"插件热更新"只适用于客户端平面。
3. **坏图归因**：损坏在会话载荷的 read-result 文本（232 行拼接 247 行尾、233–247 丢失），磁盘源文件良好、重读干净 → 属于**上游结果文本装配/持久化层**。插件必须把会话载荷当不可信渲染输入；改被追踪文件是拿损坏副本改好文件，只会制造损坏并掩盖上游 bug。
4. **防御链**：磁盘字节（资产路由）→（磁盘不可得时）过 DOMParser/`parsererror` 校验的载荷 → 沙箱 iframe 兜底（脚本阻断、SMIL 保留）→ 显式错误态；任何状态都不静默破图。
5. **取证**：concatenated-zstd generation 文件按帧魔数/流式解码逐帧恢复原文并做 sha 比对，即可把"渲染坏了"的轶事升级为"哪一层、哪一行、哪一帧"的证据；并以上游 bug 上报 + 发布清单五项防止复发。

---

## run-stats

- toolcalls 总数：**25**（计数口径：每次真实工具调用一行，含嵌套调用；12 次 `read`〔4 次直接调用失败、8 次嵌套〕、6 次 `write`、3 次 `edit`、2 次 `pwsh`、1 次 `run_code` 执行体〔zstd 逐帧解码演示，进程内 fs〕、1 次 `send_message`；明细见 `agent-output\tool-transcript.txt`）
- token 用量：**n/a**（本会话未暴露计量）
- 完成时间：**2026-10-21 15:21:13 +08:00[Asia/Shanghai]**

#### FILE: tool-transcript.txt

1. run_code（执行体，内含 pwsh）Get-ChildItem -Recurse -Force fixture\ —— 列证据包目录树（8 个文件）
2. read fixture\README.md —— 失败（read 仅可经 run_code 调用），无文件系统访问
3. read fixture\release-log.md —— 失败（同上），无文件系统访问
4. read fixture\git-tags.txt —— 失败（同上），无文件系统访问
5. read fixture\package.json —— 失败（同上），无文件系统访问
6. read fixture\README.md（经 run_code 调用）
7. read fixture\release-log.md（经 run_code 调用）
8. read fixture\git-tags.txt（经 run_code 调用）
9. read fixture\package.json（经 run_code 调用）
10. read fixture\client-bundle-excerpt.js（经 run_code 调用）
11. read fixture\asset-route-probe.txt（经 run_code 调用）
12. read fixture\lib-index-excerpt.js（经 run_code 调用）
13. read fixture\session-log-excerpt.txt（经 run_code 调用）
14. run_code（执行体，node:zlib zstdCompressSync/zstdDecompressSync + fs）concatenated-zstd 三帧拼接→按帧魔数 2F FD 28 B5 切帧→逐帧解码+sha256 逐一校验，写 agent-output\_tmp-zstd-demo\session-gen.zst、decoded-frames.txt
15. write agent-output\S19-phantom-update-stale-host\report.md（主报告，5 个必答项 + run-stats）
16. edit agent-output\S19-phantom-update-stale-host\report.md（run-stats 计数行更正）
17. write agent-output\report.md（主报告副本）
18. write agent-output\tool-transcript.txt（首版）
19. write agent-output\transcript-manifest.txt（首版）
20. pwsh Get-ChildItem -Recurse -File agent-output\ —— 校验产物存在且非空
21. edit agent-output\S19-phantom-update-stale-host\report.md（run-stats 总数定稿 25）
22. edit agent-output\report.md（同上副本）
23. write agent-output\tool-transcript.txt（定稿，含全部 25 次调用）
24. write agent-output\transcript-manifest.txt（定稿）
25. send_message agent_id=session-5d3ebe0e-127d-4dc4-a3b9-cb2199b04f8e（结果回报父代理）


#### FILE: transcript-manifest.txt

R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S19-phantom-update-stale-host\fixture\
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S19-phantom-update-stale-host\fixture\README.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S19-phantom-update-stale-host\fixture\release-log.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S19-phantom-update-stale-host\fixture\git-tags.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S19-phantom-update-stale-host\fixture\package.json
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S19-phantom-update-stale-host\fixture\client-bundle-excerpt.js
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S19-phantom-update-stale-host\fixture\asset-route-probe.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S19-phantom-update-stale-host\fixture\lib-index-excerpt.js
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S19-phantom-update-stale-host\fixture\session-log-excerpt.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S19-phantom-update-stale-host\agent-output\
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S19-phantom-update-stale-host\agent-output\_tmp-zstd-demo\
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S19-phantom-update-stale-host\agent-output\_tmp-zstd-demo\session-gen.zst
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S19-phantom-update-stale-host\agent-output\_tmp-zstd-demo\decoded-frames.txt
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S19-phantom-update-stale-host\agent-output\S19-phantom-update-stale-host\
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S19-phantom-update-stale-host\agent-output\S19-phantom-update-stale-host\report.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S19-phantom-update-stale-host\agent-output\report.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S19-phantom-update-stale-host\agent-output\tool-transcript.txt
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S19-phantom-update-stale-host\agent-output\transcript-manifest.txt


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.