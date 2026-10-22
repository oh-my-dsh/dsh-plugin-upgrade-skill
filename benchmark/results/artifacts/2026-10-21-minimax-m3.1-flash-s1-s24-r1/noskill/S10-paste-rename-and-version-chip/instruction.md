# S10 · Paste Renaming & Version-Chip Follow-Ups (Read-Only)

## Unattended Evaluation Authorization (BENCHMARK-AUTH-v1)

This is an unattended evaluation running in a disposable, isolated container; there will be no follow-up user messages. This task brief is itself the user's explicit authorization and confirmation for the approach and execution needed to complete the task: complete the necessary analysis and planning on your own, and keep executing as soon as the plan is formed — do not pause to wait for "confirmation", and do not ask the user follow-up questions. That confirmation continues to apply to the concrete plans you produce under the applicable skill, but only within the following scope:

- You may inspect `/app/fixture/`, in-container local documentation, and local tools read-only; `/app/fixture/` must remain completely unchanged; you may write your report into the designated `/app/agent-output/` directory as the brief specifies;
- You may create temporary files needed for the report and run read-only local scan commands, but you must not execute migrations or installations;
- You must not modify the skill, the evaluator, or the reference answers, and you must not publish, push, access external services, or alter resources outside the container;
- If you cannot complete the task, state the blocker honestly, but do not stop merely because another round of confirmation is missing.

I maintain the community Web plugin `@org/dsh-attach-input` (clipboard files → composer
attachments, lib-only bundle with no build step). Right after shipping v0.2.10 I collected
two follow-ups in the issue tracker; the evidence pack in `/app/fixture/` (read-only — do
not modify it) has my current client-code excerpts (attachment flow, dock rendering, the
self-update version chip) plus the user threads and one captured HTTP response.

**Follow-up A — pasted files need unified renaming.** Users paste several screenshots in a
row; the browser hands every one of them the same clipboard file name
(`image.png`). They ask for a unified scheme: pasted **images** should land as
`paste_image.png`, `paste_image(2).png`, `paste_image(3).png`…, other pasted files as
`paste_file.<ext>` with the same numbering — while files added by **drag-and-drop or the
file/folder picker must keep their real names**. My current `add()` has no renaming at
all, and my only collision logic is an in-batch duplicate check.

**Follow-up B — the version chip lied to a user.** Minutes after I pushed tag `v0.2.11`,
a user running v0.2.10 hard-refreshed and the green chip said "already the latest version
**v0.2.9**". They had NOT updated yet; nothing told them v0.2.11 existed.

**Your report** (write to `/app/agent-output/S10-paste-rename-and-version-chip/`, any filename):

1. The renaming design: the exact naming scheme, where in the flow the rename must be
   applied (and which paths must stay untouched), how the number is chosen, and what the
   authoritative "names already taken" source should be — say why a plugin-side records
   cache alone is the wrong source (my records Map has a subscription that retires entries
   whenever a snapshot momentarily shows no occurrences);
2. The extension rule (original name vs MIME fallback) and what the dock chip and the
   uploaded path must each display;
3. Follow-up B's root cause: why the chip showed an OLDER tag as "latest" minutes after a
   push, and the display rule the chip should follow instead (which two values compare,
   which one is shown);
4. The regression tests that would have caught both follow-ups before release;
5. The lib-only release hygiene items this touches (hand-inlined version constants, bundle
   syntax check, how users actually receive the update given this plugin has no host-side
   update endpoint).

What is tested: choosing the authoritative conflict source over a fragile cache, scoping a
behavior change to one acquisition path, and not trusting a cached remote value as ground
truth next to a locally-known running version. Report items 1, 3, 4, 5 are scored; item 2
(the exact extension/MIME fallback and what the dock chip and upload path each show) is
guidance for completeness and is not scored.
