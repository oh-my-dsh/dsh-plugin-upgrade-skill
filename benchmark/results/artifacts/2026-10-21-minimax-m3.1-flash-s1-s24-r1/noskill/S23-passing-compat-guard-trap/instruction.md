# S23 · The Compat Guard That Passed (Read-Only)

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be
no follow-up user messages. This task brief is itself the user's explicit authorization and
confirmation for the approach and execution needed to complete the necessary analysis and
planning on your own, and keep executing as soon as the plan is formed — do not pause to
wait for "confirmation", and do not ask the user follow-up questions. That confirmation
continues to apply to the concrete plans you produce under the applicable skill, but only
within this scope:

- You may inspect `/app/fixture/`, in-container local documentation, and local tools read-only; `/app/fixture/` must remain completely unchanged; you may write your report into the designated `/app/agent-output/` directory as the brief specifies;
- You may create temporary files needed for the report and run read-only local scan commands, but you must not execute migrations or installations;
- You must not modify the skill, the evaluator, or the reference answers, and you must not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

## Scenario

A maintainer upgrades dsh in place (npm global, 0.1.6-alpha.1 → 0.1.6-alpha.2) on a
Windows web profile with six external client plugins. After the upgrade + restart, one
plugin — a composer input-recall helper (Ctrl+Up / Ctrl+Down history) — silently stops
responding: no error, no warning, no compatibility banner, and its own four-check
compatibility guard reports the host as compatible. Every other plugin works. The
maintainer has attached the plugin's client entry source, the session-controller type
excerpts from both host versions, a new-service type excerpt that ships in alpha.2, the
release-notes/boot-log excerpt, and their already-tried list.

The evidence pack is under `/app/fixture/` (read-only — do not modify it):
`symptom-report.md`, `plugin/src-client-index.ts`,
`host-types/session-list-alpha1.d.ts`, `host-types/session-list-alpha2.d.ts`,
`host-types/ui-session-service-alpha2.d.ts`, `upgrade-notes.txt`, `README.md`.

**Your report** (write to `/app/agent-output/S23-passing-compat-guard-trap/`, any
filename):

1. **Silent-failure attribution**: walk the plugin's per-keystroke resolution path and
   identify the exact read that now fails. Explain why nothing surfaces anywhere: why the
   compat guard passes, why there is no console error, and why the failure mode is a
   silent no-op rather than a thrown exception. Which earlier suspicion from the
   already-tried list does this reading settle, and which does it not address?
2. **Evidence mapping**: from the two session-controller type excerpts, state precisely
   what changed about the snapshot the plugin reads, and what that implies about the
   value the plugin now receives on every keystroke. From the new-service excerpt,
   identify the canonical replacement read: name the service, the observable it exposes,
   and the shape of the value it yields — including the field that replaces
   `sessions.scope(id)` for session-scoped service resolution.
3. **Migration recipe**: write the concrete corrected resolution function (fenced code)
   that works on BOTH hosts — alpha.2 through the new service and alpha.1 through the
   legacy field — from one build. State what must change in the plugin's `inject`
   declaration and how the session-scoped context reaches the conversation service.
4. **Guard hardening**: the shipped guard checks four service members and passes. Explain
   the class of breakage such presence-checks cannot catch, and specify a hardened guard:
   what it should probe instead of service presence, and at what point in the lifecycle
   the probe must run to catch this failure mode.
5. **Verification and prevention**: how would you verify the fix on both hosts without a
   full migration, and what single host-side change (in the service or its types) would
   have turned this silent removal into a loud failure at plugin activation?

What is tested: attributing a silent field-level removal behind passing service-level
guards, deriving a migration from sealed type evidence, writing dual-host fallback code,
and hardening activation guards against field-level breaks.
