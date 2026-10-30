# JUDGE BRIEF · skill.S12-global-upgrade-ebusy-trap

## Criteria (sealed rubric)
- [native-module-owner] (20pt) Identify the running Windows dsh web-host node.exe (PID 42432 in running-processes.txt) as the process that loaded koffi.node. Explain that the loaded native binary remains in use until that host exits, so npm cannot copy/replace it and reports EBUSY. File-in-use/handle wording is equivalent to lock; do not require universal claims about other operating systems or the word exclusive.
- [browser-versus-host-sequence] (20pt) Explain that refreshing the browser reloads the page/SPA without stopping the native-module-owning host. Give the ordered procedure: stop/confirm exit of the relevant dsh host, install, then restart. Separate numbered steps, prose and command blocks together establish the sequence; do not require a single sentence. Do not prescribe killing every unrelated Node process.
- [unpinned-dist-tag-resolution] (20pt) Explain that an unversioned npm global install follows latest, which npm-dist-tags.txt pins to 0.1.1-rc.2; alpha points to 0.1.2-alpha.5. This can replace the initially installed alpha.4 with rc.2 rather than preserving/upgrading it. A statement that an unpinned install does NOT preserve the installed version is correct, not contradictory advice. Distinguish a minor wrong prior-version label from a wrong resolution mechanism.
- [safe-exact-commands] (20pt) Provide npm install -g (or npm i -g) @deepseek-ai/dsh@0.1.2-alpha.5 and @deepseek-harness-tui/dsh-tui, together or separately after stopping the host. Verify dsh --version is alpha.5 and restart the host. An explicit @alpha may be discussed as a mutable alternative but cannot replace the requested exact-version command. Shell examples are proposed instructions, not required executed actions.
- [readme-prevention] (20pt) Tell README authors to pin the exact intended/tested core version whenever a plugin install command also installs dsh, and avoid silently following latest over an existing prerelease. Accept separate pinned core/plugin commands or one pinned combined command. Read the recommendation across headings and list items; quoted unpinned BAD examples are not endorsements.

## Caps (score ceilings; judge returns each with triggered true/false)
(none)

## Candidate report(s)
#### FILE: S12-global-upgrade-ebusy-trap/report.md

# S12 · Global Upgrade EBUSY + Downgrade Trap — Root-Cause Report

- Task: S12-global-upgrade-ebusy-trap (read-only diagnosis; no install/migration executed)
- Skill applied: `plugin-upgrade` (Mode A · inspect, read-only) — references cited by ID/要点 only
- Evidence: `fixture/attempt1-ebusy.log`, `fixture/attempt2-downgrade.log`, `fixture/npm-dist-tags.txt`, `fixture/running-processes.txt` (read-only, unchanged)
- Completed: 本报告（诊断 + 安全升级流程 + README 防坑指南） · Skipped: 一切安装/迁移动作（题面禁止执行） · Rollback: 见 §3

---

## 1. Attempt 1 root cause — EBUSY on `koffi.node`

**Diagnosis (from the evidence, not guesswork):**

- `attempt1-ebusy.log` shows `npm error code EBUSY / syscall copyfile / path ...\@koromix\koffi-win32-x64\win32_x64\koffi.node / dest ...\@deepseek-ai\.dsh-TMPDIR\...\koffi.node`: npm's global install stages the new tree into `.dsh-TMPDIR` and copyfiles it into place; the copy of the native binary is what fails.
- `running-processes.txt` pins the holder: **node.exe PID 42432 = the running `dsh web` host**, which loaded `@koromix/koffi` (a native FFI addon used for sandbox/filesystem operations) at startup. node.exe 23768 is an agent-session worker of the same installation; 23920 is the npm install itself. Nothing else could hold that file.

**Why the lock exists:** on Windows, a loaded `.node` native binary is mapped into the loading process and the OS keeps a file lock on it **until that process exits**. npm cannot copy/replace a locked binary → EBUSY. This is an OS-level fact, not an npm bug.

**Why a browser-page refresh does NOT free it:** the lock lives in the **host process**, not in the browser. The browser page is only the Web Client SPA talking to `dsh web` over a WebSocket; F5 / hard refresh / closing the tab or even the whole browser window merely reloads or drops the client — the `dsh web` host (and its loaded `koffi.node`) stays alive and keeps the lock. What releases it: **fully ending the host process tree** (the `dsh web` console + any dsh agent-session worker node.exe it spawned). (Same finding is on record in the skill's troubleshooting 症状表, EBUSY 行: 关掉浏览器标签也不释放，文件锁在宿主不在浏览器 — benchmark 任务 S12 · precision-checklist 钉版本规则.)

**Extra trap (skill: “Global DSH host upgrades (agent discipline)”):** never run `npm install -g @deepseek-ai/dsh@…` from *inside* a dsh session on that host — the session IS the host; npm rips out the very package tree the host executes from, the host dies mid-install, and an interrupted install leaves package content without regenerated shims (the `dsh` command itself disappears until an external pinned re-install repairs it). A crash during the upgrade is a signature of doing it wrong.

**Correct stop-then-upgrade sequence:** save work → fully stop every dsh process (Ctrl+C/close the `dsh web` console; kill remaining dsh node.exe workers) → verify with `tasklist /FI "IMAGENAME eq node.exe"` that the host/worker PIDs are gone → run the **pinned** install from an **external** terminal → restart `dsh web` → hard-refresh browser → verify version + plugin roster. Full commands in §3.

## 2. Attempt 2 root cause — silent downgrade to `0.1.1-rc.2`

**What the unpinned spec resolves to:** the README's combined command is
`npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui`.
A **bare package name with no version/tag is resolved by npm as `pkg@latest`** — i.e. it follows the **`latest` dist-tag**. Per `npm-dist-tags.txt` at that moment:

| dist-tag | version |
|---|---|
| `latest` | **0.1.1-rc.2** |
| `next`   | 0.1.1-rc.2 |
| `alpha`  | 0.1.2-alpha.5 |

So the command installed `0.1.1-rc.2` — and `npm install -g <bare name>` **replaces the globally installed version with exactly what it resolved**, it does not mean “keep current” or “advance within a range”. Your installed `0.1.2-alpha.4` was overwritten by `0.1.1-rc.2`, so `dsh --version` printed `0.1.1-rc.2`. Because `latest` (0.1.1-rc.2) is *lower* than the installed 0.1.2-alpha.4, the net effect is a **silent downgrade to the older 0.1.1 stable-RC line**.

**Why `latest` is not your wanted version:** `0.1.2-alpha.5` is a prerelease published only on the **`alpha`** dist-tag; `latest` deliberately stays on the stable line. Any bare install can therefore never reach alpha.5 — it follows `latest`. (Governing tag = `latest`; `next` happened to hold the same version at that instant, which is coincidence.)

**The same latent trap applies to the second package:** bare `@deepseek-harness-tui/dsh-tui` follows *its own* `latest`, whatever line that is — likely the stable-host line.

**Reference record (要点 + ID only):**
- skill `plugin-upgrade` · “Global DSH host upgrades” step 2: a bare package name resolves to the `latest` dist-tag and can silently downgrade to an older line — pin the exact version;
- `rollup-0.1.2.md` **R-08**（三个 install-channel 坑：mirror lag / pnpm 11 supply-chain / peer-floor prerelease 语义）与 dist-tag 事实：裸名安装落到 `latest`，子包 `latest` 长期停在旧线，安装须显式版本或 `alpha` tag；
- `precision-checklist.md` 钉版本规则：**prereleases route to the prerelease dist-tag, never latest**；
- `v0.1.2-alpha.5.md` “npm channels”（实测 2026-09-03）与本 fixture 的 dist-tags 列表一致：`alpha` = 0.1.2-alpha.5，`latest` = 0.1.1-rc.2（umbrella 包）。

**Repair / residual risk:** the machine now carries 0.1.1-rc.2; repair is the pinned formal install in §3 (never hand-copy package directories or hand-write shims). Direction reassurance: **DSH-0.1.2-A5-03**（rc.2/alpha.3 时代的 home 在 alpha.4 拒启/丢会话标题的宿主修复；alpha.5 能读三代 `session_projcache`）+ **DSH-0.1.2-A5-01**（`DomainSpec.compatibleVersions` 读容忍）+ **DSH-0.1.2-A5-02**（`invalidRecords: 'backup-and-skip'` 抢救坏记录）说明回到 alpha.5 是受支持方向。Residual: 在 rc.2 上期间写入的状态按 0.1.1 线语义落盘，升级后要验证 boot、会话标题与六个插件挂载。

## 3. Exact safe upgrade commands (Windows, want 0.1.2-alpha.5 + TUI plugin)

```powershell
# 0) Save all session work first. Inventory what is running:
tasklist /FI "IMAGENAME eq node.exe"
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Select-Object ProcessId, CommandLine

# 1) FULLY STOP the host (a browser refresh / closing tabs does NOT do this):
#    - focus the console running `dsh web` and press Ctrl+C (or close that console);
#    - stop any remaining dsh / agent-session worker node.exe, e.g.
taskkill /PID <dsh-host-pid> /T
#    - re-run the tasklist and confirm NO dsh-owned node.exe remains (the old 42432/23768 equivalents are gone).

# 2) From an EXTERNAL terminal (never from inside a dsh session), PINNED host install:
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5

# 3) TUI plugin — pin it too (the evidence pack carries no dist-tags for it; check first):
npm view @deepseek-harness-tui/dsh-tui dist-tags
npm view @deepseek-harness-tui/dsh-tui versions
npm view @deepseek-harness-tui/dsh-tui@<candidate> peerDependencies   # must admit the 0.1.2-alpha.5 corridor
npm install -g @deepseek-harness-tui/dsh-tui@<exact-version>

#    Or both in one command — every package explicitly pinned:
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @deepseek-harness-tui/dsh-tui@<exact-version>

# 4) Verify, then restart:
dsh --version        # MUST print 0.1.2-alpha.5 (fresh shell). Anything else = stop and re-check the spec you typed.
dsh web              # restart host
# hard-refresh the browser (Ctrl+Shift+R); verify the six community plugins + TUI are mounted.
# If a plugin fails to register right after an in-place npm upgrade, restart the host once
# (roster/combo self-heal pattern, DSH-0.1.5-A1-20 — heuristic, not a fix).
```

**Rollback** (if alpha.5 misbehaves): same procedure with `npm install -g @deepseek-ai/dsh@0.1.2-alpha.4` (last verified version). Never repair by hand-copying package dirs or hand-writing shims; an interrupted install is repaired by re-running the pinned formal install from an external shell.

**Notes**
- Everything in steps 2–3 runs from a plain PowerShell/CMD window — **not** from inside any dsh session on that host.
- Exact pins, not tags: dist-tags move between measurements (R-08 mirror lag); `@alpha` is acceptable only when you explicitly want the moving channel and re-verify afterwards.
- Keep host and plugin versions coherent: install the TUI plugin at a version whose peer/compatibility range admits `0.1.2-alpha.5` (check its `peerDependencies` / README corridor before pinning).

## 4. Prevention — what plugin README authors must change

1. **Never ship a bare `@deepseek-ai/dsh` in a combined install command.** Pin the exact host version your corridor targets: `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5`. Add an explicit warning: *a bare package name follows the `latest` dist-tag and can silently DOWNGRADE users on a prerelease line*.
2. **Do not bundle the host upgrade into the plugin's one-liner.** Split the README into “Install the plugin” and “Host upgrade (stop the host first)” sections; state that a global host upgrade must never be run from inside a running dsh session.
3. **Put the stop-the-host step first and say what does NOT work:** browser refresh, hard refresh, closing tabs/windows do not release Windows native-module locks (`koffi.node` EBUSY); only fully stopping the `dsh web` host and its worker processes does.
4. **Pin your own plugin's version too** (`@x.y.z`), and state the compatible host corridor / peer range next to the command.
5. **Publish prerelease-corridor releases under a prerelease dist-tag** (e.g. `alpha`) and keep `latest` on the stable-host line (precision-checklist rule; rollup R-08 release-channel discipline) — so bare-name users of *your* package cannot be yanked onto an incompatible line either.
6. **Add the verify line to the README** (`dsh --version` must print X, plugin version must be Y) so a downgrade is caught at install time, and keep every snippet in sync with a fresh `npm view <pkg> dist-tags` at release time (tags move; mirror lag is a listed pitfall).

---

## run-stats

- toolcalls 总数: 17（底层工具调用：read 7 · grep 4 · glob 1 · write 4 · send_message 1）
- token 用量: n/a（本次运行未暴露计量）
- 完成时间: 2026-10-21 14:55:55 +08:00[Asia/Shanghai]


#### FILE: report.md

# S12 · Global Upgrade EBUSY + Downgrade Trap — Root-Cause Report

- Task: S12-global-upgrade-ebusy-trap (read-only diagnosis; no install/migration executed)
- Skill applied: `plugin-upgrade` (Mode A · inspect, read-only) — references cited by ID/要点 only
- Evidence: `fixture/attempt1-ebusy.log`, `fixture/attempt2-downgrade.log`, `fixture/npm-dist-tags.txt`, `fixture/running-processes.txt` (read-only, unchanged)
- Completed: 本报告（诊断 + 安全升级流程 + README 防坑指南） · Skipped: 一切安装/迁移动作（题面禁止执行） · Rollback: 见 §3

---

## 1. Attempt 1 root cause — EBUSY on `koffi.node`

**Diagnosis (from the evidence, not guesswork):**

- `attempt1-ebusy.log` shows `npm error code EBUSY / syscall copyfile / path ...\@koromix\koffi-win32-x64\win32_x64\koffi.node / dest ...\@deepseek-ai\.dsh-TMPDIR\...\koffi.node`: npm's global install stages the new tree into `.dsh-TMPDIR` and copyfiles it into place; the copy of the native binary is what fails.
- `running-processes.txt` pins the holder: **node.exe PID 42432 = the running `dsh web` host**, which loaded `@koromix/koffi` (a native FFI addon used for sandbox/filesystem operations) at startup. node.exe 23768 is an agent-session worker of the same installation; 23920 is the npm install itself. Nothing else could hold that file.

**Why the lock exists:** on Windows, a loaded `.node` native binary is mapped into the loading process and the OS keeps a file lock on it **until that process exits**. npm cannot copy/replace a locked binary → EBUSY. This is an OS-level fact, not an npm bug.

**Why a browser-page refresh does NOT free it:** the lock lives in the **host process**, not in the browser. The browser page is only the Web Client SPA talking to `dsh web` over a WebSocket; F5 / hard refresh / closing the tab or even the whole browser window merely reloads or drops the client — the `dsh web` host (and its loaded `koffi.node`) stays alive and keeps the lock. What releases it: **fully ending the host process tree** (the `dsh web` console + any dsh agent-session worker node.exe it spawned). (Same finding is on record in the skill's troubleshooting 症状表, EBUSY 行: 关掉浏览器标签也不释放，文件锁在宿主不在浏览器 — benchmark 任务 S12 · precision-checklist 钉版本规则.)

**Extra trap (skill: “Global DSH host upgrades (agent discipline)”):** never run `npm install -g @deepseek-ai/dsh@…` from *inside* a dsh session on that host — the session IS the host; npm rips out the very package tree the host executes from, the host dies mid-install, and an interrupted install leaves package content without regenerated shims (the `dsh` command itself disappears until an external pinned re-install repairs it). A crash during the upgrade is a signature of doing it wrong.

**Correct stop-then-upgrade sequence:** save work → fully stop every dsh process (Ctrl+C/close the `dsh web` console; kill remaining dsh node.exe workers) → verify with `tasklist /FI "IMAGENAME eq node.exe"` that the host/worker PIDs are gone → run the **pinned** install from an **external** terminal → restart `dsh web` → hard-refresh browser → verify version + plugin roster. Full commands in §3.

## 2. Attempt 2 root cause — silent downgrade to `0.1.1-rc.2`

**What the unpinned spec resolves to:** the README's combined command is
`npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui`.
A **bare package name with no version/tag is resolved by npm as `pkg@latest`** — i.e. it follows the **`latest` dist-tag**. Per `npm-dist-tags.txt` at that moment:

| dist-tag | version |
|---|---|
| `latest` | **0.1.1-rc.2** |
| `next`   | 0.1.1-rc.2 |
| `alpha`  | 0.1.2-alpha.5 |

So the command installed `0.1.1-rc.2` — and `npm install -g <bare name>` **replaces the globally installed version with exactly what it resolved**, it does not mean “keep current” or “advance within a range”. Your installed `0.1.2-alpha.4` was overwritten by `0.1.1-rc.2`, so `dsh --version` printed `0.1.1-rc.2`. Because `latest` (0.1.1-rc.2) is *lower* than the installed 0.1.2-alpha.4, the net effect is a **silent downgrade to the older 0.1.1 stable-RC line**.

**Why `latest` is not your wanted version:** `0.1.2-alpha.5` is a prerelease published only on the **`alpha`** dist-tag; `latest` deliberately stays on the stable line. Any bare install can therefore never reach alpha.5 — it follows `latest`. (Governing tag = `latest`; `next` happened to hold the same version at that instant, which is coincidence.)

**The same latent trap applies to the second package:** bare `@deepseek-harness-tui/dsh-tui` follows *its own* `latest`, whatever line that is — likely the stable-host line.

**Reference record (要点 + ID only):**
- skill `plugin-upgrade` · “Global DSH host upgrades” step 2: a bare package name resolves to the `latest` dist-tag and can silently downgrade to an older line — pin the exact version;
- `rollup-0.1.2.md` **R-08**（三个 install-channel 坑：mirror lag / pnpm 11 supply-chain / peer-floor prerelease 语义）与 dist-tag 事实：裸名安装落到 `latest`，子包 `latest` 长期停在旧线，安装须显式版本或 `alpha` tag；
- `precision-checklist.md` 钉版本规则：**prereleases route to the prerelease dist-tag, never latest**；
- `v0.1.2-alpha.5.md` “npm channels”（实测 2026-09-03）与本 fixture 的 dist-tags 列表一致：`alpha` = 0.1.2-alpha.5，`latest` = 0.1.1-rc.2（umbrella 包）。

**Repair / residual risk:** the machine now carries 0.1.1-rc.2; repair is the pinned formal install in §3 (never hand-copy package directories or hand-write shims). Direction reassurance: **DSH-0.1.2-A5-03**（rc.2/alpha.3 时代的 home 在 alpha.4 拒启/丢会话标题的宿主修复；alpha.5 能读三代 `session_projcache`）+ **DSH-0.1.2-A5-01**（`DomainSpec.compatibleVersions` 读容忍）+ **DSH-0.1.2-A5-02**（`invalidRecords: 'backup-and-skip'` 抢救坏记录）说明回到 alpha.5 是受支持方向。Residual: 在 rc.2 上期间写入的状态按 0.1.1 线语义落盘，升级后要验证 boot、会话标题与六个插件挂载。

## 3. Exact safe upgrade commands (Windows, want 0.1.2-alpha.5 + TUI plugin)

```powershell
# 0) Save all session work first. Inventory what is running:
tasklist /FI "IMAGENAME eq node.exe"
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Select-Object ProcessId, CommandLine

# 1) FULLY STOP the host (a browser refresh / closing tabs does NOT do this):
#    - focus the console running `dsh web` and press Ctrl+C (or close that console);
#    - stop any remaining dsh / agent-session worker node.exe, e.g.
taskkill /PID <dsh-host-pid> /T
#    - re-run the tasklist and confirm NO dsh-owned node.exe remains (the old 42432/23768 equivalents are gone).

# 2) From an EXTERNAL terminal (never from inside a dsh session), PINNED host install:
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5

# 3) TUI plugin — pin it too (the evidence pack carries no dist-tags for it; check first):
npm view @deepseek-harness-tui/dsh-tui dist-tags
npm view @deepseek-harness-tui/dsh-tui versions
npm view @deepseek-harness-tui/dsh-tui@<candidate> peerDependencies   # must admit the 0.1.2-alpha.5 corridor
npm install -g @deepseek-harness-tui/dsh-tui@<exact-version>

#    Or both in one command — every package explicitly pinned:
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @deepseek-harness-tui/dsh-tui@<exact-version>

# 4) Verify, then restart:
dsh --version        # MUST print 0.1.2-alpha.5 (fresh shell). Anything else = stop and re-check the spec you typed.
dsh web              # restart host
# hard-refresh the browser (Ctrl+Shift+R); verify the six community plugins + TUI are mounted.
# If a plugin fails to register right after an in-place npm upgrade, restart the host once
# (roster/combo self-heal pattern, DSH-0.1.5-A1-20 — heuristic, not a fix).
```

**Rollback** (if alpha.5 misbehaves): same procedure with `npm install -g @deepseek-ai/dsh@0.1.2-alpha.4` (last verified version). Never repair by hand-copying package dirs or hand-writing shims; an interrupted install is repaired by re-running the pinned formal install from an external shell.

**Notes**
- Everything in steps 2–3 runs from a plain PowerShell/CMD window — **not** from inside any dsh session on that host.
- Exact pins, not tags: dist-tags move between measurements (R-08 mirror lag); `@alpha` is acceptable only when you explicitly want the moving channel and re-verify afterwards.
- Keep host and plugin versions coherent: install the TUI plugin at a version whose peer/compatibility range admits `0.1.2-alpha.5` (check its `peerDependencies` / README corridor before pinning).

## 4. Prevention — what plugin README authors must change

1. **Never ship a bare `@deepseek-ai/dsh` in a combined install command.** Pin the exact host version your corridor targets: `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5`. Add an explicit warning: *a bare package name follows the `latest` dist-tag and can silently DOWNGRADE users on a prerelease line*.
2. **Do not bundle the host upgrade into the plugin's one-liner.** Split the README into “Install the plugin” and “Host upgrade (stop the host first)” sections; state that a global host upgrade must never be run from inside a running dsh session.
3. **Put the stop-the-host step first and say what does NOT work:** browser refresh, hard refresh, closing tabs/windows do not release Windows native-module locks (`koffi.node` EBUSY); only fully stopping the `dsh web` host and its worker processes does.
4. **Pin your own plugin's version too** (`@x.y.z`), and state the compatible host corridor / peer range next to the command.
5. **Publish prerelease-corridor releases under a prerelease dist-tag** (e.g. `alpha`) and keep `latest` on the stable-host line (precision-checklist rule; rollup R-08 release-channel discipline) — so bare-name users of *your* package cannot be yanked onto an incompatible line either.
6. **Add the verify line to the README** (`dsh --version` must print X, plugin version must be Y) so a downgrade is caught at install time, and keep every snippet in sync with a fresh `npm view <pkg> dist-tags` at release time (tags move; mirror lag is a listed pitfall).

---

## run-stats

- toolcalls 总数: 17（底层工具调用：read 7 · grep 4 · glob 1 · write 4 · send_message 1）
- token 用量: n/a（本次运行未暴露计量）
- 完成时间: 2026-10-21 14:55:55 +08:00[Asia/Shanghai]


#### FILE: tool-transcript.txt

1. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\SKILL.md（全文）
2. glob pattern **/* path ...\S12-global-upgrade-ebusy-trap（列 fixture/agent-output 内容）
3. read ...\fixture\README.md
4. read ...\fixture\attempt1-ebusy.log
5. read ...\fixture\attempt2-downgrade.log
6. read ...\fixture\npm-dist-tags.txt
7. read ...\fixture\running-processes.txt
8. grep pattern "dist-tag|latest|host-self|EBUSY|koffi|downgrade|unpinned|global" path ...\skills\plugin-upgrade\references
9. read ...\skills\plugin-upgrade\references\precision-checklist.md offset=190 limit=30
10. grep pattern "host-self|Host-self|install-channel|pitfall" path ...\skills\plugin-upgrade\references\rollup-0.1.2.md
11. grep pattern "R-0[0-9] ·|safety boundary" path ...\skills\plugin-upgrade\references\rollup-0.1.2.md
12. grep pattern "^### DSH-|^## DSH-|^- DSH-" path ...\skills\plugin-upgrade\references\v0.1.2-alpha.5.md
13. write ...\agent-output\report.md（主报告，含 run-stats）
14. write ...\agent-output\S12-global-upgrade-ebusy-trap\report.md（同内容副本，兼容题面路径写法）
15. write ...\agent-output\tool-transcript.txt（本文件）
16. write ...\agent-output\transcript-manifest.txt
17. send_message agent_id=session-5d3ebe0e-127d-4dc4-a3b9-cb2199b04f8e（回传结论摘要）


#### FILE: transcript-manifest.txt

R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\SKILL.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S12-global-upgrade-ebusy-trap\fixture
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S12-global-upgrade-ebusy-trap\fixture\README.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S12-global-upgrade-ebusy-trap\fixture\attempt1-ebusy.log
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S12-global-upgrade-ebusy-trap\fixture\attempt2-downgrade.log
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S12-global-upgrade-ebusy-trap\fixture\npm-dist-tags.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S12-global-upgrade-ebusy-trap\fixture\running-processes.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\precision-checklist.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\rollup-0.1.2.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\v0.1.2-alpha.5.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S12-global-upgrade-ebusy-trap\agent-output\report.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S12-global-upgrade-ebusy-trap\agent-output\S12-global-upgrade-ebusy-trap\report.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S12-global-upgrade-ebusy-trap\agent-output\tool-transcript.txt
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S12-global-upgrade-ebusy-trap\agent-output\transcript-manifest.txt


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.