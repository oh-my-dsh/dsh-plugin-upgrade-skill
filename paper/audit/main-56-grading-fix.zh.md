# 主56题评分修复记录

日期：2026-09-08。实验分支：`experiment/main56-v2`，暂不合并进 main。本轮修复评分器及错误处理，没有运行 solver 或付费 judge，没有重写历史成绩。旧23题快照保留不变。

## 改动

- S1/S2/S3/S4/S6 改为基于具体位置、诊断和迁移方向的局部规则评分，卡片编号只保留为辅助信息。加入中英文无卡号正确答案、纯编号、关键词堆砌、错误方向及否定建议测试。
- M6–M12、H14–H19、H8 将5分引用项移出主分，余下95分归一化至100，保留原百分制上限。诊断/运行/静态检查等原有构念没有因此全部升级为功能验证。
- 56题统一 verifier：有效零分仍产出reward；缺失/非法JSON、非零退出、基础设施和准备失败产出结构化错误且不写reward。清理旧reward，避免重跑读取过期成绩。结果JSON同步输出后退出。
- 修复git检查、可信基线、M5恢复基线及47份profile创建的异常路径；shell初始化遇到中间文件写失败立即停止。候选修复自身失败仍按任务规则评分。
- 更新19题作答说明、checkpoint校验和回归入口。统一入口由 `benchmark/scripts/sync-verifiers.mjs` 生成并检查漂移。
- 材料链接校验只对C/D原样references中的历史排除链接提供窄例外：核对来源/材料manifest与字节hash、归档内目标及排除标签，拒绝漂移和越界。没有改变C/D注入内容或开放scripts/examples。
- 语义评分试验的校准接口明确改为当前 `deterministic_score` 对照，修复临时目录符号链接导致judge未执行的问题，并验证无效结果不会计0。原有历史校准输出不变。

## 实际入口回归

全20静态题在禁网Node 24一次性容器中使用当前judge与test.sh，共80次探针。详见[完整JSON](main-56-fix-checks/final-static/static-probes.json)，包含输入hash、源文件hash和评分结果；该检查不等于Harbor正式准入。

| 范围 | 参考答案 | 去卡号答案 | 仅卡号 | 空答案 |
|---|---:|---:|---:|---:|
| S1/S2/S3/S4/S6及其余15静态题 | 100 | 100 | 0 | 0 |

H20/H23/H24/H25使用前轮从各自Dockerfile构建的本地镜像、只读挂载当前tests和原solution，在禁网容器各跑oracle/nop。8次均正常退出，参考修复100、未改对照0，见[运行记录](main-56-fix-checks/runtime-probes.json)。

## 验证入口与边界

`npm run test:grading-validity` 的159项全部通过，覆盖统一错误协议、56题隔离挂载、实际judge错误路径、47份profile真实临时目录I/O、引用独立性和五题诊断规则，见[测试日志](main-56-fix-checks/grading-tests.log)。`npm test` 覆盖仓库完整回归。独立AI复核发现的S6否定范围、M5准备失败和profile中间写失败问题均补反例后修复。

最终完整 `npm test` 退出码0，见[完整日志](main-56-fix-checks/npm-test.log)。使用本地npm依赖缓存与离线模式；材料7项边界测试、语义校准接口20项测试包含在内。统一verifier副本检查及代码空白检查通过；来源归档保持原始字节。材料manifest及全部artifact checksum通过。测试中的runtime case定义检查仍只代表1个case/3个check，不扩大为56题运行覆盖。

修复前预检、逐题清单和两轮逐次输入/输出保留在本地备份提交 `c4c9711`，未随本PR上传。当前分支只提交汇总JSON及两份测试日志。探针脚本可重新生成逐次证据，需指定新的输出目录。

局部文本规则仍不等于开放式语义评审；去卡号是词面干预。还需独立人工语义/合法替代解验证、其余32道Hands-on完整runtime准入、runner隔离预演及正式快照冻结。当前证据不能宣称56题全部准入，也不能填入448次主实验结果。
