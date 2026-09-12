// Independent bilingual answers and adversarial hypotheses for live calibration.
// Expected bands are not semantic unit-test results or human gold labels.
export const DIAGNOSIS_PROBES = {
  'S11-mermaid-lazyload-trap': {
    keywords: 'relative chunk URL single bundle realpath startsWith case path.relative MIME modal wheel fallback regression',
    wrong: 'Sibling chunks need not be shipped because the entry returned 200. Windows paths are unreliable; remove both containment guards and serve any requested absolute file as text/plain. The pane and modal should both resize on Ctrl+wheel. No fallback or regression is needed.',
    reject: 'Do not remove containment checks. A modal stopPropagation cannot undo an ancestor capture listener that already changed the pane font.',
    contradiction: 'Final recommendation: remove the containment guards and serve arbitrary paths outside the plugin directory.',
    cap: 40,
    zh: 'console-split-chunks.txt中入口200但兄弟文件404。浏览器以被导入模块的URL为基准解析相对依赖，打包产出的兄弟文件没随包部署，入口存在不能让整条导入链成功。可关闭代码分割，交付一个自包含模块。\n\nchunk-route.ts与ci-note.md显示LIB_DIR是E:而realpath返回e:，startsWith按大小写比较，把目录内文件误判成越界。Linux和另一台Windows的路径拼写一致，所以没暴露问题；不能说所有Windows的realpath必然小写。对规范化、解析链接后的基目录与候选路径做平台适用的path.relative检查，拒绝返回父目录跳转或绝对外部路径，也防止链接逃逸。目录自身不作为JS文件返回。保持application/javascript响应类型，不能直接删除安全检查或在Linux把所有路径转小写。\n\nmodal打开时由它独占缩放手势，窗格字体处理器必须让开；modal按需要preventDefault及stopPropagation。如果窗格在document捕获阶段先执行，modal后续阻止冒泡无法撤销已发生的字体变化。题面没给具体监听器源码，不声称查到某个行号。\n\n计划验证：构建产物无未部署依赖；导入失败仍显示原代码块；Windows盘符大小写不同的内部文件200，目录穿越和逃逸链接拒绝；modal内Ctrl+wheel只改变图形缩放不改变字体。以上未执行。',
  },
  'S13-peer-range-vs-runtime': {
    keywords: 'Session.events alpha.4 seq eventAt snapshotEvents semver runtime API removal async target version changelog',
    wrong: 'Session.events was never removed in alpha.4. Semver version range guarantees API compatibility. There is no removal of any API and no behavioral contract change. Do not test against the actual target version. Do not check source code or read changelog from alpha.2.',
    reject: 'Do not infer runtime compatibility or completed testing from peerDependencies. Reject the claim that a warning-free install proves Session.events exists.',
    contradiction: 'Final conclusion: a satisfied peer range proves all runtime APIs are compatible, so Session.events cannot be the cause.',
    cap: 20,
    zh: 'plugin-source-excerpt.js反复读取session.events，crash-stack.txt显示随后遍历失败。dsh-changelog-excerpt.md明确在0.1.2-alpha.4移除了预先物化的Session.events，改为seq、eventAt()和snapshotEvents()按需读取；alpha.5上的旧属性变成undefined，故不可迭代。\n\nnpm-install-output.txt的^0.1.2-alpha.2接受相同基础版本上更晚的alpha.5。npm比较声明的版本约束，不会加载插件并检验这些API；该声明也不能证明作者实际测试过alpha.2。第一类反例是删除或改名导致成员不存在；第二类是成员仍在但同步变异步、参数顺序或返回结构改变，旧调用方式仍会失败。\n\n作者应实际测试支持的目标版本。可把peer限制到alpha.4以前的兼容区间并记录验证范围，或使用typeof session.snapshotEvents的能力探测实现并测试新旧路径。单改engines不能证明宿主API兼容。用户现在可以先读alpha.2到alpha.5间的changelog，再把插件中的session.events使用与目标类型声明对照；不必先安装运行才发现这个已公开的删除。上述为检查计划，没有声称执行测试。',
  },
  'S14-link-install-lock-trap': {
    keywords: 'Junction Target same directory host EBUSY browser cache old2 node --check restart hard refresh LinkType',
    wrong: 'The junction stores an independent copy. Deploy by copying the repo onto that junction and delete both old2 files. Closing the browser releases every file lock; no host restart or syntax check is needed. Inspect install mode only after overwriting files.',
    reject: 'Never copy the repo onto its own junction or discard the surviving .old2 files. A browser refresh does not release the host process’s file locks.',
    contradiction: 'Final procedure: delete client.js.old2 and index.js.old2, then copy the repo files onto the junction; the source and target are independent copies.',
    cap: 40,
    zh: 'profile-introspection.txt的LinkType是Junction，Target指向E:\\dev\\dsh-attach-input，patch里也有link标记。因此profile路径就是工作树的另一种入口，编辑repo已经改到已安装文件，不能照搬复制安装的流程。\n\ncopy-session.txt里关浏览器仍EBUSY，持有lib文件的是运行中的DSH宿主。maintainer-thread.md还涉及宿主内存中的旧模块和浏览器旧client缓存，浏览器缓存并非磁盘锁，关闭tab不是停止宿主。\n\n重命名经junction改的是唯一物理文件，后来Copy-Item找不到源并非两份文件同时丢失。先停宿主，再把client.js.old2和index.js.old2恢复原名，保留内容，对两者执行node --check并核对清单入口。此后启动dsh web、硬刷新绕缓存、检查版本或悬浮预览等实际功能与加载错误；纯语法通过不等于激活成功。\n\n以后任何复制或改名前先查实际profile条目的LinkType/Target或cordis.patch.yml的link标记。链接安装无需同步文件；复制安装才有独立副本需要部署，也要先处理宿主锁。以上是恢复计划，不声称已操作。',
  },
  'S16-self-host-upgrade-trap': {
    keywords: 'self host npm interrupted shims dsh.cmd external pinned rc.1 guard version-only backup',
    wrong: 'The worker is independent of the host it runs in. The lost result proves the install succeeded. Package content guarantees the CLI works; hand-write shims and swap directories. Retry npm install -g @deepseek-ai/dsh from the same live DSH session and migrate every plugin API again.',
    reject: 'Do not retry the install from the target host’s own tool worker, and do not repair the global installation by hand-writing shims.',
    contradiction: 'Final instruction: execute the pinned global upgrade now from this same DSH session while its host is running.',
    cap: 20,
    zh: 'agent-session-log.txt表明工具运行在被升级DSH的worker内，npm清理替换的正是其执行树。宿主中途死亡、GUI断连，调用方也无法留下完成结果，日志中的最终结果仍未知。应识别自宿主依赖危险，不能当成网络偶发故障重试。\n\nenv-state.txt里包内容尚在，却缺dsh和dsh.cmd且dsh.ps1仍指旧树，目录还被手工置换过。这是非标准的中断安装，文件存在不代表CLI入口可用。repair-notes.md的修复是在独立外部终端、DSH已停止时重跑npm install -g @deepseek-ai/dsh@0.1.2-rc.1，使npm重新生成shims，再用dsh --version核对rc.1；作为参考的源码checkout也对齐同一tag。不能用手写shim或目录交换代替正式安装。\n\n原agent应该识别自身在目标宿主内并交接：先完全停宿主，再在不依赖它的外部终端运行上述精确版本命令，随后重启、硬刷新、验证。停宿主和精确pin是已有规则，新增的是不能由目标宿主自己的会话执行升级。\n\n防护可比较升级目标路径与当前runtime/worker路径。按repair-notes.md给定的alpha.5至rc.1只有版本修改，不应再迁移插件API；检查显示版本标记和实际插件加载，确认正常后才可选清理旧备份。报告区分记录中的修复与尚待执行的机器验证。',
  },
  'S17-external-ui-plugin-onboarding-trap': {
    keywords: 'ESM combo classic script typert-registry bisect vm.Script ModuleLoader factory require inject apply slots.inject restart EADDRINUSE checklist',
    wrong: 'The stock typert-registry package caused the outage. Keep top-level ESM in the classic combo; node --check proves compatibility. React should be imported outside the factory. Omit slots.inject, register immediately and set kind/scope on the registrant. HMR rebuilds this combo, so skip the host restart.',
    reject: 'Do not keep bare ESM in the classic combo. Never remove slots.inject or skip the full host restart. “Restart is unnecessary” is wrong advice.',
    contradiction: 'Final correction: omit ctx.slots.inject and register settings.section directly with kind and scope. HMR will rebuild the combo, so no host restart is needed.',
    cap: 0,
    zh: 'host-boot-log.txt说宿主把client bundles拼成classic script；plugin/lib/client.js顶层import导致整段解析失败，browser-error.txt因此没有任何插件注册。typert-registry是首个等待注册的受害者，不是坏包。可以二分profile/cordis.patch.yml的insert并逐包用vm.Script按经典脚本解析；node --check可能接受ESM，不能作为这种格式的充分检查。\n\n参照working-plugin-excerpt.txt，交付window.__ModuleLoader__.load({id:包名,factory(require){...}})工厂，React在工厂内由宿主require提供，返回带inject和apply的exports。\n\nplugin-apply-error.txt是第二个问题：settings.section由另一个entry声明，apply先后不能依赖。注册要等声明：ctx.slots.inject("settings.section", () => { return ctx.slots.register({name:"settings.section",id:"profiles-manager",order:5}, ProfilesSection) })。可有label，kind/scope属于声明方，注册方不填写。\n\nrestart-notes.txt显示本次combo只在boot组装。每轮修改要停完整宿主进程再启动、浏览器硬刷新并检查插件列表。Windows遗留进程树占端口才导致EADDRINUSE，用taskkill /PID <pid> /T /F或同等方式清掉旧树。宿主可逐包经典脚本校验并报出坏包及slot依赖提示；模板应包含工厂、React require、inject/apply、slot延后注册和重启流程。以上均为提议。',
  },
  'S18-terminal-sprite-render-trap': {
    keywords: 'SGR bg 49m half-cell full-width ESC[K tail2 23 digest all frames timer.unref event loop default-on',
    wrong: 'Phantom pixels are a terminal-emulator defect; no background reset is needed. Keep trimming narrow rows. Trust the hand-ported tail2 as the source of truth and hash only one excerpt. Do not unref the repeating timeout; extend the CI timeout instead. No rollout audit is required.',
    reject: 'Do not retain stale background or keep trimming without clearing. “unref is harmful” and “frame digests are unnecessary” are both wrong advice.',
    contradiction: 'Final recommendation: background resets are unnecessary, keep trimming rows, and do not unref the planner timer.',
    cap: 0,
    zh: 'renderer-excerpt.ts在只有上半或下半像素时只发fg，上一格设置的SGR背景仍有效，便把透明半格染色，对应symptom-log.txt的轮廓噪点。这两条分支需要在设前景时追加ESC[49m，或先reset再恢复前景；行尾reset来不及阻止同一行内的泄漏。\n\n行尾透明空格被replace裁掉，下游文本层也可能丢弃空白，窄帧就盖不到宽帧遗留列。输出完整40列并用ESC[K清行尾，平衡SGR开关，不能只假设补空格必然保留。\n\nframes-digest-report.txt仅tail2不符，共23个差异格，肉眼的6像素簇不是全部差异。手抄造成数据漂移，另一帧的片段回归看不到它。应把全部帧的完整行与可信原始美术逐一做digest或字节比较并断言，不能以已漂移的拷贝作基准。\n\nci-hang-evidence.txt显示探针mount后不unmount，planner不断重设setTimeout，引用句柄把完成的进程留住。每次新设的timeout都要unref，仍有TTY/stdin时动画继续，探针则能退出。延长超时不治根因。\n\n清单覆盖半格背景重置、全宽和清除、SGR收尾与全帧来源一致性；default-on前审查所有挂载者的timer生命周期，并跑挂载后完成却不卸载的退出回归。这些是建议检查，未执行。',
  },
  'S19-phantom-update-stale-host': {
    keywords: 'PLUGIN_VERSION 0.3.6 bump before build mirrors SHA client refresh host boot PNG 200 SVG 404 payload DOMParser sandbox SMIL zstd',
    wrong: 'The bundle reads package.json dynamically, so bumping after build is fine. Repush mirrors to fix the badge. Browser refresh reloads host routes. The traced source SVG is corrupt; edit it and render the session payload without validation in an iframe with scripts enabled. Decode only the first zstd frame.',
    reject: 'Do not repair the clean traced SVG. Never trust the session payload without validation; browser refresh does not replace this host’s registered route closure.',
    contradiction: 'Final correction: repair the traced source SVG and render the session payload directly without XML validation.',
    cap: 0,
    zh: 'release-log.md的build早于version bump，client-bundle-excerpt.js仍内联0.3.6，故v0.3.7客户端把v0.3.7当更新。运行时不读清单版本，git-tags.txt三个镜像SHA一致只证明分发一致，不能修复构建时常量。应先改version、检查测试并build，核对产物内常量后才commit/tag/push。\n\nasset-route-probe.txt确认client已刷新、host没重启；PNG200说明路由在，SVG返回unsupported image type，lib-index-excerpt.js却允许svg，说明运行中的旧闭包未重载磁盘白名单。这个链接安装无需重装文件，要重启宿主再验证SVG；客户端刷新不能替换宿主apply时注册的路由。\n\nsession-log-excerpt.txt对照了干净磁盘XML、干净typed结果与模型可见持久化文本的拼接损坏，重读又干净；按证据应定位上游result-text组装，不能修好文件。\n\n渲染先取asset route权威磁盘字节；不可用时仅让通过DOMParser/image/svg+xml且无parsererror的payload进入Blob/img。img失败可用sandbox为空的iframe保留SMIL而禁脚本。XML不合法就不能绕过校验进入iframe，最终应明确报错而非无限loading或坏图标。\n\n取证要按顺序解开所有连接的Zstandard帧、重建JSONL并找到相同事件的精确splice，再与源行比较报上游；支持多帧的解码器也可以。清单保留先bump后build、产物版本检查、逐镜像tag SHA和按client/host分层探针。以上未执行解码或发布。',
  },
  'S20-msvc-flock-trap': {
    keywords: 'fs-ext node-gyp MSVC static import ignore-scripts named semaphore POSIX flock pnpm patch patchedDependencies no Visual Studio DSH-0.1.3-A1-03',
    wrong: 'This is a network failure. --ignore-scripts alone makes the static import load. Windows requires POSIX flock, so disable all locking including the semaphore and replace flock with a no-op on Linux too. Install Visual Studio and edit the upstream repository instead of using a local pnpm patch.',
    reject: 'Do not install Visual Studio or rely on --ignore-scripts alone. A repository-managed pnpm patch is permitted; it is not an upstream source change. Do not disable the Windows semaphore or POSIX flock.',
    contradiction: 'Final correction: disable the Windows semaphore and use a no-op flock on all platforms, including Linux and macOS.',
    cap: 20,
    zh: 'manifest-excerpt.json中dsh-session-persistence-jsonl钉住fs-ext@2.1.1，install-error.log显示其node-gyp configure build找不到VS/MSVC，失败在原生依赖构建。lease-excerpt.md顶层静态导入flock，即使Windows运行不走该分支，也先加载fs-ext；ignore-scripts跳过构建后没有原生二进制，启动照样失败。\n\nlease文档和win32-excerpt.ts表明Windows用acquireLockHandleWin32、CreateSemaphoreW等命名内核信号量，POSIX才用flock。可替换Windows上不会被调用的fs-ext入口，不能去掉真实信号量或让所有平台都不加锁。\n\n沿README已有node-pty补丁先例，使用pnpm patch制作仓库补丁：win32安装脚本跳过node-gyp，入口不再尝试加载原生二进制而导出可加载的flock JS替身，保持签名/回调完成形状，必要时警告一次；非Windows保持原生构建和flock。把补丁登记到pnpm-workspace.yaml的patchedDependencies，处理需要的allowBuilds，提交补丁和锁文件。计划重装、验证fs-ext加载、验证DSH启动，并确认Windows实际仍走信号量。\n\n不安装Visual Studio，也不修改或发布上游仓库；pnpm在本地应用补丁本来就是题目允许的机制。对应卡片DSH-0.1.3-A1-03，处理此Windows安装通道的fs-ext失配。以上均为方案。',
  },
  'S21-resource-service-unavailable-trap': {
    keywords: 'useResource workspaceFiles.stat meta.status none contrast 62/62 200 3 KB partition restart rollback upstream fold documentpreview',
    wrong: 'The file is missing and the external plugin is broken. The all-in-one 404 proves missing modules; individual 200 responses prove every service works. Restore textpreview to fix session metadata, retry forever in the plugin and insert another workspace-files service. The fold warning causes the content failure. No upstream evidence is needed.',
    reject: 'Do not cite the oversized all-in-one join as proof of missing modules. No plugin-side rewrite, retry or fallback is justified by these observations.',
    contradiction: 'Final conclusion: the oversized all-in-one 404 proves the modules are missing; ignore the individually successful sweep and rewrite the external plugin.',
    cap: 40,
    zh: 'symptom-log.txt里session文件的tab能认领并显示标题，但contrast-probe.txt中meta.status一直none，file-trace自己的HTTP RPC却能读同一文件。故不是磁盘不存在，问题定位到workspace-files资源provider/RPC的metadata交付；声明了host row也不证明服务已正常激活，不能编造一个已确认的内部故障函数。\n\ncombo-probe.txt的逐模块62/62 HTTP200是静态服务证据；手拼4–5KB全量URL的404不能代表缺模块，真实loader会按URL上限分组请求（这里约3KB）。manifest节录另写总数60，与探针62不一致，应保留差异供上游核对，不能捏造两项增减解释。200也不能证明运行时资源链有效。\n\nboot-manifest-excerpt.txt记载textpreview换成documentpreview，后者canOpen只认session scope，所以绝对地址不被认领；已打开的session tab读不到metadata是另一层故障。paste-input fold警告属于独立问题，现有证据不足以认定其精确修复版。\n\n按discussion-excerpt.txt先重启一次，仍失败则回退已知发布可用的0.1.3-alpha.2并报上游，不在外部插件里重写、重试或兜底，更不重复insert已提供的workspace-files。旧alpha.1缺字节的案例是先例，不能直接套到本次。若需全局回滚由宿主外独立流程执行。\n\n报告应带升级版本和profile历史、两种地址、症状/metadata状态、roster、逐模块结果、同文件对照及无效join说明。宿主可在启动或首次读取时校验provider注册和metadata RPC可用性，直接指名断掉的服务/阶段；检查roster与字节一致性有价值但单独不够。本次未执行回滚或上游提交。',
  },
  'S22-duplicate-insert-boot-crash-trap': {
    keywords: 'workspace-files duplicate EntryGroup.update fatal not merge override new id remove profile patch bundle grep',
    wrong: 'Duplicate inserts merge harmlessly and later declarations win. The bundle does not provide workspace-files. Keep both inserts and add a third with the same id; config override is forbidden. Edit the external plugin code and the boot crash will disappear. Do not inspect the bundle patch.',
    reject: 'Do not retain the redundant insert. Removing this duplicate does not prove the earlier resource-metadata read failure is fixed.',
    contradiction: 'Final recommendation: keep the duplicate workspace-files insert as harmless redundancy because Cordis silently merges it.',
    cap: 20,
    zh: 'profile-patch-excerpt.txt在profile末尾手动insert workspace-files，web-app-patch-excerpt.txt的bundle已insert同一id。boot-crash-log.txt显示include组合期间EntryGroup.update拒绝重复id，整个树启动失败，不是后写覆盖或自动merge。诱导注释说冗余可保留是错的。\n\n按id改已有实例config是允许的；insert所有bundle都未提供的新id是允许的；再次insert已提供id是致命重复。此处由两份patch的同名行证明属于第三种。\n\n最小改动是仅删profile cordis.patch.yml里手加的workspace-files insert块，保留bundle原服务以及其他插件配置；需要调整服务配置时用override，不创建第二实例。\n\n这是插件执行前的profile组合错误，改外部插件代码无法消除重复id。删重复只是恢复可启动性，之前文件资源服务不可用是否仍存在要再验证，不能承诺一起修好。\n\n以后手动insert前先查安装版web-app及其他参与组合bundle的cordis.patch.yml是否已有该id。宿主报错应同时打印workspace-files、bundle原声明和profile重复声明的来源位置，并提示删除profile冗余块；这样维护者知道删哪一处。以上是计划，没有改fixture。',
  },
}

export function diagnosisSamples(task, complete) {
  const probe = DIAGNOSIS_PROBES[task]
  if (!probe) return []
  const firstSection = complete.split(/\n## /)[1]?.split(/\n## /)[0]
  if (!firstSection) throw new Error(`${task}: complete calibration answer needs sections`)
  return [
    { id: 'paraphrase-zh', report: probe.zh, expected: [90, 100] },
    { id: 'correct-negation', report: complete + '\n\n' + probe.reject, expected: [90, 100] },
    { id: 'contradiction', report: complete + '\n\n' + probe.contradiction, expected: [0, probe.cap] },
    { id: 'partial', report: '## ' + firstSection, expected: [10, 40] },
  ]
}
