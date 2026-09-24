# S21 · The Resource Service That "Unavailable" (Read-Only)

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

## Scenario

A maintainer upgrades dsh in place (npm global, 0.1.5-alpha.1 → 0.1.5-alpha.2) on a
Windows profile created under 0.1.2/0.1.3 with six external client plugins junction-linked.
After the upgrade + restart:

- Clicking a chat file link whose address is OUTSIDE the session workspace throws
  `sidebarRight: no registered tab type claims "dsh-resource://file/absolute/…"`.
- The assistant then writes a test file INSIDE the session workspace; clicking THAT link
  opens a right-Sidebar tab titled correctly — but the tab's content shows only
  「文件资源服务不可用。」
- F12 Console: no red errors from the sidebar or the resource system; the only plugin
  warnings are `dsh-paste-input: fold skipped (parse failed)` repeats.
- A per-module probe of all 62 manifest combo entries: 62/62 HTTP 200. A naive all-in-one
  join of all 62 modules into one URL: 404.

The evidence pack is under `/app/fixture/` (read-only — do not modify it):
`symptom-log.txt`, `boot-manifest-excerpt.txt`, `combo-probe.txt`, `contrast-probe.txt`,
`console-excerpt.txt`, `discussion-excerpt.txt`, `README.md`.

**Your report** (write to `/app/agent-output/S21-resource-service-unavailable-trap/`, any
filename):

1. **Attribution**: the tab renders a title but no content. From the symptom log and the
   contrast probe, which layer actually fails, and what do the two readers of the same
   file rule in and rule out? What does the metadata status observed in the failing tab
   say about where the read stalls?
2. **Probe discipline**: the evidence contains two combo probes with opposite-looking
   results. Which one is a valid measurement of static artifact serving and which one is
   not — and why must the failing one never be cited as "modules missing"? How does the
   real loader fetch the roster instead?
3. **Distractor separation**: are the repeated `dsh-paste-input` fold warnings related to
   the content-read failure? What else in the roster changed between the two versions,
   and does that change explain the symptom?
4. **Mitigation decision**: should the plugin work around the unavailable service
   (rewrite, retry, fallback)? In what order should the maintainer act — what is the
   first cheap step, what is the escape hatch, and what goes upstream?
5. **Prevention / upstream**: what forensics does a complete upstream report need, and
   what could the host check at boot so this class of failure fails loud instead of
   rendering an empty tab?

What is tested: attributing a runtime read failure from evidence, telling valid probes
from invalid ones, keeping simultaneous unrelated bugs separate, ordering mitigations,
and packaging forensics for upstream.
