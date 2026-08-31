# profile 依赖管理配方

> 承接 [../SKILL.md](../SKILL.md) 的发布轨选择。本文覆盖把插件装进/更新进 `$DSH_HOME/profiles/*` 时的
> 依赖解析事实与操作配方，取自 17 个插件仓库三个版本台阶的连续迁移（rc.2 → alpha.1 → alpha.2）。技术性迁移坑
> （tsbuildinfo、oxc 解析等）见 [migration-hygiene](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/blob/main/skills/plugin-upgrade/references/migration-hygiene.md)，
> 本文不重复。

## 1. 两种安装轨的解析事实

| 声明 | 解析行为 | 适用 |
|---|---|---|
| `link:<绝对路径>` | 直接目录联接/软链到本地目录；不产生版本解析 | 本地开发、批量迁移期间 |
| `github:owner/repo` | 解析默认分支 HEAD，锁文件记录 源码打包地址（codeload）的精确 commit | 发布安装、消费者侧 |

同一 profile 里两种轨可以混用；改名、迁移或收尾时按下面各条处理。

## 2. github 依赖的锁缓存坑：`Already up to date` 不代表拿到了新提交

**症状**：远端已推送新提交，`pnpm install` 输出 `Already up to date`，锁文件里的 codeload URL 仍是旧
commit；启动加载的仍是旧代码。

**原因**：pnpm 对 github 依赖缓存了 HEAD 解析；常规 `install` 不重解析。

**处置**：

```sh
# 强制重新解析 github 依赖（web / headless 两个 profile 分别执行）
cd "$DSH_HOME/profiles/web" && pnpm update <pkg>
# 验证锁文件里的 commit 等于期望 HEAD
grep 'codeload.*<pkg>' pnpm-lock.yaml   # 应为 tar.gz/<40位commit>
```

批量迁移收尾时对每个 github 轨依赖做一次 `pnpm update`，再核对 commit。

## 3. 插件 npm 包改名（包名前缀变更）的三处同步

包名从 `@deepseek-ai/dsh-x` 改为 `@org/dsh-x` 时，以下三处必须一致，否则 Loader 解析失败：

1. profile `package.json` 的 dependencies key（安装名）；
2. profile `dsh.profile.bundles` 条目（bundle 名）；
3. 插件自身 `cordis.patch.yml` 里的行 `name`。

**残留清理**：改名后 `pnpm install` 可能保留旧名字的目录联接（新旧两个目录并存）。确认锁文件只剩新名
后，手动删除 `node_modules/@旧前缀/旧包名` 的残留目录。

## 4. 共享回退 node_modules 与目录联接的更新语义

- profile 自身的 `node_modules` 只含 profile 声明依赖；bare 行名解析不到时回退到共享的
  `$DSH_HOME/profiles/node_modules`（里面是 app 与各 bundle 声明依赖的副本）。
- 目录联接指向本地工作区包时，**工作区源码更新后重启 dsh 即生效**；host 半段改动必须重启，
  client 半段才可能硬刷新（见 [migration-hygiene](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/blob/main/skills/plugin-upgrade/references/migration-hygiene.md) 第 3 条）。
- profile 根 `cordis.yml` 会在 boot 时被重写为 `[]`（组合事实在 patch 层）——**不要手改它**，改
  `cordis.patch.yml`。

## 5. 宿主 tag 升级后的 profile 联动顺序

1. checkout 检出精确 tag → `pnpm install` → `pnpm run clean` → `pnpm run build`（clean 排除
   tsbuildinfo 假阳性）；
2. 批量插件迁移完成并推送到各自仓库后，回到 profile：`pnpm update` 重解析 github 安装轨依赖；
3. `dsh --profile <p> --dump-config` 核对行集；
4. 真实冷启动：目标 tag 的 dsh 起来后，插件清单（pluginInventory）里本插件 entry `active`、
   无 `pending`。

## 6. 自建通道的无浏览器认证冒烟

0.1.2-alpha.1 起 dsh web 使用 bootstrap token + 签名 Cookie 认证（见
[A1-08 认证模型](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/blob/main/skills/plugin-upgrade/references/v0.1.2-alpha.1.md)）。
插件自建了 HTTP/RPC 通道（如 `/tariff/status`）时，发布前用下面流程证明「通道确实挂在统一认证后面」，
不依赖浏览器/Playwright。已知行为：token 在同一进程可重复兑换、重启才轮换；自建 route 必须经
`connection` 注册才会自动继承认证，裸 `ctx.webServer.register()` 不继承。

PowerShell（自带 Cookie 容器）：

```powershell
# 1. 从启动输出抓认证 URL：dsh web: http://127.0.0.1:3190/?token=<T>
# 2. 兑换 Cookie
$sess = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Invoke-WebRequest "http://127.0.0.1:3190/?token=$token" -WebSession $sess -UseBasicParsing
# 3. 带会话调用自建通道 → 断言 200
$body = @{ type = 'client-request'; rpcId = 'smoke'; method = 'status'; payload = $null } | ConvertTo-Json
Invoke-WebRequest 'http://127.0.0.1:3190/tariff/status' -Method POST -ContentType 'application/json' -Body $body -WebSession $sess
# 4. 无认证重发 → 断言 401（证明通道受保护）
Invoke-WebRequest 'http://127.0.0.1:3190/tariff/status' -Method POST -ContentType 'application/json' -Body $body
```

curl 等价（`-c/-b` cookie jar）：

```sh
curl -s -c jar.txt "http://127.0.0.1:3190/?token=$TOKEN" >/dev/null      # 兑换 Cookie（303→/）
curl -s -b jar.txt -X POST -H 'content-type: application/json' \
  -d '{"type":"client-request","rpcId":"smoke","method":"status","payload":null}' \
  http://127.0.0.1:3190/tariff/status        # 期望 200
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  http://127.0.0.1:3190/tariff/status        # 期望 401
```

## 7. 验证清单

- [ ] 锁文件里每个 github 依赖的 commit 等于期望 HEAD；
- [ ] 改名插件在锁文件、bundles 列表、cordis.patch.yml 三处同名，旧目录联接已清理；
- [ ] `--dump-config` 行集符合预期；
- [ ] 真实冷启动 entry active；
- [ ] 自建通道认证冒烟：无认证 401、兑换 Cookie 后 200（第 6 节流程）。
