# Remote 命名空间清单 · 0.1.2-alpha.2（实测）

> 从各包**发布产物**的 `lib/typert.remote-client.d.ts`（`TypertRemoteNamespaceMap` /
> `TypertRemoteScopeMap` 声明合并）直接提取，2026-08-31 对 `0.1.2-alpha.2` 实测。
> 上游 Agent Note 的方法路径与生成产物存在出入（如笔记写 `sessionTitle/rename`、
> 产物为 `session.rename`；`agentPreset.remove` 产物为 `agentPresets.deletePreset`），
> **一律以生成声明为准**。调用方式与错误流见
> [DSH-0.1.2-A1-01](v0.1.2-alpha.1.md) 与 [DSH-0.1.2-A2-02](v0.1.2-alpha.2.md)。

| 命名空间 | 方法 | 贡献包（加入 `dsh.client.inject` / peer） |
|---|---|---|
| `session` | attachment cancel canOpenWorkspacePath control create follow fork list modelCatalog openWorkspacePath page prompt rename search selectModel updateQueue | `@deepseek-ai/dsh-api-session-controller` |
| `skills` | list | `@deepseek-ai/dsh-api-session-controller` |
| `fileReferences` | list（另有 scoped `agent:fileReferences/list`） | `@deepseek-ai/dsh-api-session-controller` |
| `settings` | canOpenAgentPresetDirectory describe mutate openAgentPresetDirectory openSettingsDocument replace update | `@deepseek-ai/dsh-api-settings-controller` |
| `credentials` | describe set unset | `@deepseek-ai/dsh-api-settings-controller` |
| `workspace` | archiveSession create delete follow insertBefore insertSessionBefore rename | `@deepseek-ai/dsh-api-workspace-controller` |
| `directoryPicker` | createDirectory list pick | `@deepseek-ai/dsh-api-workspace-controller` |
| `commands` | execute list（scoped：`agent:commands/*`） | `@deepseek-ai/dsh-commands` |
| `llm` | discoverModels listConfigurableProviders listProviders | `@deepseek-ai/dsh-llm` |
| `agentPresets` | copy deletePreset list read select（scoped：`agent:agentPresets/select`） | `@deepseek-ai/dsh-agent-presets` |
| `subagents` | interruptByParent list prompt | `@deepseek-ai/dsh-subagent` |
| `goals` | clear complete create edit pause resume（scoped：`agent:goals/*`） | `@deepseek-ai/dsh-goal` |
| `messageFeedback` | delete list put | `@deepseek-ai/dsh-message-feedback` |
| `pluginInventory` | list | `@deepseek-ai/dsh-host-plugin-inventory` |
| `sessionReferenceResolver` | candidates | `@deepseek-ai/dsh-session-reference` |
| `dynamicCordisRunner` | getClientCode inventory invoke reportClientGuardFailure reportRenderFailure resolveInspectQuery resolveRequestRun runHostHalf settleUserRun stopFromPanel syncInspectManifest undefineFromPanel | `@deepseek-ai/dsh-cordis-host-runner` |

固定 Host facts `ctx.remote.$host.home` / `$host.isLoopback` 见
[DSH-0.1.2-A2-06](v0.1.2-alpha.2.md)，不在命名空间表内。

## 再生方法（新版本发布后）

```sh
# 装目标版本的 web-app + base 闭包（pnpm ≥ 11 需先放行新发布，见 rollup R-01 批注）
mkdir /tmp/closure && cd /tmp/closure
printf '{"name":"closure","private":true}\n' > package.json
printf 'minimumReleaseAge: 0\n' > pnpm-workspace.yaml
pnpm add @deepseek-ai/dsh-web-app@<version> @deepseek-ai/dsh-base@<version>
# 提取全部命名空间与方法
grep -rl 'TypertRemoteNamespaceMap' node_modules/.pnpm --include='typert.remote-client.d.ts'
```

对每个命中的 `typert.remote-client.d.ts`，`'<ns>': TypertRemoteNamespace$…` 行给出命名
空间名，对应 `interface TypertRemoteNamespace$… { … }` 体内的属性即方法名；
`TypertRemoteScopeMap` 给出 agent 作用域方法。
