# S12 · Global Upgrade EBUSY + Downgrade Trap (Read-Only)

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be no follow-up user messages. This task brief is itself the user's explicit authorization and confirmation for the approach and execution needed to complete the task: complete the necessary analysis and planning on your own, and keep executing as soon as the plan is formed — do not pause to wait for "confirmation", and do not ask the user follow-up questions. That confirmation continues to apply to the concrete plans you produce under the applicable skill, but only within the following scope:

- You may inspect `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r2\skill\S12-global-upgrade-ebusy-trap\fixture\`, in-container local documentation, and local tools read-only; `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r2\skill\S12-global-upgrade-ebusy-trap\fixture\` must remain completely unchanged; you may write your report into the designated `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r2\skill\S12-global-upgrade-ebusy-trap\agent-output\` directory as the brief specifies;
- You may create temporary files needed for the report and run read-only local scan commands, but you must not execute migrations or installations;
- You must not modify the skill, the evaluator, or the reference answers, and you must not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

I maintain a DSH installation on Windows with six community Web plugins installed across three GitHub mirrors.
The currently running dsh is `0.1.2-alpha.4`. A new release `dsh-v0.1.2-alpha.5` just dropped and I want to
upgrade. My attempt fails — twice, in different ways. The evidence pack in `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r2\skill\S12-global-upgrade-ebusy-trap\fixture\` (read-only — do not
modify) contains my terminal session captures and the npm dist-tags listing.

**What I did and saw:**

1. **Attempt 1 (install while dsh is running)**: `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5` fails with
   EBUSY while copying `koffi.node` — full output in `attempt1-ebusy.log`. What else was running at the time is
   in `running-processes.txt`.

2. **Attempt 2 (after stopping dsh, but using the official combined command from a plugin README)**: the
   combined install goes through fine, but `dsh --version` afterwards prints `0.1.1-rc.2` — NOT the alpha.5 I
   wanted! Full session in `attempt2-downgrade.log`; the registry state at the time is in `npm-dist-tags.txt`.

**Your report** (write to `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r2\skill\S12-global-upgrade-ebusy-trap\agent-output\S12-global-upgrade-ebusy-trap\`, any filename):

1. Attempt 1 root cause: WHY is `koffi.node` locked — what is holding it, and why does a browser-page refresh
   not free the lock? What is the correct stop-then-upgrade sequence?
2. Attempt 2 root cause: WHY did `dsh --version` show rc.2 instead of alpha.5 — what does the unpinned
   `@deepseek-ai/dsh` in the combined command resolve to, and WHY? What npm dist-tag does it follow?
3. The exact safe upgrade commands for my situation (I want alpha.5, and I also want the TUI plugin).
4. Prevention: what should plugin README authors do differently with their install commands so this trap
   cannot catch their users.

What is tested: diagnosing an OS-level install failure from the evidence (who holds the file, and what does
and does not release it) rather than guessing, tracing what an unpinned global install actually resolves to at
the registry instead of assuming it preserves or advances the installed version, and turning both diagnoses
into a safe ordered upgrade procedure plus preventive guidance for README authors.


WORKSPACE BOUNDARY (hard rule — you are running inside a benchmark harness):
The ONLY paths you may read, list, glob, grep, or open are:
  1. E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r2\skill\S12-global-upgrade-ebusy-trap\fixture\        (your task evidence)
  2. E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r2\skill\S12-global-upgrade-ebusy-trap\agent-output\   (write your report here)
  3. E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\ (read-only skill reference)
Every other path is FORBIDDEN — including but not limited to: the repository
root and any file there (README, docs, drafts), the benchmark/ directory
tree, solution/ and tests/ subdirectories, .dsh/, node_modules/, system
temporary directories (the Windows TEMP / %TEMP% / AppData\Local\Temp
directories), and anything outside the paths listed above. You MUST NOT
write to ANY path outside your own cell directory — not even a temporary
or scratch file. If you need a temporary script, write it inside
E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r2\skill\S12-global-upgrade-ebusy-trap\agent-output\S12-global-upgrade-ebusy-trap\ and delete it when you are done.
Do not list, glob, or open any parent or sibling directory even "just to
look". If something you need is missing from your allowed paths, state
that in your report instead of searching elsewhere.

You may additionally consult the plugin-upgrade skill (read-only) at `E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\`. You must not read the task's `solution/` or `tests/` directories.
