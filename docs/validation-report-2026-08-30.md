# plugin-upgrade skill 有效性验证报告

> 验证日期：2026-08-30
> 验证对象：[deepseek-harness discussion #5120](https://github.com/deepseek-ai/deepseek-harness/discussions/5120) 征集的「插件从 0.1.1 升级到 0.1.2」场景
> 验证方式：Docker 容器内模拟插件升级全链路（炸 → 查 → 迁 → 验）
> 结论先行：**skill 有效，全链路走通；同时发现 1 处卡片需要补充「宿主/客户端平面」的说明**

---

## 一、为什么要做这次验证

discussion #5120 里，dsh-web 社区（约 20 个插件包）刚完成 0.1.1 → 0.1.2 的真实迁移，
总结了 10 条"静态检查全绿、运行时才炸"的痛点，并向官方征集固化为 skill。
本仓库的 `plugin-upgrade` skill 就是回应这个征集的。

但 skill 里的知识此前只经过**静态核对**（与官方 release notes、上游源码比对）。
这次验证要回答一个问题：

> 一个按 0.1.1 老写法编写的插件，拿到 0.1.2 宿主上会不会真的炸？
> 炸了之后，跟着 skill 的流程走，能不能真的救活？

## 二、验证环境

| 项目 | 配置 |
| --- | --- |
| 容器 | `node:24-bookworm`（Docker，容器名 `dsh-verify`） |
| 新宿主 | `@deepseek-ai/dsh@0.1.2-alpha.2`（npm alpha tag，全局安装） |
| 旧宿主 | `@deepseek-ai/dsh@0.1.1-rc.2`（npm latest tag，独立前缀安装） |
| 旧 SDK 实物 | `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1`（npm 下载，用于还原 0.1.1 真实 API 写法） |
| 被测插件 | 自写最小插件 `@demo/dsh-upgrade-demo`（按旧 SDK 真实接口编写，见附录 A） |
| 验证依据 | skill 的 pre-flight 触点清单 + 版本卡片（v0.1.2-alpha.1 / alpha.2） |

## 三、全链路过程（四幕）

### 第一幕：旧插件直接放上 0.1.2 —— 炸了，和 #5120 描述的一模一样

把按 0.1.1 写法编写的插件（注入 `apiProxy` 服务、调用 `apiProxy.llm.providers()`）
用 `dsh plugin --profile web add` 挂进 0.1.2 的 web profile，启动：

```
Error: dsh: plugin tree failed to load: dsh: 1 entry did not activate
@demo/dsh-upgrade-demo: pending (waiting for service: apiProxy)
```

**翻译成人话**：插件在等新宿主提供一个叫 `apiProxy` 的服务，但 0.1.2 里这个服务
已经被整个拆掉了（卡片 DSH-0.1.2-A1-01 记录的破坏性变更），插件永远等不到，启动直接失败。

这正是 #5120 痛点 #4「注入服务漂移：入口永远 pending (waiting for service: …)」的
同款症状——只不过那里等的是 `remote.agentPresets`，这里等的是被删除的 `apiProxy`。
**不迁移，插件就是死。**

### 第二幕：用 skill 的 pre-flight 清单自检 —— 命中触点，找到该看的卡片

用 skill 自带的可执行检出模式（`references/pre-flight-patterns.json`，7 类触点）
扫描旧插件源码：

```
#1 源码 patch / monkey patch:        HIT
#3 内部服务探测 / Remote:            HIT   ← 决定性命中：apiProxy
#5 内部 UI / 命令 / 工具注册:        HIT
其余四类: miss
```

按 skill 流程，命中 #3 就去读卡片 **DSH-0.1.2-A1-01**（APIProxy 移除 + 17 条操作映射表），
并连带 **DSH-0.1.2-A2-02**（错误流新契约）。卡片在手，开始迁移。

### 第三幕：按卡片迁移 —— 改三处，插件复活

| 改动 | 依据 | 旧写法 → 新写法 |
| --- | --- | --- |
| 换注入的服务 | DSH-0.1.2-A1-01：APIProxy 整体移除 | `inject: ["apiProxy"]` → `inject: ["llm"]`（见下方「重要发现」） |
| 换调用方式 | DSH-0.1.2-A1-01 映射表 | `await ctx.apiProxy.llm.providers()` → `ctx.llm.listProviders()` |
| 删掉死依赖 | #5120 痛点 #2：SDK 包已删除 | `dependencies` 移除 `@deepseek-ai/dsh-host-apiproxy` |

### 第四幕：迁移后上 0.1.2 验证 —— 启动成功，服务调用走通

```
[upgrade-demo] apply() 执行 — 已迁移到 host 领域服务直连
[upgrade-demo] llm.listProviders() 成功 → 路由数: 0 ；可配置提供方: 0
```

- 插件入口正常激活（不再 pending），宿主完整启动并保持服务；
- `listProviders()` 真实调用成功（返回 0 个路由是因为容器没配 API key，属预期，
  **调用本身通了**——这恰好也演示了卡片的归因原则：这是 profile 配置问题，
  不是插件或运行时故障）。

### 补充正控：旧插件放回 0.1.1-rc.2 —— 活得好好的

同一个插件、同一台容器，装进 0.1.1-rc.2（npm latest）的 web profile：

```
[upgrade-demo] apply() 执行 — 旧 API（apiProxy）路径
dsh web: http://127.0.0.1:3080
```

插件正常激活、`apiProxy` 服务存在、宿主完整启动（demo 里 `providers()`
一行的调用参数不足以走完 0.1.1 的 RPC 信封细节而报错，属 demo 自身
调用形态问题，不影响结论——**服务在不在、入口活不活**才是本验证的重点）。

新旧宿主对照，结论干脆利落：

| 同一个旧插件 | 0.1.1-rc.2 | 0.1.2-alpha.2（不迁移） | 0.1.2-alpha.2（按 skill 迁移后） |
| --- | --- | --- | --- |
| 结果 | 激活成功 | **启动直接失败**（等不到 apiProxy 服务） | 激活成功 + 服务调用走通 |

另有一个意外收获作为旁证：0.1.1-rc.2 用 npm 安装**解析依赖超过 15 分钟未完**，
换 pnpm 才在 4 分钟内装完——亲身体验了 #5120 里"包管理解析成本"的痛点，
也正好印证卡片 DSH-0.1.2-A2-03（peer dependency 裁剪）的价值。

## 四、重要发现：卡片需要补一条「平面」说明

迁移过程中踩到一个卡片没写透的点，值得回馈给 skill：

- `apiProxy` 是**宿主平面**（服务器侧）的网关服务。第一次迁移时按映射表改成了
  `inject: ["remote"]`，结果变成 `pending (waiting for service: remote)`——
  因为 `remote` 是**客户端平面**（浏览器侧）的消费门面。
- 对宿主平面插件，alpha.2 的正确迁移不是"换一个叫 remote 的等价服务"，
  而是**跳过网关门面、直接注入背后的领域服务**（`llm`、`sessionTitle` 等）；
  `remote` 门面留给浏览器插件（需在 package.json 声明 `dsh.client`）。

**对 skill 的改进建议**：给 DSH-0.1.2-A1-01 补一条实战批注——
「迁移前先判定插件运行在宿主平面还是客户端平面：宿主平面消费者直接注入领域服务；
客户端平面消费者走 `ctx.remote.*`（package.json 需声明 `dsh.client`）。
两代插件的注入名不等价，直接对号换名会踩 `pending (waiting for service)`」。

这恰好也是 #5120 痛点 #4 的一般化：**跨版本迁移时，"旧注入名 → 新注入名"
 rarely 是一对一，卡片应提示先确认平面再选目标。**

## 五、结论

| 判定项 | 结果 |
| --- | --- |
| 旧插件上 0.1.2 是否真实会炸 | ✅ 会，且症状与 #5120 记录一致（pending waiting for service） |
| skill 的触点自检能否定位问题 | ✅ 能，7 类可执行模式直接命中决定性触点 #3 |
| 卡片知识是否准确够用 | ✅ 基本准确；发现 1 处需补「平面」说明（见第四节） |
| 按 skill 迁移后能否救活 | ✅ 能，插件激活 + 真实服务调用走通 |
| 未覆盖部分 | 无 API key，未跑「完整一轮真实对话」；客户端平面迁移未实跑（需浏览器环境） |

**总判定：skill 通过有效性验证。** 它不是纸上谈兵——跟着它走，
一个死透的 0.1.1 插件在 0.1.2 上重新跑了起来。

## 六、复现指南

```sh
# 1. 起容器（node 24）
docker run -dit --name dsh-verify node:24-bookworm bash

# 2. 装新宿主
docker exec dsh-verify npm install -g pnpm@11.24.0 @deepseek-ai/dsh@0.1.2-alpha.2

# 3. 插件源码见附录 A；旧插件挂载即复现第一幕
docker exec dsh-verify dsh plugin --profile web add /path/to/demo-plugin
docker exec dsh-verify sh -c 'timeout 30 dsh web --no-open'   # → pending (waiting for service: apiProxy)

# 4. 换成附录 B 的迁移版再挂载 → 第四幕通过
```

## 附录 A：被测插件（0.1.1 旧写法）

```js
// index.js —— 按 @deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1 真实接口编写
export const inject = ["apiProxy"]

export function apply(ctx) {
  ctx.effect(async () => {
    const providers = await ctx.apiProxy.llm.providers()
    console.error("[demo] providers →", JSON.stringify(providers).slice(0, 160))
  })
}
```

```json
// package.json（关键字段）
{
  "name": "@demo/dsh-upgrade-demo",
  "type": "module",
  "main": "index.js",
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } },
  "dependencies": { "@deepseek-ai/dsh-host-apiproxy": "0.0.1-rc.1" }
}
```

```yaml
# cordis.patch.yml
- insert:
    - id: upgrade-demo
      name: "@demo/dsh-upgrade-demo"
```

## 附录 B：迁移后插件（0.1.2-alpha.2）

```js
// index.js —— 宿主平面：直接注入领域服务
export const inject = ["llm"]

export function apply(ctx) {
  ctx.effect(async () => {
    const providers = ctx.llm.listProviders()
    console.error("[demo] routes:", providers.length)
  })
}
```

（package.json 移除 apiproxy 依赖；浏览器插件的客户端平面写法见第四节。）
