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
#### FILE: S19-phantom-update-stale-host/S19-report.md

# S19 · 幻影自更新 / 过期宿主半平面 / 损坏载荷 —— 只读分析报告

插件：`@dsh-external/dsh-file-trace`（v0.3.7 幻影自更新徽标 · v0.3.8 SVG 预览 404 / 破图）
证据：fixture/（只读，未改动）；技能卡片引用仅列 ID 与要点（plugin-upgrade 技能，references/v0.1.7-alpha.2.md）。

---

## 1. 幻影自更新根因：build-before-bump 烘焙了旧版本常量

**现象**：刚发布的 v0.3.7 在自身抽屉里显示"新版本 v0.3.7 可用"——插件向自己播报更新。

**机制（fixture/client-bundle-excerpt.js）**：自更新检查把**烘焙在 bundle 里的常量** `PLUGIN_VERSION` 与各镜像的最新 tag 做 semver 比较，`latest > PLUGIN_VERSION` 即点亮徽标。关键在该常量的来源：注释明确写着它是 **tsdown 在构建时从 package.json 内联的，运行时不再动态读取**。

**操作顺序错误（fixture/release-log.md）**：
1. 16:22 `pnpm run build` —— 产物此时烘焙的是 package.json 里的 **0.3.6**；
2. 16:23 才把 version bump 到 **0.3.7**；
3. 16:24 commit **包含已构建的 lib/client.js** 并打 tag v0.3.7；16:25 推送三镜像。

即 **build 在 bump 之前**：tag v0.3.7 指向的提交里， shipped bundle 携带 `PLUGIN_VERSION = "0.3.6"`。运行后 `newerTag("v0.3.7")` → `compareSemver("v0.3.7","0.3.6") > 0` → 徽标点亮。这不是逻辑 bug，是发布流水线的顺序错误。

**为什么镜像/tag 完整性无关**：fixture/git-tags.txt 显示 origin/public/omdsh 三镜像的 v0.3.7（748b5e5…）与 v0.3.8（d887deb…）SHA 完全一致，自更新检查抓取的正是这些 tag。SHA 一致只能证明"所有人拿到同一份字节"，不能证明"字节内容正确"——而错误恰恰在于那份字节里的烘焙常量。完整性校验与内容校验是两个正交的门禁。

**修正的发布顺序**：改代码 → 测试 → **先 bump package.json** → **再 build** → **校验产物中烘焙的版本常量** → commit（含产物）→ tag → 推送镜像。release-log 第 15 行证实 v0.3.8 已改为 bump-first（因此 v0.3.8 没有幻影徽标）。

**能在推送前捕获它的检查**：发布门禁中对已打包 bundle 做 grep/断言——提取 `PLUGIN_VERSION` 字符串与 package.json 的 `version` 比对，不一致即拒绝推送。一行 shell 即可，属于"内容正确性"检查，补 SHA 校验的盲区。

## 2. 客户端平面 vs 宿主平面的更新不对称

**两半平面装载时机不同**：
- **客户端半平面（lib/client.js）**：经 Web 服务器以 bundle/combo URL 送达浏览器，浏览器刷新/重取即运行新字节。证据：SVG 渲染 toggle 已出现并可点击 → 客户端平面已刷新到位。
- **宿主半平面（lib/index.js）**：在 Node 宿主进程内执行，其 HTTP 路由（`/dsh-file-trace/asset`）在**宿主启动 / 插件激活时注册一次**，之后常驻进程内存。磁盘上换成新文件不会触发路由重注册。

**探针如何把陈旧性钉在"运行中的进程"而非发布物**（fixture/asset-route-probe.txt + lib-index-excerpt.js）：
- PNG 探针 **200 image/png** → 路由处理器活着，排除"路由缺失/插件未加载"；
- SVG 探针 **404 "unsupported image type"** → 拒绝发生在扩展名白名单判断处；
- 磁盘上的 lib/index.js 的 `CONTENT_TYPES` **明确含 `svg: 'image/svg+xml'`** → 发布物正确。
- 三者合取：**磁盘正确 + 进程行为陈旧** ⇒ 进程内存里是启动时加载的旧版白名单（且 probe 注释确认宿主自 SVG 白名单变更前未重启）。

**宿主平面改动如何生效**：必须**重启宿主进程**（插件随宿主重挂载、路由重注册）。这是"插件热更新"规则**唯一不成立**的情形：刷新/重取只覆盖浏览器端消费的客户端 bundle；路由、服务、事件订阅等宿主平面状态在进程生命周期内冻结。另注意技能卡 **DSH-0.1.7-A2-04** 的双向陷阱：新版宿主**在启动时缓存客户端 bundle**（安装树内改 lib/client.js 仅刷新页面不生效，同样要宿主重启），且 Web 页在宿主重启后自动重连——页面"还活着"不代表在跑新字节，验证须抓取 combo URL 的实际内容而非只看 200（与技能验证清单"不接受 bare HTTP 200、要证明注册/挂载"一致）。

**本案结论**：v0.3.8 的 SVG 支持需要一次宿主重启，asset 路由才会按新白名单放行 svg；重启后 PNG/SVG 应同返 200。

## 3. 破图归因：损坏在会话载荷装配层，不在被追踪文件

**三层证据（fixture/session-log-excerpt.txt）**：
1. **磁盘源文件**：良构 XML（System.Xml XmlDocument 加载无错）；
2. **会话日志中的 read 结果文本**：payload 第 232 行是拼接体——源 232 行前缀（到 `…stroke="#dde6ea" stro`）+ 源 247 行尾巴（从 `0 0,1 821,730` 起），源 233–247 行**整段缺失**；判定**非良构**（"error on line 233 at column 54: Specification mandates value for attribute stro0"）；
3. **重读同一区域**：干净 —— 损坏**非确定性**、不可稳定复现。

**损坏发生在哪一层**：产生"模型可见结果块"的**结果文本装配 / 会话日志持久化层**——只读工具交付给调用方的 TYPE 结果是干净的，写进会话日志的那一份文本被拼接。该层在插件**上游**，插件只是消费者。拼接落在共享前缀 `"stro"`（`stroke-width…` vs 弧标志 `0 0,1…`），是典型的缓冲区/流装配错位指纹。

**为什么插件必须把会话载荷当作不可信渲染输入**：载荷经过多跳装配与持久化，可能被截断、拼接、转义破坏；它不是磁盘文件的真身，只是"某个时刻某条流水线产出的一段文本"。

**为什么"修复"被追踪文件是错误动作**：文件根本没坏。编辑它会（a）向用户工作区引入真实、错误的 diff；（b）污染 git 状态、误导后续排查；（c）完全治不了本——上游偶发损坏会在任意别的文件上复发。正确动作是**上报上游 bug（附帧级取证证据）+ 插件侧做防御性渲染**（§4）。

## 4. 防御性渲染链设计（按来源优先级排序）

```
SVG 预览请求
  ├─ ① 磁盘字节资产路由 /dsh-file-trace/asset?path=…（首选）
  │     └─ 200 → 字节直接进 ③ 的 sandbox iframe 渲染
  │     └─ 404/失败 → ②
  ├─ ② 会话载荷文本（次选，先过校验闸）
  │     └─ DOMParser 解析 → 无 parsererror → 进 ③
  │     └─ parsererror（如本案 line 233 col 54）→ ④，绝不进 img/iframe
  ├─ ③ 渲染出口：sandbox iframe（sandbox=""：禁脚本/表单/弹窗/同源）
  │     SMIL 动画不依赖脚本，仍可播放；SVG 是可执行格式，隔离渲染
  └─ ④ 显式错误态卡片：标注哪个来源失败、校验错误的行列、
        建议动作（重读文件 / 重启宿主），绝不静默破图
```

各级理由：
1. **资产路由优先**：直读磁盘字节 + 正确 content-type，整条会话文本层被绕过，是唯一"真身"来源；也天然免疫本案这类载荷损坏。
2. **载荷需良构校验**：载荷不可信（§3），`DOMParser` + 检查 `parsererror` 节点是廉价的否决闸，把损坏拦截在渲染之前，并把"文件坏了"的假象改判为"载荷坏了"。
3. **sandbox iframe 作为最后渲染退路**：SVG 可携带 `<script>`、事件处理器与外部引用，直插 DOM 风险高；`sandbox` 属性封锁脚本与导航，SMIL 仍运行，预览体验不损。
4. **显式错误态**：静默破图会把上游故障伪装成"文件损坏"，诱导人或代理去"修"好文件——正是本事故中最危险的动作；错误卡片把诊断与建议动作摆在明处。

## 5. 取证方法 + 发布清单新增项

### 会话日志（concatenated-Zstandard generation file）逐帧解码
- zstd 帧有魔数 `0xFD2FB528`（字节序 28 B5 2F FD）；串联生成文件 = 多帧首尾相接，可**顺序扫描魔数切帧**，每帧独立解压后按序拼接，即还原完整日志文本（支持多帧的工具/库亦可一次解完）。
- 还原后按行号定位 read 结果块（本案 payload 232 行一带），与磁盘文件逐行 diff：**缺失区间（233–247）+ 共享前缀拼接点（"stro"）** 即损坏指纹；XML 良构校验给出定性结论；重读干净 → 非确定性上游 bug。
- 价值：把"我记得图像坏了"的轶事变成可附在 issue 里的证据（帧原文 + diff + 校验输出）。

### 本事故为发布清单新增的条目
1. **bump-before-build**：版本号提升必须先于构建，产物随之烘焙新常量（本事故即 bump-after-build 的直接后果）；
2. **产物常量门禁**：推送前 grep 已打包 bundle 中的版本常量，断言与 package.json 一致（SHA 校验之外的"内容正确性"检查）；
3. **每镜像 tag SHA 校验**：`git ls-remote --tags` 全镜像比对（本案已做且通过——防"镜像不一致"，不防"字节内容错"，与第 2 条互补、缺一不可）；
4. **上报上游文本损坏 bug**：持帧级取证证据上报结果装配/持久化层；**禁止**在插件里"修复"载荷原文、更禁止改写被追踪文件来掩盖。

---

## 附：证据与引用索引
- fixture/release-log.md —— v0.3.7 操作顺序（build→bump→commit→tag→push）与 v0.3.8 的 bump-first 纠正
- fixture/client-bundle-excerpt.js —— `PLUGIN_VERSION="0.3.6"` 构建时内联 + `newerTag` 比较逻辑
- fixture/git-tags.txt —— 三镜像 SHA 一致；自更新检查的数据源
- fixture/asset-route-probe.txt —— PNG 200 / SVG 404 / 磁盘白名单含 svg 的三联钉证
- fixture/lib-index-excerpt.js —— `CONTENT_TYPES` 含 `svg: 'image/svg+xml'`
- fixture/session-log-excerpt.txt —— 拼接损坏、良构性判定、重读干净、损坏层归因
- 技能卡片：DSH-0.1.7-A2-04（客户端 bundle 宿主启动时缓存：安装树内编辑需宿主重启；自动重连假象；验证须查 combo 内容）；SKILL.md 验证清单（冷启动真实 profile、证明注册/挂载而非接受 bare 200）


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.