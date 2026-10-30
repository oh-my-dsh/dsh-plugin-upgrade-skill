# S20 · Windows Install Blocker: A Native Build the Runtime Never Calls

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be no follow-up user messages. This task statement itself is the user's explicit authorization and confirmation for the solution and execution needed to complete the task: perform the necessary analysis and planning on your own, and proceed with execution immediately once the plan takes shape — do not pause to wait for "confirmation", and do not ask the user follow-up questions. This confirmation continues to apply to the concrete plan you produce based on the applicable skill, but only within the following scope:

- You may read `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S20-msvc-flock-trap\fixture\`, local in-container documentation, and local tools; you may write to the designated `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S20-msvc-flock-trap\agent-output\` directory as specified by the task;
- You may create throwaway local verification profiles and temporary files, and run local tests, builds, and dsh commands;
- You may not modify the skill, the verifier, or the reference solution; you may not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

A teammate is upgrading our dsh installation on a Windows 11 machine that has **no Visual Studio Build Tools**, and the machine owner refuses to install them. `pnpm install` now fails. This is a static diagnosis task: `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S20-msvc-flock-trap\fixture\` must remain completely unchanged. Diagnose the failure from the evidence and write a fix plan to `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S20-msvc-flock-trap\agent-output\S20-msvc-flock-trap\report.md`.

The fixture holds the evidence:

- `install-error.log` — the install failure transcript;
- `manifest-excerpt.json` — the dependency declaration of the package that pulls the failing module;
- `lease-excerpt.md` — the source documentation of the write-lock acquisition, plus the failing static import;
- `win32-excerpt.ts` — the Windows lock bindings;
- `README.md` — the machine constraints and the repository's existing patch precedent for native dependencies.

The report must answer, each backed by the fixture evidence:

1. What exactly fails, and why (package, install step, missing toolchain);
2. Why `pnpm install --ignore-scripts` cannot fix this;
3. Which lock path Windows actually takes at runtime, and what that implies about the failing native module;
4. A concrete, least-invasive fix plan that does **not** install Visual Studio and does **not** modify upstream dependencies — following the repository's existing patch mechanism for native dependencies;
5. Which corridor card covers this finding (cite the full card id, e.g. `DSH-0.1.3-A1-…`).

There is only one goal: the plan must let `pnpm install` complete on that machine and the service boot, without Visual Studio and without touching upstream. Files outside `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S20-msvc-flock-trap\fixture\` (read-only) and your own `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S20-msvc-flock-trap\agent-output\` are not part of this task — leave them alone.


WORKSPACE BOUNDARY (hard rule — you are running inside a benchmark harness):
The ONLY paths you may read, list, glob, grep, or open are:
  1. E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S20-msvc-flock-trap\fixture\        (your task evidence)
  2. E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S20-msvc-flock-trap\agent-output\   (write your report here)
  3. E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\ (read-only skill reference)
Every other path is FORBIDDEN — including but not limited to: the repository
root and any file there (README, docs, drafts), the benchmark/ directory
tree, solution/ and tests/ subdirectories, .dsh/, node_modules/, system
temporary directories (the Windows TEMP / %TEMP% / AppData\Local\Temp
directories), and anything outside the paths listed above. You MUST NOT
write to ANY path outside your own cell directory — not even a temporary
or scratch file. If you need a temporary script, write it inside
E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r3\skill\S20-msvc-flock-trap\agent-output\S20-msvc-flock-trap\ and delete it when you are done.
Do not list, glob, or open any parent or sibling directory even "just to
look". If something you need is missing from your allowed paths, state
that in your report instead of searching elsewhere.

You may additionally consult the plugin-upgrade skill (read-only) at `E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\`. You must not read the task's `solution/` or `tests/` directories.
