# profile 依赖管理配方

> 承接 [../SKILL.md](../SKILL.md) 的发布轨选择。本文覆盖把插件装进/更新进 `$DSH_HOME/profiles/*` 时的
> 依赖解析事实与操作配方，取自 17 个插件仓库三轮真实迁移（rc.2 → alpha.1 → alpha.2）。技术性迁移坑
> （tsbuildinfo、oxc 解析等）见 [migration-hygiene](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/blob/main/skills/plugin-upgrade/references/migration-hygiene.md)，
> 本文不重复。

## 1. 两种安装轨的解析事实

| 声明 | 解析行为 | 适用 |
|---|---|---|
| `link:<绝对路径>` | 直接 junction/软链到本地目录；不产生版本解析 | 本地开发、批量迁移期间 |
| `github:owner/repo` | 解析默认分支 HEAD，锁文件记录 codeload tarball 的精确 commit | 发布安装、消费者侧 |

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

## 3. 插件 npm 包改名（scope 变更）的三处同步

包名从 `@deepseek-ai/dsh-x` 改为 `@org/dsh-x` 时，以下三处必须一致，否则 Loader 解析失败：

1. profile `package.json` 的 dependencies key（安装名）；
2. profile `dsh.profile.bundles` 条目（bundle 名）；
3. 插件自身 `cordis.patch.yml` 里的行 `name`。

**残留清理**：改名后 `pnpm install` 可能保留旧名字的 junction（新旧两个目录并存）。确认锁文件只剩新名
后，手动删除 `node_modules/@旧scope/旧包名` 的残留目录。

## 4. healed 回退镜像与 junction 更新语义

- profile 自身的 `node_modules` 只含 profile 声明依赖；bare 行名解析不到时回退到共享的
  `$DSH_HOME/profiles/node_modules`（镜像 app 与各 bundle 的声明依赖）。
- junction 指向本地工作区包时，**工作区源码更新后重启 dsh 即生效**；host 半段改动必须重启，
  client 半段才可能硬刷新（见 [migration-hygiene](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/blob/main/skills/plugin-upgrade/references/migration-hygiene.md) 第 3 条）。
- profile 根 `cordis.yml` 会在 boot 时被重写为 `[]`（组合事实在 patch 层）——**不要手改它**，改
  `cordis.patch.yml`。

## 5. 宿主 tag 升级后的 profile 联动顺序

1. checkout 检出精确 tag → `pnpm install` → `pnpm run clean` → `pnpm run build`（clean 排除
   tsbuildinfo 假阳性）；
2. 批量插件迁移完成并推送到各自仓库后，回到 profile：`pnpm update` 重解析 github 轨依赖；
3. `dsh --profile <p> --dump-config` 核对行集；
4. 真实冷启动：目标 tag 的 dsh 起来后，插件清单（pluginInventory）里本插件 entry `active`、
   无 `pending`。

## 6. 验证清单

- [ ] 锁文件里每个 github 依赖的 commit 等于期望 HEAD；
- [ ] 改名插件在锁文件、bundles 列表、cordis.patch.yml 三处同名，旧 junction 已清理；
- [ ] `--dump-config` 行集符合预期；
- [ ] 真实冷启动 entry active；自建通道按 [A1-08 认证模型](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/blob/main/skills/plugin-upgrade/references/v0.1.2-alpha.1.md) 冒烟
      （有 token 200 / 无认证 401）。
