# S15 · Vanishing Dock Chips: the Silent Slot Crash — 诊断报告

> 目标插件：`@org/dsh-attach-input` v0.2.10 → v0.2.11（社区 Web 插件，lib-only，渲染进两个 composer slot：`input.left` 的 attach 按钮、InputZone occurrences 的待附加 dock）
> 症状：v0.2.11 起，粘贴截图 → 输入框上方「待附加 chip」整块消失；粘贴本身成功；`+` attach 按钮不受影响；UI 无任何错误提示。
> 结论先行：**不是 v0.2.11 的 hover-preview 搞崩了 slot，而是一条 v0.2.10 就存在的自由标识符（`busy`）引用，在「有 occurrence + 空闲阶段」这条渲染路径上首次被求值，抛 ReferenceError，被 slot 级 error boundary 吞掉并卸载整个 dock entry。**

---

## 1. 根因（Root cause）

**要点**：抛点是 `AttachmentChips()` 构造 remove 按钮 props 时的 `disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy`；`busy` 是 `AttachButton()` 里 `React.useState` 的局部绑定，在 `AttachmentChips` 作用域里是自由标识符 → 渲染期 `ReferenceError: busy is not defined`。

### 1.1 抛出的表达式

`plugin-dock-chips.js:34`（v0.2.10 出厂源码，行号见 fixture 原文）：

```js
disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,   // <-- ???
```

出错的是**右操作数 `busy`**：它是一个**自由标识符**（free identifier）——在当前作用域链（模块顶层 → `AttachmentChips` 函数体）里没有任何 `busy` 绑定，于是运行期求值抛 `ReferenceError: busy is not defined`（浏览器里是 minified 后的 `busy is not defined`，只有一行 console 记录）。

### 1.2 `busy` 为什么是悬空的

`busy` 的真实归属是 **`AttachButton()` 的局部状态**：

```js
function AttachButton(props) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);          // <-- busy lives HERE   (fixture:7)
  ...
    h('button', { ..., disabled: locked || busy, ... }, '+'),   // (fixture:17) 合法：busy 在本作用域内
}
```

`AttachmentChips` 是与之**并列**的另一个顶层函数（fixture:21），两者不共享 `useState` 作用域。`AttachButton:17` 的 `disabled: locked || busy` 是合法的，v0.2.10 的 hardening pass 显然是从**这一行**复制粘贴改写的——fixture:33 的注释也点明了这一点：`// v0.2.10 hardening pass added the phase guard — and this busy reference:`。同一个模块里一行合法、一行悬空，正是复制粘贴缺陷的典型形态。

> 补充结构事实：`AttachmentDock(props)`（fixture:40-43）只是 `useRevision()` 后**以普通函数调用** `AttachmentChips(props, 'dock')`，所以抛错发生在 dock entry 的渲染 pass 内部，而不是某个子组件/回调里。

### 1.3 为什么「只有 chip 渲染时才抛」

抛错行位于 `occurrences.map(occurrence => { ... })` 的**回调体内**，因此存在两道门控：

1. **空 dock 早退**（fixture:23）：`if (occurrences.length === 0) return null;` —— 没有任何挂起附件时函数直接返回 `null`，**整段构造 chip vnode 的代码（含抛错行）根本不执行**。
2. **每条 occurrence 各求值一次**：`h()` 的参数是**立即求值**的（对象字面量的属性值在调用 `h` 之前就算完），所以只要有一条 `source === SOURCE` 的 occurrence 需要渲染，`busy` 就会被读一次 → 抛一次。

反过来看，插件**加载、激活、注册 slot 全程都不碰这行**（它在函数体里，不在模块顶层），所以宿主侧毫无异常，插件看起来「装好了、注册好了」。

实测（`repro-shortcircuit.mjs`，把 fixture:21-37 的表达式原样抽出执行）：

| 用例 | 结果 |
|---|---|
| A 空 dock（无 occurrence） | `null`（早退），不抛 |
| B 有 chip + `phase: 'plain'`（空闲） | **THROWS `ReferenceError: busy is not defined`** |
| C 有 chip + `phase: 'busy'`（锁定/占用） | 渲染成功，**不抛**（`||` 短路） |
| D 有 chip + `input` 无 `phase` 键（`?? 'plain'` 兜底） | **THROWS `ReferenceError`** |
| E `props.input` 缺失（`?.occurrences ?? []` → 空） | `null`（早退），不抛 |

⇒ 触发条件 = **「≥1 条 occurrence」 ∧ 「阶段为 plain（或缺失）」**。粘贴截图/附件恰好稳定地制造出第一条，用户为试用 hover-preview 去粘图，恰好稳定地撞上第二条。

### 1.4 为什么 `||` 短路让它在 v0.2.10 保持潜伏

`A || B` 的求值顺序是**先 A，A 为真则 B 完全不求值**。这里：

- 左操作数 `(props.input?.phase ?? 'plain') !== 'plain'` 为**真** ⇔ `phase` 存在且不等于 `'plain'`（即锁定/占用阶段）→ `busy` **永远不会被读**；
- 左操作数为**假** ⇔ `phase === 'plain'`（空闲），或 `props.input` 缺失（`?? 'plain'` 兜底成 `'plain'`）→ 才会去读 `busy` → 抛。

也就是说，这个自由标识符是**双重门控**的：`||` 提供了「阶段门控」，早退提供了「数据门控」。两者叠加的后果是：

- 在**锁定/占用阶段**（生成中、locked composer）这个缺陷**完全静默**——任何在该阶段做的手动验证都看不到错误；
- 在**空 dock** 上也完全静默——任何「挂载一下看看报不报错」的空态 smoke 都看不到错误；
- 只有「空闲 + 已有 chip」这个**最常见的真实状态**才会炸，而它恰恰是 v0.2.10 期间唯一没有任何自动化用例覆盖的组合（维护者自述：`We shipped without a render smoke that mounts the dock with a chip present`）。

`||` 因此把一次**必然暴露**的崩溃，降格成了一次**条件性、低频、无信号**的崩溃：缺陷在 v0.2.10 的整个发布周期里都躺在同一行代码上，只是从未被求值到。**潜伏的不是「不存在」，而是「没被读到」。**

> 一处必须诚实标注的证据张力：严格按代码推演，v0.2.10 的用户在空闲态粘贴附件也应命中同一条 ReferenceError；用户/维护者「v0.2.10 的 x 按钮用得好好的」是证据链里**最弱的一环**——chip 在粘贴后立刻消失，很容易被解读成「附件没挂上」而不是「dock 崩了」。无论这一环是否成立，可以确定的是：**抛错的那一行在 v0.2.10 出厂源码里就存在**（fixture:33-34 的注释 + `user-thread.md` 维护者备注双向确认是 hardening pass 引入），v0.2.11 没有新增它（详见 §2）。

### 1.5 为什么症状是「整个 dock 消失」而不是「删除按钮坏了」

三个尺度错配叠加的结果：

1. **抛错发生在「构造 vnode」阶段，不是「按钮行为」阶段**。`disabled` 是 `h('button', {...})` 的实参，在调用 `h` 之前就算完；chip 连第一个 DOM 节点都没建出来，更谈不上「按钮显示成禁用态」。所以观感不可能是「x 点不动」，只能是「什么都没有」。
2. **slot 级 error boundary 的卸载粒度是整个 entry**。框架按 **slot 贡献（entry）** 包裹错误边界，一次 render throw 就让边界把**整个 dock entry** 卸载——wrapper + 全部 chip + remove 按钮一起消失，边界不会「降级渲染半个 dock」，也没有 per-chip / per-button 的细粒度边界。这与技能库中 **DSH-0.1.7-A1-01** 记录的同类事故形态一致：slot 贡献在渲染期抛错 → 边界卸载整个 entry → 用户可见的是**一整个 UI 表面静默消失**，console 里只有一条 minified 错误、网络无任何失败请求。
3. **错误只进 browser console，UI 无任何信号**。没有 banner / toast / 降级占位，普通用户不打开 DevTools 就永远看不到那条 `ReferenceError` → 「静默崩溃」。

于是**错误粒度（一个按钮的 props）与用户可见粒度（整个 entry）完全不同**：一条写在按钮属性上的悬空引用，观感是「dock 整块 vanished」。同时这也解释了另外两条症状——粘贴仍成功（host 的 paste / `props.add` 路径不在这个 entry 上）、`+` attach 按钮仍在（它是 `input.left` 的**独立 entry**，且 `busy` 在其自身作用域内合法）。

---

## 2. 为什么先归咎 v0.2.11 diff 是错的（Bisection）

**要点**：diff 摘要有损且非标准（丢了 v0.2.10 的 `aria-label` 上下文行），不能作为「改了什么」的判据；出厂 v0.2.10 源码已含该行。正确二分 = 回滚到 v0.2.10 复现 / 最小渲染挂载，任一条都能证明崩溃与 v0.2.11 增量无关。

### 2.1 表面误导：diff 看起来「新引入了 `busy`」

`feature.diff` 里 `disabled:` 那一行是 `-`/`+` 成对出现的，`+` 侧带着 `|| busy`：

```
-        disabled: (props.input?.phase ?? 'plain') !== 'plain',
+        disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,
```

只扫 diff 的自然结论是「v0.2.11 的 hover-preview 工作把 `busy` 引进 dock chip → 新功能搞崩了 slot」。这就是**错误的第一个结论**，它的两个支撑都站不住（见 2.2）。

### 2.2 权威证据：抛错行是 v0.2.10 就存在的旧行

1. **出厂源码优先**。`plugin-dock-chips.js` 头部明确标注 `Excerpt of @org/dsh-attach-input v0.2.10 lib/client.js (as shipped)`，fixture:33-34 的注释 `// v0.2.10 hardening pass added the phase guard — and this busy reference:` 后面紧跟 `disabled: ... || busy,   // <-- ???`。**带有明确版本语义的产物**，权重高于一份 diff 摘录。
2. **独立第二来源**。`user-thread.md` 维护者备注同样写明：`In v0.2.10 the same component already had the line ... (added in a hardening pass)`。
3. **diff 摘录本身不可信**。它的 hunk 头是 `@@ function AttachmentChips(props, className) {`——**非标准（语义 diff，不是 git 统一 diff）**；而且上下文里**丢了 v0.2.10 确实存在的那行** `'aria-label': 'Remove ' + (record?.label ?? occurrence.label)`（fixture:32，在 diff 中完全缺席）。一份会丢上下文行的摘录，不能用来证明某行是新增的。⇒ 对 `disabled:` 这一行，diff 只能说明「v0.2.11 重写了这行的写法」，**不能**说明「v0.2.11 引入了 `busy`」。

### 2.3 正确二分（两条都做，任一条即可定性）

- **A. 版本回滚 bisect**：`git checkout v0.2.10`（或 `npm pack @org/dsh-attach-input@0.2.10` 解包后装载）→ 挂载插件 → 粘贴一张截图 → **chip 依旧消失、console 依旧是 `ReferenceError: busy is not defined`**。⇒ 崩溃在**纯 v0.2.10 上独立复现**，v0.2.11 的 hover-preview 增量被排除为主因。随后**逐条 re-add** v0.2.11 的增量（`data-image`、`onClick`、`hover-card`、hoisted `imageItem`），确认每一条都不改变「空 dock / plain 态」这条崩溃路径——其中 hoisted `imageItem` 那一处需要一并修（§3.2）。
- **B. 最小渲染挂载（最快，本报告已做等价验证）**：只把 `AttachmentChips(props, 'dock')` 单独 mount 出来，props 只给 `{ input: { phase: 'plain', occurrences: [{ ref, occurrenceId, label, source }] } }`，**不引入任何 v0.2.11 代码** → 同样抛 `ReferenceError: busy is not defined`（`repro-shortcircuit.mjs` 用例 B/D 即此实验的最小版）。这条直接把「渲染期 + 数据在场」这两个必要条件暴露出来，也是 §4 回归测试的原型。

> 反事实校验：若主因真是 v0.2.11 的新代码，则 A 的纯 v0.2.10 复现**不可能成功**，B 的最小挂载（零 v0.2.11 增量）也**不可能抛**。二者都抛，即证伪。

### 2.4 区分「新功能搞崩 slot」与「旧潜伏缺陷首次被触发」的证据对照

| 证据 | 指向「v0.2.11 新代码引入」 | 指向「v0.2.10 旧潜伏缺陷首次被触发」 |
|---|---|---|
| 抛错表达式在 v0.2.10 **出厂源码**中存在（fixture:34） | — | ✓ |
| v0.2.10 hardening pass 的注释 + 维护者备注（双来源） | — | ✓ |
| diff 的 `+` 行包含 `|| busy` | ✓（表面证据，且被 2.2-3 削弱） | — |
| diff 摘录丢上下文行、hunk 头非标准 → 不可作为「新增」判据 | — | ✓ |
| 纯 v0.2.10 回滚后**仍复现** | ✗（被证伪） | ✓ |
| 零 v0.2.11 增量的最小渲染挂载**仍抛** | ✗（被证伪） | ✓ |
| 崩溃只发生在「有数据 + 特定 phase」的渲染路径（§1.3/1.4） | ✗ | ✓（潜伏型缺陷的签名） |
| `node --check` 全过、插件激活与 slot 注册正常 | — | ✓（运行期缺陷签名） |
| v0.2.11 **首次让该路径被常规触发**（用户为试 hover-preview 去粘图 → 制造 occurrence） | ✓ | ✓ |

**结论**：v0.2.11 改变的是**该崩溃路径被触发的频率与显著性**（用户为了试用 hover preview 而粘贴图片，恰好同时满足「有 occurrence」和「plain 阶段」），而不是**缺陷本身**。v0.2.11 确实还需要补两个加固（§3.3）和修一处自身的作用域问题（§3.2），但**归因必须是旧行**。把热修复发在「回滚 hover-preview」上，会让 chip 依旧消失——因为回滚的是触发条件，不是缺陷。

---

## 3. 修复（Fix）

**要点**：删掉 dock chip 里悬空的 `busy`（或改为显式 prop 作用域化），并把 v0.2.11 提到 map 之外的 `imageItem` 计算挪回回调内；同时补两个加固：`(record?.items ?? []).find(...)` 与 `event.target.closest?.('.remove')`。

### 3.1 主修：去掉悬空引用（v0.2.11.x hotfix）

**首选（删除）**——dock chip 的删除按钮只应由**输入阶段**决定可用性，`busy` 是 `AttachButton` 的局部状态，本来就与 dock 无关：

```js
disabled: (props.input?.phase ?? 'plain') !== 'plain',
```

**备选（正确作用域化）**——若确实想让「正在 add 附件」期间禁止删除，就把状态变成**显式 prop**：`AttachmentChips` 里写 `disabled: (props.input?.phase ?? 'plain') !== 'plain' || props.busy`，由 `AttachmentDock`（或宿主侧状态）把 `busy` 传下来。**绝不要再靠「从 AttachButton 抄一行表达式」**——那正是本次事故的来源。

**明确反对的「伪修复」**：`typeof busy !== 'undefined' && busy` / `busy ?? false` 之类。`typeof` 确实不抛，但它只是把一个显式的 `ReferenceError` 换成一个**恒为 false 的死表达式**，缺陷被永久隐藏而不是被修掉；`busy ?? false` 依旧抛。

### 3.2 顺手修 v0.2.11 diff 自身的作用域 bug

`feature.diff` 把 `imageItem` 的计算**提到了 `occurrences.map()` 回调之外**：

```js
const imageItem = status !== 'missing'
  ? record?.items.find(item => isImagePath(item.path))
  : undefined;                      // status / record 在此位置不可见
return h('div', { className }, ...occurrences.map(occurrence => {
  const record = records.get(occurrence.ref);   // 声明在回调内
  const status = record?.status ?? 'missing';   // 声明在回调内
```

`status` / `record` 都是回调内的 `const`，在函数体顶层位置它们同样是**自由标识符** → 同一类 `ReferenceError`。修法是把这段计算**移进 map 回调内**（每条 occurrence 各自算一次），这同时让下面的 `record?.items ?? []` 加固有意义（否则 `record` 恒为 undefined，`?? []` 永远兜底，等于没测到真实分支）。

### 3.3 两个加固模式（diff 应当一并获得）

1. **`record?.items ?? []` 式防御性读取**
   `record?.items.find(...)` 在 `record` 存在但 `items` 为 `undefined` 时抛 `TypeError: Cannot read properties of undefined (reading 'find')`。改成 `(record?.items ?? []).find(item => isImagePath(item.path))`，把「字段缺失」从**崩溃**降级为「无预览」——语义上正确的降级方向。
2. **可选链的 `event.target.closest?.()`**
   `event.target.closest('.remove')` 在 `event.target` 不是 `Element`（SVG 子节点、文本节点、某些合成事件目标）时 `closest` 为 `undefined` → `TypeError`。写成 `event.target.closest?.('.remove')`，让「target 不是元素」退化为「不拦截」，点击查看器的逻辑照常、删除按钮也照常工作。

**为什么在 slot 组件里是廉价保险**：slot 组件的输入是**宿主组装的、跨版本漂移的、无编译期保证的 props**（`record` 可能是 `'missing'`、可能是旧版本写入的残缺记录；`event.target` 的形态由浏览器和 DOM 结构决定），而它的**失败粒度是整个 entry 被卸载**（§1.5、DSH-0.1.7-A1-01）。一个 `?.` / `??` 的运行期成本约等于 0，换来的是避免一次「整个 UI 表面静默消失 + console 只有一行 minified 错误」的事故。经验规则：**渲染路径上的每一次属性读取，都应按「可能是 undefined」来写。**

---

## 4. 能提前抓住它的回归（Regression）

**要点**：空 dock 在第 23 行 `return null`，永远到不了抛错行，所以空态 smoke 是假阴性；必须补一条「带 occurrence + plain 阶段」的数据在场渲染 smoke，断言 chip DOM 存在且零 error-boundary 捕获。

### 4.1 为什么现有 smoke 抓不到

`plugin-dock-chips.js:23` 的 `if (occurrences.length === 0) return null;` 让**空 dock 用例永远到不了抛错的那一行**（`repro-shortcircuit.mjs` 用例 A 实测：`null (early return)`，不抛）。所以任何形如「挂载 dock 组件 → 断言不抛 / 断言渲染成功」的**空态**用例都是**假阴性**：它通过，不是因为代码对，而是因为代码没被执行。这正是维护者自述的缺口：`We shipped without a render smoke that mounts the dock with a chip present.`

### 4.2 应当补的用例：data-present render smoke

- **挂载对象**：`AttachmentDock(props)`（经 `useRevision()`）或直接 `AttachmentChips(props, 'dock')`，props 用**真实宿主 slot 的形状**。
- **关键 props（必须带数据）**：
  ```js
  { input: { phase: 'plain',
             occurrences: [{ occurrenceId: 'o1', ref: 'r1', label: 'shot.png', source: SOURCE }] },
    remove: vi.fn() }
  ```
  并让 `records` map 里有 `r1` 的记录（分别覆盖 `status: 'missing'` 与有记录两种）。
- **断言**：
  1. **chip 元素渲染出来**：输出树里存在 `.chip` / `[data-status]` / `.name` 文本 `shot.png` / `.remove` 按钮（即 DOM 标记存在）；
  2. **零 error-boundary 捕获**：spy `console.error`（React 会把 boundary 捕获到的错误打到 console）断言 **0 条** `slot entry crashed` / 无任何 throw；或在测试里挂一个真实 boundary、断言 fallback 未被渲染。**这一条是核心**——它是唯一能区分「渲染成功」与「渲染抛错但被吞掉」的断言；
  3. `.remove` 的 `disabled` 为 `false`，触发 `onClick` 后 `props.remove(occurrence)` 被调用一次；
  4. v0.2.11 增量一并覆盖：图片路径的 occurrence 断言 `data-image === '1'`、`.hover-card > img` 存在；点击落在 `.remove` 上被拦截（不打开查看器）、落在 chip 主体上调用 `openImageViewer`。
- **不需要浏览器**：纯 node + 一个收集 `h()` 输出的假渲染器（如本报告的 `repro-shortcircuit.mjs`）就足以触发渲染期 `ReferenceError`——SSR / 测试渲染器不会静默吞掉它。`react-dom/server` 的 `renderToString` 亦可。

### 4.3 companion 用例（把 `||` 的两侧都钉住，防止回归成另一极端）

- **空 dock**：断言返回 `null`（保留早退行为，同时防止有人「顺手」把早退改成渲染空容器后引入新问题）；
- **锁定阶段**：`phase: 'busy'` + 有 occurrence → 断言 chip 渲染且 `.remove` 的 `disabled === true`。**这条专门走 `||` 左操作数为真的静默路径**（潜伏期之所以没被发现的分支），必须显式钉住，否则短路会继续掩盖同类缺陷；
- **props 缺失**：不传 `input` → 断言不抛、返回 `null`（`??` 兜底路径）。

**一句话**：只要有一条用例把「**有数据 + plain 阶段**」这个组合跑一遍、并断言**零 boundary 捕获**，这条 `ReferenceError` 在 **v0.2.10 hardening pass 当天**就会被抓住，根本活不到 v0.2.11。

---

## 5. 发布流程教训（Release process）

**要点**：`node --check` 只验证语法（实测 exit 0），而本缺陷是渲染期、数据依赖的运行期标识符解析失败；slot-rendering lib-only 插件的 pre-ship 下限 = `no-undef`/`tsc --checkJs` 静态门 + 每个 slot 组件一条数据在场的渲染 smoke（含零 boundary 断言）。

### 5.1 为什么「syntax check only」不够

本报告实测 `node --check fixture/plugin-dock-chips.js` → **exit 0**（见附录 A）。它证明的是「这份文件能被解析」，而本缺陷的性质是：

| 层面 | 是否被 `node --check` 覆盖 | 实际结果 |
|---|---|---|
| 语法合法性 | ✓ | 通过（自由标识符在语法上完全合法） |
| 模块能否加载 / 能否 import | ✗ | 通过（`busy` 在函数体内，不在顶层，加载期不求值） |
| 插件能否激活、slot 能否注册 | ✗ | 通过（注册路径不碰这行） |
| **带数据渲染是否抛错** | ✗ | **失败**（§1.3 用例 B/D） |

对一个 **lib-only** 插件（只有客户端渲染代码、没有可执行入口、没有构建期类型检查、没有服务端启动路径可冒烟）来说，`node --check` 甚至连「能不能 import」都不覆盖，更不可能覆盖「带数据渲染会不会炸」。**它证明了 0 件关于运行时的事**，却在 CI 里给出了一盏绿灯——这就是「发布前全绿、上线即崩」的机制。更糟的是，这个缺陷的失败信号还被 error boundary 吞成一行 console 输出，**连运行时也没有任何显式失败**，所以「人工点一下看看」同样抓不到。

### 5.2 slot-rendering lib-only 插件的最小可行 pre-ship 检查

按性价比排序，前两条是下限：

1. **静态未定义标识符门（最便宜，可在写代码当天就报警）**
   - 给 `lib/` 配 ESLint（`env`/`globals` 覆盖 React 与宿主全局）并打开 `no-undef`；或
   - 零配置方案：`tsc --checkJs --noEmit --allowJs lib/` —— JS 文件里的 `busy` 会直接报 `TS2304: Cannot find name 'busy'`。
   本事故是**复制粘贴**造成的（§1.2），这一类缺陷在 lint 门前的拦截率接近 100%，成本约等于一条 CI 行。
2. **数据在场的渲染 smoke（必须项）**
   - 对**每一个注册进 slot 的渲染组件**，用**非空、真实形状**的 props 挂载一次；
   - 断言三件套（对齐 DSH-0.1.7-A1-01 的验证要求）：**目标表面的 DOM 标记存在** + **零 `slot entry crashed` console 记录** + **关键请求/回调发生**。该卡明确指出：只做「CSS 加载了 / 没有报错」这类检查存在**假阴性**——本次事故就是这句话的完美反例（DOM 标记恰好「不存在」，而这正是要断言的东西）。
   - 空态用例**不计入覆盖**（§4.1）。
3. **每条早退 / 短路分支各补一条用例**：`return null` 的空态、锁定阶段、props 缺失——把 `||` 与 `??` 的**两侧**都钉住，避免短路继续掩盖同类缺陷（§4.3）。
4. **（有浏览器时）slot entry 冒烟**：driven browser 里挂 profile，断言目标 slot 的 DOM 标记存在 + console 无 `slot entry crashed`。没有浏览器时，第 2 条用假渲染器 / `renderToString` 即可，成本同样极低。

**一句话**：`node --check` 证明「能解析」，不证明「能渲染」。对 slot-rendering lib-only 插件，pre-ship 下限 = **`no-undef` / `tsc --checkJs` 静态门 + 每个 slot 组件一条「数据在场」的渲染 smoke（含零 error-boundary 断言）**；两者合计几分钟的 CI 时间，换掉的是「整块 UI 静默消失、只在 console 留一行 minified 错误、用户无从反馈」的整类事故。

---

## 附录 A · 证据与命令清单

**读取过的证据文件（全部只读，`fixture/` 未做任何修改/删除/复制）**

| 文件 | 用途 |
|---|---|
| `fixture/README.md` | 证据包说明（只读 fixture，要求相对 git HEAD 不变） |
| `fixture/plugin-dock-chips.js` | v0.2.10 出厂源码摘录：`AttachButton`（`busy` 的归属，:7/:17）、`AttachmentChips`（抛错行 :34、早退 :23）、`AttachmentDock`（:40-43） |
| `fixture/feature.diff` | v0.2.11 hover-preview diff（语义 diff 格式、丢 `aria-label` 上下文行） |
| `fixture/user-thread.md` | 用户报告 + 维护者备注（slot error boundary 语义、缺渲染 smoke 的自述） |

**读取过的技能文件（只读，用于引用要点）**

- `skills/plugin-upgrade/SKILL.md`（Mode A 只读纪律、`Validation and reporting` 的分层校验：Static 层含 build/typecheck/plugin tests，Runtime 层含真实挂载与「注册/挂载被证明」而非裸 HTTP 200）
- `skills/plugin-upgrade/references/v0.1.7-alpha.1.md`（DSH-0.1.7-A1-01，slot entry 静默消失与三件套验证）
- `skills/plugin-upgrade/references/troubleshooting.md`（症状 → 根因 → 卡片查表；本症状不在表内，按其指引回到前置 touchpoint 与分层校验逐层排查）

**运行过的命令（均为只读/自包含，无安装、无迁移、无网络）**

| 命令 | 目标 | 结果 |
|---|---|---|
| `node --check fixture/plugin-dock-chips.js` | fixture 出厂源码 | **exit 0**（语法合法 → 证明本缺陷不是语法问题，§5.1） |
| `node agent-output/S15-slot-error-boundary-crash/repro-shortcircuit.mjs` | 自写的等价复现脚本（fixture:21-37 表达式原样抽出） | 5 个用例：A 空 dock `null`；B 有 chip+plain **THROWS ReferenceError: busy is not defined**；C 有 chip+busy 渲染成功（短路）；D 无 phase 键 **THROWS**；E `input` 缺失 `null` |

复现脚本保留在 `agent-output/S15-slot-error-boundary-crash/repro-shortcircuit.mjs`，可重复执行复核。

## 附录 B · 引用的技能要点（card ID + 要点，非全文）

- **DSH-0.1.7-A1-01**（`references/v0.1.7-alpha.1.md`）· 客户端 UI primitives 图标 `*16` 导出全数移除。**要点**：slot 贡献在渲染期抛错（React #130）时，框架的 **slot 级 error boundary 会卸载整个 slot entry**，用户可见症状是**一整个表面（dock、header widget）静默消失**，console 只有一条 minified 错误、网络无任何失败请求；真实案例是输入 dock 的常驻进度条整体消失。**验证要求三件套**：目标表面的 DOM 标记存在 + 零 `slot entry crashed` console 记录 + 预期网络请求发生；并明确指出「只做 CSS 加载/无报错」的检查存在**假阴性**。→ 本报告 §1.5（症状为何是整块 dock 消失、错误只在 console）、§4.2 与 §5.2（三件套验证与假阴性教训）直接沿用该卡。
- **`references/troubleshooting.md`** · 症状 → 根因 → 卡片查表。**要点**：该表是快速索引而非完整故障目录；**未列出的症状要回到前置 touchpoint 与分层校验逐层排查**，「面板/悬浮球静默消失且无任何报错」一族即按此路径处理。→ 本症状（渲染期 ReferenceError 导致 slot entry 消失）不在表内，故按该指引回到「静态 → 运行时 → 行为」分层校验定位（§5.2）。
- **`SKILL.md` `Validation and reporting`** · **要点**：Static 层必须含 **build / typecheck / plugin tests**（而非仅语法检查）；Runtime 层要求真实挂载并**证明注册/挂载发生**，不接受裸的「无报错」。→ 本报告 §5.1/§5.2 的「最小可行 pre-ship 检查」即按此分层给出下限。
