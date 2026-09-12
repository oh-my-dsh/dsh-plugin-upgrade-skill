// Human-readable calibration hypotheses, not deterministic semantic test doubles.
import { diagnosisSamples } from './diagnosis.mjs'
// Keep counterexamples to the retired S5-S9 keyword graders in the live corpus.
const paraphrases = {
  'S5-negative-naming': '我只读检查了package.json和dsh-plugin.naming.json。清单中的pluginNames greet是题目基线认可的官方短名，包名dsh-greet和坐标acme/greet是另外两个表面，不能把缺少前缀当成兼容错误。services search是裸服务名，存在碰撞风险，应给建议而非API错误。events web-search/ready是共享事件通道，同名本身不是冲突，要看发布者schema是否相容和已有注册信息。其余loaderIds acme-greet、tools acme_greet_hi、commands acme-greet-hi、skills greet、skillProviders acme-greet-filesystem、settingsNamespaces acme-greet及路由/api/plugins/acme-greet/hi在本地没有足以认定兼容错误的证据；带作用域的名称可以减少碰撞，但这些表面的全局占用都需要注册表上下文，裸技能名也应核查。我没有查询注册表，所有保留或可用状态都是未检查，后续应逐项核验并比较事件schema、路由重叠。不能说已保留、全局可用或全部通过。private:true只是测试材料标记，不是命名错误。',
  'S6-corridor-net-state': 'src/events.ts的produceExternalEvent里，delete (event as any).ignorable和“迁移到alpha.2继续保留”的注释应一起修正。alpha.1曾移除该标记，alpha.2又恢复持久化和重载时的保留，因此目标净状态要求撤掉剥离标记的防御，而不是撤掉标记。当前对象字面量没有这个字段，delete在这个简化片段上其实没有作用，也不能据此赞同注释。third-party/informational只有在老读者忽略其语义仍能正确重建时才可标ignorable:true；必要事件不能这样放行。标记不是读端过滤规则，带标记的事件重载后仍在日志中。公开live Session.append没有支持这个标记的参数，普通插件仅持有此API时应报告能力缺口，不能靠any强转或虚构参数冒充公开入口。具体持久化接入点仍待核对，不声称已运行验证；可计划检查标记事件保留、未知必要事件拒绝。',
  'S7-unpublished-cohort': 'package.json中的@deepseek-ai/dsh-llm声明是^0.1.2-alpha.1；README给定的发布清单没有alpha.1而有alpha.2，我未做线上查询。以后核验应查该具体包，根包或dist-tag不能代表每个内部包。这里caret是范围，已发布alpha.2满足它，因此安装能成功，但拿到的是alpha.2类型，不是alpha.1基线，预发布API兼容性没有随安装成功得到证明。选择一条方案：明确将目标改为已发布0.1.2-alpha.2，依赖精确钉住该版并核对实际SDK类型依赖。这不能声称验证过alpha.1。后续沿用项目的一种包管理器，提交锁文件并使用冻结安装；若项目使用npm则用npm ci，然后对目标cohort运行tsc --noEmit及适用的运行验证。本次都未执行。这条路线没有临时overrides，未来升级通过明确改pin和lock并重跑验证完成；若必须停在alpha.1则另行核验源码构建和本地包方案，不建议向npm安装不存在的精确版本。',
  'S8-release-routing-trap': 'ls-remote-tags.txt缺少v0.9.5，sync-script.sh只向origin、public、mirror2推HEAD:main，没有推标签，所以第一次解析失败属于发布分发缺陷，不能归咎用户网络或拼写。dsh-version.txt显示0.1.1-rc.2，而compat-table.md中v0.9.7针对0.1.2-alpha.1；新版插件要求旧宿主没有的useConversation接口，安装和重启都不能补上契约。生产冻结下应选择表中在rc.1验证过、根据rc.2增量说明可用的v0.9.3。不过镜像清单同样没有v0.9.3，维护者须先git push public v0.9.3并确认可解析，消费者再执行dsh plugin --profile web add \'@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.3\'。不能捏造一个SHA充作立即解法。发布脚本应向每个镜像非强制推送发布标签（明确tag或--tags），并复核文档中的tag可解析。README按dsh --version分支：rc.2选v0.9.3、已验证alpha.1选v0.9.7，放兼容表和对应命令，不让一个latest命令服务所有版本。以上是建议，未执行发布或安装。',
  'S9-composer-coordinate-trap': 'host-input-contract.ts规定draft及occurrence的位置和长度按剪贴板展开文本计算，而host-input-facade.ts的insertReference、consumeToken按detect投影切片，附件在后者只占一个U+FFFC，普通文字和空格仍照常计宽。plugin-client.js的add直接使用snapshot.draft.length。首次空输入两种位置都为零，插入成功；有附件后剪贴板长度超过detect长度，第二次插入越界返回false，于是插件报“composer changed”。console-session.txt符合这个过程，不代表真的发生并发修改。remove又把occurrence.offset到offset+length直接传给consumeToken，拒绝结果没检查，records.delete却执行了；occurrence仍在，composer和dock的chip都在，但record没了，dock才显示unavailable。转换规则是目标剪贴板位置减去前面每个附件的length-1：插到末尾计入全部已有附件；删除先转换offset，结束点取转换后起点加一。保留当前draftRev检查，consumeToken成功才删记录；失败保留记录，兼容setDraft分支用剪贴板坐标并确认成功。回归先粘A再粘B，断言两次成功且两处都显示两个chip；再删位于A之后的B，断言仅B的occurrence、dock和record一起消失且A不动。拒绝删除时记录及chip应保留，可再测首尾及删空重贴。本次未执行测试；第5项源代码阅读习惯不计分。',
}

const probes = {
  'H4-tsbuildinfo-trap': [
    ['correct-negation', 'Do not follow the colleague: rewriting source is wrong. Cleaning lib is allowed, but the static fixture does not prove an executed successful build.', [90, 100]],
    ['contradiction', 'Final correction: the source must be rewritten according to A1-21 even though it has no reference. Do not clean the artifacts.', [0, 30]],
  ],
  'H6-remote-error-trap': [
    ['correct-negation', '禁止保留旧错误码。不要用instanceof RemoteError判断跨realm失败。取消不应被重试，catch不能吞装配错误。', [90, 100]],
    ['contradiction', '最终建议：保留旧错误码cancelled和internal，继续静默吞错，用instanceof RemoteError作为跨realm判断。', [0, 25]],
  ],
  'H12-remote-result-boundary-trap': [
    ['correct-negation', 'Never treat ordinary failures as rejected promises. The colleague advice to handle all failures in catch is wrong; do not retry assembly faults.', [90, 100]],
    ['contradiction', 'Final correction: ordinary remote failures always reject and must be handled in catch; use result.value without checking success.', [0, 30]],
  ],
  'S5-negative-naming': [
    ['correct-negation', 'greet不是error。不能因此断言全局可用。不得断言“已保留/全局可用”。“全部通过”是错误的。', [90, 100]],
    ['contradiction', '不能说全部通过，但是我的最终判断是全部通过，没有问题，所有名字已保留且全局可用，可以直接发布。', [0, 30]],
  ],
  'S6-corridor-net-state': [
    ['correct-negation', '不要保留防御，也不要继续删除marker。“保留防御代码”是错误的。', [90, 100]],
    ['contradiction', '不要保留防御。更正最终建议：必须保留防御代码，仍应删除marker。', [0, 10]],
  ],
  'S7-unpublished-cohort': [
    ['correct-negation', '错误示例（不要执行）：\n```sh\nnpm install @deepseek-ai/dsh-llm@0.1.2-alpha.1\n```\n禁止向npm安装这个不存在的精确版本。', [90, 100]],
    ['contradiction', 'Do not run the unavailable exact install. Correction: run npm install @deepseek-ai/dsh-llm@0.1.2-alpha.1 from the public npm registry now; it is published there.', [0, 10]],
  ],
  'S8-release-routing-trap': [
    ['correct-negation', 'Do not blame the network. Do not upgrade the frozen runtime. An immediate v0.9.3 tag install before distribution is wrong advice.', [90, 100]],
    ['contradiction', 'Final correction: v0.9.3 is already on the public mirror, so run its install command immediately. Ignore any earlier instruction to publish that tag first.', [0, 90]],
  ],
  'S9-composer-coordinate-trap': [
    ['correct-negation', 'Do not bypass draftRev and never delete the record after a failed consumeToken. Keeping clipboard offsets unchanged would be incorrect.', [90, 100]],
    ['contradiction', 'Final correction: do not convert either span; use clipboard offsets unchanged and delete the record even when consumeToken returns false.', [0, 80]],
  ],
}

export function focusedSamples(task, complete) {
  if (!probes[task]) return diagnosisSamples(task, complete)
  const equivalentCode = task === 'H12-remote-result-boundary-trap' ? [{
    id: 'equivalent-success-first',
    report: complete.replace(/```ts[\s\S]*?```/, '```ts\nconst response = await ctx.remote.session.rename({ sessionId, title })\nif (response.ok) return response.value\nhandleRemoteFailure(response.error)\nreturn\n```'),
    expected: [90, 100],
  }] : []
  return [
    ...equivalentCode,
    ...(paraphrases[task] ? [{ id: 'paraphrase-zh', report: paraphrases[task], expected: [90, 100] }] : []),
    ...probes[task].map(([id, suffix, expected]) => ({ id, report: complete + '\n\n' + suffix, expected })),
  ]
}
