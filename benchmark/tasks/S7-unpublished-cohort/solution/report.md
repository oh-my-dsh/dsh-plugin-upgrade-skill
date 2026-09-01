# S7 未发布 cohort 安装与类型基线方案

分析对象：`/app/fixture/`（package.json、README.md）。只读分析，未执行安装。

## 1. 声明的真实后果

`@deepseek-ai/*` 在 npm 只有 0.1.1-rc.1 / 0.1.1-rc.2 / 0.1.2-alpha.2，
`0.1.2-alpha.1` **从未发布**（先 `npm view @deepseek-ai/dsh-llm versions`
查证，不凭 dist-tag 或根包可用推断内部包可用）。

`^0.1.2-alpha.1` 的 caret 范围按 semver 展开为 `>=0.1.2-alpha.1 <0.2.0-0`，
**会静默解析到已发布的 `0.1.2-alpha.2`**——安装不报错，坏的是声明与解析
结果的背离：装到的是 alpha.2 而非声明的 alpha.1，类型基线随 registry 内容
漂移，且 alpha 系列不承诺兼容。

## 2. 方案（两条路径，各有取舍）

**路径 A（保留 alpha.1 目标）**：从官方 tag（精确 `dsh-v0.1.2-alpha.1`）检出
构建 + `pnpm pack`，用 `overrides` 钉 `file:` tarball，manifest range 写
`^0.1.2-alpha.2`；未来正式发布后删除 overrides 段回到 registry 解析。

**路径 B（改钉已发布版本）**：把 devDependencies 精确 pin 到 `0.1.2-alpha.2`
（去掉 caret），提交 lockfile 并用 `npm ci`（或 `pnpm ci`）保证可复现，加
`tsc --noEmit` 类型门禁；显式声明"alpha.1 从未被验证过"的语义缺口。

## 3. 纪律

不切换包管理器、不混用 npm/pnpm；不把所有 `0.1.2-alpha.*` 一概描述成 404；
目标换已发布版本时按 dist-tag 与镜像核对安装通道。
