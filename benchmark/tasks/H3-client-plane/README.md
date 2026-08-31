# H3-client-plane · 客户端平面（能装能激活，浏览器里也得在名册上）

agent 把 `/app/fixture/` 里的 dsh 0.1.1 旧浏览器插件迁移到 0.1.2-alpha.2：
`package.json` 顶层 `client` 旧约定迁入 `dsh.client`（platform=web）声明，
`client.js` 按 DSH-0.1.2-A2-02 改 `RemoteResult` 分支。考「dsh.client 平面契约 +
浏览器名册真实识别（`__DSH_BOOT__.entries`）+ 静默失败陷阱」。题面见
[instruction.md](instruction.md)，判分逻辑见 [tests/judge.mjs](tests/judge.mjs)。

- **环境**：`node:24-bookworm` + git（fixture 以 git 基线提交支持改动检测）+
  全局 dsh 0.1.2-alpha.2（judge 在容器内做真实冷启动验证，无需 docker exec）。
- **Verifier**：judge 检查 fixture 已被改动 + `dsh.client` 静态声明（40）+
  `dsh plugin add`（10）+ web 冷启动无 pending（10）+ `__DSH_BOOT__.entries`
  出现本插件（40），0-100 分归一化写 `/logs/verifier/reward.txt`。
- **Oracle**：`harbor run -p benchmark/tasks/H3-client-plane -a oracle`，期望 reward 1.0。

```
environment/fixture/   # 旧插件源码（dsh.client 声明缺失陷阱）
environment/Dockerfile # node:24-bookworm + git + 全局 dsh 0.1.2-alpha.2
tests/                 # judge.mjs + judge-utils.mjs + test.sh
solution/              # 参考插件文件 + solve.sh
```
