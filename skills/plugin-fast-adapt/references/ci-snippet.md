# 插件仓 CI 门禁模板（plugin-gate）

给自己的 DSH 插件仓库把「升级后插件报错」从运行时提前到提交时。三道门里两硬一软：

- **冒烟（硬门）**：`quick-smoke.mjs` 失败即红——模块加载、apply 契约、工具注册、未声明 `inject` 的契约拦截全在毫秒级跑完，零依赖，clone 即用。
- **typecheck（硬门）**：插件自有的 `typecheck` script，红了连编译都过不了，谈不上适配。
- **四维体检（软门，不判红）**：`plugin-audit.mjs` 只出报告不设及格线——与 write-gate 的「软指标不越权」同一原则，分数替用户判「合格」就是把裁量题伪装成判定题。

**官方指南扫描为什么不在 CI 里**：code-scan 需要本机宿主安装与指南缓存做实测核查，CI 环境两者皆无，强行跑只会得到「诚实跳过」。破坏性变更核查在本地跑 `run.mjs`（见主 SKILL.md），那才是它的主场。

把下面的 workflow 存进插件仓 `.github/workflows/plugin-gate.yml`，按需增删（`pnpm`/`npm`、有无 build 步骤）：

```yaml
name: plugin-gate
on:
  push:
    branches: [main]
  pull_request:
jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: pnpm install --frozen-lockfile   # npm 仓改 npm ci
      - run: pnpm run build                    # 有构建产物的插件才保留这行
      - run: pnpm run typecheck                # 硬门：插件自有 typecheck script
      - name: 拉取 plugin-fast-adapt（零依赖，clone 即用）
        run: git clone --depth 1 https://github.com/taxueseek/plugin-fast-adapt.git ../plugin-fast-adapt
      - name: 冒烟（硬门：加载/apply/工具注册/未声明 inject 拦截）
        run: node ../plugin-fast-adapt/scripts/quick-smoke.mjs .
      - name: 四维体检（软门：只出报告不判红）
        run: node ../plugin-fast-adapt/scripts/plugin-audit.mjs .
```

注意事项：

- `quick-smoke` 会执行插件入口代码（内存级 Mock），只对自己的仓库跑，这是它一贯的安全边界。
- 体检报告在 Actions 日志里看四维分数与 MEDIUM 清单；要不要把某维分数设成硬线，是仓库主人的裁量，模板不替你定。
- 插件若依赖构建产物（`lib/`/`dist/`），冒烟前必须先 build，否则入口产物不存在直接红。
