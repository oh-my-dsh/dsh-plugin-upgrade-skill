# S22 路 The Duplicate Insert That Crashed the Boot (Read-Only)

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be
no follow-up user messages. This task brief is itself the user's explicit authorization and
confirmation for the approach and execution needed to complete the task: complete the
necessary analysis and planning on your own, and keep executing as soon as the plan is
formed 鈥?do not pause to wait for "confirmation", and do not ask the user follow-up
questions. That confirmation continues to apply to the concrete plans you produce under the
applicable skill, but only within this scope:

- You may inspect `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-04-fledge-alpha-s1-s24-r1\skill\S22-duplicate-insert-boot-crash-trap\fixture\`, in-container local documentation, and local tools read-only; `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-04-fledge-alpha-s1-s24-r1\skill\S22-duplicate-insert-boot-crash-trap\fixture\` must remain completely unchanged; you may write your report into the designated `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-04-fledge-alpha-s1-s24-r1\skill\S22-duplicate-insert-boot-crash-trap\agent-output\` directory as the brief specifies;
- You may create temporary files needed for the report and run read-only local scan commands, but you must not execute migrations or installations;
- You must not modify the skill, the evaluator, or the reference answers, and you must not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

## Scenario

A maintainer upgrades dsh to 0.1.5-alpha.2 on a Windows profile created under 0.1.2/0.1.3.
After the upgrade, the right-Sidebar document tab opens but its content read fails
(鏂囦欢璧勬簮鏈嶅姟涓嶅彲鐢?. The maintainer assumes the workspace-files host service is missing
from the profile composition and manually adds an insert row to the profile's
`cordis.patch.yml`. The next `dsh web` boot crashes immediately with:

```
Error: dsh: plugin tree failed to load: failed to apply loader entry include (cordis:include):
duplicate loader entry id: workspace-files
```

The evidence pack is under `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-04-fledge-alpha-s1-s24-r1\skill\S22-duplicate-insert-boot-crash-trap\fixture\` (read-only 鈥?do not modify it):
`boot-crash-log.txt` (the full crash output), `profile-patch-excerpt.txt` (the profile's
cordis.patch.yml with the manual insert), `web-app-patch-excerpt.txt` (the web-app bundle's
cordis.patch.yml showing the workspace-files row), and `README.md`.

**Your report** (write to `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-04-fledge-alpha-s1-s24-r1\skill\S22-duplicate-insert-boot-crash-trap\agent-output\S22-duplicate-insert-boot-crash-trap\`, any
filename):

1. **Root cause**: from the crash log and the two patch excerpts, which two declarations
   collide, and at which Cordis layer is the collision detected? Why does the loader
   refuse the whole boot here instead of accepting the later row?
2. **Layering rules**: for a profile patch acting on a bundle-provided plugin, which
   operations are safe and which one is fatal 鈥?changing the plugin's config by id,
   adding a row for an id no bundle ships, or adding a row for an id a bundle already
   ships? Which case is the maintainer's action, and which evidence row proves it?
3. **Fix**: what exactly should the maintainer change, and in which file? State whether
   the plugin's own code is at fault, and whether any plugin-side change could resolve
   the boot failure.
4. **Prevention**: before adding such a row by hand, what should the maintainer look at
   in the installed bundle, and what could the host print at boot to make this failure
   actionable (whom to blame, what to delete)?

What is tested: reading a loader crash against profile and bundle patch evidence,
choosing the safe layering operation, prescribing the minimal correct change, and
turning the incident into author- and host-side prevention.

You may read files ONLY under this cell directory: E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-04-fledge-alpha-s1-s24-r1\skill\S22-duplicate-insert-boot-crash-trap. The task materials inside it are complete for the required analysis. If you feel external documentation is needed, state that as a limitation in your report 鈥?do not search for it. Do not read, list, or search anything outside this cell directory, anywhere on this machine. You may additionally read (only) E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\ 鈥?nothing else outside the cell.
