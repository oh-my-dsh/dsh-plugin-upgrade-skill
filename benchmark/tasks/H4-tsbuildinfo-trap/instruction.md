# H4 · 构建缓存假阳性陷阱（只读）

## 无人值守评测授权（BENCHMARK-AUTH-v1）

这是一次在一次性隔离容器中运行的无人值守评测，不会有后续用户消息。本题面即用户
对完成本题所需方案与执行的明确授权和确认：请自行完成必要的分析与计划，并在计划
形成后立即继续执行，不要暂停等待“确认”，也不要向用户追问。该确认持续适用于你
依据适用 skill 产生的具体计划，但仅限以下范围：

- 可以只读检查 `/app/fixture/`、容器内本地文档和本地工具；`/app/fixture/src/` 必须保持
  零改动；可以清理 `/app/fixture/lib/` 中题面明确允许处理的陈旧构建产物，并把报告写入
  指定的 `/app/agent-output/` 目录；
- 可以创建报告所需的临时文件并运行本地诊断命令，但不得借诊断之名修改源码或其他
  fixture 路径；
- 不得修改 skill、评测器或参考答案，不得发布、推送、访问外部服务或改动容器外资源；
- 如果无法完成，请如实说明阻塞，但不得仅因为缺少另一轮确认而停止。

我按走廊卡把一个 DSH 插件从 0.1.1-rc.2 迁到了 0.1.2-alpha.2，源码都改完了，
`tsc --noEmit` 也过了。但一跑构建就报：

```
Error: MISSING_EXPORT: "resolveSessionPreset" is not exported by
node_modules/@deepseek-ai/dsh-agent-presets/src/index.ts
```

我在源码里怎么搜都找不到 `resolveSessionPreset`。同事说"肯定是 DSH-0.1.2-A1-21
那个删除没迁干净，照它的迁移配方再改改源码就好了"。

请你诊断（工作目录：`/app/fixture/`）：

1. 这个报错到底从哪来（指出真实来源，别猜）；
2. 源码该不该改？给出结论和依据；
3. 处置步骤写成报告，放 `/app/agent-output/H4-tsbuildinfo-trap/` 下
   （.md/.txt/.json 均可）。

fixture 里的构建产物（`lib/`）你可以随便清理论证；`src/` 是只读的，被改动直接 0 分。
