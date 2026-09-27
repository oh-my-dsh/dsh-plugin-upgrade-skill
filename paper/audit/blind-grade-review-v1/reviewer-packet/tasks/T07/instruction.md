# S17 · The External UI Plugin Onboarding Trap (Read-Only)

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be
no follow-up user messages. This task brief is itself the user's explicit authorization and
confirmation for the approach and execution needed to complete the task: complete the
necessary analysis and planning on your own, and keep executing as soon as the plan is
formed — do not pause to wait for "confirmation", and do not ask the user follow-up
questions. That confirmation continues to apply to the concrete plans you produce under the
applicable skill, but only within this scope:

- You may inspect `/app/fixture/`, in-container local documentation, and local tools read-only; `/app/fixture/` must remain completely unchanged; you may write your report into the designated `/app/agent-output/` directory as the brief specifies;
- You may create temporary files needed for the report and run read-only local scan commands, but you must not execute migrations or installations;
- You must not modify the skill, the evaluator, or the reference answers, and you must not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

A user hand-wrote a new external web UI plugin (`@lhh010/dsh-profiles`) and installed it
the usual community way: the plugin directory linked into the web profile's
`node_modules`, plus one `insert` row in the profile's `cordis.patch.yml`. Everything
about the plugin looked ordinary — it imports React, renders a settings section, and
registers a slot. The result was a chain of three failures, captured in the evidence pack
under `/app/fixture/` (read-only — do not modify it):

1. the browser refused to load plugins AT ALL, with an error naming
   `@deepseek-ai/dsh-typert-registry` — a stock entry the user never touched;
2. after the user repackaged the plugin, a second, different error appeared at apply time
   about a slot named `settings.section`;
3. across the whole session, every plugin edit required restarting the host, and one
   restart died with EADDRINUSE until the old process tree was force-killed.

**Your report** (write to `/app/agent-output/S17-external-ui-plugin-onboarding-trap/`, any filename):

1. Failure 1 root cause: why ONE plugin's client bundle — containing a top-level ESM
   `import` — took down EVERY plugin's registration, what the host actually assembles
   from the bundles and in what form it reaches the browser, and why the error named
   `dsh-typert-registry` even though that entry is innocent;
2. Diagnosis discipline: how the culprit should have been located from the misleading
   error (what to bisect, what cheap static check flags the offending bundle), and the
   client-bundle format an external plugin must ship instead of bare ESM — what wraps
   the code, how React is obtained, and what the wrapper must export;
3. Failure 2: what `slot "settings.section" is not declared (a parent entry's children
   table must declare it)` means — who declares slots, why a bare registration of
   another entry's slot fails at apply time, the exact wrapping form the registration
   must use, and which fields a registrant may pass and which it must not;
4. Dev-loop discipline: why the client bundle combo is not rebuilt when plugin files
   change (what the host does at boot), what the correct restart procedure is, and why
   the Windows restart died with EADDRINUSE until the process tree was force-killed;
5. Prevention: what the HOST could do at startup or at combo-failure time to name the
   offending plugin instead of the first awaited entry, and what an external-plugin
   authoring template or checklist should contain so the next onboarding does not repeat
   any of the three failures.

What is tested: attributing a whole-combo client-bundle failure to the real culprit
despite a misleading error, knowing the external client-bundle packaging contract,
resolving cross-entry slot declaration ordering with the correct registration wrapper,
the boot-assembled dev loop and its Windows restart discipline, and converting the
incident into host-side and authoring-side prevention.
