# S16 路 The Self-Host Upgrade Trap (Read-Only)

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be
no follow-up user messages. This task brief is itself the user's explicit authorization and
confirmation for the approach and execution needed to complete the task: complete the
necessary analysis and planning on your own, and keep executing as soon as the plan is
formed 鈥?do not pause to wait for "confirmation", and do not ask the user follow-up
questions. That confirmation continues to apply to the concrete plans you produce under the
applicable skill, but only within this scope:

- You may inspect `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-04-fledge-alpha-s1-s24-r1\skill\S16-self-host-upgrade-trap\fixture\`, in-container local documentation, and local tools read-only; `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-04-fledge-alpha-s1-s24-r1\skill\S16-self-host-upgrade-trap\fixture\` must remain completely unchanged; you may write your report into the designated `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-04-fledge-alpha-s1-s24-r1\skill\S16-self-host-upgrade-trap\agent-output\` directory as the brief specifies;
- You may create temporary files needed for the report and run read-only local scan commands, but you must not execute migrations or installations;
- You must not modify the skill, the evaluator, or the reference answers, and you must not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

A user asked their agent 鈥?a dsh web session running INSIDE the dsh host process on their
machine 鈥?to "update dsh to v0.1.2-rc.1". The agent checked the release notes, then ran
`npm install -g @deepseek-ai/dsh@0.1.2-rc.1` as a tool call from inside that session. The
web GUI died mid-call, the install never completed, and afterwards the `dsh` command itself
was gone. The evidence pack in `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-04-fledge-alpha-s1-s24-r1\skill\S16-self-host-upgrade-trap\fixture\` (read-only 鈥?do not modify it) has the
session log excerpt, the machine state before/after, and the external repair notes.

**Your report** (write to `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-04-fledge-alpha-s1-s24-r1\skill\S16-self-host-upgrade-trap\agent-output\S16-self-host-upgrade-trap\`, any filename):

1. The structural root cause: why running the global dsh upgrade from inside a session on
   the running host fails by construction rather than by accident 鈥?what the session and
   its tool worker are relative to the thing npm was replacing, what dies first, and why
   the tool call never returned a result;
2. The broken state afterwards: from the machine state before/after, explain why the
   `dsh` command vanished even though the package content was still present, and why
   trying to repair it by swapping or patching directories by hand would make it worse;
3. The repair: which repair the repair notes actually applied, why that form of repair
   works where the in-session attempt could not, and how the result is verified;
4. The protocol the agent should have followed instead: what the agent should have
   recognized about its own relationship to the upgrade target, whether it should execute
   the global install at all, and 鈥?if not 鈥?the exact external procedure it should hand
   the user (order matters: what must happen before npm runs, and what the install command
   must look like and why); state which parts of that procedure already follow from known
   upgrade rules and which part is new for this incident;
5. Prevention: what an agent-side guard against this class of failure would look like,
   and what the post-upgrade checklist for this machine should cover, given the
   alpha.5鈫抮c.1 findings in the repair notes.

What is tested: recognizing self-upgrade as a structural (not flaky) failure, reading the
interrupted-install signature from the evidence, choosing and justifying the correct
repair, and the agent-discipline boundary between "do it for the user" and "hand the user
a procedure you must not execute yourself".

You may read files ONLY under this cell directory: E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-04-fledge-alpha-s1-s24-r1\skill\S16-self-host-upgrade-trap. The task materials inside it are complete for the required analysis. If you feel external documentation is needed, state that as a limitation in your report 鈥?do not search for it. Do not read, list, or search anything outside this cell directory, anywhere on this machine. You may additionally read (only) E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\ 鈥?nothing else outside the cell.
