# 上游来源与无简化边界

- 上游：[`zhu1090093659/dsh-web`](https://github.com/zhu1090093659/dsh-web)
- 初始tag：[`v0.3.8`](https://github.com/zhu1090093659/dsh-web/tree/v0.3.8)，commit
  `fa6d2a47302a2979c79bbd52a6318c98bad0f564`
- 目标tag：[`v0.3.9`](https://github.com/zhu1090093659/dsh-web/tree/v0.3.9)，commit
  `8b0191fea221c692e71f88abc51ce8146b32aa0d`
- 许可证：Apache-2.0；fixture保留上游`LICENSE`

兼容提交由上游release note和架构记录交叉确认：`319f141d`、`3d2db622`、`f0f19337`、
`5b1ea6c6`、`8b780b65`。完整tag之间还有市场、移动端和社区索引等无关改动，它们不属于
本题答案。

`refresh-from-upstream.mjs`从两个解压后的官方tag归档重建题目。它会：

1. 逐字复制v0.3.8的`packages/`、`scripts/`、`shared/`、`tests/`、`patches/`代码/config/test文本及相关根配置；
2. 排除Markdown，避免父仓库把上游文档链接误判为本仓库链接；
3. 仅在证明两个tag的二进制包资产SHA-256相同后排除这些资产；
4. 从v0.3.9逐字复制兼容提交触及的runtime/build/test目标文件；
5. 生成初始态和Oracle目标态逐文件SHA-256清单。

```sh
node benchmark/tasks/H9-dsh-web-alpha2/provenance/refresh-from-upstream.mjs \
  /path/to/dsh-web-v0.3.8 \
  /path/to/dsh-web-v0.3.9
```

上述入题面内只去掉未变化二进制和文档，不缩短任何被测源文件、不改包名、不造mock插件、
不把13个consumer折叠为单一示例。根`patches/`也完整保留，因为它参与真实pnpm安装；
省略该目录会让上游声明的`patchedDependencies`在构建前直接失败。

题目边界是上述五个兼容提交涉及的插件workspace，而不是整个GitHub仓库归档：独立的
`market/`应用、`.agents/`/`.dsh/`说明和未被这些提交触及的仓库治理workflow不参与
兼容实现，既不复制进fixture，也不允许作为答案。边界内所有代码/config/test均逐字取自
对应tag；`COMPATIBILITY_PATHS`中的66个文件和1个删除是唯一Oracle变更集。
